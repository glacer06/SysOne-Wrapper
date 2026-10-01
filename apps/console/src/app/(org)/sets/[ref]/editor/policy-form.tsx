"use client";

import type { ActionRef, Band, BandActions, NoulThresholds, Thresholds } from "@bandwise/core";

import { Select, Slider } from "~/components/ui";

import { BandBar } from "./band-bar";
import { noulProblem, noulSegments, type Policy, setBandAction, thresholdSegments, thresholdsProblem, togglePerOption } from "./spec-edit";

const ACTIONS: ReadonlyArray<{ value: ActionRef["kind"]; label: string }> = [
  { value: "auto", label: "Auto: act on the answer" },
  { value: "review", label: "Review: a person decides" },
  { value: "fallback", label: "Fallback: use the default path" },
  { value: "escalate_to_llm", label: "Escalate: ask an LLM" },
];

const BANDS: readonly Band[] = ["high", "medium", "low"];
const BAND_LABEL: Record<Band, string> = { high: "High band", medium: "Medium band", low: "Low band" };

function Problem({ text }: { text: string | null }) {
  return text === null ? null : (
    <p role="status" className="text-xs text-danger">
      {text}
    </p>
  );
}

export function NoulSliders({ value, onChange, marker }: { value: NoulThresholds; onChange: (t: NoulThresholds) => void; marker: number | null }) {
  return (
    <div className="flex flex-col gap-3">
      <BandBar segments={noulSegments(value)} axis="Probability of yes" marker={marker} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Slider label="Yes at or above" value={value.trueAt} onValueChange={(trueAt) => onChange({ ...value, trueAt })} />
        <Slider label="No at or below" value={value.falseAt} onValueChange={(falseAt) => onChange({ ...value, falseAt })} />
        <Slider label="Review margin" max={0.5} value={value.reviewMargin} onValueChange={(reviewMargin) => onChange({ ...value, reviewMargin })} />
      </div>
      <Problem text={noulProblem(value)} />
    </div>
  );
}

export function ThresholdSliders({ value, onChange, marker, axis = "Confidence" }: { value: Thresholds; onChange: (t: Thresholds) => void; marker: number | null; axis?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <BandBar segments={thresholdSegments(value)} axis={axis} marker={marker} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="High at or above" value={value.high} onValueChange={(high) => onChange({ ...value, high })} />
        <Slider label="Medium at or above" value={value.medium} onValueChange={(medium) => onChange({ ...value, medium })} />
      </div>
      <Problem text={thresholdsProblem(value)} />
    </div>
  );
}

function ActionSelects({ actions, onChange }: { actions: BandActions; onChange: (a: BandActions) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {BANDS.map((band) => (
        <Select
          key={band}
          label={BAND_LABEL[band]}
          value={actions[band].kind}
          options={ACTIONS}
          onChange={(e) => onChange(setBandAction(actions, band, e.target.value as ActionRef["kind"]))}
        />
      ))}
    </div>
  );
}

/**
 * Thresholds and band actions for one question's policy. `marker` is where the last preview's
 * answer sits; for a choice it shows on the bar that applied to `answeredOption`.
 */
export function PolicyForm({ policy, options, onChange, marker, answeredOption = null }: {
  policy: Policy;
  options: readonly string[];
  onChange: (p: Policy) => void;
  marker: number | null;
  answeredOption?: string | null;
}) {
  if (policy.type === "composite") return null;
  const ownBar = policy.type === "choice" && answeredOption !== null && policy.perOption?.[answeredOption] !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={policy.gating} onChange={(e) => onChange({ ...policy, gating: e.target.checked })} className="h-4 w-4 accent-[var(--signal)]" />
        Gating: this answer decides the run band and the overall action
      </label>
      {policy.type === "noul" ? (
        <NoulSliders value={policy.noul} marker={marker} onChange={(noul) => onChange({ ...policy, noul })} />
      ) : (
        <ThresholdSliders value={policy.thresholds} marker={ownBar ? null : marker} onChange={(thresholds) => onChange({ ...policy, thresholds })} />
      )}
      {policy.type === "choice" && options.length > 0 ? (
        <fieldset className="flex flex-col gap-3 rounded-sm border border-rule p-3">
          <legend className="px-1 text-sm font-medium text-ink">Stricter bars per option</legend>
          <p className="text-xs text-ink-3">Turn one on for a risky option that should need more confidence before it acts.</p>
          {options.map((key) => {
            const own = policy.perOption?.[key];
            return (
              <div key={key} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={own !== undefined} onChange={(e) => onChange(togglePerOption(policy, key, e.target.checked))} className="h-4 w-4 accent-[var(--signal)]" />
                  <span className="font-mono">{key}</span>
                </label>
                {own === undefined ? null : (
                  <ThresholdSliders
                    value={own}
                    marker={key === answeredOption ? marker : null}
                    axis={`Confidence when the answer is ${key}`}
                    onChange={(t) => onChange({ ...policy, perOption: { ...policy.perOption, [key]: t } })}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      ) : null}
      <ActionSelects actions={policy.actions} onChange={(actions) => onChange({ ...policy, actions })} />
    </div>
  );
}
