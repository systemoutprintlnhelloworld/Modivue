# Local proxy and API

[中文](../proxy.md) · [Back to README](../../README.en.md#getting-started) · [Feature index](features/README.md)

The desktop app selects a local port at launch. Copy its endpoint from **Settings → Local proxy**. Port 4173 below is the development default, not a fixed desktop port.

## Route an agent through Modivue

To run a development server with explicit upstreams:

```bash
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
MODIVUE_ANTHROPIC_UPSTREAM=https://api.anthropic.com \
npm run dev
```

Use `http://127.0.0.1:4173/proxy/openai/v1` for OpenAI-compatible traffic and `http://127.0.0.1:4173/proxy/anthropic/v1` for Anthropic. The service listens on loopback. It sends requests and credentials to the selected upstream; stored request identity uses a short key fingerprint rather than the raw key.

## Protocols and measurements

| Protocol | Cache-reading field |
|---|---|
| Chat Completions | `usage.prompt_tokens_details.cached_tokens` |
| Responses | `usage.input_tokens_details.cached_tokens` |
| Anthropic Messages | `usage.cache_read_input_tokens` |

TTFT runs from request start to the first valid output content. Empty events, reasoning-only fragments, the first HTTP byte, and total request duration are not substitutes. Raw usage and measurement metadata are retained.

## Named routes

```bash
MODIVUE_UPSTREAMS='{"openai":{"team-a":"https://openai-a.example/v1"},"anthropic":{"team-b":"https://anthropic-b.example"}}' \
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
npm run dev
```

The default path is `/proxy/openai/v1/...`; a named path is `/proxy/openai/team-a/v1/...`. Anthropic follows the same pattern. Route IDs must match `[A-Za-z0-9_-]+`. Query parameters are forwarded. The explicit OpenAI/Anthropic upstream environment variables override a JSON route named `default`.

## CC Switch and existing sessions

Default-route requests reread the current CCS provider, selecting URL and key together. An explicit `x-modivue-agent` or a unique credential match selects an agent; without identity, a unique same-protocol CCS row can be used. Ambiguous or invalid current records are rejected instead of falling back to an old provider. Named routes and internal verification probes keep their explicit targets.

This applies only to requests that actually enter Modivue. If CCS writes a remote Base URL, direct requests bypass Modivue. A loaded Codex app-server thread can retain a connection even when its disk configuration changes. Restarting the monitor cannot change that connection. Rejoining an already-loaded thread is not proof that provider overrides were applied.

To follow future switches without restarting Modivue, the agent must first be connected to the local default proxy. Keep CCS's upstream record pointed at the real provider. Transition an existing thread only after its activity and clients are accounted for; do not stop a shared daemon just to repair one session. The desktop origin may change when the app itself restarts. This version does not automatically rewrite agent configuration or guarantee a fixed desktop port.

## Confirming a provider switch

Open **Logs**, clear old target filters, and inspect the next completed ordinary request. A true proxy record has `measurement.source === "observation"`; its `base_url` and `key_group` describe the actual outbound request. `probe` and `codex-rollout` records do not prove that the ordinary session passed through the proxy.

Records are stored after the request ends; the UI refreshes periodically. `/api/config` shows configured routes, not proof of forwarding. An empty log may also mean a request has not completed, bypassed the proxy, or failed during route selection.

## Active-probe targets

Eligible active agent connections and explicit environment targets can be probed. For OpenAI use `MODIVUE_OPENAI_UPSTREAM`, `MODIVUE_PROBE_OPENAI_KEY`, `MODIVUE_PROBE_OPENAI_MODEL`, and optionally `MODIVUE_PROBE_OPENAI_API`. Anthropic uses `MODIVUE_ANTHROPIC_UPSTREAM`, `MODIVUE_PROBE_ANTHROPIC_KEY`, and `MODIVUE_PROBE_ANTHROPIC_MODEL`.

See [Cost](features/cost.md#controlling-active-probe-spending) for intervals and limits. Requests can incur provider charges.

## Local API

| Endpoint | Purpose |
|---|---|
| `GET /api/summary` | Aggregated measurements |
| `GET /api/samples` | Request records; filters include `model`, `baseUrl`, `keyGroup`, and `reasoningEffort` |
| `GET /api/config` | Local port and static route configuration, without keys |
| `GET /api/agents` | Discovered sessions and capabilities |
| `GET /api/agent-sessions?includeEnded=1` | Session history |
| `POST /api/probe` | Manual probe, subject to budget |
| `GET /api/quality/evaluators` | Registered verification methods |

## Model catalog

The service checks [Models.dev](https://models.dev/catalog.json) at startup and periodically afterward, retaining cache validators and synchronization timestamps. A `304` updates freshness. Failed downloads or parsing preserve the previous catalog; without a catalog, the original model name remains visible.
