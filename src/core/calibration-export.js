// Export observed distributions without inventing a calibrated verdict threshold.
export function distributionArchive(run) {
  if (!run || !["one-token", "astra-community"].includes(run.evaluator_id) || run.status !== "ok") return null;
  const { observations = [], sampling, wireApi } = run.metadata || {};
  if (!sampling || !wireApi || observations.length !== (run.evaluator_id === "one-token" ? 10 : 5)
    || observations.some(row => row.sampleCount < 10 || !row.prompt || Object.values(row.counts || {}).reduce((sum, n) => sum + n, 0) !== row.sampleCount)) return null;
  const model = run.canonical_model_id || run.observed_model;
  if (!model) return null;
  return { version: 2, source: `Modivue observation: ${run.base_url || "local"}; ${run.timestamp}; verify this endpoint before using as a reference`,
    models: { [model]: { revision: `observed-${run.id}`, wireApi, reasoningEffort: sampling.reasoningEffort, maxOutputTokens: sampling.maxOutputTokens,
      probability: { method: run.evaluator_id === "one-token" ? "one-token:en:v1" : "astra-community:adapted:v1", system: sampling.system,
        temperature: sampling.temperature, repetitions: Math.max(...observations.map(row => row.planned)), maxJsd: null,
        cells: observations.map(row => ({ prompt: row.prompt, sampleCount: row.sampleCount,
          distribution: Object.fromEntries(Object.entries(row.counts).map(([answer, count]) => [answer, count / row.sampleCount])) })) } } } };
}
