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
