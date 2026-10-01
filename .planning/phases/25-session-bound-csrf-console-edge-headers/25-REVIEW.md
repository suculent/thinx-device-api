---
phase: 25-session-bound-csrf-console-edge-headers
reviewed: 2026-10-01T11:51:13Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - .circleci/config.yml
  - docker-swarm.yml
  - lib/middleware/csrf.js
  - lib/router.admin.js
  - lib/router.apikey.js
  - lib/router.auth.js
  - lib/router.env.js
  - lib/router.gdpr.js
  - lib/router.github.js
  - lib/router.google.js
  - lib/router.js
  - lib/router.profile.js
  - lib/router.rsakey.js
  - lib/router.transfer.js
  - lib/router.user.js
  - lib/thinx/establish_session.js
  - package.json
  - scripts/check-console-headers.js
  - scripts/console-live-headers.sh
  - scripts/csrf-live-probe.sh
  - scripts/csrf-obs-counters.js
  - spec/jasmine/CsrfRouteInventorySpec.js
  - spec/jasmine/CsrfSessionFlowSpec.js
  - spec/jasmine/ZZ-CSRFEnforceSpec.js
  - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
  - spec/jasmine/ZZ-CSRFSpec.js
  - spec/node/ConsoleHeaderParity.test.js
  - thinx-api-openapi.yaml
  - thinx-core.js
  - services/console/src/app/js/thinx-api.js
  - services/console/src/default.conf
  - services/console/src/package.json
  - services/console/src/test/xsrf-seam.cjs
  - services/console/vue/Dockerfile
  - services/console/vue/cypress/integration/oauth-return.spec.js
  - services/console/vue/default.conf
  - services/console/vue/src/App.vue
  - services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue
  - services/console/vue/src/store/auth.js
findings:
  critical: 2
  warning: 2
  info: 3
  total: 7
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-10-01T11:51:13Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

I reviewed the Phase 25 changes in the parent repo (`d1809041^..HEAD`) and the console submodule (`3c906ff^..HEAD`). The review covered the session-bound CSRF middleware, login regeneration, the D-09 exemption, route guards, the classic XSRF seam, the Vue OAuth re-prime, the nginx header mirrors and the parity gate.

The HMAC binding is sound:
- The MAC input is length-prefixed and compared with `timingSafeEqual`.
- The key is resolved once per process, with no random fallback.
- `assertReady()` fails closed in observe/signed when no key exists.
- The pre-session is written only by the priming GET.
- `establishSession` regenerates the session before it writes the owner.

Two exemption and bridge paths in `lib/router.js` undo much of that protection, both reachable from the same-site sibling-subdomain attacker this phase is meant to stop:

1. **CR-01 (introduced by this phase).** The D-09 API-key exemption trusts an `owner`/`api_key` pair in the form body. That pair can belong to anyone. The guarded handler then acts on the victim's cookie session.
2. **CR-02 (pre-existing, kept by D-09).** The Bearer bridge writes `owner` into whatever session the request's cookie names. A tossed session cookie therefore gets promoted to the victim's identity after login. The new comment at `router.js:91-92` says "for this request only", and that claim is false.

The parity gate passes a CSP that has lost `always`, which would silently remove the CSP from proxied 4xx/5xx responses. Signed mode also still requires cookie == header, so cookie tossing remains a permanent per-browser DoS.

Not re-reported (already listed in 25-10-SUMMARY follow-ups):
- duplicate helmet/nginx headers on proxied responses
- SEC-CSP-05 `unsafe-eval`
- the legacy branch retirement
- Tier 3 routes
- `/nginx_status`
- the single-flight `force` issue
- console CI hitting production

## Critical Issues

### CR-01: An attacker's API key in the form body exempts a victim's cookie session from every CSRF guard

**File:** `lib/router.js:175-194`, `lib/middleware/csrf.js:409`
**Issue:** The global middleware treats any POST whose body has `owner` + `api_key` as API-key authenticated. It verifies the pair against **the body's owner** (`apikey.verify(sanitka.owner(xowner), …)`) and on success sets `req.thx_auth = "apikey"`. `verifyCsrfToken` then returns `next()` with no token check. It never changes `req.session.owner`.

Every guarded handler reads the identity from the cookie session:
- `setProfile` uses `sanitka.owner(req.session.owner)` (`router.profile.js:31-33`).
- So do `setAPIKey`/`revokeAPIKey` (`router.apikey.js:18-20,51-53`), `addEnvironmentVariable` (`router.env.js:39`), `requestTransfer` (`router.transfer.js:30-32`) and the GitHub token link (`router.github.js:283-287`).

`express.urlencoded({extended:true})` is mounted (`thinx-core.js:371-375`), so a plain HTML form can carry the pair. The session cookie is `SameSite=Lax`, and any `*.thinx.cloud` page is same-site, so the browser sends it.

Attack from a sibling subdomain:
1. Register a free account and create an API key.
2. Auto-submit `<form method=POST action="https://rtm.thinx.cloud/api/v2/profile">` with `owner=<attacker owner>&api_key=<attacker key>&reset_key=<chosen>`.
3. `Owner.process_update` accepts `reset_key` (`lib/thinx/owner.js:397-400`), so the victim's reset key becomes attacker-chosen. `password_reset` looks users up by that key alone (`owner.js:496-498`), which turns this into account takeover.

The same body pair also:
- defeats the v1.13 guards: login CSRF on `POST /api/login`, `/api/user/create`, and the password routes
- adds environment secrets, creates or revokes API keys, revokes deploy keys and links a foreign GitHub token on the victim's account

This exemption did not exist before Phase 25 (the old `verifyCsrfToken` had none). It applies in every `CSRF_MODE`, so the documented `CSRF_MODE=legacy` rollback does not remove it. No spec covers a cookie session combined with a foreign API key (`ZZ-CSRFSpec.js` x2 tests the exemption only without a session).

**Fix:** Exempt an API-key request only when no cookie session is in play, or when the session already belongs to the same owner. Better still, stop accepting body credentials as a CSRF exemption at all (D-09 says "header"):
```js
// lib/router.js, API-key branch
apikey.verify(sanitka.owner(xowner), sanitka.udid(api_key), true, (vsuccess, vmessage) => {
  if (vsuccess) {
    const sessOwner = req.session && req.session.owner;
    // A body credential must never vouch for a different (cookie) identity.
    if (typeof sessOwner === "undefined" || sessOwner === sanitka.owner(xowner)) {
      req.thx_auth = "apikey";
    }
    next();
  } else { … }
});
```
Add a `ZZ-CSRFRouteGuardSpec` case: a logged-in cookie session posts `POST /api/v2/profile` with another account's valid `owner`/`api_key` as `application/x-www-form-urlencoded`, and the expected answer is 403 `csrf_token_invalid`. Separately, remove `reset_key` from the profile whitelist in `Owner.process_update`.

### CR-02: The Bearer bridge persists the JWT owner into whatever session the cookie names, so a tossed session cookie becomes an authenticated session

**File:** `lib/router.js:91-99`
**Issue:** On every verified Bearer request the bridge runs `req.session.owner = payload.username`, plus `impersonator_owner` when that claim is present. express-session saves this to Redis (`resave: true`, and the session is modified), so the write is **not** "for this request only" as the new comment claims. The Vue console sends Bearer **and** `credentials: 'include'` on every call (`services/console/vue/src/core/api.js:42,57`).

Attack from a sibling subdomain:
1. Prime `GET /api/csrf-token` to get a signed `x-thx-core` value for the attacker's own pre-session S_att, plus a token bound to it.
2. Plant `x-thx-core=<S_att>; Domain=.thinx.cloud; Path=/api/v2` in the victim's browser. A longer path is sent first, and express-session's `cookie.parse` keeps the first value.
3. The victim's next Vue API call writes `owner=<victim>` into S_att.
4. The attacker now holds a cookie session as the victim, with a valid bound token. `POST /api/v2/session/token` mints a JWT for the victim.

Login regeneration (SEC-CSRF-03) cannot help, because the promotion happens after login and needs no login. The same write also explains why every cookieless Bearer call creates a Redis session, which contradicts the D-02 "no session for non-priming requests" intent.

**Fix:** Keep the Bearer identity request-local, for example `req.thx_owner = payload.username`, and have `Util.validateSession` and handlers prefer it. Never write it into `req.session`. If a minimal change is needed now, refuse to write when the stored session is not already owned by the same user:
```js
if (req.session && req.session.owner && req.session.owner !== payload.username) {
  return res.status(401).end(); // cookie session and Bearer disagree
}
if (!req.session.owner) {
  // do not promote an anonymous/pre-session to an owned one
  req.session = null; // express-session (unset: 'keep') then skips save
}
```
Also correct the comment at `router.js:91-92`.

## Warnings

### WR-01: The parity gate accepts a CSP that has lost `always`, which removes the CSP from every proxied 4xx/5xx response

**File:** `scripts/check-console-headers.js:338-340, 414-419`
**Issue:** An `always` mismatch is only a `WARN` and never fails. D-19 is now implemented as `proxy_hide_header Content-Security-Policy` in every proxy location plus the server-level CSP. Without `always`, nginx adds that CSP only to 2xx/3xx responses, so API 401/403 (`csrf_token_invalid`)/404/500 responses through the console hosts would carry **zero** CSP, and the CI gate stays green.

Reproduced locally: copy `console-default.conf.prod` with `always` dropped from the CSP line, then run `node scripts/check-console-headers.js --live <copy>`. The output is `WARN always … content-security-policy`, then `HEADER-PARITY OK files=5`, rc=0. The same applies to XPCDP, Referrer-Policy and Permissions-Policy, which D-14 made `always`.

**Fix:** Treat a missing `always` as a failure for headers that need it. At minimum:
```js
const MUST_ALWAYS = new Set(["content-security-policy", "x-permitted-cross-domain-policies",
  "referrer-policy", "permissions-policy", "strict-transport-security"]);
// in parse(): for each server-level header in MUST_ALWAYS without `always`
problems.push({ type: "NOT-ALWAYS", line, detail: name });
```
Add a `node:test` case for it.

### WR-02: Signed mode still requires cookie == header, so a tossed `XSRF-TOKEN` causes a permanent 403 and a re-mint on every request

**File:** `lib/middleware/csrf.js:259-266, 280-284, 411-426`
**Issue:** In signed mode the binding to the httpOnly session is what proves authenticity, but `verifyCsrfToken` still requires the cookie and header to be byte-equal first. A sibling can plant `XSRF-TOKEN=x; Domain=.thinx.cloud; Path=/api`. The browser then sends it ahead of the real cookie, cookie-parser keeps it, and the console sends the real value from `document.cookie` (a `Path=/api` cookie is not visible there).

The result:
- Every guarded call fails with `value_mismatch`.
- `ensureXsrfCookie` sees an unbound cookie and re-mints on every request.
- `setBound` clears only the host-only `Path=/` variant (`res.clearCookie(XSRF_COOKIE_NAME, { path: "/" })`), so it never removes the planted cookie.

The user stays locked out until they clear their cookies. The phase stops planted cookies from *passing*, but this DoS from the same capability remains.

**Fix:** In `signed` mode, verify the header alone against the session (`check(headerVal, req.sessionID)`). The cookie is then only a delivery channel for console JS, so a planted cookie cannot cause a mismatch. Keep the equality check for `legacy`/`observe`:
```js
if (mode() === "signed" && typeof headerVal === "string" && headerVal.length > 0) {
  return verifyBinding(req, res, next, headerVal);
}
```

## Info

### IN-01: The OpenAPI registration note contradicts itself and the code

**File:** `thinx-api-openapi.yaml` (`/user` POST description, around the "Registration has no machine-client exemption" line)
**Issue:** The note says registration has "no machine-client exemption: prime with `GET /csrf-token` first", then repeats the shared note that "Bearer (JWT) and API-key calls are exempt". Because of CR-01, any POST with a valid body `owner`/`api_key` pair skips the guard on `POST /api/v2/user`, so the 2026-09-25 decision is not enforced.
**Fix:** Resolve CR-01, then drop the shared exemption sentence from the `/user` POST description, or qualify it.

### IN-02: `CSRF_SECRET` is accepted at any length

**File:** `lib/middleware/csrf.js:101-105`
**Issue:** Any non-empty `CSRF_SECRET` becomes the HMAC key, including a one-character placeholder or a value set through the env fallback by mistake. The env path is also not trimmed, while the file path is (`secrets.js:33-35`), so the same secret delivered two ways can give different keys.
**Fix:** In `resolveKey()`, require at least 32 bytes, for example `/^[0-9a-f]{64}$/i` as provisioned in Phase 24, and trim. Otherwise fall through to HKDF, or let `assertReady()` throw.

### IN-03: The Bearer bridge comment states the opposite of what the code does

**File:** `lib/router.js:91-92`
**Issue:** "copies the owner into the session for this request only" is wrong (see CR-02): the owner is persisted to Redis under the cookie's session id. A wrong comment on a security boundary misleads future reviewers.
**Fix:** Correct the comment, or make it true by fixing CR-02.

---

_Reviewed: 2026-10-01T11:51:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
