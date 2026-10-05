---
phase: quick-261003-vbg
plan: 01
status: complete
subsystem: mqtt-messenger
tags: [security, mqtt, messenger, ownership, transfer, idor, tdd, jasmine]
requirements: [VBG-MQTT-STATUS-OWNER]
dependency_graph:
  requires: [quick-261003-t29 (Device.isOwnedBy), quick-261003-u86 (findDeviceKey, findTransferBinding, parseKeyStore, transfer bindings)]
  provides: [APIKey#checkTransferBinding, Messenger#withAcceptedDevice, Messenger.topicOwner/topicUdid/isStatusTopic, Messenger#logDroppedDeviceMessage]
  affects: [lib/thinx/messenger.js MQTT handlers, device-side ownership todo item 4]
tech_stack:
  added: []
  patterns: [silent strict topic parsing, per-message drop marker plus windowed log limiter, accept-as-doc.owner]
key_files:
  created:
    - spec/jasmine/MessengerOwnershipSpec.js
  modified:
    - lib/thinx/messenger.js
    - lib/thinx/apikey.js
    - spec/jasmine/MessengerSpec.js
    - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md (uncommitted, for the orchestrator's docs commit)
decisions:
  - "Operator decision 2026-10-03: a transferred device's previous-owner MQTT topic is accepted through the u86 transfer binding on the entry doc.lastkey identifies; applied as doc.owner; binding never consumed"
  - "Each dropped message prints at most one line: a per-message marker shared by the status and notification handlers, plus the 5-per-60s window limiter"
  - "processActionableNotification body kept byte-identical (re-indented inside withAcceptedDevice), including finding (e)"
metrics:
  duration: ~15 min
  completed: 2026-10-03
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 15962
  tasks: 3
  commits: 5
plan_head_before: 453c4732f3402d36639d87a574b8e3867779673a
plan_head_after: 84f23c20e0c1a64c5a4b912e08afd095a7b693ac
---

# Quick 261003-vbg: MQTT status owner check Summary

MQTT status, check-in and actionable messages now act only on a device the topic owner owns, or on a device transferred away from the topic owner whose moved key (the entry `doc.lastkey` identifies in `ak:<doc.owner>`) carries a u86 transfer binding for that udid. Accepted messages always run as `doc.owner`. Malformed topics never reach CouchDB or Redis. Drops log one capped, leak-free line.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `ffe6e32e` | test(quick-261003-vbg): failing spec for MQTT status topic owner check and transfer binding |
| 2 | `e6367b80` | fix(quick-261003-vbg): MQTT status updates only for the topic owner's devices |
| 3 | `11605dfc` | fix(quick-261003-vbg): accept a transferred device's previous-owner MQTT topic through its transfer binding; owner-check actionable notifications |
| 4 | `a314d54d` | test(quick-261003-vbg): CI MQTT status owner regressions |
| 5 | `84f23c20` | test(quick-261003-vbg): keep the limiter spec's Date.now spy inside a synchronous body |

## RED evidence

`MessengerOwnershipSpec.js` on the unfixed code: **39 specs, 31 failures**. All 31 were AssertionErrors; there were 0 TypeError, ReferenceError or harness errors. The 8 predicted "keeps working" cases passed on RED: (1), (2), (4), (9), T2, T9, T10, (18). T1 failed as predicted, because the profile was loaded for OWNER_A. The VBG binding cases failed at their `typeof` assertion. The RED commit touches only the spec.

## Accept rule (as implemented)

1. **Sanitize first.** `messageResponder` drops a topic as `malformed_topic` if it has no leading empty segment or its owner segment fails `Sanitka.strictOwner`. This happens before registration, the status edit or any notification. `withAcceptedDevice` also requires the udid to pass a silent `^[a-fA-F0-9-]{36}$` test plus `Sanitka.udid`.
2. **Load the device.** One `devicelib.get(udid)`. An error or no doc gives `unknown_device`.
3. **Owned.** If `Device.isOwnedBy(doc, topicOwner)`, the message is accepted with no `ak:` read.
4. **Transferred.** Otherwise `APIKey#checkTransferBinding(strictOwner(doc.owner), udid, doc.lastkey, topicOwner)` does one GET of `ak:<doc.owner>`, then `parseKeyStore`, then `findDeviceKey`, then `findTransferBinding` on the identified entry's hash (or its key). An error or a malformed store gives `binding_lookup_failed`. A false result gives `foreign_owner`. A true result is accepted as `doc.owner`. It never logs or audits.
5. **What is gated.** `updateAndTransformDeviceStatus` (only for exactly `/<owner>/<udid>/status`), `processStatus` (only reads for `connected`/`disconnected`) and `processActionableNotification` (both branches) all act only inside `withAcceptedDevice`. They use the owner it hands them for `Owner#profile` and the transformers.
6. **Drop logging.** The line is `⚠️ [warning] [messenger] dropped MQTT device message: <reason>, udid <sanitized|->`. At most one line is printed per message and at most 5 per 60 s window; the suppressed count is printed on the next window's first line.

## Operator decision and accepted residual risk

- **Decision (2026-10-03):** a transferred device's previous-owner topic is ACCEPTED through the transfer binding. The binding is never consumed (u86 decision 3); it ends on key revoke, owner purge or the next transfer.
- **Accepted residual risk:** while the binding lives, the sender's owner credential (`/<sender>/#`) can forge the device's status, run the recipient's transformers on forged input, send check-in/actionable notifications and write `nid:<udid>`. The scope is narrowed to exactly that udid, the topic owner listed in `from`, and the entry `doc.lastkey` identifies, and everything is applied as `doc.owner`. Remedy: re-key the device or revoke the moved key.

## Follow-ups (recorded in the todo, not planned)

- Per-device topic namespace or publisher-identity check (broker plugin / MQTT 5 user properties, or `/d/<udid>/status`).
- ACL cleanup on transfer (continuity leftovers item 1). It must be reconciled with this rule: it removes the device's own old-topic publishes, but the sender's owner credential can still publish.
- A messenger-side "seen on the new topic" marker that ends old-topic acceptance without consuming the binding.
- Delivery limitation: old-topic messages arrive only through the previous owner's per-owner messenger client.

## Broker ACL analysis

- **Broker setup.** mosquitto-go-auth with the Redis backend and superuser disabled. `acl.js` `commit_redis` only `sAdd`s.
- **Device user.** readwrite on `/<owner>/<udid>`, `/<owner>/<udid>/status`, `/<owner>/shared/#` and `/<owner>/<mesh>`, for every owner it registered under.
- **Owner user.** readwrite on `/<owner>`, `/<owner>/#` and `/<owner>/shared/#`. Every user also gets subscribe `/#`.
- **Why the server-side check is still needed:**
  1. The ACL is prefix-based, not ownership-based.
  2. ACLs drift: nothing is removed on transfer, and `addTopic` dedupes by substring.
  3. MQTT 3.1.1 carries no publisher identity.
  4. Broker/Redis config drifts independently of CouchDB.

## What changes for real users

1. Status, check-in and actionable messages for another owner's udid are ignored, with one rate-limited warning line each.
2. A transferred device still publishing on its previous owner's topic keeps working (operator decision). Its updates land as the current owner's device, with the current owner's transformers. This lasts while the moved key keeps its binding and stays the device's key. Re-keying or revoking ends it.
3. Only the exact `/<owner>/<udid>/status` topic edits device status. Topics whose owner segment is not a valid owner id are ignored entirely, including MQTT registration and the socket relay.
4. **Production caveat:** because of finding (a), none of this message processing is believed to run in production today. The gate is in place for CI and for whenever (a) is fixed.

## Findings (a)-(g), recorded in the todo, not fixed (re-verified with file:line)

- **(a) high:** `forwardNonNotification` throws (`this.rtm` is null, and `typeof null` is `"object"`) on every non-notification message whenever `ENVIRONMENT !== "test"`. mqtt.js 5.16 emits `message` without a try/catch and the code has no `uncaughtException` handler, so the API process most likely crashes. Operator read-only check: count thinx_api task restarts, and run node-local `docker logs` looking for `reading 'sendMessage'`.
- **(b) medium:** the MQTT transformer path has three defects:
  - `reg = null` passes the `typeof` check, so `reg.status` throws a TypeError (`device.js:562`, `:693`);
  - `transformers: []` writes the pre-update document back, racing the status edit (`:533`);
  - an undeclared `udid` is read in the lambda handler (`:652`).
- **(c) medium:** `this._socket` is a process-wide singleton (`messenger.js:978`). Correction to the plan: the caller is `socket_session.js:94` with the verified `ws.owner`. This is already tracked in `2026-10-03-messenger-websocket-is-process-wide.md`.
- **(d) low:** `this.socket` is never set (`:57`), so `:333`, `:569` and `:628` throw when `_socket` is non-null. `_socket` is also `undefined` before any `initWithOwner`.
- **(e) low:** the actionable response branch copies the payload-chosen `nid:<nid>` into `nid:<did>`, and throws on `JSON.parse(null).length` (`:599-611`).
- **(f) low:** `publish()` returns at once while `DISABLE_SLACK` (`:215`). `registerDevice` dereferences `registration.udid` even when registration failed (`:328`).
- **(g) low:** master callbacks are attached unbound (`:866-868`), so the master never subscribes `#` (`:808`). The glob in `data()` has a leading `*` that also matches other prefixes (`:956`).

## Post-deploy checks (operator, read-only)

On the node running `thinx_api` (node-local `docker logs`), count `[messenger] dropped MQTT device message` lines by reason, and count `suppressed in the previous window` lines. Given (a), zero is the expected outcome today.

## Verification

- **Task 1 verify:** printed `VBG-STATUS-GREEN` (VBG status|topic|log|check-in: 19 specs, 0 failures).
- **Task 2 verify:** printed `VBG-ALL-GREEN`. The plan's regression set (MessengerOwnership, TransferApiKey, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka, DeviceOwnership, DeviceRegisterOwner, ApikeyExactMatch, MeshSessionAuth, Util) ran in one process: **364 specs, 0 failures** (the 325 baseline plus the 39 new specs).
- **Orchestrator regression set:** MessengerOwnership, ApikeyExactMatch, BuildLogOwner, CsrfRouteInventory, DeviceOwnership, DevicePushOwner, DeviceRegisterOwner, MeshSessionAuth, TransferApiKey, DeviceOtt, LogTailOwner and Util ran in one process: **421 specs, 0 failures**.
- **Union of both sets after the final spec commit:** **528 specs, 0 failures**. MessengerOwnershipSpec in random order (3 seeds): 39 specs, 0 failures each time.
- **ESLint:** clean on `lib/thinx/messenger.js`, `lib/thinx/apikey.js`, `spec/jasmine/MessengerOwnershipSpec.js` and `spec/jasmine/MessengerSpec.js`. No `fit`/`fdescribe`.
- **Task 3 verify:** every check passes except the final `git diff --quiet HEAD -- <todo>`, because the todo is intentionally left uncommitted (see Deviations).
- **MessengerSpec's two new CI cases** need Redis, CouchDB and the broker. They were syntax- and lint-checked only and were not run locally; they run in CI (they are not ZZ specs).

## Deviations from Plan

1. **[Rule 2 - must-have] At most one drop line per message.** A `{status:"connected"}` on a status topic goes through both `updateAndTransformDeviceStatus` and `processStatus`. Likewise, a notification on a status topic goes through both the status path and the actionable path. Either way the message would have logged two drop lines. `messageResponder` now passes a per-message `{logged}` marker to the handlers, and `logDroppedDeviceMessage` honours it. The marker is an optional trailing argument of `updateAndTransformDeviceStatus`, `processStatus`, `processActionableNotification` and `processActionableMessages`, and it changes no user-visible behaviour. Spec (6b) pins it. Commits `e6367b80` and `11605dfc`.
2. **[Rule 1 - CI hygiene] Spec (8) made synchronous.** Its `Date.now` spy is now based on the real clock and released before the body returns, so other timers in the shared CI process never see a skewed clock. Commit `84f23c20`.
3. **[Constraint] Docs not committed.** The todo edits (Task 3) are left uncommitted for the orchestrator's docs commit, so the Task 3 commit is titled `test(quick-261003-vbg): CI MQTT status owner regressions`, without "resolve device-side todo item 4". Because of this, the Task 3 verify's `git diff --quiet HEAD -- <todo>` check fails by design.
4. **Finding (c) corrected.** `initWithOwner` is called from `lib/thinx/socket_session.js:94` with the verified session owner, not from `thinx-core.js` with the `init` frame's owner. The singleton defect stands, and it cross-references the existing websocket todo.
5. **Silent udid test inside `checkTransferBinding`.** It runs a silent regex before `Sanitka.udid`, so the method never logs; the plan requires it to log nothing.

## Known Stubs

None.

## Threat Flags

None. The only new surface is one bounded Redis GET of `ak:<doc.owner>` per unowned-but-valid message, which the threat model already covers as T-vbg-13.

## Self-Check: PASSED

- FOUND: spec/jasmine/MessengerOwnershipSpec.js, lib/thinx/messenger.js (`Device.isOwnedBy(`, `this.withAcceptedDevice(` x3, `this.akey.checkTransferBinding(`), lib/thinx/apikey.js (`checkTransferBinding(`, `APIKey.findTransferBinding(` x2), spec/jasmine/MessengerSpec.js (`261003-vbg` cases)
- FOUND commits: ffe6e32e, e6367b80, 11605dfc, a314d54d, 84f23c20 (`git rev-list --count 453c4732..HEAD` = 5)
