import { comparableAnswer } from "./answer-comparison.js";
import { qualityIdentity } from "./model-identity.js";
import { summarizeBazaarlink } from "./bazaarlink-summary.js";

export const verificationVersions = Object.freeze({ "probability-probe": "2.0.0", juice: "4.0.0", "hlwy-fingerprint": "1.1.0", "meow-fingerprint": "4.5.4-modivue.1", "custom-question": "1.0.0", ztest: "1.0.0", "ztest-local": "1.0.0", "bazaarlink-probe": "1.0.0", "knowledge-boundary": "1.0.0", "one-token": "1.0.0", "astra-community": "1.0.0" });

export const questionConditionsId = question => JSON.stringify(["question:v1", question.id, question.prompt, question.answer, question.match]);

// A question revision and one model route define a series. Failed requests
// remain visible; only completed automatic comparisons enter the match rate.
export function summarizeQuestionRuns(runs = [], { question, target, since = 0, until = Date.now() } = {}) {
  const candidates = runs.filter(run => run.evaluator_id === "custom-question" && run.evaluator_version === verificationVersions["custom-question"])
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const latest = candidates.at(-1);
  question ??= latest?.metadata?.question;
  target ??= latest;
  const conditionsId = question ? questionConditionsId(question) : null;
  const selected = candidates.filter(run => conditionsId && run.metadata?.conditionsId === conditionsId
    && qualityIdentity(run, "custom-question") === qualityIdentity(target, "custom-question")
    && Date.parse(run.timestamp) >= since && Date.parse(run.timestamp) <= until);
  let matched = 0, compared = 0, reviewed = 0, errors = 0;
  const points = [];
  for (const run of selected) {
    if (run.status !== "ok") { errors++; continue; }
    if (question.match === "review") { reviewed++; continue; }
    compared++;
    if (comparableAnswer(run.metadata.actual, question.answer)) matched++;
    points.push({ timestamp: run.timestamp, value: matched, ratio: matched / compared * 100 });
  }
  return { questionId: question?.id || null, conditionsId, matched, total: selected.length, compared, reviewed, errors,
    ratio: compared ? matched / compared : null, since: new Date(since).toISOString(), until: new Date(until).toISOString(),
    firstSampleAt: selected[0]?.timestamp || null, lastSampleAt: selected.at(-1)?.timestamp || null, points };
}

export function verificationRunLabel(run) {
  if (!run) return "待核验";
  if (run.status === "unsupported") {
    if (run.metadata?.reasonCode === "protocol_mismatch" || /协议|protocol|Responses/.test(run.rationale || "")) return "协议条件不匹配";
    if (run.metadata?.reasonCode === "baseline_missing" || /基准未覆盖|基准暂未覆盖/.test(run.rationale || "") || (run.metadata?.source && /Meow/.test(run.rationale || ""))) return "基准未覆盖";
    if (run.metadata?.reasonCode === "calibration_missing" || run.metadata?.calibrationNotice) return "校准不可用";
    if (/校准|基准|覆盖|凭据|配置/.test(run.rationale || "")) return "前置条件不足";
    return "方案不支持";
  }
  if (run.status === "paused") return run.metadata?.controlAction === "stop" ? "核验已终止" : "检测已暂停，等待下次继续";
  if (run.status !== "ok") return "核验请求失败";
  if (run.evaluator_id === "ztest") return "Ztest 第三方检测报告";
  if (run.evaluator_id === "ztest-local") return "Ztest 本地兼容探针 · 待人工复核";
  if (run.evaluator_id === "bazaarlink-probe") {
    const result = summarizeBazaarlink(run.metadata?.externalReport);
    return `${result.label}${result.detectedModel ? ` → ${result.detectedModel}` : ""}`;
  }
  if (run.evaluator_id === "custom-question") return run.metadata?.question?.match === "review" || run.metadata?.matched === null ? "待人工复核" : (run.metadata?.question ? comparableAnswer(run.metadata.actual, run.metadata.question.answer) : run.metadata?.matched) ? "答案匹配" : "答案不匹配";
  const metadata = run.metadata || {};
  if (run.evaluator_id === "hlwy-fingerprint") {
    if (metadata.sampleCount < 50) return "少量样本预览 · 仅比较分布";
    return "分布比较完成 · 未校准身份判定线";
  }
  if (run.evaluator_id === "juice" && metadata.mode === "raw") return Number.isFinite(metadata.reportedJuice) ? "原始观测 · 未校准" : "未返回有效数值";
  if (metadata.verdict === "consistent") return run.evaluator_id === "meow-fingerprint" ? "强烈指向申报模型" : "与基线一致";
  if (metadata.verdict === "deviates") return metadata.directedModel ? `强烈指向 ${metadata.directedModel}` : "偏离申报模型基线";
  const complete = Number.isFinite(metadata.plannedSamples) && metadata.sampleCount >= metadata.plannedSamples;
  if (metadata.partialSamples || metadata.reasons?.includes("samples_incomplete")) return "采样未满额，暂不下结论";
  if (metadata.reasons?.includes("screen_preview")) return "筛查完成 · 需完整采样确认";
  if (metadata.reasons?.includes("uncalibrated")) {
    if (metadata.tier === "screen") {
      const candidate = metadata.candidateDistribution?.[0]?.model;
      return candidate ? `筛查完成 · 候选指向 ${candidate}（未校准）` : "筛查已完成 · 未设强指向判定线";
    }
    return "缺少判定线 · 仅展示观测";
  }
  if (metadata.reasons?.includes("no_threshold")) return `${complete ? "采样已完成" : "已有有效样本"} · 未超过强指向阈值`;
  if (metadata.reasons?.includes("multiple_thresholds")) return "最高候选并列 · 暂无唯一指向";
  if (complete) return "采样已完成 · 暂无明确模型指向";
  return "证据不足";
}

export function questionAssessment(summary) {
  if (!summary || summary.reviewed || !summary.compared) return summary?.reviewed ? "待人工复核" : "证据不足";
  const ratio = summary.ratio;
  if (ratio <= 0.2) return "单题表现偏低（不代表整体智力）";
  if (ratio >= 0.8) return "单题表现良好（仅代表本题）";
  return "单题表现一般（仅代表本题）";
}

export function summarizeVerification(runs = [], preferredMethod = "meow-fingerprint", options = {}) {
  const question = preferredMethod === "custom-question" ? (options.questionSummary && (!options.question || options.questionSummary.conditionsId === questionConditionsId(options.question)) ? options.questionSummary : summarizeQuestionRuns(runs, options)) : null;
  const latest = new Map();
  const measurements = new Map();
  for (const run of [...runs].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || (b.id || 0) - (a.id || 0))) {
    if (run.evaluator_version !== verificationVersions[run.evaluator_id]) continue;
    if (run.evaluator_id === "custom-question" && question && run.metadata?.conditionsId !== question.conditionsId) continue;
    if (!latest.has(run.evaluator_id)) latest.set(run.evaluator_id, run);
    if (run.status === "ok" && !measurements.has(run.evaluator_id)) measurements.set(run.evaluator_id, run);
  }
  const methods = [...latest.values()];
  const selected = latest.get(preferredMethod) || null;
  const selectedMethod = preferredMethod;
  const measurement = measurements.get(preferredMethod);
  const stale = Boolean(measurement && measurement !== selected);
  const usable = selected?.status === "ok";
  const bazaarlink = selectedMethod === "bazaarlink-probe" && measurement ? summarizeBazaarlink(measurement.metadata?.externalReport) : null;
  const verdict = usable ? bazaarlink?.verdict || selected.metadata?.verdict || "inconclusive" : "inconclusive";
  const label = question ? (question.reviewed
    ? `已记录 ${question.reviewed} 次待人工复核`
    : `${question.matched} / ${question.compared} 次答案匹配`) : verificationRunLabel(selected);
  const assessment = question ? questionAssessment(question) : null;
  const valid = (id, field) => {
    const run = measurements.get(id);
    return run?.status === "ok" && Number.isFinite(run.metadata?.[field]) ? run.metadata[field] : null;
  };
  const matchPercent = valid("hlwy-fingerprint", "value");
  const juice = valid("juice", "reportedJuice");
  const jsd = valid(["one-token", "astra-community", "meow-fingerprint"].includes(selectedMethod) ? selectedMethod : "probability-probe", "jsd");
  const declaredMatch = valid("meow-fingerprint", "declaredMatch");
  const directionScore = selectedMethod === "meow-fingerprint" ? declaredMatch : valid(selectedMethod, "directionScore");
  const directedModel = usable && selectedMethod !== "hlwy-fingerprint" ? selected.metadata?.directedModel || null : null;
  let numeric = null;
  if (measurement) {
    if (selectedMethod === "meow-fingerprint" && declaredMatch !== null)
      numeric = { value: declaredMatch, label: "候选模型匹配度", unit: "%", method: selectedMethod };
    else if (selectedMethod === "hlwy-fingerprint" && matchPercent !== null)
      numeric = { value: matchPercent, label: "HLWY 匹配度", unit: "%", method: selectedMethod };
    else if (["probability-probe", "one-token", "astra-community", "meow-fingerprint"].includes(selectedMethod) && jsd !== null)
      numeric = { value: jsd, label: "分布差异（JSD）", unit: "", method: selectedMethod };
    else if (selectedMethod === "juice" && juice !== null)
      numeric = { value: juice, label: "Juice 原始值", unit: "", method: "juice" };
    else if (bazaarlink?.declaredMatch !== null && bazaarlink?.declaredMatch !== undefined)
      numeric = { value: bazaarlink.declaredMatch, label: "候选模型匹配度", unit: "%", method: "bazaarlink-probe" };
  }
  if (question?.compared) numeric = { value: question.matched, label: "单题匹配次数", unit: "次", method: "custom-question" };
  return { question, verdict, label, assessment, methods, selected, measurement, measuredAt: measurement?.timestamp || null, stale,
    numeric, declaredMatch, matchPercent, jsd, juice, directionScore, directedModel };
}
