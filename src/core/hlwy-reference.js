export const hlwyPrompt = "请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。";
export const defaultShortPrompt = "请从红、蓝、绿中选择一种颜色，只输出颜色名称。";

export function trustedHLWYReference(calibration, input) {
  const entry = Object.entries(calibration?.models || {}).find(([model]) => [input.observedModel, input.canonicalModelId].includes(model));
  if (!entry) return null;
  const [model, record] = entry;
  const cell = record.probability?.cells?.find(cell => cell.prompt === hlwyPrompt);
  if (!cell || record.probability.temperature !== 1 || record.maxOutputTokens !== 256
    || record.referenceSampleCount < 50 || !Number.isInteger(record.referenceSampleCount)
    || record.reasoningEffort !== (input.reasoningEffort || null) || record.protocol !== input.protocol || record.wireApi !== input.wireApi) return null;
  if (Object.keys(cell.distribution).some(answer => !/^\d+$/.test(answer) || Number(answer) < 1 || Number(answer) > 355)) return null;
  const distribution = Array.from({ length: 355 }, (_, index) => cell.distribution[String(index + 1)] || 0);
  return { model, distribution, stats: { mode: distribution.indexOf(Math.max(...distribution)) + 1 },
    timestamp: record.revision, iterations: record.referenceSampleCount, source: record.source,
    reasoningEffort: record.reasoningEffort, trusted: true };
}
