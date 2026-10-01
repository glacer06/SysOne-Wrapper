"use client";

import { useActionState, useState } from "react";

import { Button, InlineAlert, Select } from "~/components/ui";

import { confirmReviewAction, dismissReviewAction, resolveReviewAction } from "../actions";
import type { ReviewFormState } from "../form";

export interface Choice {
  /** JSON text of the value, so true stays a boolean and a level stays a number. */
  json: string;
  label: string;
}

const FAILURE_OPTIONS = [
  { value: "", label: "Not sure" },
  { value: "missing_evidence", label: "The state lacked the evidence" },
  { value: "model_error", label: "The model got it wrong" },
  { value: "code_error", label: "Our code or spec was wrong" },
  { value: "service", label: "A service problem" },
];

function Hidden({ id, runId }: { id: string; runId: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="runId" value={runId} />
    </>
  );
}

/** The other answers a person can pick, or a free JSON field when the answer has no options. */
function Correction({ choices, suggestedJson }: { choices: readonly Choice[] | null; suggestedJson: string }) {
  if (choices === null) {
    return (
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-bw-text">The right value</span>
        <span className="text-xs text-bw-text-muted">JSON, for example a number or &quot;option_key&quot;.</span>
        <input name="value" required className="h-10 rounded-sm border border-bw-border-control bg-bw-surface-sunken px-3 font-mono text-sm text-bw-text" />
      </label>
    );
  }
  const others = choices.filter((c) => c.json !== suggestedJson);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-bw-text">The right answer</legend>
      {others.map((c, i) => (
        <label key={c.json} className="flex cursor-pointer items-center gap-2 text-sm text-bw-text max-sm:min-h-11">
          <input type="radio" name="value" value={c.json} defaultChecked={i === 0} required />
          {c.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Agree with one keystroke (the button has focus), correct it, or dismiss it after a confirm. */
export function ResolveForm({ id, runId, suggestedJson, suggestedLabel, choices }: { id: string; runId: string; suggestedJson: string; suggestedLabel: string; choices: readonly Choice[] | null }) {
  const [agreeState, agree, agreeing] = useActionState<ReviewFormState, FormData>(resolveReviewAction, {});
  const [fixState, fix, fixing] = useActionState<ReviewFormState, FormData>(resolveReviewAction, {});
  const [dismissState, dismiss, dismissing] = useActionState<ReviewFormState, FormData>(dismissReviewAction, {});
  const [mode, setMode] = useState<"agree" | "correct" | "dismiss">("agree");
  const error = agreeState.error ?? fixState.error ?? dismissState.error;
  const busy = agreeing || fixing || dismissing;

  return (
    <div className="flex flex-col gap-4">
      {error === undefined ? null : <InlineAlert kind="error">{error}</InlineAlert>}
      {mode === "agree" ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={agree}>
            <Hidden id={id} runId={runId} />
            <input type="hidden" name="value" value={suggestedJson} />
            {/* Focus starts here, so Enter agrees: the queue is keyboard first. */}
            <Button type="submit" variant="primary" pending={agreeing} disabled={busy} autoFocus>
              {agreeing ? "Saving..." : `Agree: ${suggestedLabel}`}
            </Button>
          </form>
          <Button onClick={() => setMode("correct")} disabled={busy}>
            It is wrong
          </Button>
          <Button variant="ghost" onClick={() => setMode("dismiss")} disabled={busy}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {mode === "correct" ? (
        <form action={fix} className="flex flex-col gap-4 rounded-md border border-bw-border p-4">
          <Hidden id={id} runId={runId} />
          <Correction choices={choices} suggestedJson={suggestedJson} />
          <Select name="failureClass" label="Why it was wrong" hint="Optional. It groups misses when you tune the set." options={FAILURE_OPTIONS} defaultValue="" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" pending={fixing} disabled={busy}>
              {fixing ? "Saving..." : "Save the right answer"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("agree")} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "dismiss" ? (
        <form action={dismiss} className="flex flex-col gap-3 rounded-md border border-bw-low p-4">
          <Hidden id={id} runId={runId} />
          <p className="text-sm text-bw-text">Dismiss this item? It leaves the queue without an answer, so it teaches the set nothing.</p>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" pending={dismissing} disabled={busy}>
              {dismissing ? "Dismissing..." : "Yes, dismiss it"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("agree")} disabled={busy}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** An agent answered this item. Confirm its answer, or replace it with the right one. */
export function ConfirmForm({ id, runId, agentJson, agentLabel, choices }: { id: string; runId: string; agentJson: string; agentLabel: string; choices: readonly Choice[] | null }) {
  const [keepState, keep, keeping] = useActionState<ReviewFormState, FormData>(confirmReviewAction, {});
  const [replaceState, replace, replacing] = useActionState<ReviewFormState, FormData>(confirmReviewAction, {});
  const [replacingOpen, setReplacingOpen] = useState(false);
  const error = keepState.error ?? replaceState.error;
  const busy = keeping || replacing;
  return (
    <div className="flex flex-col gap-4">
      {error === undefined ? null : <InlineAlert kind="error">{error}</InlineAlert>}
      {replacingOpen ? (
        <form action={replace} className="flex flex-col gap-4 rounded-md border border-bw-border p-4">
          <Hidden id={id} runId={runId} />
          <Correction choices={choices} suggestedJson={agentJson} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" pending={replacing} disabled={busy}>
              {replacing ? "Saving..." : "Save my answer instead"}
            </Button>
            <Button variant="ghost" onClick={() => setReplacingOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={keep}>
            <Hidden id={id} runId={runId} />
            <Button type="submit" variant="primary" pending={keeping} disabled={busy}>
              {keeping ? "Saving..." : `Confirm the agent's answer: ${agentLabel}`}
            </Button>
          </form>
          <Button onClick={() => setReplacingOpen(true)} disabled={busy}>
            Replace it
          </Button>
        </div>
      )}
    </div>
  );
}
