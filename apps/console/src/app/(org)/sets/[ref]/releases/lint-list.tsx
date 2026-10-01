import type { ErrorDetail } from "@bandwise/core";

import { Badge } from "~/components/ui";

/** Lint results or error details: errors first, each with its rule id and where in the spec. */
export function LintList({ items }: { items: readonly ErrorDetail[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => rank(a.severity) - rank(b.severity));
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((d, i) => (
        <li key={`${d.rule}:${d.path}:${i}`} className="flex flex-col gap-1 rounded-sm border border-rule px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={d.severity === "error" ? "danger" : "neutral"}>{d.severity === "error" ? "Error" : "Warning"}</Badge>
            <code className="font-mono text-xs text-ink-2">{d.rule}</code>
            {d.path === "" ? null : <code className="font-mono text-xs break-all text-ink-3">{d.path}</code>}
          </div>
          <p className="text-ink">{d.message}</p>
        </li>
      ))}
    </ul>
  );
}

function rank(severity: ErrorDetail["severity"]): number {
  return severity === "error" ? 0 : 1;
}
