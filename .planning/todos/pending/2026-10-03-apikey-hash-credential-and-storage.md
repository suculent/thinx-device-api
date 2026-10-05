---
created: 2026-10-04T00:00:00.000Z
title: API key residual exposure after quick 261003-w13
area: api
severity: major
files:
  - lib/thinx/apikey.js (key_in_keys accepts .hash; list() still exports hash)
  - lib/thinx/apikey.js (ak:<owner> stores cleartext keys)
  - services/console/vue/src/pages/Apikeys/Apikeys.vue (create modal reads response.key)
  - services/console/vue/src/store/apikeys.js (hidden key header, sample key)
  - services/worker/builder (thinx_build.json and ./* zips)
  - lib/router.auth.js checkMqttKeyAndLogin (unbounded retry)

audit_acknowledged:
  milestone: v1.14
  at: 2026-10-05
---

Found during quick 261003-w13 (console key list carries no cleartext key). Each item was re-checked
with grep on 2026-10-04.

## Items

1. **The list's `hash` is a working credential.** `APIKey#key_in_keys` accepts an exact `.hash`
   with the same power as the `.key` (`lib/thinx/apikey.js:240`), and devices with
   `lastkey = sha256(hash)` use it (u86/vep). `list()` still exports `hash` because both consoles
   need it for revoke and device links. Path to close it:
   - `list()` adds a non-credential fingerprint (for example sha256(hash));
   - `revoke` accepts that fingerprint;
   - console switch: classic `apikey.html`, `main.js` getApikeyByHash, `thinx-api.js`
     meta.apikeys/keyhash, `device.html`; Vue `store/apikeys.js` deleteItems;
   - migrate device `keyhash` values;
   - then drop `hash` from the list.
   The alternative is retiring hash authentication after a field audit (item 2).
2. **Retiring hash authentication.** Audit by count only, never printing values: devices whose
   `lastkey` equals sha256(entry.hash) of their owner's store. Then verify by constant-time
   sha256(presented) == stored hash.
3. **Redis cleartext storage (Decision B of w13).** `ak:<owner>` keeps `.key`. Not safe to drop
   today: the owner's Default MQTT API Key is the Mosquitto password the API presents
   (`messenger.js` fetchKeyAndPublish `password: apikey.key`), the stored hash is itself a
   credential (item 1), and vep's builder embeds `.key` for devices that authenticate with it.
   Prerequisites: retire hash authentication; move the broker password to its own secret (or keep
   `.key` only on the Default MQTT entry); decide vep's embed rule for key-presenting devices; then
   a one-way migration with an operator-approved backup (it deletes key material, no rollback).
4. **Console (submodule) changes.**
   - Vue `pages/Apikeys/Apikeys.vue:76` reads `result.response.key`, but the server answers
     `{api_key, hash}`, so `createdKey` is null and the one-time "copy it now" modal never shows.
     Fix it in the console (`result.response.api_key`); the server shape is kept.
   - Drop the hidden `key` header (`vue/src/store/apikeys.js:29`) and the sample `key` value
     (`vue/src/store/apikeys.js:16`) from the Vue store.
   - The classic console needs no change (it reads `data.response.api_key`).
5. **Build tree and artifact (worker submodule).**
   - remove `thinx_build.json` from the work dir after it has been copied (`services/worker/builder`
     ~:813, ~:905) and zipped;
   - stop zipping the whole work dir (`./*`, ~:663, ~:689) where the platform does not need it;
   - API-side cleanup on failed builds once the generated header's path is tracked.
6. **`router.auth.js` checkMqttKeyAndLogin retries without a bound** (`lib/router.auth.js:250`,
   recursion at :257). It calls `create_default_mqtt_apikey`, then itself, and never stops while
   the key cannot be read or created (Redis down, malformed store). This predates w13: `mqtt_key`
   now creates a missing Default key itself, so the retry can only repeat a failure.
7. **Per-device key minting at build time** (from vep). Devices with no attributable key (Default
   MQTT key, ambiguous or unidentified) get `""` today; minting is new key UX.
8. **`name` reveals the key's last 34 hex characters.** Acceptable after vep's random keys: 120 bits
   stay unknown and verification needs an exact match. The consoles show 10 characters.
9. **CI spec prints the owner's broker password.** `spec/jasmine/MessengerSpec.js` [mm] logs
   `JSON.stringify(apikey)` of `mqtt_key`'s result, i.e. the test owner's Default MQTT API Key, into
   the CI log. Pre-existing and out of w13's scope; log only `typeof`/success there.

## Operator decision 2026-10-04

The API-key `hash` was expected to work as a login credential, but this is **not needed**. Track for later (no work scheduled):
- retire hash-as-credential in `APIKey#verify` (accept only the key itself), after confirming no device/firmware sends the hash;
- then stop returning `hash` from the list (the consoles' delete flow needs a non-secret fingerprint instead).
