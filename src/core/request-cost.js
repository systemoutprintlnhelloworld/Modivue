import { estimateTokenCost } from "./metrics.js";

const amount = value => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

// Usage totals are snapshots, not increments. Never add repeated streaming
// totals, provider inference costs, account spend, or remaining credit.
export function reportedRequestCost(payload) {
  const scopes = [
    ["response.usage", payload?.response?.usage], ["message.usage", payload?.message?.usage],
    ["usage", payload?.usage], ["usageMetadata", payload?.usageMetadata],
    ["response", payload?.response], ["", payload]
  ];
  for (const [prefix, value] of scopes) {
    if (!value || typeof value !== "object") continue;
    for (const name of ["cost_usd", "total_cost_usd", "cost"]) {
      const raw = value[name];
      const money = raw && typeof raw === "object" ? raw.amount : raw;
      const currency = raw && typeof raw === "object" ? raw.currency : value.cost_currency || value.currency;
      // Bare `usage.cost` follows the OpenRouter usage-accounting contract
      // (USD). Unqualified top-level `cost` requires an explicit currency.
      if (name === "cost" && (currency ? String(currency).toUpperCase() !== "USD"
        : !prefix.endsWith("usage") || typeof raw === "object")) continue;
      if (amount(money) !== null) return { value: amount(money), currency: "USD", field: [prefix, name].filter(Boolean).join("."), raw };
    }
  }
  return null;
}

export function reportedHeaderCost(headers) {
  const raw = headers.get("x-litellm-response-cost");
  return amount(raw) === null ? null : { value: amount(raw), currency: "USD", field: "headers.x-litellm-response-cost", raw };
}

export function resolveRequestCost({ apiCost, usage, channelPricing, catalogPricing }) {
  if (apiCost) return { costUsd: apiCost.value, costStatus: "actual", costSource: "api", costDetails: apiCost };
  for (const [source, pricing] of [["channel", channelPricing], ["models.dev", catalogPricing]]) {
    const value = estimateTokenCost(usage, pricing);
    if (value !== null) return { costUsd: value, costStatus: "estimated", costSource: source,
      costDetails: { currency: "USD", unit: "USD/1M tokens", rates: { ...pricing } } };
  }
  return { costUsd: null, costStatus: "unknown", costSource: "unknown", costDetails: null };
}

export function requestCostLabel(request) {
  if (!Number.isFinite(request.costUsd ?? request.cost_usd)) return "费用未知";
  const source = request.costSource || request.measurement?.cost?.costSource;
  if (source === "api" || (request.costStatus || request.cost_status) === "actual") return "API 实际费用";
  if (source === "channel") return "渠道单价估算";
  if (source === "models.dev") return "models.dev 单价估算";
  return "历史估算";
}
