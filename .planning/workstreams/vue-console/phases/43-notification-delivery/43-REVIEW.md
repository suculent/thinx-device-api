---
phase: 43-notification-delivery
reviewed: 2026-10-13T07:49:55Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - lib/thinx/socket_upgrade.js
  - thinx-core.js
  - lib/thinx/builder.js
  - lib/router.build.js
  - lib/thinx/queue.js
  - scripts/check-ws-multitab.js
  - spec/jasmine/SocketUpgradeSpec.js
  - spec/jasmine/BuilderStatusFramesSpec.js
  - spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js
  - spec/jasmine/ZZ-WebSocketLifecycleSpec.js
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 43: Code Review Report

**Reviewed:** 2026-10-13T07:49:55Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: the non-`.planning/` files changed in `a0c7d89c^..b1126b6c` (README.md excluded as instructed). The
consumers the new code relies on were read for context but are not in scope: `lib/thinx/messenger.js`
(`subscribeSocket`/`sendToOwner`), `lib/thinx/socket_session.js`, `lib/thinx/buildlog.js` (`state`),
`services/worker/class.js` and `services/worker/builder` (job-status and log shapes), `lib/thinx/notifier.js`, and the
Legacy `LogviewController.js`.

The owner routing holds. `consoleNotifiers` rebinds every frame to `br.owner`, `sendToOwner` delivers only to that
owner's Set, `SocketUpgrade` counts only sockets whose session owner equals the path segment, and the cap check and
the insert run in the same synchronous block. I found no cross-owner delivery path and no cookie, session id or owner
in the new log lines. No Critical findings.

The warnings are about correctness of what the owner sees, and about the new per-owner cap:
- The cap is only as good as the `'close'` events that release its slots. The 30 s heartbeat has never reaped a dead
  peer (WR-01), so half-open connections keep their slots until the kernel gives up on them.
- The F-1/F-2 "first terminal frame wins" rule lets a frame derived from a log line pre-empt the authoritative
  job-status (WR-02).
- A successful dry run ends with a red toast (WR-03).
- The commonest remote failure leaves the build-log state unchanged while the toast says `Failed` (WR-04).

## Warnings

### WR-01: The per-owner cap depends on `'close'`, but the heartbeat never terminates a dead socket

**File:** `thinx-core.js:496-507` (interacts with `lib/thinx/socket_upgrade.js:66-76, 546-554`)
**Issue:** `SocketUpgrade` releases an owner slot only on the raw socket's `'close'`. The ping loop is meant to reap dead
peers, but nothing ever sets `ws.isAlive = false`. The pong handler (`thinx-core.js:540`) and the connection handler
(`:572`) only set it to `true`, so the `ws.isAlive === false` → `terminate()` branch at `:499` never runs, and every
tick just calls `ws.ping()`. This was dormant before Phase 43. Now the cap depends on it.

A peer that disappears without a FIN keeps its slot until Linux TCP retransmission gives up on the 30 s ping writes,
roughly 15–30 minutes with the default `tcp_retries2`. Examples: a laptop going to sleep, a Wi-Fi switch, a mobile
browser killed. Traefik sits in front and does not notice either, because it is half-open towards the same client.
The Legacy console has no reconnect (`wss.onclose = function() {}`), so the user reloads. Each reload opens 2 new
sockets while the stale 2 still count. After 5 such reloads within that window, the owner's next tab gets **429**,
opens no socket, and receives no device or Build Status frames, with nothing in the UI saying why.
**Fix:** Make the heartbeat do what it claims (the standard `ws` pattern):
```js
setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
```
`terminate()` destroys the raw socket. That fires `'close'` and releases the `SocketUpgrade` slot and the messenger
subscription. Add a spec that stops answering pongs and expects `ownerSocketCount` to drop within two intervals
(make the interval injectable).

### WR-02: A `status: OK` substring in build output becomes the terminal frame and suppresses the real failure (breaks F-2)

**File:** `lib/thinx/builder.js:553-563` with `lib/thinx/builder.js:198-199`
**Issue:** `processShellData` treats any log chunk containing `STATUS OK` or `status: OK` as success. It calls
`notify(..., "Completed", true)` and `blog.state(..., "Success")`, and runs `sources.update(last_build)`. Remote builds
feed this function every worker `log` event. That is the builder container's stdout, so it includes output from the
repository's own build scripts and libraries.

Before Phase 43 a later failure still produced its own frame. Now `notify` records `Completed` as the build's terminal
frame, and the authoritative `JOB-RESULT` (`status: "FAILED"`) or worker exit failure that follows is dropped as a
duplicate at `:199`.

Scenario: a firmware repo whose build prints `Upload status: OK` (or any line containing `status: OK`) and then fails
to link. Every owner tab shows a green `Completed` with no red toast after it. The build log flips `Success` →
`FAILED`, and the device's `last_build` was already updated. That is exactly the F-2 ("failure is never green") and
T-43-11 outcome the plan meant to rule out. Only the build owner is affected, so this is a correctness defect rather
than a security one.
**Fix:** Do not derive the terminal frame from log text. For remote builds, the worker's job-status
(`processExitData`) is authoritative. For local builds, send `Completed` from `runShell`'s `exit` handler when
`code === 0`. Keep the log-line match, if at all, only for `blog.state`/`sources.update` on local builds, and match
the builder's exact line (`[builder] Build Stage completed with status: OK`) instead of a substring. Add a spec:
log line `"... status: OK ..."`, then `processExitData({status:"FAILED", completed:true})` must give exactly one
`error` frame and no `Completed`.

### WR-03: A successful dry run is reported as a red terminal error frame `DRY_RUN_OK`

**File:** `lib/thinx/builder.js:524-534`
**Issue:** The worker's builder sets `STATUS='DRY_RUN_OK'` for a successful dry run (`services/worker/builder:513, 570,
692, …`). `JOB-RESULT` carries it as `status`. `processExitData` treats only `status.indexOf("OK") === 0` as success,
so `DRY_RUN_OK` falls through to `notify(udid, build_id, notifiers, "DRY_RUN_OK", false)`, a type `error` frame that
is also terminal. The worker's `Build Stage completed with status: DRY_RUN_OK` line does not contain `status: OK`,
so no `Completed` is sent first.

Before Phase 43 nothing reached the console (`notifiers.websocket` was always null). Now every owner tab shows a
failure toast for a successful dry run. `lib/thinx/notifier.js:83` treats `DRY_RUN_OK` as success. The build route
still accepts `dryrun: true` (`lib/router.build.js:38-40`).
**Fix:**
```js
const ok = (status !== null) && ((status.indexOf("OK") === 0) || (status === "DRY_RUN_OK"));
if (ok) { /* cleanup only for a real OK */ this.notify(udid, build_id, notifiers, "Completed", true); return; }
```
Decide whether a dry run should prune old checkouts (today it would not). Add an F-rule spec for `DRY_RUN_OK`.

### WR-04: The worker's exit-failure payload has no `status`, so the toast says `Failed` and the build-log state does not change

**File:** `lib/thinx/builder.js:533`
**Issue:** The worker reports a failed exit and a spawn error as `{ udid, build_id, state: "Failed", reason }`
(`services/worker/class.js:409-414, 424-429`). That is `state`, not `status`. `processExitData` sends the `Failed`
error frame, then calls `blog.state(build_id, owner, udid, isObject ? data.status : "error")`. For that object,
`data.status` is `undefined`, and `Buildlog#state` returns early on an undefined state (`lib/thinx/buildlog.js:113-116`).

So a remote build that dies before `JOB-RESULT` (builder crash, `set -e` exit, OOM) shows a red `Failed` toast, while
the build record stays `started`. The Legacy console refreshes builds when the frame arrives and still lists the build
as running. The rewrite added an `"error"` fallback for non-object payloads but kept the `undefined` path for the
most common remote failure object.

Spec F2a hides this. It feeds `{ status: "Failed", build_id }`, a shape the worker never sends, instead of
`{ state: "Failed", reason }`.
**Fix:**
```js
blog.state(build_id, owner, udid, ((status !== null) && (status.length > 0)) ? status : "error");
```
Change F2a, or add a case, to use the real worker payload `{ state: "Failed", reason: "...", build_id }` and assert the
`blog.state` argument.

## Info

### IN-01: Unverified upgrades are neither counted nor capped, so D-07's "resource use stays bounded" covers verified owners only

**File:** `lib/thinx/socket_upgrade.js:64-80`
**Issue:** An upgrade with no Cookie header, or with a valid session on a path that is not its owner, skips the cap.
It completes the full WebSocket handshake and is closed 1008 by `SocketSession.accept`. A client that never answers
the close frame keeps the socket for `ws`'s 30 s close timeout. A logged-in owner can therefore exceed their own cap
on `/<anything>`, and an anonymous client is unbounded. This is no worse than before Phase 43: the old guard was
per path, so varying the path bypassed it. The new module's header comment still overstates the guarantee, and the
edge cannot rate-limit by IP (all clients appear as 10.0.0.2).
**Fix:** Answer an unverified upgrade with `HTTP/1.1 401` before the handshake, as the non-`x-thx-core` cookie case
already does, or add a small global cap on untracked in-flight upgrades. The ZZ handshake specs and
`check-ws-multitab.js` rely on open-then-1008 and would need to change with it.

### IN-02: `ZZ-WebSocketLifecycleSpec` no longer exercises REFACTOR-03 release through thinx-core

**File:** `spec/jasmine/ZZ-WebSocketLifecycleSpec.js:100-150`
**Issue:** The spec now uses a bogus `x-thx-core` session. The upgrade therefore has no owner and is never tracked,
and the second upgrade gets `101` whether or not any slot is ever released. Its `"Socket already mapped"` bait cannot
fire either: that string is gone from the source (SocketUpgradeSpec S1 asserts so). Slot release is proven only in the
SocketUpgradeSpec harness (U3a/U3b), not against the real `thinx-core` wiring and express-session store.
**Fix:** Either rename the spec to what it checks now ("same-path re-upgrade answered 101"), or log in through the
test session and assert `ownerSocketCount` returns to baseline after an aborted upgrade. That needs `socketUpgrade`
exposed on `thx` for tests.

### IN-03: SocketUpgradeSpec `afterEach` waits for the live count to reach 0 but never asserts it

**File:** `spec/jasmine/SocketUpgradeSpec.js:218-228`
**Issue:** `await waitFor(() => h.upgrade.liveSocketCount() === 0, 3000)` discards its result. A leaked slot from one
test therefore surfaces as an unrelated failure later, for example U5's `liveSocketCount === 0` or U4's count of 10,
instead of in the test that leaked it.
**Fix:** `expect(await waitFor(...), "slots released after test").to.equal(true);`

### IN-04: Legacy tab whose first socket is opened from the log overlay never subscribes (outside scope; affects the D-16 UAT)

**File:** `services/console/src/app/js/controllers/LogviewController.js:59-65, 91-93` (console submodule, not in this diff)
**Issue:** If `showLog` opens the socket (`$rootScope.wss` undefined and `modalBuildId` set), `wss.onopen` calls
`wsstailLog` instead of `wssinit`. `{init: owner}` is never sent, so `Messenger#subscribeSocket` never runs and that
tab gets no Build Status or device frames until reload. `wsslog.onopen` also sends its logtail on `$rootScope.wss`,
not on `wsslog`, and can throw `InvalidStateError` if `wss` is still connecting. NOTIF-02/03 delivery depends on the
subscription, so a UAT tab that first opened a build log can look like a server-side failure.
**Fix:** In the Legacy console, always send `wssinit()` on open, then `wsstailLog` if a build is selected. Record the
caveat in 43-HUMAN-UAT until it ships.

### IN-05: Remote success prunes repositories twice

**File:** `lib/thinx/builder.js:419-421` and `lib/thinx/builder.js:527-528`
**Issue:** On a `JOB-RESULT` whose status starts with `OK`, `onStatus` calls `processExitData`, which runs
`cleanupDeviceRepositories`. It then runs it again under `if (data.status == "OK")`. The behaviour predates this
phase, but the `processExitData` rewrite kept both calls. `cleanupDeviceRepositories` calls `readdirSync` without a
guard. If it throws, it does so before `notify("Completed")` in `processExitData`, inside a socket.io listener.
**Fix:** Drop the second call in `onStatus`. Wrap the `getDirectories` call in `try/catch`, or move the cleanup after
the `notify`.

---

_Reviewed: 2026-10-13T07:49:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
