---
name: smart-search-cli
description: 使用 Modivue 的 Smart Search CLI 查询当前资料、读取网页、查阅技术文档和执行有来源的研究。
---

# Smart Search CLI

这是 Modivue 的项目适配。命令依据[上游 Smart Search](https://github.com/konbakuyomu/smartsearch)，配置入口为 `agent-tools/config.json`。

从项目根目录通过启动器运行。启动器按工具读取 `.local/agent-tools.secrets.json`，不把密钥传入命令参数。

```bash
node "scripts/agent-tool.mjs" smart-search --version
node "scripts/agent-tool.mjs" smart-search search "查询内容" --format json
node "scripts/agent-tool.mjs" smart-search fetch "https://example.com/source" --format markdown
node "scripts/agent-tool.mjs" smart-search deep "研究主题" --format json
node "scripts/agent-tool.mjs" smart-search research "研究主题" --format markdown
```

- `search` 用于在线发现资料。搜索摘要是线索；关键结论须读取对应网页后引用。
- `fetch` 用于取得指定网页内容。
- `deep` 只生成离线研究计划。不要把计划当作已完成的研究。
- `research` 执行在线研究。只有任务确需深入研究时才使用。
- 技术库文档先确定库名和版本，再使用 Context7 或 CLI 的 `context7-library`、`context7-docs`。参数以对应子命令的 `--help` 为准。
- 配置或连接异常时用 `doctor --format json`；接口长时间无响应时用 `diagnose openai-compatible --format markdown`。
- 保持用户指定的模型、接口和运行参数。不自动配置其他模型或服务。
- Firecrawl 尚未提供有效密钥，不声称它已经可用。
- 引用来源 URL 和实际读取的证据。不把空结果写成成功，不重复执行已经得到充分证据的查询。

本技能调用 CLI，不提供 MCP 服务。遵守根目录 `AGENTS.md`，不新增测试或扩大安装范围。
