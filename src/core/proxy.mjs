import { once } from "node:events";
import http from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";
import { createParser } from "eventsource-parser";
import { normalizeUsage, ttftMs } from "./metrics.js";
import { reportedRequestCost, reportedHeaderCost, resolveRequestCost } from "./request-cost.js";
import { getChannelPricing } from "./storage.mjs";
import { keyGroup, normalizeBaseUrl } from "./identity.mjs";
import { catalogState } from "./catalog.mjs";
import { matchModelName } from "./model-match.js";
export { keyGroup } from "./identity.mjs";

const hopByHop = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length"]);

export function forwardedHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of new Headers(request.headers)) {
    if (!hopByHop.has(name) && !name.startsWith("x-modivue-")) headers.set(name, value);
  }
  headers.set("accept-encoding", "identity");
  return headers;
}

async function readBody(request, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new Error("请求体超过 8 MiB 限制"); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

// Node fetch/undici applies a finite headers/body timeout even when no
// AbortSignal timeout is supplied.  Proof questions explicitly allow an
// unlimited request, so use the platform HTTP client for that branch.  It
// preserves streaming and still honours user/client cancellation.
function requestWithoutTimeout(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url), transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(parsed, { method: options.method, headers: Object.fromEntries(options.headers || []) }, response => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value == null) continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve({ status: response.statusCode || 502, statusText: response.statusMessage || "", ok: (response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300,
        headers, body: response });
    });
    req.once("error", reject);
    const signal = options.signal;
    const abort = () => req.destroy(Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR" }));
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      req.once("close", () => signal.removeEventListener("abort", abort));
    }
    if (options.body != null) req.write(options.body);
    req.end();
  });
}

export function contentEvent(protocol, event) {
  const text = (value) => typeof value === "string" && value.length > 0;
  if (protocol === "gemini") return event.candidates?.some(candidate => candidate.content?.parts?.some(part => !part.thought && (text(part.text) || text(part.functionCall?.name)))) || false;
  if (protocol === "anthropic") {
    if (event.type === "content_block_delta") return text(event.delta?.text) || text(event.delta?.partial_json);
    if (event.type === "content_block_start") return text(event.content_block?.text)
      || event.content_block?.type === "tool_use" && text(event.content_block.name);
    return false;
  }
  if (event.choices?.some((choice) => text(choice.delta?.content) || text(choice.delta?.refusal)
    || choice.delta?.tool_calls?.some((tool) => text(tool.function?.name) || text(tool.function?.arguments)))) return true;
  if (["response.output_text.delta", "response.refusal.delta", "response.function_call_arguments.delta"].includes(event.type)) return text(event.delta);
  if (event.type === "response.output_item.added") return event.item?.type === "function_call" && text(event.item.name);
  return event.type === "response.content_part.added" && text(event.part?.text);
}

function wireApiFor(url) {
  const path = new URL(url).pathname;
  if (path.endsWith(":streamGenerateContent")) return "generateContent";
  if (/\/responses(?:\/|$)/.test(path)) return "responses";
  if (/\/chat\/completions(?:\/|$)/.test(path)) return "chat.completions";
  if (/\/messages(?:\/|$)/.test(path)) return "messages";
  return "unknown";
}

function observationConditionsId(source, wireApi, parameters, supplied) {
  if (typeof supplied === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)) return supplied;
  const digest = createHash("sha256").update(JSON.stringify({ wireApi, parameters })).digest("hex").slice(0, 12);
  return `${source}:${wireApi}:${digest}`;
}

export async function proxyStream({ request, response, upstreamUrl, baseUrl = upstreamUrl, protocol, saveSample, observedModel, canonicalModelId, agent, conditionsId, timeoutMs = agent === "modivue-probe" ? 45000 : 120000, signal, onText, onEvent, apiKey, authHeader }) {
  if (request.method !== "POST") { response.writeHead(405, { Allow: "POST", "Content-Type": "application/json" }).end(JSON.stringify({ error: "代理只接受 POST 请求" })); return; }
  if (!upstreamUrl) { response.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: `未配置 ${protocol} 上游地址` })); return; }
  const timestamp = new Date().toISOString();
  const startedAt = performance.now();
  let body;
  try { body = await readBody(request); } catch (error) { response.writeHead(413, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message })); return; }
  let parsedBody = {};
  try { parsedBody = JSON.parse(body.toString("utf8")); } catch {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "请求体必须为 JSON" }));
    return;
  }
  const pathModel = upstreamUrl.match(/\/models\/([^/:?]+)/)?.[1];
  const model = observedModel || parsedBody.model || (pathModel ? decodeURIComponent(pathModel) : "unknown");
  const controller = new AbortController();
  const onClose = () => { if (!response.writableEnded) controller.abort(); };
  response.once?.("close", onClose);
  let firstContentAt = null;
  let usage = null;
  let apiCost = null;
  let status = "ok";
  let error = null;
  let upstreamError = null;
  let terminal = false;
  let streamEnded = false;
  let streaming = false;
  let sentHeaders = false;
  const wireApi = wireApiFor(upstreamUrl);
  const source = agent === "modivue-probe" ? "probe" : "observation";
  const outboundHeaders = forwardedHeaders(request);
  if (apiKey) {
    outboundHeaders.delete("authorization"); outboundHeaders.delete("x-api-key"); outboundHeaders.delete("x-goog-api-key");
    outboundHeaders.set(authHeader === "x-api-key" ? "x-api-key" : "authorization", authHeader === "x-api-key" ? apiKey : `Bearer ${apiKey}`);
  }
  const outgoingKeyGroup = keyGroup({ headers: outboundHeaders });
  const requestConditionsId = new Headers(request.headers).get("x-modivue-conditions-id");
  const requestSecrets = ["authorization", "x-api-key", "x-goog-api-key"].flatMap((name) => {
    return [new Headers(request.headers).get(name), outboundHeaders.get(name)]
      .filter(Boolean).flatMap(value => [value, value.replace(/^Bearer\s+/i, "")]);
  }).filter(Boolean);
  const redactError = (value) => requestSecrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value));
  const captureUpstreamError = (detail) => {
    if (typeof detail === "string") {
      upstreamError = { type: null, code: null, param: null, message: redactError(detail).slice(0, 500) };
      return;
    }
    if (detail && typeof detail === "object") {
      upstreamError = { type: detail.type || null, code: detail.code || null, param: detail.param || null,
        message: typeof detail.message === "string" ? redactError(detail.message).slice(0, 500) : null };
    }
  };
  const requestParameters = Object.fromEntries(["temperature", "top_p", "max_tokens", "max_completion_tokens", "max_output_tokens", "reasoning", "reasoning_effort", "thinking", "output_config", "service_tier", "generationConfig"].filter((key) => key in parsedBody).map((key) => [key, parsedBody[key]]));
  const measurement = { version: 2, wireApi, source,
    conditionsId: observationConditionsId(source, wireApi, requestParameters, conditionsId || requestConditionsId),
    requestParameters, timeoutMs,
    usageEvents: [] };
  const mergeUsage = (value) => {
    if (!value || typeof value !== "object") return;
    measurement.usageEvents.push(value);
    usage = { ...usage, ...value };
  };
  const parser = createParser({ maxBufferSize: 8 * 1024 * 1024, onEvent: ({ data, event: eventName }) => {
    if (data.trim() === "[DONE]") { terminal = true; streamEnded = true; return; }
    let event;
    try { event = JSON.parse(data); } catch { onEvent?.(null); return; }
    if (eventName && !event.type) event.type = eventName;
    onEvent?.(event);
    apiCost = reportedRequestCost(event) || apiCost;
    const output = protocol === "gemini" ? event.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("")
      : protocol === "anthropic" ? event.delta?.text
      : event.type === "response.output_text.delta" ? event.delta : event.choices?.[0]?.delta?.content;
    if (typeof output === "string") onText?.(output);
    if (firstContentAt === null && contentEvent(protocol, event)) {
      firstContentAt = performance.now();
      measurement.firstContentEvent = event.type || "chat.completion.delta";
    }
    mergeUsage(event.usageMetadata || event.usage || event.message?.usage || event.response?.usage);
    measurement.reportedModel ||= event.modelVersion || event.model || event.message?.model || event.response?.model || null;
    if (["message_stop", "response.completed"].includes(event.type)) { terminal = true; streamEnded = true; }
    if (event.choices?.some((choice) => choice.finish_reason != null)) terminal = true;
    if (event.candidates?.some(candidate => candidate.finishReason)) terminal = true;
    if (["error", "response.failed", "response.incomplete"].includes(event.type) || event.error) {
      status = "error";
      error = event.type || "upstream_error";
      const detail = event.error || event.response?.error || event.response?.last_error;
      captureUpstreamError(detail);
      terminal = true;
      streamEnded = true;
    }
  } });
  const decoder = new TextDecoder();
  const chunks = [];
  let responseBytes = 0;
  try {
    const destination = new URL(upstreamUrl);
    if (agent === "modivue-probe" && ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname) && destination.pathname.startsWith("/proxy/")) {
      outboundHeaders.set("x-modivue-timeout-ms", String(timeoutMs ?? 0));
    }
    const timeoutSignal = Number.isFinite(timeoutMs) && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
    const combinedSignal = AbortSignal.any([controller.signal, ...(timeoutSignal ? [timeoutSignal] : []), ...(signal ? [signal] : [])]);
    const fetchOptions = { method: "POST", headers: outboundHeaders, body, redirect: "manual", signal: combinedSignal };
    const upstream = timeoutSignal ? await fetch(upstreamUrl, fetchOptions) : await requestWithoutTimeout(upstreamUrl, fetchOptions);
    measurement.httpStatus = upstream.status;
    apiCost = reportedHeaderCost(upstream.headers) || apiCost;
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) {
      const wait = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(wait)) measurement.retryAfterMs = Math.max(0, wait);
    }
    streaming = (upstream.headers.get("content-type") || "").includes("text/event-stream");
    if (!upstream.ok) { status = "error"; error = "HTTP " + upstream.status; upstreamError = { code: `HTTP_${upstream.status}`, message: upstream.statusText || null }; }
    const headers = {};
    // Fetch decodes compressed bodies, so encoding and length cannot be forwarded.
    for (const [name, value] of upstream.headers) if (!hopByHop.has(name) && name !== "content-encoding") headers[name] = value;
    response.writeHead(upstream.status, headers);
    sentHeaders = true;
    if (upstream.body) for await (const chunk of upstream.body) {
      if (streaming) parser.feed(decoder.decode(chunk, { stream: true }));
      else {
        responseBytes += chunk.length;
        if (responseBytes <= 8 * 1024 * 1024) chunks.push(Buffer.from(chunk));
      }
      if (response.write(chunk) === false && response.once) await once(response, "drain", { signal: controller.signal });
      // Release completed SSE streams even when a relay keeps the connection open.
      if (streamEnded) break;
    }
    if (streaming) {
      parser.feed(decoder.decode());
      // Some OpenAI-compatible relays close a complete stream without [DONE].
      // A valid content event still proves the response completed enough to measure.
      if (!terminal && status === "ok" && firstContentAt === null) { status = "incomplete"; error = "incomplete_stream"; }
    } else if (responseBytes <= 8 * 1024 * 1024) {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        apiCost = reportedRequestCost(payload) || apiCost;
        mergeUsage(payload.usageMetadata || payload.usage); measurement.reportedModel = payload.modelVersion || payload.model || null;
        const detail = payload.error || payload.response?.error || payload.response?.last_error;
        if (detail) {
          status = "error";
          captureUpstreamError(detail);
          error = upstreamError?.code || upstreamError?.type || error || "upstream_error";
        }
        const output = payload.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("") || payload.output_text || payload.choices?.[0]?.message?.content
          || (payload.content || payload.output?.flatMap((item) => item.content || []) || []).map((part) => part.text || "").join("");
        if (typeof output === "string") onText?.(output);
      }
      catch { measurement.usageStatus = "invalid_json"; }
    }
    response.end();
  } catch (caught) {
    status = "error";
    error = controller.signal.aborted ? "client_disconnected" : caught.name || "upstream_error";
    upstreamError = { code: caught.code || null, name: caught.name || null, message: caught.message ? redactError(caught.message).slice(0, 500) : null };
    if (!sentHeaders) response.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error }));
    else if (response.destroy) response.destroy();
    else response.end();
  } finally {
    response.off?.("close", onClose);
  }
  measurement.streaming = streaming;
  measurement.terminalSignal = terminal;
  measurement.completed = streaming ? status === "ok" && firstContentAt !== null : status === "ok";
  if (upstreamError) measurement.upstreamError = upstreamError;
  measurement.durationMs = Math.round(performance.now() - startedAt);
  measurement.ttftStatus = !streaming ? "non_streaming" : firstContentAt === null ? "no_content" : "measured";
  const catalog = catalogState().models;
  const catalogMatch = model ? matchModelName(model, catalog) : { status: "unmatched" };
  const catalogModel = catalog.find((item) => item.id === canonicalModelId)
    || (catalogMatch.status === "matched" ? catalog.find((item) => item.id === catalogMatch.model.id) : null);
  const pricing = catalogModel?.cost;
  const normalized = normalizeUsage(protocol, usage);
  const cost = resolveRequestCost({ apiCost, usage: normalized, catalogPricing: pricing,
    channelPricing: getChannelPricing({ protocol, baseUrl: normalizeBaseUrl(baseUrl), keyGroup: outgoingKeyGroup, observedModel: model }) });
  measurement.cost = cost;
  const sample = { timestamp, protocol, baseUrl: normalizeBaseUrl(baseUrl), keyGroup: outgoingKeyGroup, agent, observedModel: model, canonicalModelId,
    ttftMs: streaming ? ttftMs(startedAt, firstContentAt) : null, ...normalizeUsage(protocol, usage), status, error, rawUsage: usage, measurement };
  sample.durationMs = measurement.durationMs;
  Object.assign(sample, cost);
  await saveSample(sample);
  return sample;
}
