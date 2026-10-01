// Renders the runs, run, savings and review pages to HTML with consoleOperation mocked, to check
// what Nick and PJ see: stages next to sets, empty states, errors, and no state when none is kept.

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { status: "ok"; output: unknown } | { status: "error"; code: string; message: string } | { status: "not-built" };
let answers: Record<string, Answer> = {};
const inputs: Record<string, unknown> = {};

vi.mock("~/server/console-operation", () => ({
  consoleOperation: vi.fn(async (id: string, input: unknown) => {
    inputs[id] = input;
    return answers[id] ?? { status: "error", code: "not_found", message: `no fixture for ${id}` };
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const SET = "0199a1b2-0000-7000-8000-00000000000a";
const RUN = "0199a1b2-0000-7000-8000-00000000000b";
const ITEM = "0199a1b2-0000-7000-8000-00000000000c";
const NOW = new Date().toISOString();

const setList: Answer = {
  status: "ok",
  output: { data: [{ id: SET, slug: "done-check", name: "Done check", channels: [{ channel: "production", stage: "shadow" }] }], nextCursor: null },
};

const summary = {
  id: RUN,
  setId: SET,
  versionId: SET,
  channel: "production",
  rollout: "shadow",
  source: "cli",
  status: "ok",
  runBand: "medium",
  overallAction: "review",
  route: null,
  modelRequested: "jev-1.13.0",
  modelResolved: "jev-1.13.0",
  latencyMs: 420,
  inputTokens: 900,
  outputTokens: 4,
  systemOneCostMicroUsd: 42,
  counterfactualMicroUsd: 3100,
  savingsMicroUsd: 3058,
  errorCode: null,
  createdAt: NOW,
};

const detail = {
  ...summary,
  stages: [{ id: "main", skipped: false, calls: [{ modelResolved: "jev-1.13.0", typesafeRequestId: null, inputTokens: 900, outputTokens: 4, latencyMs: 400 }] }],
  checks: {},
  answers: { is_done: { type: "noul", noul: 0.62 } },
  decisions: { is_done: { kind: "question", value: true, band: "medium", relevant: true, action: "review", effectiveAction: "auto", executed: false } },
  warnings: ["model is an alias"],
  state: null,
  reviewItems: [{ id: ITEM, decisionId: "is_done", kind: "action", reason: "action", band: "medium", status: "open", resolution: null, resolvedAt: null }],
};

async function html(page: Promise<ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page);
}

const sp = (v: Record<string, string> = {}) => Promise.resolve(v);

beforeEach(() => {
  answers = { "set.list": setList };
});

describe("runs", () => {
  it("lists runs with the set's current stage and the stage at run, and passes filters through", async () => {
    answers["run.list"] = { status: "ok", output: { data: [summary], nextCursor: RUN } };
    const { default: RunsPage } = await import("./runs/page");
    const out = await html(RunsPage({ searchParams: sp({ band: "medium", range: "24h" }) }));
    expect(out).toContain("done-check");
    expect(out).toContain("Shadow");
    expect(out).toContain("$0.000042");
    expect(out).toContain("Older runs");
    expect(inputs["run.list"]).toMatchObject({ band: "medium", limit: "50" });
  });

  it("explains an empty list, and shows an operation error", async () => {
    answers["run.list"] = { status: "ok", output: { data: [], nextCursor: null } };
    const { default: RunsPage } = await import("./runs/page");
    expect(await html(RunsPage({ searchParams: sp() }))).toContain("No runs in this time range");
    expect(await html(RunsPage({ searchParams: sp({ status: "error" }) }))).toContain("No runs match these filters");
    answers["run.list"] = { status: "error", code: "not_found", message: "No set nope is visible to this caller." };
    expect(await html(RunsPage({ searchParams: sp({ set: "nope" }) }))).toContain("No set nope is visible to this caller.");
  });

  it("draws the run on the lines of the version it used, read through version.get", async () => {
    answers["run.get"] = { status: "ok", output: detail };
    answers["version.list"] = { status: "ok", output: { data: [{ id: SET, version: 3 }], nextCursor: null } };
    answers["version.get"] = { status: "ok", output: { id: SET, version: 3, spec: { policies: { is_done: { type: "noul", gating: true, noul: { trueAt: 0.7, falseAt: 0.3, reviewMargin: 0.1 }, actions: {} } } } } };
    const { default: RunPage } = await import("./runs/[id]/page");
    const out = await html(RunPage({ params: Promise.resolve({ id: RUN }) }));
    expect(inputs["version.get"]).toMatchObject({ ref: "done-check", n: 3 });
    expect(out).toContain("done-check v3");
    expect(out).toContain("0.60");
    expect(out).toContain("0.70");
    expect(out).toContain("sets the run band");
    expect(out).toContain("Run band, set by is_done");
  });

  it("says when the ruler cannot be drawn instead of guessing a line", async () => {
    answers["run.get"] = { status: "ok", output: detail };
    const { default: RunPage } = await import("./runs/[id]/page");
    const out = await html(RunPage({ params: Promise.resolve({ id: RUN }) }));
    expect(out).toContain("it could not be read");
  });

  it("shows a run's decisions, cost, warnings and review items, and says when state was not kept", async () => {
    answers["run.get"] = { status: "ok", output: detail };
    const { default: RunPage } = await import("./runs/[id]/page");
    const out = await html(RunPage({ params: Promise.resolve({ id: RUN }) }));
    expect(out).toContain("is_done");
    expect(out).toContain("P(yes) 0.62");
    expect(out).toContain("held back by the stage");
    expect(out).toContain("model is an alias");
    expect(out).toContain("Not stored.");
    expect(out).toContain(`/review/${ITEM}?run=${RUN}`);
  });
});

describe("savings", () => {
  it("shows totals, a bar per day and the per set table", async () => {
    const totals = { runs: 3, bandHigh: 1, bandMedium: 2, bandLow: 0, errors: 0, inputTokens: 10, outputTokens: 1, systemOneCostMicroUsd: 120, counterfactualMicroUsd: 9000, savingsMicroUsd: 8880, llmCallsAvoided: 3 };
    const today = NOW.slice(0, 10);
    answers["usage.get"] = {
      status: "ok",
      output: {
        from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        to: NOW,
        totals,
        sets: [{ ...totals, setId: SET, slug: "done-check" }],
        days: [{ day: today, runs: 3, errors: 0, systemOneCostMicroUsd: 120, counterfactualMicroUsd: 9000, savingsMicroUsd: 8880, llmCallsAvoided: 3 }],
      },
    };
    const { default: SavingsPage } = await import("./savings/page");
    const out = await html(SavingsPage({ searchParams: sp() }));
    expect(out).toContain("$0.0089");
    expect(out).toContain(`${today}: spent $0.00012, LLM estimate $0.009`);
    expect(out).toContain("Saved, last 7 days · estimated");
    expect(out).toContain("The same calls on the LLM would have cost about $0.009.");
    expect(out).toContain("How this is computed");
    expect(out).toContain("Shadow");
    expect((out.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("explains an empty range", async () => {
    const zero = { runs: 0, bandHigh: 0, bandMedium: 0, bandLow: 0, errors: 0, inputTokens: 0, outputTokens: 0, systemOneCostMicroUsd: 0, counterfactualMicroUsd: 0, savingsMicroUsd: 0, llmCallsAvoided: 0 };
    answers["usage.get"] = { status: "ok", output: { from: NOW, to: NOW, totals: zero, sets: [], days: [] } };
    const { default: SavingsPage } = await import("./savings/page");
    expect(await html(SavingsPage({ searchParams: sp() }))).toContain("Nothing to count in this range");
  });
});

describe("review", () => {
  it("lists open items and links each to its run", async () => {
    answers["review.list"] = {
      status: "ok",
      output: {
        data: [{ id: ITEM, runId: RUN, setId: SET, decisionId: "is_done", kind: "action", reason: "action", sampleRate: null, band: "low", suggested: { value: false }, status: "open", assigneeId: null, resolution: null, resolvedBy: { userId: null, tokenId: null }, resolvedAt: null, addToDataset: false, createdAt: NOW }],
        nextCursor: null,
      },
    };
    const { default: ReviewPage } = await import("./review/page");
    answers["run.get"] = { status: "ok", output: detail };
    const out = await html(ReviewPage({ searchParams: sp({ done: "resolved" }) }));
    expect(out).toContain(`/runs/${RUN}`);
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain("P(yes) 0.62");
    expect(out).toContain("The policy sent this band to review");
    expect(out).toContain("Saved. The answer is now a labeled decision");
    expect(inputs["review.list"]).toMatchObject({ status: "open" });
  });

  it("shows the decision to judge for an open item", async () => {
    answers["run.get"] = { status: "ok", output: detail };
    const { default: ReviewItemPage } = await import("./review/[id]/page");
    const out = await html(ReviewItemPage({ params: Promise.resolve({ id: ITEM }), searchParams: sp({ run: RUN }) }));
    expect(out).toContain("Review: is_done");
    expect(out).toContain("Agree: Yes");
    expect(out).toContain("P(yes) 0.62");
  });
});
