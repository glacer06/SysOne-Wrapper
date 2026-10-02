import Image from "next/image";
import Link from "next/link";

import { cx } from "../ui/cx";

// The primary lockup for the top-left, and the supplied mark A (Ascent) for the places where the
// ant appears at size: the sign-in pages and first-time empty states. Mark files come from
// brand/marks, copied to public/brand, never redrawn or recolored. Each comes as a file for light
// backgrounds and one for dark; CSS shows the one for the theme (globals.css, .bw-for-*).

/** Mark A's viewBox is 1104.72 by 1155 (brand kit v1.6 and later). */
const MARK_A_RATIO = 1155 / 1104.72;

/** The horizontal lockup A's viewBox is 1798 by 408 (kit v1.7). */
const LOCKUP_A = { width: 1798, height: 408 };

/**
 * The header logo (Nick, 2026-10-01): the supplied primary lockup, mark A (the loaded ant on its
 * trail, carrying the B) with the lowercase wordmark, as a link to the console home. 168px wide in
 * the sidebar and 160px, the lockup's minimum, in the phone header (globals.css, .bw-header-logo).
 * The images are decorative; the link's label carries the name.
 */
export function HeaderLogo({ href = "/sets", size = "md", label = "Bandwise console home" }: { href?: string; size?: "sm" | "md"; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="inline-flex min-h-10 shrink-0 items-center rounded-sm max-md:min-h-11">
      <span className={cx("bw-header-logo", size === "sm" ? "w-[160px]" : "w-[168px]")} aria-hidden="true">
        <Image src="/brand/bandwise-lockup-horizontal-A-light.svg" width={LOCKUP_A.width} height={LOCKUP_A.height} alt="" unoptimized priority className="bw-for-light" />
        <Image src="/brand/bandwise-lockup-horizontal-A-dark.svg" width={LOCKUP_A.width} height={LOCKUP_A.height} alt="" unoptimized priority className="bw-for-dark" />
      </span>
    </Link>
  );
}

/** Mark A, the ant climbing the trail with the B. Decorative unless given an `alt`. */
export function MarkA({ width, alt = "", priority = false, className }: { width: number; alt?: string; priority?: boolean; className?: string }) {
  const height = Math.round(width * MARK_A_RATIO);
  return (
    <span className={cx("inline-flex", className)}>
      <Image src="/brand/bandwise-mark-A-light.svg" width={width} height={height} alt={alt} unoptimized priority={priority} className="bw-for-light" />
      <Image src="/brand/bandwise-mark-A-dark.svg" width={width} height={height} alt={alt} unoptimized priority={priority} className="bw-for-dark" />
    </span>
  );
}
