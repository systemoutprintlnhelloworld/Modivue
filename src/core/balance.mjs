import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { trustedProviderCredentials } from "./trusted-providers.mjs";
import { agentConnections } from "./agents.mjs";
import { ccSwitchProviders } from "./cc-switch-providers.mjs";
import { credentialGroup, normalizeBaseUrl } from "./identity.mjs";
import { databasePath } from "./storage.mjs";

const path = join(dirname(databasePath), "balances.json");
let writes = Promise.resolve(), inFlight = null;
const number = value => value === null || value === undefined || value === "" || typeof value === "boolean"
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const at = (object, path) => path ? path.split(".").reduce((value, key) => value?.[key], object) : undefined;
const siteRoot = base => base.replace(/\/(?:api\/)?v1(?:beta)?\/?$/i, "").replace(/\/$/, "");
export const balanceAdapters = { auto: "官方余额接口", usage: "Sub API / Sub2API · /v1/usage", "new-api": "New API · 账户余额",
  "new-api-token": "New API · Key 额度", general: "通用 · /user/balance", custom: "自定义 JSON 接口" };
export const balanceRefreshMs = 15000;
const frameworkCache = new Map();

async function providerFramework(baseUrl) {
  const root = siteRoot(baseUrl);
  if (official(baseUrl)[0]) return null;
  let target;
  try { target = new URL(root); }
  catch { return null; }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) return null;
  const cached = frameworkCache.get(root);
  if (cached && Date.now() - cached.at < 60000) return cached.promise;
  const promise = (async () => {
    try {
      // CPA exposes a public identity at its root. Do not send API keys or
      // query management endpoints: usage counters are not account balances.
      const response = await fetch(`${root}/`, { headers: { accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(2000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel(); return null;
      }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 8192) return null;
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return body.message === "CLI Proxy API Server" && Array.isArray(body.endpoints) ? "cliproxyapi" : null;
    } catch { return null; }
  })();
  frameworkCache.set(root, { at: Date.now(), promise });
  return promise;
}

async function readState() {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { configs: {}, snapshots: {} }; throw error; }
}
function writeState(update) {
  const job = writes.then(async () => {
    const state = await readState(); update(state);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 }); await rename(temporary, path);
  });
  writes = job.catch(() => {}); return job;
}
function official(base) {
  const host = new URL(base).hostname;
  const is = domain => host === domain || host.endsWith(`.${domain}`);
  if (is("openrouter.ai")) return ["https://openrouter.ai/api/v1/credits", "openrouter"];
  if (is("deepseek.com")) return ["https://api.deepseek.com/user/balance", "deepseek"];
  if (is("stepfun.com") || is("stepfun.ai")) return [`https://${host}/v1/accounts`, "stepfun"];
  if (is("siliconflow.cn") || is("siliconflow.com")) return [`https://${host}/v1/user/info`, "siliconflow"];
  if (is("novita.ai")) return ["https://api.novita.ai/v3/user/balance", "novita"];
  return [null, "unknown"];
}
async function providers() {
  const [saved, agents] = await Promise.all([trustedProviderCredentials(), process.env.MODIVUE_UI_ARTIFACTS ? [] : agentConnections()]);
  const unique = new Map();
  for (const provider of [...agents.map(p => ({ ...p, source: "agent" })), ...saved.map(p => ({ ...p, source: "saved" })), ...ccSwitchProviders()]) {
    if (provider.error || !provider.baseUrl || !provider.apiKey) continue;
    const baseUrl = normalizeBaseUrl(provider.baseUrl), keyGroup = credentialGroup(provider.apiKey);
    const id = JSON.stringify([siteRoot(baseUrl), keyGroup]), previous = unique.get(id);
    unique.set(id, { ...previous, ...provider, id, baseUrl, keyGroup,
      label: provider.label || previous?.label || new URL(baseUrl).hostname,
      balanceConfig: provider.balanceConfig || previous?.balanceConfig });
  }
  return Promise.all([...unique.values()].map(async provider => ({ ...provider, framework: await providerFramework(provider.baseUrl) })));
}
function configFor(provider, state) {
  return state.configs[provider.id] || provider.balanceConfig || { adapter: "auto", enabled: Boolean(official(provider.baseUrl)[0]) };
}
export async function configureBalance(input) {
  const provider = (await providers()).find(p => p.id === input.providerId);
  if (!provider) throw new TypeError("余额渠道已不可用，请刷新");
  if (provider.framework === "cliproxyapi") throw new TypeError("CLIProxyAPI 暂不提供余额");
  if (!Object.hasOwn(balanceAdapters, input.adapter) || typeof input.enabled !== "boolean") throw new TypeError("余额接口配置无效");
  const config = { adapter: input.adapter, enabled: input.enabled };
  for (const key of ["accessToken", "userId", "queryKey", "endpointPath", "remainingPath", "totalPath", "usedPath", "unit"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].length > 8192 || /[\r\n]/.test(input[key]))) throw new TypeError("余额接口配置无效");
    if (input[key]?.trim()) config[key] = input[key].trim();
  }
  if (config.adapter === "custom" && (!/^\/(?!\/)[^?#]*$/.test(config.endpointPath || "") || !config.remainingPath)) throw new TypeError("请填写同站接口路径和余额字段");
  for (const key of ["remainingPath", "totalPath", "usedPath"]) if (config[key] && !/^[\w]+(?:\.[\w]+)*$/.test(config[key])) throw new TypeError("余额字段路径无效");
  const divisor = Number(input.divisor ?? 1);
  if (!(divisor > 0 && Number.isFinite(divisor))) throw new TypeError("余额换算除数必须大于零");
  config.divisor = divisor;
  await writeState(state => {
    const previous = configFor(provider, state);
    for (const key of ["accessToken", "queryKey"]) config[key] ||= previous[key];
    if (config.enabled && config.adapter === "new-api" && (!config.accessToken || !config.userId)) throw new TypeError("New API 账户余额需要账户令牌和用户 ID");
    state.configs[input.providerId] = config;
    if (input.resetInitial === true && state.snapshots[input.providerId]) {
      // A user-visible reset starts a new baseline on the next successful
      // observation; it never alters the provider's actual balance.
      state.snapshots[input.providerId].initial = null;
      state.snapshots[input.providerId].ratio = null;
    }
  });
}
export function parseBalance(kind, body, config = {}) {
  if (!body || typeof body !== "object" || body.success === false || body.is_active === false || body.isValid === false) throw new Error("余额接口报告账户不可用");
  const data = body.data || body;
  let remaining = null, total = null, used = null, unit = "USD", unlimited = false;
  if (kind === "openrouter") { total = number(data.total_credits); used = number(data.total_usage); remaining = total !== null && used !== null ? total - used : null; }
  else if (kind === "deepseek") { const item = body.balance_infos?.find(x => x.currency === "CNY") || body.balance_infos?.[0]; remaining = number(item?.total_balance); unit = item?.currency || "CNY"; }
  else if (kind === "stepfun") { remaining = number(body.balance); unit = "CNY"; }
  else if (kind === "siliconflow") { remaining = number(data.totalBalance); unit = "CNY"; }
  else if (kind === "novita") { const value = number(body.availableBalance); remaining = value === null ? null : value / 10000; }
  else if (kind === "new-api") { remaining = number(data.quota); used = number(data.used_quota); if (remaining !== null) remaining /= 500000; if (used !== null) used /= 500000; total = remaining !== null && used !== null ? remaining + used : null; }
  else if (kind === "new-api-token") { remaining = number(data.total_available); total = number(data.total_granted); used = number(data.total_used); unit = "quota"; unlimited = data.unlimited_quota === true; }
  else if (kind === "custom") {
    const value = key => { const n = number(at(body, config[key])); return n === null ? null : n / (config.divisor || 1); };
    remaining = value("remainingPath"); total = value("totalPath"); used = value("usedPath"); unit = config.unit || "credits";
  } else {
    remaining = number(data.remaining ?? data.quota?.remaining ?? data.balance);
    total = number(data.total ?? data.quota?.total); used = number(data.used ?? data.quota?.used);
    unit = data.unit || data.quota?.unit || "USD";
  }
  if (remaining === null && !unlimited) throw new Error("余额接口未返回有效余额字段");
  return { remaining, total, used, unit, unlimited };
}
export async function queryBalance(provider, config = provider.balanceConfig || { adapter: "auto" }, fetchImpl = fetch) {
  let [url, kind] = config.adapter === "auto" ? official(provider.baseUrl) : [null, config.adapter];
  const headers = { authorization: `Bearer ${config.queryKey || provider.apiKey}`, accept: "application/json" };
  if (kind === "new-api") {
    if (!config.accessToken || !config.userId) return { status: "unconfigured", message: "New API 账户余额需要账户令牌和用户 ID" };
    headers.authorization = `Bearer ${config.accessToken}`; headers["New-Api-User"] = config.userId;
  }
  const suffix = { usage: "/v1/usage", general: "/user/balance", "new-api": "/api/user/self", "new-api-token": "/api/usage/token/", custom: config.endpointPath }[kind];
  if (suffix) url = `${siteRoot(provider.baseUrl)}${suffix}`;
  if (!url) return { status: "unconfigured", message: "请选择余额接口类型", checkedAt: new Date().toISOString() };
  try {
    const response = await fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`余额接口返回 HTTP ${response.status}`);
    return { status: "ok", ...parseBalance(kind, await response.json(), config), endpoint: url, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: "error", message: error.name === "TimeoutError" ? "余额接口超时"
      : /^余额接口/.test(error.message) ? error.message : "余额查询失败，请检查接口配置", checkedAt: new Date().toISOString() };
  }
}
export function balanceRatio(remaining, initial) {
  return Number.isFinite(remaining) && Number.isFinite(initial) && initial > 0 ? Math.min(1, Math.max(0, remaining / initial)) : null;
}
export async function listBalances({ refresh = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const state = await readState(), changes = {}, histories = {};
    const rows = await Promise.all((await providers()).map(async provider => {
      if (provider.framework === "cliproxyapi") return {
        providerId: provider.id, label: provider.label, baseUrl: provider.baseUrl, keyGroup: provider.keyGroup,
        source: provider.source, wireApi: provider.wireApi, framework: provider.framework,
        balanceSupported: false, status: "unsupported", message: "CLIProxyAPI 暂不提供余额", history: []
      };
      const config = configFor(provider, state), previous = state.snapshots[provider.id];
      let snapshot = previous;
      if (config.enabled && (refresh || !previous || Date.now() - Date.parse(previous.checkedAt) >= balanceRefreshMs)) {
        const result = await queryBalance(provider, config);
        // Keep the highest successful balance as this cycle's full-ring baseline.
        // This handles recharges: a later spend is measured from the new balance
        // instead of the stale pre-recharge value.
        const observedBaseline = result.total != null && result.total > 0 ? result.total : result.remaining;
        const initial = result.status === "ok" && observedBaseline > 0
          ? previous?.unit === result.unit && previous?.initial > 0
            ? Math.max(previous.initial, observedBaseline)
            : observedBaseline
          : null;
        snapshot = result.status === "ok" ? { ...result, initial, ratio: result.unlimited ? 1 : balanceRatio(result.remaining, initial) }
          : { ...previous, ...result, stale: previous?.remaining != null, ratio: null };
        changes[provider.id] = snapshot;
      }
      const history = (state.history?.[provider.id] || []).filter(point => Date.parse(point.timestamp) >= Date.now() - 7 * 86400000);
      if (snapshot?.status === "ok" && Number.isFinite(snapshot.remaining) && snapshot.checkedAt !== history.at(-1)?.timestamp) {
        const point = { timestamp: snapshot.checkedAt, value: snapshot.remaining, unit: snapshot.unit };
        // Keep the latest real observation in each minute, for seven days.
        if (history.length && Math.floor(Date.parse(history.at(-1).timestamp) / 60000) === Math.floor(Date.parse(point.timestamp) / 60000)) history[history.length - 1] = point;
        else history.push(point);
        histories[provider.id] = history;
      }
      const { accessToken, queryKey, ...publicConfig } = config;
      return { ...snapshot, history, providerId: provider.id, label: provider.label, baseUrl: provider.baseUrl,
        keyGroup: provider.keyGroup, source: provider.source, wireApi: provider.wireApi,
        status: !config.enabled ? "disabled" : snapshot?.status || "unconfigured",
        config: { ...publicConfig, accessTokenConfigured: Boolean(accessToken), queryKeyConfigured: Boolean(queryKey) } };
    }));
    if (Object.keys(changes).length || Object.keys(histories).length) await writeState(state => {
      Object.assign(state.snapshots, changes);
      state.history = { ...state.history, ...histories };
    });
    return rows;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
