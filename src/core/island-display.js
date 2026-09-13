import { isAgentWorking } from "./agent-activity.js";

/**
 * Return only sessions that can be represented by the live island.
 * A configured model without a concrete session must never appear as active UI.
 */
export function liveIslandModels(models = []) {
  const latestActivity = model => Math.max(0, ...model.sessions.map(session => Date.parse(session.lastActiveAt || session.idleSince || "") || 0));
  return models
    .filter((model) => model?.sessions?.some((session) => session?.sessionId && !session.parentSessionId))
    .sort((a, b) => latestActivity(b) - latestActivity(a)
      || Number(b.sessions.some(isAgentWorking)) - Number(a.sessions.some(isAgentWorking))
      || String(a.id).localeCompare(String(b.id)));
}

export function workingIslandModels(models = []) {
  return liveIslandModels(models).filter((model) => model.sessions.some(isAgentWorking));
}

/**
 * Compact mode is a work indicator; attended/normal mode keeps all live
 * sessions visible so idle routes remain identifiable. An all-idle island
 * intentionally returns an empty compact list and lets the caller render
 * “等待 Agent”.
 */
export function islandDisplayModels(models = [], mode = "compact") {
  const live = liveIslandModels(models);
  const working = workingIslandModels(live);
  if (mode === "compact") {
    const ids = new Set(working.map((model) => model.id));
    return live.filter((model) => ids.has(model.id));
  }
  return live;
}

export function islandWaiting(models = []) {
  return liveIslandModels(models).length > 0 && workingIslandModels(models).length === 0;
}
