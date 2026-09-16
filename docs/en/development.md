# Build, test, and release

## Requirements

| Target | Requirement |
|---|---|
| Browser development / CLI | Node.js 22.5+ |
| macOS app | Apple Silicon Mac |
| Windows app | Node.js 24 and .NET SDK 8 |

## Browser development

```bash
npm ci
npm run check
npm run dev
```

## Desktop builds

```bash
npm run desktop:build
open dist/Modivue.app
npm run windows:build
```

The macOS app uses AppKit and WKWebView and bundles its Node runtime. Windows packages include .NET 8 and Node and require Microsoft Edge WebView2 Runtime. Current packages use temporary or no code signing and are not notarized.

## UI checks

UI checks require WindowServer, accessibility, event publishing, and screen-recording permissions on macOS. Run existing checks in the supported host:

```bash
npm run ui:test
npm run ui:test:web
npm run runtime:test
```

## Release workflow

Push to `main`, open a pull request, or run the workflow manually for checks and platform archives. Push a tag matching the package version, such as `v0.4.7`, to publish a GitHub preview release with macOS and Windows packages. Keep `package.json`, lockfile, `Info.plist`, and footer versions aligned.

[Back to README](../../README.en.md) · [Feature index](features/README.md)
