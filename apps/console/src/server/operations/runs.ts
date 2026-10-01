// Runs and usage (management-api.md, Runs and usage; api.md, run surface).

import {
  Action,
  Band,
  Channel,
  IsoTimestamp,
  JsonValue,
  Manifest,
  RunDryRunResult,
  RunId,
  RunOptions,
  RunRecordSource,
  RunResult,
  RunStatus,
  SystemOneAnswer,
  SystemOneUsage,
  PointerChannel,
} from "@bandwise/core";
import { z } from "zod";

import { getRun, getUsage, listRuns } from "../manage/runs";
import { getManifest } from "../manage/sets";
import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { ModelName, SetRef, VersionNumber, listInput, listOutput } from "./schemas";
import { RunDetail, RunSummary, UsageView } from "./views";

export const runOperations = operationGroup(
  defineOperation("set.run", {
    summary: "Run a question set and return the standard RunResult envelope.",
    // api.md, Run request. setRef, source and the headers become a RunRequest in the handler.
    input: z.strictObject({
      ref: SetRef,
      /** Sessions and agent tokens only; app tokens use their bound channel. */
      channel: PointerChannel.optional(),
      state: JsonValue,
      options: RunOptions.optional(),
    }),
    output: z.union([RunResult, RunDryRunResult]),
    query: ["channel"],
    mcp: "run_set",
    // RunSink writes model.alias_moved on a new model_requested to model_resolved pair.
    emits: ["review.created", "model.alias_moved"],
  }),

  defineOperation("set.manifest", {
    summary: "Read a set's manifest: its interface without instructions, criteria or thresholds.",
    input: z.strictObject({ ref: SetRef }),
    output: Manifest,
    handler: getManifest,
  }),

  defineOperation("run.list", {
    summary: "List run summaries, without state.",
    input: listInput({
      set: SetRef.optional(),
      version: VersionNumber.optional(),
      channel: Channel.optional(),
      source: RunRecordSource.optional(),
      status: RunStatus.optional(),
      /** The run band. */
      band: Band.optional(),
      /** The overall action. */
      action: Action.optional(),
      from: IsoTimestamp.optional(),
      to: IsoTimestamp.optional(),
    }),
    output: listOutput(RunSummary),
    handler: listRuns,
  }),

  defineOperation("run.get", {
    summary: "Read one run with its stage payloads, answers and review items.",
    input: z.strictObject({ id: RunId }),
    output: RunDetail,
    handler: getRun,
  }),

  defineOperation("usage.get", {
    summary: "Read run, spend and savings totals per set over a time range (default: the last 7 days).",
    input: z.strictObject({ from: IsoTimestamp.optional(), to: IsoTimestamp.optional(), set: SetRef.optional() }),
    output: UsageView,
    handler: getUsage,
  }),

  defineOperation("browser_token.create", {
    summary: "Mint a short-lived browser token for an origin and a subset of the app token's sets.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    output: z.strictObject({ token: z.string().min(1), expiresAt: IsoTimestamp }),
  }),

  defineOperation("run.ingest", {
    summary: "Record a run made by a standalone export, so the ledger, review and calibration keep working.",
    // api.md: { setRef, version, model, answers, usage, latencyMs, stateHash, state? }. state is already redacted.
    input: z.strictObject({
      setRef: SetRef,
      version: z.number().int().positive(),
      model: ModelName,
      answers: z.record(z.string(), SystemOneAnswer),
      usage: SystemOneUsage,
      latencyMs: z.number().int().nonnegative(),
      stateHash: z.string().min(1),
      state: JsonValue.optional(),
    }),
    // shape: Phase 4b, owner Platform / Tenancy
    output: placeholderOutput(),
    emits: ["review.created"],
  }),
);
