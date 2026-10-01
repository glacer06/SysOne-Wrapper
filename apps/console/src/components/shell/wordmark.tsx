import Image from "next/image";
import Link from "next/link";

import { cx } from "../ui/cx";

// The typed wordmark for the top-left, and the supplied mark A (Ascent) for the places where the
// ant appears at size: the sign-in pages and first-time empty states. Mark files come from
// brand/marks, copied to public/brand, never redrawn or recolored. Each comes as a file for light
// backgrounds and one for dark; CSS shows the one for the theme (globals.css, .bw-for-*).

/** Mark A's viewBox is 1104.72 by 1044.77. */
const MARK_A_RATIO = 1044.77 / 1104.72;

/**
 * The header pairing (Nick, 2026-10-01): the unloaded side-view ant facing right, from
 * brand/unloaded, then the lowercase "bandwise" in Archivo display, as a link to the console home.
 * The ant box crops the supplied drawing to the ant above its trail (globals.css, .bw-header-ant).
 * The ant is decorative; the link's label carries the name.
 */
export function Wordmark({ href = "/sets", size = "md", label = "Bandwise console home" }: { href?: string; size?: "sm" | "md"; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="inline-flex min-h-10 items-center rounded-sm max-md:min-h-11">
      <span className={cx("bw-wordmark-pair", size === "sm" ? "text-[1.125rem]" : "text-[1.25rem]")}>
        <span className="bw-header-ant" aria-hidden="true">
          <Image src="/brand/bandwise-ant-unloaded-A-r4-right-light.svg" width={64} height={64} alt="" unoptimized priority className="bw-for-light" />
          <Image src="/brand/bandwise-ant-unloaded-A-r4-right-dark.svg" width={64} height={64} alt="" unoptimized priority className="bw-for-dark" />
        </span>
        <span className="bw-wordmark">bandwise</span>
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
