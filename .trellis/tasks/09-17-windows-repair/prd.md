# Windows 修复与发布恢复

## 范围与分工
- Windows README 下载入口暂停，不删除历史 Release，不发布新二进制。
- 修复命令/配置发现、Codex 持锁会话识别、灵动岛真实点击与详情跳转。
- 维护者已同意 MIT，准备免费 SignPath 申请；未获批前不声称已签名。
- 追加：检查指标链路；识别 CLIProxyAPI 时暂不显示余额；README 展示 API provider 框架与逐项能力，不夸大适配。
- macOS 端同时开发 DSH、签名和初次引导；本端不改 macOS 宿主/引导流程，改共享文件前后 fetch 并合并，不 force push。

## 已验证（2026-09-17）
- 原 portable 0.4.7 未签名；GitHub 无签名 secrets；安装器尚未实机验收。
- 原代码能读取 Claude/Codex 静态配置，但 Unix `which` 导致 Windows 命令误报缺失。
- Windows `.env` 路径分隔符误判导致 Gemini 配置解析失败。修复后 Codex、Claude、Gemini 的命令与配置均可识别。
- Windows Restart Manager 返回持锁 PID，结合 SQLite 未结束 turn；与原生 CLI PID 合并，实机返回一个工作中、一个仅运行的 Codex，没有重复计数。
- 黑色透明键使 WebView2 父窗口点击穿透。原生宿主为已报告的交互面绘制非透明背景后，真实鼠标点击 TTFT 成功进入对应详情。用户亦确认点击已恢复。
- .NET 8.0.425 本机 publish 成功；JS/i18n 检查通过；使用 portable 内置 Node 24 执行现有 core 检查通过。本机全局 Node 22.12 默认没有启用 SQLite，不能据其失败判定产品回归。
- 交互证据 `.ui-artifacts/windows-repair/native-ttft.png`。测试实例设置了 `MODIVUE_UI_ARTIFACTS`，主动请求被关闭；不是可宣称指标采样完成的发布版本。

## 待完成
- 当前用户反馈指标不计算：区分测试模式、凭据匹配、CPA 转换协议、缺失 usage 与核验支持范围，验证真实数据链路。
- CPA 自动识别与余额隐藏；provider 能力 badge / 表格。
- Windows 更多点击目标、启动时序与安装版验收；签名申请提交/审核/可信签名仍需外部步骤。
- 保持 GitHub 同步；Windows 下载恢复须有最终功能与签名证据。

不新增测试文件，不关闭系统安全功能，不改用户 Agent 配置或真实数据库，不擅自发起付费模型请求。
