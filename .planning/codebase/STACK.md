# Technology Stack
> Last updated: 2026-05-18 | Focus: tech | Mapper: gsd-codebase-mapper

## Summary
THiNX Device API is a Node.js IoT device management backend (v1.9.2866) built on Express 5. It runs containerized via Docker Compose, uses CouchDB as its primary document store, Redis for sessions and MQTT auth, and communicates with IoT devices over MQTT (Mosquitto) and optionally CoAP. The codebase is written in CommonJS JavaScript and requires Node.js >=19.

---

## Runtime

**Environment:**
- Node.js `>=19.x` (required by `engines` field in `package.json`)
- Base Docker image: `node:25.9.0-alpine3.23` (defined in `base/Dockerfile`)
- Production image: `thinxcloud/base:alpine` (defined in `Dockerfile`)

**Node Environment Variable:**
- `NODE_ENV=production` set in `Dockerfile`

**Package Manager:**
- npm `10.2.3` (pinned in `Dockerfile` via `npm install -g npm@10.2.3`)
- Lockfile: `package-lock.json` present

---

## Languages

**Primary:**
- JavaScript (CommonJS/Node.js) — all application logic in `lib/`, `thinx-core.js`, `thinx.js`

**Secondary:**
- None detected (no TypeScript, Python, or other language sources)

---

## Core Frameworks

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | `^5.2.1` | HTTP API server — entry point in `thinx-core.js` |
| `helmet` | `^8.1.0` | HTTP security headers — applied in `thinx-core.js` |
| `express-rate-limit` | `^8.5.1` | Rate limiting (500 req/min) — `thinx-core.js` |
| `express-session` | `^1.19.0` | Session management backed by Redis |
| `connect-redis` | `^9.0.0` | Redis session store for Express |
| `socket.io` | `^4.8.0` | Real-time WebSocket server (build log streaming) |
| `ws` | `^8.20.1` | Raw WebSocket server — `thinx-core.js` |
| `mqtt` | `^5.14.1` | MQTT client for Mosquitto broker — `lib/thinx/messenger.js` |
| `coap` | `^1.4.2` | CoAP protocol server (stub) — `lib/thinx/coap.js` |

---

## Key Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `nano` | `^10.1.4` | CouchDB client — `lib/thinx/database.js` |
| `redis` | `^4.6.15` | Redis client — `thinx-core.js`, `lib/thinx/globals.js` |
| `jsonwebtoken` | `^9.0.3` | JWT auth (HS512) — `lib/thinx/jwtlogin.js` |
| `bcrypt` | `^6.0.0` | Password hashing for MQTT auth — `lib/thinx/auth.js` |
| `mailgun.js` | `^12.1.1` | Transactional email — `lib/thinx/owner.js` |
| `simple-oauth2` | `^5.0.0` | OAuth2 for Google/GitHub — `lib/router.google.js`, `lib/router.github.js` |
| `influx` | `^5.11.0` | InfluxDB metrics client — `lib/thinx/influx.js` |
| `rollbar` | `^2.26.5` | Error monitoring — `lib/thinx/globals.js` |
| `@slack/rtm-api` | `^7.0.4` | Slack RTM bot — `lib/thinx/messenger.js` |
| `@slack/web-api` | `^7.15.0` | Slack Web API — `lib/thinx/messenger.js` |
| `node-schedule` | `^2.1.1` | Cron job scheduling — `lib/thinx/queue.js` |
| `node-forge` | `^1.4.0` | TLS/PKI/certificate handling — `thinx-core.js` |
| `ssl-root-cas` | `^1.3.1` | Inject trusted CA certs — `thinx-core.js` |
| `axios` | `^1.16.0` | HTTP client — `lib/thinx/oauth-github.js` |
| `uuid` | `^14.0.0` | UUID generation |
| `fs-extra` | `^11.3.3` | Extended filesystem ops |
| `yaml` | `2.8.3` | YAML parsing |
| `moment-timezone` | `0.6.0` | Timezone-aware date handling |
| `crypto-js` | `^4.2.0` | Cryptographic utilities |
| `sha256` | `^0.2.0` | SHA-256 hashing |
| `semver` | `7.7.3` | Semantic version comparison |
| `body-parser` | `^2.2.2` | Request body parsing |
| `morgan` | `^1.10.1` | HTTP request logging |
| `cookie-parser` | `^1.4.7` | Cookie parsing |
| `nocache` | `^4.0.0` | Disable caching headers |
| `tail` | `^2.2.6` | Log file tailing |

---

## Security Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@snyk/protect` | `^1.1300.2` | Snyk vulnerability patching — runs on `npm prepare` |
| `http-signature` | `^1.3.5` | HTTP request signing |

---

## Build Tooling

| Tool | Version | Config File | Purpose |
|------|---------|-------------|---------|
| ESLint | `^10.1.0` | `eslint.config.js`, `.eslintrc.js` | Linting — `npm run lint` |
| nyc (Istanbul) | `^15.1.0` | `.nycrc` | Code coverage — 80% line/statement/function, 75% branch threshold |
| commitlint | `^19.8.1` | `commitlint.config.js` | Commit message enforcement (conventional commits) |
| grunt | `^1.2.1` | `Rakefile` | Build automation (legacy) |

**No formatter detected** (no Prettier or Biome config present).

---

## Testing Frameworks

| Package | Version | Config File | Purpose |
|---------|---------|-------------|---------|
| `jasmine` | `^5.12.0` | `spec/support/` | Primary test runner — `npm test` |
| `mocha` | `^10.2.0` | inline flags | Secondary runner — `npm run mocha` |
| `chai` | `4.5.0` | — | Assertion library |
| `chai-http` | `^4.3.0` | — | HTTP assertion helpers |
| `karma` | `6.4.4` | `karma.conf.js` | Browser test runner (legacy, referenced as `main` in package.json) |
| `karma-jasmine` | `^4.0.2` | — | Karma/Jasmine integration |
| `jest-junit` | `^16.0.0` | `jest.json` | JUnit XML reporter |
| `nyc` | `^15.1.0` | `.nycrc` | Coverage collection |
| coveralls | via override `^3.1.1` | `.coveralls.yml` | Coverage upload |

---

## Ports Exposed

| Port | Protocol | Purpose |
|------|----------|---------|
| 7442 | HTTP | THiNX Web & Device API |
| 7443 | HTTPS | THiNX Device API (TLS) |
| 9002 | HTTPS | GitLab Webhook (optional) |
| 4000/3000 | TCP | Worker socket |

---

## Configuration System

- Primary config loaded from `/mnt/data/conf/config.json` at runtime
- Override config: `/mnt/data/conf/config.override.json` (takes precedence)
- OAuth configs: `/mnt/data/conf/google-oauth.json`, `/mnt/data/conf/github-oauth.json`
- Session config: `/mnt/data/conf/node-session.json`
- In development/test: config root falls back to `spec/mnt/data/conf/` — see `lib/thinx/globals.js`
- Environment template: `.env.dist`

---

## Package Overrides (Security Pins)

Notable dependency version overrides in `package.json` to address vulnerabilities:
- `lodash` pinned to `4.17.23`
- `glob` pinned to `11.1.0`
- `follow-redirects` pinned to `1.15.6`
- `cookie` pinned to `1.0.2`
- `minimist` pinned to `1.2.6`

---

*Stack analysis: 2026-05-18*
