---
phase: quick-261003-w0c
plan: 01
status: complete
subsystem: mqtt-messenger
tags: [mqtt, messenger, crash, dos, fail-safe, feature-flag, tdd, jasmine]
requirements: [W0C-MQTT-HANDLER-CRASH]
dependency_graph:
  requires: [quick-261003-vbg (withAcceptedDevice, logDroppedDeviceMessage, topic helpers), quick-261003-vn3 (subscribeSocket, sendToOwner)]
  provides: [Messenger.mqttDeviceWritesEnabled, Messenger.isPlainMessage, Messenger.handlerErrorReason, Messenger.topicUdidOf, Messenger#noteOnce, Messenger#respondToMqttMessage]
  affects: [lib/thinx/messenger.js MQTT message handler, device-side ownership todo (a)/(b)/(e), console notification gaps todo item 1]
tech_stack:
  added: []
  patterns: [try/catch wrapper around the mqtt.js listener body, env flag read at call time (default off), once-per-instance notice lines]
key_files:
  created:
    - spec/jasmine/MessengerFailSafeSpec.js
    - .planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md (uncommitted, for the orchestrator's docs commit)
  modified:
    - lib/thinx/messenger.js
    - spec/jasmine/MessengerOwnershipSpec.js
    - spec/jasmine/MessengerSpec.js
    - .planning/todos/pending/2026-10-03-console-notification-delivery-gaps.md (uncommitted)
    - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md (uncommitted)
decisions:
  - "MQTT device writes (registration + status edit) run only when THINX_MQTT_DEVICE_WRITES is exactly \"1\"; default off everywhere, nothing in the deployment sets it"
  - "MQTT-triggered transformers are hard off (no flag) until Device#runDeviceTransformers handles a null reg/callback"
  - "Unknown-shape MQTT messages are not relayed to the console; processUnknownNotification kept for vn3's W4"
  - "messageResponder never throws: caught exceptions log handler_error_<ErrorName> + sanitized udid through vbg's 5-per-60s limiter; the error message is never logged"
metrics:
  duration: ~10 min
  completed: 2026-10-04
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 13800
  tasks: 3
  commits: 4
plan_head_before: acf6be0d2c52069c995100acc0053a5b2c2b66eb
plan_head_after: d46bb756df6354c9d1448acaf5b138d877630cf4
---

# Quick 261003-w0c: MQTT handler crash fix, fail-safe and gating Summary

The MQTT message handler can no longer throw into mqtt.js's packet pump. `forwardNonNotification` forwards only when there is a real Slack client and a channel, and `messageResponder` wraps the old body in a try/catch. Non-object payloads are dropped. The production paths this makes reachable are gated: MQTT device writes sit behind `THINX_MQTT_DEVICE_WRITES` (off), MQTT-triggered transformers are hard off, the debug relay is off, and the actionable response branch drops an unknown nid without throwing.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `d2b30f4d` | test(quick-261003-w0c): failing spec for the MQTT handler crash, fail-safe and gating |
| 2 | `8b9f9fb9` | fix(quick-261003-w0c): gate MQTT device writes, MQTT transformers and the debug relay |
| 3 | `02988a35` | fix(quick-261003-w0c): MQTT messages never throw out of the message handler; Slack forward only with a real client |
| 4 | `d46bb756` | fix(quick-261003-w0c): actionable response with an unknown nid no longer throws |

The RED commit touches only the spec. The gate commit (2) lands before the crash-fix commit (3), so no commit opens an ungated path. Task 3 (the todos) is on disk only and is **not committed**, per the orchestrator constraint. Nothing was pushed.

## Prerequisites found

- vbg and vn3 had landed, and `lib/` and `spec/` were clean, so the precondition passed.
- vbg's helper is **`withAcceptedDevice`**.
- **vep had NOT landed:** `get_device_apikey(` is absent from messenger.js. `mqttDeviceRegistration` still uses `get_first_apikey`/`apikey.key`, and it is gated off either way.

## RED evidence

`MessengerFailSafeSpec.js` on vbg+vn3: **30 specs, 24 failures**, exactly the predicted split.
- **Failing (24):**
  - C1, C3, C5, C6, C7
  - F1, F2, F3
  - P1 ×7, P2
  - G1, G2, G3, G4, G5
  - A1, A2
  - E1
- **Passing pins (6):** C2, C4, C8, C9, F4, G6.
- **Failure types:**
  - most were chai AssertionErrors (`expected [Function] to not throw` with `reading 'sendMessage'`, plus `reading 'notification'` for the JSON-null payload);
  - C7 was jasmine's `Unhandled promise rejection` plus an assertion;
  - A1, A2 and E1 were jasmine-reported `Uncaught exception` errors (`reading 'length'`, `SyntaxError`, `reading 'sendMessage'`) plus an assertion.
- E1 reproduced the dead pump: after the registration message threw, the later `connected` and `notification` publishes were never delivered.

## Sibling-spec adaptations (the only edits)

- **`spec/jasmine/MessengerOwnershipSpec.js` (vbg):**
  - the top-level `beforeEach` saves `THINX_MQTT_DEVICE_WRITES` and sets it to `"1"`, and a new `afterEach` restores it exactly;
  - in (1), (2), T1 and T2 the profile-load and transformer-run expectations now expect zero calls, each with the comment `quick 261003-w0c: MQTT-triggered transformers disabled`. The edit expectations are unchanged. T1 keeps `profile never loaded for OWNER_A`;
  - the header fixture note now says the forwardNonNotification throw is fixed in 261003-w0c and the no-op stays to isolate the owner gate, and it documents the flag;
  - the header's pinned-behaviour bullet no longer claims transformers run, and the title of (1) now reads "edits the device as the owner (transformers disabled by quick 261003-w0c)". Both are comment/title edits; see Deviations.
  - No log-count filter was needed: (6), (6b), (7) and (8) stayed green unchanged.
- **`spec/jasmine/MessengerSpec.js`:** both `261003-vbg` cases set `THINX_MQTT_DEVICE_WRITES="1"` for their duration and restore it in the existing `finally` (deleted when it was unset before). These cases need Redis/CouchDB, so they were syntax- and lint-checked only; they run in CI.
- **vn3's MessengerOwnerSocketSpec:** unchanged and green, including S1 (still exactly one `.send(`) and W4 (`processUnknownNotification` called directly).

## Failure-mode evidence (verbatim from the plan; re-verified)

**Who receives these messages.** `messageResponder` is attached only to per-owner clients (`setupMqttClient` ~:680, reached from `initWithOwner`, which runs when a classic-console socket sends `init`). The master `thinx` client attaches `message_callback`, unbound, and never subscribes. So the bug fires only for owners who opened the console since the API task started.

**It fires on every device connect.** THiNXLib publishes `generate_checkin_body()`, which is `{"registration": {...}}` (`thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp` ~:2068-2071, wrapper at ~:457), to `/<owner>/<udid>/status` on every MQTT connect. Its LWT is `{ "status" : "disconnected" }` (~:57, ~:1354), and it also sends `{ "status" : "update_started" }` (~:850). None of these carries `notification`.

**What a throw in the listener does in mqtt.js 5.16.0.** `handlers/publish.js` ~:121 calls `client.emit('message', …)` for QoS 0 with no try/catch, and `client.handleMessage(packet, done)` never runs after a throw. The emit sits inside `writable._write` (`client.js` ~:361-366), and readable-stream 4.7 turns the throw into an `error` on the internal Writable. The socket's pipe then unpipes and re-emits it as an unhandled `error` event. Reproduced locally with a real `MqttClient` on an in-memory Duplex (a throwaway probe, not committed):
- **No `uncaughtException` listener:** the process dies with exit code 1, and the TypeError stack (`reading 'sendMessage'`) goes to stderr.
- **With a non-exiting `uncaughtException` listener:** the process survives, but 0 of the 2 later publishes on the same client were delivered. The client's packet pump is dead while the connection stays up.

**Which mode production is in.** `lib/thinx/globals.js` ~:158-166 builds Rollbar with `handleUncaughtExceptions: true`, and that installs a non-exiting `uncaughtException` listener (`node_modules/rollbar/src/server/rollbar.js` ~:645-675; `exitOnUncaughtException` is not set). `thinx_api` mounts `ROLLBAR_SERVER_TOKEN` (`.planning/phases/24-secrets-sweep/24-06-SUMMARY.md` ~:168). So production most likely does not crash:
- the TypeError goes to Rollbar, and Rollbar's logger is not verbose, so nothing reaches `docker logs`;
- the affected owner's MQTT client stops processing incoming packets. Inferred, not reproduced: keepalive (60 s default; the per-owner options set none) should eventually see no PINGRESP and reconnect after `reconnectPeriod` 30000, and the device's next non-notification message kills the pump again.

If the Rollbar token is absent, every such message crashes the API process instead (exit 1, then a swarm task restart). The operator check below tells the two modes apart.

**Read-only production check (operator; do NOT run as part of this task).** Placement floats, and `docker logs` is node-local. Count only; never print matching lines (they carry owner ids).
1. Task placement and restart history: `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'docker service ps thinx_api --no-trunc --format "{{.Node}} | {{.CurrentState}} | {{.Error}}" | head -20'`. Rows with `non-zero exit (1)` are crash restarts.
2. If the running task is on `micro`: `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'C=$(docker ps -qf name=thinx_api. | head -1); [ -n "$C" ] || { echo "thinx_api not on this node"; exit 3; }; L=$(docker logs --since 168h "$C" 2>&1); echo sendMessage_typeerrors=$(printf "%s\n" "$L" | grep -c "reading .sendMessage."); echo rollbar_disabled=$(printf "%s\n" "$L" | grep -c "ROLLBAR_SERVER_TOKEN not set"); echo owner_clients_subscribed=$(printf "%s\n" "$L" | grep -c "connected, subscribing with result"); echo owner_clients_closed=$(printf "%s\n" "$L" | grep -c "Connection closed for")'`. If it is on `core`, run the same remote command through the `thinx` host alias from `~/.aliases` (do not copy that host into the repo).
3. Interpretation:
   - `rollbar_disabled` = 0 means Rollbar is active, so expect `sendMessage_typeerrors` = 0 even when the bug fires. Count them in the Rollbar dashboard instead (search items for `reading 'sendMessage'`). A steady stream of `Connection closed for` after `subscribing` lines fits the deaf-client mode.
   - `rollbar_disabled` > 0 together with `sendMessage_typeerrors` > 0 and `non-zero exit (1)` rows means crash mode.
   - `owner_clients_subscribed` = 0 since the task started means no console sent `init`, so the path never ran in this task's lifetime.

Re-verified while executing:
- `publish.js:109`/`:121` emit without a try/catch;
- `globals.js:163` sets `handleUncaughtExceptions: true`, and `rollbar.js:650` registers `uncaughtException`;
- 24-06 SUMMARY:167 lists `ROLLBAR_SERVER_TOKEN` on `thinx_api`;
- THiNXLib.cpp :57 (LWT), :1354 (set_will), :457, :852, :2070.

The operator check was **not** run.

## Decision table

| Path | Trigger in production | Safe as is? | Decision |
|---|---|---|---|
| `mqttDeviceRegistration` → `Device#register` | every THiNXLib MQTT connect (registration body on the status topic) | **No.** Before vep, `_auth` is `.key` of a string, so undefined. `Device#register` then writes an audit entry under the payload's `reg.owner` and answers with a string, and `registerDevice` dereferences `registration_response.registration.udid` inside a Redis callback, an async TypeError. The method also logs the whole message. After vep it re-registers the device with its own key, which duplicates the HTTP check-in on every connect, and `publish()` returns at once while `DISABLE_SLACK`, so the reply never reaches the device | **Gated off** behind `THINX_MQTT_DEVICE_WRITES` (default off), whether or not vep has landed |
| `updateAndTransformDeviceStatus` → `Device#edit({udid, status: message})` | LWT, `update_started`, and the registration body | **No.** It writes the parsed object into `doc.status`. The classic console treats `device.status` as a string (`devices.html` ~:131-134) | **Gated off** behind the same flag. When the flag is on, the edit runs exactly as vbg left it |
| → `Owner#profile` → `Device#runDeviceTransformers(profile, doc, null, null, null)` | every accepted status message | **No** (stale write-back, `reg.status` on null twice, undeclared `udid`) | **Hard off** (no flag): replaced by a once-per-instance notice |
| `processStatus` (Check-in/Check-out) | LWT `{status:"disconnected"}`, or another firmware's `{status:"connected"}` | **Yes.** vbg gate + vn3 `sendToOwner` | **Live** |
| `processConnectionChange` (Device Connected/Disconnected) | `{connected: bool}` messages | **Yes.** Topic owner = subscribing owner; vn3 routing | **Live** |
| `processActionableNotification` | `notification` messages, already live | Owner-gated and routed, but the response branch threw on an absent nid (vbg finding (e)) | **Minimal fix:** parse guard, drop as `notification_unknown_nid` |
| `processUnknownNotification` ("[DEBUG] Generic Message") | every other shape, including the registration body on every connect | It would toast "[object Object]" on every device connect | **Off from MQTT dispatch:** the else-branch notes once per instance; the method stays |
| non-JSON payloads | the firmware's unquoted-key notices, garbage | With the flag on, a Buffer would be written into `status` | **Dropped** as `malformed_payload` right after `ensureJSON` |

## What owners will observe after deploy (flag unset)

1. **No more failures per device message.** No `reading 'sendMessage'` TypeErrors in Rollbar or the logs, no crash restarts, and per-owner MQTT clients keep receiving.
2. **Owner-only toasts in the classic console** (owner connection that sent init):
   - "Check-out: Device <alias> disconnected." when one of their THiNXLib devices drops off MQTT (LWT).
   - "Check-in" only for firmwares that publish `{status:"connected"}`; THiNXLib publishes the registration body instead.
   - "Device Connected/Disconnected" for `{connected: …}` messages.
   - Actionable "Device Interaction" toasts as before.
   - No "[DEBUG] Generic Message" toasts.
3. **No change to device documents from MQTT.** Status and registration over MQTT are not applied and MQTT-triggered transformers do not run. Device status keeps coming from HTTP check-ins exactly as today.
4. **Logs.** At most one notice line per process for each of: device writes disabled, transformers disabled, unknown shapes not relayed. Rate-capped `dropped MQTT device message: malformed_payload` lines, mostly from the firmware's own non-JSON update notices, and `handler_error_*` lines.

## Residual risks (accepted, recorded)

- **Async throws (T-w0c-10).** The try/catch covers synchronous throws only. The async callbacks that stay live with the flag off were audited:
  - `processStatus`: devicelib callback, then `sendToOwner`, which never throws;
  - `processActionableNotification`: fixed in commit 4;
  - vbg's `withAcceptedDevice` and its binding lookup.

  The gated-off paths are exactly the known async throwers, and production keeps Rollbar's listener.
- **Spoofed toasts (T-w0c-09).** Any publisher on `/<owner>/…` can now trigger Check-out and Connected toasts. vbg gates the device-scoped ones by owner/binding, vn3 routes only to the owner's sockets, and the content is the owner's own alias or id.
- **Cross-nid copy (vbg finding (e)).** The response branch still copies the payload-chosen `nid:<nid>` into `nid:<did>`. Only the throw was fixed.
- **Payload logging.** `processActionableNotification` still logs the whole message for accepted devices (`parsing message …`, `NID message for device …`). This is pre-existing vbg/vn3 behaviour and was left untouched (out of scope).
- **Enabling the flag** requires the prerequisites in `.planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md`.

## Verification

- **Task 1 verify** (plan block verbatim): FailSafe without "W0C actionable", plus MessengerOwnership and MessengerOwnerSocket: **91 specs, 0 failures** (91 of 93 run). Printed `W0C-TRACER-GREEN`. This was the tracer gate; the re-run passed, so execution continued.
- **Gate commit check** (before the crash fix): MessengerOwnership + MessengerOwnerSocket, **63 specs, 0 failures**; `node --check` OK.
- **Task 2 verify** (verbatim): the full FailSafe spec, vbg/vn3 specs, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka, DeviceOwnership, DeviceRegisterOwner, ApikeyExactMatch, MeshSessionAuth, Util, TransferApiKey, LogTailOwner and CsrfRouteInventory: **515 specs, 0 failures**. ESLint was clean and the protected files are unchanged. Printed `W0C-ALL-GREEN`. BuilderApiKeySpec does not exist (vep has not landed).
- **Orchestrator regression set + plan specs**, one process (`npx jasmine --config=/tmp/w0c-jasmine.json`, `helpers: []`, `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`): MessengerFailSafe, MessengerOwnership, MessengerOwnerSocket, ApikeyExactMatch, BuildLogOwner, CsrfRouteInventory, DeviceOwnership, DevicePushOwner, DeviceRegisterOwner, MeshSessionAuth, TransferApiKey, DeviceOtt, LogTailOwner, GoogleOAuthState, GitHubOAuthIsolation, Util, SecretsSweep, LoggingQualityAudit, OwnerLogLeak and Sanitka: **600 specs, 0 failures**, exit 0.
- **CI conditions:** with `ENVIRONMENT=test` at case time and random order (seeds 1, 4242, 90210), FailSafe + Ownership + OwnerSocket gave **93 specs, 0 failures** each time. The spec's per-case ENVIRONMENT save/restore holds.
- **Task 3 verify:** every content check passes (`DOCS_CONTENT_OK`). The final `git diff --quiet HEAD` fails by design, because the todos are uncommitted (constraint).
- **Focus check:** no `fit`/`fdescribe`/`xit`/`xdescribe`.
- **Not run locally:** MessengerSpec (needs Redis/CouchDB/broker; it is a CI spec, not ZZ). No ZZ spec was added or changed, so there are no `unrun-verify` WINDOWS.md entries.

## Deviations from Plan

1. **[Constraint] Task 3 not committed.** The plan says to commit the three todo paths. The orchestrator constraint forbids committing `.planning/todos/*`, so they are left on disk for the orchestrator's docs commit. As a result the Task 3 verify's `git diff --quiet HEAD -- "$N" "$D"` fails by design.
2. **[Helper] `Messenger.topicUdidOf(topic)`.** One static computes the plan's `<udid>` expression (`Messenger.topicUdid(topic.split("/")[2])` for a string topic, else null). It is used by both the malformed-payload drop and the catch, so the computation is not written twice. No behaviour change.
3. **[Spec text] vbg header bullet and the (1) title.** The plan allows only the header fixture note to change. The pinned-behaviour bullet and the title of case (1) both said transformers run, which is now false. I edited those two comment/title strings too; the assertions are exactly the allowed flips.
4. **[Choice within the plan] Response-branch drop udid.** The plan names "the sanitized udid vbg passes to its accepted callback". I used `Messenger.topicUdid(did)`, which is the same value (`withAcceptedDevice` computes it the same way), so vbg's callback signature `(_doc, owner, _udid)` stays byte-identical. The drop is logged with two arguments, as the plan says, without vbg's per-message `drop` marker.
5. **[Spec harness] E1 CONNACK timing.** The fake broker pushes the CONNACK when the client writes its CONNECT, not on a fixed next tick. This is harness only; the expectations are as planned. E1 also records `client.on("error")` and asserts zero client errors.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema change. The new log lines are fixed strings or reason codes plus a sanitized udid.

## Self-Check: PASSED

- FOUND: spec/jasmine/MessengerFailSafeSpec.js; lib/thinx/messenger.js (`static mqttDeviceWritesEnabled(`, `respondToMqttMessage(`, `static isPlainMessage(`, `noteOnce(`, `notification_unknown_nid`); .planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md
- FOUND commits: d2b30f4d, 8b9f9fb9, 02988a35, d46bb756 (`git rev-list --count acf6be0d..HEAD` = 4)
