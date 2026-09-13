import { readCalibration, saveCalibration } from "./calibration.mjs";
import { runProbe } from "./probe.mjs";
import { credentialGroup, normalizeBaseUrl } from "./identity.mjs";
import { getSettings, probeUsageToday } from "./storage.mjs";
import { hlwyPrompt, defaultShortPrompt } from "./hlwy-reference.js";

let state = { status: "idle" };
let job = null;
let cancelled = false;
export const trustedCalibrationState = () => structuredClone(state);
export function cancelTrustedCalibration() { cancelled = true; return trustedCalibrationState(); }

// Collect the reference through the same serial, metered transport as target
// probes. The credential lives only in this job and is never part of its state.
export function collectTrustedCalibration(input) {
  if (job) throw new TypeError("可信端采样正在进行");
  const hlwy = input.purpose === "hlwy";
  if (hlwy) input = { ...input, prompt: hlwyPrompt, temperature: 1, maxOutputTokens: 256, repetitions: input.repetitions ?? 50 };
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash) throw new TypeError("API 地址不能包含凭据或查询参数");
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const prompt = typeof input.prompt === "string" && input.prompt.trim() ? input.prompt.trim() : defaultShortPrompt;
  const repetitions = input.preview === true ? 2 : Number(input.repetitions ?? 16);
  const maxOutputTokens = Number(input.maxOutputTokens ?? 128);
  const reasoningEffort = input.reasoningEffort || null;
  const temperature = input.temperature == null || input.temperature === "" ? null : Number(input.temperature);
  if (!model || model.length > 200 || !apiKey || !prompt || prompt.length > 2000) throw new TypeError("请填写模型、API Key 和不超过 2000 字的短答案提示词");
  if (!Number.isSafeInteger(repetitions) || input.preview !== true && (repetitions < 16 || repetitions > 100)) throw new TypeError("正式采样需要 16–100 次请求");
  if (hlwy && input.preview !== true && repetitions < 50) throw new TypeError("HLWY 可信分布需要 50–100 次请求；少量验证请用 2 次试采样");
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 8 || maxOutputTokens > 4096) throw new TypeError("输出上限需要为 8–4096 token");
  if (![null, "none", "minimal", "low", "medium", "high"].includes(reasoningEffort)) throw new TypeError("推理档位无效");
  if (temperature !== null && (!Number.isFinite(temperature) || temperature <= 0 || temperature > 2)) throw new TypeError("temperature 需要为 0–2 或留空");
  const transport = { chat: ["openai", "chat", "authorization"], responses: ["openai", "responses", "authorization"], messages: ["anthropic", "messages", "x-api-key"] }[input.wireApi || "chat"];
  if (!transport) throw new TypeError("请选择受支持的 API 协议");
  if (probeUsageToday().requests + repetitions > getSettings().probeDailyLimit) throw new TypeError("今日剩余请求额度不足");
  const [protocol, wireApi, authHeader] = transport;
  const target = { baseUrl, apiKey, protocol, wireApi, authHeader, observedModel: model, reasoningEffort, keyGroup: credentialGroup(apiKey) };
  const revision = `trusted-${Date.now()}`;
  cancelled = false;
  state = { status: "running", model, baseUrl, wireApi, reasoningEffort, temperature, maxOutputTokens,
    preview: input.preview === true, prompt, completed: 0, total: repetitions, counts: {}, requests: [], startedAt: new Date().toISOString() };
  const counts = Object.create(null);
  job = (async () => {
    try {
      for (let index = 0; index < repetitions; index++) {
        let answer = "";
        const sample = await runProbe(target, { instruction: prompt, maxOutputTokens, temperature,
          conditionsId: revision, checkContinue: () => { if (cancelled) throw new Error("已停止可信端采样"); },
          onText: chunk => { if (answer.length < 16000) answer += chunk; } });
        state.requests.push({ status: sample.status, inputTokens: sample.inputTokens, outputTokens: sample.outputTokens,
          durationMs: sample.durationMs, costUsd: sample.costUsd, costStatus: sample.costStatus });
        if (sample.status !== "ok") throw new Error(sample.error || "可信端请求失败");
        answer = answer.trim();
        if (!answer || answer.length > 1000) throw new Error("响应为空或超过 1000 字，请调整短答案提示词或输出上限");
        if (hlwy && (!/^\d+$/.test(answer) || Number(answer) < 1 || Number(answer) > 355)) throw new Error("HLWY 参考响应必须是 1-355 的整数；未覆盖已有基准");
        counts[answer] = (counts[answer] || 0) + 1;
        state.completed++;
        state.counts = { ...counts };
      }
      if (cancelled) throw new Error("已停止可信端采样");
      if (!state.preview) {
        const current = await readCalibration();
        const record = { revision, reasoningEffort, maxOutputTokens, source: baseUrl, wireApi, protocol,
          collectedAt: new Date().toISOString(), referenceSampleCount: repetitions,
          probability: { repetitions, temperature, maxJsd: null, cells: [{ prompt,
            distribution: Object.fromEntries(Object.entries(counts).map(([answer, count]) => [answer, count / repetitions])) }] } };
        await saveCalibration({ version: 2, source: current?.source || baseUrl,
          models: { ...current?.models, [model]: record }, candidates: current?.candidates });
      }
      state.status = "complete";
      state.message = state.preview ? "2 次试采样完成；未生成身份判断或覆盖校准档案" : hlwy ? "HLWY 可信分布已保存" : "可信分布已保存；选择分布指纹即可按相同条件对照目标渠道";
    } catch (error) {
      state.status = cancelled ? "cancelled" : "error";
      state.message = String(error.message).replaceAll(apiKey, "[redacted]");
    } finally { state.finishedAt = new Date().toISOString(); job = null; }
  })();
  return trustedCalibrationState();
}
