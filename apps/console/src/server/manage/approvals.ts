// Approvals (management-api.md, Approvals; security.md, Approval gate). An agent's high-risk call
// becomes a pending approval_requests row; a person in a console session approves or rejects it,
// and an approved request runs unchanged as the agent's token (run-operation.ts).

import {
  type ApprovalAccepted,
  hashJson,
  type JsonValue,
  OPERATION_CATALOG,
  type OperationId,
  Role,
  roleAtLeast,
  type TenantContext,
} from "@bandwise/core";
import { authRepositories, repos, type TenantTx } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import { findSet, iso, isoOrNull, isUuid } from "./common";

/** Requests expire after seven days (security.md). */
export const APPROVAL_TTL_MS = 7 * 86_400_000;

/** The console origin approval links point at (ADR-018). */
export const DEFAULT_CONSOLE_ORIGIN = "https://app.bandwise.dev";

type ApprovalRow = NonNullable<Awaited<ReturnType<typeof repos.approvalRequests.get>>>;

export interface ApprovalViewOut {
  id: string;
  opId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  reason: string;
  /** The input the agent sent, which runs unchanged on approval. */
  input: JsonValue;
  /** The If-Match value it was sent with: the draft ETag the agent saw. */
  ifMatch: string | null;
  requestedBy: { userId: string; tokenId: string; name?: string; tokenName?: string };
  createdAt: string;
  expiresAt: string;
  decidedBy?: string;
  decidedAt?: string;
  result?: JsonValue;
}

/** The input hash covers the If-Match value too, so a request for another draft is another request. */
export function approvalInputHash(input: unknown, ifMatch: string | undefined): string {
  return `sha256:${hashJson({ input, ifMatch: ifMatch ?? null })}`;
}

/** A pending request past its expiry reads as expired. */
export function effectiveStatus(row: ApprovalRow, now: Date): ApprovalViewOut["status"] {
  return row.status === "pending" && row.expiresAt.getTime() <= now.getTime() ? "expired" : row.status;
}

export function approvalView(row: ApprovalRow, now: Date): ApprovalViewOut {
  const view: ApprovalViewOut = {
    id: row.id,
    opId: row.opId,
    status: effectiveStatus(row, now),
    reason: row.reason,
    input: (row.input ?? null) as JsonValue,
    ifMatch: row.ifMatch,
    requestedBy: { userId: row.requestedByUserId, tokenId: row.requestedByTokenId },
    createdAt: iso(row.createdAt),
    expiresAt: iso(row.expiresAt),
  };
  if (row.decidedByUserId !== null) view.decidedBy = row.decidedByUserId;
  const decidedAt = isoOrNull(row.decidedAt);
  if (decidedAt !== null) view.decidedAt = decidedAt;
  if (row.result !== null && row.result !== undefined) view.result = row.result as JsonValue;
  return view;
}

/**
 * approvalView plus who asked: the member's name and the token's name, so the inbox can say
 * "PJ, through the cli token". The name is read only for a member of this org.
 */
export async function describeApproval(tx: TenantTx, row: ApprovalRow, now: Date): Promise<ApprovalViewOut> {
  const view = approvalView(row, now);
  const token = await repos.agentTokens.get(tx, row.requestedByTokenId);
  if (token !== null) view.requestedBy.tokenName = token.name;
  const member = await repos.memberships.getByUser(tx, row.requestedByUserId);
  const user = member === null ? null : await authRepositories.users.get(tx, row.requestedByUserId);
  if (user !== null) view.requestedBy.name = user.name;
  return view;
}

/** The reason people see: the input's reason or changelog, else the operation id. */
function reasonOf(opId: string, input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  const text = typeof o["reason"] === "string" ? o["reason"] : typeof o["changelog"] === "string" ? o["changelog"] : null;
  return text === null ? opId : `${opId}: ${text}`;
}

/**
 * Open (or reuse) the pending approval for a gated agent call. A replay with the same input and
 * If-Match from the same token gets the same pending request back.
 */
export async function openApproval(
  tx: TenantTx,
  ctx: TenantContext,
  opId: OperationId,
  input: unknown,
  ifMatch: string | undefined,
  now: Date,
  consoleOrigin: string,
): Promise<{ accepted: ApprovalAccepted; created: ApprovalRow | null }> {
  const actor = ctx.actor;
  if (actor.type !== "agent") throw new Error("only agent calls are gated");
  const inputHash = approvalInputHash(input, ifMatch);
  const existing = await repos.approvalRequests.findPending(tx, actor.tokenId, opId, inputHash, now);
  const row =
    existing ??
    (await repos.approvalRequests.insert(tx, {
      opId,
      input,
      inputHash,
      ifMatch: ifMatch ?? null,
      requestedByTokenId: actor.tokenId,
      requestedByUserId: actor.userId,
      reason: reasonOf(opId, input),
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    }));
  return {
    accepted: { approval: { id: row.id, status: "pending", url: `${consoleOrigin}/approvals/${row.id}`, expiresAt: iso(row.expiresAt) } },
    created: existing === null ? row : null,
  };
}

/**
 * The role a person needs to decide a request: the requested operation's floor, raised to admin
 * where can() raises it (a protected set's publish, entering full, skipExperiment).
 */
export async function requiredRoleFor(tx: TenantTx, row: ApprovalRow): Promise<Role> {
  const entry = OPERATION_CATALOG.find((e) => e.id === row.opId);
  if (entry === undefined) return "owner";
  const floor = Role.safeParse(entry.minRole);
  let role: Role = floor.success ? floor.data : "admin";
  const input = (row.input ?? {}) as Record<string, unknown>;
  const raise = (to: Role) => {
    if (!roleAtLeast(role, to)) role = to;
  };
  if (input["skipExperiment"] !== undefined) raise("admin");
  if (row.opId === "rollout.change" && input["stage"] === "full") raise("admin");
  if ((row.opId === "set.publish" || row.opId === "channel.promote") && typeof input["ref"] === "string") {
    const set = await findSet(tx, input["ref"]).catch(() => null);
    if (set?.protected === true) raise("admin");
  }
  return role;
}

// ---------------------------------------------------------------------------
// approval.list, approval.get, approval.decide

export async function listApprovals(env: OperationEnv, input: { limit: number; cursor?: string | undefined }) {
  env.authorize({});
  const actor = env.ctx.actor;
  if (input.cursor !== undefined && !isUuid(input.cursor)) throw new OperationError("invalid_request", "The cursor is not one this list returned.");
  const page = await repos.approvalRequests.listPending(
    env.tx,
    { now: env.now, ...(actor.type === "agent" ? { tokenId: actor.tokenId } : {}) },
    { limit: input.limit, cursor: input.cursor ?? null },
  );
  const data: ApprovalViewOut[] = [];
  for (const row of page.data) {
    // A person sees the requests their role can decide; a token sees its own.
    if (actor.type === "user" && !roleAtLeast(actor.role, await requiredRoleFor(env.tx, row))) continue;
    data.push(await describeApproval(env.tx, row, env.now));
  }
  return { data, nextCursor: page.nextCursor };
}

async function visibleApproval(env: OperationEnv, id: string): Promise<ApprovalRow> {
  const notFound = `No approval ${id} is visible to this caller.`;
  env.authorize({}, undefined, notFound);
  const row = await repos.approvalRequests.get(env.tx, id);
  const actor = env.ctx.actor;
  if (row === null || (actor.type === "agent" && row.requestedByTokenId !== actor.tokenId)) throw new OperationError("not_found", notFound);
  // The same rule as approval.list: a person sees only the requests their role can decide.
  if (actor.type === "user" && !roleAtLeast(actor.role, await requiredRoleFor(env.tx, row))) throw new OperationError("not_found", notFound);
  return row;
}

export async function getApproval(env: OperationEnv, input: { id: string }): Promise<ApprovalViewOut> {
  return describeApproval(env.tx, await visibleApproval(env, input.id), env.now);
}

export async function decideApproval(env: OperationEnv, input: { id: string; decision: "approved" | "rejected"; note?: string | undefined }): Promise<ApprovalViewOut> {
  const row = await repos.approvalRequests.get(env.tx, input.id);
  const notFound = `No approval ${input.id} is visible to this caller.`;
  if (row === null) {
    env.authorize({}, undefined, notFound);
    throw new OperationError("not_found", notFound);
  }
  env.authorize({ requiredRole: await requiredRoleFor(env.tx, row) }, undefined, notFound);
  const status = effectiveStatus(row, env.now);
  if (status !== "pending") throw new OperationError("invalid_request", `This approval is ${status}, not pending.`);
  const actor = env.ctx.actor;
  const userId = actor.type === "user" ? actor.userId : null;
  // Conditional, so two people deciding at once cannot both land: the second finds it decided.
  const updated = await repos.approvalRequests.transition(env.tx, row.id, "pending", { status: input.decision, decidedByUserId: userId, decidedAt: env.now }, env.now);
  if (updated === null) throw new OperationError("invalid_request", "This approval is no longer pending.");
  env.audit({
    targetType: "approval_request",
    targetId: row.id,
    diff: { opId: row.opId, decision: input.decision, note: input.note ?? null, requestedByTokenId: row.requestedByTokenId },
  });
  if (input.decision === "approved") env.runApprovalAfterCommit(row.id);
  return describeApproval(env.tx, updated, env.now);
}
