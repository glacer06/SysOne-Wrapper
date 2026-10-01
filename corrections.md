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
- **2026-10-01: Gmail rewrites links in sent mail** into google.com/url wrappers, which breaks copied commands. Send commands as plain text without links.
