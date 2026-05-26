# Codebase Structure

**Analysis Date:** 2026-05-26

## Directory Layout

```
thinx-device-api/
├── thinx.js                  # Process entry — instantiates THiNX, calls init()
├── thinx-core.js             # Bootstrap orchestrator (659 lines) — Express + Redis + routers + servers
├── package.json              # npm manifest (node ≥19, Express 5, jasmine specs)
├── package-lock.json
├── Dockerfile                # Production image (FROM thinxcloud/base:alpine)
├── Dockerfile.test           # Test image
├── docker-compose.yml        # Local prod-like compose
├── docker-compose.test.yml   # Test compose
├── docker-compose.traefik.yml
├── docker-swarm.yml          # Swarm stack reference
├── docker-entrypoint.sh      # Container entrypoint
├── thinx-api-openapi.yaml    # OpenAPI v2 spec served at GET /api/v2/spec
├── eslint.config.js
├── jest.json                 # Coverage config (jasmine via nyc)
├── cypress.json              # Cypress config (used by console submodule)
├── karma.conf.js             # Karma config (legacy)
├── commitlint.config.js      # Conventional commits gate
├── codeclimate.json
├── sonar-project.properties
├── shiftleft.yml
├── stackhawk.yml
├── lgtm.yml
├── VeracodeIgnored.json
├── Rakefile                  # Ruby tooling for some scripts
├── README.md
├── AGENTS.md                 # Session notes for AI assistants
├── HISTORY.md
├── RELEASE_NOTES.md
├── IMPROVEMENTS.md
├── ISSUE_TEMPLATE.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── _envi.json                # Top-level test env fixture (mirrors spec/_envi.json)
├── builder.thinx.json        # Sample builder config
├── builder.thinx.dist.json   # Distributable builder config template
│
├── lib/                      # Application source — ALL backend code lives here
│   ├── router.js             # Global middleware (auth + CORS + CSP) + healthcheck + OpenAPI spec
│   ├── router.admin.js       # /api/v2/admin/* (Phase 10: list users, revoke sessions, impersonate)
│   ├── router.apikey.js      # /api/v2/apikey/* — apikey CRUD
│   ├── router.auth.js        # /api/v2/login + OAuth callbacks + password reset
│   ├── router.build.js       # /api/v2/build/* — build trigger, build list
│   ├── router.device.js      # /api/v2/device/* — single-device ops (edit, detail, transformer run)
│   ├── router.deviceapi.js   # device-facing endpoints (registration, firmware, check-in)
│   ├── router.env.js         # /api/v2/env/* — environment variable CRUD per owner
│   ├── router.gdpr.js        # GDPR export/delete + scheduled cleanups
│   ├── router.github.js      # /api/v2/github/* — GitHub OAuth + webhook helpers
│   ├── router.google.js      # /api/v2/google/* — Google OAuth
│   ├── router.logs.js        # /api/v2/logs/* — audit log retrieval
│   ├── router.mesh.js        # /api/v2/mesh/* — mesh device grouping
│   ├── router.profile.js     # /api/v2/profile/* — owner profile read/update/delete
│   ├── router.rsakey.js      # /api/v2/rsakey/* — RSA key CRUD for repo access
│   ├── router.slack.js       # /api/v2/slack/* — Slack chat passthrough
│   ├── router.source.js      # /api/v2/source/* — git source repo CRUD
│   ├── router.transfer.js    # /api/v2/transfer/* — device ownership transfer
│   ├── router.user.js        # /api/v2/user/* — user activation, password set, stats, chat
│   │
│   ├── middleware/
│   │   └── requireAdmin.js   # Admin gate used by router.admin.js
│   │
│   └── thinx/                # Domain classes (one per business concept)
│       ├── globals.js        # Config + prefix + Rollbar singleton (IIFE-style module)
│       ├── util.js           # Shared HTTP helpers (validateSession, responder, respond, …)
│       ├── sanitka.js        # Input sanitisation (branch, url, udid, owner, username, …)
│       ├── files.js          # Hard-coded path helpers (appRoot, deployPathForOwner)
│       ├── database.js       # nano/CouchDB factory; creates managed_* DBs; hourly compaction
│       ├── influx.js         # InfluxDB writer (host: 'influxdb'); statsLog(owner, event, data)
│       ├── logger.js         # Winston logger — defined but NOT wired into bootstrap (60 lines)
│       ├── auth.js           # Mosquitto credential storage in Redis (bcrypt)
│       ├── acl.js            # MQTT ACL management in Redis
│       ├── jwtlogin.js       # JWT sign/verify; signing key cached as __JWT_SECRET__ in Redis
│       ├── audit.js          # CouchDB-backed audit log (managed_logs)
│       ├── owner.js          # User lifecycle (1104 lines) — create/activate/profile/password
│       ├── device.js         # Single-device CRUD (1486 lines)
│       ├── devices.js        # Device collection ops (598 lines) — list/revoke/push/attach
│       ├── apikey.js         # API key generation/verification (Redis-backed)
│       ├── apienv.js         # Owner-scoped env vars (Redis)
│       ├── rsakey.js         # RSA keypair management for git repo access
│       ├── messenger.js      # MQTT to Mosquitto + Slack RTM/Web (974 lines, singleton)
│       ├── notifier.js       # Mailgun email + app start ping
│       ├── builder.js        # Docker firmware build orchestration (1201 lines)
│       ├── buildlog.js       # Build log tail via `tail` package, streamed over WS
│       ├── queue.js          # Build queue (Redis keys queue:*, Socket.IO server on :4000)
│       ├── queue_action.js   # Queue entry helper class
│       ├── repository.js     # Git webhook processor + repo discovery on disk
│       ├── sources.js        # CouchDB-backed git source list per owner
│       ├── platform.js       # Platform/firmware detection helpers
│       ├── git.js            # Git CLI wrapper
│       ├── github.js         # GitHub API helpers (separate from OAuth)
│       ├── oauth-github.js   # GitHub OAuth flow
│       ├── statistics.js     # Periodic aggregation jobs (called twice/day from bootstrap)
│       ├── transfer.js       # Device ownership transfer state machine
│       ├── deployment.js     # Firmware deployment manifest writer
│       ├── coap.js           # CoAP listener (27 lines — placeholder/legacy)
│       ├── gdpr.js           # GDPR retention scheduler (`new GDPR(app).guard()`)
│       ├── json2h.js         # Converts owner env vars to a C header for firmware
│       ├── validator.js      # Stub schema validator (10 lines)
│       ├── plugins.js        # Plugin loader (52 lines)
│       └── plugins/          # Per-platform helpers used at build time
│           ├── arduino/
│           ├── mongoose/
│           ├── nodejs/
│           ├── nodemcu/
│           ├── pine64/
│           ├── platformio/
│           ├── python/
│           ├── sample/
│           └── plugins.json
│
├── spec/                     # Jasmine tests
│   ├── jasmine/              # 51 spec files (see TESTING.md for full list)
│   │                         #   00-/02-/03- → bootstrap order
│   │                         #   <Class>Spec.js → unit tests (lib/thinx/<class>.js)
│   │                         #   ZZ-Router*.js → integration tests via chai-http
│   ├── mnt/data/conf/        # Test config root (used when ENVIRONMENT=development)
│   │   ├── config.json
│   │   ├── node-session.json
│   │   ├── github-oauth.json
│   │   └── google-oauth.json
│   ├── _envi.json            # Shared test fixture: oid, udid, build_id, ak, sid, email …
│   ├── empty.json
│   ├── helpers/
│   ├── javascripts/
│   ├── support/
│   ├── coverage/
│   ├── mock-git-response.json
│   ├── redis_test.js
│   ├── slack_test.js
│   ├── spec_helper.rb
│   └── test_repositories/
│       └── thinx-firmware-esp8266/   # git submodule with sample firmware repo
│
├── conf/                     # Repo-checked sample configs (NOT used at runtime)
│   ├── config-localhost.json # Local dev config template
│   ├── config-sample.json    # Generic config template
│   ├── github-oauth-sample.json
│   ├── google-oauth-sample.json
│   ├── twitter-oauth-sample.json
│   └── node-session.json
│
├── design/                   # CouchDB design docs + replication filters
│   ├── design_devices.json
│   ├── design_users.json
│   ├── design_builds.json
│   ├── design_logs.json
│   ├── filters_devices.json
│   ├── filters_users.json
│   ├── filters_builds.json
│   ├── filters_logs.json
│   └── _users_auth.json
│
├── static/                   # Served at /static (Express static)
│   ├── README.md
│   └── gdpr.html
│
├── scripts/                  # Operations scripts
│   ├── docker-pull-all       # Pull all builder/service images
│   ├── stack-deploy          # Swarm deploy helper
│   ├── set-admin.sh          # Promote a user to admin in CouchDB
│   ├── metrics-coverage.js   # Coverage report aggregator
│   ├── normalize-commit-msg.js
│   └── 99-sonar.sh
│
├── builders/                 # Docker build images (git submodules, one per platform)
│   ├── arduino-docker-build/
│   ├── micropython-docker-build/
│   ├── mongoose-docker-build/
│   ├── nodemcu-docker-build/
│   └── platformio-docker-build/
│
├── services/                 # External subservices (git submodules) — NOT part of this API process
│   ├── console/              # Vue console frontend — submodule at thinx-cloud/console
│   │                         #   SHA 1a467f1, branch thinx-staging (as of 2026-05-26)
│   │                         #   Deployed separately; see services/console/AGENTS.md
│   ├── worker/               # Build worker — connects to lib/thinx/queue.js Socket.IO :4000
│   ├── transformer/          # JS sandbox for device status transformers
│   ├── broker/               # Mosquitto MQTT broker image config
│   ├── couchdb/              # CouchDB image config
│   ├── redis/                # Redis image config
│   └── traefik/              # Traefik reverse-proxy config
│
├── base/                     # thinxcloud/base image source (git submodule)
│
├── platforms/                # Per-platform firmware build assets
├── languages/                # Per-language firmware build assets
├── img/                      # Repo images for README
├── docs/                     # Generated docs
├── coverage/                 # nyc coverage output (gitignored)
├── statistics/               # Reserved for runtime statistics dumps
│
└── .githooks/                # Repo-local git hooks (enabled via `npm run setup:hooks`)
```

## Directory Purposes

**`thinx.js` (entry shim):**
- Purpose: kick the bootstrap chain.
- Contains: a 15-line file that does `new THiNX().init(cb)`.
- Key files: `thinx.js`.

**`thinx-core.js` (bootstrap orchestrator):**
- Purpose: do the full app boot — Redis, JWT, Messenger, Slack, Database, queue/builder, GDPR, session, routers, HTTP/HTTPS/WS servers.
- Contains: one giant `init()` method (~625 lines) and nothing else.
- Key files: `thinx-core.js`.

**`lib/`:**
- Purpose: all backend source. Two flavours of files: HTTP routers at the root, domain classes under `thinx/`.
- Contains: `router.*.js` (HTTP boundary), `middleware/requireAdmin.js`, `thinx/*.js` (domain), `thinx/plugins/` (per-platform firmware build helpers).
- Key files: `lib/router.js`, `lib/thinx/util.js`, `lib/thinx/sanitka.js`, `lib/thinx/globals.js`, `lib/thinx/database.js`.

**`lib/thinx/`:**
- Purpose: business logic, persistence, messaging, build orchestration. One class per file.
- Contains: ~33 classes (see directory layout above for the full list with one-line annotations).
- Key files: `lib/thinx/owner.js` (1104 lines — user lifecycle), `lib/thinx/device.js` (1486 lines — single device), `lib/thinx/devices.js` (598 lines — collection), `lib/thinx/builder.js` (1201 lines — Docker build), `lib/thinx/messenger.js` (974 lines — MQTT + Slack).

**`lib/middleware/`:**
- Purpose: per-handler middleware that is not part of the global pipeline.
- Contains: `requireAdmin.js` only.
- Key files: `lib/middleware/requireAdmin.js`.

**`spec/`:**
- Purpose: jasmine tests + dev-mode config fixtures.
- Contains: `jasmine/` (51 spec files), `mnt/data/conf/` (dev config root that `Globals` reads when `ENVIRONMENT=development`), shared `_envi.json` test data.
- Key files: `spec/jasmine/00-AppSpec.js`, `spec/jasmine/00-DatabaseSpec.js`, `spec/_envi.json`, `spec/mnt/data/conf/config.json`.

**`conf/`:**
- Purpose: repo-checked **sample** configs for documentation; the runtime reads from `/mnt/data/conf` (prod) or `spec/mnt/data/conf` (dev). These files are never read by the running app.
- Key files: `conf/config-sample.json`, `conf/config-localhost.json`.

**`design/`:**
- Purpose: CouchDB design documents installed on first run by `lib/thinx/database.js`.
- Contains: one `design_<name>.json` + `filters_<name>.json` per managed DB (devices, users, builds, logs).
- Generated: No, hand-written. Committed: Yes.

**`static/`:**
- Purpose: assets served at `/static` (Express static middleware — `thinx-core.js:406`).
- Contains: `gdpr.html` and a placeholder README.

**`scripts/`:**
- Purpose: ops and CI helpers.
- Key files: `scripts/stack-deploy`, `scripts/set-admin.sh` (promotes a CouchDB user to admin), `scripts/metrics-coverage.js`.

**`builders/`:**
- Purpose: Docker build images for each firmware platform. Each is a git submodule.
- Generated: No (submodules). Committed: Yes (as submodule pointers).

**`services/`:**
- Purpose: **external subservices** that run as their own containers. Not part of this API process.
- Notable: `services/console/` is the Vue frontend (git submodule at thinx-cloud/console, SHA `1a467f1`, branch `thinx-staging`). `services/worker/` is the build worker that connects to the queue Socket.IO server. `services/transformer/` runs JS status transformers. `services/broker/`, `services/couchdb/`, `services/redis/`, `services/traefik/` hold image configs for the backing infrastructure.
- Generated: No (submodules). Committed: Yes (as submodule pointers).

**`base/`:**
- Purpose: `thinxcloud/base` Docker image source, used as `FROM` in this repo's `Dockerfile`.
- Generated: No (submodule). Committed: Yes.

**`coverage/`:**
- Purpose: nyc coverage output.
- Generated: Yes. Committed: No (gitignored).

## Key File Locations

**Entry Points:**
- `thinx.js`: process entry.
- `thinx-core.js`: bootstrap orchestrator.
- `lib/router.js`: HTTP global middleware (mounted first via `require('./lib/router.js')(app)` at `thinx-core.js:335`).

**Configuration:**
- Runtime: `/mnt/data/conf/config.json` (prod), `<repo>/spec/mnt/data/conf/config.json` (dev). Path selected by `process.env.ENVIRONMENT === "development"` in both `thinx-core.js:88-91` and `lib/thinx/globals.js:9-13`.
- Session secret: `<CONFIG_ROOT>/node-session.json` (`thinx-core.js:93`).
- OAuth configs: `<CONFIG_ROOT>/google-oauth.json`, `<CONFIG_ROOT>/github-oauth.json` (loaded by `lib/thinx/globals.js:103-111`).
- Override: `<CONFIG_ROOT>/config.override.json` if present supersedes `config.json` (`lib/thinx/globals.js:115-119`).
- Deployment prefix: `<CONFIG_ROOT>/.thx_prefix` (or `<data_root>/conf/.thx_prefix` fallback), 12 random bytes generated on first run (`lib/thinx/globals.js:140-199`).
- Sample configs: `conf/config-sample.json`, `conf/config-localhost.json`.

**Core Logic:**
- HTTP entry to business logic: `lib/router.<feature>.js` modules.
- Domain classes: `lib/thinx/*.js` (one per concept — see layout above).
- Shared helpers: `lib/thinx/util.js`, `lib/thinx/sanitka.js`, `lib/thinx/globals.js`.

**Persistence:**
- CouchDB client factory: `lib/thinx/database.js`.
- Redis client: created in `thinx-core.js:99` and exposed as `app.redis_client` (legacy callback API) + `app.redis_store_client` (modern promise API).
- Influx writer: `lib/thinx/influx.js`.

**Testing:**
- Spec runner config: `package.json:scripts.test` → `jasmine` (no separate config file; uses `spec/support/jasmine.json` by convention).
- Spec files: `spec/jasmine/*.js` (51 files).
- Shared fixtures: `spec/_envi.json`, `_envi.json` (top-level mirror).
- Test config root: `spec/mnt/data/conf/`.

## Naming Conventions

**Files:**
- HTTP routers: `lib/router.<feature>.js` (lowercase, dot-separated). Always exports `function (app) { … }`. The "global" router is `lib/router.js` (no feature segment).
- Domain classes: `lib/thinx/<class>.js` (lowercase, no separators). Always exports `class X { … }`. File name and class name differ in capitalisation: `lib/thinx/owner.js` exports `class Owner`.
- Plugin helpers: `lib/thinx/plugins/<platform>/...` mirrors the firmware platform directories under `platforms/` and the submodules under `builders/`.
- Specs: `spec/jasmine/<ClassName>Spec.js` for unit tests; `spec/jasmine/ZZ-Router<Feature>Spec.js` for integration tests (the `ZZ-` prefix makes them sort last so they run after unit specs).
- Boot-order specs use numeric prefixes: `00-AppSpec.js`, `00-DatabaseSpec.js`, `02-OwnerSpec.js`, `03-RsakeySpec.js`.
- Sample/template configs: `<name>-sample.json` (e.g. `config-sample.json`, `github-oauth-sample.json`).

**Directories:**
- `lib/` for app source. `lib/thinx/` for domain. `lib/middleware/` for per-handler middleware.
- `spec/jasmine/` for tests. `spec/mnt/data/conf/` mirrors the prod `/mnt/data/conf/` mount.
- `services/<name>/` for external subservices (always git submodules).
- `builders/<platform>-docker-build/` for firmware build images (always git submodules).

**Code symbols:**
- Classes: `PascalCase` (`Owner`, `Device`, `Builder`, `Messenger`).
- Functions and instance methods: `snake_case` for older code (`sign_with_refresh`, `set_password`), `camelCase` for newer additions (`enforceACLHeaders`, `nextAvailableWorker`). New code should prefer `camelCase` to align with `eslint-config-jquery` defaults.
- Module-level constants: `UPPER_SNAKE_CASE` (e.g. `JWT_KEY` in `lib/thinx/jwtlogin.js:9`, `CSP_POLICY` in `lib/router.js:84`).

## Where to Add New Code

**New HTTP route in an existing feature area:**
- Append handler to the matching `lib/router.<feature>.js` file.
- Start the handler with `if (!Util.validateSession(req)) return res.status(401).end();`.
- Sanitise inputs with `new Sanitka()` (or static methods) — every string from `req.body` or `req.params` must pass through Sanitka before any DB write.
- Respond via `Util.responder(res, success, message)` or `Util.failureResponse(res, code, reason)`.
- Add an integration spec under `spec/jasmine/ZZ-Router<Feature>Spec.js`.

**New feature area (whole new router):**
1. Create `lib/router.<feature>.js`:
   ```js
   const Util = require("./thinx/util");
   const Sanitka = require("./thinx/sanitka"); let sanitka = new Sanitka();
   module.exports = function (app) {
     app.get("/api/v2/<feature>/...", (req, res) => { ... });
   };
   ```
2. Add the `require('./lib/router.<feature>.js')(app);` line inside the router-mount block at `thinx-core.js:335-359`. Keep alphabetical-ish order; admin must stay last.
3. Create matching integration spec `spec/jasmine/ZZ-Router<Feature>Spec.js`.
4. Update `thinx-api-openapi.yaml` if the endpoint is public.

**New admin endpoint:**
- Add handler in `lib/router.admin.js`.
- Mount with `requireAdmin` middleware: `app.<verb>("/api/v2/admin/<path>", requireAdmin, handler);` (see `lib/router.admin.js:63-65`).
- Log every state-changing action via `alog.log(admin_owner, "<action>", ["admin", "<tag>"])`.

**New domain class:**
- Create `lib/thinx/<class>.js` exporting `module.exports = class <Class> { constructor(redis, …) { … } }`.
- Prefer **explicit constructor parameters** over reaching into `app.*` inside handlers (the Queue is the model — see `lib/thinx/queue.js:60`).
- Lazily require CouchDB libs via `new Database().uri()` + `Globals.prefix()` if persistence is needed.
- Add unit spec `spec/jasmine/<Class>Spec.js`.

**New CouchDB-backed entity:**
- Add `design/design_<name>.json` and `design/filters_<name>.json`.
- Append `"<name>"` to `db_names` in `lib/thinx/database.js:69`.
- The next cold start (or test run) will create `<prefix>managed_<name>` and inject the design doc.

**Shared utility (used by ≥2 routers):**
- Add a static method to `lib/thinx/util.js` (HTTP helpers) or `lib/thinx/sanitka.js` (input sanitisation). Do not create a new top-level module — the existing helpers are the convention.

**New scheduled job:**
- Wire it inside the `db.init` callback in `thinx-core.js:154-650` so all dependencies (Redis, Messenger, DB) are guaranteed ready.
- Use `node-schedule` (already a dependency) for cron-style triggers or `setInterval` for fixed intervals. Match the existing pattern in `lib/thinx/queue.js:149-154` (`cron()` method on the domain class).

**New static asset:**
- Drop the file in `static/`. It is served as-is at `/static/<file>` (`thinx-core.js:406`).

**New env var:**
- Read with `process.env.X` and provide a default. Document the var in `Dockerfile` (`ARG X` + `ENV X=${X}`), in `AGENTS.md`, and in `STACK.md` once that document exists.

## Special Directories

**`services/console/`:**
- Purpose: Vue 2 frontend (separate codebase). Has its own `package.json`, AGENTS.md, src/, dist/.
- Generated: No. Committed: Yes (as git submodule).
- Submodule pointer (as of 2026-05-26): `1a467f141a3d9a01eee0c7a1977110d60fc3e736` on branch `thinx-staging`. Owned by `thinx-cloud/console` GitHub org. Deployment flow: push the submodule first, then bump the pointer in this parent repo and push to `thinx-staging` → CircleCI builds and pushes `registry.thinx.cloud:5000/thinx/console:vue` → Swarmpit rolls out (see `AGENTS.md:8-19`).
- Do **not** deep-map this from the API repo. Run `/gsd:map-codebase` inside `services/console/` if you need its internals.

**`services/worker/`:**
- Purpose: external build worker. Connects to `lib/thinx/queue.js` Socket.IO :4000, runs Docker builds from `builders/*` images.
- Generated: No. Committed: Yes (git submodule, `abca18c` as of 2026-05-26).

**`services/transformer/`:**
- Purpose: external JS sandbox that runs user-defined transformers against device status payloads.
- Generated: No. Committed: Yes (git submodule, `9238450` as of 2026-05-26).

**`services/broker/`, `services/couchdb/`, `services/redis/`, `services/traefik/`:**
- Purpose: container configs for backing infrastructure (Mosquitto, CouchDB, Redis, Traefik). Built and deployed separately.
- Generated: No. Committed: Yes (git submodules).

**`builders/<platform>-docker-build/`:**
- Purpose: Docker images for firmware builds (arduino, micropython, mongoose, nodemcu, platformio). Pulled by `services/worker/` at runtime.
- Generated: No. Committed: Yes (git submodules).

**`base/`:**
- Purpose: `thinxcloud/base` Docker image. This repo's `Dockerfile` does `FROM thinxcloud/base:alpine` (`Dockerfile:1`).
- Generated: No. Committed: Yes (git submodule, `30044b2c` as of 2026-05-26).

**`spec/mnt/data/conf/`:**
- Purpose: mirror of the prod `/mnt/data/conf/` mount, used only when `process.env.ENVIRONMENT === "development"`. `thinx-core.js:90-91` and `lib/thinx/globals.js:11-13` rewrite the config root to this directory.
- Generated: No. Committed: Yes (test fixtures).

**`spec/test_repositories/thinx-firmware-esp8266/`:**
- Purpose: sample firmware repo cloned during build-flow specs.
- Generated: No. Committed: Yes (git submodule).

**`coverage/`:**
- Purpose: nyc/jasmine coverage output, plus a sibling under `spec/coverage/`.
- Generated: Yes. Committed: No.

**`node_modules/`:**
- Purpose: npm dependencies for ~64 direct deps (Express 5, jsonwebtoken, mqtt, nano, redis, helmet, etc.).
- Generated: Yes. Committed: No.

---

*Structure analysis: 2026-05-26*
