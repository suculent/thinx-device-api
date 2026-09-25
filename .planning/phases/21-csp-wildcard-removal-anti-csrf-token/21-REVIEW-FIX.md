---
phase: 21-csp-wildcard-removal-anti-csrf-token
fixed_at: 2026-09-25T09:50:00Z
review_path: .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 8
skipped: 2
status: partial
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-09-25T09:50:00Z
**Source review:** .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (1 critical, 9 warnings; `fix_scope: critical_warning`, so IN-01 to IN-06 were not attempted)
- Fixed: 8
- Skipped: 2 (WR-04 on purpose, WR-06 deferred as architectural)

Commits are in two repos. Console fixes are on `services/console` `main`. API and docs fixes are on the parent `thinx-staging`. **Nothing was pushed, and the parent's submodule pointer was not bumped.** The parent working tree shows `M services/console` until the orchestrator commits the pointer.

## Fixed Issues

### CR-01: Concurrent cold-prime requests mint divergent XSRF tokens

**Status:** fixed: requires human verification (logic change on the live CSRF path)
**Files modified:** `services/console/vue/src/utils/cookies.js`, `vue/src/core/api.js`, `vue/src/store/auth.js`, `vue/src/pages/Login/Login.vue`, `vue/src/pages/PasswordReset/PasswordReset.vue`, `vue/src/pages/OAuthReturn/OAuthReturn.vue`
**Commit:** `0334b3c` (console)
**Applied fix:**
- `ensureCsrfToken(apiBase, { force })` in `utils/cookies.js` keeps one module-level prime promise. It skips the fetch when the cookie already exists. If `document.cookie` does not show the new cookie yet, it falls back to the `csrf_token` in the response body.
- `fetchWithCsrf()` awaits that prime and sends the token it resolved to. On a 403 whose body is `csrf_token_invalid`, it force-primes and retries exactly once. A forced prime trusts the token the server echoes back, because that is the cookie value the server actually parsed, so it also recovers when a duplicate cookie makes the browser and the server read different values.
- `Api.request` sends non-GET calls through `fetchWithCsrf`. `hydrateSession` awaits the shared prime. The `hydratePromise` single-flight is unchanged.
- The fire-and-forget primes in Login.vue and PasswordReset.vue are gone. PasswordReset joins the shared prime. OAuthReturn awaits the shared prime and uses `fetchWithCsrf` for `POST /login` and `PUT /gdpr`.
- The server's comparison is unchanged, so nothing new is accepted. The retry fires only on the CSRF 403, which the server returns before the handler runs, so it is safe for the one-shot OAuth token too.
- Tested in a stubbed-fetch harness: concurrent cold calls send 1 GET; no fetch when the cookie exists; body fallback works; retry uses the server-echoed token; at most one retry.

### WR-01: Fail-open log line cannot distinguish failure modes

**Files modified:** `lib/middleware/csrf.js`, `spec/jasmine/ZZ-CSRFSpec.js`, `.planning/runbooks/csp-csrf-hardening.md`
**Commit:** `d2b6f512` (parent)
**Applied fix:** Every failed check now logs `reason=no_cookie|no_header|length_mismatch|value_mismatch` and `xsrf_cookies=<n>`, the number of `XSRF-TOKEN` pairs in the raw Cookie header. When there is more than one, it also logs `duplicate_cookie=true`.
- Fail-open mode keeps the `CSRF token missing/mismatched` prefix.
- Enforce mode now logs exactly one `CSRF token rejected … (enforced, 403)` line per rejection.
- The route is logged without its query string, and token values are never logged.
- Spec cases 7 and 8 cover both modes. The runbook documents the new format.

### WR-02: Cookie Domain derivation throws on port/path/trailing slash

**Status:** fixed: requires human verification (session and XSRF cookie Domain logic)
**Files modified:** `lib/middleware/cookie-policy.js`, `lib/middleware/csrf.js`, `thinx-core.js`, `spec/jasmine/ZZ-CSRFSpec.js`
**Commit:** `dab74dd5` (parent)
**Applied fix:** New `CookiePolicy.cookieDomain(api_url)`:
- Parses the hostname with `URL`.
- Drops the first label only for hosts with 3 or more labels, then checks the result against `^\.[a-z0-9-]+(\.[a-z0-9-]+)+$`.
- Returns `undefined` (host-only cookie) for unparsable values, IPs and 2-label hosts, and never throws.
- The domain is computed once when each factory is created, not per request.

Both `csrf.js` and the session cookie in `thinx-core.js` use it, so there is one implementation instead of two. `https://rtm.thinx.cloud` and `https://app.thinx.cloud` still give `.thinx.cloud`, which is identical to the old output for every URL that works in production today. As a second safeguard, `ensureXsrfCookie` catches a `res.cookie` failure, logs it and calls `next()`, so the global middleware cannot return a 500.

Spec case 9 checks 15 inputs, and passes each result through the `cookie` serializer to confirm it does not throw. Case 10 checks the minted `domain` and `path`, and case 10b checks that `next()` still runs when `res.cookie` throws.

Not done:
- Failing at startup, which the review suggested. The orchestrator asked for "omit, don't throw".
- Moving `lib/thinx/oauth_return.js cookieDomain()` onto the helper. It already returns `undefined` for fewer than 3 labels and does not throw.

### WR-03: New token and Set-Cookie on every cookieless request

**Status:** fixed: requires human verification (route boundary)
**Files modified:** `lib/middleware/csrf.js`, `spec/jasmine/ZZ-CSRFSpec.js`
**Commit:** `f2ce25df` (parent)
**Applied fix:** `ensureXsrfCookie` now returns early for:
- `OPTIONS` requests
- requests with `Origin: device`
- paths under `/device/`
- `/githook` and `/api/githook`

Path matching is case-insensitive and allows a trailing slash, like Express routing. I checked the boundary against the route table. The only non-`/api` routes are `/device/register`, `/device/firmware` (GET and POST), `/device/addpush`, `/githook` and `/api/githook`, and none of them is a console route. Both consoles prime through `GET /csrf-token`, which still mints, and every `/api/*` console route still mints as before. `verifyCsrfToken` is unchanged.

I did not apply the review's "skip when there is no `Origin` or `Sec-Fetch-Site`" heuristic. Older Safari sends neither on a same-origin GET, so it would stop the classic console's priming. Spec case 11 asserts both sides of the boundary, including that `/api/device/edit`, `/api/v2/device` and `/api/githooks` still mint.

### WR-05: CSRF rejections shown as wrong password / connection failed

**Status:** fixed: requires human verification (UI flow; needs a browser check under enforcement)
**Files modified:** `services/console/vue/src/utils/cookies.js`, `vue/src/pages/Login/Login.vue`, `vue/src/pages/PasswordReset/PasswordReset.vue`, `src/assets/thinx/csrf.js`, `src/assets/thinx/login.js`, `src/assets/thinx/password.js`
**Commit:** `00eef2f` (console)
**Applied fix:**
- **Vue:** Login.vue (login) and PasswordReset.vue (reset request and set password) show "Session security check failed. Reload the page and try again." for a rejection that is still there after the CR-01 retry. They also send a Rollbar `warning` with the route only, when `$rollbar` is enabled.
- **Classic:** new `Csrf.ajax()` in `csrf.js`. On `csrf_token_invalid` it re-primes and retries once, sending the server-echoed token. The caller's `success`, `error` and `complete` each fire once, for the final attempt only, so the submit button's in-flight state holds during the retry.
  - `login.js` (login, forgot password, register) and `password.js` (set password) use it and show the same message if the retry is also rejected. A `window.Rollbar` warning is sent when Rollbar is loaded.
  - The login error handler no longer throws a TypeError when `responseJSON` is missing.
  - Tested in a stubbed-jQuery harness: retry succeeds; persistent rejection gives exactly 1 retry, 1 `error` and 1 `complete`; a non-CSRF error is not retried.
- **Not changed:**
  - `OAuthReturn.vue`: its failure path always navigates to `/login`, so the message would never be seen. It does get the CR-01 retry.
  - Classic `auth.js` OAuth auto-login: it shows no user-facing error today.

### WR-07: OpenAPI spec does not mention the CSRF requirement

**Files modified:** `thinx-api-openapi.yaml`
**Commit:** `387e1e9f` (parent)
**Applied fix:** Added reusable `components.parameters` for the `X-XSRF-TOKEN` header and the `XSRF-TOKEN` cookie, a `components.responses.CsrfTokenInvalid` 403 response, a `CsrfTokenResponse` schema, and a `GET /csrf-token` path that lists every protected route. `POST /login`, `POST /password/reset` and `POST /password/set` reference them. The `/login` 403 now describes both meanings. The text points machine clients at Bearer or API-key auth. This is a documentation-only change; API behaviour is unchanged. The YAML parses with js-yaml and every component `$ref` resolves.

### WR-08: gulp prod bundle omits csrf.js

**Files modified:** `services/console/src/gulpfile.js`
**Commit:** `ca5a818` (console)
**Applied fix:** Added `assets/thinx/csrf.js` to the `prod` task's `bundle.min.js` list, directly before `assets/thinx/login.js`, in the same order as the dev `<script>` tags in `index.html`. Verified: `gulp prod` output `html/public/bundle.min.js` contains the Csrf module.

### WR-09: Runbook header/footer still say enforcement is OFF

**Files modified:** `.planning/runbooks/csp-csrf-hardening.md`
**Commit:** `e333cc00` (parent)
**Applied fix:** The header now says the flip was executed on 2026-09-25 at 09:02Z, with enforcement ON: Option A, `CSRF_ENFORCE=true`, persisted in swarm `thinx.yml` commit `bc6d04a`. It also says the gate was flipped early with the 08:35:09Z event still unexplained (likely CR-01), and points to Rollback. Other changes:
- The Live-state table is labelled as the pre-flip snapshot, and its `CSRF_ENFORCE` row is annotated.
- The gate verdict records the early flip.
- The stale "7 routes" note is replaced by the `POST /api/v2/user` exclusion (see WR-04).
- The footer is updated.

## Skipped Issues

### WR-04: `POST /api/v2/user` has no CSRF check

**File:** `lib/router.user.js:147-149`
**Reason:** Skipped on purpose, per the orchestrator's rule: protect it only if every legitimate caller sends the header. I checked the callers, and they do not all send it:
- **Vue console:** has no sign-up and never calls `POST /api/v2/user`. The only v2 user call is `DELETE /user` in `store/profile.js`.
- **Classic console:** signs up through `POST /api/user/create`, which is already protected, and its `$.ajaxSetup` sends the header.
- **Specs:** `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:46-48` posts to `/api/v2/user` with chai-http and no header or cookie. It passes today only because CI runs fail-open.
- **Published API:** `thinx-api-openapi.yaml` (`/user` POST, served at `/api/v2/spec`) documents the route as a public, unauthenticated registration endpoint. So non-browser integrations may call it, and enforcement is live in production.

Adding `csrf.verifyCsrfToken` would therefore break a documented non-browser contract as soon as it deploys. The runbook's protected-route list now says explicitly that v2 is not protected.
**Follow-up:** Decide whether v2 account creation must stay open to machine clients. If not, update the spec to prime, document the requirement in OpenAPI (the WR-07 components can be reused), and add the middleware.
**Original issue:** Both routes call the same `createUser()`, but only the v1 route has `csrf.verifyCsrfToken`, so v2 bypasses the account-creation protection.

### WR-06: Double-submit cookie on `.thinx.cloud` gives no same-site protection; session mutation routes unguarded

**File:** `lib/middleware/csrf.js:42-56,62-65`
**Reason:** Deferred as architectural, per the orchestrator's instruction. The finding asks for a different threat model, not a local fix:
- a signed token bound to the session, `HMAC(secret, random || session_id)`, rotated on login;
- rejecting cookie values that do not match the minted format;
- a less generic cookie name;
- extending `verifyCsrfToken` to the session-authenticated mutation routes (`POST /api/user/delete`, `DELETE /api/v2/user`, `POST /api/gdpr/revoke`, `POST /api/v2/profile`).

Each of these changes what enforcement accepts in production, and needs a staged rollout with coordinated client changes in both consoles (token format, name, rotation). A review-fix pass should not change them under live enforcement. The accepted residual risk stays as the review describes it. `SameSite=Lax` covers cross-site requests. A same-site attacker, meaning code on any `*.thinx.cloud` sibling host, can still read or plant the token, and double-submit does not stop that. This belongs in its own planned phase that designs, rolls out and verifies the session-bound token.
**Original issue:** Non-httpOnly token on the registrable domain, never validated for format, not bound to the session, never rotated. Session-cookie mutation routes have no token check, and the fail-open CORS reflection can serve `issueCsrfToken` to same-site origins.

## Verification

All gates below ran in the **main checkout**, after the fast-forward (`thinx-staging` at `e333cc00`, `services/console` `main` at `00eef2f`). The per-fix checks before each commit ran in the isolated worktrees, which have since been removed.

- **CSRF spec:** plain `npx jasmine spec/jasmine/ZZ-CSRFSpec.js` **cannot run locally**. `spec/support/jasmine.json` always loads `spec/helpers/bootstrap.js`, which boots the full THiNX stack (CouchDB, Redis, `/mnt/data/conf`), and it fails with `Config not found in /mnt/data/conf/config.json`. That limit was there before these fixes.
  - The spec is designed to run without services, so I ran it with the same spec files and no helpers: `ENVIRONMENT=development node node_modules/jasmine/bin/jasmine.js --config=<scratch config: ZZ-CSRFSpec.js + CookiePolicySpec.js, helpers: []>`.
  - Result: **28 specs, 0 failures** (ZZ-CSRFSpec 12, up from 6; CookiePolicySpec 16, which drives the real `cookieParser` → `ensureXsrfCookie` chain on a real Express app).
  - The full-stack ZZ-* suite, including `ZZ-AppSessionUserV2DeleteSpec`, was **not** run. It needs the swarm or CI services.
- **ESLint (API):** `npx eslint lib/middleware/csrf.js lib/middleware/cookie-policy.js thinx-core.js spec/jasmine/ZZ-CSRFSpec.js` gives no errors.
- **Vue console:** `cd services/console/vue && npm run build` completed with `DONE Build complete`. `vue-cli-service lint --no-fix` on the 6 changed files found no lint errors. `npm run test:csp:dist` passes (no inline JS, enforced script policy).
- **Legacy console:** `cd services/console/src && npm run build:test` (gulp dev) completed. The built `html/assets/thinx/{csrf,login,password}.js` pass `node -c`, and `Csrf.ajax` is wired in. ESLint on the three changed classic files is clean. `gulp prod` (in the worktree) produced a bundle that contains csrf.js (WR-08).
- **Not verified:** a real browser under production enforcement (cold Vue load of `/login`, `/password-reset`, `/oauth-return`; classic login, register and reset). This needs a deploy. The `console-retest` skill and the runbook's post-flip browser checks are the right next step.

---

_Fixed: 2026-09-25T09:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
