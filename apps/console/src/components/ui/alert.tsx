import type { ReactNode } from "react";

import { cx } from "./cx";

type Kind = "info" | "success" | "error";

const KINDS: Record<Kind, string> = {
  info: "border-info bg-info-wash text-ink",
  success: "border-good bg-good-wash text-ink",
  error: "border-danger bg-danger-wash text-ink",
};

/** An inline message. Errors are announced at once; the rest politely. */
export function InlineAlert({ kind = "info", title, children, className }: { kind?: Kind; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-sm border px-4 py-3 text-sm", KINDS[kind], className)}>
      {title === undefined ? null : <p className="font-medium">{title}</p>}
      {children === undefined ? null : <div className={title === undefined ? "" : "mt-1 text-ink-2"}>{children}</div>}
    </div>
  );
}
