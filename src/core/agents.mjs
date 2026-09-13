import { readFile, readdir, stat, open, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parse } from "smol-toml";
import { credentialGroup, normalizeBaseUrl } from "./identity.mjs";
import { unpackLocalProxyBaseUrl } from "./upstreams.mjs";
import { listAgentSessions, savePassiveObservation } from "./storage.mjs";
import { isAgentWorking, canProbeSession, normalizeAgentStatus, claudeTranscriptStatus } from "./agent-activity.js";
import { agentAdapters, adapterEnvironment, adapterForProcess, readAdapterConnection } from "./agent-adapters.mjs";

const runFile = promisify(execFile);

async function configFile(path, format = "json") {
  try {
    const text = await readFile(path, "utf8");
    return { value: format === "toml" ? parse(text) : JSON.parse(text), found: true };
  } catch (error) { return { value: {}, found: error.code !== "ENOENT", error: error.code === "ENOENT" ? null : "配置无法读取或格式无效" }; }
}

async function genericConnections(env, home, cwd, adapters = agentAdapters, argv = []) {
  const connections = [];
  for (const adapter of adapters) {
    const resolved = await readAdapterConnection(adapter, env, home, cwd, argv);
    const override = adapterEnvironment(adapter, env);
    if (!resolved.model && !resolved.baseUrl && !resolved.apiKey && !resolved.configPath && !resolved.source) continue;
    const protocol = resolved.protocol || adapter.protocol;
    const wireApi = resolved.wireApi || (protocol === "anthropic" ? "messages" : protocol === "gemini" ? "generateContent" : "chat");
    const baseUrl = endpoint(resolved.baseUrl);
    const connection = agentEndpoint(baseUrl, protocol, env);
    const apiKey = resolved.apiKey || null;
    connections.push({ id: adapter.id, label: adapter.label, configPath: resolved.configPath,
      model: resolved.model || null, ...connection, protocol, wireApi, apiKey, reasoningEffort: resolved.reasoningEffort || null,
      authHeader: protocol === "anthropic" ? "x-api-key" : "authorization",
      keyGroup: apiKey ? credentialGroup(apiKey) : null, source: resolved.source || "config",
      error: resolved.error || null, configStatus: resolved.configStatus || "parsed" });
  }
  return connections;
}

function endpoint(value) {
  if (!value) return null;
  try { return normalizeBaseUrl(value); } catch { return null; }
}

function agentEndpoint(value, protocol, env) {
  const baseUrl = endpoint(value);
  if (!baseUrl) return { baseUrl: null };
  return unpackLocalProxyBaseUrl(baseUrl, protocol, env) || { baseUrl };
}

export async function agentConnections(env = process.env, home = homedir(), cwd = process.cwd()) {
  const agents = [];
  const claudeDirectory = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const configPath = join(claudeDirectory, "settings.json");
  const files = await Promise.all([configFile(configPath), configFile(join(cwd, ".claude", "settings.json")), configFile(join(cwd, ".claude", "settings.local.json"))]);
  const settings = Object.assign({}, ...files.map((file) => file.value));
  const claudeEnv = Object.assign({}, ...files.map((file) => file.value.env || {}), env);
  if (files.some((file) => file.found) || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL) {
    const apiKey = claudeEnv.ANTHROPIC_AUTH_TOKEN || claudeEnv.ANTHROPIC_API_KEY || null;
    const envConfigured = Boolean(env.ANTHROPIC_MODEL || env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
    const connection = agentEndpoint(claudeEnv.ANTHROPIC_BASE_URL || "https://api.anthropic.com", "anthropic", env);
    agents.push({ id: "claude-code", label: "Claude Code", configPath,
      model: claudeEnv.ANTHROPIC_MODEL || settings.model || null,
      ...connection, protocol: "anthropic", wireApi: "messages",
      apiKey, authHeader: claudeEnv.ANTHROPIC_AUTH_TOKEN ? "authorization" : "x-api-key", keyGroup: apiKey ? credentialGroup(apiKey) : null,
      source: envConfigured ? "environment" : "settings",
      statusline: settings.statusLine?.type === "command", statuslineCapability: "command", error: files.find((file) => file.error)?.error || null });
  }
  const codexDirectory = env.CODEX_HOME || join(home, ".codex");
  const codexPath = join(codexDirectory, "config.toml");
  const [config, projectConfig] = await Promise.all([
    configFile(codexPath, "toml"),
    configFile(join(cwd, ".codex", "config.toml"), "toml")
  ]);
  if (config.found || projectConfig.found || env.CODEX_API_KEY || env.OPENAI_API_KEY || env.OPENAI_BASE_URL) {
    const profileName = env.MODIVUE_CODEX_PROFILE || null;
    if (profileName && !/^[a-zA-Z0-9_-]+$/.test(profileName)) throw new TypeError("MODIVUE_CODEX_PROFILE 格式无效");
    const profileFile = profileName ? await configFile(join(codexDirectory, `${profileName}.config.toml`), "toml") : { value: {}, found: false };
    const profileError = profileName && !profileFile.found ? "Codex profile 文件不存在" : profileFile.error;
    const base = { ...config.value, ...profileFile.value,
      ...(projectConfig.value.model ? { model: projectConfig.value.model } : {}),
      model_providers: { ...config.value.model_providers, ...profileFile.value.model_providers },
      tui: { ...config.value.tui, ...profileFile.value.tui, ...projectConfig.value.tui } };
    const providerId = base.model_provider || "openai";
    const provider = base.model_providers?.[providerId] || {};
    const auth = await configFile(join(codexDirectory, "auth.json"));
    // Subscription OAuth credentials require the host's own authenticated transport.
    const apiKey = provider.experimental_bearer_token || (provider.env_key ? env[provider.env_key]
      : providerId === "openai" ? env.CODEX_API_KEY || env.OPENAI_API_KEY || auth.value.OPENAI_API_KEY : null) || null;
    const configurationError = config.error || profileError || projectConfig.error || (!apiKey && auth.error) || null;
    const projectPath = join(cwd, ".codex", "config.toml");
    const connection = agentEndpoint(provider.base_url || env.OPENAI_BASE_URL
      || (providerId === "openai" ? "https://api.openai.com/v1" : null), "openai", env);
    agents.push({ id: "codex", label: "Codex", configPath: projectConfig.found && projectConfig.value.model
      ? projectPath : profileFile.found ? join(codexDirectory, `${profileName}.config.toml`) : codexPath, model: base.model || null,
      ...connection,
      protocol: "openai", wireApi: "responses", provider: providerId, profile: profileName,
      runtimeDirectory: codexDirectory, sqliteDirectory: base.sqlite_home || codexDirectory,
      apiKey, authHeader: "authorization", keyGroup: apiKey ? credentialGroup(apiKey) : null,
      source: projectConfig.found && projectConfig.value.model ? "project" : profileFile.found ? "profile" : "config.toml",
      statusline: false, statuslineItems: base.tui?.status_line || [],
      statuslineCapability: "built-in-items-only", credentialSource: provider.experimental_bearer_token ? "config"
        : provider.env_key && env[provider.env_key] ? "environment" : providerId === "openai" && apiKey ? "openai-auth" : provider.auth?.command ? "command-unavailable" : null,
      error: configurationError });
  }
  agents.push(...await genericConnections(env, home, cwd));
  return agents;
}

// Return capability metadata only. Credentials and configuration contents are
// deliberately reduced to booleans before crossing the API boundary.
export async function supportedAgentStatus(env = process.env, home = homedir(), cwd = process.cwd()) {
  const configured = await agentConnections(env, home, cwd);
  let verification = {};
  try {
    const record = JSON.parse(await readFile(join(cwd, ".local/adapter-verification.json"), "utf8"));
    verification = Object.fromEntries((record.adapters || []).map((item) => [item.id, item.status]));
  } catch {}
  const byId = new Map(configured.map((item) => [item.id, item]));
  const localCommands = {
    "gemini-cli": join(cwd, ".local/agent-clis/node_modules/.bin/gemini"),
    "qwen-code": join(cwd, ".local/agent-clis/node_modules/.bin/qwen"),
    opencode: join(cwd, ".local/agent-clis/node_modules/.bin/opencode"),
    pi: join(cwd, ".local/agent-clis/node_modules/.bin/pi"),
    aider: join(cwd, ".local/agent-clis/python/aider/bin/aider"),
    gptme: join(cwd, ".local/agent-clis/python/gptme/bin/gptme")
  };
  const commandLocation = async (entry) => {
    try { const result = await runFile("/usr/bin/which", [entry.command], { timeout: 1000, maxBuffer: 4096 }); return { installed: true, path: result.stdout.trim(), scope: "system" }; }
    catch {}
    try { await access(localCommands[entry.id]); return { installed: true, path: localCommands[entry.id], scope: "isolated" }; }
    catch { return { installed: false, path: null, scope: null }; }
  };
  const entries = [
    { id: "codex", label: "Codex", protocol: "openai", configCapability: "selected-provider", command: "codex" },
    { id: "claude-code", label: "Claude Code", protocol: "anthropic", configCapability: "selected-provider", command: "claude" },
    ...agentAdapters.map(({ id, label, protocol, configCapability, command }) => ({ id, label, protocol, configCapability, command }))
  ];
  return Promise.all(entries.map(async (entry) => {
    const connection = byId.get(entry.id);
    const command = await commandLocation(entry);
    return { ...entry, ...command,
      configFound: Boolean(connection?.configPath), configParsed: Boolean(connection && !connection.error),
      modelConfigured: Boolean(connection?.model), credentialConfigured: Boolean(connection?.apiKey),
      adapterVerification: verification[entry.id] || null,
      configStatus: connection ? (connection.configStatus || (connection.error ? "error" : "parsed"))
        : (entry.configCapability === "presence-only" ? "presence-only" : "missing") };
  }));
}

const activityBySession = new Map();
const sessionConnections = new Map();
let detectCache = { at: 0, key: "", value: null };
let detectInFlight = null;

export async function detectAgents(env, home, cwd, { fresh = false } = {}) {
  const actualEnv = env || process.env;
  const actualHome = home || homedir();
  const actualCwd = cwd || process.cwd();
  const cacheKey = `${actualHome}:${actualCwd}:${actualEnv.CODEX_HOME || ""}:${actualEnv.CLAUDE_CONFIG_DIR || ""}`;
  if (!fresh && detectCache.value && Date.now() - detectCache.at < 2000 && detectCache.key === cacheKey) return detectCache.value;
  if (detectInFlight?.key === cacheKey) return detectInFlight.promise;
  const promise = detectAgentsFresh(actualEnv, actualHome, actualCwd, cacheKey);
  detectInFlight = { key: cacheKey, promise };
  try { return await promise; } finally { if (detectInFlight?.promise === promise) detectInFlight = null; }
}

async function detectAgentsFresh(actualEnv, actualHome, actualCwd, cacheKey) {
  const configured = await agentConnections(actualEnv, actualHome, actualCwd);
  const byHost = new Map(configured.map((agent) => [agent.id, agent]));
  const claudeConnection = byHost.get("claude-code");
  const live = [
    ...await claudeTranscriptSessions(actualHome, claudeConnection),
    ...await codexRuntimeSessions(byHost.get("codex")?.runtimeDirectory || actualEnv.CODEX_HOME || join(actualHome, ".codex"), byHost.get("codex")),
    ...await genericRuntimeSessions(actualEnv, actualHome, actualCwd)
  ];
  const unique = new Map();
  live.forEach((session) => {
    const key = `${session.host}:${session.sessionId}`;
    const existing = unique.get(key);
    if (!existing || existing.source === "claude-transcript") unique.set(key, session);
  });
  try {
    const { stdout } = await runFile("herdr", ["pane", "list"], { timeout: 1500, maxBuffer: 1024 * 1024 });
    const panes = JSON.parse(stdout).result?.panes || [];
    const hostForPane = (pane) => {
      const value = String(pane.agent || pane.agent_name || pane.command || "").toLowerCase();
      if (value === "codex" || value.includes("codex")) return "codex";
      if (value === "claude" || value.includes("claude")) return "claude-code";
      return agentAdapters.find((adapter) => value === adapter.id || value === adapter.command || adapter.aliases.includes(value))?.id || null;
    };
    for (const pane of panes) {
      const host = hostForPane(pane);
      let sessionId = pane.agent_session?.value || pane.agent_session?.id || null;
      if (!host) continue;
      // Herdr's screen authority can know the state before its session hook
      // reports an ID. Join through the real foreground PID, never by model.
      let foreground = null;
      if (pane.pane_id) {
        try {
          const info = JSON.parse((await runFile("herdr", ["pane", "process-info", "--pane", pane.pane_id], { timeout: 1500, maxBuffer: 128 * 1024 })).stdout).result?.process_info;
          const pids = new Set((info?.foreground_processes || []).map((process) => process.pid));
          const matches = [...unique.values()].filter((session) => session.host === host && !session.parentSessionId
            && pids.has(session.metadata?.pid));
          if (matches.length === 1) {
            sessionId = matches[0].sessionId;
            foreground = info.foreground_processes.find(process => process.pid === matches[0].metadata.pid);
          } else {
            foreground = info?.foreground_processes?.find(process => {
              const argv = process.argv || [process.argv0 || process.name || ""];
              const command = argv[0].split("/").at(-1);
              return host === "claude-code" ? command === "claude"
                : host === "codex" ? command === "codex" : adapterForProcess(argv)?.id === host;
            }) || null;
            if (!sessionId && foreground) sessionId = `pid:${foreground.pid}`;
          }
        } catch {}
      }
      if (!sessionId) continue;
      const key = `${host}:${sessionId}`;
      const session = unique.get(key);
      const status = ["working", "running", "planning", "tool", "waiting", "idle", "blocked", "done", "error"].includes(pane.agent_status) ? pane.agent_status : null;
      const processCwd = foreground?.cwd || session?.cwd || pane.cwd || actualCwd;
      const adapter = agentAdapters.find(item => item.id === host);
      const connection = adapter ? (await genericConnections(actualEnv, actualHome, processCwd, [adapter], foreground?.argv || []))[0] || {}
        : (await agentConnections(actualEnv, actualHome, processCwd)).find(item => item.id === host) || {};
      sessionConnections.set(key, connection);
      if (session) {
        if (status && !(["working", "running"].includes(status) && ["planning", "tool"].includes(session.status))) {
          session.status = status; session.displayStatus = status; session.statusSource = "herdr";
        }
        session.metadata = { ...session.metadata, paneId: pane.pane_id };
        if (session.source === "process") Object.assign(session, enrichRuntimeSession({ ...session,
          model: connection.model || session.model, baseUrl: connection.baseUrl || null, keyGroup: connection.keyGroup || null,
          cwd: processCwd, metadata: { ...session.metadata, reasoningEffort: connection.reasoningEffort || null } }, connection));
      } else {
        const presenceStatus = "unknown";
        unique.set(key, enrichRuntimeSession({ host, sessionId, status: status || presenceStatus, displayStatus: status || presenceStatus, source: "herdr",
          model: connection.model || null, protocol: connection.protocol || null,
          baseUrl: connection.baseUrl || null, keyGroup: connection.keyGroup || null,
          cwd: processCwd, lastSeenAt: new Date().toISOString(), metadata: { detection: "herdr-pane", pid: foreground?.pid, paneId: pane.pane_id || pane.id || null, reasoningEffort: connection.reasoningEffort || null }
        }, { ...connection, id: host, label: connection.label || host }));
      }
    }
  } catch {}
  // Transcript/process discovery and Herdr can expose the same pane with
  // different session IDs. Merge by PID/pane before publishing so a stale
  // Herdr `unknown` row cannot sit beside the live Claude row.
  const merged = new Map();
  for (const session of unique.values()) {
    const mergeKey = `${session.host}:${session.metadata?.pid || session.metadata?.paneId || session.sessionId}`;
    const previous = merged.get(mergeKey);
    if (!previous) { merged.set(mergeKey, session); continue; }
    const known = (value) => !["", "unknown", null, undefined].includes(value);
    const previousStatus = previous.displayStatus || previous.status;
    const currentStatus = session.displayStatus || session.status;
    const preferCurrent = known(currentStatus) && (!known(previousStatus) || session.statusSource === "herdr");
    const winner = preferCurrent ? session : previous;
    const other = winner === session ? previous : session;
    merged.set(mergeKey, { ...other, ...winner, metadata: { ...other.metadata, ...winner.metadata } });
  }
  unique.clear();
  for (const session of merged.values()) unique.set(`${session.host}:${session.sessionId}`, session);
  const now = Date.now();
  // A discovered process is a live runtime even when its host hook has not
  // emitted a status yet. Keep an explicit Herdr state authoritative, but do
  // not expose a live process as "unknown".
  for (const session of unique.values()) {
    const status = normalizeAgentStatus(session);
    if (status === "running" && status !== (session.displayStatus || session.status)) {
      session.status = status;
      session.displayStatus = status;
      session.statusSource = session.statusSource || "process-presence";
    }
  }
  for (const [id, session] of unique) {
    const prior = activityBySession.get(id);
    const working = isAgentWorking(session);
    const lastSeen = Date.parse(session.lastSeenAt || "");
    const lastActiveAt = working ? now : prior ? prior.lastActiveAt
      : ["codex-cli", "claude-transcript"].includes(session.source) && Number.isFinite(lastSeen) ? lastSeen : null;
    const idleSince = working ? null : prior?.working ? now : prior?.idleSince ?? lastActiveAt;
    activityBySession.set(id, { working, lastActiveAt, idleSince });
    session.lastActiveAt = lastActiveAt === null ? null : new Date(lastActiveAt).toISOString();
    session.idleSince = idleSince === null ? null : new Date(idleSince).toISOString();
  }
  for (const id of activityBySession.keys()) if (!unique.has(id)) activityBySession.delete(id);
  for (const id of sessionConnections.keys()) if (!unique.has(id)) sessionConnections.delete(id);
  const value = [...unique.values()];
  if (!actualEnv.MODIVUE_UI_ARTIFACTS) value.forEach(savePassiveObservation);
  detectCache = { at: Date.now(), key: cacheKey, value };
  return value;
}

async function readProcessCwd(pid, fallback) {
  if (process.platform === "win32") return fallback;
  try {
    const result = await runFile("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeout: 1000, maxBuffer: 8192 });
    return result.stdout.split("\n").find(line => line.startsWith("n"))?.slice(1) || fallback;
  } catch { return fallback; }
}

async function genericRuntimeSessions(env, home, cwd) {
  const found = [];
  let stdout;
  try {
    if (process.platform === "win32") {
      const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
      const result = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 5000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
      const rows = JSON.parse(result.stdout || "[]");
      stdout = (Array.isArray(rows) ? rows : [rows]).filter(row => row.CommandLine)
        .map(row => `${row.ProcessId} ${row.ParentProcessId} ${row.CommandLine}`).join("\n");
    } else ({ stdout } = await runFile("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 1500, maxBuffer: 4 * 1024 * 1024 }));
  }
  catch { return found; }
  const processes = stdout.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) return [];
    const argv = (match[3].match(/"[^"]*"|[^\s]+/g) || []).map(word => word.replace(/^"|"$/g, ""));
    let adapter = adapterForProcess(argv);
    if (process.platform === "win32" && !adapter) {
      const path = argv[0]?.replaceAll("\\", "/").toLowerCase() || "";
      const entry = /\/(?:node|bun)\.exe$/.test(path) ? argv[1]?.replaceAll("\\", "/") || "" : path;
      if (/\/(?:claude(?:\.exe)?|@anthropic-ai\/claude-code\/cli\.js)$/.test(entry)) adapter = { id: "claude-code", label: "Claude Code", protocol: "anthropic" };
      if (/\/(?:codex(?:\.exe)?|@openai\/codex\/bin\/codex\.js)$/.test(entry)) adapter = { id: "codex", label: "Codex", protocol: "openai" };
    }
    return adapter ? [{ pid: Number(match[1]), ppid: Number(match[2]), argv, adapter }] : [];
  });
  for (const process of processes) {
    if (processes.some(parent => parent.pid === process.ppid && parent.adapter.id === process.adapter.id)) continue;
    const { adapter, pid, argv } = process;
    const hook = process.platform === "win32" ? listAgentSessions({ host: adapter.id }).find(session => session.metadata?.pid === pid) : null;
    const processCwd = hook?.cwd || await readProcessCwd(pid, process.platform === "win32" ? null : cwd);
    const base = ["codex", "claude-code"].includes(adapter.id)
      ? (await agentConnections(env, home, processCwd || home)).find(item => item.id === adapter.id) || {}
      : (await genericConnections(env, home, processCwd || home, [adapter], argv))[0] || {};
    const sessionId = hook?.sessionId || `pid:${pid}`;
    sessionConnections.set(`${adapter.id}:${sessionId}`, base);
    found.push(enrichRuntimeSession({ ...hook, host: adapter.id, sessionId, status: hook?.status || "unknown", cwd: processCwd,
      model: hook?.model || base.model || null, baseUrl: base.baseUrl || null, keyGroup: base.keyGroup || null,
      protocol: base.protocol || adapter.protocol, source: hook?.source || (process.platform === "win32" ? "windows-process" : "process"), lastSeenAt: new Date().toISOString(),
      metadata: { detection: "process", pid, reasoningEffort: base.reasoningEffort || null } },
    { ...base, id: adapter.id, label: adapter.label }));
  }
  return found;
}

// Probe the model actually attached to a live session while retaining the
// credential and route from the corresponding static configuration.
let probeConnectionCache = { at: 0, key: "", value: [] };
export async function probeAgentConnections(env = process.env, home = homedir(), { fresh = false } = {}) {
  // UI polling can reuse this snapshot; paid requests explicitly refresh it
  // so a newly started foreground turn closes the sampling window.
  const cacheKey = `${home}:${process.cwd()}:${env.CODEX_HOME || ""}:${env.CLAUDE_CONFIG_DIR || ""}`;
  if (!fresh && Date.now() - probeConnectionCache.at < 5000 && probeConnectionCache.key === cacheKey) return probeConnectionCache.value;
  const configured = await agentConnections(env, home, process.cwd());
  const byHost = new Map(configured.map((agent) => [agent.id, agent]));
  const sessions = await detectAgents(env, home, undefined, { fresh });
  // Open sessions retain their configured route even before their first turn.
  const value = sessions.filter((session) => session.model && (byHost.has(session.host) || agentAdapters.some((adapter) => adapter.id === session.host))
    && !session.endedAt
    && !session.parentSessionId).flatMap((session) => {
    const connection = sessionConnections.get(`${session.host}:${session.sessionId}`) || byHost.get(session.host) || (() => {
      const adapter = agentAdapters.find((item) => item.id === session.host);
      const values = adapterEnvironment(adapter, env);
      return { id: adapter.id, label: adapter.label, protocol: adapter.protocol, wireApi: "chat", ...values,
        baseUrl: values.baseUrl ? endpoint(values.baseUrl) : null, authHeader: "authorization",
        keyGroup: values.apiKey ? credentialGroup(values.apiKey) : null };
    })();
    if (!connection?.apiKey || !connection?.baseUrl) return [];
    // A known live session must not borrow credentials from a different route.
    if (session.baseUrl !== connection.baseUrl || session.keyGroup !== connection.keyGroup
      || session.metadata?.modelProvider && session.metadata.modelProvider !== connection.provider) return [];
    return [{ ...connection, model: session.model, agents: [session.host], sessionId: session.sessionId,
      runtimeStatus: isAgentWorking(session) ? "active" : ["idle", "done", "waiting", "running"].includes(normalizeAgentStatus(session)) ? "idle" : normalizeAgentStatus(session),
      lastActiveAt: session.lastActiveAt, idleSince: session.idleSince,
      reasoningEffort: session.metadata?.reasoningEffort || null }];
  });
  probeConnectionCache = { at: Date.now(), key: cacheKey, value };
  return value;
}

function enrichRuntimeSession(session, connection) {
  const shared = connection || {};
  const { apiKey, authHeader, ...safe } = shared;
  const adapter = agentAdapters.find((item) => item.id === session.host);
  const fallbackLabel = session.host === "claude-code" ? "Claude Code"
    : session.host === "codex" ? "Codex" : adapter?.label || session.host;
  return { ...safe, ...session, id: `${session.host}:${session.sessionId}`,
    // Keep the adapter label for generic agents. The old Codex fallback made
    // every discovered process appear as Codex in the UI and in grouping.
    label: session.label || safe.label || fallbackLabel,
    protocol: session.protocol || safe.protocol || (session.host === "claude-code" ? "anthropic" : "openai"),
    baseUrl: session.baseUrl || safe.baseUrl || null, keyGroup: session.keyGroup || safe.keyGroup || null,
    model: session.model || null, credentialAvailable: Boolean(apiKey), activity: "runtime",
    probeReady: Boolean(apiKey && (session.baseUrl || safe.baseUrl) && session.model && !safe.error) };
}

async function claudeTranscriptSessions(home, connection) {
  if (!connection) return [];
  let stdout;
  try {
    ({ stdout } = await runFile("/usr/sbin/lsof", ["-a", "-c", "claude", "-Fpn"], { timeout: 1500, maxBuffer: 512 * 1024 }));
  } catch (error) { stdout = error.stdout || ""; }
  const directory = connection.configPath ? join(connection.configPath, "..") : join(home, ".claude");
  const owners = new Map();
  const processIds = new Set();
  let owner;
  for (const line of stdout.split("\n")) {
    if (/^p\d+$/.test(line)) { owner = Number(line.slice(1)); processIds.add(owner); }
    if (owner && line.startsWith(`n${directory}/`) && line.endsWith(".jsonl") && !line.includes("/subagents/"))
      owners.set(line.slice(1), owner);
  }
  const processCwds = new Map();
  for (const pid of processIds) processCwds.set(pid, await readProcessCwd(pid, null));
  const sessions = [];
  const hooks = new Map(listAgentSessions({ host: "claude-code" }).map((session) => [session.sessionId, session]));
  for (const [path, pid] of owners) {
    try {
      const text = await readFile(path, "utf8");
      const records = text.split("\n").slice(-180).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
      const latest = [...records].reverse().find((record) => record.sessionId || record.session_id);
      const sessionId = latest?.sessionId || latest?.session_id || path.split("/").at(-1)?.replace(/\.jsonl$/, "");
      if (!sessionId) continue;
      const modelRecord = [...records].reverse().find((record) => record.model || record.message?.model);
      const model = modelRecord?.model || modelRecord?.message?.model || null;
      const cwdRecord = records.find((record) => record.cwd);
      const lastTimestamp = [...records].reverse().find((record) => record.timestamp)?.timestamp;
      const hook = hooks.get(sessionId);
      const hookIsLatest = Date.parse(hook?.lastSeenAt || "") >= Date.parse(lastTimestamp || "");
      const status = hookIsLatest && hook.status !== "unknown" ? hook.status : claudeTranscriptStatus(records);
      sessions.push(enrichRuntimeSession({ ...hooks.get(sessionId), host: "claude-code", sessionId,
        status, displayStatus: status,
        model: model || hooks.get(sessionId)?.model,
        displayName: null, protocol: "anthropic", cwd: cwdRecord?.cwd || null,
        source: "claude-transcript", lastSeenAt: lastTimestamp || new Date().toISOString(),
        metadata: { transcriptPath: path, detection: "open-transcript", pid } }, connection));
    } catch {}
  }
  // Claude need not keep a transcript descriptor open while at its prompt.
  // Retain process presence and let Herdr supply activity when available.
  for (const pid of processIds) {
    if (sessions.some((session) => session.metadata?.pid === pid)) continue;
    const hook = [...hooks.values()].find(session => session.metadata?.pid === pid && session.cwd === processCwds.get(pid));
    sessions.push(enrichRuntimeSession({ ...hook, host: "claude-code", sessionId: hook?.sessionId || `pid:${pid}`,
      status: hook?.status || "running", displayStatus: hook?.displayStatus || hook?.status || "running",
      model: hook?.model || connection.model || null, protocol: "anthropic", cwd: processCwds.get(pid) || null,
      source: hook?.source || "process", lastSeenAt: hook?.lastSeenAt || new Date().toISOString(),
      metadata: { ...hook?.metadata, detection: hook ? "hook-process" : "process", pid } }, connection));
  }
  return sessions;
}

async function codexRuntimeSessions(directory, connection) {
  const lockDirectory = join(directory, "thread-writer-locks");
  const lockOwners = new Map();
  let sessionIds;
  try {
    const entries = (await readdir(lockDirectory)).filter((name) => name.endsWith(".lock") && name !== ".coordination.lock");
    if (!entries.length) return [];
    const lockPaths = entries.map((name) => join(lockDirectory, name));
    let stdout = "";
    try {
      ({ stdout } = await runFile("/usr/sbin/lsof", ["-Fpn", "--", ...lockPaths], { timeout: 1500, maxBuffer: 256 * 1024 }));
    } catch (error) {
      // lsof returns status 1 when at least one path is not open. Its stdout
      // still contains the live locks that must be retained.
      stdout = error.stdout || "";
    }
    const held = new Set(stdout.split("\n").filter((line) => line.startsWith("n")).map((line) => line.slice(1)));
    let owner = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) owner = Number(line.slice(1));
      if (line.startsWith("n") && owner) lockOwners.set(line.slice(1), owner);
    }
    sessionIds = entries.filter((name) => held.has(join(lockDirectory, name))).map((name) => name.slice(0, -5));
  } catch { return []; }
  if (!sessionIds.length) return [];
  let database;
  try {
    const sqliteDirectory = connection?.sqliteDirectory || directory;
    database = new DatabaseSync(join(sqliteDirectory, "state_5.sqlite"), { readOnly: true });
    const placeholders = sessionIds.map(() => "?").join(",");
    const rows = database.prepare(`SELECT id, rollout_path, model, model_provider, cwd, source, created_at_ms, updated_at_ms,
      agent_nickname, agent_role, reasoning_effort FROM threads WHERE id IN (${placeholders})`).all(...sessionIds);
    let turnDatabase;
    const running = new Set();
    try {
      turnDatabase = new DatabaseSync(join(sqliteDirectory, "thread_history_1.sqlite"), { readOnly: true });
      for (const row of turnDatabase.prepare(`SELECT DISTINCT thread_id FROM thread_turns WHERE completed_at IS NULL AND status = 'inProgress' AND thread_id IN (${placeholders})`).all(...sessionIds)) running.add(row.thread_id);
    } catch {}
    finally { turnDatabase?.close(); }
    const parentByChild = new Map();
    try {
      for (const edge of database.prepare(`SELECT parent_thread_id, child_thread_id FROM thread_spawn_edges WHERE child_thread_id IN (${placeholders})`).all(...sessionIds)) {
        parentByChild.set(edge.child_thread_id, edge.parent_thread_id);
      }
    } catch {}
    const found = new Set(rows.map((row) => row.id));
    const now = Date.now();
    const recentEnough = (timestamp) => Number.isFinite(timestamp) && now - timestamp < 15 * 60 * 1000;
    const sessions = await Promise.all(rows.map(async (row) => {
        const active = running.has(row.id);
        const updatedAt = Number(row.updated_at_ms);
        // SQLite retains old thread rows and their lock files. They are
        // historical sessions, not currently launched Agents, so they must
        // not become monitoring targets or island nodes after the grace
        // period. A running turn always remains visible regardless of its
        // database timestamp.
        if (!active && !recentEnough(updatedAt)) return null;
        const passiveMetrics = await readCodexPassiveMetrics(row.rollout_path);
        return enrichRuntimeSession({ host: "codex", sessionId: row.id,
          status: active ? "active" : "idle", parentSessionId: parentByChild.get(row.id) || null,
          model: row.model || null, displayName: row.agent_nickname || null, cwd: row.cwd,
          source: `codex-${row.source || "runtime"}`, startedAt: row.created_at_ms ? new Date(row.created_at_ms).toISOString() : null,
          lastSeenAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
          passiveMetrics,
          metadata: { modelProvider: row.model_provider, reasoningEffort: row.reasoning_effort || null, agentRole: row.agent_role || null,
            detection: "writer-lock", rolloutPath: row.rollout_path || null,
            pid: lockOwners.get(join(lockDirectory, `${row.id}.lock`)) || null }
        }, connection);
      }));
    return [
      ...sessions.filter(Boolean),
      // A lock without a matching SQLite thread is an orphaned writer lock.
      // Do not promote it to an Agent: doing so creates phantom models and can
      // make the monitor probe a session that Codex no longer owns.
    ];
  } catch { return []; }
  finally { database?.close(); }
}

// Codex writes cumulative token_count events to its local rollout. Reading a
// bounded tail is passive and cannot interfere with the foreground request.
// The most recent last_token_usage is per-turn usage, so it is suitable for a
// cache-rate display without treating thread-wide totals as one request.
async function readCodexPassiveMetrics(rolloutPath) {
  if (!rolloutPath) return null;
  try {
    const info = await stat(rolloutPath);
    if (!info || !Number.isFinite(info.size) || info.size <= 0) return null;
    const bytes = Math.min(256 * 1024, info.size);
    const handle = await open(rolloutPath, "r");
    const buffer = Buffer.alloc(bytes);
    const position = Math.max(0, info.size - bytes);
    const read = await handle.read(buffer, 0, bytes, position);
    await handle.close();
    const text = buffer.subarray(0, read.bytesRead).toString("utf8");
    let latest = null;
    for (const line of text.split(/\r?\n/)) {
      try {
        const record = JSON.parse(line);
        const info = record?.payload?.type === "token_count" ? record.payload.info : null;
        const usage = info?.last_token_usage;
        if (usage && Number.isFinite(Number(usage.input_tokens)) && Number.isFinite(Number(usage.cached_input_tokens))) {
          latest = { usage, timestamp: record.timestamp || null, ordinal: record.ordinal || null };
        }
      } catch {}
    }
    if (!latest) return null;
    const inputTokens = Number(latest.usage.input_tokens);
    const cacheReadTokens = Number(latest.usage.cached_input_tokens);
    if (inputTokens <= 0 || cacheReadTokens < 0 || cacheReadTokens > inputTokens) return null;
    return { source: "codex-rollout", cacheHitRate: cacheReadTokens / inputTokens,
      inputTokens, cacheReadTokens, rawUsage: latest.usage,
      observedAt: latest.timestamp, eventId: `${latest.timestamp || ""}:${latest.ordinal || ""}` };
  } catch { return null; }
}
