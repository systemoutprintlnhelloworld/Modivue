// Adapted from Ooo0ption/KBF, Apache-2.0; see KBF-LICENSE.txt.
// Modivue uses the shared request queue and preserves every failed batch.
import { registerEvaluator } from "./quality.mjs";
import { getSettings } from "./storage.mjs";
import baseline from "../data/kbf-baselines.json" with { type: "json" };

export function binomialTail(k, n, p) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let logChoose = 0, sum = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += Math.exp(logChoose + i * Math.log(p) + (n - i) * Math.log1p(-p));
    logChoose += Math.log(n - i) - Math.log(i + 1);
  }
  return Math.min(1, sum);
}
export function referenceErrorBound(k, n) {
  if (!n || k >= n) return 1;
  let low = 0, high = 1;
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (binomialTail(k + 1, n, middle) < .99) low = middle; else high = middle;
  }
  return (low + high) / 2;
}
export function parseKbfNumbers(text, count, range) {
  const lines = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim().split("\n");
  const number = line => {
    const matches = line.replace(/[−–]/g, "-").replaceAll(",", "").match(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g);
    const value = matches ? Number(matches.at(-1)) : NaN;
    return Number.isFinite(value) && value >= range[0] && value <= range[1] ? value : null;
  };
  const indexed = new Map();
  for (const line of lines.map(line => line.trim())) {
    if (/^(#|---|\|)/.test(line)) continue;
    const match = line.match(/^\((\d+)\)\s*|^(\d+)[.)]\s+/);
    if (match) {
      const i = Number(match[1] || match[2]) - 1;
      if (i >= 0 && i < count) indexed.set(i, number(line.slice(match[0].length)));
    }
  }
  if (indexed.size) return Array.from({ length: count }, (_, i) => indexed.get(i) ?? null);
  const values = lines.filter(line => line.trim() && !/^(#|---)/.test(line.trim())).map(line => number(line.replace(/^\(\d+\)\s*|^\d+[.)]\s+/, "")));
  return Array.from({ length: count }, (_, i) => values[i] ?? null);
}
const modelKey = value => String(value || "").split("/").at(-1).replaceAll(".", "-");
export function kbfPlan(input) {
  const settings = getSettings();
  const requested = settings.kbfReferenceModel === "current" ? input.canonicalModelId || input.observedModel : settings.kbfReferenceModel;
  const reference = baseline.references.find(item => modelKey(item.model) === modelKey(requested));
  if (!reference) return null;
  const grouped = Object.groupBy(reference.probes, probe => probe.domain);
  const batches = Object.keys(grouped).sort().flatMap(domain => {
    const rows = grouped[domain];
    return Array.from({ length: Math.ceil(rows.length / 10) }, (_, index) => rows.slice(index * 10, index * 10 + 10));
  });
  return { reference, batches: settings.kbfTier === "full" ? batches : batches.slice(0, 1), full: settings.kbfTier === "full" };
}

registerEvaluator({ id: "knowledge-boundary", label: "KBF 知识边界核验", version: "1.0.0", conditionsId: "kbf:v1",
  requirements: { models: baseline.references.map(item => ({ id: item.model, samples: item.probes.length,
    requests: Object.values(Object.groupBy(item.probes, probe => probe.domain)).reduce((sum, rows) => sum + Math.ceil(rows.length / 10), 0) })) },
  async run(input) {
    const plan = kbfPlan(input);
    if (!plan) return { status: "unsupported", rationale: "当前模型没有 KBF 公共基准，请在设置中选择要对照的参考模型", metadata: { verdict: "inconclusive", source: baseline.source } };
    const { reference, batches, full } = plan;
    input.requireBudget?.(batches.length);
    const conditionsId = `kbf:v1:${baseline.revision}:${reference.model}:${full ? "full" : "screen"}`;
    const observations = [], failures = [], results = [];
    for (const [index, probes] of batches.entries()) {
      const domain = baseline.domains[probes[0].domain];
      const sentences = probes.map((probe, i) => `(${i + 1}) ${domain.template.replace("{name}", probe.name)}`).join("\n");
      const prompt = baseline.template.replace("{sentences}", sentences);
      try {
        const actual = await input.request(prompt, { system: baseline.system, temperature: 0, reasoningEffort: "none", maxOutputTokens: 80 * probes.length, conditionsId });
        const values = parseKbfNumbers(actual, probes.length, domain.range);
        const rows = probes.map((probe, i) => ({ ...probe, actual: values[i], matched: values[i] !== null && probe.answer !== null
          && Math.abs(probe.answer - values[i]) <= domain.tolerance * (domain.mode === "relative" ? Math.max(Math.abs(probe.answer), 1e-10) : 1) }));
        results.push(...rows);
        observations.push({ id: `batch-${index}`, prompt, counts: { [actual]: 1 }, planned: 1, sampleCount: 1 });
      } catch (error) {
        failures.push({ cellId: `batch-${index}`, attempt: index + 1, error: error.message });
        if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) break;
      }
      input.onProgress?.({ completed: observations.length, total: batches.length });
    }
    const parsed = results.filter(row => row.actual !== null), discrepancies = parsed.filter(row => !row.matched).length;
    const p0 = referenceErrorBound(reference.selfErrors, reference.selfTotal);
    const pValue = binomialTail(discrepancies, parsed.length, Math.min(p0, .99));
    const eligible = full && !failures.length && parsed.length >= reference.probes.length / 2 && reference.selfTotal >= reference.probes.length / 2;
    return { status: failures.length ? "error" : "ok", rationale: !eligible ? "KBF 采样已记录，未满足完整核验条件" : pValue < .05 ? "与参考知识边界不一致" : "未发现超过参考噪声的差异",
      metadata: { verdict: eligible ? pValue < .05 ? "deviates" : "consistent" : "inconclusive", source: baseline.source, revision: baseline.revision,
        conditionsId, referenceModel: reference.model, p0, pValue, discrepancies, parsedAnswers: parsed.length, results, observations, failures,
        sampleCount: observations.length, plannedSamples: batches.length, attempts: observations.length + failures.length,
        conditionNotice: "KBF 每批最多 10 题；试采档只保存证据。完整档按公开参考自测的 CP99 上界与单侧二项检验计算，需至少 50% 可解析覆盖率。当前参考属于固定历史版本。" } };
  }
});
