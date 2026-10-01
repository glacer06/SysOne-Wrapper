# ADR-022: Brand and design system v1

- **Status:** accepted (Nick, 2026-10-01: "We have our branding and design system. Lock this in." On the name: "I'm fine with either 'Bandwise' or 'bandwise', treat it like Facebook or facebook." Rollout: "All three together." Metrics: "Yes, add activation.")
- **Date:** 2026-10-01
- **Owner:** Design, with Docs and the app owners
- **Decider:** Nick
- **Amends:** ADR-016 for the name's case in prose only. It supersedes the identity in `apps/web/DESIGN.md` and the www design notes ADR-018 points to.
- **Contract impact:** none. No code identifier changes. `@bandwise/*` and the `bandwise` command stay as they are.

## Context

The www site launched with a warm "survey instrument" look: paper tones, an amber signal and signage type. The console and the docs had no shared system. On 2026-10-01 Nick ran the factory kit on Bandwise and set the base:

- Dev teams running AI as the audience.
- "It knows how sure it is" as the wedge.
- Calm, candid and street-smart as the personality.
- An ant theme: Carry for strength, Trail for the receipt.

PJ then delivered a full brand kit v1. It has a 26-page guide, tokens in CSS and DTCG JSON, reference components, the ant marks with the B as the load, lockups, a monogram, icons, favicons, social images and a motion concept.

## Decision

1. **The brand kit v1 is the design system for every surface.** That covers www, the console, the docs, plugin listings and CLI output. The files live in `brand/`:
   - `brand/tokens/` for the tokens and reference components;
   - `brand/marks/` for the marks;
   - `brand/icons/` for the icons;
   - `brand/social/` for the social images;
   - `brand/bandwise-motion-demo.html` for the motion concept.

   The 26-page guide PDF stays out of git. It is kept in the Drive folder "Bandwise brand kit v1" (https://drive.google.com/drive/folders/1Wr7Q8eotXDFfNU-5sj0-yqeQ9QVyfPsN) (Nick, 2026-10-01).
2. **The written spec sits at the repo root, beside the factory kit files.**
   - `DESIGN.md` and `BRAND-VOICE.md` are PJ's text, with the corrections below.
   - The kit files are `PRODUCT.md`, `scope.md`, `measurement.md`, `architecture.md`, `DESIGN-STANDARDS.md`, `verify-plan.md` and `corrections.md`.
   - They passed the kit's no-blank gate.
3. **Components read only the `--bw-*` semantic tokens.** Marks are supplied files and are never redrawn.
4. **Name case.** The logo wordmark is lowercase "bandwise". In prose, UI, docs and CLI text, "Bandwise" and "bandwise" are both correct. Each document keeps one form. ADR-016's name stands, and only its casing rule for prose changes.
5. **Thresholds stay data.** The kit's 0.55 and 0.80 are examples for demos and art. Rulers and badges draw each set's own thresholds from its published spec (golden rules 5 and 9).
6. **Theme.** The kit's `data-theme` switch stays. Apps also follow `prefers-color-scheme` when no theme is set, and an explicit choice wins either way.
7. **Rollout.** www, the console and the docs are restyled together on these tokens, after this ADR.
8. **Metrics.** Savings shown, calibration and activation (`measurement.md`).

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep the warm survey-instrument look | No work | Doesn't fit the ant brand or the cool palette. Sits close to Anthropic's colors |
| A separate identity per app | Each app moves on its own | Three looks for one product. Tokens drift |
| Brand kit v1 for all surfaces (chosen) | One look, one token set, AA checked | One larger restyle across three apps |

## Consequences

- The three apps get one token import and one set of self-hosted fonts: Archivo, Schibsted Grotesk and JetBrains Mono, all OFL, through `next/font`.
- The www page and its OG image change completely. Claims on www still come only from `docs/marketing/claims.md`.
- `apps/web/DESIGN.md` remains as history until the www restyle lands. Then it is replaced with a pointer to the root `DESIGN.md`.
- The guide PDF lives in Drive, so the repo carries only the files the apps load.

## Rollout

1. This ADR and the files in `brand/` and at the root, in one docs-only change.
2. One restyle change across `apps/web`, `apps/console` and `apps/docs`. It covers tokens, fonts, favicons, the marks, and components rebuilt on the tokens. It is verified at 390, 768, 1440 and 1920 pixels, in both themes, against `DESIGN-STANDARDS.md`.
3. Plugin listing art and social images from `brand/social/` with the Bandwise Gate work (ADR-021).

Reversal: revert the restyle change. The tokens and assets in `brand/` cost nothing to keep.
