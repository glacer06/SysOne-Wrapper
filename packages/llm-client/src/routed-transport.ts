// RoutedLlmTransport: one LlmTransport that picks the route by model id. Anthropic by default; the
// OpenRouter chat route (ADR-011, proposed) only when the config turns it on and the model is an
// OpenRouter id (`vendor/model`, for example typesafe/jev-router). With the route off, an
// OpenRouter id fails as llm_unavailable, which core turns into review.

import { type LlmCompletion, type LlmCompletionRequest, type LlmTransport, TransportError } from "@sysone/core";
import type { LlmRoute } from "./fixture/errors.js";

/** True for an OpenRouter model id: `vendor/model`, optionally with a leading `~` for an alias. */
export function isOpenRouterModelId(model: string): boolean {
  return /^~?[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model);
}

export interface RoutedLlmTransportConfig {
  /** The default route. Every Anthropic model id goes here. */
  anthropic: LlmTransport;
  /**
   * The optional OpenRouter chat route (ADR-011, proposed). Off unless `enabled` is true, so a
   * deployment turns it on only after the ADR is accepted.
   */
  openrouter?: { enabled: boolean; transport: LlmTransport } | undefined;
}

export class RoutedLlmTransport implements LlmTransport {
  constructor(private readonly config: RoutedLlmTransportConfig) {}

  /** The route a model id takes, or null when it needs a route that is off. */
  routeFor(model: string): LlmRoute | null {
    if (!isOpenRouterModelId(model)) return "anthropic";
    return this.config.openrouter?.enabled === true ? "openrouter" : null;
  }

  async complete(req: LlmCompletionRequest & { signal: AbortSignal }): Promise<LlmCompletion> {
    const route = this.routeFor(req.model);
    if (route === "anthropic") return this.config.anthropic.complete(req);
    if (route === "openrouter" && this.config.openrouter !== undefined) return this.config.openrouter.transport.complete(req);
    throw new TransportError(
      { code: "llm_unavailable", retryable: false, requestId: null },
      `the OpenRouter LLM route is off, so ${req.model} cannot be called`,
    );
  }
}
