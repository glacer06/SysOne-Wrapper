# Confidence policy, bands, and rollout

Jev reports certainty two ways. Choice and Score answers carry `confidence` (0 to 1, derived from how concentrated the probability distribution is). Noul answers carry only `noul`, the probability of yes. SysOne turns both into one of three **bands**, then turns each band into an **action**. Read `https://docs.typesafe.ai/confidence.md` for the source material.

## Policy shape

```ts
ConfidencePolicy = {
  gating: boolean,                              // counts toward the run's overall band
  thresholds: { high: number, medium: number }, // choice/score: applied to `confidence`
  perOption?: Record<string, { high: number, medium: number }>, // stricter bars for risky options
  noul?: { trueAt: number, falseAt: number, reviewMargin: number },
  actions: {
    high: ActionRef,
    medium: ActionRef,
    low: ActionRef,
  },
}

ActionRef = { kind: "auto" | "review" | "fallback" | "escalate_to_llm", handler?: string, config?: unknown }
```

## Band algorithm

**Choice and Score**

```
t = perOption[answer.choice] ?? thresholds   // Score ignores perOption
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

**Run band:** the lowest band among questions with `gating: true`. Composites with their own policy count as gating questions.

## Actions

| Kind | What happens |
|---|---|
| `auto` | The answer is applied. Plugin action handlers run after commit. |
| `review` | A review item is created. Nothing else happens until a human resolves it. |
| `fallback` | Run the configured fallback (default rule, another set, or a no-op). |
| `escalate_to_llm` | Hand off to a reasoning model. Counts toward "escalations" in the savings ledger. |

## Rollout stages (per question set)

| Stage | Behavior |
|---|---|
| `draft` | Runs only from the console playground. |
| `shadow` | Runs and logs everything. Every `effectiveAction` is `fallback`, so the caller keeps its existing path. Use it to measure before trusting. A sample of runs creates labeling review items. |
| `controlled` | Only `high` band actions execute. Medium and low go to review regardless of policy. |
| `full` | Policy actions execute as written. |
| `paused` | Kill switch. Every `effectiveAction` is `fallback`. Manual, or set by auto-demote. |

The rollout stage is enforced in `packages/core` only, through `effectiveAction`. No other package reinterprets it.

### Default gates (per set, editable, stricter for high-risk sets)

| Move | Gate |
|---|---|
| draft to shadow | Published, model pinned, eval or Studio test split with at least 30 cases |
| shadow to controlled | At least 200 shadow runs, at least 50 labeled, high-band agreement at or above target (95% standard, 98% high risk) |
| controlled to full | At least 14 days or 500 controlled runs, medium-band agreement at target, review SLA met. Admin role required. |

### Auto-demote (full to controlled, with an alert)

- High-band agreement falls below target over a trailing 7 days.
- Band mix drifts (PSI above 0.2 against the baseline).
- The resolved model changes on a set that uses an alias.
- Jev error rate above 5%.

### New versions of live sets

Publishing a new version of a set that is already `controlled` or `full` defaults to champion and challenger: the new version runs in shadow on a sample of traffic and creates diff review items, then gets promoted. An admin can skip this with a written reason, which is audited.

The console shows the stage as a status chip with a timeline and gate checklist, and writes every change to the audit log.

## Default thresholds by risk tier

These are starting points to evaluate, not rules. Tune on the org's own labeled data.

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

## Calibration targets (evals)

- High band precision at or above the set's target (default 0.97 for high risk, 0.92 standard).
- Coverage: the share of cases routed `auto`. Report it next to precision; raising a threshold trades coverage for precision.
- Expected calibration error (ECE) and a reliability table per question.
- A publish that drops high-band precision beyond the configured margin versus the production version's last eval is blocked when "require evals" is on.

## Question design rules that affect confidence

- One narrow judgment per question. Split fuzzy asks into separate checks (see `definition-studio.md`).
- Include a "none of these" option when nothing may fit. Without it, the model is forced to spread probability across wrong answers.
- Score levels must describe concrete situations and stand on their own.
- Give each question the state it needs. Missing evidence shows up as low confidence, which is the model telling you the truth.
