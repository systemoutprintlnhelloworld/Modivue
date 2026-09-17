import { basename, join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import JSON5 from "json5";
// Process/config adapters for common coding agents. Adapters are deliberately
// data driven: a running process is enough to show presence, while probing is
// enabled only when an explicit model, endpoint and credential are available.
export const agentAdapters = [
  ["aider", "Aider", "aider", "openai", [".aider.conf.yml", ".aider.conf.yaml"], ["AIDER_MODEL", "AIDER_OPENAI_API_BASE", "AIDER_OPENAI_API_KEY"]],
  ["gemini-cli", "Gemini CLI", "gemini", "gemini", [".gemini/.env", ".gemini/settings.json"], ["GEMINI_MODEL", "GOOGLE_GEMINI_BASE_URL", "GEMINI_API_KEY", "GOOGLE_API_KEY"]],
  ["opencode", "OpenCode", "opencode", "openai", [".config/opencode/opencode.json", ".config/opencode/opencode.jsonc"], ["OPENCODE_MODEL", "OPENCODE_BASE_URL", "OPENCODE_API_KEY"]],
  ["goose", "Goose", "goose", "openai", [".config/goose/config.yaml", ".config/goose/config.yml"], ["GOOSE_MODEL", "GOOSE_BASE_URL", "GOOSE_API_KEY"]],
  ["qwen-code", "Qwen Code", "qwen", "openai", [".qwen/settings.json"], ["QWEN_MODEL", "QWEN_BASE_URL", "DASHSCOPE_API_KEY"]],
  ["cline", "Cline", "cline", "openai", [".cline/data/globalState.json"], ["CLINE_MODEL", "CLINE_BASE_URL", "CLINE_API_KEY"]],
  ["roo-code", "Roo Code", "roo", "openai", [".roo/settings.json", "Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/settings.json"], ["ROO_MODEL", "ROO_BASE_URL", "ROO_API_KEY"]],
  ["continue", "Continue", "continue", "openai", [".continue/config.json", ".continue/config.yaml", "Library/Application Support/Code/User/globalStorage/continue.continue/config.json"], ["CONTINUE_MODEL", "CONTINUE_BASE_URL", "CONTINUE_API_KEY"]],
  ["amp", "Amp", "amp", "openai", [".config/amp/settings.json"], ["AMP_MODEL", "AMP_BASE_URL", "AMP_API_KEY"]],
  ["pi", "Pi", "pi", "openai", [".pi/agent/settings.json", ".pi/agent/models.json"], ["PI_MODEL", "PI_BASE_URL", "PI_API_KEY"]],
  ["grok-build", "Grok Build", "grok", "openai", [".grok/config.toml"], []],
  ["hermes", "Hermes", "hermes", "openai", [".hermes/.env", ".hermes/config.yaml"], []],
  ["openclaw", "OpenClaw", "openclaw", "openai", [".openclaw/openclaw.json"], []],
  ["cursor-agent", "Cursor Agent", "cursor-agent", "openai", [".cursor-agent/settings.json"], ["CURSOR_MODEL", "CURSOR_BASE_URL", "CURSOR_API_KEY"]],
  ["warp", "Warp AI", "warp", "openai", [".warp/settings.json"], ["WARP_MODEL", "WARP_BASE_URL", "WARP_API_KEY"]],
  ["windsurf", "Windsurf", "windsurf", "openai", [".codeium/windsurf/settings.json", "Library/Application Support/Windsurf/User/settings.json"], ["WINDSURF_MODEL", "WINDSURF_BASE_URL", "WINDSURF_API_KEY"]],
  ["github-copilot", "GitHub Copilot", "github-copilot", "openai", ["Library/Application Support/Code/User/globalStorage/github.copilot-chat/config.json"], ["GITHUB_COPILOT_MODEL", "GITHUB_COPILOT_BASE_URL", "GITHUB_COPILOT_API_KEY"]],
  ["amazon-q", "Amazon Q Developer", "q", "openai", [".aws/amazonq/config.json"], ["AMAZON_Q_MODEL", "AMAZON_Q_BASE_URL", "AMAZON_Q_API_KEY"]],
  ["trae", "Trae", "trae", "openai", ["Library/Application Support/Trae/User/settings.json"], ["TRAE_MODEL", "TRAE_BASE_URL", "TRAE_API_KEY"]],
  ["codebuddy", "CodeBuddy", "codebuddy", "openai", [".codebuddy/settings.json"], ["CODEBUDDY_MODEL", "CODEBUDDY_BASE_URL", "CODEBUDDY_API_KEY"]],
  ["junie", "Junie", "junie", "openai", [".junie/settings.json"], ["JUNIE_MODEL", "JUNIE_BASE_URL", "JUNIE_API_KEY"]],
  ["plandex", "Plandex", "plandex", "openai", [".plandex/config.json"], ["PLANDEX_MODEL", "PLANDEX_BASE_URL", "PLANDEX_API_KEY"]],
  ["gptme", "GPTMe", "gptme", "openai", [".config/gptme/config.toml"], ["GPTME_MODEL", "GPTME_BASE_URL", "GPTME_API_KEY"]]
].map(([id, label, command, protocol, configPaths, envKeys]) => ({ id, label, command, protocol, configPaths, envKeys,
  configCapability: ["aider", "gemini-cli", "opencode", "goose", "qwen-code", "continue", "pi", "grok-build", "hermes", "openclaw", "gptme", "cline", "roo-code"].includes(id) ? "selected-provider" : "presence-only",
  aliases: { "github-copilot": ["copilot"], "cursor-agent": ["cursor", "agent"], "continue": ["cn"], "grok-build": ["grok"], "gemini-cli": ["gemini"], "qwen-code": ["qwen"] }[id] || [],
  processPatterns: { "cline": ["saoudrizwan.claude-dev"], "roo-code": ["rooveterinaryinc.roo-cline"], "continue": ["continue.continue"], "cursor-agent": ["cursor-agent"], "github-copilot": ["GitHub Copilot"], "amazon-q": ["amazon-q"], "windsurf": ["Windsurf"] }[id] || [] }));

export function adapterEnvironment(adapter, env = process.env) {
  const prefix = `MODIVUE_${adapter.id.toUpperCase().replaceAll("-", "_")}`;
  const short = adapter.id.toUpperCase().replaceAll("-", "_");
  const keys = adapter.envKeys || [];
  const first = (candidates) => candidates.map((key) => env[key]).find((value) => typeof value === "string" && value.trim()) || null;
  const modelKeys = keys.filter((key) => /MODEL/i.test(key));
  const baseKeys = keys.filter((key) => /(BASE|URL|ENDPOINT)/i.test(key));
  const keyKeys = keys.filter((key) => /(KEY|TOKEN|SECRET)/i.test(key));
  return { model: first([`${prefix}_MODEL`, `${short}_MODEL`, ...modelKeys]),
    baseUrl: first([`${prefix}_BASE_URL`, `${short}_BASE_URL`, ...baseKeys]),
    apiKey: first([`${prefix}_KEY`, `${short}_KEY`, ...keyKeys]) };
}

export function adapterConfigPaths(adapter, home, cwd) {
  const paths = [...(adapter.configPaths || [])];
  if (process.platform === "win32") {
    for (let index = 0; index < paths.length; index++) paths[index] = paths[index].replace(/^Library\/Application Support\//, "AppData/Roaming/");
  }
  if (adapter.id === "qwen-code") paths.push(".qwen/.env");
  const project = adapter.id === "opencode" ? ["opencode.json", "opencode.jsonc", ".opencode/opencode.json", ".opencode/opencode.jsonc"] : paths;
  return [...new Set([...paths.map(path => joinHome(path, home)), ...project.map(path => joinHome(path, cwd))])];
}

export function adapterForProcess(argv) {
  // Match executable/package paths, never arbitrary prompt arguments.
  const bundle = (typeof argv === "string" ? argv : argv?.[0] || "").match(/^\/.*\/(Warp|Windsurf|Trae)\.app\/Contents\/MacOS\//)?.[1];
  if (bundle) return agentAdapters.find(adapter => adapter.id === bundle.toLowerCase()) || null;
  const words = (typeof argv === "string" ? argv.trim().match(/"[^"]*"|[^\s]+/g) || [] : argv || [])
    .map(word => word.replace(/^"|"$/g, "").replaceAll("\\", "/"));
  const command = words[0]?.split("/").at(-1)?.replace(/\.(exe|cmd)$/i, "");
  const entry = /^(?:node|bun|python(?:3(?:\.\d+)?)?)$/.test(command || "") ? words.find((word, index) => index > 0 && !word.startsWith("-")) : words[0];
  if (!entry) return null;
  const name = entry.split("/").at(-1).replace(/\.(exe|cmd)$/i, "");
  return agentAdapters.find(adapter => name === adapter.command || adapter.aliases.includes(name)
    || ({ "gemini-cli": /\/@google\/gemini-cli\//, "qwen-code": /\/@qwen-code\/qwen-code\//,
      pi: /\/(?:@mariozechner|@earendil-works)\/pi-coding-agent\//,
      opencode: /\/opencode(?:-ai|-darwin[^/]*)?\//, aider: /\/aider(?:\/|$)/,
      hermes: /\/hermes_cli\// }[adapter.id]?.test(entry))) || null;
}

function joinHome(path, root) {
  return join(root, path);
}

const text = value => typeof value === "string" && value.trim() ? value.trim() : null;
const transports = {
  openai: ["openai", "chat"], "openai-completions": ["openai", "chat"], "openai-compatible": ["openai", "chat"],
  responses: ["openai", "responses"], "openai-responses": ["openai", "responses"], chat_completions: ["openai", "chat"],
  anthropic: ["anthropic", "messages"], "anthropic-messages": ["anthropic", "messages"],
  gemini: ["gemini", "generateContent"], "google-generative-ai": ["gemini", "generateContent"]
};

// Resolve only the selected provider node. Never recursively combine model,
// endpoint and credentials from unrelated providers or MCP server settings.
export function resolveAdapterConfig(id, config, env = {}) {
  const secret = value => {
    const name = text(value)?.match(/^(?:\$\{(\w+)\}|\$(\w+)|\{env:(\w+)\})$/);
    if (name) return text(env[name[1] || name[2] || name[3]]);
    if (text(value)?.startsWith("!")) return null;
    return text(value);
  };
  const route = (model, provider, baseUrl, apiKey, effort = null) => {
    const [protocol, wireApi] = transports[provider] || [null, null];
    return { model: text(model), provider: text(provider), baseUrl: text(baseUrl), apiKey: secret(apiKey),
      protocol, wireApi, reasoningEffort: effort,
      error: protocol ? null : "尚未支持该提供方协议", configStatus: "parsed" };
  };
  const split = value => { const index = text(value)?.indexOf("/") ?? -1; return index > 0 ? [value.slice(0, index), value.slice(index + 1)] : [null, text(value)]; };
  if (id === "opencode") {
    const [provider, model] = split(config.model);
    const selected = config.provider?.[provider];
    const options = selected?.options || {};
    const protocol = { "@ai-sdk/openai": "responses", "@ai-sdk/openai-compatible": "openai", "@ai-sdk/anthropic": "anthropic", "@ai-sdk/google": "gemini" }[selected?.npm];
    return route(model, protocol, options.baseURL, options.apiKey);
  }
  if (id === "pi") {
    const selected = config.providers?.[config.defaultProvider];
    const model = selected?.models?.find(item => item.id === config.defaultModel);
    return route(config.defaultModel, model?.api || selected?.api, model?.baseUrl || selected?.baseUrl,
      text(env[selected?.apiKey]) || selected?.apiKey, config.defaultThinkingLevel);
  }
  if (id === "openclaw") {
    const value = config.agents?.defaults?.model;
    const [provider, model] = split(typeof value === "string" ? value : value?.primary);
    const selected = config.models?.providers?.[provider];
    return route(model, selected?.api, selected?.baseUrl, selected?.apiKey, config.agents?.defaults?.thinkingDefault);
  }
  if (id === "grok-build") {
    const selected = config.model?.[config.models?.default] || {};
    return route(selected.model, selected.api_backend, selected.base_url, selected.api_key || env[selected.env_key]);
  }
  if (id === "hermes") {
    const model = config.model || {};
    const selected = config.providers?.[model.provider]
      || config.custom_providers?.find(item => item.name === model.provider);
    return route(model.default, selected?.api_mode || (selected ? "openai" : null),
      model.base_url || selected?.base_url, selected?.api_key, config.agent?.reasoning_effort);
  }
  if (id === "qwen-code") {
    const auth = config.security?.auth || {};
    const provider = auth.selectedType;
    const protocol = config.providerProtocol?.[provider] || provider;
    const model = config.model?.name;
    const matches = (config.modelProviders?.[provider] || []).filter(item => item.id === model
      && (!config.model?.baseUrl || config.model.baseUrl === item.baseUrl));
    if (matches.length > 1) return { model, error: "同名模型存在多个渠道，缺少当前 baseUrl", configStatus: "ambiguous" };
    const selected = matches[0];
    const keyName = selected?.envKey || { openai: "OPENAI_API_KEY", "openai-responses": "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" }[protocol];
    return route(model || env.OPENAI_MODEL, protocol, selected?.baseUrl || auth.baseUrl || env.OPENAI_BASE_URL,
      selected ? env[keyName] : auth.apiKey || env[keyName], config.model?.reasoningEffort);
  }
  if (id === "gemini-cli") return route(config.model?.name || env.GEMINI_MODEL, "gemini",
    env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com", env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (id === "aider") {
    const [prefix, model] = split(config.model || env.AIDER_MODEL);
    const protocol = prefix || "openai";
    return route(model, protocol, config["openai-api-base"] || env.OPENAI_API_BASE || env.OPENAI_BASE_URL
      || (protocol === "anthropic" ? "https://api.anthropic.com" : protocol === "openai" ? "https://api.openai.com/v1" : null),
    protocol === "anthropic" ? config["anthropic-api-key"] || env.ANTHROPIC_API_KEY : config["openai-api-key"] || env.OPENAI_API_KEY);
  }
  if (id === "continue") {
    const selected = (config.models || []).filter(item => !item.roles || item.roles.includes("chat"));
    if (selected.length !== 1) return { error: "配置含多个聊天模型，需从运行会话确定当前模型", configStatus: "ambiguous" };
    return route(selected[0].model, selected[0].provider, selected[0].apiBase, selected[0].apiKey,
      selected[0].defaultCompletionOptions?.reasoningEffort);
  }
  if (id === "goose") {
    const provider = env.GOOSE_PROVIDER || config.GOOSE_PROVIDER;
    return route(env.GOOSE_MODEL || config.GOOSE_MODEL, provider,
      env.OPENAI_HOST || config.OPENAI_HOST || (provider === "openai" ? "https://api.openai.com" : null),
      provider === "openai" ? env.OPENAI_API_KEY || config.OPENAI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : null);
  }
  if (id === "gptme") {
    const [provider, model] = split(config.env?.MODEL || env.MODEL || env.GPTME_MODEL);
    return route(model, provider, env.OPENAI_BASE_URL || config.env?.OPENAI_BASE_URL || (provider === "anthropic" ? "https://api.anthropic.com" : provider === "openai" ? "https://api.openai.com/v1" : null),
      provider === "anthropic" ? env.ANTHROPIC_API_KEY || config.env?.ANTHROPIC_API_KEY : env.OPENAI_API_KEY || config.env?.OPENAI_API_KEY);
  }
  if (id === "cline" || id === "roo-code") {
    const values = config.apiConfiguration || config;
    const prefix = (values.mode || config.mode || "act") === "plan" ? "planMode" : "actMode";
    const provider = values[`${prefix}ApiProvider`] || values.apiProvider;
    if (provider === "openai") return route(values[`${prefix}OpenAiModelId`] || values.openAiModelId, "openai", values.openAiBaseUrl, values.openAiApiKey);
    if (provider === "anthropic") return route(values[`${prefix}ApiModelId`] || values.apiModelId, "anthropic", values.anthropicBaseUrl || "https://api.anthropic.com", values.apiKey);
    if (provider === "openai-native") return route(values[`${prefix}OpenAiNativeModelId`] || values.openAiNativeModelId, "openai", "https://api.openai.com/v1", values.openAiNativeApiKey);
    return { configStatus: "parsed", error: "当前提供方或密钥保存在编辑器 SecretStorage，需通过本地代理观察" };
  }
  return { configStatus: "presence-only", error: "尚无此工具的当前模型配置适配" };
}

export async function readAdapterConnection(adapter, env, home, cwd, argv = []) {
  let config = {}, fileEnv = {}, configPath = null, error = null;
  const paths = adapter.id === "gemini-cli" && env.GEMINI_CLI_HOME
    ? [join(env.GEMINI_CLI_HOME, ".gemini/.env"), join(env.GEMINI_CLI_HOME, ".gemini/settings.json"), join(cwd, ".gemini/.env"), join(cwd, ".gemini/settings.json")]
    : adapter.id === "opencode" && env.OPENCODE_CONFIG
    ? [...adapterConfigPaths(adapter, home, cwd), env.OPENCODE_CONFIG]
    : adapter.id === "pi" && env.PI_CODING_AGENT_DIR
    ? [join(env.PI_CODING_AGENT_DIR, "settings.json"), join(env.PI_CODING_AGENT_DIR, "models.json")]
    : adapterConfigPaths(adapter, home, cwd);
  for (const path of paths) {
    try {
      const contents = await readFile(path, "utf8");
      configPath = path;
      if (basename(path) === ".env") {
        for (const line of contents.split(/\r?\n/)) {
          const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
          if (match) fileEnv[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
        }
      } else {
        const parsed = path.endsWith(".toml") ? parseToml(contents) : /\.ya?ml$/.test(path) ? parseYaml(contents) : JSON5.parse(contents);
        config = { ...config, ...parsed };
      }
    } catch (cause) { if (cause.code !== "ENOENT") error = "配置无法读取或格式无效"; }
  }
  const runtimeEnv = { ...fileEnv, ...config.env, ...env };
  const modelIndex = argv.findIndex(value => value === "--model" || value === "-m");
  const cliModel = modelIndex >= 0 ? argv[modelIndex + 1] : argv.find(value => value.startsWith("--model="))?.slice(8);
  if (cliModel) {
    if (["gemini-cli", "qwen-code"].includes(adapter.id)) config.model = { ...config.model, name: cliModel };
    else if (adapter.id === "pi") config.defaultModel = cliModel;
    else if (adapter.id === "goose") config.GOOSE_MODEL = cliModel;
    else if (["opencode", "aider"].includes(adapter.id)) config.model = cliModel;
  }
  const override = adapterEnvironment(adapter, runtimeEnv);
  const values = resolveAdapterConfig(adapter.id, config, runtimeEnv);
  const explicit = override.model && override.baseUrl && override.apiKey;
  return { ...values, ...(explicit ? { ...override, protocol: adapter.protocol, wireApi: adapter.protocol === "gemini" ? "generateContent" : "chat", error: null, configStatus: "explicit" } : {}),
    configPath, source: explicit ? "environment" : configPath ? "config" : null, ...(error ? { error, configStatus: "error" } : {}) };
}
