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
                      provider routes (TypeSafe direct and OpenRouter, ADR-011), error mapping,
                      per-surface timeouts and retry budgets, fixture record and replay,
                      model list and alias probe helpers, contract snapshots.
  llm-client/         The only importer of @anthropic-ai/sdk. LlmTransport port with a fixture transport;
                      used by Studio drafting, improve mode, opportunity drafting and escalate_to_llm.
                      Metered. Load the claude-api skill for current model IDs. ADR-011 (proposed)
                      adds an optional OpenRouter chat route for escalations, including typesafe/jev-router.
  db/                 The only importer of drizzle. Schema, RLS policies, migrations,
                      withTenant(), repositories, two-org seed.
  tenancy/            TenantContext resolution (Better Auth session, app token or agent token), key vault
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
- Only `llm-client` imports `@anthropic-ai/sdk`. Its fixture subpath `@sysone/llm-client/fixture` (`packages/llm-client/src/fixture/**`) never does; the exclusive-externals rule covers it as its own element.
- Only `db` imports `drizzle-orm`. Raw `db` handles are not exported.
- Only `tenancy` touches crypto and KMS.
- `react` never imports `client` server entrypoints, `tenancy`, `db`, or `system-one-client`.
- `core` imports nothing with side effects.
- `codegen` imports only `core` contracts.
- `cli` imports `client` and `codegen` and calls `/api/v1` over HTTP. Only `packages/cli/src/local/**` may also import `core` and the fixture subpath `@sysone/system-one-client/fixture`, never the SDK transport. That folder backs `sysone run --local` and is loaded through a dynamic import, so the published package keeps `core` and `system-one-client` as optional peer dependencies. A boundary-lint fixture test (`packages/cli/src/local/__fixtures__/bad-sdk-import.ts`) covers this exception.
- `mcp-server` calls `/api/v1` over HTTP only.
- Console pages under `app/(org)` and `app/(platform)` call operations, never repositories.

## Core contracts (packages/core/src/contracts)

These are frozen at the end of Phase 0 part two. Changing one needs an ADR.

```ts
Role = "owner" | "admin" | "editor" | "reviewer" | "viewer";
Scope = "run" | "sets:read" | "sets:write" | "evals:run" | "release:staging" | "release:production"
      | "runs:read" | "runs:write" | "review:read" | "review:write" | "feedback:write"
      | "usage:read" | "reports:read" | "audit:read" | "events:read" | "apps:write" | "admin:write";

Client = "console" | "api" | "cli" | "mcp" | "extension" | "job";
  // one union for TenantContext.client, EventEnvelope.actor.client and audit_log.client
AgentClient = "cli" | "mcp" | "extension" | "console";                   // agent_tokens.client, a subset of Client

PlanId = string;
  // ^[a-z][a-z0-9_]{0,31}$, defined in core contracts. packages/billing/src/plans.ts is typed
  // Record<PlanId, Plan> and checked at startup. The plan ids themselves are chosen in ADR-006.

TenantContext = {
  orgId: string;
  actor: { type: "user"; userId: string; role: Role;                     // console session
           platformRole: "superadmin" | null;                            // users.platform_role
           impersonatorId: string | null }                               // set during platform impersonation
       | { type: "apiKey"; keyId: string; appId: string;
           tokenKind: "secret" | "publishable" | "browser";              // sk_, pk_ or a browser JWT
           mode: "live" | "test";                                         // slug@draft needs test (sk_test_)
           channel: "production" | "staging";                             // the token's bound channel
           scopes: Scope[]; setIds: string[] | null;
           origin: string | null }                                        // checked Origin; pk_ and browser only
         // apiKey means host-app tokens only. A browser JWT carries the keyId, mode and channel
         // of the sk_ token that minted it, and is run-only.
       | { type: "agent"; tokenId: string; userId: string; role: Role; scopes: Scope[];
           setIds: string[] | null; client: AgentClient }
         // sa_live_ agent token; role = min(role_ceiling, current membership role), per request
       | { type: "system" };                                              // jobs, auto-demote
  client: Client;          // the surface of this request: "console" for Server Actions, "api" for app tokens
                           // and cookie calls to /api/v1, the token's client for agent tokens, "job" for system
  plan: PlanId;
  requestId: string;
};

RolloutStage = "inactive" | "shadow" | "controlled" | "full" | "paused";
Channel = "production" | "staging" | "pinned" | "draft";   // pointers exist for production and staging only

interface RunPorts {              // signatures in "Ports" below
  systemOne: SystemOneTransport; // one System One request, on the provider the run settings name
  models: ModelCatalog;          // id -> ModelProfile; resolves a moving name to its last observed versioned model;
                                 // provider routes and effective limits (ADR-011)
  keys: KeyResolver;             // the org's System One key for one provider, with key mode
  limiter: RateLimiter;          // per-org, per-key and global limiters, keyed by model
  quota: QuotaGuard;             // plan quota and the agent token's daily spend cap
  runs: RunSink;                 // persist run, review items, label items, usage events in one transaction
  actions: ActionRegistry;       // plugin action handlers
  prices: PriceBook;             // System One and comparator prices by exact model id;
                                 // System One runs are priced by model_resolved
  clock: () => number;           // epoch ms; latencyMs and timestamps come from here, never Date.now()
  newId: () => string;           // uuidv7 for runId; tests inject a fixed sequence
  llm?: LlmTransport;            // escalate_to_llm
  redactor?: Redactor;
  linkedRun?: LinkedRunPort;     // `set` fallbacks; missing: the decision keeps its value and the run
                                 // gets the fallback_set_failed warning
}

runQuestionSet(
  ctx: TenantContext,
  req: RunRequest,
  resolved: ResolvedRun,
  ports: RunPorts,
  control: { signal: AbortSignal, budgetMs: number },   // RunControl
): Promise<RunResult>
  // Returns a RunResult for every run that got a runId, including failed ones (status other than
  // "ok", with `error`). Throws only before a run row exists (invalid state, inactive channel).

ResolvedRun = {                        // what the pointer resolver hands over; core never reads a store
  spec: QuestionSetSpec, setId: string,
  version: number,                     // the draft row's number for slug@draft
  versionId: string, interfaceMajor: number, interfaceHash: string,
  channel: Channel, rollout: RolloutStage,
  experiment?: { id: string, arm: "champion" | "challenger" },
  settings: {
    dispatchActionsOnStaging: boolean, // question_sets.dispatch_actions_on_staging
    storageMode: StorageMode,          // question_sets.storage_mode; hash_only makes RunSink state null
    piiMode: PiiMode,                  // organizations.pii_mode, passed to the Redactor
    defaultComparatorModel: string,    // the org default comparator
    avgEscalationCostMicroUsd: number | null,   // null when the org has no escalations yet
    systemOneProvider: "typesafe" | "openrouter",
      // question_sets.system_one_provider when set, else organizations.default_system_one_provider (ADR-011)
  },
}

LinkedRunPort = (setRef: string, state: unknown,
                 opts: { channel: "production" | "staging", parentRunId: string, signal: AbortSignal })
  => Promise<RunResult>
  // runs another set on the caller's original state before the parent is persisted; the linked run
  // is stored with runs.parent_run_id and the parent decision gets fallbackRunId
```

`control.budgetMs` is usually `latencyBudgetMs(req.source)`. `LATENCY_BUDGET_MS` and `RUN_SOURCE_SURFACE` in `ports.ts` hold the table in [Latency budgets](#latency-budgets); console, playground, CLI and MCP runs use the 8 s API budget. Core measures the budget with `ports.clock`.

`ConfidencePolicy` is defined in [confidence-policy.md](confidence-policy.md), `RunResult` in [savings-model.md](savings-model.md), and `RunRequest` and `SystemOneRequest` in [spec-schema.md](spec-schema.md). Core has no clock, id source or randomness of its own. Time and ids come from `RunPorts`, and every function that samples (label selection, challenger sampling) takes `rand: () => number`, so tests are deterministic.

### Ports

Ports and store interfaces are TypeScript interfaces, not zod schemas. Their payloads are zod types in `packages/core/src/contracts`, so fixtures and mocks validate against them. Each has an in-memory or fixture implementation for tests: the stores and most ports in `core`, `FixtureTransport` in `system-one-client` and the fixture `LlmTransport` in `llm-client`.

```ts
SystemOneQuestion = {                     // one entry of SystemOneRequest.questions
  type: QuestionTypeId,
  instructions: Structured,
  criteria?: Structured | Record<string, Structured | null> | Structured[],
}

SystemOneTransport = {
  call(req: SystemOneRequest, opts: {
    provider: "typesafe" | "openrouter",   // picks the SDK baseURL; must match the key's provider
    apiKey: string, signal: AbortSignal, timeoutMs: number,
    retry: { maxRetries: number, maxRetryAfterMs: number },   // configures the SDK's retries
  }): Promise<{ response: SystemOneResponse, requestId: string | null }>,
    // requestId: x-typesafe-request-id, else the response `id` (OpenRouter's generation id)
}                                          // throws a TransportError (below)

TransportError = Error & { code: ErrorCode | "client_aborted" | "llm_unavailable" | "llm_invalid_reply",
                           retryable: boolean, requestId: string | null }
  // What SystemOneTransport and LlmTransport throw. system-one-client maps SDK errors to the
  // system_one_* codes (system-one-api-contract.md), llm-client maps provider errors to llm_*, and
  // both map an abort to client_aborted. The three extra codes are internal and never reach a
  // caller. Core narrows with isTransportError(e), a brand check plus zod, never instanceof, so an
  // error thrown by another copy of the module still matches. Core never reads the message.

ModelCatalog = {
  get(id: string): Promise<ModelProfile | null>,
  effective(name: string, provider: "typesafe" | "openrouter"): Promise<{
    profile: ModelProfile | null, pinned: boolean, resolvedId: string | null,
    provider: "typesafe" | "openrouter",
    providerModelId: string | null,        // the id sent on this provider; null when it has no route
    limits: ModelLimits | null,            // profile limits tightened by the route's; preflight reads these
  }>,
    // pinned only for kind "versioned" and, off TypeSafe, a route row with pinned: true;
    // for a moving name, the profile of its last observed resolved model
  routes(provider: "typesafe" | "openrouter"): Promise<ModelRoute[]>,   // empty for typesafe
}

KeyResolver = (ctx: TenantContext, provider: "typesafe" | "openrouter")
  => Promise<{ apiKey: string, mode: "byo" | "platform", provider: "typesafe" | "openrouter" }>
  // reads org_system_one_keys for that provider; never hands a key to another provider

RateLimiter = (ctx: TenantContext, model: string, estTokens: number, bucket: "run" | "eval")
  => Promise<{ ok: true } | { ok: false, retryAfterMs: number, reason: "org" | "key" | "global" | "eval" }>

QuotaGuard = (ctx: TenantContext, model: string, estTokens: number)
  => Promise<{ ok: true } | { ok: false, code: "quota_exceeded" | "token_budget_exceeded" }>

RunSink = {
  persist(ctx: TenantContext, record: {
    result: RunResult,
    request: RunRequest,                  // externalRef, source, metadata
    state: unknown | null,                // as stored: redacted per pii_mode, null for hash-only sets
    stateHash: string,
    stages: Array<{ id: string, skipped: boolean, inputTokens: number, outputTokens: number,
                    latencyMs: number, typesafeRequestId: string | null }>,
      // per-stage totals over the stage's calls, one per spec stage in order; they must match the
      // ids, skipped flags and token totals of result.stages. Input for usage_events. runs.stages
      // stores result.stages, not these rows.
    keyMode: "byo" | "platform",          // runs.key_mode, from the KeyResolver call the run made
    provider: "typesafe" | "openrouter",  // runs.system_one_provider
    parentRunId: string | null,           // runs.parent_run_id, set on a linked run from a `set` fallback
  }): Promise<{ reviewItemIds: string[], labelItemIds: string[] }>,
}
  // runs.error_code is result.error?.code; there is no separate field.
  // One transaction: the run row, action review items, label items, usage events and the
  // model_alias_observations update. The implementation picks label items itself by calling
  // core/learning selectForLabeling with its day counters and an injected rand.

ActionRegistry = {
  isEnabled(orgId: string, handlerId: string): Promise<boolean>,
  enqueue(job: { runId: string, decisionId: DecisionId, handlerId: string, config: unknown }): Promise<void>,
    // idempotent by runId:decisionId; dispatched after commit
}

PriceBook = {
  get(orgId: string, modelId: string, provider?: "typesafe" | "openrouter"):
    Promise<{ inputPerMtokMicroUsd: number, outputPerMtokMicroUsd: number } | null>,
}                                          // org row first, then the platform default; exact model id only;
                                           // a row for the provider wins over a provider-independent one.
                                           // A provider-reported usage.cost wins over the price book.

LlmTransport = {
  complete(req: { model: string, system: string, prompt: string, maxOutputTokens: number, signal: AbortSignal }):
    Promise<{ text: string, model: string, inputTokens: number, outputTokens: number }>,
}

PiiMode = "off" | "redact_logs" | "redact_logs_and_input"
Redactor = (state: unknown, paths: string[], piiMode: PiiMode) => unknown   // pure; returns a redacted copy
```

### Store interfaces

Store methods take the `TenantContext` and run inside `withTenant`, in the caller's transaction. The exception is `AuditStore.appendOrgLess`, which takes an `OrgLessContext`. `packages/db` implements them with repositories. `Page<T> = { data: T[], nextCursor: string | null }`, and `PageReq = { limit: number, cursor: string | null }`. Row types (`VersionRecord`, `Pointer`, `RunRecord`, `ReviewItem`, `AuditRow`, `Approval`) are the zod shapes of the tables in [data-model.md](data-model.md).

```ts
SetStore = {
  resolveRef(ctx, ref: string): Promise<{ set: SetRecord, selector: VersionSelector } | null>,
    // ref is id, slug, slug@7 or slug@draft (parseSetRef, pure, in core); null is a 404
}
VersionSelector = { kind: "channel" } | { kind: "draft" } | { kind: "version", version: number }

VersionStore = {
  getDraft(ctx, setId): Promise<{ versionId: string, spec: QuestionSetSpec, etag: string }>,
  putDraft(ctx, setId, spec: QuestionSetSpec, ifMatch: string): Promise<{ etag: string }>,   // 412 on mismatch
  getVersion(ctx, setId, n: number): Promise<VersionRecord | null>,
  getVersionById(ctx, versionId): Promise<VersionRecord | null>,
  getByChannel(ctx, setId, channel: "production" | "staging"): Promise<{ pointer: Pointer, version: VersionRecord } | null>,
  listVersions(ctx, setId, page: PageReq): Promise<Page<VersionRecord>>,
  publish(ctx, input: { setId, ifMatch: string, changelog: string, interfaceMajor: number,
                        interfaceHash: string, source: string, sourceRef: string | null }): Promise<VersionRecord>,
    // freezes the draft into N+1 and opens a new draft; moves no pointer
  movePointer(ctx, input: { setId, channel, toVersionId: string, kind: ReleaseKind, reason: string | null,
                            approvalId: string | null }): Promise<Pointer>,
    // creates the pointer at "inactive" when none exists; writes release_events, with approval_id
    // set when an agent operation ran under an approval
  setRolloutStage(ctx, input: { setId, channel, to: RolloutStage, kind: "rollout_change" | "auto_demote",
                                reason: string, approvalId: string | null }): Promise<Pointer>,
  setActiveExperiment(ctx, input: { setId, channel, experimentId: string | null }): Promise<Pointer>,
}

RunStore = {
  get(ctx, runId): Promise<RunRecord | null>,
  list(ctx, filter: { setId?, version?, channel?, source?, status?, band?, action?, from?, to? }, page: PageReq):
    Promise<Page<RunRecord>>,
  findByExternalRef(ctx, externalRef: string, setId?: string): Promise<RunRecord | null>,   // feedback matching
}                                          // runs are written only by RunSink

ReviewStore = {
  list(ctx, filter: { setId?, kind?, status?, assigneeId? }, page: PageReq): Promise<Page<ReviewItem>>,
  get(ctx, id): Promise<ReviewItem | null>,
  assign(ctx, id, userId: string): Promise<void>,
  resolve(ctx, id, input: { resolution: unknown, addToDataset: boolean, pendingConfirmation: boolean }): Promise<void>,
  confirm(ctx, id, input: { resolution?: unknown }): Promise<void>,   // sets confirmed_by_user_id and confirmed_at
  dismiss(ctx, id, reason: string): Promise<void>,
  addFeedback(ctx, rows: FeedbackReport[]): Promise<Array<{ status: "created" | "duplicate", feedbackId: string }>>,
    // run_feedback rows; idempotent per item key
}

AuditStore = {
  append(ctx, row: { action: string, targetType: string, targetId: string, diff: unknown,
                     approvalId: string | null }): Promise<void>,   // actor, client and role come from ctx
  appendOrgLess(ctx: OrgLessContext, row: same as append): Promise<void>,
    // an org_id null row for org.create and the platform_* operations, through the audited platform path
  list(ctx, filter: { action?, actorUserId?, actorTokenId?, from?, to? }, page: PageReq): Promise<Page<AuditRow>>,
}                                          // append-only: no update or delete method exists

ApprovalStore = {
  findReusable(ctx, input: { tokenId: string, opId: string, inputHash: string }): Promise<Approval | null>,
    // pending, or approved or executed in the last 24 hours
  create(ctx, input: { opId: string, input: unknown, inputHash: string, ifMatch: string | null,
                       reason: string, expiresAt: string }): Promise<Approval>,
  get(ctx, id): Promise<Approval | null>,
  listPending(ctx, filter: { tokenId?: string, decidableByRole?: Role }, page: PageReq): Promise<Page<Approval>>,
  decide(ctx, id, decision: "approved" | "rejected"): Promise<Approval>,
  recordResult(ctx, id, result: { ok: true, response: unknown } | { ok: false, error: unknown }): Promise<void>,
    // sets status "executed" and stores the response, or the error when the re-check stopped it
  expireDue(now: number): Promise<number>,   // system job
}

EventStore = {
  append(ctx, events: Array<{ type: EventType, subject: { type: string, id: string }, data: unknown }>): Promise<void>,
  list(ctx, q: { after: string | null, types?: EventType[], limit: number }):
    Promise<{ events: EventEnvelope[], cursor: string | null, gap: boolean }>,   // only events older than 5 s
  prune(before: number): Promise<number>,
}

IdempotencyStore = {
  lookup(ctx, actorKey: string, key: string):
    Promise<{ opId: string, requestHash: string, status: number, response: unknown } | null>,
  save(ctx, actorKey: string, key: string, entry: { opId: string, requestHash: string,
                                                    status: number, response: unknown }): Promise<void>,
  prune(before: number): Promise<number>,
}
```

**Org-less calls.** `org.create` (any signed-in user, even one with no membership) and the `platform_*` operations run without an org. Their handlers receive an `OrgLessContext`: `{ orgId: null, actor: { type: "user", userId, platformRole }, client: "console" | "api", requestId }`. There is no role and no impersonator. `OperationContext` is `TenantContext | OrgLessContext`, and `OperationDef` takes it as a third generic `C`. `runsWithoutOrg()`, `OrgLessOperationId` and `OperationContextFor<Id>` in the operations contract name those rows. `runOperation` rejects an org-less context on any other operation with 404 `not_found` ([management-api.md](management-api.md)).

`ReleaseKind` is the `release_events.kind` union in [data-model.md](data-model.md). Operations in [management-api.md](management-api.md) compose these stores; for example `set.publish` calls `VersionStore.publish`, then `movePointer` or `setActiveExperiment` under the pointer rule in [Managed live](#managed-live).

The other frozen contracts live next to the feature they serve:

| Contract | Defined in |
|---|---|
| `OperationDef` | [management-api.md](management-api.md) |
| Error envelope v2 | [api.md](api.md) |
| `ModelProfile`, `ModelRoute` (ADR-011) | [system-one-models.md](system-one-models.md) |
| `RunRequest`, `RunDryRunResult`, `SystemOneRequest`, `Condition`, `Check`, `FallbackConfig`, `QuestionTypeModule`, `SystemOneAnswer`, `SystemOneResponse`, `SetInterface` | [spec-schema.md](spec-schema.md) |
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
  onUnavailable?: "fallback" | "review" | "escalate_to_llm",  // outage rule (ADR-012); default review (Amendment 1), never auto
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
6. **Preflight** tokens against the effective limits from `ports.models.effective(name, settings.systemOneProvider)`: the profile's limits tightened by the provider's route row (ADR-011). State plus the longest question must fit `statePlusLongestQuestionTokens`, and each request must fit `requestTokens` (jev-1.13.0 on TypeSafe: 32k and 64k; on OpenRouter: 32k and 32k). For a moving name, use the profile of its last observed resolved model. Split a stage into parallel batches if needed. Fail fast with `preflight_too_large` otherwise. Warn at 80%. `options.dryRun` stops here and returns the compiled payload and token estimate, with no System One call, no run row and no usage.
7. **Limit and quota:** take tokens from the per-org, per-key, and (platform key only) global limiters, keyed by model. Check plan quota and, for agent tokens, the daily spend cap.
8. **Compile and call:** for each stage whose `when` holds, compile each question through its `QuestionTypeModule`, set `model` to the effective `providerModelId`, and call `ports.systemOne` with the provider and the org's key for that provider, a per-call timeout, a retry budget and an `AbortSignal` (see latency budgets below). Merge answers so later stages can read `answers.<qid>` in state (shape in [spec-schema.md](spec-schema.md)).
9. **Route:** the confidence router turns each answer into a value and band through its question type module, evaluates `relevantWhen`, computes composites (level and band) and routes (first match wins, then `defaultRoute`), and applies the rollout stage to get each `effectiveAction`. The rules are the normative table in [confidence-policy.md](confidence-policy.md#effective-action-by-rollout-stage-normative). Do not restate them elsewhere.
10. **Escalate, cost and savings:** decisions whose `effectiveAction` is `escalate_to_llm` call `ports.llm` first, so the run records the actual escalation cost. Then compute `system_one_cost_usd` from the price book by `model_resolved`, the counterfactual and savings (see [savings-model.md](savings-model.md)).
11. **Persist:** in one transaction, write the run, review items for decisions whose `effectiveAction` is `review` (kind `action`), label items chosen by the labeling policy (kind `label`; they never block the caller or change `effectiveAction`), and usage events with the resolved model. The `RunSink` implementation picks label items by calling `selectForLabeling` from `core/learning` with its day counters and an injected `rand` ([effectiveness-loop.md](effectiveness-loop.md)). `RunSink` also records `model_requested` to `model_resolved` in `model_alias_observations` and emits `model.alias_moved` on a new pair.
12. **Act:** after commit, dispatch handlers for decisions whose `effectiveAction` is `auto`. Actions are idempotent by `runId:decisionId`. Staging runs never dispatch side-effect handlers unless the set sets `dispatchActionsOnStaging`.
13. **Return** the standard `RunResult` envelope.
14. **Challenger (not part of `runQuestionSet`):** the console run service owns it. After the champion's `RunResult` returns, and only when the pointer has an active experiment, it calls `sampleChallenger(experiment, rand: () => number): boolean` from `core/learning`. On `true` it calls `runQuestionSet` again, off the latency path, with the challenger's spec and `resolved.experiment = { id, arm: "challenger" }`. That run is stored with its arm, books experiment cost and no savings, dispatches no actions, creates no action review items and never affects the champion's `effectiveAction` ([effectiveness-loop.md](effectiveness-loop.md)). The champion's own run was resolved in step 1 with `arm: "champion"`.

### Latency budgets

| Surface | Budget |
|---|---|
| API run | 8 s |
| Embed | 5 s |
| Extension | 3 s |
| Eval | 30 s |

The SDK's timeout is per attempt (10,000 ms by default) with no total retry budget, and it honors `retry-after` up to 60,000 ms. So `system-one-client` passes a per-call `timeout`, `retry: { maxRetries, maxRetryAfterMs }` derived from the remaining budget, and an `AbortSignal`. This configures the SDK's retries; it is not a second retry loop. See [system-one-api-contract.md](system-one-api-contract.md).

## System One providers and transports

Two choices decide how a System One call leaves the server. They are separate.

**Transport mechanism** (`SYSTEM_ONE_TRANSPORT`, per deployment): `sdk` sends real requests through `@typesafe-ai/sdk`. `fixture` replays recorded responses and never touches the network. Unit tests, CI and local dev without a key use `fixture`. The value never changes per org.

**Provider** (ADR-011, proposed, per org and per set): who serves the call.

| Provider | Base URL passed to the SDK | Key | Model ids sent |
|---|---|---|---|
| `typesafe` | `https://api.typesafe.ai` | a TypeSafe key | registry ids as is (`jev-1.13.0`, `jev-latest`) |
| `openrouter` | `https://openrouter.ai/api` | an OpenRouter key | the route row's `providerModelId` (`typesafe/jev-1.13`, `~typesafe/jev-latest`) |

- The org picks `organizations.default_system_one_provider` (default `typesafe`). A set may override it with `question_sets.system_one_provider` (null means the org default). The pointer resolver puts the result in `ResolvedRun.settings.systemOneProvider`, so one run never mixes providers.
- `KeyResolver(ctx, provider)` returns the org's key for that provider from `org_system_one_keys`. In platform key mode it returns the platform key for that provider (`TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`). A missing key fails the run with `system_one_auth`; it never falls over to the other provider, because that would change the model build, the limits and who bills the org.
- `system-one-client` always passes `baseURL` from `SYSTEM_ONE_PROVIDER_BASE_URLS` in core. The SDK would otherwise read `TYPESAFE_BASE_URL` from the environment, and an env var must never redirect an org key.
- Preflight, pinning and pricing read the provider's route (`ModelCatalog.effective(name, provider)`). Changing a set's provider re-runs the model lints, like changing its model.
- Fixtures are recorded per provider. `pnpm fixtures:record --provider openrouter` and `pnpm smoke --provider openrouter` need `OPENROUTER_API_KEY`.

**LLM routes** (`llm-client`). Escalations, Studio drafting, improve mode and opportunity drafting go through `LlmTransport`. The default route is Anthropic through `@anthropic-ai/sdk`. ADR-011 proposes a second, optional route: OpenRouter's OpenAI-compatible chat endpoint over plain `fetch`, used only for `escalate_to_llm` when an `EscalationConfig.model` names an OpenRouter model id. That includes `typesafe/jev-router`, a free OpenRouter model that uses Jev to pick an LLM and a reasoning effort per request. It is an LLM router, not a System One endpoint, so it never goes through `SystemOneTransport`, and its spend is LLM spend ([savings-model.md](savings-model.md)). The code is built: `createLlmTransport({ anthropic, openrouter? })` returns a `RoutedLlmTransport` that sends `vendor/model` ids to OpenRouter only when `openrouter.enabled` is true. Until ADR-011 is accepted, deployments leave it off, so an OpenRouter id fails as `llm_unavailable` and the escalation falls back to review. `LlmCompletion` has no cost field yet, so OpenRouter's reported `usage.cost` is not passed through; escalation cost comes from the price book row of the model that answered.

## Managed live

- One mutable **draft** per set. Its ETag is its `spec_hash`. Every write goes through `draft.update` with `If-Match`. Try-model and improve mode never write it; they return proposals, and `proposal.accept` applies them through `draft.update`. Publishing takes `If-Match`, validates, runs lints (including `interface.breaking`), freezes the draft into version N+1, and opens a new draft cloned from N+1. Publishing a spec identical to the version already on that channel is a no-op that returns that version, unless the call carries `interfaceBump`.
- **Publish pointer rule.** If the target is production at `controlled` or `full` and `skipExperiment` is absent, the pointer does not move; the new version becomes the challenger of an auto-started experiment (default `samplePct` 0.1, `minRuns` 500, `minLabeled` = the goal's `minLabeledHigh`), and the response includes `experimentId`. Otherwise the pointer moves. Experiments ship in Phase 3b; until then the pointer always moves.
- **Promote** points production at the version staging serves, with the same lints and gates as a production publish. It creates the production pointer at `inactive` when none exists. On a live production pointer it starts an experiment under the same rule. It takes no `interfaceBump`: the interface major belongs to the version, and published versions are immutable ([deploy-and-codegen.md](deploy-and-codegen.md), section 5).
- **Evals** are required when the production pointer is `controlled` or `full`. Otherwise they are optional per set.
- **Channels:** `release_pointers(set_id, channel)` with `production` and `staging`. Each pointer holds the version, the rollout stage and the active experiment. Rollback, promotion and experiment promotion move a pointer. All are audited and written to `release_events`.
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

Run in the editor live and again at publish. Errors block publish; warnings don't. Lints are pure and read the target model's profile. Each lint returns `{ rule, severity, path, message }`, where `path` is a JSON Pointer into the spec. `draft/validate` and `422 spec_invalid` return the same shape in the error envelope's `details` ([api.md](api.md)).

```ts
lint(spec: QuestionSetSpec, profile: ModelProfile | null, publishCtx?: PublishCtx): LintResult[]
  // profile is null when the model is not in the registry (model.unknown)
LintResult = { rule: string, severity: "error" | "warning", path: string, message: string }

PublishCtx = {
  channel: "production" | "staging",       // the target channel
  rolloutStage: RolloutStage,              // the target's stage; "inactive" when it has no pointer yet
  served: Array<{                          // channels to check for interface.breaking: the target,
    channel: "production" | "staging",     // plus production when the target is staging;
    interface: SetInterface,               // one entry per channel that has a pointer
    interfaceMajor: number,
    hasConsumers: boolean,                 // live bindings, or app runs on that channel in the last 30 days
  }>,
  newMajor: number,                        // publish: the set's highest major, plus one with interfaceBump;
                                           // promote: the promoted version's stored major
  systemOneProvider: "typesafe" | "openrouter",   // the provider the set's runs use (ADR-011)
  reachableModels: string[],               // org_system_one_keys.models for that provider
  modelRoutes: ModelRoute[],               // route rows for that provider, empty for typesafe; the model
                                           // lints call resolveRoute, so an unpinned route counts as moving
  pricedModels: string[],                  // exact ids with a price_books row the org can read
                                           // (its own rows plus the platform rows)
  allowPreviewModels: boolean,
  enabledHandlers: string[],               // action handlers installed and enabled for the org
  fallbackSets: Record<string, { usesSetFallback: boolean }>,   // sets this spec names as fallbacks;
                                                                 // a missing key means no such set
  hashOnly: boolean,                       // the set stores hashes only
}
```

The operation builds `PublishCtx` from the stores; core never reads them. The editor may pass one for the channel it previews. Lints that need a `PublishCtx` field are skipped when it is absent: `action.handler_unknown`, `fallback.set_invalid`, `model.not_available_to_org`, `model.alias_past_shadow`, `escalation.model_unpriced`, `interface.breaking` and `privacy.hash_only_with_review`. Publish and promote always pass it, so they always run.

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
| `outage.auto_not_allowed` | `onUnavailable` is `auto` (ADR-012); an outage gives no answer to act on. The strict schema refuses it with the same rule id | error |
| `outage.fallback_silent` | `onUnavailable` is explicitly `fallback` and the set has gating decisions. An outage runs no fallback config, so each comes back as `fallback` with no value and the app decides alone (ADR-012 Amendment 1). Names every gating decision. Path `/onUnavailable`. Use `review` to send outages to a person | warning |
| `policy.all_gating_thresholded` | Every question is gating and thresholded; suggest the top-choice preset where only the best option matters | warning |
| `stage.same_stage_dependency` | Question depends on another answer in the same stage | error |
| `stage.needless_second_call` | A stage's `when` reads an earlier answer but its `stateFrom` is `input` only; merge into the earlier stage and use `relevantWhen` | warning |
| `relevance.premise_missing` | A question with `relevantWhen` whose instructions don't state the premise | warning |
| `tokens.near_limit` | Estimated tokens above 80% of a profile limit | warning |
| `instructions.too_short` | Instructions shorter than 8 words. The question id is never sent to the model, so the requirement has to be in the instructions and option descriptions | warning |
| `redact.path_unknown` | A `redactPaths` entry does not resolve in `input.schema` | error |
| `action.handler_unknown` | An action names a handler that is not installed and enabled for the org | error |
| `fallback.set_invalid` | A set fallback names a missing set, or a set that itself uses a set fallback | error |
| `model.unknown` | The model is not in the registry | error |
| `model.unreviewed` | The model is `unreviewed` (error at publish; allowed in the playground) | error |
| `model.not_available_to_org` | The org's key for the set's provider cannot reach the model, or that provider has no route for it | error |
| `model.deprecated` | The model is deprecated (error after its `retireAt`) | warning |
| `model.question_type_unsupported` | A question type is not in the profile's `questionTypes` | error |
| `model.alias_past_shadow` | A moving model would serve a channel in `controlled` or `full`. On a provider other than TypeSafe, a route row that is not `pinned` counts as moving (ADR-011) | error |
| `escalation.model_unpriced` | An `EscalationConfig.model`, or the comparator it defaults to, is not in `pricedModels` | error |
| `interface.breaking` | For an entry in `served` with consumers, `diffInterface` reports a breaking change and `newMajor` equals that entry's major (see [deploy-and-codegen.md](deploy-and-codegen.md), section 5) | error |
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
| `weakness.threshold_copied` | `structural_invariants` | A choice or score policy whose `thresholds.high` equals a noul policy's `noul.trueAt` and whose `thresholds.medium` equals that policy's `noul.trueAt - noul.reviewMargin`, in the same set | Tune each question on its own labels |

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
- Registry sync (nightly): per org key, by provider. TypeSafe keys list `/v1/models`. OpenRouter keys read OpenRouter's Models API (`GET https://openrouter.ai/api/v1/models?output_modalities=decisions`, entries `typesafe/*` and `~typesafe/*`), because the SDK's `models.list()` fails there. Store the reachable names; insert unseen names as `unreviewed` and alert the platform admin; probe idle aliases with a one-noul request and read the response `model` ([system-one-models.md](system-one-models.md)).
- Contract watch (nightly): diff TypeSafe's `openapi.json`, `llms.txt` and `models.md` against committed snapshots in `packages/system-one-client/contract`; alert and open an issue on a change.
- The registry sync, alias observation, alias probe and contract watch functions live in `apps/console/src/jobs/registry`, one plain async function each over small ports (ADR-005).
- Webhook retries.
- Gate evaluator and auto-demote (hourly, Phase 3).
- Threshold refit (weekly, Phase 3b).
- Experiment scorer (Phase 3b).
- Model-upgrade candidates, when a model becomes stable (Phase 3b).
- Pruning: events after 30 days, idempotency keys after 24 hours, finished jobs.
- Approvals: one reminder email after 24 hours pending, and expiry after 7 days ([management-api.md](management-api.md#approvals)).
