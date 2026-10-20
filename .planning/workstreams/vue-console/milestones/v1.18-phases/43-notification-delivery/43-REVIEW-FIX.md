---
phase: 43-notification-delivery
fixed_at: 2026-10-13T09:30:00Z
review_path: .planning/workstreams/vue-console/phases/43-notification-delivery/43-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 43: Code Review Fix Report

**Fixed at:** 2026-10-13T09:30:00Z
**Source review:** .planning/workstreams/vue-console/phases/43-notification-delivery/43-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01..WR-04; IN-03 fixed as well, since it was trivial)
- Fixed: 4 (+ IN-03)
- Skipped: 0
- Out of scope, not touched: IN-01, IN-02, IN-04, IN-05

Fixes were applied and committed in the main checkout on `thinx-staging`, not in an isolated worktree. The caller
asked for that, and the affected specs need the checkout's `node_modules`. Every commit stages explicit paths only.
Nothing was pushed.

## Fixed Issues

### WR-01: The per-owner cap depends on `'close'`, but the heartbeat never terminates a dead socket

**Files modified:** `lib/thinx/socket_upgrade.js`, `thinx-core.js`, `spec/jasmine/SocketUpgradeSpec.js`
**Commit:** bd91b8e6
**Applied fix:** The heartbeat moved into `SocketUpgrade.startHeartbeat(wss, intervalMs)` (default
`HEARTBEAT_INTERVAL_MS` = 30000). It uses the standard `ws` pattern. On `'connection'` it sets `ws.isAlive = true` and
installs a pong handler that sets it back to true. Each tick terminates any socket whose `isAlive` is still false;
every other socket gets `isAlive = false` and a ping. `terminate()` destroys the raw socket, and its `'close'` releases
the owner slot and the messenger subscription, so the REFACTOR-03 release semantics are unchanged. `thinx-core.js`
calls it on its wss and drops its own ping loop and `initSocket` pong handler. The interval is injectable.
New specs:
- **H1:** a `ws` client with `autoPong: false` is reaped within two 100 ms intervals; its slot and subscription are
  freed. An answering socket stays open and keeps receiving.
- **H2:** a raw half-open upgrade is reaped and the count returns to baseline.
- **S2:** pins the `thinx-core` wiring.

RED first: H1, H2 and S2 failed before the change.

### WR-02: A `status: OK` substring in build output becomes the terminal frame and suppresses the real failure (F-2)

**Files modified:** `lib/thinx/builder.js`, `spec/jasmine/BuilderStatusFramesSpec.js`
**Commit:** b93f52d1
**Applied fix:** `processShellData` no longer sends `Completed`, no longer sets the build log to `Success`, and no longer
updates `last_build`. `processExitData` is now the only path to success. On OK it sends `Completed`, sets `Success`,
and updates `last_build` through a new `updateLastBuild`. The remote job-status listener passes its `options`, which
carry `source_id`.

Local builds needed separate handling, because `./builder` exits 0 whether the build passed or failed (its last
command is `cat $LOG_PATH`). `processShellData` records the last status the builder itself printed on a whole line, in
either the `[builder] Build Stage completed with status: X` form or the `STATUS X` form. `runShell`'s exit 0 hands that
status to `processExitData`. An exit 0 without such a line sends no terminal frame. A non-zero exit is still `Failed`.
New specs:
- **F2e:** a remote build with `status: OK` output, then a `FAILED` job-status, gives one error frame and the build
  log is never `Success`.
- **F1d, F1e:** an OK job-status alone gives `Success` and `last_build`.
- **L1–L4:** local builds run through a fake `spawn`, covering forged lines, the "last line wins" rule, exit 0 with no
  status, and a non-zero exit.

RED first: 7 failures before the change.
**Status:** fixed: requires human verification (logic change). Points to check:
- (a) `last_build` is still written with `opts.version`, which no caller sets. That matches the earlier value, which
  was also undefined.
- (b) A local build whose output splits the builder's status line across two stdout chunks would not record it and
  would end with no terminal frame. The local builder's final `cat $LOG_PATH` replays the line, which usually gives a
  second chance.
- (c) If an OK job-status arrives after a failure for the same build, the second terminal frame is still suppressed,
  but the build-log state would become `Success`. The worker does not send in that order: `JOB-RESULT` comes before the
  exit status.

### WR-03: A successful dry run is reported as a red terminal error frame `DRY_RUN_OK`

**Files modified:** `lib/thinx/builder.js`, `spec/jasmine/BuilderStatusFramesSpec.js`
**Commit:** ebb44abb
**Applied fix:** For status `DRY_RUN_OK`, `processExitData` sends `Completed` (type success), which matches
`notifier.js`. The build-log state stays `DRY_RUN_OK`, the value it had before. Decision on the review's open question:
a dry run deploys nothing, so it does not prune old checkouts and does not update `last_build`. New specs: F1f (remote
job-status, which also asserts no prune and no `last_build`) and L5 (local builder status). RED first: 2 failures.
**Status:** fixed: requires human verification (choice of `Completed` as the body and no prune for a dry run).

### WR-04: The worker's exit-failure payload has no `status`, so the build-log state does not change

**Files modified:** `lib/thinx/builder.js`, `spec/jasmine/BuilderStatusFramesSpec.js`
**Commit:** 6b593ebf
**Applied fix:** On the failure path, `processExitData` now records the status string when the payload has one, and
`"error"` otherwise. `{ state: "Failed", reason }` therefore sets the build log to `error` instead of passing
`undefined`, which `Buildlog#state` ignored. Spec changes:
- **F2a:** now feeds the payload the worker really sends, `{ udid, build_id, state: "Failed", reason }`, and asserts
  the `blog.state` arguments.
- **F2a'':** delivers the same payload through the `runRemoteShell` job-status listener.
- **F2a':** now also asserts that a worker status string is recorded as is.

RED first: 2 failures.

### IN-03 (info, optional): SocketUpgradeSpec `afterEach` never asserted the live count

**Files modified:** `spec/jasmine/SocketUpgradeSpec.js`
**Commit:** 21240e67
**Applied fix:** `expect(await waitFor(() => h.upgrade.liveSocketCount() === 0, 3000), "slots released after test").to.equal(true)`.

## Verification

These checks ran in the main checkout (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, branch
`thinx-staging`), not in a worktree. They used placeholder `COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy`,
`ENVIRONMENT=development`, and a helper-free jasmine config (`{"spec_dir":"spec/jasmine","helpers":[],"random":false}`).

- Baseline before any change: SocketUpgradeSpec + BuilderStatusFramesSpec + MessengerOwnerSocketSpec, 58 specs, 0 failures.
- After all fixes: SocketUpgradeSpec, BuilderStatusFramesSpec, MessengerOwnerSocketSpec, LogTailOwnerSpec and
  BuilderRemoteJobSpec gave **166 specs, 0 failures**. BuilderPathSpec and BuilderApiKeySpec are also green: 197 specs
  with the builder specs together.
- The socket specs (SocketUpgradeSpec, MessengerOwnerSocketSpec, LogTailOwnerSpec) were run 3 times in a row after
  WR-01: 57/57 each time.
- `XBuilderSpec` needs Redis/CouchDB. Its `beforeAll` fails the same way with and without these changes, so it was
  syntax-checked only.
- `node --check` passes on `ZZ-WebSocketHandshakeRtmSpec.js`, `ZZ-WebSocketLifecycleSpec.js`,
  `ZZ-LogTailWebSocketSpec.js`, `ZZ-RouterBuilderSpec.js`, `XBuilderSpec.js`, `thinx-core.js`, `builder.js` and
  `socket_upgrade.js`.
- `eslint` is clean on every changed file.

Not touched: port 7442, plain MQTT, `messenger.js` routing, `services/console`.

---

_Fixed: 2026-10-13T09:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Follow-up: CI race after WR-04 (orchestrator)

Pipeline 5660 (`8e81d6c1`) failed one spec, `XBuildlogSpec (03) should be able to append existing log`, with CouchDB 409
"Document update conflict." on the shared test build document. WR-04 turned a failed exit's `blog.state(undefined)`
(a no-op) into a real `"error"` write, which now races log appends on the same document. The failed job was rerun
green and deployed. Fix `4fcacece`: `lib/thinx/buildlog.js` retries the `state` and `log` atomic updates on 409
(4 attempts, short backoff; a 409 writes nothing, so a retry cannot duplicate). Pipeline 5661 (`4fcacece`):
`CI-GATES PIPELINE OK`, legacy-off; `WS-MULTITAB OK 2/2` after rollout.
