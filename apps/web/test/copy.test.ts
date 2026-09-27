import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const copy = [read("../src/app/page.tsx"), read("../src/site.ts")].join("\n");

describe("marketing copy", () => {
  it("follows the writing rules", () => {
    expect(copy).not.toMatch(/—/);
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    const banned = /\b(leverage|utilize|delve|seamless|robust|comprehensive|cutting-edge|streamline|empower|unlock|furthermore|moreover)\b/i;
    expect(copy).not.toMatch(banned);
  });

  it("carries the independence line", () => {
    expect(copy).toContain("independent product built on TypeSafe's System One models");
  });
});
