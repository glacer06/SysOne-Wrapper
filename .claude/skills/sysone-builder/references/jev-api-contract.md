# Jev API contract (what the wrapper relies on)

Verified against docs.typesafe.ai on 2026-09-26 (model `jev-1.13.0`, JS SDK `@typesafe-ai/sdk` v0.6.x). The live docs win if anything here drifts. Re-check `https://docs.typesafe.ai/api.md` and `/models.md` before changing anything in `packages/jev-client`.

## Endpoint

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json
```

`GET https://api.typesafe.ai/v1/models` lists the names an account can send (currently the aliases). Versioned IDs such as `jev-1.13.0` are accepted even when not listed.

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
- **Question IDs are not sent to the model.** Put the full meaning in `instructions`.

### Question types

| Type | `criteria` | Answer | Has `confidence` |
|---|---|---|---|
| `noul` | optional `{ "true": ..., "false": ... }` | `{ type, noul }`, 0 to 1 probability of yes | No |
| `choice` | required map `option -> description or null`, max 255 options | `{ type, choice, probabilities, confidence }` | Yes |
| `score` | required ordered array, 2 to 10 levels | `{ type, score, legend, probabilities, confidence }`; `score` is probability-weighted and can land between levels | Yes |

A Noul near 0.5 means "equally likely yes or no", not "medium intensity".

## Response

```json
{
  "model": "jev-1.13.0",
  "answers": { "<question_id>": { "type": "choice", "choice": "billing", "probabilities": { "billing": 0.88, "technical": 0.12 }, "confidence": 0.81 } },
  "usage": { "input_tokens": 318, "output_tokens": 34 }
}
```

Always store `model` from the response as `model_resolved` on the run. It tells you which versioned model answered when you sent an alias.

## Execution semantics

- All questions in one request are evaluated **in parallel and in isolation**. They cannot see each other's answers.
- Anything that depends on an earlier answer needs a **second request**. In SysOne that is a later **stage**.
- Speculative fan-out is encouraged: ask branch-specific questions up front and let code read only the relevant answers. Unused branches cost tokens, not correctness.

## Limits (jev-1.13)

| Limit | Value |
|---|---|
| Context | 64k tokens per request (state plus all questions) |
| State budget | 32k tokens for state plus the single longest question |
| Rate | 250,000 tokens/sec and 1,200 requests/min per account (adjusting dynamically; can change without notice) |
| Input | Text only. No images, audio, or video. Preprocess to text or structured fields. |
| Language | English is strongest. Test others before routing on them. |

SysOne enforces these in the token preflight before calling Jev and reserves headroom (global budget of about 1,000 RPM) so one tenant cannot exhaust the account.

## Errors

| Status | Meaning | SysOne code |
|---|---|---|
| 401 | Bad or missing key | `jev_auth` (surface to org admin: key invalid) |
| 422 | Body failed validation | `jev_invalid_request` (a compiler or lint bug; log the payload hash) |
| 429 | Rate limited | `jev_rate_limited` |
| 529 | Overloaded | `jev_overloaded` |
| network / timeout | Connection failure | `jev_unavailable` |

**Retries belong to the SDK.** Its default policy retries connection errors, timeouts, 429, and 529 with exponential backoff (500ms initial, 5s max, 0.25 jitter) and honors `retry-after`. Do not wrap it in a second retry loop.

## JS SDK usage

```ts
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({ apiKey: orgKey, defaultModel: spec.model });
const res = await client.systemOne({
  state,
  questions: {
    department: choice("Which team should handle this?", { billing: "Payments, refunds", technical: "Bugs, outages", other: null }),
    frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
    is_urgent: noul("Does this convey urgency?", { true: "Explicitly time-sensitive", false: "No urgency expressed" }),
  },
});
res.answers.department.choice; // typed
res.usage.input_tokens;
```

- Node 20+. ESM, CJS, and types included.
- Config precedence: explicit option, then env (`TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`), then SDK default (`jev-latest`).
- Error classes: `AuthenticationError`, `BadRequestError`, `UnprocessableEntityError`, `RateLimitError`, `InternalServerError`, `APIConnectionError`, `APITimeoutError`, all extending `TypeSafeError`. `packages/jev-client` maps them to the SysOne codes above.
- Multi-tenant: construct one client per org key (cache by key fingerprint). Never rely on the process env key for tenant traffic.

## Models and aliases

| Alias | Meaning |
|---|---|
| `jev-latest` | Latest stable release. SDK default. Moves when a new release ships. |
| `jev-preview` | Latest release, stable or not. |

Pin a versioned ID (`jev-1.13.0`) on any set whose thresholds were tuned. The nightly drift job compares alias targets from `GET /v1/models` and flags affected sets.

## Pricing

Input only: **$42 per billion tokens ($0.042 per million)**. Output tokens are free. Cost formula used everywhere in SysOne:

```
jev_cost_usd = input_tokens * 0.042 / 1_000_000
```

Keep the rate in the `model_prices` config, not hardcoded, so a price change is a data change.

## Data handling

Jev is not trained on customer requests. ZDR is available for enterprise. See `https://docs.typesafe.ai/legal.md`. Orgs sending sensitive data should use `redactPaths` and confirm their TypeSafe terms first.

## Unverified (do not build on without checking)

- Third-party gateways (Vercel AI Gateway, OpenRouter, Cloudflare Workers AI) serving Jev. Reported by a newsletter, not confirmed in TypeSafe docs. `JevTransport` leaves room for them.
