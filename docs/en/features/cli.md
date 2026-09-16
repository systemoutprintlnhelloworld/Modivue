# CLI and status line

The CLI and status-line scripts read the same local SQLite data as the desktop app. They are read-only and do not make API requests.

Requires Node.js 22.5+.

```bash
node cli/modivue.mjs status
node cli/modivue.mjs watch --interval 5
node cli/modivue.mjs agents --json
node cli/modivue.mjs reports --model MODEL --hours 24 --json
```

Filter with `--model`, `--base-url`, `--key-group`, and `--reasoning-effort`. Use `--url http://127.0.0.1:4173` to read a running service.

Claude Code can call `cli/statusline.mjs` through `statusLine.command`, or append `cli/agent-session.mjs` to an existing status-line script. Codex's built-in status line does not run external commands; use the CLI or local session discovery instead.

[Back to README](../../../README.en.md) · [Feature index](README.md)
