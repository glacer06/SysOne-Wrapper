# System One API contract (what the wrapper relies on)

Verified against docs.typesafe.ai and `https://api.typesafe.ai/openapi.json` (info.version 0.2.0) on 2026-09-26, with JS SDK `@typesafe-ai/sdk` 0.6.x. The live docs win if anything here drifts. Re-check `https://docs.typesafe.ai/api.md`, `/models.md` and `openapi.json` before changing anything in `packages/system-one-client`. Facts that differ per model (limits, question types, status, weaknesses, prices) are in [system-one-models.md](system-one-models.md).

## Endpoint

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json
```

- This one endpoint serves every System One model. The request's `model` field picks the model.
- `GET https://api.typesafe.ai/v1/models` lists names the key can send. See [system-one-models.md](system-one-models.md) for what it returns and what it does not.

## Request

```json
{
  "state": "string | object | array",
  "model": "jev-latest",
  "questions": {
    "<question_id>": { "type": "noul | choice | score", "instructions": "...", "criteria": "..." }
  }
}
```

- `state` is the content to judge. Prefer named JSON fields when context has several parts.
- Questions reference nested state with backticked paths: `` `ticket.messages[0].text` ``.
- `instructions` and `criteria` can be a string, an object, or an array (structured). Use structure for definitions, contrasts, exclusions, or examples.
- `questions` needs at least one entry.
- **Question IDs are not sent to the model.** Put the full meaning in `instructions`.

### Question types

| Type | `criteria` | Answer | Has `confidence` |
|---|---|---|---|
| `noul` | optional `{ "true": ..., "false": ... }` | `{ type, noul }`, 0 to 1 probability of yes | No |
| `choice` | required map `option -> description or null` | `{ type, choice, probabilities, confidence }` | Yes |
| `score` | required ordered array of levels | `{ type, score, legend, probabilities, confidence }`; `score` is probability-weighted and can land between levels | Yes |

A Noul near 0.5 means "equally likely yes or no", not "medium intensity".

## Response

```json
{
  "model": "jev-1.13.0",
  "answers": { "<question_id>": { "type": "choice", "choice": "billing", "probabilities": { "billing": 0.88, "technical": 0.12 }, "confidence": 0.81 } },
  "usage": { "input_tokens": 318, "output_tokens": 34 }
}
```

- **Answers always come back in the type asked.** SysOne still parses them with `passthrough` schemas and handles an unknown type without throwing ([spec-schema.md](spec-schema.md), section 9).
- **`model` is the versioned ID that answered**, even when the request sent an alias. Store it as `model_resolved` on the run. It prices the run and feeds alias detection ([system-one-models.md](system-one-models.md)).
- **Request ID.** The SDK exposes the `x-typesafe-request-id` response header: `client.systemOne(...).withResponse()` returns `{ data, response, requestId }` in JS, and `result.request_id` in Python. Store it as `runs.typesafe_request_id`, include it in error logs, and show it on run detail for TypeSafe support tickets.

## Execution semantics

- All questions in one request are evaluated **in parallel and in isolation**. They cannot see each other's answers.
- The official skill's rule: "A second request is warranted when an earlier answer is needed to fetch evidence, construct new state, or determine the next options." In SysOne a second request is a later **stage**.
- Otherwise ask every question, including speculative ones, in one request. Mark branch-only questions with `relevantWhen` ([spec-schema.md](spec-schema.md), section 5), so an answer that does not apply creates no review item, does not lower the run band and does not count toward savings. Ignore uncertainty on unused branches.
- Sources: `docs.typesafe.ai/patterns/fan-out.md`, and the parallel questions cookbook (`docs.typesafe.ai/cookbooks/parallel_questions.md`), where batching 13 questions into one call was 12.2x cheaper and 10.0x faster with no change in answers.
- Extra questions still use tokens. Preflight checks each request against the model's limits.

## Limits

### API-wide rules

These hold for every model. They are constants in `packages/core`.

| Rule | Value |
|---|---|
| Options per choice | At most 255 |
| Score levels | 2 to 10 |
| Question types | `noul`, `choice`, `score`. The OpenAPI `Question` is a `oneOf` discriminated on `type`. |
| State shapes | String, JSON object, or array |

### Per-model limits

Context per request, the state plus longest question budget, requests per minute, tokens per second, input modalities and language strength differ by model. They live in the `ModelProfile` ([system-one-models.md](system-one-models.md)), which preflight, lints and default limiter budgets read. The `jev-1.13.0` values are in its seed table.

SysOne reserves headroom: the global budget is a per-model setting (about 1,000 requests per minute for `jev-1.13.0`, against a published 1,200), limiter keys include the model, and evals use a separate bucket ([security.md](security.md)).

## Errors

| Status | SDK class (JS) | SysOne code | Notes |
|---|---|---|---|
| 400 | `BadRequestError` | `system_one_invalid_request` | A compiler or lint bug; log the payload hash |
| 401 | `AuthenticationError` | `system_one_auth` | The org's key is invalid; notify org admins; not retryable |
| 403 | `PermissionDeniedError` | `system_one_forbidden` | The org's key cannot use that model |
| 404 | `NotFoundError` | `model_unavailable` | The model is unknown to TypeSafe or not reachable |
| 422 | `UnprocessableEntityError` | `system_one_invalid_request` | A compiler or lint bug; log the payload hash |
| 429 | `RateLimitError` | `system_one_rate_limited` | After SDK retries |
| 529 | `InternalServerError` (status 529) | `system_one_overloaded` | After SDK retries |
| 408, other 5xx | `APIError`, `InternalServerError` | `system_one_unavailable` | After SDK retries |
| none | `APIConnectionError`, `APITimeoutError` | `system_one_unavailable` | After SDK retries |
| none | `APIUserAbortError` | `client_aborted` | Internal only, never returned. A run whose budget ran out reports `system_one_unavailable`. |

- All SDK errors extend `TypeSafeError`, and every HTTP error extends `APIError`. `packages/system-one-client` maps them to the codes above at the edge and never passes raw provider messages through.
- The HTTP status SysOne returns for each code is in [api.md](api.md).
- **Retries belong to the SDK.** Do not wrap it in a second retry loop.

## JS SDK usage

```ts
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({
  apiKey: orgKey,                        // from tenancy.KeyResolver, never the process env
  baseURL: "https://api.typesafe.ai",
  defaultModel: spec.model,
  logLevel: "warn",
  logger: scrubbingLogger,               // drops bodies and key material
});

const { data: res, requestId } = await client
  .systemOne(
    {
      state,
      model: spec.model,
      questions: {
        department: choice("Which team should handle this?", { billing: "Payments, refunds", technical: "Bugs, outages", other: null }),
        frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
        is_urgent: noul("Does this convey urgency?", { true: "Explicitly time-sensitive", false: "No urgency expressed" }),
      },
    },
    { timeout: attemptMs, retry: { maxRetries, maxRetryAfterMs }, signal },
  )
  .withResponse();
res.answers.department.choice; // typed
res.usage.input_tokens;
```

SDK defaults, quoted from the `RetryPolicy` and `TypeSafeClientConfig` references:

| Setting | Default |
|---|---|
| `httpStatuses` | 408, 429, and 500 to 599 (so 529 is retried) |
| `apiConnectionError`, `apiTimeoutError` | Retried |
| `maxRetries` | 2 retries after the initial attempt |
| Backoff | 500 ms initial, doubled up to 5,000 ms, 0.25 jitter |
| `respectRetryAfter` | Honors `Retry-After` and `retry-after-ms` up to `maxRetryAfterMs` 60,000; longer delays use backoff |
| `timeout` | 10,000 ms **per attempt**, with no total retry budget |

- So one call with defaults can block far longer than any SysOne surface allows. `system-one-client` passes a per-call `timeout`, `retry: { maxRetries, maxRetryAfterMs }` derived from the surface budget (API 8 s, embed 5 s, extension 3 s, eval 30 s; [architecture.md](architecture.md)) and an `AbortSignal` that fires when the budget runs out. This configures the SDK's retries. It is never a second retry loop.
- **Construct every client with explicit `baseURL`, `defaultModel`, `logLevel: "warn"` and a scrubbing `logger`.** Explicit options beat env vars. Otherwise `TYPESAFE_LOG_LEVEL=debug` would log request and response bodies, including tenant state, unredacted: the SDK redacts known credential headers but not bodies. `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL` must not steer tenant traffic either.
- Config precedence: explicit option, then env (`TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`, `TYPESAFE_LOG_LEVEL`), then SDK default (`https://api.typesafe.ai`, `jev-latest`, `warn`).
- Node 20+. ESM, CJS, and types included. `dangerouslyAllowBrowser` stays false: only `system-one-client` imports the SDK, and it runs server-side.
- Error classes: `AuthenticationError`, `BadRequestError`, `PermissionDeniedError`, `NotFoundError`, `UnprocessableEntityError`, `RateLimitError`, `InternalServerError` (all extend `APIError`), plus `APIConnectionError`, `APITimeoutError` and `APIUserAbortError`. All extend `TypeSafeError`.
- Multi-tenant: construct one client per org key (cache by key fingerprint). Never rely on the process env key for tenant traffic.
- `client.models.list()` returns `ModelCard[]` (`name`, `description`, `release_date`). The registry sync uses it.
- SDK upgrades go through a Renovate PR that re-records fixtures and passes `pnpm smoke` ([conventions.md](conventions.md)).

## Python SDK usage

Only generated code uses the Python SDK: the Python standalone export from `packages/codegen` ([deploy-and-codegen.md](deploy-and-codegen.md)). Managed Python code calls SysOne through `packages/client-py` instead. The SysOne server never uses the Python SDK.

```python
# pip install typesafe-sdk
from typesafe_sdk import TypeSafeClient, Choice, Noul, Score

client = TypeSafeClient(model="jev-1.13.0")   # the customer's own key from TYPESAFE_API_KEY
result = client.system_one(
    {"ticket": text},
    {
        "billing": Noul(instructions="Is `ticket` about billing?"),
        "tone": Choice(instructions="What is the tone of `ticket`?", criteria={"calm": None, "angry": None}),
        "urgency": Score(instructions="How urgent is `ticket`?", criteria=["low", "medium", "high"]),
    },
)
result.nouls["billing"].noul, result.choices["tone"].choice, result.scores["urgency"].score
result.request_id
```

- Answers are grouped by type: `.nouls`, `.choices`, `.scores`.
- Responses are pydantic models since v0.7.0 (msgspec before). `system_one` accepts `response_model=` for a typed response.
- The same logging rule applies: `TYPESAFE_LOG_LEVEL=debug` logs request and response bodies unredacted.

## Models and aliases

- Aliases such as `jev-latest` and `jev-preview`, and partial IDs such as `jev` and `jev-1.13`, move when a new release ships. A name is pinned only when the registry marks it `kind: "versioned"`.
- Moving models are allowed only in the `inactive` and `shadow` rollout stages (`model.alias_past_shadow`). Pin a versioned ID such as `jev-1.13.0` before `controlled`.
- `GET /v1/models` does not return alias targets. SysOne learns them from responses and a nightly probe ([system-one-models.md](system-one-models.md), detection).

## Pricing

```
price = price_books row for model_resolved      // an org row overrides the platform default (org_id null)
system_one_cost_usd = input_tokens * price.in + output_tokens * price.out
```

- `price.in` and `price.out` are USD per token. `price_books` stores them as micro-USD per million tokens (`input_per_mtok_micro_usd`, `output_per_mtok_micro_usd`), keyed by the exact versioned ID. Alias rows are rejected. Runs store the result as integer `runs.system_one_cost_micro_usd` ([data-model.md](data-model.md)).
- The Jev 1.13 row: $0.042 per million input tokens and $0 per million output tokens. TypeSafe says output tokens are currently free, so the output price is data, not an assumption.
- Unpriced models, and what happens to their runs, are in [system-one-models.md](system-one-models.md), pricing.

## Data handling

TypeSafe does not train Jev on customer requests or responses. ZDR is available for enterprise. See `https://docs.typesafe.ai/legal.md`. Orgs sending sensitive data should use `redactPaths` and confirm their TypeSafe terms first.

## Transports and gateways

- SysOne calls TypeSafe directly, server-side, through `SystemOneTransport`: the SDK transport in production, and the fixture transport in tests (`SYSTEM_ONE_TRANSPORT=fixture`).
- OpenRouter and Vercel AI Gateway are confirmed in `docs.typesafe.ai/sdk/python/usage.md`. Each uses its own base URL, key and model ID (values in [system-one-models.md](system-one-models.md), gateways) and must follow the TypeSafe OpenAPI spec.
- Cloudflare Workers AI is still unconfirmed.
- Gateways are out of scope for v1.

## Watch

TypeSafe's SDKs and API are pre-1.0 and changing weekly.

- JS SDK 0.6.0 (2026-09-15) had a breaking change: `Score.criteria` became an ordered sequence instead of a dictionary keyed by integers. Python 0.6.0 made the same change.
- Python SDK 0.7.0 (2026-09-18) moved from msgspec to pydantic.
- The official skill links a v1 migration guide (`docs.typesafe.ai/migrating-to-v1.md`) that returns 404 today.
- The nightly contract watch job diffs `openapi.json`, `llms.txt` and `models.md` against snapshots committed in `packages/system-one-client`, and alerts on a change ([system-one-models.md](system-one-models.md), detection). Fixtures record the `openapi.json` version they were made against ([testing.md](testing.md)).
