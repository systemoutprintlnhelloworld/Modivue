# Monitoring runtime contracts

## 1. Scope

Applies to verification scheduling, desktop service ownership, and the sample identity shared by alerts and charts. Read `AGENTS.md` before implementing or validating these paths.

## Agent routing and notification contracts (2026-09-16)

- Trigger: a switcher changes an Agent provider while the local proxy remains running.
- Signatures: `configuredAgentRoute({ protocol, agentId, authorization, proxyOrigin, env, home, cwd })`; `proxyStream({ apiKey, authHeader, ... })`; default `/proxy/{openai|anthropic}/v1/...` with `x-modivue-agent`.
- Contract (2026-09-17): a recognized explicit Agent or unique credential match selects Agent identity. Read the matching current CCS provider on each default-route request; absent identity, a unique same-protocol CCS row is eligible. Read destination and credential from one row. CCS rows expose agentId/protocol/authHeader; Gemini must never enter OpenAI routing. Named routes and internal modivue-probe requests retain their explicit destination. Static default is used only when no dynamic candidate exists. This does not install proxy overrides or rewrite Agent files.
- Error matrix: missing/malformed config, missing credential, ambiguous match or self-proxy destination -> 503 for dynamic routing, no old-provider fallback. Invalid current CCS rows retain Agent/protocol identity and an error; routing rejects them, and balance queries skip them. Do not drop malformed rows and mistake them for absent configuration. A named Agent never falls back to another Agent's credential match. OpenAI subscription OAuth is unsupported; `requires_openai_auth = true` permits an API key from `auth.json`.
- Good/base/bad: untagged Codex with one current CCS row A then B -> next request uses B URL and Key even if the incoming Key is old; no CCS/config candidate -> existing static route; ambiguous CCS rows or self-proxy -> reject, not static fallback. Config TOML and auth JSON are separate files, not an atomic transaction.
- Verification points: use isolated configs and database, stub the upstream only. Assert outbound auth replacement, current-Key sample/pricing attribution, old/new secret redaction, static route preservation, and rejection branches. Do not create test files without authorization.
- Wrong/correct: changing only the destination sends the old Key to the new provider. Pass the selected credential with the destination and use the outbound credential for identity and redaction.
- Notification dispatch: `alertSoundPayload(type)` is shared by browser and desktop. Browser playback consumes the selected category, honors `off` and volume, and browser Notification is silent to prevent duplicate platform sound. Balance uses its own application/system toggles through the common delivery function. Windows tray sound remains unverified.

## 2. Signatures

- `PATCH /api/settings`: `verificationIntervalMinutes`, `probeIntervalMinutes`, `workingProbeDelaySeconds`.
- `verificationDue(target, evaluatorId, runs, intervalMinutes, now, questionId)` in `src/core/probe.mjs`.
- `node server.mjs --desktop-parent`: native desktop child process.
- `modelIdentityParts(value)` in `src/core/model-identity.js`: model, endpoint, Key group, reasoning profile.

## 3. Contracts

- Verification rounds accept integer minutes from 1 to 1440, measured from the previous round's completion. Five minutes means 300000 ms, not a within-round request delay.
- Working request spacing accepts integer seconds from 5 to 3600. Failure cooldown is separate. Single-question mode sends no additional performance probe.
- An incomplete single question does not bypass the next-round interval. Multi-request methods can resume partial work; explicit manual verification is independent.
- Desktop launchers hold the write end of the child's stdin pipe. EOF makes the service exit, including when the host crashes. Standalone `node server.mjs` does not use this lifetime contract.
- Performance samples and chart selection use the complete four-tuple. Global alerts retain all monitored targets and display their identity; overview events use the selected identity.
- Passive Cache uses provider usage and the original `observedAt`/`eventId`. Do not replace timestamps with the current time, overwrite an available database aggregate with a snapshot, or invent TTFT from rollout duration.

## 4. Validation and errors

| Condition | Behavior |
| --- | --- |
| Round interval outside 1-1440 or non-integer | Settings request rejected |
| Working spacing outside 5-3600 or non-integer | Settings request rejected |
| Passive timestamp missing or outside selected range | Exclude from that range |
| Alert has another reasoning profile | Keep as another target; do not merge into selected metrics |
| Desktop stdin reaches EOF | Service exits |
| Multiple services share the database | Inspect each live service's settings and executable; replacing files does not reload imported modules |

## 5. Cases

- Good: a completed question remains ineligible at 299999 ms and becomes eligible at 300000 ms for a five-minute interval.
- Base: the existing saved/default 15-minute interval is retained until the user changes it.
- Bad: `high`/`max` alerts are presented as evidence of missing default-profile samples, or a stale 99% range remains beside a fresh 97% snapshot.

## 6. Verification points

Use existing core/Web/runtime checks and isolated interaction verification; do not add tests without user authorization. Check settings round-trip, due boundaries, alert-to-target navigation, snapshot deduplication, and desktop pipe EOF. Do not call paid providers or mutate production settings. Stop only owned test processes unless the user explicitly authorizes another process.

## 7. Wrong versus correct

- Wrong: increase a request-delay input limit and claim the round scheduler is fixed.
- Correct: trace settings through `verificationDue` and the scheduler, then inspect running services for an obsolete scheduler.
- Wrong: use a displayed model name alone to connect an alert to chart data.
- Correct: preserve the four-tuple and timestamp across storage, API, both windows, and alert navigation.
