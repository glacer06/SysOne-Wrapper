# Public API (`/api/v1`)

This file covers auth modes, the run surface, feedback and the error envelope. Management endpoints (sets, drafts, releases, rollout, datasets, evals, apps, admin) are in [management-api.md](management-api.md). They share this envelope and these auth modes.

The OpenAPI document is generated from the zod contracts and the operation registry, committed to `packages/core/openapi.json`, and served at `GET /api/v1/openapi.json`. The embed kit, the CLI, the MCP server and the Chrome extension build against it. MSW mocks are generated from the same file.

## Auth modes

| Mode | Header | Who |
|---|---|---|
| Console session | cookie | Signed-in users, scoped to the active org |
| Secret app token | `Authorization: Bearer sk_live_...` or `sk_test_...` | Server-to-server host apps (not agents) |
| Publishable token | `Authorization: Bearer pk_live_...` | Browsers, with origin allowlist and set scoping, low RPM, run-only |
| Browser token | `Authorization: Bearer <jwt>` | 5-minute ES256 JWT minted with `POST /api/v1/tokens/browser` (`sk_` auth), signed by a platform key with `kid`; JWKS at `/api/v1/.well-known/jwks.json`; bound to origin and set list |
| Agent token | `Authorization: Bearer sa_live_...` | CLI, MCP server, CI and agents acting for one user in one org; see [headless-and-agents.md](headless-and-agents.md) |

The device flow, `POST /api/v1/auth/device/code` and `POST /api/v1/auth/device/token` (RFC 8628), issues agent tokens for the CLI, the MCP server and the Chrome extension. Scopes, role ceilings and approvals are in [security.md](security.md).

`slug@draft` runs the set's mutable draft version and behaves as shadow. It is allowed for console sessions, `sk_test_` tokens and agent tokens with `sets:write`; never for `sk_live_` or `pk_live_`. App tokens carry a bound channel (production by default); a token cannot request another channel.

## Endpoints (run surface)

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/api/v1/sets/{ref}/run` | `run` | `ref` is an id or slug. `slug@7` pins a version. `slug@draft` as above. `?channel=production` or `staging` only for sessions and agent tokens; app tokens use their bound channel. `409 set_not_live` when the channel's rollout stage is `inactive`. |
| GET | `/api/v1/sets` | `sets:read` | Sets visible to the token |
| GET | `/api/v1/sets/{ref}/manifest` | `sets:read` | Input schema, question ids, labels and types, choice option keys, score level counts, composite ids, route outputs, the action enum, `interfaceMajor`, `interfaceHash`, model and version. No instructions, criteria or thresholds. |
| GET | `/api/v1/runs/{id}` | `runs:read` | Run envelope (state omitted unless stored) |
| GET | `/api/v1/review` | `review:read` | Open review items |
| POST | `/api/v1/review/{id}/resolve` | `review:write` | Resolve, optionally add to dataset |
| GET | `/api/v1/usage` | `usage:read` | Usage and savings rollups for the org |
| POST | `/api/v1/feedback` | `feedback:write` | 1 to 1,000 outcome reports; see [Feedback](#feedback). `sk_` and agent tokens, never `pk_`. |
| POST | `/api/v1/runs/ingest` | `runs:write` | Phase 4b, standalone deploy target only. `{ setRef, version, model, answers, usage, latencyMs, stateHash, state? }`, where `state` is already redacted. Keeps the ledger, review and calibration working for exported sets ([deploy-and-codegen.md](deploy-and-codegen.md)). |
| POST | `/api/v1/tokens/browser` | `run` | `sk_` auth only. Body names the origin and the sets (a subset of the token's allowlist). Returns `{ token, expiresAt }`. |
| GET | `/api/v1/.well-known/jwks.json` | none | Public keys for browser tokens |
| GET | `/api/v1/models` | `sets:read` | The System One models this org can select, with their profiles ([system-one-models.md](system-one-models.md)) |
| GET | `/api/v1/openapi.json` | none | The generated OpenAPI document |

Management endpoints: [management-api.md](management-api.md).

### Run request

```json
{
  "state": { "email": { "from": "...", "subject": "...", "body": "..." } },
  "options": {
    "includeProbabilities": true,
    "dryRun": false,
    "externalRef": "ticket_48213",
    "metadata": { "tokensBefore": 120000, "tokensAfter": 18000 }
  }
}
```

- Body fields: `state` and `options { includeProbabilities?, dryRun?, externalRef?, metadata?: { tokensBefore?, tokensAfter? } }`. The full `RunRequest` contract is in [spec-schema.md](spec-schema.md).
- `externalRef` is the caller's own id for the thing being decided. Feedback can match a run by it later.
- `dryRun` compiles and preflights, then returns the compiled System One payload per stage and the token estimate against the model's limits. It makes no System One call, writes no run row and records no usage.
- `includeProbabilities` only shapes the response. Runs always store the full answers, with probabilities.

Headers:

- `Idempotency-Key` (optional). A replay within 24 hours returns the original `RunResult` and `runId`, with no second action, usage event or meter push.
- `SysOne-Interface` (optional): the interface major the caller was built against. If the channel's version has a different major, the run returns `409 interface_mismatch`. There is no silent fallback to an older version.

### Run response

The standard `RunResult` envelope; see [savings-model.md](savings-model.md). It carries `version` and `versionId`, `interfaceMajor`, `interfaceHash`, and `rollout` (read from the channel pointer, not the spec).

Headers: `ETag: <versionId>`, `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

Failed runs are persisted with their `status`. When a run row was written, the error envelope includes its `runId`.

## Feedback

`POST /api/v1/feedback` reports what actually happened after a decision, so precision can be measured in every rollout stage.

- Body: `{ items: FeedbackReport[] }` with 1 to 1,000 items. The `FeedbackReport` contract is in [effectiveness-loop.md](effectiveness-loop.md).
- Each item is matched to a run by `runId` or by `externalRef`.
- Each item carries its own `idempotencyKey`. A repeated key is reported as a duplicate, not an error. The request needs no `Idempotency-Key` header.
- The response is `200` with one result per item, in order: `{ results: [{ index, status: "created" | "duplicate" | "error", feedbackId?, error? }] }`. Items succeed or fail independently; `error` uses the envelope's `code` and `message`.
- Allowed for `sk_` app tokens and agent tokens with `feedback:write`. Never for `pk_` tokens or browser tokens.

## Error envelope (v2)

```ts
ErrorEnvelope = { error: {
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  details?: Array<{
    path: string,              // JSON Pointer into the request body or the spec
    rule: string,              // stable id, for example a lint rule id
    severity: "error" | "warning",
    message: string,
  }>,
  gates?: Array<{ id: string, required: unknown, actual: unknown, met: boolean }>,
  requiredScope?: Scope,
  currentEtag?: string,
  runId?: string,
} }
```

Example:

```json
{ "error": {
  "code": "preflight_too_large",
  "message": "State plus longest question is 41,200 tokens; jev-1.13.0 allows 32,000.",
  "requestId": "req_01J...",
  "retryable": false
} }
```

A spec error names the field and the lint:

```json
{ "error": {
  "code": "spec_invalid",
  "message": "The spec failed 1 lint.",
  "requestId": "req_01J...",
  "retryable": false,
  "details": [{ "path": "/model", "rule": "model.alias_past_shadow", "severity": "error", "message": "jev-latest is a moving model. Pin a versioned model before controlled." }]
} }
```

| HTTP | Code | Retryable | When |
|---|---|---|---|
| 400 | `invalid_state` | no | State fails `input.schema`; `details` point into the state |
| 400 | `invalid_request` | no | Body or query fails the operation's input schema, or a required header is missing; `details` point at the fields |
| 401 | `unauthenticated` | no | Missing or bad token |
| 402 | `quota_exceeded` | no | Plan quota reached; body includes upgrade link |
| 402 | `token_budget_exceeded` | no | The agent token's daily spend cap is reached |
| 403 | `insufficient_scope` | no | The resource is in the caller's org, but the token lacks the scope or role; includes `requiredScope`. Cross-org requests stay 404. |
| 404 | `not_found` | no | Unknown resource, a set outside the token's allowlist, or a resource in another org |
| 409 | `already_exists` | no | A create names a slug that is already taken in the org |
| 409 | `gate_not_met` | no | A rollout, publish or promotion gate failed; `gates[]` lists each gate |
| 409 | `interface_mismatch` | no | `SysOne-Interface` differs from the channel version's major; the message names the live major |
| 409 | `set_not_live` | no | The channel's rollout stage is `inactive` |
| 412 | `precondition_failed` | no | `If-Match` does not match the draft; includes `currentEtag` |
| 413 | `preflight_too_large` | no | Token preflight failed against the model's limits |
| 422 | `spec_invalid` | no | Spec failed validation or lints; `details[]` carry lint rule ids |
| 422 | `idempotency_key_reused` | no | Same `Idempotency-Key` with a different body |
| 422 | `model_unavailable` | no | The model is unknown, unreviewed, or not reachable by the org's key |
| 422 | `model_unpriced` | no | Platform-key mode only: the model has no price book row |
| 428 | `precondition_required` | no | `If-Match` is missing where it is required |
| 429 | `rate_limited` | yes | Org, token, eval or global limit; `Retry-After` set |
| 429 | `system_one_rate_limited` | yes | TypeSafe rate-limited the call after SDK retries |
| 502 | `system_one_invalid_request` | no | TypeSafe rejected the compiled payload (our bug; log the payload hash) |
| 502 | `system_one_forbidden` | no | The org's key cannot use that model |
| 503 | `system_one_unavailable` | yes | TypeSafe unreachable or timed out after SDK retries |
| 503 | `system_one_overloaded` | yes | TypeSafe overloaded after SDK retries |
| 503 | `system_one_auth` | no | The org's TypeSafe key is invalid; org admins notified |

The SDK error mapping behind the `system_one_*` codes is in [system-one-api-contract.md](system-one-api-contract.md).

**Approval is not an error.** When an agent calls a high-risk operation, the API returns `202 { approval: { id, status: "pending", url, expiresAt } }`. See [management-api.md](management-api.md#approvals).

## Versioning

The path carries the API version. Additive changes only within `v1`. Breaking changes need an ADR and `v2`.

That is why the neutral names (`system_one_*` codes, `systemOne*` fields) and the envelope v2 fields land before the Phase 0 part two freeze: after it, renaming them would be a breaking change.

The API version and a set's `interfaceMajor` are separate. The first versions the HTTP surface; the second versions one set's questions, options and routes ([deploy-and-codegen.md](deploy-and-codegen.md)).
