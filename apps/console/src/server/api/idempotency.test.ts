// Idempotency-Key storage for /api/v1 mutations, against PGlite as the app role: a replay answers
// the stored status and body and runs nothing twice, a reused key with another request is refused,
// keys are per org and per caller, they expire after 24 hours, and a retry after a 503 that came
// after the commit replays the committed response.

import type { Scope, TenantContext } from "@bandwise/core";
import { type BandwiseDb, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IDEMPOTENCY_TTL_MS } from "../operations/idempotency";
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
});
