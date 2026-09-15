---
phase: 21-csp-wildcard-removal-anti-csrf-token
plan: 01
subsystem: auth
tags: [csrf, express, cookie-parser, crypto, double-submit-cookie]

# Dependency graph
requires: []
provides:
  - "lib/middleware/csrf.js double-submit CSRF middleware factory (ensureXsrfCookie/verifyCsrfToken/issueCsrfToken)"
  - "GET /api/csrf-token + GET /api/v2/csrf-token priming endpoints"
  - "verifyCsrfToken wired onto the 7 cookie-session login/account POST routes"
  - "debug.csrf_enforce config flag + CSRF_ENFORCE env override (fail-open default)"
affects: [21-02, 21-04, 21-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Middleware-factory pattern (mirrors lib/middleware/requireAdmin.js): module.exports = function(app) { return {...}; }"
    - "Double-submit cookie CSRF: non-httpOnly XSRF-TOKEN cookie + X-XSRF-TOKEN header, crypto.timingSafeEqual comparison"
    - "Config/env-driven feature flag mirroring debug.allow_http_login (CSRF_ENFORCE env short-circuits app_config.debug.csrf_enforce)"

key-files:
  created:
    - lib/middleware/csrf.js
    - spec/jasmine/ZZ-CSRFSpec.js
  modified:
    - thinx-core.js
    - lib/router.auth.js
    - lib/router.user.js
    - lib/router.js
    - conf/config-sample.json
    - conf/config-localhost.json
    - spec/mnt/data/conf/config.json

key-decisions:
  - "issueCsrfToken never re-invokes ensureXsrfCookie or crypto.randomBytes — it only reads whatever the already-run global middleware left on req.cookies/res.locals, preventing a second Set-Cookie on the priming GET"
  - "verifyCsrfToken wired onto exactly the 7 routes in the plan's reconciled protected-set table (including the Vue password reset/set routes the original D-02 list omitted) — X-Access-Token/JWT routes and /api/v2/user untouched"
  - "csrf_enforce defaults to false (fail-open + warning log) in all 3 shipped config files; CSRF_ENFORCE env var takes precedence for a config-free rollback"

patterns-established:
  - "Double-submit CSRF check as Express route middleware inserted between the route path and its handler (app.post(path, csrf.verifyCsrfToken, handler)), not as a global gate — keeps X-Access-Token/JWT routes unaffected by construction"

requirements-completed: [SEC-CSRF-01]

duration: ~20min
completed: 2026-07-05
---

# Phase 21 Plan 01: Anti-CSRF Double-Submit Token (API side) Summary

**Double-submit `XSRF-TOKEN`/`X-XSRF-TOKEN` CSRF middleware wired onto the 7 cookie-session login/account POST routes, fail-open by default via `debug.csrf_enforce`/`CSRF_ENFORCE`.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- `lib/middleware/csrf.js`: `ensureXsrfCookie` (mints/refreshes a non-httpOnly, `SameSite=lax`, domain-scoped `XSRF-TOKEN` cookie on every request), `verifyCsrfToken` (constant-time double-submit check, fail-open/enforce dual mode), `issueCsrfToken` (priming GET handler that reads — never re-mints — the token)
- `GET /api/csrf-token` and `GET /api/v2/csrf-token` priming endpoints for cold (cookieless) console sessions, exempt from `verifyCsrfToken`
- `verifyCsrfToken` wired onto exactly the 7 protected routes: `POST /api/login`, `POST /api/v2/login`, `POST /api/user/create`, `POST /api/user/password/set`, `POST /api/user/password/reset`, `POST /api/v2/password/reset`, `POST /api/v2/password/set`
- `cookie-parser` mounted (was an unmounted existing dependency) + `csrf.ensureXsrfCookie` mounted globally before all routers in `thinx-core.js`
- CORS `Access-Control-Allow-Headers` extended with `X-XSRF-TOKEN` for the cross-origin Vue console
- `debug.csrf_enforce: false` added to `conf/config-sample.json`, `conf/config-localhost.json`, `spec/mnt/data/conf/config.json`
- `spec/jasmine/ZZ-CSRFSpec.js`: 6-case unit regression spec against mock req/res (no full app boot)

## Task Commits

1. **Task 1: CSRF middleware module (double-submit cookie + verify) and enforce-flag config** - `5a412795` (feat)
2. **Task 2: Mount cookie-parser + CSRF middleware, add priming endpoints, protect the 7 routes, extend CORS allowlist** - `593961c4` (feat)

## Files Created/Modified
- `lib/middleware/csrf.js` - double-submit CSRF middleware factory: `ensureXsrfCookie`, `verifyCsrfToken`, `issueCsrfToken`
- `spec/jasmine/ZZ-CSRFSpec.js` - 6-case unit spec (valid/missing/forged token x fail-open/enforce, cookie minting, no-double-generation)
- `thinx-core.js` - mounts `cookie-parser` + `csrf.ensureXsrfCookie` globally, before all routers
- `lib/router.auth.js` - `GET /api/csrf-token` + `GET /api/v2/csrf-token` priming endpoints; `verifyCsrfToken` on the 2 login POSTs
- `lib/router.user.js` - `verifyCsrfToken` on the 5 account create/reset/set POSTs
- `lib/router.js` - CORS `Access-Control-Allow-Headers` gains `X-XSRF-TOKEN`
- `conf/config-sample.json`, `conf/config-localhost.json`, `spec/mnt/data/conf/config.json` - `debug.csrf_enforce: false` added

## Decisions Made
- Followed the plan's reconciled 7-route protected set (not the original D-02's incomplete 5-route list) — includes the Vue console's `/api/v2/password/reset` + `/api/v2/password/set` and the classic `/api/user/password/set` alongside `/api/login`, `/api/v2/login`, `/api/user/create`, `/api/user/password/reset`.
- `issueCsrfToken` deliberately does not call `ensureXsrfCookie` again and does not call `crypto.randomBytes` — it reads `req.cookies['XSRF-TOKEN'] || res.locals.xsrfToken`, both populated by the already-run global middleware for the same request/response pair. Verified via spec case 6 (exactly one `res.cookie()` call across both `ensureXsrfCookie` + `issueCsrfToken`).
- Left `buildContentSecurityPolicy()` in `lib/router.js` completely untouched, per plan scope boundary (CSP host pinning is Plan 21-0x, not this plan).

## Deviations from Plan

None - plan executed exactly as written. The unused `app` parameter in the `csrf.js` factory (mirroring `requireAdmin.js`'s pattern even though this middleware doesn't need any `app.*` member) was renamed to `_app` to satisfy this repo's ESLint `no-unused-vars` rule (`argsIgnorePattern: "^_"`) — a mechanical naming adjustment, not a behavioral change, so not tracked as a Rule 1-3 deviation.

## Issues Encountered

**Local test-harness limitation (pre-existing, not introduced by this plan):** `spec/support/jasmine.json`'s `helpers: ["helpers/**/*.js"]` glob always loads `spec/helpers/bootstrap.js` first for *any* jasmine invocation in this repo (even a single targeted spec file), and that helper unconditionally boots the full `THiNX` app (`thx.init(...)`), which requires a real `/mnt/data/conf/config.json` (production path) plus live CouchDB/Redis. Running the plan's literal verify command, `npx jasmine spec/jasmine/ZZ-CSRFSpec.js`, hits this exact same limitation that `ZZ-CookieAttributeSpec.js` already documents in its own header comment ("npm test aborts locally on missing /mnt/data/conf/config.json ... CI-side Jasmine run is the canonical behavioral gate"). This is unrelated to the CSRF middleware itself.

To still validate all 6 spec cases locally without CouchDB/Redis (matching the plan's explicit intent that `ZZ-CSRFSpec.js` be CouchDB-independent), I ran the spec through a standalone `jasmine` programmatic-API script (scratch-only, not committed) with `helpers: []` and `ENVIRONMENT=development` (which points `lib/thinx/globals.js` at the bundled `spec/mnt/data/conf/config.json` instead of the production `/mnt/data/conf` path) — bypassing only the shared full-app-boot helper, not the spec's own logic. Result: **6 specs, 0 failures**.

Route-wiring was additionally verified by requiring `lib/router.auth.js` and `lib/router.user.js` standalone against a minimal mock `app` object and counting registered handlers per route — confirming exactly 2 handlers (csrf.verifyCsrfToken + business handler) on all 7 protected routes, and exactly 1 handler (no CSRF check) on every other route including `/api/v2/user`, `/api/user/chat`, `/api/v2/chat`, `/api/user/delete`, and `DELETE /api/v2/user`.

`npx eslint` and `node -c` (syntax check) were run clean on all 4 modified source files (`thinx-core.js`, `lib/router.auth.js`, `lib/router.user.js`, `lib/router.js`) and the 2 new files.

The canonical behavioral gate for `00-AppSpec.js` + `ZZ-CookieAttributeSpec.js` (which need the full app + live services) remains CI, per the existing repo pattern — not runnable in this sandbox.

## User Setup Required

None - no external service configuration required. This plan's config flag (`debug.csrf_enforce: false`) ships fail-open by default in all 3 config files; flipping to enforce (Plan 21-05) is a config/env change only.

## Next Phase Readiness
- API-side double-submit CSRF check is live in fail-open mode — safe to deploy without breaking existing login/account flows.
- Console-side wiring (hidden `_csrf` form fields, `X-XSRF-TOKEN` header on XHR/axios) is Plan 21-02's scope, consuming the `GET /api/(v2/)csrf-token` priming endpoints and cookie shipped here.
- Enforce-flag flip (Plan 21-05) can proceed once console wiring (21-02) and fail-open verification (21-04) are done — no code change needed, only `debug.csrf_enforce: true` or `CSRF_ENFORCE=true`.

---
*Phase: 21-csp-wildcard-removal-anti-csrf-token*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files and commit hashes verified present:
- `lib/middleware/csrf.js` - FOUND
- `spec/jasmine/ZZ-CSRFSpec.js` - FOUND
- `.planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-01-SUMMARY.md` - FOUND
- Commit `5a412795` - FOUND
- Commit `593961c4` - FOUND
