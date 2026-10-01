# Corrections Log

Mistakes already corrected in this project. Read at the start of a session so they don't happen again. Add an entry each time Nick, PJ or a reviewer corrects something specific.

## Brand and design

- **2026-10-01: Band thresholds are not brand values.** The brand kit's 0.55 and 0.80 are examples only. Rulers and badges read each set's thresholds from its spec. Never hard-code a cutoff.
- **2026-10-01: The name's case.** The wordmark in logo art is lowercase "bandwise". In prose, "Bandwise" and "bandwise" are both fine, the way Facebook and facebook are. Keep one form per document.
- **2026-10-01: CSS `clamp()` needs spaces around `+` and `-`.** `clamp(2rem,1rem+4vw,5rem)` is invalid and fails silently, so the text falls back to its default size. Write `clamp(2rem, 1rem + 4vw, 5rem)`.
- **2026-10-01: The old warm look is retired.** No amber, cream or other warm tones. The `apps/web/DESIGN.md` "survey instrument" identity is superseded by `DESIGN.md`.

## Tooling and process

- **2026-09-30: Only `@bandwise/tenancy` may import `node:crypto`.** Put hashing and random helpers there.
- **2026-09-30: The kit export scan fails on internal names.** People's names and PR numbers must stay out of `packages/cli` and `packages/core` source.
- **2026-09-30: Drizzle numbers migrations itself.** After generating, check the number, the journal tag and the snapshot file. They must follow the last applied migration.
- **2026-10-01: The API reference renderer cannot draw a schema that contains itself.** fumadocs-openapi 12 writes union members and array items inline in the type label with no loop guard, so `JsonValue` crashed `/docs/api/run` and `/docs/api/set` with an out-of-memory error in the browser. Feed the renderer `breakInlineSchemaCycles(apiDocument())`, never the raw document.
- **2026-10-01: Gmail rewrites links in sent mail** into google.com/url wrappers, which breaks copied commands. Send commands as plain text without links.

## Brand kit v1.2 (2026-10-01)

- **Control outlines use `--bw-border-control`.** `--bw-border-strong` is for hairlines and table rules only. It is under 3:1 on surfaces.
- **Chamfered buttons, badges and decision cards need their wrapper.** Use `.bw-focus-poly` or `.bw-decision-wrap`, so the focus ring follows the chamfer. A plain `outline` is clipped by `clip-path`.
- **Headers use the typed wordmark, not the lockup image.** The lockup at header size reads small and awkward (Nick). Since kit v1.5 the unloaded right-facing ant sits beside it; see below.
- **2026-10-01: Side stripes are 1px at most.** Alerts, toasts and emphasized cards use a 1px band-colored rule with a tinted background, not the kit's 3px stripe (Nick picked ALERT-1PX). For extra emphasis, outline the whole card instead.
- **2026-10-01: Fonts are bundled, not fetched.** The apps load Archivo, Schibsted Grotesk and JetBrains Mono with `next/font/local` from `@fontsource-variable` packages. `next/font/google` downloads at build time and failed CI when the fetch did (PR #25).
- **2026-10-01: "Backup codes", never "recovery codes".** The two-factor fallback is called backup codes everywhere: console copy, the sign-in rail, docs and runbooks (Nick).
- **2026-10-01: Headers pair the unloaded ant with the typed wordmark.** www, the console and the docs show the unloaded side-view A ant facing right just left of the typed "bandwise", with the wordmark at its old size. The ant is cropped above its trail and is decorative inside the home link (Nick). This is the one lockup-like use of an unloaded ant; the full logo art still carries the B.
- **2026-10-01: The ruler carry uses the side-view ant.** The worked-example ruler on www walks the unloaded A ant facing right with the supplied B on its back, legs in a tripod gait while it walks, then sets the B down at the score. It replaced the top-down mark C layers (Nick).

## Brand kit v1.6 (2026-10-01)

- **Unloaded ant legs use neutral side numbers.** Since v1.6 both A and C name their legs `leg-front-1`, `leg-front-2`, `leg-middle-1`, `leg-middle-2`, `leg-rear-1` and `leg-rear-2`. The v1.5 names (`far`, `near`, `left`, `right`) are gone, so CSS that targets them stops moving the legs without any error. A far and C left are 1; A near and C right are 2. The www ruler tripods are front-2, middle-1, rear-2 against front-1, middle-2, rear-1. After a kit update, run `pnpm --filter @bandwise/web brand:ant` and copy the changed unloaded files to each app's `public/brand`.
- **Check the kit against its own notes.** v1.6 said it fixed the header rule, but its DESIGN.md allows the typed wordmark alone with no ant, which is not the pairing Nick chose. Diff every file before taking a kit's CHANGES or README at their word.
