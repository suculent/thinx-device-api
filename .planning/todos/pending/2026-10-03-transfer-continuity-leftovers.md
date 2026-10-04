---
created: 2026-10-03T23:30:00.000Z
title: Transferred devices - what quick 261003-u86 left over
area: device-api
severity: medium
files:
  - lib/thinx/device.js (authorize_mqtt adds topics, never removes them)
  - lib/thinx/transfer.js (accept moves key and owner, not the MQTT ACL)
  - lib/thinx/transfer.js (decline answers its callback twice)
  - lib/thinx/device.js (update_device logs the whole document on a failed write)
  - thinx-firmware-esp8266-ino / thinx-firmware-esp8266-pio THiNXLib.cpp (owner persistence)
---

## Context

Quick task 261003-u86 made a device transfer carry the device's API key, and made a
transferred device that still presents its previous owner id keep working. On
`/device/register` and `/device/firmware`, the triple (previous owner id, moved key, the
device's own udid) is answered as the device's current owner. The OK registration answer
carries the current owner id.

Operator decision 3 (2026-10-03): the transfer binding is never consumed. It stays until the
key is revoked, the owner is purged, or the device is transferred again. So devices whose
firmware keeps re-presenting the previous owner id keep working indefinitely. The items below
are what that task deliberately did not cover.

## Items

1. **MQTT ACL keeps the sender's topics.** `authorize_mqtt` only adds topics. After a
   transfer the udid's ACL still holds `/<sender>/<udid>`, `/<sender>/<udid>/status`,
   `/<sender>/shared/#` and the sender's mesh topics. The device, now the recipient's, can
   still read and write the sender's shared topic. Accept should revoke the sender's topics
   for each moved udid. The next check-in then adds the recipient's topics.

2. **Firmware does not always keep the new owner id.** In THiNXLib (esp8266 ino and pio):
   - EEPROM builds do not persist the adopted owner. `save_device_info()` writes the global
     `json_info` buffer instead of the document it just built.
   - Builds that pass an owner to the `THiNX` constructor re-apply that compiled id at every
     boot. The constructor argument wins over the restored one when it is longer than 4
     characters.
   Such devices keep presenting the previous owner id after every reboot. They keep working
   through the redirect, but they never fully switch (see item 3). Fix in the firmware
   libraries: a saved owner must win over the constructor argument, and the EEPROM save must
   write the new document. The esp32 library submodule was not checked out, so esp32 is
   unverified.

3. **Missed server publishes while the previous id is in use.** Until a device adopts the
   new owner id, it subscribes to `/<sender>/<udid>`. Server pushes published to
   `/<recipient>/<udid>` (configuration push, notifications) are missed. Item 1 also
   determines whether the old topic stays reachable.

4. **Mango index on `lastkey`.** The transfer key gate issues one unindexed `_find`
   (`selector: {lastkey: {$in: ...}}`, limit n+1) per request and per accepted device.
   CouchDB answers it with a full scan and a "no matching index" warning. Add a
   `lastkey` index if transfers get slow. A new design document is needed, because the
   `devices` design is inserted create-only at boot.

5. **`Device#update_device` logs the whole document** (including `lastkey`, which is a
   usable credential since quick 261003-s59, and `environment`) when the atomic write
   fails. Log the udid and the error only.

6. **`Transfer#decline` answers its callback twice** for a live transfer:
   `storeRemainingKeys(...)` calls back, then `callback(true, "decline_completed")` runs as
   well. Over HTTP (the GET decline link in the e-mail, and POST decline) the second answer
   throws "headers already sent" inside the Redis callback. The legacy client's promise then
   calls the same callback again with an error, and that path throws on `JSON.parse`. The
   result is an unhandled rejection. The 261003-u86 CI re-key case leaves its transfer
   pending for this reason, instead of declining it. Answer exactly once.

## Status after 261004-l7q

- **Item 6 resolved** (`656d3d3b`): `Transfer#decline` answers exactly once
  (`storeRemainingKeys` is the only answer). Pinned by TransferRecipientSpec ("the GET decline
  link works without a session and answers once", "library decline ... answers once").
- Items 1-5 unchanged.
