# Marketing site design

The www site (`apps/web`, www.bandwise.dev) follows the Bandwise design system. This folder holds no design rules of its own.

- The spec is the root `DESIGN.md`, with `BRAND-VOICE.md` for copy.
- The decision is ADR-022 (`docs/adr/022-brand-and-design-system-v1.md`). It replaced the earlier warm "survey instrument" identity that lived in this file.
- Tokens and reference components come from the `@bandwise/brand` workspace package (`brand/`). `src/app/layout.tsx` imports `tokens.css`, then `theme.css`, then `src/app/global.css`, which reads only the `--bw-*` semantic layer.
- Marks, icons and the social image are copies of the supplied files in `brand/`. The ant and load layers in `public/brand/scout-*.svg` are the Scout mark (C) split into two layers, as in `brand/bandwise-motion-demo.html`, so the ant can walk the ruler.

What is specific to www:

- The confidence ruler may show the log-line pager template's thresholds, labelled as an example. Product UI draws each set's own thresholds.
- Every number comes from `docs/marketing/claims.md` or from the core price book, with its caveat beside it.
