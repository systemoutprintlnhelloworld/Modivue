import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { databasePath, listQualityRuns, saveQualityRun } from "./storage.mjs";
import { normalizeZtestReport, ztestReportId } from "./evaluator-ztest.mjs";

const origin = "https://ztest.ai", path = join(dirname(databasePath), "ztest-jobs.json");
const jobs = new Map(), browsers = new Map();
let initialized, writes = Promise.resolve(), catalog = { models: [], updatedAt: null, error: null }, polling = false;
const active = job => ["opening", "awaiting-verification", "submitting", "running", "polling-error", "submission-unknown"].includes(job?.status);
async function init() {
  initialized ||= (async () => {
    try {
      for (const job of JSON.parse(await readFile(path, "utf8"))) {
        if (["opening", "awaiting-verification"].includes(job.status)) job.status = "interrupted";
        if (job.status === "submitting") job.status = "submission-unknown";
        jobs.set(job.target.id, job);
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  })();
  return initialized;
}
function persist() {
  const text = JSON.stringify([...jobs.values()]);
  writes = writes.catch(() => {}).then(async () => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, text, { mode: 0o600 }); await rename(temporary, path);
  });
  return writes;
}
async function officialJson(route) {
  const response = await fetch(`${origin}${route}`, { redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Ztest HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== undefined && payload.code !== 0) throw new Error("Ztest 返回错误状态");
  return payload.data ?? payload;
}
export async function ztestState() {
  await init();
  if (!catalog.updatedAt || Date.now() - Date.parse(catalog.updatedAt) > 3600000) {
    try {
      const models = await officialJson("/api/models");
      if (!Array.isArray(models)) throw new Error("Invalid catalog");
      catalog = { models: models.filter(model => model.model_kind === "text"), updatedAt: new Date().toISOString(), error: null };
    } catch { catalog = { ...catalog, updatedAt: new Date().toISOString(), error: "Ztest 模型目录读取失败" }; }
  }
  return { ...catalog, jobs: [...jobs.values()] };
}
const modelKey = name => String(name || "").split("/").at(-1).toLowerCase().replaceAll(".", "-");
export async function startZtest(target, { profile = "standard", concurrency = "sequential" } = {}) {
  const state = await ztestState();
  if (active(jobs.get(target.id))) return jobs.get(target.id);
  if ([...jobs.values()].some(active)) throw new TypeError("另一个 Ztest 检测仍在进行");
  if (!["quick", "standard", "deep"].includes(profile) || !["sequential", "parallel", "fast"].includes(concurrency)) throw new TypeError("Ztest 检测设置无效");
  const model = state.models.find(model => [target.observedModel, target.canonicalModelId].some(name => modelKey(name) === modelKey(model.code)));
  if (!model) throw new TypeError("Ztest 官方目录暂未支持当前模型");
  if (!target.apiKey) throw new TypeError("当前渠道凭据不可用");
  const publicTarget = Object.fromEntries(["id", "protocol", "baseUrl", "keyGroup", "observedModel", "canonicalModelId", "reasoningEffort"].map(key => [key, target[key] ?? null]));
  const job = { target: publicTarget, profile, concurrency, status: "opening", startedAt: new Date().toISOString(), reportId: null, savedRunId: null, cancelRequested: false };
  jobs.set(target.id, job); await persist();
  void openOfficialBrowser(target, model, job).catch(async () => {
    job.status = job.cancelRequested ? (job.reportId ? "running" : job.status === "submitting" ? "submission-unknown" : "interrupted")
      : job.reportId ? "polling-error" : job.status === "submitting" ? "submission-unknown" : "error";
    job.message = job.reportId ? "浏览器已关闭，继续读取官方报告" : "Ztest 浏览器流程未完成；请确认已安装 Chrome 或 Edge，并在窗口内完成人机验证";
    await browsers.get(target.id)?.close().catch(() => {}); browsers.delete(target.id); await persist();
  });
  return job;
}
async function openOfficialBrowser(target, model, job) {
  if (job.cancelRequested) return;
  const { chromium } = await import("playwright-core");
  // Use the visible browser and the official Turnstile flow. Never forge,
  // solve or replay verification tokens, or change browser detection flags.
  const channels = process.platform === "win32" ? ["msedge", "chrome"] : ["chrome", "msedge"];
  let browser, launchError;
  for (const channel of channels) {
    try { browser = await chromium.launch({ channel, headless: false }); break; }
    catch (error) { launchError = error; }
  }
  if (!browser) throw new Error(`未找到可用的 Chrome/Edge 浏览器：${launchError?.message || "unknown"}`);
  if (job.cancelRequested) { await browser.close(); return; }
  browsers.set(target.id, browser);
  const context = await browser.newContext({ viewport: null }), page = await context.newPage();
  page.setDefaultTimeout(20000);
  browser.on("disconnected", () => {
    browsers.delete(target.id);
    if (["opening", "awaiting-verification"].includes(job.status)) job.status = "interrupted";
    if (job.status === "submitting") job.status = "submission-unknown";
    void persist();
  });
  // Only observe the official verification response; never log POST data.
  page.on("request", request => {
    if (request.url() === `${origin}/api/verify` && request.method() === "POST") { job.status = "submitting"; void persist(); }
  });
  page.on("response", async response => {
    if (response.url() !== `${origin}/api/verify` || response.request().method() !== "POST") return;
    try {
      const payload = await response.json(), data = payload.data ?? payload;
      if (!response.ok() || !data.report_id) throw new Error("Submission rejected");
      job.reportId = ztestReportId(data.report_id); job.status = "running"; job.message = null;
      await persist();
    } catch { job.status = "submission-unknown"; job.message = "Ztest 提交结果未确认，请检查浏览器中的提示；不会自动重复提交"; await persist(); }
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  if (job.cancelRequested) { await browser.close(); return; }
  // The public SPA has changed utility classes several times; anchor on the
  // stable field placeholders and fall back to the first form containing them
  // instead of depending on `detect-card`.
  let form = page.locator("form.detect-card");
  if (await form.count() === 0) form = page.locator("form").filter({ has: page.getByPlaceholder("https://api.example.com", { exact: true }) });
  if (await form.count() === 0) throw new Error("Ztest 官方页面未找到检测表单（页面结构可能已更新）");
  await form.getByPlaceholder("https://api.example.com", { exact: true }).fill(target.baseUrl);
  await form.getByPlaceholder("sk-...", { exact: true }).fill(target.apiKey);
  if (job.cancelRequested) { await browser.close(); return; }
  await form.getByText(model.code, { exact: true }).click();
  await form.getByRole("button", { name: { quick: "快速", standard: "标准", deep: "深测" }[job.profile], exact: true }).click();
  await form.getByRole("button", { name: { sequential: /顺序/, parallel: /并发/, fast: /高速/ }[job.concurrency] }).click();
  job.status = "awaiting-verification"; await persist();
  if (job.cancelRequested) { await browser.close(); return; }
  await form.getByRole("button", { name: /开始检测/ }).click();
}
export async function tickZtest() {
  if (polling) return;
  polling = true;
  try {
    await init();
    for (const job of jobs.values()) {
      if (!job.reportId || !["running", "polling-error"].includes(job.status)) continue;
      try {
        const report = await officialJson(`/api/reports/${encodeURIComponent(job.reportId)}`);
        job.completed = report.probe_results?.filter(probe => !["pending", "running"].includes(probe.status)).length || 0;
        job.total = report.probe_results?.length || null;
        if (report.status === "completed") {
          const run = { ...job.target, ...normalizeZtestReport(report, job.target) };
          run.metadata.automated = true; run.metadata.requestedReasoningEffort = job.target.reasoningEffort;
          run.metadata.conditionNotice = "Ztest 官方浏览器流程；官方接口不接受自定义推理档位，报告保留当前四元组关联和官方实际采样条件。";
          const prior = listQualityRuns({ hours: 0, baseUrl: job.target.baseUrl, keyGroup: job.target.keyGroup, model: job.target.observedModel })
            .find(row => row.evaluator_id === "ztest" && row.metadata?.reportId === job.reportId);
          job.savedRunId = prior?.id || Number(saveQualityRun(run).lastInsertRowid);
          job.status = "completed"; job.message = null;
          await browsers.get(job.target.id)?.close(); browsers.delete(job.target.id);
        } else if (["failed", "error", "cancelled"].includes(report.status)) {
          job.status = "error"; job.message = "Ztest 官方检测失败，请查看源报告";
        } else job.status = "running";
      } catch { job.status = "polling-error"; job.message = "Ztest 报告暂时不可用，将继续读取原报告"; }
    }
    if (jobs.size) await persist();
  } finally { polling = false; }
}
export async function closeZtest(targetId) {
  await init();
  const job = jobs.get(targetId); if (!job) throw new TypeError("没有正在进行的 Ztest");
  job.cancelRequested = true;
  job.status = job.reportId ? "running" : ["submitting", "submission-unknown"].includes(job.status) ? "submission-unknown" : "interrupted";
  await browsers.get(targetId)?.close(); browsers.delete(targetId); await persist();
  return job;
}
