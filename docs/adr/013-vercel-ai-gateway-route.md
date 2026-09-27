# ADR-013: Vercel AI Gateway as a third route to System One models

- **Status:** accepted (Nick, 2026-09-27: "accept ADR-013, 014 and 015")
- **Date:** 2026-09-27
- **Owner:** Architect / Lead, reviewed by the Security reviewer
- **Decider:** Nick
- **Builds on:** ADR-011 (provider routes). It reuses the route mechanism ADR-011 added. ADR-011's own open questions stay open and do not block this ADR.
- **Contract impact:** additive. `SystemOneProvider` gains `vercel`. `SYSTEM_ONE_PROVIDER_BASE_URLS` gains `vercel: "https://ai-gateway.vercel.sh/typesafe"`. The id helpers gain a Vercel default mapping. `SystemOneResponse` gains an optional `provider_metadata.gateway.cost`. The key and route provider enums gain `vercel`.

## Context

Checked on 2026-09-27 against Vercel's docs page "TypeSafe API with AI Gateway" (https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe, last updated 2026-09-21):

- `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` implements TypeSafe's request and response shapes. The official `@typesafe-ai/sdk` works by setting `baseURL` to `https://ai-gateway.vercel.sh/typesafe` and passing an AI Gateway key. `GET /typesafe/v1/models` lists the models.
- The documented model id is `typesafe-ai/jev`. No versioned id is documented.
- The response adds `provider_metadata.gateway` with `cost`, `marketCost`, `gatewayCost`, routing fields and a `generationId`. Errors use TypeSafe's shape, and provider errors pass through unchanged.
- An org can bring its own TypeSafe key through Vercel's BYOK, or bill through AI Gateway credits.
- AI Gateway adds **evaluation fallbacks**: `providerOptions.gateway.models` with a condition such as `confidenceBelow: 0.6` reruns an uncertain answer on another model, often an LLM. When an LLM gives the final Choice or Score answer, the response carries `confidence: 0` and `probabilities: {}`, and the top-level `model` names the fallback model. Headers `x-ai-gateway-evaluation-fallback-*` report it.

Several public Jev projects call Jev this way, and the AI SDK's `experimental_evaluate` goes through it. Customers who already pay Vercel will expect to plug in their Gateway key.

## Decision

1. **A third provider.** `SystemOneProvider = "typesafe" | "openrouter" | "vercel"`, served by the same `SdkTransport` with the base URL constant from core. Picked per org and per set, like ADR-011. No automatic failover between providers.
2. **Never use Gateway fallbacks.** SysOne never sends `providerOptions`. `escalate_to_llm` owns escalation, so the LLM call is logged, costed in `escalationCostUsd` and kept out of calibration. If a response still shows a fallback (an `x-ai-gateway-evaluation-fallback-triggered` header, or a Choice or Score answer with `confidence: 0` and empty `probabilities`), the client rejects it as `system_one_invalid_response`. We never band an LLM answer as if it were a System One answer.
3. **Ids through route rows.** The seed route row maps `jev-latest` to `typesafe-ai/jev`, not pinned. With no documented versioned id, no Vercel route is pinned, and `model.alias_past_shadow` keeps Vercel sets in `inactive` or `shadow` until one is confirmed. Same rule as OpenRouter.
4. **Cost.** When `provider_metadata.gateway.cost` is present, it is the call's actual System One cost (`RunCall.providerCostUsd`). The price book is the fallback.
5. **Keys.** An AI Gateway key is stored in `org_system_one_keys` with `provider: "vercel"`, same envelope encryption. Platform key mode reads `AI_GATEWAY_API_KEY`. OIDC tokens are not supported.
6. **Registry sync** for Vercel keys uses `GET /typesafe/v1/models`.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Stay on TypeSafe and OpenRouter | No new surface | Customers already on Vercel have to open another account |
| Vercel route with Gateway fallbacks allowed | Escalation inside one call | LLM answers come back looking like System One answers with confidence 0; bands, calibration and savings go wrong without anyone noticing |
| Vercel route, fallbacks refused (chosen) | Same wire shape, one more base URL; escalation stays ours and measured | One more key type and route rows |
| Vercel's own evaluation API | Vendor-neutral naming | A second request compiler for the same capability |

## Consequences

- Orgs can run Jev with a Vercel AI Gateway key. Like OpenRouter, controlled rollout waits for a pinned route.
- Fixtures under `packages/system-one-client/fixtures/vercel/` start from Vercel's documented example and are marked doc-derived until `pnpm fixtures:record --provider vercel` records real ones. One fixture carries an evaluation fallback, which the client must reject.
- `pnpm smoke` and `pnpm fixtures:record` take `--provider vercel` and read `AI_GATEWAY_API_KEY`.
- The DPA lists Vercel as a subprocessor for orgs that use this route.
- LiteLLM's `/typesafe` pass-through is a customer-side proxy, not a route. The Opportunity scanner (ADR-009) should recognize it, plus `client.systemOne(...)` and AI SDK `experimental_evaluate` calls, as import candidates. That lands with Phase 4b.

## Rollout

- **Now:** enum value, base URL constant, id mapping, seed route row, client fallback guard, doc-derived fixtures and tests, and the enum change in the schema.
- **Phase 2:** key validation, platform key per provider, registry sync for Vercel keys, provider settings in the console.
- **Reversal:** move every org and set off `vercel` and stop accepting Vercel keys. The enum value stays as data.
