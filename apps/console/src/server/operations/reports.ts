// Reports, audit and events (management-api.md, Reports, audit and events; events.md).

import { EventListResult, EventType, IsoTimestamp, TokenId, UserId } from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderOutput } from "./define";
import { ReportFormat, listInput, placeholderListOutput } from "./schemas";

/** events.md, Pull feed: limit defaults to 100, max 500. */
export const EVENT_FEED_LIMIT_DEFAULT = 100;
export const EVENT_FEED_LIMIT_MAX = 500;

/** `?types=a,b`: a comma-separated list of event types. */
const EventTypeList = z
  .string()
  .min(1)
  .transform((s) => s.split(",").map((t) => t.trim()))
  .pipe(z.array(EventType).min(1));

export const reportOperations = operationGroup(
  defineOperation("report.get", {
    summary: "Read a named report as JSON, CSV or PDF.",
    input: z.strictObject({ name: z.string().min(1), format: ReportFormat.optional() }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "get_report",
  }),

  defineOperation("alert.list", {
    summary: "List raised alerts.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("audit.list", {
    summary: "List audit rows. A CSV export is itself audited.",
    input: listInput({
      action: z.string().min(1).optional(),
      actorUserId: UserId.optional(),
      actorTokenId: TokenId.optional(),
      from: IsoTimestamp.optional(),
      to: IsoTimestamp.optional(),
      format: ReportFormat.exclude(["pdf"]).optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("event.list", {
    summary: "Read the event feed after a cursor. The feed has its own cursor instead of { data, nextCursor }.",
    input: z.strictObject({
      /** The id of the last event the caller has seen. */
      after: z.string().min(1).optional(),
      types: EventTypeList.optional(),
      limit: z.coerce.number().int().min(1).max(EVENT_FEED_LIMIT_MAX).default(EVENT_FEED_LIMIT_DEFAULT),
    }),
    output: EventListResult,
    mcp: "list_events",
  }),

  defineOperation("webhook.list", {
    summary: "List org webhook endpoints.",
    input: listInput({}),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("webhook.create", {
    summary: "Add an org webhook endpoint for a list of event types.",
    input: z.strictObject({ url: z.url(), types: z.array(EventType).min(1) }),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("webhook.delete", {
    summary: "Delete an org webhook endpoint.",
    input: z.strictObject({ id: z.uuid() }),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderOutput(),
  }),
);
