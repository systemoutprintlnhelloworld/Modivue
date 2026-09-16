# Model verification

Verification compares a channel's behavior with a reference answer or distribution. It is behavioral evidence, not human IQ, a coding score, or identity authentication.

1. Select a target: model × channel × key group × reasoning effort.
2. Select a method.
3. Start the run; active sessions may be queued.
4. Review the historical report and raw answers.

Methods include single-question tests, Meow, KBF, HLWY, One Token, Astra, Juice, BazaarLink Probe, Ztest import, local multi-probes, and custom probability probes.

- Single-question tests reuse TTFT, cache, and usage from the request.
- Meow compares short-answer distributions with its reference pool.
- KBF compares probes with historical model references.
- HLWY compares integer distributions using similarity measures.
- One Token and Astra require suitable reference archives for meaningful comparison.
- Juice stores raw generated integers; it is not a server-authenticated budget.
- BazaarLink uses its official asynchronous API and per-target authorization.
- Ztest import requires the user to complete the website's human verification.

Unknown costs remain unknown, and automatic collection does not create a truth threshold.

[Back to README](../../../README.en.md) · [Feature index](README.md) · [Method sources](../../../MODEL-VERIFICATION.md)
