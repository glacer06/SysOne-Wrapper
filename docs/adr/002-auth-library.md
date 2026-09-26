# ADR-002: Auth library

- **Status:** proposed
- **Date:** 2026-09-26
- **Owner:** Architect / Lead
- **Decider:** Nick. Until he decides, Auth.js v5 stays the approved default from ADR-001.
- **Contract impact:** none. `TenantContext`, `Role` and the operation catalog do not change. The choice decides which tables back `users`, `sessions`, `accounts` and `verification_tokens`, and how `organizations`, `memberships` and `invitations` are written.

## Context

ADR-001 names Auth.js v5 and leaves the library open ([ADR-001, open question](001-stack.md#open-question-for-adr-002)). Phase 2 (P2-01) cannot start until this is decided. The library must give us:

- many orgs per user, one active org per request, and `/[orgSlug]` routing
- invites as 7-day token links
- five roles: owner, admin, editor, reviewer, viewer
- a platform superadmin with MFA, and time-boxed, audited impersonation that fills `TenantContext.actor.impersonatorId` and `audit_log.impersonator_id`
- users, sessions and org tables in our Postgres, because RLS, foreign keys and the cross-tenant suite depend on them
- SSO later, since `plans.ts` lists SSO as a plan feature (ADR-006)

These stay fixed whatever we pick. `can()` in `packages/core/src/authz.ts` is the only authorization check. Invites, role changes and removals are operations (`member.invite`, `member.role_change`, `member.remove`), so they write audit rows and pass the approval gate. Agent tokens and the device flow are ours ([ADR-007](007-headless-parity.md)). The library signs people in and stores sessions. It never decides permissions.

Facts checked on 2026-09-26:

- `next-auth` v5 is published only as a beta (`5.0.0-beta.32`, July 2026). The npm `latest` tag is 4.24.15. v5 has been in beta since October 2023.
- On 2025-09-22 the Better Auth team took over maintenance of Auth.js. The announcement says Auth.js keeps getting security patches and urgent fixes, and recommends Better Auth for new projects.
- Better Auth `latest` is 1.7.6 (1.0 shipped in November 2024). Its organization plugin has custom roles, `invitationExpiresIn`, `activeOrganizationId` on the session, schema renaming (`modelName`, `fields`, `additionalFields`) and hooks around invites, role updates and removals. Its admin plugin has impersonation with a configurable session length (default 1 hour). The `disabledPaths` option turns off any built-in endpoint.

## Decision

**Recommendation: Better Auth**, with the organization, admin and two-factor plugins. Reasons:

1. It ships org membership, active org, invites, impersonation and TOTP MFA. On Auth.js we would write each of these ourselves and the Security reviewer would review each one.
2. It is the actively developed line from the people who now maintain Auth.js. Auth.js is in maintenance, and v5 never left beta.
3. All data stays in our Postgres through the Drizzle adapter. Clerk cannot offer that.
4. An SSO plugin (`@better-auth/sso`, OIDC and SAML) is there when a plan needs it.

**Until Nick decides, Auth.js v5 remains the approved default.** Phase 2 prep can go ahead on either, because of the rules below.

Rules under either library:

- **One wrapper.** Only `packages/tenancy` imports the auth library. It exports `resolveSession(request) -> TenantContext | null`. Everything else sees `TenantContext` only, so a switch touches tenancy and the auth route and nothing else.
- **Operations own every change.** The library's built-in endpoints that create orgs or change members, invitations or roles are disabled (`disabledPaths` in Better Auth). Those changes go through operations that call the library's server API, so audit rows and approvals always apply.
- **Our table names.** Plugin tables map onto `organizations`, `memberships` and `invitations` through the schema options. Our extra columns (`invited_by_token_id`, `key_mode`, `settings` and the rest) are additional fields. Every table keeps its RLS policy.
- **Roles are plain strings.** `memberships.role` holds the five role names. The plugin's own permission checks are not used.
- **Org comes from the URL.** The `orgSlug` in the path picks the org for each request, and `resolveSession` checks the membership every time. The session's active org only decides where a user lands after sign-in.
- **Pre-org lookups.** Reading a user's memberships, or an invite by token, happens before `app.org_id` is set. `memberships` and `invitations` get a second RLS policy on a transaction-local `app.user_id`, set by `resolveSession`. This applies to any library.
- **Invites.** Links carry our own random token, stored as `invitations.token_hash`, valid 7 days (`invitationExpiresIn` set to match).
- **Impersonation.** Only a superadmin with MFA can start it, from the platform route. The impersonator is copied into `TenantContext.actor.impersonatorId`, start and stop write audit rows, and the session ends after 1 hour.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Auth.js v5 + our own org tables (approved default) | Nick approved it. Small, familiar surface. Full control of the org model. Drizzle adapter. | v5 is still beta and the project is in maintenance. We build org switching, invites, impersonation, MFA and SSO ourselves, and each needs its own security review. |
| Better Auth with organization, admin and two-factor plugins (recommended) | Orgs, invites, active org, roles, impersonation and MFA built in. Drizzle adapter, data in our DB. Hooks and `disabledPaths` let operations own every change. In active development. | Younger library. Plugin APIs shift between minors, so we pin the minor and review every generated migration. Its tables have to be mapped onto our names and RLS. |
| Clerk Organizations | Fastest to ship. Orgs, invites, roles, impersonation, MFA and SSO are hosted. | Users and orgs live in Clerk. We would mirror them into `memberships` by webhook for RLS and foreign keys, and the mirror can lag behind a removal. Pricing grows with active users. Vendor lock-in and a new subprocessor in the DPA. |

## Consequences

- **Better Auth:** P2-01 becomes plugin configuration, the tenancy wrapper, the operation handlers and the table mapping. The Security reviewer reviews the plugin config, `disabledPaths` and the `app.user_id` policy instead of hand-written flows.
- **Auth.js:** P2-01 also carries invites, active org, impersonation and TOTP MFA as our code, each with tests. SSO becomes its own project later.
- **Either way:**
  - The cross-tenant suite covers `memberships` and `invitations` under both RLS policies.
  - A test proves each disabled library endpoint returns 404.
  - The Phase 2 Playwright gates (three-org switch, one test per role) run against the chosen library.
- **Docs to update once decided:** ADR-001 (Auth row and open question), data-model.md (identity tables and the `app.user_id` policy), phase-2.md (P2-01 wording), PLAN.md open items, and the skill's glossary and architecture map if table names change.

## Rollout

- Nick picks an option. This ADR moves to accepted with that option before Phase 2 starts.
- Phase 2: the library lands behind `resolveSession` in `packages/tenancy`, with the identity migrations and their RLS policies in the same PR.
- Reversal: only tenancy, the auth route and the identity migrations know the library. Switching later means migrating `users` and `accounts` and writing a new wrapper. Sessions can be dropped, which forces everyone to sign in again. Org, membership and invitation rows keep their shape.
