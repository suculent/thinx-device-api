---
phase: 24-secrets-sweep
plan: 05
subsystem: infra
tags: [deploy, swarm, docker-secrets, secrets, rotation, worker, transformer, rollbar, production]
requires:
  - phase: 24-secrets-sweep
    provides: "24-04 thinx_api step (D-05 step 1) passed; ROLLBAR_SERVER_TOKEN swarm secret exists; worker/transformer readSecret + rollbarServerToken code live"
  - phase: 24-secrets-sweep
    provides: "24-02/24-03 API runRemoteShell sends readSecret('WORKER_SECRET'); worker validateJob compares through secretsMatch"
provides:
  - "WORKER_SECRET rotated to a new random swarm secret (fp 170916780f07), mounted on thinx_api and thinx_worker; the file wins over the old env value (fp 66572afa8bdd) on both sides"
  - "Worker authentication proven with a real remote build after the rotation (build f7362090-bbf4-11f1-bc0f-6db2168c8032, THiNX BUILD SUCCESSFUL, 0 auth failures)"
  - "thinx_worker and thinx_transformer mount ROLLBAR_SERVER_TOKEN (fp ed9f549aaa63, equal to their env); ROLLBAR-OK from both"
affects: [24-06, SEC-CFG-03]
plan_head_before: fc6e08e861c208328a44b890e59fac52ac4ec174
plan_head_after: 852311b261e355aa3ba84ba574dd42b7ea9bf1b3
actuals:
  tokens: 574
  tasks: 3
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Coordinated two-service rotation: one ssh invocation creates the secret from openssl rand on the host (never printed) and --secret-add's it to thinx_api then thinx_worker back to back; paired --secret-rm is the rollback"
    - "Rotation proof: readSecret fp12 equal across both containers and different from each side's env fp12 (file wins, env still holds the old value as fallback)"
key-files:
  created: []
  modified: []
key-decisions:
  - "Operator chose rotate-build-manual at Task 1: the operator pressed Build for the Fridge device in the console; the executor wrote no queue entry (no p24-enqueue.js)"
  - "Console Build dispatches directly to the worker (router.build.js), not through the Redis queue whose cron dispatch is broken (deferred item), so the build_id came from the worker runArgv line, not a 'Scheduling waiting build action' line"
  - "Task 3 (transformer) ran after every gating Task 2 check had passed, while the proof build was still compiling; the build outcome is record-only and the transformer is not on the build path"
patterns-established:
  - "Proof-build evidence: worker runArgv --id=<build_id> plus the build service's own log tail for THiNX BUILD SUCCESSFUL (the API and worker logs only carry status polls)"
requirements-completed: [SEC-CFG-02]
coverage:
  - id: D1
    description: "WORKER_SECRET rotated to a new random swarm secret, mounted on thinx_api and thinx_worker together; the file wins on both sides over the old env value"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-fp.js thinx_api: WORKER_SECRET file=1 read=170916780f07 env=66572afa8bdd; thinx_worker: WORKER_SECRET file=1 read=170916780f07 env=66572afa8bdd"
        status: pass
      - kind: other
        ref: "mounts: thinx_api includes WORKER_SECRET; thinx_worker = WORKER_SECRET,ROLLBAR_SERVER_TOKEN; both Running, RestartCount=0 at 11:08:54Z (started 10:50:51Z/10:50:52Z)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Worker authentication works after the rotation: one real remote build for the operator-confirmed device was accepted by the worker with zero authentication failures"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "worker log: runArgv --id=f7362090-bbf4-11f1-bc0f-6db2168c8032 at 11:00:46Z (count 1); auth_fail=0 in worker+API logs since 10:50:37Z; build service log ends 'THiNX BUILD SUCCESSFUL.' at 11:08:26Z, service Complete"
        status: pass
    human_judgment: false
  - id: D3
    description: "thinx_worker and thinx_transformer read ROLLBAR_SERVER_TOKEN from the mounted secret (no rotation) and report to Rollbar"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-fp.js worker and transformer: ROLLBAR_SERVER_TOKEN file=1 read=ed9f549aaa63 env=ed9f549aaa63; p24-rollbar.js ROLLBAR-OK (thinx_worker, thinx_transformer)"
        status: pass
      - kind: other
        ref: "transformer: state=Running 3 min, restarts=0, mounts=ROLLBAR_SERVER_TOKEN, disabled_lines=0, crash_lines=0; worker disabled lines since rotation=0"
        status: pass
    human_judgment: false
  - id: D4
    description: "thinx_api 24-04 integrations still pass after the rotation restart"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-slack.js SLACK-OK; p24-rollbar.js ROLLBAR-OK (thinx_api); oauth github 302 github.com, google 302 accounts.google.com; 0 'not set —' lines since 10:50:37Z"
        status: pass
    human_judgment: false
duration: 42min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 05: WORKER_SECRET Rotation and Worker/Transformer Rollbar Secret Summary

**WORKER_SECRET now comes from a new random swarm secret (fp 170916780f07) that thinx_api and thinx_worker both read in preference to the old, previously logged env value (fp 66572afa8bdd). A real remote build for Fridge authenticated against it and ended THiNX BUILD SUCCESSFUL. thinx_worker and then thinx_transformer mount ROLLBAR_SERVER_TOKEN and report ROLLBAR-OK, with 0 restarts on all three services.**

## Performance

- **Duration:** 42 min wall clock, including two operator pauses (Task 1 decision, manual Build press)
- **Started:** 2026-09-29T10:27:39Z
- **Completed:** 2026-09-29T11:09:26Z
- **Tasks:** 3 (1 decision checkpoint, 1 tracer, 1 auto)
- **Files modified:** 1 repository file (`deferred-items.md`), plus production swarm changes only

## Accomplishments

- WORKER_SECRET rotated as D-07 requires. The value came from `openssl rand -hex 32` on the manager and was never printed. It was added to thinx_api and thinx_worker in one ssh invocation, and both sides read the same new value while their env still holds the old one.
- D-11 worker-authentication proof: the operator pressed Build for Fridge. The worker accepted the argv job, the build compiled successfully, and no authentication failure appeared anywhere in the window.
- ROLLBAR_SERVER_TOKEN is now mounted on thinx_worker and thinx_transformer. That completes SEC-CFG-02 criterion 2 for the worker and the transformer, one service at a time as D-05 requires.
- The thinx_api checks from 24-04 all passed again after the rotation restart.

## Task Commits

1. **Task 1: approve rotation window, worker/transformer steps, proof-build device.** Checkpoint only, no commit. The operator answered `rotate-build-manual`.
2. **Task 2 (tracer): WORKER_SECRET on thinx_api + thinx_worker, file-wins proof, real build.** Production only. `852311b2` (docs, signed) recorded two deferred items found during the Task 1 queue inspection.
3. **Task 3: ROLLBAR_SERVER_TOKEN on thinx_transformer.** Production only, no repository change.

**Plan metadata:** see the `docs(24-05)` commit that adds this file.

## Task 2 evidence

- **No build running before the rotation.** The read-only queue inspection at Task 1 showed `queue_keys=4 running=0 waiting=3`, and the three waiting entries are stale ones from 2026-09-18 (see deferred items). Logs cross-check the 60 min before the rotation (09:50:37Z to 10:50:37Z): worker `runArgv`=0, API `Scheduling waiting build action`=0, API build-status polls=0.
- **Secret created** at 10:50:37Z, `created WORKER_SECRET`, no value printed.
- **Both updates** ran in one invocation and completed at 10:51:03Z. New containers started at 10:50:51Z (worker) and 10:50:52Z (api). RestartCount stayed 0 through 11:08:54Z, 18 min later. No rollback was needed.
- **File-wins proof (p24-fp.js):**

  | Container | Name | file | read fp12 | env fp12 |
  |---|---|---|---|---|
  | thinx_api | WORKER_SECRET | 1 | 170916780f07 | 66572afa8bdd |
  | thinx_worker | WORKER_SECRET | 1 | 170916780f07 | 66572afa8bdd |
  | thinx_worker | ROLLBAR_SERVER_TOKEN | 1 | ed9f549aaa63 | ed9f549aaa63 (ROLLBAR_ACCESS_TOKEN) |

  The two WORKER_SECRET reads are equal and differ from the env on both sides, so the rotation counts. The worker's Rollbar token read equals its env, so there was no drift.
- **Worker re-registration:** after the restart the worker log shows it received its client id (1 line).
- **Real remote build (Fridge, udid debc5ef0-e9f0-11e8-9ead-dfb337f8db45):**
  - The operator pressed Build shortly before 11:00:38Z. The operator's relay gave the build_id `f7362090-bbf4-11f1-bc0f-6db2168c8032`, and it matches the worker log.
  - The worker logged `runArgv` with `--id=f7362090-bbf4-11f1-bc0f-6db2168c8032` at 11:00:46Z (count 1), about 10 minutes after the rotation.
  - `auth_fail=0`: the worker and API logs since 10:50:37Z contain no `Invalid job authentication`, `Missing job secret`, `WORKER_SECRET is not configured` or `worker_secret_missing`. `worker refused build`=0 and `refusing remote build`=0.
  - Final status: the build service log ends `THiNX BUILD SUCCESSFUL.` at 11:08:26Z (platformio, d1_mini / d1_mini_pro firmware). The build service is `Complete`, and the API's status poll saw `0/1` at 11:08:29Z. The build can offer new firmware to Fridge, as the Phase 23 proof builds did.
- **Rollbar:** `p24-rollbar.js` in thinx_worker printed `ROLLBAR-OK` (item label `phase-24 secrets check thinx_worker`).
- **thinx_api regression (24-04 checks):** `SLACK-OK` and `ROLLBAR-OK`. OAuth initiators: github `302 github.com`, google `302 accounts.google.com`, the same as 24-04. `not set —` lines since the rotation: 0.
- **Mounts after Task 2:** thinx_api = CSRF_SECRET, SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, GIT_KEY_PASSPHRASE, ROLLBAR_SERVER_TOKEN, WORKER_SECRET. thinx_worker = WORKER_SECRET, ROLLBAR_SERVER_TOKEN.

## Task 3 evidence

- **Precondition:** every gating Task 2 check had passed. The ROLLBAR_SERVER_TOKEN secret already existed and was mounted, not recreated. The transformer was at mounts=0.
- **Update:** `docker service update --with-registry-auth --detach=false --secret-add ROLLBAR_SERVER_TOKEN thinx_transformer` ran from 11:02:55Z to 11:03:15Z with rc=0 and `UpdateStatus=completed`. The new task started at 11:03:09Z.
- **p24-fp.js (transformer, `/nodejs/bin/node`):** `ROLLBAR_SERVER_TOKEN file=1 read=ed9f549aaa63 env=ed9f549aaa63`.
- **p24-rollbar.js (transformer):** `ROLLBAR-OK` (item label `phase-24 secrets check thinx_transformer`).
- **3-minute mark (11:06:23Z):** `state=Running`, `restarts=0`, `mounts=ROLLBAR_SERVER_TOKEN`, `disabled_lines=0`, `crash_lines=0`. The previous task shut down normally with no error. No rollback was needed.

## Final state (11:08:54Z)

| Service | State | Restarts | Mounts |
|---|---|---|---|
| thinx_api | Running | 0 | CSRF_SECRET, SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, GIT_KEY_PASSPHRASE, ROLLBAR_SERVER_TOKEN, WORKER_SECRET |
| thinx_worker | Running | 0 | WORKER_SECRET, ROLLBAR_SERVER_TOKEN |
| thinx_transformer | Running | 0 | ROLLBAR_SERVER_TOKEN |

No env var was removed and no swarm secret was deleted (D-06, D-08, D-12). The env fallback is still the rollback path. No other service was updated, and neither restart.sh nor `docker stack deploy` was used.

## Human checks carried from 24-04

The operator's GitHub and Google OAuth logins, and the D-11 human confirmations (Slack message, Rollbar item, reset mail), were recorded in 24-04 for thinx_api. This plan re-ran only the automated thinx_api checks (Slack send, Rollbar send, OAuth initiator redirects). The operator was not asked to repeat the logins, because neither OAuth secret changed.

## Files Created/Modified

- `.planning/phases/24-secrets-sweep/deferred-items.md`: two entries found during the Task 1 queue inspection (commit `852311b2`)
- `.planning/phases/24-secrets-sweep/24-05-SUMMARY.md`: this file

## Decisions Made

- The operator chose `rotate-build-manual`, so the executor wrote nothing to the build queue and `p24-enqueue.js` was not created.
- The build_id came from the worker `runArgv` line and matched the operator's relay. A console Build press dispatches straight to a registered worker through `router.build.js` and never goes through the queue's `Scheduling waiting build action` path.
- Task 3 started once every gating Task 2 check had passed, while the proof build was still compiling. The plan makes the build's final status a record-only item, and the transformer is not on the build path.

## Deviations from Plan

None that changed the outcome. Notes:
- The plan's second Task 2 verify command greps the API log for `queued build_id=` or `Scheduling waiting build action` to find the build_id. Neither line exists for a console-dispatched build. As the verify's own `fails_when` provides, the recorded build_id was used instead, confirmed by the worker `runArgv --id=` line.
- `THiNX BUILD SUCCESSFUL` shows up in the build service's log (`thinx_build-*`), not in the worker or API service logs. The outcome was read from there.
- The pre-rotation no-build-running evidence was taken by the previous executor (queue inspection at Task 1). In this continuation it was cross-checked read-only from the worker and API logs for the 60 min before the rotation, the plan's fallback window.

**Total deviations:** 0 auto-fixed
**Impact on plan:** none

## Issues Encountered

- The build queue's cron dispatch does not run in production, and four stale entries sit in the queue. Both were recorded in `deferred-items.md` (commit `852311b2`). Neither is caused by phase 24, and phase 24 did not touch Redis.
- Test traffic sent as approved: one Slack message in #thinx from thinx_api, and Rollbar info items from thinx_api, thinx_worker and thinx_transformer. One firmware build for Fridge.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- SEC-CFG-02 criterion 2 now holds for all three services. 24-06 can run the end-of-phase checks.
- Removing the old WORKER_SECRET and ROLLBAR_ACCESS_TOKEN values from the service env is SEC-CFG-03 and is not done here. Until then the old WORKER_SECRET value still sits in the env of thinx_api and thinx_worker as the D-12 fallback.
- Rollback, if ever needed: `--secret-rm WORKER_SECRET` on thinx_api and thinx_worker together (never only one side), and `--secret-rm ROLLBAR_SERVER_TOKEN` on the worker and the transformer.

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*

## Self-Check: PASSED

- FOUND: .planning/phases/24-secrets-sweep/24-05-SUMMARY.md
- FOUND: 852311b2 (deferred items, signed)
- Task 2 verifies passed: fp (3 lines, file=1, WORKER_SECRET reads equal and different from env, worker Rollbar read == env), build (runArgv=1, auth_fail=0), rollbar/mounts (ROLLBAR-OK, both Running, mounts as required)
- Task 3 verifies passed: fp file=1 read==env, ROLLBAR-OK, state=Running mounts=ROLLBAR_SERVER_TOKEN disabled_lines=0
- No secret value, host, port, key path or operator mail in this file
