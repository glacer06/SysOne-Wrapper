// The /mcp handler against a real Postgres (PGlite) as the app role, with the fixture transport and
// a test platform key. The internal org is bootstrapped from .bandwise/sets, so the done-check set
// is the real one. No live System One call is possible here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Scope } from "@bandwise/core";
import { GATE_TOOLS } from "@bandwise/mcp-server";
import { repos, seedOrgs, type SeededOrg } from "@bandwise/db";
import { createTestDatabase, type TestDatabase } from "@bandwise/db/testing";
import { FixtureTransport, loadBundledFixtures } from "@bandwise/system-one-client/fixture";
import { createTokenHasher, type TokenPrefix } from "@bandwise/tenancy";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { mintAgentToken, mintAppToken } from "../auth/mint";
import { bootstrapInternalOrg, type BootstrapResult } from "../bootstrap/internal-org";
import { getOperation } from "../operations/registry";
import { handleMcpRequest, type McpDeps, type McpRequest } from "./handler";

const hasher = createTokenHasher("pepper-".repeat(6));
const SETS = fileURLToPath(new URL("../../../../../.bandwise/sets/", import.meta.url));
const doneCheck = JSON.parse(readFileSync(`${SETS}done-check.json`, "utf8")) as unknown;
const NOW = new Date("2026-10-01T12:00:00Z");


let t: TestDatabase;
let internal: BootstrapResult;
let internalUser: string;
let acme: SeededOrg;
let transport: FixtureTransport;
const logged: string[] = [];

const sys = (orgId: string) => ({ orgId, actor: { type: "system" as const }, client: "job" as const, plan: "internal", requestId: "test" });

function deps(): McpDeps {
  const run = { db: t.db, transport, platformKeys: { typesafe: "test-platform-key" } };
  return { run, ops: { db: t.db }, hasher, nowDate: () => NOW, logError: (m) => logged.push(m) };
}

async function agent(orgId: string, userId: string, scopes: Scope[]): Promise<string> {
  return (await mintAgentToken(t.db, hasher, { orgId, userId, name: "mcp-test", scopes, roleCeiling: "admin", setIds: null, days: 30, now: NOW })).token;
}

type Extra = Partial<McpRequest> & { rpc?: unknown };

function call(token: string | null, extra: Extra = {}) {
  const { rpc, ...rest } = extra;
  const reads = { count: 0 };
  const readBody = vi.fn(async () => {
    reads.count += 1;
    return { text: JSON.stringify(rpc ?? { jsonrpc: "2.0", id: 1, method: "ping" }), tooLarge: false };
  });
  const res = handleMcpRequest(
    { method: "POST", authorization: token === null ? null : `Bearer ${token}`, origin: null, protocolVersion: null, readBody, requestId: "req-1", ...rest },
    deps,
  );
  return Object.assign(res, { readBody });
}

const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) });
const callTool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });

interface RpcBody {
  result?: { tools?: { name: string }[]; content?: { type: string; text: string }[]; isError?: boolean; _meta?: Record<string, unknown>; serverInfo?: { name: string } };
  error?: { code: number; message: string };
}

const rpcBody = (res: { body: unknown }) => res.body as RpcBody;
const code = (res: { body: unknown }) => (res.body as { error: { code: string } }).error.code;
const toolNames = async (token: string) => (rpcBody(await call(token, { rpc: rpc("tools/list") })).result?.tools ?? []).map((x) => x.name).sort();
const runCount = () => t.db.withTenant(sys(internal.orgId), async (tx) => (await repos.runs.findMany(tx, undefined)).length);

beforeAll(async () => {
  t = await createTestDatabase();
  transport = new FixtureTransport(loadBundledFixtures(), { synthesize: true });
  internal = await bootstrapInternalOrg(t.db, {
    members: [{ email: "nick@bandwise.test", role: "owner" }],
    specs: [{ slug: "done-check", json: doneCheck }],
    now: NOW,
  });
  internalUser = internal.members[0]?.userId ?? "";
  [acme] = (await seedOrgs(t.db, [{ slug: "acme", name: "Acme", members: [{ email: "ada@acme.test", name: "Ada", role: "owner" }] }])) as [SeededOrg];
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("/mcp gates", () => {
  it("answers 403 for any Origin before auth, and never reads the body", async () => {
    for (const origin of ["https://evil.example", "null", ""]) {
      const pending = call(null, { origin });
      const res = await pending;
      expect(res.status).toBe(403);
      expect(code(res)).toBe("forbidden");
      expect(pending.readBody).not.toHaveBeenCalled();
    }
  });

  it("answers 401 with a bare Bearer challenge when no token is sent", async () => {
    const pending = call(null);
    const res = await pending;
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Bearer realm="bandwise"');
    expect(res.headers["www-authenticate"]).not.toContain("error=");
    expect(pending.readBody).not.toHaveBeenCalled();
  });

  it("answers 401 invalid_token for a bad token, without reading the body", async () => {
    for (const bad of ["nonsense", hasher.mint("sa_live_", internal.orgId).token]) {
      const pending = call(bad);
      const res = await pending;
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe('Bearer realm="bandwise", error="invalid_token"');
      expect(pending.readBody).not.toHaveBeenCalled();
    }
  });

  it("answers 403 insufficient_scope for an app secret token, with a message about agent tokens", async () => {
    for (const mode of ["live", "test"] as const) {
      const minted = await mintAppToken(t.db, hasher, { orgId: internal.orgId, appId: internal.appId, mode, scopes: ["run"], setIds: null, channel: "production", expiresAt: null });
      expect(minted.token.startsWith(mode === "live" ? "sk_live_" : "sk_test_" satisfies TokenPrefix)).toBe(true);
      const pending = call(minted.token);
      const res = await pending;
      expect(res.status).toBe(403);
      expect(code(res)).toBe("insufficient_scope");
      expect((res.body as { error: { message: string } }).error.message).toContain("agent token");
      expect(res.headers["www-authenticate"]).toBe('Bearer realm="bandwise", error="insufficient_scope"');
      expect(pending.readBody).not.toHaveBeenCalled();
    }
  });

  it("answers the bare 401 challenge for an empty or malformed Authorization header, without reading the body", async () => {
    for (const authorization of ["Bearer ", "Basic abc"]) {
      const pending = call(null, { authorization });
      const res = await pending;
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe('Bearer realm="bandwise"');
      expect(res.headers["www-authenticate"]).not.toContain("error=");
      expect(pending.readBody).not.toHaveBeenCalled();
    }
  });

  it("answers a 404 envelope for an agent token outside the internal org", async () => {
    const pending = call(await agent(acme.orgId, Object.values(acme.userIds)[0] ?? "", ["run"]));
    const res = await pending;
    expect(res.status).toBe(404);
    expect(code(res)).toBe("not_found");
    expect(pending.readBody).not.toHaveBeenCalled();
  });

  it.each(["GET", "DELETE"])("answers 405 to %s with a valid token", async (method) => {
    const res = await call(await agent(internal.orgId, internalUser, ["run"]), { method });
    expect(res.status).toBe(405);
  });
});

describe("/mcp protocol and tool list", () => {
  it("initializes", async () => {
    const res = await call(await agent(internal.orgId, internalUser, ["run"]), { rpc: rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }) });
    expect(res.status).toBe(200);
    expect(rpcBody(res).result?.serverInfo?.name).toBe("bandwise");
  });

  it("shows a run-only token exactly the two check tools", async () => {
    expect(await toolNames(await agent(internal.orgId, internalUser, ["run"]))).toEqual(["bandwise_check_action", "bandwise_check_done"]);
  });

  it("adds the savings and review tools to the check tools for the matching scopes", async () => {
    const names = await toolNames(await agent(internal.orgId, internalUser, ["run", "usage:read", "review:read", "review:write"]));
    expect(names).toEqual(
      ["bandwise_check_action", "bandwise_check_done", "bandwise_get_savings", "bandwise_list_review_items", "bandwise_resolve_review_item"].sort(),
    );
    expect(names).not.toContain("bandwise_report_feedback");
  });

  it("shows the savings and review tools for their scopes, and never report_feedback while it has no handler", async () => {
    expect(getOperation("feedback.report").implemented).toBe(false);
    const names = await toolNames(await agent(internal.orgId, internalUser, ["run", "usage:read", "review:read", "review:write"]));
    expect(names).toEqual(expect.arrayContaining(["bandwise_get_savings", "bandwise_list_review_items", "bandwise_resolve_review_item"]));
    expect(names).not.toContain("bandwise_report_feedback");
    // Even with its own scope, the tool stays hidden.
    expect(await toolNames(await agent(internal.orgId, internalUser, ["run", "feedback:write"]))).not.toContain("bandwise_report_feedback");
  });

  it("answers JSON-RPC -32602 for a tool the token cannot see", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    for (const name of ["bandwise_list_review_items", "bandwise_report_feedback", "no_such_tool"]) {
      const res = await call(token, { rpc: callTool(name, {}) });
      expect(res.status).toBe(200);
      expect(rpcBody(res).error?.code).toBe(-32602);
    }
  });
});

describe("/mcp check tools", () => {
  it("runs the done-check in shadow and shows the cost line, advice only, and the run id in _meta", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const res = await call(token, { rpc: callTool("bandwise_check_done", { request: "Fix the failing login test.", last_reply: "Fixed it. I ran pnpm test and all 42 tests pass." }) });
    expect(res.status).toBe(200);
    const result = rpcBody(res).result;
    expect(result?.isError).not.toBe(true);
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toContain("This check cost");
    expect(text).toContain("saved about");
    expect(text).toContain("advice only");
    const runId = result?._meta?.["bandwise/runId"];
    expect(typeof runId).toBe("string");
    const row = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.get(tx, runId as string));
    expect(row).toMatchObject({ status: "ok", rollout: "shadow" });
  });

  it("sends and stores only request and last_reply, with a secret in last_reply redacted", async () => {
    const secret = ["sk-", "proj-", "abcdefghijklmnopqrstuvwx"].join("");
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const before = transport.calls.length;
    const res = await call(token, { rpc: callTool("bandwise_check_done", { request: "Deploy it.", last_reply: `Done. I used ${secret} to deploy.` }) });
    const runId = rpcBody(res).result?._meta?.["bandwise/runId"] as string;
    expect(typeof runId).toBe("string");

    const sent = JSON.stringify(transport.calls.slice(before).map((c) => c.request));
    expect(sent).not.toContain(secret);
    expect(sent).toContain("[redacted]");

    const row = await t.db.withTenant(sys(internal.orgId), (tx) => repos.runs.get(tx, runId));
    const stored = row?.state as Record<string, unknown> | null;
    expect(stored).not.toBeNull();
    expect(Object.keys(stored ?? {}).sort()).toEqual(["last_reply", "request"]);
    expect(String(stored?.["last_reply"])).toContain("[redacted]");
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("refuses an unknown field, a non-string field and a missing required field, and writes no run row", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const before = await runCount();
    const bad = [
      { request: "a", last_reply: "b", extra: "c" },
      { request: "a", last_reply: 5 },
      { request: "a" },
      { request: "a", last_reply: "   " },
    ];
    for (const args of bad) {
      const res = await call(token, { rpc: callTool("bandwise_check_done", args) });
      expect(res.status).toBe(200);
      const result = rpcBody(res).result;
      expect(result?.isError).toBe(true);
      expect(result?.content?.[0]?.text.length).toBeGreaterThan(0);
      expect(result?.content?.[0]?.text).not.toMatch(/ZodError|at \w+\.\w+ \(/);
    }
    expect(await runCount()).toBe(before);
  });

  it("refuses a field longer than the schema maxLength, naming the field and the limit, and writes no run row", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const before = await runCount();
    const res = await call(token, { rpc: callTool("bandwise_check_done", { request: "a", last_reply: "x".repeat(8001) }) });
    expect(res.status).toBe(200);
    const result = rpcBody(res).result;
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("last_reply");
    expect(result?.content?.[0]?.text).toContain("8000");
    expect(await runCount()).toBe(before);
  });

  it("refuses keys that are not own schema fields, including constructor, toString and __proto__", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const before = await runCount();
    for (const key of ["constructor", "toString", "__proto__"]) {
      const args = JSON.parse(`{"${key}": "x", "request": "a", "last_reply": "b"}`) as unknown;
      expect(Object.keys(args as object)).toContain(key);
      const res = await call(token, { rpc: callTool("bandwise_check_done", args) });
      expect(res.status).toBe(200);
      const result = rpcBody(res).result;
      expect(result?.isError).toBe(true);
      expect(result?.content?.[0]?.text).toContain(`${key} is not a field`);
    }
    expect(await runCount()).toBe(before);
  });

  it("answers an isError result with not_found: when the set does not exist", async () => {
    const token = await agent(internal.orgId, internalUser, ["run"]);
    const before = await runCount();
    // The action-risk set is not imported in this test database.
    const res = await call(token, { rpc: callTool("bandwise_check_action", { tool: "Bash", command: "ls" }) });
    const result = rpcBody(res).result;
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("not_found:");
    expect(await runCount()).toBe(before);
  });
});

describe("/mcp operation tools", () => {
  it("returns JSON text from bandwise_list_review_items for a review:read token", async () => {
    const token = await agent(internal.orgId, internalUser, ["review:read"]);
    const res = await call(token, { rpc: callTool("bandwise_list_review_items", {}) });
    expect(res.status).toBe(200);
    const result = rpcBody(res).result;
    expect(result?.isError).not.toBe(true);
    const text = result?.content?.[0]?.text ?? "";
    expect(() => JSON.parse(text) as unknown).not.toThrow();
  });
});

describe("/mcp failures", () => {
  it("answers a generic 503 when the deps cannot load, logging the error name and never its message", async () => {
    const lines: { m: string; id: string }[] = [];
    const res = await handleMcpRequest(
      { method: "POST", authorization: "Bearer x", origin: null, protocolVersion: null, readBody: async () => ({ text: "{}", tooLarge: false }), requestId: "r-9" },
      () => {
        throw new TypeError("BANDWISE_TOKEN_PEPPER is not set, value was hunter2");
      },
      (m, id) => lines.push({ m, id }),
    );
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(lines).toEqual([{ m: "TypeError", id: "r-9" }]);
  });

  it("covers every gate tool with an implemented-or-hidden rule", () => {
    // Guards the list above: a new gate tool must be added to the visibility tests.
    expect(GATE_TOOLS.map((x) => x.name).sort()).toEqual([
      "bandwise_check_action",
      "bandwise_check_done",
      "bandwise_get_savings",
      "bandwise_list_review_items",
      "bandwise_report_feedback",
      "bandwise_resolve_review_item",
    ]);
  });
});
