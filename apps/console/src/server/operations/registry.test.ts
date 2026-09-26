import { readFileSync } from "node:fs";

import {
  DEFAULT_LABELING_POLICY,
  JobAccepted,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  OPERATION_CATALOG,
  catalogActors,
  type OperationId,
  type RiskResource,
  type RolloutStage,
  type TenantContext,
} from "@sysone/core";
import { describe, expect, it } from "vitest";

import { OperationNotImplementedError } from "./errors";
import { OPERATIONS, getOperation, isOperationId, listOperations } from "./registry";
import { rolloutChangeRisk } from "./schemas";

const ROOT = new URL("../../../../../", import.meta.url);
const exampleSpec: unknown = JSON.parse(
  readFileSync(new URL(".claude/skills/sysone-builder/templates/question-set.example.json", ROOT), "utf8"),
);

const ctx: TenantContext = {
  orgId: "0190f3a4-0000-7000-8000-000000000001",
  actor: {
    type: "user",
    userId: "0190f3a4-0000-7000-8000-000000000002",
    role: "owner",
    platformRole: null,
    impersonatorId: null,
  },
  client: "console",
  plan: "team",
  requestId: "req_test",
};

const UUID = "0190f3a4-0000-7000-8000-00000000000a";
/** A RiskResource with the given production and staging stages. */
function stages(production: RolloutStage | null, staging: RolloutStage | null = null, isProtected = false): RiskResource {
  return { protected: isProtected, stages: { production, staging }, storageMode: "full" };
}

const quiet: RiskResource = stages("shadow");

function prepare(id: OperationId, raw: unknown) {
  const result = getOperation(id).prepare(raw);
  if (!result.ok) throw new Error(`${id}: ${result.error.message}`);
  return result.call;
}

function rejects(id: OperationId, raw: unknown): boolean {
  return !getOperation(id).prepare(raw).ok;
}

/** Minimal valid raw input: path params with sample values. */
function pathInput(id: OperationId): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const key of getOperation(id).request.path) {
    sample[key] = key === "ref" ? "email-triage" : key === "channel" ? "production" : key === "n" ? "3" : key === "name" ? "savings" : UUID;
  }
  return sample;
}

const LIST_OPERATIONS = listOperations().filter(
  (op) => (op.id.endsWith(".list") && op.id !== "event.list") || op.id === "dataset.cases",
);

describe("registry covers the catalog", () => {
  it("has exactly one entry per catalog row, in catalog order", () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual(OPERATION_CATALOG.map((e) => e.id).sort());
    expect(listOperations().map((op) => op.id)).toEqual(OPERATION_CATALOG.map((e) => e.id));
    expect(OPERATION_CATALOG).toHaveLength(125);
  });

  it("knows its own ids", () => {
    expect(isOperationId("set.publish")).toBe(true);
    expect(isOperationId("set.delete")).toBe(false);
    expect(isOperationId("toString")).toBe(false);
  });

  it.each(OPERATION_CATALOG.map((e) => [e.id, e] as const))("%s matches its catalog row", (id, entry) => {
    const op = getOperation(id);
    const d = op.descriptor;
    expect(op.catalog).toEqual(entry);
    expect(d.id).toBe(id);
    expect(d.http).toEqual({ method: entry.method, path: entry.path });
    expect(d.readOnly).toBe(entry.risk === "read");
    expect(d.towardSafety).toBe(entry.risk === "safety");
    expect(d.actors).toEqual(catalogActors(entry));
    expect(d.risk).toBe(entry.risk === "high" ? "high" : entry.risk === "high*" ? "high*" : "normal");
    const scope =
      entry.scope === "session_only" || entry.scope === "platform_admin" ? "any" : entry.scope;
    expect(d.scope).toBe(scope);
    expect(d.minRole).toBe(entry.minRole === "requested_operation" ? "viewer" : entry.minRole);
    expect(d.summary.length).toBeGreaterThan(0);
    // Read-only operations emit nothing. set.codegen is the one exception: with appId it records a binding.
    if (d.readOnly && id !== "set.codegen") expect(d.emits).toEqual([]);
  });
});

describe("request layout", () => {
  it.each(listOperations().map((op) => [op.id, op] as const))("%s maps every input key to the request", (_id, op) => {
    const keys = Object.keys(op.input.shape);
    const body = op.request.body;
    const bodyKeys = body.kind === "fields" ? body.keys : body.kind === "whole" ? [body.key] : [];
    expect([...op.request.path, ...op.request.query, ...bodyKeys].sort()).toEqual([...keys].sort());
    if (op.catalog.method === "GET" || op.catalog.method === "DELETE") expect(body.kind).toBe("none");
  });
});

describe("placeholders", () => {
  const sources = [
    "runs.ts",
    "sets.ts",
    "releases.ts",
    "datasets.ts",
    "review.ts",
    "learning.ts",
    "studio.ts",
    "apps.ts",
    "reports.ts",
    "identity.ts",
    "platform.ts",
  ].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));

  /** The source block of each defineOperation call, keyed by id. */
  const blocks = new Map<string, string>();
  for (const source of sources) {
    for (const block of source.split('defineOperation("').slice(1)) {
      blocks.set(block.slice(0, block.indexOf('"')), block);
    }
  }

  it("finds a source block for every operation", () => {
    expect([...blocks.keys()].sort()).toEqual(OPERATION_CATALOG.map((e) => e.id).sort());
  });

  it.each(listOperations().map((op) => [op.id, op] as const))(
    "%s marks each open shape with its catalog phase",
    (id, op) => {
      const block = blocks.get(id) ?? "";
      const marks = [...block.matchAll(/\/\/ shape: Phase (\S+), owner Platform \/ Tenancy/g)].map((m) => m[1]);
      const open = Number(op.placeholder.input) + Number(op.placeholder.output);
      expect(marks).toEqual(Array.from({ length: open }, () => op.phase));
    },
  );

  it("accepts any extra keys on a placeholder input", () => {
    for (const op of listOperations().filter((o) => o.placeholder.input)) {
      expect(op.prepare({ ...pathInput(op.id), anything: { nested: [1, 2] } }).ok).toBe(true);
    }
  });

  it("gives every list operation limit, cursor and a { data, nextCursor } page", () => {
    expect(LIST_OPERATIONS.length).toBeGreaterThan(20);
    for (const op of LIST_OPERATIONS) {
      const call = op.prepare(pathInput(op.id));
      expect(call.ok).toBe(true);
      if (call.ok) expect(call.call.input).toMatchObject({ limit: LIST_LIMIT_DEFAULT });
      expect(op.prepare({ ...pathInput(op.id), limit: String(LIST_LIMIT_MAX), cursor: "c1" }).ok).toBe(true);
      expect(op.prepare({ ...pathInput(op.id), limit: String(LIST_LIMIT_MAX + 1) }).ok).toBe(false);
      expect(op.output.safeParse({ data: [], nextCursor: null }).success).toBe(true);
      expect(op.output.safeParse({ data: [] }).success).toBe(false);
    }
  });
});

describe("jobs, previews and MCP tools", () => {
  it("returns 202 JobAccepted from exactly the job operations", () => {
    const jobs = listOperations().filter((op) => op.descriptor.async);
    expect(jobs.map((op) => op.id).sort()).toEqual(
      ["dataset.export", "eval.run", "policy.suggest", "set.compare", "set.improve", "set.try_model", "studio.calibrate"].sort(),
    );
    for (const op of jobs) {
      expect(op.output).toBe(JobAccepted);
      expect(op.successStatus).toBe(202);
    }
  });

  it("accepts ?dryRun=true on publish, rollback, promote, rollout change and try-model only", () => {
    const previews = listOperations().filter((op) => op.descriptor.dryRun).map((op) => op.id);
    expect(previews.sort()).toEqual(
      ["channel.promote", "channel.rollback", "rollout.change", "set.publish", "set.try_model"].sort(),
    );
  });

  it("maps the curated MCP tools from headless-and-agents.md, none of them session only", () => {
    const tools = new Map<string, string[]>();
    for (const op of listOperations()) {
      if (op.descriptor.mcp === undefined) continue;
      expect(op.descriptor.actors).not.toEqual(["user"]);
      tools.set(op.descriptor.mcp.tool, [...(tools.get(op.descriptor.mcp.tool) ?? []), op.id]);
    }
    expect(Object.fromEntries(tools)).toEqual({
      list_projects: ["project.list"],
      list_goals: ["goal.list"],
      create_goal: ["goal.create"],
      list_templates: ["template.list"],
      list_sets: ["set.list"],
      get_set: ["set.get"],
      create_set: ["set.create"],
      get_draft: ["draft.get"],
      update_draft: ["draft.update"],
      validate_draft: ["draft.validate"],
      diff_versions: ["version.diff"],
      list_datasets: ["dataset.list"],
      create_dataset: ["dataset.create"],
      import_dataset_cases: ["dataset.import"],
      run_set: ["set.run"],
      start_eval: ["eval.run"],
      get_job: ["job.get"],
      publish: ["set.publish"],
      rollback: ["channel.rollback"],
      promote: ["channel.promote"],
      change_rollout: ["rollout.change"],
      get_rollout_gates: ["rollout.get"],
      list_review_items: ["review.list"],
      resolve_review_item: ["review.resolve"],
      report_feedback: ["feedback.report"],
      list_models: ["model.list"],
      list_events: ["event.list"],
      get_approval: ["approval.get"],
      get_report: ["report.get"],
      get_set_health: ["health.get"],
      suggest_thresholds: ["policy.suggest"],
      improve_set: ["set.improve"],
      update_set: ["set.update"],
      list_proposals: ["proposal.list"],
      decide_proposal: ["proposal.accept", "proposal.reject"],
      try_model: ["set.try_model"],
      start_experiment: ["experiment.start"],
      get_experiment: ["experiment.get"],
      decide_experiment: ["experiment.promote", "experiment.stop"],
      create_app: ["app.create"],
      add_opportunity: ["opportunity.create"],
      update_opportunity: ["opportunity.update"],
      generate_client: ["set.codegen"],
    });
  });
});

describe("stubbed handlers", () => {
  /** Operations whose input can be built from path params alone. */
  const buildable = listOperations().filter(
    (op) =>
      op.placeholder.input ||
      LIST_OPERATIONS.includes(op) ||
      Object.keys(op.input.shape).every((k) => op.request.path.includes(k)),
  );

  it("covers most operations", () => {
    expect(buildable.length).toBeGreaterThan(90);
  });

  it.each(buildable.map((op) => [op.id, op] as const))("%s throws not_implemented with its phase", async (id, op) => {
    const prepared = op.prepare(pathInput(id));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const error = await prepared.call.handle(ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OperationNotImplementedError);
    expect(error).toMatchObject({ code: "not_implemented", operationId: id, phase: op.phase, status: 501 });
  });
});

describe("real input shapes", () => {
  it("set.run takes the api.md run request", () => {
    const call = prepare("set.run", {
      ref: "email-triage@draft",
      channel: "staging",
      state: { email: { from: "a@example.com", subject: "Hi", body: "..." } },
      options: {
        includeProbabilities: true,
        dryRun: false,
        externalRef: "ticket_48213",
        metadata: { tokensBefore: 120000, tokensAfter: 18000 },
      },
    });
    expect(call.scope).toBe("run");
    expect(rejects("set.run", { ref: "x", state: {}, rollout: "full" })).toBe(true);
  });

  it("draft.update takes the strict spec and rejects a rollout key", () => {
    expect(prepare("draft.update", { ref: "email-triage", spec: exampleSpec }).input).toMatchObject({ ref: "email-triage" });
    const withRollout = { ...(exampleSpec as Record<string, unknown>), rollout: "full" };
    const result = getOperation("draft.update").prepare({ ref: "email-triage", spec: withRollout });
    expect(result.ok).toBe(false);
  });

  it("draft.validate takes any JSON object, or nothing", () => {
    expect(prepare("draft.validate", { ref: "s", spec: { rollout: "full" } }).input).toBeTruthy();
    expect(prepare("draft.validate", { ref: "s" }).input).toEqual({ ref: "s" });
  });

  it("version.diff takes version numbers, draft or channel names from the query", () => {
    expect(prepare("version.diff", { ref: "s", from: "7", to: "draft" }).input).toEqual({ ref: "s", from: 7, to: "draft" });
    expect(prepare("version.diff", { ref: "s", from: "production", to: "staging" }).input).toMatchObject({ from: "production" });
    expect(rejects("version.diff", { ref: "s", from: "0", to: "draft" })).toBe(true);
    expect(rejects("version.diff", { ref: "s", from: "latest", to: "draft" })).toBe(true);
  });

  it("set.compare needs exactly one of states or datasetId", () => {
    expect(prepare("set.compare", { ref: "s", from: 1, to: "draft", states: [{ a: 1 }] }).input).toBeTruthy();
    expect(prepare("set.compare", { ref: "s", from: 1, to: "draft", datasetId: UUID }).input).toBeTruthy();
    expect(rejects("set.compare", { ref: "s", from: 1, to: "draft" })).toBe(true);
    expect(rejects("set.compare", { ref: "s", from: 1, to: "draft", states: [{}], datasetId: UUID })).toBe(true);
  });

  it("eval.run takes a version number or draft", () => {
    expect(prepare("eval.run", { setRef: "s", version: "draft", datasetId: UUID }).input).toBeTruthy();
    expect(rejects("eval.run", { setRef: "s", version: 0, datasetId: UUID })).toBe(true);
  });

  it("event.list splits ?types= and caps limit at 500", () => {
    expect(prepare("event.list", { types: "set.published,rollout.changed" }).input).toEqual({
      types: ["set.published", "rollout.changed"],
      limit: 100,
    });
    expect(rejects("event.list", { types: "set.published,nope" })).toBe(true);
    expect(rejects("event.list", { limit: "501" })).toBe(true);
  });

  it("set.update takes a labeling policy and gate margins", () => {
    expect(
      prepare("set.update", {
        ref: "s",
        labeling: DEFAULT_LABELING_POLICY,
        gateMargins: { coverageDrop: 0.02, reviewLoadRise: 0.1 },
      }).input,
    ).toBeTruthy();
    expect(rejects("set.update", { ref: "s", slug: "renamed" })).toBe(true);
  });

  it("feedback.report takes 1 to 1,000 items", () => {
    expect(rejects("feedback.report", { items: [] })).toBe(true);
  });
});

describe("scope and risk functions", () => {
  it("picks release:<channel> from the channel", () => {
    const publish = (channel: string) =>
      prepare("set.publish", { ref: "s", channel, changelog: "c" });
    expect(publish("staging").scope).toBe("release:staging");
    expect(publish("production").scope).toBe("release:production");
    expect(prepare("rollout.change", { ref: "s", channel: "staging", stage: "shadow", reason: "r" }).scope).toBe(
      "release:staging",
    );
    expect(prepare("channel.promote", { ref: "s", channel: "production" }).scope).toBe("release:production");
  });

  it("set.publish is high on a protected or live production set, and always with skipExperiment", () => {
    const risk = (input: Record<string, unknown>, resource: RiskResource) =>
      prepare("set.publish", { ref: "s", changelog: "c", ...input }).risk(ctx, resource);
    expect(risk({ channel: "staging" }, stages("full", null, true))).toBe("normal");
    expect(risk({ channel: "production" }, quiet)).toBe("normal");
    expect(risk({ channel: "production" }, stages(null, null, true))).toBe("high");
    expect(risk({ channel: "production" }, stages("controlled"))).toBe("high");
    expect(risk({ channel: "staging", skipExperiment: { reason: "hotfix" } }, quiet)).toBe("high");
  });

  it("channel.promote follows the production publish rule", () => {
    const risk = (input: Record<string, unknown>, resource: RiskResource) =>
      prepare("channel.promote", { ref: "s", channel: "production", ...input }).risk(ctx, resource);
    expect(risk({}, quiet)).toBe("normal");
    expect(risk({}, stages("full"))).toBe("high");
    expect(risk({ skipExperiment: { reason: "r" } }, quiet)).toBe("high");
  });

  it.each([
    ["inactive", "shadow", "normal"],
    ["shadow", "controlled", "high"],
    ["controlled", "full", "high"],
    ["full", "controlled", "normal"],
    ["controlled", "shadow", "normal"],
    ["full", "paused", "normal"],
    ["paused", "shadow", "high"],
    ["paused", "inactive", "high"],
    ["shadow", "inactive", "normal"],
    [null, "controlled", "high"],
    [null, "shadow", "normal"],
    [null, "paused", "normal"],
  ] as const)("rollout %s to %s is %s", (from, to, expected) => {
    expect(rolloutChangeRisk(from as RolloutStage | null, to)).toBe(expected);
  });

  it("rollout.change reads the target channel's own stage", () => {
    const risk = (channel: string, stage: string, resource: RiskResource) =>
      prepare("rollout.change", { ref: "s", channel, stage, reason: "r" }).risk(ctx, resource);
    expect(risk("production", "controlled", stages("full"))).toBe("normal");
    expect(risk("production", "controlled", stages(null))).toBe("high");
    expect(risk("staging", "paused", quiet)).toBe("normal");
    // Staging is judged on its own pointer, not on production's.
    expect(risk("staging", "shadow", stages("full", "paused"))).toBe("high");
    expect(risk("staging", "controlled", stages("shadow", "full"))).toBe("normal");
    expect(risk("staging", "full", stages("full", "controlled"))).toBe("high");
    expect(risk("staging", "shadow", stages("shadow", "inactive"))).toBe("normal");
  });

  it("set.update is high only when storageMode moves to a less private mode", () => {
    const risk = (input: Record<string, unknown>, storageMode: RiskResource["storageMode"]) =>
      prepare("set.update", { ref: "s", ...input }).risk(ctx, { ...quiet, storageMode });
    expect(risk({ name: "n" }, "hash_only")).toBe("normal");
    expect(risk({ storageMode: "full" }, "hash_only")).toBe("high");
    expect(risk({ storageMode: "redacted" }, "hash_only")).toBe("high");
    expect(risk({ storageMode: "full" }, "redacted")).toBe("high");
    expect(risk({ storageMode: "hash_only" }, "full")).toBe("normal");
    expect(risk({ storageMode: "redacted" }, "full")).toBe("normal");
    expect(risk({ storageMode: "full" }, null)).toBe("high");
  });

  it("set.update takes every setting data-model.md routes through it", () => {
    expect(rejects("set.update", { ref: "s", storageMode: "hash_only", userGenerated: true, resultCacheTtlSeconds: null })).toBe(false);
    expect(rejects("set.update", { ref: "s", resultCacheTtlSeconds: 0 })).toBe(true);
    expect(rejects("set.update", { ref: "s", storageMode: "none" })).toBe(true);
  });

  it("experiment.start is high above a 25 percent sample", () => {
    const risk = (samplePct: number) =>
      prepare("experiment.start", {
        ref: "s",
        channel: "production",
        challengerVersionId: UUID,
        kind: "version",
        samplePct,
        minRuns: 500,
        minLabeled: 100,
      }).risk(ctx, quiet);
    expect(risk(0.25)).toBe("normal");
    expect(risk(0.3)).toBe("high");
  });

  it("app_token.create is high for write scopes, except feedback:write on sk_test_ bound to staging", () => {
    const risk = (prefix: string, channel: string, scopes: string[]) =>
      prepare("app_token.create", { id: UUID, prefix, channel, scopes }).risk(ctx, quiet);
    expect(risk("sk_live_", "production", ["run", "sets:read"])).toBe("normal");
    expect(risk("sk_test_", "staging", ["run", "feedback:write"])).toBe("normal");
    expect(risk("sk_live_", "staging", ["run", "feedback:write"])).toBe("high");
    expect(risk("sk_test_", "production", ["feedback:write"])).toBe("high");
    expect(risk("sk_test_", "staging", ["feedback:write", "review:write"])).toBe("high");
  });

  it("agent_token.create is high for any write scope and when scopes are unreadable", () => {
    const risk = (input: Record<string, unknown>) => prepare("agent_token.create", input).risk(ctx, quiet);
    expect(risk({ scopes: ["sets:read", "runs:read"] })).toBe("normal");
    expect(risk({ scopes: ["admin:write"] })).toBe("high");
    expect(risk({ scopes: ["release:staging"] })).toBe("high");
    expect(risk({})).toBe("high");
  });

  it("settings.update is high when it touches PII, retention or agentApprovals", () => {
    const risk = (input: Record<string, unknown>) => prepare("settings.update", input).risk(ctx, quiet);
    expect(risk({ allowPreviewModels: true })).toBe("normal");
    expect(risk({ piiMode: "redact_logs" })).toBe("high");
    expect(risk({ stateRetentionDays: 7 })).toBe("high");
    expect(risk({ agentApprovals: "all" })).toBe("high");
  });

  it("uses the catalog risk for fixed rows", () => {
    expect(prepare("member.invite", {}).risk(ctx, quiet)).toBe("high");
    expect(prepare("channel.rollback", { ref: "s", channel: "production" }).risk(ctx, quiet)).toBe("normal");
    expect(getOperation("channel.rollback").descriptor.towardSafety).toBe(true);
  });
});
