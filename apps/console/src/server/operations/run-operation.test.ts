import { readFileSync } from "node:fs";

import type { OrgLessContext, Scope, TenantContext } from "@bandwise/core";
import { describe, expect, it } from "vitest";

import { OperationError, OperationNotImplementedError } from "./errors";
import { runOperation } from "./run-operation";

const ORG = "0190f3a4-0000-7000-8000-000000000001";
const USER = "0190f3a4-0000-7000-8000-000000000002";
const ID = "0190f3a4-0000-7000-8000-00000000000a";

const session: TenantContext = {
  orgId: ORG,
  actor: { type: "user", userId: USER, role: "owner", platformRole: null, impersonatorId: null },
  client: "console",
  plan: "team",
  requestId: "req_session",
};

const exampleSpec: unknown = JSON.parse(
  readFileSync(
    new URL("../../../../../.claude/skills/bandwise-builder/templates/question-set.example.json", import.meta.url),
    "utf8",
  ),
);

function agent(scopes: Scope[]): TenantContext {
  return {
    orgId: ORG,
    actor: { type: "agent", tokenId: ID, userId: USER, role: "admin", scopes, setIds: null, client: "cli" },
    client: "cli",
    plan: "team",
    requestId: "req_agent",
  };
}

const appToken: TenantContext = {
  orgId: ORG,
  actor: {
    type: "apiKey",
    keyId: ID,
    appId: ID,
    tokenKind: "secret",
    mode: "live",
    channel: "production",
    scopes: ["run", "review:write"],
    setIds: null,
    origin: null,
  },
  client: "api",
  plan: "team",
  requestId: "req_app",
};

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
}

describe("runOperation", () => {
  it("rejects invalid input with 400 invalid_request and JSON Pointer details", async () => {
    const error = await failure(runOperation("set.publish", session, { ref: "s", channel: "dev" }));
    expect(error).toBeInstanceOf(OperationError);
    expect(error).toMatchObject({ code: "invalid_request", status: 400 });
    const details = (error as OperationError).details ?? [];
    expect(details.map((d) => d.path)).toEqual(expect.arrayContaining(["/channel", "/changelog"]));
    expect(details.every((d) => d.severity === "error" && d.rule === "request.invalid")).toBe(true);
  });

  it("refuses a token on a session-only operation", async () => {
    const error = await failure(runOperation("approval.decide", agent(["admin:write"]), { id: ID, decision: "approved" }));
    expect(error).toMatchObject({ code: "insufficient_scope", status: 403 });
    expect((error as Error).message).toContain("console session");
  });

  it("refuses an actor type the operation does not allow", async () => {
    const error = await failure(runOperation("set.publish", appToken, { ref: "s", channel: "production", changelog: "c" }));
    expect(error).toMatchObject({ code: "insufficient_scope" });
  });

  it("checks the token scope, including release:<channel> from the input", async () => {
    const staging = agent(["release:staging"]);
    const error = await failure(runOperation("set.publish", staging, { ref: "s", channel: "production", changelog: "c" }, { ifMatch: '"h"' }));
    expect(error).toMatchObject({ code: "insufficient_scope", requiredScope: "release:production" });
    expect((error as Error).message).toContain("release:production");
    expect((error as OperationError).toEnvelope("req_1").error).toMatchObject({
      code: "insufficient_scope",
      requiredScope: "release:production",
      retryable: false,
    });

    // experiment.start is still a stub, so passing the scope check ends in not_implemented.
    const sample = { ref: "s", challengerVersionId: ID, kind: "version", samplePct: 0.1, minRuns: 1, minLabeled: 0 };
    const denied = await failure(runOperation("experiment.start", staging, { ...sample, channel: "production" }));
    expect(denied).toMatchObject({ code: "insufficient_scope", requiredScope: "release:production" });
    const allowed = await failure(runOperation("experiment.start", staging, { ...sample, channel: "staging" }));
    expect(allowed).toBeInstanceOf(OperationNotImplementedError);
  });

  it("needs a database for an operation with a real handler", async () => {
    const error = await failure(runOperation("set.get", session, { ref: "s" }));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("OperationDeps");
  });

  it("lets any actor it allows call an any-scope operation", async () => {
    const error = await failure(runOperation("job.get", agent([]), { id: ID }));
    expect(error).toBeInstanceOf(OperationNotImplementedError);
  });

  it("requires If-Match where the operation always needs it", async () => {
    const error = await failure(runOperation("draft.update", session, { ref: "s", spec: exampleSpec }));
    expect(error).toMatchObject({ code: "precondition_required", status: 428 });
  });

  it("refuses dryRun on an operation without a preview", async () => {
    const error = await failure(runOperation("set.archive", session, { ref: "s" }, { dryRun: true }));
    expect(error).toMatchObject({ code: "invalid_request" });
  });

  it("runs the stubbed preview on dryRun", async () => {
    const error = await failure(
      runOperation("channel.promote", session, { ref: "s", channel: "production" }, { dryRun: true }),
    );
    expect(error).toBeInstanceOf(OperationNotImplementedError);
    expect((error as Error).message).toContain("preview");
  });

  it("reaches the stubbed handler with a valid call", async () => {
    const error = await failure(runOperation("review.assign", appToken, { id: ID, assigneeId: ID }));
    expect(error).toBeInstanceOf(OperationNotImplementedError);
    expect(error).toMatchObject({ operationId: "review.assign", phase: "3" });
  });

  it("runs org.create and platform operations with an org-less context, and nothing else", async () => {
    const orgLess: OrgLessContext = {
      orgId: null,
      actor: { type: "user", userId: USER, platformRole: "superadmin" },
      client: "console",
      requestId: "req_orgless",
    };
    const create = await failure(runOperation("org.create", orgLess, { slug: "acme", name: "Acme" }));
    expect(create).toBeInstanceOf(OperationNotImplementedError);
    const platform = await failure(runOperation("platform_org.list", orgLess, {}));
    expect(platform).toBeInstanceOf(OperationNotImplementedError);
    // A cast stands in for a caller that bypasses the types: the run-time check still refuses it.
    const refused = await failure(runOperation("set.archive", orgLess as unknown as TenantContext, { ref: "s" }));
    expect(refused).toMatchObject({ code: "not_found" });
  });
});
