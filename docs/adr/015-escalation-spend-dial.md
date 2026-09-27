# ADR-015: Escalation spend is the number owners tune

- **Status:** accepted (Nick, 2026-09-27: "accept ADR-013, 014 and 015")
- **Date:** 2026-09-27
- **Owner:** Billing / Savings, with Console UI and Quality / Learning
- **Decider:** Nick
- **Contract impact:** `AlertKind` gains `escalation_over_budget` (now). `question_sets` gains a nullable `escalation_budget_micro_usd_per_day`, a setting outside the versioned spec (Phase 3). The policy preview result gains a `forecast` block (Phase 3).

## Context

A set's daily bill is roughly: decisions times tokens times the System One price, plus escalations times the cost per LLM call. At $0.042 per million input tokens the first part stays small. The second part is where the money goes, and it depends on how often a set escalates. Cheap decisions tempt owners to watch more and ask more, so the bill grows anyway, in the escalation lane.

We already record actual escalation spend (`escalationCostUsd`, `usage_daily.escalation_cost_micro_usd`, `llm_calls_made`). Reports lead with savings, though, and the policy editor shows precision, not what a threshold costs.

The one public threshold sweep (TypeSafeAI/jev-harness issue 5: 20 synthetic fixtures, 4 live runs) let zero bad proposals through at every threshold from 0.50 to 0.90; the misses were good proposals blocked. It is small and one task. It still shows the point: moving a threshold changes how much work reaches people and LLMs, and that has to be visible when someone moves it.

## Decision

1. **Headline.** Set health, the savings report and the org dashboard show escalation rate (escalated decisions over decisions) and escalation spend per day next to savings, per set and per org.
2. **Forecast when moving a threshold.** The policy preview replays recent runs (or an eval dataset) under the proposed policy and returns counts per effective action, review items per day, escalation spend per day and System One spend per day, next to precision.
3. **Budget alert.** A set can have a daily escalation budget. A job raises `alert.raised` with kind `escalation_over_budget` when the day's escalation spend crosses it. It alerts only and does not stop escalating. A hard cap needs its own ADR.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep savings as the headline | No change | Owners tune the part of the bill that barely matters |
| Headline, forecast and alert (chosen) | Owners see and control the part that moves the bill | One more alert kind and a preview calculation |
| Hard cap that turns escalations into review over budget | Bill can't run away | Floods the review queue when it trips |

## Consequences

- Phase 3 reports and the policy editor gain the forecast. Phase 3 alerts gain the budget job.
- The audit sample of the auto band stays the quality check; the false-auto rate is shown in plain words next to the forecast.

## Rollout

The `AlertKind` value lands now so the contract is ready. The setting column, the job, the report fields and the preview forecast land in Phase 3.
