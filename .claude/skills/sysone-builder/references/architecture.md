# Architecture

## Packages and boundaries

```
apps/
  console/            Next.js App Router
                        app/(org)/[orgSlug]/...      tenant console (Console UI)
                        app/(platform)/platform/...  super-admin console (Console UI)
                        app/api/v1/...               public run and management API
                        app/api/stripe/webhook       billing webhooks
                        app/api/jobs/...             background job endpoints (Inngest or similar)
                        src/server/operations/       operation registry (management-api.md)
                        src/jobs/learning/           learning jobs, Phase 3 and 3b (effectiveness-loop.md)
  example-embed/      Next.js app that consumes @sysone/client + @sysone/react. E2E target.
  extension-chrome/   Phase 6. WXT, MV3.
packages/
  core/               PURE. Contracts (zod), spec compiler, stage orchestrator, confidence router,
                      composites, lints, cost + savings math, token preflight, authz matrix.
                        question-types/   one module per question type (spec-schema.md)
                        learning/         Phase 3 and 3b, pure: label selection, threshold suggester, health
  system-one-client/  The only importer of @typesafe-ai/sdk. SystemOneTransport implementations,
                      error mapping, per-surface timeouts and retry budgets, fixture record and replay,
                      model list and alias probe helpers, contract snapshots.
  llm-client/         The only importer of @anthropic-ai/sdk. LlmTransport port with a fixture transport;
                      used by Studio drafting, improve mode, opportunity drafting and escalate_to_llm.
                      Metered. Load the claude-api skill for current model IDs.
  db/                 The only importer of drizzle. Schema, RLS policies, migrations,
                      withTenant(), repositories, two-org seed.
  tenancy/            TenantContext resolution (session, app token or agent token), key vault
                      (envelope encryption), token hashing, rate limiters, quota checks.
  billing/            plans.ts, entitlements, Stripe client, webhook handlers, meter outbox.
  client/             @sysone/client. Server-side client, Next/Express proxy handlers,
                      short-lived browser tokens.
  react/              @sysone/react. Components + headless hooks. Never imports server code.
  evals/              Datasets, metrics, CLI, CI gate.
  cli/                Phase 3. @sysone/cli: management commands over /api/v1, plus
                      `sysone run --local` fixture mode (headless-and-agents.md).
  codegen/            Phase 4b. PURE. Set interface to generated files (deploy-and-codegen.md).
  client-py/          Phase 4b, behind ADR-009. Python client generated from openapi.json.
  plugin-sdk/         Phase 5. definePlugin(), InputAdapter, QuestionTemplate, ActionHandler.
  plugins-builtin/    Phase 5. Built-in adapters, templates, actions.
  mcp-server/         Phase 3 stdio, Phase 7 HTTP. Curated tools over management operations
                      (headless-and-agents.md).
  config/             tsconfig, eslint (with boundary rules), vitest presets.
plugins/
  claude-code/        Phase 7. Plugin manifest, customer skills, .mcp.json.
examples/             Sample apps that integrate SysOne (Integrations).
```

Import boundaries are enforced with `eslint-plugin-boundaries`:

- Only `system-one-client` imports `@typesafe-ai/sdk`.
- Only `llm-client` imports `@anthropic-ai/sdk`.
- Only `db` imports `drizzle-orm`. Raw `db` handles are not exported.
- Only `tenancy` touches crypto and KMS.
- `react` never imports `client` server entrypoints, `tenancy`, `db`, or `system-one-client`.
- `core` imports nothing with side effects.
- `codegen` imports only `core` contracts.
- `cli` imports `client` and `codegen` and calls `/api/v1` over HTTP.
- `mcp-server` calls `/api/v1` over HTTP only.
- Console pages under `app/(org)` and `app/(platform)` call operations, never repositories.

## Core contracts (packages/core/src/contracts)

These are frozen at the end of Phase 0 part two. Changing one needs an ADR.

```ts
Role = "owner" | "admin" | "editor" | "reviewer" | "viewer";
Scope = "run" | "sets:read" | "sets:write" | "evals:run" | "release:staging" | "release:production"
      | "runs:read" | "runs:write" | "review:read" | "review:write" | "feedback:write"
      | "usage:read" | "reports:read" | "audit:read" | "events:read" | "apps:write" | "admin:write";

TenantContext = {
  orgId: string;
  actor: { type: "user"; userId: string; role: Role }                    // console session
       | { type: "apiKey"; keyId: string; appId: string; scopes: Scope[]; setIds: string[] | null }
         // apiKey means host-app tokens only: sk_, pk_ and browser JWTs
       | { type: "agent"; tokenId: string; userId: string; role: Role; scopes: Scope[];
           setIds: string[] | null; client: "cli" | "mcp" | "extension" | "console" }
         // sa_live_ agent token; role = min(role_ceiling, current membership role), per request
       | { type: "system" };                                              // jobs, auto-demote
  plan: PlanId;                                                           // a key of packages/billing/src/plans.ts
  requestId: string;
};

RolloutStage = "inactive" | "shadow" | "controlled" | "full" | "paused";
Channel = "production" | "staging" | "pinned" | "draft";   // pointers exist for production and staging only

interface RunPorts {
  systemOne: SystemOneTransport; // (req, { apiKey, signal, timeoutMs, retry }) => SystemOneResponse
  models: ModelCatalog;          // id -> ModelProfile; resolves a moving name to its last observed versioned model
  keys: KeyResolver;             // (ctx) => { apiKey, mode: "byo" | "platform" }
  limiter: RateLimiter;          // (ctx, model, estTokens) => { ok: true } | { ok: false, retryAfterMs, reason }
  quota: QuotaGuard;             // (ctx, estTokens) => ok | QuotaExceeded
  runs: RunSink;                 // persist run, review items, label items, usage events in one transaction
  actions: ActionRegistry;       // plugin action handlers
  prices: PriceBook;             // System One and comparator prices by exact model id;
                                 // System One runs are priced by model_resolved
  llm?: LlmTransport;            // escalate_to_llm
  redactor?: Redactor;
}

runQuestionSet(
  ctx: TenantContext,
  req: RunRequest,
  resolved: { spec: QuestionSetSpec, versionId: string, channel: Channel, rollout: RolloutStage,
              experiment?: { id: string, arm: "champion" | "challenger" } },
  ports: RunPorts,
): Promise<RunResult>
```

`ConfidencePolicy` is defined in [confidence-policy.md](confidence-policy.md) and `RunResult` in [savings-model.md](savings-model.md). Store interfaces (`VersionStore`, `RunStore`, `ReviewStore`, `AuditStore`) have in-memory implementations in `core` for tests.

The other frozen contracts live next to the feature they serve:

| Contract | Defined in |
|---|---|
| `OperationDef` | [management-api.md](management-api.md) |
| Error envelope v2 | [api.md](api.md) |
| `ModelProfile` | [system-one-models.md](system-one-models.md) |
| `RunRequest`, `Condition`, `Check`, `FallbackConfig`, `QuestionTypeModule`, `SystemOneAnswer`, `SetInterface` | [spec-schema.md](spec-schema.md) |
| `Opportunity`, `DeployTarget` | [deploy-and-codegen.md](deploy-and-codegen.md) |
| `FeedbackReport`, `QualityTarget`, `SetHealth`, `ThresholdProposal` | [effectiveness-loop.md](effectiveness-loop.md) |
| `EventEnvelope` | [events.md](events.md) |

## QuestionSetSpec

```ts
QuestionSetSpec = {
  schemaVersion: 1,
  model: string,                              // versioned registry ID (pinned) or a moving name such as
                                              // jev-latest; see system-one-models.md
  input: {
    schema: JSONSchema7,                      // validates incoming state
    adapter?: { id: string, config: unknown },
    redactPaths?: string[],                   // must resolve in input.schema
    maxStateTokens?: number,
  },
  checks?: Check[],                           // code conditions evaluated before any System One call
  stages: Array<{
    id: string,
    when?: Condition,                         // grammar in spec-schema.md
    stateFrom?: "input" | { merge: { input: true, answers: QuestionId[], probabilities?: boolean } },
    questions: Record<QuestionId, QuestionDef>,
  }>,
  policies: Record<QuestionId, ConfidencePolicy>,
  composites?: Array<{
    id: string,
    kind: "weighted",
    terms: Array<{ q: QuestionId, weight: number, option?: string } | { check: string, weight: number }>,
    policy?: ConfidencePolicy,                // type "composite"
  }>,
  // Term values are normalized to 0..1: noul as-is, score as score / (levels - 1),
  // choice as probabilities[option] (option is required for a choice term), check as 0 or 1.
  // A composite has a magnitude level (levelThresholds on its 0..1 value), which picks the action,
  // and a certainty band, the minimum band of its question terms. Only band feeds runBand.
  routes?: Array<{ when: Condition, output: string }>,   // first match wins
  defaultRoute?: string,                                  // used when no route matches
  savings?: { comparatorModel?: string, estOutputTokensPerQuestion?: number, kind?: SavingsKind },
}

QuestionDef = {
  type: QuestionTypeId,                       // "noul" | "choice" | "score" in v1, closed by design;
                                              // a new type is an ADR plus one module
  instructions: Structured,
  criteria?: Structured | Record<string, Structured | null> | Structured[],
  meta: { label: string, description?: string, templateId?: string },
}

Structured = string | JsonObject | JsonArray  // sent to System One as written
SavingsKind = "decision" | "escalation_avoided" | "context_pruned"   // savings-model.md
```

`QuestionId` matches `^[a-z][a-z0-9_]{0,63}$`. The model never sees it, so the full meaning goes in `instructions`. Question, composite and check ids share one namespace, so every decision has a unique `DecisionId`.

The spec schema is strict: unknown keys fail validation. A stray `rollout` key fails with `rollout is set per channel; use rollout.change`. The rollout stage, the labeling policy and `dispatchActionsOnStaging` belong to the set and its channel pointers, not to the spec. Full grammar, merge shapes and examples are in [spec-schema.md](spec-schema.md).

Two words to keep apart: a **spec stage** is one System One call in `stages`, and a **rollout stage** is where a channel sits on the path to `full`. The docs always write "rollout stage" in full for the second.

### Spec versioning

Additive fields and new question types do not bump `schemaVersion`. A breaking change bumps it and ships a pure `migrateSpec(n to n+1)` in `core` that produces a new draft from an old spec. Published versions are never rewritten; they keep running under the schema they were published with.

## Run data flow

1. **Resolve** `(setRef, channel | @version)` through the channel pointer, which gives the version, the rollout stage and the active experiment together under one cache epoch. An `inactive` channel returns `409 set_not_live`. `slug@draft` runs the mutable draft and behaves as `shadow`. A pinned call (`slug@7`) uses the rollout stage of the caller's channel, so pinning cannot bypass a pause. Specs come from cache (see below).
2. **Authorize** with `can(ctx, "run", set)`. App and agent tokens with a set allowlist must include the set. If the caller sent `SysOne-Interface` and the version's interface major differs, return `409 interface_mismatch`.
3. **Validate** state against `input.schema`. Run the input adapter if configured.
4. **Checks:** evaluate `spec.checks` on the validated input. This is pure code with no System One call. A stage whose `when` fails is skipped, so a failed check can avoid the call entirely.
5. **Redact** per `redactPaths` and the org's PII mode.
6. **Preflight** tokens against the model profile from `ports.models`: state plus the longest question must fit `profile.limits.statePlusLongestQuestionTokens`, and each request must fit `profile.limits.requestTokens` (jev-1.13.0: 32k and 64k). For a moving name, use the profile of its last observed resolved model. Split a stage into parallel batches if needed. Fail fast with `preflight_too_large` otherwise. Warn at 80%. `options.dryRun` stops here and returns the compiled payload and token estimate, with no System One call, no run row and no usage.
7. **Limit and quota:** take tokens from the per-org, per-key, and (platform key only) global limiters, keyed by model. Check plan quota and, for agent tokens, the daily spend cap.
8. **Compile and call:** for each stage whose `when` holds, compile each question through its `QuestionTypeModule` and call `ports.systemOne` with the org's resolved key, a per-call timeout, a retry budget and an `AbortSignal` (see latency budgets below). Merge answers so later stages can read `answers.<qid>` in state (shape in [spec-schema.md](spec-schema.md)).
9. **Route:** the confidence router turns each answer into a value and band through its question type module, evaluates `relevantWhen`, computes composites (level and band) and routes (first match wins, then `defaultRoute`), and applies the rollout stage to get each `effectiveAction`. The rules are the normative table in [confidence-policy.md](confidence-policy.md#effective-action-by-rollout-stage-normative). Do not restate them elsewhere.
10. **Escalate, cost and savings:** decisions whose `effectiveAction` is `escalate_to_llm` call `ports.llm` first, so the run records the actual escalation cost. Then compute `system_one_cost_usd` from the price book by `model_resolved`, the counterfactual and savings (see [savings-model.md](savings-model.md)).
11. **Persist:** in one transaction, write the run, review items for decisions whose `effectiveAction` is `review` (kind `action`), label items chosen by the labeling policy (kind `label`; they never block the caller or change `effectiveAction`), and usage events with the resolved model. `RunSink` also records `model_requested` to `model_resolved` in `model_alias_observations` and emits `model.alias_moved` on a new pair.
12. **Act:** after commit, dispatch handlers for decisions whose `effectiveAction` is `auto`. Actions are idempotent by `runId:decisionId`. Staging runs never dispatch side-effect handlers unless the set sets `dispatchActionsOnStaging`.
13. **Challenger:** if an experiment is active, the challenger runs on a sampled share of runs after the champion responds. It is stored with its arm, books experiment cost and no savings, and never affects `effectiveAction` (see [effectiveness-loop.md](effectiveness-loop.md)).
14. **Return** the standard `RunResult` envelope.

### Latency budgets

| Surface | Budget |
|---|---|
| API run | 8 s |
| Embed | 5 s |
| Extension | 3 s |
| Eval | 30 s |

The SDK's timeout is per attempt (10,000 ms by default) with no total retry budget, and it honors `retry-after` up to 60,000 ms. So `system-one-client` passes a per-call `timeout`, `retry: { maxRetries, maxRetryAfterMs }` derived from the remaining budget, and an `AbortSignal`. This configures the SDK's retries; it is not a second retry loop. See [system-one-api-contract.md](system-one-api-contract.md).

## Managed live

- One mutable **draft** per set. Its ETag is its `spec_hash`. Publishing takes `If-Match`, validates, runs lints (including `interface.breaking`), freezes the draft into version N+1, moves the chosen channel pointer, and opens a new draft cloned from N+1. Publishing a spec identical to the version already on that channel is a no-op that returns that version.
- **Evals** are required when the production pointer is `controlled` or `full`. Otherwise they are optional per set.
- **Channels:** `release_pointers(set_id, channel)` with `production` and `staging`. Each pointer holds the version, the rollout stage and the active experiment. Rollback and promotion move a pointer. All are audited and written to `release_events`.
- **Rollout** lives on the pointer and changes only through the `rollout.change` operation, which evaluates the gates in [confidence-policy.md](confidence-policy.md).
- **Pinning:** callers can pin `slug@7`. Versioned lookups are immutable.
- Challenger sampling replaces canary; see [effectiveness-loop.md](effectiveness-loop.md).
- Every step above is an operation in the registry ([management-api.md](management-api.md)), so the console, the API, the CLI and the MCP server share one code path.

## Caching

- **Spec by version ID:** immutable, cached in-process forever.
- **Pointer `(org, set, channel) -> { versionId, rolloutStage, experimentId }`:** L1 in-process LRU (15s TTL) and L2 Redis. Publish, rollback, promotion, rollout changes and experiment changes delete the L2 key and bump an epoch key; L1 checks the epoch, so staleness is bounded by one Redis GET. The version, the rollout stage and the experiment share the epoch, so a pause takes effect within the pointer staleness bound.
- **Result cache:** off by default. A set can opt in with a TTL, keyed by `hash(versionId, state)`, and only when the model is pinned. It caches answers only; routing and the rollout stage are applied on every run.
- All cache and rate-limit keys are prefixed with `org:{orgId}:`.

## Lints (packages/core/src/lints)

Run in the editor live and again at publish. Errors block publish; warnings don't. Lints are pure and read the target model's profile: `lint(spec, profile, publishCtx?)`, where the optional publish context carries the channel's rollout stage, its current interface, whether the set has consumers and the models the org key can reach. Each lint returns `{ rule, severity, path, message }`, where `path` is a JSON Pointer into the spec. `draft/validate` and `422 spec_invalid` return the same shape in the error envelope's `details` ([api.md](api.md)).

| Rule id | Check | Level |
|---|---|---|
| `choice.missing_none` | Choice with no "none of these" style option | warning |
| `choice.too_many_options` | Choice with more than 255 options (API-wide) | error |
| `score.levels_range` | Score with fewer than 2 or more than 10 levels (API-wide) | error |
| `state_path.unknown` | Backticked state path not found in `input.schema` | error |
| `policy.thresholds_order` | Thresholds out of order (`medium > high`) | error |
| `policy.noul_order` | Noul settings break `0 < falseAt < trueAt < 1` or `falseAt + reviewMargin < trueAt - reviewMargin` | error |
| `policy.per_option_keys` | `perOption` keys are not a subset of the choice's option keys | error |
| `policy.type_mismatch` | A question has no policy, or its policy type differs from the question type | error |
| `policy.all_gating_thresholded` | Every question is gating and thresholded; suggest the top-choice preset where only the best option matters | warning |
| `stage.same_stage_dependency` | Question depends on another answer in the same stage | error |
| `stage.needless_second_call` | A stage's `when` reads an earlier answer but its `stateFrom` is `input` only; merge into the earlier stage and use `relevantWhen` | warning |
| `relevance.premise_missing` | A question with `relevantWhen` whose instructions don't state the premise | warning |
| `tokens.near_limit` | Estimated tokens above 80% of a profile limit | warning |
| `instructions.too_short` | Instructions shorter than 8 words | warning |
| `redact.path_unknown` | A `redactPaths` entry does not resolve in `input.schema` | error |
| `action.handler_unknown` | An action names a handler that is not installed and enabled for the org | error |
| `fallback.set_invalid` | A set fallback names a missing set, or a set that itself uses a set fallback | error |
| `model.unknown` | The model is not in the registry | error |
| `model.unreviewed` | The model is `unreviewed` (error at publish; allowed in the playground) | error |
| `model.not_available_to_org` | The org's TypeSafe key cannot reach the model | error |
| `model.deprecated` | The model is deprecated (error after its `retireAt`) | warning |
| `model.question_type_unsupported` | A question type is not in the profile's `questionTypes` | error |
| `model.alias_past_shadow` | A moving model would serve a channel in `controlled` or `full` | error |
| `interface.breaking` | The set has consumers, the interface has a breaking change and the major is unchanged (see [deploy-and-codegen.md](deploy-and-codegen.md)) | error |
| `privacy.hash_only_with_review` | The org stores hashes only and the set has review actions, which reviewers cannot see | warning |

`model.alias_past_shadow` replaces the old "alias with thresholds that differ from defaults" lint. Lints re-run whenever a set's model changes.

### Model weakness lints

These warnings fire only when the target model's profile lists the weakness id. jev-1.13.0 lists all of them ([system-one-models.md](system-one-models.md)). A newer model that drops a weakness stops the lint.

| Rule id | Profile weakness | Fires on | Suggest |
|---|---|---|---|
| `weakness.counting` | `counting`, `arithmetic` | "how many", "count", "total", sums | One noul per item and the sum in code |
| `weakness.date_comparison` | `date_comparison` | "before", "after", "within N days" near a date path | Extract date parts with choices; compare in code |
| `weakness.inverted_noul` | `inverted_noul` | A noul whose true criterion is worded as a negative, or a double negative | Word the true criterion positively |
| `weakness.generation` | `generation` | Instructions that ask for a value with no candidate list | A choice over candidates |
| `weakness.large_unreferenced_state` | `large_irrelevant_state` | Large top-level state fields that no backtick path references | Filter state in code or the adapter |
| `weakness.threshold_copied` | `structural_invariants` | Identical thresholds copied from a noul policy to a choice policy | Tune each question on its own labels |

## Embed kit

- **Mode A (recommended):** the host server uses `@sysone/client` with an `sk_` token; the browser only talks to the host's proxy route.
- **Mode B:** a publishable `pk_` token or a 5-minute browser JWT, with an origin allowlist, set scoping and low RPM. Mode B is run-only.
- Run components work in both modes: `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`. `ReviewQueue` and `SavingsCard` require Mode A: the host's proxy holds an `sk_` token with `review:read` or `usage:read`. Headless hooks for each. Renderers are picked by each question type module's `uiKind`. Themeable through CSS variables. Target under 15 kB gzip.
- `GET /api/v1/sets/{ref}/manifest` gives components labels and options without exposing internals.
- **Caller rule:** branch on `route` and `effectiveAction` where possible. The raw `decisions[q].value` is part of the set interface, so an app that reads it depends on the interface major.

## Background jobs

- Meter outbox push to Stripe (every minute).
- Rollups into `usage_daily` and `question_daily` (nightly).
- Retention (nightly): state and answers on separate clocks, after the learning retention copy into `dataset_cases` ([security.md](security.md)).
- Registry sync (nightly): list `/v1/models` per org key and store the reachable names; insert unseen names as `unreviewed` and alert the platform admin; probe idle aliases with a one-noul request and read the response `model` ([system-one-models.md](system-one-models.md)).
- Contract watch (nightly): diff TypeSafe's `openapi.json`, `llms.txt` and `models.md` against committed snapshots; alert and open an issue on a change.
- Webhook retries.
- Gate evaluator and auto-demote (hourly, Phase 3).
- Threshold refit (weekly, Phase 3b).
- Experiment scorer (Phase 3b).
- Model-upgrade candidates, when a model becomes stable (Phase 3b).
- Pruning: events after 30 days, idempotency keys after 24 hours, finished jobs.
- Approval expiry.
