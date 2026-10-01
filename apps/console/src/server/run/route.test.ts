// The real POST /api/v1/sets/{ref}/run route, with the env and the database module replaced. It
// proves the route itself never reads the body of an unauthenticated request, and that an env
// failure is the generic 503, not a thrown error.

import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("~/env", () => ({ getEnv: () => env.value }));
vi.mock("~/server/db", () => ({ getDb: () => ({}) }));

const { POST } = await import("~/app/api/v1/sets/[ref]/run/route");

function request(authorization: string | null) {
  const pulls = { count: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls.count += 1;
      controller.enqueue(new TextEncoder().encode('{"state":{}}'));
      controller.close();
    },
    // highWaterMark 0: the stream pulls only when someone reads it, so pulls counts real reads.
  }, { highWaterMark: 0 });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null) headers["authorization"] = authorization;
  const req = new Request("https://app.bandwise.dev/api/v1/sets/inbox-triage/run", { method: "POST", headers, body, duplex: "half" } as RequestInit);
  return { req, pulls };
}

const params = (ref: string) => ({ params: Promise.resolve({ ref }) });

beforeEach(() => {
  env.value = { BANDWISE_TOKEN_PEPPER: "p".repeat(40), SYSTEM_ONE_TRANSPORT: "fixture" };
});

describe("POST /api/v1/sets/{ref}/run route", () => {
  it("answers 401 to a missing or malformed token without reading the body", async () => {
    for (const auth of [null, "Bearer junk"]) {
      const { req, pulls } = request(auth);
      const res = await POST(req, params("inbox-triage"));
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthenticated");
      expect(pulls.count).toBe(0);
    }
  });

  it("counts a real read, so the zero above means the body was not read", async () => {
    const { req, pulls } = request(null);
    await req.text();
    expect(pulls.count).toBe(1);
  });

  it("answers a generic 503 when the env is incomplete", async () => {
    env.value = { SYSTEM_ONE_TRANSPORT: "fixture" };
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { req, pulls } = request("Bearer junk");
    const res = await POST(req, params("%"));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("PEPPER");
    expect(pulls.count).toBe(0);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/: Error$/)]);
  });
});
