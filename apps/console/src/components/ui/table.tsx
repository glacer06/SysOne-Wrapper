import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cx } from "./cx";

/** A ruled table that scrolls sideways inside its own box on narrow screens. */
export function Table({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule">
      <table className="w-full border-collapse text-left text-sm">
        {caption === undefined ? null : <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx("border-b border-rule bg-paper-sunk px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-3", className)}
      {...rest}
    />
  );
}

export function Td({ className, numeric = false, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cx("border-b border-rule px-4 py-2.5 text-ink", numeric && "text-right font-mono tabular-nums", className)} {...rest} />;
}
