# CLI and status line

![CLI and status-line output illustration](../../assets/features/cli.png)

The CLI and status-line script read the measurements shared with the desktop app. Status queries do not start paid model detection. The image is a formatted illustration of command output, not a capture of a configured live Claude Code status bar.

[中文](../../features/cli.md) · [Back to README](../../../README.en.md#features) · [Feature index](README.md) · [Status-line configuration](../../../cli/STATUSLINE-SNIPPET.md)

## Commands

Requires Node.js 22.5 or later. By default the CLI reads the local SQLite database, so the desktop service's dynamic port is not needed.

```bash
node cli/modivue.mjs status
node cli/modivue.mjs watch --interval 5
node cli/modivue.mjs agents --json
node cli/modivue.mjs reports --model MODEL --hours 24 --json
```

### Target filters

| Flag | Meaning |
|---|---|
| `--model` | Model |
| `--base-url` | Channel |
| `--key-group` | Credential group |
| `--reasoning-effort` | Reasoning effort |

To query a running local service, use `--url http://127.0.0.1:PORT`, replacing `PORT` with the port shown in Settings. The development default is 4173. JSON results go to stdout and diagnostics go to stderr.

## Claude Code status line

In `~/.claude/settings.json`, configure a command status line that invokes `node /absolute/path/Modivue/cli/statusline.mjs`. Preserve any existing status-line logic when integrating the heartbeat script instead of replacing the whole settings file. The scripts consume session JSON through stdin; an existing wrapper must explicitly pass that input through.

Session input can produce a Modivue heartbeat. `cli/agent-session.mjs` also supports session lifecycle integration. Follow the [configuration snippet](../../../cli/STATUSLINE-SNIPPET.md) rather than assuming a command appended without stdin forwarding will work.

Inspect output without supplying a session ID:

```bash
printf '%s' '{"model":{"display_name":"claude-sonnet-4-6"}}' | node cli/statusline.mjs --plain
```

No matching observation means missing metrics, not invented values. The status-line script may record a heartbeat when a session ID is supplied, so it is not strictly read-only in that case.

## Codex

Codex's built-in `tui.status_line` selects built-in fields rather than arbitrary external commands. Use Modivue's [local discovery](agents.md) without changing the Codex status bar, or run the CLI beside it. `agents --json` and `reports --json` provide structured output for integrations.

A status display is not evidence that Modivue intercepted a request. For provider-switch diagnosis, inspect actual [proxy samples](../proxy.md#confirming-a-provider-switch).
