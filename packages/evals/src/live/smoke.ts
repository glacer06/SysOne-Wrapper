// Live smoke (testing.md, Live smoke): `pnpm smoke [--model <id>] [--provider typesafe|openrouter]`.
//
// Smoke list: jev-preview, jev-latest, the pinned versions sets use, and every registry model with
// status preview or stable. On OpenRouter, only models with a route row, sent as the route's id.
// Per model: one call per question type in the profile's questionTypes, and one two-stage run
// through the run engine. Asserts the response shape, usage.input_tokens > 0, a versioned id in the
// response `model`, and a total cost under $0.001 per model.
//
// The logic takes any SystemOneTransport, so its tests run on fixtures with no network.

import {
  type ModelProfile,
  type ModelRoute,
  type QuestionSetSpec,
  type QuestionTypeId,
  type SystemOneProvider,
  type SystemOneQuestion,
  type SystemOneRequest,
  type SystemOneTransport,
  callCostMicro,
  classifyModelName,
  createMemoryPriceBook,
  isTransportError,
  latencyBudgetMs,
  parseSpec,
  registryIdForResolved,
  reportedCostMicroUsd,
  resolveRoute,
  runQuestionSet,
  SEED_SYSTEM_ONE_PRICES,
  sequentialIds,
} from "@sysone/core";
import { createEvalPorts, evalContext } from "../ports.js";

/** Most a smoke run may spend per model (testing.md). */
export const SMOKE_COST_CAP_MICRO_USD = 1_000;

/** Names always on the smoke list, before the registry's preview and stable rows. */
export const SMOKE_ALWAYS = ["jev-preview", "jev-latest"] as const;

export interface SmokeTarget {
  model: string;
  /** The id sent to the provider, or null when the provider cannot reach the model. */
  sendAs: string | null;
}

/** The smoke list for a provider, in order, without repeats. `--model` narrows it to one. */
export function smokeList(
  provider: SystemOneProvider,
  profiles: readonly ModelProfile[],
  routes: readonly ModelRoute[],
  opts: { model?: string; pinnedInUse?: readonly string[] } = {},
): SmokeTarget[] {
  const names =
    opts.model !== undefined
      ? [opts.model]
      : [...SMOKE_ALWAYS, ...(opts.pinnedInUse ?? []), ...profiles.filter((p) => p.status === "preview" || p.status === "stable").map((p) => p.id)];
  const seen = new Set<string>();
  const out: SmokeTarget[] = [];
  for (const model of names) {
    if (seen.has(model)) continue;
    seen.add(model);
    const profile = profiles.find((p) => p.id === model);
    if (provider === "typesafe") {
      out.push({ model, sendAs: model });
      continue;
    }
    const route = profile === undefined ? null : resolveRoute(profile, provider, routes);
    out.push({ model, sendAs: route?.providerModelId ?? null });
  }
  return out;
}

export interface SmokeCheck {
  model: string;
  check: string;
  ok: boolean;
  /** True when the model was not run, for example no route on this provider. Not a failure. */
  skipped?: boolean;
  detail: string;
}

const STATE = {
  ticket: "I was charged twice for my plan this month and I want one of the charges refunded today.",
};

/** One small question per type. */
export function smokeRequest(type: QuestionTypeId, model: string): SystemOneRequest {
  const question: SystemOneQuestion =
    type === "noul"
      ? { type, instructions: "Does `ticket` ask for money back?", criteria: { true: "It asks for a refund.", false: "It does not." } }
      : type === "choice"
        ? {
            type,
            instructions: "Which team should handle `ticket`?",
            criteria: { billing: "Charges and refunds.", technical: "Bugs and outages.", none_of_these: null },
          }
        : { type, instructions: "How upset is the writer of `ticket`?", criteria: ["Calm", "Annoyed", "Angry"] };
  return { state: STATE, model, questions: { [`smoke_${type}`]: question } };
}

/** The two-stage spec the smoke run uses (the same shape as fixtures/specs/two-stage.json). */
export function smokeSpec(model: string): QuestionSetSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    model,
    input: { schema: { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } } },
    stages: [
      {
        id: "classify",
        questions: {
          team: {
            type: "choice",
            instructions: "Which support team should handle the customer message in `ticket`?",
            criteria: { billing: "Charges, invoices, refunds and payment methods.", technical: "Bugs, errors, outages and broken features.", none_of_these: null },
            meta: { label: "Team" },
          },
        },
      },
      {
        id: "detail",
        stateFrom: { merge: { input: true, answers: ["team"] } },
        questions: {
          refund: {
            type: "noul",
            instructions: "Given that the team is `answers.team.value`, does the customer in `ticket` ask for money back?",
            criteria: { true: "The customer asks for a refund or a credit.", false: "The customer asks for something else." },
            meta: { label: "Refund requested" },
          },
        },
      },
    ],
    policies: {
      team: { type: "choice", gating: true, thresholds: { high: 0.75, medium: 0.45 }, actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } } },
      refund: {
        type: "noul",
        gating: true,
        noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
        actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
      },
    },
  });
  if (!parsed.ok) throw new Error(`smoke spec does not validate: ${JSON.stringify(parsed.details)}`);
  return parsed.spec;
}

export interface SmokeDeps {
  provider: SystemOneProvider;
  apiKey: string;
  transport: SystemOneTransport;
  profiles: readonly ModelProfile[];
  routes: readonly ModelRoute[];
  clock?: () => number;
}

/** Whether a response `model` names a versioned registry row (through the route rows off TypeSafe). */
export function versionedResolved(provider: SystemOneProvider, responseModel: string, profiles: readonly ModelProfile[], routes: readonly ModelRoute[]): string | null {
  const id = registryIdForResolved(provider, responseModel, routes);
  if (id === null) return null;
  return classifyModelName(id, profiles) === "pinned" ? id : null;
}

/** Run the smoke checks for one target. Never throws for a provider failure; it becomes a check. */
export async function smokeModel(target: SmokeTarget, deps: SmokeDeps): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const add = (check: string, ok: boolean, detail: string): void => {
    checks.push({ model: target.model, check, ok, detail });
  };
  if (target.sendAs === null) {
    checks.push({ model: target.model, check: "route", ok: true, skipped: true, detail: `skipped: no ${deps.provider} route row for ${target.model}` });
    return checks;
  }
  const own = deps.profiles.find((p) => p.id === target.model);
  const profile = own?.kind === "alias" && own.aliasTarget !== null ? (deps.profiles.find((p) => p.id === own.aliasTarget) ?? own) : own;
  const types: QuestionTypeId[] = profile !== undefined && profile.questionTypes.length > 0 ? profile.questionTypes : ["noul", "choice", "score"];
  const prices = createMemoryPriceBook(SEED_SYSTEM_ONE_PRICES);
  let spent = 0;
  let unpriced = false;

  for (const type of types) {
    const req = smokeRequest(type, target.sendAs);
    try {
      const { response } = await deps.transport.call(req, {
        provider: deps.provider,
        apiKey: deps.apiKey,
        signal: AbortSignal.timeout(30_000),
        timeoutMs: 30_000,
        retry: { maxRetries: 2, maxRetryAfterMs: 10_000 },
      });
      const answer = response.answers[`smoke_${type}`];
      add(`${type}.shape`, answer?.type === type, answer === undefined ? "no answer" : `answer type ${answer.type}`);
      add(`${type}.input_tokens`, response.usage.input_tokens > 0, `input_tokens ${response.usage.input_tokens}`);
      const pinned = versionedResolved(deps.provider, response.model, deps.profiles, deps.routes);
      add(`${type}.versioned_model`, pinned !== null, pinned === null ? `response model ${response.model} is not a versioned registry id` : `answered by ${response.model} (${pinned})`);
      const price = pinned === null ? null : await prices.get(evalContext().orgId, pinned, deps.provider);
      const cost = callCostMicro(
        { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, reportedMicro: reportedCostMicroUsd(response.usage) },
        price,
      );
      if (cost === null) unpriced = true;
      else spent += cost;
    } catch (e) {
      add(`${type}.call`, false, isTransportError(e) ? `${e.code}: ${e.message}` : String(e));
    }
  }

  // Two stages through the run engine: stage 2 reads stage 1's answer.
  const newId = sequentialIds();
  const clock = deps.clock ?? Date.now;
  const ports = createEvalPorts({
    transport: deps.transport,
    keys: { [deps.provider]: deps.apiKey },
    clock,
    newId,
    profiles: deps.profiles,
    routes: deps.routes,
  });
  try {
    const result = await runQuestionSet(
      evalContext(),
      { setRef: "smoke", state: STATE, source: "eval", options: {} },
      {
        spec: smokeSpec(target.model),
        setId: "00000000-0000-7000-8000-00000000005e",
        version: 1,
        versionId: "00000000-0000-7000-8000-00000000005f",
        interfaceMajor: 1,
        interfaceHash: "smoke",
        channel: "staging",
        rollout: "shadow",
        settings: {
          dispatchActionsOnStaging: false,
          storageMode: "full",
          piiMode: "off",
          defaultComparatorModel: "claude-haiku-4-5",
          avgEscalationCostMicroUsd: null,
          systemOneProvider: deps.provider,
        },
      },
      ports,
      { signal: AbortSignal.timeout(60_000), budgetMs: latencyBudgetMs("eval") },
    );
    const calls = result.stages.flatMap((s) => s.calls);
    add("two_stage.run", result.status === "ok" && result.stages.every((s) => s.calls.length > 0), `status ${result.status}, calls per stage ${result.stages.map((s) => s.calls.length).join("+")}`);
    if (result.cost.systemOneCostUsd === null) unpriced = true;
    else spent += Math.round(result.cost.systemOneCostUsd * 1e6);
    add("two_stage.input_tokens", calls.every((c) => c.inputTokens > 0), `input tokens ${calls.map((c) => c.inputTokens).join("+")}`);
  } catch (e) {
    add("two_stage.run", false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  add(
    "cost",
    !unpriced && spent < SMOKE_COST_CAP_MICRO_USD,
    unpriced ? "a call had no provider cost and no price row" : `$${(spent / 1e6).toFixed(6)} (cap $${(SMOKE_COST_CAP_MICRO_USD / 1e6).toFixed(3)})`,
  );
  return checks;
}

/** Run the smoke list. Returns every check; the caller exits non-zero when any failed. */
export async function runSmoke(targets: readonly SmokeTarget[], deps: SmokeDeps): Promise<SmokeCheck[]> {
  const out: SmokeCheck[] = [];
  for (const t of targets) out.push(...(await smokeModel(t, deps)));
  return out;
}
