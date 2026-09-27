// FixtureLlmTransport: replays LLM fixtures and never touches the network (unit tests, CI, local
// runs). It never imports @anthropic-ai/sdk.

import { type LlmCompletion, type LlmCompletionRequest, type LlmTransport, TransportError } from "@bandwise/core";
import { llmAborted, llmErrorForStatus } from "./errors.js";
import { type LlmFixture, llmFixtureKey } from "./fixture.js";

export interface FixtureLlmTransportOptions {
  /**
   * Answers a request no fixture covers. Return undefined to fail it as usual. For local runs and
   * tests that build replies from the request; never for contract tests.
   */
  respond?: (req: LlmCompletionRequest) => LlmCompletion | undefined;
}

export interface FixtureLlmCall {
  request: LlmCompletionRequest;
  /** The fixture that answered, or null when `respond` did or nothing did. */
  fixture: string | null;
}

export class FixtureLlmTransport implements LlmTransport {
  private readonly byKey = new Map<string, LlmFixture>();
  /** Every call, in order. */
  readonly calls: FixtureLlmCall[] = [];

  constructor(
    fixtures: readonly LlmFixture[],
    private readonly options: FixtureLlmTransportOptions = {},
  ) {
    for (const f of fixtures) this.byKey.set(llmFixtureKey(f.request), f);
  }

  /** Number of fixtures loaded. */
  get size(): number {
    return this.byKey.size;
  }

  /** True when a fixture answers this request. */
  has(request: LlmCompletionRequest): boolean {
    return this.byKey.has(llmFixtureKey(request));
  }

  async complete(req: LlmCompletionRequest & { signal: AbortSignal }): Promise<LlmCompletion> {
    const { signal, ...request } = req;
    if (signal.aborted) throw llmAborted();
    const fixture = this.byKey.get(llmFixtureKey(request));
    this.calls.push({ request, fixture: fixture?.name ?? null });
    if (fixture !== undefined) {
      if ("error" in fixture) throw llmErrorForStatus(fixture.error.status, fixture.route);
      return { ...fixture.completion };
    }
    const synthetic = this.options.respond?.(request);
    if (synthetic !== undefined) return synthetic;
    throw new TransportError(
      { code: "llm_unavailable", retryable: false, requestId: null },
      `no LLM fixture for model ${request.model}`,
    );
  }
}
