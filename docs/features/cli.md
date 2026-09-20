# CLI 与状态栏

<!-- 来源：README；旧版 README 的"Agent 内状态栏与命令工具""Statusline"条目。发布前请按当前代码核对 -->
![CLI 与状态栏](../assets/features/cli.png)

命令行工具和状态栏脚本读取的是桌面端写入的同一份本地数据，**只读，不发起 API 请求，也不会触发付费检测。**

[返回 README](../../README.md#功能) · [功能索引](README.md) · [状态栏片段](../../cli/STATUSLINE-SNIPPET.md)

## 命令行工具

需要 Node.js 24+。默认直接读取与桌面端共享的 SQLite，不需要知道桌面端的动态端口。

```bash
node cli/modivue.mjs status                              # 当前状态
node cli/modivue.mjs watch --interval 5                  # 每 5 秒刷新
node cli/modivue.mjs agents --json                       # Agent 会话，JSON 输出
node cli/modivue.mjs reports --model MODEL --hours 24 --json   # 最近 24 小时核验报告
```

### 筛选对象

用以下参数按四元组筛选：

| 参数 | 含义 |
|---|---|
| `--model` | 模型 |
| `--base-url` | 渠道 |
| `--key-group` | Key 分组 |
| `--reasoning-effort` | 推理档位 |

如需读取正在运行的服务而不是数据库，加 `--url http://127.0.0.1:4173`。

## 接入 Claude Code 状态栏

在 `~/.claude/settings.json` 中，把 `statusLine.type` 设为 `command`，二选一：

- 直接使用 Modivue 的脚本：`statusLine.command` 指向 `node /绝对路径/Modivue/cli/statusline.mjs`；
- 保留你现有的状态栏脚本，在脚本末尾调用 `node /绝对路径/Modivue/cli/agent-session.mjs`。

两种方式都会产生会话心跳，让 Modivue 识别这个会话。建议把状态栏的 `refreshInterval` 设为 5 秒，空闲会话也能保持可见。还可以在 SessionStart / SessionEnd hook 中调用 `agent-session.mjs`，分别记录会话的开始和结束。

本地测试脚本输出：

```bash
printf '%s' '{"model":{"display_name":"Claude 3.5 Sonnet"},"session_id":"demo"}' | node cli/statusline.mjs
```

完整片段见 [cli/STATUSLINE-SNIPPET.md](../../cli/STATUSLINE-SNIPPET.md)。

## Codex

Codex 的内置状态栏 `tui.status_line` 只接受 Codex 自带的条目，不能运行外部命令，所以没法把 Modivue 放进 Codex 的状态栏。

替代方式有两种：

- Modivue 直接读取 Codex 的本机会话状态，无需改动 Codex，见 [Agent 状态](agents.md)；
- 让 Codex 调用 `node cli/modivue.mjs agents --json`、`reports --json` 等命令，获取结构化指标。


![CLI 与 Claude Code 状态栏示例](../assets/features/cli.png)

上图按当前状态栏命令和本机缺失数据状态生成。指标缺失时保留“未提供”，不会填入虚构数值。
