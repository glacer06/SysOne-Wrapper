// Health, tuning and proposals, and models (management-api.md, Health, tuning and proposals;
// Models). Phase 3b rows stay stubbed until the effectiveness loop lands.

import { JobAccepted, ModelListItem, ModelProfile, SetHealth } from "@sysone/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { ModelName, SetRef, listInput, listOutput, placeholderListOutput } from "./schemas";

const ProposalId = z.uuid();

export const learningOperations = operationGroup(
  // Health, tuning and proposals
  defineOperation("health.get", {
    summary: "Read a set's health: precision, coverage, drift and review load against its target.",
    input: z.strictObject({ ref: SetRef }),
    output: SetHealth,
    mcp: "get_set_health",
  }),

  defineOperation("health.list", {
    summary: "List every set's health, worst first.",
    input: listInput({}),
    output: listOutput(SetHealth),
  }),

  defineOperation("policy.suggest", {
    summary: "Suggest thresholds from stored answers as a job. With apply it writes the draft and needs If-Match.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({ ref: SetRef }),
    output: JobAccepted,
    async: true,
    ifMatch: "conditional",
    mcp: "suggest_thresholds",
  }),

  defineOperation("proposal.list", {
    summary: "List open proposals.",
    input: listInput({}),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_proposals",
  }),

  defineOperation("proposal.accept", {
    summary: "Apply a proposal's patch to the draft. Requires If-Match. Never publishes.",
    input: z.strictObject({ id: ProposalId }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    ifMatch: "required",
    mcp: "decide_proposal",
  }),

  defineOperation("proposal.reject", {
    summary: "Reject a proposal.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({ id: ProposalId }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "decide_proposal",
  }),

  // Models
  defineOperation("model.list", {
    summary: "List the System One models this org can select, with their profiles. The org default has isDefault: true.",
    input: listInput({}),
    output: listOutput(ModelListItem),
    mcp: "list_models",
  }),

  defineOperation("model.get", {
    summary: "Read one model profile.",
    input: z.strictObject({ id: ModelName }),
    output: ModelProfile,
  }),

  defineOperation("model.upgrades", {
    summary: "List model upgrade candidates for the org's sets.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("set.try_model", {
    summary: "Eval production against the same spec on another model, as a job that opens a proposal.",
    input: z.strictObject({ ref: SetRef, model: ModelName }),
    output: JobAccepted,
    async: true,
    dryRun: true,
    mcp: "try_model",
  }),
);
