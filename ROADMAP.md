# Modivue 路线图

更新时间：2026-09-13

## 已交付 0.2.0 预览版

- macOS 原生主窗口、灵动岛、悬停详情、拖动左右吸附、动态缓冲条。
- Windows .NET 8 + WebView2 宿主骨架；CIM 进程发现和本地数据目录。
- Spotlight 搜索（⌘K/Ctrl+K）、无滚动弹窗、键盘导航。
- 设置分类、设置搜索、自动保存、输入校验、失败保留草稿；中英文界面切换。
- HLWY、Meow、Juice、概率探针、单问题题库及自定义问题。
- Ztest 独立检测适配：官网检测后导入 URL/JSON，四元组归属确认、原始报告持久化和重复导入去重。
- CLI 状态、Agent、报告、持续观察；GitHub Actions macOS/Windows 构建和 v* 预览发布。

## 后续任务

- Windows 实机鼠标、透明窗口、多 DPI、WebView2 Runtime 和代码签名验收。
- Cline、Roo Code、Continue 等 GUI Agent 的真实请求链路验证；补充 Windows Hook/状态事件。
- Ztest 登录态报告读取、更多报告版本兼容；不绕过 Turnstile，不代填用户凭据。
- 完整英文文案覆盖动态长提示、题库说明和质量报告；补充翻译维护流程。
- 从用户指定的 Juice 资料恢复可读原文后，对照其 Web/本地实现并记录差异。
- 评测方法继续保持“证据与能力分离”：不把外部探针或单题结果合成为 IQ，也不把证据不足写成确定身份。
- 更多方案来源继续保留：[linux.do 2861517](https://linux.do/t/topic/2861517)、[单题来源 2797049](https://linux.do/t/topic/2797049)、[Juice 2555348](https://linux.do/t/topic/2555348)、[Juice 24576294](https://linux.do/t/topic/24576294)。可读方法逐项复现后接入，当前无法读取的两篇 Juice 正文保持待补。

## 发布验证

- v0.2.0 已自动发布 macOS arm64 与 Windows x64 ZIP，GitHub Actions 两平台构建、核心检查通过。
- 本地 Web 35 项通过，覆盖自动保存竞态／输入校验／切页草稿、Spotlight 键盘／滚动锁、语言持久化、Ztest 导入验证／去重及既有核验链路。全程使用受控上游。
- macOS 原生 95 项通过，覆盖启动、悬停、稳定位置、左右吸附、横竖拖条、跨窗口指标跳转、引导与退出；极简态和悬停截图已审阅。
- Windows .NET 8 交叉编译 0 警告、0 错误；GitHub Windows runner 打包通过。尚未替代 Windows 实机交互验收。
