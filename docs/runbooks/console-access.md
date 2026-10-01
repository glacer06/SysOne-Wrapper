# Console access (D3)

The console at app.bandwise.dev signs in members of the `internal` org only (ADR-020). Sign-up is closed. A platform operator adds each person, and each person sets their own password and two-factor.

## What the deployment needs

- `DATABASE_URL` with migration 0006 applied (`pnpm db:migrate`).
- `AUTH_SECRET`, at least 32 characters. It signs session cookies and encrypts TOTP secrets and backup codes. Changing it signs everyone out and breaks every two-factor setup, so rotate it only with a plan to re-enroll.
- `BETTER_AUTH_URL`, the console origin: `https://app.bandwise.dev` in production. Cookies are `Secure` and `__Secure-` prefixed when it starts with `https://`. Unset, the early-access page still serves and sign-in is off.
- Optional: `BANDWISE_CONSOLE_EMAILS`, a comma-separated allowlist checked on top of the membership.

## Add a person

From a trusted shell with `DATABASE_URL`, `AUTH_SECRET` and `BETTER_AUTH_URL` set to the production values:

```
pnpm --filter @bandwise/console console-member --org <internal org uuid> --email pj@example.com --name PJ --role editor
```

It creates the user row and the membership (each once, with a `member.add` audit row), then writes a one-time reset link to `console-reset-link.txt` with mode 0600. Nothing secret prints. Send the link to the person over a private channel and delete the file. The link lasts 24 hours and works once; run the script again for a new one.

## First sign-in

1. Open the link, set a password (12 to 128 characters).
2. Sign in with email and password.
3. The console asks for two-factor before any page: confirm the password, scan the QR code, save the backup codes, enter a code.

Every later sign-in asks for a code from the authenticator app or a backup code.

## What protects it

- Sign-up, social sign-in and the library's HTTP endpoints are off. Pages call the library through Server Actions, which Next checks for the request Origin.
- A session is created only for a member of the `internal` org (and on the allowlist when set). Membership is read again on every page, so removing a member takes effect at once.
- Sign-in allows 5 attempts per email and 20 per IP in 15 minutes; codes 10 per IP in 5 minutes. The account locks for 15 minutes after 10 wrong codes. Every failure shows the same message.
- Cookies are `HttpOnly`, `Secure` on https and `SameSite=Lax`. Sessions last 7 days. Reset tokens and two-factor challenge ids are stored hashed.

## Lost phone

Sign in with a backup code. If those are gone too, a platform operator deletes the person's `two_factors` row and sets `users.two_factor_enabled` to false, then sends a new reset link; the person sets up two-factor again.
