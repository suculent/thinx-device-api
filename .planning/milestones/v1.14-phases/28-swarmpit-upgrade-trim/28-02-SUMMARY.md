---
phase: 28-swarmpit-upgrade-trim
plan: 02
subsystem: ops/swarm
status: complete
tags: [production, swarm, swarmpit, influxdb, trim, autoredeploy, gate]
requires:
  - 28-01 (runbook, Step 0 baselines, gate 0, swarmpit_db dump)
provides:
  - Swarmpit 1.9 running without the stats stack (statistics false, swarmpit_influxdb removed, SWARMPIT_INFLUXDB gone from app)
  - p28_gateA PASS on the trimmed stack (sla_s=31)
  - Step A snapshots swarmpit-stack.A.{pre,post}.yml and the two saved influxdb conf copies
  - D-13 done (influxdb.conf and its .bak deleted after a clean union mount scan)
affects: [28-03, 28-04]
tech-stack:
  added: []
  patterns:
    - "Stack-file change via one awk pass from the backup into a temp file, checked before mv, then docker stack deploy --resolve-image changed and an explicit docker service rm"
    - "Union mount scan (3x service ls + per-stack services) before deleting any bind source"
key-files:
  created:
    - .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml
    - .planning/runbooks/swarm-configs/swarmpit-stack.A.post.yml
    - .planning/runbooks/swarm-configs/swarmpit-influxdb.A.pre.conf
    - .planning/runbooks/swarm-configs/swarmpit-influxdb-bak-20260521200918.A.pre.conf
  modified:
    - .planning/runbooks/swarmpit-upgrade.md
decisions:
  - "D-01 held: the trim ran on the known 1.9 before any upgrade, and Gate A passed on the first push (sla_s=31), so D-11 rung 1 was not needed"
  - "D-13: influxdb.conf and its .bak were deleted only after 0 references across 21 services and both nodes' containers. The orchestrator ran the deletion after the classifier refused it to the executor and the operator approved it"
  - "D-14: swarmpit_influx-data kept on micro for plan 28-04. Core also holds a swarmpit_influx-data volume (research A6 assumed none), and 28-04 must handle it"
metrics:
  duration: "~21 min (Step A start 11:01 UTC, D-13 evidence committed 11:22 UTC; 2026-10-05), including the operator checkpoint for the rm"
  completed: 2026-10-05
estimate:
  tokens: 95000
  tasks: 2
actuals:
  tokens: 2820
  tasks: 2
  commits: 4
plan_head_before: b3fa9de10999351300a733a90342f8c796165d38
plan_head_after: 0e87a166635bc5926e3ff8698f7eae83690494af
---

# Phase 28 Plan 02: Step A, the Swarmpit stats trim on 1.9, Gate A and D-13 Summary

Swarmpit is still on 1.9 but no longer runs its stats stack. `swarmpit_influxdb` is gone, `swarmpit_app` has no `SWARMPIT_INFLUXDB` and `/version` reports statistics false. The first push after the trim redeployed thinx_api in 31 s. swarmpit_db, swarmpit_agent and thinx_influxdb kept their Step 0 tasks and digests. The orphaned `swarmpit/influxdb.conf` and its `.bak` were deleted only after a mount scan found 0 references. The Step A rollback inputs are still in place: the A.pre backup, the conf copies and the retained volume.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Step A trim on 1.9, snapshots, Gate A | fb7eceae (pushed, gate), 8fca9c40 (local) | swarm-configs/swarmpit-stack.A.{pre,post}.yml, swarmpit-influxdb*.A.pre.conf, swarmpit-upgrade.md |
| 2 | D-13 union mount scan, conf deletion, Step A close | de4fec22 (local, scan), 0e87a166 (local, deletion evidence) | swarmpit-upgrade.md |

The three local commits (8fca9c40, de4fec22, 0e87a166) go out with the Gate B push in plan 28-03. All four are GPG-signed (`%G?` = G).

## Evidence

- **Step A apply (11:01–11:05 UTC):**
  - Pre-state matched Step 0 on every token.
  - `p28_A_pre_sha=2f84f4033868` and `p28_A_post_sha=d61396af4b36`. The edit had 0 added and 25 removed lines, no influx line, only app, db and agent left, and both 1.44 pins kept.
  - Deployed at 11:02:53.724Z with `--resolve-image changed`, followed by `docker service rm swarmpit_influxdb`.
  - New app task `nn7ssiwqmmmo` was Running at +5 s. The port line appeared at +104 s.
  - swarmpit_db `isp4hjomiuzg` (core, `ee75c9a737e7`) and swarmpit_agent `bju4mnwpbuz3+tcrkflv13cge` (`1306e2a2f538`) were unchanged, as was thinx_influxdb `lpl1pp201yyi`.
  - `rows_same=1` and `v2_same=1` against the D-07 dump.
- **Gate A:** `p28_gateA=PASS`, sha `fb7eceae`, base `c53cc788`, push_end 11:11:55.304Z, Running 11:12:26.606Z, `sla_s=31`, digest `10682b0b5f4d`. CircleCI `test` #15696 and `api-registry` #15697 were green. DIFF-HYGIENE-OK. `p28_stepA=PASS`.
- **D-13:**
  - `p28_services_scanned=21`, `p28_conf_refs=0`.
  - Container scans found 0 references on micro (25 containers) and 0 on core (15).
  - The orchestrator ran the deletion at 2026-10-05T11:19:01Z after operator approval. It used exact paths: `swarmpit/influxdb.conf` (372 B, `cd6b52c936bf`) and `swarmpit/influxdb.conf.bak.20260521200918` (188 B, `ad5da389aa0a`).
  - Post-check at 11:22 UTC: 0 `influxdb.conf*` entries left, `couchdb-logging.ini` present, both `/root/phase28/*.A.pre` copies present with unchanged hashes, db task and app task unchanged, statistics false, `influx_vol=1`.

## Verification results

| Check | Result |
| ----- | ------ |
| SNAPSHOTS-A-OK | printed (Task 1) |
| STEP-A-STATE-OK | printed (Task 1) |
| GATE-A-WITHIN-SLA | printed (`sla_s=31`) |
| DIFF-HYGIENE-OK | printed (secret 0, endpoint 0, port 0, outside_planning 0, skip_ci 0, unsigned 0) |
| D13-OK | printed at 11:22 UTC (`services_scanned=21 conf_refs=0 conf_present=0 couch_ini=1 saved_copies=2 influx_vol=1`) |
| § Rollback A names the conf restore source | yes (step 1: `/root/phase28/influxdb.conf.A.pre` or the committed `swarmpit-influxdb.A.pre.conf`) |

## Deviations from Plan

1. **D-13 deletion run by the orchestrator, not the executor.** The executor's permission classifier refused the exact-path `rm -f`. Following the runbook, the executor returned a checkpoint without trying a workaround. The operator approved ("approve rm") and the orchestrator ran the same exact-path command at 11:19:01Z. The executor then ran D13-OK and recorded the evidence. The result is the same as the plan intended.
2. **Task 2 split over two commits.** The scan evidence (de4fec22) was committed before the checkpoint, and the deletion evidence (0e87a166) was committed with the plan's commit message after it. Both are local and go out with the Gate B push.

## Auth gates

- **Task 2, rm on micro:** a permission-classifier denial was handled as `checkpoint:human-action`. The operator approved and the orchestrator executed. The commits needed no signing exception.

## Observations / follow-ups (recorded, not fixed)

- **For 28-04 (Step C, D-14):** core also holds a `swarmpit_influx-data` volume. Research A6 assumed there was none. Plan 28-04 should record its size and age through CORE_SSH and decide whether to remove it along with micro's copy (117M at Step 0).
- The double `swarmpit.db-data` label and micro's stale `swarmpit.influx-data` label carry over from 28-01 for the Step C docs.

## Known Stubs

None.

## Threat Flags

None. No new network surface. T-28-07 was mitigated by the union scan, the exact-path rm and the `couchdb-logging.ini` presence check. T-28-08 was mitigated by the secret-value gate on the snapshots, and `couchdb-logging.ini` was never copied.

## TDD Gate Compliance

Not applicable (execute plan, docs and ops only).

## Self-Check: PASSED

All created files are present, commits fb7eceae, 8fca9c40, de4fec22 and 0e87a166 exist and are signed, and this SUMMARY has 0 manager endpoint or key-name hits.
