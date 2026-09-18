# Agent 状态

<!-- 来源：README；旧版 README 的"本地代理""Windows 预览版""Statusline"条目。发布前请按当前代码核对，尤其是分级表 -->
![Agent 状态](../assets/features/agents.png)

Modivue 会发现本机的 coding agent 会话，并区分两种情况：**只是装了、有配置**，和**正在运行**。灵动岛和概览页只显示正在工作及近期活跃的 Agent。

[返回 README](../../README.md#支持的工具) · [功能索引](README.md)

## 支持程度

<!-- 说明：请按当前实测结果核对 -->

| 支持程度 | 工具 | 说明 |
|---|---|---|
| 实时读取会话状态 | Claude Code、Codex | 能拿到会话、模型和运行状态 |
| 本机安装并启动验证 | Gemini CLI、Qwen Code、Pi、OpenCode | 已在本机安装并启动验证 |
| 可解析 provider 配置 | Goose、Continue、Grok Build、Hermes、DeepSeek Harness、OpenClaw、GPTMe、Cline、Roo Code、Aider | 有配置解析路径，尚未实机验收 |

"支持"表示有配置解析或会话发现路径，不表示每个工具都完成了真实上游请求的验收。后续计划见 [ROADMAP.md](../../ROADMAP.md)。

## 各工具怎么识别

**Claude Code。** 通过 statusline 或 hook 心跳上报，记录 `session_id`、当前 `model.id`、工作目录和 prompt cache。接入方法见 [CLI 与状态栏](cli.md#接入-claude-code-状态栏)。

**Codex。** 读取 Codex 正在持有的 thread writer lock，并结合 `~/.codex/state_5.sqlite` 获取会话、模型、父子 Agent 和 turn 状态。不需要替换 Codex 的状态栏。这种文件锁采集方式不适用于 Windows。

**其他 CLI 工具。** 根据运行进程的工作目录读取项目配置，可以识别 Node 包入口。DeepSeek Harness 使用官方 `dsh` 命令；适配器只读 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`）和 `$DSH_HOME/.credentials.yaml`，解析 `agent-default-model`、`llm-pi-ai` 或 `llm-deepseek` 的当前 provider、模型、协议、地址和凭据引用。

**Herdr。** 通过前台进程 PID 补充状态。

**DeepSeek Harness 的配置边界。** 官方文档说明，模型设置修改会在下一次请求生效，不需要重启 Harness。Modivue 的适配器同样只读取磁盘快照；它不会接管 DSH 内部请求，也不会把凭据暴露到接口。官方命令、配置字段和协议说明见 [DeepSeek Harness README](https://github.com/deepseek-ai/deepseek-harness)、[模型配置指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) 和 [默认模型源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-default-model/src/index.ts)。

**Windows。** 通过 CIM 发现进程，结合用户配置解析和代理 / Hook 记录。进程存在本身不代表 Agent 正在工作。

## 与代理和主动探测的关系

- 读取 Agent 配置是只读操作，接口不返回 token。
- 只有静态配置的工具不能作为主动探测目标。
- 如果 Agent 的 Base URL 已经指向 Modivue 代理，探测会解析回对应的真实上游，同时在 Agent 信息中保留 `proxyBaseUrl`。路由缺失或无效时保留本地地址，并由递归保护跳过探测，避免请求绕回自己。

## 本地接口

| 接口 | 用途 |
|---|---|
| `GET /api/agents` | 已启动的会话和适配能力目录 |
| `GET /api/agent-sessions?includeEnded=1` | 包含已结束会话的详细历史 |

端口与其他接口见 [本地代理与 API](../proxy.md)。
