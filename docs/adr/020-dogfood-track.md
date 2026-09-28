# ADR-020: Dogfood track: use Bandwise on Bandwise first, local then hosted

- **Status:** accepted (Nick, 2026-09-28: first app "Claude Code on Bandwise", Jev key "TypeSafe direct", "Yes, local then hosted", autonomy "Shadow first")
- **Date:** 2026-09-28
- **Owner:** Architect / Lead, reviewed by the Security reviewer
- **Decider:** Nick
- **Amends:** the customer-tools key rule in `CLAUDE.md`, for local mode only. The build order in `docs/PLAN.md`.
- **Contract impact:** none to the frozen contracts. New CLI surfaces (`bandwise run --live`, `bandwise hook`, `bandwise report`) and a local receipt file format (`Receipt`, defined in the CLI package, not in core contracts).

## Context

Nick wants to use Bandwise on his own work right away: cut his own token spend and manage decisions while Bandwise is being built. The plan put every customer-facing piece (auth, console, hosted API) ahead of any real use, and no System One call has run yet. The first place Nick spends tokens is Claude Code building this repo.

Two rules stood in the way:

1. `CLAUDE.md` says customer tools (the `bandwise` CLI, the MCP server) never hold a TypeSafe, OpenRouter or AI Gateway key. The CLI's local mode may import only the fixture transport.
2. ADR-019 promises the free kit runs "with your own TypeSafe key", which the CLI could not do.

## Decision

1. **Reorder the build around a dogfood track (phase D)** that comes before the rest of Phase 2. Its steps, in order:
   - **D0 Prove Jev.** A `TYPESAFE_API_KEY` in the team vault, GitHub secrets and Nick's shell. Record the Phase 1 fixtures and pass `pnpm smoke`.
   - **D1 Fast pass, local.** The CLI calls System One directly with the developer's own key. The agent pack ships as templates and Claude Code hooks. Every decision writes a receipt with its cost and savings, and `bandwise report` sums them.
   - **D2 Hosted, internal only.** The run endpoint and the few management operations needed to push, publish and roll back sets, served on app.bandwise.dev for Nick's `internal` org, with the key on the server and an app token in the hooks. No console yet: management is headless, through the CLI.
   - **D3 Minimal console.** Sign-in for Nick and PJ (Better Auth, ADR-002), the question editor, threshold sliders with a preview, runs and savings, and the review queue.
   - Then the rest of Phase 2 and Phases 3 to 7 for customers, in their existing order.
2. **Local live mode may use the developer's own key.** Only `bandwise run --live` and `bandwise hook` may import the SDK transport, and only through one module in the CLI. The key comes from the `TYPESAFE_API_KEY` environment variable (or `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` with `--provider`) of the person running the command. It is never read from a spec, a flag, a profile or a file the CLI writes, never logged or printed, and never sent anywhere but the provider base URL constant in core. The hosted paths keep the old rule: the MCP server and every cloud CLI command hold only a Bandwise token.
3. **Shadow first.** Every dogfood set starts in `shadow`: it runs, logs its receipt and what it would have done, and changes nothing. A set moves to `controlled` (only the high band acts) when Nick says so after reading its receipts, one set at a time.
4. **Specs as files.** Until D2, dogfood specs live in the repo under `.bandwise/sets/`, one JSON spec per set. Changing a question or a threshold is an edit and a commit, reviewed like code. D2 imports them into the internal org with `bandwise spec push`.
5. **First targets are Claude Code sessions on this repo.** The agent pack:
   - `done-check` on the `Stop` hook: is the task actually finished, given the request and the last turn?
   - `action-risk-gate` on `PreToolUse` for Bash, Edit and Write: how risky is this action? In `controlled`, a high-band "high risk" answer turns the tool call into an ask.
   - `model-tier` on `UserPromptSubmit`: is this task mechanical, standard or hard? It adds advice to use a cheaper subagent model for mechanical work. It is advisory, since a hook cannot change the session's own model.
   - `wake-gate` for scheduled check-ins and PR events: does this event need action now?
   - `context-pruner` stays a template for Nick's own apps; Claude Code manages its own context.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep the order: auth and console first | No rule change | Weeks before any real use; nothing measured until then |
| Hosted only (key always on the server) | Keeps the key rule whole | First real use waits for D2 |
| Local then hosted (chosen) | Real Jev answers and receipts within days; D2 reuses the same specs and hooks | Amends the key rule for local mode; two paths to keep in step for a while |

## Consequences

- The kit gains what ADR-019 promised: run with your own key. Kit 0.2.0 carries the agent pack, live mode and receipts.
- Security: the live module is the only CLI code that may load the SDK. A boundary rule and a test enforce it, like the existing fixture-only rule. Hook state (tool inputs, prompts) goes to TypeSafe, so hooks send only the fields a spec's input schema names, and the redact paths apply before the call.
- Receipts live in `~/.bandwise/receipts.jsonl` on the developer's machine. They hold decisions, bands, cost and savings, not prompts or tool inputs.
- Measuring honestly: savings in Claude Code come from fewer wasted turns and fewer risky actions, which are smaller and harder to price than replacing an LLM call in an app. `bandwise report` shows System One cost, decisions made, and the counterfactual LLM cost from the price book, and marks the Claude Code figures as estimates.
- The marketing site still describes only what works. Live management goes on www once D2 runs for real.

## Rollout

1. D0 as soon as the key exists. D1 in one PR per piece: live mode, receipts and report, the agent pack templates, the hooks and their install command.
2. Hooks install into this repo's `.claude/settings.json` only after Nick approves, all sets in `shadow`.
3. After a week of receipts, Nick picks which sets move to `controlled`.
Reversal: remove the hooks from `.claude/settings.json`; live mode stays opt-in behind `--live` and an env key.
