# Local proxy and API

The desktop port is assigned dynamically; browser development uses `http://127.0.0.1:4173` by default.

Point an agent's Base URL to `/proxy/openai/v1` or `/proxy/anthropic/v1` on the local proxy. Every streamed request is recorded in local SQLite; only irreversible short key fingerprints are stored.

Supported protocols preserve raw JSON and explicit cache fields:

| Protocol | Cache field |
|---|---|
| OpenAI Chat Completions | `usage.prompt_tokens_details.cached_tokens` |
| OpenAI Responses | `usage.input_tokens_details.cached_tokens` |
| Anthropic Messages | `usage.cache_read_input_tokens` |

TTFT starts at the first valid text or tool event. Multiple routes can be configured with `MODIVUE_UPSTREAMS`; named routes use `/proxy/openai/<route>/v1/...` and the equivalent Anthropic path.

Active probe targets can come from configured Claude Code / Codex connections or `MODIVUE_PROBE_*` variables. See [Cost and balance](features/cost.md#cost-and-balance).

| Endpoint | Purpose |
|---|---|
| `GET /api/summary` | Aggregated metrics |
| `GET /api/samples` | Request details |
| `GET /api/config` | Routes and normalized URLs |
| `GET /api/agents` | Agent sessions |
| `POST /api/probe` | Manual probe |
| `GET /api/quality/evaluators` | Registered evaluators |

[Back to README](../../README.en.md) · [Feature index](features/README.md)
