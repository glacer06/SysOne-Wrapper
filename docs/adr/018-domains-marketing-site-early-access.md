# ADR-018: Domains, marketing site and early access

- **Status:** proposed. Nick decided the domain map, database storage for signups, the operator-kit design system and Vercel Web Analytics on 2026-09-27; the rest is Architect defaults awaiting his accept.
- **Date:** 2026-09-27
- **Owner:** Architect / Lead, reviewed by the Security reviewer
- **Decider:** Nick
- **Amends:** ADR-016 decision 4 (domains)
- **Contract impact:** a new platform table `early_access_signups` (no `org_id`), a public route handler `POST /api/public/early-access` (outside the operation registry, like the device flow), a platform operation `platform_early_access.list`, and `BANDWISE_BASE_URL` defaulting to `https://app.bandwise.dev`.

## Context

Nick wants a marketing site at `www.bandwise.dev` and the app at `app.bandwise.dev`. ADR-016 had put the product on `bandwise.ai`. Docs already live at `docs.bandwise.dev` (NSI-713). Sign-up opens with Phase 2 auth, so until then the site collects early-access signups, and Nick wants them in our own database.

## Decision

1. **Domain map.**

   | Host | Serves |
   |---|---|
   | `bandwise.dev` | 308 redirect to `https://www.bandwise.dev` |
   | `www.bandwise.dev` | Marketing site, `apps/web` |
   | `docs.bandwise.dev` | Docs, `apps/docs` |
   | `app.bandwise.dev` | Console and the API at `/api/v1`, `apps/console` |
   | `bandwise.ai`, `www.bandwise.ai` | 308 redirect to `https://www.bandwise.dev`, path kept |

   A separate `api.bandwise.dev` can be added later as an alias without breaking clients.
2. **Session isolation.** Console auth cookies are host-only on `app.bandwise.dev` (no `Domain` attribute), `Secure`, `HttpOnly`, `SameSite=Lax`. The marketing and docs sites never see a session. Preview deployments never use production database credentials or System One keys.
3. **Marketing site.** A separate Next.js app, `apps/web`, in its own Vercel project. It holds no secrets and imports only `core` for the model registry prices and the ADR-015 bill formula used by the savings calculator. The operator-kit design system drives its look.
4. **Early access in our database.** A platform table `early_access_signups` (id, email, name, company, role, use case, source page, created_at, confirmed_at, unsubscribed_at, ip hash), written only by the `bandwise_platform` role. The form on `www` posts to `POST /api/public/early-access` on `app.bandwise.dev`, a plain route handler like the device flow: CORS allows only `https://www.bandwise.dev`, a per-IP rate limit, a honeypot field, a bot check, and an idempotent insert per email. The response never says whether an email was already on the list. Platform admins read the list through `platform_early_access.list`, so it is headless like every other capability.
5. **app.bandwise.dev before Phase 2.** The console deploys with only the public early-access route and a page that sends visitors to the form on `www`. The full console turns on when Phase 2 auth passes security review.
6. **Analytics.** Vercel Web Analytics on `www` and `docs`: no cookies and no consent banner. Nothing on `app` beyond what Phase 2 decides.
7. **Claims and naming.** Marketing copy only states facts we can source (registry prices, documented limits, our own measured numbers). Every page carries the line that Bandwise is an independent product built on TypeSafe's System One models. Customer names, including Nick's own orgs, appear only with approval.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Marketing pages inside the console | One deploy | Marketing deploys ride with the app; more surface next to secrets |
| Separate `apps/web` (chosen) | No secrets, deploys and caches on its own | One more Vercel project |
| Signups in a CRM or email | No DB needed now | Nick chose the database; data stays with the product |
| Signups written by `apps/web` directly | No console deploy needed | Puts database credentials in the marketing site |
| Public route on the console (chosen) | Only the console holds database credentials | Needs a thin console deploy before Phase 2 |

## Consequences

- The database host (Neon or Supabase, ADR-001) must be picked before marketing v1 ships.
- Signups are personal data: the privacy page covers them, and an unsubscribe and delete path exists from day one.
- The parity test skips `/api/public/`, like `/auth/`.

## Rollout

1. Merge the Node 22 pin (glacer06/bandwise#1) so docs go live; add DNS for `docs`, `www`, `app` and the redirects.
2. Marketing v1 in parallel with Phase 2: `apps/web`, the savings calculator, use cases, the early-access form, legal pages, analytics, and the thin console deploy with the table and route.
3. Phase 2 auth lands: `app.bandwise.dev` serves the console, early access becomes sign-up, pricing goes live.
Reversal: point `www` and `app` anywhere else in DNS; the table and route can stay dormant.
