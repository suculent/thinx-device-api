---
created: 2026-10-03T19:00:00.000Z
title: Builder embeds the masked API key name into firmware (THINX_API_KEY never matches)
area: builder
severity: major
files:
  - lib/thinx/apikey.js (get_last_apikey returns kdata.name, the masked display value)
  - lib/thinx/builder.js:739 (json.THINX_API_KEY = api_key)
  - lib/thinx/messenger.js:370 (apikey.key on a string, always undefined)
  - lib/thinx/apikey.js:137 (create() duplicate check iterates the raw JSON string)
---

## Problem

`APIKey.get_last_apikey` returns `kdata.name`, which `list()` builds as 30 asterisks plus
`key.substring(30)`. `lib/thinx/builder.js:739` writes that value into `THINX_API_KEY`, so firmware
built by THiNX carries a key that never equals a stored key or hash.

- Device registration with that key already fails today (the HTTP verify path rejected it before
  CR-01 too, unless the masked tail happened to be a substring match, which the asterisks prevent).
- Firmware/OTT requests with that key used to pass only through the non-HTTP fall-open in
  `log_invalid_key`. Quick task 261003-s59 (CR-01) closed that fall-open, so these requests now fail
  with `owner_found_but_no_key` / `OTT_API_KEY_NOT_VALID`.

Related, also pre-existing:
- `lib/thinx/messenger.js:370` reads `apikey.key`, but `get_first_apikey` already calls back with the
  key string, so `_auth` is always `undefined` on the MQTT registration path.
- `APIKey.create()`'s duplicate check (`for (let key in json_keys)`) iterates the raw JSON string, not
  the parsed array, so `key.key` / `key.alias` are always undefined and the check never fires.

Found during quick task 261003-s59; not fixed there.

## Fix

Make `get_last_apikey` return the real key (or the hash, which verify also accepts) to the builder,
without exposing it in the console list. Fix `messenger.js` to use the string it receives. Iterate
`api_keys` (parsed) in `create()` and compare with `Util.safeEqual`. Add specs for each.

## Resolution

Done 2026-10-04 in quick 261003-vep: failing spec `238c1624`, builder fix `28905881` (Task 1),
create() fix `ef87af26` (Task 2), MQTT registration fix `8ea88930` (Task 3). Not pushed.

**The rule.** A build embeds the device's own credential: the pre-image of the device's `lastkey`
in `ak:<owner>`, found with u86's `APIKey.findDeviceKey`. That is the entry's key when
`sha256(key)` equals `lastkey`, and its hash when `sha256(hash)` equals `lastkey`.
`APIKey#get_device_apikey(owner, lastkey, cb)` implements it, and `Builder#getDeviceAPIKey`
replaces the `list()`-based fetcher.
- It never embeds the owner's Default MQTT API Key, which is the owner's broker password.
- It embeds `""` and the build goes on when the device's key is unidentified, ambiguous, or the
  Default MQTT key. The firmware then keeps its saved or sketch key, as with stock firmware.
- It refuses the build with `build_requires_api_key`, as before, when the owner has no keys, the
  store is not a JSON array, or Redis errors.
- `list()` is unchanged (masked `name`) and is no longer read by the builder.

**Why the hash is not embedded unconditionally.** `verify` accepts a key and a hash with equal
power on every API-key route, so the hash would not shrink the blast radius. Embedding the value
the device already presents also leaves the device's MQTT password (`authorize_mqtt`) and its
`lastkey` exactly as they are.

**Why the messenger does not use the owner's first key.** Using the string literally would
re-check-in any device named in a message body with an owner-wide key, often the Default MQTT key.
That would reset those devices' broker passwords and let any publisher on the owner's status topics
trigger owner-key-backed registrations. Now only the publishing device registers:
- the topic is `/<owner>/<udid>/status`;
- the registration names that udid and owner;
- the device is the topic owner's own device (vbg's `withAcceptedDevice`; a transferred device's
  previous-owner topic is not accepted for registration);
- the credential is its own, from `get_device_apikey`.

No key is created on that path. `registerDevice` no longer throws on a failed registration. The
path stays gated by `THINX_MQTT_DEVICE_WRITES` (quick 261003-w0c).

**create().** It checks the parsed array with `Util.safeEqual` (`key_already_exists` /
`alias_already_exists`) and refuses a non-array store (`apikey_store_invalid`) without writing.
`create_key` is now `crypto.randomBytes(32)` hex, the same 64-hex shape. The old timestamp-derived
key repeated within one second, so the working duplicate check would have refused back-to-back
creates.

**Operator-facing changes:**
1. THiNX builds for devices with an identifiable own key embed a working key (the key or the hash,
   whichever the device uses). Other builds embed `""`, so the device keeps its saved key. OTA is
   unaffected.
2. Devices on the owner's Default MQTT API Key get no embedded key. Remedy: create a dedicated key,
   enter it on the device and let it check in once.
3. Creating a key with an alias the owner already has answers `set_api_key_failed`. New keys are
   random. Existing duplicate entries stay; devices on them count as ambiguous and build with `""`.
4. MQTT registration re-registers only the publishing device with its own key and never creates a
   key.
5. No data migration.

Spec: `spec/jasmine/BuilderApiKeySpec.js` (local, no Redis/CouchDB/broker). CI-only adjustments:
`ApikeySpec` (01b) and `XBuilderSpec` "should refuse a device API key for an owner without keys".
Follow-ups: `.planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md`.
