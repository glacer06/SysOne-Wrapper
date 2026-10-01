// What the split queue shows for each item, built on the server from review.list, run.get and the
// version's spec. Pure and serializable, so the client pane moves between items without a request.

import type { Band, QuestionSetSpec, ReviewItemKind, ReviewItemStatus } from "@bandwise/core";

import { formatUsd, formatUtc, formatValue, formatWhen, REASON_LABEL, reviewStateLine } from "~/components/format";
import { choicesOf, confidenceOf, decisionsOf, scoreOf } from "~/components/observe/decisions";
import { decisionRuler, type RulerGroup } from "~/components/observe/ruler-math";
import type { ReviewItemView, RunDetail } from "~/server/operations/views";

export interface QueueChoice {
  /** JSON text of the value, so true stays a boolean and a level stays a number. */
  json: string;
  label: string;
}

export interface QueueEntry {
  id: string;
  runId: string | null;
  setLabel: string;
  decisionId: string;
  kind: ReviewItemKind;
  status: ReviewItemStatus;
  band: Band;
  score: number | null;
  reason: string;
  age: string;
  stateLine: string;
  /** "P(yes) 0.62", when the answer has one. */
  confidence: string | null;
  cost: string | null;
  ruler: RulerGroup | null;
  choices: QueueChoice[] | null;
  /** The value the run decided, as JSON text, and in words. */
  suggestedJson: string;
  suggestedLabel: string;
  /** For items an agent answered: its answer. */
  agentJson: string | null;
  agentLabel: string | null;
  /** The input the run saw, pretty JSON, cut at STATE_LIMIT characters. */
  state: string | null;
  stateCut: boolean;
  runLoaded: boolean;
  /** For items already decided: what was saved, in words, and when. */
  settled: string | null;
}

export const STATE_LIMIT = 20_000;

/** The value inside a `{ value }` object, or the thing itself. */
export function valueOf(v: unknown): unknown {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "value" in v ? (v as { value: unknown }).value : v;
}

export function queueEntry(item: ReviewItemView, run: RunDetail | null, spec: QuestionSetSpec | null, setLabel: string, now: Date): QueueEntry {
  const decisions = run === null ? [] : decisionsOf(run.decisions);
  const answer = run === null ? undefined : (run.answers as Record<string, unknown> | null)?.[item.decisionId];
  const decision = decisions.find(([id]) => id === item.decisionId)?.[1];
  const suggested = decision?.value ?? valueOf(item.suggested) ?? null;
  const agent = item.status === "pending_confirmation" ? (valueOf(item.resolution) ?? null) : undefined;
  const stateText = run === null || run.state === null ? null : JSON.stringify(run.state, null, 2);
  return {
    id: item.id,
    runId: item.runId,
    setLabel,
    decisionId: item.decisionId,
    kind: item.kind,
    status: item.status,
    band: item.band,
    score: scoreOf(answer),
    reason: REASON_LABEL[item.reason],
    age: formatWhen(item.createdAt, now),
    stateLine: reviewStateLine(item.status),
    confidence: confidenceOf(answer),
    cost: run === null ? null : `${formatUsd(run.systemOneCostMicroUsd)} for the run, saved ${formatUsd(run.savingsMicroUsd)}`,
    ruler: run === null || spec === null ? null : decisionRuler(spec, decisions, run.answers, item.decisionId),
    choices: choicesOf(answer)?.map((c) => ({ json: JSON.stringify(c.json), label: c.label })) ?? null,
    suggestedJson: JSON.stringify(suggested),
    suggestedLabel: formatValue(suggested),
    agentJson: agent === undefined ? null : JSON.stringify(agent),
    agentLabel: agent === undefined ? null : formatValue(agent),
    state: stateText === null ? null : stateText.slice(0, STATE_LIMIT),
    stateCut: stateText !== null && stateText.length > STATE_LIMIT,
    runLoaded: run !== null,
    settled:
      item.status === "resolved"
        ? `Resolved as ${formatValue(valueOf(item.resolution))}${item.resolvedAt === null ? "" : ` on ${formatUtc(item.resolvedAt)}`}.`
        : item.status === "dismissed"
          ? `Dismissed${item.resolvedAt === null ? "" : ` on ${formatUtc(item.resolvedAt)}`}.`
          : null,
  };
}
