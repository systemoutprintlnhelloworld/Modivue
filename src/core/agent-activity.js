// Process presence means running until the host supplies an explicit state.
export function normalizeAgentStatus(session = {}) {
  const explicit = session.displayStatus || session.status;
  if (["", "unknown", null, undefined].includes(explicit)
    && session.source === "process" && session.metadata?.pid) return "running";
  return explicit || "unknown";
}

// Herdr's explicit activity overrides a stale host turn state.
export function isAgentWorking(session) {
  if (normalizeAgentStatus(session) === "running" && session.source === "process" && session.statusSource !== "herdr") return false;
  return ["active", "working", "running", "planning", "tool"].includes(normalizeAgentStatus(session));
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

export function canProbeSession(session, now = Date.now()) {
  if (session.endedAt || session.parentSessionId) return false;
  if (isAgentWorking(session)) return true;
  if (!["idle", "done", "waiting"].includes(normalizeAgentStatus(session))) return false;
  // Only a known recent turn opens a background window. Discovering an
  // already idle pane is not itself evidence of recent work.
  const lastActive = Date.parse(session.lastActiveAt || "");
  const idleSince = Date.parse(session.idleSince || "");
  return Number.isFinite(lastActive) && Number.isFinite(idleSince)
    && now - idleSince >= 3000 && now - idleSince < 15 * 60000;
}
