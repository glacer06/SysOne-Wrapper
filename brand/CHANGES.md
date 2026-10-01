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
