# Effectiveness loop

Owner: Quality / Learning. It owns the pure logic in `packages/core/src/learning` and the jobs in `apps/console/src/jobs/learning`. Platform / Tenancy owns the operations, routes and tables, Console UI owns the screens, and Integrations owns the CLI commands and MCP tools. Decision record: [ADR-010](../../../../docs/adr/010-rollout-pointers-and-effectiveness-loop.md).

Phases: truth sources, the labeling policy, quality targets, the gate evaluator, auto-demote, and the dataset splits and snapshots that the regression gate needs ship in **Phase 3**, because rollout stages ship there. Everything else ships in **Phase 3b, Effectiveness loop** ([phases/phase-3b.md](phases/phase-3b.md)), which runs in parallel with Phase 4 and Phase 4b. Each section below names its phase.

System One models are not fine-tuned per tenant. TypeSafe: "Jev is not fine-tuned or LoRA-adapted with customer data... You shape its answers to your domain through the request rather than through per-account weights" (`docs.typesafe.ai/models.md`). So this loop improves the request: instructions, criteria, state shaping, thresholds, stages and composites. Do not plan a fine-tuning feature.

## 1. The loop in one picture

```
run --> truth --> metrics --> proposals --> draft --> eval --> experiment --> promote
 ^      feedback,  set         tune, rewrite,            same     champion vs    approval
 |      audit,     health      upgrade model             snapshot challenger     for agents
 |      review                                                                      |
 +----------------------------------------------------------------------------------+
```

Every step has a console screen, an operation ([management-api.md](management-api.md)), a CLI command and an MCP tool ([headless-and-agents.md](headless-and-agents.md)), so an agent can run the whole loop with the same checks as a person.

| Step | Console screen | Operation | CLI | MCP tool | Phase |
|---|---|---|---|---|---|
| Run | Playground, runs explorer | run endpoint ([api.md](api.md)) | `bandwise run` | `run_set` | 3 |
| Truth: app feedback | none (the app sends it) | `feedback.report` | `bandwise feedback send` | `report_feedback` | 3 |
| Truth: audit and review | Review queue (action and label items, with pick reasons) | `review.list`, `review.resolve` | `bandwise review list`, `bandwise review resolve` | `list_review_items`, `resolve_review_item` | 3 |
| Gates | Rollout chip and gate checklist | `rollout.get`, `rollout.change` | `bandwise rollout get`, `bandwise rollout set` | `get_rollout_gates`, `change_rollout` | 3 |
| Metrics | Set Health tab, org "Needs attention" list | `health.get`, `health.list` | `bandwise health` | `get_set_health` | 3b |
| Proposals | Proposals inbox per set | `proposal.list`, `proposal.accept`, `proposal.reject` | `bandwise proposals list`, `accept`, `reject` | `list_proposals`, `decide_proposal` | 3b |
| Tune | Policy editor, "Suggest from labels" | `policy.suggest` | `bandwise tune` | `suggest_thresholds` | 3b |
| Rewrite | Studio improve mode | `set.improve` | `bandwise improve` | `improve_set` | 3b |
| Upgrade model | Model upgrades page | `model.upgrades`, `set.try_model` | `bandwise upgrade list`, `bandwise upgrade try` | `get_report` (`model-upgrades`), `try_model` | 3b |
| Draft | Editor | `draft.get`, `draft.update`, `draft.validate` | `bandwise spec pull`, `push`, `validate` | `get_draft`, `update_draft`, `validate_draft` | 3 |
| Eval | Evals, calibration charts | `eval.run`, `eval.get` | `bandwise eval run` | `start_eval`, `get_job` | 3 |
| Experiment | Experiments tab | `experiment.start`, `experiment.get` | `bandwise experiments start`, `get` | `start_experiment`, `get_experiment` | 3b |
| Promote | Experiment promote button | `experiment.promote`, `experiment.stop` | `bandwise experiments promote`, `stop` | `decide_experiment` | 3b |
| Approve | Approvals inbox (a person decides) | `approval.get` to poll | `bandwise approvals get --wait` | `get_approval` | 3 |

## 2. Definitions

- **Truth:** the observed correct value for one decision, or for the run's route, from one truth source.
- **Truth sources:** `app` (app feedback), `audit` (a random label item resolved by a reviewer), `reviewer` (an action review item resolved by a reviewer), `agent` (a label written by an agent or an LLM judge). All of them land in `run_feedback` ([data-model.md](data-model.md)).
- **Counted row:** an `app`, `audit` or `reviewer` row, or an `agent` row a person has confirmed. A confirmed `agent` row counts as the source it stands in for: `audit` when it resolved an item with a `sample_rate`, otherwise `reviewer`. Unconfirmed `agent` rows count toward nothing. A row written by resolving a targeted label item (reason `near_threshold` or `challenger_diff`, no `sample_rate`) is not a counted row: it feeds datasets and the Studio only (section 4).
- **Match:** the decision's value equals the truth. A choice matches on the option key and a noul on `true` or `false`. A score matches on `round_half_up(score)`, the nearest 0-based level index, so `FeedbackReport.observed` for a score is that level index. A composite matches on its level. A noul in the low band has value `null` and never matches.
- **Precision** (per band): the weighted share of labeled decisions in that band that match, over every counted row (`app`, `audit` weighted by `1 / sample_rate`, and `reviewer`). Reports show the point estimate and the 95 percent Wilson lower bound. Gates, auto-demote and set health use the lower bound. Reviewer rows carry weight 1 and do not bias a band's estimate: review routing is decided per question and band, so when a band's action is `review`, every decision in that band is reviewed. In such a fully reviewed band every row has weight 1, including rows the audit also picked, because the band is a census, not a sample. The `1 / sample_rate` weight applies only in bands whose action is not `review`. A decision is never counted twice.
- **Agreement** (per band): the same measure restricted to reviewer-written rows (`audit` and `reviewer`), a subset of precision. The Human agreement report shows it ([savings-model.md](savings-model.md)). Gates use precision, not agreement.
- **Coverage:** the share of relevant gating decisions whose policy `action` is `auto`. It uses the policy action, not `effectiveAction`, so it can be measured in `shadow` and predicts what `full` will do.
- **Review load:** action review items created per day, and the share of runs that create one.
- **labeled_n:** the number of labeled relevant decisions, per band and per question, counting each decision once. When a decision has several counted rows, an `audit` or `reviewer` row wins over an `app` row, and the latest row wins within a source.

## 3. Truth sources (Phase 3)

```ts
FeedbackReport = {
  runId?: string, externalRef?: string,                  // exactly one of the two
  target: { decisionId: DecisionId } | { route: true },  // one decision, or the run's route
  observed: unknown,                                     // option key, boolean, score level index,
                                                         // composite level or route output
  observedAt: string,                                    // ISO 8601
  idempotencyKey: string,
  failureClass?: "missing_evidence" | "model_error" | "code_error" | "service",   // ADR-012
}
```

- **The server sets the source.** `FeedbackReport` has no `source` field. The server derives `run_feedback.source` from the caller: an `sk_` app token writes `app`, and an agent token writes `agent`, which counts toward nothing until a person confirms it (`confirmed_by_user_id`). `FeedbackReport` is a strict schema, so a body that sends a `source` key at all, whatever its value, returns `400 invalid_request`. `reviewer` and `audit` rows are written only by `review.resolve` from a person's session.
- **App feedback.** `POST /api/v1/feedback` (operation `feedback.report`, scope `feedback:write`) takes 1 to 1,000 items and matches each by `runId` or by `externalRef` (`RunRequest.options.externalRef`, stored as `runs.external_ref`). Each item is idempotent on its own key. Details in [api.md](api.md#feedback). `sk_` app tokens and agent tokens can send it; `pk_` and browser tokens never can. Surfaces: `client.reportFeedback()` in `@bandwise/client` (Phase 4), `bandwise feedback send <file.jsonl>` and the MCP tool `report_feedback`.
- **Send outcomes for every run you can observe, not only the wrong ones.** Feedback sent only on disagreement makes precision look worse than it is.
- **Audit sample.** Label items picked at random per band by the labeling policy (section 4). A reviewer resolves them, which writes an `audit` row carrying the item's `review_item_id`, so the weight `1 / sample_rate` can be applied.
- **Review resolutions.** Resolving an action review item writes a `reviewer` row, or an `audit` row when the audit also picked that decision (section 4). When an agent token resolves an item, the row is `agent`.
- **Agent and LLM-judge labels** are stored with source `agent` and count toward nothing (gates, health, evals, promotion) until a person confirms them in the review queue, which sets `confirmed_by_user_id`.
- **Late feedback.** Answers are kept for `answers_retention_days` (default 180), and labeled runs are copied into datasets before their state is purged (section 13), so feedback that arrives weeks later still counts.

Example body:

```json
{ "items": [
  { "externalRef": "ticket_48213", "target": { "decisionId": "department" }, "observed": "billing",
    "observedAt": "2026-09-26T14:02:00Z", "idempotencyKey": "fb_48213_department" }
] }
```

## 4. Labeling policy (Phase 3)

Each set has one labeling policy in `question_sets.labeling`, changed through `set.update` ([management-api.md](management-api.md)), never through the spec.

```ts
LabelingPolicy = {
  dailyBudget: number,                                   // label items per set per day
  auditRate: { high: number, medium: number, low: number },   // random share per band, 0 to 1
  targeted?: { nearThreshold: number, challengerDisagreement: number },   // share of the budget
}
```

Default: `{ dailyBudget: 50, auditRate: { high: 0.02, medium: 0.05, low: 0.02 }, targeted: { nearThreshold: 0.2, challengerDisagreement: 0.2 } }`. The 2 percent high-band audit is what gives gates data in `full`, where high-band auto decisions never reach review.

- The policy is active in every rollout stage, including `shadow` and `full`, on the production channel.
- A pure function in `packages/core/src/learning` decides per relevant decision. Randomness is injected, so core stays pure and tests are deterministic:

  ```ts
  selectForLabeling(input: { run, decisionId }, policy: LabelingPolicy, counters, rand: () => number)
    -> { select: boolean, reason: "audit" | "near_threshold" | "challenger_diff", sampleRate: number | null }
  ```

- **Audit picks come first** and are uniform within each band. The sampler stores the rate it actually used. When the day's budget runs short, it lowers the rate for the rest of the day (from the previous day's traffic) instead of stopping at a cutoff, so the `1 / sample_rate` weights stay correct.
- **Targeted picks** (confidence within 0.05 of a threshold, or a challenger that disagrees with the champion) use their share of what is left of the budget. They carry `sample_rate` null and feed datasets and the Studio only, never gate or health precision.
- The label sampler runs inline at run time: `RunSink` writes the label items in the run's transaction ([architecture.md](architecture.md)).
- Label items (`review_items.kind = 'label'`) never block the caller and never change `effectiveAction`.
- When the audit picks a decision that already has an action review item, the sampler sets the audit `sample_rate` on that item instead of creating a second one. Resolving any item that carries a `sample_rate` writes an `audit` row, so the audit stays uniform without doubling reviewer work.
- The review UI shows why each item was picked (`reason`).

## 5. Quality targets and gates (Phase 3)

Each goal stores one `QualityTarget` in `goals.quality_target`, next to a free-text `business_kpi`.

```ts
QualityTarget = { tier: "low" | "standard" | "high", highPrecision: number, mediumPrecision: number,
                  minCoverage: number, minLabeledHigh: number }
```

Tier defaults, in the order highPrecision / mediumPrecision / minCoverage / minLabeledHigh: low 0.90 / 0.75 / 0.60 / 50, standard 0.95 / 0.85 / 0.50 / 100, high 0.98 / 0.95 / 0.30 / 250. The normative table and the rollout gates are in [confidence-policy.md](confidence-policy.md#quality-targets); this file does not keep a second copy.

- **Lower bounds, not point estimates.** Gates compare the 95 percent Wilson lower bound of precision with the target:

  ```
  wilsonLower(k, n) = (p + z^2/(2n) - z * sqrt(p(1-p)/n + z^2/(4n^2))) / (1 + z^2/n),   p = k/n, z = 1.96
  ```

  With weighted audit rows, `k` and `n` are the weighted counts scaled to the Kish effective sample size.
- **`insufficient_data`.** Below `minLabeledHigh` labeled high-band decisions (a raw count), a gate returns `insufficient_data`, never pass. 50 correct out of 50 only shows about 0.93, and a perfect record clears 0.98 only at about 190 labels, which is why the high tier needs 250.
- **Gate evaluator and auto-demote** (hourly, Phase 3). The job computes the gate results for each production channel, emits `rollout.gate_met` when the next stage's gates are met, and applies the auto-demote rules in [confidence-policy.md](confidence-policy.md#auto-demote). Auto-demote calls `rollout.change` as the system actor, never sets `paused`, and emits `rollout.auto_demoted` and `alert.raised` ([events.md](events.md)). It also raises `alert.raised` with kind `precision_below_target` when a live set's lower bound falls under its target, and with kind `band_drift` when the band mix drifts.
- **"No truth source."** A set with no app feedback and no audit sample (audit rates or budget at 0) shows a "no truth source" warning on `rollout.get` and in health, raises `alert.raised` with kind `no_truth_source`, and has its precision-based auto-demote marked inactive rather than silently never firing.
- **Evals** are required when publishing to a production pointer in `controlled` or `full`. The regression gate scores the champion and the candidate on the same dataset snapshot: the candidate's high-band precision lower bound may not fall below the champion's, its coverage may not drop by more than the set's `gate_margins.coverageDrop`, and its review load may not rise by more than `gate_margins.reviewLoadRise` ([testing.md](testing.md)).

## 6. Policy replay and the threshold suggester (Phase 3b)

**Policy replay.** Runs always store full answers, probabilities included ([data-model.md](data-model.md)). Bands and actions are a pure function of the answer and the policy, so a candidate policy can be re-routed over stored answers through the same router with zero System One calls. Replay covers runs within `answers_retention_days` and dataset cases that carry answers. Hash-only sets cannot replay ([security.md](security.md)).

**Threshold suggester.** A pure function in `packages/core/src/learning`:

```ts
suggestThresholds(labeledAnswers: LabeledAnswer[], currentPolicy: ConfidencePolicy, target: QualityTarget)
  -> ThresholdProposal[]

ThresholdProposal = {
  decisionId: DecisionId,
  current: ConfidencePolicy,          // the policy as it is
  proposed: ConfidencePolicy,         // same policy, threshold fields changed only
  curve: Array<{ threshold: number, precision: number, precisionLower95: number, coverage: number }>,
  support: number,                    // labeled decisions behind the curve
  insufficientData: boolean,          // true below the target's label minimum; `proposed` then equals `current`
}
```

- It picks the loosest threshold whose precision lower bound still meets the target: `highPrecision` for the high threshold, `mediumPrecision` for the medium threshold. Looser means more coverage at the same guaranteed precision.
- It covers choice and score `thresholds`, choice `perOption` overrides (only for options with enough labels of their own; others keep the set thresholds), and noul `trueAt`, `falseAt` and `reviewMargin`.
- Composite `levelThresholds` set a magnitude, not a certainty, so the suggester leaves them alone.
- Labeled answers come from counted `run_feedback` rows joined with `runs.answers`, and from dataset cases in the drafting and calibration splits. It never reads the test split.
- The console and the CLI show the net value of each curve point next to its precision and coverage ([savings-model.md](savings-model.md#quality-adjusted-value)). The target stays a hard floor.

Where it is used:

- The policy editor's **"Suggest from labels"** shows the curve and applies the result to the draft only.
- `POST /api/v1/sets/{ref}/policy-suggestions` (`policy.suggest`, a job). With `apply: true` it writes the draft and needs `sets:write`.
- MCP `suggest_thresholds` and `bandwise tune <slug> [--apply]`.
- The model upgrade flow (section 10) and the weekly threshold refit job (section 15).
- The eval gate for policy-only changes: a draft that differs from the live version only in thresholds is scored by replay on the same snapshot, with zero System One calls.

Thresholds depend on the model. The suggestion re-runs whenever a version's `model` changes, and the default thresholds in confidence-policy.md are only starting points measured on jev-1.13. A later ADR may add `ConfidencePolicy.measure` (`top_probability`, `margin`); v1 thresholds use `confidence` and replay keeps the full probabilities, so it can be added without losing history.

## 7. Set health (Phase 3b)

```ts
SetHealth = {
  setId: string, versionId: string, channel: "production" | "staging", model: string,
  status: HealthStatus,
  flags: HealthStatus[],              // every status that applies; status is the first in the order below
  target: QualityTarget,
  window: { from: string, to: string },
  set: HealthMetrics,
  questions: Record<DecisionId, HealthMetrics & { status: HealthStatus }>,
}

HealthStatus = "no_truth_source" | "drifting" | "insufficient_data" | "below_target" | "ok"

HealthMetrics = {
  labeledN: number,
  precision: Record<Band, { value: number | null, lower95: number | null, labeledN: number }>,
  coverage: number,
  reviewLoadPerDay: number,
  ece: number | null,                                    // from the latest eval
  psi: { bandMix: number | null, answers: number | null },   // against the baseline
  stability: number | null,                              // from the latest eval with repeats (section 12)
  costPerDecisionUsd: number,
}
```

- **Status order:** `no_truth_source`, `drifting`, `insufficient_data`, `below_target`, `ok`. `drifting` means PSI above 0.2 on the band mix or on the answer distribution. `below_target` means a band's precision lower bound is under its target, or coverage is under `minCoverage`.
- **Baseline:** the first 14 days after the version's last promotion on that channel.
- Health is built from the `question_daily` rollup ([data-model.md](data-model.md)) and the latest eval. There is no single 0 to 100 score, because one number hides the precision and coverage tradeoff.
- Surfaces: `GET /api/v1/sets/{ref}/health` (`health.get`), `GET /api/v1/health` (`health.list`, worst first in the status order above, then by review load), MCP `get_set_health`, `bandwise health [<slug>]`, the set's Health tab and the org "Needs attention" list. Scope `reports:read`.
- For a hash-only set, health says plainly that review shows no content, datasets cannot grow from production and replay is unavailable.

## 8. Proposals (Phase 3b)

Recommendations and improvement drafts are one thing: a row in `proposals` ([data-model.md](data-model.md)). Agents and people work one queue.

| Kind | Produced by | What accepting does |
|---|---|---|
| `tune_thresholds` | Weekly threshold refit; health rules; the stability rule (section 12) | Writes the suggested thresholds to the draft |
| `model_upgrade` | `set.try_model` (section 10) | Writes the new model and re-tuned thresholds to the draft |
| `question_fix` | Studio improve mode | Writes the edited instructions or criteria to the draft |
| `add_none_option` | Improve mode; health rules (reviewers keep answering with a value that is not an option) | Adds a "none of these" option to the draft |
| `split_question` | Improve mode; the stability rule | Replaces one question with narrower ones in the draft |
| `narrow_state` | Improve mode; weakness lints on large unreferenced state | Narrows `input` paths or adds redaction or filtering in the draft |
| `label_more` | Health rules (`insufficient_data`, `no_truth_source`) | Returns the `set.update` call that raises the audit rate or budget; no draft |
| `demote` | Health rules that auto-demote does not act on, such as a sustained rise in review load | Returns the `rollout.change` call one stage down; no draft |

- Accepting a proposal only creates a draft (through `draft.update`, with the same `If-Match` rules), which then goes through the normal eval, publish, experiment and approval path. Nothing publishes automatically.
- `label_more` and `demote` have no patch. Accepting records the decision and returns the operation to call; the person or agent then calls it.
- Each proposal carries `evidence`, `metrics_delta` (precision lower bound, coverage, review load, cost per decision and net value) and a one-paragraph `rationale`.
- One open proposal per set, kind and decision; a newer one replaces the older. Open proposals expire after 30 days, or when the live version changes and the evidence no longer applies.
- Every new proposal emits `proposal.created` ([events.md](events.md)).

## 9. Experiments (Phase 3b)

Champion/challenger replaces the old "canary (later)" idea. It compares versions, models or policies on the same traffic.

- **Start.** Publishing to a production channel whose stage is `controlled` or `full` starts an experiment on its own, unless the call sets `skipExperiment` with a written reason (admin role; an agent also needs an approval). `experiment.start` starts one by hand. At most one experiment runs per set and channel, held in `release_pointers.active_experiment_id`.
- **Kinds.** `version` (a new spec), `model` (only the model changed, from try-model) and `policy` (only thresholds changed).
- **Size.** `samplePct` (column `sample_pct`) is a share of runs from 0 to 1. The default is 0.1, also for experiments that start on their own at publish. A `samplePct` above 0.25 makes `experiment.start` high risk for agents, so it needs an approval. Challenger cost counts against the org quota, and challenger calls show in the Rate headroom report ([savings-model.md](savings-model.md)). The agent token's daily spend cap does not cover it, because the cost comes from traffic, not from the token.
- **Dual run.** On `sample_pct` of runs, after the champion has responded (off the caller's latency path), the challenger runs on the same state. Its run row has `arm = 'challenger'`, books experiment cost and no savings (`savingsSuppressed: "experiment"`), dispatches no actions, creates no action review items and never affects `effectiveAction`. The champion's run in the pair has `arm = 'champion'` and behaves normally.
- **Policy experiments need no dual run.** The scorer replays the champion's stored answers under the challenger's policy, at no System One cost.
- **Disagreements** (the challenger's value or band differs from the champion's) create label items with reason `challenger_diff`, within the targeted share of the labeling budget.
- **Stop rules.** The scorer decides nothing until the challenger has `min_runs` runs (default 500) and both arms have `min_labeled` labeled runs (default the target's `minLabeledHigh`). It stops the experiment on its own (toward safety) when the challenger cannot win, meaning its precision upper bound is below the champion's lower bound, or after 30 days.
- **Promotion rule.** On the same labeled runs, the challenger's high-band precision lower bound is at least the champion's, and its coverage does not drop by more than `gate_margins.coverageDrop`. Net value is shown next to both and never overrides them.
- **Promotion** is `experiment.promote`, by a person or by an agent with an approval (it is high risk). It moves the pointer to the challenger version, writes a `release_events` row of kind `experiment_promote` and emits `release.promoted` and `experiment.decided`. `experiment.stop` is toward safety and never gated.
- For kind `model`, the challenger must pin a versioned model before it can serve `controlled` or `full` (lint `model.alias_past_shadow`).

## 10. New System One models (Phase 3b)

Detection, the registry and the lifecycle are in [system-one-models.md](system-one-models.md). The loop side:

1. **Detect.** A model reaches `stable` (or `preview` for an org with `allowPreviewModels`) and `model.available` is emitted. The model-upgrade candidates job lists every live set pinned to an older model in the same family on the Model upgrades page and report. It spends nothing: running evals on the org's key is a choice a person or agent makes.
2. **Try.** `set.try_model` (`POST /api/v1/sets/{ref}/try-model`, a job; `bandwise upgrade try`, MCP `try_model`) clones production into a draft that changes only `model`, evaluates both models on the same dataset snapshot, re-runs the threshold suggester on the new model's answers (thresholds are per model), and opens a `model_upgrade` proposal with the deltas.
3. **Accept** the proposal, which creates a draft. Weakness lints that stop firing for the new model are noted in the proposal.
4. **Experiment.** Publishing the draft to a live production channel runs an experiment of kind `model`.
5. **Promote** with an approval for agents, as in section 9.

The "Model upgrades" report shows the eval and experiment deltas per set ([savings-model.md](savings-model.md)). Sets still pinned to a deprecated model are listed there, and after its `retireAt` the lint `model.deprecated` is an error.

## 11. Improve mode (Phase 3b)

Improve mode reopens a published set in the Definition Studio and improves the request, since the model's weights never change per tenant.

- **Open** a published set: a `studio_sessions` row with its `set_id`. Examples come from the set's labeled production cases and datasets, using their fixed splits (section 13). The Studio shows disagreements per question.
- **Propose.** Claude, through `llm-client`, reads the drafting split only and proposes typed edits:

  ```ts
  ImproveEdit =
    | { op: "revise_instructions", q: QuestionId, instructions: Structured }
    | { op: "revise_criteria", q: QuestionId, criteria: QuestionDef["criteria"] }
    | { op: "add_option", q: QuestionId, option: string, criterion: Structured | null }
    | { op: "split_question", q: QuestionId, into: Record<QuestionId, QuestionDef> }
    | { op: "narrow_state", q: QuestionId, paths: string[] }
    | { op: "move_to_code", q: QuestionId, check: Check }       // a code condition (spec-schema.md)
  ```

- **Score.** Each candidate is compiled into a candidate spec and scored on the calibration split, under the session's cost cap, with the eval limiter bucket.
- **Confirm.** Only the best candidate is scored on the test split, once per session, and only aggregate metrics come back. If it misses the target there, the session reports the result and opens no proposal.
- **Output.** A proposal (kind `question_fix`, `add_none_option`, `split_question` or `narrow_state`) with a draft diff and metric deltas. Nothing publishes.
- **Surfaces.** `POST /api/v1/sets/{ref}/improve` (`set.improve`, a job, scope `evals:run`), MCP `improve_set`, `bandwise improve <slug>`, and the Studio's improve screen.

The wizard side of the Studio and the holdout rules it shares with this mode are in [definition-studio.md](definition-studio.md).

## 12. Stability (Phase 3b)

TypeSafe's consistency cookbook repeated the same 8 choice questions 15 times, with a fresh throwaway `uid` field in state on each call. TypeSafe repeated its plurality label 90.8 percent of the time and flipped on 2 of the 8 questions. Requiring a top probability of at least 0.60 raised agreement to 99.2 percent, with 74.2 percent of labels automatic (`docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md`).

- Evals take `repeats` (`eval.run`, `bandwise eval run --repeats <k>`). It is off by default. When on, k = 3 on a 10 percent sample of cases, within the eval cost cap. The eval runner adds a throwaway `uid` field to state after validation, outside `input.schema`.
- **Stability** per question is the share of repeated cases whose value and band stay the same across repeats. The eval's metrics record it, and set health shows the latest value.
- A question with stability below 0.9 and mean confidence within 0.05 of a threshold gets a proposal: `tune_thresholds` to widen the medium band, or `split_question` to rewrite it.

## 13. Data for learning

- **Retention split** ([security.md](security.md)): `state_retention_days` (default 30) nulls state; `answers_retention_days` (default 180) nulls answers and decisions, which carry no raw input.
- **Learning retention** (Phase 3b). Before a run's state is purged, a run that was picked for labeling or received feedback is copied into `dataset_cases` (`source = 'production'`), with state redacted per `pii_mode`, the full answers, `version_id` and `model_resolved`. Dataset cases follow `dataset_retention_days`, which defaults to the state retention; only an admin can raise it, with an audit row. The copy runs in the nightly retention job, owned by Platform / Tenancy.
- **Fixed splits** (Phase 3). Each dataset case gets its split at insert from a hash of `state_hash`: 40 percent drafting, 40 percent calibration, 20 percent test, the same proportions the Studio uses. The split never changes, and the same state lands in the same split in every dataset, so a copy of a test case cannot leak into drafting.
- **Snapshots** (Phase 3). `dataset_snapshots` freezes a list of case ids. `eval.run` takes `snapshotId` or snapshots the dataset's current cases. The regression gate (section 5, Phase 3) and try-model (Phase 3b) score both sides on the same snapshot.
- **Holdout rules**, enforced by the server ([management-api.md](management-api.md#holdout-rules-at-the-api)):
  - The test split never appears in any response: cases, export, features, eval details and Studio examples. Evals and promotion return aggregate metrics for it only.
  - Per-case calibration results are returned only on request, and those cases are then marked burned. Burned cases stop counting toward calibration scores and are used as drafting data.
  - Agent labels count toward nothing until a person confirms them.
  - The suggester and improve mode's drafting step never read the test split.

## 14. Quality-adjusted value

Gross savings assume every auto decision is right. Rollups and set health also compute a quality-adjusted value that subtracts the expected cost of wrong auto decisions and the cost of review. The formula, the per-set `value_settings` and the report are in [savings-model.md](savings-model.md#quality-adjusted-value). The suggester and the experiment scorer show it next to precision and coverage; the precision target stays a hard floor.

## 15. Jobs

All jobs live in `apps/console/src/jobs/learning` and call pure logic in `packages/core/src/learning` (label selection, Wilson bounds, gate evaluation, replay, the threshold suggester, health and PSI, experiment scoring, stability).

| Job | Schedule | Phase | Writes | Emits |
|---|---|---|---|---|
| Label sampler | Inline at run time, in `RunSink`'s transaction | 3 | `review_items` of kind `label` | `review.created` |
| Gate evaluator and auto-demote | Hourly | 3 | `rollout.change` as the system actor | `rollout.gate_met`, `rollout.auto_demoted`, `rollout.changed`, `alert.raised` (`precision_below_target`, `band_drift`, `no_truth_source`) |
| Question rollup | Nightly | 3b | `question_daily` | none |
| Health rules | Nightly, after the question rollup | 3b | `proposals` | `proposal.created` |
| Threshold refit | Weekly | 3b | `proposals` of kind `tune_thresholds`, when coverage can rise at the same guaranteed precision or precision is below target | `proposal.created` |
| Experiment scorer | Hourly while an experiment runs | 3b | `experiments.result`; stops an experiment that cannot win | `experiment.decided` when it stops one |
| Model-upgrade candidates | When a model becomes `stable`, or `preview` for opted-in orgs | 3b | Model upgrades report rows | none (`model.available` comes from the registry sync) |

The learning retention copy runs in the retention job, and the registry sync, alias probe and contract watch run under Platform / Tenancy from Phase 1 ([architecture.md](architecture.md), background jobs).

## Tests this loop needs

QA / Evals owns these, with Quality / Learning. Details in [testing.md](testing.md).

- Replay under a candidate policy makes zero System One calls and matches a live run on fixtures.
- Audit weights: a seeded run stream with a known precision gives the same estimate at any audit rate, within its interval.
- The suggester never proposes a threshold whose lower bound misses the target, and returns `insufficientData` below the label minimum.
- Unconfirmed agent labels change no gate, health or eval metric.
- An agent token posting feedback stores an `agent` row that counts toward nothing, and a body with any `source` key (even `app` or `agent`) returns `400 invalid_request`.
- A reviewer row from a targeted label item changes no gate or health precision.
- No endpoint returns a test-split case.
- A challenger never changes `effectiveAction`, dispatches no action and books no savings.
- Phase 3b exit gate: on a seeded set with 500 labeled fixture runs, an agent using only MCP tools gets a threshold suggestion, applies it to a draft, runs a challenger, and promotes it after admin approval.

## Failure triage

Every missed or disputed decision gets one failure class (ADR-012, accepted), set by the reviewer or by the resolver of a feedback report, and stored with the case. It travels as the optional `failureClass` on `FeedbackReport`, on `review.resolve` input and on `review.resolved` resolutions:

| Class | Meaning | Usual fix |
|---|---|---|
| `missing_evidence` | The state did not contain what the question needed | Change the input adapter or `stateFrom` |
| `model_error` | The evidence was there and the model answered wrong | Rewrite the question, add a no-match option, split the judgment, or try another model |
| `code_error` | Our code composed, routed or mapped the answer wrong | Fix the spec, composite or route |
| `service` | Timeout, outage or rate limit | Check the outage rule and limits, not the question |

Outage runs (warning `system_one_outage`, ADR-012) are not misses: they book no savings, pick no label items and never count toward precision, coverage or calibration. The `set_silent` liveness alert covers them instead ([confidence-policy.md](confidence-policy.md#outage-behaviour-adr-012-accepted)).

Proposals and set health group misses by class, so a spike in `missing_evidence` points at the input, not the prompt. The runs explorer shows state, questions and answers together for each miss, which is what the class is judged from. This follows the official TypeSafe skill's instruction to separate missing evidence, model errors, code errors and service failures.
