import { describe, expect, it } from "vitest";
import { type RewriteCounts, dropTests, rewriteComments, rewriteProse, rewriteTestTitles } from "./rewrite.js";

const opts = { internalDocNames: ["api.md", "spec-schema.md", "savings-model.md", "architecture.md", "management-api.md"] };

const prose = (text: string): string => rewriteProse(text, opts, {});
const code = (text: string): string => rewriteComments(text, "f.ts", opts, {});

describe("rewriteProse", () => {
  it.each([
    ["The evaluator (spec-schema.md section 2). Conditions are data.", "The evaluator. Conditions are data."],
    ["the alert (ADR-012 Amendment 1): text", "the alert: text"],
    ["Barrel for the contracts in architecture.md and phase-0.md.", "Barrel for the contracts."],
    ["parses the api.md preflight example", "parses the documented preflight example"],
    ["Rules live here. See spec-schema.md section 4. More text.", "Rules live here. More text."],
    ["Money math; see savings-model.md", "Money math"],
    ["Plain text with https://docs.typesafe.ai/api.md stays.", "Plain text with https://docs.typesafe.ai/api.md stays."],
    ["Chosen per golden rule 3.", "Chosen."],
    ["This keeps golden rule 3 true.", "This keeps a project rule true."],
    ["Moved after ADR-011 landed.", "Moved after a design decision landed."],
  ])("%j", (input, expected) => {
    expect(prose(input)).toBe(expected);
  });

  it("drops a Sources list that spans lines and keeps the line count", () => {
    const input = " Sources: references/api.md (Errors), ADR-007 section 5,\n references/spec-schema.md (gates).\n Next.";
    const out = prose(input);
    expect(out.split("\n")).toHaveLength(3);
    expect(out.replace(/\s+/g, " ").trim()).toBe("Next.");
  });

  it("counts what it changed", () => {
    const counts: RewriteCounts = {};
    rewriteProse("a (ADR-001) b (api.md)", opts, counts);
    expect(counts).toEqual({ "comment.parenthetical": 2 });
  });
});

describe("rewriteComments", () => {
  it("never touches code, strings or regexes", () => {
    const src = [
      'const a = "ADR-012 (api.md)"; // why (ADR-012)',
      "const re = /\\(api\\.md\\)/;",
      "const t = `see api.md`;",
      "",
    ].join("\n");
    expect(code(src)).toBe(['const a = "ADR-012 (api.md)"; // why', "const re = /\\(api\\.md\\)/;", "const t = `see api.md`;", ""].join("\n"));
  });

  it("deletes a comment line that only held pointers, and a trailing pointer comment", () => {
    expect(code("// Source: references/api.md (Errors).\nexport const x = 1; // (ADR-003)\n")).toBe("export const x = 1;\n");
  });

  it("joins consecutive line comments so a parenthetical can span them", () => {
    const src = "// Per-org cache (architecture.md, SDK usage: \"one client per\n// org key\"). The key never holds the secret.\nexport {};\n";
    expect(code(src)).toBe("// Per-org cache.\n// The key never holds the secret.\nexport {};\n");
  });

  it("keeps JSDoc shape, indent and the closing space of a one-line comment", () => {
    const src = [
      "/** Job kinds (management-api.md, Jobs). */",
      "export const a = 1;",
      "  /**",
      "   * The upgrade candidates (spec-schema.md sections 6 and 11): live sets.",
      "   *",
      "   * See api.md.",
      "   */",
      "export const b = 2;",
      "",
    ].join("\n");
    expect(code(src)).toBe(
      ["/** Job kinds. */", "export const a = 1;", "  /**", "   * The upgrade candidates: live sets.", "   */", "export const b = 2;", ""].join("\n"),
    );
  });

  it("removes a block comment that only held pointers", () => {
    expect(code("/** (ADR-009) */\nexport const x = 1;\n")).toBe("export const x = 1;\n");
  });

  it("leaves a file with no internal pointers byte for byte", () => {
    const src = "#!/usr/bin/env node\n// Entry point.\n/** Docs at https://docs.typesafe.ai/api.md */\nexport const f = (): void => {};\n";
    expect(code(src)).toBe(src);
  });
});

describe("rewriteTestTitles", () => {
  it("rewrites literal titles of it, describe and it.each only", () => {
    const src = [
      'describe("errors (ADR-007)", () => {',
      '  it("parses the api.md example", () => {});',
      '  it.each([1])("row %s (ADR-012)", () => {});',
      '  expect("ADR-001").toBe("ADR-001");',
      "});",
      "",
    ].join("\n");
    const counts: RewriteCounts = {};
    const out = rewriteTestTitles(src, "f.test.ts", opts, counts);
    expect(out).toBe(
      [
        'describe("errors", () => {',
        '  it("parses the documented example", () => {});',
        '  it.each([1])("row %s", () => {});',
        '  expect("ADR-001").toBe("ADR-001");',
        "});",
        "",
      ].join("\n"),
    );
    expect(counts["test-title.parenthetical"]).toBe(2);
  });
});

describe("dropTests", () => {
  const src = [
    'import { readFileSync } from "node:fs";',
    'import { describe, expect, it } from "vitest";',
    "",
    'describe("a", () => {',
    '  it("keeps this", () => {',
    "    expect(1).toBe(1);",
    "  });",
    "",
    '  it("matches the doc table", () => {',
    '    expect(readFileSync("x", "utf8")).toBe("");',
    "  });",
    "});",
    "",
  ].join("\n");

  it("removes the named test and imports it alone used", () => {
    const { text, dropped } = dropTests(src, "a.test.ts", ["matches the doc table"]);
    expect(dropped).toEqual(["matches the doc table"]);
    expect(text).not.toContain("readFileSync");
    expect(text).toContain('it("keeps this"');
    expect(text).toContain('import { describe, expect, it } from "vitest";');
  });

  it("fails loudly when a title is gone", () => {
    expect(() => dropTests(src, "a.test.ts", ["no such test"])).toThrow(/no test titled "no such test"/);
  });
});
