## 2026-09-15 — Codex 五个重复项：Finder 启动根因修复

用户截图的 5 个是真实运行实例（PID 80684，服务 59241）返回的 5 个顶层记录；上一轮终端/隔离服务的 3 个结果未验证 Finder 环境，不能作为修复完成依据。该实例缺 HERDR_SOCKET_PATH/HERDR_SESSION，herdr 默认连接旧协议 default 会话失败，检测退回 writer-lock 与 process 记录，产生两个“已打开”及多余模型分组。

agents.mjs 现在发现默认 socket、显式 socket 及本地命名会话目录，独立读取各会话；process-info 使用该 pane 所属 socket。默认会话协议不匹配不再阻断 neo 的有效结果，无需重启 Herdr。

验证：check:js、test:core、diff --check、macOS 构建与签名通过；.ui-artifacts/finder-clean-oW42lk/agents.json 为最新原生包在精简 Finder 环境启动的实际 API，inheritedHerdr=false，pB working、p2/pQ idle，共 3 个。该测试仅启动并关闭自己的应用实例，保留用户原进程。带终端环境的 finder-launch-90lqob 只作为对照，不能代替精简环境证据。现有原生鼠标回归 1789484754296-ui 在构建后因重新锁屏 UNTESTED。

最新 dist/Modivue.app 已包含修复；用户仍运行的旧进程需通过“退出 Modivue”完全退出后重开此包。仅关闭详细窗口不会重启其 Node 服务。未提交或发布；其他六项反馈的原生交互待验状态见后文。

## 2026-09-15 — 六项反馈当前交付

本节优先于下方历史记录。代码与本地包已更新，原生交互尚未验收；不得用之前的原生 PASS 宣称本次导入、快捷键及玻璃效果已在桌面端验证。未提交、推送、创建分支或关闭用户应用。

- 专注形态和标准详细界面使用两组横向复选栏；专注支持余额单选及四环，计数变量传到共同容器，四环高度 316px、偏移按数量居中。标准界面支持四环或全不选，不再静默补回核验环；旧 overviewMetric 设置映射到新字段。窄屏 checkbox 保持 14px，独立可访问标签及英文切换已检查。
- Codex 按 Herdr pane、线程和真实 PID 合并，补全新发现会话的 statusSource。当前 API 快照与 Herdr 一致：pB working、p2/pQ idle，共 3 个顶层会话；数量是动态现场值，不是固定断言。Finder 启动的子服务 PATH 包含 Herdr 安装位置。
- 导入崩溃日志 `Modivue-2026-09-15-014145.ips` 指向 WebKit 文件选择完成回调未调用。共用 runOpenPanel 改为主队列延后显示所属窗口 sheet，选择/取消均回调，无可用窗口直接返回取消。公共导入保留设置分组过滤，校准上传服务端限制同步覆盖前端 5 MiB。浏览器取消、有效档案导入 200、无效档案 400 且原档案保留均通过；原生崩溃修复仍待实测。
- 原生菜单分成 Modivue 与 Edit，剪切、复制、粘贴、全选、撤销、重做经 responder chain 处理，并跟随界面语言。Swift 类型检查通过；实际 Cmd+C/V 尚未验证。
- HLWY 默认 10 次，可设 1–500；已有用户保存的样本数保留。少于 50 个有效样本标记 screen_preview，保留分布与相似度但不输出 directedModel/directionScore。受控回答验证 1 次、缺省 10 次、50 次请求数与预览标记，未请求真实付费模型。
- 毛玻璃主题修复通用背景覆盖渐变的 CSS 优先级，加入蓝青边缘辉光、半透明卡片和发光连接桥，保留透明度设置；极简关闭原生材质底板。详细窗口增加原生 NSVisualEffectView。其他配色保留，Graphite 恢复原色。浏览器截图已审阅；桌面背景穿透和原生材质观感待解锁后验收。

验证与交付：
- JS / i18n / core / Swift 检查通过。
- Web `.ui-artifacts/1789483419966-web/result.json`：48 PASS。随后最后的玻璃透明度与极简材质开关通过临时浏览器交互检查。
- `.ui-artifacts/feedback-sf3O1z/`：复选栏保存/窄屏、导入交互、HLWY 样本数、Codex API 快照、四环布局及 glass-main/glass-four-rings 截图；不是新建测试套件。
- Native `.ui-artifacts/1789483679289-ui/result.json`：build PASS，运行 UNTESTED（screenLocked=true）；未启动新的原生测试实例。此前 1789460584410 等 PASS 属于更早代码。
- 最新交付 `dist/Modivue.app`，本次最终构建及 codesign --verify --deep --strict 通过。版本号仍为 0.4.1，包含未发布工作区改动。

下一步只需在解锁桌面后验证当前包的文件选择取消/导入、详情文本复制粘贴、四环 hover 与真实玻璃材质；不要重新依赖历史 PASS 或关闭用户实例。更广的产品目标仍由 ROADMAP 管理。

## 历史记录：2026-09-15 原生 hover 复验（早于下述六项反馈修改）

- 修复 `desktop/ModivueApp.swift` 的 `applicationShouldHandleReopen`：激活灵动岛时不再因 `hasVisibleWindows == false` 错误打开主窗口；仅在灵动岛尚未创建时保留重新打开主窗口行为。
- 原生回归脚本引导步数与实际 7 步同步，避免把第 5–7 步误判为失败。
- `npm run ui:test` 最新结果：`.ui-artifacts/1789405112503-ui/result.json`，全部 PASS；`hover-expands-native-panel`、`hover-does-not-open-details`、10 次悬停循环、详情导航、拖动吸附、7 步灵动岛引导和菜单退出均通过。
- 本轮构建由 UI 回归完成，`npm run check:js` 通过。完整产品目标仍进行中，余额通知、Windows 实机、GUI Agent、官方 Ztest 和真实多批校准尚未完成。

## 2026-09-15 — 续作交接（本地最新）

本轮继续维护未提交工作区，未执行 commit、push、分支或清理。完整产品目标仍进行中。

### 本轮完成与验证

- 可信补充队列保留失败索引、重试退避、取消/鉴权/预算错误的当前样本，并支持“重试并继续”；成功样本不会重复。checkpoint 仍为进程内状态，不能声称重启恢复。
- 非 Juice 质量身份按模型、渠道和 Key 共享，不按推理强度拆分；Juice 保留严格强度匹配。路由排序与模型页名称说明已改为更直观的“候选模型匹配度”“分布差异（JSD）”。
- 普通形态支持四个独立复选框（模型核验、Cache、TTFT、余额），可全不选；余额单环和指标 kind 重建逻辑已接入。余额实际下降/充值与系统横幅仍未实机验收。
- v2 校准档案新增导出；公共 HLWY 基准导入服务端上限与前端统一为 5 MiB；One Token、Astra、Meow 和概率探针的完整观测可在满足每题有效样本数后导出为可再导入的分布档案。
- 新增英文映射后 `npm run ui:test:web` 通过；本轮最新 Web 回归目录为 `.ui-artifacts/1789402996060-web`，Runtime 为 `.ui-artifacts/1789403829782-runtime`。两者均由测试自行启动并回收进程。
- `npm run check`、`npm run check:js`、`npm run check:i18n`、`npm run test:core` 均通过。原生 hover 失败 `1789388835328-ui` 尚未定位，不能声称原生最终通过。

### 当前现场

- 当前只读 Herdr 快照包含动态 Codex 顶层 pane；`detectAgents()` 按 Herdr pane 与真实线程/PID 合并，不固定写死 Agent 数量。跨项目 pane 是否纳入取决于实际可见会话，不能用历史“三个”作为断言。
- 当前工作区包含大量既有未提交修改和新增验证资料，后续只修改与目标直接相关的文件；保留用户改动。

本节优先于下方历史记录。完整产品目标仍进行中。

### 当前代码与版本控制

- 工作目录：`/Users/popbomb/Modivue`。
- 本地 `HEAD` 与本地远程跟踪引用 `origin/main` 均为 `47e5375`（`fix: detect stale agent sessions without connections`）；本次未 fetch，不能据此确认服务器当前状态。工作区仍有大量未提交的业务修改及新增文件。本次没有 commit/push；用户此前要求积极同步 GitHub，继续发布时承接已有授权和项目规则。
- 本地最新应用：`dist/Modivue.app`，可执行文件修改时间为 2026-09-14 20:27:31。包版本仍为 `0.4.1`，包含发布标签后的改动，不能与 GitHub v0.4.1 安装包视为相同代码。保留此本地最新版本；旧产物归档/清理诉求仍需按已发布备份逐项核对。
- 上一轮记录 `check`、`check:js`、`check:i18n`、`test:core`、macOS 构建/签名及 Windows `net8.0-windows` 交叉编译通过；本次未重跑这些检查。

### 最近验证证据

- Web 最新通过：`.ui-artifacts/1789387504588-web/result.json`，48/48 PASS，完成于 2026-09-14 20:10:02。包含折叠/滚动保留、自动保存竞态、通知事件去重、JSONL 导出、Spotlight、核验队列和英文扫描；英文覆盖最终累计 46 个场景。旧摘要将场景数写成测试项数，已更正。不能据此声称余额系统横幅或官方 Ztest 端到端已验收。
- Runtime 最新通过：`.ui-artifacts/1789385735339-runtime/result.json`，27/27 PASS，完成于 2026-09-14 19:39:58，含 `water-proof-real-http-survives-46-seconds-through-local-proxy`。这是本地受控 HTTP 验证；真实渠道取得回答的记录见下方水杯说明。`manual-runtime3` 完成时间更早，不是最新运行。
- 早先 Web 英文扫描 `.ui-artifacts/1789385039448-web/result.json` 曾发现灵动岛“渠道余额 / 性能样本”未翻译；随后 48 项 Web 回归已通过，继续以 `npm run check:i18n` 和 `npm run ui:test:web` 复核，不要把旧失败当作当前状态。
- 原生最新结果：`.ui-artifacts/1789388835328-ui/result.json`，2026-09-14 20:27:40，状态 FAIL。10 项 PASS，随后 `hover-does-not-open-details` 断言失败，执行层另记一条 FAIL；悬停展开成功后出现同一测试 PID 的 1320×889 详情窗口。原因尚未定位，不能仅归因锁屏或旧实例。
- 原执行会话 `59604` 已在本次轮询收回上述失败结果，退出码 1；无需再轮询该会话，也无需等待后台完成。检查时未见运行中的 `host-test.mjs`；已有用户 Modivue 实例仍保留。
- 此前 `.ui-artifacts/1789386516329-ui/result.json` 为锁屏 UNTESTED，`.ui-artifacts/1789388705547-ui/result.json` 为指针坐标差异 UNTESTED。`scripts/host-test.mjs` 已优先使用当前 AX 节点坐标；不能用历史 v0.4.1 的 105 PASS 覆盖此次 FAIL。

### 已实现的需求边界

- Codex 会话按顶层线程去重；上一轮实读为 3 个 Codex（1 working、2 idle），此数字是当时快照，不应固定为下次会话预期。非工作 Agent 不自动核验，用户可手动启动、暂停、终止和插队；未开始工作的已发现目标也可主动核验。
- 余额刷新间隔为 15 秒；充值后以本周期最高有效余额更新满环基准，支持手动重置。余额环与模型核验环二选一，余额与检测费用分区。应用内/系统告警已有实现，真实低余额触发、通知权限和系统横幅仍待验收。费用顺序为 API 实际费用 > 渠道单价估算 > models.dev 单价估算。
- Meow、Astra、One Token 请求绑定当前四元组推理档位；Meow 六题筛查仅为预览并显示参考线，完整采样后才给结论。核验方式按可用性排序为卡片下拉，历史可按测试方式和单题筛选。
- `ztest-local` 在本机调用被测渠道执行五组兼容探针，Key 只发送至该渠道，不发送至 ztest.ai。官方 `ztest` 已有可见浏览器、真实 Turnstile、`/api/verify` 和报告轮询/导入流程，尚缺真实 Key 的官方端到端报告证据。两者不能共用官方评分声明。
- 水杯回答收集问题已有成功证据：上一轮真实 Codex 渠道请求 49.7 秒完成并保存完整回答；用户也已反馈长等待后能取得回答。实现使用 `timeoutMs=null` 和 Node `http/https` 原生流，避开 undici 隐含 300 秒超时，仍受上游失败和输出 token 上限影响，支持手动取消。解析保存 `parsedAnswer`、`answerMatched`、`proof` 和完整原文；模型回答 `7` 与参考 `8` 不同，证明仍待人工复核。回答收集修复不代表数学证明验收通过。
- 毛玻璃主题、穿透模式、Spotlight 搜索/滚动锁、平滑过渡、SVG 仅 hover 播放、自动保存和 toast 已接入 macOS/Windows 宿主。

### 下一会话入口

1. 阅读 `AGENTS.md`、本节和 `ROADMAP.md`；检查 `git status --short`，保留用户改动。本轮已完成原生 hover 修复与复验，不新增无关测试。
2. 若后续修改涉及原生窗口，再读取 `.ui-artifacts/1789405112503-ui/` 及 `scripts/host-test.mjs:172` 进行针对性复验。截图本次未重新审阅。
3. 测试入口见 `tools/ui-driver/README.md`。Herdr 上次使用 `w1:p8`，pane 会变，先确认用途；runtime/web 共用锁，必须串行。仅关闭自己启动的测试进程，不能直接关闭用户正在使用的实例。桌面状态现场检查，不重复依据历史记录要求解锁。
4. 按后续实际改动选择 `npm run check`、`npm run check:js`、`npm run check:i18n`、`npm run test:core`、`npm run runtime:test`、`npm run ui:test:web`、`npm run ui:test` 和构建。已有通过记录不因交接而全部重跑。
5. 其余未完成项及优先级见 `ROADMAP.md`。现有 Trellis 任务 `.trellis/tasks/09-08-iq-liquid-island/task.json` 保持 `in_progress`；继续维护这一套任务记录。

### 代码入口

| 需求 | 文件 |
| --- | --- |
| Codex 去重、会话合并 | `src/core/agents.mjs`、`server.mjs` |
| 手动核验、暂停/终止/插队 | `src/core/probe.mjs` |
| 余额与三层费用 | `src/core/balance.mjs`、`src/core/request-cost.js`、`src/core/proxy.mjs` |
| 核验条件与水杯解析 | `src/core/evaluator-{meow,astra,one-token,question}.mjs`、`src/core/trusted-calibration.mjs` |
| Ztest、BazaarLink 报告 | `src/core/ztest-browser.mjs`、`src/core/evaluator-ztest.mjs`、`src/core/bazaarlink-summary.js` |
| 历史筛选、告警、样式、原生窗口 | `app.js`、`styles.css`、`src/core/preferences.js`、`desktop/ModivueApp.swift`、`desktop/windows/Program.cs` |

以下保留历史过程记录；旧版的超时、Git 状态、基准和验收结论只适用于各自时间点。

## 2026-09-13 — 0.4.1 发布与最终原生验收

v0.4.1 已发布：https://github.com/systemoutprintlnhelloworld/Modivue/releases/tag/v0.4.1 。标签代码 a2e4640，发布流水线 34763066572 成功，包含 macOS arm64 和 Windows x64 ZIP。随后仅修订验收脚本与记录，提交 57a40f6 的两平台流水线 34764259270 成功；应用代码与 v0.4.1 一致，不需重发安装包。

原生完整回归 `.ui-artifacts/1789311386669-ui/result.json`：105 项 PASS。覆盖待命 Agent 展开、10 轮悬停、首次点击选中四元组与核验 Tab、概览三环、Cache/TTFT/核验跳转、JSONL 实际保存、四步引导、横竖拖动、左右吸附和菜单退出。已审阅本轮概览、核验页与专注引导截图；全屏 hover 截图含另一个应用实例的叠影，不作为单实例外观证据。原生点击验收已完成，不再因下面的历史失败要求用户解锁。

脚本按实际 selectedId/view 核对导航，在全待命时先悬停缓冲条展开模型，再验证模型环。之前用隐藏的概览文字验证核验页、将全待命隐藏环误判为缺失控件的问题已修正，保留精确四元组和页面内容断言。

44 个英文界面场景（含 title、placeholder、aria-label；主视图、全部方法/设置、三个新方法的展开报告、灵动岛三态及中英往返）全部无遗漏。完整 Web 47 项 PASS：`.ui-artifacts/1789309444661-web/result.json`；覆盖 One Token 分布档案实际下载读回、后台通知归属去重、KBF full 参考/错误、Astra/One Token 条件隔离与推理排除。已审阅英文灵动岛截图，环的缺失数值用 `--`，完整状态留在详情，修复英文长状态裁切。

0.4.0 已由 Actions 34761341850 发布两平台 ZIP，提交 945467a。0.4.1 使用统一 i18n 模板补动态标签，移除整个灵动岛 translate=no 和无用属性。JS/core、macOS 构建和签名通过。

系统通知横幅与权限仍未实机验证。完整目标未完成：Windows 实机、GUI Agent 真实请求、多批真实基准、Astra 作者原始数据及两篇 Juice 正文仍待完成；Ztest 当前为官网检测后导入。Trellis 保持 in_progress；宿主 goal 工具当前返回 blocked，未将目标标记 complete。

## 2026-09-13 — 0.4.0 当前改动

核验折叠/滚动采用原位更新；设置 PATCH 队列和版本检查防止旧响应回写，下拉即时反馈、历史按记录独立选择。SVG 仅悬停播放，Spotlight 打开/关闭、切页/主题/环/折叠过渡，快速重开取消旧关闭动画。窄腰连接桥，删除重复 logo 和无效更多按钮；文字 80%–200%，主题强调色统一，指标阈值独立。

单题默认 300 秒和 16384 输出 token，支持 30–900 秒和 512–65536。代理只向本机 Modivue 路由传递超时，再转上游时移除内部头。受控 46 秒真实 HTTP/SSE 水杯验收通过，证明仍人工复核；不再在 16000 字符截断答案。

原生 macOS NSSavePanel / Windows SaveFileDialog 导出，浏览器下载文件；自动保存/核验/导出 toast。系统通知从常驻灵动岛发出，主窗口显示 toast，避免隐藏主窗漏通知。设置有发送测试通知。macOS 系统通知权限及横幅尚待实际授权验收。

Meow 4.5.4 对应上游 bdb579f0496b70138f7c015344eb034a9f4c16e7，原协议 predictive.3 和 Chat chat.1 正式基准。192 组 Python/JS 对照通过，最大百分点误差 3.5527e-13。用户 zip 原件保留；7727 条 OpenRouter 样本按条件整理供参考分布展示，没有重新训练判定阈值。

新增 KBF 16 个公开参考、4359 探针、一批试采及完整 CP99/单侧二项检验；One Token 10 类英文任务与 Astra 五组观测适配。后两者每题 10 次有效样本后可导出 v2 分布档案，再导入做同条件 JSD；导出阈值为 null。KBF full 正确/错误、参考档案往返、模型/协议隔离和推理排除均通过受控验收。Astra 缺作者精确题库/分布、One Token 四语言未全复刻，两篇指定 Juice 原文不可读。Ztest 仍为官网检测后的报告适配。

运行记录：Runtime 25 PASS `.ui-artifacts/1789306639635-runtime/result.json`（包含水杯 46 秒）；JS/core/Swift 通过，Windows 编译 0 警告/0 错误。0.4.0 最终 Web/原生检查和发布状态见后续记录。完整 goal 保持 active，Windows 实机、GUI Agent 真正请求、多批真实基线等仍在 ROADMAP。

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
## 2026-09-14 — 长证明、余额与本地 Ztest 续作

- 水杯题固定使用 `timeoutMs=null`；代理无限时分支改用 Node `http/https` 原生流，绕过 undici 的隐含 300 秒 headers/body 超时，仍支持手动取消。真实当前 Codex 渠道请求 49.7 秒完成并保存完整证明，模型回答 7 与题库参考 8 不一致，结果保持待人工复核（未自动判错）。
- 新增 `ztest-local` 五组兼容探针：在本机当前渠道执行、保存逐题原始回答和请求条件，不上传 Key，也明确不等同官网评分；官方 `ztest` Turnstile 浏览器流程和报告导入仍保留。
- 余额监测已接入 CC Switch、本地可信渠道和 Agent 渠道，支持官方、`/v1/usage`、New API 账户/Key、`/user/balance` 与安全字段映射；新增满环基准重置选项。真实读取 KeikoAI、悠米 API、StarWish 余额成功，凭据不返回 UI/API。
- 模型横向列表支持鼠标/触控拖拽，灵动岛上下边缘自动滚动已有回归；最新 `npm run test:core`、`npm run check:js`、`npm run ui:test:web`、`npm run desktop:build` 均通过。完整 goal 仍保持进行中，未宣称 Windows 实机及官方 Ztest 报告已完成。
- `/api/agent-sessions` 现在以运行时发现覆盖同 ID 持久心跳并合并元数据，避免 Codex 同一线程同时显示为“打开”和“待命”；当前 Herdr 实况发现 3 个 Codex 会话（1 working、2 idle），不是 6 个重复项。余额重置复选框已正确序列化为布尔值，新增本地 Ztest 方法已纳入英文场景扫描。
- 修正设置校验白名单遗漏：`ztest-local` 现可作为默认核验方式保存；核心测试覆盖本地五探针注册与数量。`npm run runtime:test`（含水杯题 46 秒真实 HTTP 无超时回归）及 `npm run ui:test:web` 均通过，最新桌面包已重新构建并通过 `codesign --verify --deep --strict`。
## 2026-09-14 — 余额、核验条件与历史界面修订

本轮修订已保留在本地最新代码与 `dist/Modivue.app`：

- 余额缓存改为 15 秒，余额告警支持应用内与系统通知，失败会回收告警状态；余额与核验费用继续分区显示。
- Meow 请求严格沿用当前四元组推理档位，不再隐式回退 `low`；六题筛查显示参考线但明确标记为预览，完整采样后才形成结论。Astra/One Token 可信采集同样记录当前条件。
- 核验方式改为可用性排序的卡片下拉，补充样本按钮与选择动作分离；历史报告增加“测试方式 / 题目”筛选并在报告顶部标明方法。
- 灵动岛详情高度按实际 popover 测量动态上报；新增毛玻璃材质覆盖主窗口、灵动岛和详情，穿透模式同步 macOS/Windows 原生鼠标行为。
- 费用链路保留 API 实际费用 > 渠道单价估算 > models.dev 单价估算，并在报告中显示来源。

验证：`npm run ui:test:web` PASS（46 项），`npm run runtime:test` PASS，`npm run check`、`check:i18n`、`check:js`、`test:core` PASS，macOS `codesign --verify --deep --strict` PASS，Windows net8.0-windows 编译 0 警告/0 错误。`npm run ui:test` 的原生鼠标层本轮因宿主检测到 macOS 锁屏标记 `UNTESTED`，未将其计入通过项。
## 2026-09-14 — 11 项目标复核（继续进行）

本轮已修正：灵动岛不再在模型核验环上叠加余额环；余额刷新周期 15 秒；Meow/Astra/One Token 严格绑定当前四元组推理档位；核验方式使用可用性排序卡片下拉；历史报告按测试方式与单题筛选；毛玻璃材质与穿透模式同步 macOS/Windows。

证据：`npm run ui:test:web` 46 项 PASS；`npm run runtime:test` 27 项 PASS；`npm run check`、`check:js`、`check:i18n`、`test:core`、macOS 签名和 Windows net8.0-windows 编译均通过。当前实时 Codex 探测为 3 个顶层会话（1 working、2 idle），未发现重复 subagent。原生鼠标回归仍因宿主检测到锁屏而为 `UNTESTED`，不能替代实机验收；官方 Ztest 已实现可见浏览器 + Turnstile + `/api/verify` + 报告轮询流程，但没有真实 Key 时未声称端到端报告成功。
