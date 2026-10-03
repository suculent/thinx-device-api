---
created: 2026-10-04T00:00:00.000Z
title: "MQTT device writes are gated off: prerequisites before THINX_MQTT_DEVICE_WRITES=1"
area: api
severity: medium
files:
  - lib/thinx/messenger.js respondToMqttMessage / updateAndTransformDeviceStatus
  - lib/thinx/device.js runDeviceTransformers
---

## Context

Quick 261003-w0c fixed the `forwardNonNotification` TypeError that made every non-notification
MQTT message throw out of the per-owner message handler in production. Fixing it made the rest of
`messageResponder` reachable in production for the first time. The unsafe parts were gated off:

- MQTT registration and the MQTT status edit run only when `THINX_MQTT_DEVICE_WRITES` is exactly
  `"1"` (read at call time; nothing in the deployment sets it, so it is **off**);
- MQTT-triggered transformers are **hard off** (no flag);
- the "[DEBUG] Generic Message" relay for unknown-shape messages is off;
- payloads that are not a plain JSON object are dropped as `malformed_payload`.

This todo records what must be fixed before anyone sets `THINX_MQTT_DEVICE_WRITES=1`.

## (1) Failure mode (evidence gathered while planning 261003-w0c)

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

## (2) Decision table (261003-w0c)

| Path | Trigger in production | Safe as is? | Decision |
|---|---|---|---|
| `mqttDeviceRegistration` → `Device#register` | every THiNXLib MQTT connect (registration body on the status topic) | **No.** Before vep, `_auth` is `.key` of a string, so undefined. `Device#register` then writes an audit entry under the payload's `reg.owner` (`lib/thinx/device.js` ~:806-812) and answers with a string, and `registerDevice` dereferences `registration_response.registration.udid` inside a Redis callback, an async TypeError. The method also logs the whole message. After vep it re-registers the device with its own key, which duplicates the HTTP check-in on every connect, and `publish()` returns at once while `DISABLE_SLACK` (~:208-210), so the reply never reaches the device | **Gated off** behind `THINX_MQTT_DEVICE_WRITES` (default off), whether or not vep has landed |
| `updateAndTransformDeviceStatus` → `Device#edit({udid, status: message})` | LWT, `update_started`, and the registration body | **No.** It writes the parsed object (`{status: "disconnected"}`, or the whole registration body) into `doc.status`. The classic console treats `device.status` as a string (`services/console/src/html/app/views/devices.html` ~:131-134: `.length`, `limitTo`, `.toLowerCase()`) | **Gated off** behind the same flag. When the flag is on, the edit runs exactly as vbg left it |
| → `Owner#profile` → `Device#runDeviceTransformers(profile, doc, null, null, null)` | every accepted status message | **No** (device.js ~:522-722). `typeof null !== "undefined"`, so: (1) with no transformers, `update_device_and_respond` writes the pre-edit document back, racing and reverting the status edit and anything else changed in between; (2) a matching transformer reads `reg.status` on null, an async TypeError; (3) the request error path reads `reg.status` too; (4) the response handler reads an undeclared `udid`. A fix lives in device.js and is not small | **Hard off** (no flag): the call is replaced by a once-per-instance notice |
| `processStatus` (Check-in/Check-out) | LWT `{status:"disconnected"}`, or another firmware's `{status:"connected"}` | **Yes.** vbg's owner/binding gate is in place, and vn3's `sendToOwner` reaches only the owner's own subscribed sockets and never throws | **Live** |
| `processConnectionChange` (Device Connected/Disconnected) | `{connected: bool}` messages (not sent by THiNXLib) | **Yes.** Topic owner = subscribing owner; vn3 routing; the body is the owner's own id | **Live** |
| `processActionableNotification` | `notification` messages, **already live** (they never hit the throw) | Owner-gated (vbg) and routed (vn3), but its response branch threw asynchronously on `JSON.parse(null).length` when `nid:<nid>` is absent (vbg finding (e)) | **Minimal fix:** parse guard, drop as `notification_unknown_nid`, never throw |
| `processUnknownNotification` ("☣️ [error] [DEBUG] Generic Message", body `message.toString()`) | every message of another shape: the registration body on every connect, and custom telemetry | Owner-routed after vn3, but it would toast "[object Object]" into the owner's console on every device connect. The code labels it "will deprecate" | **Off from MQTT dispatch:** the else-branch sends nothing and notes once per instance. The method stays (vn3 tests it directly) |
| non-JSON payloads | the firmware's own unquoted-key notices ("Update Successful" ~:1175, "Update Available" ~:809), any garbage | Before w0c they became a Buffer and flowed on, so with the flag on they would write a Buffer into `status` | **Dropped** as `malformed_payload` right after `ensureJSON`, before anything else |

## (3) Prerequisites before setting THINX_MQTT_DEVICE_WRITES=1

**Status 2026-10-04 (quick 261004-25u, commits `d3e196e1`, `71c45c57`):** prerequisites 2, 3 and 4 are
**resolved**; 1 (transformers, still hard off) and 5 (replies never reach the device) stay **open**. The
operator decided (2026-10-04) to enable the flag after 25u is deployed, with 1 and 5 left out of
scope: transformers stay hard off from MQTT (no flag), and MQTT registration replies are still never
published. The `registration.udid` dereference on a failed registration noted in 5 was already fixed
by 261003-vep. Post-enable checks: see `.planning/quick/261004-25u-mqtt-device-writes-safe-to-enable/261004-25u-SUMMARY.md`.

1. **OPEN.** **`Device#runDeviceTransformers` with a null `reg`/`callback`** (`lib/thinx/device.js` `runDeviceTransformers` ~:522-722). It must handle the MQTT call shape before transformers can be re-enabled from MQTT:
   - no transformers: `update_device_and_respond(device.udid, device, …)` (~:533) writes the document read before `Device#edit` back (stale write-back racing the status edit);
   - a matching transformer reads `reg.status` on null (~:562), and the lambda error path reads `reg.status` too (~:693);
   - the lambda response handler calls `devicelib.get(udid, …)` (~:652) with no `udid` declared in that scope;
   - the lambda request goes to `hostname: 'localhost'` (~:605), which is not where the transformer service runs in the swarm (verify the port/host before relying on it).
   Transformers stay hard off from MQTT until this is fixed; re-enabling them is a code change, not the flag.
2. **RESOLVED (261004-25u).** The edit now writes `{udid, status}` with `message.status` as a plain string (control characters stripped, max 64 characters); objects, numbers, arrays and messages without a string status write nothing (`status_not_string`). Original finding: **The status edit writes the parsed object.** `updateAndTransformDeviceStatus` sets `status: message` (an object such as `{status: "disconnected"}`), while `services/console/src/html/app/views/devices.html` ~:131-134 treats `device.status` as a string (`.length`, `limitTo: 22`, `.toLowerCase()`). Decide what string (if any) an MQTT status should write.
3. **RESOLVED (261004-25u).** A message carrying `registration` never edits status, and MQTT registration is skipped (`registration_recent_checkin`) when `doc.lastupdate` is less than 5 minutes old, so the boot check-in plus MQTT connect no longer double-registers. Original finding: **THiNXLib's connect message is the registration body.** `THiNXLib.cpp` ~:2068-2071 publishes `generate_checkin_body()` (`{"registration": {...}}`, wrapper ~:457) on every MQTT connect. With writes on, every connect re-registers the device (vep's path, duplicating the HTTP check-in) and writes that whole body into `status`.
4. **RESOLVED (261004-25u).** A `"disconnected"` status arriving less than 60 s after `doc.lastupdate` is ignored (`status_stale_disconnect`); later ones are written. The MQTT edit never touches `lastupdate`, so an MQTT status never makes a check-in look newer. Original finding: **LWT semantics.** The LWT `{ "status" : "disconnected" }` (~:57) arrives whenever the broker drops the device; decide how it interacts with later HTTP check-ins (which set status/lastupdate) so a stale "disconnected" never overrides a newer check-in, or vice versa.
5. **OPEN.** **Replies never reach the device.** `publish()` returns at once while `DISABLE_SLACK` (`lib/thinx/messenger.js` `publish`), so MQTT registration replies (and configuration pushes) are never sent. `registerDevice` also dereferences `registration_response.registration.udid` even when registration failed.

## (4) processUnknownNotification has no MQTT caller

After w0c, `processUnknownNotification` is reachable only from specs (vn3's W4). Deprecate or remove it together with vn3's W4 case.

## (5) Firmware non-JSON notices

The firmware's own "Update Successful" (`THiNXLib.cpp` ~:1175) and "Update Available" (~:809) notices use unquoted keys, so they are not JSON and are now dropped as `malformed_payload`. This is a firmware bug; the firmware repos are read-only from here.

## (6) What owners will observe after deploy (flag unset)

1. **No more failures per device message.** No `reading 'sendMessage'` TypeErrors in Rollbar or the logs, no crash restarts, and per-owner MQTT clients keep receiving.
2. **Owner-only toasts in the classic console** (owner connection that sent init):
   - "Check-out: Device <alias> disconnected." when one of their THiNXLib devices drops off MQTT (LWT).
   - "Check-in" only for firmwares that publish `{status:"connected"}`; THiNXLib publishes the registration body instead.
   - "Device Connected/Disconnected" for `{connected: …}` messages.
   - Actionable "Device Interaction" toasts as before.
   - No "[DEBUG] Generic Message" toasts.
3. **No change to device documents from MQTT.** Status and registration over MQTT are not applied and MQTT-triggered transformers do not run. Device status keeps coming from HTTP check-ins exactly as today.
4. **Logs.** At most one notice line per process for each of: device writes disabled, transformers disabled, unknown shapes not relayed. Rate-capped `dropped MQTT device message: malformed_payload` lines, mostly from the firmware's own non-JSON update notices, and `handler_error_*` lines.

## (7) Post-deploy checks (operator, read-only)

Query placement first (`docker service ps thinx_api`), then use node-local `docker logs` on that node. Counts only; never print matching lines.

- `reading 'sendMessage'`: expect 0 (also check Rollbar items for it).
- `dropped MQTT device message: handler_error` and `dropped MQTT device message: malformed_payload`: counts (non-zero `malformed_payload` is expected from the firmware's update notices).
- Each once-notice (`MQTT device writes are disabled`, `MQTT-triggered transformers are disabled`, `MQTT messages of unknown shape are not relayed`) appears at most once per task start (the `transformers` notice only appears with the flag on).
- No `non-zero exit (1)` rows in `docker service ps thinx_api` after the deploy.
