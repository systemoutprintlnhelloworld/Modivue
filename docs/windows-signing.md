# Windows 代码签名申请准备

状态（2026-09-17）：维护者已同意项目原创代码采用 MIT。尚未向 SignPath 提交申请，尚未取得批准、账户、证书或签名产物。维护者已要求恢复 Windows 下载入口；在签名完成前，发布包必须明确标记为未签名。

## 申请表草稿

入口：[SignPath Foundation 申请表](https://signpath.org/apply)。以下内容可复制到表单，不包含维护者个人资料。

| 字段 | 内容 |
| --- | --- |
| Project Name | Modivue |
| Repository / Homepage | https://github.com/systemoutprintlnhelloworld/Modivue |
| Download URL | https://github.com/systemoutprintlnhelloworld/Modivue/releases/latest |
| Maintainer Type | Individual maintainer(s) |
| Build System | GitHub Actions |
| Primary Discovery Channel | AI / LLM tools |
| License | MIT for original project code; third-party components retain their own licenses. |

**Tagline**

> A local desktop monitor for coding-agent sessions, provider balances, request metrics, and model verification.

**Description**

> Modivue is a desktop application for developers using coding agents through API providers and gateways. It reads local agent configuration and session evidence, displays activity in a floating island, and opens a dashboard for cache usage, time to first token, balances, and model-verification reports. Its Windows host uses WinForms and WebView2 with a bundled Node.js service listening only on loopback. Release artifacts are built from this public repository by GitHub Actions.

**Reputation**

> Modivue is an early-stage project. Public release history, download counts, source changes, and build logs are available at the links below. We do not claim independent security review or broad adoption.
>
> https://github.com/systemoutprintlnhelloworld/Modivue/releases
>
> https://github.com/systemoutprintlnhelloworld/Modivue/actions/workflows/build.yml

## 提交前仍需完成

- 把根目录 `LICENSE` 与修复代码推送到公开仓库。MIT 不替代第三方组件的许可，也不授予商标权；需要核对打包内容与已有 NOTICE。
- 维护者本人填写姓名、联系邮箱，完成 reCAPTCHA，并阅读、同意行为规范与个人数据处理条款。不需要把身份证件、邮箱密码或私钥发给开发助手。
- 开启 GitHub 与 SignPath 的多因素认证，确认代码作者、审阅者与发布审批人。可以由同一维护者承担，但不能虚构额外审阅者。
- 如实说明当前项目规模、下载已恢复且 Windows 包仍未签名。SignPath 要求可核验信誉；MIT 许可证不保证获批。
- 对照[条件](https://signpath.org/terms)补全发布签名政策。获批前不能声称“签名由 SignPath 提供”，也不能把本草稿当作已获得服务的证明。
- 隐私说明必须与行为一致：本地监测不是遥测上传；但模型目录/公共基准更新、配置后的余额查询、启用后的主动模型请求、用户启动的第三方核验会访问相应服务。不能填写“程序完全不联网”。当前配置与会话读取不应在申请中附带真实 Key 或聊天记录。

## 获批后的接入顺序

1. 在 SignPath 配置仓库来源、GitHub Actions 构建来源、签名策略与维护者审批人；使用服务分配的组织 ID 和项目 slug，不预造值。
2. 将令牌保存到 GitHub Actions secrets，不写入源码；只允许可信发布分支/标签使用签名凭据，PR 构建保持无签名权限。
3. 构建 Windows 应用，签署项目自有 `Modivue.exe` / `Modivue.dll`，保留 Node、.NET、WebView2 等第三方文件的原签名，不用项目证书重签第三方文件。
4. 用签名后的应用构建 portable ZIP 与安装器，再签署安装器。最终校验 Authenticode、时间戳、ZIP 内文件及实际安装后的文件，不能只验证中间产物。
5. 实测 portable、安装版、原生点击与多 DPI。目前 portable 与原生点击已验收；安装版、多 DPI 与最终签名产物仍需在发布前核对。

已有 `WINDOWS_CERTIFICATE_BASE64` / `WINDOWS_CERTIFICATE_PASSWORD` 流程使用自有 PFX，不等同于 SignPath 云签名；申请获批后需要接入服务，不向这些变量塞入自签证书。

签名证明发布者与文件完整性，不保证立即消除所有 SmartScreen 信誉提示。微软 Artifact Signing 的个人 Public Trust 申请当前只面向美国、加拿大；若维护者不在支持地区，不应填写虚假地区信息。

资料读取日期：2026-09-17。
- [SignPath 申请表](https://signpath.org/apply)
- [SignPath 条件与代码签名政策](https://signpath.org/terms)
- [Microsoft Artifact Signing 前提](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#prerequisites)
- [Microsoft Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
