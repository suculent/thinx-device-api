---
phase: 43-notification-delivery
plan: 01
subsystem: api
tags: [api, websocket, thinx-core, notifications, multi-tab, ws]

requires:
  - phase: quick 261003-v05 / 261003-vn3
    provides: SocketSession.verifiedOwner/accept and Messenger per-owner subscriptions (subscribeSocket, sendToOwner)
provides:
  - lib/thinx/socket_upgrade.js SocketUpgrade (handle, ownerSocketCount, liveSocketCount, MAX_SOCKETS_PER_OWNER = 10)
  - thinx-core.js upgrade handler delegating to SocketUpgrade.handle (path-keyed socketMap and duplicate guard removed)
  - scripts/check-ws-multitab.js credential-free live probe (WS-MULTITAB OK/FAIL) for 43-03
  - spec/jasmine/SocketUpgradeSpec.js (10 local specs, runs in the CI test job)
affects: [43-02 builder status frames, 43-03 deploy and live proofs, websocket-handshake runbook]

actuals:
  tokens: 13761
  tasks: 3
  commits: 8
plan_head_before: 9dba1e762e3adce8859058c2b6f8ff0336cb951c
plan_head_after: ab3b8db7cc6366921a1833dc6c9b52772f1741cf

tech-stack:
  added: []
  patterns:
    - "Per-connection upgrade tracking: Map<owner, Set<raw socket>>, admit on verified owner, release on the raw socket's own once('close')"
    - "Per-owner cap checked and inserted synchronously in the session-parse callback; refusal is HTTP 429 before the handshake"

key-files:
  created:
    - lib/thinx/socket_upgrade.js
    - spec/jasmine/SocketUpgradeSpec.js
    - scripts/check-ws-multitab.js
  modified:
    - thinx-core.js
    - spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js
    - spec/jasmine/ZZ-WebSocketLifecycleSpec.js
    - .planning/runbooks/websocket-handshake.md

key-decisions:
  - "D-07 cap: 10 live sockets per verified owner (five Legacy tabs x two sockets), refused with HTTP/1.1 429 Too Many Requests (Connection: close, Content-Length: 0) via socket.end before the handshake, one log line naming only the limit"
  - "Upgrade tracking lives in a new module lib/thinx/socket_upgrade.js (not thinx-core.js) so a local spec drives the production handler end to end; owner comes only from SocketSession.verifiedOwner(request)"
  - "SocketUpgrade.handle attaches a no-op 'error' listener on the raw socket: the http server removes its own before emitting 'upgrade', so a reset during the async session parse would otherwise be an uncaught error"
  - "Probe counts a socket as opened when 'open' fires; the later 1008 close is printed but not counted; at most 10 sockets; refuses URLs with credentials, query or fragment"

patterns-established:
  - "Helper-free jasmine harness: real http server + ws noServer + real SocketUpgrade + real SocketSession.accept + Object.create(Messenger.prototype) fakes; fake sessionParser keyed on distinctive x-thx-core values so log scans can prove they never leak"

requirements-completed: [NOTIF-02]

coverage:
  - id: D1
    description: "Two sockets of one owner on the same /<owner> path both connect and each receives every owner frame once; another owner receives nothing; closing one releases only that socket"
    requirement: NOTIF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/SocketUpgradeSpec.js#U1, #U2, #U6"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-owner cap of 10 live sockets; the 11th upgrade gets 429 and one clean log line; other owners unaffected; freed slot reusable"
    requirement: NOTIF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/SocketUpgradeSpec.js#U4"
        status: pass
    human_judgment: false
  - id: D3
    description: "Aborted upgrades (before the session parse returns, or after admission) leave no slot; unverified upgrades are uncounted and close 1008; Cookie without x-thx-core gets 401"
    requirement: NOTIF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/SocketUpgradeSpec.js#U3a, #U3b, #U5"
        status: pass
    human_judgment: false
  - id: D4
    description: "thinx-core.js delegates the upgrade to SocketUpgrade.handle, no path map, connection handler and HTTP listen line unchanged; socket_session.js and messenger.js unchanged"
    requirement: NOTIF-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SocketUpgradeSpec.js#S1; MessengerOwnerSocketSpec (24) and LogTailOwnerSpec (20) green; git diff --quiet origin/thinx-staging -- lib/thinx/socket_session.js lib/thinx/messenger.js"
        status: pass
    human_judgment: false
  - id: D5
    description: "scripts/check-ws-multitab.js prints WS-MULTITAB OK 2/2 opened (exit 0) on per-connection tracking, FAIL 1/2 (exit 1) on the old drop-second-upgrade behaviour, exit 2 on bad usage"
    requirement: NOTIF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/SocketUpgradeSpec.js#U7, #U8; node scripts/check-ws-multitab.js; test $? -eq 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "ZZ-tier specs state the new contract (same-path concurrent open; second raw upgrade on a path gets 101)"
    requirement: NOTIF-02
    verification:
      - kind: other
        ref: "node --check spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js spec/jasmine/ZZ-WebSocketLifecycleSpec.js; grep gates"
        status: pass
    human_judgment: true
    rationale: "ZZ specs need Redis, CouchDB and /mnt/data/conf/config.json and are deleted by split-tests before the CI run, so only static gates ran; the behaviour itself is proven by SocketUpgradeSpec and live by 43-03"
  - id: D7
    description: "Live production behaviour: two tabs of one owner on rtm.thinx.cloud both connect and receive"
    requirement: NOTIF-02
    verification: []
    human_judgment: true
    rationale: "Not deployed in this plan; 43-03 pushes thinx-staging, runs check-ws-multitab against wss://rtm.thinx.cloud and does the two-tab human UAT"

duration: 10min
completed: 2026-10-12
status: complete
---

# Phase 43 Plan 01: Multi-tab WebSocket upgrades Summary

**WebSocket upgrades are now tracked per connection and per verified owner in `lib/thinx/socket_upgrade.js`, so several Legacy tabs of one owner hold sockets on the same `/<owner>` path and all receive owner frames, with a 10-socket-per-owner cap answered `HTTP/1.1 429` and a credential-free `check-ws-multitab` probe for the live check.**

## Performance

- **Duration:** about 10 min of execution (start 2026-10-12T20:55:13Z, end 2026-10-12T21:05Z)
- **Tasks:** 3 of 3
- **Files:** 3 created, 4 modified

## Accomplishments

- `SocketUpgrade.handle` replaces the path-keyed `socketMap` guard in `thinx-core.js`. It keeps the `x-thx-core` 401 rule word for word. It skips sockets whose peer left during the session parse, and adds each verified owner's raw socket to a per-owner Set that the socket's own `close` removes it from (REFACTOR-03, now per connection). `thinx-core.js` keeps the `wss 'connection'` handler, `SocketSession.accept(... messenger: app.messenger ...)`, `app._ws`, the ping interval and the HTTP listen line. Port 7442 and MQTT are untouched (D-15).
- Per-owner cap of 10 live sockets (D-07). The 11th upgrade gets `HTTP/1.1 429 Too Many Requests` before the handshake and exactly one log line: `⚠️ [warning] [ws] upgrade refused: per-owner socket limit (10) reached`. The line carries no cookie, session id, owner or URL. Unverified upgrades are not counted and still close 1008.
- `scripts/check-ws-multitab.js <ws-url>` opens two cookie-less sockets at once on one random non-owner path. It prints `WS-MULTITAB OK 2/2 opened` (exit 0) or `WS-MULTITAB FAIL <k>/2 opened` (exit 1), and exits 2 on a usage error.
- `SocketUpgradeSpec` has 10 specs (U1-U8, U3a/U3b separate, S1), all green. They run against a real ws server/client, the real handler, the real SocketSession and the real Messenger, with no Redis or CouchDB. The spec runs in the CI `test` job.
- The ZZ specs now state the contract: the handshake spec gains a same-path concurrent case, and the lifecycle spec asserts that the second raw upgrade on a path gets `HTTP/1.1 101`. There is also a new runbook section, "Several tabs per owner (Phase 43, NOTIF-02)".

## Task Commits

1. **Task 1 (tracer): two tabs on one path both connect and receive**: `a0c7d89c` (test, RED) and `0247eb2d` (feat, GREEN)
2. **Task 2: per-owner cap, release, unverified sockets uncounted**: `febd700f` (test, RED) and `30f0d7a0` (feat, GREEN)
3. **Task 3: live probe, ZZ specs, runbook**: `cbd1a911` (test, RED), `020b94b5` (feat, GREEN) and `dff73ddc` (test/docs: ZZ specs and runbook)
4. **Lint follow-up**: `ab3b8db7` (fix: drop the now-unused `Util` require in thinx-core.js)

The tracer feedback gate re-ran Task 1's automated verify (SocketUpgradeSpec 2/2, MessengerOwnerSocketSpec plus LogTailOwnerSpec 44/44) and it passed before expansion. Mode: end-of-phase, automated-only verify.

## TDD Gate Compliance

All RED evidence was captured with a TAP reporter for jasmine. The reporter lives in the session scratchpad, not the repo. Each record was classified by `gsd-tools check tdd-red-evidence`:

| Task | RED record | Verdict | Target test | Semantic assessment |
|---|---|---|---|---|
| 1 | `43-01-RED-task1.json` | RED_EVIDENCE_OK (target_test_failed) | U1 | U1 failed on its first assertion because `lib/thinx/socket_upgrade.js` did not exist. S1 failed on the missing `require`. Both fail for the planned reason: the module and the wiring are absent. |
| 2 | `43-01-RED-task2.json` | RED_EVIDENCE_OK (target_test_failed) | U4 | U4 failed on `11th status: expected null to equal 429` because the 11th socket was admitted. U1-U3, U5 and U6 already passed, since Task 1 had shipped tracking and release. Expected. |
| 3 | `43-01-RED-task3.json` | RED_EVIDENCE_OK (target_test_failed) | U7 | U7 failed on the exit-code assertion: node exited 1 because the probe script did not exist. U8 failed on its final-line assertion. This RED comes from the missing script, not from wrong probe logic. That is acceptable for a new CLI. |

## Verification

- Helper-free jasmine runs (`{"spec_dir":"spec/jasmine","helpers":[],"random":false}`):
  - SocketUpgradeSpec: 10 specs, 0 failures, stable over repeated runs
  - SocketUpgradeSpec, MessengerOwnerSocketSpec and LogTailOwnerSpec together: 54 specs, 0 failures
  - CookiePolicySpec and LoggingQualityAuditSpec (they also read thinx-core): 26 specs, 0 failures
- `node --check` is clean on thinx-core.js, lib/thinx/socket_upgrade.js, scripts/check-ws-multitab.js and both ZZ specs.
- Acceptance greps: socket_upgrade require 1; `socketMap` in code 0; `Socket already mapped` 0; HTTP listen line 1; `MAX_SOCKETS_PER_OWNER` 4; `429 Too Many Requests` 1; `redactCookieHeader|x-thx-core` 2; handshake spec `it(` 3; `HTTP/1.1 101` in the lifecycle spec; `check-ws-multitab` in the runbook; probe without a URL exits 2.
- `git diff --quiet origin/thinx-staging -- lib/thinx/socket_session.js lib/thinx/messenger.js` exits 0 (D-06).
- `npx eslint` is clean on every changed file except one pre-existing finding in ZZ-WebSocketLifecycleSpec (see Deferred Issues).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] No-op 'error' listener on the raw upgrade socket**
- **Found during:** Task 1
- **Issue:** Node's http server removes its own socket `error` listener before it emits `upgrade`. The session parse is async (a Redis read), so a TCP reset in that window would be an unhandled `error` event and would crash the API process. The old handler had the same gap.
- **Fix:** `handle()` registers `socket.on("error", () => {})` first. The following `close` releases the slot.
- **Files modified:** lib/thinx/socket_upgrade.js
- **Commit:** 0247eb2d

**2. [Rule 1 - Bug] Unused `Util` require left in thinx-core.js**
- **Found during:** final lint of the changed files
- **Issue:** The 401 cookie rule moved into the module, so `Util` was no longer used in thinx-core.js. eslint reported `no-unused-vars`.
- **Fix:** Removed the require.
- **Files modified:** thinx-core.js
- **Commit:** ab3b8db7

**3. [Rule 2 - Missing critical] 429 sent with `socket.end` and a `Content-Length: 0` header**
- **Found during:** Task 2
- **Issue:** The plan named `HTTP/1.1 429` with `Connection: close`. Calling `write` and then `destroy` right away can drop the response.
- **Fix:** The module uses the ws library's abort pattern instead: `socket.once("finish", destroy)` followed by `socket.end(...)`. The `Content-Length: 0` header makes the client parse the status deterministically. The 401 path is still the verbatim write-and-destroy.
- **Files modified:** lib/thinx/socket_upgrade.js
- **Commit:** 30f0d7a0

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 bug). **Impact:** robustness only, and the plan's contract is unchanged.

## Deferred Issues

- `spec/jasmine/ZZ-WebSocketLifecycleSpec.js`: `const chai = require('chai')` is unused (eslint `no-unused-vars`). It predates this plan, is out of scope and was left as is.

## Known Stubs

None.

## Threat Flags

None. The probe script is the only new outbound surface, and the plan's threat model already lists it (probe script to production, cookie-less).

## Notes for 43-02 / 43-03

- 43-02 must not touch the files from this plan. Builder frames go through `messenger.sendToOwner`, which already reaches every subscribed tab.
- 43-03 runs `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` after the deploy. Expect `WS-MULTITAB OK 2/2 opened`; the pre-deploy baseline is `FAIL 1/2` with `HTTP 502` on the second socket.
- The plan's accepted UI-SPEC item still stands: a tab whose log overlay is open at connect sends `logtail` instead of `init` and is not subscribed until reload.

## Self-Check: PASSED

- FOUND: lib/thinx/socket_upgrade.js, spec/jasmine/SocketUpgradeSpec.js, scripts/check-ws-multitab.js
- FOUND commits on this branch: a0c7d89c, 0247eb2d, febd700f, 30f0d7a0, cbd1a911, 020b94b5, dff73ddc, ab3b8db7 (8 = `git rev-list --count 9dba1e76..HEAD`)
