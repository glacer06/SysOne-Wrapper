// The cross-tenant suite (testing.md), generated from the repository list.
//
// For every tenant repository, with org A's context:
//   - get, list and findMany never return org B's row;
//   - update and delete of org B's row change nothing;
//   - the same holds with the repository's org filter turned off, so RLS alone returns zero rows;
//   - a raw insert that names org B's org_id is rejected by RLS;
//   - with no org set at all, the table returns zero tenant rows.
// Every repository method that is not one of the generic ones needs a probe below. A repository or
// method with no coverage fails the completeness tests, so adding one without a test fails CI.


import type { Transaction } from "@electric-sql/pglite";
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultQualityTarget, DEFAULT_LABELING_POLICY } from "@bandwise/core/contracts";

import { drizzleOf, type TenantTx } from "./internal/drizzle.js";
import { authRepositories, buildRepositories, type Repositories } from "./repos/index.js";
import { PLATFORM_ROLE } from "./rls.js";
import { ALL_TENANT_SCOPED } from "./schema/classes.js";
import * as schema from "./schema/index.js";
import { SEED_SPEC, seedOrgs, systemContext, TWO_ORG_SEED, type SeededOrg } from "./seed.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

const filtered = buildRepositories({ orgFilter: true });
const rlsOnly = buildRepositories({ orgFilter: false });

const TABLES = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (is(value, PgTable)) TABLES.set(getTableConfig(value).name, value);
}

/** Parents each factory may point at, per org. */
interface Fixture extends SeededOrg {
  ownerId: string;
  spareUserId: string;
  datasetId: string;
  evalRunId: string;
  studioSessionId: string;
  runId: string;
}

let n = 0;
const uniq = (prefix: string) => `${prefix}-${++n}-${crypto.randomUUID().slice(0, 8)}`;
const future = () => new Date(Date.now() + 86_400_000);

function runValues(f: Fixture) {
  return {
    id: crypto.randomUUID(),
    projectId: f.projectId,
    setId: f.setId,
    versionId: f.publishedVersionId,
    channel: "production" as const,
    rollout: "shadow" as const,
    source: "api" as const,
    keyMode: "byo" as const,
    modelRequested: "jev-1.13.0",
    interfaceMajor: 1,
    externalRef: uniq("ext"),
    stateHash: "sha256:x",
    stages: [],
    runBand: "high" as const,
    overallAction: "auto" as const,
    inputTokens: 0,
    outputTokens: 0,
    systemOneCalls: 0,
    cfInputTokens: 0,
    cfOutputTokens: 0,
    counterfactualMicroUsd: 0,
    counterfactualMode: "one_call" as const,
    comparatorModel: "claude-haiku-4-5",
    savingsMicroUsd: 0,
    savingsKind: "decision" as const,
    escalationCostMicroUsd: 0,
    llmCallsMade: 0,
    llmCallsAvoided: 0,
    latencyMs: 1,
    status: "ok" as const,
  };
}

interface Case {
  /** Insert values for one new row in the fixture's org. Unique on every call. */
  values: (f: Fixture) => Record<string, unknown>;
  /** A harmless patch for the update tests. Missing on append-only repositories. */
  patch?: Record<string, unknown>;
}

/** One case per generic tenant repository. */
const CASES: Record<string, Case> = {
  memberships: { values: (f) => ({ userId: f.spareUserId, role: "viewer" }), patch: { role: "reviewer" } },
  invitations: {
    values: () => ({ email: `${uniq("inv")}@x.test`, role: "viewer", tokenHash: uniq("th"), expiresAt: future() }),
    patch: { role: "editor" },
  },
  orgSystemOneKeys: {
    values: () => ({
      provider: "openrouter",
      ciphertext: "c",
      iv: "i",
      authTag: "a",
      wrappedDek: "w",
      kekId: "local:00000000",
      keyLast4: "1234",
      fingerprint: uniq("fp"),
    }),
    patch: { status: "revoked" },
  },
  agentTokens: {
    values: (f) => ({
      userId: f.ownerId,
      name: "cli",
      client: "cli",
      hash: uniq("hash"),
      roleCeiling: "editor",
      expiresAt: future(),
    }),
    patch: { name: "renamed" },
  },
  orgWebhookSecrets: {
    values: () => ({ ciphertext: "c", iv: "i", authTag: "a", wrappedDek: "w", kekId: "local:00000000" }),
    patch: { kekId: "local:11111111" },
  },
  apps: { values: () => ({ name: uniq("app"), language: "ts" }), patch: { name: "renamed" } },
  appTokens: {
    values: (f) => ({ appId: f.appId, kind: "secret", prefix: "sk_live_", hash: uniq("hash") }),
    patch: { rpmLimit: 1 },
  },
  appOpportunities: {
    values: (f) => ({
      appId: f.appId,
      source: "console",
      currentApproach: "regex",
      decisionSummary: "Routes support email",
      pattern: "fan_out",
    }),
    patch: { status: "rejected" },
  },
  appSetBindings: {
    values: (f) => ({
      appId: f.appId,
      setId: f.setId,
      channel: "production",
      target: "managed",
      runtime: "ts",
      interfaceMajor: 1,
      interfaceHash: "h",
    }),
    patch: { sourceRef: "abc123" },
  },
  projects: { values: () => ({ name: "P", slug: uniq("p") }), patch: { name: "renamed" } },
  goals: {
    values: (f) => ({ projectId: f.projectId, title: "G", qualityTarget: defaultQualityTarget("standard") }),
    patch: { title: "renamed" },
  },
  questionSets: {
    values: (f) => ({
      projectId: f.projectId,
      goalId: f.goalId,
      slug: uniq("set"),
      name: "S",
      labeling: DEFAULT_LABELING_POLICY,
    }),
    patch: { name: "renamed" },
  },
  questionSetVersions: {
    // Published, so the one-draft-per-set index does not interfere.
    values: (f) => ({
      setId: f.setId,
      version: 100 + ++n,
      status: "published",
      spec: SEED_SPEC,
      specHash: "h",
      interfaceHash: "h",
      interfaceMajor: 1,
      model: "jev-1.13.0",
      source: "api",
    }),
    patch: { changelog: "changed" },
  },
  releaseEvents: {
    values: (f) => ({ setId: f.setId, channel: "production", kind: "publish" }),
    patch: { reason: "changed" },
  },
  experiments: {
    values: (f) => ({
      setId: f.setId,
      channel: "staging",
      championVersionId: f.publishedVersionId,
      challengerVersionId: f.draftVersionId,
      kind: "version",
      samplePct: 0.1,
      minRuns: 10,
      minLabeled: 5,
      status: "stopped",
    }),
    patch: { minRuns: 20 },
  },
  proposals: {
    values: (f) => ({
      setId: f.setId,
      kind: "tune_thresholds",
      evidence: {},
      rationale: "r",
      createdByKind: "system",
    }),
    patch: { status: "rejected" },
  },
  runs: { values: (f) => runValues(f), patch: { state: null } },
  runFeedback: {
    values: (f) => ({
      runId: f.runId,
      observed: { value: true },
      source: "app",
      observedAt: new Date(),
      idempotencyKey: uniq("idem"),
    }),
    patch: { observed: { value: false } },
  },
  reviewItems: {
    values: (f) => ({ runId: f.runId, setId: f.setId, decisionId: "needs_reply", kind: "label", reason: "audit", band: "high" }),
    patch: { status: "dismissed" },
  },
  datasets: { values: (f) => ({ setId: f.setId, name: uniq("ds") }), patch: { name: "renamed" } },
  datasetCases: {
    values: (f) => ({
      datasetId: f.datasetId,
      state: {},
      stateHash: "h",
      expected: {},
      source: "manual",
      labelSource: "reviewer",
      split: "drafting",
    }),
    patch: { tags: ["x"] },
  },
  datasetSnapshots: { values: (f) => ({ datasetId: f.datasetId, caseIds: [], snapshotHash: uniq("snap") }) },
  evalRuns: {
    values: (f) => ({ setId: f.setId, versionId: f.publishedVersionId, datasetId: f.datasetId, model: "jev-1.13.0" }),
    patch: { status: "failed" },
  },
  evalCaseResults: {
    values: (f) => ({ evalRunId: f.evalRunId, caseId: crypto.randomUUID(), perQuestion: {} }),
    patch: { perQuestion: { x: 1 } },
  },
  studioSessions: { values: (f) => ({ goalId: f.goalId, status: "open" }), patch: { status: "closed" } },
  studioExamples: {
    values: (f) => ({ sessionId: f.studioSessionId, state: {}, labelSource: "human", split: "drafting" }),
    patch: { reason: "changed" },
  },
  questionDaily: {
    values: (f) => ({
      day: "2026-09-26",
      setId: f.setId,
      versionId: f.publishedVersionId,
      modelResolved: "jev-1.13.0",
      questionId: uniq("q").replaceAll("-", "_"),
    }),
    patch: { n: 3 },
  },
  usageDaily: {
    values: (f) => ({
      day: "2026-09-26",
      projectId: f.projectId,
      setId: f.setId,
      versionId: f.publishedVersionId,
      modelResolved: uniq("m"),
      systemOneProvider: "typesafe",
      keyMode: "byo",
      source: "api",
      savingsKind: "decision",
    }),
    patch: { runs: 3 },
  },
  billingAccounts: { values: () => ({ plan: "internal", status: "active" }), patch: { status: "past_due" } },
  entitlementOverrides: {
    values: (f) => ({ key: uniq("k"), value: 5, reason: "r", setBy: f.ownerId }),
    patch: { reason: "changed" },
  },
  usageEvents: {
    values: (f) => ({ runId: f.runId, kind: "run", model: "jev-1.13.0", provider: "typesafe", quantity: 1, keyMode: "byo" }),
    patch: { pushStatus: "skipped" },
  },
  priceBooks: {
    values: () => ({ model: uniq("model"), provider: null, inputPerMtokMicroUsd: 1, outputPerMtokMicroUsd: 0 }),
    patch: { displayName: "changed" },
  },
  auditLog: {
    values: () => ({ actorType: "system", client: "job", action: "test.write", targetType: "t", targetId: uniq("id") }),
  },
  approvalRequests: {
    values: (f) => ({
      opId: "set.publish",
      input: {},
      inputHash: "h",
      requestedByTokenId: crypto.randomUUID(),
      requestedByUserId: f.ownerId,
      reason: "r",
      expiresAt: future(),
    }),
    patch: { status: "rejected" },
  },
  idempotencyKeys: {
    values: () => ({ actorKey: "a", key: uniq("key"), opId: "run.create", requestHash: "h", responseStatus: 200 }),
    patch: { responseStatus: 201 },
  },
  jobs: { values: () => ({ kind: "eval" }), patch: { status: "failed" } },
  events: {
    values: (f) => ({
      id: crypto.randomUUID(),
      type: "set.published",
      actor: { type: "system", client: "job" },
      subjectType: "set",
      subjectId: f.setId,
      data: {},
    }),
  },
  webhookEndpoints: { values: () => ({ url: "https://hooks.example.test/x", types: [] }), patch: { enabled: false } },
  pluginConfigs: { values: () => ({ pluginId: uniq("plugin"), version: "1" }), patch: { enabled: true } },
};

const GENERIC_METHODS = new Set(["table", "scope", "insert", "insertMany", "get", "list", "findMany", "update", "delete"]);

interface GenericRepo {
  table: string;
  insert(tx: TenantTx, values: Record<string, unknown>): Promise<{ id: string }>;
  get(tx: TenantTx, id: string): Promise<{ id: string } | null>;
  list(tx: TenantTx, page: { limit: number; cursor: string | null }): Promise<{ data: { id: string }[]; nextCursor: string | null }>;
  findMany(tx: TenantTx, where: undefined): Promise<{ id: string }[]>;
  update?(tx: TenantTx, id: string, patch: Record<string, unknown>): Promise<{ id: string } | null>;
  delete?(tx: TenantTx, id: string): Promise<boolean>;
}

function generic(r: Repositories, name: string): GenericRepo {
  return (r as unknown as Record<string, GenericRepo>)[name] as GenericRepo;
}

let t: TestDatabase;
let A: Fixture;
let B: Fixture;
/** The row each generic repository created in each org. */
const created: Record<string, { a: string; b: string }> = {};

const inA = <T>(fn: (tx: TenantTx) => Promise<T>) => t.db.withTenant(systemContext(A.orgId), fn);
const inB = <T>(fn: (tx: TenantTx) => Promise<T>) => t.db.withTenant(systemContext(B.orgId), fn);

async function fixture(org: SeededOrg): Promise<Fixture> {
  const ownerId = Object.values(org.userIds)[0];
  if (ownerId === undefined) throw new Error("seed has no user");
  const spareUserId = await t.db.withNoTenant(async (tx) => {
    const u = await authRepositories.users.insert(tx, { email: `${uniq("spare")}@x.test`, name: "Spare" });
    return u.id;
  });
  return t.db.withTenant(systemContext(org.orgId), async (tx) => {
    const base = { ...org, ownerId, spareUserId } as Fixture;
    const dataset = await filtered.datasets.insert(tx, { setId: org.setId, name: "golden" });
    const evalRun = await filtered.evalRuns.insert(tx, {
      setId: org.setId,
      versionId: org.publishedVersionId,
      datasetId: dataset.id,
      model: "jev-1.13.0",
    });
    const session = await filtered.studioSessions.insert(tx, { goalId: org.goalId, status: "open" });
    const run = await filtered.runs.insert(tx, runValues(base));
    return { ...base, datasetId: dataset.id, evalRunId: evalRun.id, studioSessionId: session.id, runId: run.id };
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  const [a, b] = await seedOrgs(t.db, TWO_ORG_SEED);
  if (a === undefined || b === undefined) throw new Error("two-org seed failed");
  A = await fixture(a);
  B = await fixture(b);
  for (const [name, c] of Object.entries(CASES)) {
    const repo = generic(filtered, name);
    const ra = await inA((tx) => repo.insert(tx, c.values(A)));
    const rb = await inB((tx) => repo.insert(tx, c.values(B)));
    created[name] = { a: ra.id, b: rb.id };
  }
}, 60_000);

afterAll(async () => {
  await t.close();
});

describe("completeness", () => {
  it("has a repository for every tenant-scoped table", () => {
    const tables = Object.values(filtered).map((r) => r.table);
    expect([...new Set(tables)].sort()).toEqual([...ALL_TENANT_SCOPED].sort());
  });

  it("has a case for every generic repository, or probes for every method", () => {
    for (const [name, repo] of Object.entries(filtered)) {
      const methods = Object.entries(repo)
        .filter(([, v]) => typeof v === "function")
        .map(([k]) => k);
      const isGeneric = "findMany" in repo;
      if (isGeneric) expect(CASES[name], `no cross-tenant case for ${name}`).toBeDefined();
      for (const m of methods) {
        if (isGeneric && GENERIC_METHODS.has(m)) continue;
        expect(PROBES[`${name}.${m}`], `no cross-tenant probe for ${name}.${m}`).toBeDefined();
      }
    }
  });

  it("has no case or probe for a repository that does not exist", () => {
    for (const name of Object.keys(CASES)) expect(filtered).toHaveProperty(name);
    for (const key of Object.keys(PROBES)) {
      const [repo, method] = key.split(".");
      expect(typeof (filtered as unknown as Record<string, Record<string, unknown>>)[repo ?? ""]?.[method ?? ""]).toBe(
        "function",
      );
    }
  });
});

const variants = [
  { label: "repository filter and RLS", repos: filtered },
  { label: "RLS alone (repository filter bypassed)", repos: rlsOnly },
] as const;

describe.each(Object.keys(CASES))("%s", (name) => {
  describe.each(variants)("with $label", ({ repos: r }) => {
    it("get: org A cannot read org B's row", async () => {
      const ids = created[name];
      if (ids === undefined) throw new Error("setup failed");
      const repo = generic(r, name);
      expect(await inA((tx) => repo.get(tx, ids.b))).toBeNull();
      expect((await inA((tx) => repo.get(tx, ids.a)))?.id).toBe(ids.a);
    });

    it("list and findMany: org A sees none of org B's rows", async () => {
      const ids = created[name];
      if (ids === undefined) throw new Error("setup failed");
      const repo = generic(r, name);
      const seen: string[] = [];
      await inA(async (tx) => {
        let cursor: string | null = null;
        do {
          const page = await repo.list(tx, { limit: 200, cursor });
          seen.push(...page.data.map((row) => row.id));
          cursor = page.nextCursor;
        } while (cursor !== null);
        seen.push(...(await repo.findMany(tx, undefined)).map((row) => row.id));
      });
      expect(seen).not.toContain(ids.b);
      expect(seen).toContain(ids.a);
    });

    it("update and delete: org A cannot change org B's row", async () => {
      const ids = created[name];
      const c = CASES[name];
      if (ids === undefined || c === undefined) throw new Error("setup failed");
      const repo = generic(r, name);
      const { update, delete: remove } = repo;
      const patch = c.patch;
      if (update === undefined || remove === undefined || patch === undefined) {
        expect(update).toBeUndefined();
        expect(remove).toBeUndefined();
        return;
      }
      const before = await inB((tx) => repo.get(tx, ids.b));
      expect(await inA((tx) => update.call(repo, tx, ids.b, patch))).toBeNull();
      expect(await inA((tx) => remove.call(repo, tx, ids.b))).toBe(false);
      expect(await inB((tx) => repo.get(tx, ids.b))).toEqual(before);
    });
  });

  it("insert: RLS rejects a row that names org B's org_id", async () => {
    const c = CASES[name];
    const table = TABLES.get(generic(filtered, name).table);
    if (c === undefined || table === undefined) throw new Error("setup failed");
    await expect(
      inA((tx) => drizzleOf(tx).insert(table).values({ ...c.values(B), orgId: B.orgId } as never)),
    ).rejects.toThrow();
  });

  it("no org set: the table returns zero tenant rows", async () => {
    const tableName = generic(filtered, name).table;
    const count = await t.db.withNoTenant(async (tx) => {
      const res = (await drizzleOf(tx).execute(
        sql.raw(`select count(*)::int as n from "${tableName}" where org_id is not null`),
      )) as unknown as { rows: { n: number }[] };
      return res.rows[0]?.n;
    });
    expect(count).toBe(0);
  });
});

type Probe = (r: Repositories) => Promise<void>;

/** One probe per non-generic method: called from org A against org B's data, it finds or changes nothing. */
const PROBES: Record<string, Probe> = {
  "organizations.current": async (r) => {
    expect((await inA((tx) => r.organizations.current(tx)))?.id).toBe(A.orgId);
  },
  "organizations.get": async (r) => {
    expect(await inA((tx) => r.organizations.get(tx, B.orgId))).toBeNull();
  },
  "organizations.list": async (r) => {
    const page = await inA((tx) => r.organizations.list(tx, { limit: 200, cursor: null }));
    expect(page.data.map((o) => o.id)).toEqual([A.orgId]);
  },
  "organizations.create": async (r) => {
    // The id is always the transaction's org, so a create can never make or overwrite org B.
    await expect(
      inA((tx) => r.organizations.create(tx, { id: B.orgId, slug: uniq("x"), name: "X" } as never)),
    ).rejects.toThrow();
    expect((await inB((tx) => r.organizations.current(tx)))?.slug).toBe(B.slug);
  },
  "organizations.update": async (r) => {
    expect(await inA((tx) => r.organizations.update(tx, B.orgId, { name: "stolen" }))).toBeNull();
    expect((await inB((tx) => r.organizations.current(tx)))?.name).not.toBe("stolen");
  },
  "memberships.getByUser": async (r) => {
    expect(await inA((tx) => r.memberships.getByUser(tx, B.ownerId))).toBeNull();
  },
  "agentTokens.getByHash": async (r) => {
    const hash = await inB(async (tx) => (await r.agentTokens.get(tx, created["agentTokens"]?.b ?? ""))?.hash);
    expect(hash).toBeDefined();
    expect(await inA((tx) => r.agentTokens.getByHash(tx, hash ?? ""))).toBeNull();
  },
  "appTokens.getByHash": async (r) => {
    const hash = await inB(async (tx) => (await r.appTokens.get(tx, created["appTokens"]?.b ?? ""))?.hash);
    expect(hash).toBeDefined();
    expect(await inA((tx) => r.appTokens.getByHash(tx, hash ?? ""))).toBeNull();
  },
  "orgSystemOneKeys.getByProvider": async (r) => {
    const row = await inA((tx) => r.orgSystemOneKeys.getByProvider(tx, "openrouter"));
    expect(row?.orgId).toBe(A.orgId);
  },
  "projects.getBySlug": async (r) => {
    const slug = await inB(async (tx) => (await r.projects.get(tx, created["projects"]?.b ?? ""))?.slug);
    expect(slug).toBeDefined();
    expect(await inA((tx) => r.projects.getBySlug(tx, slug ?? ""))).toBeNull();
  },
  "questionSets.getBySlug": async (r) => {
    const slug = await inB(async (tx) => (await r.questionSets.get(tx, created["questionSets"]?.b ?? ""))?.slug);
    expect(slug).toBeDefined();
    expect(await inA((tx) => r.questionSets.getBySlug(tx, slug ?? ""))).toBeNull();
  },
  "questionSetVersions.getDraft": async (r) => {
    expect(await inA((tx) => r.questionSetVersions.getDraft(tx, B.setId))).toBeNull();
  },
  "questionSetVersions.getByNumber": async (r) => {
    expect(await inA((tx) => r.questionSetVersions.getByNumber(tx, B.setId, 1))).toBeNull();
  },
  "questionSetVersions.maxVersion": async (r) => {
    expect(await inA((tx) => r.questionSetVersions.maxVersion(tx, B.setId))).toBe(0);
  },
  "questionSetVersions.listPublished": async (r) => {
    expect((await inB((tx) => r.questionSetVersions.listPublished(tx, B.setId, { limit: 50, cursor: null }))).data.length).toBeGreaterThan(0);
    expect(await inA((tx) => r.questionSetVersions.listPublished(tx, B.setId, { limit: 50, cursor: null }))).toEqual({ data: [], nextCursor: null });
  },
  "questionSetVersions.maxInterfaceMajor": async (r) => {
    expect(await inB((tx) => r.questionSetVersions.maxInterfaceMajor(tx, B.setId))).toBeGreaterThan(0);
    expect(await inA((tx) => r.questionSetVersions.maxInterfaceMajor(tx, B.setId))).toBe(0);
  },
  "questionSetVersions.updateDraftIf": async (r) => {
    const before = await inB((tx) => r.questionSetVersions.get(tx, B.draftVersionId));
    expect(before?.status).toBe("draft");
    const hash = before?.specHash ?? "";
    expect(await inA((tx) => r.questionSetVersions.updateDraftIf(tx, B.draftVersionId, hash, { changelog: "stolen" }))).toBeNull();
    expect(await inB((tx) => r.questionSetVersions.get(tx, B.draftVersionId))).toEqual(before);
    // In org B it writes only while the hash still matches.
    expect(await inB((tx) => r.questionSetVersions.updateDraftIf(tx, B.draftVersionId, "sha256:other", { changelog: "x" }))).toBeNull();
    expect((await inB((tx) => r.questionSetVersions.updateDraftIf(tx, B.draftVersionId, hash, { changelog: "kept" })))?.changelog).toBe("kept");
  },
  "releaseEvents.listByChannel": async (r) => {
    expect((await inB((tx) => r.releaseEvents.listByChannel(tx, B.setId, "production"))).length).toBeGreaterThan(0);
    expect(await inA((tx) => r.releaseEvents.listByChannel(tx, B.setId, "production"))).toEqual([]);
  },
  "releasePointers.get": async (r) => {
    expect(await inA((tx) => r.releasePointers.get(tx, B.setId, "production"))).toBeNull();
  },
  "releasePointers.listBySet": async (r) => {
    expect(await inA((tx) => r.releasePointers.listBySet(tx, B.setId))).toEqual([]);
  },
  "releasePointers.insert": async (r) => {
    await expect(
      inA((tx) =>
        r.releasePointers.insert(tx, { setId: B.setId, channel: "staging", versionId: B.publishedVersionId }),
      ),
    ).rejects.toThrow();
  },
  "releasePointers.update": async (r) => {
    expect(await inA((tx) => r.releasePointers.update(tx, B.setId, "production", { rolloutStage: "paused" }))).toBeNull();
    expect((await inB((tx) => r.releasePointers.get(tx, B.setId, "production")))?.rolloutStage).toBe("shadow");
  },
  "releasePointers.delete": async (r) => {
    expect(await inA((tx) => r.releasePointers.delete(tx, B.setId, "production"))).toBe(false);
    expect(await inB((tx) => r.releasePointers.get(tx, B.setId, "production"))).not.toBeNull();
  },
  "runs.findByExternalRef": async (r) => {
    const ref = await inB(async (tx) => (await r.runs.get(tx, B.runId))?.externalRef);
    expect(ref).toBeTruthy();
    expect(await inA((tx) => r.runs.findByExternalRef(tx, ref ?? ""))).toBeNull();
    expect(await inA((tx) => r.runs.findByExternalRef(tx, ref ?? "", B.setId))).toBeNull();
  },
  "runs.listBySet": async (r) => {
    expect(await inA((tx) => r.runs.listBySet(tx, B.setId))).toEqual([]);
  },
  "runs.listPage": async (r) => {
    const first = { limit: 200, cursor: null };
    expect((await inB((tx) => r.runs.listPage(tx, { setId: B.setId }, first))).data.map((x) => x.id)).toContain(B.runId);
    expect((await inA((tx) => r.runs.listPage(tx, { setId: B.setId }, first))).data).toEqual([]);
    expect((await inA((tx) => r.runs.listPage(tx, {}, first))).data.map((x) => x.id)).not.toContain(B.runId);
    // A cursor that names org B's run reads nothing of it.
    expect((await inA((tx) => r.runs.listPage(tx, {}, { limit: 200, cursor: B.runId }))).data).toEqual([]);
  },
  "runs.totalsBySet": async (r) => {
    const range = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };
    expect((await inB((tx) => r.runs.totalsBySet(tx, { ...range, setIds: [B.setId] })))[0]?.runs).toBeGreaterThan(0);
    expect(await inA((tx) => r.runs.totalsBySet(tx, { ...range, setIds: [B.setId] }))).toEqual([]);
    expect((await inA((tx) => r.runs.totalsBySet(tx, range))).map((x) => x.setId)).not.toContain(B.setId);
  },
  "runs.totalsByDay": async (r) => {
    const range = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };
    const sum = (days: { runs: number }[]) => days.reduce((n, d) => n + d.runs, 0);
    expect(sum(await inB((tx) => r.runs.totalsByDay(tx, { ...range, setIds: [B.setId] })))).toBeGreaterThan(0);
    expect(await inA((tx) => r.runs.totalsByDay(tx, { ...range, setIds: [B.setId] }))).toEqual([]);
    // Without a set filter, org A's days add up to org A's own runs only.
    const own = (await inA((tx) => r.runs.totalsBySet(tx, range))).reduce((n, x) => n + x.runs, 0);
    expect(sum(await inA((tx) => r.runs.totalsByDay(tx, range)))).toBe(own);
  },
  "runFeedback.getByIdempotencyKey": async (r) => {
    const key = await inB(async (tx) => (await r.runFeedback.get(tx, created["runFeedback"]?.b ?? ""))?.idempotencyKey);
    expect(key).toBeTruthy();
    expect(await inA((tx) => r.runFeedback.getByIdempotencyKey(tx, key ?? ""))).toBeNull();
  },
  "reviewItems.listByRun": async (r) => {
    expect(await inA((tx) => r.reviewItems.listByRun(tx, B.runId))).toEqual([]);
  },
  "reviewItems.listPage": async (r) => {
    const id = created["reviewItems"]?.b ?? "";
    const first = { limit: 200, cursor: null };
    expect((await inB((tx) => r.reviewItems.listPage(tx, { setId: B.setId }, first))).data.map((x) => x.id)).toContain(id);
    expect((await inA((tx) => r.reviewItems.listPage(tx, { setId: B.setId }, first))).data).toEqual([]);
    expect((await inA((tx) => r.reviewItems.listPage(tx, {}, first))).data.map((x) => x.id)).not.toContain(id);
    // A cursor that names org B's item reads nothing of it.
    expect((await inA((tx) => r.reviewItems.listPage(tx, {}, { limit: 200, cursor: id }))).data).toEqual([]);
  },
  "reviewItems.countLabelItemsSince": async (r) => {
    expect(await inB((tx) => r.reviewItems.countLabelItemsSince(tx, B.setId, new Date(0)))).toBeGreaterThan(0);
    expect(await inA((tx) => r.reviewItems.countLabelItemsSince(tx, B.setId, new Date(0)))).toBe(0);
  },
  "usageEvents.listByRun": async (r) => {
    expect(await inA((tx) => r.usageEvents.listByRun(tx, B.runId))).toEqual([]);
  },
  "priceBooks.resolve": async (r) => {
    const model = "jev-1.13.0";
    await inB((tx) =>
      filtered.priceBooks.insert(tx, { model, provider: null, inputPerMtokMicroUsd: 1, outputPerMtokMicroUsd: 0 }),
    ).catch(() => undefined);
    expect((await inB((tx) => r.priceBooks.resolve(tx, model)))?.inputPerMtokMicroUsd).toBe(1);
    // Org A reads the platform row, never org B's override.
    expect((await inA((tx) => r.priceBooks.resolve(tx, model)))?.inputPerMtokMicroUsd).toBe(42_000);
  },
  "approvalRequests.findPending": async (r) => {
    const row = await inB((tx) => r.approvalRequests.get(tx, created["approvalRequests"]?.b ?? ""));
    expect(row).not.toBeNull();
    const args = [row?.requestedByTokenId ?? "", row?.opId ?? "", row?.inputHash ?? "", new Date()] as const;
    expect((await inB((tx) => r.approvalRequests.findPending(tx, ...args)))?.id).toBe(row?.id);
    expect(await inA((tx) => r.approvalRequests.findPending(tx, ...args))).toBeNull();
  },
  "approvalRequests.transition": async (r) => {
    const row = await inB((tx) => filtered.approvalRequests.insert(tx, CASES["approvalRequests"]?.values(B) as never));
    expect(await inA((tx) => r.approvalRequests.transition(tx, row.id, "pending", { status: "approved" }))).toBeNull();
    expect((await inB((tx) => r.approvalRequests.get(tx, row.id)))?.status).toBe("pending");
    // In org B it moves only from the expected status, and only before expiry when asked.
    expect(await inB((tx) => r.approvalRequests.transition(tx, row.id, "approved", { status: "executed" }))).toBeNull();
    expect(await inB((tx) => r.approvalRequests.transition(tx, row.id, "pending", { status: "approved" }, new Date(Date.now() + 30 * 86_400_000)))).toBeNull();
    expect((await inB((tx) => r.approvalRequests.transition(tx, row.id, "pending", { status: "approved" }, new Date())))?.status).toBe("approved");
    expect(await inB((tx) => r.approvalRequests.transition(tx, row.id, "pending", { status: "rejected" }))).toBeNull();
  },
  "approvalRequests.listPending": async (r) => {
    const id = created["approvalRequests"]?.b ?? "";
    const first = { limit: 200, cursor: null };
    expect((await inB((tx) => r.approvalRequests.listPending(tx, { now: new Date() }, first))).data.map((x) => x.id)).toContain(id);
    expect((await inA((tx) => r.approvalRequests.listPending(tx, { now: new Date() }, first))).data.map((x) => x.id)).not.toContain(id);
  },
  "idempotencyKeys.lookup": async (r) => {
    const key = await inB(async (tx) => (await r.idempotencyKeys.get(tx, created["idempotencyKeys"]?.b ?? ""))?.key);
    expect(key).toBeTruthy();
    expect(await inA((tx) => r.idempotencyKeys.lookup(tx, "a", key ?? ""))).toBeNull();
  },
};

describe.each(Object.keys(PROBES))("probe %s", (key) => {
  it.each(variants)("finds or changes nothing of org B with $label", async ({ repos: r }) => {
    await PROBES[key]?.(r);
  });
});

describe("hybrid tables", () => {
  it("both orgs read the platform price rows", async () => {
    for (const run of [inA, inB]) {
      const price = await run((tx) => filtered.priceBooks.resolve(tx, "claude-haiku-4-5"));
      expect(price).toEqual({ inputPerMtokMicroUsd: 1_000_000, outputPerMtokMicroUsd: 5_000_000 });
    }
  });

  it("no org can write a platform price row", async () => {
    const table = TABLES.get("price_books");
    if (table === undefined) throw new Error("no price_books table");
    await expect(
      inA((tx) =>
        drizzleOf(tx)
          .insert(table)
          .values({ orgId: null, model: uniq("m"), inputPerMtokMicroUsd: 1, outputPerMtokMicroUsd: 1 } as never),
      ),
    ).rejects.toThrow();
    await expect(
      inA((tx) => drizzleOf(tx).execute(sql`update price_books set input_per_mtok_micro_usd = 0 where org_id is null`)),
    ).resolves.toBeDefined();
    expect((await inA((tx) => filtered.priceBooks.resolve(tx, "claude-haiku-4-5")))?.inputPerMtokMicroUsd).toBe(
      1_000_000,
    );
  });

  it("platform audit rows are invisible to every org", async () => {
    const count = await inA(async (tx) => {
      const res = (await drizzleOf(tx).execute(
        sql`select count(*)::int as n from audit_log where org_id is null`,
      )) as unknown as { rows: { n: number }[] };
      return res.rows[0]?.n;
    });
    expect(count).toBe(0);
  });

  // Until migration 0004 the tenant policies on these tables applied to PUBLIC, so the platform
  // role also reached the rows of whatever org app.org_id named. Now it reaches org_id null only.
  // The harness session user is a superuser, so it may SET ROLE to the platform role.
  const asPlatformInOrgA = <T>(fn: (tx: Transaction) => Promise<T>) =>
    t.pglite.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${PLATFORM_ROLE}`);
      await tx.query("select set_config('app.org_id', $1, true)", [A.orgId]);
      return fn(tx);
    });

  it("the platform role reads platform rows only, even with an org set", async () => {
    const counts = await asPlatformInOrgA(async (tx) =>
      (
        await tx.query<{ table: string; org: number; platform: number }>(
          `select t.table, t.org, t.platform from (
             select 'price_books' as table, count(*) filter (where org_id is not null)::int as org,
               count(*) filter (where org_id is null)::int as platform from price_books
             union all select 'audit_log', count(*) filter (where org_id is not null)::int,
               count(*) filter (where org_id is null)::int from audit_log
             union all select 'events', count(*) filter (where org_id is not null)::int,
               count(*) filter (where org_id is null)::int from events) t`,
        )
      ).rows,
    );
    expect(counts.map((c) => [c.table, c.org])).toEqual([
      ["price_books", 0],
      ["audit_log", 0],
      ["events", 0],
    ]);
    expect(counts.find((c) => c.table === "price_books")?.platform).toBeGreaterThan(0);
  });

  it("the platform role cannot write an org row", async () => {
    await expect(
      asPlatformInOrgA((tx) =>
        tx.query(
          `insert into audit_log (org_id, actor_type, client, action, target_type, target_id)
           values ($1, 'system', 'job', 'test.write', 't', 'x')`,
          [A.orgId],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("composite foreign keys", () => {
  it("org A cannot hang a row off org B's set, even with the right org_id", async () => {
    await expect(
      inA((tx) =>
        filtered.reviewItems.insert(tx, {
          setId: B.setId,
          decisionId: "needs_reply",
          kind: "action",
          reason: "action",
          band: "low",
        }),
      ),
    ).rejects.toThrow();
  });

  it("the question set of org A keeps its own project", async () => {
    await expect(
      inA((tx) =>
        filtered.questionSets.insert(tx, {
          projectId: B.projectId,
          goalId: A.goalId,
          slug: uniq("s"),
          name: "x",
          labeling: DEFAULT_LABELING_POLICY,
        }),
      ),
    ).rejects.toThrow();
  });
});
