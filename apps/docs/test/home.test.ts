import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Decision, RunCost, RunResultObject } from "@bandwise/core/contracts";
import { describe, expect, it } from "vitest";
import { codeSamples, copyText, quickLinks, receipt, runResultExample, steps } from "~/lib/home-example";

const CONTENT_DIR = join(process.cwd(), "content/docs");

function pageExists(href: string): boolean {
  const slug = href.replace(/^\/docs\/?/, "");
  if (slug === "") return true;
  return existsSync(join(CONTENT_DIR, `${slug}.mdx`)) || existsSync(join(CONTENT_DIR, slug, "index.mdx"));
}

describe("docs home example", () => {
  it("uses only RunResult field names from the contract", () => {
    const top = Object.keys(RunResultObject.shape);
    for (const key of Object.keys(runResultExample)) expect(top).toContain(key);
    const cost = Object.keys(RunCost.shape);
    for (const key of Object.keys(runResultExample.cost)) expect(cost).toContain(key);
    const decision = Object.keys(Decision.shape);
    for (const d of Object.values(runResultExample.decisions)) {
      for (const key of Object.keys(d)) expect(decision).toContain(key);
    }
  });

  it("has values the contract accepts", () => {
    const { decisions, cost, ...rest } = runResultExample;
    expect(() => RunResultObject.pick({ runId: true, channel: true, rollout: true, status: true, modelRequested: true, modelResolved: true, runBand: true, overallAction: true, route: true, warnings: true }).parse(rest)).not.toThrow();
    for (const d of Object.values(decisions)) expect(() => Decision.parse(d)).not.toThrow();
    expect(() => RunCost.partial().strict().parse(cost)).not.toThrow();
  });

  it("matches the receipt it explains", () => {
    expect(runResultExample.runBand).toBe(receipt.band.tone);
    expect(receipt.cost.systemOne).toBe(`$${runResultExample.cost.systemOneCostUsd.toFixed(5)}`);
  });

  it("links only to pages that exist", () => {
    for (const link of [...Object.values(receipt.links), ...quickLinks]) expect(pageExists(link.href), link.href).toBe(true);
  });

  it("shows only real CLI commands", () => {
    const quickstart = readFileSync(join(CONTENT_DIR, "quickstart.mdx"), "utf8");
    const cli = readFileSync(join(CONTENT_DIR, "cli.mdx"), "utf8");
    const sample = codeSamples.find((s) => s.id === "cli");
    if (sample === undefined) throw new Error("no CLI sample");
    for (const line of copyText(sample).split("\n")) expect(`${quickstart}\n${cli}`).toContain(line.replace(/^bandwise /, ""));
    for (const step of steps) if (step.command.includes(" ")) expect(`${quickstart}\n${cli}`).toContain(step.command);
  });
});
