import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, open, unlink, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const tasks = new Set(["inspect", "ui", "hover", "drag", "menu", "runtime", "web", "cli"]);
const [task = "ui", mode, jobDirectory] = process.argv.slice(2);
if (!tasks.has(task)) throw new Error("Unknown host test task");
const run = async (file, args, options = {}) => (await exec(file, args, { cwd: root, maxBuffer: 4 * 1024 * 1024, ...options })).stdout;
const herdr = async (...args) => JSON.parse(await run("herdr", args));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

if (mode !== "--worker") {
  if (process.env.HERDR_ENV !== "1") throw new Error("Run this entrypoint inside Herdr");
  const panes = (await herdr("pane", "list")).result.panes;
  const label = ["runtime", "web", "cli"].includes(task) ? "runtime" : "ui-runner";
  await mkdir(join(root, ".ui-artifacts"), { recursive: true });
  const lockPath = join(root, ".ui-artifacts", `${label}.lock`);
  const lock = await open(lockPath, "wx").catch(error => {
    if (error.code === "EEXIST") throw new Error(`${label} already has a submitted job; no command submitted`);
    throw error;
  });
  await lock.writeFile(String(process.pid));
  try {
  let pane = panes.find((p) => p.label === label && p.cwd === root.replace(/\/$/, ""));
  if (!pane) {
    const created = await herdr("tab", "create", "--workspace", process.env.HERDR_WORKSPACE_ID, "--cwd", root, "--label", `modivue-${label}`, "--no-focus");
    pane = created.result.root_pane;
    await herdr("pane", "rename", pane.pane_id, label);
  }
  const info = (await herdr("pane", "process-info", "--pane", pane.pane_id)).result.process_info;
  if (!info.foreground_processes?.length || !info.foreground_processes.every((p) => p.pid === info.shell_pid)) throw new Error(`${label} is busy; no command submitted`);
  const directory = join(root, ".ui-artifacts", `${Date.now()}-${task}`);
  await mkdir(directory, { recursive: true });
  const command = [process.execPath, fileURLToPath(import.meta.url), task, "--worker", directory].map(quote).join(" ");
  await run("herdr", ["pane", "run", pane.pane_id, command]);
  const deadline = Date.now() + 240000;
  let result;
  while (Date.now() < deadline) {
    try { result = JSON.parse(await readFile(join(directory, "result.json"), "utf8")); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await delay(1000);
  }
  if (!result) throw new Error(`Host job timed out; inspect pane ${pane.pane_id}. Do not resubmit while running.`);
  console.log(JSON.stringify({ ...result, directory, pane: pane.pane_id }, null, 2));
  process.exitCode = result.status === "PASS" ? 0 : result.status === "UNTESTED" ? 77 : 1;
  } finally { await lock.close(); await unlink(lockPath); }
} else {
  const checks = [];
  const save = async (name, value) => {
    const target = join(jobDirectory, name);
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, target);
  };
  let pid;
  let ownsApp = false;
  let iceToggle;
  const driver = async (...args) => JSON.parse(await run(join(root, "dist/ui-driver"), args.map(String), { timeout: 45000 }));
  const check = (name, ok, evidence) => { checks.push({ name, status: ok ? "PASS" : "FAIL", evidence }); if (!ok) throw new Error(name); };
  try {
    if (task === "cli") {
      const { runCliTest } = await import("../tools/ui-driver/cli.mjs");
      checks.push(...await runCliTest(jobDirectory));
    } else if (["runtime", "web"].includes(task)) {
      const { runRuntimeTest } = await import("../tools/ui-driver/runtime.mjs");
      checks.push(...await runRuntimeTest(jobDirectory, { browser: task === "web" }));
    } else {
      await mkdir(join(root, "dist"), { recursive: true });
      await run("/usr/bin/swiftc", ["tools/ui-driver/main.swift", "-o", "dist/ui-driver", "-framework", "AppKit", "-framework", "ApplicationServices"]);
      await writeFile(join(jobDirectory, "build.log"), await run("/bin/bash", ["scripts/build-macos-app.sh"]));
      checks.push({name:"app-build",status:"PASS"});
      const permissions = await driver("permissions");
      await save("permissions.json", permissions);
      if (permissions.screenLocked) throw new Error("UNTESTED: macOS is locked; unlock the desktop before native pointer tests");
      if (!permissions.accessibility || !permissions.screenCapture || !permissions.postEvents) throw new Error("UNTESTED: host requires Accessibility, event posting and Screen Recording permissions");
      await driver("move", 100, 100);
      const launched = await driver("launch", join(root, "dist/Modivue.app"), jobDirectory); pid = launched.pid; ownsApp = true;
      await save("launch.json", launched);
      const windows = () => driver("windows", pid);
      let initial = [];
      const isIslandWindow = (window) => window.kCGWindowLayer === 3
        && window.kCGWindowBounds.Width <= 570 && window.kCGWindowBounds.Height > 100;
      for (let i=0;i<30;i++) { initial = await windows(); if (initial.some(isIslandWindow)) break; await delay(500); }
      check("native-launch", initial.some(isIslandWindow), initial);
      await save("activation.json", await driver("activate", pid));
      check("details-closed-on-launch", !initial.some(w => w.kCGWindowBounds.Width > 800), initial);
      let ax = await driver("elements", pid); await save("initial-ax.json", ax);
      await delay(400);
      await driver("screenshot", join(jobDirectory, "initial.png"));
      const ps = await run("/bin/ps", ["-axo", "pid=,ppid=,comm="]);
      const child = ps.split("\n").map(line=>line.trim().split(/\s+/)).find(parts=>Number(parts[1]) === pid && parts.slice(2).join(" ").endsWith("/node"));
      check("app-runtime-child", Boolean(child));
      if (child) {
        const sockets = await run("/usr/sbin/lsof", ["-nP", "-a", "-p", child[0], "-iTCP", "-sTCP:LISTEN", "-Fn"]);
        const address = sockets.match(/n(127\.0\.0\.1:\d+)/)?.[1];
        check("app-localhost", Boolean(address), address);
        const base = `http://${address}`;
        for (const endpoint of ["agents", "summary", "quality/evaluators"]) {
          const response = await fetch(`${base}/api/${endpoint}`, { signal: AbortSignal.timeout(20000) });
          check(`api-${endpoint}`, response.ok, response.status);
          await save(endpoint.replaceAll("/", "-")+".json", await response.json());
        }
        await save("runtime.json", { pid, childPid: Number(child[0]), base });
      }
      const center = row => [row.position.x + row.size.width/2, row.position.y + row.size.height/2];
      if (task === "drag") {
        let open = ax.find(row => row.AXDescription === "打开详细窗口");
        // The native panel can appear a few hundred milliseconds before its
        // WebKit accessibility tree is populated. Wait for the actual
        // control instead of treating that normal load race as UNTESTED.
        for (let attempt = 0; !open && attempt < 20; attempt++) {
          await delay(250);
          ax = await driver("elements", pid);
          open = ax.find(row => row.AXDescription === "打开详细窗口");
        }
        if (!open) throw new Error("UNTESTED: no accessible details trigger");
        await driver("click", ...center(open));
        await delay(1200);
      }
      if (["ui", "hover"].includes(task)) {
        await driver("move", 100, 100); await delay(500);
        ax = await driver("elements", pid);
        let model = ax.find(row=>row.AXDescription?.includes("：核验") && row.position?.x > 0);
        for (let attempt = 0; !model && attempt < 20; attempt++) {
          await delay(250);
          ax = await driver("elements", pid);
          model = ax.find(row=>row.AXDescription?.includes("：核验") && row.position?.x > 0);
        }
        check("runtime-model-node", Boolean(model), model?.AXDescription);
        const geometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
        const panel = (await windows()).find(w=>w.kCGWindowBounds.Width < 800 && w.kCGWindowBounds.Height > 100).kCGWindowBounds;
        const rect = geometry.models[0].rect;
        const modelPoint = [panel.X + rect.x + rect.width/2, panel.Y + rect.y + rect.height/2];
        const moveToModel = async () => {
          const actual = await driver("move", ...modelPoint);
          await save("hover-pointer.json", {model, target: modelPoint, actual});
          if (Math.abs(actual.pointerX - modelPoint[0]) > 3 || Math.abs(actual.pointerY - modelPoint[1]) > 3) {
            throw new Error("UNTESTED: pointer differs from the requested model position; host interaction cannot be asserted");
          }
        };
        await moveToModel(); await delay(900);
        const hovered = await windows(); await save("hover-windows.json", hovered);
        await driver("screenshot", join(jobDirectory, "hover.png"));
        await save("hover-ax.json", await driver("elements", pid));
        check("hover-expands-native-panel", hovered.some(w=>w.kCGWindowBounds.Width >= 500 && w.kCGWindowBounds.Width < 800), hovered);
        check("hover-does-not-open-details", !hovered.some(w=>w.kCGWindowBounds.Width > 800), hovered);
        const history = (await driver("elements", pid)).filter(row => ["AXButton", "AXCheckBox"].includes(row.AXRole)
          && /^(模型核验|Cache|TTFT) /.test(row.AXTitle || ""));
        check("native-history-three-metrics", ["模型核验", "Cache", "TTFT"].every(metric => history.some(row => row.AXTitle.startsWith(metric + " "))), history);
        const expandedGeometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
        const popup = expandedGeometry.popoverRect;
        check("native-history-not-clipped", popup.x >= 0 && popup.y >= 0
          && popup.right <= expandedGeometry.viewport.width && popup.bottom <= expandedGeometry.viewport.height, expandedGeometry);
        check("native-single-ring-per-model", expandedGeometry.ringCount === expandedGeometry.models.length, expandedGeometry.ringCount);
        check("native-focused-three-metrics", expandedGeometry.islandMode === "focus" && expandedGeometry.focusCount === 3, expandedGeometry);
        check("native-focus-not-clipped", expandedGeometry.focusRects.every(rect => rect.y >= 0 && rect.bottom <= expandedGeometry.viewport.height), expandedGeometry.focusRects);
        const expandedPanel = hovered.find(isIslandWindow).kCGWindowBounds;
        const expandedModel = expandedGeometry.models[0].rect;
        check("native-hover-model-position-stable", Math.abs(panel.Y + rect.y - expandedPanel.Y - expandedModel.y) < 1
          && Math.abs(panel.X + rect.x - expandedPanel.X - expandedModel.x) < 1, { before: rect, after: expandedModel });
        await delay(1200);
        check("native-stationary-hover-stable", JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8")).popover === true);
        const focusGeometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
        await driver("click", expandedPanel.X + focusGeometry.buffer.x + focusGeometry.buffer.width / 2,
          expandedPanel.Y + focusGeometry.buffer.y + 12);
        await delay(300);
        const bufferClick = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
        check("native-buffer-click-returns-normal", bufferClick.islandMode === "normal" && !bufferClick.popover, bufferClick);
        const waitForPanelWidth = async (width) => {
          let observed;
          const deadline = Date.now() + 2000;
          do {
            observed = await windows();
            if (observed.some(w=>w.kCGWindowBounds.Width === width)) return observed;
            await delay(100);
          } while (Date.now() < deadline);
          return observed;
        };
        for (let cycle=0; cycle<10; cycle++) {
          await driver("move", 100, 100);
          const collapsed = await waitForPanelWidth(112);
          check(`hover-cycle-${cycle+1}-collapse`, collapsed.some(w=>w.kCGWindowBounds.Width === 112), collapsed);
          await moveToModel();
          const expanded = await waitForPanelWidth(570);
          check(`hover-cycle-${cycle+1}-expand`, expanded.some(w=>w.kCGWindowBounds.Width === 570), expanded);
        }
        await driver("click", ...modelPoint); await delay(900);
        check("click-opens-details", (await windows()).some(w=>w.kCGWindowBounds.Width > 800));
        const selectedLabel = model.AXDescription.split("：核验")[0];
        let selection;
        for (let attempt = 0; attempt < 30; attempt++) {
          selection = (await driver("elements", pid)).find(row => row.AXValue?.startsWith(`${selectedLabel} · 最近`));
          if (selection) break;
          await delay(200);
        }
        check("first-details-open-keeps-clicked-model", Boolean(selection), selectedLabel);
        await driver("move", 100, 100); await delay(750);
        await driver("activate", pid);
        await driver("screenshot", join(jobDirectory, "details.png"));
        ax = await driver("elements", pid);
        await save("details-ax.json", ax);
        check("details-overview-triple-ring", ax.some(row => row.AXDescription === "模型核验、Cache 与 TTFT 三环"),
          ax.filter(row => row.AXDescription?.includes("模型核验")));
        for (const [surface, metric] of [["focus", "cache"], ["focus", "ttft"], ["focus", "quality"], ["popover", "cache"]]) {
          await driver("move", 100, 100); await delay(900);
          const frame = (await windows()).find(isIslandWindow).kCGWindowBounds;
          let geometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
          const selected = geometry.models[0];
          await driver("move", frame.X + selected.rect.x + selected.rect.width / 2, frame.Y + selected.rect.y + selected.rect.height / 2);
          await delay(1100);
          geometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
          const currentFrame = (await windows()).find(isIslandWindow).kCGWindowBounds;
          ax = await driver("elements", pid);
          const title = { cache: "Cache", ttft: "TTFT", quality: "模型核验" }[metric];
          const control = ax.find(row => row.AXRole === "AXButton" && (surface === "focus"
            ? row.AXTitle?.startsWith(selectedLabel + " · " + title + " ") && row.position.x >= currentFrame.X + geometry.rail.x
            : row.AXTitle?.startsWith(title + " ") && row.position.x >= currentFrame.X && row.position.x < currentFrame.X + geometry.rail.x));
          check(`native-${surface}-${metric}-control`, Boolean(control), control);
          await driver("click", ...center(control));
          let mainGeometry;
          for (let attempt = 0; attempt < 30; attempt++) {
            await delay(100);
            mainGeometry = JSON.parse(await readFile(join(jobDirectory, "main-geometry.json"), "utf8"));
            if (mainGeometry.view === metric && mainGeometry.selectedId === selected.id) break;
          }
          check(`native-${surface}-${metric}-navigation`, mainGeometry.view === metric && mainGeometry.selectedId === selected.id, mainGeometry);
        }
        await driver("move", 100, 100); await delay(900);
        ax = await driver("elements", pid);
        const settingsTab = ax.find(row=>row.AXRole === "AXButton" && row.AXTitle?.endsWith(" 设置"));
        check("native-settings-tab-present", Boolean(settingsTab));
        await driver("press", pid, settingsTab.path); await delay(400);
        ax = await driver("elements", pid);
        check("native-settings-replaces-overview", ax.some(row=>row.AXValue === "监测设置")
          && !ax.some(row=>row.AXValue === "今天的模型状态"));
        await save("settings-categories-ax.json", ax);
        const verificationTab = ax.find(row => (row.AXTitle || row.AXValue || "") === "核验" && row.AXRole !== "AXStaticText");
        check("native-verification-category-present", Boolean(verificationTab), verificationTab);
        if (verificationTab) { await driver("press", pid, verificationTab.path); await delay(300); ax = await driver("elements", pid); }
        // Calibration is method-specific and hidden while the default Meow
        // method is selected; the verification category itself remains the
        // visible settings surface.
        check("native-verification-settings", ax.some(row=>row.AXValue === "核验方式与采样")
          || ax.some(row=>row.AXValue === "核验校准档案"));
        const detailsWindow = (await windows()).find(w=>w.kCGWindowBounds.Width > 800);
        await driver("screenshot-window", join(jobDirectory, "settings-window.png"), detailsWindow.kCGWindowNumber);
        const tourButton = ax.find(row => row.AXRole === "AXButton" && row.AXTitle === "灵动岛引导");
        check("native-island-tour-launch", Boolean(tourButton));
        await driver("press", pid, tourButton.path);
        for (let step = 1; step <= 4; step++) {
          await delay(1000);
          const tourGeometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
          check(`native-island-tour-${step}`, tourGeometry.tour?.title === `灵动岛 ${step}/4`
            && tourGeometry.tour.rect.x >= 0 && tourGeometry.tour.rect.bottom <= tourGeometry.viewport.height, tourGeometry);
          await driver("screenshot-window", join(jobDirectory, `native-tour-${step}.png`), (await windows()).find(isIslandWindow).kCGWindowNumber);
          ax = await driver("elements", pid);
          const next = ax.find(row => row.AXRole === "AXButton" && row.AXTitle === (step === 4 ? "完成" : "下一步"));
          check(`native-island-tour-next-${step}`, Boolean(next));
          await driver("press", pid, next.path);
        }
        await driver("move", 100, 100); await delay(1200);
      }
      if (["ui", "drag"].includes(task)) {
        await save("drag-activation.json", await driver("activate", pid)); await delay(300);
        const main = (await windows()).find(w=>w.kCGWindowBounds.Width > 800);
        let before = main.kCGWindowBounds;
        const mainElement = (await driver("elements",pid)).find(row=>row.AXRole === "AXWindow" && row.AXTitle === "Modivue");
        if (mainElement) await driver("raise",pid,mainElement.path);
        await delay(400);
        await driver("drag", before.X+450, before.Y+18, before.X+550, before.Y+18); await delay(300);
        const mainWindow = list => list.find(w => w.kCGWindowBounds.Width > 800);
        let afterWindow = mainWindow(await windows());
        if (!afterWindow) throw new Error("Main window disappeared after title drag");
        let after = afterWindow.kCGWindowBounds;
        check("titlebar-draggable", Math.abs(after.X-before.X) > 50, { before, after });
        before = after;
        await driver("drag", before.X+450, before.Y+180, before.X+550, before.Y+180); await delay(300);
        afterWindow = mainWindow(await windows());
        if (!afterWindow) throw new Error("Main window disappeared after content drag");
        after = afterWindow.kCGWindowBounds;
        check("content-not-draggable", Math.abs(after.X-before.X) < 3 && Math.abs(after.Y-before.Y) < 3, { before, after });
        await driver("move", 100, 100); await delay(500);
        const island = (await windows()).find(w=>w.kCGWindowBounds.Width < 800 && w.kCGWindowBounds.Height > 100);
        const screens = await driver("screens");
        const screen = screens.find(s=>island.kCGWindowBounds.X >= s.x && island.kCGWindowBounds.X < s.x+s.width);
        check("island-screen",Boolean(screen),screens);
        const panelBounds = async () => (await windows()).find(w=>w.kCGWindowNumber === island.kCGWindowNumber).kCGWindowBounds;
        const settledGeometry = async (width) => {
          let geometry;
          const deadline = Date.now() + 2500;
          do {
            geometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
            const bounds = await panelBounds();
            if ((!width || bounds.Width === width) && geometry.viewport.width === bounds.Width
              && geometry.surfaceSize.width === bounds.Width && Date.now() - geometry.recordedAt * 1000 < 700) return geometry;
            await delay(100);
          } while (Date.now() < deadline);
          check("native-viewport-matches-panel", false, { geometry, bounds: await panelBounds() });
        };
        for (const [handle, side] of [["title", "left"], ["title", "right"], ["buffer", "left"], ["buffer", "right"]]) {
          await settledGeometry(112);
          if (handle === "buffer") {
            const compact = await settledGeometry(112), bounds = await panelBounds();
            await driver("move", bounds.X + compact.rail.x + compact.rail.width / 2, bounds.Y + compact.rail.y + 10);
            await delay(600);
            const normal = await settledGeometry(570);
            check(`buffer-height-follows-normal-${side}`, Math.abs(normal.buffer.height - (normal.stage.height - 8)) < 2, normal);
          }
          const geometry = JSON.parse(await readFile(join(jobDirectory, "native-geometry.json"), "utf8"));
          const before = await panelBounds();
          const grip = handle === "buffer" ? geometry.buffer : geometry.rail;
          const gripX = before.X + grip.x + grip.width/2;
          const gripY = before.Y + grip.y + 10;
          const movement = await driver("drag",gripX,gripY,side === "left" ? screen.x+120 : screen.x+screen.width-120,gripY-30,island.kCGWindowNumber);
          await save(`${handle}-drag-${side}.json`, movement);
          const initialFrame = movement.motion[0].frame;
          const held = movement.motion.filter(sample => sample.phase === "held");
          check(`${handle}-follows-pointer-${side}`, held.length === 3 && held.every(sample =>
            Math.abs(sample.frame.X - initialFrame.X - sample.pointer.x + gripX) < 50
            && Math.abs(sample.frame.Y - initialFrame.Y - sample.pointer.y + gripY) < 5), movement);
          const releasePositions = new Set(movement.motion.filter(sample => sample.phase === "released").map(sample => sample.frame.X));
          check(`${handle}-animated-release-${side}`, releasePositions.size > 1, movement);
          await delay(600);
          const after = await panelBounds();
          check(`${handle}-snaps-${side}`,Math.abs((side === "left" ? after.X : after.X+after.Width)
            - (side === "left" ? screen.x : screen.x+screen.width)) < 2,{before,after,screen});
          check(`${handle}-vertical-drag-${side}`,Math.abs(after.Y-before.Y) > 10,{before,after});
          await driver("move",screen.x+screen.width/2,screen.y+40); await delay(400);
          const settled = await settledGeometry(112);
          const frame = await panelBounds();
          const rect = settled.models[0]?.rect;
          if (rect) {
            check(`${handle}-model-inside-panel-${side}`, rect.x >= 0 && rect.right <= frame.Width, rect);
            const targetX = frame.X + rect.x + rect.width / 2;
            const targetY = frame.Y + rect.y + rect.height / 2;
            await driver("move",targetX,targetY);
            await delay(600);
            const expanded = await panelBounds();
            check(`${handle}-expands-inward-${side}`,expanded.Width === 570
              && Math.abs((side === "left" ? expanded.X : expanded.X+expanded.Width)
                - (side === "left" ? screen.x : screen.x+screen.width)) < 2,expanded);
            await driver("screenshot-window",join(jobDirectory,`island-${handle}-${side}.png`),island.kCGWindowNumber);
            await driver("move",screen.x+screen.width/2,screen.y+40); await delay(400);
          }
        }
      }
      if (["ui", "menu"].includes(task)) {
        ax = await driver("elements", pid);
        const findIcon = rows => rows.find(row=>row.AXRole === "AXMenuBarItem" && row.AXSubrole === "AXMenuExtra" && (row.AXDescription === "Modivue" || row.AXTitle === "Modivue"));
        let icon = findIcon(ax);
        check("menubar-icon", Boolean(icon), icon);
        if (icon.position.x < 0) {
          const ice = await driver("elements", "com.jordanbaird.Ice").catch(()=>[]);
          const toggle = ice.find(row=>row.AXSubrole === "AXMenuExtra" && row.position?.x > 0 && row.size.width < 100);
          if (!toggle) throw new Error("UNTESTED: menu bar manager hides the Modivue icon");
          iceToggle = toggle;
          await driver("click", ...center(toggle)); await delay(600);
          icon = findIcon(await driver("elements", pid));
          const overflow = await driver("elements", "com.jordanbaird.Ice");
          await save("overflow-ax.json", overflow);
          await driver("screenshot", join(jobDirectory, "overflow.png"));
          if (!icon || icon.position.x < 0) icon = overflow.find(row=>(row.AXTitle || row.AXDescription)?.includes("Modivue") && row.position?.x >= 0 && row.size?.width > 0);
          if (!icon || icon.position.x < 0) throw new Error("UNTESTED: Modivue icon remains hidden in the menu bar overflow");
        }
        await driver("right-click", ...center(icon)); await delay(400);
        ax = await driver("elements", pid); await save("menu-ax.json", ax);
        await driver("screenshot", join(jobDirectory, "menu.png"));
        const quit = ax.find(row=>row.AXTitle === "退出 Modivue" && row.size?.height > 0);
        check("right-click-quit-visible", Boolean(quit), quit);
        await driver("press", pid, quit.path); await delay(800);
        let alive = true; try { process.kill(pid,0); } catch { alive=false; }
        check("quit-terminates-app", !alive);
        ownsApp = false;
      }
    }
  } catch (error) {
    const text = error.stdout || error.message;
    checks.push({ name: "execution", status: text.includes("UNTESTED:") ? "UNTESTED" : "FAIL", evidence: text, stack: error.stack });
  } finally {
    if (ownsApp) { try { await driver("quit", pid); } catch {} }
    if (iceToggle) {
      try {
        const ice = await driver("elements", "com.jordanbaird.Ice");
        const toggle = ice.find(row=>row.path === iceToggle.path);
        if (toggle?.position.x !== iceToggle.position.x) await driver("click", toggle.position.x + toggle.size.width/2, toggle.position.y + toggle.size.height/2);
      } catch {}
    }
    const status = checks.some(c=>c.status === "FAIL") ? "FAIL" : checks.some(c=>c.status === "UNTESTED") ? "UNTESTED" : "PASS";
    await save("result.json", { task, status, checks, completedAt: new Date().toISOString() });
    console.log(`MODIVUE ${task}: ${status} (${jobDirectory})`);
    process.exitCode = status === "PASS" ? 0 : status === "UNTESTED" ? 77 : 1;
  }
}
