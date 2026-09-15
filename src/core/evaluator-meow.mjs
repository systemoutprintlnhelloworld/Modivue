import { registerEvaluator } from "./quality.mjs";
import { verificationVersions, verificationRunLabel } from "./quality-summary.js";
import gptBaseline from "../data/meow-gpt.json" with { type: "json" };
import claudeBaseline from "../data/meow-claude.json" with { type: "json" };
import gptChatBaseline from "../data/meow-gpt-chat.json" with { type: "json" };
import claudeChatBaseline from "../data/meow-claude-chat.json" with { type: "json" };
import oldGptBaseline from "../data/meow-gpt-predictive2.json" with { type: "json" };
import oldClaudeBaseline from "../data/meow-claude-predictive2.json" with { type: "json" };
import casefold from "../data/meow-casefold.json" with { type: "json" };
import openrouterBaseline from "../data/meow-openrouter-baseline.json" with { type: "json" };
import { calibrationReference, calibrationWire } from "./calibration-reference.js";
import { readCalibration } from "./calibration.mjs";

export const meowVersion = verificationVersions["meow-fingerprint"];
const source = "https://github.com/chen-006/meow-llm-detector/tree/bdb579f0496b70138f7c015344eb034a9f4c16e7";
const engine = "meow-fingerprint-v3-predictive";
const unseen = "__UNSEEN_IN_TRAINING__";
const other = "other_known_external";
const modelKey = (value) => String(value || "").split("/").at(-1).toLowerCase().replaceAll(".", "-");
export const normalizeMeowAnswer = (value) => [...value.trim()].map((character) => casefold[character] ?? character.toLowerCase()).join("");

// Integer-count recurrence equals lgamma(a+n)-lgamma(a), without a numeric dependency.
function logIncrement(alpha, count) {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += Math.log(alpha + i);
  return sum;
}

// Port of upstream predictive.py using its frozen fitted parameters; see MEOW-NOTICE.txt.
export function scoreMeow(baseline, observations, tierName, claimedModel) {
  const fitted = baseline.fitted;
  const tier = tierName === "screen"
    // Screen mode still needs a visible decision line in the UI. Reuse the
    // conservative low-tier calibration thresholds while clearly labelling
    // the result as a low-sample preview in the report.
    ? { counts: Object.fromEntries(baseline.probes.map((probe) => [probe.id, 1])), thresholds: baseline.tiers.low?.thresholds || {} }
    : baseline.tiers[tierName];
  const evidence = Object.fromEntries(fitted.sources.map((name) => [name, 0]));
  const reasons = new Set();
  if (tierName === "screen") reasons.add("screen_preview");
  let total = 0;
  let planned = 0;
  const cells = {};
  for (const [id, requested] of Object.entries(tier.counts)) {
    planned += requested;
    const cell = fitted.cells[id];
    if (!cell?.reference_ready) { reasons.add("baseline_cell_missing"); continue; }
    const counts = Array(cell.categories.length).fill(0);
    const observed = observations.find((row) => row.id === id);
    for (const [answer, count] of Object.entries(observed?.counts || {})) {
      const position = cell.categories.indexOf(answer);
      counts[position < 0 ? cell.categories.indexOf(unseen) : position] += count;
    }
    const valid = counts.reduce((sum, count) => sum + count, 0);
    const minimum = Math.ceil(baseline.engine.completion_ratio * requested);
    if (valid < minimum) reasons.add("samples_incomplete");
    if (valid > requested) reasons.add("samples_exceed_plan");
    cells[id] = { planned: requested, minimum, valid, counts: observed?.counts || {} };
    total += valid;
    for (const name of fitted.sources) {
      const alpha = cell.alpha[name];
      evidence[name] -= logIncrement(alpha.reduce((sum, a) => sum + a, 0), valid);
      evidence[name] += counts.reduce((sum, count, i) => sum + logIncrement(alpha[i], count), 0);
    }
  }
  if (!total) reasons.add("no_valid_samples");
  if (total < Math.ceil(planned * baseline.engine.completion_ratio)) reasons.add("samples_incomplete");
  if (!fitted.models.includes(claimedModel)) reasons.add("unknown_claimed_model");
  const referenceSource = fitted.reference_sources.reduce((best, name) => evidence[name] > evidence[best] ? name : best, fitted.reference_sources[0]);
  for (const [id, result] of Object.entries(cells)) {
    const cell = fitted.cells[id];
    result.featureHits = {};
    for (const candidate of fitted.models) {
      const alpha = cell.alpha[candidate === other ? referenceSource : candidate];
      const maximum = Math.max(...alpha);
      // Tied modal categories are equally valid features. Shared features may
      // legitimately produce equal counts; the predictive score uses all counts.
      result.featureHits[candidate] = Object.entries(result.counts).reduce((sum, [answer, count]) => {
        const category = cell.categories.includes(answer) ? answer : unseen;
        return sum + (alpha[cell.categories.indexOf(category)] === maximum ? Number(count) : 0);
      }, 0);
    }
    const alpha = cell.alpha[claimedModel];
    const alphaTotal = alpha?.reduce((sum, value) => sum + value, 0);
    result.reference = alphaTotal ? Object.fromEntries(cell.categories.map((category, index) => [category, alpha[index] / alphaTotal])) : null;
  }
  const scores = fitted.models.map((model) => ({ model, evidence: model === other
    ? Math.max(...fitted.reference_sources.map((name) => evidence[name])) : evidence[model] }));
  const candidates = scores.map((row) => {
    const rival = Math.max(...scores.filter((candidate) => candidate.model !== row.model).map((candidate) => candidate.evidence));
    const margin = (row.evidence - rival) / Math.max(1, total);
    return { model: row.model, relativeMatch: 100 / (1 + Math.exp(-margin)),
      threshold: tier.thresholds[row.model] * 100, logEvidence: row.evidence, margin };
  }).map(row => ({ ...row, featureHitCount: Object.values(cells).reduce((sum, cell) => sum + Number(cell.featureHits?.[row.model] || 0), 0),
    featureHitRatio: total ? Object.values(cells).reduce((sum, cell) => sum + Number(cell.featureHits?.[row.model] || 0), 0) / total * 100 : 0 })).sort((a, b) => b.relativeMatch - a.relativeMatch);
  if (candidates.some((row) => !Number.isFinite(row.threshold))) reasons.add("uncalibrated");
  const top = candidates[0];
  if (!reasons.size) {
    if (candidates.filter((row) => row.relativeMatch === top.relativeMatch).length !== 1) reasons.add("multiple_thresholds");
    else if (top.relativeMatch <= top.threshold) reasons.add("no_threshold");
  }
  const directedModel = reasons.size ? null : top.model;
  return { verdict: !directedModel ? "inconclusive" : directedModel === claimedModel ? "consistent" : "deviates",
    directedModel, claimedModel, referenceSource, candidateDistribution: candidates, reasons: [...reasons], cells,
    declaredMatch: total ? candidates.find((row) => row.model === claimedModel)?.relativeMatch ?? null : null,
    sampleCount: total, plannedSamples: planned, partialSamples: total < planned };
}

// Add report-only detail to historical records with the exact same baseline.
// Original scores and raw observations remain unchanged in storage and export.
export function meowReportDetails(run) {
  const metadata = run.metadata || {};
  if (run.evaluator_id !== "meow-fingerprint" || metadata.scoringVersion !== engine || !metadata.observations?.length) return null;
  const baseline = [gptBaseline, claudeBaseline, gptChatBaseline, claudeChatBaseline, oldGptBaseline, oldClaudeBaseline].find(baseline => baseline.version === metadata.revision
    && baseline.fitted.models.includes(metadata.claimedModel));
  if (!baseline || !(metadata.tier === "screen" || baseline.tiers[metadata.tier])) return null;
  const score = scoreMeow(baseline, metadata.observations, metadata.tier, metadata.claimedModel);
  return {
    candidateDistribution: (metadata.candidateDistribution || []).map(candidate => {
      const detail = score.candidateDistribution.find(row => row.model === candidate.model);
      return { ...candidate, featureHitCount: detail?.featureHitCount, featureHitRatio: detail?.featureHitRatio };
    }),
    observations: metadata.observations.map(cell => ({ ...cell, reference: score.cells[cell.id]?.reference,
      referenceKind: "fitted-predictive", referenceModel: metadata.claimedModel }))
  };
}

export function meowReferenceCells(input) {
  const chat = calibrationWire(input.wireApi) === "chat";
  const claude = input.protocol === "anthropic" || /claude/i.test(input.observedModel || "");
  const baseline = chat ? claude ? claudeChatBaseline : gptChatBaseline : claude ? claudeBaseline : gptBaseline;
  return baseline.probes.flatMap(probe => probe.cells).map(cell => ({ ...cell, effort: input.reasoningEffort || null }));
}

export function meowRequestOptions(cell, input) {
  const chat = calibrationWire(input.wireApi) === "chat";
  return { maxOutputTokens: cell.parameters.max_output_tokens, chatTokenField: cell.parameters.chat_token_field, system: cell.system,
    reasoningEffort: input.reasoningEffort || null, adaptiveThinking: input.protocol === "anthropic", strictResponse: true,
    userAgent: chat ? undefined : input.protocol === "anthropic" ? "claude-cli/2.1.251 (external, cli)"
      : "Codex Desktop/0.147.0-alpha.1.2 (Windows 10.0.26200; x86_64) unknown (codex_exec; 0.147.0-alpha.1.2)" };
}

function baselineSupportsEffort(baseline, effort) {
  // Public Meow baselines are keyed by model and protocol; their source data
  // does not provide independent thinking-strength calibrations.
  return baseline?.probes?.some(probe => probe.cells?.length) === true;
}

async function runEmpirical(input, reference) {
  const conditionsId = `meow:empirical:v1:${reference.revision}`;
  const total = reference.probability.cells.length * reference.probability.repetitions;
  const previous = input.previousRun?.status === "paused" && input.previousRun.metadata?.conditionsId === conditionsId ? input.previousRun.metadata : null;
  const observations = reference.probability.cells.map(cell => ({ id: cell.id, prompt: cell.prompt,
    counts: { ...previous?.observations?.find(row => row.id === cell.id)?.counts }, reference: cell.distribution,
    referenceModel: reference.model, referenceKind: "trusted-empirical", sampleCount: previous?.observations?.find(row => row.id === cell.id)?.sampleCount || 0,
    planned: reference.probability.repetitions }));
  input.requireBudget?.(total - observations.reduce((sum, row) => sum + row.sampleCount, 0));
  let stop = null;
  for (const [index, row] of observations.entries()) {
    while (row.sampleCount < row.planned) {
      try {
        const answer = normalizeMeowAnswer(await input.request(row.prompt, { ...meowRequestOptions(reference.probability.cells[index], input), conditionsId }));
        if (!answer) throw new Error("空响应");
        row.counts[answer] = (row.counts[answer] || 0) + 1; row.sampleCount++;
        input.onProgress?.({ completed: observations.reduce((sum, item) => sum + item.sampleCount, 0), total });
      } catch (error) { stop = error; break; }
    }
    if (stop) break;
  }
  for (const row of observations) {
    row.jsd = null;
    if (!row.sampleCount) continue;
    row.jsd = [...new Set([...Object.keys(row.counts), ...Object.keys(row.reference)])].reduce((sum, answer) => {
      const p = (row.counts[answer] || 0) / row.sampleCount, q = row.reference[answer] || 0, m = (p + q) / 2;
      return sum + (p ? p * Math.log2(p / m) / 2 : 0) + (q ? q * Math.log2(q / m) / 2 : 0);
    }, 0);
  }
  const jsd = observations.every(row => row.sampleCount >= row.planned) ? observations.reduce((sum, row) => sum + row.jsd, 0) / observations.length : null;
  return { status: stop ? ["monitoring_paused", "target_inactive", "budget_exhausted"].includes(stop.code) ? "paused" : "error" : "ok",
    rationale: stop?.message || (jsd === null ? "有效样本不足，无法计算 JSD" : `JSD ${jsd.toFixed(4)} · 可信分布对照，未训练身份阈值`), metadata: {
      verdict: "inconclusive", observations, jsd, sampleCount: observations.reduce((sum, row) => sum + row.sampleCount, 0), plannedSamples: total,
      conditionsId, reasoningEffort: input.reasoningEffort || null, continuedFrom: previous ? input.previousRun.id : null, stopReason: stop?.message || null,
      source: reference.source, revision: reference.revision, scoringVersion: "meow-empirical-jsd-v1", claimedModel: reference.model,
      conditionNotice: "使用 Meow 原始探针与同协议可信样本计算 JSD；未拟合上游预测模型和身份判定阈值。" } };
}

async function run(input) {
  const chat = calibrationWire(input.wireApi) === "chat";
  const candidates = chat ? [gptChatBaseline, claudeChatBaseline] : input.protocol === "anthropic" ? [claudeBaseline] : input.wireApi === "responses" ? [gptBaseline] : [];
  const baseline = candidates.find(item => item.models.some(model => !model.reference_only
    && [input.canonicalModelId, input.observedModel].some(name => modelKey(name) === modelKey(model.id))));
  const claimedModel = baseline?.models.find(model => !model.reference_only
    && [input.canonicalModelId, input.observedModel].some(name => modelKey(name) === modelKey(model.id)))?.id;
  const requestedEffort = input.reasoningEffort || null;
  if (!claimedModel || !baselineSupportsEffort(baseline, requestedEffort)) {
    const reference = calibrationReference(await readCalibration(), input, "meow:empirical:v1");
    if (reference) return runEmpirical(input, reference);
    return { status: "unsupported", rationale: `Meow 当前基准未覆盖该申报模型或协议`, metadata: { verdict: "inconclusive", source, reasonCode: "baseline_missing", reasoningEffort: requestedEffort, collectReference: true } };
  }
  const tierName = input.meowTier || "screen";
  const tier = tierName === "screen"
    ? { counts: Object.fromEntries(baseline.probes.map((probe) => [probe.id, 1])), thresholds: {} }
    : baseline.tiers[tierName];
  if (!tier) throw new TypeError("Meow 核验强度无效");
  const total = Object.values(tier.counts).reduce((sum, value) => sum + value, 0);
  // Only a paused run with the same evaluator version and sample plan may be
  // resumed; completed historical reports must never silently affect a new run.
  const previousRun = input.previousRun;
  const resumeId = `meow:v1:${baseline.version}:${tierName}`;
  const canResume = previousRun?.status === "paused"
    && previousRun.evaluator_version === meowVersion
    && previousRun.metadata?.conditionsId === resumeId
    && previousRun.metadata?.plannedSamples === total;
  const previous = new Map((canResume ? previousRun.metadata.observations || [] : []).map((row) => [row.id, row]));
  const observations = baseline.probes.flatMap((probe) => probe.cells.map((cell) => {
    const saved = previous.get(cell.id);
    const counts = Object.assign(Object.create(null), saved?.counts || {});
    return { id: cell.id, prompt: cell.prompt, counts,
      attempts: Number(saved?.attempts) || 0,
      sampleCount: Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0), cell };
  }));
  const remaining = observations.reduce((sum, row) => sum + Math.max(0, tier.counts[row.id] - row.sampleCount), 0);
  const priorAttempts = canResume ? Number(previousRun.metadata.attempts) || 0 : 0;
  const maxAttempts = priorAttempts + remaining + Math.ceil(remaining / 2);
  // Reserve the bounded retry allowance up front. Without this, a transient
  // 429 can exhaust the daily budget halfway through a report and leave only
  // a few completed cases.
  input.requireBudget?.(remaining + Math.ceil(remaining / 2));
  const failures = canResume ? [...(previousRun.metadata.failures || [])] : [];
  let attempts = priorAttempts;
  let stopReason = null;
  let stopCode = null;
  let consecutiveFailures = 0;
  // Failed attempts consume the shared retry allowance and never vote twice.
  sampling: while (observations.some((row) => row.sampleCount < tier.counts[row.id]) && attempts < maxAttempts) {
    for (const observation of observations) {
      if (observation.sampleCount >= tier.counts[observation.id]) continue;
      if (attempts >= maxAttempts) break;
      const cell = observation.cell;
      attempts++;
      observation.attempts++;
      try {
        const answer = normalizeMeowAnswer(await input.request(cell.prompt, {
          ...meowRequestOptions(cell, input),
          conditionsId: resumeId }));
        if (!answer || [...answer].length > 4096) throw new Error("invalid_answer_length");
        observation.counts[answer] = (observation.counts[answer] || 0) + 1;
        observation.sampleCount++;
        consecutiveFailures = 0;
      } catch (error) {
        failures.push({ cellId: observation.id, attempt: attempts, error: error.message });
        if (["monitoring_paused", "target_inactive", "budget_exhausted", "authentication_failed"].includes(error.code)) {
          stopReason = error.message;
          stopCode = error.code;
          break sampling;
        }
        consecutiveFailures++;
        if (attempts < maxAttempts) await input.wait?.(Math.max(error.retryAfterMs || 0, Math.min(30000, 2000 * 2 ** Math.min(4, consecutiveFailures - 1))));
      }
      input.onProgress?.({ completed: observations.reduce((sum, row) => sum + row.sampleCount, 0), total, attempts, maxAttempts });
    }
  }
  const scored = scoreMeow(baseline, observations, tierName, claimedModel);
  const partial = scored.sampleCount < total;
  if (partial && !stopReason) stopReason = `采样未完成：${scored.sampleCount}/${total} 个有效样本，将在下次检测继续`;
  const label = verificationRunLabel({ status: "ok", evaluator_id: "meow-fingerprint", metadata: { ...scored, tier: tierName } });
  return { status: stopCode === "authentication_failed" ? "error" : stopReason ? "paused" : scored.sampleCount ? "ok" : "error", rationale: scored.sampleCount ? (partial ? stopReason : label) : stopReason || failures.at(-1)?.error || label,
    metadata: { ...scored, attempts, maxAttempts, failures, stopReason, source, revision: baseline.version,
    scoringVersion: engine, implementationVersion: meowVersion, tier: tierName,
    probeReasoningEffort: requestedEffort, reasoningEffort: requestedEffort, conditionsId: resumeId, plannedSamples: total,
    continuedFrom: canResume ? previousRun.id : null,
    observations: observations.map(({ cell, ...row }) => ({ ...row, planned: tier.counts[row.id], reference: scored.cells[row.id]?.reference, referenceKind: "fitted-predictive", referenceModel: claimedModel })), numericLabel: "申报模型匹配度", unit: "%",
    conditionNotice: `Meow 基准探针使用 ${requestedEffort} 推理档位；${tierName === "screen" ? "试采每个探针 1 次，沿用 low 档校准分界线，仅作快速预览。" : ""}候选分数为相对最强对手的证据优势，不是身份后验概率，合计不必为 100%。`,
    referenceDataset: { source: openrouterBaseline.source, revision: openrouterBaseline.revision, sourceKind: openrouterBaseline.sourceKind,
      validSamples: openrouterBaseline.validSamples, distinctModels: openrouterBaseline.distinctModels, distinctQuestions: openrouterBaseline.distinctQuestions,
      notice: openrouterBaseline.notice,
      // The archive records collection-time effort, but effort is not a
      // benchmark identity dimension. Keep all matching model/profile cells
      // in the report regardless of the target's requested thinking strength.
      distributions: openrouterBaseline.distributions.filter(reference => observations.some(row => row.id === reference.cell && row.cell.system === reference.system && row.cell.profile === reference.profile)) } } };
}

registerEvaluator({ id: "meow-fingerprint", label: "Meow 模型指向", version: meowVersion, conditionsId: "meow:v1", run,
  requirements: Object.fromEntries([["responses", [gptBaseline]], ["messages", [claudeBaseline]], ["chat.completions", [gptChatBaseline, claudeChatBaseline]]].map(([wireApi, baselines]) => [wireApi, {
    families: baselines.map(baseline => ({
      models: baseline.models.filter(model => !model.reference_only).map(model => model.id),
      revision: baseline.version,
      reasoningEfforts: [...new Set(baseline.probes.flatMap(probe => probe.cells).map(cell => cell.effort || null))],
      samples: { screen: baseline.probes.length, ...Object.fromEntries(Object.entries(baseline.tiers)
        .map(([tier, plan]) => [tier, Object.values(plan.counts).reduce((sum, count) => sum + count, 0)])) }
    }))
  }])) });
