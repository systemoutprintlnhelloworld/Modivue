# Cost, balance, and quota

![Cost and balance](../../assets/features/cost.png)

This page separates gateway balance, Codex subscription quota, and the cost of Modivue's own detection requests.

[中文](../../features/cost.md) · [Back to README](../../../README.en.md#features) · [Feature index](README.md)

## Balance and quota

### Sources

Provider configurations can come from CC Switch, saved trusted channels, or agent settings. Supported balance adapters include OpenRouter, New API / Sub API, common `/v1/usage` and `/user/balance` endpoints, and custom JSON field mappings.

Modivue uses the configured credentials to query the selected provider. It does not execute CC Switch user scripts. Invalid current CCS configurations are skipped for balance queries rather than replaced with an old provider.

### Codex official OAuth quotas

When Codex uses the official ChatGPT OAuth sign-in, its rollout may contain `rate_limits`. Modivue passively reads unexpired 5-hour (`300` minutes) and 7-day (`10080` minutes) windows, displays `100% - used_percent` as remaining allowance, and preserves the reset timestamp from Codex.

This is not a provider wallet balance and does not send an extra request. It appears only when the local session writes these fields; custom API keys, older records, and relays that do not forward `rate_limits` show “not provided”. See the [OpenAI Codex usage-limits documentation](https://developers.openai.com/codex/cli/usage-limits) for upstream semantics.

CPA account-pool quotas are available through a Management API that requires a management key. Modivue does not currently connect to that API or read, request, or store the key. A Codex session routed through CPA can only show the latest upstream quota written to its rollout, not the whole pool.

### In the interface

- **Dynamic Island:** a balance ring uses the first valid balance as its full-ring reference. A quota ring uses the window's remaining percentage. A top-up above the balance reference keeps that ring full; Settings can reset the baseline.
- **Overview:** displays the current balance or quota. Balance entries support manual refresh and endpoint configuration. Failed queries display errors, not zero.
- **Cost:** creates balance-history panels for individual providers. Balance snapshots have their own timestamps, units, and sample counts; they are not request samples.

## Detection cost

Active probing and verification consume the allowance of the API key used for each request.

- Verification costs are tracked per request; summaries include total, average, and latest cost for the selected target.
- Provider-reported charges and price-based estimates remain distinct. Missing prices or usage produce an unknown cost, not zero.
- Failed requests can still be billable when the provider reports usage.
- Report/log exports use the relevant interface controls. Desktop exports use a native save dialog and report completion.

### Controlling active-probe spending

Active probing is enabled by default and runs on a schedule for eligible targets. Loading a page does not itself submit an extra model request.

| Control | Purpose |
|---|---|
| Enable switch | Pause automatic probing. |
| Probe and verification intervals | Separate scheduler checks from verification rounds. Verification rounds support 1–1440 minutes. |
| Daily request limit | Includes manual local sampling. |
| Output token limit | Bounds output per probe request. |

Equivalent probe targets are deduplicated. Target identity and reasoning conditions must match before observations are combined. Agent activity and remaining budget can defer or stop detection.

## BazaarLink fees

The provider's [Probe API documentation](https://bazaarlink.ai/probe-api-skill.md) describes no additional detection-service fee; model tokens consume the target key's allowance. Its [BYOK documentation](https://bazaarlink.ai/solutions/byok) describes zero markup for your own upstream and platform pricing when fallback routing is used; strict mode disables that fallback.

These are the provider's terms, not an independent billing audit by Modivue. The remote service controls its internal probe count. Its daily-round limit is separate from Modivue's local request budget.
