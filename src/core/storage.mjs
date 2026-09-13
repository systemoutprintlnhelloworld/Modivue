import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { aggregate, normalizeUsage } from "./metrics.js";
import { observationKey } from "./identity.mjs";
import { reasoningEffortOf } from "./model-identity.js";
import { catalogState } from "./catalog.mjs";
import { matchModelName } from "./model-match.js";
import { verificationVersions, summarizeQuestionRuns, questionConditionsId } from "./quality-summary.js";
import { modelIdentity } from "./model-identity.js";
import { preferenceDefaults, validatePreference } from "./preferences.js";
import { builtInQuestions, validateQuestion } from "../data/question-tests.js";
import { randomUUID } from "node:crypto";

const defaultDataDirectory = platform() === "darwin"
  ? join(homedir(), "Library", "Application Support", "Modivue")
  : platform() === "win32" ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Modivue")
  : fileURLToPath(new URL("../../.local/", import.meta.url));
export const databasePath = process.env.MODIVUE_DB || join(process.env.MODIVUE_DATA_DIR || defaultDataDirectory, "modivue-runtime.sqlite");
await mkdir(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    protocol TEXT NOT NULL,
    base_url TEXT NOT NULL,
    key_group TEXT NOT NULL,
    agent TEXT,
    observed_model TEXT NOT NULL,
    canonical_model_id TEXT,
    conditions_id TEXT,
    ttft_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_hit_rate REAL,
    cache_status TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    raw_usage TEXT,
    cost_usd REAL,
    cost_status TEXT,
    total_duration_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS samples_lookup ON samples(timestamp, base_url, key_group, observed_model);
  CREATE TABLE IF NOT EXISTS quality_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    protocol TEXT,
    base_url TEXT,
    key_group TEXT,
    observed_model TEXT NOT NULL,
    canonical_model_id TEXT,
    conditions_id TEXT,
    evaluator_id TEXT NOT NULL,
    evaluator_version TEXT NOT NULL,
    score REAL,
    rationale TEXT,
    metadata TEXT,
    status TEXT NOT NULL,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS preferences (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS agent_sessions (
    session_id TEXT NOT NULL,
    host TEXT NOT NULL,
    parent_session_id TEXT,
    status TEXT NOT NULL,
    model TEXT,
    display_name TEXT,
    protocol TEXT,
    base_url TEXT,
    key_group TEXT,
    cwd TEXT,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ended_at TEXT,
    cache_hit_rate REAL,
    metadata TEXT,
    PRIMARY KEY (host, session_id)
  );
  CREATE INDEX IF NOT EXISTS agent_sessions_activity ON agent_sessions(host, ended_at, last_seen_at DESC);
`);

function ensureColumn(table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("samples", "measurement", "TEXT");
ensureColumn("samples", "canonical_model_id", "TEXT");
ensureColumn("samples", "conditions_id", "TEXT");
ensureColumn("samples", "cost_usd", "REAL");
ensureColumn("samples", "cost_status", "TEXT");
ensureColumn("samples", "total_duration_ms", "INTEGER");
ensureColumn("quality_runs", "canonical_model_id", "TEXT");
ensureColumn("quality_runs", "conditions_id", "TEXT");
db.exec("PRAGMA busy_timeout = 3000");

const insert = db.prepare(`INSERT INTO samples (timestamp, protocol, base_url, key_group, agent, observed_model, canonical_model_id, conditions_id, ttft_ms, input_tokens, output_tokens, cache_read_tokens, cache_hit_rate, cache_status, status, error, raw_usage, measurement, cost_usd, cost_status, total_duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function resolveCanonicalModelId(observedModel, supplied) {
  if (typeof supplied === "string" && supplied) return supplied;
  const match = matchModelName(observedModel, catalogState().models);
  return match.status === "matched" ? match.model.id : null;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function saveSample(sample) {
  const canonicalModelId = resolveCanonicalModelId(sample.observedModel, sample.canonicalModelId);
  const conditionsId = sample.conditionsId || sample.measurement?.conditionsId || null;
  return insert.run(sample.timestamp || new Date().toISOString(), sample.protocol, sample.baseUrl, sample.keyGroup,
    sample.agent || null, sample.observedModel, canonicalModelId, conditionsId, sample.ttftMs ?? null,
    sample.inputTokens ?? null, sample.outputTokens ?? null, sample.cacheReadTokens ?? null,
    sample.cacheHitRate ?? null, sample.cacheStatus || "unavailable", sample.status || "ok", sample.error || null,
    sample.rawUsage ? JSON.stringify(sample.rawUsage) : null, sample.measurement ? JSON.stringify(sample.measurement) : null,
    sample.costUsd ?? null, sample.costStatus || "unknown", sample.durationMs ?? sample.measurement?.durationMs ?? null);
}

// A rollout event may be read by several windows and again after restart.
// Keep one observation without counting the monitor's polls as API calls.
export function savePassiveObservation(session) {
  const metric = session.passiveMetrics;
  if (session.host !== "codex" || !metric?.rawUsage || !metric.eventId
    || !Number.isFinite(Date.parse(metric.observedAt)) || !session.model || !session.baseUrl || !session.keyGroup
    || session.proxyBaseUrl) return;
  const existing = db.prepare(`SELECT 1 FROM samples WHERE timestamp = ? AND agent = 'codex'
    AND json_extract(measurement, '$.sessionId') = ? AND json_extract(measurement, '$.eventId') = ? LIMIT 1`)
    .get(metric.observedAt, session.sessionId, metric.eventId);
  if (existing) return;
  const rawUsage = { input_tokens: metric.rawUsage.input_tokens, output_tokens: metric.rawUsage.output_tokens,
    input_tokens_details: { cached_tokens: metric.rawUsage.cached_input_tokens } };
  return saveSample({ protocol: "openai", agent: "codex", observedModel: session.model,
    baseUrl: session.baseUrl, keyGroup: session.keyGroup, timestamp: metric.observedAt,
    ...normalizeUsage("openai", rawUsage), rawUsage, conditionsId: "codex-rollout:last-token-usage:v1",
    measurement: { version: 2, source: "codex-rollout", sessionId: session.sessionId, eventId: metric.eventId,
      originalUsage: metric.rawUsage, ttftStatus: "unavailable", requestParameters: { reasoning: { effort: reasoningEffortOf(session) } } } });
}

function queryRows({ hours = 24, model, canonicalModelId, baseUrl, keyGroup, protocol, reasoningEffort, conditionsId, since, source, limit } = {}) {
  if (!Number.isFinite(Number(hours)) || Number(hours) < 0) throw new TypeError("hours 必须为非负数，0 表示全部历史");
  const clauses = Number(hours) === 0 ? ["1=1"] : ["timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"];
  const params = Number(hours) === 0 ? [] : [`-${Number(hours)} hours`];
  // Model aliases are resolved after reading so callers can use either the
  // provider's raw name or the live catalog's canonical ID.
  if (baseUrl) { clauses.push("base_url = ?"); params.push(baseUrl); }
  if (keyGroup) { clauses.push("key_group = ?"); params.push(keyGroup); }
  if (protocol) { clauses.push("protocol = ?"); params.push(protocol); }
  if (since) { clauses.push("timestamp >= ?"); params.push(new Date(since).toISOString()); }
  if (source === "probe") clauses.push("agent = 'modivue-probe'");
  if (source === "observation") clauses.push("COALESCE(agent, '') != 'modivue-probe'");
  const filterAfterRead = Boolean(model || canonicalModelId || conditionsId || reasoningEffort !== undefined);
  if (limit !== undefined) {
    if (!Number.isSafeInteger(Number(limit)) || Number(limit) <= 0) throw new TypeError("limit 必须为正整数");
    if (!filterAfterRead) params.push(Math.min(5000, Number(limit)));
  }
  let rows = db.prepare(`SELECT * FROM samples WHERE ${clauses.join(" AND ")} ORDER BY timestamp DESC, id DESC${limit === undefined || filterAfterRead ? "" : " LIMIT ?"}`).all(...params).map((row) => {
    const measurement = parseJson(row.measurement, { version: 1, ttftStatus: "legacy_unverified" });
    const usage = normalizeUsage(row.protocol, parseJson(row.raw_usage, null));
    const canonical = resolveCanonicalModelId(row.observed_model, row.canonical_model_id);
    const condition = row.conditions_id || measurement.conditionsId || "legacy-unverified";
    return { ...row, canonical_model_id: canonical, conditions_id: condition, reasoning_effort: reasoningEffortOf({ measurement }),
      source: measurement.source || (row.agent === "modivue-probe" ? "probe" : "observation"),
      measurement, ttft_ms: measurement.version >= 2 ? row.ttft_ms : null,
      cost_usd: Number.isFinite(row.cost_usd) ? row.cost_usd : null, cost_status: row.cost_status || "unknown",
      duration_ms: row.total_duration_ms ?? measurement.durationMs ?? null,
      input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cache_read_tokens: usage.cacheReadTokens,
      cache_hit_rate: usage.cacheHitRate, cache_status: usage.cacheStatus };
  });
  if (model) rows = rows.filter((row) => row.observed_model === model || row.canonical_model_id === model);
  if (canonicalModelId) rows = rows.filter((row) => row.canonical_model_id === canonicalModelId);
  if (conditionsId) rows = rows.filter((row) => row.conditions_id === conditionsId);
  if (reasoningEffort !== undefined) rows = rows.filter((row) => row.reasoning_effort === (reasoningEffort || null));
  return limit === undefined || !filterAfterRead ? rows : rows.slice(0, Math.min(5000, Number(limit)));
}

export function listSamples({ limit = 500, ...filters } = {}) {
  return queryRows({ ...filters, limit });
}

export function listObservedModels(filters = {}) {
  return summary(filters).map((group) => ({
    id: group.canonicalModelId || group.observedModel,
    observed_model: group.observedModel,
    canonical_model_id: group.canonicalModelId,
    observed_models: group.observedModels,
    last_seen: group.rangeEnd,
    sample_count: group.totalCount,
    protocol: group.protocol,
    base_url: group.baseUrl,
    key_group: group.keyGroup,
    source: group.source,
    conditions_id: group.conditionsId
  }));
}

export function listEvents({ ttftThresholdMs = getSettings().ttftThresholdMs, cacheThreshold = getSettings().cacheThreshold, ...filters } = {}) {
  const rows = queryRows(filters);
  const events = rows.flatMap((row) => {
    const events = [];
    if (row.status !== "ok") events.push({ level: "error", type: "request", timestamp: row.timestamp, model: row.observed_model, baseUrl: row.base_url, keyGroup: row.key_group, detail: row.error || "请求失败" });
    if (row.ttft_ms != null && row.ttft_ms > ttftThresholdMs) events.push({ level: "warning", type: "ttft", timestamp: row.timestamp, model: row.observed_model, baseUrl: row.base_url, keyGroup: row.key_group, detail: `TTFT ${row.ttft_ms}ms` });
    if (row.cache_hit_rate != null && row.cache_hit_rate < cacheThreshold) events.push({ level: "warning", type: "cache", timestamp: row.timestamp, model: row.observed_model, baseUrl: row.base_url, keyGroup: row.key_group, detail: `Cache ${Math.round(row.cache_hit_rate * 100)}%` });
    return events.map((event) => ({ ...event, id: row.id + ":" + event.type, protocol: row.protocol,
      canonicalModelId: row.canonical_model_id, reasoningEffort: row.reasoning_effort }));
  });
  return [...events, ...qualityDegradations(filters)].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function summary(filters = {}) {
  const rows = queryRows(filters);
  const groups = new Map();
  for (const row of rows) {
    const identity = { protocol: row.protocol, baseUrl: row.base_url, keyGroup: row.key_group,
      observedModel: row.observed_model, canonicalModelId: row.canonical_model_id, reasoningEffort: row.reasoning_effort };
    const key = observationKey(identity);
    const group = groups.get(key) || { ...identity, sources: new Set(), conditions: new Set(),
      observedModels: new Set(), samples: [] };
    group.sources.add(row.source);
    group.conditions.add(row.conditions_id);
    group.observedModels.add(row.observed_model);
    group.samples.push({ id: row.id, status: row.status, ttftMs: row.ttft_ms, cacheHitRate: row.cache_hit_rate,
      inputTokens: row.input_tokens, cacheReadTokens: row.cache_read_tokens, durationMs: row.duration_ms, costUsd: row.cost_usd,
      timestamp: row.timestamp, measurement: row.measurement });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const { samples, observedModels, sources, conditions, ...identity } = group;
    const metrics = aggregate(samples);
    return { ...identity, sources: [...sources], conditions: [...conditions],
      source: sources.size === 1 ? [...sources][0] : null, conditionsId: conditions.size === 1 ? [...conditions][0] : null,
      observedModels: [...observedModels], ...metrics, sampleCount: metrics.sampleCount };
  });
}

export function closeStorage() { db.close(); }

function sessionTimestamp(value, fallback = new Date().toISOString()) {
  const timestamp = value ? new Date(value) : new Date(fallback);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError("Agent 会话时间无效");
  return timestamp.toISOString();
}

export function upsertAgentSession(session) {
  if (!session?.sessionId || !session.host) throw new TypeError("Agent 会话缺少 sessionId 或 host");
  if (!["claude-code", "codex"].includes(session.host)) throw new TypeError("不支持的 Agent host");
  const now = sessionTimestamp(session.lastSeenAt);
  const startedAt = sessionTimestamp(session.startedAt, now);
  const endedAt = session.endedAt ? sessionTimestamp(session.endedAt) : null;
  const status = endedAt ? "ended" : ["active", "running", "working", "planning", "tool", "idle", "waiting", "blocked", "done", "error"].includes(session.status) ? session.status : "idle";
  const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  db.prepare(`INSERT INTO agent_sessions (session_id, host, parent_session_id, status, model, display_name, protocol,
      base_url, key_group, cwd, source, started_at, last_seen_at, ended_at, cache_hit_rate, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(host, session_id) DO UPDATE SET
      parent_session_id = COALESCE(excluded.parent_session_id, agent_sessions.parent_session_id),
      status = CASE WHEN ? THEN excluded.status ELSE agent_sessions.status END,
      model = COALESCE(excluded.model, agent_sessions.model),
      display_name = COALESCE(excluded.display_name, agent_sessions.display_name),
      protocol = COALESCE(excluded.protocol, agent_sessions.protocol),
      base_url = COALESCE(excluded.base_url, agent_sessions.base_url),
      key_group = COALESCE(excluded.key_group, agent_sessions.key_group),
      cwd = COALESCE(excluded.cwd, agent_sessions.cwd),
      source = excluded.source,
      last_seen_at = excluded.last_seen_at,
      ended_at = excluded.ended_at,
      cache_hit_rate = COALESCE(excluded.cache_hit_rate, agent_sessions.cache_hit_rate),
      metadata = excluded.metadata`).run(
    String(session.sessionId), session.host, session.parentSessionId || null, status, session.model || null,
    session.displayName || null, session.protocol || null, session.baseUrl || null, session.keyGroup || null,
    session.cwd || null, session.source || "integration", startedAt, now, endedAt,
    session.cacheHitRate != null && Number.isFinite(Number(session.cacheHitRate)) ? Number(session.cacheHitRate) : null,
    JSON.stringify(metadata), Number(Boolean(endedAt || session.status)));
}

export function endAgentSession(host, sessionId, endedAt = new Date().toISOString()) {
  const timestamp = sessionTimestamp(endedAt);
  db.prepare(`UPDATE agent_sessions SET status = 'ended', ended_at = ?, last_seen_at = ? WHERE host = ? AND session_id = ?`)
    .run(timestamp, timestamp, host, String(sessionId));
}

export function listAgentSessions({ host, includeEnded = false, graceMinutes = 15 } = {}) {
  if (!Number.isFinite(Number(graceMinutes)) || Number(graceMinutes) <= 0) throw new TypeError("Agent 心跳宽限时间无效");
  const clauses = [];
  const params = [];
  if (host) { clauses.push("host = ?"); params.push(host); }
  if (!includeEnded) {
    clauses.push("ended_at IS NULL");
    clauses.push("last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)");
    params.push(`-${Number(graceMinutes)} minutes`);
  }
  return db.prepare(`SELECT * FROM agent_sessions${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY last_seen_at DESC`)
    .all(...params).map((row) => ({
      sessionId: row.session_id, host: row.host, parentSessionId: row.parent_session_id,
      status: row.status, model: row.model, displayName: row.display_name, protocol: row.protocol,
      baseUrl: row.base_url, keyGroup: row.key_group, cwd: row.cwd, source: row.source,
      startedAt: row.started_at, lastSeenAt: row.last_seen_at, endedAt: row.ended_at,
      cacheHitRate: row.cache_hit_rate, metadata: parseJson(row.metadata, {})
    }));
}

const defaults = Object.freeze({ ...preferenceDefaults, probeEnabled: true, probeIntervalMinutes: 1, probeDailyLimit: 256, verificationSamples: 50,
  verificationIntervalMinutes: 15, verificationRequestDelaySeconds: 2,
  probeMaxOutputTokens: 16, probeInstruction: "Reply with the word ok.", ttftThresholdMs: 2000, cacheThreshold: 0.2,
  qualityConsecutive: 2, defaultHours: 1, evaluatorId: "meow-fingerprint", meowTier: "screen", notifications: false, acknowledgedAt: null,
  tourSeen: false, defaultQuestionId: "candy-21" });

export function getSettings() {
  const row = db.prepare("SELECT value FROM preferences WHERE name = 'settings'").get();
  return { ...defaults, ...row && JSON.parse(row.value) };
}

// Remote probe jobs contain target identity, consent and progress, never keys.
export function loadBazaarlinkJobs() {
  return parseJson(db.prepare("SELECT value FROM preferences WHERE name = 'bazaarlink-jobs'").get()?.value, []);
}

export function saveBazaarlinkJobs(jobs) {
  db.prepare("INSERT INTO preferences VALUES ('bazaarlink-jobs', ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(JSON.stringify(jobs));
}

export function listQuestions() {
  const row = db.prepare("SELECT value FROM preferences WHERE name = 'custom-questions'").get();
  return [...builtInQuestions.map(question => ({ ...question, builtIn: true })), ...parseJson(row?.value, [])];
}

export function questionWindowSummaries({ hours = getSettings().defaultHours, baseUrl, keyGroup, protocol, model, reasoningEffort } = {}) {
  const question = listQuestions().find(item => item.id === getSettings().defaultQuestionId);
  if (!question) return {};
  const until = Date.now(), since = Number(hours) ? until - Number(hours) * 3600000 : 0;
  const clauses = ["evaluator_id = 'custom-question'", "evaluator_version = ?", "conditions_id = ?", "timestamp >= ?", "timestamp <= ?"];
  const parameters = [verificationVersions["custom-question"], questionConditionsId(question), new Date(since).toISOString(), new Date(until).toISOString()];
  for (const [column, value] of [["base_url", baseUrl], ["key_group", keyGroup], ["protocol", protocol]]) {
    if (value) { clauses.push(`${column} = ?`); parameters.push(value); }
  }
  const groups = new Map();
  // Window counts must not inherit the 5000-row report browser limit.
  for (const row of db.prepare(`SELECT * FROM quality_runs WHERE ${clauses.join(" AND ")}`).iterate(...parameters)) {
    const run = { ...row, canonical_model_id: resolveCanonicalModelId(row.observed_model, row.canonical_model_id), metadata: parseJson(row.metadata, {}) };
    if (model && run.observed_model !== model && run.canonical_model_id !== model) continue;
    if (reasoningEffort !== undefined && reasoningEffortOf(run) !== (reasoningEffort || null)) continue;
    const identity = modelIdentity(run);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(run);
  }
  return Object.fromEntries([...groups].map(([identity, runs]) => [identity, summarizeQuestionRuns(runs, { question, since, until })]));
}

export function saveQuestion(input) {
  const value = validateQuestion(input);
  const questions = listQuestions().filter(question => !question.builtIn);
  if (input.id && !questions.some(question => question.id === input.id)) throw new TypeError("自定义题目不存在");
  if (!input.id && questions.length >= 100) throw new TypeError("最多保存 100 个自定义题目");
  const question = { ...value, id: input.id || randomUUID(), updatedAt: new Date().toISOString(), source: "用户自定义" };
  const next = [...questions.filter(item => item.id !== question.id), question];
  db.prepare("INSERT INTO preferences VALUES ('custom-questions', ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));
  return question;
}

export function deleteQuestion(id) {
  const questions = listQuestions().filter(question => !question.builtIn);
  if (!questions.some(question => question.id === id)) throw new TypeError("自定义题目不存在或为内置题目");
  db.prepare("UPDATE preferences SET value=? WHERE name='custom-questions'").run(JSON.stringify(questions.filter(question => question.id !== id)));
}

export function updateSettings(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("设置必须为对象");
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in defaults)) throw new TypeError(`未知设置: ${key}`);
    if (validatePreference(key, value)) continue;
    if (["probeEnabled", "notifications"].includes(key)) {
      if (typeof value !== "boolean") throw new TypeError(`${key} 必须为布尔值`);
    } else if (key === "acknowledgedAt") {
      if (value !== null && !Number.isFinite(Date.parse(value))) throw new TypeError("已读时间无效");
    } else if (key === "probeInstruction") {
      if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new TypeError("探测指令必须为 1–2000 个字符");
    } else if (key === "evaluatorId") {
      if (!["meow-fingerprint", "hlwy-fingerprint", "probability-probe", "juice", "custom-question", "ztest", "bazaarlink-probe", "knowledge-boundary", "one-token", "astra-community"].includes(value)) throw new TypeError("核验方案无效");
    } else if (key === "defaultQuestionId") {
      if (!listQuestions().some(question => question.id === value)) throw new TypeError("请选择已有的单问题测试题目");
    } else if (key === "meowTier") {
      if (!["screen", "low", "medium", "high"].includes(value)) throw new TypeError("Meow 核验强度无效");
    } else if (key === "tourSeen") {
      if (typeof value !== "boolean") throw new TypeError(`${key} 必须为布尔值`);
    } else {
      const bounds = { probeIntervalMinutes: [1, 1440], verificationIntervalMinutes: [15, 1440], verificationRequestDelaySeconds: [1, 60], probeDailyLimit: [1, 10000], verificationSamples: [1, 500], probeMaxOutputTokens: [8, 4096], islandMaxAgents: [1, 12],
        ttftThresholdMs: [1, 120000], cacheThreshold: [0, 1], qualityConsecutive: [1, 20], defaultHours: [0, 720] };
      if (!Number.isFinite(value) || value < bounds[key][0] || value > bounds[key][1]
        || key !== "cacheThreshold" && !Number.isInteger(value)) throw new TypeError(`${key} 超出有效范围`);
    }
  }
  const value = { ...getSettings(), ...patch };
  for (const metric of ["quality", "cache", "ttft"]) {
    if (value[`${metric}WarningScore`] >= value[`${metric}GoodScore`]) throw new TypeError(`${metric.toUpperCase()} 警戒分界必须小于良好分界`);
  }
  if (!["Quality", "Cache", "Ttft"].some(metric => value[`focusShow${metric}`])) throw new TypeError("专注形态至少显示一个指标");
  db.prepare("INSERT INTO preferences VALUES ('settings', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(JSON.stringify(value));
  return value;
}

export function probeUsageToday(now = new Date()) {
  const start = new Date(now);
  if (!Number.isFinite(start.getTime())) throw new TypeError("探测用量日期无效");
  start.setHours(0, 0, 0, 0);
  return db.prepare("SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens FROM samples WHERE agent = 'modivue-probe' AND timestamp >= ?").get(start.toISOString());
}

export function saveQualityRun(run) {
  const metadata = run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata) ? run.metadata : {};
  const canonicalModelId = resolveCanonicalModelId(run.observedModel, run.canonicalModelId);
  const conditionsId = run.conditionsId || metadata.conditionsId || null;
  return db.prepare(`INSERT INTO quality_runs (timestamp, protocol, base_url, key_group, observed_model, canonical_model_id,
    conditions_id, evaluator_id, evaluator_version, score, rationale, metadata, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    run.timestamp || new Date().toISOString(), run.protocol || null, run.baseUrl || null, run.keyGroup || null,
    run.observedModel, canonicalModelId, conditionsId, run.evaluatorId, run.evaluatorVersion, run.score ?? null,
    run.rationale || null, JSON.stringify(metadata), run.status, run.error || null);
}

export function listQualityRuns({ hours = 24, model, canonicalModelId, baseUrl, keyGroup, protocol, reasoningEffort, conditionsId, since, limit = 5000, latest = false } = {}) {
  if (!Number.isFinite(Number(hours)) || Number(hours) < 0 || !Number.isSafeInteger(Number(limit)) || Number(limit) < 1) throw new TypeError("评测查询范围无效");
  const clauses = Number(hours) === 0 ? ["1=1"] : ["timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"];
  const params = Number(hours) === 0 ? [] : [`-${Number(hours)} hours`];
  for (const [column, value] of [["base_url", baseUrl], ["key_group", keyGroup], ["protocol", protocol]]) {
    if (value) { clauses.push(`${column} = ?`); params.push(value); }
  }
  if (since) { clauses.push("timestamp >= ?"); params.push(new Date(since).toISOString()); }
  const filterAfterRead = Boolean(model || canonicalModelId || conditionsId || reasoningEffort !== undefined);
  if (!filterAfterRead) params.push(Math.min(5000, Number(limit)));
  const table = latest ? `(SELECT *, ROW_NUMBER() OVER (PARTITION BY protocol, base_url, key_group,
    COALESCE(canonical_model_id, observed_model), json_extract(metadata, '$.reasoningEffort'), evaluator_id, evaluator_version
    ORDER BY timestamp DESC, id DESC) AS rank FROM quality_runs)` : "quality_runs";
  if (latest) clauses.push("rank = 1");
  let runs = db.prepare(`SELECT * FROM ${table} WHERE ${clauses.join(" AND ")} ORDER BY timestamp DESC, id DESC${filterAfterRead ? "" : " LIMIT ?"}`).all(...params)
    .map((run) => {
      const metadata = parseJson(run.metadata, {});
      return { ...run, canonical_model_id: resolveCanonicalModelId(run.observed_model, run.canonical_model_id),
        conditions_id: run.conditions_id || metadata.conditionsId || "legacy-unverified", metadata };
    });
  if (model) runs = runs.filter((run) => run.observed_model === model || run.canonical_model_id === model);
  if (canonicalModelId) runs = runs.filter((run) => run.canonical_model_id === canonicalModelId);
  if (conditionsId) runs = runs.filter((run) => run.conditions_id === conditionsId);
  if (reasoningEffort !== undefined) runs = runs.filter((run) => reasoningEffortOf(run) === (reasoningEffort || null));
  return filterAfterRead ? runs.slice(0, Math.min(5000, Number(limit))) : runs;
}

export function qualityDegradations(filters = {}) {
  const settings = getSettings();
  const groups = new Map();
  for (const run of listQualityRuns(filters).reverse()) {
    if (run.evaluator_version !== verificationVersions[run.evaluator_id]) continue;
    const key = JSON.stringify([run.protocol, run.base_url, run.key_group, run.canonical_model_id || run.observed_model,
      run.evaluator_id, run.conditions_id, run.metadata?.reasoningEffort || null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const events = [];
  for (const runs of groups.values()) {
    let streak = 0;
    let ongoing = false;
    for (const run of runs) {
      if (run.status === "ok" && run.metadata?.verdict === "deviates") streak++;
      else { streak = 0; ongoing = false; }
      if (streak >= settings.qualityConsecutive && !ongoing) {
        ongoing = true;
        events.push({ id: `quality:${run.id}`, type: "quality", level: "warning", timestamp: run.timestamp,
          model: run.observed_model, protocol: run.protocol, baseUrl: run.base_url, keyGroup: run.key_group,
          detail: `${run.evaluator_id}: ${run.rationale}`,
          canonicalModelId: run.canonical_model_id, conditionsId: run.conditions_id, reasoningEffort: reasoningEffortOf(run) });
      }
    }
  }
  return events;
}
