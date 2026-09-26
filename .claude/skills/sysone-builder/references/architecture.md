# Architecture

## Packages and boundaries

```
apps/
  console/            Next.js App Router
                        (org)/[orgSlug]/...      tenant console
                        (platform)/platform/...  super-admin console
                        api/v1/...               public API (run, sets, review)
                        api/stripe/webhook       billing webhooks
                        api/jobs/...             background job endpoints (Inngest or similar)
  example-embed/      Next.js app that consumes @sysone/client + @sysone/react. E2E target.
  extension-chrome/   Phase 6. WXT, MV3.
packages/
  core/               PURE. Contracts (zod), spec compiler, stage orchestrator, confidence router,
                      composites, lints, cost + savings math, token preflight, authz matrix.
  jev-client/         The only importer of @typesafe-ai/sdk. JevTransport implementations,
                      error mapping, fixture record/replay, /v1/models drift check.
  llm-client/         The only importer of @anthropic-ai/sdk. Definition Studio drafting and the
                      escalate_to_llm action. Metered. Load the claude-api skill for current model IDs.
  db/                 The only importer of drizzle. Schema, RLS policies, migrations,
                      withTenant(), repositories, two-org seed.
  tenancy/            TenantContext resolution (session or API key), key vault (envelope
                      encryption), API key hashing, rate limiters, quota checks.
  billing/            plans.ts, entitlements, Stripe client, webhook handlers, meter outbox.
  client/             @sysone/client. Server-side client, Next/Express proxy handlers,
                      short-lived browser tokens.
  react/              @sysone/react. Components + headless hooks. Never imports server code.
  evals/              Datasets, metrics, CLI, CI gate.
  plugin-sdk/         Phase 5. definePlugin(), InputAdapter, QuestionTemplate, ActionHandler.
  plugins-builtin/    Phase 5. Built-in adapters, templates, actions.
  mcp-server/         Phase 7. list_question_sets, get_question_set_manifest, run_question_set.
  config/             tsconfig, eslint (with boundary rules), vitest presets.
plugins/
  claude-code/        Phase 7. Plugin manifest, skills, .mcp.json.
```

Import boundaries are enforced with `eslint-plugin-boundaries`:

- Only `jev-client` imports `@typesafe-ai/sdk`.
- Only `llm-client` imports `@anthropic-ai/sdk`.
- Only `db` imports `drizzle-orm`. Raw `db` handles are not exported.
- Only `tenancy` touches crypto and KMS.
- `react` never imports `client` server entrypoints, `tenancy`, `db`, or `jev-client`.
- `core` imports nothing with side effects.

## Core contracts (packages/core/src/contracts)

These are frozen at the end of Phase 0 part two. Changing one needs an ADR.

```ts
TenantContext = {
  orgId: string;
  actor: { type: "user"; userId: string; role: Role }
       | { type: "apiKey"; keyId: string; appId: string; scopes: Scope[]; setIds: string[] | null }
       | { type: "system" };
  plan: PlanId;
  requestId: string;
};

interface RunPorts {
  jev: JevTransport;        // (req, { apiKey, signal }) => JevResponse
  keys: KeyResolver;        // (ctx) => { apiKey, mode: "byo" | "platform" }
  limiter: RateLimiter;     // (ctx, estTokens) => { ok: true } | { ok: false, retryAfterMs, reason }
  quota: QuotaGuard;        // (ctx, estTokens) => ok | QuotaExceeded
  runs: RunSink;            // persist run, review items, usage events in one transaction
  actions: ActionRegistry;  // plugin action handlers
  prices: PriceBook;        // Jev + comparator LLM prices for savings
  redactor?: Redactor;
}

runQuestionSet(ctx, { spec, versionId, state, source, channel }, ports): Promise<RunResult>
```

`QuestionSetSpec`, `ConfidencePolicy`, and `RunResult` are defined in `confidence-policy.md` and `savings-model.md`. Store interfaces (`VersionStore`, `RunStore`, `ReviewStore`, `AuditStore`) have in-memory implementations in `core` for tests.

## QuestionSetSpec

```ts
QuestionSetSpec = {
  schemaVersion: 1,
  model: string,                              // "jev-1.13.0" or an alias (lint blocks aliases once tuned)
  input: {
    schema: JSONSchema7,                      // validates incoming state
    adapter?: { id: string, config: unknown },
    redactPaths?: string[],
    maxStateTokens?: number,
  },
  stages: Array<{
    id: string,
    when?: Condition,                         // safe DSL on earlier answers: { q: "intent", eq: "refund" }
    stateFrom?: "input" | { merge: { input: true, answers: string[] } },
    questions: Record<QuestionId, QuestionDef>,
  }>,
  policies: Record<QuestionId, ConfidencePolicy>,
  composites?: Array<{ id: string, kind: "weighted", terms: Array<{ q: QuestionId, weight: number }>, policy?: ConfidencePolicy }>,
  // Composite inputs are normalized to 0..1: noul as-is, score as score / (levels - 1).
  // Choice answers can't feed a composite directly; map them with a route or a noul instead.
  // A composite's policy bands apply to its 0..1 value, not to confidence.
  routes?: Array<{ when: Condition, output: string }>,
  savings?: { comparatorModel?: string, estOutputTokensPerQuestion?: number, kind?: SavingsKind },
  rollout: "draft" | "shadow" | "controlled" | "full" | "paused",
}

QuestionDef = {
  type: "noul" | "choice" | "score",
  instructions: Structured,                   // string | object | array
  criteria?: Structured | Record<string, Structured | null> | Structured[],
  meta: { label: string, description?: string, templateId?: string },
}
```

`QuestionId` matches `^[a-z][a-z0-9_]{0,63}$`. It is never sent to Jev.

## Run data flow

1. **Resolve** `(setRef, channel | @version)` to a version. Specs come from cache (see below).
2. **Authorize** with `can(ctx, "run", set)`. API keys must include the set in their allowlist.
3. **Validate** state against `input.schema`. Run the input adapter if configured.
4. **Redact** per `redactPaths` and the org's PII mode.
5. **Preflight** tokens: state plus the longest question must fit 32k; each request must fit 64k. Split a stage into parallel batches if needed. Fail fast with `preflight_too_large` otherwise. Warn at 80%.
6. **Limit and quota:** take tokens from the per-org, per-key, and (platform key only) global limiters. Check plan quota.
7. **Compile and call:** for each stage whose `when` holds, compile to a Jev payload and call `ports.jev` with the org's resolved key. Merge answers so later stages can reference `answers.<qid>` in state.
8. **Route:** confidence router turns each answer into a band and action. Compute composites and routes. Apply the rollout stage to get `effectiveAction` (shadow and paused force `fallback`; controlled lets only high-band `auto` through).
9. **Cost and savings:** compute `jev_cost_usd`, the counterfactual, and savings (see `savings-model.md`).
10. **Record:** in one transaction, write the run, review items for `review` actions, usage events, and nothing else.
11. **Act:** dispatch `auto` actions through the registry after commit. Actions are idempotent by `runId:questionId`.
12. **Return** the standard `RunResult` envelope.

## Managed live

- One mutable **draft** per set. Publishing validates, lints, optionally requires a passing eval, freezes the draft into version N+1, moves the chosen channel pointer, and opens a new draft cloned from N+1.
- **Channels:** `release_pointers(set_id, channel)` with `production` and `staging`. Rollback and promotion move a pointer. Both are audited and written to `release_events`.
- **Pinning:** callers can pin `slug@7`. Versioned lookups are immutable.
- **Canary (later):** `rollout = { versionId, percent }` with sticky hashing on `state_hash`.

## Caching

- **Spec by version ID:** immutable, cached in-process forever.
- **Pointer `(org, set, channel) -> versionId`:** L1 in-process LRU (15s TTL) and L2 Redis. Publish and rollback delete the L2 key and bump an epoch key; L1 checks the epoch, so staleness is bounded by one Redis GET.
- **Result cache:** off by default. A set can opt in with a TTL, keyed by `hash(versionId, state)`, and only when the model is pinned.
- All cache and rate-limit keys are prefixed with `org:{orgId}:`.

## Lints (packages/core/src/lints)

Run in the editor live and again at publish. Errors block publish; warnings don't.

| Lint | Level |
|---|---|
| Choice with no "none of these" style option | warning |
| Model is an alias and thresholds differ from defaults | error |
| Choice with more than 255 options | error |
| Score with fewer than 2 or more than 10 levels | error |
| Backticked state path not found in `input.schema` | error |
| Policy thresholds out of order (`medium > high`) | error |
| Question depends on another answer in the same stage | error |
| Estimated tokens above 80% of a limit | warning |
| Instructions shorter than 8 words | warning |

## Embed kit

- **Mode A (recommended):** host server uses `@sysone/client` with an `sk_` key; the browser only talks to the host's proxy route.
- **Mode B:** publishable `pk_` key with an origin allowlist, set scoping, low RPM, and no access to runs or review items.
- Components: `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`, `ReviewQueue`, `SavingsCard`. Headless hooks for each. Themeable through CSS variables. Target under 15 kB gzip.
- `GET /api/v1/sets/{ref}/manifest` gives components labels and options without exposing internals.

## Background jobs

- Meter outbox push to Stripe (every minute).
- Usage and savings rollup into `usage_daily` (nightly).
- Retention purge (nightly).
- Model drift check against `GET /v1/models` (nightly).
- Webhook retries.
