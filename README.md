# SysOne Wrapper

A managed product around TypeSafe's Jev, the first System One model.

Jev doesn't write text. You give it state and a few typed questions (yes/no, pick one, rate on a scale), and it hands back typed answers with probabilities and a confidence number, fast and for about 4 cents per million input tokens. That's great for the small judgment calls software makes all day. What it doesn't give you is everything around the call: who can change the questions, which version is live, what happens when the model isn't sure, and proof that it's saving money.

SysOne is that layer.

- **Goals and question sets.** Define what a decision is for, then build versioned sets of Noul, Choice, and Score questions.
- **Managed live.** Publish, roll back, and pin versions. Apps call a set by ID and never redeploy for a question change.
- **Confidence bands.** Every answer lands in high, medium, or low, and each band maps to an action: act, send to review, fall back, or escalate to an LLM.
- **Rollout stages.** Draft, shadow, controlled, full. Measure before you trust.
- **Definition Studio.** Turn a fuzzy question like "is this urgent?" into narrow checks, then test them against your own judgment.
- **Savings ledger.** Every run reports Jev cost against an LLM baseline. Org dashboards and monthly reports show the ROI.
- **Full administration.** Multi-tenant orgs, roles, audit log, keys, billing, retention, and PII controls.
- **Extensions.** React embed kit, plugins, a Chrome extension, and an MCP server for Claude Code.

## Where things are

- `docs/PLAN.md`: the full plan
- `docs/adr/`: architecture decisions
- `.claude/skills/sysone-builder/`: the builder skill every agent on the team loads first
- `CLAUDE.md`: quick rules for anyone working in this repo

## Status

Planning and the builder skill are done. The scaffold (Phase 0 part two) is next.
