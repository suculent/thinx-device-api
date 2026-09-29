# Phase 25: Session-Bound CSRF + Console Edge Headers - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 22 (incl. route-file groups)
**Analogs found:** 21 / 22

All analog paths verified git-tracked (parent repo, or `services/console` submodule via `git ls-files` inside it).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/middleware/csrf.js` (rework: modes, module-scope key, mint/check/rotate/clear, exemption) | middleware | request-response | itself (lines 1-144) + `lib/thinx/secrets.js` | exact (in-place) |
| `lib/thinx/establish_session.js` (new, or inline in router.auth.js) | utility | request-response | `lib/router.auth.js` login blocks L67-110, L321-331 | role-match |
| `lib/router.auth.js` (regenerate in `loginAction` + `performTokenLogin`; clear XSRF on logout) | controller | request-response | itself | exact |
| `lib/router.js` (`req.thx_auth` on verified Bearer / API key) | middleware | request-response | itself L91-117, L170-185 | exact |
| `lib/router.google.js` (drop L163 `req.session.owner` write) | controller | request-response | itself | exact |
| `lib/router.{user,profile,gdpr,apikey,rsakey,env,github,admin,transfer}.js` (add `csrf.verifyCsrfToken`) | route | request-response | `lib/router.user.js` L13 + L156 | exact |
| `thinx-core.js` (call `csrf.assertReady()` before routers) | config/bootstrap | — | `thinx-core.js` L349-353 | exact |
| `thinx-api-openapi.yaml` (D-12 notes + refs) | config/docs | — | its own `components` L515-577 | exact |
| `scripts/check-console-headers.js` (new) | utility / CI gate | file-I/O, transform | `scripts/privacy-policy-check.js` | role-match |
| `spec/node/ConsoleHeaderParity.test.js` (new) | test | file-I/O | `spec/node/StaticCsp.test.js` | exact |
| `spec/jasmine/ZZ-CSRFSpec.js` (legacy cases pinned + signed twins) | test | unit | itself | exact |
| `spec/jasmine/CsrfSessionFlowSpec.js` (new, local) | test | request-response | `spec/jasmine/CookiePolicySpec.js` L23-58 | exact |
| `spec/jasmine/ZZ-CSRFEnforceSpec.js` (new, CI) | test | request-response | `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js` | role-match |
| `.circleci/config.yml` (parity step) | config | batch | L665-672 "Fetch all submodules and tests" | exact |
| `package.json` (`check:headers` script) | config | — | `package.json:23` `"privacy-check"` | exact |
| `services/console/src/app/js/thinx-api.js` (D-18 `$.ajaxSetup` seam) | component (browser) | request-response | `services/console/src/assets/thinx/csrf.js` L111-120 | exact |
| `services/console/src/default.conf` | config (nginx) | — | `.planning/runbooks/swarm-configs/console-default.conf.prod` L11-20 | exact |
| `services/console/vue/default.conf` | config (nginx) | — | same | exact |
| `.planning/runbooks/swarm-configs/console-default.conf.prod`, `rtm.thinx.cloud-server.post.nginx` | config snapshot | — | themselves | exact |
| gluster `/mnt/gluster/deployment/swarm/console/default.conf` (live, not in repo) | config (nginx) | — | `console-default.conf.prod` (verbatim copy) | exact |
| `.planning/runbooks/csp-csrf-hardening.md`, `console-csp-source-of-truth.md` | docs | — | themselves | exact |
| `proxy_hide_header` in proxy locations (D-19) | config (nginx) | — | none in repo | no analog |

## Pattern Assignments

### `lib/middleware/csrf.js` (middleware, request-response)

**Analog:** itself. Keep structure: module-level constants (L15-21), factory `module.exports = function (_app) {...}` (L23), returned object (L139-143). Put `resolveKey()`/`mint()`/`check()` and the key memo ABOVE L23 (module scope, D-04), since the factory is instantiated 3x (`thinx-core.js:352`, `router.auth.js`, `router.user.js:13`).

**Imports** (L15-18) — add `const { readSecret } = require("../thinx/secrets");`:
```js
const crypto = require("crypto");
const Globals = require("../thinx/globals");
const Util = require("../thinx/util");
const CookiePolicy = require("./cookie-policy");
```

**Enforce gate** (L31-35) — keep unchanged; add sibling `mode()` reading `process.env.CSRF_MODE` per call (default `legacy`):
```js
function isEnforced() {
    if (process.env.CSRF_ENFORCE === 'true') return true;
    if ((typeof (app_config.debug) !== "undefined") && (app_config.debug.csrf_enforce === true)) return true;
    return false; // fail-open default
}
```

**Cookie options to reuse in `rotate()`/`setBound()`/`clear()`** (L57-63) — domain/path must match for `clearCookie`:
```js
res.cookie(XSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: req.secure === true,
    sameSite: 'lax',
    domain: cookie_domain,
    path: '/'
});
res.locals.xsrfToken = token;
```
Wrap in try/catch with `console.log("⚠️ [warning] ...")` like L65-68 (global middleware must never 500).

**Echo-order bug to fix in `issueCsrfToken`** (L78) — current order echoes stale cookie first; flip to `res.locals.xsrfToken || req.cookies[...]`:
```js
const token = (req.cookies && req.cookies[XSRF_COOKIE_NAME]) || res.locals.xsrfToken;
```

**Reason codes + log format** (L84-89, L125-136) — new binding codes (`missing`, `session_mismatch`, `stale`, `binding_mismatch`) follow the same `detail` construction; new log line distinct: `"⚠️ [warning] CSRF binding <observed|rejected> reason=… mode=… xsrf_cookies=… for METHOD route"`. 403 via:
```js
return Util.failureResponse(res, 403, "csrf_token_invalid");
```
Constant-time compare pattern (L113-121): length pre-check, then `crypto.timingSafeEqual` in try/catch. Reuse `xsrfCookieCount` (L94-98) for the Pitfall-5 duplicate-cookie clear, `routeOf` (L101-103) for logs.

**Key source:** `lib/thinx/secrets.js` `readSecret(name, default)` L20-44 — cached per name, file `/run/secrets/<name>` then env then null. HKDF fallback reads `node-session.json` with the CONFIG_ROOT rule of `thinx-core.js:90-96`. Expose `_resetForTests()` for the key memo; note `readSecret` also caches, so spec key-stability tests must set `CSRF_SECRET` env before first read (or clear require cache).

---

### `lib/router.auth.js` (controller, request-response)

**Password login seam** (current L321-331):
```js
if (rejectLogin(req, user_data, password, res)) return;
let maxAge;
if (typeof (req.session) !== "undefined") {
    req.session.owner = user_data.owner;
    SessionToken.markLogin(req.session, user_data.owner);
    if ((typeof (req.body.remember) === "undefined") || (req.body.remember === 0)) {
        maxAge = 8 * hour;
    } else {
        maxAge = fortnight;
    }
}
req.session.cookie.maxAge = maxAge;
alog.log(user_data.owner, "User logged in: " + username);
checkMqttKeyAndLogin(req, res, user_data);
```
Replace owner/markLogin with `establishSession(req, res, owner, cb)`; keep the maxAge + alog + `checkMqttKeyAndLogin` inside `cb`.

**Token login seam** (`performTokenLogin`, L67-72 in current file): `userlib.get(owner_id, (gerr, doc) => { req.session.owner = owner_id; SessionToken.markLogin(req.session, owner_id); ...` — wrap the body of this callback in `establishSession`; `gerr` branch (user.create) and else branch (24h/fortnight maxAge) run after regenerate.

**Error shape for regenerate failure** — copy the 503 from loginAction:
```js
console.log("[OID:0] [LOGIN_ERROR] user directory unavailable");
return Util.failureResponse(res, 503, "service_unavailable");
```

**Logout** (`logoutAction`, ~L259-273): add `csrf.clear(res)` before `res.redirect(app_config.public_url);`. Keep log style `console.log(\`ℹ️ [info] [OID:${owner}] ...\`)`.

---

### `lib/router.js` (middleware, request-response)

**Bearer success path** (L91-117): set `req.thx_auth = "bearer"` immediately before the final `next();` inside the `app.login.verify` → `redis_client.get("revoked:owner:"…)` callback (after the `ts` 401 check) — and also on the `rerr` fail-open `return next();` branch (auth itself succeeded). Must NOT call regenerate (SEC-CSRF-03).
```js
app.redis_client.get("revoked:owner:" + payload.username, (rerr, ts) => {
  if (rerr) { console.warn("⚠️ [warning] blacklist check failed", rerr); return next(); }
  if (ts) { const iatMs = (payload.iat || 0) * 1000; if (iatMs < parseInt(ts, 10)) { return res.status(401).end(); } }
  next();
});
```
**API-key path** (~L177-179): `if (vsuccess) { req.thx_auth = "apikey"; next(); }`.

---

### `lib/router.google.js` (controller)

L162-164 — remove the session write, log `userWrapper.owner` instead:
```js
console.log("Setting session owner from Google User Wrapper...");
req.session.owner = userWrapper.owner;
console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on UserWrapper /login");
```
Check lines ~111/113 log lines that read `req.session.owner` too.

---

### Route guards: `lib/router.{user,profile,gdpr,apikey,rsakey,env,github,admin,transfer}.js`

**Analog:** `lib/router.user.js`
Factory instantiation (L12-13):
```js
// SEC-CSRF-01: double-submit anti-CSRF token check for account create/reset/set POSTs.
const csrf = require("./middleware/csrf")(app);
```
Route middleware (L156):
```js
app.post("/api/v2/password/reset", csrf.verifyCsrfToken, function (req, res) {
    postPasswordReset(req, res);
});
```
Apply identically, e.g. `router.profile.js` L45 / L57:
```js
app.post("/api/v2/profile", csrf.verifyCsrfToken, function (req, res) { setProfile(req, res); });
app.post("/api/user/profile", csrf.verifyCsrfToken, function (req, res) { setProfile(req, res); });
```
Route list (Tier 1+2, D-21 excludes Tier 3): router.user.js:147 (POST /api/v2/user), :186 (DELETE /api/v2/user), :227 (POST /api/user/delete); router.gdpr.js:137,:141,:155,:165; router.profile.js:45,:57; router.apikey.js:70,75,89,94; router.rsakey.js:52,60,78; router.env.js:70,74,87,91; router.github.js:278; router.admin.js:84-86; router.transfer.js ~95-140. Note each factory call is cheap because key is module-scope. For admin routes placed after `requireAdmin`, insert `csrf.verifyCsrfToken` as another middleware arg.

---

### `thinx-core.js` (bootstrap)

L349-353 — add `csrf.assertReady()` right after instantiation, before `app.use`:
```js
// csrf.ensureXsrfCookie must run before all routers so the reactive
const csrf = require("./lib/middleware/csrf")(app);
app.use(csrf.ensureXsrfCookie);
```
Do not touch the dead `wsapp` session config (L449-464).

---

### `thinx-api-openapi.yaml` (docs)

Reuse existing `components.parameters.XsrfTokenHeader`, `XsrfTokenCookie`, `components.responses.CsrfTokenInvalid`, `schemas.CsrfTokenResponse` (L515-575) and `/csrf-token` path (L577). Copy the ref shape already used on the currently-guarded login/password operations onto `/user` post+delete (~L1360), `/profile` post (~L1660), `/gdpr` put/delete (~L1728), `/apikey`, `/rsakey`, `/env`, `/github/token`, `/transfer/*`. Update token description ("48 hex" → opaque `<hmac>.<nonce>`, session-bound). Verify: `node -e "require('js-yaml').load(require('fs').readFileSync('thinx-api-openapi.yaml','utf8'))"`.

---

### `scripts/check-console-headers.js` (CI gate, file-I/O + transform)

**Analog:** `scripts/privacy-policy-check.js` L1-30: `#!/usr/bin/env node`, JSDoc header describing purpose/usage/exit code, `"use strict";`, node built-ins only (`fs`, `path`), exported function for tests (`const { check } = require('./scripts/...')`) plus CLI run with non-zero exit on FAIL. Mirror that: export `parse()`, `normalise()`, `compare()`; `if (require.main === module)` runs CLI.
Inputs (D-20): `.planning/runbooks/swarm-configs/console-default.conf.prod` (canonical), `services/console/src/default.conf`, `services/console/vue/default.conf`, `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx`; optional `--live`. Exclude `pre.nginx`. Drop placeholders `__WEB_HOSTNAME__` (src) / `__NGINX_HOST__` (vue). Fail on any `add_header` inside `location`. Also must encode the D-19 rule (proxy locations carry `proxy_hide_header Content-Security-Policy`).

---

### `spec/node/ConsoleHeaderParity.test.js`

**Analog:** `spec/node/StaticCsp.test.js` L1-5:
```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
```
`test("...", () => { assert.equal/ok/match(...) })` style; path relative via `path.join(__dirname, "../../...")`. Not auto-run in CI — wire explicitly.

---

### `spec/jasmine/ZZ-CSRFSpec.js` (rewrite)

**Analog:** itself. Header comment enumerates numbered cases (L1-22) — extend the list with signed twins (1s/4s/5s/6s). Keep bootstrap-free setup (L24-35):
```js
if (typeof (process.env.ENVIRONMENT) === "undefined") { process.env.ENVIRONMENT = "development"; }
var expect = require('chai').expect;
const csrfFactory = require("../../lib/middleware/csrf");
const csrf = csrfFactory({});
```
Existing `mockRes()` (L37+) records `_cookieCalls`; mock `req` must gain `session: { csrf_pre: 1, cookie: {} }, sessionID: "sid-A"` for non-legacy cases. `afterEach`: delete `process.env.CSRF_MODE`, reset key memo.

---

### `spec/jasmine/CsrfSessionFlowSpec.js` (new, local)

**Analog:** `spec/jasmine/CookiePolicySpec.js` — header says "mount the real middleware on a bare express app, so they need neither Redis nor CouchDB" (L20-21). Imports L23-28 (`express`, `cookie-parser`, `express-session`, `http`, `chai`). `request(app, headers)` helper L31-53 (ephemeral `listen(0,"127.0.0.1")`, returns `setCookie` + parsed body, closes server) — extend with method/path/body params and manual cookie forwarding across steps; `cookieNamed(setCookie, name)` L55-57. Use default MemoryStore; count `store.sessions` for D-02.

---

### `spec/jasmine/ZZ-CSRFEnforceSpec.js` (new, CI)

**Analog:** `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js` L1-30:
```js
const bootstrap = require('../helpers/bootstrap');
const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const envi = require("../_envi.json");
...
beforeAll((done) => { thx = bootstrap.thx; ...
```
chai-http stays ^4.3.0 (`chai.request(thx.app)`, CommonJS). Set `process.env.CSRF_MODE="signed"`, `CSRF_ENFORCE="true"` in `beforeAll`, restore in `afterAll`; forward cookies manually with `.set("Cookie", …)` (Domain=.thinx.cloud won't replay to 127.0.0.1).

---

### `.circleci/config.yml` + `package.json`

Insert after L665-672:
```yaml
    - run:
        name: Fetch all submodules and tests
        command: |
          rm -rf ./package-lock.json
          git submodule foreach --recursive 'git submodule sync' && git submodule update --init --recursive
```
new step: `- run: { name: Console header parity, command: node scripts/check-console-headers.js && node --test spec/node/ConsoleHeaderParity.test.js }`. package.json: mirror `"privacy-check": "node scripts/privacy-policy-check.js"` (L23) with `"check:headers": "node scripts/check-console-headers.js"`. Land in the same parent commit as the submodule pointer bump carrying image edits.

---

### `services/console/src/app/js/thinx-api.js` (D-18 seam)

**Analog:** `services/console/src/assets/thinx/csrf.js` L111-120:
```js
$.ajaxSetup( {
  beforeSend: function( xhr ) {
    var token = Csrf.getCsrfCookie();
    if ( token ) {
      xhr.setRequestHeader( "X-XSRF-TOKEN", token );
    }
  }
} );
```
`Csrf` is NOT loaded in the dashboard, so inline the cookie read (`document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)` + `decodeURIComponent`). Place after the existing `$.ajaxSetup` block (thinx-api.js L4-15, jQuery-style spacing `( {` `} )`); `$.ajaxSetup` merges. Ship via console `thinx-staging` → pointer bump → deploy BEFORE any new API guard.

---

### `services/console/{src,vue}/default.conf` + snapshots + gluster

**Analog:** `.planning/runbooks/swarm-configs/console-default.conf.prod` L11-20 (server-level `add_header "Name" "value" [always];`). Image configs already have (src L19-21 / vue L20-22):
```nginx
add_header "X-Permitted-Cross-Domain-Policies" "none";
add_header "Referrer-Policy" "strict-origin-when-cross-origin" always;
add_header "Permissions-Policy" "camera=(), microphone=(), geolocation=()" always;
```
Target (all three files + post.nginx snapshot), after `X-Download-Options`:
```nginx
add_header "X-Permitted-Cross-Domain-Policies" "none" always;
add_header "Referrer-Policy" "strict-origin-when-cross-origin" always;
add_header "Permissions-Policy" "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;
```
Image CSPs must be widened to the prod CSP (prod L20: adds cloudfront `d37gvrvc0wt4s1`, `cdnjs.cloudflare.com`; Vue lacks app.thinx.cloud in default/script-src, rollbar cdn, gravatar, avatars) keeping `__WEB_HOSTNAME__` / `__NGINX_HOST__` placeholders. Gluster edit: in-place `cat > file` (keep inode), never `sed -i`.

## Shared Patterns

### Failure response
**Source:** `lib/thinx/util.js` `Util.failureResponse(res, code, msg)` (used csrf.js:136, router.auth.js login 503). Apply to all 403/503 paths.

### Logging
**Source:** csrf.js L131/L135, router.auth.js logout. Prefix `⚠️ [warning]`, `ℹ️ [info]`, `☣️ [error]`, `[OID:<owner>]`; never log token values or key.

### Per-route CSRF guard
**Source:** `lib/router.user.js` L13 + L156 — factory per router, middleware arg before handler.

### Env-driven mode switch
**Source:** csrf.js `isEnforced()` L31-35 — read `process.env.*` per call so specs toggle it.

### Secret resolution
**Source:** `lib/thinx/secrets.js` `readSecret` L20-44.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| gluster `proxy_hide_header Content-Security-Policy` in `/api/`, `/login`, `/logout`, `/device/`, websocket locations (D-19) | nginx config | — | No `proxy_hide_header` anywhere in repo configs; use nginx docs. Note: `proxy_hide_header` is not `add_header`, so it does not break server-level header inheritance. |
| `session.regenerate()` usage | — | — | Not used anywhere in `lib/` yet; follow RESEARCH Pattern 4 / Code Example 4 |

## Metadata

**Analog search scope:** `lib/`, `lib/middleware/`, `lib/thinx/`, `spec/jasmine/`, `spec/node/`, `scripts/`, `.circleci/`, `services/console/src`, `services/console/vue`, `.planning/runbooks/swarm-configs/`
**Files scanned:** ~20
**Pattern extraction date:** 2026-09-29
