# Runbook: turn on hosted dogfood (D2e)

Phase D of ADR-020. This is the ordered checklist that takes the `internal` org live on app.bandwise.dev, so the Claude Code hooks on this repo call `POST /api/v1/sets/{slug}/run` with a Bandwise token instead of TypeSafe with Nick's own key. Every set starts in `shadow`, so nothing a hook does changes while this rolls out.

Each step says who does it:

- **Nick**: Nick only. Every step that touches a secret value is Nick's.
- **PJ**: PJ's Security check. Do not go past a PJ step until PJ has signed it off.

No secret value goes into this file, a ticket, chat, a commit or a shell history. Secrets go from the team vault into Vercel, the Keychain, or a `read -s` prompt.

## 0. Before you start

- [ ] **PJ.** Security review signed off and merged on `main`: D2a (merged, PR #20), D2b run endpoint (PR #21), D2c management operations, D2d CLI remote mode, and this D2e bootstrap script.
- [ ] **PJ.** Decide the hook token (section 6). This runbook gives the hooks a run-only `sk_live_` app token, because the Claude Code session can read every variable the hooks see. `security.md` says the CLI uses agent tokens only. If PJ keeps that rule for hooks, mint a second agent token instead with only `run`, role ceiling `viewer` and the same set allowlist, and use it wherever this runbook says app token.
- [ ] **Nick.** The `bandwise-console` Vercel project and the `bandwise_console` login role exist from the early-access go-live ([early-access.md](early-access.md)). If not, do that runbook first.
- [ ] **Nick.** `jq` installed (`brew install jq`) for the checks below.

## 1. Apply the migrations

Migrations run from the Database migrate workflow, never from a laptop ([database.md](database.md)). `pnpm db:migrate` is the same migrator; the workflow runs it with `DATABASE_URL` set to the `DATABASE_URL_MIGRATE` secret of the GitHub environment, which is the direct connection as `postgres`.

1. **Nick.** Actions, Database migrate, Run workflow, `preview` first: `gh workflow run db-migrate.yml -f environment=preview`. The log line is `applied N migration(s), seeded M platform row(s)`.
2. **Nick** starts the same workflow on `production`; **PJ** approves the run as the required reviewer, so no one moves production alone.
3. **Nick.** Verify in the Supabase SQL editor (it runs as `postgres`):

   ```sql
   -- One row per file in packages/db/migrations on main (5 on 2026-10-01).
   select count(*) from bandwise_migrations;
   -- The model registry seed is there: expect jev-1.13.0 among the rows.
   select id, kind, status from system_one_models order by id;
   -- The app login role: no BYPASSRLS, a member of bandwise_app, not of bandwise_platform.
   select rolbypassrls,
          pg_has_role('bandwise_console', 'bandwise_app', 'member') as app,
          pg_has_role('bandwise_console', 'bandwise_platform', 'member') as platform
   from pg_roles where rolname = 'bandwise_console';
   ```

   Expect `false`, `true`, `false` on the last query.
4. **Nick.** Re-run the Supabase advisors (database.md, "After a production run"). Anything new is a finding for PJ.

## 2. Vercel env for `apps/console`

**Nick** sets these on the `bandwise-console` project, **Production only**. Preview gets none of them: previews never touch production data or keys (ADR-018).

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supavisor **transaction** pooler (port 6543), user `bandwise_console.<project-ref>`, password from the vault | Already set for early access. Never the `postgres` user. |
| `AUTH_SECRET` | 32 or more random characters | Already set for early access. |
| `BANDWISE_TOKEN_PEPPER` | New: `openssl rand -base64 48` on your machine | Store it in the team vault in the same minute; the mint script needs the same value (section 4). Changing it later invalidates every token. |
| `TYPESAFE_API_KEY` | A TypeSafe key for the platform, from the vault | Use a key made for the hosted server, not your personal shell key, so either can be revoked alone and spend shows apart. |
| `SYSTEM_ONE_TRANSPORT` | `sdk` | Without it the server answers from synthetic fixtures. |
| `BETTER_AUTH_URL` | TODO(D3): `https://app.bandwise.dev`, if the D3 sign-in reads it | Confirm the name with the D3 auth PR before setting it. |
| `BETTER_AUTH_SECRET` | TODO(D3): only if D3 does not reuse `AUTH_SECRET` | Confirm with the D3 auth PR. Generate like `AUTH_SECRET`. |

Leave `BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `STRIPE_*` and `ANTHROPIC_API_KEY` unset. Nothing in D2 uses them.

Then redeploy production (Deployments, the latest production deployment, Redeploy), because env changes apply at the next deploy.

**Check (Nick).** A run with no token must get 401. A 503 means a variable is missing or wrong: the function log shows `run <requestId>: Error` and nothing else, on purpose.

```sh
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.bandwise.dev/api/v1/sets/done-check/run
```

**PJ.** Check in Vercel that Preview has none of the variables above, and that only Nick and PJ can read Production env.

## 3. Bootstrap the `internal` org

**Nick.** In this repo on `main`, in a fresh terminal. The script reads `DATABASE_URL` from the shell. Use the same `bandwise_console` pooler string as Vercel, so the bootstrap runs under RLS like the app.

```sh
read -s "DATABASE_URL?DATABASE_URL (bandwise_console pooler): " && export DATABASE_URL
pnpm -s --filter @bandwise/console bootstrap-internal --owner <nick's email> --member <pj's email>:admin
```

It creates, in one transaction, only what is missing:

- the org `internal` in platform key mode, on plan `internal`;
- Nick as owner and PJ as admin (an existing user row with the same email is reused, so a D3 sign-in made first is fine);
- project `dogfood`, its goal, and the app `Claude Code hooks` that the hook token belongs to;
- one set per `.bandwise/sets/*.json`, slug = file name, published as version 1 on `production` at `shadow`, with an open draft version 2;
- an audit row for every step, with `source: bootstrap-internal` in the diff.

It prints ids and slugs only:

```
org <uuid> internal created
member <uuid> owner created
member <uuid> admin created
project <uuid>
goal <uuid>
app <uuid>
set <uuid> action-risk-gate created
...
set_ids <uuid>,<uuid>,<uuid>,<uuid>
```

Keep that output in this terminal for section 4. Running it again prints the same ids with `exists` and writes nothing. A set whose file changed since prints `differs` and is left alone: change a live set with `bandwise spec push` and `bandwise publish`, never by re-running the bootstrap.

**PJ.** Read the audit rows (SQL editor):

```sql
select action, target_type, target_id, diff, created_at
from audit_log
where org_id = (select id from organizations where slug = 'internal')
order by created_at;
```

Expect `org.create`, two `member.add`, `project.create`, `goal.create`, `app.create`, and one `set.create` and one `set.publish` per set.

## 4. Mint the tokens

**Nick**, same terminal (it already has `DATABASE_URL`). Load the pepper from the vault without echoing it:

```sh
read -s "BANDWISE_TOKEN_PEPPER?Token pepper: " && export BANDWISE_TOKEN_PEPPER
```

Each command prints the token once, on stdout, and its row id on stderr. Send the token to the clipboard, paste it into the Keychain prompt (it asks twice), then clear the clipboard. That way it never shows on screen and never sits in a process argument. `-U` replaces an older item with the same name.

**Hook token** (an `sk_live_` app token: run only, the four dogfood sets, production channel):

```sh
pnpm -s --filter @bandwise/console mint-token app \
  --org <org uuid> --app <app uuid> --scopes run --sets <set_ids line> --days 90 | tr -d '\n' | pbcopy
security add-generic-password -U -a "$USER" -s BANDWISE_TOKEN -w
pbcopy < /dev/null
```

**CLI token for Nick** (an `sa_live_` agent token, 90 days at most):

```sh
pnpm -s --filter @bandwise/console mint-token agent \
  --org <org uuid> --user <owner uuid> --name nick-cli --role editor \
  --scopes run,sets:read,sets:write,release:production,runs:read,usage:read | tr -d '\n' | pbcopy
security add-generic-password -U -a "$USER" -s BANDWISE_AGENT_TOKEN -w
pbcopy < /dev/null
```

For PJ, run the agent command with PJ's member uuid and `--name pj-cli`, paste the token into a vault item only PJ can read instead of the Keychain, and let PJ load it into his own Keychain. Note the token row ids from stderr; section 8 needs them to revoke. Then clear this terminal's secrets and close it:

```sh
unset DATABASE_URL BANDWISE_TOKEN_PEPPER
```

**PJ.** Check the token rows match what was asked, and that no token value is stored anywhere:

```sql
select action, diff from audit_log
where org_id = (select id from organizations where slug = 'internal')
  and action in ('app_token.create', 'agent_token.create')
order by created_at;
```

The app token should show `scopes: ["run"]`, the four set ids and `channel: production`; each agent token its six scopes and `roleCeiling: editor`.

## 5. Shell and hook env

**Nick.** The hooks inherit the environment of the shell that starts Claude Code, so that shell gets only the run-only hook token. Add to `~/.zshrc`:

```sh
export BANDWISE_TOKEN="$(security find-generic-password -a "$USER" -s BANDWISE_TOKEN -w 2>/dev/null)"
# Management commands use the agent token for one command at a time; it never sits in the session env.
bwa() { BANDWISE_TOKEN="$(security find-generic-password -a "$USER" -s BANDWISE_AGENT_TOKEN -w 2>/dev/null)" pnpm -s bandwise "$@"; }
```

Keep `TYPESAFE_API_KEY` in `~/.zshrc` for now: it is the fallback in section 8. `BANDWISE_BASE_URL` stays unset; it defaults to `https://app.bandwise.dev`. Nothing in `.claude/settings.json` changes: with `BANDWISE_TOKEN` set, `bandwise hook` calls the hosted endpoint ([dogfood.md](dogfood.md), section 4).

Open a new terminal so the change loads.

## 6. Verify

**Nick**, in the new terminal.

One run with the hook token. The token goes to curl on stdin, so it is not in the process list or the history:

```sh
printf 'header = "authorization: Bearer %s"\n' "$BANDWISE_TOKEN" | curl -sS --config - \
  -X POST https://app.bandwise.dev/api/v1/sets/done-check/run \
  -H 'content-type: application/json' \
  --data "{\"state\": $(cat .bandwise/states/done-check/example-2-claims-success-without-a-check.json)}" \
  | jq '{status, version, rollout, modelResolved, runBand, overallAction}'
```

Expect `status: "ok"`, `version: 1`, `rollout: "shadow"` and `modelResolved: "jev-1.13.0"`. A `401` means the token or the pepper does not match; a `404` means the org is not `internal` or the set is not in the token's allowlist; a `503` is the env (section 2).

Then the server's side, with the agent token:

```sh
bwa report --remote --since 1h
```

`done-check` should show one run. Then start a new Claude Code session in this repo, send one prompt, and run `pnpm bandwise report --since 1h` (local receipts, now marked `provider: bandwise`) and `bwa report --remote --since 1h` (server runs). Both should show `model-tier`.

## 7. One live publish and rollback

**Nick.** This proves a change reaches the next hook call with no redeploy, and that rollback restores it. It uses a harmless change on the server draft only; the repo file stays as it is.

```sh
jq '.input.schema.description = "D2e live publish check"' .bandwise/sets/done-check.json > /tmp/done-check-d2e.json
bwa spec push /tmp/done-check-d2e.json --set done-check
bwa publish done-check --changelog "D2e live publish check"
# Run the curl from section 6 again: expect version 2.
bwa rollback done-check
# The curl again: expect version 1.
bwa spec push .bandwise/sets/done-check.json --set done-check
bwa spec diff .bandwise/sets/done-check.json
```

The last command exits 0 when the server draft matches the file again. Publishing at `shadow` needs no approval. Moving a set to `controlled` does, and the approval is decided by a signed-in person, so that waits for the D3 console sign-in.

## 8. Rollback plan

Every step above can be undone without touching data:

- **Hooks back to local live mode (Nick, seconds).** Remove the `BANDWISE_TOKEN` export from `~/.zshrc`, `unset BANDWISE_TOKEN`, start a new session. The hooks call TypeSafe with `TYPESAFE_API_KEY` again, exactly as before D2e.
- **A bad version (Nick or PJ).** `bwa rollback <set>` points production back at the previous version. Rollback is a move toward safety and is never gated.
- **A set misbehaving.** `bwa rollout <set> paused --reason "..."`. Paused never acts and is never gated.
- **A leaked token (Nick or PJ, at once).** Until the console can revoke tokens (D3), revoke it in the SQL editor with its audit row, then mint a new one (section 4). The token id is the mint's stderr line or the `target_id` of its `app_token.create` audit row. The server refuses a revoked token within a minute.

  ```sql
  begin;
  update app_tokens set revoked_at = now() where id = '<token id>';  -- agent_tokens for an sa_live_ token
  insert into audit_log (org_id, actor_type, client, actor_user_id, action, target_type, target_id)
  values ((select id from organizations where slug = 'internal'), 'user', 'console', '<your user uuid>',
          'app_token.revoke', 'app_token', '<token id>');                -- agent_token.revoke, agent_token
  commit;
  ```
- **The pepper leaked.** Generate a new one, set it in Vercel and the vault, redeploy, and mint every token again. Every old token stops working.
- **Turn hosted runs off entirely.** Remove `BANDWISE_TOKEN_PEPPER` from Vercel Production and redeploy: every run answers 503 and nothing reaches TypeSafe. Keep the pepper in the vault; putting it back restores every token. Hooks fail open, so sessions keep working. Do not turn it off by removing `SYSTEM_ONE_TRANSPORT`: the server would then answer from synthetic fixtures.

When this runbook is done, tick the D2e items in `.claude/skills/bandwise-builder/references/phases/phase-d.md` and note the date in [dogfood.md](dogfood.md).
