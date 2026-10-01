import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SEED_MODEL_PROFILES, lint, parseSpec } from "@bandwise/core";
import { createFromSource } from "fumadocs-core/search/server";
import { describe, expect, it } from "vitest";
import {
  OPENAPI_PATH,
  type ApiDocument,
  breakInlineSchemaCycles,
  isPlatformOperation,
  listOperations,
  loadApiDocument,
  phaseLabel,
} from "~/lib/api-spec";
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

  // Component schemas that reach themselves through union members and array items only, the
  // path the renderer draws inline in a type label. Written apart from breakInlineSchemaCycles so
  // the test does not check the fix with itself.
  function inlineLoops(d: ApiDocument): string[] {
    const schemas = (d.components as { schemas?: Record<string, unknown> } | undefined)?.schemas ?? {};
    const found = new Set<string>();
    const visit = (node: unknown, root: string, seen: ReadonlySet<string>): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item, root, seen);
        return;
      }
      if (typeof node !== "object" || node === null) return;
      const n = node as Record<string, unknown>;
      if (typeof n.$ref === "string") {
        const name = n.$ref.replace("#/components/schemas/", "");
        if (name === root) found.add(root);
        else if (!seen.has(name)) visit(schemas[name], root, new Set([...seen, name]));
        return;
      }
      for (const key of ["anyOf", "oneOf", "allOf", "items"]) visit(n[key], root, seen);
    };
    for (const name of Object.keys(schemas)) visit(schemas[name], name, new Set([name]));
    return [...found].sort();
  }

  it("cuts JsonValue where the renderer would expand it forever, and leaves the source alone", () => {
    expect(inlineLoops(doc)).toContain("JsonValue");
    const fixed = breakInlineSchemaCycles(doc);
    expect(inlineLoops(fixed)).toEqual([]);
    expect(inlineLoops(doc)).toContain("JsonValue");

    const schemas = (fixed.components as { schemas: Record<string, { anyOf?: Array<Record<string, unknown>> }> }).schemas;
    const arrayMember = schemas.JsonValue?.anyOf?.find((m) => m.type === "array");
    expect(arrayMember?.items).toMatchObject({ title: "JsonValue" });
    expect(arrayMember?.items).not.toHaveProperty("$ref");
    // Condition only reaches itself through object properties, which open one level per click.
    expect(JSON.stringify(schemas.Condition)).toContain('"$ref":"#/components/schemas/Condition"');
  });

  it("cuts a loop that runs through more than one schema", () => {
    const loop: ApiDocument = {
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {},
      components: {
        schemas: {
          A: { anyOf: [{ type: "string" }, { $ref: "#/components/schemas/B" }] },
          B: { type: "array", items: { $ref: "#/components/schemas/A" } },
        },
      },
    };
    expect(inlineLoops(loop)).toEqual(["A", "B"]);
    expect(inlineLoops(breakInlineSchemaCycles(loop))).toEqual([]);
  });

  it("never dates an operation before the API goes live in Phase 3", () => {
    expect(phaseLabel([{ "x-bandwise-phase": "2" }])).toBe("Phase 3");
    expect(phaseLabel([{ "x-bandwise-phase": "3" }, { "x-bandwise-phase": "4b" }])).toBe("Phases 3 to 4b");
    expect(phaseLabel([{ "x-bandwise-phase": "3b" }, { "x-bandwise-phase": "5" }, { "x-bandwise-phase": "3b" }])).toBe("Phases 3b to 5");
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
