# brand

The Bandwise brand kit v1.7 (ADR-022; changes in `CHANGES.md`). The written spec is `DESIGN.md` and `BRAND-VOICE.md` at the repo root. This folder holds the files they point to.

| Path | What |
|---|---|
| `tokens/bandwise-tokens.css` | CSS variables: primitives plus the light and dark semantic layer (`--bw-*`). Components read only the semantic layer |
| `tokens/bandwise-tokens.json` | The same tokens in DTCG format |
| `tokens/bandwise-components.css` | Reference CSS for the button, input, band badge, decision card, confidence ruler, table, tabs, alert, code block, tooltip and trail divider |
| `marks/` | `mark-A` (Ascent, primary), `mark-C` (Scout, compact), the `b-monogram`, the horizontal and stacked lockups, and the horizontal side-ant option (`lockup-horizontal-side`, traced from a version-1 screenshot). Each comes in dark and light, as SVG and PNG. `dark` is light art for an ink ground; `light` is ink art for a light ground. `lockup-horizontal-A` is the header logo on www, the console and the docs |
| `icons/` | App icons, avatars, favicons (`favicon.svg`, `favicon.ico`, 16 to 512px PNG) and `apple-touch-icon-180.png` |
| `layers/` | Marks A and C split into ant and load SVGs (light and dark), for the signature motion. Paths unchanged. Each ant and load pair shares its mark's viewBox |
| `unloaded/` | The ant without the B: A side view and C top view, facing right or up-right, light and dark. SVGs split body and six legs (`leg-front-1` to `leg-rear-2`, the same names in A and C) with pivot data for animation. A has a straight dotted trail; C has none |
| `social/` | Open Graph images (dark and light) and a header image |
| `tokens/bandwise-theme.css` | Local, not from the kit: applies the dark semantic values when the system prefers dark and no `data-theme` is set |
| `bandwise-motion-demo.html` | The signature motion concept: the ant walks the ruler and sets the B down at the score |

The full 26-page visual guide (`bandwise-brand-guidelines-v1.7.pdf`) lives in the Drive folder "Bandwise brand kit v1" (https://drive.google.com/drive/folders/1Wr7Q8eotXDFfNU-5sj0-yqeQ9QVyfPsN), not in git.

Rules that matter most:

- Never redraw, recolor or regenerate a mark. Use these files.
- Respect the minimum sizes in `DESIGN.md`. Use each lockup as one unit; never resize its parts separately.
- The thresholds shown in the kit (0.55 and 0.80) are examples. Product UI draws each set's own thresholds.
