import { questionConditionsId } from "./quality-summary.js";
import { registerEvaluator } from "./quality.mjs";
import { listQuestions, getSettings } from "./storage.mjs";
import { comparableAnswer } from "./answer-comparison.js";
export { comparableAnswer } from "./answer-comparison.js";

export function parseStructuredProof(text, expected) {
  const value = String(text || "");
  const answerLine = value.match(/(?:最终答案|答案|结论|因此|所以|x)\s*(?:是|为|等于|[:：=])?\s*([+-]?\d+(?:\.\d+)?)/i);
  const parsedAnswer = answerLine?.[1] || null;
  return { parsedAnswer, answerMatched: parsedAnswer === null ? null : comparableAnswer(parsedAnswer, expected),
    proof: value.replace(answerLine?.[0] || "", "").trim() };
}

registerEvaluator({ id: "custom-question", label: "单问题测试", version: "1.0.0", conditionsId: "question:v1",
  async run(input) {
    const question = listQuestions().find(question => question.id === (input.questionId || getSettings().defaultQuestionId));
    if (!question) throw new TypeError("题目已删除，请重新选择");
    input.requireBudget?.(1);
    input.onProgress?.({ completed: 0, total: 1 });
    const conditionsId = questionConditionsId(question);
    const prompt = question.match === "exact" ? `${question.prompt}\n仅输出最终答案，不附加解释。` : `${question.prompt}\n请严格按以下格式回答：\n最终答案：<数字或结论>\n理由/证明：<完整理由或严格证明>`;
    const { questionTimeoutSeconds = 300, questionMaxOutputTokens = 16384 } = getSettings();
    // 0 is an explicit no-timeout choice for proof questions. Transport and
    // user cancellation still abort the request.
    // The water-cups proof is intentionally uncapped: a short timeout can
    // truncate the required strict proof and produce a misleading result.
    // Other custom questions continue to honour the user setting.
    const timeoutMs = question.id === "water-cups-8" ? null : Number(questionTimeoutSeconds) > 0 ? Number(questionTimeoutSeconds) * 1000 : null;
    const failures = [];
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) input.requireBudget?.(1);
        response = await input.request(prompt, { maxOutputTokens: questionMaxOutputTokens, timeoutMs, conditionsId });
        break;
      } catch (error) {
        const paused = ["target_inactive", "monitoring_paused", "budget_exhausted"].includes(error.code);
        if (!paused) failures.push({ attempt, error: error.message, upstreamError: error.upstreamError || null, partialText: error.partialText || "" });
        if (!paused && error.retryable && attempt < 3) {
          await input.wait?.(Math.max(error.retryAfterMs || 0, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        return { status: paused ? "paused" : "error", rationale: error.message,
          metadata: { verdict: "inconclusive", question: { ...question }, conditionsId, prompt,
            maxOutputTokens: questionMaxOutputTokens, timeoutMs, actual: error.partialText || "",
            partialAnswer: Boolean(error.partialText), matched: null, sampleCount: 0, plannedSamples: 1,
            attempts: attempt, failures, stopReason: error.message } };
      }
    }
    const actual = response.trim();
    if (!actual) throw new TypeError("模型返回空答案");
    const structured = question.match === "exact" ? null : parseStructuredProof(actual, question.answer);
    const answerMatched = question.match === "exact" ? comparableAnswer(actual, question.answer) : structured.answerMatched;
    const matched = question.match === "exact" ? answerMatched : null;
    input.onProgress?.({ completed: 1, total: 1 });
    return { status: "ok", rationale: matched === null ? "答案已记录，证明待人工复核" : matched ? "答案匹配" : "答案不匹配",
      metadata: { verdict: "inconclusive", sampleCount: 1, plannedSamples: 1, attempts: failures.length + 1, failures,
        question: { ...question }, actual, matched, answerMatched, parsedAnswer: structured?.parsedAnswer || null,
        proof: structured?.proof || null,
        conditionsId, prompt, maxOutputTokens: questionMaxOutputTokens, timeoutMs,
        comparison: question.match === "exact" ? "presentation-v2: NFKC, answer prefix, terminal punctuation, integer count suffix" : "manual review",
        conditionNotice: "单题结果不代表模型身份或整体能力；接口请求未开放工具。" } };
  }
});
