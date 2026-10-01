// Handlers for review.list, review.resolve, review.dismiss and review.confirm (management-api.md,
// Review and feedback). A person or an app token resolves an item and writes its truth row to
// run_feedback. An agent only proposes: the item waits at pending_confirmation, its row counts for
// nothing, and a person confirms or replaces it in a console session.

import type { Band, FailureClass, JsonValue, ReviewItemKind, ReviewItemStatus } from "@bandwise/core";
import { repos, type ReviewPageFilter, type TenantTx } from "@bandwise/db";

import type { OperationEnv } from "../operations/define";
import { OperationError } from "../operations/errors";
import type { ReviewItemView } from "../operations/views";
import { actorIds, allowlistOf, iso, isoOrNull, isUuid } from "./common";
import { visibleSetId } from "./runs";

type ItemRow = NonNullable<Awaited<ReturnType<typeof repos.reviewItems.get>>>;

export function reviewItemView(r: ItemRow): ReviewItemView {
  return {
    id: r.id,
    runId: r.runId,
    setId: r.setId,
    decisionId: r.decisionId,
    kind: r.kind,
    reason: r.reason,
    sampleRate: r.sampleRate,
    band: r.band,
    suggested: (r.suggested ?? null) as JsonValue | null,
    status: r.status,
    assigneeId: r.assigneeId,
    resolution: (r.resolution ?? null) as JsonValue | null,
    resolvedBy: { userId: r.resolvedByUserId, tokenId: r.resolvedByTokenId },
    resolvedAt: isoOrNull(r.resolvedAt),
    addToDataset: r.addToDataset,
    createdAt: iso(r.createdAt),
  };
}

export async function listReview(
  env: OperationEnv,
  input: {
    kind?: ReviewItemKind | undefined;
    status?: ReviewItemStatus | undefined;
    set?: string | undefined;
    band?: Band | undefined;
    limit: number;
    cursor?: string | undefined;
  },
) {
  env.authorize({});
  if (input.cursor !== undefined && !isUuid(input.cursor)) throw new OperationError("invalid_request", "The cursor is not one this list returned.");
  const filter: ReviewPageFilter = {};
  const allow = allowlistOf(env.ctx);
  if (allow !== undefined) filter.setIds = allow;
  if (input.set !== undefined) filter.setId = await visibleSetId(env, input.set);
  if (input.kind !== undefined) filter.kind = input.kind;
  if (input.status !== undefined) filter.status = input.status;
  if (input.band !== undefined) filter.band = input.band;
  const page = await repos.reviewItems.listPage(env.tx, filter, { limit: input.limit, cursor: input.cursor ?? null });
  return { data: page.data.map(reviewItemView), nextCursor: page.nextCursor };
}

/** The item, after can() on its set. A missing item and one outside the allowlist get the same 404. */
async function loadItem(env: OperationEnv, id: string): Promise<ItemRow> {
  const notFound = `No review item ${id} is visible to this caller.`;
  const item = isUuid(id) ? await repos.reviewItems.get(env.tx, id) : null;
  if (item === null) {
    env.authorize({}, undefined, notFound);
    throw new OperationError("not_found", notFound);
  }
  env.authorize({ setId: item.setId }, undefined, notFound);
  return item;
}

function refuseClosed(item: ItemRow): never {
  throw new OperationError("already_exists", `Review item ${item.id} is already ${item.status}.`);
}

/**
 * The truth value of a resolution. The console sends `{ value }`, the shape of `suggested`; any
 * other JSON is taken as the value itself, as in a feedback report's `observed`.
 */
export function observedOf(resolution: JsonValue): JsonValue {
  if (typeof resolution === "object" && resolution !== null && !Array.isArray(resolution) && "value" in resolution) {
    return resolution["value"] ?? null;
  }
  return resolution;
}

/** One feedback row per item, so a retry or a confirmation finds the same row. */
const feedbackKey = (itemId: string) => `review:${itemId}`;

async function writeFeedback(tx: TenantTx, env: OperationEnv, item: ItemRow, resolution: JsonValue, source: "reviewer" | "audit" | "agent"): Promise<void> {
  // Studio items have no run, so there is no decision to hold the truth row.
  if (item.runId === null) return;
  const who = actorIds(env.ctx);
  const existing = await repos.runFeedback.getByIdempotencyKey(tx, feedbackKey(item.id));
  const values = { observed: observedOf(resolution), source, observedAt: env.now, userId: who.userId, tokenId: who.tokenId };
  if (existing === null) {
    await repos.runFeedback.insert(tx, { ...values, runId: item.runId, decisionId: item.decisionId, reviewItemId: item.id, idempotencyKey: feedbackKey(item.id) });
  } else {
    await repos.runFeedback.update(tx, existing.id, values);
  }
}

/** A person's row is `audit` when the random audit picked the item, else `reviewer`. */
const humanSource = (item: ItemRow) => (item.sampleRate === null ? "reviewer" : "audit");

export async function resolveReview(
  env: OperationEnv,
  input: { id: string; resolution: JsonValue; addToDataset?: boolean | undefined; failureClass?: FailureClass | undefined },
): Promise<ReviewItemView> {
  const item = await loadItem(env, input.id);
  if (item.status === "pending_confirmation") {
    throw new OperationError("already_exists", `Review item ${item.id} waits for a person to confirm an agent's answer. Confirm or replace it with review.confirm.`);
  }
  if (item.status !== "open") refuseClosed(item);
  const who = actorIds(env.ctx);
  const agent = env.ctx.actor.type === "agent";
  const addToDataset = input.addToDataset ?? item.addToDataset;
  const to = agent ? "pending_confirmation" : "resolved";
  const row = await repos.reviewItems.update(env.tx, item.id, {
    status: to,
    resolution: input.resolution,
    resolvedByUserId: who.userId,
    resolvedByTokenId: who.tokenId,
    resolvedAt: agent ? null : env.now,
    addToDataset,
  });
  if (row === null) throw new OperationError("not_found", `No review item ${input.id} is visible to this caller.`);
  await writeFeedback(env.tx, env, item, input.resolution, agent ? "agent" : humanSource(item));
  // failureClass has no column yet; the audit row keeps it for triage.
  env.audit({
    targetType: "review_item",
    targetId: item.id,
    diff: { status: { from: item.status, to }, resolution: input.resolution, addToDataset, ...(input.failureClass === undefined ? {} : { failureClass: input.failureClass }) },
  });
  return reviewItemView(row);
}

export async function dismissReview(env: OperationEnv, input: { id: string }): Promise<ReviewItemView> {
  const item = await loadItem(env, input.id);
  if (env.ctx.actor.type === "agent") {
    throw new OperationError("insufficient_scope", "An agent cannot dismiss a review item. Resolve it with a proposed answer, and a person confirms it.");
  }
  // A person may dismiss an agent's proposal too: nothing it would trigger runs.
  if (item.status !== "open" && item.status !== "pending_confirmation") refuseClosed(item);
  const who = actorIds(env.ctx);
  const row = await repos.reviewItems.update(env.tx, item.id, {
    status: "dismissed",
    resolvedByUserId: who.userId,
    resolvedByTokenId: who.tokenId,
    resolvedAt: env.now,
  });
  if (row === null) throw new OperationError("not_found", `No review item ${input.id} is visible to this caller.`);
  env.audit({ targetType: "review_item", targetId: item.id, diff: { status: { from: item.status, to: "dismissed" } } });
  return reviewItemView(row);
}

export async function confirmReview(env: OperationEnv, input: { id: string; resolution?: JsonValue | undefined }): Promise<ReviewItemView> {
  const item = await loadItem(env, input.id);
  if (item.status !== "pending_confirmation") {
    throw new OperationError("already_exists", `Review item ${item.id} has no agent answer to confirm. Its status is ${item.status}.`);
  }
  const who = actorIds(env.ctx);
  const replaced = input.resolution !== undefined;
  const resolution = (input.resolution ?? item.resolution ?? null) as JsonValue;
  const row = await repos.reviewItems.update(env.tx, item.id, {
    status: "resolved",
    resolution,
    resolvedByUserId: who.userId,
    resolvedByTokenId: null,
    resolvedAt: env.now,
  });
  if (row === null) throw new OperationError("not_found", `No review item ${input.id} is visible to this caller.`);
  if (item.runId !== null) {
    const fb = await repos.runFeedback.getByIdempotencyKey(env.tx, feedbackKey(item.id));
    if (fb === null || replaced) await writeFeedback(env.tx, env, item, resolution, replaced ? humanSource(item) : "agent");
    const confirmed = await repos.runFeedback.getByIdempotencyKey(env.tx, feedbackKey(item.id));
    if (confirmed !== null) await repos.runFeedback.update(env.tx, confirmed.id, { confirmedByUserId: who.userId, confirmedAt: env.now });
  }
  env.audit({
    targetType: "review_item",
    targetId: item.id,
    diff: { status: { from: item.status, to: "resolved" }, ...(replaced ? { resolution, replacedAgentAnswer: true } : { confirmedAgentAnswer: true }) },
  });
  return reviewItemView(row);
}
