# Phase 6: Chrome extension

**Owner:** Extensions, Security reviewer. **Needs:** Phase 5 (web page adapter).

- [ ] WXT, MV3, permissions `activeTab` and `storage` only
- [ ] Sign in to the console (device-style flow); session token scoped to user, org, and role; stored in `chrome.storage.session`
- [ ] Org and set picker
- [ ] **Evaluate page mode:** extract selection, readable text, or custom selectors per site through the web page adapter; preview and redact state; run; show `ConfidenceBadge` and `ProbabilityBars` in a side panel; send medium and low to review
- [ ] **Action picker mode** (modeled on browser-use/jev-ultrafast): page becomes a numbered list of clickable elements; one Choice picks action and element; per-option probabilities shown; a small LLM handles typing only; no screenshots
- [ ] Autonomy rule: clicks on its own only for high-band answers on org-allowlisted sites; everything else waits for confirmation

## Exit gate
- No TypeSafe key anywhere in the extension.
- Nothing is sent before the user clicks.
- Evaluate mode works on three sample pages; action picker completes one scripted task on an allowlisted test site.
