# DESIGN-STANDARDS.md

The definition of done for any Bandwise UI, and the gates that enforce it. You, CI and the agents all read this. An artifact is not done until every gate is green.

## Definition of done

A screen or component is done when it:

1. Passes WCAG 2.2 AA checks in both themes.
2. Matches its approved visual snapshot, or has a deliberately approved visual change.
3. Clears the anti-pattern check with no violations: the bans in `DESIGN.md` and `PRODUCT.md`.
4. Passes `pnpm turbo lint typecheck test build`.
5. Handles every state: default, hover, focus, active, disabled, loading, error and empty.
6. Reads only `--bw-*` semantic tokens. No raw hex and no primitives in components.

## Accessibility (the floor)

The target is WCAG 2.2 AA.

- **Contrast:** 4.5:1 for normal text, 3:1 for large text and for UI parts. The pairs in `DESIGN.md` are pre-checked. Any new pair is checked before use.
- **Targets:** at least 44px for touch. Desktop controls are 40px, or 32px only in dense tables.
- **Text size:** respect the user's system font size. Size text in rem in the apps.
- **Dark mode:** ink #0D1417 with cool white text. Never pure black on pure white.
- **Focus:** a visible ring on every interactive element: 2px `--bw-focus` with a 2px offset.
- **Motion:** respects `prefers-reduced-motion: reduce` by showing the end state. No information is carried by motion alone.
- **Bands:** every band shows its word and its number. Never color alone.

Tooling: axe-core in Playwright for CI, and the browser devtools contrast checker for spot checks.

## Visual regression

- Playwright `toHaveScreenshot()` covers the key routes of each app, in light and dark.
- For design review, capture full-page shots at 390, 768, 1440 and 1920 pixels wide, in both themes, before asking for review.

## Desktop and responsive

- The layout steps at 640, 960 and 1280. Content max is 1200px on a 12-column grid with 24px gutters.
- Type steps up on large screens. The display size only appears at 960 and above.
- Verify at the four widths above, in both themes. Checking one width on the dev server hides desktop failures.

## Anti-pattern gate

A screen fails if it has any of these:

- A warm tone anywhere.
- Teal text on a light background, or white text on teal.
- A band shown by color alone.
- A hard-coded threshold (0.55 or 0.80).
- A redrawn or recolored mark.
- More than one chamfered element in a region.
- More than one moving thing in a view, or an idle loop.
- Gradient text.
- Cards inside cards.
- A rounded-square icon tile above every heading.
- An em dash, an emoji, an exclamation mark, or a word on the banned list in `BRAND-VOICE.md`.

Run an Impeccable pass on new screens when the skill is installed. Its findings go to the human reviewer and don't stand in for the checks above.

## Code gate

- ESLint and Prettier, as configured per package.
- TypeScript in strict mode.
- Vitest for unit and component tests.

## CI wiring

All gates run on every PR. No green, no merge. Merges happen only on Nick's go.

## Loops

Work that runs in a loop follows the rules in the factory kit (`kit/skills/factory-kit/references/loops.md` in operator-kit):

- A separate agent verifies the work. The generator never grades itself.
- The loop stops on the same gate as a merge.
- Every loop has a hard cap.
- A human approves before any merge.
