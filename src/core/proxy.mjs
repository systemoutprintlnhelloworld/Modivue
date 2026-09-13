import { once } from "node:events";
import { createHash } from "node:crypto";
import { createParser } from "eventsource-parser";
import { normalizeUsage, ttftMs, estimateTokenCost } from "./metrics.js";
import { keyGroup, normalizeBaseUrl } from "./identity.mjs";
import { catalogState } from "./catalog.mjs";
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

export async function proxyStream({ request, response, upstreamUrl, baseUrl = upstreamUrl, protocol, saveSample, observedModel, canonicalModelId, agent, conditionsId, onText, onEvent }) {
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
  let status = "ok";
  let error = null;
  let upstreamError = null;
  let terminal = false;
  let streamEnded = false;
  let streaming = false;
  let sentHeaders = false;
  const wireApi = wireApiFor(upstreamUrl);
  const source = agent === "modivue-probe" ? "probe" : "observation";
  const requestConditionsId = new Headers(request.headers).get("x-modivue-conditions-id");
  const requestSecrets = ["authorization", "x-api-key", "x-goog-api-key"].flatMap((name) => {
    const value = new Headers(request.headers).get(name);
    return value ? [value, value.replace(/^Bearer\s+/i, "")] : [];
  }).filter((value) => value.length > 8);
  const redactError = (value) => requestSecrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value));
  const requestParameters = Object.fromEntries(["temperature", "top_p", "max_tokens", "max_completion_tokens", "max_output_tokens", "reasoning", "reasoning_effort", "thinking", "output_config", "service_tier", "generationConfig"].filter((key) => key in parsedBody).map((key) => [key, parsedBody[key]]));
  const measurement = { version: 2, wireApi, source,
    conditionsId: observationConditionsId(source, wireApi, requestParameters, conditionsId || requestConditionsId),
    requestParameters,
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
      if (detail && typeof detail === "object") {
        upstreamError = { type: detail.type || null, code: detail.code || null, param: detail.param || null,
          message: typeof detail.message === "string" ? redactError(detail.message).slice(0, 500) : null };
      }
      terminal = true;
      streamEnded = true;
    }
  } });
  const decoder = new TextDecoder();
  const chunks = [];
  let responseBytes = 0;
  try {
    // Verification/probe calls are short control-plane requests. A stalled
    // relay must release the serial queue promptly so later samples can retry;
    // foreground agent traffic keeps the longer timeout.
    const timeoutMs = agent === "modivue-probe" ? 45000 : 120000;
    const upstream = await fetch(upstreamUrl, { method: "POST", headers: forwardedHeaders(request), body,
      redirect: "manual", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]) });
    measurement.httpStatus = upstream.status;
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
        mergeUsage(payload.usageMetadata || payload.usage); measurement.reportedModel = payload.modelVersion || payload.model || null;
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
  const catalogModel = catalogState().models.find((item) => item.id === canonicalModelId);
  const pricing = catalogModel?.cost;
  const normalized = normalizeUsage(protocol, usage);
  const costUsd = estimateTokenCost(normalized, pricing);
  const sample = { timestamp, protocol, baseUrl: normalizeBaseUrl(baseUrl), keyGroup: keyGroup(request), agent, observedModel: model, canonicalModelId,
    ttftMs: streaming ? ttftMs(startedAt, firstContentAt) : null, ...normalizeUsage(protocol, usage), status, error, rawUsage: usage, measurement };
  sample.durationMs = measurement.durationMs;
  sample.costUsd = costUsd;
  sample.costStatus = costUsd == null ? "unknown" : "estimated";
  await saveSample(sample);
  return sample;
}
