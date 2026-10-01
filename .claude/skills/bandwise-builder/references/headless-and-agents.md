# Headless use and agents

Owners: Integrations (`packages/cli`, `packages/mcp-server`, `plugins/claude-code`) with Docs. Platform / Tenancy owns the operations and routes behind them ([management-api.md](management-api.md)). Decision record: [ADR-007](../../../../docs/adr/007-headless-parity.md).

## What headless means

An agent can do everything a person can do in the console, under the same checks, through three surfaces:

- the HTTP API (`/api/v1`),
- the `bandwise` CLI (`@bandwise/cli`),
- the MCP server (`packages/mcp-server`).

All three call the same operations as the console ([management-api.md](management-api.md)), so scopes, roles, approvals, idempotency and audit behave the same everywhere. The API and the CLI reach every operation that a token may call. The MCP server exposes a curated subset.

Nick runs agents across three orgs: SGR, Personal and Dallas. Each org gets its own agent token and its own named profile. There are no cross-org tokens.

## Identities

| Who | Credential | Where it lives | Can do |
|---|---|---|---|
| Host app, server side | `sk_live_` or `sk_test_` app token | the host app's server env | Run sets, report feedback, ingest standalone runs. No management. |
| Host app, browser | `pk_live_` or a 5-minute browser JWT | the page | Run sets only, bound to origin and set list |
| Agents, the CLI, the MCP server, CI | agent token `sa_live_` | a profile, or `BANDWISE_TOKEN` in CI | Whatever its scopes allow, as one user in one org, with role = min(ceiling, membership role) |
| Chrome extension | agent token with client `extension`, from the device flow | `chrome.storage.session` | `run`, `sets:read`, `review:read`, `review:write` |
| People | console session | a cookie | Everything their role allows, including approval decisions |

Scopes, the role ceiling, spend caps and the approval gate are in [security.md](security.md). The auth modes are in [api.md](api.md).

### Profiles

`bandwise login --profile <name>` runs the device flow (RFC 8628): the CLI shows a code, the person approves it in a console session and picks the org, scopes and role ceiling, and the CLI stores the token.

Profiles live in `~/.config/bandwise/profiles.json`:

```json
{
  "default": "sgr",
  "profiles": [
    { "name": "sgr",      "org": "sgr",      "baseUrl": "https://console.example.com", "tokenRef": "keychain:bandwise/sgr" },
    { "name": "personal", "org": "personal", "baseUrl": "https://console.example.com", "tokenRef": "keychain:bandwise/personal" },
    { "name": "dallas",   "org": "dallas",   "baseUrl": "https://console.example.com", "tokenRef": "keychain:bandwise/dallas" }
  ]
}
```

- The secret is kept in the OS keychain when one is available. Otherwise `tokenRef` points into a `0600` credentials file next to `profiles.json`. The profile file itself never holds a secret.
- Which credentials a command uses: `--profile` wins; then `BANDWISE_TOKEN` with `BANDWISE_BASE_URL`; then `profile` in the repo's `bandwise.config.json`; then the default profile.
- CI sets `BANDWISE_TOKEN` and `BANDWISE_BASE_URL` from its secret store.

## @bandwise/cli

- Package `packages/cli`, binary `bandwise`, published to npm.
- A thin HTTP client over `/api/v1`. It never touches the database, never calls TypeSafe and never stores a TypeSafe key. `bandwise keys rotate` reads a new key from stdin and sends it once to `key.rotate`.
- Every command supports `--json`. It never prompts when stdin is not a TTY; a command that needs confirmation then fails with exit 1 and says to pass `--yes`. `--yes` skips confirmations.
- Exit codes: `0` ok, `1` error, `2` diff or drift found, `3` approval pending.
- Mutations send a generated `Idempotency-Key` and retry safely on network errors, `429` and retryable `503`s with the same key. `--idempotency-key <key>` reuses a key across process restarts, for example a CI rerun.
- Commands that need `If-Match` (`spec push`, `publish`, `tune --apply`, `proposals accept`) send the draft ETag recorded in `.bandwise/specs.json`, which `spec pull` and `spec push` update. Outside a specs-as-code repo they read it with `draft.get` first. `--if-match <etag>` overrides both.
- Errors print the envelope's `code`, `message` and each `details[]` item (`path`, `rule`, `message`), so an agent can fix and resubmit.
- Inside a repo with `bandwise.config.json`, flags default from it: `--app` from `app`, `--goal` from `goal`, and `--project` from `project`.
- Named commands cover the common operations. `bandwise api` reaches every other one ([Any operation](#any-operation-bandwise-api)).

### Identity and admin

| Command | Operation | Phase |
|---|---|---|
| `login [--profile <name>]`, `logout` | device flow; `agent_token.revoke` on itself | 3 |
| `profiles`, `profiles use <name>` | local | 3 |
| `status` | `actor.get` | 3 |
| `approvals get <id> [--wait]` | `approval.get` | 3 |
| `tokens list\|create\|revoke` | `agent_token.list`, `agent_token.create`, `agent_token.revoke` | 3 |
| `members list\|invite\|set-role\|remove` | `member.list`, `member.invite`, `member.role_change`, `member.remove` | 3 |
| `keys rotate` (new key on stdin), `keys revoke` | `key.rotate`, `key.revoke` | 3 |
| `settings get`, `settings set <key> <value>` | `settings.get`, `settings.update` | 3 |
| `apps list\|create\|update` | `app.list`, `app.create`, `app.update` | 3 |
| `apps tokens create\|revoke <appId>` | `app_token.create`, `app_token.revoke` | 3 |
| `audit list` | `audit.list` | 3 |

Key rotation and revocation, member invites, role changes and removals, and creating an `admin:write` token always wait for an approval when an agent token calls them, so these commands exit 3 until a person approves ([security.md](security.md)).

### Goals, sets and releases

| Command | Operation | Phase |
|---|---|---|
| `projects list`, `projects create <slug> [--name <text>]` | `project.list`, `project.create` | 3 |
| `goals list [--project <id>]` | `goal.list` | 3 |
| `goals create --title <t> --tier low\|standard\|high [--project <id>]` | `goal.create` | 3 |
| `templates list` | `template.list` | 3 |
| `sets list`, `sets create <slug> --goal <id> [--template <id>] [--name <text>]` | `set.list`, `set.create` | 3 |
| `sets update <slug> --input <file\|->`, `sets archive <slug>` | `set.update`, `set.archive` | 3 |
| `spec pull\|diff\|validate <slug>` | `draft.get`, `version.diff`, `draft.validate` | 3 |
| `spec push <slug> [--create [--goal <id>] [--name <text>]] [--source-ref <ref>]` | `draft.update`; with `--create` on a new slug, `set.create` and `draft.get` first | 3 |
| `publish <slug> --channel <c> [--changelog <text>] [--dry-run]` | `set.publish` | 3 |
| `rollback <slug> --channel <c> [--to <n>]` | `channel.rollback` | 3 |
| `promote <slug> [--dry-run]` | `channel.promote` | 3 |
| `rollout get\|set <slug> --channel <c> [--stage <s> --reason <text>]` | `rollout.get`, `rollout.change` | 3 |

- `goals create --tier` fills `qualityTarget` with that tier's defaults ([confidence-policy.md](confidence-policy.md#quality-targets)). `templates list` returns `{ id, name, pattern, parameters }` for each template, so an agent can find ids such as `email-urgency`.
- `sets update` sends the `set.update` fields as JSON: labeling, value settings, gate margins and the other per-set settings that never live in the spec. It is how an agent acts on an accepted `label_more` proposal.

### Datasets, evals and runs

| Command | Operation | Phase |
|---|---|---|
| `datasets list [--set <slug>]` | `dataset.list` | 3 |
| `datasets create <name> --set <slug>` | `dataset.create` | 3 |
| `datasets import <id> <file.jsonl>` | `dataset.import` | 3 |
| `datasets push <slug>` | `dataset.list`, `dataset.create`, `dataset.import` | 3 |
| `eval run <slug> --dataset <name> [--version <n>] [--model <id>] [--repeats <k>] [--wait]` | `eval.run` | 3 |
| `jobs get <id> [--wait]` | `job.get` | 3 |
| `run <slug> --state <file> [--channel <c>]` | `set.run` | 3 |
| `run --local spec.json state.json` | none: `packages/core` with the fixture transport | 3 |
| `run --live spec.json state.json [--provider] [--receipts[=<path>]]` | none: `packages/core` with the SDK transport and the developer's own key (ADR-020) | D1 |
| `report [--since 7d] [--set <slug>] [--receipts <path>]` | none: sums local receipts | D1 |
| `hook <Stop\|PreToolUse\|UserPromptSubmit> --set <spec.json> [--rollout]` | none: a Claude Code hook over `run --live` | D1 |
| `hooks install [--sets-dir] [--command] [--rollout]` | none: prints `.claude/settings.json` entries, writes nothing | D1 |
| `spec pull <set> [--out]`, `spec push <file> [--set] [--goal] [--if-match]`, `spec diff <file> [--version]` | `draft.get`; `set.create` (with `--goal`), `draft.update`, `draft.validate`; `draft.get` or `version.get` | D2 |
| `publish <set> [--channel]`, `rollback <set> [--channel] [--to]`, `rollout <set> <stage> [--channel] [--reason]` | `set.publish`, `channel.rollback`, `rollout.change` | D2 |
| `report --remote [--since] [--set]` | `usage.get` | D2 |
| `hook ...` with `BANDWISE_TOKEN` set | `set.run`: the hosted endpoint, with the server's rollout stage; no provider key | D2 |
| `models list` | `model.list` | 3 |

- `datasets import` sends JSONL, one `{ state, expected, tags? }` case per line. The server assigns each case's split; a file cannot set it.
- `eval run --dataset` takes the dataset name and resolves it to an id with `dataset.list` for that set.
- `datasets push <slug>` imports every `bandwise/datasets/<slug>/<name>.jsonl` into the set's dataset `<name>`, creating the dataset when it does not exist. It records, per file, how many lines it sent and their hash in `.bandwise/datasets.json`, and sends only lines added since the last push. If earlier lines changed, it stops with exit 1 and asks for a new dataset name, so a re-push never duplicates cases.
- `run --local` replaces the old `pnpm bandwise run spec.json state.json`. In this monorepo it is `pnpm bandwise run --local spec.json state.json`. It makes no network call and needs no key.
- `run --live`, `hook`, `report` and `hooks install` are the local live mode of ADR-020. The key comes only from `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` in the caller's environment, read in `packages/cli/src/live/key.ts`; only `packages/cli/src/live/transport.ts` loads the SDK transport. Receipts go to `~/.bandwise/receipts.jsonl` and hold decisions and cost, never state. A hook in `shadow` never prints anything, and any error or a 3 second timeout exits 0 with no output. See `docs/runbooks/dogfood.md`.
- The D2 forms (`spec push <file>`, `publish <set>` with `--channel` defaulting to `production`, `rollout <set> <stage>`) are the dogfood subset of the Phase 3 commands above. They read `BANDWISE_TOKEN` and `BANDWISE_BASE_URL` only in `packages/cli/src/remote/credentials.ts`, send the token only as a bearer header over https (http only to localhost), and pass all output through a scrub of the token. With `BANDWISE_TOKEN` set, `bandwise hook` loads `live/hook-remote.ts`, which imports neither core nor the SDK.

### Review, feedback, reports and events

| Command | Operation | Phase |
|---|---|---|
| `review list`, `review resolve <id>` | `review.list`, `review.resolve` | 3 |
| `feedback send <file.jsonl>` | `feedback.report` | 3 |
| `reports get <name> [--format csv\|pdf]` | `report.get` | 3 |
| `events tail [--types <a,b>]` | `event.list` | 3 |

### Effectiveness loop

| Command | Operation | Phase |
|---|---|---|
| `health [<slug>]` | `health.get`, `health.list` | 3b |
| `tune <slug> [--apply]` | `policy.suggest` | 3b |
| `improve <slug> [--wait]` | `set.improve` | 3b |
| `proposals list\|accept\|reject` | `proposal.list`, `proposal.accept`, `proposal.reject` | 3b |
| `experiments start\|get\|promote\|stop` | `experiment.*` | 3b |
| `upgrade list`, `upgrade try <slug> --model <id>` | `model.upgrades`, `set.try_model` | 3b |

### App integration

| Command | Operation | Phase |
|---|---|---|
| `init [--set <slug>]` | `app.create`, `app_token.create`; with `--set`, `set.codegen` | 4b |
| `opportunities add\|list` | `opportunity.create`, `opportunity.list` | 4b |
| `opportunities accept\|reject <oid> [--app <id>]` | `opportunity.update` | 4b |
| `codegen <slug> --lang ts\|py [--app <id>]` | `set.codegen` | 4b |
| `check` | `set.get`, local lock file | 4b |

`init`, `codegen`, `check` and the lock file are described in [deploy-and-codegen.md](deploy-and-codegen.md).

### Any operation: `bandwise api`

| Command | Operation | Phase |
|---|---|---|
| `api <operationId> [--input <file\|->] [--if-match <etag>] [--dry-run] [--idempotency-key <k>]` | any operation in `openapi.json` | 3 |
| `api --list` | none: reads `openapi.json` | 3 |

- The CLI reads `GET /api/v1/openapi.json`, finds the path for the `operationId`, splits the input object into path parameters, query and body, and calls the route. Scopes, approvals, idempotency and exit codes work as for a named command.
- `bandwise api --list` prints every `operationId` with its scope, minimum role and risk.
- `--dry-run` works only on operations that accept `?dryRun=true`.
- It refuses session-only operations (`x-bandwise-actors` is `["user"]`, such as `approval.decide` and `review.confirm`) and says a console session is required.
- Operations with no named command run through it, for example `version.list`, `version.get`, `release.list`, `review.assign`, `review.dismiss`, `eval.get`, `set.compare`, `dataset.snapshot`, `studio.*`, `binding.*`, `alert.list`, `price_book.*`, `plugin.*` and `org.delete`.
- Every operation has an OpenAPI path (the parity test checks this), so no operation that a token may call is out of the CLI's reach.

## Specs as code

A customer repo can keep its question sets next to the code that calls them:

```
bandwise.config.json                 { "org": "sgr", "project": "support", "app": "<appId>", "goal": "<goalId>", "baseUrl": "https://console.example.com", "profile": "sgr" }
bandwise/sets/<slug>.json            a QuestionSetSpec with no rollout field; the schema is strict
bandwise/datasets/<slug>/<name>.jsonl  drafting and calibration cases only
bandwise/generated/                  generated clients (deploy-and-codegen.md)
.bandwise/lock.json                  codegen lock (deploy-and-codegen.md)
.bandwise/specs.json                 the draft ETag each spec was pulled from, for If-Match
.bandwise/datasets.json              lines already pushed from each dataset file
```

`bandwise.config.json` keys:

- `org`, `project`, `baseUrl` and `profile` say where commands go.
- `app` is written by `bandwise init`. It is the default `--app`, so `bandwise codegen` records bindings without the flag.
- `goal` is optional. Add it to give `sets create` and `spec push --create` a default goal.

The test split stays on the server. Imported cases get their split from the server, and test-split cases never come back ([management-api.md](management-api.md), Holdout rules).

The flow:

```sh
bandwise spec pull triage                  # writes bandwise/sets/triage.json and records the draft ETag
# edit bandwise/sets/triage.json
bandwise spec validate triage              # strict schema locally, then server lints; fix each details[] item
bandwise spec push triage --source-ref "$GITHUB_SHA"   # If-Match; a conflict exits 1 and prints currentEtag
bandwise datasets push triage              # imports new lines from bandwise/datasets/triage/*.jsonl
bandwise eval run triage --dataset gold --wait
bandwise publish triage --channel staging
bandwise rollout set triage --channel staging --stage shadow --reason "staging check"
bandwise promote triage                    # exit 3 while an approval is pending
bandwise rollout set triage --channel production --stage shadow --reason "first shadow week"
```

- For a spec file whose set does not exist yet, run `bandwise spec push <slug> --create`. It calls `set.create` with the slug, `--name` (default: the slug) and the goal from `--goal` or from `goal` in `bandwise.config.json`, reads the new draft's ETag with `draft.get`, then calls `draft.update`. Without `--create`, pushing an unknown slug fails with `404 not_found`.
- On a `412`, run `bandwise spec diff triage`, merge, `bandwise spec pull` to take the new ETag, and push again.
- `bandwise spec diff <slug>` compares the local file, the draft and each channel. It says which side changed, using `question_set_versions.source` and `source_ref`: for example "production was published from the console after your last pull". It exits 2 when anything differs.
- The CLI records `--source-ref`, or `GITHUB_SHA` when set, as the version's `source_ref`.

This is how Bandwise follows TypeSafe's advice to keep questions and thresholds in one reviewable place. The spec file is that place. Bandwise serves it live, so publishing still needs no app redeploy.

Phase 5 adds a GitHub Action that comments `bandwise spec diff` on PRs and runs `bandwise check`.

## MCP server

- Package `packages/mcp-server`, owned by Integrations. stdio transport in Phase 3, HTTP transport in Phase 7.
- It authenticates with an agent token (`BANDWISE_TOKEN` or a profile). Never an `sk_` app token, never a TypeSafe key.
- Tools wrap registry operations. Input schemas are the operation zod schemas converted to JSON Schema. `readOnlyHint` and `destructiveHint` come from the registry's `readOnly` and `destructive`.
- A tool that hits the approval gate returns the pending approval and its URL. The agent should tell the person and poll `get_approval`.
- Member, key and token admin stay in the API and the CLI (`bandwise members`, `bandwise keys`, `bandwise tokens`, `bandwise apps tokens`). They are not MCP tools.
- An operation with no MCP tool is reachable through `bandwise api`.
- One server entry per profile, so an agent never mixes orgs:

```json
{ "mcpServers": {
  "bandwise-sgr":    { "command": "npx", "args": ["-y", "@bandwise/mcp-server", "--profile", "sgr"] },
  "bandwise-dallas": { "command": "npx", "args": ["-y", "@bandwise/mcp-server", "--profile", "dallas"] }
} }
```

Curated tools:

| Tool | Operation | Phase |
|---|---|---|
| `list_projects` | `project.list` | 3 |
| `list_goals` | `goal.list` | 3 |
| `create_goal` | `goal.create` | 3 |
| `list_templates` | `template.list` | 3 |
| `list_sets` | `set.list` | 3 |
| `get_set` | `set.get` | 3 |
| `create_set` | `set.create` | 3 |
| `get_draft` | `draft.get` | 3 |
| `update_draft` | `draft.update` | 3 |
| `validate_draft` | `draft.validate` | 3 |
| `diff_versions` | `version.diff` | 3 |
| `list_datasets` | `dataset.list` | 3 |
| `create_dataset` | `dataset.create` | 3 |
| `import_dataset_cases` | `dataset.import` | 3 |
| `run_set` | `set.run` | 3 |
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
| `improve_set` | `set.improve` | 3b |
| `update_set` | `set.update` | 3b |
| `list_proposals` | `proposal.list` | 3b |
| `decide_proposal` | `proposal.accept` or `proposal.reject`, by `decision` | 3b |
| `try_model` | `set.try_model` | 3b |
| `start_experiment` | `experiment.start` | 3b |
| `get_experiment` | `experiment.get` | 3b |
| `decide_experiment` | `experiment.promote` or `experiment.stop`, by `decision` | 3b |
| `create_app` | `app.create` | 4b |
| `add_opportunity` | `opportunity.create` | 4b |
| `update_opportunity` | `opportunity.update` | 4b |
| `generate_client` | `set.codegen` | 4b |

`run_set` and `bandwise run` map to `set.run`, which is registered like any other operation, so the parity test covers them.

## Customer Claude Code skills (Phase 7)

These ship in `plugins/claude-code/skills` with the MCP server config. The `bandwise-builder` skill is internal and never ships.

- **`bandwise-operator`**: manages sets. It moves a set from `inactive` to `shadow` to `controlled` to `full`, reads review disagreements and set health, and knows when an approval is needed and what to tell the person. It tells app code to branch only on `effectiveAction` and `route`. For question wording it defers to the official `typesafe` skill.
- **`bandwise-integrate`**: works in a customer repo. It loads the official `typesafe` skill and uses its "find opportunities" and "applicable cookbooks" prompts, posts opportunity summaries (never source code) with `apps:write`, builds the set, then runs `bandwise codegen` and `bandwise check`.

## End-to-end agent flows

### (a) Manage: from template to production with approval (Phase 3)

1. Find the goal and the template. `bandwise goals list` (MCP `list_goals`) shows goals with their quality targets. If none fits, `bandwise goals create --title "Triage support email" --tier standard` (MCP `create_goal`; `bandwise projects list` or MCP `list_projects` gives the project id). `bandwise templates list` (MCP `list_templates`) shows template ids such as `email-urgency`.
2. `bandwise sets create triage --goal <goalId> --template email-urgency` (MCP `create_set`).
3. Load the gold dataset: `bandwise datasets create gold --set triage`, then `bandwise datasets import <datasetId> gold.jsonl` (MCP `create_dataset`, then `import_dataset_cases`). In a specs-as-code repo, `bandwise datasets push triage` does both. The server assigns each case's split.
4. `bandwise spec pull triage`, edit, `bandwise spec validate triage` (MCP `get_draft`, `validate_draft`). Fix each `details[]` item by its JSON Pointer and rule id.
5. `bandwise spec push triage` (MCP `update_draft`, with the ETag from `get_draft`).
6. `bandwise eval run triage --dataset gold --wait` (MCP `start_eval`, then `get_job`).
7. `bandwise publish triage --channel staging` (MCP `publish`).
8. `bandwise promote triage` (MCP `promote`). For a live or protected set this returns an approval: exit 3. `bandwise approvals get <id> --wait` (MCP `get_approval`) until a person approves in the console.
9. `bandwise rollout set triage --channel production --stage shadow --reason "..."` (MCP `change_rollout`).
10. Later, `bandwise rollout get triage --channel production` (MCP `get_rollout_gates`) until the gates are met, then set `controlled`. That move needs an approval, and `full` also needs an admin ceiling.
11. If anything looks wrong, `bandwise rollback triage --channel production` or set the stage to `paused`. Moves toward safety never wait.

### (b) Set up an app (Phase 4b)

1. In the app repo, `bandwise init` creates the app and an app token through the API, writes `bandwise.config.json` with `"app": "<appId>"`, and adds `@bandwise/client`. An MCP-only agent can create the app with `create_app`, but app tokens come from the CLI or the console.
2. The `bandwise-integrate` skill finds decision points and records each with `bandwise opportunities add` (MCP `add_opportunity`). Summaries only.
3. Accept one with `bandwise opportunities accept <oid>` (MCP `update_opportunity`). Then build the set from it: goal, create, dataset, pull, edit, validate, push, eval and publish to staging (flow a, steps 1 to 7). Once the set exists, link it with `opportunity.update` (`setId`, `status: "built"`) through MCP `update_opportunity` or `bandwise api opportunity.update`.
4. `bandwise codegen triage --lang ts` (MCP `generate_client`) writes `bandwise/generated/triage.ts` and `.bandwise/lock.json` and records an app binding for the app in `bandwise.config.json`.
5. Wire the call site. App code branches on `effectiveAction` and `route`, and `fallback` keeps the existing path.
6. The developer or their agent commits with their own git credentials. CI runs `bandwise check`.
7. `bandwise promote triage`, approved by a person, then the production rollout as in flow a.

### (c) Improve a live set (Phase 3b)

1. `bandwise health triage --json` (MCP `get_set_health`) shows `below_target` on one question.
2. `bandwise tune triage --apply` (MCP `suggest_thresholds` with `apply`) writes the suggested thresholds to the draft and prints precision lower bound and coverage per candidate.
3. `bandwise eval run triage --version draft --dataset gold --wait`.
4. `bandwise publish triage --channel production`. The set is `full`, so this needs an approval (exit 3). Once approved, the new version runs as the challenger in an experiment; the pointer stays on the champion.
5. `bandwise experiments get <id>` (MCP `get_experiment`) until the minimum runs and labels are in.
6. `bandwise experiments promote <id>` (MCP `decide_experiment`). This needs an approval; a person approves and the pointer moves.

- When the wording is the problem, not the thresholds, use `bandwise improve triage --wait` (MCP `improve_set`) instead of step 2. It opens a proposal with a draft diff and metric deltas. `bandwise proposals accept <id>` (MCP `decide_proposal`) writes the draft; continue from step 3.
- When health reports `insufficient_data` or `no_truth_source`, accepting the `label_more` proposal returns a `set.update` call. Run it with `bandwise sets update triage --input <file>` (MCP `update_set`).

### (d) A new System One model (Phase 3b)

1. `bandwise events tail --types model.available` (MCP `list_events`) shows the new model.
2. `bandwise upgrade list` (MCP `get_report` with `model-upgrades`) lists sets pinned to older models in the family.
3. `bandwise upgrade try triage --model <new versioned id> --wait` (MCP `try_model`). The job evals both models on the same snapshot, re-tunes thresholds and opens a `model_upgrade` proposal.
4. `bandwise proposals list` (MCP `list_proposals`) to compare the metric deltas, then `bandwise proposals accept <id>` (MCP `decide_proposal`), which creates a draft only.
5. Publish to production and promote through an experiment of kind `model`, with approvals, as in flow c.

## Events for agents

CLI and MCP agents have no public URL, so they read the cursor feed: `bandwise events tail` and the MCP tool `list_events` both call `GET /api/v1/events?after=<cursor>`. The catalog and the webhook alternative are in [events.md](events.md).
