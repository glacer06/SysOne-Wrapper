import { QuestionSetSpec, type RunResult } from "@bandwise/core";
import { describe, expect, it } from "vitest";

import {
  answerMarker,
  answerSummary,
  findingsFor,
  freeOptionKey,
  noulProblem,
  noulSegments,
  questionsChanged,
  reband,
  removeOption,
  renameOption,
  setBandAction,
  setStructuredField,
  skeletonState,
  structuredShape,
  thresholdSegments,
  thresholdsProblem,
  togglePerOption,
  updatePolicy,
  updateQuestion,
  withActionKind,
} from "./spec-edit";

const review = { kind: "review" } as const;

const SPEC = QuestionSetSpec.parse({
  schemaVersion: 1,
  model: "jev-1.13.0",
  input: { schema: { type: "object", required: ["text"], properties: { text: { type: "string" }, n: { type: "integer" }, tags: { type: "array" } } } },
  stages: [
    {
      id: "main",
      questions: {
        risky: {
          type: "noul",
          instructions: { question: "Is it risky?", command: "`text`" },
          criteria: { true: { summary: "Lasting damage.", examples: ["rm -rf", "force push"] }, false: "Safe." },
          meta: { label: "Risky" },
        },
        kind: { type: "choice", instructions: "Which kind?", criteria: { shell: "A command.", file: null }, meta: { label: "Kind" } },
      },
    },
  ],
  policies: {
    risky: { type: "noul", gating: true, noul: { trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 }, actions: { high: { kind: "auto" }, medium: review, low: review } },
    kind: {
      type: "choice",
      gating: false,
      thresholds: { high: 0.7, medium: 0.4 },
      perOption: { shell: { high: 0.9, medium: 0.6 } },
      actions: { high: { kind: "auto" }, medium: review, low: { kind: "fallback", config: { kind: "noop" } } },
    },
  },
  composites: [{ id: "blend", kind: "weighted", terms: [{ q: "kind", weight: 1, option: "shell" }, { q: "risky", weight: 1 }] }],
});

const KIND = { stage: 0, id: "kind" };

describe("question edits", () => {
  it("returns a new spec and leaves the old one alone", () => {
    const next = updateQuestion(SPEC, KIND, (q) => ({ ...q, meta: { ...q.meta, label: "Kind of tool" } }));
    expect(next.stages[0]?.questions["kind"]?.meta.label).toBe("Kind of tool");
    expect(SPEC.stages[0]?.questions["kind"]?.meta.label).toBe("Kind");
    expect(updateQuestion(SPEC, { stage: 3, id: "kind" }, (q) => q)).toBe(SPEC);
  });

  it("renames an option in the criteria, perOption and composite terms, keeping order", () => {
    const next = renameOption(SPEC, KIND, "shell", "command");
    const q = next.stages[0]?.questions["kind"];
    expect(q?.type === "choice" ? Object.keys(q.criteria) : null).toEqual(["command", "file"]);
    const p = next.policies["kind"];
    expect(p?.type === "choice" ? p.perOption : null).toEqual({ command: { high: 0.9, medium: 0.6 } });
    expect(next.composites?.[0]?.terms[0]).toEqual({ q: "kind", weight: 1, option: "command" });
  });

  it("refuses a rename onto an existing or empty key", () => {
    expect(renameOption(SPEC, KIND, "shell", "file")).toBe(SPEC);
    expect(renameOption(SPEC, KIND, "shell", "")).toBe(SPEC);
  });

  it("removes an option and its perOption bar, but never the last option", () => {
    const next = removeOption(SPEC, KIND, "shell");
    const p = next.policies["kind"];
    expect(p?.type === "choice" ? p.perOption : "gone").toBeUndefined();
    expect(removeOption(next, KIND, "file")).toBe(next);
  });

  it("finds a free option key", () => {
    expect(freeOptionKey(["shell", "file"])).toBe("option_3");
    expect(freeOptionKey(["option_2"])).toBe("option_3");
  });
});

describe("policy edits", () => {
  it("drops config when an action changes kind and keeps the handler", () => {
    expect(withActionKind({ kind: "fallback", config: { kind: "noop" } }, "review")).toEqual({ kind: "review" });
    expect(withActionKind({ kind: "auto", handler: "builtin.log" }, "review")).toEqual({ kind: "review", handler: "builtin.log" });
    const same = { kind: "fallback", config: { kind: "noop" } } as const;
    expect(withActionKind(same, "fallback")).toBe(same);
  });

  it("sets one band's action", () => {
    const p = SPEC.policies["kind"];
    if (p?.type !== "choice") throw new Error("fixture");
    expect(setBandAction(p.actions, "low", "review").low).toEqual({ kind: "review" });
  });

  it("turns a stricter option bar on from the shared thresholds and off again", () => {
    const next = updatePolicy(SPEC, "kind", (p) => togglePerOption(p, "file", true));
    const p = next.policies["kind"];
    expect(p?.type === "choice" ? p.perOption?.["file"] : null).toEqual({ high: 0.7, medium: 0.4 });
    const off = updatePolicy(updatePolicy(next, "kind", (q) => togglePerOption(q, "file", false)), "kind", (q) => togglePerOption(q, "shell", false));
    const q = off.policies["kind"];
    expect(q?.type === "choice" && !("perOption" in q)).toBe(true);
  });
});

describe("structured fields", () => {
  it("edits strings and string lists as fields, and anything deeper only as JSON", () => {
    expect(structuredShape("Safe.")).toEqual({ kind: "text", value: "Safe." });
    expect(structuredShape(undefined)).toEqual({ kind: "text", value: "" });
    expect(structuredShape({ summary: "x", examples: ["a", "b"] })).toEqual({
      kind: "fields",
      fields: [
        { key: "summary", value: "x", list: false },
        { key: "examples", value: "a\nb", list: true },
      ],
    });
    expect(structuredShape({ nested: { a: 1 } })).toEqual({ kind: "json" });
    expect(structuredShape(["a"])).toEqual({ kind: "json" });
  });

  it("writes a list field back with one item per non-empty line", () => {
    expect(setStructuredField({ examples: ["a"] }, "examples", "a\n\n b \n", true)).toEqual({ examples: ["a", " b "] });
    expect(setStructuredField("plain", "x", "y", false)).toBe("plain");
  });
});

describe("band maps", () => {
  it("draws noul bands with core's rule: high false, medium false, low, medium true, high true", () => {
    const segs = noulSegments({ trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 });
    expect(segs.map((s) => [s.band, s.value])).toEqual([
      ["high", false],
      ["medium", false],
      ["low", null],
      ["medium", true],
      ["high", true],
    ]);
    expect(segs[0]?.from).toBe(0);
    expect(segs.at(-1)?.to).toBe(1);
  });

  it("draws threshold bands low to high", () => {
    expect(thresholdSegments({ high: 0.7, medium: 0.4 }).map((s) => s.band)).toEqual(["low", "medium", "high"]);
  });

  it("explains slider settings the lints would refuse", () => {
    expect(noulProblem({ trueAt: 0.8, falseAt: 0.2, reviewMargin: 0.1 })).toBeNull();
    expect(noulProblem({ trueAt: 0.4, falseAt: 0.6, reviewMargin: 0 })).toMatch(/below the true bar/);
    expect(noulProblem({ trueAt: 0.6, falseAt: 0.4, reviewMargin: 0.1 })).toMatch(/overlap/);
    expect(noulProblem({ trueAt: 1, falseAt: 0.2, reviewMargin: 0.1 })).toMatch(/between 0 and 1/);
    expect(thresholdsProblem({ high: 0.5, medium: 0.6 })).toMatch(/medium bar/);
    expect(thresholdsProblem({ high: 0.6, medium: 0.6 })).toBeNull();
  });
});

describe("preview helpers", () => {
  const result = {
    rollout: "shadow",
    channel: "production",
    checks: {},
    answers: {
      risky: { type: "noul", noul: 0.75 },
      kind: { type: "choice", choice: "shell", probabilities: { shell: 0.8, file: 0.2 }, confidence: 0.8 },
    },
  } as unknown as RunResult;

  it("re-bands a past run's answers under edited thresholds", () => {
    const before = reband(SPEC, SPEC, result, { text: "rm -rf /" });
    expect(before?.decisions["risky"]?.band).toBe("medium");
    const looser = updatePolicy(SPEC, "risky", (p) => (p.type === "noul" ? { ...p, noul: { ...p.noul, trueAt: 0.7 } } : p));
    const after = reband(SPEC, looser, result, { text: "rm -rf /" });
    expect(after?.decisions["risky"]).toMatchObject({ band: "high", value: true, action: "auto" });
    // Shadow never acts, whatever the policy says.
    expect(after?.decisions["risky"]?.effectiveAction).not.toBe("auto");
    expect(after?.decisions["kind"]?.band).toBe("medium");
  });

  it("refuses to re-band once the questions changed", () => {
    const edited = updateQuestion(SPEC, KIND, (q) => ({ ...q, instructions: "Which tool?" }));
    expect(questionsChanged(SPEC, edited)).toBe(true);
    expect(reband(SPEC, edited, result, {})).toBeNull();
    expect(questionsChanged(SPEC, updatePolicy(SPEC, "kind", (p) => p))).toBe(false);
  });

  it("sums up answers and places them on the band bar", () => {
    expect(answerSummary(result.answers["risky"])).toBe("75% yes");
    expect(answerSummary(result.answers["kind"])).toBe("shell at 0.80");
    expect(answerSummary(undefined)).toBe("Not asked");
    expect(answerSummary({ type: "future_type" } as never)).toBe("future_type");
    expect(answerMarker(result.answers["risky"])).toBe(0.75);
    expect(answerMarker(result.answers["kind"])).toBe(0.8);
    expect(answerMarker({ type: "future_type" } as never)).toBeNull();
  });

  it("finds the lint findings for one question and its policy only", () => {
    const findings = [
      { path: "/stages/0/questions/kind/criteria", rule: "a", severity: "error", message: "x" },
      { path: "/policies/kind", rule: "b", severity: "warning", message: "y" },
      { path: "/policies/kinder", rule: "c", severity: "error", message: "z" },
      { path: "/stages/1/questions/kind", rule: "d", severity: "error", message: "w" },
    ] as const;
    expect(findingsFor(findings, KIND).map((f) => f.rule)).toEqual(["a", "b"]);
  });

  it("builds a starting state from input.schema", () => {
    expect(skeletonState(SPEC.input.schema)).toEqual({ text: "", n: 0, tags: [] });
    expect(skeletonState({ type: "object", properties: { mode: { enum: ["a", "b"] }, on: { type: "boolean", default: true } } })).toEqual({ mode: "a", on: true });
    expect(skeletonState(null)).toBeNull();
  });
});
