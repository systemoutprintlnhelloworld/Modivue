# macOS signing and notarization

[中文](../macos-signing.md) · [Back to README](../../README.en.md#download-and-install)

## Short answer

| Option | Cost | Use case | First launch for other users |
|---|---:|---|---|
| Ad hoc signing | Free | Personal use, testing, internal distribution | Gatekeeper may block it |
| Developer ID + notarization | Requires Apple Developer Program membership; Apple's standard price is currently US$99/year (local taxes and billing currency may differ) | Public downloads | macOS can recognize the developer and notarization ticket |
| Mac App Store | Requires membership and App Store review | Store distribution | Installed by the store |

A free build can run on your own Mac, but it cannot obtain Developer ID trust or Apple notarization. Do not describe an ad hoc or self-signed build as verified by Apple.

- [Apple Developer Program](https://developer.apple.com/programs/)
- [Apple Developer Support: Membership](https://developer.apple.com/support/membership/)
- [Apple Support: Open an app from an unidentified developer](https://support.apple.com/102445)

## Free build used by this project

`npm run desktop:build` uses ad hoc signing by default (`-` identity):

```bash
npm ci
npm run check:desktop
npm run desktop:build
codesign --verify --deep --strict --verbose=2 "dist/Modivue.app"
```

After copying the app to another Mac, use these options only after verifying that the file is trusted:

```bash
# Option 1: right-click Modivue.app, choose Open, then confirm Open
# Option 2: System Settings → Privacy & Security → Open Anyway
# Option 3: remove the quarantine flag for a trusted local copy only
xattr -dr com.apple.quarantine "/Applications/Modivue.app"
```

`xattr` removes a quarantine flag; it does not turn an ad hoc signature into a trusted Developer ID signature. Do not use it on an untrusted app.

## Developer ID release flow

### 1. Account and certificates

1. Enroll in the Apple Developer Program.
2. Create a **Developer ID Application** certificate in Certificates, Identifiers & Profiles.
3. If you publish a `.pkg`, create a **Developer ID Installer** certificate as well. ZIP/DMG distribution normally needs only the Application certificate.
4. Check the identity in Keychain:

   ```bash
   security find-identity -v -p codesigning
   ```

The identity looks like:

```text
Developer ID Application: Your Name (TEAM_ID)
```

### 2. Sign and verify locally

Replace `MACOS_SIGN_IDENTITY` with the real identity. Never commit the certificate private key, Apple password, or app-specific password.

```bash
export MACOS_SIGN_IDENTITY='Developer ID Application: Your Name (TEAM_ID)'
npm run desktop:build

codesign --force --deep --options runtime --timestamp \
  --sign "$MACOS_SIGN_IDENTITY" "dist/Modivue.app"

codesign --verify --deep --strict --verbose=2 "dist/Modivue.app"
spctl --assess --type execute --verbose=4 "dist/Modivue.app"
```

The build script already supports `MACOS_SIGN_IDENTITY` and enables hardened runtime for a release identity. Prefer `npm run desktop:build` so entitlements and signing order stay consistent.

### 3. Package and notarize

```bash
ditto -c -k --keepParent "dist/Modivue.app" "Modivue-macos-arm64.zip"

xcrun notarytool submit "Modivue-macos-arm64.zip" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
```

After notarization succeeds, staple the ticket and verify the final app:

```bash
xcrun stapler staple "dist/Modivue.app"
xcrun stapler validate "dist/Modivue.app"
spctl --assess --type execute --verbose=4 "dist/Modivue.app"
```

Apple recommends `notarytool`; do not start a new workflow with the retired `altool`. Submit the final distribution artifact. Re-signing, repackaging, or modifying the app requires a new notarization submission.

## GitHub Actions configuration

The current workflow reads these Secrets. Configure them under repository Settings → Secrets and variables → Actions; never commit them:

| Secret | Purpose |
|---|---|
| `MACOS_CERTIFICATE_P12_BASE64` | base64 of the exported Developer ID Application `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` password |
| `MACOS_SIGN_IDENTITY` | full Developer ID Application identity |
| `APPLE_ID` | Apple account email |
| `APPLE_TEAM_ID` | 10-digit Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for notarytool |

Limit these Secrets to protected release branches or tags. Pull request builds should keep using ad hoc signing and must not access release credentials.

## Common questions

### Can I keep using an ad hoc signature?

Yes, for your own test Macs. The signature does not have a fixed short lifetime, but it does not provide third-party trust and does not guarantee that another Mac will allow the first launch.

### Is there a completely free, fully trusted public release path?

No. Free local builds and ad hoc signing are available, but direct public trust comparable to Developer ID plus notarization requires Apple Developer Program membership and the Developer ID workflow.

### How do I confirm notarization?

```bash
xcrun stapler validate "Modivue.app"
spctl --assess --type execute --verbose=4 "Modivue.app"
codesign --display --verbose=4 "Modivue.app"
```

Run all three commands against the final distribution app. A passing `codesign --verify` only proves that the signature structure is valid; it does not prove notarization.
