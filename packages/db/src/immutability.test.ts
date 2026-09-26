// Published versions never change (golden rule 5), dataset splits never change, and the audit log
// and dataset snapshots are append-only for the app role.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { drizzleOf, type TenantTx } from "./internal/drizzle.js";
import { repos } from "./repos/index.js";
import { SEED_SPEC, seedOrgs, systemContext, TWO_ORG_SEED, type SeededOrg } from "./seed.js";
import { pgErrorOf } from "./testing/errors.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

let t: TestDatabase;
let org: SeededOrg;

const inOrg = <T>(fn: (tx: TenantTx) => Promise<T>) => t.db.withTenant(systemContext(org.orgId), fn);

beforeAll(async () => {
  t = await createTestDatabase();
  const [a] = await seedOrgs(t.db, TWO_ORG_SEED);
  if (a === undefined) throw new Error("seed failed");
  org = a;
});

afterAll(async () => {
  await t.close();
});

describe("question_set_versions", () => {
  it("rejects any change to a published version's spec", async () => {
    const changed = { ...SEED_SPEC, model: "jev-latest" };
    expect(await pgErrorOf(
      inOrg((tx) => repos.questionSetVersions.update(tx, org.publishedVersionId, { spec: changed })),
    )).toMatch(/immutable_version/);
    const v = await inOrg((tx) => repos.questionSetVersions.get(tx, org.publishedVersionId));
    expect(v?.spec.model).toBe("jev-1.13.0");
  });

  it("rejects publishing metadata changes on a published version", async () => {
    expect(await pgErrorOf(
      inOrg((tx) => repos.questionSetVersions.update(tx, org.publishedVersionId, { changelog: "rewritten" })),
    )).toMatch(/immutable_version/);
  });

  it("rejects deleting a published version", async () => {
    expect(await pgErrorOf(inOrg((tx) => repos.questionSetVersions.delete(tx, org.publishedVersionId)))).toMatch(/immutable_version/);
  });

  it("lets a draft change, and allows only one draft per set", async () => {
    const updated = await inOrg((tx) =>
      repos.questionSetVersions.update(tx, org.draftVersionId, { changelog: "wip", specHash: "sha256:wip" }),
    );
    expect(updated?.changelog).toBe("wip");
    expect(await pgErrorOf(
      inOrg((tx) =>
        repos.questionSetVersions.insert(tx, {
          setId: org.setId,
          version: 3,
          spec: SEED_SPEC,
          specHash: "h",
          interfaceHash: "h",
          interfaceMajor: 1,
          model: "jev-1.13.0",
          source: "api",
        }),
      ),
    )).toMatch(/question_set_versions_one_draft_idx/);
  });

  it("allows archiving a published version and nothing else, then freezes it", async () => {
    const v3 = await inOrg(async (tx) => {
      const row = await repos.questionSetVersions.insert(tx, {
        setId: org.setId,
        version: 50,
        status: "published",
        spec: SEED_SPEC,
        specHash: "h50",
        interfaceHash: "h",
        interfaceMajor: 1,
        model: "jev-1.13.0",
        source: "api",
      });
      return row.id;
    });
    const archived = await inOrg((tx) => repos.questionSetVersions.update(tx, v3, { status: "archived" }));
    expect(archived?.status).toBe("archived");
    expect(await pgErrorOf(inOrg((tx) => repos.questionSetVersions.update(tx, v3, { status: "published" })))).toMatch(
      /immutable_version/,
    );
  });

  it("holds even for a raw UPDATE that skips the repository", async () => {
    expect(await pgErrorOf(
      inOrg((tx) =>
        drizzleOf(tx).execute(sql`update question_set_versions set spec = '{}'::jsonb where status = 'published'`),
      ),
    )).toMatch(/immutable_version/);
  });
});

describe("dataset_cases", () => {
  it("never changes a case's split", async () => {
    const id = await inOrg(async (tx) => {
      const ds = await repos.datasets.insert(tx, { setId: org.setId, name: "splits" });
      const c = await repos.datasetCases.insert(tx, {
        datasetId: ds.id,
        state: {},
        stateHash: "h",
        expected: {},
        source: "manual",
        labelSource: "reviewer",
        split: "test",
      });
      return c.id;
    });
    expect(await pgErrorOf(inOrg((tx) => repos.datasetCases.update(tx, id, { split: "drafting" })))).toMatch(/immutable_split/);
    expect((await inOrg((tx) => repos.datasetCases.update(tx, id, { tags: ["ok"] })))?.tags).toEqual(["ok"]);
  });
});

describe("append-only tables", () => {
  it("audit_log: the app role cannot update or delete", async () => {
    await inOrg((tx) =>
      repos.auditLog.insert(tx, { actorType: "system", client: "job", action: "t.x", targetType: "t", targetId: "1" }),
    );
    expect(await pgErrorOf(inOrg((tx) => drizzleOf(tx).execute(sql`update audit_log set action = 'forged'`)))).toMatch(/permission denied/);
    expect(await pgErrorOf(inOrg((tx) => drizzleOf(tx).execute(sql`delete from audit_log`)))).toMatch(/permission denied/);
  });

  it("audit_log and dataset_snapshots repositories have no update or delete", () => {
    expect("update" in repos.auditLog).toBe(false);
    expect("delete" in repos.auditLog).toBe(false);
    expect("update" in repos.datasetSnapshots).toBe(false);
    expect("delete" in repos.datasetSnapshots).toBe(false);
  });

  it("dataset_snapshots: the app role cannot update", async () => {
    expect(await pgErrorOf(
      inOrg((tx) => drizzleOf(tx).execute(sql`update dataset_snapshots set snapshot_hash = 'x'`)),
    )).toMatch(/permission denied/);
  });
});
