import { describe, expect, it } from "vitest";

import { buildOpenApiDocument, componentName, type JsonSchema } from "./openapi";
import { listOperations } from "./registry";

const doc = buildOpenApiDocument();
const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({ path, method, op })),
);

function collectRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, out));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe("buildOpenApiDocument", () => {
  it("is OpenAPI 3.1 with one operation per registry entry and unique operationIds", () => {
    expect(doc.openapi).toBe("3.1.0");
    const ids = operations.map((o) => o.op["operationId"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(listOperations().length);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildOpenApiDocument())).toBe(JSON.stringify(doc));
  });

  it("resolves every $ref to a component, and every component is used", () => {
    const refs = new Set(collectRefs(doc));
    for (const ref of refs) {
      expect(ref.startsWith("#/components/schemas/")).toBe(true);
      expect(doc.components.schemas[ref.slice("#/components/schemas/".length)]).toBeDefined();
    }
    for (const id of Object.keys(doc.components.schemas)) {
      expect(refs.has(`#/components/schemas/${id}`)).toBe(true);
    }
  });

  it("leaves no zod document headers or __shared definitions behind", () => {
    const keys = keysDeep(doc);
    expect(keys.has("$schema")).toBe(false);
    expect(keys.has("$id")).toBe(false);
    expect(keys.has("$defs")).toBe(false);
    expect(JSON.stringify(doc)).not.toContain("__shared");
  });

  it("declares every path param as a required path parameter", () => {
    for (const { path, op } of operations) {
      const params = (op["parameters"] ?? []) as JsonSchema[];
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      for (const name of names) {
        expect(params.find((p) => p["name"] === name && p["in"] === "path")).toMatchObject({ required: true });
      }
    }
  });

  it("puts GET and DELETE input in the query and never in a body", () => {
    for (const { method, op } of operations) {
      if (method === "get" || method === "delete") expect(op["requestBody"]).toBeUndefined();
    }
    const runs = doc.paths["/api/v1/runs"]?.["get"];
    const names = ((runs?.["parameters"] ?? []) as JsonSchema[]).map((p) => p["name"]);
    expect(names).toEqual(expect.arrayContaining(["set", "status", "band", "limit", "cursor"]));
  });

  it("references the contracts it names", () => {
    const schemaOf = (path: string, method: string, status: string) => {
      const responses = doc.paths[path]?.[method]?.["responses"] as Record<string, JsonSchema>;
      const content = responses[status]?.["content"] as Record<string, JsonSchema>;
      return content["application/json"]?.["schema"];
    };
    expect(schemaOf("/api/v1/sets/{ref}/diff", "get", "200")).toEqual({ $ref: "#/components/schemas/SpecDiff" });
    expect(schemaOf("/api/v1/jobs/{id}", "get", "200")).toEqual({ $ref: "#/components/schemas/Job" });
    expect(schemaOf("/api/v1/evals", "post", "202")).toEqual({ $ref: "#/components/schemas/JobAccepted" });
    expect(schemaOf("/api/v1/sets/{ref}/manifest", "get", "200")).toEqual({ $ref: "#/components/schemas/Manifest" });
    expect(schemaOf("/api/v1/sets/{ref}/run", "post", "default")).toEqual({ $ref: "#/components/schemas/ErrorEnvelope" });
  });

  it("documents the approval response on operations an agent may need approved", () => {
    for (const { op } of operations) {
      const risk = op["x-sysone-risk"];
      const agent = (op["x-sysone-actors"] as string[]).includes("agent");
      const responses = op["responses"] as Record<string, unknown>;
      expect(responses["202"] !== undefined).toBe(((risk === "high" || risk === "high*") && agent) || op["x-sysone-async"] === true);
    }
  });

  it("flags open shapes and keeps their paths", () => {
    const open = operations.filter((o) => o.op["x-sysone-placeholder"] !== undefined);
    expect(open.length).toBeGreaterThan(0);
    const usage = doc.paths["/api/v1/usage"]?.["get"];
    expect(usage?.["x-sysone-placeholder"]).toEqual({ input: true, output: true });
  });

  it("keeps optional input and required If-Match where the registry says so", () => {
    const draftUpdate = doc.paths["/api/v1/sets/{ref}/draft"]?.["put"];
    const ifMatch = ((draftUpdate?.["parameters"] ?? []) as JsonSchema[]).find((p) => p["name"] === "If-Match");
    expect(ifMatch).toMatchObject({ in: "header", required: true });
    const validate = doc.paths["/api/v1/sets/{ref}/draft/validate"]?.["post"];
    expect(validate?.["requestBody"]).toMatchObject({ required: false });
  });

  it("names components from operation ids", () => {
    expect(componentName("set.try_model")).toBe("SetTryModel");
    expect(componentName("platform_org.set_entitlement")).toBe("PlatformOrgSetEntitlement");
  });
});
