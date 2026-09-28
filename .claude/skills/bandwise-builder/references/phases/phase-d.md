# Phase D: Dogfood track

**Owner:** Architect / Lead, with Core Engine and Integrations. **Needs:** Phase 1. **Decision:** [ADR-020](../../../../../docs/adr/020-dogfood-track.md).

Use Bandwise on Bandwise before anyone else does: Claude Code sessions on this repo first, local with Nick's own key, then hosted for the `internal` org only. Every dogfood set starts in `shadow`. This phase runs before the rest of Phase 2; D3 pulls the few Phase 2 and 3 items it needs forward and marks them done in those files too.

## D0: Prove Jev
- [ ] `TYPESAFE_API_KEY` in the team vault, the GitHub `preview` and `production` environments, and Nick's shell. Never in chat, an issue or the repo.
- [ ] Record the Phase 1 fixture minimum set with `pnpm fixtures:record` and close the Phase 1 fixture item
- [ ] `pnpm smoke` passes on `jev-1.13.0`; note latency and cost per call in `docs/runbooks/dogfood.md`

## D1: Fast pass, local
- [ ] Live transport in the CLI: one module, the only CLI code allowed to import the SDK transport; boundary rule and test like the fixture-only rule
- [ ] `bandwise run --live spec.json state.json [--provider typesafe|openrouter|vercel]`: key from the matching env var only, never from a flag, spec, profile or file; error names the missing variable, never a value
- [ ] Receipts: `Receipt` type (set, version or spec hash, rollout stage, decisions with value, band and action, effective action, System One cost, counterfactual LLM cost, latency, time). No prompts, state or tool inputs. Appended to `~/.bandwise/receipts.jsonl` with `--receipts [path]`
- [ ] `bandwise report [--since 7d] [--set <slug>]`: decisions, band mix, System One spend, counterfactual spend and estimated savings per set, from receipts; Claude Code figures labeled as estimates
- [ ] Agent pack templates in `packages/templates`, each with example states and a borderline case: `done-check`, `action-risk-gate`, `model-tier`, `wake-gate` (the existing wake gate, adapted to PR events and check-ins)
- [ ] `bandwise hook <event> --set <path>`: reads Claude Code hook JSON on stdin, maps it to the set's input schema (only the fields the schema names, redact paths applied), runs live, writes a receipt, and prints hook JSON. In `shadow` it never blocks, denies or adds context; in `controlled` only a high-band answer acts. Any error or timeout (default 3 seconds) exits 0 with no output, so a hook never breaks a session
- [ ] Dogfood sets in `.bandwise/sets/` for this repo, all `shadow`, validated by `bandwise run --local` in CI
- [ ] `bandwise hooks install` prints the `.claude/settings.json` entries for review; nothing is written without the owner's approval
- [ ] Kit 0.2.0 release (live mode, receipts, report, agent pack) through the automated release workflow
- [ ] `docs/runbooks/dogfood.md`: install, read the report, move a set from `shadow` to `controlled`, remove the hooks

## D2: Hosted, internal only
- [ ] `POST /api/v1/sets/{ref}/run` with the standard envelope, platform key on the server, served only for the `internal` org
- [ ] App tokens (`sk_live_`) minted by a platform script for the internal org, stored hashed, scoped to a set allowlist
- [ ] The management operations the CLI needs, with audit rows: `set.create`, `draft.update`, `version.publish`, `release.rollback`, `rollout.change`, `run.list`, `usage.get`
- [ ] `bandwise spec push|pull|diff`, `bandwise publish`, `bandwise rollback`, `bandwise rollout` against app.bandwise.dev with a Bandwise token
- [ ] Runs write `runs`, `usage_daily` and the savings ledger; `bandwise report --remote` reads them
- [ ] Hooks switch from `--live` to the hosted endpoint by setting `BANDWISE_TOKEN`; receipts keep working
- [ ] Import the `.bandwise/sets/` specs into the internal org; publish and roll back one set live with no redeploy

## D3: Minimal console
- [ ] Sign-in for Nick and PJ with Better Auth and two-factor (ADR-002), `internal` org only
- [ ] Question editor (form and JSON) and threshold sliders with a live preview on sample state
- [ ] Publish, version history and one-click rollback, each calling the same operation as the CLI
- [ ] Runs explorer and a savings view per set
- [ ] Review queue for medium and low band decisions

## Exit gate
- A week of receipts from real Claude Code sessions on this repo, with `bandwise report` showing System One spend and estimated savings per set.
- At least one set moved from `shadow` to `controlled` by Nick.
- From the console or the CLI, a question or threshold changes and the next hook call uses the new version, with no redeploy; a rollback restores the old one.
