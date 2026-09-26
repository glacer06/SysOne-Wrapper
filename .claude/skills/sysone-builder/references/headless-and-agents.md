# Headless use and agents

Owners: Integrations (`packages/cli`, `packages/mcp-server`, `plugins/claude-code`) with Docs. Platform / Tenancy owns the operations and routes behind them ([management-api.md](management-api.md)). Decision record: [ADR-007](../../../../docs/adr/007-headless-parity.md).

## What headless means

An agent can do everything a person can do in the console, under the same checks, through three surfaces:

- the HTTP API (`/api/v1`),
- the `sysone` CLI (`@sysone/cli`),
- the MCP server (`packages/mcp-server`).

All three call the same operations as the console ([management-api.md](management-api.md)), so scopes, roles, approvals, idempotency and audit behave the same everywhere.

Nick runs agents across three orgs: SGR, Personal and Dallas. Each org gets its own agent token and its own named profile. There are no cross-org tokens.

## Identities

| Who | Credential | Where it lives | Can do |
|---|---|---|---|
| Host app, server side | `sk_live_` or `sk_test_` app token | the host app's server env | Run sets, report feedback, ingest standalone runs. No management. |
| Host app, browser | `pk_live_` or a 5-minute browser JWT | the page | Run sets only, bound to origin and set list |
| Agents, the CLI, the MCP server, CI | agent token `sa_live_` | a profile, or `SYSONE_TOKEN` in CI | Whatever its scopes allow, as one user in one org, with role = min(ceiling, membership role) |
| Chrome extension | agent token with client `extension`, from the device flow | `chrome.storage.session` | `run`, `sets:read`, `review:read`, `review:write` |
| People | console session | a cookie | Everything their role allows, including approval decisions |

Scopes, the role ceiling, spend caps and the approval gate are in [security.md](security.md). The auth modes are in [api.md](api.md).

### Profiles

`sysone login --profile <name>` runs the device flow (RFC 8628): the CLI shows a code, the person approves it in a console session and picks the org, scopes and role ceiling, and the CLI stores the token.

Profiles live in `~/.config/sysone/profiles.json`:

```json
{
  "default": "sgr",
  "profiles": [
    { "name": "sgr",      "org": "sgr",      "baseUrl": "https://console.example.com", "tokenRef": "keychain:sysone/sgr" },
    { "name": "personal", "org": "personal", "baseUrl": "https://console.example.com", "tokenRef": "keychain:sysone/personal" },
    { "name": "dallas",   "org": "dallas",   "baseUrl": "https://console.example.com", "tokenRef": "keychain:sysone/dallas" }
  ]
}
```

- The secret is kept in the OS keychain when one is available. Otherwise `tokenRef` points into a `0600` credentials file next to `profiles.json`. The profile file itself never holds a secret.
- Which credentials a command uses: `--profile` wins; then `SYSONE_TOKEN` with `SYSONE_BASE_URL`; then the default profile.
- CI sets `SYSONE_TOKEN` and `SYSONE_BASE_URL` from its secret store.

## @sysone/cli

- Package `packages/cli`, binary `sysone`, published to npm.
- A thin HTTP client over `/api/v1`. It never touches the database and never holds a TypeSafe key.
- Every command supports `--json`. It never prompts when stdin is not a TTY; a command that needs confirmation then fails with exit 1 and says to pass `--yes`. `--yes` skips confirmations.
- Exit codes: `0` ok, `1` error, `2` diff or drift found, `3` approval pending.
- Mutations send a generated `Idempotency-Key` and retry safely on network errors, `429` and retryable `503`s with the same key. `--idempotency-key <key>` reuses a key across process restarts, for example a CI rerun.
- Errors print the envelope's `code`, `message` and each `details[]` item (`path`, `rule`, `message`), so an agent can fix and resubmit.

| Command | Operation | Phase |
|---|---|---|
| `login [--profile <name>]`, `logout` | device flow; `agent_token.revoke` on itself | 3 |
| `profiles`, `profiles use <name>` | local | 3 |
| `status` | `actor.get` | 3 |
| `sets list`, `sets create <slug> --goal <id> [--template <id>]` | `set.list`, `set.create` | 3 |
| `spec pull\|push\|diff\|validate <slug>` | `draft.get`, `draft.update`, `version.diff`, `draft.validate` | 3 |
| `publish <slug> --channel <c> [--changelog <text>] [--dry-run]` | `set.publish` | 3 |
| `rollback <slug> --channel <c> [--to <n>]` | `channel.rollback` | 3 |
| `promote <slug> [--dry-run]` | `channel.promote` | 3 |
| `rollout get\|set <slug> --channel <c> [--stage <s> --reason <text>]` | `rollout.get`, `rollout.change` | 3 |
| `eval run <slug> --dataset <name> [--version <n>] [--model <id>] [--repeats <k>] [--wait]` | `eval.run` | 3 |
| `jobs get <id> [--wait]` | `job.get` | 3 |
| `review list`, `review resolve <id>` | `review.list`, `review.resolve` | 3 |
| `feedback send <file.jsonl>` | `feedback.report` | 3 |
| `events tail [--types <a,b>]` | `event.list` | 3 |
| `models list` | `model.list` | 3 |
| `approvals get <id> [--wait]` | `approval.get` | 3 |
| `run <slug> --state <file> [--channel <c>]` | run endpoint ([api.md](api.md)) | 3 |
| `run --local spec.json state.json` | none: `packages/core` with the fixture transport | 3 |
| `health [<slug>]` | `health.get`, `health.list` | 3b |
| `tune <slug> [--apply]` | `policy.suggest` | 3b |
| `proposals list\|accept\|reject` | `proposal.list`, `proposal.accept`, `proposal.reject` | 3b |
| `experiments start\|get\|promote\|stop` | `experiment.*` | 3b |
| `upgrade list`, `upgrade try <slug> --model <id>` | `model.upgrades`, `set.try_model` | 3b |
| `init` | `app.create`, `app_token.create` | 4b |
| `opportunities add\|list` | `opportunity.create`, `opportunity.list` | 4b |
| `codegen <slug> --lang ts\|py [--app <id>]` | `set.codegen` | 4b |
| `check` | `set.get`, local lock file | 4b |

`run --local` replaces the old `pnpm sysone run spec.json state.json`. In this monorepo it is `pnpm sysone run --local spec.json state.json`. It makes no network call and needs no key.

`init`, `codegen`, `check` and the lock file are described in [deploy-and-codegen.md](deploy-and-codegen.md).

## Specs as code

A customer repo can keep its question sets next to the code that calls them:

```
sysone.config.json                 { "org": "sgr", "project": "support", "baseUrl": "https://console.example.com", "profile": "sgr" }
sysone/sets/<slug>.json            a QuestionSetSpec with no rollout field; the schema is strict
sysone/datasets/<slug>/<name>.jsonl  drafting and calibration cases only
sysone/generated/                  generated clients (deploy-and-codegen.md)
.sysone/lock.json                  codegen lock (deploy-and-codegen.md)
.sysone/specs.json                 the draft ETag each spec was pulled from, for If-Match
```

The test split stays on the server. Imported cases get their split from the server, and test-split cases never come back ([management-api.md](management-api.md), Holdout rules).

The flow:

```sh
sysone spec pull triage                  # writes sysone/sets/triage.json and records the draft ETag
# edit sysone/sets/triage.json
sysone spec validate triage              # strict schema locally, then server lints; fix each details[] item
sysone spec push triage --source-ref "$GITHUB_SHA"   # If-Match; a conflict exits 1 and prints currentEtag
sysone eval run triage --dataset gold --wait
sysone publish triage --channel staging
sysone rollout set triage --channel staging --stage shadow --reason "staging check"
sysone promote triage                    # exit 3 while an approval is pending
sysone rollout set triage --channel production --stage shadow --reason "first shadow week"
```

- On a `412`, run `sysone spec diff triage`, merge, `sysone spec pull` to take the new ETag, and push again.
- `sysone spec diff <slug>` compares the local file, the draft and each channel. It says which side changed, using `question_set_versions.source` and `source_ref`: for example "production was published from the console after your last pull". It exits 2 when anything differs.
- The CLI records `--source-ref`, or `GITHUB_SHA` when set, as the version's `source_ref`.

This is how SysOne follows TypeSafe's advice to keep questions and thresholds in one reviewable place. The spec file is that place. SysOne serves it live, so publishing still needs no app redeploy.

Phase 5 adds a GitHub Action that comments `sysone spec diff` on PRs and runs `sysone check`.

## MCP server

- Package `packages/mcp-server`, owned by Integrations. stdio transport in Phase 3, HTTP transport in Phase 7.
- It authenticates with an agent token (`SYSONE_TOKEN` or a profile). Never an `sk_` app token, never a TypeSafe key.
- Tools wrap registry operations. Input schemas are the operation zod schemas converted to JSON Schema. `readOnlyHint` and `destructiveHint` come from the registry's `readOnly` and `destructive`.
- A tool that hits the approval gate returns the pending approval and its URL. The agent should tell the person and poll `get_approval`.
- Member, key and token admin stay in the API and the CLI. They are not MCP tools.
- One server entry per profile, so an agent never mixes orgs:

```json
{ "mcpServers": {
  "sysone-sgr":    { "command": "npx", "args": ["-y", "@sysone/mcp-server", "--profile", "sgr"] },
  "sysone-dallas": { "command": "npx", "args": ["-y", "@sysone/mcp-server", "--profile", "dallas"] }
} }
```

Curated tools:

| Tool | Operation | Phase |
|---|---|---|
| `list_sets` | `set.list` | 3 |
| `get_set` | `set.get` | 3 |
| `create_set` | `set.create` | 3 |
| `get_draft` | `draft.get` | 3 |
| `update_draft` | `draft.update` | 3 |
| `validate_draft` | `draft.validate` | 3 |
| `diff_versions` | `version.diff` | 3 |
| `run_set` | run endpoint ([api.md](api.md)) | 3 |
| `start_eval` | `eval.run` | 3 |
| `get_job` | `job.get` | 3 |
| `publish` | `set.publish` | 3 |
| `rollback` | `channel.rollback` | 3 |
| `promote` | `channel.promote` | 3 |
| `change_rollout` | `rollout.change` | 3 |
| `get_rollout_gates` | `rollout.get` | 3 |
| `list_review_items` | `review.list` | 3 |
| `resolve_review_item` | `review.resolve` | 3 |
| `report_feedback` | `feedback.report` | 3 |
| `list_models` | `model.list` | 3 |
| `list_events` | `event.list` | 3 |
| `get_approval` | `approval.get` | 3 |
| `get_report` | `report.get` | 3 |
| `get_set_health` | `health.get` | 3b |
| `suggest_thresholds` | `policy.suggest` | 3b |
| `list_proposals` | `proposal.list` | 3b |
| `decide_proposal` | `proposal.accept` or `proposal.reject`, by `decision` | 3b |
| `try_model` | `set.try_model` | 3b |
| `start_experiment` | `experiment.start` | 3b |
| `get_experiment` | `experiment.get` | 3b |
| `decide_experiment` | `experiment.promote` or `experiment.stop`, by `decision` | 3b |
| `add_opportunity` | `opportunity.create` | 4b |
| `generate_client` | `set.codegen` | 4b |

The run tool maps to the run endpoint, which is registered like any other operation for the parity test.

## Customer Claude Code skills (Phase 7)

These ship in `plugins/claude-code/skills` with the MCP server config. The `sysone-builder` skill is internal and never ships.

- **`sysone-operator`**: manages sets. It moves a set from `inactive` to `shadow` to `controlled` to `full`, reads review disagreements and set health, and knows when an approval is needed and what to tell the person. It tells app code to branch only on `effectiveAction` and `route`. For question wording it defers to the official `typesafe` skill.
- **`sysone-integrate`**: works in a customer repo. It loads the official `typesafe` skill and uses its "find opportunities" and "applicable cookbooks" prompts, posts opportunity summaries (never source code) with `apps:write`, builds the set, then runs `sysone codegen` and `sysone check`.

## End-to-end agent flows

### (a) Manage: from template to production with approval (Phase 3)

1. `sysone sets create triage --goal <goalId> --template email-urgency` (MCP `create_set`).
2. `sysone spec pull triage`, edit, `sysone spec validate triage` (MCP `get_draft`, `validate_draft`). Fix each `details[]` item by its JSON Pointer and rule id.
3. `sysone spec push triage` (MCP `update_draft`, with the ETag from `get_draft`).
4. `sysone eval run triage --dataset gold --wait` (MCP `start_eval`, then `get_job`).
5. `sysone publish triage --channel staging` (MCP `publish`).
6. `sysone promote triage` (MCP `promote`). For a live or protected set this returns an approval: exit 3. `sysone approvals get <id> --wait` (MCP `get_approval`) until a person approves in the console.
7. `sysone rollout set triage --channel production --stage shadow --reason "..."` (MCP `change_rollout`).
8. Later, `sysone rollout get triage --channel production` (MCP `get_rollout_gates`) until the gates are met, then set `controlled`. That move needs an approval, and `full` also needs an admin ceiling.
9. If anything looks wrong, `sysone rollback triage --channel production` or set the stage to `paused`. Moves toward safety never wait.

### (b) Set up an app (Phase 4b)

1. In the app repo, `sysone init` writes `sysone.config.json`, creates the app and an app token through the API, and adds `@sysone/client`.
2. The `sysone-integrate` skill finds decision points and records each with `sysone opportunities add` (MCP `add_opportunity`). Summaries only.
3. Build the set from the accepted opportunity: create, pull, edit, validate, push, eval, publish to staging (flow a, steps 1 to 5).
4. `sysone codegen triage --lang ts --app <appId>` (MCP `generate_client`) writes `sysone/generated/triage.ts` and `.sysone/lock.json` and records an app binding.
5. Wire the call site. App code branches on `effectiveAction` and `route`, and `fallback` keeps the existing path.
6. The developer or their agent commits with their own git credentials. CI runs `sysone check`.
7. `sysone promote triage`, approved by a person, then the production rollout as in flow a.

### (c) Improve a live set (Phase 3b)

1. `sysone health triage --json` (MCP `get_set_health`) shows `below_target` on one question.
2. `sysone tune triage --apply` (MCP `suggest_thresholds` with `apply`) writes the suggested thresholds to the draft and prints precision lower bound and coverage per candidate.
3. `sysone eval run triage --version draft --dataset gold --wait`.
4. `sysone publish triage --channel production`. The set is `full`, so this needs an approval (exit 3). Once approved, the new version runs as the challenger in an experiment; the pointer stays on the champion.
5. `sysone experiments get <id>` (MCP `get_experiment`) until the minimum runs and labels are in.
6. `sysone experiments promote <id>` (MCP `decide_experiment`). This needs an approval; a person approves and the pointer moves.

### (d) A new System One model (Phase 3b)

1. `sysone events tail --types model.available` (MCP `list_events`) shows the new model.
2. `sysone upgrade list` (MCP `get_report` with `model-upgrades`) lists sets pinned to older models in the family.
3. `sysone upgrade try triage --model <new versioned id> --wait` (MCP `try_model`). The job evals both models on the same snapshot, re-tunes thresholds and opens a `model_upgrade` proposal.
4. `sysone proposals list` (MCP `list_proposals`) to compare the metric deltas, then `sysone proposals accept <id>` (MCP `decide_proposal`), which creates a draft only.
5. Publish to production and promote through an experiment of kind `model`, with approvals, as in flow c.

## Events for agents

CLI and MCP agents have no public URL, so they read the cursor feed: `sysone events tail` and the MCP tool `list_events` both call `GET /api/v1/events?after=<cursor>`. The catalog and the webhook alternative are in [events.md](events.md).
