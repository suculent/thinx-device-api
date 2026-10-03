---
phase: 27-influxdb-2-upgrade
plan: 06
subsystem: infra
tags: [production, influxdb, retention, secrets, decision, one-way]

requires:
  - phase: 27-influxdb-2-upgrade
    provides: "27-05: thinx_influxdb on dhi.io/influxdb:2.9.1 with the migrated history (all-time 2402, W80 501), unmounted INFLUXDB_TOKEN secret, /dev/shm/p27 staged on micro; 27-04: the dormant v2 connector with the boot ensure (adopt path)"
provides:
  - "Statistics live on InfluxDB 2: thinx_api mounts INFLUXDB_TOKEN, writes and reads bucket stats"
  - "Bucket stats with retention 7776000 s (90 d), shard-group 604800 s, same id as the former stats/autogen; DBRP stats/autogen -> stats kept"
  - "Clean bucket list: _monitoring, _tasks, stats only (six empty upgrade buckets dropped, D-15)"
  - "Staged operator credentials shredded; operator token only as the unmounted INFLUXDB_OPERATOR_TOKEN secret (D-11)"
  - "Annex token p27_enable=enable-all, which approves the Chronograf retirement for 27-07 (D-13)"
affects: [27-07, 28]

actuals:
  tokens: 1513
  tasks: 3
  commits: 2
plan_head_before: b1adacecaa1cd2e852d457bcb2f382fa302a651a
plan_head_after: 77f5c2d0b37ebd61f96d4ce23d73c5f420cd1916

tech-stack:
  added: []
  patterns:
    - "Bucket id compared across a rename through a tmpfs file (never printed), shredded with the staged credentials"
    - "CSRF-primed anonymous failed login as a production write probe: mktemp jar, token in a variable then unset, only HTTP code and counts printed"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-06-SUMMARY.md
  modified:
    - .planning/runbooks/influxdb2-upgrade.md

key-decisions:
  - "Operator answered enable-all (D-01, D-13, D-15): stats enabled with the 90-day trim, six empty buckets dropped, Chronograf retirement approved for 27-07"
  - "Applied at 12:05 UTC 2026-10-03 inside the normal window; the operator's 22:55 'Now (extend override)' authorization was recorded but not needed"
  - "The _monitoring and _tasks DBRP rows are InfluxDB-generated virtual mappings (virtual=true, not deletable); stats/autogen -> stats is the only stored mapping, which satisfies the plan's 'only the stats mapping'"

patterns-established:
  - "Re-take an aggregate count and re-check tmpfs staging before a one-way step that resumes after an overnight decision gap"

requirements-completed: [OPS-INFLUX-01, OPS-INFLUX-02, OPS-INFLUX-03]

coverage:
  - id: D1
    description: "thinx_api mounts INFLUXDB_TOKEN; its boot ensure adopted stats/autogen as stats (one action=adopted line, no failed/skipped)"
    requirement: OPS-INFLUX-02
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify 1 (state line): p27_enable=enable-all, shm_left=0, api_token_mounted=1, ensure_ok=1, ensure_bad=0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bucket stats has 90-day retention (7776000 s), legacy stats/autogen gone, bucket id kept, last-80-day window counts equal to the 1.8 reference"
    requirement: OPS-INFLUX-03
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify 2: probe inside thinx_api -> INFLUX-STATS-PROBE OK, bucket_retention_s=7776000, legacy_bucket_present=0, every count_window_* = p27_v1_window, bucket_names=_monitoring,_tasks,stats -> RETENTION-90D-HISTORY-KEPT; bucket_id_kept=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real production event is written to InfluxDB 2 (write path, success criterion 2)"
    requirement: OPS-INFLUX-02
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify 3: CSRF-primed POST /api/v2/login unknown user -> 403 invalid_credentials, count_10m_LOGIN_INVALID 0 -> 1 -> LIVE-WRITE-REACHES-V2"
        status: pass
    human_judgment: false
  - id: D4
    description: "Six empty upgrade buckets deleted after a zero-writes re-check; only _monitoring, _tasks, stats remain"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 3 step 6: writes_since_cutover_*=0 and delete_rc=0 for all six; bucket list and probe bucket_names=_monitoring,_tasks,stats"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dashboard and Visits show non-zero weekly figures; a test-device check-in appears in count_10m_DEVICE_CHECKIN within 10 minutes"
    requirement: OPS-INFLUX-02
    verification: []
    human_judgment: true
    rationale: "Plan human-check for end-of-phase UAT: needs a logged-in console session and a physical test device"

duration: 5min (Task 3 continuation; Task 1 ran 2026-10-02 22:51-22:53)
completed: 2026-10-03
status: complete
---

# Phase 27 Plan 06: Enable stats on InfluxDB 2 Summary

**thinx_api now writes and reads statistics on InfluxDB 2: the boot ensure adopted `stats/autogen` as `stats` with 90-day retention and the same bucket id, the last 80 days of history match the 1.8 reference exactly, a live failed login reached the bucket, and the six empty upgrade buckets are gone.**

## Performance

- **Duration:** Task 1 2026-10-02 22:51–22:53 UTC; decision relayed overnight; Task 3 2026-10-03 12:04–12:09 UTC (about 5 min)
- **Started:** 2026-10-02T22:51:00Z
- **Completed:** 2026-10-03T12:09:24Z
- **Tasks:** 3 of 3 (tracer, decision, apply)
- **Files modified:** 1 (runbook annex), plus this SUMMARY

## Accomplishments

- **Enable** at `T_enable=2026-10-03T12:05:27Z`: one `docker service update --secret-add INFLUXDB_TOKEN thinx_api`, converged in 21 s on micro, same image digest `sha256:7b2f5e43d343`, RestartCount 0, CSRF endpoint 200 straight after.
- **Adoption (D-03):** exactly one `[influx] ensure bucket=stats action=adopted`, no failed or skipped line, no CLI fallback. `stats` = 7776000 s, shard group 604800 s, `bucket_id_kept=1`, DBRP `stats/autogen` → `stats` kept.
- **History (success criterion 1):** every `count_window_*` equals `p27_v1_window` (total 501). `window_equal_after_trim=1`.
- **Write path (success criterion 2):** `POST /api/v2/login` for an unknown user returned 403 `invalid_credentials`. `count_10m_LOGIN_INVALID` went from 0 to 1 and `count_all_total` from 2402 to 2403. `write_proof=1`.
- **Drops (D-15):** `swarmpit_resolves=swarmpit_influxdb`. Zero writes since the cutover was re-checked before each delete. All six candidates were deleted and none was skipped. Buckets left: `_monitoring`, `_tasks`, `stats`.
- **Edge:** `D14-EDGE-OK` (HTTP 301 to https, HTTPS 401 without credentials).
- **Shred:** `/dev/shm/p27` removed (6 files, `shm_left=0`). `INFLUXDB_OPERATOR_TOKEN` stays an unmounted secret.

## Task Commits

1. **Task 1: tracer (read-only), enable readiness** — `28a9e7be` (docs, signed)
2. **Task 2: decision** — answered `enable-all` (no commit; recorded in the Task 3 annex row "enable decision")
3. **Task 3: apply enable-all** — `77f5c2d0` (docs, unsigned under the operator exception, see Deviations)

**Plan metadata:** this SUMMARY commit (docs: complete plan)

## Files Created/Modified

- `.planning/runbooks/influxdb2-upgrade.md`: annex rows "enable readiness" (Task 1), "enable decision" (`p27_enable=enable-all`, re-check before the one-way step) and "enable" (T_enable, adoption, retention, history, write proof, drops, D-14, shred)
- `.planning/phases/27-influxdb-2-upgrade/27-06-SUMMARY.md`: this file

## Decisions Made

- `enable-all` (operator, Task 2): D-01 trim armed, D-15 drops applied, D-13 Chronograf retirement approved for 27-07.
- The window was checked at 12:04 UTC on 2026-10-03, which is valid. The overnight "extend override" authorization was recorded but not needed.
- The virtual DBRP rows for `_monitoring` and `_tasks` are generated by InfluxDB and cannot be deleted. They count as system mappings, so the plan's "only the stats mapping" condition is met.

## Deviations from Plan

### Operator-sanctioned exceptions

**1. Task 3 commit is unsigned**
- **Found during:** Task 3 commit
- **Issue:** `git commit -S` failed: `gpg: cannot open '/dev/tty'`. The gpg-agent passphrase cache had expired overnight, so signing needed a TTY.
- **Fix:** Committed with `git -c commit.gpgsign=false` under the operator exception in the dispatch prompt. Hooks ran normally (no `--no-verify`). The SUMMARY commit uses the same exception if signing still fails.
- **Commit:** `77f5c2d0` (`%G?` = N)

### Minor procedure notes

- To prove the bucket id was kept, the `stats/autogen` id went into `/dev/shm/p27/stats_bucket_id` (umask 077) and was compared after the rename, never printed. It was shredded with the other staged files.
- The DBRP check found two `virtual=true` rows for the system buckets (see Decisions).

**Total deviations:** 1 operator-sanctioned exception (unsigned commit). **Impact:** none on production. Provenance: commit `77f5c2d0` is unsigned and can be re-signed by the operator if needed.

## Issues Encountered

- None in production. The trim had not run yet when the evidence was taken: `count_all_total` was 2403 at 12:08, and InfluxDB checks retention every 30 minutes. The plan checks the retention setting (A-27-3), not the deletion itself. Points 90–97 days old may linger because whole 7-day shard groups are dropped.

## Known Stubs

None.

## Threat Flags

None. No new surface: the token mount was planned (T-27-22..25 mitigations applied: decision gate, zero-writes re-check per delete, mktemp jar unset and removed, `shm_left=0`).

## User Setup Required

None.

## Next Phase Readiness

- **27-07 can start:** mirror the live state into `docker-swarm.yml` and the gluster `thinx.yml`. That covers `INFLUXDB_TOKEN` on api plus a top-level `secrets:` entry, because a `restart.sh` or stack deploy would drop the mount. Then retire Chronograf (approved), run the success-criterion-5 push test and take the D-02/D-07 deletion decision.
- **End-of-phase UAT (human-check):** the Dashboard and Visits show non-zero weekly figures, and a test-device check-in appears in `count_10m_DEVICE_CHECKIN` within 10 minutes. A blank CheckinsTimeline is expected (A-27-2).
- **Phase 26 UAT test 3** (after 09:40 UTC today): `thinx_api` rolled once at 12:05 (about 20 s). Results taken before that time may have hit the old task.
- The Swarmpit autoredeploy label on `thinx_influxdb` is still a follow-up for 27-07 or Phase 28.

## Self-Check: PASSED

- `.planning/runbooks/influxdb2-upgrade.md` contains `p27_enable=enable-all` exactly once.
- Commits `28a9e7be` and `77f5c2d0` are in `git log`.
- `RETENTION-90D-HISTORY-KEPT` and `LIVE-WRITE-REACHES-V2` were printed. The state line read `shm_left=0 api_token_mounted=1 ensure_ok=1 ensure_bad=0`.
