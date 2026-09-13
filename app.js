import { aggregate, ttftGauge } from "./src/core/metrics.js";
import { fetchModelCatalog, matchModelName } from "./src/core/model-match.js";
import { summarizeVerification, verificationRunLabel } from "./src/core/quality-summary.js";
import { modelIdentity, modelIdentityParts, reasoningEffortOf } from "./src/core/model-identity.js";
import { isAgentWorking, normalizeAgentStatus } from "./src/core/agent-activity.js";
import { transitionIsland } from "./src/core/island-state.js";
import { liveIslandModels, workingIslandModels, islandDisplayModels } from "./src/core/island-display.js";
import { preferenceFields, preferenceDefaults } from "./src/core/preferences.js";
import { builtInQuestions, verificationReferences } from "./src/data/question-tests.js";
import { comparableAnswer } from "./src/core/answer-comparison.js";
import { hlwyPrompt, defaultShortPrompt } from "./src/core/hlwy-reference.js";
import { setLocale, currentLocale, translate } from "./src/core/i18n.js";
import { distributionArchive } from "./src/core/calibration-export.js";

const desktopMode = new URLSearchParams(location.search).get("desktop");
if (desktopMode) document.body.classList.add(`desktop-${desktopMode}`);

function desktopMessage(message) {
  if (globalThis.chrome?.webview) globalThis.chrome.webview.postMessage(message);
  else globalThis.webkit?.messageHandlers?.modivue?.postMessage(message);
}

const hasDesktopBridge = () => Boolean(globalThis.chrome?.webview || globalThis.webkit?.messageHandlers?.modivue);
const nativeRequests = new Map();
function desktopRequest(message) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => { nativeRequests.set(requestId, { resolve, reject }); desktopMessage({ ...message, requestId }); });
}
globalThis.modivueNativeReply = ({ requestId, error, ...result }) => {
  const pending = nativeRequests.get(requestId);
  if (!pending) return;
  nativeRequests.delete(requestId);
  if (error) pending.reject(new Error(error)); else pending.resolve(result);
};
async function exportText(filename, text, mime) {
  if (hasDesktopBridge()) {
    const result = await desktopRequest({ type: "export", filename, text });
    showToast(result.cancelled ? "已取消导出" : "文件已保存", result.cancelled ? "info" : "success");
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast("已开始下载", "success");
}

const colors = { mint: "#20d6b5", blue: "#4ba3ff", violet: "#b884ff", yellow: "#f3c969", red: "#ff7185" };
const defaultSettings = {
  ...preferenceDefaults,
  probeEnabled: true,
  probeIntervalMinutes: 1,
  verificationIntervalMinutes: 15,
  verificationRequestDelaySeconds: 2,
  questionIntervalSeconds: 60,
  probeDailyLimit: 256,
  verificationSamples: 50,
  probeMaxOutputTokens: 16,
  probeInstruction: "Reply with the word ok.",
  ttftThresholdMs: 2000,
  cacheThreshold: 0.2,
  qualityConsecutive: 2,
  defaultHours: 1,
  evaluatorId: "meow-fingerprint",
  meowTier: "screen",
  notifications: false,
  acknowledgedAt: null,
  tourSeen: false,
  defaultQuestionId: "candy-21"
};

const state = {
  models: [],
  agents: [],
  summaryGroups: [],
  selectedModelId: null,
  selectedSamples: [],
  qualityRuns: [],
  hiddenTrendSeries: new Set(),
  qualityReportId: null,
  evaluators: [],
  supportedAgents: [],
  events: [],
  logs: [],
  catalog: [],
  settings: { ...defaultSettings },
  probe: null,
  config: null,
  calibration: null,
  calibrationError: null,
  publicBaselines: null,
  view: "overview",
  rangeHours: 1,
  filters: { model: "", baseUrl: "", keyGroup: "", reasoningEffort: "" },
  logQuery: "",
  logStatus: "all",
  globalSearch: "",
  customizationTab: "monitoring",
  customizationQuery: "",
  questions: builtInQuestions.map(question => ({ ...question, builtIn: true })),
  questionError: null,
  refreshing: false,
  lastUpdatedAt: null,
  dataError: null,
  notifiedEventIds: new Set()
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[character]));
}

function identityId(value) {
  return modelIdentity(value);
}

function identityParts(value) {
  return modelIdentityParts(value);
}

function routeIdentity(value) {
  const parts = identityParts(value);
  return JSON.stringify(parts.slice(1));
}

function canonicalModelId(value) {
  return value.canonicalModelId ?? value.canonical_model_id ?? null;
}

function sameIdentity(record, model) {
  return identityId(record) === identityId(model);
}

function sameModelRoute(record, model) {
  const left = identityParts(record);
  const right = identityParts(model);
  return left.slice(0, 4).every((value, index) => value === right[index]);
}

function selectedModel() {
  return filteredModels().find((model) => model.id === state.selectedModelId) || null;
}

function matchesGlobalFilters(record) {
  const parts = identityParts(record);
  return Object.values(state.filters).every((value, index) => !value || value === JSON.stringify(parts[index]));
}

function filteredModels() { return state.models.filter(matchesGlobalFilters); }
function filteredEvents() { return state.events.filter(matchesGlobalFilters); }

function globalQuery() {
  const result = { hours: state.rangeHours };
  for (const [key, value] of Object.entries(state.filters)) {
    if (!value) continue;
    const decoded = JSON.parse(value);
    if (key === "model") result[state.catalog.some((model) => model.id === decoded) ? "canonicalModelId" : "model"] = decoded;
    else result[key] = decoded ?? "";
  }
  return result;
}

function renderGlobalFilters() {
  const fields = [["model", "全部模型"], ["baseUrl", "全部渠道"], ["keyGroup", "全部分组"], ["reasoningEffort", "全部档位"]];
  fields.forEach(([key, all], index) => {
    const select = $(`#filter-${key}`);
    const values = new Map(state.models.map((model) => {
      const raw = identityParts(model)[index];
      return [JSON.stringify(raw), key === "model" ? model.label : key === "baseUrl" ? endpointLabel(raw) : raw || "未指定"];
    }));
    if (state.filters[key] && !values.has(state.filters[key])) values.set(state.filters[key], JSON.parse(state.filters[key]) || "未指定");
    const markup = `<option value="">${all}</option>` + [...values].sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    if (select.innerHTML !== markup) select.innerHTML = markup;
    select.value = state.filters[key];
  });
  $("#filter-count").textContent = `${filteredModels().length} 个对象`;
  $("#clear-filters").disabled = !Object.values(state.filters).some(Boolean);
  $("#global-filters").hidden = state.view === "settings";
}

let searchResults = [];
let searchPage = 0;
let searchCloseAnimation;
const searchPageSize = () => Math.max(1, Math.min(6, Math.floor((innerHeight - 180) / 48)));
function reducedMotion() { return state.settings.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches; }
function animateContent(element) {
  if (element && !reducedMotion()) element.animate([{ opacity: .35, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" });
}
function openSearch() {
  searchCloseAnimation?.cancel();
  searchCloseAnimation = null;
  const dialog = $("#search-dialog");
  if (!dialog.open) { dialog.showModal(); animateContent(dialog); }
  document.body.classList.add("search-open");
  $("#global-search").focus({ preventScroll: true });
  applyGlobalSearch($("#global-search").value);
}
function closeSearch() {
  searchCloseAnimation?.cancel();
  const dialog = $("#search-dialog");
  const finish = () => { dialog.close(); document.body.classList.remove("search-open"); };
  if (dialog.open && !reducedMotion()) {
    searchCloseAnimation = dialog.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(4px)" }], { duration: 120, easing: "ease-in" });
    searchCloseAnimation.finished.then(finish, () => {});
  }
  else finish();
  $("#global-search").setAttribute("aria-expanded", "false");
}

function applyGlobalSearch(query, page = 0) {
  searchPage = page;
  state.globalSearch = query;
  const needle = query.trim().toLocaleLowerCase();
  const entries = [
    ...$$(".nav-item").map(item => ({ label: item.textContent.trim(), kind: "功能", view: item.dataset.view })),
    ...preferenceFields.map(field => ({ label: field.label, hint: `${field.hint || ""} ${field.key}`, kind: "设置", query: field.label })),
    ...["默认核验方案", "Meow 核验强度", "HLWY 每轮样本数", "当前测试题目", "核验请求间隔", "模型核验间隔", "每日探测上限", "探测指令", "TTFT 告警阈值", "Cache 告警阈值", "可信 API 回答对照", "核验校准档案", "单问题测试"]
      .map(label => ({ label, kind: "设置", query: label })),
    ...state.models.map(model => ({ label: model.label, hint: endpointLabel(model.endpoint), kind: "模型", modelId: model.id }))
  ];
  searchResults = needle ? entries.filter(entry => `${entry.label} ${translate(entry.label)} ${entry.hint || ""}`.toLocaleLowerCase().includes(needle)) : entries.filter(entry => entry.view);
  const size = searchPageSize();
  const pages = Math.max(1, Math.ceil(searchResults.length / size));
  searchPage = clamp(searchPage, 0, pages - 1);
  $("#search-page").textContent = `${searchPage + 1} / ${pages}`;
  $("#search-previous").disabled = searchPage === 0;
  $("#search-next").disabled = searchPage === pages - 1;
  const panel = $("#global-search-results");
  panel.innerHTML = searchResults.length ? searchResults.slice(searchPage * size, (searchPage + 1) * size).map((entry, index) => `<button type="button" data-search-result="${index + searchPage * size}"><span>${escapeHtml(entry.label)}</span><small>${entry.kind}</small></button>`).join("") : '<p>没有匹配的功能或设置</p>';
  panel.hidden = false;
  $("#global-search").setAttribute("aria-expanded", String($("#search-dialog").open));
}

async function openSearchResult(index) {
  const result = searchResults[index];
  if (!result) return;
  closeSearch(); $("#global-search").value = "";
  if (result.query) {
    state.customizationQuery = translate(result.query); setView("settings");
    $("#customization-search").focus();
  } else if (result.modelId) { await selectModelById(result.modelId); setView("overview"); }
  else setView(result.view);
}

let settingsSaveTimer;
let settingsSaveQueue = Promise.resolve();
let settingsSaving = false;
let settingsRevision = 0;
const pendingSettings = new Map();
function acceptSettings(settings, revision) {
  if (revision !== settingsRevision) return;
  state.settings = { ...defaultSettings, ...settings, ...Object.fromEntries([...pendingSettings].map(([key, entry]) => [key, entry.value])) };
}
const settingsDraft = new Map();
function settingsSaveStatus(message, tone = "info") {
  const status = $("#settings-save-status");
  if (status) { status.textContent = message; status.dataset.tone = tone; }
}

function scheduleSettingsSave(input) {
  if (!input.name || input.disabled || !input.closest("#settings-form, #customization-form")) return;
  settingsDraft.set(input.name, { value: input.type === "checkbox" ? input.checked
    : input.type === "number" || ["probeIntervalMinutes", "defaultHours"].includes(input.name) ? (input.value === "" ? null : Number(input.value)) : input.value,
    valid: input.checkValidity() && (input.type !== "number" || input.value !== "") });
  clearTimeout(settingsSaveTimer);
  settingsSaveStatus("有未保存的更改");
  settingsSaveTimer = setTimeout(() => void flushSettingsDraft(), 700);
}

async function persistSettingsPatch(patch) {
  const revision = ++settingsRevision;
  for (const [key, value] of Object.entries(patch)) pendingSettings.set(key, { value, revision });
  const save = async () => {
    settingsSaveStatus("正在自动保存…");
    if (patch.notifications) {
      const granted = hasDesktopBridge() ? (await desktopRequest({ type: "notification-permission" })).granted
        : "Notification" in window && (Notification.permission === "granted" || await Notification.requestPermission() === "granted");
      patch.notifications = Boolean(granted);
      if (!granted) showToast("系统通知未获授权，请在系统设置中允许 Modivue 通知", "warning");
    }
    const result = await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    for (const key of Object.keys(patch)) if (pendingSettings.get(key)?.revision === revision) pendingSettings.delete(key);
    settingsRevision++;
    state.settings = { ...defaultSettings, ...result.settings,
      ...Object.fromEntries([...pendingSettings].map(([key, entry]) => [key, entry.value])) };
    state.probe = result.probe || state.probe;
    if (["defaultQuestionId", "defaultHours"].some(key => Object.hasOwn(patch, key))) state.questionWindows = {};
    if (Object.hasOwn(patch, "defaultHours")) { state.rangeHours = state.settings.defaultHours; updateRangeControl(); }
    applyAppearance(); updateModels(state.summaryGroups); renderAll({ preserveSettings: true });
    for (const name of ["hlwySource", "notifications"]) {
      const input = $(`#view-content [name="${name}"]`);
      if (input && Object.hasOwn(patch, name) && !settingsDraft.has(name)) {
        if (input.type === "checkbox") input.checked = state.settings[name]; else input.value = state.settings[name];
      }
    }
    settingsSaveStatus(result.notice || "所有更改已保存", result.notice ? "warning" : "success");
    return result;
  };
  const request = settingsSaveQueue.then(save).catch(error => {
    for (const key of Object.keys(patch)) if (pendingSettings.get(key)?.revision === revision) pendingSettings.delete(key);
    throw error;
  });
  settingsSaveQueue = request.catch(() => {});
  return request;
}

async function flushSettingsDraft() {
  clearTimeout(settingsSaveTimer);
  if (settingsSaving || !settingsDraft.size) return;
  if ([...settingsDraft.values()].some(item => !item.valid)) { settingsSaveStatus("请检查输入范围；更改尚未保存", "error"); return; }
  const draft = new Map(settingsDraft);
  settingsSaving = true;
  const patch = Object.fromEntries([...draft].map(([name, item]) => name === "cacheThresholdPercent"
    ? ["cacheThreshold", item.value / 100] : [name, item.value]));
  try {
    const result = await persistSettingsPatch(patch);
    for (const [key, value] of draft) if (settingsDraft.get(key) === value) {
      settingsDraft.delete(key);
      const input = $(`#view-content [name="${key}"]`);
      const saved = key === "cacheThresholdPercent" ? state.settings.cacheThreshold * 100 : state.settings[key];
      if (input) { if (input.type === "checkbox") input.checked = saved; else input.value = saved; }
    }
    settingsSaveStatus(settingsDraft.size ? "有未保存的更改" : result.notice || "所有更改已保存", result.notice ? "warning" : "success");
    if (!settingsDraft.size) showToast(result.notice || "所有更改已保存", result.notice ? "warning" : "success");
  }
  catch (error) {
    settingsSaveStatus(`保存失败：${error.message}`, "error");
    showToast(`保存失败：${error.message}`, "error");
  } finally {
    settingsSaving = false;
    if ([...settingsDraft].some(([key, value]) => draft.get(key) !== value)) void flushSettingsDraft();
  }
}

async function selectModelById(id) {
  if (!state.models.some((model) => model.id === id)) return;
  if (!filteredModels().some((model) => model.id === id)) Object.keys(state.filters).forEach((key) => { state.filters[key] = ""; });
  state.selectedModelId = id;
  await loadSelectedSamples();
  renderAll();
}

function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && (value !== "" || key === "reasoningEffort")) query.set(key, String(value));
  });
  return query.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function formatRange(hours = state.rangeHours) {
  if (hours === 0) return "全部历史";
  if (hours === 1) return "最近 1 小时";
  if (hours < 24) return `最近 ${hours} 小时`;
  if (hours % 24 === 0) return `最近 ${hours / 24} 天`;
  return `最近 ${hours} 小时`;
}

function formatTimestamp(value, includeDate = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "--";
  return new Intl.DateTimeFormat(currentLocale(), includeDate
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "未提供";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)} s`;
}

function formatPercent(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "未提供";
}

function formatCost(value) {
  return Number.isFinite(value) ? `$${value.toFixed(6)}` : "待计费";
}

function formatInteger(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(currentLocale()) : "--";
}

function endpointLabel(value) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value || "未配置";
  }
}

function isModivueProxyEndpoint(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && url.pathname.startsWith("/proxy/");
  } catch { return false; }
}

function ttftScore(milliseconds) {
  const gauge = ttftGauge(milliseconds, state.settings.ttftThresholdMs);
  return gauge === null ? null : gauge * 100;
}

function samplesForModel(model) {
  if (!model) return [];
  if (model.id === state.selectedModelId && state.selectedSamples.length) return state.selectedSamples;
  return state.logs.filter((sample) => sameIdentity(sample, model));
}

function qualityRunsForModel(model) {
  if (!model) return [];
  return state.qualityRuns.filter((run) => sameModelRoute(run, model));
}

function inSelectedRange(timestamp) {
  return state.rangeHours === 0 || Date.parse(timestamp) >= Date.now() - state.rangeHours * 3600000;
}

function metricPointsForModel(model, metric, count = 80) {
  let rows;
  if (metric === "quality") {
    const method = model?.verification?.numeric?.method;
    const evaluatorId = method === "juice-direction" ? "juice" : method;
    const latest = model?.verification?.measurement;
    const field = method === "hlwy-fingerprint" ? "value" : method === "meow-fingerprint" ? "declaredMatch" : method === "juice-direction" ? "directionScore" : method === "juice" ? "reportedJuice" : "jsd";
    rows = method === "custom-question" ? model.verification.question.points : qualityRunsForModel(model).filter((run) => inSelectedRange(run.timestamp) && run.status === "ok" && run.evaluator_id === evaluatorId
      && run.evaluator_version === latest?.evaluator_version
      && run.metadata?.conditionsId === latest?.metadata?.conditionsId && Number.isFinite(run.metadata?.[field]))
      .map((run) => ({ timestamp: run.timestamp, value: run.metadata[field] }));
  } else {
    rows = samplesForModel(model).map((sample) => {
      if (sample.status !== "ok") return null;
      if (metric === "cache") return sample.cache_hit_rate == null ? null : { timestamp: sample.timestamp, value: Number(sample.cache_hit_rate) * 100 };
      if (metric === "ttft") return sample.ttft_ms == null ? null : { timestamp: sample.timestamp, value: ttftScore(Number(sample.ttft_ms)) };
      if (metric === "ttftRaw") return sample.ttft_ms == null ? null : { timestamp: sample.timestamp, value: Number(sample.ttft_ms) };
      if (metric === "duration") {
        const duration = sample.total_duration_ms ?? sample.measurement?.durationMs;
        return duration == null ? null : { timestamp: sample.timestamp, value: Number(duration) };
      }
      return null;
    }).filter(Boolean);
  }
  const ordered = rows.filter((point) => Number.isFinite(point.value) && Number.isFinite(Date.parse(point.timestamp)))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  if (ordered.length <= count) return ordered;
  // Cover the whole selected interval instead of silently showing only its tail.
  return Array.from({ length: count }, (_, index) => ordered[Math.round(index * (ordered.length - 1) / (count - 1))]);
}

function metricPoints(metric, count = 80) {
  return metricPointsForModel(selectedModel(), metric, count);
}

function qualityValue(model) {
  const activity = verificationActivity(model);
  if (activity.busy) return activity.label;
  const numeric = model?.verification?.numeric;
  if (model?.verification?.question?.compared) return `${model.verification.question.matched}/${model.verification.question.compared}`;
  return numeric ? `${numeric.value.toFixed(numeric.method === "custom-question" ? 0 : ["juice", "juice-direction"].includes(numeric.method) ? 1 : 2)}${numeric.unit}` : activity.label;
}

function verificationActivity(model) {
  const job = state.probe?.verification?.find(job => job.targetId === model?.id && job.evaluatorId === state.settings.evaluatorId);
  const target = state.probe?.targets?.find(target => target.id === model?.id);
  if (job && job.phase !== "queued") {
    const label = job.phase === "retrying" ? "重试等待中" : "正在核验";
    const count = `${job.completed || 0} / ${job.total || "--"} 个有效样本`;
    const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(job.startedAt)) / 1000));
    return { busy: true, label, detail: `${count} · 已用 ${elapsed} 秒 · ${job.phase === "retrying" ? "请求未完成，按退避间隔重试" : job.phase === "spacing" ? "等待下一次采样" : "正在等待模型回答"}`, job };
  }
  if (job) return { busy: true, label: "已排队", detail: target?.pauseReason || "等待当前核验结束", job };
  if (target?.pauseReason) return { busy: false, label: "等待空闲", detail: target.pauseReason, target };
  if (!model?.sessions?.length) return { busy: false, label: "未核验", detail: "当前没有运行会话" };
  if (!target) return { busy: false, label: "接入待完善", detail: model.sessions.find(session => session.error)?.error || "当前模型或渠道凭据尚未确定", target };
  if (!state.probe?.enabled) return { busy: false, label: "自动核验关闭", detail: "可以手动核验当前会话", target };
  const lastRun = model?.verification?.selected;
  const detail = lastRun?.status === "unsupported" ? lastRun.rationale
    : state.probe.nextRunAt ? `下次检查 ${formatTimestamp(state.probe.nextRunAt, true)}` : "等待调度";
  return { busy: false, label: lastRun ? model.verification.label : "等待调度", detail, target };
}

function verificationStatusMarkup(model) {
  const activity = verificationActivity(model);
  const job = activity.job;
  return `<div class="verification-status" role="status" aria-live="polite" data-phase="${escapeHtml(job?.phase || "waiting")}"><span class="${job && job.phase !== "queued" ? "spin" : ""}" aria-hidden="true">${job ? "↻" : "◷"}</span><div><strong>${escapeHtml(activity.label)}</strong><small>${escapeHtml(activity.detail)}</small>${job?.total ? `<progress max="${job.total}" value="${job.completed || 0}" aria-label="核验有效样本进度"></progress>` : ""}</div></div>`;
}

function verificationPercent(model) {
  const numeric = model?.verification?.numeric;
  return numeric?.unit === "%" ? numeric.value : null;
}

function metricHealth(metric, value) {
  if (!Number.isFinite(value)) return { label: "未测量", color: "var(--subtle)" };
  const score = metric === "ttft" ? ttftScore(value) : value;
  const bands = [[0, "偏低", state.settings[`${metric}LowColor`]],
    [state.settings[`${metric}WarningScore`], "一般", state.settings[`${metric}MiddleColor`]],
    [state.settings[`${metric}GoodScore`], "良好", state.settings[`${metric}HighColor`]]];
  const bounded = clamp(score, 0, 100);
  let lower = bands[0], upper = bands.at(-1);
  for (let index = 1; index < bands.length; index++) {
    if (bounded <= bands[index][0]) { lower = bands[index - 1]; upper = bands[index]; break; }
  }
  const ratio = upper[0] === lower[0] ? 1 : clamp((bounded - lower[0]) / (upper[0] - lower[0]), 0, 1);
  const channel = (from, to) => Math.round(parseInt(from, 16) + (parseInt(to, 16) - parseInt(from, 16)) * ratio).toString(16).padStart(2, "0");
  const color = `#${channel(lower[2].slice(1, 3), upper[2].slice(1, 3))}${channel(lower[2].slice(3, 5), upper[2].slice(3, 5))}${channel(lower[2].slice(5, 7), upper[2].slice(5, 7))}`;
  const label = [...bands].reverse().find(([threshold]) => bounded >= threshold)?.[1] || "极差";
  return { label, color };
}

function verificationScore(model) {
  const numeric = model?.verification?.numeric;
  if (!numeric || !Number.isFinite(numeric.value)) return null;
  if (numeric.method === "custom-question") return model.verification.question.ratio * 100;
  if (numeric.unit === "%") return numeric.value;
  if (numeric.method === "probability-probe") return (1 - clamp(numeric.value, 0, 1)) * 100;
  return null;
}

function verificationHealth(model) {
  const verification = model?.verification;
  const score = verificationScore(model);
  if (score === null) return { label: verification?.label || "待核验", color: "var(--subtle)" };
  const threshold = verification?.measurement?.metadata?.candidateDistribution?.find((row) => row.model === verification.measurement.metadata.claimedModel)?.threshold;
  // Meow calibrates a model-specific strong-direction threshold, not an IQ scale.
  const adjusted = verification.numeric.method === "meow-fingerprint" && Number.isFinite(threshold) && threshold > 0
    ? score / threshold * 90 : score;
  return metricHealth("quality", adjusted);
}

function qualityChartOptions(model) {
  const numeric = model?.verification?.numeric;
  return { minimum: 0, maximum: numeric?.unit === "%" ? 100
    : numeric?.method === "custom-question" ? Math.max(1, numeric.value) : numeric?.method === "juice" ? Math.max(1, model.qualityStats?.max || numeric.value) * 1.1 : 1,
    tickLabel: (value) => `${value.toFixed(["juice", "juice-direction", "custom-question"].includes(numeric?.method) ? 0 : 2)}${numeric?.unit || ""}`,
    label: `${numeric?.label || "模型核验"}历史` };
}

function chartSvg(lines, options = {}) {
  const width = options.width || 640;
  const height = options.height || 195;
  const compact = Boolean(options.compact);
  const pad = compact ? { top: 3, right: 3, bottom: 3, left: 3 } : options.axes
    ? { top: 26, right: 62, bottom: 26, left: options.axes.filter((axis) => axis.side !== "right").length > 1 ? 112 : 54 }
    : { top: 10, right: 13, bottom: 24, left: 38 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const allPoints = lines.flatMap((line) => line.points || []);
  if (!allPoints.length) return "";
  const timestamps = allPoints.map((point) => Date.parse(point.timestamp)).filter(Number.isFinite);
  const timeStart = Math.min(...timestamps);
  const timeEnd = Math.max(...timestamps);
  const values = allPoints.map((point) => point.value);
  const minimum = Number.isFinite(options.minimum) ? options.minimum : 0;
  const maximum = Number.isFinite(options.maximum) ? options.maximum : Math.max(100, ...values);
  const axes = options.axes || [{ minimum, maximum, tickLabel: options.tickLabel || ((value) => String(Math.round(value))) }];
  const x = (point, index, length) => timeEnd > timeStart
    ? pad.left + (Date.parse(point.timestamp) - timeStart) / (timeEnd - timeStart) * innerWidth
    : pad.left + (length === 1 ? innerWidth / 2 : index / (length - 1) * innerWidth);
  const y = (value, axis = axes[0]) => pad.top + (1 - (clamp(value, axis.minimum, axis.maximum) - axis.minimum) / Math.max(Number.EPSILON, axis.maximum - axis.minimum)) * innerHeight;
  let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(options.label || "指标趋势图")}">`;
  if (!compact) {
    let leftAxis = 0;
    axes.forEach((axis, axisIndex) => {
      const right = axis.side === "right";
      const labelX = options.axes ? right ? width - pad.right + 8 : pad.left - 8 - leftAxis++ * 58 : 2;
      const anchor = options.axes && !right ? "end" : "start";
      if (axis.label) svg += `<text class="chart-axis-title" text-anchor="${anchor}" x="${labelX}" y="11">${escapeHtml(axis.label)}</text>`;
      for (let index = 0; index <= 4; index += 1) {
        const tick = axis.minimum + (axis.maximum - axis.minimum) * index / 4;
        if (!axisIndex) svg += `<line class="trend-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick, axis)}" y2="${y(tick, axis)}"/>`;
        svg += `<text class="chart-label" text-anchor="${anchor}" x="${labelX}" y="${y(tick, axis) + 3}">${escapeHtml(axis.tickLabel(tick))}</text>`;
      }
    });
    const labelCount = timeEnd > timeStart ? 4 : 1;
    for (let index = 0; index < labelCount; index += 1) {
      const stamp = labelCount === 1 ? timeStart : timeStart + (timeEnd - timeStart) * index / (labelCount - 1);
      const anchor = index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle";
      svg += `<text class="chart-label" text-anchor="${anchor}" x="${pad.left + (labelCount === 1 ? 0 : innerWidth * index / (labelCount - 1))}" y="${height - 4}">${formatTimestamp(new Date(stamp).toISOString())}</text>`;
    }
  }
  lines.forEach(({ points, color, area, axisIndex = 0, name = "" }) => {
    if (!points?.length) return;
    const axis = axes[axisIndex];
    const coordinates = points.map((point, index) => `${x(point, index, points.length)},${y(point.value, axis)}`).join(" ");
    if (area && points.length > 1) {
      const firstX = x(points[0], 0, points.length);
      const lastX = x(points.at(-1), points.length - 1, points.length);
      svg += `<polygon class="chart-area" fill="${color}" points="${firstX},${height - pad.bottom} ${coordinates} ${lastX},${height - pad.bottom}"/>`;
    }
    if (points.length > 1) svg += `<polyline class="chart-line" data-series="${escapeHtml(name)}" data-axis="${axisIndex}" stroke="${color}" points="${coordinates}"/>`;
    svg += points.map((point, pointIndex) => {
      const px = x(point, pointIndex, points.length), py = y(point.value, axis);
      const value = `${name ? name + " · " : ""}${axis.tickLabel(point.value)}`, stamp = formatTimestamp(point.timestamp, true);
      if (compact) return `<circle class="chart-point" cx="${px}" cy="${py}" r="2" fill="${color}"><title>${escapeHtml(`${stamp} · ${value}`)}</title></circle>`;
      const labelWidth = Math.min(innerWidth, Math.max(120, value.length * 7 + 16));
      const labelX = clamp(px - labelWidth / 2, pad.left, width - pad.right - labelWidth), labelY = py < 48 ? py + 12 : py - 38;
      return `<g class="chart-sample" tabindex="0" aria-label="${escapeHtml(`${stamp} · ${value}`)}"><circle class="chart-hit" cx="${px}" cy="${py}" r="10"/><circle class="chart-point" cx="${px}" cy="${py}" r="3" fill="${color}"/><g class="chart-value-label" transform="translate(${labelX} ${labelY})"><rect width="${labelWidth}" height="32" rx="4"/><text x="8" y="12">${escapeHtml(stamp)}</text><text class="chart-value-number" x="8" y="25">${escapeHtml(value)}</text></g></g>`;
    }).join("");
  });
  return `${svg}</svg>`;
}

function showToast(message, tone = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function setLiveStatus(text, tone = "ready") {
  const element = $("#live-status");
  element.dataset.tone = tone;
  element.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(text)}</span>`;
}

function updateRangeControl() {
  const select = $("#range-select");
  const value = String(state.rangeHours);
  if (!select.querySelector(`option[value="${CSS.escape(value)}"]`)) select.add(new Option(formatRange(state.rangeHours), value));
  select.value = value;
}

function applyQualityRuns() {
  state.models.forEach((model) => {
    const runs = qualityRunsForModel(model);
    model.verification = summarizeVerification(runs, state.settings.evaluatorId, { question: state.questions.find(item => item.id === state.settings.defaultQuestionId), target: model,
      questionSummary: state.questionWindows?.[modelIdentity(model)],
      since: state.rangeHours ? Date.now() - state.rangeHours * 3600000 : 0 });
    const scores = metricPointsForModel(model, "quality", Infinity).map((point) => point.value);
    model.quality = model.verification.numeric?.value ?? null;
    model.qualityStats = scores.length ? { count: scores.length, min: Math.min(...scores), max: Math.max(...scores) } : {};
    model.evaluator = model.verification.numeric?.label || "模型核验";
  });
}

function updateModels(groups) {
  const previousId = state.selectedModelId;
  const previousModel = selectedModel();
  const models = new Map();
  groups.forEach((group) => {
    const match = matchModelName(group.observedModel, state.catalog, { provider: group.protocol });
    const model = {
      id: identityId(group), observedModel: group.observedModel, canonicalModelId: group.canonicalModelId || null,
      reasoningEffort: reasoningEffortOf(group),
      source: group.source || null, conditionsId: group.conditionsId || null, keyGroup: group.keyGroup, label: group.observedModel,
      provider: group.protocol, endpoint: group.baseUrl, sampleCount: Number(group.sampleCount || 0), totalCount: Number(group.totalCount || 0),
      errorCount: Number(group.errorCount || 0), cacheRate: group.reportedCacheHitRate == null ? null : Number(group.reportedCacheHitRate),
      cacheStatus: group.cacheStatus || "unavailable", cacheCoverage: Number(group.cacheCoverage || 0), cacheStats: group.cache || {},
      ttftMs: group.ttftMs == null ? null : Number(group.ttftMs), ttftStats: group.ttft || {}, rangeStart: group.rangeStart, rangeEnd: group.rangeEnd,
      durationMs: group.durationMs == null ? null : Number(group.durationMs), durationStats: group.duration || {},
      costUsd: group.costUsd == null ? null : Number(group.costUsd), costSampleCount: Number(group.costSampleCount || 0),
      matchCount: Number(group.totalCount || group.sampleCount || 0),
      observationSource: group.source === "codex-rollout" ? "passive" : "proxy",
      match, standardLabel: match.model?.label || match.candidate?.label || "未归一化", status: group.errorCount > 0 ? "attention" : "online",
      color: group.protocol === "anthropic" ? "mint" : "blue", quality: null, qualityStats: {}, evaluator: null,
      configured: false, agents: [], sessions: []
    };
    models.set(model.id, model);
  });
  // Keep every currently discovered top-level session in the normal rail.
  // Activity only gates compact visibility and paid probes; an idle session
  // is still useful context when the user expands the island.
  state.agents.filter((agent) => agent?.sessionId && !agent.parentSessionId).forEach((agent) => {
    if (!agent.sessionId || agent.parentSessionId || !agent.model || !agent.protocol) return;
    const match = matchModelName(agent.model, state.catalog, { provider: agent.protocol });
    const matchedCanonicalId = match.status === "matched" ? match.model.id : null;
    const identity = { protocol: agent.protocol, baseUrl: agent.baseUrl, keyGroup: agent.keyGroup,
      observedModel: agent.model, canonicalModelId: matchedCanonicalId, reasoningEffort: reasoningEffortOf(agent) };
    const id = identityId(identity);
    const existing = [...models.values()].find((model) => routeIdentity(model) === routeIdentity(identity)
      && (model.canonicalModelId && identity.canonicalModelId ? model.canonicalModelId === identity.canonicalModelId : model.observedModel === agent.model));
    if (existing) {
      existing.configured = true;
      existing.agents = [...new Set([...existing.agents, agent.label || agent.id])];
      if (agent.sessionId) existing.sessions.push(agent);
      const passive = agent.passiveMetrics;
      if (passive && Number.isFinite(passive.cacheHitRate)
        && (!Number.isFinite(existing.passiveObservedAt)
          || Date.parse(passive.observedAt || "") > existing.passiveObservedAt
          || existing.cacheRate == null || existing.observationSource === "direct")) {
        existing.cacheRate = passive.cacheHitRate;
        existing.cacheStatus = "available";
        existing.cacheCoverage = 1;
        if (!existing.cacheStats?.count) existing.cacheStats = { count: 1, min: passive.cacheHitRate, max: passive.cacheHitRate };
        existing.passiveMetrics = passive;
        existing.passiveObservedAt = Date.parse(passive.observedAt || "") || Date.now();
        existing.cacheSource = "codex-rollout";
        if (existing.observationSource === "direct") existing.observationSource = "passive";
      }
      return;
    }
    const passive = agent.passiveMetrics;
    const passiveCache = Number.isFinite(passive?.cacheHitRate) ? passive.cacheHitRate : null;
    models.set(id, {
      id, observedModel: agent.model, canonicalModelId: matchedCanonicalId, source: null, conditionsId: null,
      reasoningEffort: reasoningEffortOf(agent),
      keyGroup: agent.keyGroup, label: agent.model, provider: agent.protocol,
      endpoint: agent.baseUrl, sampleCount: 0, totalCount: 0, errorCount: 0, cacheRate: passiveCache,
      cacheStatus: passiveCache == null ? "unavailable" : "available", cacheCoverage: passiveCache == null ? 0 : 1,
      cacheStats: passiveCache == null ? {} : { count: 1, min: passiveCache, max: passiveCache }, ttftMs: null, ttftStats: {},
      durationMs: null, durationStats: {}, costUsd: null, costSampleCount: 0,
      matchCount: 0,
      observationSource: agent.proxyBaseUrl || isModivueProxyEndpoint(agent.baseUrl) ? "proxy" : passiveCache == null ? "direct" : "passive",
      rangeStart: null, rangeEnd: null, match, standardLabel: match.model?.label || match.candidate?.label || "未归一化",
      status: "unsampled", color: agent.protocol === "anthropic" ? "mint" : "blue", quality: null,
      qualityStats: {}, evaluator: null, configured: true, agents: [agent.label || agent.id], sessions: agent.sessionId ? [agent] : [], passiveMetrics: passive,
      passiveObservedAt: Date.parse(passive?.observedAt || "") || null, cacheSource: passiveCache == null ? null : "codex-rollout"
    });
  });
  state.models = [...models.values()];
  const visible = filteredModels();
  state.selectedModelId = (visible.find((model) => model.id === previousId)
    || (previousModel && visible.find((model) => sameModelRoute(model, previousModel)))
    || visible.find((model) => model.sessions.length)
    || visible[0])?.id || null;
  applyQualityRuns();
}

// Resolve the model brand before considering the transport protocol.
function modelIconSlug(model) {
  const value = `${model?.canonicalModelId || ""} ${model?.observedModel || ""}`.toLowerCase();
  if (/claude|anthropic/.test(value)) return "claude";
  if (/gpt|codex|openai/.test(value)) return "openai";
  if (/gemini|gemma|google/.test(value)) return "gemini";
  if (/deepseek/.test(value)) return "deepseek";
  if (/qwen|通义|千问/.test(value)) return "qwen";
  if (/llama|meta/.test(value)) return "meta";
  if (/grok|xai/.test(value)) return "grok";
  if (/kimi|moonshot/.test(value)) return "moonshot";
  return null;
}

function modelLogo(model, className = "") {
  const slug = modelIconSlug(model);
  if (!slug) return '<span class="model-logo-fallback" aria-hidden="true">◉</span>';
  const value = `${model?.canonicalModelId || ""} ${model?.observedModel || ""}`.toLowerCase();
  const localSlug = /codex/.test(value) ? "codex" : slug;
  return `<img class="model-logo ${className}" src="/src/data/agent-icons/${localSlug}.svg" alt="" decoding="async">`;
}

function providerGlyph(model) { return modelLogo(model); }

function qualityRingStats(model) {
  if (model?.verification?.question) {
    const values = model.verification.question.points.map(point => point.ratio);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : {};
  }
  const stats = model?.qualityStats;
  if (!stats || !Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return { min: null, max: null };
  if (model?.verification?.numeric?.method === "probability-probe") return { min: (1 - stats.max) * 100, max: (1 - stats.min) * 100 };
  return stats;
}

function metricRange(model, metric) {
  const stats = metric === "quality" ? model?.qualityStats : metric === "cache" ? model?.cacheStats : model?.ttftStats;
  if (!Number.isFinite(stats?.min) || !Number.isFinite(stats?.max)) return metric === "quality" ? "未评测" : "未提供";
  if (metric === "cache") return `${formatPercent(stats.min)}–${formatPercent(stats.max)}`;
  if (metric === "ttft") return `${formatDuration(stats.min)}–${formatDuration(stats.max)}`;
  const digits = ["juice", "juice-direction", "custom-question"].includes(model.verification?.numeric?.method) ? 0 : 2;
  return `${stats.min.toFixed(digits)}–${stats.max.toFixed(digits)}${model.verification?.numeric?.unit || ""}`;
}

function compactMetric(label, displayValue, range) {
  return `<span class="island-compact-stat"><b>${label}</b><em>${escapeHtml(displayValue)}</em><small>${escapeHtml(range)}</small></span>`;
}

function compactMeter(label, value, color, displayValue, range) {
  const width = Number.isFinite(value) ? clamp(value, 0, 100) : 0;
  return `<span class="island-stat"><b>${label}</b><span class="island-bar"><i style="--meter:${width}%;--meter-color:${color}"></i></span><em>${escapeHtml(displayValue)}</em><small>${escapeHtml(range)}</small></span>`;
}

function ringProgress(value) {
  return Number.isFinite(value) ? clamp(value, 0, 100) : 0;
}

function ringPoint(radius, percent) {
  const angle = (ringProgress(percent) / 100 * 360 - 90) * Math.PI / 180;
  return { x: 30 + radius * Math.cos(angle), y: 30 + radius * Math.sin(angle) };
}

function metricSymbol(kind) {
  const paths = {
    // Lucide sparkles 0.468.0, ISC (agent-icons/LUCIDE-LICENSE).
    quality: '<path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z"/><path d="m19 14-.75 2.25L16 17l2.25.75L19 20l.75-2.25L22 17l-2.25-.75L19 14Z"/><path d="m5 3-.5 1.5L3 5l1.5.5L5 7l.5-1.5L7 5l-1.5-.5L5 3Z"/>',
    cache: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    ttft: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.quality}</svg>`;
}

function metricRing(radius, progress, color, label, value, range, minimum, maximum, kind = "quality") {
  const end = ringPoint(radius, progress);
  const marker = (percent, name, kind) => {
    const p = ringPoint(radius, percent);
    return `<circle class="ring-extreme" data-extreme="${kind}" cx="${p.x}" cy="${p.y}" r="1.2" visibility="${Number.isFinite(percent) ? "visible" : "hidden"}"><title>${escapeHtml(name)} · ${escapeHtml(range)}</title></circle>`;
  };
  const low = ringPoint(radius, minimum);
  return `<g class="ring-metric" style="--ring-color:${color}" tabindex="0" aria-label="${escapeHtml(`${label} ${value}，范围 ${range}`)}">
    <title>${escapeHtml(`${label} ${value} · ${range}`)}</title><circle class="ring-track" cx="30" cy="30" r="${radius}"/>
    <circle class="ring-peak" cx="30" cy="30" r="${radius}" pathLength="100" visibility="${maximum > 0 ? "visible" : "hidden"}" stroke-dasharray="${ringProgress(maximum)} 100" transform="rotate(-90 30 30)"/>
    <circle class="ring-value" cx="30" cy="30" r="${radius}" pathLength="100" opacity="${Number.isFinite(progress) ? 1 : 0}" stroke-dasharray="${ringProgress(progress)} 100" transform="rotate(-90 30 30)"/>
    ${marker(minimum, "最小值", "min")}${marker(maximum, "最大值", "max")}
    <g class="ring-min-icon" transform="translate(${low.x} ${low.y})" visibility="${Number.isFinite(minimum) ? "visible" : "hidden"}"><title>最小值 · ${escapeHtml(range)}</title><circle r="3.1"/><g transform="translate(-2.4 -2.4) scale(.2)">${metricSymbol(kind).replace('<svg ', '<svg width="24" height="24" ')}</g></g>
    <g class="ring-end-label" transform="translate(${clamp(end.x, 18, 42)} ${clamp(end.y, 8, 52)})"><rect x="-18" y="-6" width="36" height="12" rx="3"/><text text-anchor="middle" dominant-baseline="central">${Number.isFinite(progress) ? escapeHtml(value) : "--"}</text></g></g>`;
}

function sessionLabel(model) {
  const runtime = model.sessions?.length || 0;
  if (runtime) return `${runtime} Agent${runtime > 1 ? "s" : ""}`;
  return model.configured ? "已配置" : "已观测";
}

function agentTag(session) {
  const rawStatus = normalizeAgentStatus(session);
  const status = rawStatus === "active" ? "working" : rawStatus;
  const labels = { working: "工作中", running: "运行中", planning: "规划中", tool: "调用工具", waiting: "等待中", idle: "待命", blocked: "待处理", done: "已完成", error: "出错" };
  const known = Object.hasOwn(labels, status) ? status : "unknown";
  const slug = { codex: "codex", "claude-code": "claude-code", "gemini-cli": "gemini", "qwen-code": "qwen", opencode: "opencode",
    pi: "pi", goose: "goose", cline: "cline", "grok-build": "grok", openclaw: "openclaw", "cursor-agent": "cursor",
    windsurf: "windsurf", "github-copilot": "copilot", trae: "trae" }[session.host || session.id] || "terminal";
  const label = `${session.label || session.host} · ${labels[known] || "状态待同步"}`;
  const hostLabel = session.host === "claude-code" ? "Claude Code" : session.host === "codex" ? "Codex" : (session.label || session.host || "Agent").split(/\s+/)[0];
  return `<b class="agent-tag" role="img" data-agent-host="${escapeHtml(slug)}" data-status="${known}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><img class="agent-icon" src="/src/data/agent-icons/${slug}.svg" alt=""><small>${escapeHtml(hostLabel)}</small><span class="agent-status-text">${escapeHtml(session.source === "process" && known === "running" && session.statusSource !== "herdr" ? "已打开" : labels[known] || "状态待同步")}</span></b>`;
}

function agentStatusLabel(session) {
  const rawStatus = normalizeAgentStatus(session);
  const status = rawStatus === "active" ? "working" : rawStatus;
  return { working: "工作中", running: "运行中", planning: "规划中", tool: "调用工具", waiting: "等待中", idle: "待命", blocked: "待处理", done: "已完成", error: "出错" }[status] || "状态待同步";
}

function sessionsForModel(model) {
  if (model?.sessions?.length) return model.sessions;
  return state.agents.filter((agent) => agent?.sessionId && sameModelRoute(agent, model));
}

let lastIslandModel = null;
let lastIslandActiveAt = Date.now();
function islandModels() {
  return liveIslandModels(state.models);
}

function syncIslandActivity() {
  const models = islandModels();
  const working = workingIslandModels(models);
  const mostRecent = [...working].sort((a, b) =>
    Math.max(...b.sessions.map((s) => Date.parse(s.lastActiveAt || s.lastSeenAt) || 0))
    - Math.max(...a.sessions.map((s) => Date.parse(s.lastActiveAt || s.lastSeenAt) || 0)))[0];
  if (mostRecent) {
    lastIslandModel = mostRecent;
    lastIslandActiveAt = working.length ? Date.now()
      : Math.max(...mostRecent.sessions.map((s) => Date.parse(s.idleSince || s.lastActiveAt || s.lastSeenAt) || 0));
  }
  // Keep the island visible with an explicit waiting state when every agent
  // is idle; never resurrect a stale model from a previous session.
  const autoHidden = false;
  document.body.classList.toggle("island-hidden", autoHidden);
  if (desktopMode === "island") desktopMessage({ type: "island-visibility", visible: true });
  return { models, working };
}

function renderModelSelectors() {
  const selected = selectedModel();
  const strip = $("#model-strip");
  const visible = filteredModels();
  strip.innerHTML = visible.length ? visible.map((model, index) => `
    <button class="model-chip ${model.id === selected?.id ? "active" : ""}" data-model-index="${index}" data-model-id="${escapeHtml(model.id)}" aria-pressed="${model.id === selected?.id}">
      <span class="provider-orb ${model.color}">${providerGlyph(model)}</span>
      <span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.reasoningEffort || "档位未指定")} · ${escapeHtml(endpointLabel(model.endpoint))} · ${escapeHtml(model.keyGroup || "无分组")}</small></span>
    </button>`).join("") : `<div class="empty-state wide">当前筛选下没有模型</div>`;
  const islandModelsContainer = $("#island-models");
  const { models: liveModels, working } = syncIslandActivity();
  if (islandState.mode === "focus" && !liveModels.some((model) => model.id === islandState.modelId)) {
    enterIslandState({ type: "removed", modelId: islandState.modelId });
    return;
  }
  // Retain each session's node and slot across hover transitions. Compact
  // visibility does not remove idle sessions from the attended rail.
  const maxAgents = Math.max(1, Number(state.settings.islandMaxAgents) || 5);
  const visibleIslandModels = liveModels;
  const normalHeight = Math.min(Math.max(1, Math.min(liveModels.length || 1, maxAgents)) * 79, Math.max(180, (screen.availHeight || 900) - 180));
  const stage = $(".island-stage");
  stage.style.setProperty("--island-visible-height", `${normalHeight}px`);
  stage.style.setProperty("--island-list-height", `${normalHeight}px`);
  $("#quick-island").style.setProperty("--island-visible-height", `${normalHeight}px`);
  $("#quick-island").style.setProperty("--island-envelope-height", `${Math.max(230, normalHeight) + 90}px`);
  stage.dataset.overflow = String(liveModels.length > maxAgents);
  stage.dataset.visibleCount = String(Math.min(liveModels.length || 1, maxAgents));
  const islandMarkup = visibleIslandModels.length ? visibleIslandModels.map((model, index) => {
    const qualityDisplay = qualityValue(model);
    const cacheDisplay = formatPercent(model.cacheRate);
    const ttftDisplay = formatDuration(model.ttftMs);
    const compactVisible = working.some((item) => item.id === model.id);
    const selectedMetric = state.settings[islandState.mode === "compact" ? "compactMetric" : "normalMetric"];
    const metric = modelMetrics(model).find(metric => metric.kind === selectedMetric) || modelMetrics(model)[0];
    return `<button class="island-model ${model.id === selected?.id ? "active" : ""} ${compactVisible ? "compact-visible" : ""}" data-model-index="${index}" data-island-model aria-label="${escapeHtml(model.label)}：核验 ${qualityDisplay}，Cache ${cacheDisplay}，TTFT ${ttftDisplay}" aria-pressed="${model.id === selected?.id}">
      <span class="metric-rings">
        <svg class="ring-svg" viewBox="0 0 60 60" style="visibility:${selectedMetric === "none" ? "hidden" : "visible"}">
          ${metricRing(27, metric.progress, metric.health.color, metric.name, metric.value, metric.range, metric.min, metric.max, metric.kind)}
        </svg>
        <b class="island-model-logo" title="${escapeHtml(model.standardLabel || model.label)}">${modelLogo(model)}</b>
      </span>
    </button>`;
  }).join("") : "";
  if (islandModelsContainer.dataset.markup !== islandMarkup) {
    const template = document.createElement("template");
    template.innerHTML = islandMarkup;
    const oldNodes = new Map([...islandModelsContainer.children].map((node) => [node.dataset.identity, node]));
    [...template.content.children].forEach((next, index) => {
      const identity = visibleIslandModels[index]?.id;
      const current = identity && oldNodes.get(identity);
      next.dataset.identity = identity || "empty";
      if (!current) islandModelsContainer.append(next);
      else {
        current.className = next.className;
        current.dataset.modelIndex = next.dataset.modelIndex;
        current.setAttribute("aria-label", next.getAttribute("aria-label"));
        current.setAttribute("aria-pressed", next.getAttribute("aria-pressed"));
        const oldParts = [...current.querySelectorAll("*")], newParts = [...next.querySelectorAll("*")];
        if (oldParts.length !== newParts.length) current.innerHTML = next.innerHTML;
        else newParts.forEach((part, partIndex) => {
          const old = oldParts[partIndex];
          for (const attribute of part.attributes) {
            const value = attribute.name === "class" && old.classList.contains("is-hovered") ? `${attribute.value} is-hovered` : attribute.value;
            if (old.getAttribute(attribute.name) !== value) old.setAttribute(attribute.name, value);
          }
          if (!part.children.length && old.textContent !== part.textContent) old.textContent = part.textContent;
        });
        oldNodes.delete(identity);
        if (islandModelsContainer.children[index] !== current) islandModelsContainer.insertBefore(current, islandModelsContainer.children[index] || null);
      }
    });
    oldNodes.forEach((node) => node.remove());
    islandModelsContainer.dataset.markup = islandMarkup;
  }
  let waiting = $(".island-empty", $(".island-stage"));
  if (!waiting) {
    waiting = document.createElement("div");
    waiting.className = "island-empty";
    waiting.setAttribute("role", "status");
    waiting.setAttribute("aria-label", "等待 Agent");
    waiting.innerHTML = "等待<br>Agent";
    $(".island-stage").append(waiting);
  }
  waiting.hidden = islandDisplayModels(liveModels, islandState.mode).length > 0;
  $$('[data-island-model]', islandModelsContainer).forEach((button) => {
    const hidden = islandState.mode === "compact" && !button.classList.contains("compact-visible");
    button.inert = hidden;
    button.setAttribute("aria-hidden", String(hidden));
  });
  $$('[data-model-index]').forEach((button) => { button.onclick = async () => {
    const models = button.closest("#island-models") ? visibleIslandModels : filteredModels();
    const model = models[Number(button.dataset.modelIndex)];
    if (!model) return;
    if (model.id !== state.selectedModelId) {
      state.selectedModelId = model.id;
      await loadSelectedSamples();
      renderAll();
    }
    if (desktopMode === "island") desktopMessage({ type: "open-main", modelId: model.id });
  }; });
  $$('[data-island-model]', islandModelsContainer).forEach((button) => {
    const show = (event) => showModelHistoryPopover(event, visibleIslandModels[Number(button.dataset.modelIndex)]);
    button.onpointerenter = desktopMode === "island" ? null : show;
    button.onpointermove = desktopMode === "island" ? null : show;
    button.onpointerleave = () => { if (desktopMode !== "island") hidePopover(); };
    button.onfocus = () => { if (desktopMode === "island") enterIslandState({ type: "ring", modelId: button.dataset.identity }); };
  });
  renderFocusedMetrics();
}

function hidePopover() {
  $("#hover-popover").classList.remove("visible");
  $("#island-bridge").classList.remove("visible");
}

let islandHovered = false;
let islandFocused = false;
let islandState = { mode: "compact", modelId: null };
let renderingIslandState = false;
function enterIslandState(event) {
  const next = transitionIsland(islandState, event);
  if (next.mode === islandState.mode && next.modelId === islandState.modelId) return;
  if (next.mode === "focus" && islandState.mode !== "focus") {
    const stage = $(".island-stage").getBoundingClientRect();
    const source = $$("[data-island-model]").find((node) => node.dataset.identity === next.modelId)?.getBoundingClientRect();
    $("#island-focus").style.setProperty("--focus-origin", `${source ? source.y + source.height / 2 - stage.y - stage.height / 2 : 0}px`);
  }
  islandState = next;
  document.body.dataset.islandMode = next.mode;
  islandHovered = next.mode !== "compact";
  if (next.mode !== "focus") hidePopover();
  // Rebuild the rail immediately when switching compact/normal so newly
  // visible idle sessions are present without waiting for the next poll.
  if (!renderingIslandState && typeof renderModelSelectors === "function") {
    renderingIslandState = true;
    try { renderModelSelectors(); } finally { renderingIslandState = false; }
  }
  updateIslandAttention();
}

function modelMetrics(model) {
  return [
    { kind: "quality", name: "模型核验", value: qualityValue(model), progress: verificationScore(model), health: verificationHealth(model), range: metricRange(model, "quality"), min: qualityRingStats(model).min, max: qualityRingStats(model).max },
    { kind: "cache", name: "Cache", value: formatPercent(model?.cacheRate), progress: Number.isFinite(model?.cacheRate) ? model.cacheRate * 100 : null, health: metricHealth("cache", Number.isFinite(model?.cacheRate) ? model.cacheRate * 100 : null), range: metricRange(model, "cache"), min: Number.isFinite(model?.cacheStats?.min) ? model.cacheStats.min * 100 : null, max: Number.isFinite(model?.cacheStats?.max) ? model.cacheStats.max * 100 : null },
    { kind: "ttft", name: "TTFT", value: formatDuration(model?.ttftMs), progress: ttftScore(model?.ttftMs), health: metricHealth("ttft", model?.ttftMs), range: metricRange(model, "ttft"), min: ttftScore(model?.ttftStats?.min), max: ttftScore(model?.ttftStats?.max) }
  ];
}

function renderFocusedMetrics() {
  const focus = $("#island-focus");
  const focused = islandState.mode === "focus";
  focus.inert = !focused;
  $("#island-models").inert = focused;
  const model = state.models.find((item) => item.id === islandState.modelId);
  const metrics = modelMetrics(model).map((metric) => ({ ...metric, radius: 27 }));
  if (!focus.children.length) focus.innerHTML = metrics.map((metric, index) => `<button class="focus-model" data-focus-metric="${metric.kind}" style="--slot-offset:${(index - 1) * 79}px"><span class="metric-rings"><svg class="ring-svg" viewBox="0 0 60 60">${metricRing(27, metric.progress, metric.health.color, metric.name, metric.value, metric.range, metric.min, metric.max, metric.kind)}</svg><i class="focus-metric-icon">${metricSymbol(metric.kind)}</i></span></button>`).join("");
  if (!focused || !model) return;
  metrics.forEach((metric, index) => {
    const button = focus.children[index];
    button.hidden = !state.settings[`focusShow${metric.kind[0].toUpperCase()}${metric.kind.slice(1)}`];
    button.style.setProperty("--ring-color", metric.health.color);
    button.setAttribute("aria-label", `${model.label} · ${metric.name} ${metric.value}`);
    updateMetricRing($(".ring-metric", button), metric);
    button.onclick = () => openMetric(model, metric.kind);
  });
}

function nativeFocus(focused) {
  if (desktopMode !== "island") return;
  islandFocused = Boolean(focused);
  document.body.classList.toggle("window-focused", islandFocused);
  updateIslandAttention();
}

function setIslandHover(hovered) {
  if (!hovered) {
    $$(".ring-metric.is-hovered").forEach((ring) => ring.classList.remove("is-hovered"));
    enterIslandState({ type: "leave" });
  }
  else if (islandState.mode === "compact") enterIslandState({ type: "border" });
}

function updateIslandAttention() {
  const island = $("#quick-island");
  if (!island) return;
  const expanded = islandState.mode !== "compact";
  const changed = island.classList.contains("expanded") !== expanded;
  document.body.classList.toggle("island-attended", expanded);
  island.classList.toggle("expanded", expanded);
  $("#island-expand").setAttribute("aria-expanded", String(expanded));
  if (changed && desktopMode === "island") {
    desktopMessage({ type: "island-hover", expanded: expanded || Boolean(tourCleanup) });
  }
  if (desktopMode === "island") requestAnimationFrame(reportIslandLayout);
}

async function openMetric(model, view) {
  if (!model) return;
  if (desktopMode === "island") desktopMessage({ type: "open-main", modelId: model.id, view });
  else { await selectModelById(model.id); setView(view); }
}

function reportIslandLayout() {
  const island = $("#quick-island");
  const { x, y, width, height } = island.getBoundingClientRect();
  const buffer = $("#island-buffer").getBoundingClientRect();
  desktopMessage({ type: "island-layout", x, y, width,
    height: parseFloat(island.style.getPropertyValue("--island-envelope-height")) || height,
    buffer: buffer.toJSON() });
}

function nativeDrag(phase, buffer) {
  document.body.classList.toggle("island-dragging", phase !== "idle");
  $(buffer ? "#island-buffer" : "#island-expand").classList.toggle("pressed", phase !== "idle");
  if (phase !== "idle") { clearTimeout(hoverExitTimer); clearTimeout(borderHoverTimer); clearTimeout(ringHoverTimer); hidePopover(); }
}

function positionPopover(event) {
  const popover = $("#hover-popover");
  popover.classList.add("visible");
  const bounds = popover.getBoundingClientRect();
  if (desktopMode === "island") {
    const onLeft = document.body.dataset.islandSide === "left";
    const height = popover.offsetHeight;
    const rail = $("#quick-island").getBoundingClientRect();
    const top = clamp(rail.top + rail.height / 2 - height / 2, 16, Math.max(16, window.innerHeight - height - 16));
    popover.style.left = onLeft ? "auto" : "12px";
    popover.style.right = onLeft ? "12px" : "auto";
    popover.style.top = `${top}px`;
    popover.style.setProperty("--connector-y", `${clamp(event.clientY - top, 26, height - 26)}px`);
    popover.style.setProperty("--connector-stretch", String(clamp((onLeft ? event.clientX : window.innerWidth - event.clientX) / 84, .72, 1.35)));
    updateIslandBridge(event);
    return;
  }
  const preferredLeft = event.clientX > window.innerWidth * 0.58 ? event.clientX - bounds.width - 18 : event.clientX + 18;
  popover.style.left = `${clamp(preferredLeft, 12, Math.max(12, window.innerWidth - bounds.width - 12))}px`;
  popover.style.top = `${clamp(event.clientY - Math.min(48, bounds.height / 3), 12, Math.max(12, window.innerHeight - bounds.height - 12))}px`;
}

let bridgePointer = null;
let bridgeTarget = null;
let bridgeFrame = null;
function updateIslandBridge(event) {
  bridgeTarget = { x: event.clientX, y: event.clientY };
  bridgePointer ||= { ...bridgeTarget };
  if (!bridgeFrame) bridgeFrame = requestAnimationFrame(drawIslandBridge);
}

function drawIslandBridge() {
  bridgeFrame = null;
  const popover = $("#hover-popover");
  if (!popover.classList.contains("visible")) { bridgePointer = null; return; }
  const smoothing = reducedMotion() ? 1 : .24;
  bridgePointer.x += (bridgeTarget.x - bridgePointer.x) * smoothing;
  bridgePointer.y += (bridgeTarget.y - bridgePointer.y) * smoothing;
  const rail = $("#quick-island").getBoundingClientRect();
  const onLeft = document.body.dataset.islandSide === "left";
  // Use layout dimensions so the connector doesn't follow the popover's reveal transform.
  const popupX = onLeft ? innerWidth - 12 : 12;
  const startX = onLeft ? popupX - popover.offsetWidth + 1 : popupX + popover.offsetWidth - 1;
  const endX = onLeft ? rail.right - 1 : rail.left + 1;
  const popupY = parseFloat(popover.style.top) || 12;
  const startY = clamp(bridgePointer.y, popupY + 30, popupY + popover.offsetHeight - 30);
  const endY = clamp(bridgePointer.y, rail.top + 24, rail.bottom - 24);
  const tension = clamp((bridgePointer.x - Math.min(startX, endX)) / Math.abs(endX - startX), 0, 1);
  const middleX = startX + (endX - startX) * (.3 + tension * .4);
  const bridge = $("#island-bridge");
  bridge.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
  const middleY = (startY + endY) / 2;
  const shoulder = (endX - startX) * .22;
  $("path", bridge).setAttribute("d", `M ${startX} ${startY-19} C ${startX} ${startY-7} ${middleX-shoulder} ${middleY-3} ${middleX} ${middleY-3} C ${middleX+shoulder} ${middleY-3} ${endX} ${endY-7} ${endX} ${endY-15} L ${endX} ${endY+15} C ${endX} ${endY+7} ${middleX+shoulder} ${middleY+3} ${middleX} ${middleY+3} C ${middleX-shoulder} ${middleY+3} ${startX} ${startY+7} ${startX} ${startY+19} Z`);
  bridge.classList.toggle("visible", popover.classList.contains("visible"));
  if (Math.abs(bridgeTarget.x - bridgePointer.x) + Math.abs(bridgeTarget.y - bridgePointer.y) > .2) bridgeFrame = requestAnimationFrame(drawIslandBridge);
}

function popoverTrend(label, value, range, points, color, { unavailable = "暂无趋势", rawTtft = false, maximum: scaleMaximum = 100 } = {}) {
  const maximum = rawTtft && points.length
    ? Math.max(state.settings.ttftThresholdMs, ...points.map((point) => point.value)) * 1.08
    : scaleMaximum;
  const kind = label === "Cache" ? "cache" : label === "TTFT" ? "ttft" : "quality";
  return `<button class="popover-metric" data-popover-metric="${kind}" title="${escapeHtml(range)}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div><div class="popover-chart">${points.length
    ? chartSvg([{ points, color, area: true }], { width: 280, height: 48, minimum: 0, maximum, compact: true, label: `${label}历史趋势` })
    : `<div class="mini-empty" title="${escapeHtml(unavailable)}">--</div>`}</div></button>`;
}

function showModelHistoryPopover(event, model) {
  if (!model) return;
  if (desktopMode === "island" && !state.settings.hoverDetails) { hidePopover(); return; }
  const quality = metricPointsForModel(model, "quality", 32);
  const cache = metricPointsForModel(model, "cache", 32);
  const ttft = metricPointsForModel(model, "ttftRaw", 32);
  const popover = $("#hover-popover");
  const sessions = sessionsForModel(model);
  const revision = JSON.stringify([model.id, state.lastUpdatedAt, state.rangeHours, sessions, verificationActivity(model), state.settings]);
  if (popover.dataset.historyRevision !== revision) {
  popover.dataset.historyRevision = revision;
  const cost = verificationCost(qualityRunsForModel(model));
  const health = [verificationHealth(model), metricHealth("cache", Number.isFinite(model.cacheRate) ? model.cacheRate * 100 : null), metricHealth("ttft", model.ttftMs)];
  popover.innerHTML = `<div class="popover-title"><strong class="model-heading">${modelLogo(model)}${escapeHtml(model.label)}</strong><span>${escapeHtml(formatRange())}</span></div><div class="popover-subtitle"><span data-info="endpoint">${escapeHtml(endpointLabel(model.endpoint))}</span><span data-info="keygroup">${escapeHtml(model.keyGroup || "无 Key")}</span><span data-info="reasoning">${escapeHtml(model.reasoningEffort || "默认档位")}</span></div><div class="popover-agents" data-info="agents">${sessions.length ? sessions.map(agentTag).join("") : `<b>状态待同步</b>`}</div><div class="popover-history">
    ${popoverTrend("模型核验", qualityValue(model), health[0].label, quality, health[0].color, { unavailable: "等待采样", maximum: qualityChartOptions(model).maximum })}
    ${popoverTrend("Cache", formatPercent(model.cacheRate), health[1].label, cache, health[1].color, { unavailable: "无缓存字段" })}
    ${popoverTrend("TTFT", formatDuration(model.ttftMs), health[2].label, ttft, health[2].color, { unavailable: "等待有效响应", rawTtft: true })}
  </div>${verificationStatusMarkup(model)}<div class="popover-foot"><span>${model.sampleCount} 个性能样本</span><span title="已知费用请求 ${cost.known}/${cost.requests}">核验 ${cost.known ? formatCost(cost.total) : "--"}</span></div>`;
  $$("[data-popover-metric]", popover).forEach(button => { button.onclick = () => openMetric(model, button.dataset.popoverMetric); });
  }
  positionPopover(event);
}

function renderModelTable() {
  const table = $("#model-table");
  table.innerHTML = `<div class="table-row header"><span>模型与渠道</span><span>模型核验</span><span>Cache</span><span>TTFT</span></div>${filteredModels().length
    ? filteredModels().map((model) => `<button class="table-row table-action" data-select-model="${escapeHtml(model.id)}"><span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(endpointLabel(model.endpoint))}</small></span><span class="mint-text">${qualityValue(model)}<small>${escapeHtml(model.evaluator)}</small></span><span class="blue-text">${formatPercent(model.cacheRate)}</span><span class="violet-text">${formatDuration(model.ttftMs)}</span></button>`).join("")
    : `<div class="empty-state table-empty">暂无样本</div>`}`;
  $$('[data-select-model]', table).forEach((button) => button.addEventListener("click", async (event) => {
    state.selectedModelId = button.dataset.selectModel;
    await loadSelectedSamples();
    renderAll();
    const metric = event.target.closest(".blue-text") ? "cache" : event.target.closest(".violet-text") ? "ttft" : event.target.closest(".mint-text") ? "quality" : null;
    if (metric) setView(metric);
  }));
}

function renderMetricCard(cardSelector, value, stateText, stateTone, footLeft, footRight) {
  const card = $(cardSelector);
  const valueElement = $(".metric-value", card);
  if (valueElement.innerHTML !== value) {
    valueElement.innerHTML = value;
    valueElement.classList.remove("value-updating");
    requestAnimationFrame(() => valueElement.classList.add("value-updating"));
  }
  const status = $(".metric-state", card);
  status.textContent = stateText;
  status.className = `metric-state ${stateTone}`;
  const foot = $(".metric-foot", card);
  foot.firstElementChild.textContent = footLeft;
  foot.lastElementChild.textContent = footRight;
  foot.lastElementChild.className = `delta ${stateTone === "online" ? "positive" : "neutral"}`;
}

function renderMetrics() {
  const model = selectedModel();
  const cost = verificationCost(qualityRunsForModel(model));
  $("#cost-summary").innerHTML = `<span>核验费用 · ${escapeHtml(model?.label || "未选择对象")} · ${formatRange()}</span><strong>总花费 ${formatCost(cost.total)}</strong><strong>平均单次 ${formatCost(cost.average)}</strong><span>最近单次 ${formatCost(cost.latest)}</span><small>${cost.known}/${cost.requests} 个请求有价格${cost.known < cost.requests ? " · 合计不含未知费用" : ""}</small>`;
  const cache = model?.cacheRate;
  const ttft = model?.ttftMs;
  const numeric = model?.verification?.numeric;
  const activity = verificationActivity(model);
  renderMetricCard(".quality-card", activity.busy ? `<span class="spin">↻</span> ${escapeHtml(activity.label)}` : numeric ? `${numeric.value.toFixed(numeric.method === "custom-question" ? 0 : ["juice", "juice-direction"].includes(numeric.method) ? 1 : 2)}<span class="unit">${numeric.unit}</span>` : escapeHtml(activity.label), activity.busy ? activity.label : model?.verification?.label || activity.label, model?.verification?.verdict === "consistent" ? "online" : "pending",
    model?.verification?.measuredAt ? `${model.verification.stale ? "上次有效" : "采样于"} ${formatTimestamp(model.verification.measuredAt, true)}` : "暂无有效核验",
    activity.busy || !numeric ? activity.detail : model?.verification?.stale ? "最新检测未完成" : model?.verification?.directedModel ? `指向 ${model.verification.directedModel}` : model?.verification?.label);
  $(".quality-card .metric-source").textContent = numeric?.label || "候选模型分布 · Juice 证据";
  const unsampled = model?.status === "unsampled";
  const failedOnly = Boolean(model && model.sampleCount === 0 && model.errorCount > 0);
  const direct = ["direct", "passive"].includes(model?.observationSource);
  const unavailableText = direct ? "等待空闲窗口采样" : unsampled ? "等待首次采样" : failedOnly ? "请求失败，等待重试" : "未提供";
  const cacheState = model?.cacheStatus === "available" ? "字段完整" : model?.cacheStatus === "partial" ? "部分样本" : unavailableText;
  const cacheTone = model?.cacheStatus === "available" ? "online" : "pending";
  const cacheFoot = model ? cache != null
    ? model.cacheSource === "codex-rollout" || model.observationSource === "passive" ? "Codex 本地记录 · 无额外请求" : `${Math.round(model.cacheCoverage * 100)}% 样本含缓存字段`
    : direct ? "等待本地 usage 或空闲窗口采样" : unsampled ? "等待 Agent 调用或空闲窗口采样" : "等待有效 Cache 字段"
    : "等待真实样本";
  renderMetricCard(".cache-card", cache == null ? "--" : formatPercent(cache), cacheState, cacheTone, cacheFoot, Number.isFinite(model?.cacheStats?.min) ? `${formatPercent(model.cacheStats.min)}–${formatPercent(model.cacheStats.max)}` : unavailableText);
  const ttftFoot = model ? (ttft != null ? `${model.ttftStats?.count || 0} 个有效 TTFT 样本` : direct ? "本地 usage 不含 TTFT · 空闲窗口主动采样" : unsampled ? "等待 Agent 调用或空闲窗口采样" : failedOnly ? `${model.errorCount} 次请求失败，等待重试` : "等待有效 TTFT 样本") : "等待真实样本";
  renderMetricCard(".ttft-card", ttft == null ? "--" : `${ttft < 1000 ? Math.round(ttft) : (ttft / 1000).toFixed(2)}<span class="unit">${ttft < 1000 ? "ms" : "s"}</span>`, ttft == null ? (direct ? "直连不可观测" : unavailableText) : "可用", ttft == null ? "pending" : "online", ttftFoot, Number.isFinite(model?.ttftStats?.min) ? `${formatDuration(model.ttftStats.min)}–${formatDuration(model.ttftStats.max)}` : unavailableText);
  renderOverviewRings(model);
  $(".health-panel .muted").textContent = model ? `${model.label} · ${formatRange()}` : "当前没有可用样本";
  $(".health-meta span:last-child").textContent = model ? (direct ? `${cache == null ? "Cache 等待 usage" : "Cache 已从本地记录读取"} · TTFT 与模型核验在短暂空闲窗口采样` : unsampled ? "等待首次响应 · 工作中暂停主动采样" : failedOnly ? `最近 ${model.errorCount} 次请求失败 · 将按退避策略重试` : `${model.sampleCount} 个有效样本 · 平均总耗时 ${formatDuration(model.durationMs)} · 测试花费 ${formatCost(model.costUsd)}`) : "无真实样本";
}

function renderOverviewRings(model) {
  const metrics = modelMetrics(model).map((metric, index) => ({ ...metric, radius: [27, 20, 13][index] }));
  const container = $(".health-panel .rings");
  if (!$(".overview-rings", container)) container.innerHTML = `<div class="overview-rings"><svg viewBox="0 0 70 70" role="img" aria-label="模型核验、Cache 与 TTFT 三环"><g transform="translate(5 5)">${metrics.map((metric) => metricRing(metric.radius, metric.progress, metric.health.color, metric.name, metric.value, metric.range, metric.min, metric.max, metric.kind)).join("")}</g></svg><div class="overview-model-logo"></div></div><div class="overview-ring-legend"></div>`;
  metrics.forEach((metric, index) => updateMetricRing($$(".ring-metric", container)[index], metric));
  $(".overview-model-logo", container).innerHTML = modelLogo(model);
  $(".overview-ring-legend", container).innerHTML = metrics.map((metric) => `<div style="--metric-color:${metric.health.color}"><span><i class="metric-symbol">${metricSymbol(metric.kind)}</i>${metric.name}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.health.label)}</small><small title="当前时间范围最小值–最大值">${escapeHtml(metric.range)}</small></div>`).join("");
  $$(".overview-ring-legend > div", container).forEach((node, index) => {
    node.tabIndex = 0; node.setAttribute("role", "button");
    node.onclick = () => openMetric(model, metrics[index].kind);
    node.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); node.click(); } };
  });
}

function updateMetricRing(ring, metric) {
    ring.style.setProperty("--ring-color", metric.health.color);
    $(".ring-value", ring).setAttribute("stroke-dasharray", `${ringProgress(metric.progress)} 100`);
    $(".ring-value", ring).setAttribute("opacity", Number.isFinite(metric.progress) ? "1" : "0");
    $(".ring-peak", ring).setAttribute("stroke-dasharray", `${ringProgress(metric.max)} 100`);
    $(".ring-peak", ring).setAttribute("visibility", metric.max > 0 ? "visible" : "hidden");
    ring.setAttribute("aria-label", `${metric.name} ${metric.value} · ${metric.health.label} · ${metric.range}`);
    $("title", ring).textContent = ring.getAttribute("aria-label");
    $(".ring-end-label text", ring).textContent = Number.isFinite(metric.progress) ? metric.value : "--";
    const end = ringPoint(metric.radius, metric.progress);
    $(".ring-end-label", ring).setAttribute("transform", `translate(${clamp(end.x, 18, 42)} ${clamp(end.y, 8, 52)})`);
    const low = ringPoint(metric.radius, metric.min);
    $(".ring-min-icon", ring).setAttribute("transform", `translate(${low.x} ${low.y})`);
    $(".ring-min-icon", ring).setAttribute("visibility", Number.isFinite(metric.min) ? "visible" : "hidden");
    $(".ring-min-icon title", ring).textContent = `最小值 · ${metric.range}`;
    for (const [kind, label] of [["min", "最小值"], ["max", "最大值"]]) {
      const marker = $(`[data-extreme="${kind}"]`, ring);
      const point = ringPoint(metric.radius, metric[kind]);
      marker.setAttribute("cx", point.x);
      marker.setAttribute("cy", point.y);
      marker.setAttribute("visibility", Number.isFinite(metric[kind]) ? "visible" : "hidden");
      $("title", marker).textContent = `${label} · ${metric.range}`;
    }
}

function renderCharts() {
  const quality = metricPoints("quality");
  const cache = metricPoints("cache");
  const ttft = metricPoints("ttftRaw");
  const duration = metricPoints("duration");
  const timeValues = [...ttft, ...duration].map((point) => point.value).filter(Number.isFinite);
  const timeMaximum = timeValues.length ? Math.max(state.settings.ttftThresholdMs, ...timeValues) * 1.08 : state.settings.ttftThresholdMs;
  const formatMilliseconds = (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  const separateQualityAxis = selectedModel()?.verification?.numeric?.unit !== "%";
  const lines = [
    quality.length ? { points: quality, color: colors.mint, area: true, axisIndex: separateQualityAxis ? 2 : 0, name: "核验" } : null,
    cache.length ? { points: cache, color: colors.blue, axisIndex: 0, name: "Cache" } : null,
    ttft.length ? { points: ttft, color: colors.violet, axisIndex: 1, name: "TTFT" } : null,
    duration.length ? { points: duration, color: colors.yellow, axisIndex: 1, name: "总耗时" } : null
  ].filter((line) => line && !state.hiddenTrendSeries.has(line.name));
  const axes = [
    { minimum: 0, maximum: 100, tickLabel: (value) => `${Math.round(value)}%`, label: separateQualityAxis ? "Cache" : "核验 / Cache", side: "left" },
    { minimum: 0, maximum: timeMaximum, tickLabel: formatMilliseconds, label: "时间", side: "right" }
  ];
  if (separateQualityAxis && quality.length) axes.push({ ...qualityChartOptions(selectedModel()), label: selectedModel().verification.numeric.label, side: "left" });
  $("#trend-chart").innerHTML = lines.length ? chartSvg(lines, { axes, label: `${formatRange()}指标趋势` }) : `<div class="empty-state chart-empty">当前模型暂无可绘制趋势。</div>`;
  $$(".legend [data-series]").forEach((button) => {
    const hidden = state.hiddenTrendSeries.has(button.dataset.series);
    button.classList.toggle("muted", hidden); button.setAttribute("aria-pressed", String(!hidden));
    button.onclick = () => { hidden ? state.hiddenTrendSeries.delete(button.dataset.series) : state.hiddenTrendSeries.add(button.dataset.series); renderCharts(); };
  });
  $$("#trend-chart .chart-sample").forEach((sample) => {
    sample.onclick = () => {
      const label = sample.getAttribute("aria-label") || "";
      const view = label.includes("Cache") ? "cache" : label.includes("TTFT") || label.includes("总耗时") ? "ttft" : "quality";
      setView(view);
    };
  });
  $$(".mini-chart").forEach((element) => {
    const points = element.dataset.chart === "quality" ? quality : element.dataset.chart === "cache" ? cache : ttft;
    const color = element.dataset.chart === "quality" ? colors.mint : element.dataset.chart === "cache" ? colors.blue : colors.violet;
    const options = element.dataset.chart === "quality" ? qualityChartOptions(selectedModel())
      : element.dataset.chart === "ttft" ? { maximum: Math.max(state.settings.ttftThresholdMs, ...points.map((point) => point.value)) * 1.08, tickLabel: formatMilliseconds }
      : { maximum: 100, tickLabel: (value) => `${Math.round(value)}%` };
    element.innerHTML = points.length ? chartSvg([{ points, color, area: true }], { width: 250, height: 38, minimum: 0, ...options, compact: true }) : `<div class="mini-empty">暂无趋势</div>`;
  });
}

function eventTitle(event) {
  if (event.type === "ttft") return "TTFT 超过阈值";
  if (event.type === "cache") return "Cache 命中率偏低";
  if (event.type === "quality") return "模型偏离基线";
  return "请求失败";
}

function isUnread(event) { return !state.settings.acknowledgedAt || event.timestamp > state.settings.acknowledgedAt; }

function notifyNewEvents() {
  if (!state.settings.notifications) return;
  for (const event of state.events.filter(isUnread)) {
    const id = String(event.id || `${event.type}:${event.timestamp}:${event.model}`);
    if (state.notifiedEventIds.has(id)) continue;
    state.notifiedEventIds.add(id);
    const title = `Modivue · ${translate(eventTitle(event))}`;
    const body = `${event.model || translate("未知模型")} · ${translate(event.detail || "检测到异常")}`;
    if (desktopMode !== "island") showToast(`${title} · ${body}`, event.level === "error" ? "error" : "warning");
    if (hasDesktopBridge()) { if (desktopMode === "island") desktopMessage({ type: "notify", title, body, id }); }
    else if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, tag: `modivue-${id}` });
  }
}

function eventRow(event, detailed = false) {
  const unread = isUnread(event);
  const icon = event.level === "error" ? "!" : event.type === "cache" ? "C" : event.type === "quality" ? "Q" : "T";
  return `<div class="event-row ${unread ? "unread" : ""}"><span class="event-icon ${event.level === "error" ? "danger" : event.type === "cache" ? "info" : "warning"}">${icon}</span><div><strong>${eventTitle(event)}${unread ? "<i class=\"unread-dot\"></i>" : ""}</strong><small>${escapeHtml(event.model)} · ${escapeHtml(event.detail)}${detailed ? ` · ${escapeHtml(endpointLabel(event.baseUrl))} · ${escapeHtml(event.keyGroup || "无分组")}` : ""}</small></div><time datetime="${escapeHtml(event.timestamp)}">${formatTimestamp(event.timestamp, detailed)}</time></div>`;
}

function renderEvents() {
  const events = filteredEvents();
  const unreadCount = events.filter(isUnread).length;
  const badge = $("#nav-alert-badge");
  badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  badge.hidden = unreadCount === 0;
  const list = $(".events-panel .event-list");
  list.innerHTML = events.length ? events.slice(0, 5).map((event) => eventRow(event)).join("") : `<div class="empty-state">当前范围内没有告警。</div>`;
}

function renderOverview() {
  renderModelSelectors();
  renderModelTable();
  renderMetrics();
  renderCharts();
  renderEvents();
  $(".trend-panel .muted").textContent = `${selectedModel()?.label || "当前模型"} · ${formatRange()} · ${state.selectedSamples.length} 个调用样本`;
}

function modelsView() {
  const rows = filteredModels().length ? filteredModels().map((model) => `<div class="data-line"><strong>${escapeHtml(model.observedModel)}</strong><span>${escapeHtml(model.standardLabel)}</span><span>${Math.round((model.match.confidence || 0) * 100)}%</span><span>${formatInteger(model.matchCount)} 次</span><span class="pill ${model.match.status === "matched" ? "green" : model.match.status === "ambiguous" ? "yellow" : "gray"}">${model.match.status === "matched" ? "已归一化" : model.match.status === "ambiguous" ? "待确认" : "未匹配"}</span></div>`).join("") : `<div class="empty-state">暂无观测模型。</div>`;
  return `<div class="view-stack"><article class="panel">${viewHeader("模型目录与观测名称", "标准目录实时来自 models.dev；低置信度名称保留原值。", `<button class="text-button" data-action="sync-catalog">重新同步</button>`)}<div class="data-list"><div class="data-line header"><span>观测模型</span><span>标准模型</span><span>匹配度</span><span>匹配次数</span><span>状态</span></div>${rows}</div></article></div>`;
}

function qualityDegradationCount(model) {
  return state.events.filter((event) => event.type === "quality" && sameModelRoute(event, model)).length;
}

function routesView() {
  const selected = selectedModel();
  const rows = filteredModels().length ? filteredModels().map((model) => `<button class="route-row ${model.id === selected?.id ? "active" : ""}" data-select-model="${escapeHtml(model.id)}">
    <span class="route-identity"><strong>${escapeHtml(endpointLabel(model.endpoint))}</strong><small>${escapeHtml(model.provider)} · Key ${escapeHtml(model.keyGroup || "未提供")}</small></span>
    <span><strong>${escapeHtml(model.label)}</strong><small>${model.status === "unsampled" ? "已配置 · 未采样" : escapeHtml(model.standardLabel)}</small></span>
    <span class="mint-text">${qualityValue(model)}<small>${escapeHtml(model.evaluator)}</small></span>
    <span class="blue-text">${formatPercent(model.cacheRate)}</span>
    <span class="violet-text">${formatDuration(model.ttftMs)}</span>
    <span>${model.sampleCount}/${model.totalCount}</span>
    <span><b class="degradation-count">${qualityDegradationCount(model)}</b></span>
  </button>`).join("") : `<div class="empty-state">暂无已配置或已观测渠道。</div>`;
  const selectionSubtitle = selected
    ? `${endpointLabel(selected.endpoint)} · Key ${selected.keyGroup || "未提供"} · ${selected.label}`
    : "选择渠道后显示当前范围内的历史数据";
  return `<div class="view-stack"><article class="panel route-list-panel">${viewHeader("渠道表现", `按模型、渠道、Key 与推理档位统计 · ${formatRange()}`)}<div class="route-table-scroll"><div class="route-table"><div class="route-table-head"><span>渠道 / Key 分组</span><span>模型</span><span>模型核验</span><span>Cache</span><span>TTFT</span><span>有效/总计</span><span>基线偏离</span></div>${rows}</div></div></article><article class="panel route-history-panel">${viewHeader("选中渠道历史", selectionSubtitle)}${selected ? `<div class="route-summary"><span><small>${escapeHtml(selected.evaluator)}范围</small><strong class="mint-text">${escapeHtml(metricRange(selected, "quality"))}</strong></span><span><small>Cache 范围</small><strong class="blue-text">${escapeHtml(metricRange(selected, "cache"))}</strong></span><span><small>TTFT 范围</small><strong class="violet-text">${escapeHtml(metricRange(selected, "ttft"))}</strong></span><span><small>基线偏离</small><strong>${qualityDegradationCount(selected)} 次</strong></span></div><div class="route-history-grid"><section class="route-history-item"><header><strong>${escapeHtml(selected.evaluator)}</strong><span>${qualityValue(selected)}</span></header><div class="route-chart" id="route-quality-chart"></div></section><section class="route-history-item"><header><strong>Cache</strong><span>${formatPercent(selected.cacheRate)}</span></header><div class="route-chart" id="route-cache-chart"></div></section><section class="route-history-item"><header><strong>TTFT</strong><span>${formatDuration(selected.ttftMs)}</span></header><div class="route-chart" id="route-ttft-chart"></div></section></div>` : `<div class="empty-state">暂无可选择渠道。</div>`}</article></div>`;
}

function renderRouteCharts() {
  const model = selectedModel();
  if (!model) return;
  const quality = metricPointsForModel(model, "quality");
  const cache = metricPointsForModel(model, "cache");
  const ttft = metricPointsForModel(model, "ttftRaw");
  const ttftMaximum = ttft.length ? Math.max(state.settings.ttftThresholdMs, ...ttft.map((point) => point.value)) * 1.08 : state.settings.ttftThresholdMs;
  const render = (selector, points, color, options, emptyText) => {
    const element = $(selector);
    if (!element) return;
    element.innerHTML = points.length
      ? chartSvg([{ points, color, area: true }], options)
      : `<div class="empty-state chart-empty">${escapeHtml(emptyText)}</div>`;
  };
  render("#route-quality-chart", quality, colors.mint, qualityChartOptions(model), "当前范围内未评测");
  render("#route-cache-chart", cache, colors.blue, { minimum: 0, maximum: 100, tickLabel: (value) => `${Math.round(value)}%`, label: `${model.label} Cache 历史` }, "提供方未返回缓存字段");
  render("#route-ttft-chart", ttft, colors.violet, { minimum: 0, maximum: ttftMaximum, tickLabel: (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`, label: `${model.label} TTFT 历史` }, model.status === "unsampled" ? "当前模型尚未采样" : "当前范围内无 TTFT 样本");
}

function cacheView() {
  const model = selectedModel();
  return `<div class="view-columns"><article class="panel">${viewHeader("Cache 命中率趋势", `${model?.label || "当前模型"} · 仅使用提供方明确返回的缓存字段`)}<div class="trend-chart" id="cache-view-chart"></div></article><article class="panel">${viewHeader("缓存字段覆盖", "缺少字段的样本不会被写成零。")}<div class="setting-row"><div><strong>加权命中率</strong><small>按输入 token 加权</small></div><strong class="blue-text">${formatPercent(model?.cacheRate, 1)}</strong></div><div class="setting-row"><div><strong>字段覆盖率</strong><small>${model?.cacheStatus === "partial" ? "部分样本有缓存字段" : model?.cacheStatus === "available" ? "全部有效样本有缓存字段" : "提供方未返回字段"}</small></div><strong>${model ? formatPercent(model.cacheCoverage) : "--"}</strong></div><div class="setting-row"><div><strong>单次范围</strong><small>${model?.cacheStats?.count || 0} 个可用样本</small></div><strong>${Number.isFinite(model?.cacheStats?.min) ? `${formatPercent(model.cacheStats.min)}–${formatPercent(model.cacheStats.max)}` : "--"}</strong></div></article></div>`;
}

function ttftView() {
  const model = selectedModel();
  return `<div class="view-columns"><article class="panel">${viewHeader("TTFT 趋势", `${model?.label || "当前模型"} · 请求发出到首个有效内容`)}<div class="trend-chart" id="ttft-view-chart"></div></article><article class="panel">${viewHeader("响应分布", `当前告警阈值 ${formatDuration(state.settings.ttftThresholdMs)}`)}<div class="setting-row"><div><strong>平均值</strong><small>${model?.ttftStats?.count || 0} 个有效流式样本</small></div><strong class="violet-text">${formatDuration(model?.ttftMs)}</strong></div><div class="setting-row"><div><strong>平均总耗时</strong><small>从请求发出到响应结束</small></div><strong>${formatDuration(model?.durationMs)}</strong></div><div class="setting-row"><div><strong>测试花费</strong><small>${model?.costSampleCount || 0} 个有价格样本</small></div><strong>${formatCost(model?.costUsd)}</strong></div><div class="setting-row"><div><strong>P50 / P95</strong><small>当前时间范围</small></div><strong>${formatDuration(model?.ttftStats?.p50)} / ${formatDuration(model?.ttftStats?.p95)}</strong></div><div class="setting-row"><div><strong>最小 / 最大</strong><small>首个空事件不计时</small></div><strong>${formatDuration(model?.ttftStats?.min)} / ${formatDuration(model?.ttftStats?.max)}</strong></div></article></div>`;
}

function distributionReport(metadata) {
  if (!Array.isArray(metadata?.distribution) || !Array.isArray(metadata.referenceDistribution)) return "";
  const buckets = metadata.distribution.map((value, index) => ({ number: index + 1, measured: value, reference: metadata.referenceDistribution[index] || 0, count: metadata.counts?.[index] ?? null }))
    .filter((row) => row.measured || row.reference).sort((a, b) => Math.max(b.measured, b.reference) - Math.max(a.measured, a.reference));
  const rows = buckets.slice(0, 12);
  if (buckets.length > 12) rows.push(buckets.slice(12).reduce((total, row) => ({ number: "其他", measured: total.measured + row.measured, reference: total.reference + row.reference, count: total.count + (row.count || 0) }), { measured: 0, reference: 0, count: 0 }));
  return `<section class="distribution-report"><header><h3>答案分布对照</h3><span>${metadata.sampleCount} / ${metadata.attempts} 个有效样本 · 参考 ${metadata.referenceSampleCount} 个</span></header>
    <div class="distribution-row distribution-head"><span>答案</span><span>实测频率</span><span>参考频率</span><span>次数</span></div>
    ${rows.map((row) => `<div class="distribution-row"><strong>${row.number}</strong><span><i style="--frequency:${row.measured * 100}%;--frequency-color:var(--mint)"></i><b>${(row.measured * 100).toFixed(1)}%</b></span><span><i style="--frequency:${row.reference * 100}%;--frequency-color:var(--blue)"></i><b>${(row.reference * 100).toFixed(1)}%</b></span><span>${row.count ?? "--"}</span></div>`).join("")}</section>`;
}

function juiceDirectionReport(run) {
  const rows = run?.metadata?.candidateDistribution;
  if (!Array.isArray(rows) || !rows.length) return "";
  const count = Number.isFinite(run.metadata.sampleCount) ? `${run.metadata.sampleCount} 次` : "--";
  return `<section class="distribution-report juice-direction-report"><header><h3>Juice 模型指向</h3><span>原始值 ${run.metadata.reportedJuice ?? "--"} · 相对指向比例，不是身份后验概率</span></header><div class="distribution-row distribution-head"><span>候选模型</span><span>相对指向比例</span><span>参考范围</span><span>距离</span></div>${rows.map((row) => `<div class="distribution-row"><strong>${escapeHtml(row.model)}</strong><span><i style="--frequency:${Math.min(100, row.probability * 100)}%;--frequency-color:var(--mint)"></i><b>${(row.probability * 100).toFixed(1)}%</b></span><span>${row.min}–${row.max}</span><span>${row.distance}</span></div>`).join("")}<footer class="distribution-foot">有效观测：${count}</footer></section>`;
}

function modelDirectionReport(run) {
  const rows = run?.metadata?.candidateDistribution;
  if (!Array.isArray(rows) || !rows.length) return "";
  const meow = run.evaluator_id === "meow-fingerprint";
  return `<section class="distribution-report model-direction-report"><header><h3>${meow ? "Meow 候选模型指向" : "候选模型分布指向"}</h3><span>${meow ? "候选特征命中数及相对证据；匹配度不是身份概率" : "HLWY 相对匹配比例，非身份后验概率"}</span></header>
    <div class="distribution-row distribution-head"><span>候选模型</span><span>匹配度</span><span>${meow ? "特征命中" : "JSD"}</span><span>${meow ? "命中比例" : "余弦"}</span><span>${meow ? "强指向阈值" : "参与样本"}</span></div>
    ${rows.map((row) => `<div class="distribution-row"><strong>${escapeHtml(row.model)}</strong><span><i style="--frequency:${clamp(row.relativeMatch, 0, 100)}%;--frequency-color:var(--mint)"></i><b>${row.relativeMatch.toFixed(3)}%</b></span><span>${meow ? Number.isFinite(row.featureHitCount) ? `${row.featureHitCount} / ${run.metadata.sampleCount} 次` : "旧记录未保存特征数" : Number(row.jsd).toFixed(4)}</span><span>${meow ? Number.isFinite(row.featureHitRatio) ? `${row.featureHitRatio.toFixed(1)}%` : "未记录" : (row.cosine * 100).toFixed(1) + "%"}</span><span>${meow ? Number.isFinite(row.threshold) ? row.threshold.toFixed(3) + "%" : "--" : Number.isFinite(row.sampleCount) ? row.sampleCount : Number.isFinite(run.metadata.sampleCount) ? run.metadata.sampleCount : "--"}</span></div>`).join("")}
    <footer class="distribution-foot">${meow ? "特征命中统计落在候选每题最高参考类别的回答（并列类别均计入）；候选可共享特征，所以命中数可能相同。参与样本是本轮有效回答数。匹配度仍按上游完整分布公式计算。" : "参与样本为所有候选共用的有效回答数；指向按完整答案分布计算。"}</footer></section>`;
}

function verificationCost(runs) {
  // A resumed run contains its parent's requests. Count only the last record
  // in each continuation chain, including failed or partially priced requests.
  const resumed = new Set(runs.map(run => run.metadata?.continuedFrom).filter(id => id != null));
  const requests = runs.filter(run => !resumed.has(run.id)).flatMap(run => run.metadata?.requests || [])
    .filter(request => inSelectedRange(request.timestamp));
  const known = requests.map(request => request.costUsd).filter(Number.isFinite);
  return { total: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
    average: known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null,
    latest: requests.filter(request => request.timestamp).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.costUsd,
    known: known.length, requests: requests.length };
}

function verificationPlan(model) {
  const target = state.probe?.targets?.find(target => target.id === model?.id);
  const method = state.settings.evaluatorId;
  if (method === "bazaarlink-probe") return { external: true, label: "官方远程综合检测；按当前四元组单独启用，可持续运行并保存逐题报告。" };
  if (method === "ztest") return { external: true, label: "在 Ztest 完成人机验证与多探针检测，然后导入报告保存到当前四元组。" };
  const plan = (samples, maxAttempts = samples, note = "") => ({ samples, maxAttempts,
    label: `计划 ${samples} 次有效回答 · 最多 ${maxAttempts} 次请求${note ? ` · ${note}` : ""}` });
  if (method === "astra-community") return plan(5 * state.settings.astraSamples);
  if (method === "one-token") return plan(10 * state.settings.oneTokenSamples);
  if (method === "custom-question") return plan(1, 1, state.questions.find(question => question.id === state.settings.defaultQuestionId)?.title || "请选择测试题目");
  if (method === "juice" && state.settings.juiceMode === "raw") return plan(1, 1, "原始观测，未校准");
  if (!target) return { label: "选择可用的会话后显示请求计划" };
  if (method === "meow-fingerprint") {
    const requirements = state.evaluators.find(item => item.id === method)?.requirements;
    const families = requirements?.[target.wireApi]?.families;
    if (!families) return { blocked: true, label: "Meow 基准支持 Responses、Anthropic Messages 和 Chat Completions；当前协议没有对应基准。" };
    const key = name => String(name || "").split("/").at(-1).toLowerCase().replaceAll(".", "-");
    const baseline = families.find(item => item.models.some(name => [target.canonicalModelId, target.observedModel].some(candidate => key(candidate) === key(name))));
    if (!baseline) {
      return { blocked: true, label: "Meow 公开基准未覆盖当前模型。可改用 Juice 单次观测、自定义题或采集可信分布。" };
    }
    const samples = baseline.samples[state.settings.meowTier];
    return plan(samples, samples + Math.ceil(samples / 2), state.settings.meowTier === "screen" ? "6 次筛查没有强指向判定线" : "上游完整采样档");
  }
  if (method === "knowledge-boundary") {
    const key = value => String(value || "").split("/").at(-1).replaceAll(".", "-");
    const reference = state.evaluators.find(item => item.id === method)?.requirements?.models.find(item => key(item.id) === key(state.settings.kbfReferenceModel === "current" ? target.canonicalModelId || target.observedModel : state.settings.kbfReferenceModel));
    if (!reference) return { blocked: true, label: "当前模型没有 KBF 公共基准，请在设置中选择要对照的参考模型" };
    return plan(state.settings.kbfTier === "full" ? reference.requests : 1, state.settings.kbfTier === "full" ? reference.requests : 1, reference.id);
  }
  if (method === "hlwy-fingerprint") {
    const samples = state.settings.verificationSamples;
    if (samples < 50) return { blocked: true, label: "当前 HLWY 分布对照至少需 50 个有效答案。请在设置 → 核验调整 HLWY 每轮样本数；少量试请求可使用可信 API 的 2 次试采样。" };
    return plan(samples, samples + Math.ceil(samples / 2));
  }
  const calibration = state.calibration?.models?.[target.canonicalModelId] || state.calibration?.models?.[target.observedModel];
  const problem = state.calibrationError || (!calibration ? "缺少该模型的可信校准档案"
    : (target.reasoningEffort || null) !== calibration.reasoningEffort ? "当前推理档位与校准档案不一致"
    : calibration.wireApi && target.wireApi !== calibration.wireApi ? "当前协议与校准档案不一致"
    : !calibration[method === "juice" ? "juice" : "probability"] ? "校准档案没有所选方案的参考数据" : null);
  if (problem) return { blocked: true, label: `${problem}。请在设置 → 核验中配置。` };
  if (method === "juice") return plan(1, 3, "可信校准对照");
  const { cells, repetitions } = calibration.probability;
  return plan(cells.length * repetitions, cells.length * (repetitions + Math.ceil(repetitions / 2)));
}

function ztestView(model) {
  return `<section class="ztest-panel"><h3>Ztest 多探针检测</h3><p>在 ztest.ai 选择模型、快速／标准／深测及并发模式，完成验证后开始检测。完成后粘贴报告链接或导入 JSON。</p><p>网站需要人机验证；API Key 由你在 Ztest 页面填写。Modivue 只读取检测报告。</p><a class="primary-button" href="https://ztest.ai/" target="_blank" rel="noreferrer">打开 Ztest 检测</a>
    <form id="ztest-import-form" class="question-form"><label>报告链接<input name="reportUrl" type="url" placeholder="https://ztest.ai/report/…"></label><label>或导入报告 JSON<input name="reportFile" type="file" accept=".json,application/json"></label><label><input name="confirmTarget" type="checkbox" required>确认报告属于当前模型、渠道、Key 分组和推理档位</label><button class="primary-button" type="submit" ${model ? "" : "disabled"}>导入并保存报告</button><p id="ztest-message" role="status"></p></form></section>`;
}

async function importZtestReport(form) {
  const model = selectedModel();
  if (!model || !form.reportValidity()) return;
  const button = $("[type=submit]", form); button.disabled = true;
  const message = $("#ztest-message");
  try {
    const file = form.elements.reportFile.files[0];
    if (file?.size > 1024 * 1024) throw new Error("报告不能超过 1 MB");
    const report = file ? JSON.parse(await file.text()) : undefined;
    if (!report && !form.elements.reportUrl.value) throw new Error("请填写报告链接或选择 JSON 文件");
    const result = await fetchJson("/api/quality/ztest/import", { method: "POST", body: JSON.stringify({
      observedModel: model.observedModel, baseUrl: model.endpoint, keyGroup: model.keyGroup, reasoningEffort: model.reasoningEffort,
      reportUrl: form.elements.reportUrl.value, report, confirmTarget: form.elements.confirmTarget.checked }) });
    showToast(result.duplicate ? "该报告已保存" : "Ztest 报告已导入");
    await refreshObservations({ quiet: true });
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

function bazaarlinkView(model) {
  const job = state.bazaarlink?.jobs?.find(job => job.target.id === model?.id);
  const active = ["starting", "running", "polling-error", "stopping"].includes(job?.status);
  const labels = { idle: "已配置", starting: "正在启动", running: "正在检测", "polling-error": "进度读取重试中", stopping: "正在停止",
    completed: "检测完成", stopped: "已停止", cancelled: "已停止", failed: "检测失败", "start-unknown": "启动状态待确认" };
  return `<section class="bazaarlink-panel"><h3>BazaarLink Probe 综合检测</h3>
    <p>使用官网完整检测链路。检测 token 由当前渠道 Key 的额度计收，BazaarLink 不另收检测费。BYOK 默认回退到平台线路时按平台价格收费；严格模式可关闭回退。</p>
    <p>远程检测的探针请求数由官网决定，每日轮数上限与本地请求预算分别计算；不会自动沿用本地推理档位。持续检测受主动探测开关控制。</p>
    <a href="https://bazaarlink.ai/probe" target="_blank" rel="noreferrer">打开 BazaarLink Probe</a>
    <form id="bazaarlink-form" data-target-id="${escapeHtml(model?.id || "")}" class="question-form"><label>检测模式<select name="mode"><option value="quick" ${job?.mode === "quick" ? "selected" : ""}>快速身份探针</option><option value="full" ${job?.mode === "full" ? "selected" : ""}>综合检测</option><option value="context" ${job?.mode === "context" ? "selected" : ""}>综合检测与上下文测试</option></select></label>
    <label>持续检测间隔（分钟）<input name="intervalMinutes" type="number" min="15" max="10080" value="${job?.intervalMinutes || 60}" required></label>
    <label>每日最多检测轮数<input name="dailyRuns" type="number" min="1" max="20" value="${job?.dailyRuns || 2}" required></label>
    <label><input name="continuous" type="checkbox" ${job?.continuous ? "checked" : ""}>启用持续检测</label>
    <label><input name="consent" type="checkbox" required>确认向 BazaarLink 发送当前渠道 API Key，消耗目标额度，并公开保存检测报告</label>
    <button type="submit" class="primary-button" ${active || !model ? "disabled" : ""}>保存当前目标检测计划</button></form>
    <div class="question-actions"><button type="button" data-action="bazaarlink-start" class="primary-button" ${!job || active ? "disabled" : ""}>开始远程检测</button><button type="button" data-action="bazaarlink-stop" class="text-button" ${!job ? "disabled" : ""}>停止并关闭持续检测</button></div>
    <p role="status">${escapeHtml(labels[job?.status] || "尚未启用当前目标")}${job?.progress ? ` · ${job.progress.completed}/${job.progress.total || "--"} 项` : ""}${job?.error ? ` · ${escapeHtml(job.error)}` : ""}${job?.nextRunAt ? ` · 下次 ${escapeHtml(formatTimestamp(job.nextRunAt, true))}` : ""}</p>
    ${job?.runId ? `<p>runId: <code>${escapeHtml(job.runId)}</code></p>` : ""}
    <form id="bazaarlink-import-form" class="question-form"><label>导入官网报告 JSON<input name="report" type="file" accept=".json,application/json" required></label><label><input name="confirmTarget" type="checkbox" required>确认报告属于当前模型、渠道、Key 分组和推理档位</label><button class="text-button" type="submit">导入并保存报告</button></form></section>`;
}

async function saveBazaarlinkPlan(form) {
  const values = new FormData(form);
  try {
    state.bazaarlink = await fetchJson("/api/quality/bazaarlink", { method: "POST", body: JSON.stringify({ action: "configure", targetId: selectedModel()?.id,
      mode: values.get("mode"), intervalMinutes: Number(values.get("intervalMinutes")), dailyRuns: Number(values.get("dailyRuns")),
      continuous: values.has("continuous"), consent: values.has("consent") }) });
    form.remove(); showToast("当前目标检测计划已保存"); renderActiveView();
  } catch (error) { showToast(error.message, "error"); }
}

async function bazaarlinkAction(action) {
  try {
    state.bazaarlink = await fetchJson("/api/quality/bazaarlink", { method: "POST", body: JSON.stringify({ action, targetId: selectedModel()?.id }) });
    renderActiveView();
  } catch (error) { showToast(error.message, "error"); }
}

async function importBazaarlink(form) {
  try {
    const file = form.elements.report.files[0];
    if (!file || file.size > 1024 * 1024) throw new Error("请选择不超过 1 MB 的报告 JSON");
    state.bazaarlink = await fetchJson("/api/quality/bazaarlink", { method: "POST", body: JSON.stringify({ action: "import", targetId: selectedModel()?.id,
      confirmTarget: form.elements.confirmTarget.checked, report: JSON.parse(await file.text()) }) });
    await refreshObservations({ quiet: true }); showToast("报告已保存");
  } catch (error) { showToast(error.message, "error"); }
}

function bazaarlinkReport(metadata) {
  const report = metadata.externalReport;
  if (!report) return "";
  const assessment = report.identityAssessment || {};
  return `<section class="distribution-report"><header><h3>BazaarLink 逐题结果</h3><a href="${escapeHtml(metadata.source)}" target="_blank" rel="noreferrer">查看源报告</a></header>
    <p>官方判定：${escapeHtml(assessment.verdict?.status || assessment.status || "证据不足")} · ${escapeHtml(assessment.verdict?.trueModel || assessment.predictedFamily || "")}</p>
    <p>输入 ${formatInteger(report.totalInputTokens)} / 输出 ${formatInteger(report.totalOutputTokens)} token · 费用未知</p>
    ${(assessment.riskFlags || []).map(flag => `<p class="report-notice">${escapeHtml(flag)}</p>`).join("")}
    ${report.items.map(item => `<details data-detail-key="bazaarlink-${escapeHtml(metadata.reportId)}-${escapeHtml(item.probeId)}"><summary>${escapeHtml(item.label || item.probeId)} · ${escapeHtml(item.group || "")} · ${item.passed === true ? "通过" : item.passed === false ? "未通过" : escapeHtml(item.status || "待判定")}</summary><p>${escapeHtml(item.error || item.passReason || "")}</p><pre>${escapeHtml(item.response || "")}</pre><p>TTFT ${formatDuration(item.ttftMs)} · ${item.tps ?? "--"} token/s</p></details>`).join("")}</section>`;
}

function qualityView() {
  const model = selectedModel();
  const verification = model?.verification || summarizeVerification([], state.settings.evaluatorId);
  const selected = verification.selected;
  const method = state.evaluators.find((item) => item.id === state.settings.evaluatorId)?.label || state.settings.evaluatorId;
  const activity = verificationActivity(model);
  const plan = verificationPlan(model);
  const action = `<div class="verification-actions"><button class="text-button" data-action="export-quality" ${!qualityRunsForModel(model).length ? "disabled" : ""}>导出报告</button><button class="primary-button" ${plan.external ? "hidden" : ""} data-action="run-quality" ${activity.busy || !activity.target || plan.blocked ? "disabled" : ""}><span>▶</span>${activity.busy ? activity.label : plan.blocked ? "需配置核验条件" : activity.target?.pauseReason ? "排队核验" : "立即核验"}</button></div>`;
  const points = metricPoints("quality");
  const questionSummary = verification.question;
  return `<div class="view-stack"><article class="panel">${viewHeader("模型核验", `${model?.label || "当前模型"} · ${method} · ${verification.label}`, action)}
    <label class="report-picker">核验方式<select id="quality-method-select">${state.evaluators.map(item => `<option value="${item.id}" ${item.id === state.settings.evaluatorId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
    ${state.settings.evaluatorId === "custom-question" ? `<label class="report-picker">当前题目<select id="quality-question-select">${state.questions.map(question => `<option ${question.builtIn ? "" : 'translate="no"'} value="${escapeHtml(question.id)}" ${question.id === state.settings.defaultQuestionId ? "selected" : ""}>${escapeHtml(question.title)}</option>`).join("")}</select></label>` : ""}
    ${verification.stale ? `<p class="report-notice">环形指标保留 ${escapeHtml(formatTimestamp(verification.measuredAt, true))} 的有效结果；最新一次检测未完成，详情如下。</p>` : ""}
    ${verificationStatusMarkup(model)}
    <p class="verification-plan" role="status">${escapeHtml(plan.label)}</p>
    ${questionSummary ? `<p class="question-window-summary"><strong>${questionSummary.matched} / ${questionSummary.compared} 次答案匹配</strong> · ${questionSummary.ratio === null ? "--" : (questionSummary.ratio * 100).toFixed(1) + "%"} · ${escapeHtml(formatRange())} · 总请求 ${questionSummary.total} · 失败 ${questionSummary.errors}${questionSummary.reviewed ? ` · ${questionSummary.reviewed} 次待人工复核` : ""}</p>` : ""}
    ${plan.external ? state.settings.evaluatorId === "bazaarlink-probe" ? bazaarlinkView(model) : ztestView(model) : ""}
    <h3>${escapeHtml(qualityChartOptions(model).label)}</h3><div class="trend-chart">${points.length ? chartSvg([{ points, color: colors.mint }], qualityChartOptions(model)) : '<div class="empty-state">当前范围尚无有效核验趋势</div>'}</div>
    ${selected ? qualityRunReport(selected) : '<div class="empty-state">所选方案尚未核验</div>'}
    </article>${qualityHistoryView(model)}</div>`;
}

function qualityHistoryView(model) {
  const runs = qualityRunsForModel(model);
  const run = runs.find((item) => String(item.id) === state.qualityReportId) || runs[0];
  const options = runs.map((item) => `<option value="${item.id}" ${item === run ? "selected" : ""}>${escapeHtml(formatTimestamp(item.timestamp, true))} · ${escapeHtml(item.evaluator_id)} v${escapeHtml(item.evaluator_version)}</option>`).join("");
  const archive = distributionArchive(run);
  const exportAction = ["one-token", "astra-community"].includes(run?.evaluator_id) ? `<button class="text-button" data-action="export-distribution" ${archive ? "" : "disabled"} title="每题至少 10 次有效样本；仅将已知来源的采样用作参考">导出分布档案</button>` : "";
  return `<article class="panel" id="quality-history">${viewHeader("历史核验报告", `全部历史 · ${runs.length} 条 · 保留原始版本与采样条件`, exportAction)}
    ${run ? `<label class="report-picker">选择检测记录 <select id="quality-report-select">${options}</select></label>${qualityRunReport(run, "history")}` : '<div class="empty-state">此监控目标尚无核验记录。</div>'}</article>`;
}

function qualityRunReport(run, scope = "selected") {
  const metadata = { ...run.metadata, ...run.reportDetails };
  const detailKey = escapeHtml(`${scope}-${run.id || run.timestamp}`);
  const legacy = run.evaluator_id === "meow-fingerprint" && run.evaluator_version === "4.5.3";
  const legacyNotice = legacy ? `<p class="report-notice">此记录使用已停用的非上游评分公式，判定无效。下方保留原始采样分布与费用，不用于当前指标。</p>` : "";
  const observations = (metadata.observations || []).map((cell) => {
    const total = Object.values(cell.counts || {}).reduce((sum, count) => sum + count, 0);
    return `<section class="distribution-report"><header><h3 translate="no">${escapeHtml(cell.prompt || cell.id || "探针")}</h3><span>实际 ${total} / 计划 ${cell.planned ?? "--"} · ${cell.referenceKind === "fitted-predictive" ? "参考为申报模型拟合分布的预测比例" : cell.reference ? "参考为申报模型基线" : "旧记录未保存参考分布"}</span></header><div class="distribution-row distribution-head"><span>回答</span><span>实际次数 / 比例</span><span>参考基线比例</span></div>${Object.entries(cell.counts || {}).map(([answer, count]) => `<div class="distribution-row"><strong translate="no">${escapeHtml(answer)}</strong><span><i style="--frequency:${total ? count / total * 100 : 0}%;--frequency-color:var(--mint)"></i><b>${count} 次 · ${total ? (count / total * 100).toFixed(1) : "0.0"}%</b></span><span>${Number.isFinite((cell.reference?.[answer] ?? cell.reference?.__UNSEEN_IN_TRAINING__)) ? formatPercent((cell.reference[answer] ?? cell.reference.__UNSEEN_IN_TRAINING__), 1) : cell.reference ? "未覆盖该回答" : "未记录参考"}</span></div>`).join("")}</section>`;
  }).join("");
  const caseSummary = (metadata.observations || []).map((cell) => {
    const valid = Number.isFinite(cell.sampleCount) ? cell.sampleCount : Object.values(cell.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
    const planned = Number.isFinite(cell.planned) ? cell.planned : Number.isFinite(cell.requested) ? cell.requested : null;
    const attempts = Number.isFinite(cell.attempts) ? cell.attempts : null;
    const label = cell.prompt || cell.id || "探针案例";
    return `<div class="verification-case"><span translate="no" title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${valid}${planned === null ? "" : ` / ${planned}`}</strong><small>${attempts === null ? "" : `${attempts} 次尝试`}</small></div>`;
  }).join("");
  const external = run.evaluator_id === "ztest" ? metadata.externalReport : null;
  const externalSummary = external ? `<section class="distribution-report"><header><h3>Ztest 探针明细</h3><a href="${escapeHtml(metadata.source)}" target="_blank" rel="noreferrer">查看源报告</a></header><p>${escapeHtml(external.endpoint_masked || "")} · ${escapeHtml(external.model?.display_name || "")} · ${escapeHtml(external.profile || "")}</p>${external.probe_results.map(probe => `<div class="external-probe"><strong>${escapeHtml(probe.probe_name || probe.probe_code)}</strong><span>${escapeHtml(probe.status)}</span><span>${probe.score ?? "--"}</span><span>${formatDuration(probe.latency_ms)}</span></div>`).join("")}</section>` : "";
  const presentationRecheck = metadata.question?.match === "exact" && metadata.matched !== comparableAnswer(metadata.actual, metadata.question.answer);
  const verdict = legacy ? "旧版判定无效" : escapeHtml(verificationRunLabel(run));
  const requests = Array.isArray(metadata.requests) ? metadata.requests : [];
  const pricedRequests = requests.filter((request) => Number.isFinite(request.costUsd));
  const totalCost = pricedRequests.reduce((sum, request) => sum + request.costUsd, 0);
  const duration = requests.filter((request) => Number.isFinite(request.durationMs));
  const reasonLabels = { samples_incomplete: "有效样本未达 60% 要求", no_valid_samples: "没有完整有效答案", no_threshold: "候选未超过判定线", multiple_thresholds: "最高候选不唯一", unknown_claimed_model: "基准未覆盖申报模型", uncalibrated: "缺少判定线", baseline_cell_missing: "缺少题目基准", samples_exceed_plan: "样本超过计划", target_inactive: "Agent 已待命或切换渠道", monitoring_paused: "监测暂时暂停", budget_exhausted: "达到每日预算上限", authentication_failed: "提供方鉴权失败" };
  return `<section class="historical-report" data-report-key="${detailKey}">${legacyNotice}<div class="verification-metrics"><div><span>检测结论</span><strong>${verdict}</strong><small>${escapeHtml(presentationRecheck ? verificationRunLabel(run) : run.rationale || "未提供")}</small></div><div><span>有效样本</span><strong>${metadata.sampleCount ?? "--"}</strong><small>${escapeHtml(metadata.reasoningEffort || "未记录档位")} · ${escapeHtml(metadata.revision || "未记录基准版本")}</small></div></div>
    ${presentationRecheck ? `<p class="report-notice">已按答案格式归一化复核显示。历史原始判定和回答保留在原始 JSON 中。</p>` : ""}
    ${metadata.question ? `<section class="question-result"><h3>${escapeHtml(metadata.question.title)}</h3><p>${escapeHtml(metadata.question.prompt)}</p><dl><dt>参考答案</dt><dd>${escapeHtml(metadata.question.answer)}</dd><dt>实际回答</dt><dd class="question-prompt">${escapeHtml(metadata.actual)}</dd></dl></section>` : ""}
    ${Number.isFinite(metadata.jsd) ? `<p>JSD ${metadata.jsd.toFixed(4)}</p>` : ""}
    ${metadata.conditionNotice ? `<p class="report-notice">${escapeHtml(metadata.conditionNotice)}</p>` : ""}
    <dl class="report-facts"><div><dt>检测时间</dt><dd>${escapeHtml(formatTimestamp(run.timestamp, true))}</dd></div><div><dt>方案版本</dt><dd>${escapeHtml(run.evaluator_id)} · ${escapeHtml(run.evaluator_version)}</dd></div><div><dt>请求累计耗时</dt><dd>${duration.length ? formatDuration(duration.reduce((sum, request) => sum + request.durationMs, 0)) : "未提供"}</dd></div><div><dt>总花费</dt><dd>${pricedRequests.length ? formatCost(totalCost) : "待计费"}<small>${pricedRequests.length}/${requests.length} 个请求有价格</small></dd></div><div><dt>平均单次花费</dt><dd>${pricedRequests.length ? formatCost(totalCost / pricedRequests.length) : "待计费"}</dd></div><div><dt>采样进度</dt><dd>${metadata.sampleCount ?? "--"} / ${metadata.plannedSamples ?? metadata.attempts ?? "--"}</dd></div><div><dt>请求尝试</dt><dd>${metadata.requestAttempts ?? metadata.attempts ?? (requests.length || "--")}</dd></div><div><dt>失败 / 重试</dt><dd>${metadata.failures?.length ?? 0}</dd></div></dl>
    ${metadata.partialSamples ? '<p class="report-notice">本轮未满额采样；判定资格按总体及每题有效样本分别检查。</p>' : ""}
    ${metadata.reasons?.length ? `<p>${metadata.reasons.map((reason) => escapeHtml(reasonLabels[reason] || reason)).join(" · ")}</p>` : ""}
    ${metadata.stopReason ? `<p class="report-notice">${escapeHtml(metadata.stopReason)}</p>` : ""}
    ${Number.isFinite(metadata.reportedJuice) ? `<p>Juice 观测 ${metadata.reportedJuice} · 参考范围 ${metadata.expectedRange ? `${metadata.expectedRange.min}–${metadata.expectedRange.max}` : "未校准"}</p>` : ""}
    ${caseSummary ? `<section class="verification-cases"><header><h3>采样案例进度</h3><span>每个案例的有效样本与尝试次数</span></header>${caseSummary}</section>` : ""}
    ${externalSummary}${run.evaluator_id === "bazaarlink-probe" ? bazaarlinkReport(metadata) : ""}${distributionReport(metadata)}${!legacy && ["hlwy-fingerprint", "meow-fingerprint"].includes(run.evaluator_id) ? modelDirectionReport({ ...run, metadata }) : run.evaluator_id === "juice" ? juiceDirectionReport(run) : ""}${observations}
    ${metadata.results?.length ? `<section class="distribution-report"><h3>KBF 知识边界核验</h3><p>p₀ ${metadata.p0.toFixed(6)} · p ${metadata.pValue.toFixed(6)} · ${metadata.discrepancies} / ${metadata.parsedAnswers}</p>${metadata.results.map(result => `<div class="distribution-row"><strong translate="no">${escapeHtml(result.name)}</strong><span>${result.answer}</span><span>${result.actual ?? "--"}</span><span>${result.matched ? "匹配" : "不匹配"}</span></div>`).join("")}</section>` : ""}
    ${metadata.referenceDataset?.distributions?.length ? `<details data-detail-key="reference-${detailKey}"><summary>OpenRouter 参考样本 · ${metadata.referenceDataset.validSamples} 条</summary><p translate="no">${escapeHtml(metadata.referenceDataset.notice)}</p>${metadata.referenceDataset.distributions.map(item => `<div class="distribution-row"><strong translate="no">${escapeHtml(item.model)} · ${escapeHtml(item.cell)}</strong><span>${item.sampleCount}</span><span translate="no">${escapeHtml(item.profile)}</span><span translate="no">${escapeHtml(Object.entries(item.counts).map(([answer, count]) => `${answer}: ${count}`).join(" · "))}</span></div>`).join("")}</details>` : ""}
    ${metadata.failures?.length ? `<details class="report-failures" data-detail-key="failures-${detailKey}"><summary>失败尝试 ${metadata.failures.length} 次</summary>${metadata.failures.map((failure) => `<p>#${failure.attempt} · ${escapeHtml(failure.cellId)} · ${escapeHtml(failure.error)}</p>`).join("")}</details>` : ""}
    ${requests.length ? `<details class="report-requests" data-detail-key="requests-${detailKey}"><summary>请求明细 ${requests.length} 次</summary><div class="report-request-head"><span>时间</span><span>耗时</span><span>费用</span><span>状态</span></div>${requests.map((request) => `<div class="report-request-row"><time>${escapeHtml(formatTimestamp(request.timestamp))}</time><span>${formatDuration(request.durationMs)}</span><span>${formatCost(request.costUsd)}${request.costStatus === "estimated" ? "（估算）" : ""}</span><span>${escapeHtml(request.error || (request.status === "ok" ? "完成" : request.status || "未记录"))}</span></div>`).join("")}</details>` : ""}
    <details data-detail-key="raw-${detailKey}"><summary>原始 JSON 与采样条件</summary><pre>${escapeHtml(JSON.stringify(run, null, 2))}</pre></details></section>`;
}

function alertsView() {
  const events = filteredEvents();
  const unread = events.filter(isUnread).length;
  const action = `<button class="text-button" data-action="ack-alerts" ${unread === 0 ? "disabled" : ""}>标记全部已读</button>`;
  return `<div class="view-stack"><article class="panel">${viewHeader("告警通知", `${formatRange()} · ${unread} 条未读 · 阈值来自设置`, action)}<div class="event-list detailed">${events.length ? events.map((event) => eventRow(event, true)).join("") : `<div class="empty-state">当前范围内没有告警。</div>`}</div></article></div>`;
}

function rawDetails(log) { return escapeHtml(JSON.stringify({ measurement: log.measurement || null, rawUsage: log.raw_usage || null }, null, 2)); }

function filteredLogs() {
  const query = state.logQuery.trim().toLowerCase();
  return state.logs.filter((log) => {
    if (!matchesGlobalFilters(log)) return false;
    if (state.logStatus !== "all" && (state.logStatus === "ok") !== (log.status === "ok")) return false;
    if (!query) return true;
    return [log.observed_model, log.base_url, log.key_group, log.protocol, log.agent, log.error].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function logRows() {
  const logs = filteredLogs();
  return logs.length ? logs.map((log) => `<details class="log-entry" data-detail-key="log-${escapeHtml(log.id)}"><summary><time datetime="${escapeHtml(log.timestamp)}">${formatTimestamp(log.timestamp, true)}</time><span><strong>${escapeHtml(log.observed_model)}</strong><small>${escapeHtml(endpointLabel(log.base_url))} · ${escapeHtml(log.key_group)}</small></span><span>${escapeHtml(log.protocol)}</span><span>${formatDuration(log.ttft_ms)}</span><span>${log.cache_hit_rate == null ? "未提供" : formatPercent(log.cache_hit_rate)}</span><span class="pill ${log.status === "ok" ? "green" : "yellow"}">${log.status === "ok" ? "成功" : "失败"}</span></summary><div class="log-detail"><dl><div><dt>采集来源</dt><dd>${escapeHtml(log.agent || "未知")}</dd></div><div><dt>输入 / 输出 token</dt><dd>${formatInteger(log.input_tokens)} / ${formatInteger(log.output_tokens)}</dd></div><div><dt>缓存读取 token</dt><dd>${formatInteger(log.cache_read_tokens)}</dd></div><div><dt>错误</dt><dd>${escapeHtml(log.error || "无")}</dd></div></dl><pre>${rawDetails(log)}</pre></div></details>`).join("") : `<div class="empty-state">当前筛选条件下没有采集日志。</div>`;
}

function logsView() {
  return `<div class="view-stack"><article class="panel log-panel">${viewHeader("采集日志", `${formatRange()} · 已读取 ${state.logs.length} 条 · 原始 usage 与测量边界可展开追溯`, `<button class="text-button" data-action="export-logs">导出 JSONL</button>`)}<div class="filter-bar"><label><span>搜索</span><input id="log-search" value="${escapeHtml(state.logQuery)}" placeholder="模型、渠道或分组" autocomplete="off"></label><label><span>状态</span><select id="log-status"><option value="all" ${state.logStatus === "all" ? "selected" : ""}>全部</option><option value="ok" ${state.logStatus === "ok" ? "selected" : ""}>成功</option><option value="error" ${state.logStatus === "error" ? "selected" : ""}>失败</option></select></label><span id="log-count">${filteredLogs().length} 条</span></div><div class="log-table-head"><span>时间</span><span>模型 / 渠道</span><span>协议</span><span>TTFT</span><span>Cache</span><span>状态</span></div><div id="log-list">${logRows()}</div></article></div>`;
}

function switchControl(name, checked, label) { return `<label class="switch"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span aria-hidden="true"></span><b>${label}</b></label>`; }

function settingsView() {
  const settings = state.settings;
  const probe = state.probe;
  const config = state.config;
  const routeEndpoints = Object.entries(config?.upstreams || {}).flatMap(([protocol, routes]) => Object.keys(routes).map((routeId) => {
    const route = routeId === "default" ? "" : `/${routeId}`;
    return `<div><span>${escapeHtml(protocol)} · ${escapeHtml(routeId)}</span><code>http://${escapeHtml(config?.host || "127.0.0.1")}:${escapeHtml(config?.port || "4173")}/proxy/${escapeHtml(protocol)}${escapeHtml(route)}/v1</code></div>`;
  })).join("") || `<div><span>OpenAI 默认路径</span><code>http://${escapeHtml(config?.host || "127.0.0.1")}:${escapeHtml(config?.port || "4173")}/proxy/openai/v1</code></div><div><span>Anthropic 默认路径</span><code>http://${escapeHtml(config?.host || "127.0.0.1")}:${escapeHtml(config?.port || "4173")}/proxy/anthropic/v1</code></div>`;
  return `<form class="settings-form" id="settings-form"><div class="view-columns"><article class="panel">${viewHeader("监测设置", "主动探测会调用提供方并产生 token 消耗。", `<button class="primary-button" type="submit"><span>✓</span>保存设置</button>`)}<div class="setting-row"><div><strong>主动探测</strong><small>关闭后仍会记录经过本地代理的真实调用</small></div>${switchControl("probeEnabled", settings.probeEnabled, settings.probeEnabled ? "已开启" : "已关闭")}</div><div class="setting-row"><div><strong>主动探测间隔</strong><small>每个去重目标的调度间隔</small></div><select class="setting-control" name="probeIntervalMinutes"><option value="1">1 分钟</option><option value="5">5 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">1 小时</option><option value="180">3 小时</option><option value="360">6 小时</option></select></div><div class="setting-row"><div><strong>探测指令</strong><small>用于主动探测；修改后作为独立条件统计</small></div><input class="setting-control setting-text" name="probeInstruction" maxlength="2000" value="${escapeHtml(settings.probeInstruction)}"></div><div class="setting-row"><div><strong>默认时间范围</strong><small>下次加载工作台使用此范围</small></div><select class="setting-control" name="defaultHours"><option value="1">最近 1 小时</option><option value="6">最近 6 小时</option><option value="24">最近 24 小时</option><option value="168">最近 7 天</option></select></div><div class="setting-row"><div><strong>系统通知</strong><small>桌面端使用系统通知；网页端使用浏览器通知权限</small><button type="button" class="text-button" data-action="test-notification">发送测试通知</button></div>${switchControl("notifications", settings.notifications, settings.notifications ? "已开启" : "已关闭")}</div></article><article class="panel">${viewHeader("阈值与预算", probe?.running ? "主动探测正在运行" : probe?.enabled ? "主动探测已排期" : "主动探测已关闭")}<div class="setting-row"><div><strong>TTFT 告警阈值</strong><small>1–120000 ms</small></div><label class="number-control"><input type="number" name="ttftThresholdMs" min="1" max="120000" step="1" value="${settings.ttftThresholdMs}"><span>ms</span></label></div><div class="setting-row"><div><strong>Cache 告警阈值</strong><small>低于该命中率时告警</small></div><label class="number-control"><input type="number" name="cacheThresholdPercent" min="0" max="100" step="1" value="${Math.round(settings.cacheThreshold * 100)}"><span>%</span></label></div><div class="setting-row"><div><strong>每日探测上限</strong><small>今日已用 ${formatInteger(probe?.usage?.requests || 0)} 次</small></div><label class="number-control"><input type="number" name="probeDailyLimit" min="1" max="10000" step="1" value="${settings.probeDailyLimit}"><span>次</span></label></div><div class="setting-row"><div><strong>探测输出上限</strong><small>控制单次主动探测成本</small></div><label class="number-control"><input type="number" name="probeMaxOutputTokens" min="8" max="4096" step="1" value="${settings.probeMaxOutputTokens}"><span>token</span></label></div><div class="setting-row"><div><strong>连续偏离次数</strong><small>达到次数后生成核验告警</small></div><label class="number-control"><input type="number" name="qualityConsecutive" min="1" max="20" step="1" value="${settings.qualityConsecutive}"><span>次</span></label></div></article></div><article class="panel endpoint-panel">${viewHeader("本地代理", "Coding agent 通过同一个本地端口进入不同协议路径。")}<div class="endpoint-grid">${routeEndpoints}<div><span>已去重探测目标</span><strong>${formatInteger(probe?.targets?.length || 0)}</strong></div><div><span>下次主动探测</span><strong>${probe?.nextRunAt ? formatTimestamp(probe.nextRunAt, true) : "未排期"}</strong></div></div></article></form>`;
}

function customizationView() {
  const groups = new Map();
  preferenceFields.forEach(field => { if (!groups.has(field.group)) groups.set(field.group, []); groups.get(field.group).push(field); });
  const labels = { appearance: "外观", interaction: "交互", verification: "检测策略", display: "显示内容", thresholds: "阈值配色" };
  const controls = (field) => field.key === "ringStyle"
    ? `<div class="ring-style-picker"><select name="ringStyle" class="setting-control">${Object.entries(field.options).map(([key, label]) => `<option value="${key}" ${state.settings.ringStyle === key ? "selected" : ""}>${label}</option>`).join("")}</select><div class="ring-style-previews">${Object.entries(field.options).map(([key, label]) => `<button type="button" data-ring-style="${key}" aria-label="预览并选择${label}" aria-pressed="${state.settings.ringStyle === key}"><svg viewBox="0 0 60 60" aria-hidden="true">${metricRing(24, 54, state.settings.qualityHighColor, "预览", "54%", "20%–82%", 20, 82)}</svg><small>${label}</small></button>`).join("")}</div></div>`
    : field.options
    ? `<select name="${field.key}" class="setting-control">${Object.entries(field.options).map(([value, label]) => `<option value="${escapeHtml(value)}" ${state.settings[field.key] === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`
    : field.type === "boolean" ? switchControl(field.key, state.settings[field.key], state.settings[field.key] ? "已开启" : "已关闭")
    : field.type === "color" ? `<input name="${field.key}" type="color" value="${escapeHtml(state.settings[field.key] || field.value)}" class="color-control">`
    : `<label class="number-control"><input name="${field.key}" type="number" min="${field.min}" max="${field.max}" step="1" value="${state.settings[field.key] ?? field.value}"><span>${field.unit || ""}</span></label>`;
  const sections = [...groups].map(([group, fields]) => `<section class="customization-group" data-settings-group="${group}"><h4>${labels[group]}</h4>${fields.map(field => `<div class="setting-row"><div><strong>${field.label}</strong>${field.hint ? `<small>${escapeHtml(field.hint)}</small>` : ""}</div>${controls(field)}</div>`).join("")}</section>`).join("");
  return `<form class="customization-form" id="customization-form">${sections}<div class="customization-actions"><button class="primary-button" type="submit">保存自定义</button><span id="customization-message" role="status"></span></div></form>`;
}

const settingsCategories = { monitoring: "监测", appearance: "外观", interaction: "交互", display: "显示内容", thresholds: "阈值配色", verification: "核验", tests: "题库", connection: "连接" };

function mountSettingsNavigation() {
  const content = $("#view-content");
  content.insertAdjacentHTML("afterbegin", `<div class="settings-toolbar"><div class="settings-tabs" role="tablist" aria-label="设置分类">${Object.entries(settingsCategories).map(([id, label]) => `<button type="button" role="tab" class="settings-tab" data-settings-tab="${id}">${label}</button>`).join("")}</div><label class="settings-search"><span>搜索全部设置</span><input id="customization-search" type="search" value="${escapeHtml(state.customizationQuery)}" placeholder="搜索设置" autocomplete="off"></label><button class="text-button" type="button" data-action="replay-tour">详细窗口引导</button><button class="text-button" type="button" data-action="island-tour">灵动岛引导</button></div><p id="settings-save-status" role="status" aria-live="polite">更改会自动保存</p><div id="settings-empty" class="empty-state" hidden>没有匹配的设置</div>`);
  const form = $("#settings-form");
  $$(".view-columns > article", form).forEach(node => { node.dataset.settingsGroup = "monitoring"; });
  $(".endpoint-panel", form).dataset.settingsGroup = "connection";
  for (const selector of [".baseline-registry", "#trusted-calibration-form", "#calibration-form"]) $(selector).dataset.settingsGroup = "verification";
  $(".custom-tests-panel").dataset.settingsGroup = "tests";
  $(".baseline-registry").dataset.methods = "hlwy-fingerprint";
  $("#trusted-calibration-form").dataset.methods = "probability-probe hlwy-fingerprint";
  $("#calibration-form").dataset.methods = "probability-probe juice hlwy-fingerprint one-token astra-community";
  const section = document.createElement("article");
  section.className = "panel method-settings-panel"; section.dataset.settingsGroup = "verification";
  section.innerHTML = viewHeader("核验方式与采样", "选择方案后只显示相关设置。", '<button type="submit" class="primary-button">保存设置</button>');
  form.prepend(section);
  for (const name of ["evaluatorId", "meowTier", "verificationSamples", "defaultQuestionId", "verificationIntervalMinutes", "verificationRequestDelaySeconds"]) {
    const row = form.elements[name]?.closest(".setting-row"); if (row) section.append(row);
  }
  // Keep form controls mounted: changing tabs or searching must not discard drafts.
  $$(".setting-row", content).forEach(row => {
    const title = $("strong", row)?.textContent;
    $$("input, select", row).forEach(input => input.setAttribute("aria-label", title || input.name));
  });
  if (["probability-probe", "hlwy-fingerprint"].includes(state.settings.evaluatorId)) {
    const trusted = $("#trusted-calibration-form");
    if (trusted) configureTrustedPurpose(trusted, state.settings.evaluatorId === "hlwy-fingerprint" ? "hlwy" : "probability");
  }
  for (const [name, item] of settingsDraft) {
    const input = $(`#view-content [name="${name}"]`);
    if (input) { if (input.type === "checkbox") input.checked = item.value; else input.value = item.value ?? ""; }
  }
  updateSettingsVisibility();
}

function updateSettingsVisibility() {
  const query = state.customizationQuery.trim().toLocaleLowerCase();
  const method = $("#settings-form [name=evaluatorId]")?.value || state.settings.evaluatorId;
  const methods = { astraSamples: ["astra-community"], oneTokenSamples: ["one-token"], kbfTier: ["knowledge-boundary"], kbfReferenceModel: ["knowledge-boundary"], meowTier: ["meow-fingerprint"], verificationSamples: ["hlwy-fingerprint"],
    hlwySource: ["hlwy-fingerprint"], juiceMode: ["juice"], defaultQuestionId: ["custom-question"], questionIntervalSeconds: ["custom-question"], questionTimeoutSeconds: ["custom-question"], questionMaxOutputTokens: ["custom-question"] };
  const eligible = node => !node.dataset.methods || node.dataset.methods.split(" ").includes(method);
  Object.entries(methods).forEach(([name, values]) => {
    const input = $(`#view-content [name="${name}"]`);
    if (input) { input.closest(".setting-row").dataset.methods = values.join(" "); input.disabled = !query && !values.includes(method); }
  });
  $$("[data-settings-tab]").forEach(tab => {
    const selected = !query && tab.dataset.settingsTab === state.customizationTab;
    tab.classList.toggle("active", selected); tab.setAttribute("aria-selected", String(selected));
  });
  let count = 0;
  $$("[data-settings-group]").forEach(section => {
    const rows = $$(".setting-row", section);
    const searchable = node => `${node.textContent} ${$$('strong,small,h3,label', node).map(item => translate(item.textContent.trim())).join(' ')}`.toLocaleLowerCase();
    rows.forEach(row => { row.hidden = query ? !searchable(row).includes(query) : !eligible(row); });
    const sectionText = searchable(section);
    section.hidden = query ? (rows.length ? rows.every(row => row.hidden) : !sectionText.includes(query))
      : section.dataset.settingsGroup !== state.customizationTab || !eligible(section);
    if (!section.hidden) count++;
  });
  for (const selector of ["#settings-form", "#customization-form"]) {
    const form = $(selector); form.hidden = !$$("[data-settings-group]", form).some(section => !section.hidden);
  }
  $("#settings-empty").hidden = count > 0;
}

function viewHeader(title, subtitle, action = "") { return `<div class="panel-header"><div><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(subtitle)}</p></div>${action}</div>`; }

function calibrationView() {
  const calibration = state.calibration;
  const status = state.calibrationError || (calibration
    ? `${Object.keys(calibration.models).length} 个模型 · ${calibration.source} · ${formatTimestamp(calibration.updatedAt, true)}`
    : "未导入校准档案");
  return `<form class="calibration-form" id="calibration-form">
    ${viewHeader("核验校准档案", `自定义校准数据 · ${status}`)}
    <label class="calibration-editor-label" for="calibration-json">Modivue 校准 JSON · v2</label>
    <textarea class="calibration-editor" id="calibration-json" name="calibration" spellcheck="false" required>${escapeHtml(calibration ? JSON.stringify(calibration, null, 2) : "")}</textarea>
    <div class="calibration-actions"><input type="file" id="calibration-file" accept=".json,application/json" aria-label="选择校准 JSON 文件"><button class="primary-button" type="submit">导入校准</button></div>
    <p class="calibration-message" id="calibration-message" role="status" data-tone="${state.calibrationError ? "error" : "info"}">${escapeHtml(state.calibrationError || "")}</p>
  </form>`;
}

function trustedCalibrationView() {
  return `<form class="calibration-form" id="trusted-calibration-form">
    ${viewHeader("可信 API 回答对照", "向你信任的渠道采集短答案分布，再用相同提示词和条件核验 Agent 渠道。信任来源由你选择，匹配度不等于身份认证。")}
    <div class="trusted-fields">
      <label>参考用途<select name="purpose"><option value="probability">短答案分布</option><option value="hlwy">HLWY 数字分布</option></select></label>
      <label>可信 API 地址<input name="baseUrl" type="url" placeholder="https://api.oaipro.com/v1" required></label>
      <label>API Key<input name="apiKey" type="password" autocomplete="off" required></label>
      <label>模型名称<input name="model" required placeholder="与待核验模型一致"><button class="text-button" type="button" data-trusted-action="models">获取模型列表</button><select name="modelList" data-trusted-models hidden></select></label>
      <label>API 协议<select name="wireApi"><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="messages">Anthropic Messages</option></select></label>
      <label>推理档位<select name="reasoningEffort"><option value="low">low</option><option value="">默认 / 未设置</option><option value="none">none</option><option value="minimal">minimal</option><option value="medium">medium</option><option value="high">high</option></select></label>
      <label>温度<input name="temperature" type="number" min="0.01" max="2" step="0.01" placeholder="留空使用提供方默认"></label>
      <label>正式采样次数<input name="repetitions" type="number" min="16" max="100" value="16" required></label>
      <label>每次输出上限<input name="maxOutputTokens" type="number" min="8" max="4096" value="128" required></label>
    </div>
    <label class="calibration-editor-label">短答案提示词<textarea class="calibration-editor trusted-prompt" name="prompt" maxlength="2000" placeholder="${escapeHtml(defaultShortPrompt)}"></textarea></label>
    <div class="calibration-actions"><button class="text-button" type="button" data-trusted-action="test">测试连接</button><button class="text-button" type="submit" value="preview">试采样 · 2 次</button><button class="primary-button" type="submit" value="collect">采集并保存可信分布</button><button class="text-button" type="button" id="trusted-stop">停止</button></div>
    <p class="muted">测试连接仅检查鉴权和模型目录，不产生推理采样。试采样与正式采样计入每日探测额度。Key 仅用于本轮请求。正式采样会替换该模型的校准档案；不会自动设定真伪阈值。</p>
    <div id="trusted-progress" role="status" aria-live="polite"></div>
  </form>`;
}

function configureTrustedPurpose(form, purpose) {
  const hlwy = purpose === "hlwy";
  form.elements.purpose.value = purpose;
  form.elements.prompt.value = hlwy ? hlwyPrompt : ""; form.elements.prompt.readOnly = hlwy;
  form.elements.temperature.value = hlwy ? "1" : ""; form.elements.temperature.readOnly = hlwy;
  form.elements.maxOutputTokens.value = hlwy ? "256" : "128"; form.elements.maxOutputTokens.readOnly = hlwy;
  form.elements.repetitions.min = hlwy ? "50" : "16"; form.elements.repetitions.value = hlwy ? "50" : "16";
}

async function refreshTrustedCalibration() {
  const container = $("#trusted-progress");
  if (!container) return;
  const job = await fetchJson("/api/iq/calibration/collect");
  const busy = job.status === "running";
  document.querySelectorAll('#trusted-calibration-form [type="submit"]').forEach(button => { button.disabled = busy; });
  $("#trusted-stop").disabled = !busy;
  if (job.status === "idle") { container.textContent = "尚未采样"; return; }
  container.innerHTML = `<p>${busy ? "正在采集可信端回答" : escapeHtml(job.message)} · ${job.completed}/${job.total}</p><progress max="${job.total}" value="${job.completed}"></progress><p class="muted">${escapeHtml(job.model)} · ${escapeHtml(job.baseUrl)}</p>${Object.entries(job.counts || {}).map(([answer, count]) => `<p><code>${escapeHtml(answer)}</code> × ${count}</p>`).join("")}`;
  if (job.status === "complete" && !job.preview) {
    state.calibration = (await fetchJson("/api/iq/calibration")).calibration;
    const editor = $("#calibration-json");
    if (editor && document.activeElement !== editor) editor.value = JSON.stringify(state.calibration, null, 2);
  }
}

async function collectTrusted(event) {
  const form = event.target;
  const payload = Object.fromEntries(new FormData(form));
  payload.preview = event.submitter?.value === "preview";
  try {
    await fetchJson("/api/iq/calibration/collect", { method: "POST", body: JSON.stringify(payload) });
    form.elements.apiKey.value = "";
    await refreshTrustedCalibration();
  } catch (error) { $("#trusted-progress").textContent = error.message; }
}

function publicBaselinesView() {
  const baselines = state.publicBaselines;
  return `<section class="baseline-registry">${viewHeader("公共分布基准", baselines?.fetchedAt ? `最近更新 ${formatTimestamp(baselines.fetchedAt, true)}` : "尚未读取基准状态", '<button class="text-button" data-action="sync-baselines">更新基准</button>')}
    <a href="https://github.com/hanlinwenyuan/hlwy-ai-checker/tree/main/baselines" target="_blank" rel="noreferrer">HLWY AI Checker</a>
    ${baselines?.error ? `<p class="calibration-message" data-tone="error">${escapeHtml(baselines.error)}</p>` : ""}
    <div class="baseline-models">${baselines?.models?.map((item) => `<div><strong>${escapeHtml(item.model)}</strong><span>${formatTimestamp(item.publishedAt, true)}</span></div>`).join("") || '<p class="muted">暂无公共基准</p>'}</div></section>`;
}

function customTestsView() {
  const model = selectedModel();
  const target = state.probe?.targets?.find(target => target.id === model?.id);
  const rows = state.questions.map(question => `<details class="question-item" data-detail-key="question-${escapeHtml(question.id)}"><summary><strong ${question.builtIn ? "" : 'translate="no"'}>${escapeHtml(question.title)}</strong><span><span>参考答案：</span><span translate="no">${escapeHtml(question.answer)}</span></span></summary><p class="question-prompt">${escapeHtml(question.prompt)}</p><p>${escapeHtml(question.method || (question.match === "exact" ? "完整答案比对" : "人工复核"))}</p><p>${escapeHtml(question.explanation || "")}</p>${question.source?.startsWith("https://") ? `<a href="${escapeHtml(question.source)}" target="_blank" rel="noreferrer">原始来源</a>` : `<small>${escapeHtml(question.source)}</small>`}<div class="question-actions"><button type="button" class="primary-button" data-fill-question="${escapeHtml(question.id)}">填入中间表单</button>${question.builtIn ? "" : `<button type="button" class="text-button" data-edit-question="${escapeHtml(question.id)}">编辑</button><button type="button" class="text-button" data-delete-test="${escapeHtml(question.id)}">删除</button>`}</div></details>`).join("");
  return `<section class="custom-tests-panel" data-settings-group="tests">${viewHeader("单问题测试", model ? `${model.label} · ${endpointLabel(model.endpoint)} · ${model.keyGroup || ""} · ${model.reasoningEffort || "默认"}` : "未选择模型")}<p>先填入中间表单，再将默认核验方式选择为“单问题测试”并点击核验。每次调用计入请求预算。</p><div class="custom-test-list">${rows}</div><form id="question-form" class="question-form"><input name="id" type="hidden"><label>题目名称<input name="title" maxlength="120" required></label><label>问题<textarea name="prompt" maxlength="8000" required></textarea></label><label>参考答案<textarea name="answer" maxlength="2000" required></textarea></label><label>判定方式<select name="match"><option value="exact">完整答案比对</option><option value="review">人工复核</option></select></label><div class="question-actions"><button type="submit" class="primary-button">保存并选用</button><button type="button" class="text-button" data-action="question-verification">前往模型核验</button><button type="reset" class="text-button">清空</button></div><p id="question-message" role="status">${escapeHtml(state.questionError || "")}</p></form><section class="method-references"><h3>备选方案</h3>${verificationReferences.map(item => `<details data-detail-key="method-${escapeHtml(item.title)}"><summary>${escapeHtml(item.title)} · ${item.status}</summary><p>${escapeHtml(item.detail)}</p><a href="${item.url}" target="_blank" rel="noreferrer">${item.url}</a>${item.evaluatorId ? `<button type="button" class="text-button" data-use-method="${item.evaluatorId}">选用此方法</button>` : ""}</details>`).join("")}</section></section>`;
}

async function loadQuestions() {
  try { state.questions = (await fetchJson("/api/questions")).questions; state.questionError = null; }
  catch (error) { state.questionError = error.message; }
}

async function saveCustomQuestion(form) {
  try {
    const values = Object.fromEntries(new FormData(form));
    const original = state.questions.find(question => question.id === form.dataset.sourceId);
    let question = original && ["title", "prompt", "answer", "match"].every(key => original[key] === values[key]) ? original : null;
    if (!question) {
      const result = await fetchJson("/api/questions", { method: "POST", body: JSON.stringify(values) });
      state.questions = result.questions; question = result.question;
    }
    const result = await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify({ evaluatorId: "custom-question", defaultQuestionId: question.id }) });
    state.settings = { ...state.settings, ...result.settings };
    renderActiveView();
    showToast("题目已保存并选用 · 可到模型核验执行");
  } catch (error) { $("#question-message").textContent = error.message; }
}

async function importCalibration(form) {
  const submit = form.querySelector('[type="submit"]');
  const message = form.querySelector(".calibration-message");
  submit.disabled = true;
  message.textContent = "正在校验校准档案";
  message.dataset.tone = "info";
  try {
    const payload = JSON.parse(form.elements.calibration.value);
    const result = await fetchJson("/api/iq/calibration", { method: "PUT", body: JSON.stringify(payload) });
    state.calibration = result.calibration;
    state.calibrationError = null;
    form.elements.calibration.value = JSON.stringify(result.calibration, null, 2);
    message.textContent = `已导入 ${Object.keys(result.calibration.models).length} 个模型的校准档案`;
  } catch (error) {
    message.dataset.tone = "error";
    message.textContent = `导入失败：${error.message}`;
  } finally { submit.disabled = false; }
}

// Patch live reports in place: native selects, disclosures and scroll containers
// retain their identity across polling. A different report gets different keys.
function reconcileContent(container, markup) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const key = node => node.nodeType === 1 ? node.id || node.dataset.detailKey || node.dataset.reportKey || "" : "";
  const compatible = (left, right) => left?.nodeName === right.nodeName && key(left) === key(right);
  const patch = (parent, source) => {
    let cursor = parent.firstChild;
    for (const fresh of [...source.childNodes]) {
      let live = cursor;
      if (!compatible(live, fresh)) {
        live = key(fresh) ? [...parent.childNodes].find(node => compatible(node, fresh)) : null;
        if (live) parent.insertBefore(live, cursor);
        else { live = fresh.cloneNode(true); parent.insertBefore(live, cursor); cursor = live.nextSibling; continue; }
      }
      if (live.nodeType === Node.TEXT_NODE) {
        if (live.nodeValue !== fresh.nodeValue && live.nodeValue !== translate(fresh.nodeValue.trim())) live.nodeValue = fresh.nodeValue;
      } else if (live.nodeType === Node.ELEMENT_NODE) {
        // A form belongs to one target and keeps user edits while its job polls.
        if (live.tagName === "FORM" && live.dataset.targetId === fresh.dataset.targetId) {
          const submit = $("button[type=submit]", live), next = $("button[type=submit]", fresh);
          if (submit && next) submit.disabled = next.disabled;
        } else {
          for (const attribute of [...live.attributes]) {
            if (attribute.name !== "open" && !fresh.hasAttribute(attribute.name)) live.removeAttribute(attribute.name);
          }
          for (const attribute of fresh.attributes) {
            if (attribute.name !== "open" && live.getAttribute(attribute.name) !== attribute.value) live.setAttribute(attribute.name, attribute.value);
          }
          patch(live, fresh);
          if (live.tagName === "SELECT" && live !== document.activeElement) live.value = fresh.value;
        }
      }
      cursor = live.nextSibling;
    }
    while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
  };
  patch(container, template.content);
}

function renderActiveView() {
  const viewContent = $("#view-content");
  const remoteForm = $("#bazaarlink-form");
  const openDetails = new Map($$("details[data-detail-key]", viewContent)
    .map((details) => [details.dataset.detailKey, details.open]));
  viewContent.hidden = state.view === "overview";
  if (state.view === "overview") { viewContent.innerHTML = ""; return; }
  const views = { models: modelsView, routes: routesView, cache: cacheView, ttft: ttftView, quality: qualityView, alerts: alertsView, logs: logsView, settings: settingsView };
  const markup = (views[state.view] || modelsView)();
  if (["quality", "logs"].includes(state.view) && viewContent.dataset.renderedView === state.view) {
    reconcileContent(viewContent, markup);
  } else viewContent.innerHTML = markup;
  viewContent.dataset.renderedView = state.view;
  const nextRemoteForm = $("#bazaarlink-form");
  if (remoteForm && nextRemoteForm !== remoteForm && nextRemoteForm?.dataset.targetId === remoteForm.dataset.targetId) {
    $("button[type=submit]", remoteForm).disabled = $("button[type=submit]", nextRemoteForm).disabled;
    nextRemoteForm.replaceWith(remoteForm);
  }
  if (state.view === "settings") {
    viewContent.insertAdjacentHTML("beforeend", publicBaselinesView() + customizationView() + customTestsView() + trustedCalibrationView() + calibrationView());
    void refreshTrustedCalibration().catch(() => {});
  }
  if (state.view === "routes") renderRouteCharts();
  if (state.view === "cache") {
    const points = metricPoints("cache");
    $("#cache-view-chart").innerHTML = points.length ? chartSvg([{ points, color: colors.blue, area: true }], { minimum: 0, maximum: 100, tickLabel: (value) => `${Math.round(value)}%`, label: "Cache 命中率趋势" }) : `<div class="empty-state chart-empty">当前模型暂无 Cache 样本。</div>`;
  }
  if (state.view === "ttft") {
    const points = metricPoints("ttftRaw");
    const maximum = points.length ? Math.max(state.settings.ttftThresholdMs, ...points.map((point) => point.value)) * 1.1 : state.settings.ttftThresholdMs;
    $("#ttft-view-chart").innerHTML = points.length ? chartSvg([{ points, color: colors.violet, area: true }], { minimum: 0, maximum, tickLabel: (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`, label: "TTFT 趋势" }) : `<div class="empty-state chart-empty">当前模型暂无 TTFT 样本。</div>`;
  }
  if (state.view === "settings") {
    const form = $("#settings-form");
    const evaluatorRow = document.createElement("div");
    evaluatorRow.className = "setting-row";
    const evaluatorRequirement = { "bazaarlink-probe": "官方远程检测 · 逐目标启用并可持续运行", ztest: "网站检测与报告导入 · 不参与后台自动核验", juice: "单次原始观测；可选可信校准对照", "probability-probe": "需导入同条件分布校准", "hlwy-fingerprint": "使用公共分布；可选可信 API 对照", "meow-fingerprint": "公开 benchmark；协议需匹配", "custom-question": "单问题答案比对" };
    evaluatorRow.innerHTML = `<div><strong>默认核验方案</strong><small>主界面中心指标与主动核验使用此方案；${escapeHtml(evaluatorRequirement[state.settings.evaluatorId] || "运行时会显示具体前置条件")}</small></div><select class="setting-control" name="evaluatorId">${state.evaluators.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)} · ${escapeHtml(evaluatorRequirement[item.id] || "运行时检查条件")}</option>`).join("")}</select>`;
    $(".view-columns article:first-child", form).append(evaluatorRow);
    $(".view-columns article:last-child", form).insertAdjacentHTML("beforeend", `<div class="setting-row"><div><strong>HLWY 每轮样本数</strong><small>当前 HLWY 运行至少需要 50 次有效采样；该约束不阻止保存其他设置。</small></div><label class="number-control"><input type="number" name="verificationSamples" min="1" max="500" step="1" value="${state.settings.verificationSamples}"><span>次</span></label></div>`);
    form.elements.probeIntervalMinutes.value = String(state.settings.probeIntervalMinutes);
    form.elements.defaultHours.value = String(state.settings.defaultHours);
    if (form.elements.evaluatorId) form.elements.evaluatorId.value = state.settings.evaluatorId || "meow-fingerprint";
    evaluatorRow.insertAdjacentHTML("afterend", `<div class="setting-row"><div><strong>Meow 核验强度</strong><small>筛查档 6 次（每个探针 1 次，仅作快速证据）；完整 benchmark：GPT 32 / 48 / 96 次、Claude 48 / 72 / 120 次。使用上游 4.5.4 的公开基准与兼容协议；筛查档是 Modivue 的省量模式，没有强指向判定线。</small></div><select class="setting-control" name="meowTier"><option value="screen">筛查 · 6 次</option><option value="low">完整快速 · GPT 32 / Claude 48 次</option><option value="medium">标准 · GPT 48 / Claude 72 次</option><option value="high">深入 · GPT 96 / Claude 120 次</option></select></div>`);
    form.elements.meowTier.value = state.settings.meowTier;
    evaluatorRow.insertAdjacentHTML("afterend", `<div class="setting-row"><div><strong>当前测试题目</strong><small>在题库中填入并选用，也可从这里切换。</small></div><select class="setting-control" name="defaultQuestionId">${state.questions.map(question => `<option ${question.builtIn ? "" : 'translate="no"'} value="${escapeHtml(question.id)}" ${question.id === state.settings.defaultQuestionId ? "selected" : ""}>${escapeHtml(question.title)}</option>`).join("")}</select></div>`);
    evaluatorRow.insertAdjacentHTML("afterend", `<div class="setting-row"><div><strong>模型核验间隔</strong><small>从上轮核验结束计时，在本轮工作结束后的空闲窗口执行</small></div><label class="number-control"><input type="number" name="verificationIntervalMinutes" min="15" max="1440" step="1" value="${state.settings.verificationIntervalMinutes}"><span>分钟</span></label></div><div class="setting-row"><div><strong>核验请求间隔</strong><small>串行请求；失败时额外退避重试</small></div><label class="number-control"><input type="number" name="verificationRequestDelaySeconds" min="1" max="60" step="1" value="${state.settings.verificationRequestDelaySeconds}"><span>秒</span></label></div>`);
    if (!form.elements.probeIntervalMinutes.value) form.elements.probeIntervalMinutes.add(new Option(`${state.settings.probeIntervalMinutes} 分钟`, String(state.settings.probeIntervalMinutes), true, true));
    if (!form.elements.defaultHours.value) form.elements.defaultHours.add(new Option(formatRange(state.settings.defaultHours), String(state.settings.defaultHours), true, true));
    mountSettingsNavigation();
  }
  for (const [key, open] of openDetails) $$(`details[data-detail-key="${CSS.escape(key)}"]`, viewContent).forEach(details => { details.open = open; });
}

function renderAll({ preserveSettings = false } = {}) {
  renderGlobalFilters();
  renderOverview();
  if (!(preserveSettings && state.view === "settings")) renderActiveView();
  updateRangeControl();
}

async function loadSelectedSamples() {
  const model = selectedModel();
  if (!model || model.status === "unsampled") { state.selectedSamples = []; return; }
  const query = queryString({ hours: state.rangeHours, canonicalModelId: model.canonicalModelId || undefined,
    model: model.canonicalModelId ? undefined : model.observedModel, baseUrl: model.endpoint, keyGroup: model.keyGroup,
    reasoningEffort: model.reasoningEffort || "", limit: 5000 });
  const payload = await fetchJson(`/api/samples?${query}`);
  if (selectedModel()?.id === model.id) state.selectedSamples = payload.samples || [];
}

let pendingObservationRefresh = false;
async function refreshObservations({ quiet = false } = {}) {
  if (state.refreshing) { pendingObservationRefresh = true; return; }
  state.refreshing = true;
  if (!quiet) setLiveStatus("读取数据", "loading");
  const settingsReadRevision = settingsRevision;
  const query = queryString({ hours: state.rangeHours });
  const [summaryResult, qualityResult, eventResult, logResult, probeResult] = await Promise.allSettled([
    fetchJson(`/api/summary?${query}`), fetchJson(`/api/quality/runs?${query}`), fetchJson(`/api/events?${query}`), fetchJson(`/api/samples?${queryString(globalQuery())}&limit=500`), fetchJson("/api/settings")
  ]);
  if (probeResult.status === "fulfilled") {
    state.probe = probeResult.value.probe || null;
    acceptSettings(probeResult.value.settings, settingsReadRevision);
  }
  const failures = [summaryResult, qualityResult, eventResult, logResult].filter((result) => result.status === "rejected");
  if (qualityResult.status === "fulfilled") {
    state.qualityRuns = qualityResult.value.history || qualityResult.value.runs || [];
    state.questionWindows = qualityResult.value.questionWindows || {};
  }
  state.summaryGroups = summaryResult.status === "fulfilled" ? summaryResult.value.groups || [] : [];
  updateModels(state.summaryGroups);
  if (eventResult.status === "fulfilled") {
    state.events = eventResult.value.events || [];
    if (Object.hasOwn(eventResult.value, "acknowledgedAt")) state.settings.acknowledgedAt = eventResult.value.acknowledgedAt;
  }
  if (logResult.status === "fulfilled") state.logs = logResult.value.samples || [];
  try { await loadSelectedSamples(); } catch (error) { state.selectedSamples = []; failures.push({ reason: error }); }
  state.dataError = failures[0]?.reason?.message || null;
  state.lastUpdatedAt = new Date().toISOString();
  state.refreshing = false;
  notifyNewEvents();
  renderAll({ preserveSettings: quiet });
  setLiveStatus(state.dataError ? "部分数据不可用" : `已同步 ${formatTimestamp(state.lastUpdatedAt)}`, state.dataError ? "error" : "ready");
  if (pendingObservationRefresh) {
    pendingObservationRefresh = false;
    await refreshObservations({ quiet });
  }
}

async function loadSettings({ applyDefaultRange = true } = {}) {
  try {
    const revision = settingsRevision;
    const payload = await fetchJson("/api/settings");
    acceptSettings(payload.settings, revision);
    state.probe = payload.probe || null;
    if (applyDefaultRange) state.rangeHours = Number(state.settings.defaultHours);
  } catch (error) { state.dataError = error.message; setLiveStatus("设置读取失败", "error"); }
  updateRangeControl();
  const range = $("#range-select");
  if (!range.querySelector('option[value="0"]')) range.add(new Option("全部历史", "0"));
}

async function loadConfig() { try { state.config = await fetchJson("/api/config"); } catch { state.config = null; } }
async function loadCalibration() {
  try { state.calibration = (await fetchJson("/api/iq/calibration")).calibration || null; state.calibrationError = null; }
  catch (error) { state.calibrationError = `校准档案读取失败：${error.message}`; }
}
async function loadEvaluators() {
  const [evaluators, baselines] = await Promise.allSettled([fetchJson("/api/quality/evaluators"), fetchJson("/api/quality/baselines")]);
  state.evaluators = evaluators.status === "fulfilled" ? evaluators.value.evaluators || [] : [];
  state.publicBaselines = baselines.status === "fulfilled" ? baselines.value : null;
}

async function loadAgents() {
  const status = $("#agent-status");
  try {
    const agentPayload = await fetchJson("/api/agents");
    const agents = agentPayload.agents || [];
    state.supportedAgents = agentPayload.supportedAgents || [];
    state.agents = agents;
    updateModels(state.summaryGroups);
    const live = agents.filter((agent) => agent.sessionId && !agent.parentSessionId && !agent.endedAt);
    const passive = live.filter((agent) => agent.baseUrl && !agent.proxyBaseUrl && !isModivueProxyEndpoint(agent.baseUrl));
    status.className = live.length ? "catalog-status ready" : "catalog-status warning";
    const rollout = live.filter((agent) => Number.isFinite(agent.passiveMetrics?.cacheHitRate));
    const strategyLabel = !state.settings.probeEnabled ? "主动检测已关闭" : { adaptive: "自适应低频检测", idle: "空闲时检测", manual: "仅手动检测" }[state.settings.probeStrategy];
    const ready = state.supportedAgents.filter((item) => item.installed && item.configParsed && item.modelConfigured && item.credentialConfigured).length;
    const configured = state.supportedAgents.filter((item) => item.configCapability === "selected-provider" && item.configParsed).length;
    const presenceOnly = state.supportedAgents.length - configured;
    const capabilityTitle = state.supportedAgents.map((item) => {
      const installLabel = !item.installed ? "未发现命令" : item.scope === "isolated" ? "已安装（隔离环境）" : "已安装";
      const stateLabel = !item.installed ? "未发现命令" : item.credentialConfigured ? `${installLabel} · 模型/凭据可解析` : item.modelConfigured ? `${installLabel} · 未检测到独立凭据` : item.configFound ? `${installLabel} · 配置未解析模型` : `${installLabel} · 尚未配置`;
      const verificationLabel = item.adapterVerification === "PASS" ? " · 隔离适配回归通过" : "";
      return `${item.label}：${stateLabel}${verificationLabel}`;
    }).join("\n");
    status.title = capabilityTitle;
    const isolated = state.supportedAgents.filter((item) => item.scope === "isolated").length;
    status.innerHTML = live.length ? `<span class="status-dot"></span>${live.length} 个 Agent · ${live.map(agentTag).join(" ")}<small class="agent-observe-note">${strategyLabel}${rollout.length ? ` · 已读取 ${rollout.length} 个 Codex rollout Cache` : passive.length ? " · 直连会话无被动 Cache" : ""} · 已检查 ${state.supportedAgents.length} 个 CLI（${ready} 个已安装且可解析${isolated ? `，${isolated} 个来自隔离环境` : ""}${configured ? `，${configured} 个有配置记录` : ""}${presenceOnly ? `，${presenceOnly} 个仅进程发现` : ""}）</small>` : `<span class="status-dot pending-dot"></span>等待运行中的 coding agent<small class="agent-observe-note">已检查 ${state.supportedAgents.length} 个 CLI；悬停查看安装、配置和凭据状态</small>`;
    renderAll({ preserveSettings: true });
  } catch { state.agents = []; updateModels(state.summaryGroups); status.className = "catalog-status error"; status.innerHTML = `<span class="status-dot pending-dot"></span>Agent 配置读取失败`; }
}

async function syncCatalog(force = false) {
  const status = $("#catalog-status");
  status.className = "catalog-status";
  status.innerHTML = `<span class="status-dot pending-dot"></span>正在同步标准模型目录`;
  try {
    const synced = await fetchModelCatalog(globalThis.fetch, force ? "/api/model-catalog?refresh=1" : "/api/model-catalog");
    state.catalog = synced.models;
    updateModels(state.summaryGroups);
    status.className = synced.status === "stale" ? "catalog-status warning" : "catalog-status ready";
    status.innerHTML = `<span class="status-dot"></span>${synced.status === "stale" ? "使用缓存目录" : "标准目录已同步"} · ${state.catalog.length.toLocaleString(currentLocale())} 个模型`;
    $("#catalog-footer").textContent = `${synced.status === "stale" ? "缓存" : "已同步"} ${state.catalog.length.toLocaleString(currentLocale())} 个模型`;
    renderAll();
  } catch { status.className = "catalog-status error"; status.innerHTML = `<span class="status-dot pending-dot"></span>标准目录不可用 · 保留观测模型名`; $("#catalog-footer").textContent = "不可用"; }
}

function setView(view) {
  if (state.view === "settings" && view !== "settings") void flushSettingsDraft();
  state.view = view;
  renderGlobalFilters();
  const titles = { overview: "概览", models: "模型", routes: "路由", cache: "Cache", ttft: "TTFT", quality: "模型核验", alerts: "告警", logs: "日志", settings: "设置" };
  $("#page-title").textContent = titles[view] || "概览";
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".overview-only").forEach((element) => { element.hidden = view !== "overview"; });
  $("#model-strip").hidden = view !== "overview";
  renderActiveView();
  animateContent(view === "overview" ? $("#metric-grid") : $("#view-content"));
  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
}

async function saveSettings(form) {
  for (const input of [...form.elements]) if (input.name && !input.disabled && input.type !== "submit") scheduleSettingsSave(input);
  await flushSettingsDraft();
  if (!settingsDraft.size) showToast("设置已保存并应用", "success");
}

async function acknowledgeAlerts() {
  try {
    const payload = await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify({ acknowledgedAt: new Date().toISOString() }) });
    state.settings = { ...state.settings, ...payload.settings }; state.probe = payload.probe || state.probe; renderAll(); showToast("全部告警已标记为已读");
  } catch (error) { showToast(`操作失败：${error.message}`, "error"); }
}

async function runQuality({ evaluatorId = state.settings.evaluatorId, questionId = state.settings.defaultQuestionId } = {}) {
  const model = selectedModel();
  if (!state.evaluators.length || !model) return;
  try {
    const results = [];
    for (const evaluator of state.evaluators.filter((item) => item.id === evaluatorId)) results.push(await fetchJson("/api/quality/run", { method: "POST", body: JSON.stringify({ evaluatorId: evaluator.id, questionId,
      protocol: model.provider, baseUrl: model.endpoint, keyGroup: model.keyGroup, observedModel: model.observedModel,
      canonicalModelId: model.canonicalModelId, reasoningEffort: model.reasoningEffort, conditionsId: evaluator.conditionsId }) }));
    showToast(results.some(result => result.status === "queued") ? "核验已排队，本轮工作结束后开始" : "核验已开始，可在面板查看采样进度"); await refreshObservations({ quiet: true }); }
  catch (error) { showToast(`核验失败：${error.message}`, "error"); }
}

async function runProbe() {
  const button = $("#refresh-button"); const original = button.innerHTML; button.disabled = true; button.innerHTML = "<span class=\"spin\">↻</span>采样中";
  try {
    const payload = await fetchJson("/api/probe", { method: "POST", body: "{}" }); const results = payload.results || [];
    const successful = results.filter((result) => result.status === "ok").length; const exhausted = results.some((result) => result.status === "budget_exhausted");
    await Promise.all([refreshObservations({ quiet: true }), loadSettings({ applyDefaultRange: false })]);
    showToast(exhausted ? "已达到今日主动探测上限" : successful ? `主动采样完成：${successful}/${results.length}` : "没有可用的主动探测目标", exhausted ? "warning" : "success");
  } catch (error) { showToast(`主动采样失败：${error.message}`, "error"); }
  finally { button.disabled = false; button.innerHTML = original; }
}

function bindEvents() {
  const applyFilters = async () => {
    state.selectedSamples = [];
    updateModels(state.summaryGroups);
    renderAll();
    await refreshObservations({ quiet: true });
  };
  $("#global-filters").addEventListener("change", async (event) => {
    const field = event.target.dataset.filter;
    if (!Object.hasOwn(state.filters, field)) return;
    state.filters[field] = event.target.value;
    await applyFilters();
  });
  $("#search-launcher").addEventListener("click", openSearch);
  $("#search-close").addEventListener("click", closeSearch);
  $("#search-dialog").addEventListener("close", () => document.body.classList.remove("search-open"));
  $("#search-dialog").addEventListener("click", event => { if (event.target === event.currentTarget) closeSearch(); });
  $("#search-dialog").addEventListener("wheel", event => event.preventDefault(), { passive: false });
  $("#search-dialog").addEventListener("touchmove", event => event.preventDefault(), { passive: false });
  for (const [id, delta] of [["search-previous", -1], ["search-next", 1]]) $("#" + id).onclick = () => applyGlobalSearch($("#global-search").value, searchPage + delta);
  $("#global-search").addEventListener("input", event => applyGlobalSearch(event.target.value));
  $("#search-dialog").addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closeSearch(); return; }
    const buttons = $$("#global-search-results button");
    const current = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    }
    if (event.key === "Enter" && event.target.id === "global-search") { event.preventDefault(); void openSearchResult(searchPage * searchPageSize()); }
  });
  $("#global-search-results").addEventListener("click", event => {
    const button = event.target.closest("[data-search-result]");
    if (button) void openSearchResult(Number(button.dataset.searchResult));
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
  });
  window.addEventListener("resize", () => { if ($("#search-dialog").open) applyGlobalSearch($("#global-search").value, searchPage); });
  $("#clear-filters").addEventListener("click", async () => {
    Object.keys(state.filters).forEach((key) => { state.filters[key] = ""; });
    await applyFilters();
  });
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  $$('[data-view-link]').forEach((item) => item.addEventListener("click", () => setView(item.dataset.viewLink)));
  $("#range-select").addEventListener("change", async (event) => { state.rangeHours = Number(event.target.value); await refreshObservations(); });
  $("#theme-toggle").addEventListener("click", async () => {
    const themePreset = document.body.classList.contains("light") ? "graphite" : "light";
    try {
      const result = await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify({ themePreset }) });
      state.settings = { ...state.settings, ...result.settings }; applyAppearance();
    } catch (error) { showToast(`主题保存失败：${error.message}`, "error"); }
  });
  $("#refresh-button").addEventListener("click", runProbe);
  $("#island-settings").addEventListener("click", () => desktopMode === "island"
    ? desktopMessage({ type: "open-main", view: "settings" }) : setView("settings"));
  $("#island-buffer").addEventListener("click", () => enterIslandState({ type: "border" }));
  $("#island-expand").addEventListener("click", () => {
    if (desktopMode === "island") { desktopMessage({ type: "open-main" }); return; }
    const island = $("#quick-island"); const expanded = island.classList.toggle("expanded");
    $("#island-expand").setAttribute("aria-expanded", String(expanded));
  });
  $("#quick-island").addEventListener("pointermove", (event) => { const island = event.currentTarget; const bounds = island.getBoundingClientRect(); island.style.setProperty("--pointer-y", `${clamp(event.clientY - bounds.top, 24, bounds.height - 24)}px`); island.style.setProperty("--tail-stretch", String(0.75 + clamp((bounds.left - event.clientX + 70) / 180, 0, 0.55))); });
  $("#view-content").addEventListener("click", async (event) => {
    const ringStyle = event.target.closest("[data-ring-style]");
    if (ringStyle && ringStyle.tagName === "BUTTON") {
      $("#customization-form [name=ringStyle]").value = ringStyle.dataset.ringStyle;
      $$(".ring-style-previews button").forEach(button => button.setAttribute("aria-pressed", String(button === ringStyle)));
      return;
    }
    const settingsTab = event.target.closest("[data-settings-tab]");
    if (settingsTab) { state.customizationTab = settingsTab.dataset.settingsTab; state.customizationQuery = ""; $("#customization-search").value = ""; updateSettingsVisibility(); animateContent($("#settings-form")); return; }
    const modelButton = event.target.closest("[data-select-model]");
    if (modelButton) { state.selectedModelId = modelButton.dataset.selectModel; await loadSelectedSamples(); renderAll();
      const metric = event.target.closest(".blue-text") ? "cache" : event.target.closest(".violet-text") ? "ttft" : event.target.closest(".mint-text") ? "quality" : null;
      if (metric) setView(metric); return; }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "replay-tour") { startTour(); return; }
    if (action === "island-tour") {
      if (desktopMode === "main") desktopMessage({ type: "start-island-tour" });
      else if (desktopMode === "island") startTour();
      else window.open(`${location.origin}/?desktop=island&tour=1`, "modivue-island-tour", "width=570,height=760");
      return;
    }
    const fillQuestion = event.target.closest("[data-fill-question]");
    if (fillQuestion) {
      const question = state.questions.find(item => item.id === fillQuestion.dataset.fillQuestion);
      const form = $("#question-form");
      if (question && form) {
        for (const key of ["title", "prompt", "answer", "match"]) form.elements[key].value = question[key] || "";
        form.elements.id.value = question.builtIn ? "" : question.id;
        form.dataset.sourceId = question.id;
        try {
          const result = await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify({ evaluatorId: "custom-question", defaultQuestionId: question.id }) });
          state.settings = { ...state.settings, ...result.settings };
          $("#settings-form [name=evaluatorId]").value = "custom-question";
          $("#settings-form [name=defaultQuestionId]").value = question.id;
          updateSettingsVisibility();
          $("#question-message").textContent = "已选为当前测试题目。修改内容后先保存，再到模型核验执行。";
          form.scrollIntoView({ block: "center", behavior: "smooth" });
          showToast("题目已填入并选用 · 单问题测试");
        } catch (error) { showToast(error.message, "error"); }
      }
      return;
    }
    const questionButton = event.target.closest("[data-run-question]");
    if (questionButton) { await runQuality({ evaluatorId: "custom-question", questionId: questionButton.dataset.runQuestion }); setView("quality"); return; }
    const editQuestion = event.target.closest("[data-edit-question]");
    if (editQuestion) { const question = state.questions.find(question => question.id === editQuestion.dataset.editQuestion); const form = $("#question-form"); for (const key of ["id", "title", "prompt", "answer", "match"]) form.elements[key].value = question[key]; form.scrollIntoView({ block: "center" }); return; }
    if (event.target.closest("[data-delete-test]")) {
      const id = event.target.closest("[data-delete-test]").dataset.deleteTest;
      if (!confirm(translate("删除这个自定义题目？历史测试记录会保留。"))) return;
      try { state.questions = (await fetchJson("/api/questions", { method: "DELETE", body: JSON.stringify({ id }) })).questions; $(".custom-tests-panel").outerHTML = customTestsView(); }
      catch (error) { showToast(error.message, "error"); }
      return;
    }
    const methodButton = event.target.closest("[data-use-method]");
    if (methodButton) {
      try { await persistSettingsPatch({ evaluatorId: methodButton.dataset.useMethod }); state.customizationTab = "verification"; setView("settings"); showToast("所有更改已保存", "success"); }
      catch (error) { showToast(error.message, "error"); }
      return;
    }
    if (action === "test-notification") {
      try {
        await persistSettingsPatch({ notifications: true });
        if (state.settings.notifications) {
          const title = "Modivue", body = translate("通知功能已开启");
          if (hasDesktopBridge()) await desktopRequest({ type: "notify", title, body, id: `test-${Date.now()}` });
          else new Notification(title, { body });
          showToast("测试通知已交给系统", "success");
        }
      } catch (error) { showToast(error.message, "error"); }
      return;
    }
    if (action === "sync-catalog") await syncCatalog(true);
    if (action === "sync-baselines") {
      const button = event.target.closest("button");
      button.disabled = true;
      try {
        state.publicBaselines = await fetchJson("/api/quality/baselines/sync", { method: "POST" });
        $(".baseline-registry").outerHTML = publicBaselinesView();
        showToast(state.publicBaselines.error || "公共基准已更新", state.publicBaselines.error ? "warning" : "success");
      } catch (error) { button.disabled = false; showToast(`更新失败：${error.message}`, "error"); }
    }
    if (action === "bazaarlink-start" || action === "bazaarlink-stop") { await bazaarlinkAction(action.split("-")[1]); return; }
    if (action === "question-verification") { setView("quality"); return; }
    if (action === "run-quality") await runQuality();
    if (action === "export-distribution") {
      const runs = qualityRunsForModel(selectedModel());
      const archive = distributionArchive(runs.find(run => String(run.id) === state.qualityReportId) || runs[0]);
      if (archive) try { await exportText("modivue-distribution.json", JSON.stringify(archive, null, 2), "application/json"); }
      catch (error) { showToast(`导出失败：${error.message}`, "error"); }
      return;
    }
    if (action === "export-quality") {
      const model = selectedModel();
      const report = { version: 1, generatedAt: new Date().toISOString(), identity: identityParts(model), hours: state.rangeHours,
        summary: model.verification, runs: qualityRunsForModel(model) };
      try { await exportText("modivue-verification.json", JSON.stringify(report, null, 2), "application/json"); }
      catch (error) { showToast(`导出失败：${error.message}`, "error"); }
    }
    if (action === "ack-alerts") await acknowledgeAlerts();
    if (action === "export-logs") {
      try {
        const response = await fetch(`/api/samples/export?${queryString(globalQuery())}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await exportText("modivue-samples.jsonl", await response.text(), "application/x-ndjson");
      } catch (error) { showToast(`导出失败：${error.message}`, "error"); }
    }
  });
  $("#view-content").addEventListener("submit", async (event) => {
    if (event.target.id === "bazaarlink-form") { event.preventDefault(); await saveBazaarlinkPlan(event.target); }
    if (event.target.id === "bazaarlink-import-form") { event.preventDefault(); await importBazaarlink(event.target); }
    if (event.target.id === "ztest-import-form") { event.preventDefault(); await importZtestReport(event.target); }
    if (event.target.id === "settings-form") { event.preventDefault(); await saveSettings(event.target); }
    if (event.target.id === "calibration-form") { event.preventDefault(); await importCalibration(event.target); }
    if (event.target.id === "trusted-calibration-form") { event.preventDefault(); await collectTrusted(event); }
    if (event.target.id === "customization-form") { event.preventDefault(); await saveCustomization(event.target); }
    if (event.target.getAttribute("id") === "question-form") { event.preventDefault(); await saveCustomQuestion(event.target); }
  });
  $("#view-content").addEventListener("change", async (event) => {
    if (event.target.name === "ringStyle") $$(".ring-style-previews button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.ringStyle === event.target.value)));
    if (["evaluatorId", "juiceMode", "hlwySource"].includes(event.target.name)) updateSettingsVisibility();
    if (event.target.name === "purpose") configureTrustedPurpose(event.target.form, event.target.value);
    if (event.target.name === "evaluatorId" && ["probability-probe", "hlwy-fingerprint"].includes(event.target.value)) {
      const form = $("#trusted-calibration-form"), purpose = event.target.value === "hlwy-fingerprint" ? "hlwy" : "probability";
      if (form.elements.purpose.value !== purpose) configureTrustedPurpose(form, purpose);
    }
    if (["quality-method-select", "quality-question-select"].includes(event.target.id)) {
      const key = event.target.id === "quality-method-select" ? "evaluatorId" : "defaultQuestionId";
      const value = event.target.value;
      state.settings[key] = value; state.questionWindows = {};
      updateModels(state.summaryGroups); renderActiveView(); animateContent($("#view-content"));
      try { await persistSettingsPatch({ [key]: value }); showToast("所有更改已保存", "success"); }
      catch (error) { showToast(`保存失败：${error.message}`, "error"); }
      return;
    }
    if (event.target.id === "quality-report-select") { state.qualityReportId = event.target.value; renderActiveView(); animateContent($("#quality-history .historical-report")); return; }
    const changedSettings = event.target.closest("#settings-form");
    if (changedSettings && event.target.name) scheduleSettingsSave(event.target);
    const changedCustomization = event.target.closest("#customization-form");
    if (changedCustomization && event.target.name) scheduleSettingsSave(event.target);
    if (event.target.id !== "calibration-file") return;
    const file = event.target.files[0];
    if (!file) return;
    const message = $("#calibration-message");
    try {
      if (file.size > 1024 * 1024) throw new Error("校准文件不能超过 1 MB");
      $("#calibration-json").value = JSON.stringify(JSON.parse(await file.text()), null, 2);
      message.dataset.tone = "info";
      message.textContent = `已读取 ${file.name}`;
    } catch (error) { message.dataset.tone = "error"; message.textContent = `读取失败：${error.message}`; }
  });
  $("#view-content").addEventListener("click", async (event) => {
    const trustedAction = event.target.closest("[data-trusted-action]")?.dataset.trustedAction;
    if (trustedAction) {
      const form = $("#trusted-calibration-form");
      try {
        const payload = { baseUrl: form.elements.baseUrl.value, apiKey: form.elements.apiKey.value, wireApi: form.elements.wireApi.value };
        if (trustedAction === "test") {
          const result = await fetchJson("/api/iq/calibration/test-connection", { method: "POST", body: JSON.stringify(payload) });
          showToast(result.message || "连接成功", "success");
        } else {
          const result = await fetchJson("/api/iq/calibration/models", { method: "POST", body: JSON.stringify(payload) });
          const select = form.elements.modelList; select.innerHTML = '<option value="">请选择模型</option>' + result.models.map(model => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join(""); select.hidden = !result.models.length;
          select.onchange = () => { if (select.value) form.elements.model.value = select.value; };
          showToast(result.models.length ? `已获取 ${result.models.length} 个模型` : "未返回模型列表", result.models.length ? "success" : "warning");
        }
      } catch (error) { showToast(`可信 API 操作失败：${error.message}`, "error"); }
      return;
    }
    if (event.target.id === "trusted-stop") {
      await fetchJson("/api/iq/calibration/collect", { method: "DELETE" });
      $("#trusted-progress").textContent = "正在停止；当前请求结束后不再采样";
    }
  });
  $("#view-content").addEventListener("input", (event) => {
    if (event.target.id === "log-search") { state.logQuery = event.target.value; $("#log-list").innerHTML = logRows(); $("#log-count").textContent = `${filteredLogs().length} 条`; }
    if (event.target.id === "customization-search") { state.customizationQuery = event.target.value; updateSettingsVisibility(); }
    const changedSettings = event.target.closest("#settings-form");
    if (changedSettings && event.target.name) scheduleSettingsSave(event.target);
    const changedCustomization = event.target.closest("#customization-form");
    if (changedCustomization && event.target.name && event.target.id !== "customization-search") scheduleSettingsSave(event.target);
  });
  $("#view-content").addEventListener("change", (event) => { if (event.target.id === "log-status") { state.logStatus = event.target.value; $("#log-list").innerHTML = logRows(); $("#log-count").textContent = `${filteredLogs().length} 条`; } if (event.target.matches('.switch input')) $("b", event.target.closest(".switch")).textContent = event.target.checked ? "已开启" : "已关闭"; });
  $("#view-content").addEventListener("invalid", event => {
    const section = event.target.closest("[data-settings-group]");
    if (section) { state.customizationTab = section.dataset.settingsGroup; state.customizationQuery = ""; $("#customization-search").value = ""; updateSettingsVisibility(); }
  }, true);
  // 概览卡片保留轻微悬停反馈，趋势详情由点击进入，避免悬停弹窗闪烁。
  $$(".metric-card").forEach((card) => card.addEventListener("click", () => setView(card.dataset.metric === "quality" ? "quality" : card.dataset.metric)));
}

async function saveCustomization(form) {
  for (const field of preferenceFields) scheduleSettingsSave(form.elements[field.key]);
  await flushSettingsDraft();
  const message = $("#customization-message");
  if (message) message.textContent = settingsDraft.size ? "请检查设置后重试" : "自定义设置已保存";
  if (!settingsDraft.size) showToast("自定义设置已保存", "success");
}

function applyAppearance() {
  setLocale(state.settings.locale);
  desktopMessage({ type: "locale", locale: currentLocale() });
  const root = document.body;
  const preset = state.settings.themePreset || "system";
  const themes = {
    graphite: ["#11141a", "#191d25", "#f5f7fa", "#75b9ff", "#a3acba"],
    catppuccin: ["#1e1e2e", "#313244", "#cdd6f4", "#89b4fa", "#a6adc8"],
    dracula: ["#282a36", "#343746", "#f8f8f2", "#50fa7b", "#c0c3d0"],
    light: ["#f2f4f7", "#ffffff", "#1a2029", "#227ecb", "#586474"],
    custom: [state.settings.mainBackground, state.settings.panelBackground, state.settings.textColor, state.settings.accentColor, null]
  };
  const variables = ["--bg", "--panel", "--text", "--line-bright", "--muted"];
  variables.forEach((variable, index) => {
    const value = themes[preset]?.[index];
    if (value) root.style.setProperty(variable, value); else root.style.removeProperty(variable);
  });
  for (const [variable, index] of [["--bg-deep", 0], ["--panel-strong", 1], ["--blue", 3], ["--mint", 3]]) {
    if (themes[preset]) root.style.setProperty(variable, themes[preset][index]); else root.style.removeProperty(variable);
  }
  root.classList.toggle("light", preset === "light" || preset === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  root.dataset.themePreset = preset;
  const island = $("#quick-island");
  island.style.setProperty("--rail-bg", state.settings.normalBackground);
  island.style.setProperty("--focus-bg", state.settings.focusBackground);
  root.style.setProperty("--popover-bg", state.settings.popoverBackground);
  if (Number.isFinite(state.settings.panelRadius)) root.style.setProperty("--panel-radius", `${state.settings.panelRadius}px`);
  root.style.setProperty("--island-opacity", `${(Number(state.settings.islandOpacity) || 94) / 100}`);
  root.style.setProperty("--island-duration", `${Number(state.settings.animationDurationMs) || 420}ms`);
  root.style.setProperty("--font-scale", String((Number(state.settings.fontScale) || 100) / 100));
  root.classList.toggle("large-text", state.settings.fontScale > 130);
  if (state.settings.customTextColor) root.style.setProperty("--text", state.settings.textColor);
  root.style.colorScheme = root.classList.contains("light") ? "light" : "dark";
  if (desktopMode === "main") desktopMessage({ type: "appearance", dark: !root.classList.contains("light"), background: getComputedStyle(root).getPropertyValue("--bg").trim() });
  for (const [key, variable] of [["focusOpacity", "--focus-opacity"], ["popoverOpacity", "--popover-opacity"], ["panelOpacity", "--panel-opacity"], ["compactBackingOpacity", "--compact-backing-opacity"], ["compactRingOpacity", "--compact-ring-opacity"]]) {
    root.style.setProperty(variable, String(state.settings[key] / 100));
  }
  for (const metric of ["quality", "cache", "ttft"]) {
    const suffix = metric[0].toUpperCase() + metric.slice(1);
    root.classList.toggle(`hide-detail-${metric}`, !state.settings[`detailShow${suffix}`]);
    root.classList.toggle(`hide-popover-${metric}`, !state.settings[`popoverShow${suffix}`]);
  }
  for (const info of ["Endpoint", "KeyGroup", "Reasoning", "Agents"]) root.classList.toggle(`hide-info-${info.toLowerCase()}`, !state.settings[`show${info}`]);
  document.body.dataset.islandShape = state.settings.islandShape || "pill";
  document.body.dataset.ringStyle = state.settings.ringStyle || "classic";
  document.body.dataset.probeStrategy = state.settings.probeStrategy || "adaptive";
  document.body.classList.toggle("reduced-motion", Boolean(state.settings.reducedMotion));
  const light = document.body.classList.contains("light");
  $("#theme-toggle").textContent = light ? "☾" : "☼";
  $("#theme-toggle").setAttribute("aria-pressed", String(light));
}

const tourSteps = [
  [".health-panel", "主窗口先显示当前四元组的核心环、Cache、TTFT 和核验状态；顶部模型卡可切换模型，首屏指标卡可直接点击进入对应详细页。"],
  ["#agent-status", "主窗口这里汇总每个 coding agent 的工作、规划、工具调用、等待和完成状态；多个 Agent 会分别保留，不合并成一个在线状态。"],
  [".metric-grid", "主窗口的三张指标卡支持点击跳转：模型核验、Cache 和 TTFT 会打开详细窗口的对应 Tab，并保留当前模型四元组。"],
  ["#refresh-button", "拓展窗口是实时灵动岛：极简、普通、专注和扩展详情会平滑切换。侧边拖条可点击或拖动，释放后吸附左右边缘；悬停模型可查看扩展信息。"],
  ['[data-view="settings"]', "设置和拓展窗口都能重播引导；设置按外观、交互、检测策略和题库分类，并支持搜索、透明度、显示指标和自定义问题。"]
];
let tourCleanup;
function closeTour() { tourCleanup?.(); tourCleanup = null; document.querySelector(".spotlight-tour")?.remove(); }
function startTour() {
  closeTour();
  const islandTour = desktopMode === "island";
  if (!islandTour) setView("overview");
  else desktopMessage({ type: "island-tour", active: true });
  const steps = islandTour ? [
    ["#quick-island", "极简形态只显示工作中的四元组。模型图标与无数值环保持可见。"],
    ["#island-buffer", "普通形态显示全部目标。上下边缘可滚动列表；顶部横条与侧面竖条都可拖动，松开后吸附左右边缘。点击侧条返回普通形态。"],
    ["#island-focus", "专注形态显示当前目标的指标。点击 Cache、TTFT 或模型核验进入同一四元组的对应详情页。"],
    [".island-stage", "拓展窗口显示渠道、Agent 状态、历史趋势与核验进度；点击任一趋势进入对应详情，显示哪些指标和信息可在设置中调整。"]
  ] : tourSteps;
  const previousFocus = document.activeElement;
  let index = 0;
  const overlay = document.createElement("div"); overlay.className = "spotlight-tour";
  overlay.innerHTML = '<div class="spotlight-shade"></div><div class="spotlight-card" role="dialog" aria-live="polite"><strong></strong><p></p><div><button class="text-button tour-skip" type="button">跳过</button><button class="primary-button tour-next" type="button">下一步</button></div></div>';
  document.body.append(overlay);
  const title = $("strong", overlay), copy = $("p", overlay), card = $(".spotlight-card", overlay), next = $(".tour-next", overlay);
  const render = () => {
    const [selector, text] = steps[index];
    const target = document.querySelector(selector);
    if (!target?.getClientRects().length) {
      if (index < steps.length - 1) { index++; prepare(); return; }
      return finish();
    }
    target.scrollIntoView({ block: "nearest", behavior: "instant" });
    const rect = target.getBoundingClientRect();
    overlay.style.setProperty("--spot-x", `${Math.max(4, rect.left - 8)}px`);
    overlay.style.setProperty("--spot-y", `${Math.max(4, rect.top - 8)}px`);
    overlay.style.setProperty("--spot-w", `${Math.min(rect.width + 16, innerWidth - 8)}px`);
    overlay.style.setProperty("--spot-h", `${Math.min(rect.height + 16, innerHeight - 8)}px`);
    title.textContent = `${islandTour ? "灵动岛" : "详细窗口"} ${index + 1}/${steps.length}`;
    copy.textContent = text;
    next.textContent = index === steps.length - 1 ? "完成" : "下一步";
    card.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - card.offsetWidth - 16))}px`;
    const top = rect.bottom + card.offsetHeight + 30 <= innerHeight ? rect.bottom + 14 : rect.top - card.offsetHeight - 14;
    card.style.top = `${Math.max(16, Math.min(top, innerHeight - card.offsetHeight - 16))}px`;
    if (islandTour) {
      const rail = $("#quick-island").getBoundingClientRect();
      card.style.left = `${clamp(document.body.dataset.islandSide === "left" ? rail.right + 18 : rail.left - card.offsetWidth - 18, 12, innerWidth - card.offsetWidth - 12)}px`;
      card.style.top = `${innerHeight - card.offsetHeight - 16}px`;
    }
  };
  let stepTimer;
  const prepare = () => {
    clearTimeout(stepTimer);
    if (islandTour) {
      const model = islandModels()[0];
      if (index === 0) enterIslandState({ type: "leave" });
      else if (index === 1) enterIslandState({ type: "border" });
      else if (model) enterIslandState({ type: "ring", modelId: model.id });
      if (index === 3 && model) {
        const rect = $("#quick-island").getBoundingClientRect();
        showModelHistoryPopover({ clientX: rect.x, clientY: rect.y + 100 }, model);
        $("#hover-popover").style.top = "16px";
      }
    }
    stepTimer = setTimeout(render, islandTour ? Number(state.settings.animationDurationMs) + 50 : 0);
  };
  const finish = async () => {
    closeTour(); previousFocus?.focus({ preventScroll: true });
    if (islandTour) { enterIslandState({ type: "leave" }); desktopMessage({ type: "island-tour", active: false }); return; }
    try { await fetchJson("/api/settings", { method: "PATCH", body: JSON.stringify({ tourSeen: true }) }); state.settings.tourSeen = true; }
    catch (error) { showToast(`引导偏好保存失败：${error.message}`, "error"); }
  };
  const skip = $(".tour-skip", overlay);
  const onKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); finish(); }
    if (event.key === "Tab") { event.preventDefault(); (document.activeElement === next ? skip : next).focus(); }
  };
  overlay.setAttribute("aria-modal", "true");
  overlay.addEventListener("keydown", onKey);
  window.addEventListener("resize", render);
  tourCleanup = () => { clearTimeout(stepTimer); window.removeEventListener("resize", render); };
  skip.onclick = finish; next.onclick = () => { if (index === steps.length - 1) finish(); else { index++; prepare(); } };
  prepare(); next.focus({ preventScroll: true });
}

async function bootstrap() {
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  const light = systemTheme.matches;
  systemTheme.addEventListener("change", () => { if (state.settings.themePreset === "system") applyAppearance(); });
  window.addEventListener("languagechange", () => { if (state.settings.locale === "system") applyAppearance(); });
  document.body.classList.toggle("light", light);
  if (desktopMode === "island") document.body.dataset.islandMode = "compact";
  if (desktopMode !== "island") document.body.classList.add("window-focused");
  window.addEventListener("focus", () => { if (desktopMode !== "island") document.body.classList.add("window-focused"); else if (!window.webkit?.messageHandlers?.modivue) nativeFocus(true); });
  window.addEventListener("blur", () => { if (desktopMode !== "island") document.body.classList.remove("window-focused"); else if (!window.webkit?.messageHandlers?.modivue) nativeFocus(false); });
  $("#theme-toggle").textContent = light ? "☾" : "☼"; $("#theme-toggle").setAttribute("aria-pressed", String(light)); bindEvents(); renderAll();
  if (desktopMode === "island") {
    const island = $("#quick-island");
    if (window.webkit?.messageHandlers?.modivue || window.chrome?.webview) {
      const layoutObserver = new ResizeObserver(reportIslandLayout);
      layoutObserver.observe(island);
      layoutObserver.observe($("#island-buffer"));
      window.addEventListener("resize", reportIslandLayout);
      window.addEventListener("resize", () => {
        if (!$("#hover-popover").classList.contains("visible")) return;
        const rail = island.getBoundingClientRect();
        const pointerY = lastIslandPointer?.clientY ?? rail.y + rail.height / 2;
        positionPopover({ clientX: rail.x + rail.width/2, clientY: pointerY });
      });
    } else {
      document.body.addEventListener("pointermove", nativeHover);
    }
    document.body.addEventListener("pointerleave", () => {
      if (window.webkit?.messageHandlers?.modivue) return;
      hidePopover();
      setIslandHover(false);
    });
  }
  await loadSettings(); applyAppearance(); await Promise.all([syncCatalog(), loadAgents(), loadConfig(), loadEvaluators(), loadCalibration(), loadQuestions()]); await refreshObservations();
  if (!state.settings.tourSeen && desktopMode !== "island") startTour();
  if (desktopMode === "island" && new URLSearchParams(location.search).get("tour") === "1") startTour();
  if (desktopMode === "main") desktopMessage({ type: "main-ready" });
  window.setInterval(async () => { if (document.visibilityState === "visible" || desktopMode === "island") {
    await loadSettings({ applyDefaultRange: false }); applyAppearance();
    await loadAgents();
    await refreshObservations({ quiet: true });
  } }, 15000);
  let pollingVerification = false;
  window.setInterval(async () => {
    if (pollingVerification || document.visibilityState !== "visible" && desktopMode !== "island") return;
    pollingVerification = true;
    try {
      const wasRunning = state.probe?.verification?.length > 0;
      state.probe = await fetchJson("/api/probe/state");
      const previousRemote = JSON.stringify(state.bazaarlink?.jobs?.map(job => job.savedRunId));
      state.bazaarlink = await fetchJson("/api/quality/bazaarlink");
      if (previousRemote !== JSON.stringify(state.bazaarlink.jobs.map(job => job.savedRunId))) await refreshObservations({ quiet: true });
      if (state.view === "settings") await refreshTrustedCalibration();
      renderMetrics(); renderModelSelectors();
      if (state.view === "quality" && !document.activeElement?.closest("#bazaarlink-form")) renderActiveView();
      if (islandState.mode === "focus" && lastIslandPointer) showModelHistoryPopover(lastIslandPointer, state.models.find(model => model.id === islandState.modelId));
      if (wasRunning && !state.probe.verification?.length) {
        await refreshObservations({ quiet: true });
        if (desktopMode !== "island") showToast("核验已结束，请查看报告中的结果与失败原因");
      }
    } catch {} finally { pollingVerification = false; }
  }, 2000);
}

let hoverExitTimer;
let borderHoverTimer;
let ringHoverTimer;
let pendingRingId = null;
let lastIslandPointer = null;
let islandScrollFrame = null;
let islandScrollDirection = 0;
function updateIslandEdgeScroll(event) {
  const list = $("#island-models");
  const box = list.getBoundingClientRect();
  const scrollable = islandState.mode === "normal" && list.scrollHeight > list.clientHeight + 1
    && event && event.clientX >= box.left && event.clientX <= box.right;
  islandScrollDirection = !scrollable ? 0 : event.clientY >= box.top - 10 && event.clientY <= box.top + 12 ? -1
    : event.clientY >= box.bottom - 12 && event.clientY <= box.bottom + 10 ? 1 : 0;
  if (!islandScrollDirection) { cancelAnimationFrame(islandScrollFrame); islandScrollFrame = null; return false; }
  if (!islandScrollFrame) {
    let previous = performance.now();
    const scroll = time => {
      if (islandState.mode !== "normal" || !islandScrollDirection) { islandScrollFrame = null; return; }
      list.scrollTop += islandScrollDirection * (Number(state.settings.islandScrollSpeed) || 110) * Math.min(50, time - previous) / 1000;
      previous = time;
      islandScrollFrame = requestAnimationFrame(scroll);
    };
    islandScrollFrame = requestAnimationFrame(scroll);
  }
  return true;
}
function nativeHover(event) {
  if (desktopMode !== "island") return;
  if (document.body.classList.contains("island-dragging") || tourCleanup) return;
  const target = event ? document.elementFromPoint(event.clientX, event.clientY) : null;
  if (event?.clientX === lastIslandPointer?.clientX && event?.clientY === lastIslandPointer?.clientY) {
    // Animated layers can arrive beneath a stationary pointer. Update the
    // metric highlight without treating that animation as a border crossing.
    const ring = islandState.mode === "focus" && target?.closest("[data-focus-metric]")?.querySelector(".ring-metric");
    if (ring && !ring.classList.contains("is-hovered")) {
      $$(".ring-metric.is-hovered").forEach(node => node.classList.remove("is-hovered"));
      ring.classList.add("is-hovered");
    }
    return;
  }
  lastIslandPointer = event;
  clearTimeout(hoverExitTimer);
  const rail = $("#quick-island").getBoundingClientRect();
  const popup = $("#hover-popover");
  const popupRect = popup.getBoundingClientRect();
  if (updateIslandEdgeScroll(event)) {
    clearTimeout(borderHoverTimer); borderHoverTimer = null;
    clearTimeout(ringHoverTimer); ringHoverTimer = null; pendingRingId = null;
    return;
  }
  const ringTarget = event && islandState.mode !== "focus" && $$("[data-island-model]").find((node) => {
    if (islandState.mode === "compact" && !node.classList.contains("compact-visible")) return false;
    const box = $(".metric-rings", node).getBoundingClientRect();
    return Math.hypot(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2) <= box.width / 2 + 6;
  });
  const focusTarget = islandState.mode === "focus" ? target?.closest("[data-focus-metric]") : null;
  const inRail = event && event.clientX >= rail.left && event.clientX <= rail.right && event.clientY >= rail.top && event.clientY <= rail.bottom;
  $$(".focus-model").forEach(button => button.classList.toggle("is-hovered", button === focusTarget));
  const onBorder = Boolean(inRail && (!ringTarget && !focusTarget || target?.closest("#island-buffer")));
  const inBridge = event && popup.classList.contains("visible")
    && event.clientX >= Math.min(rail.right, popupRect.right) && event.clientX <= Math.max(rail.left, popupRect.left)
    && event.clientY >= Math.min(rail.top, popupRect.top) && event.clientY <= Math.max(rail.bottom, popupRect.bottom);
  if (!ringTarget && !inRail && !target?.closest("#hover-popover") && !inBridge) {
    clearTimeout(borderHoverTimer); borderHoverTimer = null;
    clearTimeout(ringHoverTimer); ringHoverTimer = null; pendingRingId = null;
    hoverExitTimer = setTimeout(() => { hidePopover(); setIslandHover(false); }, Number(state.settings.collapseDelayMs) || 360);
    return;
  }
  lastIslandPointer = event;
  if (onBorder) {
    clearTimeout(ringHoverTimer); ringHoverTimer = null; pendingRingId = null;
    // A short dwell distinguishes deliberate border focus from crossing the
    // edge to reach the history. The rail geometry never changes here.
    borderHoverTimer ??= setTimeout(() => {
      borderHoverTimer = null;
      enterIslandState({ type: "border" });
    }, 120);
    return;
  }
  clearTimeout(borderHoverTimer); borderHoverTimer = null;
  if (!ringTarget) { clearTimeout(ringHoverTimer); ringHoverTimer = null; pendingRingId = null; }
  if (islandState.mode === "compact" && !ringTarget) return;
  $$(".ring-metric.is-hovered").forEach((ring) => ring.classList.remove("is-hovered"));
  if (ringTarget) {
    const modelId = ringTarget.dataset.identity;
    $(".ring-metric", ringTarget)?.classList.add("is-hovered");
    const dwell = islandState.mode === "compact" ? Math.max(550, Number(state.settings.focusDwellMs) || 350) : Number(state.settings.focusDwellMs) || 350;
    // Enter the full model rail first, then focus only after a deliberate dwell.
    if (islandState.mode === "compact") enterIslandState({ type: "border" });
    if (pendingRingId !== modelId) {
      clearTimeout(ringHoverTimer);
      pendingRingId = modelId;
      ringHoverTimer = setTimeout(() => {
        ringHoverTimer = null; pendingRingId = null;
        enterIslandState({ type: "ring", modelId });
        showModelHistoryPopover(lastIslandPointer || event, state.models.find((item) => item.id === modelId));
      }, dwell);
    }
  } else if (focusTarget) {
    $(".ring-metric", focusTarget)?.classList.add("is-hovered");
    showModelHistoryPopover(event, state.models.find((model) => model.id === islandState.modelId));
  }
  if (event && popup.classList.contains("visible")) positionPopover(event);
}

function setIslandSide(side) {
  document.body.dataset.islandSide = side === "left" ? "left" : "right";
  requestAnimationFrame(reportIslandLayout);
}

window.modivue = { aggregate, matchModelName, refresh: refreshObservations, openView: setView, selectModel: selectModelById, nativeHover, nativeFocus, nativeDrag, setIslandSide, reportIslandLayout, startTour, showAllAgents: () => enterIslandState({ type: "border" }) };
void bootstrap();
