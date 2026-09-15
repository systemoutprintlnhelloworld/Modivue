// Read the provider's final verdict and its corresponding posterior. Probe
// pass rate is a separate measure; passing probes does not undo a replacement.
export function summarizeBazaarlink(report = {}) {
  const assessment = report.identityAssessment || {};
  const status = assessment.verdict?.status || assessment.status || "insufficient_data";
  const labels = {
    clean_match: "与申报一致", match: "与申报一致", clean_match_family_only: "仅家族一致",
    clean_match_submodel_mismatch: "已替换", submodel_mismatch: "已替换", model_swapped: "已替换",
    family_mismatch: "家族不符", spoofed: "自称被伪造", manipulated: "行为被诱导",
    insufficient_data: "证据不足", ambiguous: "结论不明确"
  };
  const source = assessment.v4;
  const accepted = source?.abstained === false;
  const candidates = accepted && Array.isArray(source.candidates) ? source.candidates : [];
  const normalizeModel = value => String(value || "").split("/").at(-1).toLowerCase().replace(/[._-]/g, "");
  const declared = candidates.find(item => normalizeModel(item.modelId) === normalizeModel(report.modelId));
  const percentage = value => Number.isFinite(value) && value >= 0 && value <= 1 ? value * 100 : null;
  const checks = (report.items || []).filter(item => typeof item.passed === "boolean" && !item.neutral);
  const passed = checks.filter(item => item.passed).length;
  const label = labels[status] || status;
  return { status, label, detectedModel: assessment.verdict?.trueModel || (accepted ? source.top?.displayName : null) || null,
    family: assessment.verdict?.trueFamily || assessment.predictedFamily || null,
    familyConfidence: percentage(assessment.confidence), candidateConfidence: accepted ? percentage(source.top?.score) : null,
    declaredMatch: percentage(declared?.score), candidates, passed, compared: checks.length,
    passRate: checks.length ? passed / checks.length * 100 : null,
    verdict: ["已替换", "家族不符", "自称被伪造", "行为被诱导"].includes(label) ? "deviates" : label === "与申报一致" ? "consistent" : "inconclusive" };
}
