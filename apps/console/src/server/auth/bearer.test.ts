// Bearer auth against a real Postgres (PGlite) with RLS on, as the app role. The token names its
// org, and every failure is the same 401: unknown, wrong org, revoked, expired, a wrong prefix, a
// publishable token, or an agent whose user left the org.

import { repos, seedOrgs, type SeededOrg, TWO_ORG_SEED } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher, type TokenPrefix } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OperationError } from "../operations/errors";
import { authenticateBearer, LAST_USED_WRITE_MS } from "./bearer";

const hasher = createTokenHasher("pepper-".repeat(6));
const NOW = new Date("2026-10-01T12:00:00Z");

let t: TestDatabase;
let acme: SeededOrg;
let globex: SeededOrg;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });
const deps = (now = NOW) => ({ db: t.db, hasher, now: () => now, requestId: "req-1" });

async function appToken(org: SeededOrg, extra: Partial<{ prefix: TokenPrefix; kind: "secret" | "publishable"; revokedAt: Date; expiresAt: Date; scopes: string[] }> = {}) {
  const prefix = extra.prefix ?? "sk_live_";
  const { token, hash } = hasher.mint(prefix, org.orgId);
  const row = await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.appTokens.insert(tx, {
      appId: org.appId,
      kind: extra.kind ?? "secret",
      prefix: prefix as "sk_live_",
      hash,
      scopes: extra.scopes ?? ["run", "not-a-scope"],
      setIds: [org.setId],
      revokedAt: extra.revokedAt ?? null,
      expiresAt: extra.expiresAt ?? null,
    }),
  );
  return { token, id: row.id };
}

async function agentToken(org: SeededOrg, email: string, roleCeiling: "owner" | "admin" | "editor" | "viewer", extra: Partial<{ expiresAt: Date }> = {}) {
  const { token, hash } = hasher.mint("sa_live_", org.orgId);
  const userId = org.userIds[email] as string;
  const row = await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.agentTokens.insert(tx, {
      userId,
      name: "cli",
      client: "cli",
      hash,
      scopes: ["sets:read", "sets:write"],
      roleCeiling,
      expiresAt: extra.expiresAt ?? new Date("2026-12-01T00:00:00Z"),
    }),
  );
  return { token, id: row.id, userId };
}

async function rejects(header: string | null, now = NOW) {
  const err = await authenticateBearer(header, deps(now)).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(OperationError);
  expect((err as OperationError).code).toBe("unauthenticated");
  expect((err as OperationError).status).toBe(401);
}

// Booting PGlite and applying the migrations takes a few seconds, more under a parallel turbo
// run, so the setup hook gets the same room as in packages/db.
beforeAll(async () => {
  t = await createTestDatabase();
  [acme, globex] = (await seedOrgs(t.db, TWO_ORG_SEED)) as [SeededOrg, SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("app tokens", () => {
  it("authenticates an sk_live_ token as an apiKey actor in its org, with only known scopes", async () => {
    const { token, id } = await appToken(acme);
    const { ctx, orgSlug } = await authenticateBearer(`Bearer ${token}`, deps());
    expect(orgSlug).toBe("acme");
    expect(ctx).toMatchObject({ orgId: acme.orgId, client: "api", requestId: "req-1" });
    expect(ctx.actor).toEqual({
      type: "apiKey",
      keyId: id,
      appId: acme.appId,
      tokenKind: "secret",
      mode: "live",
      channel: "production",
      scopes: ["run"],
      setIds: [acme.setId],
      origin: null,
    });
  });

  it("marks sk_test_ tokens as test mode", async () => {
    const { token } = await appToken(acme, { prefix: "sk_test_" });
    const { ctx } = await authenticateBearer(`Bearer ${token}`, deps());
    expect(ctx.actor).toMatchObject({ type: "apiKey", mode: "test" });
  });

  it("writes last_used_at, at most once a minute", async () => {
    const { token, id } = await appToken(acme);
    const lastUsed = () => t.db.withTenant(sys(acme.orgId), async (tx) => (await repos.appTokens.get(tx, id))?.lastUsedAt);
    await authenticateBearer(`Bearer ${token}`, deps());
    expect(await lastUsed()).toEqual(NOW);
    await authenticateBearer(`Bearer ${token}`, deps(new Date(NOW.getTime() + 1_000)));
    expect(await lastUsed()).toEqual(NOW);
    const later = new Date(NOW.getTime() + LAST_USED_WRITE_MS);
    await authenticateBearer(`Bearer ${token}`, deps(later));
    expect(await lastUsed()).toEqual(later);
  });

  it("refuses a token rewritten to name another org, with the same 401", async () => {
    const { token } = await appToken(acme);
    const acmeHex = acme.orgId.replaceAll("-", "");
    const globexHex = globex.orgId.replaceAll("-", "");
    await rejects(`Bearer ${token.replace(acmeHex, globexHex)}`);
  });

  it("refuses revoked, expired, publishable and unknown tokens", async () => {
    await rejects(`Bearer ${(await appToken(acme, { revokedAt: new Date("2026-09-01T00:00:00Z") })).token}`);
    await rejects(`Bearer ${(await appToken(acme, { expiresAt: NOW })).token}`);
    await rejects(`Bearer ${(await appToken(acme, { prefix: "pk_live_", kind: "publishable" })).token}`);
    await rejects(`Bearer ${hasher.mint("sk_live_", acme.orgId).token}`);
  });

  it("refuses a token whose prefix was changed", async () => {
    const { token } = await appToken(acme, { prefix: "sk_test_" });
    await rejects(`Bearer ${token.replace("sk_test_", "sk_live_")}`);
  });

  it("refuses a missing or malformed header", async () => {
    const { token } = await appToken(acme);
    for (const h of [null, "", token, `Basic ${token}`, `Bearer  ${token}`, `Bearer ${token} extra`, "Bearer sk_live_nope"]) await rejects(h);
  });
});

describe("agent tokens", () => {
  it("authenticates an sa_live_ token with role = min(ceiling, membership role)", async () => {
    const { token, id, userId } = await agentToken(acme, "ada@acme.test", "editor");
    const { ctx } = await authenticateBearer(`Bearer ${token}`, deps());
    expect(ctx.client).toBe("cli");
    expect(ctx.actor).toEqual({ type: "agent", tokenId: id, userId, role: "editor", scopes: ["sets:read", "sets:write"], setIds: null, client: "cli" });
  });

  it("never raises the role above the membership", async () => {
    const { token, userId } = await agentToken(globex, "grace@globex.test", "owner");
    await t.db.withTenant(sys(globex.orgId), async (tx) => {
      const m = await repos.memberships.getByUser(tx, userId);
      await repos.memberships.update(tx, m?.id as string, { role: "viewer" });
    });
    const { ctx } = await authenticateBearer(`Bearer ${token}`, deps());
    expect(ctx.actor).toMatchObject({ type: "agent", role: "viewer" });
  });

  it("refuses the token once the user leaves the org, and once it expires", async () => {
    const expired = await agentToken(acme, "ada@acme.test", "admin", { expiresAt: NOW });
    await rejects(`Bearer ${expired.token}`);

    const { token, userId } = await agentToken(acme, "ada@acme.test", "admin");
    await t.db.withTenant(sys(acme.orgId), async (tx) => {
      const m = await repos.memberships.getByUser(tx, userId);
      await repos.memberships.delete(tx, m?.id as string);
    });
    await rejects(`Bearer ${token}`);
  });
});
