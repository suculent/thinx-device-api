# Requirements: THiNX Device API — v1.13 Web Hardening (Console/Edge)

**Defined:** 2026-07-04
**Core Value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## v1.13 Requirements

Requirements for the v1.13 Web Hardening milestone. Each maps to exactly one roadmap phase. Sourced from the 2026-07-04 HawkScan DAST of `rtm.thinx.cloud` (scan `c5691244`, rescan `1f3ec1e7`) — the two Medium findings that were deliberately deferred at scan time because they live in the console/edge layer, not the API core. Context: memory `csp-wildcard-hardening-deferred.md` + `thinx-console-topology`. The live swarm runs **two** console services (legacy `thinx_console` AngularJS + `thinx_vue`), so both frontends plus the swarm nginx edge are in scope and must stay consistent.

### Web Hardening

- [ ] **SEC-CSP-01**: The `Content-Security-Policy` header no longer uses the `https:` scheme-wildcard in `default-src`/`connect-src`; explicit hosts are pinned instead. The change is applied consistently across all three CSP sources — the swarm nginx edge (`.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx:28` + `.post.nginx:28`), the legacy console image (`services/console/src/default.conf`), and the Vue console image (`services/console/vue/default.conf`) — so the effective policy is identical whichever image serves a request. `unsafe-eval` is intentionally retained (removal is blocked on the console leaving AngularJS — see Future). — Acceptance: HawkScan rescan of `rtm.thinx.cloud` reports **0 NEW** "CSP: Wildcard Directive" (plugin 10055-4) paths; the legacy console and Vue console both load and function (no CSP-blocked scripts/styles/websockets in the browser console, including the Crisp `wss://client.relay.crisp.chat` connection); the three CSP definitions are byte-for-byte equivalent modulo the host-token placeholder.

- [ ] **SEC-CSRF-01**: Both console login forms — the legacy AngularJS console AND the Vue console — carry a synchronizer anti-CSRF token that the API validates server-side on the login POST, using a single token scheme compatible with both frontends. Requests with a missing/invalid token are rejected; valid logins are unaffected. Builds on the `SameSite=lax` session cookies already shipped (commit `ce7ca34c`). — Acceptance: HawkScan rescan reports **0 NEW** "Anti-CSRF Tokens" (plugin 20012) paths; a login POST with no/forged token is rejected (4xx) while a normal login through each console still succeeds; the token mechanism is identical across both consoles (no per-frontend fork of the server-side check).

## Future Requirements

Acknowledged and deferred — candidates not in the v1.13 roadmap.

### Web Hardening — Deferred

- **SEC-CSP-02 (`unsafe-eval` removal)**: Drop `'unsafe-eval'` (and tighten `'unsafe-inline'`) from the CSP once the console is fully off AngularJS. AngularJS's `$parse` requires `unsafe-eval` unless run in CSP mode; removing it now would break the legacy console. Blocked on the AngularJS→Vue console migration completing.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Removing `'unsafe-eval'` / `'unsafe-inline'` from CSP | Blocked on AngularJS retirement; tracked as deferred SEC-CSP-02. |
| The two High HawkScan findings (Oracle SQLi, Shell Shock RCE) | Verified as false positives against the code (no SQL datastore; `mac` never shelled) and triaged FALSE_POSITIVE on the platform at scan time. Not real vulnerabilities. |
| Information Leak – Email (`/public/privacy.html`) | Intentional privacy-policy contact address; triaged FALSE_POSITIVE at scan time. |
| API-side CSRF for token-authenticated routes | API routes use `X-Access-Token`/JWT (not ambient cookies) and are not CSRF-prone; only the cookie-session login forms need the token. |
| Multi-tenant revamp / v2 API features | Future major milestone, not v1.x. |

## Traceability

Filled by the roadmap (each REQ → exactly one phase).

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SEC-CSP-01 | Phase 21 | Pending |
| SEC-CSRF-01 | Phase 21 | Pending |
