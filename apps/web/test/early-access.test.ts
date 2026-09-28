import { describe, expect, it } from "vitest";
import { buildBody, readResponse, retryAfterText, validate, type EarlyAccessFields } from "~/lib/early-access";
import { earlyAccessEndpoint } from "~/site";

const blank: EarlyAccessFields = { email: "", name: "", company: "", role: "", useCase: "", website: "" };

const response = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({
  status,
  headers: { get: (name: string) => headers[name] ?? null },
  json: async () => body,
});

describe("early-access request body", () => {
  it("posts to the console's public route", () => {
    expect(earlyAccessEndpoint).toBe("https://app.bandwise.dev/api/public/early-access");
  });

  it("sends only the listed fields, trims them and drops empty optional ones", () => {
    const body = buildBody({ ...blank, email: "  ada@example.com ", company: " Example Co " }, "/", 4210.6);
    expect(body).toEqual({ email: "ada@example.com", company: "Example Co", sourcePage: "/", website: "", elapsedMs: 4211 });
  });

  it("always sends the honeypot, even when a bot filled it", () => {
    const body = buildBody({ ...blank, email: "a@example.com", website: "http://spam.example" }, "/", 10);
    expect(body.website).toBe("http://spam.example");
  });

  it("sends every field when all are filled, and caps the source page", () => {
    const body = buildBody(
      { email: "a@example.com", name: "Ada", company: "Example", role: "Platform lead", useCase: "Merge bot PRs", website: "" },
      `/${"x".repeat(400)}`,
      1,
    );
    expect(Object.keys(body).sort()).toEqual(["company", "elapsedMs", "email", "name", "role", "sourcePage", "useCase", "website"]);
    expect(body.sourcePage).toHaveLength(200);
  });
});

describe("early-access validation", () => {
  it("needs an email that looks like one", () => {
    expect(validate(blank).email).toBeDefined();
    expect(validate({ ...blank, email: "ada.example.com" }).email).toBeDefined();
    expect(validate({ ...blank, email: "ada@example" }).email).toBeDefined();
    expect(validate({ ...blank, email: "ada@example.com" })).toEqual({});
  });

  it("mirrors the route's length limits", () => {
    const errors = validate({
      email: `${"a".repeat(250)}@example.com`,
      name: "n".repeat(101),
      company: "c".repeat(121),
      role: "r".repeat(81),
      useCase: "u".repeat(1001),
      website: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["company", "email", "name", "role", "useCase"]);
  });
});

describe("early-access responses", () => {
  it("reads 202 as received", async () => {
    expect(await readResponse(response(202, { ok: true }))).toEqual({ kind: "success" });
  });

  it("shows the route's message for invalid_request", async () => {
    const res = response(400, { error: { code: "invalid_request", message: "email is required", requestId: "r1", retryable: false } });
    expect(await readResponse(res)).toEqual({ kind: "invalid", message: "email is required" });
  });

  it("reads Retry-After on 429", async () => {
    const res = response(429, { error: { code: "rate_limited", message: "slow down" } }, { "Retry-After": "120" });
    expect(await readResponse(res)).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
    expect(retryAfterText(120)).toBe("Please try again in about 2 minutes.");
    expect(retryAfterText(null)).toBe("Please wait a few minutes and try again.");
  });

  it("treats every other status as a generic retry", async () => {
    for (const status of [403, 413, 415, 500, 502]) {
      expect(await readResponse(response(status, { error: { code: "internal_error", message: "x", retryable: true } }))).toEqual({
        kind: "failed",
      });
    }
    const broken = { status: 400, headers: { get: () => null }, json: async () => Promise.reject(new Error("not json")) };
    expect(await readResponse(broken)).toEqual({ kind: "failed" });
  });
});
