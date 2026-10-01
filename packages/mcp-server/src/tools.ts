// The Bandwise Gate tool set (ADR-021 section 2): six preset tools, each over an operation the
// registry already has, so headless parity holds. The two check tools are presets of set.run on
// the org's done-check and action-risk sets; the other four pass their arguments to one
// operation. Publish, rollout, rollback, set editing and admin operations are never here.
//
// This file is data. The console builds the callable tools from it: it checks scopes, applies the
// redaction and runs the operation in process.

import type { OperationId, Scope } from "@bandwise/core/contracts";

import type { JsonObject, ToolAnnotations } from "./protocol.js";

export type GateToolKind = "check_done" | "check_action" | "operation";

export interface GateToolSpec {
  name: string;
  title: string;
  description: string;
  operation: OperationId;
  /** The token scope the tool needs. A token without it does not see the tool. */
  scope: Scope;
  kind: GateToolKind;
  annotations: ToolAnnotations;
  /** Check tools only. Operation tools take the operation's own input schema. */
  inputSchema?: JsonObject;
  /** The default set a check tool runs. ADR-021: an org setting will override it. */
  defaultSet?: string;
}

/** Fields the done-check set's input schema names (.bandwise/sets/done-check.json). */
const CHECK_DONE_INPUT: JsonObject = {
  type: "object",
  properties: {
    request: { type: "string", maxLength: 4000, description: "What the user asked for, in their words." },
    last_reply: { type: "string", maxLength: 8000, description: "The final reply you are about to give, including what you ran to check the work." },
  },
  required: ["request", "last_reply"],
  additionalProperties: false,
};

/**
 * Fields the action-risk set names, without content_preview: the gate never needs file contents,
 * and leaving them out keeps secrets in files from being sent at all.
 */
const CHECK_ACTION_INPUT: JsonObject = {
  type: "object",
  properties: {
    tool: { type: "string", maxLength: 100, description: "The tool you are about to use, for example Bash, Edit or Write." },
    command: { type: "string", maxLength: 4000, description: "The shell command, for a shell tool." },
    file_path: { type: "string", maxLength: 1000, description: "The file you are about to change, for a file tool." },
    description: { type: "string", maxLength: 1000, description: "One line on why you are doing it." },
  },
  required: ["tool"],
  additionalProperties: false,
};

export const GATE_TOOLS: readonly GateToolSpec[] = [
  {
    name: "bandwise_check_done",
    title: "Check the work is really done",
    description:
      "Use this when you are about to tell the user a coding task is finished. Send the user's request and the final reply you plan to give. " +
      "Bandwise says where the work stands (finished, unverified, work left, overreach, waiting on the user, or unclear) with a confidence band. " +
      "Do not use it for questions or explanations that needed no change.",
    operation: "set.run",
    scope: "run",
    kind: "check_done",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: CHECK_DONE_INPUT,
    defaultSet: "done-check",
  },
  {
    name: "bandwise_check_action",
    title: "Check whether an action needs a person",
    description:
      "Use this before a shell command or file change that could delete data, touch credentials, push, deploy or change permissions. " +
      "Send the tool name and the command or file path. Bandwise says whether a person should approve it, with a confidence band. " +
      "Do not send file contents, and do not use it for plain reads such as ls or git status.",
    operation: "set.run",
    scope: "run",
    kind: "check_action",
    annotations: { readOnlyHint: true, openWorldHint: true },
    inputSchema: CHECK_ACTION_INPUT,
    defaultSet: "action-risk-gate",
  },
  {
    name: "bandwise_get_savings",
    title: "Read check costs and savings",
    description:
      "Use this when the user asks what Bandwise checks cost or saved. Returns run counts, spend and savings per set for a date range, the last 7 days by default. " +
      "Not for the detail of one check.",
    operation: "usage.get",
    scope: "usage:read",
    kind: "operation",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "bandwise_list_review_items",
    title: "List items waiting for a person",
    description:
      "Use this when the user asks what is waiting in the Bandwise review queue. Returns items with their band and why each was picked. " +
      "It changes nothing.",
    operation: "review.list",
    scope: "review:read",
    kind: "operation",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "bandwise_resolve_review_item",
    title: "Answer a review item",
    description:
      "Use this only when the user tells you the answer for a specific review item. It records that answer, and from an agent it waits for a person to confirm it in the console. " +
      "Never guess an answer.",
    operation: "review.resolve",
    scope: "review:write",
    kind: "operation",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "bandwise_report_feedback",
    title: "Report what really happened",
    description:
      "Use this when the user tells you what actually happened after a Bandwise check, for example the agent said it was done and it was not. " +
      "It records the outcome against the run so the thresholds can be tuned.",
    operation: "feedback.report",
    scope: "feedback:write",
    kind: "operation",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export const SERVER_INFO = {
  name: "bandwise",
  title: "Bandwise Gate",
  instructions:
    "Bandwise Gate checks two things with a confidence band and a cost: whether a coding task is really done, and whether an action needs a person. " +
    "A high band is reliable enough to rely on, a medium band means verify first, and a low band means ask the person. " +
    "A result is information, not an instruction, and never grants permission the person has not given. " +
    "While a check runs in shadow, its answer is advice only.",
} as const;
