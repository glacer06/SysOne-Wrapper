# Definition Studio and the template library

Most people can't write a good System One question on the first try. Agents aren't great at it either (TypeSafe says so in its own agent-skill guidance). The Definition Studio turns a fuzzy question into a set of narrow checks, tests them against the user's own judgment, and publishes the result. It follows the workflow in Every's "How to Get the Most Out of Jev" (2026-09-23).

The Studio is two things over one state:

- a wizard in the console, and
- a set of `studio.*` operations: `studio.create`, `studio.add_examples`, `studio.draft_definition`, `studio.decompose`, `studio.calibrate`, `studio.request_labels` and `studio.promote` ([management-api.md](management-api.md#definition-studio)).

Both read and write `studio_sessions` and `studio_examples` ([data-model.md](data-model.md)). So an agent can drive a session, a person can resume it in the console, and either can hand labeling back to a human. The server enforces the holdout rules below; the UI is not trusted to.

## Fit test first: the 10-second rule

Before building anything, ask: would a person need more than about 10 seconds to make this call?

- **Under 10 seconds** (is this email from a real person, which team owns this ticket): good fit for a System One model such as Jev.
- **Over 10 seconds** (write a reply, weigh a contract clause, plan a migration): route to an LLM. The Studio can still build a System One gate in front of the LLM (escalate only when needed), which is where escalation savings come from.

The Studio shows this test on step 1 and records the answer on the session (`fit_test`).

## Wizard steps

### 1. Capture intent

Fill in: *"I want to use Jev to answer **[question]** about **[material]**, so I can **[action or decision]**."*

A session may start from an **Opportunity** found in an app ([deploy-and-codegen.md](deploy-and-codegen.md)). The opportunity prefills the intent sentence, the state fields and seed examples, and the session keeps its `opportunity_id`.

Then collect examples. At least 10 the user would accept, 10 they'd reject, and any they're unsure about, each with a one-line reason. Examples can be pasted, imported from CSV or JSONL (`studio.add_examples`), or pulled from recent runs.

The server assigns each example a split from a hash of its state: 40% **drafting**, 40% **calibration**, 20% **test**. Datasets use the same rule, so the split carries over when the examples become the set's first dataset. Only drafting examples are ever shown to Claude. Calibration examples the user looks at case by case are marked `burned`. The test split stays untouched until the promotion check.

### 2. Draft a working definition

Claude (server-side through `llm-client`, with the org's own Anthropic key or the platform's) reads the intent and the drafting examples and writes a working definition of the fuzzy term ("urgent", "relevant", "sounds like AI"). The user edits it. This is the only step where an LLM writes prose.

### 3. Decompose into checks

First pick the pattern. The pattern advisor ([deploy-and-codegen.md](deploy-and-codegen.md)) suggests one, and the chosen pattern picks the spec skeleton:

| Pattern | Spec skeleton |
|---|---|
| `fan_out` | One spec stage with every question; speculative questions get `relevantWhen` |
| `confidence_routing` | Thresholded policies whose bands pick `auto`, `review` or `fallback` |
| `composite_scoring` | A `composites` block over the checks |
| `intent_routing` | A choice plus `routes` |
| `cascade` | The low band's action is `escalate_to_llm` |
| `top_choice` | A choice with the top-choice preset ([confidence-policy.md](confidence-policy.md#preset-top-choice-only)): not gating, no thresholds, every band `auto` |
| `keep_in_code` | No System One question; a check in `spec.checks` or plain app code |

Claude then proposes separate checks, each one:

- A primitive: Noul for "does X hold", Choice for "which one", Score for "how much".
- Instructions with the full meaning (IDs are not sent to the model).
- Criteria: yes/no definitions, options, or levels.
- One clear example and one borderline case.
- The state fields it needs.

The decomposition prompt includes the target model's jaggedness page (`jaggednessUrl` on its profile, [system-one-models.md](system-one-models.md)), so drafts avoid the model's known weak spots, such as counting, date comparison and inverted nouls. Checks that need no model (sender domain in a list, a date comparison) go into `spec.checks` as code conditions ([spec-schema.md](spec-schema.md)), not System One questions.

Example from Every: "Is this email urgent?" becomes three weighted checks:
1. Did a real person write this message? (Noul)
2. Is someone I know waiting on me? (Noul)
3. Will ignoring it cost me something? (Score, 4 levels)

### 4. Combine

- Default to one spec stage. Ask speculative questions in the same stage and give them `relevantWhen`, so they don't drag the run band down when they don't apply. Add a second stage only when a later question needs state or options built from an earlier answer ([spec-schema.md](spec-schema.md)).
- Offer the top-choice preset when only the best option matters.
- For a composite, set weights and pick the rule: weighted sum for trade-offs, or "any serious violation" as separate gating conditions. Pick a policy for the composite.
- The Studio can suggest weights with a logistic regression computed in `core`. Its features are the per-term values: the noul value, the normalized score and the choice option probability. It is fitted on drafting labels only.

### 5. Calibrate against the user's judgment

Run the checks on the calibration split (`studio.calibrate`, a job). **The labels are never included in the model's input.** Show:

- What the checks selected and missed, next to the user's choices.
- Each disagreement with the per-question answers, so the user can see which check caused it.
- Suggested fixes: unclear instruction, missing context, missing "none" option, a check that should be split. These are the same typed edits improve mode uses ([effectiveness-loop.md](effectiveness-loop.md)).

Aggregate metrics come back by default. Per-case results come back only on request, and those cases are then burned. Revise, then test on fresh labeled examples before trusting the result.

A **leakage guard** flags overlap between calibration or test examples and the instructions or criteria (people paste examples into questions without noticing) and blocks promotion until it's resolved.

### 6. Promote

The untouched test split must meet the goal's `QualityTarget` ([confidence-policy.md](confidence-policy.md#quality-targets)). `studio.promote` returns only pass or fail and aggregate metrics. On a pass it writes the set's draft, creating the set when the session has none. Then publish, then set the channel rollout to `shadow` (`set.publish`, then `rollout.change`). The labeled examples become the set's first dataset. Shadow runs build evidence; moving to `controlled` needs the gates in [confidence-policy.md](confidence-policy.md).

## Headless Studio and holdout rules

The server enforces these rules, not the UI, so an agent driving the operations gets exactly what a person in the wizard gets:

- **Drafting examples** are returned in full.
- **Calibration results** are aggregate by default. Per-case results are returned only on request (`includeCases: true`), and those cases are then marked burned and stop counting toward calibration scores.
- **The test split** is never returned by any endpoint, including dataset export and `dataset.features`.
- **Promotion** returns only pass or fail and aggregate metrics.
- **Agent labels** (`label_source` `agent`) never count toward promotion, eval gates or rollout gates until a person confirms them.
- **Human labels are ground truth.** Agents write weak questions (TypeSafe's agent-skill guidance says so), so an agent that needs labels calls `studio.request_labels`, which creates label review items (kind `label`, reason `studio`) for people, and waits for them.
- A session can be resumed by any org member with `sets:write`, from the console or the API.

The same rules are listed for the whole API in [management-api.md](management-api.md#holdout-rules-at-the-api).

## Improve mode

Improve mode reopens a published set in the Studio, using its labeled production cases and datasets with their fixed splits ([effectiveness-loop.md](effectiveness-loop.md)). Claude proposes typed edits from the drafting cases only, each candidate is scored on the calibration cases, and the best one is confirmed once on the test cases through aggregate metrics. The output is a draft with a diff and metric deltas, opened as a proposal; nothing publishes on its own.

## Template library (seeded)

Each template is a `QuestionTemplate` (see `templates/plugin.template.ts`): parameters in, `QuestionDef`s plus a suggested policy out. Each carries a `pattern` tag. Document evaluator and email urgency are seeded in Phase 3; the rest arrive with the plugin SDK in Phase 5.

| Template | Pattern | Shape | Source |
|---|---|---|---|
| LLM router | `intent_routing` | Choice over models by task type; low band escalates to the strongest model. See the note below on `typesafe/jev-router` | The Code, 2026-09-26 |
| PR auto-merge safety | `composite_scoring` | Nouls: too big to review, touches auth/billing, tests changed, risky migration; composite gate | The Code, 2026-09-26 |
| Email urgency | `composite_scoring` | 3 weighted checks, above | Every, 2026-09-23 |
| Agent reasoning-effort controller | `top_choice` | Choice: which reasoning effort the agent's next step needs (low, medium or high), with the top-choice preset because a wrong pick is cheap | Linas, 2026-09-22 |
| LLM guardrails | `confidence_routing` | Nouls per hazard on input and output; pass, review, block | TypeSafe cookbook |
| RAG passage filter | `fan_out` | Score per passage for usefulness; code keeps the top ones | TypeSafe cookbook |
| AI-tell detector | `fan_out` | Parallel Nouls per writing tell ("not X but Y", tricolons, filler words) | Every, 2026-09-23 |
| Document evaluator | `composite_scoring` | Score per dimension the user names, for PRs, incident reports, tickets | The Code, 2026-09-26 |
| Context pruner | `confidence_routing` | Noul per tool call or message: "does this still matter for the current task"; drop the rest, rewrite nothing | The Code, 2026-09-26 (fast-jev-compaction) |
| Log-line pager | `confidence_routing` | One Noul per log line ("does this need a human now"), tunable threshold | The Code, 2026-09-26 |
| UI action picker | `confidence_routing` | Numbered list of clickable elements in state; one Choice picks action and element; high-risk tier by default ([security.md](security.md)) | The Code, 2026-09-26 (browser-use/jev-ultrafast) |

**Kit template pack.** `packages/templates` (ADR-019, pure, core only) holds complete specs for email triage, PR auto-merge safety, the log-line pager, the context pruner, a wake gate for sleeping agents, and a triage pack (security finding triage, error triage, lead and event scoring, inbound email routing). Each carries a pattern tag, when to use it and when not to, example states and a borderline case per question. The console seeds and the Phase 5 `QuestionTemplate`s should wrap these specs rather than copy them.

**LLM router and `typesafe/jev-router`.** OpenRouter offers `typesafe/jev-router` (launched 2026-09-25): a free, OpenAI-compatible chat model that uses Jev to pick the LLM and the reasoning effort for each request. When an app only needs "send this prompt to a good enough model", that is the turnkey option, and the Studio says so before it builds the LLM router template. The template earns its place when the org needs what jev-router does not give: its own list of allowed models and a policy over them, confidence bands and gates, a review queue for low-band picks, rollout stages and a kill switch, and a savings ledger that shows what each routing choice cost. ADR-011 (proposed) also lets a set's `escalate_to_llm` target `typesafe/jev-router`, so a low-band decision can fall back to it.

## Working rules for question writing

- The spec is the single reviewable place for questions and thresholds (TypeSafe's single-file advice); in an app repo that is `bandwise/sets/<slug>.json`.
- System One models are not fine-tuned per tenant; improve the request.
- Expect to edit the drafts together with the user. The Studio makes that easy; it doesn't pretend the first draft is final.
- Don't take the agent's assertions at face value. Calibration against labeled examples is the check.
