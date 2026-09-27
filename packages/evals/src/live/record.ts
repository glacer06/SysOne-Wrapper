// `pnpm fixtures:record [--model <id>] [--provider typesafe|openrouter|vercel]` (testing.md, Fixtures).
//
// Re-sends the request of every committed success fixture for the provider and writes the live
// answer back in the same file. Error fixtures (401, 402, 422, 429, 529) stay hand-authored: a live
// key cannot produce them on demand. With --model, the same requests go to that model (through its
// route row off TypeSafe) and land in fixtures/<provider>/<model>/, so the same questions on two
// models are two fixtures. Request and generation ids are scrubbed, and each fixture records
// TypeSafe's live openapi.json info.version.

import { join } from "node:path";
import { type ModelProfile, type ModelRoute, type SystemOneProvider, type SystemOneRequest, type SystemOneTransport, isTransportError, resolveRoute } from "@bandwise/core";
import { Fixture, evaluationFallbackReason } from "@bandwise/system-one-client/fixture";

export interface RecordTarget {
  name: string;
  /** Path relative to the fixtures folder. */
  path: string;
  request: SystemOneRequest;
}

export class RecordPlanError extends Error {
  override readonly name = "RecordPlanError";
}

/** Which requests to send and where each answer goes. */
export function planRecording(
  fixtures: readonly Fixture[],
  provider: SystemOneProvider,
  profiles: readonly ModelProfile[],
  routes: readonly ModelRoute[],
  model?: string,
): RecordTarget[] {
  // A fixture the client must reject (an evaluation fallback, ADR-013) cannot be re-recorded: the
  // live answer to its request is a normal one. It stays as committed.
  const sources = fixtures.filter(
    (f) => f.provider === provider && "response" in f && evaluationFallbackReason(f.response, f.responseHeaders) === null,
  );
  if (model === undefined) {
    return sources.map((f) => ({ name: f.name, path: join(provider, `${f.name}.json`), request: f.request }));
  }
  let sendAs = model;
  if (provider !== "typesafe") {
    const profile = profiles.find((p) => p.id === model);
    const route = profile === undefined ? null : resolveRoute(profile, provider, routes);
    if (route === null) throw new RecordPlanError(`${model} has no ${provider} route row; add one before recording (system-one-models.md section 12)`);
    sendAs = route.providerModelId;
  }
  // Alias fixtures exist to show an alias answered by a build; they are recorded only without --model.
  return sources
    .filter((f) => !f.name.startsWith("alias-"))
    .map((f) => ({ name: f.name, path: join(provider, model, `${f.name}.json`), request: { ...f.request, model: sendAs } }));
}

/** Remove request and generation ids so fixtures carry no live identifiers. */
export function scrubFixture(f: Fixture): Fixture {
  if (!("response" in f)) return f;
  const response = { ...f.response };
  if (response.id !== undefined) response.id = `gen-dec-fx-${f.name}`;
  return { ...f, ...(f.requestId !== undefined ? { requestId: `req_fx_${f.name.replace(/[^a-z0-9]+/gi, "_")}` } : {}), response };
}

export interface RecordDeps {
  provider: SystemOneProvider;
  apiKey: string;
  transport: SystemOneTransport;
  openapiVersion: string;
  write: (path: string, fixture: Fixture) => void;
}

export interface RecordOutcome {
  written: string[];
  failed: Array<{ name: string; reason: string }>;
}

export async function recordFixtures(targets: readonly RecordTarget[], deps: RecordDeps): Promise<RecordOutcome> {
  const out: RecordOutcome = { written: [], failed: [] };
  for (const t of targets) {
    try {
      const { response, requestId } = await deps.transport.call(t.request, {
        provider: deps.provider,
        apiKey: deps.apiKey,
        signal: AbortSignal.timeout(30_000),
        timeoutMs: 30_000,
        retry: { maxRetries: 2, maxRetryAfterMs: 10_000 },
      });
      const fixture = scrubFixture(
        Fixture.parse({
          name: t.name,
          provider: deps.provider,
          openapiVersion: deps.openapiVersion,
          source: "recorded",
          request: t.request,
          ...(requestId !== null ? { requestId } : {}),
          response,
        }),
      );
      deps.write(t.path, fixture);
      out.written.push(t.path);
    } catch (e) {
      out.failed.push({ name: t.name, reason: isTransportError(e) ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
