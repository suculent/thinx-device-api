---
created: 2026-10-04T00:00:00.000Z
title: API key cleartext exposure and key-path leftovers after the builder key fix
area: api
severity: major
files:
  - lib/thinx/apikey.js list() / get_first_apikey
  - lib/router.apikey.js setAPIKey
  - lib/thinx/builder.js cleanupSecrets
  - lib/thinx/owner.js create_default_mqtt_apikey / mqtt_key
---

Found during quick 261003-vep (builder embeds the device's own API key). Not fixed there. Each
item was re-checked with grep on 2026-10-04.

## Items

1. **`APIKey#list` returns the cleartext `key`.** `/api/user/apikey/list` and `/api/v2/apikey` get
   it ("warning; cleartext key!!!"). Its comment blames the builder, which no longer reads it.
   `Owner#mqtt_key` and its callers do read `.key`: it is the broker password
   (`messenger.js` `fetchKeyAndPublish` `password: apikey.key`). They need a store accessor before
   `list()` can mask the key.
2. **The create route logs the new key and hash.** `lib/router.apikey.js` `setAPIKey` prints
   `Responding with (REMOVEME) ${JSON.stringify(response)}`, which holds `api_key` and `hash`.
   `Owner#create_mqtt_access` also prints `Adding MQTT credential ${object[0].key}`.
3. **Build tree retention.** `cleanupSecrets` removes only environment.json, environment.h and
   thinx.yml. `thinx_build.json` and the generated header stay in the build tree, and they now
   carry the device credential. The worker zips the work dir into the owner-downloadable artifact
   (`/api/v2/build/artifacts`, session plus owner check). The device already holds that value, and
   the build tree is in Redis's trust domain, so this is accepted for now (T-vep-06).
4. **`Owner#create_default_mqtt_apikey` never sees the existing key.** It calls `list()` with a
   two-argument callback `(err, body)`, but `list()` calls back one argument. So it never sees the
   existing Default key and always tries to create one. Since vep that attempt answers
   `alias_already_exists` instead of adding a duplicate, so `Owner#create` would now fail with
   `creating_mqtt_api_key_failed` for an owner whose `ak:` store survived without a user document.
   Also, `Owner#mqtt_key` never calls back when the owner has keys but no Default key.
5. **`get_first_apikey` is unused.** Only `ApikeySpec` (07) calls it now; its comment still says
   the MQTT registration uses it.
6. **Option for later: mint a per-device key at build time** for devices with no attributable key
   (Default MQTT key, ambiguous or unidentified). That is new key-minting UX; today those builds
   embed `""`.
