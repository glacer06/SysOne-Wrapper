// OpenAPI 3.1 from the operation registry and the zod contracts, with zod v4's native JSON Schema
// conversion (z.toJSONSchema). The result is committed as packages/core/openapi.json; regenerate
// it with `pnpm openapi`. The parity test fails when the committed file is stale.

import {
  ApprovalAccepted,
  Condition,
  ConfidencePolicy,
  DryRunResult,
  ErrorDetail,
  ErrorEnvelope,
  EventEnvelope,
  FeedbackReport,
  GateResult,
  Job,
  JobAccepted,
  JsonValue,
  LabelingPolicy,
  Manifest,
  ModelListItem,
  ModelProfile,
  Opportunity,
  OpportunityRecord,
  QuestionSetSpec,
  RunDryRunResult,
  RunOptions,
  RunResult,
  SetHealth,
  SpecDiff,
  SystemOneAnswer,
  SystemOneUsage,
} from "@bandwise/core";
import { z } from "zod";

import { type AnyObjectSchema, type RegisteredOperation } from "./define";
import { listOperations } from "./registry";

export type JsonSchema = { [key: string]: unknown };

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  paths: Record<string, Record<string, JsonSchema>>;
  components: { schemas: Record<string, JsonSchema>; securitySchemes: Record<string, JsonSchema> };
}

/** api.md, Auth modes. */
const SECURITY_SCHEMES: Record<string, JsonSchema> = {
  bearerToken: {
    type: "http",
    scheme: "bearer",
    description:
      "An app token (sk_live_, sk_test_, pk_live_), a browser token (a 5-minute ES256 JWT) or an agent token (sa_live_).",
  },
  consoleSession: {
    type: "apiKey",
    in: "cookie",
    name: "session",
    description: "The console session cookie. Its real name comes from the auth library (ADR-002).",
  },
};

/** Contracts that get their own component, referenced wherever an operation uses them. */
const SHARED_COMPONENTS: Record<string, z.core.$ZodType> = {
  ApprovalAccepted,
  Condition,
  ConfidencePolicy,
  DryRunResult,
  ErrorDetail,
  ErrorEnvelope,
  EventEnvelope,
  FeedbackReport,
  GateResult,
  Job,
  JobAccepted,
  JsonValue,
  LabelingPolicy,
  Manifest,
  ModelListItem,
  ModelProfile,
  Opportunity,
  OpportunityRecord,
  QuestionSetSpec,
  RunDryRunResult,
  RunOptions,
  RunResult,
  SetHealth,
  SpecDiff,
  SystemOneAnswer,
  SystemOneUsage,
};

const COMPONENTS = "#/components/schemas/";
/** Marks a reference to a shared component in the input pass, resolved once both passes are done. */
const INPUT_MARK = "~input";
const SHARED_DEFS = /^#\/components\/schemas\/__shared#\/\$defs\/(.+)$/;

const API_DESCRIPTION =
  "Bandwise management and run API. Generated from the operation registry in apps/console/src/server/operations " +
  "and the zod contracts in @bandwise/core. Do not edit by hand; run `pnpm openapi`.";

export function buildOpenApiDocument(
  operations: readonly RegisteredOperation[] = listOperations(),
): OpenApiDocument {
  const sharedIds = new Map<z.core.$ZodType, string>();
  const inputRegistry = z.registry<{ id: string }>();
  const outputRegistry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(SHARED_COMPONENTS)) {
    sharedIds.set(schema, id);
    inputRegistry.add(schema, { id });
    outputRegistry.add(schema, { id });
  }

  // Register each operation's request body and response, and remember which component holds them.
  const bodies = new Map<string, string>();
  const responses = new Map<string, string>();
  for (const op of operations) {
    const name = componentName(op.id);
    const body = requestBodySchema(op);
    if (body !== null) {
      const shared = sharedIds.get(body);
      if (shared !== undefined) bodies.set(op.id, shared);
      else {
        const id = inputRegistry.get(body)?.id ?? `${name}Request`;
        if (!inputRegistry.has(body)) inputRegistry.add(body, { id });
        bodies.set(op.id, id);
      }
    }
    const shared = sharedIds.get(op.output);
    if (shared !== undefined) responses.set(op.id, shared);
    else if (!(op.placeholder.output && op.output instanceof z.ZodUnknown)) {
      const id = outputRegistry.get(op.output)?.id ?? `${name}Response`;
      if (!outputRegistry.has(op.output)) outputRegistry.add(op.output, { id });
      responses.set(op.id, id);
    }
  }

  const common = { target: "draft-2020-12", unrepresentable: "any", override: openSchemaOverride } as const;
  const inputPass = z.toJSONSchema(inputRegistry, {
    ...common,
    io: "input",
    uri: (id) => (id in SHARED_COMPONENTS ? `${COMPONENTS}${id}${INPUT_MARK}` : `${COMPONENTS}${id}`),
  }).schemas;
  const outputPass = z.toJSONSchema(outputRegistry, {
    ...common,
    io: "output",
    uri: (id) => `${COMPONENTS}${id}`,
  }).schemas;

  const inputRaw = stripHeaders(inputPass);
  const outputRaw = stripHeaders(outputPass);
  const freshShapes = [...new Set([...sharedDefs(inputRaw), ...sharedDefs(outputRaw)].map((d) => d.shape))].sort();
  const fresh = new Map(freshShapes.map((shape, i) => [shape, `Recursive${i + 1}`]));
  const inputSchemas = flattenShared(inputRaw, INPUT_MARK, fresh);
  const outputSchemas = flattenShared(outputRaw, "", fresh);

  // A shared contract whose input and output JSON Schemas differ (defaults, transforms) gets a
  // separate <Name>Input component. The loop settles because a difference only ever spreads.
  const splitInputs = new Set<string>();
  const resolveMark = (id: string) => (splitInputs.has(id) ? `${id}Input` : id);
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of Object.keys(SHARED_COMPONENTS)) {
      if (splitInputs.has(id)) continue;
      const input = rewriteRefs(inputSchemas[id], resolveMark);
      if (canonical(input) !== canonical(outputSchemas[id])) {
        splitInputs.add(id);
        changed = true;
      }
    }
  }

  const schemas: Record<string, JsonSchema> = {};
  for (const [id, schema] of Object.entries(outputSchemas)) schemas[id] = schema;
  for (const [id, schema] of Object.entries(inputSchemas)) {
    const resolved = rewriteRefs(schema, resolveMark) as JsonSchema;
    if (id in SHARED_COMPONENTS) {
      if (splitInputs.has(id)) schemas[`${id}Input`] = resolved;
    } else {
      schemas[id] = resolved;
    }
  }

  const paths: OpenApiDocument["paths"] = {};
  for (const op of operations) {
    const item = (paths[op.catalog.path] ??= {});
    const body = bodies.get(op.id);
    const response = responses.get(op.id);
    item[op.catalog.method.toLowerCase()] = pathOperation(
      op,
      body === undefined ? null : ref(body in SHARED_COMPONENTS ? resolveMark(body) : body),
      response === undefined ? {} : ref(response),
    );
  }

  return {
    openapi: "3.1.0",
    info: { title: "Bandwise API", version: "v1", description: API_DESCRIPTION },
    servers: [{ url: "/", description: "The console origin. Every path carries the /api/v1 prefix." }],
    paths,
    components: { schemas: sortKeys(reachable(paths, schemas)), securitySchemes: SECURITY_SCHEMES },
  };
}

/** The committed file's exact text: two-space JSON and a trailing newline. */
export function renderOpenApi(doc: OpenApiDocument = buildOpenApiDocument()): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Operations

function pathOperation(op: RegisteredOperation, body: JsonSchema | null, response: JsonSchema): JsonSchema {
  const { descriptor, catalog, request } = op;
  const parameters: JsonSchema[] = [
    ...request.path.map((key) => parameter(op.input, key, "path")),
    ...request.query.map((key) => parameter(op.input, key, "query")),
  ];
  if (descriptor.dryRun) {
    parameters.push({
      name: "dryRun",
      in: "query",
      required: false,
      description: "Preview: run the checks and return a DryRunResult. Writes nothing.",
      schema: { type: "boolean" },
    });
  }
  if (!descriptor.readOnly) {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      description: "Required for app and agent tokens on mutations. A replay within 24 hours returns the stored response.",
      schema: { type: "string", minLength: 1 },
    });
  }
  if (op.ifMatch !== null) {
    parameters.push({
      name: "If-Match",
      in: "header",
      required: op.ifMatch === "required",
      description: "The draft ETag (its spec_hash).",
      schema: { type: "string", minLength: 1 },
    });
  }
  if (op.id === "set.run") {
    parameters.push({
      name: "Bandwise-Interface",
      in: "header",
      required: false,
      description: "The interface major the caller was built against. A different live major returns 409 interface_mismatch.",
      schema: { type: "integer", minimum: 0 },
    });
  }

  const success: JsonSchema = {
    description: op.placeholder.output ? `Shape lands in Phase ${op.phase}.` : successDescription(op),
    content: { "application/json": { schema: response } },
  };
  if (op.id === "draft.get" || op.id === "draft.update") {
    success["headers"] = {
      ETag: { description: "The draft's spec_hash, quoted.", schema: { type: "string" } },
    };
  }
  const responses: JsonSchema = { [String(op.successStatus)]: success };
  const gated = catalog.risk === "high" || catalog.risk === "high*";
  if (gated && descriptor.actors.includes("agent")) {
    const jobOrApproval = responses["202"] === undefined ? ref("ApprovalAccepted") : { oneOf: [response, ref("ApprovalAccepted")] };
    responses["202"] = {
      description: "An agent called a high-risk operation: a person must approve it before it runs.",
      content: { "application/json": { schema: jobOrApproval } },
    };
  }
  responses["default"] = {
    description: "Error envelope (api.md).",
    content: { "application/json": { schema: ref("ErrorEnvelope") } },
  };

  const operation: JsonSchema = {
    operationId: op.id,
    summary: descriptor.summary,
    tags: [op.id.slice(0, op.id.indexOf("."))],
  };
  if (parameters.length > 0) operation["parameters"] = parameters;
  if (body !== null && request.body.kind !== "none") {
    const whole = request.body.kind === "whole" ? request.body : null;
    operation["requestBody"] = {
      required: whole === null ? true : whole.required,
      content: { [whole === null ? "application/json" : whole.contentType]: { schema: body } },
    };
  }
  operation["responses"] = responses;
  const tokens = descriptor.actors.some((a) => a === "agent" || a === "apiKey");
  const sessions = descriptor.actors.includes("user");
  operation["security"] = [
    ...(tokens ? [{ bearerToken: [] }] : []),
    ...(sessions ? [{ consoleSession: [] }] : []),
  ];
  operation["x-bandwise-scope"] = catalog.scope;
  operation["x-bandwise-min-role"] = catalog.minRole;
  operation["x-bandwise-risk"] = catalog.risk;
  operation["x-bandwise-actors"] = descriptor.actors;
  operation["x-bandwise-phase"] = op.phase;
  operation["x-bandwise-async"] = descriptor.async;
  operation["x-bandwise-destructive"] = descriptor.destructive;
  operation["x-bandwise-emits"] = descriptor.emits;
  if (descriptor.mcp !== undefined) operation["x-bandwise-mcp-tool"] = descriptor.mcp.tool;
  if (op.placeholder.input || op.placeholder.output) {
    operation["x-bandwise-placeholder"] = { input: op.placeholder.input, output: op.placeholder.output };
  }
  return operation;
}

function successDescription(op: RegisteredOperation): string {
  if (op.successStatus === 202) return "Job accepted. Poll GET /api/v1/jobs/{id}.";
  if (op.successStatus === 201) return "Created.";
  return "OK.";
}

function parameter(input: AnyObjectSchema, key: string, location: "path" | "query"): JsonSchema {
  const schema = input.shape[key];
  if (schema === undefined) throw new Error(`no input key ${key}`);
  const optional = z.safeParse(schema, undefined).success;
  return {
    name: key,
    in: location,
    required: location === "path" || !optional,
    schema: stripHeader(
      z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io: "input",
        unrepresentable: "any",
        override: openSchemaOverride,
      }),
    ),
  };
}

/** The request body as one schema: a whole-body value, or an object of the body keys. */
function requestBodySchema(op: RegisteredOperation): z.core.$ZodType | null {
  const body = op.request.body;
  if (body.kind === "none") return null;
  if (body.kind === "whole") {
    const schema = op.input.shape[body.key];
    if (schema === undefined) throw new Error(`${op.id}: no input key ${body.key}`);
    return schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  }
  const shape = Object.fromEntries(body.keys.map((k) => [k, op.input.shape[k]]));
  const catchall = op.input._zod.def.catchall;
  const object = z.object(shape);
  return catchall === undefined ? object : object.catchall(catchall);
}

// ---------------------------------------------------------------------------
// JSON helpers

/** Formats that JSON Schema names; zod also writes the regex it checks them with. */
const NAMED_FORMATS = new Set(["date-time", "date", "uuid", "email", "uri"]);

/**
 * Adjust zod's output to the API's versioning rule. A zod object that strips unknown keys is
 * written without `additionalProperties: false`, because v1 may add response fields and an older
 * client must still accept them. Strict objects (specs, run requests) keep it. A named format
 * drops zod's equivalent regex, which only repeats the format.
 */
function openSchemaOverride(ctx: { zodSchema: z.core.$ZodTypes; jsonSchema: z.core.JSONSchema.BaseSchema }): void {
  const def = ctx.zodSchema._zod.def;
  if (def.type === "object" && def.catchall === undefined) delete ctx.jsonSchema.additionalProperties;
  const format = ctx.jsonSchema.format;
  if (typeof format === "string" && NAMED_FORMATS.has(format)) delete ctx.jsonSchema.pattern;
}

function ref(id: string): JsonSchema {
  return { $ref: `${COMPONENTS}${id}` };
}

/** "set.try_model" becomes "SetTryModel". */
export function componentName(id: string): string {
  return id
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function stripHeader(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema;
  return rest;
}

function stripHeaders(schemas: Record<string, JsonSchema>): Record<string, JsonSchema> {
  return Object.fromEntries(Object.entries(schemas).map(([id, s]) => [id, stripHeader(s)]));
}

interface SharedDef {
  name: string;
  schema: unknown;
  /** Canonical JSON with self references replaced, to match the same schema across passes. */
  shape: string;
}

function selfShape(schema: unknown, isSelf: (target: string) => boolean): string {
  return canonical(mapRefs(schema, (t) => (isSelf(t) ? "#self" : t)));
}

/**
 * zod puts an unregistered recursive schema, such as a z.json() written inline in a contract,
 * into `__shared.$defs`. List them with their shapes.
 */
function sharedDefs(schemas: Record<string, JsonSchema>): SharedDef[] {
  const shared = schemas["__shared"];
  const defs = isObject(shared) && isObject(shared["$defs"]) ? shared["$defs"] : {};
  return Object.entries(defs).map(([name, schema]) => ({
    name,
    schema,
    shape: selfShape(schema, (t) => SHARED_DEFS.exec(t)?.[1] === name),
  }));
}

/**
 * Move `__shared` defs into components. A def that matches a registered recursive component
 * (JsonValue) becomes a reference to it; any other gets its name from `fresh`, shared by both
 * passes, so the same schema has the same name in each.
 */
function flattenShared(
  schemas: Record<string, JsonSchema>,
  mark: string,
  fresh: ReadonlyMap<string, string>,
): Record<string, JsonSchema> {
  const { __shared: _shared, ...rest } = schemas;
  const known = new Map<string, string>();
  for (const [id, schema] of Object.entries(rest)) {
    if (!(id in SHARED_COMPONENTS)) continue;
    const self = `${COMPONENTS}${id}`;
    known.set(selfShape(schema, (t) => t === self || t === `${self}${mark}`), `${id}${mark}`);
  }

  const defs = sharedDefs(schemas);
  const names = new Map<string, string>();
  for (const d of defs) {
    const name = known.get(d.shape) ?? fresh.get(d.shape);
    if (name === undefined) throw new Error(`no component name for recursive schema ${d.name}`);
    names.set(d.name, name);
  }
  const rename = (target: string) => {
    const name = names.get(SHARED_DEFS.exec(target)?.[1] ?? "");
    return name === undefined ? target : `${COMPONENTS}${name}`;
  };

  const out: Record<string, JsonSchema> = {};
  for (const [id, schema] of Object.entries(rest)) out[id] = mapRefs(schema, rename) as JsonSchema;
  for (const d of defs) {
    if (known.has(d.shape)) continue;
    const name = fresh.get(d.shape);
    if (name !== undefined) out[name] = mapRefs(d.schema, rename) as JsonSchema;
  }
  return out;
}

/** Resolve input-pass references to shared components: `#/components/schemas/X~input`. */
function rewriteRefs(value: unknown, resolve: (id: string) => string): unknown {
  return mapRefs(value, (target) =>
    target.startsWith(COMPONENTS) && target.endsWith(INPUT_MARK)
      ? `${COMPONENTS}${resolve(target.slice(COMPONENTS.length, -INPUT_MARK.length))}`
      : target,
  );
}

/** Keep only the components that the paths reference, directly or through other components. */
function reachable(paths: unknown, schemas: Record<string, JsonSchema>): Record<string, JsonSchema> {
  const seen = new Set<string>();
  const queue: unknown[] = [paths];
  while (queue.length > 0) {
    mapRefs(queue.pop(), (target) => {
      const id = target.startsWith(COMPONENTS) ? target.slice(COMPONENTS.length) : null;
      if (id !== null && !seen.has(id)) {
        seen.add(id);
        queue.push(schemas[id]);
      }
      return target;
    });
  }
  return Object.fromEntries(Object.entries(schemas).filter(([id]) => seen.has(id)));
}

function mapRefs(value: unknown, map: (target: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapRefs(v, map));
  if (!isObject(value)) return value;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "$ref" && typeof v === "string" ? map(v) : mapRefs(v, map);
  }
  return out;
}

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON with sorted keys, for structural comparison. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (isObject(v) ? sortKeys(v) : v));
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
