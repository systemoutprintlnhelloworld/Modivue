<div align="center">

<!-- 顶部横幅动图。导出静态首帧 hero-banner.png 后，可在 <picture> 内加入：
     <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/hero-banner.png">
     （该切换在 GitHub 上的效果未实测）。静态首帧同时上传为仓库 Social preview -->
<picture>
  <img src="docs/assets/video.gif" width="100%" alt="Modivue：你的 Vibe Coding 灵动岛">
</picture>

<h1><img src="docs/assets/app-icon.svg" width="48" height="48" align="absmiddle" alt=""> Modivue</h1>

**你的 Vibe Coding 灵动岛**<br>
余额或订阅余量 · 缓存命中 · 首字延迟 · 模型核验，悬浮一眼看清，数据只留在本机

[![Build](https://img.shields.io/github/actions/workflow/status/systemoutprintlnhelloworld/Modivue/build.yml?branch=main&style=flat-square&label=build)](https://github.com/systemoutprintlnhelloworld/Modivue/actions)
[![Release](https://img.shields.io/github/v/release/systemoutprintlnhelloworld/Modivue?include_prereleases&sort=semver&style=flat-square&color=7AA2F7)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)
[![Downloads](https://img.shields.io/github/downloads/systemoutprintlnhelloworld/Modivue/total?style=flat-square&color=4FD1B0&label=downloads)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)

[![下载 macOS 版](docs/assets/download-macos.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/latest/download/Modivue-macos-arm64.zip)
[![下载 Windows 版](docs/assets/download-windows.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/latest/download/Modivue-windows-x64-setup.exe)

[简体中文](README.md) · [English](README.en.md)

[功能](#功能) · [下载安装](#下载与安装) · [开始使用](#开始使用) · [模型核验](#模型核验) · [常见问题](#常见问题) · [文档](#文档)

<h2>支持监测这些 Coding Agent</h2>

<p align="center">
<a href="docs/features/agents.md"><img src="docs/assets/badges/claude-code.svg" alt="Claude Code"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/codex.svg" alt="Codex"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/gemini.svg" alt="Gemini CLI"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/qwen.svg" alt="Qwen Code"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/opencode.svg" alt="OpenCode"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/goose.svg" alt="Goose"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/continue.svg" alt="Continue"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/pi.svg" alt="Pi"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/grok.svg" alt="Grok Build"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/hermes.svg" alt="Hermes"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/openclaw.svg" alt="OpenClaw"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/gptme.svg" alt="GPTMe"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/cline.svg" alt="Cline"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/roo.svg" alt="Roo Code"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/aider.svg" alt="Aider"></a>
<a href="docs/features/agents.md"><img src="docs/assets/badges/dsh.svg" alt="DeepSeek Harness"></a>
</p>

<sub>各工具的支持程度不同，分级见 <a href="#支持的工具">支持的工具</a>。</sub>

</div>

---

**Modivue** 是一个运行在 macOS 和 Windows 上的本机监测工具，面向通过 API 中转站使用 Claude Code、Codex 等 coding agent 的开发者。它读取中转站余额和 Codex 订阅余量，记录请求的缓存命中和首字延迟，并能按需发起模型核验，保存"这个渠道返回的模型是否和参考行为一致"的原始证据。请求测量与核验报告写入本机 SQLite；余额、余量和辅助配置另存本机文件。

<div align="center">
<!-- 录屏素材使用脱敏演示数据。 -->
<img src="docs/assets/main-demo.gif" width="860" alt="Modivue 灵动岛的展开与收回">
<br>
<sub>鼠标移入展开，悬停单个环查看详情，移开自动收回。</sub>
</div>

## 它回答的五个问题

| 你想知道 | Modivue 怎么给出答案 |
|---|---|
| 中转站还剩多少钱？ | 读取 OpenRouter、New API / Sub2API、CC Switch 或自定义 JSON 字段映射的余额，显示为余额环和历史曲线 |
| Codex 订阅还剩多少额度？ | 被动读取官方 OAuth 会话记录的 5 小时和 7 天额度窗口，显示剩余百分比与重置时间 |
| 提示词缓存到底生效没有？ | 只采用提供方明确返回的缓存字段计算命中率；没有返回字段时显示缺失，不按 0 计 |
| 为什么今天首字这么慢？ | 从请求发出到首个有效文本或工具事件计算 TTFT，按渠道分开看趋势 |
| 这个"模型"的行为和它自称的一致吗？ | 按需运行 11 种核验方法，保存原始回答和判定依据。结果是行为证据，不是身份认证 |

所有指标按 **模型 × 渠道 × Key 分组 × 推理档位** 分开统计。同一个模型经过两个中转站调用，或者同一中转站用两组 Key 调用，都会分成独立的记录，不会混在一起取平均。

---

## 功能

<div align="center">
<!-- 交互总览是设计概念图，图中旧标签不作为产品指标定义；产品以四项指标和下文说明为准。 -->
<img src="docs/assets/interaction-overview.jpg" width="100%" alt="Modivue 交互总览：极简态、普通态、专注态、多模型切换、主题与终端状态栏">
<br>
<sub>交互总览。</sub>
</div>

<br>

<!-- 九宫格素材均来自 docs/assets/features；后续可按同名文件替换。 -->

<table>
<tr>
<td width="33%" valign="top"><a href="docs/features/overview.md"><img src="docs/assets/features/overview.png" alt="概览与指标趋势" width="100%"></a><br><b><a href="docs/features/overview.md">概览与指标趋势</a></b><br>按模型、渠道、Key 分组和推理档位筛选，查看核验、Cache、TTFT 与余额或余量的趋势。</td>
<td width="33%" valign="top"><a href="docs/features/island.md"><img src="docs/assets/features/island.png" alt="灵动岛悬浮面板" width="100%"></a><br><b><a href="docs/features/island.md">灵动岛悬浮面板</a></b><br>贴在屏幕边缘，极简、普通、专注三种形态；悬停单个环看数值与最近曲线。</td>
<td width="33%" valign="top"><a href="docs/features/agents.md"><img src="docs/assets/features/agents.png" alt="Agent 状态" width="100%"></a><br><b><a href="docs/features/agents.md">Agent 状态</a></b><br>发现本机 Claude Code、Codex 等会话，区分"配置存在"和"正在运行"。</td>
</tr>
<tr>
<td valign="top"><a href="docs/features/verification.md"><img src="docs/assets/features/verification.png" alt="模型核验" width="100%"></a><br><b><a href="docs/features/verification.md">模型核验</a></b><br>11 种方法按需运行，逐方法保留原始回答和判定依据。</td>
<td valign="top"><a href="docs/features/cost.md"><img src="docs/assets/features/cost.png" alt="费用、余额与余量" width="100%"></a><br><b><a href="docs/features/cost.md">费用、余额与余量</a></b><br>查看中转站余额、Codex 订阅余量和核验花费；未知数据不记为 0。</td>
<td valign="top"><a href="docs/features/calibration.md"><img src="docs/assets/features/calibration.png" alt="可信参考与校准" width="100%"></a><br><b><a href="docs/features/calibration.md">可信参考与校准</a></b><br>在可信渠道采集同条件分布，导出为档案，供其他渠道比对。</td>
</tr>
<tr>
<td valign="top"><a href="docs/features/settings.md"><img src="docs/assets/features/settings.png" alt="设置与通知" width="100%"></a><br><b><a href="docs/features/settings.md">设置与通知</a></b><br>检测间隔与每日上限、分类音效、主题、文字大小和显示项。</td>
<td valign="top"><a href="docs/features/overview.md#布局"><img src="docs/assets/features/layout.png" alt="自定义布局" width="100%"></a><br><b><a href="docs/features/overview.md#布局">自定义布局</a></b><br>长按区块拖动排序，保存自己的布局。</td>
<td valign="top"><a href="docs/features/cli.md"><img src="docs/assets/features/cli.png" alt="CLI 与状态栏" width="100%"></a><br><b><a href="docs/features/cli.md">CLI 与状态栏</a></b><br>在终端或 Claude Code 状态栏读取同一份本地数据，不触发付费请求。</td>
</tr>
</table>

---

## 下载与安装

| 平台 | 下载包 | 安装 |
|---|---|---|
| macOS Apple Silicon | `Modivue-macos-arm64.zip` | 解压，把 `Modivue.app` 拖进"应用程序"。暂无 Intel 版 |
| Windows 10/11 x64（预览） | `Modivue-windows-x64-setup.exe` | 运行安装器。Release 同时提供 portable ZIP；缺少 WebView2 时安装器会从 Microsoft 安装，portable 版会先征求同意 |
| 命令行 | 源码 `cli/` | Node.js 24+，读取桌面端共享的本地数据库 |

### 首次打开前请读

> [!WARNING]
> 当前是预览版。macOS 包使用临时签名，尚未经 Apple 公证；Windows 包尚未签名，多 DPI 实机验收尚未完成。签名状态与申请准备见 [Windows 签名](docs/windows-signing.md) 和 [macOS 签名与公证](docs/macos-signing.md)。

**macOS：** 第一次打开会被系统拦截。只对你信任的下载，到"系统设置 → 隐私与安全性"中点"仍要打开"，或者在终端执行一次：

```bash
xattr -dr com.apple.quarantine /Applications/Modivue.app
```

**Windows：** 如果 SmartScreen 拦截预览包，请先确认下载来源与文件，再使用系统提供的“更多信息 → 仍要运行”；不需要关闭系统防护。

---

## 开始使用

1. **打开 Modivue。** 屏幕边缘出现灵动岛。本地服务只监听 `127.0.0.1`。
2. **Agent 自动发现。** Claude Code 通过 statusline / hook 心跳上报会话；Codex 通过本机会话状态识别；其他工具读取其当前选中的渠道配置。详见 [Agent 状态](docs/features/agents.md)。
3. **让真实请求经过 Modivue。** 把 Agent 的 Base URL 指向本机代理：

   ```text
   OpenAI 协议     见设置中的「本地代理」地址 + `/proxy/openai/v1`
   Anthropic 协议  见设置中的「本地代理」地址 + `/proxy/anthropic/v1`
   ```

   设置页会显示当前本地代理地址。请求必须经过该地址，Modivue 才能记录 TTFT、Cache、费用和实际出站渠道。

   多渠道路由见 [本地代理与 API](docs/proxy.md)。
4. **需要核验时**，在主窗口的"模型核验"里选择方法并开始。核验会消耗 token，花费逐请求记录。

---

## 灵动岛

形态名称与入口按当前桌面实现定义如下。

| 形态 | 怎么进入 | 显示什么 |
|---|---|---|
| 极简态 | 默认 | 每个活跃模型一个环；可配置显示余额、余量或其他指标，拖条与设置按钮隐藏 |
| 普通态 | 鼠标移入 | 正在工作及近期活跃的目标，拖条与设置按钮恢复 |
| 专注态 | 悬停单个环 | 核验、Cache、TTFT，以及可用的余额或余量和最近趋势 |
| 主窗口 | 点击模型 | 统计、趋势、告警、日志、核验报告和设置 |

灵动岛可以拖动并吸附到屏幕左右边缘。任何界面下按 `⌘K` / `Ctrl+K` 都能搜索功能。完整说明见 [灵动岛悬浮面板](docs/features/island.md)。

<div align="center"><img src="docs/assets/island-main.png" width="860" alt="灵动岛界面"></div>

---

## 模型核验

核验结果是**行为证据**：它比较回答与参考分布或参考答案的差异。结果不是人类 IQ，匹配度也不等于身份置信度。原理、版本和局限见 [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md)，操作说明见 [模型核验](docs/features/verification.md)。

<div align="center"><img src="docs/assets/model-verification-main.png" width="860" alt="模型核验界面"></div>

### 先按你的情况选方法

<!-- TODO: 下表请求量来自 0.3.0 / 0.4.0 更新说明，请核对当前版本是否仍一致 -->

| 你的情况 | 建议方法 | 需要准备 | 请求量参考 |
|---|---|---|---|
| 有一道熟悉的题，想长期盯着看 | 单问题测试 | 题目和参考答案 | 每轮 1 次请求；自动轮次遵守核验间隔，范围 1–1440 分钟 |
| 没有可信渠道，想快速看"更像哪个模型" | Meow 模型指向 | 无，基准内置 | 预览档 6 次；完整档 GPT 32 / 48 / 96 次，Claude 48 / 72 / 120 次 |
| 想看知识边界是否符合 | KBF 知识边界 | 无，16 个历史模型参考内置 | 可先试采一批，但试采不下完整结论 |
| 有一个可信渠道，想做同条件对照 | HLWY、One Token、Astra、自定义概率探针 | 先在可信渠道采集参考档案，见 [可信参考与校准](docs/features/calibration.md) | One Token / Astra 建议每题至少 10 次；HLWY 少于 50 个有效样本只算预览 |
| 想交给第三方服务检测 | BazaarLink Probe、Ztest 官方检测 | BazaarLink 需逐目标授权；Ztest 在官网完成人机验证后导入报告 | BazaarLink 不另收检测服务费，token 由目标 Key 计费 |
| 只想记录原始观测，不下结论 | Juice、本地多探针 | 无；Juice 的校准模式需要档案 | 本地多探针为五组简单请求 |

### Modivue 不做的事

- 不把匹配度换算成"智商"或身份置信度。
- 不在后台绕过 Ztest 的人机验证，本地多探针也不冒充 Ztest 的官方评分。
- 不把未知费用记为 0。
- 没有校准档案时不设真伪阈值，只显示距离。

<details>
<summary><b>全部 11 种方法的来源与实现</b></summary>

| 方法 | 检查内容 | 来源或实现 | 基准要求 |
|---|---|---|---|
| 单问题测试 | 自定义题目与参考答案的匹配记录 | [evaluator-question.mjs](src/core/evaluator-question.mjs) | 不需要 |
| Meow 模型指向 | 短答案分布与候选基准的距离 | [meow-llm-detector](https://github.com/chen-006/meow-llm-detector)，[evaluator-meow.mjs](src/core/evaluator-meow.mjs) | 内置 |
| HLWY 分布匹配 | 公共整数分布的众数、余弦和 JS 相似度 | [hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker)，[evaluator-hlwy.mjs](src/core/evaluator-hlwy.mjs) | 公共基准或可信 API |
| KBF 知识边界 | 16 个历史模型的参考探针，CP99 / 单侧二项检验 | [Ooo0ption/KBF](https://github.com/Ooo0ption/KBF/tree/481c78da14df4f2b02b43d344dae7199ae08cea0) | 内置参考；试采不下完整结论 |
| One Token | 单 token 英文任务的分布差异 | [论文](https://arxiv.org/abs/2607.10252)，[evaluator-one-token.mjs](src/core/evaluator-one-token.mjs) | 先采集；仅适配英文 10 类任务 |
| Astra | 社区五类任务的适配观测，未复刻作者的精确题库 | [社区原帖](https://linux.do/t/topic/2861517)，[实现](src/core/evaluator-astra.mjs) | 自采同条件参考 |
| Juice | 生成答案中的原始整数，不是服务器认证的预算 | [需求参考帖](https://linux.do/t/topic/2704354)，[实现](src/core/evaluator-coding.mjs) | 参考帖正文未核实；校准模式需要档案 |
| BazaarLink Probe | 官方异步检测与持续计划 | [Probe API](https://bazaarlink.ai/probe-api-skill.md) | 官方服务 |
| Ztest 官方检测 | 官网浏览器检测流程及报告导入 | [Ztest](https://ztest.ai)，[报告适配](src/core/evaluator-ztest.mjs) | 第三方服务，人机验证由用户完成 |
| 本地多探针 | 五组简单请求，记录回答、失败及耗时 | [实现](src/core/evaluator-ztest.mjs) | 不复刻 Ztest 私有探针或评分 |
| 自定义概率探针 | 自定义短答案分布的 JSD 比较 | [参考项目](https://github.com/dreamor/llm-fingerprint)，[实现](src/core/evaluator-coding.mjs) | 同条件档案；未校准时只显示距离 |

</details>

---

## 余额与余量

Modivue 用两种方式回答“还剩多少”，界面上都显示为环：

- **余额**：中转站账户里剩下的钱或点数，由中转站自己的接口返回。
- **余量**：订阅在当前时间窗口内还能用多少，以剩余百分比和重置时间表示。

### 余额查询

<p align="center">
<a href="https://github.com/QuantumNous/new-api"><img src="docs/assets/badges/provider-new-api.svg" alt="New API"></a>
<a href="https://github.com/Wei-Shaw/sub2api"><img src="docs/assets/badges/provider-sub2api.svg" alt="Sub2API"></a>
</p>

| 中转站 | 在设置里选择 | 读取的接口 | 注意 |
| --- | --- | --- | --- |
| New API | 账户余额，或 Key 额度 | 账户余额读 `/api/user/self`；Key 额度读 `/api/usage/token/` | 渠道只返回 quota 点数时按点数显示，不当作金额 |
| Sub2API | usage 适配器 | `/v1/usage` | 部署需要返回可解析的额度字段 |

OpenRouter、CC Switch 中保存的渠道，以及自定义 JSON 字段映射，也可以读取余额。首次有效余额作为满环基准；充值超过基准时保持满环，可以在设置中重置。详见[余额环的满环基准](docs/features/island.md#余额环的满环基准)。

### 余量查询

<p align="center">
<a href="https://developers.openai.com/codex/cli/usage-limits"><img src="docs/assets/badges/codex.svg" alt="Codex"></a>
<a href="https://github.com/router-for-me/CLIProxyAPI"><img src="docs/assets/badges/provider-cpa.svg" alt="CLIProxyAPI"></a>
</p>

**Codex 官方 OAuth。** 用 ChatGPT 账号登录 Codex 时，Codex 会把订阅额度窗口写进本机 rollout 记录。Modivue 只读取这些记录，不发起额外的模型请求：

- 显示 5 小时（`300` 分钟）和 7 天（`10080` 分钟）两个窗口，已过期的不显示；
- 剩余额度 = `100% - used_percent`，重置时间沿用 Codex 的记录。

使用自定义 API Key、只有磁盘配置、Codex 记录过旧，或中转服务没有转发 `rate_limits` 字段时，界面显示“未提供”，不会显示成 0。经 CPA 等自定义渠道使用时，窗口只反映最近一次 Codex 上游记录，不代表整个账号池的余量。

**CLIProxyAPI（CPA）。** CPA 通过管理 API 提供订阅账号的额度窗口，不是钱包余额。Modivue 目前只通过服务根路径的公开标识识别本机 CPA，并显示 Codex rollout 中最近一次上游额度记录。Modivue 尚未接入 CPA 管理 API，也不读取、索取或保存管理密钥，因此不能显示 CPA 账号池的 5 小时或 7 天余量。

### 说明

- 各部署返回的字段不尽相同。Modivue 只读取能识别的字段，也不是每个版本都经过实机验证。
- Cache、TTFT 和模型核验不依赖上面的余额适配，对所有渠道通用。TTFT 需要请求经过 Modivue 本地代理，见[开始使用](#开始使用)，或由 Modivue 主动采样一次。主动采样和核验可能消耗渠道额度。
- CPA 常部署在本机。BazaarLink 等远程核验服务访问不到本机地址，这类方法对本机 CPA 不可用。

## 支持的工具

<!-- TODO: 请按当前实测结果核对下表分级 -->

| 支持程度 | 工具 |
|---|---|
| 实时读取会话状态 | Claude Code（statusline / hook 心跳）、Codex（本机持锁进程与未结束会话证据） |
| 本机安装并启动验证 | Gemini CLI、Qwen Code、Pi、OpenCode |
| 可解析渠道配置，尚未实机验收 | Goose、Continue、Grok Build、Hermes、DeepSeek Harness、OpenClaw、GPTMe、Cline、Roo Code、Aider |

各工具的识别方式见 [Agent 状态](docs/features/agents.md)，后续适配计划见 [ROADMAP.md](ROADMAP.md)，图标来源与许可见 [素材归属](docs/assets/NOTICE.md)。

---

## 隐私与数据边界

- 本地服务只监听 `127.0.0.1`。
- 请求记录、核验报告、余额、余量和图表数据写入本机 SQLite 或本机配置文件。
- 数据库只保存 API Key 的不可逆短指纹。你主动保存的可信渠道凭据会以明文写入本机配置文件，文件权限限制为当前用户，请按本机安全策略保护。
- 主动探测和核验会向你配置的上游发请求并产生费用，可以在设置中关闭、调低频率或限制每日请求数。
- 模型目录、公共基准和版本检查会访问各自的远程来源。启用 BazaarLink 或 Ztest 官方检测时，请求交由对应第三方处理。"数据存在本机"不等于"完全离线"。

---

## 常见问题

**我的中转站不是 New API 或 Sub2API，怎么办？**
先尝试设置中的通用余额接口。字段格式不同的部署可以使用自定义 JSON 字段映射，填写接口路径、余额字段、总额度或已用额度字段和单位。

**为什么余额、余量、Cache 或 TTFT 显示“未提供”？**
Modivue 不会把缺失数据写成 0。常见原因是上游没有返回所需字段，请求没有经过 Modivue 本地代理，或 Codex rollout 没有写入 `rate_limits`。详情卡片会保留当前可判断的状态。

**为什么 CPA 没有余额或账号池余量？**
CPA 管理订阅账号额度，不提供 Modivue 所需的钱包余额。读取账号池的 5 小时和 7 天余量需要 CPA 管理密钥；Modivue 当前不接入该管理 API，也不索取或保存管理密钥。界面能显示的 CPA 余量只来自最近一次 Codex 上游记录。

**会不会把我的 API Key 传出去？**
数据库只保存 Key 的不可逆短指纹。主动核验会用 Key 向你配置的上游发请求；启用 BazaarLink Probe 时，需要逐个目标授权 Key 的发送。

**核验要花多少钱？**
取决于方法和模型单价，请求量见[上面的选择表](#先按你的情况选方法)。每次核验都逐请求记录花费；拿不到价格时显示"未知"。

**核验结果能证明中转站掺水吗？**
不能单独作为证明。核验给出的是与参考分布或参考答案的差异，匹配度不等于身份置信度，每种方法的局限见 [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md)。

**CLI 或状态栏会产生费用吗？**
不会。它们只读取本地已有数据，不发起 API 请求。

**macOS 提示无法打开怎么办？**
见[首次打开前请读](#首次打开前请读)。

**有 Intel Mac 版本吗？**
目前没有。当前构建产物为 Apple Silicon。

**Windows 上 Agent 状态和 macOS 一样准确吗？**
不完全一样。Windows 通过进程发现和配置解析识别 Agent，进程存在不代表它正在工作；Codex 使用 Windows Restart Manager 读取持锁进程，并结合本机未结束的 turn 判断工作状态。macOS 使用 `lsof` 读取持锁进程。

---

## 文档

| 我想… | 文档 |
|---|---|
| 了解每个功能怎么用 | [功能文档索引](docs/features/README.md) |
| 了解核验原理与局限 | [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md) |
| 配置多渠道路由或调用本地 API | [docs/proxy.md](docs/proxy.md) |
| 在终端或状态栏读取数据 | [CLI 与状态栏](docs/features/cli.md) |
| 构建、测试与发布 | [docs/development.md](docs/development.md) |
| 配置 macOS 临时签名、Developer ID 与公证 | [macOS 签名与公证教程](docs/macos-signing.md) |
| 了解后续计划 | [ROADMAP.md](ROADMAP.md) |

<!-- TODO: 新建 CHANGELOG.md（从 Release 说明汇总）后加入上表；HANDOFF.md、CONTEXT.md 建议移到 docs/dev/ -->

---

## 从源码运行

```bash
git clone https://github.com/systemoutprintlnhelloworld/Modivue.git
cd Modivue
npm ci
npm run dev              # 浏览器调试 http://127.0.0.1:4173
npm run desktop:build    # macOS → dist/Modivue.app
npm run windows:build    # Windows，需要 .NET SDK 8
```

环境要求与测试命令见 [docs/development.md](docs/development.md)。

## 参与贡献

提交 issue 时请附上系统版本、Agent 类型、协议（Chat Completions / Responses / Messages）、中转站类型、相关日志和复现步骤。余额适配入口见 [`src/core/balance.mjs`](src/core/balance.mjs)，维护 README 素材时使用[素材清单](docs/media.md)。欢迎提交新的余额适配、核验方法和翻译。

[![Star History Chart](https://api.star-history.com/svg?repos=systemoutprintlnhelloworld/Modivue&type=Date)](https://star-history.com/#systemoutprintlnhelloworld/Modivue&Date)

## 许可证

项目原创代码采用 [MIT License](LICENSE)。第三方代码、素材与商标保留各自许可和声明，见 [素材归属](docs/assets/NOTICE.md)。

## 友情链接

[LINUX DO](https://linux.do/)
