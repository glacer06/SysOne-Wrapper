# Architecture
**Project:** Bandwise
**Last updated:** 2026-10-01

A short map so a new session doesn't have to work out structural decisions from scratch. The full architecture, contracts and phase checklists live in the `bandwise-builder` skill (`.claude/skills/bandwise-builder/`) and in the ADRs (`docs/adr/`). If anything here disagrees with an accepted ADR, the ADR wins.

---

## Core principles

1. **Tenant isolation everywhere.** Every tenant table has `org_id` and row-level security, and all DB access goes through `withTenant`.
2. **Keys never leave the server.** System One keys stay server-side. No browser SDK use. The one exception is local live mode (ADR-020).
3. **A pure core.** `packages/core` has no I/O. Contracts in `packages/core/src/contracts` change only through an ADR.
4. **Headless parity.** Every console capability is an operation that `/api/v1`, the CLI and the MCP server also expose (ADR-007).
5. **Design reads tokens.** UI reads only the `--bw-*` semantic tokens in `brand/tokens/`. Marks are supplied files (ADR-022).

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | One language across apps, packages and the CLI |
| Framework | Next.js 16 for the console, www and docs | Server-rendered first. Shared tooling across the three apps |
| Data | Postgres on Supabase, Drizzle, PGlite in tests | Plain Postgres with RLS (ADR-018). Fast local tests |
| Auth | Better Auth with TOTP (ADR-002) | Orgs, roles and two-factor in our own database |
| AI | TypeSafe System One models (Jev first), via the model registry | The product's engine (ADR-008). Anthropic models only as escalation targets |
| Motion | CSS transitions on the `--bw-dur-*` and `--bw-ease-*` tokens. No motion library | DESIGN.md allows one moving thing per view, which CSS covers |
| Hosting | Vercel for the three apps | Preview deploys per PR. Production migrations run through the `db-migrate.yml` workflow |
| CI | GitHub Actions running `pnpm turbo lint typecheck test build` | One gate for every package |

---

## Dependencies to avoid

- **Component kits that bring their own theme** (MUI, Chakra, a default shadcn theme). They fight the `--bw-*` tokens and the chamfer. We build our own small components on the tokens.
- **Motion libraries** (Framer Motion and similar). There is no surface yet that CSS can't cover.
- **Icon fonts.** Use Lucide SVG icons with `currentColor` (DESIGN.md).

---

## Tradeoffs we're consciously accepting (and when we'd revisit)

| Decision | Cost we're paying | When we'd revisit |
|---|---|---|
| Our own small component set instead of a library | More code to maintain per component | When the console needs more than about 25 distinct components |
| Fonts self-hosted through `next/font` | Slightly larger builds | Never, unless a font license changes |
| The brand kit's PDF stored in the repo as a binary | About 1.4 MB in git history | If the guide is revised often. Then link to it from storage instead |

---

## Architecture decision log

The ADRs in `docs/adr/` are the log. Recent entries:

### 2026-10-01: Bandwise Gate and OAuth for remote MCP (ADR-021, proposed)

**Context:** we need a plugin that gets traction, plus a way for Claude and ChatGPT to sign in.
**Decision:** Bandwise Gate on Claude Code first. A six-tool remote MCP slice. OAuth 2.1 that mints agent tokens bound to one org.
**Alternatives considered:** ChatGPT first, a generic decision connector, and static API keys.
**Consequences:** adds a public OAuth surface that needs the Security reviewer's sign-off.

### 2026-10-01: Brand and design system v1 (ADR-022, accepted)

**Context:** the warm "survey instrument" identity didn't match the product's positioning.
**Decision:** PJ's brand kit v1 becomes the single design system for all surfaces.
**Alternatives considered:** keep the old look, or run per-app identities.
**Consequences:** www, the console and the docs are restyled together on the `--bw-*` tokens.

---

## What lives elsewhere

- Scope: `scope.md`
- Metrics: `measurement.md`
- Visual spec: `DESIGN.md` and `brand/tokens/`
- Voice: `BRAND-VOICE.md`
- Gates: `DESIGN-STANDARDS.md`
- Corrections: `corrections.md`
- Phase plan: `docs/PLAN.md`
