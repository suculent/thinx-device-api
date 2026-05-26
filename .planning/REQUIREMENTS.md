# Requirements: THiNX Device API — v1 GA Backend Closures

**Defined:** 2026-05-26
**Core Value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability that the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.

## v1 Requirements

Requirements for closing v1.0 GA from the backend side. Each maps to exactly one roadmap phase. Sibling to the console submodule's v1.0 frontend requirements (`services/console/.planning/REQUIREMENTS.md`).

### Authentication API (Backend)

- [ ] **AUTH-API-01**: Unauthenticated `POST /api/v2/password/reset` returns 200 with the standard success body for a well-formed `{email: string}` JSON payload from a browser origin, restoring legacy-console behavior. Behavior must match for both registered and unregistered emails (no enumeration). Validated by: (a) `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset -H 'Content-Type: application/json' -d '{"email":"x@y"}'` returns 200, (b) Vue console "Forgot password?" flow on rtm completes the full email → reset_key → set-password round-trip, (c) regression spec under `spec/jasmine/ZZ-*` covering the unauthenticated 200 path. Cross-ref: `.planning/G8-INVESTIGATION.md`, console Phase 11 Wave 1.

### Operations

- [ ] **OPS-01**: Swarm-side auto-pull on `188.166.23.244` resumes working. Pushing an updated image tag (e.g., a parent submodule bump triggering the Vue rebuild) results in the swarm task picking up the new image without requiring manual `./scripts/stack-deploy`. Target SLA: rolling task within 5 minutes of push completion. Validated by: (a) root-cause documented (Traefik label, swarm cronjob, registry auth, manifest mismatch, etc.), (b) a controlled push-and-observe verification on rtm, (c) reversion plan documented if the fix introduces regression. Cross-ref: console `v1.x-backlog.md` (OPS-swarmpull), incident 2026-05-25 14:44 CET.

### Security & Compliance

- [ ] **SEC-DEP-01**: All 11 high-severity (and a triage pass over the 17 moderate) GitHub dependabot findings against the `suculent/thinx-device-api` default branch are classified as either v1-blocker (fixed before milestone close) or v1.x-deferred (moved to a backlog file with rationale and trigger condition for future action). Validated by: (a) a `.planning/dep-triage.md` table of all 28 findings with verdicts, (b) blocker count on GitHub Security tab drops to the documented "deferred-with-rationale" baseline.

- [ ] **SEC-PII-01**: `lib/thinx/owner.js` error logs no longer emit raw PII at the 6 sites surfaced in `.planning/codebase/CONCERNS.md`: emails at L499 (`password_reset_init` not-found path); reset_keys at L451/L474/L583/L647; Mailgun token at L95; activation token at L228. Replacement pattern: hashed/redacted email fingerprints (e.g., last 4 chars + length), token length-only or first-4-chars + ellipsis, never the full value. Validated by: (a) `grep -nE '(email|reset_key|mailgun_token|activation_token)' lib/thinx/owner.js | grep console.log` shows no remaining raw-value emissions, (b) at least one spec exercises an error path and asserts the redaction format.

## v2 Requirements

<!-- Deferred from v1 GA. Tracked here for v1.x and beyond, not in current roadmap. -->

### Backend Hygiene

- **REFACTOR-01**: Resolve duplicate `app.set('trust proxy', ...)` calls at `thinx-core.js:285` and `:407` (second wins; intent unclear) — defer to v1.x because changing trust-proxy behavior mid-release risks session/IP-derivation regressions.
- **REFACTOR-02**: Replace weak equality `!=` with strict `!==` at `lib/thinx/owner.js:476` in `password_reset` — defer to v1.x; behavior is correct in the legacy path but the comparison is fragile.
- **REFACTOR-03**: Add `socket.on('close')` cleanup handlers in `thinx-core.js:445-487` (WebSocket lifecycle) — defer to v1.x; current behavior depends on GC, not crashing prod but a known leak class.
- **REFACTOR-04**: Convert `lib/thinx/owner.js` callback-style chains (73 callback patterns) to async/await — defer to v1.x; cosmetic, no functional gap.

### Security (Posture)

- **SEC-COOKIE-01**: Session cookie at `thinx-core.js:303` currently sets `httpOnly: false` ("temporarily disabled for websocket debugging" per stale comment). Re-evaluate whether `httpOnly: true` is feasible with the current WebSocket flow — defer to v1.x; flipping this without a WebSocket regression test is risky.
- **SEC-WS-01**: WebSocket handshake risk on `rtm.thinx.cloud` (AGENTS.md L96-97: "Websocket handshake may still return 404 even with corrected frontend bundle") — defer to v1.x unless v1 UAT surfaces a regression.

### Testing

- **TEST-CHAI-01**: Migrate `spec/jasmine/ZZ-*` (16 spec files, ~200 `chai.request(thx.app)` calls) from chai-http v4 to v5 ESM API — deferred per `AGENTS.md:82-92` until a Snyk/Dependabot CVE in `superagent` v3 forces the upgrade.

## Out of Scope

Explicitly excluded from v1 GA. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `services/console` frontend work | Owned by the console submodule's GSD project (`services/console/.planning/`) |
| G10 (`thinx_worker` silent-loop on docker pull) | Lives in the worker repo — different codebase |
| chai-http v5 migration | Explicit dependency lock per `AGENTS.md:82-92`; tracked as TEST-CHAI-01 deferred |
| Multi-tenant revamp / v2 API features | Future milestone, not v1 GA |
| Edge layer redesign (Traefik labels, nginx rewrites beyond G8 needs) | Only AUTH-API-01 may touch edge config; otherwise outside scope |
| Dashboard data-exposure rework (AGENTS.md L98) | Privacy concern but not a regression vs. legacy — v1.x candidate |

## Traceability

<!-- Filled by the roadmapper at initialization (2026-05-26). -->

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-API-01 | Phase 1 | Pending |
| OPS-01 | Phase 3 | Pending |
| SEC-DEP-01 | Phase 4 | Pending |
| SEC-PII-01 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4 ✓
- Unmapped: 0

---
*Requirements defined: 2026-05-26*
*Last updated: 2026-05-26 — traceability filled by roadmapper*
