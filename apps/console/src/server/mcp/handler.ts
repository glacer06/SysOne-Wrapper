// The /mcp endpoint for Bandwise Gate (ADR-021, rollout step 1). Pure apart from the deps, so it
// is tested without Next.
//
// Order, inside one error boundary: deps, the Origin check, bearer auth (agent tokens only), the
// internal-org gate, and only then the body. An unauthenticated or refused caller costs no body
// read and learns nothing about tools or sets.
//
// Auth is the ADR-007 agent token in the Authorization header for now. OAuth (ADR-021 section 4)
// mints the same agent tokens and lands in its own PR before anyone outside `internal` connects.
//
// Every tool goes through what the API uses: check tools through runCheckForCaller (the run gates,
// run caps, spend caps and the RunResult envelope), the others through runOperation (scopes, roles,
// approvals, audit). Nothing here holds a TypeSafe, OpenRouter or AI Gateway key.

import type { OperationId, QuestionSetSpec, Scope } from "@bandwise/core";
import {
  formatCheckResult,
  formatOperationResult,
  GATE_TOOLS,
  type GateToolSpec,
  handleMcpHttp,
  type JsonObject,
  type McpHttpResponse,
  type McpTool,
  SERVER_INFO,
  toolError,
} from "@bandwise/mcp-server";
import type { TokenHasher } from "@bandwise/tenancy";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import { OperationError } from "../operations/errors";
import { getOperation } from "../operations/registry";
import { runOperation, type OperationDeps } from "../operations/run-operation";
import { HOSTED_RUN_ORG_SLUG, runCheckForCaller, type RunSetDeps } from "../run/run-set";

export const MCP_SERVER_VERSION = "0.1.0";

export interface McpRequest {
  method: string;
  authorization: string | null;
  /** The Origin header. Browsers send it; agent hosts calling from a server do not. */
  origin: string | null;
  protocolVersion: string | null;
  /** Called only after auth. */
  readBody: () => Promise<{ text: string | null; tooLarge: boolean }>;
  requestId: string;
  signal?: AbortSignal;
}

export interface McpDeps {
  /** For the check tools. */
  run: RunSetDeps;
  /** For the operation tools. Shares the database with `run`. */
  ops: OperationDeps;
  hasher: TokenHasher;
  nowDate?: () => Date;
  logError?: (message: string, requestId: string) => void;
}

/**
 * Browser origins allowed to call /mcp. None: a bearer agent token never belongs in a browser
 * (golden rule 2), and refusing Origin stops DNS rebinding and cross-site use of a stolen token.
 */
const ALLOWED_ORIGINS: readonly string[] = [];

const json = { "content-type": "application/json", "cache-control": "no-store" };

/** RFC 6750: a 401 names the scheme, and the error when a token was sent and failed. */
function unauthorized(tokenSent: boolean, requestId: string, message: string): McpHttpResponse {
  const challenge = tokenSent ? 'Bearer realm="bandwise", error="invalid_token"' : 'Bearer realm="bandwise"';
  return {
    status: 401,
    headers: { ...json, "www-authenticate": challenge },
    body: { error: { code: "unauthenticated", message, requestId } },
  };
}

function refused(e: OperationError, requestId: string): McpHttpResponse {
  return { status: e.status, headers: { ...json }, body: e.toEnvelope(requestId) };
}

/** The text a check tool shows for an answer: the set's own criteria for the picked option. */
export function explainFrom(spec: QuestionSetSpec): (questionId: string, value: unknown) => string | undefined {
  return (questionId, value) => {
    for (const stage of spec.stages) {
      const q = (stage.questions as Record<string, { criteria?: Record<string, string> }>)[questionId];
      if (q?.criteria !== undefined && typeof value === "string") return q.criteria[value];
    }
    return undefined;
  };
}

/** Plain-words input check for the two check tools: only named string fields, required ones present. */
function checkArgs(spec: GateToolSpec, args: JsonObject): Record<string, string> | string {
  const schema = spec.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    if (!(k in schema.properties)) return `${k} is not a field of ${spec.name}.`;
    if (typeof v !== "string") return `${k} must be a string.`;
    out[k] = v;
  }
  for (const k of schema.required ?? []) if (out[k] === undefined || out[k].trim() === "") return `${k} is required.`;
  return out;
}

/** Tool errors the model can read: a refusal's code and message, never an internal error's. */
function refusalResult(e: OperationError) {
  return toolError(`${e.code}: ${e.message}`);
}

function inputSchemaOf(id: OperationId): JsonObject {
  const schema = z.toJSONSchema(getOperation(id).input, { io: "input", unrepresentable: "any" }) as JsonObject;
  delete schema["$schema"];
  return schema;
}

/**
 * The tools this caller may see: its token holds the scope, and the tool has something behind it.
 * Check tools run through runCheckForCaller, the same path as the run route (set.run has no
 * registry handler; its route serves it). Operation tools need a registry handler.
 */
export function toolsFor(scopes: readonly Scope[]): readonly GateToolSpec[] {
  return GATE_TOOLS.filter((t) => scopes.includes(t.scope) && (t.kind !== "operation" || getOperation(t.operation).implemented));
}

function buildTools(specs: readonly GateToolSpec[], auth: Awaited<ReturnType<typeof authenticateBearer>>, deps: McpDeps, signal: AbortSignal | undefined): McpTool[] {
  return specs.map((spec) => {
    const base = { name: spec.name, title: spec.title, description: spec.description, annotations: spec.annotations };
    if (spec.kind === "operation") {
      return {
        ...base,
        inputSchema: inputSchemaOf(spec.operation),
        call: async (args) => {
          try {
            const res = await runOperation(spec.operation, auth.ctx as never, args, {}, deps.ops);
            if (res.kind === "approval") {
              const a = res.accepted.approval;
              return { content: [{ type: "text", text: `This waits for a person to approve it in the console before it takes effect: ${a.url}` }], structuredContent: { approval: { status: a.status, url: a.url, expiresAt: a.expiresAt } } };
            }
            if (res.kind === "dryRun") return formatOperationResult(res.preview);
            return formatOperationResult(res.output);
          } catch (e) {
            if (e instanceof OperationError) return refusalResult(e);
            throw e;
          }
        },
      } satisfies McpTool;
    }
    const label = spec.kind === "check_done" ? "done-check" : "action gate";
    return {
      ...base,
      inputSchema: spec.inputSchema ?? { type: "object" },
      call: async (args) => {
        const fields = checkArgs(spec, args);
        if (typeof fields === "string") return toolError(fields);
        try {
          const { result, spec: setSpec } = await runCheckForCaller(auth.ctx, auth.orgSlug, { ref: spec.defaultSet ?? "", candidate: fields }, deps.run, signal);
          return formatCheckResult(result, label, explainFrom(setSpec));
        } catch (e) {
          if (e instanceof OperationError) return refusalResult(e);
          throw e;
        }
      },
    } satisfies McpTool;
  });
}

/** Answer one /mcp request. Never throws. */
export async function handleMcpRequest(
  req: McpRequest,
  loadDeps: () => McpDeps,
  fallbackLog?: (message: string, requestId: string) => void,
): Promise<McpHttpResponse> {
  const { requestId } = req;
  let log = fallbackLog;
  try {
    const deps = loadDeps();
    log = deps.logError ?? fallbackLog;

    if (req.origin !== null && !ALLOWED_ORIGINS.includes(req.origin)) {
      return { status: 403, headers: { ...json }, body: { error: { code: "forbidden", message: "Browsers cannot call /mcp. Connect from an agent host.", requestId } } };
    }

    let auth: Awaited<ReturnType<typeof authenticateBearer>>;
    try {
      auth = await authenticateBearer(req.authorization, { db: deps.run.db, hasher: deps.hasher, now: deps.nowDate ?? (() => new Date()), requestId });
    } catch (e) {
      if (e instanceof OperationError && e.code === "unauthenticated") return unauthorized(req.authorization !== null, requestId, e.message);
      throw e;
    }
    // Agent tokens only: app tokens belong to apps, and their scopes are not the tool scopes.
    if (auth.ctx.actor.type !== "agent") return unauthorized(true, requestId, "/mcp takes an agent token (sa_live_).");
    if (auth.orgSlug !== HOSTED_RUN_ORG_SLUG) return refused(new OperationError("not_found", "/mcp is open only to the internal org for now."), requestId);

    const specs = toolsFor(auth.ctx.actor.scopes);
    const body = req.method === "POST" ? await req.readBody() : { text: null, tooLarge: false };
    const tools = buildTools(specs, auth, deps, req.signal);
    const res = await handleMcpHttp({ method: req.method, protocolVersion: req.protocolVersion, body }, { ...SERVER_INFO, version: MCP_SERVER_VERSION }, tools, (e) =>
      log?.(e instanceof Error ? e.name : "unknown error", requestId),
    );
    return res;
  } catch (e) {
    // Never echo or log an unexpected error's message: it can quote the state or a secret.
    log?.(e instanceof Error ? e.name : "unknown error", requestId);
    return { status: 503, headers: { ...json }, body: { error: { code: "unavailable", message: "The request could not be completed.", requestId } } };
  }
}
