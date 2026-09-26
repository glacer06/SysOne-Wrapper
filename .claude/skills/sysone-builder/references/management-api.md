# Management API (`/api/v1`)

Owner: Platform / Tenancy (registry, operations, routes). Console UI calls operations. Integrations owns `@sysone/cli` and the MCP server, which call these routes over HTTP. Phase 3 unless a row says otherwise. Decision record: [ADR-007](../../../../docs/adr/007-headless-parity.md).

## Purpose

This is the management half of `/api/v1`. The run surface, auth modes, feedback and the error envelope are in [api.md](api.md). Management routes use the same auth modes and the same envelope.

Rule: **no capability exists only in the console.** Every console screen reads and changes org data through an operation in this file. The same operation is reachable over HTTP, from `@sysone/cli`, and, when it is on the curated list, from the MCP server ([headless-and-agents.md](headless-and-agents.md)). Three exceptions stay console-only on purpose:

- Stripe checkout and the billing portal (Stripe hosts them).
- Approval decisions (a person must decide; see [Approvals](#approvals)).
- Platform admin impersonation.

## Operation registry

Every capability is one `OperationDef` in `apps/console/src/server/operations`, registered in one map keyed by `id`.

```ts
OperationDef<I, O> = {
  id: string,                 // noun.verb, identical to the audit action: "set.publish", "rollout.change"
  summary: string,            // one line; becomes the OpenAPI summary, CLI help and MCP tool description
  input: ZodType<I>,          // path params, query and body merged into one object
  output: ZodType<O>,
  scope: Scope | ((input: I) => Scope), // a function when the channel decides: release:staging or release:production
  minRole: Role,              // the floor; can() raises it for protected sets and for entering full
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

`emits` and `preview` extend the shape in ADR-007 so the event rule ([events.md](events.md)) and dry runs have one home.

### runOperation

`runOperation(id, ctx, input, { idempotencyKey?, ifMatch?, dryRun? })` runs the same steps for every caller, in this order:

1. **Resolve the actor** into `TenantContext`: console session, app token or agent token. For an agent token, role = min(`role_ceiling`, current membership role), read on every request.
2. **Validate input** with `op.input`. Failure: `400 invalid_request` with `details[]` (JSON Pointers into the body).
3. **Check scope and role** with `can(ctx, op, resource)`. It checks the scope, the role (app tokens have no role, so only scope, set allowlist and channel apply), and resource rules such as "protected sets need an admin to publish". A resource in the caller's org that the actor may not touch: `403 insufficient_scope` with `requiredScope`. A resource in another org, or a set outside the token's allowlist: `404 not_found`.
4. **Approval gate.** Only for agent actors. If the operation is high risk for this input (see [Approvals](#approvals)), store an `approval_requests` row, emit `approval.requested` and return `202`. If the same token already has a request for the same `op_id` and `input_hash` that is pending, or was approved or executed in the last 24 hours, return that request instead of opening a second one. A replayed call therefore gets the same approval back.
5. **Idempotency lookup** by `(org_id, actor_key, key)`. A stored response is replayed.
6. **If-Match check** for operations that require it. Missing: `428 precondition_required`. Mismatch: `412 precondition_failed` with `currentEtag`.
7. **Handler** inside `withTenant`, in one transaction.
8. **Audit row** with `actor_type`, `client`, `actor_token_id` and `approval_id` (security.md).
9. **Event rows** for each type in `op.emits`, in the same transaction.
10. **Store the idempotent response** in the same transaction.

After commit: cache epoch bumps, action dispatch and job enqueue. With `dryRun`, steps 1 to 6 run (step 4 only reports whether approval would be needed), then `op.preview` runs and nothing is written: no audit, event, idempotency or approval row.

An approved request runs through `runOperation` with the stored input, the stored `If-Match` value and `approval_id` set, so step 4 is skipped. The actor is the requesting agent token. Steps 1 and 3 run again: if the token was revoked or the user lost the role, nothing runs and the error is stored in the request's `result`.

### Adapters

- **Server Actions** call `runOperation` with the session context. Console UI code calls operations, never repositories.
- **Route handlers** under `app/api/v1` are generated from each entry's `http` field. They read `Idempotency-Key`, `If-Match` and `?dryRun=true`, call `runOperation`, and map the result to the status code: `200`, `201` for creates, `202` for jobs and approvals.
- **`@sysone/cli` and the MCP server** call `/api/v1` over HTTP with an agent token. Neither imports the registry, the database or a TypeSafe key.
- An operation that also performs another operation's write (codegen that records a binding, for example) calls `can()` for that one too.

### OpenAPI and the parity test

- `openapi.json` is generated from the registry and the zod contracts, committed as `packages/core/openapi.json`, and served at `GET /api/v1/openapi.json`. Each path's `operationId` is the operation id, and the extensions `x-sysone-scope`, `x-sysone-min-role` and `x-sysone-risk` carry the registry metadata. MSW mocks, CLI help and MCP tool schemas come from the same file.
- The parity test runs on every PR ([testing.md](testing.md), Headless API tests). It fails when an operation has no route or no OpenAPI path, when a curated MCP tool maps to no operation, or when code under `app/(org)/**` or `app/(platform)/**` imports a repository.

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

`release:<channel>` means `release:staging` or `release:production`, picked by the channel the call touches. Conditions for `high*`:

- `set.publish` and `channel.promote`: the channel is production and the set is protected or its production stage is `controlled` or `full`. Publishing with `skipExperiment` is always high.
- `rollout.change`: a move into `controlled` or `full` from a lower stage, or any move out of `paused`. Moves into `paused`, and moves from `full` or `controlled` down to `controlled` or `shadow`, are never gated. `inactive` to `shadow` is normal, because nothing executes in shadow.
- `app_token.create` and `agent_token.create`: the new token has a write scope. An `admin:write` agent token is always gated.
- `settings.update`: the change touches PII mode, retention, or lowers `agentApprovals`.

The org setting `agentApprovals` narrows which of these are gated; see [security.md](security.md).

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
| GET | `/sets` | `set.list` | `sets:read` | viewer | read | 3 |
| POST | `/sets` | `set.create` | `sets:write` | editor | normal | 3 |
| GET | `/sets/{ref}` | `set.get` | `sets:read` | viewer | read | 3 |
| PATCH | `/sets/{ref}` | `set.update` | `sets:write` | editor | normal | 3 |
| POST | `/sets/{ref}/archive` | `set.archive` | `sets:write` | editor | normal | 3 |
| GET | `/sets/{ref}/draft` | `draft.get` | `sets:read` | viewer | read | 3 |
| PUT | `/sets/{ref}/draft` | `draft.update` | `sets:write` | editor | normal | 3 |
| POST | `/sets/{ref}/draft/validate` | `draft.validate` | `sets:read` | viewer | read | 3 |

- `set.create` takes `{ slug, name, goalId, fromTemplate?, fromVersion? }`. `fromTemplate` is a template id ([definition-studio.md](definition-studio.md)). `fromVersion` is `slug@n` of another set in the org. The new set has a draft and no published version.
- `set.get` returns the set row, each channel pointer with its version, rollout stage and active experiment, and the live interface major.
- `set.update` changes `name`, `protected` (admin only), `labeling`, `dispatchActionsOnStaging` and `valueSettings`.
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
- `set.publish` takes `{ channel, changelog, requireEval?, skipExperiment? }` and requires `If-Match` with the draft ETag. It runs lints (`422 spec_invalid`), runs the eval gate when required (`409 gate_not_met`), freezes the draft into version N+1, moves the channel pointer and opens a new draft. A channel's first publish creates its pointer at `inactive`. `skipExperiment: { reason }` (Phase 3b) skips champion/challenger on a live set.
- `channel.rollback` takes `{ toVersion? }` and defaults to the previous version on that channel.
- `channel.promote`: `{channel}` is `production`. It points production at the version staging serves, with the same lints and gates as a production publish. To move a version that is already on staging, promote it; do not publish it again.
- The set's protected flag and the `controlled` to `full` rule raise the role to admin inside `can()`.

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
| POST | `/sets/{ref}/experiments` | `experiment.start` | `release:<channel>` | editor | normal | 3b |
| GET | `/experiments/{id}` | `experiment.get` | `sets:read` | viewer | read | 3b |
| POST | `/experiments/{id}/promote` | `experiment.promote` | `release:<channel>` | editor | high | 3b |
| POST | `/experiments/{id}/stop` | `experiment.stop` | `release:<channel>` | editor | safety | 3b |

`experiment.start` takes `{ channel, challengerVersionId, kind: "version" | "model" | "policy", samplePct, minRuns, minLabeled }`. Publishing to production on a `controlled` or `full` set starts one on its own unless `skipExperiment` is set. `experiment.promote` moves the pointer to the challenger when the promotion rule in [effectiveness-loop.md](effectiveness-loop.md) holds; otherwise `409 gate_not_met`.

### Datasets, evals and jobs

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/datasets` | `dataset.list` | `sets:read` | viewer | read | 3 |
| POST | `/datasets` | `dataset.create` | `sets:write` | editor | normal | 3 |
| POST | `/datasets/{id}/cases` | `dataset.import` | `sets:write` | editor | normal | 3 |
| GET | `/datasets/{id}/cases` | `dataset.cases` | `sets:read` | viewer | read | 3 |
| GET | `/datasets/{id}/export` | `dataset.export` | `sets:read` | editor | read | 3 |
| GET | `/datasets/{id}/features` | `dataset.features` | `sets:read` | editor | read | 3b |
| POST | `/evals` | `eval.run` | `evals:run` | editor | normal | 3 |
| GET | `/evals/{id}` | `eval.get` | `sets:read` | viewer | read | 3 |
| POST | `/sets/{ref}/compare` | `set.compare` | `evals:run` | editor | normal | 3 |
| GET | `/jobs/{id}` | `job.get` | any | viewer | read | 3 |

- `dataset.import` takes JSONL, one case per line: `{ state, expected, tags? }`. The server assigns each case's split from a hash of its `state_hash`; imports never set it.
- `dataset.cases` and `dataset.export` never return test-split cases. `dataset.export` is a job and its result is a download link; the export is audited.
- `dataset.features` takes `?version=N` and returns per-question probabilities, noul values and normalized scores joined with labels, for the drafting and calibration splits only.
- `eval.run` takes `{ setRef, version, datasetId, snapshotId?, model?, repeats? }` and returns `202 { jobId, evalRunId }`. `version` may be `draft`. Evals use the eval limiter bucket (security.md).
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
| POST | `/feedback` | `feedback.report` | `feedback:write` | reviewer | normal | 3 |

- `review.list` takes `?kind=action|label` and shows why each item was picked.
- `review.resolve` takes `{ resolution, addToDataset? }` and writes a reviewer row to `run_feedback`. When an agent token resolves an item, the label is stored with `label_source` `agent` and does not count toward gates until a human confirms it.
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
- `policy.suggest` is a job. It replays stored answers with zero System One calls. With `apply: true` it writes the suggested thresholds to the draft, and then needs `sets:write`.
- `proposal.accept` creates a draft only. Nothing publishes on its own.

### Definition Studio

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| POST | `/studio/sessions` | `studio.create` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/examples` | `studio.add_examples` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/draft-definition` | `studio.draft_definition` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/decompose` | `studio.decompose` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/calibrate` | `studio.calibrate` | `evals:run` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/request-labels` | `studio.request_labels` | `sets:write` | editor | normal | 3 |
| POST | `/studio/sessions/{id}/promote` | `studio.promote` | `sets:write` | editor | normal | 3 |
| POST | `/sets/{ref}/improve` | `set.improve` | `evals:run` | editor | normal | 3b |

- `studio.add_examples` takes JSONL with labels and reasons. The server assigns splits.
- `studio.draft_definition` and `studio.decompose` call `llm-client` with the drafting split only.
- `studio.calibrate` is a job on the calibration split. Per-case results come back only with `includeCases: true`, and those cases are then marked burned.
- `studio.request_labels` creates label review items (kind `label`, reason `studio`) for humans.
- `studio.promote` checks the test split and returns only pass or fail and aggregate metrics. On a pass it writes the set's draft (creating the set when the session has none). Publishing and the shadow rollout then go through `set.publish` and `rollout.change`.
- `set.improve` is a job. Its result is a proposal with a draft diff and metric deltas. It never publishes.

### Models

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/models` | `model.list` | `sets:read` | viewer | read | 3 |
| GET | `/models/{id}` | `model.get` | `sets:read` | viewer | read | 3 |
| GET | `/model-upgrades` | `model.upgrades` | `sets:read` | viewer | read | 3b |
| POST | `/sets/{ref}/try-model` | `set.try_model` | `evals:run` | editor | normal | 3b |

- `model.list` returns the models this org can select, each with its `ModelProfile` ([system-one-models.md](system-one-models.md)). Unreviewed models are left out; preview models appear only when the org sets `allowPreviewModels`.
- `set.try_model` takes `{ model }` and is a job. It clones production into a draft that changes only the model, evals both on the same dataset snapshot, runs the threshold suggester and opens a `model_upgrade` proposal.

### Apps and integration

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/apps` | `app.list` | `sets:read` | viewer | read | 3 |
| POST | `/apps` | `app.create` | `apps:write` | admin | normal | 3 |
| PATCH | `/apps/{id}` | `app.update` | `apps:write` | admin | normal | 3 |
| POST | `/apps/{id}/tokens` | `app_token.create` | `apps:write` | admin | high* | 3 |
| DELETE | `/apps/{id}/tokens/{tokenId}` | `app_token.revoke` | `apps:write` | admin | safety | 3 |
| GET | `/apps/{id}/opportunities` | `opportunity.list` | `sets:read` | viewer | read | 4b |
| POST | `/apps/{id}/opportunities` | `opportunity.create` | `apps:write` | editor | normal | 4b |
| PATCH | `/apps/{id}/opportunities/{oid}` | `opportunity.update` | `apps:write` | editor | normal | 4b |
| GET | `/apps/{id}/bindings` | `binding.list` | `sets:read` | viewer | read | 4b |
| POST | `/apps/{id}/bindings` | `binding.create` | `apps:write` | editor | normal | 4b |
| DELETE | `/apps/{id}/bindings/{bid}` | `binding.remove` | `apps:write` | editor | normal | 4b |
| GET | `/sets/{ref}/codegen` | `set.codegen` | `sets:read` | viewer | read | 4b |

- `app_token.create` shows the secret once. Revoking ships with creating, in Phase 3.
- `set.codegen` takes `?lang=&channel=&version=&appId=`, where `lang` is `ts` or `py` (`py` stays behind ADR-009). With `appId` it also records a binding, which checks `apps:write`. See [deploy-and-codegen.md](deploy-and-codegen.md).

### Reports, audit and events

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/reports/{name}` | `report.get` | `reports:read` | viewer | read | 3 |
| GET | `/alerts` | `alert.list` | `reports:read` | viewer | read | 3 |
| GET | `/audit` | `audit.list` | `audit:read` | admin | read | 3 |
| GET | `/events` | `event.list` | `events:read` | viewer | read | 3 |

`report.get` takes `?format=json` or `csv`. Report names are the reports in [savings-model.md](savings-model.md), including `model-upgrades` (Phase 3b). The event feed is in [events.md](events.md).

### Identity, tokens and admin

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/me` | `actor.get` | any | viewer | read | 2 |
| GET | `/approvals/{id}` | `approval.get` | any | viewer | read | 2 |
| GET | `/agent-tokens` | `agent_token.list` | `admin:write` | viewer | read | 2 |
| POST | `/agent-tokens` | `agent_token.create` | `admin:write` | viewer | high* | 2 |
| DELETE | `/agent-tokens/{id}` | `agent_token.revoke` | `admin:write` | viewer | safety | 2 |
| GET | `/members` | `member.list` | `admin:write` | admin | read | 3 |
| POST | `/invitations` | `member.invite` | `admin:write` | admin | high | 3 |
| PATCH | `/members/{userId}` | `member.role_change` | `admin:write` | admin | high | 3 |
| DELETE | `/members/{userId}` | `member.remove` | `admin:write` | admin | high | 3 |
| POST | `/keys/rotate` | `key.rotate` | `admin:write` | admin | high | 3 |
| DELETE | `/keys` | `key.revoke` | `admin:write` | admin | high | 3 |
| GET | `/settings` | `settings.get` | `sets:read` | viewer | read | 3 |
| PATCH | `/settings` | `settings.update` | `admin:write` | admin | high* | 3 |
| GET | `/price-book` | `price_book.get` | `reports:read` | viewer | read | 3 |
| PUT | `/price-book` | `price_book.update` | `admin:write` | admin | normal | 3 |
| GET | `/plugins/{id}` | `plugin.get` | `sets:read` | viewer | read | 5 |
| PATCH | `/plugins/{id}` | `plugin.update` | `admin:write` | admin | normal | 5 |
| DELETE | `/org` | `org.delete` | `admin:write` | owner | high | 3 |

- `actor.get` returns the org, user, token id, client, effective role, scopes, set allowlist, expiry and the org's `agentApprovals` setting, so an agent knows what it can do before it tries. `sysone status` calls it.
- `approval.get` returns an approval to the token that requested it and to session members with the required role.
- Agent tokens: any member manages their own tokens; managing another user's tokens needs admin. A token can always revoke itself without `admin:write` (`sysone logout`). Minting rules are in [security.md](security.md).
- Invitations and removals count as member role changes.
- Changing a member to or from owner needs the owner role.

### Platform (platform admin only)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| GET | `/platform/models` | `platform_model.list` | platform admin | superadmin | read | 3 |
| POST | `/platform/models` | `platform_model.create` | platform admin | superadmin | normal | 3 |
| PATCH | `/platform/models/{id}` | `platform_model.update` | platform admin | superadmin | normal | 3 |

These need `platform_role = 'superadmin'` with MFA and are audited. Org tokens get 404.

### Auth (device flow)

| Method | Path | Operation | Scope | Min role | Risk | Phase |
|---|---|---|---|---|---|---|
| POST | `/auth/device/code` | none | none | none | normal | 2 |
| POST | `/auth/device/token` | none | none | none | normal | 2 |

The device flow (RFC 8628) runs before any tenant context exists, so these are plain route handlers, not operations, and the parity test skips the `/auth/` prefix. The person approves the device code in a console session, picking the org, scopes and role ceiling; that step is `agent_token.create`. See [security.md](security.md).

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
- Publishing a draft whose `spec_hash` equals the version already on the target channel returns that version and creates nothing.

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
- `GET /api/v1/approvals/{id}` returns `{ id, opId, status, reason, requestedBy, expiresAt, decidedBy?, decidedAt?, result? }`. Status is `pending`, `approved`, `rejected`, `expired` or `executed`. After execution, `result` holds the operation's response.
- Only a person in a console session with the role the operation needs can decide. The approver may be the token's own user; what matters is that a person decides. No token can approve.
- On approval, the stored input runs unchanged: the `input_hash` is checked, and if the draft changed since the request, the stored `If-Match` fails with `412` and nothing publishes. The audit row records the agent token as actor and the approval id. The decision emits `approval.decided`.
- Requests expire after 7 days (`approval.decided` with status `expired`).
- `sysone` exits with code 3 on a pending approval. MCP tools return the pending approval and its URL.
- The approval gate applies only to agent tokens. People act directly, and app tokens cannot reach high-risk operations. The full high-risk list and the `agentApprovals` setting are in [security.md](security.md).

## Holdout rules at the API

These are enforced by the server, not the UI. The loop they protect is in [effectiveness-loop.md](effectiveness-loop.md).

- **The test split never appears in any response.** That covers `dataset.cases`, `dataset.export`, `dataset.features`, eval details and Studio examples. Evals and Studio promotion return aggregate metrics for it only.
- **Calibration views burn cases.** Per-case calibration results are returned only on request, and those cases are then marked burned.
- **Agent labels need a human.** Labels written through an agent token are stored with `label_source` `agent`. They do not count toward promotion, eval gates or rollout gates until a human confirms them.

## Tests this surface needs

QA / Evals owns these. Details in [testing.md](testing.md).

- Parity test: every operation has a route and an OpenAPI path; every curated MCP tool maps to an operation.
- A replayed publish with the same `Idempotency-Key` creates no version.
- A replayed run creates no second `runId`, action or usage event.
- An `If-Match` mismatch returns `412` with `currentEtag`.
- An agent publish to a protected set returns `202` and stays pending until a human approves it; the stored input then runs.
- Moves toward safety (rollback, pause, demote, experiment stop, token revoke) are never gated.
- A token without the scope gets `403 insufficient_scope` for a resource in its own org and `404` for one in another org.
- No endpoint returns a test-split case.
- Demoting the user removes the permission from their agent tokens on the next request.
