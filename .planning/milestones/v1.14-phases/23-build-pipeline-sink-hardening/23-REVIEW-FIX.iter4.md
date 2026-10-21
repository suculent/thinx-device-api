---
phase: 23-build-pipeline-sink-hardening
fixed_at: 2026-09-28T20:04:14Z
review_path: .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
iteration: 4
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-09-28T20:04:14Z
**Source review:** .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md (iteration 3)
**Iteration:** 4. The user approved this pass beyond the normal cap of 3 iterations.

**Summary:**
- Findings in scope: 1 (WR-01). IN-01..IN-14 are out of scope for `critical_warning`. IN-10 (the dead `copy`) and part of IN-12 were fixed because WR-01 touches the same code.
- Fixed: 1. It needs human verification because it changes concurrency and state logic.
- Skipped: 0

All commits are GPG-signed (`%G? = G`). Nothing was pushed or deployed. The legacy `cmd` shell path is untouched.

| Commit | Repo | Subject |
|---|---|---|
| `4902380` | services/worker (`main`) | fix(23): WR-01 refuse a job that reaches a busy worker |
| `88c20095` | parent (`thinx-staging`) | fix(23): WR-01 keep the worker busy flag set while a build runs |
| `07cc256e` | parent | chore(23): bump worker submodule to WR-01 busy refusal |

## Fixed Issues

### WR-01: Every build goes to the first registered worker, which silently drops jobs that arrive while it is building

**Files modified:** `lib/router.build.js`, `lib/thinx/queue.js`, `lib/thinx/builder.js`, `spec/jasmine/BuilderRemoteJobSpec.js`, `spec/jasmine/BuilderPathSpec.js`, `services/worker/class.js`, `services/worker/test.js`, `services/worker` (gitlink)
**Commits:** `4902380` (worker), `88c20095` (API), `07cc256e` (pointer bump)
**Status:** fixed: requires human verification (busy-flag lifecycle and listener attribution)

**Applied fix:**

- **Router** (`router.build.js`): the route sets `next_worker.running = true` before calling `app.builder.build`. The callback sets it back to `false` only when `success !== true`, which means the build was refused before dispatch.
- **Queue** (`queue.js`):
  - `runNext`'s callback no longer clears `running` at `build_started`. It clears it only when the build fails before dispatch. `action.delete()` is unchanged.
  - The `job-status` handler now clears `running` only when `Queue.releasesWorker(job_status)` returns true.
  - It returns false for `details: "worker_busy"`, because the worker is still running another build.
  - It also returns false for a build result (`completed: true`, the JOB-RESULT line); see *Deviation* below.
  - Every other status still clears the flag: failJob refusals, a failed exit, and a spawn error.
  - `disconnect` still deletes the worker entry.
- **`runRemoteShell`** (`builder.js`):
  - **Disconnected socket:** a socket where `connected !== true` is now a refusal. It notifies and returns false, so `run_build` applies D-10.
  - **Busy flag:** every `return false` calls `releaseWorker(worker)`. The emit sets `worker.running = true` again, as a safeguard for callback orderings such as `buildGuards` calling back `false` and later `true`.
  - **New `onRefused` parameter:** it runs when the worker refuses the job after the emit. A refusal is `status: "Failed"` plus a `details` string, with no `completed` flag. That covers `worker_busy` and all failJob refusals.
  - **Comment and IN-10:** the misleading "while the queue had marked only this one as running" comment is corrected, and the dead masked `copy` is removed.
- **D-10 on worker refusal:** the new `dispatchRemoteBuild(...)` takes the `XBUILD_PATH`. `run_build` now calls it in place of the inline refusal branch. It runs `failRemoteBuild` once in either of these cases:
  - `runRemoteShell` returns false;
  - the worker refuses the job later.

  `failRemoteBuild` records `BUILD_FAILED`, calls `blog.state(..., "error")` and runs `cleanupSecrets(XBUILD_PATH)`. The branch where `udid` is null after `build_started` also releases the worker now.
- **IN-12, as far as the busy refusal needs it:**
  - The per-job `job-status` listener acts only on a payload whose `build_id` names its own build (`jobStatusIsFor`). Every worker payload carries a `build_id`: failJob, the busy refusal, a failed exit, a spawn error and JOB-RESULT.
  - A payload without `build_id` keeps the old behaviour and reaches every listener (D-01), except a refusal, which is never attributed.
  - Once a build is refused or its exit fails, both of its listeners are removed (`socket.off`).
  - JOB-RESULT keeps them, because the worker streams the rest of the log (including the `status: OK` line that `processShellData` turns into Success) after that line.
- **Worker** (`services/worker/class.js`):
  - A job that arrives while `this.running` is set goes to `refuseBusyJob`. It emits `job-status` with only `{ build_id, udid, owner, status: "Failed", details: "worker_busy" }`, and it does **not** call `failJob`, so the build in progress keeps its flag.
  - `failJob` and `refuseBusyJob` build the payload with the same `reportRefusal` helper.
  - An empty payload is still ignored, and that check now runs before the busy check, so no refusal without a `build_id` is sent.

**Deviation from the literal instruction:** "clear on a terminal job-status (success or failure)" was applied to failures and refusals, but **not** to the success JOB-RESULT.
- The worker emits JOB-RESULT from its stdout handler while the builder process is still running. After that line, `node ./notifier.js` still runs (it writes to CouchDB) and so does `cat $LOG_PATH`.
- The worker's own `this.running` stays true until `exit`. On exit it always disconnects, which deletes the API's entry.
- If the API cleared the flag at JOB-RESULT, a gap of seconds would open in which the next build goes to a worker that is still busy. The deployed `a2e4bfa` worker would drop that job silently, and the new worker would refuse it.
- With this choice the API flag follows the worker's own flag exactly.

**Specs added:** API +15 (200 -> 215), worker +3 (46 -> 49).

With the fix removed (`git stash` of the three lib files), 11 of the 15 new API specs fail. With the worker fix removed, 2 of the 3 new worker tests fail. The specs that pass on the old code are guards: a refusal before dispatch releases the worker, a legacy payload without `build_id` still reaches its build, a JOB-RESULT keeps the log listener, and a busy worker ignores an empty payload.

New API specs (`BuilderRemoteJobSpec`). The first three groups use a real socket.io server and the Queue's own handlers:

- **Router:**
  - With two registered clients, two `/api/v2/build` requests send build A to the first client and build B to the second, and afterwards `nextAvailableWorker()` returns false. On the old code both jobs went to the first client.
  - A build refused before dispatch hands the worker back.
- **Queue:**
  - After `runNext`, the build's `build_started` leaves `running` set.
  - `worker_busy` and JOB-RESULT keep it set; a failed exit clears it.
  - A build refused before dispatch releases the worker.
- **Disconnected worker:** a client is selected and then closes. `dispatchRemoteBuild` returns false and releases the worker. The build log gets exactly `[BUILD_A, owner, udid, "error"]`, stats get `BUILD_FAILED`, and `environment.json`/`thinx.yml` are removed from the checkout.
- **Busy refusal, end to end:**
  - A is dispatched, then B goes to the same client, which answers `worker_busy` for B. Only B is marked `error`, recorded as `BUILD_FAILED` and cleaned up; A's secrets stay in place.
  - No `processExitData` runs for A, and the worker stays `running`.
  - A later `log` line and A's JOB-RESULT reach A only, because B's listeners are gone.
- **`runRemoteShell` unit cases:** a disconnected socket and a socket that never reports `connected` are refused, emit nothing and release the worker. Invalid arguments release the worker. An emit marks it running.
- **Attribution (EventEmitter socket):**
  - A payload without `build_id` still reaches its build (D-01), and a refusal without `build_id` reaches none.
  - Each status reaches only the build it names. A refusal detaches that build's two listeners, and a failed exit detaches too.
  - JOB-RESULT keeps the `log` listener.
  - A `Queue.releasesWorker` truth table.

New worker tests (`services/worker/test.js`):
- The `refuseBusyJob` payload is exactly the five keys, and `running` stays true.
- A socket round trip: a job carrying `--env={"WIFI_PASS":"hunter2"}` and the secret is sent to a busy worker. The mock API receives `worker_busy` with no secret and no env, nothing is spawned, and `running` stays true.
- A busy worker ignores an empty payload.

**D-01 (API and worker deploy in either order):**
- **New API with the deployed worker `a2e4bfa`:** that worker never sends `worker_busy`. Its failJob, exit and JOB-RESULT payloads all carry `build_id`, so the new scoping attributes them as before. It drops a job silently only when the API's flag is wrong, and with this fix that should no longer happen: the flag is now set on both routes and stays set until the worker is idle or disconnects.
- **New worker with the current API:** the API receives a `job-status` it already knows how to handle. The build that was refused is now marked failed instead of hanging. **Caveat:** the current API does not scope its per-job listeners, so the build still running on that socket also runs `processExitData` with `"Failed"`. Its build log and websocket show "Failed" until its own `status: OK` log line sets `Success` again. This is a temporary wrong status, not lost data. It happens only with the current API, whose selection bug is what sends jobs to busy workers in the first place. **Deploying the API first avoids it.**

## Residual risks (not fixed; for the verifier)

- **Paths that never call back:** if `build()`/`run_build` never calls its callback, the selected worker stays marked busy until it disconnects. On the queue path this was already true before this fix; it is new for the API route. Examples:
  - `devicelib.view` fails with an error other than `missing`;
  - an exception is thrown inside a CouchDB callback.

  Most such paths throw an uncaught exception, which restarts the process and resets the state. A time limit on the preparation stage would close this, but it was not added.
- **Brief log window:** B's `log` listener is attached from the emit until B's `worker_busy` refusal arrives. A `status: OK` line that the busy worker streams for A during those few milliseconds would also reach B's `processShellData`. `log` payloads carry no `build_id`, so this cannot be filtered without a protocol change.
- **Other silent drops in the worker (pre-existing):** jobs refused in `validateJob` with no `job-status` are still dropped silently. These are an unsafe legacy `cmd` and a missing `WORKER_SECRET`, plus a `path` containing `..`. The API never produces the first and the last, but a worker with no `WORKER_SECRET` still loses the build silently.
- **Worker never reconnects (pre-existing):** the worker calls `socket.disconnect()` after every build, and socket.io-client does not reconnect after a manual disconnect. A worker process therefore serves one build per connection. This is why "disconnect deletes the entry" is the normal way a successful build releases its worker.

## Verification

All gates ran in the **main checkout** (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, branch `thinx-staging`), not in an isolated worktree. The caller asked for the main working tree, and the worker commit had to go inside the `services/worker` submodule on `main`. `workflow.use_worktrees` is not set in `.planning/config.json`. The results can be reproduced from the current tree.

- **API specs (hermetic, no helpers):**
  - Command: `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<{"spec_dir":"spec/jasmine","helpers":[]}> spec/jasmine/{BuilderPath,BuilderRemoteJob,Git,SafePath,Sanitka,Finder}Spec.js`
  - Result: **215 specs, 0 failures**, up from a baseline of 200. `BuilderRemoteJobSpec` passed 3 runs in a row.
  - The `writePoint Error: connect ECONNREFUSED 127.0.0.1:8086` lines come from the older WR-03 socket specs' Influx call. They were already there and are not failures. The new block stubs `InfluxConnector.statsLog` and `BuildLog.prototype.state`.
- **Worker:** `npm --prefix services/worker test` gave **49/49**, up from 46.
- **ESLint:** clean on `lib/` and both touched spec files. `services/worker` is on the parent's ignore list.
- **Syntax:** `node -c` passed on `builder.js`, `queue.js`, `router.build.js` and `services/worker/class.js`.
- **Not run:** `XBuilderSpec`, `QueueSpec` and the other specs that need Redis or CouchDB. `XBuilderSpec` passes `nextAvailableWorker()`, which is false when no worker is registered, so `run_build` refuses before the changed code.

---

_Fixed: 2026-09-28T20:04:14Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 4_
