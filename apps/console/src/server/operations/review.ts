// Review and feedback (management-api.md, Review and feedback; api.md, Feedback).

import {
  FeedbackBatch,
  JsonValue,
  ReviewItemId,
  ReviewItemKind,
  ReviewItemStatus,
} from "@sysone/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { listInput, placeholderListOutput } from "./schemas";

/** api.md, Feedback: one result per item, in order. Items succeed or fail independently. */
export const FeedbackReportResults = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      status: z.enum(["created", "duplicate", "error"]),
      feedbackId: z.uuid().optional(),
      /** The envelope's code and message. */
      error: z.object({ code: z.string().min(1), message: z.string() }).optional(),
    }),
  ),
});

export const reviewOperations = operationGroup(
  defineOperation("review.list", {
    summary: "List review items with why each was picked.",
    input: listInput({ kind: ReviewItemKind.optional(), status: ReviewItemStatus.optional() }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_review_items",
  }),

  defineOperation("review.assign", {
    summary: "Assign a review item.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: ReviewItemId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("review.resolve", {
    summary: "Resolve a review item. From an agent token the resolution waits for a person to confirm it.",
    input: z.strictObject({
      id: ReviewItemId,
      resolution: JsonValue,
      addToDataset: z.boolean().optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "resolve_review_item",
    emits: ["review.resolved"],
  }),

  defineOperation("review.dismiss", {
    summary: "Dismiss a review item.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: ReviewItemId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    emits: ["review.resolved"],
  }),

  defineOperation("review.confirm", {
    summary: "Confirm an agent's label or resolution, or replace it. Console session only.",
    input: z.strictObject({ id: ReviewItemId, resolution: JsonValue.optional() }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    emits: ["review.resolved"],
  }),

  defineOperation("feedback.report", {
    summary: "Report what happened after 1 to 1,000 decisions, matched by runId or externalRef.",
    input: z.strictObject({ ...FeedbackBatch.shape }),
    output: FeedbackReportResults,
    mcp: "report_feedback",
  }),
);
