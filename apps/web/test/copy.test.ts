import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Every source file of every page and component, the llms.txt summary and the design notes.
const files = [
  ...walk(join(root, "src")).filter((f) => /\.(tsx?|css)$/.test(f)),
  join(root, "public/llms.txt"),
  join(root, "DESIGN.md"),
];

const banned =
  /\b(leverage|leveraging|utilize|utilizing|delve|seamless|seamlessly|robust|comprehensive|cutting-edge|streamline|empower|unlock|furthermore|moreover|revolutionize|elevate)\b/i;

describe("site copy follows the writing rules", () => {
  it("scans the pages, components, llms.txt and DESIGN.md", () => {
    const names = files.map((f) => relative(root, f));
    for (const expected of [
      "src/app/page.tsx",
      "src/app/privacy/page.tsx",
      "src/app/terms/page.tsx",
      "src/components/early-access-form.tsx",
      "src/components/savings-calculator.tsx",
      "public/llms.txt",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it.each(files.map((f) => [relative(root, f), f]))("%s has no em dashes, emoji or filler words", (_name, file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(banned);
  });

  it("never claims Jev never hallucinates or names accuracy for templates", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/never hallucinat/i);
    expect(all).not.toMatch(/as accurate as/i);
  });
});

describe("independence note", () => {
  it("is in site.ts and rendered by the footer on every page", () => {
    const site = readFileSync(join(root, "src/site.ts"), "utf8");
    expect(site).toContain("independent product built on TypeSafe's System One models");
    const footer = readFileSync(join(root, "src/components/site-footer.tsx"), "utf8");
    expect(footer).toContain("{independenceNote}");
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("<SiteFooter />");
  });
});
