# brand

The Bandwise brand kit v1 (ADR-022). The written spec is `DESIGN.md` and `BRAND-VOICE.md` at the repo root. This folder holds the files they point to.

| Path | What |
|---|---|
| `tokens/bandwise-tokens.css` | CSS variables: primitives plus the light and dark semantic layer (`--bw-*`). Components read only the semantic layer |
| `tokens/bandwise-tokens.json` | The same tokens in DTCG format |
| `tokens/bandwise-components.css` | Reference CSS for the button, input, band badge, decision card, confidence ruler, table, tabs, alert, code block, tooltip and trail divider |
| `marks/` | `mark-A` (Ascent, primary), `mark-C` (Scout, compact), the `b-monogram`, and the horizontal and stacked lockups. Each comes in dark and light, as SVG and PNG |
| `icons/` | App icons, avatars, favicons (`favicon.svg`, `favicon.ico`, 16 to 512px PNG) and `apple-touch-icon-180.png` |
| `social/` | Open Graph images (dark and light) and a header image |
| `bandwise-motion-demo.html` | The signature motion concept: the ant walks the ruler and sets the B down at the score |

The full 26-page visual guide (`bandwise-brand-guidelines-v1.pdf`) lives in the Drive folder "Bandwise brand kit v1" (https://drive.google.com/drive/folders/1Wr7Q8eotXDFfNU-5sj0-yqeQ9QVyfPsN), not in git.

Rules that matter most:

- Never redraw, recolor or regenerate a mark. Use these files.
- Respect the minimum sizes in `DESIGN.md`.
- The thresholds shown in the kit (0.55 and 0.80) are examples. Product UI draws each set's own thresholds.
