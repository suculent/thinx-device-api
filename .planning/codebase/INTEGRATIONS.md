# External Integrations

**Analysis Date:** 2026-05-26

## Scope

Integrations consumed by the main backend API (`thinx-device-api`). The `services/` subdirectory contains git submodules — each is treated here as an EXTERNAL service the API talks to, even though they ship together in the same Swarm stack.

## APIs & External Services

**OAuth Identity Providers:**

- **GitHub OAuth2** — `lib/router.github.js`, helper at `lib/thinx/oauth-github.js`
  - SDK: custom `axios`-based client wrapping the `/login/oauth/access_token` endpoint (`lib/thinx/oauth-github.js` L1, L61)
  - User info pulled via raw `https.get` to `api.github.com/user` with `User-Agent: THiNX` (`lib/router.github.js` L201-211)
  - Auth: env `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`; provider base URL in `conf/github-oauth.json`
  - Endpoints exposed: `GET /api/oauth/github`, `GET /api/oauth/github/callback`, `POST /api/github/token` (adds RSA pubkey to GitHub via `lib/thinx/github.js`)
  - Token TTL: 3600 s in Redis (`lib/router.github.js` L112)

- **Google OAuth2** — `lib/router.google.js`
  - SDK: `simple-oauth2` `AuthorizationCode` flow (L37, L141, L171)
  - Authorize host: `accounts.google.com`; token host: `www.googleapis.com`; userinfo: `oauth2/v1/userinfo` (L33, L182)
  - Auth: env `GOOGLE_OAUTH_ID`, `GOOGLE_OAUTH_SECRET`; redirect URIs in `conf/google-oauth.json`
  - Endpoints exposed: `GET /api/oauth/google`, `GET /api/oauth/google/callback`
  - One-shot state nonce stored at `oa:google:<token>` with 60 s TTL (L138)

- **Slack OAuth Bot Install** — `lib/router.slack.js`
  - Direct HTTPS call to `slack.com/api/oauth.access` (L37)
  - Auth: env `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
  - Endpoints exposed: `GET /api/slack/direct_install`, `GET /api/slack/redirect`
  - Bot token cached in Redis under `__SLACK_BOT_TOKEN__` (L68); consumed by `lib/thinx/messenger.js:getBotToken()` L123-139

**Slack Messaging:**

- **Slack Webhook (notifications)** — `slack-notify` ^2.0.6 used in `lib/thinx/notifier.js` L12, L48, L233
  - Webhook URL from env `SLACK_WEBHOOK`
  - `Notifier.notifyAppStart()` posts a `🚀 THiNX Device API started — v<ver> (commit <sha>)` line at every boot — confirms which build is live (`lib/thinx/notifier.js` L29-58)
  - Build success/failure notifications posted from `Notifier.process()` (L232-237)
- **Slack RTM + Web client** — `@slack/rtm-api`, `@slack/web-api` in `lib/thinx/messenger.js` L7-8, L158, L250
  - Currently **disabled at runtime** via `this.DISABLE_SLACK = true` (`messenger.js` L67, L143, L209, L245). The OAuth install flow still works, the token is persisted, but the RTM client does not start. Treat the RTM code path as dormant.

**Email (Mailgun):**

- `mailgun.js` ^12.1.1 — used in `lib/thinx/owner.js` L8-14 and `lib/thinx/transfer.js` L8-10
- Auth: env `MAILGUN_API_KEY`
- Domain: `app_config.mailgun.domain` (from `conf/config.json`)
- Transactional emails sent: user activation, password reset, GDPR expiration warnings (24 h / 7 d / final), device-transfer notifications (sender + recipient) — see `Owner.sendMail` (L88-98) and `Transfer.sendMail` (L243-251).
- All `From:` lines templated as `THiNX API <api@<mailgun.domain>>`.

**Error Tracking:**

- **Rollbar** — initialised in `lib/thinx/globals.js` L127-134 when `ROLLBAR_ACCESS_TOKEN` is set
  - `handleUncaughtExceptions: true`, `handleUnhandledRejections: true`
  - Revision tagged from env `REVISION` (set by CI to `git describe --abbrev=0`)
  - Consumed across `thinx-core.js` and `lib/thinx/builder.js`, `lib/thinx/notifier.js` via `Globals.rollbar()`

**OpenAPI:**

- Spec served at `GET /api/v2/spec` from `thinx-api-openapi.yaml` (`lib/router.js` L222-226). OpenAPI 3.0.3, declared servers `https://rtm.thinx.cloud/api` and `https://rtm.thinx.cloud/api/v2`. Auth schemes: `bearerAuth` (JWT), `sessionCookie` (`x-thx-core`), `apiKeyAuth` (header `Authentication`).

## Data Storage

**Primary database — CouchDB 3.2.0**

- Image: `couchdb:3.2.0` (`docker-compose.yml` L27)
- Network alias: `couchdb`, port `5984` (internal docker network only — no TLS)
- Client library: `nano` ^10.1.4
- Connection: built in `lib/thinx/database.js` L17-18 as `http://${COUCHDB_USER}:${COUCHDB_PASS}@couchdb:5984` (basic auth, internal docker network)
- Auth: env `COUCHDB_USER`, `COUCHDB_PASS` (legacy aliases `COUCHDB_ADMIN`, `COUCHDB_COOKIE`, `COUCHDB_SECRET`)
- Databases (prefixed with random `_prefix` from `conf/.thx_prefix`):
  - `<prefix>managed_users` — owner profiles, including `admin` flag (`lib/thinx/owner.js` L72)
  - `<prefix>managed_devices` — device docs
  - `<prefix>managed_builds` — build history
  - `<prefix>managed_logs` — audit + build logs
- Design docs injected on first boot from `design/design_<name>.json`; replication filters from `design/filters_<name>.json` (`lib/thinx/database.js` L86-94)
- Compaction: every hour for all four DBs (`lib/thinx/database.js` L105-131)
- **Admin promotion is intentionally NOT exposed via REST.** Promotion / demotion is done by `scripts/set-admin.sh` (direct CouchDB PUT). The `users/edit` design fn explicitly blocks `admin` field updates — see commit 96e8e144 referenced in the script header.

**Cache / session / queue store — Redis 5.x**

- Image: custom (`services/redis/` submodule built from `bitnami/redis:5`-style base), `--port 6379` (`docker-compose.yml` L54-80)
- Network alias: `thinx-redis` in compose, but `config.host = "thinx-redis"` (`conf/config-sample.json` L13)
- Client: `redis` ^5.8.2 (`thinx-core.js` L85, L99). The Redis client is created in legacy callback mode: `app.redis_store_client = redis.createClient(...); app.redis_client = app.redis_store_client.legacy()` (L99-100). Auto-reconnect with backoff in `lib/thinx/globals.js:redis_reconnect_strategy` L28-52.
- Auth: env `REDIS_PASSWORD`
- `FLUSHDB`/`FLUSHALL` disabled at server level (`docker-compose.yml` L63, L73)
- Used for:
  - express-session store via `connect-redis` `RedisStore` (`thinx-core.js` L9, L112)
  - JWT secret persisted under key `__JWT_SECRET__` (`lib/thinx/jwtlogin.js` L9, L38)
  - Session revocation blacklist `revoked:owner:<owner>` (`lib/router.admin.js` L37-44, checked in `lib/router.js` L117-129)
  - OAuth state nonce `oa:google:<token>` (TTL 60 s), GitHub access-token wrapper `ghat:<token>` (TTL 3600 s)
  - Build queue: keys `queue:*` polled every 5 minutes by `lib/thinx/queue.js:loop` (cron at `*/5 * * * *` L150)
  - MQTT API keys per owner: `ak:<owner_id>` (revoked on GDPR delete — `lib/router.gdpr.js` L49)
  - Per-owner caches for devices etc. (`/<owner_id>/*`)
  - Slack bot token: `__SLACK_BOT_TOKEN__`
  - Slack conversation id cache

**Time-series — InfluxDB 1.8**

- Image: `influxdb:1.8` (`docker-compose.yml` L242)
- Network alias: `influxdb`, port `8086`
- Client: `influx` ^5.11.0 (`lib/thinx/influx.js` L1)
- Connection: `host: 'influxdb', port: 8086, protocol: 'http'` — hardcoded in `lib/thinx/influx.js` L7-11 and L156-161
- Database: `stats` (created at boot — `InfluxConnector.createDB('stats')` in `thinx-core.js` L156)
- Retention policy: `31d` with replication 1 (L173)
- Measurements: `APIKEY_INVALID`, `LOGIN_INVALID`, `DEVICE_NEW`, `DEVICE_CHECKIN`, `DEVICE_REVOCATION`, `BUILD_STARTED`, `BUILD_SUCCESS`, `BUILD_FAILED` (`lib/thinx/influx.js` L28-39)
- Auth: env `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD` (compose-level — not currently passed into client config)
- Optional companion: `chronograf:1.9` exposed on `8888` (`docker-compose.yml` L255)

**File Storage:**

- Host-mounted volumes under `/mnt/data/` (Swarm: `/mnt/gluster/...`):
  - `/mnt/data/conf` — config bundle (`config.json`, oauth provider JSON, `.thx_prefix`, `node-session.json`)
  - `/mnt/data/deploy` — built firmware artifacts per owner/udid/build_id
  - `/mnt/data/repos` — source-repository clones used by the build worker
  - `/mnt/data/ssh_keys` — git deploy keys
  - `/mnt/data/ssl` — `privkey.pem` / `cert.pem` / `chain` for direct HTTPS termination
  - `/mnt/data/mosquitto/{config,auth,ssl,data,log}` — broker state
  - `/mnt/data/statistics` — `latest.log` parsed by `lib/thinx/statistics.js`
  - `/mnt/data/test-reports` — junit + coverage in CI
- `/var/run/docker.sock` mounted into both `api` and `worker` so the API can orchestrate worker build containers.

**No object storage / S3.** No CDN. Static assets served by Nginx inside the Vue console image (separate stack), not by the API itself.

## Authentication & Identity

**Local password auth:**
- `POST /api/login` and `POST /api/v2/login` (`lib/router.auth.js` L322, L336)
- Passwords hashed with sha256(prefix + password) for comparison (`lib/router.auth.js` L275) — prefix from `.thx_prefix`
- Sessions written to Redis (`x-thx-core` cookie name, `domain` is the parent domain of `app_config.api_url`)
- Cookie `secure: false` because TLS terminates at Traefik (`thinx-core.js` L302, L423)

**OAuth identity providers:**
- GitHub and Google flows above. Successful callback persists a userWrapper in Redis under a token key (TTL 3600 s) then redirects to `<public_url>/auth.html?t=<token>&g=<gdpr-bool>`. The browser then `POST`s the token back to `/api/login` which calls `performTokenLogin` (`lib/router.auth.js` L40-112).

**JWT (`lib/thinx/jwtlogin.js`):**
- Algorithm HS512, secret persisted in Redis under `__JWT_SECRET__`
- `sign_with_refresh(uid)` — access token (1 h) + refresh token (7 days, scope `/api/v2/login`)
- `sign_with_impersonation(target, impersonator)` — 15-minute hard cap, NO refresh, payload carries both `username` (impersonated) and `impersonator_owner` (admin)
- Verification middleware in `lib/router.js` L99-136. Impersonation requests are logged via `audit.js` on every API hit.

**Admin (`lib/middleware/requireAdmin.js`):**
- Loads owner profile from CouchDB, checks `profile.admin === true`, returns 403 otherwise. Used only by `/api/v2/admin/*` endpoints in `lib/router.admin.js` L7-67 (ADMIN-01 list users, ADMIN-02 revoke sessions, ADMIN-03 impersonate).

**API keys (device auth):**
- `apikey` library at `lib/thinx/apikey.js`
- Validated in `lib/router.js` L184-196 for `POST` requests carrying `owner` + `api_key` in body
- MQTT ACL passwords derive from these (`Messenger.fetchKeyAndPublish` L184-205)

**Session revocation:**
- `DELETE /api/v2/admin/session/:owner` writes `revoked:owner:<owner>` to Redis with 7-day TTL; the JWT middleware compares `payload.iat` against that timestamp (`lib/router.js` L117-129). Fails OPEN on Redis errors by design (R1 risk acknowledged in code comment).

## Monitoring & Observability

**Error Tracking:**
- Rollbar (see above) — covers uncaught exceptions and unhandled rejections globally.

**Logs:**
- `winston` ^3.19.0 — `lib/thinx/logger.js`
  - Console transport: all levels (colorized in `ENVIRONMENT=development`)
  - File transport at `${data_root}/statistics/latest.log` — `warn`+ only, plain text format `[<ts>] [<LEVEL>] <message>`
  - `statistics.js:parse_oid()` parses that file and filters out lines containing `[info]`, so STATS events (`[OID:xxx] [BUILD_STARTED]` etc.) MUST be emitted at `warn` level. Documented in the logger header comment.
- The rest of the codebase writes to `console.log` extensively (this is intentional — Docker captures stdout/stderr into the container log).

**Startup notification:**
- `Notifier.notifyAppStart()` posts to `SLACK_WEBHOOK` on boot with version + last-8 chars of `COMMIT_SHA`. Used by ops to verify which build is live.

**Health check:**
- `GET /` returns `{healthcheck: true}` (`lib/router.js` L211-213).

## CI/CD & Deployment

**CI: CircleCI** (`.circleci/config.yml`)

Workflows / jobs:
- `test` — boots full docker-compose stack (influxdb, redis, mosquitto, transformer, worker, couchdb, api) and runs jasmine inside the `api` container. Triggers on branches: `base`, `thinx-unit`, `thinx-class`, `thinx-staging`, `main`.
- `build-api-cloud` — builds `thinxcloud/api:latest` Docker image, pushes to Docker Hub. Slack `basic_fail_1` template on failure. Only `thinx-staging` and `main`. Passes `COMMIT_SHA=$CIRCLE_SHA1` as build arg so `Notifier.notifyAppStart()` can surface it.
- `build-vue-console` — builds the Vue console image from `services/console/vue` and pushes to `registry.thinx.cloud:5000/thinx/console:vue`. Triggers on `thinx-console`, `thinx-staging`, `main`. **Note:** the console submodule itself also pushes the same tag; the parent meta-repo trigger closes the May-21 staleness bug.
- `build-console-classic` — currently disabled (commented out); previously pushed `thinx/console:swarm`.
- `build-base` — builds `thinxcloud/base:alpine` from `base/` (only on `base` branch).

**Registries:**
- Docker Hub — `thinxcloud/api`, `thinxcloud/base` (auth via `dockerhub` context: `DOCKER_USERNAME` / `DOCKER_PUBLIC_PASSWORD`)
- Private registry — `registry.thinx.cloud:5000` for `thinx/console:vue` (auth: `DOCKER_LOGIN` / `DOCKER_PASSWORD`)

**Deployment flow (manual orchestration described in `AGENTS.md`):**
1. Push `services/console` to `thinx-staging` (rebuilds console image)
2. Update parent submodule pointer in `thinx-device-api` and push parent to `thinx-staging`
3. CircleCI builds and pushes images (parent triggers both `build-vue-console` AND `build-api-cloud`)
4. Swarmpit rolls out new service tasks; ops monitor at `https://swarmpit.thinx.cloud/#/tasks`
5. Production console URL: `https://rtm.thinx.cloud/`

**Swarm host access (from AGENTS.md):**
- `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`
- Swarm path: `/mnt/gluster/deployment/swarm`

## Edge / Reverse Proxy

**Traefik v2.6.1** — `docker-compose.traefik.yml`
- Configured for HTTPS + automatic Let's Encrypt via HTTP-01 challenge
- ACME storage at `./services/traefik/acme.json`
- Domains: `${APP_HOSTNAME}`, `${LANDING_HOSTNAME}`, `${DEV_HOSTNAME}`, `${CONSOLE_HOSTNAME}` (all from `.env`)
- API service is labelled `traefik.backend=thinx-api` on port `7442` (`docker-compose.yml` L184-189)
- Console service labelled `traefik.backend=console` on port `80` with `traefik.frontend.headers.SSLForceHost=true`
- TLS unwrapping at Traefik is why `express-session` cookies are set with `secure: false` and `httpOnly: false` (`thinx-core.js` L302-303 — `httpOnly` "temporarily disabled due to websocket debugging" per comment).

**Nginx** — runs inside the `console` image, fronts the static Vue/Angular bundle. CSP for the console (websocket origins, etc.) is configured there, not in the API. Referenced in `AGENTS.md` Confirmed Fixes ("CSP websocket blocking was fixed by allowing connect-src websocket origins in nginx config").

**Let's Encrypt intermediate rotation:**
- `thinx-core.js` L66-70, L219-229 — when `node-forge` certificate verification fails because the configured CA bundle is still pinned to R10 while the leaf was issued by R12 (or vice versa), the API accepts the rotation and proceeds to start HTTPS. This avoids HTTPS-startup outages on intermediate rotation days.

## Messaging — MQTT (Mosquitto)

- Image: `thinxcloud/mosquitto` from `services/broker/` submodule (`docker-compose.yml` L8)
- Ports: `1883` (mqtt), `1884` (mqtts), `8883` (mqtt over websocket)
- Client library: `mqtt` ^5.14.1 used in `lib/thinx/messenger.js` L16, L200
- Broker location: `app_config.mqtt.server` (default `mqtt://mosquitto`) and `app_config.mqtt.port` (default `1883`) — `conf/config-sample.json` L17-19
- URL parsing is defensive — accepts host-only, `mqtt://host`, or `mqtt://host:port` (`lib/thinx/messenger.js` L88-121)
- Auth: per-owner — each owner's MQTT API key is fetched via `Owner.mqtt_key(owner)` and used as the MQTT password; ACLs refreshed on every login (`lib/router.auth.js` L217-237)
- Service MQTT password generated fresh on every boot (`thinx-core.js` L131): 48 random bytes base64url. Hardcoded to `mosquitto` in `ENVIRONMENT=test`, `changeme!` in `ENVIRONMENT=development`.
- Topic pattern: `/<owner_id>/<udid>`
- Actionable notifications stored in Redis under `nid:<nid>` so duplicate user replies are suppressed (`messenger.js` L221-227)

## Messaging — CoAP (stub)

- `coap` ^1.4.2 — server stub at `lib/thinx/coap.js`. Listens on the default CoAP port `5683`. Currently a no-op that logs `MQTT forwarding not implemented yet`. Treat as future integration point, not active.

## Build Worker / Internal RPC

**Worker service** (`services/worker/` git submodule, image `thinxcloud/worker:latest`):
- Connects to API via `socket.io` on internal port `4000` (`lib/thinx/queue.js` L66, L94 — `this.io = require('socket.io')(this.https, { pingTimeout: 300000 })`)
- Auth: shared secret `WORKER_SECRET` (env)
- The API mounts `/var/run/docker.sock` into the worker (`docker-compose.yml` L117) so the worker can spawn build containers (Arduino / PlatformIO / MicroPython / NodeMCU / MongooseOS via the `builders/*-docker-build` submodules)
- Build job lifecycle: enqueue → Redis `queue:*` → cron tick every 5 min in `Queue.cron` → `Builder.build()` invoked → notifier writes `build.json` envelope and posts Slack message → InfluxDB `BUILD_SUCCESS`/`BUILD_FAILED` metric

**Transformer service** (`services/transformer/` git submodule):
- Internal-only HTTP service on port `7474` (`docker-compose.yml` L98)
- Used during builds to transform environment variables / template substitution. No public route.

## Git Integration

- Server-side `git` shelled out via `child_process.execSync` in `lib/thinx/git.js` L4-7, L61, L115
- Deploy keys stored under `/mnt/data/ssh_keys`, mounted into both `api` and `worker`
- Passphrase from env `GIT_KEY_PASSPHRASE`
- `valid_responses` whitelist (`git.js` L7-14) parses git CLI output instead of relying on exit codes

## Webhooks

**Incoming:**
- `POST /githook` and `POST /api/githook` — generic git webhook entrypoint (`thinx-core.js` L381-387); dispatched to `Repository.process_hook(req)` (`lib/thinx/repository.js`). Body accepted, then immediately `res.status(200).end("Accepted")` (fire-and-forget).
- GitHub OAuth callback `GET /api/oauth/github/callback`
- Google OAuth callback `GET /api/oauth/google/callback`
- Slack OAuth redirect `GET /api/slack/redirect`

**Outgoing:**
- Slack webhook (`SLACK_WEBHOOK`) on app boot and on every build completion/failure (`lib/thinx/notifier.js`)
- Mailgun API calls for user-facing transactional email
- GitHub API: pushing the user's RSA public key to their GitHub account (`POST /api/github/token` → `lib/thinx/github.js:addPublicKey`)
- `https://api.github.com/user` userinfo fetch during OAuth callback
- `https://www.googleapis.com/oauth2/v1/userinfo` userinfo fetch during OAuth callback

## Environment Configuration

**Required env vars** (from `.env.dist` + `Dockerfile` ARG block):

| Variable | Purpose | Where read |
|----------|---------|------------|
| `COUCHDB_USER`, `COUCHDB_PASS` | CouchDB basic auth | `lib/thinx/database.js` L14-18 |
| `COUCHDB_COOKIE`, `COUCHDB_SECRET`, `COUCHDB_ADMIN`, `NODENAME` | CouchDB cluster (compose only) | `docker-compose.yml` |
| `REDIS_PASSWORD` | Redis AUTH | `lib/thinx/globals.js:redis_options` L74-77 |
| `THINX_HOSTNAME`, `THINX_OWNER_EMAIL` | Initial admin bootstrap | Dockerfile + compose |
| `WEB_HOSTNAME`, `API_HOSTNAME`, `API_BASEURL`, `LANDING_HOSTNAME`, `APP_HOSTNAME` | Hostnames | Console + CSP + redirect URLs |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ACCESS_TOKEN` | GitHub OAuth | `lib/router.github.js` L43-48 |
| `GOOGLE_OAUTH_ID`, `GOOGLE_OAUTH_SECRET` | Google OAuth | `lib/router.google.js` L26-27 |
| `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK` | Slack | `lib/thinx/messenger.js` L128, `lib/router.slack.js` L15, L30, `lib/thinx/notifier.js` L42 |
| `MAILGUN_API_KEY` | Mailgun client | `lib/thinx/owner.js` L13, `lib/thinx/transfer.js` L11 |
| `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`, `REVISION` | Rollbar tagging | `lib/thinx/globals.js` L127-134 |
| `COMMIT_SHA` | Boot notification — last 8 chars | `lib/thinx/notifier.js` L34 |
| `WORKER_SECRET` | API ⇄ worker auth | passed to worker container |
| `GIT_KEY_PASSPHRASE` | SSH deploy key | `lib/thinx/git.js` |
| `ENTERPRISE` | feature flag | console build, conditional logic |
| `ENVIRONMENT` | `test` / `development` / `production` switches | `thinx-core.js` L114, L133, L138; `lib/thinx/globals.js` L11; `lib/router.auth.js` L105 |
| `NODE_ENV` | `production` in image | Dockerfile L35 |
| `CORS_ALLOWED_ORIGINS` | Optional comma-sep allowlist | `lib/router.js` L50 |
| `AQUA_SEC_TOKEN`, `SNYK_TOKEN`, `CODACY_PROJECT_TOKEN` | CI security scanners | Dockerfile build args only |
| `GOOGLE_ANALYTICS_ID`, `CRISP_WEBSITE_ID`, `GOOGLE_MAPS_APIKEY` | Console only — not used by API | console build |
| `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD` | Influx admin (compose) | `docker-compose.yml` L252-253 |

**Secrets location:**
- `.env` file in each Swarm node (NOT committed; `.env.dist` is the template)
- `conf/config.json`, `conf/{github,google}-oauth.json`, `conf/node-session.json` mounted into the container from `/mnt/data/conf/`
- `.thx_prefix` — random 12-byte hex, generated on first boot, stored at `${data_root}/conf/.thx_prefix`. Prefixes all CouchDB DB names and is used as a salt in owner hashing.

---

*Integration audit: 2026-05-26*
