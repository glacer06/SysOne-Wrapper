# Phase 7: Claude Code plugin and MCP server

**Owner:** Extensions. **Needs:** Phase 4 API.

- [ ] `packages/mcp-server` (stdio and HTTP): `list_question_sets`, `get_question_set_manifest`, `run_question_set(setRef, state, channel?)`, `list_review_items`
- [ ] Auth with a scoped `SYSONE_API_KEY` (`sk_`), never a Jev key
- [ ] `plugins/claude-code`: `.claude-plugin/plugin.json`, this builder skill, a user-facing "use SysOne sets" skill, `.mcp.json`
- [ ] Marketplace repo or local marketplace entry

## Exit gate
- `claude plugin install` works from the marketplace.
- A prompt like "run the triage set on this text" returns a `RunResult` with bands.
- The MCP inspector passes.
