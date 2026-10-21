---
phase: 23-build-pipeline-sink-hardening
reviewed: 2026-09-28T19:44:26Z
depth: standard
iteration: 3
files_reviewed: 19
files_reviewed_list:
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
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SafePathSpec.js
  - spec/jasmine/SanitkaSpec.js
  - spec/jasmine/XBuilderSpec.js
findings:
  critical: 0
  warning: 1
  info: 14
  total: 15
status: issues_found
---

# Phase 23: Code Review Report (iteration 3, final)

**Reviewed:** 2026-09-28T19:44:26Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This pass re-reviews the fixes for the three iteration-2 warnings:
- parent commits `6b1f5ead`, `a65005f3`, `01783ca8`, `3aa947c0` (`git diff f0387ebb..HEAD -- lib spec`)
- worker commit `a2e4bfa` (`git -C services/worker diff 2f08258..HEAD`)

It also checks the new code for regressions. `devices.js`, `sources.js`, `platform.js`, `plugins/pine64/plugin.js`, `safepath.js`, `sanitka.js` and `package.json` have not changed since iteration 2. I rechecked them only as callers of the changed code and for the carried-forward items.

**Gates re-run:**
- Hermetic API specs (BuilderPath, BuilderRemoteJob, Git, SafePath, Sanitka, Finder): **200 specs, 0 failures**. This matches the baseline.
- Worker: **46/46**.

### Status of the iteration-2 findings

| ID | Status | Notes |
|---|---|---|
| WR-01 | **Fixed** | `failJob` (`services/worker/class.js:64-74`) now builds a new object with `build_id`, `udid`, `owner`, `status: "Failed"` and `details` only. A non-object job no longer throws. `notifier.process` logs `loggableStatus(job_status)` (`notifier.js:107-121`), which keeps only scalar values of six identifying keys, so an older worker's full echo cannot leak through that line either. **The API side still correlates the build and records the failure.** `builder.runRemoteShell`'s `job-status` listener (`builder.js:319-326`) passes the payload to `processExitData`. That function takes `owner`, `build_id` and `udid` from the closure, not from the payload, and reads only `data.status`, which is still `"Failed"`. So `blog.state(build_id, owner, udid, "Failed")`, `notify` and `wsOK` behave exactly as before. The queue's handler (`queue.js:391-398`) still clears `running`, and `notifier.process` still returns early because there is no `outfile`, as it did with the old full copy. |
| WR-02 | **Fixed** | `withCheckoutLock` (`git.js:149-164`) is correct as written. (1) **Release on throw:** `previous.then(() => task())` turns a synchronous throw into a rejection, and `tail` absorbs both outcomes, so a failed task never blocks the next one. (2) **No deadlock through the non-reentrant path:** `fetch` takes the lock once and calls `cloneHoldingLock` directly (`git.js:519-549`). None of the lock holders (`orderKeys`, `create_askfile`, `runGit`, `chmodCheckoutSync`) re-enter `cloneRepository` or `fetch`. `Sources.add` calls `fetch` from inside the continuation of its own `cloneRepository`. That continuation runs after `result` settles, and `tail` depends only on `result`, never on the caller, so the second acquisition cannot wait on itself. (3) **Map cleanup:** the `get(key) === tail` check removes only the newest tail. (4) Callers that go through the lock: `Sources.add`, `builder.prefetchPublic`/`prefetchPrivate`, `devices.prefetch_repository`. Residuals are in IN-14. |
| WR-03 | **Fixed as specified, but it exposes a selection bug** | `runRemoteShell` now calls `worker.socket.emit('job', job)` (`builder.js:305`), and the worker guard also refuses a null socket and a socket without `emit`/`on` (`builder.js:251-264`). No broadcast path remains. The `poll` handler (`queue.js:375-389`) now passes the registered worker object and re-checks it after the `await`, which fixes the old `Cannot create property 'running' on string` throw. **But** targeted delivery depends on `worker.running` being accurate, and it is not. The main API build route never sets it, and the queue clears it at `build_started`. With two or more workers, every build now goes to the first registered worker, and that worker drops jobs it gets while it is busy. The broadcast used to hide this. Raised as **WR-01** below (reproduced). Handshake authentication was deliberately skipped, see IN-11. |

### New findings

- **WR-01:** targeted delivery sends every build to the first registered worker, because `worker.running` is never set on the API build route and is cleared at `build_started` on the queue route. A busy worker drops the job silently.
- **IN-11 to IN-14:** handshake auth (recorded, deliberately skipped), `job-status`/`log` listeners piling up on a reused worker socket, the newly live `poll` path, and limits of the checkout lock.

### Not re-raised (triaged)

- the worker `builder` polling loop
- the 0o766/0o777 modes
- the empty `<build_id>/<build_id>` directory
- the legacy `cmd` shell path

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The job now goes only to `nextAvailableWorker()`'s pick, but that pick does not track busy workers. With two or more workers, every build goes to the first registered worker, which silently drops any job that arrives while it is building (regression exposed by the iteration-2 WR-03 fix)

**File:** `lib/thinx/builder.js:305`. Selection: `lib/router.build.js:62-81`, `lib/thinx/queue.js:258-273`, `lib/thinx/queue.js:296-307`. Worker drop: `services/worker/class.js:466-470`

**Issue:**
`nextAvailableWorker()` returns the first registered worker whose `running === false`. Neither build path keeps that flag true while the build runs:

1. **API build route** (`router.build.js:62-81`, the main path for user-triggered builds). It calls `app.queue.nextAvailableWorker()` and hands the result straight to `app.builder.build(...)`. It **never sets `worker.running = true`**. Every concurrent API build therefore gets the same first worker.
2. **Queue route** (`queue.js:258-273`). `runNext` sets `worker.running = true`, but its build callback sets it back to `false`. `run_build` calls that callback with `build_started` (`builder.js:1051-1054`) *before* it even calls `runRemoteShell` (`builder.js:1119`). The same callback also runs `action.delete()`, so `findNext` stops counting the build against `maxRunningBuilds`, and the next cron tick dispatches again, to the same first worker.

The worker's `job` handler drops any job that arrives while it is busy: `if (this.running == true) { console.log(... passing job ...); return; }` (`class.js:467-470`). It emits no `job-status`.

Before the fix, `this.io.emit` sent the job to every worker, so an idle second worker ran it. That also caused the duplicates WR-03 described. Now the job reaches only the busy worker and is lost. For that build:
- the client already has `build_started` and the build log never reaches a terminal state
- no BUILD_FAILED is recorded
- the decrypted credentials written into `XBUILD_PATH` are never removed. The API calls `cleanupSecrets` only on refusal or for local builds (`builder.js:1119-1126`, `:427`, `:444`).

The same silent loss happens when the chosen worker disconnects between selection and dispatch. Build preparation, including the clone, can take minutes, and the worker disconnects its socket after every build (`class.js:420-423`). A server-side `emit` on a disconnected socket is a no-op, and `runRemoteShell` still returns `true`.

Reproduced with the real `Queue` socket handlers and two registered socket.io clients (scratch script):
```
router path: same worker twice: true  first is client A: true
after runNext build_started: w1.running = false  next pick is A again: true
```
With a single worker, behaviour is unchanged: the busy worker dropped the broadcast job before as well. The swarm stack's worker replica count is not in this repository. The new comment at `builder.js:300-304` ("while the queue had marked only this one as running") and the fix report's "selected and marked as running" are both wrong for the router path.

**Fix:** Make the busy flag real before relying on targeted delivery, and refuse a dead socket.
```js
// router.build.js, before app.builder.build(...)
next_worker.running = true;
const callback = function (success, response) {
    if (success !== true) next_worker.running = false; // refused before dispatch
    Util.responder(res, success, response);
};

// queue.js runNext: do not clear running on build_started. Clear it only on
// failure; job-status (queue.js:395-397) and disconnect already clear it.
(success, message) => {
    action.delete();
    if ((success !== true) && worker) worker.running = false;
}

// builder.js runRemoteShell guard: a disconnected socket is a refusal, so
// run_build's D-10 contract (BUILD_FAILED, blog error, cleanupSecrets) runs.
if (worker.socket.connected !== true) { /* notify + return false */ }
```
In `runRemoteShell`, also clear `worker.running` on every `return false`. On the worker, the busy branch should report the job instead of dropping it. Emit `{ build_id, udid, owner, status: "Failed", details: "Worker busy" }` **without** calling `failJob`, because `failJob` sets `this.running = false` and would release the build that is still running. Add a spec: register two clients, call `runRemoteShell` through the router-style selection twice, and expect the second job to go to the second client.

## Info

### IN-01: Known-hosts fallback writes TOFU keys into the "pinned" seeded file; comments say otherwise (carried forward, still open)

**File:** `lib/thinx/git.js:184-188`, `lib/thinx/git.js:260-270`
**Issue:** Unchanged. In fallback, `learned: seeded` sets `UserKnownHostsFile` to the seeded file, so `accept-new` writes new host keys into it. The comments still say the seeded file "is never written by ssh" and that new keys "are simply not persisted".
**Fix:** Correct the comments. Alternatively, in fallback use `UserKnownHostsFile=/dev/null` with `StrictHostKeyChecking=yes`.

### IN-02: `Sanitka.udid` is not a UUID validator, contrary to the D-12 wording (carried forward, still open)

**File:** `lib/thinx/sanitka.js:97-108`, used by `lib/thinx/builder.js:201-209`
**Issue:** Unchanged. `"-".repeat(36)`, mixed case and any hex/dash mix still pass, so case variants of one UUID map to different directories.
**Fix:** Add a `strictUuid` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`) and use it in `buildPathFor`.

### IN-03: Owners without keys get a second identical keyless clone, which can flip `is_private` (carried forward, still open)

**File:** `lib/thinx/git.js:525-529`. Callers: `lib/thinx/sources.js:291-296`, `lib/thinx/builder.js:789-792`, `lib/thinx/devices.js:81-88`
**Issue:** Unchanged. A transient public failure followed by a successful keyless retry stores `is_private=true`. `devices.prefetch_repository` sets `is_private=true` after any successful `fetch`, including a keyless one.
**Fix:** Return `{ ok, keyed }` from `fetch`, and set `is_private` only when a key was actually used.

### IN-04: `Sources.add` continuation swallows exceptions and leaves checkout residue on failure (carried forward, still open)

**File:** `lib/thinx/sources.js:291-299`
**Issue:** Unchanged. The `.catch` only logs, so an exception in `inferAndAddSource` leaves the HTTP request without a response. On `Git fetch failed.`, `TEMP_PATH` still holds a partial or complete clone.
**Fix:** In the `.catch`, call `callback(false, "Git fetch failed.")`, guarded against a double call. Run `fs.removeSync(TEMP_PATH)` on both failure branches.

### IN-05: Source-add and device-attach fetches never use the D-09 last-good-key memory (carried forward, still open)

**File:** `lib/thinx/sources.js:17`, `lib/thinx/devices.js:15`
**Issue:** Unchanged. Both construct `new Git()` without redis.
**Fix:** Inject the redis client (`Devices` already holds `this.redis`), or document the limitation.

### IN-06: `run_build` ignores `prefetchPublic`'s result and re-derives it from `basename.json` (carried forward, still open)

**File:** `lib/thinx/builder.js:789`, `lib/thinx/builder.js:529`
**Issue:** Unchanged. This is correct only because `cloneHoldingLock` writes `basename.json` last.
**Fix:** `const publicOk = !br.is_private && await this.prefetchPublic(...)`, then skip `prefetchPrivate` when `publicOk`.

### IN-07: `devices.attach` starts an async, link-following `chmodr` on the device path while the prefetch empties and re-clones it (carried forward, still open)

**File:** `lib/thinx/devices.js:384-386`, then `lib/thinx/devices.js:398` -> `lib/thinx/git.js:344`
**Issue:** Unchanged. The new checkout lock does not cover this `chmodr`: it runs outside `withCheckoutLock` and still competes with `emptyDirSync` and the clone. `emptyDirSync` on `deployPathForDevice` also still deletes the device's deployed build envelopes on every attach.
**Fix:** Drop the `chmodr` (`cloneHoldingLock` already sets the modes), or use `chmodr.sync` before the prefetch. Consider prefetching into a subdirectory.

### IN-08: `runGit`'s process-group kill and output cap are untested (carried forward, still open)

**File:** `lib/thinx/git.js:47-53`, `lib/thinx/git.js:86-89`. Spec: `spec/jasmine/GitSpec.js` `(e2)`
**Issue:** Unchanged. A regression that dropped `detached: true`, or broke the `ENOBUFS` path, would pass every spec. This matters more now: a `runGit` that never settles also holds the checkout lock (IN-14).
**Fix:** Assert `process.kill(-pid, 0)` throws `ESRCH` after `(e2)`. Add a stubbed-`spawn` test for `ENOBUFS`.

### IN-09: `chmodCheckoutSync` is a synchronous full-tree walk on the API event loop (carried forward, still open)

**File:** `lib/thinx/git.js:121-134`, called at `lib/thinx/git.js:375`
**Issue:** Unchanged. On a large repository, the `lstat`+`chmod` per entry (including `.git/objects`) stalls the API.
**Fix:** Make the walk async (`fs.promises`) and `await` it, keeping the no-symlink rule, or skip `.git`.

### IN-10: `build()` device matching falls through to an unmatched udid; unused masked `copy` (carried forward, still open)

**File:** `lib/thinx/builder.js:1249-1266`. Dead code: `lib/thinx/builder.js:295-298`
**Issue:** Unchanged. `udid.indexOf(db_udid)` matching, and a loop that leaves `device` set to the last row, still write `build_id` into the wrong device document when nothing matches. The `run_build` upfront check (`builder.js:750`) still blocks the cross-owner build. The fix report deliberately left `copy` alone. With the `io.emit` branch gone it is now plainly dead: it is computed and never read.
**Fix:** Track an explicit `matched` device with exact equality, and return `device_not_found` otherwise. Delete `copy`.

### IN-11: Queue socket.io server still has no handshake authentication (recorded; deliberately not enforced)

**File:** `lib/thinx/queue.js:94-102`, `lib/thinx/queue.js:362-373`
**Issue:** Any client that can reach port 4000 can `register` as a worker and send `job-status`. Since WR-03, a client that is merely connected no longer receives jobs. A **registered** one still can, through `nextAvailableWorker` and, now that `poll` works, on demand through `poll` (IN-13). Each job it receives carries `WORKER_SECRET` and the `--env` payload. The user confirmed port 4000 is reachable only inside the swarm, and enforcing auth now would break the either-order API/worker deploy (D-01).
**Fix:** Plan it as a staged change: the worker sends `auth: { token }`, the API accepts with a warning (like the D-03 `cmd`-only pattern), and a later release enforces it.

### IN-12: `runRemoteShell` adds `log` and `job-status` listeners to the worker socket for every job and never removes them (pre-existing)

**File:** `lib/thinx/builder.js:315-326`
**Issue:** Each listener captures its own `build_id`/`owner`/`udid`/`notifiers`. The worker disconnects only when a build process exits, not when `failJob` refuses a job (`class.js:64-74`). If job 1 is refused and job 2 then runs on the same socket, job 2's log lines also reach job 1's `processShellData`. A `status: OK` line then marks **build 1** as `Success` and updates `last_build` (`builder.js:393-402`). Job 2's `job-status` also runs `processExitData` for build 1. Since WR-03, every build goes to one socket (WR-01 above), so listeners pile up on that socket in particular.
**Fix:** Filter by id (`if (data.build_id !== build_id) return;` in both handlers; the worker's `failJob`, exit and JOB-RESULT payloads all carry `build_id`). Remove both listeners when the terminal `job-status` arrives.

### IN-13: The `poll` path is now live: concurrent `findNext` can dispatch one action twice, and a `findNext` rejection is unhandled

**File:** `lib/thinx/queue.js:375-389`, `lib/thinx/queue.js:174-211`, `lib/thinx/queue.js:277-286`
**Issue:** Before this fix, `poll` threw inside `runNext`, so it never built anything. Now it can.
- **Double dispatch.** `findNext` returns the first `waiting` action, and `setStarted` flips it only later, inside `runNext`. Two workers polling at once, or a poll overlapping the cron `loop()`, both get the same action and each call `runNext`. The result is two builds for one device on two workers. The post-`await` re-check guards the worker only, not the action.
- **Unhandled rejection.** The handler is `async` with no `try`. If `redis.keys`/`get` rejects, the result is an unhandled rejection, and the API has no `unhandledRejection` handler.

This is dormant today because `services/worker` never calls `loop()`, but any registered client can send `poll` (IN-11). Separately, `loop()` checks `workerAvailable !== null`, but `nextAvailableWorker` returns `false`, so with no worker `runNext(next, false)` marks the action as an error instead of leaving it queued.
**Fix:** Wrap the handler body in `try/catch`. Claim the action atomically before dispatch, for example by re-reading its key and checking it is still `waiting` before `setStarted`, or with `SET queue:<udid> ... XX` via `WATCH`/`MULTI`. In `loop()`, compare against `false`.

### IN-14: Checkout lock limits: wedged when `runGit` never settles, unbounded wait, and reads after release

**File:** `lib/thinx/git.js:149-164`, `lib/thinx/git.js:94-109`; `lib/thinx/devices.js:81-95`
**Issue:**
- **The lock holds as long as `runGit` does.** `runGit` settles only on `close`, and its timeout fires once. If a descendant escapes the process group and keeps the pipes open, `close` never fires. The lock for that device path is then held until the process restarts, and every later attach of that device queues behind it without a log line. Before WR-02, only that one prefetch would hang.
- **No bound on waiters.** A burst of attaches for one device waits in line, each for up to `keys × 2 × gitTimeoutMs`.
- **Reads after release.** As the fix report notes, `prefetch_repository`'s `updatePlatform(repo_path)` runs after the lock is released, so the next queued clone's `emptyDirSync` can empty the tree under it. `getPlatform` failing is harmless, because the stored platform is kept (`devices.js:109-114`). A partial tree can still be inferred as the wrong platform. If the later clone then fails, nobody corrects it.

**Fix:** In `runGit`, after `abort` send SIGKILL and settle after a short grace period whether or not `close` has fired. For the reads, run `updatePlatform` inside the lock by adding an optional `afterClone(repoPath)` hook to `fetch`, or clone into a `mkdtemp` sibling and `rename` it into place.

---

_Reviewed: 2026-09-28T19:44:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
