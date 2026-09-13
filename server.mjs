import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgentSessions, listEvents, listObservedModels, listSamples, summary, saveSample, databasePath, getSettings, updateSettings, listQualityRuns, saveQualityRun } from "./src/core/storage.mjs";
import { proxyStream } from "./src/core/proxy.mjs";
import { detectAgents, supportedAgentStatus } from "./src/core/agents.mjs";
import { agentAdapters } from "./src/core/agent-adapters.mjs";
import { listEvaluators } from "./src/core/quality.mjs";
import "./src/core/evaluator-coding.mjs";
import { meowReportDetails } from "./src/core/evaluator-meow.mjs";
import { normalizeZtestReport, ztestReportId } from "./src/core/evaluator-ztest.mjs";
import { bazaarlinkState, configureBazaarlink, startBazaarlink, stopBazaarlink, tickBazaarlink, importBazaarlinkReport } from "./src/core/evaluator-bazaarlink.mjs";
import "./src/core/evaluator-question.mjs";
import { listQuestions, saveQuestion, deleteQuestion, questionWindowSummaries } from "./src/core/storage.mjs";
import { verificationReferences } from "./src/data/question-tests.js";
import { trustedHLWYReference } from "./src/core/hlwy-reference.js";
import { probeState, probeTargets, runProbeBatch, scheduleProbes, requestTargetVerification } from "./src/core/probe.mjs";
import { syncCatalog, catalogRefreshMs } from "./src/core/catalog.mjs";
import { resolveProxyRoute, upstreamRoutes } from "./src/core/upstreams.mjs";
import { readCalibration, saveCalibration } from "./src/core/calibration.mjs";
import { collectTrustedCalibration, trustedCalibrationState, cancelTrustedCalibration } from "./src/core/trusted-calibration.mjs";
import { normalizeBaseUrl, upstreamEndpoint } from "./src/core/identity.mjs";
import { publicBaselineState, syncPublicBaselines } from "./src/core/public-baselines.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.MODIVUE_PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
async function readJsonBody(request, maxBytes = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new TypeError("请求体过大"); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new TypeError("请求体必须为 JSON"); }
}

async function trustedApiRequest(input) {
  const base = normalizeBaseUrl(input.baseUrl);
  const key = String(input.apiKey || "").trim();
  if (!key) throw new TypeError("请填写 API Key");
  const wireApi = input.wireApi || "chat";
  if (!["chat", "responses", "messages"].includes(wireApi)) throw new TypeError("请选择受支持的 API 协议");
  const headers = wireApi === "messages" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` };
  try {
    const response = await fetch(upstreamEndpoint(base, "v1/models"), { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`模型目录请求返回 HTTP ${response.status}`);
    const body = await response.json().catch(() => { throw new Error("模型目录没有返回 JSON，请检查 API 地址"); });
    if (!Array.isArray(body.data)) throw new Error("地址可达，但未返回有效模型目录；可手填模型后试采样验证推理接口");
    return [...new Set(body.data.map(item => item.id).filter(id => typeof id === "string" && id && !id.includes(key)))].sort();
  } catch (error) {
    throw new TypeError(error.name === "TimeoutError" ? "连接超时（15 秒）" : String(error.message).replaceAll(key, "[redacted]"));
  }
}

export async function handleRequest(request, response) {
  try { await routeRequest(request, response); }
  catch (error) {
    if (!response.headersSent) response.writeHead(error instanceof TypeError || error instanceof RangeError ? 400 : 500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof TypeError || error instanceof RangeError ? error.message : "本地服务处理失败" }));
    else response.destroy?.();
  }
}

async function routeRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || request.headers.origin && request.headers.origin !== url.origin) {
    response.writeHead(403).end("Forbidden"); return;
  }
  const filters = { hours: Number(url.searchParams.get("hours") || 24), model: url.searchParams.get("model") || undefined,
    canonicalModelId: url.searchParams.get("canonicalModelId") || undefined,
    baseUrl: url.searchParams.get("baseUrl") || undefined, keyGroup: url.searchParams.get("keyGroup") || undefined,
    protocol: url.searchParams.get("protocol") || undefined, since: url.searchParams.get("since") || undefined,
    reasoningEffort: url.searchParams.has("reasoningEffort") ? url.searchParams.get("reasoningEffort") || null : undefined,
    source: url.searchParams.get("source") || undefined, conditionsId: url.searchParams.get("conditionsId") || undefined };
  if (url.pathname === "/api/summary" && request.method === "GET") {
    const hours = Number(url.searchParams.get("hours") || 24);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ hours, generatedAt: new Date().toISOString(), groups: summary(filters) }));
    return;
  }
  if (url.pathname === "/api/observed-models" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ models: listObservedModels({ hours: Number(url.searchParams.get("hours") || 24) }) }));
    return;
  }
  if (url.pathname === "/api/samples" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ samples: listSamples({ ...filters, limit: Number(url.searchParams.get("limit") || 500) }) }));
    return;
  }
  if (url.pathname === "/api/samples/export" && request.method === "GET") {
    const rows = listSamples({ ...filters, limit: 5000 });
    response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": "attachment; filename=modivue-samples.jsonl", "Cache-Control": "no-store" }).end(rows.map((row) => JSON.stringify(row)).join("\n"));
    return;
  }
  if (url.pathname === "/api/agents" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ agents: await detectAgents(), supportedAgents: await supportedAgentStatus() }));
    return;
  }
  if (url.pathname === "/api/agent-sessions" && request.method === "GET") {
    const host = url.searchParams.get("host") || undefined;
    const includeEnded = url.searchParams.get("includeEnded") === "1";
    const graceMinutes = Number(url.searchParams.get("graceMinutes") || 15);
    const persisted = listAgentSessions({ host, includeEnded, graceMinutes });
    const runtime = (await detectAgents())
      .filter((agent) => agent.sessionId && (!host || agent.host === host))
      .map((agent) => ({
        sessionId: agent.sessionId, host: agent.host, parentSessionId: agent.parentSessionId || null,
        status: agent.status, model: agent.observedModel || agent.model, displayName: agent.displayName || agent.label,
        protocol: agent.protocol, baseUrl: agent.baseUrl, keyGroup: agent.keyGroup, cwd: agent.cwd,
        source: agent.source || "runtime", startedAt: agent.startedAt, lastSeenAt: agent.lastSeenAt,
        endedAt: agent.endedAt || null, statusSource: agent.statusSource || null, cacheHitRate: agent.cacheHitRate ?? null,
      }));
    const seen = new Set();
    const sessions = [...persisted, ...runtime].filter((session) => {
      const key = `${session.host}:${session.sessionId}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
      .end(JSON.stringify({ sessions }));
    return;
  }
  if (url.pathname === "/api/events" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ events: listEvents(filters), acknowledgedAt: getSettings().acknowledgedAt }));
    return;
  }
  if (url.pathname === "/api/quality/evaluators" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ evaluators: listEvaluators() }));
    return;
  }
  if (url.pathname === "/api/quality/baselines" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(publicBaselineState()));
    return;
  }
  if (url.pathname === "/api/quality/baselines/sync" && request.method === "POST") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(await syncPublicBaselines()));
    return;
  }
  if (url.pathname === "/api/iq/calibration/collect") {
    const result = request.method === "POST" ? collectTrustedCalibration(await readJsonBody(request))
      : request.method === "DELETE" ? cancelTrustedCalibration() : request.method === "GET" ? trustedCalibrationState() : null;
    response.writeHead(result ? request.method === "POST" ? 202 : 200 : 405, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(result));
    return;
  }
  if (url.pathname === "/api/iq/calibration/test-connection" && request.method === "POST") {
    try { await trustedApiRequest(await readJsonBody(request)); response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, message: "连接与鉴权成功 · 模型目录可用，推理协议可通过试采样验证" })); }
    catch (error) { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: error.message })); }
    return;
  }
  if (url.pathname === "/api/iq/calibration/models" && request.method === "POST") {
    try { const models = await trustedApiRequest(await readJsonBody(request)); response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ models })); }
    catch (error) { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ models: [], error: error.message })); }
    return;
  }
  if (url.pathname === "/api/iq/calibration" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ calibration: await readCalibration() }));
    return;
  }
  if (url.pathname === "/api/iq/calibration" && request.method === "PUT") {
    try {
      const calibration = await saveCalibration(await readJsonBody(request));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ calibration }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === "/api/quality/run" && request.method === "POST") {
    const input = await readJsonBody(request);
    const evaluator = listEvaluators().find((item) => item.id === input.evaluatorId);
    if (evaluator?.external) throw new TypeError("该方案在第三方网站执行，请使用报告导入入口");
    if (!evaluator) { response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "未配置质量评测器", status: "unconfigured" })); return; }
    const probeTarget = (await probeTargets()).find((target) =>
      target.protocol === input.protocol && target.baseUrl === input.baseUrl && target.keyGroup === input.keyGroup
      && (target.reasoningEffort || null) === (input.reasoningEffort || null)
      && (target.observedModel === input.observedModel || target.canonicalModelId && target.canonicalModelId === input.canonicalModelId));
    if (!probeTarget) { response.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "该模型没有运行中的 Agent 或可用凭据" })); return; }
    if (input.questionId && !listQuestions().some(question => question.id === input.questionId)) throw new TypeError("题目不存在");
    const run = await requestTargetVerification(probeTarget, evaluator.id, { questionId: input.questionId });
    scheduleProbes();
    response.writeHead(202, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(run));
    return;
  }
  if (url.pathname === "/api/quality/bazaarlink") {
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(bazaarlinkState()));
      return;
    }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const input = await readJsonBody(request);
    if (input.action === "stop") {
      await stopBazaarlink(input.targetId);
    } else {
      const target = (await probeTargets()).find(target => target.id === input.targetId);
      if (!target) throw new TypeError("请选择当前运行且已配置凭据的四元组");
      if (input.action === "configure") configureBazaarlink(target, input);
      else if (input.action === "start") {
        // Acknowledge immediately; the durable job is written before remote POST.
        void startBazaarlink(target).catch(error => console.error(error.message));
      } else if (input.action === "import") {
        if (input.confirmTarget !== true) throw new TypeError("请确认报告属于当前四元组");
        importBazaarlinkReport(input.report, target);
      } else throw new TypeError("未知 BazaarLink 操作");
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(bazaarlinkState()));
    return;
  }
  if (url.pathname === "/api/quality/runs" && request.method === "GET") {
    const latestFilters = { ...filters, hours: 0, since: undefined };
    const report = run => ({ ...run, reportDetails: meowReportDetails(run) });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({
      runs: listQualityRuns(filters).map(report),
      questionWindows: questionWindowSummaries(filters),
      history: listQualityRuns(latestFilters).map(report),
      latest: listQualityRuns({ ...latestFilters, latest: true }).map(report)
    }));
    return;
  }
  if (url.pathname === "/api/quality/ztest/import" && request.method === "POST") {
    const input = await readJsonBody(request);
    if (input.confirmTarget !== true) throw new TypeError("请确认报告属于当前四元组");
    const target = summary({ hours: 0 }).find(group => group.observedModel === input.observedModel
      && group.baseUrl === input.baseUrl && group.keyGroup === input.keyGroup && (group.reasoningEffort || null) === (input.reasoningEffort || null));
    if (!target) throw new TypeError("请选择已有观测的四元组后导入报告");
    let report = input.report;
    if (!report) {
      const id = ztestReportId(input.reportUrl);
      const remote = await fetch(`https://ztest.ai/api/reports/${encodeURIComponent(id)}`, { redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!remote.ok) throw new TypeError(`Ztest 报告读取失败（HTTP ${remote.status}）；报告可能过期或需要登录，可改为导入报告 JSON`);
      const body = await remote.text();
      if (body.length > 1024 * 1024) throw new TypeError("Ztest 报告不能超过 1 MB");
      report = JSON.parse(body);
    }
    const run = { ...target, ...normalizeZtestReport(report, target) };
    const prior = listQualityRuns({ hours: 0, model: target.observedModel, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
      reasoningEffort: target.reasoningEffort || "" }).find(item => item.evaluator_id === "ztest" && item.metadata.reportId === run.metadata.reportId);
    const id = prior?.id || Number(saveQualityRun(run).lastInsertRowid);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id, duplicate: Boolean(prior) }));
    return;
  }
  if (url.pathname === "/api/settings" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ settings: getSettings(), probe: await probeState() }));
    return;
  }
  if (url.pathname === "/api/questions") {
    let question;
    if (request.method === "POST") question = saveQuestion(await readJsonBody(request, 20000));
    else if (request.method === "DELETE") deleteQuestion((await readJsonBody(request)).id);
    else if (request.method !== "GET") { response.writeHead(405).end(); return; }
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ question, questions: listQuestions(), references: verificationReferences }));
    return;
  }
  if (url.pathname === "/api/settings" && request.method === "PATCH") {
    const before = getSettings();
    const patch = await readJsonBody(request);
    let notice = null;
    if (patch.hlwySource === "trustedApi") {
      const calibration = await readCalibration();
      const available = Object.entries(calibration?.models || {}).some(([observedModel, record]) => trustedHLWYReference(calibration, { observedModel, ...record }));
      if (!available) { patch.hlwySource = "public"; notice = "尚无合格的 HLWY 可信分布，已改用公共分布。请先采集至少 50 个同条件参考答案。"; }
    }
    const settings = updateSettings(patch);
    if (Object.keys(patch).some((key) => key.startsWith("probe") && before[key] !== settings[key])) {
      scheduleProbes({ immediate: settings.probeEnabled && !before.probeEnabled });
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ settings, notice, probe: await probeState() }));
    return;
  }
  if (url.pathname === "/api/probe/state" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(await probeState()));
    return;
  }
  if (url.pathname === "/api/probe" && request.method === "POST") {
    const results = await runProbeBatch({ force: true });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ results }));
    return;
  }
  if (url.pathname === "/api/config" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({
      host: "127.0.0.1", port, database: databasePath, upstreams: upstreamRoutes()
    }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/model-catalog") {
    const catalog = await syncCatalog({ force: url.searchParams.get("refresh") === "1" });
    response.writeHead(catalog.models.length ? 200 : 503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(catalog));
    return;
  }
  if (url.pathname.startsWith("/proxy/openai/") || url.pathname.startsWith("/proxy/anthropic/")) {
    const route = resolveProxyRoute(url.pathname, url.search);
    await proxyStream({ request, response, upstreamUrl: route?.upstreamUrl, baseUrl: route?.baseUrl,
      protocol: route?.protocol, saveSample, agent: request.headers["x-modivue-agent"] || "unknown" });
    return;
  }
  // Browsers request /favicon.ico automatically even when the document does
  // not declare a favicon. Reuse the packaged app icon so the local console
  // stays error-free and the desktop branding remains consistent.
  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    try {
      const body = await readFile(join(root, "src/data/app-icon.png"));
      response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!/^\/src\/data\/agent-icons\/[a-z-]+\.svg$/.test(requested) && !["/index.html", "/styles.css", "/app.js", "/src/core/metrics.js", "/src/core/model-match.js", "/src/core/quality-summary.js", "/src/core/answer-comparison.js", "/src/core/model-identity.js", "/src/core/agent-activity.js", "/src/core/island-state.js", "/src/core/island-display.js", "/src/core/preferences.js", "/src/core/i18n.js", "/src/core/hlwy-reference.js", "/src/data/question-tests.js", "/src/data/app-icon.png", "/src/data/meow-contract.json"].includes(requested)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const file = normalize(join(root, requested));
  const relative = file.slice(root.length);
  if (relative.startsWith("..") || relative.includes("/../")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(handleRequest).listen(port, "127.0.0.1", () => console.log(`Modivue 工作台: http://127.0.0.1:${port}`));
  void syncCatalog();
  void syncPublicBaselines();
  void detectAgents();
  setInterval(() => { void detectAgents(); }, 15000).unref();
  setInterval(() => { void syncPublicBaselines(); }, 6 * 60 * 60 * 1000).unref();
  setInterval(() => { void syncCatalog({ force: true }); }, catalogRefreshMs).unref();
  // Let the coding agent finish its first turn before the monitor sends any
  // active probe. An immediate request can contend with a just-started Codex
  // connection and leave the agent waiting in "connecting". Subsequent runs
  // follow the configured interval and remain serialised by probe.mjs.
  scheduleProbes();
  if (!process.env.MODIVUE_UI_ARTIFACTS) {
    const poll = async () => { try { await tickBazaarlink(await probeTargets()); } catch (error) { console.error(error.message); } };
    void poll();
    setInterval(poll, 5000).unref();
  }
}
