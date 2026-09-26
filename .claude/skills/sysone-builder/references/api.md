# Public API (`/api/v1`)

The OpenAPI document is generated from the zod contracts and committed to `packages/core/openapi.json`. The embed kit, MCP server, and Chrome extension build against it. MSW mocks are generated from the same file.

## Auth modes

| Mode | Header | Who |
|---|---|---|
| Console session | cookie | Signed-in users, scoped to the active org |
| Secret app token | `Authorization: Bearer sk_live_...` | Server-to-server, host apps, MCP server |
| Publishable token | `Authorization: Bearer pk_live_...` | Browsers, with origin allowlist and set scoping, low RPM, run-only |
| Browser token | `Authorization: Bearer <jwt>` | 5-minute JWT minted by a host server, bound to origin and set list |

`sk_test_` tokens may run drafts. Live tokens may not.

## Endpoints

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/api/v1/sets/{ref}/run` | `run` | `ref` is an id or slug. `?channel=production` (default) or `staging`. `slug@7` pins a version. `slug@draft` for console or `sk_test_` only. |
| GET | `/api/v1/sets` | `sets:read` | Sets visible to the token |
| GET | `/api/v1/sets/{ref}/manifest` | `sets:read` | Input schema, question labels, options, no internals |
| GET | `/api/v1/runs/{id}` | `runs:read` | Run envelope (state omitted unless stored) |
| GET | `/api/v1/review` | `review:read` | Open review items |
| POST | `/api/v1/review/{id}/resolve` | `review:write` | Resolve, optionally add to dataset |
| GET | `/api/v1/usage` | `usage:read` | Usage and savings rollups for the org |

### Run request

```json
{
  "state": { "email": { "from": "...", "subject": "...", "body": "..." } },
  "options": { "includeProbabilities": true, "dryRun": false, "metadata": { "tokensBefore": 120000 } }
}
```

### Run response

The standard `RunResult` envelope. See `savings-model.md`. Headers: `ETag: <versionId>`, `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

## Error envelope

```json
{ "error": { "code": "preflight_too_large", "message": "State plus longest question is 41,200 tokens; limit is 32,000.", "requestId": "req_..." } }
```

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_state` | State fails `input.schema` |
| 401 | `unauthenticated` | Missing or bad token |
| 402 | `quota_exceeded` | Plan quota reached; body includes upgrade link |
| 404 | `not_found` | Unknown set, or a set in another org |
| 409 | `version_conflict` | Publishing over a changed draft |
| 413 | `preflight_too_large` | Token preflight failed |
| 422 | `spec_invalid` | Spec failed validation or lints |
| 429 | `rate_limited` | Org, token, or global limit; `Retry-After` set |
| 502 | `jev_invalid_request` | Jev rejected the compiled payload (our bug) |
| 503 | `jev_unavailable` / `jev_overloaded` | Jev down or overloaded after SDK retries |
| 503 | `jev_auth` | The org's TypeSafe key is invalid; org admins notified |

## Versioning

The path carries the API version. Additive changes only within `v1`. Breaking changes need an ADR and `v2`.
