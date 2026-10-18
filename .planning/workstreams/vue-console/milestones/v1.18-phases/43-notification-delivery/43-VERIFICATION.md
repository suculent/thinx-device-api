---
phase: 43-notification-delivery
verified: 2026-10-13T09:38:02Z
status: passed
score: 61/61 must-haves verified (4 by operator override, 4 by operator UAT 2026-10-13)
covered_files:
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-03-SUMMARY.md"
  - "lib/router.build.js"
  - "lib/thinx/builder.js"
  - "lib/thinx/buildlog.js"
  - "lib/thinx/queue.js"
  - "lib/thinx/socket_upgrade.js"
  - "scripts/check-ws-multitab.js"
  - "spec/jasmine/BuilderStatusFramesSpec.js"
  - "spec/jasmine/SocketUpgradeSpec.js"
  - "spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js"
  - "spec/jasmine/ZZ-WebSocketLifecycleSpec.js"
  - "thinx-core.js"
covered_digest: "v3:sha256:8b36454374355b12c5e5f56aa5a66e47b23033b0cc1d49a5a5857e7ad8740a2e"
behavior_unverified: 0
overrides_applied: 4
overrides:
  - must_have: "The escaped toast is live on rtm.thinx.cloud through a one-off legacy console build: CI-05 is bypassed for that one pipeline only, and the next thinx-staging pipeline again builds no legacy console image."
    reason: "Operator replied skip-bypass at the 43-03 Task 2 checkpoint. The outcome holds without the bypass: the served rtm LogviewController.js (built by pipeline 5653, the last legacy build before CI-05) is byte-identical to the console gitlink cfff199 source with <ENV::wssUrl> substituted, sha256 e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d, and carries thinxEscapeHtml. CI-05 was never lifted (build_legacy_console default false; pipelines 5659 and 5661 legacy-off). The thinx/console:swarm image refresh the bypass would have brought moves to Phase 48 CI-06."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The operator, not Claude, triggers the one-off pipeline with the runbook §4 snippet and their own CircleCI token; Claude then proves it with check-ci-gates.js pipeline --pipeline-id <id> --expect legacy-on --wait and checks that its revision is the pushed HEAD"
    reason: "Same operator decision (skip-bypass): no bypass pipeline exists to prove. Nothing was triggered by Claude or anyone else."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The rebuilt Legacy image is live: after the bypass pipeline, LogviewController's Last-Modified is later than the baseline recorded before the push and the served file still meets the D-04 content checks"
    reason: "Same operator decision (skip-bypass): nothing was rebuilt, so Last-Modified stays Mon, 12 Oct 2026 14:57:11 GMT. The D-04 content checks still pass on the served file (re-checked by the verifier on 2026-10-13T09:3xZ: sha256 unchanged e556c292…dec59d)."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The next normal thinx-staging push after the bypass runs legacy-off: check-ci-gates.js pipeline --revision <that push> --expect legacy-off prints CI-GATES PIPELINE OK"
    reason: "Same operator decision (skip-bypass): there is no bypass to follow. Pipeline 5659 (normal push of b1126b6c) and pipeline 5661 (normal push of 4fcacece) are legacy-off, and CI-GATES COMPILE OK shows thinx-staging selects no console-classic job with the parameter false."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
re_verification:
  previous_status: passed
  previous_score: 56/56
  reason: "stale: covered sources changed after the 07:41Z verification (review fixes bd91b8e6, 21240e67, b93f52d1, ebb44abb, 6b593ebf; 409 retry 4fcacece in lib/thinx/buildlog.js)"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 43: Notification Delivery Verification Report

**Phase Goal:** Device notifications reach every open console of their owner, build status included, and a device can no longer inject markup into the owner's console toast. The escaped toast is live in production now, not at milestone close.
**Verified:** 2026-10-13T09:38:02Z
**Status:** passed
**Re-verification:** Yes. The 07:41Z report went stale when the code-review fixes and the 409 retry changed covered sources. This run re-checks every must-have against HEAD `6579deb1` and adds five truths for the fixes.

## What changed since the first verification

`git diff 52882716 HEAD` outside `.planning/` touches exactly six files: `lib/thinx/builder.js`, `lib/thinx/buildlog.js`, `lib/thinx/socket_upgrade.js`, `thinx-core.js`, `spec/jasmine/BuilderStatusFramesSpec.js`, `spec/jasmine/SocketUpgradeSpec.js`. `services/console`, `lib/thinx/messenger.js` and `lib/thinx/socket_session.js` are still unchanged since `9dba1e76` (`git diff --quiet` exit 0).

| Commit | Change | Effect on must-haves |
|---|---|---|
| bd91b8e6 (WR-01) | Heartbeat moved to `SocketUpgrade.startHeartbeat`/`heartbeatTick`; it now sets `isAlive = false` before each ping, so dead peers are terminated and their `'close'` frees the owner slot | Strengthens 43-01 #2/#5/#14 (slots can no longer leak until TCP timeout) |
| 21240e67 (IN-03) | SocketUpgradeSpec `afterEach` asserts every slot is released | Test hardening only |
| b93f52d1 (WR-02) | `processShellData` no longer sends Completed or sets Success; `processExitData` is the only success path. Local builds use the builder's own last status line | Closes a real F-2 hole: build output containing `status: OK` used to send green and suppress the real failure |
| ebb44abb (WR-03) | `DRY_RUN_OK` sends a green `Completed`; no prune, no `last_build` | F-1/F-2 frame typing correct for dry runs |
| 6b593ebf (WR-04) | A failed exit with no status string sets the build log to `error` | Build-log state no longer stuck at `started` |
| 4fcacece | `buildlog.js` retries the `state` and `log` atomic updates on CouchDB 409 (4 attempts, 25/50/75 ms backoff) | Fixes the CI race WR-04 exposed (pipeline 5660, XBuildlogSpec 03) |

## Operator Deviation: criterion 2 (skip-bypass)

The operator replied `skip-bypass` at the 43-03 Task 2 checkpoint, so the one-off `build_legacy_console=true` pipeline of roadmap success criterion 2 never ran. The criterion is recorded as **satisfied in outcome, with an operator-accepted deviation**, not as a gap:

- Re-checked in this run: `curl https://rtm.thinx.cloud/app/js/controllers/LogviewController.js | shasum -a 256` gives `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d`, the same hash the first verification matched byte-for-byte against `services/console/src/app/js/controllers/LogviewController.js` at gitlink `cfff199` (with `<ENV::wssUrl>` replaced by `wss://rtm.thinx.cloud`). That file carries `thinxEscapeHtml` 5 times. The console submodule has not changed since.
- Production is therefore already serving the escape, from pipeline 5653, the last legacy build before CI-05.
- CI-05 was never lifted. `build_legacy_console` has `default: false`, and `check-ci-gates.js compile` printed `CI-GATES COMPILE OK` again in this run. Pipelines 5659 and 5661 are legacy-off (5661 per the orchestrator, see Spot-checks).
- What did not happen: the `thinx/console:swarm` image was not rebuilt from the current base image. That refresh moves to Phase 48 CI-06, which re-enables the legacy build anyway.

The four must-haves that depend on the bypass are carried as `PASSED (override)`. Their override entries are in the frontmatter.

## Goal Achievement

### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | A device-supplied `notification.body` containing HTML shows as literal text in the actionable toast | ✓ VERIFIED | `LogviewController.js` `thinxEscapeHtml` escapes `& < > " ' \``, applied to `msg.body` and `msg.title`; nid passes `^[A-Za-z0-9_-]{1,128}$`. `npm --prefix services/console/src run test:toast` in this run: 59 `ok`, 0 `not ok`. Served rtm file hash unchanged. Operator UAT H4 passed (literal text, no alert, long body wraps) |
| SC2 | Escaped toast live on rtm through a one-off legacy build, CI-05 bypassed once, next pipeline legacy-off | ✓ PASSED (override) | Override: operator `skip-bypass`. The outcome (escape live, CI-05 in effect) was verified directly; see the section above |
| SC3 | Two Legacy tabs on one `/<owner>` path both connect and both receive; closing one leaves the other receiving | ✓ VERIFIED | SocketUpgradeSpec U1, U2, U6 pass (this run). Live probe in this run: `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` printed `WS-MULTITAB OK 2/2 opened`, exit 0. Operator UAT H1 and H3 passed |
| SC4 | A running build's status frames reach the owner's open console sockets and no other owner's | ✓ VERIFIED | `run_build` binds `notifiers = this.consoleNotifiers(notifiers, br.owner)` (`builder.js:906`); `notify` sends only `messenger.sendToOwner(notifiers.owner, …)` (`builder.js:201`). BuilderStatusFramesSpec T1, T3, Q2 pass. Operator UAT H2 and H5 passed |

### Plan 43-01 must-haves (NOTIF-02)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Two upgrades on one `/<owner>` path both reach 101 and both receive each owner frame once | ✓ VERIFIED | SocketUpgradeSpec U1, U6 pass |
| 2 | Closing one socket releases only it; count drops by one; messenger Set loses only that socket | ✓ VERIFIED | U2 passes; `_track` uses `socket.once("close")` (`socket_upgrade.js:98`) and `_release` deletes only that socket. IN-03's `afterEach` now asserts the release after every test |
| 3 | Another owner's socket receives nothing | ✓ VERIFIED | U1 (B receives nothing) |
| 4 | Mid-flight teardown leaves no slot | ✓ VERIFIED | U3a, U3b pass; `_admit` refuses destroyed or unwritable sockets before tracking |
| 5 | Cap 10 per owner, 11th gets 429 with one log line, no cookie/session id; slot reusable | ✓ VERIFIED | `MAX_SOCKETS_PER_OWNER = 10`; synchronous check and insert; `socket.end("HTTP/1.1 429 …")` (`:76`); U4 passes |
| 6 | Unverified upgrades not counted, closed 1008; cookie without x-thx-core gets 401 | ✓ VERIFIED | U5 passes; the live probe shows `close 1008` for the unauthenticated socket |
| 7 | thinx-core delegates `upgrade` to SocketUpgrade.handle; path map gone; connection still calls `SocketSession.accept` with `messenger: app.messenger` | ✓ VERIFIED | `thinx-core.js:490-494` (`new SocketUpgrade`, `handle`), `:546` (`SocketSession.accept`, `messenger: app.messenger`). S1 passes. After WR-01 thinx-core no longer uses accept's return value, because it has no per-socket heartbeat state to set |
| 8 | `check-ws-multitab.js` prints OK 2/2 (exit 0) or FAIL k/2 (exit 1) | ✓ VERIFIED | U7/U8 pass; live run OK 2/2, exit 0 |
| 9 | ZZ handshake spec keeps 2 cases and gains a same-path case; lifecycle spec re-expressed; `node --check` clean | ✓ VERIFIED | `node --check` ok for both in this run (ZZ tier not run, see spot-checks) |
| 10 | E3 empty: no sockets, sendToOwner returns 0 | ✓ VERIFIED | `messenger.js` returns 0 with no Set; BuilderStatusFramesSpec T4b |
| 11 | E3 loading: subscribe on `{init}`; nothing replayed | ✓ VERIFIED | `socket_session.js` `{init}` → `initWithOwner` → `subscribeSocket` (unchanged); sendToOwner keeps no buffer |
| 12 | E3 error: over-cap refusal, one log line, no UI effect | ✓ VERIFIED | U4 |
| 13 | E3 populated (same as 1-3) | ✓ VERIFIED | U1, U2 |
| 14 | Concurrency: same-tick upgrades accepted up to the cap; one close never unregisters another | ✓ VERIFIED | U6, U2 |

### Plan 43-02 must-haves (NOTIF-03)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Every frame goes through `sendToOwner(owner, {notification})`, owner bound from `br.owner`; caller-supplied owner ignored | ✓ VERIFIED | `consoleNotifiers` (`builder.js:142-153`) returns a fresh object and drops any caller owner; `:906`; T3, T5 |
| 2 | Router passes `{ messenger: app.messenger }` with no sockets map; queue passes `{ messenger: this.messenger }` | ✓ VERIFIED | `router.build.js:37`; `queue.js:84-85`, `:284`; `app.messenger` set at `thinx-core.js:153` before the Queue is built. T2, S1, Q1, S3 |
| 3 | Frame shape unchanged (`{"notification":{"title":"Build Status","body":…` + type, udid, build_id) | ✓ VERIFIED | `buildNotification` unchanged (`builder.js:127-135`); F1c |
| 4 | Progress bodies `Pulling repository`, `Building...` frozen; Legacy keys on them and `Completed` | ✓ VERIFIED | `builder.js:981`, `:1334`; LogviewController unchanged |
| 5 | F-1: exactly one Completed per build_id, no `OK` frame | ✓ VERIFIED | `terminalFrameSent` dedupe (`:159-168`); after WR-02 `Completed` has one source, `processExitData` (`:533`, `:543`). F1a, F1b, F1d, F1f, L2, L5 pass |
| 6 | F-2: one error frame with its reason, nothing green after; null-safe `processExitData` | ✓ VERIFIED | Strengthened by WR-02: build output can no longer emit a green frame. F2a, F2a', F2a'', F2b, F2c, F2d, F2e, L1, L3, L4 pass |
| 7 | F-3: terminal Completed carries build_id | ✓ VERIFIED | `notify` passes build_id into every frame; F1a, F1f |
| 8 | F-4/D-10: raw log lines never sent to sockets | ✓ VERIFIED | `processShellData` (`:584-608`) only logs and, for local builds, records the builder's status line; F4, S2 |
| 9 | F-5/D-12: build of A (route or queue) reaches only A | ✓ VERIFIED | T1, Q2 |
| 10 | Builder never logs a frame; no subscribers costs nothing | ✓ VERIFIED | `notify` has no log; T4b |
| 11-19 | E2 empty/loading/error/populated/partial/overflow/zero-one-many, E3 empty, concurrency | ✓ VERIFIED | Q2, F1c, F2*, F1a, P1, F4, T1, T4b, E, M1 pass |

### Plan 43-03 must-haves (deploy and live proof)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Push carries only Phase 43 commits; signed; no merges; only the 10 phase files outside `.planning/` and root `*.md` | ✓ VERIFIED | Unchanged from the first verification (`7cec687b..b1126b6c`). The later fix push adds only the six files listed above, all Phase 43 |
| 2 | Push pipeline ran test, api-registry, vue-console-registry, no snyk/console-classic | ✓ VERIFIED | `CI-GATES PIPELINE OK 5659` (first verification); 5661 on 4fcacece `CI-GATES PIPELINE OK` legacy-off (orchestrator-reported; this run triggered and queried no pipeline) |
| 3 | NOTIF-02 live (FAIL 1/2 before, OK 2/2 after) | ✓ VERIFIED | OK 2/2 reproduced in this run after the 5661 rollout. The "before" FAIL 1/2 is SUMMARY-recorded |
| 4 | D-14: console submodule unchanged | ✓ VERIFIED | `git diff --quiet 9dba1e76 HEAD -- services/console` exit 0 |
| 5 | Served LogviewController contains the escape and equals the source (wss substituted) | ✓ VERIFIED | Hash re-checked in this run: e556c292…dec59d, identical to the first verification's `cmp` match |
| 6 | Operator triggers one-off pipeline; Claude proves legacy-on | ✓ PASSED (override) | skip-bypass |
| 7 | Rebuilt Legacy image live (newer Last-Modified) | ✓ PASSED (override) | skip-bypass; content checks pass |
| 8 | `test:toast` prints only ok lines | ✓ VERIFIED | 59 ok, 0 not ok (this run) |
| 9 | CI-05 back in effect (default false; compile OK) | ✓ VERIFIED | `CI-GATES COMPILE OK` (this run) |
| 10 | Vue non-issue (no `new WebSocket`, `v-html`, `notification.body`) | ✓ VERIFIED | console submodule unchanged since the first verification's grep (no match) |
| 11 | messenger.js, socket_session.js, services/console unchanged; device port 7442, device routes, MQTT untouched | ✓ VERIFIED | `git diff --quiet 9dba1e76 HEAD -- services/console lib/thinx/messenger.js lib/thinx/socket_session.js` exit 0. The WR-01 thinx-core diff touches only the heartbeat and connection handler |
| 12 | E1 loading: toast only on frame arrival | ✓ VERIFIED | Toasts are created only in the socket message handler |
| 13 | E1 error: bad nid / bad type shows no toast | ✓ VERIFIED | test:toast rejection cases |
| 14 | E1 overflow: long body wraps inside the toast | ✓ VERIFIED (operator UAT) | H4 passed |
| 15 | E1 long-text: HTML body/title render as literal text | ✓ VERIFIED | test:toast hostile body/title cases; H4 |
| 16 | rtm: real build toasts in both tabs (backstop) | ✓ VERIFIED (operator UAT) | H2 passed: both tabs, Pulling repository / Building... / Completed |
| 17 | rtm: at most three Build Status toasts per tab (backstop) | ✓ VERIFIED (operator UAT) | H2 passed |
| 18 | rtm: closing one tab leaves the other receiving (backstop) | ✓ VERIFIED (operator UAT) | H3 passed |
| 19 | Next normal push after the bypass is legacy-off (backstop) | ✓ PASSED (override) | skip-bypass; 5659 and 5661 legacy-off |

### Review-fix truths (added in this re-verification)

| # | Truth | Status | Evidence |
|---|---|---|---|
| R1 (WR-01) | A socket that stops answering pings is terminated within two heartbeat intervals and its owner slot and messenger subscription are freed; an answering socket stays open; thinx-core runs this heartbeat and has no ping loop of its own | ✓ VERIFIED | `socket_upgrade.js:130-155` (`startHeartbeat`, `heartbeatTick` sets `isAlive = false` and pings; terminates if still false). `thinx-core.js:499`. Behavioral: SocketUpgradeSpec H1 (autoPong off, reaped, slot and subscription freed), H2 (half-open raw upgrade reaped), S2 (wiring) pass |
| R2 (WR-02) | Build output never decides success. Only the worker's job-status (remote) or the builder's own last status line plus exit 0 (local) produce Completed, `Success` and `last_build` | ✓ VERIFIED | `processShellData` has no notify/state/sources call; `processExitData` is the single success path (`:528-553`); `lastBuilderStatus` anchors whole lines, last one wins. Behavioral: F2e, F1d, F1e, L1-L4 pass |
| R3 (WR-03) | A successful dry run is one green `Completed`; no prune, no `last_build`; build log keeps `DRY_RUN_OK` | ✓ VERIFIED | `builder.js:542-546`; F1f, L5 pass |
| R4 (WR-04) | A failed exit without a status string sets the build log to `error` and sends one `Failed` frame | ✓ VERIFIED | `builder.js:550-552`; F2a, F2a', F2a'' pass |
| R5 (4fcacece) | Build-log `state` and `log` atomic updates retry on CouchDB 409 (up to 4 attempts), and do not retry other errors | ✓ VERIFIED | `buildlog.js:27-36`; nano/couch errors carry `statusCode` (`couch.js` wrapper → nano 11). No repo spec covers it, so the verifier ran an in-process probe with a fake couch client (no network, no writes): `RETRY409 PASS two 409 then ok calls=3`, `PASS four 409 gives up err=409 calls=4`, `PASS 500 not retried calls=1`, exit 0. CI XBuildlogSpec green on 5661 per the orchestrator |

**Score:** 61/61 must-haves verified: 4 by operator override (skip-bypass), 4 by operator UAT (the visual and backstop truths). 0 present but behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/thinx/socket_upgrade.js` | Per-owner tracking, cap, 429, close release, heartbeat | ✓ VERIFIED | 158 lines; wired from `thinx-core.js:311,490-499` |
| `thinx-core.js` | Upgrade delegates to SocketUpgrade; heartbeat via `startHeartbeat` | ✓ VERIFIED | `node --check` ok; eslint clean |
| `spec/jasmine/SocketUpgradeSpec.js` | Local proof D-05/D-07/D-08 + WR-01 | ✓ VERIFIED | 13 `it(` blocks incl. H1, H2, S2; pass |
| `scripts/check-ws-multitab.js` | Credential-free live probe | ✓ VERIFIED | Live OK 2/2 (this run) |
| `lib/thinx/builder.js` | consoleNotifiers, notify via sendToOwner, F-1..F-4, WR-02..04 | ✓ VERIFIED | `wsOK`, `sendNotificationIfSocketAlive`, `buildStatusNotification` absent (S2) |
| `lib/thinx/buildlog.js` | 409 retry on atomic updates | ✓ VERIFIED | `atomicWithRetry` used by `state()` and `createAtomicLogRecord` |
| `lib/router.build.js` | `{ messenger: app.messenger }` | ✓ VERIFIED | `:37` |
| `lib/thinx/queue.js` | `this.messenger`, notifiers in runNext | ✓ VERIFIED | `:84-85`, `:284` |
| `spec/jasmine/BuilderStatusFramesSpec.js` | F-1..F-5, D-12 proof + WR-02..04 | ✓ VERIFIED | 34 `it(` blocks; pass |

### Key Link Verification

Checked by hand (the `verify.key-links` query cannot parse these plans' `from:` fields, as noted in the first verification):

| From | To | Via | Status |
|---|---|---|---|
| thinx-core `server.on('upgrade')` | `SocketUpgrade.handle` | `new SocketUpgrade({ wss, sessionParser })` (`thinx-core.js:490-494`) | ✓ WIRED |
| thinx-core wss | `SocketUpgrade.startHeartbeat` | `thinx-core.js:499` | ✓ WIRED |
| heartbeat `ws.terminate()` | raw socket `close` → `_release` + messenger unsubscribe | `socket.once("close")` in `_track`; proven by H1 | ✓ WIRED |
| `SocketUpgrade._admit` (verified, under cap) | wss `connection` → `SocketSession.accept` → `{init}` → `subscribeSocket` | `thinx-core.js:546`; `socket_session.js`; `messenger.js` | ✓ WIRED |
| router `build()` / queue `runNext()` | `Builder.build` → `run_build` | `{ messenger: app.messenger }` / `{ messenger: this.messenger }` | ✓ WIRED |
| `run_build` | notify / processExitData / processShellData | `consoleNotifiers(notifiers, br.owner)` → `runShell` / `dispatchRemoteBuild` | ✓ WIRED |
| remote `job-status` listener | `processExitData(…, options)` with `source_id` | `builder.js:417`; F1e | ✓ WIRED |
| local `runShell` exit 0 | `processExitData({ status: opts.builderStatus }, opts)` | `builder.js:634-639`; L1-L5 | ✓ WIRED |
| `Builder.notify` | `Messenger.sendToOwner` | `builder.js:201` | ✓ WIRED |
| `Buildlog.state` / `createAtomicLogRecord` | `buildlib.atomic` with 409 retry | `atomicWithRetry` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Legacy toast (LogviewController) | `msg` | owner WebSocket frame `msgBody.notification` | Yes, from `sendToOwner` and the device/MQTT path | ✓ FLOWING |
| Build Status frame | owner, build_id, udid | `br.owner` from the `Builder.build` build request | Yes | ✓ FLOWING |
| Terminal frame / build-log state | status | worker job-status (remote) or the builder's own status line (local) | Yes; never the repository's build output (WR-02) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Multi-tab upgrade, release, cap, unverified, heartbeat reaping; build frame rules F-1..F-5, WR-02..04, queue D-12; messenger owner routing; logtail owner; remote job wiring | `ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/SocketUpgradeSpec.js spec/jasmine/BuilderStatusFramesSpec.js spec/jasmine/MessengerOwnerSocketSpec.js spec/jasmine/LogTailOwnerSpec.js spec/jasmine/BuilderRemoteJobSpec.js` | `166 specs, 0 failures`, exit 0 (seed 01898) | ✓ PASS |
| 409 retry on build-log atomic updates | in-process probe, fake couch client, no I/O (verifier scratchpad `retry409.js`) | 3/3 PASS, exit 0 | ✓ PASS |
| Toast escaping and nid/type rejection | `npm --prefix services/console/src run test:toast` | 59 `ok`, 0 `not ok` | ✓ PASS |
| NOTIF-02 live | `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` | `WS-MULTITAB OK 2/2 opened`, exit 0 | ✓ PASS |
| NOTIF-01 live | `curl` served LogviewController, sha256 | e556c292…dec59d (unchanged; matches source) | ✓ PASS |
| CI-05 gate | `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK` | ✓ PASS |
| Push pipeline for the fixes | pipeline 5661 on 4fcacece | `CI-GATES PIPELINE OK`, legacy-off (orchestrator-reported; not re-queried here, no pipeline access by rule) | ✓ PASS (reported) |
| Syntax / lint | `node --check` on thinx-core, builder, buildlog, socket_upgrade, both ZZ WebSocket specs; `npx eslint` on the four sources | all ok; eslint exit 0 | ✓ PASS |
| ZZ-WebSocketHandshakeRtmSpec / ZZ-WebSocketLifecycleSpec | run | — | ? SKIP: they need the full bootstrap (config, Redis, CouchDB); CI's ZZ tier covers them. Syntax only |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/check-ws-multitab.js` (phase-declared live probe) | `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` | exit 0, OK 2/2 | PASS |

There are no `scripts/*/tests/probe-*.sh` files for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NOTIF-01 | 43-03 (console code from e43a94d) | Actionable toast escapes `notification.body`; deployed to prod while CI-05 is in effect | ✓ SATISFIED (with operator deviation) | Escape in source and live (hash re-checked); H4 passed. Deployed through the last pre-CI-05 legacy build, not a one-off bypass (skip-bypass) |
| NOTIF-02 | 43-01, 43-03 | Second tab on the same `/<owner>` path is accepted and both receive | ✓ SATISFIED | U1/U2/U6, heartbeat H1/H2, live probe OK 2/2, H1/H3 passed |
| NOTIF-03 | 43-02, 43-03 | Build status frames reach the owner's sockets | ✓ SATISFIED | BuilderStatusFramesSpec (34 blocks) pass; deployed via 5661; H2/H5 passed |

No requirement mapped to Phase 43 is orphaned.

### Prohibitions (judgment tier, resolved by operator, H7)

The operator accepted the 13 verdicts below on 2026-10-13 (43-HUMAN-UAT H7). They were re-checked against the fix commits:

| Plan | Prohibition | Verdict |
|---|---|---|
| 43-01 | No frame to another owner's socket; no iteration of `app._ws`/`wss.clients` for delivery | Not violated: `wss.clients` is iterated only in `heartbeatTick` for ping/terminate; delivery stays `sendToOwner` |
| 43-01 | Port 7442, device HTTP routes and plain MQTT untouched | Not violated: the fixes touch only the heartbeat, builder outcome handling and build-log writes |
| 43-01 | No cookies, session ids or payloads logged in the upgrade path | Not violated: the new heartbeat log line names no socket, owner or cookie |
| 43-02 | No build frame to non-owner sockets | Not violated |
| 43-02 | No raw log lines to owner sockets | Not violated: `processShellData` still sends nothing |
| 43-02 | `messenger.js` and the frame format unchanged | Not violated |
| 43-03 | No push to main, no force-push or PR | Not violated (this verifier pushed nothing) |
| 43-03 | No CircleCI token handling, no trigger from Claude | Not violated |
| 43-03 | At most one `build_legacy_console=true` pipeline; default unchanged | Not violated: zero triggered |
| 43-03 | No change or push to services/console | Not violated |
| 43-03 | No other workstream's source in the push | Not violated |
| 43-03 | No ssh, docker service, or swarm/Traefik edits | Not violated |
| 43-03 | No env dumps, no credentials in probes, no unsigned commits | Not violated |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `lib/thinx/queue.js` | 177 | `TODO: FIXME` | ℹ️ Info | Pre-existing (58562a80), not added by this phase; tracked in `.planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md` |
| `lib/thinx/builder.js` | 420, 532 | Remote OK prunes repositories twice; `readdirSync` unguarded (review IN-05) | ℹ️ Info | Pre-existing, kept out of scope by the review-fix pass. H2's live build completed green |
| `lib/thinx/builder.js` | 633-636 | Local exit 0 records `BUILD_SUCCESS` stats even when the builder printed a failure status | ℹ️ Info | Pre-existing stats behaviour; frames and build-log state are correct (L1) |

The fix commits added no debt markers (`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` grep over added lines: no match).

### Human Verification

All seven items are resolved in `43-HUMAN-UAT.md` (status `complete`, 7/7 passed, updated 2026-10-13T09:00Z, after the last fix commit 4fcacece at 08:08Z):

1. **H1 Two tabs connect:** pass (operator)
2. **H2 Build toasts in both tabs:** pass (operator)
3. **H3 Close one tab:** pass (operator)
4. **H4 Hostile and long actionable body:** pass (operator)
5. **H5 Second account isolation:** pass (operator)
6. **H6 console-retest on rtm:** pass (Claude, unauthenticated, after pipeline 5661; the authenticated Devices page rendered in the operator's session)
7. **H7 Prohibitions review:** pass (operator sign-off)

The UAT record does not name the deployed revision behind H1-H5. Its timestamp is after 4fcacece, and the WR-02..04 changes are proven by specs against the real `Builder` code either way.

### Deferred (operator, not gaps)

- Legacy "THiNX Builder / Click to show build log..." toast shows `undefined` (`services/console/src/app/js/controllers/DevicesController.js:117-118` renders `response.status`, which the build route reply does not carry). Unchanged since 2022, not a Phase 43 regression. Goes to Phase 48 with the Legacy batch.

### Follow-ups (not gaps)

- Check the first Phase 44 `thinx-staging` push with `check-ci-gates.js pipeline --revision <sha> --expect legacy-off`.
- Phase 48 CI-06 rebuilds `thinx/console:swarm` (not refreshed here because of skip-bypass).
- Review info items IN-01 (unverified upgrades not capped), IN-02 (lifecycle spec renamed in effect), IN-04 (Legacy log-overlay tab never subscribes) and IN-05 stay open as recorded in 43-REVIEW.md.

### Gaps Summary

None. Every NOTIF-01..03 code path is present, substantive, wired and deployed. The review fixes (WR-01..04, IN-03) and the 409 retry hold under behavioral tests: 166 local specs, an in-process 409 probe, 59 toast checks. The live checks pass again: multi-tab probe OK 2/2, served-file hash unchanged, CI-05 compile gate OK. Roadmap criterion 2 is still carried by the operator's `skip-bypass` override, and the outcome it was meant to produce is verified directly. Human UAT is complete at 7/7.

---

_Verified: 2026-10-13T09:38:02Z_
_Verifier: Claude (gsd-verifier)_
