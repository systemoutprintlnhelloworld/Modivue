import { registerEvaluator } from "./quality.mjs";

export const ztestVersion = "1.0.0";
export const ztestLocalVersion = "1.0.0";
// Publicly reproducible local compatibility probes.  Ztest's server-side
// probe prompts and scoring thresholds are not published, so this adapter
// deliberately records raw answers and latency evidence without pretending
// to reproduce the official ranking.
export const ztestLocalProbes = Object.freeze([
  { id: "identity", label: "身份一致性", prompt: "只回答你的模型名称，不要解释。" },
  { id: "instruction", label: "指令遵循", prompt: "只输出三个词：红、绿、蓝。不要添加标点或解释。" },
  { id: "structure", label: "响应结构", prompt: "请严格输出 JSON：{\"ok\":true}，不要 Markdown。" },
  { id: "knowledge", label: "知识能力", prompt: "回答：水的化学式是什么？只输出化学式。" },
  { id: "stability", label: "稳定性", prompt: "只回答数字 4，不要解释。" }
]);
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

registerEvaluator({ id: "ztest", label: "Ztest 官方检测", version: ztestVersion, conditionsId: "ztest:official", external: true,
  async run() {
    return { status: "unsupported", rationale: "请从 Ztest 官方检测面板启动浏览器流程", metadata: { verdict: "inconclusive" } };
  } });

registerEvaluator({ id: "ztest-local", label: "Ztest 本地多探针检测", version: ztestLocalVersion, conditionsId: "ztest:local:v1", external: false,
  async run(input) {
    const previous = input.previousRun;
    const canResume = previous?.status === "paused" && previous.evaluator_version === ztestLocalVersion
      && previous.metadata?.conditionsId === "ztest:local:v1" && previous.metadata?.wireApi === input.wireApi;
    const observations = ztestLocalProbes.map(probe => ({ id: probe.id, label: probe.label, status: "pending", response: "", attempts: 0,
      ...(canResume ? previous.metadata.observations?.find(row => row.id === probe.id) : {}) }));
    const failures = canResume ? [...(previous.metadata.failures || [])] : [];
    let attempts = canResume ? previous.metadata.evaluatorAttempts || previous.metadata.requestAttempts || 0 : 0;
    let stopReason = null, stopCode = null;
    const completed = () => observations.filter(row => row.status === "success").length;
    const progress = () => input.onProgress?.({ completed: completed(), total: ztestLocalProbes.length, requestAttempts: attempts });
    progress();
    try {
      input.requireBudget?.(ztestLocalProbes.length - completed());
      sampling: for (const observation of observations) {
        if (observation.status === "success") continue;
        const probe = ztestLocalProbes.find(row => row.id === observation.id);
        for (let retry = 0; retry < 3; retry++) {
          input.requireBudget?.(1);
          attempts++; observation.attempts++;
          try {
            const actual = String(await input.request(probe.prompt, { maxOutputTokens: 128, conditionsId: `ztest:local:v1:${probe.id}` })).trim();
            if (!actual) throw new Error("空响应");
            Object.assign(observation, { status: "success", response: actual });
            break;
          } catch (error) {
            if (["monitoring_paused", "target_inactive", "budget_exhausted"].includes(error.code)) throw error;
            failures.push({ attempt: attempts, cellId: probe.id, label: probe.label, error: error.message });
            observation.status = "error";
            if (error.code === "authentication_failed" || error.retryable === false) throw error;
            if (retry === 2) {
              stopReason = "本轮重试次数已用完；已保留成功探针，下次核验继续未完成项";
              break sampling;
            }
            await input.wait?.(Math.max(error.retryAfterMs || 0, 1000 * 2 ** retry));
          }
        }
        progress();
      }
    } catch (error) {
      stopReason = error.message;
      stopCode = error.code || "request_failed";
    }
    const valid = completed();
    progress();
    return { evaluatorId: "ztest-local", evaluatorVersion: ztestLocalVersion,
      status: stopCode === "authentication_failed" || stopCode === "request_failed" ? "error" : stopReason ? "paused" : "ok", score: null,
      rationale: stopReason || "本地 Ztest 兼容探针已完成；仅保存响应证据，不等同于 ztest.ai 官方排名或身份认证",
      metadata: { verdict: "inconclusive", observations, failures, sampleCount: valid, plannedSamples: ztestLocalProbes.length,
        conditionsId: "ztest:local:v1", external: false, evaluatorAttempts: attempts, wireApi: input.wireApi,
        continuedFrom: canResume ? previous.id : null, stopReason,
        conditionNotice: "这是 Modivue 本地 Ztest 兼容探针，仅保存可重复的响应证据，不等同于 ztest.ai 官方排名或身份认证。" } };
  } });
