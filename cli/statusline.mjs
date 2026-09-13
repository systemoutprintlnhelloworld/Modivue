import { getSettings, listQualityRuns, summary, upsertAgentSession, listQuestions, questionWindowSummaries } from "../src/core/storage.mjs";
import { keyGroup, normalizeBaseUrl } from "../src/core/identity.mjs";
import { matchModelName, normalizeModelName } from "../src/core/model-match.js";
import { catalogState } from "../src/core/catalog.mjs";
import { summarizeVerification } from "../src/core/quality-summary.js";
import { ttftGauge } from "../src/core/metrics.js";
import { modelIdentity } from "../src/core/model-identity.js";
import { resolveProxyRoute, upstreamRoutes } from "../src/core/upstreams.mjs";

const VERSION = 1;
const DEFAULT_WIDTH = 8;
const ANSI = Object.freeze({
  mint: "\x1b[38;5;50m",
  blue: "\x1b[38;5;81m",
  violet: "\x1b[38;5;141m",
  reset: "\x1b[0m"
});

function parseArgs(argv) {
  const options = { json: false, plain: false, width: DEFAULT_WIDTH, hours: null, model: null, baseUrl: null, keyGroup: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--plain" || argument === "--no-color") options.plain = true;
    else if (argument === "--hours") options.hours = Number(argv[++index]);
    else if (argument === "--model") options.model = argv[++index] || null;
    else if (argument === "--base-url") options.baseUrl = argv[++index] || null;
    else if (argument === "--key-group") options.keyGroup = argv[++index] || null;
    else if (argument === "--reasoning-effort") options.reasoningEffort = argv[++index] || null;
    else if (argument === "--width") options.width = Number(argv[++index]);
    else if (argument === "--help" || argument === "-h") options.help = true;
  }
  if (!Number.isSafeInteger(options.width) || options.width < 4 || options.width > 32) options.width = DEFAULT_WIDTH;
  if (options.hours !== null && (!Number.isFinite(options.hours) || options.hours < 0)) options.hours = null;
  return options;
}

function printHelp() {
  process.stdout.write([
    "Modivue statusline",
    "用法: printf '%s' '<Claude Code JSON>' | node cli/statusline.mjs [选项]",
    "  --json                 输出无 ANSI 的结构化 JSON",
    "  --plain                输出无 ANSI 的文本状态栏",
    "  --hours <数值>         查询最近多少小时（默认读取 Modivue 设置）",
    "  --model <名称>         覆盖 stdin 中的模型名称",
    "  --base-url <地址>      限定渠道身份",
    "  --key-group <指纹>     限定密钥分组（不可逆短指纹）",
    "  --reasoning-effort <档位> 限定推理档位",
    "  --width <4-32>         横向柱状图宽度"
  ].join("\n") + "\n");
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function parseSession(input) {
  if (!input.trim()) return { value: {}, error: null };
  try {
    const value = JSON.parse(input);
    return { value: value && typeof value === "object" ? value : {}, error: null };
  } catch {
    return { value: {}, error: "stdin 不是有效的 JSON；已显示未知指标" };
  }
}

function safeBaseUrl(value) {
  if (!value) return null;
  try { return normalizeBaseUrl(value); } catch { return null; }
}

function credentialGroups() {
  const values = [
    process.env.ANTHROPIC_AUTH_TOKEN,
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_TOKEN,
    process.env.CODEX_API_KEY,
    process.env.MODIVUE_API_KEY
  ].filter(Boolean);
  return [...new Set(values.map((value) => keyGroup({ headers: { authorization: `Bearer ${value}` } })))];
}

function baseUrls() {
  const configuredRoutes = upstreamRoutes();
  return [...new Set([
    process.env.ANTHROPIC_BASE_URL,
    process.env.OPENAI_BASE_URL,
    process.env.MODIVUE_BASE_URL,
    process.env.MODIVUE_STATUSLINE_BASE_URL,
    process.env.MODIVUE_OPENAI_UPSTREAM,
    process.env.MODIVUE_ANTHROPIC_UPSTREAM,
    ...Object.values(configuredRoutes.openai),
    ...Object.values(configuredRoutes.anthropic)
  ].map(safeBaseUrl).filter((value) => {
    if (!value) return false;
    try { return !new URL(value).pathname.startsWith("/proxy/"); } catch { return false; }
  }))];
}

function identityFilter(rows, options) {
  let candidates = rows;
  if (options.reasoningEffort !== undefined) candidates = candidates.filter((row) => row.reasoningEffort === options.reasoningEffort);
  if (options.baseUrl) candidates = candidates.filter((row) => row.baseUrl === options.baseUrl);
  else {
    const configuredBases = baseUrls();
    if (configuredBases.length) candidates = candidates.filter((row) => configuredBases.includes(row.baseUrl));
  }
  if (options.keyGroup) candidates = candidates.filter((row) => row.keyGroup === options.keyGroup);
  else {
    const configuredKeys = credentialGroups();
    if (configuredKeys.length) candidates = candidates.filter((row) => configuredKeys.includes(row.keyGroup));
  }
  return candidates;
}

function editSimilarity(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function modelDistance(label, observed) {
  const left = normalizeModelName(label);
  const right = normalizeModelName(observed);
  if (!left || !right) return -1;
  if (left === right) return 1;
  const numbers = (value) => value.match(/\d+/g)?.filter((token) => !/^(?:19|20)\d{2}$/.test(token)).slice(0, 2).join("-") || "";
  const leftNumbers = numbers(left);
  const rightNumbers = numbers(right);
  if (leftNumbers !== rightNumbers && leftNumbers && rightNumbers) return -1;
  const score = left.includes(right) || right.includes(left)
    ? 0.94 - Math.abs(left.length - right.length) / Math.max(left.length, right.length, 1) * 0.04
    : editSimilarity(left, right);
  return score >= 0.8 ? score : -1;
}

// Do not borrow another model's metrics when the statusline identity is unclear.
function selectObservation(rows, label, options) {
  const scoped = identityFilter(rows, options);
  if (!scoped.length) return { row: null, status: "unmatched", candidates: [] };
  const normalizedLabel = normalizeModelName(label);
  if (!normalizedLabel || normalizedLabel === normalizeModelName("当前模型")) {
    return { row: null, status: "unmatched", candidates: scoped };
  }
  const catalogMatch = matchModelName(label, catalogState().models, { provider: scoped[0]?.protocol });
  const ranked = scoped.map((row) => {
    const names = [row.observedModel, ...(row.observedModels || []), row.canonicalModelId,
      row.canonicalModelId?.split("/").at(-1)].filter(Boolean);
    const score = catalogMatch.status === "matched" && row.canonicalModelId === catalogMatch.model.id
      ? 1 : Math.max(...names.map((name) => modelDistance(label, name)));
    return { row, score };
  })
    .filter((item) => item.score >= 0).sort((left, right) => right.score - left.score || left.row.observedModel.localeCompare(right.row.observedModel));
  if (!ranked.length) return { row: null, status: "unmatched", candidates: scoped };
  const best = ranked[0];
  const tied = ranked.filter((item) => best.score - item.score < 0.025);
  const identities = new Set(tied.map(({ row }) => modelIdentity(row)));
  const row = identities.size === 1
    ? tied.map((item) => item.row).sort((left, right) => (right.rangeEnd || "").localeCompare(left.rangeEnd || ""))[0]
    : null;
  return row ? { row, status: "matched", candidates: ranked.map((item) => item.row) }
    : { row: null, status: "ambiguous", candidates: ranked.map((item) => item.row) };
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function bar(value, width) {
  if (!Number.isFinite(value)) return "·".repeat(width);
  const filled = Math.round(clamp(value) * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

function displayDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "未提供";
  return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)}s`;
}

function metricPayload(observation, qualityRuns, settings, hours = settings.defaultHours) {
  const runs = Array.isArray(qualityRuns) ? qualityRuns : qualityRuns ? [qualityRuns] : [];
  const verification = summarizeVerification(runs, settings.evaluatorId, { target: observation,
    question: listQuestions().find(question => question.id === settings.defaultQuestionId), since: hours ? Date.now() - hours * 3600000 : 0,
    questionSummary: settings.evaluatorId === "custom-question" && observation ? questionWindowSummaries({ hours, baseUrl: observation.baseUrl, keyGroup: observation.keyGroup })[modelIdentity(observation)] : null });
  const cacheRate = observation?.cacheHitRate ?? observation?.reportedCacheHitRate ?? null;
  const cacheStatus = observation?.cacheStatus || "unavailable";
  const ttft = Number.isFinite(observation?.ttftMs) ? Number(observation.ttftMs) : null;
  const ttftValue = ttftGauge(ttft, Number(settings.ttftThresholdMs));
  return {
    quality: { value: verification.numeric?.value ?? null, status: verification.verdict,
      bar: verification.question ? verification.question.ratio : !verification.numeric ? null : verification.numeric.unit === "%" ? clamp(verification.numeric.value / 100)
        : verification.numeric.method === "probability-probe" ? clamp(1 - verification.numeric.value) : null,
      ...verification,
      label: verification.numeric ? `${verification.numeric.label} ${verification.numeric.value.toFixed(2)}${verification.numeric.unit} · ${verification.label}${verification.stale ? ` · 上次有效 ${verification.measuredAt}` : ""}` : verification.label },
    cache: { value: cacheRate, status: cacheStatus, coverage: Number(observation?.cacheCoverage || 0), bar: cacheRate === null ? null : clamp(cacheRate), label: cacheRate === null ? "未提供" : `${Math.round(cacheRate * 100)}%${cacheStatus === "partial" ? "*" : ""}` },
    ttft: { value: ttft, status: ttft === null ? "unavailable" : "measured", bar: ttftValue, label: displayDuration(ttft), thresholdMs: Number(settings.ttftThresholdMs) },
    duration: { value: Number.isFinite(observation?.durationMs) ? observation.durationMs : null, label: displayDuration(observation?.durationMs) },
    cost: { value: Number.isFinite(observation?.costUsd) ? observation.costUsd : null, label: Number.isFinite(observation?.costUsd) ? `$${observation.costUsd.toFixed(6)}` : "待计费" }
  };
}

function structuredResult({ label, hours, observation, selection, metrics, settings, diagnostics = [] }) {
  return {
    version: VERSION,
    model: { label, observedModel: observation?.observedModel || null, selection: selection.status },
    identity: observation ? { protocol: observation.protocol, baseUrl: observation.baseUrl, keyGroup: observation.keyGroup,
      canonicalModelId: observation.canonicalModelId || null, reasoningEffort: observation.reasoningEffort || null, source: observation.source || null,
      conditionsId: observation.conditionsId || null } : null,
    range: { hours, start: observation?.rangeStart || null, end: observation?.rangeEnd || null, sampleCount: observation?.sampleCount || 0, totalCount: observation?.totalCount || 0 },
    metrics,
    settings: { ttftThresholdMs: Number(settings.ttftThresholdMs) }
  };
}

function textResult(result, options) {
  const useColor = !options.plain && !process.env.NO_COLOR && !process.env.MODIVUE_NO_COLOR;
  const paint = (color, value) => useColor ? `${ANSI[color]}${value}${ANSI.reset}` : value;
  const { model, metrics, range } = result;
  const prefix = model.observedModel || model.label || "当前模型";
  const cacheSuffix = metrics.cache.status === "partial" ? ` · ${Math.round(metrics.cache.coverage * 100)}%样本` : "";
  return `${prefix}  ${paint("mint", `核验 ${bar(metrics.quality.bar, options.width)} ${metrics.quality.label}`)}  ${paint("blue", `Cache ${bar(metrics.cache.bar, options.width)} ${metrics.cache.label}${cacheSuffix}`)}  ${paint("violet", `TTFT ${bar(metrics.ttft.bar, options.width)} ${metrics.ttft.label}`)}  ${range.sampleCount}样本/${range.hours === 0 ? "全部历史" : `${range.hours}h`} · 总耗时 ${metrics.duration.label} · 费用 ${metrics.cost.label}`;
}

function writeDiagnostics(messages) {
  for (const message of messages) process.stderr.write(`Modivue statusline: ${message}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const parsed = parseSession(await readStdin());
  if (parsed.value.session_id) {
    const usage = parsed.value.context_window?.current_usage;
    const cached = Number(usage?.cache_read_input_tokens || 0);
    const totalInput = Number(usage?.input_tokens || 0) + Number(usage?.cache_creation_input_tokens || 0) + cached;
    upsertAgentSession({ sessionId: parsed.value.session_id, host: "claude-code",
      model: parsed.value.model?.id || null, displayName: parsed.value.model?.display_name || parsed.value.session_name || null,
      protocol: "anthropic", cwd: parsed.value.workspace?.current_dir || parsed.value.cwd || null,
      source: "claude-statusline", cacheHitRate: Number.isFinite(parsed.value.prompt_cache?.hit_ratio)
        ? parsed.value.prompt_cache.hit_ratio : totalInput > 0 ? cached / totalInput : null,
      metadata: { transcriptPath: parsed.value.transcript_path || null, agentName: parsed.value.agent?.name || null } });
  }
  const settings = getSettings();
  const hours = options.hours ?? settings.defaultHours;
  const sessionLabel = options.model || parsed.value.model?.display_name || parsed.value.model?.id || "当前模型";
  const explicitBase = options.baseUrl || process.env.MODIVUE_STATUSLINE_BASE_URL || null;
  const normalizedBase = explicitBase ? safeBaseUrl(explicitBase) : null;
  const localProxyRoute = normalizedBase && (() => {
    try { return resolveProxyRoute(new URL(normalizedBase).pathname); } catch { return null; }
  })();
  const selectionOptions = { ...options, baseUrl: explicitBase
    ? localProxyRoute?.baseUrl || normalizedBase || "__invalid_base_url__" : null,
    keyGroup: options.keyGroup || process.env.MODIVUE_STATUSLINE_KEY_GROUP || null,
    reasoningEffort: options.reasoningEffort ?? process.env.MODIVUE_STATUSLINE_REASONING_EFFORT
      ?? parsed.value.reasoning_effort ?? parsed.value.model?.reasoning_effort };
  const diagnostics = parsed.error ? [parsed.error] : [];
  if (explicitBase && !normalizedBase) diagnostics.push("--base-url 或 MODIVUE_STATUSLINE_BASE_URL 不是有效的 HTTP(S) 地址");
  if (localProxyRoute && !localProxyRoute.baseUrl) diagnostics.push("本地 Modivue proxy 路由没有对应上游配置");
  try {
    const rows = summary({ hours });
    const selection = selectObservation(rows, sessionLabel, selectionOptions);
    if (selection.status === "ambiguous") diagnostics.push("模型或渠道对应多个观测分组，未显示其他分组数据");
    if (selection.status === "unmatched") diagnostics.push("没有找到当前模型对应的持久化观测");
    const observation = selection.row;
    const qualityRuns = observation ? listQualityRuns({ hours: 0, canonicalModelId: observation.canonicalModelId || undefined,
      model: observation.canonicalModelId ? undefined : observation.observedModel, baseUrl: observation.baseUrl,
      keyGroup: observation.keyGroup, reasoningEffort: observation.reasoningEffort || null })
      .sort((left, right) => (right.timestamp || "").localeCompare(left.timestamp || "")) : [];
    const metrics = metricPayload(observation, qualityRuns, settings, hours);
    const result = structuredResult({ label: sessionLabel, hours, observation, selection, metrics, settings, diagnostics });
    writeDiagnostics(diagnostics);
    if (options.json) process.stdout.write(JSON.stringify(result) + "\n");
    else process.stdout.write(textResult(result, options) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeDiagnostics([message]);
    const selection = { status: "error" };
    const metrics = metricPayload(null, [], settings);
    const result = structuredResult({ label: sessionLabel, hours, observation: null, selection, metrics, settings, diagnostics: [...diagnostics, message] });
    if (options.json) process.stdout.write(JSON.stringify(result) + "\n");
    else process.stdout.write(textResult(result, options) + "\n");
  }
}

await main();
