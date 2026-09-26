# ADR-010: Rollout on release pointers and the effectiveness loop

- **Status:** accepted (decided by Nick, 2026-09-26)
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Contract impact:** `QuestionSetSpec` loses `rollout`; `release_pointers` gains `rollout_stage` and `active_experiment_id`; rollout stage `draft` is renamed `inactive`; `RunRequest`, `FeedbackReport`, `QualityTarget`, `SetHealth` and `ThresholdProposal`; decisions keyed by `DecisionId` with `kind: "question" | "composite"`; new tables `run_feedback`, `experiments`, `proposals`, `dataset_snapshots`, `question_daily`, `studio_sessions` and `studio_examples`.

## Context

Nick asked for SysOne to help apps "use Jev effectively and improve its effectiveness." The plan before this ADR could not measure or improve a live set:

- **Rollout lived in two places.** It sat inside the immutable spec and also on the mutable `question_sets` row. If core read the spec, auto-demote, the kill switch and every stage change would need a new published version. If core read the row, the spec field was dead, and an agent editing a spec file could set `"rollout": "full"` expecting it to skip the gates. Staging and production also shared one stage, so a champion in `full` and a challenger in `shadow` could not coexist.
- **"Draft" meant four things:** a version status, the mutable draft, `slug@draft`, and a rollout stage.
- **Truth entered only through review items.** Review items were created for `review` actions plus an unspecified shadow sample. In `full`, high-band `auto` decisions were never labeled, although auto-demote and the agreement report both depended on high-band accuracy. Apps often learn the true answer later and had no way to send it back.
- **Targets contradicted each other.** confidence-policy.md gave 95 and 98 percent in one place and 0.92 and 0.97 in another. A gate on 50 labels cannot establish either: 50 correct out of 50 gives a 95 percent Wilson lower bound of about 0.93. The regression gate checked only high-band precision, so a version that sent most traffic to review still passed, and it compared evals run on different data.
- **effectiveAction rules disagreed** across confidence-policy.md, architecture.md and savings-model.md. The "most conservative" order was never defined, and composite bands mixed magnitude with confidence.
- **Nothing tuned thresholds** from labeled data, and nothing tested a new System One model against a pinned set.

## Decision

### 1. Rollout lives on the release pointer

- `release_pointers.rollout_stage` holds the stage per `(set, channel)`. Stages: `inactive`, `shadow`, `controlled`, `full`, `paused`. The `question_sets.rollout` column and the spec field are removed.
- The rollout stage `draft` is renamed `inactive`. On an inactive channel a run returns `409 set_not_live`. `slug@draft` still runs the mutable draft version for console sessions, `sk_test_` tokens and agent tokens with `sets:write`, and behaves as `shadow`. The version status `draft` and the mutable draft keep the word.
- The spec zod schema is strict. A stray `rollout` key fails validation with a message that names `rollout.change`.
- Stage changes go only through the `rollout.change` operation (ADR-007), which evaluates the gates and writes a `release_events` row. Gates apply to the production channel; staging can be set freely.
- Auto-demote calls the same operation as a system actor. It moves `full` to `controlled` and `controlled` to `shadow`, and emits `rollout.auto_demoted`. Only humans set `paused`.
- The pointer resolver reads the version, the rollout stage and the active experiment together under one cache epoch, so a pause takes effect within the pointer staleness bound. `RunResult.rollout` comes from the channel pointer.
- Staging never dispatches side-effect action handlers unless the set opts in with `dispatchActionsOnStaging`. Staging books cost but not savings.

### 2. One normative effective-action table

confidence-policy.md holds the single stage x band x policy action table. architecture.md and savings-model.md link to it instead of restating it. In short:

| Stage | Effective action |
|---|---|
| `inactive` | The channel returns `409 set_not_live`. |
| `shadow` | Every decision is `fallback`; nothing executes. |
| `controlled` | High band keeps the policy action. Medium and low become `review` when gating, `fallback` when not. |
| `full` | The policy action as configured. |
| `paused` | Every decision is `fallback`; nothing executes. |

- Conservative order, most to least: `review > fallback > escalate_to_llm > auto`. `overallAction` is the most conservative effective action among relevant decisions.
- Composites become decisions with `kind: "composite"`. A composite has a magnitude `level` (from `levelThresholds` on its 0 to 1 value), which picks the action, and a certainty `band`, the minimum band of its terms. Only `band` feeds `runBand`.
- Decisions are keyed by `DecisionId`. `review_items.question_id` becomes `decision_id`, and action idempotency uses `runId:decisionId`.
- Policies gain `relevantWhen`. An irrelevant decision is `fallback`, creates no review item, runs no action, does not lower `runBand`, and is left out of calibration metrics and savings.

### 3. Truth sources

All truth lands in `run_feedback`, from three sources:

- **App feedback.** `POST /api/v1/feedback` takes 1 to 1,000 items, each matched by `runId` or `externalRef` (a new `RunRequest.options.externalRef`), idempotent per item. Scope `feedback:write`, never on a `pk_` token.

  ```ts
  FeedbackReport = {
    runId?: string, externalRef?: string,          // one of the two
    target: { decisionId: DecisionId } | { route: true },  // one decision, or the run's route
    observed: unknown,
    observedAt: string,
    idempotencyKey: string,
  }
  ```

  The body has no `source`. The server derives `run_feedback.source` from the caller (`app` for an `sk_` token, `agent` for an agent token), and the strict schema rejects a body that sends `source` at all with `400 invalid_request`.

- **Audit sample.** A random sample per band in every rollout stage, including `full`, creates label items (`review_items.kind = "label"` with its `sample_rate`). Label items never block the caller or change `effectiveAction`.
- **Reviewer resolutions.** Resolving a review item also writes a `reviewer` row.

Rules:

- Precision (against any truth source) is what gates use. Agreement is the reviewer-only subset. Audit labels are weighted by `1 / sample_rate`.
- Targeted picks (near a threshold, challenger disagreements) feed datasets and the Studio, never gate metrics.
- Agent and LLM-judge labels are stored with source `agent` and count only after a human confirms them.
- A set with no app feedback and no audit sample shows a "no truth source" warning, and its precision-based auto-demote is marked inactive rather than silently never firing.

### 4. Quality targets and gates

`goals.quality_target` holds a typed `QualityTarget`, replacing the free-text `success_metric`. A separate `goals.business_kpi` text field keeps the business goal. There is one defaults table; the 0.97 and 0.92 lines are deleted.

```ts
QualityTarget = { tier: "low" | "standard" | "high", highPrecision: number, mediumPrecision: number, minCoverage: number, minLabeledHigh: number }
```

| Tier | highPrecision | mediumPrecision | minCoverage | minLabeledHigh |
|---|---|---|---|---|
| low | 0.90 | 0.75 | 0.60 | 50 |
| standard | 0.95 | 0.85 | 0.50 | 100 |
| high | 0.98 | 0.95 | 0.30 | 250 |

- Gates compare the 95 percent Wilson lower bound, not the point estimate. Below the label minimum a gate returns `insufficient_data`, never pass. The high-tier minimum is 250 because a perfect record clears 0.98 only at about 190 labels.
- Shadow to controlled requires a pinned model (ADR-008), at least 200 shadow runs, labeled high-band decisions at or above `minLabeledHigh`, and a high-band precision lower bound at or above `highPrecision`. Controlled to full requires coverage and precision at target over a trailing 7 days and an admin; an agent also needs an approval (ADR-007).
- Evals are required when publishing to a production pointer in `controlled` or `full`. The regression gate scores the champion and the candidate on the same `dataset_snapshots` row: the candidate's high-band precision lower bound may not fall below the champion's, its coverage may not drop by more than the set's margin, and its review load may not rise by more than the set's margin.

### 5. Replay, suggestions, health, proposals and experiments

- **Policy replay.** Runs always store full answers, including probabilities. A candidate policy is replayed over stored answers through the router with zero System One calls.
- **Threshold suggester.** A pure `suggestThresholds(labeledAnswers, currentPolicy, target)` in `packages/core/src/learning` returns `ThresholdProposal { decisionId, current, proposed, curve: [{ threshold, precision, precisionLower95, coverage }], support, insufficientData }`. It picks the loosest threshold whose precision lower bound still meets the target. It re-runs whenever a version's model changes.
- **Set health.** `SetHealth` per set, version and question reports labeled count, precision and lower bound per band, coverage, review load, drift and status (`ok`, `below_target`, `insufficient_data`, `drifting`, `no_truth_source`) against the `QualityTarget`. It is built from the `question_daily` rollup. There is no single 0 to 100 score, because one number hides the precision and coverage tradeoff.
- **Proposals.** One `proposals` table (kinds `tune_thresholds`, `model_upgrade`, `question_fix`, `add_none_option`, `split_question`, `narrow_state`, `label_more`, `demote`). Accepting a proposal only creates a draft, which then goes through the normal publish, experiment and approval path. Nothing publishes automatically.
- **Experiments.** Champion/challenger lives in `experiments` (kind `version`, `model` or `policy`), with `release_pointers.active_experiment_id` and `runs.experiment_id` and `arm`. The challenger dual-runs on a sample of the same states after the champion responds, never affects `effectiveAction`, and books experiment cost, not savings. Disagreements create label items. Promotion needs the challenger's precision lower bound on the same labeled runs to be at least the champion's, with coverage not dropping by more than the set's margin. Promotion is high risk, so agents need an approval. This replaces the earlier "canary (later)" idea. Skipping champion/challenger for a live set needs an admin and a written reason.
- **New models.** Try-model clones the production version into a draft that changes only `model`, evaluates both on the same snapshot, re-runs the threshold suggester and opens a `model_upgrade` proposal. Promotion then goes through an experiment.

### 6. Data for learning

- Retention splits into `state_retention_days` (default 30) and `answers_retention_days` (default 180), since answers and decisions carry no raw input.
- Before state is purged, runs that were picked for labeling or received feedback are copied into `dataset_cases`, with state redacted per `pii_mode`, full answers, `version_id` and `model_resolved`. `dataset_retention_days` defaults to the org's state retention, and only an admin can raise it, with an audit row. There is no silent longer default.
- Each dataset case gets a fixed split (drafting, calibration or test) at insert, from a hash of `state_hash`. The test split never leaves the server.
- Studio improve mode works in `studio_sessions` and `studio_examples`. The API enforces the holdout rules: the test split never appears in any response, calibration views mark cases as burned, and agent labels need human confirmation.

### 7. Savings honesty

- Decision savings count only questions whose `effectiveAction` is `auto`. Every other decision counts cost, not savings. The escalation-avoided formula is unchanged.
- Shadow, eval, staging and experiment runs report `savingsUsd` 0 with a `savingsSuppressed` reason.
- A quality-adjusted value (savings minus estimated error cost and review cost) is computed in rollups and set health, not per run.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Rollout on `question_sets` | One value per set, simple | No per-channel stage; staging cannot differ from production; no room for a challenger |
| Keep rollout in the spec | Everything in one file | Specs are immutable, so auto-demote and pause would need new versions; spec edits could skip the gates |
| Agreement-only metrics (reviewer labels) | No new ingest path | No data in `full`, where high-band auto decisions are never reviewed |
| Point-estimate gates with a flat 50-label minimum | Simple to explain | Passes on noise; 50 of 50 correct only shows about 0.93 |
| Separate recommendations and proposals tables | Clear split between advice and drafts | Two inboxes and two lifecycles for the same thing |
| Rollout on pointers, one truth table, lower-bound gates, one proposals table (chosen) | Stage changes without versions; gates backed by data in every stage | More tables, jobs and a new Quality / Learning role |

## Consequences

- Stage changes, pauses and auto-demote no longer need a published version, and staging can differ from production.
- Gates and auto-demote have a truth source in every stage, including `full`. Sets without one are flagged instead of looking healthy.
- Reviewers spend a small, budgeted share of time on random audit items. The labeling budget is per set.
- A new Quality / Learning role owns `packages/core/src/learning` (pure) and `apps/console/src/jobs/learning`: the gate evaluator and auto-demote (hourly), the question rollup (nightly), threshold refit (weekly), the experiment scorer and the model-upgrade candidates job.
- Fixtures and tests: the normative router table, relevance, composite level versus band and conservative ordering; policy replay makes zero System One calls; no endpoint returns a test-split case; the regression gate uses the same snapshot for both sides.
- The example spec and every doc drop the spec `rollout` field and rename the `draft` stage to `inactive`.
- Docs that carry the detail: [confidence-policy.md](../../.claude/skills/sysone-builder/references/confidence-policy.md) (normative table, gates, auto-demote, QualityTarget defaults), [effectiveness-loop.md](../../.claude/skills/sysone-builder/references/effectiveness-loop.md) (truth sources, labeling policy, suggester, health, proposals, experiments, improve mode), [spec-schema.md](../../.claude/skills/sysone-builder/references/spec-schema.md) (`RunRequest`, `relevantWhen`, strict spec), [data-model.md](../../.claude/skills/sysone-builder/references/data-model.md), [savings-model.md](../../.claude/skills/sysone-builder/references/savings-model.md), [security.md](../../.claude/skills/sysone-builder/references/security.md) (retention), [definition-studio.md](../../.claude/skills/sysone-builder/references/definition-studio.md), [phase-3.md](../../.claude/skills/sysone-builder/references/phases/phase-3.md) and [phase-3b.md](../../.claude/skills/sysone-builder/references/phases/phase-3b.md).

## Rollout

- **Phase 0 part two:** the contract changes (spec without `rollout`, strict schema, pointer stage, `inactive`, decision ids and kinds, `RunRequest`, `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal`) land before the freeze. This ADR is accepted in the same step. No code exists yet, so there is no data migration.
- **Phase 3:** the gate evaluator and auto-demote, the feedback API, audit sampling and label items, `QualityTarget` on goals, and required evals for live production pointers.
- **Phase 3b:** policy replay and the threshold suggester, set health and `question_daily`, proposals, experiments, the model upgrade flow, Studio improve mode, dataset snapshots, learning retention and quality-adjusted value.
- **Reversal:** an editor can lower a set's audit rate or labeling budget; gates then report `insufficient_data` instead of passing. Experiments can be stopped at any time, which leaves the champion in place. Auto-demote only moves toward safety, and a human can promote again once the gates pass.
