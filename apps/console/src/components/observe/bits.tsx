import type { ReactNode } from "react";

import { CodeBlock, cx } from "~/components/ui";

/** A headline number with what it means. Big numbers take the display face. */
export function Stat({ label, value, hint, emphasis = false }: { label: string; value: string; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cx("rounded-md border border-bw-border bg-bw-surface px-4 py-3", emphasis && "border-l-[3px] border-l-bw-brand")}>
      <p className="bw-label">{label}</p>
      <p className="bw-display mt-1 text-[1.75rem] leading-[1.1] tabular-nums text-bw-text">{value}</p>
      {hint === undefined ? null : <p className="mt-1 text-xs text-bw-text-muted">{hint}</p>}
    </div>
  );
}

/** Label and value pairs, for run and review details. */
export function Facts({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="bw-label">{i.label}</dt>
          <dd className="mt-1 break-words text-sm text-bw-text">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pretty JSON in a scrolling box. */
export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <CodeBlock label={label} className="max-h-96">
      {JSON.stringify(value, null, 2)}
    </CodeBlock>
  );
}
