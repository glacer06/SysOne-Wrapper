# Savings model and standard outputs

SysOne is sold on ROI. Every run reports what it cost and what it saved, and every org can see the totals without asking anyone. This file defines the math, the envelope, and the reports.

## Standard run envelope (`RunResult`)

Every run, from every surface (console, API, embed, extension, MCP, eval), returns this shape. No endpoint invents its own.

```ts
RunResult = {
  runId: string,
  setId: string,
  version: number,
  channel: "production" | "staging" | "pinned" | "draft",
  rollout: "draft" | "shadow" | "controlled" | "full" | "paused",
  modelRequested: string,
  modelResolved: string,
  answers: Record<QuestionId, JevAnswer>,          // raw typed answers, probabilities optional
  decisions: Record<QuestionId, {
    band: "high" | "medium" | "low",
    action: Action,                                // what the policy says
    effectiveAction: Action,                       // what the rollout stage allows; callers act on this
    executed: boolean,                             // whether server-side handlers fired
    value: unknown,                                // choice label, score, or boolean for noul
  }>,
  runBand: "high" | "medium" | "low",
  overallAction: Action,                           // most conservative effectiveAction across gating results
  composites?: Record<string, { value: number, band?: string }>,
  route?: string,
  cost: {
    jevInputTokens: number,
    jevCostUsd: number,
    counterfactualLlmCostUsd: number,
    savingsUsd: number,
    savingsKind: "decision" | "escalation_avoided" | "context_pruned",
    llmCallsAvoided: number,
    contextTokensPruned?: number,
    escalationCostUsd: number,                     // actual LLM spend from escalate_to_llm
    llmCallsMade: number,
    comparatorModel: string,
    counterfactualMode: "one_call" | "per_question",
    estimated: true,
    latencyMs: number,
  },
  reviewItemIds?: string[],
  warnings: string[],
}

Action = "auto" | "review" | "fallback" | "escalate_to_llm"
```

`effectiveAction` is how the rollout stage shows up on the wire. In `shadow` and `paused` it is always `fallback` (the caller keeps its existing path). In `controlled` only high-band `auto` stays `auto`; everything else becomes `review`. Callers should branch on `effectiveAction`, never on `action`.

## Price book

Prices are data, not code. Each org gets a copy of the platform defaults and can edit its own.

| Model | Input $/Mtok | Output $/Mtok | Source |
|---|---|---|---|
| Jev 1.13 | 0.042 | 0 (free) | docs.typesafe.ai/models |
| Haiku 4.5 | 1.00 | 5.00 | Every newsletter, 2026-09-23 |
| Fable 5.1 | 10.00 | 50.00 | Every newsletter, 2026-09-23 |
| Gemini 3.7 Flash | 0.75 | 3.75 | Every newsletter, 2026-09-23 |

The platform admin can update defaults. Each org picks a default comparator (Haiku 4.5 unless changed), and each set can override it.

## The three kinds of savings

### 1. Decision counterfactual (default)

What the same judgments would cost as LLM calls.

```
n              = questions_answered
llm_out_tokens = n * est_output_tokens                     // default 60 per question

// assumption "one_call" (default, conservative): one LLM call answers every question
llm_in_tokens  = jev_input_tokens

// assumption "per_question": one LLM call per question, state repeated each time
llm_in_tokens  = jev_input_tokens * n

counterfactual = (llm_in_tokens  * comparator.in
               +  llm_out_tokens * comparator.out) / 1e6
savings        = counterfactual - jev_cost - escalation_cost
```

`escalation_cost` is the actual spend on any `escalate_to_llm` calls in the run. Savings can go negative, and the ledger shows it.

The default is `one_call`, the conservative case. Orgs can switch to `per_question` if that is how they ran it before. The report always states which assumption was used.

### 2. Escalation avoided (cascades)

A set with `escalate_to_llm` on its low band only calls the LLM when Jev isn't sure. Every run that settled at the Jev layer avoided one LLM call.

```
llm_calls_avoided = 1 if no question escalated else 0
savings           = llm_calls_avoided * avg_escalation_cost - jev_cost
```

`avg_escalation_cost` is measured from the org's actual escalations when available, else estimated with the comparator.

### 3. Context pruned

A context pruner set (template from The Code's compaction example) scores items like tool calls or retrieved passages as keep or drop. The downstream LLM gets fewer input tokens.

```
context_tokens_pruned = tokens_before - tokens_after
savings               = context_tokens_pruned * downstream_model.in / 1e6 - jev_cost
```

The caller reports `tokens_before`/`tokens_after` in run metadata, or the set computes them from state when items carry token counts.

## Honesty rules

- Savings are estimates. Every report labels them as estimates and shows the assumptions (comparator, output tokens per question, calls factor).
- Never show negative savings as zero. If Jev cost more on some runs, the ledger shows it.
- Shadow runs count cost but not savings (nothing was replaced yet).
- Eval runs are excluded from savings and shown separately as cost.

## Rollups (`usage_daily`)

Keyed by `org_id, day, project_id, set_id, key_mode, source`. Columns: `runs`, `jev_input_tokens`, `jev_cost_micro_usd`, `counterfactual_micro_usd`, `savings_micro_usd`, `llm_calls_avoided`, `context_tokens_pruned`, `band_high`, `band_medium`, `band_low`, `review_created`, `review_resolved`, `p50_latency_ms`, `p95_latency_ms`.

Money is stored in micro-USD integers. Never floats.

Runs also store the raw token totals behind every estimate (`cf_input_tokens`, `cf_output_tokens`). Dashboards can then show savings against several comparators side by side and offer a "revalue at current prices" toggle without rewriting history.

## Standard admin reports

Each report is available in the org console, as CSV, and as a PDF monthly summary. The platform admin sees the same reports across all orgs.

| Report | What it answers |
|---|---|
| Usage and cost | Runs, tokens, and Jev spend by project, set, app, and day |
| Savings and ROI | Savings by kind, versus the subscription price; ROI multiple |
| Band distribution | Share of high, medium, low per set over time; drift in the mix |
| Review queue | Items created, resolved, median time to resolve, SLA breaches |
| Human agreement | Agreement between Jev decisions and reviewer resolutions, per set and band |
| Model drift | Sets on aliases whose target moved; eval deltas since the move |
| Rate headroom | Peak RPM and tokens/sec per org against its limit and the global budget |

**Portfolio view** (`/me/portfolio`): a user who is owner or admin in several orgs (Nick across SGR, Personal, Dallas) sees their savings and usage side by side. It loops over each org with that org's own tenant context. It never bypasses RLS.

**Alerts** raised from these reports: alias moved, band mix drift (PSI above 0.2 versus baseline), human agreement drop, review SLA breach, rate headroom above 80%, quota near limit, org key invalid. In-app and email, plus Slack or webhook once plugins exist.

The `SavingsCard` component in `@sysone/react` renders the org or set savings summary for embedding in customer apps.
