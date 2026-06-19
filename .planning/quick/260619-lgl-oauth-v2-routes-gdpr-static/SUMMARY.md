---
quick_id: 260619-lgl
slug: oauth-v2-routes-gdpr-static
date: 2026-06-19
status: incomplete
commit: b92f7c76
branch: thinx-staging
---

# Summary

Routing fix shipped (`/api/v2/oauth/*` now 302 — confirmed live). But the deploy
exposed deeper OAuth-completion failures, and the `/static/gdpr.html` "deploy-lag"
hypothesis was WRONG (still 404 on fresh code). See "Post-deploy reality" below.
The task is NOT complete.

## Post-deploy reality (2026-06-19, after pipeline 5282)

- `GET /api/v2/oauth/google|github` → 302 ✅ (routing fix works).
- `GET /static/gdpr.html` → still 404 ❌ (deploy-lag theory falsified; root cause
  unproven — Traefik routes all of rtm to the API, mount is at thinx-core.js:433
  yet not serving).
- OAuth login does NOT complete:
  - Vue (`console.thinx.cloud`): callback redirects to `public_url` (rtm), so the
    user lands on rtm's legacy login page. HAR confirms the console flow's final
    document is `rtm.thinx.cloud/`.
  - Legacy (`rtm.thinx.cloud`): dashboard blinks then bounces to login. HAR shows
    the `x-thx-core` session cookie IS set and Referer is `/app/`; `/app`
    (`thinx-api.js:175`) bounces to `/` on any 401. Legacy `/app` authenticates by
    session cookie only (no JWT). Root cause of the 401 unproven — needs a
    preserve-log HAR of the `/login` POST + first 401 XHR, or redis/server logs.
- These are latent bugs in the deployed code, not regressions from the 2-line
  routing change.

## Fix A shipped (legacy/rtm OAuth bounce) — commit d305a1ea

Root cause proven from `~/tmp/rtm.thinx.cloud-2.har`: `POST /api/login` (token) →
200 with **no Set-Cookie**, then every `/api/user/*` → 401 → bounce. Cause:
`performTokenLogin` forced `cookie.secure = true` in prod, which makes
express-session suppress Set-Cookie behind the TLS-terminating proxy
(`req.secure===false`). Removed the per-request cookie overrides so the cookie
inherits the global `sessionConfig` (the working password path's behavior). Added
`OAUTH-COOKIE-01` regression test. See FIX-PLAN.md.

Verify post-deploy (preserve-log login on rtm): `POST /api/login` returns
`Set-Cookie: x-thx-core=…` and `/api/user/profile` → 200 (no bounce).

Still open: Fix B (Vue origin-aware callback + JWT), `/static/gdpr.html` 404.

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
