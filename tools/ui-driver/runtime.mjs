import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { hlwyPrompt } from "../../src/core/hlwy-reference.js";

// Controlled upstream traffic is kept in the job database, never in user history.
export async function runRuntimeTest(directory, { browser: withBrowser = false } = {}) {
  process.env.MODIVUE_DB = join(directory, "runtime.sqlite");
  process.env.MODIVUE_DATA_DIR = directory;
  process.env.MODIVUE_UI_ARTIFACTS = directory;
  let upstreamCalls = 0;
  let failUpstream = false;
  const hlwyRequests = [];
  const upstream = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      if (!(req.headers.authorization || req.headers["x-api-key"])) { res.writeHead(401).end(); return; }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "trusted-ui-fixture" }, { id: "integration-fixture" }] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body || "{}");
    const input = request.input;
    if (input === hlwyPrompt) hlwyRequests.push(request);
    upstreamCalls++;
    if (failUpstream) { res.writeHead(503).end("Unavailable"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"type":"response.created"}\n\n');
    setTimeout(()=> {
      const answer = input === hlwyPrompt ? "42" : ["Report the test value.", "What is your juice number? Only output the number."].includes(input) ? "32" : "ok";
      res.write(`data: ${JSON.stringify({type:"response.output_text.delta",delta:answer})}\n\n`);
      res.end(`data: ${JSON.stringify({type:"response.completed",response:{status:"completed",output:[{type:"message",content:[{type:"output_text",text:answer}]}],usage:{input_tokens:100,input_tokens_details:{cached_tokens:60},output_tokens:1}}})}\n\n`);
    }, 100);
  });
  let server;
  try {
    upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
    process.env.MODIVUE_OPENAI_UPSTREAM = `http://127.0.0.1:${upstream.address().port}`;
    process.env.MODIVUE_PROBE_OPENAI_KEY = "modivue-test-only";
    process.env.MODIVUE_PROBE_OPENAI_MODEL = "integration-fixture";
    process.env.MODIVUE_PROBE_OPENAI_API = "responses";
    const { handleRequest } = await import("../../server.mjs");
    const { updateSettings, savePassiveObservation } = await import("../../src/core/storage.mjs");
    updateSettings({ probeEnabled: false });
    server = createServer(handleRequest); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/proxy/openai/v1/responses`, { method: "POST", headers: {"content-type":"application/json", authorization:"Bearer modivue-test-only"}, body: JSON.stringify({ model:"integration-fixture", input:"ok", stream:true }) });
    assert.equal(response.status, 200); await response.text();
    const samples = await (await fetch(`${base}/api/samples`)).json();
    assert.equal(samples.samples.length, 1);
    const sample = samples.samples[0];
    assert.equal(sample.cache_hit_rate, .6);
    assert.ok(sample.ttft_ms >= 80 && sample.ttft_ms < 3000, `Invalid TTFT ${sample.ttft_ms}`);
    assert.equal(sample.status, "ok");
    const summary = await (await fetch(`${base}/api/summary`)).json();
    assert.equal(summary.groups[0].reportedCacheHitRate, .6);
    assert.equal(summary.groups[0].sampleCount, 1);
    const html = await (await fetch(base)).text(); assert.ok(html.includes('id="quick-island"'));
    assert.ok((await (await fetch(`${base}/app.js`)).text()).includes("bootstrap"));
    const agentCatalog = await (await fetch(`${base}/api/agents`)).json();
    const supportedIds = new Set((agentCatalog.supportedAgents || []).map(agent => agent.id));
    assert.ok(supportedIds.size >= 10, `Expected at least 10 supported Agent adapters, got ${supportedIds.size}`);
    // Exercise the actual frontend identity functions without duplicating their implementation.
    const { runInNewContext } = await import("node:vm");
    const source = await readFile(new URL("../../app.js", import.meta.url), "utf8");
    const identitySource = source.slice(source.indexOf("function identityParts("), source.indexOf("function canonicalModelId("));
    const { modelIdentityParts } = await import("../../src/core/model-identity.js");
    const route = runInNewContext(`${identitySource}; routeIdentity`, { modelIdentityParts });
    assert.equal(route({ provider:"openai", endpoint:"https://example.test", keyGroup:"a" }), route({ protocol:"openai", baseUrl:"https://example.test", keyGroup:"a" }));
    const costSource = source.slice(source.indexOf("function verificationCost("), source.indexOf("function verificationPlan("));
    const cost = runInNewContext(`${costSource}; verificationCost`, {
      inSelectedRange: timestamp => timestamp >= "2026-09-13T00:00:00Z"
    });
    const firstRequest = { timestamp: "2026-09-13T01:00:00Z", costUsd: .005, status: "ok" };
    const failedRequest = { timestamp: "2026-09-13T02:00:00Z", costUsd: .007, status: "error" };
    const finalRequest = { timestamp: "2026-09-13T03:00:00Z", costUsd: 0, status: "ok" };
    const chain = [
      { id: 1, metadata: { requests: [firstRequest] } },
      { id: 2, metadata: { continuedFrom: 1, requests: [firstRequest, failedRequest] } },
      { id: 3, metadata: { continuedFrom: 2, requests: [firstRequest, failedRequest, finalRequest] } },
      { id: 4, metadata: { requests: [{ timestamp: "2026-09-13T04:00:00Z", costUsd: null, status: "error" },
        { timestamp: "2026-09-12T23:00:00Z", costUsd: 100, status: "ok" }] } }
    ];
    const chainCost = JSON.parse(JSON.stringify(cost(chain)));
    assert.deepEqual(chainCost, { total: .012, average: .004, latest: null, known: 3, requests: 4 });
    assert.deepEqual(JSON.parse(JSON.stringify(cost(chain.slice().reverse()))), chainCost);
    assert.deepEqual(JSON.parse(JSON.stringify(cost(chain.slice(2)))), chainCost, "Missing ancestors must not discard cumulative requests");
    const checks = [
      {name:"host-localhost-bind",status:"PASS",evidence:base},
      {name:"stream-to-sqlite-to-api",status:"PASS",evidence:{ttftMs:sample.ttft_ms,cacheHitRate:sample.cache_hit_rate,samples:1,source:"synthetic-upstream"}},
      {name:"frontend-route-identity",status:"PASS"},
      {name:"continuation-cost-counts-each-request-once",status:"PASS",evidence:chainCost},
      {name:"supported-agent-adapter-catalog",status:"PASS",evidence:{count:supportedIds.size,ids:[...supportedIds]}}
    ];
    if (withBrowser) {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:true });
      try {
        const page = await browser.newPage({ viewport:{width:1320,height:840} });
        const errors = []; page.on("pageerror", error=>errors.push(error.message));
        const checkAsset = response => {
          if (response.url().startsWith(base) && /\.(js|css|png)(\?|$)/.test(response.url()) && !response.ok())
            errors.push(`Asset ${response.status()}: ${response.url()}`);
        };
        page.on("response", checkAsset);
        const agents = { agents:[{id:"codex:ui-fixture",host:"codex",label:"Codex",sessionId:"ui-fixture",status:"active",
          protocol:"openai",baseUrl:process.env.MODIVUE_OPENAI_UPSTREAM,keyGroup:sample.key_group,model:"integration-fixture"}] };
        await page.route("**/api/agents", route=>route.fulfill({json:agents}));
        // UI checks never spend provider tokens or depend on the live catalog network.
        await page.route("**/api/probe", route=>route.fulfill({json:{results:[]}}));
        const fixtureTarget = { id: JSON.stringify(["integration-fixture", process.env.MODIVUE_OPENAI_UPSTREAM, sample.key_group, null]),
          protocol: "openai", wireApi: "responses", baseUrl: process.env.MODIVUE_OPENAI_UPSTREAM,
          keyGroup: sample.key_group, observedModel: "integration-fixture", canonicalModelId: null,
          reasoningEffort: null, runtimeStatus: "active", pauseReason: null };
        await page.route("**/api/probe/state", route => route.fulfill({ json: { enabled: true, targets: [fixtureTarget], verification: [] } }));
        await page.route("**/api/model-catalog*", route=>route.fulfill({status:503,json:{models:[]}}));
        await page.goto(base+"/?desktop=main");
        await page.waitForFunction(()=>document.querySelector("#model-strip")?.textContent.includes("integration-fixture"));
        await page.locator(".spotlight-tour .tour-next").waitFor();
        await page.screenshot({ path: join(directory, "web-first-run-tour.png") });
        let tourSteps = 0;
        let extensionStepSeen = false;
        while (await page.locator(".spotlight-tour").count()) {
          const copy = await page.locator(".spotlight-card p").innerText();
          if (tourSteps === 0) assert.ok(copy.includes("主窗口"));
          if (copy.includes("拓展窗口")) extensionStepSeen = true;
          await page.locator(".tour-next").click();
          tourSteps++;
          if (tourSteps > 8) throw new Error("main tutorial did not finish");
        }
        assert.ok(tourSteps >= 5, "Main tutorial must cover main and extension interactions");
        assert.equal(extensionStepSeen, true, "Main tutorial must introduce the extension window");
        await page.waitForFunction(() => !document.querySelector(".spotlight-tour"));
        assert.equal((await (await fetch(`${base}/api/settings`)).json()).settings.tourSeen, true);
        await page.locator("#model-strip button",{hasText:"integration-fixture"}).click();
        await page.waitForFunction(()=>document.querySelector(".cache-card .metric-value")?.textContent.includes("60%"));
        assert.ok((await page.locator(".ttft-card .metric-value").innerText()).includes("ms"));
        assert.equal(await page.locator(".overview-rings .ring-value").count(), 3);
        // Review settled transitions, not a screenshot of the initial grey frame.
        await page.waitForTimeout(700);
        const cacheRing = await page.locator(".overview-rings .ring-value").nth(1).evaluate(node => ({
          stroke: getComputedStyle(node).stroke, dash: node.getAttribute('stroke-dasharray'), opacity: getComputedStyle(node).opacity }));
        assert.equal(cacheRing.dash, '60 100');
        assert.notEqual(cacheRing.stroke, 'none');
        assert.equal(cacheRing.opacity, '1');
        await page.screenshot({path:join(directory,"web-main.png")});
        const { verificationVersions } = await import("../../src/core/quality-summary.js");
        const report = { ...sample, id: 90001, evaluator_id: "meow-fingerprint", evaluator_version: verificationVersions["meow-fingerprint"],
          status: "ok", metadata: { verdict: "inconclusive", sampleCount: 36, plannedSamples: 36, reasons: ["no_threshold"], claimedModel: "integration-fixture",
            continuedFrom: 90000,
            requests: [{ timestamp: sample.timestamp, status: "ok", durationMs: 100, costUsd: .005, costStatus: "estimated" },
              { timestamp: sample.timestamp, status: "ok", durationMs: 100, costUsd: .007, costStatus: "estimated" }],
            observations: [{ id: "fixture", prompt: "Reference fixture", planned: 36, counts: { a: 30, b: 6 }, reference: { a: .8, b: .2 }, referenceKind: "fitted-predictive" }],
            candidateDistribution: [{ model: "integration-fixture", relativeMatch: 65, threshold: 70, featureHitCount: 30, featureHitRatio: 83.333 }, { model: "other", relativeMatch: 35, threshold: 70, featureHitCount: 6, featureHitRatio: 16.667 }] } };
        const parentReport = { ...report, id: 90000, status: "paused",
          metadata: { ...report.metadata, continuedFrom: null, requests: report.metadata.requests.slice(0, 1) } };
        await page.route("**/api/quality/runs?*", route => route.fulfill({ json: { runs: [report, parentReport], history: [report, parentReport], latest: [report] } }));
        await page.evaluate(() => window.modivue.refresh());
        await page.locator('[data-view="quality"]').click();
        assert.ok((await page.locator(".historical-report").first().innerText()).includes("采样已完成 · 未超过强指向阈值"));
        assert.ok((await page.locator(".model-direction-report").first().innerText()).includes("30 / 36 次"));
        assert.ok((await page.locator(".historical-report").first().innerText()).includes("80.0%"));
        assert.ok((await page.locator("#cost-summary").innerText()).includes("$0.012000"));
        assert.ok((await page.locator(".report-facts").first().innerText()).includes("$0.012000"));
        const currentRequestDetails = page.locator('[data-detail-key="requests-selected-90001"]');
        const currentRawDetails = page.locator('[data-detail-key="raw-selected-90001"]');
        await currentRequestDetails.locator('summary').click();
        await currentRawDetails.locator('summary').click();
        // Cross two periodic redraws with the same report rendered twice.
        await page.waitForTimeout(4300);
        assert.equal(await currentRequestDetails.evaluate(el => el.open), true, "Current request details collapsed during polling");
        assert.equal(await currentRawDetails.evaluate(el => el.open), true, "Current JSON collapsed during polling");
        assert.equal(await page.locator('[data-detail-key="raw-history-90001"]').evaluate(el => el.open), false, "History must have independent disclosure state");
        assert.ok((await page.locator('.model-direction-report').first().innerText()).includes('参与样本'));
        await page.screenshot({ path: join(directory, "web-report-disclosures.png") });
        await page.locator('[data-view="logs"]').click();
        await page.locator('.log-entry summary').first().click();
        await page.evaluate(() => window.modivue.refresh());
        assert.equal(await page.locator('.log-entry').first().evaluate(el => el.open), true, "Log details collapsed during refresh");
        await page.unroute("**/api/quality/runs?*");
        await page.evaluate(() => window.modivue.refresh());
        checks.push({ name: "report-and-log-disclosures-survive-refresh", status: "PASS" });
        await page.locator('[data-view="settings"]').click();
        assert.equal(await page.locator(".overview-only:visible").count(), 0);
        assert.equal(await page.locator("#settings-form").isVisible(), true);
        await page.locator('[name="ttftThresholdMs"]').fill("2500");
        await page.locator('[data-settings-tab="verification"]').click();
        assert.equal(await page.locator('[name="verificationIntervalMinutes"]').inputValue(), "15");
        await page.locator('[name="verificationIntervalMinutes"]').fill("20");
        await page.locator('#settings-form button[type="submit"]:visible').click();
        await page.waitForFunction(()=>document.querySelector("#toast")?.textContent.includes("设置已保存"));
        assert.equal((await (await fetch(`${base}/api/settings`)).json()).settings.ttftThresholdMs,2500);
        assert.equal((await (await fetch(`${base}/api/settings`)).json()).settings.verificationIntervalMinutes,20);
        const customization = page.locator('#customization-form');
        await page.locator('[data-settings-tab="appearance"]').click();
        await customization.locator('[name="themePreset"]').selectOption('custom');
        await customization.locator('[name="mainBackground"]').fill('#202427');
        await customization.locator('[name="panelBackground"]').fill('#293033');
        await customization.locator('[name="panelRadius"]').fill('6');
        await page.locator('[data-settings-tab="interaction"]').click();
        await customization.locator('[name="islandMaxAgents"]').fill('2');
        await customization.locator('[name="focusDwellMs"]').fill('220');
        await page.locator('#customization-search').fill('背景');
        assert.equal(await customization.locator('[name="mainBackground"]').inputValue(), '#202427');
        assert.equal(await page.locator('[name="probeInstruction"]').isVisible(), false);
        await page.locator('[data-settings-tab="appearance"]').click();
        await customization.locator('[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('自定义设置已保存'));
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim()), '#202427');
        assert.equal((await (await fetch(`${base}/api/settings`)).json()).settings.panelRadius, 6);
        await page.screenshot({ path: join(directory, 'web-customization.png') });
        const calibration = { version: 2, source: "isolated-ui-test", models: {
          "integration-fixture": { revision:"test1", reasoningEffort:null, maxOutputTokens:32,
            probability: { cells:[{prompt:"Choose a token.",distribution:{ok:1}}], repetitions:16, temperature:1, maxJsd:0.1 },
            juice: {prompt:"Report the test value.",min:32,max:32} }
        } };
        await page.locator('[data-settings-tab="verification"]').click();
        await page.locator('[name="evaluatorId"]').selectOption('probability-probe');
        await page.locator('#settings-form button[type="submit"]:visible').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('设置已保存'));
        await page.locator("#calibration-json").fill(JSON.stringify(calibration));
        await page.locator('#calibration-form [type="submit"]').click();
        await page.waitForFunction(()=>document.querySelector("#calibration-message")?.textContent.includes("已导入 1 个模型"));
        const storedCalibration = (await (await fetch(`${base}/api/iq/calibration`)).json()).calibration;
        assert.deepEqual(storedCalibration.models,calibration.models);
        const invalid = structuredClone(calibration);
        invalid.models["integration-fixture"].probability.cells[0].distribution.ok = -1;
        await page.locator("#calibration-json").fill(JSON.stringify(invalid));
        await page.locator('#calibration-form [type="submit"]').click();
        await page.waitForFunction(()=>document.querySelector("#calibration-message")?.dataset.tone === "error");
        assert.deepEqual((await (await fetch(`${base}/api/iq/calibration`)).json()).calibration,storedCalibration);
        const trustedForm = page.locator("#trusted-calibration-form");
        await trustedForm.locator('[name="baseUrl"]').fill(process.env.MODIVUE_OPENAI_UPSTREAM);
        await trustedForm.locator('[name="apiKey"]').fill("modivue-test-only");
        await trustedForm.locator('[data-trusted-action="test"]').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('连接与鉴权成功'));
        await trustedForm.locator('[data-trusted-action="models"]').click();
        await trustedForm.locator('[name="modelList"]').selectOption('trusted-ui-fixture');
        assert.equal(await trustedForm.locator('[name="model"]').inputValue(), 'trusted-ui-fixture');
        await trustedForm.locator('[name="wireApi"]').selectOption("responses");
        await trustedForm.locator('[name="prompt"]').fill("Choose a token.");
        await trustedForm.locator('[value="preview"]').click();
        await page.waitForFunction(() => document.querySelector("#trusted-progress")?.textContent.includes("2 次试采样完成"));
        assert.equal(await trustedForm.locator('[name="apiKey"]').inputValue(), "");
        assert.deepEqual((await (await fetch(`${base}/api/iq/calibration`)).json()).calibration,storedCalibration);
        await trustedForm.scrollIntoViewIfNeeded();
        await page.screenshot({path:join(directory,"web-trusted-reference.png")});
        checks.push({ name: "trusted-api-form-preview-progress", status: "PASS" });
        await page.reload();
        await page.waitForFunction(()=>document.querySelector("#model-strip")?.textContent.includes("integration-fixture"));
        assert.equal(await page.locator('.spotlight-tour').count(), 0);
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim()), '#202427');
        checks.push({name:'tour-and-customization-persistence',status:'PASS'});
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="verification"]').click();
        await page.waitForFunction(()=>document.querySelector("#calibration-json")?.value.includes("isolated-ui-test"));
        if (!(await page.locator("body").evaluate(el=>el.classList.contains("light")))) await page.locator("#theme-toggle").click();
        await page.locator("#calibration-form").scrollIntoViewIfNeeded();
        await page.screenshot({path:join(directory,"web-calibration-light.png")});
        for (const view of ["models","routes","cache","ttft","quality","alerts","logs","settings"]) {
          await page.locator(`[data-view="${view}"]`).click();
          assert.equal(await page.locator(".overview-only:visible").count(),0,`${view}: overview is visible`);
          assert.equal(await page.locator("#view-content").isVisible(),true);
        }
        await page.waitForTimeout(250);
        await page.screenshot({path:join(directory,"web-settings-light.png")});
        await page.locator('[data-view="overview"]').click();
        assert.equal(await page.locator("#view-content").isVisible(),false);
        assert.equal(await page.locator("#metric-grid").isVisible(),true);
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-action="replay-tour"]').click();
        await page.locator('.tour-next').waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.spotlight-tour').count(), 0);
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="appearance"]').click();
        await page.locator('#customization-form').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(directory,'web-customization-mobile.png')});
        const settingsOverflow = await page.locator('#customization-form').evaluate(el => el.scrollWidth > el.clientWidth);
        assert.equal(settingsOverflow,false,'Customization form overflows on mobile');
        await page.locator('[data-action="replay-tour"]').click();
        await page.screenshot({path:join(directory,'web-tour-mobile.png')});
        const tourBox = await page.locator('.spotlight-card').boundingBox();
        assert.ok(tourBox.x >= 0 && tourBox.x + tourBox.width <= 390 && tourBox.y + tourBox.height <= 844);
        await page.keyboard.press('Escape');
        await page.setViewportSize({width:1320,height:840});
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="tests"]').click();
        await page.locator('.question-item summary').first().click();
        await page.locator('[data-fill-question="candy-21"]').click();
        assert.equal(await page.locator('#question-form [name="answer"]').inputValue(), '21');
        assert.equal((await (await fetch(`${base}/api/settings`)).json()).settings.defaultQuestionId, 'candy-21');
        await page.locator('.question-item summary').nth(1).click();
        await page.locator('[data-fill-question="water-cups-8"]').click();
        assert.equal(await page.locator('#question-form [name="answer"]').inputValue(), '8');
        await page.locator('#question-form [type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('题目已保存并选用'));
        const chosen = (await (await fetch(`${base}/api/settings`)).json()).settings;
        assert.equal(chosen.evaluatorId, 'custom-question'); assert.equal(chosen.defaultQuestionId, 'water-cups-8');
        await page.locator('[data-action="question-verification"]').click();
        assert.equal(await page.locator('#quality-question-select').inputValue(), 'water-cups-8');
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="verification"]').click();
        for (const [method, field] of [['meow-fingerprint','meowTier'], ['juice','juiceMode'], ['hlwy-fingerprint','verificationSamples'], ['custom-question','defaultQuestionId'], ['probability-probe',null]]) {
          await page.locator('[name="evaluatorId"]').selectOption(method);
          for (const name of ['meowTier', 'juiceMode', 'verificationSamples', 'defaultQuestionId']) {
            assert.equal(await page.locator(`[name="${name}"]`).isVisible(), name === field, `${method}: ${name}`);
          }
        }
        await page.locator('[data-settings-tab="tests"]').click();
        const questionForm = page.locator('#question-form');
        await questionForm.locator('[name="title"]').fill('UI question');
        await questionForm.locator('[name="prompt"]').fill('Reply ok.');
        await questionForm.locator('[name="answer"]').fill('ok');
        await questionForm.locator('[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('.custom-test-list')?.textContent.includes('UI question'));
        assert.ok((await (await fetch(`${base}/api/questions`)).json()).questions.some(question => question.title === 'UI question'));
        await page.screenshot({ path: join(directory, 'web-questions.png') });
        // Exercise the real UI action after selection. The request must carry
        // the selected question id; backend execution is covered separately
        // with the controlled upstream below.
        await page.locator('[data-settings-tab="verification"]').click();
        await page.locator('[name="evaluatorId"]').selectOption('custom-question');
        await page.locator('#settings-form button[type="submit"]:visible').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('设置已保存'));
        await page.locator('[data-settings-tab="tests"]').click();
        const createdQuestion = (await (await fetch(`${base}/api/questions`)).json()).questions.find(question => question.title === 'UI question');
        assert.ok(createdQuestion?.id, 'custom question was not persisted');
        await page.locator('[data-action="question-verification"]').click();
        await page.locator('#quality-question-select').waitFor();
        await page.locator('#quality-question-select').selectOption(createdQuestion.id);
        await page.waitForTimeout(300);
        const qualityDebug = await page.evaluate(() => ({
          buttonDisabled: document.querySelector('[data-action="run-quality"]')?.disabled,
          method: document.querySelector('#quality-method-select')?.value,
          question: document.querySelector('#quality-question-select')?.value,
          title: document.querySelector('#page-title')?.textContent
        }));
        assert.equal(qualityDebug.buttonDisabled, false, `quality action disabled: ${JSON.stringify(qualityDebug)}`);
        await page.waitForFunction(() => {
          const button = document.querySelector('[data-action="run-quality"]');
          return button && !button.disabled;
        });
        let qualityRequest;
        await page.route('**/api/quality/run', async route => {
          qualityRequest = JSON.parse(route.request().postData() || '{}');
          await route.fulfill({ json: { status: 'queued', evaluatorId: 'custom-question', questionId: createdQuestion.id } });
        });
        await page.locator('[data-action="run-quality"]').click();
        await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('核验已排队') || document.querySelector('#toast')?.textContent.includes('核验已开始'));
        assert.equal(qualityRequest?.evaluatorId, 'custom-question');
        assert.equal(qualityRequest?.questionId, createdQuestion.id);
        await page.unroute('**/api/quality/run');
        checks.push({name:'ui-selected-question-id-reaches-verification-request',status:'PASS'});
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="verification"]').click();
        await page.locator('[name="evaluatorId"]').selectOption('hlwy-fingerprint');
        await page.locator('[name="hlwySource"]').selectOption('trustedApi');
        await page.locator('#customization-form [type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('[name=hlwySource]')?.value === 'public');
        assert.equal(await page.locator('[name="hlwySource"]').inputValue(), 'public');
        checks.push({name:'settings-tabs-search-drafts-questions-and-hlwy-fallback',status:'PASS'});
        checks.push({name:'tour-replay-and-mobile-customization',status:'PASS'});
        await page.locator('#search-launcher').click();
        await page.locator('#global-search').fill('日志');
        await page.locator('#global-search-results button').first().click();
        assert.equal(await page.locator('#page-title').innerText(), '日志');
        await page.keyboard.press('Control+k');
        await page.locator('#global-search').fill('不透明度');
        await page.locator('#global-search-results button').first().click();
        assert.equal(await page.locator('#page-title').innerText(), '设置');
        assert.equal(await page.locator('[name="islandOpacity"]').isVisible(), true);
        assert.equal(await page.locator('.nav-item[data-view="overview"]').isVisible(), true);
        await page.locator('[data-settings-tab="display"]').click();
        await page.locator('[data-ring-style="depth"]').click();
        await page.locator('#customization-form [type="submit"]').click();
        await page.waitForFunction(() => document.body.dataset.ringStyle === 'depth');
        await page.reload();
        await page.waitForFunction(() => document.body.dataset.ringStyle === 'depth');
        checks.push({name:'global-feature-and-settings-search',status:'PASS'});
        checks.push({name:"tabs-replace-overview",status:"PASS"},
          {name:"calibration-import-validation-persistence",status:"PASS",evidence:"isolated database; negative probability rejected without overwriting valid archive"});
        await page.locator('[data-view="settings"]').click();
        await page.locator('[data-settings-tab="monitoring"]').click();
        const savedSettings = async () => (await (await fetch(`${base}/api/settings`)).json()).settings;
        await page.locator('[name="ttftThresholdMs"]').fill('2600');
        await page.waitForResponse(response => response.url() === base + '/api/settings' && response.request().method() === 'PATCH');
        assert.equal((await savedSettings()).ttftThresholdMs, 2600, 'Settings must save without submitting');
        await page.locator('[name="ttftThresholdMs"]').fill('0');
        await page.waitForFunction(() => document.querySelector('#settings-save-status')?.dataset.tone === 'error');
        assert.equal((await savedSettings()).ttftThresholdMs, 2600, 'Invalid draft must not replace saved settings');
        await page.locator('[data-view="logs"]').click();
        await page.locator('[data-view="settings"]').click();
        assert.equal(await page.locator('[name="ttftThresholdMs"]').inputValue(), '0', 'Draft must survive navigation');
        let rejectSave = true;
        await page.route('**/api/settings', async route => {
          if (route.request().method() !== 'PATCH' || !rejectSave) return route.continue();
          rejectSave = false;
          await new Promise(resolve => setTimeout(resolve, 1200));
          await route.fulfill({ status: 503, json: { error: 'Fixture save failure' } });
        });
        await page.locator('[name="ttftThresholdMs"]').fill('2700');
        await page.waitForRequest(request => request.url() === base + '/api/settings' && request.method() === 'PATCH');
        await page.locator('[name="ttftThresholdMs"]').fill('2800');
        await page.waitForFunction(() => document.querySelector('#settings-save-status')?.dataset.tone === 'success');
        assert.equal((await savedSettings()).ttftThresholdMs, 2800, 'New draft must survive an older failed request');
        await page.unroute('**/api/settings');
        checks.push({ name: 'autosave-validation-navigation-and-request-race', status: 'PASS' });
        await page.locator('[data-settings-tab="appearance"]').click();
        await page.locator('[name="locale"]').selectOption('en');
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        await page.reload();
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        assert.ok((await page.locator('[data-view="settings"]').innerText()).includes('Settings'));
        await page.keyboard.press('Control+k');
        await page.locator('#global-search').fill('opacity');
        assert.ok(await page.locator('#global-search-results button').count() > 0);
        const scroll = await page.evaluate(() => ({ window: scrollY, dialog: document.querySelector('#search-dialog').scrollTop }));
        await page.locator('#global-search').hover();
        await page.mouse.wheel(0, 1000);
        assert.deepEqual(await page.evaluate(() => ({ window: scrollY, dialog: document.querySelector('#search-dialog').scrollTop })), scroll);
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        assert.equal(await page.locator('[name="islandOpacity"]').isVisible(), true, 'English search must reveal its settings row');
        await page.keyboard.press('Control+k');
        await page.locator('#global-search').fill('Language');
        await page.keyboard.press('Enter');
        await page.locator('[name="locale"]').selectOption('zh-CN');
        await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
        checks.push({ name: 'spotlight-keyboard-scroll-lock-and-persisted-language', status: 'PASS' });
        const ztestReport = { id: 'modivue-ztest-fixture', status: 'completed', model: { code: 'integration-fixture', display_name: 'Integration fixture' },
          profile: 'quick', endpoint_masked: 'local fixture', probe_results: [{ probe_code: 'fixture', probe_name: 'Fixture probe', status: 'success', score: 1, latency_ms: 123 }] };
        const importBody = { observedModel: sample.observed_model, baseUrl: sample.base_url, keyGroup: sample.key_group, reasoningEffort: null, confirmTarget: true, report: ztestReport };
        const importReport = body => fetch(`${base}/api/quality/ztest/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const imported = await importReport(importBody);
        assert.equal(imported.status, 200, await imported.clone().text());
        const importId = (await imported.json()).id;
        const duplicate = await (await importReport(importBody)).json();
        assert.equal(duplicate.id, importId); assert.equal(duplicate.duplicate, true);
        assert.equal((await importReport({ ...importBody, confirmTarget: false })).status, 400);
        assert.equal((await importReport({ ...importBody, report: { ...ztestReport, status: 'running' } })).status, 400);
        assert.equal((await importReport({ ...importBody, report: { ...ztestReport, model: { code: 'wrong-model' } } })).status, 400);
        const history = await (await fetch(`${base}/api/quality/runs?hours=0`)).json();
        assert.deepEqual((history.history || history.runs).find(run => run.id === importId).metadata.externalReport, ztestReport);
        checks.push({ name: 'ztest-independent-report-import-validation-and-deduplication', status: 'PASS' });
        const island = await browser.newPage({viewport:{width:570,height:420}});
        island.on("response", checkAsset);
        const islandAgents = { agents: [...agents.agents,
          { ...agents.agents[0], host: "claude-code", label: "Claude Code", sessionId: "idle-fixture", model: "idle-fixture", status: "idle" }] };
        await island.route("**/api/agents", route=>route.fulfill({json:islandAgents}));
        island.on("pageerror",error=>errors.push(error.message));
        await island.route("**/api/probe", route=>route.fulfill({json:{results:[]}}));
        await island.route("**/api/model-catalog*", route=>route.fulfill({status:503,json:{models:[]}}));
        await island.goto(base+"/?desktop=island");
        await island.locator("[data-island-model]").first().waitFor({state:"visible"});
        // Initial settings and live-agent discovery can start layout transitions.
        // Compare settled slots before/after hover, while keeping hover animations enabled.
        await island.waitForFunction(() => !document.querySelector('#quick-island').getAnimations({ subtree: true })
          .some(animation => animation.effect?.getTiming().iterations !== Infinity && animation.playState === 'running'));
        const beforeHover = await island.locator("[data-island-model]").first().boundingBox();
        await island.evaluate(() => window.modivue.nativeFocus(false));
        assert.equal(await island.locator('[data-island-model][aria-hidden="false"]').count(), 1);
        await island.evaluate(() => { window.testRingNodes = [...document.querySelectorAll('[data-island-model]')]; });
        const rail = await island.locator("#quick-island").boundingBox();
        await island.mouse.move(rail.x + 3, rail.y + 20);
        await island.waitForTimeout(300);
        assert.equal(await island.locator("body").getAttribute("data-island-mode"), "normal");
        assert.equal(await island.locator('[data-island-model][aria-hidden="false"]').count(), 2,
          "Border hover must reveal active and idle model quadruples");
        await island.screenshot({path:join(directory,"web-island-normal.png")});
        // Dispatch real coordinates: the focused layer intentionally replaces
        // the model under the cursor, so locator.hover's retry is unsuitable.
        await island.mouse.move(beforeHover.x + beforeHover.width / 2, beforeHover.y + beforeHover.height / 2);
        await island.waitForFunction(()=>document.querySelector("#hover-popover")?.classList.contains("visible"));
        assert.equal(await island.locator("body").getAttribute("data-island-mode"), "focus");
        assert.equal(await island.locator("#hover-popover .popover-metric").count(),3);
        await island.waitForTimeout(400);
        await island.screenshot({path:join(directory,"web-hover.png")});
        const geometry = await island.locator("[data-island-model]").first().boundingBox();
        assert.equal(geometry.height, 72, "Model single-ring node must keep a fixed height");
        assert.equal(geometry.y, beforeHover.y, "Hover moved the model node");
        assert.equal(await island.locator("[data-island-model] .ring-value").count(),2);
        assert.equal(await island.locator("#hover-popover .ring-value").count(),0);
        assert.equal(await island.locator(".island-values").count(),0);
        const popup = await island.locator("#hover-popover").boundingBox();
        assert.ok(popup.y >= 0 && popup.y + popup.height <= 420, "History is clipped by the native-sized viewport");
        assert.equal(await island.locator("#island-focus .ring-value").count(), 3);
        await island.waitForFunction(() => { const el = document.querySelector("#island-models"); return el.inert && getComputedStyle(el).opacity === "0"; });
        for (const metric of ["quality", "cache", "ttft"]) {
          await island.locator(`[data-focus-metric="${metric}"]`).hover();
          assert.equal(await island.locator(`[data-focus-metric="${metric}"] .ring-metric`).evaluate(el => el.classList.contains("is-hovered")), true, `${metric}: focused metric did not respond to pointer`);
        }
        await island.screenshot({path:join(directory,"web-island-focus.png")});
        await island.waitForTimeout(1200);
        assert.equal(await island.locator("#hover-popover").evaluate(el => el.classList.contains("visible")), true, "Stationary hover collapsed");
        await island.mouse.move(rail.x + 3, geometry.y + geometry.height / 2);
        await island.waitForTimeout(350);
        assert.equal(await island.locator("body").getAttribute("data-island-mode"), "normal", "Border did not leave focus");
        assert.equal(await island.locator("#island-models").evaluate(el => el.inert), false);
        const idleModel = await island.locator('[data-island-model]').nth(1).boundingBox();
        await island.mouse.move(idleModel.x + idleModel.width / 2, idleModel.y + idleModel.height / 2);
        await island.waitForTimeout(400);
        assert.equal(await island.locator('body').getAttribute('data-island-mode'), 'focus');
        assert.ok((await island.locator('#hover-popover').innerText()).includes('idle-fixture'));
        await island.mouse.move(rail.x + 3, geometry.y + geometry.height / 2);
        await island.waitForTimeout(350);
        assert.equal(await island.evaluate(() => window.testRingNodes.every((node, i) =>
          node === document.querySelectorAll('[data-island-model]')[i])), true, 'Hover recreated model nodes');
        await island.mouse.move(beforeHover.x + beforeHover.width / 2, beforeHover.y + beforeHover.height / 2);
        await island.waitForTimeout(400);
        await island.mouse.move(rail.x + 3, geometry.y + geometry.height / 2);
        await island.mouse.move(popup.x + popup.width / 2, popup.y + popup.height / 2);
        await island.waitForTimeout(350);
        assert.equal(await island.locator("#hover-popover").evaluate(el => el.classList.contains("visible")), true, "History cannot be entered");
        await island.mouse.move(200, 10);
        await island.waitForTimeout(700);
        await island.evaluate(() => window.modivue.setIslandSide("left"));
        const leftModel = await island.locator("[data-island-model]").first().boundingBox();
        await island.mouse.move(leftModel.x + leftModel.width / 2, leftModel.y + leftModel.height / 2);
        assert.equal(await island.locator('body').getAttribute('data-island-mode'), 'normal', 'Compact entry must reveal the model rail first');
        await island.waitForFunction(() => document.body.dataset.islandMode === 'focus');
        await island.waitForTimeout(400);
        const leftPopup = await island.locator("#hover-popover").boundingBox();
        assert.ok(leftPopup.x >= 0 && leftPopup.x + leftPopup.width <= 570 && leftPopup.y + leftPopup.height <= 420);
        await island.screenshot({path:join(directory,"web-hover-left.png")});
        islandAgents.agents.forEach(agent => { agent.status = "idle"; agent.displayStatus = "idle"; });
        await island.reload();
        await island.waitForFunction(() => document.querySelectorAll('[data-island-model]').length === 2);
        await island.locator(".island-empty").waitFor();
        assert.equal(await island.locator('[data-island-model][aria-hidden="false"]').count(), 0);
        const idleRail = await island.locator("#quick-island").boundingBox();
        await island.mouse.move(idleRail.x + 3, idleRail.y + 20);
        await island.waitForTimeout(350);
        assert.equal(await island.locator('[data-island-model][aria-hidden="false"]').count(), 2, "Attended island must reveal idle model quadruples");
        assert.equal(await island.locator(".island-empty").isVisible(), false);
        await island.mouse.move(200, 10);
        await island.evaluate(() => window.modivue.nativeFocus(true));
        await island.waitForTimeout(600);
        assert.equal(await island.locator('body').getAttribute('data-island-mode'), 'compact', 'Window focus must not pin the island open');
        assert.equal(await island.locator('.island-empty').isVisible(), true, 'All-idle compact island should show waiting state');
        updateSettings({ islandMaxAgents: 1, islandScrollSpeed: 180 });
        await island.reload();
        await island.waitForFunction(() => document.querySelectorAll('[data-island-model]').length === 2);
        const limitedRail = await island.locator('#quick-island').boundingBox();
        await island.mouse.move(limitedRail.x + 3, limitedRail.y + 20);
        await island.waitForTimeout(450);
        assert.equal(Math.round((await island.locator('.island-stage').boundingBox()).height),79);
        const limitedList = await island.locator('#island-models').boundingBox();
        await island.mouse.move(limitedList.x + limitedList.width / 2, limitedList.y + limitedList.height - 3);
        await island.waitForTimeout(650);
        assert.ok(await island.locator('#island-models').evaluate(el => el.scrollTop > 65), 'Bottom edge did not scroll');
        await island.mouse.move(limitedList.x + limitedList.width / 2, limitedList.y + 3);
        await island.waitForTimeout(650);
        assert.equal(await island.locator('#island-models').evaluate(el => el.scrollTop),0, 'Top edge did not scroll back');
        await island.mouse.move(limitedRail.x + 3, limitedRail.y + 20);
        await island.screenshot({path:join(directory,'web-island-one-slot.png')});
        checks.push({name:'island-height-limit-and-edge-scroll',status:'PASS'});
        assert.deepEqual(errors,[]);
        checks.push({name:"browser-real-metrics-and-settings",status:"PASS"},{name:"browser-compact-normal-focus-transitions",status:"PASS"},{name:"browser-console",status:"PASS",evidence:errors});
      } catch (error) {
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
          await page.screenshot({path:join(directory,'web-failure.png')}).catch(() => {});
          await writeFile(join(directory, 'web-failure.json'), JSON.stringify(await page.evaluate(() => ({
            title: document.querySelector('#page-title')?.textContent,
            toast: document.querySelector('#toast')?.textContent,
            calibration: document.querySelector('#calibration-message')?.textContent,
            invalid: [...document.querySelectorAll(':invalid')].map(node => node.name).filter(Boolean)
          })), null, 2));
        }
        throw error;
      } finally { await browser.close(); }
    }
    const { saveCalibration } = await import("../../src/core/calibration.mjs");
    const { runTargetVerification, probePauseReason } = await import("../../src/core/probe.mjs");
    const { listQualityRuns, listSamples, probeUsageToday, saveQualityRun } = await import("../../src/core/storage.mjs");
    const { listQuestions, saveQuestion, deleteQuestion } = await import("../../src/core/storage.mjs");
    const { summarizeVerification } = await import("../../src/core/quality-summary.js");
    const calibration = {version:2,source:"isolated-runtime",models:{"integration-fixture":{
      revision:"runtime1",reasoningEffort:null,maxOutputTokens:32,
      probability:{cells:[{prompt:"Choose a token.",distribution:{ok:1}}],repetitions:16,temperature:1,maxJsd:0.1},
      juice:{prompt:"Report the test value.",min:32,max:32}
    }}};
    await saveCalibration(calibration);
    const target = {id:"fixture",protocol:"openai",wireApi:"responses",baseUrl:process.env.MODIVUE_OPENAI_UPSTREAM,
      apiKey:"modivue-test-only",keyGroup:sample.key_group,observedModel:"integration-fixture",authHeader:"authorization"};
    const question = saveQuestion({ title: 'Runtime question', prompt: 'Reply ok.', answer: 'ok', match: 'exact' });
    const questionRun = await runTargetVerification(target, 'custom-question', () => true, { questionId: question.id });
    assert.equal(questionRun.metadata.matched, true);
    assert.equal(questionRun.metadata.actual, 'ok');
    assert.equal(questionRun.metadata.requests.length, 1);
    assert.equal(questionRun.metadata.verdict, 'inconclusive');
    saveQuestion({ ...question, answer: 'different' });
    assert.equal(listQuestions().find(item => item.id === question.id).answer, 'different');
    deleteQuestion(question.id);
    assert.equal(listQuestions().some(item => item.id === question.id), false);
    assert.throws(() => saveQuestion({ title: '', prompt: '', answer: '' }));
    assert.throws(() => updateSettings({ cacheWarningScore: 90, cacheGoodScore: 80 }));
    assert.throws(() => updateSettings({ focusShowQuality: false, focusShowCache: false, focusShowTtft: false }));
    checks.push({ name: 'custom-question-persistence-metered-run-and-settings-validation', status: 'PASS' });
    const busy = [{ ...target, runtimeStatus: "active", model: "different-model", reasoningEffort: "high" }];
    assert.ok(probePauseReason({ ...target, reasoningEffort: "low" }, busy));
    assert.equal(probePauseReason({ ...target, keyGroup: "other-credential" }, busy), null);
    assert.equal(probePauseReason(target, [{ ...busy[0], runtimeStatus: "idle" }]), null);
    const idleConnection = { ...target, model: target.observedModel, runtimeStatus: 'idle', sessionId: 'paused-fixture',
      lastActiveAt: new Date(Date.now() - 10000).toISOString(), idleSince: new Date(Date.now() - 10000).toISOString() };
    const sessionTarget = { ...target, sessionId: idleConnection.sessionId };
    assert.equal(probePauseReason(sessionTarget, [idleConnection]), null);
    assert.ok(probePauseReason(sessionTarget, [{ ...idleConnection, runtimeStatus: 'active' }]));
    assert.ok(probePauseReason(sessionTarget, [{ ...idleConnection, idleSince: new Date(Date.now() - 16 * 60000).toISOString() }]));
    assert.ok(probePauseReason(sessionTarget, [{ ...idleConnection, model: 'switched-model' }]));
    assert.ok(probePauseReason(sessionTarget, []));
    assert.equal(probePauseReason({ ...sessionTarget, probeStrategy: 'adaptive' }, [{ ...idleConnection, runtimeStatus: 'active' }]), null);
    assert.equal(probePauseReason({ ...sessionTarget, probeStrategy: 'adaptive' }, [{ ...idleConnection, idleSince: new Date(Date.now() - 3600000).toISOString() }]), null);
    assert.ok(probePauseReason({ ...sessionTarget, probeStrategy: 'adaptive' }, [{ ...idleConnection, model: 'switched-model' }]));
    assert.ok(probePauseReason({ ...sessionTarget, probeStrategy: 'adaptive' }, []));
    checks.push({ name: "adaptive-working-and-idle-eligibility", status: "PASS" });
    checks.push({ name: "same-credential-foreground-priority", status: "PASS" });
    const beforeCalls = upstreamCalls;
    const beforeUsage = probeUsageToday().requests;
    const beforeProbeSamples = listSamples({ hours: 1, source: "probe" }).length;
    const distribution = await runTargetVerification(target,"probability-probe");
    updateSettings({ juiceMode: "calibrated" });
    const juice = await runTargetVerification(target,"juice");
    assert.equal(distribution.metadata.jsd,0);
    assert.equal(distribution.score,null);
    assert.equal(distribution.metadata.sampleCount,16);
    assert.equal(juice.metadata.reportedJuice,32);
    assert.equal(juice.score,null);
    assert.equal(upstreamCalls-beforeCalls,17);
    assert.equal(probeUsageToday().requests - beforeUsage,17);
    assert.equal(listSamples({hours:1,source:"probe"}).length - beforeProbeSamples,17);
    assert.ok(listSamples({hours:1,source:"probe"}).every(row=>row.ttft_ms > 0 && row.cache_hit_rate === 0.6 && row.total_duration_ms > 0));
    assert.equal(summarizeVerification(listQualityRuns({hours:1}), "probability-probe").verdict,"consistent");
    assert.equal(summarizeVerification(listQualityRuns({hours:1}), "juice").verdict,"consistent");
    const missing = await runTargetVerification({...target,observedModel:"unreferenced"},"juice");
    assert.equal(missing.status,"unsupported");
    assert.equal((await runTargetVerification({...target,observedModel:'unreferenced'}, 'probability-probe')).status, 'unsupported');
    assert.equal(upstreamCalls-beforeCalls,17,"Missing baseline sent a paid request");
    updateSettings({ juiceMode: "raw" });
    const rawJuice = await runTargetVerification({ ...target, observedModel: "unreferenced" }, "juice");
    assert.equal(rawJuice.status, "ok");
    assert.equal(rawJuice.metadata.reportedJuice, 32);
    assert.equal(rawJuice.metadata.attempts, 1);
    assert.equal(rawJuice.metadata.verdict, "inconclusive");
    assert.equal(upstreamCalls - beforeCalls, 18, "Raw Juice must send exactly one request without calibration");
    assert.equal(summarizeVerification(listQualityRuns({ hours: 1, model: "unreferenced" }), "juice").numeric.value, 32);
    checks.push({ name: "juice-raw-single-request-without-calibration", status: "PASS" });
    updateSettings({ juiceMode: "calibrated" });
    failUpstream = true;
    const failed = await runTargetVerification(target,"juice");
    assert.equal(failed.status,"error");
    assert.equal(summarizeVerification(listQualityRuns({hours:1,model:"integration-fixture"}), "juice").verdict,"inconclusive");
    checks.push({name:"verification-raw-evidence-and-cost-accounting",status:"PASS",evidence:{requests:17,jsd:0,juice:32,compositeScore:null}},
      {name:"missing-baseline-no-request-and-failure-invalidates-verdict",status:"PASS"});
    failUpstream = false;
    const { probeTargets, probeState, runProbeBatch, requestTargetVerification } = await import("../../src/core/probe.mjs");
    process.env.MODIVUE_PROBE_OPENAI_KEY = target.apiKey;
    process.env.MODIVUE_PROBE_OPENAI_MODEL = target.observedModel;
    process.env.MODIVUE_PROBE_OPENAI_API = "responses";
    const liveTarget = (await probeTargets()).find(item => item.observedModel === target.observedModel);
    const beforeQueued = upstreamCalls;
    const queued = await requestTargetVerification({ ...liveTarget, pauseReason: "等待本轮工作结束" }, "juice");
    assert.equal(queued.status, "queued");
    await requestTargetVerification({ ...liveTarget, pauseReason: "等待本轮工作结束" }, "juice");
    assert.equal((await probeState()).verification.filter(item => item.targetId === liveTarget.id).length, 1);
    assert.equal(upstreamCalls, beforeQueued);
    await runProbeBatch();
    assert.equal(upstreamCalls, beforeQueued + 1, "Manual queue should execute with automatic probing disabled");
    const acknowledged = await fetch(`${base}/api/quality/run`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...liveTarget, apiKey: undefined, evaluatorId: "juice" }) });
    assert.equal(acknowledged.status, 202);
    assert.ok(["running", "queued"].includes((await acknowledged.json()).status));
    while ((await probeState()).verification.length) await new Promise(resolve => setTimeout(resolve, 30));
    checks.push({ name: "manual-verification-202-queue-dedup-and-auto-disabled", status: "PASS" });
    delete process.env.MODIVUE_PROBE_OPENAI_KEY;
    delete process.env.MODIVUE_PROBE_OPENAI_MODEL;
    delete process.env.MODIVUE_PROBE_OPENAI_API;
    const { readCalibration } = await import("../../src/core/calibration.mjs");
    const beforeTrusted = await readCalibration();
    const collect = async preview => {
      const response = await fetch(`${base}/api/iq/calibration/collect`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: target.baseUrl, apiKey: target.apiKey, model: "trusted-fixture", wireApi: "responses",
          prompt: "Choose a token.", maxOutputTokens: 32, reasoningEffort: "low", repetitions: 16, preview }) });
      assert.equal(response.status, 202);
      let state;
      do { state = await (await fetch(`${base}/api/iq/calibration/collect`)).json(); if (state.status === "running") await new Promise(resolve => setTimeout(resolve, 50)); } while (state.status === "running");
      assert.equal(state.status, "complete", state.message);
      assert.equal(JSON.stringify(state).includes(target.apiKey), false);
      return state;
    };
    assert.equal((await collect(true)).completed, 2);
    assert.deepEqual(await readCalibration(), beforeTrusted, "Preview must preserve calibration");
    const trusted = await collect(false);
    assert.equal(trusted.completed, 16);
    const savedTrusted = (await readCalibration()).models["trusted-fixture"];
    assert.deepEqual(savedTrusted.probability.cells[0].distribution, { ok: 1 });
    assert.equal(savedTrusted.probability.maxJsd, null);
    assert.equal(savedTrusted.reasoningEffort, "low");
    await saveCalibration(beforeTrusted);
    checks.push({ name: "trusted-api-preview-and-reference-collection", status: "PASS", evidence: { preview: 2, reference: 16, identityThreshold: null } });
    const beforeHLWYUsage = probeUsageToday().requests;
    const referenceResponse = await fetch(`${base}/api/iq/calibration/collect`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "hlwy", baseUrl: target.baseUrl, apiKey: target.apiKey,
        model: "trusted-hlwy-fixture", wireApi: "responses", reasoningEffort: "low", repetitions: 50 }) });
    assert.equal(referenceResponse.status, 202);
    let referenceJob;
    do {
      referenceJob = await (await fetch(`${base}/api/iq/calibration/collect`)).json();
      if (referenceJob.status === "running") await new Promise(resolve => setTimeout(resolve, 100));
    } while (referenceJob.status === "running");
    assert.equal(referenceJob.status, "complete", referenceJob.message);
    assert.equal(referenceJob.completed, 50);
    assert.equal(JSON.stringify(referenceJob).includes(target.apiKey), false);
    const sourceSetting = await fetch(`${base}/api/settings`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ hlwySource: "trustedApi", verificationSamples: 50 }) });
    assert.equal((await sourceSetting.json()).settings.hlwySource, "trustedApi");
    const hlwyRun = await runTargetVerification({ ...target, observedModel: "trusted-hlwy-fixture", reasoningEffort: "low" }, "hlwy-fingerprint");
    assert.equal(hlwyRun.status, "ok", hlwyRun.rationale);
    assert.equal(hlwyRun.metadata.sourceMode, "trustedApi");
    assert.equal(hlwyRun.metadata.requestedSource, "trustedApi");
    assert.equal(hlwyRun.metadata.sampleCount, 50);
    assert.equal(hlwyRun.metadata.value, 100);
    assert.equal(hlwyRun.metadata.requests.length, 50);
    assert.equal(probeUsageToday().requests - beforeHLWYUsage, 100);
    assert.equal(hlwyRequests.length, 100);
    assert.ok(hlwyRequests.every(request => request.temperature === 1 && request.reasoning.effort === "low"
      && request.max_output_tokens === 256 && request.input === hlwyPrompt));
    await saveCalibration(beforeTrusted);
    updateSettings({ hlwySource: "public" });
    checks.push({ name: "hlwy-trusted-reference-to-target-metered-comparison", status: "PASS",
      evidence: { reference: 50, target: 50, match: 100, source: "local-controlled-upstream", paidRequests: 0 } });
    const { runEvaluator } = await import('../../src/core/quality.mjs');
    let attempts = 0;
    const paused = await runEvaluator('probability-probe', { ...target, request: async () => {
      if (++attempts === 4) throw Object.assign(new Error('Foreground turn started'), { code: 'target_inactive' });
      return 'ok';
    }});
    assert.equal(paused.status, 'paused');
    assert.equal(paused.metadata.sampleCount, 3, 'Mid-cell pause discarded valid samples');
    assert.deepEqual(Object.entries(paused.metadata.observations[0].counts), [['ok', 3]]);
    let reserved;
    let resumedCalls = 0;
    const resumed = await runEvaluator('probability-probe', { ...target,
      previousRun: { ...paused, id: 123, evaluator_version: paused.evaluatorVersion },
      requireBudget: count => { reserved = count; }, request: async () => { resumedCalls++; return 'ok'; } });
    assert.equal(resumed.status, 'ok');
    assert.equal(resumedCalls, 13);
    assert.equal(reserved, 20);
    assert.equal(resumed.metadata.attempts, 17);
    assert.equal(resumed.metadata.observations[0].attempts, 17);
    assert.equal(resumed.metadata.continuedFrom, 123);
    assert.equal(resumed.metadata.jsd, 0);
    checks.push({ name: 'idle-window-and-mid-cell-resumption', status: 'PASS', evidence: { saved: 3, resumed: 13, attempts: 17 } });
    const { default: meowBaseline } = await import('../../src/data/meow-gpt.json', { with: { type: 'json' } });
    const meowTarget = { ...target, observedModel: meowBaseline.models.find(model => !model.reference_only).id, meowTier: 'low' };
    attempts = 0;
    const pausedMeow = await runEvaluator('meow-fingerprint', { ...meowTarget, request: async () => {
      if (++attempts === 4) throw Object.assign(new Error('Foreground turn started'), { code: 'target_inactive' });
      return 'test-answer';
    } });
    assert.equal(pausedMeow.status, 'paused');
    assert.equal(pausedMeow.metadata.sampleCount, 3);
    resumedCalls = 0;
    const resumedMeow = await runEvaluator('meow-fingerprint', { ...meowTarget,
      previousRun: { ...pausedMeow, id: 124, evaluator_version: pausedMeow.evaluatorVersion },
      requireBudget: count => { reserved = count; }, request: async () => { resumedCalls++; return 'test-answer'; } });
    const remainingMeow = pausedMeow.metadata.plannedSamples - 3;
    assert.equal(resumedMeow.status, 'ok');
    assert.equal(resumedCalls, remainingMeow);
    assert.equal(reserved, remainingMeow + Math.ceil(remainingMeow / 2));
    assert.equal(resumedMeow.metadata.sampleCount, pausedMeow.metadata.plannedSamples);
    assert.equal(resumedMeow.metadata.attempts, resumedCalls + 4);
    assert.equal(resumedMeow.metadata.failures.length, 1);
    checks.push({ name: 'meow-pause-preserves-samples-and-resumes-remaining', status: 'PASS' });
    // Exercise historical enrichment through storage and HTTP, with the old
    // report shape that predates feature-hit and reference presentation fields.
    const historicalMetadata = structuredClone(resumedMeow.metadata);
    historicalMetadata.candidateDistribution = historicalMetadata.candidateDistribution.map(({ featureHitCount, featureHitRatio, ...candidate }) => candidate);
    historicalMetadata.observations = historicalMetadata.observations.map(({ reference, referenceKind, referenceModel, ...observation }) => observation);
    const historicalId = Number(saveQualityRun({ ...meowTarget, ...resumedMeow, metadata: historicalMetadata }).lastInsertRowid);
    const reportsResponse = await fetch(`${base}/api/quality/runs?hours=0&model=${encodeURIComponent(meowTarget.observedModel)}`);
    assert.equal(reportsResponse.status, 200);
    const reports = await reportsResponse.json();
    for (const section of ["runs", "history", "latest"]) {
      const historical = reports[section].find(run => run.id === historicalId);
      assert.ok(historical, `Missing historical report in ${section}`);
      assert.deepEqual(historical.metadata, JSON.parse(JSON.stringify(historicalMetadata)), "HTTP report changed raw stored evidence");
      assert.deepEqual(historical.reportDetails.candidateDistribution.map(({ featureHitCount, featureHitRatio, ...candidate }) => candidate),
        historicalMetadata.candidateDistribution, "Enrichment changed original candidate scores");
      assert.deepEqual(historical.reportDetails.candidateDistribution, resumedMeow.metadata.candidateDistribution);
      assert.ok(historical.reportDetails.observations.every(cell => cell.referenceKind === "fitted-predictive"
        && Object.values(cell.reference).every(value => Number.isFinite(value) && value >= 0)
        && Math.abs(Object.values(cell.reference).reduce((sum, value) => sum + value, 0) - 1) < 1e-10));
    }
    assert.deepEqual(listQualityRuns({ hours: 0, model: meowTarget.observedModel }).find(run => run.id === historicalId).metadata,
      JSON.parse(JSON.stringify(historicalMetadata)), "Report reads must not rewrite stored evidence");
    checks.push({ name: 'quality-runs-api-enriches-historical-meow-without-changing-scores', status: 'PASS' });
    let screeningCalls = 0;
    const screening = await runEvaluator('meow-fingerprint', { ...meowTarget, meowTier: 'screen',
      request: async () => { screeningCalls++; return 'test-answer'; } });
    assert.equal(screeningCalls, 6);
    assert.equal(screening.metadata.plannedSamples, 6);
    assert.equal(screening.metadata.verdict, 'inconclusive');
    assert.ok(screening.metadata.reasons.includes('uncalibrated'));
    checks.push({ name: 'meow-screen-six-samples-without-strong-verdict', status: 'PASS' });
    const beforePassive = listSamples({ hours: 0 }).length;
    const passive = { host: 'codex', sessionId: 'passive-fixture', model: 'passive-fixture',
      protocol: 'openai', baseUrl: target.baseUrl, keyGroup: target.keyGroup, metadata: { reasoningEffort: 'high' },
      passiveMetrics: { eventId: 'fixture-1', observedAt: new Date().toISOString(),
        rawUsage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 2 } } };
    savePassiveObservation(passive);
    savePassiveObservation(passive);
    assert.equal(listSamples({ hours: 0 }).length, beforePassive + 1);
    passive.passiveMetrics = { ...passive.passiveMetrics, eventId: 'fixture-2',
      rawUsage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 2 } };
    savePassiveObservation(passive);
    const passiveRows = listSamples({ hours: 0, model: 'passive-fixture', reasoningEffort: 'high' });
    assert.equal(passiveRows.length, 2);
    assert.deepEqual(passiveRows.map(row => row.cache_hit_rate), [.4, .8]);
    assert.ok(passiveRows.every(row => row.ttft_ms === null && row.duration_ms === null && row.source === 'codex-rollout'));
    checks.push({ name: 'passive-cache-history-deduplicates-events-without-fake-ttft', status: 'PASS' });
    return checks;
  } finally {
    for (const item of [server,upstream]) if(item) { item.closeAllConnections(); await new Promise(resolve=>item.close(resolve)); }
  }
}
