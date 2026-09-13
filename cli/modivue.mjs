#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const command = args[0] || "status";
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
if (["help", "--help", "-h"].includes(command)) {
  console.log(`Modivue — coding agent monitor
  node cli/modivue.mjs status [--json] [--model MODEL] [--hours 24]
  node cli/modivue.mjs watch [--json] [--interval 5]
  node cli/modivue.mjs agents [--json]
  node cli/modivue.mjs reports [--json]
  --url http://127.0.0.1:4173    Optional running Modivue service
  --base-url URL --key-group GROUP --reasoning-effort LEVEL
Reads the local database by default; never starts provider tests.
Claude Code statusline: node cli/statusline.mjs --plain`);
  process.exit(0);
}
if (!["status", "watch", "agents", "reports"].includes(command)) { console.error("Unknown command. Run --help."); process.exit(2); }
const serviceUrl = option("--url") || process.env.MODIVUE_URL;
const origin = serviceUrl ? new URL(serviceUrl) : null;
if (origin && (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))) throw new Error("Use the local Modivue HTTP service.");
const interval = Number(option("--interval") || 5);
if (!Number.isFinite(interval) || interval < 1 || interval > 3600) throw new Error("Interval must be 1–3600 seconds.");
const query = new URLSearchParams({ hours: option("--hours") || "24" });
if (!Number.isFinite(Number(query.get("hours"))) || Number(query.get("hours")) < 0) throw new Error("Hours must be a nonnegative number.");
for (const [flag, key] of [["--model", "model"], ["--base-url", "baseUrl"], ["--key-group", "keyGroup"], ["--reasoning-effort", "reasoningEffort"]]) {
  const value = option(flag); if (value !== undefined) query.set(key, value);
}
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());
const get = async path => {
  if (!origin) {
    const { summary, listQualityRuns, listAgentSessions } = await import("../src/core/storage.mjs");
    const filters = { ...Object.fromEntries(query), hours: Number(query.get("hours")) };
    if (command === "agents") return { agents: listAgentSessions() };
    if (command === "reports") return { runs: listQualityRuns(filters) };
    return { groups: summary(filters) };
  }
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
  if (!response.ok) throw new Error(`Local service HTTP ${response.status}`);
  return response.json();
};
while (!controller.signal.aborted) {
  try {
    const data = command === "agents" ? await get("/api/agents") : command === "reports" ? await get(`/api/quality/runs?${query}`)
      : await get(`/api/summary?${query}`);
    if (args.includes("--json")) console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...data }));
    else {
      if (command === "watch" && process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
      console.log(`Modivue · ${new Date().toLocaleTimeString()}`);
      if (command === "agents") console.table((data.agents || []).map(agent => ({ agent: agent.label || agent.host, model: agent.model, status: agent.displayStatus || agent.status })));
      else if (command === "reports") console.table((data.runs || []).slice(0, 20).map(run => ({ model: run.observed_model, method: run.evaluator_id, status: run.status, result: run.rationale })));
      else console.table((data.groups || []).map(row => ({ model: row.observedModel, endpoint: row.baseUrl, key: row.keyGroup,
        effort: row.reasoningEffort || "—", samples: row.sampleCount, cache: row.reportedCacheHitRate == null ? "—" : `${(row.reportedCacheHitRate * 100).toFixed(1)}%`,
        ttftMs: row.ttftMs ?? "—" })));
    }
  } catch (error) {
    if (!controller.signal.aborted) { console.error(`Modivue: ${error.message}`); if (command !== "watch") process.exitCode = 1; }
  }
  if (command !== "watch") break;
  await delay(interval * 1000, undefined, { signal: controller.signal }).catch(() => {});
}
