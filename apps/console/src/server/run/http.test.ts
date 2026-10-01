// POST /api/v1/sets/{ref}/run against a real Postgres (PGlite) as the app role, with the fixture
// transport and a test platform key. Covers the gates (auth, the internal org, scope, allowlist,
// channel, draft), the rollout stage, the body, dry runs and the persisted run row.

import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { FixtureTransport, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { createTokenHasher, type TokenPrefix } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleRunHttp, MAX_RUN_BODY_BYTES, type RunHttpDeps, type RunHttpInput } from "./http";

const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
const logged: string[] = [];

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

function deps(): RunHttpDeps {
  return {
    db: t.db,
    hasher,
    transport: new FixtureTransport(loadBundledFixtures(), { synthesize: true }),
    platformKeys: { typesafe: "test-platform-key" },
    logError: (m) => logged.push(m),
  };
}

async function token(org: SeededOrg, opts: { prefix?: TokenPrefix; scopes?: string[]; setIds?: string[] | null; channel?: "production" | "staging" } = {}) {
  const prefix = opts.prefix ?? "sk_live_";
  const { token: raw, hash } = hasher.mint(prefix, org.orgId);
  await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.appTokens.insert(tx, {
      appId: org.appId,
      kind: "secret",
      prefix: prefix as "sk_live_",
      hash,
      scopes: opts.scopes ?? ["run"],
      setIds: opts.setIds === undefined ? [org.setId] : opts.setIds,
      channel: opts.channel ?? "production",
    }),
  );
  return raw;
}

function call(raw: string | null, extra: Partial<RunHttpInput> = {}) {
  return handleRunHttp(
    {
      authorization: raw === null ? null : `Bearer ${raw}`,
      ref: "inbox-triage",
      channel: null,
      body: JSON.stringify({ state: { text: "Can you send me the invoice by Friday?" } }),
      bodyTooLarge: false,
      requestId: "req-1",
      ...extra,
    },
    deps(),
  );
}

const code = (res: { body: unknown }) => (res.body as { error: { code: string } }).error.code;

// Booting PGlite and applying the migrations takes a few seconds, more under a parallel turbo run.
beforeAll(async () => {
  t = await createTestDatabase();
  [internal, acme] = (await seedOrgs(t.db, [
    { slug: "internal", name: "Internal", members: [{ email: "nick@internal.test", name: "Nick", role: "owner" }] },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("POST /api/v1/sets/{ref}/run", () => {
  it("runs the production version for the internal org, in shadow, and stores the run row", async () => {
    const res = await call(await token(internal));
    expect(res.status).toBe(200);
    const body = res.body as { runId: string; status: string; setId: string; version: number; rollout: string; channel: string };
    expect(body).toMatchObject({ status: "ok", setId: internal.setId, version: 1, rollout: "shadow", channel: "production" });
    const row = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.get(tx, body.runId));
    expect(row).toMatchObject({ setId: internal.setId, source: "api", keyMode: "platform", status: "ok" });
  });

  it("runs by set id and by a pinned published version", async () => {
    const raw = await token(internal);
    expect((await call(raw, { ref: internal.setId })).status).toBe(200);
    expect((await call(raw, { ref: "inbox-triage@1" })).body).toMatchObject({ version: 1 });
    // Version 2 is the open draft: a pinned number must be published.
    expect(code(await call(raw, { ref: "inbox-triage@2" }))).toBe("not_found");
    expect(code(await call(raw, { ref: "inbox-triage@99" }))).toBe("not_found");
  });

  it("returns a dry run without a run row", async () => {
    const raw = await token(internal);
    const before = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.findMany(tx, undefined));
    const res = await call(raw, { body: JSON.stringify({ state: { text: "hi" }, options: { dryRun: true } }) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, setId: internal.setId });
    const after = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.findMany(tx, undefined));
    expect(after.length).toBe(before.length);
  });

  it("answers 401 before reading the body or the set", async () => {
    const res = await call(null, { body: "not json", ref: "nope" });
    expect(res.status).toBe(401);
    expect(code(res)).toBe("unauthenticated");
  });

  it("is open only to the internal org", async () => {
    const res = await call(await token(acme));
    expect(res.status).toBe(404);
    expect(code(res)).toBe("not_found");
  });

  it("needs the run scope", async () => {
    const res = await call(await token(internal, { scopes: ["sets:read"] }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "insufficient_scope", requiredScope: "run" } });
  });

  it("hides a set outside the token's allowlist as 404", async () => {
    const res = await call(await token(internal, { setIds: ["00000000-0000-7000-8000-000000000001"] }));
    expect(res.status).toBe(404);
  });

  it("keeps an app token on its bound channel", async () => {
    const res = await call(await token(internal), { channel: "staging" });
    expect(res.status).toBe(400);
    expect(code(res)).toBe("invalid_request");
    expect(code(await call(await token(internal), { channel: "nightly" }))).toBe("invalid_request");
  });

  it("answers 409 set_not_live when the channel has no live pointer", async () => {
    expect(code(await call(await token(internal, { channel: "staging" })))).toBe("set_not_live");
    await t.db.withTenant(sys(internal.orgId), (tx) => repos.releasePointers.update(tx, internal.setId, "production", { rolloutStage: "inactive" }));
    try {
      const res = await call(await token(internal));
      expect(res.status).toBe(409);
      expect(code(res)).toBe("set_not_live");
    } finally {
      await t.db.withTenant(sys(internal.orgId), (tx) => repos.releasePointers.update(tx, internal.setId, "production", { rolloutStage: "shadow" }));
    }
  });

  it("runs slug@draft only for sk_test_ tokens, and always in shadow", async () => {
    expect(code(await call(await token(internal), { ref: "inbox-triage@draft" }))).toBe("insufficient_scope");
    const res = await call(await token(internal, { prefix: "sk_test_" }), { ref: "inbox-triage@draft" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 2, rollout: "shadow" });
  });

  it("refuses a bad body, a body too large, and a state the schema rejects", async () => {
    const raw = await token(internal);
    expect(code(await call(raw, { body: "{" }))).toBe("invalid_request");
    expect(code(await call(raw, { body: JSON.stringify({ state: {}, extra: 1 }) }))).toBe("invalid_request");
    const big = await call(raw, { body: null, bodyTooLarge: true });
    expect(code(big)).toBe("invalid_request");
    expect((big.body as { error: { message: string } }).error.message).toContain(String(MAX_RUN_BODY_BYTES));
    const res = await call(raw, { body: JSON.stringify({ state: { text: 42 } }) });
    expect(res.status).toBe(400);
    expect(code(res)).toBe("invalid_state");
  });

  it("refuses a malformed ref", async () => {
    expect(code(await call(await token(internal), { ref: "inbox triage@" }))).toBe("invalid_request");
  });

  it("logs nothing for refusals", () => {
    expect(logged).toEqual([]);
  });
});
