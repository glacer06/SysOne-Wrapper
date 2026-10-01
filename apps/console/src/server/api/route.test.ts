// The real /api/v1 catch-all route, with the env and the database module replaced. It proves the
// route never reads the body of an unauthenticated request, and that an env failure is the
// generic 503 envelope, not a thrown error.

import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("~/env", () => ({ getEnv: () => env.value }));
vi.mock("~/server/db", () => ({ getDb: () => ({}) }));

const { POST } = await import("~/app/api/v1/[...path]/route");

function request(authorization: string | null) {
  const pulls = { count: 0 };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls.count += 1;
        controller.enqueue(new TextEncoder().encode('{"slug":"x"}'));
        controller.close();
      },
    },
    // highWaterMark 0: the stream pulls only when someone reads it, so pulls counts real reads.
    { highWaterMark: 0 },
  );
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== null) headers["authorization"] = authorization;
  const req = new Request("https://app.bandwise.dev/api/v1/sets", { method: "POST", headers, body, duplex: "half" } as RequestInit);
  return { req, pulls };
}

beforeEach(() => {
  env.value = { BANDWISE_TOKEN_PEPPER: "p".repeat(40) };
});

describe("/api/v1 catch-all route", () => {
  it("answers 401 to a missing or malformed token without reading the body", async () => {
    for (const auth of [null, "Bearer junk"]) {
      const { req, pulls } = request(auth);
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthenticated");
      expect(pulls.count).toBe(0);
    }
  });

  it("answers the generic 503 envelope when the env is incomplete", async () => {
    env.value = {};
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { req, pulls } = request("Bearer junk");
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("system_one_unavailable");
    expect(body).not.toContain("PEPPER");
    expect(pulls.count).toBe(0);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/: Error$/)]);
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("serves the public document with no token", async () => {
    const { GET } = await import("~/app/api/v1/openapi.json/route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { openapi: string }).openapi).toMatch(/^3\./);
  });
});
