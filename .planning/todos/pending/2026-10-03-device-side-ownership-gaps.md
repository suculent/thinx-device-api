---
created: 2026-10-03T22:00:00.000Z
title: Device-originated paths act on a udid without checking its owner
area: device-api
severity: high
files:
  - lib/thinx/device.js:982-1004 (register MAC fallback, devices_by_mac rows[0] of any owner)
  - lib/thinx/device.js:415 (checkinExistingDevice -> authorize_mqtt with the caller's key)
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

1. **Register MAC fallback** (`lib/thinx/device.js:982-1004`, `:415`). A registration that names
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

1. On the MAC-fallback branch, compare `existing.owner` with the verified registration owner
   (the same compare the udid branch already does), and fix the `> 1` comparison.
2. Verify the API key against the device owner (`apikey.verify(doc.owner, key)`) before writing
   the push token.
3. Take the owner from the registration body, verify the key for it, and only then store the OTT.
4. Compare `doc.owner` with the topic owner `oid` (`Device.isOwnedBy`) before editing or running
   transformers.
5. Add the same `Device.isOwnedBy(device, firmware_owner)` compare for consistency.

Each change needs a firmware check-in regression spec (ZZ-RouterDeviceAPISpec) before it ships,
because these paths are what deployed devices call.
