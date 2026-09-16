# Modivue Monitoring

Continue the user's full model-centered monitoring application. This task is not complete when only syntax checks pass.

## Required Behavior

- Canonical model names come from a maintained live catalog; preserve source, update time, ambiguity and raw names.
- Record TTFT at the first valid streamed output and cache usage only from provider fields. Missing data remains unknown.
- Separate channels by base URL and key group, preserve observation conditions, and reuse identical active probes across agents.
- Discover Claude Code and Codex configuration, support changes of model and provider, and keep credentials out of returned metadata and logs.
- GUI has a compact island, hover expansion and detailed statistics. All three metrics, ranges, channel/group history, logs, alerts and settings use real data.
- Support theme and value transitions, a pointer-following bubble connector, and accessible desktop/mobile layouts.
- TUI shows three colored live bars; native host constraints are documented and do not get labeled as implemented integrations.
- Monitoring interval and evaluation strategy are configurable. Active calls are budgeted and explicit.
- Quality evaluation has a fixed method and version; identity evidence is not silently converted to task capability.
- Fallback probability is excluded as requested.

## Acceptance

Verify shared metric semantics, protocol streaming, independent channel/group statistics, catalog refresh and failure behavior, effective agent configuration, probe deduplication, persisted evaluation history, real GUI controls and terminal output. Run existing checks and necessary runtime interaction checks. Do not add test suites, initialize Git, commit or push.
