import Image from "next/image";

// The supplied mark files (brand/marks, copied to public/brand). Never redrawn or recolored.
// Each comes as a file for light backgrounds and one for dark; CSS shows the one for the theme.

/** Horizontal lockup C (Scout) is 1926 by 744. DESIGN.md: at least 160px wide. */
const LOCKUP_RATIO = 744 / 1926;
/** The B monogram is 203.33 by 306.67. DESIGN.md: at least 16px. */
const MONOGRAM_RATIO = 203.33 / 306.67;

function Pair({ name, width, height, alt }: { name: string; width: number; height: number; alt: string }) {
  return (
    <>
      <Image src={`/brand/${name}-light.svg`} width={width} height={height} alt={alt} unoptimized priority className="bw-for-light" />
      <Image src={`/brand/${name}-dark.svg`} width={width} height={height} alt={alt} unoptimized priority className="bw-for-dark" />
    </>
  );
}

/** The horizontal lockup: the ant mark with the wordmark. `width` stays at or above 160. */
export function Lockup({ width = 168 }: { width?: number }) {
  const w = Math.max(160, width);
  return (
    <span className="inline-flex">
      <Pair name="bandwise-lockup-horizontal-C" width={w} height={Math.round(w * LOCKUP_RATIO)} alt="Bandwise" />
    </span>
  );
}

/** The B monogram for small spaces, such as the phone header. `height` stays at or above 16. */
export function Monogram({ height = 28, label = "Bandwise" }: { height?: number; label?: string }) {
  const h = Math.max(16, height);
  return (
    <span className="inline-flex">
      <Pair name="bandwise-b-monogram" width={Math.round(h * MONOGRAM_RATIO)} height={h} alt={label} />
    </span>
  );
}
