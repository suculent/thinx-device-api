---
phase: 23-build-pipeline-sink-hardening
fixed_at: 2026-09-28T19:37:59Z
review_path: .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-09-28T19:37:59Z
**Source review:** .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03). IN-01..IN-10 are out of scope for `critical_warning`.
- Fixed: 3
- Skipped: 0 findings. One optional sub-part of WR-03 (socket.io handshake authentication) was skipped; see *Skipped Issues*.

All commits are GPG-signed (`%G? = G`). Nothing was pushed or deployed. The legacy `cmd` shell path is untouched.

| Commit | Repo | Subject |
|---|---|---|
| `a2e4bfa` | services/worker (`main`) | fix(23): WR-01 echo only identifying fields from failJob |
| `6b1f5ead` | parent (`thinx-staging`) | fix(23): WR-01 log only identifying job-status fields in the notifier |
| `a65005f3` | parent | chore(23): bump worker submodule to WR-01 failJob echo fix |
| `01783ca8` | parent | fix(23): WR-02 serialise clones per checkout directory |
| `3aa947c0` | parent | fix(23): WR-03 send each remote job to the selected worker only |

## Fixed Issues

### WR-01: Worker `failJob` sends the full job (argv `--env`, `cmd`, `WORKER_SECRET`) back to the API, which logs it verbatim

**Files modified:** `services/worker/class.js`, `services/worker/test.js`, `lib/thinx/notifier.js`, `spec/jasmine/BuilderRemoteJobSpec.js`, `services/worker` (gitlink)
**Commits:** `a2e4bfa` (worker), `6b1f5ead` (API), `a65005f3` (pointer bump)
**Applied fix:**
- **Worker:** `failJob` builds a new object and no longer deep-copies the job. It sends `build_id`, `udid`, `owner`, `status: "Failed"` and `details`, and never `secret`, `argv`, `cmd`, `path` or env. A job that is `null` or not an object no longer throws.
- **API:** `notifier.process` used to log `{ job_status }`. It now logs `loggableStatus(job_status)`: only the scalar values of `build_id`, `udid`, `owner`, `status`, `state` and `details`. An old worker that still echoes the whole job therefore cannot leak through this log line. The same whitelist also keeps the builder's JOB-RESULT annotation object (git URL, env hash and similar) out of the log.
- **Worker tests** (+4, 42 -> 46):
  - A unit test checks that the `failJob` payload has exactly those five keys.
  - A null-job test.
  - Two socket round-trips through the mock API server, one with a wrong job secret and one with an invalid argv. Both jobs carry `--env={"WIFI_PASS":"hunter2"}`, and the test asserts that the `job-status` the server receives contains neither `hunter2`, `--env` nor the secret.
  - All four fail on the old `failJob`.
- **API specs** (+2):
  - `notifier.process` is fed a legacy full-job echo with no `outfile`, so it returns before any CouchDB call. The test asserts that no log line contains the env payload, the secret, `argv`, `cmd` or the path.
  - A `loggableStatus` unit test.
  - Both fail against the old notifier.

### WR-02: Concurrent `prefetch_repository` calls for the same device now interleave in one checkout directory

**Files modified:** `lib/thinx/git.js`, `spec/jasmine/GitSpec.js`
**Commit:** `01783ca8`
**Status:** fixed: requires human verification (concurrency logic)
**Applied fix:**
- **The lock:** a module-level `withCheckoutLock(buildPath, task)` keeps one promise-chain tail per `path.resolve(buildPath)`.
  - A task starts only after the previous task for that directory has settled.
  - The tail is released whether the task resolves, rejects or throws synchronously.
  - The map entry is deleted when the last tail settles.
  - A non-string or empty path runs unlocked, so `cloneHoldingLock` still reports the error as before.
- **`cloneRepository(...)`** now takes the lock and runs the unchanged body, which was renamed `cloneHoldingLock`.
- **`fetch(...)`** takes the lock once around **all** of its key attempts (`fetchHoldingLock`), and calls `cloneHoldingLock` directly because the lock is not re-entrant. This closes the reviewer's worst case: fetch A's next-key `emptyDirSync` can no longer wipe a checkout that fetch B has just reported as good.
- Every caller is covered without changes: `Sources.add`, `builder.prefetchPublic`/`prefetchPrivate` and `devices.prefetch_repository` all go through `cloneRepository` or `fetch`.
- **GitSpec:**
  - The four existing spies that observed fetch's attempts (`(f)`, `(g)`, `(h)`, D-09) now spy on `cloneHoldingLock`.
  - Five new cases in "per-directory checkout lock (WR-02)":
    - two concurrent real `cloneRepository` calls into one directory (spelled two ways, `dir` and `dir/`) both succeed, with at most one clone running at a time and an intact checkout (`basename.json` plus the repo directory, the expected `thinx.yml` and a clean `git status`)
    - the same with two concurrent keyless `fetch` calls
    - two keyed fetches whose `k1` fails: the event order proves that B starts only after A has finished both keys
    - clones into different directories still run in parallel
    - the lock is released after a synchronous throw and after a rejection, and a third clone then succeeds
  - With the lock disabled, 3 of the 5 fail. Both concurrent-clone cases fail, matching the reviewer's reproduction.
- **What to verify:**
  - The lock is **in-process only**. Two API replicas that share the data volume are not serialised against each other.
  - The lock ends when the clone ends. A caller that reads the checkout later can still meet the next queued clone re-creating the directory. For example, `devices.prefetch_repository` runs `sources.update` and then `updatePlatform(repo_path)` after `fetch` resolves. Each clone now finishes intact, and the last one leaves a complete tree. But a platform inference made while a second clone is running can still read a partial tree. It is last-writer-wins on the owner document, and the second caller's inference runs later on the complete tree. Closing this fully means holding the lock across the caller's post-clone reads, or cloning into a `mkdtemp` sibling and renaming it into place. The code comment records both.

### WR-03: `runRemoteShell` broadcasts every job to all sockets on the socket.io server

**Files modified:** `lib/thinx/builder.js`, `lib/thinx/queue.js`, `spec/jasmine/BuilderRemoteJobSpec.js`, `spec/jasmine/BuilderPathSpec.js`
**Commit:** `3aa947c0`
**Applied fix:**
- **`builder.runRemoteShell`:**
  - `this.io.emit('job', job)` is now `worker.socket.emit('job', job)`. The job, including the job secret and the `--env` payload, goes only to the worker that `queue.runNext` selected and marked as running, so no other idle worker runs it.
  - The worker guard now also refuses a worker whose socket is `null` or has no `emit`/`on` functions. It returns `false` with the existing notify, which keeps the iteration-1 WR-02 refusal contract in `run_build`.
  - The `this.io === null` refusal (`error_starting_build`) was removed because nothing uses `io` for delivery any more. `this.io`/`setIo` stay because the queue still assigns it.
  - The unused masked `copy` (IN-10) was left alone.
- **Queue bookkeeping** (`queue.js`):
  - Workers are tracked in `this.workers[socket.id] = { socket, running, connected, previous_id }`. The cron `loop()` already passed that object to `runNext`, which sets `worker.running = true` and clears it in the build callback, and `job-status` clears it as well.
  - The `poll` handler passed `socket.id`, a string, as the worker. Because class bodies are strict mode, `runNext` threw `Cannot create property 'running' on string` after it had already called `action.setStarted()`.
  - `poll` now looks up the registered worker object and skips unregistered or busy pollers. It re-checks after the `findNext` await before calling `runNext`.
  - `services/worker` does not currently call `loop()`/`poll`, so this path is dormant in production.
- **Specs:**
  - The `remoteBuilder()` helpers in `BuilderRemoteJobSpec` and `BuilderPathSpec` now record the worker socket's emits separately from `io` broadcasts. The success cases assert that the broadcast list stays empty.
  - The old "io missing -> refuse" case became "io null -> still delivered to the worker".
  - Two bad-worker refusals were added: a null socket, and a socket without `emit`.
- **New "job delivery to the selected worker only (WR-03)" block:** it runs a real socket.io server on an ephemeral 127.0.0.1 port with the Queue's own socket handlers, set up through `Object.create(Queue.prototype)` plus `setupIo`, so it needs no Redis and no port 4000.
  - Two clients register the way the worker does, and a third connects without registering.
  - `queue.nextAvailableWorker()` picks the first worker, and `runRemoteShell` is called with `builder.io` set to the live server, so a regression to a broadcast would reach every client.
  - The chosen client receives the job exactly once. The other registered worker and the unregistered bystander receive nothing within 250 ms.
  - A second case checks that `poll` hands `runNext` the registered worker object, and that a busy poller and an unregistered poller start nothing.
  - Against the old broadcast and the old poll handler, 7 cases fail.

## Skipped Issues

No finding was skipped. One optional part of WR-03 was not implemented.

### WR-03 (optional part): socket.io handshake authentication on the queue server

**File:** `lib/thinx/queue.js:94-102`, `services/worker/class.js` (constructor `io(build_server)`)
**Reason:** Port 4000 is swarm-internal, per the user on 2026-09-28. The residual risk is that any container inside the swarm can connect.
**Why it was not done in this pass:** The broadcast fix above already stops a merely connected socket from receiving jobs. A client now has to register and then be picked by the queue. Enforcing handshake auth is not a small change:
- Today's workers call `io(build_server)` with no `auth` option, so `socket.auth` is `undefined` and the `connect_error` handler never sets a token. Every deployed worker therefore connects without credentials.
- If the API required `WORKER_SECRET` at the handshake or at `register`, remote builds would stop the moment the API rolled out ahead of a new worker image (`thinxcloud/worker:latest` is a separate service). Rolling back the worker alone would stop them again. That breaks the D-01 rule that the API and the worker deploy in either order.
- Doing it safely needs a worker change that sends `auth: { token }`, a warn-only transition on the API (the same pattern as the D-03 `cmd`-only warning), and a later enforcement step.

**Original issue:** The socket.io server in `queue.js` has no `io.use` authentication, so any client that can reach port 4000 can connect, `register` as a worker and send `job-status`.

## Verification

All gates ran in the **main checkout** (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, branch `thinx-staging`), not in an isolated worktree. `workflow.use_worktrees` is not set in `.planning/config.json`, but the caller directed the work into the main tree, and WR-01 needed a commit inside the `services/worker` submodule on `main`. The results can be reproduced from the current tree.

- **API specs (hermetic, no helpers):**
  - Command: `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<{"spec_dir":"spec/jasmine","helpers":[]}> BuilderPathSpec BuilderRemoteJobSpec GitSpec SafePathSpec SanitkaSpec FinderSpec`
  - Result: **200 specs, 0 failures**, up from a baseline of 189: +2 for WR-01, +5 for WR-02, +4 for WR-03.
  - Each new spec was also run against the pre-fix code, and it failed there.
  - `XBuilderSpec`, `QueueSpec`, `NotifierSpec`, `SourcesSpec` and `DevicesSpec` need Redis or CouchDB and were not run. `XBuilderSpec` passes `queue.getWorkers()[0]` (undefined) as the worker, which `runRemoteShell` already refused before this change.
  - The WR-03 socket specs print `writePoint Error: connect ECONNREFUSED 127.0.0.1:8086`. This comes from the existing `recordStatsEvent` -> Influx call on a successful remote dispatch, which has no Influx to talk to in a hermetic run. It is not a failure.
- **Worker:** `npm --prefix services/worker test` gave **46/46**, up from 42.
- **ESLint:** clean on every touched parent file. `services/worker` is on the parent's ESLint ignore list.

---

_Fixed: 2026-09-28T19:37:59Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
