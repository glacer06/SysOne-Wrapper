// AnthropicLlmTransport: LlmTransport over @anthropic-ai/sdk, the default LLM route. This package is
// the only importer of the SDK (architecture.md, Packages and boundaries).
//
// Every client is built with an explicit apiKey, baseURL, logLevel and no auth token, so
// ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_LOG and on-disk profiles can never steer
// platform traffic or log its bodies. Retries belong to the SDK; there is no second loop.

import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import { type LlmCompletion, type LlmCompletionRequest, type LlmTransport, TransportError, isTransportError } from "@bandwise/core";
import { llmAborted, llmErrorForStatus, llmUnreachable, llmUnreadable } from "./fixture/errors.js";

/** The Anthropic API host. A constant, never env. */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

/** The log level every client gets. `debug` would log prompts, which carry redacted run state. */
export const ANTHROPIC_SDK_LOG_LEVEL = "warn" as const;

/** Per-call defaults. Escalations run inside the run's latency budget, so both stay small. */
export const ANTHROPIC_DEFAULT_TIMEOUT_MS = 30_000;
export const ANTHROPIC_DEFAULT_MAX_RETRIES = 2;

type SdkFetch = NonNullable<ConstructorParameters<typeof Anthropic>[0]>["fetch"];

export interface AnthropicLlmTransportOptions {
  /** The platform Anthropic key (ANTHROPIC_API_KEY), read by the console, never by this package. */
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** A fetch implementation for tests. Default: global fetch. */
  fetch?: SdkFetch;
}

/** Build the SDK client with every safety option explicit. */
export function createAnthropicClient(options: AnthropicLlmTransportOptions): Anthropic {
  return new Anthropic({
    apiKey: options.apiKey,
    authToken: null,
    baseURL: ANTHROPIC_BASE_URL,
    timeout: options.timeoutMs ?? ANTHROPIC_DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? ANTHROPIC_DEFAULT_MAX_RETRIES,
    logLevel: ANTHROPIC_SDK_LOG_LEVEL,
    dangerouslyAllowBrowser: false,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

/** Map any error from the SDK to a scrubbed TransportError with an llm_* code or client_aborted. */
export function mapAnthropicError(e: unknown): TransportError {
  if (isTransportError(e)) return e;
  if (e instanceof APIUserAbortError) return llmAborted();
  // Includes APIConnectionTimeoutError. The SDK already retried.
  if (e instanceof APIConnectionError) return llmUnreachable("anthropic");
  if (e instanceof APIError && e.status !== undefined) return llmErrorForStatus(e.status, "anthropic", e.requestID ?? null);
  return new TransportError({ code: "llm_unavailable", retryable: false, requestId: null }, "LLM call to anthropic failed");
}

/**
 * One Messages API call per completion: the request's system prompt, one user turn with the prompt,
 * and max_tokens from maxOutputTokens. The reply is the text blocks joined. A refusal or an empty
 * reply comes back as text; core decides whether it is one value of the question's type.
 * `thinking` and `effort` are left to the model's defaults.
 */
export class AnthropicLlmTransport implements LlmTransport {
  private readonly client: Anthropic;

  constructor(options: AnthropicLlmTransportOptions) {
    this.client = createAnthropicClient(options);
  }

  async complete(req: LlmCompletionRequest & { signal: AbortSignal }): Promise<LlmCompletion> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
        },
        { signal: req.signal },
      );
    } catch (e) {
      throw mapAnthropicError(e);
    }
    const usage = message.usage as Partial<Anthropic.Usage> | undefined;
    if (typeof message.model !== "string" || message.model.length === 0 || !Array.isArray(message.content) || usage === undefined) {
      throw llmUnreadable("anthropic");
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      model: message.model,
      inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
    };
  }
}
