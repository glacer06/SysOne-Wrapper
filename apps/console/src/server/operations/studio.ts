// Definition Studio (management-api.md, Definition Studio; definition-studio.md).

import { GoalId, JobAccepted, SetId } from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { SetRef, listInput, placeholderListOutput } from "./schemas";

const StudioSessionId = z.uuid();

export const studioOperations = operationGroup(
  defineOperation("studio.list", {
    summary: "List Studio sessions.",
    input: listInput({
      goalId: GoalId.optional(),
      setId: SetId.optional(),
      status: z.string().min(1).optional(),
    }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("studio.create", {
    summary: "Start a Studio session.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("studio.get", {
    summary: "Read a Studio session with its drafting and calibration examples, never the test split.",
    input: z.strictObject({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("studio.add_examples", {
    summary: "Add labeled examples with reasons as JSON Lines. The server assigns splits.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("studio.draft_definition", {
    summary: "Draft a definition from the drafting split.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("studio.decompose", {
    summary: "Split a definition into questions from the drafting split.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("studio.calibrate", {
    summary: "Calibrate on the calibration split as a job. Per-case results burn those cases.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    output: JobAccepted,
    async: true,
  }),

  defineOperation("studio.request_labels", {
    summary: "Create label review items for people to answer.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    emits: ["review.created"],
  }),

  defineOperation("studio.promote", {
    summary: "Check the test split and, on a pass, write the set's draft or create the set.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: StudioSessionId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    ifMatch: "conditional",
  }),

  defineOperation("set.improve", {
    summary: "Propose a draft diff with metric deltas as a job. Never publishes.",
    // shape: Phase 3b, owner Platform / Tenancy
    input: placeholderInput({ ref: SetRef }),
    output: JobAccepted,
    async: true,
    mcp: "improve_set",
  }),
);
