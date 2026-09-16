# Modivue 开发工具

本目录保存初始化配置、技能文件和安装来源。项目行为以根目录 `AGENTS.md` 为准，指标术语见 `CONTEXT.md`。

工具保留与停用建议、维护证据、主动调用方式和开发步骤见 [开发工作流](WORKFLOW.md)。该文档区分目标配置与实际安装状态。

## 当前状态

记录时间：2026-09-07。下表记录本次初始化结果，运行安装入口后以实际命令输出为准。

| 项目 | 已完成 | 尚需完成 |
| --- | --- | --- |
| 项目规则 | `AGENTS.md`、`CONTEXT.md`、四份 Spec Workflow 自定义模板 | 无 |
| Ponytail、Caveman、Unslop | 技能已注册到 `.agents/skills/` | 按任务规则主动读取 |
| Grill with docs | `grill-with-docs`、`grilling`、`domain-modeling` 已注册 | 用户要求推敲需求或设计时调用 |
| 博客工程规范 | `engineering-principles` 已注册 | 规则已纳入 `AGENTS.md`，按需读取 |
| Smart Search | CLI、项目配置和密钥已就绪；`doctor` 配置检查通过 | 外网 DNS 恢复后验证在线提供方 |
| Fast Context | npm 包 1.5.2 已安装；Devin 密钥已自动提取并同步；本地 MCP 握手通过 | 用户级 args 修正后，待外网 DNS 恢复再验证 Windsurf 在线搜索 |
| Playwright | MCP 工具列表可用；配置指向系统 Chrome | 宿主重新加载后验证真实浏览器会话 |
| Trellis | CLI 已安装，项目已初始化 | 按多步骤任务使用 |
| Stop That Shit | 插件 0.2.0 已安装，`doctor` 通过 | 宿主需确认 Hook 信任 |
| 寸止 | 0.4.0 MCP 握手通过，`zhi` 已发现；弹窗程序为 `等一下` | 先启动独立 GUI，再由宿主调用并在窗口中回复 |
| 工具取舍与开发流程 | `WORKFLOW.md` 已记录当前状态和验证证据 | 按本文件末尾的待办完成宿主动作 |

当前执行环境无法解析外部域名。Smart Search 和 Fast Context 的在线请求报 DNS 错误。当前会话可以读取用户级 Codex 配置，但不能写入 `~/.codex`；用户级 MCP args 和审批字段仍需由普通终端写入。Playwright 的 MCP 工具列表可用，真实 Chrome 会话受当前受限环境的 Crashpad 和调试管道权限限制。

## 完成安装

本机已有 Node.js 25、npm 11、Python 3.13 和寸止 0.4.0。使用 macOS 普通终端，在项目目录运行：

```bash
node "scripts/install-agent-tools.mjs"
```

该入口按顺序执行：

1. 将 Smart Search、Trellis、Fast Context 安装到 `agent-tools/node_modules/`。npm 写入实际版本及锁文件。
2. 从 `skill-sources.json` 记录的 URL 下载上游原文件，更新本地可读快照。
3. 执行 `trellis init --codex -u popbomb -y --skip-existing`，保留现有项目指令，并写入 Modivue 规范引用。
4. 把项目技能链接到 `.agents/skills/`。Stop That Shit 使用插件提供的技能，不重复注册同名技能。
5. 运行 `scripts/sync-fast-context-key.mjs`，从 Devin 的 `state.vscdb` 提取当前密钥并写回 `.local/agent-tools.secrets.json`。
6. 通过 `scripts/configure-mcp.mjs` 在用户的 Codex 配置中修正 Fast Context、寸止和 Playwright 的启动与调用策略。脚本不改其他密钥。
7. 通过 Codex 官方插件命令安装 `stop-that-shit` 0.2.0。

安装入口失败时停止，并保留错误。它不运行单元测试，不初始化 Git，不创建提交，也不修改宿主的审批或 Hook 信任设置。

安装后新建 Codex 会话加载 skills 和 MCP。在 Codex CLI 输入 `/hooks`，检查并信任 Stop That Shit 的 `UserPromptSubmit` 和 `PreToolUse` 命令。这一步来自[上游安装说明](https://github.com/lennney/stop-that-shit/blob/0.2.0/INSTALL_FOR_AGENTS.md)，要求用户在宿主中审阅 Hook。未经宿主信任，不把 Guard 记为已启用。

## 配置与密钥

- `config.json` 保存非密钥参数。
- `.local/agent-tools.secrets.json` 保存用户提供的实际密钥，已被根目录 `.gitignore` 排除。
- `secrets.example.json` 是空值模板。
- `codex-mcp.toml` 是不含密钥的 MCP 配置参考。
- `scripts/agent-tool.mjs` 按工具注入对应密钥。它使用进程参数数组，不通过 shell 解释令牌中的 `$`。

Fast Context 使用已安装的 `fast-context-mcp` 1.5.2，通过 Node 直接启动。`scripts/sync-fast-context-key.mjs` 调用包内提取器，读取 Devin 的 `state.vscdb`，再写入项目密钥文件。该包对应 [awei84/fast-context-mcp](https://github.com/awei84/fast-context-mcp)，与 `@sammysnake/fast-context-mcp` 分别发布，版本和评价不能混用。Windows 的 `cmd /c npx.cmd` 不适用于当前系统。

Smart Search 保留用户提供的模型、服务地址、超时和运行参数。`FIRECRAWL_API_KEY` 的原值是占位内容，实际配置为空；该服务未启用。Smart Search 的第三方运行参数不改变 `AGENTS.md` 对项目实现的约束。

## 使用

```bash
node "scripts/agent-tool.mjs" smart-search --version
node "scripts/agent-tool.mjs" smart-search doctor --format json
node "scripts/agent-tool.mjs" smart-search search "模型接口的当前文档" --format json
node "scripts/agent-tool.mjs" smart-search fetch "https://example.com/source" --format markdown
```

Smart Search 是 CLI，不注册成 MCP。`doctor` 已确认配置完整；在线提供方因当前环境 DNS 失败，尚未获得有效响应。

Fast Context 通过 `fast_context_search` 使用。传入项目绝对路径 `/path/to/Modivue`，排除 `.local`、`.git`、`node_modules` 和 `agent-tools/skills`。用它定位代码后，阅读实际文件。开始工作前运行 `node "scripts/sync-fast-context-key.mjs"`，确保密钥来自当前 Devin 会话。

寸止通过 `zhi` 请求必要的用户反馈。`寸止` 是 stdio MCP 服务，`等一下` 是独立弹窗程序。先在单独终端运行 `/opt/homebrew/bin/等一下` 并保持运行，再由宿主调用 `zhi`。不要手动把 `/opt/homebrew/bin/寸止` 当作 GUI 启动。

Playwright 配置使用已安装的 `@playwright/mcp` CLI 和 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，不下载 Playwright 自带浏览器。配置脚本先查找项目本地 CLI，再查找 npm 缓存中的已安装 CLI；两者都不存在时明确报错。隔离宿主已验证 MCP 进入 `ready`；当前受限执行环境的真实 Chrome 会话因 Crashpad 和调试管道权限退出，需在普通宿主会话中验证 `browser_tabs`。

## 待由主人完成的宿主动作

1. 在普通终端运行 `node "scripts/sync-fast-context-key.mjs"`，再运行 `node "scripts/configure-mcp.mjs"`，修正用户级 Fast Context args、启动超时、审批字段和 Playwright Chrome 路径。
2. 在单独终端运行 `/opt/homebrew/bin/等一下`，保持弹窗程序运行。
3. 重新加载 Codex 会话。在 `/mcp` 中确认 Fast Context、Playwright 和寸止已连接。
4. 触发一次 Playwright `browser_tabs`、Fast Context `fast_context_search` 和寸止 `zhi`。Fast Context 还需要 Windsurf 域名可解析；寸止需要在弹窗中选择回复。

技能的触发规则以 `AGENTS.md` 为准。具体调用示例、MCP 停用方法和开发顺序见 [开发工作流](WORKFLOW.md)。

## 来源

| 工具 | 官方来源 |
| --- | --- |
| Ponytail | <https://github.com/DietrichGebert/ponytail> |
| Caveman | <https://github.com/JuliusBrussee/caveman> |
| Unslop | <https://github.com/cursor/plugins/tree/main/pstack/skills/unslop> |
| Grill with docs 及依赖 | <https://github.com/mattpocock/skills> |
| 工程规范 | <https://blog.52013120.xyz/tools/skills/SKILL.html> |
| Trellis | <https://github.com/mindfold-ai/Trellis> |
| Smart Search | <https://github.com/konbakuyomu/smartsearch> |
| Fast Context | <https://github.com/awei84/fast-context-mcp>；<https://www.npmjs.com/package/fast-context-mcp> |
| Stop That Shit | <https://github.com/lennney/stop-that-shit/tree/0.2.0> |
| 寸止 | <https://github.com/imhuso/cunzhi> |
| Codex skills 加载 | <https://developers.openai.com/codex/skills> |
| Codex MCP 配置 | <https://developers.openai.com/codex/mcp> |

`engineering-principles` 和 `smart-search-cli` 是项目适配文件。其余技能暂存了网页工具取得的上游可读正文，安装入口会重新下载原始文件。此目录不是已安装插件的缓存。
