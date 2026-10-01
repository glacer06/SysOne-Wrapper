"use client";

import { type Band, type BandActions, noulBand, type NoulThresholds, thresholdBand, type Thresholds } from "@bandwise/core";
import { useId } from "react";

import { type RecentScore, scoresFor } from "./recent-scores";
import { clamp } from "./ruler-math";
import { noulProblem, noulSegments, type Policy, setBandAction, thresholdSegments, thresholdsProblem, togglePerOption } from "./spec-edit";
import { HandleField, ThresholdRuler } from "./threshold-ruler";

function Problem({ text }: { text: string | null }) {
  return text === null ? null : (
    <p role="status" className="text-xs text-bw-low-text">
      {text}
    </p>
  );
}

/** Where a band rule's cuts sit: the start of every segment after the first. */
function cutsOf(segments: readonly { from: number }[]): number[] {
  return segments.slice(1).map((s) => s.from);
}

/** The published version's policy for the same question, when one is published and has the same type. */
export interface PublishedPolicy {
  /** "v7" */
  label: string;
  policy: Policy | undefined;
}

interface Common {
  marker: number | null;
  /** What these handles belong to, for their accessible names: a question, an option or a composite. */
  context: string;
  /** Recent scores for this ruler, or null when there is no run data for it. */
  scores?: readonly number[] | null;
  actions?: BandActions;
  onActions?: (a: BandActions) => void;
  disabled?: boolean;
}

export function NoulSliders({ value, onChange, published = null, scores = null, ...rest }: Common & {
  value: NoulThresholds;
  onChange: (t: NoulThresholds) => void;
  published?: { label: string; noul: NoulThresholds } | null;
}) {
  const marginId = useId();
  const segments = noulSegments(value);
  return (
    <div className="flex flex-col gap-2">
      <ThresholdRuler
        context={rest.context}
        axis="Probability of yes"
        segments={segments}
        bandOf={(x) => noulBand(x, value).band}
        lowerLabel="No at or below"
        upperLabel="Yes at or above"
        value={{ lower: value.falseAt, upper: value.trueAt }}
        gap={0.01}
        onChange={(p) => onChange({ ...value, falseAt: p.lower, trueAt: p.upper })}
        scores={scores}
        published={published === null ? null : { label: published.label, bandOf: (x) => noulBand(x, published.noul).band, cuts: cutsOf(noulSegments(published.noul)) }}
        marker={rest.marker}
        actions={rest.actions}
        onAction={rest.actions === undefined || rest.onActions === undefined ? undefined : (band: Band, kind) => rest.onActions?.(setBandAction(rest.actions as BandActions, band, kind))}
        disabled={rest.disabled}
        extra={
          <HandleField
            id={marginId}
            label="Review margin"
            value={value.reviewMargin}
            disabled={rest.disabled ?? false}
            onCommit={(v) => onChange({ ...value, reviewMargin: clamp(v, 0, 0.5) })}
          />
        }
      />
      <Problem text={noulProblem(value)} />
    </div>
  );
}

export function ThresholdSliders({ value, onChange, axis = "Confidence", published = null, scores = null, ...rest }: Common & {
  value: Thresholds;
  onChange: (t: Thresholds) => void;
  axis?: string;
  published?: { label: string; thresholds: Thresholds } | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ThresholdRuler
        context={rest.context}
        axis={axis}
        segments={thresholdSegments(value)}
        bandOf={(x) => thresholdBand(x, value)}
        lowerLabel="Medium at or above"
        upperLabel="High at or above"
        value={{ lower: value.medium, upper: value.high }}
        gap={0}
        onChange={(p) => onChange({ high: p.upper, medium: p.lower })}
        scores={scores}
        published={
          published === null ? null : { label: published.label, bandOf: (x) => thresholdBand(x, published.thresholds), cuts: cutsOf(thresholdSegments(published.thresholds)) }
        }
        marker={rest.marker}
        actions={rest.actions}
        onAction={rest.actions === undefined || rest.onActions === undefined ? undefined : (band: Band, kind) => rest.onActions?.(setBandAction(rest.actions as BandActions, band, kind))}
        disabled={rest.disabled}
      />
      <Problem text={thresholdsProblem(value)} />
    </div>
  );
}

/**
 * Thresholds and band actions for one question's policy, as a ruler over recent scores (EDIT-A).
 * `marker` is where the last preview's answer sits; for a choice it shows on the ruler that
 * applied to `answeredOption`. `recent` is null when no run data was loaded.
 */
export function PolicyForm({ policy, options, onChange, marker, answeredOption = null, context, recent = null, published = null, disabled = false }: {
  policy: Policy;
  options: readonly string[];
  onChange: (p: Policy) => void;
  marker: number | null;
  answeredOption?: string | null;
  /** The question's name, for the handles' accessible names. */
  context: string;
  recent?: readonly RecentScore[] | null;
  published?: PublishedPolicy | null;
  disabled?: boolean;
}) {
  if (policy.type === "composite") return null;
  const ownBar = policy.type === "choice" && answeredOption !== null && policy.perOption?.[answeredOption] !== undefined;
  const pub = published?.policy?.type === policy.type ? published.policy : undefined;
  const label = published?.label ?? "";
  const ownBars = policy.type === "choice" ? Object.keys(policy.perOption ?? {}) : [];
  const shared = recent === null ? null : scoresFor(recent, null, ownBars);
  const editActions = { actions: policy.actions, onActions: (actions: BandActions) => onChange({ ...policy, actions }) };
  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-10 items-center gap-2 text-sm text-bw-text">
        <input type="checkbox" checked={policy.gating} onChange={(e) => onChange({ ...policy, gating: e.target.checked })} className="h-4 w-4 accent-bw-brand" />
        Gating: this answer decides the run band and the overall action
      </label>
      {policy.type === "noul" ? (
        <NoulSliders
          value={policy.noul}
          marker={marker}
          context={context}
          scores={shared}
          disabled={disabled}
          published={pub?.type === "noul" ? { label, noul: pub.noul } : null}
          onChange={(noul) => onChange({ ...policy, noul })}
          {...editActions}
        />
      ) : (
        <ThresholdSliders
          value={policy.thresholds}
          marker={ownBar ? null : marker}
          context={context}
          scores={shared}
          disabled={disabled}
          published={pub !== undefined && pub.type !== "noul" ?{ label, thresholds: pub.thresholds } : null}
          onChange={(thresholds) => onChange({ ...policy, thresholds })}
          {...editActions}
        />
      )}
      {policy.type === "choice" && options.length > 0 ? (
        <fieldset className="flex min-w-0 flex-col gap-3 rounded-sm border border-bw-border p-3">
          <legend className="px-1 text-sm font-medium text-bw-text">Stricter bars per option</legend>
          <p className="text-xs text-bw-text-muted">Turn one on for a risky option that should need more confidence before it acts.</p>
          {options.map((key) => {
            const own = policy.perOption?.[key];
            const pubOwn = pub?.type === "choice" ? pub.perOption?.[key] : undefined;
            return (
              <div key={key} className="flex flex-col gap-2">
                <label className="flex min-h-10 items-center gap-2 text-sm text-bw-text">
                  <input type="checkbox" checked={own !== undefined} onChange={(e) => onChange(togglePerOption(policy, key, e.target.checked))} className="h-4 w-4 accent-bw-brand" />
                  <span className="font-mono">{key}</span>
                </label>
                {own === undefined ? null : (
                  <ThresholdSliders
                    value={own}
                    marker={key === answeredOption ? marker : null}
                    axis={`Confidence when the answer is ${key}`}
                    context={`${context}, option ${key}`}
                    scores={recent === null ? null : scoresFor(recent, key, ownBars)}
                    disabled={disabled}
                    actions={policy.actions}
                    published={pubOwn === undefined ? null : { label, thresholds: pubOwn }}
                    onChange={(t) => onChange({ ...policy, perOption: { ...policy.perOption, [key]: t } })}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
