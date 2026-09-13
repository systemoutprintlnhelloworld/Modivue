import { endAgentSession, upsertAgentSession } from "../src/core/storage.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

async function readInput() {
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function cacheRatio(input) {
  if (Number.isFinite(Number(input.prompt_cache?.hit_ratio))) return Number(input.prompt_cache.hit_ratio);
  const usage = input.context_window?.current_usage;
  if (!usage) return null;
  const read = Number(usage.cache_read_input_tokens || 0);
  const total = Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0) + read;
  return total > 0 ? read / total : null;
}

const input = await readInput();
const sessionId = input.session_id;
if (!sessionId) process.exit(0);
let pid = null;
try {
  // Hook commands may run through a shell; use the Claude ancestor, not the hook PID.
  let stdout;
  if (process.platform === "win32") {
    const result = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      'Get-CimInstance Win32_Process | ForEach-Object { "{0} {1} {2}" -f $_.ProcessId,$_.ParentProcessId,$_.Name }'], { timeout: 5000, windowsHide: true });
    stdout = result.stdout;
  } else ({ stdout } = await promisify(execFile)("/bin/ps", ["-axo", "pid=,ppid=,comm="], { timeout: 1000 }));
  const parents = new Map(stdout.trim().split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [[Number(match[1]), { parent: Number(match[2]), command: match[3].split("/").at(-1) }]] : [];
  }));
  let ancestor = process.ppid;
  while (parents.has(ancestor)) {
    const entry = parents.get(ancestor);
    if (["claude", "claude.exe"].includes(entry.command)) { pid = ancestor; break; }
    if (entry.parent === ancestor) break;
    ancestor = entry.parent;
  }
} catch {}
const event = input.hook_event_name || "StatusLine";
if (event === "SessionEnd") {
  endAgentSession("claude-code", sessionId);
} else {
  const switchedModel = event === "PostModelSwitch" ? input.to_model : null;
  const status = ["Stop", "SessionStart"].includes(event) ? "idle"
    : ["StopFailure", "PostToolUseFailure"].includes(event) ? "error"
    : event === "PermissionRequest" || event === "Notification" && input.notification_type === "permission_prompt" ? "waiting"
    : event === "PreToolUse" ? input.tool_name === "EnterPlanMode" ? "planning" : "tool"
    : ["UserPromptSubmit", "PostToolUse"].includes(event) ? "running" : undefined;
  upsertAgentSession({ sessionId, host: "claude-code", status,
    model: switchedModel || input.model?.id || input.model || null,
    displayName: input.model?.display_name || input.session_name || null,
    protocol: "anthropic", cwd: input.workspace?.current_dir || input.cwd || null,
    source: event === "StatusLine" ? "claude-statusline" : `claude-hook:${event}`,
    cacheHitRate: cacheRatio(input), metadata: { transcriptPath: input.transcript_path || null,
      agentName: input.agent?.name || null, promptId: input.prompt_id || null, hookEvent: event, pid } });
}
