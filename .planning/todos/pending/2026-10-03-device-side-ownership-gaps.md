---
created: 2026-10-03T22:00:00.000Z
title: Device-originated paths act on a udid without checking its owner
area: device-api
severity: high
files:
  - lib/thinx/device.js:982-1004 (register MAC fallback, devices_by_mac rows[0] of any owner) — resolved by quick 261003-tv5
  - lib/thinx/device.js:415 (checkinExistingDevice -> authorize_mqtt with the caller's key) — resolved by quick 261003-tv5
  - lib/router.deviceapi.js:97-127 (/device/addpush never verifies the Authentication key)
  - lib/thinx/device.js:704-740 (push writes the push token of any udid)
  - lib/thinx/device.js:1153-1154 (ott_request reads req.owner, always undefined)
  - lib/thinx/messenger.js:377-398 (updateAndTransformDeviceStatus edits by topic udid)
  - lib/thinx/device.js:1209,1285 (firmware loads the device by udid without a compare)
---

## Problem

Quick 261003-t29 audited these device-originated paths and left them out of scope on purpose,
so that firmware check-in keeps working unchanged. The console/API side is fixed. These
findings remain:

1. **Resolved 2026-10-03 (quick 261003-tv5).** **Register MAC fallback** (`lib/thinx/device.js:982-1004`, `:415`). A registration that names
   no udid is looked up through `devices_by_mac`. When the view returns more than one row
   (`body.rows.length > 1`), the device checks in as `rows[0]` whatever its owner, and
   `checkinExistingDevice` → `authorize_mqtt` stores the caller's API key as that device's MQTT
   credential. A key holder who knows a MAC shared by two devices can take over another owner's
   device on MQTT. The `> 1` comparison also looks like an off-by-one: a single match is treated
   as "new device".
2. **`/device/addpush`** (`lib/router.deviceapi.js:97-127` → `device.push`,
   `lib/thinx/device.js:704-740`). The `Authentication` header is sanitized but never verified.
   `device.push` looks the device up by the body udid and writes its push token, so anyone can
   set the push token of any udid.
3. **`device.ott_request`** (`lib/thinx/device.js:1153-1154`). It reads `req.owner`, which is
   always undefined, so `sanitka.owner` throws and the request answers 500. The OTT flow is dead
   (it fails closed).
4. **`messenger.updateAndTransformDeviceStatus`** (`lib/thinx/messenger.js:377-398`). It edits the
   device named by the topic udid without comparing `doc.owner` with the topic owner, and relies on
   the broker ACL alone.
5. **`device.firmware`** (`lib/thinx/device.js:1209`, `:1285`, informational). It verifies the key
   for the body owner, then loads the device by udid without a compare. The envelope path belongs
   to the verified owner, so no cross-owner firmware is served.

## Fix

1. **Resolved 2026-10-03 (quick 261003-tv5).** On the MAC-fallback branch, compare `existing.owner` with the verified registration owner
   (the same compare the udid branch already does), and fix the `> 1` comparison.
2. Verify the API key against the device owner (`apikey.verify(doc.owner, key)`) before writing
   the push token.
3. Take the owner from the registration body, verify the key for it, and only then store the OTT.
4. Compare `doc.owner` with the topic owner `oid` (`Device.isOwnedBy`) before editing or running
   transformers.
5. Add the same `Device.isOwnedBy(device, firmware_owner)` compare for consistency.

Each change needs a firmware check-in regression spec (ZZ-RouterDeviceAPISpec) before it ships,
because these paths are what deployed devices call.

## Resolution — item 1 (quick 261003-tv5)

Commits (thinx-staging, not pushed):
- `48e7195e` test: failing spec `spec/jasmine/DeviceRegisterOwnerSpec.js` (RED: 17 specs, 12 failures)
- `19156a8b` fix: `Device#resolveRegistration` in `lib/thinx/device.js`; `register` re-wired to it
- Task 2 commit (`test(quick-261003-tv5): CI register owner-binding regressions; resolve device-side todo item 1`):
  four 261003-tv5 cases in `spec/jasmine/ZZ-RouterDeviceAPISpec.js` and this resolution

Operator decision: "/device/register, when it falls back to matching by MAC, should check in as
a device of the api key's owner."

What changed (`resolveRegistration(owner, requested_udid, mac, cb)`, owner = the owner the API key
was verified for, exact match since quick 261003-s59):
1. **MAC fallback is owner-scoped.** `devices_by_mac` rows (same key, `normalizedMAC`) are filtered
   in memory with `Device.isOwnedBy(doc, owner)` (rows with an invalid udid are dropped too). The
   first owned row in view order (doc id order for equal keys) is checked in as; otherwise a new
   device of the key owner. Rows of other owners are only counted in one info line.
2. **Off-by-one restored.** The more-than-one-row check came from `0d30f36f` (2022-03-21, #304);
   since then a single same-owner match created a duplicate on every no-udid registration. Any
   owned match now reattaches again (pre-2022 semantics, restricted to the owner).
3. **Udid path, same rule.** Only a valid body udid is looked up. Own document → check-in (as
   before). 404 (absent or revoked) → kept as the new device's udid (DeviceSpec (02) relies on
   it). Another owner's document, any other lookup error, a malformed or absent udid → never used;
   a fresh `uuidV1()`. The owner-scoped MAC step runs next either way.
4. **No new view.** `devices_by_owner` would load every device of the owner per registration;
   `devices_by_udid` is not needed (register reads by `_id`); an owner+MAC view would not reach
   production, because `_design/devices` is inserted create-only at boot (`lib/thinx/database.js`),
   and it would rebuild every view of that design doc. MAC collisions keep the rows small.
5. **Response for firmware.** New device: the existing new-device shape with the key owner and the
   fresh or kept udid; check-in: the existing check-in shape with the owned device's udid.
   THiNXLib adopts `owner`, `alias` and `udid` on "OK", so firmware takes over the new udid.
6. `authorize_mqtt` stays before `insert` on the new-device branch (firmware connects to MQTT
   immediately); the udid it sees is now always owned, proven free (404) or freshly minted.

Who is affected in production:
- (a) A device that registers without its own known udid (first boot, factory reset, reflash
  without `thinx.json`, or a malformed/foreign udid), whose MAC appears on ≥2 documents where the
  first by doc id belongs to another owner. Before: it checked in as that other owner's device
  (MQTT takeover, document overwrite, foreign owner/udid in the response). After: a new device of
  its own key owner, or a reattach to its own owner's device with that MAC.
- (b) A device whose stored udid now belongs to another owner (for example after a transfer while
  it still carries the old owner's key, or a cloned config image). Before: "Insert failed", after
  overwriting that udid's MQTT password with its key. After: a new device of its key owner with a
  fresh udid, which it adopts.
- (c) A device of an owner that has exactly one device with the same MAC and presents
  no/absent/malformed/foreign udid. Before: a new duplicate device per such registration (since
  2022). After: it reattaches to the existing device and keeps its udid, alias, source, mesh ids,
  transformers and environment. Boards with a factory-default or cloned MAC under one owner now
  collapse onto one record.
- (d) A malformed body udid. Before: a document with `udid: null` and MQTT username "null". After:
  a fresh udid.
- (e) Unchanged: the steady-state check-in of a device presenting its own udid.

Post-deploy checks (operator, read-only):
- Before push, optional: on the node running the CouchDB task (`docker service ps thinx_couchdb`),
  a read-only query over managed_devices grouping device docs by `mac`; report counts only — MACs
  whose devices span more than one owner, and (owner, MAC) pairs with more than one device. Those
  are cases (a) and (c) the next time one of them registers without its own udid.
- After deploy, on the node running the `thinx_api` task (node-local `docker logs`, not
  `docker service logs`), compare over a few hours against the pre-deploy rate:
  `[register] ignoring registration udid`, `[register] MAC fallback ignored`,
  `Checking as existing device [2]`, `[DEVICE_NEW]`. A burst of `[DEVICE_NEW]` paired with
  "ignored" lines marks devices that used to land on another owner's record; fewer `[DEVICE_NEW]`
  with more "[2]" lines marks duplicates that now reattach.
- In the console, a known device's "last connected" keeps advancing, and an owner's device list
  shows no unexpected new duplicates.

Residual risk:
- Cross-owner check-ins before the fix are not reverted. Another owner's key may still be the MQTT
  password of a victim udid until that device registers again with its own key, which
  re-authorizes it. The victim document's check-in fields (version, firmware, status, push token,
  location) were overwritten by the foreign registration.
- Devices that adopted another owner's id from a hijacked response already fail key verification
  on every registration. That is not caused or fixed here; they need their `thinx.json`
  owner/key corrected.
- Items 2-5 above (`/device/addpush`, `ott_request`, `updateAndTransformDeviceStatus`, firmware
  compare) stay open.
