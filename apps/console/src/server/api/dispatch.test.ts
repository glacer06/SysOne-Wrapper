// The /api/v1 management adapter against PGlite as the app role: route matching, bearer auth, the
// internal-org gate, input assembly from path, query and body, headers, status codes and the
// error envelope.

import { existsSync } from "node:fs";

import type { Scope } from "@bandwise/core";
import { type BandwiseDb, repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { createTokenHasher } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type ApiDeps, type ApiRequest, handleApiRequest, matchRoute, MAX_API_BODY_BYTES } from "./dispatch";

const hasher = createTokenHasher("pepper-".repeat(6));

let t: TestDatabase;
let internal: SeededOrg;
let acme: SeededOrg;
const logged: string[] = [];

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

function deps(db: BandwiseDb = t.db): ApiDeps {
  return { db, hasher, logError: (m) => logged.push(m) };
}

async function agentToken(org: SeededOrg, scopes: Scope[]): Promise<string> {
  const { token, hash } = hasher.mint("sa_live_", org.orgId);
  const userId = Object.values(org.userIds)[0] ?? "";
  await t.db.withTenant(sys(org.orgId), (tx) =>
    repos.agentTokens.insert(tx, { userId, name: "cli", client: "cli", hash, scopes, roleCeiling: "admin", expiresAt: new Date(Date.now() + 86_400_000) }),
  );
  return token;
}

function req(token: string | null, method: string, path: string, extra: Partial<ApiRequest> = {}): ApiRequest {
  const url = new URL(`https://app.bandwise.dev${path}`);
  return {
    method,
    path: url.pathname,
    query: url.searchParams,
    authorization: token === null ? null : `Bearer ${token}`,
    ifMatch: null,
    idempotencyKey: null,
    body: null,
    bodyTooLarge: false,
    requestId: "req-1",
    ...extra,
  };
}

const code = (res: { body: unknown }) => (res.body as { error: { code: string } }).error.code;

let writer: string;

beforeAll(async () => {
  t = await createTestDatabase();
  [internal, acme] = (await seedOrgs(t.db, [
    { slug: "internal", name: "Internal", members: [{ email: "nick@internal.test", name: "Nick", role: "owner" }] },
    { slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] },
  ])) as [SeededOrg, SeededOrg];
  writer = await agentToken(internal, ["sets:read", "sets:write", "release:production", "release:staging", "runs:read", "usage:read"]);
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("matchRoute", () => {
  it("matches catalog paths, decodes params and prefers literal segments", () => {
    expect(matchRoute("GET", "/api/v1/sets/inbox-triage/draft")).toMatchObject({ op: { id: "draft.get" }, params: { ref: "inbox-triage" } });
    expect(matchRoute("GET", "/api/v1/sets/a%40b")).toMatchObject({ op: { id: "set.get" }, params: { ref: "a@b" } });
    expect(matchRoute("POST", "/api/v1/runs/ingest")?.op.id).toBe("run.ingest");
    expect(matchRoute("GET", "/api/v1/runs/x")?.op.id).toBe("run.get");
    expect(matchRoute("PUT", "/api/v1/sets/s/channels/production/rollout")).toMatchObject({ op: { id: "rollout.change" }, params: { ref: "s", channel: "production" } });
    expect(matchRoute("DELETE", "/api/v1/sets/s")).toBeNull();
    expect(matchRoute("GET", "/api/v1/sets/%E0%A4%A")).toBeNull();
  });

  it("leaves POST /sets/{ref}/run to its own route, which still exists", () => {
    expect(matchRoute("POST", "/api/v1/sets/s/run")).toBeNull();
    expect(existsSync(new URL("../../app/api/v1/sets/[ref]/run/route.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../app/api/v1/[...path]/route.ts", import.meta.url))).toBe(true);
  });
});

describe("handleApiRequest", () => {
  it("answers the same 401 for a missing, malformed and unknown token", async () => {
    const forged = hasher.mint("sa_live_", internal.orgId).token;
    const answers = await Promise.all([null, "nonsense", forged].map((tk) => handleApiRequest(req(tk, "GET", "/api/v1/sets"), deps())));
    expect(answers.map((a) => a.status)).toEqual([401, 401, 401]);
    expect(new Set(answers.map((a) => JSON.stringify(a.body))).size).toBe(1);
  });

  it("serves only the internal org", async () => {
    const other = await agentToken(acme, ["sets:read"]);
    const res = await handleApiRequest(req(other, "GET", "/api/v1/sets"), deps());
    expect(res.status).toBe(404);
    expect(code(res)).toBe("not_found");
  });

  it("answers 404, never 500, for unknown routes and operations that are not served yet", async () => {
    const unknown = await handleApiRequest(req(writer, "GET", "/api/v1/nothing-here"), deps());
    const stub = await handleApiRequest(req(writer, "GET", "/api/v1/projects"), deps());
    expect([unknown.status, stub.status]).toEqual([404, 404]);
    expect((stub.body as { error: { message: string } }).error.message).toContain("project.list is not served yet");
  });

  it("reads the draft with an ETag header and replaces it with If-Match", async () => {
    const got = await handleApiRequest(req(writer, "GET", "/api/v1/sets/inbox-triage/draft"), deps());
    expect(got.status).toBe(200);
    const etag = got.headers["etag"] ?? "";
    expect(etag).toMatch(/^".+"$/);
    const spec = got.body as { stages: { questions: Record<string, { meta: { label: string } }> }[] };
    const q = spec.stages[0]?.questions["needs_reply"];
    if (q !== undefined) q.meta.label = "Changed over HTTP";

    const stale = await handleApiRequest(req(writer, "PUT", "/api/v1/sets/inbox-triage/draft", { body: JSON.stringify(spec), ifMatch: '"sha256:old"' }), deps());
    expect(stale.status).toBe(412);
    expect((stale.body as { error: { currentEtag: string } }).error.currentEtag).toBe(etag.slice(1, -1));

    const put = await handleApiRequest(req(writer, "PUT", "/api/v1/sets/inbox-triage/draft", { body: JSON.stringify(spec), ifMatch: etag }), deps());
    expect(put.status).toBe(200);
    expect(put.headers["etag"]).toBe(`"${(put.body as { etag: string }).etag}"`);
  });

  it("previews and publishes, then lists versions from the query", async () => {
    const etag = (await handleApiRequest(req(writer, "GET", "/api/v1/sets/inbox-triage/draft"), deps())).headers["etag"] ?? "";
    const body = JSON.stringify({ channel: "production", changelog: "over HTTP" });
    const preview = await handleApiRequest(req(writer, "POST", "/api/v1/sets/inbox-triage/publish?dryRun=true", { body, ifMatch: etag }), deps());
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ approvalRequired: false, gates: [] });

    const published = await handleApiRequest(req(writer, "POST", "/api/v1/sets/inbox-triage/publish", { body, ifMatch: etag }), deps());
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ version: 2 });

    const versions = await handleApiRequest(req(writer, "GET", "/api/v1/sets/inbox-triage/versions?limit=1"), deps());
    expect(versions.body).toMatchObject({ data: [{ version: 2 }], nextCursor: "2" });
    const diff = await handleApiRequest(req(writer, "GET", "/api/v1/sets/inbox-triage/diff?from=1&to=production"), deps());
    expect(diff.status).toBe(200);
  });

  it("answers 201 for set.create and 202 for a gated agent call", async () => {
    const created = await handleApiRequest(
      req(writer, "POST", "/api/v1/sets", { body: JSON.stringify({ slug: "made-over-http", name: "Made", goalId: internal.goalId }) }),
      deps(),
    );
    expect(created.status).toBe(201);
    const gated = await handleApiRequest(
      req(writer, "PUT", "/api/v1/sets/inbox-triage/channels/production/rollout", { body: JSON.stringify({ stage: "controlled", reason: "go" }) }),
      deps(),
    );
    expect(gated.status).toBe(202);
    expect(gated.body).toMatchObject({ approval: { status: "pending" } });
  });

  it("refuses bad input with 400 and a JSON Pointer, and a missing scope with 403", async () => {
    const badJson = await handleApiRequest(req(writer, "POST", "/api/v1/sets", { body: "{" }), deps());
    const pathInBody = await handleApiRequest(
      req(writer, "PUT", "/api/v1/sets/inbox-triage/channels/production/rollout", { body: JSON.stringify({ ref: "other", stage: "shadow", reason: "x" }) }),
      deps(),
    );
    const unknownQuery = await handleApiRequest(req(writer, "GET", "/api/v1/runs?colour=red"), deps());
    const tooLarge = await handleApiRequest(req(writer, "POST", "/api/v1/sets", { bodyTooLarge: true }), deps());
    expect([badJson.status, pathInBody.status, unknownQuery.status, tooLarge.status]).toEqual([400, 400, 400, 400]);
    expect((unknownQuery.body as { error: { details: { path: string }[] } }).error.details[0]?.path).toBe("");
    expect(MAX_API_BODY_BYTES).toBeGreaterThan(0);

    const reader = await agentToken(internal, ["sets:read"]);
    const denied = await handleApiRequest(req(reader, "GET", "/api/v1/usage"), deps());
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: "insufficient_scope", requiredScope: "usage:read" } });
  });

  it("hides an unexpected error's message and logs only its type", async () => {
    let calls = 0;
    const flaky: BandwiseDb = {
      ...t.db,
      withTenant: (ctx, fn) => {
        calls += 1;
        // The first call is bearer auth; the operation's transaction then fails with a message that quotes data.
        if (calls === 1) return t.db.withTenant(ctx, fn);
        return Promise.reject(new TypeError("secret state text"));
      },
    };
    const res = await handleApiRequest(req(writer, "GET", "/api/v1/sets"), deps(flaky));
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(logged.at(-1)).toBe("TypeError");
  });
});
