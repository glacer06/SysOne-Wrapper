import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cx } from "./cx";

/** A ruled table that scrolls sideways inside its own box on narrow screens. Numbers are mono. */
export function Table({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-bw-border bg-bw-surface">
      <table className="w-full border-collapse text-left text-sm [&_tbody_tr:last-child>td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-bw-surface-sunken">
        {caption === undefined ? null : <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cx("bw-label border-b border-bw-border-strong px-4 py-3 whitespace-nowrap", className)} {...rest} />;
}

export function Td({ className, numeric = false, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cx("border-b border-bw-border px-4 py-3 text-bw-text", numeric && "text-right font-mono tabular-nums", className)} {...rest} />;
}
