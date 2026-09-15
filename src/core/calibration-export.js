// Export observed distributions without inventing a calibrated verdict threshold.
export function distributionArchive(run) {
  if (!run || !["one-token", "astra-community", "meow-fingerprint", "probability-probe"].includes(run.evaluator_id) || run.status !== "ok") return null;
  const { observations = [], sampling = {} } = run.metadata || {};
  const wireApi = run.wire_api || run.wireApi || run.metadata?.wireApi;
  if (!wireApi || !observations.length
    || observations.some(row => row.sampleCount < 10 || !row.prompt || Object.values(row.counts || {}).reduce((sum, n) => sum + n, 0) !== row.sampleCount)) return null;
  const model = run.canonical_model_id || run.observed_model;
  if (!model) return null;
  const method = run.evaluator_id === "one-token" ? "one-token:en:v1"
    : run.evaluator_id === "astra-community" ? "astra-community:adapted:v1"
      : run.evaluator_id === "meow-fingerprint" ? "meow:empirical:v1" : undefined;
  const repetitions = Math.max(...observations.map(row => Number(row.planned) || row.sampleCount));
  const minimumRepetitions = run.evaluator_id === "probability-probe" ? 16 : 10;
  if (!Number.isSafeInteger(repetitions) || repetitions < minimumRepetitions || repetitions > 100) return null;
  return { version: 2, source: `Modivue observation: ${run.base_url || "local"}; ${run.timestamp}; verify this endpoint before using as a reference`,
    models: { [model]: { revision: `observed-${run.id}`, wireApi,
      reasoningEffort: sampling.reasoningEffort ?? run.metadata?.reasoningEffort ?? null,
      maxOutputTokens: Number.isSafeInteger(sampling.maxOutputTokens) ? sampling.maxOutputTokens
        : Number.isSafeInteger(run.max_output_tokens) ? run.max_output_tokens : 256,
      probability: { ...(method ? { method } : {}), system: sampling.system || undefined,
        temperature: sampling.temperature ?? null, repetitions, maxJsd: null,
        cells: observations.map(row => ({ prompt: row.prompt, sampleCount: row.sampleCount,
          distribution: Object.fromEntries(Object.entries(row.counts).map(([answer, count]) => [answer, count / row.sampleCount])) })) } } } };
}
