# Confidence policy, bands, and rollout

System One models report certainty two ways. Choice and Score answers carry `confidence` (0 to 1, derived from how concentrated the probability distribution is). Noul answers carry only `noul`, the probability of yes. SysOne turns both into one of three **bands**, then turns each band into an **action**. Read `https://docs.typesafe.ai/confidence.md` for the source material. Jev is the first model; nothing here depends on it except the starting thresholds.

## Policy shape

```ts
ConfidencePolicy =
  | { type: "noul", gating: boolean, relevantWhen?: Condition,
      noul: { trueAt: number, falseAt: number, reviewMargin: number }, actions: BandActions }
  | { type: "choice", gating: boolean, relevantWhen?: Condition,
      thresholds: Thresholds, perOption?: Record<string, Thresholds>, actions: BandActions }
  | { type: "score", gating: boolean, relevantWhen?: Condition,
      thresholds: Thresholds, actions: BandActions }
  | { type: "composite", gating: boolean,
      levelThresholds: Thresholds, actions: BandActions }   // actions keyed by level

Thresholds  = { high: number, medium: number }   // choice/score: applied to `confidence`
BandActions = { high: ActionRef, medium: ActionRef, low: ActionRef }
ActionRef   = { kind: "auto" | "review" | "fallback" | "escalate_to_llm", handler?: string, config?: ... }
              // kind "auto": config is free-form handler config (unknown)
              // kind "review": no config; a review `config` fails the strict schema as an unknown key
              // kind "fallback": config is a FallbackConfig (spec-schema.md)
              // kind "escalate_to_llm": config is an EscalationConfig
EscalationConfig = {
  model?: string,            // exact model id with a price_books row (lint escalation.model_unpriced);
                             // default: the set's comparator model (spec.savings.comparatorModel, else the org default)
  instructions?: Structured, // a string, JSON object or JSON array, appended after the question's own instructions
  maxOutputTokens?: number,  // default 256
}
```

- `gating: true` means the decision counts toward the run's band.
- `relevantWhen` (a `Condition`, see [spec-schema.md](spec-schema.md)) marks a speculative question that only matters in some cases. When it is false, the decision is irrelevant (see below).
- The policy `type` must match the question type (lint `policy.type_mismatch`). A noul policy carries no `thresholds`; it needs only its `noul` block. A future question type brings its own policy variant with its module.
- `perOption` sets stricter bars for risky options.

### Preset: top choice only

When only the best option matters, take the top choice and don't threshold it. TypeSafe: "If all you care about is choosing the best option, you just need to choose the option with the highest confidence."

```json
{ "type": "choice", "gating": false, "thresholds": { "high": 0, "medium": 0 },
  "actions": { "high": { "kind": "auto" }, "medium": { "kind": "auto" }, "low": { "kind": "auto" } } }
```

The lint `policy.all_gating_thresholded` suggests this preset when every question in a set is gating and thresholded.

## Band algorithm

Each question type module owns its band function ([spec-schema.md](spec-schema.md)). The v1 rules:

**Choice and Score**

```
t = perOption[answer.choice] ?? thresholds   // Score has no perOption
band = confidence >= t.high   ? "high"
     : confidence >= t.medium ? "medium"
     : "low"
```

**Noul** (no confidence field)

```
if noul >= trueAt                         -> high, value true
else if noul <= falseAt                   -> high, value false
else if noul >= trueAt - reviewMargin     -> medium, value true
else if noul <= falseAt + reviewMargin    -> medium, value false
else                                      -> low, value null
```

A Noul near 0.5 means "yes and no are about equally likely". It is not a medium-strength yes.

**Composite:** two separate things.

- **Level** (magnitude): `levelThresholds` applied to the composite's 0 to 1 value. The level picks the action from `actions`.
- **Band** (certainty): the minimum band of its question terms. Check terms count as `high`.

Only the band feeds `runBand`. A confidently non-urgent email has a low level and a high band, so it does not drag the run into review.

**Run band:** the lowest band among relevant decisions with `gating: true`, including composites with a policy. With no relevant gating decision, it is the lowest band among all relevant decisions. With no relevant decision at all, it is `low`.

**Irrelevant decisions:** when `relevantWhen` is false, the decision has `relevant: false` and `effectiveAction: fallback`. It creates no review item, runs no action, does not lower `runBand` or `overallAction`, and is left out of calibration metrics and the savings count. Questions in a skipped spec stage are treated the same way, with value `null`.

## Actions

| Kind | What happens |
|---|---|
| `auto` | The answer is applied. Plugin action handlers run after commit. |
| `review` | A review item of kind `action` is created. Nothing else happens until a human resolves it. |
| `fallback` | Run the configured `FallbackConfig`: a value, another set, or a no-op. |
| `escalate_to_llm` | Core calls a reasoning model through `ports.llm` during the run (see [Escalation](#escalation)). Counts toward "escalations" in the savings ledger. |

Most to least conservative: `review > fallback > escalate_to_llm > auto`. `overallAction` is the most conservative `effectiveAction` among relevant decisions with `gating: true` (composites included). With no relevant gating decision, it is the most conservative among all relevant decisions. With no relevant decision, it is `fallback`.

A review item of kind `action` is created exactly when a decision's `effectiveAction` is `review`. The configured fallback runs only when the policy action itself is `fallback` and the rollout stage lets policy actions through. When the rollout stage forces `fallback`, it means "keep your existing path" and nothing runs.

### Escalation

- Core owns `escalate_to_llm` from Phase 1. It is not a plugin action.
- For each decision whose `effectiveAction` is `escalate_to_llm`, core calls `ports.llm` synchronously in run step 10 ([architecture.md](architecture.md#run-data-flow)), inside the surface latency budget. The call uses the decision's `EscalationConfig`.
- `Decision.value` stays the System One model's answer. The LLM result goes only in `Decision.escalation` (`{ model, value, costUsd, status }`, [savings-model.md](savings-model.md)), and its spend goes in `escalationCostUsd`.
- When `ports.llm` is missing, or the call fails or times out, core sets `escalation.status` to `failed`, `effectiveAction` to `review` and adds the warning `escalation_failed`. The review item is then created like any other `review` decision.

## Effective action by rollout stage (normative)

This table is the only definition. [architecture.md](architecture.md) and [savings-model.md](savings-model.md) link here instead of restating it. It is enforced in `packages/core` only, through `effectiveAction`. No other package reinterprets it.

| Rollout stage | Band | Policy action | `effectiveAction` | Executes? |
|---|---|---|---|---|
| `inactive` | any | any | none: the channel returns `409 set_not_live` | No |
| `shadow` | any | any | `fallback` | No |
| `controlled` | high | any | the policy action | Yes |
| `controlled` | medium or low, decision is gating | any | `review` | Yes (a review item is created) |
| `controlled` | medium or low, decision is not gating | any | `fallback` | No |
| `full` | any | any | the policy action | Yes |
| `paused` | any | any | `fallback` | No |

- "Executes" is `Decision.executed`, which core computes at route time. It is `true` when `effectiveAction` is `review` (the item is created). It is also `true` when `effectiveAction` equals the policy action on a row marked Yes and the action is `auto` (dispatch is enqueued, or no handler is configured), `escalate_to_llm` (the LLM is called) or `fallback` (the configured `FallbackConfig` runs). It is `false` for a forced `fallback`, for `auto` with a side-effect handler on staging without `dispatchActionsOnStaging`, and on the challenger arm. It means dispatched or created, never that a handler succeeded.
- Irrelevant decisions are `fallback` in every stage and are excluded as described above.
- A failed escalation changes `effectiveAction` from `escalate_to_llm` to `review` ([Escalation](#escalation)).
- `slug@draft` runs behave as `shadow`.
- **Outage:** when System One is unavailable after retries, the outage rows in [Outage behaviour](#outage-behaviour-adr-012-accepted) apply instead (ADR-012).
- **Staging channel:** effective actions are computed the same way, but side-effect handlers do not dispatch unless the set sets `dispatchActionsOnStaging`. Staging books cost, not savings.

## Rollout stages (per set, per channel)

| Rollout stage | Behavior |
|---|---|
| `inactive` | Not live on this channel. Runs return `409 set_not_live`. The draft still runs as `slug@draft` from the console, `sk_test_` tokens and agent tokens with `sets:write`. |
| `shadow` | Runs and logs everything. Every `effectiveAction` is `fallback`, so the caller keeps its existing path. Use it to measure before trusting. The labeling policy picks audit items. |
| `controlled` | High-band decisions keep their policy action. Medium and low go to review when gating and to fallback when not. |
| `full` | Policy actions execute as written. |
| `paused` | Kill switch. Every `effectiveAction` is `fallback`. Set only by humans. |

- The rollout stage is stored on `release_pointers.rollout_stage`, one per `(set, channel)`. It is not in the spec.
- It changes only through the `rollout.change` operation ([management-api.md](management-api.md)), which evaluates the gates below and writes a `release_events` row.
- Gates apply to the `production` channel. `staging` can be set freely.
- Moves toward safety (pause, back to `shadow`, rollback) are never gated. Moving toward `full` or out of `paused` is a high-risk operation, so an agent needs a human approval ([security.md](security.md)).

The console shows the rollout stage per channel as a status chip with a timeline and gate checklist, and writes every change to the audit log.

### Default gates (production channel, editable per set, stricter for high-risk sets)

| Move | Gate |
|---|---|
| `inactive` to `shadow` | A published version on the channel. A moving model is allowed. |
| `shadow` to `controlled` | A pinned versioned model; at least 200 shadow runs; labeled high-band decisions at least `QualityTarget.minLabeledHigh`; the 95% Wilson lower bound of high-band precision at or above `highPrecision` |
| `controlled` to `full` | Coverage at or above `minCoverage` and the precision lower bound at target over a trailing 7 days; admin role; agents need an approval |

Below the label minimum a gate returns `insufficient_data`, never pass. A failed gate returns `409 gate_not_met` with a `gates` list of `{ id, required, actual, met }` ([api.md](api.md)).

### Auto-demote

The hourly gate evaluator (Phase 3) moves `full` to `controlled` and `controlled` to `shadow`, with an alert, when:

- the precision lower bound falls below target over a trailing 7 days,
- the band mix drifts: PSI above 0.2 against the baseline (the first 14 days after the version's last promotion), or
- the resolved model changes.

`paused` is set only by humans. Auto-demote runs as a system actor through `rollout.change` and emits `rollout.auto_demoted` ([events.md](events.md)).

A set with no truth source (no app feedback and no audit sample) shows a "no truth source" warning, and its precision-based auto-demote is marked inactive rather than silently never firing.

### New versions of live sets

Publishing a new version of a set whose production pointer is `controlled` or `full` defaults to champion and challenger: the new version runs as an experiment on a sample of traffic and is promoted when it matches or beats the champion. An admin can skip this with a written reason, which is audited; an agent needs an approval. Rules are in [effectiveness-loop.md](effectiveness-loop.md).

## Default thresholds by risk tier

Starting points measured on jev-1.13; re-tune per model. Tune on the org's own labeled data.

| Tier | Example | high | medium | Noul trueAt / falseAt / margin |
|---|---|---|---|---|
| Low risk | Tagging, sorting, UI hints | 0.60 | 0.30 | 0.80 / 0.20 / 0.10 |
| Standard | Routing tickets, ranking, triage | 0.75 | 0.45 | 0.85 / 0.15 / 0.10 |
| High risk | Money movement, auto-merge, account changes | 0.90 | 0.70 | 0.95 / 0.05 / 0.05 |

Guidance from the TypeSafe docs:

- Thresholds scale with the consequence of the action, not the question. The same set can gate `check_balance` at 0.5 and `approve_transfer` at 0.9 with `perOption`.
- If all you need is the best option, take the top choice. Don't threshold everything.
- Low confidence on a harmless preference choice can be fine. Several acceptable options spread probability.
- Confidence summarizes the distribution. It is not workflow correctness or permission to act.
- Don't carry a threshold tuned on a Noul over to a Choice.

## Quality targets

Each goal stores one `QualityTarget` in `goals.quality_target`. This is the only place precision targets are defined.

```ts
QualityTarget = { tier: "low" | "standard" | "high", highPrecision: number, mediumPrecision: number,
                  minCoverage: number, minLabeledHigh: number }
```

| Tier | highPrecision | mediumPrecision | minCoverage | minLabeledHigh |
|---|---|---|---|---|
| Low risk | 0.90 | 0.75 | 0.60 | 50 |
| Standard | 0.95 | 0.85 | 0.50 | 100 |
| High risk | 0.98 | 0.95 | 0.30 | 250 |

Gates compare the 95% Wilson lower bound, not the point estimate. The high-risk minimum is 250 labels because a perfect record only clears 0.98 at about 190.

## Calibration targets (evals)

- Targets come from the goal's `QualityTarget` above.
- Coverage: the share of relevant gating decisions whose policy `action` is `auto` (not `effectiveAction`), so it can be measured in `shadow` (section 2 of [effectiveness-loop.md](effectiveness-loop.md#2-definitions)). Report it next to precision; raising a threshold trades coverage for precision.
- Expected calibration error (ECE) and a reliability table per question.
- Evals are required when publishing to a production pointer in `controlled` or `full`. The regression gate scores the champion and the candidate on the same dataset snapshot ([testing.md](testing.md)).

## Labeling and truth

Truth comes from three sources: app feedback, a random audit sample per band in every rollout stage, and reviewers. Definitions are in [effectiveness-loop.md](effectiveness-loop.md#2-definitions) section 2.

- **Precision:** the weighted share of labeled decisions in a band that match, over every counted row: app feedback, audit samples (weighted by `1 / sample_rate`), and reviewer resolutions. Its 95 percent Wilson lower bound drives gates and auto-demote.
- **Agreement:** the same measure restricted to human reviewer rows (`audit` and `reviewer`), a subset of precision. Shown in the Human agreement report. Gates do not use it.

Targeted picks (near a threshold, challenger disagreements) feed datasets and the Studio, never gate metrics. Agent labels count only after a human confirms them. The labeling policy and the threshold suggester are in [effectiveness-loop.md](effectiveness-loop.md).

## Question design rules that affect confidence

- One narrow judgment per question. Split fuzzy asks into separate checks (see [definition-studio.md](definition-studio.md)).
- Include a "none of these" option when nothing may fit. Without it, the model is forced to spread probability across wrong answers.
- Score levels must describe concrete situations and stand on their own.
- Give each question the state it needs. Missing evidence shows up as low confidence, which is the model telling you the truth.
- Ask independent and speculative questions in one stage and use `relevantWhen`.
- Do not copy a noul threshold to a choice.
- Word noul true criteria positively.
- If only the best option matters, use the top-choice preset.

## Outage behaviour (ADR-012, accepted)

A System One outage is a separate case from a low band. Nick accepted ADR-012 on 2026-09-27. Core enforces it in `outageEffectiveAction` and `routeOutage`, next to the normative table.

- **Outage rule per set.** `QuestionSetSpec.onUnavailable` is `fallback` (default), `review` or `escalate_to_llm`. It never resolves to `auto`: the schema refuses `auto` with the rule id `outage.auto_not_allowed`, and the lint of the same id catches a spec built in code.
- **What counts as an outage.** The run fails with `system_one_unavailable` or `system_one_overloaded` after SDK retries. That includes a spent latency budget and a transport error that is not a `TransportError`. Other failures (`system_one_auth`, `system_one_rate_limited`, `rate_limited`, quota) keep the plain error envelope with no decisions.
- **Always an instruction.** `runQuestionSet` returns a normal `RunResult` with `status: "error"`, `error.code` set, the warning `system_one_outage`, and one decision per question and composite. Each is band `low`, `value: null`, `relevant: true` (relevance is not evaluated, since the answers it reads are missing), and `action` equal to `effectiveAction`. Questions in a spec stage skipped before the outage stay skipped decisions. Routes do not run, so `route` is null. Raw answers from stages that finished before the outage stay in `answers`.
- **Savings and metrics.** Outage runs book no savings (`savingsSuppressed: "outage"`, `savingsUsd: 0`), record whatever System One calls did finish, and are left out of calibration, precision, coverage and label sampling (`isOutageRun`).
- **escalate_to_llm on an outage** goes through `ports.llm` like a normal escalation. It reuses the question's own `escalate_to_llm` config when a band has one (low band first), else the set's comparator. If the LLM fails, or no LLM port is wired, the decision becomes `review`. A composite has no answer type to escalate, so the rule gives it `review`.

Outage rows of the effective-action table (the normal table above does not apply, since there is no band):

| Rollout stage | Decision | `effectiveAction` | Executes? |
|---|---|---|---|
| `inactive` | any | none: the channel returns `409 set_not_live` before any call | No |
| `shadow`, `paused`, `slug@draft` | any | `fallback` | No |
| `controlled` or `full` | gating | `onUnavailable` (`review` for a composite when the rule is `escalate_to_llm`) | Yes for `review` (item created) and `escalate_to_llm` (LLM called); No for `fallback` |
| `controlled` or `full` | not gating | `fallback` | No |
| any | irrelevant (skipped stage) | `fallback` | No |

An outage `fallback` runs no `FallbackConfig`: there is no band, so no policy action applies, and the caller keeps its existing path. The challenger arm executes nothing, as in the normal table.

**Liveness alert.** A job raises `alert.raised` with kind `set_silent` when a set that normally produces decisions on a channel has produced none, or only errors, for its window (default 15 minutes at production traffic, configurable per set). Rollout pages and set health show it. Silence is an incident, not a safe state. The job ships in Phase 3 with the other alerts.
