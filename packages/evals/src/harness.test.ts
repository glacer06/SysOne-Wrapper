import {
  type QuestionSetSpec,
  type SystemOneAnswer,
  type SystemOneTransport,
  TransportError,
  defaultQualityTarget,
  parseSpec,
  sequentialIds,
  steppingClock,
} from "@bandwise/core";
import { describe, expect, it } from "vitest";
import { parseDataset } from "./dataset.js";
import { highPrecisionGate, regressionGate } from "./gates.js";
import { runEval, stabilitySample, withUid } from "./harness.js";
import { createEvalPorts, evalContext, offlineTransport } from "./ports.js";
import { createMemoryEvalStore } from "./store.js";

const SPEC = {
  schemaVersion: 1,
  model: "jev-1.13.0",
  input: { schema: { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } } },
  stages: [
    {
      id: "all",
      questions: {
        team: {
          type: "choice",
          instructions: "Which team should handle `ticket`?",
          criteria: { billing: "Money.", technical: "Bugs.", none_of_these: null },
          meta: { label: "Team" },
        },
        urgent: { type: "noul", instructions: "Is `ticket` urgent?", criteria: { true: "Urgent.", false: "Not urgent." }, meta: { label: "Urgent" } },
        frustration: { type: "score", instructions: "How frustrated is `ticket`?", criteria: ["Calm", "Annoyed", "Angry"], meta: { label: "Frustration" } },
      },
    },
  ],
  policies: {
    team: {
      type: "choice",
      gating: true,
      thresholds: { high: 0.75, medium: 0.45 },
      actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
    },
    urgent: {
      type: "noul",
      gating: true,
      noul: { trueAt: 0.85, falseAt: 0.15, reviewMargin: 0.1 },
      actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
    },
    frustration: {
      type: "score",
      gating: false,
      thresholds: { high: 0.7, medium: 0.4 },
      actions: { high: { kind: "auto" }, medium: { kind: "review" }, low: { kind: "review" } },
    },
  },
} as const;

function spec(): QuestionSetSpec {
  const parsed = parseSpec(SPEC);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.details));
  return parsed.spec;
}

type Scripted = Record<string, Record<string, SystemOneAnswer>>;

const choice = (c: string, confidence: number): SystemOneAnswer => ({
  type: "choice",
  choice: c,
  confidence,
  probabilities: { billing: c === "billing" ? confidence : 0.05, technical: c === "technical" ? confidence : 0.05, none_of_these: 0.05 },
});
const score = (s: number, p: Record<string, number>, confidence: number): SystemOneAnswer => ({
  type: "score",
  score: s,
  confidence,
  legend: { "0": "Calm", "1": "Annoyed", "2": "Angry" },
  probabilities: p,
});

/** Answers by ticket text, so each case gets known answers. */
function scriptedTransport(script: Scripted, calls: string[] = []): SystemOneTransport {
  return {
    async call(req) {
      const ticket = String((req.state as { ticket?: unknown }).ticket);
      calls.push(ticket);
      const answers = script[ticket];
      if (answers === undefined) throw new TransportError({ code: "system_one_unavailable", retryable: true, requestId: null }, "down");
      return {
        response: { model: req.model, answers, usage: { input_tokens: 100, output_tokens: 3 } },
        requestId: `req_${ticket}`,
      };
    },
  };
}

const SCRIPT: Scripted = {
  c1: { team: choice("billing", 0.9), urgent: { type: "noul", noul: 0.95 }, frustration: score(2, { "0": 0.02, "1": 0.08, "2": 0.9 }, 0.8) },
  c2: { team: choice("technical", 0.9), urgent: { type: "noul", noul: 0.05 }, frustration: score(0.6, { "0": 0.45, "1": 0.5, "2": 0.05 }, 0.3) },
  c3: { team: choice("billing", 0.5), urgent: { type: "noul", noul: 0.5 }, frustration: score(1, { "0": 0.1, "1": 0.8, "2": 0.1 }, 0.75) },
};

const DATASET = parseDataset(
  "tickets",
  [
    { id: "c1", state: { ticket: "c1" }, expected: { team: "billing", urgent: true, frustration: 2 } },
    { id: "c2", state: { ticket: "c2" }, expected: { team: "billing", urgent: false, frustration: 0 } },
    { id: "c3", state: { ticket: "c3" }, expected: { team: "billing", urgent: true, frustration: 1 } },
    { id: "c4", state: { nope: 1 }, expected: { team: "billing" } },
    { id: "c5", state: { ticket: "c5" }, expected: { team: "technical" } },
  ]
    .map((c) => JSON.stringify(c))
    .join("\n"),
);

function setup(transport: SystemOneTransport = scriptedTransport(SCRIPT)) {
  const store = createMemoryEvalStore({
    versions: [{ org: "acme", set: "triage", version: 3, spec: spec() }],
    datasets: [{ org: "acme", dataset: DATASET }],
  });
  const newId = sequentialIds();
  const clock = steppingClock();
  const deps = {
    store,
    ports: createEvalPorts({ transport, keys: { typesafe: "fixture" }, clock, newId }),
    ctx: evalContext(),
    transportKind: "fixture" as const,
    now: clock,
    newId,
    concurrency: 2,
  };
  return { store, deps };
}

const REQ = { org: "acme", set: "triage", version: 3, dataset: "tickets", provider: "typesafe" as const };

describe("runEval metrics", () => {
  it("scores per question, per band, cost and latency", async () => {
    const { store, deps } = setup();
    const { metrics: m, record, snapshot } = await runEval(REQ, deps);

    expect(m.cases).toBe(5);
    expect(m.okRuns).toBe(3);
    // c4 fails the input schema before a run exists; c5's call fails.
    expect(m.errors).toEqual({ invalid_state: 1, system_one_unavailable: 1 });

    const team = m.questions["team"];
    expect(team?.type).toBe("choice");
    expect(team?.labeled).toBe(3);
    expect(team?.accuracy).toBeCloseTo(2 / 3, 9);
    expect(team?.confusion).toEqual({ labels: ["billing", "technical"], matrix: [[2, 1], [0, 0]] });
    expect(team?.bands.high).toMatchObject({ decisions: 2, labeled: 2, correct: 1, coverage: 1 });
    expect(team?.bands.medium).toMatchObject({ decisions: 1, labeled: 1, correct: 1, reviewLoad: 1 });
    // Two labels had no scored decision: the refused run and the failed run.
    expect(team?.unscored).toBe(2);

    const urgent = m.questions["urgent"];
    expect(urgent?.accuracy).toBeCloseTo(2 / 3, 9);
    // (0.95 - 1)^2, (0.05 - 0)^2, (0.5 - 1)^2
    expect(urgent?.brier).toBeCloseTo((0.0025 + 0.0025 + 0.25) / 3, 9);
    expect(urgent?.bands.low).toMatchObject({ decisions: 1, labeled: 1, correct: 0 });

    const frustration = m.questions["frustration"];
    expect(frustration?.gating).toBe(false);
    expect(frustration?.mae).toBeCloseTo((0 + 0.6 + 0) / 3, 9);
    expect(frustration?.accuracy).toBeCloseTo(2 / 3, 9);

    // Gating bands pool team and urgent only.
    expect(m.bands.high).toMatchObject({ decisions: 4, labeled: 4, correct: 3 });
    expect(m.bands.high.precision).toBe(0.75);
    expect(m.bands.high.lower95).toBeCloseTo(0.3006, 3);
    expect(m.coverage).toBeCloseTo(4 / 6, 9);
    expect(m.reviewLoad).toBeCloseTo(2 / 6, 9);
    expect(m.ece).not.toBeNull();
    expect(m.reliability).toHaveLength(10);

    // Three answered calls (the failed call has no RunCall). 100 input tokens at 42,000 micro-USD
    // per Mtok round to 4 micro-USD each.
    expect(m.cost.calls).toBe(3);
    expect(m.cost.systemOneCostMicroUsd).toBe(12);
    expect(m.cost.latencyP50Ms).not.toBeNull();
    expect(m.cost.latencyP95Ms).toBeGreaterThanOrEqual(m.cost.latencyP50Ms ?? 0);
    expect(m.stability).toBeNull();

    expect(record).toMatchObject({ model: "jev-1.13.0", modelOverride: false, snapshotId: snapshot.id, repeats: null, status: "succeeded" });
    expect(store.evalRuns).toHaveLength(1);
    expect(store.snapshots).toEqual([snapshot]);
    expect(snapshot.caseIds).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("reuses a snapshot and records --model without touching the version", async () => {
    const { store, deps } = setup();
    const first = await runEval(REQ, deps);
    const second = await runEval({ ...REQ, snapshotId: first.snapshot.id, model: "jev-latest" }, deps);
    expect(store.snapshots).toHaveLength(1);
    expect(second.record).toMatchObject({ snapshotId: first.snapshot.id, model: "jev-latest", modelOverride: true });
    expect((await store.getVersion("acme", "triage", 3))?.spec.model).toBe("jev-1.13.0");
    // The regression gate compares both on the same snapshot.
    expect(regressionGate(first.metrics, second.metrics).status).toBe("pass");
  });

  it("measures stability on a sample with a throwaway uid", async () => {
    const seen: string[] = [];
    const t = scriptedTransport(SCRIPT, seen);
    const { deps } = setup({
      async call(req, opts) {
        const s = req.state as { ticket: string; uid?: string };
        return t.call({ ...req, state: { ticket: s.ticket } }, opts);
      },
    });
    const r = await runEval({ ...REQ, repeats: 3 }, deps);
    // 10 percent of 5 cases rounds up to one case, repeated 3 times.
    expect(seen.length).toBe(4 + 3);
    expect(r.record.repeats).toBe(3);
    expect([0, 1]).toContain(r.metrics.stability);
  });

  it("rejects bad input", async () => {
    const { deps } = setup();
    await expect(runEval({ ...REQ, version: 9 }, deps)).rejects.toThrow("no version 9");
    await expect(runEval({ ...REQ, dataset: "nope" }, deps)).rejects.toThrow("no dataset nope");
    await expect(runEval({ ...REQ, snapshotId: "missing" }, deps)).rejects.toThrow("no snapshot missing");
    await expect(runEval({ ...REQ, repeats: 1 }, deps)).rejects.toThrow("--repeats");
  });

  it("runs offline on the bundled fixtures with no key", async () => {
    const { deps } = setup(offlineTransport());
    const r = await runEval(REQ, deps);
    expect(r.metrics.okRuns).toBe(4);
  });
});

describe("gates", () => {
  it("returns insufficient_data below the label minimum, then pass or fail on the lower bound", async () => {
    const { deps } = setup();
    const { metrics } = await runEval(REQ, deps);
    expect(highPrecisionGate(metrics, defaultQualityTarget("standard")).status).toBe("insufficient_data");
    const lenient = { ...defaultQualityTarget("low"), minLabeledHigh: 4, highPrecision: 0.3 };
    expect(highPrecisionGate(metrics, lenient).status).toBe("pass");
    expect(highPrecisionGate(metrics, { ...lenient, highPrecision: 0.5 }).status).toBe("fail");
  });

  it("fails the regression gate on a coverage drop or a review load rise", async () => {
    const { deps } = setup();
    const { metrics: champion } = await runEval(REQ, deps);
    expect(regressionGate(champion, { ...champion, coverage: (champion.coverage ?? 0) - 0.05 }).status).toBe("fail");
    expect(regressionGate(champion, { ...champion, reviewLoad: (champion.reviewLoad ?? 0) + 0.2 }).status).toBe("fail");
    const worse = { ...champion, bands: { ...champion.bands, high: { ...champion.bands.high, lower95: 0.1 } } };
    expect(regressionGate(champion, worse).reasons[0]).toMatch(/lower bound fell/);
  });
});

describe("helpers", () => {
  it("samples about 10 percent, at least one, deterministically", () => {
    const cases = DATASET.cases;
    expect(stabilitySample(cases)).toHaveLength(1);
    expect(stabilitySample(cases)).toEqual(stabilitySample([...cases].reverse()));
    expect(stabilitySample([])).toEqual([]);
  });

  it("adds uid only to object states", () => {
    expect(withUid({ a: 1 }, "x")).toEqual({ a: 1, uid: "x" });
    expect(withUid("text", "x")).toBeNull();
  });
});
