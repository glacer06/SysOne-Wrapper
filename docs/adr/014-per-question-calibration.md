# ADR-014: Per-question calibration of System One confidence

- **Status:** accepted (Nick, 2026-09-27: "accept ADR-013, 014 and 015")
- **Date:** 2026-09-27
- **Owner:** Quality / Learning
- **Decider:** Nick
- **Contract impact:** `ConfidencePolicy` gains an optional `calibration` map per question. `Decision` gains an optional calibrated value next to the raw one. `ThresholdProposal` gains a kind `calibration`. These land with Phase 3b; nothing changes in Phase 1 code.

## Context

TypeSafe's API docs say confidence describes how the answer's probabilities are spread, not the chance the answer is right. Our bands treat it as a score to threshold and tune thresholds against labels.

A public study (AnthusAI/Jev-Calibration, checked 2026-09-27) fitted isotonic regression to Jev's confidence on 8,801 sentiment examples. Expected calibration error fell from 0.117 to 0.008, against 0.052 for Platt scaling, and isotonic matched or beat Platt with as few as 20 calibration examples. That is one task and one dataset, so it is a hypothesis to test, not a fact to rely on.

We already collect what calibration needs: audit samples per band, reviewer resolutions and app feedback, with weights, per question.

## Decision

1. **Isotonic map per question.** The effectiveness loop can fit a monotonic map from raw confidence (Choice and Score) or raw noul probability (Noul) to observed accuracy, from counted labels with their weights.
2. **Proposed, never silent.** A fit becomes a `ThresholdProposal` of kind `calibration`. It is proposed only with at least 20 counted labels for the question and only when it lowers calibration error on held-out labels. Accepting it publishes a new version, like any threshold change. Published versions stay immutable.
3. **Raw stays visible.** Runs keep the raw value and add the calibrated one. Bands read the calibrated value when a map exists. Reports show both.
4. **Thresholds re-fit with it.** Accepting a map re-runs the threshold suggester on calibrated values in the same proposal, so bands do not shift without anyone seeing it.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Raw confidence only (today) | Simple | Thresholds absorb miscalibration and need hand re-tuning when it drifts |
| Platt scaling | Two parameters | Worse in the only public study; assumes a sigmoid shape |
| Isotonic per question (chosen) | Best in the study, works with small samples, monotonic so rank order stays | Step function; needs labels near each band edge |
| One global map per model | Fewer labels needed | Questions differ; one map hides the bad ones |

## Consequences

- The eval harness already computes calibration error. Phase 3b adds a before and after view per question.
- A model upgrade resets maps to identity for the new model until a new fit passes, because a map belongs to one model's behavior.

## Rollout

Phase 3b, after the gate evaluator and threshold suggester land. Reversal: reject or roll back the version that carries the map.
