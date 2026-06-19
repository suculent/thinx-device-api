---
quick_id: 260619-lgl
slug: oauth-v2-routes-gdpr-static
date: 2026-06-19
status: complete
commit: b92f7c76
branch: thinx-staging
---

# Summary

Fixed the Vue console OAuth login failure and queued the `/static/gdpr.html`
deploy-lag fix.

## What changed

- **`lib/router.google.js`, `lib/router.github.js`** — OAuth initiator + callback
  routes dual-mounted under `/api` and `/api/v2` (Express path arrays). Fixes
  `404 Cannot GET /api/v2/oauth/google|github` from the Vue console.
- **`spec/jasmine/ZZ-RouterOAuthSpec.js`** — added v2 initiator + callback tests.

Commit: `b92f7c76`.

## Issue #2 (`/static/gdpr.html` 404)

No code change. The API already serves `/static` (`thinx-core.js:433`),
`static/gdpr.html` exists, and the Dockerfile ships it (`COPY . .`). The prod 404
is deploy-lag — the running image predates the effective mount. Deploying this
repo to `thinx-staging` resolves it.

## Verification

- `node -c` clean on all edited files.
- Isolated Express run: array form dispatches both v1 and v2 paths to one handler
  (200); unregistered paths 404.
- v1 handler confirmed live (302 → Google).
- Post-deploy: verify `GET /api/v2/oauth/google` → 302 and
  `GET /static/gdpr.html` → 200 on `rtm.thinx.cloud`, plus CI `build-api-cloud`
  green.

## Deploy

Pushed to `thinx-staging`. CI runs `test` → `build-api-cloud` (deploy). Console
submodule left at pin `1191184b` (no console change needed). Watch for flaky
`GitHubSpec` gating the deploy — rerun clears it (per known CircleCI flakiness).

## Follow-up (out of scope)

Vue post-callback gap: OAuth callback redirects to the legacy `auth.html`
(session-cookie token login); the Vue SPA uses JWT and has no `auth.html`/token
handler. OAuth now *starts* from Vue but may land in the legacy console. Needs a
dedicated Vue OAuth-return + JWT-issuance change.
