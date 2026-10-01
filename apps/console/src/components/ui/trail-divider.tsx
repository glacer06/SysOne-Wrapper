import { cx } from "./cx";

/** The trail motif as a divider: a dotted 3px line. Decorative, so hidden from screen readers. */
export function TrailDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cx("bw-trail", className)} />;
}
