import { registerEvaluator } from "./quality.mjs";

export const ztestVersion = "1.0.0";
export function ztestReportId(value) {
  const input = String(value || "").trim();
  const id = input.startsWith("https://") ? (() => {
    const url = new URL(input);
    if (url.origin !== "https://ztest.ai" || !/^\/reports?\/[^/]+\/?$/.test(url.pathname)) throw new TypeError("请填写 ztest.ai 检测报告链接");
    return url.pathname.split("/")[2];
  })() : input;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new TypeError("Ztest 报告 ID 无效");
  return id;
}

export function normalizeZtestReport(payload, target) {
  const report = payload?.data || payload;
  if (!report || typeof report !== "object" || !Array.isArray(report.probe_results) || !report.model?.code) throw new TypeError("不是有效的 Ztest 检测报告");
  if (report.status !== "completed") throw new TypeError("Ztest 报告尚未完成；请完成后再导入");
  if (!report.probe_results.length || report.probe_results.some(probe => !probe || typeof probe !== "object"
    || typeof probe.status !== "string" || (probe.score != null && !Number.isFinite(probe.score))
    || (probe.latency_ms != null && (!Number.isFinite(probe.latency_ms) || probe.latency_ms < 0)))) {
    throw new TypeError("Ztest 探针记录或数值无效");
  }
  const key = value => String(value || "").split("/").at(-1).toLowerCase().replaceAll(".", "-");
  if (![target.observedModel, target.canonicalModelId].some(value => key(value) === key(report.model.code))) throw new TypeError("报告模型与当前四元组不一致，请先选择对应模型");
  const reportId = ztestReportId(report.id);
  const json = JSON.stringify(report);
  if (/"(?:api_key|authorization|access_token)"\s*:/i.test(json)) throw new TypeError("报告包含凭据字段，请移除后再导入");
  return { evaluatorId: "ztest", evaluatorVersion: ztestVersion, status: "ok", score: null,
    rationale: "Ztest 第三方多探针检测已完成；报告由用户关联至当前四元组",
    metadata: { verdict: "inconclusive", source: `https://ztest.ai/report/${reportId}`, reportId,
      conditionsId: `ztest:${report.scoring_engine_version || "unspecified"}:${report.profile || "unspecified"}`,
      reasoningEffort: target.reasoningEffort || null, external: true, externalReport: report,
      sampleCount: report.probe_results.filter(probe => probe.status === "success").length,
      plannedSamples: report.probe_results.length, requests: [],
      conditionNotice: "检测在 Ztest 执行；探针数不是 API 请求数，费用以原始报告为准。端点可能被脱敏，四元组关联由用户确认。" } };
}

registerEvaluator({ id: "ztest", label: "Ztest 多探针检测", version: ztestVersion, conditionsId: "ztest:external", external: true,
  run: async () => { throw new TypeError("请在 Ztest 完成人机验证和检测，然后导入报告"); } });
