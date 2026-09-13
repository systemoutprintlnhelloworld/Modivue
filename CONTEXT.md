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

# Modivue 术语

| 术语 | 定义 |
| --- | --- |
| 模型 | coding agent 调用的语言模型，标识包含提供方、模型名称和可获得的版本信息。 |
| 提供方 | 实际提供模型接口的服务。相同模型名称在不同提供方下分别观察。 |
| 调用 | 一次模型请求及其响应。重试是另一次调用。 |
| 模型核验 | 展示分布匹配、概率探针与 Juice 的定量证据，以及与基线一致、偏离基线或证据不足的定性状态。不合成为 IQ 分；不等于对真实模型身份的认证。 |
| HLWY 匹配度 | 根据上游公开的随机数分布基准，用众数距离、余弦相似度和自然对数 JS 散度计算的 0–100% 相似指数。不是人类智商或模型真伪概率；上游未记录推理档位，保留条件差异。 |
| 概率探针 | 将短答案的多次独立采样分布与同条件可信端参考分布比较，保存底数为 2 的 JSD 距离、频数与样本数。距离为 0–1，越低越接近，不是模型真伪概率或能力分。 |
| Juice 值 | 按指定模型、推理档位及提示模板观测到的推理预算相关响应。保留原始值、校准范围与检测状态，不将未支持模型判作零分。 |
| 核验校准档案 | 由可信端实验生成的提示词、答案分布、Juice 范围、采样条件与推理档位，带来源和修订号。自定义概率探针与 Juice 需要档案，缺少档案时仅做一次明确标注的原始观测，不给出方向结论；HLWY 使用自动更新的上游公共基准。 |
| 单次请求总耗时 | 从发出请求至响应结束的时间，单位毫秒；与 TTFT 分别记录。平均值仅聚合完成的有效请求。 |
| 测试费用 | 检测请求的费用记录。提供方明确返回的扣费记为实际费用，依据在线价格与 token 用量计算的值记为估算费用，信息不足记为未知。 |
| 评测集 | 用于比较模型能力的一组固定任务，具有明确版本和评分依据。 |
| 首字响应时间 / TTFT | 从客户端发出模型请求到收到首个有效输出内容的时间间隔，单位为毫秒。纯文本与工具调用的首个有效内容要按提供方协议明确界定。 |
| 缓存命中 token | 提供方明确报告为缓存读取的输入 token。缓存写入 token 不属于命中 token。 |
| 缓存命中率 | 缓存命中 token 占同一统计范围内全部输入 token 的比例。输入总量为零或提供方没有相应数据时，该比率未提供。 |
| 样本 | 一条包含采集条件和原始字段的调用记录，或一次具有评分依据的评测记录。 |
| 采样条件 | 影响比较结果的请求设置，包括模型、提供方、任务、上下文规模、并发和采样时间。 |
| 时间范围 | 一次查询或聚合覆盖的采样时间区间。 |
| Agent 会话 | 一个当前打开的 coding agent 顶层会话。子 Agent 归属于父会话，在详细视图展开，不单独占用快速监控节点。 |
| 监控目标 | 由规范模型、base URL、Key 分组和推理档位共同确定的测量对象。同一目标可绑定多个 Agent 会话，主动探测只执行一次；协议与采样条件属于请求记录。 |
| 未提供 | 上游没有返回计算该指标所需的数据。 |
| 未评测 | 尚未按确定的方法完成质量评测。 |

## 2026-09-13 18:38 — 0.2.0 发布与新增需求验收

GitHub 已通过用户 Safari 登录授权完成：仓库 https://github.com/systemoutprintlnhelloworld/Modivue ，发布 https://github.com/systemoutprintlnhelloworld/Modivue/releases/tag/v0.2.0 。v0.2.0 标签代码为 28975d4；macOS arm64 和 Windows x64 ZIP 均由 Actions 构建并发布，标签流水线 34752023183 成功。已启用本地版本控制，旧文中“没有 Git”属于历史记录，不再适用。

本輪新增：Spotlight 模态搜索与滚动锁；700ms 自动保存、输入验证和失败/切页保留草稿；主要界面中英文与系统语言跟随；极简拖条/设置透明；Ztest 独立外部检测报告导入和去重；Windows WebView2/托盘/拖动吸附及 CIM 进程发现；本地数据库 CLI status/watch/agents/reports。

验证：Web 35/35 PASS（.ui-artifacts/1789294964971-web/result.json）；原生 95/95 PASS（.ui-artifacts/1789295628543-ui/result.json，已审阅 initial/hover）；CLI 隔离四元组 TTFT 输出 PASS（.ui-artifacts/cli-status-0.2.0.json）；JS/core/macOS 构建通过，Windows 编译 0 警告 0 错误。Web 外层等待曾在 240 秒超时，worker 随后真实完成 PASS；已将等待预算调到 360 秒，没有重复提交运行中的任务。

仍未完成：Windows 原生实机与多 DPI，英文长说明全部覆盖，Cline/Roo/Continue GUI 真正请求，真实渠道同条件多批基准；Ztest 当前通过官网完成人机验证与检测后导入，不是后台无人值守。完整目标未完成，详情见 ROADMAP.md。没有新增真实付费模型请求。

# 当前交接摘要（2026-09-13 04:35）

最新原生完整回归 `.ui-artifacts/1789245046869-ui/result.json` 为 95/95 PASS，包含横竖拖动、释放吸附动画、缓冲条动态高度/点击、指标跨窗口四元组导航和灵动岛四步引导。修复使用事件坐标计算拖动，并在 `windowDidResize` 同步 WebView，避免吸附后视口宽度残留。透明原生宿主仍保留 420pt，不能把它误认为可见边框的最小高度。

最新 Web `.ui-artifacts/1789245048113-web/` 25 项 PASS；Runtime `.ui-artifacts/1789244814139-runtime/` 15 项 PASS，增加 HLWY 可信分布 50 次参考 + 50 次目标的同条件 HTTP/SSE 链路，均为本地受控回答，真实付费请求 0。设置已有分类搜索、多处透明度、指标/信息显隐、阈值配色；内置糖果题/水杯题和用户题目存入 SQLite，参考方案保存在 `src/data/question-tests.js`。Juice 可选择单次原始观测（未校准）或同条件可信校准对照；无校准时不输出方向结论。

Cline 4.1.17、Roo Code 3.54.0、Continue 2.0.0 已安装在 `.local/gui-host/extensions`，未完成 GUI 实际请求与采集验证。各方法真实同条件多批评测仍未完成，完整 goal 保持进行中。下文为历史摘要。

最新续作见 `HANDOFF.md` 顶部与 `VERIFICATION-REPORT-2026-09-13.md`。本轮已经改为灰色胶囊、自定义普通高度/边界滚动、固定 focus 三项、可重播引导和自适应低频核验；下文的蓝色缓冲条及工作中总暂停属于旧状态。最新解锁后原生 `.ui-artifacts/1789238534593-ui/` 的 56 项检查 PASS；普通容量上限、上下边界滚动与缓冲条提示仍由 Web 专项覆盖。完整目标未完成。

项目目录：`/Users/popbomb/Modivue`。主交付物为原生 macOS `dist/Modivue.app`：AppKit + WKWebView + 仅监听 `127.0.0.1` 的 Node 服务。没有 Git 仓库，不进行初始化、分支或提交。

产品规则：只关注已启动的顶层 Agent；compact 只显示工作中目标；进入后先 normal，停留 550ms 才 focus；蓝色“全部”缓冲条返回 normal；离开即 compact，窗口焦点不锁定展开。详情默认关闭；左右吸附；顶部拖动；菜单栏右键退出。核验不合成 IQ，也不把分布相似度当身份认证。

本轮实现：
- 15 个工具具有当前提供方配置解析：Codex、Claude Code、Aider、Gemini CLI、OpenCode、Goose、Qwen Code、Continue、Pi、Grok Build、Hermes、OpenClaw、GPTMe、Cline、Roo Code。其余 10 个登记项仅有进程/显式路由支持，不能称为 25 个完整适配。
- 通用 CLI 识别可匹配 Node/Python 包入口；以进程 cwd 读取项目配置；Herdr 通过前台 PID 关联同一会话，并作为工作/待命状态来源。实机 Claude 已返回 `status=idle`，不再只修显示层。
- 手动核验返回 HTTP 202；重复请求去重；工作中排队，自动检测关闭时仍能执行手动队列；目标消失清理队列。主面板、悬浮详情、核验页显示等待、排队、采样、重试及有效样本进度。
- 设置页新增“可信 API 回答对照”：2 次试采样不写校准，正式采样 16–100 次保存 v2 分布；支持停止。请求串行并计入每日额度，Key 只在本轮内存使用。生成档案不自动设真伪阈值；选择“分布指纹”比较相同模型、API 协议和推理档位。
- Gemini 原生流式请求能够解析有效内容、usage 和缓存字段；思考片段不计作首个有效回答。

调度仍遵守：自适应策略允许工作中低频串行核验；仅空闲策略使用一轮结束后 3 秒至 15 分钟窗口；长期 idle 不自动测；新任务开始停止后续样本；完整轮至少间隔 15 分钟。概率探针、Meow 与 HLWY 均支持续测；完整轮仍受预算和条件限制。

本轮证据：check/core/原生构建通过；runtime `.ui-artifacts/1789237014820-runtime/`、web `.ui-artifacts/1789237401992-web/`、native `.ui-artifacts/1789238534593-ui/` 均 PASS。7 个 CLI 已在隔离环境实际请求并识别：Claude、Gemini 0.59.0、Qwen 0.23.3、Pi 0.73.1、OpenCode 1.18.30、Aider 0.86.2、gptme 0.33.0；付费请求为 0。13 个通用配置解析通过隔离渠道检查。可信 API 仍仅 2 次试采样，未生成真实身份结论。

已授权可信端真实试采样：`https://api.oaipro.com/v1`，`gpt-5.4-mini`，Responses，low，128 输出上限；2 次成功，回答均为 OK，输入 20 / 输出 33 token，费用未知。仅验证连通与采集流程，不生成身份结论；报告 `.local/verification-live/result.json` 不含 Key。

先读 `HANDOFF.md`、`MODEL-VERIFICATION.md`。专用 Herdr pane 为 `w1:p8`（ui-runner）、`w1:p9`（runtime）。用户工作 pane 不允许输入；pane 编号会变化，先只读确认。runtime/web 共用锁，顺序运行。测试只关闭自己创建的进程。
