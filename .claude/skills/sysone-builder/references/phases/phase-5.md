# Phase 5: Plugins and templates

**Owners:** Extensions, Platform (org event webhooks), Integrations (GitHub Action). **Needs:** Phase 4.

- [ ] `plugin-sdk`: `definePlugin()`, `InputAdapter`, `QuestionTemplate`, `ActionHandler` interfaces, build-time registry (no remote code loading)
- [ ] Built-in input adapters: JSON, plain text, email, HTML to text, CSV row, webhook payload, web page (selection, readable text, per-site selectors)
- [ ] Built-in actions: webhook (HMAC signed), Slack, email, create review item, escalate to LLM. Side-effect handlers do not dispatch for staging runs unless the set opts in (`dispatchActionsOnStaging`).
- [ ] Seeded templates from [definition-studio.md](../definition-studio.md) (the remaining nine; document evaluator and email urgency shipped in Phase 3), each tagged with a pattern ([deploy-and-codegen.md](../deploy-and-codegen.md)) and building a `Partial<QuestionSetSpec>` that includes `input.schema`
- [ ] Per-org plugin enablement with encrypted config
- [ ] Conformance test suite every plugin must pass
- [ ] Example third-party plugin in `examples/`
- [ ] Org event webhooks (`webhook_endpoints`, HMAC with `org_webhook_secrets`, retries) per [events.md](../events.md)
- [ ] GitHub Action (in `examples/` or published) that runs `sysone check` and comments `sysone spec diff` on PRs ([headless-and-agents.md](../headless-and-agents.md))

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Plugins (input adapters, actions, writing and testing a plugin); Template library; Org webhooks and signature checks; the GitHub Action

## Exit gate
- Built-ins pass conformance tests.
- Every template creates a working set from the console and passes a fixture run.
- Action handlers are idempotent under retry (`runId:decisionId`).
