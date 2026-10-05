---
phase: 27-influxdb-2-upgrade
plan: 01
subsystem: infra
tags: [production, influxdb, backup, restore, rehearsal, swarm, dhi]

requires:
  - phase: 26-vue-console-log-paging
    provides: production change discipline, runbook and annex shape (log-paging-retention.md)
provides:
  - Verified portable InfluxDB 1.8 backup on both swarm nodes (sha256 manifest OK on both), retained until 27-07
  - Restore proof with equal stats counts at the backup reference time (restore_equal=1)
  - Upgrade rehearsal from the production DHI image with equal counts (rehearsal_equal=1) and DBRP kept across the rename (rehearsal_dbrp_kept=1)
  - Operator runbook .planning/runbooks/influxdb2-upgrade.md for the whole Phase 27 cutover
affects: [27-04, 27-05, 27-06, 27-07]

actuals:
  tokens: 8015
  tasks: 2
  commits: 2
plan_head_before: 0d28807c4fc823fbeb1535bfa7a39be1cc9bb728
plan_head_after: 5203d46801772f0ad9052a6b0031de67916682a1

tech-stack:
  added: []
  patterns:
    - "Node-local root-only backup under /root/phase27 with a relative-name sha256 manifest, second copy streamed node to node through an ssh pipe"
    - "Counts bounded by a reference time T, reduced on the node to taxonomy aggregates, compared key by key"
    - "Rehearsal credentials in /dev/shm with umask 077, passed only via --env-file, grep-checked absent, shredded"

key-files:
  created:
    - .planning/runbooks/influxdb2-upgrade.md
    - .planning/todos/completed/2026-10-02-backup-gluster-influx-data-before-phase-27.md
  modified: []

key-decisions:
  - "A6 settled: uid 65532 cannot read a root-0700 1.8 copy; the cutover chown -R 65532:65532 is required, not optional"
  - "Backup reference: p27_backup=influx-1.8-portable-20261002T1650Z, T=2026-10-02T16:50:14Z, held on core and micro until 27-07 (D-02)"
  - "Nodes cannot ssh to each other; the second copy streams through two ssh sessions from the operator machine without touching its disk"
  - "Rename to stats via the API boot ensure (adopt) in 27-06; the CLI bucket update is the documented fallback"

patterns-established:
  - "Plan-verify globs over /root/phase27/influx-1.8-portable-* also match the sibling .sha256 manifest; count dirs with a trailing slash"

requirements-completed: []

coverage:
  - id: D1
    description: "Portable backup of every 1.8 database on core and micro, one sha256 manifest checking OK on both"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 1: micro sha256sum -c -> BACKUP-COPY-INTACT; core sha256sum -c -> core_manifest_ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "Restore into a throwaway influxdb:1.8 container with stats counts at T equal to production (restore_equal=1)"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "v1_T_* vs restore_T_* aggregates, all 12 keys equal; Task 1 verify 2 state line restore_container=Exited restore_dir=1 gluster_new=0 influx_image=influxdb:1.8"
        status: pass
    human_judgment: false
  - id: D3
    description: "Upgrade rehearsal from dhi.io/influxdb:2.9.1 with equal counts, DBRP kept across the rename to stats/90d, no credential leaks, full teardown"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "v2_T_* == restore_T_*; dbrp same_bucket_id=1; token greps 0; Task 2 verify 1 scratch_containers=0 scratch_dirs=0 shm_left=0 gluster_new=0 backup_dirs=1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runbook with all required sections, annex tokens, and no host, key, port or 64-hex value"
    requirement: OPS-INFLUX-01
    verification:
      - kind: other
        ref: "Task 1 verify 3 -> RUNBOOK-BACKUP-RECORDED; Task 2 verify 2 -> RUNBOOK-REHEARSAL-RECORDED"
        status: pass
    human_judgment: false
  - id: D5
    description: "Cutover, rollback, F-2 and token procedures are correct and usable by the operator"
    verification: []
    human_judgment: true
    rationale: "Procedure prose for future one-way steps; only an operator review (and plans 27-04..27-07) can judge its adequacy"

duration: 8min
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 01: Verified 1.8 Backup and Upgrade Rehearsal Summary

**Portable InfluxDB 1.8 backup held on both nodes and proven restorable with equal counts (2379 points at T), plus a production-hardware rehearsal of the DHI 2.9.1 `influxd upgrade` that reproduced every count and kept the DBRP mapping across the rename to `stats`/90d.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-02T16:49:29Z
- **Completed:** 2026-10-02T16:58:17Z
- **Tasks:** 2
- **Files modified:** 2 (runbook created, todo moved)

## Accomplishments

- **Pre-flight (read-only):** `thinx_influxdb` runs `influxdb:1.8` (1 replica, Running 34 h) on node N = **core**. `swarmpit_resolves=swarmpit_influxdb`. Influx mentions in cron: core 0, micro 0 (research A3 settled). Free space: core `/root` 17.6 GB, micro `/root` 18.5 GB, `/mnt/gluster` 17.2 GB, micro `/dev/shm` 1.0 GB.
- **Backup:** `influxd backup -portable` (all databases) on core in 15 s. `p27_backup=influx-1.8-portable-20261002T1650Z`, T = `2026-10-02T16:50:14Z`. It holds 86 files and 4,228 KB: 8 `_internal` shard files and 76 `stats` shard files; `db0` and `swarmpit` are meta-only. Copies sit under `/root/phase27` (dir mode 700) on core and micro, and the manifest checks OK on both.
- **Counts at T (production = restore):** total 2379; APIKEY_INVALID 4, LOGIN_INVALID 1785, DEVICE_NEW 8, DEVICE_CHECKIN 539, DEVICE_REVOCATION 3, BUILD_STARTED 21, BUILD_SUCCESS 9, BUILD_FAILED 0; other measurements 10 with 10 points. **restore_equal=1.**
- **Rehearsal (micro, from the restored copy):**
  - Images: `dhi.io/influxdb:2.9.1` is `sha256:3d49ee8ee9a0`, the same digest as `:2`, running as user 65532. The `influxdb:2.9.1` CLI image is `sha256:db0bdab1e5ad`. The `influxdb:1.8` restore image is `sha256:299ebda2c7e3`.
  - The upgrade exited 0 in 3 s. Log success line: `Upgrade successfully completed. Start the influxd service now, then log in`.
  - Leak checks: token and password greps on stdout, `upgrade.log` and the CQ export were all 0, and no `configs` file landed in the data dir.
  - Buckets: `stats/autogen=0` (infinite), `stats/31d=2678400`, `db0/autogen=7776000`, `swarmpit/an_hour=3600`, `swarmpit/a_day=86400`, `swarmpit/autogen=0`, `upgrade-primary=3600`, `_monitoring=604800`, `_tasks=259200`.
  - DBRP before the rename: `stats/autogen` → bucket `stats/autogen`, default=true.
  - Counts: every `v2_T_*` value equals its `restore_T_*` value (total 2379). **rehearsal_equal=1.**
  - Rename to `stats` with 90d: `stats=7776000`, shard-group duration 604800, same bucket id. DBRP after: `stats/autogen` → bucket `stats`, default=true, same id. **rehearsal_dbrp_kept=1.**
  - **A6:** uid 65532 got `denied` on the root-0700 copy and `readable` after the chown, so the cutover chown is required.
- **Teardown:** scratch containers 0, scratch dirs 0, and `/dev/shm/p27r` shredded and removed. `/root/phase27` on each node holds only the backup dir and its manifest. The live service is unchanged (`influxdb:1.8` on core), and neither `/mnt/gluster/thinx/influxdb2` nor `influx-v1-upgrade-src` exists.
- **Runbook:** `.planning/runbooks/influxdb2-upgrade.md` covers conventions, backup and restore, the rehearsal, cutover (27-04 → 27-07), rollback, tokens and secrets, F-2 options A/B, enable and trim, bucket drops, Chronograf retirement, deletion, and the annex rows pre-flight, backup, restore and rehearsal.

## Task Commits

1. **Task 1 (tracer): pre-flight, backup on two nodes, verified restore**: `e4b3693f` (docs)
2. **Task 2: upgrade rehearsal, teardown, cutover runbook**: `5203d468` (docs)

Both commits are GPG-signed and not pushed; they ride the 27-04 push.

## Files Created/Modified

- `.planning/runbooks/influxdb2-upgrade.md`: Phase 27 operator runbook and annex
- `.planning/todos/completed/2026-10-02-backup-gluster-influx-data-before-phase-27.md`: folded todo moved from pending, with a Resolution line pointing at the annex

## Decisions Made

- The cutover chown to 65532 is mandatory (A6 settled on Linux).
- The second backup copy streams through an ssh pipe, because neither node can ssh to the other.
- The rename to `stats` is left to the API boot ensure (adopt) in 27-06, matching that plan. The runbook documents the CLI `bucket update` as the fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 commit initially missed two files**
- **Found during:** Task 1 commit
- **Issue:** A single `git add` listed the pending todo path, which `git mv` had already removed. That fatal pathspec error aborted the whole add, so the commit held only the rename: no runbook, and no Resolution line.
- **Fix:** Staged both files separately and amended the unpushed commit (signed).
- **Verification:** `git show --name-status HEAD~1` shows the runbook as `A` and the todo as `R076`.
- **Committed in:** `e4b3693f`

**2. [Rule 1 - Verify defect] Task 2 `backups=` check counts the manifest too**
- **Found during:** Task 2 verify
- **Issue:** `ls -d /root/phase27/influx-1.8-portable-*` matches both the backup dir and its sibling `influx-1.8-portable-{ts}.sha256`. Task 1's verify needs the manifest to sit there under exactly that name. So in the intended end state ("only the backup directory and its manifest remain") the check prints `backups=2`, not 1.
- **Fix:** No state change. I verified the intent with a dir-only glob: `backup_dirs=1 manifests=1 other_entries=0` on micro, and `core_backup_dirs=1` with only the dir and manifest on core.
- **Files modified:** none

**3. [Minor] Flux stop bound**
- In addition to the plan's `T + 1s` stop, the counts were re-run with `T + 1ns`, which matches InfluxQL `time <= T` exactly. Both gave identical results.

---

**Total deviations:** 2 auto-fixed (Rule 1), 1 minor addition.
**Impact on plan:** None on production. The commit content is now complete, and the verify defect is only in how the plan counts.

## Issues Encountered

- A portable backup and restore does not carry continuous queries, so the rehearsal's CQ export had no Swarmpit CQs. The real cutover upgrades the live data directory and will export the four Swarmpit CQs. They are not migrated, which is fine: Swarmpit writes to its own InfluxDB. This is recorded in the runbook.
- The backup was 4.2 MB, far below the research estimate of about 120 MB (A2).

## Threat Flags

None. No new network endpoint, auth path or schema surface. The backup sits root-only on node-local disk (T-27-01). The rehearsal credentials were throwaway, passed only via `--env-file` and shredded (T-27-02). The restore and rehearsal containers were capped and ran with `--network none` (T-27-03). The containers were selected by service label (T-27-04).

## User Setup Required

None.

## Next Phase Readiness

- The safety net for D-05 is in place on two nodes, and its location is recorded for D-07 deletion in 27-07.
- The cutover data path is proven with the production image. Plans 27-02/27-03/27-08 (code) and 27-04 (ship dormant) can proceed.
- OPS-INFLUX-01 is not marked complete: plans 27-05 and 27-06 also declare it (shared-ID gate).

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: .planning/runbooks/influxdb2-upgrade.md
- FOUND: .planning/todos/completed/2026-10-02-backup-gluster-influx-data-before-phase-27.md (pending copy gone)
- FOUND: e4b3693f, 5203d468 (both signed, `G`)
- Task 1 verify: BACKUP-COPY-INTACT, state line Exited/1/0/influxdb:1.8, RUNBOOK-BACKUP-RECORDED
- Task 2 verify: 0/0/0/0 plus backup_dirs=1 (see deviation 2), RUNBOOK-REHEARSAL-RECORDED
