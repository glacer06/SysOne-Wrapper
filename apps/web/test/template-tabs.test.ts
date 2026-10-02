import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { groupLabels, useCases } from "../src/lib/use-cases";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("template list", () => {
  it("lists nine templates, each in one of the tab groups", () => {
    expect(useCases).toHaveLength(9);
    expect(new Set(useCases.map((u) => u.id)).size).toBe(9);
    const groups = Object.keys(groupLabels);
    for (const u of useCases) expect(groups).toContain(u.group);
    for (const g of groups) expect(useCases.some((u) => u.group === g)).toBe(true);
  });

  it("keeps each job line short", () => {
    for (const u of useCases) expect(u.job.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

describe("template tabs", () => {
  const src = readFileSync(join(root, "src/components/template-tabs.tsx"), "utf8");

  it("uses the ARIA tabs pattern with a roving tabindex and the arrow, Home and End keys", () => {
    for (const needle of ['role="tablist"', 'role="tab"', 'role="tabpanel"', "aria-selected", "aria-controls", "aria-labelledby", "tabIndex"]) {
      expect(src).toContain(needle);
    }
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(src).toContain(`"${key}"`);
  });

  it("renders every panel on the server and shows them all without JavaScript", () => {
    expect(src).toContain("<noscript>");
    expect(src).toContain("hidden={i !== active}");
  });
});
