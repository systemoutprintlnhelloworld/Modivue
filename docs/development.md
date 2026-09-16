# 构建与发布

源码运行需要 Node.js 22.5+，CI 使用 Node.js 24。Windows 构建还需要 .NET SDK 8；macOS 构建需要 Xcode 命令行工具。

```bash
npm ci
npm run dev
```

开发界面默认位于 `http://127.0.0.1:4173`。原生应用使用动态端口。

## 桌面构建

```bash
# macOS
npm run desktop:build
open "dist/Modivue.app"
```

```powershell
# Windows
npm run windows:build
```

macOS 宿主使用 AppKit + WKWebView，打包 Node 及其动态依赖。产物架构与构建机器一致，目前下载包面向 Apple Silicon。Windows 使用 .NET 8 + WebView2，包内带 .NET 与 Node，机器还需 Edge WebView2 Runtime。

关闭详细窗口不会退出后台监测。通过 macOS 菜单栏或 Windows 托盘退出应用。

## 检查

```bash
npm run check:js
npm run check:i18n
npm run test:core
```

macOS 可运行 `npm run check:desktop`。原生 UI 与运行时回归使用 Herdr 专用宿主 pane，入口、权限及产物说明见 [UI 驱动文档](../tools/ui-driver/README.md)。构建成功不代表原生交互通过，Windows 实机与多 DPI 验收仍需分别记录。

## 签名安装包

仓库工作流已配置签名发布路径，证书配置与实际发布仍需完成。不能把本地构建或旧 ZIP 当作已公证、已签名安装器。

| 构建来源 | 产物 |
| --- | --- |
| Pull Request、`main`、普通手动 CI | 名称含 `unsigned` 的 ZIP 测试包 |
| 与 `package.json` 版本一致的 `v*` 标签 | macOS Developer ID 签名、公证并装订票据的 DMG；Windows Authenticode 签名的 Inno Setup 安装器 |

标签构建缺少证书会失败，不回退为未签名正式包。需要配置这些 GitHub Actions secrets：

- macOS：`MACOS_CERTIFICATE_P12_BASE64`、`MACOS_CERTIFICATE_PASSWORD`、`MACOS_SIGN_IDENTITY`、`APPLE_ID`、`APPLE_TEAM_ID`、`APPLE_APP_SPECIFIC_PASSWORD`。
- Windows：`WINDOWS_CERTIFICATE_BASE64`、`WINDOWS_CERTIFICATE_PASSWORD`。

Windows 标签构建还依赖 Inno Setup 6 和 Windows SDK 的 `signtool.exe`。安装器按当前用户安装到 `%LOCALAPPDATA%\Programs\Modivue`。SmartScreen 会考虑证书信誉，签名并不保证新版本立即没有提示。

下载时以 [Releases](https://github.com/systemoutprintlnhelloworld/Modivue/releases) 的实际附件与说明为准。

## 仓库公开范围

源码、构建脚本、功能文档、开发规范和 `建议/` 设计原稿随仓库同步。`建议/` 是历史提案，不等于已实现功能或发布承诺。

个人工具配置、凭据、数据库、私有基准原件、构建产物与会话日志不提交。当前任务的原始实施记录和任务状态包含本机运行细节，也保留在本机；可公开的需求、规范和研究结论单独提交。不要使用 `git add -f` 绕过这些排除项。
