---
phase: 23-build-pipeline-sink-hardening
reviewed: 2026-09-28T19:23:42Z
depth: standard
iteration: 2
files_reviewed: 17
files_reviewed_list:
  - lib/thinx/builder.js
  - lib/thinx/devices.js
  - lib/thinx/git.js
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
  info: 10
  total: 13
status: issues_found
---

# Phase 23: Code Review Report (iteration 2)

**Reviewed:** 2026-09-28T19:23:42Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This pass re-reviews the fixes for iteration 1:
- parent commits `7f7661d5`, `67ec3cff`, `36341bfc`, `885759c4`, `f0387ebb` (`git diff 14bd3689..HEAD -- lib spec`)
- worker commit `2f08258` (`git -C services/worker diff 79611f6..HEAD`)

It also checks the new code for regressions. `platform.js`, `plugins/pine64/plugin.js`, `safepath.js`, `sanitka.js` and `package.json` have not changed since iteration 1. I rechecked them only for the carried-forward items.

**Gates re-run:**
- Hermetic API specs (BuilderPath, BuilderRemoteJob, Git, SafePath, Sanitka): **178 specs, 0 failures**.
- Worker: **42/42**.

### Status of the earlier findings

| ID | Status | Notes |
|---|---|---|
| CR-01 | **Fixed** | `chmodCheckoutSync` (`git.js:121-134`) runs inside the `try`, before `basename.json` and before `ok: true` (`git.js:334-344`). It `lstat`s every entry and skips symlinks, and it chmods a directory before reading it. A failure gives `chmod_failed`. `createBuildPath` now uses `chmodr.sync` on an empty directory (`builder.js:690-695`). Spec `(a2)` checks the final modes. I found no symlink-following path. |
| WR-01 | **Mostly fixed** | Covered: the socket handler, `runArgv`, the legacy `runShell` log line, and the API's "Building with arguments", "Executing LOCAL build" and env-count lines. One leak is left: `failJob` sends the whole job back to the API, and the API logs it verbatim. That is re-raised as **WR-01** below. |
| WR-02 | **Fixed** | `runRemoteShell` returns `false` on every refusal. `run_build` then records BUILD_FAILED, sets the build-log state to `error` and runs `cleanupSecrets(XBUILD_PATH)` (`builder.js:1118-1125`). The upfront owner/udid check (`builder.js:745-753`) runs before `getLastAPIKey`, `mkdirp` and any secret write. **It does not refuse legitimate builds:** `build()` sets `udid = device.udid` on a match (`builder.js:1258-1259`), and `owner` is the `devices_by_owner` view key. So for every real build, `br.owner === device.owner` and `br.udid === device.udid`. `XBuilderSpec` registers TEST_DEVICE_5 with the same owner (`envi.oid`) that it builds as. The check also closes an older cross-owner path; see IN-10. |
| WR-03 | **Fixed** | `runGit` (`git.js:64-111`) runs git without blocking the event loop. It uses argv only, `shell: false` and `detached: true`. On timeout or overflow it sends SIGKILL to the whole process group, and the timer stays armed until the pipes close. The T-23-01..07 guarantees are unchanged: `--`, the leading-`-`/NUL/CR/LF refusal, `core.symlinks=false` ×3, `protocol.ext.allow=never`, the constant `GIT_SSH_COMMAND`, `GIT_ASKPASS=false`, `GIT_TERMINAL_PROMPT=0`, askpass removed in `finally`, and the passphrase only through `sshEnv`. The error log never includes env. I found no unhandled rejection: `cloneRepository` never rejects, and `Sources.add` and `devices.prefetch_repository` both end in `.catch`. New regression: concurrent clones into the same path now interleave. That is raised as **WR-02** below and was reproduced. |

### New findings

- **WR-01:** `--env`/secret leak through the worker's `failJob` echo.
- **WR-02:** concurrent `prefetch_repository` for one device now interleaves (reproduced).
- **WR-03:** `runRemoteShell` broadcasts the job, including `WORKER_SECRET` and `--env`, to every socket on an unauthenticated socket.io server. This predates the phase, but it undermines T-23-13 and every idle worker runs the job.

### Not re-raised (triaged)

- the worker `builder` polling loop
- the 0o766/0o777 modes
- the empty `<build_id>/<build_id>` directory
- the legacy `cmd` shell path

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Worker `failJob` sends the full job (argv `--env`, `cmd`, `WORKER_SECRET`) back to the API, which logs it verbatim, so the T-23-13 redaction is still incomplete

**File:** `services/worker/class.js:58-64`. Sink: `lib/thinx/queue.js:381-384` -> `lib/thinx/notifier.js:104`

**Issue:**
`failJob` deep-copies the incoming job and emits it as `job-status`:
```js
let copy = JSON.parse(JSON.stringify(job));
copy.status = "Failed";
copy.details = details;
sock.emit('job-status', copy);
```
The copy still carries three things:
- `argv`, including `--env={"KEY":"value",...}` (the owner's custom env, which may hold credentials)
- `cmd`, the same JSON shell-quoted
- `secret`, the plaintext `WORKER_SECRET`

On the API, `queue.js:381` passes the copy to `notifier.process`. Its first line is `console.log("[DEBUG] [lib/notifier.js] processing status:", { job_status })`. At the default inspect depth that prints `argv` element by element, plus `cmd` and `secret` (confirmed with `node -e`: `{ job_status: { argv: [ '--env={"A":1}' ], secret: 's' } }`).

`failJob` runs on each of these paths:
- `Invalid argv`, a path added in this phase
- `Missing build_id`
- `Missing udid`
- `Missing job secret`
- `Invalid job authentication`

A `WORKER_SECRET` mismatch after a rotation, for example, therefore writes every refused job's env payload and the API's correct secret into the API log. The iteration-1 fix redacted the worker's own log lines but not this path. Neither worker test covers it: the new test emits a job with a wrong secret and asserts only on the **worker's** console.

**Fix:** Echo only identifying fields. The API needs only these for a failed status:
```js
failJob(sock, job, details) {
    const copy = {
        build_id: job && job.build_id,
        udid: job && job.udid,
        owner: job && job.owner,
        source_id: job && job.source_id,
        status: "Failed",
        details: details
    };
    sock.emit('job-status', copy);
    this.running = false;
}
```
Also add a worker test: emit a job with a bad secret and `argv` carrying `--env={"WIFI_PASS":"hunter2"}`, capture the `job-status` payload the server receives, and assert that it contains neither `hunter2` nor any `secret` field. Consider also dropping the `{ job_status }` dump at `notifier.js:104` or reducing it to `build_id`/`status`.

### WR-02: Concurrent `prefetch_repository` calls for the same device now interleave in one checkout directory (regression from WR-03's async conversion, reproduced)

**File:** `lib/thinx/git.js:302-310` (`fs.emptyDirSync` followed by an awaited clone). Callers: `lib/thinx/devices.js:81`, reached from `lib/thinx/devices.js:398`

**Issue:**
`execFileSync` used to serialise every clone. Now `cloneRepository` empties `buildPath`, spawns git and yields. `devices.attach` -> `prefetch_repository` always clones into the device's fixed `deployPathForDevice(owner, udid)`. So two attaches of one device, whether a double submit or a quick re-attach of another source, run two `git.fetch` calls against the same directory at once.

Reproduced with a scratch script that runs two `cloneRepository` calls into one path against a local bare repository. In 6 of 6 runs one call failed with `clone_failed status=128` ("destination path already exists") while the other succeeded.

With keys, `fetch` makes it worse. The losing call moves on to its next key and calls `emptyDirSync` again. That deletes the winner's checkout after the winner resolved `true`, or while its `pull` or `chmodCheckoutSync` is still running (the result is `pull_failed`/`chmod_failed`, or ENOENT in the walk). The winner's `updatePlatform(repo_path)` then reads an emptied or half-written tree, and a partial checkout can be inferred as the wrong platform. Different sources attached back to back can also leave `basename.json` naming one source while the checkout holds the other.

`BUILD_PATH` (per `build_id`) and the `Sources.add` `TEMP_PATH` (per new `source_id`) are unique, so builds and source-add are not affected.

**Fix:** Serialise clones per target directory inside `git.js`, so that every caller is covered:
```js
// git.js, module level
const inflight = new Map(); // buildPath -> tail promise
function serialised(buildPath, task) {
	const key = path.resolve(buildPath);
	const prev = inflight.get(key) || Promise.resolve();
	const next = prev.catch(() => {}).then(task);
	inflight.set(key, next);
	next.finally(() => { if (inflight.get(key) === next) inflight.delete(key); });
	return next;
}
// fetch(): wrap the whole body (all key attempts) in serialised(buildPath, async () => { ... })
// Sources.add/prefetchPublic callers of cloneRepository: route through the same helper.
```
Alternatively, clone into a fresh `mkdtemp` sibling and `rename` it into place on success. Add a GitSpec case that starts two `fetch` calls on one path and expects both to resolve with an intact checkout.

### WR-03: `runRemoteShell` broadcasts every job (with `WORKER_SECRET` and `--env`) to all sockets on an unauthenticated socket.io server, and every idle worker runs it (pre-existing; affects T-23-13 and D-04)

**File:** `lib/thinx/builder.js:299`. Server: `lib/thinx/queue.js:94-102`. Worker: `services/worker/class.js:457-497`

**Issue:**
`this.io.emit('job', job)` sends to **every** connected socket, not to the `worker` that `run_build` was given. `worker.socket` is available right there. This has two consequences.

1. **Duplicate builds.** The worker's `job` handler checks only its own `this.running`. With two or more idle workers, each one runs the same job against the same `path`/`build_id`: concurrent builders write into one checkout, the job produces several `job-status` events, and several `processExitData` calls follow. The API also marks only the chosen worker as running.
2. **Disclosure.** The socket.io server in `queue.js:94` has no `io.use` authentication middleware. `docker-compose.yml:178` publishes container port 4000 as `'4000'`, which maps it to an ephemeral host port on all interfaces. The swarm stack's exposure is not in this repository and needs verification. Any client that can reach the port and connect receives each job's `secret` (`WORKER_SECRET`), the `--env` payload, and the owner and udid. That makes the phase's T-23-13 log redaction moot for that channel. The same unauthenticated server also accepts `job-status` from any client (`queue.js:381`).

This predates phase 23, but the phase rewrote `runRemoteShell` and relies on it for D-04 and T-23-13, so I am raising it here.

**Fix (in scope, minimal):** Send the job only to the selected worker:
```js
// builder.js runRemoteShell, replacing this.io.emit('job', job)
worker.socket.emit('job', job);
```
Keep the `this.io !== null` check only if something else still needs it. **Separately (out of phase scope):**
- Add an `io.use` handshake check against `WORKER_SECRET` on the queue server, which workers already send as `socket.auth.token`.
- Bind or publish port 4000 on the internal overlay network only.

## Info

### IN-01: Known-hosts fallback writes TOFU keys into the "pinned" seeded file; comments say otherwise (carried forward, still open)

**File:** `lib/thinx/git.js:154-158`, `lib/thinx/git.js:229-239`
**Issue:** Unchanged since iteration 1. In fallback, `learned: seeded` sets `UserKnownHostsFile` to the seeded file, so `accept-new` writes new host keys into it. The comments still say the seeded file "is never written by ssh" and that new keys "are simply not persisted".
**Fix:** Correct the comments. Alternatively, in fallback use `UserKnownHostsFile=/dev/null` with `StrictHostKeyChecking=yes`.

### IN-02: `Sanitka.udid` is not a UUID validator, contrary to the D-12 wording (carried forward, still open)

**File:** `lib/thinx/sanitka.js:97-108`, used by `lib/thinx/builder.js:201-209`
**Issue:** `"-".repeat(36)`, mixed case and any hex/dash mix still pass, so case variants of one UUID map to different directories.
**Fix:** Add a `strictUuid` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`) and use it in `buildPathFor`.

### IN-03: Owners without keys get a second identical keyless clone, which can flip `is_private` (carried forward, still open)

**File:** `lib/thinx/git.js:477-480`. Callers: `lib/thinx/sources.js:291-296`, `lib/thinx/builder.js:788-791`
**Issue:** Unchanged. It no longer freezes the API, but a transient public failure followed by a successful keyless retry still stores `is_private=true`. `chmod_failed`/`metadata_failed` on the public attempt also count as "needed a key". `devices.prefetch_repository` sets `is_private=true` after any successful `fetch`, even a keyless one (`devices.js:83`).
**Fix:** Have `fetch` return `false` when there are no keys and the caller already made the public attempt. Set `is_private` only when a key was actually used, for example by returning `{ ok, keyed }` from `fetch`.

### IN-04: `Sources.add` continuation swallows exceptions and leaves checkout residue on failure (carried forward, still open)

**File:** `lib/thinx/sources.js:291-299`
**Issue:** The `.catch` still only logs, so an exception in `inferAndAddSource` or its callback leaves the HTTP request without a response. On `Git fetch failed.`, `TEMP_PATH` still holds a partial or complete private clone.
**Fix:** In the `.catch`, call `callback(false, "Git fetch failed.")`, guarded against a double call. Run `fs.removeSync(TEMP_PATH)` on both failure branches.

### IN-05: Source-add and device-attach fetches never use the D-09 last-good-key memory (carried forward, still open)

**File:** `lib/thinx/sources.js:17`, `lib/thinx/devices.js:15`
**Issue:** Both still construct `new Git()` without redis.
**Fix:** Inject the redis client (`Devices` already holds `this.redis`), or document the limitation.

### IN-06: `run_build` ignores `prefetchPublic`'s result and re-derives it from `basename.json` (carried forward, still open)

**File:** `lib/thinx/builder.js:788`, `lib/thinx/builder.js:529`
**Issue:** `await this.prefetchPublic(...)`'s boolean is still discarded. `prefetchPrivate` treats the existence of `basename.json` as success. This is correct today only because `cloneRepository` writes that file last, after the CR-01 chmod.
**Fix:** `const publicOk = !br.is_private && await this.prefetchPublic(...)`, then skip `prefetchPrivate` when `publicOk`.

### IN-07: `devices.attach` starts an async, link-following `chmodr` on the device path, and the async prefetch then empties and re-clones that same directory (same pattern as CR-01, now a wider window)

**File:** `lib/thinx/devices.js:384-386`, then `lib/thinx/devices.js:398` -> `git.js:304`
**Issue:**
`chmodr(device_path, 0o776, cb)` is fire-and-forget. `prefetch_repository` then runs `emptyDirSync(device_path)` and an async clone into it, so the chmodr walk competes with the deletion and with git writing files. The walk dies with ENOENT (`errState`), and on Linux its file step is link-following `fs.chmod`. Because the clone is now async, the overlap window covers the whole clone instead of a single tick.

Also, since before this phase, `emptyDirSync` on `deployPathForDevice` deletes the device's deployed build envelopes and `build.json` on every attach. The old `rm -rf ./*` did the same, minus dotfiles. Worth confirming that is intended.

**Fix:** Drop the chmodr here: `cloneRepository` already sets the checkout modes. Otherwise use `chmodr.sync` before the prefetch. Consider prefetching into a subdirectory instead of the deploy root.

### IN-08: `runGit`'s process-group kill and output cap are untested

**File:** `lib/thinx/git.js:47-53`, `lib/thinx/git.js:86-89`. Spec: `spec/jasmine/GitSpec.js` `(e2)`
**Issue:** `(e2)` proves that the event loop keeps running and that the clone fails at the timeout. It does not assert that `git-remote-http` or `ssh` are gone afterwards; the fix report used a manual `pgrep` for that. Nothing exercises the `ENOBUFS` path. A regression that dropped `detached: true` (so that `-pid` fails and only git itself is killed) would still pass every spec.
**Fix:** In `(e2)`, record `child.pid` (spy on `spawn` and call through). After the result, assert that `process.kill(-pid, 0)` throws `ESRCH`. Add a unit test with a stubbed `spawn` that writes more than `GIT_MAX_OUTPUT` and expects `code === "ENOBUFS"` and a group kill.

### IN-09: `chmodCheckoutSync` is a synchronous full-tree walk on the API event loop

**File:** `lib/thinx/git.js:121-134`, called at `lib/thinx/git.js:335`
**Issue:** WR-03 moved git off the event loop, but the permission walk still runs one `lstat` plus one `chmod` (plus a `readdir` per directory) synchronously for every entry in the checkout, including `.git/objects`. On a large repository (tens of thousands of objects) this stalls the whole API for as long as the walk takes. Checkout size is attacker-chosen, the same threat model as WR-03, though far shorter.
**Fix:** Keep the walk inside the success contract but make it async (`fs.promises.lstat`/`chmod`/`readdir`) and `await` it, keeping the no-symlink rule. Alternatively, skip `.git` if the builders never need cross-uid write access to it.

### IN-10: `build()` device matching falls through to an unmatched udid (pre-existing); only the new WR-02 check stops it

**File:** `lib/thinx/builder.js:1237-1275`. Dead code: `lib/thinx/builder.js:293-296`
**Issue:**
When none of the owner's devices matches the request `udid`, the loop leaves `device` set to the last row and `udid` set to the request value, and the `udid === null` guard never fires. `devicelib.atomic` then writes `build_id` into the owner's last device, and `run_build` fetches the requested udid, which could be another owner's device.

Before this phase, `run_build` would have built under the victim's `BUILD_PATH` and decrypted the victim's `cssid`/`cpass` with the caller's (or the global) `transmit_key`. The new upfront `buildPathFor(owner, udid) !== BUILD_PATH` refusal (`builder.js:745-753`) now blocks this, which is good. But the root cause in `build()` is still there, and so is the wrong device-document write.

Separately, `let copy = ...; copy.secret = "****"` in `runRemoteShell` is computed and never used.

**Fix:** In `build()`, track an explicit `matched` device and return `device_not_found` when there is none, using exact equality (`db_udid === udid && device.owner === owner`) instead of `indexOf`. Delete the unused `copy`.

---

_Reviewed: 2026-09-28T19:23:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
