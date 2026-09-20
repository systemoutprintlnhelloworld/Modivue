# 构建、测试与发布

<!-- 来源：旧版 README 的"自动构建与发布""macOS 桌面应用""Windows 预览版""浏览器开发模式""Herdr 宿主验证"条目。发布前请按当前 package.json 与 workflow 核对 -->

[返回 README](../README.md#从源码运行)

## 环境要求

| 目标 | 要求 |
|---|---|
| 浏览器开发模式 / CLI | Node.js 24+（使用内置 `node:sqlite`） |
| macOS 应用 | 在 Apple Silicon Mac 上构建；产物架构与构建机器一致 |
| Windows 应用 | Node.js 24、.NET SDK 8 |

<!-- TODO: 统一 Node.js 版本要求 -->

## 浏览器开发模式

```bash
npm ci
npm run check
npm run dev    # http://127.0.0.1:4173
```

用于前端调试。

## macOS 应用

```bash
npm run desktop:build
open dist/Modivue.app
```

- 使用 AppKit 管理窗口，WKWebView 呈现监测界面，应用进程内启动只监听 `127.0.0.1` 的本地服务。
- 构建脚本会封装当前 Node.js 可执行文件及其动态依赖，目标机器不需要安装 Node.js 或 Homebrew。
- 数据目录：`~/Library/Application Support/Modivue`。
- 当前使用临时签名，尚未配置 Apple Developer ID 证书与公证。
- macOS 签名与公证：见 [macOS 签名与公证](macos-signing.md)。

## Windows 应用

```bash
npm ci
npm run windows:build
```

- 构建使用 Node.js 24+，发布包内含 .NET 8 与 Node。安装器会在缺少 WebView2 时运行 Microsoft 官方 bootstrapper；portable 版会先征求用户同意。
- portable 根目录只保留 `Modivue.exe` 与 `resources/`；安装器可选开始菜单、桌面快捷方式和登录时自动启动。
- 数据目录：`%LOCALAPPDATA%/Modivue`。
- 最低系统为 Windows 10 1809。主窗口使用 WinForms；灵动岛使用 WPF 透明窗口和 WebView2CompositionControl，保留逐像素透明与抗锯齿，不使用色键透明或不透明的鼠标命中底板。
- Windows 原生启动、透明合成、主题标题栏和余量图标动画已检查；完整鼠标交互与多 DPI 实机验收尚未完成；尚未配置代码签名。

## UI 测试

macOS GUI 测试需要 WindowServer、辅助功能、事件发布和屏幕录制权限。授权后在 Herdr 中运行：

```bash
npm run ui:test          # 全部
npm run ui:test:hover
npm run ui:test:drag
npm run ui:test:menu
npm run ui:test:web      # 包含英文翻译覆盖检查
npm run runtime:test
```

结果和截图写入 `.ui-artifacts/`。`ui:test:web` 发现未翻译条目时检查失败，清单写入 `.ui-artifacts/<运行编号>-web/i18n-coverage.json`。实现与权限说明见 [tools/ui-driver/README.md](../tools/ui-driver/README.md)。

## 自动构建与发布

- 推送到 `main`、Pull Request 和手动运行时，流水线检查 JavaScript 与指标核心，分别构建 macOS 和 Windows，并上传 ZIP。
- 推送与 `package.json` 版本一致的 `v*` 标签后，流水线发布 GitHub 预览版。
- 确认 macOS ZIP、Windows ZIP 与安装器存在后，才把预览版提升为 Latest Release。README 的下载按钮通过 `releases/latest/download` 跟随该发布。
- 版本号需要同时维护 `package.json`、lockfile、`Info.plist` 和界面页脚。
- 签名 DMG 和 Windows 安装器已有构建流程，但尚未完成证书配置与正式发布。
