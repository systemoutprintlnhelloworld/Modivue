# Overview and metric trends

The Overview answers how a model performs on a channel over a selected time range. Filter by model, channel, key group, and reasoning effort.

| Area | Content |
|---|---|
| Active models | Current Agent sessions and model cards |
| Balance | Current provider balances and errors |
| Verification cost | Total, average, and latest recorded cost |
| Core metrics | Verification matches, cache hit rate, TTFT, and trends |

## Four-tuple identity

Each observation is separated by **model × channel × key group × reasoning effort**. Different gateways, keys, or reasoning settings are not merged.

## Metrics

- **TTFT:** request start to the first valid text or tool event.
- **Cache hit rate:** only explicit provider cache fields are used.
- **Verification:** matches and valid comparisons for the selected method and window.
- **Balance:** provider balance endpoint data.

Missing fields remain missing, not zero. Raw request JSON is retained.

## Layout

Long-press a block body and drag it to reorder dashboard blocks. Save the layout after arranging it.

## Search

Press `⌘K` / `Ctrl+K` to search features. Use arrow keys, Enter, and Escape.

[Back to README](../../../README.en.md) · [Feature index](README.md)
