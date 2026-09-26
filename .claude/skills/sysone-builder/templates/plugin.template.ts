// Template for a SysOne plugin. Copy into packages/plugins-builtin/src/<plugin-id>/index.ts
// or into an external package that depends on @sysone/plugin-sdk.
//
// Rules:
// - No network or env access at import time.
// - Config is validated with zod and stored encrypted per org.
// - Action handlers must be idempotent by `${runId}:${questionId}`.

import { z } from "zod";
import { definePlugin } from "@sysone/plugin-sdk";

const configSchema = z.object({
  webhookUrl: z.string().url(),
});

export default definePlugin({
  id: "example.urgent-webhook",
  version: "0.1.0",
  configSchema,

  // Turns raw input into Jev state. Optional.
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

  // Builds question definitions plus a suggested policy. Optional.
  questionTemplates: [
    {
      id: "example.is-urgent",
      params: z.object({ audience: z.string().default("the recipient") }),
      build: ({ audience }) => ({
        questions: {
          is_urgent: {
            type: "noul",
            instructions: `Does \`email\` need action from ${audience} within 24 hours?`,
            criteria: { true: "Needs action within a day.", false: "Can wait." },
            meta: { label: "Urgent" },
          },
        },
        policies: {
          is_urgent: {
            gating: true,
            thresholds: { high: 0.75, medium: 0.45 },
            noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
            actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
          },
        },
      }),
    },
  ],

  // Runs after a decision commits. Optional.
  actionHandlers: [
    {
      id: "example.post-webhook",
      configSchema,
      execute: async (decision, ctx) => {
        await ctx.http.post(ctx.config.webhookUrl, {
          idempotencyKey: `${ctx.runId}:${decision.questionId}`,
          body: { runId: ctx.runId, decision },
          sign: true, // HMAC with the org's webhook secret
        });
        return { status: "sent" };
      },
    },
  ],
});
