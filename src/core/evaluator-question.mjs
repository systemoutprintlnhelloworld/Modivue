import { questionConditionsId } from "./quality-summary.js";
import { registerEvaluator } from "./quality.mjs";
import { listQuestions, getSettings } from "./storage.mjs";
import { comparableAnswer } from "./answer-comparison.js";
export { comparableAnswer } from "./answer-comparison.js";

registerEvaluator({ id: "custom-question", label: "单问题测试", version: "1.0.0", conditionsId: "question:v1",
  async run(input) {
    const question = listQuestions().find(question => question.id === (input.questionId || getSettings().defaultQuestionId));
    if (!question) throw new TypeError("题目已删除，请重新选择");
    input.requireBudget?.(1);
    input.onProgress?.({ completed: 0, total: 1 });
    const conditionsId = questionConditionsId(question);
    const prompt = question.match === "exact" ? `${question.prompt}\n仅输出最终答案，不附加解释。` : question.prompt;
    const { questionTimeoutSeconds = 300, questionMaxOutputTokens = 16384 } = getSettings();
    const timeoutMs = questionTimeoutSeconds * 1000;
    const response = await input.request(prompt, { maxOutputTokens: questionMaxOutputTokens, timeoutMs, conditionsId });
    const actual = response.trim();
    if (!actual) throw new TypeError("模型返回空答案");
    const matched = question.match === "exact" ? comparableAnswer(actual, question.answer) : null;
    input.onProgress?.({ completed: 1, total: 1 });
    return { status: "ok", rationale: matched === null ? "答案已记录，证明待人工复核" : matched ? "答案匹配" : "答案不匹配",
      metadata: { verdict: "inconclusive", sampleCount: 1, question: { ...question }, actual, matched,
        conditionsId, prompt, maxOutputTokens: questionMaxOutputTokens, timeoutMs,
        comparison: question.match === "exact" ? "presentation-v2: NFKC, answer prefix, terminal punctuation, integer count suffix" : "manual review",
        conditionNotice: "单题结果不代表模型身份或整体能力；接口请求未开放工具。" } };
  }
});
