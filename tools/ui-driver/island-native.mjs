import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Uses only the test-owned native instance and its isolated settings database.
export async function runNativeIslandChecks({ driver, pid, directory, check }) {
  const runtime = JSON.parse(await readFile(join(directory, 'runtime.json'), 'utf8'));
  const geometry = async () => JSON.parse(await readFile(join(directory, 'native-geometry.json'), 'utf8'));
  const frame = async () => (await driver('windows', pid)).find(w => w.kCGWindowLayer === 3)?.kCGWindowBounds;
  const until = async (predicate, label) => {
    for (let attempt = 0; attempt < 50; attempt++) { const value = await geometry(); if (predicate(value)) return value; await delay(100); }
    throw new Error(`${label}: ${JSON.stringify(await geometry())}`);
  };
  const at = (f, r) => [f.X + r.x + r.width / 2, f.Y + r.y + r.height / 2];
  const press = async (pattern, description = false) => {
    let ax, row;
    for (let attempt = 0; attempt < 30; attempt++) {
      ax = await driver('elements', pid);
      row = ax.find(r => !['AXStaticText', 'AXGroup', 'AXWindow'].includes(r.AXRole) && pattern.test(description ? r.AXDescription || '' : r.AXTitle || r.AXValue || r.AXDescription || ''));
      if (row) break;
      await delay(200);
    }
    if (!row) await writeFile(join(directory, 'missing-control-ax.json'), JSON.stringify(ax, null, 2));
    assert.ok(row, `Missing native control ${pattern}`);
    if (row.position && row.size?.height > 0) await driver('click', row.position.x + row.size.width / 2, row.position.y + row.size.height / 2);
    else await driver('press', pid, row.path);
    await delay(600);
  };
  await until(g => g.models.length > 0, 'Agent discovery');
  await driver('move', 100, 100);
  let silent = await until(g => g.islandMode === 'compact', 'Silent state');
  // Keep the island clear of other Modivue instances at the right screen edge.
  const window = (await driver('elements', pid)).find(r => r.AXRole === 'AXWindow' && r.size?.width < 800);
  assert.ok(window, 'Island AX window');
  await driver('position', pid, window.path, 650, 140); await delay(500);
  silent = await geometry();
  const before = await frame();
  await driver('activate', 'com.apple.finder');
  await driver('move', before.X + silent.rail.x + 3, before.Y + silent.rail.y + 25);
  const normal = await until(g => g.islandMode === 'normal', 'Unfocused Silent→Normal');
  check('native-unfocused-silent-normal', normal.windowKey === false, normal.windowKey);
  const normalFrame = await frame();
  const oldRing = silent.models.find(m => m.visible)?.ring;
  const first = normal.models.find(m => m.visible);
  if (oldRing && first) check('native-silent-normal-ring-screen-position',
    Math.abs(before.X + oldRing.x - normalFrame.X - first.ring.x) < 1
    && Math.abs(before.Y + oldRing.y - normalFrame.Y - first.ring.y) < 1, { before, normalFrame, oldRing, ring: first.ring });
  await driver('move', ...at(normalFrame, first.ring));
  const focused = await until(g => g.islandMode === 'focus' && g.popover, 'Unfocused Normal→Focus');
  await delay(600);
  const settled = await geometry();
  check('native-unfocused-normal-focus', focused.windowKey === false);
  check('native-adaptive-focus-contains-rings', settled.focusRects.every(r => r.y >= settled.rail.y && r.bottom <= settled.rail.bottom + 1), settled);
  await driver('screenshot', join(directory, 'native-unfocused-focus.png'));
  await driver('move', 100, 100);
  await until(g => g.islandMode === 'compact', 'Native leave collapse');
  check('native-leave-without-focus-collapses', true);
  // Open Settings through the real operation rod, then use the visual resizer.
  const compactFrame = await frame(); const compact = await geometry();
  await driver('move', compactFrame.X + compact.rail.x + 3, compactFrame.Y + compact.rail.y + 25);
  await until(g => g.islandMode === 'normal', 'Show controls');
  await press(/打开详细窗口|Open dashboard/, true);
  for (let i = 0; i < 100; i++) {
    const main = JSON.parse(await readFile(join(directory, 'main-geometry.json'), 'utf8'));
    if (main.mainReady) break;
    await delay(100);
  }
  await driver('activate', pid);
  await press(/ 设置$| Settings$/);
  await press(/^交互$|^Interaction$/);
  for (const axis of ['width', 'height']) {
    await driver('activate', pid);
    const dashboard = (await driver('elements', pid)).find(row => row.AXRole === 'AXWindow' && row.size?.width > 800);
    assert.ok(dashboard, 'Dashboard window for resize settings');
    await driver('raise', pid, dashboard.path);
    await delay(300);
    await press(/打开灵动岛调节|Open island resizer/);
    const ready = await until(g => g.resizeMode && g.islandMode === 'normal', 'Enter resize mode');
    await delay(500);
    const start = await geometry(); const f = await frame();
    const handle = axis === 'width' ? start.buffer : start.grip;
    const [x, y] = at(f, handle);
    const beforeScale = (await (await fetch(`${runtime.base}/api/settings`)).json()).settings.islandScale;
    const dx = axis === 'width' ? (start.islandSide === 'left' ? 12 : -12) : 0;
    const dy = axis === 'height' ? -15 : 0;
    // Drag starts immediately, with no 500 ms hold.
    await driver('drag', x, y, x + dx, y + dy);
    await until(g => !g.resizeMode && g.dragPhase !== 'resizing', 'Finish resize');
    await delay(700);
    const afterScale = (await (await fetch(`${runtime.base}/api/settings`)).json()).settings.islandScale;
    check(`native-immediate-${axis}-resize-persists-scale`, afterScale > beforeScale, { beforeScale, afterScale, ready });
  }
  await writeFile(join(directory, 'native-island-final.json'), JSON.stringify(await geometry(), null, 2));
}
