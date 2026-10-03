---
phase: quick-261003-vep
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spec/jasmine/BuilderApiKeySpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/XBuilderSpec.js
  - spec/jasmine/ApikeySpec.js
  - lib/thinx/apikey.js
  - lib/thinx/builder.js
  - lib/thinx/messenger.js
  - .planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md
  - .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md
  - .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md
autonomous: true
requirements: [VEP-BUILDER-APIKEY]
tags: [security, apikey, builder, mqtt, tdd]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A build for a device whose lastkey identifies exactly one entry of ak:<owner> that is not the owner's Default MQTT API Key writes thinx_build.json with THINX_API_KEY equal to that device's own credential: the entry's key when sha256(key) equals lastkey, the entry's hash when sha256(hash) equals lastkey. APIKey#verify(owner, THINX_API_KEY) accepts it. It is never the masked list name and never another entry (not the owner's first or last key)"
    - "When the device's entry is the owner's Default MQTT API Key, or its lastkey identifies no entry or more than one, the build still answers build_started and THINX_API_KEY is the empty string. When the owner has no keys, the store is not a JSON array, or Redis errors, the build is refused with build_requires_api_key, as before"
    - "No console line written while a device key is looked up, a build is prepared, a key is created or an MQTT registration is handled contains a stored key or hash"
    - "APIKey#list is unchanged: each entry's name is 30 asterisks plus the key's tail, and the builder no longer reads list()"
    - "APIKey#create refuses an alias or a key already in the owner's store (alias_already_exists / key_already_exists) and a store that is not a JSON array (apikey_store_invalid), writing nothing in those cases. Two creates for one owner within the same second get different keys (256-bit random, 64 lowercase hex)"
    - "An MQTT message on /<owner>/<udid>/status whose registration names that udid and that owner, for a device the owner owns with an attributable own key, calls registerDevice once with that device's own credential as a string APIKey#verify accepts. Any other registration (another udid or owner, a foreign or unknown device, the Default MQTT key, an unidentified key, an owner without keys) registers nothing and creates no key. A failed registration neither throws nor publishes"
    - "spec/jasmine/BuilderApiKeySpec.js is committed failing (test(...), spec files only) before any lib/ change. The local regression set stays green, and the CI-only specs touched here (ApikeySpec, XBuilderSpec) are adjusted so they stay valid"
  artifacts:
    - path: lib/thinx/apikey.js
      provides: "get_device_apikey(owner, lastkey, callback): the device's own credential (the entry key or hash whose sha256 equals lastkey) or a reason code; create() dedupes on the parsed store with Util.safeEqual; create_key is 256-bit random"
      contains: "get_device_apikey(owner, lastkey, callback)"
    - path: lib/thinx/builder.js
      provides: "getDeviceAPIKey(owner, device, callback), used by run_build; THINX_API_KEY is the device's own credential or the empty string"
      contains: "getDeviceAPIKey(owner, device, callback)"
    - path: lib/thinx/messenger.js
      provides: "mqttDeviceRegistration re-registers only the publishing device with its own credential; registerDevice never throws on a failed registration"
      contains: "this.akey.get_device_apikey("
    - path: spec/jasmine/BuilderApiKeySpec.js
      provides: "Local stub spec (no Redis, CouchDB or broker): VEP core, VEP builder, VEP create, VEP list, VEP messenger"
      contains: "VEP builder"
    - path: .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md
      provides: "Resolution for all three items"
      contains: "## Resolution"
    - path: .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md
      provides: "Follow-ups found while planning: list() cleartext key, create-route key log, build-tree retention, Owner#create_default_mqtt_apikey list callback"
      contains: "261003-vep"
  key_links:
    - from: lib/thinx/builder.js run_build
      to: lib/thinx/apikey.js get_device_apikey
      via: "getDeviceAPIKey(owner, device, ...) passes device.lastkey"
      pattern: "this\\.apikey\\.get_device_apikey\\("
    - from: lib/thinx/apikey.js get_device_apikey
      to: lib/thinx/apikey.js APIKey.findDeviceKey / APIKey.isOwnerMqttKey (quick 261003-u86)
      via: "the same device-key identification transfers use"
      pattern: "APIKey\\.findDeviceKey\\("
    - from: lib/thinx/builder.js generate_thinx_json
      to: thinx_build.json THINX_API_KEY
      via: "json.THINX_API_KEY = api_key"
      pattern: "json\\.THINX_API_KEY = api_key"
    - from: lib/thinx/messenger.js mqttDeviceRegistration
      to: lib/thinx/messenger.js withOwnedDevice (quick 261003-vbg) + lib/thinx/apikey.js get_device_apikey
      via: "topic udid == registration udid, registration owner == topic owner, device owned by the topic owner, its own credential"
      pattern: "this\\.akey\\.get_device_apikey\\("
---

<objective>
Fix todo `.planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md` (all three items):

1. The builder embeds the masked display name as `THINX_API_KEY`. The old APIKey fetcher used by `lib/thinx/builder.js` returns `kdata.name` from `list()`, which is 30 asterisks plus the key tail. `generate_thinx_json` (~:739) writes it into `thinx_build.json` and the generated header. No key or hash ever equals it, so since CR-01 (261003-s59) the registration, firmware and OTT requests of such firmware fail.
2. `lib/thinx/messenger.js` `mqttDeviceRegistration` (~:363-373) reads `.key` on the string that the first-key lookup returns, and `.key` on the boolean that the Default-key fallback returns. `_auth` is therefore always undefined.
3. `APIKey#create()` (~:176-185 after u86) iterates the raw JSON string, so the duplicate check never fires.

Purpose: THiNX-built firmware carries a credential that authenticates as the device, and never one the device did not already hold.

Output: one local spec file (RED first), three lib fixes, two spec harness adjustments, two CI spec adjustments, the todo resolved, one follow-up todo.

## Evidence

**What `ak:<owner>` stores.** It is a JSON array of `{key, hash, alias}`, where `hash = sha256(key)`. Since u86, a moved entry also carries `transfer: {udid, from, at}`. Both `key` and `hash` are stored in cleartext. `create()` writes both (`lib/thinx/apikey.js` ~:137-141), and `APIKey#verify` / `key_in_keys` accept an exact `.key` or `.hash` (`Util.safeEqual`, s59). So the builder can read either value straight from Redis. It must not go through `list()`, which only exists to feed the console.

**How a device's key is identified (u86, landed).** A device document carries `lastkey = sha256(<the Authentication value it registered with>)` (`lib/thinx/device.js` new-device branch; u86 refreshes it at check-in). The value it sent is an entry's `.key` or `.hash`, so `lastkey` is `sha256(key)` (equal to `hash`) or `sha256(hash)`. `APIKey.findDeviceKey(entries, lastkey)` answers `{status:"found", index, entry}`, `{status:"ambiguous"}` or `{status:"not_identified"}`. `APIKey.isOwnerMqttKey(entry)` uses the alias rule from `Owner#mqtt_key`. The module helpers `parseKeyStore(raw)`, `isEntry`, `nonEmptyString` exist (`lib/thinx/apikey.js` ~:44-63).

**Firmware contract** (read-only: `thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp`, same code in the pio and esp32 trees):
- `import_build_time_constants()` (~:1750) copies `THINX_API_KEY` into `thinx_api_key` only when no key is set yet (fewer than 4 chars).
- `restore_device_info()` (the SPIFFS `apikey`, ~:1515) and a key passed by the sketch to the constructor (more than 4 chars, ~:185) both override it. So a device that has a saved key keeps using it after an OTA update, whatever the build embedded.
- The key goes verbatim into the `Authentication:` header of HTTP(S) registration/firmware requests (~:489, ~:658). It is also the MQTT password, with username = udid (`set_auth(thinx_udid, thinx_api_key)`, ~:1355). The WiFiManager field holds 64 chars, so a key or a hash fits (both are 64 lowercase hex).
- An empty value produces `#define THINX_API_KEY ""`. That is the stock `thinx.h` default, and the firmware then falls back to its saved or sketch key. Checked: `JSON2H.process({THINX_API_KEY:""})` gives exactly that.
- NodeMCU and Mongoose builds copy `thinx_build.json` into the firmware filesystem (`services/worker/builder` ~:813, ~:905). MicroPython `boot.py` sends `THINX_API_KEY` as `Authentication`.

**Where an embedded key lives, and who can read it:**
- `thinx_build.json` and the generated header are written into `BUILD_PATH` = data_root + build_root/`<owner>/<udid>/<build_id>/<repo>`. `cleanupSecrets` removes only environment.json, environment.h and thinx.yml, so both files persist.
- The worker zips the work dir into `deploy/<owner>/<udid>/<build_id>/<build_id>.zip`. That zip is served only by `/api/v2/build/artifacts` (and v1), which require a session and check the owner (`lib/router.build.js` ~:133-149).
- Built firmware goes OTA through `/device/firmware`, which already requires the key.
- The builder never logs `api_key`. `services/worker/builder` never echoes `THINX_API_KEY`: it only copies the file, with `cp`/`cp -v`, which print file names.
- Redis, which holds every key in cleartext, is in the same trust domain as the build tree.
- The console list already shows the owner the cleartext `key` (`list()` ~:525 "warning; cleartext key!!!"). That is recorded as a follow-up, not changed (instruction: list() unchanged).

## Decision 1: what is embedded (key or hash)

Embed **the device's own credential**: the value whose sha256 is the device's `lastkey`.
- If `sha256(entry.key)` equals `lastkey`, that is the entry's key (the device authenticates with the key).
- If `sha256(entry.hash)` equals `lastkey`, it is the entry's hash (the device authenticates with the hash).

Why:
- `verify` accepts the key and the hash with equal power on every API-key route. So always embedding the hash would not shrink the API blast radius.
- What matters is that the firmware, and anyone who reads the artifact, never gets a credential the device does not already hold. The pre-image of `lastkey` is, by definition, what the device already presents.
- It also leaves the device's state alone. `checkinExistingDevice` → `authorize_mqtt` (`lib/thinx/device.js` ~:415) resets the device's MQTT password to the presented value, and u86 refreshes `lastkey` from it. Both stay exactly as they are.

## Decision 2: which key (the rule)

**Rule:** embed the device's own credential, chosen by the device's `lastkey` with u86's identification, when exactly one entry matches and it is not the owner's Default MQTT API Key. Otherwise:
- embed `""` and let the build proceed, if the device's key is unidentified, ambiguous, or the Default MQTT key;
- refuse the build with `build_requires_api_key`, as today, if the owner has no keys, the store is not a JSON array, or Redis errors.

The same rule drives the MQTT registration path (Task 3).

Consistency with sibling tasks:
- **u86:** the same `findDeviceKey` / `isOwnerMqttKey`. The builder never makes devices share a key, so it never causes an `apikey_shared` transfer refusal. It never hands out the Default MQTT key, which u86 refuses to move.
- **v9d / v9x:** device requests are authorized by "the key verifies for the owner and the owner owns the device". An embedded own key satisfies that unchanged.
- **vbg:** MQTT handling uses vbg's owned-device gate.

Rejected alternatives:
- **The owner's first or last key (today's intent).** It is arbitrary, and it would make all THiNX-built devices of an owner share one key, which u86 then refuses to transfer. It often hands out the Default MQTT key. That key is the owner's broker password (username = owner id, readwrite `/<owner>/#`, `lib/thinx/owner.js` ~:740-801), so every firmware dump would grant owner-level MQTT access.
- **The key the build was requested with.** There is none. Builds are session/JWT authenticated (`lib/router.build.js` `Util.validateSession`), and queued and webhook builds carry no key.
- **Refuse the build when no key is attributable.** That would block OTA for devices that work today: they ignore `THINX_API_KEY` because their saved key wins.
- **Mint a per-device key at build time.** That is new key-minting UX and out of quick scope. It is noted in the follow-up todo.

Trade-offs:
- A board that is fully erased and then flashed with a build whose `THINX_API_KEY` is `""` needs its key entered once (portal or sketch). That is the same as stock firmware, and better than the masked value, which looked valid to the firmware's length check and could never authenticate.
- Devices on the Default MQTT key get no embedded key until they are given a dedicated key and check in once.

## Messenger (item 2): why not just use the string

`Device#register` with the owner's first key would re-check-in any device named in the message body. It would also reset that device's MQTT password to the owner's first key (`authorize_mqtt`), which is often the Default MQTT key, and rewrite its `lastkey`.

Any client that can publish on the owner's status topics could then trigger owner-key-backed registrations of other devices. That includes devices and mesh peers, which have readwrite on `/<owner>/shared/#`. It would lock those devices out of the broker and expose the owner's key path. The current `undefined` makes this path fail closed by accident, so the literal fix would open a privilege escalation.

The task therefore passes **the publishing device's own credential**, under the same rule as the builder:
- the topic must be `/<owner>/<udid>/status`;
- the registration must name that udid and owner;
- the device must be owned by that owner (vbg's `withOwnedDevice`);
- the credential comes from `get_device_apikey`.

Otherwise nothing is registered and no key is created. The re-check-in then re-presents exactly what the device already uses, so the MQTT password and `lastkey` do not change.

Note (vbg finding (a)): in production `forwardNonNotification` currently throws before this path runs. This task does not change that.

## create() (item 3) needs a key generator change

`create_key` is `sha256(prefix + owner + Date#toString())`, which has one-second resolution. Two creates for one owner within a second therefore produce the same key. ApikeySpec (01)/(01b) and ZZ-RouterAPIKeySpec (1)/(2)/(3) create keys back to back, so a working duplicate-key check would refuse the second create and fail CI.

`create_key` becomes 256-bit random (`crypto.randomBytes(32)` hex). That is the same 64-lowercase-hex shape `sanitka.apiKey` and every consumer expect. Existing keys are untouched.

The alias check also changes CI. 02-OwnerSpec creates cimrman (`envi.oid`) with a Default MQTT API Key, so ApikeySpec (01b), "generate Default MQTT API Key" for `envi.oid`, now gets `alias_already_exists`. That case is rewritten to accept either outcome and assert the key exists.

Every other spec alias is created once per owner per CI node. `mock-apikey-alias` is created twice for `dynamic`, but ZZ-RouterAPIKeySpec revokes it by hash before ZZ-RouterDeviceAPISpec recreates it.

## What changes for operators (read before pushing)

1. THiNX builds for devices with an identifiable own key now embed a working key: the key or the hash, whichever the device uses. Other builds embed `""`, so the device keeps its saved key. OTA is unaffected.
2. Devices on the owner's Default MQTT API Key get no embedded key. Remedy: create a dedicated key, enter it on the device, and let the device check in once.
3. `POST /api/user/apikey` and `/api/v2/apikey` with an alias the owner already has now answer `set_api_key_failed`. The legacy console already blocks duplicate aliases client-side (`ApikeyController.js` ~:39-42). New keys are random. Existing duplicate entries stay as they are, and devices on them count as ambiguous, so their builds embed `""`.
4. The MQTT registration message re-registers only the publishing device, with its own key. No key is ever created on that path.
5. No data migration. Not pushed or deployed. Commits may be unsigned under the operator's standing GPG exception.

## Source coverage

| Source item | Covered by |
|---|---|
| Builder embeds the masked value (`kdata.name`) → firmware/OTT fail since CR-01 | Task 1 (tracer): `get_device_apikey` + `getDeviceAPIKey`; VEP core/builder |
| Messenger reads `.key` on a string, so `_auth` is undefined | Task 3; VEP messenger |
| `create()` duplicate check iterates the raw JSON string | Task 2; VEP create |
| Design question: what `ak:` stores; real key vs hash; artifacts/logs | Evidence; Decision 1; T-vep-01/02/06; follow-up todo |
| Design question: which key (last is arbitrary; u86 lastkey; Default MQTT key) | Decision 2 (the rule), rejected alternatives, trade-offs |
| Console list stays masked (list() unchanged) | Task 2 VEP list (regression guard); list() untouched |
| Firmware contract from the repo's firmware sources | Evidence "Firmware contract" |
| TDD: failing specs committed RED before lib/ | Task 1 step A |
| Prefer local stub harnesses; existing ApikeySpec/Builder*/ZZ stay green | All verifies; ApikeySpec (01b), XBuilderSpec, BuilderRemoteJobSpec stub adjustments; ZZ alias analysis above |
| Move the todo to completed with a Resolution | Task 3 |
| No change to package.json scripts, .circleci/config.yml, Dockerfile.test, docker-entrypoint.sh, thinx-core.js | Not in files_modified |
| Siblings u86, v05, v9d, v9x, vbg, vd4 land first | Preconditions; edits on top of u86 (apikey.js) and vbg (messenger.js) |
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md
@.planning/quick/261003-s59-fix-cr-01-api-key-substring-authenticati/261003-s59-SUMMARY.md
@.planning/quick/261003-u86-device-transfer-carries-its-api-key/261003-u86-PLAN.md
@.planning/quick/261003-vbg-fix-mqtt-status-owner-check/261003-vbg-PLAN.md
@lib/thinx/apikey.js
@lib/thinx/builder.js
@lib/thinx/messenger.js

Interfaces the executor relies on (verified while planning; re-check after the siblings land):
- `APIKey` (`lib/thinx/apikey.js`, post-u86):
  - module helpers `isEntry(entry)`, `nonEmptyString(v)`, and `parseKeyStore(raw)`, which maps null/undefined to `[]`, a JSON array to that array, and anything else to null;
  - statics `APIKey.deviceKeyCandidates(entry)`, `APIKey.findDeviceKey(entries, lastkey)` and `APIKey.isOwnerMqttKey(entry)`;
  - `verify(owner, apikey, is_http, cb)`, exact key or hash. With `ENVIRONMENT=test`, only the CI constant `TEST_ENV_APIKEY` bypasses Redis;
  - `list(owner, cb)` calls back ONE argument, an array of `{name, key, hash, alias}`, with `name` = 30 asterisks + `key.substring(30)`;
  - `get_first_apikey` is used only by messenger (until Task 3) and ApikeySpec (07). Keep it.
- `Builder` (`lib/thinx/builder.js`):
  - the constructor sets `this.apikey = new ApiKey(redis)`;
  - in `run_build(br, notifiers, callback)` the old key fetch runs after the device identity checks (~:905) and before `createBuildPath`;
  - `generate_thinx_json(api_envs, device, api_key, commit_id, git_tag, XBUILD_PATH)` sets `json.THINX_API_KEY = api_key`;
  - `thinx_build.json` is written with `writeRepoFile` before `callback(true, {response: "build_started", build_id})`;
  - a device without `mac` then ends in `device_mac_missing` (failRemoteBuild) without dispatching;
  - `app_config` loads locally from `spec/mnt/data/conf/config.json`, so the real `generate_thinx_json` runs in a local spec.
- `spec/jasmine/BuilderRemoteJobSpec.js`:
  - `fakeRedis` ~:23;
  - the hermetic setup (realpath tmp, `BuildLog.prototype.state`/`log` and `InfluxConnector.statsLog` spies) ~:855-880;
  - the trigger-sites `harness()` ~:1108-1163 stubs the old key fetch at ~:1142;
  - `run_build` is driven directly in the invalid_device describe, ~:1353-1392.
- `spec/jasmine/XBuilderSpec.js` ~:214-219 "should fetch last apikey" calls the old fetch for owner "nonexistent" and expects `false`. It runs in CI against Redis; `envi` is in scope.
- `Messenger` (`lib/thinx/messenger.js`, post-vbg):
  - `messageResponder` drops topics without a valid owner, then calls `mqttDeviceRegistration(topic, message, oid)` with the sanitized owner;
  - vbg adds `Messenger.isStatusTopic(topic)`, `Messenger.topicUdid(segment)` (silent), `withOwnedDevice(oid, did, onOwned(doc, owner, udid))` (`this.devicelib.get` + `Device.isOwnedBy`) and `logDroppedDeviceMessage(reason, udid)` (rate-limited, udid only);
  - `registerDevice(_registration, _auth, _res, oid)` → `this.device.register(reg, auth, res, (r, success, response) => …, null)` → `this.publish(oid, response.registration.udid, …)`, which dereferences even on failure;
  - `Object.create(Messenger.prototype)` loads locally (checked).
- `Device`: `static isOwnedBy(doc, owner)`. On `register` → `checkinExistingDevice`, `authorize_mqtt(api_key, device)` resets the device's MQTT password to the presented value.
- `Util.safeEqual(a, b)` is false unless both are non-empty strings. `Util.redactToken`.
- Local run (no Redis/CouchDB): `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[...],helpers:[],random:false});j.execute(undefined,'<regex filter>')"`. The filter is a RegExp, so `A|B` works.
- Planning baseline: these 13 files give `437 specs, 0 failures` locally, in about 12 s and one process: BuilderRemoteJob, BuilderPath, ApikeyExactMatch, DeviceOwnership, DeviceRegisterOwner, MeshSessionAuth, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka, Util, JSON2H and TransferApiKey. ESLint is clean on apikey.js, builder.js, messenger.js and the touched specs (`npx --no-install eslint <files>`).
- CI: `715b38b9` fails CI on any failing jasmine spec. Node 0 runs the non-ZZ specs, node 1 the ZZ specs. Redis is fresh per run.
</context>

<tasks>

<!-- planner-discipline-allow: get_last_apikey -->
<!-- planner-discipline-allow: getLastAPIKey -->

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): RED spec for all areas, then the builder embeds the device's own key end to end</name>
  <files>spec/jasmine/BuilderApiKeySpec.js, spec/jasmine/BuilderRemoteJobSpec.js, spec/jasmine/XBuilderSpec.js, lib/thinx/apikey.js, lib/thinx/builder.js</files>
  <precondition>Quick tasks u86 and vbg have landed and lib/ and spec/ are clean: `git diff --quiet -- lib/ spec/ && grep -q 'function parseKeyStore(' lib/thinx/apikey.js && grep -q 'static findDeviceKey(' lib/thinx/apikey.js && grep -q 'static isOwnerMqttKey(' lib/thinx/apikey.js && grep -q 'withOwnedDevice(' lib/thinx/messenger.js && grep -q 'static isOwnedBy(' lib/thinx/device.js`. If it fails, stop and report.</precondition>
  <read_first>lib/thinx/apikey.js (whole, as left by u86), lib/thinx/builder.js (the key fetch ~:195, generate_thinx_json ~:712-770, run_build ~:842-1300), spec/jasmine/BuilderRemoteJobSpec.js (~:14-26, ~:855-960, ~:1108-1246, ~:1353-1392), spec/jasmine/ApikeyExactMatchSpec.js (fake-store style), spec/jasmine/XBuilderSpec.js ~:200-220, lib/thinx/messenger.js (whole, as left by vbg), spec/jasmine/MessengerOwnershipSpec.js if it exists (vbg's fixture conventions), lib/thinx/device.js (isOwnedBy, authorize_mqtt), lib/thinx/util.js (safeEqual, redactToken)</read_first>
  <behavior>
    Fixtures:
    - OWNER = envi.oid. OTHER = sha256("vep-other-owner"). UDID_D = envi.udid. UDID_E is a second UUID-shaped constant.
    - KEY_M (alias "Default MQTT API Key"), KEY_D (alias "vep-device") and KEY_O (alias "vep-other") are sha256 of vep-* strings. HASH_x = sha256(KEY_x).
    - Store ak:OWNER = [M, D, O]: the Default key is first, the other key last.

    VEP core (APIKey#get_device_apikey):
    - lastkey HASH_D → (true, KEY_D);
    - lastkey sha256(HASH_D) → (true, HASH_D);
    - both values verify for OWNER;
    - lastkey HASH_M or sha256(HASH_M) → (false, "device_key_is_owner_mqtt_key");
    - lastkey unknown, "", undefined, non-string, or sha256 of the masked name → (false, "device_key_not_identified");
    - an entry with only a hash that equals lastkey → (false, "device_key_not_identified");
    - two entries holding KEY_D → (false, "device_key_ambiguous");
    - store null or "[]" → (false, "owner_has_no_api_keys");
    - store "{}" or "not json" → (false, "apikey_store_invalid");
    - get error → (false, "apikey_store_unavailable");
    - owner undefined, "" or non-string → (false, "invalid_owner") with no Redis call;
    - never a set call; no captured console line contains any KEY_x or HASH_x.

    VEP builder (real run_build, the real key fetch and the real generate_thinx_json, on a fake store):
    - device lastkey HASH_D → thinx_build.json THINX_API_KEY === KEY_D, verify(OWNER, it) true, not KEY_O, no "*";
    - sha256(HASH_D) → HASH_D;
    - HASH_M → "" and the callback still got build_started;
    - unknown lastkey, a missing lastkey or a duplicate-key store → "";
    - store null and get error → callback (false, "build_requires_api_key") and no thinx_build.json;
    - no captured console line contains any KEY_x or HASH_x.

    VEP create:
    - an existing alias → (false, "alias_already_exists") and no set;
    - create_key stubbed to an existing key → (false, "key_already_exists") and no set;
    - two back-to-back creates on one owner both succeed with different keys matching /^[0-9a-f]{64}$/ and hash === sha256(key), the new entry last and earlier entries intact;
    - "Default MQTT API Key" when one exists → alias_already_exists;
    - store "{}" or "not json" → (false, "apikey_store_invalid") with no set and no throw;
    - no console line contains the new key or hash.

    VEP list: name === 30 asterisks + key.slice(30), name differs from key and hash, alias and order kept.

    VEP messenger:
    - topic /OWNER/UDID_D/status, registration {udid: UDID_D, owner: OWNER, ...}, device lastkey HASH_D → registerDevice called once with auth === KEY_D (verify true);
    - lastkey sha256(HASH_D) → HASH_D;
    - Default MQTT device, registration naming UDID_E or OTHER, a device owned by OTHER, an owner store null, or an unidentified lastkey → no registerDevice and no create_default_mqtt_apikey call;
    - the real registerDevice with a device.register that fails → no throw and no publish; with a success response → one publish to (OWNER, UDID_D);
    - a non-status topic or a null registration → nothing;
    - no console line contains a KEY_x or HASH_x.
  </behavior>
  <action>
**A. RED (spec files only).**

Create `spec/jasmine/BuilderApiKeySpec.js`.
- Header comment: the local run command (the form in `<context>`) and that it needs no Redis, CouchDB or broker.
- Helpers:
  - `makeStore(map)`: a fake legacy redis. `get(k, cb)` answers the map value (string or null) or an Error when a `failGet` flag is set. `set(k, v, cb)` stores the value and records the call. It also records get calls;
  - `captureConsole()`: spies on console.log, info, warn and error with callFake, collecting `util.format(...)` lines;
  - an `expectNoSecrets(lines, values)` assertion;
  - a promise wrapper around `APIKey#verify`.
- Five describes, with titles starting "VEP core", "VEP builder", "VEP create", "VEP list" and "VEP messenger", covering every case in `<behavior>`. In VEP core, first assert `typeof ak.get_device_apikey === "function"`, so the RED failures are assertions, not crashes.

VEP builder harness:
- Copy the BuilderRemoteJobSpec trigger-sites harness and hermetic setup:
  - a realpath tmp `BUILD_PATH` with `repo/main.ino`;
  - the `buildPathFor`, `createBuildPath`, `prefetchPublic`, `prefetchPrivate`, `runGitCommand`, `getTag` and `apienv.list` stubs;
  - a `notify` recorder;
  - `devicelib.get` → the device;
  - a `Platform.getPlatform` spy;
  - the BuildLog state/log and InfluxConnector.statsLog spies.
- Construct it with `new Builder(store)`. Do NOT stub the key fetch or `generate_thinx_json`.
- Device: `{udid: UDID_D, owner: OWNER, platform: "arduino:esp8266", lastkey: <case>}`, with no `mac`. run_build then stops right after writing thinx_build.json and answering build_started, which keeps the worker protocol out of this spec.
- Drive it with `builder.run_build({build_id, owner: OWNER, git: GIT, branch: "main", udid: UDID_D, source_id: envi.sid, worker: {running: true, socket: {connected: true, on() {}, emit() {}}}}, {}, cb)`. Poll until the callback has answered, then read `<XBUILD_PATH>/thinx_build.json`.

VEP messenger fixture:
- `Object.create(Messenger.prototype)` with:
  - `akey = new APIKey(store)`;
  - `devicelib.get` over a device map, also exposed as `device.fetchOwned` with t29's contract, so the spec does not depend on which lookup the code uses;
  - `user.create_default_mqtt_apikey` as a recorder;
  - an instance `registerDevice` recorder for the routing cases, and the prototype's real `registerDevice` with a `device.register` stub for the two callback cases;
  - a `publish` recorder.
- Follow MessengerOwnershipSpec's fixture conventions if that file exists.

Also edit `spec/jasmine/BuilderRemoteJobSpec.js`: add `builder.getDeviceAPIKey = (owner, device, cb) => cb(true, "spec-api-key");` on the line directly after the existing `builder.getLastAPIKey = …` stub (~:1142). Keep the old line for now, so the harness works before and after GREEN.

Run the whole new spec and BuilderRemoteJobSpec.
- BuilderRemoteJobSpec must stay green.
- The new spec must fail in VEP core, VEP builder (own-key and empty-key cases), VEP create (alias, key, same-second, Default and malformed cases) and VEP messenger (routing cases, failed-callback case).
- Expected already-passing: VEP list, the refused builder cases, the no-secret captures, the messenger success-callback case and the non-status case.
- Failures must be chai assertions or TypeErrors inside `it`, never a load crash. If a harness error shows up, fix the harness, never the expectations. Record the counts for the SUMMARY.

Commit only these two spec files: `test(quick-261003-vep): failing spec for the builder's masked API key, duplicate creates and the MQTT registration key`. Use explicit `git add <paths>` (the tree has unrelated untracked files). If GPG is locked, use `git -c commit.gpgsign=false commit` (the operator's standing exception). Never use `--no-verify`.

**B. GREEN tracer (lib/thinx/apikey.js, lib/thinx/builder.js, plus two spec harness lines).**

lib/thinx/apikey.js: add `get_device_apikey(owner, lastkey, callback) {` after u86's device-key statics. This implements Decision 1 and Decision 2.
1. If `owner` is not a non-empty string → `(false, "invalid_owner")` with no Redis call.
2. Call `this.redis.get("ak:" + owner)`. An error → `(false, "apikey_store_unavailable")`.
3. `parseKeyStore`: null → `(false, "apikey_store_invalid")`; an empty array → `(false, "owner_has_no_api_keys")`.
4. `APIKey.findDeviceKey(entries, lastkey)`: ambiguous → `(false, "device_key_ambiguous")`; anything but found → `(false, "device_key_not_identified")`.
5. `APIKey.isOwnerMqttKey(entry)` → `(false, "device_key_is_owner_mqtt_key")`.
6. Return the pre-image:
   - `entry.key` when `nonEmptyString(entry.key)` and `Util.safeEqual(sha256(entry.key), lastkey)`;
   - else `entry.hash` when `nonEmptyString(entry.hash)` and `Util.safeEqual(sha256(entry.hash), lastkey)`;
   - else `(false, "device_key_not_identified")`.
   - Answer `(true, value)`.
7. Never write. Never log the value, lastkey or the stored JSON. At most one line naming the owner id and the reason code.
8. JSDoc: state the rule and that `list()` stays the console's display path.

Then delete the APIKey method under the `// used by builder` comment, the one that returns `kdata.name`. It has no other caller. Leave `list()` and `get_first_apikey` untouched, and do not mention the removed method's name in any comment.

lib/thinx/builder.js:
- Replace the old key-fetch method (~:195) with `getDeviceAPIKey(owner, device, callback) {`. It logs `[builder] Fetching the device API key for <udid>` (no value), then calls `this.apikey.get_device_apikey(owner, <device.lastkey if a string, else undefined>, …)`:
  - `(true, value)` → `callback(true, value)`;
  - reason in the device-level set {device_key_not_identified, device_key_ambiguous, device_key_is_owner_mqtt_key} → log `⚠️ [warning] [builder] building <udid> without THINX_API_KEY (<reason>)` and `callback(true, "")`;
  - any other reason → `callback(false, reason)`.
  - Keep the device-level set as a module constant with a one-line comment pointing to Decision 2 of quick 261003-vep.
- In run_build, call `this.getDeviceAPIKey(owner, device, async (success, api_key) => …)`. Refuse with the existing `build_requires_api_key` path when `!success || typeof (api_key) !== "string"`. Update the closing-brace comment.
- In generate_thinx_json, keep `json.THINX_API_KEY = api_key;` and change its comment to say it is the device's own credential, or "" when none is attributable.
- Never log `api_key`.

Spec harness:
- In BuilderRemoteJobSpec, delete the old-fetcher stub line and keep the `getDeviceAPIKey` stub.
- In XBuilderSpec, change the "should fetch last apikey" case to call `builder.getDeviceAPIKey("nonexistent", { udid: envi.udid }, function (success) { … })`. Keep `expect(success).to.equal(false)` and rename it "should refuse a device API key for an owner without keys". It is CI-only (Redis), so check it with node --check and ESLint.

Commit lib/thinx/apikey.js, lib/thinx/builder.js, spec/jasmine/BuilderRemoteJobSpec.js and spec/jasmine/XBuilderSpec.js: `fix(quick-261003-vep): builder embeds the device's own API key, never the masked list name`. Then run the Task verify. It must print VEP-TRACER-GREEN before Task 2 starts.
  </action>
  <verify>
    <automated>F="'jasmine/BuilderRemoteJobSpec.js','jasmine/BuilderPathSpec.js','jasmine/ApikeyExactMatchSpec.js','jasmine/DeviceOwnershipSpec.js','jasmine/DeviceRegisterOwnerSpec.js','jasmine/MeshSessionAuthSpec.js','jasmine/SecretsSweepSpec.js','jasmine/LoggingQualityAuditSpec.js','jasmine/OwnerLogLeakSpec.js','jasmine/SanitkaSpec.js','jasmine/UtilSpec.js','jasmine/JSON2HSpec.js'"; for s in TransferApiKeySpec MessengerOwnershipSpec DevicePushOwnerSpec DeviceOttSpec DeviceFirmwareOwnerSpec LogTailOwnerSpec; do [ -f "spec/jasmine/$s.js" ] && F="$F,'jasmine/$s.js'"; done; OUT1=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/BuilderApiKeySpec.js'],helpers:[],random:false});j.execute(undefined,'VEP core|VEP builder')" 2>&1); RC1=$?; OUT2=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[$F],helpers:[],random:false});j.execute()" 2>&1); RC2=$?; echo "$OUT1" | tail -2; echo "$OUT2" | tail -2; ADDS=$(git log --diff-filter=A --format=%H -- spec/jasmine/BuilderApiKeySpec.js) || exit 1; RED=$(printf '%s\n' "$ADDS" | tail -1); [ -n "$RED" ] || exit 1; FIX=$(git log -1 --format=%H -- lib/thinx/builder.js) || exit 1; SUBJ=$(git log -1 --format=%s "$RED") || exit 1; REDFILES=$(git show --name-only --format= "$RED") || exit 1; echo "red=$RED fix=$FIX"; [ "$RED" != "$FIX" ] && case "$SUBJ" in "test("*) true;; *) false;; esac && ! printf '%s\n' "$REDFILES" | grep -q '^lib/' && git merge-base --is-ancestor "$RED" "$FIX" && [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ] && echo "$OUT1" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT2" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && grep -q 'get_device_apikey(owner, lastkey, callback)' lib/thinx/apikey.js && grep -q 'getDeviceAPIKey(owner, device, callback)' lib/thinx/builder.js && grep -q 'this.apikey.get_device_apikey(' lib/thinx/builder.js && ! grep -q 'get_last_apikey' lib/thinx/apikey.js lib/thinx/builder.js && ! grep -q 'getLastAPIKey' lib/thinx/builder.js spec/jasmine/XBuilderSpec.js spec/jasmine/BuilderRemoteJobSpec.js && for f in lib/thinx/apikey.js lib/thinx/builder.js spec/jasmine/BuilderApiKeySpec.js spec/jasmine/BuilderRemoteJobSpec.js spec/jasmine/XBuilderSpec.js; do node --check "$f" || exit 1; done && npx --no-install eslint lib/thinx/apikey.js lib/thinx/builder.js spec/jasmine/BuilderApiKeySpec.js spec/jasmine/BuilderRemoteJobSpec.js spec/jasmine/XBuilderSpec.js && echo VEP-TRACER-GREEN</automated>
  </verify>
  <done>The RED spec commit (spec files only) precedes the fix. A real run_build on a fake store writes thinx_build.json whose THINX_API_KEY is the device's own key or hash, and APIKey#verify accepts it. Default-MQTT, unidentified and ambiguous devices get "". Owners without keys are refused. No log line carries a key or hash. The regression set is green, and the old fetcher names are gone from lib and the two harness specs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: create() refuses duplicate keys and aliases on the parsed store; keys are 256-bit random; list() unchanged</name>
  <files>lib/thinx/apikey.js, spec/jasmine/ApikeySpec.js</files>
  <read_first>lib/thinx/apikey.js create_key and create (as left by Task 1), spec/jasmine/BuilderApiKeySpec.js "VEP create" and "VEP list" (committed RED in Task 1), spec/jasmine/ApikeySpec.js (01)-(07) and R1-R3, spec/jasmine/02-OwnerSpec.js (01)-(02)</read_first>
  <behavior>
    - The VEP create and VEP list cases in `<behavior>` of Task 1 pass.
    - ApikeySpec (01b) "Default MQTT API Key" passes whether or not 02-OwnerSpec already created the key: success, or alias_already_exists, and afterwards list(owner) holds at least one entry with that alias.
    - R1/R2 (closed Redis, breaker) are unchanged.
  </behavior>
  <action>
lib/thinx/apikey.js, per the objective's "create() needs a key generator change":
- `create_key(owner_id)` returns `crypto.randomBytes(32).toString("hex")`. Keep the parameter for callers. Update the JSDoc: 256-bit random, 64 lowercase hex, the same shape as before. The old timestamp-derived value repeated within one second, so the now-working duplicate check would refuse back-to-back creates.
- In `create()`'s existing-store branch, replace the parse and the loop over the raw JSON string:
  1. Read the store with `parseKeyStore(json_keys)`. Null → one warning naming only the owner id, then `callback(false, "apikey_store_invalid")`. Never write.
  2. For every `isEntry` entry: `Util.safeEqual(entry.key, new_api_key)` → `callback(false, "key_already_exists")`; `Util.safeEqual(entry.alias, apikey_alias)` → `callback(false, "alias_already_exists")`.
  3. Then push the new object last and save, as today.
- Keep the first-key branch (store null), the circuit breaker and every log line free of keys and hashes. If `crypto` is still required, it is now used by `randomBytes`.
- Do not change `list()`, `verify`, `revoke` or u86's code.

spec/jasmine/ApikeySpec.js (CI-only, Redis): rewrite (01b) "should be able to generate Default MQTT API Key" as "should have a Default MQTT API Key":
- create it; on success expect the last array entry's alias to be "Default MQTT API Key"; otherwise expect the reason to equal "alias_already_exists";
- in both cases call `apikey.list(owner, …)` and expect at least one entry with that alias, then `done()`.
- 02-OwnerSpec creates `envi.oid` with that key first on CI node 0, which is why both outcomes must pass. Leave every other ApikeySpec case untouched.

Commit lib/thinx/apikey.js and spec/jasmine/ApikeySpec.js: `fix(quick-261003-vep): create() refuses duplicate API keys and aliases; keys are 256-bit random`. Then run the Task verify (prints VEP-CREATE-GREEN).
  </action>
  <verify>
    <automated>F="'jasmine/BuilderRemoteJobSpec.js','jasmine/BuilderPathSpec.js','jasmine/ApikeyExactMatchSpec.js','jasmine/DeviceOwnershipSpec.js','jasmine/DeviceRegisterOwnerSpec.js','jasmine/MeshSessionAuthSpec.js','jasmine/SecretsSweepSpec.js','jasmine/LoggingQualityAuditSpec.js','jasmine/OwnerLogLeakSpec.js','jasmine/SanitkaSpec.js','jasmine/UtilSpec.js','jasmine/JSON2HSpec.js'"; for s in TransferApiKeySpec MessengerOwnershipSpec DevicePushOwnerSpec DeviceOttSpec DeviceFirmwareOwnerSpec LogTailOwnerSpec; do [ -f "spec/jasmine/$s.js" ] && F="$F,'jasmine/$s.js'"; done; OUT1=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/BuilderApiKeySpec.js'],helpers:[],random:false});j.execute(undefined,'VEP core|VEP builder|VEP create|VEP list')" 2>&1); RC1=$?; OUT2=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[$F],helpers:[],random:false});j.execute()" 2>&1); RC2=$?; echo "$OUT1" | tail -2; echo "$OUT2" | tail -2; [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ] && echo "$OUT1" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT2" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && grep -q 'randomBytes(32)' lib/thinx/apikey.js && grep -q '"apikey_store_invalid"' lib/thinx/apikey.js && grep -q 'alias_already_exists' spec/jasmine/ApikeySpec.js && node --check lib/thinx/apikey.js && node --check spec/jasmine/ApikeySpec.js && npx --no-install eslint lib/thinx/apikey.js spec/jasmine/ApikeySpec.js && echo VEP-CREATE-GREEN</automated>
  </verify>
  <done>create() refuses a duplicate alias or key and a malformed store without writing. Back-to-back creates get distinct random 64-hex keys. list() output is unchanged (VEP list green). ApikeySpec (01b) accepts both CI outcomes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: MQTT registration re-registers only the publishing device with its own key; resolve the todo</name>
  <files>lib/thinx/messenger.js, .planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md, .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md, .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md</files>
  <precondition>vbg's helpers are in lib/thinx/messenger.js: `grep -q 'withOwnedDevice(' lib/thinx/messenger.js && grep -q 'logDroppedDeviceMessage(' lib/thinx/messenger.js`. If vbg landed the topic helpers under other names, use the landed equivalents and record the mapping in the SUMMARY. If there is no owned-device gate at all, stop and report.</precondition>
  <read_first>lib/thinx/messenger.js (whole: messageResponder, mqttDeviceRegistration, registerDevice, publish and vbg's static topic helpers, withOwnedDevice and logDroppedDeviceMessage), spec/jasmine/BuilderApiKeySpec.js "VEP messenger", spec/jasmine/MessengerOwnershipSpec.js (if it exists: its fakes must keep passing), .planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md, .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md (Resolution format)</read_first>
  <behavior>
    - All of spec/jasmine/BuilderApiKeySpec.js passes, including VEP messenger.
    - MessengerOwnershipSpec (vbg) stays green. Its malformed-topic registration case still makes no akey, create_default_mqtt_apikey or register call.
  </behavior>
  <action>
lib/thinx/messenger.js (edit on top of vbg; keep every vbg guard). Rewrite `mqttDeviceRegistration(topic, message, oid)` per the objective's "Messenger" section:
1. Return unless `Messenger.isStatusTopic(topic)`, and unless `message.registration` is a non-null, non-array object.
2. Let `did` be the topic's second segment and `udid = Messenger.topicUdid(did)`. If `udid` is null, or `Messenger.topicUdid(registration.udid) !== udid`, or `registration.owner !== oid` → `this.logDroppedDeviceMessage("registration_not_self", udid)` and return.
3. Call `this.withOwnedDevice(oid, did, (doc, owner, owned_udid) => …)`.
4. Inside it, call `this.akey.get_device_apikey(owner, doc.lastkey, (ok, credential) => …)`:
   - `!ok` → `this.logDroppedDeviceMessage("registration_" + credential, owned_udid)`; the value is a reason code here;
   - otherwise one info line naming `owned_udid` only, then `this.registerDevice(registration, credential, null, owner)`.
5. Remove from this method the first-key lookup, the fallback that creates the owner's Default MQTT key, and the critical line that dumps the whole message. Nothing on this path creates a key.

Harden `registerDevice`'s callback (vbg finding (f)):
- Publish only when `reg_success === true`, the response is an object, and `response.registration.udid` is a string. In that case set the timestamp as today, log as today, and `this.publish(oid, response.registration.udid, JSON.stringify(response))`.
- Otherwise log one failure line containing the reason only when it is a string, and return without throwing or publishing.

Leave `publish`, `forwardNonNotification`, init/`mqtt_key` and vbg's status paths unchanged. If a MessengerOwnershipSpec case reaches the registration path on a valid topic and its akey fake lacks `get_device_apikey`, extend that fake (harness only), never an expectation, and record it in the SUMMARY.

Todos:
- `git mv` the pending todo to `.planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md`.
- Append `## Resolution`. Use the completed validate-session todo as the format model. Include:
  - the commit hashes;
  - the rule: own credential = pre-image of lastkey; never the Default MQTT key; "" when unattributable; refusal when the owner has no keys;
  - why the hash is not embedded unconditionally;
  - why the messenger does not use the owner's first key;
  - the create_key change;
  - the operator-facing changes from the objective.
- Create `.planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md`, with frontmatter like the other pending todos (created, title, area: api, severity: major, files) and a line saying it was found during quick 261003-vep. Items, each re-checked with a grep before writing:
  1. `APIKey#list` returns the cleartext `key` to `/api/user/apikey/list` and `/api/v2/apikey`. Its comment blames the builder, which no longer reads it. `Owner#mqtt_key` and its callers do read `.key` (the broker password), so they need a store accessor before list() can mask it.
  2. `lib/router.apikey.js` setAPIKey logs the full new key and hash (the "Responding with (REMOVEME)" line).
  3. `cleanupSecrets` leaves `thinx_build.json` and the generated header, which now carry the device credential, in the build tree. The worker zips them into the owner-downloadable artifact.
  4. `Owner#create_default_mqtt_apikey` calls `list()` with a two-argument callback, so it never sees the existing Default key and always tries to create one. Since vep that attempt answers `alias_already_exists` instead of adding a duplicate. Also `Owner#mqtt_key` never calls back when the owner has keys but no Default key.
  5. `get_first_apikey` is now used only by ApikeySpec.
  6. Option for later: mint a per-device key at build time, for devices with no attributable key.

Commit lib/thinx/messenger.js and the three todo paths: `fix(quick-261003-vep): MQTT registration re-registers only the publishing device with its own key; resolve builder masked-key todo`. Then run the Task verify (prints VEP-GREEN).

Also run any other local spec added since `3e3ded6f` by the sibling quick tasks that is not in the verify list (`git log --diff-filter=A --name-only --format= 3e3ded6f..HEAD -- spec/jasmine/ | sort -u`, excluding ZZ-*), and report the counts in the SUMMARY. Do not push.
  </action>
  <verify>
    <automated>F="'jasmine/BuilderApiKeySpec.js','jasmine/BuilderRemoteJobSpec.js','jasmine/BuilderPathSpec.js','jasmine/ApikeyExactMatchSpec.js','jasmine/DeviceOwnershipSpec.js','jasmine/DeviceRegisterOwnerSpec.js','jasmine/MeshSessionAuthSpec.js','jasmine/SecretsSweepSpec.js','jasmine/LoggingQualityAuditSpec.js','jasmine/OwnerLogLeakSpec.js','jasmine/SanitkaSpec.js','jasmine/UtilSpec.js','jasmine/JSON2HSpec.js'"; for s in TransferApiKeySpec MessengerOwnershipSpec DevicePushOwnerSpec DeviceOttSpec DeviceFirmwareOwnerSpec LogTailOwnerSpec; do [ -f "spec/jasmine/$s.js" ] && F="$F,'jasmine/$s.js'"; done; OUT=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[$F],helpers:[],random:false});j.execute()" 2>&1); RC=$?; echo "$OUT" | tail -2; [ $RC -eq 0 ] && echo "$OUT" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && awk '/^\tmqttDeviceRegistration\(/,/^\t}$/' lib/thinx/messenger.js | grep -q 'this.akey.get_device_apikey(' && awk '/^\tmqttDeviceRegistration\(/,/^\t}$/' lib/thinx/messenger.js | grep -q 'withOwnedDevice(' && [ -f .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md ] && [ ! -f .planning/todos/pending/2026-10-03-builder-embeds-masked-api-key.md ] && grep -q '^## Resolution' .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md && grep -q '261003-vep' .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md && node --check lib/thinx/messenger.js && npx --no-install eslint lib/thinx/messenger.js lib/thinx/apikey.js lib/thinx/builder.js spec/jasmine/BuilderApiKeySpec.js && git diff --quiet -- lib/ spec/ && echo VEP-GREEN</automated>
  </verify>
  <done>The whole local spec, including VEP messenger, passes with the regression set (including vbg's MessengerOwnershipSpec). MQTT registration uses only the publishing device's own key and never creates one. A failed registration no longer throws. The todo is in completed/ with a Resolution, and the follow-up todo exists. Nothing is pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| build tree / artifact zip → firmware and owner download | the credential written into thinx_build.json and the header leaves the API process |
| MQTT publisher → messenger | any client with write access to an owner's status topics (the device, mesh peers, the owner) drives mqttDeviceRegistration |
| API process → logs | console output of apikey/builder/messenger |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vep-01 | Elevation of Privilege | builder embeds an owner credential the device never held (owner-wide first/last key; Default MQTT key = owner broker password, readwrite /<owner>/#) | high | mitigate | get_device_apikey returns only the pre-image of the device's lastkey, refuses the Default MQTT entry, otherwise THINX_API_KEY is "". VEP builder/core cases |
| T-vep-02 | Information Disclosure | key or hash written to API logs during lookup, build preparation, create or MQTT registration | medium | mitigate | no value logged anywhere on these paths (reason codes, owner id and udid only); console capture asserted in VEP core/builder/create/messenger; the worker script does not echo THINX_API_KEY (checked while planning) |
| T-vep-03 | Elevation of Privilege | a literal "use the string" fix turns MQTT registration into owner-key-backed re-registration of any device of the owner, resetting their broker passwords | high | mitigate | registration only for the topic's own udid and owner, an owned device (vbg withOwnedDevice) and that device's own credential; no key creation on this path. VEP messenger routing cases |
| T-vep-04 | Denial of Service | a failed MQTT registration dereferences response.registration.udid and throws in the MQTT message handler | medium | mitigate | registerDevice publishes only on a well-formed success and otherwise logs and returns. VEP messenger callback cases |
| T-vep-05 | Tampering | duplicate aliases/keys in ak:<owner> (repeated Default MQTT keys, identical same-second keys) make device identification ambiguous and let revoke-by-hash remove several entries | medium | mitigate | create() checks the parsed array with Util.safeEqual and refuses a malformed store without writing; create_key is 256-bit random. VEP create cases |
| T-vep-06 | Information Disclosure | thinx_build.json/header in the build tree and the artifact zip carry the device credential | low | accept | owner-only artifact route (session + owner check); same trust domain as Redis (cleartext keys); the value is already held by the device and shown to the owner. Follow-up todo item 3 |
| T-vep-07 | Information Disclosure | list() returns the cleartext key to the console; the create route logs a new key | medium | transfer | list() kept unchanged by instruction; recorded in the follow-up todo items 1-2 for an operator decision |
| T-vep-SC | Tampering | npm/pip/cargo installs | high | accept | no package installs and no package.json/lockfile change in this plan; the legitimacy gate is not triggered |
</threat_model>

<verification>
- Task 3's verify passes (VEP-GREEN): the whole BuilderApiKeySpec plus the local regression set in one process, the region checks on mqttDeviceRegistration, the todo moved with a Resolution, the follow-up todo present, node --check and ESLint clean, and lib/ and spec/ committed.
- Task 1 and Task 2 verifies printed VEP-TRACER-GREEN and VEP-CREATE-GREEN when they ran.
- `git log --oneline` shows the RED test commit before the three fix commits. No push.
</verification>

<success_criteria>
- THiNX-built firmware for a device with an attributable own key carries a credential that APIKey#verify accepts for its owner. No build embeds the masked name, another device's key, or the owner's Default MQTT key.
- MQTT registration can only re-present the publishing device's own key and no longer throws on failure.
- create() refuses duplicate aliases/keys and malformed stores; new keys are random.
- list() is unchanged for the console.
- Every touched local spec is green; the CI-only ApikeySpec/XBuilderSpec cases are adjusted to the new contract.
</success_criteria>

<output>
Create `.planning/quick/261003-vep-fix-builder-masked-api-key/261003-vep-SUMMARY.md` when done. Include:
- the RED counts (per describe) and the GREEN counts for each task verify;
- the commit table, noting unsigned commits if GPG was locked;
- the key rule as implemented;
- any vbg helper-name mapping or harness extension;
- the sibling local spec counts;
- the operator-facing changes.

Do not push or deploy.
</output>
