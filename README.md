# Modivue

Modivue 是面向 coding agent 的本地模型监测工具，按模型、渠道、Key 分组和推理档位展示核验证据、缓存命中率、TTFT 与检测费用。提供 macOS 灵动岛、Windows 预览宿主及 Agent 状态栏／命令工具。核验结果不是人类 IQ 或模型身份认证。

[下载预览版](https://github.com/systemoutprintlnhelloworld/Modivue/releases) · [构建状态](https://github.com/systemoutprintlnhelloworld/Modivue/actions)

## 0.4.0

- 修复核验页轮询重建控件与设置保存竞态：折叠、内部滚动和当前选择保持稳定，历史报告可跨检测方法查看。
- 英文自动扫描覆盖界面正文、提示、可访问名称、展开报告和全部方法设置；运行 `npm run ui:test:web`，未翻译条目会使检查失败，清单写入 `.ui-artifacts/<运行编号>-web/i18n-coverage.json`。
- SVG 仅悬停播放；Spotlight、Tab、主题、三环和折叠增加平滑过渡，遵守“减少动态效果”。文字缩放扩展至 80%–200%，强调文字与边框跟随主题，连接桥改为窄腰柔光。
- 自动保存、主动检测和导出显示 toast；macOS/Windows 使用系统保存窗口导出，系统通知由常驻灵动岛发送，设置提供测试通知。
- 水杯等单题默认 300 秒、16384 输出 token，可分别调至 30–900 秒和 512–65536 token；证明题保留人工复核。
- Meow 升至上游 4.5.4 正式基准，支持 Responses、Messages 与 Chat Completions。GPT 三档为 32/48/96 请求，Claude 为 48/72/120；另保留 6 请求预览档。上游 Python 与本地评分 192 案例对照通过。
- 收录提供的 7727 条 OpenRouter 可信端样本，按 17 个模型、16 道题及采样条件展示参考频数。这批样本用于参考分布展示，评分参数与阈值仍使用上游正式版。
- KBF 接入 16 个公开历史模型参考、4359 个探针，支持一批试采及完整 CP99/单侧二项检验。One Token 提供 10 类英文任务；Astra 提供原帖五组任务的观测适配。

One Token / Astra 默认每题 1 次预览。要建立参考，在可信渠道设每题至少 10 次，核验完成后从“历史核验报告”导出分布档案；随后在“设置 → 核验 → 核验校准档案”导入。比较要求模型、协议、提示词和采样参数一致；导出档案不自动生成判定阈值。Astra 原帖未公开精确题库/分布，One Token 未包含论文四语言全集。

`gpt56apidetector` 使用后续 Meow 实现。两篇 Juice 指定原文目前不可公开读取，仍列为待补资料；现有 Juice 原始观测和可信校准独立可用。Ztest 当前通过官网检测后导入报告。

## 0.3.0

- BazaarLink Probe 接入官方异步 API：每个四元组单独授权，快速／综合／上下文模式、持续间隔与每日轮数、进度、停止和报告持久化。重启恢复原 runId；启动确认丢失时暂停续测。逐题行为证据不合成为 IQ，不将报告签名视为模型身份认证。
- 单题默认完成后 60 秒再测，可设 5–3600 秒，每轮只发一次请求并复用其 TTFT、Cache、用量记录。按题目内容版本和四元组计算窗口内匹配数、有效比对数、比例、失败及总次数；超过 5000 条也完整计数。
- 首次启动跟随 macOS／Windows 本机语言，也可手动选择中文或英文；补充设置、引导、报告和状态的英文文案。题目原文与模型回答保留原始语言。
- 文字大小 80%–140%，任何主题可独立设置正文文字色；三种指标内部 SVG 动画、普通到专注环高亮，遵守减少动态效果设置。
- macOS 原生标题栏同步应用主题；内容约束在标题栏下，顶部搜索和切换控件保持可见。修复核心环说明超出卡片及远程表单被轮询重置。

### BazaarLink 费用与启用

在“模型核验”选择 BazaarLink Probe，审阅当前目标的 Key 发送和公开报告说明，保存检测计划，再开始检测。开启持续检测后，按配置间隔执行；关闭主动探测会暂停后续自动启动，已启动的远程检测可通过“停止并关闭持续检测”终止。

[官网 BYOK 说明](https://bazaarlink.ai/solutions/byok)：自有上游请求零加价，费用使用自有上游额度；默认无缝回退到平台路由时按平台价格计费，严格模式禁用回退。[Probe API 说明](https://bazaarlink.ai/probe-api-skill.md)：不另收检测服务费，token 由目标 Key 计费。官网控制内部探针请求数，远程每日轮数与本地请求预算分别计算。Modivue 不把未知费用显示成零。

官网 API 文档仍有旧版综合分／LLM judge 描述；当前网页已宣布移除总分。本适配只展示逐题结果、原始模型指向与警示，保留缺失字段。Ztest 仍支持官网检测后导入报告，不在后台绕过人机验证。

## 0.2.0

- 设置按横向分类排列，支持搜索、自动保存、范围校验与失败后保留草稿。
- `⌘K` / `Ctrl+K` 打开 Spotlight；上下键选择、Enter 跳转、Escape 关闭。结果分页，弹窗及背景锁定滚动。
- 中英文界面选择及系统语言跟随；保留模型原名、题目与原始检测数据。0.4.0 已补充方法长说明并纳入翻译扫描。
- 灵动岛极简态隐藏拖条及设置图标，进入普通态平滑恢复；模型底色与空环对比度可调。
- Meow 筛查 6 次，完整 GPT 36／72／108 次、Claude 60／90／120 次。候选命中与原始分数分别展示，折叠报告保持展开。
- Juice 提供单次原始观测和可信校准对照；HLWY 可用公共分布或可信 API；自定义单题支持问题与答案。
- Ztest 为独立多探针检测方式：打开官网完成检测后，使用报告 URL 或 JSON 导入，保存探针明细及原始报告。官网当前需要人机验证，Modivue 不在后台代填凭据；报告关联四元组时需确认归属，同一报告重复导入不会重复记账。

## Windows 预览版

解压 `Modivue-windows-x64.zip` 后运行 `Modivue.exe`。包内含 .NET 8 和 Node，首次使用需要 Microsoft Edge WebView2 Runtime。数据位于 `%LOCALAPPDATA%/Modivue`。托盘支持恢复窗口和退出；灵动岛支持悬停、拖动和左右吸附。

源码构建需要 Node.js 24、.NET SDK 8：

```powershell
npm ci
npm run windows:build
```

Windows 使用 CIM 发现进程、用户配置解析及代理／Hook 记录。进程存在本身不提供准确工作状态；Codex 的 macOS 文件锁采集不适用于 Windows。当前宿主已交叉编译通过，Windows 原生鼠标与多 DPI 实机验收待完成。

## Agent 内状态栏与命令工具

Claude Code 使用 [状态栏接入说明](cli/STATUSLINE-SNIPPET.md)。命令工具默认读取与桌面共享的 SQLite，不需要知道桌面动态端口，也不会触发付费检测。

```bash
node cli/modivue.mjs status
node cli/modivue.mjs watch --interval 5
node cli/modivue.mjs agents --json
node cli/modivue.mjs reports --model MODEL --hours 24 --json
```

通过 `--model`、`--base-url`、`--key-group`、`--reasoning-effort` 筛选四元组。`--url http://127.0.0.1:4173` 可显式读取运行中的服务。Codex 可调用该命令获取结构化指标；其内置状态栏不支持直接执行外部命令。

## 自动构建与发布

`main` 推送、Pull Request 和手动运行会检查 JavaScript、指标核心，分别构建 macOS 与 Windows，并上传 ZIP。推送与 package.json 一致的 `v*` 标签后，流水线发布 GitHub 预览版。版本号同时维护 package.json、lockfile、Info.plist 和界面页脚。macOS 使用临时签名，尚未配置 Developer ID 公证；Windows 包尚未配置代码签名。


## macOS 桌面应用

Modivue 的主交付物是原生 macOS 应用。它使用 AppKit 管理窗口，使用 WKWebView 呈现监测界面，并在应用进程内启动仅监听 `127.0.0.1` 的本地监测服务。数据保存在 `~/Library/Application Support/Modivue`。

```bash
npm run desktop:build
open dist/Modivue.app
```

构建结果为 `dist/Modivue.app`。应用默认显示透明灵动岛和统计窗口；鼠标进入模型圆环后，原生浮窗向左扩展并显示三个指标与历史曲线；点击模型打开对应统计窗口。统计窗口仅顶部系统标题栏可以拖动。关闭统计窗口不会退出监测，顶部菜单栏的波形图标可重新打开窗口、恢复灵动岛或退出应用；也支持右键菜单。

构建脚本会封装当前 Node.js 可执行文件及其动态依赖，不要求目标机器安装 Node.js 或 Homebrew。产物架构与构建机器一致；当前包为 Apple Silicon。预览包使用临时开发签名，尚未配置 Apple Developer 证书与公证，首次打开可能需要在系统隐私与安全设置中允许。

## 浏览器开发模式

```bash
npm run check
npm run dev
```

浏览器打开 <http://127.0.0.1:4173>。此模式用于前端调试。运行时要求 Node.js 22.5 或更高版本（使用内置 `node:sqlite`）。启动时由本地服务从 [models.dev](https://models.dev) 的 `catalog.json` 同步标准目录，不在仓库内维护静态模型清单；网络不可用时界面会标记未同步并保留原始模型名。

目录源固定为 [Models.dev catalog.json](https://models.dev/catalog.json)。服务每 6 小时检查一次更新，保存 ETag、上游修改时间和本地同步时间；`304` 只刷新同步时间，下载或解析失败时保留上次成功目录并标记为陈旧。Models.dev 是持续维护的跨提供方开源目录，规范 ID、原始渠道模型名和模糊匹配证据分别保存。

## 本地代理

显式配置上游地址后启动服务：

```bash
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
MODIVUE_ANTHROPIC_UPSTREAM=https://api.anthropic.com \
npm run dev
```

将 coding agent 的 OpenAI/Anthropic base URL 分别指向 `http://127.0.0.1:4173/proxy/openai/v1` 和 `http://127.0.0.1:4173/proxy/anthropic/v1`。每次流式调用会写入平台数据目录中的 SQLite，聚合接口为 `/api/summary`，明细可用 `/api/samples?model=模型名&baseUrl=渠道地址&keyGroup=密钥指纹` 查询；数据库只保存 key 的不可逆短指纹，不保存明文密钥。

多渠道可用 `MODIVUE_UPSTREAMS` 配置；协议下的键是严格匹配 `[A-Za-z0-9_-]+` 的路由 ID，值是对应 Base URL。旧的两个环境变量继续作为 `default` 路由，并在与 JSON 同名时优先：

```bash
MODIVUE_UPSTREAMS='{"openai":{"team-a":"https://openai-a.example/v1"},"anthropic":{"team-b":"https://anthropic-b.example"}}' \
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
npm run dev
```

默认路由仍使用 `/proxy/openai/v1/...`；命名路由使用 `/proxy/openai/team-a/v1/...`，Anthropic 路径规则相同。查询参数会原样转发。`GET /api/config` 仅返回按协议分组的路由 ID 与规范化 Base URL。Agent 的 Base URL 指向本机 Modivue 代理时，探针会解析回对应真实上游，同时在 Agent 信息中保留 `proxyBaseUrl`；路由缺失或无效时保留本地地址，并由递归保护跳过探测。

`GET /api/agents` 返回已启动会话和适配能力目录：Claude Code statusline/hook 心跳会记录 `session_id`、当前 `model.id`、工作目录和 prompt cache（参见 [Claude Code statusline](https://code.claude.com/docs/en/statusline) 与 [Hooks](https://code.claude.com/docs/en/hooks)）；Codex 通过正在持有的 thread writer lock 联合 `~/.codex/state_5.sqlite` 读取会话、模型、父子 Agent 和 turn 状态（参见 [Codex app-server](https://developers.openai.com/codex/app-server)）。`GET /api/agent-sessions?includeEnded=1` 提供详细会话历史。配置只读，不返回 token；静态配置本身不能成为主动探测目标。Herdr 通过前台 PID 补充权威状态。

当前有 15 个工具的选定提供方配置解析，另有 10 个存在/显式路由登记项；后续适配见 [ROADMAP.md](ROADMAP.md)。通用 CLI 根据运行进程的 cwd 读取项目配置，Node 包入口可被识别。Gemini、Qwen、Pi、OpenCode 已本地安装并启动验证；其余工具不能仅凭目录条目称为实机测试通过。

设置中的“可信 API 回答对照”支持 2 次试采样、16–100 次正式分布采集和停止。采样计入每日额度；Key 仅用于本轮。完成后选择“分布指纹”核验相同模型、协议和推理档位。自动采集不设置真伪阈值，详见 [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md)。手动核验返回 202，工作中显示排队，空闲窗口开始后展示有效样本与阶段进度。

IQ评测通过 `src/core/quality.mjs` 注册插件；`GET /api/quality/evaluators` 返回已注册评测器。未注册评测器时，界面保持“未评测”。

[Meow LLM Detector](https://github.com/chen-006/meow-llm-detector) 的 `meow-fingerprint-v2` 与其参考论文 [One Token Is Enough](https://arxiv.org/abs/2607.10252) 通过短答案分布判断待测 API 更接近候选池中的哪个模型。该结果适合作为模型身份一致性证据，不是 coding 能力或“智商”分数，因此 Modivue 不把匹配度写入IQ分数。IQ插件必须声明固定评测集、版本和条件后，历史记录才参与IQ趋势与降级告警。

代理支持 Chat Completions、Responses 和 Anthropic Messages 的流式响应。OpenAI Chat Completions 使用 `usage.prompt_tokens_details.cached_tokens`，Responses 使用 `usage.input_tokens_details.cached_tokens`；Anthropic 使用 `usage.cache_read_input_tokens`。所有字段都保留原始 JSON，TTFT 只从首个有效文本或工具事件计时。

主动探测默认开启；服务启动后会按设置间隔对当前运行中的 Agent 目标主动采样，页面加载不会额外重复触发请求。采样也可由设置中的开关暂停，并受 1–1440 分钟间隔、每日请求上限和单次输出 token 上限控制。服务会读取已配置且具有独立 API key 的 Claude Code/Codex 连接，也可用 `MODIVUE_PROBE_OPENAI_*` 和 `MODIVUE_PROBE_ANTHROPIC_*` 环境变量补充手动目标。协议、base URL、key 分组、规范模型和请求方式都相同时只探测一次；`POST /api/probe` 的手动运行同样遵守每日上限。探测会产生 provider token 消耗。Juice 原始整数只保留为证据，正式展示的是候选模型方向性；没有可信候选校准时会标记为证据不足。

## Herdr 宿主验证

macOS GUI 需要 WindowServer、辅助功能、事件发布和屏幕录制权限。已授权后，在 Herdr 中运行 `npm run ui:test`；结果和截图写入 `.ui-artifacts/`。也可分别运行 `npm run ui:test:hover`、`npm run ui:test:drag`、`npm run ui:test:menu`、`npm run ui:test:web` 与 `npm run runtime:test`。实现和权限说明见 [`tools/ui-driver/README.md`](tools/ui-driver/README.md)。

## Statusline

```bash
printf '%s' '{"model":{"display_name":"Claude 3.5 Sonnet"},"session_id":"demo"}' | node cli/statusline.mjs
```

Claude Code 的 `~/.claude/settings.json` 可将 `statusLine.type` 设为 `command` 并指向脚本。脚本只读取本地聚合数据，不会发起 API 请求。

Codex 的 `tui.status_line` 只接受 Codex 内置条目标识，不能运行外部 statusline 命令。Modivue 因此直接读取 Codex 的 app-server 状态库和 thread writer lock；无需替换 Codex footer。Claude Code 可以把 `statusLine.command` 指向 `node /绝对路径/Modivue/cli/statusline.mjs`，或在现有 statusline 脚本末尾调用 `node /绝对路径/Modivue/cli/agent-session.mjs`，两种方式都会产生会话心跳。Claude Code 官方 statusline 还支持 `refreshInterval`，建议设置为 5 秒以便空闲会话保持可见；SessionStart/SessionEnd hooks 可分别调用同一个 `agent-session.mjs` 记录开始和结束。
