---
phase: 23-build-pipeline-sink-hardening
reviewed: 2026-09-28T20:40:05Z
depth: standard
iteration: 5
files_reviewed: 21
files_reviewed_list:
  - lib/router.build.js
  - lib/thinx/builder.js
  - lib/thinx/devices.js
  - lib/thinx/git.js
  - lib/thinx/notifier.js
  - lib/thinx/queue.js
  - lib/thinx/platform.js
  - lib/thinx/plugins/pine64/plugin.js
  - lib/thinx/safepath.js
  - lib/thinx/sanitka.js
  - lib/thinx/sources.js
  - package.json
  - services/worker/class.js
  - services/worker/test.js
  - services/worker/builder
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SafePathSpec.js
  - spec/jasmine/SanitkaSpec.js
  - spec/jasmine/XBuilderSpec.js
findings:
  critical: 0
  warning: 1
  info: 20
  total: 21
status: issues_found
---

# Phase 23: Code Review Report (iteration 5, final pre-deploy pass)

**Reviewed:** 2026-09-28T20:40:05Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This pass reviews the pass-5 fixes and checks them for regressions:
- parent `6f726568` (WR-01), `d0c72fac` (WR-02), `ab2df9a6` (IN-15) and `777d91e6` (gitlink), via `git diff 48f53dbf..HEAD -- lib spec`
- worker `d6ca153`, via `git -C services/worker diff 4902380..d6ca153`

`devices.js`, `git.js`, `notifier.js`, `platform.js`, `plugins/pine64/plugin.js`, `safepath.js`, `sanitka.js` and `sources.js` have not changed since iteration 4 (`git diff --stat` is empty). I rechecked them only as callers and for the carried items.

**Gates re-run in the main checkout:**
- Hermetic API specs (BuilderPath, BuilderRemoteJob, Git, SafePath, Sanitka, Finder), random order: **242 specs, 0 failures**. This matches the baseline.
- Worker `npm --prefix services/worker test`: **49/49**.
- `npx eslint` on `queue.js`, `builder.js`, `router.build.js` and `BuilderRemoteJobSpec.js`: clean.
- `bash -n services/worker/builder`: passes at both `4902380` and `d6ca153`.

### Status of the pass-4 findings

| Item | Status |
|---|---|
| WR-01: the busy flag can stick forever | **Fixed.** A lost build now holds the worker for at most `PREP_RESERVATION_MS` (2 min) before dispatch and `BUILD_RESERVATION_MS` (60 min) after it. The reclaim runs in `nextAvailableWorker()` (`queue.js:389-401`) and in `poll` (`queue.js:479`). All four named trigger sites now call back or refuse (see below). **The new lease creates the regression in WR-01 below.** |
| WR-02: `loop()` null/false drops queued builds | **Fixed.** `loop()` returns on any falsy worker (`queue.js:319-320`), and `runNext` returns before `setStarted`/`setError`/`build()` unless `Queue.isWorker(worker)` holds (`queue.js:245-248`). Queued actions stay `waiting`. |
| WR-03: the worker never reconnects | Deferred to the worker todo, as instructed. Not re-raised. |
| IN-15: `buildGuards` has no return | **Fixed** (`builder.js:854-857`). The side effect is acceptable; see IN-18. |
| IN-16 | Deferred, as instructed. Not re-raised. |

### Answers to the brief

**Can a worker still get stuck?** Not permanently.
- **Before dispatch.** Every reservation made by the router or `runNext` carries `running_since` and expires after 2 min.
- **After dispatch.** The emit restarts the clock under the 60-min bound.
- **The one remaining case** is a worker that registered with `running: true` (`queue.js:413`). It has no timestamp and is left alone, as before. The worker's disconnect still clears that entry.
- **Queue actions.** A `running` action cannot wedge `findNext`'s concurrency count either, because `setStarted` sets a 20-min Redis `expire` (`queue_action.js:31-33`).

**Can a worker be double-dispatched?** Not silently.
- The emit guard (`builder.js:331-335`) refuses any build whose worker is `running` with another build's `dispatched` id.
- Two builds can both hold a reservation on the same worker while neither is dispatched: a reclaimed build and its successor, or the case in WR-01. The first to reach the emit wins, and the other is refused loudly with `worker_busy` and D-10.

**Can a worker be released while it is building?**
- **By a late `callback(false)` or `releaseWorker` from a stale owner:** no. Both `Queue.releaseReservation` (`queue.js:364-368`) and `Builder.releaseWorker(worker, build_id)` (`builder.js:425-431`) skip a worker that carries a dispatched job.
- **By the reclaim:** yes, after 60 min of dispatch. A build that really runs that long then loses its flag (IN-20).
- **By a stale owner before dispatch:** yes. A stale owner *can* release a successor's **undispatched** reservation (WR-01).

**The emit refusal.** Correct.
- It notifies `worker_busy`, returns `false` and does not release. `dispatchRemoteBuild` then runs `failRemoteBuild` exactly once: `BUILD_FAILED`, blog `error`, `cleanupSecrets(XBUILD_PATH)`.
- No listener is attached, because the guard sits before `socket.on`.
- The guard compares against the build's own `build_id`, so a build never refuses itself.

**The four trigger-site refusals.**

| Site | Location | Callback | Worker release | Secrets |
|---|---|---|---|---|
| `devicelib.view` errors | `builder.js:1374-1382` | `callback(false, {response: "no_devices" \| "device_list_failed"})`, once | Released by the router or `runNext` | None on disk yet |
| An owner document without `repos` | `builder.js:1470` | `invalid_params`, `callback(false)` | Released by the router or `runNext` | None on disk yet |
| A device without a platform | `builder.js:996-998` | `refuseBuild`, whose `callback(false)` comes before `build_started` | Released by the router or `runNext` | `cleanupSecrets`. Nothing decrypted has been written yet: the `thinx.yml` write-back is later. |
| A device without a MAC | `builder.js:1222-1229` | None (the build is past `build_started`) | `releaseWorker(br.worker, build_id)` | `failRemoteBuild`, then `cleanupSecrets(XBUILD_PATH)` |

- **Double responses.** None of the four sites can answer the router twice.
- **The MAC site.** It is correct, but it sits later than it needs to (IN-17).

**`loop()` and `runNext` falsy handling.** Correct.
- `QueueSpec`'s `runNext(next, workers[0])` with an empty registry is now a logged no-op, and that spec asserts nothing about it.
- The `setError` branch of `actionWorkerValid` is now unreachable from `runNext` (IN-19).

**The IN-15 `return` and its side effect.**
- The return is correct. A false `buildGuards` now means no `blog.log`, no clone, no secrets and no second callback.
- A source without `branch` is now refused on the queue path too. The router path already answered "branch undefined" before this fix, and it never reached the emit then, because the second `Util.responder` threw. For users, the router path is therefore unchanged.
- `Sources.add` has stored a branch since `dd14dd11` (2022-02-21). Only older source documents are affected.
- On the queue path the refusal is silent: `runNext` passes `[]` as notifiers and deletes the action.
- The fix also leaves dead defaults behind. See IN-18.

**Worker `d6ca153`.**
- **Nothing functional removed.** The diff comments out `ls`/`ls -la` and two `echo "Current path"` lines. It also moves the `Entering SINK` echo inside the `[[ -d "$SINK" ]]` branch. No command whose exit status, output or side effect the script uses was touched.
- **No secrets newly logged.** Nothing was added except the relocated `echo "Entering SINK ${SINK}"`, which prints a path. The change also *reduces* exposure: the removed `ls -la *` listed the checkout, including the names of `environment.json`/`thinx.yml`.
- **Bash is valid.** `bash -n` passes.
- **One cosmetic defect** (IN-21): the relocated echo is now inside a branch that can never run.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The 2-minute preparation lease expires during healthy builds, and a reclaimed build's late refusal frees its successor's reservation. A slow build plus one concurrent request can now fail a healthy build (regression from the pass-5 WR-01 fix, reproduced)

**File:** `lib/thinx/queue.js:343`, `lib/thinx/queue.js:364-368`, `lib/thinx/queue.js:381-401`, `lib/router.build.js:83-86`, `lib/thinx/queue.js:273,289`, `lib/thinx/builder.js:425-431`, `lib/thinx/builder.js:331`

**Issue:**
- **The bound is shorter than the work it covers.** `PREP_RESERVATION_MS` is 2 minutes, but the preparation it covers is bounded far higher:
  - `gitTimeoutMs` is 600000 per attempt (`git.js:175`, applied at `:339`). There is one public attempt plus one attempt per owner key.
  - The clone is a full-history `git clone` followed by `pull --recurse-submodules` (`git.js:343-364`).
  - The wait for the checkout lock has no limit (IN-14).

  A large firmware repository can take longer than 2 minutes to prepare while being entirely healthy.
- **What happens when it does.** With the single production worker:
  1. Build B is reserved and is still cloning at t+2 min.
  2. Any new `/api/v2/build` request, or the 5-minute cron `loop()` when a queued action exists, calls `nextAvailableWorker()`. That call reclaims W and reserves it for C, with `dispatched = null`.
  3. B and C now both prepare against W, and whichever reaches the emit second is refused with `worker_busy` and the full D-10 failure (BUILD_FAILED, blog `error`, a messenger notification). Before pass 5, C would have been queued and, with WR-02 fixed, run after B.
- **The late-release gap makes it worse.** `Queue.releaseReservation` and `Builder.releaseWorker` identify the reservation only by `dispatched`, not by who owns it. If B then fails before dispatch (for example `git_fetch_failed` after its 10-minute timeout), the router's `callback(false)` releases **C's** undispatched reservation. A third build D can then take W while C is still preparing. The fix report lists this as a residual.

**Reproduced** with the real `Queue` statics and `nextAvailableWorker()` under a controlled `Date.now`:
```
B reserved true null
⚠️ [warning] [queue] reclaiming stale reservation of worker w1: no build dispatched, reserved 180 s ago
C got worker: true
after B late callback(false): running = false (C still preparing)
D got the same worker while C prepares: true
```

**Why WARNING and not BLOCKER:**
- Nothing is lost silently. The emit guard turns every collision into a visible `worker_busy` failure with secrets cleaned.
- It needs a preparation longer than 2 minutes *and* a concurrent request.
- It still beats the pass-4 behaviour, where the collision was a permanent wedge.

It is still the one place where pass 5 makes a healthy build fail that previously would only have waited.

**Fix:** Make a reservation owned, not just timestamped, and renew it while preparation is making progress.
```js
// queue.js
static reserveWorker(worker) {
    const token = {};                      // identity of this reservation
    worker.running = true;
    worker.running_since = Date.now();
    worker.dispatched = null;
    worker.reservation = token;
    return token;
}
static releaseReservation(worker, token) {
    if ((worker === null) || (typeof worker !== "object")) return;
    if (worker.reservation !== token) return;          // reclaimed and handed on
    if ((typeof worker.dispatched === "string") && (worker.running === true)) return;
    Queue.releaseWorker(worker);                       // also clears worker.reservation
}
static renewReservation(worker, token) {
    if (worker && worker.reservation === token && worker.dispatched === null) worker.running_since = Date.now();
}
```
- **Router and `runNext`.** They keep the token in their closure, pass it to `releaseReservation`, and pass it through `build()`, for example as `br.reservation`.
- **Renewal in `run_build`.** It calls `renewReservation` after `prefetchPrivate` succeeds and again before `apienv.list`.
- **`runRemoteShell`.** It refuses when `worker.running && worker.reservation !== br.reservation`, so the build that holds the reservation wins deterministically.
- **The MAC path.** It releases with the token.
- **The simpler alternative** keeps the current model but sets `PREP_RESERVATION_MS` at or above the worst-case preparation, for example `15 * 60 * 1000`, as iteration 4 suggested. That trades a longer lost-build wedge for no false reclaims of healthy builds.

## Info

### IN-01: The known-hosts fallback writes TOFU keys into the "pinned" seeded file, and the comments say otherwise (carried forward, still open)

**File:** `lib/thinx/git.js:184-188`, `lib/thinx/git.js:260-270`
**Issue:** Unchanged. In fallback, `learned: seeded` makes `accept-new` write into the seeded file.
**Fix:** Correct the comments. Alternatively, use `UserKnownHostsFile=/dev/null` + `StrictHostKeyChecking=yes` in fallback.

### IN-02: `Sanitka.udid` is not a UUID validator (carried forward, still open)

**File:** `lib/thinx/sanitka.js:97-108`, used by `lib/thinx/builder.js:204-212`
**Issue:** Unchanged. `"-".repeat(36)` still passes.
**Fix:** Add a `strictUuid` and use it in `buildPathFor`.

### IN-03: Owners without keys get a second identical keyless clone, which can flip `is_private` (carried forward, still open)

**File:** `lib/thinx/git.js:525-529`. Callers: `lib/thinx/sources.js:291-296`, `lib/thinx/builder.js:925-928`, `lib/thinx/devices.js:81-88`
**Issue:** Unchanged.
**Fix:** Return `{ ok, keyed }` from `fetch`, and set `is_private` only on a keyed success.

### IN-04: The `Sources.add` continuation swallows exceptions and leaves checkout residue (carried forward, still open)

**File:** `lib/thinx/sources.js:291-299`
**Issue:** Unchanged.
**Fix:** Call back once from `.catch`, and run `fs.removeSync(TEMP_PATH)` on both failure branches.

### IN-05: Source-add and device-attach fetches never use the D-09 last-good-key memory (carried forward, still open)

**File:** `lib/thinx/sources.js:17`, `lib/thinx/devices.js:15`
**Issue:** Unchanged.
**Fix:** Inject the redis client, or document the limitation.

### IN-06: `run_build` ignores `prefetchPublic`'s result (carried forward, still open)

**File:** `lib/thinx/builder.js:925`, `lib/thinx/builder.js:661`
**Issue:** Unchanged.
**Fix:** `const publicOk = !br.is_private && await this.prefetchPublic(...)`.

### IN-07: `devices.attach` runs an async, link-following `chmodr` concurrently with the prefetch (carried forward, still open)

**File:** `lib/thinx/devices.js:384-386`, `lib/thinx/devices.js:398` -> `lib/thinx/git.js:344`
**Issue:** Unchanged.
**Fix:** Drop it, or use `chmodr.sync` before the prefetch.

### IN-08: `runGit`'s process-group kill and output cap are untested (carried forward, still open)

**File:** `lib/thinx/git.js:47-53`, `lib/thinx/git.js:86-89`
**Issue:** Unchanged.
**Fix:** Add an `ESRCH` assertion and a stubbed-`spawn` `ENOBUFS` test.

### IN-09: `chmodCheckoutSync` walks the whole tree synchronously on the API event loop (carried forward, still open)

**File:** `lib/thinx/git.js:121-134`, called at `lib/thinx/git.js:375`
**Issue:** Unchanged.
**Fix:** Make the walk async, or skip `.git`.

### IN-10: `build()` device matching falls through to an unmatched udid (carried forward, still open)

**File:** `lib/thinx/builder.js:1387-1418`
**Issue:** Unchanged. Matching is by substring (`udid.indexOf(db_udid)`, `:1405`), and when nothing matches, `device` is left at the last row.
**Fix:** Use an explicit `matched` device with exact equality, and return `device_not_found` otherwise.

### IN-11: The queue socket.io server has no handshake authentication (recorded; deliberately not enforced)

**File:** `lib/thinx/queue.js:94-101`, `lib/thinx/queue.js:456-467`
**Issue:** Unchanged. The "handshake auth" item is triaged and not re-raised.
**Fix:** Staged auth, as recorded in iteration 3.

### IN-12: `log` payloads are still attributed to every listener on the socket (residual)

**File:** `lib/thinx/builder.js:360-362`, `lib/thinx/builder.js:390`
**Issue:** Unchanged. The new emit guard shrinks the window, because a second job is no longer emitted to a worker the API knows is busy. Two cases still apply the stray `status: OK` line to the wrong build:
- a worker whose flag lost track of its build;
- the 60-minute reclaim (IN-20).
**Fix:** Have the worker send `{ build_id, line }` for `log`, and filter on it the same way as `jobStatusIsFor`.

### IN-13: The `poll` path: a concurrent `findNext` can dispatch one action twice, and a rejection is unhandled (carried forward; the `loop()` sub-item is fixed by WR-02)

**File:** `lib/thinx/queue.js:469-485`, `lib/thinx/queue.js:174-211`, `lib/thinx/queue.js:311-322`
**Issue:**
- `findNext` still does not claim the action it returns.
- `loop()` and the `poll` handler still await it without a `try`.
- With one replica, the double dispatch is moot. The worker's `loop()` is never called (`class.js:528` has no caller), so `poll` is inactive in production today.
**Fix:** Wrap both bodies in `try/catch`, and claim the action atomically.

### IN-14: Checkout lock limits: it wedges when `runGit` never settles, it waits without bound, and reads happen after release (carried forward, still open)

**File:** `lib/thinx/git.js:149-164`, `lib/thinx/git.js:94-109`; `lib/thinx/devices.js:81-95`
**Issue:** Unchanged. It now also feeds WR-01: the wait for the lock counts against the 2-minute preparation lease.
**Fix:** As in iteration 3.

### IN-17: The MAC and platform refusals run after a full clone, and the MAC one after `build_started`, although both values are known when `devicelib.get` returns

**File:** `lib/thinx/builder.js:996-998`, `lib/thinx/builder.js:1222-1229` (the device is fetched at `:869`)
**Issue:**
- **Cost.** `device.platform` and `device.mac` are fields of the device record, available before `getLastAPIKey`. Both checks still come after the clone and the build path. The MAC check comes after the decrypted `thinx.yml`/`environment.json` writes and after the client was told `build_started`.
- **What the client sees.** The build cannot succeed, yet the client gets `build_started` and an asynchronous failure. The worker is held for the whole clone, and the MAC path needs its own `releaseWorker`/`failRemoteBuild` branch.
**Fix:** Right after the `BUILD_PATH` identity checks inside `devicelib.get`:
```js
if ((typeof device.platform !== "string") || (device.platform.length === 0)) { blog.state(build_id, owner, udid, "error"); return callback(false, "device_platform_unknown"); }
if (this.formatMacForDevSec(device.mac) === null) { blog.state(build_id, owner, udid, "error"); return callback(false, "device_mac_missing"); }
```
The router or `runNext` then releases the reservation, and there is nothing on disk to clean up.

### IN-18: After IN-15, the branch defaults in `run_build` are dead, and legacy sources without a branch are dropped silently on the queue path

**File:** `lib/thinx/builder.js:914`, `lib/thinx/builder.js:916`, `lib/thinx/builder.js:1464`, `lib/thinx/builder.js:1480`, `lib/thinx/queue.js:278`
**Issue:**
- **Dead defaults.**
  - `buildGuards` now ends `run_build` for an undefined or null branch, so `if (!Util.isDefined(branch)) branch = "origin/main"` (`:914`) can no longer run.
  - `if (branch === null) sanitized_branch = "main"` (`:916`) is dead as well.
  - The `"origin/master"` default in `build()` (`:1464`) survives only when no source matches. `git` is null in that case, so the build is refused anyway.
- **Silent drop.** A source saved before `dd14dd11` (2022-02-21) with no `branch` is now refused as `branch undefined`. On the queue path, which webhooks use through `repository.js:179`, that refusal is silent: `runNext` passes `[]` notifiers and deletes the action.
**Fix:**
- Decide on the legacy behaviour and make it explicit. Either default in `build()` (`branch = source.branch || "main"`, the same default `Sources.normalizedBranch` applies) or run a one-off migration.
- Remove the unreachable defaults in `run_build`.

### IN-19: `actionWorkerValid`'s `setError` branch is unreachable, and the release logic is duplicated with different semantics

**File:** `lib/thinx/queue.js:219-229`, `lib/thinx/queue.js:245-253`, `lib/thinx/queue.js:354-368`, `lib/thinx/builder.js:425-431`
**Issue:**
- **Unreachable branch.** `runNext` rejects a non-worker before `actionWorkerValid`, so that function's "empty worker → `action.setError()`" branch can no longer run from its only caller. A future caller would silently get the old WR-02 behaviour back.
- **Two release implementations.** `Queue.releaseReservation` (not build-aware) and `Builder.releaseWorker(worker, build_id)` (build-aware) express the same ownership rule twice, and they already differ.
**Fix:**
- Drop the worker half of `actionWorkerValid`.
- Route `Builder.releaseWorker` through a single `Queue` helper. With WR-01's token, that helper takes the token.

### IN-20: The 60-minute post-dispatch bound assumes a worker-side limit that the direct `docker run` build paths do not have

**File:** `lib/thinx/queue.js:338-344`; `services/worker/builder:104-167` versus `services/worker/builder:704`, `:845`, `:910`, `:1004`, `:1125`, `:1272`
**Issue:**
- **The assumption.** The comment ties `BUILD_RESERVATION_MS` to `MAX_ITERATIONS` 60 × 30 s. That bound applies only to the swarm-service wrapper.
- **The paths it misses.** The per-platform `docker pull` + `docker run` paths have no timeout.
- **What the reclaim does.** A build that runs past 60 minutes loses its API flag, and the next build is emitted to a busy worker:
  - `4902380`/`d6ca153` refuse that job loudly with `worker_busy`.
  - The currently deployed `a2e4bfa` drops it **silently**.
- This is not the deferred polling-loop bug. It is about the API's assumption.
**Fix:**
- Deploy worker `d6ca153` together with this API, not the API alone.
- Correct the comment so it no longer implies the builder guarantees an end within 60 minutes.

### IN-21: Worker `d6ca153`: code is commented out instead of deleted, and the relocated `Entering SINK` echo can never print

**File:** `services/worker/builder:372-395`
**Issue:**
- **Commented-out code.** Eight lines are commented out rather than removed.
- **The dead echo.** The `Entering SINK ${SINK}` echo moved inside `if [[ -d "$SINK" ]]`. `SINK=$BUILD_PATH/*` is an assignment, and assignments do no pathname expansion. The `*` stays literal, and `[[ -d "…/*" ]]` is false unless a directory is literally named `*` (verified with bash). The branch has always been dead; the change only makes the log line dead too.
- **What the log still records.** The `REPO_NAME … does not exist, entering * instead...` line.
**Fix:**
- Delete the commented lines.
- Optionally, if the fallback should work, resolve the glob into an array: `dirs=("$BUILD_PATH"/*/); [[ -d "${dirs[0]}" ]] && SINK="${dirs[0]%/}"`.

### IN-22: `run_build`'s async body is still unguarded, the other half of the iteration-4 WR-01 fix (residual; bounded now)

**File:** `lib/thinx/builder.js:893-1283`
**Issue:**
- **What is unguarded.** A throw inside the `async` `getLastAPIKey` callback, or inside the `Platform.getPlatform`/`apienv.list` callbacks, still has no handler. Examples:
  - `mkdirp.sync` in `createBuildPath`
  - `fs.readdirSync`
  - `runGitCommand`'s `execFileSync` (`:1126-1127`)
- **What happens then.** Rollbar swallows the throw. The HTTP request hangs, and any secret written before the throw stays in `XBUILD_PATH`.
- **What changed.** The worker cost is now bounded to the 2-minute lease, and the fix report lists this as a residual.
**Fix:** Wrap the callback bodies:
- a `try/catch` that calls `callback(false, "build_exception")` before `build_started`;
- after `build_started`, `releaseWorker(br.worker, build_id)` + `failRemoteBuild(...)`.

## Deferred / not re-raised (as instructed)

- WR-03: the worker's reconnect after a build
- IN-16: a `worker_busy` refusal fails the build instead of queueing it again (this now also covers the API-side emit refusal)
- the builder polling loop
- the 0o766/0o777 modes
- the empty `<build_id>/<build_id>` directory
- the legacy `cmd` path
- handshake auth

---

_Reviewed: 2026-09-28T20:40:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
