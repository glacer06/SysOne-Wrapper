// @bandwise/llm-client: LlmTransport implementations. The only importer of @anthropic-ai/sdk.
// Anthropic is the default route; the OpenRouter chat route (ADR-011, proposed) is off unless the
// config turns it on. The fixture transport also ships alone as @bandwise/llm-client/fixture, which
// never loads the SDK.

import type { LlmTransport } from "@bandwise/core";
import { AnthropicLlmTransport, type AnthropicLlmTransportOptions } from "./anthropic-transport.js";
import { OpenRouterLlmTransport, type OpenRouterLlmTransportOptions } from "./openrouter-transport.js";
import { RoutedLlmTransport } from "./routed-transport.js";

export {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_DEFAULT_MAX_RETRIES,
  ANTHROPIC_DEFAULT_TIMEOUT_MS,
  ANTHROPIC_SDK_LOG_LEVEL,
  AnthropicLlmTransport,
  type AnthropicLlmTransportOptions,
  createAnthropicClient,
  mapAnthropicError,
} from "./anthropic-transport.js";
export {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OPENROUTER_DEFAULT_MAX_RETRIES,
  OPENROUTER_DEFAULT_TIMEOUT_MS,
  OPENROUTER_TYPESAFE_ROUTER_MODEL,
  OpenRouterLlmTransport,
  type OpenRouterLlmTransportOptions,
} from "./openrouter-transport.js";
export { RoutedLlmTransport, type RoutedLlmTransportConfig, isOpenRouterModelId } from "./routed-transport.js";
export * from "./fixture/index.js";

export interface LlmTransportConfig {
  anthropic: AnthropicLlmTransportOptions;
  /** ADR-011 (proposed): leave out, or set enabled false, until the ADR is accepted. */
  openrouter?: (OpenRouterLlmTransportOptions & { enabled: boolean }) | undefined;
}

/** The server's LlmTransport: Anthropic, plus the OpenRouter chat route when it is enabled. */
export function createLlmTransport(config: LlmTransportConfig): LlmTransport {
  const anthropic = new AnthropicLlmTransport(config.anthropic);
  const or = config.openrouter;
  return new RoutedLlmTransport({
    anthropic,
    openrouter: or === undefined ? undefined : { enabled: or.enabled, transport: new OpenRouterLlmTransport(or) },
  });
}
