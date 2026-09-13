## 2026-09-13 19:49 — 0.3.0 本轮交付

版本代码 `ff077bc` 已提交并推送 main 和 v0.3.0。标签流水线 https://github.com/systemoutprintlnhelloworld/Modivue/actions/runs/34755423096 成功；macOS arm64 和 Windows x64 ZIP 已自动构建并发布。下载 https://github.com/systemoutprintlnhelloworld/Modivue/releases/tag/v0.3.0 。本地最终 `dist/Modivue.app` 版本 0.3.0，构建与 codesign 校验通过。

本轮已实现：官方 BazaarLink 异步检测和持续计划、每目标同意与每日轮数、重启继续读取原 runId、停止重试与报告持久化；单题默认 60 秒且可设 5–3600 秒，每轮一次请求，按题目版本／四元组／时间窗口共享统计；默认跟随本机语言、补英文文案、80%–140% 文字缩放与独立正文颜色；三种 SVG 内部动画、普通到专注环高亮；macOS 主题标题栏和内容布局约束。修复轮询重置远程表单、环说明溢出、未完成报告导入。

验证：
- 原生 `.ui-artifacts/1789299137509-ui/result.json` 97/97 PASS，用户解锁后完成；原生悬停、拖动、吸附、跨窗口导航、引导、主题标题栏和内容区通过，details/hover 截图已审阅。不再要求解锁或重复原生回归。
- 网页 `.ui-artifacts/1789299505308-web/result.json` 40/40 PASS，main/BazaarLink 截图已审阅。覆盖独立单题调度、版本隔离、远程合约、表单保留、自动保存、语言、字体、SVG 动画与减少动态效果。
- `.ui-artifacts/question-window-20260913.json`：5010 条窗口全部计数，报告列表仍保持 5000 条上限。
- `.ui-artifacts/bazaarlink-resume-20260913.json`：跨进程按原 runId 恢复、进度 404 后读取历史，无重复 POST；启动确认丢失转 start-unknown 并关闭自动续测。
- `.ui-artifacts/bazaarlink-boundary-20260913.json`：报告不返回目标 Key，运行中报告拒绝导入，无 status 但有有效 completedAt 的历史报告可导入，停止失败持久化原 runId 并重试。5 项 PASS。
- JS/core/macOS 类型检查通过；最终 macOS 打包和签名通过；Windows 0.3.0 交叉编译 0 警告、0 错误。本轮隔离验收新增真实付费请求 0。

费用依据：BazaarLink `/probe-api-skill.md` 说明检测服务不另收费，token 由目标 Key 计费；`/solutions/byok` 说明自有上游零加价，默认平台回退按平台价收费，可用严格模式关闭。官方当前已移除综合总分；本适配保留逐题证据、不合成 IQ，也不把报告签名当模型身份认证。尚未对 Veridrop 作独立实现或漏洞结论。

完整 goal 仍进行中。Windows 实机／多 DPI／Hook，Cline/Roo/Continue GUI 实际请求，真实渠道同条件多批基线，以及部分动态错误和备选资料英文仍未完成。Juice 两篇指定原文公开不可读，保留待补；Ztest 当前为官网检测后导入报告。后续任务见 ROADMAP.md。

## 2026-09-13 18:38 — 0.2.0 发布与新增需求验收

GitHub 已通过用户 Safari 登录授权完成：仓库 https://github.com/systemoutprintlnhelloworld/Modivue ，发布 https://github.com/systemoutprintlnhelloworld/Modivue/releases/tag/v0.2.0 。v0.2.0 标签代码为 28975d4；macOS arm64 和 Windows x64 ZIP 均由 Actions 构建并发布，标签流水线 34752023183 成功。已启用本地版本控制，旧文中“没有 Git”属于历史记录，不再适用。

本輪新增：Spotlight 模态搜索与滚动锁；700ms 自动保存、输入验证和失败/切页保留草稿；主要界面中英文与系统语言跟随；极简拖条/设置透明；Ztest 独立外部检测报告导入和去重；Windows WebView2/托盘/拖动吸附及 CIM 进程发现；本地数据库 CLI status/watch/agents/reports。

验证：Web 35/35 PASS（.ui-artifacts/1789294964971-web/result.json）；原生 95/95 PASS（.ui-artifacts/1789295628543-ui/result.json，已审阅 initial/hover）；CLI 隔离四元组 TTFT 输出 PASS（.ui-artifacts/cli-status-0.2.0.json）；JS/core/macOS 构建通过，Windows 编译 0 警告 0 错误。Web 外层等待曾在 240 秒超时，worker 随后真实完成 PASS；已将等待预算调到 360 秒，没有重复提交运行中的任务。

仍未完成：Windows 原生实机与多 DPI，英文长说明全部覆盖，Cline/Roo/Continue GUI 真正请求，真实渠道同条件多批基准；Ztest 当前通过官网完成人机验证与检测后导入，不是后台无人值守。完整目标未完成，详情见 ROADMAP.md。没有新增真实付费模型请求。

## 2026-09-13 07:15 续作

- 旧桌面实例返回 `source=process,status=unknown` 时，前端、灵动岛和活动探测统一按 PID 显示 `running`；Herdr 明确状态仍优先。
- Juice 新增设置项：`单次原始观测`（1 次请求、保留原始整数、不输出方向）和 `可信校准对照`（同条件档案，最多 3 次尝试）。选中 Juice 后先显示请求计划与缺失条件，避免点击后才出现笼统“方案不支持”。
- Meow 设置默认改为 6 次 `screen` 筛查；完整档位请求数显示为 GPT 36/72/108、Claude 60/90/120。筛查不设强指向线；完整评分与上游 4.5.3 predictive 版本保持一致。
- 从上游固定提交 `4108256d0cdc151de3cebec2bd0f5cbbcb2def36` 下载并比对 GPT/Claude 官方基准 JSON，内容完全一致；JavaScript 评分与上游 Python `predictive.py` 56 组边界/参考场景对照，最大百分点评分差 `4e-13`，证据 `.ui-artifacts/meow-4.5.3-parity-20260913.json`。
- 报告当前结果和历史结果的 details 展开键已隔离；轮询刷新会保留请求明细、原始 JSON 和日志展开状态。模型分布表保留“参与样本”文案，避免误读为候选各自命中次数。
- 最新 Web 回归 `.ui-artifacts/1789283284239-web/result.json` PASS，包含 Juice 单次原始观测、Meow 6 次筛查、报告/日志折叠持久化；`npm run check`、`npm run test:core`、`npm run desktop:build` PASS。
- 最新原生回归 `.ui-artifacts/1789283667991-ui/result.json` 在启动、API 和构建断言通过后，于指针定位阶段返回 `UNTESTED: pointer differs from the requested model position`；这是宿主坐标/遮挡条件，未进入产品交互断言，不能记为功能失败。拖动脚本仍已修正为按窗口尺寸重新发现主窗口。
- 上游资料确认：Meow 4.5.3 网页和本地版共用公开 predictive 基准；旧帖子中的 Juice/长上下文伪装属于早期版本，当前 Modivue 已明确标注版本差异，未声称完整复刻旧版全部防伪组合。

# Modivue 交接文档

## 2026-09-13 续作收尾

- 历史核验 API 现在以 `reportDetails` 提供 Meow 补充参考/特征命中信息，原始 `metadata` 和候选评分保持不变；续测费用只累计链末记录，失败请求、零费用和未知价格均按实际状态处理。
- Web 回归 `.ui-artifacts/1789291087235-web/result.json` PASS，新增上述两项断言；`npm run check`、`npm run test:core`、`npm run desktop:build` PASS。
- `src/data/agent-icons/NOTICE.md` 已同步为 Lucide `sparkles`；Juice 参考帖 2555348/24576294 当前公开访问为页面不存在或私有，已在题库参考中标记“待补资料”，未冒充已接入。

## 当前续作补充（2026-09-13）

- 核验状态原因现在区分协议不匹配、基准未覆盖和校准缺失。
- Meow 新增 `screen` 筛查档，每个公开探针 1 次，共 6 次；设置页明确说明它与上游本地包的 Juice/反探测组合不同。
- `/api/agents` 返回每个登记 CLI 的安装、配置、模型和凭据布尔状态，不暴露凭据内容；当前本机检查 25 个登记 CLI，其中 4 个已安装且可解析。
- Claude 明确 Herdr 状态优先；无状态但存在进程或 transcript 时显示 `running`，当前 Herdr 实况为 `idle`。
- 最新验证：`npm run test:core`、`npm run check`、`npm run desktop:build`、`npm run ui:test` 均 PASS；原生结果 `.ui-artifacts/1789279628610-ui/result.json`。
- 后续 Claude 合并修复按 PID/Pane 去重 transcript 与 Herdr 行；直接探测结果仅保留一个 Claude 节点（当前 Herdr `idle`）。一次再次提交原生任务时因已有主人实例占用应用动作返回 `Application action rejected`，未关闭该实例；不得将该次启动阻断误记为功能回归失败。
- 通用 CLI 在仅有进程证据且没有 hook 状态时统一显示 `running`，避免把活跃进程显示为未知；Herdr 明确的 `planning/tool/waiting/idle/done/error` 仍优先。
- 最新 CLI 隔离回归 `.ui-artifacts/1789280352627-cli/result.json`：Claude、Gemini、Qwen、Pi、OpenCode、Aider、GPTMe 均 PASS，全部使用本地受控上游，0 付费请求。
- `/api/agents` 进一步标注隔离安装路径与适配回归 PASS；当前 Aider、Gemini、Qwen、Pi、OpenCode、GPTMe 可被识别为隔离环境安装。最新 Web 回归 `.ui-artifacts/1789281215071-web/result.json` PASS。

## 最新续作（2026-09-13，CLI 与 HLWY 续测更新）

本节覆盖下文 2026-09-12 的旧行为说明。完整目标仍未完成。

### 2026-09-13 13:20 修复
- Claude 进程/开放 transcript 在 Herdr 尚未发出状态时不再显示“状态未知”；保留 Herdr 明确的 idle/running/planning/tool 等状态。
- 候选模型分布表将“匹配次数”改为“参与样本”，并明确说明同一组有效样本分别与候选参考分布比较，避免把总样本数误写成候选命中数。
- 核验报告详情折叠区增加按记录 ID 保存的展开状态，轮询刷新后请求明细与原始 JSON 保持展开。
- 核验状态文案区分校准、协议、基准覆盖等前置条件，不再统一显示“方案不支持”。
- Agent 状态区显示已登记 CLI 总数、可解析配置数和仅进程发现数；当前 API 返回 25 个登记工具，其中 15 个可解析配置能力。隔离 GUI 扩展已核实 Cline 4.1.17、Roo Code 3.54.0、Continue 2.0.0。
- `scripts/host-test.mjs` 原生三指标断言同时接受 AXButton/AXCheckBox。
- 验证：`npm run check`、`npm run test:core`、`npm run ui:test:web`、`npm run runtime:test`、`npm run ui:test` 均 PASS；原生 UI 最新结果 `.ui-artifacts/1789276700346-ui/result.json`。
- 同轮 CLI 隔离回归 `.ui-artifacts/1789276913811-cli/result.json`：Claude、Gemini、Qwen、Pi、OpenCode、Aider、gptme 共 7/7 PASS，均使用本地受控上游，0 付费请求；其它登记工具不应被描述为已完成实机请求验证。

- 已接入 `src/core/preferences.js` 的主题、颜色、轮廓、容量、动画、hover 与调度偏好；修复服务端静态白名单缺失导致整个前端模块不启动，以及旧设置表单读取已移出控件导致保存失败。
- 灰色椭圆缓冲条；normal 动态 1–12 槽位，边界 hover 滚动；focus 固定三指标；透明原生窗口保留详情空间，可见边框独立动画。
- 首次 spotlight 与设置重播；加载持久化设置后决定是否显示，支持 Escape。Agent SVG 固定版本本地打包，构建脚本已支持数据子目录。
- Claude Hook/存储支持 running/planning/tool/waiting/error；Herdr 优先明确状态；当前真实 Claude 进程已按 PID/cwd 识别为 idle，CLI 回归已验证 running/tool/ended 多阶段流转。
- 自适应策略允许工作中及长期待命目标串行探测，同渠道 Key 默认间隔 20 秒，失败默认冷却 60 秒；仅空闲/只手动可选。没有改写核验方法的采样条件。
- 最新已完成 Web：`.ui-artifacts/1789229812177-web/` PASS，包含单槽位上下滚动、主题/引导持久化、三形态、重播/Escape、390px 移动视口无表单溢出及无控制台错误。Runtime `.ui-artifacts/1789229020780-runtime/` PASS；check/core 与图标递归打包通过。
- 2026-09-13 00:38 解锁后运行 `npm run ui:test`，`.ui-artifacts/1789231058952-ui/` 的 56 项检查全部 PASS。包括 10 次悬停/离开循环、静止悬停稳定、三指标及详情不裁剪、模型位置稳定、点击详情保留选择、设置页、标题栏/内容区拖动边界、左右吸附与向内展开、菜单退出。已审阅 hover、左右浮窗、设置页和菜单截图；测试应用及 Node 子进程均已退出，`w1:p8` 恢复空闲。
- 原生普通形态容量上限、上下边界滚动及灰色缓冲条提示仍由 Web 用例覆盖，未进入现有 56 项原生专项；原生主体交互已通过。旧锁屏记录 `.ui-artifacts/1789227997361-ui/` 保留为历史 UNTESTED。
- 新详细报告：`VERIFICATION-REPORT-2026-09-13.md`。7 个 CLI 已完成本地受控请求与严格识别，Claude 多阶段 Hook 已验证；Aider 0.86.2 与 gptme 0.33.0 也已实际请求并通过。付费证据仍仅既有可信 API 2 次，不把受控 JSD/HLWY 分数当真实模型效果。
- 2026-09-13 CLI 严格实测 `.ui-artifacts/1789236815227-cli/result.json` 7/7 PASS。Claude、Gemini、Qwen、Pi、OpenCode、Aider、gptme 均实际请求、回答、样本和四元组识别通过，0 付费请求；Claude 另外验证 `running -> tool -> running -> ended`。gptme 的额外 `gpt-5-mini` 请求是自动会话标题，已按模型分别记录。
- 2026-09-13 CLI 回归 `.ui-artifacts/1789236815227-cli/result.json` 为 7/7 PASS。gptme 的额外 `gpt-5-mini` 请求是自动会话标题，已按模型分别记录；Gemini 路径模型也已从请求 URL 归属。应用包已重建，`npm run check` 与 `npm run test:core` 通过。后续原生任务因再次锁屏返回 UNTESTED，不覆盖此前已完成的 `1789231058952-ui` PASS。
- 最新解锁后原生回归 `.ui-artifacts/1789238534593-ui/result.json` 为 56/56 PASS。真实启动、悬停展开/收起 10 次、三指标与详情不裁剪、标题栏/内容区拖动、左右吸附与向内展开、菜单退出均通过；测试应用和 Node 子进程已退出。
- 后续原生拖动专项期间桌面再次锁屏，最新结果被框架标记为 `UNTESTED`；代码已将释放吸附改为完整 frame 动画，并在面板缩放后重新发布布局，待保持解锁后复测。
- 当前 `/api/agents` 实读的 Claude 进程为 `source=process`、`status=idle`、`displayStatus=idle`、cwd `/Users/popbomb/Modivue`；Herdr pane 同样报告 `idle`。旧桌面实例仍可能显示截图中的“状态未知”，重启 Modivue 后加载最新构建；Claude 真正开始前台工作时由 Herdr/Hooks 更新为 `running` 或 `tool`。
- 本轮原生回归 `.ui-artifacts/1789245046869-ui/result.json` 为 95/95 PASS：包含横条/竖条跟随鼠标、释放动画与左右吸附、缓冲条点击/拖动、指标跨窗口导航、设置分类和灵动岛四步引导。截图已审阅 `native-tour-2.png`、`native-tour-4.png` 与两侧扩展详情。
- 本轮 Runtime `.ui-artifacts/1789244814139-runtime/result.json` PASS，新增受控 HLWY 可信 API 对照：参考 50 次 + 目标 50 次，严格 low/temperature 1/maxOutputTokens 256/同提示词，匹配度 100%，仅使用本地受控上游，真实付费请求 0。Web `.ui-artifacts/1789245048113-web/result.json` PASS，含 25 个适配器目录、动态高度滚动、设置与题库持久化、可信 HLWY 回退。
- Agent 标签已改为本地 SVG 图标，状态文字通过悬停 tooltip/无障碍标签提供；“方案不支持”与“校准不可用”分开显示。Claude 的未知状态不再由进程存在强行推断，当前实读仍为 Herdr `idle`，需在真实前台工作事件到达时验证 running/tool。

以下为上一轮历史记录。

更新时间：2026-09-12 22:20  
项目：`/Users/popbomb/Modivue`  
交付：`dist/Modivue.app`（AppKit + WKWebView + 本地 Node）

## 1. 已完成的本轮需求

悬停不再依赖应用激活。原生 WebView 以 80ms 定时读取鼠标坐标，前端去重；窗口焦点不参与保持展开。首次进入先 normal，550ms 后进入 focus；normal 内切换模型停留 220ms。离开延时 240ms / 原生收起 400ms。蓝色“全部”内侧缓冲条可悬停或点击返回 normal，左右吸附镜像显示。

手动核验立即返回 202，界面显示已排队或正在核验。队列按目标身份与方法去重，工作中暂停，获得短 idle 窗口后执行；关闭自动探测不撤销手动排队。队列目标消失后清理。性能探针暂时失败不再吞掉本轮核验；鉴权失败、工作状态变化与预算耗尽仍停止请求。

主面板、悬浮详情、核验页共用状态解析，展示排队、等待空闲、采样、间隔、重试、有效样本数和耗时。每 2 秒更新进度；任务结束刷新历史。不能把已排队说成已完成。

设置新增可信端采样入口：支持 Chat Completions / Responses / Anthropic Messages、模型、提示词、档位、温度和输出上限；试采样固定 2 次，不改档案；正式采样 16–100 次，将答案频数保存为既有 v2 概率参考。中止后保留当前进度，当前请求可能完成，不再启动下一条。Key 不返回、不落盘；请求沿用串行探测与每日额度。正式采集覆盖该模型记录，保留其他模型。

## 2. Agent 支持层级

| 层级 | 工具 | 能力与证据 |
| --- | --- | --- |
| 实机现有会话 | Codex、Claude Code | Codex lock/SQLite/rollout；Claude transcript/hook/process；Herdr PID 关联。最新只读结果 Claude idle，Codex working |
| CLI 已安装启动 | Gemini CLI、Qwen Code、Pi、OpenCode | 四者真实进程及 cwd 识别通过；版本分别 0.59.0、0.23.3、0.73.1、1.18.30；未登录/提交任务 |
| 其他选定提供方解析 | Aider、Goose、Continue、Grok Build、Hermes、OpenClaw、GPTMe、Cline、Roo Code | 合计 13 个通用解析器，连同 Codex/Claude 共 15；选定渠道模型/URL/Key 隔离检查通过 |
| 存在或显式路由 | Amp、Cursor Agent、Warp、Windsurf、GitHub Copilot、Amazon Q、Trae、CodeBuddy、Junie、Plandex | 有登记、进程识别或完整 MODIVUE 显式路由覆盖；没有这些工具的原生当前提供方解析，不计入 15 |

通用进程只匹配执行文件和包路径，不在提示词中做子串匹配；避免把 shell 命令中的“pi”等文本误认成 Agent。读取真实 cwd 的项目配置及可识别的 `--model/-m`。Herdr 的状态来源优先，使用前台 PID 关联，不按模型名猜会话。没有可信运行态时保留 unknown，不能编造 idle 并发付费请求。

配置只解析选中的 provider，不递归拼接其他 provider/MCP 的模型、URL 和 Key。存在多个聊天模型而无当前选择时返回 ambiguous。编辑器 SecretStorage、订阅 OAuth、shell 内局部环境变量不等于独立 API Key；缺路由时可用代理观察，不能借其他渠道凭据。Cline/Roo/Continue 等 GUI 未下载测试；Warp/Windsurf/Trae 有原生包进程路径识别，但仍属于存在层级。

参考资料实际读取：
- [CC Switch Grok 配置源码](https://raw.githubusercontent.com/farion1231/cc-switch/main/src-tauri/src/grok_config.rs)：`models.default` → `model.<selected>`、`api_backend`、`env_key`。
- [CC Switch Hermes 配置源码](https://raw.githubusercontent.com/farion1231/cc-switch/main/src-tauri/src/hermes_config.rs)：`model.provider` → `custom_providers`。
- [Herdr Agents](https://herdr.dev/docs/agents/)：前台进程识别、每 pane 单一状态来源、hook 与 screen manifest 的适用边界。
- 本地 Pi model-registry、Gemini paths/请求代码及四个 CLI 自带 help/version。

## 3. 代码地图

| 文件 | 职责 |
| --- | --- |
| `desktop/ModivueApp.swift` | 原生窗口、鼠标位置、详情、吸附、菜单、服务子进程 |
| `app.js` / `styles.css` / `index.html` | 三种状态、缓冲条、图表、核验进度、可信端表单 |
| `src/core/agent-adapters.mjs` | 工具目录、选中提供方解析、CLI 入口匹配 |
| `src/core/agents.mjs` | 运行会话、cwd 配置、Herdr 权威状态、被动 Cache |
| `src/core/probe.mjs` | 串行请求、202 队列、预算、暂停、进度及核验调度 |
| `src/core/trusted-calibration.mjs` | 可信端采样、取消、进度、生成 v2 校准 |
| `src/core/calibration.mjs` | 档案校验及原子写入 |
| `src/core/evaluator-*.mjs` | 概率、Meow、Juice、HLWY 原始证据 |
| `src/core/proxy.mjs` / `metrics.js` | OpenAI/Anthropic/Gemini SSE 与真实 usage/TTFT |
| `server.mjs` | 仅 localhost API、静态资源与代理 |
| `tools/ui-driver/` / `scripts/host-test.mjs` | 已授权 Herdr 回归与截图证据 |

可信端 API：`POST /api/iq/calibration/collect` 开始（202）；GET 查询；DELETE 停止。现有 `GET/PUT /api/iq/calibration` 导入仍可用。将模型核验方法选为“分布指纹”后，目标按同提示、次数、输出上限、温度及档位采样。自动生成记录包含 source、wireApi、protocol、referenceSampleCount、collectedAt；协议/档位不一致时不请求。

## 4. 验证证据

| 验证 | 结果与位置 |
| --- | --- |
| check / core / 最终原生构建 | PASS；构建日志 `.local/final-build.log` |
| 受控 runtime | PASS，`.ui-artifacts/1789222243327-runtime/result.json` |
| 完整 browser + 新采样表单 | PASS，`.ui-artifacts/1789222470468-web/result.json` |
| 原生完整 UI | PASS，`.ui-artifacts/1789222290695-ui/result.json`；10 次 hover/leave、三环、详情、拖动、吸附、退出 |
| 通用解析与渠道隔离 | PASS，`.local/adapter-verification.json`；13 个解析器，歧义/缺 Key/shell 误报检查 |
| 四个 CLI 真实启动 | `.local/cli-smoke/result.json`，每个进程和 cwd 均识别；缺凭据不进入主动目标 |
| Gemini 原生流协议 | PASS，`.local/gemini-verification/result.json`；思考片段不触发 TTFT；受控 TTFT 119ms、Cache 40% |
| 可信端真实 2 次请求 | `.local/verification-live/result.json`：gpt-5.4-mini、Responses、low、128 token 上限；均 OK；输入合计20、输出33、费用未知 |

runtime/browser 包含：202、队列去重、自动关闭仍手动执行、可信端 2 次不写档案/16 次正式保存、缺基线零请求、有效样本/失败记录、概率与 Meow 续测、被动 Cache 去重。受控 provider 数值不能当真实渠道证据。原生 hover 截图和 browser 可信端表单截图已经视觉审阅。

早一次原生任务因专用 shell 残留字符未启动；后一次因锁屏返回 UNTESTED。用户解锁后完整回归 PASS。不要把这些旧失败重新当成当前阻塞。

## 5. 数据和产品边界

- 模型核验不是通用 IQ，也不认证真实身份；JSD、HLWY、Juice/Meow 保留各自量纲。
- 可信端由用户指定。`https://api.oaipro.com/v1` 是用户选定参考，不标作 OpenAI 官方接口。2 次真实请求只验证流程。
- 自动生成基线的 `maxJsd=null`，没有校准真伪阈值。16 次下限不保证统计充分；单一固定答案也不能区分模型。温度留空记录为请求未指定，不能证明不同提供方默认参数相同。
- Cache 只用明确 usage，TTFT 只用有效内容到达时间。Gemini 思考 token 计入输出用量；思考文本不算首个有效回答。当前 Gemini 支持主动直连采集；通用本地代理公开路由仍为 OpenAI/Anthropic。
- 自动核验只在一轮结束后 3 秒至 15 分钟 idle 窗口执行；工作中暂停，长期 idle 不测，完整轮至少间隔 15 分钟。
- 概率、Meow 与 HLWY 中断均可续测并保存有效样本；Juice 缺可信档案时不请求。
- 队列和正在采样的进度是内存状态；重启不恢复手动排队。已完成样本和校准档案持久化。
- 不能声称所有 25 个工具均有完整适配或均经真实工作流测试。下一阶段应补剩余 10 个提供方解析及 GUI/订阅鉴权的明确数据来源。

## 6. 操作规则与后续入口

先读 AGENTS.md、CONTEXT.md；继续使用 ponytail 的最小根因实现。项目没有 Git，不初始化、不提交、不建分支。四个测试 CLI 安装在 `.local/agent-clis`，未全局安装，未下载 GUI。

Herdr 专用 pane：`w1:p8` ui-runner、`w1:p9` runtime；runtime/web 共用锁，必须串行。用户工作 pane 不允许输入；最近 Claude 移到了 `w1:pG`，旧 `pE` 不应硬编码为当前会话。测试只关闭自己启动的进程；不修改 TCC、用户 shell 或现有 Agent 配置。不要打印/保存 API Key。

常用命令：

```bash
npm run check
npm run test:core
npm run runtime:test
npm run ui:test:web
npm run ui:test
npm run desktop:build
```

下一阶段的真实限制：补剩余工具的当前提供方/生命周期来源；覆盖不同实际 API 协议和订阅路线；如要得出可信身份判断，先进行同条件多批参考实验并校准阈值。不要新增 IQ 合成分或为这些尚未确认的研究任务建立额外框架。
