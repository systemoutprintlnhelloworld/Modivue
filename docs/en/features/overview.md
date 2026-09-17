# Overview and metric trends

![Overview and metric trends](../../assets/features/overview.png)

Click a Dynamic Island model or open the main window from the menu bar. Overview shows a selected model's recent behavior on a particular channel.

[中文](../../features/overview.md) · [Back to README](../../../README.en.md#features) · [Feature index](README.md)

## Page structure

| Area | Content |
|---|---|
| Header | Feature search and time-range controls. Model-catalog synchronization information belongs to the Models tab. |
| Filters | Model, channel, key group, and reasoning effort; clear them to inspect all eligible targets. |
| Active models | Agent states and model cards, with sampling controls. |
| Balance | Current channel/provider balance and query errors. |
| Verification cost | Total, average, and latest recorded cost. |
| Core metrics | Method-specific verification, cache hit rate, TTFT, and combined metric trends including balance. |

Navigation groups the workspace pages (Overview, Models, Routes, Cache, TTFT, Verification, Cost) separately from Alerts, Logs, and Settings. Nonessential tabs can be hidden in Settings.

## Four-tuple identity

Each target is **model × channel × key group × reasoning effort**. Different gateways, credentials, or effort settings remain separate rather than being averaged into one conclusion.

## Metric definitions

| Metric | Definition |
|---|---|
| TTFT | Time from request start to the first valid output text or tool event. |
| Cache | Explicit provider fields: Chat Completions `usage.prompt_tokens_details.cached_tokens`, Responses `usage.input_tokens_details.cached_tokens`, and Messages `usage.cache_read_input_tokens`. |
| Verification | The selected method's evidence and valid comparisons; see [Verification](verification.md). |
| Balance | Provider balance snapshots; see [Cost](cost.md). |

Missing measurements remain missing. Request measurements retain raw usage and timing metadata, not a promise to preserve every request/response body. Balance snapshots and model requests have independent sample counts.

## Model names

The model catalog is synchronized from [Models.dev](https://models.dev/catalog.json), with periodic checks. Failed downloads preserve the last successful catalog and its stale status. Canonical IDs, observed names, and matching evidence remain distinct.

## Layout

Long-press a draggable block's body, keep holding while the blocks enter drag mode, and move it to reorder. Buttons, inputs, and other interactive controls retain their normal behavior. Releasing saves the layout; there is no separate layout Save button.

![Custom layout](../../assets/features/layout.png)

## Search

Press `⌘K` / `Ctrl+K`. Use the arrow keys to choose a result, Enter to navigate, and Escape to close. Results are paginated and the background does not scroll while search is open.
