const tokenCount = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function ttftGauge(milliseconds, thresholdMs) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const threshold = Math.max(1, Number(thresholdMs) || 2000);
  return threshold / (threshold + milliseconds);
}

export function estimateTokenCost(usage, pricing) {
  if (!pricing || usage.inputTokens == null || usage.outputTokens == null) return null;
  const read = usage.cacheReadTokens || 0;
  const write = usage.cacheWriteTokens || 0;
  const parts = [
    [usage.inputTokens - read - write, pricing.input],
    [read, pricing.cache_read ?? pricing.input],
    [write, pricing.cache_write ?? pricing.input],
    [usage.outputTokens, pricing.output]
  ];
  if (parts.some(([tokens, rate]) => tokens < 0 || tokens > 0 && (!Number.isFinite(rate) || rate < 0))) return null;
  return parts.reduce((total, [tokens, rate]) => total + (tokens ? tokens * rate : 0), 0) / 1_000_000;
}

export function normalizeUsage(protocol, usage = {}) {
  usage ||= {};
  const outputTokens = protocol === "gemini" && tokenCount(usage.candidatesTokenCount) !== null
    ? usage.candidatesTokenCount + (tokenCount(usage.thoughtsTokenCount) || 0)
    : tokenCount(usage.output_tokens ?? usage.completion_tokens);
  const cacheReadTokens = tokenCount(protocol === "anthropic" ? usage.cache_read_input_tokens
    : usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? usage.cachedContentTokenCount);
  const cacheWriteTokens = protocol === "anthropic" ? tokenCount(usage.cache_creation_input_tokens) : null;
  const uncachedInputTokens = protocol === "anthropic" ? tokenCount(usage.input_tokens) : null;
  // Anthropic input_tokens excludes both cache reads and cache writes.
  const inputTokens = protocol === "anthropic"
    ? [uncachedInputTokens, cacheReadTokens, cacheWriteTokens].every(Number.isFinite)
      ? uncachedInputTokens + cacheReadTokens + cacheWriteTokens : null
    : tokenCount(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount);
  const valid = inputTokens > 0 && cacheReadTokens !== null && cacheReadTokens <= inputTokens;
  return {
    inputTokens, outputTokens, uncachedInputTokens, cacheReadTokens, cacheWriteTokens,
    cacheHitRate: valid ? cacheReadTokens / inputTokens : null,
    cacheStatus: valid ? "available" : cacheReadTokens !== null && inputTokens !== null && cacheReadTokens > inputTokens ? "invalid" : "unavailable"
  };
}

export function ttftMs(requestStartedAt, firstContentAt) {
  if (!Number.isFinite(requestStartedAt) || !Number.isFinite(firstContentAt) || firstContentAt < requestStartedAt) return null;
  return Math.round(firstContentAt - requestStartedAt);
}

export function aggregate(samples) {
  const ordered = [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const usable = ordered.filter((sample) => sample.status === "ok");
  const ttft = statistics(usable.map((sample) => sample.ttftMs));
  const cache = statistics(usable.map((sample) => sample.cacheHitRate));
  const reported = usable.filter((sample) => Number.isFinite(sample.cacheHitRate) && sample.inputTokens > 0 && Number.isFinite(sample.cacheReadTokens));
  const inputTokens = reported.reduce((total, sample) => total + sample.inputTokens, 0);
  const cacheReadTokens = reported.reduce((total, sample) => total + sample.cacheReadTokens, 0);
  const completeCache = usable.length > 0 && reported.length === usable.length;
  const reportedCacheHitRate = inputTokens > 0 ? cacheReadTokens / inputTokens : null;
  const durations = statistics(usable.map((sample) => sample.durationMs));
  const costs = samples.map((sample) => sample.costUsd).filter(Number.isFinite);
  return {
    sampleCount: usable.length, totalCount: samples.length, errorCount: samples.length - usable.length,
    rangeStart: ordered[0]?.timestamp ?? null, rangeEnd: ordered.at(-1)?.timestamp ?? null,
    latest: ordered.at(-1) ?? null,
    ttftMs: ttft.mean, ttft, cache,
    cacheHitRate: completeCache ? reportedCacheHitRate : null,
    reportedCacheHitRate, cacheSampleCount: reported.length,
    cacheCoverage: usable.length ? reported.length / usable.length : 0,
    cacheStatus: completeCache ? "available" : reported.length ? "partial" : "unavailable",
    inputTokens, cacheReadTokens, durationMs: durations.mean, duration: durations,
    costUsd: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
    costSampleCount: costs.length
  };
}

export function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const count = sorted.length;
  const percentile = (fraction) => count ? sorted[Math.max(0, Math.ceil(count * fraction) - 1)] : null;
  return { count, min: sorted[0] ?? null, max: sorted.at(-1) ?? null,
    mean: count ? sorted.reduce((sum, value) => sum + value, 0) / count : null,
    p50: percentile(0.5), p95: percentile(0.95) };
}
