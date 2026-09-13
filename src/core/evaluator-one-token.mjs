import { registerEvaluator } from "./quality.mjs";
import { getSettings } from "./storage.mjs";
import { readCalibration } from "./calibration.mjs";
import { normalizeMeowAnswer } from "./evaluator-meow.mjs";

// English battery derived from Table I and section IV of arXiv:2607.10252v1.
// These explicit templates are Modivue's adaptation, not a copied paper dataset.
export const oneTokenPrompts = [
  "Name a random number between 1 and 100.", "Name a random number between 1 and 10.",
  "What is your favorite number?", "Name a random letter.", "Name a random word.",
  "Name a random color.", "What is your favorite color?", "Name a random animal.",
  "Name a random city.", "Flip a coin: heads or tails?"
];
const system = "Reply with exactly one word or number. Do not explain.";
export function normalizeOneToken(text, index) {
  const value = normalizeMeowAnswer(text.normalize("NFC").replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) % 16)))
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  if (!value) return { status: "empty", value: null };
  if (/\b(cannot|can't|sorry|unable|refuse)\b/.test(value)) return { status: "refusal", value: null };
  if (/\s/.test(value)) return { status: "invalid", value: null };
  const n = Number(value);
  const valid = index < 3 ? Number.isFinite(n) && (index === 2 || Number.isInteger(n) && n >= 1 && n <= (index ? 10 : 100))
    : index === 3 ? /^[a-z]$/.test(value) : index === 9 ? ["heads", "tails"].includes(value) : true;
  return { status: valid ? "valid" : "invalid", value: valid ? index < 3 ? String(n) : value : null };
}
export function distributionJsd(p, q) {
  let result = 0;
  for (const key of new Set([...Object.keys(p), ...Object.keys(q)])) {
    const a = p[key] || 0, b = q[key] || 0, middle = (a + b) / 2;
    if (a) result += a * Math.log2(a / middle) / 2;
    if (b) result += b * Math.log2(b / middle) / 2;
  }
  return result;
}
registerEvaluator({ id: "one-token", label: "One Token 分布指纹", version: "1.0.0", conditionsId: "one-token:en:v1",
  async run(input) {
    const repetitions = getSettings().oneTokenSamples;
    const archive = await readCalibration();
    const candidate = archive?.models?.[input.canonicalModelId] || archive?.models?.[input.observedModel];
    const reference = candidate?.probability?.method === "one-token:en:v1" && candidate.probability.system === system
      && candidate.probability.temperature === 1 && candidate.maxOutputTokens === 16 && candidate.reasoningEffort === "none"
      && candidate.wireApi === input.wireApi ? candidate : null;
    input.requireBudget?.(oneTokenPrompts.length * repetitions);
    const observations = oneTokenPrompts.map((prompt, index) => ({ id: `one-token-${index}`, prompt, counts: Object.create(null), responses: [], planned: repetitions, sampleCount: 0 }));
    const failures = [];
    let attempts = 0;
    sampling: for (let repetition = 0; repetition < repetitions; repetition++) {
      for (const [index, observation] of observations.entries()) {
        attempts++;
        try {
          const raw = await input.request(observation.prompt, { system, temperature: 1, reasoningEffort: "none", maxOutputTokens: 16, rejectReasoning: true, conditionsId: "one-token:en:v1" });
          const parsed = normalizeOneToken(raw, index);
          observation.responses.push({ raw, ...parsed });
          if (parsed.status === "valid") {
            observation.counts[parsed.value] = (observation.counts[parsed.value] || 0) + 1;
            observation.sampleCount++;
          }
        } catch (error) {
          failures.push({ cellId: observation.id, attempt: attempts, error: error.message });
          if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) break sampling;
        }
        input.onProgress?.({ completed: attempts, total: oneTokenPrompts.length * repetitions });
      }
    }
    for (const row of observations) {
      const cell = reference?.probability.cells.find(cell => cell.prompt === row.prompt && cell.sampleCount >= 10);
      row.reference = cell?.distribution || null;
      row.jsd = cell && row.sampleCount >= 10 ? distributionJsd(Object.fromEntries(Object.entries(row.counts).map(([key, count]) => [key, count / row.sampleCount])), cell.distribution) : null;
    }
    const comparable = observations.filter(row => row.jsd !== null);
    const distance = comparable.length ? comparable.reduce((sum, row) => sum + row.jsd, 0) / comparable.length : null;
    const complete = comparable.length === oneTokenPrompts.length && !failures.length;
    return { status: failures.length ? "error" : "ok", rationale: distance === null ? "分布已记录，缺少同条件参考或每题有效样本不足 10 次" : `JSD ${distance.toFixed(4)}`,
      metadata: { verdict: complete && Number.isFinite(reference?.probability.maxJsd) ? distance <= reference.probability.maxJsd ? "consistent" : "deviates" : "inconclusive",
        source: "https://arxiv.org/html/2607.10252v1", revision: reference?.revision || "modivue-english-battery-v1", system, temperature: 1, maxOutputTokens: 16, reasoningEffort: "none",
        sampling: { system, temperature: 1, maxOutputTokens: 16, reasoningEffort: "none" },
        observations, failures, attempts, jsd: distance, comparableCells: comparable.length,
        sampleCount: observations.reduce((sum, row) => sum + row.sampleCount, 0), plannedSamples: oneTokenPrompts.length * repetitions,
        conditionNotice: "英文 10 类任务适配；每题默认 1 次用于预览，可设为至少 10 次统计分布。强制关闭推理，16 token 上限；拒答、空答案与多词答案分别保留。同条件参考需使用 one-token:en:v1 校准档案。未复现论文的四语言全集和准确率。" } };
  }
});
