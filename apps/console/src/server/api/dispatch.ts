// The generic /api/v1 adapter for management operations (management-api.md, Adapters). It matches
// method and path against the catalog, authenticates the bearer token, builds the operation input
// from the path, the query and the JSON body by the registry's request layout, calls runOperation
// and maps the result or the error to the api.md envelope. Pure apart from the deps, so it is
// tested without Next. POST /sets/{ref}/run has its own route (server/run) and is not served here.
//
// D2 serves only the internal org (ADR-020): any other org gets 404 on every route.

import { API_PREFIX, errorEnvelope, OPERATION_CATALOG, type OperationId } from "@bandwise/core";
import type { TokenHasher } from "@bandwise/tenancy";

import { authenticateBearer } from "../auth/bearer";
import type { RegisteredOperation } from "../operations/define";
import { OperationError, OperationNotImplementedError } from "../operations/errors";
import { getOperation } from "../operations/registry";
import { runOperation, type OperationDeps, type RunOperationOptions } from "../operations/run-operation";
import { HOSTED_RUN_ORG_SLUG } from "../run/run-set";

/** A management body larger than this is refused before parsing. A spec is far below it. */
export const MAX_API_BODY_BYTES = 256 * 1024;

/** Served by its own route file, never by this adapter. */
const OWN_ROUTES: readonly OperationId[] = ["set.run"];

export interface ApiRequest {
  method: string;
  /** The path after the host, starting with /api/v1. */
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  ifMatch: string | null;
  idempotencyKey: string | null;
  body: string | null;
  bodyTooLarge: boolean;
  requestId: string;
}

export interface ApiDeps extends OperationDeps {
  hasher: TokenHasher;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

interface Route {
  op: RegisteredOperation;
  pattern: RegExp;
  params: string[];
  literals: number;
}

const ROUTES: Route[] = OPERATION_CATALOG.filter((e) => !OWN_ROUTES.includes(e.id)).map((entry) => {
  const params: string[] = [];
  const segments = entry.path.split("/").filter((s) => s !== "");
  const source = segments
    .map((seg) => {
      const m = /^\{(\w+)\}$/.exec(seg);
      if (m === null) return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      params.push(m[1] ?? "");
      return "([^/]+)";
    })
    .join("/");
  return { op: getOperation(entry.id), pattern: new RegExp(`^/${source}/?$`), params, literals: segments.length - params.length };
});
// A literal segment wins over a parameter: /runs/ingest before /runs/{id}.
ROUTES.sort((a, b) => b.literals - a.literals);

/** The operation and path params for a request, or null. */
export function matchRoute(method: string, path: string): { op: RegisteredOperation; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    if (route.op.catalog.method !== method) continue;
    const m = route.pattern.exec(path);
    if (m === null) continue;
    const params: Record<string, string> = {};
    try {
      route.params.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1] ?? "");
      });
    } catch {
      return null;
    }
    return { op: route.op, params };
  }
  return null;
}

const json = { "content-type": "application/json", "cache-control": "no-store" };

function refuse(e: OperationError, requestId: string): ApiResponse {
  return { status: e.status, body: e.toEnvelope(requestId), headers: { ...json } };
}

const notFound = (message: string) => new OperationError("not_found", message);

/** The operation input: the JSON body by the request layout, then the query, then the path. */
function assembleInput(op: RegisteredOperation, req: ApiRequest, params: Record<string, string>): Record<string, unknown> {
  const layout = op.request;
  const input: Record<string, unknown> = {};

  if (layout.body.kind !== "none" && req.body !== null && req.body.trim() !== "") {
    if (req.bodyTooLarge) throw new OperationError("invalid_request", `The body is larger than ${MAX_API_BODY_BYTES} bytes.`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body);
    } catch {
      throw new OperationError("invalid_request", "The body is not valid JSON.");
    }
    if (layout.body.kind === "whole") {
      input[layout.body.key] = parsed;
    } else {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new OperationError("invalid_request", "The body must be a JSON object.");
      for (const [k, v] of Object.entries(parsed)) {
        if (layout.path.includes(k) || layout.query.includes(k)) {
          throw new OperationError("invalid_request", `${k} goes in the ${layout.path.includes(k) ? "path" : "query"}, not the body.`);
        }
        input[k] = v;
      }
    }
  } else if (req.bodyTooLarge) {
    throw new OperationError("invalid_request", `The body is larger than ${MAX_API_BODY_BYTES} bytes.`);
  }

  for (const [k, v] of req.query) {
    if (k === "dryRun") continue;
    // Unknown query keys reach the strict input schema and fail there with a JSON Pointer.
    if (layout.path.includes(k)) throw new OperationError("invalid_request", `${k} goes in the path.`);
    if (input[k] !== undefined) throw new OperationError("invalid_request", `${k} is sent twice.`);
    input[k] = v;
  }
  Object.assign(input, params);
  return input;
}

/** Handle one /api/v1 management request. Never throws. */
export async function handleApiRequest(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  const { requestId } = req;
  try {
    // Auth first, so an unauthenticated caller learns nothing about routes, sets or bodies.
    const auth = await authenticateBearer(req.authorization, { db: deps.db, hasher: deps.hasher, now: deps.now ?? (() => new Date()), requestId });
    if (auth.orgSlug !== HOSTED_RUN_ORG_SLUG) throw notFound("The management API is open only to the internal org for now.");

    const path = req.path.startsWith(API_PREFIX) ? req.path : `${API_PREFIX}${req.path}`;
    const match = matchRoute(req.method, path);
    if (match === null) throw notFound(`No route ${req.method} ${path}.`);
    const { op, params } = match;
    if (!op.implemented) throw notFound(`${op.id} is not served yet. It lands in Phase ${op.phase}.`);

    const dryRun = req.query.get("dryRun");
    if (dryRun !== null && dryRun !== "true" && dryRun !== "false") throw new OperationError("invalid_request", "dryRun is true or false.");
    const options: RunOperationOptions = {};
    if (dryRun === "true") options.dryRun = true;
    if (req.ifMatch !== null) options.ifMatch = req.ifMatch;
    if (req.idempotencyKey !== null) options.idempotencyKey = req.idempotencyKey;

    const input = assembleInput(op, req, params);
    const result = await runOperation(op.id, auth.ctx as never, input, options, deps);
    switch (result.kind) {
      case "dryRun":
        return { status: 200, body: result.preview, headers: { ...json } };
      case "approval":
        return { status: 202, body: result.accepted, headers: { ...json } };
      case "ok": {
        const headers: Record<string, string> = { ...json };
        if (result.etag !== undefined) headers["etag"] = `"${result.etag}"`;
        return { status: op.successStatus, body: result.output, headers };
      }
    }
  } catch (e) {
    if (e instanceof OperationError) return refuse(e, requestId);
    if (e instanceof OperationNotImplementedError) return refuse(notFound(`${e.operationId} is not served yet.`), requestId);
    // Never echo or log an unexpected error's message: a database error can quote a spec or state.
    // The api.md code table has no generic server error, so this answers like the run route: a
    // retryable 503 with a fixed message.
    deps.logError?.(e instanceof Error ? e.name : "unknown error", requestId);
    return { status: 503, body: errorEnvelope("system_one_unavailable", { message: "The request could not be completed.", requestId }), headers: { ...json } };
  }
}
