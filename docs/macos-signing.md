# macOS 签名与公证

[返回 README](../README.md#下载与安装) · [English](en/macos-signing.md)

## 先说结论

| 方案 | 是否付费 | 适用范围 | 其他用户首次打开 |
|---|---:|---|---|
| 临时签名（ad hoc） | 免费 | 本人、测试机、内部分发 | 可能被 Gatekeeper 拦截 |
| Developer ID + 公证 | 需要 Apple Developer Program 会员；目前官方标准年费为 99 美元/年（地区税费与结算货币可能不同） | 对外发布下载包 | 可正常显示“已验证开发者”，仍受系统策略影响 |
| Mac App Store | 需要会员及 App Store 流程 | 商店分发 | 由商店安装 |

免费方案可以让 App 在本机运行，但不能获得 Developer ID 或 Apple 公证。不要把自签名或临时签名描述成“已认证”。

- [Apple Developer Program](https://developer.apple.com/programs/)
- [Apple Developer Support：Membership](https://developer.apple.com/support/membership/)
- [Apple 平台安全：打开未识别开发者的 App](https://support.apple.com/102445)

## 当前项目的免费构建

`npm run desktop:build` 默认使用 ad hoc 签名（签名身份为 `-`）：

```bash
npm ci
npm run check:desktop
npm run desktop:build
codesign --verify --deep --strict --verbose=2 "dist/Modivue.app"
```

把包复制到另一台 Mac 后，如果 Gatekeeper 阻止启动，只对确认来源可信的文件执行以下操作：

```bash
# 方案一：右键 Modivue.app，选择“打开”，再确认“打开”
# 方案二：系统设置 → 隐私与安全性 → 仍要打开
# 方案三：仅对可信本地包移除下载隔离标记
xattr -dr com.apple.quarantine "/Applications/Modivue.app"
```

`xattr` 只会移除隔离标记，不会把临时签名变成可信签名。不要对来源不明的 App 使用它。

## 对外发布的 Developer ID 流程

### 1. 准备 Apple 账号与证书

1. 加入 Apple Developer Program。
2. 在 Certificates、Identifiers & Profiles 中创建 **Developer ID Application** 证书。
3. 如果发布 `.pkg`，另建 **Developer ID Installer** 证书；发布 ZIP/DMG 通常只需要 Application 证书。
4. 在本机钥匙串中确认身份名称：

   ```bash
   security find-identity -v -p codesigning
   ```

身份名称类似：

```text
Developer ID Application: Your Name (TEAM_ID)
```

### 2. 本地签名并验证

使用实际身份替换 `MACOS_SIGN_IDENTITY`。不要把证书私钥、Apple 密码或 App 专用密码写入仓库。

```bash
export MACOS_SIGN_IDENTITY='Developer ID Application: Your Name (TEAM_ID)'
npm run desktop:build

codesign --force --deep --options runtime --timestamp \
  --sign "$MACOS_SIGN_IDENTITY" "dist/Modivue.app"

codesign --verify --deep --strict --verbose=2 "dist/Modivue.app"
spctl --assess --type execute --verbose=4 "dist/Modivue.app"
```

项目构建脚本已支持 `MACOS_SIGN_IDENTITY`；正式签名时会为运行时启用 hardened runtime。若手动重签，请确保签名顺序和 entitlements 与构建脚本一致，优先直接使用 `npm run desktop:build`。

### 3. 打包并提交公证

```bash
ditto -c -k --keepParent "dist/Modivue.app" "Modivue-macos-arm64.zip"

xcrun notarytool submit "Modivue-macos-arm64.zip" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
```

公证成功后，将票据固定到 App，再做一次检查：

```bash
xcrun stapler staple "dist/Modivue.app"
xcrun stapler validate "dist/Modivue.app"
spctl --assess --type execute --verbose=4 "dist/Modivue.app"
```

Apple 推荐使用 `notarytool`，不要在新流程中使用已废弃的 `altool`。公证提交的是最终分发包；签名、打包、修改 App 后必须重新公证。

## GitHub Actions 配置

当前工作流读取以下 Secrets。它们只应配置在仓库 Settings → Secrets and variables → Actions，不要提交到源码：

| Secret | 作用 |
|---|---|
| `MACOS_CERTIFICATE_P12_BASE64` | Developer ID Application 证书导出的 `.p12` 的 base64 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` 密码 |
| `MACOS_SIGN_IDENTITY` | 完整 Developer ID Application 身份 |
| `APPLE_ID` | Apple 账号邮箱 |
| `APPLE_TEAM_ID` | 10 位 Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | 仅用于 notarytool 的 App 专用密码 |

建议只允许受保护的发布分支或标签访问这些 Secrets。Pull Request 构建继续使用 ad hoc 签名，不应接触发布凭据。

生成 `.p12` 时包含私钥，并在导出后验证证书链；CI 导入临时钥匙串，完成后删除钥匙串。Apple 账号密码不能替代 App 专用密码。

## 常见问题

### 临时签名能一直用吗？

可以长期用于自己的测试机，签名本身没有“几天后失效”的固定期限；但它不提供第三方信任，也不能保证其他 Mac 不再拦截。系统版本、下载来源和隔离属性都会影响首次启动。

### 有完全免费的正规公开发布吗？

没有与 Developer ID + 公证等价的免费方案。可以免费构建和 ad hoc 签名，也可以让用户按上述方式手动允许打开；如果希望下载后直接被 macOS 识别为可信开发者，需要 Apple Developer Program 和 Developer ID 公证流程。

### 如何确认包真的公证过？

```bash
xcrun stapler validate "Modivue.app"
spctl --assess --type execute --verbose=4 "Modivue.app"
codesign --display --verbose=4 "Modivue.app"
```

三个命令都应针对最终分发包执行。`codesign --verify` 通过只代表签名结构有效，不代表已经公证。
