"use client";

// REVIEW-A, "Split queue": the list on the left, the decision card with its ruler and the input on
// the right. J and K move, a number key picks a value, Enter confirms, D dismisses, and every
// resolve waits 6 seconds for Undo before it is sent. On a phone the list is the page and an item
// opens full screen. Every key has a button, so nothing needs the keyboard.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { RunRuler } from "~/components/observe/run-ruler";
import { Badge, BandBadge, Button, CodeBlock, cx, DecisionCard, InlineAlert, Select } from "~/components/ui";

import { settleQueueItem, type QueueSettle } from "./actions";
import { afterRemoving, queueCommand, step, UNDO_MS } from "./keys";
import type { QueueEntry } from "./queue-data";

const FAILURE_OPTIONS = [
  { value: "", label: "Not sure" },
  { value: "missing_evidence", label: "The state lacked the evidence" },
  { value: "model_error", label: "The model got it wrong" },
  { value: "code_error", label: "Our code or spec was wrong" },
  { value: "service", label: "A service problem" },
];

interface Pending {
  id: string;
  message: string;
  settle: QueueSettle;
}

/** The URL for the queue with `item` set or cleared, keeping the tab and filters. */
function urlWith(item: string | null): string {
  const url = new URL(window.location.href);
  if (item === null) url.searchParams.delete("item");
  else url.searchParams.set("item", item);
  url.searchParams.delete("done");
  return `${url.pathname}${url.search}`;
}

function Kbd({ children }: { children: string }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-bw-border-control px-1 font-mono text-[0.6875rem] text-bw-text">{children}</kbd>;
}

const KEYS: [string, string][] = [
  ["J", "Next item"],
  ["K", "Previous item"],
  ["1-9", "Pick a value"],
  ["Enter", "Confirm the picked value"],
  ["D", "Dismiss the item"],
  ["U", "Undo the last resolve"],
  ["?", "Show or hide these keys"],
];

export function ReviewQueue({ entries, initialId, startOpen }: { entries: readonly QueueEntry[]; initialId: string | null; startOpen: boolean }) {
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(initialId);
  const [open, setOpen] = useState(startOpen);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; p: Pending }>());
  const rows = useRef(new Map<string, HTMLButtonElement>());

  const visible = entries.filter((e) => !gone.has(e.id));
  const ids = visible.map((e) => e.id);
  const current = visible.find((e) => e.id === selected) ?? visible[0] ?? null;
  const value = current === null ? null : (picked[current.id] ?? current.agentJson ?? current.suggestedJson);

  const commit = useCallback(async (p: Pending) => {
    const t = timers.current.get(p.id);
    if (t !== undefined) clearTimeout(t.timer);
    timers.current.delete(p.id);
    setPending((all) => all.filter((x) => x.id !== p.id));
    const res = await settleQueueItem(p.settle);
    if (!res.ok) {
      setGone((g) => {
        const n = new Set(g);
        n.delete(p.id);
        return n;
      });
      setError(res.message);
    }
  }, []);

  // Leaving the page sends what is waiting: Undo is for the next 6 seconds, not a way to lose work.
  useEffect(() => {
    const all = timers.current;
    const warn = (e: BeforeUnloadEvent) => {
      if (all.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      for (const { p } of [...all.values()]) void commit(p);
    };
  }, [commit]);

  // The phone's back button closes an open item, because opening one pushed a history entry.
  useEffect(() => {
    const onPop = () => {
      const item = new URL(window.location.href).searchParams.get("item");
      setOpen(item !== null);
      if (item !== null) setSelected(item);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const show = useCallback((id: string | null, how: "replace" | "push") => {
    setSelected(id);
    if (id !== null) rows.current.get(id)?.scrollIntoView({ block: "nearest" });
    const url = urlWith(id);
    if (how === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(window.history.state, "", url);
  }, []);

  const settle = useCallback(
    (op: "decide" | "dismiss") => {
      if (current === null) return;
      let s: QueueSettle;
      let message: string;
      if (op === "dismiss") {
        s = { op: "dismiss", id: current.id, runId: current.runId };
        message = `Dismissed ${current.decisionId}.`;
      } else {
        const json = current.choices === null ? (free[current.id] ?? "").trim() : value;
        if (json === null || json === "") {
          setError("Type the right value first.");
          return;
        }
        if (current.choices !== null && !current.choices.some((c) => c.json === json)) {
          setError(`Pick the right value first, with a number key from 1 to ${Math.min(9, current.choices.length)} or a click.`);
          return;
        }
        const label = current.choices?.find((c) => c.json === json)?.label.replace(/ \(p [0-9.]+\)$/, "") ?? json;
        const fc = failure[current.id];
        if (current.status === "pending_confirmation") {
          s = { op: "confirm", id: current.id, runId: current.runId, ...(json === current.agentJson ? {} : { value: json }) };
          message = json === current.agentJson ? `Confirmed the agent's ${label}.` : `Saved ${label} instead of the agent's answer.`;
        } else {
          s = { op: "resolve", id: current.id, runId: current.runId, value: json, ...(fc === undefined || fc === "" ? {} : { failureClass: fc }) };
          message = `Resolved ${current.decisionId} as ${label}.`;
        }
      }
      setError(null);
      const next = afterRemoving(ids, current.id);
      setGone((g) => new Set(g).add(current.id));
      show(next, "replace");
      if (next === null) setOpen(false);
      const p: Pending = { id: current.id, message, settle: s };
      timers.current.set(p.id, { timer: setTimeout(() => void commit(p), UNDO_MS), p });
      setPending((all) => [...all.filter((x) => x.id !== p.id), p]);
    },
    [commit, current, failure, free, ids, show, value],
  );

  const undo = useCallback(() => {
    const last = pending[pending.length - 1];
    if (last === undefined) return;
    const t = timers.current.get(last.id);
    if (t !== undefined) clearTimeout(t.timer);
    timers.current.delete(last.id);
    setPending((all) => all.filter((x) => x.id !== last.id));
    setGone((g) => {
      const n = new Set(g);
      n.delete(last.id);
      return n;
    });
    show(last.id, "replace");
  }, [pending, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const cmd = queueCommand(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: t === null ? null : { tagName: t.tagName, isContentEditable: t.isContentEditable, type: (t as HTMLInputElement).type, role: t.getAttribute("role") } },
        current?.choices?.length ?? 0,
      );
      if (cmd === null) return;
      // A modal dialog or a menu elsewhere on the page keeps its own keys.
      if (t !== null && t.closest("[aria-modal=true],dialog,[role=menu]") !== null) return;
      e.preventDefault();
      switch (cmd.type) {
        case "next":
        case "prev":
          show(step(ids, current?.id ?? null, cmd.type === "next" ? 1 : -1), "replace");
          break;
        case "pick": {
          const c = current?.choices?.[cmd.index];
          if (current !== null && c !== undefined) setPicked((p) => ({ ...p, [current.id]: c.json }));
          break;
        }
        case "confirm":
          if (current?.settled === null) settle("decide");
          break;
        case "dismiss":
          if (current?.status === "open") settle("dismiss");
          break;
        case "undo":
          undo();
          break;
        case "help":
          setHelp((h) => !h);
          break;
        case "close":
          setHelp(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, ids, settle, show, undo]);

  const toast = pending[pending.length - 1];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:gap-8">
      <section aria-label="Queue" className={cx("min-w-0", open && "max-lg:hidden")}>
        <p className="mb-2 text-sm text-bw-text-muted" aria-live="polite">
          {visible.length === 0 ? "Queue clear." : `${visible.length} ${visible.length === 1 ? "item" : "items"} on this page`}
        </p>
        {visible.length === 0 ? null : (
          <ul className="flex flex-col border-y border-bw-border lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
            {visible.map((e) => {
              const isCurrent = e.id === current?.id;
              return (
                <li key={e.id} className="border-b border-bw-border last:border-b-0">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el === null) rows.current.delete(e.id);
                      else rows.current.set(e.id, el);
                    }}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => {
                      setOpen(true);
                      show(e.id, "push");
                    }}
                    className={cx(
                      "flex min-h-11 w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors duration-(--bw-dur-fast) hover:bg-bw-surface-sunken focus-visible:outline-offset-[-2px]",
                      isCurrent && "bg-bw-surface-sunken shadow-[inset_1px_0_0_var(--bw-text)]",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <BandBadge band={e.band} score={e.score} />
                      <span className="min-w-0 truncate font-mono text-xs text-bw-text">{e.setLabel}</span>
                      <span className="ml-auto text-xs whitespace-nowrap text-bw-text-muted">{e.age}</span>
                    </span>
                    <span className="text-sm text-bw-text">
                      <span className="font-mono text-xs">{e.decisionId}</span>
                      <span className="text-bw-text-muted">: {e.reason}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 hidden text-xs text-bw-text-muted sm:block">
          <Kbd>J</Kbd> <Kbd>K</Kbd> move, <Kbd>?</Kbd> shows every key.
        </p>
      </section>

      <section aria-label="Item" className={cx("min-w-0", !open && "max-lg:hidden")}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            window.history.pushState(null, "", urlWith(null));
          }}
          className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-bw-brand-text underline underline-offset-2 lg:hidden"
        >
          <span aria-hidden>&larr;</span> Back to the queue
        </button>
        {error === null ? null : (
          <InlineAlert kind="error" className="mb-4">
            {error}
          </InlineAlert>
        )}
        {current === null ? (
          <div className="rounded-md border border-bw-border px-6 py-10">
            <p className="font-semibold text-bw-text">Queue clear.</p>
            <p className="mt-1 text-sm text-bw-text-muted">Each answer you gave is now a labeled decision. Undo stays open for 6 seconds after the last one.</p>
          </div>
        ) : (
          <ItemPane
            entry={current}
            value={value}
            free={free[current.id] ?? ""}
            failure={failure[current.id] ?? ""}
            onPick={(json) => setPicked((p) => ({ ...p, [current.id]: json }))}
            onFree={(text) => setFree((f) => ({ ...f, [current.id]: text }))}
            onFailure={(fc) => setFailure((f) => ({ ...f, [current.id]: fc }))}
            onConfirm={() => settle("decide")}
            onDismiss={() => settle("dismiss")}
          />
        )}
      </section>

      {help ? (
        <div role="dialog" aria-label="Review keys" className="fixed right-4 bottom-24 z-40 w-72 rounded-md border border-bw-border bg-bw-surface p-4 shadow-(--bw-shadow-overlay)">
          <p className="bw-label mb-3">Keys</p>
          <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-2 text-sm">
            {KEYS.map(([k, what]) => (
              <div key={k} className="contents">
                <dt>
                  <Kbd>{k}</Kbd>
                </dt>
                <dd className="text-bw-text">{what}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-bw-text-muted">Keys do nothing while you type in a field.</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setHelp(false)}>
            Close
          </Button>
        </div>
      ) : null}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex justify-end lg:bottom-4">
        {toast === undefined ? null : (
          <div role="status" className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-sm border border-bw-high bg-bw-surface py-1 pr-1 pl-4 text-sm text-bw-text shadow-(--bw-shadow-overlay)">
            <span className="flex-1">
              {toast.message}
              {pending.length > 1 ? <span className="text-bw-text-muted"> {pending.length - 1} more waiting.</span> : null}
            </span>
            <button type="button" onClick={undo} className="inline-flex min-h-11 items-center gap-2 rounded-sm px-3 font-semibold text-bw-brand-text hover:bg-bw-high-bg">
              Undo <Kbd>U</Kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemPane({ entry, value, free, failure, onPick, onFree, onFailure, onConfirm, onDismiss }: {
  entry: QueueEntry;
  value: string | null;
  free: string;
  failure: string;
  onPick: (json: string) => void;
  onFree: (text: string) => void;
  onFailure: (fc: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const agentAnswered = entry.status === "pending_confirmation";
  const base = entry.agentJson ?? entry.suggestedJson;
  const changed = entry.choices !== null && value !== base;
  const pickedLabel = entry.choices?.find((c) => c.json === value)?.label.replace(/ \(p [0-9.]+\)$/, "") ?? null;
  const confirmLabel = agentAnswered ? (changed ? `Save ${pickedLabel ?? "my answer"}` : `Confirm ${entry.agentLabel ?? ""}`) : (pickedLabel === null ? "Pick a value first" : `Confirm ${pickedLabel}`);

  return (
    <div className="flex flex-col gap-6">
      <DecisionCard
        state={entry.stateLine}
        aside={<Badge tone={agentAnswered ? "info" : "neutral"}>{agentAnswered ? "Agent answered" : entry.kind === "label" ? "Labeling sample" : "Policy sent it"}</Badge>}
        band={entry.band}
        score={entry.score}
        {...(entry.confidence === null ? {} : { bandNote: entry.confidence })}
        why={
          <>
            <span className="font-mono text-xs">{entry.decisionId}</span> on <span className="font-mono text-xs">{entry.setLabel}</span>. {entry.reason}.
          </>
        }
        cost={entry.cost ?? "Not known: the run could not be read."}
      />

      {entry.ruler === null ? null : (
        <section aria-label="Where it sits on the set's lines">
          <RunRuler group={entry.ruler} showKey={false} title="Where it sits on the set's lines" />
        </section>
      )}

      {entry.settled !== null ? (
        <p className="border-t border-bw-border pt-5 text-sm text-bw-text">{entry.settled}</p>
      ) : (
      <section aria-labelledby={`pick-${entry.id}`} className="flex flex-col gap-4 border-t border-bw-border pt-5 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:border-t max-lg:bg-bw-bg max-lg:px-4 max-lg:pb-4">
        <h2 id={`pick-${entry.id}`} className="text-sm font-semibold text-bw-text">
          {agentAnswered ? `The agent answered ${entry.agentLabel ?? ""}. The run said ${entry.suggestedLabel}.` : `The run said ${entry.suggestedLabel}. What is right?`}
        </h2>
        {entry.choices === null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-bw-text">The right value</span>
              <span className="text-xs text-bw-text-muted">JSON, for example a number or &quot;option_key&quot;. Enter saves it.</span>
              <input
                value={free}
                onChange={(e) => onFree(e.target.value)}
                className="h-11 rounded-sm border border-bw-border-control bg-bw-surface px-3 font-mono text-sm text-bw-text"
              />
            </label>
          </form>
        ) : (
          <div role="radiogroup" aria-label="The right value" className="flex flex-wrap gap-2">
            {entry.choices.map((c, i) => {
              const on = c.json === value;
              return (
                <button
                  key={c.json}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(c.json)}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm transition-colors duration-(--bw-dur-fast)",
                    on ? "border-bw-text bg-bw-surface-sunken font-semibold text-bw-text" : "border-bw-border-control text-bw-text hover:bg-bw-surface-sunken",
                  )}
                >
                  {i < 9 ? <Kbd>{String(i + 1)}</Kbd> : null}
                  {c.label}
                  {c.json === entry.suggestedJson ? <span className="text-xs font-normal text-bw-text-muted">run said</span> : null}
                </button>
              );
            })}
          </div>
        )}
        {changed && !agentAnswered ? (
          <div className="max-w-sm">
            <Select label="Why it was wrong" hint="Optional. It groups misses when you tune the set." options={FAILURE_OPTIONS} value={failure} onChange={(e) => onFailure(e.target.value)} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onConfirm} disabled={entry.choices !== null && pickedLabel === null}>
            {confirmLabel}
          </Button>
          {entry.status === "open" ? <Button onClick={onDismiss}>Dismiss</Button> : null}
          <p className="ml-1 hidden text-xs text-bw-text-muted sm:block">
            <Kbd>Enter</Kbd> confirms, <Kbd>D</Kbd> dismisses. Undo for 6 seconds.
          </p>
        </div>
      </section>
      )}

      <section aria-label="What the run saw" className="flex flex-col gap-2">
        <h2 className="bw-label">What the run saw</h2>
        {entry.state === null ? (
          <p className="text-sm text-bw-text-muted">
            {entry.runLoaded ? "Not stored. This set keeps a hash of the state only, so judge from the answer and the run." : "The run could not be read."}
          </p>
        ) : (
          <CodeBlock label="Run state" className="max-h-96">
            {entry.state}
          </CodeBlock>
        )}
        {entry.stateCut ? <p className="text-xs text-bw-text-muted">Cut at 20,000 characters. The run page shows all of it.</p> : null}
        {entry.runId === null ? null : (
          <Link href={`/runs/${entry.runId}`} className="inline-flex min-h-11 items-center self-start text-sm text-bw-brand-text underline underline-offset-2">
            Open the run
          </Link>
        )}
      </section>
    </div>
  );
}
