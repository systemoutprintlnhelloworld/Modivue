# Build, check, and release

[中文](../development.md) · [Back to README](../../README.en.md#run-from-source)

## Requirements

| Target | Requirements |
|---|---|
| Development server / CLI | Node.js 24+ for built-in `node:sqlite`; CI uses Node.js 24. |
| macOS app | Apple Silicon Mac and Xcode command-line tools. The build architecture follows the host. |
| Windows app | Node.js and .NET SDK 8; CI uses Node.js 24. Inno Setup 6 produces the installer. |

## Browser development

```bash
npm ci
npm run check:js
npm run check:i18n
npm run test:core
npm run dev
```

The development interface defaults to `http://127.0.0.1:4173`. `npm run check` also includes macOS Swift checks and therefore is not a platform-neutral command.

## macOS

```bash
npm run check:desktop
npm run desktop:build
open "dist/Modivue.app"
```

AppKit hosts the windows and WKWebView displays the interface. A child Node service listens on loopback. The build bundles Node and its dynamic dependencies, so the destination machine does not need Node or Homebrew.

Data is stored in `~/Library/Application Support/Modivue`. Existing preview packages use ad-hoc signing and are not Apple-notarized.
- macOS signing and notarization: see [macOS signing and notarization](macos-signing.md). A successful build or signature check does not prove successful native interaction.

## Windows

```powershell
npm ci
npm run windows:build
```

Builds require Node.js 24 or later and package .NET 8 and Node. When WebView2 is missing, setup runs Microsoft's official bootstrapper; the portable app asks before running it. The portable root contains only `Modivue.exe` and `resources/`. Inno Setup offers Start menu, desktop, and sign-in startup options and installs for the current user. Data is stored in `%LOCALAPPDATA%/Modivue`. Native mouse interaction and multi-DPI validation remain separate from build success. An installer can still be unsigned.

The minimum Windows version is Windows 10 1809. The main window uses WinForms; the island uses a transparent WPF window and WebView2CompositionControl for per-pixel alpha and antialiased edges, without color-key transparency or an opaque hit-test backing. Native launch, transparency, themed captions, and quota icon animation have been checked on Windows. Full mouse-interaction and multi-DPI acceptance remain incomplete.

## UI checks

macOS GUI checks require WindowServer, Accessibility, event posting, and screen-recording permission. Use the dedicated Herdr test pane, not a pane running someone else's program:

```bash
npm run ui:test
npm run ui:test:hover
npm run ui:test:drag
npm run ui:test:menu
npm run ui:test:web
npm run runtime:test
```

Results and screenshots go to `.ui-artifacts/`. The web check reports untranslated text in its run's `i18n-coverage.json`. See [UI driver instructions](../../tools/ui-driver/README.md).

## Automated releases

Pushes to `main`, pull requests, and manual workflow runs check and build both platforms. A `v*` tag must match `package.json`; synchronize the root version and lockfile before tagging. The build generates desktop version metadata from the package version.

Tagged builds publish a GitHub prerelease with macOS ZIP, Windows ZIP, and the Windows installer when produced. Missing signing credentials do not make these unsigned previews signed releases. macOS notarization and Windows Authenticode require separate valid certificates and credentials.

Prereleases must use a verified version-specific asset URL; `releases/latest/download` does not select them. Promote a prerelease to Latest only after confirming that the macOS ZIP, Windows ZIP, and installer exist. The README download buttons then follow that promoted release through `releases/latest/download`.
