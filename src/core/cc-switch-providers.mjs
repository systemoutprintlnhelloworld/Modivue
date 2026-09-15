import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "smol-toml";

// Read in place, without changing CC Switch or evaluating its user scripts.
export function ccSwitchProviders() {
  if (process.env.MODIVUE_UI_ARTIFACTS) return [];
  let db;
  try {
    db = new DatabaseSync(join(homedir(), ".cc-switch", "cc-switch.db"), { readOnly: true });
    // Only the provider currently selected by CC Switch is an active source.
    // Historical/failover entries stay hidden until CC Switch marks them current.
    return db.prepare("SELECT name, app_type, settings_config, meta, is_current FROM providers WHERE is_current = 1").all().flatMap(row => {
      try {
        const config = JSON.parse(row.settings_config), usage = JSON.parse(row.meta || "{}").usage_script;
        const env = config.env || {}, codex = typeof config.config === "string" ? parse(config.config) : {};
        const provider = codex.model_providers?.[codex.model_provider] || {};
        const baseUrl = provider.base_url || env.ANTHROPIC_BASE_URL || env.GOOGLE_GEMINI_BASE_URL;
        const apiKey = config.auth?.OPENAI_API_KEY || provider.experimental_bearer_token
          || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY;
        if (!baseUrl || !apiKey) return [];
        const script = typeof usage?.code === "string" ? usage.code : "";
        // CC Switch scripts are intentionally not evaluated.  Extract only
        // their declarative same-origin URL and common field hints so custom
        // relay adapters remain safe and useful without running arbitrary JS.
        const path = script.match(/(?:\{\{baseUrl\}\}|\$\{baseUrl\}|baseUrl\s*\+\s*)["'`]?(\/(?:api|v1|user|account)[^"'`\s}]*)/i)?.[1]
          || script.match(/url:\s*["'`]\{\{baseUrl\}\}([^"'`]*)["'`]/)?.[1];
        const adapter = usage?.templateType === "new-api" || path === "/api/user/self" ? "new-api"
          : path === "/v1/usage" ? "usage" : path === "/user/balance" ? "general"
          : !script.trim() ? "auto" : "custom";
        const custom = adapter === "custom" && path ? {
          endpointPath: path,
          remainingPath: script.match(/(?:remaining|balance|quota)[^\n]{0,80}?['"]([\w.]+)['"]/i)?.[1] || "data.balance",
          totalPath: script.match(/total[^\n]{0,80}?['"]([\w.]+)['"]/i)?.[1] || "",
          usedPath: script.match(/used[^\n]{0,80}?['"]([\w.]+)['"]/i)?.[1] || "",
          unit: script.match(/unit[^\n]{0,40}?['"]([A-Za-z]+)['"]/i)?.[1] || "credits", enabled: true
        } : {};
        return [{ label: row.name, baseUrl, apiKey, source: "cc-switch",
          wireApi: row.app_type === "claude" ? "messages" : "responses",
          balanceConfig: usage?.enabled ? { adapter, enabled: true, accessToken: usage.accessToken || "",
            userId: usage.userId || "", queryKey: usage.apiKey || "", ...custom } : undefined }];
      } catch { return []; }
    });
  } catch (error) {
    if (/unable to open database|no such table/i.test(error.message)) return [];
    throw error;
  } finally { db?.close(); }
}
