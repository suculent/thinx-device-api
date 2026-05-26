# Phase 1: AUTH API — Password Reset — Context

**Gathered:** 2026-05-26
**Status:** Ready for research/planning
**Source:** Seeded from `.planning/G8-INVESTIGATION.md` + ROADMAP.md Phase 1 + REQUIREMENTS AUTH-API-01

<domain>
## Phase Boundary

**In scope:** Restore `POST /api/v2/password/reset` to return HTTP 200 with the standard success body for unauthenticated callers from a browser origin on `rtm.thinx.cloud`. The Vue console's "Forgot password?" flow must complete the full email → reset_key → set-password round-trip, matching the legacy AngularJS console's behavior.

**The 403 currently breaks PROF/AUTH UAT** for any user who has forgotten their password — this is a live, user-visible regression on production.

**Out of scope for this phase** (may surface as future phases or v1.x backlog):
- Anything in `lib/router.user.js` lines 27 / 40 reset handlers being functionally rewritten (only middleware/edge config gets touched if the root cause demands it)
- Wider CORS overhaul beyond what is strictly necessary to clear the 403
- Test infrastructure changes — adding a regression spec is in-scope; restructuring `spec/jasmine/ZZ-*` is not
- Other Active items (SEC-PII-01, OPS-01, SEC-DEP-01) — they own their own phases

</domain>

<decisions>
## Implementation Decisions

### Behavioral contract (locked)

- The endpoint must return HTTP 200 + standard success body for **any well-formed** `{email: string}` JSON payload, regardless of whether the email matches a registered user (no user enumeration leak).
- The legacy alias `POST /api/user/password/reset` (lib/router.user.js:202) must continue to return the same response shape.
- The follow-up `GET /api/v2/password/reset?owner=...&reset_key=...` round-trip and `POST /api/v2/password/set` flow must work end-to-end after the fix.

### Fix-direction guardrails (locked)

- Prefer the **smallest possible change** that restores legacy behavior. A middleware fix in `thinx-core.js` or `lib/router.js` is preferred over a Traefik label change; a Traefik label change is preferred over an nginx config change.
- If the root cause is in the **edge layer** (Traefik / nginx on the swarm), the fix must include a `./scripts/stack-deploy` verification step *and* a documented reversion plan, because edge config changes have outsized blast radius.
- Do NOT bypass the rate limiter on `/api/v2/password/reset` — it's at `thinx-core.js:75-80` (windowMs 1min, max 500), and 500/min is high enough to not be the cause of a 403 for typical UAT traffic; rate-limit returns 429 not 403.
- Do NOT introduce new dependencies (no new npm packages, no new system packages).
- The fix must add a regression spec under `spec/jasmine/ZZ-*` that exercises the unauthenticated 2xx path (chai-http v4 pattern, since we hold v4 per `AGENTS.md:82-92`).

### Reproducibility (locked)

- Local reproduction must be attempted before any change to production config. The minimum reproduction surface is a `curl` against `rtm.thinx.cloud` and (if accessible) against a staging environment, comparing response codes and headers.
- If the bug only reproduces against rtm, the fix may live in the edge layer and the SSH-based investigation path from `AGENTS.md:17-19` is in-bounds.

### Claude's discretion

- Choice of grep / read order while investigating
- Specific middleware diagnosis technique (binary-search by commenting out, instrumented logging, etc.)
- Exact phrasing of the spec assertion (as long as it exercises an unauthenticated POST and asserts 2xx)
- Whether to add ranked-suspect findings as comments in the source vs. only in `SUMMARY.md`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before producing artifacts.**

### Pre-investigation seed
- `.planning/G8-INVESTIGATION.md` — Recon snapshot from 2026-05-26 covering route definition, mount order, rate limiter, CSRF audit (none in Node app), CORS origin reflection, edge layer suspects, ranked first-moves (curl reproduction → edge config inspection → bisect → spec/ZZ-* regression test). **This is the primary briefing document for the phase.**

### Codebase intel
- `.planning/codebase/CONCERNS.md` — Codebase concerns map (refreshed 2026-05-26). Top G8 suspects ranked here: (a) CORS allowlist on rtm rejecting the Vue origin, (b) the JWT-verify 403 short-circuit at `lib/router.js:132`, (c) Traefik/nginx edge config.
- `.planning/codebase/ARCHITECTURE.md` — Express monolith bootstrap and middleware mount order (`thinx-core.js:316` sessionParser → `:318` express.json → `:325` rate limiter → `:335-359` router mounting).
- `.planning/codebase/INTEGRATIONS.md` — Mailgun (used by `lib/thinx/owner.js:95` for reset email), CouchDB (users table), Redis (sessions).

### Source under investigation
- `lib/router.user.js` — Route definitions at L39 (`postPasswordReset` handler), L144 (POST /api/v2 mount), L202 (POST /api/user legacy alias). Handler unchanged since 2025-05-07 (commit `0514f6ea` touched `postChat`, not reset).
- `lib/router.js:32-56` — CORS origin reflection middleware (per `AGENTS.md:27`: "fixed by reflecting request origins instead of returning `*` with credentials"). Direct G8 suspect.
- `lib/router.js:132` — `res.status(403).end()` on bad-JWT (surfaced by today's CONCERNS map as a credible 403 source if the password-reset path somehow hits a JWT check).
- `thinx-core.js:316` — `app.use(sessionParser)` mount point (session-required middleware, but the reset route doesn't reference `req.session` in its handler — confirm).
- `lib/thinx/owner.js` — `password_reset_init` (L486) and `password_reset` (L444) implementations. Logs PII (separate concern: SEC-PII-01 / Phase 2).

### Operations
- `AGENTS.md:8-19` — Deployment flow + ssh details for the swarm host `188.166.23.244` (used for edge config inspection if needed).
- `AGENTS.md:26-27` — "CSP websocket blocking was fixed by allowing connect-src websocket origins in nginx config" / "Backend CORS bug was fixed in lib/router.js by reflecting request origins instead of returning `*` with credentials". Recent edge + backend changes worth bisecting against.

### Requirement
- `.planning/REQUIREMENTS.md` — AUTH-API-01 (validation criteria embedded).

### Cross-project
- `services/console/.planning/ROADMAP.md` L380 — Phase 11 Wave 1 entry for G8 in the console roadmap.
- `services/console/.planning/STATE.md` — Notes Phase 11 Wave 2 (G9) shipped today via quick task `260526-2d3`; G8 backend fix lives in this parent project.

</canonical_refs>

<specifics>
## Specific Ideas

- The legacy AngularJS console was working against the same endpoint with the same Vue-console-equivalent unauthenticated-POST shape — meaning the bug is **almost certainly a regression**, not a missing-feature gap. Reasoning: the route handler hasn't changed in ~12 months. Suspect everything mounted **before** the route, especially anything added in the last 6-12 months: Let's-Encrypt intermediate rotation handling, the rate-limiter setup, any helmet/CORS middleware reorder.
- The console's "Forgot password?" form sends a JSON `{email}` payload with `Content-Type: application/json`. Possible content-type-related rejection (express.json mounted at thinx-core.js:318 — should accept).
- Browser origins for the Vue console are `https://rtm.thinx.cloud` (same-origin) and possibly `https://thinx.cloud` (parent LANDING_HOSTNAME). Either should reflect through the CORS middleware.

</specifics>

<deferred>
## Deferred Ideas

- **Move `password_reset_init` to a non-callback async pattern** — out of scope for this phase (cosmetic; REFACTOR-04 candidate for v1.x).
- **Add unit tests for `Owner.password_reset_init` callback paths** — the regression spec at the route level is sufficient for AUTH-API-01; expanded unit coverage is a v1.x candidate.
- **Fix the PII-in-logs at owner.js:499** — owned by Phase 2 (SEC-PII-01), don't bundle here.
- **Triage of `dependabot` advisories that touch the auth stack** — owned by Phase 4 (SEC-DEP-01).
- **OPS-swarmpull diagnosis** — owned by Phase 3 (OPS-01); only touched here if the G8 fix involves swarm config and the lack of auto-pull becomes a blocker for verifying the fix landed.

</deferred>

---

*Phase: 01-auth-api-password-reset*
*Context gathered: 2026-05-26 — seeded from G8-INVESTIGATION.md; no /gsd:discuss-phase pass needed (pre-investigation already comprehensive)*
