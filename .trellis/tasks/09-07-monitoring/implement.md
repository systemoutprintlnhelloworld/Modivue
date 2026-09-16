# Delivery Checklist

- [x] Read current code, project instructions and upstream metric/catalog contracts.
- [x] Correct usage normalization, streaming observation and shared aggregates.
- [x] Implement maintained catalog parsing, refresh, provenance and model matching.
- [x] Correct agent configuration and session identity; isolate credentials.
- [x] Implement deduplicated probes, cost controls and persisted settings.
- [ ] Implement a fixed, versioned coding-capability evaluator. The evaluator contract and history are implemented; the benchmark and scoring method still require an explicit product decision.
- [x] Complete real GUI views, island/expansion, animations and responsive behavior.
- [x] Complete colored real-time terminal integration within host capabilities.
- [x] Verify server, browser interactions/screenshots and terminal behavior through the Herdr host executor. Native hover/click cycles, three-metric history, titlebar-only drag, content non-drag, menu-bar right-click quit, browser settings/hover, and isolated streaming metrics all pass. Evidence is retained under `.ui-artifacts/`.
- [x] Audit all original requirements and document externally blocked items in the task record and README.

Validation: `npm run check`, native build, direct protocol/HTTP/CLI interactions, and the user-authorized host/browser regression flow described below. Routine runtime fixtures use an isolated database and local upstream.

## 2026-09-08 Herdr Host Verification

The user explicitly authorized native UI driver and regression scripts. `tools/ui-driver/main.swift` and `scripts/host-test.mjs` now implement that flow through dedicated Herdr panes, with per-pane submission locks and retained PASS/FAIL/UNTESTED evidence.

- `npm run check`: PASS (JavaScript checks and Swift type checking).
- `npm run ui:test`: PASS, `.ui-artifacts/1788854404203-ui/result.json`. Real launch, child server, configuration APIs, current Codex model, three-metric expansion, ten hover/leave cycles, click details, titlebar/content/island-grip dragging, and menu-bar right-click quit. Main and hover screenshots visually reviewed.
- `npm run ui:test:web`: PASS, `.ui-artifacts/1788854301451-web/result.json`. Isolated upstream, SQLite, metrics rendering, settings persistence, three-metric hover and no page exceptions.
- Native screenshots show current `gpt-6-astra`, Cache 87%, TTFT 28.20 s from one real stored probe. These are not the controlled runtime fixture (109 ms / 60%). Page-load auto-probing was removed so opening the app obeys the probe setting.
- Fixed route-field mismatch, selection loss when observations replace configured models, inactive-panel mouse tracking, animation exit flicker, details front ordering, and drag scope.
- Quality benchmark/scoring and a separate XCUITest suite remain unfinished. This verification does not certify the entire original product specification.

## 2026-09-12 continuation

- Confirmed Herdr host regression after the latest island and navigation changes: `.ui-artifacts/1789188434637-ui/result.json` is PASS. It includes native launch, active Codex plus idle Claude discovery, hover/focus transitions, first-click model selection, ten hover cycles, titlebar-only drag, left/right snapping, and menu-bar quit.
- Confirmed browser/runtime regression: `.ui-artifacts/1789188230194-web/result.json` is PASS. Added checks for settled cache ring rendering, Meow pause/resume sample accounting, and de-duplicated passive Codex rollout cache history without fabricated TTFT.
- Finder-launched service now receives Homebrew paths in `desktop/ModivueApp.swift`; native app build completed after this change. Main model navigation waits for the frontend `main-ready` message instead of applying selection before data bootstrap.
- Passive Codex `token_count` usage is persisted as observation history with source `codex-rollout`; it includes cache fields only, leaves TTFT/duration unavailable, and deduplicates by session/event ID.
- Agent configuration parsing now resolves selected provider/model nodes instead of recursively flattening unrelated values. Added maintained-source-informed paths for Pi, OpenCode, Qwen Code, Gemini CLI, Aider, Continue, Goose, Hermes, OpenClaw and Grok Build. Added `yaml` and `json5` runtime dependencies and bundled them in the macOS app.
- `npm run check`, `npm run test:core`, fresh `detectAgents` and `npm run desktop:build` pass. Current real detection reports Claude Code idle and Codex working/idle sessions; no requests are sent to working sessions.

### Remaining evidence-limited items

- Direct channels cannot provide TTFT without a local proxy or an approved short-idle probe; rollout usage does not contain TTFT.
- The coding-capability evaluator benchmark and scoring method remain a product decision; no IQ-like score is fabricated.
- Generic adapter support is configuration-aware but not individually installed and live-tested for every GUI/CLI tool. Unsupported or ambiguous routes remain visible with an explicit status and are excluded from probes.

- Fresh post-build native run: `.ui-artifacts/1789190099416-ui/result.json` PASS. The new first-details selection assertion passed; app launch, model ring hover/focus, 10 transition cycles, drag boundaries, snap behavior, and Dock/menu quit all passed. A pre-existing Modivue PID 54746 was left untouched after the test, per process-safety rules.
- Final post-adapter runtime validation: `.ui-artifacts/1789190930170-runtime/result.json` PASS. It verifies localhost proxy streaming, TTFT 108 ms, Cache 60%, foreground-priority pause, 17 controlled verification requests, missing-baseline zero-request behavior, probability/Meow partial resumption, and passive cache history deduplication.
- Final adapter-field merge fix was checked with isolated temporary configs for OpenCode, Continue and Hermes; selected model, protocol and endpoint stayed paired. Final runtime job `.ui-artifacts/1789193286804-runtime/result.json` is PASS after the adapter changes.
- Post-build web regression after the adapter merge: `.ui-artifacts/1789195028098-web/result.json` PASS. Browser page has no asset/page exceptions and verifies settled ring values, settings persistence, and the complete controlled verification/idle-resume flow.
- Added runtime coverage for the public supported Agent adapter catalog. `.ui-artifacts/1789196616495-runtime/result.json` PASS; the API exposes 23 adapter IDs, in addition to Codex and Claude Code, while no unsupported runtime session becomes a paid probe target.

## 2026-09-12 22:20 current delivery

- [x] Fix focus-independent hover/collapse, compact-to-normal dwell and visible All buffer.
- [x] Resolve Claude status through Herdr foreground PID; parse 13 generic selected-provider configurations plus Codex/Claude. Process detection now handles Node package entries and actual cwd. The other 10 catalog entries remain presence/explicit-route only.
- [x] Add asynchronous manual verification queue, dedup, auto-disabled dispatch and shared progress across three views.
- [x] Add trusted API collection UI/API, 2-request preview, 16–100 reference collection, cancellation and conditions-aware reuse of v2 calibration.
- [x] Validate user-authorized api.oaipro.com flow with two low-effort gpt-5.4-mini responses (20 input + 33 output tokens; unknown cost); no credential saved.
- [x] Install and start Gemini/Qwen/Pi/OpenCode CLI locally, confirm process/cwd discovery without submitting model tasks. No GUI downloaded.
- [x] check/core/build PASS; runtime 1789222243327-runtime, web 1789222470468-web, native 1789222290695-ui PASS; actual hover and trusted form screenshots reviewed.
- [x] Update CONTEXT.md, HANDOFF.md and MODEL-VERIFICATION.md with precise support levels, evidence and remaining limitations.

Additional evidence: .local/adapter-verification.json (13 selected-provider isolation checks); .local/cli-smoke/result.json (4 interactive startups); .local/gemini-verification/result.json (Gemini streaming/usage/TTFT). Native lock-screen block was resolved after explicit user unlock.

Limitations are not hidden: the 25-entry catalog is not 25 fully tested integrations; generic CLI startup alone is not authenticated work-state validation; subscription OAuth/IDE SecretStorage remain unavailable to independent probes; trusted maxJsd remains null; HLWY does not resume partial sampling; in-memory manual queues do not survive restarts.
