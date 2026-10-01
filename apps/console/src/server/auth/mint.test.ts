import { repos, seedOrgs, type SeededOrg, TWO_ORG_SEED } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateBearer } from "./bearer";
import { mintAgentToken, mintAppToken } from "./mint";

const hasher = createTokenHasher("pepper-".repeat(6));
const NOW = new Date("2026-10-01T12:00:00Z");

let t: TestDatabase;
let acme: SeededOrg;
let globex: SeededOrg;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });
const auth = (token: string) => authenticateBearer(`Bearer ${token}`, { db: t.db, hasher, now: () => NOW, requestId: "r" });

// Booting PGlite and applying the migrations takes a few seconds, more under a parallel turbo
// run, so the setup hook gets the same room as in packages/db.
beforeAll(async () => {
  t = await createTestDatabase();
  [acme, globex] = (await seedOrgs(t.db, TWO_ORG_SEED)) as [SeededOrg, SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("mint", () => {
  it("mints an app token that authenticates, stores only its hash and writes an audit row", async () => {
    const minted = await mintAppToken(t.db, hasher, { orgId: acme.orgId, appId: acme.appId, mode: "live", scopes: ["run"], setIds: [acme.setId], channel: "production", expiresAt: null });
    expect((await auth(minted.token)).ctx.actor).toMatchObject({ type: "apiKey", keyId: minted.id, scopes: ["run"], setIds: [acme.setId] });

    await t.db.withTenant(sys(acme.orgId), async (tx) => {
      const row = await repos.appTokens.get(tx, minted.id);
      expect(row?.hash).toBe(hasher.hash(minted.token));
      expect(JSON.stringify(row)).not.toContain(minted.token);
      const audit = (await repos.auditLog.findMany(tx, undefined)).filter((a) => a.targetId === minted.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "app_token.create", actorType: "system", targetType: "app_token" });
      expect(JSON.stringify(audit[0])).not.toContain(minted.token);
    });
  });

  it("mints an agent token for a member, capped at 90 days", async () => {
    const userId = acme.userIds["ada@acme.test"] as string;
    const minted = await mintAgentToken(t.db, hasher, { orgId: acme.orgId, userId, name: "nick-cli", scopes: ["sets:read"], roleCeiling: "admin", setIds: null, days: 90, now: NOW });
    expect((await auth(minted.token)).ctx.actor).toMatchObject({ type: "agent", userId, role: "admin" });
    await expect(mintAgentToken(t.db, hasher, { orgId: acme.orgId, userId, name: "x", scopes: [], roleCeiling: "admin", setIds: null, days: 91, now: NOW })).rejects.toThrow("1 to 90 days");
  });

  it("refuses an app or a user from another org", async () => {
    await expect(mintAppToken(t.db, hasher, { orgId: acme.orgId, appId: globex.appId, mode: "live", scopes: ["run"], setIds: null, channel: "production", expiresAt: null })).rejects.toThrow("No app");
    const grace = globex.userIds["grace@globex.test"] as string;
    await expect(mintAgentToken(t.db, hasher, { orgId: acme.orgId, userId: grace, name: "x", scopes: [], roleCeiling: "viewer", setIds: null, days: 1, now: NOW })).rejects.toThrow("not a member");
  });
});
