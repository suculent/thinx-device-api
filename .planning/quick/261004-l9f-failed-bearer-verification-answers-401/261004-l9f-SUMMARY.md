---
phase: quick-261004-l9f
plan: 01
subsystem: api-auth
status: complete
tags: [api, auth, jwt, bearer, csrf, status-codes, tdd]

requires:
  - phase: 25
    provides: "Bearer bridge (bindBearerOwner, req.thx_auth = 'bearer', CSRF exemption D-09)"
provides:
  - "A Bearer token that fails app.login.verify answers 401 with an empty body (was 403)"
  - "BearerVerifyStatusSpec: local router harness pinning 401 for garbage, foreign-secret, expired, alg:none, lower-case-scheme and revoked tokens, plus the unchanged CSRF 403 / API-key 401 / Bearer-null statuses"
affects: [api-auth, vue-console, classic-console, csrf]

actuals:
  tokens: 4216     # chars/4 over `git diff d61cbce9..HEAD -- . ':!services'` (16864 chars)
  tasks: 2
  commits: 2
plan_head_before: d61cbce95b20d805b42915bf6571b2d58a71a3e3
plan_head_after: 08270caf076cfd63423f066db57d82e797526052

tech-stack:
  added: []
  patterns:
    - "Authentication failure (bad/expired credential) is 401; 403 stays reserved for CSRF rejections and authorization refusals"

key-files:
  created:
    - spec/jasmine/BearerVerifyStatusSpec.js
  modified:
    - lib/router.js
    - spec/jasmine/MeshSessionAuthSpec.js
    - spec/jasmine/ZZ-CSRFEnforceSpec.js
    - .planning/WINDOWS.md (uncommitted, entry 13)
    - .planning/todos/completed/2026-10-01-bearer-verify-failure-status-401.md (moved from pending, uncommitted)

key-decisions:
  - "Failed Bearer verification answers 401 with no body; the response is otherwise unchanged (no JSON envelope added), so no client that only reads the status sees a new shape"

duration: ~25min
completed: 2026-10-04
---

# Quick 261004-l9f: failed Bearer verification answers 401 Summary

**`lib/router.js` now answers a JWT that fails `app.login.verify` with an empty 401 instead of 403. A bad or expired token can no longer be confused with the CSRF layer's `403 csrf_token_invalid`. Neither console reacts to the change in a harmful way.**

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Failing local spec (RED) | abfc32d0 | spec/jasmine/BearerVerifyStatusSpec.js |
| 2 | 401 + spec updates + console check | 08270caf | lib/router.js, spec/jasmine/MeshSessionAuthSpec.js, spec/jasmine/ZZ-CSRFEnforceSpec.js |

## What changed

- `lib/router.js`: `res.status(403).end()` became `res.status(401).end()` in the Bearer verify-failure branch. The FIXME is gone, and a comment now explains why the status is 401. The G8 comment ("must NOT trigger JWT-403") now says "the failed-JWT 401".
- `spec/jasmine/MeshSessionAuthSpec.js`: "answers 403 for a garbage Bearer token" now expects 401. This was the only local spec that asserted 403 for a bad Bearer.
- `spec/jasmine/ZZ-CSRFEnforceSpec.js` case 5 ("a verified Bearer call ... passes the CSRF layer") used `not.equal(403)` as an indirect check that the token had verified. A failed Bearer is now 401, so that check would pass even when verification failed. The case now also asserts a non-empty body, because a failed Bearer answers an empty 401 and the `/api/v2/session/token` handler always answers with JSON. ZZ specs do not run in CI, so this edit is recorded as unrun-verify in WINDOWS.md entry 13.
- No other spec asserted 403 for a bad Bearer token. The remaining 403 assertions cover CSRF rejections, `requireAdmin` with a valid non-admin token, invalid password login, OAuth state mismatches, and unauthenticated routes. The ZZ-RouterPasswordResetSpec "does not 403" cases assert 200 and send `Bearer null`/`undefined`/empty, which never reach verify. They still hold.

## TDD

- RED (abfc32d0): BearerVerifyStatusSpec ran 15 specs with 7 failures. B1–B7 each failed with "expected 403 to equal 401". B8 (revoked token, already 401) and the V/C/K/N "unchanged" cases passed.
- GREEN (08270caf): BearerVerifyStatusSpec ran 15 specs with 0 failures.

## Console 401 handling (verified read-only)

**Vue console (`services/console/vue/src`)**
- The CSRF re-prime-and-retry path is `utils/cookies.js` `fetchWithCsrf` → `responseIsCsrfRejection`. It only fires when `response.status === 403` and the JSON body is `{"response":"csrf_token_invalid"}`. A 401, or any empty body, never triggers the retry. The old empty 403 never matched this check either.
- `core/api.js` `request()` turns an empty-body response into `{ success:false, status, response:null }`. No code anywhere in `vue/src` branches on `status === 401` or `status === 403` from an `Api` result. The only status checks are the CSRF helpers and `Login.vue`'s `>= 500` message. So a 401 surfaces exactly as the old 403 did: the call fails, nothing is retried, and nothing loops.
- Logout and refresh are driven by token expiry, not by the response. `store/auth.js` `scheduleExpiry` runs `clearSession` at `exp`, then `hydrateSession` (cookie → `POST /session/token`), and on failure navigates to `#/login`. `core/api.js` `composeOptions` also clears the tokens and navigates to `#/login` when the in-memory token's `exp` has already passed. An expired token is therefore dropped before or as it fails. `Visits.vue`'s direct Bearer `fetch` download only logs `!response.ok`.
- Gap (not a regression, unchanged by this task): the Vue console has no reactive "401 → log out" interceptor. A token that is unexpired but invalid (for example after a JWT secret reset) keeps failing until `exp`, with 401 now where it was 403 before. Adding such an interceptor would be a console change and is out of scope here.

**Classic console (`services/console/src/app/js`, `src/assets/thinx`)**
- It never sends an `Authorization: Bearer` header. It runs on the `x-thx-core` cookie session alone, and a grep for `Bearer` / `Authorization` across `app/js`, `assets/thinx` and `html` finds nothing. A failed-Bearer 401 therefore cannot reach it.
- Its CSRF retry (`assets/thinx/csrf.js` `isRejection`) also requires `status === 403` plus `responseJSON.response === "csrf_token_invalid"`. Its generic `xhrFailed` handler (`app/js/thinx-api.js:272`) answers `401` with `window.location = "/"`, which is a logout-style redirect, not a retry.

Verdict: neither console would loop or misbehave on 401 from a bad Bearer, so the status change went ahead.

## Verification

Local runs used temporary jasmine configs with `"helpers": []` and `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y npx jasmine --config=<tmp>`:

- `BearerVerifyStatusSpec.js` alone: 15 specs, 0 failures (RED before the fix: 15 specs, 7 failures).
- BearerVerifyStatus + CsrfRouteInventory + MeshSessionAuth + GoogleOAuthState + GitHubOAuthIsolation + ApikeyExactMatch + DeviceOwnership + TransferRecipient + Util + SecretsSweep + LoggingQualityAudit + OwnerLogLeak + CsrfSessionFlow + CookiePolicy: **375 specs, 0 failures**.
- `JWTLoginSpec.js` (existing JWT spec) cannot run locally. Its `beforeAll` connects to a live Redis, so its 5 specs report "Not run because a beforeAll function failed" (6 failures including the suite-level one). The cause is the environment, not this change: the spec exercises `lib/thinx/jwtlogin.js` directly, and that file is unchanged.
- `npx eslint` on the four changed files: clean. `node --check` on the ZZ spec: clean.

## Deviations from Plan

**1. [Rule 2 - Test integrity] ZZ-CSRFEnforceSpec case 5 strengthened**
- **Found during:** Task 2
- **Issue:** This case does not assert 403 for a bad Bearer. It asserts `not.equal(403)` for a good one. After the change, a regression that failed verification would answer 401 and pass the case without anyone noticing.
- **Fix:** The case also asserts that `res.text` is non-empty, i.e. the handler answered.
- **Files modified:** spec/jasmine/ZZ-CSRFEnforceSpec.js
- **Commit:** 08270caf
- **Verify:** not run (ZZ). Recorded as unrun-verify in WINDOWS.md entry 13.

Otherwise the plan was executed as written.

## Notes / observations (not fixed, out of scope)

- The Bearer branch in `lib/router.js` returns before `cors.enforceACLHeaders`, so neither the old 403 nor the new 401 carries CORS headers. A cross-origin browser client sees an opaque network error rather than the status. Same-origin consoles (both are served from rtm.thinx.cloud) are not affected.
- `JWTLogin#verify` has a dead double-callback path when both `authorization` and `Authorization` exist on `req.headers`. Node lowercases incoming headers, so HTTP traffic cannot reach it.

## Self-Check: PASSED

- FOUND: spec/jasmine/BearerVerifyStatusSpec.js
- FOUND: .planning/todos/completed/2026-10-01-bearer-verify-failure-status-401.md
- FOUND: abfc32d0, 08270caf
