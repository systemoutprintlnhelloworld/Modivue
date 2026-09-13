const evaluators = new Map();

export function registerEvaluator(evaluator) {
  if (!evaluator?.id || !evaluator.version || !evaluator.conditionsId || typeof evaluator.run !== "function") throw new TypeError("评测器必须提供 id、version、conditionsId 和 run 函数");
  if (evaluators.has(evaluator.id)) throw new TypeError(`重复评测器: ${evaluator.id}`);
  evaluators.set(evaluator.id, evaluator);
}

export function listEvaluators() {
  return [...evaluators.values()].map(({ id, label, version, conditionsId, requirements, external }) => ({ id, label: label || id, version, conditionsId, requirements, external: Boolean(external) }));
}

export async function runEvaluator(id, input) {
  const evaluator = evaluators.get(id);
  if (!evaluator) throw new Error(`未注册评测器: ${id}`);
  const result = await evaluator.run(input);
  if (!result || !["consistent", "deviates", "inconclusive"].includes(result.metadata?.verdict)) throw new Error("核验方法必须返回明确的判定状态");
  return { evaluatorId: id, evaluatorVersion: evaluator.version, score: null, rationale: result.rationale || null,
    status: ["unsupported", "error", "paused"].includes(result.status) ? result.status : "ok",
    metadata: { conditionsId: evaluator.conditionsId, ...result.metadata } };
}
