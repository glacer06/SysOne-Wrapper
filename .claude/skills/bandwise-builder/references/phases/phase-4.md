# Phase 4: Embed kit

**Owners:** Embed Kit, QA, Docs (recipes). **Needs:** `openapi.json` from Phase 0, extended in Phase 3. Components can start earlier against MSW mocks.

- [ ] `@bandwise/client`: `createClient({ baseUrl, token }).run(setRef, state)`, a generic `run<T>()` for generated clients ([deploy-and-codegen.md](../deploy-and-codegen.md)), `reportFeedback()`, `Idempotency-Key` support, the optional `Bandwise-Interface` header, and `requestId` exposure; `createRunRoute()` for Next.js, Express handler
- [ ] `@bandwise/client` is fetch-only, with no Node built-ins, so it runs on Node, Vercel Edge, Cloudflare Workers and Deno; CI runs its tests under `@edge-runtime/vm`
- [ ] `429` handling honors `Retry-After` with bounded retries in a single retry layer
- [ ] Browser token minting through `POST /api/v1/tokens/browser` (ES256 JWT bound to origin and set list)
- [ ] Publishable `pk_` mode support
- [ ] `@bandwise/react`: `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`, `ReviewQueue`, `SavingsCard`, plus headless hooks. `ReviewQueue` and `SavingsCard` require Mode A; add `createReviewRoutes()` and `createUsageRoute()` server helpers.
- [ ] Theming through CSS variables, accessible by default
- [ ] `apps/example-embed` using both modes
- [ ] Integration recipes per [deploy-and-codegen.md](../deploy-and-codegen.md): Next.js route handler, Express, plain HTTP (curl), Python httpx; each branches on `effectiveAction`

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Embed kit overview; `@bandwise/client` reference (server client, Next.js route, browser tokens, `pk_` mode); `@bandwise/react` components and theming; integration recipes (Next.js, Express, plain HTTP, Python)

## Exit gate
- `example-embed` E2E passes in both modes.
- CI bundle scan finds no key patterns in client output.
- `@bandwise/react` under 15 kB gzip.
- Components render every question type in the core registry and all three bands.
- Client tests pass in the edge runtime.
- Revoking a token blocks it within 60 seconds.
