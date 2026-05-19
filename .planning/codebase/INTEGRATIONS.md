# External Integrations
> Last updated: 2026-05-18 | Focus: tech | Mapper: gsd-codebase-mapper

## Summary
THiNX Device API integrates with six categories of external services: data stores (CouchDB, Redis, InfluxDB), messaging (MQTT via Mosquitto, Slack), email (Mailgun), OAuth identity providers (Google, GitHub), error monitoring (Rollbar), and an internal microservice mesh (transformer worker, build worker). All credentials are injected via environment variables; see `.env.dist` for the full list.

---

## Data Storage

### CouchDB (Primary Document Database)
- **Image:** `couchdb:3.2.0` (production), `couchdb:3.1.0` (test)
- **Port:** `5984` (internal only, not exposed publicly)
- **Client:** `nano` ^10.1.4 — `lib/thinx/database.js`
- **Connection string:** `http://${COUCHDB_USER}:${COUCHDB_PASS}@couchdb:5984`
- **Env vars:** `COUCHDB_USER`, `COUCHDB_PASS`, `COUCHDB_COOKIE`, `COUCHDB_SECRET`, `NODENAME`
- **Config fallback:** `database_uri` in `/mnt/data/conf/config.json` (deprecated)
- **Databases used:** `managed_devices`, `managed_users`, and others prefixed with a random hex prefix stored in `.thx_prefix`

### Redis (Session Store + MQTT Auth Cache)
- **Custom image:** `thinxcloud/redis` (built from `services/redis/`)
- **Port:** `6379` (internal only)
- **Client:** `redis` ^4.6.15 with legacy mode enabled — `thinx-core.js`, `lib/thinx/globals.js`
- **Session store:** `connect-redis` ^9.0.0 — `thinx-core.js`
- **Env vars:** `REDIS_PASSWORD`
- **Disabled commands:** `FLUSHDB`, `FLUSHALL`
- **Purpose:** Express session storage, JWT secret persistence (`__JWT_SECRET__` key), MQTT credential cache (bcrypt hashes), owner data cache

### InfluxDB (Metrics/Statistics)
- **Image:** `influxdb:1.8`
- **Port:** `8086` (internal only)
- **Client:** `influx` ^5.11.0 — `lib/thinx/influx.js`
- **Connection:** `http://influxdb:8086` (hardcoded hostname)
- **Env vars:** `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD`
- **Database:** `stats` (created at startup via `InfluxConnector.createDB('stats')`)
- **Measurements written:** `APIKEY_INVALID`, `LOGIN_INVALID`, `DEVICE_NEW`, `DEVICE_CHECKIN`, `DEVICE_REVOCATION`, `BUILD_STARTED`, `BUILD_SUCCESS`, `BUILD_FAILED`
- **Companion:** Chronograf `1.9` at port `8888` for visualization

---

## Messaging & Real-time

### MQTT — Mosquitto Broker
- **Image:** `thinxcloud/mosquitto` (custom)
- **Ports:** `1883` (MQTT), `1884` (MQTTS), `8883` (WebSocket)
- **Client:** `mqtt` ^5.14.1 — `lib/thinx/messenger.js`
- **Auth:** Dynamic bcrypt-hashed passwords stored in Redis; broker validates against Redis via plugin
- **Config volumes:** `/mnt/data/mosquitto/config`, `/mnt/data/mosquitto/ssl`, `/mnt/data/mosquitto/auth`
- **Purpose:** Bidirectional device-to-cloud messaging; each owner gets a dedicated MQTT client via `Messenger` class

### WebSocket Server (Build Log Streaming)
- **Library:** `ws` ^8.20.1 (raw WebSocket) + `socket.io` ^4.8.0 (Socket.IO)
- **Implementation:** `thinx-core.js` lines ~409–631
- **Purpose:** Real-time build log streaming to browser console; build log tail piped over WS connection
- **Socket.IO client:** Used in `lib/thinx/queue.js` to connect to worker service

### CoAP Server (Stub)
- **Library:** `coap` ^1.4.2 — `lib/thinx/coap.js`
- **Port:** `5683` (default CoAP)
- **Status:** MQTT forwarding not implemented; serves as protocol endpoint stub only

---

## Notification Services

### Slack
- **SDKs:** `@slack/rtm-api` ^7.0.4 (RTM bot), `@slack/web-api` ^7.15.0, `slack-notify` ^2.0.6
- **Implementation:** `lib/thinx/messenger.js` (RTM + Web clients), `lib/thinx/notifier.js` (webhook)
- **Env vars:** `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK`
- **Purpose:** Build success/failure notifications to `#thinx` channel; OAuth login via `lib/router.slack.js`
- **OAuth flow:** `lib/router.slack.js` using `simple-oauth2`

### Email — Mailgun
- **SDK:** `mailgun.js` ^12.1.1 + `form-data`
- **Implementation:** `lib/thinx/owner.js` (initialization), `lib/thinx/transfer.js`
- **Env var:** `MAILGUN_API_KEY`
- **Purpose:** Transactional email for device ownership transfer notifications

---

## Authentication & Identity

### JWT (Session Auth)
- **Library:** `jsonwebtoken` ^9.0.3
- **Algorithm:** `HS512`
- **Implementation:** `lib/thinx/jwtlogin.js`
- **Secret storage:** Redis key `__JWT_SECRET__` — regenerated on each restart
- **Purpose:** Primary session authentication for API consumers

### Google OAuth2
- **Library:** `simple-oauth2` ^5.0.0 (`AuthorizationCode` flow)
- **Implementation:** `lib/router.google.js`
- **Endpoints:** `/api/v2/oauth/google`
- **Token host:** `https://www.googleapis.com`, authorize host `https://accounts.google.com`
- **Env vars:** `GOOGLE_OAUTH_ID`, `GOOGLE_OAUTH_SECRET`
- **Config file:** `/mnt/data/conf/google-oauth.json`

### GitHub OAuth2
- **Library:** Custom implementation in `lib/thinx/oauth-github.js` (uses `axios`)
- **Router:** `lib/router.github.js`
- **Endpoints:** `/github/login`, `/github/callback`
- **GitHub API:** `https://api.github.com/user/keys` — `lib/thinx/github.js`
- **Env vars:** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ACCESS_TOKEN`
- **Config file:** `/mnt/data/conf/github-oauth.json`

### MQTT Authentication (bcrypt + Redis)
- **Implementation:** `lib/thinx/auth.js`
- **Library:** `bcrypt` ^6.0.0 (cost factor 10, matching Mosquitto's `auth_opt_hasher_cost`)
- **Flow:** Credentials hashed and stored in Redis; Mosquitto reads from Redis via auth plugin

---

## Monitoring & Observability

### Rollbar (Error Tracking)
- **SDK:** `rollbar` ^2.26.5
- **Implementation:** `lib/thinx/globals.js` — initialized on startup if token present
- **Env vars:** `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`
- **Features:** `handleUncaughtExceptions: true`, `handleUnhandledRejections: true`
- **Revision tracking:** `REVISION` env var passed through

### Code Quality / Security Scanning
- **Snyk:** `@snyk/protect` ^1.1300.2 — runs on `npm prepare`; config in `.snyk`
- **Coveralls:** Coverage upload — `COVERALLS_REPO_TOKEN` env var
- **Codacy:** `CODACY_PROJECT_TOKEN` env var; config in `.codacy.yml`
- **SonarQube:** `sonar-project.properties` present; `npm run sonar` script
- **CodeClimate:** `codeclimate.json` present

---

## Internal Microservices

### Transformer Service
- **Image:** `thinxcloud/transformer` (custom, built from `services/transformer/`)
- **Port:** `7474` (internal only)
- **Purpose:** Code/firmware transformation pipeline
- **Env vars:** `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`

### Worker Service
- **Image:** `thinxcloud/worker:latest`
- **Communication:** Socket.IO client in `lib/thinx/queue.js` connects to worker
- **Volume shares:** `/mnt/data/repos`, `/mnt/data/deploy`, Docker socket `/var/run/docker.sock`
- **Env vars:** `WORKER_SECRET`, `THINX_SERVER`, `ROLLBAR_ACCESS_TOKEN`
- **Purpose:** Executes firmware builds in isolated Docker containers

### Console (Frontend)
- **Build context:** `services/console/src` (classic) or `services/console/vue` (Vue)
- **Port:** `8000:80`
- **Env vars (build-time):** `LANDING_HOSTNAME`, `WEB_HOSTNAME`, `API_HOSTNAME`, `API_BASEURL`, `ENTERPRISE`, `GOOGLE_ANALYTICS_ID`, `ROLLBAR_ACCESS_TOKEN`, `CRISP_WEBSITE_ID`

---

## Reverse Proxy & TLS

### Traefik
- **Image:** `traefik:v2.6.1` — `docker-compose.traefik.yml`
- **Ports:** `80` (HTTP), `443` (HTTPS), `8080` (Traefik dashboard)
- **TLS:** Let's Encrypt ACME via `acme-v02.api.letsencrypt.org`; certs stored in `services/traefik/`
- **Certificate handling in app:** `node-forge` PKI verification in `thinx-core.js` (supports LE intermediate rotation R10/R12)
- **Purpose:** SSL termination and routing between api, console services

---

## Webhooks & Callbacks

### Incoming Webhooks
- **GitLab Webhook:** Port `9002` (HTTPS) — `lib/thinx/repository.js`
- **GitHub Webhook:** Handled via `lib/router.github.js`
- **Purpose:** Trigger firmware rebuilds on git push events

### Outgoing
- Slack notifications (build events) via `slack-notify` webhook URL (`SLACK_WEBHOOK`)
- Rollbar error reporting (automatic via SDK)

---

## File Storage (Local/Volume)

No cloud object storage detected. All file storage is local filesystem via Docker volumes:

| Path | Purpose |
|------|---------|
| `/mnt/data/repos` | Git repository clones for builds |
| `/mnt/data/deploy` | Compiled firmware artifacts |
| `/mnt/data/ssl` | TLS certificates |
| `/mnt/data/ssh_keys` | SSH keys for git access (managed by `lib/thinx/rsakey.js`) |
| `/mnt/data/conf` | Runtime JSON configuration |
| `/mnt/data/statistics` | Statistics data files |
| `/mnt/data/mosquitto` | Mosquitto config, SSL, and auth files |

---

## CI/CD

- **CI Provider:** CircleCI — `.circleci/config.yml`
- **Orbs used:** `circleci/node@6.3.0`, `circleci/docker@2.0.3`, `circleci/slack@5.0.0`
- **Registry:** `registry.thinx.cloud:5000` (private registry)
- **Docker Hub:** `thinxcloud/*` images (base, mosquitto, redis, worker, transformer)
- **Pipeline jobs:** `build-base`, `build-vue-console`, `build-console-classic`, and API build
- **Node index splitting:** `CIRCLE_NODE_INDEX` / `CIRCLE_NODE_TOTAL` used for test parallelism

---

## Required Environment Variables

Critical variables that must be set before the service starts:

```
# Infrastructure
COUCHDB_USER        CouchDB admin username
COUCHDB_PASS        CouchDB admin password
COUCHDB_COOKIE      CouchDB Erlang cookie
COUCHDB_SECRET      CouchDB secret
REDIS_PASSWORD      Redis auth password
NODENAME            CouchDB cluster node name
THINX_HOSTNAME      Public FQDN for the API
THINX_OWNER_EMAIL   Admin contact email
ENVIRONMENT         Runtime mode: production | development | test
WORKER_SECRET       Shared secret between API and worker service

# Optional but functional
ROLLBAR_ACCESS_TOKEN   Error monitoring
ROLLBAR_ENVIRONMENT    Rollbar environment tag
MAILGUN_API_KEY        Email sending
SLACK_BOT_TOKEN        Slack bot integration
SLACK_CLIENT_ID        Slack OAuth
SLACK_CLIENT_SECRET    Slack OAuth
SLACK_WEBHOOK          Slack incoming webhook URL
GOOGLE_OAUTH_ID        Google OAuth client ID
GOOGLE_OAUTH_SECRET    Google OAuth client secret
GITHUB_CLIENT_ID       GitHub OAuth client ID
GITHUB_CLIENT_SECRET   GitHub OAuth client secret
GITHUB_ACCESS_TOKEN    GitHub personal access token
GIT_KEY_PASSPHRASE     SSH key passphrase for git operations
INFLUXDB_USERNAME      InfluxDB admin user
INFLUXDB_PASSWORD      InfluxDB admin password
CODACY_PROJECT_TOKEN   Codacy integration
AQUA_SEC_TOKEN         Aqua Security container scanning
SNYK_TOKEN             Snyk security scanning
```

---

*Integration audit: 2026-05-18*
