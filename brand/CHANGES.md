# bandwise kit v1.7 (2026-10-01)

From PJ, via Nick. Checked file by file against v1.6. Tokens (CSS and JSON), components CSS, the motion demo, every layer SVG, every unloaded SVG and README, and the standalone mark A, mark C and B monogram SVGs are byte-identical to v1.6.

Changed files:

1. Horizontal and stacked lockups, A and C, light and dark, SVG and PNG (16 files). The ant mark is 40% smaller next to the wordmark, which is unchanged. The ant paths are the same; each mark sits in a `scale(0.6)` group, and the canvas is cropped to fit. New sizes (viewBox and PNG): horizontal A `53 165 1798 408`, 1800 by 408 (was 2168 by 744, 1800 by 618). Horizontal C `57 166 1650 406`, 1800 by 443 (was 1926 by 744, 1800 by 695). Stacked A PNG 1241 by 1025 (was 1241 by 1400). Stacked C PNG 1091 by 993 (was 1091 by 1400).
2. New `marks/bandwise-lockup-horizontal-side-{light,dark}.{svg,png}`: a small side-view ant before the wordmark. The kit's README says the ant was traced from the version-1 screenshot because the original master was lost, so fine detail is limited. Clear space for this option is half the wordmark height; the minimum is 160px wide.
3. PNG exports with new bytes but the same pixels (checked by decoding): marks A and C, the B monogram, app icons, avatars, favicons 16 to 512, the apple-touch icon and all eight unloaded PNGs.
4. Text: the kit's DESIGN.md says the lockup marks are 40% smaller, that each lockup is one unit whose parts are never resized separately, and adds the side-ant clear space and an "Implementation" note (any harness or IDE). BRAND-VOICE.md changes only its version line. The kit now has a README.md. The guide drops the names of the earlier identity directions and the "STILL OPEN" box on its handoff page.

Not taken from the kit:

- The kit's DESIGN.md, README and guide still say site and app headers may use the typed wordmark alone with no ant. Nick picked the primary lockup (horizontal A) as the header logo on www, the console and the docs (root `DESIGN.md`).
- The kit's components CSS still has the 3px alert rule. `.bw-alert` keeps the local 1px rule (ALERT-1PX).
- The kit's README.md and CHANGES.md stay out; this folder keeps its own.

Still open in the supplied files, unchanged from v1.6: no section on the B outline in the kit or the guide; `unloaded/bandwise-ant-unloaded-A-r4-README.md` still mentions 1000 by 1000 theme-background previews that the kit does not ship; the kit's DESIGN.md still places the ruler segments at 0.55 and 0.80 while calling those values examples; the guide's handoff table still does not list `unloaded/`.

Copies in the apps: `apps/web/public/brand` now serves the v1.7 horizontal A and C lockups (header, footer and brand moment), and `apps/console/public/brand` and `apps/docs/public/brand` serve horizontal A for the header.

The guide PDF (`bandwise-brand-guidelines-v1.7.pdf`, 26 pages) belongs in Drive, not in git.

# bandwise kit v1.6 (2026-10-01)

From PJ, via Nick. Checked file by file against v1.5. Tokens (CSS and JSON), components CSS, marks, lockups, the B monogram, icons, favicons, social images, the motion demo and every PNG are byte-identical to v1.5.

Changed files:

1. `layers/bandwise-mark-A-{light,dark}-load.svg`: the viewBox is now `89.59 90.0 1104.72 1155.0`, the same as the ant layers and the full mark A. Before, the load layers stopped at a height of 1044.77. Paths and colors unchanged.
2. `unloaded/*.svg` (all eight): the six leg groups have neutral names, the same in A and C: `leg-front-1`, `leg-front-2`, `leg-middle-1`, `leg-middle-2`, `leg-rear-1`, `leg-rear-2`. A far becomes 1 and near becomes 2. C left becomes 1 and right becomes 2. Only the `id` values changed. Paths, transforms, pivots and the A resting-pose wrappers (`front-far-pose`, `front-near-pose`) are unchanged.
3. `unloaded/README.md`: the C viewBox note now reads 1200 square, which matches the files, and a section maps the v1.5 leg names to the new ones. `unloaded/bandwise-ant-unloaded-A-r4-README.md` lists the new leg names.

Written rules (guide PDF and the kit's DESIGN.md and BRAND-VOICE.md): Bandwise and bandwise are both fine in prose, one form per document, and logo lettering stays lowercase. Violet for Medium is final.

Not taken from the kit:

- The kit's DESIGN.md and BRAND-VOICE.md say site and app headers may use the typed wordmark alone with no ant. The repo keeps Nick's header pairing: the unloaded A ant facing right beside the typed wordmark (root `DESIGN.md`).
- The kit's components CSS still has the 3px alert rule. `.bw-alert` keeps the local 1px rule (ALERT-1PX).
- No section on the B outline is in the kit or the guide. The rules for the faceted B as a graphic stay in the root `DESIGN.md`.

Still mismatched in the supplied files: `unloaded/bandwise-ant-unloaded-A-r4-README.md` mentions 1000 by 1000 theme-background previews that the kit does not ship. The kit's DESIGN.md still places the ruler segments at 0.55 and 0.80 while calling those values examples. The guide's handoff page does not list `unloaded/`.

The guide PDF (`bandwise-brand-guidelines-v1.6.pdf`, 26 pages) belongs in Drive, not in git.

# bandwise kit v1.5 (2026-10-01)

From PJ, via Nick. Artwork only: tokens, components, the motion demo, the B monogram and favicons are unchanged.

1. Pointed feet on the ant in marks A and C, loaded and unloaded (from v1.4).
2. Mark A's curved trail follows the original dot-center route: 18 equal circles evenly spaced, no gaps under the feet. Feet raised slightly to clear it. Updated marks A and C, ant layers, lockups, app icons and avatars, and social images.
3. New `unloaded/`: the ant without the B, side view A and top view C, facing right or up-right, light and dark, SVG and PNG. Each SVG separates the body and six legs with pivot metadata for animation. A carries a straight trail of 18 equal dots and the teal endpoint; C has no trail. Static, animation-ready art, not a finished walk cycle.

Local, not from the kit: `.bw-alert` keeps the 1px rule (Nick, ALERT-1PX).

# bandwise kit v1.2 changes

Fixed (contrast and tokens)
1. Dark medium text #8B7CF6 -> #A498F9 (4.14 -> 5.53 on the badge tint). --bw-medium unchanged for fills.
2. New --bw-border-control: light #7E8E93 (3.40 on white, 3.10 on page), dark #66777C (3.66 on surface, 3.98 on page). Inputs and secondary buttons use it. border and border-strong stay for hairlines.
3. Ruler marker has a 1px page-colored halo each side.
6. New --bw-shadow-overlay (light and dark) and .bw-overlay-surface. Overlays only.
8. Layered SVGs in layers/: ant and load separate for marks A and C, light and dark. Paths unchanged, only split.
9. JSON: "SF Mono" added to mono stack, overlay and shadow-overlay tokens added, band values labeled as examples (DESIGN.md too).
4. Chamfered buttons and badges: focus ring follows the chamfer polygon (wrap in .bw-focus-poly), 2px gap in the page color plus 2px ring, visible in both themes.
5. Decision cards are chamfered (wrap in .bw-decision-wrap). DESIGN.md and CSS now agree.

Not changed: text levels (text and text-muted only), OG numbers (examples until real receipts exist).
