# ADR-012: Outage behaviour and liveness

- **Status:** accepted (Nick, 2026-09-27)
- **Date:** 2026-09-27
- **Owner:** Architect / Lead
- **Decider:** Nick
- **Contract impact:** adds `onUnavailable` to the question set spec and an outage rule to the run engine; adds `failureClass` to feedback and review resolutions; adds a liveness alert kind

## Context

A System One call can fail after SDK retries (`system_one_unavailable`, `system_one_overloaded`, timeouts). Today the engine maps the error to a code, but the contracts do not say what each decision's `effectiveAction` should be when there is no answer.

A public report from 2026-09-26 shows why this matters. A builder put Jev between an LLM and themselves to block drafts that broke their rules. When Jev stopped answering, the calling agent decided silence was the safe choice and stopped sending anything at all. It took a second agent to notice and unstick it. The failure was not the outage. It was treating "no answer" as "block everything" with nobody alerted.

TypeSafe's official agent skill also asks builders to separate missing evidence, model errors, code errors and service failures when a decision is wrong. SysOne records no such class.

## Decision

1. **Outage rule per set.** `QuestionSetSpec` gains `onUnavailable: "fallback" | "review" | "escalate_to_llm"`, default `review` since Amendment 1 (originally `fallback`). It never resolves to `auto`.
2. **Always an instruction.** When System One is unavailable after retries, `runQuestionSet` returns a normal `RunResult` with `status: "error"`, `error.code` set, and every gating decision's `effectiveAction` equal to `onUnavailable`. No caller ever receives an empty decision set.
3. **Liveness alert.** A job raises `alert.raised` with kind `set_silent` when a set that normally produces decisions on a channel produced none, or only errors, for its window (default 15 minutes at production traffic, configurable per set). Rollout pages and set health show it.
4. **Failure classes.** Review resolutions and feedback reports can carry `failureClass: "missing_evidence" | "model_error" | "code_error" | "service"`. Proposals and set health group misses by class.
5. **Latency baseline.** TypeSafe's published 70 to 500 ms end-to-end figure is recorded as the reference in `system-one-api-contract.md`; per-set p50 and p95 are measured, not assumed.

### Amendment 1 (Nick, 2026-09-27: "amend ADR-012 to default to review")

6. **Fail closed by default.** When a spec leaves `onUnavailable` out, it resolves to `review`, not `fallback`. An outage becomes work for a person, never a decision dropped where nobody looks. `fallback` and `escalate_to_llm` stay available when the owner picks them on purpose.
7. **New lint `outage.fallback_silent` (warning).** Raised when `onUnavailable` is `fallback` and the set has gating decisions. An outage runs no `FallbackConfig` (confidence-policy.md), so every gating decision comes back as `fallback` with no value and the app decides alone, with nobody told unless it says so. The warning names those decisions.
8. **Review load during an outage.** Review items created by an outage carry `failureClass: "service"` so the review queue can group and bulk-resolve them per outage window (Phase 3). The `set_silent` alert still fires.

No set has been published, so changing the default changes no live behavior.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Per-set `onUnavailable` (chosen) | Owner picks the safe path per decision type; always a typed instruction | One more spec field and lint |
| Global default only | Simplest | A payment gate and a tagging set need different safe paths |
| Throw to the caller | No contract change | Recreates the "silence means block" failure in every app |

## Consequences

- Spec, `RunResult` handling, the router and the embed kit components change. `@sysone/client` and `@sysone/react` must render an outage as the configured action, never as a blank.
- New lint: `outage.auto_not_allowed` if anything maps `onUnavailable` to `auto`.
- Savings: outage runs book no savings and are excluded from calibration metrics.
- Fixtures: add an outage fixture per provider.

## Rollout

Accept, then amend the frozen contracts (`spec.ts`, `run.ts`, `learning.ts`, `events.ts`) in one PR with tests, regenerate `openapi.json`, and add the liveness job in Phase 3 with the other alerts.
