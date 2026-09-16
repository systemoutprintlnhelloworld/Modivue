<div align="center">

<picture><img src="docs/assets/video.gif" width="100%" alt="Modivue: a Vibe Coding Dynamic Island"></picture>

<h1><img src="docs/assets/app-icon.svg" width="48" height="48" align="absmiddle" alt=""> Modivue</h1>

**A local Dynamic Island for Vibe Coding**<br>
Balance · cache hit rate · time to first token · model verification, stored locally

[![Build](https://img.shields.io/github/actions/workflow/status/systemoutprintlnhelloworld/Modivue/build.yml?branch=main&style=flat-square&label=build)](https://github.com/systemoutprintlnhelloworld/Modivue/actions)
[![Release](https://img.shields.io/github/v/release/systemoutprintlnhelloworld/Modivue?style=flat-square)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)

[![Download macOS](docs/assets/download-macos.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/download/v0.4.7/Modivue-macos-arm64.zip)
[![Download Windows](docs/assets/download-windows.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/download/v0.4.7/Modivue-windows-x64-setup.exe)

[简体中文](README.md) · **English**

[Features](#features) · [Install](#download-and-install) · [Quick start](#quick-start) · [Model verification](#model-verification) · [Documentation](#documentation)

</div>

---

Modivue is a local macOS and Windows monitor for developers using coding agents through API gateways. It reads provider balances, records cache usage and TTFT, and can run model verification on demand. Data is stored in local SQLite.

## Four questions it answers

| Question | How Modivue answers it |
|---|---|
| How much balance remains? | Reads supported provider balance endpoints and shows current and historical values. |
| Is prompt caching working? | Uses only explicit provider cache fields; missing data stays missing. |
| Why is the first token slow? | Measures the time from request start to the first valid text or tool event. |
| Is this model behaving like the reference? | Runs selected verification methods and preserves raw evidence. This is not identity authentication. |

Metrics are separated by **model × channel × key group × reasoning effort**.

## Features

| Feature | Documentation |
|---|---|
| Overview and metric trends | [Overview](docs/en/features/overview.md) |
| Dynamic Island panel | [Dynamic Island](docs/en/features/island.md) |
| Agent status | [Agents](docs/en/features/agents.md) |
| Model verification | [Verification](docs/en/features/verification.md) |
| Cost and balance | [Cost](docs/en/features/cost.md) |
| Reference calibration | [Calibration](docs/en/features/calibration.md) |
| Settings and notifications | [Settings](docs/en/features/settings.md) |
| CLI and status line | [CLI](docs/en/features/cli.md) |
| Local proxy and API | [Proxy](docs/en/proxy.md) |

<div align="center"><img src="docs/assets/灵动岛.png" width="860" alt="Modivue Dynamic Island"></div>

## Download and install

| Platform | Package | Install |
|---|---|---|
| macOS Apple Silicon | `Modivue-macos-arm64.zip` | Unzip and move `Modivue.app` to Applications. |
| Windows 10/11 x64 | `Modivue-windows-x64-setup.exe` | Run the installer. Microsoft Edge WebView2 Runtime is required. |
| CLI | `cli/` from source | Node.js 22.5 or later. |

> [!WARNING]
> Preview builds are currently unsigned and macOS packages are not notarized. Windows SmartScreen may ask for confirmation.

## Quick start

1. Launch Modivue. The Dynamic Island appears at the screen edge.
2. Point an agent's Base URL to the local proxy shown in Settings.
3. Use real requests through the proxy to collect TTFT, cache, cost, and routing data.
4. Open **Model verification** when you need a behavioral comparison.

See [Proxy and API](docs/en/proxy.md) for routing details.

## Dynamic Island

The panel has minimal, normal, and focus states. Hover a model ring to view verification, cache, TTFT, balance, and recent trends. Drag it to either screen edge; it snaps to the nearest side.

## Model verification

Verification compares model behavior with a reference distribution or answer. It is behavioral evidence, not human IQ, capability ranking, or model identity authentication.

<div align="center"><img src="docs/assets/模型核验-main.png" width="860" alt="Model verification"></div>

Available methods include single-question tests, Meow, KBF, HLWY, One Token, Astra, Juice, BazaarLink Probe, Ztest import, local multi-probes, and custom probability probes. Sources and limitations are listed in [the verification guide](docs/en/features/verification.md) and [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md).

## Supported agents

Modivue can discover or parse Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode, Goose, Continue, Pi, Grok Build, Hermes, OpenClaw, GPTMe, Cline, Roo Code, and Aider. Support levels differ; see [Agent status](docs/en/features/agents.md).

## Documentation

- [Feature guides](docs/en/features/README.md)
- [Proxy and local API](docs/en/proxy.md)
- [Build, test, and release](docs/en/development.md)
- [Media replacement checklist](docs/en/media.md)
- [Verification method sources](MODEL-VERIFICATION.md)

## Privacy and limits

Credentials are read locally and key values are stored as short irreversible fingerprints. Modivue does not bypass third-party human verification. Missing measurements and unknown costs are never converted to zero.

## License

See the repository license and package metadata for licensing terms.
