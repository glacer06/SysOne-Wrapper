# Phase 3b: Effectiveness loop

**Owners:** Quality / Learning (lead), Platform (operations and routes), Console UI (screens), Integrations (MCP tools and CLI commands), Billing / Savings (quality-adjusted value in rollups and reports). **Needs:** Phase 3. Runs in parallel with Phase 4 and Phase 4b.

The loop, its contracts and its rules are in [effectiveness-loop.md](../effectiveness-loop.md). Decision record: [ADR-010](../../../../../docs/adr/010-rollout-pointers-and-effectiveness-loop.md). Lanes: Quality / Learning writes the pure logic in `packages/core/src/learning` and the jobs in `apps/console/src/jobs/learning`; Platform adds each operation and route ([management-api.md](../management-api.md)); Console UI builds the screens on those operations; Integrations adds the CLI commands and MCP tools ([headless-and-agents.md](../headless-and-agents.md)).

## Replay and threshold tuning
- [ ] Policy replay in `packages/core/src/learning`: re-route stored answers under a candidate policy with zero System One calls
- [ ] Threshold suggester (`suggestThresholds` returning `ThresholdProposal`), the `policy.suggest` operation (`POST /api/v1/sets/{ref}/policy-suggestions`, a job), "Suggest from labels" in the policy editor (applies to the draft only), MCP `suggest_thresholds` and `sysone tune`

## Set health
- [ ] `question_daily` rollup (nightly) and `SetHealth` per set, version and question
- [ ] `GET /api/v1/sets/{ref}/health` (`health.get`) and `GET /api/v1/health` (`health.list`, worst first)
- [ ] Console Health tab on the set page and the org "Needs attention" list
- [ ] MCP `get_set_health` and `sysone health`

## Proposals
- [ ] `proposals` table with the kinds in [effectiveness-loop.md](../effectiveness-loop.md)
- [ ] Weekly threshold-refit job and health-rule proposals
- [ ] Proposals inbox in the console; accepting a proposal creates a draft only, and nothing publishes on its own
- [ ] MCP `list_proposals` and `decide_proposal`; `sysone proposals list|accept|reject`

## Experiments
- [ ] Champion/challenger across versions, models and policies (`experiments` table, `release_pointers.active_experiment_id`, `runs.experiment_id` and `arm`)
- [ ] Dual-run sampling: the challenger runs on `sample_pct` of the same states after the champion responds, never affects `effectiveAction`, and books experiment cost, not savings
- [ ] A production publish on a `controlled` or `full` set starts an experiment unless `skipExperiment` is set (always gated for agents)
- [ ] Experiment scorer job and the promotion rule; `experiment.promote` needs an approval for agents
- [ ] MCP `start_experiment`, `get_experiment` and `decide_experiment`; `sysone experiments start|get|promote|stop`

## New System One models
- [ ] `set.try_model` operation (`POST /api/v1/sets/{ref}/try-model`, a job): clone production with only the model changed, eval both on the same snapshot, re-tune thresholds, open a `model_upgrade` proposal ([system-one-models.md](../system-one-models.md))
- [ ] Model-upgrade candidates job, run when a model becomes stable
- [ ] Model upgrades page and the `model-upgrades` report, with eval deltas per pinned set
- [ ] MCP `try_model`; `sysone upgrade list` and `sysone upgrade try`

## Studio improve mode
- [ ] Improve mode in the Definition Studio ([definition-studio.md](../definition-studio.md)) and the `set.improve` operation (`POST /api/v1/sets/{ref}/improve`, a job): typed edits from the drafting split, scored on calibration, confirmed on test, output as a proposal (`question_fix`, `add_none_option`, `split_question` or `narrow_state`) with a draft diff and metric deltas; accepting it writes the draft, and nothing publishes on its own. Also `sysone improve` and MCP `improve_set` ([effectiveness-loop.md](../effectiveness-loop.md))

## Evals and data
- [ ] Eval repeats (`--repeats`) and a stability metric per question
- [ ] Same-snapshot regression gate on dataset snapshots
- [ ] Learning retention: copy labeled or feedback-bearing runs into `dataset_cases`, redacted, before state is purged ([security.md](../security.md))
- [ ] Dataset features endpoint `GET /api/v1/datasets/{id}/features` (`dataset.features`), drafting and calibration splits only

## Value
- [ ] Quality-adjusted value in rollups and set health, shown next to gross savings in the Savings and ROI report ([savings-model.md](../savings-model.md)) (Billing / Savings, with Quality / Learning for precision inputs)

## Exit gate
- On a seeded set with 500 labeled fixture runs, an agent using only MCP tools gets a threshold suggestion, applies it to a draft, runs a challenger, and promotes it after admin approval.
- Registering a new stable model in the registry lists every pinned set in that family on the Model upgrades page, and try-model produces an eval comparison and a proposal.
- Injected drift triggers auto-demote and an alert event.
- No endpoint returns a test-split case.
