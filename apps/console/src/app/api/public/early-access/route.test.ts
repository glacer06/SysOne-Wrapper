// The route module with no secrets set, as `next build` loads it. The first bandwise-console
// deploy failed with "Failed to collect page data for /api/public/early-access" because the env
// was validated on import. Now only a real signup needs DATABASE_URL and AUTH_SECRET.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as RouteModule from "./route";

const ORIGIN = "https://www.bandwise.dev";

// Importing the route pulls in @bandwise/db, drizzle and pg. A cold transform of those can take
// longer than vitest's 5 second default when the whole gate runs in parallel, so the import happens
// once, here, with room to spare. getEnv() is lazy and does not cache a failure, so one import
// serves every test.
let route: typeof RouteModule;

beforeAll(async () => {
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "SKIP_ENV_VALIDATION"]) vi.stubEnv(key, "");
  route = await import("./route");
}, 60_000);

afterAll(() => {
  vi.unstubAllEnvs();
});

async function loadRoute() {
  return route;
}

describe("early-access route without secrets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads without validating the env", async () => {
    expect(await loadRoute()).toMatchObject({ dynamic: "force-dynamic", runtime: "nodejs" });
  });

  it("still answers the preflight from www", async () => {
    const { OPTIONS } = await loadRoute();
    const res = await OPTIONS(
      new Request("https://app.bandwise.dev/api/public/early-access", {
        method: "OPTIONS",
        headers: { origin: ORIGIN, "access-control-request-method": "POST" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("fails a signup with the error envelope and CORS, and logs no values", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("https://app.bandwise.dev/api/public/early-access", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ email: "sam@example.com", website: "", elapsedMs: 9000 }),
      }),
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await res.json()).toMatchObject({ error: { code: "internal_error", retryable: true } });
    expect(logged.join("\n")).toMatch(/early-access .+: /);
    expect(logged.join("\n")).not.toContain("sam@example.com");
  });
});
