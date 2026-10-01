# Measurement
**Project:** Bandwise
**Last updated:** 2026-10-01

Stage: MVP. Bandwise is dogfooding on the `internal` org. The MVP ends when all three of these are true:

1. Bandwise Gate clears the ADR-021 shadow bar.
2. The hosted app is live for `internal`.
3. The first outside team is set up in Phase 2.

---

## What we're measuring (and why)

Nick picked these three on 2026-10-01.

| Metric | Definition | Why it matters | Target |
|---|---|---|---|
| Savings shown | Dollars saved per org per month, summed from run receipts (the `RunResult` savings field against the counterfactual LLM cost in the price book) | Proves the Carry line, "small model, heavy lifting", with real digits | Positive savings on every active org every month. Each figure shows its source |
| Calibration | Precision lower bound of the High band on labelled checks, per set (Wilson interval) | Proves the Trail line: a High band is right at a known rate | At least 0.9 for the done-check, after 200 or more labelled Stop events (the ADR-021 bar) |
| Activation | Share of new installs or new orgs that run a first check within 7 days | Proves the setup works and the value lands on day one | More than 60% |

---

## What a false positive looks like

- **Savings without calibration.** A set can save money by sending everything to High. If savings climb while the High band's precision falls, the thresholds are too loose.
- **Calibration on a tiny sample.** A precision of 1.0 on 12 labels means nothing. Always read the lower bound and the label count.
- **Activation without a second week.** A first check can be curiosity. Watch whether activated orgs still run checks on Day 7 and Day 30.
- **Dogfood numbers read as market numbers.** Receipts from Nick's own repo prove the plumbing, not demand. Count distinct outside teams separately.

---

## The Sean Ellis test (run quarterly after the MVP)

Ask active users: "How would you feel if you could no longer use this product?"

- **Very disappointed:** counts toward product-market fit.
- **Somewhat disappointed:** does not count.
- **Not disappointed:** does not count.

**Threshold:** more than 40% answering "very disappointed".

---

## The effort test (running, qualitative)

Every two weeks, ask: *Am I pushing users back in, or are they coming back without me?*

---

## Data sources

| Source | What it tracks | How we access it |
|---|---|---|
| Postgres on Supabase (project "bandwise") | Runs, receipts, labels, review queue, orgs | SQL through `withTenant`, or the `report.get` and `run.list` operations |
| `~/.bandwise/receipts.jsonl` | Local dogfood receipts from Claude Code hooks | `pnpm bandwise report --since 7d` |
| Stripe | Revenue and churn, once billing is live (ADR-006) | Stripe dashboard and webhooks |

---

## Weekly metrics brief

A one-page brief every Monday:

1. **What moved this week?** The numbers and their direction.
2. **What's the read?** One sentence on whether it's signal or noise.
3. **What's the next test?** One concrete thing to change as a result.
