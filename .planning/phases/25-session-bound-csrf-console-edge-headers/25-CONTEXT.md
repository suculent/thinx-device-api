# Phase 25: Session-Bound CSRF + Console Edge Headers - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Both consoles use a CSRF token that is HMAC-signed and bound to the session (WR-06). A cookie planted from a sibling `.thinx.cloud` subdomain can no longer pass. `POST /api/v2/user` (WR-04) and the cookie-authenticated account mutation routes require the token, and Bearer / API-key clients stay exempt. Every interactive login regenerates the session id and rotates the token. Both console hosts serve one hardened header set from the gluster `default.conf`, and the image configs and runbook snapshots mirror it, checked by a parity script. Nobody gets locked out: rollout is fail-open first, and enforcement is flipped only after operator-verified cold logins. `CSRF_MODE=legacy` is a one-command rollback.

Requirements: SEC-CSRF-02, SEC-CSRF-03, SEC-CSRF-04, SEC-CSRF-05, SEC-CSRF-06, SEC-CSP-03, SEC-CSP-04.

Frozen wire contract (no console CSRF code change): `XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header, `GET /api/csrf-token` + `/api/v2/csrf-token`, 403 `csrf_token_invalid`.

</domain>

<decisions>
## Implementation Decisions

### Pre-session binding & key
- **D-01:** The priming `GET …/csrf-token`, when there is no valid session, creates a Redis pre-session with a **15-minute TTL**. After login, the normal 1-hour rolling session takes over.
- **D-02:** **Only the priming GET** creates a pre-session. Other anonymous requests never write a session to Redis, so bots crawling pages create no keys.
- **D-03:** The token has the form `hmac.random`, bound to `req.sessionID`. At login, the request's token is verified against the pre-session, then `req.session.regenerate()` runs, and a new token bound to the regenerated id is set in the login response (`Set-Cookie: XSRF-TOKEN`). Priming re-mints a stale or invalid token instead of echoing it (`issueCsrfToken` echoes the freshly minted value first).
- **D-04:** The key is resolved **once at module scope**, because 3 `csrf.js` factory instances exist. It comes from `readSecret("CSRF_SECRET")` (provisioned in Phase 24, 64 hex characters), falls back to an HKDF derivation from the session secret, and if neither exists, `thinx_api` **refuses to start in `signed` mode**. The key is never random.

### Rollout, observation & enforcement
- **D-05:** The phase opens with a production-log check for external `POST /api/v2/user` callers. If any exist, **report them and stop at a checkpoint** before enforcing WR-04. There is no machine-client exemption (decision 2026-09-25), so those clients must prime the token.
- **D-06:** Deploy `CSRF_MODE=signed` **fail-open** with reason-coded telemetry: `binding_mismatch`, `session_mismatch`, `missing`, `stale`, plus the existing codes. Observe for **at least 24 h**, and enforce only when there are zero unexplained failure reasons.
- **D-07:** **The operator approves the enforcement flip at a checkpoint.** Before that, they check password, Google and GitHub cold logins on both consoles, plus a forced `thinx_api` redeploy mid-session with no 403s and no logouts. The executor then flips `CSRF_ENFORCE` with a single `docker service update` (never `restart.sh` / stack deploy).
- **D-08:** Rollback: **`CSRF_MODE=legacy`** restores the v1.13 double-submit behaviour and leaves `CSRF_ENFORCE` on. It is one command, documented in `.planning/runbooks/csp-csrf-hardening.md`. `CSRF_ENFORCE=false` stays the second-level escape hatch.

### Mutation-route coverage (SEC-CSRF-04/05)
- **D-09:** A request is exempt **only when a valid `Authorization: Bearer` or API-key header actually authenticated it**. A cookie-session request without such a header must present the token, and a bogus or invalid `Authorization` header does not bypass it. The per-request Bearer bridge (`router.js`) must not regenerate the session (SEC-CSRF-03).
- **D-10:** On `/api/v2/profile` and its sub-paths, **every state-changing method** (POST/PUT/PATCH/DELETE) is guarded. GETs are exempt.
- **D-11:** If the planning-time route inventory finds other cookie-authenticated account mutations not listed in SEC-CSRF-05, **cover them in this phase** and record each one in the plan.
- **D-12:** OpenAPI documents the priming flow (`GET /api/v2/csrf-token` → `XSRF-TOKEN` cookie → `X-XSRF-TOKEN` header) and the 403 `csrf_token_invalid` response. A shared security note goes on **every guarded route**.

### Console edge headers (SEC-CSP-03/04)
- **D-13:** `Referrer-Policy: strict-origin-when-cross-origin`, the same as the Vue image config already uses.
- **D-14:** `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`, plus `X-Permitted-Cross-Domain-Policies: none` (production currently sends `all`).
- **D-15:** Gluster edit order: **checkpoint first**. Commit the current `/mnt/gluster/deployment/swarm/console/default.conf` to the gluster repo as the rollback point, then edit, run `nginx -t` in the container, and `docker service update --force` both `thinx_console` and `thinx_vue` (the single-file bind mount pins the inode). Verify that each host returns **exactly one** CSP header plus the new headers.
- **D-16:** Parity script `scripts/check-console-headers.js` normalises the header directives (ordering, quoting, `always`, templated hosts) and compares the gluster file, both image `default.conf` files and the `.planning/runbooks/swarm-configs/` snapshots. It **runs as a CI step** and fails on drift.

### Claude's Discretion
- Exact reason-code names beyond those listed, the log format, and how telemetry is counted, for example with a grep-able log line.
- Spec layout. Research says `ZZ-CSRFSpec.js` cases 1, 4, 5 and 6 need rewriting, plus at least one enforce-mode agent flow covering prime → login → session/token.
- Plan granularity and wave split within the order research recommends: WR-06 fail-open → observe → enforce → WR-04 + routes → headers → combined two-console verification.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/middleware/csrf.js` (144 lines): `ensureXsrfCookie`, `issueCsrfToken`, the verify middleware, `failureReason()` reason codes, and fail-open/enforce via `CSRF_ENFORCE` / `debug.csrf_enforce`. The cookie is `sameSite: 'lax'` with its domain taken from `CookiePolicy.cookieDomain`.
- `lib/thinx/secrets.js` `readSecret()`: file first, then env, then null, cached per name. `CSRF_SECRET` is already mounted on `thinx_api`.
- `lib/thinx/session_token.js` `markLogin`: the post-login binding signal (`login_owner`).
- `node:crypto` `createHmac`, `timingSafeEqual`, `hkdfSync` (research: about 30 lines; do not adopt `csrf-csrf`/`csurf`).

### Established Patterns
- Session: `express-session` + connect-redis; main app `saveUninitialized: false`, `rolling: true`, `maxAge` 1 h (`thinx-core.js:335-340`). A second session config at `thinx-core.js:459-463` uses `saveUninitialized: true`, so check which routes it serves.
- `csrf.ensureXsrfCookie` is mounted before all routers (`thinx-core.js:349-353`).
- Login sites without `regenerate()` today (session fixation is open): `router.auth.js` `loginAction` (~L275) and `performTokenLogin` (~L47/L73), plus the Google and GitHub OAuth callbacks (`router.google.js`, `router.github.js`; GitHub is now `handleGithubToken` after CR-01).
- Production changes: single-service `docker service update`; push `thinx-staging` only; a checkpoint before every production mutation.

### Integration Points
- `router.js` per-request Bearer bridge (~L94): must not regenerate.
- Console header files: gluster `/mnt/gluster/deployment/swarm/console/default.conf` (canonical, bind-mounted into both consoles), `services/console` image `src/default.conf` (Vue; already has `Referrer-Policy`), the classic console image config, and `.planning/runbooks/swarm-configs/console-default.conf.prod` and the `rtm.thinx.cloud-server.{pre,post}.nginx` snapshots (currently `X-Permitted-Cross-Domain-Policies: all`).
- Runbooks: `.planning/runbooks/csp-csrf-hardening.md`, `console-csp-source-of-truth.md`.

</code_context>

<specifics>
## Specific Ideas

- Research: `.planning/research/SUMMARY.md` (Phase 25 items, open questions 1-3 and 9), `ARCHITECTURE.md` §1 (WR-06) and the CSP source-of-truth section, and `PITFALLS.md` pitfalls 1-2 (no session to bind to; per-boot random key).
- The classic console has no retry after rotation. The login response must carry the new `XSRF-TOKEN`, and the classic register / forgot-password / reset-confirm flows must be checked under enforcement (SEC-CSRF-06).
- Finish with one combined two-console verification pass (the v1.13 precedent was rated "Good").

</specifics>

<deferred>
## Deferred Ideas

- Review WR-02 from Phase 24 (the `docker-swarm.yml` api DB/Redis secret mounts would take effect on a stack deploy) is not in this phase's scope. This phase must not run a stack deploy.
- SEC-CSP-02 (`unsafe-eval`) stays deferred until AngularJS is retired.

</deferred>
