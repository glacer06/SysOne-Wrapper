import { hashClientIp } from "@bandwise/tenancy";
import { describe, expect, it, vi } from "vitest";

import {
  clientIpFrom,
  EARLY_ACCESS_ORIGINS,
  type EarlyAccessDeps,
  type EarlyAccessInput,
  type EarlyAccessSignup,
  handleEarlyAccess,
  MAX_BODY_BYTES,
  readLimitedBody,
  RETRY_AFTER_SECONDS,
} from "./early-access";

const ORIGIN = "https://www.bandwise.dev";
const SECRET = "s".repeat(32);

function makeDeps(outcome: "accepted" | "rate_limited" | Error = "accepted") {
  const submitted: EarlyAccessSignup[] = [];
  const logged: string[] = [];
  const deps: EarlyAccessDeps = {
    submit: vi.fn(async (signup: EarlyAccessSignup) => {
      if (outcome instanceof Error) throw outcome;
      submitted.push(signup);
      return outcome;
    }),
    secret: SECRET,
    allowedOrigins: EARLY_ACCESS_ORIGINS,
    logError: (message) => logged.push(message),
  };
  return { deps, submitted, logged };
}

function post(body: unknown, over: Partial<EarlyAccessInput> = {}): EarlyAccessInput {
  return {
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: typeof body === "string" ? body : JSON.stringify(body),
    bodyTooLarge: false,
    clientIp: "203.0.113.7",
    ...over,
  };
}

const person = { email: "sam@example.com", website: "", elapsedMs: 12_000, sourcePage: "/" };

describe("POST /api/public/early-access", () => {
  it("accepts a person's signup, trims fields and stores only an IP hash", async () => {
    const { deps, submitted } = makeDeps();
    const res = await handleEarlyAccess(
      post({ ...person, email: "  sam@example.com ", name: " Sam ", company: "", useCase: "Triage support email" }),
      deps,
    );
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(submitted).toEqual([
      {
        email: "sam@example.com",
        name: "Sam",
        company: null,
        role: null,
        useCase: "Triage support email",
        sourcePage: "/",
        ipHash: hashClientIp(SECRET, "203.0.113.7"),
      },
    ]);
    expect(submitted[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(submitted)).not.toContain("203.0.113.7");
  });

  it("gives a tripped honeypot or a too-fast submit the same 202 and stores nothing", async () => {
    for (const body of [{ ...person, website: "https://spam.example" }, { ...person, elapsedMs: 300 }]) {
      const { deps, submitted } = makeDeps();
      const res = await handleEarlyAccess(post(body), deps);
      expect(res).toMatchObject({ status: 202, body: { ok: true } });
      expect(submitted).toEqual([]);
    }
  });

  it("returns 429 with Retry-After when the database rate limits", async () => {
    const { deps } = makeDeps("rate_limited");
    const res = await handleEarlyAccess(post(person), deps);
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe(String(RETRY_AFTER_SECONDS));
    expect(res.headers["access-control-expose-headers"]).toBe("Retry-After");
    expect(res.body).toMatchObject({ error: { code: "rate_limited", retryable: true } });
  });

  it("rejects a bad email with the error envelope and a field detail", async () => {
    const { deps, submitted } = makeDeps();
    const res = await handleEarlyAccess(post({ ...person, email: "not-an-email" }), deps);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "invalid_request", message: "Enter a valid email address.", retryable: false, details: [{ path: "/email" }] },
    });
    expect((res.body as { error: { requestId: string } }).error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(submitted).toEqual([]);
  });

  it("rejects oversized fields, a source page that is not a path, and bad JSON", async () => {
    const { deps } = makeDeps();
    for (const body of [
      { ...person, name: "n".repeat(101) },
      { ...person, useCase: "u".repeat(1001) },
      { ...person, sourcePage: "https://elsewhere.example/" },
      { ...person, email: `${"a".repeat(250)}@example.com` },
    ]) {
      expect((await handleEarlyAccess(post(body), deps)).status).toBe(400);
    }
    expect((await handleEarlyAccess(post("{not json"), deps)).status).toBe(400);
  });

  it("refuses other origins, a missing origin, the wrong content type and a large body", async () => {
    const { deps, submitted } = makeDeps();
    const other = await handleEarlyAccess(post(person, { origin: "https://evil.example" }), deps);
    expect(other.status).toBe(403);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    expect((await handleEarlyAccess(post(person, { origin: null }), deps)).status).toBe(403);
    expect((await handleEarlyAccess(post(person, { contentType: "text/plain" }), deps)).status).toBe(415);
    expect((await handleEarlyAccess(post(person, { body: null, bodyTooLarge: true }), deps)).status).toBe(413);
    expect(submitted).toEqual([]);
  });

  it("hides the cause of a server error from the response and the log", async () => {
    const { deps, logged } = makeDeps(new Error("connection refused"));
    const res = await handleEarlyAccess(post(person), deps);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: { code: "internal_error", retryable: true } });
    expect(JSON.stringify(res.body)).not.toContain("connection refused");
    expect(logged).toEqual(["connection refused"]);
    expect(logged.join()).not.toContain("sam@example.com");
  });
});

describe("OPTIONS preflight", () => {
  it("allows the marketing origin to POST JSON", async () => {
    const { deps } = makeDeps();
    const res = await handleEarlyAccess({ method: "OPTIONS", origin: ORIGIN, contentType: null, body: null, bodyTooLarge: false, clientIp: null }, deps);
    expect(res.status).toBe(204);
    expect(res.headers).toMatchObject({
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "Origin",
    });
  });

  it("refuses any other origin", async () => {
    const { deps } = makeDeps();
    const res = await handleEarlyAccess({ method: "OPTIONS", origin: "https://evil.example", contentType: null, body: null, bodyTooLarge: false, clientIp: null }, deps);
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("helpers", () => {
  it("takes the client IP from x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.9" }))).toBe("198.51.100.1");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIpFrom(new Headers())).toBeNull();
  });

  it("reads a body up to the limit and flags anything larger", async () => {
    const small = new Request("https://app.bandwise.dev/x", { method: "POST", body: "{}" });
    expect(await readLimitedBody(small)).toEqual({ text: "{}", tooLarge: false });
    const big = new Request("https://app.bandwise.dev/x", { method: "POST", body: "x".repeat(MAX_BODY_BYTES + 1) });
    expect(await readLimitedBody(big)).toEqual({ text: null, tooLarge: true });
  });
});
