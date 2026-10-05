---
phase: 28-swarmpit-upgrade-trim
plan: 01
subsystem: ops/swarm
status: complete
tags: [production, swarm, swarmpit, autoredeploy, baseline, backup, descope]
requires: []
provides:
  - .planning/runbooks/swarmpit-upgrade.md (conventions, gate procedure, Steps 0/A/B/C, rollback, Annex)
  - p28_gate0 PASS baseline on unchanged Swarmpit 1.9 (sla_s=32)
  - Step 0 baselines (p28_db_*, p28_agent_*, p28_app_*0, p28_influx_task, p28_version0, p28_drift=0)
  - root-only swarmpit_db dump on micro (/root/phase28, 7 rows)
  - OPS-SWARM-03 descoped (D-12) in REQUIREMENTS.md and ROADMAP.md
affects: [28-02, 28-03, 28-04]
tech-stack:
  added: []
  patterns:
    - "Gate = real thinx-staging push; SLA clock from CircleCI push-step end_time to thinx_api task Status.Timestamp (RFC3339)"
    - "Pre-push diff-hygiene scan over origin/thinx-staging..HEAD"
key-files:
  created:
    - .planning/runbooks/swarmpit-upgrade.md
  modified:
    - .planning/runbooks/swarm-configs/README.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - "D-02 engine gate passed (micro 29.8.1, core 29.8.1, min API 1.40): D-01 order stands, trim on 1.9 first, then 1.10"
  - "D-12 applied: swarmpit_agent stays, OPS-SWARM-03 moved to Future Requirements; v1.14 is 24 requirements"
  - "D-11a confirmed empirically: a .planning-only push builds and pushes thinx/api:swarm and autoredeploys thinx_api"
  - "D-17 drift is 0: stack file equals live spec for app/db/influxdb/agent, no reconciliation, no swarmpit-stack.0 snapshot"
metrics:
  duration: "~20 min (engine gate 10:02 UTC, plan complete 10:22 UTC; 2026-10-05)"
  completed: 2026-10-05
estimate:
  tokens: 85000
  tasks: 2
actuals:
  tokens: 7410
  tasks: 2
  commits: 3
plan_head_before: 1b60334b6bee36a93d0c09b7765bd0d309526f7b
plan_head_after: ec24fe86ceeef20d669ccf5cd0ce3b8c76f5f413
---

# Phase 28 Plan 01: Swarmpit runbook, OPS-SWARM-03 descope, gate 0 and Step 0 pre-flight Summary

The Phase 28 runbook is written and public. OPS-SWARM-03 is descoped (D-12). One real `.planning`-only push to thinx-staging went through the full gate pipeline on unchanged Swarmpit 1.9 and passed in 32 s with a matching digest. Step 0 recorded zero stack drift and every untouched baseline, and the swarmpit_db registry-credential store is backed up root-only on micro.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Engine gate, runbook + D-12 descope + snapshot README, pre-window push measured as gate 0 | c53cc788 (pushed), 75de6447 (local) | swarmpit-upgrade.md, swarm-configs/README.md, REQUIREMENTS.md, ROADMAP.md |
| 2 | Step 0 read-only pre-flight, D-07 dump, rung 1 staged | ec24fe86 (local) | swarmpit-upgrade.md |

The two local commits ride the Gate A push in plan 28-02, as the plan specifies.

## Evidence

- **D-02:** `p28_engine` micro 29.8.1, core 29.8.1, `p28_minapi` 1.40. Neither engine is in 29.0–29.2. The existing 1.44 API pins on swarmpit_app are load-bearing and stay in place (Pitfall 2).
- **Gate 0 (tracer feedback gate):** base `c5d5be46`, pushed `c53cc788` (7 signed commits, all under `.planning/`). CircleCI `test` #15689 and `api-registry` #15690 both passed. push_end 10:17:56.022Z, thinx_api task `zkz1kctc1y8s` Running 10:18:28.164Z with digest `b9f5a9c21373`, so `sla_s=32`. One `autoredeploy fired` line for thinx_api; csrf-token returned 200. The tracer `<verify>` checks were re-run end to end: D12-DOCS-OK, RUNBOOK-OK, GATE-0-WITHIN-SLA and DIFF-HYGIENE-OK all printed.
- **Step 0:**
  - Drift: 0.
  - swarmpit_db: task `isp4hjomiuzg` on core, digest `ee75c9a737e7`.
  - swarmpit_agent: tasks `bju4mnwpbuz3+tcrkflv13cge`, digest `1306e2a2f538`.
  - swarmpit_app: task `lnae2pqi6e1m`, digest `8e0f8b86f281`.
  - thinx_influxdb: task `lpl1pp201yyi`.
  - `/version`: 1.9, statistics true, API 1.44.
  - Dump: 7 rows, 2584 bytes (dockerhub 1, migration 3, secret 1, user 1, v2 1).
  - `_users`, `_replicator` and `_global_changes` each answer 401.
  - STEP0-TOKENS-OK and DUMP-OK both printed.

## Verification results

| Check | Result |
| ----- | ------ |
| D12-DOCS-OK | printed (`v114=0 future=1 trace=0 count24=1 old_paren=0 sc3=0 req_line=1 goal_old=0 list_old=0`) |
| RUNBOOK-OK | printed (re-run after each runbook change) |
| GATE-0-WITHIN-SLA | printed (`sla_s=32`, recomputed from CircleCI) |
| DIFF-HYGIENE-OK | printed (secret 0, endpoint 0, port 0, outside_planning 0, skip_ci 0, unsigned 0) |
| STEP0-TOKENS-OK | printed |
| DUMP-OK | printed (dir 700, file 600, rows 7, sha_ok 1) |
| `origin/thinx-staging` == gate-0 sha | yes (`c53cc788…`) |
| All docs(28-01) commits signed | yes (`%G?` = G for all three) |

## Deviations from Plan

None that change behaviour. Two bookkeeping notes:

1. **Annex "pre-flight engine" row location.** The previous executor wrote this row with the runbook, so it landed in the first commit (c53cc788) rather than the gate-0 commit (75de6447) that action step 8 names. The token appears once and was in place before any push, which is what D-02 requires.
2. **Requirements not marked complete.** The plan's `requirements` field lists OPS-SWARM-01/02/03. OPS-SWARM-01 and OPS-SWARM-02 are delivered by plans 28-02 to 28-04, and OPS-SWARM-03 is now a Future Requirement with no v1.14 checkbox, so `requirements.mark-complete` was skipped on purpose.

## Auth gates

- **Task 1 commit (previous executor):** GPG signing failed because there was no tty, so the run returned `checkpoint:human-action`. The operator unlocked the agent, and every commit in this continuation was signed normally. No `p28_unsigned_exception` was needed.

## Observations / follow-ups (recorded, not fixed)

- Both nodes carry `swarmpit.db-data=true`, so swarmpit_db could float between two divergent volumes (Pitfall 4). micro also still carries `swarmpit.influx-data=true`.
- Over 24 h, 2378 `autoredeploy failed` lines (1189 each for thinx_couchdb and thinx_influxdb, dhi.io 401). This is pre-existing noise and has no gate significance.
- `swarmpit_influx-data` on micro is 117M (research read 121M), for the D-14 comparison in plan 28-04.
- The same push also redeployed thinx_console and thinx_vue through their registry jobs, as the research expected.

## Known Stubs

None.

## Threat Flags

None. No new network surface. The dump stays root-only on micro (T-28-01), and the pushed range carries no endpoint, key name or port (T-28-02).

## TDD Gate Compliance

Not applicable (execute plan, docs and ops only).

## Self-Check: PASSED

All created files are present, commits c53cc788, 75de6447 and ec24fe86 exist, and 0 manager endpoint or key-name hits in this SUMMARY.
