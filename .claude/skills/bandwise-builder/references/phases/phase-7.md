# Phase 7: MCP HTTP transport and Claude Code plugin

**Owner:** Integrations. **Needs:** Phase 3 operations and Phase 4b.

The stdio transport and the Phase 3 curated tools shipped in Phase 3. This phase adds the HTTP transport and packages everything for Claude Code. Tools, profiles and the customer skills are specified in [headless-and-agents.md](../headless-and-agents.md).

- [ ] `packages/mcp-server` HTTP transport; add the Phase 3b and 4b tools listed in [headless-and-agents.md](../headless-and-agents.md) if they are not already present
- [ ] Auth with an agent token (`BANDWISE_TOKEN` or a `bandwise login` profile), never an `sk_` app token and never a TypeSafe key
- [ ] `plugins/claude-code`: `.claude-plugin/plugin.json`, `.mcp.json` (one server entry per profile), and the customer skills `bandwise-operator` and `bandwise-integrate`
- [ ] The `bandwise-builder` skill is internal and never ships in this plugin.
- [ ] Marketplace repo or local marketplace entry

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): MCP server over HTTP; the Claude Code plugin and its customer skills; update Agents and MCP so nothing on it is marked as coming

## Exit gate
- `claude plugin install` works from the marketplace.
- In a sample repo, a prompt like "set up Bandwise in this app" produces an opportunity, a set and a generated typed client.
- A prompt like "run the triage set on this text" returns a `RunResult` with bands.
- A prompt to publish to production on a protected or live set returns a pending approval until a human approves it.
- The MCP inspector passes.
