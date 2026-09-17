# Dynamic Island panel

![Dynamic Island](../../assets/features/island.png)

The Dynamic Island is a vertical panel at the screen edge. It stays compact while you work and expands on demand.

[中文](../../features/island.md) · [Back to README](../../../README.en.md#dynamic-island) · [Feature index](README.md)

## Display states

| State | Entry | Content |
|---|---|---|
| Minimal | Default | Compact model rings; the displayed metric is configurable. Drag grips and Settings are hidden. |
| Normal | Pointer enters the panel | Monitored targets, with drag grips and Settings available. |
| Focus | Hover a model ring | Selected metric rings and a detail card. |
| Idle | No active targets | A status indicator. |

## Focus details

The configurable rings cover **verification, cache, TTFT, and balance**. The adjacent detail card includes model, channel, short key fingerprint, reasoning effort, associated agents and states, metric values and recent trends, balance, performance sample count, and verification cost.

Missing ring values appear as `--`; read the detail card for the full state. A configured channel is not proof of a live session's outbound connection; see [proxy diagnostics](../proxy.md#confirming-a-provider-switch).

## Balance ring baseline

The first valid balance establishes the full-ring reference. A top-up above that reference keeps the ring full. Reset the baseline in Settings when required.

## Interaction

- Drag the panel and release it to snap to the left or right edge.
- Click a model to open its detailed statistics.
- Closing the details window does not exit monitoring. Use the macOS menu bar or Windows tray to restore the window or quit.
- Notification settings are described in [Settings and notifications](settings.md).

## Animation and appearance

Metric SVG animations play on hover. Ring highlighting accompanies the transition into focus. Reduced-motion preferences are respected. Model backgrounds, empty tracks, and displayed rings can be adjusted in Settings.

## Platforms

macOS uses native windows around the web interface and expands toward the available side of the screen. Windows supports hover, drag, and edge snapping; native mouse and multi-DPI acceptance remain incomplete.
