# Phase 3: Console

**Owners:** Console UI, Platform (`/api/v1`), Billing / Savings (reports), QA. **Needs:** Phase 2.

## Managed questions and managed live
- [ ] Goals CRUD with success metric
- [ ] Question set list, create from blank or template
- [ ] Question editor: form mode and JSON mode, live zod validation and lints, structured instructions and criteria, backtick path autocomplete from `input.schema`
- [ ] Options editor: choice options (up to 255, "none" suggestion), score levels (2 to 10, ordered), noul true/false criteria
- [ ] Policy editor with band sliders and a live preview on sample state
- [ ] Input schema editor, adapter picker, redact paths, token preflight meter
- [ ] Publish flow: lints, optional eval gate, changelog, channel choice
- [ ] Version history, release events, one-click rollback and promote
- [ ] Rollout stage control (draft, shadow, controlled, full) with audit

## Test and learn
- [ ] Playground: pick two versions and one state or a dataset; structural diff and behavioral diff; flipped cases table; cost delta
- [ ] Runs explorer with filters, run detail with per-stage payload and answers
- [ ] Review queue: assign, resolve, dismiss, add to dataset, SLA timers
- [ ] Datasets and eval runs with calibration charts
- [ ] Definition Studio per `definition-studio.md`

## Administration and ROI
- [ ] Savings and usage dashboards (org, project, set)
- [ ] Standard reports from `savings-model.md` with CSV export and monthly PDF
- [ ] Model drift alerts
- [ ] Audit log viewer with filters and CSV export

## API
- [ ] `/api/v1` endpoints from `api.md` with OpenAPI and MSW mocks regenerated

## Exit gate
- Playwright: create a set, publish, call it through the API, publish v2, the API serves v2 within 30 seconds with no redeploy, roll back, the API serves v1.
- Medium and low band answers create review items; resolving one can add a dataset case.
- A viewer cannot mutate anything (API tests).
- Every mutation writes an audit row.
