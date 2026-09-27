# Phase 5: Plugins and templates

**Owners:** Extensions, Platform (org event webhooks), Integrations (GitHub Action). **Needs:** Phase 4.

- [ ] `plugin-sdk`: `definePlugin()`, `InputAdapter`, `QuestionTemplate`, `ActionHandler` interfaces, build-time registry (no remote code loading)
- [ ] Built-in input adapters: JSON, plain text, email, HTML to text, CSV row, webhook payload, web page (selection, readable text, per-site selectors)
- [ ] Built-in actions: webhook (HMAC signed), Slack, email, create review item, escalate to LLM. Side-effect handlers do not dispatch for staging runs unless the set opts in (`dispatchActionsOnStaging`).
- [ ] Seeded templates from [definition-studio.md](../definition-studio.md) (the remaining nine; document evaluator and email urgency shipped in Phase 3), each tagged with a pattern ([deploy-and-codegen.md](../deploy-and-codegen.md)) and building a `Partial<QuestionSetSpec>` that includes `input.schema`
- [x] Kit template pack (ADR-019): `packages/templates`, pure, depends only on core. Email triage, PR safety gate, log-line pager, context pruner, wake gate, and the triage pack (security finding triage, error triage, lead and event scoring, inbound email routing). Each is a full `QuestionSetSpec` with a pattern tag, metadata, 2 to 3 example states and a borderline case per question, outage rule `review`. Tests: strict parse, zero lint errors on `jev-1.13.0`, states valid for `input.schema`, a `bandwise run --local` RunResult for every state.
- [ ] Wrap the kit templates as plugin-sdk `QuestionTemplate`s once `plugin-sdk` lands, and add the remaining seeded templates from definition-studio.md (LLM router, reasoning-effort controller, LLM guardrails, RAG passage filter, AI-tell detector, document evaluator, UI action picker)
- [ ] Per-org plugin enablement with encrypted config
- [ ] Conformance test suite every plugin must pass
- [ ] Example third-party plugin in `examples/`
- [ ] Org event webhooks (`webhook_endpoints`, HMAC with `org_webhook_secrets`, retries) per [events.md](../events.md)
- [ ] GitHub Action (in `examples/` or published) that runs `bandwise check` and comments `bandwise spec diff` on PRs ([headless-and-agents.md](../headless-and-agents.md))

## Docs site
- [x] Template library pages: `apps/docs/content/docs/templates`, generated from `packages/templates` (`pnpm --filter @bandwise/docs generate:templates`; a test fails on drift)
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Plugins (input adapters, actions, writing and testing a plugin); Org webhooks and signature checks; the GitHub Action

## Exit gate
- Built-ins pass conformance tests.
- Every template creates a working set from the console and passes a fixture run.
- Action handlers are idempotent under retry (`runId:decisionId`).
