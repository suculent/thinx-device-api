# Technology Stack

**Analysis Date:** 2026-05-26

## Scope

This document describes the **main backend API** (`thinx-device-api`, parent monorepo) only. Subservices live in `services/` and are listed in INTEGRATIONS.md as external integrations:

- `services/console/` — Vue + classic Angular console (separate GSD project, its own `.planning/`)
- `services/worker/` — build worker image (separate repo, pulled as submodule)
- `services/transformer/` — env transformer microservice (separate repo, submodule)
- `services/broker/`, `services/couchdb/`, `services/redis/` — submodule wrappers around their respective images

## Languages

**Primary:**
- JavaScript (Node.js, CommonJS) — entire backend: `thinx.js`, `thinx-core.js`, `lib/**/*.js`, `spec/jasmine/*.js`
- Shell (POSIX `sh`) — operational scripts: `scripts/set-admin.sh`, `scripts/docker-pull-all`, `docker-entrypoint.sh`

**Secondary:**
- YAML — CI + compose: `.circleci/config.yml`, `docker-compose.yml`, `docker-compose.test.yml`, `docker-compose.traefik.yml`, `docker-swarm.yml`, `thinx-api-openapi.yaml`
- Dockerfile — `Dockerfile`, `Dockerfile.test`, `base/Dockerfile`
- JSON — config + manifests: `package.json`, `conf/config-sample.json`, design docs under `design/`

## Runtime

**Environment:**
- Node.js — `engines.node: ">=19.x"` declared in `package.json` L158. Production image starts from `thinxcloud/base:alpine` (see `Dockerfile` L1) which currently pins Node 22.x; the test environment in CircleCI also uses the alpine base image.
- Docker — production runs as a service inside a Docker Swarm stack (`docker-swarm.yml`), local dev / CI uses Docker Compose v2 (`docker-compose.yml`).

**Package Manager:**
- npm — used in CI and `Dockerfile` L85 (`npm install -g npm@10.2.3 && npm install --omit=dev .`)
- Yarn — also pinned via `packageManager: yarn@1.22.22+sha512...` (`package.json` L170). npm is the day-to-day tool; the yarn pin is legacy/secondary.
- Lockfile: `package-lock.json` (~397 KB, committed) — note `.circleci/config.yml` L110 and L182 explicitly `rm -rf package-lock.json` before image builds and tests; the lockfile is intentionally NOT used inside the production image.

## Frameworks

**Core HTTP server:**
- `express` ^5.2.1 — main HTTP framework (`thinx-core.js` L47, L51, L413). Express 5 (not 4) — note: route handlers must follow Express 5 semantics.
- `helmet` ^8.1.0 — security headers, including `helmet.frameguard()` (`thinx-core.js` L52-54, L415)
- `express-session` ^1.19.0 — session middleware backed by Redis (`thinx-core.js` L10, L314)
- `connect-redis` ^9.0.0 — `RedisStore` for express-session (`thinx-core.js` L9, L112)
- `express-rate-limit` ^8.5.1 — 500 req/min global limiter (`thinx-core.js` L73-80, L325). Disabled in `ENVIRONMENT=test`.
- `body-parser` ^2.2.2 (transitive use; explicit `express.json` + `express.urlencoded` at `thinx-core.js` L318, L328)
- `cookie-parser` ^1.4.7, `connect-timeout` ^1.9.1, `morgan` ^1.10.1, `nocache` ^4.0.0

**Realtime:**
- `ws` ^8.20.1 — WebSocket server attached to the same HTTP server via `upgrade` event (`thinx-core.js` L252, L436-487)
- `socket.io` ^4.8.0 + `socket.io-client` ^4.8.1 + `socket.io-parser` ^4.2.6 — internal builder ⇄ worker socket on port 4000 (`lib/thinx/queue.js` L8, L66, L94; `lib/thinx/builder.js`)

**Auth / Crypto:**
- `jsonwebtoken` ^9.0.3 — JWT access + refresh + impersonation tokens (`lib/thinx/jwtlogin.js`, HS512)
- `bcrypt` ^6.0.0 — password hashing (Owner module)
- `simple-oauth2` ^5.0.0 — Google OAuth2 authorization-code flow (`lib/router.google.js` L37)
- `crypto-js` ^4.2.0 — AES decrypt for secure WiFi credentials in builder (`lib/thinx/builder.js` L20, L69)
- `sha256` ^0.2.0, `md5` ^2.3.0, `base-64` ^1.0.0
- `node-forge` ^1.4.0 — certificate parsing / Let's Encrypt intermediate rotation check (`thinx-core.js` L58, L66-70)
- `http-signature` ^1.3.5, `ssh-fingerprint` 0.0.1
- `ssl-root-cas` ^1.3.1 — root CA injection at startup (`thinx-core.js` L82)

**Protocols:**
- `mqtt` ^5.14.1 — MQTT client to Mosquitto broker (`lib/thinx/messenger.js` L16, L200)
- `coap` ^1.4.2 — CoAP server stub on default port 5683 (`lib/thinx/coap.js`)

**Data clients:**
- `nano` ^10.1.4 — CouchDB client used across `lib/thinx/database.js`, `lib/thinx/owner.js`, all routers
- `redis` ^5.8.2 — Redis v5 client; the app uses `legacy()` callback-mode commands (`thinx-core.js` L99-100)
- `influx` ^5.11.0 — InfluxDB 1.x client for statistics (`lib/thinx/influx.js`)

**Testing:**
- `jasmine` ^5.12.0 + `jasmine-core` ^5.12.1 — primary test runner (`spec/jasmine/*.js`, 51 spec files)
- `nyc` ^15.1.0 — coverage; thresholds in `.nycrc` (lines 80, statements 80, functions 80, branches 75)
- `chai` 4.5.0 + `chai-http` ^4.3.0 — HTTP integration tests in 16 `ZZ-*` specs. **VERSION LOCK:** `chai-http` MUST stay at `^4.3.0`. v5 is ESM-only and removes `chai.request(app)`; upgrading would require converting all 16 `ZZ-*` specs to ESM and renaming ~200 call sites. See `AGENTS.md` L82-92.
- `mocha` ^10.2.0 — alternate runner (`npm run mocha`)
- `expect` ^30.2.0, `assert` ^2.0.0
- `karma` 6.4.4 + `karma-jasmine` ^4.0.2 + `karma-chrome-launcher` ^3.2.0 + `karma-coverage` ^2.2.1 — legacy browser-side test runner

**Linting / Quality:**
- `eslint` ^10.1.0 — flat config in `eslint.config.js`; legacy `.eslintrc.js` also present (older config)
- `jshint` ^2.13.4 — listed as runtime dep (transitive use), `.jshintrc` is one line
- `@commitlint/cli` ^19.8.1 + `@commitlint/config-conventional` ^19.8.1 — see `commitlint.config.js`, hook via `npm run setup:hooks`
- `snyk` (`@snyk/protect` ^1.1300.2) — `npm run snyk` and `snyk-protect` lifecycle hook

**Misc / Utilities:**
- `axios` ^1.16.0 — used only in `lib/thinx/oauth-github.js` L1, L61
- `winston` ^3.19.0 — shared logger in `lib/thinx/logger.js`; `warn+` to `latest.log` (parsed by `statistics.js`), all levels to console
- `rollbar` ^2.26.5 — uncaught-exception + unhandled-rejection tracker, initialised in `lib/thinx/globals.js` L127-134 (only when `ROLLBAR_ACCESS_TOKEN` is set)
- `node-schedule` ^2.1.1 — cron-style jobs (`lib/thinx/queue.js` L7, GDPR scheduler)
- `mailgun.js` ^12.1.1 — transactional email (`lib/thinx/owner.js` L8-14, `lib/thinx/transfer.js` L8-10)
- `slack-notify` ^2.0.6 — webhook-based Slack messages (`lib/thinx/notifier.js` L12, L48)
- `@slack/rtm-api` ^7.0.4 + `@slack/web-api` ^7.15.0 — Slack RTM/Web client (currently disabled at runtime via `DISABLE_SLACK = true` in `lib/thinx/messenger.js` L67)
- `fs-extra` ^11.3.3, `fs-finder` (suculent fork), `mkdirp` ^1.0.3, `chmodr` ^1.2.0, `shell-escape` ^0.2.0, `tail` ^2.2.6
- `uuid` ^14.0.0 — uses `v1` (`lib/thinx/builder.js` L10) for build IDs
- `yaml` 2.8.3, `qs` ^6.15.2, `dateformat` ^4.6.3, `moment-timezone` 0.6.0
- `sillyname` ^0.1.0 — generates default device aliases
- `chalk` ^5.6.2 — colorized console output
- `typeof` ^1.0.0, `utf-8` ^3.0.0, `semver` 7.7.3, `mime` ^4.1.0

## Key Dependencies

**Critical (touching every request):**
- `express` ^5.2.1 — HTTP layer
- `redis` ^5.8.2 — session store, JWT secret, blacklist, build queue, MQTT API key cache
- `nano` ^10.1.4 — every router reads/writes CouchDB through `nano`
- `jsonwebtoken` ^9.0.3 — JWT auth for `/api/v2/*`
- `helmet` ^8.1.0 — security headers
- `ws` ^8.20.1 — log streaming + messenger push

**Infrastructure:**
- `mqtt` ^5.14.1 — device telemetry / actuation channel
- `socket.io` ^4.8.0 — builder ⇄ worker job RPC on port 4000
- `influx` ^5.11.0 — per-owner statistics counters (`InfluxConnector.statsLog`)
- `node-schedule` ^2.1.1 — build queue cron (`*/5 * * * *`) + GDPR retention sweep
- `rollbar` ^2.26.5 — production error tracking

## Configuration

**Environment file:**
- `.env` — copied from `.env.dist`; required for both compose stacks (`docker-compose.yml`, `docker-compose.test.yml`). `.env.dist` enumerates the canonical keys (CouchDB creds, Redis password, Mailgun, OAuth client IDs, Slack tokens, Rollbar token).

**JSON configs (mounted at `/mnt/data/conf/` in containers):**
- `conf/config-sample.json` — template; production deploys `config.json` outside the repo. Defines `redis`, `mqtt`, `mailgun`, `slack`, `ssl_*`, `data_root`, `deploy_root`, `build_root`, `port`/`secure_port`, `builder.concurrency`, `debug.*`, `strict_gdpr`.
- `conf/github-oauth-sample.json` / `conf/google-oauth-sample.json` — OAuth provider client/secret + redirect URIs (loaded by `lib/thinx/globals.js` L105-111)
- `conf/node-session.json` — session-cookie secret (`thinx-core.js` L93, L298, L418)
- `spec/mnt/data/conf/` — fixtures used in test/dev (`ENVIRONMENT=test` or `development`)

**Build / runtime args:**
- `Dockerfile` accepts ~20 build args (THINX_HOSTNAME, COUCHDB_USER/PASS, REDIS_PASSWORD, ROLLBAR_ACCESS_TOKEN, GITHUB_*/GOOGLE_OAUTH_*/SLACK_* tokens, MAILGUN_API_KEY, COMMIT_SHA, REVISION, ENTERPRISE, WORKER_SECRET, GIT_KEY_PASSPHRASE). All forwarded to the running process as ENV.
- `COMMIT_SHA` — last 8 chars surfaced by `Notifier.notifyAppStart()` (`lib/thinx/notifier.js` L29-58) so operators can confirm which build is live.

## Platform Requirements

**Development:**
- Node.js 19+ (engines field) — actual local dev uses v22.x via Docker base image
- Docker + Docker Compose v2 (CircleCI installs `docker-compose v2.4.1` via cli-plugin)
- Bound directories used by tests: `./conf`, `./spec/mnt/data/*`, `/mnt/data/*` (created by CI before bringing the stack up — see `.circleci/config.yml` L194-211).

**Production:**
- Docker Swarm stack deployed via parent `thinx-device-api` meta-repo; image pushed as `thinxcloud/api:latest` (`.circleci/config.yml` L113-120).
- Reverse proxy: Traefik (see INTEGRATIONS.md).
- Persistent volumes mounted from `/mnt/data/*` and `/mnt/gluster/...` on the swarm host.
- HTTPS: TLS terminated either at Traefik OR directly by the API when `app_config.ssl_key`/`ssl_cert`/`ssl_ca` exist. The app accepts Let's Encrypt intermediate rotation (R10 ⇄ R12) without restart — `thinx-core.js` L66-70, L219-229 (added 2025-2026).

**Submodules (git):**
- `services/console`, `services/worker`, `services/transformer`, `services/broker`, `services/couchdb`, `services/redis`, `base/`, `builders/{arduino,micropython,mongoose,nodemcu,platformio}-docker-build`, `spec/test_repositories/thinx-firmware-esp8266`. See `.gitmodules`.

## Version Pins / Holds

| Package | Pin | Reason |
|---------|-----|--------|
| `chai-http` | `^4.3.0` (do NOT bump to v5) | v5 is ESM-only, removes `chai.request(app)` API. Would force ESM migration of 16 `ZZ-*` spec files, ~200 call sites, and probably `thinx-core.js`. See `AGENTS.md` L82-92. |
| `moment-timezone` | `0.6.0` (exact) | Legacy pin; declared as exact version, not caret. |
| `semver` | `7.7.3` (exact) | Exact pin. |
| `chai` | `4.5.0` (exact) | Pinned in step with the chai-http v4 hold. |
| `@hapi/hoek` | `11.0.7` (exact) | Exact pin. |
| `yaml` | `2.8.3` (exact) | Exact pin. |
| `mkdirp` | `^1.0.3` | Held at v1 (v2+ is ESM-only). |

**Overrides (security / transitive pins):** `package.json` L97-136 forces specific versions of ~35 transitive deps (`ajv 6.12.3`, `lodash 4.17.23`, `minimist 1.2.6`, `moment 2.29.4`, `path-to-regexp 8.4.0`, `cookie 1.0.2`, `glob 11.1.0`, `follow-redirects 1.15.6`, `ip 2.0.1`, `jose 4.11.2`, etc.) to suppress known CVEs.

---

*Stack analysis: 2026-05-26*
