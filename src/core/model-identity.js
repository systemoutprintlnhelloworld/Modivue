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

export function modelIdentity(value) { return JSON.stringify(modelIdentityParts(value)); }
