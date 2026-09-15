import { registerEvaluator } from "./quality.mjs";
import { getSettings } from "./storage.mjs";
import { readCalibration } from "./calibration.mjs";
import { calibrationReference } from "./calibration-reference.js";
import { normalizeMeowAnswer } from "./evaluator-meow.mjs";
import { distributionJsd } from "./evaluator-one-token.mjs";

// The post publishes task families, not exact prompts or its numerical baseline.
// Keep this explicit Modivue battery separate from any imported author baseline.
export const astraPrompts = [
  "Name a random animal. Reply with only the animal name.",
  "Name a random bird. Reply with only the bird name.",
  "What is the orbital period of Nereid around Neptune, in days? Reply with only the number.",
  "Name a random country. Reply with only the country name.",
  "What is the orbital period of Iapetus around Saturn, in days? Reply with only the number."
];
registerEvaluator({ id: "astra-community", label: "Astra 社区五组观测", version: "1.0.0", conditionsId: "astra-community:adapted:v1",
  async run(input) {
    const requestedEffort = input.reasoningEffort || null;
    const repetitions = getSettings().astraSamples;
    const archive = await readCalibration();
    const reference = calibrationReference(archive, { ...input, reasoningEffort: requestedEffort }, "astra-community:adapted:v1");
    const compatible = reference?.probability?.method === "astra-community:adapted:v1" && reference.probability.temperature === 1
      && reference.maxOutputTokens === 128 && !reference.probability.system;
    input.requireBudget?.(5 * repetitions);
    const observations = astraPrompts.map((prompt, i) => ({ id: `astra-${i}`, prompt, counts: Object.create(null), responses: [], planned: repetitions, sampleCount: 0, group: i < 3 ? "primary" : "auxiliary" }));
    const failures = [];
    let attempts = 0;
    sampling: for (let repetition = 0; repetition < repetitions; repetition++) for (const row of observations) {
      attempts++;
      try {
        const raw = await input.request(row.prompt, { temperature: 1, maxOutputTokens: 128, reasoningEffort: requestedEffort, conditionsId: "astra-community:adapted:v1" });
        const answer = normalizeMeowAnswer(raw);
        row.responses.push(raw);
        if (answer) { row.counts[answer] = (row.counts[answer] || 0) + 1; row.sampleCount++; }
      } catch (error) {
        failures.push({ cellId: row.id, attempt: attempts, error: error.message });
        if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) break sampling;
      }
      input.onProgress?.({ completed: attempts, total: 5 * repetitions });
    }
    for (const row of observations) {
      const cell = compatible && reference.probability.cells.find(cell => cell.prompt === row.prompt && cell.sampleCount >= 10);
      row.reference = cell?.distribution || null;
      row.jsd = cell && row.sampleCount >= 10 ? distributionJsd(Object.fromEntries(Object.entries(row.counts).map(([answer, count]) => [answer, count / row.sampleCount])), cell.distribution) : null;
    }
    const jsd = observations.every(row => row.jsd !== null) ? observations.reduce((sum, row) => sum + row.jsd, 0) / observations.length : null;
    return { status: failures.length ? "error" : "ok", rationale: jsd === null ? "五组分布已记录；原帖强指向基准未导入" : `JSD ${jsd.toFixed(4)}`,
      metadata: { verdict: "inconclusive", source: "https://linux.do/t/topic/2861517", revision: "modivue-adapted-v1", observations, failures, attempts,
        jsd, reasoningEffort: requestedEffort, sampling: { system: "", temperature: 1, maxOutputTokens: 128, reasoningEffort: requestedEffort },
        sampleCount: observations.reduce((sum, row) => sum + row.sampleCount, 0), plannedSamples: 5 * repetitions,
        conditionNotice: "按原帖五类任务实现的观测适配：前三类为主组，后两类为辅助组，周期单位固定为天。默认每类 1 次，可改为原帖的每类 10 次。原帖没有公开精确提示词与参考分布；这里使用明确标注的适配提示词，不输出原帖的模型强指向结论。" } };
  }
});
