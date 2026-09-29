# ADR-020: Dogfood track: use Bandwise on Bandwise first, local then hosted

- **Status:** accepted (Nick, 2026-09-28: first app "Claude Code on Bandwise", Jev key "TypeSafe direct", "Yes, local then hosted", autonomy "Shadow first"). Amendment 1 (launch profiles): accepted (Nick, 2026-09-29: "Merge it whole")
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

### Amendment 1: launch profiles (accepted, Nick, 2026-09-29, for NSI-727)

`model-tier` can only advise, because a hook cannot change the model of a session that is already running. A host that starts the session can. Claude Code takes `--model` and `--effort` at launch (https://code.claude.com/docs/en/cli-reference). This amendment lets the CLI make that pick before a session starts. It is the first time the CLI starts another program, so it gets its own rules.

6. **One program, two flags.** `bandwise launch --set <spec> --profiles <file> [--rollout] -- <agent args>` may start exactly one program: the agent CLI named in the profiles file (`claude` for Claude Code). It passes the arguments after `--` through unchanged and adds only `--model <m>` and `--effort <e>`. It never adds, drops or rewrites any other flag. In particular it never touches permission flags (`--permission-mode`, `--dangerously-skip-permissions`, `--allowedTools`, `--settings`): permissions and approvals stay with the host and the person. The program is started with an argument array and no shell, inherits the terminal, and `bandwise launch` exits with its exit code.
7. **The allowlist is a reviewed file.** `.bandwise/profiles.json` names the agent program, a `default` profile id, and each profile as one or two sessions, each with `model` and `effort`. It lives in the repo and changes by commit, like a spec. The profiles file can hold only a program name from a fixed list (`claude` today), model ids and effort levels (`low`, `medium`, `high`, `xhigh`, `max`). No free-form flags, paths or commands. A profiles file that fails that schema stops the launch with an error that names the field. That is the one case where `bandwise launch` refuses rather than falling back, because it means the reviewed file is wrong.
8. **The set can only pick an id.** The `launch-profile` set answers with a choice key. The CLI maps it to a profile id in the file; an answer that is not a profile id resolves to `default`. The set never supplies a model name, an effort level or a flag.
9. **Shadow first, fail to the default.** In `shadow` the launch always uses `default` and the receipt records what the set would have picked. In `controlled` only a high band pick is used, as everywhere else. A missing key, an error or a timeout (3 seconds) launches with `default` and prints one line to stderr saying so. A Bandwise problem never stops the person from starting a session.
10. **One session per launch.** `bandwise launch` starts one session. A profile's second session (research or a review the person asked for) is recorded in the receipt and printed by `--print`, for a host that starts its own workers. `bandwise launch` does not start it. Starting a second agent is a bigger step and needs its own decision.
11. **`--print` starts nothing.** `bandwise launch --print` runs the same pick and prints the chosen profile as JSON (`{"profile", "sessions": [{"model", "effort"}], "picked", "rollout"}`) for other hosts: the Agent SDK, CI, cloud sessions. It is the first thing to build and the safe way to try the set.
12. **Same data rule as hooks.** The task text goes to TypeSafe only through the input schema's fields, with the redaction `bandwise hook` applies. The key rule of point 2 is unchanged.
13. **One module starts programs.** Only `packages/cli/src/live/spawn.ts` may import `node:child_process`. A boundary rule and a test enforce it, like the SDK transport rule. The kit export carries the same rule in its ESLint config.
14. **No claim without our numbers.** Speed or cost claims about launch profiles go on www or in the docs only after NSI-729 has two weeks of receipts comparing the pick with the default.

| Option for the amendment | Pros | Cons |
|---|---|---|
| Print only, no process started | Nothing new to trust; the person wraps it in a shell alias | Every host writes its own wrapper; easy to skip the fallback |
| Start the agent with only `--model` and `--effort` added (chosen, with `--print`) | One command; fallback and receipts built in; flags fixed by a reviewed file | The CLI starts a program for the first time; needs its own rule and test |
| Let the set return flags or a command | Most flexible | Model output would shape a command line. Rejected |

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
- Amendment 1: the CLI starts a program for the first time. The risk is bounded by points 6 to 8. The program name and every flag value come from a reviewed file, model output can only choose among its ids, and permission flags are never touched. The Security reviewer signs off on `live/spawn.ts` and the profiles schema before NSI-727 merges. `profiles.json` is a local CLI file format, not a core contract. D2 can serve the same pick from the hosted endpoint later without changing it.

## Rollout

1. D0 as soon as the key exists. D1 in one PR per piece: live mode, receipts and report, the agent pack templates, the hooks and their install command.
2. Hooks install into this repo's `.claude/settings.json` only after Nick approves, all sets in `shadow`.
3. After a week of receipts, Nick picks which sets move to `controlled`.
4. Amendment 1: build `--print` first, then the launch, in one PR with the spawn rule and its test (NSI-727). Run it in `shadow` for two weeks while NSI-729 measures. Only then does Nick decide on `controlled`.
Reversal: remove the hooks from `.claude/settings.json`; live mode stays opt-in behind `--live` and an env key. For Amendment 1: stop using `bandwise launch` and start `claude` directly. Nothing else depends on it.
