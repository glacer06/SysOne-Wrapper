// Content for the docs home (DOCS-M1, "Bench with a worked receipt").
// Commands are the real ones from packages/cli and the quickstart. Every value in the receipt and the
// RunResult is an example, and the page says so. test/home.test.ts checks that the RunResult example
// uses only field names from packages/core/src/contracts/run.ts.

import { apiLivePhase } from "~/site";

/** The hosted API origin, the CLI's default BANDWISE_BASE_URL (ADR-018). */
export const apiOrigin = "https://app.bandwise.dev";

export interface HomeStep {
  title: string;
  command: string;
}

export const steps: readonly HomeStep[] = [
  { title: "Install the CLI", command: "npm install -g @bandwise/cli" },
  { title: "Write one question", command: "spec.json" },
  { title: "Run a check", command: "bandwise run --local spec.json state.json" },
];

export interface CodeSample {
  id: "cli" | "typescript" | "curl";
  label: string;
  /** What the panel shows. CLI lines start with "$ ", which is drawn as a prompt and never copied. */
  code: string;
  /** Shown under the code. */
  note: string;
}

const exampleSet = "done-check";

export const codeSamples: readonly CodeSample[] = [
  {
    id: "cli",
    label: "CLI",
    code: ["$ npm install -g @bandwise/cli", "$ bandwise run --local spec.json state.json"].join("\n"),
    note: "Local mode uses fixture answers. No network call and no key.",
  },
  {
    id: "typescript",
    label: "TypeScript",
    code: [
      `const url = "${apiOrigin}/api/v1/sets/${exampleSet}/run";`,
      `const res = await fetch(url, {`,
      `  method: "POST",`,
      `  headers: {`,
      "    Authorization: `Bearer ${process.env.BANDWISE_TOKEN}`,",
      `    "Content-Type": "application/json",`,
      `  },`,
      `  body: JSON.stringify({`,
      `    state: { request: "Fix the auth tests", last_reply: "Done." },`,
      `  }),`,
      `});`,
      `const result = await res.json(); // RunResult`,
      `// Act on result.overallAction.`,
    ].join("\n"),
    note: `The planned call. The HTTP API opens in Phase ${apiLivePhase}.`,
  },
  {
    id: "curl",
    label: "curl",
    code: [
      `curl -X POST ${apiOrigin}/api/v1/sets/${exampleSet}/run \\`,
      `  -H "Authorization: Bearer $BANDWISE_TOKEN" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"state": {"request": "Fix the auth tests",`,
      `                 "last_reply": "Done."}}'`,
    ].join("\n"),
    note: `The planned call. The HTTP API opens in Phase ${apiLivePhase}.`,
  },
];

/** The text Copy puts on the clipboard: CLI prompts are dropped. */
export function copyText(sample: CodeSample): string {
  return sample.code
    .split("\n")
    .map((line) => (line.startsWith("$ ") ? line.slice(2) : line))
    .join("\n");
}

/** The worked receipt: state, band, why, cost. Example values. */
export const receipt = {
  state: "Not done yet.",
  band: { name: "Medium", tone: "medium", score: "0.62" },
  why: "7 tests in auth/ regressed",
  cost: { systemOne: "$0.00003", saved: "$0.004" },
  links: {
    state: { href: "/docs/concepts/question-sets", label: "Question sets" },
    band: { href: "/docs/concepts/confidence-bands", label: "Confidence bands" },
    why: { href: "/docs/concepts/question-types", label: "Question types" },
    cost: { href: "/docs/concepts/cost-and-savings", label: "Cost and savings" },
  },
} as const;

/** A trimmed RunResult for the same example. Field names only from the RunResult contract. */
export const runResultExample = {
  runId: "0b9c6f2e-5a4d-4c1e-9f7a-2d8e6b1c4a30",
  channel: "production",
  rollout: "full",
  status: "ok",
  modelRequested: "jev-1.13.0",
  modelResolved: "jev-1.13.0",
  decisions: {
    turn_outcome: {
      kind: "question",
      value: "work_left",
      band: "medium",
      relevant: true,
      action: "review",
      effectiveAction: "review",
      executed: true,
    },
  },
  runBand: "medium",
  overallAction: "review",
  route: "continue",
  cost: {
    systemOneCostUsd: 0.00003,
    counterfactualLlmCostUsd: 0.00403,
    comparatorModel: "claude-haiku-4-5",
    savingsUsd: 0.004,
    savingsKind: "decision",
    savingsSuppressed: null,
    llmCallsAvoided: 1,
    estimated: true,
    latencyMs: 180,
  },
  warnings: [],
} as const;

export interface QuickLink {
  href: string;
  title: string;
  description: string;
}

export const quickLinks: readonly QuickLink[] = [
  { href: "/docs/quickstart", title: "Quickstart", description: "Run a set on your machine in local mode." },
  { href: "/docs/concepts/confidence-bands", title: "Confidence bands", description: "How thresholds turn an answer into High, Medium or Low." },
  { href: "/docs/concepts/rollout", title: "Rollout stages", description: "Shadow, controlled, full and paused." },
  { href: "/docs/concepts/cost-and-savings", title: "Cost and savings", description: "What a run cost and what it saved against an LLM." },
  { href: "/docs/cli", title: "CLI reference", description: "Every bandwise command that works today." },
  { href: "/docs/api", title: "API reference", description: "The planned HTTP API, from its OpenAPI schema." },
];

export const agentLinks = [
  { href: "/llms.txt", label: "llms.txt" },
  { href: `${apiOrigin}/api/v1/openapi.json`, label: "openapi.json" },
  { href: "/docs/agents-and-mcp", label: "MCP" },
] as const;
