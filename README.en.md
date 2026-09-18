<div align="center">

<!-- Add a separate static banner before enabling a reduced-motion <source>.
     Pointing both sources to the same GIF does not disable animation. -->
<picture>
  <img src="docs/assets/video.gif" width="100%" alt="Modivue: your Vibe Coding Dynamic Island">
</picture>

<h1><img src="docs/assets/app-icon.svg" width="48" height="48" align="absmiddle" alt=""> Modivue</h1>

**Your Vibe Coding Dynamic Island**<br>
Gateway balance · cache hits · time to first token · model verification, visible at a glance with records kept on your machine

[![Build](https://img.shields.io/github/actions/workflow/status/systemoutprintlnhelloworld/Modivue/build.yml?branch=main&style=flat-square&label=build)](https://github.com/systemoutprintlnhelloworld/Modivue/actions)
[![Release](https://img.shields.io/github/v/release/systemoutprintlnhelloworld/Modivue?include_prereleases&sort=semver&style=flat-square&color=7AA2F7)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)
[![Downloads](https://img.shields.io/github/downloads/systemoutprintlnhelloworld/Modivue/total?style=flat-square&color=4FD1B0&label=downloads)](https://github.com/systemoutprintlnhelloworld/Modivue/releases)

[![Download macOS](docs/assets/download-macos.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/latest/download/Modivue-macos-arm64.zip)
[![Download Windows](docs/assets/download-windows.svg)](https://github.com/systemoutprintlnhelloworld/Modivue/releases/latest/download/Modivue-windows-x64-setup.exe)

[简体中文](README.md) · **English**

[Features](#features) · [Download and install](#download-and-install) · [Getting started](#getting-started) · [Model verification](#model-verification) · [FAQ](#faq) · [Documentation](#documentation)

<h2>Monitor these coding agents</h2>

<p align="center">
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/claude-code.svg" alt="Claude Code"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/codex.svg" alt="Codex"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/gemini.svg" alt="Gemini CLI"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/qwen.svg" alt="Qwen Code"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/opencode.svg" alt="OpenCode"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/goose.svg" alt="Goose"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/continue.svg" alt="Continue"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/pi.svg" alt="Pi"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/grok.svg" alt="Grok Build"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/hermes.svg" alt="Hermes"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/openclaw.svg" alt="OpenClaw"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/gptme.svg" alt="GPTMe"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/cline.svg" alt="Cline"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/roo.svg" alt="Roo Code"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/aider.svg" alt="Aider"></a>
<a href="docs/en/features/agents.md"><img src="docs/assets/badges/dsh.svg" alt="DeepSeek Harness"></a>
</p>

<sub>Support levels differ. See <a href="#supported-agents">supported agents</a> for the distinction between configuration parsing and runtime validation.</sub>

</div>

---

**Modivue** is a local floating monitor for macOS and Windows, built for developers who use Claude Code, Codex, and other coding agents through API gateways. It reads provider balances, records cache usage and time to first token, and runs model verification on demand. Verification preserves evidence of whether a channel's responses match reference behavior. Request measurements and verification reports use local SQLite; balances and supporting configuration use local files.

<div align="center">
<img src="docs/assets/main-demo.gif" width="860" alt="The Modivue Dynamic Island expanding and collapsing">
<br>
<sub>Move the pointer onto the panel to expand it, hover a model ring for details, and move away to collapse it.</sub>
</div>

## Four questions it answers

| What you want to know | How Modivue answers it |
|---|---|
| How much gateway balance remains? | Reads balance endpoints for providers discovered through CC Switch, saved channels, or agent configuration. Supports OpenRouter, New API / Sub API, and custom JSON mappings, with a balance ring and history. |
| Is prompt caching actually working? | Calculates cache hit rate only from explicit provider cache fields. Missing fields stay missing, rather than becoming zero. |
| Why is the first token slow today? | Measures the time from request start to the first valid output text or tool event, with separate trends for each channel. |
| Does this "model" behave like its claimed reference? | Offers 11 verification methods and keeps raw answers and decision evidence. These are behavioral observations, not identity authentication. |

Metrics are separated by **model × channel × key group × reasoning effort**. The same model through two gateways, or two keys at one gateway, produces separate records instead of a combined average.

---

## Features

<div align="center">
<img src="docs/assets/interaction-overview.jpg" width="100%" alt="Modivue interaction concept: compact state, ring hover, expanded panel, multiple models, themes, and terminal status line">
<br>
<sub>Interaction concept illustration. Older labels in this illustration do not define the current metrics; see the feature guides and screenshots below. Shared screenshots currently show the Chinese interface.</sub>
</div>

<br>

<!-- Feature images are shared with README.md. Replace the same files to update both languages. -->

<table>
<tr>
<td width="33%" valign="top"><a href="docs/en/features/overview.md"><img src="docs/assets/features/overview.png" alt="Overview and metric trends" width="100%"></a><br><b><a href="docs/en/features/overview.md">Overview and metric trends</a></b><br>Filter by model, channel, key group, and reasoning effort. View verification, cache, TTFT, and balance trends.</td>
<td width="33%" valign="top"><a href="docs/en/features/island.md"><img src="docs/assets/features/island.png" alt="Dynamic Island panel" width="100%"></a><br><b><a href="docs/en/features/island.md">Dynamic Island panel</a></b><br>A screen-edge panel with minimal, normal, and focus states. Hover a model ring to inspect metrics and recent trends.</td>
<td width="33%" valign="top"><a href="docs/en/features/agents.md"><img src="docs/assets/features/agents.png" alt="Agent status" width="100%"></a><br><b><a href="docs/en/features/agents.md">Agent status</a></b><br>Discover local Claude Code, Codex, and other sessions, distinguishing an existing configuration from a running agent.</td>
</tr>
<tr>
<td valign="top"><a href="docs/en/features/verification.md"><img src="docs/assets/features/verification.png" alt="Model verification" width="100%"></a><br><b><a href="docs/en/features/verification.md">Model verification</a></b><br>Run any of 11 methods on demand. Keep each method's raw responses and decision evidence.</td>
<td valign="top"><a href="docs/en/features/cost.md"><img src="docs/assets/features/cost.png" alt="Cost and balance" width="100%"></a><br><b><a href="docs/en/features/cost.md">Cost and balance</a></b><br>Track each provider's balance history and each verification request's cost. Unknown costs are never counted as zero.</td>
<td valign="top"><a href="docs/en/features/calibration.md"><img src="docs/assets/features/calibration.png" alt="Trusted references and calibration" width="100%"></a><br><b><a href="docs/en/features/calibration.md">Trusted references and calibration</a></b><br>Collect reference distributions on a trusted channel and export archives for comparison with other channels.</td>
</tr>
<tr>
<td valign="top"><a href="docs/en/features/settings.md"><img src="docs/assets/features/settings.png" alt="Settings and notifications" width="100%"></a><br><b><a href="docs/en/features/settings.md">Settings and notifications</a></b><br>Set detection intervals, daily limits, category-specific sounds, themes, text size, and visible information.</td>
<td valign="top"><a href="docs/en/features/overview.md#layout"><img src="docs/assets/features/layout.png" alt="Custom layout" width="100%"></a><br><b><a href="docs/en/features/overview.md#layout">Custom layout</a></b><br>Long-press a block, keep holding, and drag to reorder. The layout is saved when you release.</td>
<td valign="top"><a href="docs/en/features/cli.md"><img src="docs/assets/features/cli.png" alt="CLI and status line" width="100%"></a><br><b><a href="docs/en/features/cli.md">CLI and status line</a></b><br>Read the same local measurements in a terminal or Claude Code status line without starting paid model requests.</td>
</tr>
</table>

---

## Download and install

| Platform | Package | Installation |
|---|---|---|
| macOS Apple Silicon | `Modivue-macos-arm64.zip` | Unzip and move `Modivue.app` to Applications. No Intel package is currently provided. |
| Windows 10/11 x64, preview | `Modivue-windows-x64-setup.exe` | Run the installer. The release also includes a portable ZIP. Microsoft Edge WebView2 Runtime is required. |
| CLI | Source files in `cli/` | Node.js 22.5 or later. Reads the desktop app's shared local database. |

### Before opening for the first time

> [!WARNING]
> These are preview builds. The macOS package is ad-hoc signed, not Apple-notarized. The Windows package is unsigned; native multi-DPI acceptance testing is still incomplete.

**macOS:** If Gatekeeper blocks the first launch, verify that you trust the download, then use **System Settings → Privacy & Security → Open Anyway**. For a trusted local copy only, you can alternatively clear its quarantine attributes:

```bash
xattr -cr /Applications/Modivue.app
```

Do not clear quarantine for an untrusted download.

**Windows:** Current release packages are unsigned and may trigger SmartScreen. After verifying the source and file, use the system-provided **More info → Run anyway** option if required; do not disable system protection.

The release workflow produces a macOS ZIP and Windows ZIP/installer. Trusted Windows signing and macOS notarization credentials are not configured yet; the existence of an installer does not mean it is signed. See [Build, test, and release](docs/en/development.md).

---

## Getting started

1. **Launch Modivue.** The Dynamic Island appears at the screen edge. The local service listens only on `127.0.0.1`.
2. **Discover your agents.** Claude Code can report sessions through status-line or hook heartbeats. Codex uses local session evidence. Other adapters inspect selected provider configurations and running processes. See [Agent status](docs/en/features/agents.md).
3. **Route real requests through Modivue.** Set the agent's Base URL to a local proxy endpoint:

   ```text
   OpenAI protocol     Local origin shown in Settings + /proxy/openai/v1
   Anthropic protocol  Local origin shown in Settings + /proxy/anthropic/v1
   ```

   Copy the full endpoint from **Settings → Local proxy** when it is shown. Only requests that actually pass through Modivue can produce proxy-measured TTFT, cache, cost, and outbound-route records. Discovering a provider configuration does not intercept its requests.

   For multi-channel routing and CC Switch behavior, see [Local proxy and API](docs/en/proxy.md).
4. **Verify when needed.** Open **Model verification**, choose a target and method, and start the run. Verification consumes tokens; Modivue records cost per request.

---

## Dynamic Island

The desktop panel uses the following states.

| State | How to enter | What it shows |
|---|---|---|
| Minimal | Default | A compact ring for each active model; the metric is configurable. Drag grips and Settings are hidden. |
| Normal | Move the pointer onto the panel | Working and recently active targets, with drag grips and Settings available. |
| Focus | Hover a model ring | Selected verification, cache, TTFT, and balance rings, plus a detail card and recent trends. |
| Main window | Click a model | Statistics, trends, alerts, logs, verification reports, and settings. |

Drag the panel and release to snap it to the nearest left or right screen edge. Use `⌘K` / `Ctrl+K` in the main window to search for a feature. See [Dynamic Island panel](docs/en/features/island.md) for display options and platform differences.

<div align="center"><img src="docs/assets/灵动岛.png" width="860" alt="Modivue Dynamic Island, Chinese interface"></div>

---

## Model verification

Verification produces **behavioral evidence** by comparing responses with a reference distribution or answer. Results are not human IQ, and a similarity value is not model-identity confidence. See [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md) for implementation details and limitations in Chinese, and [Model verification](docs/en/features/verification.md) for the English guide.

<div align="center"><img src="docs/assets/模型核验-main.png" width="860" alt="Model verification, Chinese interface"></div>

### Choose a method for your situation

| Your situation | Method | What to prepare | Request volume |
|---|---|---|---|
| You have a familiar question and want to watch its answers over time | Single-question test | A question and reference answer | One planned answer per round, with up to three attempts for retryable failures. Automatic rounds use the shared round interval, default 15 minutes, configurable from 1 to 1440 minutes. |
| You have no trusted channel and want to see which candidate behavior is closest | Meow model fingerprint | Nothing; references are bundled | Preview: 6 requests. Full tiers: GPT 32 / 48 / 96, Claude 48 / 72 / 120. |
| You want to compare knowledge boundaries | KBF | Nothing; 16 historical model references are bundled | Start with one batch. A screening batch does not yield a full verdict. |
| You have a trusted channel for a controlled comparison | HLWY, One Token, Astra, custom probability probe | Collect a reference archive; see [Trusted references and calibration](docs/en/features/calibration.md) | One Token / Astra need at least 10 valid answers per task for reference comparison. Fewer than 50 valid HLWY samples are a preview. |
| You want a third-party detection service | BazaarLink Probe, official Ztest detection | Per-target consent for BazaarLink; complete Ztest's website flow and import its report | BazaarLink's published guidance says there is no separate detection fee; tokens are charged to the target key. See the [cost guide](docs/en/features/cost.md#bazaarlink-fees). |
| You only want raw observations | Juice, local multi-probes | Nothing for raw Juice; calibrated Juice needs a reference archive | Raw Juice plans one request. Local multi-probes use five simple request groups. |

Request counts describe planned samples, not a guarantee of the final bill. Retries and failed requests with billable usage can add cost.

### What Modivue does not do

- Convert similarity into "IQ" or model-identity confidence.
- Bypass Ztest's human verification, or present local multi-probes as Ztest's official scoring.
- Treat unknown costs as zero.
- Invent authenticity thresholds for collected distributions. If a usable reference has no threshold, a distance alone does not produce a verdict. If the custom probability probe has no reference at all, it cannot calculate a comparison distance.

<details>
<summary><b>Sources and implementations of all 11 methods</b></summary>

| Method | What it checks | Source or implementation | Reference requirement |
|---|---|---|---|
| Single-question test | Matches a custom question's answer against a reference | [evaluator-question.mjs](src/core/evaluator-question.mjs) | No distribution archive required |
| Meow model fingerprint | Short-answer distributions against candidate references | [meow-llm-detector](https://github.com/chen-006/meow-llm-detector), [evaluator-meow.mjs](src/core/evaluator-meow.mjs) | Bundled references |
| HLWY distribution matching | Mode, cosine, and JS similarity for integer distributions | [hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker), [evaluator-hlwy.mjs](src/core/evaluator-hlwy.mjs) | Public reference or trusted API collection |
| KBF knowledge boundaries | Historical model probes, CP99 and a one-sided binomial test | [Ooo0ption/KBF](https://github.com/Ooo0ption/KBF/tree/481c78da14df4f2b02b43d344dae7199ae08cea0), [implementation](src/core/evaluator-kbf.mjs) | Bundled references; screening is not a full verdict |
| One Token | Distribution differences on single-token English tasks | [Paper](https://arxiv.org/abs/2607.10252), [evaluator-one-token.mjs](src/core/evaluator-one-token.mjs) | Collect a reference first; only 10 English task classes are adapted |
| Astra | Adapted observations from five community task groups | [Community post](https://linux.do/t/topic/2861517), [implementation](src/core/evaluator-astra.mjs) | Self-collected reference; not a reproduction of the author's exact task set |
| Juice | An integer in the generated answer, not a server-attested budget | [Requested reference post](https://linux.do/t/topic/2704354), [implementation](src/core/evaluator-coding.mjs) | The referenced post's body has not been verified; calibrated mode needs an archive |
| BazaarLink Probe | Official asynchronous detection and recurring plans | [Probe API](https://bazaarlink.ai/probe-api-skill.md) | External service |
| Official Ztest detection | Website workflow followed by report import | [Ztest](https://ztest.ai), [report adapter](src/core/evaluator-ztest.mjs) | External service; human verification remains a user action |
| Local multi-probes | Five simple request groups recording responses, errors, and duration | [Implementation](src/core/evaluator-ztest.mjs) | Does not reproduce Ztest's private probes or scoring |
| Custom probability probe | JSD comparison of custom short-answer distributions | [Reference project](https://github.com/dreamor/llm-fingerprint), [implementation](src/core/evaluator-coding.mjs) | A usable reference archive; no directional verdict without a calibrated threshold |

</details>

---

## API provider frameworks

**3 framework integrations**, with different capabilities—not a claim that all support balances or that every release has been tested:

<p align="center">
<a href="#api-provider-frameworks"><img src="docs/assets/badges/provider-new-api.svg" alt="New API: account and token balance"></a>
<a href="#api-provider-frameworks"><img src="docs/assets/badges/provider-sub2api.svg" alt="Sub API / Sub2API: usage balance adapter"></a>
<a href="#api-provider-frameworks"><img src="docs/assets/badges/provider-cpa.svg" alt="CLIProxyAPI: detected; balance deferred"></a>
</p>

| Framework | Detection / selection | Balance | Cache / TTFT | Model verification |
| --- | --- | --- | --- | --- |
| New API | Select account balance or token quota in settings | `/api/user/self` for accounts; `/api/usage/token/` for keys. Raw quota is not presented as currency. | Shared protocol collection; requires actual usage / first-content events | Shared evaluators, subject to model, protocol, and reference support |
| Sub API / Sub2API | Select the usage adapter in settings | `/v1/usage`, only for deployments returning supported balance fields | Same as above | Same as above |
| [CLIProxyAPI (CPA)](https://github.com/router-for-me/CLIProxyAPI) | Detects a local deployment through the public identifier at its service root | **Hidden for now**; usage / token counters are not wallet balances | Streaming or non-streaming requests share the collection path when routed through Modivue; only explicit usage and first valid content are recorded | Depends on model and references; remote evaluators cannot access a loopback address |

Reading Agent configuration does not intercept its requests. Cache usage can come from local Codex records; real TTFT requires traffic through Modivue's proxy or an active performance sample. Active samples and verification may consume provider credits. CPA management APIs and management keys are not used.

## Supported agents

| Support level | Agents |
|---|---|
| Live session-state collection | Claude Code through status-line / hook heartbeats; Codex through local lock ownership and unfinished-session evidence. |
| Recorded local installation and launch checks | Gemini CLI, Qwen Code, Pi, OpenCode |
| Provider configuration parsing, real-installation acceptance still pending | Goose, Continue, Grok Build, Hermes, DeepSeek Harness, OpenClaw, GPTMe, Cline, Roo Code, Aider |

These levels do not claim that every adapter has passed a real upstream request test. See [Agent status](docs/en/features/agents.md) for discovery methods, [ROADMAP.md](ROADMAP.md) for pending work in Chinese, and [asset attribution](docs/assets/NOTICE.md) for icon sources and licenses.

---

## Privacy and data boundaries

- The local service listens only on `127.0.0.1`.
- Request measurements and verification reports are stored in local SQLite. Balance snapshots and history, model catalog caches, and supporting configuration are stored in local files.
- Measurement records identify API keys by short irreversible fingerprints, not the key itself. Trusted-provider keys you explicitly save, and configured balance-query credentials, are stored as plaintext in local configuration files written with owner-only permissions where supported. Protect those files under your local security policy.
- Active probes and verification send requests to configured upstreams and may cost money. Disable them, reduce their frequency, or set a daily request limit in Settings.
- Model catalog sync, public references, and update checks contact remote sources. Official BazaarLink and Ztest detection also involve their respective services. Local storage does not mean fully offline operation.

---

## FAQ

**Will Modivue send my API key anywhere?**
Measurement records use key fingerprints. Proxy requests and active verification authenticate to your configured upstream. Balance checks authenticate to their configured endpoints. BazaarLink Probe requires consent for each target before sending that target's key to the service.

**How much does verification cost?**
It depends on the method, retries, token usage, and provider pricing. See the [method selection table](#choose-a-method-for-your-situation). Cost is recorded per request; unavailable pricing is shown as unknown.

**Can a verification result prove that a gateway substituted a model?**
Not by itself. It measures differences from a reference answer or distribution. Similarity is not identity confidence. Read the [verification guide](docs/en/features/verification.md) and [implementation limits](MODEL-VERIFICATION.md).

**Do the CLI or status line cost money?**
They do not start model requests or paid verification. The CLI reads local data, or the loopback API if you supply `--url`. The Claude Code scripts also record local session heartbeats.

**What if macOS refuses to open the app?**
See [Before opening for the first time](#before-opening-for-the-first-time).

**Is there an Intel Mac build?**
No Intel download is currently provided. The published macOS package targets Apple Silicon.

**Is agent status equally reliable on Windows and macOS?**
No. Windows uses process discovery and configuration parsing together with proxy or hook evidence. A running process alone does not prove that an agent is working. Codex discovery uses Windows Restart Manager to identify lock owners, then checks for unfinished local turns; macOS uses `lsof` for lock ownership.

---

## Documentation

| I want to… | Read |
|---|---|
| Learn how each feature works | [Feature guide index](docs/en/features/README.md) |
| Understand verification methods and limits | [English verification guide](docs/en/features/verification.md), [MODEL-VERIFICATION.md](MODEL-VERIFICATION.md) in Chinese |
| Configure multiple channels or call the local API | [Local proxy and API](docs/en/proxy.md) |
| Read metrics in a terminal or status line | [CLI and status line](docs/en/features/cli.md) |
| Build, test, and release | [Development guide](docs/en/development.md) |
| Replace screenshots and recordings | [Media checklist](docs/en/media.md) |
| Review planned work | [ROADMAP.md](ROADMAP.md) in Chinese |

---

## Run from source

```bash
git clone https://github.com/systemoutprintlnhelloworld/Modivue.git
cd Modivue
npm ci
npm run dev              # Browser debugging at http://127.0.0.1:4173
npm run desktop:build    # On macOS: dist/Modivue.app
npm run windows:build    # On Windows: requires .NET SDK 8
```

For environment requirements and existing checks, see [Build, test, and release](docs/en/development.md).

## Contributing

When reporting an issue, include your OS version, agent, protocol such as Chat Completions / Responses / Messages, gateway type, relevant redacted logs, and reproduction steps. Contributions can add provider balance adapters, verification methods, or translations. Do not include keys or private conversation content in public reports.

[![Star History Chart](https://api.star-history.com/svg?repos=systemoutprintlnhelloworld/Modivue&type=Date)](https://star-history.com/#systemoutprintlnhelloworld/Modivue&Date)

## Friends

[Linux DO](https://linux.do/)

## License

Original project code is licensed under the [MIT License](LICENSE). Third-party code, assets, and trademarks retain their own terms and notices; see [asset attribution](docs/assets/NOTICE.md).

A free Windows code-signing application is being prepared. SignPath approval and a signing certificate have not been obtained; see [application preparation](docs/windows-signing.md).
