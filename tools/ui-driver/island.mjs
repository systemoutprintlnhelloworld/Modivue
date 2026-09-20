import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Isolated rendering/bridge contract checks. No production settings or model requests.
export async function runIslandTest(directory) {
  process.env.MODIVUE_DB = join(directory, 'island.sqlite');
  process.env.MODIVUE_DATA_DIR = directory;
  process.env.MODIVUE_UI_ARTIFACTS = directory;
  const { handleRequest } = await import('../../server.mjs');
  const { updateSettings } = await import('../../src/core/storage.mjs');
  const { chromium } = await import('playwright-core');
  updateSettings({ probeEnabled: false, islandTourSeen: true, mainTourSeen: true, locale: 'zh-CN', focusShowBalance: true });
  const server = createServer(handleRequest).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const checks = [], evidence = [], errors = [];
  const check = (name, valid, detail) => { assert.ok(valid, `${name}: ${JSON.stringify(detail)}`); checks.push({ name, status: 'PASS' }); };
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  let count = 1, working = 1, cache = .99;
  const agents = () => Array.from({ length: count }, (_, i) => ({ id: `codex:island-${i}`, sessionId: `island-${i}`,
    host: 'codex', label: 'Codex', status: i < working ? 'active' : 'idle', protocol: 'openai',
    model: `island-fixture-${i}`, baseUrl: 'http://127.0.0.1:1', keyGroup: 'island-only',
    passiveMetrics: { cacheHitRate: cache, inputTokens: 100, cacheReadTokens: cache * 100, ttftMs: 120,
      observedAt: new Date().toISOString(), source: 'isolated-render-check' } }));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/agents', route => route.fulfill({ json: { agents: agents(), supportedAgents: [] } }));
  await page.route('**/api/updates*', route => route.fulfill({ json: {} }));
  await page.route('**/api/model-catalog*', route => route.fulfill({ json: { models: [] } }));
  await page.route('**/api/balances', route => route.fulfill({ json: { balances: [] } }));
  const layout = () => page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    return { mode: document.body.dataset.islandMode, scale: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#quick-island')).transform).a,
      rail: rect('#quick-island'), grip: rect('#island-expand'), buffer: rect('#island-buffer'), settings: rect('#island-settings'),
      ring: rect('#island-models .metric-rings'), idle: rect('.island-idle-glyph'),
      focus: [...document.querySelectorAll('#island-focus .metric-rings')].map(el => el.getBoundingClientRect().toJSON()) };
  });
  const contained = (outer, inner) => inner && inner.x >= outer.x - .6 && inner.right <= outer.right + .6
    && inner.y >= outer.y - .6 && inner.bottom <= outer.bottom + .6;
  const leave = async () => {
    // Both AppKit's null notifications and Win32's repeated outside coordinates.
    for (let i = 0; i < 9; i++) { await page.evaluate(() => window.modivue.nativeHover(null)); await page.waitForTimeout(80); }
    await page.waitForTimeout(450);
  };
  try {
    for (const scenario of [{ count: 0, working: 0 }, { count: 1, working: 0 }, { count: 1, working: 1 }, { count: 3, working: 2 }, { count: 8, working: 2 }]) {
      ({ count, working } = scenario);
      for (const scale of [10, 50, 100, 150, 200]) {
        updateSettings({ islandScale: scale, islandColorMode: 'metric' });
        await page.goto(`${base}/?desktop=island`);
        await page.waitForFunction(n => document.querySelectorAll('[data-island-model]').length === n, count);
        await page.waitForTimeout(600);
        await page.evaluate(() => window.modivue.nativeFocus(false));
        const silent = await layout();
        await page.evaluate(() => window.modivue.showAllAgents());
        await page.waitForTimeout(500);
        const normal = await layout();
        const name = `${count}-targets-${working}-active-${scale}-percent`;
        check(`${name}-controls-contained`, [normal.grip, normal.buffer, normal.settings].every(r => contained(normal.rail, r)), normal);
        check(`${name}-natural-height`, Math.abs(normal.rail.height / normal.scale - (Math.max(1, Math.min(count, 5)) * 79 + 70)) < 1, normal);
        if (working) check(`${name}-silent-normal-same-position`, Math.abs(silent.ring.x - normal.ring.x) < .6 && Math.abs(silent.ring.y - normal.ring.y) < .6, { silent, normal });
        else if (count) check(`${name}-idle-center`, Math.abs(silent.idle.x + silent.idle.width / 2 - normal.ring.x - normal.ring.width / 2) < .6
          && Math.abs(silent.idle.y + silent.idle.height / 2 - normal.ring.y - normal.ring.height / 2) < .6, { silent, normal });
        if (count) {
          // Native polling must work even when the app does not have focus.
          const x = normal.ring.x + normal.ring.width / 2, y = normal.ring.y + normal.ring.height / 2;
          for (let i = 0; i < 9; i++) {
            await page.evaluate(({ x, y }) => window.modivue.nativeHover({ clientX: x, clientY: y, screenX: x, screenY: y }), { x, y });
            await page.waitForTimeout(80);
          }
          await page.waitForTimeout(500);
          const focus = await layout();
          check(`${name}-unfocused-hover-enters-focus`, focus.mode === 'focus', focus);
          check(`${name}-all-focus-rings-contained`, focus.focus.every(r => contained(focus.rail, r)), focus);
          await leave();
          check(`${name}-repeated-native-leave-collapses`, (await layout()).mode === 'compact');
        }
        evidence.push({ scenario, scale, silent, normal });
      }
    }
    count = working = 1;
    updateSettings({ islandScale: 100 });
    await page.goto(`${base}/?desktop=island&resize=1`);
    await page.waitForTimeout(600);
    check('resize-opens-normal-without-tour', await page.evaluate(() => document.body.dataset.islandMode === 'normal' && !document.querySelector('.spotlight-tour')));
    const original = await layout();
    await page.evaluate(() => { window.modivue.nativeResize('started', true); window.modivue.nativeResizePreview(150); });
    await page.waitForTimeout(300);
    const preview = await layout();
    for (const key of ['rail', 'grip', 'buffer', 'ring', 'settings']) {
      check(`resize-scales-${key}`, Math.abs(preview[key].width / original[key].width - 1.5) < .03
        && Math.abs(preview[key].height / original[key].height - 1.5) < .03, { original: original[key], preview: preview[key] });
    }
    await page.waitForTimeout(16000);
    check('settings-poll-does-not-reset-live-scale', Math.abs((await layout()).rail.width - preview.rail.width) < .6);
    await page.evaluate(() => window.modivue.nativeResizeValue({ scale: 150 }));
    check('scale-persists', (await (await fetch(`${base}/api/settings`)).json()).settings.islandScale === 150);
    await page.screenshot({ path: join(directory, 'island-scaled.png') });
    for (const mode of ['metric', 'threshold']) {
      const colors = [];
      for (const value of [.1, .99]) {
        cache = value;
        updateSettings({ islandColorMode: mode });
        await page.goto(`${base}/?desktop=island`);
        await page.waitForFunction(() => document.querySelector("[data-island-model]"));
        await page.waitForTimeout(600);
        await page.evaluate(() => { window.modivue.showAllAgents(); document.querySelector('[data-island-model]').focus(); });
        await page.waitForTimeout(500);
        colors.push(await page.locator('[data-focus-metric="cache"] .ring-metric').evaluate(el => el.style.getPropertyValue('--ring-color')));
      }
      check(`${mode}-color-policy`, mode === 'metric' ? colors[0] === colors[1] : colors[0] !== colors[1], colors);
    }
    await page.screenshot({ path: join(directory, 'island-threshold-focus.png') });
    check('page-errors', errors.length === 0, errors);
    return checks;
  } finally {
    await writeFile(join(directory, 'island-layout-evidence.json'), JSON.stringify({ checks, evidence, errors }, null, 2));
    await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
