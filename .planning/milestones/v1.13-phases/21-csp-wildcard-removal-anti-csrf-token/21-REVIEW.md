---
phase: 21-csp-wildcard-removal-anti-csrf-token
reviewed: 2026-09-25T09:22:25Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - lib/middleware/csrf.js
  - lib/router.auth.js
  - lib/router.js
  - lib/router.user.js
  - thinx-core.js
  - conf/config-localhost.json
  - conf/config-sample.json
  - spec/jasmine/ZZ-CSRFSpec.js
  - spec/mnt/data/conf/config.json
  - services/console/src/app/js/thinx-api.js
  - services/console/src/assets/thinx/auth.js
  - services/console/src/assets/thinx/csrf.js
  - services/console/src/auth.html
  - services/console/src/index.html
  - services/console/src/password.html
  - services/console/src/default.conf
  - services/console/vue/default.conf
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/Login/Login.vue
  - services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue
  - services/console/vue/src/pages/PasswordReset/PasswordReset.vue
  - services/console/vue/src/utils/cookies.js
  - .planning/runbooks/swarm-configs/console-default.conf.prod
  - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx
  - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx
  - .planning/runbooks/csp-csrf-hardening.md
findings:
  critical: 1
  warning: 9
  info: 6
  total: 16
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-09-25T09:22:25Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The review covered the double-submit CSRF middleware (`lib/middleware/csrf.js`), the routes it guards, where it is mounted in `thinx-core.js`, and its client wiring in both consoles (classic jQuery pages and Vue). It also covered the nginx CSP configs and the enforce-flip runbook. Enforcement has been live in production since 2026-09-25 09:02Z, so the double-submit path got the most attention.

The server-side comparison in `verifyCsrfToken` is correct. It checks both values are non-empty strings, checks the lengths match, and compares with `timingSafeEqual`, catching the byte-length mismatch that can throw. `cookie-parser` and the client `getCookie` regexes both take the **first** duplicate cookie (verified: `cookie.parse("XSRF-TOKEN=first; XSRF-TOKEN=second")` returns `first`). The cookie's Domain, Path and name have not changed across the two commits of `csrf.js`, so no stale cookie variants from this codebase are left in browsers.

The main defect is on the client. **Every cold Vue load of `/login`, `/password-reset` or `/oauth-return` sends two cookieless priming GETs at once**, and the server mints a different token for each. The next protected POST can then send the token from one response in its header and the token from the other in its cookie. This is the most likely cause of the unexplained 08:35:09Z `POST /api/v2/session/token` mismatch (CR-01). Under enforcement it can also fail the Vue OAuth-return login.

Other findings: the cookie Domain is derived from `api_url` and throws on common misconfigurations, which would take down every request that has no cookie. A token is minted on every device, webhook and preflight request. `POST /api/v2/user` has no CSRF check. CSRF rejections reach users as "wrong password" or "Connection failed". The runbook header still says enforcement is OFF.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Concurrent cold-prime requests mint divergent XSRF tokens, so header and cookie can disagree (likely cause of the 08:35:09Z session/token mismatch)

**File:** `services/console/vue/src/pages/Login/Login.vue:218-228`, `services/console/vue/src/pages/PasswordReset/PasswordReset.vue:189-197`, `services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue:89-94,200-204`, with `lib/middleware/csrf.js:42-56` and caller `services/console/vue/src/store/auth.js:77-78`

**Issue:** `ensureXsrfCookie` has no state. Every request that arrives without an `XSRF-TOKEN` cookie mints a **new** random token and sends a `Set-Cookie`. The Vue console has four separate priming paths, and none of them is single-flighted against the others:

1. `App.vue:37` → `store/auth.js hydrateSession()` → `if (!getCookie("XSRF-TOKEN")) await $get('/csrf-token')`. This runs on **every** route, including the public ones.
2. `Login.vue` `created()` sends its own fire-and-forget `GET /csrf-token` (it never checks whether the cookie is already there), then calls `hydrateSession()`.
3. `PasswordReset.vue` `created()` sends another fire-and-forget GET.
4. `OAuthReturn.vue` `created()` awaits its own GET, then POSTs `/login` straight away.

On a cold load of `/#/login` (no XSRF cookie, for example after a browser restart, since the cookie has no Max-Age while `x-thx-core` persists for 1h), path 1 and path 2 both go out **without a cookie**. The server mints token A for one and token B for the other, and the browser's cookie jar ends up with whichever `Set-Cookie` it processes last. `hydrateSession` reads `document.cookie` in `Api.composeHeaders()` as soon as its own GET resolves. The browser attaches the Cookie header later, when it actually dispatches the fetch. If the other GET's `Set-Cookie` arrives between those two moments, the POST goes out with `X-XSRF-TOKEN: A` and `Cookie: XSRF-TOKEN=B`, a mismatch.

Each POST that runs after the jar has settled (the human-typed login) reads the final value and matches. That fits the observed pattern exactly: **one** `session/token` warning, no `/login` warning, and a reload two minutes later (with the cookie already present) that was clean. It also explains the duplicate GET and session/token pairs seen on Vue cold load. `hydratePromise` is set back to `null` in `finally`, so when `Login.vue` calls `hydrateSession()` after App's call has settled, it starts a second POST.

With enforcement on:
- `/#/oauth-return` has the same race between App's hydrate GET and OAuthReturn's awaited GET. The loser is `POST /api/v2/login`, which gets a 403, so **the OAuth login fails** and the user has to repeat the provider flow.
- `session/token` gets a 403 and the user is sent to `/login` (a forced logout on reload).

A second, less likely candidate produces the same log line: `getCookie` reads `document.cookie` right after the priming fetch resolves. If the renderer's view of the cookie is briefly stale, the header is sent as `""` while the network layer attaches the new cookie. The fix below covers both cases.

**Fix:** Keep one module-level prime promise, fall back to the token in the response body, and retry once on `csrf_token_invalid`:
```js
// vue/src/utils/cookies.js
let primePromise = null;
export function ensureCsrfToken(apiBase) {
  const existing = getCookie("XSRF-TOKEN");
  if (existing) return Promise.resolve(existing);
  if (!primePromise) {
    primePromise = fetch(apiBase + "/csrf-token", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => getCookie("XSRF-TOKEN") || (b && b.csrf_token) || "")
      .catch(() => "")
      .finally(() => { primePromise = null; });
  }
  return primePromise;
}
```
- Use `ensureCsrfToken` in `store/auth.js hydrateSession`, `OAuthReturn.vue`, `PasswordReset.vue` and `Login.vue`. Remove the separate fire-and-forget fetches in `Login.vue` and `PasswordReset.vue`, because `App.vue`'s hydrate already primes.
- Send the header from the value `ensureCsrfToken` resolves to, not from a separate `document.cookie` read.
- In `Api.request` (and in the raw `fetch` calls in `Login.vue` and `OAuthReturn.vue`): on `403` with `response === "csrf_token_invalid"`, read the cookie again and retry once.
- Server-side, WR-01 adds the logging needed to confirm the cause.

## Warnings

### WR-01: The fail-open log line cannot tell apart the failure modes needed to diagnose mismatches

**File:** `lib/middleware/csrf.js:68-90`
**Issue:** Every failure logs the same string, `CSRF token missing/mismatched for POST <url>`. It does not say whether the cookie was missing, the header was missing or empty, the values differed, or the raw `Cookie` header held **more than one** `XSRF-TOKEN` (cookie-parser silently keeps the first). That is why the 08:35:09Z event cannot be classified after the fact. Enforce mode logs nothing (a known issue), so there is no signal at all now. Duplicate cookies with a different Domain or Path, which is the classic source of a permanent per-browser mismatch, go completely unnoticed.
**Fix:** Log a reason code in both modes, with tokens redacted, and rate-limit the log if needed:
```js
const raw = req.headers.cookie || "";
const dupes = (raw.match(/(?:^|;\s*)XSRF-TOKEN=/g) || []).length;
const reason = !cookieVal ? "no_cookie" : !headerVal ? "no_header"
  : (dupes > 1 ? "duplicate_cookie" : "mismatch");
console.warn(`⚠️ [warning] CSRF ${reason} (cookies=${dupes}) ${req.method} ${req.originalUrl} origin=${req.headers.origin || "-"} enforced=${isEnforced()}`);
```

### WR-02: Deriving the cookie Domain from `api_url` throws on a port, path or trailing slash, which would 500 every request that has no cookie

**File:** `lib/middleware/csrf.js:26-31,46-52` (same logic duplicated in `thinx-core.js:320-323`)
**Issue:** `shortDomain()` splits the full URL on `.` and drops the first label. Verified against the `cookie` module Express uses:
- `https://app.thinx.cloud/` gives `.thinx.cloud/`, and `https://app.thinx.cloud:7443` gives `.thinx.cloud:7443`. Both make `res.cookie` throw `TypeError: option domain is invalid`. `ensureXsrfCookie` is mounted globally and calls this on **every** cookieless request, so all device, webhook and health-check traffic (none of which sends cookies) would return 500. Before this phase the same bad value only broke login, because express-session only sets its cookie on login (`saveUninitialized: false`).
- A two-label host (`https://thinx.cloud`) gives `Domain=.cloud`, which browsers reject as a public suffix. The cookie is never stored, so every login is rejected under enforcement.
- A deeper host (`https://api.eu.thinx.cloud`) gives `.eu.thinx.cloud`, which the console on `console.thinx.cloud` cannot read, with the same result.

The value is also recomputed on every request instead of being validated once at startup.
**Fix:** Parse the value once at startup with `new URL(app_config.api_url).hostname`. Derive the registrable parent explicitly or take it from config (`cookie_domain`). Check it against `/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/i` and **fail at startup** with a clear error rather than per request. Share the result with `thinx-core.js` and `oauth_return.js cookieDomain()` so there is one implementation, not three.

### WR-03: A new token and `Set-Cookie` go out on every cookieless request: device, firmware, webhook, health-check and CORS preflight

**File:** `thinx-core.js:351-355`, `lib/middleware/csrf.js:42-56`
**Issue:** `app.use(csrf.ensureXsrfCookie)` runs before `router.js` short-circuits `Origin: device`, before `/device/*` and `/githook`, and before the `OPTIONS` early return. Every device check-in, firmware request, webhook, uptime probe and preflight therefore gets a 48-hex `Set-Cookie` with `Domain=.thinx.cloud`. That contradicts the comment at `router.js:129-130` ("Device API calls ... carry no CORS/CSRF machinery by design"). It also adds response header bytes for constrained ESP8266 and ESP32 HTTP clients with small header buffers. Preflights are sent without cookies by specification, so every Vue cross-origin POST triggers a mint that browsers are expected to ignore. Any user agent that stored it would rotate the token while a request was in flight. Minting without restriction is also what makes CR-01 possible.
**Fix:** Only mint where a browser can use the token. Skip `OPTIONS`, `Origin: device`, `/device/`, `/githook`, `/api/githook`, and requests without an `Origin` or `Sec-Fetch-Site` header. Alternatively, mint only in `issueCsrfToken` (the priming endpoint) plus the protected-route middleware, and have both clients always prime through the single-flight path from CR-01.

### WR-04: `POST /api/v2/user` creates accounts without the CSRF check that `/api/user/create` now has

**File:** `lib/router.user.js:147-149` (compare with `:194-196`)
**Issue:** Both routes call the same `createUser()` handler, but only the v1 route has `csrf.verifyCsrfToken`. Anyone who needs to bypass the account-creation protection just uses the v2 path. The runbook's "Protected routes (8)" list and the phase claim ("account create/reset/set POSTs") are therefore wrong.
**Fix:**
```js
app.post("/api/v2/user", csrf.verifyCsrfToken, function (req, res) {
    createUser(req, res);
});
```
Add the route to the runbook list and to `ZZ-CSRFSpec`, or document why v2 is deliberately excluded.

### WR-05: Users see CSRF rejections as "Invalid username or password" or "Connection failed", with no recovery

**File:** `services/console/vue/src/pages/Login/Login.vue:193-198`, `services/console/src/assets/thinx/login.js:110-124` (caller of `csrf.js`)
**Issue:** An enforced rejection returns `403 {"success":false,"response":"csrf_token_invalid"}`. `Login.vue` only looks at `payload.message`, so it shows **"Invalid username or password"**. Classic `login.js` falls through to **"Connection failed"**. Enforce mode writes no server log. So a cookie or header problem looks to the user like a wrong password. They will retry or start a password reset, which is also CSRF-protected and fails the same way. Nobody re-primes or retries.
**Fix:** In both consoles, when the 403 is `csrf_token_invalid`, force a re-prime (for example `ensureCsrfToken` from CR-01 after clearing the cached promise) and retry once automatically. If the retry also fails, show a specific message such as "Session security check failed. Reload the page", and send a Rollbar event so it can be seen without server logs.

### WR-06: A double-submit cookie scoped to `.thinx.cloud` gives no protection against same-site attackers, and the phase covers only login and account routes

**File:** `lib/middleware/csrf.js:42-56,62-65`
**Issue:** The token is a non-httpOnly cookie on the registrable domain, and its format is never validated. Any code on a sibling subdomain (Swarmpit, registry, landing page, or any future `*.thinx.cloud` host) can therefore:
- read it;
- plant a known value ("cookie tossing"; `ensureXsrfCookie` accepts any existing non-empty value forever);
- plant a longer-path variant that cookie-parser prefers.

`SameSite=Lax` already blocks the cross-site case for session-authenticated routes. Same-site is the case Lax does not cover, and double-submit does not cover it either. The token is also not bound to the session and is never rotated on login or logout. The session-cookie state-changing routes (`POST /api/user/delete`, `DELETE /api/v2/user`, `POST /api/gdpr/revoke`, `POST /api/v2/profile`) have no token check, and `issueCsrfToken` returns the token in a body that the fail-open CORS reflection (`cors.js:37-41`) will serve to any same-site origin that is not allowlisted. A foreign `XSRF-TOKEN` cookie set by another framework on the same domain (Laravel, Spring and AngularJS all use that name) would also be adopted permanently.
**Fix:** Change to a signed token: `HMAC(session_secret, random || session_id)`, validated server-side, and reject cookie values that do not match `/^[0-9a-f]{48}$/`, re-minting them. Rotate the token on login. Extend `verifyCsrfToken` to the session-authenticated mutation routes, or document that accepted risk explicitly in the runbook. Consider a less generic cookie name (for example `thx-xsrf`) to avoid collisions.

### WR-07: Enforcement breaks non-browser API clients of `POST /login`, and the published OpenAPI spec does not mention it

**File:** `lib/router.auth.js:350,369`; `thinx-api-openapi.yaml:522-546` (served at `/api/v2/spec`)
**Issue:** `POST /api/login` and `/api/v2/login` now return `403 csrf_token_invalid` unless the caller first GETs `/csrf-token`, keeps the cookie and echoes it back in a header. Scripts, CLIs and integrations that log in with username and password stopped working at 09:02Z. The OpenAPI document still describes `/login` as a plain JSON POST, with a 403 that means only "Authentication failed".
**Fix:** Document the `X-XSRF-TOKEN` header, the `XSRF-TOKEN` cookie, the `/csrf-token` priming endpoint and the `csrf_token_invalid` 403 in the spec. Point machine clients at the API-key or Bearer flows. Consider exempting requests that have neither an `Origin` nor a `Sec-Fetch-Site` header (browsers always send one of them on cross-origin POSTs) if non-browser login is meant to stay supported.

### WR-08: The gulp `prod` (bundle) build leaves `csrf.js` out, so the classic login would lose all CSRF wiring

**File:** `services/console/src/index.html:258-267` with `services/console/src/gulpfile.js:219-232`
**Issue:** `index.html` loads `assets/thinx/csrf.js` only inside `<!--removeIf(bundle)-->`. The `prod` task's `bundle.min.js` source list includes `assets/thinx/login.js` but not `csrf.js`. A `buildAll` / `gulp prod` build would therefore ship a login page that never primes and never sends `X-XSRF-TOKEN`. With enforcement on, every classic login, registration and password reset would be rejected. Production currently uses `gulp dev`, so the bug is latent, but switching to the bundle build is a single command away.
**Fix:** Add `'assets/thinx/csrf.js'` to the `prod` bundle list before `'assets/thinx/login.js'`, or move the `csrf.js` `<script>` tag outside the `removeIf(bundle)` block.

### WR-09: The runbook's status header and footer still say enforcement is OFF and the flip has not been executed

**File:** `.planning/runbooks/csp-csrf-hardening.md:12-13` and the final line; "Gate status" section
**Issue:** The document opens with "**Status (2026-09-25): written, not executed.** Enforcement is OFF" and ends with "Flip not yet executed". The Execution Annex records the flip at 09:02:03Z with the change persisted in `thinx.yml` (`bc6d04a`). An operator who reads only the header during an incident will assume fail-open, go looking for the wrong cause of 403s, and may skip the rollback. The "Live state" table (`CSRF_ENFORCE not set`) is equally out of date.
**Fix:** Change the header to "Executed 2026-09-25 09:02Z, enforcement ON (Option A, `CSRF_ENFORCE=true`, persisted in thinx.yml `bc6d04a`). Gate flipped early; 08:35:09Z event unexplained (see 21-REVIEW CR-01)". Mark the Live-state table as pre-flip and update the footer.

## Info

### IN-01: `csrf.js` and `thinx-core.js` comments are out of date or misleading

**File:** `lib/middleware/csrf.js:39-41,67`; `thinx-core.js:349-352`
**Issue:** The comments say the middleware "refreshes/mints ... on every request", but it never refreshes an existing cookie. They say "the 7 protected ... routes", but there are 8, and 9 if WR-04 is fixed. They also say "nothing else reads req.cookies", which is no longer checked by anything.
**Fix:** Say "mints only when absent; never rotates" and list the protected routes by name, or stop hard-coding the count.

### IN-02: `CSRF_ENFORCE` only accepts the exact string `'true'`, and the effective mode is never logged

**File:** `lib/middleware/csrf.js:33-37`
**Issue:** `CSRF_ENFORCE=TRUE`, `=1` or `="true "` silently fall back to fail-open. Enforce mode writes nothing, so the only way to confirm the mode is `docker service inspect`.
**Fix:** Normalise the value (`/^(1|true|yes)$/i.test(String(v).trim())`) and log the effective mode once at startup, for example `ℹ️ [info] CSRF enforcement: ON (env)`.

### IN-03: The hidden `_csrf` form fields are never read by the server

**File:** `services/console/src/index.html:72,141,167`, `auth.html:48`, `password.html:47`; `services/console/src/assets/thinx/csrf.js:12-14`
**Issue:** `verifyCsrfToken` only reads the `X-XSRF-TOKEN` header. The `_csrf` inputs, and `syncHiddenFields` which fills them, are dead code that suggests protection which does not exist. It could mislead someone into thinking a native form POST is protected.
**Fix:** Remove them, or have `verifyCsrfToken` also accept `req.body._csrf` for form posts and state that in a comment.

### IN-04: `Thinx.checkToken` would POST `/login` without the CSRF header

**File:** `services/console/src/app/js/thinx-api.js:155-157,1313-1323`
**Issue:** This is dead code (no callers). The `/app/` page does not load `csrf.js`, so if it is ever revived under enforcement it will always get a 403.
**Fix:** Delete it, or load `csrf.js` on the app shell and document the dependency.

### IN-05: Spec gaps: no attribute assertions, no real-stack enforce test, and brittle env and console handling

**File:** `spec/jasmine/ZZ-CSRFSpec.js:78-100,131-151,65-67`
**Issue:**
- Test 5 does not check the `domain`, `path` or `secure` attributes. WR-02 would have been caught if it did.
- Nothing exercises the real `cookieParser` → `ensureXsrfCookie` → route chain in enforce mode.
- Test 2 only restores `console.log` inside `next`, so a regression that skips `next` leaves `console.log` replaced for every later spec.
- `afterEach` deletes `CSRF_ENFORCE` instead of restoring a pre-existing value.
- The cases "cookie missing, header present" and "equal length but different bytes" are not covered.

**Fix:** Add those cases. Wrap the console override in `try/finally`. Save and restore `process.env.CSRF_ENFORCE`. Add one supertest-style spec against `thx.app` with `CSRF_ENFORCE=true` that primes, then logs in.

### IN-06: The live production nginx config has weaker headers than the image configs, and serves `'unsafe-eval'` to the Vue host

**File:** `.planning/runbooks/swarm-configs/console-default.conf.prod:17-20`
**Issue:** The config divergence itself is documented. However, this gluster file is the one actually served on both `rtm` and `console`, and it sends `X-Permitted-Cross-Domain-Policies: all` (the images send `none`), omits `Referrer-Policy` and `Permissions-Policy`, and gives `script-src 'unsafe-eval'` to the Vue host. The Vue image config (`vue/default.conf`) deliberately drops `'unsafe-eval'`. Most `add_header` lines also lack `always`, so error responses carry no security headers.
**Fix:** When the gluster file is next edited, set `X-Permitted-Cross-Domain-Policies "none"`, add `Referrer-Policy` and `Permissions-Policy` with `always`, and consider a separate mounted file for `thinx_vue` without `'unsafe-eval'`.

---

_Reviewed: 2026-09-25T09:22:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
