import type { RolloutStage } from "@bandwise/core";

import { cx } from "~/components/ui";

import { type StopState, TRAIL, trailStops } from "./stage-trail";

const WORD: Record<RolloutStage, string> = { inactive: "Inactive", shadow: "Shadow", controlled: "Controlled", full: "Full", paused: "Paused" };

/** One stop: filled behind the current stop, the one teal node at it, open ahead of it. */
function Dot({ state, large = false }: { state: StopState; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "block shrink-0 rounded-full",
        state === "current"
          ? cx("bg-bw-brand ring-2 ring-bw-surface", large ? "h-3.5 w-3.5" : "h-3 w-3")
          : state === "passed"
            ? "h-2 w-2 bg-bw-text"
            : "h-2 w-2 border border-bw-border-control bg-bw-surface",
      )}
    />
  );
}

/** What the trail says, for screen readers: the visual is hidden from them. */
function spoken(stage: RolloutStage | null, channel: string | undefined, version: number | undefined): string {
  const who = channel === undefined ? "" : `${channel}: `;
  if (stage === null) return `${who}not published`;
  const v = version === undefined ? "" : `, version ${version}`;
  if (stage === "paused") return `${who}paused${v}, kill switch on`;
  return `${who}${WORD[stage].toLowerCase()}${v}, stop ${TRAIL.indexOf(stage) + 1} of ${TRAIL.length}`;
}

/**
 * The compact trail for a table cell (SETS-B): four dots filled to the stage, then the stage word
 * in mono caps. Paused shows every dot open and the word in the low color.
 */
export function StageTrail({ stage, channel, version }: { stage: RolloutStage | null; channel?: string; version?: number }) {
  if (stage === null) return <span className="text-sm text-bw-text-muted">Not published</span>;
  const stops = trailStops(stage);
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className="inline-flex items-center">
        {stops.map((s, i) => (
          <span key={s.stage} className="flex items-center">
            {i === 0 ? null : <span className="bw-trail mx-0.5 w-3" />}
            <Dot state={s.state} />
          </span>
        ))}
      </span>
      <span aria-hidden className={cx("font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase", stage === "paused" ? "text-bw-low-text" : "text-bw-text")}>
        {WORD[stage]}
      </span>
      <span className="sr-only">{spoken(stage, channel, version)}</span>
    </span>
  );
}

/**
 * The full trail for one channel (ROLL-A): four named stops on a dotted line, the current stop
 * the one teal node with its version above it. Paused or unpublished: no teal node.
 */
export function ChannelTrail({ stage, version, channel }: { stage: RolloutStage | null; version?: number; channel: string }) {
  const stops = trailStops(stage);
  return (
    <div className="w-full">
      <p className="sr-only">{spoken(stage, channel, version)}</p>
      <ol aria-hidden className="relative grid grid-cols-4">
        {/* The dotted line runs from the first stop's center to the last's. */}
        <span className="bw-trail absolute top-[calc(1.8125rem-1.5px)] right-[12.5%] left-[12.5%]" />
        {stops.map((s) => (
          <li key={s.stage} className="relative flex flex-col items-center gap-1.5">
            <span className={cx("h-4 font-mono text-xs leading-4 font-semibold tabular-nums", s.state === "current" ? "text-bw-text" : "text-transparent")}>
              {s.state === "current" && version !== undefined ? `v${version}` : " "}
            </span>
            <span className="relative flex h-3.5 items-center bg-transparent">
              <Dot state={s.state} large />
            </span>
            <span
              className={cx(
                "font-mono text-[0.625rem] tracking-[0.06em] uppercase sm:text-[0.6875rem] sm:tracking-[0.08em]",
                s.state === "current" ? "font-semibold text-bw-text" : "text-bw-text-muted",
              )}
            >
              {WORD[s.stage]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
