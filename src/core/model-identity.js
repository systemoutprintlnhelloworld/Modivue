export function reasoningEffortOf(value) {
  const parameters = value.measurement?.requestParameters || {};
  return value.reasoningEffort ?? value.reasoning_effort ?? value.metadata?.reasoningEffort
    ?? parameters.reasoning?.effort ?? parameters.reasoning_effort ?? parameters.output_config?.effort ?? null;
}

export function modelIdentityParts(value) {
  const base = value.baseUrl ?? value.base_url ?? value.endpoint ?? null;
  return [
    value.canonicalModelId || value.canonical_model_id || value.observedModel || value.observed_model || value.model || null,
    base ? base.replace(/\/+$/, "") : null,
    value.keyGroup ?? value.key_group ?? null,
    reasoningEffortOf(value)
  ];
}

export function modelIdentity(value, options = {}) {
  const parts = modelIdentityParts(value);
  // Quality methods (except Juice) intentionally share results between
  // reasoning profiles.  Callers that need the strict four-tuple (routing,
  // Juice and request de-duplication) keep the default behaviour.
  if (options.ignoreReasoning) parts[3] = null;
  return JSON.stringify(parts);
}

export function qualityIdentity(value, evaluatorId) {
  return modelIdentity(value, { ignoreReasoning: evaluatorId !== "juice" });
}
