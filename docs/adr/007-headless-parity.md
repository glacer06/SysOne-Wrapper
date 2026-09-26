# ADR-007: Headless parity (operation registry, agent tokens, approvals)

- **Status:** accepted (decided by Nick, 2026-09-26)
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Contract impact:** `TenantContext` actor union (new `agent` actor, `Role` and `Scope` unions), `OperationDef`, error envelope v2, new scopes, new tables `agent_tokens`, `approval_requests`, `idempotency_keys`, `jobs` and `events`, new `audit_log` columns. `openapi.json` is generated from the operation registry.

## Context

On 2026-09-26 Nick asked that SysOne "have a UI/UX but also be headless so an agent can manage it as well." Headless means an agent can do everything a person can do in the console, under the same checks.

The plan before this ADR could not deliver that:

- The only programmatic surface was run, list sets, manifest, get run, review list and resolve, and usage. An agent could not create a set, edit a draft, publish, roll back, change rollout, run an eval, read reports or audit, or manage apps, tokens, keys or members.
- Console mutations were Server Actions. Agents cannot call them, so the console would never be built on the API, and the gap would grow with every feature.
- App tokens had no write scopes and no role. Governance is role-based (protected sets need an admin to publish, and controlled to full needs an admin), so builders would have to lock agents out or quietly give tokens admin power.
- The MCP server could only list and run sets, and it shipped last, in Phase 7.
- PLAN.md's Phase 3 gate promised publish and rollback "via API", and api.md listed `409 version_conflict` for publishing over a changed draft, yet no publish or rollback endpoint existed.
- Nothing made retries safe. Publishing freezes the draft into version N+1 and clones a new draft, so a retried publish would create N+2 and move the pointer again. A retried run gets a new `runId`, so actions keyed on it fire twice and the Stripe meter bills twice.
- Errors carried only `{ code, message, requestId }`. An agent had no field path, lint id, gate detail or retry signal to act on.

The contracts freeze at the end of Phase 0 part two. After that, v1 changes are additive only, so the management surface has to be in the contracts before the freeze.

## Decision

### 1. One operation registry behind every surface

Every console capability is one operation in `apps/console/src/server/operations`, defined once:

```ts
OperationDef<I, O> = {
  id: string,                 // noun.verb, identical to the audit action: "set.publish", "rollout.change"
  summary: string,            // one line; becomes the OpenAPI summary, CLI help and MCP tool description
  input: ZodType<I>,          // path params, query and body merged into one object
  output: ZodType<O>,
  scope: Scope | "any" | ((input: I) => Scope),
                              // a function when the channel decides: release:staging or release:production;
                              // "any": any authenticated actor in the org, no particular scope (job.get, actor.get, approval.get)
  minRole: Role | "superadmin", // the floor; can() raises it for protected sets, entering full and skipExperiment;
                              // "superadmin": users.platform_role, not an org role (platform_* operations)
  actors: Array<"user" | "agent" | "apiKey" | "system">, // who may call it; ["user"] means session only
  risk: "normal" | "high"
      | ((ctx: TenantContext, input: I,
          resource: { protected: boolean, productionStage: RolloutStage | null }) => "normal" | "high"),
                              // a function for the conditional high* rows of the catalog
  towardSafety: boolean,      // only ever makes things safer (pause, rollback, demote, stop, revoke): never gated
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

This is the same shape as [management-api.md](../../.claude/skills/sysone-builder/references/management-api.md), which carries the catalog and the `DryRunResult` type. `actors` defaults to `["user", "agent"]`.

`runOperation(id, ctx, input, { idempotencyKey?, ifMatch?, dryRun? })` runs the same steps for every caller: resolve the actor, validate the input, check actor, scope and role with `can()`, apply the approval gate, look up the idempotency key, check `If-Match`, run the handler inside `withTenant`, write the audit row and the events in `emits`, and store the idempotent response. With `dryRun`, it stops before the handler, runs `preview` and writes nothing.

The approval-gate step of `runOperation` (step 4 in management-api.md) calls `risk` when it is a function; the `high*` conditions in the catalog are implemented there.

- Server Actions and `/api/v1` route handlers are thin adapters over `runOperation`. Console UI code calls operations, never repositories.
- `@sysone/cli` and the MCP server call `/api/v1` over HTTP. Neither touches the database or a TypeSafe key.
- `openapi.json` is generated from the registry and served at `GET /api/v1/openapi.json`. MSW mocks come from the same file.
- A CI parity test fails when an operation has no route or no OpenAPI path, or when a curated MCP tool or CLI command maps to no operation or to a session-only operation.
- No operation at all: Stripe checkout and the billing portal (Stripe hosts them), and platform admin impersonation.
- Session-only operations (`actors: ["user"]`), such as `approval.decide` and the platform admin operations, have routes and OpenAPI paths, but no token can call them.

The MCP server exposes a curated set of tools that wrap operations, not one tool per operation. Tool input schemas are the operation zod schemas converted to JSON Schema, and `readOnlyHint` and `destructiveHint` come from the registry. Member, key and token admin stay in the API and the CLI.

### 2. Agent tokens

One new token type serves agents, the CLI, the MCP server and the Chrome extension:

- Prefix `sa_live_`, table `agent_tokens (org_id, user_id, name, client cli|mcp|extension|console, hash, scopes, role_ceiling, set_ids, daily_spend_cap_micro_usd, expires_at, revoked_at, last_used_at)`. Expiry is at most 90 days.
- Each token belongs to one user in one org. The CLI and the MCP server keep one named profile per org, so Nick's SGR, Personal and Dallas orgs each get their own token.
- The `TenantContext` actor union gains:

  ```ts
  { type: "agent"; tokenId: string; userId: string; role: Role; scopes: Scope[]; setIds: string[] | null; client: "cli" | "mcp" | "extension" | "console" }
  ```

  `role` is `min(role_ceiling, current membership role)`, recomputed on every request. Demoting or removing the user shrinks the token at once. `can()` requires both the scope and the role.
- Tokens are minted in the console or through an RFC 8628 device flow (`POST /api/v1/auth/device/code` and `POST /api/v1/auth/device/token`). The Chrome extension signs in the same way.
- A token can mint only tokens whose scopes it already holds, and never `admin:write`. The optional daily spend cap counts System One cost from the runs and evals the token starts. Over the cap the API returns `402 token_budget_exceeded`.
- App tokens (`sk_`, `pk_`, browser JWT) stay for host-app runtime only.

Scopes, final list: `run`, `sets:read`, `sets:write`, `evals:run`, `release:staging`, `release:production`, `runs:read`, `runs:write`, `review:read`, `review:write`, `feedback:write`, `usage:read`, `reports:read`, `audit:read`, `events:read`, `apps:write`, `admin:write`. `release:production` covers production publish, promote and rollback, and rollout changes. `feedback:write` is never granted to a `pk_` token.

### 3. Approval gate

Approval is not an error. When an agent calls a high-risk operation, the API answers `202` with:

```json
{ "approval": { "id": "apr_01J...", "status": "pending", "url": "https://console.example.com/approvals/apr_01J...", "expiresAt": "2026-10-03T12:00:00Z" } }
```

and stores a row in `approval_requests (org_id, op_id, input jsonb, input_hash, if_match null, requested_by_token_id, requested_by_user_id, reason, status pending|approved|rejected|expired|executed, decided_by_user_id, decided_at, expires_at, result, created_at)`. `if_match` keeps the `If-Match` value the agent sent, so the approved run is checked against the same version. Only a human in a console session with the required role can approve. The stored input then runs unchanged (the `input_hash` is checked), and the result is written back to the row. Requests expire after 7 days. The CLI exits with code 3 and the MCP tool returns the pending approval and its URL.

High-risk operations:

- publish or promote on production for a protected set, or for a set whose production stage is `controlled` or `full`
- rollout moves into `controlled` or `full` from a lower stage, or out of `paused` (`inactive` to `shadow` is normal, because nothing executes in shadow)
- skipping champion/challenger
- experiment promotion
- TypeSafe key rotation or revocation
- creating tokens (app or agent) with write scopes
- member role changes, including invitations and removals
- PII or retention changes
- lowering `agentApprovals`
- org deletion

Moves toward safety (pause, rollback, demote, experiment stop and token revocation) are never gated, even on production for a protected set, so an agent can always make things safer without waiting for a human. That is why rollback is not on the list above.

Per-org setting `agentApprovals`:

| Value | Effect |
|---|---|
| `required` (default) | Every high-risk operation above is gated. |
| `production_only` | Only release and rollout operations that touch the production channel are gated, plus the always-gated list. |
| `off` | Only the always-gated list is gated. |

Always gated, whatever the setting: TypeSafe key rotation or revocation, member role changes, PII and retention changes, org deletion, creating `admin:write` tokens, and lowering `agentApprovals` itself. Without that last item, an agent with `admin:write` could switch the gate off.

### 4. Safe retries, concurrency, previews and jobs

- **Idempotency.** `Idempotency-Key` is required for token and agent actors on every mutating operation and accepted on runs. Keys live 24 hours in `idempotency_keys`. A replay returns the stored response. The same key with a different body returns `422 idempotency_key_reused`. A replayed run returns the original `RunResult` and `runId`, with no second action, usage event or meter push.
- **Draft concurrency.** The draft ETag is its `spec_hash`. `PUT /sets/{ref}/draft` and `POST /sets/{ref}/publish` require `If-Match`. A mismatch returns `412 precondition_failed` with `currentEtag`. This replaces `409 version_conflict`, which had no mechanism behind it.
- **No-op publish.** Publishing a draft whose `spec_hash` equals the version already on the target channel returns that version and creates nothing.
- **Dry runs.** `dryRun` on publish, rollback, promote, rollout change and model trial returns `{ diff, lints, gates, approvalRequired, interfaceChange }` and writes nothing.
- **Jobs.** Long work (evals, compare, calibration, improve mode, model trials, threshold suggestions, exports) returns `202 { jobId }`, polled with `GET /api/v1/jobs/{id}`. "Job" always means long-running work, and "operation" always means a registry entry.

### 5. Error envelope v2

```ts
ErrorEnvelope = { error: {
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  details?: Array<{ path: string /* JSON Pointer into the body or spec */, rule: string /* stable lint id */, severity: "error" | "warning", message: string }>,
  gates?: Array<{ id: string, required: unknown, actual: unknown, met: boolean }>,
  requiredScope?: Scope,
  currentEtag?: string,
  runId?: string,
} }
```

New codes: `403 insufficient_scope` (the resource is in the caller's org but the token lacks the scope or role; cross-org requests still return 404), `409 gate_not_met`, `412 precondition_failed`, `422 idempotency_key_reused` and `402 token_budget_exceeded`. `retryable` is true for rate limits and for System One overload or unavailability, and false for auth, validation and quota errors. `draft/validate` returns warnings and errors in the same `details` shape. The full code table lives in api.md.

### 6. Attribution and events

- `audit_log` gains `actor_type (user|agent|app|system)`, `client (console|api|cli|mcp|extension|job)` and `approval_id`.
- Versions and release events record both the user and the token (`created_by_user_id`, `created_by_token_id`, `actor_user_id`, `actor_token_id`), so an agent publish has a defined author.
- Every operation that changes state names the events it emits in `emits`. Events are written to the `events` table in the same transaction as the audit row and read through `GET /api/v1/events` (scope `events:read`), which the CLI and MCP server poll because they have no public URL.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Server Actions only (status quo) | Fastest to build | No agent access at all; parity never happens |
| Service functions without registry metadata | Simple, familiar | Scopes, approvals, idempotency, OpenAPI and MCP annotations get re-implemented in every adapter and drift apart |
| MCP tools generated 1:1 from `openapi.json` | No curation work | Floods MCP clients with tools; exposes member and key admin to chat agents |
| Management app tokens or an "automation" app kind | Reuses the app token code | No user identity and no role; cannot shrink when the user is demoted; approvals have no requester |
| OAuth 2.1 and cross-org tokens | Standard delegated auth across orgs | More than needed; the device flow plus one profile per org covers Nick's three orgs and keeps the org as the security boundary (ADR-001) |
| Operation registry plus agent tokens and approvals (chosen) | One place decides scope, role, risk, approval, idempotency and audit for every surface | Console work defines the operation before the screen |

## Consequences

- Agents get the same capabilities, checks and audit trail as people. OpenAPI, MSW mocks, CLI help and MCP tool schemas all come from the registry.
- Console work pays a small tax: define the operation (schemas, scope, role, risk, route) before building the screen. A console feature is not done until its route and OpenAPI path exist and the parity test passes.
- The approvals UI and inbox are required in Phase 3, before any agent can publish to production.
- Ownership: Platform / Tenancy owns the registry, services and routes. Console UI calls operations. Integrations owns `@sysone/cli` and the MCP server.
- Tests QA must add: the parity test; a replayed publish creates no version; a replayed run creates no second `runId`, action or usage event; an `If-Match` mismatch returns 412; an agent publish to a protected set stays pending until approved; `inactive` to `shadow` is not gated and `shadow` to `controlled` is; lowering `agentApprovals` stays pending even when the setting is `off`; moves toward safety are never gated; `insufficient_scope` in the caller's org and 404 across orgs; demoting the user removes the token's permission on the next request.
- Docs that carry the detail: [management-api.md](../../.claude/skills/sysone-builder/references/management-api.md) (registry, catalog, safe retries), [headless-and-agents.md](../../.claude/skills/sysone-builder/references/headless-and-agents.md) (CLI, MCP, profiles), [events.md](../../.claude/skills/sysone-builder/references/events.md), [api.md](../../.claude/skills/sysone-builder/references/api.md) (auth modes and error table), [security.md](../../.claude/skills/sysone-builder/references/security.md) (agent tokens and approvals), [conventions.md](../../.claude/skills/sysone-builder/references/conventions.md), [data-model.md](../../.claude/skills/sysone-builder/references/data-model.md) and [testing.md](../../.claude/skills/sysone-builder/references/testing.md).

## Rollout

- **Phase 0 part two:** `OperationDef`, the agent actor, the `Role` and `Scope` unions and error envelope v2 land in `packages/core/src/contracts`, and the registry skeleton in `apps/console/src/server/operations`, before the freeze. This ADR is accepted in the same step. No code exists yet, so these are doc edits, not per-field ADRs.
- **Phase 2:** agent tokens and the device flow, the approval gate and `approval_requests`, idempotency keys and `If-Match`.
- **Phase 3:** every operation in management-api.md, the parity test, `@sysone/cli` management commands, the MCP server over stdio and the event feed.
- **Phase 7:** the MCP HTTP transport and the Claude Code plugin packaging.
- **Reversal:** if the approval gate is too strict for an org, an owner changes `agentApprovals`; the always-gated list stays. To stop all agent access in an org, revoke its agent tokens. Removing or demoting the user takes effect on the next request because the role is recomputed each time.
