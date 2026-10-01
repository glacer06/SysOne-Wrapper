# Management API (`/api/v1`)

Owner: Platform / Tenancy (registry, operations, routes). Console UI calls operations. Integrations owns `@bandwise/cli` and the MCP server, which call these routes over HTTP. Phase 3 unless a row says otherwise. Decision record: [ADR-007](../../../../docs/adr/007-headless-parity.md).

## Purpose

This is the management half of `/api/v1`. The run surface, auth modes, feedback and the error envelope are in [api.md](api.md). Management routes use the same auth modes and the same envelope.

Rule: **no capability exists only in the console.** Every console screen reads and changes org data through an operation in this file. The same operation is reachable over HTTP, from `@bandwise/cli`, and, when it is on the curated list, from the MCP server ([headless-and-agents.md](headless-and-agents.md)). These exceptions stay console-only on purpose:

- Stripe checkout and the billing portal (Stripe hosts them). No operation.
- Platform admin impersonation. No operation.
- Session-only operations, marked *session only* in the catalog (`actors: ["user"]`). They are operations with routes, so the console still goes through the registry and the audit log, but no token can call them:
  - `approval.decide`: a person must decide ([Approvals](#approvals)).
  - `review.confirm`: a person confirms agent labels and agent resolutions ([Review and feedback](#review-and-feedback)).
  - `org.create` and `portfolio.get`: they span orgs, and every token belongs to one org.
  - Platform operations (`/platform/*`): a superadmin session with MFA.

## Operation registry

Every capability is one `OperationDef` in `apps/console/src/server/operations`, registered in one map keyed by `id`.

```ts
OperationDef<I, O> = {
  id: string,                 // noun.verb, identical to the audit action: "set.publish", "rollout.change"
  summary: string,            // one line; becomes the OpenAPI summary, CLI help and MCP tool description
  input: ZodType<I>,          // path params, query and body merged into one object
  output: ZodType<O>,
  scope: Scope | ((input: I) => Scope), // a function when the channel decides: release:staging or release:production
  minRole: Role,              // the floor; can() raises it for protected sets, entering full and skipExperiment
  actors: Array<"user" | "agent" | "apiKey" | "system">, // who may call it; ["user"] means session only
  risk: "normal" | "high",    // "high": an agent may need an approval (conditions below and in security.md)
  towardSafety: boolean,      // only ever makes things safer (rollback, stop, revoke): never gated
  readOnly: boolean,
  destructive: boolean,
  async: boolean,             // true: returns 202 { jobId }
  http: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string },
  mcp?: { tool: string },     // only for curated MCP tools
  emits: EventType[],         // events it writes (events.md); [] for read-only operations
  preview?: (ctx: TenantContext, input: I) => Promise<DryRunResult>, // only on operations that accept ?dryRun=true
  handler: (ctx: TenantContext, input: I) => Promise<O>,
}
```

`emits`, `preview` and `actors` extend the shape in ADR-007 so the event rule ([events.md](events.md)), dry runs and session-only operations have one home.

`actors` defaults to `["user", "agent"]`:

- App tokens (`apiKey`) reach only the operations their scopes cover ([security.md](security.md), App tokens): `set.run`, `set.list`, `set.manifest`, `version.get` (manifest only), `model.list`, `run.list`, `run.get`, `run.ingest`, `usage.get`, `review.list`, `review.assign`, `review.resolve`, `review.dismiss`, `feedback.report`, `event.list` (review events for that app's runs only; [events.md](events.md)) and `browser_token.create`.
- Operations that a job calls add `"system"`: `rollout.change` (auto-demote) and `experiment.stop` (the experiment scorer).
- `["user"]` marks a session-only operation. It has a route and an OpenAPI path, and no CLI command or MCP tool may map to it.

### runOperation

`runOperation(id, ctx, input, { idempotencyKey?, ifMatch?, dryRun?, interfaceMajor?, runSource? })` runs the same steps for every caller, in this order. `interfaceMajor` is the `Bandwise-Interface` header value, and `runSource` is the `RunRequest.source` the adapter sets from the auth mode and surface for `set.run`; neither is ever read from the body. `ctx` is typed by `OperationContextFor<Id>`: a `TenantContext`, or for `org.create` and the `platform_*` rows an `OrgLessContext` as well ([architecture.md](architecture.md)).

1. **Resolve the actor** into `TenantContext`: console session, app token or agent token. For an agent token, role = min(`role_ceiling`, current membership role), read on every request.
2. **Validate input** with `op.input`. Failure: `400 invalid_request` with `details[]` (JSON Pointers into the body).
3. **Check actor, scope and role** with `can(ctx, op, resource)`. An actor type not in `op.actors` gets `403 insufficient_scope`; for a session-only operation the message says a console session is required. It then checks the scope, the role (app tokens have no role, so only scope, set allowlist and channel apply), and resource rules such as "protected sets need an admin to publish". A resource in the caller's org that the actor may not touch: `403 insufficient_scope` with `requiredScope`. A resource in another org, or a set outside the token's allowlist: `404 not_found`.
4. **Approval gate.** Only for agent actors. If the operation is high risk for this input (see [Approvals](#approvals)), store an `approval_requests` row, emit `approval.requested` and return `202`. If the same token already has a request for the same `op_id` and `input_hash` that is pending, or was approved or executed in the last 24 hours, return that request instead of opening a second one. A replayed call therefore gets the same approval back.
5. **Idempotency lookup** by `(org_id, actor_key, key)`. A stored response is replayed.
6. **If-Match check** for operations that require it. Missing: `428 precondition_required`. Mismatch: `412 precondition_failed` with `currentEtag`.
7. **Handler** inside `withTenant`, in one transaction.
8. **Audit row** with `actor_type`, `client`, `actor_token_id` and `approval_id` (security.md).
9. **Event rows** for each type in `op.emits`, in the same transaction.
10. **Store the idempotent response** in the same transaction.

`runOperation` returns a tagged result, `{ kind: "ok", output }`, `{ kind: "dryRun", preview }` or `{ kind: "approval", accepted }`, or throws an `OperationError`. Only the route adapter maps it to HTTP: `ok` is the operation's success status, `dryRun` is 200 with the preview, and `approval` is 202 with the approval. `OperationError` carries `code`, `details`, `gates`, `requiredScope`, `currentEtag` and `runId`, and `toEnvelope()` builds the api.md error envelope from them.

After commit: cache epoch bumps, action dispatch and job enqueue. With `dryRun`, steps 1 to 6 run (step 4 only reports whether approval would be needed), then `op.preview` runs and nothing is written: no audit, event, idempotency or approval row.

An approved request runs through `runOperation` with the stored input, the stored `If-Match` value and `approval_id` set, so step 4 is skipped. The actor is the requesting agent token. Steps 1 and 3 run again: if the token was revoked or the user lost the role, nothing runs and the error is stored in the request's `result`.

### Adapters

- **Server Actions** call `runOperation` with the session context. Console UI code calls operations, never repositories.
- **Route handlers** under `app/api/v1` are generated from each entry's `http` field. They read `Idempotency-Key`, `If-Match` and `?dryRun=true`, call `runOperation`, and map the result to the status code: `200`, `201` for creates, `202` for jobs and approvals.
- **`@bandwise/cli` and the MCP server** call `/api/v1` over HTTP with an agent token. Neither imports the registry, the database or a TypeSafe key.
- An operation that also performs another operation's write (codegen that records a binding, for example) calls `can()` for that one too.

### OpenAPI and the parity test

- `openapi.json` is generated from the registry and the zod contracts, committed as `packages/core/openapi.json`, and served at `GET /api/v1/openapi.json`. Each path's `operationId` is the operation id, and the extensions `x-bandwise-scope`, `x-bandwise-min-role`, `x-bandwise-risk` and `x-bandwise-actors` carry the registry metadata. MSW mocks, CLI help and MCP tool schemas come from the same file.
- The parity test runs on every PR ([testing.md](testing.md), Headless API tests). It fails when an operation has no route or no OpenAPI path, when a curated MCP tool or a CLI command maps to no operation or to a session-only operation, or when code under `app/(org)/**` or `app/(platform)/**` imports a repository. The run surface is in the registry too (`set.run` and the rest of [Runs and usage](#runs-and-usage)), so the MCP tool `run_set` and `bandwise run` map to `set.run`.
- The catalog test in core (`operations.test.ts`) transcribes every row of the Catalog tables below, risk included, with no overrides, and checks that every `high*` row has an entry in `HIGH_RISK_CONDITIONS`. `set.update` and `experiment.start` are `high*` rows like publish, promote, rollout change, token creation and settings.

### What is built (D2c, ADR-020)

The dogfood track serves these operations for the `internal` org. Every other operation still has a stub handler, and the adapter answers `404 not_found` for it ("not served yet"), never 500.

- **Served:** `set.list`, `set.get`, `set.create`, `draft.get`, `draft.update`, `draft.validate`, `set.manifest`, `version.list`, `version.get`, `version.diff`, `set.publish`, `channel.rollback`, `rollout.get`, `rollout.change`, `run.list`, `run.get`, `usage.get`, `approval.list`, `approval.get`, `approval.decide`, and for the D3 review queue `review.list`, `review.resolve`, `review.dismiss`, `review.confirm`. Previews (`?dryRun=true`) on publish, rollback and rollout change.
- **Code:** handlers in `apps/console/src/server/manage/`, response shapes in `server/operations/views.ts`, the HTTP adapter in `server/api/dispatch.ts` behind `app/api/v1/[...path]/route.ts`. `POST /sets/{ref}/run` keeps its own route (D2b); Next matches it before the catch-all.
- **Handlers** take an `OperationEnv`: the tenant transaction, `authorize(resource, risk)` (can() then the approval gate; a handler calls it before any write), `audit(row)`, `unchanged()` for a mutation that changed nothing, and `etag(value)`. runOperation writes the audit row in the handler's transaction and refuses a mutation that recorded none.
- **Approvals:** a gated agent call stores `approval_requests` (with the If-Match it was sent with), writes an audit row and returns `202`. A replay from the same token with the same input and If-Match returns the same pending request. `approval.decide` (session only) runs an approved request after its own transaction commits, as the requesting token, re-checking the token, the role and the input hash; the result or the error lands in the request's `result`, and its status becomes `executed` on success.
- **Response shapes:** sets are `{ id, slug, name, description, projectId, goalId, protected, storageMode, createdAt, draft: { version, versionId, etag } | null, channels: [{ channel, version, versionId, stage, interfaceMajor, updatedAt }] }`. `version.list` items carry `version`, `status`, `specHash`, `interfaceMajor`, `model`, `changelog`, `publishedAt` and `publishedBy`; `version.get` adds `spec` (app tokens get the manifest). Rollback returns `{ channel, fromVersion, toVersion, stage }`, rollout change `{ channel, from, to, version }`, rollout get `{ channel, stage, version, versionId, gates, warnings }`. `run.list` items are run summaries without state; `run.get` adds stages, checks, answers, decisions, warnings, state (when kept) and review items. `usage.get` takes `?from=&to=&set=` (default the last 7 days) and returns `{ from, to, sets: [{ setId, slug, runs, bandHigh, bandMedium, bandLow, errors, inputTokens, outputTokens, systemOneCostMicroUsd, counterfactualMicroUsd, savingsMicroUsd, llmCallsAvoided }], totals, days: [{ day, runs, errors, systemOneCostMicroUsd, counterfactualMicroUsd, savingsMicroUsd, llmCallsAvoided }] }`; `days` are UTC days with runs, oldest first. `review.list` takes `?kind=&status=&set=&band=` and returns items `{ id, runId, setId, decisionId, kind, reason, sampleRate, band, suggested, status, assigneeId, resolution, resolvedBy: { userId, tokenId }, resolvedAt, addToDataset, createdAt }`, newest first; resolve, dismiss and confirm return the item.

D2 limits, each lifted by a later phase:

- Only the `internal` org; any other org gets 404 on every route. Bearer tokens only: console sessions reach these operations through runOperation once D3 adds sign-in, so `approval.decide` has no HTTP caller yet.
- A channel's first publish creates its pointer at `shadow`, not `inactive`, so every dogfood set starts in shadow (ADR-020). The pointer always moves: `skipExperiment` and `requireEval: true` are refused with 400 until Phase 3b and Phase 3.
- `rollout.change` checks no gates (`rollout.get` says so in `warnings`). It refuses `controlled` or `full` for a version whose model is not pinned in the registry (`422 spec_invalid`, rule `model.alias_past_shadow`). The system actor never pauses or lifts a pause.
- Rollback goes to the version the channel served before the current one came in by publish (release events), so a second rollback walks further back. It does not re-run lints. Because it is never gated, it only steps back: `toVersion` must be older than the current version and one this channel served before (a release event put it there). Anything else is refused with `400 invalid_request`; moving forward is a publish.
- `approval.decide` and the approved run are conditional updates (pending to decided, approved to executed), so a double decide or a double run lands once. `draft.update` and `set.publish` write the draft only while it still holds the spec hash the If-Match check read, so a concurrent save gets `412` instead of a lost update.
- `set.create` with `fromTemplate` is refused; without `fromVersion` the draft is a one-question starter spec to replace.
- Model facts and prices come from the registry seed; every registry model counts as reachable (platform key mode). `interface.breaking` treats any channel that is not `inactive` as having consumers.
- `usage.get` sums the `runs` table; the `usage_daily` rollup lands with the jobs runner.
- Review: the console sends `resolution: { value }`, and `run_feedback.observed` holds that value (any other JSON is stored as the value). One feedback row per item, keyed `review:<itemId>`. An agent's resolve leaves any item at `pending_confirmation` with an `agent` row; agents cannot dismiss. `failureClass` is kept on the audit row only until `run_feedback` has a column for it. `addToDataset` is stored on the item; copying the case into a dataset lands with datasets (Phase 3). A second answer to a closed item is `409 already_exists`. `review.assign` is still a stub.
- Idempotency keys are stored for mutations (`server/operations/idempotency.ts`). runOperation claims `(org_id, actor_key, key)` in the operation's transaction before the handler (an insert, or a takeover of a row older than 24 hours) and stores `{ body, etag }` with the success status in that same transaction, so a retry after the catch-all 503 replays the committed response with `Idempotent-Replayed: true`. `actor_key` is the token id (agent or app) or the user id; the system actor stores none. The request hash covers the operation id, the validated input and If-Match, so the same key with another body or on another operation is `422 idempotency_key_reused`. A key must be 1 to 255 visible ASCII characters (`400 invalid_request`). A failed call rolls its key back. A gated `202` stores no key: a retry reaches the gate, which returns the same request. Reads, previews and approved runs store none. Not yet: the key is optional for tokens (no `400` when it is missing), the replay skips the role check for that caller's own stored answer, `approval.decide` stores the decision as committed (before the approved request runs), expired rows are not pruned (a new call with the key takes the row over), and `POST /sets/{ref}/run` does not store keys, so the CLI retries a write on a retryable `503` but never a run.
- Not yet: event rows, the org's `agentApprovals` setting (read as `required`), approval emails, and expiry as a stored status (a pending request past `expiresAt` reads as `expired`).
- An unexpected error answers `503 system_one_unavailable` with a fixed message, like the run route, because the api.md code table has no generic server error. Its message is never echoed or logged.

## Conventions for every route

- Paths are under `/api/v1`. `{ref}` is a set id or slug. `{n}` is a version number.
- JSON in and out. Errors use the envelope in [api.md](api.md).
- Lists take `limit` (default 50, max 200) and `cursor`, and return `{ data, nextCursor }`. The event feed has its own cursor ([events.md](events.md)).
- Mutations from app and agent tokens send `Idempotency-Key` ([Safe retries](#safe-retries-and-previews)).

## Catalog

Legend for the Risk column:

- `read`: read-only.
- `normal`: never needs an approval.
- `high`: an agent needs an approval.
- `high*`: an agent needs an approval only under the conditions listed below.
- `safety`: `towardSafety`; never gated.

A row whose Scope column says *session only* has `actors: ["user"]`: no token can call it.

`release:<channel>` means `release:staging` or `release:production`, picked by the channel the call touches. Conditions for `high*`:

- `set.publish` and `channel.promote`: the channel is production and the set is protected or its production stage is `controlled` or `full`. Publishing or promoting with `skipExperiment` is always high.
- `rollout.change`: a move into `controlled` or `full` from a lower stage, or any move out of `paused`. Moves into `paused`, and moves from `full` or `controlled` down to `controlled` or `shadow`, are never gated. `inactive` to `shadow` is normal, because nothing executes in shadow.
- `app_token.create` and `agent_token.create`: the new token has a write scope. One exception: `feedback:write` on an `sk_test_` app token bound to `staging` does not count, so `bandwise init` needs no approval ([deploy-and-codegen.md](deploy-and-codegen.md)). An `admin:write` agent token is always gated.
- `settings.update`: the change touches PII mode, retention, or lowers `agentApprovals`.
- `set.update`: the change moves `storageMode` to a less private mode, `hash_only` to `redacted` or `full`, or `redacted` to `full` ([data-model.md](data-model.md)). Every other `set.update` is normal.
- `experiment.start`: `samplePct` above 0.25 ([effectiveness-loop.md](effectiveness-loop.md)).

The org setting `agentApprovals` narrows which of these are gated; see [security.md](security.md).

### Runs and usage

The run surface in [api.md](api.md) is registered like every other operation.

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| POST | `/sets/{ref}/run` | `set.run` | `run` | viewer | normal | 2 |
| GET | `/sets/{ref}/manifest` | `set.manifest` | `sets:read` | viewer | read | 3 |
| GET | `/runs` | `run.list` | `runs:read` | viewer | read | 3 |
| GET | `/runs/{id}` | `run.get` | `runs:read` | viewer | read | 3 |
| GET | `/usage` | `usage.get` | `usage:read` | viewer | read | 3 |
| POST | `/tokens/browser` | `browser_token.create` | `run` | none (`sk_` only) | normal | 2 |
| POST | `/runs/ingest` | `run.ingest` | `runs:write` | viewer | normal | 4b |

- `set.run` takes a `RunRequest` ([spec-schema.md](spec-schema.md)) and returns `RunResult`, or `RunDryRunResult` when `options.dryRun` is set. Actors: sessions, agent tokens and app tokens. `Idempotency-Key` is accepted but not required. The run's own `options.dryRun` is its preview; the generic `?dryRun=true` does not apply. MCP tool `run_set`, CLI `bandwise run`. The console playground calls it too. It emits `review.created` for action review items and `model.alias_moved` when `RunSink` sees a new `model_requested` to `model_resolved` pair.
- `set.manifest` returns the manifest in [api.md](api.md): no instructions, criteria or thresholds. The embed kit and codegen read it.
- `run.list` backs the console runs explorer. Filters: `set`, `version`, `channel`, `source`, `status`, `band` (run band), `action` (overall action), `from` and `to`, plus `limit` and `cursor`. It returns run summaries without state.
- `run.get` returns the run envelope with its per-stage payloads and answers, plus the run's review items with their status and resolution, so a host app can poll how a review ended. State is omitted unless the set's storage mode kept it.
- `usage.get` returns the org's usage and savings rollups ([savings-model.md](savings-model.md)).
- `browser_token.create` is for `sk_` app tokens only (`actors: ["apiKey"]`). The body names the origin and the sets (a subset of the token's allowlist). It returns `{ token, expiresAt }`.
- `run.ingest` is for the standalone deploy target only, behind ADR-009 ([deploy-and-codegen.md](deploy-and-codegen.md)). Callers: `sk_` app tokens and agent tokens with `runs:write`.

### Projects and goals

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/projects` | `project.list` | `sets:read` | viewer | read | 3 |
| POST | `/projects` | `project.create` | `sets:write` | editor | normal | 3 |
| GET | `/goals` | `goal.list` | `sets:read` | viewer | read | 3 |
| POST | `/goals` | `goal.create` | `sets:write` | editor | normal | 3 |
| PATCH | `/goals/{id}` | `goal.update` | `sets:write` | editor | normal | 3 |

Goals carry `qualityTarget` (a `QualityTarget`) and `businessKpi`. See [effectiveness-loop.md](effectiveness-loop.md).

### Sets and drafts

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/templates` | `template.list` | `sets:read` | viewer | read | 3 |
| GET | `/sets` | `set.list` | `sets:read` | viewer | read | 3 |
| POST | `/sets` | `set.create` | `sets:write` | editor | normal | 3 |
| GET | `/sets/{ref}` | `set.get` | `sets:read` | viewer | read | 3 |
| PATCH | `/sets/{ref}` | `set.update` | `sets:write` | editor | high* | 3 |
| POST | `/sets/{ref}/archive` | `set.archive` | `sets:write` | editor | normal | 3 |
| GET | `/sets/{ref}/draft` | `draft.get` | `sets:read` | viewer | read | 3 |
| PUT | `/sets/{ref}/draft` | `draft.update` | `sets:write` | editor | normal | 3 |
| POST | `/sets/{ref}/draft/validate` | `draft.validate` | `sets:read` | viewer | read | 3 |

- `template.list` returns `{ id, name, pattern, parameters }` for each seeded template ([definition-studio.md](definition-studio.md)), so an agent can find a `fromTemplate` id.
- `set.create` takes `{ slug, name, goalId, fromTemplate?, fromVersion? }`. `fromTemplate` is a template id ([definition-studio.md](definition-studio.md)). `fromVersion` is `slug@n` of another set in the org. The new set has a draft and no published version.
- `set.get` returns the set row, each channel pointer with its version, rollout stage and active experiment, and the live interface major.
- `set.update` changes `name`, `protected` (admin only), `labeling`, `dispatchActionsOnStaging`, `valueSettings`, `gateMargins` (`{ coverageDrop, reviewLoadRise }`, used by the regression gate and experiment promotion in [effectiveness-loop.md](effectiveness-loop.md)), `storageMode`, `userGenerated` and `resultCacheTtlSeconds` (null turns the result cache off). A move to a less private `storageMode` is high risk for agents (see the `high*` conditions).
- `set.archive` is `destructive`.
- `draft.get` returns the spec with `ETag: "<spec_hash>"`. `draft.update` replaces the whole spec, requires `If-Match`, and returns the new ETag. The body is a strict `QuestionSetSpec` ([spec-schema.md](spec-schema.md)); a `rollout` key fails with a message naming `rollout.change`.
- `draft.validate` takes an optional spec in the body (default: the stored draft) and returns `{ errors[], warnings[] }`. Each item has the `details` shape from api.md: `{ path, rule, severity, message }`. It writes nothing, so an agent can iterate on a local file.

### Versions and releases

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/sets/{ref}/versions` | `version.list` | `sets:read` | viewer | read | 3 |
| GET | `/sets/{ref}/versions/{n}` | `version.get` | `sets:read` | viewer | read | 3 |
| GET | `/sets/{ref}/diff` | `version.diff` | `sets:read` | viewer | read | 3 |
| POST | `/sets/{ref}/publish` | `set.publish` | `release:<channel>` | editor | high* | 3 |
| POST | `/sets/{ref}/channels/{channel}/rollback` | `channel.rollback` | `release:<channel>` | editor | safety | 3 |
| POST | `/sets/{ref}/channels/{channel}/promote` | `channel.promote` | `release:production` | editor | high* | 3 |
| GET | `/sets/{ref}/releases` | `release.list` | `sets:read` | viewer | read | 3 |

- `version.get` returns the full spec to sessions and agent tokens. App tokens get the manifest only ([api.md](api.md)).
- `version.diff` takes `?from=&to=`. Each side is a version number, `draft`, or a channel name.
- `set.publish` takes `{ channel, changelog, requireEval?, skipExperiment?: { reason }, interfaceBump?: { reason } }` and requires `If-Match` with the draft ETag. It runs lints (`422 spec_invalid`), runs the eval gate when required (`409 gate_not_met`), freezes the draft into version N+1 and opens a new draft. It returns `{ version, versionId, experimentId? }`.
- **Pointer rule for `set.publish`.** If the target is production at `controlled` or `full` and `skipExperiment` is absent, the pointer does not move. The new version becomes the challenger of an auto-started experiment (defaults: `samplePct` 0.1, `minRuns` 500, `minLabeled` = the goal's `QualityTarget.minLabeledHigh`), and the response includes `experimentId`. Otherwise the pointer moves. A channel's first publish creates its pointer at `inactive`. Experiments ship in Phase 3b; until then the pointer always moves.
- `skipExperiment: { reason }` (Phase 3b) moves the pointer on a live set without an experiment. It needs the admin role, and an agent also needs an approval.
- `interfaceBump: { reason }` gives the new version the set's highest interface major plus one. It is the only way to clear the `interface.breaking` lint, and a publish that carries it is never a no-op. The reason is audited on the release event ([deploy-and-codegen.md](deploy-and-codegen.md), section 5).
- `channel.rollback` takes `{ toVersion? }` and defaults to the previous version on that channel. `toVersion` must be an earlier version this channel served.
- `channel.promote`: `{channel}` is `production`. It takes `{ changelog?, skipExperiment?: { reason } }` and points production at the version staging serves, with the same lints and gates as a production publish. It creates the production pointer at `inactive` when none exists. On a live production pointer (`controlled` or `full`) it starts an experiment under the same pointer rule as `set.publish`, and the pointer stays on the champion. To move a version that is already on staging, promote it; do not publish it again.
- `channel.promote` takes no `interfaceBump`. The major belongs to the version, and published versions are immutable. The staging publish already checks production's consumers, so a breaking change is bumped there. If a promote still fails `interface.breaking` (production gained consumers after the staging publish), publish to staging again with `interfaceBump`, then promote.
- The set's protected flag, the `controlled` to `full` rule and `skipExperiment` raise the role to admin inside `can()`.

### Rollout

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/sets/{ref}/channels/{channel}/rollout` | `rollout.get` | `sets:read` | viewer | read | 3 |
| PUT | `/sets/{ref}/channels/{channel}/rollout` | `rollout.change` | `release:<channel>` | editor | high* | 3 |

- `rollout.get` returns the stage, the gate results for the next stage (`[{ id, required, actual, met }]`), auto-demote status and the "no truth source" warning when it applies.
- `rollout.change` takes `{ stage, reason }`. Stages are `inactive`, `shadow`, `controlled`, `full` and `paused` ([confidence-policy.md](confidence-policy.md)). Gates apply to the production channel; a failed gate returns `409 gate_not_met` with `gates[]`. Entering `full` needs the admin role. The auto-demote job calls this operation as the system actor and never sets `paused`; people and agents can pause at any time.

### Experiments (Phase 3b)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| POST | `/sets/{ref}/experiments` | `experiment.start` | `release:<channel>` | editor | high* | 3b |
| GET | `/experiments/{id}` | `experiment.get` | `sets:read` | viewer | read | 3b |
| POST | `/experiments/{id}/promote` | `experiment.promote` | `release:<channel>` | editor | high | 3b |
| POST | `/experiments/{id}/stop` | `experiment.stop` | `release:<channel>` | editor | safety | 3b |

`experiment.start` takes `{ channel, challengerVersionId, kind: "version" | "model" | "policy", samplePct, minRuns, minLabeled }`. A publish or promote to production on a `controlled` or `full` set starts one on its own unless `skipExperiment` is set, with the defaults in the pointer rule above. `experiment.promote` moves the pointer to the challenger when the promotion rule in [effectiveness-loop.md](effectiveness-loop.md) holds; otherwise `409 gate_not_met`.

### Datasets, evals and jobs

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/datasets` | `dataset.list` | `sets:read` | viewer | read | 3 |
| POST | `/datasets` | `dataset.create` | `sets:write` | editor | normal | 3 |
| POST | `/datasets/{id}/cases` | `dataset.import` | `sets:write` | editor | normal | 3 |
| GET | `/datasets/{id}/cases` | `dataset.cases` | `sets:read` | viewer | read | 3 |
| POST | `/datasets/{id}/snapshots` | `dataset.snapshot` | `sets:write` | editor | normal | 3 |
| GET | `/datasets/{id}/export` | `dataset.export` | `sets:read` | editor | read | 3 |
| GET | `/datasets/{id}/features` | `dataset.features` | `sets:read` | editor | read | 3b |
| POST | `/evals` | `eval.run` | `evals:run` | editor | normal | 3 |
| GET | `/evals/{id}` | `eval.get` | `sets:read` | viewer | read | 3 |
| POST | `/sets/{ref}/compare` | `set.compare` | `evals:run` | editor | normal | 3 |
| GET | `/jobs/{id}` | `job.get` | any | viewer | read | 3 |

- `dataset.import` takes JSONL, one case per line: `{ state, expected, tags? }`. The server assigns each case's split from a hash of its `state_hash`; imports never set it.
- `dataset.cases` and `dataset.export` never return test-split cases. `dataset.export` is a job and its result is a download link; the export is audited.
- `dataset.features` takes `?version=N` and returns per-question probabilities, noul values and normalized scores joined with labels, for the drafting and calibration splits only.
- `dataset.snapshot` freezes the dataset's current case ids into `dataset_snapshots` and returns `{ snapshotId, snapshotHash, caseCount }`. It returns no cases.
- `eval.run` takes `{ setRef, version, datasetId, snapshotId?, model?, repeats? }` and returns `202 { jobId, evalRunId }`. `version` may be `draft`. Without `snapshotId` it snapshots the dataset's current cases first. Evals use the eval limiter bucket (security.md).
- `eval.get` returns aggregate metrics only for the test split.
- `set.compare` is the playground diff: `{ from, to, states[] }` or `{ from, to, datasetId }`. It is a job.
- `job.get` returns the job to the user and tokens that started it, and to session members of the org.

### Review and feedback

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/review` | `review.list` | `review:read` | reviewer | read | 3 |
| POST | `/review/{id}/assign` | `review.assign` | `review:write` | reviewer | normal | 3 |
| POST | `/review/{id}/resolve` | `review.resolve` | `review:write` | reviewer | normal | 3 |
| POST | `/review/{id}/dismiss` | `review.dismiss` | `review:write` | reviewer | normal | 3 |
| POST | `/review/{id}/confirm` | `review.confirm` | *session only* | reviewer | normal | 3 |
| POST | `/feedback` | `feedback.report` | `feedback:write` | reviewer | normal | 3 |

- `review.list` takes `?kind=action|label` and `?status=`, and shows why each item was picked. Items waiting for a person show status `pending_confirmation`.
- `review.resolve` takes `{ resolution, addToDataset?, failureClass? }` (`failureClass` per ADR-012). From a console session or an app token, it resolves the item and writes a `reviewer` row to `run_feedback` (an `audit` row when the item carries a `sample_rate`). From an agent token, agents propose and people approve:
  - Kind `label`: the row is stored with source `agent` and counts toward nothing (gates, health, evals, promotion) until a person confirms it.
  - Kind `action`: the policy sent this decision to a person, so the agent's resolution is stored as a proposal on the item, and the item moves to status `pending_confirmation`. Nothing the resolution would trigger runs, and no feedback row counts, until a person confirms it.
- `review.confirm` is session only. It takes `{ resolution? }`: without it the agent's resolution stands, with it the person's replaces it. It sets `run_feedback.confirmed_by_user_id` and `confirmed_at`, resolves a `pending_confirmation` item as if the person had resolved it, and emits `review.resolved`.
- `feedback.report` is described in [api.md](api.md). The FeedbackReport contract is in [effectiveness-loop.md](effectiveness-loop.md).

### Health, tuning and proposals (Phase 3b)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/sets/{ref}/health` | `health.get` | `reports:read` | viewer | read | 3b |
| GET | `/health` | `health.list` | `reports:read` | viewer | read | 3b |
| POST | `/sets/{ref}/policy-suggestions` | `policy.suggest` | `sets:read` | editor | normal | 3b |
| GET | `/proposals` | `proposal.list` | `sets:read` | viewer | read | 3b |
| POST | `/proposals/{id}/accept` | `proposal.accept` | `sets:write` | editor | normal | 3b |
| POST | `/proposals/{id}/reject` | `proposal.reject` | `sets:write` | editor | normal | 3b |

- `health.list` returns every set, worst first.
- `policy.suggest` is a job. It replays stored answers with zero System One calls. With `apply: true` it writes the suggested thresholds to the draft through `draft.update`, so it then needs `sets:write` and `If-Match`; the job fails with `412 precondition_failed` if the draft changed after the request.
- `proposal.accept` is the only operation that turns a proposal into draft changes. It applies the proposal's `patch` to the set's draft through `draft.update`, so it requires `If-Match` with the current draft ETag, and it records the draft version it wrote in `proposals.draft_version_id`. Nothing publishes on its own. `label_more` and `demote` have no patch; accepting returns the operation to call.

### Definition Studio

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/studio/sessions` | `studio.list` | `sets:read` | viewer | read | 3 |
| POST | `/studio/sessions` | `studio.create` | `sets:write` | editor | normal | 3 |
| GET | `/studio/sessions/{id}` | `studio.get` | `sets:read` | viewer | read | 3 |
| POST | `/studio/sessions/{id}/examples` | `studio.add_examples` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/draft-definition` | `studio.draft_definition` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/decompose` | `studio.decompose` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/calibrate` | `studio.calibrate` | `evals:run` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/request-labels` | `studio.request_labels` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/promote` | `studio.promote` | `sets:write` | editor | normal | 3 |
| POST | `/sets/{ref}/improve` | `set.improve` | `evals:run` | editor | normal | 3b |

- `studio.list` takes `?goalId=&setId=&status=`. `studio.get` returns the session's status, intent, definition, fit test and its drafting and calibration examples (never the test split), so a session can be resumed from the API.
- `studio.add_examples` takes JSONL with labels and reasons. The server assigns splits.
- `studio.draft_definition` and `studio.decompose` call `llm-client` with the drafting split only.
- `studio.calibrate` is a job on the calibration split. Per-case results come back only with `includeCases: true`, and those cases are then marked burned.
- `studio.request_labels` creates label review items (kind `label`, reason `studio`) for humans.
- `studio.promote` checks the test split and returns only pass or fail and aggregate metrics. On a pass it writes the set's draft through `draft.update`, so it requires `If-Match` when the session belongs to an existing set, or it creates the set when the session has none. Publishing and the shadow rollout then go through `set.publish` and `rollout.change`.
- `set.improve` is a job. Its result is a proposal with a draft diff and metric deltas. It never publishes.

### Models

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/models` | `model.list` | `sets:read` | viewer | read | 3 |
| GET | `/models/{id}` | `model.get` | `sets:read` | viewer | read | 3 |
| GET | `/model-upgrades` | `model.upgrades` | `sets:read` | viewer | read | 3b |
| POST | `/sets/{ref}/try-model` | `set.try_model` | `evals:run` | editor | normal | 3b |

- `model.list` returns the models this org can select, each with its `ModelProfile` ([system-one-models.md](system-one-models.md)). Unreviewed models are left out; preview models appear only when the org sets `allowPreviewModels`.
- `set.try_model` takes `{ model }` and is a job. It builds a candidate spec inside the job (the production spec with only the model changed), evals production and the candidate on the same dataset snapshot, runs the threshold suggester on the candidate's answers and opens a `model_upgrade` proposal whose `patch` holds the new model and the re-tuned thresholds. It never writes the set's draft. Only `proposal.accept` does, through `draft.update` with `If-Match`.

### Apps and integration

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/apps` | `app.list` | `sets:read` | viewer | read | 2 |
| POST | `/apps` | `app.create` | `apps:write` | admin | normal | 2 |
| PATCH | `/apps/{id}` | `app.update` | `apps:write` | admin | normal | 2 |
| POST | `/apps/{id}/tokens` | `app_token.create` | `apps:write` | admin | high* | 2 |
| DELETE | `/apps/{id}/tokens/{tokenId}` | `app_token.revoke` | `apps:write` | admin | safety | 2 |
| GET | `/apps/{id}/opportunities` | `opportunity.list` | `sets:read` | viewer | read | 4b |
| POST | `/apps/{id}/opportunities` | `opportunity.create` | `apps:write` | editor | normal | 4b |
| PATCH | `/apps/{id}/opportunities/{oid}` | `opportunity.update` | `apps:write` | editor | normal | 4b |
| GET | `/apps/{id}/bindings` | `binding.list` | `sets:read` | viewer | read | 4b |
| POST | `/apps/{id}/bindings` | `binding.create` | `apps:write` | editor | normal | 4b |
| DELETE | `/apps/{id}/bindings/{bid}` | `binding.remove` | `apps:write` | editor | normal | 4b |
| GET | `/sets/{ref}/codegen` | `set.codegen` | `sets:read` | viewer | read | 4b |

- `app.create` and `app.update` need the admin role, like the console's apps settings page, so `bandwise init` needs an admin ceiling ([deploy-and-codegen.md](deploy-and-codegen.md), section 8).
- `app_token.create` takes `{ prefix: "sk_live_" | "sk_test_" | "pk_live_", channel, scopes, setIds?, origins?, rpmLimit?, expiresAt? }` (`origins` for `pk_live_` only) and shows the secret once. Revoking ships with creating, in Phase 2.
- `set.codegen` takes `?lang=&channel=&version=&appId=&target=`, where `lang` is `ts` or `py` (`py` stays behind ADR-009) and `target` is `managed_typed` (default) or `standalone`. With `appId` it also records a binding, which checks `apps:write`. See [deploy-and-codegen.md](deploy-and-codegen.md).
- `target=standalone` returns the full spec as code, so `can()` raises the call: console sessions and agent tokens only (never app tokens), the editor role, and an audit row even though the operation is read-only. It returns `404 not_found` until the ADR-009 Standalone section is accepted.

### Reports, audit and events

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/reports/{name}` | `report.get` | `reports:read` | viewer | read | 3 |
| GET | `/alerts` | `alert.list` | `reports:read` | viewer | read | 3 |
| GET | `/audit` | `audit.list` | `audit:read` | admin | read | 3 |
| GET | `/events` | `event.list` | `events:read` | viewer | read | 3 |
| GET | `/webhooks` | `webhook.list` | `admin:write` | admin | read | 5 |
| POST | `/webhooks` | `webhook.create` | `admin:write` | admin | normal | 5 |
| DELETE | `/webhooks/{id}` | `webhook.delete` | `admin:write` | admin | normal | 5 |

- `report.get` takes `?format=json`, `csv` or `pdf`. Report names are the reports in [savings-model.md](savings-model.md), including `model-upgrades` (Phase 3b). A CSV or PDF comes back as a download.
- `audit.list` takes `?action=&actorUserId=&actorTokenId=&from=&to=` and `?format=json` or `csv`. A CSV export is itself audited.
- The event feed is in [events.md](events.md). `webhook.create` takes `{ url, types }` and writes `webhook_endpoints`; deliveries follow the org webhook rules in [events.md](events.md).

### Identity, tokens and admin

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/me` | `actor.get` | any | viewer | read | 2 |
| GET | `/me/portfolio` | `portfolio.get` | *session only* | admin (per org) | read | 3 |
| POST | `/orgs` | `org.create` | *session only* | none | normal | 2 |
| GET | `/approvals` | `approval.list` | any | viewer | read | 2 |
| GET | `/approvals/{id}` | `approval.get` | any | viewer | read | 2 |
| POST | `/approvals/{id}/decide` | `approval.decide` | *session only* | the requested operation's role | normal | 2 |
| GET | `/agent-tokens` | `agent_token.list` | `admin:write` | viewer | read | 2 |
| POST | `/agent-tokens` | `agent_token.create` | `admin:write` | viewer | high* | 2 |
| DELETE | `/agent-tokens/{id}` | `agent_token.revoke` | `admin:write` | viewer | safety | 2 |
| GET | `/members` | `member.list` | `admin:write` | admin | read | 2 |
| POST | `/invitations` | `member.invite` | `admin:write` | admin | high | 2 |
| PATCH | `/members/{userId}` | `member.role_change` | `admin:write` | admin | high | 2 |
| DELETE | `/members/{userId}` | `member.remove` | `admin:write` | admin | high | 2 |
| GET | `/keys` | `key.get` | `admin:write` | admin | read | 2 |
| POST | `/keys/rotate` | `key.rotate` | `admin:write` | admin | high | 2 |
| DELETE | `/keys` | `key.revoke` | `admin:write` | admin | high | 2 |
| GET | `/settings` | `settings.get` | `sets:read` | viewer | read | 2 |
| PATCH | `/settings` | `settings.update` | `admin:write` | admin | high* | 2 |
| GET | `/price-book` | `price_book.get` | `reports:read` | viewer | read | 2 |
| PUT | `/price-book` | `price_book.update` | `admin:write` | admin | normal | 2 |
| GET | `/plugins` | `plugin.list` | `sets:read` | viewer | read | 5 |
| GET | `/plugins/{id}` | `plugin.get` | `sets:read` | viewer | read | 5 |
| PATCH | `/plugins/{id}` | `plugin.update` | `admin:write` | admin | normal | 5 |
| DELETE | `/org` | `org.delete` | `admin:write` | owner | high | 3 |

- `actor.get` returns the org, user, token id, client, effective role, scopes, set allowlist, expiry and the org's `agentApprovals` setting, so an agent knows what it can do before it tries. `bandwise status` calls it.
- `portfolio.get` backs `/me/portfolio` ([savings-model.md](savings-model.md)): savings and usage for each org where the user is owner or admin, read with that org's own tenant context.
- `org.create` takes `{ slug, name }` and makes the caller the owner. Any signed-in user may call it.
- `approval.list` returns pending approvals: a token sees its own requests, and a session member sees the ones their role can decide. It feeds the Approvals inbox and its count badge.
- `approval.get` returns an approval to the token that requested it and to session members with the required role.
- `approval.decide` takes `{ decision: "approved" | "rejected", note? }`. It is session only, so no token can approve. Rules are in [Approvals](#approvals).
- Keys are per provider (ADR-011, proposed): `typesafe` or `openrouter`. `key.get`, `key.rotate` and `key.revoke` take a `provider` (query parameter on GET and DELETE, body field on rotate), default `typesafe`, so existing callers keep working.
- `key.get` returns, per provider, the key's status, `key_last4`, fingerprint, key mode, the model names it can reach and `rotated_at`. It never returns the key.
- `key.rotate` also saves the org's first key for a provider. It validates the key and stores the reachable model names, and never echoes the key. A TypeSafe key is validated with `GET /v1/models`. An OpenRouter key is validated with OpenRouter's Models API plus one one-noul request on the cheapest reachable route, because the SDK's `models.list()` does not work against OpenRouter ([system-one-api-contract.md](system-one-api-contract.md)).
- Agent tokens: any member manages their own tokens; managing another user's tokens needs admin. A token can always revoke itself without `admin:write` (`bandwise logout`). Minting rules are in [security.md](security.md).
- Invitations and removals count as member role changes.
- Changing a member to or from owner needs the owner role.

### Platform (platform admin only)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/platform/models` | `platform_model.list` | platform admin | superadmin | read | 3 |
| POST | `/platform/models` | `platform_model.create` | platform admin | superadmin | normal | 3 |
| PATCH | `/platform/models/{id}` | `platform_model.update` | platform admin | superadmin | normal | 3 |
| GET | `/platform/price-book` | `platform_price_book.get` | platform admin | superadmin | read | 2 |
| PUT | `/platform/price-book` | `platform_price_book.update` | platform admin | superadmin | normal | 2 |
| GET | `/platform/settings` | `platform_settings.get` | platform admin | superadmin | read | 2 |
| PATCH | `/platform/settings` | `platform_settings.update` | platform admin | superadmin | normal | 2 |
| GET | `/platform/orgs` | `platform_org.list` | platform admin | superadmin | read | 2 |
| POST | `/platform/orgs/{id}/suspend` | `platform_org.suspend` | platform admin | superadmin | normal | 2 |
| PUT | `/platform/orgs/{id}/entitlements` | `platform_org.set_entitlement` | platform admin | superadmin | normal | 2 |
| GET | `/platform/early-access` | `platform_early_access.list` | platform admin | superadmin | read | 2 |
| POST | `/platform/early-access/remove` | `platform_early_access.remove` | platform admin | superadmin | normal | 2 |
| GET | `/platform/reports/{name}` | `platform_report.get` | platform admin | superadmin | read | 3 |

These are session only (`actors: ["user"]`): they need a console session with `platform_role = 'superadmin'` and MFA, and every call that changes something is audited. Org tokens, app tokens and agent tokens get 404. They are still operations, so the platform console calls the registry like the tenant console does.

- `platform_price_book.update` writes the platform default rows of `price_books` (`org_id` null), keyed by exact versioned model id. Alias rows are rejected with `400 invalid_request` ([system-one-models.md](system-one-models.md), Pricing).
- `platform_settings.update` changes the platform `settings` keys: `modelBudgets` (`{ [modelId]: rpm }`, the global limiter budget per model), `defaultComparator`, `defaultModel` and `alertThresholds`.
- `platform_org.suspend` takes `{ suspended: boolean, reason }`. Suspending blocks the org's runs within 30 seconds ([security.md](security.md)).
- `platform_org.set_entitlement` takes `{ key, value, reason }` and writes `entitlement_overrides`.
- `platform_early_access.list` pages the early-access signups (ADR-018). `platform_early_access.remove` takes `{ email, reason }` and deletes that signup, any case; it is the delete path for a privacy request. The email goes in the body, never the path, so it stays out of access logs. Signups arrive through `POST /api/public/early-access`, a plain route outside `/api/v1` and outside the registry, like the device flow.
- `platform_report.get` returns the reports in [savings-model.md](savings-model.md) across all orgs, with an org column.

### Auth (device flow)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| POST | `/auth/device/code` | none | none | none | normal | 2 |
| POST | `/auth/device/token` | none | none | none | normal | 2 |

The device flow (RFC 8628) runs before any tenant context exists, so these are plain route handlers, not operations, and the parity test skips the `/auth/` prefix. It also skips the two public documents, `GET /.well-known/jwks.json` and `GET /openapi.json`, which have no tenant context either. The person approves the device code in a console session, picking the org, scopes and role ceiling; that step is `agent_token.create`. See [security.md](security.md).

## Safe retries and previews

### Idempotency keys

- `Idempotency-Key` is required for app and agent tokens on every mutating operation. Missing: `400 invalid_request`. Two exceptions: runs accept it but do not require it, and `POST /feedback` uses a key per item instead. Console sessions may send one; Server Actions generate one per submit.
- Keys live 24 hours in `idempotency_keys (org_id, actor_key, key, op_id, request_hash, response_status, response jsonb, created_at)`, unique on `(org_id, actor_key, key)`. `actor_key` is the token id or the user id.
- A replay returns the stored status and body with the header `Idempotent-Replayed: true`. The same key with a different body returns `422 idempotency_key_reused`.
- The key row is written in the operation's transaction. A concurrent duplicate blocks on the unique index and then replays the committed response. A failed operation rolls back its key with everything else, so a retry runs again.
- A replayed run returns the original `RunResult` and `runId`, with no second action, usage event or meter push.

### Draft concurrency

- The draft ETag is its `spec_hash`. `GET /sets/{ref}/draft` returns `ETag: "<spec_hash>"`.
- `PUT /sets/{ref}/draft` and `POST /sets/{ref}/publish` require `If-Match`. Missing: `428 precondition_required`. Mismatch: `412 precondition_failed` with `currentEtag`.
- Publishing a draft whose `spec_hash` equals the version already on the target channel returns that version and creates nothing, unless the call carries `interfaceBump`.

### Dry runs

`?dryRun=true` works on publish, rollback, promote, rollout change and try-model. It needs no `Idempotency-Key` and writes nothing.

```ts
DryRunResult = {
  diff: SpecDiff,                 // same shape as GET /sets/{ref}/diff
  lints: ErrorDetail[],           // same shape as error.details in api.md
  gates: GateResult[],            // same shape as error.gates in api.md
  approvalRequired: boolean,      // would this call return 202 with an approval
  interfaceChange: { breaking: string[], additive: string[], majorFrom: number, majorTo: number } | null,
}
```

### Jobs

- Long work returns `202 { jobId }` (evals also return `evalRunId`). Poll `GET /api/v1/jobs/{id}`, which returns `{ id, kind, status, result?, error?, createdAt, finishedAt? }` and a `Retry-After` header while the job runs.
- Kinds: `eval`, `compare`, `calibrate`, `improve`, `try_model`, `policy_suggest`, `export`.
- Table `jobs (org_id, kind, status, input, result, error, created_by_user_id, created_by_token_id, created_at, finished_at)`. Status is `queued`, `running`, `succeeded` or `failed`.
- A finished job emits `job.completed`; an eval job also emits `eval.completed`.
- "Job" always means long-running work. "Operation" always means a registry entry.

## Approvals

When an agent calls a high-risk operation, the API answers `202`:

```json
{ "approval": { "id": "apr_01J...", "status": "pending", "url": "https://console.example.com/approvals/apr_01J...", "expiresAt": "2026-10-03T12:00:00Z" } }
```

- The request is stored in `approval_requests` with the input (including the `If-Match` value it was sent with), its `input_hash`, the requesting token and user, and the reason (the input's `reason` or `changelog`). It emits `approval.requested`.
- **People are told.** On `approval.requested`, Bandwise emails every member whose role can decide, plus the token's own user, with the operation, the reason and the console URL. The console shows a count badge on the Approvals inbox (`approval.list`). If the request is still pending after 24 hours, the email is sent once more.
- `GET /api/v1/approvals/{id}` returns `{ id, opId, status, reason, input, ifMatch, requestedBy, createdAt, expiresAt, decidedBy?, decidedAt?, result? }`. `input` and `ifMatch` are what the agent sent, so the person deciding sees the exact change; `requestedBy` adds the member's `name` and the token's `tokenName` when they can be read. Status is `pending`, `approved`, `rejected`, `expired` or `executed`. After execution, `result` holds the operation's response.
- Only a person in a console session with the role the operation needs can decide, through the session-only operation `approval.decide`. The approver may be the token's own user; what matters is that a person decides. No token can approve.
- On approval, the stored input runs unchanged: the `input_hash` is checked, and if the draft changed since the request, the stored `If-Match` fails with `412` and nothing publishes. The audit row records the agent token as actor and the approval id. The decision emits `approval.decided`.
- Requests expire after 7 days (`approval.decided` with status `expired`).
- `bandwise` exits with code 3 on a pending approval. MCP tools return the pending approval and its URL.
- The approval gate applies only to agent tokens. People act directly, and app tokens cannot reach high-risk operations. The full high-risk list and the `agentApprovals` setting are in [security.md](security.md).

## Holdout rules at the API

These are enforced by the server, not the UI. The loop they protect is in [effectiveness-loop.md](effectiveness-loop.md).

- **The test split never appears in any response.** That covers `dataset.cases`, `dataset.export`, `dataset.features`, eval details and Studio examples. Evals and Studio promotion return aggregate metrics for it only.
- **Calibration views burn cases.** Per-case calibration results are returned only on request, and those cases are then marked burned.
- **Agent labels need a human.** Labels written through an agent token are stored with `label_source` `agent`. They do not count toward promotion, eval gates or rollout gates until a person confirms them with `review.confirm`, which no token can call.

## Tests this surface needs

QA / Evals owns these. Details in [testing.md](testing.md).

- Parity test: every operation has a route and an OpenAPI path; every curated MCP tool and CLI command maps to an operation that is not session only.
- A token calling a session-only operation gets `403 insufficient_scope`.
- An agent resolving a kind `action` review item leaves it `pending_confirmation`; nothing runs until a person calls `review.confirm`.
- A production publish on a `controlled` set (Phase 3b) leaves the pointer on the champion and returns `experimentId`.
- A replayed publish with the same `Idempotency-Key` creates no version.
- A replayed run creates no second `runId`, action or usage event.
- An `If-Match` mismatch returns `412` with `currentEtag`.
- An agent publish to a protected set returns `202` and stays pending until a human approves it; the stored input then runs.
- Moves toward safety (rollback, pause, demote, experiment stop, token revoke) are never gated.
- A token without the scope gets `403 insufficient_scope` for a resource in its own org and `404` for one in another org.
- No endpoint returns a test-split case.
- Demoting the user removes the permission from their agent tokens on the next request.
