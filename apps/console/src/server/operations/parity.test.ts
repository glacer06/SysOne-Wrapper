// Parity test skeleton (management-api.md, OpenAPI and the parity test; testing.md).
// Phase 0 checks the registry against the catalog and the committed openapi.json. Route
// handlers (Phase 2) and CLI commands (Phase 3) join the checks when they exist.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NON_OPERATION_ROUTES, OPERATION_CATALOG } from "@bandwise/core";
import { GATE_TOOLS } from "@bandwise/mcp-server";
import { describe, expect, it } from "vitest";

import { renderOpenApi, type OpenApiDocument } from "./openapi";
import { OPERATIONS } from "./registry";

const ROOT = new URL("../../../../../", import.meta.url);
const OPENAPI_FILE = new URL("packages/core/openapi.json", ROOT);

const committedText = existsSync(OPENAPI_FILE) ? readFileSync(OPENAPI_FILE, "utf8") : "";
const committed = (committedText === "" ? { paths: {} } : JSON.parse(committedText)) as OpenApiDocument;

/** Every operation in the committed document, keyed by operationId. */
const documented = new Map<string, { method: string; path: string; op: Record<string, unknown> }>();
for (const [path, item] of Object.entries(committed.paths)) {
  for (const [method, op] of Object.entries(item)) {
    documented.set(String(op["operationId"]), { method: method.toUpperCase(), path, op });
  }
}

describe("parity: catalog, registry and openapi.json", () => {
  it("packages/core/openapi.json is committed and current (run `pnpm openapi` to regenerate)", () => {
    expect(committedText.length).toBeGreaterThan(0);
    expect(committedText === renderOpenApi()).toBe(true);
  });

  it.each(OPERATION_CATALOG.map((e) => [e.id, e] as const))("%s has a registry entry and an OpenAPI path", (id, entry) => {
    expect(OPERATIONS[id].id).toBe(id);
    const doc = documented.get(id);
    expect(doc).toBeDefined();
    expect(doc?.method).toBe(entry.method);
    expect(doc?.path).toBe(entry.path);
    expect(doc?.op["x-bandwise-scope"]).toBe(entry.scope);
    expect(doc?.op["x-bandwise-min-role"]).toBe(entry.minRole);
    expect(doc?.op["x-bandwise-risk"]).toBe(entry.risk);
    expect(doc?.op["x-bandwise-actors"]).toEqual(OPERATIONS[id].descriptor.actors);
  });

  it("documents no operation that is missing from the catalog", () => {
    expect([...documented.keys()].sort()).toEqual(OPERATION_CATALOG.map((e) => e.id).sort());
  });

  it("keeps the non-operation routes (device flow, jwks, openapi.json) out of the registry", () => {
    const routes = new Set(OPERATION_CATALOG.map((e) => `${e.method} ${e.path}`));
    for (const route of NON_OPERATION_ROUTES) {
      expect(routes.has(`${route.method} ${route.path}`)).toBe(false);
    }
    expect(OPERATION_CATALOG.some((e) => e.path.startsWith("/api/v1/auth/"))).toBe(false);
  });

  it("maps every curated MCP tool to an operation that is not session only", () => {
    const tools = [...documented.values()].filter((d) => d.op["x-bandwise-mcp-tool"] !== undefined);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(tool.op["x-bandwise-actors"]).not.toEqual(["user"]);
  });

  it("keeps repositories out of the console org and platform pages", () => {
    const appDir = fileURLToPath(new URL("apps/console/src/app/", ROOT));
    const pages = ["(org)", "(platform)"].map((d) => join(appDir, d)).filter((d) => existsSync(d));
    for (const file of pages.flatMap(sourceFiles)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["']@bandwise\/db["']/);
    }
  });

  it("serves /api/v1 through the generic adapter, the run route and the public OpenAPI document, and nothing else", () => {
    const v1 = fileURLToPath(new URL("apps/console/src/app/api/v1/", ROOT));
    const routes = sourceFiles(v1).map((f) => f.slice(v1.length).replaceAll("\\", "/")).sort();
    expect(routes).toEqual(["[...path]/route.ts", "openapi.json/route.ts", "sets/[ref]/run/route.ts"]);
    expect(OPERATION_CATALOG.find((e) => e.id === "set.run")?.path).toBe("/api/v1/sets/{ref}/run");
  });
  it.todo("every bandwise CLI command maps to an operation that is not session only (Phase 3)");

  it.each(GATE_TOOLS.map((tool) => [tool.name, tool] as const))("MCP tool %s maps to a registry operation an agent may call, and is not high risk", (_name, tool) => {
    const entry = OPERATION_CATALOG.find((e) => e.id === tool.operation);
    expect(entry).toBeDefined();
    expect(OPERATIONS[tool.operation]).toBeDefined();
    expect(tool.scope).toBe(entry?.scope);
    expect(OPERATIONS[tool.operation].descriptor.actors).toContain("agent");
    expect(entry?.risk.startsWith("high")).toBe(false);
  });
  it.todo("the full curated MCP tool list in packages/mcp-server maps to registry entries (Phase 3)");
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
