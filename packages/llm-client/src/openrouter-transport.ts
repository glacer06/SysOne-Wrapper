// OpenRouterLlmTransport: the optional OpenRouter chat route of ADR-011 (proposed). OpenRouter's
// OpenAI-compatible chat endpoint over plain fetch, used only for escalate_to_llm when the
// escalation model is an OpenRouter id such as typesafe/jev-router. It is an LLM route, never a
// System One route, and its spend is LLM spend. It stays off unless the router config enables it.

import { type LlmCompletion, type LlmCompletionRequest, type LlmTransport, isTransportError } from "@bandwise/core";
import { z } from "zod";
import { llmAborted, llmErrorForStatus, llmUnreachable, llmUnreadable } from "./fixture/errors.js";

/** OpenRouter's chat completions endpoint. A constant, never env. */
export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * TypeSafe's LLM router on OpenRouter (launched 2026-09-25): picks an LLM and a reasoning effort per
 * request. An LLM, not a System One model (ADR-011 section 6).
 */
export const OPENROUTER_TYPESAFE_ROUTER_MODEL = "typesafe/jev-router";

export const OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000;
export const OPENROUTER_DEFAULT_MAX_RETRIES = 2;

export interface OpenRouterLlmTransportOptions {
  /** The org's OpenRouter key, from the key vault. Never logged. */
  apiKey: string;
  timeoutMs?: number;
  /** Retries after the first attempt on 408, 409, 429, 5xx and network errors. */
  maxRetries?: number;
  /** A fetch implementation for tests. Default: global fetch. */
  fetch?: typeof fetch;
  /** Wait between retries. Default: 250 ms times the attempt number. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

const ChatResponse = z.object({
  id: z.string().optional(),
  model: z.string().min(1),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }).optional() }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }),
});

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class OpenRouterLlmTransport implements LlmTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: OpenRouterLlmTransportOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async complete(req: LlmCompletionRequest & { signal: AbortSignal }): Promise<LlmCompletion> {
    const body = JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxOutputTokens,
    });
    const maxRetries = this.options.maxRetries ?? OPENROUTER_DEFAULT_MAX_RETRIES;
    for (let attempt = 0; ; attempt++) {
      if (req.signal.aborted) throw llmAborted();
      try {
        return await this.once(body, req.signal);
      } catch (e) {
        const retryable = isTransportError(e) && e.code === "llm_unavailable" && e.retryable;
        if (!retryable || attempt >= maxRetries) throw e;
        await this.sleep(250 * (attempt + 1));
      }
    }
  }

  private async once(body: string, signal: AbortSignal): Promise<LlmCompletion> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? OPENROUTER_DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch {
      if (signal.aborted) throw llmAborted();
      throw llmUnreachable("openrouter");
    }
    if (!res.ok) throw llmErrorForStatus(res.status, "openrouter");
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw llmUnreadable("openrouter");
    }
    const parsed = ChatResponse.safeParse(json);
    if (!parsed.success) throw llmUnreadable("openrouter");
    const { data } = parsed;
    return {
      text: data.choices[0]?.message?.content ?? "",
      model: data.model,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  }
}
