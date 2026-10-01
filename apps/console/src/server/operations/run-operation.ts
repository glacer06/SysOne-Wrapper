// runOperation: the one entry point every caller uses (management-api.md, runOperation).
// It validates input, checks the context kind, the actor type and token scope, and requires
// If-Match where the operation always needs it. A real handler then runs inside withTenant in one
// transaction with an OperationEnv: can() and the approval gate through env.authorize, the audit
// row the handler records, and an approved request's result, all in that transaction. Stubbed
// handlers still end in OperationNotImplementedError, with no database.
//
// Not yet (D2 limits): idempotency keys are accepted and not stored, no event rows are written,
// and the org's agentApprovals setting is read as "required".

import {
  type ActorType,
  type ApprovalAccepted,
  can,
  type DryRunResult,
  type ErrorDetail,
  NO_SET_RISK_RESOURCE,
  type OperationContext,
  type OperationContextFor,
  type OperationId,
  type RunSource,
  specIssuesToDetails,
  type TenantContext,
  toJsonPointer,
} from "@bandwise/core";
import { type BandwiseDb, repos, type TenantTx } from "@bandwise/db";
import type { z } from "zod";

import { liveAgentActor } from "../auth/bearer";
import { approvalInputHash, DEFAULT_CONSOLE_ORIGIN, describeApproval, openApproval } from "../manage/approvals";
import { bareEtag } from "../manage/spec-diff";
import type { AuditRecord, OperationEnv, RegisteredOperation } from "./define";
import { OperationError } from "./errors";
import { getOperation, isOperationId, type OperationOutput } from "./registry";

export interface RunOperationOptions {
  /** From the Idempotency-Key header. Accepted and not stored yet (D2). */
  idempotencyKey?: string;
  /** From the If-Match header. */
  ifMatch?: string;
  /** ?dryRun=true: run the checks and the preview, write nothing. */
  dryRun?: boolean;
  /** set.run: the Bandwise-Interface header, becomes RunRequest.interfaceMajor. */
  interfaceMajor?: number;
  /**
   * set.run: the run source, set by the adapter from the auth mode and surface (RunRequest.source).
   * Never read from the body.
   */
  runSource?: RunSource;
  /**
   * Set only by the approval executor, never by an adapter: the approved request this call runs.
   * The gate is skipped and the request is checked against the call.
   */
  approvalId?: string;
}

/** What real handlers need besides the context. */
export interface OperationDeps {
  db: BandwiseDb;
  now?: () => Date;
  /** Where approval links point. Defaults to https://app.bandwise.dev. */
  consoleOrigin?: string;
  /** Unexpected errors log their type and the request id only, never a message. */
  logError?: (message: string, requestId: string) => void;
}

/**
 * What runOperation returns. Only the route adapter maps it to HTTP: "ok" is the operation's
 * success status, "dryRun" is 200 with the preview, and "approval" is 202 with the approval.
 */
export type RunOperationResult<K extends OperationId> =
  | { kind: "ok"; output: OperationOutput<K>; etag?: string }
  | { kind: "dryRun"; preview: DryRunResult }
  | { kind: "approval"; accepted: ApprovalAccepted };

/** `400 invalid_request` details: one JSON Pointer per failing field. */
export function inputIssuesToDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: toJsonPointer(issue.path),
    rule: "request.invalid",
    severity: "error",
    message: issue.message,
  }));
}

/** Thrown by env.authorize on a gated agent call; runOperation turns it into a pending approval. */
class ApprovalRequired extends Error {
  override readonly name = "ApprovalRequired";
}

const AUDIT_ACTOR: Record<TenantContext["actor"]["type"], ActorType> = { user: "user", agent: "agent", apiKey: "app", system: "system" };

async function writeAudit(tx: TenantTx, ctx: TenantContext, action: OperationId, row: AuditRecord, approvalId: string | null): Promise<void> {
  const a = ctx.actor;
  await repos.auditLog.insert(tx, {
    actorType: AUDIT_ACTOR[a.type],
    client: ctx.client,
    actorUserId: a.type === "user" || a.type === "agent" ? a.userId : null,
    actorTokenId: a.type === "agent" ? a.tokenId : a.type === "apiKey" ? a.keyId : null,
    actorRole: a.type === "user" || a.type === "agent" ? a.role : null,
    approvalId,
    impersonatorId: a.type === "user" ? a.impersonatorId : null,
    action,
    targetType: row.targetType,
    targetId: row.targetId,
    diff: row.diff,
  });
}

/** Error details for a whole-body spec: paths relative to the body, with the spec rule ids. */
function detailsFor(op: RegisteredOperation, error: z.ZodError): ErrorDetail[] {
  const body = op.request.body;
  if (body.kind !== "whole" || body.key !== "spec") return inputIssuesToDetails(error);
  const inSpec = error.issues.filter((i) => i.path[0] === "spec").map((i) => ({ ...i, path: i.path.slice(1) }));
  const rest = error.issues.filter((i) => i.path[0] !== "spec");
  return [...specIssuesToDetails(inSpec as z.core.$ZodIssue[]), ...inputIssuesToDetails({ issues: rest } as z.ZodError)];
}

const sentence = (s: string) => (s.length === 0 ? s : `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}.`);

export async function runOperation<K extends OperationId>(
  id: K,
  ctx: OperationContextFor<K>,
  rawInput: unknown,
  options: RunOperationOptions = {},
  deps?: OperationDeps,
): Promise<RunOperationResult<K>> {
  // Widened on purpose: the check below enforces the context kind at run time.
  const op: RegisteredOperation = getOperation(id);
  const context: OperationContext = ctx;

  // 1. Resolve the actor. Callers pass a resolved context (server/auth builds it from the token).
  // Only org.create and the platform_* operations run without an org.
  if (context.orgId === null && !op.orgLess) {
    throw new OperationError("not_found", `${id} needs an org.`);
  }

  // 2. Validate input.
  const prepared = op.prepare(rawInput);
  if (!prepared.ok) {
    throw new OperationError("invalid_request", `The input for ${id} is invalid.`, { details: detailsFor(op, prepared.error) });
  }
  const call = prepared.call;

  // 3. Actor type and token scope, before any database work. can() checks the role and the
  // resource rules inside the transaction, once the handler has loaded the resource.
  const actor = context.actor;
  if (!op.descriptor.actors.includes(actor.type)) {
    const sessionOnly = op.descriptor.actors.length === 1 && op.descriptor.actors[0] === "user";
    throw new OperationError(
      "insufficient_scope",
      sessionOnly ? `${id} needs a console session.` : `${id} cannot be called by this actor.`,
    );
  }
  if ((actor.type === "agent" || actor.type === "apiKey") && call.scope !== "any") {
    if (!actor.scopes.includes(call.scope)) {
      throw new OperationError("insufficient_scope", `${id} needs the ${call.scope} scope.`, {
        requiredScope: call.scope,
      });
    }
  }

  // 6. If-Match presence. The mismatch check (412 with currentEtag) is the handler's, against the draft.
  if (op.ifMatch === "required" && options.ifMatch === undefined) {
    throw new OperationError("precondition_required", `${id} requires If-Match with the draft ETag.`);
  }
  if (options.dryRun === true && !call.hasPreview) {
    throw new OperationError("invalid_request", `${id} does not accept dryRun.`);
  }

  if (!call.implemented) {
    if (options.dryRun === true) return { kind: "dryRun", preview: await call.preview(null) };
    // Stubs throw OperationNotImplementedError.
    return { kind: "ok", output: (await call.handle(null)) as OperationOutput<K> };
  }
  if (deps === undefined) throw new Error(`${id} needs OperationDeps with a database`);
  if (context.orgId === null) throw new Error(`${id} has a handler but no org`);
  const tenant = context as TenantContext;
  const now = deps.now?.() ?? new Date();
  const ifMatch = options.ifMatch === undefined ? undefined : bareEtag(options.ifMatch);
  const approvalId = options.approvalId ?? null;
  const towardSafety = op.descriptor.towardSafety;

  const state: { authorized: boolean; audit: AuditRecord | null; unchanged: boolean; etag?: string; approvals: string[] } = {
    authorized: false,
    audit: null,
    unchanged: false,
    approvals: [],
  };

  const result = await deps.db.withTenant(tenant, async (tx): Promise<RunOperationResult<K>> => {
    if (approvalId !== null) await checkApproval(tx, tenant, id, call.input, ifMatch, approvalId);

    const env: OperationEnv = {
      ctx: tenant,
      tx,
      now,
      ifMatch,
      approvalId,
      authorize(resource, risk = NO_SET_RISK_RESOURCE, notFoundMessage) {
        // 3. can(): role floor and raises, set allowlist, channel, cross-org 404.
        const decision = can(tenant, id, { ...resource, orgId: tenant.orgId });
        if (!decision.allowed) {
          if (decision.code === "not_found") throw new OperationError("not_found", notFoundMessage ?? "Not found.");
          throw new OperationError("insufficient_scope", sentence(decision.reason), decision.requiredScope === undefined ? {} : { requiredScope: decision.requiredScope });
        }
        state.authorized = true;
        // 4. The approval gate: agents only, never for moves toward safety.
        const gated = tenant.actor.type === "agent" && !towardSafety && approvalId === null && call.risk(tenant, risk) === "high";
        if (gated && options.dryRun !== true) throw new ApprovalRequired();
        return gated;
      },
      audit(row) {
        state.audit = row;
      },
      unchanged() {
        state.unchanged = true;
      },
      etag(value) {
        state.etag = value;
      },
      runApprovalAfterCommit(id) {
        state.approvals.push(id);
      },
    };

    if (options.dryRun === true) {
      const preview = await call.preview(env);
      if (!state.authorized) throw new Error(`${id} preview did not call authorize`);
      return { kind: "dryRun", preview };
    }

    let output: unknown;
    try {
      output = await call.handle(env);
    } catch (e) {
      if (!(e instanceof ApprovalRequired)) throw e;
      const opened = await openApproval(tx, tenant, id, call.input, ifMatch, now, deps.consoleOrigin ?? DEFAULT_CONSOLE_ORIGIN);
      // An approval request is a mutation too. A replay that reuses a pending request writes nothing.
      if (opened.created !== null) {
        const created = opened.created;
        await writeAudit(tx, tenant, id, { targetType: "approval_request", targetId: created.id, diff: { status: "pending", reason: created.reason } }, created.id);
      }
      return { kind: "approval", accepted: opened.accepted };
    }
    if (!state.authorized) throw new Error(`${id} handler did not call authorize`);

    // 8. The audit row, in the handler's transaction.
    if (state.audit !== null) await writeAudit(tx, tenant, id, state.audit, approvalId);
    else if (!op.descriptor.readOnly && !state.unchanged) throw new Error(`${id} changed data without an audit row`);

    if (approvalId !== null) await repos.approvalRequests.update(tx, approvalId, { result: { ok: true, response: output } });
    const ok: RunOperationResult<K> = { kind: "ok", output: output as OperationOutput<K> };
    if (state.etag !== undefined) ok.etag = state.etag;
    return ok;
  });

  // After commit: run what a person just approved, then answer with the request as it ended.
  if (result.kind === "ok" && state.approvals.length > 0) {
    let view: unknown = result.output;
    for (const approved of state.approvals) view = await executeApproval(tenant, approved, deps);
    return { kind: "ok", output: view as OperationOutput<K> };
  }
  return result;
}

/**
 * An approved request may run only as the token that asked, for the input and If-Match it asked
 * with, and only once: it is claimed (approved to executed) in the handler's transaction, so a
 * second run waits on the row lock and then finds it claimed. A failed run rolls the claim back.
 */
async function checkApproval(tx: TenantTx, ctx: TenantContext, id: OperationId, input: unknown, ifMatch: string | undefined, approvalId: string): Promise<void> {
  const row = await repos.approvalRequests.get(tx, approvalId);
  const actor = ctx.actor;
  const ok =
    row !== null &&
    row.status === "approved" &&
    row.opId === id &&
    actor.type === "agent" &&
    row.requestedByTokenId === actor.tokenId &&
    row.inputHash === approvalInputHash(input, ifMatch);
  if (!ok) throw new Error("the approved request does not match this call");
  const claimed = await repos.approvalRequests.transition(tx, approvalId, "approved", { status: "executed" });
  if (claimed === null) throw new Error("the approved request already ran");
}

/** What a failed approved request records: the envelope's code and message, never a stack. */
function failure(e: unknown): { ok: false; error: { code: string; message: string; currentEtag?: string } } {
  if (e instanceof OperationError) {
    return { ok: false, error: { code: e.code, message: e.message, ...(e.currentEtag === undefined ? {} : { currentEtag: e.currentEtag }) } };
  }
  return { ok: false, error: { code: "internal_error", message: "The approved operation could not be completed." } };
}

/**
 * Run an approved request as the agent token that asked (management-api.md, runOperation, last
 * paragraph). The token and its user's role are checked again; a revoked token or a stale If-Match
 * runs nothing and the error is stored in the request's result. Returns the request's view.
 */
async function executeApproval(decider: TenantContext, approvalId: string, deps: OperationDeps): Promise<unknown> {
  const now = deps.now?.() ?? new Date();
  const loaded = await deps.db.withTenant(decider, async (tx) => {
    const row = await repos.approvalRequests.get(tx, approvalId);
    if (row === null) return null;
    const token = await repos.agentTokens.get(tx, row.requestedByTokenId);
    const actor = token === null ? null : await liveAgentActor(tx, token, now);
    return { row, actor };
  });
  if (loaded === null) throw new Error("the approval disappeared before it ran");
  const { row, actor } = loaded;

  let outcome: ReturnType<typeof failure> | null = null;
  if (actor === null) {
    outcome = { ok: false, error: { code: "unauthenticated", message: "The requesting token is revoked or expired, or its user left the org." } };
  } else if (!isOperationId(row.opId)) {
    outcome = { ok: false, error: { code: "invalid_request", message: `${row.opId} is not an operation.` } };
  } else {
    const agentCtx: TenantContext = { orgId: decider.orgId, actor, client: actor.client, plan: decider.plan, requestId: decider.requestId };
    try {
      const options: RunOperationOptions = { approvalId };
      if (row.ifMatch !== null) options.ifMatch = row.ifMatch;
      await runOperation(row.opId as never, agentCtx as never, row.input, options, deps);
    } catch (e) {
      if (!(e instanceof OperationError)) deps.logError?.(e instanceof Error ? e.name : "unknown error", decider.requestId);
      outcome = failure(e);
    }
  }

  return deps.db.withTenant(decider, async (tx) => {
    // Only a request that is still approved records a failure, never one another run executed.
    if (outcome !== null) await repos.approvalRequests.transition(tx, approvalId, "approved", { result: outcome });
    const after = await repos.approvalRequests.get(tx, approvalId);
    if (after === null) throw new Error("the approval disappeared after it ran");
    return describeApproval(tx, after, now);
  });
}
