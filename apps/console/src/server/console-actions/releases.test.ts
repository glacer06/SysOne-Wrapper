// The Releases panel and Approvals page actions, through runOperation on PGlite as a signed-in
// member. Each test makes its own set, so the order does not matter.

import type { OperationId, QuestionSetSpec, TenantContext } from "@bandwise/core";
import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateBearer } from "../auth/bearer";
import { settle } from "../console-result";
import { runOperation, type OperationDeps, type RunOperationOptions } from "../operations/run-operation";
import { changeStage, checkPublish, checkRollback, decideApproval, diffSides, publishDraft, rollbackChannel, type Runner } from "./releases";

const NICK = "nick@internal.test";
const PJ = "pj@internal.test";
const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;
let deps: OperationDeps;
let n = 0;

function member(email: string, role: "owner" | "editor"): TenantContext {
  const userId = internal.userIds[email] ?? "";
  return { orgId: internal.orgId, actor: { type: "user", userId, role, platformRole: null, impersonatorId: null }, client: "console", plan: "internal", requestId: "req-console" };
}

/** The Runner a Server Action gets, with a fixed member instead of the session. */
function runnerFor(ctx: TenantContext, calls: OperationId[] = []): Runner {
  return (id, input, options: RunOperationOptions = {}) => {
    calls.push(id);
    return settle(() => runOperation(id, ctx as never, input, options, deps));
  };
}

const nick: Runner = (id, input, options) => runnerFor(member(NICK, "owner"))(id, input, options);

async function must<T>(p: Promise<{ ok: boolean; message: string; data?: unknown }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.data as T;
}

async function setState(slug: string) {
  const r = await nick("set.get", { ref: slug });
  if (r.status !== "ok") throw new Error("no set");
  return r.output as { draft: { etag: string; version: number }; channels: { channel: string; version: number; stage: string }[] };
}

async function editDraft(slug: string, label: string): Promise<string> {
  const got = await nick("draft.get", { ref: slug });
  if (got.status !== "ok" || got.etag === undefined) throw new Error("no draft");
  const spec = structuredClone(got.output as QuestionSetSpec);
  const q = spec.stages[0]?.questions["needs_reply"];
  if (q !== undefined) q.meta = { ...q.meta, label };
  const put = await nick("draft.update", { ref: slug, spec }, { ifMatch: got.etag });
  if (put.status !== "ok") throw new Error("draft.update failed");
  return (put.output as { etag: string }).etag;
}

/** A fresh set from the seed's v1, published once to production at shadow. */
async function liveSet(): Promise<string> {
  const slug = `rel-${++n}`;
  const created = await nick("set.create", { slug, name: slug, goalId: internal.goalId, fromVersion: "inbox-triage@1" });
  if (created.status !== "ok") throw new Error("set.create failed");
  const etag = (created.output as { draft: { etag: string } }).draft.etag;
  await must(publishDraft(nick, { ref: slug, channel: "production", changelog: "first", etag }));
  return slug;
}

beforeAll(async () => {
  t = await createTestDatabase();
  deps = { db: t.db };
  [internal] = (await seedOrgs(t.db, [
    {
      slug: "internal",
      name: "Internal",
      members: [
        { email: NICK, name: "Nick", role: "owner" },
        { email: PJ, name: "PJ", role: "editor" },
      ],
    },
  ])) as [SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("publish", () => {
  it("checks the draft without writing, then publishes it with the changelog", async () => {
    const slug = await liveSet();
    const etag = await editDraft(slug, "v2");
    const preview = await must<{ diff: { changes: unknown[] }; lints: unknown[] }>(checkPublish(nick, { ref: slug, channel: "production", changelog: "relabel", etag }));
    expect(preview.diff.changes).toHaveLength(1);
    expect(preview.lints).toEqual([]);
    expect((await setState(slug)).channels[0]?.version).toBe(1);

    const r = await publishDraft(nick, { ref: slug, channel: "production", changelog: "  relabel  ", etag });
    expect(r).toMatchObject({ ok: true, message: "Published version 2 to production.", data: { version: 2 } });
    const versions = await nick("version.list", { ref: slug });
    expect(versions.status === "ok" && (versions.output as { data: { changelog: string }[] }).data[0]?.changelog).toBe("relabel");
  });

  it("asks for a changelog before calling the operation", async () => {
    const calls: OperationId[] = [];
    const r = await publishDraft(runnerFor(member(NICK, "owner"), calls), { ref: "inbox-triage", channel: "production", changelog: "  ", etag: "x" });
    expect(r).toMatchObject({ ok: false, message: "Write a changelog: one line on what changed and why." });
    expect(calls).toEqual([]);
  });

  it("says to reload when the draft changed after the page loaded, and publishes nothing", async () => {
    const slug = await liveSet();
    const stale = await editDraft(slug, "first edit");
    await editDraft(slug, "second edit");
    const r = await publishDraft(nick, { ref: slug, channel: "production", changelog: "late", etag: stale });
    expect(r).toMatchObject({ ok: false, code: "precondition_failed" });
    expect(r.message).toContain("Reload the page");
    expect((await setState(slug)).channels[0]?.version).toBe(1);
  });

  it("shows the lint errors that block a publish", async () => {
    const slug = await liveSet();
    const got = await nick("draft.get", { ref: slug });
    if (got.status !== "ok" || got.etag === undefined) throw new Error("no draft");
    const spec = structuredClone(got.output as QuestionSetSpec);
    const p = spec.policies["needs_reply"];
    if (p?.type === "noul") p.noul = { trueAt: 0.6, falseAt: 0.5, reviewMargin: 0.1 };
    const put = await nick("draft.update", { ref: slug, spec }, { ifMatch: got.etag });
    const etag = put.status === "ok" ? (put.output as { etag: string }).etag : "";

    const check = await must<{ lints: { rule: string; severity: string }[] }>(checkPublish(nick, { ref: slug, channel: "production", changelog: "bad", etag }));
    expect(check.lints).toContainEqual(expect.objectContaining({ rule: "policy.noul_order", severity: "error" }));
    const r = await publishDraft(nick, { ref: slug, channel: "production", changelog: "bad", etag });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.details.map((d) => d.rule)).toContain("policy.noul_order");
  });
});

describe("rollback, stages and diff", () => {
  it("previews and rolls back to the previous version, keeping the stage", async () => {
    const slug = await liveSet();
    await publishDraft(nick, { ref: slug, channel: "production", changelog: "v2", etag: await editDraft(slug, "v2") });
    expect(await must(checkRollback(nick, { ref: slug, channel: "production" }))).toEqual({ from: `${slug}@2`, to: `${slug}@1`, changes: 1 });
    const r = await rollbackChannel(nick, { ref: slug, channel: "production" });
    expect(r).toMatchObject({ ok: true, message: "production now serves version 1 instead of 2. The stage stays Shadow." });
    expect((await setState(slug)).channels[0]?.version).toBe(1);
  });

  it("explains a rollback with nothing to go back to", async () => {
    const slug = await liveSet();
    const r = await checkRollback(nick, { ref: slug, channel: "production" });
    expect(r).toMatchObject({ ok: false, code: "invalid_request" });
    expect(r.message).toContain("no earlier version");
  });

  it("moves a stage with a default reason, pauses, and refuses full for an editor", async () => {
    const slug = await liveSet();
    expect(await changeStage(nick, { ref: slug, channel: "production", stage: "controlled", reason: " " }, "Changed from the console.")).toMatchObject({
      ok: true,
      message: "production moved from Shadow to Controlled.",
    });
    const events = await t.db.withTenant(member(NICK, "owner"), async (tx) => {
      const set = await repos.questionSets.getBySlug(tx, slug);
      return set === null ? [] : repos.releaseEvents.listByChannel(tx, set.id, "production", 10);
    });
    expect(events[0]).toMatchObject({ kind: "rollout_change", reason: "Changed from the console." });

    const pj = runnerFor(member(PJ, "editor"));
    expect((await changeStage(pj, { ref: slug, channel: "production", stage: "full", reason: "go" }, "x")).ok).toBe(false);
    expect(await changeStage(pj, { ref: slug, channel: "production", stage: "paused", reason: "" }, "Paused from the console.")).toMatchObject({
      ok: true,
      data: { from: "controlled", to: "paused" },
    });
  });

  it("diffs two versions and refuses the same side twice", async () => {
    const slug = await liveSet();
    await publishDraft(nick, { ref: slug, channel: "production", changelog: "v2", etag: await editDraft(slug, "v2") });
    const diff = await must<{ from: string; to: string; changes: { path: string }[] }>(diffSides(nick, { ref: slug, from: 1, to: 2 }));
    expect(diff).toMatchObject({ from: `${slug}@1`, to: `${slug}@2` });
    expect(diff.changes.map((c) => c.path)).toEqual(["/stages/0/questions/needs_reply/meta/label"]);
    expect((await diffSides(nick, { ref: slug, from: 2, to: 2 })).ok).toBe(false);
  });
});

describe("approvals", () => {
  async function agentAsks(slug: string) {
    const userId = internal.userIds[PJ] ?? "";
    const { token, hash } = hasher.mint("sa_live_", internal.orgId);
    await t.db.withTenant(member(NICK, "owner"), (tx) =>
      repos.agentTokens.insert(tx, {
        userId,
        name: "pj-laptop",
        client: "cli",
        hash,
        scopes: ["release:production"],
        roleCeiling: "admin",
        setIds: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    );
    const auth = await authenticateBearer(`Bearer ${token}`, { db: t.db, hasher, now: () => new Date(), requestId: "req-agent" });
    const r = await runOperation("rollout.change", auth.ctx as never, { ref: slug, channel: "production", stage: "controlled", reason: "a week of receipts" }, {}, deps);
    if (r.kind !== "approval") throw new Error("expected an approval");
    return r.accepted.approval.id;
  }

  it("lists who asked, the input and the reason, and runs the request on approve", async () => {
    const slug = await liveSet();
    const id = await agentAsks(slug);
    const inbox = await nick("approval.list", {});
    const item = inbox.status === "ok" ? (inbox.output as { data: Record<string, unknown>[] }).data.find((a) => a["id"] === id) : undefined;
    expect(item).toMatchObject({
      opId: "rollout.change",
      reason: "rollout.change: a week of receipts",
      input: { ref: slug, channel: "production", stage: "controlled" },
      ifMatch: null,
      requestedBy: { name: "PJ", tokenName: "pj-laptop" },
    });

    expect(await decideApproval(nick, { id, decision: "approved", note: "" })).toMatchObject({ ok: true, message: "Approved. rollout.change ran." });
    expect((await setState(slug)).channels[0]?.stage).toBe("controlled");
  });

  it("denies a request and leaves the set as it was", async () => {
    const slug = await liveSet();
    const id = await agentAsks(slug);
    expect(await decideApproval(nick, { id, decision: "rejected", note: "not yet" })).toMatchObject({ ok: true, message: "Denied. rollout.change will not run." });
    expect((await setState(slug)).channels[0]?.stage).toBe("shadow");
    expect((await decideApproval(nick, { id, decision: "approved", note: "" })).ok).toBe(false);
  });
});
