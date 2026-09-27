// The LLM fixture file format: one recorded or hand-authored LLM exchange per file, keyed by a hash
// of the request (model, system, prompt, maxOutputTokens). The same prompt on two models is two
// fixtures.

import { LlmCompletion, LlmCompletionRequest, hashJson } from "@sysone/core";
import { z } from "zod";

export const LlmFixtureRoute = z.enum(["anthropic", "openrouter"]);

const base = {
  name: z.string().min(1),
  /** Which route the exchange was made on. The key ignores it; the model id picks the route. */
  route: LlmFixtureRoute,
  request: LlmCompletionRequest,
};

export const LlmFixture = z.union([
  z.strictObject({ ...base, completion: LlmCompletion }),
  z.strictObject({
    ...base,
    error: z.strictObject({
      status: z.number().int().min(400).max(599),
      /** The provider's error body, kept for reference. The mapping never reads it. */
      body: z.unknown().optional(),
    }),
  }),
]);
export type LlmFixture = z.infer<typeof LlmFixture>;

/** The key a fixture is stored and looked up under. */
export function llmFixtureKey(request: LlmCompletionRequest): string {
  return hashJson(LlmCompletionRequest.parse(request));
}
