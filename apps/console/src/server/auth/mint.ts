// Platform minting of app and agent tokens (ADR-020, D2). Until the console can mint tokens for a
// signed-in person (D3), a platform operator runs `pnpm --filter @bandwise/console mint-token`,
// which calls these. Each writes the hashed token row and an audit row in one transaction, and
// returns the token once. Nothing stores or logs the token itself.

import { type Role, type Scope, type TenantContext } from "@bandwise/core";
import { type BandwiseDb, repos } from "@bandwise/db";
import type { TokenHasher } from "@bandwise/tenancy";

/** Agent tokens live at most 90 days (security.md, Agent tokens). */
export const MAX_AGENT_TOKEN_DAYS = 90;

const DAY_MS = 86_400_000;

function platformContext(orgId: string): TenantContext {
  return { orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId: "mint-token" };
}

export interface MintAppTokenInput {
  orgId: string;
  appId: string;
  mode: "live" | "test";
  scopes: Scope[];
  /** Null means every set. */
  setIds: string[] | null;
  channel: "production" | "staging";
  expiresAt: Date | null;
}

export interface Minted {
  id: string;
  /** Shown once. */
  token: string;
}

export async function mintAppToken(db: BandwiseDb, hasher: TokenHasher, input: MintAppTokenInput): Promise<Minted> {
  const prefix = input.mode === "test" ? "sk_test_" : "sk_live_";
  const { token, hash } = hasher.mint(prefix, input.orgId);
  const row = await db.withTenant(platformContext(input.orgId), async (tx) => {
    const app = await repos.apps.get(tx, input.appId);
    if (app === null) throw new Error(`No app ${input.appId} in org ${input.orgId}.`);
    const inserted = await repos.appTokens.insert(tx, {
      appId: input.appId,
      kind: "secret",
      prefix,
      hash,
      channel: input.channel,
      scopes: input.scopes,
      setIds: input.setIds,
      expiresAt: input.expiresAt,
    });
    await repos.auditLog.insert(tx, {
      actorType: "system",
      client: "job",
      action: "app_token.create",
      targetType: "app_token",
      targetId: inserted.id,
      diff: { appId: input.appId, prefix, channel: input.channel, scopes: input.scopes, setIds: input.setIds, expiresAt: input.expiresAt?.toISOString() ?? null },
    });
    return inserted;
  });
  return { id: row.id, token };
}

export interface MintAgentTokenInput {
  orgId: string;
  userId: string;
  name: string;
  scopes: Scope[];
  roleCeiling: Role;
  setIds: string[] | null;
  /** At most MAX_AGENT_TOKEN_DAYS. */
  days: number;
  now: Date;
}

export async function mintAgentToken(db: BandwiseDb, hasher: TokenHasher, input: MintAgentTokenInput): Promise<Minted> {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_AGENT_TOKEN_DAYS) {
    throw new Error(`Agent tokens last 1 to ${MAX_AGENT_TOKEN_DAYS} days.`);
  }
  const { token, hash } = hasher.mint("sa_live_", input.orgId);
  const expiresAt = new Date(input.now.getTime() + input.days * DAY_MS);
  const row = await db.withTenant(platformContext(input.orgId), async (tx) => {
    const membership = await repos.memberships.getByUser(tx, input.userId);
    if (membership === null) throw new Error(`User ${input.userId} is not a member of org ${input.orgId}.`);
    const inserted = await repos.agentTokens.insert(tx, {
      userId: input.userId,
      name: input.name,
      client: "cli",
      hash,
      scopes: input.scopes,
      roleCeiling: input.roleCeiling,
      setIds: input.setIds,
      expiresAt,
    });
    await repos.auditLog.insert(tx, {
      actorType: "system",
      client: "job",
      action: "agent_token.create",
      targetType: "agent_token",
      targetId: inserted.id,
      diff: { userId: input.userId, name: input.name, scopes: input.scopes, roleCeiling: input.roleCeiling, setIds: input.setIds, expiresAt: expiresAt.toISOString() },
    });
    return inserted;
  });
  return { id: row.id, token };
}
