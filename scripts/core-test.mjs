import assert from "node:assert/strict";
import { transitionIsland } from "../src/core/island-state.js";
import { islandDisplayModels, islandWaiting, liveIslandModels } from "../src/core/island-display.js";
import { aggregate, normalizeUsage } from "../src/core/metrics.js";
import { summarizeVerification, verificationVersions, verificationRunLabel } from "../src/core/quality-summary.js";
import { canProbeSession, normalizeAgentStatus, claudeTranscriptStatus, isAgentWorking } from "../src/core/agent-activity.js";
import { trustedHLWYReference, hlwyPrompt } from "../src/core/hlwy-reference.js";
import { builtInQuestions } from "../src/data/question-tests.js";

const referenceRecord = { revision: 'test', reasoningEffort: 'low', maxOutputTokens: 256, protocol: 'openai', wireApi: 'responses',
  referenceSampleCount: 50, probability: { temperature: 1, cells: [{ prompt: hlwyPrompt, distribution: { 42: 1 } }] } };
const referenceTarget = { observedModel: 'fixture', reasoningEffort: 'low', protocol: 'openai', wireApi: 'responses' };
assert.equal(trustedHLWYReference({ models: { fixture: referenceRecord } }, referenceTarget).stats.mode, 42);
assert.equal(trustedHLWYReference({ models: { fixture: referenceRecord } }, { ...referenceTarget, reasoningEffort: 'high' }), null);
assert.equal(trustedHLWYReference({ models: { fixture: { ...referenceRecord, referenceSampleCount: 2 } } }, referenceTarget), null);
assert.equal(builtInQuestions[0].answer, '21');
assert.equal(builtInQuestions[1].answer, '8');

const session = (id, status, extra = {}) => ({ sessionId: id, status, ...extra });
const models = [
  { id: "openai", sessions: [session("codex", "active")] },
  { id: "anthropic", sessions: [session("claude", "idle")] },
  { id: "configured-only", sessions: [] }
];

assert.deepEqual(liveIslandModels(models).map((model) => model.id), ["openai", "anthropic"]);
assert.deepEqual(islandDisplayModels(models, "compact").map((model) => model.id), ["openai"]);
assert.deepEqual(islandDisplayModels(models, "normal").map((model) => model.id), ["openai", "anthropic"]);
assert.equal(islandWaiting(models), false);
const now = Date.parse('2026-09-12T12:00:00Z');
const recentlyIdle = { status: 'idle', idleSince: new Date(now - 10000).toISOString(), lastActiveAt: new Date(now - 10000).toISOString() };
assert.equal(canProbeSession({ status: 'active' }, now), true);
assert.equal(canProbeSession(recentlyIdle, now), true);
assert.equal(canProbeSession({ ...recentlyIdle, idleSince: new Date(now - 1000).toISOString() }, now), false);
assert.equal(canProbeSession({ ...recentlyIdle, idleSince: new Date(now - 15 * 60000).toISOString() }, now), false);
assert.equal(canProbeSession({ status: 'idle', lastSeenAt: new Date(now).toISOString() }, now), false);
assert.equal(canProbeSession({ ...recentlyIdle, displayStatus: 'blocked' }, now), false);
assert.equal(canProbeSession({ ...recentlyIdle, endedAt: new Date(now).toISOString() }, now), false);
assert.equal(normalizeAgentStatus({ status: 'unknown', source: 'process', metadata: { pid: 1 } }), 'running');
assert.equal(normalizeAgentStatus({ status: 'running', displayStatus: 'idle', source: 'process', metadata: { pid: 1 } }), 'idle');
assert.equal(normalizeAgentStatus({ status: 'unknown', source: 'process' }), 'unknown');
assert.deepEqual(islandDisplayModels(models.map((model) => ({ ...model, sessions: model.sessions.map((item) => ({ ...item, status: "idle" })) })), "compact"), []);
assert.equal(islandWaiting(models.map((model) => ({ ...model, sessions: model.sessions.map((item) => ({ ...item, status: "idle" })) }))), true);
assert.deepEqual(islandDisplayModels([models[1]], "normal").map((model) => model.id), ["anthropic"]);

assert.deepEqual(transitionIsland({ mode: "compact", modelId: null }, { type: "border" }), { mode: "normal", modelId: null });
assert.deepEqual(transitionIsland({ mode: "normal", modelId: null }, { type: "ring", modelId: "openai" }), { mode: "focus", modelId: "openai" });
assert.deepEqual(transitionIsland({ mode: "focus", modelId: "openai" }, { type: "border" }), { mode: "normal", modelId: null });
assert.deepEqual(transitionIsland({ mode: "focus", modelId: "openai" }, { type: "leave", windowFocused: false }), { mode: "compact", modelId: null });
assert.deepEqual(transitionIsland({ mode: "normal", modelId: null }, { type: "leave", windowFocused: false }), { mode: "compact", modelId: null });

const usage = normalizeUsage("openai", { input_tokens: 100, output_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } });
assert.equal(usage.cacheHitRate, 0.4);
const missing = aggregate([{ timestamp: "2026-09-11T00:00:00.000Z", status: "ok", ttftMs: 120, durationMs: 480, inputTokens: 100, cacheReadTokens: null, cacheHitRate: null }]);
assert.equal(missing.cacheHitRate, null);
assert.equal(missing.cacheStatus, "unavailable");
assert.equal(missing.ttftMs, 120);

const run = { timestamp: "2026-09-12T00:00:00Z", evaluator_id: "meow-fingerprint",
  evaluator_version: verificationVersions["meow-fingerprint"], status: "ok", metadata: { verdict: "consistent", declaredMatch: 91 } };
assert.equal(summarizeVerification([run]).numeric.value, 91);
assert.equal(summarizeVerification([run], "probability-probe").numeric, null);
assert.equal(summarizeVerification([run], "probability-probe").selected, null);
const rawJuice = { ...run, evaluator_id: 'juice', evaluator_version: verificationVersions.juice,
  metadata: { verdict: 'inconclusive', mode: 'raw', reportedJuice: 32 } };
assert.equal(summarizeVerification([rawJuice], 'juice').numeric.value, 32);
assert.equal(verificationRunLabel(rawJuice), '原始观测 · 未校准');
assert.equal(verificationRunLabel({ status: "unsupported", evaluator_id: "juice",
  metadata: { calibrationNotice: "缺少该模型的可信校准档案" } }), "校准不可用");
assert.equal(verificationRunLabel({ status: "unsupported", evaluator_id: "meow-fingerprint",
  rationale: "此 Meow GPT 基准使用 Responses 协议，当前会话协议不匹配", metadata: { source: "Meow", reasonCode: "protocol_mismatch" } }), "协议条件不匹配");
assert.equal(verificationRunLabel({ status: "unsupported", evaluator_id: "meow-fingerprint",
  rationale: "Meow 当前基准未覆盖该申报模型", metadata: { source: "Meow", reasonCode: "baseline_missing" } }), "基准未覆盖");
assert.equal(verificationRunLabel({ status: "unsupported", evaluator_id: "hlwy-fingerprint", metadata: {} }), "方案不支持");

const { comparableAnswer } = await import('../src/core/answer-comparison.js');
for (const answer of ['21个。', '２１', '答案：21', '```text\n21\n```', '**21**']) assert.equal(comparableAnswer(answer, '21'), true, answer);
for (const answer of ['-21', '2.1', '2 1', '21或22', '21%','不是21','21个，但可能是22']) assert.equal(comparableAnswer(answer, '21'), false, answer);
assert.equal(comparableAnswer('21', '21。'), true);
assert.equal(verificationRunLabel({status:'ok',evaluator_id:'custom-question',metadata:{question:{match:'exact',answer:'21'},actual:'21个。',matched:false}}), '答案匹配');
assert.equal(claudeTranscriptStatus([{type:'assistant',message:{stop_reason:'end_turn'}}]), 'idle');
assert.equal(claudeTranscriptStatus([{type:'assistant',message:{stop_reason:'tool_use'}}]), 'tool');
assert.equal(claudeTranscriptStatus([{type:'assistant',message:{stop_reason:'end_turn'}},{type:'user',message:{content:'next'}}]), 'working');
assert.equal(isAgentWorking({status:'running',source:'process',metadata:{pid:1}}), false);
assert.equal(isAgentWorking({status:'running',source:'process',statusSource:'herdr'}), true);
const fullRun = { status:'ok',evaluator_id:'meow-fingerprint',metadata:{sampleCount:36,plannedSamples:36,reasons:['no_threshold']} };
assert.equal(verificationRunLabel(fullRun), '采样已完成 · 未超过强指向阈值');
assert.equal(verificationRunLabel({...fullRun,metadata:{sampleCount:6,plannedSamples:6,reasons:['uncalibrated'],tier:'screen'}}), '筛查已完成 · 未设强指向判定线');
assert.equal(verificationRunLabel({...fullRun,metadata:{sampleCount:2,plannedSamples:6,partialSamples:true,reasons:['uncalibrated','samples_incomplete']}}), '采样未满额，暂不下结论');
console.log("core tests passed: island display/state, metric missing values and evaluator selection");
