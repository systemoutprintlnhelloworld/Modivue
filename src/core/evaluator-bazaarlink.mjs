import { registerEvaluator } from "./quality.mjs";
import { getSettings, loadBazaarlinkJobs, saveBazaarlinkJobs, listQualityRuns, saveQualityRun } from "./storage.mjs";
import { modelIdentity } from "./model-identity.js";
import { resolveLocale } from "./i18n.js";
import { summarizeBazaarlink } from "./bazaarlink-summary.js";

const origin = "https://bazaarlink.ai";
const method = "bazaarlink-probe";
const version = "1.0.0";
let jobs = loadBazaarlinkJobs();
let busy = false;
const starting = new Set();
const persist = () => saveBazaarlinkJobs(jobs);
const running = job => ["starting", "running", "polling-error", "stopping"].includes(job.status);
const cleanTarget = target => ({ id: target.id, protocol: target.protocol, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
  observedModel: target.observedModel, canonicalModelId: target.canonicalModelId, reasoningEffort: target.reasoningEffort || null });
const runPath = id => `/api/probe/run/${encodeURIComponent(id)}`;

registerEvaluator({ id: method, label: "BazaarLink Probe 综合检测", version, external: true, conditionsId: "bazaarlink:official:v1",
  async run() { throw new TypeError("请在 BazaarLink 面板启用当前渠道后开始官方远程检测"); } });

async function remote(path, body, fetchImpl = fetch) {
  const response = await fetchImpl(origin + path, { method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? "BazaarLink 请求限流，请稍后重试"
      : response.status === 403 ? "BazaarLink 要求人机验证，请在官网完成检测后导入报告"
      : `BazaarLink 请求失败（HTTP ${response.status}）`);
    error.retryAfterMs = Math.max(60000, Number(response.headers.get("retry-after") || 0) * 1000);
    error.httpStatus = response.status;
    throw error;
  }
  return response.json();
}

export function bazaarlinkState() {
  return { jobs, modes: ["quick", "full", "context"], billing: "target-key", platformFee: "no-separate-fee" };
}

function validatePlan(input) {
  const { mode = "quick", continuous = false, intervalMinutes = 60, dailyRuns = 2 } = input;
  if (!["quick", "full", "context"].includes(mode) || typeof continuous !== "boolean"
    || !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080
    || !Number.isInteger(dailyRuns) || dailyRuns < 1 || dailyRuns > 20) throw new TypeError("请检查检测模式、间隔（15–10080 分钟）和每日轮数（1–20）");
  return { mode, continuous, intervalMinutes, dailyRuns };
}

export function configureBazaarlink(target, input) {
  if (input.consent !== true) throw new TypeError("请确认将当前渠道 API Key 发往 BazaarLink，检测消耗上游额度且报告公开");
  if (!["openai", "anthropic"].includes(target.protocol)) throw new TypeError("BazaarLink 当前支持 OpenAI 和 Anthropic 协议");
  const url = new URL(target.baseUrl);
  if (!/^https?:$/.test(url.protocol)) throw new TypeError("渠道必须为 HTTP(S) 地址");
  const plan = validatePlan(input);
  let job = jobs.find(item => item.target.id === target.id);
  if (job && (running(job) || job.status === "start-unknown")) throw new TypeError("当前检测尚未结束或启动状态未知，请先在官网核对并停止再修改计划");
  if (!job) { job = { target: cleanTarget(target), attempts: [], status: "idle" }; jobs.push(job); }
  Object.assign(job, plan, { consentAt: new Date().toISOString(), nextRunAt: null, error: null, target: cleanTarget(target) });
  if (plan.continuous) job.nextRunAt = new Date(Date.now() + plan.intervalMinutes * 60000).toISOString();
  persist();
  return job;
}

export function normalizeBazaarlinkReport(report, target, mode) {
  if (!report || !Array.isArray(report.items) || typeof report.modelId !== "string" || !report.baseUrl)
    throw new TypeError("BazaarLink 报告缺少目标或逐题结果");
  if (report.modelId !== target.observedModel || report.baseUrl.replace(/\/+$/, "") !== target.baseUrl.replace(/\/+$/, ""))
    throw new TypeError("报告模型或渠道与当前目标不一致");
  if (!["completed", "failed", "stopped", "cancelled"].includes(report.status)
    && !(report.status == null && report.completedAt && Number.isFinite(Date.parse(report.completedAt))))
    throw new TypeError("检测尚未结束，请等待完成或停止后再导入报告");
  const id = report.runId || report.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) throw new TypeError("BazaarLink 报告编号无效");
  // Keep the provider's evidence, not the deprecated aggregate score or IPs.
  const externalReport = Object.fromEntries(["id", "runId", "baseUrl", "modelId", "protocolPath", "upstreamFormat", "status", "items",
    "identityAssessment", "totalInputTokens", "totalOutputTokens", "createdAt", "completedAt", "wallClockMs", "warnings"]
    .filter(key => report[key] !== undefined).map(key => [key, report[key]]));
  const completed = report.items.filter(item => item.status === "done" || item.status === "completed" || item.passed !== null && item.passed !== undefined);
  const assessment = report.identityAssessment;
  const result = summarizeBazaarlink(report);
  const timestamp = new Date(report.completedAt || report.createdAt || Date.now()).toISOString();
  return { ...cleanTarget(target), evaluatorId: method, evaluatorVersion: version, score: null, timestamp,
    status: report.status === "failed" ? "error" : ["stopped", "cancelled"].includes(report.status) ? "paused" : "ok", rationale: `BazaarLink · ${result.label}${result.detectedModel ? ` → ${result.detectedModel}` : ""}`,
    metadata: { verdict: result.verdict, declaredMatch: result.declaredMatch, directedModel: result.detectedModel, reportId: id, mode: mode || "imported", externalReport,
      sampleCount: completed.length, plannedSamples: report.items.length, reasoningEffort: target.reasoningEffort || null,
      source: `${origin}/probe?runId=${encodeURIComponent(report.id || id)}`, costUsd: null, costStatus: "unknown",
      identityStatus: assessment?.verdict?.status || assessment?.status || "insufficient_data",
      conditionsId: JSON.stringify(["bazaarlink:official:v1", mode || "imported", report.protocolPath || report.upstreamFormat || null]),
      conditionNotice: "官方行为探针结果不是模型身份认证。远程 API 使用官网采样条件，未保证沿用本地推理档位；token 费用由目标渠道计收。" } };
}

export function importBazaarlinkReport(report, target, mode) {
  const run = normalizeBazaarlinkReport(report, target, mode);
  const prior = listQualityRuns({ hours: 0, model: target.observedModel, baseUrl: target.baseUrl, keyGroup: target.keyGroup,
    reasoningEffort: target.reasoningEffort || "" }).find(item => item.evaluator_id === method && item.metadata.reportId === run.metadata.reportId);
  return { id: prior?.id || Number(saveQualityRun(run).lastInsertRowid), duplicate: Boolean(prior) };
}

export function startBazaarlink(target, { fetchImpl = fetch } = {}) {
  const job = jobs.find(item => item.target.id === target.id);
  if (!job?.consentAt || modelIdentity(job.target) !== modelIdentity(target)) throw new TypeError("请先启用当前四元组的远程检测");
  if (running(job)) return Promise.resolve(job);
  if (job.status === "start-unknown") throw new TypeError("请先在官网确认此轮状态，再停止当前计划后重新启动");
  if (jobs.some(item => running(item))) throw new TypeError("已有 BazaarLink 检测正在运行");
  const today = new Date().toLocaleDateString("en-CA");
  job.attempts = job.attempts.filter(item => item.day === today);
  if (job.attempts.length >= job.dailyRuns) throw new TypeError("已达到当前目标每日远程检测轮数上限");
  // Persist before POST. A lost acknowledgement must never auto-create a
  // second paid run; it requires the user to reconcile it at the website.
  Object.assign(job, { status: "starting", runId: null, error: null, stopRequested: false, startedAt: new Date().toISOString(), nextRunAt: null, progress: null });
  job.attempts.push({ day: today, timestamp: job.startedAt });
  starting.add(target.id);
  persist();
  return (async () => {
  try {
    const result = await remote("/api/probe/run", { baseUrl: target.baseUrl, apiKey: target.apiKey,
      modelId: target.observedModel, ...(target.canonicalModelId ? { claimedModel: target.canonicalModelId } : {}),
      upstreamFormat: target.protocol, quickMode: job.mode === "quick", identityOnly: job.mode === "quick",
      runContextCheck: job.mode === "context", sync: false,
      lang: resolveLocale(getSettings().locale, process.env.MODIVUE_LANGUAGES?.split(",")) === "en" ? "en" : "zh" }, fetchImpl);
    if (typeof result.runId !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(result.runId)) throw new Error("missing runId");
    job.runId = result.runId; job.status = "running";
    persist();
    if (job.stopRequested) { await remote(`${runPath(job.runId)}/stop`, {}, fetchImpl); job.status = "stopping"; job.stopRequested = false; persist(); }
  } catch (error) {
    job.status = job.runId ? "polling-error" : "start-unknown"; job.continuous = false;
    job.error = error.httpStatus ? error.message : "未收到有效启动确认；请在官网确认是否已产生检测，避免重复扣费";
    persist();
  } finally { starting.delete(target.id); }
  return job;
  })();
}

export async function stopBazaarlink(targetId, { fetchImpl = fetch } = {}) {
  const job = jobs.find(item => item.target.id === targetId);
  if (!job) throw new TypeError("尚未启用该目标");
  job.continuous = false; job.nextRunAt = null; persist();
  if (starting.has(targetId)) { job.stopRequested = true; persist(); return job; }
  if (job.runId && running(job)) {
    job.stopRequested = true; persist();
    try { await remote(`${runPath(job.runId)}/stop`, {}, fetchImpl); }
    catch (error) { job.error = error.httpStatus ? error.message : "停止请求未确认，将按原 runId 重试"; persist(); throw new TypeError(job.error); }
    job.status = "stopping"; job.stopRequested = false;
  } else job.status = "stopped";
  persist(); return job;
}

export async function tickBazaarlink(targets, { fetchImpl = fetch } = {}) {
  if (busy) return;
  busy = true;
  try {
    for (const job of jobs) {
      if (starting.has(job.target.id)) continue;
      if (job.status === "starting") {
        job.status = "start-unknown"; job.continuous = false;
        job.error = "应用在启动确认前退出，请先在官网检查此轮检测"; persist();
      }
      if (job.runId && running(job)) {
        if (Date.now() < (job.retryAt || 0)) continue;
        try {
          if (job.stopRequested) { await remote(`${runPath(job.runId)}/stop`, {}, fetchImpl); job.status = "stopping"; job.stopRequested = false; }
          let report;
          try { report = await remote(runPath(job.runId), undefined, fetchImpl); }
          catch (error) {
            if (![404, 410].includes(error.httpStatus)) throw error;
            report = await remote(`/api/probe/history/${encodeURIComponent(job.runId)}`, undefined, fetchImpl);
            if (report.completedAt && !report.status) report.status = "completed";
          }
          job.progress = { completed: report.items?.filter(item => !["pending", "running"].includes(item.status)).length || 0,
            total: report.items?.length || null, phase: report.analysisPhase || report.linguisticPhase || report.status };
          job.error = null;
          if (["completed", "failed", "stopped", "cancelled"].includes(report.status)) {
            const saved = importBazaarlinkReport(report, job.target, job.mode);
            Object.assign(job, { status: report.status, savedRunId: saved.id, completedAt: new Date().toISOString(),
              nextRunAt: job.continuous ? new Date(Date.now() + job.intervalMinutes * 60000).toISOString() : null });
          } else job.status = job.status === "stopping" ? "stopping" : "running";
        } catch (error) {
          job.status = "polling-error"; job.error = error.httpStatus ? error.message : "进度读取失败，保留原 runId 稍后重试";
          job.retryAt = Date.now() + (error.retryAfterMs || 60000);
        }
        persist();
        continue;
      }
      if (job.continuous && job.nextRunAt && Date.parse(job.nextRunAt) <= Date.now() && getSettings().probeEnabled && getSettings().probeStrategy !== "manual"
        && !jobs.some(item => running(item))) {
        const target = targets.find(target => target.id === job.target.id && !target.pauseReason && target.automaticEligible);
        if (!target) continue;
        try { await startBazaarlink(target, { fetchImpl }); }
        catch (error) { job.error = error.message; job.nextRunAt = new Date(Date.now() + job.intervalMinutes * 60000).toISOString(); persist(); }
      }
    }
  } finally { busy = false; }
}
