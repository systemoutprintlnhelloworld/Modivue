<!--
  媒体文件统一放在 docs/media/<版本号>/，每个版本一个目录，旧版 README 的图不会失效。
  截图统一外观：python scripts/readme_assets.py frame raw/*.png --height 800 --outdir docs/media/0.4.1
  发布前删除所有 TODO。
-->

<img src="docs/media/logo.png" alt="Modivue logo" width="88">

# Modivue

### 写代码时，一眼看清中转站的余额、缓存、延迟，以及模型是不是它自称的那个。

4 项实时指标 · 9 种模型核验方法 · 15 个 Agent 工具配置解析 · macOS、Windows 与 CLI

所有请求证据只保存在本机，不需要账号，不经过第三方服务器。

[安装](#安装) · [监测面板](#监测面板) · [模型核验](#模型核验) · [对比](#和常见做法的区别) · [架构](#架构) · [文档](#文档) · [FAQ](#faq) · [English](README.en.md)

[![Build](https://img.shields.io/github/actions/workflow/status/systemoutprintlnhelloworld/Modivue/build.yml?branch=main&style=flat-square&label=build)](https://github.com/systemoutprintlnhelloworld/Modivue/actions)
[![Stars](https://img.shields.io/github/stars/systemoutprintlnhelloworld/Modivue?style=flat-square&color=f59e0b)](https://github.com/systemoutprintlnhelloworld/Modivue/stargazers)
[![Downloads](https://img.shields.io/github/downloads/systemoutprintlnhelloworld/Modivue/total?style=flat-square&color=4FD1B0&label=downloads)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)
[![Release](https://img.shields.io/github/v/release/systemoutprintlnhelloworld/Modivue?include_prereleases&sort=semver&style=flat-square&color=7AA2F7)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)
<!-- TODO: 补 LICENSE 后启用 -->
<!-- [![License](https://img.shields.io/github/license/systemoutprintlnhelloworld/Modivue?style=flat-square)](LICENSE) -->

[![Download Modivue](https://img.shields.io/badge/Download-macOS_·_Windows-7AA2F7?style=for-the-badge)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)

<!-- 唯一的首屏动图：真实桌面 + 编辑器，悬浮窗 极简 → 面板 → 单环详情 → 收回，6–10 秒，宽 1200 -->
![悬浮窗从极简态展开到单个 Agent 详情](docs/media/0.4.1/hero-island.gif)

> [!WARNING]
> **预览版。** macOS 包尚未公证，Windows 包尚未签名，Windows 实机多 DPI 验收仍在进行。遇到问题请提交 [Issue](https://github.com/systemoutprintlnhelloworld/Modivue/issues)。

## 概览

| | Modivue |
|---|---|
| **监测指标** | 余额 · Cache 命中率 · 首字延迟 TTFT · 模型核验 · 检测花费 |
| **统计粒度** | 模型 × 渠道 × Key 分组 × 推理档位，互不混算 |
| **模型核验** | 9 种方法，覆盖内置单题、开源检测器、论文方法、社区方法和官方服务 |
| **Agent 工具** | Claude Code · Codex · Gemini CLI · Qwen Code · OpenCode · Pi 等 15 个 |
| **协议** | OpenAI Chat Completions · Responses · Anthropic Messages（流式） |
| **余额来源** | OpenRouter · New API / Sub API · CC Switch · 自定义 JSON 字段映射 |
| **平台** | macOS Apple Silicon（原生 AppKit）· Windows 10/11 x64 预览 · 命令行 |
| **界面** | 灵动岛悬浮窗 · 主窗口 · Claude Code 状态栏 · CLI |
| **存储** | 本机 SQLite；API Key 只保存不可逆短指纹 |
| **许可证** | TODO |

<table>
<tr>
<td align="center" width="90"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/icons/dark/claudecode.png"><img src="docs/media/icons/light/claudecode.png" width="36" alt="Claude Code"></picture><br><sub>Claude Code</sub></td>
<td align="center" width="90"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/icons/dark/codex.png"><img src="docs/media/icons/light/codex.png" width="36" alt="Codex"></picture><br><sub>Codex</sub></td>
<td align="center" width="90"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/icons/dark/gemini.png"><img src="docs/media/icons/light/gemini.png" width="36" alt="Gemini CLI"></picture><br><sub>Gemini CLI</sub></td>
<td align="center" width="90"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/icons/dark/qwen.png"><img src="docs/media/icons/light/qwen.png" width="36" alt="Qwen Code"></picture><br><sub>Qwen Code</sub></td>
<td align="center" width="90"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/icons/dark/opencode.png"><img src="docs/media/icons/light/opencode.png" width="36" alt="OpenCode"></picture><br><sub>OpenCode</sub></td>
<td align="center" width="90"><img src="docs/media/icons/pi.png" width="36" alt="Pi"><br><sub>Pi</sub></td>
<td align="center" width="90"><sub><a href="ROADMAP.md">全部 15 个</a></sub></td>
</tr>
</table>
<!-- TODO: pi.png 手动放入；按 ROADMAP.md 补齐工具名 -->

## 安装

从 [Releases](https://github.com/systemoutprintlnhelloworld/Modivue/releases) 下载对应平台的包。

| 平台 | 安装包 | 说明 |
|---|---|---|
| macOS · Apple Silicon | `Modivue-macos-arm64.zip` | 解压后打开 `Modivue.app`，包内自带运行时 |
| Windows 10/11 · x64 | `Modivue-windows-x64.zip` | 解压后运行 `Modivue.exe`，需要 Edge WebView2 Runtime |
| 命令行 | 源码 `cli/` | Node.js 22.5+，默认读取桌面端共享数据库 |

> [!NOTE]
> 预览包未经 Apple 公证。首次打开时，请右键点击应用选择**打开**，或执行 `xattr -cr /Applications/Modivue.app`。目前只提供 Apple Silicon 版本。

### 接入 Agent

把 Agent 的 Base URL 改成本机代理地址：

```diff
- base_url = "https://your-relay.example/v1"
+ base_url = "http://127.0.0.1:4173/proxy/openai/v1"      # OpenAI 协议
+ base_url = "http://127.0.0.1:4173/proxy/anthropic/v1"   # Anthropic 协议
```

Codex 会话会被自动识别。Claude Code 还可以接入状态栏，见 [状态栏接入说明](cli/STATUSLINE-SNIPPET.md)。

### 第一次核验

1. 打开主窗口，进入**模型核验**。
2. 选择**单问题测试**，填写一道有确定答案的题目。
3. 选择**立即核验**，结果会写入历史报告，并按设定间隔持续复测。

> [!TIP]
> 分布类方法（One Token、Astra）需要先在可信渠道上采集基准：每题至少采 10 次，然后在"历史核验报告"中导出分布档案，再到"设置 → 核验 → 核验校准档案"中导入。

### 从源码运行

```bash
git clone https://github.com/systemoutprintlnhelloworld/Modivue.git
cd Modivue
npm ci
npm run dev              # 浏览器界面 http://127.0.0.1:4173
npm run desktop:build    # macOS → dist/Modivue.app
npm run windows:build    # Windows（需要 .NET SDK 8）
```

## 监测面板

悬浮窗平时只占屏幕边缘一个圆环，需要时逐层展开，不会打断写代码。

| 层级 | 触发方式 | 显示内容 |
|---|---|---|
| **极简态** | 默认 | 余额环 |
| **Agent 面板** | 鼠标移入 | 正在工作的 Agent，以及 1 小时内活跃过的 Agent，每个带状态环 |
| **单环详情** | 悬停在某个环上 | 核验、Cache、TTFT 的数值与最近 1 小时趋势，渠道余额与检测花费 |
| **主窗口** | 点击模型 | 各指标的详细统计、趋势、告警、日志和设置 |

| 指标 | 回答的问题 | 数据来源 |
|---|---|---|
| **模型核验** | 这个渠道返回的模型，和可信来源的行为一致吗 | 下文的核验方法 |
| **Cache 命中率** | 提示词缓存有没有生效 | `cached_tokens` / `cache_read_input_tokens` 原始字段 |
| **TTFT** | 首字慢在哪个渠道、哪个时段 | 从首个有效文本或工具事件开始计时 |
| **余额** | 中转站还剩多少 | 渠道余额接口；充值后会重设满环基准 |

| ![概览页：核心指标环与四项指标卡](docs/media/0.4.1/overview.png) | ![悬停单个 Agent 时的详情浮窗](docs/media/0.4.1/hover-detail.png) |
|---|---|
| 概览：实时核心指标与趋势 | 悬浮详情：三项指标的 1 小时曲线、余额与花费 |
| ![灵动岛三种形态](docs/media/0.4.1/island-states.png) | ![显示设置：主题、文字大小与颜色](docs/media/0.4.1/customization.png) |
| 灵动岛：极简、面板、专注三种形态 | 显示设置：主题、文字 80–200%、强调色、环的对比度 |

另外支持 `⌘K` / `Ctrl+K` 搜索功能与设置、中英文界面、跟随系统的"减少动态效果"，以及拖动和左右吸附。

## 模型核验

核验结果是可以复查的行为证据，不是人类 IQ，也不是模型身份认证。每种方法都注明出处，方便你查阅原文。

| 方法 | 检查内容 | 来源 | 基准 |
|---|---|---|---|
| **单问题测试** | 自定义题目和参考答案，按时间窗口统计匹配率 | Modivue 内置 | 不需要 |
| **Meow 模型指向** | 短答案分布更接近候选池中的哪个模型 | 开源 · [chen-006/meow-llm-detector](https://github.com/chen-006/meow-llm-detector) | 内置 |
| **One Token 分布指纹** | 单 token 回答的分布差异 | 论文 · [One Token Is Enough](https://arxiv.org/abs/2607.10252) | 需采集 |
| **KBF 知识边界** | 与 16 个公开历史模型的知识边界对比，CP99 / 单侧二项检验 | 开源 · TODO | 内置 |
| **HLWY 分布匹配** | 与公共分布或可信 API 对比 | TODO | 可选 |
| **Juice 观测** | 原始观测，配合可信校准 | TODO | 可选 |
| **Astra 五组观测** | 社区原帖的五组任务 | 社区 · TODO | 需采集 |
| **BazaarLink Probe** | 官方异步检测，支持持续计划 | 官方 · [Probe API](https://bazaarlink.ai/probe-api-skill.md) | 官方 |
| **Ztest** | 在官网完成多探针检测后导入报告 | 官方 · TODO | 官方 |

| ![核验方法选择面板](docs/media/0.4.1/verify-methods.png) | ![单题匹配次数随时间变化](docs/media/0.4.1/verify-trend.png) |
|---|---|
| 方法选择：每种方法都标出基准是否就绪 | 单题测试：匹配次数、比例与失败次数随时间变化 |
| ![一份展开的核验报告](docs/media/0.4.1/report.png) | ![核验花费统计](docs/media/0.4.1/cost.png) |
| 核验报告：结论、有效样本、参考答案与原始回答 | 花费：总花费、平均单次、最近单次，逐请求可查 |

每份报告都会保存采样条件、逐请求耗时和花费、失败与重试次数，以及原始 JSON。报告可以导出，也可以导入成校准档案。费用未知时显示为"未知"，不会记成 0。原理与局限见 [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md)。

## 和常见做法的区别

| | **Modivue** | **看中转站后台 / 手动测试** |
|---|---|---|
| **查看方式** | 悬浮在编辑器旁，不用切换窗口 | 需要打开网页或另起会话 |
| **粒度** | 按模型、渠道、Key 分组、推理档位分开 | 通常只有账户级汇总 |
| **缓存与延迟** | 逐请求记录原始字段 | 大多不提供，或只给平均值 |
| **模型核验** | 多种方法持续复测，保留历史 | 偶尔手动问几道题，没有记录 |
| **多 Agent** | 同时显示多个正在工作的会话 | 逐个查看 |
| **数据位置** | 本机 | 服务方 |
| **代价** | 核验本身会消耗 token，可设每日上限 | 无额外消耗 |

## 架构

```text
AppKit（macOS）/ .NET + WebView2（Windows）宿主
        │  WKWebView / WebView2
Web 界面：灵动岛 · 主窗口
        │  HTTP，仅监听 127.0.0.1
Node.js 本地服务
        ├── 代理：/proxy/openai/… · /proxy/anthropic/…
        ├── Agent 会话发现：Claude Code hook / statusline · Codex 状态库
        ├── 核验插件 · 余额探测 · models.dev 目录同步
        └── node:sqlite → 平台数据目录
```

| 层 | 路径 | 职责 |
|---|---|---|
| 桌面宿主 | `desktop/` | 窗口、悬浮窗、菜单栏与托盘、系统通知 |
| 界面 | `index.html` · `app.js` · `styles.css` | 灵动岛与主窗口 |
| 服务 | `server.mjs` · `src/` | 代理、聚合、核验、余额 |
| 命令行 | `cli/` | `status` · `watch` · `agents` · `reports` · 状态栏 |
| 测试 | `tools/ui-driver/` · `scripts/` | 原生交互回归、界面翻译覆盖检查 |

### 网络边界

- 本地服务只监听 `127.0.0.1`。
- 数据库只保存 API Key 的不可逆短指纹，不保存明文。
- 主动探测和核验会向你配置的渠道发请求并产生 token 费用，受间隔、每日上限和输出 token 上限约束，可以随时关闭。
- 默认情况下，唯一的第三方请求是从 [models.dev](https://models.dev) 同步模型目录。

## 文档

| 需要 | 阅读 |
|---|---|
| 核验原理与局限 | [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md) |
| 接入 Claude Code 状态栏 | [cli/STATUSLINE-SNIPPET.md](cli/STATUSLINE-SNIPPET.md) |
| 多渠道路由与 API | [docs/proxy.md](docs/proxy.md) <!-- TODO：从旧 README 迁出 --> |
| 界面自动化测试 | [tools/ui-driver/README.md](tools/ui-driver/README.md) |
| 更新记录与计划 | [CHANGELOG.md](CHANGELOG.md) · [ROADMAP.md](ROADMAP.md) · [最新版本](https://github.com/systemoutprintlnhelloworld/Modivue/releases) |
| 安全问题 | [SECURITY.md](SECURITY.md) |

## FAQ

**核验结果能证明对面就是某个模型吗？**

不能。它提供的是行为层面的证据：和可信基准越一致，可信度越高。报告签名和匹配率都不等于身份认证。建议结合多种方法，并在相同的协议、提示词和采样参数下对比。

**会额外花钱吗？**

Modivue 本身免费。主动探测和核验会消耗你所配置 Key 的 token，界面会逐请求显示花费。可以在设置中调整间隔、每日请求上限，或者直接关闭主动探测。

**macOS 提示"已损坏"或"无法验证开发者"？**

这是因为预览包还没有公证。请右键点击应用选择"打开"，或者执行 `xattr -cr /Applications/Modivue.app`。

**支持 Intel Mac 吗？**

目前的安装包只提供 Apple Silicon 版本。Intel Mac 可以用浏览器开发模式运行 Web 界面。

**数据会上传吗？**

不会。请求记录、核验报告和余额都保存在本机数据目录里：macOS 是 `~/Library/Application Support/Modivue`，Windows 是 `%LOCALAPPDATA%/Modivue`。

## 参与贡献

- [Issues](https://github.com/systemoutprintlnhelloworld/Modivue/issues)：提交可复现的问题，请注明系统、Agent 和协议类型。
- 适配新的中转站余额接口：参考已有的 New API / Sub API 实现。
- 接入新的核验方法：需要写明来源、版本和采样条件。
- Windows 实机验收与翻译。
- 开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

[![Star History Chart](https://api.star-history.com/svg?repos=systemoutprintlnhelloworld/Modivue&type=Date)](https://star-history.com/#systemoutprintlnhelloworld/Modivue&Date)

## 使用原则

- 不绕过任何官网的人机验证，不在后台代填凭据。
- 不把第三方检测的报告冒充成自己的评分。
- 不把未知费用显示为 0，不保存明文 Key。
- 不把核验结果包装成"模型智商"。

## 许可证

TODO

## 致谢

核验方法建立在这些工作之上：[meow-llm-detector](https://github.com/chen-006/meow-llm-detector)、[One Token Is Enough](https://arxiv.org/abs/2607.10252)、KBF、HLWY、Juice、Astra、[BazaarLink](https://bazaarlink.ai)、Ztest。模型目录来自 [models.dev](https://models.dev)。<!-- TODO 补全链接 -->

**[下载 Modivue](https://github.com/systemoutprintlnhelloworld/Modivue/releases)** · [Star 本项目](https://github.com/systemoutprintlnhelloworld/Modivue)
