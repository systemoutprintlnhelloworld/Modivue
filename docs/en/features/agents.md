# Agent status

Modivue distinguishes an installed/configured Agent from a session that is actually running. The panel shows working and recently active sessions.

| Support level | Agents |
|---|---|
| Live session status | Claude Code, Codex |
| Local install and launch verification | Gemini CLI, Qwen Code, Pi, OpenCode |
| Provider configuration parsing | Goose, Continue, Grok Build, Hermes, OpenClaw, GPTMe, Cline, Roo Code, Aider |

Claude Code uses statusline or hook heartbeats. Codex uses local session state and thread locks. Other tools are detected from processes and provider configuration. Configuration reads are local and do not return tokens.

API: `GET /api/agents` and `GET /api/agent-sessions?includeEnded=1`.

[Back to README](../../../README.en.md) · [Feature index](README.md)
