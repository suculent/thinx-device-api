---
created: 2026-10-03T21:45:00.000Z
title: OTT redemption serves the firmware as JSON, not a binary (since fee22323)
area: device-api
severity: major
files:
  - lib/router.deviceapi.js (GET /device/firmware success branch, Util.responder(res, response.payload))
  - lib/thinx/util.js (Util.responder vs Util.respond)
  - thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp (FIRMWARE_UPDATE branch :970-1045, update_and_reboot :1666-1730, loop() :2174-2180)
---

## Problem

`fee22323` (2022-04-27, "responder fixes") changed the success branch of `GET /device/firmware?ott=`
from `Util.respond(res, response.payload)` to `Util.responder(res, response.payload)`.
`Util.responder(res, success, message)` takes three arguments, so the firmware Buffer lands in
`success` and `message` is undefined. Neither the buffer nor the string branch matches, and the
response ends as JSON, `{"success":{"type":"Buffer","data":[...]}}`:
- the `Content-Type: application/octet-stream` header set just before is overwritten with JSON;
- `Content-Length` is still the binary size, so the body does not match it (a strict HTTP client
  fails with "Data after `Connection: close`"; quick 261003-v9x's local spec hit exactly that);
- `x-MD5` is the binary's md5.

`ESPhttpUpdate` cannot flash that body. So OTT redemption has not delivered a flashable image since
2022.

THiNXLib then retries in a tight loop: it keeps `deferred_update_url` after `HTTP_UPDATE_FAILED`,
and `loop()` calls `update_and_reboot(deferred_update_url)` again on every iteration, so an affected
device hammers the endpoint until it reboots (and asks again at the next check-in while the build
is pending).

## Evidence (re-confirmed 2026-10-03, read-only)

- `THiNXLib.cpp` (same code in `thinx-firmware-esp8266-pio/lib/THiNX/src/THiNXLib.cpp`):
  - `:970` `status == "FIRMWARE_UPDATE"`; `:1020-1026` reads `registration["ott"]` and builds
    `"/device/firmware?ott=" + ott`; `:1045` `deferred_update_url = update_url`.
  - `:1666` `update_and_reboot(String url)`; `:1704-1721` `ESPhttpUpdate.update(...)` on port 7443
    (HTTPS) or 7442 (HTTP when `forceHTTP` and `__DISABLE_HTTPS__`); `:1726-1728`
    `HTTP_UPDATE_FAILED` only logs and sets the dashboard status, it never clears the URL.
  - `:2174-2180` `loop()`: `if (deferred_update_url.length() > 0) ... update_and_reboot(deferred_update_url)`.
  - `:828` the MQTT update branch also reads `update["ott"]`.
- No firmware tree sends `use: "ott"` to `POST /device/firmware`; only the register-path token and
  the GET redemption are used by shipping firmware.
- `thinx-firmware-esp32-pio/lib/thinx-firmware-esp32/` is empty in this checkout (no ESP32
  evidence).
- `git show fee22323 -- lib/router.deviceapi.js` shows the `respond` → `responder` change.

## Fix options and impact

- Switch the line back to `Util.respond(res, response.payload)`, which sends the Buffer as
  `application/octet-stream`. That resumes OTA for **every auto-update device with a pending build**
  at its next check-in: a fleet-wide, hard-to-reverse behaviour change (devices reflash).
- Before deciding, the operator counts the auto-update devices whose latest build version is newer
  than the version they report (CouchDB `managed_devices` with `auto_update: true`, compared with
  each device's deploy `build.json`). Decide per fleet whether a mass reflash is wanted.
- Quick 261003-v9x deliberately left the line and its headers unchanged (its Task 2 verify asserts
  it).

## Follow-ups

- **Strict one-time redemption** (`GETDEL`): only after the firmware stops retrying the same URL
  after a failure, or the server re-issues a token on retry. Today the token lives ≤1 h after the
  first redemption and is reusable inside that window (v9x).
- **Plaintext port 7442** — KEEP (operator 2026-10-04, see AGENTS.md "Legacy plaintext device port"): `__DISABLE_HTTPS__` builds fetch the token and the binary over HTTP, so
  both can be sniffed.
- **Sink-level guard**: `deploy.latestFirmwarePath` sanitizes the owner but not the udid, and
  `Filez.deployPathForDevice` concatenates `<deploy_root>/<owner>/<udid>`. v9x validates every OTT
  record before it gets there; making `latestFirmwarePath` refuse a udid that fails `sanitka.udid`
  would protect any future caller too.
  **Resolved by 261004-l8k** (2026-10-04): `latestFirmwarePath` (and `latestFirmwareEnvelope`,
  `latestFirmwareArtifact`, `artifact`) refuse a udid that fails `sanitka.udid` before any path
  is built or file touched.

## Resolution (quick 261004-22b, 2026-10-04)

Operator decision 2026-10-04: resume OTA for auto-update devices with pending builds. The
fleet-count step under "Fix options" was waived by that decision.

- `85baff98` test: `DeviceOttSpec` B1-B5. B1 stubs `ott_update` with a non-UTF-8 Buffer and
  asserts 200, exact body bytes, `application/octet-stream`, Content-Length, x-MD5 and
  Content-Disposition. B2 reads the raw socket and asserts no `{"type":"Buffer"}` /
  `"success"` envelope and no JSON content type. B3 redeems a POST-issued token against the
  fixture `firmware.bin` byte for byte. B4/B5 pin OTT_MISSING (JSON) and the failure reason codes.
  RED: `39 specs, 3 failures` (B1-B3).
- `71493527` fix: `lib/router.deviceapi.js` GET success branch is back to
  `Util.respond(res, response.payload)`. Headers, `ott_update`, token handling and logging
  are unchanged. GREEN: `39 specs, 0 failures`.
- `POST /device/firmware` (direct, non-OTT) was not changed. It calls
  `Util.respond(res, {md5, filesize, payload})` and always has, so it JSON-serializes the
  envelope. That is a different path, not the fee22323 bug, and no shipping firmware calls it.

Still open (see Follow-ups above): strict one-time redemption and THiNXLib's retry loop on
`HTTP_UPDATE_FAILED`. (The sink-level udid guard in `latestFirmwarePath` was resolved by 261004-l8k.)
