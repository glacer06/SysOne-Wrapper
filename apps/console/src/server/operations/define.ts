// defineOperation turns one catalog row plus its zod schemas into a registry entry.
// The catalog row (OPERATION_CATALOG in @bandwise/core) supplies the method, path, scope, role,
// risk, phase and actors, so the registry cannot drift from references/management-api.md.

import {
  catalogActors,
  catalogEntry,
  describeOperation,
  runsWithoutOrg,
  type DryRunResult,
  type EventType,
  type OperationCatalogEntry,
  type OperationDef,
  type OperationDescriptor,
  type OperationId,
  type OperationContext,
  type OperationContextFor,
  type OperationMinRole,
  type Phase,
  type RiskResource,
  type Scope,
} from "@bandwise/core";
import { z } from "zod";

import { OperationNotImplementedError } from "./errors";

/** Any zod object schema. Every operation input is one object: path params, query and body merged. */
export type AnyObjectSchema = z.ZodObject<z.core.$ZodShape, z.core.$ZodObjectConfig>;

type InputKey<In extends AnyObjectSchema> = keyof In["shape"] & string;

export type RiskLevel = "normal" | "high";

/** How a merged input maps onto an HTTP request. */
export interface RequestLayout {
  /** Input keys taken from the path, in path order. */
  path: string[];
  /** Input keys taken from the query string. */
  query: string[];
  /**
   * "fields": the body is a JSON object holding these input keys.
   * "whole": the whole body is the value of one input key (a spec, a JSONL case list).
   */
  body:
    | { kind: "none" }
    | { kind: "fields"; keys: string[] }
    | { kind: "whole"; key: string; contentType: string; required: boolean };
}

/** "required": 428 when missing. "conditional": required only for some inputs, checked by the handler. */
export type IfMatchRule = "required" | "conditional";

/**
 * An input that passed validation, ready for the access checks and the handler. `C` is the context
 * the handler takes: TenantContext, or OperationContext for org-less operations.
 */
export interface PreparedCall<C extends OperationContext = OperationContext> {
  readonly input: unknown;
  /** The scope this input needs. "any": any authenticated actor the operation allows. */
  readonly scope: Scope | "any";
  risk(ctx: C, resource: RiskResource): RiskLevel;
  handle(ctx: C): Promise<unknown>;
  /** False when the operation does not accept ?dryRun=true. */
  readonly hasPreview: boolean;
  /** Throws when hasPreview is false. */
  preview(ctx: C): Promise<DryRunResult>;
}

export type PrepareResult<C extends OperationContext = OperationContext> =
  | { ok: true; call: PreparedCall<C> }
  | { ok: false; error: z.ZodError };

/**
 * A registry entry. The typed OperationDef stays inside the entry's closures, so entries with
 * different input types can share one map without casts.
 */
export interface RegisteredOperation<
  Id extends OperationId = OperationId,
  In extends AnyObjectSchema = AnyObjectSchema,
  Out extends z.ZodType = z.ZodType,
> {
  readonly id: Id;
  readonly phase: Phase;
  readonly catalog: OperationCatalogEntry;
  /** describeOperation() of the OperationDef: plain data for OpenAPI, CLI help and MCP. */
  readonly descriptor: OperationDescriptor;
  readonly input: In;
  readonly output: Out;
  readonly request: RequestLayout;
  readonly ifMatch: IfMatchRule | null;
  /** True where the shape is still open (a "shape: Phase <n>" placeholder). */
  readonly placeholder: { input: boolean; output: boolean };
  /** 202 for jobs, 201 for creates, otherwise 200. */
  readonly successStatus: 200 | 201 | 202;
  /** True when the handler runs without an org (org.create, platform_*): it takes an OperationContext. */
  readonly orgLess: boolean;
  /** Validate raw input and bind it to the operation's functions. */
  prepare(raw: unknown): PrepareResult<OperationContextFor<Id>>;
}

export interface OperationSpec<Id extends OperationId, In extends AnyObjectSchema, Out extends z.ZodType> {
  summary: string;
  input: In;
  output: Out;
  /** Required exactly when the catalog scope is release:<channel>. */
  scope?: (input: z.output<In>) => Scope;
  /** Required exactly when the catalog risk is high*. */
  risk?: (ctx: OperationContextFor<Id>, input: z.output<In>, resource: RiskResource) => RiskLevel;
  /** Non-path keys sent in the query string of a POST, PUT or PATCH. GET and DELETE use the query for every non-path key. */
  query?: readonly InputKey<In>[];
  /** The input key whose value is the whole request body. */
  body?: { key: InputKey<In>; contentType?: string };
  /** Defaults to true for DELETE routes. */
  destructive?: boolean;
  /** Returns 202 { jobId }. */
  async?: boolean;
  /** Curated MCP tool name (headless-and-agents.md). */
  mcp?: string;
  emits?: readonly EventType[];
  /** Accepts ?dryRun=true. The preview is stubbed until the operation's phase. */
  dryRun?: boolean;
  ifMatch?: IfMatchRule;
  handler?: (ctx: OperationContextFor<Id>, input: z.output<In>) => Promise<z.output<Out>>;
}

// ---------------------------------------------------------------------------
// Placeholders

const placeholderSchemas = new WeakSet<z.ZodType>();

/**
 * An input whose shape is still open: the path params plus any other keys. phase-0.md spells it
 * z.object({}).passthrough(); .loose() is the zod v4 name for the same schema.
 */
export function placeholderInput<S extends z.core.$ZodShape>(pathParams: S) {
  const schema = z.object(pathParams).loose();
  placeholderSchemas.add(schema);
  return schema;
}

/** An output whose shape is still open. */
export function placeholderOutput() {
  const schema = z.unknown();
  placeholderSchemas.add(schema);
  return schema;
}

/** Mark a schema that wraps a placeholder, such as a page of z.unknown() items. */
export function markPlaceholder<T extends z.ZodType>(schema: T): T {
  placeholderSchemas.add(schema);
  return schema;
}

export function isPlaceholder(schema: z.ZodType): boolean {
  return placeholderSchemas.has(schema);
}

// ---------------------------------------------------------------------------
// defineOperation

const PATH_PARAM = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function pathParams(path: string): string[] {
  return [...path.matchAll(PATH_PARAM)].map((m) => m[1] ?? "");
}

/** The OperationDef scope for a catalog scope that does not depend on the input. */
function staticScope(entry: OperationCatalogEntry): Scope | "any" {
  switch (entry.scope) {
    case "release:<channel>":
      throw new Error(`${entry.id}: a release:<channel> scope needs a scope function`);
    // Session-only and platform rows are limited by actors (["user"]) and minRole, not a token scope.
    case "session_only":
    case "platform_admin":
    case "any":
      return "any";
    default:
      return entry.scope;
  }
}

/** approval.decide needs the requested operation's role, checked by its handler; the floor is viewer. */
function operationMinRole(entry: OperationCatalogEntry): OperationMinRole {
  return entry.minRole === "requested_operation" ? "viewer" : entry.minRole;
}

function notImplemented(id: OperationId, phase: Phase, what: "handler" | "preview") {
  return async (): Promise<never> => {
    throw new OperationNotImplementedError(id, phase, what);
  };
}

export function defineOperation<const Id extends OperationId, In extends AnyObjectSchema, Out extends z.ZodType>(
  id: Id,
  spec: OperationSpec<Id, In, Out>,
): RegisteredOperation<Id, In, Out> {
  type I = z.output<In>;
  type O = z.output<Out>;
  type C = OperationContextFor<Id>;

  const entry = catalogEntry(id);
  const phase = entry.phase;

  if ((entry.scope === "release:<channel>") !== (spec.scope !== undefined)) {
    throw new Error(`${id}: a scope function is required exactly when the catalog scope is release:<channel>`);
  }
  if ((entry.risk === "high*") !== (spec.risk !== undefined)) {
    throw new Error(`${id}: a risk function is required exactly when the catalog risk is high*`);
  }

  const request = layout(id, entry, spec);

  const def: OperationDef<I, O, C> = {
    id,
    summary: spec.summary,
    // z.output<In> is exactly what In parses to; TypeScript cannot see that through the generic.
    input: spec.input as unknown as z.ZodType<I>,
    output: spec.output as z.ZodType<O>,
    scope: spec.scope ?? staticScope(entry),
    minRole: operationMinRole(entry),
    actors: catalogActors(entry),
    risk: spec.risk ?? (entry.risk === "high" ? "high" : "normal"),
    towardSafety: entry.risk === "safety",
    readOnly: entry.readOnly,
    destructive: spec.destructive ?? entry.method === "DELETE",
    async: spec.async ?? false,
    http: { method: entry.method, path: entry.path },
    emits: [...(spec.emits ?? [])],
    handler: spec.handler ?? notImplemented(id, phase, "handler"),
  };
  if (spec.mcp !== undefined) def.mcp = { tool: spec.mcp };
  if (spec.dryRun === true) def.preview = notImplemented(id, phase, "preview");

  const successStatus = def.async ? 202 : id.endsWith(".create") ? 201 : 200;

  return {
    id,
    phase,
    catalog: entry,
    descriptor: describeOperation(def),
    input: spec.input,
    output: spec.output,
    request,
    ifMatch: spec.ifMatch ?? null,
    placeholder: { input: isPlaceholder(spec.input), output: isPlaceholder(spec.output) },
    successStatus,
    orgLess: runsWithoutOrg(entry),
    prepare(raw) {
      const parsed = def.input.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error };
      const input = parsed.data;
      const { scope, risk, handler, preview } = def;
      return {
        ok: true,
        call: {
          input,
          scope: typeof scope === "function" ? scope(input) : scope,
          risk: (ctx, resource) => (typeof risk === "function" ? risk(ctx, input, resource) : risk),
          handle: (ctx) => handler(ctx, input),
          hasPreview: preview !== undefined,
          preview: (ctx) =>
            preview === undefined ? Promise.reject(new Error(`${id} does not accept dryRun`)) : preview(ctx, input),
        },
      };
    },
  };
}

function layout<Id extends OperationId, In extends AnyObjectSchema, Out extends z.ZodType>(
  id: Id,
  entry: OperationCatalogEntry,
  spec: OperationSpec<Id, In, Out>,
): RequestLayout {
  const keys = Object.keys(spec.input.shape);
  const path = pathParams(entry.path);
  for (const p of path) {
    if (!keys.includes(p)) throw new Error(`${id}: input has no key for path param {${p}}`);
  }
  const rest = keys.filter((k) => !path.includes(k));
  const hasBody = entry.method === "POST" || entry.method === "PUT" || entry.method === "PATCH";

  if (!hasBody) {
    if (spec.body !== undefined || spec.query !== undefined) {
      throw new Error(`${id}: ${entry.method} routes put every non-path key in the query`);
    }
    return { path, query: rest, body: { kind: "none" } };
  }

  const query: string[] = [...(spec.query ?? [])];
  for (const q of query) {
    if (!rest.includes(q)) throw new Error(`${id}: query key ${q} is not a non-path input key`);
  }
  const bodyKeys = rest.filter((k) => !query.includes(k));

  if (spec.body !== undefined) {
    const key = spec.body.key;
    if (bodyKeys.length !== 1 || bodyKeys[0] !== key) {
      throw new Error(`${id}: a whole-body key must be the only non-path, non-query key`);
    }
    const schema = spec.input.shape[key];
    return {
      path,
      query,
      body: {
        kind: "whole",
        key,
        contentType: spec.body.contentType ?? "application/json",
        required: schema === undefined ? true : !z.safeParse(schema, undefined).success,
      },
    };
  }
  if (bodyKeys.length === 0 && !isPlaceholder(spec.input)) return { path, query, body: { kind: "none" } };
  return { path, query, body: { kind: "fields", keys: bodyKeys } };
}

/** Collect operations into a map keyed by id. */
export function operationGroup<const T extends readonly RegisteredOperation[]>(
  ...ops: T
): { [O in T[number] as O["id"]]: O } {
  const map: Record<string, RegisteredOperation> = {};
  for (const op of ops) {
    if (op.id in map) throw new Error(`operation ${op.id} is defined twice`);
    map[op.id] = op;
  }
  return map as { [O in T[number] as O["id"]]: O };
}
