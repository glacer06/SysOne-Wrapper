// From a signed-in person to the TenantContext console pages and Server Actions pass to
// runOperation (ADR-002, headless parity). The membership is read on every request, so removing a
// member takes effect at once, whatever their session says.
//
// D2 and D3 serve one org, `internal` (ADR-020). Phase 2 takes the org from the URL instead.

import { type PlanId, PlatformRole, Role, type TenantContext, type UserActor } from "@bandwise/core";
import { authRepositories, type BandwiseDb, repos } from "@bandwise/db";

import { DEFAULT_PLAN } from "./bearer";

/** The only org the console serves until Phase 2. */
export const CONSOLE_ORG_SLUG = "internal";

export interface ConsoleOrg {
  id: string;
  slug: string;
  name: string;
}

export interface ConsoleMember {
  org: ConsoleOrg;
  role: Role;
}

/**
 * The user's membership in the console org, or null. Runs as that user (app.user_id), so RLS shows
 * only their own memberships and the orgs they belong to.
 */
export async function consoleMembership(db: BandwiseDb, userId: string): Promise<ConsoleMember | null> {
  return db.withUser(userId, async (tx) => {
    const orgs = await authRepositories.myOrganizations(tx);
    const org = orgs.find((o) => o.slug === CONSOLE_ORG_SLUG && o.status === "active");
    if (org === undefined) return null;
    const membership = (await authRepositories.myMemberships(tx)).find((m) => m.orgId === org.id);
    const role = Role.safeParse(membership?.role);
    if (!role.success) return null;
    return { org: { id: org.id, slug: org.slug, name: org.name }, role: role.data };
  });
}

/**
 * Whether a person may hold a console session at all: a member of the console org and, when the
 * BANDWISE_CONSOLE_EMAILS allowlist is set, on it. The auth library asks this before it creates
 * any session, so a non-member never gets one, not even a two-factor challenge.
 */
export async function mayHoldConsoleSession(
  db: BandwiseDb,
  userId: string,
  allowedEmails: readonly string[] | null,
): Promise<boolean> {
  if (allowedEmails !== null) {
    const user = await db.withNoTenant((tx) => authRepositories.users.get(tx, userId));
    if (user === null || !allowedEmails.includes(user.email.toLowerCase())) return false;
  }
  return (await consoleMembership(db, userId)) !== null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  twoFactorEnabled: boolean;
  platformRole?: string | null;
}

export interface ConsoleContext {
  ctx: TenantContext & { actor: UserActor };
  org: ConsoleOrg;
  user: SessionUser;
}

/** The console context for a signed-in user, or null when they are not a member of the console org. */
export async function contextForUser(db: BandwiseDb, user: SessionUser, requestId: string): Promise<ConsoleContext | null> {
  const member = await consoleMembership(db, user.id);
  if (member === null) return null;
  const lookup: TenantContext = { orgId: member.org.id, actor: { type: "system" }, client: "console", plan: DEFAULT_PLAN, requestId };
  const plan = await db.withTenant(lookup, async (tx) => {
    const billing = (await repos.billingAccounts.findMany(tx, undefined, 1))[0];
    return (billing?.plan ?? DEFAULT_PLAN) as PlanId;
  });
  const platformRole = PlatformRole.safeParse(user.platformRole);
  const actor: UserActor = {
    type: "user",
    userId: user.id,
    role: member.role,
    platformRole: platformRole.success ? platformRole.data : null,
    impersonatorId: null,
  };
  return { ctx: { orgId: member.org.id, actor, client: "console", plan, requestId }, org: member.org, user };
}

export type ConsoleState =
  | { kind: "signed-out" }
  | { kind: "needs-two-factor"; user: SessionUser }
  | { kind: "no-access"; user: SessionUser }
  | { kind: "ready"; console: ConsoleContext };

/** What the auth library's getSession returns, narrowed to what the console reads. */
export interface LibrarySession {
  user: { id: string; email: string; name: string; twoFactorEnabled?: boolean | null | undefined; platformRole?: string | null | undefined };
}

/**
 * Where a session stands. Two-factor comes first: until it is on, the session reaches only the
 * setup page. Then the membership, read fresh, decides between a context and no access.
 */
export async function resolveConsoleState(db: BandwiseDb, session: LibrarySession | null, requestId: string): Promise<ConsoleState> {
  if (session === null) return { kind: "signed-out" };
  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    platformRole: session.user.platformRole ?? null,
  };
  if (!user.twoFactorEnabled) return { kind: "needs-two-factor", user };
  const ready = await contextForUser(db, user, requestId);
  return ready === null ? { kind: "no-access", user } : { kind: "ready", console: ready };
}
