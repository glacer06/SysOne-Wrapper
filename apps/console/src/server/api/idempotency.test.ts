// Idempotency-Key storage for /api/v1 mutations, against PGlite as the app role: a replay answers
// the stored status and body and runs nothing twice, a reused key with another request is refused,
// keys are per org and per caller, they expire after 24 hours, and a retry after a 503 that came
// after the commit replays the committed response. Expired rows are deleted on the next claim in
// the org, a key is bound to the caller's access when it was used, and two calls with one key at
// once run the handler once.

import type { Scope, TenantContext } from "@bandwise/core";
import { type BandwiseDb, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IDEMPOTENCY_TTL_MS, idempotencyActorKey } from "../operations/idempotency";
import { runOperation } from "../operations/run-operation";
import { type ApiDeps, type ApiRequest, type ApiResponse, handleApiRequest } from "./dispatch";

const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
let writer: string;
let writerTokenId: string;
let otherWriter: string;

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

function deps(db: BandwiseDb = t.db, now?: () => Date): ApiDeps {
  const d: ApiDeps = { db, hasher };
  if (now !== undefined) d.now = now;
  return d;
}

async function agentToken(org: SeededOrg, scopes: Scope[]): Promise<{ token: string; id: string }> {
  const { token, hash } = hasher.mint("sa_live_", org.orgId);
  const userId = Object.values(org.userIds)[0] ?? "";
  const row = await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.agentTokens.insert(tx, { userId, name: "cli", client: "cli", hash, scopes, roleCeiling: "admin", expiresAt: new Date(Date.now() + 30 * 86_400_000) }),
  );
  return { token, id: row.id };
}

function post(token: string, path: string, body: unknown, idempotencyKey: string | null, extra: Partial<ApiRequest> = {}): ApiRequest {
  const url = new URL(`https://app.bandwise.dev${path}`);
  return {
    method: "POST",
    path: url.pathname,
    query: url.searchParams,
    authorization: `Bearer ${token}`,
    ifMatch: null,
    idempotencyKey,
    readBody: () => Promise.resolve({ text: JSON.stringify(body), tooLarge: false }),
    requestId: "req-idem",
    ...extra,
  };
}

const createSet = (slug: string) => ({ slug, name: `Set ${slug}`, goalId: internal.goalId });
const code = (res: ApiResponse) => (res.body as { error: { code: string } }).error.code;

/** Audit rows for one action, optionally for one target, in an org. */
async function auditCount(orgId: string, action: string, targetId?: string): Promise<number> {
  const rows = await t.db.withTenant(sys(orgId), (tx) => repos.auditLog.findMany(tx, undefined, 200));
  return rows.filter((r) => r.action === action && (targetId === undefined || r.targetId === targetId)).length;
}

async function storedKeys(orgId: string, actorKey: string, key: string) {
  return t.db.withTenant(sys(orgId), (tx) => repos.idempotencyKeys.lookup(tx, actorKey, key));
}

const setId = (res: ApiResponse) => (res.body as { id: string }).id;

beforeAll(async () => {
  t = await createTestDatabase();
  [internal, acme] = (await seedOrgs(t.db, [
    { slug: "internal", name: "Internal", members: [{ email: "nick@internal.test", name: "Nick", role: "owner" }] },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
  const scopes: Scope[] = ["sets:read", "sets:write", "release:production", "release:staging"];
  const w = await agentToken(internal, scopes);
  writer = w.token;
  writerTokenId = w.id;
  otherWriter = (await agentToken(internal, scopes)).token;
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("Idempotency-Key on /api/v1 mutations", () => {
  it("replays the stored status and body and runs the handler once", async () => {
    const key = crypto.randomUUID();
    const first = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-replay"), key), () => deps());
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();

    const second = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-replay"), key), () => deps());
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(await auditCount(internal.orgId, "set.create", setId(first))).toBe(1);

    const row = await storedKeys(internal.orgId, writerTokenId, key);
    expect(row).toMatchObject({ opId: "set.create", responseStatus: 201 });
  });

  it("replays the ETag a draft update answered with", async () => {
    const draft = await handleApiRequest({ ...post(writer, "/api/v1/sets/inbox-triage/draft", null, null), method: "GET" }, () => deps());
    const etag = draft.headers["etag"] ?? "";
    const spec = draft.body as { stages: { questions: Record<string, { meta: { label: string } }> }[] };
    const q = spec.stages[0]?.questions["needs_reply"];
    if (q !== undefined) q.meta.label = "Changed with a key";
    const key = crypto.randomUUID();
    const put = (): ApiRequest => ({ ...post(writer, "/api/v1/sets/inbox-triage/draft", spec, key), method: "PUT", ifMatch: etag });

    const first = await handleApiRequest(put(), () => deps());
    expect(first.status).toBe(200);
    const again = await handleApiRequest(put(), () => deps());
    // Without the stored response this is a 412: the draft no longer has the old ETag.
    expect(again.status).toBe(200);
    expect(again.headers["etag"]).toBe(first.headers["etag"]);
    expect(again.headers["idempotent-replayed"]).toBe("true");
  });

  it("refuses the same key with a different body and runs nothing", async () => {
    const key = crypto.randomUUID();
    const first = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-first"), key), () => deps());
    expect(first.status).toBe(201);
    const reused = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-other"), key), () => deps());
    expect(reused.status).toBe(422);
    expect(code(reused)).toBe("idempotency_key_reused");
    expect(reused.body).toMatchObject({ error: { retryable: false } });
    const list = await handleApiRequest({ ...post(writer, "/api/v1/sets?limit=200", null, null), method: "GET" }, () => deps());
    expect((list.body as { data: { slug: string }[] }).data.map((s) => s.slug)).not.toContain("idem-other");

    // The same key on another operation is a different request too.
    const elsewhere = await handleApiRequest(
      { ...post(writer, "/api/v1/sets/inbox-triage/channels/staging/rollout", { stage: "paused", reason: "x" }, key), method: "PUT" },
      () => deps(),
    );
    expect(code(elsewhere)).toBe("idempotency_key_reused");
  });

  it("keeps keys per token: another token's same key runs fresh", async () => {
    const key = crypto.randomUUID();
    const mine = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-mine"), key), () => deps());
    expect(mine.status).toBe(201);
    // Same key, same body, another token: not a replay of the first token's response.
    const theirs = await handleApiRequest(post(otherWriter, "/api/v1/sets", createSet("idem-mine"), key), () => deps());
    expect(theirs.status).toBe(409);
    expect(theirs.headers["idempotent-replayed"]).toBeUndefined();
    const fresh = await handleApiRequest(post(otherWriter, "/api/v1/sets", createSet("idem-theirs"), key), () => deps());
    expect(fresh.status).toBe(201);
    expect(fresh.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("keeps keys per org: the same caller id and key in another org runs fresh", async () => {
    const tokenId = crypto.randomUUID();
    const ctx = (org: SeededOrg): TenantContext => ({
      orgId: org.orgId,
      actor: { type: "agent", tokenId, userId: Object.values(org.userIds)[0] ?? "", role: "admin", scopes: ["sets:write"], setIds: null, client: "cli" },
      client: "cli",
      plan: "internal",
      requestId: "req-org",
    });
    const key = crypto.randomUUID();
    const input = (org: SeededOrg) => ({ slug: "idem-org", name: "Org", goalId: org.goalId });
    const inInternal = await runOperation("set.create", ctx(internal), input(internal), { idempotencyKey: key }, { db: t.db });
    const inAcme = await runOperation("set.create", ctx(acme), input(acme), { idempotencyKey: key }, { db: t.db });
    expect(inInternal).toMatchObject({ kind: "ok" });
    expect(inAcme).toMatchObject({ kind: "ok" });
    expect((inAcme as { replayed?: true }).replayed).toBeUndefined();
    expect((inAcme as { output: { id: string } }).output.id).not.toBe((inInternal as { output: { id: string } }).output.id);
    expect(await auditCount(acme.orgId, "set.create")).toBe(1);
    expect(await storedKeys(acme.orgId, tokenId, key)).toMatchObject({ orgId: acme.orgId });
  });

  it("runs fresh once a key is older than 24 hours", async () => {
    const key = crypto.randomUUID();
    const start = Date.now();
    const at = (ms: number) => () => new Date(start + ms);
    const first = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-old"), key), () => deps(t.db, at(0)));
    expect(first.status).toBe(201);
    const late = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-old"), key), () => deps(t.db, at(IDEMPOTENCY_TTL_MS - 60_000)));
    expect(late.headers["idempotent-replayed"]).toBe("true");

    // Past 24 hours the key is free: another body is not refused, and it runs.
    const expired = at(IDEMPOTENCY_TTL_MS + 60_000);
    const fresh = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-new"), key), () => deps(t.db, expired));
    expect(fresh.status).toBe(201);
    expect(fresh.headers["idempotent-replayed"]).toBeUndefined();
    expect(await storedKeys(internal.orgId, writerTokenId, key)).toMatchObject({ createdAt: expired() });
    // And the key now replays the new response.
    const replay = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-new"), key), () => deps(t.db, expired));
    expect(replay.body).toEqual(fresh.body);
  });

  it("makes a retry after a 503 that came after the commit safe: it replays the committed response", async () => {
    let calls = 0;
    const lostAfterCommit: BandwiseDb = {
      ...t.db,
      withTenant: async (ctx, fn) => {
        calls += 1;
        const out = await t.db.withTenant(ctx, fn);
        // The first call is bearer auth. The operation's transaction commits, then the answer is lost.
        if (calls === 2) throw new TypeError("connection lost after commit");
        return out;
      },
    };
    const key = crypto.randomUUID();
    const lost = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-lost"), key), () => deps(lostAfterCommit));
    expect(lost.status).toBe(503);
    expect(lost.body).toMatchObject({ error: { retryable: true } });

    const retry = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-lost"), key), () => deps());
    expect(retry.status).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(await auditCount(internal.orgId, "set.create", setId(retry))).toBe(1);
  });

  it("rolls the key back with a failed call, so a retry runs again", async () => {
    const key = crypto.randomUUID();
    const missingGoal = { slug: "idem-failed", name: "Failed", goalId: crypto.randomUUID() };
    const failed = await handleApiRequest(post(writer, "/api/v1/sets", missingGoal, key), () => deps());
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(await storedKeys(internal.orgId, writerTokenId, key)).toBeNull();
    const fixed = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-failed"), key), () => deps());
    expect(fixed.status).toBe(201);
  });

  it("stores no key for a gated 202: a retry gets the same approval back from the gate", async () => {
    const key = crypto.randomUUID();
    const gated = (): ApiRequest => ({
      ...post(writer, "/api/v1/sets/inbox-triage/channels/production/rollout", { stage: "controlled", reason: "go" }, key),
      method: "PUT",
    });
    const first = await handleApiRequest(gated(), () => deps());
    expect(first.status).toBe(202);
    expect(await storedKeys(internal.orgId, writerTokenId, key)).toBeNull();
    const again = await handleApiRequest(gated(), () => deps());
    expect(again.status).toBe(202);
    expect(again.body).toEqual(first.body);
  });

  it("stores nothing for a read or a preview, and refuses a malformed key", async () => {
    const key = crypto.randomUUID();
    const read = await handleApiRequest({ ...post(writer, "/api/v1/sets", null, key), method: "GET" }, () => deps());
    expect(read.status).toBe(200);
    expect(await storedKeys(internal.orgId, writerTokenId, key)).toBeNull();

    const etag = (await handleApiRequest({ ...post(writer, "/api/v1/sets/inbox-triage/draft", null, null), method: "GET" }, () => deps())).headers["etag"] ?? "";
    const preview = await handleApiRequest(
      post(writer, "/api/v1/sets/inbox-triage/publish?dryRun=true", { channel: "staging", changelog: "preview" }, key, { ifMatch: etag }),
      () => deps(),
    );
    expect(preview.status).toBe(200);
    expect(await storedKeys(internal.orgId, writerTokenId, key)).toBeNull();

    for (const bad of ["", "has space", "x".repeat(256), "café"]) {
      const res = await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-bad"), bad), () => deps());
      expect(res.status).toBe(400);
      expect(code(res)).toBe("invalid_request");
    }
  });

  it("deletes the org's expired rows on the next claim, and leaves live rows and other orgs alone", async () => {
    const start = Date.now();
    const at = (ms: number) => () => new Date(start + ms);
    const oldKey = crypto.randomUUID();
    const liveKey = crypto.randomUUID();
    expect((await handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-prune-old"), oldKey), () => deps(t.db, at(0)))).status).toBe(201);
    expect(
      (await handleApiRequest(post(otherWriter, "/api/v1/sets", createSet("idem-prune-live"), liveKey), () => deps(t.db, at(IDEMPOTENCY_TTL_MS)))).status,
    ).toBe(201);
    // In acme, the same age as the old key.
    const acmeCtx: TenantContext = {
      orgId: acme.orgId,
      actor: {
        type: "agent",
        tokenId: crypto.randomUUID(),
        userId: Object.values(acme.userIds)[0] ?? "",
        role: "admin",
        scopes: ["sets:write"],
        setIds: null,
        client: "cli",
      },
      client: "cli",
      plan: "internal",
      requestId: "req-prune",
    };
    const acmeKey = crypto.randomUUID();
    await runOperation(
      "set.create",
      acmeCtx as never,
      { slug: "idem-prune-acme", name: "Acme", goalId: acme.goalId },
      { idempotencyKey: acmeKey },
      { db: t.db, now: at(0) },
    );
    expect(await storedKeys(internal.orgId, writerTokenId, oldKey)).not.toBeNull();

    // Any keyed call in the org, by any caller, past the old key's 24 hours.
    const later = at(IDEMPOTENCY_TTL_MS + 60_000);
    expect((await handleApiRequest(post(otherWriter, "/api/v1/sets", createSet("idem-prune-next"), crypto.randomUUID()), () => deps(t.db, later))).status).toBe(
      201,
    );
    expect(await storedKeys(internal.orgId, writerTokenId, oldKey)).toBeNull();
    const liveRows = await t.db.withTenant(sys(internal.orgId), (tx) => repos.idempotencyKeys.findMany(tx, undefined, 500));
    expect(liveRows.some((r) => r.key === liveKey)).toBe(true);
    expect(await storedKeys(acme.orgId, acmeCtx.actor.type === "agent" ? acmeCtx.actor.tokenId : "", acmeKey)).not.toBeNull();
  });

  it("refuses the same key and body with another If-Match", async () => {
    const draft = await handleApiRequest({ ...post(writer, "/api/v1/sets/inbox-triage/draft", null, null), method: "GET" }, () => deps());
    const etag = draft.headers["etag"] ?? "";
    const key = crypto.randomUUID();
    const put = (ifMatch: string): ApiRequest => ({ ...post(writer, "/api/v1/sets/inbox-triage/draft", draft.body, key), method: "PUT", ifMatch });
    const first = await handleApiRequest(put(etag), () => deps());
    expect(first.status).toBe(200);
    const other = await handleApiRequest(put('"some-other-etag"'), () => deps());
    expect(other.status).toBe(422);
    expect(code(other)).toBe("idempotency_key_reused");
  });

  it("refuses a replay once the caller's role was lowered, so it cannot read back what it no longer may", async () => {
    const tokenId = crypto.randomUUID();
    const ctx = (role: "admin" | "editor"): TenantContext => ({
      orgId: internal.orgId,
      actor: { type: "agent", tokenId, userId: Object.values(internal.userIds)[0] ?? "", role, scopes: ["sets:write"], setIds: null, client: "cli" },
      client: "cli",
      plan: "internal",
      requestId: "req-role",
    });
    const key = crypto.randomUUID();
    const input = { slug: "idem-role", name: "Role", goalId: internal.goalId };
    expect(await runOperation("set.create", ctx("admin") as never, input, { idempotencyKey: key }, { db: t.db })).toMatchObject({ kind: "ok" });
    expect(await runOperation("set.create", ctx("admin") as never, input, { idempotencyKey: key }, { db: t.db })).toMatchObject({ kind: "ok", replayed: true });
    await expect(runOperation("set.create", ctx("editor") as never, input, { idempotencyKey: key }, { db: t.db })).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
  });

  it("keeps a console user's keys by user id, and replays for the same user", async () => {
    const userId = Object.values(internal.userIds)[0] ?? "";
    const ctx: TenantContext = {
      orgId: internal.orgId,
      actor: { type: "user", userId, role: "owner", platformRole: null, impersonatorId: null },
      client: "console",
      plan: "internal",
      requestId: "req-user",
    };
    const key = crypto.randomUUID();
    const input = { slug: "idem-user", name: "User", goalId: internal.goalId };
    const first = await runOperation("set.create", ctx as never, input, { idempotencyKey: key }, { db: t.db });
    const again = await runOperation("set.create", ctx as never, input, { idempotencyKey: key }, { db: t.db });
    expect(again).toMatchObject({ kind: "ok", replayed: true });
    expect((again as { output: unknown }).output).toEqual((first as { output: unknown }).output);
    expect(await storedKeys(internal.orgId, userId, key)).toMatchObject({ opId: "set.create", responseStatus: 201 });
    expect(await auditCount(internal.orgId, "set.create", (first as { output: { id: string } }).output.id)).toBe(1);
  });

  it("names the key's owner per actor kind, and none for the system actor", () => {
    const base = { orgId: internal.orgId, client: "api" as const, plan: "internal", requestId: "r" };
    const keyId = crypto.randomUUID();
    const apiKey: TenantContext = {
      ...base,
      actor: {
        type: "apiKey",
        keyId,
        appId: internal.appId,
        tokenKind: "secret",
        mode: "live",
        channel: "production",
        scopes: ["run"],
        setIds: null,
        origin: null,
      },
    };
    expect(idempotencyActorKey(apiKey)).toBe(keyId);
    expect(idempotencyActorKey({ ...base, actor: { type: "system" }, client: "job" })).toBeNull();
  });

  it("runs the handler once when two calls with one key arrive together", async () => {
    // PGlite has one connection, so the two transactions run one after the other here. The unique
    // index makes the same hold across connections: the second claim waits for the first.
    const key = crypto.randomUUID();
    const send = () => handleApiRequest(post(writer, "/api/v1/sets", createSet("idem-together"), key), () => deps());
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.headers["idempotent-replayed"], b.headers["idempotent-replayed"]].filter((h) => h === "true")).toHaveLength(1);
    expect(a.body).toEqual(b.body);
    expect(await auditCount(internal.orgId, "set.create", setId(a))).toBe(1);
  });

  it("lets a call claim a key whose first call rolled back while they overlapped", async () => {
    const key = crypto.randomUUID();
    const rollsBack: BandwiseDb = {
      ...t.db,
      withTenant: (ctx, fn) =>
        t.db.withTenant(ctx, async (tx) => {
          const out = await fn(tx);
          // Bearer auth reads only; the operation's own transaction claims the key, then fails.
          if ((ctx as TenantContext).actor.type === "agent") throw new TypeError("failed before commit");
          return out;
        }),
    };
    const input = createSet("idem-rolled-back");
    const [failed, ok] = await Promise.all([
      handleApiRequest(post(writer, "/api/v1/sets", input, key), () => deps(rollsBack)),
      handleApiRequest(post(writer, "/api/v1/sets", input, key), () => deps()),
    ]);
    expect(failed.status).toBe(503);
    expect(ok.status).toBe(201);
    expect(ok.headers["idempotent-replayed"]).toBeUndefined();
    expect(await auditCount(internal.orgId, "set.create", setId(ok))).toBe(1);
  });

  it("does not run an approved request again when approval.decide is replayed", async () => {
    const input = { stage: "controlled", reason: "decide replay" };
    const gated = await handleApiRequest({ ...post(writer, "/api/v1/sets/inbox-triage/channels/production/rollout", input, null), method: "PUT" }, () =>
      deps(),
    );
    expect(gated.status).toBe(202);
    const approvalId = (gated.body as { approval: { id: string } }).approval.id;
    const ownerId = Object.values(internal.userIds)[0] ?? "";
    const owner: TenantContext = {
      orgId: internal.orgId,
      actor: { type: "user", userId: ownerId, role: "owner", platformRole: null, impersonatorId: null },
      client: "console",
      plan: "internal",
      requestId: "req-decide",
    };
    const errors: string[] = [];
    const d = { db: t.db, logError: (m: string) => errors.push(m) };
    const key = crypto.randomUUID();
    const decided = await runOperation("approval.decide", owner as never, { id: approvalId, decision: "approved" }, { idempotencyKey: key }, d);
    expect(decided).toMatchObject({ kind: "ok", output: { status: "executed" } });
    const runs = async () =>
      (await t.db.withTenant(sys(internal.orgId), (tx) => repos.auditLog.findMany(tx, undefined, 500))).filter(
        (r) => r.action === "rollout.change" && r.approvalId === approvalId && r.targetType === "question_set",
      ).length;
    expect(await runs()).toBe(1);

    const replayed = await runOperation("approval.decide", owner as never, { id: approvalId, decision: "approved" }, { idempotencyKey: key }, d);
    expect(replayed).toMatchObject({ kind: "ok", replayed: true });
    // Running it again would fail its claim (already executed) and log that failure.
    expect(errors).toEqual([]);
    expect(await runs()).toBe(1);
  });
});
