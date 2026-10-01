"use client";

import type { Action, RunDryRunResult, RunResult } from "@bandwise/core";
import { useEffect, useState, useTransition } from "react";

import { Badge, BandBadge, Button, Card, checkJson, CodeEditor, InlineAlert, RolloutBadge, Select, cx } from "~/components/ui";

import { money, timeAgo } from "../../_components/format";
import { previewDraftAction, runStateAction } from "../actions";
import { answerSummary, reband, type Rebanded, skeletonState, type Spec, toJsonText } from "./spec-edit";

export interface RecentRun {
  id: string;
  createdAt: string;
  runBand: RunResult["runBand"];
  source: string;
  status: string;
}

/** The last preview: a real run with the spec it ran, or a dry run. */
export type LastPreview =
  | { kind: "run"; result: RunResult; spec: Spec; state: unknown; at: string }
  | { kind: "dry"; result: RunDryRunResult; at: string };

const ACTION_LABEL: Record<Action, string> = { auto: "Auto", review: "Review", fallback: "Fallback", escalate_to_llm: "Escalate to LLM" };

function storageKey(slug: string) {
  return `bandwise:preview-state:${slug}`;
}

function readStored(slug: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}

function writeStored(slug: string, text: string) {
  try {
    window.localStorage.setItem(storageKey(slug), text);
  } catch {
    // Private windows and blocked storage: the sample simply is not remembered.
  }
}

function labelOf(spec: Spec, id: string): string {
  for (const s of spec.stages) {
    const q = s.questions[id];
    if (q !== undefined) return q.meta.label;
  }
  return id;
}

function Changed({ before, after, children }: { before: string; after: string; children: React.ReactNode }) {
  return <span className={cx(before !== after && "rounded-sm bg-signal/25 px-1 font-medium")}>{children}</span>;
}

function RunView({ preview, spec }: { preview: Extract<LastPreview, { kind: "run" }>; spec: Spec | null }) {
  const { result } = preview;
  const edited: Rebanded | null = spec === null ? null : reband(preview.spec, spec, result, preview.state);
  const stale = spec !== null && edited === null;
  const showEdits = edited !== null && JSON.stringify(edited) !== JSON.stringify(reband(preview.spec, preview.spec, result, preview.state));
  const ids = Object.keys(result.decisions);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RolloutBadge stage={result.rollout} />
        <span className="text-ink-2">Run band</span>
        <BandBadge band={result.runBand} />
        <span className="text-ink-2">Overall</span>
        <Badge>{ACTION_LABEL[result.overallAction]}</Badge>
        <span className="text-ink-2">Route</span>
        <span className="font-mono text-ink">{result.route ?? "none"}</span>
      </div>
      {result.status === "ok" ? null : (
        <InlineAlert kind="error" title="The run did not finish">
          {result.error?.message ?? "No answer came back."} <span className="font-mono">({result.error?.code ?? result.status})</span>
        </InlineAlert>
      )}
      {stale ? (
        <InlineAlert kind="info" title="The questions changed since this run">
          These answers came from the saved draft. Run the preview again to see answers to your edited questions.
        </InlineAlert>
      ) : null}
      {showEdits && edited !== null ? (
        <InlineAlert kind="info" title="With your unsaved thresholds">
          Run band <strong>{edited.runBand}</strong>, overall <strong>{ACTION_LABEL[edited.overallAction]}</strong>, route{" "}
          <span className="font-mono">{edited.route ?? "none"}</span>. Highlighted cells below changed. No new call was made.
        </InlineAlert>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Decisions from the preview run</caption>
          <thead>
            <tr className="border-b border-rule text-xs uppercase tracking-wide text-ink-3">
              <th scope="col" className="py-1.5 pr-3 font-medium">Decision</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Answer</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Band</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Policy says</th>
              <th scope="col" className="py-1.5 font-medium">Shadow does</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const d = result.decisions[id];
              if (d === undefined) return null;
              const e = edited?.decisions[id];
              const band = e?.band ?? d.band;
              const action = e?.action ?? d.action;
              return (
                <tr key={id} className="border-b border-rule align-top last:border-b-0">
                  <td className="py-2 pr-3">
                    <div className="text-ink">{spec === null ? id : labelOf(spec, id)}</div>
                    <div className="font-mono text-xs text-ink-3">
                      {id}
                      {d.relevant ? "" : ", not relevant"}
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-ink">{d.kind === "composite" ? (typeof d.value === "number" ? d.value.toFixed(2) : "none") : answerSummary(result.answers[id])}</td>
                  <td className="py-2 pr-3">
                    <Changed before={d.band} after={band}>
                      <BandBadge band={band} />
                    </Changed>
                  </td>
                  <td className="py-2 pr-3">
                    <Changed before={d.action} after={action}>
                      {ACTION_LABEL[action]}
                    </Changed>
                  </td>
                  <td className="py-2 text-ink-2">{ACTION_LABEL[e?.effectiveAction ?? d.effectiveAction]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">
        System One cost {money(result.cost.systemOneCostUsd)}, estimated savings {money(result.cost.savingsUsd)}, {result.cost.latencyMs} ms
        {result.modelResolved === null ? "" : ` on ${result.modelResolved}`}. Logged as a console run in shadow.
      </p>
    </div>
  );
}

function DryView({ result }: { result: RunDryRunResult }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-2">
        No call was made. {result.model} on {result.provider}, request limit {result.limits.requestTokens.toLocaleString()} tokens.
      </p>
      <ul className="flex flex-col gap-1">
        {result.stages.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-2">
            <span className="font-mono text-ink">{s.id}</span>
            {s.skipped ? (
              <span className="text-ink-3">skipped: its condition is false for this state</span>
            ) : (
              <span className="text-ink-2">
                {s.batches.length === 1 ? "1 request" : `${s.batches.length} requests`}, about {s.batches.reduce((n, b) => n + b.estTokens, 0).toLocaleString()} tokens
              </span>
            )}
          </li>
        ))}
      </ul>
      {result.warnings.length === 0 ? null : (
        <InlineAlert kind="info" title="Preflight warnings">
          <ul className="list-disc pl-4">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <details>
        <summary className="cursor-pointer text-ink-2">The payload, after redaction</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-sm bg-paper-sunk p-3 font-mono text-xs text-ink">
          {JSON.stringify(
            result.stages.flatMap((s) => s.batches.map((b) => b.request)),
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

/**
 * Runs the saved draft on a sample state through set.run as `slug@draft`. A draft always runs in
 * shadow: logged, never acting. Saving comes first when there are unsaved edits, because the
 * server runs what is stored.
 */
export function PreviewPanel({ slug, inputSchema, recentRuns, synthetic, dirty, canSave, spec, last, onPreview, saveFirst }: {
  slug: string;
  inputSchema: unknown;
  recentRuns: readonly RecentRun[];
  synthetic: boolean;
  dirty: boolean;
  canSave: boolean;
  /** The spec in the editor, saved or not. Null while the JSON view does not parse. */
  spec: Spec | null;
  last: LastPreview | null;
  onPreview: (p: LastPreview) => void;
  /** Saves unsaved edits; resolves to the spec the draft now holds, or null when the save failed. */
  saveFirst: () => Promise<Spec | null>;
}) {
  const [text, setText] = useState(() => toJsonText(skeletonState(inputSchema)));
  const [source, setSource] = useState("manual");
  const [message, setMessage] = useState<{ kind: "error" | "info"; title: string; body?: string; details?: string[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const stored = readStored(slug);
    if (stored !== null) setText(stored);
  }, [slug]);

  const changeText = (t: string) => {
    setText(t);
    writeStored(slug, t);
  };

  function pickSource(value: string) {
    setSource(value);
    setMessage(null);
    if (value === "skeleton") changeText(toJsonText(skeletonState(inputSchema)));
    if (value.startsWith("run:")) {
      start(async () => {
        const res = await runStateAction(value.slice(4));
        if (res.status === "error") setMessage({ kind: "error", title: "Could not load that run", body: res.message });
        else if (res.state === null) setMessage({ kind: "info", title: "That run kept no state", body: "The set's storage mode did not store it. Pick another run or paste JSON." });
        else changeText(toJsonText(res.state));
      });
    }
  }

  function run(dryRun: boolean) {
    const parsed = checkJson(text);
    if (!parsed.ok) {
      setMessage({ kind: "error", title: "The sample state is not valid JSON", body: parsed.message });
      return;
    }
    setMessage(null);
    start(async () => {
      const ranSpec = await saveFirst();
      if (ranSpec === null) {
        setMessage({ kind: "error", title: "Save the draft first", body: "The preview runs the saved draft. Fix the save problem shown above, then run again." });
        return;
      }
      const res = await previewDraftAction(slug, parsed.value, dryRun);
      const at = new Date().toISOString();
      if (res.status === "ran") onPreview({ kind: "run", result: res.result, spec: ranSpec, state: parsed.value, at });
      else if (res.status === "dry") onPreview({ kind: "dry", result: res.result, at });
      else
        setMessage({
          kind: "error",
          title: res.status === "refused" ? "The preview was refused" : "The preview failed",
          body: res.message,
          ...(res.status === "refused" && res.details.length > 0 ? { details: res.details.map((d) => `${d.path || "/"}: ${d.message}`) } : {}),
        });
    });
  }

  const options = [
    { value: "manual", label: "My JSON below" },
    { value: "skeleton", label: "Empty state from the input schema" },
    ...recentRuns.map((r) => ({ value: `run:${r.id}`, label: `Run ${timeAgo(r.createdAt)}, ${r.runBand} band, ${r.source}${r.status === "ok" ? "" : `, ${r.status}`}` })),
  ];
  const needsSave = dirty && canSave;

  return (
    <Card title="Preview" description={<>Runs the saved draft once as <span className="font-mono">{slug}@draft</span>, in shadow. It is logged and never acts.</>}>
      <div className="flex flex-col gap-4">
        {synthetic ? (
          <InlineAlert kind="info" title="Synthetic answers">
            This server uses the fixture transport, so answers are made up. Bands and actions still follow your policy.
          </InlineAlert>
        ) : null}
        <Select label="Sample state" options={options} value={source} onChange={(e) => pickSource(e.target.value)} />
        <CodeEditor label="State (JSON)" rows={8} value={text} onChange={(t) => {
          setSource("manual");
          changeText(t);
        }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" pending={pending} onClick={() => run(false)}>
            {pending ? "Running..." : needsSave ? "Save and run preview" : "Run preview"}
          </Button>
          <Button pending={pending} onClick={() => run(true)}>
            Check payload only
          </Button>
        </div>
        {message === null ? null : (
          <InlineAlert kind={message.kind} title={message.title}>
            {message.body}
            {message.details === undefined ? null : (
              <ul className="mt-1 list-disc pl-4 font-mono text-xs">
                {message.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}
        {last === null ? (
          <p className="text-sm text-ink-3">No preview yet. Pick or paste a state, then run it. The answers stay on screen while you move the sliders.</p>
        ) : (
          <section aria-live="polite" className="flex flex-col gap-2 border-t border-rule pt-4">
            <h3 className="text-sm font-semibold text-ink">
              {last.kind === "run" ? "Preview run" : "Payload check"}{" "}
              <time dateTime={last.at} className="font-normal text-ink-3">
                {new Date(last.at).toLocaleTimeString()}
              </time>
            </h3>
            {last.kind === "run" ? <RunView preview={last} spec={spec} /> : <DryView result={last.result} />}
          </section>
        )}
      </div>
    </Card>
  );
}
