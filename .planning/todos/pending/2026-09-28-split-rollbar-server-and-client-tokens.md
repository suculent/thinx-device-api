---
created: 2026-09-28T20:30:00.000Z
title: Split Rollbar server and client tokens
area: config
severity: minor
files:
  - .circleci/config.yml:170-196,277
  - Dockerfile:50-60
  - Dockerfile.test:56-59
  - docker-compose.test.yml:64-147
  - .env.dist:36-37
  - services/console/.circleci/config.yml:68,134-160
  - services/console (classic assets/thinx/csp-rollbar.js; Vue main.js VUE_APP_ROLLBAR_ACCESS_TOKEN)
  - services/worker/class.js:1 (reads ROLLBAR_TOKEN, never set)
  - services/worker/worker.js:11
  - services/transformer/app.js, Dockerfile, .env.dist, README.md

audit_acknowledged:
  milestone: v1.14
  at: 2026-10-05
---

## Problem

All Rollbar reporting shares one env name, `ROLLBAR_ACCESS_TOKEN`, with `VUE_APP_ROLLBAR_ACCESS_TOKEN`
alongside it. It has no server/client distinction. The user intends to separate them:

- **`ROLLBAR_SERVER_TOKEN`** (`post_server_item`, secret) for API, worker and transformer.
- **`ROLLBAR_CLIENT_TOKEN`** (`post_client_item`, public by design) for both consoles, classic and Vue.
- **Migration:** the current server token becomes `ROLLBAR_SERVER_TOKEN`. A new
  `post_client_item` token is created in Rollbar for the consoles.

The user's request said `ROLLBAR_TOKEN`. The name actually in use is `ROLLBAR_ACCESS_TOKEN`.
`ROLLBAR_TOKEN` appears only in `services/worker/class.js:1`, which is a dead init path because
nothing sets it (see `services/worker/.planning/codebase/CONCERNS.md` "Inconsistent Rollbar
configuration").

**State checked 2026-09-28** (read-only, fingerprints are SHA-256/12 only, no values printed):

- `thinx_api`, `thinx_worker` and `thinx_transformer` all run the same `ROLLBAR_ACCESS_TOKEN`, fp
  `ed9f549aaa63`, set in each service's spec env.
- The classic console `https://rtm.thinx.cloud/assets/thinx/csp-rollbar.js` ships one 32-hex
  `accessToken` literal, fp `40e042f98a56`. This is a **different** token, so the server token is
  not exposed in the public bundle. Its origin is unknown: an older client token, or a literal
  hard-coded in `csp-rollbar.js`. Find out, because the public bundle should only ever carry a
  `post_client_item` token.
- The Vue console (`https://console.thinx.cloud/`) had no `accessToken` literal in its first
  15 script tags. Check whether `VUE_APP_ROLLBAR_ACCESS_TOKEN` is set at build time at all.
- CircleCI passes the shared `${ROLLBAR_ACCESS_TOKEN}` as a build arg to the classic console
  build (`services/console/.circleci/config.yml:68,160` and parent `.circleci/config.yml:196,277`).
  So a console rebuild could bake the **server** token into the public bundle, depending on how
  the classic build consumes it. Close this path.

## Solution

1. **Rollbar:** create a `post_client_item` token for the consoles. Keep the current
   `post_server_item` token. Optionally set allowed domains or rate limits on the client token.
2. **Server side** (API `lib/thinx`, worker, transformer):
   - Read `ROLLBAR_SERVER_TOKEN`, falling back to `ROLLBAR_ACCESS_TOKEN` for one release so either
     deploy order works.
   - Fix the worker's dead `ROLLBAR_TOKEN` init in `class.js:1`.
   - Update `.env.dist`, docker-compose and README entries.
   - Keep the token a runtime env, never an image `ENV` or build arg (see memory
     rotate-leaked-scanner-tokens: secrets are injected at runtime).
3. **Consoles:**
   - Classic: bake `ROLLBAR_CLIENT_TOKEN` in place of `ROLLBAR_ACCESS_TOKEN`, and replace
     whatever `csp-rollbar.js` hard-codes.
   - Vue: `VUE_APP_ROLLBAR_ACCESS_TOKEN` is fed from `ROLLBAR_CLIENT_TOKEN`. Rename it to
     `VUE_APP_ROLLBAR_CLIENT_TOKEN`, and keep the `/^[0-9a-f]{32,}$/` activation check.
   - Remove the server-token build arg from both console CI jobs.
4. **CircleCI project/context env:**
   - Add `ROLLBAR_SERVER_TOKEN`, with the current value, and `ROLLBAR_CLIENT_TOKEN`, the new one.
   - Remove `ROLLBAR_ACCESS_TOKEN` after the fallback release.
5. **Swarm:** `docker service update --env-add ROLLBAR_SERVER_TOKEN=… --env-rm
   ROLLBAR_ACCESS_TOKEN` per service, one at a time. Never `restart.sh` or `stack deploy` (memory
   swarm-stack-deploy-and-couchdb-dhi).
6. **Verify:**
   - Server fingerprints are unchanged.
   - The console bundles carry only the client token's fingerprint, and never `ed9f549aaa63`.
   - A test error from each app shows up in Rollbar.

Scope is several repos (parent, `services/console`, `services/worker`, `services/transformer`),
so ship it as a `/gsd-quick` with submodule commits and pointer bumps. Coordinate with the worker
polling / legacy-cmd todo so the worker gets one deploy window.
