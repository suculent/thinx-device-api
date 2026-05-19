# Architecture
> Last updated: 2026-05-19 | Focus: arch | Scope: main backend API (thinx-device-api) | Mapper: gsd-codebase-mapper

## Summary

THiNX Device Management API is a Node.js/Express REST backend that manages IoT devices across their full lifecycle: registration, OTA firmware updates, source-code builds, MQTT-based messaging, and user account management. It exposes two parallel API generations (`/api/` v1 and `/api/v2/`) and communicates with devices via HTTP and MQTT, with build work offloaded to an external worker service. The core application boots through a deep async initialization chain that wires Redis, CouchDB, MQTT (Mosquitto), InfluxDB, WebSockets, and a Socket.IO-based build queue before registering routes.

---

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                     Traefik Reverse Proxy                    │
│              (routes by hostname/path, TLS termination)      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/HTTPS :7442
                         ▼
┌──────────────────────────────────────────────────────────────┐
│           THiNX API (thinx-core.js / Express app)           │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐ │
│  │ Device API   │  │  User/Auth API │  │  Build API       │ │
│  │ /device/*    │  │  /api/v2/      │  │  /api/v2/build   │ │
│  └──────────────┘  └────────────────┘  └──────────────────┘ │
│         │                  │                   │             │
│  ┌──────▼──────────────────▼───────────────────▼──────────┐ │
│  │         Domain Layer — lib/thinx/*.js (33 classes)     │ │
│  └────────┬──────────────────────────────────────────────-┘ │
└───────────┼──────────────────────────────────────────────────┘
            │
    ┌───────┼────────────────────────────┐
    ▼       ▼           ▼               ▼
 CouchDB  Redis      Mosquitto       InfluxDB
 :5984    :6379       :1883           :8086
 (nano)  (legacy cb)  (mqtt pkg)    (influx pkg)
```

**External services (Docker network `internal`):**
- `couchdb` — primary document store for devices, users, builds
- `thinx-redis` — session store, API key cache, JWT secret, OTT tokens, MQTT credentials
- `mosquitto` — MQTT broker for device pub/sub and ACL enforcement
- `influxdb` — time-series stats (login failures, build events, device checkins)
- `transformer` — sandboxed JS execution (isolated-vm) for device data transformations
- `worker` — external build executor image (`thinxcloud/worker:latest`) that connects back via Socket.IO on port 4000

---

## Bootstrap / Initialization Chain

Entry: `thinx.js` → `new THiNX()` → `thx.init(callback)`

The init sequence is **deeply nested and callback-driven** (not async/await). Order is enforced by nesting:

1. **Redis connect** (`app.redis_store_client.connect()`) — `thinx-core.js:106`
2. **JWT Login init** (`app.login.init()`) — `thinx-core.js:124` — loads or creates HS512 secret from Redis key `__JWT_SECRET__`
3. **Messenger init** (`new Messenger(...).getInstance()`) — `thinx-core.js:145` — connects to Mosquitto via `mqtt` package; sets up device pub/sub channels
4. **Slack init** (`app.messenger.initSlack()`) — `thinx-core.js:148`
5. **CouchDB init** (`new Database().init()`) — `thinx-core.js:153` — creates/verifies all CouchDB databases
6. **InfluxDB DB creation** (`InfluxConnector.createDB('stats')`) — `thinx-core.js:155`
7. **Statistics cache** (`stats.get_all_owners()`) — `thinx-core.js:165`
8. **HTTP/HTTPS servers** — `thinx-core.js:239–249`
9. **Builder + Queue init** (`new Builder()`, `new Queue()`) — `thinx-core.js:255–273` — Queue opens Socket.IO server on port 4000 to receive worker connections
10. **GDPR scheduler** (`new GDPR(app).guard()`) — `thinx-core.js:274`
11. **Route registration** (all `require('./lib/router.*.js')(app)`) — `thinx-core.js:335–358`
12. **WebSocket server upgrade** handler on the HTTP server — `thinx-core.js:444`

---

## Route Organization

Routes are registered in `thinx-core.js` by requiring 17 router modules, each taking `app` as DI container. There is **no Express Router object** — all routes are registered directly on the `app` instance.

### Global Middleware (applied before all routes)

Defined in `lib/router.js` as an `app.use(function(req, res, next){})` block — `router.js:85`:

1. **JWT check** — if `Authorization` header present, verify with `JWTLogin.verify()`, set `req.session.owner`, call `next()` or 403
2. **Device passthrough** — if `req.headers.origin === "device"`, call `next()` without auth
3. **CORS headers** (`enforceACLHeaders`) — reflect request origin or fall back to `CORS_ALLOWED_ORIGINS` env var
4. **Content-Security-Policy** header (built from `app_config.public_url`)
5. **API Key auth** — POST requests with `req.body.owner` + `req.body.api_key` are verified via `APIKey.verify()` in Redis
6. **OPTIONS preflight** — returns 200 immediately

### Router Files and Route Prefixes

| Router file | Route prefix(es) | Domain class |
|---|---|---|
| `lib/router.js` | middleware only + `GET /`, `GET /api/v2/spec` | `JWTLogin`, `APIKey` |
| `lib/router.auth.js` | `POST /api/login`, `POST /api/v2/login`, `GET /api/logout`, `GET /api/v2/logout` | `Owner`, `JWTLogin` |
| `lib/router.device.js` | `GET|PUT|POST|DELETE /api/v2/device`, `PUT /api/v2/source/{attach,detach}`, `PUT /api/v2/mesh/{attach,detach}`, `POST /api/v2/device/{configuration,notification}` | `Device`, `Devices` |
| `lib/router.deviceapi.js` | `GET|POST /device/firmware`, `POST /device/register`, `POST /device/addpush` | `Device` |
| `lib/router.build.js` | `POST /api/v2/build`, `POST /api/v2/build/artifacts`, `POST /api/v2/device/lastbuild`, `POST /api/build` | `Builder`, `Deployment` |
| `lib/router.apikey.js` | `GET|POST|DELETE /api/v2/apikey`, `POST|GET /api/user/apikey{,/revoke,/list}` | `APIKey` |
| `lib/router.env.js` | `GET|PUT|DELETE /api/v2/env`, `POST /api/user/env/{add,revoke}`, `GET /api/user/env/list` | `APIEnv` |
| `lib/router.gdpr.js` | `GET|PUT|POST|DELETE /api/v2/gdpr`, `POST /api/gdpr{,/transfer,/revoke}` | `GDPR` |
| `lib/router.github.js` | `GET /api/oauth/github`, `GET /api/oauth/github/callback` | `GitHub`, `OAuthGitHub` |
| `lib/router.google.js` | `GET /api/oauth/google`, `GET /api/oauth/google/callback` | — |
| `lib/router.logs.js` | `GET /api/v2/logs/audit`, `GET /api/v2/logs/build/:bid`, `GET|POST /api/user/logs/build{,/list}` | `Buildlog`, `AuditLog` |
| `lib/router.mesh.js` | `GET|POST /api/v2/mesh{,/list,/create,/delete}` | `Owner` |
| `lib/router.profile.js` | `GET|POST /api/v2/profile`, `GET|POST /api/user/profile` | `Owner` |
| `lib/router.rsakey.js` | `GET|PUT|DELETE /api/v2/rsakey`, `GET /api/user/rsakey/{create,list}`, `POST /api/user/rsakey/revoke` | `RSAKey` |
| `lib/router.slack.js` | `GET /api/slack/direct_install`, `GET /api/slack/redirect` | `Messenger` |
| `lib/router.source.js` | `GET|PUT|DELETE /api/v2/source`, `GET|POST /api/user/sources/list`, `POST /api/user/source{,/revoke}` | `Sources` |
| `lib/router.transfer.js` | `POST /api/v2/transfer/request`, `GET|POST /api/v2/transfer/{decline,accept}` (v1 duplicates) | `Transfer` |
| `lib/router.user.js` | `POST /api/v2/user`, `GET /api/v2/activate`, `GET|POST /api/v2/password/{reset,set}`, `GET /api/v2/stats{,/week,/today}`, `POST /api/v2/chat`, `DELETE /api/v2/user` (+ v1 duplicates) | `Owner`, `Stats` |

**Webhook routes** are defined inline in `thinx-core.js:380–386`:
- `POST /githook` (legacy)
- `POST /api/githook`

---

## API Versioning

Two parallel version tracks co-exist:

- **v1** (`/api/user/*`, `/api/device/*`, `/api/build`, etc.) — original path scheme, uses POST for most operations
- **v2** (`/api/v2/*`) — RESTful verbs (GET/PUT/POST/DELETE) aligned to resource nouns

Both versions call the same underlying domain class methods. New features should go to v2 only.

---

## Request/Response Flow

### Device Registration (`POST /device/register`)

```
Device HTTP POST /device/register
  → router.deviceapi.js:63
  → Device.register(body.registration, headers.authentication, res, callback)
      → lib/thinx/device.js
      → Validates MAC, generates UDID (uuidV1)
      → Auth.add_mqtt_credentials(udid, apikey)  → Redis bcrypt hash
      → ACL.setACLs() → Redis SMEMBERS
      → devicelib.insert() → CouchDB `managed_devices`
      → InfluxConnector.statsLog(owner, "DEVICE_NEW")
  → Util.respond(res, response)  ← JSON response to device
```

### OTA Firmware Flow (`POST /device/firmware`)

```
Device POST /device/firmware  {use: "ott"}
  → device.ott_request(req, callback)
      → storeOTT() → Redis set "ott:<sha256>" with 86400s TTL
      → returns {ott: "<token>"}

Device GET /device/firmware?ott=<token>
  → device.ott_update(ott, callback)
      → Redis get "ott:<token>"
      → Deployment.latestFirmwareEnvelope(owner, udid)
          → reads /mnt/data/deploy/<owner>/<udid>/build.json
      → res.setHeader('Content-Type', 'application/octet-stream')
      → res.end(firmwareBinary)
```

### Build Request (`POST /api/v2/build`)

```
Console/user POST /api/v2/build
  → router.build.js:18 (build function)
  → Util.validateSession(req)
  → sanitka.owner/udid/source (input sanitation)
  → app.queue.build(owner, udid, source_id, notifiers, dryrun, callback)
      → Queue selects next available worker (Socket.IO connected)
      → Emits build job to worker via Socket.IO :4000
      → Worker (thinxcloud/worker image) clones repo, runs Docker builder
      → Worker notifies back via Socket.IO when done
      → Buildlog.wsSend() pushes log lines to console WebSocket
  → Notifier.notify() → Slack webhook
```

### User Login (`POST /api/v2/login`)

```
Console POST /api/v2/login  {username, password}
  → router.auth.js:loginAction()
  → CouchDB managed_users lookup by username
  → rejectLogin() → password sha256 comparison
  → checkMqttKeyAndLogin() → ensures MQTT API key exists in Redis
  → ACL.setACLs() → refresh Mosquitto ACL
  → JWTLogin.sign_with_refresh() → signs HS512 access + refresh tokens
  → Util.respond(res, {access_token, refresh_token, redirectURL})
```

---

## Authentication and Authorization

Three authentication mechanisms co-exist, checked in order in the global middleware (`lib/router.js:85`):

### 1. JWT Bearer Token
- **Header:** `Authorization: Bearer <token>`
- **Implementation:** `lib/thinx/jwtlogin.js` — HS512, secret stored in Redis key `__JWT_SECRET__`
- **Sign:** `JWTLogin.sign_with_refresh(owner, callback)` — issues access + refresh pair
- **Verify:** `JWTLogin.verify(req, callback)` — called in global middleware; sets `req.session.owner`
- **Used by:** Console frontend (SPA) after OAuth or password login

### 2. Session Cookie (`x-thx-core`)
- **Implementation:** `express-session` backed by Redis (`connect-redis`)
- **Session:** Contains `req.session.owner` (owner ID string)
- **Expiry:** 1 hour default, 14 days with `remember` flag
- **Route guard:** `Util.validateSession(req)` in `lib/thinx/util.js:56` — checks `req.session.owner` or JWT header presence

### 3. API Key (owner_id + api_key in POST body)
- **Fields:** `req.body.owner` + `req.body.api_key`
- **Implementation:** `lib/thinx/apikey.js` — keys stored in Redis under `ak:<owner_id>`
- **Verify:** `APIKey.verify(owner, key, true, callback)` — called in global middleware for POST requests only

### MQTT Authentication
- **Implementation:** `lib/thinx/auth.js` — `Auth.add_mqtt_credentials(username, password)`
- **Storage:** Redis key `<username>` = bcrypt hash (cost factor 10)
- **ACLs:** `lib/thinx/acl.js` — reads/writes Redis SMEMBERS `<owner>:racls`, `<owner>:wacls`, `<owner>:rwacls`
- **Applied:** Mosquitto reads from Redis via custom auth plugin

### OAuth
- **GitHub:** `lib/router.github.js` + `lib/thinx/oauth-github.js` — redirects to GitHub, callback stores user wrapper in Redis with 60s TTL, then `performTokenLogin()` picks it up
- **Google:** `lib/router.google.js` — Google OAuth2 callback flow, same wrapper pattern
- **Flow:** OAuth callback → Redis token (60s TTL) → `router.auth.js:performTokenLogin()` → session + JWT

---

## Data Storage

### CouchDB (via `nano` package)

Accessed as module-level singletons initialized at require-time in most domain classes:

```javascript
// Pattern used throughout lib/thinx/*.js
let db_uri = new Database().uri();
let devicelib = require("nano")(db_uri).use(prefix + "managed_devices");
```

Databases (prefix configured in `conf/config.json`):
- `managed_devices` — device documents (udid, mac, owner, platform, source, version, etc.)
- `managed_users` — user/owner documents (username, email, password sha256, api_keys, sources, meshes)
- `managed_builds` — build log documents

### Redis (legacy callback API)

`app.redis_client` is the legacy wrapper of the v5 client (`redis_store_client.legacy()`). All domain classes receive it via constructor DI.

Key namespaces:
- `ak:<owner_id>` — JSON array of API key objects
- `ott:<sha256>` — one-time token for OTA, TTL 86400s
- `<username>` — bcrypt hash for MQTT auth
- `<owner>:racls`, `<owner>:wacls`, `<owner>:rwacls` — MQTT ACL sets
- `__JWT_SECRET__` — HS512 signing key
- `<sha256_token>` — OAuth wrapper JSON, TTL 60s

### InfluxDB (`influx` package, v1.8)

Used only for event counters. Static method pattern:

```javascript
// lib/thinx/influx.js:14
static statsLog(owner, error, data) {
    new InfluxConnector('stats').writePoint({
        measurement: error,  // e.g. "DEVICE_NEW", "LOGIN_INVALID"
        tags: { data, owner },
        fields: { value: 1 }
    });
}
```

Tracked measurements: `APIKEY_INVALID`, `LOGIN_INVALID`, `DEVICE_NEW`, `DEVICE_CHECKIN`, `DEVICE_REVOCATION`, `BUILD_STARTED`, `BUILD_SUCCESS`, `BUILD_FAILED`.

### Filesystem (`/mnt/data/`)

Critical paths (from `conf/config.json` via `Globals.app_config()`):
- `/mnt/data/deploy/<owner>/<udid>/` — built firmware artifacts and `build.json` envelope
- `/mnt/data/repos/` — cloned git repositories for builds
- `/mnt/data/ssh_keys/` — RSA keypairs per owner
- `/mnt/data/conf/` — runtime configuration (`config.json`, `node-session.json`)
- `/mnt/data/statistics/` — Winston log file (`latest.log`) parsed by `statistics.js`

---

## MQTT / Messaging Architecture

`lib/thinx/messenger.js` is a **singleton** (`getInstance()` pattern). It:
- Connects to Mosquitto as the service user with a randomly generated password per restart (hardcoded to `"mosquitto"` in test, `"changeme!"` in development)
- Maintains per-owner MQTT clients (`this.clients` map)
- Routes inbound device messages to registered callbacks
- Publishes outbound commands to `/<owner>/<udid>` topics
- Integrates with Slack RTM API (`@slack/rtm-api`) for bot notifications

The `lib/thinx/acl.js` class manages per-owner Mosquitto ACLs stored in Redis.

---

## Build System

Build requests are dispatched via the Queue (`lib/thinx/queue.js`):

- **Queue** opens a Socket.IO server on port 4000 (`queue.js:94`)
- **Worker** (`services/worker/worker.js`) is a separate Node process/container that connects back to the API's Socket.IO port via `THINX_SERVER` env var
- Build jobs are emitted to connected workers; workers run Docker-based builders (Arduino, PlatformIO, NodeMCU, etc.) defined in `builders/`
- Results flow back via Socket.IO; `Buildlog.wsSend()` streams log lines to the browser via WebSocket
- **Transformer** (`services/transformer/transformer.js`) runs user-defined JS transformers in `isolated-vm` sandboxes (64MB limit) for device data normalization

---

## WebSocket Architecture

The HTTP server (port 7442) handles WebSocket upgrades (`thinx-core.js:444`):

- `sessionParser` is applied to each upgrade request; `x-thx-core` cookie is required
- `socketMap` (Map, keyed by owner ID) prevents duplicate upgrades
- `wss.clients` pinged every 30s to detect dead connections (`thinx-core.js:488`)
- Build log lines streamed to browser via the per-owner WebSocket via `Buildlog.wsSend()`

---

## Key Design Decisions

1. **No Express Router instances** — all routes registered directly on `app`. Router files are factory functions `module.exports = function(app) {...}`.
2. **Dual API versions** — v1 and v2 routes both call the same domain class methods. v1 is not deprecated but is not extended.
3. **Callback-only async** — no async/await in bootstrap or domain classes. All async operations use Node callbacks or event emitters.
4. **Input sanitation via `Sanitka`** (`lib/thinx/sanitka.js`) — all untrusted inputs (UDID, owner, branch, URL) pass through regex-based sanitizers. Returns `null` on violation.
5. **`Util.responder(res, success, message)`** — uniform JSON envelope `{success: bool, response: ...}` used throughout all routes (`lib/thinx/util.js:18`).
6. **Rate limiting disabled in test** — `process.env.ENVIRONMENT != "test"` gates the rate limiter (500 req/min, 1-min window) (`thinx-core.js:324`).
7. **HTTPS termination outside the app** — Traefik handles TLS; the Express app sets `cookie.secure = false` explicitly and trusts loopback proxy.
8. **`app` as DI container** — `app.redis_client`, `app.owner`, `app.device`, `app.messenger`, `app.builder`, `app.queue`, `app.login` are set on the Express app object and passed to routers.

---

## Error Handling Strategy

- **Route level:** `Util.validateSession(req)` returns false → `res.status(401).end()` immediately
- **Input validation:** `Sanitka.*()` returns null → `res.status(403).end()` or `Util.responder(res, false, "reason_string")`
- **Async callbacks:** Errors logged with `console.log` or `rollbar.warn/error`; response sent with `Util.failureResponse(res, statusCode, "reason")`
- **Global error tracking:** Rollbar configured in `Globals.rollbar()` for unhandled exceptions and rejections
- **No try/catch in route handlers** — errors surface through callback `err` arguments only

---

## Anti-Patterns

### Module-level CouchDB clients

**What happens:** `require("nano")(db_uri).use(...)` is called at module top-level in nearly every domain class — `device.js:18`, `devices.js:22`, `sources.js:27`, `builder.js:27`, etc.

**Why it's wrong:** The CouchDB connection is created before `Database.init()` has run. In tests this causes race conditions; new credentials require process restart.

**Do this instead:** Accept a `nano` or `devicelib` instance via constructor injection, as done with Redis.

### Singleton Messenger via prototype instance

**What happens:** `lib/thinx/messenger.js` stores `this.instance` on the class instance returned from `createInstance()`, implementing a de facto singleton.

**Why it's wrong:** The instance is stored on the object, not a module-level variable. Multiple `new Messenger()` calls before `getInstance()` produce independent objects that each try to connect to MQTT.

**Do this instead:** Export a module-level singleton or pass the Messenger instance via DI from `thinx-core.js`.
