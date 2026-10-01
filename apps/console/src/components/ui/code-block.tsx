import type { ReactNode } from "react";

import { cx } from "./cx";

/** Mono text on the sunken surface, scrolling inside its own box. Focusable so keys can scroll it. */
export function CodeBlock({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cx("overflow-auto rounded-sm border border-bw-border bg-bw-surface-sunken p-4 font-mono text-[0.8125rem] leading-[1.6] text-bw-text", className)}
    >
      {children}
    </pre>
  );
}
