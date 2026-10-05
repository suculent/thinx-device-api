---
phase: 23-build-pipeline-sink-hardening
fixed_at: 2026-09-28T20:31:23Z
review_path: .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
iteration: 5
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-09-28T20:31:23Z
**Source review:** .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md (iteration 4)
**Iteration:** 5. This was a small targeted pass that the user approved.

**Summary:**
- Findings in scope: 3. The user picked WR-01, WR-02 and IN-15. WR-03, IN-16, the other info items and the legacy `cmd` path were out of scope and were not touched.
- Fixed: 3. WR-01 and WR-02 change concurrency and state logic, so they need human verification.
- Skipped: 0

Every commit is GPG-signed (`%G? = G`). Nothing was pushed or deployed. No worker code changed in this pass. The parent gitlink now points at the user's worker commit `d6ca153`.

| Commit | Repo | Subject |
|---|---|---|
| `6f726568` | parent (`thinx-staging`) | fix(23): WR-01 time-limit worker reservations and close the trigger sites |
| `d0c72fac` | parent | fix(23): WR-02 keep queued builds waiting until a worker is free |
| `ab2df9a6` | parent | fix(23): IN-15 return after a failed buildGuards |
| `777d91e6` | parent | chore(23): bump worker submodule to d6ca153 |

## Fixed Issues

### WR-01: A build that dies between selection and dispatch leaves its worker marked busy forever

**Files modified:** `lib/thinx/queue.js`, `lib/router.build.js`, `lib/thinx/builder.js`, `spec/jasmine/BuilderRemoteJobSpec.js`
**Commit:** `6f726568`
**Status:** fixed: requires human verification (reservation lifecycle)

**Applied fix, part (a): reservations now expire.**

A worker entry now has three fields. `running` is the existing flag. `running_since` is when the reservation started, in ms. `dispatched` is the `build_id` of the job that was emitted to the worker, or `null`.

- **Reserving.**
  - `Queue.reserveWorker` sets all three fields (`running_since = now`, `dispatched = null`).
  - The router and `runNext` both call it, where they used to set only `running = true`.
  - `runRemoteShell` records `dispatched = build_id` at the emit and restarts `running_since`.
- **Bounds.**
  - `Queue.PREP_RESERVATION_MS` is 2 minutes. It applies while nothing has been dispatched.
  - `Queue.BUILD_RESERVATION_MS` is 60 minutes. It applies once a job has been dispatched.
  - The builder's own loop is `MAX_ITERATIONS` 60 × `sleep 30`, about 30 minutes. The extra time covers the image pull, the swarm task start and `notifier.js`.
- **Reclaiming.**
  - `nextAvailableWorker()` releases a connected worker whose reservation has outlived its bound, then treats it as free. It logs `⚠️ [warning] [queue] reclaiming stale reservation of worker <id>: <no build dispatched | build X dispatched>, reserved N s ago`.
  - The `poll` handler applies the same check before its `running` test.
  - A worker that registered with `running: true` has no timestamp and is left alone, as before.
- **Releasing.**
  - A releasing `job-status` clears all three fields (`Queue.releaseWorker`).
  - The router and `runNext` callbacks on `success !== true` now call `Queue.releaseReservation`. It does nothing while the worker carries a dispatched job.
  - `Builder.releaseWorker(worker, build_id)` releases only when the worker does not carry *another* build's job.
- **Guard at the emit (added because of the bound).**
  - A legitimate preparation can take longer than 2 minutes. The git timeout alone is 10 minutes per attempt. Its reservation can therefore be reclaimed and handed to build C.
  - `runRemoteShell` now refuses a worker that is `running` with `dispatched` set to a different build. It notifies `worker_busy` and returns false, so `dispatchRemoteBuild` applies D-10 (`BUILD_FAILED`, `error`, `cleanupSecrets`). It does **not** release the worker.
  - Without this guard, the late job would reach a worker that is building C, and the deployed `a2e4bfa` worker drops such a job silently.
  - In the same way, a late `callback(false)` from the slow build cannot free C's worker.

**Applied fix, part (b): the trigger sites now refuse.**

For testability, `Builder` now keeps `devicelib`/`userlib` as instance fields (`this.devicelib`, `this.userlib`). They are the same module-level handles as before.

- **`build()`, `devicelib.view` errors.** Every error now calls back `false`. `missing` still answers `no_devices`; any other error answers `device_list_failed`. The "No DB shards" retry is gone: it scheduled `that.list(...)`, a method `Builder` never had.
- **`Object.keys(doc.repos)`.** An owner document without `repos` is treated as having no sources. `git` stays null and the existing `invalid_params` refusal answers.
- **`device.platform.split`.** A missing or empty platform now goes to `refuseBuild(..., "device_platform_unknown")`: notify, blog `error`, `cleanupSecrets`, `callback(false)`. That happens before any secret is written.
- **`formatMacForDevSec(device.mac)`.** It returns `null` for a non-string. This check runs after `build_started`, so a null result now triggers a full refusal:
  - `releaseWorker(br.worker, build_id)`
  - a `device_mac_missing` notification
  - `failRemoteBuild`, which records `BUILD_FAILED`, sets blog `error` and runs `cleanupSecrets(XBUILD_PATH)`
  - no emit
- **Release on every path.** The first three sites call back `false`, which releases through the router or `runNext`. The MAC path releases in the builder.

**Specs (+20; 17 fail on the pre-fix `lib/`).** The 3 that pass on the old code are guards: a fresh reservation is kept, a dispatched reservation past the preparation bound is kept, and a worker with no timestamp is left alone. Two of the 17 failures are also guards: "missing is still `no_devices`" and the complete-device control. They fail on the old code only because the harness injects CouchDB through the new instance fields.
- **Bounds.**
  - The constants are 2 and 60 minutes.
  - An undispatched reservation older than 2 minutes is reclaimed, and the warning is logged.
  - A fresh reservation is kept.
  - A dispatched reservation 30 minutes old is kept.
  - A dispatched reservation older than 60 minutes is reclaimed.
  - A worker with no timestamp is left alone.
  - A poll from a worker with a stale reservation is served.
- **Selection and dispatch.**
  - The router: a build that never calls back holds the worker only until the bound. Once the bound passes, the next request is served instead of being queued.
  - `runNext` times its reservation the same way.
  - The emit records `dispatched` and restarts the clock under the longer bound.
  - A releasing `job-status` clears all three fields.
  - A worker that carries another build's job is refused before the emit. The worker is not released, and B gets `BUILD_FAILED`, `error` and its secrets removed.
  - A lost build that refuses after its worker was reclaimed does not free the job that now holds the worker.
- **Trigger sites, through the real router → `build()` → `run_build`.** The harness stands in only for CouchDB, the API key store, git, `Platform.getPlatform` and `apienv`.
  - `ESOCKETTIMEDOUT` is refused.
  - "No DB shards" is refused at once, and a 10 s fake-clock tick produces no second answer.
  - `missing` is still `no_devices`.
  - An owner without `repos` is refused as `invalid_params`.
  - A device without a platform is refused with `device_platform_unknown`.
  - A device without a MAC: exactly one `build_started` answer, then `BUILD_FAILED` for that build id, blog `error`, `environment.json` removed, the worker released, no emit.
  - A control case: a complete device reaches the emit with `--mac=001122`.

**Two existing iteration-4 specs were changed.** Each dispatched a second build to a worker that already carried the first build's job. The new guard now refuses that second build inside the API. Both specs now set `worker.dispatched = null` before the second dispatch, which simulates an API flag that lost track of the first build. That way they still exercise the worker's own `worker_busy` refusal and the listener attribution.
- "a busy worker's worker_busy refusal fails only the refused build…"
- "each job-status reaches only the build it names…"

### WR-02: The builds the router queues because the worker is busy are marked `error` by `loop()` and never run

**Files modified:** `lib/thinx/queue.js`, `spec/jasmine/BuilderRemoteJobSpec.js`
**Commit:** `d0c72fac`
**Status:** fixed: requires human verification (queue scheduling)

**Applied fix:**
- **`loop()`.** If there is no next action it returns. It then returns on any falsy `nextAvailableWorker()` result, so the action stays `waiting` for a later cron tick. `runNext(next, false)` is no longer reachable from `loop()`.
- **`runNext`.** It first checks the new `Queue.isWorker(worker)`: an object with a non-null `socket` object. For anything else it logs and returns. It does not call `setStarted`, `setError` or `delete`, and it does not call `build()`. `actionWorkerValid` is unchanged, and the `action` check still goes through it.
- **Tidy-up.** The null/false checks around `reserveWorker`/`releaseReservation` in `runNext` are now redundant and were dropped.

**Specs (+5; all 5 fail on the pre-fix `queue.js`):**
- `loop()` with no worker, then with only a busy worker, leaves the action untouched (no `setError`, `setStarted` or `delete`) and builds nothing. After an idle worker registers, the next `loop()` starts the action once and builds it on that worker with `{ udid, source_id, dryrun: false }`, and the worker ends up `running`.
- `runNext` with `false`, `null`, `undefined` or `{}` (no socket) leaves the action untouched and builds nothing.

### IN-15: `buildGuards` calls back `false` without returning

**Files modified:** `lib/thinx/builder.js`, `spec/jasmine/BuilderRemoteJobSpec.js`
**Commit:** `ab2df9a6`
**Status:** fixed

**Applied fix:** `run_build` now returns right after `recordStatsEvent(BUILD_FAILED)` when `buildGuards` fails. A false callback therefore means nothing is prepared and nothing is dispatched: there is no second callback or HTTP response, no checkout, and no secrets on disk. The router's `res.headersSent` guard that the reviewer also suggested was not added, because the brief asked for the `return` only.

**Behaviour note:** a source with no `branch` is now refused as `branch undefined` on the queue path as well. The router already sent the client that answer. Before this fix, the fall-through defaulted the branch to `origin/main` and built anyway. `Sources.add` always stores a branch (`normalizedBranch` defaults it to `main`), so this affects only legacy or malformed source documents.

**Specs (+2; both fail on the pre-fix `builder.js`):**
- `run_build` with `branch: undefined` calls back exactly once with `[false, "branch undefined"]`. `devicelib.get` and `blog.log` are never called, and exactly one `BUILD_FAILED` is recorded.
- Through the router and the real `build()`, a source with no branch gets exactly one response (`{ success: false, response: "branch undefined" }`). Nothing is prepared, and the worker is released.

## Deferred (out of scope for this pass)

- **WR-03, the worker never reconnects after a build.** This item, including the worker's post-build `socket.disconnect()`, is deferred to the worker todo. The API's release model still depends on that disconnect:
  - JOB-RESULT does not release, and a disconnect deletes the registry entry.
  - Whoever fixes WR-03 must add an idle signal on a clean exit, or keep "disconnect, then reconnect".
  - Until then, with one replica, every build after the first is now **queued and kept** (WR-02) until the worker container restarts. It is no longer discarded.
- **IN-16.** A `worker_busy` refusal still fails the build instead of queueing it again. So does the new API-side "worker carries another build's job" refusal.
- **Other items not addressed.** All other info items and the legacy `cmd` path.

## Residual risks (for the verifier)

- **The prep bound can reclaim a slow but healthy preparation.** 2 minutes is shorter than the worst-case clone (the git timeout is 10 minutes per attempt). When another build takes the worker in that window, the slow build is refused at its emit (D-10, `worker_busy`), not lost.
  - **Remaining gap:** a reclaimed reservation that has not yet been *dispatched* by its new owner C can still be released by the slow build's late `callback(false)`. A third build D could then select the worker, and C and D would race to the emit. The loser is refused by the new guard, so neither job is dropped silently.
  - Raising `PREP_RESERVATION_MS` narrows all of this at the cost of a longer wedge.
- **Throws inside `getLastAPIKey`'s async callback** (for example `mkdirp.sync` or `readdirSync`) are still unhandled rejections. They were not in the pass-5 list. The time limit now bounds their effect to 2 minutes of lost worker capacity; the request still hangs.
- **Queued builds wait only for the cron tick** (`*/5 * * * *`) and have no TTL. Nothing triggers `loop()` on `workerReady`. If no worker ever comes back, the action waits indefinitely, visibly, instead of being errored.

## D-01 (deploy order)

- **New API with the deployed worker `a2e4bfa`, or with `4902380`/`d6ca153`: compatible.** The job-status and job payloads are unchanged.
  - The new emit guard stops the API from sending a second job to a worker it knows is busy. That is exactly the case `a2e4bfa` would drop silently.
  - The 60-minute bound after dispatch is longer than the builder's own 30-minute loop.
- **Current API with the new worker:** not affected. This pass changed no worker code.

## Verification

All gates ran in the **main checkout** (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, branch `thinx-staging`), not in an isolated worktree. The caller asked for the main working tree, and `workflow.use_worktrees` is not set. The results can be reproduced from the current tree.

- **API specs (hermetic, no helpers):**
  - Command: `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<{"spec_dir":"spec/jasmine","helpers":[]}> spec/jasmine/{BuilderPath,BuilderRemoteJob,Git,SafePath,Sanitka,Finder}Spec.js`
  - Result: **242 specs, 0 failures**, up from the 215 baseline (+27). It passed 3 runs in a row with random order.
  - The `writePoint ... ECONNREFUSED 127.0.0.1:8086` lines are from older specs and were there before.
- **Fail-first check:** the fix files were stashed and the specs run against the new spec file.
  - WR-01: 17 of 20 fail.
  - WR-02: 5 of 5 fail.
  - IN-15: 2 of 2 fail.
- **Worker:** `npm --prefix services/worker test` gave **49/49** on `d6ca153`, the gitlink target.
- **ESLint:** clean on `lib/` and `spec/jasmine/BuilderRemoteJobSpec.js`.
- **Syntax:** `node -c` passed on `builder.js`, `queue.js` and `router.build.js`.
- **Not run:** `QueueSpec`, `XBuilderSpec` and the other specs that need Redis or CouchDB.
  - `QueueSpec` calls `runNext(next, workers[0])` with an empty registry. That is now a logged no-op instead of `setError`.
  - `XBuilderSpec` passes `nextAvailableWorker()`, which is `false`, so it does not reach the changed dispatch code.

---

_Fixed: 2026-09-28T20:31:23Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 5_
