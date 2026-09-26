# Phase 4: Embed kit

**Owners:** Embed Kit, QA. **Needs:** frozen `openapi.json` (Phase 3). Components can start earlier against MSW mocks.

- [ ] `@sysone/client`: `createClient({ baseUrl, token }).run(setRef, state)`, `createRunRoute()` for Next.js, Express handler
- [ ] Browser token minting (5-minute JWT bound to origin and set list)
- [ ] Publishable `pk_` mode support
- [ ] `@sysone/react`: `QuestionSetRunner`, `ConfidenceBadge`, `ProbabilityBars`, `ScoreGauge`, `ReviewQueue`, `SavingsCard`, plus headless hooks
- [ ] Theming through CSS variables, accessible by default
- [ ] `apps/example-embed` using both modes
- [ ] Quickstart docs

## Exit gate
- `example-embed` E2E passes in both modes.
- CI bundle scan finds no key patterns in client output.
- `@sysone/react` under 15 kB gzip.
- Components render all three question types and all three bands.
- Revoking a token blocks it within 60 seconds.
