// The Templates pages are generated from @bandwise/templates. This test fails when they drift.
// Refresh them with `pnpm --filter @bandwise/docs generate:templates`.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_IDS } from "@bandwise/templates";
import { describe, expect, it } from "vitest";
import { mdxText, renderTemplatePages } from "~/lib/template-pages";
import { source } from "~/lib/source";

const DIR = join(process.cwd(), "content/docs/templates");
const files = renderTemplatePages();

if (process.env["BANDWISE_WRITE_GENERATED"] === "1") {
  mkdirSync(DIR, { recursive: true });
  for (const f of readdirSync(DIR)) if (!(f in files)) throw new Error(`stale page ${f}: remove it by hand`);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(DIR, name), content);
}

describe("Templates section", () => {
  it.each(Object.keys(files))("%s matches the template pack", (name) => {
    const path = join(DIR, name);
    expect(existsSync(path), `${name} is missing; run pnpm --filter @bandwise/docs generate:templates`).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(files[name]);
  });

  it("has no pages for templates that left the pack", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(files).sort());
  });

  it("serves one page per template, plus the index and the find-decisions page", () => {
    const urls = source.getPages().map((p) => p.url);
    expect(urls).toContain("/docs/templates");
    expect(urls).toContain("/docs/find-decisions");
    for (const id of TEMPLATE_IDS) expect(urls).toContain(`/docs/templates/${id}`);
  });

  it("escapes MDX syntax outside code spans", () => {
    expect(mdxText("a {b} <c> `{d}`")).toBe("a \\{b\\} \\<c\\> `{d}`");
  });
});
