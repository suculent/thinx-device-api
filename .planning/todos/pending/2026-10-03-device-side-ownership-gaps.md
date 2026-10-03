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
  - lib/thinx/device.js:1153-1154 (ott_request reads req.owner, always undefined) — resolved by quick 261003-v9x
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
3. **Resolved 2026-10-03 (quick 261003-v9x).** **`device.ott_request`** (`lib/thinx/device.js:1153-1154`). It reads `req.owner`, which is
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
3. **Resolved 2026-10-03 (quick 261003-v9x).** Take the owner from the registration body, verify the key for it, and only then store the OTT.
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

## Resolution — item 3 (quick 261003-v9x)

Commits: `189269ff` (RED spec `spec/jasmine/DeviceOttSpec.js`), `360a77ca` (`lib/thinx/device.js`
fix), `0a47639c` (`lib/router.deviceapi.js` log redaction), and the commit
"test(quick-261003-v9x): CI OTT owner-binding regressions; resolve device-side todo item 3"
(ZZ cases, this section, the new redemption todo).

Correction to the Problem text: `sanitka.owner(undefined)` returns null rather than throwing, so
`ott_request` answered `OTT_API_KEY_NOT_VALID` (HTTP 200), not 500. The flow was still dead.

**The rule (same as check-in after tv5/u86 and addpush in v9d).** The owner comes from the request
body (`body.registration` unwrapped, as `device.firmware` does). The `Authentication` key must
verify for that owner with `APIKey#verify` in its 4-argument form: exact, fail-closed since s59, no
u86 transfer redirect. The body udid must then be that owner's device (`Device#fetchOwned`). The
key does not also have to be the device's own key (`lastkey`): u86 records `lastkey` at check-in
but no device path enforces it, and enforcing it only here would make OTT stricter than the
firmware path it duplicates. A per-device-key rule would have to cover register, firmware, addpush
and OTT together.

**What is stored.** Exactly `{owner, udid}`: the verified owner and the owned document's udid
(`ott_request`), or the checked-in device's owner and udid (register `FIRMWARE_UPDATE` branch).
Before, the whole request or registration body sat in Redis for 24 h (push token, location,
environment hashes).

**Redemption re-validates.** `GET /device/firmware?ott=` refuses a token that is not 64 lowercase
hex before Redis is touched. The record must parse, its owner and udid must pass `sanitka`, and
the udid must still be owned by that owner, so a transfer or revoke after issuance kills the
token. A failing record is deleted (`OTT_INFO_NOT_FOUND`). Only the sanitized, owned owner/udid
reach `deploy.latestFirmwarePath`. Tokens issued before the deploy (full-body records) keep
working when their owner/udid are valid and owned.

**Token properties.** 32 random bytes from `crypto`, hex (the same 64-char shape, so firmware
URLs are unchanged), written with one `SET ... EX 86400`. Before, the token was
`sha256(new Date().toString())`: one-second resolution, enumerable, and two tokens issued in the
same second collided. Lifetime: 24 h unredeemed, then at most 3600 s after the first redemption,
never extended. Before, `update_binary` re-set 3600 s on every redemption (a token redeemed hourly
never expired) and the forced firmware path did the same for any body-supplied `ott`.
Reuse inside the ≤1 h window is deliberate: THiNXLib keeps `deferred_update_url` after
`HTTP_UPDATE_FAILED` and retries the same URL from `loop()`
(`thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp:1020-1045`, `:1666-1730`,
`:2174-2180`). A replay only re-serves the same owner's firmware for the same udid.

**Live cross-owner read closed (register path).** Since tv5, a registration whose body udid is
malformed (for example `../<ownerA>/<udidA>`) falls back by MAC to the key owner's own device and
checks in, but `storeOTT(reg)` stored the raw body udid. `ott_update` passed it to
`latestFirmwarePath`, which sanitizes the owner but not the udid, and `Filez.deployPathForDevice`
concatenates `<deploy_root>/<owner>/<udid>`. Preconditions: owner B's own key, an own auto-update
device with a pending build, and knowledge of A's owner id and udid. Result: B redeemed a token
serving A's latest firmware (which can embed environment values such as Wi-Fi credentials). The
register path now stores the checked-in binding, and redemption rejects such a record anyway.

**Who is affected:**
- (a) `POST /device/firmware` `{use: "ott"}`: no known firmware caller. It works again for key
  holders on their own devices (it always answered `OTT_API_KEY_NOT_VALID` before).
- (b) `FIRMWARE_UPDATE` check-ins: tokens are random and bound to the checked-in device. A failed
  Redis write now answers status `OK` without an ott (before: an unredeemable token).
- (c) Tokens issued before the deploy: honoured only when owner/udid are valid and owned, else
  refused and deleted.
- (d) OTA behaviour on devices is unchanged, because the redemption serialization is untouched
  (see the new todo below).
- (e) Logs no longer carry full tokens (router GET/POST, `ott_update`, `registration_response`).

**Residual risk:** tokens are bearer secrets readable by anyone who can read Redis or sniff the
plaintext port 7442 (`__DISABLE_HTTPS__` builds); the replay window is ≤1 h; per-device key binding
is not enforced; `device.firmware` with a body `ott` uses the same 4-argument verify, so a
transferred device presenting its previous owner id gets `OTT_API_KEY_NOT_VALID` there (no known
firmware sends it).

Follow-ups: `.planning/todos/pending/2026-10-03-ott-redemption-serves-json-not-binary.md`
(redemption serialization since `fee22323`, strict one-time redemption, plaintext port, sink-level
udid guard). Items 2, 4 and 5 above stay open.
