<!-- refreshed: 2026-05-26 -->
# Architecture

**Analysis Date:** 2026-05-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          Clients                                        │
├──────────────────┬──────────────────┬───────────────────────────────────┤
│  IoT devices     │  Browser console │  GitHub / Slack / Google webhooks │
│  (HTTP + MQTT +  │  (HTTP + WS)     │  (HTTP)                           │
│   CoAP)          │  `services/      │                                   │
│                  │   console/`      │                                   │
└────────┬─────────┴────────┬─────────┴─────────────┬─────────────────────┘
         │                  │                       │
         ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                THiNX Device API — single Express monolith               │
│                `thinx.js` → `thinx-core.js`                             │
│                                                                         │
│  Global middleware     `lib/router.js`                                  │
│  (auth + CORS + CSP)                                                    │
│           │                                                             │
│           ▼                                                             │
│  17 feature routers    `lib/router.*.js` mounted on shared `app`        │
│           │                                                             │
│           ▼                                                             │
│  ~33 domain classes    `lib/thinx/*.js` (Owner, Device, Builder, …)     │
│           │                                                             │
│           ▼                                                             │
│  HTTP server :7442     `thinx-core.js:397`                              │
│  HTTPS server :7443    `thinx-core.js:241` (optional)                   │
│  WS upgrade handler    `thinx-core.js:445-487` (`/<owner>[/<logsock>]`) │
│  Queue Socket.IO :4000 `lib/thinx/queue.js` (workers connect here)      │
└────┬──────────────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐
│ CouchDB  │  │  Redis   │  │ InfluxDB │  │   Mosquitto    │
│ (docs)   │  │ (session │  │ (stats)  │  │   MQTT broker  │
│ managed_ │  │ + queue  │  │          │  │   `app.        │
│ devices, │  │ + ACL +  │  │ db:stats │  │   messenger`   │
│ users,   │  │ JWT key) │  │          │  │                │
│ builds,  │  │          │  │          │  │                │
│ logs     │  │          │  │          │  │                │
└──────────┘  └──────────┘  └──────────┘  └────────────────┘
     │                                            │
     └──────────────────┬─────────────────────────┘
                        ▼
              ┌────────────────────┐
              │ Build worker       │
              │ `services/worker/` │
              │ pulls jobs over    │
              │ Socket.IO from     │
              │ `lib/thinx/        │
              │ queue.js`,         │
              │ executes Docker    │
              │ builder images     │
              │ from `builders/`   │
              └────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Entry shim | Instantiates `THiNX`, calls `init()`, fires `Notifier.notifyAppStart()` after bootstrap | `thinx.js` |
| Bootstrap orchestrator | Wires Express, Helmet, rate limiter, Redis, session, JWT, Messenger, Database, Queue, Builder, GDPR, routers, HTTP/HTTPS/WS servers | `thinx-core.js` |
| Global middleware + healthcheck | Sets CSP/CORS, validates JWT/cookie/API-key, exposes `GET /` healthcheck and `GET /api/v2/spec` | `lib/router.js` |
| Feature routers (×17) | Mount HTTP verb handlers on shared `app`, one file per domain | `lib/router.*.js` |
| Admin gate | Loads the owner profile and rejects non-admins; used by `router.admin.js` only | `lib/middleware/requireAdmin.js` |
| Domain classes (~33) | Encapsulate business logic; instantiated once and reused across routers | `lib/thinx/*.js` |
| Config + Rollbar singleton | Loads `config.json`, computes Redis options, owns the deployment prefix | `lib/thinx/globals.js` |
| Session/JWT helpers | Session cookie `x-thx-core` in Redis; JWT signing key cached in Redis as `__JWT_SECRET__` | `lib/thinx/jwtlogin.js` |
| Build pipeline | Redis-backed queue (`queue:*` keys) → Builder runs Docker firmware build → Buildlog tails `build.log` over WS | `lib/thinx/queue.js`, `lib/thinx/builder.js`, `lib/thinx/buildlog.js` |
| Messaging | MQTT to/from devices via Mosquitto; Slack RTM optional | `lib/thinx/messenger.js` |
| Git webhook receiver | `POST /githook` and `POST /api/githook` → `Repository.process_hook` enqueues builds | `thinx-core.js:381-387`, `lib/thinx/repository.js` |
| Stats/audit | Influx `stats` DB + CouchDB `managed_logs` audit records | `lib/thinx/influx.js`, `lib/thinx/audit.js` |

## Pattern Overview

**Overall:** Single-process Express 5 monolith with class-per-domain composition. Bootstrap is deeply nested callback-then-callback (Redis → JWT → Messenger → Slack → Database → routers → HTTP/WS) and emits `workerReady` once the worker side is up. There is no DI container; modules expose their public objects by mutating the Express `app` (`app.redis_client`, `app.owner`, `app.device`, `app.messenger`, `app.builder`, `app.queue`, `app.login`, `app._ws`).

**Key Characteristics:**
- **Shared mutable `app` object** as the de-facto service registry (`thinx-core.js:99-283`).
- **Routers are functions, not `express.Router()` instances.** Each `lib/router.*.js` exports `module.exports = function (app) { app.get(...); app.post(...); }` so handlers attach directly to the root app. There is no per-router prefix; the URL prefix lives in the call site (`/api/v2/...`).
- **Two parallel auth tracks** — session cookie (`x-thx-core`) for browser, Bearer JWT for API/devices, plus owner+api_key body fields for legacy device endpoints. All three are handled in the first global `app.use` in `lib/router.js`.
- **Singletons via static getters.** `Globals` (`lib/thinx/globals.js`) caches `_app_config`, `_prefix`, `_rollbar` in closure variables and is required from nearly every domain class.
- **Messenger uses an opt-in singleton.** `new Messenger(...).getInstance(...)` returns the cached instance to prevent double MQTT subscription (`thinx-core.js:145`).

## Layers

**Bootstrap (`thinx.js` → `thinx-core.js`):**
- Purpose: process boot, side-effect wiring, server start.
- Contains: Express app construction, Redis connect-and-then chain, all middleware/router mounts, HTTP/HTTPS/WS servers.
- Depends on: every other layer transitively.
- Used by: nothing — this is the top.

**HTTP routing (`lib/router.js`, `lib/router.*.js`, `lib/middleware/`):**
- Purpose: translate HTTP into domain calls; enforce auth/ACL.
- Location: `lib/router.js` (global middleware + healthcheck + OpenAPI), `lib/router.<feature>.js` (one per feature area), `lib/middleware/requireAdmin.js`.
- Contains: request validation (`Util.validateSession`, `Sanitka.*`), response shaping (`Util.responder`, `Util.respond`, `Util.failureResponse`).
- Depends on: domain layer + `Util` + `Sanitka`.
- Used by: `thinx-core.js` mount block at lines 335-359.

**Domain (`lib/thinx/*.js`):**
- Purpose: business logic, persistence access, MQTT, build orchestration.
- Location: `lib/thinx/`.
- Contains: 33 classes — see STRUCTURE.md for the full table. Notable hot paths: `Owner` (user lifecycle, 1104 lines), `Device` (device CRUD, 1486 lines), `Devices` (collection ops, 598 lines), `Builder` (1201 lines), `Messenger` (974 lines), `Transfer` (608 lines).
- Depends on: `Globals`, `Database` (nano/CouchDB), `redis` client, external SDKs (mqtt, @slack/rtm-api, influx, jsonwebtoken, bcrypt).
- Used by: routers + bootstrap.

**Infrastructure adapters:**
- `lib/thinx/database.js` — nano/CouchDB client factory; creates `managed_devices`, `managed_users`, `managed_builds`, `managed_logs` on first run, installs design docs from `design/design_*.json` and replication filters from `design/filters_*.json`, schedules hourly `compactDatabases`.
- `lib/thinx/influx.js` — InfluxDB writer (`host: 'influxdb', port: 8086`), single `stats` database; used via `InfluxConnector.statsLog(owner, event, data)`.
- `lib/thinx/messenger.js` — MQTT client to Mosquitto broker (`app_config.mqtt.server`) plus optional Slack RTM/Web.
- `lib/thinx/files.js` — hard-coded paths: `appRoot()` → `/opt/thinx/thinx-device-api`, `deployPathForOwner(owner)` → `${app_config.data_root}${app_config.deploy_root}/<owner>`.

**External worker plane (out of process):**
- `services/worker/` (git submodule) connects to the queue Socket.IO server on `:4000` and runs Docker builds from `builders/*` submodules.
- `services/transformer/` (git submodule) runs JS transformers for device status payloads.
- `services/console/` (git submodule at SHA `1a467f1`, branch `thinx-staging`) is the Vue frontend.

## Data Flow

### Cold start (bootstrap)

1. `node thinx.js` runs `new THiNX()` → constructor only prints banner (`thinx.js:4`).
2. `thx.init(cb)` enters the chain in `thinx-core.js:35` and immediately requires `Globals`, which synchronously loads `config.json` from `CONFIG_ROOT` (prod `/mnt/data/conf`, dev `<repo>/spec/mnt/data/conf` — `thinx-core.js:88-91`, `lib/thinx/globals.js:9-13`).
3. Express app constructed, Helmet + frameguard mounted, `x-powered-by` disabled (`thinx-core.js:51-56`).
4. Redis client created via `redis.createClient(Globals.redis_options())` and `.connect()` is awaited (`thinx-core.js:99-106`). All further bootstrap runs inside that `.then`.
5. `Owner` and `Device` singletons attached to `app` (`thinx-core.js:109-110`).
6. `JWTLogin.init()` fetches or creates the JWT signing key (`__JWT_SECRET__` in Redis) (`thinx-core.js:123-125`, `lib/thinx/jwtlogin.js:49-79`).
7. `Messenger` is created with a random Mosquitto password (`mosquitto` in test, `changeme!` in dev) and pinned as a singleton via `.getInstance(...)` (`thinx-core.js:130-145`).
8. `Messenger.initSlack(cb)` runs (Slack is intentionally disabled by `this.DISABLE_SLACK = true` in `lib/thinx/messenger.js:67`).
9. `new Database().init(cb)` creates the four `managed_*` CouchDB databases and installs design docs (`thinx-core.js:152-154`, `lib/thinx/database.js:65-110`).
10. `InfluxConnector.createDB('stats')` ensures the stats DB; `Stats.get_all_owners()` warms an owner cache; an aggregation interval (`stats.aggregate()` every 12h) is scheduled (`thinx-core.js:156-174`).
11. HTTPS server is conditionally started on `app_config.secure_port` if `ssl_key`/`ssl_cert` files exist and the CA-chain verification passes — supported LE intermediates `R10`/`R12` rotation is tolerated (`thinx-core.js:193-249`).
12. `Builder`, `Queue`, `Repository` (git webhook watcher) are constructed; `queue.cron()` schedules the build poll on `"*/5 * * * *"` (`thinx-core.js:254-272`, `lib/thinx/queue.js:149-154`).
13. `new GDPR(app).guard()` registers GDPR scheduled tasks (`thinx-core.js:274-275`).
14. Session middleware (`x-thx-core`, Redis store, domain = `short_domain`, 1h max-age, rolling) mounted; then `express.json({limit:'2mb'})`, rate limiter (skipped in test), and `express.urlencoded` (`thinx-core.js:297-332`).
15. Routers are mounted **in this exact order** (`thinx-core.js:335-359`):
    1. `lib/router.js` (global middleware + healthcheck + OpenAPI spec)
    2. `lib/router.device.js`
    3. `lib/router.gdpr.js`
    4. `lib/router.apikey.js`
    5. `lib/router.auth.js` (requires initialised `app.owner`)
    6. `lib/router.build.js`
    7. `lib/router.deviceapi.js`
    8. `lib/router.env.js`
    9. `lib/router.github.js`
    10. `lib/router.google.js`
    11. `lib/router.logs.js`
    12. `lib/router.mesh.js`
    13. `lib/router.profile.js`
    14. `lib/router.rsakey.js`
    15. `lib/router.slack.js`
    16. `lib/router.source.js`
    17. `lib/router.transfer.js`
    18. `lib/router.user.js`
    19. `lib/router.admin.js`
16. Two webhook routes mounted: `POST /githook` and `POST /api/githook` (`thinx-core.js:381-387`).
17. HTTP server starts on `app_config.port` (in tests an ephemeral port via `listenPort = 0` — `thinx-core.js:396-403`).
18. `/static` is served from `<repo>/static` (`thinx-core.js:406`).
19. WS server (`new WebSocket.Server({ noServer: true })`) created; `this.server.on('upgrade', …)` parses the request through `sessionParser`, rejects without `x-thx-core` cookie, tracks sockets in a `Map` keyed by `request.url` to drop duplicate upgrades (`thinx-core.js:413-487`).
20. 30 s ping/terminate loop keeps WS connections alive (`thinx-core.js:489-500`).
21. `init_complete_callback()` runs → `thinx.js:11` prints completion and calls `Notifier.notifyAppStart()`.

### Browser HTTP request (cookie-authed)

1. Traefik terminates TLS → forwards to Node HTTP listener (`thinx-core.js:397`).
2. Helmet headers attached, then `app.use(sessionParser)` resolves `x-thx-core` cookie against Redis store (`thinx-core.js:314-316`).
3. JSON/urlencoded body parsers (`thinx-core.js:318-332`).
4. **Global middleware** (`lib/router.js:86-205`):
   - Sets `Content-Type: text/html; charset=utf-8` and a project-built CSP (`lib/router.js:84-90`).
   - If `Authorization` header is present, runs `app.login.verify` (JWT) and writes `req.session.owner`, applies impersonation claim if `payload.impersonator_owner` is set (Phase 10 ADMIN-03 — `lib/router.js:103-136`).
   - JWT path also consults Redis blacklist `revoked:owner:<owner>`; fail-open on Redis error (`lib/router.js:118-130`).
   - Otherwise, applies CORS (`enforceACLHeaders` reflects request origin against `CORS_ALLOWED_ORIGINS`/`app_config.public_url`), short-circuits `OPTIONS`, and for POSTs with `owner` + `api_key` in body runs `apikey.verify` (`lib/router.js:139-203`).
5. Feature router handler runs. Convention: `Util.validateSession(req)` first → return `401` if false; `Sanitka.<type>(input)` to scrub input → `400`/`403` if invalid; delegate to a domain class with a `(success, message)` callback; respond via `Util.responder(res, success, message)` (`lib/thinx/util.js:18-86`, e.g. `lib/router.device.js:15-26`).
6. Domain class reads/writes CouchDB via `nano` (using `Database().uri()` + `Globals.prefix()`), Redis via `app.redis_client`, MQTT via `app.messenger`, and Influx via `InfluxConnector.statsLog`.
7. Response is JSON-serialised with the shape `{ success: bool, response: <message> }` by `Util.responder`.

### Device check-in (legacy + JWT)

1. Device POSTs to `/api/<v1>/...` with `owner` + `api_key` body fields, or `Authorization: Bearer <jwt>`.
2. Global middleware (`lib/router.js`) handles both — JWT branch writes `req.session.owner`; api_key branch validates against `lib/thinx/apikey.js`.
3. CORS rules **skip** for URLs containing `register` or `firmware` (treated as device requests — `lib/router.js:37-40`).
4. Device endpoints in `lib/router.deviceapi.js` and `lib/router.device.js` operate via `lib/thinx/device.js` (1486 lines — single-device ops) or `lib/thinx/devices.js` (598 lines — collection ops).

### WebSocket (log tail + owner channel)

1. Client opens `wss://<api>/<owner>` or `wss://<api>/<owner>/<logsocket>` (URL convention documented in AGENTS.md L37-41).
2. Node HTTP server's `upgrade` event runs `sessionParser` (`thinx-core.js:445-455`).
3. Cookie `x-thx-core` is required; missing/wrong → 401 + socket destroy (`thinx-core.js:457-466`).
4. `socketMap.get(socketKey)` deduplicates upgrades for the same URL path (`thinx-core.js:449-453`).
5. On `connection`, the path is split into `[owner, logsocket]`; the owner socket is recorded in `app._ws[owner]`, log sockets in `app._ws[logsocket]` (`thinx-core.js:621-630`).
6. `initSocket(ws, app.messenger, logsocket)` (`thinx-core.js:543-586`) listens for `{ logtail: {build_id, owner_id} }` (→ `blog.logtail(...)` tails `build.log` via the `tail` npm package, `lib/thinx/buildlog.js:46-77`) and `{ init: <owner> }` (→ `messenger.initWithOwner` subscribes MQTT topics for that owner).
7. 30 s ping; misses → terminate (`thinx-core.js:489-500`).

### Build pipeline

1. **Enqueue** — Triggered by either a git webhook (`POST /githook` → `Repository.process_hook` → `queue.add`) or a console-initiated build via `lib/router.build.js`. `Queue.add(udid, source, owner_id)` stores a `queue:<uaid>` key in Redis containing a `queue_action` payload (`lib/thinx/queue.js:156-159`, `lib/thinx/queue_action.js`).
2. **Schedule** — `queue.cron()` polls every 5 minutes via `node-schedule`; `queue.loop()` → `queue.findNext()` scans `queue:*` keys, prunes finished actions, returns the first "waiting" action that fits within `app_config.builder.concurrency` (`lib/thinx/queue.js:149-211`).
3. **Worker dispatch** — Queue runs its own Socket.IO server on `:4000` (`lib/thinx/queue.js:66`, `:90-101`). External workers (`services/worker/`) connect as Socket.IO clients; `Queue.nextAvailableWorker()` picks an idle one and the build is dispatched via `Builder.build(owner_id, build, notifiers, cb, worker)` (`lib/thinx/queue.js:233-274`).
4. **Build** — `lib/thinx/builder.js` (1201 lines) generates the firmware build context (env vars, API key, source archive), invokes the worker which runs a Docker builder image from one of the `builders/*` submodules (arduino, micropython, mongoose, nodemcu, platformio).
5. **Log streaming** — Build writes to `build.log` in the deploy path; `Buildlog.logtail` uses the `tail` package to stream new lines to the owner's WS log socket (`lib/thinx/buildlog.js:46-77`).
6. **Persistence** — Build metadata is written to CouchDB `managed_builds`; status events (`BUILD_STARTED`, `BUILD_SUCCESS`, `BUILD_FAILED`) recorded to Influx `stats` (`lib/thinx/influx.js:14-26`).
7. **Notify** — `Notifier` sends email via Mailgun (`lib/thinx/notifier.js`, mailgun.js dependency).

### Admin actions (Phase 10)

1. All `/api/v2/admin/*` routes require both a valid session **and** `profile.admin === true` via `lib/middleware/requireAdmin.js` (`lib/router.admin.js:9`, mounted last at `thinx-core.js:359`).
2. `GET /api/v2/admin/users` lists all CouchDB users with `userlib.list({include_docs: true})` (`lib/router.admin.js:14-30`).
3. `DELETE /api/v2/admin/session/:owner` writes `revoked:owner:<owner>` to Redis with the current timestamp and a 7-day TTL; the JWT path in `lib/router.js:118-130` then rejects tokens with `iat * 1000 < ts` (`lib/router.admin.js:33-45`).
4. `POST /api/v2/admin/impersonate` calls `JWTLogin.sign_with_impersonation(target, admin)` to mint a 15-minute JWT that carries an `impersonator_owner` claim; every subsequent request using that token writes an `["admin","impersonation"]` audit record via `lib/thinx/audit.js` (`lib/router.admin.js:48-61`, `lib/thinx/jwtlogin.js:122-136`, `lib/router.js:108-116`).

**State Management:**
- Browser sessions: Redis store via `connect-redis` v9; cookie `x-thx-core`; max-age 1h, rolling, domain = `<api_url minus first label>` (`thinx-core.js:297-311`).
- JWT signing key: single Redis key `__JWT_SECRET__`, generated lazily on first boot (`lib/thinx/jwtlogin.js:49-79`).
- Session blacklist: Redis keys `revoked:owner:<owner>` with TTL 7 days (`lib/router.admin.js:39-41`).
- MQTT ACL + auth: Redis keys keyed by username (bcrypt-hashed passwords) — `lib/thinx/auth.js`, `lib/thinx/acl.js`.
- Build queue: Redis keys `queue:<uaid>` holding JSON `queue_action` blobs (`lib/thinx/queue.js:156-159`, `lib/thinx/queue_action.js`).
- Persistent documents: CouchDB databases `<prefix>managed_devices`, `<prefix>managed_users`, `<prefix>managed_builds`, `<prefix>managed_logs` where `<prefix>` is the deployment prefix stored in `<CONFIG_ROOT>/.thx_prefix` (`lib/thinx/globals.js:140-243`).
- Metrics: InfluxDB `stats` DB (`lib/thinx/influx.js:5-26`).
- WS sockets: in-memory `app._ws[owner]` and `socketMap` (URL → socket) (`thinx-core.js:443`, `:523`, `:621-632`).

## Key Abstractions

**`Util` (`lib/thinx/util.js`):**
- Purpose: shared HTTP helpers reused by every router.
- Pattern: static methods. Critical members:
  - `Util.validateSession(req)` — returns true if any of: `Authorization` header present, `req.session.owner` set, or both `req.body.owner_id` and `req.body.api_key` present. Calls `req.session.destroy()` on failure (`lib/thinx/util.js:56-81`).
  - `Util.responder(res, success, message)` — emits `{ success, response: message }` JSON, special-cases Buffer → octet-stream and string → JSON-wrapped (`lib/thinx/util.js:18-54`).
  - `Util.respond(res, object)` — raw responder used for plain documents like the healthcheck (`lib/thinx/util.js:88-98`).
  - `Util.failureResponse(res, code, reason)` — `res.status(code)` + `responder(res, false, reason)`.
  - `Util.ownerFromRequest(req)` — falls back from `req.session.owner` to `req.body.owner`, then sanitises through `Sanitka.owner` (`lib/thinx/util.js:12-16`).

**`Sanitka` (`lib/thinx/sanitka.js`):**
- Purpose: input sanitisation for branch names, URLs, UDIDs, owner IDs, usernames, etc.
- Pattern: dual static + instance methods (e.g. `Sanitka.udid(input)` and `new Sanitka().udid(input)` both work). Returns `null` when sanitisation would change the input (so callers can detect tampering attempts).

**Feature router function:**
- Purpose: bundle handlers for one feature area.
- Pattern: `module.exports = function (app) { … app.<verb>(<path>, handler); }` — handlers attach to the shared root app, **not** to an `express.Router()`. URL prefixes (`/api/v2/...`) live in the call site, so the router file alone does not tell you the mount path; you have to read the routes (e.g. `lib/router.admin.js:63-65`).

**Domain class (`lib/thinx/*.js`):**
- Purpose: encapsulate one business concept.
- Pattern: ES6 `module.exports = class X { constructor(redis, …) {…} … }`. Most take an optional Redis client and lazily require CouchDB libs via `Database().uri()`.

**`Globals` (`lib/thinx/globals.js`):**
- Purpose: configuration + prefix + Rollbar singleton.
- Pattern: IIFE returning a frozen `_public` object exported under named exports (`Globals.app_config()`, `Globals.prefix()`, `Globals.redis_options()`, `Globals.rollbar()`). Cached in module-scope closure variables.

## Entry Points

**Node entry:**
- Location: `thinx.js`.
- Triggers: `node thinx.js` (production), or programmatic `new THiNX(); thx.init(cb)` (specs).
- Responsibilities: instantiate, init, fire `Notifier.notifyAppStart()`.

**HTTP listener:**
- Location: `thinx-core.js:397`.
- Triggers: inbound TCP on `app_config.port` (port `7442` in `conf/config-localhost.json`; `0` ephemeral when `ENVIRONMENT=test`).
- Responsibilities: hand each request to the Express pipeline.

**HTTPS listener (optional):**
- Location: `thinx-core.js:240-242`.
- Triggers: started only when `app_config.ssl_key`/`ssl_cert`/`ssl_ca` files all exist and the chain verifies (with LE `R10`/`R12` rotation tolerance).
- Responsibilities: serve the same Express app on `app_config.secure_port`.

**WebSocket upgrade:**
- Location: `thinx-core.js:445-487`.
- Triggers: HTTP upgrade requests on the main HTTP server; URL pattern `/<owner>` or `/<owner>/<logsocket>`.
- Responsibilities: validate `x-thx-core` cookie, route the socket into `app._ws[owner]` or `app._ws[logsocket]`.

**Queue Socket.IO server:**
- Location: `lib/thinx/queue.js:90-101`.
- Triggers: external workers (`services/worker/`) connect to `http(s)://<api>:4000`.
- Responsibilities: dispatch build jobs to workers, collect status.

**Git webhook routes:**
- Location: `thinx-core.js:381-387`.
- Triggers: GitHub/Gitea webhooks to `POST /githook` or `POST /api/githook`.
- Responsibilities: 200 immediately, then async `watcher.process_hook(req)` which enqueues a build.

**Internal scheduled jobs:**
- `queue.cron()` — every 5 minutes runs `loop()` to dispatch the next waiting build (`lib/thinx/queue.js:149-154`).
- `stats.aggregate()` — every 12h log aggregation (`thinx-core.js:171-174`).
- `Database.compactDatabases` — hourly CouchDB compaction (`lib/thinx/database.js:105-107`).
- `wss` ping — every 30s liveness ping (`thinx-core.js:489-500`).
- `new GDPR(app).guard()` — registers GDPR retention timers (`thinx-core.js:274-275`).

## Architectural Constraints

- **Threading:** single-threaded Node event loop. There is no cluster mode in this process. Heavy work (Docker builds) is offloaded to `services/worker/` via the queue's Socket.IO server.
- **Process count:** exactly one API process per container. Multi-process scaling would break the in-memory `socketMap`, `app._ws[]` map and Messenger singleton.
- **Global state:**
  - `app` is the service registry: `app.redis_client`, `app.redis_store_client`, `app.owner`, `app.device`, `app.messenger`, `app.builder`, `app.queue`, `app.login`, `app._ws`.
  - Module-scope singletons in `lib/thinx/globals.js` (`_app_config`, `_prefix`, `_rollbar`, `_github_ocfg`, `_google_ocfg`).
  - Single `tail` variable in `lib/thinx/buildlog.js:21` — the comment "todo: refactor to array by owner session" flags this as a known limitation: only one buildlog tail can be active per process at a time.
- **Circular imports:** `lib/thinx/database.js` ↔ `lib/thinx/globals.js` is a recurring pair. Most modules require `Globals` at load time, which is fine because `Globals.load()` is synchronous on first require.
- **Init ordering:** routers run inside the nested `redis → JWT → Slack → Database` callbacks, so any `require('./lib/router.*.js')` at the top of `thinx-core.js` would fail because the routers expect `app.redis_client`, `app.owner`, `app.messenger`, etc. to already be set. The mount block at `thinx-core.js:335-359` must stay inside the `db.init` callback.
- **Singleton broker connection:** `Messenger.getInstance(...)` returns the cached instance to prevent double MQTT subscription on test re-init (`lib/thinx/messenger.js:77-82`).
- **Hard-coded paths:** `Filez.appRoot()` returns `/opt/thinx/thinx-device-api` regardless of environment (`lib/thinx/files.js:8`); the dev/test path is reached only via `app_config.data_root`.
- **Config root:** prod `/mnt/data/conf`, dev `<repo>/spec/mnt/data/conf` (chosen by `process.env.ENVIRONMENT == "development"` — `thinx-core.js:88-91`, `lib/thinx/globals.js:9-13`). The check is `==`, so an unset env var falls through to production paths.

## Anti-Patterns

### Router files attach to the root `app` instead of an `express.Router`

**What happens:** Every `lib/router.*.js` exports `function (app) { app.get(...); app.post(...); }` and calls `app.<verb>` directly on the shared application (e.g. `lib/router.admin.js:63-65`).

**Why it's wrong:** Reading any single router file does not show you the URL prefix or middleware ordering. Two routers can silently shadow each other (a `GET /api/v2/foo` declared in two files would register both handlers, with only the first hit). It also prevents per-router `use(...)` middleware composition.

**Do this instead:** When adding a new feature router, follow the existing convention but be explicit about the full path (always start with `/api/v2/...`) and never re-declare an existing route. Reuse `requireAdmin` and `Util.validateSession` as the standard gates.

### Service registry on the Express app

**What happens:** Bootstrap mutates `app.redis_client`, `app.owner`, `app.device`, `app.messenger`, `app.builder`, `app.queue`, `app.login`, `app._ws`, then routers read those (`thinx-core.js:99-283`).

**Why it's wrong:** Tests have to construct or stub a fake `app`, and any new dependency requires both wiring in `thinx-core.js` and updating every consumer. Type-checking is impossible.

**Do this instead:** For new domain classes, prefer explicit constructor parameters (the way `Queue` takes `(redis, builder, di_app, ssl_options, opt_thx)` — `lib/thinx/queue.js:60`) rather than reaching into `app.*` inside handlers.

### Deeply nested callback bootstrap

**What happens:** `thinx-core.js:106-657` is a chain `redis.connect().then(... jwtlogin.init(... messenger.initSlack(... db.init(... )) ))` that wraps the entire app construction.

**Why it's wrong:** Reordering or error-recovering is extremely hard; any throw inside the inner closures only surfaces via the outermost `.catch(error => console.log(...))` (`thinx-core.js:655-657`), which logs but never exits, hiding boot failures.

**Do this instead:** New initialisation steps should be added at the correct callback depth (e.g. anything needing CouchDB goes inside the `db.init` callback at `thinx-core.js:154`). Do not extract them to top-level requires that bypass the ordering.

### `tail = null` module-scope singleton

**What happens:** `lib/thinx/buildlog.js:21` keeps a single `tail` reference; `setupTail` calls `tail.unwatch()` before reassigning, so only one user can tail at a time.

**Why it's wrong:** Two concurrent log viewers will clobber each other. The comment "todo: refactor to array by owner session" acknowledges this is a bug-in-waiting.

**Do this instead:** When extending buildlog, store tails in a `Map` keyed by `build_id`/`owner` and `unwatch` only the entry being replaced.

### Session destroyed inside `Util.validateSession`

**What happens:** `Util.validateSession` calls `req.session.destroy()` when validation fails (`lib/thinx/util.js:77`).

**Why it's wrong:** The function name implies it is pure validation, but it has a destructive side effect. Callers that branch on its result (every router does `if (!Util.validateSession(req)) return res.status(401).end();`) silently kill the session even on transient checks.

**Do this instead:** Keep validation pure. If a route needs to evict the session, do it explicitly after responding.

## Error Handling

**Strategy:** callback-style `(success, message) => …` from domain classes; routers translate to HTTP via `Util.responder(res, success, message)` or `Util.failureResponse(res, code, reason)`.

**Patterns:**
- **No global error middleware.** There is no `app.use((err, req, res, next) => …)`. Synchronous throws inside route handlers will propagate to Express's default handler, which leaks stack traces.
- **Console logging.** Errors are logged with emoji-prefixed `console.log` (`☣️ [error]`, `⚠️ [warning]`, `🚫 [critical]`) — see `lib/router.js` and `lib/thinx/database.js:153-211`. There is no central log abstraction wired through; `lib/thinx/logger.js` exists (60 lines) but is **not** wired into bootstrap.
- **Rollbar wired but rarely used.** `Globals.rollbar()` returns a Rollbar instance when `ROLLBAR_ACCESS_TOKEN` is set; only a handful of call sites use it (e.g. `thinx-core.js:200`).
- **CouchDB connectivity failure exits the process.** `Database.handleDatabaseErrors` calls `process.exit(1)`/`process.exit(2)` after a 1s timeout when DB creation truly fails (`lib/thinx/database.js:196-211`).
- **Fail-open on Redis blacklist read failure.** JWT path logs the error and continues (`lib/router.js:118-122`) — flagged as an intentional design trade (Phase 10 R1).
- **Rate limiter** allows 500 req/min/IP, disabled when `ENVIRONMENT === "test"` (`thinx-core.js:75-80`, `:324-326`).

## Cross-Cutting Concerns

**Logging:**
- Console only. Convention is `console.log("ℹ️ [info]" | "⚠️ [warning]" | "☣️ [error]" | "🚫 [critical]" | "🔨 [debug]" + message)`. `morgan` is in `package.json` but is not mounted in `thinx-core.js`.
- Audit log → CouchDB `<prefix>managed_logs` via `lib/thinx/audit.js`. Used heavily by admin endpoints (`lib/router.admin.js`) and OAuth flows (`lib/router.auth.js`).
- Per-event stats → InfluxDB `stats` via `InfluxConnector.statsLog(owner, event, data)` (`lib/thinx/influx.js:14-26`).

**Validation:**
- Schema validation via `lib/thinx/validator.js` (only 10 lines — minimal placeholder).
- Input sanitisation via `Sanitka` (`lib/thinx/sanitka.js`).
- Session validation via `Util.validateSession` (`lib/thinx/util.js:56-81`).

**Authentication:**
- Three coexisting mechanisms wired in `lib/router.js:86-205`:
  - **JWT** (`Authorization: Bearer <token>`) — verified by `app.login` (`lib/thinx/jwtlogin.js`).
  - **Session cookie** `x-thx-core` — `connect-redis` + `express-session` (`thinx-core.js:297-316`).
  - **Owner + API key** in POST body — verified by `lib/thinx/apikey.js`.
- Admin gate: `lib/middleware/requireAdmin.js` loads `app.owner.profile(owner)` and requires `profile.admin === true`.
- MQTT auth: bcrypt-hashed passwords in Redis (`lib/thinx/auth.js`).
- Impersonation: 15-minute JWT with `impersonator_owner` claim (`lib/thinx/jwtlogin.js:122-136`), with per-request audit log (`lib/router.js:108-116`).

**CORS / CSP:**
- CORS reflects the request `Origin` when present; otherwise falls back to the first entry of `CORS_ALLOWED_ORIGINS` (comma-separated env) or `app_config.public_url` (`lib/router.js:32-56`).
- CSP is rebuilt at boot from `app_config.public_url`: `default-src 'self' <public_url>; frame-ancestors 'self'; form-action 'self' <public_url> https://github.com;` (`lib/router.js:58-90`).
- Helmet defaults applied globally (`thinx-core.js:52-55`) plus `frameguard` on the WS app.

**Configuration:**
- Static config in `<CONFIG_ROOT>/config.json` (or `config.override.json` if present — `lib/thinx/globals.js:115-119`).
- Secrets via env vars: `COUCHDB_USER`, `COUCHDB_PASS`, `REDIS_PASSWORD`, `ROLLBAR_ACCESS_TOKEN`, `SNYK_TOKEN`, `AQUA_SEC_TOKEN`, `CODACY_PROJECT_TOKEN`, `REVISION` (see `Dockerfile:14-39`).
- Deployment prefix in `<CONFIG_ROOT>/.thx_prefix` (or `<data_root>/conf/.thx_prefix` fallback) — created on first run with 12 random bytes (`lib/thinx/globals.js:140-199`).

---

*Architecture analysis: 2026-05-26*
