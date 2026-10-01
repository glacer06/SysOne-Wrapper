# Bandwise design system (v1.0)

Read this before building any Bandwise UI, doc or marketing page. It is the visual spec for every surface: www.bandwise.dev (`apps/web`), the console on app.bandwise.dev (`apps/console`), docs.bandwise.dev (`apps/docs`), plugin listings and CLI output.

Source: the brand kit v1 that PJ delivered on 2026-10-01, locked in by Nick the same day (ADR-022). Files:

- Tokens: `brand/tokens/bandwise-tokens.css` (CSS variables) and `brand/tokens/bandwise-tokens.json` (DTCG).
- Reference components: `brand/tokens/bandwise-components.css`.
- Marks, lockups, monogram: `brand/marks/`. Icons and favicons: `brand/icons/`. Social images: `brand/social/`.
- Motion concept: `brand/bandwise-motion-demo.html`. Full visual guide: `bandwise-brand-guidelines-v1.pdf` (26 pages), kept in the Drive folder "Bandwise brand kit v1" (https://drive.google.com/drive/folders/1Wr7Q8eotXDFfNU-5sj0-yqeQ9QVyfPsN), not in git.
- Voice: `BRAND-VOICE.md`. Strategy and principles: `PRODUCT.md`. Gates: `DESIGN-STANDARDS.md`.

This file replaces the "survey instrument" identity in `apps/web/DESIGN.md` (warm paper, amber signal). That file is kept only as history until `apps/web` is restyled.

## The idea

Bandwise knows how sure it is. A small, fast model takes the routine calls. Every answer shows a **band** (High, Medium, Low), a reason and a cost. High ships, Medium gets evidence, Low goes to a person.

The brand idea: an ant carries many times its own weight (Carry) and leaves a trail (Trail). In the mark, the ant carries the faceted B as its load and climbs a dotted trail.

Personality: calm, candid, street-smart. It should feel like a tool crib, with stamped labels and a load rating on a hook.

## Hard rules

1. **Cool palette only.** Ink, cool white, teal and slate, plus violet for Medium and crimson for Low. No cream, tan, clay, coral, orange or rust. No pure black. Nothing near Anthropic's colors.
2. **Semantic tokens only.** Components use `--bw-bg`, `--bw-text`, `--bw-brand` and the rest of the semantic layer. They never use raw hex or primitives. Theme comes from `data-theme="light|dark"` on a root element.
3. **Teal text rules.**
   - Never use Teal #12A38A as text on light backgrounds.
   - Never put white text on teal. Teal fills carry ink text.
   - Brand text on light is Deep Teal #0B7060.
4. **Bands are always labeled.** Color is never the only signal: show the badge text (HIGH, MEDIUM or LOW) plus the number.
5. **Marks are supplied files.**
   - Never redraw, recolor or regenerate the ant or the B.
   - Use the SVGs in `brand/marks/` and `brand/icons/`.
6. **Accessibility floor.**
   - Every text pair passes WCAG 2.2 AA.
   - Focus ring is 2px with a 2px offset, on every interactive element.

## Color

| Role | Light | Dark |
|---|---|---|
| bg | #F2F5F4 | #0D1417 |
| surface | #FFFFFF | #131D22 |
| text | #0D1417 | #F2F5F4 |
| text-muted | #5B6B70 | #8A9A9F |
| border | #D9E1E1 | #2A3A41 |
| brand (fill) | #12A38A | #4FD1B5 |
| brand-text | #0B7060 | #4FD1B5 |
| high | #12A38A | #4FD1B5 |
| medium | #8B7CF6 (text #5B4BD6) | #8B7CF6 |
| low | #D92D4A (text #C4203D) | #FF6B83 |
| focus | #5B4BD6 | #4FD1B5 |

Contrast was checked on 2026-10-01. All 21 text pairs in both themes pass AA. The lowest are 4.70:1 (low text on low background, light) and 4.75:1 (white on the light danger button).

Keep violet and red under 10% of any screen.

### Band thresholds are data, not brand

The confidence ruler and badges draw the **set's own thresholds**, read from the published spec. They are set per set and per question. The dogfood sets in `.bandwise/sets/` use High from 0.6 to 0.8 and Medium from 0.35 to 0.5.

The brand kit's 0.55 and 0.80 are example values for marketing art and demos. They are not product defaults, and no code should hard-code them.

### Theme switching

The kit themes through `data-theme`. Apps also follow the system setting when the person has not chosen a theme:

- Apply the dark semantic values inside `@media (prefers-color-scheme: dark)` whenever the root's `data-theme` is not `light`.
- Apply them again wherever `data-theme` is `dark`, so an explicit choice wins in both directions.

## Type

- **Display: Archivo**, with `font-stretch: 125%`, weight 800 and tracking -0.02em, in sentence case. Use it for headlines and big numbers.
- **Body: Schibsted Grotesk**, weights 400, 500 and 600. Use it for paragraphs and UI.
- **Data: JetBrains Mono**, weights 400 to 600, with tabular numbers. Use it for scores, costs, IDs and code.
  - Labels are mono, 12px, uppercase, tracked +0.08em, in the muted color.
- **Loading:** all three are OFL fonts on Google Fonts. In the Next apps, load them with `next/font/google` so they are self-hosted at build time. Elsewhere, use: `https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Schibsted+Grotesk:wght@400..900&family=JetBrains+Mono:wght@100..800&display=swap`
- **Scale** (size/line height): display 64/1.04, h1 48/1.08, h2 36/1.12, h3 24/1.2, h4 18/1.3, body 16/1.55, small 14/1.5, caption 12/1.4.
- **Limits:** prose is at most 68ch wide, and each view gets one display headline.

## Space, shape, layout

- **Spacing:** 4px base, with steps 4, 8, 12, 16, 24, 32, 48, 64 and 96.
- **Radius:** 0, 2, 4 or 8. Pills are only for chips and toggles.
- **Surfaces:** flat, with 1px hairlines. Shadows only on overlays.
- **Chamfer, the signature.** Primary buttons, decision cards and badges have their top-right and bottom-left corners cut at 45 degrees. The cut is 8px, or 6px on badges, and echoes the B. Use one chamfered element per region.
- **Grid:** 12 columns, 24px gutters, 1200px max content width.
- **Breakpoints:** 640, 960 and 1280.
- **Control height:** 40px, or 32 compact and 48 for touch.

## Components

Reference CSS is in `brand/tokens/bandwise-components.css`. The apps rebuild these on the same tokens; they never fork the values.

- **Button.** Variants:
  - primary: teal fill, chamfer, ink text;
  - secondary: outline;
  - ghost: brand text;
  - danger: low color.

  States are default, hover, active (moves 1px down), focus, disabled (40% opacity) and loading. In the loading state the label stays and the trail motif replaces the spinner.
- **Input.** 40px tall, 1px strong border, 2px focus ring. The error state uses the low color plus help text in plain words.
- **Band badge.** Mono 11px caps on a tinted band background, with a square dot. Always reads High, Medium or Low, usually with the score.
- **Decision card.** A title (what happened, in one sentence), then the rows BAND, WHY and COST, separated by hairlines. The order is fixed: state, band, why, cost.
- **Confidence ruler.** A 0 to 1 scale with red, violet and teal segments at the set's thresholds, and a 2px marker at the score.
- **Alert.** A 3px band-colored rule on the left, a tinted background and a bold first phrase.
- **Table, tabs, code block, tooltip.** See the CSS. Any numeric column is mono.
- **Trail divider.** `.bw-trail` is a dotted 3px line. For progress, trail dots grow toward one teal node.
- **Icons.** Lucide, on a 24px grid, 1.5px stroke, `currentColor`.

## Logo use

- **Mark files:**
  - `bandwise-mark-A-*` is Ascent, the primary mark;
  - `bandwise-mark-C-*` is Scout, for square and compact spaces;
  - `bandwise-b-monogram-*` is the B, for the favicon and small sizes;
  - lockups come horizontal and stacked, each with A or C.
- **Wordmark.** In logo art the wordmark is lowercase "bandwise" in Archivo Expanded 800. It always sits with the ant (A or C). There is no standalone wordmark and no faceted-B wordmark.
- **Clear space:** half the height of the B block.
- **Minimum sizes:**
  - horizontal lockup 160px wide;
  - stacked lockup 96px high;
  - mark A 72px;
  - mark C 56px high;
  - the B 16px.

  Below those sizes, use the B.
- **Don't:** stretch, rotate, recolor, add a shadow, fade, crop or blur the marks. Don't place them on busy photos or warm backgrounds.

## Motion

Motion is purposeful, never constant. When a decision resolves:

1. The ant walks the ruler (1400ms, `--bw-ease-walk`) and stops at the score.
2. The band lights up.
3. The B sets down with one small overshoot (480ms, `--bw-ease-settle`).
4. The score and the cost fade in.

Rules:

- One moving thing per view, and no idle loops.
- Honor `prefers-reduced-motion` by showing the end state.
- No information is carried by motion alone.

## Copy

Follow `BRAND-VOICE.md`. Short, plain, number first. No hype words, no exclamation marks, no emoji, no em dashes. Sentence case.

## Naming

In logo art, the wordmark is always lowercase "bandwise".

In prose, UI, docs and CLI text, "Bandwise" and "bandwise" are both correct, the way Facebook and facebook both are (Nick, 2026-10-01). Pick one per surface or document and keep it consistent. Code identifiers keep `@bandwise/*` and `bandwise`.

## Do and don't

Do:

- Show the band name and the number together.
- Put the cost in exact digits.
- Use one chamfered element per region.
- Draw thresholds from the set's spec.
- Use supplied mark files at or above their minimum size.

Don't:

- Use warm tones.
- Put teal text on light backgrounds.
- Put white text on teal.
- Use color as the only band signal.
- Hard-code 0.55 or 0.80.
- Redraw the ant.
- Animate idly.
- Use gradient text, cards inside cards, or a rounded-square icon tile above every heading.
