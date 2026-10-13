---
phase: 43-notification-delivery
verified: 2026-10-13T07:41:29Z
status: human_needed
score: 52/56 must-haves verified
covered_files:
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/43-notification-delivery/43-03-SUMMARY.md"
  - "lib/router.build.js"
  - "lib/thinx/builder.js"
  - "lib/thinx/queue.js"
  - "lib/thinx/socket_upgrade.js"
  - "scripts/check-ws-multitab.js"
  - "spec/jasmine/BuilderStatusFramesSpec.js"
  - "spec/jasmine/SocketUpgradeSpec.js"
  - "spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js"
  - "spec/jasmine/ZZ-WebSocketLifecycleSpec.js"
  - "thinx-core.js"
covered_digest: "v3:sha256:b0e76b5b5f8bc95d042fe8a1f25302e8e0a0445009963b0f9da0de472f42200c"
behavior_unverified: 0
overrides_applied: 4
overrides:
  - must_have: "The escaped toast is live on rtm.thinx.cloud through a one-off legacy console build: CI-05 is bypassed for that one pipeline only, and the next thinx-staging pipeline again builds no legacy console image."
    reason: "Operator replied skip-bypass at the 43-03 Task 2 checkpoint. The outcome holds without the bypass: the served rtm LogviewController.js (built by pipeline 5653, the last legacy build before CI-05) is byte-identical to the console gitlink cfff199 source with <ENV::wssUrl> substituted, sha256 e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d, and carries thinxEscapeHtml. CI-05 was never lifted (build_legacy_console default false; pipeline 5659 legacy-off). The thinx/console:swarm image refresh the bypass would have brought moves to Phase 48 CI-06."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The operator, not Claude, triggers the one-off pipeline with the runbook §4 snippet and their own CircleCI token; Claude then proves it with check-ci-gates.js pipeline --pipeline-id <id> --expect legacy-on --wait and checks that its revision is the pushed HEAD"
    reason: "Same operator decision (skip-bypass): no bypass pipeline exists to prove. Nothing was triggered by Claude or anyone else."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The rebuilt Legacy image is live: after the bypass pipeline, LogviewController's Last-Modified is later than the baseline recorded before the push and the served file still meets the D-04 content checks"
    reason: "Same operator decision (skip-bypass): nothing was rebuilt, so Last-Modified stays Mon, 12 Oct 2026 14:57:11 GMT. The D-04 content checks still pass on the served file (re-checked by the verifier: cmp identical, 5x thinxEscapeHtml)."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
  - must_have: "The next normal thinx-staging push after the bypass runs legacy-off: check-ci-gates.js pipeline --revision <that push> --expect legacy-off prints CI-GATES PIPELINE OK"
    reason: "Same operator decision (skip-bypass): there is no bypass to follow. Pipeline 5659 (normal push of b1126b6c) is legacy-off and CI-GATES COMPILE OK shows thinx-staging selects no console-classic job with the parameter false. The first Phase 44 push should still be checked with --expect legacy-off."
    accepted_by: "operator (Matej Sychra), skip-bypass reply at 43-03 checkpoint"
    accepted_at: "2026-10-13"  # recorded in 43-03-SUMMARY (completed 2026-10-13T07:40Z); exact reply time not recorded
human_verification:
  - test: "H1 (D-16, NOTIF-02): log in at https://rtm.thinx.cloud in two tabs of one browser (same owner); DevTools > Network > WS in both"
    expected: "Each tab's wss://rtm.thinx.cloud/<owner> socket answers 101 and stays open"
    why_human: "Needs a real authenticated owner session; the verifier sends no cookies or credentials"
  - test: "H2 (D-16, NOTIF-03, F-1, F-2): in tab 1 start a build for a device that already has a build in its history"
    expected: "Both tabs show Build Status toasts Pulling repository, Building..., Completed: at most three per tab, no second Completed. On failure each tab shows one red toast with the reason and nothing green after it"
    why_human: "Needs a real build on production workers and two live browser tabs"
  - test: "H3 (D-16, D-05): close tab 1, start another build from tab 2"
    expected: "Tab 2 still receives its Build Status toasts"
    why_human: "Live multi-tab browser behaviour against production"
  - test: "H4 (D-16, NOTIF-01, E1 overflow): from a test device or an MQTT client with that device's credentials, send an actionable notification with body <img src=x onerror=alert(1)><b>hi</b> (and one long body)"
    expected: "Both tabs show the literal text, no image, no bold, no alert; a long body wraps inside the toast. Answering in one tab collapses only that tab's buttons; answering in both sends two replies (accepted)"
    why_human: "Needs device credentials and a visual check of toast rendering/wrapping"
  - test: "H5 (D-16, D-08, D-12): if a second account is available, keep its console open in another browser during H2 and H4"
    expected: "The second account's console shows none of those toasts"
    why_human: "Needs a second real account"
  - test: "H6 (D-16): run the console-retest project skill against https://rtm.thinx.cloud/"
    expected: "Served LogviewController carries thinxEscapeHtml, websocket target wss://rtm.thinx.cloud/..., no cookie or owner debug logging, Devices page renders"
    why_human: "Authenticated browser session against production"
  - test: "H7 (prohibitions): review the 13 judgment-tier prohibitions (43-01 x3, 43-02 x3, 43-03 x7), all flagged"
    expected: "Operator accepts the verifier's non-authoritative 'not violated' verdicts in the Prohibitions table"
    why_human: "Judgment-tier prohibitions need explicit human resolution (ADR-550 D4)"
---

# Phase 43: Notification Delivery Verification Report

**Phase Goal:** Device notifications reach every open console of their owner, build status included, and a device can no longer inject markup into the owner's console toast. The escaped toast is live in production now, not at milestone close.
**Verified:** 2026-10-13T07:41:29Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Operator Deviation: criterion 2 (skip-bypass)

The operator replied `skip-bypass` at the 43-03 Task 2 checkpoint, so the one-off `build_legacy_console=true` pipeline of roadmap success criterion 2 never ran. The criterion is recorded as **satisfied in outcome, with an operator-accepted deviation**, not as a gap:

- The verifier fetched `https://rtm.thinx.cloud/app/js/controllers/LogviewController.js` (HTTP/2 200, 12538 bytes, ETag `"6accf547-30fa"`, Last-Modified `Mon, 12 Oct 2026 14:57:11 GMT`). sha256 is `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d`. `cmp` against `services/console/src/app/js/controllers/LogviewController.js` at gitlink `cfff199` (with `<ENV::wssUrl>` replaced by `wss://rtm.thinx.cloud`) found the files identical. The served file contains `thinxEscapeHtml` 5 times.
- Production is therefore already serving the escape (from pipeline 5653, the last legacy build before CI-05).
- CI-05 was never lifted. `build_legacy_console` has `default: false`, `check-ci-gates.js compile` printed `CI-GATES COMPILE OK`, and pipeline 5659 printed `CI-GATES PIPELINE OK 5659` (legacy-off, no Snyk job).
- What did not happen: the `thinx/console:swarm` image was not rebuilt from the current base image. That refresh moves to Phase 48 CI-06, which re-enables the legacy build anyway.

The four must-haves that depend on the bypass are carried as `PASSED (override)`. Their override entries are in the frontmatter.

## Goal Achievement

### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | A device-supplied `notification.body` containing HTML shows as literal text in the actionable toast | ✓ VERIFIED | `LogviewController.js:11` `thinxEscapeHtml` escapes `& < > " ' \``; the actionable path uses `thinxEscapeHtml(msg.body)` and `thinxEscapeHtml(msg.title)` (`:254-255`) and the nid passes `^[A-Za-z0-9_-]{1,128}$`. `npm run test:toast` gave 59 `ok`, 0 fail, exit 0. The served rtm file is byte-identical to the source |
| SC2 | Escaped toast live on rtm through a one-off legacy build, CI-05 bypassed once, next pipeline legacy-off | ✓ PASSED (override) | Override: operator `skip-bypass`. The outcome (escape live, CI-05 in effect) was verified directly; see the section above |
| SC3 | Two Legacy tabs on one `/<owner>` path both connect and both receive; closing one leaves the other receiving | ✓ VERIFIED | `SocketUpgradeSpec` U1, U2 and U6 passed locally (see spot-checks). The live probe `check-ws-multitab.js wss://rtm.thinx.cloud` printed `WS-MULTITAB OK 2/2 opened` (exit 0). The live browser check is H1/H3 |
| SC4 | A running build's status frames reach the owner's open console sockets and no other owner's | ✓ VERIFIED | `builder.js` `notify` → `messenger.sendToOwner(notifiers.owner, …)` with the owner bound by `run_build` from `br.owner` (`consoleNotifiers`). `BuilderStatusFramesSpec` T1, T3, Q2 (owner A reaches A's sockets only; B gets nothing) passed. The live check is H2/H5 |

### Plan 43-01 must-haves (NOTIF-02)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Two upgrades on one `/<owner>` path both reach 101 and both receive each owner frame once | ✓ VERIFIED | SocketUpgradeSpec U1, U6 pass |
| 2 | Closing one socket releases only it; count drops by one; messenger Set loses only that socket | ✓ VERIFIED | U2 passes; `_track` uses `socket.once("close")`, `_release` deletes only that socket |
| 3 | Another owner's socket receives nothing | ✓ VERIFIED | U1 (B receives nothing) |
| 4 | Mid-flight teardown leaves no slot | ✓ VERIFIED | U3a (delayed parse), U3b pass; `_admit` refuses destroyed/unwritable sockets before tracking |
| 5 | Cap 10 per owner, 11th gets 429 with one log line, no cookie/session id; slot reusable | ✓ VERIFIED | `MAX_SOCKETS_PER_OWNER = 10`, sync check+insert, `socket.end("HTTP/1.1 429 …")`; U4 passes |
| 6 | Unverified upgrades not counted, closed 1008; cookie without x-thx-core gets 401 | ✓ VERIFIED | U5 passes; 401 path retained in `_admit` |
| 7 | thinx-core delegates `upgrade` to SocketUpgrade.handle; path map and its guard gone; connection still calls `SocketSession.accept` with `messenger: app.messenger` | ✓ VERIFIED | `thinx-core.js:490-494`, `:564-568`; the diff removes `socketMap`; S1 passes |
| 8 | `check-ws-multitab.js` prints OK 2/2 (exit 0) or FAIL k/2 (exit 1) | ✓ VERIFIED | U7/U8 pass. The live run printed OK 2/2, exit 0 |
| 9 | ZZ handshake spec keeps 2 cases and gains a same-path case; lifecycle spec re-expressed; `node --check` clean | ✓ VERIFIED | 3 and 1 `it(` blocks; `node --check` ok for both (ZZ tier not run, see spot-checks) |
| 10 | E3 empty: no sockets, sendToOwner returns 0 | ✓ VERIFIED | `messenger.js:397` returns 0 when there is no Set; BuilderStatusFramesSpec T4b |
| 11 | E3 loading: subscribe on `{init}`; nothing replayed | ✓ VERIFIED | `socket_session.js:98` → `initWithOwner` → `subscribeSocket`; sendToOwner keeps no buffer |
| 12 | E3 error: over-cap refusal, one log line, no UI effect | ✓ VERIFIED | U4 |
| 13 | E3 populated (same as 1-3) | ✓ VERIFIED | U1, U2 |
| 14 | Concurrency: same-tick upgrades accepted up to the cap; one close never unregisters another | ✓ VERIFIED | U6, U2 |

### Plan 43-02 must-haves (NOTIF-03)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Every frame goes through `sendToOwner(owner, {notification})`, owner bound from `br.owner`; caller-supplied owner ignored | ✓ VERIFIED | `builder.js:142-153`, `:863`; T3, T5 |
| 2 | Router passes `{ messenger: app.messenger }` with no sockets map; queue passes `{ messenger: this.messenger }` | ✓ VERIFIED | `router.build.js` diff; `queue.js` constructor and runNext; T2, S1, Q1, S3. `app.messenger` is set at `thinx-core.js:153`, before `new Queue` at `:299` |
| 3 | Frame shape unchanged (`{"notification":{"title":"Build Status","body":…` + type, udid, build_id) | ✓ VERIFIED | `buildNotification` unchanged; F1c |
| 4 | Progress bodies `Pulling repository`, `Building...` (success) frozen; Legacy keys on them and `Completed` | ✓ VERIFIED | `builder.js:938`, `:1291`; `LogviewController.js:211-213` |
| 5 | F-1: exactly one Completed per build_id, no `OK` frame | ✓ VERIFIED | `terminalFrameSent` dedupe; F1a, F1b |
| 6 | F-2: one error frame with its reason, nothing green after; guard frame type error; null-safe `processExitData` | ✓ VERIFIED | F2a, F2a', F2b, F2c, F2d |
| 7 | F-3: terminal Completed carries build_id | ✓ VERIFIED | `wsOK` removed; F1a |
| 8 | F-4/D-10: raw log lines never sent to sockets | ✓ VERIFIED | `processShellData` has no send; F4, S2 |
| 9 | F-5/D-12: build of A (route or queue) reaches only A | ✓ VERIFIED | T1, Q2 |
| 10 | Builder never logs a frame; no subscribers costs nothing | ✓ VERIFIED | `notify` has no log; T4b |
| 11-19 | E2 empty/loading/error/populated/partial/overflow/zero-one-many, E3 empty, concurrency | ✓ VERIFIED | Q2, F1c, F2*, F1a, P1, F4, T1, T4b, E (concurrent builds, closed socket pruned), M1 (bounded memory) |

### Plan 43-03 must-haves (deploy and live proof)

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | Push carries only Phase 43 commits; all signed; no merges; outside `.planning/` and root `*.md` only the 10 phase files; main unchanged | ✓ VERIFIED | `7cec687b..b1126b6c`: 21 commits `G`, 0 merges, paths = 10 phase files + `README.md`. `ls-remote` main `14c08c1f`, thinx-staging `b1126b6c` |
| 2 | Push pipeline ran test, api-registry, vue-console-registry, no snyk/console-classic | ✓ VERIFIED | Verifier ran `check-ci-gates.js pipeline --revision b1126b6c… --expect legacy-off`: `CI-GATES PIPELINE OK 5659` |
| 3 | NOTIF-02 live (FAIL 1/2 before, OK 2/2 after) | ✓ VERIFIED | After state reproduced by the verifier: OK 2/2, exit 0. The "before" FAIL 1/2 is SUMMARY-recorded and can no longer be observed |
| 4 | D-14: console submodule unchanged, no `src` commit since ff6e809, e43a94d ancestor | ✓ VERIFIED | gitlink `cfff199` = console HEAD; `git log ff6e809..cfff199 -- src` empty; e43a94d is an ancestor; `git diff 9dba1e76 HEAD -- services/console` empty |
| 5 | Served LogviewController contains the escape and equals the source (wss substituted) | ✓ VERIFIED | Verifier `cmp`: identical; sha256 e556c292…dec59d |
| 6 | Operator triggers one-off pipeline; Claude proves legacy-on | ✓ PASSED (override) | skip-bypass |
| 7 | Rebuilt Legacy image live (newer Last-Modified) | ✓ PASSED (override) | skip-bypass; Last-Modified unchanged, content checks pass |
| 8 | `test:toast` prints only ok lines | ✓ VERIFIED | 59 ok, 0 fail, exit 0 |
| 9 | CI-05 back in effect (default false; compile OK) | ✓ VERIFIED | `.circleci/config.yml:15-17`; `CI-GATES COMPILE OK` |
| 10 | Vue non-issue (no `new WebSocket`, `v-html`, `notification.body`) | ✓ VERIFIED | grep exit 1 (no match) |
| 11 | messenger.js, socket_session.js, services/console unchanged; device port, device routes, MQTT untouched | ✓ VERIFIED | `git diff --quiet 9dba1e76 HEAD -- services/console lib/thinx/messenger.js lib/thinx/socket_session.js` exit 0. The thinx-core diff only touches the upgrade/connection region |
| 12 | E1 loading: toast only on frame arrival | ✓ VERIFIED | Toasts are created only in the socket message handler |
| 13 | E1 error: bad nid / bad type shows no toast | ✓ VERIFIED | test:toast nid and type rejection cases |
| 14 | E1 overflow: long body wraps inside the toast | ? UNCERTAIN | Visual; routed to H4 |
| 15 | E1 long-text: HTML body/title render as literal text | ✓ VERIFIED | test:toast hostile body/title cases |
| 16 | rtm: real build toasts in both tabs (backstop) | ? insufficient_spec | Backstop truth; H2 |
| 17 | rtm: at most three Build Status toasts per tab (backstop) | ? insufficient_spec | Backstop truth; H2 |
| 18 | rtm: closing one tab leaves the other receiving (backstop) | ? insufficient_spec | Backstop truth; H3 |
| 19 | Next normal push after the bypass is legacy-off (backstop) | ✓ PASSED (override) | skip-bypass; 5659 legacy-off. Check the first Phase 44 push |

**Score:** 52/56 must-haves verified (4 of them by operator override). 4 are human-only (1 visual, 3 backstop). 0 are present but behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/thinx/socket_upgrade.js` | Per-owner tracking, cap, 429, close release | ✓ VERIFIED | 118 lines; wired from `thinx-core.js:311,490-494` |
| `thinx-core.js` | Upgrade delegates to SocketUpgrade | ✓ VERIFIED | `node --check` ok; unused `Util` require removed and no `Util.` use remains |
| `spec/jasmine/SocketUpgradeSpec.js` | Local proof D-05/D-07/D-08 | ✓ VERIFIED | 10 specs, pass |
| `scripts/check-ws-multitab.js` | Credential-free live probe | ✓ VERIFIED | Live OK 2/2 |
| `lib/thinx/builder.js` | consoleNotifiers, notify via sendToOwner, F-1..F-4 | ✓ VERIFIED | `wsOK`, `sendNotificationIfSocketAlive`, `buildStatusNotification` removed |
| `lib/router.build.js` | `{ messenger: app.messenger }` | ✓ VERIFIED | `existing_sockets` removed |
| `lib/thinx/queue.js` | `this.messenger`, notifiers in runNext | ✓ VERIFIED | Replaces `[]` |
| `spec/jasmine/BuilderStatusFramesSpec.js` | F-1..F-5, D-12 proof | ✓ VERIFIED | 24 specs, pass |

The `verify.artifacts` query gave 4/4 for 43-01 and 4/4 for 43-02.

### Key Link Verification

`verify.key-links` returned 0/3 for both plans. All six failures were the tool's own parse limit ("from: must be a relative file path"), not missing wiring. Each link was checked by hand:

| From | To | Via | Status |
|---|---|---|---|
| thinx-core `server.on('upgrade')` | `SocketUpgrade.handle` | `new SocketUpgrade({ wss, sessionParser })` (`thinx-core.js:490-494`) | ✓ WIRED |
| `SocketUpgrade._admit` (verified, under cap) | wss `connection` → `SocketSession.accept` → `{init}` → `initWithOwner` → `subscribeSocket` | `wss.handleUpgrade` + `wss.emit("connection")`; `socket_session.js:98`; `messenger.js:1187` | ✓ WIRED |
| raw socket `close` | owner slot Set | `socket.once("close", …)` in `_track` | ✓ WIRED |
| router `build()` / queue `runNext()` | `Builder.build` → `run_build` | `{ messenger: app.messenger }` / `{ messenger: this.messenger }` | ✓ WIRED |
| `run_build` | notify / processExitData / processShellData | `consoleNotifiers(notifiers, br.owner)` passed to `runShell` and `dispatchRemoteBuild` (opts.notifiers) | ✓ WIRED |
| `Builder.notify` | `Messenger.sendToOwner` → owner's subscribed sockets | `builder.js` notify | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Legacy toast (LogviewController) | `msg` | owner WebSocket frame `msgBody.notification` (`:185`) | Yes, from `sendToOwner` and the device/MQTT path | ✓ FLOWING |
| Build Status frame | owner, build_id, udid | `br.owner` from `Builder.build` buildRequest (`builder.js:1541-1553`) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Multi-tab upgrade, release, cap, unverified, probe, wiring; build frame rules F-1..F-5, queue D-12; messenger owner routing | `COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy node_modules/.bin/jasmine --config=<helper-free config: SocketUpgradeSpec, BuilderStatusFramesSpec, MessengerOwnerSocketSpec>` | `58 specs, 0 failures` (10 + 24 + 24), exit 0 | ✓ PASS |
| Toast escaping and nid/type rejection | `npm --prefix services/console/src run test:toast` | 59 `ok`, 0 fail, exit 0 | ✓ PASS |
| NOTIF-02 live | `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` | `WS-MULTITAB OK 2/2 opened`, exit 0 | ✓ PASS |
| NOTIF-01 live | `curl` served LogviewController + `cmp` against source with wss substituted | identical; sha256 e556c292…dec59d | ✓ PASS |
| CI-05 gate | `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK` | ✓ PASS |
| Push pipeline | `node scripts/check-ci-gates.js pipeline --revision b1126b6c… --expect legacy-off` (read-only) | `CI-GATES PIPELINE OK 5659` | ✓ PASS |
| ZZ-WebSocketHandshakeRtmSpec / ZZ-WebSocketLifecycleSpec | `node --check` | ok | ? SKIP (run): they need the full bootstrap (`/mnt/data/conf/config.json`, Redis, CouchDB), and the CI entrypoint skips the ZZ tier. Syntax only |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/check-ws-multitab.js` (phase-declared live probe) | `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` | exit 0, OK 2/2 | PASS |

There are no `scripts/*/tests/probe-*.sh` files for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NOTIF-01 | 43-03 (console code from e43a94d) | Actionable toast escapes `notification.body`; deployed to prod while CI-05 is in effect | ✓ SATISFIED (with operator deviation) | Escape in source and live. The deploy happened through the last pre-CI-05 legacy build, not a one-off bypass (skip-bypass) |
| NOTIF-02 | 43-01, 43-03 | Second tab on the same `/<owner>` path is accepted and both receive | ✓ SATISFIED | Specs U1/U2/U6 and the live probe. Browser check is H1/H3 |
| NOTIF-03 | 43-02, 43-03 | Build status frames reach the owner's sockets | ✓ SATISFIED | BuilderStatusFramesSpec; deployed via 5659. Live build check is H2 |

No requirement mapped to Phase 43 is orphaned (REQUIREMENTS.md maps only NOTIF-01..03 here). REQUIREMENTS.md already marks all three `[x]` ahead of this verification; that is informational.

### Prohibitions (judgment tier, all flagged; non-authoritative LLM verdicts)

| Plan | Prohibition | Verifier verdict (non-authoritative) |
|---|---|---|
| 43-01 | No frame to another owner's socket; no iteration of `app._ws`/`wss.clients` for delivery | Not violated: `wss.clients` is iterated only for ping/terminate (`thinx-core.js:497-498`); delivery stays `sendToOwner` |
| 43-01 | Port 7442, device HTTP routes and plain MQTT untouched | Not violated: the thinx-core diff covers only the upgrade/connection region |
| 43-01 | No cookies, session ids or payloads logged in the upgrade path | Not violated: the 429 line names only the limit; the 401 line uses `Util.redactCookieHeader` (cookie names only, values `<redacted>`, unchanged from before) |
| 43-02 | No build frame to non-owner sockets | Not violated: `sendToOwner(notifiers.owner)` only, owner bound from `br.owner` |
| 43-02 | No raw log lines to owner sockets | Not violated: `processShellData` sends nothing (F4) |
| 43-02 | `messenger.js` and the frame format unchanged | Not violated: `messenger.js` diff is empty; `buildNotification` is unchanged |
| 43-03 | No push to main, no force-push or PR | Not violated: main is still `14c08c1f` |
| 43-03 | No CircleCI token handling, no trigger from Claude | Not violated: nothing was triggered (skip-bypass) |
| 43-03 | At most one `build_legacy_console=true` pipeline; default unchanged | Not violated: zero triggered; default false |
| 43-03 | No change or push to services/console | Not violated: gitlink unchanged |
| 43-03 | No other workstream's source in the push | Not violated: only the 10 phase files + README.md (root `*.md`, allowed) |
| 43-03 | No ssh, docker service, or swarm/Traefik edits | Not violated per SUMMARY; the verifier did none either |
| 43-03 | No env dumps, no credentials in probes, no unsigned commits | Not violated: probe is cookie-less; 21/21 commits `G` |

These go to the operator as H7.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `lib/thinx/queue.js` | 177 | `TODO: FIXME` | ℹ️ Info | Pre-existing (58562a80, 2026-09-28), not added by this phase. Tracked in `.planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md` |

The phase added no debt markers, stubs or empty handlers (grep over the added lines of the phase diff).

### Human Verification Required

These are the six D-16 checks from 43-03-SUMMARY "Pending Human UAT" plus the prohibitions review. All are tracked in `43-HUMAN-UAT.md`.

1. **H1 Two tabs connect.** Log in to rtm.thinx.cloud in two tabs. Expected: both owner sockets answer 101 and stay open.
2. **H2 Build toasts in both tabs.** Start a build. Expected: Pulling repository, Building..., Completed in both tabs, at most three per tab; on failure one red toast and nothing green after it.
3. **H3 Close one tab.** Close tab 1 and build again from tab 2. Expected: tab 2 still receives.
4. **H4 Hostile and long actionable body.** Send `<img src=x onerror=alert(1)><b>hi</b>`. Expected: literal text, no alert, long text wraps.
5. **H5 Second account isolation.** Expected: the other owner sees none of the toasts.
6. **H6 console-retest skill on rtm.** Expected: escape served, wss target correct, no sensitive logging, Devices renders.
7. **H7 Prohibitions review.** Expected: the operator accepts the 13 non-authoritative verdicts above.

### Follow-ups (not gaps)

- Check the first Phase 44 `thinx-staging` push with `check-ci-gates.js pipeline --revision <sha> --expect legacy-off`.
- Phase 48 CI-06 rebuilds `thinx/console:swarm`, which this phase did not refresh (skip-bypass).

### Gaps Summary

There are no gaps. All code paths for NOTIF-01..03 are present, substantive, wired and deployed. 58 local specs and 59 toast checks pass. Three live read-only checks pass: the multi-tab probe, the served-file byte match, and the pipeline/gate checks. Roadmap criterion 2's one-off legacy pipeline was skipped by operator decision (`skip-bypass`). The outcome it was meant to produce, the escaped toast live on rtm with CI-05 still in effect, holds, so the criterion is carried by override rather than as a gap. The phase waits only on the seven human checks.

---

_Verified: 2026-10-13T07:41:29Z_
_Verifier: Claude (gsd-verifier)_
