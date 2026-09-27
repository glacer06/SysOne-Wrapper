// runOperation: the one entry point every caller uses (management-api.md, runOperation).
// Phase 0 stub. It validates input, checks the context kind, the actor type and token scope,
// requires If-Match where the operation always needs it, and dispatches to the handler or the
// preview. Every handler is still a stub, so a valid call ends in OperationNotImplementedError.

import {
  toJsonPointer,
  type ApprovalAccepted,
  type DryRunResult,
  type ErrorDetail,
  type OperationContext,
  type OperationContextFor,
  type OperationId,
  type RunSource,
} from "@bandwise/core";
import type { z } from "zod";

import type { RegisteredOperation } from "./define";
import { OperationError } from "./errors";
import { getOperation, type OperationOutput } from "./registry";

export interface RunOperationOptions {
  /** From the Idempotency-Key header. */
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
}

/**
 * What runOperation returns. Only the route adapter maps it to HTTP: "ok" is the operation's
 * success status, "dryRun" is 200 with the preview, and "approval" is 202 with the approval.
 */
export type RunOperationResult<K extends OperationId> =
  | { kind: "ok"; output: OperationOutput<K> }
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

export async function runOperation<K extends OperationId>(
  id: K,
  ctx: OperationContextFor<K>,
  rawInput: unknown,
  options: RunOperationOptions = {},
): Promise<RunOperationResult<K>> {
  // Widened on purpose: the check below enforces the context kind at run time.
  const op: RegisteredOperation = getOperation(id);
  const context: OperationContext = ctx;

  // 1. Resolve the actor. Callers pass a resolved context; tenancy builds it (Phase 2).
  // Only org.create and the platform_* operations run without an org.
  if (context.orgId === null && !op.orgLess) {
    throw new OperationError("not_found", `${id} needs an org.`);
  }

  // 2. Validate input.
  const prepared = op.prepare(rawInput);
  if (!prepared.ok) {
    throw new OperationError("invalid_request", `The input for ${id} is invalid.`, {
      details: inputIssuesToDetails(prepared.error),
    });
  }
  const call = prepared.call;

  // 3. Actor, scope and role. can() in packages/tenancy adds the role floor, resource rules,
  // set allowlists and cross-org 404s in Phase 2; this stub checks the actor type and token scope.
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

  // 4. Approval gate for agent actors on high-risk input (Phase 2, needs the approval store). A
  // gated call returns { kind: "approval" } instead of running the handler.
  // 5. Idempotency lookup by (org_id, actor_key, key) (Phase 2, needs the idempotency store).

  // 6. If-Match. The mismatch check (412 precondition_failed with currentEtag) needs the draft store (Phase 3).
  if (op.ifMatch === "required" && options.ifMatch === undefined) {
    throw new OperationError("precondition_required", `${id} requires If-Match with the draft ETag.`);
  }

  if (options.dryRun === true) {
    if (!call.hasPreview) {
      throw new OperationError("invalid_request", `${id} does not accept dryRun.`);
    }
    return { kind: "dryRun", preview: await call.preview(context) };
  }

  // 7. Handler inside withTenant, in one transaction (Phase 1 adds withTenant).
  // 8 to 10. Audit row, event rows for op.descriptor.emits and the stored idempotent response,
  // in the same transaction (Phase 2).
  const output = (await call.handle(context)) as OperationOutput<K>;
  return { kind: "ok", output };
}
