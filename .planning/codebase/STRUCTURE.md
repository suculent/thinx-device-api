# Codebase Structure
> Last updated: 2026-05-19 | Focus: arch | Scope: main backend API (thinx-device-api) | Mapper: gsd-codebase-mapper

## Summary

The repository root is the main Express/Node.js backend. The `lib/` directory holds all application code split into router modules and domain classes. External subservices (worker, transformer, console) live under `services/`. Tests are Jasmine-based under `spec/jasmine/`. Runtime data mounts are at `/mnt/data/` in production and `spec/mnt/data/` in test/development.

---

## Directory Layout

```
thinx-device-api/
├── thinx.js                   # Process entry point — instantiates THiNX and calls init()
├── thinx-core.js              # THiNX class — full bootstrap, middleware, route wiring
├── package.json               # v1.9.x, test runner: nyc jasmine
├── thinx-api-openapi.yaml     # OpenAPI spec served at GET /api/v2/spec
├── _envi.json                 # Test environment owner/device IDs (committed test fixture)
│
├── lib/                       # All application code
│   ├── router.js              # Global middleware + healthcheck + OpenAPI spec route
│   ├── router.auth.js         # POST /api(/v2)/login, GET /api(/v2)/logout
│   ├── router.apikey.js       # API key CRUD — /api/v2/apikey, /api/user/apikey
│   ├── router.build.js        # Build triggers — /api/v2/build, /api/build
│   ├── router.device.js       # Device management — /api/v2/device, mesh, source attach
│   ├── router.deviceapi.js    # Device-facing API — /device/register, /device/firmware
│   ├── router.env.js          # Env vars — /api/v2/env, /api/user/env
│   ├── router.gdpr.js         # GDPR consent — /api/v2/gdpr, /api/gdpr
│   ├── router.github.js       # GitHub OAuth — /api/oauth/github
│   ├── router.google.js       # Google OAuth — /api/oauth/google
│   ├── router.logs.js         # Build + audit logs — /api/v2/logs, /api/user/logs
│   ├── router.mesh.js         # Mesh management — /api/v2/mesh
│   ├── router.profile.js      # User profile — /api/v2/profile, /api/user/profile
│   ├── router.rsakey.js       # RSA key management — /api/v2/rsakey
│   ├── router.slack.js        # Slack OAuth — /api/slack
│   ├── router.source.js       # Code sources — /api/v2/source, /api/user/sources
│   ├── router.transfer.js     # Device transfer — /api/v2/transfer
│   ├── router.user.js         # User CRUD + stats — /api/v2/user, /api/user
│   │
│   └── thinx/                 # Domain classes (33 modules)
│       ├── acl.js             # MQTT ACL management (Redis SMEMBERS)
│       ├── apienv.js          # Per-device environment variables
│       ├── apikey.js          # API key create/verify/revoke (Redis ak:<owner>)
│       ├── audit.js           # Audit log writes to CouchDB managed_builds
│       ├── auth.js            # MQTT credential management (bcrypt → Redis)
│       ├── builder.js         # Firmware build orchestration (Docker invocation)
│       ├── buildlog.js        # Build log streaming (CouchDB + WebSocket tail)
│       ├── coap.js            # CoAP stub (MQTT forwarding not implemented)
│       ├── database.js        # CouchDB connection + database init
│       ├── deployment.js      # Firmware deployment path resolution + envelope reading
│       ├── device.js          # Core device logic: register, firmware, OTT, edit
│       ├── devices.js         # Collection-level device ops: list, revoke, push, attach
│       ├── files.js           # Filesystem path helpers (appRoot, deployPath, etc.)
│       ├── gdpr.js            # GDPR consent guard + cron-based user purge
│       ├── git.js             # Git operations (clone, pull, checkout)
│       ├── github.js          # GitHub API client (repo listing, webhook management)
│       ├── globals.js         # Singleton config loader (config.json → cached _app_config)
│       ├── influx.js          # InfluxDB client — static statsLog() + writePoint()
│       ├── json2h.js          # JSON-to-C-header converter (Arduino/PlatformIO)
│       ├── jwtlogin.js        # JWT HS512 sign/verify (secret stored in Redis)
│       ├── logger.js          # Shared Winston logger (console + file transports)
│       ├── messenger.js       # MQTT singleton + Slack RTM integration
│       ├── notifier.js        # Build result Slack notifications
│       ├── oauth-github.js    # GitHub OAuth2 flow helper
│       ├── owner.js           # User/owner CRUD, password, MQTT key, meshes (Mailgun)
│       ├── platform.js        # Platform detection + descriptor loading
│       ├── plugins.js         # Platform plugin loader (plugins/ subdirectory)
│       ├── plugins/           # Per-platform build plugins
│       │   ├── arduino/plugin.js
│       │   ├── mongoose/plugin.js
│       │   ├── nodejs/plugin.js
│       │   ├── nodemcu/plugin.js
│       │   ├── pine64/plugin.js
│       │   ├── platformio/plugin.js
│       │   ├── python/plugin.js
│       │   ├── sample/plugin.js
│       │   └── plugins.json   # Plugin registry
│       ├── queue.js           # Build queue (Socket.IO server :4000, worker dispatch)
│       ├── queue_action.js    # Individual build job action wrapper
│       ├── repository.js      # Git webhook processing + repository scanning
│       ├── rsakey.js          # RSA keypair generate/list/revoke (filesystem)
│       ├── sanitka.js         # Input sanitization (owner, udid, url, branch, apiKey)
│       ├── sources.js         # Code source CRUD (CouchDB managed_users + managed_devices)
│       ├── statistics.js      # Daily stat aggregation (log file parse → InfluxDB)
│       ├── transfer.js        # Device ownership transfer (Mailgun notifications)
│       ├── util.js            # Shared route helpers (responder, validateSession, etc.)
│       └── validator.js       # Input validators (email, username length, etc.)
│
├── spec/                      # Test suite (Jasmine)
│   ├── jasmine/               # All test specs (44 files)
│   │   ├── 00-AppSpec.js      # Full app bootstrap integration test
│   │   ├── 00-DatabaseSpec.js # CouchDB connection test
│   │   ├── ZZ-Router*.js      # HTTP endpoint integration tests (require running app)
│   │   └── *Spec.js           # Unit tests per domain class
│   ├── helpers/
│   │   └── bootstrap.js       # Test bootstrap (sets ENVIRONMENT=test, starts app)
│   ├── support/
│   │   └── jasmine.json       # Jasmine config: spec_dir=spec, spec_files=jasmine/*Spec.js
│   ├── mnt/data/conf/         # Test config files (mirrors /mnt/data/conf/ for dev/test)
│   └── _envi.json             # Test owner ID + device UDID fixture
│
├── services/
│   ├── worker/                # Build worker service (separate Node process/Docker image)
│   │   ├── worker.js          # Entry — connects to THINX_SERVER via Socket.IO
│   │   ├── class.js           # Worker class — receives jobs, runs builders
│   │   ├── builder*           # Builder executables
│   │   └── platforms/         # Platform-specific build logic
│   ├── transformer/           # Data transformer service (separate Express + isolated-vm)
│   │   ├── transformer.js     # Entry — clustered Express, executes user JS in sandbox
│   │   └── trans.js           # Transform execution helper
│   ├── console/               # Vue 2 SPA frontend (separate build, see separate arch doc)
│   ├── broker/                # Mosquitto broker config/scripts
│   ├── couchdb/               # CouchDB config (etc/)
│   ├── redis/                 # Redis Dockerfile with password baking
│   └── traefik/               # Traefik reverse proxy config
│
├── builders/                  # Docker build image definitions
│   ├── arduino-docker-build/
│   ├── platformio-docker-build/
│   ├── micropython-docker-build/
│   ├── mongoose-docker-build/
│   ├── nodemcu-docker-build/
│   └── lua-inspect/
│
├── platforms/                 # Platform descriptor JSON files
│   ├── arduino/descriptor.json
│   ├── platformio/descriptor.json
│   ├── micropython/descriptor.json
│   └── ...
│
├── languages/                 # Language-specific file extension descriptors
│   ├── c/, javascript/, lua/, python/
│
├── conf/                      # Sample/development config files
│   ├── config-sample.json     # Template for /mnt/data/conf/config.json
│   ├── config-localhost.json  # Local dev config
│   ├── node-session.json      # Session secret (committed sample only)
│   └── *-oauth-sample.json    # GitHub/Google/Twitter OAuth sample configs
│
├── static/                    # Static files served at /static/*
├── scripts/                   # Utility scripts (sonar, metrics-coverage)
├── design/                    # CouchDB design document JSON files
├── docs/                      # API documentation
├── .planning/codebase/        # Codebase analysis documents (this file)
├── docker-compose.yml         # Full stack service definition
└── thinx-api-openapi.yaml     # OpenAPI 3 specification
```

---

## Key File Locations

### Entry Points
- `thinx.js` — Process entry, 12 lines. Instantiates `THiNX` and calls `thx.init()`
- `thinx-core.js` — Full application class. Bootstrap, middleware, all route wiring (~530 lines)

### Configuration
- `/mnt/data/conf/config.json` — Production runtime config (not committed; loaded by `lib/thinx/globals.js`)
- `conf/config-sample.json` — Template showing all required config keys
- `spec/mnt/data/conf/config.json` — Test config (auto-selected when `ENVIRONMENT=test` or `development`)
- `/mnt/data/conf/node-session.json` — Express session secret

### Core Routing
- `lib/router.js` — Global middleware (auth, CORS, CSP) + health + OpenAPI routes
- `lib/router.deviceapi.js` — Device-facing endpoints (`/device/register`, `/device/firmware`) — NO session required
- `lib/router.device.js` — Management endpoints for devices (`/api/v2/device/*`) — session required

### Domain Logic
- `lib/thinx/device.js` — Single device operations (register, firmware, OTT, edit, push) ~800+ lines
- `lib/thinx/devices.js` — Collection device operations (list, revoke, attach, detach mesh/source)
- `lib/thinx/owner.js` — User account management (create, activate, password reset, meshes, MQTT key)
- `lib/thinx/builder.js` — Firmware build logic (decrypt WiFi creds, clone repo, invoke Docker)
- `lib/thinx/queue.js` — Build queue with Socket.IO worker pool
- `lib/thinx/messenger.js` — MQTT singleton + Slack integration

### Infrastructure
- `lib/thinx/globals.js` — Singleton config loader, returns cached `app_config`, `redis_options`, OAuth configs
- `lib/thinx/database.js` — CouchDB URI builder + database init (creates all `managed_*` DBs)
- `lib/thinx/sanitka.js` — All input sanitization (called before every domain operation)
- `lib/thinx/util.js` — `responder()`, `validateSession()`, `ownerFromRequest()` used in every router

### Testing
- `spec/jasmine/00-AppSpec.js` — Integration smoke test (boots full app)
- `spec/jasmine/ZZ-Router*.js` — HTTP-level route tests (run after app bootstrap, prefixed ZZ for order)
- `spec/helpers/bootstrap.js` — Sets `ENVIRONMENT=test`, starts THiNX app before all specs
- `spec/support/jasmine.json` — Jasmine config

---

## Naming Conventions

### Files
- Router files: `router.<domain>.js` in `lib/` (e.g., `router.device.js`, `router.auth.js`)
- Domain classes: `<domain>.js` in `lib/thinx/` (e.g., `device.js`, `owner.js`, `apikey.js`)
- Test specs: `<Domain>Spec.js` or `ZZ-Router<Domain>Spec.js` in `spec/jasmine/`

### Domain Classes
- All exported as ES6 classes via `module.exports = class ClassName {...}`
- Constructor always accepts `redis` as first parameter where Redis is needed
- Instance methods are camelCase verbs: `device.register()`, `owner.create()`, `apikey.verify()`
- Static utility methods in `Util` and `Sanitka` are `static` class methods callable without instantiation

### Router Functions
- Internal handler functions are named verb+Noun: `editDevice`, `listDevices`, `deleteDevice`, `getDeviceDetail`
- All router modules export a single factory function `module.exports = function(app) {...}`

---

## Module Organization — Domain Classes (`lib/thinx/`)

### Infrastructure / Cross-cutting (no business logic)
- `globals.js` — config singleton
- `database.js` — CouchDB connection
- `sanitka.js` — input sanitation
- `util.js` — HTTP response helpers
- `validator.js` — field validators
- `logger.js` — Winston logger
- `influx.js` — metrics logging
- `files.js` — filesystem path helpers

### Authentication / Security
- `auth.js` — MQTT bcrypt credentials
- `apikey.js` — REST API keys (Redis)
- `jwtlogin.js` — JWT HS512 (Redis-backed secret)
- `acl.js` — Mosquitto ACL management
- `oauth-github.js` — GitHub OAuth helper
- `rsakey.js` — SSH keypair management

### Device Management
- `device.js` — single device operations
- `devices.js` — collection device operations
- `deployment.js` — firmware deployment paths + envelopes
- `transfer.js` — ownership transfer

### User Management
- `owner.js` — user CRUD, activation, password, meshes
- `gdpr.js` — consent + scheduled purge
- `audit.js` — audit log

### Build Pipeline
- `builder.js` — build orchestration
- `queue.js` — worker pool (Socket.IO)
- `queue_action.js` — job wrapper
- `buildlog.js` — log streaming
- `repository.js` — webhook processing + repo scanning
- `git.js` — Git operations
- `github.js` — GitHub API client
- `notifier.js` — Slack build notifications
- `sources.js` — code source CRUD
- `platform.js` — platform detection
- `plugins.js` — platform plugin loader
- `plugins/<platform>/plugin.js` — per-platform build plugin

### Communication
- `messenger.js` — MQTT singleton + Slack RTM
- `coap.js` — CoAP stub (not functional)

### Utilities
- `statistics.js` — log-file-based daily stat aggregation
- `json2h.js` — JSON to C header file conversion
- `apienv.js` — per-device environment variable management

---

## Where to Add New Code

### New REST endpoint (v2)
1. Create `lib/router.<domain>.js` with `module.exports = function(app) {...}`
2. Register it in `thinx-core.js` after the existing `require('./lib/router.*.js')(app)` calls (around line 358)
3. Guard every handler with `if (!Util.validateSession(req)) return res.status(401).end()`
4. Sanitize all inputs via `sanitka.*()` before passing to domain classes
5. Return responses via `Util.responder(res, success, message)` or `Util.respond(res, object)`

### New domain class
1. Create `lib/thinx/<domain>.js` as `module.exports = class DomainName {...}`
2. Accept `redis` in constructor; do not create Redis clients internally
3. Do NOT create CouchDB clients at module scope — accept via constructor or create inside methods after init
4. Add spec file at `spec/jasmine/<Domain>Spec.js`

### New device-facing endpoint (no auth)
- Add to `lib/router.deviceapi.js` — this router intentionally has no session checks for device calls
- Device auth uses `req.headers.authentication` (API key) not sessions

### New build platform
1. Add platform plugin at `lib/thinx/plugins/<platform>/plugin.js`
2. Register in `lib/thinx/plugins/plugins.json`
3. Add Docker build image definition in `builders/<platform>-docker-build/`
4. Add platform descriptor in `platforms/<platform>/descriptor.json`

### New test
- Unit tests for domain classes: `spec/jasmine/<Domain>Spec.js` (numbered prefix if order matters: `02-`, etc.)
- Route integration tests: `spec/jasmine/ZZ-Router<Domain>Spec.js` (ZZ prefix ensures they run after app bootstrap)

---

## Runtime Data Paths

In production (`/mnt/data/`), in test/dev (`spec/mnt/data/`):

| Path | Contents |
|---|---|
| `conf/config.json` | Main app config (loaded by `globals.js`) |
| `conf/node-session.json` | Express session secret |
| `deploy/<owner>/<udid>/` | Built firmware + `build.json` |
| `repos/` | Cloned git repositories |
| `ssh_keys/` | RSA keypairs (filenames include owner ID) |
| `statistics/latest.log` | Winston log file parsed by `statistics.js` |
| `mosquitto/auth/` | Mosquitto auth config written by `auth.js` |

---

## Service Topology (docker-compose.yml)

| Service | Image / Build | Port | Purpose |
|---|---|---|---|
| `mosquitto` | `thinxcloud/mosquitto` | 1883, 8883 | MQTT broker |
| `couchdb` | `couchdb:3.2.0` | 5984 (internal) | Primary database |
| `thinx-redis` | `./services/redis` | 6379 (internal) | Cache + session + MQTT creds |
| `api` | `./` (this repo) | 7442 | Main backend API |
| `worker` | `thinxcloud/worker:latest` | 4000 (Socket.IO, internal) | Build worker |
| `transformer` | `./services/transformer` | 7474 (internal) | JS data transformer |
| `console` | `./services/console/src` | 8000 | Vue 2 SPA frontend |
| `influxdb` | `influxdb:1.8` | 8086 (internal) | Time-series metrics |
| `chronograf` | `chronograf:1.9` | 8888 (internal) | InfluxDB UI |
| `traefik` | `./services/traefik` | 80, 443 | Reverse proxy / TLS |
