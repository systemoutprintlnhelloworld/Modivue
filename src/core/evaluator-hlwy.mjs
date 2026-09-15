import { registerEvaluator } from "./quality.mjs";
import { publicBaselineFor, publicBaselineCandidates } from "./public-baselines.mjs";
import { readCalibration } from "./calibration.mjs";
import { hlwyPrompt, trustedHLWYReference } from "./hlwy-reference.js";

export { hlwyPrompt };
const hlwyVersion = "1.1.0";

// HLWY's published matching formula; a similarity index, not an identity probability.
export function hlwySimilarity(numbers, reference) {
  const counts = Array(355).fill(0);
  numbers.forEach((number) => counts[number - 1]++);
  const distribution = counts.map((count) => count / numbers.length);
  const mode = counts.indexOf(Math.max(...counts)) + 1;
  let dot = 0, norm = 0, referenceNorm = 0, jsd = 0;
  for (let i = 0; i < 355; i++) {
    dot += distribution[i] * reference.distribution[i];
    norm += distribution[i] ** 2; referenceNorm += reference.distribution[i] ** 2;
    const p = distribution[i] + 1e-10, q = reference.distribution[i] + 1e-10, middle = (p + q) / 2;
    jsd += (p * Math.log(p / middle) + q * Math.log(q / middle)) / 2;
  }
  const cosine = dot / Math.sqrt(norm * referenceNorm);
  const modeScore = Math.max(0, 1 - Math.abs(mode - reference.stats.mode) / 50);
  return { value: Math.min(100, Math.max(0, (modeScore + cosine * Math.exp(-jsd)) * 50)),
    counts, distribution, mode, referenceMode: reference.stats.mode, cosine, jsd, jsdLogBase: "e", modeScore };
}

function candidateScore(result) {
  return Math.max(0, result.cosine * Math.exp(-result.jsd));
}

async function run(input) {
  const trusted = input.hlwySource === "trustedApi" ? trustedHLWYReference(await readCalibration(), input) : null;
  const reference = trusted || publicBaselineFor(input);
  if (!reference) return { status: "unsupported", rationale: "HLWY 公共基准暂未覆盖此模型", metadata: { verdict: "inconclusive", reasonCode: "baseline_missing" } };
  const attempts = input.sampleCount ?? 10;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 500) throw new TypeError("HLWY 样本数必须为 1–500 的整数");
  const conditionsId = `hlwy:v1:${reference.trusted ? "trusted:" : ""}${reference.timestamp}`;
  const previousRun = input.previousRun;
  const previous = previousRun?.metadata;
  const canResume = previousRun?.status === "paused" && previousRun.evaluator_version === hlwyVersion
    && previous?.conditionsId === conditionsId && previous.attempts === attempts
    && previous.baselineModel === reference.model && previous.protocol === input.protocol
    && previous.wireApi === input.wireApi
    && Array.isArray(previous.rawNumbers);
  const numbers = canResume ? [...previous.rawNumbers] : [];
  const invalid = canResume ? [...(previous.invalid || [])] : [];
  const remaining = attempts - numbers.length;
  const retryAllowance = Math.ceil(remaining * .5);
  input.requireBudget?.(remaining + retryAllowance);
  let requestAttempts = canResume ? previous.evaluatorAttempts : 0;
  const maxAttempts = requestAttempts + remaining + retryAllowance;
  const failures = canResume ? [...previous.failures] : [];
  let stopReason = null;
  let stopCode = null;
  input.onProgress?.({ completed: numbers.length, total: attempts, requestAttempts });
  sampling: while (numbers.length < attempts && requestAttempts < maxAttempts) {
    let text = "";
    let number = null;
    let retry = 0;
    while (number === null && requestAttempts < maxAttempts) {
      requestAttempts++;
      try {
        text = (await input.request(hlwyPrompt, { temperature: 1, maxOutputTokens: 256,
          conditionsId })).trim();
        if (!text) throw new Error("空响应");
        if (/^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= 355) number = Number(text);
        else throw new Error("响应不是 1–355 的整数");
      } catch (error) {
        failures.push({ attempt: requestAttempts, error: error.message });
        if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) {
          stopReason = error.message;
          stopCode = error.code;
          break sampling;
        }
        retry++;
        if (requestAttempts < maxAttempts) await input.wait?.(Math.max(error.retryAfterMs || 0, Math.min(10000, 500 * 2 ** Math.min(4, retry - 1))));
      }
    }
    if (Number.isInteger(number)) numbers.push(number);
    else invalid.push({ attempt: requestAttempts, response: text.slice(0, 500) });
    input.onProgress?.({ completed: numbers.length, total: attempts, requestAttempts });
  }
  const metadata = { verdict: "inconclusive", source: reference.source, revision: reference.timestamp,
    baselineModel: reference.model, referenceSampleCount: reference.iterations, referenceDistribution: reference.distribution,
    sourceMode: reference.trusted ? "trustedApi" : "public", requestedSource: input.hlwySource || "public",
    baselineReasoningEffort: reference.reasoningEffort || null, reasoningEffort: input.reasoningEffort || null,
    conditionNotice: reference.trusted ? "使用同模型、协议、提示词、温度和输出上限的可信 API 分布；基准匹配忽略思考强度，相似度不等于身份认证。"
      : `${input.hlwySource === "trustedApi" ? "没有当前模型同条件的可信分布，已回退公共分布。" : ""}上游公共基准未记录推理档位；匹配度仅供参考。`,
    prompt: hlwyPrompt, temperature: 1, maxOutputTokens: 256, sampleCount: numbers.length, attempts, requestAttempts,
    evaluatorAttempts: requestAttempts, rawNumbers: numbers, invalid, failures, stopReason,
    protocol: input.protocol, wireApi: input.wireApi, continuedFrom: canResume ? previousRun.id : null,
    conditionsId, numericLabel: "HLWY 匹配度", unit: "%" };
  if (stopReason) return { status: stopCode === "authentication_failed" ? "error" : "paused", rationale: stopReason, metadata };
  const minimumValid = Math.max(1, Math.ceil(attempts * .8));
  if (numbers.length < minimumValid || numbers.length / attempts < .8) return { status: "unsupported",
    rationale: `有效样本不足：${numbers.length}/${attempts}，至少 ${minimumValid} 个且有效率不低于 80%`, metadata };
  const result = hlwySimilarity(numbers, reference);
  const candidates = (reference.trusted ? [reference] : publicBaselineCandidates()).map((candidate) => {
    const scored = hlwySimilarity(numbers, candidate);
    return { model: candidate.model, score: candidateScore(scored), similarity: scored.value,
      cosine: scored.cosine, jsd: scored.jsd, mode: scored.mode, referenceMode: scored.referenceMode,
      sampleCount: numbers.length };
  }).sort((left, right) => right.score - left.score);
  const total = candidates.reduce((sum, candidate) => sum + Math.exp(candidate.score), 0);
  const candidateDistribution = candidates.map((candidate) => ({ ...candidate,
    relativeMatch: total ? Math.exp(candidate.score) / total * 100 : 0 }));
  const closest = candidateDistribution[0];
  const preview = numbers.length < 50;
  return { status: "ok", rationale: `${preview ? "少量样本预览 · " : ""}HLWY 匹配度 ${result.value.toFixed(2)}% · ${numbers.length} 个有效样本`,
    metadata: { ...metadata, ...result, plannedSamples: attempts, reasons: preview ? ["screen_preview"] : [],
      directedModel: preview ? null : closest?.model || null,
      directionScore: preview ? null : closest?.relativeMatch ?? null, candidateDistribution } };
}

registerEvaluator({ id: "hlwy-fingerprint", label: "HLWY 分布匹配", version: hlwyVersion, conditionsId: "hlwy:v1", run });
