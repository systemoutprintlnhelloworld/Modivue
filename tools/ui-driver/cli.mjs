import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bins = join(root, ".local/agent-clis/node_modules/.bin");
const token = "modivue-cli-local-test-only";
const answer = `MODIVUE_CLI_OK_${randomUUID()}`;

export async function runCliTest(directory) {
  process.env.MODIVUE_DB = join(directory, "runtime.sqlite");
  process.env.MODIVUE_DATA_DIR = directory;
  process.env.MODIVUE_UI_ARTIFACTS = directory;
  const { proxyStream } = await import("../../src/core/proxy.mjs");
  const { saveSample, listSamples, listAgentSessions } = await import("../../src/core/storage.mjs");
  const { detectAgents } = await import("../../src/core/agents.mjs");
  const { credentialGroup } = await import("../../src/core/identity.mjs");
  let active;
  const records = [];
  const upstream = createServer(async (request, response) => {
    const parts = [];
    for await (const chunk of request) parts.push(chunk);
    const body = JSON.parse(Buffer.concat(parts).toString() || "{}");
    const path = new URL(request.url, "http://localhost").pathname;
    const gemini = path.includes("models/");
    const anthropic = path.endsWith("/messages");
    if (request.method === "GET" && path.endsWith("/models")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ object: "list", data: [{ id: active.model, object: "model", owned_by: "modivue" }] }));
      return;
    }
    if (path.endsWith(":countTokens")) { response.setHeader("content-type", "application/json"); response.end('{"totalTokens":16}'); return; }
    const model = body.model || path.match(/models\/([^:]+)/)?.[1];
    const toolResult = anthropic && body.messages?.some(message => Array.isArray(message.content)
      && message.content.some(block => block.type === "tool_result" && block.tool_use_id === "toolu_local"));
    const useTool = anthropic && !toolResult;
    records.push({ cli: active.id, path, model, authMatched: gemini
      ? request.headers["x-goog-api-key"] === token : anthropic ? request.headers["x-api-key"] === token : request.headers.authorization === `Bearer ${token}`,
      ...(anthropic ? { toolResult: Boolean(toolResult) } : {}) });
    active.received();
    await active.release;
    const usage = { prompt_tokens: 100, completion_tokens: 4, total_tokens: 104, prompt_tokens_details: { cached_tokens: 40 } };
    const candidate = { candidates: [{ content: { role: "model", parts: [{ text: answer }] }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 4, totalTokenCount: 104, cachedContentTokenCount: 40 }, modelVersion: model };
    if (body.stream || path.endsWith(":streamGenerateContent")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (anthropic) {
        const event = data => response.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
        event({ type: "message_start", message: { id: "msg_fixture", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 60, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, output_tokens: 0 } } });
        event({ type: "content_block_start", index: 0, content_block: useTool
          ? { type: "tool_use", id: "toolu_local", name: "Bash", input: {} } : { type: "text", text: "" } });
        event({ type: "content_block_delta", index: 0, delta: useTool
          ? { type: "input_json_delta", partial_json: JSON.stringify({ command: "sleep 3", description: "Local state observation" }) }
          : { type: "text_delta", text: answer } });
        event({ type: "content_block_stop", index: 0 });
        event({ type: "message_delta", delta: { stop_reason: useTool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });
        event({ type: "message_stop" }); response.end();
      } else if (gemini) response.end(`data: ${JSON.stringify(candidate)}\n\n`);
      else {
        const chunk = { id: "chatcmpl-local", object: "chat.completion.chunk", created: 1, model };
        response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] })}\n\n`);
        response.end(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\ndata: [DONE]\n\n`);
      }
    } else {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(gemini ? candidate : { id: "chatcmpl-local", object: "chat.completion", created: 1, model,
        choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }], usage }));
    }
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const gateway = createServer((request, response) => {
    const gemini = request.url.includes("models/");
    void proxyStream({ request, response, upstreamUrl: upstreamBase + request.url, baseUrl: upstreamBase,
      // Let the relay derive the observed model from each request body. gptme
      // may issue a separate, cheaper title request during one session.
      protocol: gemini ? "gemini" : request.url.includes("/messages") ? "anthropic" : "openai", agent: active.id, saveSample })
      .catch(error => { response.writeHead(500).end(error.message); });
  });
  gateway.listen(0, "127.0.0.1"); await once(gateway, "listening");
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const json = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2)); };
  const checks = [];
  const hookCommand = `"${process.execPath}" "${join(root, "cli/agent-session.mjs")}"`;
  const targets = [
    { id: "claude-code", binary: "claude", model: "claude-sonnet-4-5-20250929", args: ["-p", "Wait using the Bash tool, then reply only MODIVUE_CLI_OK.", "--model", "claude-sonnet-4-5-20250929", "--tools", "Bash", "--allowedTools", "Bash", "--strict-mcp-config", "--setting-sources", "user", "--output-format", "json"],
      config: { ".claude/settings.json": { model: "claude-sonnet-4-5-20250929", env: { ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: token },
        hooks: Object.fromEntries(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"].map(event => [event, [{ hooks: [{ type: "command", command: hookCommand }] }]])) } },
      env: { ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: token, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } },
    { id: "gemini-cli", binary: "gemini", model: "gemini-3.5-flash", args: ["-p", "Reply only MODIVUE_CLI_OK. Do not use tools.", "--skip-trust", "-m", "gemini-3.5-flash", "--output-format", "json"],
      config: { ".gemini/settings.json": { model: { name: "gemini-3.5-flash" }, security: { auth: { selectedType: "gemini-api-key" } }, telemetry: { enabled: false }, context: { fileName: [] } } },
      env: { GEMINI_API_KEY: token, GOOGLE_GEMINI_BASE_URL: base } },
    { id: "qwen-code", binary: "qwen", model: "qwen-local", args: ["-p", "Reply only MODIVUE_CLI_OK. Do not use tools.", "--output-format", "json", "--max-tool-calls", "0"],
      config: { ".qwen/settings.json": { model: { name: "qwen-local" }, security: { auth: { selectedType: "openai" } },
        modelProviders: { openai: [{ id: "qwen-local", name: "Local fixture", baseUrl: base + "/v1", envKey: "OPENAI_API_KEY" }] }, telemetry: { enabled: false } } },
      env: { OPENAI_API_KEY: token, OPENAI_BASE_URL: base + "/v1" } },
    { id: "pi", binary: "pi", model: "pi-local", args: ["--print", "--no-tools", "--no-extensions", "--no-skills", "--no-context-files", "--offline", "Reply only MODIVUE_CLI_OK."],
      config: { ".pi/agent/settings.json": { defaultProvider: "local", defaultModel: "pi-local", defaultThinkingLevel: "off" },
        ".pi/agent/models.json": { providers: { local: { baseUrl: base + "/v1", apiKey: token, api: "openai-completions",
          models: [{ id: "pi-local", name: "Local fixture", reasoning: false, input: ["text"], contextWindow: 16384, maxTokens: 128, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } } }, env: { PI_TELEMETRY: "0" } },
    { id: "opencode", binary: "opencode", model: "opencode-local", args: ["run", "--pure", "--dir", "WORKSPACE", "--format", "json", "Reply only MODIVUE_CLI_OK. Do not use tools."],
      config: { "opencode.json": { model: "local/opencode-local", small_model: "local/opencode-local", autoupdate: false,
        provider: { local: { npm: "@ai-sdk/openai-compatible", name: "Local fixture", options: { baseURL: base + "/v1", apiKey: token },
          models: { "opencode-local": { name: "Local fixture", limit: { context: 16384, output: 128 } } } } } } },
      env: { OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_DISABLE_AUTOUPDATE: "true" } },
    { id: "aider", executable: join(root, ".local/agent-clis/python/aider/bin/aider"), model: "aider-local",
      args: ["--message", "Reply briefly.", "--no-git", "--no-auto-commits", "--no-pretty", "--yes-always", "--no-check-update", "--no-show-release-notes", "--analytics-disable", "--no-show-model-warnings"],
      config: { ".aider.conf.yml": { model: "openai/aider-local", "openai-api-base": base + "/v1", "openai-api-key": token } },
      env: { PYTHONPATH: join(root, ".local/agent-clis/python/aider"), LITELLM_LOCAL_MODEL_COST_MAP: "True" } },
    { id: "gptme", executable: join(root, ".local/agent-clis/python/gptme/bin/gptme"), model: "gptme-local",
      // gptme 0.33.0 names conversations with its provider's built-in summary model.
      auxiliaryModels: ["gpt-5-mini"],
      args: ["--model", "openai/gptme-local", "--tools", "none", "--non-interactive", "--output-format", "text", "--no-workspace", "Reply briefly."],
      config: {}, env: { GPTME_MODEL: "openai/gptme-local", OPENAI_BASE_URL: base + "/v1", OPENAI_API_KEY: token,
        GPTME_OPENAI_RESPONSES_API: "0", PYTHONPATH: join(root, ".local/agent-clis/python/gptme") } }
  ];
  try {
    for (const target of targets) {
      const home = join(directory, target.binary || target.id);
      const cwd = join(home, "workspace");
      target.args = target.args.map(value => value === "WORKSPACE" ? cwd : value);
      await mkdir(cwd, { recursive: true });
      for (const [path, config] of Object.entries(target.config)) await json(join(path === "opencode.json" ? cwd : home, path), config);
      const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
        XDG_CACHE_HOME: join(home, ".cache"), TMPDIR: process.env.TMPDIR, TERM: "dumb", NO_COLOR: "1", CI: "true",
        NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost",
        CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"), GEMINI_CLI_HOME: home,
        PI_CODING_AGENT_DIR: join(home, ".pi/agent"), ...target.env, MODIVUE_UI_ARTIFACTS: directory };
      env.MODIVUE_DB = process.env.MODIVUE_DB;
      if (target.id === "opencode") env.OPENCODE_CONFIG = join(cwd, "opencode.json");
      let received, release;
      const requestStarted = new Promise(resolve => { received = resolve; });
      active = { ...target, received, release: new Promise(resolve => { release = resolve; }) };
      const command = target.executable || (target.binary === "claude" ? "claude" : join(bins, target.binary));
      const child = spawn(command, target.args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "", error = "";
      child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { error += chunk; });
      const closed = new Promise(resolve => { child.once("close", (code, signal) => resolve({ code, signal })); child.once("error", error => resolve({ code: -1, error: error.message })); });
      const timeout = setTimeout(() => { release(); child.kill("SIGTERM"); }, 45000);
      let observed, duringTool;
      try {
        const first = await Promise.race([requestStarted.then(() => true), closed.then(() => false)]);
        if (first) {
          const sessions = await detectAgents(env, home, cwd, { fresh: true });
          observed = sessions.find(session => session.host === target.id && session.cwd === cwd);
          if (!observed) {
            const { stdout } = await promisify(execFile)("/bin/ps", ["-axo", "pid=,ppid=,args="]);
            await json(join(home, "detection.json"), { sessions: sessions.filter(session => session.host === target.id).map(({ host, model, cwd, source, metadata }) => ({ host, model, cwd, source, pid: metadata?.pid })),
              processes: stdout.split("\n").filter(line => line.includes(String(child.pid)) || line.includes(bins) || line.includes("opencode run")) });
          }
          release();
          if (target.id === "claude-code") {
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline && !child.exitCode && !child.signalCode) {
              const hook = listAgentSessions({ host: target.id }).find(session => session.metadata?.pid === child.pid && session.status === "tool");
              if (hook) {
                duringTool = (await detectAgents(env, home, cwd, { fresh: true })).find(session => session.metadata?.pid === child.pid);
                break;
              }
              await delay(50);
            }
          }
        }
        const exit = await closed;
        await writeFile(join(home, "stdout.txt"), output);
        await writeFile(join(home, "stderr.txt"), error);
        const requests = records.filter(record => record.cli === target.id);
        const samples = listSamples({ hours: 0 }).filter(sample => sample.agent === target.id);
        const evidence = { exit, requests, model: observed?.model, baseUrl: observed?.baseUrl, keyGroup: observed?.keyGroup,
          cwd: observed?.cwd, pid: observed?.metadata?.pid, childPid: child.pid,
          detected: Boolean(observed), statusWhileRequesting: observed?.displayStatus || observed?.status,
          ...(target.id === "claude-code" ? { statusDuringTool: duringTool?.displayStatus || duringTool?.status, hookSourceDuringTool: duringTool?.source } : {}),
          hookStatusesAfterExit: target.id === "claude-code" ? listAgentSessions({ host: target.id, includeEnded: true }).map(session => session.status) : undefined,
          samples: samples.length, outputHasAnswer: output.includes(answer), paidRequests: 0 };
        await json(join(home, "result.json"), evidence);
        assert.equal(exit.code, 0, `${target.id}: exit ${JSON.stringify(exit)}, ${error.slice(-1000)}`);
        assert.ok(requests.some(row => row.model === target.model)
          && requests.every(row => row.authMatched && [target.model, ...(target.auxiliaryModels || [])].includes(row.model)), `${target.id}: request identity`);
        assert.ok(output.includes(answer), `${target.id}: response was not consumed`);
        assert.equal(observed?.model, target.model, `${target.id}: detected model`);
        assert.equal(observed?.baseUrl, ["gemini-cli", "claude-code"].includes(target.id) ? base : base + "/v1", `${target.id}: detected route`);
        if (target.id === "claude-code") {
          assert.ok(["active", "running", "working"].includes(evidence.statusWhileRequesting), 'Claude request was not marked running');
          assert.equal(evidence.statusDuringTool, "tool", "Claude tool phase was not detected");
          assert.ok(requests.some(request => request.toolResult), "Claude did not return a tool result");
          assert.ok(evidence.hookStatusesAfterExit.includes("ended"), "Claude SessionEnd hook was not recorded");
        }
        assert.equal(observed?.keyGroup, credentialGroup(token), `${target.id}: credential group`);
        for (const model of new Set(requests.map(row => row.model))) {
          const metric = samples.find(sample => sample.observed_model === model && sample.status === "ok"
            && sample.cache_hit_rate === .4);
          assert.ok(metric && (model === target.model ? metric.ttft_ms !== null : true), `${target.id}: metric collection for ${model}`);
        }
        checks.push({ name: `${target.id}-configured-cli-request-and-detection`, status: "PASS", evidence });
      } catch (error) {
        checks.push({ name: `${target.id}-configured-cli-request-and-detection`, status: "FAIL", evidence: error.message });
      } finally { clearTimeout(timeout); release(); if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await closed; }
    }
    await json(join(directory, "cli-summary.json"), checks);
    return checks;
  } finally { gateway.closeAllConnections(); upstream.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); await new Promise(resolve => upstream.close(resolve)); }
}
