import type { ReactNode } from "react";

import { cx } from "~/components/ui";

/** A headline number with what it means. */
export function Stat({ label, value, hint, emphasis = false }: { label: string; value: string; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cx("rounded-md border border-rule bg-paper-raised px-4 py-3", emphasis && "border-signal")}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums text-ink">{value}</p>
      {hint === undefined ? null : <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** Label and value pairs, for run and review details. */
export function Facts({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pretty JSON in a scrolling box. */
export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <pre aria-label={label} tabIndex={0} className="max-h-96 overflow-auto rounded-sm bg-paper-sunk p-3 font-mono text-xs leading-5 text-ink">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
