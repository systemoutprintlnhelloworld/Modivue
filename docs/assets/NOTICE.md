# 素材来源

- `app-icon.svg` 和 `src/data/app-mark.svg` 分别使用用户提供的 `files.zip` 中的 `m-icon-512.svg`（黑底）和 `m-mark.svg`（透明底），保留原始 SVG。
- `src/data/app-icon.png` 由黑底 SVG 渲染为 1024×1024 透明圆角图像；Windows ICO 和 macOS ICNS 使用同一源图。
- `wordmark.svg` 为 Modivue 字标，`v`、`u`、`e` 依次使用经典三环的蓝色 `#3ba7ff`、绿色 `#14e6c0`、黄色 `#ffc52e`，与软件侧栏一致。
- `feature-*.svg`、`hero-*.svg` 是 Modivue 文档模板，不是实际界面截图。
- `download-*.svg` 为文档下载按钮，平台标识仅用于说明下载平台。
- Claude Code、Codex、Gemini、Qwen、OpenCode、Goose、Pi、Grok、OpenClaw、Cline、DeepSeek Harness badge 复用仓库现有图标，来源与许可证见 [Agent Icons](../../src/data/agent-icons/NOTICE.md)。
- Continue badge 来自 Continue 2.0.0 扩展的 `media/icon.png`，上游 [continuedev/continue](https://github.com/continuedev/continue)，Apache-2.0。
- Roo Code badge 来自 Roo Code 3.54.0 扩展的 SVG 标识，上游 [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code)，Apache-2.0。
- GPTMe badge 来自 gptme 0.33.0 包内 `gptme/server/webui-dist/logo.png`，上游 [gptme/gptme](https://github.com/gptme/gptme)，MIT。
- Hermes 与 Aider 图标于 2026-09-17 下载到 `agents/`，两个 badge 都内嵌本地 PNG，不依赖远程图片请求。
- New API provider badge 内嵌上游 [`web/public/logo.png`](https://github.com/QuantumNous/new-api/blob/main/web/public/logo.png)；上游主仓库为 AGPL-3.0，未发现该 logo 的单独许可声明。
- Sub2API provider badge 内嵌上游 README 使用的 [`assets/logo.svg`](https://github.com/Wei-Shaw/sub2api/blob/main/assets/logo.svg)，不是部署模板的 `frontend/public/logo.png`；上游仓库为 LGPL-3.0-or-later。
- CPA provider badge 使用官方管理中心仓库的 [`logo.jpg`](https://github.com/router-for-me/Cli-Proxy-API-Management-Center/blob/main/logo.jpg) 缩略图；未发现该 logo 的单独许可声明。
- `scripts/make-provider-badges.mjs` 将上述素材以 `data:` 图片写入本地 SVG，README 不在渲染时请求远程图片。品牌名称和标识仍归各自权利人所有。

| Agent | 本地原始素材与来源 | badge 处理 | 许可记录 |
|---|---|---|---|
| Hermes Agent | `agents/hermes.png`，来自 [官方桌面应用图标](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/desktop/assets/icon.png) | 原图 1024×1024；等比缩小至 96×96 后内嵌，显示为 24×24，不裁剪 | [上游仓库 LICENSE](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE) 为 MIT，Copyright (c) 2025 Nous Research；原文见 [HERMES-LICENSE.txt](HERMES-LICENSE.txt) |
| Aider | `agents/aider.png`，来自 [Aider-AI 官方组织头像](https://github.com/Aider-AI.png?size=128)；`agents/aider.svg` 保存 [官方 SVG wordmark](https://aider.chat/assets/logo.svg) | badge 采用 128×128 组织头像，等比显示为 24×24；wordmark 保留原文件，不压成方形 | [Aider 仓库 LICENSE.txt](https://github.com/Aider-AI/aider/blob/main/LICENSE.txt) 为 Apache-2.0，原文见 [AIDER-LICENSE.txt](AIDER-LICENSE.txt)；组织头像未发现单独许可声明，不据仓库许可推定头像或商标的授权 |
| DeepSeek Harness | `badges/dsh.svg` 使用仓库现有 `src/data/agent-icons/deepseek.svg` 的 DeepSeek 标识；未将其称为 DSH 官方独立 logo | badge 采用统一深色外框并显示 `DSH` 文字，图标仅用于标识 DeepSeek Harness 所属品牌 | [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)为 MIT；本 badge 仅作工具识别，不表示商标授权或官方背书 |

Aider wordmark 与仓库 `aider/website/assets/logo.svg` 下载内容一致。以上仓库许可记录不表示获得额外商标授权。

品牌名称和标识归各自权利人所有，不表示这些项目为 Modivue 背书。Apache-2.0 和 GPTMe MIT 许可文本保存在本目录。
