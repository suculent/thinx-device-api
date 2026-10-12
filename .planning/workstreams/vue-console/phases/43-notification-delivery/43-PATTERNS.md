# Phase 43: Notification Delivery - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 11 (6 source modified, 5 specs extended/new); `services/console/src` is NOT modified (UI-D-01)
**Analogs found:** 11 / 11 (all in-repo; every path below is git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `thinx-core.js` (upgrade handler :486-531, initSocket :575-589, connection :591-624) | server wiring / middleware | event-driven (WS upgrade) | itself + `lib/thinx/messenger.js` `subscribeSocket` Set-per-owner (:353-381) | exact (Set pattern) |
| `lib/thinx/socket_session.js` | service | event-driven | unchanged (D-06); optional home for cap check | n/a |
| `lib/thinx/messenger.js` | service | pub-sub | `sendToOwner` :390 is the delivery API (reuse, maybe add nothing) | exact |
| `lib/thinx/builder.js` (`notify` :177, `wsOK` :92, `sendNotificationIfSocketAlive` :131, `processExitData` :520, `processShellData` :541, remote guard :284-298) | service | pub-sub (status frames) | `messenger.sendToOwner` callers in messenger.js (vn3) | role-match |
| `lib/router.build.js` (:9, :36-51) | route | request-response | itself; delete dead `existing_sockets` | exact |
| `lib/thinx/queue.js` (:279 `[]` notifiers) | service | batch | `lib/router.build.js` :48-51 notifiers object | exact |
| `spec/jasmine/MessengerOwnerSocketSpec.js` (extend) / new builder-frames spec | test | pub-sub | `MessengerOwnerSocketSpec.js` FakeSocket + R2 | exact |
| `spec/jasmine/BuilderRemoteJobSpec.js` / `XBuilderSpec.js` (extend) | test | unit | `BuilderRemoteJobSpec.js` :1352-1360 (notify recorder, `new Builder(fakeRedis)`) | exact |
| `spec/jasmine/ZZ-WebSocketLifecycleSpec.js` (rewrite assertion) | test | event-driven | itself (raw `net.connect` upgrade) | exact |
| `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` (extend) | test | event-driven | itself + `MessengerOwnerSocketSpec` real ws harness :185-283 | exact |
| `spec/jasmine/BuilderPathSpec.js` :336-341 | test (existing, may break) | unit | — asserts `notify(udid, build_id, notifiers, reason, false)` signature | keep signature or update |

## Pattern Assignments

### `thinx-core.js` — per-connection tracking + per-owner cap (D-05, D-07)

**Current code to replace** (lines 486-531):
```js
const socketMap = new Map();
this.server.on('upgrade', function (request, socket, head) {
  let socketKey = request.url.replace(/^\/+/, "");
  if (typeof (socketMap.get(socketKey)) !== "undefined") {          // :492 path-keyed guard -> REMOVE
    console.log(`ℹ️ [info] Socket already mapped for ${socketKey}, dropping duplicate upgrade.`);
    socket.destroy();
    return;
  }
  sessionParser(request, {}, () => {
    let cookies = request.headers.cookie;
    if (Util.isDefined(cookies)) {
      if (cookies.indexOf("x-thx-core") === -1) {                    // KEEP: 401 path
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    if (typeof (socketMap.get(socketKey)) === "undefined") {
      socketMap.set(socketKey, socket);
      // REFACTOR-03: raw-socket close handler ...
      socket.on('close', () => { socketMap.delete(socketKey); });   // KEEP semantics: release only self
      try {
        wss.handleUpgrade(request, socket, head, function (ws) {
          ws.socketKey = socketKey;
          wss.emit('connection', ws, request);
        });
      } catch (_upgradeException) {
        socketMap.delete(socketKey);
      }
    }
  });
});
```
Also touched: `initSocket` close handler :586-588 (`socketMap.delete(ws.socketKey)`) and `socketMap.set(socketKey, ws)` :622.
Nothing else in the repo references `socketMap` (grep), so it can become e.g. `const liveSockets = new Set()` (add raw
`socket` at upgrade, `delete(socket)` on its own `'close'`) plus `Map<owner, Set>` for the cap.

**Set-per-owner pattern to copy** (`lib/thinx/messenger.js` 353-381):
```js
let sockets = subscriptions.get(owner);
if (typeof (sockets) === "undefined") { sockets = new Set(); subscriptions.set(owner, sockets); }
if (sockets.has(websocket)) return true;
sockets.add(websocket);
const onClose = () => this.unsubscribeSocket(owner, websocket);
websocket.once("close", onClose);
...
unsubscribeSocket(owner, websocket) { ...; sockets.delete(websocket); if (sockets.size === 0) subscriptions.delete(owner); }
```
**Cap notes:** owner is only verified in `wss.on('connection')` via `SocketSession.accept` (:608-614, returns null and
closes 1008 otherwise). The cap can be enforced there (count per `owner`, `ws.close(1008|1013, "too_many_sockets")` +
one log line, no payload) or in the upgrade callback using `request.session.owner` after `sessionParser` (same source
`SocketSession.verifiedOwner(request)` uses). Each Legacy tab = 2 sockets (`/<owner>`, `/<owner>/<ts>`); UI-SPEC
recommends cap 10. Log style: `console.log("ℹ️ [info] [ws] ...")` as in socket_session.js:43. Never log cookies
(`Util.redactCookieHeader` used at :506).

---

### `lib/thinx/socket_session.js` (unchanged per D-06)
`accept()` (lines 40-66): `ws.owner = owner; registry[key] = ws; ws.on("close", () => { if (registry[key] === ws) delete registry[key]; });`
— already latest-pointer safe for two tabs. `onMessage` `init` branch calls `ctx.messenger.initWithOwner(ws.owner, ws, cb)`
(the only way into the messenger Set). If the cap lives here, follow the `owner === null` refusal shape at :42-46.

---

### `lib/thinx/builder.js` — route status frames through `sendToOwner` (D-09..D-12, F-1..F-5)

**Delivery API** (`lib/thinx/messenger.js` 390-415): `sendToOwner(owner, notif)` takes an OBJECT (it JSON.stringifies),
skips non-OPEN sockets, never throws, returns count. So builder must pass
`{ notification: this.buildNotification(message, status, udid, build_id) }` (lines 165-173), not
`buildStatusNotification` (which returns a string, :159).

**Problem: `notify` has no owner** — signature `notify(udid, build_id, notifiers, message, success_status)` (:177).
Options: put `owner` into `notifiers` (router.build.js already builds `notifiers = { messenger: app.messenger, websocket }`
:48-51 — replace `websocket` with `owner`), or add an owner param. `BuilderPathSpec.js:341` and
`BuilderRemoteJobSpec.js:1358` assert the current 5-arg signature, so carrying owner in `notifiers` keeps them green.
`notifiers` is `[]` in queue.js:279 and XBuilderSpec (:78, :97, :168) and `{}` in specs — guard
`notifiers && notifiers.messenger && typeof notifiers.messenger.sendToOwner === "function"`.

**Frame-rule hot spots:**
- F-2: remote guard :291-297 passes `this.successStringFromBool(false)` (= `"error"` string, truthy) as `success_status`
  -> becomes `success`. Pass `false`.
- F-1/F-2/F-3: `processExitData` (:520-531) always does `notify(..., data.status, false)` then `wsOK(...)` (green
  "Completed", no build_id). `notify` maps `"OK"` to success (:189-191). Note `processExitData` is also called with
  `error.message` / `code` (non-object) at :585 and :601.
- F-1: `processShellData` success path :555-557 sends `notify("Completed", true)` + `wsOK`.
- F-4: :565-568 `sendNotificationIfSocketAlive(opts.notifiers.websocket, logline)` — delete (logtail via blog stays).
- Other `notify` callers (unchanged copy): 306/316/327/364/408/838/910/921/936("Pulling repository")/1016/1065/1245/1259/1289("Building...").

**Existing unit-test recorder pattern** (`spec/jasmine/BuilderRemoteJobSpec.js` 1352-1360, run as
`ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine spec/jasmine/BuilderRemoteJobSpec.js` per its header):
```js
const builder = new Builder(fakeRedis);
const notified = [];
builder.notify = (udid, build_id, notifiers, message, ok) => notified.push([build_id, message, ok]);
```
For frame counting (UI-SPEC proof), don't stub `notify`; pass `notifiers = { owner: OWNER_A, messenger: fakeMessenger }`
where `fakeMessenger.sendToOwner = (o, n) => sent.push([o, n])`, or a real `Object.create(Messenger.prototype)` with
FakeSocket A and B subscribed (see below), then call `processShellData(opts, "status: OK")` / `processExitData(...)`.

---

### `lib/router.build.js` (:9, :36-51) — delete dead code
```js
app.existing_sockets = {};                       // :9 never filled -> remove
let socket = null; if (Util.isDefined(app.existing_sockets)) {...}   // :36-46 -> remove
var notifiers = { messenger: app.messenger, websocket: socket || null };   // :48-51 -> { messenger: app.messenger, owner }
```
`owner` already computed at :27 (`sanitka.owner(req.session.owner)`). `notifiers` passed at :92.

### `lib/thinx/queue.js` (:276-281)
```js
this.builder.build(action.action.owner_id, build, [], // notifiers
```
Replace `[]` with `{ messenger: <app.messenger>, owner: action.action.owner_id }`. Check how Queue gets the messenger
(constructor deps) — no messenger reference exists in queue.js today; Claude's discretion (D-09) allows builder to read
`app.messenger`/its own reference instead. BuilderRemoteJobSpec :628-677, :1012, :1089, :1269 stub `queue.builder.build(owner, build, notifiers, cb)`.

---

### Specs

**Multi-socket delivery (D-08/D-12) — copy `MessengerOwnerSocketSpec.js`:**
- FakeSocket (lines 113-126): `EventEmitter`, `owner`, `readyState = 1`, `sent[]`, `close()` emits "close".
- `makeMessenger()` (132-173): `Object.create(Messenger.prototype)` + fakes, no Redis/CouchDB.
- `init(m, owner, sock)` (175-179) wraps `initWithOwner`.
- R2 (305-320) is exactly "two tabs both get it once, B gets nothing" — add builder frames analogue and "after a1.close() a2 still receives".
- Real ws harness (185-283): own `http.createServer()` + `WebSocket.Server({noServer:true})`, `request.session = sessionFromCookie(cookie)` (`sid=a`/`sid=b`), `SocketSession.accept(ws, request, ctx)`, helpers `openClient`, `waitOpen`, `waitFrame`, `openAndInit`. Note: this harness bypasses thinx-core's upgrade handler, so it cannot prove D-05.

**`ZZ-WebSocketHandshakeRtmSpec.js`** uses `bootstrap.thx` (top-level require is load-bearing, lines 31-40), `new WebSocket("ws://127.0.0.1:"+port+"/"+envi.oid)`, 5 s open timer, `openSockets` cleanup in afterEach. It sends NO cookie, so `SocketSession.accept` closes 1008 right after open — "both open" is provable here for two sockets on the same path (the old guard destroyed the second before open), but frame receipt needs a session owner; use the MessengerOwnerSocketSpec harness for delivery.

**`ZZ-WebSocketLifecycleSpec.js`** (own `new THiNX()` + `thx.init`, raw `net.connect` upgrade with `Cookie: x-thx-core=bogus-test-session`, lines 76-92) asserts absence of `"Socket already mapped for <key>"`. Once the guard and its log line are removed this assertion is vacuous — the planner must re-express REFACTOR-03 (e.g. expose a test-only size/getter on `thx`, or assert a log line on release, or open N aborted upgrades and confirm the cap counter does not exhaust).

**Static source-scan pattern** (`MessengerOwnerSocketSpec` 96-111 `codeLines`/`connectionRegion`, S2 590-600): use it for "no `existing_sockets` in lib/router.build.js", "no `notifiers.websocket` in builder.js", "connection region keeps `SocketSession.accept(`".

## Shared Patterns

- **Owner-only routing (F-5, vn3):** every console frame via `messenger.sendToOwner(owner, obj)`; never iterate `app._ws` or `wss.clients` for delivery.
- **Logging:** emoji-prefixed `console.log("ℹ️ [info] [ws] ...")`; never log frames, cookies, session ids (spec headers enforce; MessengerOwnerSocketSpec checks no payload in logs via `captureConsole`).
- **Defensive typeof guards** style everywhere (`typeof (x) !== "undefined" && x !== null`).
- **Spec style:** jasmine + chai `expect` (chai-http locked ^4.3), no sinon; `spyOn(...).and.callFake`; owners as `"a1".repeat(32)`.

## Verify commands

- jasmine config `spec/support/jasmine.json`: `spec/jasmine/*[sS]pec.js`, helpers `spec/helpers/**`, non-random, 10 s timeout.
- `npm test` = `jasmine` (nyc+coveralls when token). CI (`.circleci/config.yml` ~:805-827) runs `docker compose up --build api` with ENVIRONMENT=test; gate = api container exit 0 AND `N specs, 0 failures` in test.log. ZZ-* specs need `/mnt/data/conf/config.json` + CouchDB/Redis, so they are CI-only.
- Locally runnable (no infra): `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine spec/jasmine/MessengerOwnerSocketSpec.js` (spec sets ENVIRONMENT itself), same for `BuilderRemoteJobSpec.js`, `BuilderPathSpec.js`, `LogTailOwnerSpec.js`. Static gates for ZZ specs: `node --check spec/jasmine/ZZ-*.js` + grep.
- Legacy toast: `cd services/console/src && npm run test:toast` (= `node test/toast-escape.cjs`; loads `app/js/controllers/LogviewController.js` in a vm, prints `ok`/`FAIL` per check).
- NOTIF-01 bypass: `.planning/runbooks/legacy-console-build-gate.md` §4 (lines 84-128): operator-only token steps 1-3 (checkpoint:human-action), then Claude runs `node scripts/check-ci-gates.js pipeline --pipeline-id <id> --expect legacy-on --wait` (prints `CI-GATES PIPELINE OK <n>`) and after next normal push `node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-off`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| per-owner socket cap in thinx-core.js | middleware | event-driven | no connection-limit code exists; build from the messenger Set pattern |

## Metadata

**Analog search scope:** `thinx-core.js`, `lib/`, `lib/thinx/`, `spec/jasmine/`, `spec/support/`, `.circleci/config.yml`, `services/console/src/test/`, `.planning/runbooks/`
**Files scanned:** ~18
**Pattern extraction date:** 2026-10-12
