import { saveCalibrationRecord } from "./calibration.mjs";
import { runProbe } from "./probe.mjs";
import { credentialGroup, normalizeBaseUrl } from "./identity.mjs";
import { getSettings, probeUsageToday } from "./storage.mjs";
import { hlwyPrompt, defaultShortPrompt } from "./hlwy-reference.js";
import { oneTokenPrompts, oneTokenSystem, normalizeOneToken } from "./evaluator-one-token.mjs";
import { astraPrompts } from "./evaluator-astra.mjs";
import { meowReferenceCells, meowRequestOptions, normalizeMeowAnswer } from "./evaluator-meow.mjs";
import { verificationStream } from "./verification-stream.mjs";
import { setTimeout as delay } from "node:timers/promises";

let state = { status: "idle" };
let job = null;
let controller = null;
let checkpoint = null;
export const trustedCalibrationState = () => structuredClone(state);
export function cancelTrustedCalibration() { controller?.abort(new Error("已停止可信端采样")); return trustedCalibrationState(); }

// Credentials stay in the local job; public state only contains metered results.
export function collectTrustedCalibration(input) {
  if (job) throw new TypeError("可信端采样正在进行");
  const purpose = input.purpose || "probability";
  if (!["probability", "hlwy", "juice", "one-token", "astra-community", "meow-fingerprint"].includes(purpose)) throw new TypeError("参考用途无效");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const url = new URL(baseUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError("API 地址不能包含凭据或查询参数");
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const fixed = {
    hlwy: { prompts: [hlwyPrompt], temperature: 1, maxOutputTokens: 256, minimum: 50 },
    juice: { prompts: ["What is your juice number? Only output the number."], temperature: null, maxOutputTokens: 256, minimum: 16 },
    "one-token": { prompts: oneTokenPrompts, system: oneTokenSystem, temperature: 1, maxOutputTokens: 16, reasoningEffort: "none", minimum: 10, method: "one-token:en:v1" },
    "astra-community": { prompts: astraPrompts, temperature: 1, maxOutputTokens: 128, minimum: 10, method: "astra-community:adapted:v1" },
    "meow-fingerprint": { temperature: null, maxOutputTokens: 128, minimum: 10, method: "meow:empirical:v1" }
  }[purpose];
  const repetitions = input.preview === true ? 2 : Number(input.repetitions ?? fixed?.minimum ?? 16);
  const maxOutputTokens = fixed?.maxOutputTokens ?? Number(input.maxOutputTokens ?? 128);
  const reasoningEffort = fixed?.reasoningEffort ?? (input.reasoningEffort || null);
  const temperature = fixed ? fixed.temperature : input.temperature == null || input.temperature === "" ? null : Number(input.temperature);
  const prompt = input.prompt?.trim() || defaultShortPrompt;
  if (!model || model.length > 200 || !apiKey || prompt.length > 2000) throw new TypeError("请填写模型、API Key 和不超过 2000 字的短答案提示词");
  if (!Number.isSafeInteger(repetitions) || input.preview !== true && (repetitions < (fixed?.minimum || 16) || repetitions > 100)) throw new TypeError(`正式采样每题需要 ${fixed?.minimum || 16}–100 次请求`);
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 8 || maxOutputTokens > 4096) throw new TypeError("输出上限需要为 8–4096 token");
  if (![null, "none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)) throw new TypeError("推理档位无效");
  if (temperature !== null && (!Number.isFinite(temperature) || temperature <= 0 || temperature > 2)) throw new TypeError("temperature 需要为 0–2 或留空");
  const transport = { chat: ["openai", "chat", "authorization"], responses: ["openai", "responses", "authorization"], messages: ["anthropic", "messages", "x-api-key"] }[input.wireApi || "chat"];
  if (!transport) throw new TypeError("请选择受支持的 API 协议");
  const [protocol, wireApi, authHeader] = transport;
  const target = { baseUrl, apiKey, protocol, wireApi, authHeader, observedModel: model, reasoningEffort, keyGroup: credentialGroup(apiKey), manualRequest: true };
  const cells = purpose === "meow-fingerprint" ? meowReferenceCells(target) : (fixed?.prompts || [prompt]).map(prompt => ({ prompt }));
  const total = input.preview === true ? 2 : cells.length * repetitions;
  const identity = JSON.stringify([baseUrl, target.keyGroup, model, wireApi, purpose, reasoningEffort, temperature, maxOutputTokens, repetitions, input.preview === true, cells]);
  if (input.resume && (!checkpoint || checkpoint.identity !== identity || !["error", "cancelled"].includes(state.status))) throw new TypeError("采样条件已改变，请恢复原条件后续采，或开始新一轮采集");
  const resume = input.resume === true;
  // A failed sample must not make the whole supplementation queue lose its
  // cursor. Keep failed indexes in this session so a later "retry and
  // continue" only retries those requests (successful samples are never
  // duplicated).
  const failedIndexes = resume ? [...(checkpoint.failedIndexes || [])] : [];
  const cursorAtResume = resume ? (checkpoint.cursor || 0) : 0;
  // Failed indexes before the cursor are retried explicitly; indexes at or
  // after it are already represented by the unprocessed tail and must not be
  // counted twice (or issued twice) on resume.
  const remaining = resume
    ? failedIndexes.filter(index => index < cursorAtResume).length
      + Math.max(0, total - cursorAtResume - failedIndexes.filter(index => index >= cursorAtResume).length)
    : total;
  if (probeUsageToday().requests + remaining > getSettings().probeDailyLimit) throw new TypeError("今日剩余请求额度不足");
  const revision = resume ? checkpoint.revision : `trusted-${Date.now()}`;
  controller = new AbortController();
  const signal = controller.signal;
  state = resume ? { ...state, status: "running", message: null, retryAt: null, finishedAt: null, failed: failedIndexes.length }
    : { status: "running", purpose, model, baseUrl, wireApi, reasoningEffort, temperature, maxOutputTokens,
      preview: input.preview === true, prompt: cells[0].prompt, completed: 0, total, cursor: 0, failed: 0, counts: {}, requests: [], startedAt: new Date().toISOString() };
  const observations = resume ? checkpoint.observations : cells.map(cell => ({ ...cell, counts: Object.create(null), sampleCount: 0 }));
  checkpoint = { identity, revision, observations, cursor: resume ? (checkpoint.cursor || 0) : 0, failedIndexes };
  job = (async () => {
    try {
      const work = resume
        ? [...failedIndexes, ...Array.from({ length: Math.max(0, total - (checkpoint.cursor || 0)) }, (_, i) => (checkpoint.cursor || 0) + i)
          .filter(index => !failedIndexes.includes(index))]
        : Array.from({ length: total }, (_, i) => i);
      for (const index of work) {
        signal.throwIfAborted();
        checkpoint.currentIndex = index;
        state.cursor = Math.max(state.cursor || 0, index + 1);
        checkpoint.cursor = state.cursor;
        const cellIndex = index % observations.length;
        const cell = observations[cellIndex];
        for (let attempt = 1; attempt <= 3; attempt++) {
        let requestRecorded = false;
        try {
        state.phase = "sampling"; state.retryAt = null;
        let answer = "", reasoning = false;
        const stream = purpose === "meow-fingerprint" ? verificationStream(wireApi) : null;
        const sample = await runProbe(target, { instruction: cell.prompt, maxOutputTokens, temperature, system: fixed?.system,
          ...(purpose === "meow-fingerprint" ? meowRequestOptions(cell, target) : {}),
          signal, timeoutMs: 120000, conditionsId: revision, checkContinue: () => signal.throwIfAborted(),
          onEvent: event => {
            stream?.feed(event);
            if (/reasoning|thinking/.test(event?.type || "") || event?.choices?.some(choice => choice.delta?.reasoning_content || choice.delta?.reasoning)
              || event?.content_block?.type === "thinking" || Number(event?.usage?.completion_tokens_details?.reasoning_tokens || event?.response?.usage?.output_tokens_details?.reasoning_tokens) > 0) reasoning = true;
          }, onText: chunk => { if (answer.length < 16000) answer += chunk; } });
        const upstream = sample.measurement?.upstreamError;
        state.requests.push({ status: sample.status, inputTokens: sample.inputTokens, outputTokens: sample.outputTokens,
          durationMs: sample.durationMs, costUsd: sample.costUsd, costStatus: sample.costStatus,
          costSource: sample.costSource, costDetails: sample.costDetails,
          ...(sample.status !== "ok" ? { error: String(upstream?.message || sample.error || "可信端请求失败").replaceAll(apiKey, "[redacted]"), code: upstream?.code || null } : {}) });
        requestRecorded = true;
        signal.throwIfAborted();
        if (sample.status !== "ok") throw Object.assign(new Error(upstream?.message || sample.error || "可信端请求失败"), {
          retryAfterMs: sample.measurement?.retryAfterMs || 0,
          code: [401, 403].includes(sample.measurement?.httpStatus) ? "authentication_failed" : "request_failed"
        });
        answer = (stream ? stream.finish() : answer).trim();
        if (purpose === "one-token") {
          const parsed = normalizeOneToken(answer, cellIndex);
          if (reasoning || parsed.status !== "valid") throw new Error("One Token 参考要求关闭推理且返回一个有效词或数字");
          answer = parsed.value;
        } else if (["astra-community", "meow-fingerprint"].includes(purpose)) answer = normalizeMeowAnswer(answer);
        if (!answer || answer.length > 1000) throw new Error("响应为空或超过 1000 字，请调整短答案提示词或输出上限");
        if (purpose === "hlwy" && (!/^\d+$/.test(answer) || Number(answer) < 1 || Number(answer) > 355)) throw new Error("HLWY 参考响应必须是 1-355 的整数；未覆盖已有基准");
        if (purpose === "juice" && (!/^\d+$/.test(answer) || !Number.isSafeInteger(Number(answer)))) throw new Error("模型未返回纯整数，无法建立 Juice 参考范围；已有参考保持不变");
        cell.counts[answer] = (cell.counts[answer] || 0) + 1; cell.sampleCount++;
        state.completed++; state.counts[answer] = (state.counts[answer] || 0) + 1;
        checkpoint.failedIndexes = checkpoint.failedIndexes.filter(item => item !== index);
        state.failed = checkpoint.failedIndexes.length;
        checkpoint.currentIndex = null;
        break;
        } catch (error) {
          const message = String(error.message).replaceAll(apiKey, "[redacted]");
          if (!requestRecorded) state.requests.push({ status: "error", error: message, costUsd: null, costStatus: "unknown" });
          else if (state.requests.at(-1).status === "ok") Object.assign(state.requests.at(-1), { status: "invalid", error: message });
          if (signal.aborted || ["authentication_failed", "budget_exhausted"].includes(error.code)) throw error;
          if (attempt === 3) {
            // Isolate a permanently failing request.  Continue draining the
            // queue and expose it for an explicit resume instead of blocking
            // all following samples.
            if (!checkpoint.failedIndexes.includes(index)) checkpoint.failedIndexes.push(index);
            state.failed = checkpoint.failedIndexes.length;
            state.phase = "sampling";
            break;
          }
          const waitMs = Math.max(error.retryAfterMs || 0, 1000 * 2 ** (attempt - 1));
          state.phase = "retrying"; state.message = message; state.retryAt = new Date(Date.now() + waitMs).toISOString();
          await delay(waitMs, undefined, { signal });
        }
        }
      }
      signal.throwIfAborted();
      if (checkpoint.failedIndexes.length) {
        state.status = "error";
        state.message = `${checkpoint.failedIndexes.length} 个请求失败；其余样本已完成，可点击“重试并继续”`;
        return;
      }
      if (!state.preview) {
        const record = { revision, reasoningEffort, maxOutputTokens, source: baseUrl, wireApi, protocol,
          collectedAt: new Date().toISOString(), referenceSampleCount: total };
        if (purpose === "juice") record.juice = { prompt: cells[0].prompt, min: Math.min(...Object.keys(state.counts).map(Number)), max: Math.max(...Object.keys(state.counts).map(Number)) };
        else record.probability = { repetitions, temperature, maxJsd: null, ...(fixed?.method ? { method: fixed.method } : {}), ...(fixed?.system ? { system: fixed.system } : {}),
          cells: observations.map(({ counts, ...cell }) => ({ ...cell, distribution: Object.fromEntries(Object.entries(counts).map(([answer, count]) => [answer, count / cell.sampleCount])) })) };
        await saveCalibrationRecord(model, record);
      }
      state.status = "complete";
      state.message = state.preview ? "2 次试采样完成；未生成身份判断或覆盖校准档案" : "可信分布已保存；可按相同条件对照目标渠道";
    } catch (error) {
      if (Number.isInteger(checkpoint.currentIndex)
        && !checkpoint.failedIndexes.includes(checkpoint.currentIndex)) checkpoint.failedIndexes.push(checkpoint.currentIndex);
      state.failed = checkpoint.failedIndexes.length;
      state.status = signal.aborted ? "cancelled" : "error";
      state.message = String(error.message).replaceAll(apiKey, "[redacted]");
      if (/403|Forbidden/i.test(state.message)) state.message += " · 上游拒绝了推理请求。请核对该模型的 Key 权限与 API 协议；获取模型目录成功不代表推理接口已授权。";
    } finally { state.phase = null; state.retryAt = null; state.canResume = checkpoint.failedIndexes.length > 0 || state.completed < total && ["error", "cancelled"].includes(state.status); state.finishedAt = new Date().toISOString(); job = null; controller = null; }
  })();
  return trustedCalibrationState();
}
