# Phase 21: CSP Wildcard Removal + Anti-CSRF Token - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous)

<domain>
## Phase Boundary

Close the two deferred HawkScan Medium findings on the `rtm.thinx.cloud` staging env (SEC-CSP-01, SEC-CSRF-01), both in the console/edge layer:
1. Remove the `https:` scheme-wildcard from the CSP `default-src`/`connect-src`, pinning explicit hosts, applied consistently across the swarm nginx edge + both console images.
2. Add a double-submit anti-CSRF token to the console login/account forms, validated server-side by the API on the cookie-session login POSTs.

Verification is a HawkScan rescan of `rtm.thinx.cloud` reporting 0 NEW paths for plugin 10055-4 (CSP) and 20012 (Anti-CSRF). Deploy is via CI: push `thinx-staging` on BOTH repos (thinx-device-api + services/console); CI auto-deploys to `rtm.thinx.cloud` (API) and `console.thinx.cloud` (console).

**Out of scope:** removing `unsafe-eval`/`unsafe-inline` (deferred SEC-CSP-02, AngularJS-blocked); CSRF on `X-Access-Token`/JWT API routes (not CSRF-prone).
</domain>

<decisions>
## Implementation Decisions

### CSRF Mechanism
- **Double-submit cookie** pattern: server sets an `XSRF-TOKEN` cookie; client echoes it back in an `X-XSRF-TOKEN` header. Stateless (no Redis session storage), and AngularJS `$http` / axios send it automatically by convention (minimal console JS changes).
- **Validate on cookie-session login/account POSTs only**: `/login`, `/api/login`, `/api/v2/login`, `/user/create`, `/user/password/reset`. Do NOT gate the `X-Access-Token`/JWT-authenticated API routes — they are not ambient-credential (cookie) routes and are not CSRF-prone.
- **Rollout: fail-open + log, then flip to enforce.** First deploy validates-but-allows on missing/mismatched token (logs a warning) so a token/console wiring mismatch cannot lock out staging login mid-rollout; a follow-up flips a flag to hard-reject. Enforcement flag should be config/env-driven.
- **Satisfy the scanner two ways**: a hidden `_csrf` form field in the form markup (plugin 20012 inspects form HTML) PLUS the `X-XSRF-TOKEN` header check on the XHR.

### Two-Console Wiring
- Hidden `_csrf` field added to ALL POST login/account forms in `services/console/src/`: `login-form`, `register-form`, `forget-form` (index.html), `reset-form` (password.html), `gdpr-form` (auth.html).
- Classic (jQuery) console: add the `X-XSRF-TOKEN` header (read from the `XSRF-TOKEN` cookie) to the `$.ajax` login/account calls in `login.js`.
- Vue console: configure axios `xsrfCookieName: 'XSRF-TOKEN'` + `xsrfHeaderName: 'X-XSRF-TOKEN'` (near-zero change).
- One shared server-side validation scheme for both consoles — no per-frontend fork.

### CSP Host Pinning
- Replace the `https:` scheme-wildcard in `default-src`/`connect-src` with explicit hosts: `'self' https://rtm.thinx.cloud https://console.thinx.cloud https://*.crisp.chat wss://client.relay.crisp.chat` + GitHub/Google OAuth hosts + `data:`/`blob:` where needed. **Exact host list to be enumerated and verified during planning** from what the consoles actually load (Crisp, fonts, OAuth, socket/MQTT-WS endpoints).
- Keep `'unsafe-inline'` and `'unsafe-eval'` (SEC-CSP-02 deferred — AngularJS needs unsafe-eval).
- Apply identically across all three CSP sources, using the existing host-token placeholders (`__NGINX_HOST__` / `__WEB_HOSTNAME__`): the nginx edge runbook (`.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx:28`), the classic console image (`services/console/src/default.conf`), and the Vue console image (`services/console/vue/default.conf`).

### Deploy & Verification
- Push `thinx-staging` on both repos; CI auto-deploys to the staging env (API → rtm.thinx.cloud, console → console.thinx.cloud).
- Deploy the API CSRF middleware in fail-open mode BEFORE / with the console token wiring so login never breaks mid-rollout.
- Verify with `hawk rescan` (or a fresh `hawk scan`) of rtm.thinx.cloud → 0 NEW plugin 10055-4 + 20012 paths.
- Rollback = git revert + re-push the affected repo's thinx-staging.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets / Facts
- No CSRF middleware exists today (`grep csrf` → only the new `SameSite=lax` cookies at `thinx-core.js:331,454`).
- API root `app.get("/")` (`lib/router.js:222`) returns a JSON healthcheck — NOT a login form. The scanner's Anti-CSRF finding traces to the console-served login page (`/auth.html`, via the stackhawk `loginPagePath`), not an API form.
- Login POST endpoints: `POST /api/login` + `POST /api/v2/login` (`lib/router.auth.js:336,350`); the consoles XHR-POST to `urlBase + "/login"` (`services/console/src/assets/thinx/login.js:78`).
- Console login uses jQuery `$.ajax` JSON POST — already CORS-locked (`Access-Control-Allow-Origin: https://console.thinx.cloud`) + `SameSite=lax`, so real CSRF exposure is already low; the finding is the scanner wanting a token in the form markup.
- Login form markup lives in the submodule: `services/console/src/index.html` (`login-form`/`register-form`/`forget-form`), `auth.html` (`gdpr-form`), `password.html` (`reset-form`).
- Session cookies (`x-thx-core`/`x-thx-wscore`) are `httpOnly` — so the `XSRF-TOKEN` cookie must be a SEPARATE, JS-readable (non-httpOnly) cookie for double-submit to work.
- CSP is set in the API (`lib/router.js:69-90`, strict) AND the nginx edge/console confs (permissive, the flagged one). Two headers → browser enforces the intersection.

### Established Patterns
- Express + express-session (Redis-backed), helmet for baseline headers.
- Config/env-driven feature flags (e.g. `app_config.debug.allow_http_login`) — reuse this pattern for the CSRF enforce flag.
- nginx confs use placeholder substitution (`__NGINX_HOST__`, `__WEB_HOSTNAME__`) at image build.

### Integration Points
- API: new CSRF middleware mounted before the login/account routes in `lib/router.auth.js` (or `thinx-core.js` middleware chain); token issuance on login-page GET.
- Console: form HTML + `login.js` (classic) / axios config (Vue) + both `default.conf` CSP.
- Edge: `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx`.
</code_context>

<specifics>
## Specific Ideas

- Cookie name `XSRF-TOKEN`, header `X-XSRF-TOKEN` (Angular/axios default convention — minimizes console changes).
- The `XSRF-TOKEN` cookie must be non-httpOnly (readable by JS) and `SameSite=lax`, scoped to the `.thinx.cloud` domain like the session cookies.
- Enforcement flag env-driven so fail-open→enforce is a config flip, not a code change.
</specifics>

<deferred>
## Deferred Ideas

- SEC-CSP-02: remove `unsafe-eval`/`unsafe-inline` once the console is off AngularJS.
- CSRF protection for state-changing `X-Access-Token`/JWT API routes (not CSRF-prone; out of scope).
</deferred>
