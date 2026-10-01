// The fake server replies in __fixtures__/replies.ts against the committed OpenAPI document. The
// document stays in the monorepo, so the kit export leaves this test out.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPLY_SCHEMAS } from "./__fixtures__/replies.js";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; anyOf?: Schema[]; $ref?: string };

const doc = JSON.parse(readFileSync(new URL("../../../core/openapi.json", import.meta.url), "utf8")) as { components: { schemas: Record<string, Schema> } };

function deref(s: Schema): Schema {
  return s.$ref === undefined ? s : (doc.components.schemas[s.$ref.replace("#/components/schemas/", "")] ?? {});
}

/** Problems with `value` against `schema`: missing required keys, unknown keys, wrong types, enums. */
function check(value: unknown, raw: Schema, at: string): string[] {
  const schema = deref(raw);
  if (schema.anyOf !== undefined) return schema.anyOf.some((s) => check(value, s, at).length === 0) ? [] : [`${at}: matches no anyOf branch`];
  if (schema.enum !== undefined && !schema.enum.includes(value)) return [`${at}: ${JSON.stringify(value)} is not in the enum`];
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${at}: not an object`];
      const o = value as Record<string, unknown>;
      const props = schema.properties ?? {};
      return [
        ...(schema.required ?? []).filter((k) => !(k in o)).map((k) => `${at}/${k}: missing`),
        ...Object.keys(o).filter((k) => !(k in props)).map((k) => `${at}/${k}: not in the schema`),
        ...Object.entries(o).flatMap(([k, v]) => (props[k] === undefined ? [] : check(v, props[k], `${at}/${k}`))),
      ];
    }
    case "array":
      return Array.isArray(value) ? value.flatMap((v, i) => check(v, schema.items ?? {}, `${at}/${i}`)) : [`${at}: not an array`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${at}: not an integer`];
    case "number":
      return typeof value === "number" ? [] : [`${at}: not a number`];
    case "string":
      return typeof value === "string" ? [] : [`${at}: not a string`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${at}: not a boolean`];
    default:
      return [];
  }
}

describe("fake server replies", () => {
  it.each(REPLY_SCHEMAS.map((r) => [r.name, r] as const))("%s matches its OpenAPI schema", (_name, r) => {
    const schema = doc.components.schemas[r.schema];
    expect(schema, `no component ${r.schema}`).toBeDefined();
    expect(check(r.reply, schema ?? {}, "")).toEqual([]);
  });

  it("catches a reply in the wrong shape", () => {
    const schema = doc.components.schemas["ChannelRollbackResponse"] ?? {};
    expect(check({ version: 2 }, schema, "")).toContain("/version: not in the schema");
  });
});
