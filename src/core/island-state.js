// One state owns the model rail, its focused metric layer and history.
export function transitionIsland(state, event) {
  switch (event.type) {
    case "border": return { mode: "normal", modelId: null };
    case "ring": return event.modelId ? { mode: "focus", modelId: event.modelId } : state;
    case "leave": return { mode: "compact", modelId: null };
    case "removed": return state.modelId === event.modelId ? { mode: "normal", modelId: null } : state;
    default: return state;
  }
}
