import { comparableAnswer } from "./answer-comparison.js";

export const verificationVersions = Object.freeze({ "probability-probe": "2.0.0", juice: "4.0.0", "hlwy-fingerprint": "1.1.0", "meow-fingerprint": "4.5.3-modivue.3", "custom-question": "1.0.0", ztest: "1.0.0" });

export function verificationRunLabel(run) {
  if (!run) return "待核验";
  if (run.status === "unsupported") {
    if (run.metadata?.reasonCode === "protocol_mismatch" || /协议|protocol|Responses/.test(run.rationale || "")) return "协议条件不匹配";
    if (run.metadata?.reasonCode === "baseline_missing" || /基准未覆盖|基准暂未覆盖/.test(run.rationale || "") || (run.metadata?.source && /Meow/.test(run.rationale || ""))) return "基准未覆盖";
    if (run.metadata?.reasonCode === "calibration_missing" || run.metadata?.calibrationNotice) return "校准不可用";
    if (/校准|基准|覆盖|凭据|配置/.test(run.rationale || "")) return "前置条件不足";
    return "方案不支持";
  }
  if (run.status === "paused") return "检测已暂停，等待下次继续";
  if (run.status !== "ok") return "核验请求失败";
  if (run.evaluator_id === "ztest") return "Ztest 第三方检测报告";
  if (run.evaluator_id === "custom-question") return run.metadata?.question?.match === "review" || run.metadata?.matched === null ? "待人工复核" : (run.metadata?.question ? comparableAnswer(run.metadata.actual, run.metadata.question.answer) : run.metadata?.matched) ? "答案匹配" : "答案不匹配";
  const metadata = run.metadata || {};
  if (run.evaluator_id === "juice" && metadata.mode === "raw") return Number.isFinite(metadata.reportedJuice) ? "原始观测 · 未校准" : "未返回有效数值";
  if (metadata.verdict === "consistent") return run.evaluator_id === "meow-fingerprint" ? "强烈指向申报模型" : "与基线一致";
  if (metadata.verdict === "deviates") return metadata.directedModel ? `强烈指向 ${metadata.directedModel}` : "偏离申报模型基线";
  const complete = Number.isFinite(metadata.plannedSamples) && metadata.sampleCount >= metadata.plannedSamples;
  if (metadata.partialSamples || metadata.reasons?.includes("samples_incomplete")) return "采样未满额，暂不下结论";
  if (metadata.reasons?.includes("uncalibrated")) return metadata.tier === "screen"
    ? "筛查已完成 · 未设强指向判定线" : "缺少判定线 · 仅展示观测";
  if (metadata.reasons?.includes("no_threshold")) return `${complete ? "采样已完成" : "已有有效样本"} · 未超过强指向阈值`;
  if (metadata.reasons?.includes("multiple_thresholds")) return "最高候选并列 · 暂无唯一指向";
  if (complete) return "采样已完成 · 暂无明确模型指向";
  return "证据不足";
}

export function summarizeVerification(runs = [], preferredMethod = "meow-fingerprint") {
  const latest = new Map();
  const measurements = new Map();
  for (const run of [...runs].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || (b.id || 0) - (a.id || 0))) {
    if (run.evaluator_version !== verificationVersions[run.evaluator_id]) continue;
    if (!latest.has(run.evaluator_id)) latest.set(run.evaluator_id, run);
    if (run.status === "ok" && !measurements.has(run.evaluator_id)) measurements.set(run.evaluator_id, run);
  }
  const methods = [...latest.values()];
  const selected = latest.get(preferredMethod) || null;
  const selectedMethod = preferredMethod;
  const measurement = measurements.get(preferredMethod);
  const stale = Boolean(measurement && measurement !== selected);
  const usable = selected?.status === "ok";
  const verdict = usable ? selected.metadata?.verdict || "inconclusive" : "inconclusive";
  const label = verificationRunLabel(selected);
  const valid = (id, field) => {
    const run = measurements.get(id);
    return run?.status === "ok" && Number.isFinite(run.metadata?.[field]) ? run.metadata[field] : null;
  };
  const matchPercent = valid("hlwy-fingerprint", "value");
  const juice = valid("juice", "reportedJuice");
  const jsd = valid("probability-probe", "jsd");
  const declaredMatch = valid("meow-fingerprint", "declaredMatch");
  const directionScore = selectedMethod === "meow-fingerprint" ? declaredMatch : valid(selectedMethod, "directionScore");
  const directedModel = usable ? selected.metadata?.directedModel || null : null;
  let numeric = null;
  if (measurement) {
    if (selectedMethod === "meow-fingerprint" && declaredMatch !== null)
      numeric = { value: declaredMatch, label: "申报模型匹配度", unit: "%", method: selectedMethod };
    else if (selectedMethod === "hlwy-fingerprint" && matchPercent !== null)
      numeric = { value: matchPercent, label: "HLWY 匹配度", unit: "%", method: selectedMethod };
    else if (selectedMethod === "probability-probe" && jsd !== null)
      numeric = { value: jsd, label: "分布 JSD", unit: "", method: selectedMethod };
    else if (selectedMethod === "juice" && juice !== null)
      numeric = { value: juice, label: "Juice 原始值", unit: "", method: "juice" };
  }
  return { verdict, label, methods, selected, measurement, measuredAt: measurement?.timestamp || null, stale,
    numeric, declaredMatch, matchPercent, jsd, juice, directionScore, directedModel };
}
