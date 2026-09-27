# ADR-016: Rename the product and code to Bandwise

- **Status:** accepted (Nick, 2026-09-27: "Yes, rename everything bandwise")
- **Date:** 2026-09-27
- **Owner:** Architect / Lead
- **Decider:** Nick
- **Contract impact:** names only, no shapes. Package scope `@sysone/*` becomes `@bandwise/*`. The CLI command `sysone` becomes `bandwise`. Env vars `SYSONE_*` become `BANDWISE_*`. OpenAPI extensions `x-sysone-*` become `x-bandwise-*`. The `SysOne-Interface` header becomes `Bandwise-Interface`. Postgres roles `sysone_app` and `sysone_platform` become `bandwise_app` and `bandwise_platform`. Customer files `sysone.config.json` and `.sysone/lock.json` become `bandwise.config.json` and `.bandwise/lock.json`. The builder skill becomes `bandwise-builder`, and the customer skills become `bandwise-operator` and `bandwise-integrate`.

## Context

TypeSafe calls its models "System One". A product named "SysOne" reads like TypeSafe's own console, which could confuse buyers and invite a brand objection. Nick bought `bandwise.ai` and `bandwise.dev` on 2026-09-27 and chose Bandwise, after the confidence bands the product is built around.

Nothing has been published: no npm package, no customer, no deployed database, no issued token. A rename now costs one pass. After Phase 4, when packages ship, it would cost deprecations and migration notes.

## Decision

1. Rename every product identifier from SysOne to Bandwise, in code, config, docs, skills and ADRs, in one change with the full gate.
2. Keep `systemOne` and "System One" wherever they name TypeSafe's model class. Code identifiers still say `systemOne`, not `jev` (golden rule 9).
3. Keep the GitHub repository URL (`glacer06/SysOne-Wrapper`) until Nick renames the repository. GitHub redirects the old URL after a rename.
4. Domains: `bandwise.ai` for the product (marketing, `app.`, `api.`), `bandwise.dev` for developer docs (`docs.bandwise.dev`).
5. Earlier ADRs are updated in place to the new names so the record reads consistently; this ADR is the record of the change.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep SysOne | No work | Brand confusion with TypeSafe's "System One" |
| Rename customer-facing text only | Small change | Two names forever: customers install `@sysone/*` for a product called Bandwise |
| Rename everything now (chosen) | One name everywhere; free before anything ships | One large mechanical change |

## Consequences

- Local `.env` files need the new variable names (`BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY`, `BANDWISE_TOKEN`, `BANDWISE_BASE_URL`).
- Linear: the project and the `sysone:*` labels are renamed to match.
- The repository rename on GitHub is Nick's action.

## Rollout

One commit after the docs site skeleton merges, gated by `pnpm turbo lint typecheck test build`. Reversal is the same mechanical rename in the other direction.
