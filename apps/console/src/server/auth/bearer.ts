// Bearer token auth for /api/v1 (api.md, Auth modes; security.md, App tokens and Agent tokens).
//
// `Authorization: Bearer <token>` with an sk_ app token or an sa_live_ agent token. The token
// names its org (packages/tenancy/src/tokens.ts), so the lookup runs inside that org's tenant
// scope: RLS and the repository org filter both apply, exactly as for any tenant read. A token
// that names the wrong org, is revoked, has expired, or whose user left the org gets the same 401
// as a token that never existed, so the response says nothing about which it was.
//
// pk_live_ tokens need the Origin check and CORS, which land with the embed kit. Until then they
// are refused here like an unknown token.

import {
  type AgentActor,
  AgentClient,
  type ApiKeyActor,
  minRole,
  type PlanId,
  Role,
  Scope,
  type TenantContext,
} from "@bandwise/core";
import { type BandwiseDb, repos } from "@bandwise/db";
import { parseToken, type TokenHasher } from "@bandwise/tenancy";

import { OperationError } from "../operations/errors";

/** last_used_at is written at most this often per token, so busy tokens do not write every call. */
export const LAST_USED_WRITE_MS = 60_000;

/** The plan when an org has no billing account row yet. */
export const DEFAULT_PLAN: PlanId = "free";

export interface BearerDeps {
  db: BandwiseDb;
  hasher: TokenHasher;
  now: () => Date;
  requestId: string;
}

export interface Authenticated {
  ctx: TenantContext;
  /** organizations.slug, for org-level gates such as the internal-only run endpoint (ADR-020). */
  orgSlug: string;
}

const unauthorized = () => new OperationError("unauthenticated", "The bearer token is missing, invalid, expired or revoked.");

/** Only known scopes survive; an unknown one in the row grants nothing. */
function knownScopes(raw: readonly string[] | null): Scope[] {
  return (raw ?? []).flatMap((s) => {
    const parsed = Scope.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  });
}

function live(row: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): boolean {
  return row.revokedAt === null && (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
}

/** The TenantContext for a bearer token, or 401 unauthorized. Never reveals why a token failed. */
export async function authenticateBearer(authorization: string | null, deps: BearerDeps): Promise<Authenticated> {
  const match = /^Bearer (\S+)$/.exec(authorization ?? "");
  if (match === null) throw unauthorized();
  const token = match[1] as string;
  const parsed = parseToken(token);
  if (parsed === null || parsed.prefix === "pk_live_") throw unauthorized();

  const hash = deps.hasher.hash(token);
  const now = deps.now();
  const lookup: TenantContext = {
    orgId: parsed.orgId,
    actor: { type: "system" },
    client: "api",
    plan: DEFAULT_PLAN,
    requestId: deps.requestId,
  };

  const found = await deps.db.withTenant(lookup, async (tx) => {
    const org = await repos.organizations.current(tx);
    if (org === null || org.status !== "active") return null;
    const billing = (await repos.billingAccounts.findMany(tx, undefined, 1))[0];
    const plan = (billing?.plan ?? DEFAULT_PLAN) as PlanId;
    const stale = (at: Date | null) => at === null || now.getTime() - at.getTime() >= LAST_USED_WRITE_MS;

    if (parsed.prefix === "sa_live_") {
      const row = await repos.agentTokens.getByHash(tx, hash);
      if (row === null || row.prefix !== parsed.prefix || !live(row, now)) return null;
      // Effective role = min(role_ceiling, current membership role), recomputed on every request.
      const membership = await repos.memberships.getByUser(tx, row.userId);
      if (membership === null) return null;
      const client = AgentClient.parse(row.client);
      if (stale(row.lastUsedAt)) await repos.agentTokens.update(tx, row.id, { lastUsedAt: now });
      const actor: AgentActor = {
        type: "agent",
        tokenId: row.id,
        userId: row.userId,
        role: minRole(Role.parse(row.roleCeiling), Role.parse(membership.role)),
        scopes: knownScopes(row.scopes),
        setIds: row.setIds ?? null,
        client,
      };
      return { actor, client, plan, slug: org.slug };
    }

    const row = await repos.appTokens.getByHash(tx, hash);
    if (row === null || row.prefix !== parsed.prefix || row.kind !== "secret" || !live(row, now)) return null;
    if (stale(row.lastUsedAt)) await repos.appTokens.update(tx, row.id, { lastUsedAt: now });
    const actor: ApiKeyActor = {
      type: "apiKey",
      keyId: row.id,
      appId: row.appId,
      tokenKind: "secret",
      mode: parsed.prefix === "sk_test_" ? "test" : "live",
      channel: row.channel,
      scopes: knownScopes(row.scopes),
      setIds: row.setIds ?? null,
      origin: null,
    };
    return { actor, client: "api" as const, plan, slug: org.slug };
  });

  if (found === null) throw unauthorized();
  return {
    ctx: { orgId: parsed.orgId, actor: found.actor, client: found.client, plan: found.plan, requestId: deps.requestId },
    orgSlug: found.slug,
  };
}
