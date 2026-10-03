---
created: 2026-10-03T22:00:00.000Z
title: Device-originated paths act on a udid without checking its owner
area: device-api
severity: high
files:
  - lib/thinx/device.js:982-1004 (register MAC fallback, devices_by_mac rows[0] of any owner) — resolved by quick 261003-tv5
  - lib/thinx/device.js:415 (checkinExistingDevice -> authorize_mqtt with the caller's key) — resolved by quick 261003-tv5
  - lib/router.deviceapi.js:97-127 (/device/addpush never verifies the Authentication key) — resolved by quick 261003-v9d
  - lib/thinx/device.js:704-740 (push writes the push token of any udid) — resolved by quick 261003-v9d
  - lib/thinx/device.js:1153-1154 (ott_request reads req.owner, always undefined) — resolved by quick 261003-v9x
  - lib/thinx/messenger.js:377-398 (updateAndTransformDeviceStatus edits by topic udid) — resolved by quick 261003-vbg
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
2. **Resolved 2026-10-03 (quick 261003-v9d).** **`/device/addpush`** (`lib/router.deviceapi.js:97-127` → `device.push`,
   `lib/thinx/device.js:704-740`). The `Authentication` header is sanitized but never verified.
   `device.push` looks the device up by the body udid and writes its push token, so anyone can
   set the push token of any udid.
3. **Resolved 2026-10-03 (quick 261003-v9x).** **`device.ott_request`** (`lib/thinx/device.js:1153-1154`). It reads `req.owner`, which is
   always undefined, so `sanitka.owner` throws and the request answers 500. The OTT flow is dead
   (it fails closed).
4. **Resolved 2026-10-03 (quick 261003-vbg).** **`messenger.updateAndTransformDeviceStatus`** (`lib/thinx/messenger.js:377-398`). It edits the
   device named by the topic udid without comparing `doc.owner` with the topic owner, and relies on
   the broker ACL alone.
5. **`device.firmware`** (`lib/thinx/device.js:1209`, `:1285`, informational). It verifies the key
   for the body owner, then loads the device by udid without a compare. The envelope path belongs
   to the verified owner, so no cross-owner firmware is served.

## Fix

1. **Resolved 2026-10-03 (quick 261003-tv5).** On the MAC-fallback branch, compare `existing.owner` with the verified registration owner
   (the same compare the udid branch already does), and fix the `> 1` comparison.
2. **Resolved 2026-10-03 (quick 261003-v9d).** Verify the API key against the device owner (`apikey.verify(doc.owner, key)`) before writing
   the push token.
3. **Resolved 2026-10-03 (quick 261003-v9x).** Take the owner from the registration body, verify the key for it, and only then store the OTT.
4. **Resolved 2026-10-03 (quick 261003-vbg).** Compare `doc.owner` with the topic owner `oid` (`Device.isOwnedBy`) before editing or running
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

## Resolution — item 2 (quick 261003-v9d)

Commits: `1b0fa6bc` (RED spec `spec/jasmine/DevicePushOwnerSpec.js`: 19 specs, 13 failures on
the unfixed code), `25a4ecfd` (`Device#push` in `lib/thinx/device.js`, addpush route comment in
`lib/router.deviceapi.js`), and the commit "test(quick-261003-v9d): CI addpush owner regressions;
OpenAPI addpush contract" (six ZZ cases, the OpenAPI `/device/addpush` entry). This section is
committed with the quick task's docs.

**The rule (same as check-in after tv5/u86 and OTT in v9x).** A push token is written only when:
1. the body names an owner: `owner` is a string accepted by `sanitka.owner` (absent, null,
   non-string or malformed counts as not named);
2. the `Authentication` key verifies for that owner with `APIKey#verify` in its 4-argument form
   (exact, constant-time, fail-closed since s59);
3. the udid is that owner's device (`Device#fetchOwned`: a malformed udid never reaches CouchDB,
   strict `Device.isOwnedBy`, lookup errors fail closed).
Then `edit({udid, push})` writes the `push` field and nothing else (alias, lastkey, owner and
any other body field are ignored).

**Owner field — what does the client send?** Evidence recorded while planning:
- The router is the only server caller of `device.push`. A repo-wide grep (excluding
  node_modules) finds `addpush` only in the router, `spec/jasmine/ZZ-RouterDeviceAPISpec.js`, a
  comment list in `docs/APIs.md` and `thinx-api-openapi.yaml`.
- THiNXLib never calls addpush (`thinx-firmware-esp8266-ino/.../THiNXLib.cpp`,
  `thinx-firmware-esp8266-pio/.../THiNXLib.cpp`, the `spec/test_repositories/thinx-firmware-esp8266`
  submodule): they only POST `/device/register` and GET `/device/firmware?ott=`.
  `thinx-firmware-esp32-pio/lib/thinx-firmware-esp32` is an empty submodule directory here.
- A public GitHub code search for `"device/addpush"` finds only this server and its mirror.
  Private repositories are unknown.
- The accepted token formats (64-hex APNs, FCM) point at a mobile client that never shipped.
  Nothing in the server reads `device.push` (the FCM loop in `lib/thinx/notifier.js` is
  commented out).
- So no client names an owner today. The request names it in a top-level `owner` field, the name
  THiNXLib uses in `registration.owner` and `device.firmware` reads from its body.

**Answers** (all HTTP 200 through `Util.responder`, the device-API failure convention):
- `authentication`: absent/empty key, absent/invalid owner, a key that does not verify for the
  named owner. Decided before any device lookup and from (owner, key) only; verify's internal
  messages (`owner_found_but_no_key` / `apikey_not_found`) are collapsed into it.
- `push_device_not_found`: malformed, absent or non-string udid, unknown udid, another owner's
  udid, lookup error. Unknown and foreign udids answer byte-identically after the same work (one
  verify, one `devicelib.get`), so the route is no udid-existence oracle. `fetchOwned`'s
  `no_such_device` is mapped to the endpoint's established not-found answer.
- `push_token_not_registered`: the write failed (it answered success before).
- Unchanged: the router's 403 for a missing/malformed Authentication header, `no_body`,
  `no_token`, `invalid_type_*`, success `push_token_registered`.
- Logs: the line that printed the whole request body (push token included) is gone. The new lines
  (`• Push Registration for udid …`, `[push] refused <category> for udid …`) name only the
  sanitized udid.

**No lastkey binding.** Any key of the owner (its key or its hash) is accepted, as on check-in,
which never compares the presented key with the device's `lastkey`. Requiring the device's own key
would make addpush stricter than check-in (which re-issues the MQTT credential), break after every
re-key until the next check-in, and fail for devices with no or a legacy `lastkey`. addpush never
writes `lastkey`, so check-in stays its only writer and u86's transfer key identification is
unaffected.

**No transfer continuity on addpush.** `push()` calls `verify` with exactly four arguments and
never builds u86's device context, so a request naming the previous owner of a transferred device
is refused with `authentication` (register and firmware check-in would redirect it). A request
naming the current owner works directly. The transfer binding in the current owner's store is
never read through or modified by this path (spec P19: `ak:<current owner>` stays byte-identical).
Correction to the plan's rationale: the plan argued that passing the context would let a
push-token call consume the binding before the device re-registered. u86 as landed has no
consumption at all (operator decision 3: the binding ends on key revoke, owner purge or the next
transfer), so that risk does not exist; the decision stands because no firmware calls addpush and
the OTT path (v9x) also uses the 4-argument form.

**Who is affected in production:**
- (a) A caller writing the push token of a device that is not its key owner's: refused. Nothing
  consumed that field, so no delivery changes.
- (b) A caller naming no owner, which is every request shape documented or tested so far: now
  `authentication`. No known client exists. If one appears, it must add `owner`, its key's owner
  id.
- (c) The owner's key plus `owner` plus its own udid: unchanged success. A failed write now answers
  `push_token_not_registered`.

Pre-deploy, read-only (operator, optional), on the node running the `thinx_api` task (placement
floats; node-local `docker logs`, not `docker service logs`) — count only, never print matching
lines (they contain push tokens and bodies):
- `• Push Registration` lines: whether anything calls addpush at all;
- of those, lines containing `"owner":`: whether that client already names an owner.
Post-deploy: count `[push] refused` lines.

**Residual risk:**
- Push tokens overwritten by foreign callers before the fix are not reverted (no consumer reads
  them).
- An unauthenticated but well-formed request still costs one Redis GET; a verify failure writes an
  audit and a stats entry for the named owner, as `/device/register` does. No CouchDB access
  happens before authentication (before the fix every request read CouchDB).
- TOCTOU between `fetchOwned` and the atomic write if the device is transferred in that
  millisecond window; the field has no consumer.

Items 3-5 are not touched by this task.

## Resolution — item 4 (quick 261003-vbg)

Commits (thinx-staging, not pushed):
- `ffe6e32e` test: failing spec `spec/jasmine/MessengerOwnershipSpec.js` (RED: 39 specs, 31 failures,
  all assertion failures)
- `e6367b80` fix: owner-checked MQTT status path in `lib/thinx/messenger.js`
- `11605dfc` fix: `APIKey#checkTransferBinding` in `lib/thinx/apikey.js`; transfer-binding branch
  and owner-checked actionable notifications in `lib/thinx/messenger.js`
- `a314d54d` test: two CI cases in `spec/jasmine/MessengerSpec.js`
- `84f23c20` test: spec (8)'s `Date.now` spy stays inside a synchronous body
This section is committed with the quick task's docs.

**The accept rule as implemented.** For a status, check-in or actionable message on
`/<topicOwner>/<udid>/…` (`Messenger#withAcceptedDevice`):
1. `topicOwner` must pass `Sanitka.strictOwner` (exactly 64 `[a-z0-9]`) and `udid` a silent
   `^[a-fA-F0-9-]{36}$` test plus `Sanitka.udid`; otherwise `malformed_topic`, before CouchDB or Redis.
   `messageResponder` already drops a topic whose first segment is not empty or whose owner segment
   is invalid, before MQTT registration, the status edit or any notification.
2. One `this.devicelib.get(udid)`; an error or no document → `unknown_device`.
3. `Device.isOwnedBy(doc, topicOwner)` → accepted as `doc.owner`, with no `ak:` read.
4. Otherwise `current = Sanitka.strictOwner(doc.owner)` (invalid → `foreign_owner`), then
   `this.akey.checkTransferBinding(current, udid, doc.lastkey, topicOwner)`: one GET of
   `ak:<current>`, `parseKeyStore`, `APIKey.findDeviceKey(entries, doc.lastkey)` (the device's own
   key entry, exactly one match), then `APIKey.findTransferBinding(entries, <that entry's hash, else
   key>, udid, topicOwner)`. Error or malformed store → `binding_lookup_failed`; false →
   `foreign_owner`; true → accepted as `current`. It never searches other owners' stores, logs
   nothing and writes no audit entry.
5. Accepted handlers act as `doc.owner`: `Device#edit({udid, status})`, `Owner#profile(doc.owner)`
   and `runDeviceTransformers(profile, doc, null, null, null)` — the same calls as before, except that
   the profile owner is now `doc.owner` instead of the topic owner.

Gated handlers: `updateAndTransformDeviceStatus` (only for exactly `/<owner>/<udid>/status`: 4
segments, the first empty, the last `status`), `processStatus` (returns before any read unless the
status is `connected`/`disconnected`) and `processActionableNotification` (both branches, and its
payload log line, run only inside the accepted callback). Unchanged: `mqttDeviceRegistration`
(key-verified `Device#register`, now only ever given a valid owner), `processConnectionChange` and
`processUnknownNotification` (socket relay), `message_callback` (dormant, see (g)).

Drop logging: `⚠️ [warning] [messenger] dropped MQTT device message: <reason>, udid <sanitized udid or ->`,
at most one line per message, at most 5 lines per fixed 60 s window (`Date.now()`), and the first line
of a window carries ` (<n> suppressed in the previous window)` when n > 0. Reasons:
`malformed_topic`, `unknown_device`, `foreign_owner`, `binding_lookup_failed`. No line carries a
payload, the raw topic, an owner id, a key, a hash or a lastkey. Accepted messages log nothing new.

**Operator decision (2026-10-03):** a transferred device's previous-owner topic is ACCEPTED through
the u86 transfer binding, by the operator's choice, after being told the trade-off. Firmware that keeps
the previous owner id (EEPROM builds, builds passing an owner id to the constructor; continuity
leftovers item 2) keeps publishing `/<previous owner>/<udid>/status`, and that traffic keeps working.

**Accepted residual risk:** the sender's owner credential may publish `/<sender>/#`, so for as long as
the binding lives (until key revoke, owner purge or the next transfer; never consumed, u86 decision 3)
it can forge the transferred device's status, run the recipient's transformers on forged input, send
check-in/actionable notifications and write `nid:<udid>`. The scope is narrowed to: exactly this udid;
the topic owner listed in `from`; the entry `doc.lastkey` identifies; applied as `doc.owner`. Remedy for
a recipient: re-key the device (create a key, reprovision, let it check in once so `lastkey` identifies
an unbound entry) or revoke the moved key.

**Follow-up ideas (not planned):**
- A per-device MQTT topic namespace or a publisher-identity check: accept old-topic status only when the
  device's own credential published it (MQTT 5 user properties set by a broker plugin, or a
  `/d/<udid>/status` namespace whose ACL only the udid user holds).
- ACL cleanup on transfer (`2026-10-03-transfer-continuity-leftovers.md` item 1). It must be reconciled
  with this rule: removing the sender's topics from the udid's ACL stops the device itself from
  publishing on the old topic, but the sender's owner credential (`/<sender>/#`) still can.
- A messenger-side marker: once a status arrives on `/<recipient>/<udid>/status`, stop accepting the old
  topic for that udid, without consuming the HTTP binding (u86 decision 3 stays intact).
- Delivery limitation: old-topic messages reach the API only through a per-owner messenger client of
  the previous owner (subscribed to `/<sender>/#`); the recipient's client never sees them, so
  acceptance happens only while such a client is connected.

**Broker ACL analysis.** mosquitto-go-auth, Redis backend, superuser disabled
(`services/broker/config/mosquitto.conf:49`, `:71`); ACL sets `<user>:racls|wacls|rwacls|sacls` are
written by `lib/thinx/acl.js` `commit_redis` (`sAdd` only, `:151-178`).
- Device user (username udid; `Device#authorize_mqtt`, `lib/thinx/device.js:792-813`): readwrite on
  `/<owner>/<udid>`, `/<owner>/<udid>/status`, `/<owner>/shared/#`, `/<owner>/<mesh>`, for every owner
  it registered under.
- Owner user (`Owner#create_default_acl`, `lib/thinx/owner.js:740-752`): readwrite on `/<owner>`,
  `/<owner>/#`, `/<owner>/shared/#`. Every user also gets subscribe `/#`.
Why the server-side check is still needed:
1. The ACL is prefix-based, not ownership-based: owner A's credential may publish
   `/A/<B's udid>/status`.
2. ACL drift is built in: `commit_redis` only adds, nothing removes on transfer, and `addTopic`
   de-duplicates by substring (`lib/thinx/acl.js:85`, `:106`).
3. MQTT 3.1.1 delivers no publisher identity to subscribers.
4. Broker and Redis configuration drift independently of CouchDB.
The binding rule narrows point 1 to the one case the operator accepted.

**What changes for real users:**
1. Status, check-in and actionable messages for another owner's udid are ignored, with one
   rate-limited warning line each.
2. A transferred device still publishing on its previous owner's topic keeps working (operator
   decision); its updates land as the current owner's device with the current owner's transformers,
   while the moved key keeps its binding and stays the device's key. Re-keying the device or revoking
   the moved key ends it.
3. Only the exact `/<owner>/<udid>/status` topic edits device status. Topics whose owner segment is not
   a valid owner id are ignored entirely, including MQTT registration and the socket relay.
4. Production caveat: because of (a) below, none of this message processing is believed to run in
   production today. The gate is in place for CI and for whenever (a) is fixed.

**Post-deploy checks (operator, read-only):** on the node running the `thinx_api` task (placement
floats; node-local `docker logs`, not `docker service logs`), count `[messenger] dropped MQTT device message`
lines by reason (`malformed_topic`, `unknown_device`, `foreign_owner`, `binding_lookup_failed`) and
`suppressed in the previous window` lines. Given (a), zero lines is the expected outcome today.

**Residual risks beyond the accepted one:**
- TOCTOU of one round trip between the ownership/binding read and the atomic modify (same window t29
  accepted).
- The broker ACL itself is not cleaned (continuity leftovers item 1).
- An owner can publish status for its own devices, by design.

Items 2, 3 and 5 are not touched by this task (2 and 3 resolved by v9d/v9x; 5 stays open).

## Found during item 4 (quick 261003-vbg), not fixed

Each claim was re-verified against the tree after the vbg commits (line numbers are post-vbg).

- **(a) `forwardNonNotification` most likely crashes the API process on every non-notification MQTT
  message outside `ENVIRONMENT=test` — severity high.**
  - Operator read-only check first: `thinx_api` task restart count (`docker service ps thinx_api`), and
    on the node running it, node-local `docker logs <container> 2>&1 | grep -c "reading 'sendMessage'"`.
  - Evidence: `createInstance` sets `this.rtm = null` and `this.channel = null`
    (`lib/thinx/messenger.js:58`, `:61`) and `DISABLE_SLACK = true` (`:73`), so `initSlack` returns
    before it ever assigns `this.rtm` (`:145`, `:160`). `forwardNonNotification` (`:349-360`) tests
    `typeof (this.rtm) !== "undefined"` — `typeof null` is `"object"` — and calls
    `this.rtm.sendMessage` whenever `ENVIRONMENT !== "test"`: a TypeError. It runs in
    `messageResponder` before any status processing. mqtt.js 5.16.0 emits `message` without a
    try/catch (`node_modules/mqtt/build/lib/handlers/publish.js:109`, `:121`) and no
    `uncaughtException` handler exists in `thinx.js`, `thinx-core.js` or `lib/`.
  - CI runs `ENVIRONMENT=test`, so CI never sees it. Not fixed: fixing it activates the transformer path
    below in production, which is an operator decision.
- **(b) The transformer path reached from MQTT is broken in three ways — severity medium**
  (`lib/thinx/device.js`, `runDeviceTransformers` `:522-722`), called from the messenger with
  `reg = null`, `callback = null`:
  - `typeof (reg) !== "undefined"` is true for null, so `transformedStatus = reg.status` (`:562`)
    throws a TypeError as soon as a transformer matches; the lambda error handler reads `reg.status`
    too (`:693`).
  - `transformers: []` (the default) calls `update_device_and_respond(device.udid, device, …)` (`:533`)
    with the pre-update document read before `Device#edit`, racing the status edit and possibly writing
    the old status back.
  - The lambda response handler calls `devicelib.get(udid, …)` (`:652`) where no `udid` is declared in
    that function's scope (the `let udid` at `:495` belongs to another method): a ReferenceError when a
    lambda answers.
- **(c) Notifications go to the wrong owner's console — severity medium.** `initWithOwner` stores one
  process-wide `this._socket = websocket` (`lib/thinx/messenger.js:978`), even on the
  `client_already_exists` path. Correction to the plan: the caller is `lib/thinx/socket_session.js:94`
  with the verified session owner (`ws.owner`), not the owner named in the WS `init` frame; the
  singleton remains, so notifications go to whichever owner's socket initialized last. Already tracked
  in `.planning/todos/pending/2026-10-03-messenger-websocket-is-process-wide.md`; not duplicated here.
- **(d) `this.socket` is never set — severity low.** It is null after `createInstance` (`:57`) and
  never assigned, so `sendWithValidSocket` (`:333`), `processActionableNotification` (`:569`) and
  `processUnknownNotification` (`:628`) throw on `this.socket.OPEN` whenever `_socket` is non-null.
  Before any `initWithOwner`, `this._socket` is `undefined` (createInstance only sets
  `this._private._socket`), so `undefined !== null` passes and `this._socket.readyState` throws first.
- **(e) `processActionableNotification`'s response branch — severity low.** It copies `nid:<nid>`
  (the nid comes from the payload and is not owner-bound) into `nid:<did>` (`:599-611`), and throws on
  `JSON.parse(null).length` (`:601-602`) when that key is absent (`redis.get` answers `(null, null)`, and
  only `error` is checked).
- **(f) Device-bound MQTT publishes never happen — severity low.** `publish()` returns immediately
  while `DISABLE_SLACK` (`:215`), so configuration pushes and notification replies never reach
  devices. Separately, `registerDevice` dereferences `registration_response.registration.udid` even
  when registration failed (`:328`).
- **(g) Master-client callbacks are attached unbound — severity low.** `attach_callbacks`
  (`:866-868`) passes `this.connect_callback` / `this.message_callback` unbound, so they run with
  `this` = the MQTT client: `this.master` is undefined and the master never subscribes `#` (`:808`),
  which keeps `message_callback` dormant. Separately, `data(owner, udid)` builds the KEYS glob
  `"/*" + owner + "/" + udid + "*"` (`:956`), whose leading `*` also matches other prefixes.
