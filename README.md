# SysOne Wrapper

A managed product around TypeSafe's System One models. Jev is the first, and the default.

Jev doesn't write text. You give it state and a few typed questions (yes/no, pick one, rate on a scale), and it hands back typed answers with probabilities and a confidence number, fast and for about 4 cents per million input tokens (Jev 1.13). That's great for the small judgment calls software makes all day. What it doesn't give you is everything around the call: who can change the questions, which version is live, what happens when the model isn't sure, and proof that it's saving money.

SysOne is that layer.

- **Goals and question sets.** Define what a decision is for, then build versioned sets of Noul, Choice, and Score questions.
- **Managed live.** Publish, roll back, and pin versions. Apps call a set by ID (managed) or through generated typed code (managed_typed) and never redeploy for a question change. A standalone export that calls TypeSafe directly comes later; it gives up live edits, rollout enforcement and review unless it reports runs back.
- **Confidence bands.** Every answer lands in high, medium, or low, and each band maps to an action: act, send to review, fall back, or escalate to an LLM.
- **Rollout stages.** Inactive, shadow, controlled, full, paused, set per channel. Measure before you trust.
- **Set up apps.** Describe an app, or let an agent look through its code, get proposed decision points, build the set, and wire it in with generated typed code (TypeScript first, Python later).
- **Headless.** Everything the console does is in the management API, the sysone CLI and the MCP server, so an agent can run the whole loop. Risky moves wait for a human approval.
- **Gets better over time.** Apps report outcomes, a small audit sample keeps precision honest, thresholds are suggested from labels, and challengers (new versions or new models) are tested before they take over.
- **Any System One model.** Models, limits and prices live in a registry. When TypeSafe ships a new model, SysOne detects it and offers each set a tested upgrade.
- **Definition Studio.** Turn a fuzzy question like "is this urgent?" into narrow checks, then test them against your own judgment.
- **Savings ledger.** Every run reports its System One cost against an LLM baseline. Org dashboards and monthly reports show the ROI.
- **Full administration.** Multi-tenant orgs, roles, audit log, keys, billing, retention, and PII controls.
- **Extensions.** React embed kit, plugins, a Chrome extension, an MCP server and a Claude Code plugin.

## Where things are

- `docs/PLAN.md`: the full plan
- `docs/adr/`: architecture decisions
- `.claude/skills/sysone-builder/`: the builder skill every agent on the team loads first
- `CLAUDE.md`: quick rules for anyone working in this repo

## Status

Phase 0 is done: the builder skill, the plan, the monorepo scaffold and the frozen zod contracts, with a green gate. ADRs 002 to 010 are accepted. ADR-011, which adds OpenRouter as a second route to System One models, is proposed. Phase 1 (core engine and data layer) is next.
