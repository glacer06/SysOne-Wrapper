// Platform admin operations (management-api.md, Platform). Session only: a superadmin console
// session with MFA. Org, app and agent tokens get 404.

import { JsonValue, OrgId } from "@bandwise/core";
import { z } from "zod";

import { defineOperation, operationGroup, placeholderInput, placeholderOutput } from "./define";
import { ModelName, Reason, ReportFormat, listInput, placeholderListOutput } from "./schemas";

export const platformOperations = operationGroup(
  defineOperation("platform_model.list", {
    summary: "List every registry row, including unreviewed models.",
    input: listInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("platform_model.create", {
    summary: "Add a model registry row.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_model.update", {
    summary: "Update a model registry row.",
    // shape: Phase 3, owner Platform / Tenancy
    input: placeholderInput({ id: ModelName }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_price_book.get", {
    summary: "Read the platform default price book.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_price_book.update", {
    summary: "Replace platform default price rows, keyed by exact versioned model id. Alias rows are rejected.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_settings.get", {
    summary: "Read platform settings.",
    input: z.strictObject({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_settings.update", {
    summary: "Change model budgets, the default comparator, the default model and alert thresholds.",
    // shape: Phase 2, owner Platform / Tenancy
    input: placeholderInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_org.list", {
    summary: "List every org.",
    input: listInput({}),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderListOutput(),
  }),

  defineOperation("platform_org.suspend", {
    summary: "Suspend or reinstate an org. Suspension blocks its runs within 30 seconds.",
    input: z.strictObject({ id: OrgId, suspended: z.boolean(), reason: Reason }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_org.set_entitlement", {
    summary: "Override one entitlement for an org.",
    input: z.strictObject({ id: OrgId, key: z.string().min(1), value: JsonValue, reason: Reason }),
    // shape: Phase 2, owner Platform / Tenancy
    output: placeholderOutput(),
  }),

  defineOperation("platform_report.get", {
    summary: "Read a report across all orgs, with an org column.",
    input: z.strictObject({ name: z.string().min(1), format: ReportFormat.optional() }),
    // shape: Phase 3, owner Platform / Tenancy
    output: placeholderOutput(),
  }),
);
