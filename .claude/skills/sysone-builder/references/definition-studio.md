# Definition Studio and the template library

Most people can't write a good Jev question on the first try. Agents aren't great at it either (TypeSafe says so in its own agent-skill guidance). The Definition Studio is a wizard that turns a fuzzy question into a set of narrow checks, tests them against the user's own judgment, and publishes the result. It follows the workflow in Every's "How to Get the Most Out of Jev" (2026-09-23).

## Fit test first: the 10-second rule

Before building anything, ask: would a person need more than about 10 seconds to make this call?

- **Under 10 seconds** (is this email from a real person, which team owns this ticket): good fit for Jev.
- **Over 10 seconds** (write a reply, weigh a contract clause, plan a migration): route to an LLM. The Studio can still build a Jev gate in front of the LLM (escalate only when needed), which is where escalation savings come from.

The Studio shows this test on step 1 and records the answer on the goal.

## Wizard steps

### 1. Capture intent

Fill in: *"I want to use Jev to answer **[question]** about **[material]**, so I can **[action or decision]**."*

Then collect examples. At least 10 the user would accept, 10 they'd reject, and any they're unsure about, each with a one-line reason. Examples can be pasted, imported from CSV, or pulled from recent runs.

Examples are split automatically: 40% **drafting**, 40% **calibration**, 20% **test**. Only drafting examples are ever shown to Claude. Calibration examples the user looks at while editing are marked `burned`. The test split stays untouched until the promotion check.

### 2. Draft a working definition

Claude (server-side, org's own Anthropic key or the platform's) reads the intent and examples and writes a working definition of the fuzzy term ("urgent", "relevant", "sounds like AI"). The user edits it. This is the only step where an LLM writes prose.

### 3. Decompose into checks

Claude proposes separate checks, each one:

- A primitive: Noul for "does X hold", Choice for "which one", Score for "how much".
- Instructions with the full meaning (IDs are not sent to Jev).
- Criteria: yes/no definitions, options, or levels.
- One clear example and one borderline case.
- The state fields it needs.

Checks that don't need AI (sender domain in a list, a date comparison) become plain code conditions, not Jev questions.

Example from Every: "Is this email urgent?" becomes three weighted checks:
1. Did a real person write this message? (Noul)
2. Is someone I know waiting on me? (Noul)
3. Will ignoring it cost me something? (Score, 4 levels)

### 4. Combine

Set weights for a composite and pick the rule: weighted sum for trade-offs, or "any serious violation" as separate gating conditions. Pick a policy for the composite.

### 5. Calibrate against the user's judgment

Run the checks on a sample the user already labeled. **The labels are never included in Jev's input.** Show:

- What the checks selected and missed, next to the user's choices.
- Each disagreement with the per-question answers, so the user can see which check caused it.
- Suggested fixes: unclear instruction, missing context, missing "none" option, a check that should be split.

Revise, then test on fresh labeled examples before trusting the result.

A **leakage guard** flags overlap between calibration or test examples and the instructions or criteria (people paste examples into questions without noticing) and blocks promotion until it's resolved. Studio can also suggest weights with a small logistic regression on drafting labels, computed in `core`.

### 6. Promote

The untouched test split must pass the set's target. Then save as a version in `shadow` rollout. The labeled examples become the set's first dataset. Shadow runs build evidence; the move to `controlled` needs an eval that meets the target.

## Template library (seeded)

Each template is a `QuestionTemplate` (see `templates/plugin.template.ts`): parameters in, `QuestionDef`s plus a suggested policy out.

| Template | Shape | Source |
|---|---|---|
| LLM router | Choice over models by task type; low band escalates to the strongest model | The Code, 2026-09-26 |
| PR auto-merge safety | Nouls: too big to review, touches auth/billing, tests changed, risky migration; composite gate | The Code, 2026-09-26 |
| Email urgency | 3 weighted checks, above | Every, 2026-09-23 |
| Agent reasoning-effort controller | Score: how stuck is the agent; maps to low/medium/high effort | Linas, 2026-09-22 |
| LLM guardrails | Nouls per hazard on input and output; pass, review, block | TypeSafe cookbook |
| RAG passage filter | Score per passage for usefulness; code keeps the top ones | TypeSafe cookbook |
| AI-tell detector | Parallel Nouls per writing tell ("not X but Y", tricolons, filler words) | Every, 2026-09-23 |
| Document evaluator | Score per dimension the user names, for PRs, incident reports, tickets | The Code, 2026-09-26 |
| Context pruner | Noul per tool call or message: "does this still matter for the current task"; drop the rest, rewrite nothing | The Code, 2026-09-26 (fast-jev-compaction) |
| Log-line pager | One Noul per log line ("does this need a human now"), tunable threshold | The Code, 2026-09-26 |
| UI action picker | Numbered list of clickable elements in state; one Choice picks action and element | The Code, 2026-09-26 (browser-use/jev-ultrafast) |

## Working rules for question writing

- Put questions and thresholds in the spec, in one place, so a human can review them without digging.
- Expect to edit the drafts together with the user. The Studio makes that easy; it doesn't pretend the first draft is final.
- Don't take the agent's assertions at face value. Calibration against labeled examples is the check.
