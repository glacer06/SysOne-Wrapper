// Apps and integration (management-api.md, Apps and integration; deploy-and-codegen.md).

import {
  AppId,
  AppLanguage,
  AppTokenPrefix,
  DeployTarget,
  IsoTimestamp,
  Opportunity,
  OpportunityRecord,
  PointerChannel,
  Scope,
  SetId,
  TokenId,
} from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import {
  SetRef,
  VersionNumber,
  isWriteScope,
  listInput,
  listOutput,
  placeholderListOutput,
} from "./schemas";

export const appOperations = operationGroup(
  defineOperation("app.list", {
    summary: "List the org's apps.",
    input: listInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("app.create", {
    summary: "Register an app.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "create_app",
  }),

  defineOperation("app.update", {
    summary: "Update an app.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({ id: AppId }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("app_token.create", {
    summary: "Mint an app token for one channel. The secret is shown once.",
    input: z.strictObject({
      id: AppId,
      prefix: AppTokenPrefix,
      channel: PointerChannel,
      scopes: z.array(Scope).min(1),
      setIds: z.array(SetId).optional(),
      /** pk_live_ only. */
      origins: z.array(z.string().min(1)).optional(),
      rpmLimit: z.number().int().positive().optional(),
      expiresAt: IsoTimestamp.optional(),
    }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
    // A write scope needs an approval, except feedback:write on an sk_test_ token bound to staging.
    risk: (_ctx, input) => {
      const testStaging = input.prefix === "sk_test_" && input.channel === "staging";
      const gated = input.scopes.filter(
        (s) => isWriteScope(s) && !(testStaging && s === "feedback:write"),
      );
      return gated.length > 0 ? "high" : "normal";
    },
  }),

  defineOperation("app_token.revoke", {
    summary: "Revoke an app token. Never gated.",
    input: z.strictObject({ id: AppId, tokenId: TokenId }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("opportunity.list", {
    summary: "List an app's opportunities.",
    input: listInput({ id: AppId }),
    output: listOutput(OpportunityRecord),
  }),

  defineOperation("opportunity.create", {
    summary: "Record a proposed decision point in an app. Never source code.",
    input: z.strictObject({ id: AppId, opportunity: Opportunity }),
    output: OpportunityRecord,
    body: { key: "opportunity" },
    mcp: "add_opportunity",
  }),

  defineOperation("opportunity.update", {
    summary: "Update an opportunity's status or linked set.",
    // shape: Phase 4b, owner Platform / Tenancy
    input: placeholderInput({ id: AppId, oid: z.uuid() }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "update_opportunity",
  }),

  defineOperation("binding.list", {
    summary: "List an app's set bindings.",
    input: listInput({ id: AppId }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("binding.create", {
    summary: "Record that an app uses a set on a channel through a deploy target.",
    // shape: Phase 4b, owner Platform / Tenancy
    input: placeholderInput({ id: AppId }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderOutput(),
    emits: ["binding.created"],
  }),

  defineOperation("binding.remove", {
    summary: "Remove an app binding.",
    input: z.strictObject({ id: AppId, bid: z.uuid() }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("set.codegen", {
    summary: "Generate a typed client for a set. With appId it also records a binding.",
    input: z.strictObject({
      ref: SetRef,
      lang: AppLanguage.exclude(["other"]),
      channel: PointerChannel.optional(),
      version: VersionNumber.optional(),
      appId: AppId.optional(),
      /** Default managed_typed. standalone stays behind ADR-009. */
      target: DeployTarget.exclude(["managed"]).optional(),
    }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "generate_client",
    emits: ["binding.created"],
  }),
);
