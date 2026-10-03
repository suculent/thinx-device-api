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

## Resolution (quick 261003-w13)

Done 2026-10-04 in quick 261003-w13: arity spec `d3c3214e` and fix `155764f7` (orchestrator's
additional item), failing spec `c91324f1`, list/accessor/owner fix `8165c650` (Task 1), create
route logging and CI list case `d9fec871` (Task 2). Specs: `spec/jasmine/ApikeyExposureSpec.js`
and `spec/jasmine/OwnerDefaultMqttKeySpec.js` (local, no Redis/CouchDB/broker), plus
`ApikeySpec (02b)` (CI, Redis).

1. **Fixed.** `APIKey#list` (`lib/thinx/apikey.js:742`) exports `{name, hash, alias}` only, in
   store order; `[]` on a Redis error or a malformed store, non-object members skipped. Both
   consoles were re-checked: no console feature reads `.key` from a list item (classic
   `apikey.html` uses name/alias/hash, `ApikeyController.js` reads `api_key` from the create
   response; Vue `store/apikeys.js` renders `name`, its `key` header has `pos: null`,
   `deleteItems` sends hashes). Owner reads the broker credential through the new
   `APIKey#get_owner_mqtt_apikey` (`apikey.js:787`).
2. **Fixed.** The create route (`lib/router.apikey.js:45`) logs one line with the alias, the owner
   and `Util.redactToken(hash)`; the REMOVEME response dump and the duplicated info line are gone.
   `Owner#create_mqtt_access` logs `Adding MQTT credential for owner <id>` (`owner.js:778`), no key.
   Logging audit: the remaining lines on the create/list/revoke, owner MQTT key and user-creation
   paths print owner ids, aliases, reason codes or redacted prefixes only; `list()`'s
   "[DEBUG] Fetched keys" line was removed.
3. **Not removed (Decision C).** The worker copies `./thinx_build.json` into the firmware
   filesystem (`services/worker/builder` ~:813, ~:905) and compiles the generated header; the API
   has no hook after a successful remote build; several worker branches zip `./*`
   (~:663, ~:689), and the credential is compiled into the firmware by design. Accepted
   (T-w13-07); worker-side cleanup is item 5 of the residual todo.
4. **Fixed.** First as its own TDD pair (`d3c3214e` / `155764f7`): the callback now reads list()'s
   single argument, so an existing Default key is found and reused and `Owner#create` no longer
   fails with `creating_mqtt_api_key_failed` for a surviving `ak:` store. Then Task 1 moved it to
   the store accessor: exactly one callback, the missing `return` after an invalid owner, the
   created (last) entry registered with Mosquitto instead of `object[0]`, `mqtt_key` creates the
   Default key when keys exist but none is Default (no more login hang), and nothing is created
   over an unreadable or malformed store. No other `apikey.list(` caller had the arity mistake.
5. **Done.** `get_first_apikey` (`apikey.js:808`) reads the store and never throws; only
   ApikeySpec (07) calls it.
6. **Carried** to `.planning/todos/pending/2026-10-03-apikey-hash-credential-and-storage.md` item 7.

### What changes for operators and API clients

1. `GET /api/user/apikey/list` and `GET /api/v2/apikey` no longer carry `key`. Both consoles are
   unaffected. A third-party client that read `key` from the list must keep the key it received at
   creation.
2. The create routes still answer `{api_key, hash}` once. The API log no longer prints the new key
   or hash.
3. Owner MQTT credentials: logging in as an owner that has keys but no Default MQTT API Key now
   creates one instead of hanging; the MQTT credential registered for a newly created Default key
   is that key; an unreadable key store no longer triggers a create attempt; sign-up for an owner
   whose `ak:` store survived reuses the existing Default key.
4. No data migration, no console change, no push or deploy.
