---
phase: 43-notification-delivery
plan: 02
subsystem: api
tags: [api, builder, messenger, notifications, websocket, queue]

requires:
  - phase: quick 261003-vn3
    provides: Messenger per-owner subscriptions (subscribeSocket, sendToOwner) and the owner-only routing invariant
  - phase: 43-01
    provides: several live sockets per owner on the same /<owner> path (SocketUpgrade), so frames reach every open tab
provides:
  - Builder#consoleNotifiers(notifiers, owner), bound once in run_build from br.owner
  - Builder#notify delivering Build Status frames through messenger.sendToOwner, one terminal frame per build_id (bounded memory, 1000)
  - processExitData / processShellData frame rules F-1..F-4 (Completed only on OK, error frame with the reason otherwise, no log lines)
  - lib/router.build.js notifiers { messenger: app.messenger } (existing_sockets map removed)
  - Queue#messenger from the app and runNext notifiers { messenger }
  - spec/jasmine/BuilderStatusFramesSpec.js (24 local specs, runs in the CI test job)
affects: [43-03 deploy and live proofs, Legacy console build toasts, worker job-status handling]

actuals:
  tokens: 10612
  tasks: 3
  commits: 6
plan_head_before: 28f106e977eab57f362fdd795e8efb3f409347ec
plan_head_after: dcb934456dc07d34101cd0198b672a295a6b994f

tech-stack:
  added: []
  patterns:
    - "Owner binding at the build entry point: run_build rebinds notifiers to a fresh { messenger, owner } from the build request; callers can only supply the messenger"
    - "One terminal frame per build_id: notify drops a second error/Completed frame for a build, via a lazily created insertion-ordered Map bounded at 1000 entries"

key-files:
  created:
    - spec/jasmine/BuilderStatusFramesSpec.js
  modified:
    - lib/thinx/builder.js
    - lib/router.build.js
    - lib/thinx/queue.js

key-decisions:
  - "The messenger travels in notifiers (route: app.messenger, queue: this.messenger from the constructor's di_app); the owner is bound only by Builder#run_build through consoleNotifiers, which ignores any owner the caller put in notifiers (D-09, F-5)"
  - "A frame is terminal when its type is error or its body is Completed; the first terminal frame per build_id wins and later ones are dropped (F-1, F-2). Progress frames (Pulling repository, Building..., info) are always sent"
  - "processExitData treats a status starting with OK as success (Completed); any other payload sends its status string, or Failed for exit codes, spawn errors, null and status-less objects, as an error frame. blog.state gets the object's status or error for non-objects"
  - "The terminal memory size is a module constant TERMINAL_FRAME_MEMORY = 1000 in builder.js (T-43-10)"

patterns-established:
  - "Builder frame specs: real Builder + Object.create(Messenger.prototype) + FakeSocket subscribed with subscribeSocket; count frames per socket and per build_id, never print payloads"

requirements-completed: [NOTIF-03]

coverage:
  - id: D1
    description: "A build refusal inside run_build, started through the real build route, reaches both of owner A's sockets with the unchanged Build Status frame shape; owner B receives nothing; a caller-supplied owner is ignored"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#T1, #T2, #T3, #T5"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unusable notifiers ([], {}, null, no messenger, no owner) send nothing and never throw; an owner without sockets costs nothing (sendToOwner returns 0)"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#T4, #T4b"
        status: pass
    human_judgment: false
  - id: D3
    description: "F-1/F-3: a successful build shows Pulling repository, Building..., then exactly one Completed (success, with build_id) per socket in any event order; no OK frame; concurrent builds keep their own terminal frame"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#F1a, #F1b, #F1c, #E"
        status: pass
    human_judgment: false
  - id: D4
    description: "F-2: failures, worker status strings, exit codes, null payloads, spawn errors, the remote-worker guard and worker refusals each give one error frame and nothing green after it"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#F2a, #F2a', #F2b, #F2c, #F2d, #P1"
        status: pass
    human_judgment: false
  - id: D5
    description: "F-4 / D-10: raw build log lines never reach a console socket; wsOK, sendNotificationIfSocketAlive, buildStatusNotification and the notifiers.websocket path are gone; the terminal memory is bounded"
    requirement: NOTIF-03
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#F4, #M1, #S1, #S2"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-12: queued builds pass the queue's messenger and reach only the owner's sockets; a queue without a messenger still builds"
    requirement: NOTIF-03
    verification:
      - kind: integration
        ref: "spec/jasmine/BuilderStatusFramesSpec.js#Q1, #Q2, #Q3, #S3"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real build's status toasts appear in every open Legacy tab of the owner on rtm.thinx.cloud (Pulling repository, Building..., Completed or the failure reason)"
    requirement: NOTIF-03
    verification: []
    human_judgment: true
    rationale: "Needs the deployed API, a real worker build and a browser with two Legacy tabs; 43-03 owns the deploy and the human check (D-16)"

duration: 8min
completed: 2026-10-12
status: complete
---

# Phase 43 Plan 02: Build Status Frames to the Owner Summary

**Builder status frames now go through `messenger.sendToOwner` to the owner that `run_build` binds from the build request. The route and the queue pass only the app messenger. Each build gets exactly one terminal frame: green `Completed` only when the status is OK, otherwise an error frame with the reason. Raw log lines are no longer sent to console sockets.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-12T21:07:38Z
- **Completed:** 2026-10-12T21:15:31Z
- **Tasks:** 3 (Task 1 tracer, Tasks 2-3 auto, all tdd)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `Builder#consoleNotifiers(notifiers, owner)` returns a new `{ messenger, owner }`. `run_build` rebinds `notifiers` with it at its first line, so `runShell`, `dispatchRemoteBuild`, `runRemoteShell`, `refuseBuild` and every `notify` of the build send to `br.owner`. An owner the caller put in `notifiers` is ignored.
- `notify` sends `{ notification: buildNotification(...) }` through `messenger.sendToOwner`. The frame shape is unchanged: the string starts with `{"notification":{"title":"Build Status","body":` and carries `type`, `udid` and `build_id` (D-11). The frame is never logged, and an owner with no open console costs nothing.
- The frame rules from UI-SPEC are now enforced. F-1: one terminal frame per build_id (bounded memory of 1000). F-2: `processExitData` is null-safe, sends `Completed` only for an `OK…` status, and otherwise sends the status or `Failed` as an error frame. The remote-worker guard frame is type error, and a worker refusal produces one `worker_busy` frame. F-3: `Completed` always carries build_id. F-4: the raw log-line send is gone.
- `lib/router.build.js` passes `{ messenger: app.messenger }`, and the never-filled `app.existing_sockets` map and its log lines are gone. `Queue` records `di_app.messenger`, and `runNext` passes `{ messenger }` instead of `[]` (D-12).
- `spec/jasmine/BuilderStatusFramesSpec.js` has 24 local specs. They count the frames each fake socket receives, using a real Builder, the real build route and real Queue scheduling.

## Task Commits

1. **Task 1 (tracer): owner-bound delivery from the build route.** RED `bc2729bc` (test), GREEN `d92b82b6` (feat).
2. **Task 2: frame rules F-1..F-4.** RED `1a9b6597` (test), GREEN `ecac53d5` (feat).
3. **Task 3: queued builds (D-12).** RED `263cc5f6` (test), GREEN `dcb93445` (feat).

**Plan metadata:** see the docs(43-02) commit that carries this SUMMARY.

Tracer feedback gate (Task 1): auto mode is off, `human_verify_mode` is end-of-phase, and the verify step is automated-only. I re-ran it: BuilderStatusFramesSpec 7/7, BuilderRemoteJobSpec + BuilderPathSpec 109/109. Tracer verified end-to-end, so I expanded to Tasks 2-3 with no checkpoint.

## TDD Gate Compliance

| Task | RED record | Verdict | Target | Semantic assessment |
|------|-----------|---------|--------|---------------------|
| 1 | `43-02-RED-task1.json` | RED_EVIDENCE_OK (target_test_failed) | T1 | T1 failed on `A1 frame count: expected 0 to equal 1`, because the refusal frame still went to the never-filled `notifiers.websocket`. T2-T5 and S1 failed on the missing wiring (websocket field, null dereference, no `consoleNotifiers`, `existing_sockets`). This was the planned reason. |
| 2 | `43-02-RED-task2.json` | RED_EVIDENCE_OK (target_test_failed) | F1a | F1a failed on `A1 bodies: expected [Completed, OK]`. The other F-rule specs failed on each rule's own defect. F2a', F4 and P1 already passed, because Task 1 had removed the dead socket path; they now guard against regressions. |
| 3 | `43-02-RED-task3.json` | RED_EVIDENCE_OK (target_test_failed) | Q1 | Q1 failed because the notifiers were the array `[]`. Q2 showed the effect end to end: no frame reached A. Q3 and S3 failed on the same missing wiring. |

Each `test(43-02)` commit comes before its `feat(43-02)` commit. No REFACTOR commit was needed.

## Files Created/Modified

- `lib/thinx/builder.js`: adds `consoleNotifiers`, `terminalFrameSent` and `TERMINAL_FRAME_MEMORY`. `notify` now delivers through `sendToOwner`. Rewrites `processExitData`, removes the log-line and duplicate `Completed` sends from `processShellData`, and fixes the remote guard type. Removes `wsOK`, `sendNotificationIfSocketAlive` and `buildStatusNotification`.
- `lib/router.build.js`: notifiers are `{ messenger: app.messenger }`; `existing_sockets` is removed.
- `lib/thinx/queue.js`: adds `this.messenger` from `di_app`; `runNext` notifiers are `{ messenger }`.
- `spec/jasmine/BuilderStatusFramesSpec.js`: new spec covering T1-T5, S1, F1a-F1c, F2a-F2d, F4, P1, E, M1, S2, Q1-Q3 and S3.

## Verification

- Plan-level helper-free jasmine run: BuilderStatusFramesSpec 24, BuilderRemoteJobSpec 75, BuilderPathSpec 34, MessengerOwnerSocketSpec 24, LogTailOwnerSpec 20. Combined: **177 specs, 0 failures** (the plan required at least 171).
- Adjacent local specs: BuilderApiKeySpec 54/0, SocketUpgradeSpec 10/0.
- Acceptance greps:
  - `existing_sockets` in router.build.js: 0. `messenger: app.messenger`: 1.
  - `consoleNotifiers(` in builder.js: 2. `sendToOwner(`: 1.
  - In builder.js code lines, matches for `notifiers.websocket|wsOK|sendNotificationIfSocketAlive|buildStatusNotification`: 0. `message == "OK"`: 0.
  - `[], // notifiers` in queue.js: 0. `this.messenger`: 2.
  - `node --check` passes on builder.js, router.build.js and queue.js.
- `git diff --quiet origin/thinx-staging -- lib/thinx/messenger.js` exits 0, so the messenger is untouched (D-01, D-06, D-15).

## Decisions Made

- The owner is bound in `run_build`, not in `refuseBuild` or `notify`. The 5-argument `notify` signature and the identity of the notifiers object passed to `refuseBuild` stay as they were, so BuilderPathSpec and BuilderRemoteJobSpec pass unchanged.
- A terminal frame is `type: error` or body `Completed`. A build_id that is not a string is never remembered, so its frames are always sent.
- `processExitData` passes `data.status` to `blog.state` for an object payload, as before, and `error` for a non-object payload, instead of `undefined`.

## Deviations from Plan

None. The plan was executed as written. These additions stay inside the plan's scope:
- The spec covers more than the minimum: T5 (consoleNotifiers contract), F2a' (worker status string as the reason), P1 (no Completed without a terminal status), M1 (bounded memory, T-43-10) and S3 (Queue constructor wiring).
- `notify` uses `String(message)` for the `build_running` test, so a non-string message cannot throw.

## Issues Encountered

- QueueSpec, QueueActionSpec and XBuilderSpec fail locally with `connect ECONNREFUSED 127.0.0.1:6379` in `beforeAll`, because they need Redis. This does not come from this plan's change. They run in the CI test job against real Redis and CouchDB.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema surface. The repository-controlled MCU `arch` text in a refusal body (flagged in the plan) now reaches the owner's toast. The Legacy console escapes it with `thinxEscapeHtml` (NOTIF-01, D-01).

## User Setup Required

None.

## Next Phase Readiness

- 43-03 can push to `thinx-staging` and run the live proofs. The human check (D-16) should use a device that already has a build record, or start the build from Device detail. The Legacy `deviceBuilds[udid].push` defect for devices with no build history is still accepted (D-14).
- Nothing has been pushed (pushing belongs to 43-03).

---
*Phase: 43-notification-delivery*
*Completed: 2026-10-12*

## Self-Check: PASSED

- FOUND: spec/jasmine/BuilderStatusFramesSpec.js, lib/thinx/builder.js, lib/router.build.js, lib/thinx/queue.js, 43-02-RED-task1.json, 43-02-RED-task2.json, 43-02-RED-task3.json
- FOUND commits on this branch: bc2729bc, d92b82b6, 1a9b6597, ecac53d5, 263cc5f6, dcb93445 (evaluation-scope 43-02 resolved from plan subjects)
- All task acceptance criteria and the plan-level verification were re-run and passed
