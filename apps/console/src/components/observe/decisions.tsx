import type { Action, Band } from "@bandwise/core";

import { BandBadge, Table, Td, Th } from "~/components/ui";

import { ACTION_LABEL, formatValue } from "../format";

/** The parts of a Decision the pages read. Runs store the full RunResult decision. */
export interface DecisionLike {
  value: unknown;
  band: Band;
  level?: string;
  relevant: boolean;
  action: Action;
  effectiveAction: Action;
  executed: boolean;
}

export function decisionsOf(value: unknown): [string, DecisionLike][] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, DecisionLike>);
}

/** How sure the model was, in one number: P(yes) for noul, the confidence for choice and score. */
export function confidenceOf(answer: unknown): string | null {
  if (typeof answer !== "object" || answer === null) return null;
  const a = answer as Record<string, unknown>;
  if (a["type"] === "noul" && typeof a["noul"] === "number") return `P(yes) ${a["noul"].toFixed(2)}`;
  if (typeof a["confidence"] === "number") return `confidence ${a["confidence"].toFixed(2)}`;
  return null;
}

/** The options a person can pick to correct a decision: from the answer's own probabilities. */
export function choicesOf(answer: unknown): { value: string; label: string; json: unknown }[] | null {
  if (typeof answer !== "object" || answer === null) return null;
  const a = answer as Record<string, unknown>;
  if (a["type"] === "noul") {
    return [
      { value: "true", label: "Yes", json: true },
      { value: "false", label: "No", json: false },
    ];
  }
  const probs = a["probabilities"];
  if (typeof probs !== "object" || probs === null) return null;
  const isScore = a["type"] === "score";
  return Object.entries(probs as Record<string, number>)
    .sort((x, y) => y[1] - x[1])
    .map(([key, p]) => ({ value: key, label: `${key} (p ${p.toFixed(2)})`, json: isScore && /^-?\d+(\.\d+)?$/.test(key) ? Number(key) : key }));
}

/** Each decision of a run: its value, band, what the policy said and what the stage allowed. */
export function DecisionsTable({ decisions, answers, highlight }: { decisions: unknown; answers: unknown; highlight?: string }) {
  const rows = decisionsOf(decisions);
  const byId = (typeof answers === "object" && answers !== null ? answers : {}) as Record<string, unknown>;
  if (rows.length === 0) return <p className="text-sm text-ink-3">No decisions were stored for this run.</p>;
  return (
    <Table caption="Decisions">
      <thead>
        <tr>
          <Th>Decision</Th>
          <Th>Value</Th>
          <Th>Band</Th>
          <Th>Policy action</Th>
          <Th>Allowed action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, d]) => {
          const conf = confidenceOf(byId[id]);
          return (
            <tr key={id} className={id === highlight ? "bg-info-wash" : undefined}>
              <Td className="font-mono text-xs">
                {id}
                {d.relevant ? null : <span className="ml-2 font-sans text-ink-3">not relevant</span>}
              </Td>
              <Td>
                {formatValue(d.value)}
                {d.level === undefined ? null : <span className="ml-1 text-xs text-ink-3">({d.level})</span>}
                {conf === null ? null : <span className="ml-2 font-mono text-xs text-ink-3">{conf}</span>}
              </Td>
              <Td>
                <BandBadge band={d.band} />
              </Td>
              <Td>{ACTION_LABEL[d.action] ?? d.action}</Td>
              <Td>
                {ACTION_LABEL[d.effectiveAction] ?? d.effectiveAction}
                {d.relevant && d.effectiveAction !== d.action ?<span className="ml-1 text-xs text-ink-3">(held back by the stage)</span> : null}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
