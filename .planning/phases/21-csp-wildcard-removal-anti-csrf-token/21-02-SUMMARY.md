---
phase: 21-csp-wildcard-removal-anti-csrf-token
plan: 02
subsystem: auth
tags: [csrf, csp, jquery, vue, submodule, console]

# Dependency graph
requires:
  - phase: 21-csp-wildcard-removal-anti-csrf-token (plan 01)
    provides: "Server-side double-submit CSRF middleware (fail-open), GET /api/(v2/)csrf-token priming endpoints, XSRF-TOKEN cookie issuance"
provides:
  - "Hidden _csrf form field on all 5 classic console POST forms (login/register/forget/reset/gdpr)"
  - "Shared classic-console csrf.js seam: cookie reader, prime() GET /csrf-token, global $.ajaxSetup beforeSend X-XSRF-TOKEN header injection, window.__csrfReady promise"
  - "auth.js on-load auto-login (auth.html?g=true) gated on window.__csrfReady to close the cold-session race"
  - "Vue utils/cookies.js#getCookie shared helper"
  - "Vue core/api.js composeHeaders() shared seam sending X-XSRF-TOKEN on every $api call"
  - "Vue Login.vue, PasswordReset.vue, OAuthReturn.vue each prime the XSRF-TOKEN cookie on their own entry point, with OAuthReturn.vue awaiting the prime before its immediate on-load POST"
affects: [21-04-submodule-pointer-bump, 21-05-cold-session-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-seam CSRF wiring: one $.ajaxSetup default (classic) + one composeHeaders() (Vue) instead of per-call-site header edits"
    - "window.__csrfReady promise pattern for gating immediate-on-load POSTs behind an async cookie prime"

key-files:
  created:
    - services/console/src/assets/thinx/csrf.js
    - services/console/vue/src/utils/cookies.js
  modified:
    - services/console/src/index.html
    - services/console/src/password.html
    - services/console/src/auth.html
    - services/console/src/assets/thinx/auth.js
    - services/console/vue/src/pages/Login/Login.vue
    - services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue
    - services/console/vue/src/pages/PasswordReset/PasswordReset.vue
    - services/console/vue/src/core/api.js

key-decisions:
  - "Split Task 1 (hidden _csrf fields) and Task 2 (csrf.js include + auth.js gating) into separate commits on the 3 shared HTML files by staging Task 1's field-only edits first, then layering the script-tag edits for Task 2's commit, to preserve one-commit-per-task hygiene despite overlapping files"
  - "core/api.js imports utils/cookies via relative path ./../utils/cookies (from src/core/ to src/utils/), not @-alias, matching the plan's explicit path instruction"
  - "cookies.js uses ES `export function`/`export default`; verified requireable via plain `node -e ... require()` under Node 22's built-in require(esm) support (no transpilation needed for the plan's verify command)"

patterns-established:
  - "Shared-seam CSRF wiring (two chokepoints only): classic $.ajaxSetup, Vue composeHeaders()"

requirements-completed: [SEC-CSRF-01]

# Metrics
duration: 8min
completed: 2026-07-05
---

# Phase 21 Plan 02: Console-side Anti-CSRF Wiring (services/console submodule) Summary

**Hidden _csrf form fields plus two shared seams (classic jQuery $.ajaxSetup, Vue core/api.js composeHeaders()) wire X-XSRF-TOKEN into every classic and Vue console call site in the services/console submodule, with awaited cookie-priming on the two immediate-on-load auto-login paths (auth.html?g=true, OAuthReturn.vue).**

## Performance

- **Duration:** ~8 min (commit span 20:54:04 -> 20:57:50 local time, 2026-07-05)
- **Tasks:** 4/4 completed
- **Files modified:** 8 modified, 2 created (10 total)

## Accomplishments
- All 5 classic console POST forms (login/register/forget/reset/gdpr) now carry a hidden `_csrf` field, satisfying the scanner's plugin 20012 static form check
- New shared `services/console/src/assets/thinx/csrf.js` primes the `XSRF-TOKEN` cookie via `GET /csrf-token` and installs a global `$.ajaxSetup({beforeSend})` hook that echoes `X-XSRF-TOKEN` on every subsequent `$.ajax()` call on the page - `login.js`, `password.js`, and `auth.js` all inherit the header with zero edits to their request code
- `auth.js`'s on-load auto-login (`auth.html?g=true`) now awaits `window.__csrfReady` before firing its immediate `POST /login`, closing the cold-session race identified by plan-check pass 4
- New `vue/src/utils/cookies.js#getCookie` shared by `core/api.js`, `Login.vue`, and `OAuthReturn.vue`
- `core/api.js`'s `composeHeaders()` now sends `X-XSRF-TOKEN` on every `$get`/`$post`/`$put`/`$delete` call, covering `store/auth.js`'s password reset/set calls with zero edit to that file
- `Login.vue` primes fire-and-forget on mount and sends `X-XSRF-TOKEN` on its raw-fetch login call
- `PasswordReset.vue` gained the previously-missing hostnames mixin and primes independently on mount (reachable directly via email link)
- `OAuthReturn.vue` gained an awaited `primeCsrfCookie()` as the first statement of `created()` (previously unwired call site per plan-check pass 3) plus `X-XSRF-TOKEN` on both its raw-fetch calls (`complete()`'s `/login` POST - required; `submitConsent()`'s `/gdpr` PUT - added for consistency)

## Task Commits

All commits made inside the `services/console` submodule on branch `thinx-staging`:

1. **Task 1: Hidden _csrf field markup on all 5 classic-console forms** - `0f22e0e` (feat)
2. **Task 2: Classic console shared csrf.js seam + auth.js awaited-prime gating** - `cfdea8d` (feat)
3. **Task 3: Vue Login.vue - cookie utility, prime on mount, X-XSRF-TOKEN header** - `fdaf17c` (feat)
4. **Task 4: Vue shared composeHeaders() seam + PasswordReset/OAuthReturn wiring** - `d6d4208` (feat)

**Submodule push:** `git -C services/console push origin thinx-staging` succeeded (`8baec88..d6d4208 thinx-staging -> thinx-staging`).

**Parent repo note:** the parent `thinx-device-api` repo's submodule gitlink pointer was NOT bumped in this plan - that is Plan 21-04's job, per the plan's cross-repo instructions.

## Files Created/Modified
- `services/console/src/assets/thinx/csrf.js` - new: getCsrfCookie/syncHiddenFields/prime, global `$.ajaxSetup` beforeSend, `window.__csrfReady`
- `services/console/vue/src/utils/cookies.js` - new: `getCookie(name)` pure helper
- `services/console/src/index.html` - hidden `_csrf` fields on login/register/forget forms + `csrf.js` script include before `login.js`
- `services/console/src/password.html` - hidden `_csrf` field on reset-form + `csrf.js` include before `password.js`
- `services/console/src/auth.html` - hidden `_csrf` field on gdpr-form + `csrf.js` include before `auth.js`
- `services/console/src/assets/thinx/auth.js` - on-load auto-login branch gated on `window.__csrfReady`
- `services/console/vue/src/pages/Login/Login.vue` - fire-and-forget prime on `created()` + `X-XSRF-TOKEN` header on login fetch
- `services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue` - `primeCsrfCookie()` awaited in `created()` + `X-XSRF-TOKEN` on both raw-fetch calls
- `services/console/vue/src/pages/PasswordReset/PasswordReset.vue` - added hostnames mixin + fire-and-forget prime on `created()`
- `services/console/vue/src/core/api.js` - `composeHeaders()` adds `X-XSRF-TOKEN` via `utils/cookies#getCookie`

## Decisions Made
- Task 1 and Task 2 both touch `index.html`/`password.html`/`auth.html`. To keep one-commit-per-task hygiene, the `<script src="assets/thinx/csrf.js">` insertions were made and then temporarily reverted before the Task 1 commit, then re-applied as part of the Task 2 commit - avoiding a mixed diff in either commit.
- `core/api.js` imports `utils/cookies` via the plan-specified relative path `./../utils/cookies` (not an `@`-alias), matching the interface spec exactly.
- Verified `vue/src/utils/cookies.js`'s ES-module `export function getCookie` is requireable via plain `node -e ... require(...)` (the plan's literal verify command) under this environment's Node 22, which supports synchronous `require()` of ES modules - no build step or transpilation was needed to satisfy the check.

## Deviations from Plan

None - plan executed exactly as written. All 4 tasks' `<verify>` steps passed as specified (the `grep -x 0` clause inside two of the plan's compound verify commands is whitespace-sensitive against `wc -l`'s padded output and doesn't match on this shell in isolation, but the underlying fact it checks - zero diff on `login.js`/`password.js`/`store/auth.js` - was independently confirmed via `git diff --stat` and `git log` showing no commits touching those files in this plan).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Manual DevTools verification (cold-session `GET /csrf-token` + `X-XSRF-TOKEN` on protected POSTs, both consoles) is deferred to the 21-04/21-05 checkpoints per the plan's verification section.

## Next Phase Readiness
- Submodule `thinx-staging` branch is pushed with all 4 commits; CI will build/deploy `console.thinx.cloud` on this push per the phase's deploy-and-verify decision.
- Plan 21-04 still needs to bump the parent repo's `services/console` submodule gitlink pointer to `d6d4208` (or later) so the parent repo's `thinx-staging` reflects this console state.
- Plan 21-05's cold-session checkpoint (DevTools verification of both consoles from a cleared-cookie session) is the functional backstop before the API's CSRF enforcement flag flips from fail-open to enforce.

---
*Phase: 21-csp-wildcard-removal-anti-csrf-token*
*Completed: 2026-07-05*

## Self-Check: PASSED

- `services/console/src/assets/thinx/csrf.js` - FOUND
- `services/console/vue/src/utils/cookies.js` - FOUND
- `.planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-02-SUMMARY.md` - FOUND
- Commits `0f22e0e`, `cfdea8d`, `fdaf17c`, `d6d4208` - all FOUND in submodule git log
- `origin/thinx-staging` (submodule remote) HEAD = `d6d4208` - matches final local commit, push confirmed
