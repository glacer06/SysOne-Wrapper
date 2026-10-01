# ADR-021: Bandwise Gate, the first plugin, and OAuth for remote MCP

- **Status:** proposed
- **Date:** 2026-10-01
- **Owner:** Integrations (`packages/mcp-server`, `plugins/claude-code`), with Platform / Tenancy for the auth server, reviewed by the Security reviewer
- **Decider:** Nick
- **Amends:** [ADR-007](007-headless-parity.md), the "OAuth 2.1 and cross-org tokens" row in its options table, which ruled OAuth out. The MCP server rollout in `.claude/skills/bandwise-builder/references/headless-and-agents.md` ("stdio transport in Phase 3, HTTP transport in Phase 7"), for a six-tool slice only.
- **Contract impact:** none to the frozen contracts. The `agent` actor, the `Scope` union and the `client` value `mcp` already exist. New auth tables from the OAuth provider plugins, granted in their own migration and listed in `AUTH_TABLES`. New columns on `agent_tokens` to link a grant. New MCP tool names, which are an Integrations surface, not a core contract.
- **Tickets:** NSI-743 (Claude connector and Claude Code plugin), NSI-744 (ChatGPT plugin). Builds on NSI-694 (MCP HTTP transport) and NSI-695 (agent-token auth).

## Context

On 2026-10-01 Nick asked for the plugin that will get traction, positioned in a niche, launched first as a demo on the `internal` org and opened in Phase 2. He is indifferent on the org model. The research behind this ADR is in the "Bandwise plugin traction strategy" report. What it found, in short:

1. **Claude Code hooks run Bandwise without the model choosing it.** A Stop hook fires every time the agent says it is done, and PreToolUse fires before every tool call. A ChatGPT plugin runs only when the model picks it, and the record from the 2023 plugins to the 2026 apps is weak traffic for tools users did not already want (Bloomberg via PYMNTS, 2026-03-30).
2. **False "done" claims are a public, unsolved pain.** One Claude Code issue (#46940) shows the agent reporting 4966 of 4966 tests passing while 7 had regressed. The free alternative is a `type: "prompt"` hook on Haiku, which returns a yes or no with no confidence. Claude Code Review costs $15 to $25 per review and never blocks.
3. **Our dogfood sets are already this product.** `done-check` on Stop and `action-risk-gate` on PreToolUse run on this repo in `shadow` (ADR-020), with receipts that show cost and savings.
4. **Both hosts use the same plumbing.** A Claude connector and a ChatGPT plugin are each a remote MCP server over HTTPS with OAuth 2.1 for per-user auth. Claude requires a `401` with `WWW-Authenticate: Bearer resource_metadata=...`, S256 PKCE, a 10 second limit on discovery, registration and token endpoints, form-encoded token requests, refresh-token rotation for public clients, and loopback redirects for Claude Code ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication)). ChatGPT requires `/.well-known/oauth-protected-resource`, CIMD or DCR, an echoed `resource` parameter, `iss` in the response (RFC 9207) and S256 PKCE ([OpenAI developer docs](https://developers.openai.com/apps-sdk/llms-full.txt)). Both stores require every tool to say whether it is read-only or destructive.
5. **ADR-007 ruled out OAuth** as more than we needed: the device flow plus one profile per org covered Nick's three orgs. That still holds for the CLI. It does not hold for claude.ai, Claude Desktop, Cowork or ChatGPT, which only connect to an authenticated remote server through OAuth (Claude's `static_headers` mode is beta and limited to some orgs).
6. **Better Auth ships the pieces.** `@better-auth/oauth-provider` follows OAuth 2.1, includes the RFC 9207 `iss` parameter, supports S256 PKCE only, has an optional RFC 7591 dynamic registration endpoint and protected resource metadata, and has an MCP mode for when the protected resource is an MCP server. `@better-auth/cimd` adds Client ID Metadata Documents. Both are at 1.7.7 on npm, the same version as our `better-auth` pin (checked 2026-10-01, [OAuth provider docs](https://www.better-auth.com/docs/plugins/oauth-provider)).

## Decision

### 1. The first plugin is Bandwise Gate

Bandwise Gate is a Claude Code plugin and a remote MCP connector that answer two questions with a confidence band, a reason and a receipt: **is the agent really done**, and **does this action need a person**. The done-check is the product. The action gate ships beside it in `shadow`.

Order: the Claude Code plugin and the Claude connector first (NSI-743). The ChatGPT plugin second, on the same server, aimed at Codex and ChatGPT users who ask "is this ready to ship" (NSI-744). Support triage, lead routing and other generic decision apps are not first. The stores are crowded there and nothing calls them by default.

Positioning: Bandwise sits between deterministic rules and expensive review. Rules catch what is known to be bad. Bandwise judges the gray zone with a band, and only the low band reaches a person. Listing copy names what Bandwise adds (a band, a reason, a cost) and never disparages the alternatives, since both stores reject tools that promote products or steer the model.

### 2. One remote MCP server, six preset tools

`packages/mcp-server` gains a streamable HTTP transport served at `https://app.bandwise.dev/mcp`, in the console app next to `/api/v1`. It is stateless and calls `runOperation` in process, so scopes, roles, approvals, idempotency, audit, run caps and the `RunResult` envelope apply exactly as on the API. It never holds a TypeSafe, OpenRouter or AI Gateway key.

This pulls a slice of the Phase 7 HTTP transport forward. The slice has six tools, each a preset over an operation the registry already has, so headless parity holds:

| Tool | Operation | Scope and role | Hint |
|---|---|---|---|
| `bandwise_check_done` | `set.run` on the org's done-check set | `run`, viewer | read-only, open world |
| `bandwise_check_action` | `set.run` on the org's action-risk set | `run`, viewer | read-only, open world |
| `bandwise_get_savings` | `report.get` | `reports:read`, viewer | read-only |
| `bandwise_list_review_items` | `review.list` | `review:read`, reviewer | read-only |
| `bandwise_resolve_review_item` | `review.resolve` | `review:write`, reviewer | destructive |
| `bandwise_report_feedback` | `feedback.report` | `feedback:write`, reviewer | neither |

Each description starts "Use this when", says what not to use it for, and stays under the hosts' limits. The org picks which published set backs each check tool (a set slug per tool in org settings, default `done-check` and `action-risk-gate`). Publish, rollout, rollback, set editing and every admin operation stay out of this tool set. The full curated tool list from headless-and-agents.md still arrives with Phase 3 and Phase 7.

Rules every tool keeps:

- **Minimal input, redacted.** The check tools accept only the fields the set's input schema names: the claim, the test or build output, the changed file list, the command. Before anything reaches System One, the server applies the set's redact paths and a secret scrub (tokens with known prefixes, `KEY=`, `TOKEN=`, `SECRET=`, `PASSWORD=` assignments, bearer headers, private key blocks) and caps each field at the length the set allows. This is in `packages/core` as a pure function, so the hook path and the MCP path share it. ChatGPT forbids collecting API keys and auth secrets, and the action gate sees shell commands that can contain them.
- **What the model sees.** Tool output shows the band, the answer, the reason, what evidence is missing and one cost line ("This check cost $0.00003 and saved about $0.004"). The run id, receipt detail and trace data go in `_meta`, which the model does not read. ChatGPT asks for session and trace ids to stay out of responses.
- **No selling in the host.** No upgrade prompts and no pricing in tool output. Pricing lives on bandwise.dev.

### 3. The Claude Code plugin

`plugins/claude-code` becomes the `bandwise-gate` plugin, published from our own marketplace repo:

- a `bandwise-gate` skill that tells Claude when to call the check tools and how to read a band;
- the Stop and PreToolUse hooks, calling the published `bandwise hook` with `BANDWISE_TOKEN` (the remote path from D2, which imports neither core nor the SDK);
- the remote MCP entry for `https://app.bandwise.dev/mcp`;
- no `bin/` folder, so claude.ai and Cowork accept the plugin as well as Claude Code.

It must pass `claude plugin validate --strict`. The official Anthropic marketplace needs a partner contact, so we do not plan around it. Our own marketplace and the connector directory are the channels.

### 4. OAuth 2.1 issues agent tokens; it does not replace them

Claude and ChatGPT reach the server through OAuth. The OAuth grant is a new way to mint an ADR-007 agent token, not a second permission system.

- **Server.** Better Auth with `@better-auth/oauth-provider` in MCP mode and `@better-auth/cimd`, pinned to the same version as `better-auth`. The authorization server and the protected resource are both `app.bandwise.dev`. The server publishes `/.well-known/oauth-protected-resource` and authorization server metadata, returns `401` with `WWW-Authenticate: Bearer resource_metadata=...` on `/mcp`, echoes `resource`, returns `iss`, and accepts S256 PKCE only. Discovery, registration and token endpoints answer within 10 seconds.
- **Clients.** CIMD only at first. Dynamic client registration stays off. While the server is internal, CIMD accepts only an allowlist of client id URLs (Claude's and ChatGPT's published ones). A CIMD fetch is a server-side fetch of a URL a stranger chose, so it is https only, public addresses only (no private, loopback, link-local or metadata ranges, checked after DNS resolution), with a 5 second timeout, a 64 KB size cap, no redirects, and a cache. Redirect URIs must match the client document exactly, except loopback redirects on any port for Claude Code, as RFC 8252 requires.
- **Sign-in and consent.** The person signs in with the console's rules: Better Auth email and password, TOTP before anything else, internal-org members only until Phase 2. The consent screen names the client, shows the scopes in plain words, and binds the grant to **one org**. The org stays the security boundary, as ADR-001 and ADR-007 require. A second org needs a second connection.
- **Scopes.** The default grant is `run`, `reports:read` and `review:read`, with a role ceiling of viewer. `review:write` and `feedback:write` are separate boxes on the consent screen, unticked by default, and raise the ceiling to reviewer. A grant can never hold `sets:write`, `release:*`, `apps:write`, `evals:run` or `admin:write`. Moves toward safety stay ungated (golden rule 10).
- **Mapping to an agent token.** Consent creates an `agent_tokens` row with `client: "mcp"`, the granted scopes, the role ceiling, a 90-day expiry and a link to the OAuth client and grant. Each request resolves the OAuth access token to that row and builds the usual `agent` actor, with `role = min(ceiling, membership role)` recomputed every time. So the console token list shows the grant, revoking it there kills the connection, demotion shrinks it at once, and the run caps from the run limits work (per caller and per org) and the token's daily spend cap apply unchanged.
- **Token handling.** Access tokens last 1 hour. Refresh tokens rotate on every use, and a reused or dead one returns `invalid_grant` and revokes the grant. Access and refresh tokens are stored hashed with `BANDWISE_TOKEN_PEPPER`, like session tokens and `sa_live_` tokens, and the build must show the provider plugin storing no raw token. No token appears in logs, audit rows, tool output or `_meta`.
- **Tables.** The provider plugins' tables arrive in a new migration that grants them on their own, are listed in `AUTH_TABLES`, get no Data API grants, and do not touch the frozen 0001 security block. Any crypto helper the mapping needs lives in `@bandwise/tenancy`.

### 5. Demo on `internal` first, then Phase 2

The demo needs no OAuth. Claude Code reads the MCP entry with an `Authorization: Bearer ${BANDWISE_TOKEN}` header from the person's environment, using the run-only viewer `sa_live_` token the hooks already use plus a second token with the review scopes for people who want them. Every set stays in `shadow`. OAuth is built during the demo and must be live before anyone outside `internal` connects, including through claude.ai custom connectors.

For Phase 2 the org model is one org per installing team, created on first sign-in, which is what Phase 2 builds anyway. On Claude Team and Enterprise an owner adds the connector and each member signs in with their own account, so "a team lead turns on Bandwise Gate for everyone" is the expansion path.

### 6. Opening depends on the shadow numbers

The plugin opens to outside users only if the internal shadow period shows Bandwise doing something the free Haiku hook cannot. Proposed bar, for Nick to confirm: after at least 200 labelled Stop events, the done-check's high "not done" band has a precision lower bound of at least 0.9, and it catches false "done" claims that a Haiku prompt hook run in parallel on the same events misses. The parallel Haiku run happens only in shadow and uses the platform `ANTHROPIC_API_KEY`. If the bar is missed, the plugin stays as a channel for the operator tools and we look for the next niche.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| ChatGPT plugin first | Largest audience; in-chat suggestions | Runs only when the model picks it; weak traffic record; no selling inside the host |
| Generic "decide anything" connector | Shows the whole engine | Nothing calls it by default; competes with every LLM-as-judge tool |
| Support triage plugin | Clear buyer | Crowded; needs a helpdesk integration before it does anything |
| Bandwise Gate on Claude Code first (chosen) | Hooks call it on every Stop and tool call; already dogfooded; clear rival with a clear gap | Depends on beating a free default; Claude Code users only at first |
| Static API keys instead of OAuth | No auth server to build | claude.ai and ChatGPT do not accept it for an authenticated remote server (Claude's mode is beta and limited) |
| DCR instead of CIMD | Widest client support | Registers a new client per connection; Claude advises CIMD for directory servers; an open registration endpoint is attack surface |

## Consequences

- Golden rules 2 and 8 hold: no System One key reaches a host, and every MCP tool is an operation the API and CLI also expose.
- The server gains a public OAuth surface and a server-side fetch. Both are new attack surface, which is why section 4 is narrow (CIMD allowlist, no DCR, one org per grant, no write scopes beyond review) and why the Security reviewer signs off before any outside connection.
- Hook data and tool inputs go to TypeSafe after redaction. The privacy policy on bandwise.dev must name TypeSafe as a processor before either store listing; both stores reject a listing without a privacy policy.
- We log invocations and outcomes ourselves. OpenAI gives builders little usage data, and the receipt ledger already records most of it.
- Directory review times are not published by either store. Dates in NSI-743 and NSI-744 are targets, not commitments.

## Rollout

1. **Remote slice.** After D2e is live: HTTP transport and the six tools, bearer agent-token auth only, `internal` only. Exit: MCP Inspector runs every tool, and the parity test covers the presets.
2. **Plugin, private.** `plugins/claude-code` as `bandwise-gate` in our own marketplace. Exit: `claude plugin validate --strict` passes, and Nick and PJ install it with `claude plugin marketplace add` and `claude plugin install`.
3. **Internal demo, 2 to 4 weeks.** Both sets in `shadow`, the parallel Haiku baseline on. Exit: the bar in section 6, read by Nick.
4. **OAuth.** Built during step 3, one PR, Security review before merge. Exit: Claude Code, claude.ai (custom connector by URL) and ChatGPT Developer Mode all connect to `internal`. Cross-org tests show a grant cannot reach another org, and a revoked grant fails on the next call.
5. **Open with Phase 2.** Self-serve orgs, then submit the connector and the plugin at claude.ai/directory/manage. New listings start as Community after an automated scan.
6. **ChatGPT plugin.** After step 5 is stable: verified developer identity, privacy policy, submission on the OpenAI Developer Platform, and a golden prompt set (direct, indirect and negative prompts) passing in Developer Mode.

Reversal: remove the plugin from our marketplace and the connector from the directory, and turn off `/mcp`. Revoking the OAuth grants revokes their agent tokens. Nothing in the API, the CLI or the console depends on the MCP slice.

## Open questions for Nick

1. The name: Bandwise Gate, or keep plain "Bandwise" in both stores?
2. The section 6 bar: 200 events and a 0.9 lower bound, or a different number?
3. ChatGPT timing: after the Claude listing is stable (proposed), or submit in parallel once OAuth is live?
