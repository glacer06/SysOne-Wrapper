# Bandwise marketing site: design identity

This file is the design system for `apps/web` (www.bandwise.dev). The tokens live at the top of `src/app/global.css`. Components use tokens, never raw values. Nick delegated the design calls on 2026-09-28; these are the choices and the reasons.

## Register and scene

**Register:** brand. The page is the pitch.

**Scene:** a backend or platform engineer at a desk late in the afternoon, the second monitor full of alerts and bot pull requests, reading this page with a skeptical eye because someone on the team said "we could let a small model decide these". They want to see the actual question, the actual thresholds, and what the bill will be. They will copy a command before they fill in a form.

What the scene forces:

- Show the mechanism, not a mood. The real question, the real thresholds, the real price book.
- Numbers and code are first-class citizens of the layout, set in a monospace that reads like instrument output.
- Calm, daylight surfaces. This reader is mid-task and tired of dark neon dashboards.

## Direction: the survey instrument

The product sorts a confidence value into bands. That is what a surveyor's level staff, a gauge face or a map's contour tints do: a scale, marked in ranges, that you read at a glance. The site borrows that language.

- **Signature element: the band ruler.** A 0 to 1 scale, ticked like a measuring staff, with the band ranges drawn as fills: solid for high, hatched for medium, dotted for low. It carries the hero readout and the worked example. Bands are told apart by pattern as well as tone, so they survive grayscale, color blindness and forced colors.
- **Structure over boxes.** Sections are separated by hairline rules and a ticked edge, not by cards. Lists of things (templates, packages, providers) are ruled tables and indexes, not tile grids.
- **Readouts.** Values the product computes (bands, actions, dollars) are set as mono readouts with small uppercase labels, like the display on an instrument.

Category reflex check. "AI dev tool" predicts purple gradients on black, or a green-on-black terminal. The second-order guess, "dev tool that avoids that", predicts cream editorial serif or brutalist black and yellow. This is neither: a daylight drafting-paper surface, a condensed signage face, and one signal color used the way hi-vis paint is used on an instrument, on the marks that matter.

## Color

Strategy: **Restrained, with one committed moment.** Tinted neutrals carry the page. One signal color (amber) marks the high band, the primary action and the savings bar. The early-access section is the committed moment, where the signal color fills the background.

All colors are OKLCH. Neutrals are tinted toward hue 70 to 85 (warm paper and warm ink). No pure black or white anywhere.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `oklch(0.972 0.008 85)` | `oklch(0.195 0.012 70)` | Page background |
| `--paper-sunk` | `oklch(0.945 0.012 85)` | `oklch(0.235 0.014 70)` | Readouts, code, inputs |
| `--ink` | `oklch(0.24 0.018 70)` | `oklch(0.93 0.012 85)` | Body text, headings, solid marks |
| `--ink-2` | `oklch(0.40 0.02 70)` | `oklch(0.80 0.015 80)` | Secondary text |
| `--ink-3` | `oklch(0.50 0.02 70)` | `oklch(0.70 0.015 80)` | Labels, captions (4.5:1 or better on paper) |
| `--rule` | `oklch(0.86 0.012 80)` | `oklch(0.33 0.014 70)` | Hairlines between sections and rows |
| `--edge` | `oklch(0.56 0.02 75)` | `oklch(0.60 0.015 75)` | Control borders (3:1 on paper) |
| `--signal` | `oklch(0.80 0.16 75)` | `oklch(0.82 0.15 78)` | High band, primary button, savings |
| `--on-signal` | `oklch(0.22 0.02 70)` | `oklch(0.20 0.02 70)` | Text on signal fills |
| `--danger` | `oklch(0.50 0.17 28)` | `oklch(0.76 0.13 30)` | Field errors |
| `--good` | `oklch(0.45 0.10 150)` | `oklch(0.80 0.11 150)` | Form success |

Rules: text never wears `--signal` on paper (it fails contrast); signal is a fill with `--on-signal` text. Links are ink with an underline. Focus is a 3px ink outline with a 2px offset, visible on paper and on signal.

## Type

- **Display: Barlow Semi Condensed** 600. A grotesk drawn from highway signage: narrow, upright, made to be read at a distance and at speed. It gives headlines the plainness of a label on equipment instead of the swagger of a startup hero.
- **Body: Barlow** 400 and 500. Same skeleton as the display face, so the page reads as one voice; wide enough for comfortable paragraphs.
- **Readouts and code: IBM Plex Mono** 400 and 500. Clear zero, clear 1 and l, tabular by nature. Every number the product computes is set in it.

Loaded with `next/font/google`, self-hosted at build time, `display: swap`, with metric-matched system fallbacks. A system stack was the other option; it was rejected because the signage face is half of the identity.

Scale (ratio about 1.333, fluid at the top):

| Token | Size | Use |
|---|---|---|
| `--t-hero` | `clamp(2.5rem, 1.4rem + 4.6vw, 5rem)` | Hero headline |
| `--t-h2` | `clamp(1.9rem, 1.3rem + 2.4vw, 3rem)` | Section headlines |
| `--t-h3` | `1.33rem` | Sub heads |
| `--t-lede` | `clamp(1.125rem, 1rem + 0.5vw, 1.33rem)` | Lede paragraphs |
| `--t-body` | `1.0625rem` | Body |
| `--t-small` | `0.875rem` | Captions, caveats |
| `--t-label` | `0.75rem` | Uppercase readout labels, tracked 0.08em |

Display type is tracked -0.01em and set at line height 1.02 to 1.1. Body measure is capped at 66ch.

## Space, radius, depth

- Spacing scale in rem: 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8 (`--s-1` to `--s-10`). Section padding is `--s-9` on wide screens, `--s-8` on phones. The hero breaks the scale on purpose with extra top room.
- Page gutter: 16px on phones, 32px on tablets, 48px on desktop. Content max width 76rem.
- Radius: 2px on controls and readouts. Instruments have machined corners, not pills.
- No shadows. Depth comes from the sunk paper tone and rules.

## Motion

Crisp and brief. Buttons and links change color in 120ms with ease-out-quart. The calculator bars move with a 200ms transform on the width scale. Nothing loops. `prefers-reduced-motion` turns every transition off.

## Components

- **Band ruler** (`src/components/band-ruler.tsx`): scale, five band segments, tick labels, numbered markers. Legend below it names each pattern.
- **Readout** (`.readout`): label and value pairs in mono on sunk paper.
- **Buttons**: primary is a signal fill with ink text; secondary is an ink outline. Both are at least 44px tall.
- **Form controls**: 48px tall, `--edge` border, sunk paper fill, label above, error below in `--danger` with the field marked `aria-invalid`.

## Bans kept

No gradients except the hatch pattern on the medium band, no gradient text, no glow, no side-stripe borders, no card grids, no hero metrics, no emoji, no em dashes. Every number on the page comes from `docs/marketing/claims.md` or is computed from the core price book, with its caveat beside it.
