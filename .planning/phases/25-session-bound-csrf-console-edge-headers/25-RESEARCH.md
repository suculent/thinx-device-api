# Phase 25: Session-Bound CSRF + Console Edge Headers - Research

**Researched:** 2026-09-29
**Domain:** Express 5 / express-session 1.19 + connect-redis 9 session binding, OWASP signed double-submit CSRF, two legacy/Vue consoles, nginx header hardening on a bind-mounted gluster file
**Confidence:** HIGH for code facts (every seam read at `thinx-staging` HEAD `2283e901`, console submodule `a5b0246`); HIGH for live state (read-only probes of production 2026-09-29); MEDIUM for two design recommendations that deviate from CONTEXT wording and need confirmation (see Open Questions 1 and 2)

## Summary

The milestone research left three questions open: the pre-auth binding, the rotation seams, and classic console behaviour after rotation. All three are now answered from source, and two of the answers change the plan's shape.

**Pre-session mechanics work with the installed stack and need no config change.** With `saveUninitialized:false`, express-session saves a new session only when its *data* changes. Its `hash()` ignores `cookie` (`express-session/index.js:611-620`), so the priming GET has to write a marker field, not just shorten `cookie.maxAge`. Setting `req.session.cookie.maxAge = 900000` on that request persists as `originalMaxAge`. `rolling:true` → `touch()` → `resetMaxAge()` then keeps a 15-minute *idle* TTL. connect-redis 9 derives the Redis `EX` from `cookie.expires` (`connect-redis.cjs` `getTTL`), so the store TTL follows. `req.session.regenerate()` builds a brand-new `Cookie` from the global 1 h options, and the login code then sets 8 h / 24 h / 14 d exactly as it does today. The second session config (`thinx-core.js:453-464`, `saveUninitialized:true`) belongs to `wsapp`, which is never attached to a server. It is dead code and does not affect CSRF.

**Rotation seams are fewer than feared.** Neither OAuth callback establishes a session. They redirect the browser with a one-shot token, and the console then POSTs `/login {token}` → `performTokenLogin`. Regeneration therefore belongs in exactly two functions: `loginAction` (password branch) and `performTokenLogin`. One stray write, `router.google.js:163` `req.session.owner = userWrapper.owner` on the new-user callback, persists an owner session without regeneration and should be removed. The Bearer bridge (`router.js:94`) and `session/token` (`session_token.js:68`) must not regenerate.

**Two findings conflict with CONTEXT wording and must be confirmed before planning locks.**
1. **Production already runs `CSRF_ENFORCE=true`**, verified on `thinx_api` 2026-09-29 and in place since 2026-09-25. D-06 ("deploy `CSRF_MODE=signed` fail-open") and D-07 ("flip `CSRF_ENFORCE`") cannot both be literal without turning v1.13 enforcement *off* for 24 h or more. The recommendation is an intermediate `CSRF_MODE=observe`: the double-submit check stays enforced, binding failures are only logged, and the flip becomes `CSRF_MODE=signed`.
2. **The classic dashboard sends no `X-XSRF-TOKEN` at all.** `assets/thinx/csrf.js` is loaded only on `index.html`, `auth.html` and `password.html`. The AngularJS dashboard (`app/`) posts through `app/js/thinx-api.js` with plain `$.ajax` and no header seam, and that includes `POST /user/delete`, which SEC-CSRF-05 names explicitly. Enforcing SEC-CSRF-05 therefore needs a small classic-console seam (same cookie and header, so the wire contract is unchanged). That is a console code change, which the CONTEXT line "no console CSRF code change" rules out.

Contrary to PITFALLS §3, the classic login, register, forgot and reset flows **do** retry once after a re-prime (`Csrf.ajax`, `assets/thinx/csrf.js:52-98`). Only the auth.html OAuth `/login` and `/gdpr` calls and the dashboard lack a retry.

**Primary recommendation:** Build the change as `lib/middleware/csrf.js` modes `legacy | observe | signed`, with a module-scope HKDF key, a pre-session created only in `issueCsrfToken`, and a request-local `req.thx_auth` exemption set by `router.js` on *successful* Bearer or API-key auth. Add one `establishSession()` helper called from the two login functions. Ship observe first, flip to signed at the operator checkpoint, then add the route guards. Do the gluster header edit in place (keeps the inode), validate it in a throwaway nginx container, `service update --force` both consoles, and enforce parity with a normalising `scripts/check-console-headers.js` step in the CircleCI `test` job.

## Project Constraints (from CLAUDE.md / AGENTS.md / memory)

- SSH to production uses the literal form `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 …` (memory: micro-ssh-direct-form). No `set -- $(sed …)` wrapper. `core` has no direct alias here (`alias core="thinx"`), so node-local `docker exec` on core is not available from this workstation.
- Push the parent repo to **`thinx-staging` only**, never `main` (memory: push-staging-not-main). Console changes: push `services/console` to `thinx-staging`, then bump the parent submodule pointer (AGENTS.md deployment flow).
- Production changes use **single-service `docker service update`**. Never `restart.sh` or `docker stack deploy`. This is doubly important because of the open Phase 24 WR-02 stack-deploy hazard (STATE.md). Use a checkpoint before every production mutation.
- `thinx_api`, `thinx_console` and `thinx_vue` all use `Order: stop-first`, 1 replica, `FailureAction: pause`, so **every env flip or `--force` is a short outage** of that service. Verified 2026-09-29.
- Service placement floats (memory: swarm-node-topology). At 2026-09-29: `thinx_api` micro, `thinx_console` **core**, `thinx_vue` micro. `docker exec` is node-local. `docker service ls` is unreliable, so query services by name.
- **chai-http stays at `^4.3.0`** (AGENTS.md): new integration specs use `chai.request(thx.app)` in CommonJS.
- **No new npm dependencies** (REQUIREMENTS Out of Scope: `csrf-csrf` / `csurf`). `node:crypto` only.
- Persist any `thinx_api` env change in `/mnt/gluster/deployment/swarm/thinx.yml` with a hunk-only commit (`git add -p`). The swarm repo has other uncommitted edits to `thinx.yml` and `console/default.conf` (verified 2026-09-29).
- Deferred (do not touch): SEC-CSP-02 `unsafe-eval`; Phase 24 WR-02 stack-deploy secret mounts; `__Host-` prefix (SEC-CSRF-07); retiring the bind mount (SEC-CSP-05).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Pre-session binding & key
- **D-01:** The priming `GET …/csrf-token`, when there is no valid session, creates a Redis pre-session with a **15-minute TTL**. After login, the normal 1-hour rolling session takes over.
- **D-02:** **Only the priming GET** creates a pre-session. Other anonymous requests never write a session to Redis, so bots crawling pages create no keys.
- **D-03:** The token has the form `hmac.random`, bound to `req.sessionID`. At login, the request's token is verified against the pre-session, then `req.session.regenerate()` runs, and a new token bound to the regenerated id is set in the login response (`Set-Cookie: XSRF-TOKEN`). Priming re-mints a stale or invalid token instead of echoing it (`issueCsrfToken` echoes the freshly minted value first).
- **D-04:** The key is resolved **once at module scope**, because 3 `csrf.js` factory instances exist. It comes from `readSecret("CSRF_SECRET")` (provisioned in Phase 24, 64 hex characters), falls back to an HKDF derivation from the session secret, and if neither exists, `thinx_api` **refuses to start in `signed` mode**. The key is never random.

#### Rollout, observation & enforcement
- **D-05:** The phase opens with a production-log check for external `POST /api/v2/user` callers. If any exist, **report them and stop at a checkpoint** before enforcing WR-04. There is no machine-client exemption (decision 2026-09-25), so those clients must prime the token.
- **D-06:** Deploy `CSRF_MODE=signed` **fail-open** with reason-coded telemetry: `binding_mismatch`, `session_mismatch`, `missing`, `stale`, plus the existing codes. Observe for **at least 24 h**, and enforce only when there are zero unexplained failure reasons.
- **D-07:** **The operator approves the enforcement flip at a checkpoint.** Before that, they check password, Google and GitHub cold logins on both consoles, plus a forced `thinx_api` redeploy mid-session with no 403s and no logouts. The executor then flips `CSRF_ENFORCE` with a single `docker service update` (never `restart.sh` / stack deploy).
- **D-08:** Rollback: **`CSRF_MODE=legacy`** restores the v1.13 double-submit behaviour and leaves `CSRF_ENFORCE` on. It is one command, documented in `.planning/runbooks/csp-csrf-hardening.md`. `CSRF_ENFORCE=false` stays the second-level escape hatch.

#### Mutation-route coverage (SEC-CSRF-04/05)
- **D-09:** A request is exempt **only when a valid `Authorization: Bearer` or API-key header actually authenticated it**. A cookie-session request without such a header must present the token, and a bogus or invalid `Authorization` header does not bypass it. The per-request Bearer bridge (`router.js`) must not regenerate the session (SEC-CSRF-03).
- **D-10:** On `/api/v2/profile` and its sub-paths, **every state-changing method** (POST/PUT/PATCH/DELETE) is guarded. GETs are exempt.
- **D-11:** If the planning-time route inventory finds other cookie-authenticated account mutations not listed in SEC-CSRF-05, **cover them in this phase** and record each one in the plan.
- **D-12:** OpenAPI documents the priming flow (`GET /api/v2/csrf-token` → `XSRF-TOKEN` cookie → `X-XSRF-TOKEN` header) and the 403 `csrf_token_invalid` response. A shared security note goes on **every guarded route**.

#### Console edge headers (SEC-CSP-03/04)
- **D-13:** `Referrer-Policy: strict-origin-when-cross-origin`, the same as the Vue image config already uses.
- **D-14:** `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`, plus `X-Permitted-Cross-Domain-Policies: none` (production currently sends `all`).
- **D-15:** Gluster edit order: **checkpoint first**. Commit the current `/mnt/gluster/deployment/swarm/console/default.conf` to the gluster repo as the rollback point, then edit, run `nginx -t` in the container, and `docker service update --force` both `thinx_console` and `thinx_vue` (the single-file bind mount pins the inode). Verify that each host returns **exactly one** CSP header plus the new headers.
- **D-16:** Parity script `scripts/check-console-headers.js` normalises the header directives (ordering, quoting, `always`, templated hosts) and compares the gluster file, both image `default.conf` files and the `.planning/runbooks/swarm-configs/` snapshots. It **runs as a CI step** and fails on drift.

### Claude's Discretion
- Exact reason-code names beyond those listed, the log format, and how telemetry is counted, for example with a grep-able log line.
- Spec layout. Research says `ZZ-CSRFSpec.js` cases 1, 4, 5 and 6 need rewriting, plus at least one enforce-mode agent flow covering prime → login → session/token.
- Plan granularity and wave split within the order research recommends: WR-06 fail-open → observe → enforce → WR-04 + routes → headers → combined two-console verification.

### Deferred Ideas (OUT OF SCOPE)
- Review WR-02 from Phase 24 (the `docker-swarm.yml` api DB/Redis secret mounts would take effect on a stack deploy) is not in this phase's scope. This phase must not run a stack deploy.
- SEC-CSP-02 (`unsafe-eval`) stays deferred until AngularJS is retired.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-CSRF-02 | HMAC token bound to session id; priming creates short-TTL pre-session; stale token re-minted; key from `CSRF_SECRET` → HKDF → fail closed; `CSRF_MODE` switch; wire contract unchanged | §Pre-session mechanics, Pattern 1–3, Code Examples 1–3, Open Question 1 (mode matrix) |
| SEC-CSRF-03 | Regenerate at every interactive login, not on Bearer bridge; login response sets new `XSRF-TOKEN`; logout clears it | §Login-site inventory, Pattern 4, Code Example 4 |
| SEC-CSRF-04 | `POST /api/v2/user` requires token; OpenAPI documents priming | §D-05 log method, §Route inventory, §OpenAPI edits |
| SEC-CSRF-05 | Cookie-auth mutation routes require token; Bearer/API-key exempt | §Route inventory (Tier 1–3), Pattern 5 (exemption), Open Question 2 (classic dashboard seam) |
| SEC-CSRF-06 | Cold login both consoles, OAuth, forced redeploy, classic register/forgot/reset under enforcement | §Console token handling, Validation Architecture SC-1/2/4 probes |
| SEC-CSP-03 | Gluster `default.conf` canonical + hardened; exactly one CSP per host | §Edge headers, Pitfalls 8–10, gluster procedure |
| SEC-CSP-04 | Image configs + runbook snapshots mirror gluster; normalising parity script | §Parity script design, CI wiring |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token mint / verify / key | API (`lib/middleware/csrf.js`) | — | Only the API knows `req.sessionID` and the key |
| Pre-session persistence | Database/Storage (Redis via connect-redis) | API (express-session) | TTL comes from the per-session `cookie.expires` |
| Session regeneration at login | API (`router.auth.js`) | Redis (destroy old key) | Login is the only place identity changes |
| Bearer / API-key exemption | API (`router.js` global middleware sets flag) | `csrf.js` reads flag | The bridge is the one place that knows auth *succeeded* |
| Reading the cookie and sending the header | Browser (classic `$.ajaxSetup`, Vue `composeHeaders`/`fetchWithCsrf`) | — | Frozen wire contract. The classic dashboard needs a seam (Open Question 2) |
| Console security headers | Edge / static (nginx in `thinx_console` and `thinx_vue`, gluster bind mount) | Traefik (`security-headers` on rtm only, no CSP) | The gluster file is canonical; the images mirror it |
| Header parity enforcement | CI (CircleCI `test` job) | — | Drift detection before merge |

## Standard Stack

### Core (all already installed, verified in `node_modules` 2026-09-29)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | Node 25.1 local / Node 26 in `thinxcloud/base` (`base/Dockerfile:27` `FROM dhi.io/node:26-alpine3.24-dev`) | `createHmac`, `timingSafeEqual`, `hkdfSync`, `randomBytes` | OWASP signed double-submit needs only these [CITED: cheatsheetseries.owasp.org CSRF Prevention] |
| express-session | 1.19.0 [VERIFIED: node_modules/express-session/package.json] | Session, `regenerate()`, rolling touch | Already mounted `thinx-core.js:343-345` |
| connect-redis | 9.0.0 [VERIFIED: node_modules] | Store, TTL derived from `cookie.expires` | `getTTL()` uses `sess.cookie.expires`, else `ttl` default 86400 [VERIFIED: node_modules/connect-redis/dist/connect-redis.cjs:22,123-134] |
| cookie-parser | 1.4.7 [VERIFIED] | `req.cookies` | Mounted `thinx-core.js:351` |
| express | 5.2.1 [VERIFIED] | — | — |
| redis (node) | 5.12.1 [VERIFIED] | Optional telemetry counters via `app.redis_client` (legacy callback client) | Already used everywhere |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| js-yaml | installed (`package.json:116` `"js-yaml": "^4.3.0"`) | Parse-check `thinx-api-openapi.yaml` after edits | Verification step for D-12 (`node -e "require('js-yaml').load(...)"` parses 46 paths today) |
| chai-http | ^4.3.0 (locked) | Enforce-mode integration spec | ZZ-* spec |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled HMAC | `csrf-csrf` 4.x | Out of scope by requirement; the whole design is about 40 lines |
| `__Host-` binding cookie | session-id binding | `__Host-` needs `Secure` and forbids `Domain`, which breaks plain-HTTP specs and the shared `.thinx.cloud` console cookie. Deferred (SEC-CSRF-07) |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed in this phase. Nothing was run through the legitimacy gate.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Pre-session Mechanics (Q1): verified against express-session 1.19 source

| Fact | Source |
|------|--------|
| Main session config | [VERIFIED: thinx-core.js:329-341] `cookie: CookiePolicy.sessionCookie({ domain: short_domain, maxAge: 3600000 })`, `name: "x-thx-core"`, `resave: true`, `rolling: true`, `saveUninitialized: false` |
| Session is saved only if data changed (when uninitialised) | [VERIFIED: express-session/index.js:455-465] `return !saveUninitializedSession && !savedHash && cookieId !== req.sessionID ? isModified(req.session) : !isSaved(req.session)` |
| `hash()` ignores the cookie | [VERIFIED: express-session/index.js:611-620] `// ignore sess.cookie property  if (this === sess && key === 'cookie') { return }` |
| Setting `cookie.maxAge` also fixes `originalMaxAge` | [VERIFIED: express-session/session/cookie.js] `set maxAge(ms) { … this.expires = … new Date(Date.now() + ms) }` and `set expires(date) { this._expires = date; this.originalMaxAge = this.maxAge; }` |
| Rolling touch restores `originalMaxAge` | [VERIFIED: express-session/session/session.js:47-60] `touch()` → `resetMaxAge()` → `this.cookie.maxAge = this.cookie.originalMaxAge` |
| Restored sessions keep `originalMaxAge` | [VERIFIED: express-session/session/store.js:86-98] `// keep originalMaxAge intact  sess.cookie.originalMaxAge = originalMaxAge` |
| `regenerate` destroys the old key and builds a fresh Cookie from global options | [VERIFIED: store.js:50-55] `this.destroy(req.sessionID, function(err){ self.generate(req); fn(err); })`, and `store.generate` (index.js:158-162) `req.session.cookie = new Cookie(... cookieOptions)` |
| Redis TTL follows `cookie.expires`; touch re-EXPIREs | [VERIFIED: connect-redis.cjs:39-46,55-59,123-134] |

**Consequences for the design:**
1. The priming handler must set a **data** marker, for example `req.session.csrf_pre = Date.now()` [ASSUMED name], or the pre-session is never saved. Setting `cookie.maxAge` alone does nothing.
2. Set `req.session.cookie.maxAge = 15 * 60 * 1000` **only when creating** a pre-session (no persisted session). Never set it on a logged-in session, where a Vue retry re-prime would otherwise shrink the user's session to 15 minutes.
3. The 15-minute TTL is **idle** (rolling), not absolute. Every request that carries `x-thx-core` from the login page extends it. That matches D-01's intent.
4. After `regenerate()`, the new session starts with the global 1 h `maxAge`. The existing login code then overrides it. D-01's "1-hour session" is imprecise: after login the session is **8 h / 14 d (password)** or **24 h / 14 d (token login)** [VERIFIED: router.auth.js:325-327 `maxAge = 8 * hour;` … `maxAge = fortnight;`, and :94-102 `req.session.cookie.maxAge = 24 * hour;` / `= fortnight;`]. Keep those. They only need to run *after* `regenerate()`.
5. **The second session config is dead code.** [VERIFIED: thinx-core.js:449-464] `var wsapp = express(); … wsapp.use(session({ … name: "x-thx-wscore", … saveUninitialized: true }))`, with the in-file note `NOTE: wsapp is currently unreachable (built here but never attached to a server)`. The WebSocket upgrade handler uses the *main* `sessionParser` (thinx-core.js:488). No route is served by `wsapp`, so it has no effect on CSRF binding. Leave it alone.
6. **Bot and Redis load:** D-02 holds, because `ensureXsrfCookie` must not touch `req.session` on non-priming requests. Measured priming volume: 32 `GET /api/csrf-token` + 5 `GET /api/v2/csrf-token` in 48 h (Traefik access log, 2026-09-29). The express-rate-limit bucket (`thinx-core.js:78-80` `windowMs: 1 * 60 * 1000`, `max: 500`) caps abuse at 500 pre-sessions per minute per IP, each with a 15-minute TTL. Note one pre-existing behaviour that is unrelated to priming: a Bearer request *without* a session cookie also persists a session, because `router.js:94` writes `req.session.owner`. Redis session-key counts are therefore not a clean D-02 metric.

## Login-site Inventory (Q2)

Every `session.owner` write in `lib/` and `thinx-core.js` [VERIFIED: grep + Read this session]:

| Site | What it is | Regenerate? | Action |
|------|------------|-------------|--------|
| `router.auth.js:321-331` `loginAction` password branch (`req.session.owner = user_data.owner; SessionToken.markLogin(...)`, `req.session.cookie.maxAge = maxAge;`) | Password login (`POST /api/login`, `/api/v2/login`) | **YES** | `establishSession(req, owner, cb)` after `rejectLogin` passes and before `owner`/`markLogin`/`maxAge`. Rotate `XSRF-TOKEN` before `checkMqttKeyAndLogin` responds |
| `router.auth.js:70-73` `performTokenLogin` (`req.session.owner = owner_id; SessionToken.markLogin(req.session, owner_id);`) | Token login used by **both** OAuth flows and the classic auth.html (`POST /login {token}`) | **YES** | Regenerate inside the `userlib.get` callback, before line 72. The `user.create` branch (line 78-89) mutates the session *after* the response may already be sent. That race predates this phase; keep it after regenerate and do not widen it |
| `router.auth.js:159-162` `respondRedirectWithToken` (overrides `req.session.owner`) | Tail of the password login | No (already regenerated upstream) | Runs after `establishSession`; unchanged |
| `router.google.js:163` `req.session.owner = userWrapper.owner;` (new-user Google callback) | **Stray session write on the IdP callback.** Persists an owner session with no regenerate and no `login_owner` | **Remove the write** | Only used for log lines 111/113/164. Log `userWrapper.owner` instead. The user then logs in through `performTokenLogin` like everyone else |
| `router.github.js` `handleGithubToken` / `validateGithubUser` (lines 77-223) | GitHub callback | No session write (verified) | None. The callback only sets a Redis token and redirects (`oauthReturn.returnURLFor(...)`) |
| `router.google.js:237-341` existing-user callback | Google callback | No session write | None |
| `router.js:91-94` Bearer bridge `app.login.verify(... ) → req.session.owner = payload.username;` | Per-request JWT → session bridge | **NO** (D-09, SEC-CSRF-03) | Only add `req.thx_auth = "bearer"` on the success path (after the revoke check passes) |
| `session_token.js:68` `session.owner = owner;` | Vue reload re-mint (`POST /api/v2/session/token`) | **NO** (not a login) | None |
| `router.github.js:228-232` / `router.google.js:182-187` OAuth initiators `req.session.destroy()` | Clears the session before the IdP redirect | n/a | None. The next priming GET on the return page creates a fresh pre-session |

**Fields to carry across `regenerate()`:** none. The pre-session holds only the marker. OAuth state lives in a cookie (`thx_oauth_state`, `oauth-github.js:33`) or in Redis (`consumeOAuthState`, router.google.js:68). The return origin is the `thx_oauth_origin` cookie (`oauth_return.js:19`). `impersonator_owner` must *not* survive a fresh login. After regenerate, set `owner` and `markLogin` (`login_owner`, `login_at`), then `cookie.maxAge`.

**Logout:** `logoutAction` (router.auth.js:259-273) serves `GET /api/logout` and `/api/v2/logout`. Add `res.clearCookie("XSRF-TOKEN", { domain: cookie_domain, path: "/" })` before `res.redirect`. Domain and path must match the mint (`csrf.js:57-63`: `domain: cookie_domain, path: '/'`). The classic header logout link targets `<ENV::apiBaseUrl>/logout` (`services/console/src/app/tpl/header.html:106`). The Vue console calls `fetch(composePath('/logout'))` (`vue/src/store/auth.js:107`).

**Regenerate failure:** `regenerate(cb)` passes a store error (the Redis `DEL` failed). Answer `503 service_unavailable`, the same shape as `loginAction`'s CouchDB-down path (`router.auth.js:305-307`). Never fall through to login on the old id.

## Console Token Handling (Q3)

| Seam | Priming | Header | On 403 `csrf_token_invalid` | After login rotation |
|------|---------|--------|-----------------------------|----------------------|
| Classic public pages (`index.html` login/register/forgot, `password.html` reset-confirm, `auth.html` OAuth return), which load `assets/thinx/csrf.js` [VERIFIED: index.html:261, password.html:98, auth.html:173] | `window.__csrfReady = Csrf.prime()` on **every page load** (csrf.js:124) | `$.ajaxSetup beforeSend` reads the cookie at send time (csrf.js:113-120) | `Csrf.ajax` re-primes and **retries once with the echoed token** (csrf.js:52-98), used by login.js `/login` (:78), `/user/password/reset` (:204), `/user/create` (:348) and password.js `/user/password/set` (:92). auth.js `/login` (:172) and `/gdpr` (:54, :115) use plain `$.ajax` (**no retry**) | Reads the new cookie at send time. auth.js awaits `__csrfReady` before its immediate POST (:159) |
| **Classic dashboard** (`app/index.html` + lazily loaded `app/js/thinx-api.js`) | **none** | **none**. `thinx-api.js:4-15` `$.ajaxSetup` sets only `contentType`/`withCredentials`; `grep -c beforeSend` = 0; `csrf.js` is not in `app/index.html` or the lazy-load lists | n/a | n/a. **Every dashboard mutation is cookie-only and headerless** (list in the Route Inventory) |
| Vue (`vue/src/utils/cookies.js`, `core/api.js`) | `ensureCsrfToken` **skips the network if the cookie exists** (cookies.js:39-43). A single shared in-flight prime | `composeHeaders()` sends `X-XSRF-TOKEN: getCsrfToken()` **and `Authorization: Bearer`** once logged in (api.js:51-58) | `fetchWithCsrf` does a forced re-prime and retries once, trusting the echoed token (cookies.js:104-112) | Reads the cookie per request. The `lastPrimedToken` fallback is used only when the cookie is not visible |

**Consequences:**
- Under `signed`, every classic public flow survives an expired 15-minute pre-session: the first POST 403s, `Csrf.ajax` re-primes (creating a new pre-session and echoing the new token), and the retry succeeds. The auth.html OAuth `/login` fires right after its own prime, so the pre-session is fresh. **Register, forgot and reset-confirm (SEC-CSRF-06) need no console change.**
- Vue after login authenticates mutations with Bearer, so under D-09 **every Vue post-login mutation is exempt**. Vue's only cookie-only protected calls are pre-login (`/login`, `/password/*`, `PUT /gdpr` in OAuthReturn.vue:95-99 via `fetchWithCsrf`) and `/session/token` on reload. All of them use `fetchWithCsrf` (retry) or `ensureCsrfToken`.
- Vue with a **pre-deploy legacy cookie** skips priming, and its first login POST fails the binding check (logged in observe). Under `signed` it 403s, gets a forced re-prime, and the retry succeeds. That is expected noise in observe telemetry. Give it its own reason code so it counts as "explained" (see Pattern 3).
- **The classic dashboard breaks under enforcement of SEC-CSRF-05** unless it gains a header seam (Open Question 2). `POST /user/delete` (thinx-api.js:1255) is in SEC-CSRF-05. `POST /user/profile` (:1214/1226/1243), `/user/apikey*` and others are D-11 candidates.
- The shared `.thinx.cloud` cookie jar means both consoles share one `x-thx-core` session and one `XSRF-TOKEN`. A login on one console regenerates the session for both. Both read the cookie at send time, so neither ends up stale.
- The Traefik access log shows the Vue console reaches the API through `console.thinx.cloud/api/v2/*` (router `thinx-vue-console-https@docker`), so its calls are same-origin through the Vue nginx proxy [VERIFIED: Traefik access log, 2026-09-29]. The cookie domain `.thinx.cloud` covers it either way.

## Route Inventory (Q4)

How auth is decided today [VERIFIED: Read this session]:
- The `router.js:63-196` global middleware runs **before every route** (thinx-core.js:372 requires it before all routers). Bearer: `app.login.verify` → success → `req.session.owner = payload.username;` → revoke check → `next()`. Failure → 403. `Bearer null`/`undefined`/empty → header stripped, fall through. API key: only `POST` with `req.body.owner` + `req.body.api_key` → `apikey.verify(...)` → `next()` or 401.
- Route handlers call `Util.validateSession(req)` (util.js:57-81), which returns true when **any** `authorization` header is present (`if ((typeof (req.headers.authorization) !== "undefined") …) return true;`), when `req.session.owner` exists, or when `req.body.owner_id` + `req.body.api_key` are present. **Do not base the exemption on `validateSession`**: it counts header presence and even trusts an unverified `owner_id`/`api_key` pair. The exemption must key on a request-local flag set *after* successful verification (Pattern 5).

**Tier 1: named in SEC-CSRF-05 / SEC-CSRF-04 (must guard)** [VERIFIED quotes]:

| Route | File:line | Classic uses? | Vue uses? |
|-------|-----------|---------------|-----------|
| `POST /api/v2/user` | router.user.js:147 `app.post("/api/v2/user", function (req, res) {` | no | no (only spec `ZZ-AppSessionUserV2DeleteSpec.js:46-48`) |
| `DELETE /api/v2/user` | router.user.js:186 `app.delete("/api/v2/user", function (req, res) {` | no | yes, Bearer → exempt |
| `POST /api/user/delete` | router.user.js:227 `app.post("/api/user/delete", function (req, res) {` | **yes (dashboard, headerless)** | no |
| `POST /api/gdpr/revoke` | router.gdpr.js:165 `app.post('/api/gdpr/revoke', function (req, res) {` | no call site found | no |
| `POST /api/v2/profile` | router.profile.js:45 `app.post("/api/v2/profile", function (req, res) {` (only state-changing method on `/api/v2/profile`; no sub-paths exist) | no | yes, Bearer → exempt |

**Tier 2: same handlers or account-level mutations (D-11: cover)**:

| Route | File:line | Why | Classic dashboard? |
|-------|-----------|-----|--------------------|
| `POST /api/user/profile` | router.profile.js:57 | Same `setProfile` handler as `/api/v2/profile` | **yes** |
| `DELETE /api/v2/gdpr` | router.gdpr.js:141 | Same `revokeGDPR` handler | no |
| `PUT /api/v2/gdpr`, `POST /api/gdpr` | router.gdpr.js:137, :155 | Consent setter (one-shot token, pre-login) | classic auth.html (header via ajaxSetup), Vue OAuthReturn (`fetchWithCsrf`) |
| `POST /api/user/apikey`, `/api/user/apikey/revoke`, `POST`/`DELETE /api/v2/apikey` | router.apikey.js:70,75,89,94 | Credential create/revoke | **yes** |
| `PUT`/`DELETE /api/v2/rsakey`, `POST /api/user/rsakey/revoke` | router.rsakey.js:52,60,78 | Credential mutation | **yes** |
| `PUT`/`DELETE /api/v2/env`, `POST /api/user/env/add`, `/api/user/env/revoke` | router.env.js:70,74,87,91 | Secret env vars | **yes** |
| `POST /api/github/token`, `/api/v2/github/token` | router.github.js:278 | Links a GitHub token and pushes an RSA key to GitHub | no (Vue: Bearer) |
| `DELETE /api/v2/admin/session/:owner`, `POST /api/v2/admin/impersonate`, `POST /api/v2/admin/user/:id/reactivate` | router.admin.js:84-86 | `requireAdmin` accepts cookie sessions (`requireAdmin.js`: `Util.validateSession`) | no (Vue admin: Bearer) |
| `POST /api/v2/transfer/{request,decline,accept}`, `/api/transfer/{request,decline,accept}` | router.transfer.js (lines 95-140) | Device ownership transfer | `/transfer/request` **yes** |

**Tier 3: resource mutations (device/source/mesh/build/notification/chat). Recommend covering them too, but confirm first.** They are cookie-reachable and damaging under CSRF, for example `/api/device/revoke`, `/api/device/push`, `/api/build`, `/api/user/source` (router.device.js:153-267, router.source.js:85-108, router.mesh.js:100-126, router.build.js:155-179, router.user.js:182/218 chat). Once the classic dashboard seam exists they cost one middleware each, and Vue is Bearer-exempt. **Exclude**: `/device/*` firmware API and `/githook` (non-browser, `isNonBrowserRequest`), `POST /api/user/logs/tail` / `/api/v2/logs/tail` / `/api/user/logs/build` and `POST /api/v2/gdpr` / `/api/gdpr/transfer` (reads carried as POST; CSRF cannot read the response), and the unauthenticated activation / reset GETs.

**Recommended mechanism:** add the existing `csrf.verifyCsrfToken` as route middleware on each listed route, the same pattern as `router.user.js:156` `app.post("/api/v2/password/reset", csrf.verifyCsrfToken, …)`. Put the D-09 exemption *inside* `verifyCsrfToken`, so there is one middleware and the explicit route list maps 1:1 to OpenAPI D-12 notes and to spec cases. Do not use a global `app.use` path matcher: it would duplicate Express routing semantics such as case-insensitive paths, `:owner` params and array paths.

## csrf.js Rework Plan (Q5)

Current structure [VERIFIED: lib/middleware/csrf.js:1-144]: a factory `module.exports = function (_app) { … }` instantiated 3× (thinx-core.js:352, router.auth.js:23, router.user.js:13, per ARCHITECTURE §1). Constants `const XSRF_COOKIE_NAME = "XSRF-TOKEN";` / `const XSRF_HEADER_NAME = "x-xsrf-token";` (lines 20-21). `isEnforced()` (31-35). `isNonBrowserRequest` (41-46). `ensureXsrfCookie` mints only when absent (51-71). `issueCsrfToken` echo order `const token = (req.cookies && req.cookies[XSRF_COOKIE_NAME]) || res.locals.xsrfToken;` (77-80). `failureReason` returns `"no_cookie"`, `"no_header"`, `"length_mismatch"`, `"value_mismatch"` (84-89). Log texts `"CSRF token missing/mismatched "` … `" (fail-open, not enforced)"` (131) and `"CSRF token rejected "` … `" (enforced, 403)"` (135). The response is `Util.failureResponse(res, 403, "csrf_token_invalid")` (136).

**Target structure:**
1. **Module scope, outside the factory:** `resolveKey()` memoised with `_resetForTests()`. `readSecret("CSRF_SECRET")` → else `crypto.hkdfSync("sha256", sessionSecret, "thinx-csrf", "csrf-v1", 32)` → else `null`. `sessionSecret` comes from `node-session.json`, using the same `CONFIG_ROOT` rule as `thinx-core.js:90-96` (`"/mnt/data/conf"`, or `spec/mnt/data/conf` when `ENVIRONMENT == "development"`). Put the path logic in a tiny helper, or add a `Globals` accessor next to `globals.js:10-16`. Record the key source (`secret|hkdf`) for a boot log line and never log the key.
2. **`mode()` read per call** from `process.env.CSRF_MODE`: `legacy` (default when unset) | `observe` | `signed`. Per-call reads let specs toggle it; production changes it only through `service update`, which restarts the task. Add `assertReady()` and call it once from thinx-core before the routers mount. If the mode is not `legacy` and there is no key, log `CRITICAL` and throw, so the task fails to start (D-04). In practice the HKDF fallback always exists, because thinx-core already hard-`require`s `node-session.json` at line 96.
3. **`mint(sid)` / `check(token, sid)`**: OWASP message `sid.length + "!" + sid + "!" + rand.length + "!" + rand`, token `hmacHex + "." + randHex` [CITED: OWASP CSRF cheat sheet].
4. **`hasPersistedSession(req)`**: `req.session && (req.session.csrf_pre || req.session.login_owner || req.session.owner)`. This is the gate that keeps D-02: the global middleware never *creates* session state.
5. **`ensureXsrfCookie`**: in `legacy` it is unchanged. In `observe`/`signed`: if non-browser → next; if there is no persisted session → **do nothing** (no mint, no session write); else if the cookie token fails `check(token, req.sessionID)` → mint a bound token, `res.cookie(...)`, set `res.locals.xsrfToken`.
6. **`issueCsrfToken`**: in `legacy`, flip the echo order to `res.locals.xsrfToken || req.cookies[...]` (harmless, and it fixes the stale-echo case). In `observe`/`signed`: if there is no persisted session, create the pre-session (`csrf_pre` marker + `cookie.maxAge = 900000`), mint and set the cookie. Else if `res.locals.xsrfToken` exists, echo it. Else if the cookie token is valid, echo it. Else re-mint. **Always echo exactly the value in the last `Set-Cookie`**, because the classic retry and the Vue forced prime both send the echoed value.
7. **`rotate(req, res)`**, exported for login: mint for the (new) `req.sessionID`, set the cookie, set `res.locals.xsrfToken`. It is a no-op in `legacy`.
8. **`verifyCsrfToken`**: (a) `req.thx_auth` is `bearer` or `apikey` → `next()` (D-09). (b) The double-submit equality check stays as today, with the existing codes. (c) In `observe`/`signed`, also `check(headerVal, req.sessionID)` → the binding reason code. Decision table: double-submit failure → today's behaviour (`isEnforced()` → 403, else log). Binding failure in `observe` → log only. Binding failure in `signed` → `isEnforced()` → 403, else log. See Open Question 1 for why the binding layer needs its own observe state.
9. **`clear(res)`**, for logout: `res.clearCookie(XSRF_COOKIE_NAME, { domain: cookie_domain, path: "/" })`.

**Spec impact (`spec/jasmine/ZZ-CSRFSpec.js`, 329 lines, 12 cases)** [VERIFIED: Read]:
- Cases 1 (plain `'abc123token'` match → next), 4 (forged header), 5 (does not overwrite an existing one) and 6 (echo without a second mint) assert legacy semantics. **Keep them under an explicit `CSRF_MODE=legacy`** (they *are* the rollback contract) and **add signed/observe twins**: 1s (bound token + matching sid → next), 4s (token for another sid → `binding_mismatch`), 5s (re-mint when invalid for a persisted session, no mint without a session), 6s (priming creates the pre-session and echoes the fresh value).
- Cases 2, 3, 7, 8 and 11 stay valid, but the mock `req` needs `session`/`sessionID` fields once the mode is not legacy.
- Cases 9, 10 and 10b (cookie domain) are unchanged.
- `afterEach` must also `delete process.env.CSRF_MODE` and reset the key memo.
- **The mock `req` in the unit spec has no `session`**, so signed-mode cases must add `{ session: { csrf_pre: 1 }, sessionID: "sid-A" }` and a `session.cookie` object for the pre-session path.

**New specs:**
- **Local (no Redis/CouchDB):** `spec/jasmine/CsrfSessionFlowSpec.js`, modelled on `CookiePolicySpec.js` (a bare `express()` + `express-session` default MemoryStore + `cookie-parser` + the real `csrf.js`, with stub `/login` and `/logout` handlers that call the real `establishSession` helper). It covers: prime → `Set-Cookie x-thx-core` + `XSRF-TOKEN`, pre-session `Max-Age=900`; login with the primed token → the sid changes and a new XSRF is set; the old token then 403s; a token from session B on session A → `binding_mismatch`; logout → XSRF cleared; a GET without a session creates no store entry (D-02: count `MemoryStore.sessions`); key stability across two `require` cache resets with the same `CSRF_SECRET` (the redeploy proxy). CookiePolicySpec's own header says it "need[s] neither Redis nor CouchDB and run[s] locally".
- **CI (ZZ, needs Redis + CouchDB via compose):** `spec/jasmine/ZZ-CSRFEnforceSpec.js` against `bootstrap.thx`. Set `process.env.CSRF_MODE="signed"` and `CSRF_ENFORCE="true"` in `beforeAll`, restore in `afterAll`. Flow: `GET /api/v2/csrf-token` → `POST /api/v2/login` (real user from `_envi.json`) → assert a new `x-thx-core` and a new `XSRF-TOKEN` → `POST /api/v2/session/token` with the rotated pair → 200. Then `POST /api/v2/user` without a token → 403 `csrf_token_invalid`, and with a primed pair → 200. Then cookie-only `DELETE /api/v2/user` → 403, and the same with Bearer → passes the CSRF layer. **Forward cookies manually** (`.set("Cookie", …)` built from `Set-Cookie`), because the spec config's `api_url` is `https://app.thinx.cloud` (`spec/mnt/data/conf/config.json:6`), so both cookies carry `Domain=.thinx.cloud`. The superagent cookie jar will not replay those to `127.0.0.1` [ASSUMED: standard cookie domain-matching; verify on first run].
- CI integration specs otherwise run fail-open (`spec/mnt/data/conf/config.json:48` `"csrf_enforce": false`) and in the default `legacy` mode, so existing ZZ agent flows keep passing unchanged.

**Local quick run (verified 2026-09-29, 34 specs, 0 failures):**
`ENVIRONMENT=development npx jasmine --config=/dev/null spec/jasmine/ZZ-CSRFSpec.js spec/jasmine/CookiePolicySpec.js spec/jasmine/ZZ-SessionTokenSpec.js`
(`--config=/dev/null` skips `spec/helpers/bootstrap.js`, which boots the full app and needs Redis and CouchDB.)

## D-05 Production Log Method (Q6)

- **Source:** Traefik access log (`--accesslog`, traefik.yml:122 on the swarm), Common Log Format per line: client IP, time, `"METHOD PATH PROTO"`, status, size, referer, user-agent, request count, `"router@docker"`, backend URL, duration [VERIFIED: sample line 2026-09-29]. The **API log cannot answer D-05**: `POST /api/v2/user` and `/api/user/create` share `user.create` (owner.js:840), which has no route-specific line. The API logs a CSRF line only for guarded routes, and `/api/v2/user` is not guarded yet.
- **Read-only command (from the workstation):**
  ```bash
  timeout 150 ssh -o ConnectTimeout=15 root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 \
   'timeout 100 docker service logs traefik_traefik --since 720h --no-trunc 2>/dev/null \
     | grep -E "\"(POST|DELETE) /api/(v2/user|user/create|user/delete|gdpr/revoke|v2/profile|user/profile) " \
     | awk -F"\"" "{split(\$2,r,\" \"); split(\$3,s,\" \"); print r[1], r[2], s[1], \$8, \$6}" \
     | sort | uniq -c'
  ```
  Output: count, method, path, status, router, user-agent (no IPs). Router `thinx-api-https@docker` = direct `app.thinx.cloud`; `thinx-console-https` / `thinx-vue-console-https` = through a console host.
- **Result of the method-design probe (2026-09-29, current task started 2 days earlier, 305,938 lines):** **0** `POST /api/v2/user`, **0** `POST /api/user/create`. **Limit:** `docker service logs` covers only containers that still exist. The Traefik task is about 2 days old, so older lines are gone. Re-run the command at phase start **and** at the end of the ≥24 h observe window, and record the counts in the runbook annex as you go (the same lesson as the 21-04 lost warnings).
- **Durable signal during observe:** if WR-04's guard ships while `CSRF_MODE=observe` (Open Question 1), any unprimed external caller shows up as a reason-coded line and a counter (Pattern 3) for the whole window.

## Edge Headers (Q7)

**Live state (read-only, 2026-09-29):**
- Gluster file `md5 f4e9fde797f43effa7a8104c387cf5b7`, 4682 bytes, mtime Sep 24 15:07, **identical** to `.planning/runbooks/swarm-configs/console-default.conf.prod` (same md5 locally). The gluster repo top level is `/mnt/glusterfs/deployment/swarm` (`git rev-parse`). `git status`: ` M console/default.conf`, ` M thinx.yml`, plus 3 untracked `.bak` files. The last commit touching the file is `8f69e3e fix(csp): pin console CSP host allowlist…`. **The live content is uncommitted**, so the D-15 "commit current first" step is real work.
- Mounts: both `thinx_console` (`console:swarm@sha256:5d501928…`, on **core**) and `thinx_vue` (`console:vue@sha256:c2163d1d…`, on micro) have `{"Type":"bind","Source":"/mnt/gluster/deployment/swarm/console/default.conf","Target":"/etc/nginx/conf.d/default.conf","ReadOnly":true}`. Both use `order=stop-first fail=pause replicas=1`.
- Headers on `rtm.thinx.cloud` and `console.thinx.cloud` for `/`, `/index.html`, `/app/`: exactly **1** `content-security-policy`, `x-permitted-cross-domain-policies: all`, HSTS present, **no** `Referrer-Policy`, **no** `Permissions-Policy`. On `console.thinx.cloud/app/` (a 404), CSP and HSTS are present (both `always`) but `x-permitted-…` is **absent**, because it has no `always`.
- **Proxied paths carry two CSPs:** `https://rtm.thinx.cloud/api/csrf-token` returns **2** `content-security-policy` headers. The API sets its own (`router.js:67` `res.header("Content-Security-Policy", CSP_POLICY);`) and the nginx server-level `add_header` is inherited by the `/api/`, `/login`, `/logout`, `/device/` and websocket proxy locations (none of those locations has its own `add_header`). "Exactly one CSP" holds only for console-served paths (Open Question 3).
- Traefik: the `security-headers@docker` middleware (framedeny, nosniff, browserxssfilter, STS) applies to the rtm console router only, and sets **no** CSP, Referrer-Policy or Permissions-Policy. The Vue router has no header middleware. The gluster file is therefore the only source of the D-13/D-14 headers.

**nginx rules that matter** [CITED: nginx.org/en/docs/http/ngx_http_headers_module.html]:
- "These directives are inherited from the previous configuration level if and only if there are no `add_header` directives defined on the current level." One `add_header` inside a `location` silently drops **all** server-level headers, CSP included, on that path. None exists today; the parity script must flag any.
- Without `always`, `add_header` applies only to 200, 201, 204, 206, 301, 302, 303, 304, 307 and 308. Add all three new or changed headers **with `always`**.
- `add_header_inherit on | off | merge` exists since nginx 1.29.3. The console images run `nginx:1.31.3-alpine` (src/Dockerfile, vue/Dockerfile). Do not use it now: it is a behaviour change nobody asked for. It is noted only as the future fix if a location ever needs its own headers.

**Target gluster edit (server level, after `X-Download-Options`):**
```nginx
    add_header "X-Permitted-Cross-Domain-Policies" "none" always;
    add_header "Referrer-Policy" "strict-origin-when-cross-origin" always;
    add_header "Permissions-Policy" "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;
```
(Header values quoted from D-13/D-14. The directive style copies the existing lines `console-default.conf.prod:11-20`.) Note: Chrome logs a console message "Error with Permissions-Policy header: Unrecognized feature: 'interest-cohort'" for this token. It is harmless because FLoC is discontinued [CITED: github.com/sveltejs/kit/issues/1506; issues.chromium.org/issues/40183230]. D-14 locks it; warn the verifier so the message is not taken for a CSP regression.

**Procedure (D-15, all from the workstation via the literal ssh form):**
1. Checkpoint (operator approves the live edit).
2. `cd /mnt/gluster/deployment/swarm && git add console/default.conf && git commit -m "console: snapshot live default.conf before Phase 25 header hardening" -- console/default.conf`. The path-limited commit keeps the unrelated `thinx.yml` edits out. Record the SHA as the rollback point.
3. Write the new content **in place**: `cat /root/default.conf.p25 > console/default.conf`. This keeps the inode, so running containers see the change. `sed -i`, editors and `git checkout` replace the inode (PITFALLS 13).
4. Validate independently of node placement, in a throwaway container on micro using the local Vue image:
   `timeout 60 docker run --rm --entrypoint nginx -v /mnt/gluster/deployment/swarm/console/default.conf:/etc/nginx/conf.d/default.conf:ro registry.thinx.cloud:5000/thinx/console:vue@sha256:c2163d1d… -t`
   (`proxy_pass http://$endpoint:7442` uses a variable, so `nginx -t` does not need to resolve `api` [ASSUMED].) `docker exec <thinx_vue ctr> nginx -t` also works on micro after an in-place write. `thinx_console` runs on **core**, where exec is not reachable from here.
5. `timeout 300 docker service update --force --no-resolve-image thinx_console`, then the same for `thinx_vue` (stop-first, so a few seconds of 502 each).
6. Verify (see Validation Architecture SC-5). On success, `git commit -m "console: harden edge headers (Phase 25)" -- console/default.conf` and refresh the repo snapshots.
7. **Rollback:** `git show <rollback-sha>:console/default.conf > console/default.conf` (in place), then force-update both services.

**Parity script design (`scripts/check-console-headers.js`, D-16):**
- Inputs: `--canonical .planning/runbooks/swarm-configs/console-default.conf.prod` (the verbatim gluster copy, which is what CI can see), `services/console/src/default.conf`, `services/console/vue/default.conf`, `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx` (strip its `#` header lines). Optional `--live <path>` for a copy of the gluster file fetched with `ssh … cat` during execution. **Leave out `…pre.nginx`**: by convention it is the before-state of a change and is *expected* to differ (swarm-configs/README.md "Pre-fix and post-fix pairs"). This refines D-16's "the snapshots"; confirm (Open Question 4).
- Parse: drop `#` comments outside quotes, tokenise with quote awareness, track brace depth. Collect `add_header name value [always]` at **server level**. **Fail** on any `add_header` found inside a `location` block (the inheritance hazard).
- Normalise: header names lower-cased. Values unquoted with whitespace collapsed. `always` recorded but ignored for equality (D-16), and reported as a warning when it differs. CSP: split on `;`, trim, drop empties, directive name lower-cased; source tokens split on whitespace, **placeholder tokens `__WEB_HOSTNAME__` / `__NGINX_HOST__` dropped** [VERIFIED: src/Dockerfile:66-68 `sed -i "s|__WEB_HOSTNAME__|${web_hostname}|g"`; vue/Dockerfile:94-96 `sed -i "s|__NGINX_HOST__|${nginx_host}|g"`], tokens sorted; directives sorted. `Permissions-Policy`: split on `,`, trim, sort.
- Compare: header-name sets plus normalised values. Exit 1 with a per-file, per-header diff.
- Expected first result: the Vue image CSP is much narrower than production (no `https://app.thinx.cloud` in `default-src`/`script-src`, no `cdn.rollbar.com`, CloudFront, cdnjs, gravatar or avatars). The classic image lacks CloudFront and cdnjs. Both images already have `Referrer-Policy`, a 3-feature `Permissions-Policy` and XPCDP `none`. The image edits therefore mirror the full production CSP (plus the placeholder) and the D-14 Permissions-Policy.
- **CI wiring:** add a step to the CircleCI `test` job **right after** "Fetch all submodules and tests" (that step runs `git submodule update --init --recursive`, so `services/console/*/default.conf` is present): `node scripts/check-console-headers.js`. The job image `thinxcloud/base:latest` is Node 26. Also add `spec/node/ConsoleHeaderParity.test.js` (a `node:test` on the normaliser, like `spec/node/StaticCsp.test.js`) and a `package.json` script `check:headers`. Be aware that `test:csp` is **not** wired into CI today (`grep test:csp .circleci/config.yml` finds nothing), so do not assume `node --test` runs automatically.
- **Ordering constraint:** the parity step fails red until the console submodule pointer carrying the image edits lands. Put the script, the CI step, the refreshed snapshots and the pointer bump in **one parent commit**, or add the CI step last.

## Architecture Patterns

### System Architecture Diagram

```
Browser (rtm classic | console Vue)            shared cookie jar: x-thx-core, XSRF-TOKEN  (Domain=.thinx.cloud)
   │ GET …/csrf-token (page load / forced re-prime)
   ▼
Traefik ──► console nginx (gluster default.conf: headers) ──/api/*──► thinx_api :7442
                                                                     │
  express-session(x-thx-core, rolling) ─► cookieParser ─► ensureXsrfCookie
     │ loads session from Redis              (legacy: mint-if-absent | observe/signed: re-mint only if session persisted & token invalid)
     ▼
  router.js global mw ── Bearer ok? ─► req.thx_auth="bearer" (session.owner bridged, NO regenerate)
                    └─ body owner+api_key ok? ─► req.thx_auth="apikey"
     ▼
  route:  GET csrf-token ─► issueCsrfToken ─ no persisted session? ─► create pre-session (csrf_pre, maxAge 15m) ─► mint bound token ─► Set-Cookie ×2 + echo
          POST login ─► verifyCsrfToken(double-submit + HMAC(sid)) ─► loginAction/performTokenLogin
                         └─► establishSession: regenerate() ─► owner+markLogin+maxAge ─► csrf.rotate() ─► Set-Cookie x-thx-core(new) + XSRF-TOKEN(new)
          POST/PUT/DELETE guarded mutation ─► verifyCsrfToken ─ thx_auth? ─► exempt
                                                        └─ cookie session ─► double-submit + binding ─► mode/enforce decision ─► 403 csrf_token_invalid | next
          GET logout ─► session.destroy + clearCookie(XSRF-TOKEN)
     ▼
  Redis: sess:<sid> (pre-session TTL 900s rolling; login 8h/24h/14d) ; optional csrf:obs:<date> counters
```

### Recommended file layout
```
lib/middleware/csrf.js          # modes, module-scope key, mint/check/rotate/clear, verify with exemption
lib/thinx/establish_session.js  # (or inside router.auth.js) regenerate → owner/markLogin → maxAge → csrf.rotate
lib/router.js                   # + req.thx_auth on verified Bearer / API key (2 lines)
lib/router.{auth,user,profile,gdpr,apikey,rsakey,env,github,admin,transfer}.js  # + csrf.verifyCsrfToken on inventory routes
scripts/check-console-headers.js
spec/jasmine/ZZ-CSRFSpec.js (rewritten) · CsrfSessionFlowSpec.js (local) · ZZ-CSRFEnforceSpec.js (CI)
spec/node/ConsoleHeaderParity.test.js
services/console/src/app/js/thinx-api.js   # classic dashboard header seam (Open Question 2)
services/console/{src,vue}/default.conf    # header mirror
```

### Pattern 1: Module-scope key, per-call mode
**What:** resolve the key once per process, whatever the number of factory instances. Read the mode per call so specs can toggle it.
**When:** always. D-04 forbids per-instance or random keys.

### Pattern 2: Pre-session only in the priming handler
**What:** `issueCsrfToken` is the only code that may write `req.session` for an anonymous visitor. `ensureXsrfCookie` checks `hasPersistedSession` and otherwise does nothing.
**Why:** D-02. It also stops a second concurrent anonymous request from minting a token bound to a throwaway session id.

### Pattern 3: Reason-coded observe telemetry (discretion)
Recommended codes, keeping the existing four: `missing` = no `x-thx-core` cookie on the request (the client never primed or its cookie jar dropped the session); `session_mismatch` = an `x-thx-core` cookie was sent but no persisted session was loaded (it expired or was destroyed, so express-session generated a new id); `stale` = the token is not in the signed `hmac.random` shape (a pre-deploy 48-hex cookie); `binding_mismatch` = well-formed signed token, persisted session present, HMAC fails for `req.sessionID` (a planted cookie, a token for another session, or a rotation the client did not pick up). All four can be computed from the raw `Cookie` header plus `hasPersistedSession`, without new session state.
Log line (grep-able, distinct from today's two strings): `⚠️ [warning] CSRF binding <observed|rejected> reason=<code> mode=<observe|signed> xsrf_cookies=<n> for <METHOD> <route>`. **Durable counter** (logs vanish when a task is rescheduled): fire-and-forget `app.redis_client.hincrby("csrf:obs:" + YYYYMMDD, mode + ":" + reason + ":" + method + " " + route, 1)` + `expire 30d`, guarded for `_app.redis_client` being absent (the unit spec passes `{}`).
Expected, explainable observe noise: `stale` for browsers that still hold pre-deploy cookies, and Vue `stale` on the first login POST before its forced re-prime.

### Pattern 4: `establishSession(req, res, owner, cb)`
`req.session.regenerate(err => { if (err) return 503; req.session.owner = owner; SessionToken.markLogin(req.session, owner); csrf.rotate(req, res); cb(); })`. The caller sets `cookie.maxAge` inside `cb`. Call it only from `loginAction` (password) and `performTokenLogin`. Decide `rotate` placement before `res.end`: `res.cookie` only queues the header.

### Pattern 5: Exemption keyed on successful auth
In `router.js`, set `req.thx_auth = "bearer"` on the path where `app.login.verify` succeeded **and** the revoke check did not return 401 (just before `next()` in the Redis callback, lines 105-117). Set `req.thx_auth = "apikey"` inside `if (vsuccess)` (line 178). Use a **request** property, never `req.session`: a session outlives the request, and the bridge writes `session.owner` on every Bearer call. A bogus Bearer gets 403 at `router.js:119` before any route runs. `Bearer null` is stripped (lines 85-89), so no flag is set.

### Anti-Patterns to Avoid
- Calling `regenerate()` in a shared "set owner" helper that `router.js:94` also uses (it would churn a session per request; PITFALLS 2).
- Exempting on `validateSession(req)` or on `Authorization` header *presence*.
- Setting `cookie.maxAge` to 15 min on an existing (logged-in) session during a re-prime.
- A per-boot `randomBytes` key, or a key cached per factory instance.
- Editing the gluster file with `sed -i`/`vim`/`git checkout` and then only running `nginx -s reload`.
- `add_header` inside a location block.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session id rotation | Manual Redis key copy/delete | `req.session.regenerate()` | Destroys the old key, issues a new signed cookie, and the save and cookie emission come for free |
| Pre-session TTL | A custom Redis `SET … EX` | `req.session.cookie.maxAge` + connect-redis `getTTL` | The TTL follows the cookie automatically, and rolling touch re-EXPIREs |
| Key derivation | String concatenation or SHA of the session secret | `crypto.hkdfSync` | Domain separation from the cookie-signing use of the same secret |
| Constant-time compare | `===` | `crypto.timingSafeEqual` with a length pre-check | Already the pattern at csrf.js:113-121 |
| nginx syntax validation | Eyeballing | `nginx -t` in a throwaway container with the real image | Catches typos before `stop-first` takes the console down |

**Key insight:** the whole binding feature is about 40 lines on top of express-session primitives. The risk sits in the rollout and the client seams, not the crypto.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Redis `sess:*` for logged-in users (they carry no CSRF data today). Browser `XSRF-TOKEN` cookies in the 48-hex legacy format | None for Redis. Legacy cookies are re-minted lazily in observe/signed for persisted sessions (`ensureXsrfCookie`) or on the next prime. No migration job |
| Live service config | `thinx_api` env `CSRF_ENFORCE=true` (live since 2026-09-25, persisted in `thinx.yml` `bc6d04a`). New `CSRF_MODE` must be added with `--env-add` **and** persisted in `thinx.yml`. Gluster `console/default.conf` is uncommitted in the swarm repo | `docker service update --env-add CSRF_MODE=… --no-resolve-image thinx_api` per step, plus a `git add -p thinx.yml` hunk commit. Gluster: commit first (D-15) |
| OS-registered state | None. Verified: no cron or systemd touches these files (the swarm repo holds only stack files and scripts) | None |
| Secrets/env vars | `CSRF_SECRET` mounted on `thinx_api` [VERIFIED: `docker service inspect` secrets list 2026-09-29: `CSRF_SECRET SLACK_BOT_TOKEN … WORKER_SECRET`]. The name is unchanged | Code reads it via `readSecret("CSRF_SECRET")`; nothing to rotate |
| Build artifacts | Console images carry `default.conf` that production ignores (bind mount). The classic image carries `app/js/thinx-api.js` (the dashboard seam) | Rebuild the classic image through the normal console → pointer → CI path. Swarmpit autoredeploys `thinx_console`/`thinx_vue` |

## Common Pitfalls

### Pitfall 1: The literal D-06/D-07 flip reverts v1.13 enforcement
**What goes wrong:** "Deploy signed fail-open" with today's single `CSRF_ENFORCE` gate would mean `CSRF_ENFORCE=false` for at least 24 h, which re-opens login CSRF, and the later "flip `CSRF_ENFORCE`" just restores the status quo.
**How to avoid:** use `CSRF_MODE=observe` (Open Question 1). `CSRF_ENFORCE` stays `true` throughout.
**Warning signs:** a plan task that runs `--env-add CSRF_ENFORCE=false`.

### Pitfall 2: The classic dashboard 403s after the route guards ship
**What goes wrong:** `CSRF_ENFORCE=true` is global. The moment `verifyCsrfToken` lands on `/api/user/delete`, `/api/user/profile` and similar, classic dashboard calls (no header) get 403, even in `legacy` mode, because the double-submit layer is enforced.
**How to avoid:** deploy and verify the classic dashboard seam **before** the API commit that adds Tier 1-3 guards. Alternatively, have new-route guards observe-only while `CSRF_MODE=observe` (Open Question 1 matrix).
**Warning signs:** `CSRF token rejected reason=no_header … for POST /api/user/profile`.

### Pitfall 3: The pre-session is never saved
**What goes wrong:** the priming handler sets only `cookie.maxAge`. `hash()` ignores the cookie, the session is not modified, nothing is saved and no `x-thx-core` is set. Every token is then bound to a throwaway id, and cold login locks out under enforcement.
**How to avoid:** write the `csrf_pre` data marker. The local flow spec asserts a `Set-Cookie: x-thx-core` on the prime.

### Pitfall 4: The priming response echoes a different value than its Set-Cookie
**What goes wrong:** the classic retry and the Vue forced prime send the *echoed* token. If the echo is the stale request cookie while `Set-Cookie` carries a new token, the header and cookie disagree, and the request fails with `value_mismatch` forever.
**How to avoid:** echo `res.locals.xsrfToken` first. The unit spec asserts `body.csrf_token === last Set-Cookie value`.

### Pitfall 5: Duplicate `XSRF-TOKEN` cookies cause a re-mint loop
**What goes wrong:** a host-only `XSRF-TOKEN` plus the `.thinx.cloud` one. cookie-parser keeps the first. The server re-mints the domain cookie on every request and the stale host-only cookie keeps winning, so the result is a permanent 403.
**How to avoid:** when `xsrfCookieCount(req) > 1`, also `res.clearCookie(XSRF, { path: "/" })` (no domain) during re-mint. The existing `duplicate_cookie=true` log field is the detector.

### Pitfall 6: Specs pass locally and in CI but never exercise binding
**What goes wrong:** CI config is `csrf_enforce: false`, the default mode is `legacy`, and agent specs cannot carry `.thinx.cloud` cookies to 127.0.0.1.
**How to avoid:** the ZZ-CSRFEnforceSpec sets both env vars, forwards cookies manually and asserts the sid changed. The local CsrfSessionFlowSpec covers rotation without Redis.

### Pitfall 7: Observe telemetry is lost on redeploy
**What goes wrong:** every `thinx-staging` push redeploys `thinx_api`, and `docker service logs` drops removed containers (the runbook records the lost 21-04 warnings).
**How to avoid:** Redis daily counters (Pattern 3), plus recording counts in the annex at each check.

### Pitfall 8: A gluster edit that does not reach the containers
The single-file bind mount pins the inode. Write in place, then `--force` both services (PITFALLS 13 in the milestone research).

### Pitfall 9: "Exactly one CSP" measured on the wrong path
Proxied `/api/*`, `/login` and `/logout` responses on the console hosts carry the API's CSP plus the nginx one (**2**, verified live). Measure `/`, `/index.html`, `/app/`, a static asset and a 404 (Open Question 3).

### Pitfall 10: `interest-cohort` console noise read as a regression
Chrome reports "Unrecognized feature: 'interest-cohort'". It is harmless (D-14 locked); tell the verifier.

### Pitfall 11: Regenerate leaves the Google new-user session behind
If `router.google.js:163` stays, a new Google user gets a persisted owner session from the IdP callback without regeneration, before any `/login`. Remove the write.

## Code Examples

The identifiers `CSRF_MODE`, `observe`, `csrf_pre`, `thx_auth`, `establishSession`, `rotate` and `clear` are **proposed names** [ASSUMED]. Everything else is quoted from the files cited above.

### 1. Module-scope key + signed token (lib/middleware/csrf.js, outside the factory)
```js
// Source: OWASP CSRF Prevention Cheat Sheet (signed double-submit) + node:crypto
const crypto = require("crypto");
const { readSecret } = require("../thinx/secrets");
let KEY; let KEY_SOURCE;                       // memo, one per process
function resolveKey() {
  if (KEY !== undefined) return KEY;
  const s = readSecret("CSRF_SECRET");          // file → env → null (secrets.js:20-44)
  if (s) { KEY = Buffer.from(s); KEY_SOURCE = "secret"; return KEY; }
  const sessSecret = loadSessionSecret();       // node-session.json .secret, CONFIG_ROOT rule of thinx-core.js:90-96
  KEY = sessSecret ? Buffer.from(crypto.hkdfSync("sha256", sessSecret, "thinx-csrf", "csrf-v1", 32)) : null;
  KEY_SOURCE = KEY ? "hkdf" : "none";
  return KEY;
}
function mac(sid, rand) {
  const msg = sid.length + "!" + sid + "!" + rand.length + "!" + rand;
  return crypto.createHmac("sha256", resolveKey()).update(msg).digest("hex");
}
function mint(sid) { const rand = crypto.randomBytes(16).toString("hex"); return mac(sid, rand) + "." + rand; }
function check(token, sid) {
  if (typeof token !== "string" || typeof sid !== "string") return "missing";
  const i = token.indexOf(".");
  if (i !== 64) return "stale";                 // legacy 48-hex or malformed
  const got = Buffer.from(token.slice(0, i)), want = Buffer.from(mac(sid, token.slice(i + 1)));
  return (got.length === want.length && crypto.timingSafeEqual(got, want)) ? null : "binding_mismatch";
}
```

### 2. Priming with pre-session (issueCsrfToken, observe/signed branch)
```js
function issueCsrfToken(req, res) {
  if (mode() === "legacy") return Util.respond(res, { csrf_token: res.locals.xsrfToken || (req.cookies && req.cookies[XSRF_COOKIE_NAME]) });
  if (!hasPersistedSession(req)) {
    req.session.csrf_pre = Date.now();          // data change → session saved (hash() ignores cookie)
    req.session.cookie.maxAge = 15 * 60 * 1000; // → originalMaxAge; connect-redis EX 900; rolling keeps it idle-15m
  }
  let token = res.locals.xsrfToken;
  const current = req.cookies && req.cookies[XSRF_COOKIE_NAME];
  if (!token) token = (check(current, req.sessionID) === null) ? current : setBound(req, res);
  Util.respond(res, { csrf_token: token });     // always equals the last Set-Cookie value
}
```

### 3. Verify with exemption + layered decision
```js
function verifyCsrfToken(req, res, next) {
  if (req.thx_auth === "bearer" || req.thx_auth === "apikey") return next();   // D-09
  // (a) existing double-submit block, csrf.js:108-137, unchanged → on failure: today's isEnforced() behaviour
  // (b) observe/signed only:
  const reason = bindingReason(req);           // missing | session_mismatch | stale | binding_mismatch | null
  if (!reason) return next();
  if (mode() === "observe" || !isEnforced()) { logObserved(reason, req); return next(); }
  logRejected(reason, req); return Util.failureResponse(res, 403, "csrf_token_invalid");
}
```

### 4. Login rotation seam
```js
// router.auth.js loginAction, after `if (rejectLogin(req, user_data, password, res)) return;`
establishSession(req, res, user_data.owner, (err) => {
  if (err) return Util.failureResponse(res, 503, "service_unavailable");
  req.session.cookie.maxAge = remember ? fortnight : 8 * hour;   // existing values, now after regenerate
  alog.log(user_data.owner, "User logged in: " + username);
  checkMqttKeyAndLogin(req, res, user_data);
});
```

### 5. Classic dashboard seam (services/console/src/app/js/thinx-api.js, if Open Question 2 is approved)
```js
// same wire contract as assets/thinx/csrf.js:113-120 — cookie XSRF-TOKEN → header X-XSRF-TOKEN
$.ajaxSetup( { beforeSend: function( xhr ) {
  var m = document.cookie.match( /(?:^|; )XSRF-TOKEN=([^;]*)/ );
  if ( m ) { xhr.setRequestHeader( "X-XSRF-TOKEN", decodeURIComponent( m[ 1 ] ) ); }
} } );
```
(`$.ajaxSetup` merges, so the existing `contentType`/`withCredentials` settings stay. No per-call `beforeSend` exists in thinx-api.js to override it: `grep -c beforeSend` = 0.)

## OpenAPI Edits (D-12)
`thinx-api-openapi.yaml` already has `components.parameters.XsrfTokenHeader`, `XsrfTokenCookie`, `components.responses.CsrfTokenInvalid` and `schemas.CsrfTokenResponse` (lines 515-575) and a `/csrf-token` path (577). Update the texts: the token is opaque and session-bound (`<hmac>.<nonce>`, not "48 hex characters"); the client must keep **both** `x-thx-core` and `XSRF-TOKEN` (a cookie jar); the prime creates a 15-minute pre-session and re-mints stale tokens; the token rotates at login (take it from the login response `Set-Cookie`); Bearer and API-key calls are exempt. Add the parameter refs plus the 403 response to `/user` `post` (line 1360) and `delete`, `/profile` `post` (1660), `/gdpr` put/delete (1728), `/apikey`, `/rsakey`, `/env`, `/github/token`, `/transfer/*`, and any Tier 3 routes that are adopted. v1-only routes (`/user/delete`, `/gdpr/revoke`, `/user/profile`) are not in the spec (its `servers` are `/api` and `/api/v2` with v2-style paths). Name them in the shared note rather than inventing paths. Parse check: `node -e "require('js-yaml').load(require('fs').readFileSync('thinx-api-openapi.yaml','utf8'))"`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Naive double-submit (random cookie = header) | Signed double-submit bound to the session id | OWASP cheat sheet (current) | Defeats sibling-subdomain cookie tossing |
| `csurf` | Deprecated; `node:crypto` or `csrf-csrf` | csurf deprecated 2022 | Out of scope anyway |
| `interest-cohort` Permissions-Policy | Unrecognised in Chrome 115+ (FLoC dead; Topics API uses `browsing-topics`) | 2021-2023 | Console noise only |
| nginx add_header all-or-nothing inheritance | `add_header_inherit merge` available | nginx 1.29.3 | Future option only |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | chai-http v4 / superagent cookie jar will not replay `Domain=.thinx.cloud` cookies to 127.0.0.1 | csrf.js Rework → new specs | Low: manual cookie forwarding works either way |
| A2 | `nginx -t` in a throwaway container passes without a resolvable `api` host (variable `proxy_pass`) | Edge Headers procedure step 4 | Low: fall back to `docker exec` in `thinx_vue` on micro after an in-place write |
| A3 | Proposed names (`CSRF_MODE=observe`, `csrf_pre`, `req.thx_auth`, `establishSession`, reason-code mapping) | Patterns / Code Examples | None functionally. Naming is discretion or needs confirmation |
| A4 | No external clients depend on the cookie-auth mutation routes (only the consoles) | Route Inventory | Medium: extend the D-05 Traefik query to the Tier 1-3 paths during observe |
| A5 | Legacy-mode rollback keeps `regenerate()` (it is a session-fixation fix, not CSRF) | Open Question 5 | Medium if the user expects `legacy` to undo *all* phase behaviour |

## Open Questions (RESOLVED)

**All six were resolved by the user on 2026-09-29 and are recorded in `25-CONTEXT.md` as post-research amendments. Each question below carries an inline `RESOLVED:` line; where the user chose differently from the research recommendation (Q3), the CONTEXT decision is authoritative.**

1. **The enforcement switch while `CSRF_ENFORCE=true` is already live (blocking).** Production `thinx_api` env shows `CSRF_ENFORCE=true` (verified 2026-09-29). D-06 says "deploy signed fail-open" and D-07 says "flip `CSRF_ENFORCE`". Taken literally, that means turning v1.13 enforcement off for at least 24 h.
   - **RESOLVED: D-17.** The recommendation was taken: three-state `CSRF_MODE` legacy → observe → signed; `CSRF_ENFORCE` is never flipped.
   - **Recommendation:** a three-state `CSRF_MODE`:

     | `CSRF_MODE` | mint | binding check | 8 existing routes | new routes (WR-04 + Tier 1-3) |
     |---|---|---|---|---|
     | `legacy` (default) | random, mint-if-absent | none | double-submit, per `CSRF_ENFORCE` | double-submit, per `CSRF_ENFORCE` |
     | `observe` | signed + pre-session | logged only | double-submit per `CSRF_ENFORCE`; binding logged | everything logged only (never 403) |
     | `signed` | signed + pre-session | per `CSRF_ENFORCE` | full | full |

     The D-07 flip becomes `--env-add CSRF_MODE=signed` and D-08 rollback stays `--env-add CSRF_MODE=legacy`, with `CSRF_ENFORCE` untouched throughout. This changes the D-06/D-07 mechanism (observe stands in for "signed fail-open"; the flip changes `CSRF_MODE`, not `CSRF_ENFORCE`).
   - **Alternative (literal CONTEXT):** `CSRF_ENFORCE=false` + `CSRF_MODE=signed` for ≥24 h, then `CSRF_ENFORCE=true`. Simpler, but login CSRF protection is off during observation.
2. **The classic dashboard seam (blocking, a console code change).** `POST /api/user/delete` (named in SEC-CSRF-05) and every D-11 Tier 2 route the classic dashboard uses are headerless today.
   - **RESOLVED: D-18.** The recommendation was taken: add the classic `$.ajaxSetup` seam, deployed before any new API route guard.
   - **Recommendation:** the 4-line `$.ajaxSetup beforeSend` in `app/js/thinx-api.js` (Code Example 5), pushed to console `thinx-staging` → pointer bump → classic image, deployed and verified before the API guards. The wire contract is unchanged, but this contradicts the CONTEXT line "Frozen wire contract (no console CSRF code change)".
   - **Alternative:** leave the classic-used routes unguarded and record them as accepted risk. That fails SEC-CSRF-05 as written for `POST /api/user/delete`.
3. **"Exactly one CSP" scope.** Proxied `/api/*` responses on the console hosts carry 2 CSP headers today (verified live).
   - **RESOLVED: D-19. The user chose the ALTERNATIVE:** `proxy_hide_header` in the gluster proxy locations, so proxied `/api/*` responses on the console hosts also carry exactly one CSP. The recommendation below is superseded.
   - **Recommendation:** measure console-served paths only and record the proxied double header as accepted (JSON responses are never rendered as documents).
   - **Alternative:** `proxy_hide_header Content-Security-Policy;` in the 5 proxy locations of the gluster file. It is a larger live edit.
4. **Which snapshots the parity script compares.**
   - **RESOLVED: D-20.** The recommendation was taken: compare `console-default.conf.prod` and `rtm…post.nginx`; `pre.nginx` is excluded.
   - **Recommendation:** `console-default.conf.prod` and `rtm…post.nginx` only. By the swarm-configs README convention, `pre.nginx` is the before-state of a change. The phase refreshes `pre` (the before-edit capture) and `post` (the after-edit capture). This narrows D-16's "the snapshots".
5. **Whether `CSRF_MODE=legacy` should also skip `regenerate()`.**
   - **RESOLVED: D-08.** The recommendation was taken: `legacy` keeps `regenerate()` in all modes.
   - **Recommendation:** keep regenerate in all modes. It closes session fixation, the CI ZZ login specs exercise it, and it does not touch legacy tokens. The second-level escape for a regenerate bug is a code revert. Confirm, because SC-2 says `legacy` "restores v1.13 behaviour".
6. **Tier 3 resource-mutation coverage** (devices, sources, mesh, build, chat) goes beyond the letter of D-11 ("account mutations").
   - **RESOLVED: D-21.** Tier 3 (devices, sources, mesh, build, chat) is deferred to a follow-up requirement. Phase 25 guards account mutations only.
   - **Recommendation:** cover it in the same plan as Tier 2 once the classic seam exists, or record it as accepted risk. *(Superseded by D-21: deferred.)*

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | specs, parity script | ✓ | v25.1.0 local; Node 26 in CI image | — |
| jasmine (local, no services) | unit and local flow specs | ✓ | ^5.12 | — |
| Redis / CouchDB / full ZZ suite | ZZ-CSRFEnforceSpec | CI only (compose in `test` job). `redis-server` exists locally but CouchDB does not | — | Run the ZZ spec in CI (push `thinx-staging`) |
| Docker (local) | optional nginx -t of image configs | ✓ | 29.8.0 | — |
| ssh to micro | D-05 log, gluster edit, service updates | ✓ (literal form) | — | — |
| ssh to core | `docker exec` into `thinx_console` | ✗ from this workstation | — | Throwaway-container `nginx -t` on micro; service commands work from micro (manager) |

## Validation Architecture

(`workflow.nyquist_validation` is `false` in `.planning/config.json`. This section is included on the orchestrator's explicit request.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jasmine ^5.12 (`spec/support/jasmine.json`), node:test for parity |
| Config file | `spec/support/jasmine.json` (the helpers boot the full app); use `--config=/dev/null` locally |
| Quick run command | `ENVIRONMENT=development npx jasmine --config=/dev/null spec/jasmine/ZZ-CSRFSpec.js spec/jasmine/CsrfSessionFlowSpec.js spec/jasmine/CookiePolicySpec.js spec/jasmine/ZZ-SessionTokenSpec.js && node --test spec/node/ConsoleHeaderParity.test.js && node scripts/check-console-headers.js` |
| Full suite command | CircleCI `test` job (push `thinx-staging`), which requires `specs, 0 failures` in `test.log` |

### Phase Requirements → Test Map
| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-CSRF-02 | mint/check, stale re-mint, echo equals Set-Cookie, key stable across re-require, no key → assertReady throws when mode ≠ legacy | unit | quick run (ZZ-CSRFSpec signed twins) | ❌ rewrite |
| SEC-CSRF-02 / SC-1 | prime creates pre-session (`Max-Age=900`), anonymous GET creates no store entry, token for session B rejected on A | local integration | CsrfSessionFlowSpec | ❌ new |
| SEC-CSRF-03 / SC-2 | login changes sid + sets new XSRF; old token rejected; logout clears; Bearer request does not change sid | local + CI | CsrfSessionFlowSpec; ZZ-CSRFEnforceSpec | ❌ new |
| SEC-CSRF-04 / SC-3 | `POST /api/v2/user` unprimed → 403, primed → 200 | CI | ZZ-CSRFEnforceSpec | ❌ new |
| SEC-CSRF-05 / SC-3 | cookie-only Tier 1-2 mutation → 403; same with Bearer / body API key → passes the CSRF layer; bogus Bearer → 403 from the bridge | CI + unit (exemption flag) | ZZ-CSRFEnforceSpec; ZZ-CSRFSpec | ❌ new |
| D-12 | OpenAPI parses; guarded routes carry the refs | smoke | js-yaml parse one-liner + grep count of `XsrfTokenHeader` refs | ✅ yaml exists |
| SEC-CSRF-06 / SC-1,2,4 | cold login ×2 consoles × (password, Google, GitHub); classic register / forgot / reset-confirm; forced `thinx_api` redeploy mid-session; Vue reload `session/token` 200 | **manual (operator checkpoint)** + log probe | `docker service logs thinx_api --since <t> \| grep -c "CSRF binding\|CSRF token rejected"` = 0 unexplained, plus Redis `HGETALL csrf:obs:<date>` | manual |
| SC-2 rollback | `CSRF_MODE=legacy` restores v1.13 (a primed 48-hex flow works; `CSRF_ENFORCE` still true) | unit + live curl | ZZ-CSRFSpec legacy cases; runbook curl pair (runbook lines 322-333 pattern) | ✅ partially |
| SEC-CSP-03 / SC-5 | each host: exactly 1 CSP on `/`, `/index.html`, `/app/` (rtm), a static asset, a 404; `Referrer-Policy`, `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies: none` present | live probe | `for h in rtm.thinx.cloud console.thinx.cloud; do for p in / /index.html /app/ /favicon.ico /nope-404; do curl -sS -m 20 -D - -o /dev/null https://$h$p \| grep -ciE '^content-security-policy:'; done; done` (expect all `1`), plus a grep for the three headers | manual-run script |
| SEC-CSP-04 / SC-5 | images + snapshots match the gluster file after normalisation; `add_header` in a location fails | CI + unit | `node scripts/check-console-headers.js`; `node --test spec/node/ConsoleHeaderParity.test.js` | ❌ new |

### Sampling Rate
- **Per task commit:** quick run command.
- **Per wave merge:** push `thinx-staging` → CircleCI `test` green (the parity step plus the full jasmine suite).
- **Phase gate:** full suite green, then the operator's combined two-console verification pass (SC-1/2/4/5) recorded in the runbook annex.

### Wave 0 Gaps
- [ ] `spec/jasmine/CsrfSessionFlowSpec.js`: local express + MemoryStore harness (pattern: `CookiePolicySpec.js:23-58` `request()` helper, extended to multi-request with manual cookie forwarding)
- [ ] `spec/jasmine/ZZ-CSRFEnforceSpec.js`: CI enforce-mode flow
- [ ] `spec/node/ConsoleHeaderParity.test.js` + `scripts/check-console-headers.js`
- [ ] CircleCI `test` job step `node scripts/check-console-headers.js` after submodule fetch

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirectly | Unchanged login logic; login CSRF closed via pre-session token |
| V3 Session Management | **yes** | `session.regenerate()` at authentication (session fixation); 15-min idle pre-session; logout destroys the session and clears the token |
| V4 Access Control | **yes** | Anti-CSRF on cookie-authenticated state changes; Bearer and API-key exemption only after verified auth |
| V5 Input Validation | limited | Token parse (`hmac.random` shape, length check before `timingSafeEqual`) |
| V6 Cryptography | **yes** | HMAC-SHA256, `hkdfSync`, `timingSafeEqual`, key from a swarm secret. Never random, never hand-rolled primitives |
| V14 Config (HTTP headers) | **yes** | CSP (one per document), `Referrer-Policy`, `Permissions-Policy`, XPCDP `none`, HSTS kept |

(ASVS chapter numbering follows 4.0.3 naming [ASSUMED]; the controls are what matters.)

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sibling-subdomain cookie tossing (`XSRF-TOKEN` on `.thinx.cloud`) | Tampering / Elevation | HMAC over the httpOnly session id; attacker cannot compute it |
| Login CSRF | Spoofing | Pre-session token on `/login`, `/v2/login` |
| Session fixation | Spoofing | Regenerate at password and token login; remove the Google callback owner write |
| CSRF on account deletion / credentials | Tampering | Tier 1-2 guards; classic seam |
| Exemption bypass via fake `Authorization` | Elevation | Flag set only after `app.login.verify` succeeds; bogus Bearer → 403 before routes |
| Header drift / lost CSP on a location | Info disclosure / XSS surface | Parity CI step; fail on `add_header` in a location |

## Sources

### Primary (HIGH confidence)
- Repo source read this session: `lib/middleware/csrf.js`, `thinx-core.js` (90-130, 280-540), `lib/router.js` (1-200), `lib/router.auth.js`, `lib/router.github.js`, `lib/router.google.js` (90-345), `lib/thinx/session_token.js`, `lib/thinx/oauth_return.js`, `lib/thinx/secrets.js`, `lib/thinx/util.js` (40-110), `lib/router.{user,profile,gdpr}.js`, `lib/middleware/{cookie-policy,requireAdmin}.js`, `spec/jasmine/{ZZ-CSRFSpec,CookiePolicySpec,ZZ-SessionTokenSpec,ZZ-AppSessionUserV2DeleteSpec}.js`, `.circleci/config.yml` (615-860), `thinx-api-openapi.yaml`
- Console submodule `a5b0246`: `src/assets/thinx/{csrf,auth}.js`, `src/app/js/thinx-api.js`, `src/{index,auth,password}.html`, `src/gulpfile.js`, `src/Dockerfile`, `vue/Dockerfile`, `src/default.conf`, `vue/default.conf`, `vue/src/utils/cookies.js`, `vue/src/core/api.js`
- `node_modules/express-session` 1.19.0 (`index.js`, `session/{cookie,session,store}.js`), `node_modules/connect-redis/dist/connect-redis.cjs` 9.0.0
- Production read-only probes 2026-09-29: `docker service inspect thinx_api|thinx_console|thinx_vue`, the gluster `git status`/`md5sum`, Traefik access-log aggregates, live `curl` header counts
- nginx headers module docs: https://nginx.org/en/docs/http/ngx_http_headers_module.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

### Secondary (MEDIUM confidence)
- `interest-cohort` warning: https://github.com/sveltejs/kit/issues/1506, https://issues.chromium.org/issues/40183230
- Milestone research `.planning/research/{SUMMARY,ARCHITECTURE,PITFALLS,STACK}.md`; runbooks `csp-csrf-hardening.md`, `console-csp-source-of-truth.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing is new, and versions were read from `node_modules`.
- Pre-session / regenerate mechanics: HIGH. Read in express-session and connect-redis source.
- Login-site and route inventory: HIGH. Every `session.owner` write and every mutation route was enumerated by grep and Read.
- Console behaviour: HIGH for the code; MEDIUM for how deployed bundles behave (the submodule pointer `a5b0246` equals the checked-out source, but the live bundle was not diffed).
- Rollout design: MEDIUM. It depends on Open Questions 1 and 2.
- Edge headers: HIGH. Checked against live probes and the nginx docs.

**Research date:** 2026-09-29
**Valid until:** 2026-10-13 (live state such as placement, image digests and the gluster working tree drifts quickly; re-verify before each production step)
