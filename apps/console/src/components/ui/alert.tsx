import type { ReactNode } from "react";

import { cx } from "./cx";

type Kind = "info" | "success" | "error";

// DESIGN.md: a 3px band-colored rule on the left, a tinted background and a bold first phrase.
const KINDS: Record<Kind, string> = {
  info: "border-bw-border-strong bg-bw-surface-sunken",
  success: "border-bw-high bg-bw-high-bg",
  error: "border-bw-low bg-bw-low-bg",
};

/** An inline message. Errors are announced at once; the rest politely. */
export function InlineAlert({ kind = "info", title, children, className }: { kind?: Kind; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-r-sm border-l-[3px] px-4 py-3 text-sm leading-6 text-bw-text", KINDS[kind], className)}>
      {title === undefined ? null : <p className="font-semibold">{title}</p>}
      {children === undefined ? null : <div className={title === undefined ? "" : "mt-0.5"}>{children}</div>}
    </div>
  );
}
