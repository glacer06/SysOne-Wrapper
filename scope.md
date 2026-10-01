# Scope
**Project:** Bandwise
**Last updated:** 2026-10-01

This file is the check against scope creep. Read it before adding anything. If a new feature is not justified by the criteria below, it is deferred. The phase plan in `docs/PLAN.md` and the ADRs in `docs/adr/` hold the detail.

---

## What this product does

- **Versioned question sets.** Choice, yes/no and score questions on System One models. Each published version is immutable, with thresholds per question.
- **Bands and actions.** A run sorts the model's confidence into High, Medium or Low. Each band maps to an action: ship, get evidence, ask a person, fall back, or escalate.
- **Receipts.** Every run returns the standard `RunResult` envelope with its cost and savings. Reports add those up per set and per org.
- **Rollout control.** Each set moves through inactive, shadow, controlled and full stages. Moves toward safety are never gated.
- **Headless parity.** The console, the `bandwise` CLI, the MCP server and agents all use one operation registry behind `/api/v1`.
- **Bandwise Gate** (ADR-021). A done-check and a risky-action gate for coding agents, as a Claude Code plugin and remote MCP connector.

---

## What this product deliberately does NOT do

- **Chat or open-ended generation.** Bandwise answers structured questions with a bounded set of answers. Generation belongs to the LLMs we escalate to.
- **Holding customer model keys in a browser or a customer tool.** Keys stay on the server (golden rule 2). The one exception is local live mode with the developer's own key (ADR-020).
- **Hard-coded thresholds or model facts.** They come from specs and the model registry (golden rule 9).
- **Selling inside ChatGPT or Claude.** Neither store allows it (ADR-021). Pricing lives on bandwise.dev.
- **Self-serve orgs before Phase 2.** The hosted app serves only the `internal` org until Phase 2 ships (ADR-020).
- **Mobile apps.** The console is a responsive web app. No native client until a paying customer needs one.

---

## Feature amendment criteria

A feature gets into scope only if all three are true:

1. **Enough people have asked.** Not one loud customer, and not a hunch: a pattern across at least 5 independent conversations or signals.
2. **The absence blocks value.** Users can't get value without it, not just "it would be nice".
3. **It fits the architecture.** It doesn't force a structural change against `architecture.md` and the accepted ADRs. If it does, the ADR comes first.

If a feature passes all three, it moves into the Linear backlog (team NSIMS, project Bandwise), and `architecture.md` is updated if needed.

---

## Pending requests (parked, not promised)

| Date | Source | Request | Notes |
|---|---|---|---|
| 2026-10-01 | Nick | ChatGPT plugin for Bandwise Gate (NSI-744) | 1 source. Planned after the Claude listing, per ADR-021 |
| 2026-10-01 | Nick | Claude connector and Claude Code plugin (NSI-743) | 1 source. First build, gated by the ADR-021 shadow bar |

---

## Last scope review

- **Reviewed on:** 2026-10-01
- **By:** Nick, with DJ
- **Result:** Bandwise Gate added (ADR-021). Brand system v1 locked (ADR-022). No features removed.
