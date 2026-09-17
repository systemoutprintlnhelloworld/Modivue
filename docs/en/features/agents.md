# Agent status

![Agent status](../../assets/features/agents.png)

Modivue distinguishes an installed or configured agent from a running session. The Dynamic Island and Overview show working and recently active targets.

[中文](../../features/agents.md) · [Back to README](../../../README.en.md#supported-agents) · [Feature index](README.md)

## Support levels

| Level | Tools | Meaning |
|---|---|---|
| Session discovery | Claude Code, Codex | Local evidence supplies sessions, models, and runtime status. |
| Local installation and startup validation recorded | Gemini CLI, Qwen Code, Pi, OpenCode | Startup validation is not a completed real-provider request test. |
| Provider configuration parsing | Goose, Continue, Grok Build, Hermes, OpenClaw, GPTMe, Cline, Roo Code, Aider | Parsing is implemented; end-to-end acceptance is still incomplete. |

Support does not imply that every tool has passed real-provider verification. See the [roadmap](../../../ROADMAP.md).

## How discovery works

- **Claude Code:** status-line or hook heartbeats can report the session ID, model, working directory, and cache usage. Local transcript/process evidence can supplement them. See [status-line integration](cli.md#claude-code-status-line).
- **Codex:** on macOS, process discovery is combined with held thread writer locks, `state_5.sqlite`, and turn history. The daemon can retain locks after a terminal closes, so a lock alone is not sufficient evidence of an active session. Windows does not use this macOS lock-inspection path.
- **Other CLI tools:** inspect running processes, supported Node entry points, working directories, and selected provider configurations.
- **Herdr:** optionally supplies foreground process and session evidence. Basic discovery does not require Herdr.
- **Windows:** uses CIM process discovery plus configuration, proxy, and hook evidence. A running process alone does not prove that a model request is in progress.

## Configuration is not request routing

Reading an agent configuration does not intercept requests or refresh a connection already held by that agent. In particular, a channel shown after a CC Switch change may come from the new disk configuration while an existing Codex session still uses its old connection.

A configured Modivue endpoint may be reported as `proxyBaseUrl`; unresolved or recursive proxy routes are not eligible for probing. Merely having a configuration does not make an agent an active probe target. API responses do not expose raw credentials.

## Local API

| Endpoint | Purpose |
|---|---|
| `GET /api/agents` | Discovered sessions and adapter capabilities |
| `GET /api/agent-sessions?includeEnded=1` | Persisted session history, including ended sessions |

Use actual proxy samples, not the configured endpoint alone, to confirm forwarding. See [Local proxy and API](../proxy.md).
