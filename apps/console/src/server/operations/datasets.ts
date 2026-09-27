// Datasets, evals and jobs (management-api.md, Datasets, evals and jobs).
// The test split never appears in any response.

import { DatasetId, Job, JobAccepted, JobId, JsonValue } from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import {
  ModelName,
  SetRef,
  VersionNumber,
  VersionSide,
  listInput,
  placeholderListOutput,
} from "./schemas";

/** One JSONL line of dataset.import. The server assigns the split from the case's state hash. */
export const DatasetCaseImport = z.strictObject({
  state: JsonValue,
  expected: JsonValue,
  tags: z.array(z.string().min(1)).optional(),
});

export const datasetOperations = operationGroup(
  defineOperation("dataset.list", {
    summary: "List datasets.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
    mcp: "list_datasets",
  }),

  defineOperation("dataset.create", {
    summary: "Create a dataset.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    mcp: "create_dataset",
  }),

  defineOperation("dataset.import", {
    summary: "Import cases as JSON Lines, one { state, expected, tags? } per line.",
    input: z.strictObject({ id: DatasetId, cases: z.array(DatasetCaseImport).min(1) }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
    body: { key: "cases", contentType: "application/x-ndjson" },
    mcp: "import_dataset_cases",
  }),

  defineOperation("dataset.cases", {
    summary: "List a dataset's drafting and calibration cases. Test-split cases are never returned.",
    input: listInput({ id: DatasetId }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("dataset.snapshot", {
    summary: "Freeze the dataset's current case ids. Returns no cases.",
    input: z.strictObject({ id: DatasetId }),
    output: z.object({
      snapshotId: z.uuid(),
      snapshotHash: z.string().min(1),
      caseCount: z.number().int().nonnegative(),
    }),
  }),

  defineOperation("dataset.export", {
    summary: "Export a dataset as a job whose result is a download link. The export is audited.",
    input: z.strictObject({ id: DatasetId }),
    output: JobAccepted,
    async: true,
  }),

  defineOperation("dataset.features", {
    summary: "Per-question probabilities, noul values and scores joined with labels, drafting and calibration splits only.",
    input: z.strictObject({ id: DatasetId, version: VersionNumber }),
    // shape: Phase 3b, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("eval.run", {
    summary: "Evaluate a set version on a dataset snapshot as a job.",
    input: z.strictObject({
      setRef: SetRef,
      version: z.union([z.number().int().positive(), z.literal("draft")]),
      datasetId: DatasetId,
      snapshotId: z.uuid().optional(),
      model: ModelName.optional(),
      repeats: z.number().int().positive().optional(),
    }),
    output: JobAccepted,
    async: true,
    mcp: "start_eval",
  }),

  defineOperation("eval.get", {
    summary: "Read an eval run. The test split returns aggregate metrics only.",
    input: z.strictObject({ id: z.uuid() }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("set.compare", {
    summary: "Compare two sides of a set on given states or a dataset, as a job.",
    input: z
      .strictObject({
        ref: SetRef,
        from: VersionSide,
        to: VersionSide,
        states: z.array(JsonValue).min(1).optional(),
        datasetId: DatasetId.optional(),
      })
      .refine((i) => (i.states === undefined) !== (i.datasetId === undefined), {
        message: "send exactly one of states or datasetId",
      }),
    output: JobAccepted,
    async: true,
  }),

  defineOperation("job.get", {
    summary: "Poll a job. Retry-After is set while it runs.",
    input: z.strictObject({ id: JobId }),
    output: Job,
    mcp: "get_job",
  }),
);
