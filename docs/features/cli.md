# CLI 与状态栏

CLI 读取桌面端共享数据库，不会因为 `status`、`watch` 或 `agents` 命令自动发起付费核验。结构化结果输出到 stdout，诊断信息输出到 stderr。

```bash
node cli/modivue.mjs status
node cli/modivue.mjs watch --interval 5
node cli/modivue.mjs agents --json
node cli/modivue.mjs reports --model MODEL --hours 24 --json
```

可用 `--base-url`、`--key-group`、`--reasoning-effort` 限定目标。CLI 和桌面界面使用相同指标定义，不单独计算另一套分数。缺少字段的 JSON 不应被脚本当成零。

Claude Code 的状态栏配置见 [接入说明](../../cli/STATUSLINE-SNIPPET.md)。Codex 内置状态栏不能运行外部命令，使用 CLI 查询即可。
