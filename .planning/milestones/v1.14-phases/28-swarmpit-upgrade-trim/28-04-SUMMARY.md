---
phase: 28-swarmpit-upgrade-trim
plan: 04
subsystem: ops/swarm
status: complete
tags: [production, swarm, swarmpit, cleanup, one-way, docs]
requires:
  - 28-03 (Step B on 1.10, Gate B PASS, p28_B_stable_min=10)
provides:
  - swarmpit_influx-data removed on micro by exact name after the last gate (D-14), recorded first (2022-02-11, 130M)
  - Phase 28 end state verified in one pass (1.10, stats off, swarmpit_db and swarmpit_agent equal Step 0, thinx_api 200)
  - /root/phase28 (D-07 dump and conf copies) shredded on micro, p28_shred=4
  - swarm.md recovery ladder current for Swarmpit 1.10 (rung 1 wait, private-registry image, rung 4 done)
  - Runbook "Phase 28 end state" section with gate deltas, remaining rollback sources and follow-ups
affects: [phase-28-verification, swarm-autopull-recovery skill (operator edit)]
tech-stack:
  added: []
  patterns:
    - "One-way volume removal gated on recorded Annex tokens (p28_stepB PASS, p28_B_stable_min >= 10), a container + cluster-wide service-mount reference scan, and a pre-removal record"
key-files:
  created:
    - .planning/phases/28-swarmpit-upgrade-trim/28-04-SUMMARY.md
  modified:
    - .planning/runbooks/swarmpit-upgrade.md
    - .planning/runbooks/swarm.md
key-decisions:
  - "Core's swarmpit_influx-data was not touched: reaching core needs CORE_SSH, a host outside the literal manager ssh form, so per the operator's instruction it is held for a human run (p28_d14_core=pending-operator, exact command in the Annex D-14 row)"
  - "The local swarm-autopull-recovery SKILL.md edit was excluded by the operator; the intended text is listed under Operator follow-up below"
  - "Duplicate p28_stepA= token tidied: the D-13 row now names it without '=' (runbook token convention)"
requirements-completed: [OPS-SWARM-01, OPS-SWARM-02]
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 7200
  tasks: 2
  commits: 2
plan_head_before: 7f837494689bd6a512a29c1e7ce092876bffbc91
plan_head_after: 2f5816afd5bcf14371fac298a409591d2e440a95
metrics:
  duration: "~6 min (precondition check 12:25 UTC, Task 2 commit 12:29 UTC; 2026-10-05)"
  completed: 2026-10-05
duration: 6min
completed: 2026-10-05
---

# Phase 28 Plan 04: Step C close-out, D-14 volume removal, end state and recovery docs Summary

**Swarmpit's InfluxDB volume is gone from micro, recorded before removal (created 2022-02-11, 130M). Production ends Phase 28 on Swarmpit 1.10 with statistics off. swarmpit_db and swarmpit_agent kept their Step 0 tasks and digests. The credential-bearing D-07 dump has been shredded, and swarm.md describes the 1.10 recovery ladder. Core's copy of the volume is held for the operator.**

## Performance

- **Duration:** ~6 min (12:25–12:29 UTC, 2026-10-05). Every production step started outside 05:15–10:00 UTC (D-16).
- **Tasks:** 2/2. The local skill edit was excluded by the operator.
- **Files modified:** 2

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer, one-way) | D-14: record and remove swarmpit_influx-data, assert the end state | f9f3580e | swarmpit-upgrade.md |
| 2 | swarm.md rungs, runbook end state and follow-ups, /root/phase28 shredded | 2f5816af | swarm.md, swarmpit-upgrade.md |

Both commits are GPG-signed (`%G?` = G) and local. They are pushed with the 28-03 commits after the final docs commit, outside the window (D-16).

## Evidence

- **Preconditions (12:25 UTC):** the Annex holds `p28_stepA=PASS`, `p28_stepB=PASS` and `p28_B_stable_min=10`. `swarmpit_influxdb` was absent on the manager.
- **Reference scan on micro (12:26:07Z):**
  - Containers using the volume: 0.
  - 21 service specs scanned. This union scan is cluster-wide, so it also covers services on core.
  - Mount sources equal to `swarmpit_influx-data`: 0.
- **Record before removal:** `swarmpit_influx-data` on micro, driver local, stack label swarmpit, CreatedAt 2022-02-11T14:31:15Z, 130M (132 files). Step 0 measured 117M; the difference is InfluxDB's shutdown flush in Step A. `swarmpit_db-data` on micro: 1.
- **Removal (12:26:19Z):** `docker volume rm swarmpit_influx-data` by exact name, exit 0. After it, `influx_vol=0` and `db_vol=1`. Recorded as `p28_d14_removed=micro:130M`.
- **End state:**
  - `/version` reports `1.10-SNAPSHOT`, statistics false, API 1.44. The UI answers 200.
  - The swarmpit stack has agent, app and db only.
  - swarmpit_db: `isp4hjomiuzg` on core, `couchdb:2.3.0` `ee75c9a737e7`, Running. It mounts `swarmpit_db-data`, so that volume exists on core.
  - swarmpit_agent: `bju4mnwpbuz3+tcrkflv13cge`, `1306e2a2f538`.
  - swarmpit_app: `e3qc53lt51jg` (= `p28_app_taskB`), healthy, FailingStreak 0, RestartCount 0.
  - thinx_api: `ydaoq586u8v5` with the Gate B digest `f55fa456ca23`. csrf-token answers 200.
  - thinx_influxdb: `lpl1pp201yyi` on core, Running, 0 mounts under `/swarm/swarmpit/`.
- **Shred (12:28:36Z):**
  - `/root/phase28` was on ext4 and held 4 regular files (2584, 121, 372 and 188 bytes). Only sizes were listed.
  - Each file was removed with `shred -u`, then the directory with `rmdir`. Afterwards `test -e /root/phase28` is false. Recorded as `p28_shred=4`.
  - The gluster `.p28-A-pre` and `.p28-B-pre` backups stay. The live `swarmpit.yml` hash is `0fd7d2c2de8d` (= B.post).

## Verification results

| Check | Result |
| ----- | ------ |
| D14-OK | printed (influx_vol 0, db_vol 1, influx_svc 0, db task/digest and agent tasks = Step 0) |
| END-STATE-OK | printed (`1.10-SNAPSHOT`, statistics false, api 1.44, csrf 200) |
| CLOSE-DOCS-OK | printed (warmup_old 0, runbook_link 2, rung4_done 1, end_state 1, followups 7, shred 1, endpoint_leak 0, port_leak 0, skill_tracked 0) |
| DUMP-SHREDDED | micro part passed (`phase28_dir=0`); the SKILL.md `Phase 28` grep is **deferred to operator** (scope exclusion) |
| Token uniqueness | `p28_d14_removed`, `p28_d14_core`, `p28_shred`, `p28_stepA`, `p28_stepB`: 1 occurrence each |

## Deviations from Plan

### Operator-directed scope changes

**1. Local skill edit excluded.** Plan Task 2 step 2 (`.claude/skills/swarm-autopull-recovery/SKILL.md`) was not done. The operator will make that edit. The intended text is listed below. The DUMP-SHREDDED clause that greps the skill is deferred to the operator; it is not counted as a failure.

**2. Core volume held for the operator.** Plan Task 1 removes core's copy "only if step 2 found it there". 28-02 had found it there. Reaching core needs `CORE_SSH`, which points at a different host than the literal manager ssh form. The operator's instruction for this case was to remove micro's copy, record core's as a follow-up with the exact command, and return a `checkpoint:human-action`, so no core command was run:
- core's CreatedAt and size were not read;
- the per-node container scan was not run on core (the cluster-wide service-mount scan does cover core);
- micro's removal went ahead.

The pending state is recorded as `p28_d14_core=pending-operator`, with the command in the Annex D-14 row and in the runbook follow-ups.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate `p28_stepA=` token in the runbook.** The 28-02 D-13 row named the token with `=`, so the runbook's "each token appears exactly once" rule was broken. The row now reads "after p28_stepA reached PASS". Fixed in commit f9f3580e.

**2. [Rule 1 - Bug] swarm.md SLA recipe used an empty commit and Docker Hub.** The old recipe (`git commit --allow-empty`, `thinxcloud/api:latest` on Hub) contradicted the gate procedure: gate commits are never empty, and thinx-staging publishes to the private registry. The block now points at § Gate procedure in `swarmpit-upgrade.md` and records the Phase 28 deltas (32, 31 and 50 s). Fixed in commit 2f5816af.

## Operator follow-up: skill text

Edit `.claude/skills/swarm-autopull-recovery/SKILL.md` locally. It is not git-tracked, so do not commit it. Leave its ssh line unchanged.

1. **Rung 1 wait line:** replace the ~90 s "Swarmpit 1.9 JVM + CouchDB + InfluxDB warm-up" sentence with: "Wait ~3–4 min: Swarmpit 1.10 (JDK 17) needs ~2 min to listen at its 0.25 CPU limit, its healthcheck has a 300 s start period, and the first autoredeploy poll runs 60 s after boot. No InfluxDB since Phase 28."
2. **"Rungs 2-4" line:** mark rung 4 (upgrade Swarmpit) as done in Phase 28 (2026-10). Swarmpit runs `swarmpit/swarmpit:1.10` by tag with a healthcheck override, and swarmpit_db stays couchdb 2.3.0 with no migration. Point to `.planning/runbooks/swarmpit-upgrade.md`.
3. **History line:** add "Phase 28 (2026-10): Swarmpit 1.10, stats stack removed, agent kept".
4. Optional, to match swarm.md: where the skill names the image CircleCI pushes, use `registry.thinx.cloud:5000/thinx/api:swarm` (thinx-staging, private registry) instead of the Docker Hub `thinxcloud/api:latest`.

Check after the edit: `grep -q 'Phase 28' .claude/skills/swarm-autopull-recovery/SKILL.md && git ls-files -- .claude/skills/swarm-autopull-recovery/SKILL.md | wc -l` prints 0 (present, untracked).

## Operator follow-up: core volume (checkpoint:human-action)

Core still holds `swarmpit_influx-data`. Run the core command from the Annex D-14 row through `CORE_SSH`, one ssh host per call. It does the following, in order:
- a container reference count (expect 0);
- CreatedAt and `du -sh` of the volume;
- `docker volume rm swarmpit_influx-data` by exact name;
- counts afterwards: influx volume 0, `swarmpit_db-data` 1.

Never use prune or a pattern, and never touch `swarmpit_db-data`. Then replace `p28_d14_core=pending-operator` in the Annex with `p28_d14_core=removed:<size>` and the CreatedAt.

## Other follow-ups (recorded in the runbook, not fixed)

- Double `swarmpit.db-data` node label, and a stale 2022 `swarmpit_db-data` on micro (Pitfall 4).
- Micro still carries the stale `swarmpit.influx-data` label.
- dhi.io 401 autoredeploy noise from the labels on `thinx_couchdb` and `thinx_influxdb`.
- The gluster swarm git HEAD is stale.
- docker-ce 29.8.2 is pending on micro.
- `swarmpit/agent:latest` can move under `--resolve-image always`.
- Closed: the Phase 27 "Swarmpit influxdb DNS" follow-up, resolved by Step A.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. There is no new surface. T-28-16 was mitigated by the exact-name removal: D14-OK shows `db_vol=1` on micro, and the swarmpit_db task and digest equal Step 0. T-28-17 by the shred: `phase28_dir=0`, and only the file count was recorded. T-28-18 by the pre-removal record and signed commits. T-28-19 by the CLOSE-DOCS-OK leak counters (0): the swarm.md edits use the `ssh micro` alias, and the committed core command uses the `CORE_SSH` placeholder.

## TDD Gate Compliance

Not applicable (execute plan, docs and ops only).

## Self-Check: PASSED

- `.planning/runbooks/swarmpit-upgrade.md`, `.planning/runbooks/swarm.md` and this SUMMARY are present.
- Commits f9f3580e and 2f5816af exist and are signed.
- `p28_d14_removed`, `p28_shred` and `p28_d14_core` each appear exactly once in the Annex.
- This SUMMARY has 0 manager endpoint, key name or port hits.
