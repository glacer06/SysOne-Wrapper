// A SpecDiff as people read it: one row per changed field with its before and after value, and
// the interface changes on top. No hooks, so server and client components both render it.

import type { SpecDiff } from "@bandwise/core";

import { Badge } from "~/components/ui";

const OP_LABEL = { add: "Added", remove: "Removed", replace: "Changed" } as const;
const MAX_VALUE = 600;

function show(value: unknown): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}\n...` : text;
}

/** "/stages/0/questions/needs_reply/meta/label" reads as "stages › 0 › questions › needs_reply › meta › label". */
function readablePath(path: string): string {
  if (path === "") return "(whole spec)";
  return path
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(" › ");
}

export function SpecDiffView({ diff }: { diff: SpecDiff }) {
  const { breaking, additive } = diff.interface;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-bw-text-muted">
        <span className="font-mono text-bw-text">{diff.from}</span> to <span className="font-mono text-bw-text">{diff.to}</span>:{" "}
        {diff.changes.length === 0 ? "no changes." : `${diff.changes.length} ${diff.changes.length === 1 ? "change" : "changes"}.`}
      </p>
      {breaking.length > 0 ? (
        <div className="rounded-sm border border-bw-low bg-bw-low-bg px-3 py-2 text-sm">
          <p className="font-medium text-bw-text">Breaking interface changes</p>
          <ul className="mt-1 list-disc pl-5 text-bw-text-muted">
            {breaking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {additive.length > 0 ? (
        <p className="text-sm text-bw-text-muted">
          Interface additions: <span className="text-bw-text">{additive.join(", ")}</span>
        </p>
      ) : null}
      {diff.changes.length === 0 ? null : (
        <ol className="flex flex-col divide-y divide-bw-border rounded-md border border-bw-border">
          {diff.changes.map((c) => (
            <li key={`${c.op}:${c.path}`} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={c.op === "add" ? "good" : c.op === "remove" ? "danger" : "info"}>{OP_LABEL[c.op]}</Badge>
                <span className="font-mono text-xs break-all text-bw-text">{readablePath(c.path)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {c.op === "add" ? null : <Value label="Before" text={show(c.before)} />}
                {c.op === "remove" ? null : <Value label="After" text={show(c.after)} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Value({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-bw-text-muted">{label}</p>
      <pre className="mt-1 max-h-60 overflow-auto rounded-sm bg-bw-surface-sunken px-2 py-1.5 font-mono text-xs whitespace-pre-wrap break-words text-bw-text">{text}</pre>
    </div>
  );
}
