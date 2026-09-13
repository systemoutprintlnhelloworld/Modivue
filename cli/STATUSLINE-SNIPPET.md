## TUI / statusline

`cli/statusline.mjs` 读取 Modivue 的 SQLite 聚合结果，只显示当前模型在当前渠道和密钥分组中的真实样本。没有质量评测器、缓存字段或有效 TTFT 时保留“未评测”/“未提供”，不会借用其他模型的数据。

Claude Code 原生支持命令型 status line。把下面配置加入 `~/.claude/settings.json`，Claude Code 会把会话 JSON（包括 `model.id`、`model.display_name`）通过 stdin 传给脚本；`refreshInterval` 用于让外部指标在空闲期间刷新：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /绝对路径/Modivue/cli/statusline.mjs",
    "refreshInterval": 60
  }
}
```

可手动验证：

```bash
printf '%s' '{"model":{"display_name":"claude-sonnet-4-6"}}' | node cli/statusline.mjs
printf '%s' '{"model":{"display_name":"claude-sonnet-4-6"}}' | node cli/statusline.mjs --json
```

Codex 的 `tui.status_line` 是内置项目标识符数组，官方配置不提供执行任意外部命令的钩子，因此不能把该脚本直接填入 `tui.status_line`。Modivue 仍会通过 `/api/agents` 发现 Codex 的模型、provider、base URL 和内置状态栏配置；需要在 Codex TUI 中显示三项柱状图时，使用宿主终端的外部状态栏/包装器调用本脚本，并通过 `--model`、`--base-url`、`--key-group` 明确绑定身份。

结构化输出只写 stdout，解析或匹配问题写 stderr；`--plain` 或 `NO_COLOR=1` 禁用 ANSI 颜色。`--hours` 默认采用 Modivue 设置中的时间范围。

官方依据：

- Claude Code status line：<https://code.claude.com/docs/en/statusline>
- Codex `tui.status_line`：<https://developers.openai.com/codex/config-reference/>
