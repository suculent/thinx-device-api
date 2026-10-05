---
phase: 26-vue-console-log-paging
plan: 08
subsystem: infra
status: complete
tags: [retention, production, ops, cron, one-way]

requires:
  - phase: 26-vue-console-log-paging
    provides: "26-04 retention CLI and wrapper contract; 26-07 Push 2 (running thinx_api image fbe53daf0a03 contains scripts/log-retention.js)"
provides:
  - "Retention wrapper installed on the manager (/usr/local/sbin/thinx-log-retention.sh, sha256 = repo file, root 0755)"
  - "First production retention apply with roots deploy,repos: audit 51, build records 103, deploy folders 4, repos folders 103 + orphans 61 deleted, 0 failures"
  - "Convergence proven: dry run afterwards audit_expired=0, zero record folders and orphans in both roots"
  - "Daily schedule /etc/cron.d/thinx-log-retention at 09:40 UTC, --apply --roots deploy,repos"
  - "Broken couchdb-log-retention cron.daily job retired to /usr/local/sbin/retired/"
  - "Runbook annex rows: retention install + dry run, retention apply + schedule, old job retired; Phase 26 footer"
affects: [end-of-phase verification, next parent push to thinx-staging (carries the unpushed docs commits), memory note couchdb-log-retention-job (now stale)]

actuals:
  tokens: 5641
  tasks: 3
  commits: 3
plan_head_before: c92fcc3e1ecd55f935dcaac74f085616c2cb3396
plan_head_after: 1e2c58effdfeda3ee1c4f3e1107c4e8cd31225d8

tech-stack:
  added: []
  patterns:
    - "One-way production job: dry run through the real runner, then a per-root operator decision, then apply, then a second dry run as the convergence proof, then the schedule"
    - "Gate values (approved roots, OTA baselines) live as single annex tokens so the verify commands read them instead of relying on the executor's memory"
    - "Retire, don't delete: superseded cron jobs move to /usr/local/sbin/retired/"

key-files:
  created:
    - .planning/phases/26-vue-console-log-paging/26-08-SUMMARY.md
  modified:
    - .planning/runbooks/log-paging-retention.md

key-decisions:
  - "Operator answered `all` at the Task 2 gate, so approved_roots=deploy,repos (audit on); the cron line uses the same scope"
  - "Default COUCHDB_HOST=couchdb works from a standalone container on thinx_internal, so neither the apply nor the cron file carries an override (closes research A7)"
  - "Schedule slot 09:40 UTC as planned; it was free and lies outside 01:00-05:00 and 06:00-07:10 UTC"
  - "Old job retired by move, not delete; its log and lock file left in place"
  - "Closeout commits not pushed (the plan says do not push; any thinx-staging push redeploys thinx_api)"

patterns-established:
  - "Retention evidence is aggregates only: counts, bytes, dates; verify gates reject 64-hex strings and paths in output and host log"

requirements-completed: [LOG-04]

duration: "about 21 min active (2026-10-02 11:46:57-11:56 Task 1, 11:58:35-12:08:32 Task 3 UTC), split by the Task 2 checkpoint"
completed: 2026-10-02
---

# Phase 26 Plan 08: Retention job live in production, old audit job retired Summary

**The retention job is running in production. The approved apply (`--apply --roots deploy,repos`) deleted 51 audit docs, 103 build records with 4 deploy and 103 repos folders, and 61 repos orphans, with 0 failures. That reclaimed about 226 MiB. A second dry run shows nothing left to delete, and the OTA and avatar counts are unchanged. A daily `/etc/cron.d` entry at 09:40 UTC runs the same scope. The broken `couchdb-log-retention` job was moved to `/usr/local/sbin/retired/`.**

## Performance

- **Duration:** about 21 min active. Task 1 ran 11:46:57–11:56 UTC; the operator then answered the gate; Task 3 ran 11:58:35–12:08:32 UTC.
- **Tasks:** 3 / 3 (tracer, decision, auto)
- **Files modified:** 1 (`.planning/runbooks/log-paging-retention.md`), plus this SUMMARY

## Accomplishments

### Task 1 (tracer): install and dry run (commit `c1856aee`)

- **Install.** The wrapper was installed at `/usr/local/sbin/thinx-log-retention.sh` and its sha256 matches the repo file. It is 755 and owned by root (WRAPPER-INSTALLED-MATCH).
- **Dry run.** Run through the real runner with both roots mounted read-only (RETENTION-DRYRUN-PROD-OK):
  - audit: 51 docs expired;
  - build records: 103 of 126 expired;
  - deploy root: 4 record folders (about 26 KiB), 0 orphans;
  - repos root: 103 record folders (about 24.7 MiB) and 61 orphans (about 201.7 MiB, mtimes 2021-07 to 2022-05).
- **Checks before the decision.**
  - The default host value `couchdb` worked.
  - Nothing was scheduled before approval (`no_schedule_yet=1`) and the old job was present (`old_job_present=1`).
  - OTA baselines recorded: `ota_baseline_build_json=2`, `ota_baseline_avatars=6` (OTA-BASELINE-RECORDED).
  - The 09:40 UTC slot was free.

### Task 2: per-root decision

- Operator answer: **`all`**, which maps to `--apply --roots deploy,repos` (audit on).

### Task 3: real run, convergence, schedule, retirement (commit `1e2c58ef`)

| Step | UTC | Result |
|---|---|---|
| Apply | 11:58:35–12:06:15 | `audit_deleted=51 audit_conflicts=0 audit_failed=0 build_records_deleted=103 build_records_kept=0 deploy_folders_deleted=4 deploy_orphans_deleted=0 deploy_delete_failed=0 deploy_untracked_after=0 repos_folders_deleted=103 repos_orphans_deleted=61 repos_delete_failed=0 repos_untracked_after=0`, last line `LOG-RETENTION APPLY OK`, exit 0. Single run, no retry. Its scan section was identical to the dry run. |
| Convergence dry run | 12:06:43–12:06:50 | `audit_expired=0 build_records=23 build_records_expired=0 build_records_invalid_identity=0`, both roots `_record_folders=0 _refused=0 _orphans=0`, `orphan_sweep=ran`, `LOG-RETENTION DRY-RUN OK` → **RETENTION-CONVERGED** |
| OTA guard | 12:06:58 | `ota_build_json=2 owner_avatars=6`, the same as the baseline → **OTA-BASELINE-EQUAL** |
| Schedule | 12:07:13 | `/etc/cron.d/thinx-log-retention` root:root 0644, comment + `SHELL` + `PATH` + `40 9 * * * root /usr/local/sbin/thinx-log-retention.sh --apply --roots deploy,repos`; no cron.daily entry; `cron` active |
| Old job retired | 12:07:27 | `/etc/cron.daily/couchdb-log-retention` → `/usr/local/sbin/retired/couchdb-log-retention.cron`; `/usr/local/sbin/couchdb-log-retention.sh` → `/usr/local/sbin/retired/`; no other cron references |
| Gate | 12:07:44 | `schedule_utc=9:40`, `log_hex64=0` → **SCHEDULE-AND-RETIREMENT-OK** |

- **Space reclaimed** (apparent sizes): about 26 KiB in deploy and about 226.4 MiB in repos (25,853,925 bytes of record folders plus 211,535,430 bytes of orphans).
- **Host log hygiene.** `/var/log/thinx-log-retention.log` (131 lines) contains no 64-hex string, path, UUID or `@`.

## Task Commits

1. **Task 1: retention dry run.** `c1856aee` (docs, signed)
2. **Task 2: decision.** No commit (operator answer `all`)
3. **Task 3: retention job live, old job retired.** `1e2c58ef` (docs, signed)

**Plan metadata:** the final docs commit for this SUMMARY, STATE and ROADMAP (signed).

**Measured commit count note.** The ledger range `c92fcc3e..1e2c58ef` holds 3 commits. One of them, `0f55e432` "feat(ops): install the log retention cron job on first deployment" (12:01:49 UTC), was **not made by this plan**. It landed on `thinx-staging` concurrently while the apply was running. It adds:

- `scripts/install-log-retention-cron.sh`;
- a non-fatal call to it from `scripts/stack-deploy`;
- a README step;
- `spec/node/InstallLogRetentionCron.test.js`.

I checked it for conflicts with the production state, read-only:

- It keeps an existing `/etc/cron.d/thinx-log-retention` unless given `--force`.
- It refreshes the wrapper only when the content differs.
- It never touches the legacy job.

So the next `scripts/stack-deploy` will report `cron_d=kept` and `wrapper=unchanged` and leave the approved schedule alone. The plan's own commits are `c1856aee` and `1e2c58ef`, plus the metadata commit.

## Decisions Made

- `approved_roots=deploy,repos` comes from the operator's answer `all`. It is recorded once in the annex, and the cron line uses the same value.
- No `COUCHDB_HOST` override anywhere, because the stack alias resolves from the one-shot container.
- The 09:40 UTC slot was kept, so the collision rule was not needed.
- Not pushed, as the plan says ("Do not push"). The local branch is ahead of `origin/thinx-staging` (`a1d65e0a`) by `f572de52`, `c92fcc3e`, `c1856aee`, `0f55e432`, `1e2c58ef` and the metadata commit. Any parent push to `thinx-staging` redeploys `thinx_api`.

## Deviations from Plan

None in the plan's scope. The steps ran as written, all six verify gates passed, and there were no retries or permission problems.

Out-of-plan observations:
- Concurrent commit `0f55e432` (see the commit count note above). It was not authored by this executor and is not counted as this plan's work.
- The runbook had no footer, so one was added after the annex with the Phase 26 completion date.
- This host's cron logs no `RELOAD` line for `cron.d` changes, so pickup cannot be confirmed from the journal. The first scheduled run on 2026-10-03 at 09:40 UTC is the confirmation (see follow-up 1).

## Follow-ups (not done here)

1. **Check the first scheduled run** (T-26-39) on 2026-10-03 after 09:40 UTC. `/var/log/thinx-log-retention.log` should end with `LOG-RETENTION APPLY OK` from a cron-started run. The expected deletions are near zero.
2. **Smoosh 01:00–05:00 compaction-window config.** It was lost when `local.d` was not persisted (CONTEXT deferred). Also, the memory note "CouchDB log retention job" (`couchdb-log-retention-job.md`) is now **stale**: the job has been replaced and retired, and its window claim is wrong. Update it.
3. **Remove the legacy audit fallback** (plan 26-01) together with the unused `_design/logs` views (CONTEXT deferred). Keep `delete_expired` only while something still uses it.
4. **`fetchBuildLogID`** (`GET /api/v2/logs/build/:bid`) has no owner check (pre-existing).
5. **App.vue deep-link redirect after hydrate** (pre-existing; plan 26-09 evidence).
6. **`Builder.cleanupDeviceRepositories`** never removes sibling build dirs (research). The daily retention orphan sweep now limits the growth, but only after 365 days.
7. **The console repo's CI still calls production** (25-10 follow-up 1).
8. **Old job leftovers.** `/var/log/couchdb-log-retention.log` and `/var/lock/couchdb-log-retention.lock` are still on the manager. They are harmless and can be removed later together with `/usr/local/sbin/retired/` once nobody needs them.

## Issues Encountered

None. The apply took about 7.7 min (most of it the gluster scan), within the 256 MiB container cap (peak about 34 MiB).

## User Setup Required

None.

## Next Phase Readiness

- Phase 26 production work is done: paging views, Vue paging UI, D-15 cleanup, and the retention job is scheduled with the old job retired.
- The closeout docs commits are local only; the next parent push to `thinx-staging` carries them.

## Self-Check: PASSED

- FOUND: `.planning/runbooks/log-paging-retention.md` (annex rows filled; `approved_roots=`, `ota_baseline_build_json=`, `ota_baseline_avatars=` each exactly once)
- FOUND: `.planning/phases/26-vue-console-log-paging/26-08-SUMMARY.md`
- FOUND commits: `c1856aee` (G), `1e2c58ef` (G)
- Gates: WRAPPER-INSTALLED-MATCH, RETENTION-DRYRUN-PROD-OK, no_schedule_yet, OTA-BASELINE-RECORDED (Task 1); RETENTION-CONVERGED, OTA-BASELINE-EQUAL, SCHEDULE-AND-RETIREMENT-OK (Task 3)
