// How the supplied unloaded side-view ant (brand/unloaded/bandwise-ant-unloaded-A-r4-right-*.svg)
// becomes inline SVG for the walk on the worked-example ruler. Every path, transform, fill and
// pivot stays exactly as supplied. Only the wrapping changes, so CSS can move the leg groups:
//
// - the XML prolog and the title go (the drawing is decorative, aria-hidden);
// - the `ns0:` prefix goes, since the HTML parser reads only unprefixed SVG;
// - each `id` becomes a `class`, so the light and dark copies never repeat an id;
// - each leg group gets its own `data-pivot-x` and `data-pivot-y` as its transform-origin;
// - the viewBox crops to the ant, above the trail, which CSS also hides.
//
// test/unloaded-ant.test.ts checks that the generated module still matches the brand files.
// To regenerate after a brand kit update, run `pnpm --filter @bandwise/web brand:ant`.

/** The ant's box inside the 1400 by 1400 drawing, clear of the trail dots below the feet. */
export const ANT_CROP = { x: 236, y: 518, width: 1014, height: 357 } as const;

export function inlineUnloadedAnt(svg: string): string {
  const { x, y, width, height } = ANT_CROP;
  return svg
    .replace(/^<\?xml[^>]*\?>\s*/, "")
    .replaceAll("ns0:", "")
    .replace("xmlns:ns0=", "xmlns=")
    .replace(/\s*<title>[^<]*<\/title>/, "")
    .replace(/ viewBox="0 0 1400 1400" width="1400" height="1400"/, ` viewBox="${x} ${y} ${width} ${height}" aria-hidden="true" focusable="false"`)
    .replaceAll(' id="', ' class="')
    .replace(/ data-pivot-x="([\d.]+)" data-pivot-y="([\d.]+)"/g, ' data-pivot-x="$1" data-pivot-y="$2" style="transform-origin:$1px $2px"')
    .trim();
}
