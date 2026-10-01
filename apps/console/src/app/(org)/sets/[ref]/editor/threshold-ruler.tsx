"use client";

import type { ActionRef, Band, BandActions } from "@bandwise/core";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { BandBadge, cx, Select } from "~/components/ui";

import { bandRange, bandRows, formatDelta, formatShare, histogram, keyStep, moveHandle, nearestHandle, parseTyped, valueAtPointer } from "./ruler-math";
import type { BandSegment } from "./spec-edit";

export const ACTION_OPTIONS: ReadonlyArray<{ value: ActionRef["kind"]; label: string }> = [
  { value: "auto", label: "Auto: act on the answer" },
  { value: "review", label: "Review: a person decides" },
  { value: "fallback", label: "Fallback: use the default path" },
  { value: "escalate_to_llm", label: "Escalate: ask an LLM" },
];
const ACTION_WORD: Record<ActionRef["kind"], string> = { auto: "Auto", review: "Review", fallback: "Fallback", escalate_to_llm: "Escalate" };

const FILL: Record<Band, string> = { high: "bg-bw-high", medium: "bg-bw-medium", low: "bg-bw-low" };
/** Stack order inside a histogram bar, bottom first. */
const STACK: readonly Band[] = ["low", "medium", "high"];

type Which = "lower" | "upper";
type Pair = { lower: number; upper: number };

export interface RulerProps {
  /** What the ruler belongs to, for accessible names: a question, an option or a composite. */
  context: string;
  /** What the scale measures, for example "Confidence" or "Probability of yes". */
  axis: string;
  segments: readonly BandSegment[];
  /** The draft's band rule for one value: core's own, from the draft's thresholds. */
  bandOf: (x: number) => Band;
  lowerLabel: string;
  upperLabel: string;
  value: Pair;
  /** Least distance the handles keep: 0 for choice and score, one step for the noul bars. */
  gap: number;
  onChange: (next: Pair) => void;
  /** Recent scores to plot. Null when this ruler has no run data to show (composites). */
  scores: readonly number[] | null;
  /** The published version's band rule on the same scale, and where its thresholds sit. */
  published: { label: string; bandOf: (x: number) => Band; cuts: readonly number[] } | null;
  /** The last preview's answer, as a 2px marker on the track. */
  marker: number | null;
  /** The policy's band actions. With `onAction` the rows edit them. */
  actions?: BandActions;
  onAction?: (band: Band, kind: ActionRef["kind"]) => void;
  /** More fields beside the handle fields, such as the noul review margin. */
  extra?: ReactNode;
  disabled?: boolean;
}

/** One handle's typed field: commits on Enter or blur, and arrow keys step it like the handle. */
export function HandleField({ id, label, value, onCommit, disabled }: { id: string; label: string; value: number; onCommit: (v: number) => void; disabled: boolean }) {
  const [text, setText] = useState(value.toFixed(2));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value.toFixed(2));
    setBad(false);
  }, [value]);
  function commit() {
    const v = parseTyped(text);
    if (v === null) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(v);
    setText(v.toFixed(2));
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const next = keyStep(parseTyped(text) ?? value, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    onCommit(next);
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="bw-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        disabled={disabled}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className="h-11 w-24 rounded-sm border border-bw-border-control bg-bw-surface px-3 font-mono text-base tabular-nums text-bw-text hover:border-bw-text-muted focus-visible:border-bw-focus aria-[invalid=true]:border-bw-low disabled:opacity-40 sm:h-10 sm:text-sm"
      />
      {bad ? (
        <p id={`${id}-error`} className="text-xs text-bw-low-text">
          Type a number from 0 to 1.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ruler over the trail (EDIT-A). A full-width 0 to 1 ruler in the draft's band colors, with a
 * histogram of recent scores above it colored by the band each falls in under the draft. Two
 * handles carry the thresholds: drag them, use the arrow keys, or type in the mono fields under
 * the ruler. Three rows under it give each band's count, share, action and the change from the
 * published version on the same runs. Every cutoff comes from the props; nothing here knows one.
 */
export function ThresholdRuler(props: RulerProps) {
  const { context, axis, segments, bandOf, lowerLabel, upperLabel, value, gap, onChange, scores, published, marker, actions, onAction, extra, disabled = false } = props;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<Which | null>(null);
  const uid = useId();
  const labels: Record<Which, string> = { lower: lowerLabel, upper: upperLabel };

  const set = (which: Which, v: number) => {
    const next = moveHandle(value, which, v, gap);
    if (next.lower !== value.lower || next.upper !== value.upper) onChange(next);
  };

  function pointerValue(e: PointerEvent<HTMLElement>): number | null {
    const r = track.current?.getBoundingClientRect();
    return r === undefined ? null : valueAtPointer(e.clientX, r.left, r.width);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    const v = pointerValue(e);
    if (v === null) return;
    const own = (e.target as HTMLElement).dataset.handle;
    const which: Which = own === "lower" || own === "upper" ? own : nearestHandle(value, v);
    dragging.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.getElementById(`${uid}-${which}`)?.focus();
    set(which, v);
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current === null) return;
    const v = pointerValue(e);
    if (v !== null) set(dragging.current, v);
  }
  function onPointerUp() {
    dragging.current = null;
  }
  function onHandleKey(which: Which, e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const next = keyStep(value[which], e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    set(which, next);
  }

  const bins = scores === null ? [] : histogram(scores, bandOf);
  const peak = Math.max(1, ...bins.map((b) => b.total));
  const rows = bandRows(scores ?? [], bandOf, published?.bandOf ?? null);
  const counted = rows.reduce((n, r) => n + r.count, 0);

  return (
    <figure className="flex flex-col gap-3" aria-label={`${context}: thresholds`}>
      <div className="relative">
        {/* Histogram of recent scores, decorative: the rows below say the same in words. */}
        {scores === null ? null : (
          <div aria-hidden className="relative flex h-16 items-end gap-px">
            {bins.map((b) => (
              <div key={b.from} className="flex h-full flex-1 flex-col-reverse">
                {STACK.map((band) =>
                  b.counts[band] === 0 ? null : <div key={band} className={cx(FILL[band], "w-full")} style={{ height: `${(b.counts[band] / peak) * 100}%` }} />,
                )}
              </div>
            ))}
            {counted === 0 ? <p className="absolute inset-0 flex items-center justify-center text-xs text-bw-text-muted">No recent runs to plot yet.</p> : null}
          </div>
        )}
        {/* The published thresholds, as faint ticks through the histogram and the track. */}
        {published?.cuts.map((c) => (
          <span aria-hidden key={c} className="absolute top-0 bottom-0 w-px border-l border-dashed border-bw-text-muted opacity-60" style={{ left: `${c * 100}%` }} />
        ))}
        <div
          ref={track}
          className={cx("relative h-11 touch-none select-none", disabled ? "cursor-not-allowed" : "cursor-pointer")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden">
            {segments.map((s, i) => (
              <div
                key={`${s.from}-${s.band}-${String(s.value)}`}
                className={cx("absolute inset-y-0", FILL[s.band], i > 0 && "border-l-2 border-bw-surface")}
                style={{ left: `${s.from * 100}%`, width: `${Math.max(0.5, ((segments[i + 1]?.from ?? 1) - s.from) * 100)}%` }}
              />
            ))}
          </div>
          {marker === null ? null : (
            <div aria-hidden className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 bg-bw-text shadow-[0_0_0_1px_var(--bw-bg)]" style={{ left: `calc(${marker * 100}% - 1px)` }} />
          )}
          {(["lower", "upper"] as const).map((which) => (
            <div
              key={which}
              id={`${uid}-${which}`}
              data-handle={which}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${context}: ${labels[which].toLowerCase()}`}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={value[which]}
              aria-valuetext={value[which].toFixed(2)}
              aria-disabled={disabled || undefined}
              onKeyDown={(e) => onHandleKey(which, e)}
              className={cx(
                "absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm",
                "before:block before:h-7 before:w-3.5 before:rounded-xs before:border-2 before:border-bw-text before:bg-bw-surface before:content-['']",
                disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
              )}
              style={{ left: `${value[which] * 100}%` }}
            />
          ))}
        </div>
        <div aria-hidden className="flex justify-between font-mono text-xs tabular-nums text-bw-text-muted">
          <span>0</span>
          <span>{axis}</span>
          <span>1</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <HandleField id={`${uid}-lower-field`} label={lowerLabel} value={value.lower} disabled={disabled} onCommit={(v) => set("lower", v)} />
        <HandleField id={`${uid}-upper-field`} label={upperLabel} value={value.upper} disabled={disabled} onCommit={(v) => set("upper", v)} />
        {extra}
      </div>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${context}: recent runs per band under the draft`}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{`${context}: recent runs per band under the draft`}</caption>
          <thead>
            <tr>
              <th scope="col" className="bw-label border-b border-bw-border-strong py-2 pr-3">
                Band
              </th>
              <th scope="col" className="bw-label border-b border-bw-border-strong px-3 py-2 text-right">
                Runs
              </th>
              <th scope="col" className="bw-label border-b border-bw-border-strong px-3 py-2 text-right">
                Share
              </th>
              <th scope="col" className="bw-label border-b border-bw-border-strong px-3 py-2">
                Action
              </th>
              <th scope="col" className="bw-label border-b border-bw-border-strong py-2 pl-3 text-right whitespace-nowrap">
                {published === null ? "Vs published" : `Vs ${published.label}`}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.band}>
                <th scope="row" className="border-b border-bw-border py-2 pr-3 text-left font-normal">
                  <span className="flex flex-col items-start gap-1">
                    <BandBadge band={r.band} />
                    <span className="font-mono text-xs whitespace-nowrap tabular-nums text-bw-text-muted">{bandRange(segments, r.band)}</span>
                  </span>
                </th>
                <td className="border-b border-bw-border px-3 py-2 text-right font-mono tabular-nums text-bw-text">{scores === null ? "-" : r.count}</td>
                <td className="border-b border-bw-border px-3 py-2 text-right font-mono tabular-nums text-bw-text">{scores === null ? "-" : formatShare(r.share)}</td>
                <td className="border-b border-bw-border px-3 py-2">
                  {actions === undefined ? (
                    <span className="text-bw-text-muted">-</span>
                  ) : onAction === undefined ? (
                    <span className="text-bw-text">{ACTION_WORD[actions[r.band].kind]}</span>
                  ) : (
                    <div className="min-w-[9.5rem] sm:min-w-[13.5rem]">
                      <Select
                        labelHidden
                        label={`${context}: action for the ${r.band} band`}
                        value={actions[r.band].kind}
                        options={ACTION_OPTIONS}
                        onChange={(e) => onAction(r.band, e.target.value as ActionRef["kind"])}
                      />
                    </div>
                  )}
                </td>
                <td className="border-b border-bw-border py-2 pl-3 text-right font-mono tabular-nums text-bw-text">
                  {r.delta === null || scores === null ? <span className="text-bw-text-muted">-</span> : formatDelta(r.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="bw-label">
        {scores === null ? "No run data for this ruler" : `Last ${counted} ${counted === 1 ? "run" : "runs"} with this answer`}
        {published === null ? " · Not published yet" : ` · Faint ticks: published ${published.label}`}
      </figcaption>
    </figure>
  );
}
