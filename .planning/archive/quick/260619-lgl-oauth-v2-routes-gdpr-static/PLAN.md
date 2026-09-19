---
quick_id: 260619-lgl
slug: oauth-v2-routes-gdpr-static
date: 2026-06-19
branch: thinx-staging
---

# Quick Task: Fix OAuth `/api/v2/oauth/*` 404 + deploy `/static/gdpr.html`

## Problem (two reported issues)

1. **OAuth login fails from the Vue console.** Clicking "Login with Google/GitHub"
   on `console.thinx.cloud` hits `…/api/v2/oauth/google` and returns
   `Cannot GET /api/v2/oauth/google` (HTTP 404). Confirmed live:
   - `GET /api/oauth/google` → 302 → Google ✅
   - `GET /api/v2/oauth/google` → 404 ❌
   - `GET /api/v2/oauth/github` → 404 ❌

   Root cause: the OAuth initiator/callback routes are mounted only under
   `/api/oauth/*`. The Vue console builds every API URL from a `/api/v2` base
   (`services/console/vue/src/mixins/hostnames.js:9`), and `/login`+`/logout` are
   already dual-mounted under `/api` and `/api/v2` — OAuth was missed. The router
   files even header-comment themselves as `/api/v2/oauth/...`.

   Note: `{success:false,response:"password_missing"}` is unrelated to the OAuth
   GET endpoints — it is emitted only by the username/password branch of `/login`
   (`lib/router.auth.js:202`) for accounts with no local password (i.e. OAuth
   accounts). The OAuth token-login path never checks a password.

2. **`/static/gdpr.html` 404.** The GDPR link in `auth.html`
   (`<ENV::baseUrl>/static/gdpr.html`) 404s. The API serves `/static` via
   `thinx-core.js:433` and `static/gdpr.html` exists and is shipped by the
   Dockerfile (`COPY . .`). The running image predates the effective mount —
   i.e. deploy-lag, fixed by deploying current `thinx-device-api`. No code change.

## Fix

- `lib/router.google.js` — dual-mount `/api/oauth/google` and callback under
  `/api/v2/...` via Express path arrays. `redirect_uri` stays the v1 callback
  (the URI registered with Google), so the round-trip still completes via the v1
  callback path; the v2 callback is registered for parity.
- `lib/router.github.js` — same dual-mount for `/api/oauth/github` + callback.
- `spec/jasmine/ZZ-RouterOAuthSpec.js` — add v2 initiator + callback tests
  (failing before the fix: 404 vs expected 200).
- Issue #2 needs no code change — it ships when this repo is deployed.

## Verification

- `node -c` clean on all three edited files.
- Isolated Express run proves the array form dispatches both v1 and v2 paths to
  one handler (200) while unregistered paths 404.
- v1 handler confirmed live (302 → Google).
- Full Google round-trip + `/static/gdpr.html` verified post-deploy via CI
  (`build-api-cloud`) and live curl.

## Deploy

Commit on `thinx-staging` and push. CI on `thinx-staging` runs `test` →
`build-api-cloud` (deploy), which ships both fixes. Console submodule left at its
current pin (`1191184b`) per decision — neither fix requires a console change.

## Out of scope (flagged, not fixed)

- Vue post-callback gap: the OAuth callback redirects to the legacy `auth.html`
  (session-cookie token login); the Vue SPA has no `auth.html`/token handler and
  uses JWT. OAuth will now *start* from Vue but may land in the legacy console.
  Needs a dedicated Vue OAuth-return + JWT-issuance change.
