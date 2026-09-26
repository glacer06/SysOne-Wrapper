# Phase 5: Plugins and templates

**Owner:** Extensions. **Needs:** Phase 4.

- [ ] `plugin-sdk`: `definePlugin()`, `InputAdapter`, `QuestionTemplate`, `ActionHandler` interfaces, build-time registry (no remote code loading)
- [ ] Built-in input adapters: JSON, plain text, email, HTML to text, CSV row, webhook payload
- [ ] Built-in actions: webhook (HMAC signed), Slack, email, create review item, escalate to LLM
- [ ] Seeded templates from `definition-studio.md` (all eleven)
- [ ] Per-org plugin enablement with encrypted config
- [ ] Conformance test suite every plugin must pass
- [ ] Example third-party plugin in `examples/`

## Exit gate
- Built-ins pass conformance tests.
- Every template creates a working set from the console and passes a fixture run.
- Action handlers are idempotent under retry (`runId:questionId`).
