# Plan Verification
**Project:** Bandwise

Run this against every plan before approving it. If any dimension fails, fix the plan before building.

1. **Requirement coverage.** Every objective in `scope.md` and the phase file maps to at least one step.
2. **Task atomicity.** No single step creates more than five files.
3. **Dependency ordering.** No step relies on a later one. Dependencies are stated.
4. **File scope.** Every file touched sits in the owning team's scope, as the `bandwise-builder` skill's team playbook defines it.
5. **Test mapping.** Every requirement has a test. Tenant tables have a cross-tenant test.
6. **Context fit.** The plan stays under 2000 lines.
7. **Gap detection.** No missing exports. Error handling and edge cases are covered.
8. **Rules compliance.** The golden rules and writing rules in `CLAUDE.md` are applied.
9. **Design-spec fidelity.** Every UI step uses `--bw-*` tokens from `brand/tokens/`, uses no raw hex, and matches `DESIGN.md`.
10. **Accessibility.** Each UI change names its WCAG 2.2 AA checks: contrast, target size, visible focus and system font size.
11. **Anti-pattern.** The `DESIGN-STANDARDS.md` anti-pattern gate is planned for every UI change.
12. **Motion.** Any motion follows `DESIGN.md`: it names the reduced-motion path, carries no information by motion alone, and uses the duration and easing tokens.
