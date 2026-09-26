// Template for a SysOne plugin. Copy into packages/plugins-builtin/src/<plugin-id>/index.ts
// or into an external package that depends on @sysone/plugin-sdk.
//
// Rules:
// - No network or env access at import time.
// - Config is validated with zod and stored encrypted per org.
// - Action handlers must be idempotent by `${runId}:${decisionId}`.
// - Handler ids are globally namespaced (`<namespace>.<name>`, for example `example.post-webhook`)
//   and must be unique. The plugin registry rejects a duplicate id at load.
// - Action handlers do not dispatch for staging runs unless the set sets dispatchActionsOnStaging.

import { z } from "zod";
import { definePlugin, type ActionContext, type Decision, type QuestionSetSpec } from "@sysone/plugin-sdk";

const configSchema = z.object({
  webhookUrl: z.string().url(),
});

export default definePlugin({
  id: "example.urgent-webhook",
  version: "0.1.0",
  configSchema,

  // Turns raw input into System One state. Optional.
  inputAdapters: [
    {
      id: "example.email-raw",
      configSchema: z.object({}),
      toState: (raw: unknown) => {
        const email = z.object({ from: z.string(), subject: z.string(), body: z.string() }).parse(raw);
        return { email };
      },
    },
  ],

  // Builds part of a spec: input schema, questions, policies, and optional composites and routes.
  // Optional.
  questionTemplates: [
    {
      id: "example.is-urgent",
      // fan_out | confidence_routing | composite_scoring | intent_routing | cascade | top_choice | keep_in_code
      // (see references/deploy-and-codegen.md)
      pattern: "confidence_routing",
      params: z.object({ audience: z.string().default("the recipient") }),
      // Merge into the draft: input.schema replaces the draft's schema; questions and policies are
      // added by id (questions go into the draft's first spec stage, since templates default to one
      // stage), and an id that already exists is an error, not an overwrite; composites and routes
      // are appended.
      build: ({ audience }): Partial<QuestionSetSpec> => ({
        input: {
          schema: {
            type: "object",
            required: ["email"],
            properties: {
              email: {
                type: "object",
                required: ["from", "subject", "body"],
                properties: {
                  from: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" },
                },
              },
            },
          },
        },
        stages: [
          {
            id: "main",
            questions: {
              is_urgent: {
                type: "noul",
                instructions: `Does \`email\` need action from ${audience} within 24 hours?`,
                criteria: { true: "Needs action within a day.", false: "Can wait." },
                meta: { label: "Urgent" },
              },
            },
          },
        ],
        policies: {
          is_urgent: {
            type: "noul",
            gating: true,
            noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
            actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
          },
        },
      }),
    },
  ],

  // Runs after a decision commits, only when its effectiveAction is auto. Optional.
  actionHandlers: [
    {
      id: "example.post-webhook",
      configSchema,
      // ActionContext = { orgId, runId, channel, config, http, log }
      execute: async (decision: Decision & { decisionId: string; runId: string }, ctx: ActionContext) => {
        await ctx.http.post(ctx.config.webhookUrl, {
          idempotencyKey: `${ctx.runId}:${decision.decisionId}`,
          body: { runId: ctx.runId, decision },
          sign: true, // HMAC with the org's secret from org_webhook_secrets
        });
        return { status: "sent" };
      },
    },
  ],
});
