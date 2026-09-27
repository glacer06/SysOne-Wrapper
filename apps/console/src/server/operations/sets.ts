// Projects, goals, sets and drafts (management-api.md, Projects and goals; Sets and drafts).

import {
  ErrorDetail,
  GateMargins,
  GoalId,
  JsonObject,
  LabelingPolicy,
  PutDraftResult,
  QuestionSetSpec,
  StorageMode,
  ValueSettings,
} from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { SetRef, listInput, listOutput, placeholderListOutput, storageModeChangeRisk } from "./schemas";

/** One seeded template (definition-studio.md): enough for an agent to find a fromTemplate id. */
export const TemplateSummary = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pattern: z.string().min(1),
  parameters: JsonObject,
});

export const setOperations = operationGroup(
  // Projects and goals
  defineOperation("project.list", {
    summary: "List the org's projects.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_projects",
  }),

  defineOperation("project.create", {
    summary: "Create a project.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("goal.list", {
    summary: "List goals with their quality targets.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_goals",
  }),

  defineOperation("goal.create", {
    summary: "Create a goal with a quality target and business KPI.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "create_goal",
  }),

  defineOperation("goal.update", {
    summary: "Update a goal.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: GoalId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  // Sets and drafts
  defineOperation("template.list", {
    summary: "List the seeded question set templates.",
    input: listInput({}),
    output: listOutput(TemplateSummary),
    mcp: "list_templates",
  }),

  defineOperation("set.list", {
    summary: "List question sets visible to the caller.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_sets",
  }),

  defineOperation("set.create", {
    summary: "Create a question set with an empty draft, a template draft or a copy of another version.",
    input: z.strictObject({
      slug: z.string().min(1),
      name: z.string().min(1),
      goalId: GoalId,
      /** A template id from template.list. */
      fromTemplate: z.string().min(1).optional(),
      /** slug@n of another set in the org. */
      fromVersion: z.string().min(1).optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "create_set",
  }),

  defineOperation("set.get", {
    summary: "Read a set with its channel pointers, rollout stages, experiments and live interface major.",
    input: z.strictObject({ ref: SetRef }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "get_set",
  }),

  defineOperation("set.update", {
    summary:
      "Change a set's name, protection, labeling, staging dispatch, value settings, gate margins, storage mode, user-generated flag or result cache TTL.",
    // data-model.md question_sets: every setting that changes through set.update, never the spec.
    input: z.strictObject({
      ref: SetRef,
      name: z.string().min(1).optional(),
      /** Admin only. */
      protected: z.boolean().optional(),
      labeling: LabelingPolicy.optional(),
      dispatchActionsOnStaging: z.boolean().optional(),
      valueSettings: ValueSettings.optional(),
      gateMargins: GateMargins.optional(),
      /** A move to a less private mode is a PII change: high risk for agents. */
      storageMode: StorageMode.optional(),
      userGenerated: z.boolean().optional(),
      /** Null turns the result cache off. Pinned models only. */
      resultCacheTtlSeconds: z.number().int().positive().nullable().optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    risk: (_ctx, input, resource) => storageModeChangeRisk(resource.storageMode, input.storageMode),
    mcp: "update_set",
  }),

  defineOperation("set.archive", {
    summary: "Archive a set.",
    input: z.strictObject({ ref: SetRef }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    destructive: true,
  }),

  defineOperation("draft.get", {
    summary: "Read the set's draft spec. The ETag header carries its spec_hash.",
    input: z.strictObject({ ref: SetRef }),
    output: QuestionSetSpec,
    mcp: "get_draft",
  }),

  defineOperation("draft.update", {
    summary: "Replace the whole draft spec. Requires If-Match with the draft ETag.",
    input: z.strictObject({ ref: SetRef, spec: QuestionSetSpec }),
    output: PutDraftResult,
    body: { key: "spec" },
    ifMatch: "required",
    mcp: "update_draft",
  }),

  defineOperation("draft.validate", {
    summary: "Lint a spec (default: the stored draft) and return errors and warnings. Writes nothing.",
    // Any JSON object: an invalid spec is reported as lint errors, not as a 400.
    input: z.strictObject({ ref: SetRef, spec: JsonObject.optional() }),
    output: z.object({ errors: z.array(ErrorDetail), warnings: z.array(ErrorDetail) }),
    body: { key: "spec" },
    mcp: "validate_draft",
  }),
);
