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
