---
phase: 23-build-pipeline-sink-hardening
reviewed: 2026-09-28T20:14:23Z
depth: standard
iteration: 4
files_reviewed: 20
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
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SafePathSpec.js
  - spec/jasmine/SanitkaSpec.js
  - spec/jasmine/XBuilderSpec.js
findings:
  critical: 0
  warning: 3
  info: 16
  total: 19
status: issues_found
---

# Phase 23: Code Review Report (iteration 4, approved beyond the cap)

**Reviewed:** 2026-09-28T20:14:23Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

This pass re-reviews the fix for iteration-3 WR-01:
- parent commits `88c20095` and `07cc256e` (`git diff c5815388..HEAD -- lib spec`)
- worker commit `4902380` (`git -C services/worker diff a2e4bfa..HEAD`)

It also checks the new code for regressions. `devices.js`, `git.js`, `notifier.js`, `platform.js`, `plugins/pine64/plugin.js`, `safepath.js`, `sanitka.js`, `sources.js`, `package.json`, `GitSpec.js` and `XBuilderSpec.js` have not changed since iteration 3. I rechecked them only as callers of the changed code and for the carried-forward items.

**Gates re-run:**
- Hermetic API specs (BuilderPath, BuilderRemoteJob, Git, SafePath, Sanitka, Finder): **215 specs, 0 failures**, matching the baseline.
- Worker: **49/49**.

### Status of iteration-3 WR-01: fixed

The selection bug is gone.
- The router sets `next_worker.running = true` before `build()` (`router.build.js:77`).
- `runNext` no longer clears the flag at `build_started` (`queue.js:274`).
- The emit sets it again (`builder.js:321`).
- The `job-status` handler clears it only when `Queue.releasesWorker` allows (`queue.js:416-419`).

The spec "with two registered workers, a second build goes to the idle worker" drives the real router and the real Queue handlers over socket.io, and it passes. A disconnected socket is now a refusal (`builder.js:264`). The worker reports `worker_busy` instead of dropping the job (`class.js:493-496`).

### The questions from the brief

**Can a worker be released while it is still building?** Not in practice.
- `releasesWorker` returns true only for a failJob refusal, a failed exit or a spawn error, and the worker sends each of those only when it is idle or about to disconnect.
- The only mid-build `job-status` a worker used to send came from the stderr `fatal:` branch. That branch is gone in both `a2e4bfa` and `4902380` (`class.js:388-409`).
- The one contrived path runs through `buildGuards`'s non-terminal `callback(false)`; see IN-15.

**Can a worker get stuck busy forever?** Yes. This is the main new risk; see WR-01. The fix report says these paths "throw an uncaught exception, which restarts the process". That is false in production. The API installs Rollbar with `handleUncaughtExceptions` and `handleUnhandledRejections` but without `exitOnUncaughtException` (`globals.js:153-159`), and compose/swarm always pass `ROLLBAR_ACCESS_TOKEN`. Rollbar 2.26.5 then logs the error and the process keeps running. I reproduced a permanent wedge with a scratch script that uses the real router.

**`dispatchRemoteBuild` / `failRemoteBuild` once-only and `onRefused`:** correct.
- `refuse` is idempotent (`builder.js:422-427`).
- `runRemoteShell` either returns false before it attaches any listener, or returns true and can then call `onRefused` at most once, because `detach()` runs first (`builder.js:356-361`).
- A `worker_busy` refusal cleans only the refused build's `XBUILD_PATH`, because the path is per build_id. The end-to-end spec asserts this.

**`job-status` scoping and listener removal:**
- **Correct for every payload the worker sends.** Every one carries a string `build_id`:
  - `reportRefusal` (`class.js:73-79`);
  - spawn error (`class.js:416-421`);
  - exit (`class.js:431-436`);
  - JOB-RESULT. The `jo` payload includes `build_id` (`services/worker/builder:1414-1428`), and so does the parse-failure fallback (`class.js:326-331`).
- **Listener removal.** `detach` uses `socket.off`, which exists on the socket.io 4 server `Socket` (an EventEmitter). The listeners are removed on a refusal or a non-result status and kept on JOB-RESULT.
- **Remaining gap.** `log` payloads still carry no `build_id` (IN-12 residual).

**The worker's `worker_busy` refusal:** correct.
- The empty-payload check runs first.
- `refuseBusyJob` does not touch `this.running`.
- The payload is the five identifying keys only.

**The deliberate choice: JOB-RESULT does not release.** Sound. The worker keeps its own `this.running` until `exit` (`class.js:428`), and `exit` always disconnects (`class.js:439-442`), so the API flag mirrors the worker's flag exactly. Releasing at JOB-RESULT would reopen the gap during `notifier.js` and `cat $LOG_PATH`. **But the choice couples release to the post-build disconnect, which is itself a bug (WR-03).** Whoever fixes WR-03 by dropping `socket.disconnect()` must add an idle signal on a clean exit. Otherwise a successful build never releases its worker.

**D-01, either deploy order:**
- **New API with the deployed worker `a2e4bfa`: compatible.**
  - `a2e4bfa`'s payloads carry `build_id`, so the new scoping attributes them.
  - It still drops a busy job silently. With the flag now accurate, a job can reach a busy worker only in the few milliseconds between a failed-exit `job-status` and the disconnect packet that follows it. A build selected in that gap is refused at dispatch by the `connected` check, not lost (IN-16).
- **New worker with the current API (`c5815388`): works, with the caveat the fix report already gives.**
  - The unscoped listeners mean `worker_busy` for B also runs `processExitData(A, "Failed")`. The build log recovers when the `status: OK` line streams (`builder:1381`, and again from `cat $LOG_PATH`).
  - One effect the report leaves out: `notify(..., "Failed")` also goes to the owner's **messenger**, and a sent Slack/e-mail notification cannot be taken back.
  - The old API also never cleans B's secrets on that refusal.
  - Deploying the API first, as the report advises, avoids all of this.

### New findings
- **WR-01:** the busy flag wedges permanently when a build fails between selection and dispatch without calling back (reproduced).
- **WR-02:** the builds the router now sends to the queue because the worker is busy are then discarded by `loop()`.
- **WR-03 (pre-existing):** the worker never reconnects after a build. The release model now depends on that disconnect, and with one replica the API has no worker after the first build (verified).
- **IN-15:** `buildGuards` calls back `false` without returning, which breaks the "a false callback is terminal" rule that both release sites now rely on.
- **IN-16:** a `worker_busy` refusal, or a worker that disconnects before dispatch, fails the user's build instead of queueing it again.

### Not re-raised (triaged)
- the builder polling loop
- the 0o766/0o777 modes
- the empty `<build_id>/<build_id>` directory
- the legacy `cmd` path
- handshake auth (IN-11 stays info only)

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A build that dies between selection and dispatch leaves its worker marked busy forever. With one replica, every later build is queued and then discarded until the API or worker restarts (regression from the WR-01 fix)

**File:** `lib/router.build.js:77-81`, `lib/thinx/queue.js:258`, `lib/thinx/queue.js:274`. Trigger sites: `lib/thinx/builder.js:1319-1337`, `:1424`, `:962-964`, `:1184`, `:861`. Premise: `lib/thinx/globals.js:153-159`

**Issue:**
The router now sets `running = true` at selection and clears it only if `build()` calls back with `success !== true`. After dispatch, a `job-status` or the disconnect releases it. Neither happens when the build never calls back, or throws after `build_started` and before `runRemoteShell`. The worker is then idle and connected, it never disconnects, because it disconnects only after running a build, and it never re-registers. `nextAvailableWorker()` returns `false` from then on, so every build goes to `queue.add`, and WR-02 then discards it.

The fix report accepts this residual on the grounds that uncaught exceptions restart the process. They do not.
- `globals.js:153-159` creates Rollbar with `handleUncaughtExceptions: true, handleUnhandledRejections: true` and no `exitOnUncaughtException`.
- `node_modules/rollbar/src/server/rollbar.js:645-674` then logs the error and does not exit.
- `docker-compose.yml`/`docker-swarm.yml` always set `ROLLBAR_ACCESS_TOKEN`. Even an empty `${ROLLBAR_ACCESS_TOKEN}` passes the `!== undefined && !== null` check.

Reachable triggers in the current code:
- `build()`: a `devicelib.view` error other than `missing` falls through with no callback (`builder.js:1319-1337`), for example a CouchDB timeout or a restart. The "No DB shards" branch calls `that.list(...)`, but `Builder` has no `list` method, so it throws a `TypeError` inside `setTimeout`.
- `Object.keys(doc.repos)` throws for an owner document without `repos` (`builder.js:1424`).
- `platform.split(":")` throws when `device.platform` is undefined (`builder.js:962-964`).
- `formatMacForDevSec(device.mac)` throws on an undefined `mac` (`builder.js:564-566`, called at `:1184`). This happens **after** `build_started`, so the client is also told that the build started, and the decrypted secrets stay in `XBUILD_PATH`.
- Any throw inside the `async` `getLastAPIKey` callback (`builder.js:861`), such as `mkdirp.sync` or `readdirSync`, becomes an unhandled rejection. Rollbar swallows that too.

Before this fix the router path never set the flag, so these faults hung only one HTTP request. Now one fault disables remote builds.

Reproduced with the real `router.build.js`, a registry shaped like `Queue.workers`, and a builder stub that throws after `build_started`, the way `formatMacForDevSec(undefined)` would, under a Rollbar-style `uncaughtException` handler:
```
swallowed like Rollbar: Cannot read properties of undefined (reading 'replace')
worker idle on its side, API flag running = true
No swarm workers found.
queued (would be setError'd by loop())
```

**Severity:** kept at WARNING and not BLOCKER only because WR-03 already removes the single production worker after each build, and a worker restart clears this wedge: the disconnect deletes the registry entry. Once WR-03 is fixed, this becomes the dominant availability hazard and should be treated as a blocker.

**Fix:** Give the pre-dispatch reservation a lease, so that a lost build cannot hold the worker:
```js
// router.build.js and queue.runNext, at selection
next_worker.running = true;
next_worker.reserved_at = Date.now();
next_worker.dispatched = null;

// builder.runRemoteShell, at the emit
worker.running = true;
worker.dispatched = build_id;

// queue.nextAvailableWorker
const PREP_LEASE_MS = 15 * 60 * 1000; // longer than the slowest clone + prep
for (const id in this.workers) {
    const w = this.workers[id];
    if (w.connected !== true) continue;
    if ((w.running === true) && (w.dispatched == null) &&
        (typeof w.reserved_at === "number") && (Date.now() - w.reserved_at > PREP_LEASE_MS)) {
        console.log("[queue] reclaiming worker whose build never dispatched", id);
        w.running = false;
    }
    if (w.running === false) return w;
}
```
Also close the trigger sites: call `callback(false, ...)` on every `devicelib.view` error, remove the `that.list` call, and guard `device.platform`/`device.mac`. Put `run_build`'s async body in a `try/catch` that calls `callback(false, "build_exception")` before `build_started`. After `build_started`, it should call `releaseWorker` + `failRemoteBuild` instead.

### WR-02: The builds the router now queues because the worker is busy are marked `error` by `loop()` and never run

**File:** `lib/thinx/queue.js:298-307`, `lib/thinx/queue.js:213-231`, `lib/thinx/queue_action.js:52-56`, `lib/router.build.js:62-68`

**Issue:**
Before this fix the router's `nextAvailableWorker()` never returned `false` while a worker was registered, because the flag was never set. The queue fallback at `router.build.js:63-68` ran only when there was no worker at all. Now **every build requested while the single worker is busy** takes that path. The client gets `{ success: true, response: "queued" }`.

At the next cron tick (`*/5 * * * *`), `loop()` does the following:
1. `findNext()` returns the waiting action.
2. `nextAvailableWorker()` returns `false`, because the worker is still busy or, after WR-03, gone.
3. `workerAvailable !== null` is true, so `runNext(next, false)` runs.
4. `actionWorkerValid` calls `action.setError()`. This replaces the stored action with `{ udid, status: "error", build_id: <new uuid> }`, and the source and owner are lost.
5. The next tick prunes it.

Nothing notifies the owner, and nothing writes a build-log entry. The fix meant to end silent build loss, and this path still loses builds silently; only the reply changed from "build_started" to "queued". This was a dormant sub-item of IN-13 in iteration 3. The WR-01 fix makes it the normal overflow path.

**Fix:**
```js
async loop() {
    const next = await this.findNext();
    if (!next) return;
    const worker = this.nextAvailableWorker();
    if (worker === false) return; // leave it waiting for a later tick
    this.runNext(next, worker);
}
```
Optionally trigger `loop()` when a worker registers (the `workerReady` event), so a queued build does not wait up to 5 minutes. Give a `waiting` action a TTL, so it cannot wait forever when no worker ever comes back.

### WR-03: The worker disconnects after every build and never reconnects, so with one replica the API has no worker after the first build. The WR-01 release model now depends on this disconnect (pre-existing, verified)

**File:** `services/worker/class.js:439-442`, `services/worker/class.js:453-472`, `services/worker/worker.js:48-57`

**Issue:**
`attachBuildHandlers`' `exit` handler calls `socket.disconnect(true)`. In socket.io-client 4.8.3 a client-side `disconnect()` destroys the manager (`skipReconnect = true`), and nothing in `class.js` or `worker.js` calls `connect()` again. The `connect_error` retry covers only failed handshakes.

I verified this with the worker's own `node_modules`: after the client disconnects, the connection count stays at 1 and `client.connected` is still `false` 8 s later. The worker process keeps running while disconnected. The Dockerfile has no `HEALTHCHECK`, and the swarm service has no restart trigger other than a crash or a new image. With the single `thinx_worker` replica:
1. Build 1 runs.
2. The API deletes the entry on disconnect.
3. Every later build is "queued" and then discarded (WR-02) until the worker container restarts.

The fix report lists this as a residual risk. It matters more now: the "JOB-RESULT does not release" choice is correct *only because* of this disconnect. A clean exit sends no `job-status` (`class.js:430-437` emits only on `code > 0`). If someone fixes the reconnect by deleting the `disconnect`, every successful build leaves the API flag set forever.

**Fix:** Keep the release-on-disconnect semantics and reconnect, which creates a new session, a new `register` and a new registry entry with `running: false`:
```js
shell.on("exit", (code) => {
    this.running = false;
    if (code > 0) socket.emit('job-status', { udid, build_id, state: "Failed", reason: dstring });
    if (typeof socket.disconnect === "function") {
        socket.disconnect();
        setTimeout(() => socket.connect(), 1000); // re-register as idle
    }
    ...
});
```
The alternative is to stop disconnecting and always emit a terminal `job-status` on exit (for example `{ build_id, udid, owner, state: code === 0 ? "Exited" : "Failed", code }`), which `Queue.releasesWorker` treats as releasing. Either way, add a worker test that runs a mock build to `exit` and asserts that the worker is registered again and receives a second job.

## Info

### IN-01: Known-hosts fallback writes TOFU keys into the "pinned" seeded file; comments say otherwise (carried forward, still open)

**File:** `lib/thinx/git.js:184-188`, `lib/thinx/git.js:260-270`
**Issue:** Unchanged. In fallback, `learned: seeded` sets `UserKnownHostsFile` to the seeded file, so `accept-new` writes new host keys into it. The comments still say the seeded file "is never written by ssh".
**Fix:** Correct the comments. Alternatively, in fallback use `UserKnownHostsFile=/dev/null` with `StrictHostKeyChecking=yes`.

### IN-02: `Sanitka.udid` is not a UUID validator, contrary to the D-12 wording (carried forward, still open)

**File:** `lib/thinx/sanitka.js:97-108`, used by `lib/thinx/builder.js:201-209`
**Issue:** Unchanged. `"-".repeat(36)`, mixed case and any hex/dash mix still pass.
**Fix:** Add a `strictUuid` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`) and use it in `buildPathFor`.

### IN-03: Owners without keys get a second identical keyless clone, which can flip `is_private` (carried forward, still open)

**File:** `lib/thinx/git.js:525-529`. Callers: `lib/thinx/sources.js:291-296`, `lib/thinx/builder.js:893-896`, `lib/thinx/devices.js:81-88`
**Issue:** Unchanged.
**Fix:** Return `{ ok, keyed }` from `fetch`, and set `is_private` only when a key was actually used.

### IN-04: `Sources.add` continuation swallows exceptions and leaves checkout residue on failure (carried forward, still open)

**File:** `lib/thinx/sources.js:291-299`
**Issue:** Unchanged.
**Fix:** In the `.catch`, call `callback(false, "Git fetch failed.")`, guarded against a double call. Run `fs.removeSync(TEMP_PATH)` on both failure branches.

### IN-05: Source-add and device-attach fetches never use the D-09 last-good-key memory (carried forward, still open)

**File:** `lib/thinx/sources.js:17`, `lib/thinx/devices.js:15`
**Issue:** Unchanged. Both construct `new Git()` without redis.
**Fix:** Inject the redis client, or document the limitation.

### IN-06: `run_build` ignores `prefetchPublic`'s result and re-derives it from `basename.json` (carried forward, still open)

**File:** `lib/thinx/builder.js:893`, `lib/thinx/builder.js:634`
**Issue:** Unchanged.
**Fix:** `const publicOk = !br.is_private && await this.prefetchPublic(...)`, then skip `prefetchPrivate` when `publicOk`.

### IN-07: `devices.attach` starts an async, link-following `chmodr` on the device path while the prefetch empties and re-clones it (carried forward, still open)

**File:** `lib/thinx/devices.js:384-386`, then `lib/thinx/devices.js:398` -> `lib/thinx/git.js:344`
**Issue:** Unchanged.
**Fix:** Drop the `chmodr`, or use `chmodr.sync` before the prefetch.

### IN-08: `runGit`'s process-group kill and output cap are untested (carried forward, still open)

**File:** `lib/thinx/git.js:47-53`, `lib/thinx/git.js:86-89`
**Issue:** Unchanged.
**Fix:** Assert `process.kill(-pid, 0)` throws `ESRCH` after `(e2)`. Add a stubbed-`spawn` test for `ENOBUFS`.

### IN-09: `chmodCheckoutSync` is a synchronous full-tree walk on the API event loop (carried forward, still open)

**File:** `lib/thinx/git.js:121-134`, called at `lib/thinx/git.js:375`
**Issue:** Unchanged.
**Fix:** Make the walk async, or skip `.git`.

### IN-10: `build()` device matching falls through to an unmatched udid (carried forward; the dead `copy` part is fixed)

**File:** `lib/thinx/builder.js:1343-1376`
**Issue:** The masked `copy` is gone. The matching bug is still there: `udid.indexOf(db_udid)` does substring matching, and a loop that leaves `device` set to the last row can write `build_id` into the wrong device document when nothing matches.
**Fix:** Track an explicit `matched` device with exact equality, and return `device_not_found` otherwise.

### IN-11: Queue socket.io server still has no handshake authentication (recorded; deliberately not enforced)

**File:** `lib/thinx/queue.js:94-102`, `lib/thinx/queue.js:383-394`
**Issue:** Unchanged. A registered client receives jobs, which carry `WORKER_SECRET` and the `--env` payload. It can also send `job-status` for its own entry, and that entry is the only one `releasesWorker` can release.
**Fix:** Staged auth, as recorded in iteration 3.

### IN-12: `log` payloads are still attributed to every listener on the socket (mostly fixed; residual)

**File:** `lib/thinx/builder.js:342-378`
**Issue:**
- **Fixed:** `job-status` is now scoped by `build_id`, and a refusal or a non-result status detaches both listeners.
- **Residual:** `log` still carries no `build_id`. As the fix report notes, B's `onLog` is attached from the emit until B's `worker_busy` arrives. An `A` line containing `status: OK` in that window runs `processShellData` for B. That marks B `Success` and updates B's source `last_build` before B's refusal sets `error`. The `last_build` update is not undone.
**Fix:** Have the worker send `{ build_id, line }` for `log` (still accepting a bare string for D-01), and filter on it the same way as `jobStatusIsFor`.

### IN-13: `poll` path: concurrent `findNext` can dispatch one action twice, and a `findNext` rejection is unhandled (carried forward; the `loop()` sub-item is now WR-02)

**File:** `lib/thinx/queue.js:396-410`, `lib/thinx/queue.js:174-211`
**Issue:** Unchanged apart from the `loop()` null/false comparison, which is now WR-02. `findNext` returns a `waiting` action without claiming it. The `async` handler has no `try`, and with Rollbar a rejection is swallowed rather than crashing.
**Fix:** Wrap the handler body in `try/catch`. Claim the action atomically before dispatch.

### IN-14: Checkout lock limits: wedged when `runGit` never settles, unbounded wait, and reads after release (carried forward, still open)

**File:** `lib/thinx/git.js:149-164`, `lib/thinx/git.js:94-109`; `lib/thinx/devices.js:81-95`
**Issue:** Unchanged. This compounds WR-01: a `prefetchPrivate` that never settles inside `run_build` keeps both the checkout lock and the worker reservation.
**Fix:** As in iteration 3: SIGKILL, plus settle after a grace period. Run `updatePlatform` inside the lock.

### IN-15: `buildGuards` calls back `false` and `run_build` keeps going, which breaks the rule that "a false callback means no dispatch" that both release sites now rely on

**File:** `lib/thinx/builder.js:823-825` (`buildGuards` at `:102-121`); consumers `lib/router.build.js:79`, `lib/thinx/queue.js:274`
**Issue:**
- **The bug.** `if (!this.buildGuards(...)) { recordStatsEvent(BUILD_FAILED); }` has no `return`. For a source without `branch`, `build()` passes `branch = source.branch`, which is undefined. That case calls `callback(false, "branch undefined")`, and `run_build` then defaults the branch and prepares the whole build.
- **Router path.**
  - The first callback releases the worker and answers 200 `{success:false}`.
  - The later `build_started` callback calls `Util.responder` again. `res.header` then throws `ERR_HTTP_HEADERS_SENT` inside the `apienv.list` callback, and Rollbar swallows it.
  - As a result, the job is never dispatched and the decrypted `thinx.yml`/`environment.json` stay in `XBUILD_PATH`.
- **Queue path.**
  - The worker is released while the build is still being prepared. The emit's safeguard (`builder.js:321`) sets it busy again later.
  - In the meantime, `nextAvailableWorker` can give the same worker to another build C. If this build's `runRemoteShell` then refuses before the emit, `releaseWorker` frees the worker while C is running.
**Fix:** `if (!this.buildGuards(callback, owner, git, branch)) { recordStatsEvent(...); return; }`. Also, in the router, guard `Util.responder` with `if (res.headersSent) return;`.

### IN-16: A `worker_busy` refusal, or a worker that disconnects between selection and dispatch, fails the user's build instead of queueing it again

**File:** `lib/thinx/builder.js:261-276`, `lib/thinx/builder.js:356-365`, `lib/thinx/builder.js:421-433`
**Issue:**
- **Why it fails.** Both cases are refusals of a job that never ran, and `dispatchRemoteBuild` applies the full D-10 failure: `BUILD_FAILED`, `blog error`, and a notification. The client has already been told `build_started`, so the owner sees a failed build for a transient scheduling reason.
- **The disconnect window is real.** A failed exit sends `job-status` and then disconnects (`class.js:430-442`). Selection runs in between, and dispatch happens seconds later.
- **With the current worker (WR-03),** the "disconnected at dispatch" case is the normal outcome for any build selected just before the worker's first build ends.
**Fix:** On these two reasons, clean up secrets as now, but queue the build again (`queue.add(udid, source_id, owner)`, injected into the builder) instead of recording `BUILD_FAILED`, and notify "queued". Keep the hard failure for failJob refusals such as `Invalid job authentication`.

---

_Reviewed: 2026-09-28T20:14:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
