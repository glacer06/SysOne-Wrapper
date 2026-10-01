import { cx } from "../ui/cx";

// The faceted B as a wireframe. The nine paths are the supplied monogram's own path data
// (brand/marks/bandwise-b-monogram-*.svg), copied unchanged: same geometry, no added facets.
// Drawn with no fill and a dotted trail stroke (globals.css, .bw-bwire), so it never stands in
// for the filled B, which keeps its supplied colors wherever it is shown filled.

const B_PATHS = [
  "M600.00,395.00L621.67,416.67L768.33,416.67L803.33,380.00L803.33,283.33L771.67,253.33L803.33,226.67L803.33,155.00L755.00,110.00L600.00,110.00ZM666.67,178.33L730.00,178.33L730.00,230.67L666.67,230.67ZM666.67,305.00L730.00,305.00L730.00,354.00L666.67,354.00Z",
  "M600.00,110.00L666.67,178.33L755.00,110.00Z",
  "M666.67,354.00L698.33,368.33L748.33,376.67L721.67,354.00Z",
  "M666.67,178.33L730.00,178.33L755.00,156.67L755.00,110.00Z",
  "M771.67,256.67L635.00,270.00L666.67,305.00L730.00,305.00Z",
  "M635.00,270.00L638.33,378.33L666.67,354.00L666.67,305.00Z",
  "M755.00,110.00L755.00,156.67L730.00,178.33L730.00,230.67L771.67,253.33L803.33,226.67L803.33,155.00Z",
  "M771.67,256.67L730.00,305.00L730.00,354.00L751.67,416.67L768.33,416.67L803.33,380.00L803.33,283.33Z",
  "M638.33,378.33L621.67,416.67L751.67,416.67L748.33,376.67L698.33,354.00L666.67,354.00Z",
] as const;

/** Decorative only. Size and position come from `className`. */
export function BWireframe({ className }: { className?: string }) {
  return (
    <svg className={cx("bw-bwire", className)} viewBox="600 110 203.33 306.67" aria-hidden="true" focusable="false">
      {B_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
