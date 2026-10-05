---
phase: 26-vue-console-log-paging
plan: 07
subsystem: infra
status: complete
tags: [deploy, production, vue, console, closeout]

requires:
  - phase: 26-vue-console-log-paging
    provides: "26-05 Vue History paging UI; 26-09 Cypress harness and paging specs; 26-06 Push 1 backend live, _design/paging built, probe OK, D-15 applied"
provides:
  - "Vue History paging UI live on console.thinx.cloud (Push 2, parent a1d65e0a, console 3e77525)"
  - "Console submodule pointer bumped and deployed (LOG-04)"
  - "LOG-01 idempotency proven on a real thinx_api restart: action=unchanged for both DBs, _design/paging rev gens 1/1 before and after"
  - "LOG-01..LOG-04 marked complete in REQUIREMENTS.md"
  - "Runbook annex rows push 2 readiness and push 2"
affects: [26-08 retention install (the next parent push carries the unpushed 26-07 docs commits), end-of-phase UAT browser pass]

actuals:
  tokens: 1026
  tasks: 3
  commits: 3
plan_head_before: 520b125936105e853e3ae8f1ee636d06951d1905
plan_head_after: f572de52074213a713ab37a572577569016fd31e

tech-stack:
  added: []
  patterns:
    - "Push 2 order: console fast-forward push, signed gitlink bump, parent push, then four CI jobs, rollout, served bundle, boot upsert log, rev gens, probe"
    - "Idempotency on restart is proven by two independent signals: the boot log (action=unchanged) and the CouchDB rev generation (unchanged)"

key-files:
  created:
    - .planning/phases/26-vue-console-log-paging/26-07-SUMMARY.md
  modified:
    - services/console (gitlink c58dd09 -> 3e77525)
    - .planning/runbooks/log-paging-retention.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Operator answered push at the Task 2 gate (D-14), with the GPG agent unlocked; all new commits in this plan are signed"
  - "The existing unsigned local commits (aa3a54eb, fe4ef6e9, 520b1259, 4497c690) were pushed as they are, not rewritten, because SUMMARY files cite their hashes"
  - "The closeout commits are not pushed: any thinx-staging push redeploys thinx_api, so the next parent push carries them"

patterns-established:
  - "Record the _design/* rev generation before a deploy and compare after the boot upsert"

requirements-completed: [LOG-01, LOG-02, LOG-03, LOG-04]

duration: "about 20 min active (2026-10-02 11:21-11:25 Task 1, 11:32-11:42 Task 3 UTC), split by the Task 2 checkpoint"
completed: 2026-10-02
---

# Phase 26 Plan 07: Push 2, the Vue History paging UI and the console pointer bump Summary

**The Vue History paging UI is live on console.thinx.cloud. Console `3e77525` was pushed fast-forward, the parent gitlink was bumped in signed commit `a1d65e0a`, and all four CI jobs passed. All three services rolled. The thinx_api reboot left `_design/paging` untouched (`action=unchanged`, rev gen 1/1), and the production probe still reports OK.**

## Performance

- **Duration:** about 20 min active. Task 1 ran 11:21–11:25 UTC; the operator then answered the gate; Task 3 ran 11:32–11:42 UTC.
- **Tasks:** 3 of 3. Task 1 is the tracer, Task 2 the decision gate (answer `push`), Task 3 Push 2.
- **Files modified:** 3 (`services/console` gitlink, runbook annex, REQUIREMENTS.md).

## Task 1 (tracer): Push 2 rehearsal, read-only

Commit `4497c690`, annex row "push 2 readiness".

- **Vue unit tests:** 50 ok, 0 not ok (VUE-UNIT-GREEN).
- **Scoped Cypress (history, dashboard, device-detail):** 30 of 30 passed (VUE-CYPRESS-GREEN).
- **Production-mode build:** both paging labels found in the `app` chunks (BUNDLE-HAS-PAGING).
- **Production probe:** `audit_first_page_ms=99`, `build_first_page_ms=306`, both updaters idle, OK (LIVE-PAGING-FAST).

## Task 2: decision gate

The operator answered "unlocked, push", which counts as `push` (D-14).

## Task 3: Push 2

### Pre-push

- No thinx-staging CircleCI job was queued or running.
- **Secret scan:** `secret_hits=0` across both outgoing diffs, using plan 26-06's pattern list.
- **Running digests:**
  - `thinx_api` `52d5d082ea1b` (micro)
  - `thinx_vue` `68001eee952b` (micro)
  - `thinx_console` `eb64ebb2789e` (core)
- **Rev generations:** `_design/paging` was gen 1 in managed_logs and gen 1 in managed_builds. `_design/logs` was gen 1.

### Pushes

- **Console:** `thinx-staging` `c58dd09..3e77525`, a fast-forward of 8 signed commits, all under `vue/`.
- **Gitlink:** signed commit `a1d65e0a` `chore(26): bump console to the Vue log paging UI` (signature status G).
- **Parent:** `thinx-staging` `355b19b7..a1d65e0a` at 11:33:32. That is 5 commits: 4 docs commits plus the bump. Nothing went to main and nothing was force-pushed.
- **VUE-PUSHED-AND-BUMPED:** the origin gitlink equals the console HEAD (`3e775252`) and differs from the phase-start value.

### CI for `a1d65e0a`

| Job | Build | Result |
|---|---|---|
| test | 15538 | success; the log shows `989 specs, 0 failures, 1 pending spec` (same as Push 1) |
| console-classic-registry | 15532 | success 11:35:44 |
| vue-console-registry | 15536 | success 11:38:09 |
| api-registry | 15539 | success 11:38:12 |

The snyk monitor jobs also passed.

### Rollout

No node repair was needed.

| Service | Node | Digest before | Digest after |
|---|---|---|---|
| thinx_console | core | eb64ebb2789e | bb889884d093 |
| thinx_vue | micro | 68001eee952b | 3030138fc15b |
| thinx_api | micro | 52d5d082ea1b | fbe53daf0a03 |

thinx_api rolled stop-first. Its new task started 11:39:59 with 0 restarts, and the service update reports `completed`.

### Live checks

- **Served bundle:** `https://console.thinx.cloud/js/app.js` (cache-busted) contains "Load more audit log entries" 1 time and "Load more builds" 1 time (VUE-PAGING-SERVED).
- **Boot upsert at 11:40:16:** `upsert_unchanged=2` (managed_builds and managed_logs `_design/paging action=unchanged`). `upsert_rewritten=0`, `CRITICAL` lines 0.
- **Rev generations after the restart:** `_design/paging` is still gen 1 in managed_logs and gen 1 in managed_builds, equal to the pre-push values. The restart rewrote nothing and re-indexed nothing (LOG-01 idempotency).
- **Probe at 11:41:14:**
  - Ends `LOG-PAGING-PROBE OK`.
  - `_design/logs`: `ddoc_logs_rev_gen=1`, `ddoc_logs_map_sha12=41de3686cde2`.
  - Both updaters idle.
  - Legacy path: `legacy_match=1`, `legacy_object_flags=0`.
  - Audit paging: `audit_total=1489` of 1489, `audit_dupes=0`, `audit_foreign=0`, `audit_cursor_owner_free=1`, `audit_first_page_ms=214`.
  - Build paging: `build_total=117` of 117, `build_first_page_ms=712`, `builds_del_after=0`.

### Closeout

- **REQUIREMENTS.md:** LOG-03 and LOG-04 are checked and their traceability rows are Complete. LOG-01 and LOG-02 were already Complete from 26-06. The footer is dated 2026-10-02 (LOG-REQS-CLOSED).
- **Annex:** the row "push 2" is filled. The runbook contains no 64-hex strings.
- **Commit:** signed `f572de52` `docs(26-07): push 2 evidence and LOG requirements complete`. It is not pushed (see Decisions).

## Rollback references

To revert the UI, revert the console commits and push both repos. To pin a single service back:

```
docker service update --with-registry-auth --image <recorded digest> <svc>
```

The recorded digests are thinx_vue `68001eee952b`, thinx_console `eb64ebb2789e` and thinx_api `52d5d082ea1b`. Placement floats, so query the node first.

## Task Commits

1. **Task 1: Push 2 rehearsal:** `4497c690` (docs). It is unsigned because the GPG agent was locked at the time. Pushed as is.
2. **Task 2: decision gate:** no commit.
3. **Task 3: Push 2:** `a1d65e0a` (chore, gitlink bump, signed, pushed) and `f572de52` (docs, signed, not pushed).

## Decisions Made

- The operator answered `push` (D-14). All commits made after the gate are GPG-signed.
- The earlier unsigned commits `aa3a54eb`, `fe4ef6e9`, `520b1259` and `4497c690` were pushed unchanged rather than re-signed, because SUMMARY files cite those hashes.
- The closeout commits stay local. Any thinx-staging push rebuilds and redeploys thinx_api, so the next parent push (plan 26-08) carries them, as the plan specifies.

## Deviations from Plan

### Auto-fixed Issues

None.

### Recorded discrepancies (no code change)

**1. Console commit count in the plan text**
- **Found during:** Task 2 (outgoing changes).
- **Issue:** The plan says the outgoing console range is "the three plan 26-05 commits and the two plan 26-09 test commits". The real range `c58dd09..3e77525` holds 6 plan 26-05 commits and 2 plan 26-09 commits, 8 in total. All are signed, and all 14 files are under `vue/`.
- **Fix:** None needed. The operator saw the real count at the gate.

**2. `_design/logs` map fingerprint**
- **Found during:** Task 1 and Task 3 (probe).
- **Issue:** The value the probe computes is `41de3686cde2`. The plan's `925f3cee0cc4` hashes the same string plus a trailing newline (see the 26-06 deviation).
- **Fix:** Recorded the value; it is not used as a gate.

## Issues Encountered

- When the rollout was first polled, the thinx_api spec already had the new digest but no task was running, because of the stop-first gap. A re-check a few seconds later showed the new task running on micro, and the service update status was `completed`.

## User Setup Required

None.

## Human check pending (end-of-phase UAT)

This is the browser pass from the plan's `<human-check>`. Use a fresh session and record no identifiers.

On console.thinx.cloud, open History from the sidebar. A reload of `/#/app/history` lands on the dashboard; that is the known deep-link issue. Check that:
- the audit table shows 100 entries and Load more appends;
- the date filter shows the "older entries exist" hint;
- the build tab pages independently;
- the Network panel shows `?limit=100&cursor=…` requests and a `paging` object;
- the dashboard cards are unchanged;
- the device detail build history renders.

On rtm.thinx.cloud, check that the audit list shows your own entries with real flag badges.

## Next Phase Readiness

- Plan 26-08 (retention install) can start. Its parent push will also carry `f572de52` and this SUMMARY commit.
- The backend and both consoles run the Phase 26 code. No production write beyond the CI-driven rollout happened in this plan.

## Self-Check: PASSED

- FOUND: `.planning/phases/26-vue-console-log-paging/26-07-SUMMARY.md`
- FOUND: `.planning/runbooks/log-paging-retention.md` (annex row push 2 filled)
- FOUND: `.planning/REQUIREMENTS.md` (`| LOG-04 | Phase 26 | Complete |`)
- FOUND commits: `4497c690`, `a1d65e0a`, `f572de52`
- FOUND: console `3e77525` on origin/thinx-staging; parent origin/thinx-staging = `a1d65e0a`
