// Seeds and pre-org lookups: the two-org seed, the three-org seed (sgr, personal, dallas), the
// platform seed, and withUser (ADR-002).

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  QuestionSetSpec,
  SEED_MODEL_PROFILES,
  SEED_MODEL_ROUTES,
} from "@bandwise/core";

import { drizzleOf } from "./internal/drizzle.js";
import { authRepositories, platformRepositories, repos } from "./repos/index.js";
import { seedOrgs, systemContext, THREE_ORG_SEED, TWO_ORG_SEED, type SeededOrg } from "./seed.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;
let two: SeededOrg[];
let three: SeededOrg[];

beforeAll(async () => {
  t = await createTestDatabase();
  two = await seedOrgs(t.db, TWO_ORG_SEED);
  three = await seedOrgs(t.db, THREE_ORG_SEED);
});

afterAll(async () => {
  await t.close();
});

describe("platform seed", () => {
  it("loads every model profile and route from the core catalog", async () => {
    const models = await t.db.withNoTenant((tx) =>
      platformRepositories.systemOneModels.list(tx, { limit: 200, cursor: null }),
    );
    expect(models.data.map((m) => m.id).sort()).toEqual(SEED_MODEL_PROFILES.map((p) => p.id).sort());
    const pinned = models.data.find((m) => m.id === "jev-1.13.0");
    expect(pinned?.kind).toBe("versioned");
    expect(pinned?.limits?.requestTokens).toBe(64_000);
    for (const provider of ["openrouter", "vercel"] as const) {
      const routes = await t.db.withNoTenant((tx) => platformRepositories.systemOneModelRoutes.listByProvider(tx, provider));
      expect(routes.map((r) => [r.modelId, r.providerModelId, r.pinned])).toEqual(
        SEED_MODEL_ROUTES.filter((r) => r.provider === provider)
          .map((r) => [r.modelId, r.providerModelId, r.pinned])
          .sort(),
      );
    }
    // ADR-013: Vercel serves only jev-latest, as typesafe-ai/jev, not pinned.
    expect(SEED_MODEL_ROUTES.filter((r) => r.provider === "vercel").map((r) => r.providerModelId)).toEqual(["typesafe-ai/jev"]);
    expect(await t.db.withNoTenant((tx) => platformRepositories.systemOneModelRoutes.listByProvider(tx, "typesafe"))).toEqual(
      [],
    );
  });

  it("stores the platform defaults as settings", async () => {
    const row = await t.db.withNoTenant((tx) => platformRepositories.settings.get(tx, "defaultModel"));
    expect(row?.value).toBe("jev-1.13.0");
  });
});

describe("two-org seed", () => {
  it("creates two isolated orgs, each with a published v1, an open draft and a production pointer", async () => {
    expect(two.map((o) => o.slug)).toEqual(["acme", "globex"]);
    for (const org of two) {
      await t.db.withTenant(systemContext(org.orgId), async (tx) => {
        const set = await repos.questionSets.getBySlug(tx, "inbox-triage");
        expect(set?.draftVersionId).toBe(org.draftVersionId);
        const v1 = await repos.questionSetVersions.getByNumber(tx, org.setId, 1);
        expect(v1?.status).toBe("published");
        expect(QuestionSetSpec.safeParse(v1?.spec).success).toBe(true);
        expect((await repos.questionSetVersions.getDraft(tx, org.setId))?.id).toBe(org.draftVersionId);
        expect(await repos.questionSetVersions.maxVersion(tx, org.setId)).toBe(2);
        const pointer = await repos.releasePointers.get(tx, org.setId, "production");
        expect(pointer).toMatchObject({ versionId: org.publishedVersionId, rolloutStage: "shadow" });
        const audit = await repos.auditLog.list(tx, { limit: 10, cursor: null });
        expect(audit.data.map((a) => a.action)).toContain("org.seed");
      });
    }
  });
});

describe("three-org seed", () => {
  it("creates sgr, personal and dallas", () => {
    expect(three.map((o) => o.slug)).toEqual(["sgr", "personal", "dallas"]);
  });

  it("puts one user in all three orgs with a role per org, visible through withUser", async () => {
    const nick = three[0]?.userIds["nick@bandwise.test"];
    if (nick === undefined) throw new Error("no nick");
    for (const org of three) expect(org.userIds["nick@bandwise.test"]).toBe(nick);
    const [memberships, orgs] = await t.db.withUser(nick, async (tx) => [
      await authRepositories.myMemberships(tx),
      await authRepositories.myOrganizations(tx),
    ] as const);
    const bySlug = new Map(orgs.map((o) => [o.id, o.slug]));
    expect(memberships.map((m) => [bySlug.get(m.orgId), m.role]).sort()).toEqual([
      ["dallas", "admin"],
      ["personal", "owner"],
      ["sgr", "owner"],
    ]);
    // Only Nick's orgs: acme and globex stay hidden.
    expect(orgs.map((o) => o.slug).sort()).toEqual(["dallas", "personal", "sgr"]);
  });

  it("shows a user only their own memberships before an org is picked", async () => {
    const vic = three[2]?.userIds["vic@bandwise.test"];
    if (vic === undefined) throw new Error("no vic");
    const memberships = await t.db.withUser(vic, (tx) => authRepositories.myMemberships(tx));
    expect(memberships.map((m) => m.role)).toEqual(["viewer"]);
  });

  it("shows open invitations addressed to the user's email only", async () => {
    const sgr = three[0];
    const rita = sgr?.userIds["rita@bandwise.test"];
    if (sgr === undefined || rita === undefined) throw new Error("seed failed");
    await t.db.withTenant(systemContext(sgr.orgId), async (tx) => {
      await repos.invitations.insert(tx, {
        email: "RITA@bandwise.test",
        role: "editor",
        tokenHash: "hash-rita",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await repos.invitations.insert(tx, {
        email: "someone@else.test",
        role: "editor",
        tokenHash: "hash-else",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    });
    const invites = await t.db.withUser(rita, (tx) => authRepositories.myInvitations(tx));
    expect(invites.map((i) => i.tokenHash)).toEqual(["hash-rita"]);
  });

  it("gives withUser no access to tenant tables", async () => {
    const nick = three[0]?.userIds["nick@bandwise.test"];
    if (nick === undefined) throw new Error("no nick");
    const n = await t.db.withUser(nick, async (tx) => {
      const res = (await drizzleOf(tx).execute(sql`select count(*)::int as n from question_sets`)) as unknown as {
        rows: { n: number }[];
      };
      return res.rows[0]?.n;
    });
    expect(n).toBe(0);
  });
});
