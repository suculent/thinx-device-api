---
phase: 26-vue-console-log-paging
plan: 06
subsystem: infra
status: complete
tags: [deploy, production, swarm, couchdb, warm-up, security]

requires:
  - phase: 26-vue-console-log-paging
    provides: "26-01 _design/paging + ensureDesignDocs upsert; 26-02 log-paging-probe.js; 26-03 clear-leaked-credentials.js and fixed audit-flag writers; 26-04 runbook + annex"
provides:
  - "Phase 26 backend live on production thinx_api (Push 1, 355b19b7, digest 52d5d082ea1b)"
  - "_design/paging built in managed_logs and managed_builds, timed (about 2 min / under 1.2 min)"
  - "Production evidence for LOG-01..LOG-04 (probe OK before and after D-15)"
  - "D-15 cleanup applied (reset-keys,audit-flags): 44 reset keys cleared, 197 audit docs redacted, post-apply 0/0"
  - "Runbook section ## D-15 credential cleanup and annex rows push 1, design upsert, index warm-up, paging probe, D-15 dry run, D-15 apply"
affects: [26-07 push 2 (carries the two unpushed 26-06 doc commits), 26-08 retention install]

actuals:
  tokens: 2497
  tasks: 3
  commits: 2
plan_head_before: 355b19b76c154f472ff0d194efc76c3af4c23b91
plan_head_after: fe4ef6e99b94eb0f455d50ef775f24945526a7dd

tech-stack:
  added: []
  patterns:
    - "Production evidence is aggregate-only key=value output, checked for 64-hex, @ and URLs before it is kept"
    - "One-way cleanup: dry run, operator decision, fresh dry run, single apply, zero-check driven by a token recorded once in the annex"

key-files:
  created:
    - .planning/phases/26-vue-console-log-paging/26-06-SUMMARY.md
  modified:
    - .planning/runbooks/log-paging-retention.md

key-decisions:
  - "D-15 applied with both targets (operator answer apply-both); no snapshot of the removed material exists, by design"
  - "Because the apply ran about 15 h after the first dry run, a fresh dry run and an image-digest precheck ran right before it; both still matched"
  - "The _design/logs map fingerprint is recorded as 41de3686cde2 (sha256 of the exact map string); the plan's 925f3cee0cc4 hashed the same string plus a trailing newline"

patterns-established:
  - "Re-run the read-only dry run immediately before any deferred one-way apply"

requirements-completed: [LOG-01, LOG-02]
requirements-server-side-proven: [LOG-03, LOG-04]

duration: "about 35 min active (2026-10-01 19:2x-19:44 and 2026-10-02 11:14-11:20 UTC), spread over two days by the Task 2 checkpoint"
completed: 2026-10-02
---

# Phase 26 Plan 06: Push 1, index warm-up, production probe and D-15 cleanup Summary

**The Phase 26 backend is live on production thinx_api (355b19b7, digest 52d5d082ea1b). Both `_design/paging` indexes built in about 2 minutes, and the production probe proves LOG-01..LOG-04. The approved D-15 cleanup cleared 44 leaked reset keys and redacted 197 audit docs, and the dry run afterwards reports 0/0.**

## Performance

- **Duration:** about 35 min of active work, split across 2026-10-01 (Task 1, Push 1 at 19:32:45 UTC) and 2026-10-02 (Task 3, 11:14-11:20 UTC)
- **Completed:** 2026-10-02
- **Tasks:** 3 (tracer, decision checkpoint, apply)
- **Files modified:** 1 (runbook) plus this SUMMARY

## Accomplishments

### Push 1 (backend only)

- `thinx-staging` was pushed `2a9569c1..355b19b7` (47 commits). The `services/console` gitlink stayed at `c58dd091`, as PUSH1-BACKEND-ONLY requires.
- Pre-push checks: the local Phase 26 backend specs ran 250 / 0 failures, the retention wrapper `node --test` ran 14 / 0, and the secret scan found `secret_hits=0`.
- CI for `355b19b7` passed: `test` (build 15527, ZZ-LogPagingCouchSpec ran 12 specs within 989 specs / 0 failures), `api-registry`, `console-classic-registry` and `vue-console-registry`.
- `thinx_api` rolled stop-first on micro. The new task started at 19:37:16 with 0 restarts. Digest before `c42333a3bb0a`, after `52d5d082ea1b`.
- Both console images were rebuilt from the unchanged pin and rolled.
- No node repair was needed.

### Design upsert (LOG-01)

- Both `_design/paging` docs were created at 19:37:26: managed_builds first, then managed_logs.
- `action=failed` lines: 0. `_design/logs` is still rev gen 1, so it was never rewritten (D-13).

### Index warm-up (D-12 step 2)

- T0 was 19:37:26.
- **managed_logs:** two shard indexers ran (331k changes each, tombstones included). They were gone by 19:39:23, and `updater_running=false` at 19:39:39, about 2 minutes after T0.
- **managed_builds:** already idle at the first poll (19:38:35), so under 1.2 minutes.
- **First `limit=1` query per view** (including about 136 ms of `docker exec` overhead):

  | View | Time | total_rows |
  |---|---|---|
  | `audit_by_owner_date` | 184 ms | 4467 |
  | `audit_by_date` | 302 ms | 4967 |
  | `builds_by_owner_time` | 196 ms | 126 |
  | `builds_by_time` | 195 ms | 126 |

- No query returned an error. Fallback lines (`owner-keyed audit view unavailable`) during the build: 0.
- Both blocked windows (01:00-05:00 and 06:25-07:10 UTC) were avoided.

### Production probe, 2026-10-01 19:40:01

The probe ended `LOG-PAGING-PROBE OK`. Full output:

`ddoc_paging_logs=ok ddoc_paging_builds=ok ddoc_logs_rev_gen=1 ddoc_logs_map_sha12=41de3686cde2 index_logs_updater_running=false index_builds_updater_running=false audit_owners=266 legacy_len=200 legacy_expected=200 legacy_match=1 legacy_object_flags=0 legacy_fallback_used=0 audit_pages=15 audit_total=1489 audit_expected=1489 audit_dupes=0 audit_order_ok=1 audit_foreign=0 audit_cursor_owner_free=1 audit_first_page_ms=101 replay_rows=100 replay_foreign=0 build_owners=4 build_pages=2 build_total=117 build_expected=117 build_dupes=0 build_order_ok=1 build_foreign=0 build_nested=110 build_first_page_ms=1004 builds_del_before=0 builds_del_after=0`

What it shows for each requirement:

- **LOG-02:** `legacy_match=1`, `legacy_object_flags=0`, `legacy_fallback_used=0`.
- **LOG-03:** `audit_expected=1489` (above 1000), equal to `audit_total`; `audit_foreign=0` and `replay_foreign=0`.
- **LOG-04:** `build_total` equals `build_expected` (117), `build_nested=110`, and the deleted-doc count did not change.

### D-15 dry run, 2026-10-01 19:40:58

- Users: 662 scanned, 44 with a reset key.
- Audit docs: 4967 scanned, 197 with object flags.
- Breakdown of the 197: 88 with a password, 103 with a reset key, 164 with an email, 197 with repos.
- Affected docs span 2025-10-01 to 2026-10-01T15:38Z. The newest one predates the Push 1 task start (19:37:16), so the fixed writers were live.

### Task 2 decision

The operator answered `apply-both`, which maps to `--targets reset-keys,audit-flags`.

### Task 3: D-15 apply, 2026-10-02 11:15:49-11:16:40

- **Precheck:** `thinx_api` still ran on micro, digest `52d5d082ea1b`, the same task (started 2026-10-01 19:37:16, restarts 0).
- **Fresh dry run at 11:15:23:** users 663 / 44 with a reset key; audit 4975 / 197 with object flags; newest affected doc still 2026-10-01T15:38Z. None of the 8 audit docs written since Push 1 has object flags.
- **Apply, run once:** `users_cleared=44 users_failed=0 audit_redacted=197 audit_conflicts=0 audit_failed=0`, ending `CLEANUP-APPLY OK`. No rerun was needed.
- **Post-apply dry run at 11:17:27:** `users_with_reset_key=0` and `audit_with_object_flags=0`, with every breakdown at 0. **D15-POST-DRYRUN-CLEAN** passed against the annex token `reset-keys,audit-flags`.
- **Probe at 11:17:50:** ended `LOG-PAGING-PROBE OK`. `legacy_object_flags=0`, `_design/logs` is still rev gen 1 (sha12 41de3686cde2), and audit/build totals are unchanged (1489/1489, 117/117). **PROBE-OK-AFTER-D15** passed.

## Task Commits

1. **Task 1 (tracer): Push 1, warm-up, probe, D-15 dry run** - `aa3a54eb` (docs; Push 1 itself was `355b19b7`, made of commits from earlier plans)
2. **Task 2: D-15 decision** - checkpoint only, no commit (operator: apply-both)
3. **Task 3: D-15 cleanup applied** - `fe4ef6e9` (docs)

Neither 26-06 commit is pushed. They ride Push 2 (plan 26-07), because a parent push redeploys the API.

## Files Created/Modified

- `.planning/runbooks/log-paging-retention.md` - section `## D-15 credential cleanup`; annex rows push 1, design upsert, index warm-up, paging probe, D-15 dry run, D-15 apply. `d15_targets=` appears exactly once; no 64-hex strings.
- `.planning/phases/26-vue-console-log-paging/26-06-SUMMARY.md` - this file

## Decisions Made

- D-15 was applied with both targets, as the operator approved. It is one-way and no snapshot was taken.
- A digest precheck and a fresh dry run ran before the apply, because the apply happened about 15 h after the first dry run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan constant for the `_design/logs` map fingerprint was wrong**
- **Found during:** Task 1 (production probe)
- **Issue:** The plan's must_have and verify expected `ddoc_logs_map_sha12=925f3cee0cc4`. That value is the sha256 of the map string with a trailing newline (it came from `jq -r … | sha256sum`). The probe hashes the exact string, and production prints `41de3686cde2`. That value matches the repository's `design/design_logs.json`. Rev gen 1 confirms the doc was never rewritten, so D-13 holds.
- **Fix:** Recorded `41de3686cde2` as the correct value in the annex, with the explanation; PROD-PAGING-PROBE-OK was judged against it. No code change.
- **Files modified:** .planning/runbooks/log-paging-retention.md
- **Commit:** aa3a54eb

### Process deviations (operator-directed)

**2. Next-day resume of Task 3**
- The Task 2 checkpoint was answered after the 2026-10-01 22:30 UTC cut-off, so Task 3 ran on 2026-10-02 at 11:15 UTC. That time is outside 01:00-05:00 and 06:00-07:10.
- Because of the 15 h gap, the precondition (Push 1 image still running) was re-checked, and a fresh read-only dry run ran right before the apply. Both matched, and the newest affected doc still predated Push 1.

**3. Unsigned commits**
- The GPG agent was locked and the operator was away. On the operator's instruction for plan 26-06 only, `aa3a54eb` and `fe4ef6e9` were committed without a signature, with the body line `Unsigned: GPG agent locked, operator authorized bypass while away.` This overrides the plan's "never bypass signing" convention. Re-signing them before Push 2 is optional.

**4. LOG-03 and LOG-04 left Pending in REQUIREMENTS.md**
- The plan lists LOG-01..LOG-04, and `requirements.mark-complete` marked all four. But LOG-03 and LOG-04 say "A Vue Console user can page…", and LOG-04 also requires "the console submodule pointer is bumped and deployed". Both depend on Push 2 (plan 26-07).
- This plan proves only their server side, so those two were put back to Pending. LOG-01 and LOG-02 are fully server-side and stay Complete.

## Issues Encountered

None in Task 3: the apply converged on the first run with 0 conflicts and 0 failures.

## Next Phase Readiness

- Plan 26-07 (Push 2, the Vue UI) can proceed. The backend and indexes are live and probe-verified. Push 2 will carry `aa3a54eb` and `fe4ef6e9`.
- D-15 is closed in production.

## Self-Check: PASSED

- FOUND: .planning/runbooks/log-paging-retention.md (`## D-15 credential cleanup` present, `d15_targets=` x1, 64-hex x0)
- FOUND: .planning/phases/26-vue-console-log-paging/26-06-SUMMARY.md
- FOUND: aa3a54eb, fe4ef6e9 in git log
- Markers seen: D15-POST-DRYRUN-CLEAN, PROBE-OK-AFTER-D15 (Task 1 markers recorded in the annex)
