# Codebase Concerns

**Analysis Date:** 2026-05-26
**Scope:** Parent monorepo `thinx-device-api` — `lib/`, `thinx-core.js`, `thinx.js`, `package.json`, `docker-swarm.yml`, `scripts/`. Service submodules (`services/console/`, `services/worker/`, `services/transformer/`) are intentionally excluded; their concerns live in their own projects.

**Legend:**
- **[v1 GA blocker]** — must close before tagging v1 GA.
- **[v1.x deferred]** — known issue, scheduled for post-GA hardening.
- **[ongoing]** — continuous discipline / not a discrete fix.

---

## Active Investigations

### G8 — `POST /api/v2/password/reset` returns 403 on rtm  **[v1 GA blocker]**

- Route handler: `lib/router.user.js:39-48` (`postPasswordReset`).
- Route registration: `lib/router.user.js:144-146` (v2) and `lib/router.user.js:202-204` (legacy `/api/user/password/reset`).
- Router mount order in `thinx-core.js:316-358` — `sessionParser` (L316), `express.json` (L318), `express-rate-limit` (L325, non-test only), `express.urlencoded` (L328), then routers.
- No CSRF middleware in the stack (`grep csrf lib/ thinx-core.js` → 0 hits).
- No `requireSession` / `requireAdmin` guard on the reset route line.
- Route handler is unchanged for ~12 months — the most recent diff that touches `lib/router.user.js` (commit `0514f6ea`) only modified `postChat`.
- Investigation seed: `.planning/G8-INVESTIGATION.md` (filed 2026-05-26).
- **Suspected culprits, ranked:**
  1. `lib/router.js:32-56` (`enforceACLHeaders`) — CORS origin reflection. If the request origin is `"device"` the middleware returns early (L39-43); for any non-empty non-`"device"` origin, the origin is reflected. The default fallback path (L48-53) reads `CORS_ALLOWED_ORIGINS` env or `app_config.public_url` — a misconfigured allowlist on `rtm` could explain a server-side rejection, but only if a subsequent code path explicitly returns 403.
  2. `lib/router.js:103-136` — JWT verification short-circuit. If an unrelated bearer/cookie header is present and verification fails, it does `res.status(403).end()` (L132 — note the inline `// FIXME: Change to 401 Unauthorized in tests as well!`). A stale or wrong header on the Vue console's password-reset POST would trip this.
  3. Edge (Traefik labels in `/mnt/gluster/deployment/swarm` or the nginx config on `rtm.thinx.cloud`) — `curl -i` against rtm + a staging environment should isolate this. AGENTS.md L26 records CSP and CORS edits in nginx that may have introduced a regression.
- **Why rate-limit is unlikely:** `express-rate-limit` at `thinx-core.js:75-80` uses defaults — when triggered it returns **429**, not 403. Limit is 500/min over a sliding 1-minute window.
- **Fix approach:** Reproduce with `curl -v -X POST https://rtm.thinx.cloud/api/v2/password/reset -H 'Content-Type: application/json' -H 'Origin: https://rtm.thinx.cloud' --data '{"email":"x@y.z"}'`, inspect the response headers (`Server`, `X-Powered-By`) to localize Express vs Traefik vs nginx. Run identical curl against staging. If reproducible on Express, bisect the middleware stack; if only on rtm, the fix lives in `docker-swarm.yml` Traefik labels or nginx.
- **Regression test:** Add a Jasmine spec in `spec/jasmine/` covering an unauthenticated `POST /api/v2/password/reset` returning 2xx for a non-existent email (matching legacy behavior described in the G8 seed).

---

## Security Considerations

### Dependabot vulnerabilities — 11 high / 17 moderate / 1 low  **[v1 GA blocker]**

- Surfaced on every push to `suculent/thinx-device-api` (default branch) as of 2026-05-26.
- Detail not yet triaged into this repo — needs `gh api repos/suculent/thinx-device-api/dependabot/alerts` to enumerate.
- 11 **high** alerts is the blocker count; moderates can be batched for v1.x.
- **Fix approach:** Pull the Dependabot alerts list, group by package, identify which are direct vs transitive, prioritize direct deps with already-released patches. Note: `chai-http` upgrade is explicitly OUT of bounds (see "Dependency Locks" below).
- **Cross-ref:** `package.json` has an extensive `overrides` block (L97-136) used to pin transitive deps to non-vulnerable versions — this pattern is the expected fix vector for transitive CVEs.

### Cookie security flags — `secure: false`, `httpOnly: false` on the API session cookie  **[v1.x deferred]**

- `thinx-core.js:300-305` — main API session cookie (`x-thx-core`) has:
  - `secure: false` — "not secure because HTTPS unwrapping happens outside this app" (commented at `thinx-core.js:301`)
  - `httpOnly: false` — "temporarily disabled due to websocket debugging" (`thinx-core.js:303`)
- The WebSocket session cookie (`x-thx-wscore`) at `thinx-core.js:421-426` is correctly `httpOnly: true`.
- LGTM/CodeQL warnings are suppressed inline (`/* lgtm [js/clear-text-cookie] */ /* lgtm [js/missing-token-validation] */`).
- **Risk:** `httpOnly: false` allows browser JS to read the session cookie — any XSS in the console would harvest sessions. The "temporarily" comment has clearly outlived its original justification.
- **Fix approach:** Restore `httpOnly: true` on the main API cookie; verify WebSocket session restoration still works (it uses the separate `x-thx-wscore` cookie which is already `httpOnly: true`). `secure: false` is acceptable as-is because TLS termination happens at Traefik/nginx, not in the Node app.

### CORS origin reflection — `enforceACLHeaders` reflects `req.headers.origin`  **[v1.x deferred / verify]**

- `lib/router.js:32-56`. When a browser sends `Origin: https://rtm.thinx.cloud`, the response sets `Access-Control-Allow-Origin: https://rtm.thinx.cloud` + `Access-Control-Allow-Credentials: true`.
- **Documented as a fix** in AGENTS.md L27 ("Backend CORS bug was fixed in `lib/router.js` by reflecting request origins instead of returning `*` with credentials").
- The `deepcode ignore TooPermissiveCorsHeader` suppression at L49 documents the fallback path: when no origin is present, the code falls back to `CORS_ALLOWED_ORIGINS` env (comma-list) → `app_config.public_url` → `'*'`. The final `'*'` fallback is the open-CORS risk.
- **Risk vs. G8:** Origin reflection alone does not stamp a 403 — CORS rejection happens at the browser. If G8 turns out to involve this code path, it would be via the `'*'` fallback combined with `Access-Control-Allow-Credentials: true` (which browsers reject) producing a *visible* failure that *looks* like a 403.
- **Fix approach:** Audit the `CORS_ALLOWED_ORIGINS` env on rtm; ensure `app_config.public_url` is populated; remove the final `'*'` fallback (replace with a 403 or origin echo of `public_url` only).

### Bare 403 inside JWT verify path  **[v1.x deferred]**

- `lib/router.js:132` — `res.status(403).end(); // FIXME: Change to 401 Unauthorized in tests as well!`
- Returning 403 (forbidden, *known identity*) for an **invalid JWT** is semantically wrong — should be 401 (unauthenticated).
- **Risk:** Conflates "you can't do this" with "we can't tell who you are", complicates client-side error handling (the Vue console treats 403 as "logged in but not permitted" and 401 as "session expired"; this can mask session expiry).
- **Fix approach:** Change L132 to `res.status(401).end()`; update any Jasmine specs that assert 403 on bad-JWT to expect 401 instead.

### Hardcoded RSA key passphrase — `'thinx'`  **[v1.x deferred]**

- `lib/thinx/rsakey.js:130` — `passphrase: 'thinx'`. Same item is tracked in `IMPROVEMENTS.md` #6.
- Effectively a noop encryption: anyone with read access to source can decrypt stored RSA keys.
- **Fix approach:** Already specified in `IMPROVEMENTS.md` #6 — env-driven passphrase with documented migration plan for existing encrypted keys.

### `httpOnly: false` + `trust proxy` collision  **[v1.x deferred]**

- `thinx-core.js:285` — `app.set("trust proxy", 1)` (trust first hop)
- `thinx-core.js:407` — `app.set('trust proxy', ['loopback', '127.0.0.1'])` (overrides L285 with a different value 122 lines later, after the server is already created at L397)
- **Risk:** The second call wins, so the effective config is loopback-only — fine *if* the proxy IS on loopback; broken if Traefik/nginx is on a different host (e.g. in a swarm overlay network). When `trust proxy` is misconfigured, `express-rate-limit` collapses all users into the proxy's single IP bucket, and `req.ip` returns the proxy address.
- **Fix approach:** Delete the duplicate `app.set` at L407; keep L285. Confirm with `curl -i .../api/v2/spec` whether `RateLimit-*` headers reflect per-client counts.

### Hardcoded test/dev MQTT password  **[v1.x deferred]**

- `thinx-core.js:131-141` — `serviceMQPassword = "mosquitto"` in test, `"changeme!"` in development. Both are inline literals with `deepcode ignore NoHardcodedPasswords` suppressions.
- **Risk:** Low — test-only. Concern is the pattern, not the values. Any developer who flips `ENVIRONMENT` to test on a live server briefly exposes weak credentials.
- **Fix approach:** Move to `_envi.json` fixture loaded by `Globals.app_config()`; already partially raised in `IMPROVEMENTS.md` #12.

---

## Privacy / Logging Exposure

### Email address logged on password-reset failure  **[v1 GA blocker]**

- `lib/thinx/owner.js:499` — `console.log("☣️ [error] [password_reset_init] email "+email+" not found in", {body});`
- Also `lib/thinx/owner.js:494` — logs `body.rows.length`, which can be 0 (account does not exist) or 1+.
- **Risk:** Logs the full submitted email plus the CouchDB view result envelope. In aggregation (Datadog/Loki) this becomes a searchable corpus of "email addresses that tried password reset" — a privacy concern under GDPR and an enumeration aid for an attacker who reaches the log layer.
- **AGENTS.md cross-ref:** L46-48 documents prior frontend cleanup of sensitive browser logging (`services/console/src/app/js/main.js`, `services/console/src/app/js/controllers/LogviewController.js`). Server-side has not had the same pass.
- **Fix approach:** Hash or redact the email before logging (`sha256(email).slice(0,8)` is sufficient for log correlation without leaking PII). Replace the `{body}` dump with `{rows: body.rows.length}`. Same pattern applies to L494, L507, L511.

### Reset key logged in plaintext  **[v1 GA blocker]**

- `lib/thinx/owner.js:451` — `alog.log(owner, "Attempt to reset password with: " + reset_key, "warning");`
- `lib/thinx/owner.js:474` — `console.log(\`ℹ️ [info] Attempting to reset password with key ${reset_key}\`);`
- `lib/thinx/owner.js:583` — `alog.log(userdoc._id, "Attempt to set password with: " + rbody.reset_key, "warning");`
- `lib/thinx/owner.js:647` — `console.log("ℹ️ [info] Resetting password " + rbody.reset_key + "using set_password_reset...");`
- **Risk:** The reset key is the single-factor credential that grants password change. Anyone with log read access (Slack `#thinx` if Rollbar/notifier forwards warnings, Mailgun/Loki, CouchDB audit-log doc) can hijack any active reset.
- **Fix approach:** Redact reset keys in all log lines. The audit-log entry (`alog.log` at L451, L583) is the more critical one — it lands in CouchDB and is searchable. Replace `+ reset_key` with `+ reset_key.slice(0,4) + "…"` everywhere; same for `activation` (L653).

### Mailgun error logging dumps the access token  **[v1.x deferred]**

- `lib/thinx/owner.js:95` — `console.log(\`☣️ [error] mailgun 24 err ${err}\`); // receives instance of accesstoken(!?)`
- The inline comment acknowledges the `err` object contains an access-token-like field.
- **Fix approach:** Log `err.message` and `err.statusCode`, never the whole object.

### Username + activation token co-logged  **[v1.x deferred]**

- `lib/thinx/owner.js:228` — `console.log(\`ℹ️ [info] Sending activation e-mail to ${activationEmail.to} with token ${object.new_activation_token}\`);`
- Pairs email with activation token in one log line.
- **Fix approach:** Same redaction pattern as reset keys.

### General — 792 `console.log` calls across 49 files  **[ongoing]**

- Tracked as `IMPROVEMENTS.md` #1 — adopt structured logger (Pino/Winston), env-driven log levels, no PII in production.
- This is the umbrella fix that the four logging items above slot into.

---

## Fragile Areas

### Mixed callback / promise style across `lib/thinx/`  **[ongoing]**

- `lib/thinx/owner.js` alone has 73 callback patterns (`grep "callback(\|function(.*callback"`).
- Partial refactor to thenables noted in commit `266de85f` ("RSA key create fix (added default passphrase for now); refactored client/redis.get calls from callbacks into thenables").
- Modules still using `.then()`/`await`: `auth.js`, `database.js`, `device.js`, `deployment.js`, `gdpr.js`, `influx.js`, `messenger.js`, `platform.js`, `owner.js`, `plugins.js`, `queue.js`, `statistics.js`, `transfer.js`, `oauth-github.js`.
- **Risk:** Inconsistent error propagation — `try/catch` doesn't cross callback boundaries, leading to silent failures. `IMPROVEMENTS.md` #5 documents only 58 try / 81 catch blocks across `lib/thinx/`. No process-level `unhandledRejection` handler in `thinx.js`.
- **Fix approach:** Already specified in `IMPROVEMENTS.md` #4 — migrate one module per PR, start with `lib/thinx/apikey.js`. Keep callback adapters at the public API surface to avoid forcing call-site changes.

### Duplicate `app.set('trust proxy', …)` calls  **[v1 GA blocker — quick fix]**

- See "Security: `httpOnly: false` + `trust proxy` collision" above.
- `thinx-core.js:285` and `thinx-core.js:407` set the same key to different values. The second wins. This is straightforward to fix.

### `password_reset` accepts `reset_key != user_reset_key` via `!=` (not `!==`)  **[v1.x deferred]**

- `lib/thinx/owner.js:476` — `if (reset_key != user_reset_key) { ... }`. Same line uses `==` semantics, so `null`/`undefined`/empty-string equivalence holds.
- Combined with `if (typeof (user_reset_key) === "undefined") user_reset_key = null;` at L470-472, a request with no `reset_key` would compare `undefined != null` → `false` (in `!=`), meaning the code would proceed to "OK" branch.
- **Inspection result:** L446-449 catches `typeof reset_key === "undefined"` early and returns `missing_reset_key`, so the immediate exploit path is closed. But the `!=` is still fragile — a future refactor that loses the early guard re-opens the hole.
- **Fix approach:** Tighten to `!==` and add a positive type check (`typeof reset_key === "string" && reset_key.length > 0`). Same applies to `auth.js`, `set_password_reset` (L561+), and `set_password_activation` (L599+).
- Cross-ref `IMPROVEMENTS.md` #8 — enabling `eqeqeq` lint rule surfaces every site at once.

### Large monolithic modules  **[v1.x deferred]**

- `lib/thinx/device.js` — 1486 lines
- `lib/thinx/builder.js` — 1201 lines
- `lib/thinx/owner.js` — 1104 lines
- `lib/thinx/messenger.js` — 974 lines
- `lib/thinx/transfer.js` — 608 lines
- **Risk:** Modifications carry high blast radius; coverage is hard to reason about; the modules mix transport, validation, persistence, and email.
- **Fix approach:** Slice on responsibility boundaries (email I/O → `owner-email.js`, password flow → `owner-auth.js`, etc.) only after the async migration in `IMPROVEMENTS.md` #4 lands.

### WebSocket handshake risk on `rtm.thinx.cloud`  **[v1 GA blocker]**

- AGENTS.md L96-97: "Websocket handshake may still return 404 even with corrected frontend bundle".
- Server-side upgrade handler: `thinx-core.js:445-487`. Uses the same `sessionParser` middleware to validate the `x-thx-core` cookie before calling `wss.handleUpgrade`.
- Socket-key collision handler at L449-453 destroys duplicate upgrades — could mask legitimate reconnects.
- **Risk:** 404 on upgrade either originates from edge (Traefik labels not routing the upgrade path) or from `socketMap` already having an entry for `socketKey` (a stale entry from a half-closed prior connection). The error handler at L481 logs "Exception caught upgrading same socket twice" but deletes from `socketMap` only on exception, not on `socket.destroy()` at L451.
- **Fix approach:** Add `socket.on('close', () => socketMap.delete(socketKey))` (currently missing — entries are only cleared on the catch path at L482). Capture upgrade response headers in a `curl --include --no-buffer -H "Connection: Upgrade" -H "Upgrade: websocket"` probe against rtm. Verify Traefik labels in `docker-swarm.yml` (L49+) include the websocket upgrade middleware.

### Dashboard data exposure on authenticated load  **[v1.x deferred]**

- AGENTS.md L98: "Authenticated dashboard still fetches broad operational/account data immediately on load".
- Specific endpoints not enumerated in AGENTS.md, but the typical offenders are `/api/v2/stats/week` (`router.user.js:162-164`), `/api/v2/devices`, `/api/v2/profile`, `/api/v2/apikey/list` — all fired at the dashboard mount, even if the user navigates straight to a non-dashboard view.
- **Risk:** Privacy (over-collection in logs/audit), performance (fan-out on page load), and bandwidth (CouchDB views are recomputed). The user-facing impact is mild; the audit-log noise is real.
- **Fix approach:** Move dashboard-only fetches behind the route guard in the console; lazy-load stats. This is largely a console-submodule fix; the parent contribution is to add `ETag`/`Last-Modified` to the affected GETs so repeat fetches collapse to 304.

---

## Performance Bottlenecks

### Global rate limit too high for auth routes  **[v1.x deferred]**

- `thinx-core.js:75-80` — `max: 500` requests per minute, applied app-wide.
- No per-route limit on login, registration, password reset, or token exchange.
- **Risk:** Credential-stuffing / brute force on `/api/login` and `/api/v2/password/reset` is effectively unrate-limited (500/min is too generous for auth).
- **Fix approach:** Already specified in `IMPROVEMENTS.md` #10 — stricter secondary limiter (10/min) on auth/reset/register routes. Apply before the global limiter in middleware order.

### Statistics aggregation every 12 hours, synchronously  **[v1.x deferred]**

- `thinx-core.js:171-174` — `setInterval(() => { stats.aggregate(); ... }, 86400 * 1000 / 2)` (every 12 hours).
- `stats.get_all_owners()` is called once at startup (`thinx-core.js:165`) — full owner-list scan blocks the boot sequence (timed as "cached all owners in ${then - now} seconds").
- **Risk:** As `managed_users` grows past ~10k accounts, startup latency grows linearly. The 12-hour aggregation runs in-process and competes with request handling.
- **Fix approach:** Move aggregation to a worker container (the `services/worker/` submodule), or use a CouchDB `_changes` feed instead of full scans.

### Influx writes on every device check-in  **[v1.x deferred]**

- `lib/thinx/influx.js` handles per-device stats. Each device check-in writes a point.
- **Risk:** At scale, Influx becomes a hot path; failure mode of `InfluxConnector.createDB('stats')` at `thinx-core.js:156` is "log and continue" — silent data loss if Influx is down.
- **Fix approach:** Buffer writes and batch. Out of v1 scope.

---

## Dependency Risks

### `chai-http` locked at `^4.3.0` — explicit do-not-upgrade  **[ongoing]**

- `package.json:42` — `"chai-http": "^4.3.0"`.
- Documented in `AGENTS.md:81-92` and `IMPROVEMENTS.md` #0.
- v5 is ESM-only and removes the `chai.request(app)` API. Migration cost: convert 15 ZZ-* spec files (`find spec -name "ZZ-*" | wc -l` → 15) from CommonJS to ESM, rename ~200 call sites.
- **Trigger to reconsider:** A Snyk/Dependabot CVE in the transitive `superagent` v3 dep.
- **Status:** Hold. Document the lock in any PR review checklist.

### `chai` pinned at `4.5.0`  **[ongoing]**

- `package.json:41` — `"chai": "4.5.0"` (exact pin, no caret).
- Tied to `chai-http` v4. v5 of `chai` is also ESM-only.
- Same migration as `chai-http`.

### `moment-timezone` at `0.6.0`  **[v1.x deferred]**

- `package.json:65` — `"moment-timezone": "0.6.0"`. This package version is from ~2015 and unmaintained at this pin level (current is 0.5.x — the `0.6.x` series does not exist on npm as a stable line; this may be an internal fork or a fossilized entry).
- **Risk:** No security updates; `moment` itself is in maintenance-only mode and recommended for replacement (`Temporal`, `Luxon`, or `date-fns`).
- **Fix approach:** Verify the actual installed version (`npm ls moment-timezone`) — the pin may resolve to something unexpected. If real, migrate timezone math to `Intl.DateTimeFormat` (Node 19+ supports the full set).

### `path` package as a runtime dep — `^0.12.7`  **[v1.x deferred]**

- `package.json:73` — `"path": "^0.12.7"`. This is the **userland polyfill** for Node's built-in `path` module, last published in 2015. Adding it to dependencies is a known npm anti-pattern: it shadows the Node built-in unintentionally in some import resolvers.
- **Fix approach:** Remove from `package.json` dependencies; nothing in `lib/` should `require('path')` and get the userland version (Node resolution prefers core).

### `querystring` and `qs` both present  **[v1.x deferred]**

- `package.json:74-75` — `"qs": "^6.15.2", "querystring": "^0.2.0"`. The latter (`querystring` userland) is deprecated by Node in favor of the built-in.
- **Fix approach:** Remove `querystring`; standardize on `qs` or the built-in `node:querystring`.

### `mkdirp@^1.0.3` vs Node 19+  **[v1.x deferred]**

- `package.json:64` — `"mkdirp": "^1.0.3"`. Node 10+ has `fs.mkdir({ recursive: true })` and `fs.promises.mkdir`. `mkdirp` is a transitive-dep liability now.
- **Fix approach:** Drop `mkdirp`, use `fs.mkdirSync(p, { recursive: true })`.

### Suspicious `overrides` block — 38 pins  **[ongoing]**

- `package.json:97-136` — 38 transitive packages pinned to specific (older) versions to silence audit findings.
- **Risk:** Each pin is technical debt. The pin set is unaudited as a whole — a fresh `npm audit` run after upgrading any direct dep will likely surface new transitive conflicts.
- **Fix approach:** Treat the overrides block as a quarterly review item. For Dependabot triage, the first question on each alert is "is the vulnerable transitive already overridden?"

---

## Operations Concerns

### Swarm auto-pull broken since 2026-05-25 14:44 CET — OPS-swarmpull  **[v1 GA blocker]**

- Cross-repo issue tracked in `services/console/.planning/v1.x-backlog.md:83` and `services/console/.planning/REQUIREMENTS.md:215`.
- Symptom: after CircleCI pushes `registry.thinx.cloud:5000/thinx/console:vue`, Swarmpit no longer auto-redeploys the service task. Manual `./scripts/stack-deploy` (at `/Users/igraczech/Repositories/thinx-device-api/scripts/stack-deploy`) works.
- `docker-swarm.yml` carries `swarmpit.service.deployment.autoredeploy=true` labels on all relevant services (L49, L99, L130, L155, L185, L249, L297) — config is in place; the failure is downstream (Swarmpit watcher or registry-notification path).
- **Recon to do:**
  1. SSH to `root@188.166.23.244 -p2020` (per AGENTS.md L17-19).
  2. Check Swarmpit container logs: `docker service logs swarmpit_app --since 2h`.
  3. Verify the registry → Swarmpit webhook (if any) is still configured.
  4. Confirm the swarm node can pull from `registry.thinx.cloud:5000` without manual `--with-registry-auth`.
- **Fix approach:** Triage-then-fix; root cause likely either expired registry credentials in the swarm config or a Swarmpit upgrade that changed the autoredeploy heuristic.
- **Why it's a GA blocker:** Deploy automation is part of the GA promise. Every manual stack-deploy is a window for human error.

### Two `app.set('trust proxy', …)` calls  **[v1 GA blocker — quick fix]**

- Already detailed in "Fragile Areas". Listed twice because operationally this affects rate-limiting and `req.ip` correctness in audit logs.

### Bootstrap banner uses string concatenation for owner stats  **[v1.x deferred]**

- `thinx-core.js:167` — `console.log(\`ℹ️ [info] [core] cached all owners in ${then - now} seconds.\`);`
- `then - now` is in **milliseconds** but labelled "seconds". Off by 1000.
- **Fix approach:** `${((then - now) / 1000).toFixed(2)}` or rename the unit.

---

## Test Coverage Gaps

### No regression test for unauthenticated `POST /api/v2/password/reset`  **[v1 GA blocker]**

- The G8 investigation explicitly calls this out: "Add a regression test in `spec/ZZ-*` covering an unauthenticated `POST /api/v2/password/reset` returning 2xx for a non-existent email (matching legacy behavior)" (`.planning/G8-INVESTIGATION.md:70`).
- Existing user-API spec: `spec/jasmine/ZZ-AppSessionUserSpec.js` covers session-bound flows but not the public reset entry-point.
- **Fix approach:** Co-located with the G8 fix.

### Rate limiter is disabled in test environment  **[v1.x deferred]**

- `thinx-core.js:324-326` — `if (process.env.ENVIRONMENT != "test") { app.use(limiter); }`.
- **Risk:** Per-endpoint limit changes (from `IMPROVEMENTS.md` #10) cannot be verified in CI.
- **Fix approach:** Mount the limiter with a permissive max (e.g. 100000/min) in test so its presence in middleware order is exercised; tighten only the auth-route limiter and write a focused spec that pushes it past the limit.

### Hardcoded test fixtures in `spec/_envi.json`  **[v1.x deferred]**

- Tracked in `IMPROVEMENTS.md` #12. Owner IDs, API keys, session IDs, emails committed.

### No `unhandledRejection` / `uncaughtException` handlers  **[v1 GA blocker]**

- `thinx-core.js` and `thinx.js` register zero process-level error handlers (`grep "process.on" thinx-core.js thinx.js` → 0 hits).
- Rollbar is wired up via `Globals.rollbar()` (`thinx-core.js:96`) but only consumed by `rollbar.warn(...)` in a few spots.
- **Risk:** A rejected promise anywhere in the codebase crashes the worker (Node 19 default behavior) with no Rollbar report and no log line. Silent restarts via Docker's restart-policy mask the failure.
- **Fix approach:** Already specified in `IMPROVEMENTS.md` #5 — add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` in `thinx.js`, wire to Rollbar.

---

## Missing Critical Features

### No central error-handling middleware  **[v1 GA blocker]**

- Express 5 has an `app.use(errorHandler)` slot that the codebase does not populate. Every route writes its own status codes ad-hoc.
- **Risk:** Inconsistent error envelopes seen by the Vue console. Some routes return `{ success: false, status: "..." }` (via `Util.responder`), others return `res.status(403).end()` (empty body).
- **Fix approach:** `IMPROVEMENTS.md` #5 defines the JSON envelope. Add a single error middleware after all route registrations in `thinx-core.js:358` block.

### Audit log is best-effort, no failure path  **[v1.x deferred]**

- `lib/thinx/audit.js` writes to CouchDB. There is no fallback if the audit-log write fails — the calling code never inspects the result.
- **Risk:** Audit gaps are invisible. For ADMIN-03 impersonation logging (`lib/router.js:108-116`), a CouchDB hiccup means impersonation activity is lost.
- **Fix approach:** Buffer audit-log writes to a local journal file; replay on next successful CouchDB connect. Out of v1 scope but flag in the v1.x backlog.

---

## v1 GA Blocker Summary

The following must close before v1 tag:

1. **G8** — `POST /api/v2/password/reset` returns 403 on rtm (`.planning/G8-INVESTIGATION.md`).
2. **Dependabot 11-high triage** — enumerate, patch direct deps, override transitives.
3. **PII/secret logging** — redact email at `lib/thinx/owner.js:499`, reset keys at L451/L474/L583/L647.
4. **Duplicate `trust proxy`** — delete `thinx-core.js:407`, keep L285.
5. **Websocket 404 risk on rtm** — verified curl probe + `socket.on('close')` cleanup at `thinx-core.js:445-487`.
6. **Process-level error handlers** — `unhandledRejection` / `uncaughtException` in `thinx.js`, wired to Rollbar.
7. **Central Express error middleware** — consistent JSON envelope.
8. **G8 regression test** — `spec/jasmine/ZZ-*` covering unauth reset.
9. **OPS-swarmpull** — restore deploy automation, swarm side.

Everything else is v1.x deferred or ongoing.

---

*Concerns audit: 2026-05-26*
