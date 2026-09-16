# Cost and balance

Modivue separates provider balance snapshots from the cost of its own probes and verifications.

## Balance

Supported sources include OpenRouter, New API / Sub API, common usage or balance endpoints, and custom JSON field mappings. Credentials stay local. Failed balance requests show an error instead of zero.

The Dynamic Island uses the first valid balance as the full-ring reference. Reset this reference in Settings.

## Verification cost

Each request records cost when pricing is available. Unknown pricing is shown as **unknown**, never zero. Active probes follow the configured interval, daily limit, and output-token limit. Equivalent targets with the same protocol, URL, key group, model, and request mode are sampled once.

BazaarLink pricing details are based on its public documentation and are not independently verified by Modivue.

[Back to README](../../../README.en.md) · [Feature index](README.md)
