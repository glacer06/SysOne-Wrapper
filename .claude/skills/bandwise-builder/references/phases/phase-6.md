# Phase 6: Chrome extension

**Owner:** Extensions, Security reviewer. **Needs:** Phase 5 (web page adapter).

- [ ] WXT, MV3, permissions `activeTab` and `storage` only
- [ ] Sign in with the device flow (`POST /api/v1/auth/device/code` and `/auth/device/token`); receives an agent token with client `extension` and scopes `run`, `sets:read`, `review:read`, `review:write`; stored in `chrome.storage.session`
- [ ] Org and set picker
- [ ] **Evaluate page mode:** extract selection, readable text, or custom selectors per site through the web page adapter; preview and redact state; run; show `ConfidenceBadge` and `ProbabilityBars` in a side panel; send medium and low to review
- [ ] **Action picker mode** (modeled on browser-use/jev-ultrafast): page becomes a numbered list of clickable elements; one Choice picks action and element; per-option probabilities shown; a small LLM handles typing only; no screenshots
- [ ] Autonomy rule: clicks on its own only for high-band answers on org-allowlisted sites and only when the set's production rollout is `full`; everything else waits for confirmation
- [ ] Sets using the web page adapter default to the high-risk tier, and their gate dataset includes adversarial cases ([security.md](../security.md), State is untrusted)

## Docs site
- [ ] Docs pages ([team-playbook.md](../team-playbook.md#docs-site)): Chrome extension (install, sign in, evaluate page mode, action picker mode, the autonomy rule)

## Exit gate
- No TypeSafe key anywhere in the extension.
- Nothing is sent before the user clicks.
- Evaluate mode works on three sample pages; action picker completes one scripted task on an allowlisted test site.
- An injected-instruction test page does not trigger an autonomous click.
