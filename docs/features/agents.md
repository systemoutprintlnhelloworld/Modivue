# Agent 状态

应用从本机配置和运行会话发现 Agent。Codex、Claude Code 以及配置解析器中的其他工具会独立展示。配置文件存在不等于 Agent 正在运行，无法建立具体会话关联时会保留“已打开”而不猜测运行状态。

| 配置解析器 | 配置解析器 | 配置解析器 |
|---|---|---|
| Claude Code | Codex | Gemini CLI |
| Qwen Code | OpenCode | Goose |
| Continue | Pi | Grok Build |
| Hermes | OpenClaw | GPTMe |
| Cline | Roo Code | Aider |

Codex 使用本机进程、状态库和会话记录；Claude Code 可接入 hook / statusline。Herdr 提供补充会话信息，不是启动监测的前提。子 Agent 归属父会话，不单独增加顶层会话数。

这张表列的是配置解析能力，不代表 15 个工具均已完成 GUI 或真实上游验收。各项验证状态见 [路线图](../../ROADMAP.md)。配置切换与代理转发见 [本地代理](../proxy.md)。

实现：[会话发现](../../src/core/agents.mjs)、[通用适配器](../../src/core/agent-adapters.mjs)。
