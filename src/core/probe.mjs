import { proxyStream } from "./proxy.mjs";
import { credentialGroup, normalizeBaseUrl, observationKey, upstreamEndpoint } from "./identity.mjs";
import { probeAgentConnections } from "./agents.mjs";
import { catalogState } from "./catalog.mjs";
import { matchModelName } from "./model-match.js";
import { getSettings, listQuestions, probeUsageToday, saveSample, saveQualityRun, listQualityRuns } from "./storage.mjs";
import { questionConditionsId, verificationVersions } from "./quality-summary.js";
import "./evaluator-question.mjs";
import { listEvaluators, runEvaluator } from "./quality.mjs";
import "./evaluator-coding.mjs";
import "./evaluator-hlwy.mjs";
import "./evaluator-meow.mjs";
import "./evaluator-kbf.mjs";
import "./evaluator-one-token.mjs";
import "./evaluator-astra.mjs";
import "./evaluator-ztest.mjs";
import { bazaarlinkState } from "./evaluator-bazaarlink.mjs";
import { createHash } from "node:crypto";
import { verificationStream } from "./verification-stream.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { qualityIdentity } from "./model-identity.js";
import { canProbeSession } from "./agent-activity.js";

const active = new Map();
let requestQueue = Promise.resolve();
let batch = null;
let lastRunAt = null;
let lastPerformanceRunAt = Date.now();
let nextRunAt = null;
let timer = null;
const probeCooldowns = new Map();
const lastProbeRequests = new Map();
const probeRouteKey = target => JSON.stringify([normalizeBaseUrl(target.baseUrl), target.keyGroup]);

export async function probeTargets(env = process.env) {
  const connections = await probeAgentConnections(env);
  const candidates = [
    { protocol: "openai", wireApi: env.MODIVUE_PROBE_OPENAI_API || "chat", baseUrl: env.MODIVUE_OPENAI_UPSTREAM, apiKey: env.MODIVUE_PROBE_OPENAI_KEY, observedModel: env.MODIVUE_PROBE_OPENAI_MODEL, authHeader: "authorization", agents: ["manual"] },
    { protocol: "anthropic", wireApi: "messages", baseUrl: env.MODIVUE_ANTHROPIC_UPSTREAM, apiKey: env.MODIVUE_PROBE_ANTHROPIC_KEY, observedModel: env.MODIVUE_PROBE_ANTHROPIC_MODEL, authHeader: "x-api-key", agents: ["manual"] },
    ...connections.map(({ model, ...agent }) => ({ ...agent, observedModel: model, agents: agent.agents || [agent.id] }))
  ];
  const unique = new Map();
  const catalog = catalogState().models;
  for (const item of candidates) {
    if (!item.baseUrl || !item.apiKey || !item.observedModel || item.error) continue;
    item.baseUrl = normalizeBaseUrl(item.baseUrl);
    const url = new URL(item.baseUrl);
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/proxy/")) continue;
    item.keyGroup = credentialGroup(item.apiKey);
    item.probeStrategy = getSettings().probeStrategy || "adaptive";
    item.workingProbeDelaySeconds = getSettings().workingProbeDelaySeconds || 20;
    item.probeCooldownSeconds = getSettings().probeCooldownSeconds || 60;
    item.pauseReason = probePauseReason({ ...item, manualRequest: true }, connections);
    item.automaticEligible = item.runtimeStatus === "active";
    const match = matchModelName(item.observedModel, catalog);
    item.canonicalModelId = match.status === "matched" ? match.model.id : null;
    item.matchStatus = match.status;
    item.id = observationKey(item);
    const key = item.id;
    if (unique.has(key)) {
      const existing = unique.get(key);
      existing.agents = [...new Set([...existing.agents, ...item.agents])];
      if (item.runtimeStatus === "active") { existing.runtimeStatus = "active"; existing.sessionId = item.sessionId; existing.automaticEligible = true; }
    }
    else unique.set(key, item);
  }
  return [...unique.values()];
}

export function probePauseReason(target, connections) {
  const strategy = target.manualRequest ? "adaptive" : target.probeStrategy || "idle";
  const cooldownUntil = probeCooldowns.get(probeRouteKey(target));
  if (cooldownUntil && cooldownUntil > Date.now()) return `探测冷却中，${Math.ceil((cooldownUntil - Date.now()) / 1000)} 秒后重试`;
  const sameTarget = session => normalizeBaseUrl(session.baseUrl) === normalizeBaseUrl(target.baseUrl)
    && session.keyGroup === target.keyGroup && session.model === target.observedModel
    && (session.reasoningEffort || null) === (target.reasoningEffort || null);
  const matchingSessions = connections.filter(sameTarget);
  if (target.sessionId && !matchingSessions.length) return "Agent 工作中、已结束或切换渠道；待命目标可核验";
  if (target.automatic && !matchingSessions.some(session => session.runtimeStatus === "active")) return "Agent 未工作，等待手动核验";
  if (target.manualRequest) return null;
  if (matchingSessions.length && !matchingSessions.some(session => (strategy === "idle"
    ? session.runtimeStatus === "idle" && canProbeSession({ ...session, status: "idle" }, Date.now(), getSettings().idleGraceSeconds * 1000)
    : session.runtimeStatus === "active" || session.runtimeStatus === "running" || session.runtimeStatus === "idle" && (!session.idleSince
      || Date.now() - Date.parse(session.idleSince) >= getSettings().idleGraceSeconds * 1000))))
    return "Agent 工作中、已结束或切换渠道；待命目标可核验";
  if (connections.some((session) => session.runtimeStatus === "active"
    && normalizeBaseUrl(session.baseUrl) === normalizeBaseUrl(target.baseUrl) && session.keyGroup === target.keyGroup)
  ) return strategy === "idle" ? "同渠道、同 Key 的 Agent 工作中，主动检测暂停" : null;
  return null;
}

export async function runProbe(target, options = {}) {
  const settings = getSettings();
  const maxOutputTokens = options.maxOutputTokens ?? settings.probeMaxOutputTokens;
  // Keep a hard upper bound for manual probes; a relay that leaves a socket
  // open must not block the verification queue indefinitely.
  if (options.timeoutMs != null) options = { ...options, timeoutMs: Math.min(3600000, Math.max(1000, Number(options.timeoutMs) || 45000)) };
  const instruction = typeof options.instruction === "string" ? options.instruction : settings.probeInstruction;
  if (!instruction?.trim() || instruction.length > 8100) throw new TypeError("探测指令无效");
  const conditionsId = options.conditionsId || `probe:custom:${createHash("sha256").update(JSON.stringify({ instruction, maxOutputTokens,
    reasoningEffort: target.reasoningEffort || null, wireApi: target.wireApi })).digest("hex").slice(0, 12)}`;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 65536) throw new TypeError("探测输出 token 上限无效");
  const dedupKey = JSON.stringify([target.protocol, normalizeBaseUrl(target.baseUrl), target.keyGroup,
    target.canonicalModelId || target.observedModel, target.wireApi, target.reasoningEffort || null, maxOutputTokens, conditionsId]);
  if (active.has(dedupKey)) return active.get(dedupKey);
  const job = requestQueue.then(async () => {
    options.checkContinue?.();
    let connections = await probeAgentConnections(undefined, undefined, { fresh: true });
    const working = connections.some(session => session.runtimeStatus === "active"
      && normalizeBaseUrl(session.baseUrl) === normalizeBaseUrl(target.baseUrl) && session.keyGroup === target.keyGroup);
    const routeKey = probeRouteKey(target);
    if (working && target.probeStrategy && target.probeStrategy !== "idle") {
      const remaining = (lastProbeRequests.get(routeKey) || 0) + getSettings().workingProbeDelaySeconds * 1000 - Date.now();
      if (remaining > 0) { await delay(remaining, undefined, { signal: options.signal }); options.checkContinue?.(); connections = await probeAgentConnections(undefined, undefined, { fresh: true }); }
    }
    const cooldown = (probeCooldowns.get(routeKey) || 0) - Date.now();
    if (cooldown > 0) {
      options.onWait?.(cooldown);
      await delay(cooldown, undefined, { signal: options.signal });
      options.checkContinue?.();
      probeCooldowns.delete(routeKey);
      connections = await probeAgentConnections(undefined, undefined, { fresh: true });
    }
    const paused = probePauseReason(target, connections);
    if (paused) throw Object.assign(new Error(paused), { code: "target_inactive" });
    if (probeUsageToday().requests >= getSettings().probeDailyLimit) throw Object.assign(new Error("已达到每日探测请求上限"), { code: "budget_exhausted" });
    const { protocol, wireApi, apiKey, observedModel, authHeader } = target;
    // Keep the upstream URL for identity and statistics, but send an Agent
    // probe through its local Modivue route when one is configured.
    const requestBaseUrl = target.proxyBaseUrl || target.baseUrl;
    if (!apiKey || !observedModel) throw new TypeError("探测凭据或模型缺失");
    const body = protocol === "gemini"
      ? { contents: [{ role: "user", parts: [{ text: instruction }] }], generationConfig: { maxOutputTokens } }
      : wireApi === "responses"
      ? { model: observedModel, input: instruction, max_output_tokens: maxOutputTokens, stream: true, store: false }
      : { model: observedModel, messages: [{ role: "user", content: instruction }],
        ...(protocol === "anthropic" ? { max_tokens: maxOutputTokens } : { max_completion_tokens: maxOutputTokens, stream_options: { include_usage: true } }), stream: true };
    if (protocol === "openai" && ["chat", "chat.completions"].includes(wireApi) && options.chatTokenField === "max_tokens") {
      delete body.max_completion_tokens; body.max_tokens = maxOutputTokens;
    }
    const effort = options.reasoningEffort ?? target.reasoningEffort;
    if (effort) {
      if (protocol === "gemini") body.generationConfig.thinkingConfig = effort === "none" ? { thinkingBudget: 0 } : { thinkingLevel: effort };
      else if (wireApi === "responses") body.reasoning = { effort };
      else if (protocol === "openai") body.reasoning_effort = effort;
      else if (effort === "none") body.thinking = { type: "disabled" };
      else body.output_config = { effort };
    }
    if (typeof options.system === "string") {
      if (protocol === "gemini") body.systemInstruction = { parts: [{ text: options.system }] };
      else if (wireApi === "responses") body.input = [{ role: "system", content: options.system }, { role: "user", content: instruction }];
      else if (protocol === "anthropic") body.system = options.system;
      else body.messages.unshift({ role: "system", content: options.system });
    }
    if (options.adaptiveThinking && protocol === "anthropic") body.thinking = { type: "adaptive" };
    if (Number.isFinite(options.temperature)) {
      if (protocol === "gemini") body.generationConfig.temperature = options.temperature;
      else body.temperature = options.temperature;
    }
    const headers = { "content-type": "application/json", ...(protocol === "gemini" ? { "x-goog-api-key": apiKey } : authHeader === "x-api-key" ? { "x-api-key": apiKey } : { authorization: "Bearer " + apiKey }),
      ...(protocol === "anthropic" ? { "anthropic-version": "2023-06-01" } : {}) };
    if (options.userAgent) headers["user-agent"] = options.userAgent;
    const payload = Buffer.from(JSON.stringify(body));
    const request = { method: "POST", headers, async *[Symbol.asyncIterator]() { yield payload; } };
    const suffix = protocol === "anthropic" ? "/v1/messages" : wireApi === "responses" ? "/responses" : "/v1/chat/completions";
    const upstreamUrl = protocol === "gemini" ? `${requestBaseUrl.replace(/\/(v1beta|v1)$/, "")}/v1beta/models/${encodeURIComponent(observedModel)}:streamGenerateContent?alt=sse`
      : upstreamEndpoint(requestBaseUrl, suffix);
    try {
      lastProbeRequests.set(routeKey, Date.now());
      const sample = await proxyStream({ request, response: { writeHead() { return this; }, write() { return true; }, end() {} },
      upstreamUrl, baseUrl: target.baseUrl, protocol, observedModel, saveSample: options.saveSample || saveSample,
      canonicalModelId: target.canonicalModelId, agent: "modivue-probe", conditionsId, timeoutMs: options.timeoutMs, signal: options.signal, onText: options.onText, onEvent: options.onEvent });
      if (target.probeStrategy && sample.status !== "ok" && !options.signal?.aborted) probeCooldowns.set(routeKey, Date.now() + Math.max(
        getSettings().probeCooldownSeconds * 1000, sample.measurement?.retryAfterMs || 0));
      return sample;
    } catch (error) {
      if (target.probeStrategy && !options.signal?.aborted) probeCooldowns.set(routeKey, Date.now() + getSettings().probeCooldownSeconds * 1000);
      throw error;
    }
  });
  requestQueue = job.catch(() => {});
  active.set(dedupKey, job);
  try { return await job; } finally { active.delete(dedupKey); }
}

const qualityJobs = new Map();
const qualityProgress = new Map();
const pendingVerifications = new Map();
const qualityControls = new Map();
const suspendedVerifications = new Map();
const heldTargets = new Set();
const verificationJobId = (target, evaluatorId, options = {}) => JSON.stringify([target.id, evaluatorId, options.questionId || null]);

// Manual requests acknowledge immediately. The same serial scheduler starts
// queued work once its live route has a valid idle window.
export async function requestTargetVerification(target, evaluatorId, options = {}) {
  const id = verificationJobId(target, evaluatorId, options);
  if (qualityJobs.has(id)) return { status: "running", targetId: target.id };
  const previous = pendingVerifications.get(id);
  options = { ...options, manual: true, priority: options.priority === true || previous?.options.priority === true };
  heldTargets.delete(target.id);
  suspendedVerifications.delete(id);
  pendingVerifications.set(id, { targetId: target.id, evaluatorId, options });
  if (options.priority) for (const [otherId, control] of qualityControls) {
    if (otherId !== id) interruptVerification(control, "pause", "已为插队核验暂停");
  }
  if (!target.pauseReason && !qualityJobs.size && !batch) {
    void runTargetVerification(target, evaluatorId, () => true, options).catch(error => console.error(error.message));
    return { status: "running", targetId: target.id };
  }
  return { status: "queued", priority: options.priority, targetId: target.id,
    rationale: options.priority ? "已暂停当前核验，优先执行此目标" : target.pauseReason || "等待当前核验结束" };
}

function interruptVerification(control, action, message) {
  control.action = action;
  heldTargets.add(control.targetId);
  control.controller.abort(Object.assign(new Error(message), { code: "monitoring_paused" }));
}

export function controlTargetVerification(targetId, action) {
  if (!["pause", "resume", "stop"].includes(action)) throw new TypeError("未知核验控制操作");
  let changed = false;
  for (const [id, control] of qualityControls) if (control.targetId === targetId) {
    if (action === "resume") continue;
    interruptVerification(control, action, action === "stop" ? "核验已终止" : "核验已暂停");
    changed = true;
  }
  for (const [id, job] of pendingVerifications) if (job.targetId === targetId && action !== "resume") {
    pendingVerifications.delete(id);
    suspendedVerifications.set(id, { ...job, phase: action === "pause" ? "paused" : "stopped" });
    changed = true;
  }
  for (const [id, job] of suspendedVerifications) if (job.targetId === targetId) {
    if (action === "resume" && job.phase === "paused") { pendingVerifications.set(id, { ...job, options: { ...job.options, manual: true } }); suspendedVerifications.delete(id); changed = true; }
    if (action === "stop") { job.phase = "stopped"; changed = true; }
  }
  if (!changed) throw new TypeError("当前目标没有可控制的核验任务");
  if (action === "resume") { heldTargets.delete(targetId); scheduleProbes({ immediate: true }); }
  else heldTargets.add(targetId);
  return { targetId, status: action === "resume" ? "queued" : action === "pause" ? "paused" : "stopped" };
}
export function verificationDue(target, evaluatorId, runs, intervalMinutes, now = Date.now(), questionId = null) {
  const question = evaluatorId === "custom-question" ? listQuestions().find(item => item.id === (questionId || getSettings().defaultQuestionId)) : null;
  const matching = runs.filter((run) => run.evaluator_id === evaluatorId && qualityIdentity(run, evaluatorId) === qualityIdentity(target, evaluatorId)
    && (evaluatorId !== "custom-question" || question && run.evaluator_version === verificationVersions[evaluatorId] && run.metadata?.conditionsId === questionConditionsId(question)))
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
  const latest = matching[0];
  // Multi-request methods reuse partial observations. A single question has
  // no reusable completed sample, so its next attempt still waits a round.
  if (latest?.status === "paused" && latest.metadata?.controlAction !== "stop" && evaluatorId !== "custom-question") return true;
  const previous = Date.parse(latest?.timestamp) || 0;
  const interval = Math.max(1, intervalMinutes) * 60000;
  return !previous || now - previous >= interval;
}

export async function runTargetVerification(target, evaluatorId, shouldContinue = () => true, options = {}) {
  target = { ...target, manualRequest: options.manual === true || options.priority === true, automatic: options.automatic === true };
  const paused = probePauseReason(target, await probeAgentConnections(undefined, undefined, { fresh: true }));
  if (paused) return { status: "skipped", rationale: paused };
  const id = verificationJobId(target, evaluatorId, options);
  if (qualityJobs.has(id)) return qualityJobs.get(id);
  if (qualityJobs.size) return { status: "skipped", rationale: "其他模型核验正在运行" };
  pendingVerifications.delete(id);
  const control = { targetId: target.id, evaluatorId, options, controller: new AbortController(), action: null };
  qualityControls.set(id, control);
  const checkContinue = () => {
    control.controller.signal.throwIfAborted();
    if (!shouldContinue()) throw Object.assign(new Error("主动检测已暂停"), { code: "monitoring_paused" });
  };
  const wait = async milliseconds => {
    checkContinue();
    try { await delay(milliseconds, undefined, { signal: control.controller.signal }); }
    catch (error) { throw control.controller.signal.reason || error; }
    checkContinue();
  };
  const job = (async () => {
    let result;
    const samples = [];
    const evaluatorVersion = listEvaluators().find((item) => item.id === evaluatorId)?.version;
    const latest = listQualityRuns({ hours: 0, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
      model: target.canonicalModelId || target.observedModel, reasoningEffort: evaluatorId === "juice" ? target.reasoningEffort || "" : undefined, limit: 20 })
      .filter((run) => run.evaluator_id === evaluatorId && qualityIdentity(run, evaluatorId) === qualityIdentity(target, evaluatorId))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
    const prior = latest?.status === "paused" && latest.metadata?.controlAction !== "stop" && latest.evaluator_version === evaluatorVersion ? latest : undefined;
    try {
      qualityProgress.set(id, { targetId: target.id, evaluatorId, phase: "preparing", completed: 0, total: null, startedAt: new Date().toISOString() });
      result = await runEvaluator(evaluatorId, { ...target, previousRun: prior,
        questionId: options.questionId, hlwySource: getSettings().hlwySource, juiceMode: getSettings().juiceMode,
        sampleCount: getSettings().verificationSamples, meowTier: getSettings().meowTier,
        wait: (milliseconds) => {
          qualityProgress.set(id, { ...qualityProgress.get(id), phase: "retrying", retryAt: new Date(Date.now() + milliseconds).toISOString() });
          return wait(milliseconds);
        },
        requireBudget: (count) => {
          checkContinue();
          if (probeUsageToday().requests + active.size + count > getSettings().probeDailyLimit) throw Object.assign(new Error(`本轮需要 ${count} 次请求，今日剩余额度不足`), { code: "budget_exhausted" });
        },
        onProgress: (progress) => qualityProgress.set(id, { ...qualityProgress.get(id), ...progress }),
        request: async (instruction, options) => {
        if (samples.length) {
          qualityProgress.set(id, { ...qualityProgress.get(id), phase: "spacing" });
          await wait(getSettings().verificationRequestDelaySeconds * 1000);
        }
        checkContinue();
        qualityProgress.set(id, { ...qualityProgress.get(id), phase: "sampling", requestStartedAt: new Date().toISOString() });
        let text = "";
        const stream = options.strictResponse ? verificationStream(target.wireApi) : null;
        let sample, reasoningDetected = false;
        try {
          sample = await runProbe(target, { ...options, signal: control.controller.signal, checkContinue, instruction,
            onWait: milliseconds => qualityProgress.set(id, { ...qualityProgress.get(id), phase: "retrying", retryAt: new Date(Date.now() + milliseconds).toISOString() }), onEvent: event => {
            stream?.feed(event);
            if (options.rejectReasoning && (/reasoning|thinking/.test(event?.type || "") || event?.choices?.some(choice => choice.delta?.reasoning_content || choice.delta?.reasoning)
              || event?.content_block?.type === "thinking" || Number(event?.usage?.completion_tokens_details?.reasoning_tokens || event?.response?.usage?.output_tokens_details?.reasoning_tokens) > 0)) reasoningDetected = true;
          }, onText: (chunk) => { if (text.length + chunk.length > 1024 * 1024) throw new Error("核验回答超过 1 MiB"); text += chunk; } });
        } catch (error) {
          if (control.controller.signal.aborted) throw Object.assign(control.controller.signal.reason, { partialText: text });
          if (["target_inactive", "monitoring_paused", "budget_exhausted"].includes(error.code)) throw error;
          // Keep transport failures in the report's attempt count. They do
          // not vote in the evaluator and have no cost unless the provider
          // returned a usage-bearing sample.
          samples.push({ timestamp: new Date().toISOString(), durationMs: null,
            costUsd: null, costStatus: "unknown", status: "error", error: error.message || "请求失败", upstreamError: error.upstreamError || { message: error.message || "请求失败", code: error.code || "upstream_error" } });
          error.partialText = text;
          error.retryAfterMs = Math.max(error.retryAfterMs || 0, (probeCooldowns.get(probeRouteKey(target)) || 0) - Date.now());
          error.retryable ??= true;
          throw error;
        }
        const record = { timestamp: sample.timestamp, durationMs: sample.durationMs, costUsd: sample.costUsd,
          costSource: sample.costSource, costDetails: sample.costDetails,
          costStatus: sample.costStatus, status: sample.status, error: sample.error || null, upstreamError: sample.measurement?.upstreamError || null };
        if (sample.status !== "ok" && text) record.partialText = text;
        samples.push(record);
        if (control.controller.signal.aborted) throw Object.assign(control.controller.signal.reason, { partialText: text });
        if (sample.status !== "ok") throw Object.assign(new Error(sample.measurement?.upstreamError?.message || sample.error || "核验请求失败"),
          { code: [401, 403].includes(sample.measurement?.httpStatus) ? "authentication_failed" : "request_failed",
            retryAfterMs: Math.max(sample.measurement?.retryAfterMs || 0, (probeCooldowns.get(probeRouteKey(target)) || 0) - Date.now()),
            partialText: text, upstreamError: sample.measurement?.upstreamError,
            retryable: [408, 429, 500, 502, 503, 504].includes(sample.measurement?.httpStatus)
              || ["upstream_error", "server_error", "rate_limit_exceeded"].includes(sample.measurement?.upstreamError?.code)
              || ["TimeoutError", "TypeError"].includes(sample.error) });
        try {
          if (reasoningDetected) throw new Error("上游未关闭推理，该回答不计入单词分布");
          return stream ? stream.finish() : text;
        }
        catch (error) { record.status = "error"; record.error = error.message; throw error; }
      } });
    } catch (error) {
      const evaluator = listEvaluators().find((item) => item.id === evaluatorId);
      result = { evaluatorId, evaluatorVersion: evaluator?.version, status: "error", score: null,
        rationale: error.message, metadata: { verdict: "inconclusive", conditionsId: evaluator?.conditionsId } };
    }
    if (control.action) result = { ...result, status: "paused", rationale: control.controller.signal.reason.message,
      metadata: { ...result.metadata, verdict: "inconclusive", controlAction: control.action } };
    const requests = prior?.id && result.metadata?.continuedFrom === prior.id
      ? [...(prior.metadata.requests || []), ...samples] : samples;
    const run = { ...result, timestamp: new Date().toISOString(), protocol: target.protocol, baseUrl: target.baseUrl,
      keyGroup: target.keyGroup, observedModel: target.observedModel, canonicalModelId: target.canonicalModelId,
      metadata: { ...result.metadata, ...(evaluatorId === "custom-question" && !result.metadata?.question ? (() => {
        const question = listQuestions().find(item => item.id === (options.questionId || getSettings().defaultQuestionId));
        return question ? { question, conditionsId: questionConditionsId(question) } : {};
      })() : {}), reasoningEffort: target.reasoningEffort || null, wireApi: target.wireApi,
        requestAttempts: requests.length, requests } };
    saveQualityRun(run);
    return run;
  })();
  qualityJobs.set(id, job);
  try { return await job; } finally {
    qualityJobs.delete(id); qualityProgress.delete(id); qualityControls.delete(id);
    if (control.action) suspendedVerifications.set(id, { targetId: target.id, evaluatorId, options, phase: control.action === "stop" ? "stopped" : "paused" });
    if (!batch && pendingVerifications.size) scheduleProbes({ immediate: true });
  }
}

export async function probeState() {
  const settings = getSettings();
  const targets = (await probeTargets()).map(({ apiKey, authHeader, ...target }) => target);
  const remote = bazaarlinkState().jobs.filter(job => ["starting", "running", "stopping", "polling-error"].includes(job.status))
    .map(job => ({ targetId: job.target.id, evaluatorId: "bazaarlink-probe", phase: job.status === "polling-error" ? "retrying" : "sampling", startedAt: job.startedAt,
      completed: job.progress?.completed || 0, total: job.progress?.total || null }));
  return { enabled: settings.probeEnabled, targets, running: Boolean(batch), verification: [...pendingVerifications.values()].map(job => ({ ...job, phase: "queued" })).concat([...qualityProgress.values()], [...suspendedVerifications.values()], remote), lastRunAt, nextRunAt, usage: probeUsageToday(),
    verificationIntervalMinutes: settings.verificationIntervalMinutes,
    intervalMinutes: settings.probeIntervalMinutes, dailyLimit: settings.probeDailyLimit, maxOutputTokens: settings.probeMaxOutputTokens,
    conditionsId: `probe:custom:${createHash("sha256").update(JSON.stringify({ instruction: settings.probeInstruction, maxOutputTokens: settings.probeMaxOutputTokens })).digest("hex").slice(0, 12)}` };
}

export async function runProbeBatch({ force = false } = {}) {
  if (batch) return batch;
  if (qualityJobs.size) return [{ status: "skipped", rationale: "模型核验正在运行，普通采样暂缓" }];
  if (!force && !getSettings().probeEnabled && !pendingVerifications.size) throw new TypeError("主动探测未启用");
  batch = (async () => {
    const results = [];
    const performanceDue = force || Date.now() - lastPerformanceRunAt >= getSettings().probeIntervalMinutes * 60000;
    let sampledPerformance = false;
    const targets = await probeTargets();
    for (const [id, pending] of pendingVerifications) if (!targets.some(target => target.id === pending.targetId)) pendingVerifications.delete(id);
    const handled = new Set();
    const drainQueue = async () => {
      for (;;) {
        const entry = [...pendingVerifications].filter(([id]) => !handled.has(id))
          .sort((a, b) => Number(Boolean(b[1].options.priority)) - Number(Boolean(a[1].options.priority)))[0];
        if (!entry) break;
        const [id, queued] = entry;
        handled.add(id);
        const target = targets.find(item => item.id === queued.targetId);
        if (!target) continue;
        results.push(await runTargetVerification(target, queued.evaluatorId, () => true, queued.options));
      }
    };
    await drainQueue();
    for (const entry of targets) {
      const target = { ...entry, automatic: !force, manualRequest: force };
      await drainQueue();
      const settings = getSettings();
      const manual = [...pendingVerifications.entries()].filter(([, job]) => job.targetId === target.id);
      if (!force && (!target.automaticEligible || heldTargets.has(target.id))) continue;
      if (bazaarlinkState().jobs.some(job => job.target.id === target.id && ["starting", "running", "stopping", "polling-error"].includes(job.status))) continue;
      if (!force && (!settings.probeEnabled || settings.probeStrategy === "manual") && !manual.length) continue;
      const activeWorking = target.sessionId && target.runtimeStatus === "active";
      if (target.pauseReason || activeWorking && target.probeStrategy === "idle") {
        results.push({ id: target.id, status: "skipped", rationale: target.pauseReason || "Agent 工作中，主动检测稍后执行" });
        continue;
      }
      if (probeUsageToday().requests >= settings.probeDailyLimit) {
        results.push({ status: "budget_exhausted", limit: settings.probeDailyLimit });
        break;
      }
      if (manual.length || [...handled].some(id => JSON.parse(id)[0] === target.id)) continue;
      try {
        if (settings.evaluatorId === "custom-question") {
          const runs = listQualityRuns({ hours: 0, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
            model: target.canonicalModelId || target.observedModel, reasoningEffort: target.reasoningEffort || "" });
          if (force || verificationDue(target, "custom-question", runs, getSettings().verificationIntervalMinutes))
            results.push(await runTargetVerification(target, "custom-question", () => force || getSettings().probeEnabled, { manual: force, automatic: !force }));
          continue;
        }
        if (performanceDue) {
          let sample;
          let lastError;
          sampledPerformance = true;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              sample = await runProbe(target);
              if (sample.status === "ok") break;
              lastError = new Error(sample.error || "探测请求失败");
              if ([401, 403].includes(sample.measurement?.httpStatus)) break;
            } catch (error) {
              lastError = error;
              if (["target_inactive", "monitoring_paused", "budget_exhausted"].includes(error.code)) break;
            }
            if (attempt < 2) await delay(Math.min(10000, 500 * 2 ** attempt));
          }
          if (["target_inactive", "monitoring_paused", "budget_exhausted"].includes(lastError?.code)) throw lastError;
          results.push({ id: target.id, status: sample?.status || "error", error: sample?.error || lastError?.message });
          if ([401, 403].includes(sample?.measurement?.httpStatus)) continue;
        }
        for (const evaluator of listEvaluators().filter((item) => !item.external && item.id === getSettings().evaluatorId)) {
          if (!force && !getSettings().probeEnabled) break;
          const runs = listQualityRuns({ hours: 0, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
            model: target.canonicalModelId || target.observedModel, reasoningEffort: target.reasoningEffort || "" });
          if (!force && !verificationDue(target, evaluator.id, runs, getSettings().verificationIntervalMinutes, Date.now(), evaluator.id === "custom-question" ? getSettings().defaultQuestionId : null)) continue;
          results.push(await runTargetVerification(target, evaluator.id, () => force || getSettings().probeEnabled, { manual: force, automatic: !force }));
        }
      } catch (error) {
        const skipped = ["target_inactive", "monitoring_paused"].includes(error.code);
        results.push({ id: target.id, status: skipped ? "skipped" : error.code === "budget_exhausted" ? "budget_exhausted" : "error",
          ...(skipped ? { rationale: error.message } : { error: error.message || "探测请求失败" }) });
      }
    }
    await drainQueue();
    if (sampledPerformance) lastPerformanceRunAt = Date.now();
    lastRunAt = new Date().toISOString();
    return results;
  })();
  try { return await batch; } finally { batch = null; }
}

export function scheduleProbes({ immediate = false } = {}) {
  clearTimeout(timer);
  // Native UI tests inspect real sessions without sending provider requests.
  if (process.env.MODIVUE_UI_ARTIFACTS) { nextRunAt = null; return; }
  const settings = getSettings();
  const delay = immediate ? 0 : pendingVerifications.size ? 5000
    : Math.min(settings.probeIntervalMinutes, settings.verificationIntervalMinutes) * 60000;
  nextRunAt = settings.probeEnabled && settings.probeStrategy !== "manual" || pendingVerifications.size ? new Date(Date.now() + delay).toISOString() : null;
  if (nextRunAt) timer = setTimeout(async () => {
    try { await runProbeBatch(); } catch (error) { console.error(error.message); }
    finally { scheduleProbes(); }
  }, delay).unref();
}
