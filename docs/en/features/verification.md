# Model verification

![Model verification](../../assets/features/verification.png)

Verification compares a channel's behavior with reference answers or distributions. It is not human IQ, a general coding-ability score, or model identity authentication.

[中文](../../features/verification.md) · [Back to README](../../../README.en.md#model-verification) · [Feature index](README.md) · [Method sources and limits](../../../MODEL-VERIFICATION.md)

## Start a run

1. Open **Model verification** and select a model × channel × key group × reasoning effort target.
2. Select a method; use the [selection table](../../../README.en.md#choose-a-method-for-your-situation) if needed.
3. Start detection. Scheduling, agent activity, and budget affect when requests are allowed. The interface displays progress and valid sample counts.
4. Inspect the completed result in historical reports, including the raw answers and method-specific evidence.

Requests consume provider tokens. See [Cost and balance](cost.md).

## Methods

### Single-question test

Supply a question and reference answer. Each round makes one request and reuses its TTFT, cache, and usage measurements. Automatic rounds obey the verification interval measured from the previous completion; the within-round request delay is not the round interval. Statistics are separated by question-content version, target identity, and time window, including matches, valid comparisons, failures, and totals.

Normal single-question requests default to a 300-second timeout and 16,384 output tokens. The water-cup proof question is not time-limited and can be paused or stopped. Preserve the full answer for manual review rather than treating a short-answer match as a proof check.

### Meow model direction

Compares short-answer distributions against candidate models using the upstream [meow-llm-detector](https://github.com/chen-006/meow-llm-detector) reference. The implementation uses the 4.5.4 reference families for Responses, Messages, and Chat Completions.

| Profile | GPT candidates | Claude candidates |
|---|---|---|
| Preview | 6 requests | 6 requests |
| Full tiers | 32 / 48 / 96 requests | 48 / 72 / 120 requests |

Candidate hits and raw scores are shown separately. Historical OpenRouter reference-frequency material is not a newly trained decision threshold; scoring retains the upstream method's conditions and limits.

### KBF knowledge boundary

Uses references for 16 historical models and 4,359 probes. A trial batch does not support a full conclusion. Full evaluation uses CP99 and a one-sided binomial test.

### HLWY distribution matching

Compares integer distributions using mode distance, cosine similarity, and Jensen–Shannon similarity. References may come from public distributions or a trusted API. Fewer than 50 valid samples remain a preview; the similarity percentage is not an identity probability.

### One Token and Astra

- **One Token:** distribution comparison across 10 English task categories; not a reproduction of the full four-language study.
- **Astra:** adapts five community task groups. The source does not supply the precise question set and distributions, so Modivue does not reproduce its strong identity claims.

Both default to one sample per question for preview. Collect matching references first for a useful comparison; see [Calibration](calibration.md).

### Custom probability probes

Compare custom short-answer distributions using JSD. Uncalibrated observations do not establish a pass/fail identity threshold.

### Juice

Records integers generated in responses as raw evidence. These are not authenticated server-side reasoning budgets. Without a suitable reference, the result remains inconclusive.

### BazaarLink Probe

Uses the service's asynchronous API with consent for each target before sending its key.

- Quick, comprehensive, and context modes.
- Continuous plans with an interval, daily-round limit, progress, and stop controls.
- Persisted reports and polling of the original remote task after restart. Uncertain startup state pauses continuation rather than submitting a duplicate job.
- In-progress reports are not imported as completed results.

Individual results are not combined into IQ, and report signatures do not authenticate model identity. See [fees](cost.md#bazaarlink-fees).

### Ztest and local multi-probes

These are separate capabilities:

- **Official Ztest:** the browser-assisted flow can fill the selected target and submit detection. Human verification remains the user's action. Reports can also be imported by URL or JSON. Confirm their target identity before association; reimporting one report must not duplicate accounting.
- **Local multi-probes:** five simple request groups record answers, failures, and duration. They do not reproduce private Ztest probes or claim its score.

## Interpretation

Similarity is not confidence of authenticity. Reference collection does not invent thresholds. Incomplete or incompatible evidence remains inconclusive, and unknown cost remains unknown.
