# ADR-019: Open-core split, the free bandwise-kit and design-partner pricing

- **Status:** accepted (Nick, 2026-09-27: Apache-2.0; launch scope "Spec format + local runner + CLI, Template pack, Find-decisions Claude skill"; "Design partners first")
- **Date:** 2026-09-27
- **Owner:** Architect / Lead, with Integrations and Billing / Savings
- **Decider:** Nick
- **Contract impact:** the question set spec format (`QuestionSetSpec`, `schemaVersion`) becomes a public contract. Breaking changes need a new `schemaVersion` and a migration note, on top of the ADR rule that already applies. `@bandwise/core` and `@bandwise/cli` are published to npm under Apache-2.0.

## Context

Nick wants Bandwise to make money and also give something away on GitHub. The free part should pull developers in; the paid part should be what teams cannot easily build themselves. ADR-006 fixed the plans (`free`, `team`, `business`, `enterprise`, `internal`) and left prices open. ADR-009 describes an ingest endpoint that lets code outside the console send run records in.

## Decision

1. **Give away the engine, sell the control room.** A public repo, `bandwise-kit`, licensed Apache-2.0, holds what one developer can run with their own TypeSafe key:
   - the spec format and local runner (`packages/core`, the CLI's local mode)
   - the template pack, with example states and a borderline case per question
   - a Claude Code skill, "find decisions", that scans a codebase for LLM calls that are really yes/no, pick-one or score decisions and drafts a spec for each
2. **Not in the kit at launch:** the `bandwise check` GitHub Action and standalone codegen. Both can join later; standalone codegen still needs ADR-009's Standalone section accepted.
3. **Stays closed:** the console, multi-tenancy, managed versions and rollout, the review queue, the effectiveness loop and calibration, the savings ledger and reports, agent tokens and approvals, the key vault and billing.
4. **Upgrade path:** the kit can send run records to Bandwise Cloud through the ADR-009 ingest endpoint when a token is set. Nothing is locked; the ledger, review and calibration only exist in the cloud.
5. **Source of truth:** the public repo owns the kit packages. The private monorepo consumes them from npm, or a sync job keeps a mirror in step; the choice is made when the repo is carved out. No private code, keys or internal docs ever go to the public repo.
6. **Pricing:** design partners first. 3 to 5 early users get cloud access at a partner price; public prices go on the site after that. Plans stay as in ADR-006. Runs are the metered unit; platform-key System One spend may carry a markup only after TypeSafe's terms are checked.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Fully closed SaaS | Nothing to maintain in public | No funnel; hard to earn developer trust |
| Open the whole monorepo | Maximum trust | Gives away the paid product |
| Open-core kit (chosen) | Free engine drives adoption; paid control plane stays ours | Two surfaces to keep in step; public contract discipline |
| Source-available license | Blocks resellers | Many developers and companies avoid it |

## Consequences

- Checks before launch: TypeSafe's terms on public tools and naming, and on resale with a markup; the Bandwise trademark search.
- Selling to the City of Dallas needs an ethics or legal review first, because Nick is connected to it. Its use stays on the `internal` plan until then.
- The kit README leads with the savings calculator and links to docs.bandwise.dev.
- Funnel metrics: stars, CLI installs, ingest connections, paying orgs.

## Rollout

1. Carve out `glacer06/bandwise-kit` (creating the public repo is Nick's go), publish `@bandwise/core` and `@bandwise/cli`, and add the template pack and the find-decisions skill.
2. Launch with docs and a short demo.
3. Recruit design partners while Phase 2 billing lands.
Reversal: stop publishing new kit versions; the Apache-2.0 releases already out stay available.
