---
phase: 28-swarmpit-upgrade-trim
plan: 03
subsystem: ops/swarm
status: complete
tags: [production, swarm, swarmpit, upgrade, healthcheck, autoredeploy, gate]
requires:
  - 28-02 (Step A trim on 1.9, Gate A, A.post snapshot)
provides:
  - Swarmpit 1.10 (swarmpit/swarmpit:1.10 by tag, spec digest 15c044a82fed) running healthy on the trimmed stack
  - Stack-file healthcheck override (start_period 300s) under compose 3.8, both 1.44 API pins kept
  - p28_gateB PASS on Swarmpit 1.10 (sla_s=50) and p28_stepB=PASS
  - Step B snapshots swarmpit-stack.B.{pre,post}.yml and the gluster backup .p28-B-pre (rollback source to 1.9)
affects: [28-04]
tech-stack:
  added: []
  patterns:
    - "awk edit program kept as a local file and piped to `awk -f /dev/stdin` on the manager, with an END block that fails unless every anchor matched exactly once"
    - "Readiness loop that waits for health=healthy, the port line and /version together, run in the background and bounded at deploy + 8 min"
key-files:
  created:
    - .planning/runbooks/swarm-configs/swarmpit-stack.B.pre.yml
    - .planning/runbooks/swarm-configs/swarmpit-stack.B.post.yml
  modified:
    - .planning/runbooks/swarmpit-upgrade.md
decisions:
  - "D-03 held: the file names swarmpit/swarmpit:1.10 by tag. The CLI resolved it to the index digest 15c044a82fed, the same digest research recorded"
  - "D-04 held: Docker Hub still lists only latest, 2.2, 2.1 and 2.0 for swarmpit/agent, and latest is the production digest 1306e2a2f538. The agent was left untouched"
  - "D-06 held: 1.10 wrote nothing to swarmpit_db. All 7 documents hash equal to the D-07 dump and there were 0 migration log lines, so no dump restore was needed"
  - "D-11 not triggered: Gate B passed on the first push (sla_s=50), so rung 1 did not run"
metrics:
  duration: "~13 min (pre-checks 11:26:38 UTC, stability commit 11:39 UTC; 2026-10-05)"
  completed: 2026-10-05
estimate:
  tokens: 95000
  tasks: 2
actuals:
  tokens: 4230
  tasks: 2
  commits: 3
plan_head_before: 88a19d918c1ae4923ecee4eedd9fcc80c2f6c78f
plan_head_after: 7723e9de07cfa8208b04889120bd0729644e2abc
---

# Phase 28 Plan 03: Step B, Swarmpit 1.10 with the healthcheck override, Gate B and stability Summary

Production `swarmpit_app` now runs Swarmpit 1.10 (`/version` reports `1.10-SNAPSHOT`, statistics false, API 1.44). The stack file names the image by tag under compose 3.8. A stack-file healthcheck replaces the image's own healthcheck and gives the app a 300 s start period. The first push after the upgrade redeployed thinx_api in 50 s. swarmpit_db and swarmpit_agent kept their Step 0 tasks and digests, and every swarmpit_db document is byte-identical to the D-07 dump. The 1.10 task stayed healthy for 10 minutes with no restarts.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Step B: snapshot, 1.10 + compose 3.8 + healthcheck, deploy, readiness/D-06 proofs, Gate B | b8f1bf15 (pushed, gate), 76b1a15d (local, result) | swarm-configs/swarmpit-stack.B.{pre,post}.yml, swarmpit-upgrade.md |
| 2 | Stability hold, D-04 record, UI and log counts | 7723e9de (local) | swarmpit-upgrade.md |

The Gate B push also carried the five local 28-02 commits (8fca9c40, de4fec22, 0e87a166, 0cd6365d, 88a19d91). All pushed and local commits are GPG-signed (`%G?` = G).

## Evidence

- **Pre-checks (11:26–11:27 UTC):**
  - Engines are micro 29.8.1 and core 29.8.1, min API 1.40.
  - swarmpit_db is `isp4hjomiuzg` on core (`ee75c9a737e7`). swarmpit_agent is `bju4mnwpbuz3+tcrkflv13cge` (`1306e2a2f538`). swarmpit_app is `nn7ssiwqmmmo` on 1.9 (`8e0f8b86f281`).
  - The 1.10 manifest resolves on micro. `p28_B_index_digest` is `15c044a82fed`.
  - The D-07 dump checksum verifies. No thinx-staging CircleCI job was running.
- **Snapshot and edit:**
  - B.pre is byte-equal to A.post (`d61396af4b36`). The gluster backup is `swarmpit.yml.bak.20261005112754.p28-B-pre`, with the same hash.
  - The awk temp file parses under 3.8. Its diff against the backup is 2 removed and 8 added lines, with 0 `@sha256`.
- **Deploy and readiness:**
  - Deployed at `p28_B_deploy` 2026-10-05T11:28:17Z.
  - The new task is `e3qc53lt51jg`. Its port line came at +111 s, it turned healthy at +112 s and it was Running at +115 s. With a healthcheck, swarm keeps the task in Starting until it is healthy.
  - Log counts: port line 1, `Swarmpit DB already exist` 1, migration/token lines 0.
- **D-06:** `rows_same=1` (7 rows), `migrations=3` and `v2_same=1`. All 7 documents hash equal to the dump.
- **Untouched:**
  - The app spec image is `swarmpit/swarmpit:1.10@sha256:15c044a82fed…`.
  - The healthcheck StartPeriod is 5m0s, both 1.44 pins are present and `SWARMPIT_INFLUXDB` is 0.
  - The db and agent tasks and digests equal Step 0. `p28_B_post_sha` (`0fd7d2c2de8d`) equals the live file.
- **Gate B:**
  - Token: `p28_gateB=PASS`, sha `b8f1bf15`, base `fb7eceae`, push_end 11:36:43.589Z, Running 11:37:33.399Z, `sla_s=50`, digest `f55fa456ca23`.
  - CircleCI `test` #15704 and `api-registry` #15705 were green. The new thinx_api task is `ydaoq586u8v5`.
  - `autoredeploy fired` for thinx_api: 1. csrf-token: 200.
- **Stability (11:38:38Z):**
  - `p28_B_stable_min=10`. The task is still `e3qc53lt51jg`: healthy, FailingStreak 0, RestartCount 0.
  - The five checks after the start period (60 s apart) all passed. UI: 200.
  - Since push_end: `autoredeploy failed` 4 (dhi.io noise, 2+2), ERROR 4, all of them `autoredeploy failed` lines.

## Verification results

| Check | Result |
| ----- | ------ |
| SNAPSHOTS-B-OK | printed (pre_eq_A_post 1, added 8, removed 2, secret_value_lines 0, live_eq_post 1) |
| STEP-B-STATE-OK | printed (1.10-SNAPSHOT, healthy, hc_start 5m0s, pins 2, influx env 0, db/agent = Step 0) |
| SWARMPIT-DB-UNTOUCHED | printed (rows_same 1, migrations 3, v2_same 1, migr_logs 0) |
| GATE-B-WITHIN-SLA | printed (`sla_s=50`) |
| DIFF-HYGIENE-OK | printed before the push and over the recorded gate range (all counters 0) |
| STABLE-ON-1.10 | printed (task e3qc53lt51jg, healthy, failing 0, UI 200) |
| `.p28-B-pre` backup on micro hashes equal to B.pre | yes (`d61396af4b36`) |

## Deviations from Plan

None. The plan ran as written. Gate B passed on the first push, so the D-11 rung-1 and D-05 rollback branches did not run.

## Observations / follow-ups (recorded, not fixed)

- **Health probe cadence.** During the start period the engine probed every ~6 s (four exit-7 probes, then exit 0 at 11:30:09), not every 60 s. That is Docker's default `start_interval`, and it made the task healthy about a second after the port line. After the start period, the 60 s interval applies (checks 11:34:15 → 11:38:17).
- **Token convention (pre-existing, from 28-02):** `p28_stepA=` appears twice in the runbook. The 28-02 D-13 row names it with `=` outside its Annex row. This is harmless for the 28-03 verifies, which only parse the `p28_stepB`, `p28_gateB` and `p28_app_taskB` tokens; it is left for Step C cleanup.
- Gate B evidence sits in the result commit 76b1a15d and the stability commit 7723e9de. Both are local and go out with the next push (28-04).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. No new surface beyond the plan's threat model. T-28-10 was mitigated by the healthcheck override and the 10-minute hold. T-28-11 by SWARMPIT-DB-UNTOUCHED (all documents unchanged). T-28-12 by Gate B at 50 s. T-28-13 by counts-only log evidence (no swarmpit_app line was quoted). T-28-14 by the db and agent digests, which equal Step 0.

## TDD Gate Compliance

Not applicable (execute plan, docs and ops only).

## Self-Check: PASSED

swarmpit-stack.B.pre.yml, swarmpit-stack.B.post.yml and this SUMMARY are present. Commits b8f1bf15, 76b1a15d and 7723e9de exist and are signed. This SUMMARY has 0 manager endpoint or key-name hits.
