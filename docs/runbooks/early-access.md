# Runbook: early access on app.bandwise.dev

The form on `www.bandwise.dev` posts to `POST https://app.bandwise.dev/api/public/early-access` (ADR-018). That route lives in `apps/console`, the only app with database credentials. Before Phase 2, the console serves just that route and one page that sends visitors back to the form.

## Go live (one time)

1. **Migrate.** Merge the PR, then run the Database migrate workflow on `production` ([database.md](database.md)). It applies `0005_early_access_signups`. Production already has 0001 to 0004, so the log should say `applied 1 migration(s)`.
2. **App login role.** If `bandwise_console` does not exist yet, create it as described in [database.md](database.md), "The app login role". It must be a member of `bandwise_app` only, never `bandwise_platform`, and must not have BYPASSRLS.
3. **Vercel project.** In the Vercel team that holds `bandwise-docs` and `bandwise-web`, add a project from `glacer06/SysOne-Wrapper`:
   - Name `bandwise-console`, root directory `apps/console`, framework Next.js. Node 22 comes from `engines` in `apps/console/package.json`.
   - Environment variables, **Production only**:
     - `DATABASE_URL`: the Supavisor **transaction** pooler string (port 6543) with user `bandwise_console.<project-ref>` and the password from the team vault. Paste it into Vercel only.
     - `AUTH_SECRET`: at least 32 random characters, for example the output of `openssl rand -base64 48`, generated on your machine and pasted into Vercel. It keys the IP hash; changing it later only resets the rate-limit window.
     - Leave `BANDWISE_KEK`, `BANDWISE_JWT_SIGNING_KEY` and every API key unset. Nothing in this deploy uses them.
   - **Preview**: set no database or secret variables. Previews have no database, so a preview form submit returns 500. That is on purpose: previews never touch production data (ADR-018). `SKIP_ENV_VALIDATION=1` is no longer needed but does no harm.
   - The build never needs these variables. The console reads them on the first signup, so a missing one fails that request, not the deploy.
4. **Domain.** Add `app.bandwise.dev` to the project. At GoDaddy, add the CNAME record Vercel shows for `app` (it is usually `cname.vercel-dns.com`). Wait for Vercel to show the domain as valid.

## Check it

Run these from any machine. None of them store anything except the last one.

```bash
# The page: sends visitors to the form on www. Expect 200.
curl -s -o /dev/null -w "%{http_code}\n" https://app.bandwise.dev/

# Preflight from www. Expect 204 and access-control-allow-origin: https://www.bandwise.dev
curl -s -i -X OPTIONS https://app.bandwise.dev/api/public/early-access \
  -H "origin: https://www.bandwise.dev" -H "access-control-request-method: POST" | head -12

# Another origin is refused. Expect 403.
curl -s -o /dev/null -w "%{http_code}\n" https://app.bandwise.dev/api/public/early-access \
  -H "origin: https://example.com" -H "content-type: application/json" -d '{"email":"x@example.com"}'
```

Then submit the real form on `www.bandwise.dev` with your own address and confirm the row (next section). Delete it afterwards if you like.

## Read the list

Until the platform console exists (Phase 2), read signups in the Supabase SQL editor, which runs as `postgres`:

```sql
select email, name, company, role, use_case, source_page, created_at
from early_access_signups
order by created_at desc;
```

Do not export the list to a spreadsheet that leaves the team's accounts. It is personal data covered by `www.bandwise.dev/privacy`.

## Remove someone (privacy request)

When someone asks to be removed, through `privacy@bandwise.dev` or any other way, delete the row the same day:

```sql
delete from early_access_signups where lower(email) = lower('person@example.com') returning id;
```

One row back means done. Zero rows means that address was never on the list; tell them so. Once Phase 2 ships, `platform_early_access.remove` does the same through the API, with an audit row.

## Limits and what they mean

- A person gets a 202 whether their address is new or already on the list. The API never says which.
- 5 new signups per IP hash per hour, and 300 in total per hour. Past that, the form shows a "try again later" message. Raising a limit is a new migration that replaces `bandwise_early_access_submit`.
- Honeypot or too-fast submits get a 202 and store nothing.
- If spam gets through anyway, add Cloudflare Turnstile or Vercel BotID in front of the route. That is a small change in `apps/console/src/server/early-access.ts` plus a widget in the form.

## If it breaks

- **500 on every submit:** check the Vercel function log for `early-access <requestId>: <message>`. `Invalid environment variables` means `DATABASE_URL` or `AUTH_SECRET` is missing or wrong in Production; set it and redeploy. Other usual causes are a wrong `DATABASE_URL` (port 5432 instead of 6543, or the user without `.<project-ref>`) and migration 0005 not applied.
- **CORS error in the browser:** the form must be served from exactly `https://www.bandwise.dev`. The apex `bandwise.dev` redirects there, so that is fine; a preview URL of the web project is not allowed.
- **`permission denied for function bandwise_early_access_submit`:** the login role is not a member of `bandwise_app`. Fix the role; do not grant the function to anyone else.
