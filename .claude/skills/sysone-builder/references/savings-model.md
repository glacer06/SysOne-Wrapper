# Savings model and standard outputs

SysOne is sold on ROI. Every run reports what it cost and what it saved, and every org can see the totals without asking anyone. This file defines the math, the envelope, and the reports. Owner: Billing / Savings, with Quality / Learning for the quality-adjusted value.

## Standard run envelope (`RunResult`)

Every run, from every surface (console, API, embed, extension, CLI, MCP, eval), returns this shape. No endpoint invents its own. Shared names (`QuestionId`, `DecisionId`, `Band`) are defined in [spec-schema.md](spec-schema.md). Each field maps to a `runs` column; the mapping table is in [data-model.md](data-model.md).

```ts
RunResult = {
  runId: string,
  setId: string,
  version: number,
  versionId: string,
  interfaceMajor: number,
  interfaceHash: string,
  channel: "production" | "staging" | "pinned" | "draft",
  rollout: "inactive" | "shadow" | "controlled" | "full" | "paused",
                                                   // resolved from the channel pointer, never from the spec;
                                                   // "shadow" for slug@draft runs, and the caller channel's
                                                   // stage for pinned runs (slug@7)
  experiment?: { id: string, arm: "champion" | "challenger" },
  status: "ok" | "error" | "rate_limited" | "quota_exceeded",
  error?: { code: ErrorCode, message: string },    // present exactly when status is not "ok"; code is an
                                                   // api.md code, stored as runs.error_code
  modelRequested: string,
  modelResolved: string | null,                    // the first call's response `model`; null only when no call
                                                   // was made (every spec stage skipped). TypeSafe sends a
                                                   // versioned id, OpenRouter its own id (ADR-011)
  typesafeRequestId: string | null,                // the first call's x-typesafe-request-id header
  stages: Array<{                                  // one entry per spec stage, in spec order
    id: string,
    skipped: boolean,                              // its `when` was false on input and checks
    calls: Array<{                                 // one per System One request; preflight batch splits add calls
      modelResolved: string,                       // the response `model`; prices use it, per call
      provider?: "typesafe" | "openrouter",        // who served the call; absent means typesafe (ADR-011)
      providerCostUsd?: number,                    // the provider's usage.cost in whole micro-USD, when sent
      typesafeRequestId: string | null,
      inputTokens: number,
      outputTokens: number,
      latencyMs: number,
    }>,
  }>,
  checks: Record<string, boolean>,                 // spec.checks results by check id, evaluated before any call
  answers: Record<QuestionId, SystemOneAnswer>,    // raw typed answers. Runs always store probabilities;
                                                   // options.includeProbabilities only shapes the response.
                                                   // A question in a skipped spec stage has no entry
  decisions: Record<DecisionId, Decision>,
  runBand: Band,
  overallAction: Action,                           // the most conservative effectiveAction among relevant decisions,
                                                   // order review > fallback > escalate_to_llm > auto (confidence-policy.md)
  route: string | null,
  cost: RunCost,
  reviewItemIds?: string[],                        // review items of kind "action" this run created
  warnings: string[],                              // for example "unknown_answer_type", "model_unpriced",
                                                   // "model_resolved_mixed"
}

Decision = {
  kind: "question" | "composite",
  value: string | number | boolean | null,         // choice: option key; score: score; noul: true or false,
                                                   // null in the noul low band; composite: its 0..1 value;
                                                   // null for a skipped question or a composite with no term left
  band: Band,                                      // certainty; for a composite, the minimum band of its question terms
  level?: "high" | "medium" | "low",               // composites only: magnitude from levelThresholds; picks the action
  relevant: boolean,                               // false when relevantWhen failed, the spec stage was skipped,
                                                   // or a composite has no term left
  action: Action,                                  // what the policy says
  effectiveAction: Action,                         // what the rollout stage allows; callers act on this
  executed: boolean,                               // whether it ran: handlers, the LLM call, the review item, the fallback
  escalation?: { model: string, value: Value, costUsd: number, status: "ok" | "failed", error?: string },
                                                   // the escalate_to_llm result; value above keeps the System One answer
  fallbackRunId?: string,                          // set only for a `set` fallback that wrote a linked run row
                                                   // (spec-schema.md section 7): that run, or the failed run when
                                                   // it failed after its row was written. value never changes;
                                                   // read the linked result with GET /api/v1/runs/{fallbackRunId}
}

RunCost = {
  systemOneInputTokens: number,
  systemOneOutputTokens: number,
  systemOneCostUsd: number | null,                 // sum over all calls: provider-reported cost when present,
                                                   // else the price book; null when a call has neither (BYO
                                                   // key mode). *Usd = micro / 1e6 (Money math)
  counterfactualInputTokens: number,
  counterfactualOutputTokens: number,
  counterfactualLlmCostUsd: number,
  comparatorModel: string,
  counterfactualMode: "one_call" | "per_question",
  savingsUsd: number,                              // 0 whenever savingsSuppressed is set
  savingsKind: SavingsKind,                        // exactly one per set, from spec.savings.kind (default "decision")
  savingsSuppressed: "shadow" | "eval" | "staging" | "experiment" | null,
  llmCallsAvoided: number,
  contextTokensPruned?: number,
  escalationCostUsd: number,                       // actual LLM spend from escalate_to_llm
  llmCallsMade: number,
  estimated: true,
  latencyMs: number,
}

Action = "auto" | "review" | "fallback" | "escalate_to_llm"
SavingsKind = "decision" | "escalation_avoided" | "context_pruned"
```

- **Effective action.** `effectiveAction` is how the rollout stage shows up on the wire. The rules are the normative table in [confidence-policy.md](confidence-policy.md#effective-action-by-rollout-stage-normative); this file does not restate them. Callers branch on `effectiveAction`, never on `action`.
- **Decisions.** Questions and composites share one map keyed by `DecisionId`. There is no separate composites map. Irrelevant decisions carry `relevant: false` and `effectiveAction: fallback`, and they do not lower `runBand` or `overallAction`. Every decision has a `band` and an `action`, including those that were never answered:
  - **Skipped question** (its spec stage did not run): no `answers` entry; decision `{ kind: "question", value: null, band: "low", relevant: false, action: "fallback", effectiveAction: "fallback", executed: false }`.
  - **Answered but irrelevant** (`relevantWhen` false): `value`, `band` and `action` are computed normally; `relevant: false`, `effectiveAction: "fallback"` and `executed: false`.
  - **Composite with no term left:** `{ kind: "composite", value: null, band: "low", relevant: false, action: "fallback", effectiveAction: "fallback", executed: false }`, with `level` omitted.
- **Several calls per run.** Each spec stage that runs makes one System One call, and a preflight batch split adds one call per batch. `stages[].calls` records every call; `runs.stages` stores it. The top-level `modelResolved` and `typesafeRequestId` come from the first call. When the calls' `modelResolved` differ (an alias moved mid-run), the run carries warning `model_resolved_mixed`. `cost.systemOneInputTokens` and `cost.systemOneOutputTokens` are the sums over all calls.
- **Checks.** `checks` holds each check's result, so policy replay can re-evaluate `relevantWhen` and routes that read checks after `state_retention_days` purges the state; answers are kept for `answers_retention_days`. Conditions with `input` leaves cannot be re-evaluated after the purge ([effectiveness-loop.md](effectiveness-loop.md)).
- **Money on the wire.** USD fields are numbers derived from the integer micro-USD columns. Never do money math on them; use the stored integers ([Money math](#money-math)).
- **Failed runs.** A failed call returns the error envelope with its `runId` ([api.md](api.md)). `GET /api/v1/runs/{id}` for that run returns this envelope with the failing `status` and `error: { code, message }`, where `code` is the code the error envelope carried. An ok run has no `error`.
- **Typed clients.** Generated clients narrow `decisions[q].value` to the question's type (a union of option keys, a number, or `boolean | null`) and `route` to the set's route outputs ([deploy-and-codegen.md](deploy-and-codegen.md)).

## Price book

Prices are data, not code. They live in `price_books` ([data-model.md](data-model.md)), keyed by exact model id.

- System One rows use versioned registry ids, such as `jev-1.13.0`. Alias rows are rejected, because they would misprice runs after the alias moves.
- **Provider-reported cost wins.** When a call's response carries `usage.cost` (OpenRouter does, TypeSafe direct does not today), that amount, rounded to whole micro-USD (`reportedCostMicroUsd` in core), is the call's actual cost and is stored as `providerCostUsd`. The price book is the fallback for calls without it (ADR-011).
- Runs are priced by `model_resolved`, one call at a time. An OpenRouter `model_resolved` such as `typesafe/jev-1.13-20260917` is mapped to its registry id through the route rows (`registryIdForResolved`) before the lookup, and a row for the call's provider wins over a provider-independent row: each call in `stages[].calls` uses the row for its own `modelResolved` ([Money math](#money-math)). Unpriced models are handled as in [system-one-models.md](system-one-models.md#8-pricing): BYO runs succeed with a null cost and warning `model_unpriced`, and platform-key runs are refused.
- Comparator rows use the provider's exact model id.
- Platform defaults have `org_id` null. An org row for the same model overrides the default for that org.

Seed rows:

| Model id | Display name | Input $/Mtok | Output $/Mtok | Source |
|---|---|---|---|---|
| `jev-1.13.0` | Jev 1.13 | 0.042 | 0 (free) | docs.typesafe.ai/models.md |
| `claude-haiku-4-5` | Haiku 4.5 | 1.00 | 5.00 | Every newsletter, 2026-09-23 |
| `claude-fable-5-1` | Fable 5.1 | 10.00 | 50.00 | Every newsletter, 2026-09-23 |
| Google's exact id, confirm before seeding | Gemini 3.7 Flash | 0.75 | 3.75 | Every newsletter, 2026-09-23 |

The table shows USD per million tokens for reading. `price_books` stores each price times 1e6 as integer micro-USD per million tokens (`input_per_mtok_micro_usd`, `output_per_mtok_micro_usd`): `jev-1.13.0` input is 42,000, and Haiku 4.5 is 1,000,000 in and 5,000,000 out.

The platform admin can update defaults. Each org picks a default comparator (Haiku 4.5 unless changed), and each set can override it with `spec.savings.comparatorModel`. The example spec's `claude-haiku-4-5` resolves to the Haiku row. Confirm comparator prices against the vendors' pricing pages before the first customer report.

## Money math

`PriceBook` returns integer micro-USD per million tokens (`inputPerMtokMicroUsd`, `outputPerMtokMicroUsd`; [architecture.md](architecture.md)). Below, `price.inPerMtokMicro` and `price.outPerMtokMicro` name those two values. Core does all money math in integer micro-USD:

```
round_half_up(x)       = floor(x + 0.5)
                         // in integers: floor((a + 500000) / 1000000) for a / 1e6, with floor division

call_cost_micro        = reported_cost_micro, when the call's response carried usage.cost
                         // round_half_up(usage.cost * 1e6), the provider's actual charge
                       else
                         round_half_up(inputTokens  * price.inPerMtokMicro  / 1e6)
                       + round_half_up(outputTokens * price.outPerMtokMicro / 1e6)
                         // per call, with the price row of that call's modelResolved and provider

system_one_cost_micro  = sum of call_cost_micro over every System One call in stages[].calls
escalation_cost_micro  = sum of call_cost_micro over every escalate_to_llm call, priced by the LLM model that answered

counterfactual_micro   = round_half_up((cf_input_tokens  * comparator.inPerMtokMicro
                                     + cf_output_tokens * comparator.outPerMtokMicro) / 1e6)

savings_micro          = counterfactual_micro - system_one_cost_micro - escalation_cost_micro   // decision kind
```

- Multiply before dividing, so each term is rounded once. At current prices and model limits the products stay far below 2^53, so JavaScript numbers hold them exactly.
- `system_one_cost_micro` is null when any call has neither a provider-reported cost nor a price row (BYO key mode, warning `model_unpriced`).
- Escalations through OpenRouter chat models, including `typesafe/jev-router` (ADR-011, proposed), are LLM spend: they add to `escalation_cost_micro`, priced by the provider's reported cost when present, else the price book row of the model that answered. When jev-router picks a cheaper LLM than the comparator, that difference is an LLM routing saving. It is reported next to `escalationCostUsd` as LLM spend, never as System One spend or System One savings, because no System One call made it.
- `RunCost` `*Usd` fields are `micro / 1e6`, produced only when the envelope is built. Rollups and reports sum the stored integers, never the USD fields.
- Worked example: one call of 318 input tokens and 0 output tokens on `jev-1.13.0` costs `round_half_up(318 * 42000 / 1e6) = round_half_up(13.356) = 13` micro-USD. Two counted questions with `cf_input_tokens` 318 and `cf_output_tokens` 120 against Haiku 4.5 give `counterfactual_micro = round_half_up((318 * 1000000 + 120 * 5000000) / 1e6) = 918`, so `savings_micro = 918 - 13 - 0 = 905` and `savingsUsd` is 0.000905. Rounding to whole micro-USD changes the cost of a run this small by up to about 4 percent, which is why the rule is fixed here.

## The three kinds of savings

Each set has exactly one savings kind, from `spec.savings.kind` (default `decision`). Irrelevant decisions are never counted.

### 1. Decision counterfactual (default)

What the same judgments would cost as LLM calls. Only questions whose `effectiveAction` is `auto` count toward savings. Review and fallback questions count cost, not savings, because nothing was replaced yet. Composites add nothing to `n`; their question terms count on their own.

```
counted          = relevant questions whose effectiveAction is "auto"
n                = count(counted)
state_tokens(s)  = preflight estimate of the state sent in spec stage s
q_tokens(q)      = preflight estimate of question q

// counterfactualMode "one_call" (default, conservative): one LLM call answers every counted question
cf_input_tokens  = max over stages s of state_tokens(s) + sum over q in counted of q_tokens(q)

// counterfactualMode "per_question": one LLM call per counted question, with its stage's state each time
cf_input_tokens  = sum over q in counted of (state_tokens(stage(q)) + q_tokens(q))

cf_output_tokens = n * est_output_tokens                  // spec.savings.estOutputTokensPerQuestion, default 60

counterfactual_micro = round_half_up((cf_input_tokens  * comparator.inPerMtokMicro
                                    + cf_output_tokens * comparator.outPerMtokMicro) / 1e6)
savings_micro        = counterfactual_micro - system_one_cost_micro - escalation_cost_micro
```

- When `n` is 0, `counterfactual_micro` is 0 and `savings_micro` equals minus the run's cost.
- `cf_input_tokens` and `cf_output_tokens` are stored on the run. `per_question` sums per-question stage state plus question tokens, so question text is counted once and later-stage state is not counted again.
- `system_one_cost_micro` is the whole run's System One cost over every call ([Money math](#money-math)), including questions that did not count.
- `escalation_cost_micro` is the actual spend on any `escalate_to_llm` calls in the run. Savings can go negative, and the ledger shows it.

The default is `one_call`, the conservative case. Orgs can switch to `per_question` if that is how they ran it before. Every report states which `counterfactualMode` was used.

### 2. Escalation avoided (cascades)

A set with `escalate_to_llm` on its low band only calls the LLM when the System One model isn't sure. Every run that settled at the System One layer avoided one LLM call.

```
llm_calls_avoided = 1 if no question escalated else 0
savings_micro     = llm_calls_avoided * avg_escalation_cost_micro - system_one_cost_micro
```

There is no `escalation_cost_micro` term here. The baseline is "always call the LLM", and a run that escalated already scores `llm_calls_avoided = 0`, so subtracting its escalation cost again would double count it.

`avg_escalation_cost_micro` is the mean `call_cost_micro` of the org's actual escalations, rounded half up, when available. Otherwise it is estimated with the comparator in the same way as `counterfactual_micro`.

### 3. Context pruned

A context pruner set (template from The Code's compaction example) scores items like tool calls or retrieved passages as keep or drop. The downstream LLM gets fewer input tokens.

```
context_tokens_pruned = tokens_before - tokens_after
savings_micro         = round_half_up(context_tokens_pruned * downstream_model.inPerMtokMicro / 1e6)
                      - system_one_cost_micro - escalation_cost_micro
```

The caller reports `tokensBefore` and `tokensAfter` in `options.metadata` ([spec-schema.md](spec-schema.md)), or the set computes them from state when items carry token counts.

## Honesty rules

- Savings are estimates. Every report labels them as estimates and shows the assumptions: the comparator, output tokens per question and the `counterfactualMode`.
- Savings assume that auto decisions are correct. Reports say so, and the quality-adjusted value below removes that assumption. Savings on a set with fewer labeled high-band decisions than its `QualityTarget.minLabeledHigh` are labeled "unverified".
- Never show negative savings as zero. If the System One model cost more on some runs, the ledger shows it.
- Shadow, eval, staging and experiment runs report `savingsUsd = 0` with `savingsSuppressed` set to the reason. They still record their cost and their counterfactual, so reports can show would-be savings separately. In an experiment, only the challenger arm is suppressed; the champion's runs book savings as usual.

## Quality-adjusted value

Gross savings reward looser thresholds, because more decisions go `auto` whether or not they are right. The quality-adjusted value subtracts the expected cost of wrong auto decisions and the cost of human review. It is computed in rollups and set health, never per run.

```
net_micro = savings_on_auto_micro
          - round_half_up(auto_count * (1 - precision_lower) * error_cost_micro)
          - review_items * review_cost_micro
```

- `savings_on_auto_micro` is the gross savings for the period, summed from the stored integers. `auto_count` is the number of relevant decisions whose `effectiveAction` was `auto`.
- `precision_lower` is the 95 percent Wilson lower bound of auto-decision precision over the trailing 7 days, the same window the gates use ([effectiveness-loop.md](effectiveness-loop.md)). With few labels the bound is wide and `net` drops, so labeling more raises the reported value only when the decisions are right.
- `review_items` counts review items of kind `action`. Label items are left out, so measuring a set never lowers its value.
- `errorCostUsd` and `reviewCostUsd` come from `question_sets.value_settings`, and `error_cost_micro` and `review_cost_micro` are those values times 1e6, rounded half up. `reviewCostUsd` defaults to the org's `reviewerHourlyRateUsd` setting times the median minutes per item in the review queue. `errorCostUsd` has no default; until an editor sets it, the error term is 0 and reports say so.
- The threshold suggester and experiment decisions show net value next to precision and coverage. The precision target stays a hard floor: a threshold or challenger whose precision lower bound misses the target is never suggested or promoted, whatever its net value.

## Rollups (`usage_daily`)

Keyed by `org_id, day, project_id, set_id, app_id, version_id, model_resolved, system_one_provider, key_mode, source, savings_kind`.

Columns:

- Volume: `runs`, `auto_decisions`, `band_high`, `band_medium`, `band_low`.
- System One: `system_one_input_tokens`, `system_one_output_tokens`, `system_one_cost_micro_usd`.
- Counterfactual and savings: `cf_input_tokens`, `cf_output_tokens`, `counterfactual_micro_usd`, `savings_micro_usd`, `suppressed_savings_micro_usd` (would-be savings of suppressed runs), `llm_calls_avoided`, `context_tokens_pruned`.
- LLM spend: `escalation_cost_micro_usd`, `llm_calls_made`, `experiment_cost_micro_usd` (challenger runs).
- Review: `review_created` (kind `action`), `label_created` (kind `label`), `review_resolved`, `review_cost_micro_usd`, `error_cost_est_micro_usd`.
- Latency: `p50_latency_ms`, `p95_latency_ms`.

Money is stored in micro-USD integers. Never floats.

Runs store the raw token totals behind every estimate (`cf_input_tokens`, `cf_output_tokens`). Dashboards can then show savings against several comparators side by side and offer a "revalue at current prices" toggle without rewriting history.

Per-question metrics (band mix, answer distribution, labeled and correct counts) are in the `question_daily` rollup ([data-model.md](data-model.md)), which set health reads.

## Standard admin reports

Each report is available in the org console, as CSV, as a PDF monthly summary, and headless through `GET /api/v1/reports/{name}` ([management-api.md](management-api.md)). The platform admin sees the same reports across all orgs.

| Report | Name | What it answers |
|---|---|---|
| Usage and cost | `usage-and-cost` | Runs, tokens, and System One spend by project, set, app, model, provider and day, with provider-reported cost and price book cost apart |
| Savings and ROI | `savings-and-roi` | Gross and quality-adjusted savings side by side, by kind, versus the subscription price; ROI multiple; would-be savings from suppressed runs shown apart; "unverified" where labels are short |
| Effectiveness | `effectiveness` | `SetHealth` for every set, worst first ([effectiveness-loop.md](effectiveness-loop.md)) |
| Band distribution | `band-distribution` | Share of high, medium, low per set over time; drift in the mix |
| Review queue | `review-queue` | Items created, resolved, median time to resolve, SLA breaches; action and label items apart |
| Human agreement | `human-agreement` | Precision (any truth source) and agreement (the reviewer-only subset) per set and band, with 95 percent lower bounds; definitions in [effectiveness-loop.md](effectiveness-loop.md) |
| Model upgrades | `model-upgrades` | Pinned sets behind the latest stable model in their family, with eval deltas; alias sets whose resolved model changed |
| Rate headroom | `rate-headroom` | Peak RPM and tokens/sec per org against its limit and the per-model global budget |

**Portfolio view** (`/me/portfolio`): a user who is owner or admin in several orgs (Nick across SGR, Personal, Dallas) sees their savings and usage side by side. It loops over each org with that org's own tenant context. It never bypasses RLS.

**Alerts** raised from these reports:

| Alert | Event ([events.md](events.md)) |
|---|---|
| Alias moved | `model.alias_moved` |
| Band mix drift: PSI above 0.2 against the baseline (the first 14 days after the version's last promotion) | `alert.raised`, kind `band_drift` |
| Below target: a set's precision lower bound under its `QualityTarget` | `alert.raised`, kind `precision_below_target` |
| No truth source: no app feedback and no audit sample | `alert.raised`, kind `no_truth_source` |
| Review SLA breach | `review.sla_breached` |
| Rate headroom above 80% | `alert.raised`, kind `rate_headroom` |
| Quota near limit | `alert.raised`, kind `quota` |
| Org key invalid | `key.invalid` |

Alerts show in the console and go out by email. Alerts are also events: available through the event feed from Phase 3 ([events.md](events.md)) and through org webhooks from Phase 5.

The `SavingsCard` component in `@sysone/react` renders the org or set savings summary for embedding in customer apps.
