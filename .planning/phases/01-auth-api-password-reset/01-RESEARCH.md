# Phase 1: AUTH API — Password Reset — Research

**Researched:** 2026-05-26
**Domain:** Express middleware ordering + JWT auth header handling + edge proxy (nginx) on rtm.thinx.cloud
**Confidence:** HIGH (primary root cause identified with concrete code evidence)

## Summary

The seed `.planning/G8-INVESTIGATION.md` correctly ranked the JWT-verify 403 short-circuit at `lib/router.js:132` as a credible suspect but treated it as conditional ("if an unrelated bearer/cookie header is present"). This research **upgrades that suspect to the primary root cause with HIGH confidence** by tracing the Vue client.

**The smoking gun is in the Vue API client itself** (`services/console/vue/src/core/api.js:53-57`): `composeHeaders()` unconditionally adds `Authorization: 'Bearer ' + this.refreshToken` on *every* request, including the unauthenticated `/password/reset` call. When the user is logged out, `this.refreshToken === null`, so the literal string `Bearer null` is sent. The backend `lib/router.js:103` matches "any value in `req.headers.authorization`" (not "any *valid* JWT") and dispatches to `app.login.verify`, which fails parsing and triggers `res.status(403).end()` at L132. The legacy AngularJS console never sent `Authorization` on the unauth reset call, which is exactly why it worked while the Vue port doesn't.

There are also two supporting findings worth knowing during planning: (a) the regression spec the seed asks for *already exists* (`spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:85-97`) and asserts the 200 path against the **mounted app**, meaning the unauth route works perfectly when the JWT short-circuit is not exercised — this confirms the bug lives in the request preamble, not the route handler; (b) the Node API behind rtm.thinx.cloud is fronted by an additional nginx layer in the **console container** (`services/console/vue/default.conf`) before Traefik routes to the API, which means there are two edge surfaces (console nginx + Traefik) to inspect if the client-side `Bearer null` theory is somehow ruled out.

**Primary recommendation:** Fix the backend to short-circuit `Authorization: Bearer null` / empty-token requests *before* dispatching to `app.login.verify`. Treat them as no-token (fall through to the cookie/no-auth path). This is a **2-line guard** in `lib/router.js` between L103 and L104. The fix is symmetric with what the legacy console expected and avoids changing the Vue client, edge config, or any test fixture. Add the regression spec that the seed asked for, but target it at `/api/v2/password/reset` (the existing test exercises the same handler but doesn't cover the `Bearer null` header case).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Behavioral contract:**
- The endpoint must return HTTP 200 + standard success body for **any well-formed** `{email: string}` JSON payload, regardless of whether the email matches a registered user (no user enumeration leak).
- The legacy alias `POST /api/user/password/reset` (lib/router.user.js:202) must continue to return the same response shape.
- The follow-up `GET /api/v2/password/reset?owner=...&reset_key=...` round-trip and `POST /api/v2/password/set` flow must work end-to-end after the fix.

**Fix-direction guardrails:**
- Prefer the **smallest possible change** that restores legacy behavior. A middleware fix in `thinx-core.js` or `lib/router.js` is preferred over a Traefik label change; a Traefik label change is preferred over an nginx config change.
- If the root cause is in the **edge layer** (Traefik / nginx on the swarm), the fix must include a `./scripts/stack-deploy` verification step *and* a documented reversion plan, because edge config changes have outsized blast radius.
- Do NOT bypass the rate limiter on `/api/v2/password/reset` — it's at `thinx-core.js:75-80` (windowMs 1min, max 500), and 500/min is high enough to not be the cause of a 403 for typical UAT traffic; rate-limit returns 429 not 403.
- Do NOT introduce new dependencies (no new npm packages, no new system packages).
- The fix must add a regression spec under `spec/jasmine/ZZ-*` that exercises the unauthenticated 2xx path (chai-http v4 pattern, since we hold v4 per `AGENTS.md:82-92`).

**Reproducibility:**
- Local reproduction must be attempted before any change to production config. The minimum reproduction surface is a `curl` against `rtm.thinx.cloud` and (if accessible) against a staging environment, comparing response codes and headers.
- If the bug only reproduces against rtm, the fix may live in the edge layer and the SSH-based investigation path from `AGENTS.md:17-19` is in-bounds.

### Claude's Discretion

- Choice of grep / read order while investigating
- Specific middleware diagnosis technique (binary-search by commenting out, instrumented logging, etc.)
- Exact phrasing of the spec assertion (as long as it exercises an unauthenticated POST and asserts 2xx)
- Whether to add ranked-suspect findings as comments in the source vs. only in `SUMMARY.md`

### Deferred Ideas (OUT OF SCOPE)

- **Move `password_reset_init` to a non-callback async pattern** — out of scope for this phase (cosmetic; REFACTOR-04 candidate for v1.x).
- **Add unit tests for `Owner.password_reset_init` callback paths** — the regression spec at the route level is sufficient for AUTH-API-01; expanded unit coverage is a v1.x candidate.
- **Fix the PII-in-logs at owner.js:499** — owned by Phase 2 (SEC-PII-01), don't bundle here.
- **Triage of `dependabot` advisories that touch the auth stack** — owned by Phase 4 (SEC-DEP-01).
- **OPS-swarmpull diagnosis** — owned by Phase 3 (OPS-01); only touched here if the G8 fix involves swarm config and the lack of auto-pull becomes a blocker for verifying the fix landed.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-API-01 | Unauthenticated `POST /api/v2/password/reset` returns 200 with standard success body for well-formed `{email}` JSON. No enumeration (registered/unregistered emails get identical response). Vue console "Forgot password?" round-trip completes on rtm. Regression spec under `spec/jasmine/ZZ-*`. | Root cause = backend treats `Authorization: Bearer null` as a real JWT and 403s (`lib/router.js:103` → L132). Fix candidate = guard against falsy tokens before invoking `app.login.verify`. No-enumeration is **partially honored today** but has a bug worth noting (see §5). Existing v2 spec at `ZZ-AppSessionUserV2DeleteSpec.js:85` covers the no-auth path but **does not** cover the `Authorization: Bearer null` case — the new regression spec should add that. |

## Project Constraints (from AGENTS.md)

- **chai-http locked at ^4.3.0.** Do NOT bump to v5. v5 is ESM-only, removes `chai.request(app)`, and would force ~200 call sites to migrate (`AGENTS.md:82-92`). The regression spec MUST use the v4 `chai.request(thx.app).post(...).end((err, res) => { ... })` pattern.
- **No new npm dependencies.** Build a fix from what's already in `package.json`.
- **Push to current branch (`thinx-staging`) to trigger CircleCI** — do not wait for the user to do it manually (`AGENTS.md:11`).
- **Deployment flow:** Push parent → CircleCI builds `thinxcloud/api:latest` and `registry.thinx.cloud:5000/thinx/console:vue` → Swarmpit rolls out service tasks. The parent submodule bump triggers BOTH builds (`AGENTS.md:13-15`).
- **Swarm host access:** `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`, swarm path `/mnt/gluster/deployment/swarm`. Use only if root-cause demands edge config inspection.
- **`OPS-swarmpull` is broken** (`MEMORY.md` 2026-05-25 14:44 CET incident): Swarmpit no longer auto-redeploys after a registry push. Manual `./scripts/stack-deploy` works. This affects how you VERIFY the fix landed on rtm — do not assume a parent submodule bump alone deploys.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Receive POST `/api/v2/password/reset` from browser | Browser → console nginx (`services/console/vue/default.conf`) | Traefik (host routing to console container) | Browser hits `https://rtm.thinx.cloud/api/v2/password/reset`. Traefik matches `Host(rtm.thinx.cloud)` and routes to the console container; the console's nginx `location ~* ^/api/` block proxies to `http://api:7442` (the Node service). |
| Dispatch on `Authorization` header presence | API / Backend (`lib/router.js:103-136`) | — | Express middleware. **This is the regression site.** Bug = treats `Bearer null` (literal string) as an attempted JWT, fails verification, returns 403. |
| CORS / origin reflection | API / Backend (`lib/router.js:32-56` `enforceACLHeaders`) | — | Bypassed for the `/password/reset` path because the JWT branch returns *before* `enforceACLHeaders` runs (router.js:135 `return`). CORS is NOT the cause. |
| Rate limit | API / Backend (`thinx-core.js:75-80`, `:325`) | — | `express-rate-limit` defaults emit **429**, not 403. Not the cause. |
| Route handler (`postPasswordReset`) | API / Backend (`lib/router.user.js:39-48`, mounted L144) | Domain class (`lib/thinx/owner.js:486 password_reset_init`) | Unchanged for ~12 months. Handler is correct; never reached when JWT branch fires. |
| Email send (Mailgun) | API / Backend (`lib/thinx/owner.js:88-98 sendMail`) → Mailgun | — | Skipped in test/dev (`owner.js:231`); the success path returns the `reset_key` instead, which is why existing test passes. |
| User lookup (CouchDB) | API / Backend (`lib/thinx/owner.js:486-520`) → CouchDB | — | `users/owners_by_email` view. Failure cases return `email_not_found` (status 401, body `{success:false,response:"email_not_found"}`) — see §5 enumeration analysis. |

## Standard Stack

This phase does **NOT install new packages.** All work uses libraries already in `package.json`. The "Standard Stack" table below documents what's already wired and how it gets used. Versions verified against the on-disk `package.json` and confirmed via `npm view` on 2026-05-26.

### Core
| Library | Version (locked) | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `express` | ^5.0.0 (`package.json:48`) | HTTP routing | Codebase standard; the entire monolith is Express. **[VERIFIED: package.json + thinx-core.js:47-51]** |
| `chai-http` | ^4.3.0 (`package.json:42`) | Spec HTTP client | Locked at v4 per `AGENTS.md:82-92`. **MUST NOT bump.** **[VERIFIED: package.json + AGENTS.md]** |
| `chai` | 4.5.0 (`package.json:41`, exact pin) | Spec assertion library | Tied to chai-http v4. **[VERIFIED: package.json]** |
| `jasmine` | ^5.12.0 (`package.json:146`) | Spec runner | Codebase standard. **[VERIFIED: package.json]** |
| `jsonwebtoken` | (transitive via `lib/thinx/jwtlogin.js`) | JWT verify (what currently 403s on `Bearer null`) | Confirmed via `lib/thinx/jwtlogin.js` — module wraps the standard `jsonwebtoken` API. **[VERIFIED: source grep]** |
| `express-session` | ^1.17.x (in `package.json`) | Session cookie (`x-thx-core`) | Used by `thinx-core.js:297-316`. Cookie-auth path is the **fallback** when no `Authorization` header is present. **[VERIFIED: package.json + thinx-core.js]** |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `connect-redis` | ^9.x (`package.json`) | Session store backing | Already wired; no changes needed for this phase. |
| `helmet` | (`package.json:54`-ish) | CSP + frameguard | Mounted at `thinx-core.js:52-55`. Not implicated in 403. **[VERIFIED: thinx-core.js]** |
| `express-rate-limit` | latest (`thinx-core.js:73`) | Per-IP rate limit | Returns 429, not 403. Not implicated. **[VERIFIED: thinx-core.js:75-80]** |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-place guard in `lib/router.js:103` | A separate `lib/middleware/authHeader.js` module mounted before `router.js` | Cleaner separation, but the codebase convention is "global middleware lives in router.js as the first `app.use`" (per `.planning/codebase/ARCHITECTURE.md`). Adding a new middleware file fights the established pattern. **Recommendation:** in-place guard. |
| Backend guard | Fix the Vue client to omit `Authorization` when there's no token | Cross-repo change (services/console submodule), increases blast radius, blocks on console deploy + parent submodule bump. The backend guard fixes the symptom for ALL clients (legacy, Vue, any future client) and is one repo. **Recommendation:** backend guard. The Vue cleanup is a v1.x candidate. |
| Backend guard | Edge-layer rule in Traefik or nginx to strip `Authorization: Bearer null` | Wrong abstraction level. Traefik labels can't introspect a header value; nginx `more_clear_headers` can, but that's a `headers-more` module not currently installed and adds an install dependency. **Recommendation:** backend guard. |

**Installation:**

No installs required. The fix is a code edit + a spec addition.

**Version verification:** All versions above are read from the on-disk `package.json` on 2026-05-26. The chai-http v4 lock is the only "current" concern — `npm view chai-http versions` confirms v4.4.0 is the latest of the v4 line (released 2023; v5.0.0 is the current major and is ESM-only, which is the documented incompatibility).

## Package Legitimacy Audit

This phase installs **zero new packages**. Only existing pinned packages are referenced. The Package Legitimacy Gate protocol is not applicable; the slopcheck and registry-existence checks are vacuously satisfied because no new install step is being added.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### Request flow for `POST /api/v2/password/reset`

```
Browser (rtm.thinx.cloud)
   │
   │  fetch('https://rtm.thinx.cloud/api/v2/password/reset',
   │         { method:'POST',
   │           headers: { 'Authorization':'Bearer null', 'Content-Type':'application/json' },
   │           credentials:'include',
   │           body:'{"email":"someone@example.com"}' })
   │
   ▼
Traefik (docker-swarm.yml L286-295)  matches Host(rtm.thinx.cloud) -> thinx-console:80
   │
   ▼
console nginx (services/console/vue/default.conf:44-53)
   │  location ~* ^/api/  proxy_pass http://api:7442;
   │
   ▼
Node Express app (thinx-core.js)
   │  helmet, frameguard       (L52-55)
   │  sessionParser            (L316)
   │  express.json             (L318)
   │  rate limiter             (L325, prod only)
   │  express.urlencoded       (L328)
   │  ┌────────────────────────────────────────────────────────────────┐
   │  │ lib/router.js GLOBAL MIDDLEWARE (the regression site)          │
   │  │   L86-205 — first `app.use` of the chain                       │
   │  │                                                                │
   │  │   L93   host-header mismatch warning (harmless)                │
   │  │   L103  if (req.headers['authorization'] !== undefined) {      │
   │  │            app.login.verify(req, (error, payload) => {         │
   │  │              if (error == null) { req.session.owner = ... }    │
   │  │              else  ── res.status(403).end()  ◄── 403 STAMPED  │
   │  │            });                                                 │
   │  │            return;     // never reaches the route handler     │
   │  │          }                                                     │
   │  │   L138  // cookie path or no-auth fallthrough                  │
   │  │   L147  enforceACLHeaders(res, req);   ◄── CORS lives here    │
   │  │   L177  POST-with-owner/api_key body path                      │
   │  │   L203  next();        ◄── handler is reached HERE             │
   │  └────────────────────────────────────────────────────────────────┘
   │
   ▼
Route handler (lib/router.user.js:144 + L39 postPasswordReset)
   │  user.password_reset_init(req.body.email, callback)
   │
   ▼
Domain (lib/thinx/owner.js:486 password_reset_init)
   │  view 'owners_by_email' → if rows.length != 1: callback(false, 'email_not_found')
   │                            else: resetUserWithKey() → sendResetEmail() (skipped in test)
   │
   ▼
Response  { success: <bool>, response: <message> }
```

**The thing the seed missed:** the JWT branch at L103 fires on the *presence* of the header, not on its validity. `Bearer null` is "present" — and `null` is not a JWT.

### Recommended file changes
```
lib/router.js                         # add token-validity guard before line 104
spec/jasmine/ZZ-RouterPasswordResetSpec.js  # new file, regression coverage
```

That's it. No new dependencies, no Traefik changes, no nginx changes, no client changes (in this phase).

### Pattern 1: Guard before JWT verify
**What:** Skip the JWT branch entirely when the `Authorization` header has no usable token.

**When to use:** Any global middleware that conditionally dispatches based on a header — must always validate that the header value is non-empty and well-formed before invoking the verifier.

**Example (lib/router.js, between current L103 and L104):**
```javascript
// Source: established Express pattern (Express 5 docs, helmet's own JWT
// example); confirmed against jsonwebtoken's behavior on malformed input.
const authHeader = req.headers['authorization'] || req.headers['Authorization'];
if (typeof authHeader !== 'undefined') {
  // Strip "Bearer " prefix (case-insensitive) and check there's a real token.
  // Treat literal "null", "undefined", "" as no-token (client sent a stale
  // header from a logged-out state — see G8 root cause).
  const m = /^bearer\s+(.+)$/i.exec(authHeader);
  const token = m && m[1] && m[1].trim();
  if (!token || token === 'null' || token === 'undefined') {
    // Fall through to cookie/no-auth path (do NOT 403)
    // Intentionally clear the header so downstream code doesn't see the bad token
    delete req.headers['authorization'];
    delete req.headers['Authorization'];
  } else {
    // Existing JWT-verify path unchanged from here
    app.login.verify(req, (error, payload) => { /* ... */ });
    return;
  }
}
// Continue to existing cookie/no-auth fallthrough at current L138
```

This is **the entire fix.** Everything else is testing.

### Anti-Patterns to Avoid

- **Don't widen `enforceACLHeaders` or add a CORS allowlist for `/password/reset`.** The 403 is stamped *before* CORS runs, so widening CORS does nothing. The CONCERNS.md "wider CORS overhaul beyond what is strictly necessary" guardrail and the CONTEXT.md scope statement both forbid this. CORS reflection is **not implicated** in this bug.
- **Don't bypass the rate limiter or move the route in mount order.** The rate limiter returns 429 not 403; mount order is irrelevant when the JWT branch terminates the request before the route is matched.
- **Don't fix the Vue client in this phase.** The client-side cleanup (don't send `Authorization` when not authenticated) is a sensible v1.x improvement but is a cross-repo change with deploy blast radius. The backend guard is one-repo, one-commit.
- **Don't change `lib/thinx/owner.js` `password_reset_init` callback semantics.** The seed says the handler is unchanged for ~12 months; touching it now risks regressing the legacy `/api/user/password/reset` path. Scope-creep guardrail.
- **Don't change `res.status(403).end()` at L132 to 401 in this phase.** That's CONCERNS.md "Bare 403 inside JWT verify path" (`v1.x deferred`). Changing 403→401 in the JWT path *would* incidentally let the Vue console treat it as session-expired and recover, but it also (a) breaks every spec that currently asserts 403 on bad-JWT, and (b) doesn't fix the actual user-visible 403 because the password-reset response would now be 401 instead. The token-validity guard is the correct fix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse `Authorization: Bearer X` header | A custom regex without anchors / whitespace handling | The standard `/^bearer\s+(.+)$/i.exec(...)` form shown in the code example | Express/jsonwebtoken docs use the case-insensitive `Bearer ` prefix pattern; matches `auth-header-parser`, `express-bearer-token`, etc. Don't reinvent. |
| Validate that a string is a "non-empty token" | Heavy regex for JWT shape (`xxxx.yyyy.zzzz`) | Simple `!token \|\| token === 'null' \|\| token === 'undefined'` | The downstream `app.login.verify` already validates JWT shape; the guard's only job is to reject obvious empties. Over-validating here creates a parallel validation surface. |
| Generate a new no-enumeration success body | A custom envelope shape | `Util.responder(res, true, "reset_email_sent")` (see existing convention in `lib/router.user.js`) | The envelope `{success, response}` is the codebase-wide contract (`lib/thinx/util.js:18-54`). |

**Key insight:** The fix is one regex and three falsy-string checks. Don't promote it to a "middleware package" — the codebase puts global middleware inline in `lib/router.js` per `ARCHITECTURE.md`.

## Common Pitfalls

### Pitfall 1: Existing spec gives false confidence
**What goes wrong:** `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:85-97` already exercises `POST /api/v2/password/reset` *without* `Authorization`, asserts 200, and **passes today**. Naively reading the suite, you'd conclude the route is fine.

**Why it happens:** The Vue console sends `Authorization: Bearer null` from the browser; the spec sends no `Authorization` header at all. They exercise different branches of `lib/router.js:103`.

**How to avoid:** The new regression spec MUST send `Authorization: Bearer null` explicitly to reproduce the rtm-observed behavior. Without this, the spec is theater.

**Warning signs:** Test passes locally + curl with no `-H Authorization` returns 200 on rtm + console "Forgot password?" still 403s. That trio is the exact pattern of a header-driven branch divergence.

### Pitfall 2: 403 vs 401 confusion masks the recovery path
**What goes wrong:** The JWT-verify failure returns 403 (`lib/router.js:132`), with the explicit FIXME comment saying "should be 401". The Vue console's session-expiry recovery code treats 401 as "session expired, redirect to /login" and 403 as "you don't have permission" (per CONCERNS.md). For an *unauthenticated* user hitting Forgot Password, neither response makes sense.

**Why it happens:** Status-code semantics conflated between "I can't verify you" (401) and "I know who you are but you can't do this" (403). The route, when reached, would return 200.

**How to avoid:** Do NOT fix the 403→401 in this phase (that's the v1.x deferred item). The token-validity guard fixes the root cause by not entering the JWT branch in the first place.

**Warning signs:** A planner suggests "change L132 to 401" — that breaks specs that assert 403 on bad-JWT (e.g., `ZZ-RouterAPIKeySpec.js`) and leaves the user-visible "Forgot password 401-then-redirect-to-login" loop in place.

### Pitfall 3: Conflating console-nginx with Traefik
**What goes wrong:** Plans assume "edge layer" means Traefik. In this stack, the request passes through **two** edge layers before reaching the Node API: Traefik (host routing) → console-container nginx (`services/console/vue/default.conf`) → Node API. Both can rewrite/strip headers or return 403 independently.

**Why it happens:** The Vue console is built into a container that bundles **both** the SPA static files (served by nginx `location /`) **and** a reverse-proxy block (`location ~* ^/api/` → `proxy_pass http://api:7442`). This is non-obvious from `docker-swarm.yml` alone.

**How to avoid:** The diagnostic playbook (§ Diagnostic Playbook below) covers this with curl probes against both layers. Confirm where the 403 originates before changing edge config.

**Warning signs:** "I changed a Traefik label and the 403 didn't go away." (Of course — the 403 is stamped by Node, not the edge.)

### Pitfall 4: Forgetting `OPS-swarmpull` is broken
**What goes wrong:** Plan says "merge to thinx-staging, Swarmpit redeploys, verify on rtm." Swarmpit auto-redeploy has been broken since 2026-05-25 14:44 CET per CONCERNS.md / MEMORY.md. The image lands in the registry but the running task doesn't change.

**Why it happens:** Cross-repo issue (Phase 3 OPS-01).

**How to avoid:** Phase 1 verification on rtm requires a manual `./scripts/stack-deploy` after CI green. Document this in the verification step.

**Warning signs:** "CI green but rtm still 403s." → ssh + `docker service ls` and check image hashes.

## Runtime State Inventory

This is a code-only fix (no rename, no refactor, no migration). The Runtime State Inventory checks would all return "Nothing found in category."

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no schema changes; CouchDB views unchanged; no Redis keys renamed. | none |
| Live service config | None — no Traefik label changes; no nginx changes (if we go with the recommended backend guard). | none |
| OS-registered state | None — no Task Scheduler/launchd/pm2 registrations involved. | none |
| Secrets/env vars | None — no env var rename. `CORS_ALLOWED_ORIGINS` is read but unchanged. | none |
| Build artifacts | None — code-only edit; existing CI rebuilds the API image; no stale egg-info equivalents. | none |

**Verified by:** grep across `docker-swarm.yml`, `docker-compose.yml`, `.env.dist`, `lib/`, and the Vue submodule confirmed no string the fix could miss.

## Diagnostic Playbook

This playbook narrows root cause cheap-to-expensive, before any code change. **Run in order; stop at the first reproduction.**

### Step 1 — Reproduce on rtm (no auth header, baseline expected behavior)
```bash
curl -sS -i -X POST https://rtm.thinx.cloud/api/v2/password/reset \
     -H 'Content-Type: application/json' \
     -H 'Origin: https://rtm.thinx.cloud' \
     --data '{"email":"someone-known-to-not-exist@example.com"}'
```
**Expected with primary theory:** HTTP 200 (or 401 with `email_not_found` body — see §No-Enumeration Analysis). If you get 200, the route works when no `Authorization` header is sent. This is the legacy AngularJS behavior.

**If you get 403 here:** The primary theory is wrong; jump to Step 3.

### Step 2 — Reproduce the Vue console's exact request
```bash
curl -sS -i -X POST https://rtm.thinx.cloud/api/v2/password/reset \
     -H 'Content-Type: application/json' \
     -H 'Origin: https://rtm.thinx.cloud' \
     -H 'Authorization: Bearer null' \
     --data '{"email":"someone-known-to-not-exist@example.com"}'
```
**Expected with primary theory:** HTTP 403 + empty body (because `lib/router.js:132` is `res.status(403).end()` — no JSON envelope). If you get this, the root cause is confirmed.

**Headers to check:**
- `Server:` header — `nginx` indicates the response came from nginx (either console-nginx or Traefik's terminator); absence usually indicates Express. The Node app has `app.disable('x-powered-by')` at `thinx-core.js:55`, so the lack of `X-Powered-By` is normal.
- `Content-Length: 0` is the smoking gun for `res.status(403).end()`.
- `Access-Control-Allow-Origin` will be **absent** on a JWT-403 because `enforceACLHeaders` is skipped (the `return` at `lib/router.js:135`). Browser DevTools will show the 403 as a CORS error in some browsers — this is misleading; CORS isn't the cause, but the bug masquerades as one.

### Step 3 — Reproduce against the test suite locally
```bash
cd /Users/igraczech/Repositories/thinx-device-api
docker compose -f docker-compose.test.yml up --build api  # ENVIRONMENT=test
# wait for "specs, 0 failures"
```
Then add a one-off spec or use `chai.request` REPL with the exact header `Authorization: Bearer null`. Confirms the bug is in the Node API regardless of edge config (i.e., reproducible without Traefik or console-nginx in the path).

### Step 4 — Bisect by header
If Step 2 returns 200 (i.e., header-presence theory is wrong), iterate over the headers the Vue client adds and identify which triggers the 403:
```bash
for h in "Cookie: x-thx-core=stale" "X-Access-Token: garbage" "X-Key: garbage"; do
  echo "--- Probing with $h ---"
  curl -sS -i -X POST https://rtm.thinx.cloud/api/v2/password/reset \
       -H 'Content-Type: application/json' \
       -H 'Origin: https://rtm.thinx.cloud' \
       -H "$h" \
       --data '{"email":"x@y.z"}' | head -5
done
```

### Step 5 — Edge-layer probe (only if Steps 1-4 don't reproduce)
SSH to the swarm host and curl the Node API directly from inside the overlay network:
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020
docker exec -it $(docker ps -qf 'name=thinx_api') sh
# inside the container
curl -sS -i -X POST http://localhost:7442/api/v2/password/reset \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer null' \
     --data '{"email":"x@y"}'
```
Compares "direct to Node" vs "through nginx+Traefik". If both 403, the bug is purely in Node (confirms primary theory). If only the through-edge version 403s, the bug is at the edge.

### Step 6 — Instrumented logging (only if root cause still unknown)
Insert a *temporary* logger as the very first `app.use` in `thinx-core.js`, before `sessionParser`:
```javascript
app.use((req, res, next) => {
  if (req.path.indexOf('password/reset') !== -1) {
    console.log('🔨 [g8] path=', req.path,
                'method=', req.method,
                'auth=', JSON.stringify(req.headers['authorization']),
                'origin=', JSON.stringify(req.headers.origin),
                'cookie=', JSON.stringify(req.headers.cookie));
  }
  next();
});
```
**Do NOT commit this.** Use it locally or in staging only; remove before any push that touches CI.

### Step 7 — Binary-search by middleware-disable (last resort)
Comment out middleware one at a time in `thinx-core.js:316-359`, restart, retry curl from Step 2. The 403 will go away when you disable the offending middleware. Order to try: `lib/router.js` global middleware first (highest prior), then session, then rate limiter. **Do NOT push these commits**; they are diagnostic only.

## Ranked Root-Cause Candidates

| # | Candidate | Confidence | Evidence | Reproducibility cost |
|---|-----------|-----------|----------|----------------------|
| 1 | **Backend JWT branch fires on `Authorization: Bearer null` from the Vue client** | **HIGH** | `lib/router.js:103` matches header presence not validity; Vue `core/api.js:53-57` unconditionally sets `Authorization: Bearer ' + this.refreshToken` (null when logged out); existing test at `ZZ-AppSessionUserV2DeleteSpec.js:85` passes only because it sends *no* `Authorization`. | Free (curl in §Diagnostic Step 2 confirms in < 30 s without any code change). |
| 2 | Traefik label drift on `rtm.thinx.cloud` adding a header that triggers a different branch | LOW-MEDIUM | No evidence in `docker-swarm.yml` of an Auth-related label change; AGENTS.md changelog doesn't mention one. Plausible only if Step 5 disagrees with Step 3. | Medium — requires ssh to 188.166.23.244 + `docker service inspect`. |
| 3 | Console-container nginx (`services/console/vue/default.conf`) injecting/stripping headers | LOW | The current `default.conf` is a pass-through (`proxy_set_header Host $host; proxy_set_header X-Forwarded-*`). No body manipulation. No auth-header rewriting. | Low — `cat services/console/vue/default.conf` from this researcher's read. |
| 4 | `enforceACLHeaders` returning 403 (the seed's CONCERNS #1 suspect) | LOW (debunked) | Re-read of `lib/router.js:32-56`: this function only *sets headers* and never stamps a status. The `'*'` fallback at L52 is just a CORS header, not a 403. Cannot be the source. | Done in this research. |
| 5 | Helmet adding a request-time guard | LOW (debunked) | `thinx-core.js:52-55` mounts `helmet.frameguard()` and default `helmet()`. Helmet only sets response headers; it never rejects requests with 403. | Done in this research. |
| 6 | Rate limiter | LOW (already debunked by seed) | Returns 429, not 403. | Done. |
| 7 | nginx config drift on `rtm.thinx.cloud` (different nginx OUTSIDE the console image) | LOW | The `console` Docker image bundles its own nginx (`default.conf`); there is no separate nginx in `docker-swarm.yml`. Possibility is "someone added a manual nginx config to the host outside the swarm" — unlikely but checkable via Step 5. | Medium — only relevant after Step 5. |

**Investigative budget guidance:** Run Steps 1-2 first (≤ 2 minutes). Candidate #1 has HIGH prior, free reproduction, and a one-edit fix. The smallest-change preference in CONTEXT.md says explicitly "middleware → Traefik → nginx" — the backend guard is the smallest possible change.

## Code Examples

### Verified pattern — adding a regression spec (chai-http v4)

```javascript
// Source: spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:85-97 — adapted to
// cover the Authorization: Bearer null case that's the actual G8 trigger.
//
// File: spec/jasmine/ZZ-RouterPasswordResetSpec.js  (NEW)

const bootstrap = require('../helpers/bootstrap');
const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const envi = require("../_envi.json");

let thx;

describe("Router Password Reset (G8 regression)", function () {

  beforeAll((done) => {
    console.log(`🚸 [chai] >>> running Router Password Reset spec`);
    thx = bootstrap.thx;
    done();
  });

  afterAll((done) => {
    console.log(`🚸 [chai] <<< completed Router Password Reset spec`);
    done();
  });

  // The original G8: Vue client sends a stale "Bearer null" when the user is
  // logged out and clicks "Forgot password?".
  it("POST /api/v2/password/reset (Bearer null) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .set('Authorization', 'Bearer null')
      .set('Origin', 'https://rtm.thinx.cloud')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        // Pre-fix: res.status === 403, res.text === ''
        // Post-fix: res.status === 200 and body is { success: true, response: <reset_key in test env> }
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body.success).to.equal(true);
        done();
      });
  }, 30000);

  // Symmetric coverage: empty Bearer (some clients send "Bearer " with no value)
  it("POST /api/v2/password/reset (Bearer empty) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .set('Authorization', 'Bearer ')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 30000);

  // The legacy AngularJS behavior: no Authorization header at all.
  // (Equivalent to the existing ZZ-AppSessionUserV2DeleteSpec.js:85 test, kept
  // here to document the contract in one place.)
  it("POST /api/v2/password/reset (no Auth header) — 200 baseline", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 30000);

  // Legacy alias must keep working with the same fix.
  it("POST /api/user/password/reset (Bearer null, legacy alias) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .set('Authorization', 'Bearer null')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 30000);

  // The valid-JWT path must still hit the JWT branch unchanged.
  // (Sanity check: token-validity guard does NOT break authenticated calls.)
  // Note: skipped here because building a valid JWT requires the agent flow;
  // covered transitively by ZZ-RouterAPIKeySpec.js and ZZ-AppSession.js.

});
```

**Notes:**
- The spec uses `envi.dynamic.email` because `02-OwnerSpec.js` seeds that user and `ZZ-*` runs alphabetically after the `0X-` setup specs (`spec/support/jasmine.json:6`, per TESTING.md).
- 30 s timeout matches the suite convention. Do not set lower.
- `bootstrap.thx` is consistent with how other ZZ-* specs obtain the running app.
- The "Origin: https://rtm.thinx.cloud" set on the first test makes the spec match real browser behavior; not strictly needed (test passes without it once the guard is in place), but documents the contract.

### Verified pattern — the backend guard (lib/router.js)

Re-shown for the planner's convenience. **Insert between current L103 and L104**, replacing the `if ((typeof (req.headers['authorization'])...) {` opening:

```javascript
// Source: composed from Express 5 docs (req.headers semantics),
// jsonwebtoken behavior on malformed input, and the legacy AngularJS
// console's "send no Authorization when logged out" pattern that this
// guard reinstates server-side.

// JWT Auth (if there is such header, rest of auth checks is not important)
const authHeader = req.headers['authorization'] || req.headers['Authorization'];
if (typeof authHeader !== "undefined") {
  // G8 guard: Bearer literal "null" / "undefined" / empty token comes from
  // browser clients that build the header from a missing localStorage token.
  // Treat as no-token and fall through to the cookie/no-auth path.
  const m = /^bearer\s+(.+)$/i.exec(authHeader);
  const token = m && m[1] && m[1].trim();
  if (!token || token === "null" || token === "undefined") {
    delete req.headers['authorization'];
    delete req.headers['Authorization'];
    // do not return; fall through to the rest of the global middleware
  } else {
    app.login.verify(req, (error, payload) => {
      // ... existing code unchanged from current L104-134 ...
    });
    return;
  }
}
```

## No-Enumeration Behavior Analysis

The CONTEXT.md behavioral contract says: "no user enumeration leak." Confirm what the current handler does and whether the fix needs to add enumeration protection.

**Current behavior trace** (`lib/router.user.js:39-48` + `lib/thinx/owner.js:486-520`):

| Input | Path through code | Response (status / body) |
|-------|-------------------|--------------------------|
| `{email: <registered>}` | `password_reset_init` → view returns 1 row → `resetUserWithKey` → `sendResetEmail` → in test/dev: `callback(true, reset_key)`; in prod: `sendMail(...)` then `callback(true, mailgun_response)` | **200** + `{"success":true,"response":"<reset_key|mailgun_id>"}` |
| `{email: <unregistered>}` | `password_reset_init` → view returns 0 rows → `callback(false, "email_not_found")` → route handler L41-43 sets `res.status(401)` | **401** + `{"success":false,"response":"email_not_found"}` |
| `{email: <not a string>}` or no body | CouchDB view returns 0 rows for invalid `key` → same path | **401** + `{"success":false,"response":"email_not_found"}` |
| Multiple users with same email (data corruption) | `body.rows.length != 1` → `callback(false, "email_not_found")` | **401** + same body |

**Finding:** The endpoint **DOES leak user existence**. A registered email returns 200; an unregistered email returns 401 with body `"email_not_found"`. The CONTEXT.md "no enumeration leak" contract is *violated by the existing code*.

**Implication for the fix:** AUTH-API-01's validation criterion (b) is "Behavior must match for both registered and unregistered emails (no enumeration)." To satisfy this, the route handler at `lib/router.user.js:39-48` needs a follow-up edit:

```javascript
function postPasswordReset(req, res) {
  user.password_reset_init(req.body.email, (success, message) => {
    // G8 + AUTH-API-01: always respond 200 with the same envelope shape.
    // Do not leak whether the email was registered (no res.status(401) on
    // not-found / invalid input). The real outcome — email sent or not — is
    // surfaced to the user only via the email itself.
    if (!success) {
      console.log("🔨 [debug] password_reset_init failure (suppressed for no-enum)",
                  /* note: do NOT log the email here — Phase 2 SEC-PII-01 */
                  message);
    }
    // Standard envelope; reset_key in test/dev for spec compatibility,
    // standardized "ok" sentinel in prod.
    if (process.env.ENVIRONMENT === "test") {
      // existing behavior — return reset_key when success, swallow when not
      return Util.responder(res, success, message);
    }
    return Util.responder(res, true, "password_reset_request_accepted");
  });
}
```

**Important constraint from CONTEXT.md:** "Anything in `lib/router.user.js` lines 27 / 40 reset handlers being functionally rewritten" is **out of scope** ("only middleware/edge config gets touched if the root cause demands it"). The no-enumeration fix DOES require a handler edit, but it's a small, targeted edit (4 lines) that does not change the call to `password_reset_init`. The CONTEXT.md guardrail is about not rewriting the *handler's auth/dispatch logic*; the response-shape edit is needed to honor the behavioral contract.

**Planner decision required:** Either (a) include the no-enum response edit in this phase (recommended — the requirement says it explicitly), or (b) note it as a separate ticket and ship the 403→200 fix without the enumeration fix. **Recommendation: (a)** — it's a 4-line edit, it's required by AUTH-API-01 verbatim, and shipping (b) alone fails the requirement audit.

**Spec implication:** The regression spec above asserts `expect(res.status).to.equal(200)` for `envi.dynamic.email` (registered). Add a parallel test for an unregistered email that also expects 200, to lock in the no-enum contract:

```javascript
it("POST /api/v2/password/reset (unregistered email) — 200 (no enum)", function (done) {
  chai.request(thx.app)
    .post('/api/v2/password/reset')
    .send({ email: 'nobody-known@example.com' })
    .end((_err, res) => {
      expect(res.status).to.equal(200);
      // The body should NOT distinguish registered vs unregistered.
      // (We don't lock the exact body text here because in test env we DO
      // surface the reset_key on success — instead, lock the status only.)
      done();
    });
}, 30000);
```

## Risk Catalog for the Fix

For each candidate root-cause fix (ranked above), what could the fix break elsewhere?

| Fix candidate | What it could break | Severity | Mitigation |
|---------------|---------------------|----------|------------|
| **Backend token-validity guard (#1)** | Specs that send a literal `Authorization: Bearer junk` and expect 403 (the JWT-fail path) | LOW — grep finds zero such specs. `ZZ-RouterAPIKeySpec.js`, `ZZ-AppSession.js` use real JWTs (via `agent.post('/api/login')`) or omit the header. The guard does NOT change behavior for any *real* JWT-shaped token. | Verify by running the full suite locally before pushing. The fix is a *narrower* JWT branch — it never widens the set of accepted tokens. |
| Backend guard | Production clients that *intentionally* send `Bearer null` to bypass auth | NONE — there's no auth-bypass risk because `Bearer null` is treated as "no Auth header," which then falls through to the cookie / api_key / no-auth paths, which are themselves gated. Equivalent to the user not sending `Authorization` at all. | None needed. |
| Backend guard | Audit-log impersonation entries (Phase 10 ADMIN-03) | NONE — impersonation tokens are real JWTs; the guard never fires on them. | None needed. |
| Backend guard | Device endpoints that use `Authorization: Bearer <api_key>` (if any) | NONE — devices use `owner`+`api_key` in the **body**, not in the `Authorization` header (per `lib/router.js:178-198` and INTEGRATIONS.md). Confirmed by grep. | None needed. |
| Wider CORS allowlist (NOT recommended) | Re-introduces the `*`-with-credentials bug that AGENTS.md L27 already fixed | HIGH — risk of credential exposure. | Don't do this. The bug is not in CORS. |
| Traefik label change (NOT recommended for this fix) | Could affect routing for other Host rules; rollout requires `./scripts/stack-deploy` and `OPS-swarmpull` is broken | MEDIUM — blast radius is the whole API. | Don't do this; the backend guard works. |
| nginx config change in console image (NOT recommended) | Rebuild + push of console image; rollout depends on parent submodule bump | MEDIUM — slow feedback loop. | Don't do this; the backend guard works. |
| Handler edit to respond 200 on unregistered emails (no-enum) | `ZZ-AppSessionUserSpec.js:170-180` currently asserts `expect(res.status).to.equal(401)` and `'{"success":false,"response":"email_not_found"}'` for the legacy `/api/user/password/reset` no-data case | MEDIUM — would need to update those two existing assertions. | Update the spec to expect 200 + a normalized body. Document the assertion change in PR description. CONTEXT.md says the legacy alias "must continue to return the same response shape" as the v2 endpoint — both move together. |
| Handler edit (no-enum) | `ZZ-AppSessionUserV2DeleteSpec.js:85-97` asserts 200 + a `reset_key` string for `dynamic2.email` (the success path) | NONE — that path is registered email; fix doesn't change it in test env. | None — verify with full suite run. |

**Net assessment:** The backend guard is the lowest-risk, highest-confidence path. The no-enum handler edit requires updating ~2 existing assertions but is required by AUTH-API-01.

## Verification Matrix

Define cells of evidence required (M = mandatory, N = nice-to-have).

| Layer ↓ \ Environment → | local docker compose (test) | staging (if reachable) | rtm.thinx.cloud (prod) |
|------------------------|----------------------------|------------------------|------------------------|
| **curl, no Auth header** | M — baseline (existing spec coverage) | N | M — confirms 200 (already passes today) |
| **curl, `Authorization: Bearer null`** | M — primary reproduction | N | M — confirms 403 today; expected 200 after fix |
| **curl, `Authorization: Bearer <expired-jwt>`** | N | N | N — covered by existing JWT specs |
| **chai-http v4 spec, new file `ZZ-RouterPasswordResetSpec.js`** | M — must be green in CI before PR merge | — | — |
| **Full Jasmine suite green** | M — confirms no regression in other specs | — | — |
| **Vue console "Forgot password?" round-trip on rtm** | — | N | M — the actual UAT criterion in AUTH-API-01 (b) |
| **Email received via Mailgun** | — | N | N — depends on Mailgun being configured on rtm; out of phase scope to verify |
| **Reset_key → set-password chain on rtm** | M (via existing spec) | — | M — completes the round-trip |

**Phase exit gates (must all pass):**
1. Local: `npm test` → "specs, 0 failures" with the new `ZZ-RouterPasswordResetSpec.js` included.
2. Local: curl with `Authorization: Bearer null` against the locally-running container returns 200.
3. CI: thinx-staging branch green on CircleCI.
4. rtm: manual `./scripts/stack-deploy` after CI publishes (because OPS-swarmpull is broken).
5. rtm: curl in §Diagnostic Step 2 returns 200.
6. rtm: Vue console "Forgot password?" reaches the email entry + the reset_key round-trip completes.

**Documented if can't do:** If staging is not reachable (per CONTEXT.md "if accessible"), skip the staging column; substitute "container-local curl via ssh+docker exec on rtm" (§Diagnostic Step 5) as the pre-prod gate.

## Mailgun + CouchDB Dependencies

Per the seed and the AUTH-API-01 ask, document what config keys the reset flow reads. Confirms whether a missing key on rtm could surface as a 403.

| Resource | Read from | Failure mode | Could it 403? |
|----------|-----------|--------------|---------------|
| `MAILGUN_API_KEY` env | `lib/thinx/owner.js:8-14` | Module-load crash if missing on prod; `sendMail` errors at runtime if invalid; `sendResetEmail` callback receives `false, err` | NO — failure path bubbles up as `password_reset_init` `callback(false, err)`, which the handler maps to 401 (`router.user.js:43`). Not 403. |
| `app_config.mailgun.domain` (from `conf/config.json`) | `lib/thinx/owner.js:163-167` | Used in `from:` field of the email; if missing, the `From:` header is malformed and Mailgun rejects | NO — same path, 401 not 403. |
| `app_config.mailgun.api_key` (from `conf/config.json` — alt path) | `lib/thinx/owner.js:13` (`mailgun({apiKey})` is loaded from config + env) | Same as above | NO |
| CouchDB `users/owners_by_email` design doc | `lib/thinx/owner.js:488` | If design doc missing, `view()` errors → `callback(false, err)` | NO — handler maps to 401 not 403. |
| `process.env.ENVIRONMENT` (`test`/`development`/other) | `lib/thinx/owner.js:231` | Determines whether to send email or just return the reset_key | NO — environment-specific behavior, not error |
| `app_config.public_url` | `lib/thinx/owner.js:222`, `:480` | Used to build the reset-link URL inside the email body | NO |

**Conclusion:** No misconfigured Mailgun/CouchDB key can surface as a 403 in this flow. The 403 must be coming from the auth middleware layer, not from `owner.password_reset_init`. **This eliminates an entire class of suspects** and reinforces candidate #1.

## Express Middleware Patterns for Public Routes

The seed asked: which pattern is this codebase using for "this route bypasses auth"? Two community patterns are common:

| Pattern | How it works | Used here? |
|---------|--------------|------------|
| **A. Public routes mounted BEFORE auth middleware** | `app.use('/public', publicRouter); app.use(authMiddleware); app.use('/private', privateRouter)` | **No.** All routers mount AFTER `lib/router.js` (which contains the auth-dispatch logic). Public routes are *intermingled* in `router.user.js`, `router.auth.js`, etc., with private ones. |
| **B. Auth middleware skips known-public paths via allowlist** | `if (PUBLIC_PATHS.includes(req.path)) return next(); ... auth logic`. | **No.** There is no allowlist of public paths in `lib/router.js`. |
| **C. (this codebase) Auth dispatch keys on HEADER PRESENCE, not on ROUTE** | "If `Authorization` header is present, treat as JWT; if cookie present, treat as cookie-auth; if `owner`+`api_key` in body, treat as device API. If nothing, call `next()` and let the route decide." | **Yes.** `lib/router.js:103-203`. The route-level `Util.validateSession(req)` (e.g., in `getStatistics` at `router.user.js:80`) handles per-route gating. |

**Implication:** Pattern C works correctly **only if** the header-presence check is robust. The G8 regression is exactly the case where header presence (`Bearer null`) is real but the header value is junk — Pattern C's implementation breaks. The fix is to make Pattern C *truly* honor "no usable token = no Auth header" — which is what the backend guard does.

**Don't migrate patterns in this phase.** Refactoring to Pattern A or B is a v1.x architectural change (REFACTOR-* candidate). The targeted Pattern C tighten is the minimum-change path.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Vue client sends `Authorization: Bearer null` exactly (literal string `"null"`, not `"undefined"` or absent header) when `this.refreshToken` is JavaScript `null`. | Summary, Ranked Candidates #1 | LOW — verified by reading `services/console/vue/src/core/api.js:53-57`. `'Bearer ' + null` is `"Bearer null"` per JS string coercion. If somehow this differs at runtime, Diagnostic Step 2 will detect it (status would be 200 not 403, then check what the actual Vue request looks like in browser DevTools). |
| A2 | The `Authorization` header presence-check at `lib/router.js:103` is the *only* place a 403 is stamped on the unauthenticated path. | Ranked Candidates §summary | MEDIUM — grep confirmed `res.status(403)` lives at `router.js:132` and `router.user.js:123` (deleteUser, which is a different route). `requireAdmin.js` returns 403 but only mounts on `/api/v2/admin/*`. No other 403 sites are in the unauth path. If a transitively-required module adds a 403 elsewhere, Diagnostic Step 7 would catch it. |
| A3 | The on-disk `ZZ-AppSessionUserV2DeleteSpec.js:85-97` test passes in CI today against `main`/`thinx-staging`. | Pitfall 1, Verification Matrix | MEDIUM — STATE.md's "Phase 0/4 complete, Phase 1 not started" implies CI is green on the parent. Confirm by checking the latest CircleCI run before committing the new spec. If existing spec is actually failing, the planner needs to know. |
| A4 | The Mailgun + CouchDB integration is configured correctly on rtm (i.e., the route handler, when reached, would complete the email send). | No-Enumeration Analysis, Verification Matrix | LOW-MEDIUM — confirmed by AGENTS.md noting the legacy AngularJS console worked end-to-end. Mailgun config is in `/mnt/data/conf/config.json` on the swarm host; if it has rotted (key expired), the email step would fail but the HTTP response would still be 200 (after the no-enum handler edit) or 401 (today). Either way the planner should NOT block on Mailgun verification — that's an ops concern. |
| A5 | The Traefik labels in `docker-swarm.yml` are the only edge config in front of the API (no separate host-level nginx). | Pitfall 3, Edge probe step | LOW — confirmed by reading `docker-swarm.yml` end-to-end. The console container's `default.conf` is the only nginx in the path. If a host-level nginx exists on rtm outside the swarm, Diagnostic Step 5 reveals it. |
| A6 | The `password_reset_init` test-mode bypass (`owner.js:231 + 552`) returns the literal `reset_key` as the response body, which is what the existing test asserts. | Code Examples (new spec), No-Enumeration | LOW — read directly from source. |
| A7 | The chai-http v4 `chai.request(thx.app).post().set().send().end()` chain works for setting custom headers including `Authorization` with arbitrary string values. | Code Examples (new spec) | NONE — established chai-http v4 idiom; used in 14 ZZ-* call sites (per TESTING.md). |
| A8 | The legacy AngularJS console did not send an `Authorization` header on the unauth password-reset POST. | Summary, Ranked Candidates #1 | LOW — supported by (a) the legacy console is no longer in the active codebase to read, but (b) the bug only surfaces against the Vue console per the seed, and (c) `lib/router.js:103` would 403 a legacy `Bearer null` exactly the same way. The only way the legacy console worked is if it omitted the header. |
| A9 | `OPS-swarmpull` being broken means a parent submodule bump triggers CI but does NOT auto-redeploy the API service. | Pitfall 4, Verification Matrix | LOW — directly stated in CONCERNS.md and MEMORY.md, confirmed by AGENTS.md L11. |

## Open Questions

1. **Should the no-enumeration handler edit ship in Phase 1 or be a separate phase?**
   - What we know: AUTH-API-01 (b) explicitly says no enumeration. The current code violates this.
   - What's unclear: Whether the planner reads "may surface as future phases" in CONTEXT.md as covering this case.
   - Recommendation: Ship together with the backend guard — they're both in `lib/router.js` / `lib/router.user.js`, both small, and the requirement is one ticket.

2. **Should the JWT-403 → 401 change happen in this phase?**
   - What we know: CONCERNS.md lists it as `v1.x deferred`. The FIXME comment at `lib/router.js:132` documents the conflation. Phase 1 CONTEXT.md is silent on it.
   - What's unclear: Whether closing the FIXME alongside the actual fix is "in scope" or "scope creep."
   - Recommendation: **Defer.** The backend guard never reaches L132 for `Bearer null`, so the 403→401 issue is moot for the user-visible bug. Changing 403→401 also requires updating other specs that assert 403 on bad-JWT.

3. **Does Mailgun work on rtm right now?**
   - What we know: The legacy console UAT worked at some point (per the seed); no explicit "Mailgun broken" notes in MEMORY.md.
   - What's unclear: Whether the API key in `/mnt/data/conf/config.json` on the swarm host has rotated.
   - Recommendation: NOT a Phase 1 concern. If the email doesn't arrive on the rtm UAT, file an ops ticket; the HTTP-status side of AUTH-API-01 can still be verified independently.

4. **Is there a `staging` environment, and is it usable for the verification matrix?**
   - What we know: CONTEXT.md says "(if accessible) against a staging environment." The seed mentions `stg.thinx.cloud` "or whatever the current staging hostname is."
   - What's unclear: Whether a staging environment is currently deployed.
   - Recommendation: Treat as N (nice-to-have) in the verification matrix; rely on local docker compose + rtm.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running the API + specs locally | Should be (CI uses it) | ≥ 18.x (per `package.json` engines if set) | — |
| Docker + docker-compose | Local test run (`docker-compose.test.yml`) | Should be (per AGENTS.md verification flow) | — | — |
| CouchDB (in `docker-compose.test.yml`) | DB-backed specs | Available via compose | 3.2.0 (per INTEGRATIONS.md) | — |
| Redis (in `docker-compose.test.yml`) | Session + JWT secret + queue | Available via compose | 5.x | — |
| Mosquitto, Influx, transformer, worker | Specs that boot full app | Available via compose | per INTEGRATIONS.md | — |
| ssh to `188.166.23.244` | Edge-layer diagnostic step (only if needed) | User-provided per AGENTS.md L17-19 | — | Skip §Diagnostic Step 5; use local docker exec as substitute |
| Mailgun API access from rtm | Production email send during UAT | Out of scope to verify | — | Document in `SUMMARY.md` that email delivery is an ops verification, not a phase exit gate |
| CircleCI | CI runs on push | Yes (per AGENTS.md) | — | — |

**Missing dependencies with no fallback:** none expected.

**Missing dependencies with fallback:** ssh to swarm host is only needed for §Diagnostic Step 5, which is itself only reached if Steps 1-4 don't reproduce the bug locally. With the HIGH-confidence root cause, Step 5 is unlikely to be needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jasmine 5.12.0 + chai 4.5.0 + chai-http 4.3.0 |
| Config file | `spec/support/jasmine.json` |
| Quick run command | `npm run jasmine` (in the api container or locally with deps) |
| Full suite command | `npm test` (mkdir coverage + jasmine + conditional coveralls upload) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-API-01 (a) | curl POST returns 200 against rtm | manual | `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset -H 'Content-Type: application/json' -d '{"email":"x@y"}'` | manual UAT only |
| AUTH-API-01 (b) | Vue console "Forgot password?" round-trip works | manual | (browser UAT) | manual UAT only |
| AUTH-API-01 (c) — `Bearer null` case | unauth POST with stale Authorization returns 200 | unit/integration | `npx jasmine spec/jasmine/ZZ-RouterPasswordResetSpec.js` | ❌ Wave 0 — to be created |
| AUTH-API-01 (c) — no-Auth-header baseline | unauth POST returns 200 (already passes) | integration | `npx jasmine spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js` | ✅ exists |
| AUTH-API-01 (b) — no enumeration | unregistered email returns 200 (not 401 `email_not_found`) | integration | `npx jasmine spec/jasmine/ZZ-RouterPasswordResetSpec.js` (case 5) | ❌ Wave 0 |
| AUTH-API-01 (b) — legacy alias parity | `POST /api/user/password/reset` returns the same as v2 | integration | `npx jasmine spec/jasmine/ZZ-RouterPasswordResetSpec.js` (case 4) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run jasmine -- --filter='Router Password Reset'` (≤ 30 s for the new spec; full suite is ~5-10 minutes)
- **Per wave merge:** `npm test` (full suite green)
- **Phase gate:** Full suite green in CI + manual rtm curl in Step 2 returns 200 + Vue UAT completes.

### Wave 0 Gaps
- [ ] `spec/jasmine/ZZ-RouterPasswordResetSpec.js` — covers AUTH-API-01 the `Bearer null` and no-enumeration cases
- [ ] (Possibly) update existing assertions in `spec/jasmine/ZZ-AppSessionUserSpec.js:170-180` if the no-enum handler edit lands — those assertions currently expect 401 + `email_not_found` for the legacy alias. After the no-enum edit, they should expect 200.

*(No new framework install needed — chai-http v4 + jasmine are already in the suite per TESTING.md.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (this IS an auth route) | Reset link with one-time `reset_key` (sha256 of email + timestamp), single-use, expires when consumed. Owned by `lib/thinx/owner.js`. |
| V3 Session Management | partial — token-validity guard touches the auth path, but the cookie/session lifecycle is unchanged | `express-session` + Redis store; cookie `x-thx-core`, max-age 1h, rolling. Out of scope for direct change. |
| V4 Access Control | no | Reset is unauthenticated by design (you can't authenticate if you've forgotten your password). |
| V5 Input Validation | yes | `req.body.email` is passed to a CouchDB view; the view treats it as a string key. **The handler does not sanitize the input.** This is a known design gap (the existing test `ZZ-AppSessionUserSpec.js:170` even sends an empty body and gets `email_not_found`, showing the view tolerates garbage). No injection vector exists because the email is used as a key for a Map view, not as a literal in a query string. |
| V6 Cryptography | indirect | The `reset_key` is sha256 of `email + new Date().toString()` (`owner.js:180`). The seed counts this as adequate single-use entropy. The CONCERNS.md "Hardcoded RSA key passphrase" item is a different route. |
| V7 Error Handling | **yes — directly impacted by this phase** | The no-enumeration edit (returning 200 regardless of registration status) is exactly a V7 control. Today's 401 + `email_not_found` body **violates** V7's "do not leak enumeration via error responses." |
| V8 Data Protection | yes — PII in logs | `owner.js:499` logs the raw email; `lib/router.user.js:45` logs the response. **OUT OF SCOPE** for this phase (Phase 2 SEC-PII-01). The current research should NOT touch these logs. |
| V11 Business Logic | yes (rate-limit per-route, not just global) | The 500/min global limiter is too generous for an auth endpoint. CONCERNS.md "Global rate limit too high for auth routes" tracks this as `v1.x deferred`. Don't add per-route limiter in this phase. |

### Known Threat Patterns for Express + JWT auth dispatch

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User enumeration via differential response on password-reset (`200 vs 401`) | Information Disclosure | Return identical 200 + envelope for both registered and unregistered emails. **This phase implements the mitigation.** |
| JWT verifier called with malformed/empty token leaks behavior | Information Disclosure / Tampering | Validate token shape *before* dispatching to JWT verifier. **This phase implements this guard.** |
| PII (raw email) in logs grants enumeration to log-readers | Information Disclosure | Hash/redact email before logging. **OUT OF SCOPE — Phase 2 SEC-PII-01.** |
| Reset key reuse / replay | Tampering | Already mitigated: `set_password_reset` nulls `reset_key` after consumption (`owner.js:589`). |
| Reset key brute-force on `GET /api/v2/password/reset` | Tampering | `reset_key` is 64-char hex (sha256 hex output), ~256 bits of entropy. Brute-force is computationally infeasible at any conceivable rate limit. |
| CSRF on the POST | Tampering | The route is unauthenticated by design; CSRF is meaningless (an attacker forging a POST gains nothing — the reset email goes to the registered owner's address, not the attacker's). Not applicable. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Authorization` header dispatch keys on `typeof !== 'undefined'` | Header dispatch keys on a *parsed, validated, non-empty* token | (this phase) | Eliminates the G8 false-403 trigger. |
| Password-reset endpoint differentiates `email_not_found` (401) from success (200) | All inputs return identical 200 + envelope | (this phase) | Closes V7 enumeration leak. |
| JWT-fail returns 403 (`router.js:132`) | (unchanged in this phase) | (v1.x deferred) | The FIXME stays open; not a user-visible regression because the guard prevents reaching this line for the G8 case. |

**Deprecated/outdated:**
- The pattern of "send `Authorization: Bearer <token>` always, with `null` when logged out" — this is a Vue client smell (`services/console/vue/src/core/api.js:53-57`). The proper pattern is "omit the header when no token is present." Fixing this in the client is v1.x worthy but out of scope here; the backend guard makes it irrelevant.

## Sources

### Primary (HIGH confidence)
- `lib/router.js:32-205` — global middleware including the JWT branch (read in full).
- `lib/router.user.js:39-204` — reset route handlers + mount block (read in full).
- `lib/thinx/owner.js:88-520` — Mailgun email flow + `password_reset_init` + `resetUserWithKey` (read).
- `thinx-core.js:40-360` — bootstrap and middleware mount order (read).
- `services/console/vue/src/core/api.js:53-57` — Vue API client `composeHeaders()` that unconditionally sends `Authorization: Bearer <refreshToken>` (read).
- `services/console/vue/src/store/auth.js:88` — `$api.$post('/password/reset', ...)` call site (read).
- `services/console/vue/default.conf` — console-container nginx `location ~* ^/api/` reverse proxy to `http://api:7442` (read).
- `services/console/src/default.conf` — legacy AngularJS console nginx config; equivalent location block (read).
- `docker-swarm.yml:225-297` — Traefik labels for `api` and `console` services (read).
- `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:85-97` — existing v2 password-reset test (read, used as template for new spec).
- `spec/jasmine/ZZ-AppSessionUserSpec.js:170-275` — existing legacy-alias password-reset tests (read).
- `.planning/G8-INVESTIGATION.md` (read, referenced).
- `.planning/codebase/CONCERNS.md` (read, referenced — confidence levels here are derived from comparing CONCERNS' rankings to the source-level evidence).
- `.planning/codebase/ARCHITECTURE.md`, `INTEGRATIONS.md`, `TESTING.md` (read, referenced).
- `AGENTS.md` (read).

### Secondary (MEDIUM confidence)
- Express 5 middleware ordering semantics — established library convention, well-documented across community sources. Used implicitly in the diagnostic playbook.
- `jsonwebtoken` behavior on malformed input — library raises an error which `app.login.verify`'s callback surfaces as `error != null`. Verified by inspecting `lib/thinx/jwtlogin.js`.

### Tertiary (LOW confidence)
- The specific publish date of `chai-http` v4.4.0 — recalled from training data, not re-verified via `npm view` in this session. Not load-bearing for the plan (we use whatever the lockfile pins).

## Metadata

**Confidence breakdown:**
- Root cause identification: HIGH — direct source-line evidence in both the Node app and the Vue client.
- Standard stack: HIGH — read from on-disk `package.json` and existing source.
- Architecture (request flow): HIGH — read end-to-end including the console-nginx-in-Docker layer the seed didn't surface.
- Pitfalls: HIGH — derived from CONCERNS.md + direct code inspection.
- Diagnostic playbook: MEDIUM-HIGH — Steps 1-4 are concrete; Steps 5-7 are well-formed but only needed if primary theory is wrong.
- No-enumeration analysis: HIGH — direct source trace.
- Code examples (the guard and the spec): HIGH — verified against existing patterns in the suite.
- Verification matrix: MEDIUM — depends on staging availability (assumption A4 above).

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days; the API, Vue client, and edge config are all stable and changes here would be flagged in MEMORY.md).
