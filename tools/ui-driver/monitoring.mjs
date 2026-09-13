import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// No provider credentials, real history or listening sockets are used here.
process.env.MODIVUE_DB = ":memory:";
process.env.MODIVUE_DATA_DIR = await mkdtemp(join(tmpdir(), "modivue-monitoring-"));
const { getSettings, updateSettings, probeUsageToday, saveQualityRun, listQualityRuns, closeStorage } = await import("../../src/core/storage.mjs");
const { runProbe, verificationDue, runTargetVerification } = await import("../../src/core/probe.mjs");
const { runEvaluator } = await import("../../src/core/quality.mjs");
const { proxyStream } = await import("../../src/core/proxy.mjs");
const { canProbeSession } = await import("../../src/core/agent-activity.js");
const { default: baseline } = await import("../../src/data/meow-gpt.json", { with: { type: "json" } });
const checks = [];
const pass = (name) => checks.push({ name, status: "PASS" });
const target = { id: "test", protocol: "openai", wireApi: "responses", baseUrl: "https://provider.test/v1",
  apiKey: "test-only-key", keyGroup: "test-key", observedModel: baseline.models.find(model => !model.reference_only).id };
const originalFetch = globalThis.fetch;
try {
  assert.equal(getSettings().verificationIntervalMinutes, 15);
  assert.equal(getSettings().verificationRequestDelaySeconds, 2);
  assert.throws(() => updateSettings({ verificationIntervalMinutes: 14 }));
  assert.throws(() => updateSettings({ verificationRequestDelaySeconds: 0 }));
  pass("verification-defaults-and-validation");

  const now = Date.now();
  saveQualityRun({ ...target, evaluatorId: "meow-fingerprint", evaluatorVersion: "test", status: "error",
    timestamp: new Date(now).toISOString(), metadata: {} });
  const runs = listQualityRuns({ hours: 0 });
  assert.equal(verificationDue(target, "meow-fingerprint", runs, 15, now + 899999), false);
  assert.equal(verificationDue(target, "meow-fingerprint", runs, 15, now + 900000), true);
  assert.equal(verificationDue({ ...target, keyGroup: "different-key" }, "meow-fingerprint", runs, 15, now), true);
  assert.equal(verificationDue({ ...target, reasoningEffort: "high" }, "meow-fingerprint", runs, 15, now), true);
  assert.equal(canProbeSession({ status: "idle", idleSince: new Date(now - 900000).toISOString() }, now), false);
  assert.equal((await runTargetVerification({ ...target, sessionId: "idle", runtimeStatus: "idle" }, "meow-fingerprint")).status, "skipped");
  pass("persisted-cooldown-identity-and-idle-exclusion");

  let calls = 0, active = 0, peak = 0;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://provider.test/"));
    calls++; active++; peak = Math.max(peak, active);
    requests.push(JSON.parse(options.body));
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":60},"output_tokens":1}}}\n\n', { headers: { "content-type": "text/event-stream" } });
  };
  await Promise.all([runProbe(target), runProbe(target), runProbe({ ...target, keyGroup: "second-key" })]);
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  assert.equal(probeUsageToday().requests, 2);
  updateSettings({ probeDailyLimit: 3 });
  const budgetResults = await Promise.allSettled([runProbe(target, { conditionsId: "budget-a" }), runProbe(target, { conditionsId: "budget-b" })]);
  assert.equal(budgetResults.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(budgetResults.find(result => result.status === "rejected").reason.code, "budget_exhausted");
  assert.equal(calls, 3);
  pass("probe-serial-dedup-and-queued-budget");

  const delays = [];
  let attempts = 0;
  const result = await runEvaluator("meow-fingerprint", { ...target, meowTier: "low", wait: async ms => delays.push(ms),
    request: async () => {
      attempts++;
      if ([1, 2, 4].includes(attempts)) throw Object.assign(new Error("temporary failure"), { retryAfterMs: attempts === 1 ? 3000 : 0 });
      return "sample";
    } });
  assert.deepEqual(delays, [3000, 4000, 2000]);
  assert.equal(result.metadata.sampleCount, 36);
  assert.equal(result.metadata.attempts, 39);
  const paused = await runEvaluator("meow-fingerprint", { ...target, meowTier: "low", request: async () => {
    throw Object.assign(new Error("paused"), { code: "monitoring_paused" });
  } });
  assert.equal(paused.metadata.attempts, 1);
  pass("meow-retry-after-backoff-reset-and-pause");

  let cancelled = false, ended = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":1}}}\n\n'));
      // Deliberately no close(): a completed response must not await relay EOF.
    },
    cancel() { cancelled = true; }
  }), { headers: { "content-type": "text/event-stream" } });
  const payload = Buffer.from(JSON.stringify({ model: "test", input: "ok", stream: true }));
  const request = { method: "POST", headers: {}, async *[Symbol.asyncIterator]() { yield payload; } };
  let timeout;
  const sample = await Promise.race([
    proxyStream({ request, response: { writeHead() {}, write() { return true; }, end() { ended = true; } },
      upstreamUrl: "https://provider.test/v1/responses", protocol: "openai", saveSample() {} }),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Completed SSE stream hung")), 1000); })
  ]).finally(() => clearTimeout(timeout));
  assert.equal(sample.status, "ok");
  assert.equal(sample.inputTokens, 10);
  assert.ok(cancelled && ended);
  pass("completed-sse-releases-connection-without-eof");
  console.log(JSON.stringify({ status: "PASS", checks }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  closeStorage();
}
