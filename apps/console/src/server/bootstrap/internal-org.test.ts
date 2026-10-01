import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { authRepositories, repos } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateBearer } from "../auth/bearer";
import { mintAgentToken, mintAppToken } from "../auth/mint";
import { resolveRun } from "../run/resolve";
import { HOSTED_RUN_ORG_SLUG } from "../run/run-set";
import { type BootstrapInput, BootstrapError, bootstrapInternalOrg, type BootstrapResult, INTERNAL_ORG_SLUG, specHash } from "./internal-org";

const SETS_DIR = fileURLToPath(new URL("../../../../../.bandwise/sets/", import.meta.url));
const SPECS = readdirSync(SETS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ slug: basename(f, ".json"), json: JSON.parse(readFileSync(join(SETS_DIR, f), "utf8")) as unknown }));
const NOW = new Date("2026-10-01T12:00:00Z");
const MEMBERS: BootstrapInput["members"] = [
  { email: "nick@bandwise.test", role: "owner" },
  { email: "pj@bandwise.test", role: "admin" },
];
const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let first: BootstrapResult;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });
const auditRows = (orgId: string) => t.db.withTenant(sys(orgId), (tx) => repos.auditLog.findMany(tx, undefined));
const userByEmail = (email: string) => t.db.withNoTenant((tx) => authRepositories.users.getByEmail(tx, email));

beforeAll(async () => {
  t = await createTestDatabase();
  first = await bootstrapInternalOrg(t.db, { members: MEMBERS, specs: SPECS, now: NOW });
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("bootstrapInternalOrg", () => {
  it("serves the org slug the run endpoint is open to", () => {
    expect(INTERNAL_ORG_SLUG).toBe(HOSTED_RUN_ORG_SLUG);
  });

  it("creates the internal org in platform key mode with its members, project, goal and app", async () => {
    expect(SPECS.length).toBeGreaterThanOrEqual(4);
    expect(first.orgCreated).toBe(true);
    expect(first.members.map((m) => [m.role, m.outcome])).toEqual([
      ["owner", "created"],
      ["admin", "created"],
    ]);
    await t.db.withTenant(sys(first.orgId), async (tx) => {
      expect(await repos.organizations.current(tx)).toMatchObject({ slug: "internal", keyMode: "platform" });
      expect((await repos.billingAccounts.findMany(tx, undefined))[0]).toMatchObject({ plan: "internal", status: "active" });
      expect(await repos.apps.get(tx, first.appId)).not.toBeNull();
      expect(await repos.goals.get(tx, first.goalId)).toMatchObject({ projectId: first.projectId });
    });
  });

  it("publishes every spec as version 1 on production at shadow, with an open draft, and the run endpoint resolves it", async () => {
    expect(first.sets.map((s) => [s.slug, s.outcome])).toEqual(SPECS.map((s) => [s.slug, "created"]));
    await t.db.withTenant(sys(first.orgId), async (tx) => {
      for (const s of first.sets) {
        const pointer = await repos.releasePointers.get(tx, s.setId, "production");
        expect(pointer).toMatchObject({ versionId: s.versionId, rolloutStage: "shadow" });
        const v1 = await repos.questionSetVersions.getByNumber(tx, s.setId, 1);
        expect(v1).toMatchObject({ id: s.versionId, status: "published", source: "cli", sourceRef: `.bandwise/sets/${s.slug}.json` });
        expect(v1?.specHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        const draft = await repos.questionSetVersions.getDraft(tx, s.setId);
        expect(draft).toMatchObject({ version: 2, specHash: v1?.specHash });
        expect((await repos.questionSets.get(tx, s.setId))?.draftVersionId).toBe(draft?.id);

        const resolved = await resolveRun(tx, sys(first.orgId), { ref: s.slug });
        expect(resolved).toMatchObject({ setId: s.setId, version: 1, channel: "production", rollout: "shadow" });
      }
    });
  });

  it("writes an audit row for every step", async () => {
    const rows = await auditRows(first.orgId);
    const count = (action: string) => rows.filter((r) => r.action === action).length;
    expect(count("org.create")).toBe(1);
    expect(count("member.add")).toBe(2);
    expect(count("project.create")).toBe(1);
    expect(count("goal.create")).toBe(1);
    expect(count("app.create")).toBe(1);
    expect(count("set.create")).toBe(SPECS.length);
    expect(count("set.publish")).toBe(SPECS.length);
    expect(rows.every((r) => r.actorType === "system" && (r.diff as { source?: unknown }).source === "bootstrap-internal")).toBe(true);
    const events = await t.db.withTenant(sys(first.orgId), (tx) => repos.releaseEvents.findMany(tx, undefined));
    expect(events.filter((e) => e.kind === "publish" && e.toStage === "shadow")).toHaveLength(SPECS.length);
  });

  it("is a no-op the second time", async () => {
    const before = await auditRows(first.orgId);
    const again = await bootstrapInternalOrg(t.db, { members: MEMBERS, specs: SPECS, now: NOW });
    expect(again).toEqual({
      ...first,
      orgCreated: false,
      members: first.members.map((m) => ({ ...m, outcome: "exists" })),
      sets: first.sets.map((s) => ({ ...s, outcome: "exists" })),
    });
    expect(await auditRows(first.orgId)).toHaveLength(before.length);
  });

  it("reports a set whose file changed since as differs and writes nothing", async () => {
    const before = await auditRows(first.orgId);
    const target = SPECS[0];
    if (target === undefined) throw new Error("no specs");
    // A deterministic change: a description on the input schema.
    const json = target.json as { input: { schema: Record<string, unknown> } };
    const changed = { ...json, input: { ...json.input, schema: { ...json.input.schema, description: "changed for the test" } } };
    const r = await bootstrapInternalOrg(t.db, { members: MEMBERS, specs: [{ slug: target.slug, json: changed }], now: NOW });
    expect(r.sets).toEqual([{ ...first.sets[0], outcome: "differs" }]);
    expect(await auditRows(first.orgId)).toHaveLength(before.length);
    await t.db.withTenant(sys(first.orgId), async (tx) => {
      expect(await repos.questionSetVersions.maxVersion(tx, first.sets[0]?.setId ?? "")).toBe(2);
    });
  });

  it("refuses an invalid spec or a lint error before anything is written", async () => {
    const members = [{ email: "new-owner@bandwise.test", role: "owner" as const }];
    await expect(bootstrapInternalOrg(t.db, { members, specs: [{ slug: "broken", json: { schemaVersion: 1 } }], now: NOW })).rejects.toThrow(BootstrapError);
    await expect(bootstrapInternalOrg(t.db, { members, specs: [{ slug: "Bad Slug", json: SPECS[0]?.json }], now: NOW })).rejects.toThrow("not a valid set slug");
    expect(await userByEmail("new-owner@bandwise.test")).toBeNull();
  });

  it("refuses when an internal org exists without this owner, and rolls the new user back", async () => {
    const members = [{ email: "stranger@bandwise.test", role: "owner" as const }];
    await expect(bootstrapInternalOrg(t.db, { members, specs: SPECS, now: NOW })).rejects.toThrow("owner is not a member");
    expect(await userByEmail("stranger@bandwise.test")).toBeNull();
  });

  it("refuses a member list that does not start with the owner", async () => {
    await expect(bootstrapInternalOrg(t.db, { members: [{ email: "pj@bandwise.test", role: "admin" }], specs: SPECS, now: NOW })).rejects.toThrow("needs role owner");
  });

  it("leaves what the runbook mints from: an app token for the hooks and an agent token for the owner", async () => {
    const setIds = first.sets.map((s) => s.setId);
    const app = await mintAppToken(t.db, hasher, { orgId: first.orgId, appId: first.appId, mode: "live", scopes: ["run"], setIds, channel: "production", expiresAt: null });
    const owner = first.members[0]?.userId ?? "";
    const agent = await mintAgentToken(t.db, hasher, {
      orgId: first.orgId,
      userId: owner,
      name: "nick-cli",
      scopes: ["run", "sets:read", "sets:write", "release:production", "runs:read", "usage:read"],
      roleCeiling: "editor",
      setIds: null,
      days: 90,
      now: NOW,
    });
    const auth = (token: string) => authenticateBearer(`Bearer ${token}`, { db: t.db, hasher, now: () => NOW, requestId: "r" });
    expect(await auth(app.token)).toMatchObject({ orgSlug: "internal", ctx: { plan: "internal", actor: { type: "apiKey", scopes: ["run"], setIds } } });
    expect(await auth(agent.token)).toMatchObject({ orgSlug: "internal", ctx: { actor: { type: "agent", userId: owner, role: "editor" } } });
  });

  it("hashes specs the way set.publish does", () => {
    const spec = { b: 1, a: 2 } as never;
    expect(specHash(spec)).toBe(specHash({ a: 2, b: 1 } as never));
  });
});
