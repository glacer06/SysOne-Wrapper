// Identity, tokens and admin (management-api.md, Identity, tokens and admin; security.md).

import {
  ApprovalDecision,
  ApprovalId,
  ApprovalStatus,
  IsoTimestamp,
  JsonValue,
  Role,
  Scope,
  TokenId,
  UserId,
} from "@bandwise/core";
import { z } from "zod";

import { decideApproval, getApproval, listApprovals } from "../manage/approvals";
import { defineOperation, operationGroup, placeholderInput, placeholderOutput, type RiskLevel } from "./define";
import { isWriteScope, listInput, listOutput, placeholderListOutput } from "./schemas";

/**
 * GET /approvals/{id}: { id, opId, status, reason, requestedBy, expiresAt, decidedBy?, decidedAt?, result? }.
 * requestedBy and decidedBy carry the approval_requests columns they name.
 */
export const ApprovalView = z.object({
  id: ApprovalId,
  opId: z.string().min(1),
  status: ApprovalStatus,
  reason: z.string(),
  requestedBy: z.object({ userId: UserId, tokenId: TokenId }),
  expiresAt: IsoTimestamp,
  decidedBy: UserId.optional(),
  decidedAt: IsoTimestamp.optional(),
  /** After execution: the operation's response, or the error when the re-check stopped it. */
  result: JsonValue.optional(),
});

/**
 * agent_token.create is high when the new token has a write scope, and always with admin:write.
 * Its input is still a placeholder, so this reads `scopes` defensively: anything that is not a
 * list of read scopes counts as high.
 */
export function agentTokenCreateRisk(input: Record<string, unknown>): RiskLevel {
  const parsed = z.array(Scope).safeParse(input["scopes"]);
  if (!parsed.success) return "high";
  return parsed.data.some(isWriteScope) ? "high" : "normal";
}

/** Settings keys whose change is always gated for agents (security.md, Approvals). */
const GATED_SETTINGS = /^(piiMode|pii_mode|agentApprovals|agent_approvals)$|retention/i;

/**
 * settings.update is high when it touches PII mode or retention, or lowers agentApprovals. The
 * current value is not known here, so any agentApprovals change counts as high.
 */
export function settingsUpdateRisk(input: Record<string, unknown>): RiskLevel {
  return Object.keys(input).some((k) => GATED_SETTINGS.test(k)) ? "high" : "normal";
}

const PluginId = z.string().min(1);

export const identityOperations = operationGroup(
  defineOperation("actor.get", {
    summary: "Describe the caller: org, user, token, client, effective role, scopes, allowlist and expiry.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("portfolio.get", {
    summary: "Savings and usage for each org where the user is owner or admin. Console session only.",
    input: z.strictObject({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("org.create", {
    summary: "Create an org and make the caller its owner. Console session only.",
    input: z.strictObject({ slug: z.string().min(1), name: z.string().min(1) }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("approval.list", {
    summary: "List pending approvals the caller requested or may decide.",
    input: listInput({}),
    output: listOutput(ApprovalView),
    handler: listApprovals,
  }),

  defineOperation("approval.get", {
    summary: "Read an approval request and, after execution, its result.",
    input: z.strictObject({ id: ApprovalId }),
    output: ApprovalView,
    mcp: "get_approval",
    handler: getApproval,
  }),

  defineOperation("approval.decide", {
    summary: "Approve or reject an agent's request. Console session only.",
    input: z.strictObject({ id: ApprovalId, decision: ApprovalDecision, note: z.string().optional() }),
    output: ApprovalView,
    emits: ["approval.decided"],
    handler: decideApproval,
  }),

  defineOperation("agent_token.list", {
    summary: "List agent tokens.",
    input: listInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("agent_token.create", {
    summary: "Mint an agent token for one user in one org, with scopes and a role ceiling.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
    risk: (_ctx, input) => agentTokenCreateRisk(input),
  }),

  defineOperation("agent_token.revoke", {
    summary: "Revoke an agent token. A token can always revoke itself. Never gated.",
    input: z.strictObject({ id: TokenId }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("member.list", {
    summary: "List org members.",
    input: listInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("member.invite", {
    summary: "Invite a member.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("member.role_change", {
    summary: "Change a member's role. Changing to or from owner needs the owner role.",
    input: z.strictObject({ userId: UserId, role: Role }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("member.remove", {
    summary: "Remove a member.",
    input: z.strictObject({ userId: UserId }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("key.get", {
    summary: "Read the org's TypeSafe key status, last four, fingerprint and reachable models. Never the key.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("key.rotate", {
    summary: "Save or rotate the org's TypeSafe key after validating it. Never echoes the key.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("key.revoke", {
    summary: "Revoke the org's TypeSafe key.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("settings.get", {
    summary: "Read org settings.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("settings.update", {
    summary: "Change org settings. PII, retention and lowering agentApprovals are gated for agents.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
    risk: (_ctx, input) => settingsUpdateRisk(input),
  }),

  defineOperation("price_book.get", {
    summary: "Read the org's comparator price book.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("price_book.update", {
    summary: "Replace the org's comparator price book rows.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("plugin.list", {
    summary: "List installed plugins.",
    input: listInput({}),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("plugin.get", {
    summary: "Read one plugin.",
    input: z.strictObject({ id: PluginId }),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("plugin.update", {
    summary: "Enable, disable or configure a plugin.",
    // shape: Phase 5, owner Platform / Tenancy
    input: placeholderInput({ id: PluginId }),
    // shape: Phase 5, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("org.delete", {
    summary: "Delete the org. Owner only.",
    input: z.strictObject({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),
);
