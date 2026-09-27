// RunSink over the repositories: one transaction for the run row, review items, label items, usage
// events and alias observations.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RunResult, type RunSinkRecord, type TenantContext } from "@bandwise/core/contracts";

import { platformRepositories, repos } from "./repos/index.js";
import { createRunSink, type LabelSelector, RunSinkSetNotFoundError } from "./run-sink.js";
import { seedOrgs, systemContext, TWO_ORG_SEED, type SeededOrg } from "./seed.js";
import { createTestDatabase, type TestDatabase } from "./testing/harness.js";

const SAMPLE = RunResult.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../core/src/contracts/__fixtures__/run-result.sample.json", import.meta.url)),
      "utf8",
    ),
  ),
);

const NOW = new Date("2026-09-26T12:00:00.000Z");

let t: TestDatabase;
let A: SeededOrg;
let B: SeededOrg;

beforeAll(async () => {
  t = await createTestDatabase();
  const [a, b] = await seedOrgs(t.db, TWO_ORG_SEED);
  if (a === undefined || b === undefined) throw new Error("seed failed");
  A = a;
  B = b;
});

afterAll(async () => {
  await t.close();
});

function userCtx(org: SeededOrg): TenantContext {
  const userId = Object.values(org.userIds)[0] ?? "";
  return {
    orgId: org.orgId,
    actor: { type: "user", userId, role: "owner", platformRole: null, impersonatorId: null },
    client: "console",
    plan: "internal",
    requestId: "req-test",
  };
}

function record(org: SeededOrg, overrides: Partial<RunResult> = {}, rest: Partial<RunSinkRecord> = {}): RunSinkRecord {
  const result: RunResult = {
    ...SAMPLE,
    runId: crypto.randomUUID(),
    setId: org.setId,
    versionId: org.publishedVersionId,
    version: 1,
    reviewItemIds: undefined,
    ...overrides,
  };
  const stages = result.stages.map((s) => ({
    id: s.id,
    skipped: s.skipped,
    inputTokens: s.calls.reduce((n, c) => n + c.inputTokens, 0),
    outputTokens: s.calls.reduce((n, c) => n + c.outputTokens, 0),
    latencyMs: s.calls.reduce((n, c) => n + c.latencyMs, 0),
    typesafeRequestId: s.calls[0]?.typesafeRequestId ?? null,
  }));
  return {
    result,
    request: {
      setRef: org.setSlug,
      state: { text: "hi" },
      source: "api",
      options: { externalRef: `ext-${result.runId}` },
    },
    state: { text: "hi" },
    stateHash: "sha256:state",
    stages,
    keyMode: "platform",
    provider: "typesafe",
    parentRunId: null,
    ...rest,
  };
}

const sink = () => createRunSink({ db: t.db, clock: () => NOW });

describe("RunSink.persist", () => {
  it("writes the run row with every RunResult field mapped", async () => {
    const rec = record(A);
    await sink().persist(userCtx(A), rec);
    const row = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.runs.get(tx, rec.result.runId));
    expect(row).toMatchObject({
      orgId: A.orgId,
      projectId: A.projectId,
      setId: A.setId,
      versionId: A.publishedVersionId,
      channel: "production",
      rollout: "full",
      source: "api",
      actorUserId: userCtx(A).actor.type === "user" ? Object.values(A.userIds)[0] : null,
      keyMode: "platform",
      systemOneProvider: "typesafe",
      modelRequested: "jev-1.13.0",
      modelResolved: "jev-1.13.0",
      typesafeRequestId: "req_01J9Z3QK4T",
      externalRef: `ext-${rec.result.runId}`,
      stateHash: "sha256:state",
      runBand: "medium",
      overallAction: "review",
      route: "urgent",
      inputTokens: 318,
      outputTokens: 0,
      systemOneCostMicroUsd: 13,
      systemOneCalls: 1,
      cfInputTokens: 318,
      cfOutputTokens: 180,
      counterfactualMicroUsd: 1218,
      savingsMicroUsd: 1205,
      savingsKind: "decision",
      savingsSuppressed: null,
      escalationCostMicroUsd: 0,
      llmCallsAvoided: 1,
      latencyMs: 431,
      status: "ok",
      errorCode: null,
      parentRunId: null,
    });
    expect(row?.answers).toEqual(rec.result.answers);
    expect(row?.decisions).toEqual(rec.result.decisions);
    expect(row?.stages).toEqual(rec.result.stages);
    expect(row?.createdAt.toISOString()).toBe(NOW.toISOString());
  });

  it("creates one action review item per relevant review decision, and returns their ids", async () => {
    const rec = record(A);
    const out = await sink().persist(userCtx(A), rec);
    const items = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.reviewItems.listByRun(tx, rec.result.runId));
    expect(items.map((i) => i.decisionId).sort()).toEqual(["someone_waiting", "work_type"]);
    expect(items.every((i) => i.kind === "action" && i.reason === "action" && i.status === "open")).toBe(true);
    expect(out.reviewItemIds.sort()).toEqual(items.map((i) => i.id).sort());
    expect(out.labelItemIds).toEqual([]);
  });

  it("writes run and system_one_cost usage events with the resolved model in platform key mode", async () => {
    const rec = record(A, { modelRequested: "jev-latest" });
    await sink().persist(userCtx(A), rec);
    const events = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.usageEvents.listByRun(tx, rec.result.runId));
    expect(events.map((e) => [e.kind, e.quantity, e.model, e.provider, e.keyMode, e.pushStatus]).sort()).toEqual([
      ["run", 1, "jev-1.13.0", "typesafe", "platform", "pending"],
      ["system_one_cost", 13, "jev-1.13.0", "typesafe", "platform", "pending"],
    ]);
  });

  it("meters no System One cost in BYO key mode, and eval runs as eval_run", async () => {
    const rec = record(A, {}, { keyMode: "byo" });
    rec.request = { ...rec.request, source: "eval" };
    await sink().persist(userCtx(A), rec);
    const events = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.usageEvents.listByRun(tx, rec.result.runId));
    expect(events.map((e) => e.kind)).toEqual(["eval_run"]);
  });

  it("writes no run usage event for a failed run", async () => {
    const rec = record(
      A,
      { status: "error", error: { code: "system_one_unavailable", message: "timeout" } },
      { keyMode: "byo" },
    );
    await sink().persist(userCtx(A), rec);
    const [row, events] = await t.db.withTenant(systemContext(A.orgId), async (tx) => [
      await repos.runs.get(tx, rec.result.runId),
      await repos.usageEvents.listByRun(tx, rec.result.runId),
    ] as const);
    expect(row?.errorCode).toBe("system_one_unavailable");
    expect(events).toEqual([]);
  });

  it("meters escalation spend as llm_cost", async () => {
    const base = record(A, {}, { keyMode: "byo" });
    const rec = record(A, { cost: { ...base.result.cost, escalationCostUsd: 0.0005, llmCallsMade: 1 } }, { keyMode: "byo" });
    await sink().persist(userCtx(A), rec);
    const events = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.usageEvents.listByRun(tx, rec.result.runId));
    expect(events.map((e) => [e.kind, e.quantity]).sort()).toEqual([
      ["llm_cost", 500],
      ["run", 1],
    ]);
  });

  it("records an alias observation when a moving name resolves to a build", async () => {
    const rec = record(A, { modelRequested: "jev-latest" });
    await sink().persist(userCtx(A), rec);
    const page = await t.db.withNoTenant((tx) =>
      platformRepositories.modelAliasObservations.list(tx, { limit: 50, cursor: null }),
    );
    expect(page.data.map((o) => [o.provider, o.alias, o.resolvedId])).toContainEqual([
      "typesafe",
      "jev-latest",
      "jev-1.13.0",
    ]);
  });

  it("picks label items through the injected selector, reusing action items for audits", async () => {
    const seen: number[] = [];
    const selector: LabelSelector = ({ labeledToday }) => {
      seen.push(labeledToday);
      return { select: true, reason: "audit", sampleRate: 0.05 };
    };
    const rec = record(A);
    const out = await createRunSink({ db: t.db, clock: () => NOW, rand: () => 0, selectForLabeling: selector }).persist(
      userCtx(A),
      rec,
    );
    const items = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.reviewItems.listByRun(tx, rec.result.runId));
    const labels = items.filter((i) => i.kind === "label");
    const actions = items.filter((i) => i.kind === "action");
    // Six relevant decisions: two reuse their action item, four get a label item.
    expect(labels).toHaveLength(4);
    expect(out.labelItemIds.sort()).toEqual(labels.map((i) => i.id).sort());
    expect(actions.every((i) => i.sampleRate === 0.05)).toBe(true);
    expect(labels.every((i) => i.reason === "audit" && i.sampleRate === 0.05)).toBe(true);
    const first = seen[0] ?? 0;
    expect(seen).toEqual([0, 1, 2, 3, 4, 5].map((k) => first + k));
  });

  it("creates no label items off the production channel", async () => {
    const selector: LabelSelector = () => ({ select: true, reason: "near_threshold", sampleRate: null });
    const rec = record(A, { channel: "staging" });
    const out = await createRunSink({ db: t.db, clock: () => NOW, selectForLabeling: selector }).persist(userCtx(A), rec);
    expect(out.labelItemIds).toEqual([]);
  });

  it("refuses a run whose set is in another org, and writes nothing", async () => {
    const rec = record(A);
    await expect(sink().persist(userCtx(B), rec)).rejects.toBeInstanceOf(RunSinkSetNotFoundError);
    const row = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.runs.get(tx, rec.result.runId));
    expect(row).toBeNull();
  });

  it("is one transaction: a failure after the run row rolls everything back", async () => {
    const rec = record(A);
    await sink().persist(userCtx(A), rec);
    // A replay of the same runId fails on the primary key; its review items must not survive.
    await expect(sink().persist(userCtx(A), rec)).rejects.toThrow();
    const items = await t.db.withTenant(systemContext(A.orgId), (tx) => repos.reviewItems.listByRun(tx, rec.result.runId));
    expect(items).toHaveLength(2);
  });

  it("rejects a record whose stage totals do not match the result", async () => {
    const rec = record(A);
    rec.stages = rec.stages.map((s) => ({ ...s, inputTokens: s.inputTokens + 1 }));
    await expect(sink().persist(userCtx(A), rec)).rejects.toThrow();
  });
});
