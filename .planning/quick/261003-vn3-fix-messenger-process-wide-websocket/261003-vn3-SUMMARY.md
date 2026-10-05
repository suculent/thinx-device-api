---
phase: quick-261003-vn3
plan: 01
status: complete
subsystem: messenger-websocket
tags: [security, websocket, messenger, ownership, mqtt, tdd, jasmine]
requirements: [T-v05-07]
dependency_graph:
  requires: [quick-261003-v05 (SocketSession, ws.owner), quick-261003-vbg (withAcceptedDevice, transfer binding)]
  provides: [Messenger#subscribeSocket, Messenger#unsubscribeSocket, Messenger#subscriberCount, Messenger#sendToOwner, SocketSession registry close cleanup]
  affects: [lib/thinx/messenger.js console writers, lib/thinx/socket_session.js accept, classic console notification toasts]
tech_stack:
  added: []
  patterns: [per-owner subscription Map keyed by verified socket owner, single send helper with prune-on-send]
key_files:
  created:
    - spec/jasmine/MessengerOwnerSocketSpec.js
  modified:
    - lib/thinx/messenger.js
    - lib/thinx/socket_session.js
    - spec/jasmine/MessengerOwnershipSpec.js (fixture only)
    - .planning/todos/completed/2026-10-03-messenger-websocket-is-process-wide.md (moved, uncommitted)
    - .planning/todos/pending/2026-10-03-console-notification-delivery-gaps.md (new, uncommitted)
    - .planning/WINDOWS.md (2 entries, uncommitted)
decisions:
  - "Console frames are routed per verified owner through Messenger subscriptions joined only by initWithOwner; mismatched sockets are refused (socket_owner_mismatch)"
  - "Composition with vbg: check-in/out and actionable frames go to the owner withAcceptedDevice accepted the message as (doc.owner), never to a topic owner that does not own the device"
  - "Slack RTM messages have no owner and are dropped; user/text are no longer logged"
metrics:
  duration: ~35 min
  completed: 2026-10-04
estimate:
  tokens: 95000
  tasks: 3
actuals:
  tokens: 10400
  tasks: 3
  commits: 3
plan_head_before: 94f846e2a11df7ac4c28b3bc15fbd19613afc69f
plan_head_after: 63716bae7bed85e1df28f382253ec8486fb8fc97
---

# Quick 261003-vn3: Messenger per-owner WebSocket routing Summary

Every messenger console frame now goes only to the init-subscribed sockets of the owner it belongs to. The process-wide `_socket` is gone, closed sockets leave both the messenger subscriptions and `app._ws`, and ownerless frames (including Slack RTM messages) are dropped with a payload-free log line.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `313d3335` | test(quick-261003-vn3): failing spec for per-owner messenger websocket routing |
| 2 | `54c04622` | fix(quick-261003-vn3): route messenger console frames to the owner's subscribed sockets |
| 3 | `63716bae` | fix(quick-261003-vn3): drop closed connections from the websocket registry |

Task 3 (todo move, gaps todo) was done on disk and is **not committed**, per the orchestrator constraint.

## Prerequisites in messenger.js

`git log -3 -- lib/thinx/messenger.js` before the first edit: `11605dfc`, `e6367b80` (261003-vbg, landed), `485826d4`. **261003-vep had not landed.** vbg's `withAcceptedDevice`, the transfer binding, the topic helpers and the drop-log limiter were left as they were. Only the sends inside vbg's callbacks were replaced. No second owner compare was added to `processStatus`, because vbg's compare is already there. The signatures are vbg's (`processStatus(oid, did, message, drop)` and `processActionableNotification(oid, did, topic, message, drop)`); only `processUnknownNotification` gained a trailing `oid`. The spec calls them with vbg's argument order.

## RED evidence

`MessengerOwnerSocketSpec.js` on unfixed code: **24 specs, 22 failures**, all AssertionErrors:
- the writers threw `TypeError … reading 'OPEN'` inside `not.throw`
- `typeof m.subscriberCount` was `'undefined'`
- the Slack frame was delivered to the last-init socket (W6)
- S1 found `._socket`
- G1-G3 found registry entries surviving close

W2 and S2 passed on RED, as expected: vbg already drops foreign devices, and v05's wiring was in place.

## Design

- **Subscriptions:** `this._ownerSockets`, a Map from owner to a Set of sockets. `_subscriptions()` creates it lazily, so prototype-built instances work.
- **Joining:** `subscribeSocket(owner, ws)` requires a non-empty string owner, an object with a `send` function, and `ws.owner === owner` (the owner SocketSession verified). It attaches one close listener per new socket (`once`, else `on`). Its only caller is `initWithOwner`, and the only production caller of that is `SocketSession.onMessage(ws.owner, ws)`.
- **Init:** for a non-null socket that fails `subscribeSocket`, `initWithOwner` logs `init refused: socket not bound to this owner` and answers `(false, "socket_owner_mismatch")` before any MQTT work. The null/undefined socket branch is unchanged, so MessengerSpec's test-mode null init still continues and subscribes nothing.
- **Sending:** `sendToOwner(owner, notif)` is the only `.send(` in messenger.js. It serializes once and sends to OPEN (`WEBSOCKET_OPEN = 1`) sockets. Non-OPEN sockets and sockets whose `send` throws are pruned; the throw logs `console send failed; socket dropped` with no payload or error text. An empty owner entry is deleted. A missing, non-string or empty owner logs `console message dropped: no owner`. A valid owner with no subscribers is silent.
- **Owner per writer:** check-in/out and actionable frames use the owner `withAcceptedDevice` hands back (vbg: `doc.owner`). Connection-change and unknown-message frames use the strict topic owner `oid`.
- **Slack RTM 'message':** one line, `Slack RTM message dropped: no owner to route to`. The user and text are no longer logged.
- **Registry:** `SocketSession.accept` stores the entry under `key` and deletes `registry[key]` on close only while it still points at this `ws`. It captures the registry object at accept time.

## Writer audit

| Writer | Owner | Action |
|---|---|---|
| messenger: Slack RTM 'message' | none (Slack event) | dropped with a log line (dormant, `DISABLE_SLACK = true`) |
| messenger: check-in/out (processStatus) | owner accepted by vbg's `withAcceptedDevice` | `sendToOwner(owner)` |
| messenger: connected/disconnected (processConnectionChange) | topic owner | `sendToOwner(oid)` |
| messenger: actionable (processActionableNotification) | owner accepted by vbg | `sendToOwner(owner)`, sent before topic/done are attached, as before |
| messenger: unknown debug notice (processUnknownNotification) | topic owner | `sendToOwner(oid)` |
| builder `notify`/`wsOK` → `notifiers.websocket` | session owner | unchanged; `app.existing_sockets` is never filled (gaps todo 3) |
| device.js transformer "checkin" frame | none | unchanged; undeclared `websocket`, never sends |
| buildlog `wsSend`/`setupTail` | arriving connection (v05) | unchanged |
| notifier.js / redis-health.js `.send(` | n/a | Slack webhooks, not sockets |
| thinx-core.js | n/a | untouched; writes no frames |

**`OPEN` TypeError finding:** three of the old writers compared `readyState` with `this.socket.OPEN`, where `this.socket` was always null. Once any socket had sent init they threw `TypeError: Cannot read properties of null (reading 'OPEN')`, so no notification frame was ever delivered and the cross-owner delivery was latent. RED reproduces this (R1, W1, W3-W5, E1-E4).

## Who is affected

- **(a)** Classic console users with the dashboard open (owner connection, init sent).
  - **Before:** no notification frame was ever delivered, because the writers threw the `OPEN` TypeError.
  - **After:** they receive their own owners' frames only. In production only `notification` messages get past the forwardNonNotification throw (gaps todo item 1), so the visible change there is "Device Interaction" (actionable) toasts starting to appear for the owner's own devices.
- **(b)** Other owners' consoles never receive another owner's frames. The latent cross-owner delivery is closed.
- **(c)** Several sockets of one owner that sent init each receive every frame once. A second tab on the identical `/<owner>` path is still refused at upgrade (pre-existing; gaps todo item 2).
- **(d)** Log connections (`/<owner>/<ts>`): unchanged, and no notification frames.
- **(e)** Slack RTM (disabled today): messages are no longer forwarded to any console.
- **(f)** Build status: unchanged; it never reached a socket (gaps todo item 3).
- **(g)** MQTT clients per owner, Redis actionable storage and device status edits: unchanged.

## Recommended operator checks after deploy

These are read-only. Use node-local `docker logs` on the node running the `thinx_api` task (see MEMORY swarm topology).
1. In the classic console on https://rtm.thinx.cloud/, open the dashboard. The API log has no `init refused: socket not bound to this owner` line for that minute.
2. Over a few hours, compare the count of `reading 'OPEN'` TypeErrors before and after the deploy. It should drop to zero.
3. Logged in as two different owners in two browsers, neither sees the other's toasts.

## Verification

- **Task 1 verify** (plan block verbatim): `MSGR`: 21 specs, 0 failures. Regression set (LogTailOwner, SecretsSweep, DeviceRegisterOwner, BuildLogOwner, CsrfRouteInventory, LoggingQualityAudit, Util, MeshSessionAuth, CookiePolicy): **271 specs, 0 failures**. Printed `VN3-MSGR-GREEN`.
- **Task 2 verify** (verbatim): full MessengerOwnerSocketSpec plus the same set: **295 specs, 0 failures**. Printed `VN3-WSREG-GREEN`.
- **Orchestrator regression set** (MessengerOwnerSocket, ApikeyExactMatch, BuildLogOwner, CsrfRouteInventory, DeviceOwnership, DevicePushOwner, DeviceRegisterOwner, MeshSessionAuth, TransferApiKey, DeviceOtt, LogTailOwner, MessengerOwnership, GoogleOAuthState, GitHubOAuthIsolation, Util) in one process: **463 specs, 0 failures**, exit 0.
- **Union** of the above with SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka and CookiePolicy: **586 specs, 0 failures**, exit 0.
- **Random order** (MessengerOwnerSocket + MessengerOwnership, 3 runs): 63 specs, 0 failures each time.
- **ESLint:** clean on messenger.js, socket_session.js and both specs. No `fit`/`fdescribe`/`xit`/`xdescribe`. thinx-core.js is unchanged.
- **Not run locally:** MessengerSpec (needs Redis, CouchDB and the broker; runs in CI). Its `initWithOwner(test_owner, null)` takes the unchanged null branch. ZZ-WebSocketHandshakeRtmSpec, ZZ-WebSocketLifecycleSpec and ZZ-LogTailWebSocketSpec are not run in CI and are recorded as `unrun-verify` in WINDOWS.md.

## Deviations from Plan

1. **[Adaptation to vbg] Frame owner for check-in/out and actionable frames.** The plan (written before vbg) said `sendToOwner(oid)` after an `isOwnedBy(body, oid)` check. vbg's `withAcceptedDevice` already does the owner check, and it also accepts a transfer-bound device on its previous owner's topic, acting as `doc.owner` (operator decision 2026-10-03). Sending to `oid` would send the current owner's device alias to the previous owner, which violates T-vn3-03 and the plan's truth. Dropping the frame would break vbg's pinned T9 ("a bound check-in notifies"). So the frame goes to the accepted owner, which equals `oid` for owned devices. New spec case **W2b** pins this. It is the one routing choice the plan did not spell out; see Open questions.
2. **[Rule 3 - blocking] MessengerOwnershipSpec fixture.** vbg's fixture set `m._socket`/`m.socket`, which no longer exist. It now subscribes one recording socket per owner (A/B/C) via `subscribeSocket`, all recording into `rec.sent`, so vbg's frame-count assertions are unchanged. This is fixture-only and was committed with the messenger fix (`54c04622`) so no commit leaves a red spec.
3. **[Precondition/S2 spelling]** v05 calls `const owner = ws.owner; ctx.messenger.initWithOwner(owner, ws, …)`, so the plan's literal precondition grep `initWithOwner\(\s*ws\.owner\s*,\s*ws` fails, although the code is equivalent. S2 accepts either spelling. thinx-core's `messenger: app.messenger` matched as written.
4. **[Added cases]** R4b (a socket whose `send` throws is dropped with a payload-free line) and W2b (above). These go beyond the plan's list.
5. **[Constraint] Docs not committed.** The todo move, the gaps todo and the WINDOWS.md entries are on disk only, so the Task 3 verify's `git diff --quiet HEAD` checks fail by design.
6. **[Gaps todo item 4 added]** The actionable-toast HTML sink; see Threat Flags.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: html-injection | services/console/src/html/app/js/controllers/LogviewController.js:218-224 | The classic console renders the actionable `msg.body` (device-supplied `notification.body`) as HTML in toastr, unescaped. Before vn3 that frame was never delivered; now it reaches the device's owner. Publishers accepted on `/<owner>/<udid>` include the owner's devices and, through vbg's transfer binding, a transferred device's previous owner, which gives cross-owner markup injection. CSP blocks inline script. Recorded as gaps todo item 4 and a WINDOWS.md `deviation` entry; needs an operator decision before push |

## Pre-existing oddities left unchanged

- forwardNonNotification null rtm throw (gaps todo 1)
- the duplicate-path upgrade guard (gaps todo 2)
- `app.existing_sockets` is never filled (gaps todo 3)
- device.js transformer checkin frame references an undeclared `websocket`
- per-owner MQTT clients live for the process lifetime after the last socket closes
- `message_callback` is attached unbound on the master client
- processConnectionChange still puts the raw topic `did` segment in `udid` (it is not udid-validated; it goes only to the topic owner)

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: spec/jasmine/MessengerOwnerSocketSpec.js (`MSGR e2e`, `WSREG`), lib/thinx/messenger.js (`sendToOwner(`, `subscribeSocket(`, `subscriberCount(`), lib/thinx/socket_session.js (`261003-vn3`)
- FOUND commits: 313d3335, 54c04622, 63716bae (`git rev-list --count 94f846e2..HEAD` = 3)
- FOUND: .planning/todos/completed/2026-10-03-messenger-websocket-is-process-wide.md (`## Resolution`), .planning/todos/pending/2026-10-03-console-notification-delivery-gaps.md
