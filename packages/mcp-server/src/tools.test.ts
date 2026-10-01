import { OPERATION_CATALOG } from "@bandwise/core/contracts";
import { describe, expect, it } from "vitest";

import { GATE_TOOLS } from "./tools.js";

const EXPECTED: Record<string, { operation: string; scope: string }> = {
  bandwise_check_done: { operation: "set.run", scope: "run" },
  bandwise_check_action: { operation: "set.run", scope: "run" },
  // ADR-021 says report.get, which is still a stub, so this maps to usage.get.
  bandwise_get_savings: { operation: "usage.get", scope: "usage:read" },
  bandwise_list_review_items: { operation: "review.list", scope: "review:read" },
  bandwise_resolve_review_item: { operation: "review.resolve", scope: "review:write" },
  bandwise_report_feedback: { operation: "feedback.report", scope: "feedback:write" },
};

const byName = (name: string) => {
  const t = GATE_TOOLS.find((x) => x.name === name);
  if (t === undefined) throw new Error(`missing tool ${name}`);
  return t;
};

describe("GATE_TOOLS", () => {
  it("has exactly the six tools with unique valid names", () => {
    const names = GATE_TOOLS.map((t) => t.name);
    expect(names.slice().sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(new Set(names).size).toBe(6);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]{1,64}$/);
  });

  it("maps to the ADR operations and scopes, all present in the catalog", () => {
    for (const t of GATE_TOOLS) {
      const want = EXPECTED[t.name];
      expect(t.operation).toBe(want?.operation);
      expect(t.scope).toBe(want?.scope);
      const entry = OPERATION_CATALOG.find((e) => e.id === t.operation);
      expect(entry, t.operation).toBeDefined();
      expect(t.scope).toBe(entry?.scope);
    }
  });

  it("never maps to publish, release, rollout, set editing or admin operations", () => {
    for (const t of GATE_TOOLS) {
      expect(t.operation).not.toMatch(/^(release\.|rollout\.|admin\.|platform\.)/);
      expect(["set.publish", "rollout.change", "set.update", "set.create"]).not.toContain(t.operation);
    }
  });

  it("has plain descriptions and the right hints", () => {
    for (const t of GATE_TOOLS) {
      expect(t.description.startsWith("Use this")).toBe(true);
      expect(t.description.length).toBeLessThan(500);
      expect(t.description).not.toContain("—");
    }
    for (const n of ["bandwise_check_done", "bandwise_check_action", "bandwise_get_savings", "bandwise_list_review_items"]) {
      expect(byName(n).annotations.readOnlyHint).toBe(true);
    }
    expect(byName("bandwise_resolve_review_item").annotations.destructiveHint).toBe(true);
  });

  it("gives check tools a closed input schema and a default set", () => {
    for (const n of ["bandwise_check_done", "bandwise_check_action"]) {
      const t = byName(n);
      expect(t.inputSchema?.additionalProperties).toBe(false);
      expect(Array.isArray(t.inputSchema?.required)).toBe(true);
      expect((t.inputSchema?.required as string[]).length).toBeGreaterThan(0);
      expect(typeof t.defaultSet).toBe("string");
      expect(t.defaultSet?.length).toBeGreaterThan(0);
    }
    const props = byName("bandwise_check_action").inputSchema?.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty("content_preview");
  });

  it("leaves operation tools without an input schema", () => {
    for (const t of GATE_TOOLS.filter((x) => x.kind === "operation")) {
      expect(t.inputSchema).toBeUndefined();
    }
  });
});
