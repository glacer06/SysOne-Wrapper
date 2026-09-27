# Phase 4b: Integrate and deploy

**Owners:** Integrations (lead), Platform (operations and routes), Console UI (app pages), Core Engine (`interface.breaking` lint), Security reviewer. **Needs:** Phase 3. Runs in parallel with Phase 4.

The flow, contracts and rules are in [deploy-and-codegen.md](../deploy-and-codegen.md). Decision record: [ADR-009](../../../../../docs/adr/009-app-integration-and-deploy-targets.md). The TypeScript target calls `@sysone/client`'s generic `run<T>()` from Phase 4; build against its types until the package lands. Items are in build order.

## Apps and opportunities
- [ ] App profile fields `language`, `framework`, `repo_url` ([data-model.md](../data-model.md))
- [ ] `app_opportunities` with the `opportunity.list`, `opportunity.create` and `opportunity.update` operations and routes ([management-api.md](../management-api.md))
- [ ] Console "Describe your app" form: `llm-client` drafts opportunities from a description and pasted snippets; snippets are not stored
- [ ] MCP `add_opportunity` and `sysone opportunities add|list` ([headless-and-agents.md](../headless-and-agents.md))
- [ ] Pattern enum on opportunities and templates, with the pattern advisor table in the drafting prompt
- [ ] Studio prefill from an `Opportunity`: intent sentence, state fields, seed examples ([definition-studio.md](../definition-studio.md))

## Codegen and bindings
- [ ] `packages/codegen` TypeScript target (pure: `SetInterface` plus manifest in, files out)
- [ ] Codegen surfaces: `GET /api/v1/sets/{ref}/codegen` (`set.codegen`), `sysone codegen`, MCP `generate_client`, console "Use in your app" tab
- [ ] `app_set_bindings` with `binding.list`, `binding.create` and `binding.remove`; the app page (sets in use, channel, served version, interface major, last run) and the set Consumers panel in the publish dialog
- [ ] `interface.breaking` lint using consumers (bindings plus apps with runs in the last 30 days), cleared only by a major bump with an audited reason (Core Engine)
- [ ] `SysOne-Interface` enforcement on runs: `409 interface_mismatch`, no fallback to an older version

## Repo tooling
- [ ] `sysone init`: writes `sysone.config.json`, creates an app and an app token through the API, adds `@sysone/client` and a typed call site
- [ ] `.sysone/lock.json` written by `sysone codegen`
- [ ] `sysone check`: exit 2 when the live interface major differs from the lock or a generated file was edited

## Behind ADR-009 acceptance (last)
- [ ] Python: `packages/client-py` generated from `openapi.json`, the Python codegen target, and `examples/fastapi`. Only after the ADR-009 Python section is accepted.
- [ ] Standalone export (`typesafe/<slug>.questions.ts` or `.py`, band and route helper golden-tested against `packages/core`) plus `POST /api/v1/runs/ingest`. Only after the ADR-009 Standalone section is accepted. Security reviewer signs off.

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Set up an app (opportunities and the pattern advisor); Deploy targets; Typed clients and codegen; App bindings; Specs as code and `sysone check`; the standalone export and the Python client only once ADR-009's proposed sections are accepted

## Exit gate
- In a sample Next.js repo with no System One code, an agent using only the CLI or MCP and an agent token records an opportunity, builds a set, publishes it to staging, generates and wires the typed client, and, with the set marked protected, requests promotion to production, which a human approves. The console app page then shows the binding.
- Publishing a version that removes a route output a bound production app uses fails the lint unless the major is bumped with a reason.
- `sysone check` exits 2 after a generated file is edited or the live interface major changes.
- Generated TypeScript passes `tsc --noEmit` for every seeded template.
