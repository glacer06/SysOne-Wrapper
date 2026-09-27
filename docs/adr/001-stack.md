# ADR-001: Stack and tenancy model

- **Status:** accepted
- **Amended by:** ADR-002 (auth library, accepted 2026-09-26), ADR-008 (model registry and neutral naming, accepted 2026-09-26) and ADR-009 (app integration and deploy targets, accepted 2026-09-26; its Python and Standalone sections stay proposed). ADR-011 (OpenRouter route) is proposed and would add a second provider for System One calls.
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Contract impact:** establishes the initial contracts

## Context

Bandwise is a multi-tenant SaaS that wraps TypeSafe's System One models, starting with Jev. Nick sells it and also runs it across his own orgs (SGR, Personal, Dallas). It needs a console, a public API, an embed kit, billing, and later a Chrome extension and an MCP server. A team of agents will build it in parallel, so the stack must be common, well typed, and easy to split into lanes.

## Decision

| Area | Choice |
|---|---|
| Language | TypeScript, strict, ESM, Node 20+ |
| Repo | pnpm workspaces + turborepo |
| Web | Next.js App Router (console, public API, webhooks) |
| Database | Postgres (Neon or Supabase), Drizzle ORM, Row Level Security on every tenant table |
| Auth | Better Auth with the organization, admin and two-factor plugins and its Drizzle adapter, mapped onto our `organizations`, `memberships` and `invitations` tables (amended by ADR-002). |
| Cache and rate limits | Redis (Upstash) |
| Background jobs | Inngest or an equivalent serverless job runner (decided in ADR-005) |
| Billing | Stripe Billing with usage meters |
| System One models (Jev first) | `@typesafe-ai/sdk`, imported only by `packages/system-one-client` (renamed from `jev-client` by ADR-008) |
| Other LLMs | `@anthropic-ai/sdk`, imported only by `packages/llm-client` |
| UI | shadcn/ui, Tailwind, TanStack Table |
| Tests | Vitest, Playwright, k6 |
| Hosting | Vercel |

**Tenancy:** organizations are the security and billing boundary. One user can belong to many orgs and switches between them. Projects group work inside an org. Every tenant table carries `org_id`, enforced two ways: a repository layer (`withTenant`) and Postgres RLS with a transaction-local `app.org_id`.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Auth.js v5 + own org tables | Familiar, open source, full control of org model | We build invites, org switching, and impersonation ourselves |
| Better Auth with organization and admin plugins | Orgs, invites, roles, impersonation, and SSO built in; Drizzle adapter | Younger library; plugin APIs may shift |
| Clerk Organizations | Fastest to ship, SSO included | Auth data outside our DB, per-seat cost, vendor lock-in |
| Org, then Workspace (two levels) | Matches "one bill, many workspaces" | Doubles RLS, role, and billing work now |

## Open question for ADR-002

**Resolved** by ADR-002 on 2026-09-26.


The plan Nick approved first named Auth.js. The design review recommended Better Auth because its organization and admin plugins cover invites, active org, roles, and impersonation out of the box. Resolved by ADR-002, accepted 2026-09-26: Nick chose Better Auth. It must still support many orgs per user, invites, five roles, and audited impersonation, as ADR-002 sets out.

## Consequences

- Every package boundary is enforced by lint, so agents can work in parallel with little overlap.
- RLS adds some migration work per table. That cost is accepted because retrofitting tenancy later is how SaaS products leak data.
- Pinning to Vercel and serverless jobs means no long-running workers. Rollups and meter pushes run as scheduled jobs.
- This ADR covers Bandwise's own stack. SDKs and generated code shipped to customers may include Python (ADR-009); that adds a second toolchain only in `packages/client-py`.

## Rollout

Phase 0 part two scaffolds this stack. Any change needs a new ADR.
