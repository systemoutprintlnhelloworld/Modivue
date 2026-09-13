# Modivue 工具取舍与开发流程

查阅日期：2026-09-07。以下结论针对 Modivue 的开发环境。实际安装状态见 [README.md](README.md)。本轮已完成本地 MCP 握手和可用工具调用检查。

## 取舍结论

默认使用根目录 `AGENTS.md` 控制任务范围和表达，使用 `ponytail` 约束实现规模。库文档交给 Context7，一般网页研究交给完成在线验证的 Smart Search。多步骤任务由 Trellis 记录。

建议停用 `contextweaver`、`open-websearch` 和第三方 `mcp-deepwiki`。Smart Search 在线验证完成后，Exa 改为按需使用。Serena、Fast Context、Playwright 和寸止按任务启用。

本次没有足够证据把这些项目统称为“已淘汰”。发布间隔、社区关注量和实际效果分别判断。GitHub Stars 只表示关注量，网页快照也可能滞后；以下版本是查阅到的公开记录，不代表本机已安装版本。

### MCP

| 工具 | 本机状态 | 建议与功能边界 | 维护与社区证据 |
| --- | --- | --- | --- |
| Context7 | 已配置启用 | 保留为库、框架和 SDK 文档入口。与 Smart Search 的 Context7 路径不重复查询同一问题 | Upstash 维护；[发布记录](https://github.com/upstash/context7/releases)包含 2026-08-28 的 MCP 4.0.4，仍在更新 |
| Serena | 已配置启用 | 编码任务按需使用符号、引用、重命名和修改工具。当前空项目无需启动项目分析 | [仓库](https://github.com/oraios/serena)约 2.89 万 Stars；[v1.7.0](https://github.com/oraios/serena/releases/tag/v1.7.0)发表于 2026-08-09。符号分析与纯文本检索有不同职责 |
| Playwright | MCP 工具列表成功；配置指向 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；受限环境中真实会话退出 | UI 运行后启用，检查实际交互、截图、控制台和视口布局。普通宿主会话中直接使用已安装 Chrome，不执行浏览器下载 | Microsoft 维护；[v0.0.80](https://github.com/microsoft/playwright-mcp/releases/tag/v0.0.80)发表于 2026-09-01，仍在改进截图和浏览器会话行为 |
| Fast Context | 1.5.2 已安装；Devin 密钥提取并同步；本地 MCP 握手成功；在线搜索受 DNS 阻断 | 按需保留。用自然语言定位未知代码，随后读取真实文件。已有文件路径时直接用 `rg` | 用户指定的[发行分支](https://github.com/awei84/fast-context-mcp)约 11 Stars、47 次提交，公开关注量较小。它调用 Windsurf 服务；本项目尚无实际效果数据 |
| ContextWeaver | 未注册 | 停用。当前没有需要维护的业务代码索引，且代码定位职责与 Fast Context 重叠 | [仓库](https://github.com/hsingjui/ContextWeaver)约 297 Stars；提供 Tree-sitter、向量检索和索引维护。未找到足够证据认定停止维护 |
| Exa | 已配置启用 | Smart Search 在线验证完成前保留；完成后改按需，用于明确指定的 Exa 检索任务 | [官方仓库](https://github.com/exa-labs/exa-mcp-server)约 5000 Stars。与 Smart Search 的网页发现能力重叠；现有 Exa MCP 密钥没有自动转入 Smart Search |
| open-websearch | 未注册 | 停用默认加载。多引擎网页搜索与现有研究入口重复 | [发布记录](https://github.com/Aas-ee/open-websearch/releases)包含 2026-04-30 的 v2.1.9。停用理由是重复，不是已废弃 |
| mcp-deepwiki | 未注册 | 停用默认加载。需要 DeepWiki 时，单独选择官方服务 | [npm 页面](https://www.npmjs.com/package/mcp-deepwiki?activeTab=dependencies)标明非官方、0.0.10、约一年前发布。[官方 DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki-mcp)已有 `https://mcp.deepwiki.com/mcp`，提供仓库目录、正文和问答 |
| 寸止 | 本机 0.4.0；MCP 握手和 `tools/list` 成功；弹窗程序为 `等一下` | 按需保留独立反馈窗口。先运行 `/opt/homebrew/bin/等一下`，再调用 `zhi`；宿主对话已能收集答案时，不重复调用 `zhi` | [发布页](https://github.com/imhuso/cunzhi/releases)仍列 0.4.0 为最新。它解决交互问题，不提供代码分析或模型质量评分 |

Fast Context 的两个发行包必须区分：`fast-context-mcp` 对应 `awei84`，`@sammysnake/fast-context-mcp` 对应 `SammySnake-d`。两者不能共享“最新版本”、下载量或质量结论。本项目保留用户指定的前者。密钥由 `scripts/sync-fast-context-key.mjs` 从 Devin 数据库提取。

### Skills 与 CLI

| 工具 | 默认用法 | 重复关系与取舍依据 |
| --- | --- | --- |
| Ponytail | 编码、修复、依赖选择前主动读取 | 决定实现需要多大。[JetBrains 的 80 组配对实验](https://blog.jetbrains.com/ai/2026/07/ponytail-skill-claude-tested/)测得该实验条件下成本中位数下降约 10.3%，未检出质量差异。这不是 Modivue 或当前模型的效果保证。实验还发现仅安装 skill 未必自动触发，因此应明确调用 |
| Stop That Shit | 需要明确只读或修改边界时调用 `review` 或 `change` | 决定任务允许做什么，与 Ponytail 分工不同。[0.2.0 证据文档](https://github.com/lennney/stop-that-shit/blob/0.2.0/EVIDENCE.md)更新于 2026-09-01，也明确限制了效果结论。保留已要求的插件安装；Hook 生效以宿主状态为准 |
| Caveman | 退出常驻风格注入；用户要求更短表达时使用 `lite` 规则 | 与 `AGENTS.md` 的受控中文表达重叠。[v2.6.0](https://github.com/JuliusBrussee/caveman/releases/tag/v2.6.0)发表于 2026-09-04，仍活跃，且已扩展到代理、Hook 与压缩。Modivue 本次只使用表达 skill，不安装其请求代理或缓存优化组件 |
| Unslop | 交付文档、界面文案需要编辑时使用 | 与 Caveman 部分重叠，但侧重删空话、统一术语。保留[用户指定的 skill](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md)，不另装整套 pstack。未找到该单项 skill 的独立效果评测 |
| engineering-principles | 保留来源，退出额外常驻加载 | [博客规范](https://blog.52013120.xyz/tools/skills/SKILL.html)的最小实现与根因分析规则已写入 `AGENTS.md`，与 Ponytail 重叠。它是项目规范来源，没有可据以判断效果的独立发布或评测记录 |
| grill-with-docs | 用户要推敲需求或关键设计时使用 | 保留为访谈入口。[上游实现](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)直接组合 `grilling` 与 `domain-modeling`，不需要再单独执行三轮工作流 |
| grilling | 作为 `grill-with-docs` 的依赖 | 确定用户取舍。事实由 agent 查证，已确定事项不重复询问。来自同一维护中的 [skills 仓库](https://github.com/mattpocock/skills)，仓库热度不能代表单项效果 |
| domain-modeling | 随访谈使用，或实际修改术语时使用 | 维护 `CONTEXT.md`；只有重要且难逆转的取舍才形成 ADR。读取术语不需要启动一次建模工作流 |
| Smart Search CLI | 安装并验证后，主动用于一般网页研究 | [上游](https://github.com/konbakuyomu/smartsearch)明确采用 CLI 与 skill，整合检索、页面读取和研究，持续维护提供方路由。与 Exa、open-websearch 的部分能力重叠；它不提供本地代码语义检索 |
| Trellis | 多步骤开发任务主动使用；小修改直接完成 | [仓库](https://github.com/mindfold-ai/Trellis)约 1.45 万 Stars，提供项目上下文、规范和任务管理。它保存进度，`grill-with-docs`确定决策；两者不重复。只维护 Trellis 这一套开发任务记录 |
| Spec Workflow | 默认停用，用户明确指定时使用 | 与 Trellis 的需求、设计和任务记录重叠。保留 `.spec-workflow/user-templates/`，不同时为一个任务填写两套记录；本地模板本身不足以判断上游维护状态 |

宿主自带的 `openai-docs` 用于 OpenAI 与 Codex 的当前文档；`skill-installer` 用于安装技能；`skill-creator` 用于修改技能；`plugin-creator` 只在创建插件时使用；`imagegen` 只在 UI 确需位图素材时使用。这些是按任务使用的工具，不作为每次开发的固定步骤。

## 启用与停用

“主动使用”指 agent 在条件满足时读取 skill 或调用工具。“按需启用”指在需要该能力的任务会话中开启。MCP 配置为启用，不等于已经连接；skill 文件存在，也不等于已加载或 Hook 已执行。

Codex 支持在服务器配置内设置 `enabled = false`。本项目可以在 `.codex/config.toml` 中覆盖用户级配置，保留其他项目的设置。当前会话不能写该目录，下面是待应用的项目配置片段。已有同名表时修改字段，不重复追加表。

```toml
[mcp_servers.contextweaver]
enabled = false

[mcp_servers.open-websearch]
enabled = false

[mcp_servers.mcp-deepwiki]
enabled = false
```

也可以从普通终端为一次 Codex CLI 会话指定这些开关：

```bash
codex -C "/Users/popbomb/Modivue" \
  -c 'mcp_servers.contextweaver.enabled=false' \
  -c 'mcp_servers.open-websearch.enabled=false' \
  -c 'mcp_servers.mcp-deepwiki.enabled=false'
```

Smart Search 在线验证完成后，再将 `mcp_servers.exa.enabled` 设为 `false`。这只是关闭默认 MCP 加载，不会把 Exa API 接入 Smart Search。需要 Exa 的具体能力时单独启用。

修改服务器配置后，新建会话，通过 `/mcp` 查看实际连接。服务开关和项目配置位置依据 [Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

skill 可以在 Codex 配置中用 `[[skills.config]]`、绝对 `SKILL.md` 路径和 `enabled = false` 禁用。需要保留显式调用时，可在该 skill 的 `agents/openai.yaml` 使用 `policy.allow_implicit_invocation: false`。本次没有写入这些宿主开关；`grilling` 和 `domain-modeling` 仍需保留给组合技能读取。配置方式见 [Codex skills 文档](https://learn.chatgpt.com/docs/build-skills)。

## 如何主动使用

### 需求与术语

需要讨论产品边界时，给 agent 明确的议题：

```text
$grill-with-docs 推敲 Modivue 的采集边界、质量评分方法和 CLI 扩展宿主。
先读取 AGENTS.md 与 CONTEXT.md。资料能确定的事实直接查证，只询问需要主人取舍的事项。
```

该入口按需读取 `grilling` 和 `domain-modeling`。当前尚未确定的产品决策只有记录到需求讨论后才进入实现，不把本次初始化变成业务开发。

### 文档与网页研究

库 API 问题使用 Context7：解析库标识，指定实际版本，查询具体 API，读取对应源码或原文。一般资料使用 Smart Search：

```bash
node "scripts/agent-tool.mjs" smart-search search "模型提供方首字响应时间与缓存使用字段的官方文档" --format json
node "scripts/agent-tool.mjs" smart-search fetch "https://docs.devin.ai/work-with-devin/deepwiki-mcp" --format markdown
node "scripts/agent-tool.mjs" smart-search research "比较模型质量评测方法及其公开评分依据" --format markdown
```

`search` 用于发现资料，`fetch` 读取已知链接，`research` 执行完整在线研究。`deep` 只生成研究计划。当前 CLI 配置检查通过，在线提供方因 DNS 失败尚未返回有效结果。

### 代码定位与修改

有名称或路径时直接用 `rg`。有业务源码且不知道位置时，调用 `fast_context_search`，明确 `project_path` 为 `/Users/popbomb/Modivue`，并通过 `exclude_paths` 排除 `.local`、`.git`、`node_modules`、`agent-tools/skills` 和凭据文件。参数以实际 `tools/list` 为准。

符号关系使用 Serena。先读取 `initial_instructions`，再定位符号、查询引用、读取实现。Fast Context 返回的是定位线索，不代替这些代码证据。小文件用本地编辑工具直接修改。

```text
$ponytail 按已经确认的指标定义实现本次需求。先读真实调用链，使用现有 API 和标准库。
只完成当前范围，不新增测试代码，不执行 Git 初始化、分支或提交。
```

需要限制审查行为时使用明确模式：

```text
$stop-that-shit review -- 检查本次指标采集修改，只报告缺陷、影响和代码位置。
$stop-that-shit change -- 修复刚才确认的缺陷，执行必要的现有检查。
```

### UI 与交付

UI 设计先查看 `UI-concept/`。功能实现后启动开发服务器，再用 Playwright 检查桌面与移动视口、筛选操作、模型比较和调用详情。查看控制台错误与截图，不生成端到端测试文件。

CLI 直接运行实际命令，检查 stdout 中的结果、stderr 中的诊断和退出码。UI 与 CLI 对同一份采样数据给出一致指标。

交付文案用 Unslop 删除空话，保留数据条件、单位与未完成事项。Caveman 仅在明确要求时压缩沟通。寸止仅用于需要独立窗口收集的反馈，先启动 `/opt/homebrew/bin/等一下`。

## 开发顺序

| 步骤 | 动作与工具 | 完成依据 |
| --- | --- | --- |
| 1. 恢复上下文 | 读 `AGENTS.md`、`CONTEXT.md` 与当前 Trellis 任务 | 当前目标、已有结果和待决事项清楚；小修改不额外建任务 |
| 2. 确定需求 | 对未决产品取舍使用 `grill-with-docs`；用 Context7 或 Smart Search 查事实 | 采集方式、质量评分方法、技术栈和 CLI 宿主按当前工作所需确定；不编造 IQ |
| 3. 固定本次范围 | 多步骤工作在 Trellis 记录需求、完成条件和必要文件引用 | 一个任务只有一套记录；不重复填写 Spec Workflow |
| 4. 完成实现 | Ponytail 控制规模；`rg`、Serena 或 Fast Context 提供代码证据 | 先打通请求记录、有效输出计时、提供方使用量到共享指标结果，再由 UI 与 CLI 消费；评分实现依赖已确认的方法 |
| 5. 验证行为 | 运行已有检查、语法检查、类型检查和构建；UI 用 Playwright，CLI 用真实命令 | 操作可完成；缺失值不变成零；TTFT、缓存字段、样本数和时间范围符合项目定义；不新增测试代码 |
| 6. 交付与记录 | 总结结果及真实阻碍；更新使用中的 Trellis 任务 | 交付物位置明确；验收完成后结束，不追加无关检查或自动提交 |

Trellis 安装后，先读取它生成的启动 skill 和任务脚本说明。命令入口可通过 `python3 ".trellis/scripts/task.py" --help` 查看。规范引用 `AGENTS.md` 和 `CONTEXT.md`，任务正文只补充本次范围。

开发辅助工具不会自动生成 Modivue 的质量分数。比较模型时，agent、提示词、启用的 skill、MCP 和 Hook 都是采样条件的一部分。请求代理或工具输出压缩会改变请求内容与耗时，不能混入声称条件相同的模型比较。
