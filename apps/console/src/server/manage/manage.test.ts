// The D2c management operations through runOperation, on PGlite as the app role: sets, drafts,
// versions, publish, rollback, rollout, runs, usage, the manifest and approvals. A test that
// publishes or moves a stage makes its own set, so the order of tests does not matter.

import type { OperationId, QuestionSetSpec, Scope, TenantContext } from "@bandwise/core";
import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateBearer } from "../auth/bearer";
import { OperationError } from "../operations/errors";
import { runOperation, type OperationDeps, type RunOperationOptions } from "../operations/run-operation";

const hasher = createTokenHasher("pepper-".repeat(6));
const NICK = "nick@internal.test";
const PJ = "pj@internal.test";
const VIC = "vic@internal.test";

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
let deps: OperationDeps;
let n = 0;

const sys = (orgId: string): TenantContext => ({ orgId, actor: { type: "system" }, client: "job", plan: "internal", requestId: "test" });

function session(org: SeededOrg, email: string, role: "owner" | "editor" | "viewer"): TenantContext {
  const userId = org.userIds[email];
  if (userId === undefined) throw new Error(`no user ${email}`);
  return { orgId: org.orgId, actor: { type: "user", userId, role, platformRole: null, impersonatorId: null }, client: "console", plan: "internal", requestId: "req-session" };
}

/** An agent token row and the context bearer auth builds for it. */
async function agent(org: SeededOrg, opts: { scopes: Scope[]; email?: string; roleCeiling?: "admin" | "editor" | "viewer"; setIds?: string[] | null }) {
  const userId = org.userIds[opts.email ?? Object.keys(org.userIds)[0] ?? ""] ?? "";
  const { token, hash } = hasher.mint("sa_live_", org.orgId);
  const row = await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.agentTokens.insert(tx, {
      userId,
      name: "cli",
      client: "cli",
      hash,
      scopes: opts.scopes,
      roleCeiling: opts.roleCeiling ?? "admin",
      setIds: opts.setIds ?? null,
      expiresAt: new Date(Date.now() + 86_400_000),
    }),
  );
  const auth = await authenticateBearer(`Bearer ${token}`, { db: t.db, hasher, now: () => new Date(), requestId: "req-agent" });
  return { token, tokenId: row.id, ctx: auth.ctx };
}

function op<K extends OperationId>(id: K, ctx: TenantContext, input: unknown, options: RunOperationOptions = {}) {
  return runOperation(id, ctx as never, input, options, deps);
}

/** The output of an "ok" result, or a failure naming what came back. */
async function ok<T = Record<string, unknown>>(p: Promise<{ kind: string }>): Promise<T> {
  const r = (await p) as { kind: string; output?: unknown };
  if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
  return r.output as T;
}

async function refused(p: Promise<unknown>): Promise<OperationError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (!(e instanceof OperationError)) throw new Error(`expected an OperationError, got ${String(e)}`);
  return e;
}

async function auditRows(org: SeededOrg, action: string) {
  const page = await t.db.withTenant(sys(org.orgId), (tx) => repos.auditLog.list(tx, { limit: 200, cursor: null }));
  return page.data.filter((a) => a.action === action);
}

const owner = () => session(internal, NICK, "owner");

/** A fresh set copied from the seed's v1 and published once to production (stage shadow). */
async function liveSet(): Promise<{ slug: string; id: string }> {
  const slug = `set-${++n}`;
  const created = await ok<{ id: string; draft: { etag: string } }>(op("set.create", owner(), { slug, name: slug, goalId: internal.goalId, fromVersion: "inbox-triage@1" }));
  await ok(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "first" }, { ifMatch: `"${created.draft.etag}"` }));
  return { slug, id: created.id };
}

async function draftEtag(slug: string): Promise<string> {
  const r = await op("draft.get", owner(), { ref: slug });
  if (r.kind !== "ok" || r.etag === undefined) throw new Error("no etag");
  return r.etag;
}

async function editDraft(slug: string, change: (spec: QuestionSetSpec) => unknown): Promise<string> {
  const spec = await ok<QuestionSetSpec>(op("draft.get", owner(), { ref: slug }));
  const out = await ok<{ etag: string }>(op("draft.update", owner(), { ref: slug, spec: change(structuredClone(spec)) }, { ifMatch: await draftEtag(slug) }));
  return out.etag;
}

const relabel = (label: string) => (spec: QuestionSetSpec) => {
  const q = spec.stages[0]?.questions["needs_reply"];
  if (q !== undefined) q.meta = { ...q.meta, label };
  return spec;
};

async function stageOf(org: SeededOrg, setId: string) {
  return t.db.withTenant(sys(org.orgId), (tx) => repos.releasePointers.get(tx, setId, "production"));
}

beforeAll(async () => {
  t = await createTestDatabase();
  deps = { db: t.db };
  [internal, acme] = (await seedOrgs(t.db, [
    {
      slug: "internal",
      name: "Internal",
      members: [
        { email: NICK, name: "Nick", role: "owner" },
        { email: PJ, name: "PJ", role: "editor" },
        { email: VIC, name: "Vic", role: "viewer" },
      ],
    },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("sets and drafts", () => {
  it("lists and reads sets with their draft ETag and channels", async () => {
    const page = await ok<{ data: { slug: string }[] }>(op("set.list", owner(), {}));
    expect(page.data.map((s) => s.slug)).toContain("inbox-triage");
    const set = await ok<{ draft: { etag: string }; channels: { channel: string; version: number; stage: string }[] }>(op("set.get", owner(), { ref: "inbox-triage" }));
    expect(set.draft.etag).toBe("sha256:seed-v2");
    expect(set.channels).toEqual([expect.objectContaining({ channel: "production", version: 1, stage: "shadow" })]);
  });

  it("creates a set with a starter draft and an audit row", async () => {
    const out = await ok<{ id: string; slug: string; draft: { version: number }; channels: unknown[] }>(
      op("set.create", session(internal, PJ, "editor"), { slug: "fresh", name: "Fresh", goalId: internal.goalId }),
    );
    expect(out).toMatchObject({ slug: "fresh", draft: { version: 1 }, channels: [] });
    const rows = await auditRows(internal, "set.create");
    expect(rows.find((r) => r.targetId === out.id)).toMatchObject({ actorType: "user", client: "console", actorRole: "editor", targetType: "question_set" });
    expect((await refused(op("set.create", owner(), { slug: "fresh", name: "Again", goalId: internal.goalId }))).code).toBe("already_exists");
  });

  it("refuses a slug shaped like an id, which no lookup could reach", async () => {
    const e = await refused(op("set.create", owner(), { slug: "123e4567-e89b-12d3-a456-426614174000", name: "Id", goalId: internal.goalId }));
    expect(e).toMatchObject({ code: "invalid_request", details: [expect.objectContaining({ path: "/slug" })] });
  });

  it("refuses set.create to a viewer and to a token without sets:write", async () => {
    const viewer = await refused(op("set.create", session(internal, VIC, "viewer"), { slug: "nope", name: "Nope", goalId: internal.goalId }));
    expect(viewer.code).toBe("insufficient_scope");
    const reader = await agent(internal, { scopes: ["sets:read"] });
    const e = await refused(op("set.create", reader.ctx, { slug: "nope", name: "Nope", goalId: internal.goalId }));
    expect(e).toMatchObject({ code: "insufficient_scope", requiredScope: "sets:write" });
  });

  it("replaces the draft with If-Match, returns the new ETag and writes an audit row", async () => {
    const { slug } = await liveSet();
    const before = await draftEtag(slug);
    const etag = await editDraft(slug, relabel("Changed"));
    expect(etag).not.toBe(before);
    expect(await draftEtag(slug)).toBe(etag);
    const rows = await auditRows(internal, "draft.update");
    expect(rows.some((r) => (r.diff as { slug?: string }).slug === slug && (r.diff as { to?: string }).to === etag)).toBe(true);
  });

  it("answers 412 with currentEtag when If-Match is stale, and 428 when it is missing", async () => {
    const { slug } = await liveSet();
    const spec = await ok<QuestionSetSpec>(op("draft.get", owner(), { ref: slug }));
    const current = await draftEtag(slug);
    const stale = await refused(op("draft.update", owner(), { ref: slug, spec }, { ifMatch: '"sha256:old"' }));
    expect(stale).toMatchObject({ code: "precondition_failed", status: 412, currentEtag: current });
    expect((await refused(op("draft.update", owner(), { ref: slug, spec }))).code).toBe("precondition_required");
  });

  it("reports a rollout key with a message naming rollout.change", async () => {
    const spec = await ok<QuestionSetSpec>(op("draft.get", owner(), { ref: "inbox-triage" }));
    const e = await refused(op("draft.update", owner(), { ref: "inbox-triage", spec: { ...spec, rollout: "full" } }, { ifMatch: "x" }));
    expect(e.code).toBe("invalid_request");
    expect(e.details).toContainEqual(expect.objectContaining({ path: "/rollout", message: expect.stringContaining("rollout.change") }));
  });

  it("validates a spec without writing", async () => {
    const spec = await ok<QuestionSetSpec>(op("draft.get", owner(), { ref: "inbox-triage" }));
    expect(await ok(op("draft.validate", owner(), { ref: "inbox-triage" }))).toEqual({ errors: [], warnings: expect.any(Array) });
    const bad = await ok<{ errors: { rule: string }[] }>(
      op("draft.validate", owner(), { ref: "inbox-triage", spec: { ...spec, policies: { needs_reply: { ...spec.policies["needs_reply"], noul: { trueAt: 0.6, falseAt: 0.5, reviewMargin: 0.1 } } } } }),
    );
    expect(bad.errors.map((e) => e.rule)).toContain("policy.noul_order");
    expect((await ok<{ errors: unknown[] }>(op("draft.validate", owner(), { ref: "inbox-triage", spec: { model: 1 } }))).errors.length).toBeGreaterThan(0);
  });

  it("hides another org's set and a set outside the token's allowlist behind the same 404", async () => {
    const missing = await refused(op("set.get", owner(), { ref: "no-such-set" }));
    const crossOrg = await refused(op("set.get", owner(), { ref: acme.setId }));
    const narrow = await agent(internal, { scopes: ["sets:read"], setIds: [crypto.randomUUID()] });
    const outside = await refused(op("set.get", narrow.ctx, { ref: "inbox-triage" }));
    expect([missing.code, crossOrg.code, outside.code]).toEqual(["not_found", "not_found", "not_found"]);
    expect(outside.message).toBe("No set inbox-triage is visible to this caller.");
    expect((await ok<{ data: unknown[] }>(op("set.list", narrow.ctx, {}))).data).toEqual([]);
  });
});

describe("publish, versions and rollback", () => {
  it("publishes the draft as a new version, keeps the stage, opens a new draft and audits it", async () => {
    const { slug, id } = await liveSet();
    await editDraft(slug, relabel("v2"));
    const out = await ok<{ version: number }>(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "relabel" }, { ifMatch: await draftEtag(slug) }));
    expect(out.version).toBe(2);
    const set = await ok<{ draft: { version: number }; channels: { version: number; stage: string }[] }>(op("set.get", owner(), { ref: slug }));
    expect(set.draft.version).toBe(3);
    expect(set.channels).toEqual([expect.objectContaining({ version: 2, stage: "shadow" })]);
    const rows = await auditRows(internal, "set.publish");
    expect(rows.find((r) => (r.diff as { setId?: string; version?: number }).setId === id && (r.diff as { version?: number }).version === 2)).toBeDefined();

    const versions = await ok<{ data: { version: number; status: string }[] }>(op("version.list", owner(), { ref: slug }));
    expect(versions.data.map((v) => v.version)).toEqual([2, 1]);
    const v2 = await ok<{ spec: QuestionSetSpec; changelog: string }>(op("version.get", owner(), { ref: slug, n: "2" }));
    expect(v2.changelog).toBe("relabel");
    const diff = await ok<{ changes: { path: string; op: string }[] }>(op("version.diff", owner(), { ref: slug, from: "1", to: "production" }));
    expect(diff.changes).toEqual([expect.objectContaining({ path: "/stages/0/questions/needs_reply/meta/label", op: "replace" })]);
  });

  it("creates nothing when the draft equals what the channel serves", async () => {
    const { slug } = await liveSet();
    const before = (await auditRows(internal, "set.publish")).length;
    const out = await ok<{ version: number }>(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "again" }, { ifMatch: await draftEtag(slug) }));
    expect(out.version).toBe(1);
    expect((await auditRows(internal, "set.publish")).length).toBe(before);
  });

  it("starts a channel's first pointer at shadow", async () => {
    const { slug } = await liveSet();
    await editDraft(slug, relabel("staging"));
    await ok(op("set.publish", owner(), { ref: slug, channel: "staging", changelog: "to staging" }, { ifMatch: await draftEtag(slug) }));
    const set = await ok<{ channels: { channel: string; stage: string }[] }>(op("set.get", owner(), { ref: slug }));
    expect(set.channels.find((c) => c.channel === "staging")?.stage).toBe("shadow");
  });

  it("refuses a draft with lint errors with 422 spec_invalid", async () => {
    const { slug } = await liveSet();
    await editDraft(slug, (spec) => {
      const p = spec.policies["needs_reply"];
      if (p?.type === "noul") p.noul = { trueAt: 0.6, falseAt: 0.5, reviewMargin: 0.1 };
      return spec;
    });
    const e = await refused(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "bad" }, { ifMatch: await draftEtag(slug) }));
    expect(e.code).toBe("spec_invalid");
    expect(e.details?.map((d) => d.rule)).toContain("policy.noul_order");
  });

  it("previews a publish with ?dryRun and writes nothing", async () => {
    const { slug } = await liveSet();
    await editDraft(slug, relabel("preview"));
    const r = await op("set.publish", owner(), { ref: slug, channel: "production", changelog: "p" }, { ifMatch: await draftEtag(slug), dryRun: true });
    expect(r.kind).toBe("dryRun");
    if (r.kind !== "dryRun") return;
    expect(r.preview).toMatchObject({ approvalRequired: false, gates: [], lints: [] });
    expect(r.preview.diff.changes.length).toBe(1);
    expect((await ok<{ data: unknown[] }>(op("version.list", owner(), { ref: slug }))).data).toHaveLength(1);
  });

  it("rolls back to the previous version, then further back, never toggling", async () => {
    const { slug, id } = await liveSet();
    for (const label of ["v2", "v3"]) {
      await editDraft(slug, relabel(label));
      await ok(op("set.publish", owner(), { ref: slug, channel: "production", changelog: label }, { ifMatch: await draftEtag(slug) }));
    }
    expect(await ok(op("channel.rollback", owner(), { ref: slug, channel: "production" }))).toMatchObject({ fromVersion: 3, toVersion: 2 });
    expect(await ok(op("channel.rollback", owner(), { ref: slug, channel: "production" }))).toMatchObject({ fromVersion: 2, toVersion: 1 });
    expect((await refused(op("channel.rollback", owner(), { ref: slug, channel: "production" }))).code).toBe("invalid_request");
    expect((await stageOf(internal, id))?.rolloutStage).toBe("shadow");
    expect((await auditRows(internal, "channel.rollback")).filter((r) => r.targetId === id)).toHaveLength(2);
  });

  it("refuses a rollback to a newer version or one this channel never served", async () => {
    const { slug } = await liveSet();
    await editDraft(slug, relabel("staging only"));
    await ok(op("set.publish", owner(), { ref: slug, channel: "staging", changelog: "v2" }, { ifMatch: await draftEtag(slug) }));
    await editDraft(slug, relabel("v3"));
    await ok(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "v3" }, { ifMatch: await draftEtag(slug) }));
    await ok(op("rollout.change", owner(), { ref: slug, channel: "production", stage: "full", reason: "live" }));
    const bot = await agent(internal, { scopes: ["release:production"] });
    // v2 is older but was only ever on staging.
    expect((await refused(op("channel.rollback", bot.ctx, { ref: slug, channel: "production", toVersion: 2 }))).code).toBe("invalid_request");
    expect(await ok(op("channel.rollback", owner(), { ref: slug, channel: "production", toVersion: 1 }))).toMatchObject({ fromVersion: 3, toVersion: 1 });
    // A person rolled v3 back; an agent cannot put it live again through rollback.
    const forward = await refused(op("channel.rollback", bot.ctx, { ref: slug, channel: "production", toVersion: 3 }));
    expect(forward.code).toBe("invalid_request");
    expect((await ok<{ channels: { channel: string; version: number }[] }>(op("set.get", owner(), { ref: slug }))).channels.find((c) => c.channel === "production")?.version).toBe(1);
  });

  it("never gates a rollback, even for an agent on a controlled production channel", async () => {
    const { slug, id } = await liveSet();
    await editDraft(slug, relabel("v2"));
    await ok(op("set.publish", owner(), { ref: slug, channel: "production", changelog: "v2" }, { ifMatch: await draftEtag(slug) }));
    await ok(op("rollout.change", owner(), { ref: slug, channel: "production", stage: "controlled", reason: "a week of receipts" }));
    const bot = await agent(internal, { scopes: ["release:production"] });
    const r = await op("channel.rollback", bot.ctx, { ref: slug, channel: "production" });
    expect(r.kind).toBe("ok");
    const rows = (await auditRows(internal, "channel.rollback")).filter((a) => a.targetId === id);
    expect(rows[0]).toMatchObject({ actorType: "agent", actorTokenId: bot.tokenId, client: "cli", approvalId: null });
  });
});

describe("rollout", () => {
  it("moves a stage, refuses a moving model past shadow and treats the same stage as a no-op", async () => {
    const { slug, id } = await liveSet();
    expect(await ok(op("rollout.get", owner(), { ref: slug, channel: "production" }))).toMatchObject({ stage: "shadow", version: 1, gates: [] });
    expect(await ok(op("rollout.change", owner(), { ref: slug, channel: "production", stage: "controlled", reason: "go" }))).toMatchObject({ from: "shadow", to: "controlled" });
    expect((await stageOf(internal, id))?.rolloutStage).toBe("controlled");
    const before = (await auditRows(internal, "rollout.change")).length;
    await ok(op("rollout.change", owner(), { ref: slug, channel: "production", stage: "controlled", reason: "again" }));
    expect((await auditRows(internal, "rollout.change")).length).toBe(before);

    const moving = await liveSet();
    await editDraft(moving.slug, (spec) => ({ ...spec, model: "jev-latest" }));
    await ok(op("set.publish", owner(), { ref: moving.slug, channel: "production", changelog: "alias" }, { ifMatch: await draftEtag(moving.slug) }));
    const e = await refused(op("rollout.change", owner(), { ref: moving.slug, channel: "production", stage: "controlled", reason: "go" }));
    expect(e.code).toBe("spec_invalid");
    expect(e.details?.[0]?.rule).toBe("model.alias_past_shadow");
  });

  it("needs an admin to enter full", async () => {
    const { slug } = await liveSet();
    const e = await refused(op("rollout.change", session(internal, PJ, "editor"), { ref: slug, channel: "production", stage: "full", reason: "go" }));
    expect(e.code).toBe("insufficient_scope");
  });
});

describe("approvals", () => {
  it("turns a gated agent rollout into a pending approval, reuses it on replay, and runs it once approved", async () => {
    const { slug, id } = await liveSet();
    const bot = await agent(internal, { scopes: ["release:production", "sets:read"], email: PJ, roleCeiling: "editor" });
    const input = { ref: slug, channel: "production", stage: "controlled", reason: "receipts look good" };
    const first = await op("rollout.change", bot.ctx, input);
    expect(first.kind).toBe("approval");
    if (first.kind !== "approval") return;
    expect(first.accepted.approval).toMatchObject({ status: "pending", url: `https://app.bandwise.dev/approvals/${first.accepted.approval.id}` });
    expect((await stageOf(internal, id))?.rolloutStage).toBe("shadow");
    const again = await op("rollout.change", bot.ctx, input);
    expect(again.kind === "approval" && again.accepted.approval.id).toBe(first.accepted.approval.id);

    const approvalId = first.accepted.approval.id;
    const inbox = await ok<{ data: { id: string }[] }>(op("approval.list", owner(), {}));
    expect(inbox.data.map((a) => a.id)).toContain(approvalId);
    expect((await ok<{ data: { id: string }[] }>(op("approval.list", bot.ctx, {}))).data.map((a) => a.id)).toEqual([approvalId]);
    // No token can decide.
    expect((await refused(op("approval.decide", bot.ctx, { id: approvalId, decision: "approved" }))).code).toBe("insufficient_scope");

    const decided = await ok<{ status: string; result: unknown }>(op("approval.decide", owner(), { id: approvalId, decision: "approved" }));
    expect(decided.status).toBe("executed");
    expect(decided.result).toMatchObject({ ok: true, response: { from: "shadow", to: "controlled" } });
    expect((await stageOf(internal, id))?.rolloutStage).toBe("controlled");
    const run = (await auditRows(internal, "rollout.change")).find((r) => r.targetId === id && r.approvalId === approvalId && r.targetType === "question_set");
    expect(run).toMatchObject({ actorType: "agent", actorTokenId: bot.tokenId, actorRole: "editor" });
    expect((await auditRows(internal, "approval.decide")).some((r) => r.targetId === approvalId)).toBe(true);
    expect((await ok<{ status: string }>(op("approval.get", bot.ctx, { id: approvalId }))).status).toBe("executed");
    // A role that cannot decide it cannot read it either, the same 404 as a missing id.
    expect((await refused(op("approval.get", session(internal, VIC, "viewer"), { id: approvalId }))).code).toBe("not_found");
    expect((await ok<{ status: string }>(op("approval.get", owner(), { id: approvalId }))).status).toBe("executed");
    expect((await refused(op("approval.decide", owner(), { id: approvalId, decision: "approved" }))).code).toBe("invalid_request");
  });

  it("runs nothing when a person rejects", async () => {
    const { slug, id } = await liveSet();
    const bot = await agent(internal, { scopes: ["release:production"] });
    const r = await op("rollout.change", bot.ctx, { ref: slug, channel: "production", stage: "controlled", reason: "try" });
    if (r.kind !== "approval") throw new Error("expected an approval");
    const decided = await ok<{ status: string }>(op("approval.decide", owner(), { id: r.accepted.approval.id, decision: "rejected", note: "not yet" }));
    expect(decided.status).toBe("rejected");
    expect((await stageOf(internal, id))?.rolloutStage).toBe("shadow");
  });

  it("never gates a pause, and a gated publish whose draft changed fails with 412 when approved", async () => {
    const { slug, id } = await liveSet();
    await ok(op("rollout.change", owner(), { ref: slug, channel: "production", stage: "controlled", reason: "go" }));
    const bot = await agent(internal, { scopes: ["release:production"] });

    await editDraft(slug, relabel("agent edit"));
    const etag = await draftEtag(slug);
    const publish = await op("set.publish", bot.ctx, { ref: slug, channel: "production", changelog: "agent publish" }, { ifMatch: etag });
    if (publish.kind !== "approval") throw new Error("expected an approval");
    // A person edits the draft before anyone approves: the stored If-Match is now stale.
    await editDraft(slug, relabel("human edit"));
    const decided = await ok<{ status: string; result: unknown }>(op("approval.decide", owner(), { id: publish.accepted.approval.id, decision: "approved" }));
    expect(decided).toMatchObject({ status: "approved", result: { ok: false, error: { code: "precondition_failed" } } });
    expect((await ok<{ data: unknown[] }>(op("version.list", owner(), { ref: slug }))).data).toHaveLength(1);

    const pause = await op("rollout.change", bot.ctx, { ref: slug, channel: "production", stage: "paused", reason: "incident" });
    expect(pause.kind).toBe("ok");
    expect((await stageOf(internal, id))?.rolloutStage).toBe("paused");
    // Lifting the pause is gated again.
    expect((await op("rollout.change", bot.ctx, { ref: slug, channel: "production", stage: "shadow", reason: "over" })).kind).toBe("approval");
  });

  it("stores the error when the requesting token is revoked before approval", async () => {
    const { slug, id } = await liveSet();
    const bot = await agent(internal, { scopes: ["release:production"] });
    const r = await op("rollout.change", bot.ctx, { ref: slug, channel: "production", stage: "controlled", reason: "go" });
    if (r.kind !== "approval") throw new Error("expected an approval");
    await t.db.withTenant(sys(internal.orgId), (tx) => repos.agentTokens.update(tx, bot.tokenId, { revokedAt: new Date() }));
    const decided = await ok<{ result: unknown }>(op("approval.decide", owner(), { id: r.accepted.approval.id, decision: "approved" }));
    expect(decided.result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect((await stageOf(internal, id))?.rolloutStage).toBe("shadow");
  });

  it("reports approvalRequired in a dry run and stores nothing", async () => {
    const { slug } = await liveSet();
    const bot = await agent(internal, { scopes: ["release:production"] });
    const r = await op("rollout.change", bot.ctx, { ref: slug, channel: "production", stage: "full", reason: "go" }, { dryRun: true });
    expect(r.kind === "dryRun" && r.preview.approvalRequired).toBe(true);
    expect((await ok<{ data: unknown[] }>(op("approval.list", bot.ctx, {}))).data).toEqual([]);
  });
});

describe("runs, usage and the manifest", () => {
  async function insertRun(org: SeededOrg, band: "high" | "low", cost: number) {
    const id = crypto.randomUUID();
    await t.db.withTenant(sys(org.orgId), (tx) =>
      repos.runs.insert(tx, {
        id,
        projectId: org.projectId,
        setId: org.setId,
        versionId: org.publishedVersionId,
        channel: "production",
        rollout: "shadow",
        source: "api",
        keyMode: "platform",
        modelRequested: "jev-1.13.0",
        interfaceMajor: 1,
        state: { text: "hi" },
        stateHash: "sha256:x",
        stages: [],
        runBand: band,
        overallAction: band === "high" ? "auto" : "review",
        inputTokens: 10,
        outputTokens: 1,
        systemOneCostMicroUsd: cost,
        systemOneCalls: 1,
        cfInputTokens: 100,
        cfOutputTokens: 10,
        counterfactualMicroUsd: cost * 10,
        counterfactualMode: "one_call",
        comparatorModel: "claude-haiku-4-5",
        savingsMicroUsd: cost * 9,
        savingsKind: "decision",
        escalationCostMicroUsd: 0,
        llmCallsMade: 0,
        llmCallsAvoided: 1,
        latencyMs: 5,
        status: "ok",
      }),
    );
    return id;
  }

  it("refuses a malformed cursor on every list with 400, before any SQL", async () => {
    const { slug } = await liveSet();
    const lists: [OperationId, Record<string, unknown>][] = [
      ["set.list", {}],
      ["version.list", { ref: slug }],
      ["run.list", {}],
      ["review.list", {}],
      ["approval.list", {}],
    ];
    for (const [id, input] of lists) {
      for (const cursor of ["not-a-cursor", "1; drop table runs"]) {
        expect((await refused(op(id, owner(), { ...input, cursor }))).code).toBe("invalid_request");
      }
    }
  });

  it("lists runs newest first with filters and cursors, reads one, and sums usage per set", async () => {
    const a = await insertRun(internal, "high", 7);
    const b = await insertRun(internal, "low", 3);
    await insertRun(acme, "high", 1000);
    const all = await ok<{ data: { id: string; state?: unknown }[] }>(op("run.list", owner(), { set: "inbox-triage" }));
    expect(all.data.map((r) => r.id)).toEqual(expect.arrayContaining([a, b]));
    expect(all.data[0]).not.toHaveProperty("state");
    const low = await ok<{ data: { id: string }[] }>(op("run.list", owner(), { band: "low" }));
    expect(low.data.map((r) => r.id)).toEqual([b]);
    const first = await ok<{ data: { id: string }[]; nextCursor: string }>(op("run.list", owner(), { limit: "1" }));
    const second = await ok<{ data: { id: string }[]; nextCursor: string | null }>(op("run.list", owner(), { limit: "1", cursor: first.nextCursor }));
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    // a and b can share created_at, so only the set of ids is fixed, not their order.
    expect([...first.data, ...second.data].map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(second.nextCursor).toBeNull();

    const one = await ok<{ state: unknown; reviewItems: unknown[] }>(op("run.get", owner(), { id: a }));
    expect(one).toMatchObject({ state: { text: "hi" }, reviewItems: [] });
    expect((await refused(op("run.get", owner(), { id: crypto.randomUUID() }))).code).toBe("not_found");

    const usage = await ok<{ sets: { slug: string; runs: number; systemOneCostMicroUsd: number; bandLow: number }[]; totals: { runs: number } }>(op("usage.get", owner(), {}));
    expect(usage.sets).toEqual([expect.objectContaining({ slug: "inbox-triage", runs: 2, systemOneCostMicroUsd: 10, bandLow: 1 })]);
    expect(usage.totals.runs).toBe(2);
  });

  it("gives an app token the manifest only, never instructions or thresholds", async () => {
    const { token } = hasher.mint("sk_live_", internal.orgId);
    await t.db.withTenant(sys(internal.orgId), (tx) =>
      repos.appTokens.insert(tx, { appId: internal.appId, kind: "secret", prefix: "sk_live_", hash: hasher.hash(token), scopes: ["sets:read", "run"], setIds: null, channel: "production" }),
    );
    const app = await authenticateBearer(`Bearer ${token}`, { db: t.db, hasher, now: () => new Date(), requestId: "req-app" });
    const manifest = await ok<Record<string, unknown>>(op("set.manifest", app.ctx, { ref: "inbox-triage" }));
    expect(manifest).toMatchObject({ slug: "inbox-triage", version: 1, channel: "production", questions: [{ id: "needs_reply", type: "noul", label: "Needs a reply" }] });
    const version = await ok<Record<string, unknown>>(op("version.get", app.ctx, { ref: "inbox-triage", n: "1" }));
    expect(version).not.toHaveProperty("spec");
    expect(JSON.stringify(version)).not.toContain("instructions");
    expect((await refused(op("set.manifest", app.ctx, { ref: "inbox-triage@draft" }))).code).toBe("insufficient_scope");
    expect((await refused(op("draft.get", app.ctx, { ref: "inbox-triage" }))).code).toBe("insufficient_scope");
  });
});
