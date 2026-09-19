// Process presence means running until the host supplies an explicit state.
export function normalizeAgentStatus(session = {}) {
  const explicit = session.displayStatus || session.status;
  if (["", "unknown", null, undefined].includes(explicit)
    && session.source === "process" && session.metadata?.pid) return "running";
  return explicit || "unknown";
}

// Herdr's explicit activity overrides a stale host turn state.
export function isAgentWorking(session) {
  const status = normalizeAgentStatus(session);
  if (status === "running" && session.source === "process" && session.statusSource !== "herdr") {
    // Codex and Claude Code have richer session evidence; a bare process row is
    // presence only. Generic CLI agents expose no equivalent turn state, so a
    // running process is the only reliable live-activity signal we have.
    return !["codex", "claude-code"].includes(session.host);
  }
  return ["active", "working", "running", "planning", "tool"].includes(status);
}

export function claudeTranscriptStatus(records = []) {
  for (const record of [...records].reverse()) {
    if (record.type === "assistant") {
      if (["end_turn", "stop_sequence", "max_tokens"].includes(record.message?.stop_reason)) return "idle";
      return record.message?.stop_reason === "tool_use" ? "tool" : "working";
    }
    if (record.type === "user" && record.message) return "working";
  }
  return "running";
}

export function canProbeSession(session, now = Date.now(), graceMs = 3000) {
  if (session.endedAt || session.parentSessionId) return false;
  if (isAgentWorking(session)) return true;
  if (!["idle", "done", "waiting", "running"].includes(normalizeAgentStatus(session))) return false;
  // An open, configured session is eligible before its first turn and while
  // waiting. Only a known recent transition needs the configured grace period.
  const idleSince = Date.parse(session.idleSince || "");
  if (!Number.isFinite(idleSince)) return !Number.isFinite(Date.parse(session.lastActiveAt || ""))
    && !Number.isFinite(Date.parse(session.lastSeenAt || ""));
  return now - idleSince >= graceMs && now - idleSince < 15 * 60000;
}
