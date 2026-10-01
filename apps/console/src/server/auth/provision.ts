// Platform provisioning of console members for the internal org (ADR-020, D3). Sign-up is closed,
// so a platform operator creates the user row and the membership, then hands the person a
// one-time reset link to set their own password. Each change writes an audit row in the org.

import { type Role, type TenantContext } from "@bandwise/core";
import { authRepositories, type BandwiseDb, repos } from "@bandwise/db";

import type { ConsoleAuth } from "./config";
import { CONSOLE_ORG_SLUG } from "./session";

function platformContext(orgId: string): TenantContext {
  return { orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId: "console-member" };
}

export interface ProvisionInput {
  orgId: string;
  email: string;
  name: string;
  role: Role;
}

export interface Provisioned {
  userId: string;
  userCreated: boolean;
  membershipCreated: boolean;
  /** The role the membership has now. An existing membership keeps its role. */
  role: Role;
}

/** Creates the user (if new) and the internal-org membership (if missing). Idempotent. */
export async function provisionConsoleMember(db: BandwiseDb, input: ProvisionInput): Promise<Provisioned> {
  const email = input.email.trim().toLowerCase();
  const org = await db.withTenant(platformContext(input.orgId), (tx) => repos.organizations.current(tx));
  if (org === null || org.slug !== CONSOLE_ORG_SLUG) throw new Error(`Org ${input.orgId} is not the ${CONSOLE_ORG_SLUG} org.`);

  const { userId, userCreated } = await db.withNoTenant(async (tx) => {
    const existing = await authRepositories.users.getByEmail(tx, email);
    if (existing !== null) return { userId: existing.id, userCreated: false };
    const user = await authRepositories.users.insert(tx, { email, name: input.name, emailVerified: true });
    return { userId: user.id, userCreated: true };
  });

  return db.withTenant(platformContext(input.orgId), async (tx) => {
    const existing = await repos.memberships.getByUser(tx, userId);
    if (existing !== null) return { userId, userCreated, membershipCreated: false, role: existing.role as Role };
    const membership = await repos.memberships.insert(tx, { userId, role: input.role });
    await repos.auditLog.insert(tx, {
      actorType: "system",
      client: "job",
      action: "member.add",
      targetType: "membership",
      targetId: membership.id,
      diff: { userId, role: input.role, userCreated },
    });
    return { userId, userCreated, membershipCreated: true, role: input.role };
  });
}

/**
 * Makes a one-time password reset token for a member and records that one was made. The token
 * goes back to the caller only; the database keeps only its hash (storeIdentifier "hashed").
 */
export async function issueResetToken(
  db: BandwiseDb,
  makeAuth: (onResetToken: (token: string) => Promise<void>) => ConsoleAuth,
  input: { orgId: string; userId: string; email: string },
): Promise<string> {
  let token: string | null = null;
  const auth = makeAuth(async (t) => {
    token = t;
  });
  await auth.api.requestPasswordReset({ body: { email: input.email.trim().toLowerCase() } });
  if (token === null) throw new Error("No reset token was made. Is the email right?");
  await db.withTenant(platformContext(input.orgId), (tx) =>
    repos.auditLog.insert(tx, {
      actorType: "system",
      client: "job",
      action: "member.password_reset_link",
      targetType: "user",
      targetId: input.userId,
      diff: null,
    }),
  );
  return token;
}
