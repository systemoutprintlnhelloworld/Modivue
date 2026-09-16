# Modivue 完整需求与验收记录

更新时间：2026-09-09。唯一验收清单；未取得对应运行证据不得划去。构建通过仅证明可构建。

## 桌面与交互

- [ ] 原生 macOS app：灵动岛、hover 拓展面板、点击详细窗口，按 UI-concept 核对。
- [ ] 灵动岛始终贴左/右侧，拖动期间也不横穿屏幕；顶部一行可拖动，其余区域可正常操作。
- [ ] 非关注时无边框/独立文本，仅工作中四元组三环与中心指数，均保持不透明；hover 恢复所有会话环、文本、边框。
- [ ] 全部 Agent 空闲时保留最后活跃四元组；全部连续空闲 1h 后隐藏，工作恢复自动显示。
- [ ] 非激活窗口 hover 能展开；环 hover 放大与显示端点值；点击才开详细窗口。
- [ ] 展开/收起不闪烁、不抖动、不改变环位置；气泡连接随指针变化、自然阴影。
- [ ] 各环五档等级及颜色渐变；不得把模型相似度称为智商或身份证明。
- [ ] 数值变化、明暗主题动画；减弱动态效果设置；文字不溢出。
- [ ] 菜单栏图标右键退出，Dock 菜单；应用图标替换详细窗口左上品牌占位符，移除右上重复图标。
- [ ] 详细窗口 tab 整页切换，概览图表点 hover 放大/显示值，点击转对应详情。
- [ ] 趋势包含核验、Cache、TTFT、总耗时，标注各量纲，图例可开关折线。

## 采集、身份与数据

- [ ] 在线维护模型目录 models.dev 自动更新、来源/时间可见；非标准名称模糊匹配与不确定性处理。
- [ ] 仅启动中的 Codex / Claude Code；识别实际模型/协议/baseURL/key/推理档位，不串用凭据。
- [ ] 同模型/baseURL/key/推理档位四元组跨 Agent 去重；任一会话工作时可检测。
- [ ] 待命不模型核验；连续待命 15min 后停止所有主动检测，恢复工作后自动恢复。
- [ ] 启动按设置自动检测；间隔、方案、请求额度/成本、暂停可控。
- [ ] TTFT 首有效内容、明确 Cache 字段、总耗时、实际/估计费用；未知不作零。
- [ ] 数据跨重启持久化；全部历史查询、全局时间/渠道/key/档位筛选；核验最新值不因短查询窗口消失。
- [ ] 各模型/渠道/分组历史、降智事件规则/次数、日志、告警/已读、设置真实可用。
- [ ] GUI 与 TUI 同定义；Claude Code / Codex 状态栏彩色实时三柱图与准确宿主支持边界。

## 核验与报告

- [ ] 默认使用并展示真实 Meow 上游方案；固定版本/题目/参考分布/阈值/许可可追溯。
- [ ] 三环中心为申报模型匹配比例，报告显示强烈指向/偏离/证据不足及所有候选模型柱状图。
- [ ] Meow、HLWY、概率探针、Juice、AxonHub 已核实的核验方案可切换，设置自定义方案细节。
- [ ] 不伪造未核实 AxonHub 算法；查明上游具体实现、能力边界再接入。
- [ ] 每个历史条目可独立查看结构化可视化报告，原始 JSON 为可选详情。
- [ ] 拓展/详细窗口均展示核验费用、覆盖数、总耗时、采样条件/版本及导出。

## 验证

- [ ] check、desktop build、签名检查；证据记录命令与结果。
- [ ] Herdr 宿主运行：启动、hover 循环、点击、左右侧拖动、菜单退出、截图审阅。
- [ ] Web 图例/时间筛选/历史报告、工作/空闲转换、预算与去重行为验证。
- [ ] 全清单复核后逐项划去；FAIL/UNTESTED 保留，目标未完成时继续。

## 界面重构草案（2026-09-10，待主人核对）

- 极简态只保留工作中或最近活跃四元组的模型单环与模型 Logo；环外空白不触发唤醒，全部连续空闲一小时后隐藏。
- 常态显示活跃四元组的模型单环列，窗口仅贴左/右屏幕边缘；顶部拖动行可移动，其余区域保持操作用途。
- hover 某个模型后，当前对象显示核验、Cache、TTFT 三个独立指标环和对应图标，并展开历史面板；离开环及其连接区域后恢复模型环列；点击进入详细窗口。
- 详细窗口使用 LobeHub `@lobehub/icons-static-svg` 的维护中 SVG CDN，根据标准模型/提供方映射 Logo；缺失 Logo 时隐藏图片并保留文字身份。
- 五档环颜色按指标方向渐变：优秀、良好、合格、较差、极差；Meow 匹配比例仅作模型指向证据，不称为智商或身份概率。
- 2026-09-10 核对：LobeHub 官方文档确认 SVG URL 格式为 `https://unpkg.com/@lobehub/icons-static-svg@latest/icons/[ICON SLUG].svg`；AxonHub 当前源码/文档检索仍只证明渠道测试、模型映射、Trace 和路由管理，未证明内置模型真伪算法。
- 2026-09-10 运行数据库核对：当前 Codex `gpt-6-astra` / `keiko.lol` 的 Meow 失败主要为上游 `response.failed`、超时或解析 TypeError；HTTP 200 且 `response.completed` 的有效探针样本存在。报告已将请求失败显示为“核验请求失败”，不再误称“证据不足”。

## 本轮证据

- 2026-09-11 修复：灵动岛页面 bootstrap 明确初始化 `data-island-mode=compact`，避免首次渲染没有状态值；`runProbeBatch` 跳过已识别为待命/结束的 Agent 目标，防止未启动 Claude 或待命会话发出请求。
- 2026-09-11 修复：核验被目标待命中断时保留已有 observations，并将 quality run 标记为 `paused`；`verificationDue` 对 `paused`/`stopReason` 运行在下一调度周期续测，不等待完整 15 分钟冷却。
- 2026-09-11 检查：`npm run check` 通过；`node tools/ui-driver/monitoring.mjs` 的 5 项隔离监控检查全部 PASS。浏览器 MCP 当前可加载模拟页面，原生 Herdr 仍因宿主 `Operation not permitted` 保持 UNTESTED。

- 前一轮确有代码/构建进展，但焦点态、idle 检测、成本未知处理仍有缺陷；此前完成表述不作验收证据。
- 存储使用 Application Support/Modivue/modivue-runtime.sqlite，源码无按 1h 删除逻辑；继续检查查询筛选和运行数据库。
- Meow 4.5.3 官方说明：分数是候选相对优势的 sigmoid 展示，不是身份后验概率；唯一候选严格超过完整精度判定线才给强指向。来源：https://raw.githubusercontent.com/chen-006/meow-llm-detector/main/TECHNICAL_REPORT_CN.md
- 本轮发现：岛页面 bootstrap 曾无条件添加 `window-focused`，会覆盖原生 hover 状态，导致非焦点显示逻辑反转；已改为仅主窗口默认 focused。
- 本轮 Herdr 证据：`herdr pane list` 返回 `Operation not permitted`；宿主 hover/拖动/菜单验证仍为 UNTESTED，不得划去。
- Meow 4.5.3 源码证据：预测引擎为 `meow-fingerprint-v3-predictive`，完整检测按整次 run 的多项计数联合证据计算；GPT/Claude 各有 6 个 probe cell、low/medium/high tiers、60% 完成资格和冻结校准阈值。仓库许可证是 PolyForm Noncommercial 1.0.0；当前项目仅保存来源/契约摘要，不复制上游完整基准。
- AxonHub GitHub API 当前可读取，仓库 `looplj/axonhub` 非归档、约 5124 stars、默认分支 `unstable`；其项目定位是 gateway/failover/load balancing/tracing，不足以证明内置模型真伪算法，核验方案暂不冒充已实现。
- 本地数据库检查：samples 730 条（2026-09-08 至 2026-09-09），quality_runs 261 条；HLWY、Juice、probability-probe 均存在历史记录。此前只显示 HLWY 的原因是 UI 只按当前 evaluator 版本摘要。
- 本轮代码证据：`detectAgents()` 已读取当前 Codex writer-lock，即使 `lsof` 因陈旧 lock 返回 1 也保留 stdout 中的活动 lock；实测返回 `gpt-6-astra`、`keiko.lol`、`738b1e111670`、`xhigh`，并排除未持有 lock 的会话。
- 本轮代码证据：主窗口仍为可拖动详细窗口；灵动岛使用固定 570px WebView 承载面与 112px 裁剪轨道，展开不改变轨道坐标；失焦 CSS 实测环与中心值 opacity 均为 1，文本隐藏，hover 会显示气泡。
- 本轮检查证据：`npm run check`、`npm run desktop:build`、`codesign --verify --deep --strict --verbose=1 dist/Modivue.app` 均通过；`scoreMeow()` 离线基线样本实测可产生“强烈指向申报模型”与偏离结论。Herdr 仍返回 `Operation not permitted`，原生启动/拖动/菜单/截图保持 UNTESTED。
- 本轮补充：质量接口同时返回当前筛选趋势、`history` 全历史和 `latest` 每目标最新记录；历史报告选择器不再因默认 1 小时范围为空。无模型的 writer-lock 不再借用配置模型；当前 Codex 目标仅保留有实际模型的活动会话。
- 本轮浏览器层证据：失焦灵动岛 `ring=1`、`center=1`、文字 `opacity=0`；hover 后 `expanded=true`、气泡 `popover=true`，rail 坐标保持不变。真实 macOS 原生交互仍需 Herdr 权限恢复后复核。
- 本轮浏览器层补充：指针落在外环时命中 `申报模型匹配度`，CSS transform 为 `scale(1.12)`，同时气泡可见；这证明环 hover 路径已恢复，未用 click 代替。
- 2026-09-10 本轮实现：模型核验默认间隔固定为 15 分钟，可在设置中调整为 15–1440 分钟；核验请求默认间隔 2 秒，可调为 1–60 秒。`runProbe` 使用全局串行队列，在任务出队后再次检查每日额度；相同四元组请求去重。
- 2026-09-10 本轮实现：代理识别 `response.completed`、`message_stop` 或错误终止事件后停止等待上游 EOF，避免兼容网关保持连接导致 Coding Agent 一直处于 connecting。该修复已由 `tools/ui-driver/monitoring.mjs` 的无 EOF SSE 场景验证。
- 2026-09-10 本轮实现：详细窗口概览的同心三环由动态指标生成，刷新时同步端点位置、极值标记和等级颜色；灵动岛每个模型仅保留一个模型核验环，拓展浮层保留三项数值趋势。
- 2026-09-10 隔离回归证据：`node tools/ui-driver/monitoring.mjs` 通过默认设置/15 分钟冷却、身份去重、空闲跳过、串行排队/预算、Meow 退避和完整 SSE 释放共 5 项检查；`npm run check` 与 `npm run desktop:build` 通过，代码签名验证通过。Playwright/Herdr 原生窗口通道仍受宿主权限限制，未将其标记为 PASS。
