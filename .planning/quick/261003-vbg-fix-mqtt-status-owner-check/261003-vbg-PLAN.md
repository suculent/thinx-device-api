---
phase: quick-261003-vbg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spec/jasmine/MessengerOwnershipSpec.js
  - lib/thinx/messenger.js
  - lib/thinx/apikey.js
  - spec/jasmine/MessengerSpec.js
  - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md
autonomous: true
requirements: [VBG-MQTT-STATUS-OWNER]
tags: [security, mqtt, messenger, ownership, transfer, idor, tdd, jasmine]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A status message on /<owner>/<udid>/status for a device whose document owner is exactly <owner> still edits that device (Device#edit with {udid, status: <parsed payload>}) and runs its transformers with that owner's profile, with the same arguments as before, and reads no ak: store"
    - "Operator decision 2026-10-03: a status message on a transferred device's previous-owner topic /<topicOwner>/<udid>/status is ACCEPTED when the device document's current owner (doc.owner) holds a transfer binding for exactly this udid whose from list contains topicOwner. The binding is the one on the entry that doc.lastkey identifies in ak:<doc.owner> (APIKey.findDeviceKey, then APIKey.findTransferBinding). The update and the transformers then run as doc.owner (doc.owner's profile), never as topicOwner"
    - "Everything else is dropped and changes nothing: another owner's udid with no binding, a binding for a different udid, an owner not in from, a revoked or re-keyed key (no bound entry identified by lastkey), a legacy transfer without a binding, any CouchDB or Redis lookup error or a malformed key store, an unknown udid, and a malformed topic. The binding lookup is bounded: one devicelib.get(udid), then one GET of ak:<doc.owner>; it never searches other owners"
    - "A malformed topic (no leading slash, an owner segment that is not a 64-char lowercase hex owner id, a second segment that is not a udid, too few segments) never reaches CouchDB or Redis, and never triggers MQTT registration or API-key creation. Only the exact /<owner>/<udid>/status shape triggers a status edit"
    - "Check-in/check-out notifications (processStatus) and actionable notifications (processActionableNotification, both branches) use the same accept rule: owned, or bound by a transfer as above. For a dropped message nothing is sent to the socket, no nid:<udid> key is read or written, and the payload is not logged"
    - "Each dropped message yields at most one log line, and at most 5 drop lines are printed per 60 s window; the suppressed count is printed on the next window's first line. No drop line carries the payload, the raw topic, an owner id, a key, a hash or a lastkey"
    - "The failing spec is committed (test(...)) before any lib/ change. MessengerOwnershipSpec needs no Redis, CouchDB or broker; the local regression set (TransferApiKeySpec included) stays green in one process; MessengerSpec gains CI cases against real CouchDB and Redis"
    - "The device-side todo marks item 4 resolved with the operator decision, the accepted residual risk (the sender can forge status for a device it transferred away while the binding lives), follow-up ideas, the broker ACL analysis, and the out-of-class findings (a)-(g), which are recorded and not fixed"
  artifacts:
    - path: spec/jasmine/MessengerOwnershipSpec.js
      provides: "Local matrix on an Object.create(Messenger.prototype) fixture with recording fakes and a real APIKey (Object.create(APIKey.prototype)) on a Map-backed fake Redis. Describes: VBG status, VBG topic, VBG log, VBG check-in, VBG binding, VBG transfer, VBG actionable"
      contains: "261003-vbg"
    - path: lib/thinx/apikey.js
      provides: "APIKey#checkTransferBinding(current_owner, udid, lastkey, presented_owner, callback): one GET of ak:<current_owner>, then parseKeyStore, findDeviceKey(entries, lastkey) and findTransferBinding(entries, <identified entry's hash or key>, udid, presented_owner). Calls back (error|null, boolean); no logging, no audit"
      contains: "checkTransferBinding("
    - path: lib/thinx/messenger.js
      provides: "Messenger.topicOwner / topicUdid / isStatusTopic (silent topic sanitizing); Messenger#withAcceptedDevice (owner, or transfer binding via this.akey.checkTransferBinding; calls back with doc.owner); Messenger#logDroppedDeviceMessage (windowed limiter); gated updateAndTransformDeviceStatus, processStatus, processActionableNotification; messageResponder drops topics without a valid owner"
      contains: "Device.isOwnedBy("
    - path: spec/jasmine/MessengerSpec.js
      provides: "CI: another owner's status topic never reaches Device#edit (real CouchDB get and real ak: lookup); the owner's own status topic does"
      contains: "261003-vbg"
    - path: .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md
      provides: "Item 4 resolved; operator decision; accepted residual risk; follow-ups; broker ACL analysis; findings (a)-(g)"
      contains: "quick 261003-vbg"
  key_links:
    - from: lib/thinx/messenger.js messageResponder
      to: Messenger.topicOwner (Sanitka.strictOwner)
      via: "a topic whose first segment is not empty or whose owner segment is invalid is dropped before mqttDeviceRegistration, updateAndTransformDeviceStatus and processActionableMessages run"
      pattern: "Messenger\\.topicOwner\\("
    - from: lib/thinx/messenger.js updateAndTransformDeviceStatus / processStatus / processActionableNotification
      to: lib/thinx/messenger.js withAcceptedDevice
      via: "every device-scoped MQTT handler acts only inside withAcceptedDevice's callback, and uses the owner it is given (doc.owner) for Owner#profile and the transformers"
      pattern: "this\\.withAcceptedDevice\\("
    - from: lib/thinx/messenger.js withAcceptedDevice
      to: lib/thinx/device.js Device.isOwnedBy, then lib/thinx/apikey.js APIKey#checkTransferBinding
      via: "this.devicelib.get(<sanitized udid>); owned → accept; otherwise this.akey.checkTransferBinding(doc.owner, udid, doc.lastkey, topicOwner); error → binding_lookup_failed, false → foreign_owner"
      pattern: "this\\.akey\\.checkTransferBinding\\("
    - from: lib/thinx/apikey.js checkTransferBinding
      to: APIKey.findDeviceKey and APIKey.findTransferBinding (u86)
      via: "reused as-is; no second binding matcher"
      pattern: "APIKey\\.findTransferBinding\\("
---

<objective>
Close item 4 of `.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md`. Today `lib/thinx/messenger.js` `updateAndTransformDeviceStatus(oid, did, message, topic)` (~:377-399, called from `messageResponder` ~:603) edits the device named by the topic udid and runs its transformers. It never compares the device document's `owner` with the topic owner, and relies on the broker ACL alone.

**Revised rule (operator decision 2026-10-03, relayed by the orchestrator).** For a status message, or an actionable/check-in message, on `/<topicOwner>/<udid>/…`:

1. **Sanitize first.** `topicOwner` must pass `Sanitka.strictOwner` and `udid` must pass a silent udid test plus `Sanitka.udid`. If either fails, drop as `malformed_topic` (no CouchDB, no Redis).
2. **Load the device.** Call `this.devicelib.get(udid)`. An error or no document → drop as `unknown_device`.
3. **Owned.** `Device.isOwnedBy(doc, topicOwner)` → accept, acting as `doc.owner`.
4. **Bound by a transfer.** Otherwise, let `current = Sanitka.strictOwner(doc.owner)`:
   - if `current` is invalid, drop as `foreign_owner`;
   - otherwise call `this.akey.checkTransferBinding(current, udid, doc.lastkey, topicOwner, cb)`;
   - an error drops as `binding_lookup_failed`, false drops as `foreign_owner`, and true accepts, acting as `current`.
5. **Act as the current owner.** Every accepted handler acts as `doc.owner`: `Owner#profile(doc.owner)` and the transformers that resolve in it. Never as `topicOwner`.

`APIKey#checkTransferBinding` is new and small. It composes u86's helpers instead of reimplementing them:
- one GET of `ak:<current>`;
- the module-private `parseKeyStore`;
- `APIKey.findDeviceKey(entries, lastkey)`, which identifies the device's own key entry, exactly one match;
- `APIKey.findTransferBinding(entries, <that entry's hash, else its key>, udid, presented_owner)`.

`findTransferBinding` matches only on a presented key, and an MQTT message carries none. `doc.lastkey` is how the server knows which key the device uses: u86 requires an identifiable `lastkey` to transfer at all, and refreshes it on every verified check-in.

Consequences of looking the binding up through `lastkey`:
- a device the recipient re-keyed, or whose moved key was revoked, stops being accepted on the old topic;
- per u86 operator decision 3, the binding is never consumed. It ends only on key revoke, owner purge or the next transfer.

**Accepted residual risk (operator, informed of the trade-off).**
- **The sender can forge status.** Its own MQTT credential may publish `/<sender>/#`, so it can forge status, check-in and actionable messages for the device it gave away for as long as the binding lives.
- **What a forged message reaches:**
  - it edits the recipient's device status;
  - it runs the recipient's transformers on attacker-chosen input;
  - it sends check-in/actionable notifications;
  - it writes the `nid:<udid>` state.
- **Remedies for a recipient:**
  - re-key the device: create a key, reprovision, let it check in once, so `lastkey` identifies an unbound entry;
  - or revoke the moved key.

**Follow-up ideas (recorded in the todo, not planned here):**
- **Per-device MQTT topic namespace or credential binding.** For example, accept old-topic status only when the device's own credential published it. That needs publisher identity: MQTT 5 user properties set by a broker plugin, or a `/d/<udid>/status` namespace whose ACL only the udid user holds.
- **ACL cleanup on transfer.** This is item 1 of the continuity leftovers todo `.planning/todos/pending/2026-10-03-transfer-continuity-leftovers.md`. If accept revokes the sender's topics from the udid's ACL, the device itself can no longer publish on the old topic, but the sender's owner credential still can. So that item must be reconciled with this acceptance rule.
- **A messenger-side marker.** Once a status arrives on `/<recipient>/<udid>/status`, the messenger could stop accepting the old topic for that udid, without consuming the HTTP binding (operator decision 3 stays intact).
- **Delivery limitation.** Old-topic messages reach the API only through a per-owner messenger client of the previous owner, which subscribes `/<sender>/#`. The recipient's client never sees them, so acceptance happens only while such a client is connected.

**How messages arrive (verified while planning).**
- `initWithOwner(owner, socket)` → `setupMqttClient` connects as username owner and password that owner's Default MQTT API key, then subscribes `/<owner>/#` (~:651-658).
- Its `message` handler calls `messageResponder(topic, message)` (~:680-682). `oid` and `did` come from `topic.split("/")` indexes 1 and 2 (~:595-597), unsanitized.
- The master `thinx` client attaches `message_callback`, not `messageResponder`.
- THiNXLib publishes status to exactly `"/%s/%s/status"` (owner, udid) (`thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp:1123`). EEPROM builds, and builds that pass an owner id to the constructor, keep the previous owner id after every reboot (u86 leftovers todo item 2). They keep publishing on the old topic, and that is the traffic the operator decision keeps working.

**What the broker ACL guarantees.** The broker is mosquitto-go-auth with the Redis backend and superuser disabled (`services/broker/config/mosquitto.conf:49-71`). Its ACL sets `<user>:racls|wacls|rwacls|sacls` are written by `lib/thinx/acl.js` `commit_redis`.
- **Device user** (username udid; `Device#authorize_mqtt`, `lib/thinx/device.js` ~:743-770): readwrite on `/<owner>/<udid>`, `/<owner>/<udid>/status`, `/<owner>/shared/#` and `/<owner>/<mesh>`, for every owner it registered under.
- **Owner user** (`Owner#create_default_acl`, `lib/thinx/owner.js` ~:740-759): readwrite on `/<owner>`, `/<owner>/#` and `/<owner>/shared/#`.
- **Every user** also gets subscribe `/#`.

**Why the server-side check is still needed (defence in depth):**
1. **The ACL is prefix-based, not ownership-based.** Owner A's credential may publish `/A/<B's udid>/status`.
2. **ACL drift is built in.** `commit_redis` only SADDs and nothing SREMs on transfer. `addTopic` de-duplicates by substring.
3. **Subscribers do not know who published.** MQTT 3.1.1 delivers no publisher identity.
4. **Broker and Redis configuration drift independently of CouchDB.**

The binding rule narrows point 1 to the one case the operator accepted.

**Other decisions.**
- **Reuse `Device.isOwnedBy` (t29), not `Device#fetchOwned`.** `fetchOwned` uses device.js's own devicelib handle, sanitizes with `sanitka.owner` (which logs raw input on failure) and logs every refusal, so it would flood the log. The messenger reads through its own `this.devicelib` and logs through one limiter.
- **Reuse u86's binding helpers, and skip `transferRedirect`.** `checkTransferBinding` reuses `findDeviceKey` and `findTransferBinding`. It does not reuse `APIKey#transferRedirect`, which needs the presented key and writes an audit entry plus an info line per call; per MQTT status message that would flood both.
  - `checkTransferBinding` logs nothing.
  - It answers `(null, false)` without touching Redis when presented == current, when an input is invalid, or when `lastkey` is missing.
- **Silent, strict topic parsing.**
  - Owner segment: `Sanitka.strictOwner` (exactly 64 `[a-z0-9]`, no logging; Phase 23 D-12 precedent).
  - Udid segment: a silent `^[a-fA-F0-9-]{36}$` test, then `Sanitka.udid`, which then never reaches its warning line.
  - A status edit requires exactly `/<owner>/<udid>/status`: 4 segments, the first empty, the last `status`.
- **Drop reasons and log line.**
  - Reasons: `malformed_topic`, `unknown_device`, `foreign_owner`, `binding_lookup_failed`.
  - Line: `⚠️ [warning] [messenger] dropped MQTT device message: <reason>, udid <sanitized udid or ->`, with ` (<n> suppressed in the previous window)` on the first line of a window when n > 0.
  - The limiter allows 5 lines per fixed 60 s window, read through `Date.now()`. Its state lives on the instance and is created lazily.
  - Accepted messages, owned or bound, log nothing new. Status traffic is high-frequency, and u86's HTTP redirect already audits the device under its current owner.
- **Same class, included:**
  - `processStatus`: reads the document and sends its alias to the socket.
  - `processActionableNotification`: reads and writes `nid:<did>` in both branches, and logs the payload first.

  Both now go through `withAcceptedDevice`. `processStatus` checks for `connected`/`disconnected` before it reads anything.
- **Not the same class, unchanged and recorded:**
  - `mqttDeviceRegistration` → `Device#register`: key-verified, tv5 owner-bound, u86 redirect-aware. It now only ever sees a valid owner.
  - `processConnectionChange` and `processUnknownNotification`: socket relay only.
  - `message_callback`: dormant.
- **Accepted messages keep today's calls.** `this.device.edit({udid, status: message}, …)` and `this.user.profile(<accepted owner>, (profile) => this.device.runDeviceTransformers(profile, doc, null, null, null))`. The only difference is that the profile owner is now `doc.owner` and not the topic owner. The transformer pipeline's own defects (b) are out of scope.

**Found while planning: not fixed, recorded in the todo (Task 3).** Each claim is re-verified with a grep or read before it is written down.
- (a) **`forwardNonNotification` throws in every non-test environment** (~:344-355). `createInstance` sets `rtm = null` and `channel = null`, and `DISABLE_SLACK` is hard-coded true. `typeof null` is `"object"`, so `this.rtm.sendMessage` throws a TypeError for every non-notification message whenever `ENVIRONMENT !== "test"`.
  - It runs before any status processing. mqtt.js 5.16 emits `message` without a try/catch (`node_modules/mqtt/build/lib/handlers/publish.js` ~:121), and no `uncaughtException` handler exists in `thinx.js`, `thinx-core.js` or `lib/`. So in production the API process most likely crashes on such a message, and this gated path never runs there.
  - CI runs `ENVIRONMENT=test`, so CI never sees it.
  - Not fixed here, because fixing it activates the transformer path, see (b). That is an operator decision.
  - Read-only check (operator): thinx_api task restarts, and node-local `docker logs` for `reading 'sendMessage'`.
- (b) **The transformer path reached from MQTT is broken in three ways** (`device.js` ~:496-660):
  - a null `reg` throws a TypeError at `reg.status` when a transformer matches;
  - `transformers: []`, the default for new devices, writes the pre-update document back through `update_device_and_respond`, racing the status edit;
  - the lambda response handler reads an undeclared `udid`.
- (c) **Notifications go to the wrong owner's console.** `this._socket` is a singleton field, so notifications go to whichever owner last ran `initWithOwner`, which `thinx-core.js` ~:617-628 calls with the owner named in the WS `init` message. `thinx-core.js` is not touched.
- (d) **`this.socket` is never set.** It stays null, so `sendWithValidSocket`, `processActionableNotification` and `processUnknownNotification` throw on `this.socket.OPEN` whenever `_socket` is non-null.
- (e) **`processActionableNotification`'s response branch** copies `nid:<nid>`, where the nid comes from the payload and is not owner-bound, into `nid:<did>`. It throws on `JSON.parse(null).length` when that key is absent.
- (f) **`publish()` returns immediately while `DISABLE_SLACK`** (~:208-210), so configuration push and notifications never reach devices. Separately, `registerDevice` dereferences `registration_response.registration.udid` even on failure.
- (g) **The master client's callbacks are attached unbound.** `connect_callback` and `message_callback` (~:788-792) run with `this` bound to the MQTT client, so the master never subscribes `#`. Separately, `data(owner, udid)` builds the glob `"/*" + owner + "/" + udid + "*"`, whose leading `*` also matches other prefixes.

**What changes for real users** (copy into the SUMMARY):
1. **Foreign messages are ignored.** Status, check-in and actionable messages for another owner's udid are ignored, with one rate-limited warning line each.
2. **Transferred devices keep working on the old topic.** A transferred device still publishing on its previous owner's topic keeps working (operator decision), and its updates land as the current owner's device with the current owner's transformers. This holds while the moved key keeps its binding and stays the device's key. Re-keying the device or revoking the moved key ends it.
3. **Only the exact `/<owner>/<udid>/status` topic edits device status.** Topics whose owner segment is not a valid owner id are ignored entirely, including MQTT registration and the socket relay.
4. **Production caveat:** because of (a), none of this message processing is believed to run in production today. The gate is in place for CI and for whenever (a) is fixed.

Source coverage audit (the task description plus the operator decision are the sources):

| Source item | Covered by |
|---|---|
| Owner compare before status update/transformers (strict, `Device.isOwnedBy`) | Task 1; spec VBG status |
| Drop with one log line, no payload/secrets, rate-aware | Task 1 limiter; spec VBG log |
| Audit other MQTT-driven write paths; include same class; record the rest | Task 1 (`processStatus`), Task 2 (`processActionableNotification`); Task 3 todo |
| Topic parsing `/<owner>/<udid>/...`; oid/did sanitized before use | Task 1; spec VBG topic |
| Broker ACL: what it guarantees, why the server check is still needed | Objective; Task 3 todo; SUMMARY |
| Operator decision: old-owner topic accepted through the u86 transfer binding, applied as the current owner; bounded lookup; error → drop; reuse u86 helpers | Task 2 (`APIKey#checkTransferBinding` reusing `findDeviceKey`/`findTransferBinding`/`parseKeyStore`; the binding branch of `withAcceptedDevice`); spec VBG binding, VBG transfer |
| Spec: binding → accepted as new owner; binding for a different udid → dropped; owner not in `from` → dropped; revoked key → dropped | Spec VBG transfer (plus re-keyed, legacy-unbound, lookup-error and malformed-store cases) |
| Same rule for actionable notifications | Task 2; spec VBG transfer (bound actionable) and VBG actionable |
| Record the accepted residual risk with the operator decision, plus follow-up ideas | Objective; Task 3 todo; SUMMARY; threat T-vbg-12 |
| Legitimate updates keep working (own devices; transferred devices on either topic) | Spec VBG status (1)(2), VBG transfer T1/T2; Task 3 CI positive case |
| TDD: failing spec committed RED before lib/ | Task 1 step A |
| Findings (a)-(g) recorded, not fixed; `thinx-core.js` untouched | Task 3; files_modified |
| CI must stay green; no edits to package.json scripts, `.circleci/config.yml`, `Dockerfile.test`, `docker-entrypoint.sh` | files_modified; Task 2 regression set; CI cases order- and race-safe |
| Other quick tasks (u86 landed; v05, v9d, v9x run first) | Task 1 precondition; Task 3 edits the todo in place |
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md
@.planning/todos/pending/2026-10-03-transfer-continuity-leftovers.md
@.planning/quick/261003-t29-fix-device-udid-ownership-check/261003-t29-SUMMARY.md
@.planning/quick/261003-u86-device-transfer-carries-its-api-key/261003-u86-SUMMARY.md
@lib/thinx/messenger.js
@lib/thinx/apikey.js
@spec/jasmine/MessengerSpec.js

Interfaces the executor relies on (verified while planning; line numbers are approximate, so grep by name):
- `lib/thinx/messenger.js` exports the class `Messenger`. `Object.create(Messenger.prototype)` gives an instance with every method and no constructor side effects; the constructor connects to Redis and MQTT. `require("./lib/thinx/messenger.js")` loads locally with `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p`. `messenger.js` already imports `Device` (`./device`) and `ApiKey` (`./apikey`), and `createInstance` sets `this.akey = new ApiKey(redis)`.
- `Device.isOwnedBy(doc, owner)` (`lib/thinx/device.js` ~:1590) is a strict `doc.owner === owner` for a non-empty string owner and an object doc.
- `lib/thinx/apikey.js` (u86, landed `0e6b82f1`..`16bde50a`):
  - Constructor: `{redis, alog: new AuditLog(), prefix}`.
  - `ak:<owner>` holds a JSON array of `{key, hash, alias, transfer?: {udid, from: [owner ids], at}}`.
  - Module-private `parseKeyStore(raw)` (~:55): null/undefined → `[]`, a JSON array → that array, anything else → null.
  - `static findDeviceKey(entries, lastkey)` (~:364) → `{status: "found", index, entry}` for exactly one entry whose `deviceKeyCandidates` (sha256(key), hash, sha256(hash)) `Util.safeEqual`s lastkey; otherwise `{status: "ambiguous"}` or `{status: "not_identified"}`.
  - `static findTransferBinding(entries, apikey, udid, presented_owner)` (~:392) is true only when exactly one entry's `.key` or `.hash` equals `apikey`, its `transfer.udid === udid`, and `transfer.from` contains `presented_owner`.
  - `transferRedirect` (~:306) is the HTTP-path redirect. It needs the presented key and audit-logs, so it is not reused here.
- Device documents carry:
  - `lastkey = sha256(<presented key>)`, refreshed on every verified check-in (`device.js` ~:428);
  - after a u86 transfer, `previous_owner` and `transferred_at` (`transfer.js` ~:120).

  The binding is never consumed (u86 operator decision 3). It ends on key revoke, owner purge or the next transfer, and chained transfers accumulate `from`.
- `lib/thinx/sanitka.js`: `Sanitka.strictOwner(s)` is silent, exactly 64 `[a-z0-9]`. `Sanitka.udid(s)` is silent for non-strings and length ≠ 36, and otherwise logs `UDID RegEx and replace failed` when the regex fails. `Sanitka.owner` logs `document identifier invalid` on failure.
- Call graph from MQTT:
  - `setupMqttClient` → `messageResponder(topic, message)`
  - `messageResponder` → `ensureJSON`, `forwardNonNotification`, `mqttDeviceRegistration(topic, message, oid)`, `updateAndTransformDeviceStatus(oid, did, message, topic)`, `processActionableMessages(message, oid, did, topic)`
  - `processActionableMessages` dispatches to:
    - `processStatus(did, message)` when `message.status` is defined;
    - `processConnectionChange(oid, did, message)` when `message.connected` is defined;
    - `processActionableNotification(did, topic, message)` when `message.notification` is defined;
    - `processUnknownNotification(message)` otherwise.

  `processStatus` and `processActionableNotification` have no callers outside `messenger.js`, so changing their signatures is safe. `sendWithValidSocket` sends when `this._socket !== null && this._socket.readyState === this.socket.OPEN`.
- Local spec run form (t29/tv5/u86): `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[...],helpers:[],random:false});j.execute(undefined,'<regex filter>')"`.
- Baseline after u86, at revision time: TransferApiKey, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka, DeviceOwnership, DeviceRegisterOwner, ApikeyExactMatch, MeshSessionAuth and Util in one process give `325 specs, 0 failures`. ApikeySpec needs Redis and is not part of the local set. ESLint is clean on `lib/thinx/messenger.js` and `spec/jasmine/MessengerSpec.js`.
- CI runs with `ENVIRONMENT=test`. `MessengerSpec`:
  - builds a real instance (`new Messenger(redis, "mosquitto").getInstance(...)`);
  - registers `TEST_DEVICE_6` under `envi.oid` with `envi.ak`, which is the CI-only key, in no `ak:` store, so `findDeviceKey` reports `not_identified`;
  - runs `initWithOwner(test_owner, null, …)`, leaving `_socket` null;
  - runs in a fixed (not random) order.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): RED spec, then the owner-checked MQTT status path end to end</name>
  <files>spec/jasmine/MessengerOwnershipSpec.js, lib/thinx/messenger.js</files>
  <precondition>The quick tasks that run before this one (261003-v05, -v9d, -v9x; u86 has landed) have committed their work, and `git diff --quiet HEAD -- lib/thinx/messenger.js lib/thinx/apikey.js spec/jasmine/MessengerSpec.js` succeeds (no foreign uncommitted edits in the files this plan owns).</precondition>
  <read_first>lib/thinx/messenger.js (whole), lib/thinx/apikey.js (parseKeyStore, findDeviceKey, findTransferBinding, transferRedirect, constructor), lib/thinx/sanitka.js (udid, strictOwner, owner), lib/thinx/device.js (isOwnedBy only), spec/jasmine/TransferApiKeySpec.js (how ak: stores with transfer bindings are seeded), spec/jasmine/OwnerLogLeakSpec.js (captureConsole/leaked helpers), and every `.planning/quick/261003-{v05,v9d,v9x}*/*-{PLAN,SUMMARY}.md` that exists now (if one touched messenger.js or apikey.js, apply this plan's edits on top of its version)</read_first>
  <behavior>
    Fixture: `makeMessenger(opts)`, fresh per `it`.
    - `m = Object.create(Messenger.prototype)` with createInstance's state: `DISABLE_SLACK` true, `rtm` null, `channel` null, `clients` {}.
    - One Map-backed fake Redis shared by `m.redis` and `m.akey`:
      - `get(key, cb)` answers on `setImmediate` and records the key; `opts.redisError` makes `ak:` reads answer an Error;
      - `set(key, val)` records the key.
    - `m.akey = Object.create(APIKey.prototype)` with that `redis` and an `alog` stub, so the real u86 statics and the new method run. `get_first_apikey` is spied (records, calls back `false`).
    - `devicelib.get(id, cb)` answers on `setImmediate`: a deep copy of a seeded doc, or a 404-shaped Error.
    - `device.edit(changes, cb)` records `{udid, status}` and calls back `(true, {})`; `device.runDeviceTransformers(profile, doc)` records `{owner: profile.owner, udid: doc.udid}`; `device.register` records only.
    - `user.profile(owner, cb)` records the owner and calls back `{owner, info: {transformers: []}}`; `user.create_default_mqtt_apikey` records only.
    - `_socket = {readyState: 1, send}` records sent strings; `socket = {OPEN: 1}`.
    - `m.forwardNonNotification` is a no-op. The header explains why: with createInstance's state it throws whenever ENVIRONMENT is not "test" (finding (a)). `socket` is set because createInstance leaves it null (finding (d)).
    - `flush()` awaits about 8 `setImmediate` rounds.

    Seed data:
    - Owners: OWNER_A, OWNER_B and OWNER_C, sha256 hex of fixed strings.
    - Keys: KEY_A, KEY_B, KEY_T, KEY_X, KEY_L, KEY_R (fixed strings), hash = sha256(key).
    - `ak:B` = [
      - {KEY_B, unbound},
      - {KEY_T, transfer {udid: UDID_T, from: [OWNER_A], at: AT}},
      - {KEY_X, transfer {udid: UDID_T, from: [OWNER_A], at: AT}}, a binding naming a different udid than the device that holds the key,
      - {KEY_L, unbound},
      - {KEY_R, unbound}

      ].
    - `ak:A` = [{KEY_A}].
    - Docs (36-char lowercase uuid-v1-shaped udids, `lastkey = sha256(<its key>)`):
      - UDID_A: owner A, KEY_A, alias "vbg-alias-a";
      - UDID_B: owner B, KEY_B, alias "vbg-alias-b";
      - UDID_T: owner B, previous_owner A, transferred_at AT, KEY_T, alias "vbg-alias-t";
      - UDID_X: owner B, previous_owner A, KEY_X;
      - UDID_L: owner B, previous_owner A, KEY_L (legacy transfer, no binding).
    - UDID_U is unknown.
    - Payloads are `Buffer.from(JSON.stringify(...))` unless a case says otherwise.

    "VBG status" (effects only):
    - (1) `/A/UDID_A/status` {status:"online"} → one edit {UDID_A, {status:"online"}}; profile loaded once, for OWNER_A; one transformer run {OWNER_A, UDID_A}; no `ak:` key read.
    - (2) The same as a plain object → same effects.
    - (3) `/A/UDID_B/status` → no edit, profile or transformer run; devicelib.get was called with UDID_B.
    - (4) `/A/UDID_U/status` → no edit, profile or transformer run.
    - (5) `/A/UDID_A/status/extra` and `/A/UDID_A/statusx` → no edit, no transformer run.

    "VBG topic" (one `it` per topic; message {status:"connected"}; no devicelib.get, no Redis read, no edit, no profile, no `get_first_apikey`/create/register call):
    - `/A/not-a-udid/status`
    - `/A/_all_docs/status`
    - `/A/status`
    - `//UDID_A/status`
    - `A/UDID_A/status`
    - `/NOT-AN-OWNER/UDID_A/status`
    - `/<OWNER_A uppercased>/UDID_A/status`
    - plus: {registration:{mac:"AA:BB:CC:00:00:01"}} on `/NOT-AN-OWNER/UDID_A/status` makes none of those calls.

    "VBG log" (console captured; failures report counts or which sentinel leaked, never log text):
    - (6) 50 × `/A/UDID_B/status` {status:"connected", detail: SENTINEL} → 1 to 5 lines match `[messenger] dropped MQTT device message`, and no captured line contains SENTINEL, any owner id, any key, any hash or any lastkey.
    - (7) 50 mixed messages → at most 5 captured lines, none with `UDID RegEx and replace failed` or `document identifier invalid`. The mix is UDID_U status messages, a 36-char non-udid segment and a 65-char owner segment.
    - (8) With `Date.now` spied at T: 7 malformed-owner drops → 5 lines. At T+61000, 1 more → a 6th line matching `2 suppressed`.

    "VBG check-in":
    - (9) {status:"connected"} on `/A/UDID_A/status` → one socket "Check-in" message containing "vbg-alias-a".
    - (10) The same on `/A/UDID_B/status` → nothing sent, and "vbg-alias-b" appears nowhere.

    "VBG binding" (unit tests of the real `APIKey#checkTransferBinding` on the fake Redis; each case first asserts that `typeof m.akey.checkTransferBinding === "function"`, so RED fails by assertion):
    - (11) (OWNER_B, UDID_T, lastkey(KEY_T), OWNER_A) → `(null, true)`.
    - (12) (OWNER_B, UDID_X, lastkey(KEY_X), OWNER_A) → false: the binding names UDID_T.
    - (13) (OWNER_B, UDID_T, lastkey(KEY_T), OWNER_C) → false.
    - (14) lastkey(KEY_R), an unbound entry: the re-keyed device → false.
    - (15) lastkey of a key absent from `ak:B` (revoked) → false.
    - (16) A Redis error → error non-null, false. `ak:B` = "not json" → error non-null, false.
    - (17) presented == current, and a missing lastkey → false, with no Redis read.

    "VBG transfer" (operator decision; messenger level):
    - T1: `/A/UDID_T/status` {status:"online"} → one edit {UDID_T}; profile loaded only for OWNER_B, never OWNER_A; transformer run {OWNER_B, UDID_T}.
    - T2: `/B/UDID_T/status` → applied as OWNER_B, with no `ak:` read.
    - T3: `/A/UDID_X/status` (the binding names another udid) → dropped: no edit, profile or transformer run.
    - T4: `/C/UDID_T/status` (owner not in from) → dropped.
    - T5: revoked: the KEY_T entry removed from `ak:B` → `/A/UDID_T/status` dropped.
    - T6: re-keyed: UDID_T's lastkey = sha256(KEY_R) while the KEY_T entry remains → dropped.
    - T7: `/A/UDID_L/status` (legacy transfer, no binding) → dropped.
    - T8: `opts.redisError`, and separately a malformed `ak:B` → `/A/UDID_T/status` dropped.
    - T9: {status:"connected"} on `/A/UDID_T/status` → a socket "Check-in" message containing "vbg-alias-t".
    - T10: {notification:{body:"vbg",response_type:"bool"}} on `/A/UDID_T` → `nid:UDID_T` read and written.

    "VBG actionable":
    - (18) {notification:{body:"vbg",response_type:"bool"}} on `/A/UDID_A` → `nid:UDID_A` read and written, and one socket message.
    - (19) The same with body SENTINEL on `/A/UDID_B` → no Redis key containing UDID_B other than `ak:` is read or written, no socket message, and SENTINEL is in no captured line.
    - (20) {notification:{response:true, nid:"vbg-nid"}} on `/A/UDID_B` → no set of `nid:UDID_B`. Pre-seed `nid:vbg-nid` = "[]" so finding (e)'s `JSON.parse(null)` crash cannot fire.

    Predicted RED:
    - Pass already, and pin "keeps working": (1), (2), (4), (9), T2, T9, T10 and (18). On RED, T10 and T9 pass and T1 fails, because today's code processes the message but loads OWNER_A's profile.
    - Everything else fails by assertion. The VBG binding cases fail at their `typeof` assertion.
  </behavior>
  <action>
**Step A (RED).**
1. Create `spec/jasmine/MessengerOwnershipSpec.js` with the fixture and the cases in `<behavior>`. Use one outer describe `MessengerOwnershipSpec (quick 261003-vbg)` with nested describes VBG status, VBG topic, VBG log, VBG check-in, VBG binding, VBG transfer and VBG actionable.
2. Default `process.env.ENVIRONMENT` to "development" when it is undefined.
3. Write a header comment stating:
   - what is pinned, including the operator decision and the accepted residual risk;
   - that it needs no Redis, CouchDB or broker;
   - the two fixture notes (`forwardNonNotification`, `socket`);
   - that no payload, owner id, key, hash or lastkey is ever printed.
4. Spec hygiene:
   - Hard-code the limiter contract (5 lines per 60000 ms) as spec constants.
   - Use chai `expect` and jasmine `spyOn` (`console.*`, `Date.now`, `get_first_apikey`).
   - No `require.cache` swap.
5. Run the full file. Record `N specs, M failures` for the SUMMARY, then check that:
   - every failure is an assertion failure, with no TypeError or harness error;
   - the predicted-pass set passes.

   Fix harness errors in the harness, never in the expectations.
6. Commit only the spec: `test(quick-261003-vbg): failing spec for MQTT status topic owner check and transfer binding`.

**Step B (GREEN, `lib/thinx/messenger.js`, owner-only for now).**
1. Add `const Sanitka = require("./sanitka");` and module constants for a 60000 ms window with 5 lines per window.
2. Add static helpers:
   - `topicOwner(segment)`: `Sanitka.strictOwner`, null for non-strings;
   - `topicUdid(segment)`: a silent `^[a-fA-F0-9-]{36}$` test, then `Sanitka.udid`, else null;
   - `isStatusTopic(topic)`: a string with exactly 4 `/`-segments, the first empty and the last `status`.
3. Add `logDroppedDeviceMessage(reason, udid)`:
   - lazily created instance window read through `Date.now()`;
   - carry the previous window's suppressed count into the new window;
   - at most 5 lines per window;
   - the line format from the objective;
   - it receives only a sanitized udid or null.
4. Add `withAcceptedDevice(oid, did, onAccepted)`:
   - sanitize both; if either is invalid → `malformed_topic`, and return before CouchDB;
   - `this.devicelib.get(udid, …)`: an error or no doc → `unknown_device`;
   - `Device.isOwnedBy(doc, owner)` → `onAccepted(doc, owner, udid)`;
   - otherwise → `foreign_owner`. Task 2 inserts the binding branch exactly here.
   - Put a comment block above it naming quick 261003-vbg and the ACL reasoning in 2-3 lines.
5. `updateAndTransformDeviceStatus(oid, did, message, topic)`:
   - return unless `Messenger.isStatusTopic(topic)`;
   - then `withAcceptedDevice`; in the accepted callback, keep `this.device.edit({udid, status: message}, …)` with its existing error line, then `this.user.profile(<accepted owner>, (profile) => this.device.runDeviceTransformers(profile, doc, null, null, null))`;
   - remove the per-lookup bare `console.log(error)`.
6. `processStatus(oid, did, message)`:
   - return unless status is "connected" or "disconnected";
   - otherwise `withAcceptedDevice`, then the existing notifications using the accepted doc's alias;
   - update its call in `processActionableMessages`.
7. In `messageResponder`, after `forwardNonNotification` (unchanged, see (a)):
   - drop `malformed_topic` and return if `topic` is not a string, its first segment is not empty, or `Messenger.topicOwner(<segment 1>)` is null;
   - otherwise pass the sanitized owner as `oid` to `mqttDeviceRegistration`, `updateAndTransformDeviceStatus` and `processActionableMessages`, and pass the raw second segment as `did`.
8. Do not touch `forwardNonNotification`, `mqttDeviceRegistration`, `publish`, `processConnectionChange`, `processUnknownNotification`, `message_callback` or the transformer arguments.
9. Run the verify. Commit: `fix(quick-261003-vbg): MQTT status updates only for the topic owner's devices`.

If GPG is locked, use `git -c commit.gpgsign=false commit` (the operator's standing exception). Never use `--no-verify`.
  </action>
  <verify>
    <automated>OUT=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/MessengerOwnershipSpec.js'],helpers:[],random:false});j.execute(undefined,'VBG status|VBG topic|VBG log|VBG check-in')" 2>&1); RC=$?; echo "$OUT" | tail -3; RED=$(git log --format=%H -n 1 --grep='^test(quick-261003-vbg): failing spec'); [ $RC -eq 0 ] && echo "$OUT" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && [ -n "$RED" ] && REDFILES=$(git show --name-only --format= "$RED") && [ -n "$REDFILES" ] && [ -z "$(printf '%s\n' "$REDFILES" | grep '^lib/')" ] && git merge-base --is-ancestor "$RED" HEAD && ! git diff --quiet "$RED" HEAD -- lib/thinx/messenger.js && grep -q 'Device.isOwnedBy(' lib/thinx/messenger.js && grep -q 'Sanitka.strictOwner(' lib/thinx/messenger.js && grep -q 'this.withAcceptedDevice(' lib/thinx/messenger.js && node --check lib/thinx/messenger.js && echo VBG-STATUS-GREEN</automated>
  </verify>
  <done>
- The RED commit touches only the spec and precedes the fix, and its run output is recorded.
- VBG status, topic, log and check-in are green.
- An owner's own device still gets the status edit and transformer run.
- Another owner's udid, an unknown udid and malformed topics change nothing, and malformed topics never reach CouchDB or Redis.
- Drop lines are capped and carry no payload, owner id or key material.
- Prints VBG-STATUS-GREEN.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: transfer-binding acceptance (operator decision) and owner-checked actionable notifications; regression sweep</name>
  <files>lib/thinx/apikey.js, lib/thinx/messenger.js</files>
  <read_first>lib/thinx/apikey.js (parseKeyStore, findDeviceKey, findTransferBinding, transferRedirect), lib/thinx/messenger.js withAcceptedDevice / processActionableNotification / processActionableMessages as left by Task 1, spec/jasmine/MessengerOwnershipSpec.js VBG binding / VBG transfer / VBG actionable</read_first>
  <behavior>
    - VBG binding, VBG transfer and VBG actionable pass, and the whole MessengerOwnershipSpec file is green.
    - An old-owner topic with a binding for exactly that udid, listing the topic owner, on the entry the device's lastkey identifies, is accepted and applied as doc.owner.
    - A binding for another udid, an owner not in `from`, a revoked or re-keyed key, a legacy unbound transfer, a lookup error and a malformed store all drop.
    - Owned messages never read `ak:`.
    - Actionable notifications follow the same rule in both branches.
  </behavior>
  <action>
**`lib/thinx/apikey.js`.**
1. Add the instance method `checkTransferBinding(current_owner, udid, lastkey, presented_owner, callback)`, placed next to `findTransferBinding`, with a doc comment naming quick 261003-vbg and the operator decision. Callback shape: `(error|null, boolean)`.
2. Without any Redis call, answer `(null, false)` when:
   - `current_owner` or `presented_owner` is not a non-empty string, or they are equal;
   - `Sanitka.udid(udid)` is null;
   - `lastkey` is not a non-empty string.
3. Otherwise GET `"ak:" + current_owner` once:
   - Redis error → `(error, false)`;
   - `parseKeyStore(raw)` null → `(new Error("malformed key store"), false)`;
   - `APIKey.findDeviceKey(entries, lastkey)` not `"found"` → `(null, false)`;
   - otherwise `(null, APIKey.findTransferBinding(entries, <found entry's hash when it is a non-empty string, else its key>, udid, presented_owner))`.
4. Make the callback fire exactly once, with a `try`/`catch` → `(e, false)` like `transferRedirect`.
5. No `console` line, no `alog` entry, no stats.
6. Leave `transferRedirect`, `findTransferBinding`, `findDeviceKey` and every other method byte-identical. The binding matcher is reused, not duplicated.

**`lib/thinx/messenger.js`.**
1. In `withAcceptedDevice`, replace the plain `foreign_owner` drop with the binding branch:
   - `current = Messenger.topicOwner(doc.owner)`; null → `foreign_owner`;
   - otherwise `this.akey.checkTransferBinding(current, udid, doc.lastkey, owner, (error, bound) => …)`;
   - error → `binding_lookup_failed`, not bound → `foreign_owner`, bound → `onAccepted(doc, current, udid)`.

   Callers already use the owner they are given, so status edits, profiles and transformers run as `doc.owner`. Owned documents keep returning before any `ak:` read.
2. Change `processActionableNotification` to `(oid, did, topic, message)`, update its call in `processActionableMessages`, and wrap its whole body in `withAcceptedDevice`. The payload info line and both `nid:` branches then run only for an accepted device. The body is otherwise byte-identical, including finding (e).

Run the verify. It covers the full spec plus the local regression set, including TransferApiKeySpec and ApikeyExactMatchSpec since `apikey.js` changed, in one process, plus ESLint.

Commit: `fix(quick-261003-vbg): accept a transferred device's previous-owner MQTT topic through its transfer binding; owner-check actionable notifications`.
  </action>
  <verify>
    <automated>F="'jasmine/MessengerOwnershipSpec.js','jasmine/TransferApiKeySpec.js','jasmine/SecretsSweepSpec.js','jasmine/LoggingQualityAuditSpec.js','jasmine/OwnerLogLeakSpec.js','jasmine/SanitkaSpec.js','jasmine/DeviceOwnershipSpec.js','jasmine/DeviceRegisterOwnerSpec.js','jasmine/ApikeyExactMatchSpec.js','jasmine/MeshSessionAuthSpec.js','jasmine/UtilSpec.js'"; OUT=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:[$F],helpers:[],random:false});j.execute()" 2>&1); RC=$?; echo "$OUT" | tail -3; [ $RC -eq 0 ] && echo "$OUT" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && grep -q 'checkTransferBinding(' lib/thinx/apikey.js && grep -q 'this.akey.checkTransferBinding(' lib/thinx/messenger.js && [ "$(grep -c 'APIKey.findTransferBinding(' lib/thinx/apikey.js)" -ge 2 ] && [ "$(grep -c 'this.withAcceptedDevice(' lib/thinx/messenger.js)" -ge 3 ] && npx --no-install eslint lib/thinx/messenger.js lib/thinx/apikey.js spec/jasmine/MessengerOwnershipSpec.js && echo VBG-ALL-GREEN</automated>
  </verify>
  <done>
- MessengerOwnershipSpec passes in full.
- The local regression set (325 specs at the revision baseline, plus the new file) has 0 failures in one process.
- ESLint is clean.
- Every device-scoped MQTT handler goes through `withAcceptedDevice`, and the binding branch reuses u86's `findDeviceKey` and `findTransferBinding`.
- Prints VBG-ALL-GREEN.
  </done>
</task>

<task type="auto">
  <name>Task 3: CI regressions in MessengerSpec; resolve todo item 4 with the operator decision, residual risk, follow-ups and found defects</name>
  <files>spec/jasmine/MessengerSpec.js, .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md</files>
  <precondition>The device-side todo exists at `.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md`. If a preceding quick task moved it to `.planning/todos/completed/`, edit it there instead.</precondition>
  <read_first>spec/jasmine/MessengerSpec.js (whole), the device-side todo (whole, re-read now; v9d/v9x may have edited items 2/3 and appended sections), .planning/todos/pending/2026-10-03-transfer-continuity-leftovers.md (u86 items 1-3)</read_first>
  <action>
**MessengerSpec (CI only).** Add two cases after "should be able to process disconnection message", in this order; both names contain `261003-vbg`.

1. **"261003-vbg: another owner's status topic never reaches Device#edit".**
   - Foreign owner: the sha256 hex of a fixed string, via node `crypto`.
   - Wrap `messenger.device.edit` and `messenger.device.runDeviceTransformers` with recording pass-throughs set as own properties. Restore them in `finally` by deleting the own properties.
   - Call `messageResponder("/" + foreign + "/" + TEST_DEVICE_6.udid + "/status", Buffer.from(JSON.stringify({status: "vbg-foreign"})))`.
   - Wait 3000 ms, then expect no recorded edit or transformer run for that udid.
   - This exercises the real CouchDB get and the real `ak:<test_owner>` lookup: the device's lastkey is the CI-only key, which no store holds, so the message drops as `foreign_owner`.
   - Timeout 20000.
2. **"261003-vbg: the owner's own status topic reaches Device#edit (real CouchDB lookup)".**
   - Same wrapping and restore.
   - Topic `/<test_owner>/<TEST_DEVICE_6.udid>/status`.
   - Poll up to 10000 ms for the edit.
   - Timeout 20000.
   - Assert only the `edit` call, never the stored document (the write-back race of finding (b)).

The binding acceptance is pinned locally (VBG transfer). A CI version would need a full transfer fixture before MessengerSpec runs, so it is not added. ZZ-RouterDeviceAPISpec is untouched, because no HTTP device route changes.

**Todo** (scoped edits; never rewrite the file; earlier Resolution sections stay byte-identical):
1. Append ` — resolved by quick 261003-vbg` to the frontmatter `files` line for messenger.js.
2. Prefix item 4 under Problem and under Fix with `**Resolved 2026-10-03 (quick 261003-vbg).**`.
3. Append `## Resolution — item 4 (quick 261003-vbg)` with:
   - the commits;
   - the accept rule as implemented: owned, or bound by a transfer through `APIKey#checkTransferBinding` (`findDeviceKey` on `doc.lastkey`, then `findTransferBinding`), applied as `doc.owner`; the bounded lookup; the drop reasons; the limiter; `processStatus` and `processActionableNotification` included;
   - **Operator decision (2026-10-03):** a transferred device's previous-owner topic is accepted through the transfer binding, by the operator's choice, after being told the trade-off;
   - **Accepted residual risk:** the sender's owner credential can publish `/<sender>/#`, so for as long as the binding lives (until key revoke, owner purge or the next transfer; never consumed, u86 decision 3) it can forge the device's status, trigger the recipient's transformers on forged input, send check-in/actionable notifications, and write `nid:<udid>`. Remedy for a recipient: re-key the device or revoke the moved key;
   - **Follow-up ideas:**
     - a per-device MQTT topic namespace or publisher-identity check (broker plugin or MQTT 5 user properties);
     - ACL cleanup on transfer (continuity leftovers item 1), noting that it removes the device's own old-topic publishes but not the sender's;
     - a messenger-side "seen on the new topic" marker that ends old-topic acceptance without consuming the HTTP binding;
     - the delivery limitation (old-topic messages arrive only through the previous owner's messenger client);
   - the broker ACL analysis (what it guarantees and the four reasons);
   - "What changes for real users";
   - post-deploy checks (operator, read-only, node-local `docker logs` on the thinx_api node): counts of `[messenger] dropped MQTT device message` by reason;
   - residual risks beyond the accepted one:
     - a TOCTOU window of one round trip between the ownership/binding read and the atomic modify;
     - the ACL itself is not cleaned;
     - an owner can publish status for its own devices, by design.
4. Append `## Found during item 4 (quick 261003-vbg), not fixed` with findings (a)-(g) from the objective.
   - Re-verify each first, with file:line evidence; drop any claim that does not reproduce.
   - (a) is severity high, with the operator read-only check listed first.
   - Cross-reference the continuity leftovers todo instead of duplicating it.
   - Items 2, 3 and 5 stay as they are now: open, or resolved by v9d/v9x.

Run the verify. Commit: `test(quick-261003-vbg): CI MQTT status owner regressions; resolve device-side todo item 4`.
  </action>
  <verify>
    <automated>T=.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md; [ -f "$T" ] || T=.planning/todos/completed/2026-10-03-device-side-ownership-gaps.md; node --check spec/jasmine/MessengerSpec.js && npx --no-install eslint spec/jasmine/MessengerSpec.js && [ "$(grep -c '261003-vbg' spec/jasmine/MessengerSpec.js)" -ge 2 ] && grep -q 'Resolution — item 4 (quick 261003-vbg)' "$T" && grep -q 'Resolved 2026-10-03 (quick 261003-vbg)' "$T" && grep -q 'Found during item 4 (quick 261003-vbg)' "$T" && grep -q 'Operator decision (2026-10-03)' "$T" && grep -q 'Accepted residual risk' "$T" && grep -q 'checkTransferBinding' "$T" && grep -q 'forwardNonNotification' "$T" && grep -q 'Resolution — item 1 (quick 261003-tv5)' "$T" && git diff --quiet HEAD -- "$T" spec/jasmine/MessengerSpec.js && echo VBG-CI-TODO-GREEN</automated>
  </verify>
  <done>
- MessengerSpec has two CI cases (foreign drop through the real CouchDB and `ak:` lookup; owned edit), and is syntax- and lint-clean.
- The todo resolves item 4 with:
  - the operator decision and the accepted residual risk;
  - follow-ups;
  - the ACL analysis;
  - user impact, post-deploy checks and the other residual risks;
  - re-verified findings (a)-(g).
- Earlier resolutions are intact.
- Everything is committed. Prints VBG-CI-TODO-GREEN.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MQTT publisher → broker | Device (username udid) or owner (username owner id) credentials; go-auth Redis ACL by topic prefix |
| broker → API messenger | The per-owner client receives `/<owner>/#`. Topic and payload are untrusted; the publisher identity is not delivered |
| messenger → CouchDB / Redis | Device document edits, transformer runs, `nid:<udid>` keys, a read of `ak:<doc.owner>` for the binding check |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vbg-01 | Tampering | `updateAndTransformDeviceStatus` edits another owner's device | high | mitigate | `withAcceptedDevice`: owned, or bound by a transfer for exactly this udid and topic owner. Spec VBG status (3), VBG transfer T3-T8, CI negative case |
| T-vbg-02 | Elevation of Privilege | transformers or profile resolved as the topic owner | high | mitigate | Accepted handlers act as `doc.owner` only. Spec (1), T1 (profile OWNER_B, never OWNER_A) |
| T-vbg-03 | Tampering | unsanitized topic segments reach CouchDB (`_all_docs`, design ids) or `create_default_mqtt_apikey` | medium | mitigate | `topicOwner`/`topicUdid` and the `messageResponder` early return. Spec VBG topic |
| T-vbg-04 | Denial of Service | log flooding by a misbehaving client | medium | mitigate | 5 lines per 60 s limiter with a suppressed count; sanitka never logs topic segments; `checkTransferBinding` logs nothing. Spec (7)(8) |
| T-vbg-05 | Information Disclosure | drop lines, the payload line, or the binding check leak payloads, owner ids or key material | medium | mitigate | Drop lines carry the reason and a sanitized udid only; the payload line runs after the gate; no logging in `checkTransferBinding`. Spec (6)(19) sentinels |
| T-vbg-06 | Information Disclosure | `processStatus` sends a foreign device's alias to the socket | medium | mitigate | Gated. Spec (10) |
| T-vbg-07 | Tampering | `processActionableNotification` reads or writes `nid:<foreign udid>` | medium | mitigate | Gated, both branches. Spec (19)(20) |
| T-vbg-08 | Elevation of Privilege | append-only ACL sets keep a transferred device's old-owner topics | medium | transfer | Continuity leftovers todo item 1; follow-ups recorded |
| T-vbg-09 | Tampering | TOCTOU between the ownership/binding read and the atomic modify | low | accept | One round trip; same window t29 accepted |
| T-vbg-10 | Denial of Service | `forwardNonNotification` TypeError outside ENVIRONMENT=test; transformer-path defects | high | transfer | Recorded in the todo with evidence and an operator read-only check. Not fixed: fixing it activates the transformer path (operator decision) |
| T-vbg-11 | Information Disclosure | the singleton `_socket` delivers notifications to whichever owner initialized last | medium | transfer | Todo finding (c); needs `thinx-core.js`, which this plan avoids |
| T-vbg-12 | Spoofing | the sender forges status, check-in and actionable messages for a device it transferred away, via its own `/<sender>/#` credential, while the binding lives | medium | accept | Operator decision 2026-10-03, taken with the trade-off explained. Scope narrowed to: exactly this udid; the topic owner listed in `from`; the entry `doc.lastkey` identifies (re-keying or revoking ends it); applied as `doc.owner`. Follow-ups recorded in the todo |
| T-vbg-13 | Denial of Service | binding lookups amplified by foreign-topic floods | low | accept | Bounded per message: one CouchDB get plus one Redis GET of a single owner's store; never an all-owner search; owned messages never read `ak:` |
| T-vbg-SC | Tampering | npm/pip/cargo installs | low | accept | No package installs in this plan |
</threat_model>

<verification>
- Task 1: the RED commit (spec only) precedes the fix. VBG status, topic, log and check-in are green.
- Task 2: the full MessengerOwnershipSpec and the local regression set (TransferApiKeySpec included; 325 specs at the revision baseline) are green in one process; ESLint is clean on `messenger.js`, `apikey.js` and the spec.
- Task 3: MessengerSpec CI cases are present and lint-clean; the todo is updated in place with the operator decision, residual risk and follow-ups; earlier resolutions are intact.
- After the operator's single push: CircleCI runs MessengerOwnershipSpec and the two new MessengerSpec cases. Any failing jasmine spec fails CI (`715b38b9`).
</verification>

<success_criteria>
- No MQTT message can edit, transform, notify about or store `nid:` state for a device unless the topic owner owns it, or the current owner's moved key (the entry `doc.lastkey` identifies) carries a transfer binding for exactly that udid listing the topic owner.
- Accepted bound messages act as the current owner.
- Owned devices and transferred devices on either topic keep working.
- Malformed topics never reach CouchDB or Redis.
- Drop logging is bounded and leak-free.
- The todo records the operator decision, the accepted residual risk, the follow-ups and findings (a)-(g).
- No push, no deploy. `thinx-core.js`, package.json scripts, `.circleci/config.yml`, `Dockerfile.test` and `docker-entrypoint.sh` are untouched.
</success_criteria>

<output>
Create `.planning/quick/261003-vbg-fix-mqtt-status-owner-check/261003-vbg-SUMMARY.md` when done. Include:
- the RED evidence (`N specs, M failures`, assertion-only);
- the commits;
- the accept rule;
- the operator decision and the accepted residual risk;
- the follow-ups;
- the ACL analysis;
- "What changes for real users";
- findings (a)-(g) with severity;
- the post-deploy checks.

The orchestrator commits the SUMMARY and STATE.
</output>
