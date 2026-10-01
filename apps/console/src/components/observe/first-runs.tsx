// First-time empty states for the read screens (Nick's EMPTY mix): each page's real columns, three
// SAMPLE rows, and one next step with the exact CLI line. Filter misses keep the plain EmptyState.

import { FirstRunEmpty, type SampleColumn, type SampleRow } from "~/components/ui";

const TITLE = "Nothing on the trail yet.";

const RUN_COLUMNS: readonly SampleColumn[] = [
  { label: "When" },
  { label: "Run band", band: true },
  { label: "Set" },
  { label: "Stage at run" },
  { label: "Action" },
  { label: "Cost", numeric: true },
  { label: "Saved", numeric: true },
];
const RUN_ROWS: readonly SampleRow[] = [
  { band: "high", score: 0.91, cells: ["2 min ago", "", "sample-set-a", "shadow", "Auto", "$0.00002", "$0.0040"] },
  { band: "medium", score: 0.62, cells: ["5 min ago", "", "sample-set-b", "shadow", "Review", "$0.00002", "$0.0040"] },
  { band: "low", score: 0.21, cells: ["9 min ago", "", "sample-set-a", "shadow", "Review", "$0.00002", "$0.0040"] },
];

export function RunsFirstRun() {
  return (
    <FirstRunEmpty
      title={TITLE}
      caption="Runs"
      columns={RUN_COLUMNS}
      rows={RUN_ROWS}
      next="With BANDWISE_TOKEN set in your shell, the next hook call lands here. The CLI shows the same runs."
      command="pnpm bandwise report --remote --since 1h"
      commandLabel="Command to list hosted runs"
    />
  );
}

const REVIEW_COLUMNS: readonly SampleColumn[] = [{ label: "Band", band: true }, { label: "Set" }, { label: "Decision" }, { label: "Why it is here" }, { label: "Age" }];
const REVIEW_ROWS: readonly SampleRow[] = [
  { band: "low", score: 0.21, cells: ["", "sample-set-a", "sample_question", "The policy sent this band to review", "1 h ago"] },
  { band: "medium", score: 0.62, cells: ["", "sample-set-b", "sample_question", "Close to a threshold", "2 h ago"] },
  { band: "high", score: 0.91, cells: ["", "sample-set-a", "sample_question", "Random audit sample", "3 h ago"] },
];

export function ReviewFirstRun() {
  return (
    <FirstRunEmpty
      title={TITLE}
      caption="Review queue"
      columns={REVIEW_COLUMNS}
      rows={REVIEW_ROWS}
      next="Shadow never sends a decision to review. The queue starts once a set moves to controlled and its policy sends a medium or low band here, or an audit samples one."
      command="pnpm bandwise rollout <set> controlled --reason <text>"
      commandLabel="Command to move a set to controlled"
    />
  );
}

const SAVINGS_COLUMNS: readonly SampleColumn[] = [
  { label: "Set" },
  { label: "Runs", numeric: true },
  { label: "High / med / low", numeric: true },
  { label: "System One spend", numeric: true },
  { label: "LLM estimate", numeric: true },
  { label: "Saved", numeric: true },
];
const SAVINGS_ROWS: readonly SampleRow[] = [
  { band: "high", score: 0.91, cells: ["sample-set-a", "120", "70% / 20% / 10%", "$0.040", "$0.62", "$0.58"] },
  { band: "medium", score: 0.62, cells: ["sample-set-b", "40", "60% / 30% / 10%", "$0.012", "$0.20", "$0.19"] },
  { band: "low", score: 0.21, cells: ["sample-set-c", "8", "50% / 25% / 25%", "$0.002", "$0.04", "$0.04"] },
];

export function SavingsFirstRun() {
  return (
    <FirstRunEmpty
      title={TITLE}
      caption="Savings per set"
      columns={SAVINGS_COLUMNS}
      rows={SAVINGS_ROWS}
      next="Savings add up from hosted runs, and the first run of a set starts its count. Local runs from bandwise run --live stay in your receipts."
      command="pnpm bandwise report --since 7d"
      commandLabel="Command to sum your local receipts"
    />
  );
}

const APPROVAL_COLUMNS: readonly SampleColumn[] = [{ label: "Proposed" }, { label: "Agent token" }, { label: "Wants to" }, { label: "Risk" }, { label: "Trail" }];
const APPROVAL_ROWS: readonly SampleRow[] = [
  { band: "high", score: 0.91, cells: ["09:42 UTC", "sample-token", "Publish the draft to production", "High risk", "Waiting"] },
  { band: "medium", score: 0.62, cells: ["Yesterday", "sample-token", "Move production to Controlled", "High risk", "Approved"] },
  { band: "low", score: 0.21, cells: ["2 days ago", "sample-token", "Lift a pause", "High risk", "Denied"] },
];

export function ApprovalsFirstRun() {
  return (
    <FirstRunEmpty
      title="Moves toward safety apply right away. Nothing waits on you."
      caption="Agent requests"
      columns={APPROVAL_COLUMNS}
      rows={APPROVAL_ROWS}
      next="When an agent token asks to publish to a live production channel, widen a rollout or lift a pause, the request waits here for a person whose role can decide it."
      command="pnpm bandwise publish <set> --channel production"
      commandLabel="An agent command that waits here on a live set"
    />
  );
}
