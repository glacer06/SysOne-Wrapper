import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SEED_MODEL_PROFILES, lint, parseSpec } from "@sysone/core";
import { createFromSource } from "fumadocs-core/search/server";
import { describe, expect, it } from "vitest";
import { OPENAPI_PATH, type ApiDocument, isPlatformOperation, listOperations, loadApiDocument, phaseLabel } from "~/lib/api-spec";
import { llmsFull, llmsIndex } from "~/lib/llms";
import { PRODUCT_TOKEN } from "~/lib/remark-product";
import { source } from "~/lib/source";
import { productName } from "~/site";

const CONTENT_DIR = join(process.cwd(), "content/docs");

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(full);
    return entry.name.endsWith(".mdx") ? [full] : [];
  });
}

/** content/docs/concepts/rollout.mdx -> /docs/concepts/rollout; index files map to their folder. */
function urlFor(file: string): string {
  const slug = relative(CONTENT_DIR, file).replace(/\.mdx$/, "").replace(/(^|\/)index$/, "");
  return slug === "" ? "/docs" : `/docs/${slug}`;
}

const files = mdxFiles(CONTENT_DIR);

describe("content loader and llms.txt", () => {
  it("finds every MDX page", () => {
    const urls = source.getPages().map((p) => p.url);
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) expect(urls).toContain(urlFor(file));
  });

  it("lists every page in llms.txt, MDX and generated API pages alike", async () => {
    const index = await llmsIndex();
    for (const page of source.getPages()) {
      expect(index, page.url).toContain(`${page.url})`);
    }
    expect(index).toContain(`# ${productName} docs`);
    expect(index).toContain("docs.typesafe.ai");
  });

  it("renders every page into llms-full.txt with the product name filled in", async () => {
    const full = await llmsFull();
    for (const page of source.getPages()) expect(full, page.url).toContain(`(${page.url})`);
    expect(full).not.toContain(PRODUCT_TOKEN);
    expect(full).toContain(`${productName} is a managed layer`);
    for (const page of source.getPages()) expect(page.data.title).not.toContain(PRODUCT_TOKEN);
  });
});

describe("search", () => {
  it("indexes every page, so the built-in search can find a concept page", async () => {
    for (const page of source.getPages()) {
      expect((page.data as { structuredData?: unknown }).structuredData, page.url).toBeTruthy();
    }
    const results = await createFromSource(source).search("kill switch");
    expect(results.some((r) => r.url.startsWith("/docs/concepts/rollout"))).toBe(true);
  });
});

describe("API reference", () => {
  const raw = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as ApiDocument;
  const doc = loadApiDocument();

  it("loads packages/core/openapi.json and keeps every customer operation", () => {
    const rawOps = listOperations(raw);
    const customerOps = rawOps.filter((o) => !isPlatformOperation(o.op));
    expect(customerOps.length).toBeGreaterThan(50);
    expect(listOperations(doc)).toHaveLength(customerOps.length);
    expect(doc.paths["/api/v1/sets/{ref}/run"]?.post?.operationId).toBe("set.run");
    expect(listOperations(doc).some((o) => isPlatformOperation(o.op))).toBe(false);
  });

  it("has one generated page per tag, each saying when it goes live", () => {
    const apiPages = source.getPages().filter((p) => p.type === "openapi");
    expect(apiPages.length).toBe(doc.tags?.length);
    for (const page of apiPages) expect(page.url.startsWith("/docs/api/")).toBe(true);
  });

  it("never dates an operation before the API goes live in Phase 3", () => {
    expect(phaseLabel([{ "x-sysone-phase": "2" }])).toBe("Phase 3");
    expect(phaseLabel([{ "x-sysone-phase": "3" }, { "x-sysone-phase": "4b" }])).toBe("Phases 3 to 4b");
    expect(phaseLabel([{ "x-sysone-phase": "3b" }, { "x-sysone-phase": "5" }, { "x-sysone-phase": "3b" }])).toBe("Phases 3b to 5");
  });
});

describe("quickstart example", () => {
  const mdx = readFileSync(join(CONTENT_DIR, "quickstart.mdx"), "utf8");
  const block = (title: string): unknown => {
    const match = new RegExp("```json title=\"" + title.replace(".", "\\.") + "\"\\n([\\s\\S]*?)\\n```").exec(mdx);
    if (match?.[1] === undefined) throw new Error(`no json block titled ${title}`);
    return JSON.parse(match[1]);
  };

  it("spec.json validates against the current contract with no lint errors", () => {
    const parsed = parseSpec(block("spec.json"));
    expect(parsed.ok ? [] : parsed.details).toEqual([]);
    if (!parsed.ok) return;
    const profile = SEED_MODEL_PROFILES.find((p) => p.id === parsed.spec.model) ?? null;
    expect(profile).not.toBeNull();
    expect(lint(parsed.spec, profile).filter((l) => l.severity === "error")).toEqual([]);
  });

  it("state.json is valid JSON with the fields the spec requires", () => {
    const state = block("state.json") as { email: Record<string, string> };
    expect(Object.keys(state.email).sort()).toEqual(["body", "from", "subject"]);
  });
});

describe("writing rules", () => {
  const banned = /\b(leverage|utilize|delve|seamless|robust|comprehensive|cutting-edge|streamline|empower|unlock|furthermore|moreover)\b/i;

  it.each(files.map((f) => [relative(CONTENT_DIR, f), f]))("%s has no em dashes, emojis or filler words", (_name, file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(banned);
  });
});
