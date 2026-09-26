// Parity test skeleton (management-api.md, OpenAPI and the parity test; testing.md).
// Phase 0 checks the registry against the catalog and the committed openapi.json. Route
// handlers (Phase 2) and CLI commands (Phase 3) join the checks when they exist.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NON_OPERATION_ROUTES, OPERATION_CATALOG } from "@sysone/core";
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
    expect(doc?.op["x-sysone-scope"]).toBe(entry.scope);
    expect(doc?.op["x-sysone-min-role"]).toBe(entry.minRole);
    expect(doc?.op["x-sysone-risk"]).toBe(entry.risk);
    expect(doc?.op["x-sysone-actors"]).toEqual(OPERATIONS[id].descriptor.actors);
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
    const tools = [...documented.values()].filter((d) => d.op["x-sysone-mcp-tool"] !== undefined);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(tool.op["x-sysone-actors"]).not.toEqual(["user"]);
  });

  it("keeps repositories out of the console org and platform pages", () => {
    const appDir = fileURLToPath(new URL("apps/console/src/app/", ROOT));
    const pages = ["(org)", "(platform)"].map((d) => join(appDir, d)).filter((d) => existsSync(d));
    for (const file of pages.flatMap(sourceFiles)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["']@sysone\/db["']/);
    }
  });

  it.todo("every /api/v1 route handler maps to one registry entry (Phase 2, generated from op.http)");
  it.todo("every sysone CLI command maps to an operation that is not session only (Phase 3)");
  it.todo("every MCP server tool in packages/mcp-server maps to its registry entry (Phase 3)");
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
