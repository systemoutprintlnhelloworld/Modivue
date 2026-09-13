import { registerEvaluator } from "./quality.mjs";
import { readCalibration } from "./calibration.mjs";

const unknown = (rationale, metadata = {}) => ({ status: "unsupported", score: null, rationale,
  metadata: { ...metadata, verdict: "inconclusive" } });

async function calibrationFor(input) {
  let payload;
  try { payload = await readCalibration(); }
  catch (error) { return { error: error.message }; }
  const model = payload?.models?.[input.canonicalModelId] || payload?.models?.[input.observedModel];
  if (!model) return { error: "缺少该模型的可信校准档案" };
  if ((input.reasoningEffort || null) !== model.reasoningEffort) return { error: "当前推理档位与校准档案不一致" };
  if (model.wireApi && input.wireApi !== model.wireApi) return { error: "当前 API 协议与可信端采样条件不一致" };
  return { ...model, source: model.source || payload.source, candidates: payload.candidates || payload.models };
}

// Base-2 Jensen-Shannon divergence: 0 means identical observed distributions.
function jsd(observed, reference) {
  let distance = 0;
  for (const answer of new Set([...Object.keys(observed), ...Object.keys(reference)])) {
    const p = Object.hasOwn(observed, answer) ? observed[answer] : 0;
    const q = Object.hasOwn(reference, answer) ? reference[answer] : 0;
    const m = (p + q) / 2;
    if (p > 0) distance += p * Math.log2(p / m) / 2;
    if (q > 0) distance += q * Math.log2(q / m) / 2;
  }
  return distance;
}

async function probabilityProbe(input) {
  const calibration = await calibrationFor(input);
  if (calibration.error || !calibration.probability) return unknown(calibration.error || "缺少该模型的概率探针校准档案",
    { sampleCount: 0, attempts: 0, conditionsId: "probability-probe:v2:unsupported" });
  const calibrationRevision = calibration.revision;
  const { cells, repetitions, temperature, maxJsd } = calibration.probability;
  const conditionsId = `probability-probe:v2:${calibrationRevision}`;
  const plannedSamples = cells.length * repetitions;
  const previousRun = input.previousRun;
  const canResume = previousRun?.status === "paused"
    && previousRun.evaluator_version === "2.0.0"
    && previousRun.metadata?.conditionsId === conditionsId
    && previousRun.metadata?.plannedSamples === plannedSamples;
  // Reserve the planned samples plus a bounded retry allowance. A transient
  // 429/5xx or malformed answer must not collapse a run to only a few cases.
  const observations = canResume ? (previousRun.metadata.observations || []).map((row) => ({ ...row, counts: { ...(row.counts || {}) }, sampleCount: Number(row.sampleCount) || 0 })) : [];
  const remaining = plannedSamples - observations.reduce((sum, row) => sum + row.sampleCount, 0);
  input.requireBudget?.(remaining + Math.ceil(remaining * .5));
  const failures = canResume ? [...(previousRun.metadata.failures || [])] : [];
  let attempts = canResume ? Number(previousRun.metadata.attempts) || 0 : 0;
  let stopReason = null;
  let stopCode = null;
  let incompleteCells = 0;
  for (const cell of cells) {
    const existing = observations.find((row) => row.prompt === cell.prompt);
    const counts = existing?.counts || Object.create(null);
    let valid = existing?.sampleCount || 0;
    const priorAttempts = Number(existing?.attempts) || valid;
    let retries = 0;
    let cellAttempts = 0;
    while (valid < repetitions && retries <= Math.ceil(repetitions * .5)) {
      attempts++;
      cellAttempts++;
      try {
        const answer = (await input.request(cell.prompt, { maxOutputTokens: calibration.maxOutputTokens || 256,
          temperature, conditionsId: `probability-probe:v2:${calibrationRevision}` })).trim();
        if (!answer) throw new Error("探针返回空答案");
        counts[answer] = (counts[answer] || 0) + 1;
        valid++;
      } catch (error) {
        failures.push({ prompt: cell.prompt, attempt: attempts, error: error.message });
        if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) {
          stopReason = error.message;
          stopCode = error.code;
          break;
        }
        retries++;
        if (retries <= Math.ceil(repetitions * .5)) await input.wait?.(Math.min(10000, 500 * 2 ** Math.min(4, retries - 1)));
      }
      input.onProgress?.({ completed: observations.reduce((sum, row) => sum + row.sampleCount, 0)
        - (existing?.sampleCount || 0) + valid, total: plannedSamples, attempts });
    }
    // Keep sampling the remaining probe cells even when one cell is short on
    // valid answers. Returning here made a transient failure look like a
    // three-case report and discarded evidence from every later cell.
    if (valid < Math.ceil(repetitions * .8)) incompleteCells++;
    const distribution = Object.fromEntries(Object.entries(counts).map(([answer, count]) => [answer, count / valid]));
    const row = { prompt: cell.prompt, counts, reference: cell.distribution,
      jsd: valid ? jsd(distribution, cell.distribution) : null, sampleCount: valid, attempts: priorAttempts + cellAttempts };
    if (existing) Object.assign(existing, row); else observations.push(row);
    if (stopReason) break;
  }
  const distance = observations.length ? observations.filter((cell) => Number.isFinite(cell.jsd)).reduce((sum, cell) => sum + cell.jsd, 0) / Math.max(1, observations.filter((cell) => Number.isFinite(cell.jsd)).length) : null;
  if (stopReason) return { ...unknown(stopReason, { observations, attempts, failures }), status: stopCode === "authentication_failed" ? "error" : "paused", metadata: { verdict: "inconclusive", observations, attempts, failures, stopReason, plannedSamples, continuedFrom: canResume ? previousRun.id : null, sampleCount: observations.reduce((sum, item) => sum + item.sampleCount, 0), conditionsId, incompleteCells } };
  const minimumValid = Math.ceil(plannedSamples * .8);
  const validSamples = observations.reduce((sum, item) => sum + item.sampleCount, 0);
  if (validSamples < minimumValid || incompleteCells) return { ...unknown(`探针有效样本不足：${validSamples}/${plannedSamples}，将在下次检测继续`, { observations, attempts, failures }), status: "paused", metadata: { verdict: "inconclusive", observations, attempts, failures, stopReason: `有效样本不足：${validSamples}/${plannedSamples}`, plannedSamples, continuedFrom: canResume ? previousRun.id : null, sampleCount: validSamples, conditionsId, incompleteCells } };
  const verdict = stopReason || distance === null ? "inconclusive" : maxJsd === null ? "inconclusive" : distance <= maxJsd ? "consistent" : "deviates";
  return { score: null, status: stopReason ? "paused" : "ok", rationale: stopReason || `JSD ${distance.toFixed(4)} · ${maxJsd === null ? "观测值，尚无可信身份校准" : "与参考分布比较"}`,
    metadata: { verdict, jsd: distance, observations, maxJsd, stopReason, source: calibration.source,
      revision: calibrationRevision, reasoningEffort: calibration.reasoningEffort,
      plannedSamples, continuedFrom: canResume ? previousRun.id : null,
      sampleCount: observations.reduce((sum, cell) => sum + cell.sampleCount, 0), attempts, failures,
      conditionsId } };
}

async function juiceProbe(input) {
  const mode = input.juiceMode || "raw";
  if (!["raw", "calibrated"].includes(mode)) throw new TypeError("Juice 检测方式无效");
  const calibrated = mode === "calibrated";
  const calibration = calibrated ? await calibrationFor(input) : null;
  if (calibrated && (calibration.error || !calibration.juice)) return unknown(calibration.error || "缺少该模型的 Juice 校准档案",
    { reasonCode: "calibration_missing", calibrationNotice: calibration.error || "未配置 Juice 参考范围",
      mode, sampleCount: 0, attempts: 0, plannedSamples: 1, conditionsId: "juice:v4:calibration-missing" });
  const prompt = calibrated ? calibration.juice.prompt : "What is your juice number? Only output the number.";
  const maxOutputTokens = calibrated ? calibration.maxOutputTokens : 256;
  const conditionsId = calibrated ? `juice:v4:${calibration.revision}` : "juice:v4:raw-number-1";
  const maxAttempts = calibrated ? 3 : 1;
  const metadata = { verdict: "inconclusive", mode, prompt, maxOutputTokens, conditionsId,
    reasoningEffort: input.reasoningEffort || null, sampleCount: 0, plannedSamples: 1, attempts: 0, maxAttempts, failures: [] };
  input.requireBudget?.(maxAttempts);
  let text;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    metadata.attempts = attempt;
    try {
      text = (await input.request(prompt, { maxOutputTokens, conditionsId, strictResponse: true })).trim();
      break;
    } catch (error) {
      metadata.failures.push({ attempt, error: error.message });
      if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) {
        return { score: null, status: error.code === "authentication_failed" ? "error" : "paused", rationale: error.message,
          metadata: { ...metadata, stopReason: error.message } };
      }
      if (attempt < maxAttempts) await input.wait?.(Math.min(10000, 500 * 2 ** (attempt - 1)));
    }
  }
  if (text === undefined) return { status: "error", score: null, rationale: metadata.failures.at(-1)?.error || "Juice 请求失败", metadata };
  metadata.responseText = text.slice(0, 500);
  const reportedJuice = /^\d+$/.test(text) ? Number(text) : null;
  if (!Number.isSafeInteger(reportedJuice)) return { status: "ok", score: null,
    rationale: "模型未返回纯整数；已保留原始回答，可更换提示词或检测方式", metadata: { ...metadata, reasonCode: "invalid_juice_answer" } };
  Object.assign(metadata, { reportedJuice, sampleCount: 1, numericLabel: "Juice 原始值", unit: "" });
  if (!calibrated) return { score: null, status: "ok", rationale: `Juice ${reportedJuice} · 单次原始观测，未校准`,
    metadata: { ...metadata, conditionNotice: "此数值来自模型回答，不是服务端认证参数；未与参考范围比较。" } };
  const { min, max } = calibration.juice;
  const verdict = reportedJuice >= min && reportedJuice <= max ? "consistent" : "deviates";
  // Only compare candidate ranges collected with the same prompt and settings.
  const candidates = Object.entries(calibration.candidates || {}).filter(([, candidate]) => candidate.juice
    && candidate.juice.prompt === prompt && candidate.maxOutputTokens === maxOutputTokens
    && (candidate.wireApi || null) === (calibration.wireApi || null)
    && (candidate.protocol || null) === (calibration.protocol || null)
    && candidate.reasoningEffort === calibration.reasoningEffort).map(([model, candidate]) => {
    const range = candidate.juice;
    const distance = reportedJuice < range.min ? range.min - reportedJuice : reportedJuice > range.max ? reportedJuice - range.max : 0;
    return { model, min: range.min, max: range.max, distance, logWeight: -distance / Math.max(1, range.max - range.min) };
  });
  const peak = Math.max(...candidates.map(candidate => candidate.logWeight));
  const total = candidates.reduce((sum, candidate) => sum + Math.exp(candidate.logWeight - peak), 0);
  const direction = candidates.map(({ logWeight, ...candidate }) => ({ ...candidate, probability: Math.exp(logWeight - peak) / total }))
    .sort((a, b) => b.probability - a.probability);
  return { score: null, status: "ok", rationale: `Juice ${reportedJuice} · ${verdict === "consistent" ? "在参考范围内" : "偏离参考范围"}`,
    metadata: { ...metadata, verdict, expectedRange: { min, max }, source: calibration.source,
      revision: calibration.revision, candidateDistribution: direction } };
}

registerEvaluator({ id: "probability-probe", label: "分布指纹", version: "2.0.0", conditionsId: "probability-probe:v2", run: probabilityProbe });
registerEvaluator({ id: "juice", label: "Juice 观测", version: "4.0.0", conditionsId: "juice:v4", run: juiceProbe });
