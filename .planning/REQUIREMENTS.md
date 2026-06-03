# Requirements: THiNX Device API — v1.9 Backend Hygiene & Posture

**Defined:** 2026-06-02
**Core Value:** Pay down the v1.x backlog the v1.0 GA explicitly deferred — clean up structural hygiene, lift the security posture, and close auth/account lifecycle gaps — without breaking any legacy-console-compatible route the Vue console inherited.

## v1.9 Requirements

Requirements scoped to v1.9. Each maps to exactly one roadmap phase. Numbering for REFACTOR-/SEC-/AUTH- continues the namespaces opened during v1.0 (see `.planning/milestones/v1.0-REQUIREMENTS.md`). BASE-IMG- and THINX-CERT- are new namespaces opened by items surfaced 2026-06-02.

### Backend Hygiene

- [x] **REFACTOR-01**: Single source of truth for `app.set('trust proxy', ...)`. The duplicate calls at `thinx-core.js:285` and `:407` collapse to one canonical site with explicit intent commented. No change to observed IP-derivation behavior in session middleware (assert via existing session specs). Validated by: (a) grep returns exactly one `trust proxy` call in `thinx-core.js`, (b) Jasmine session/auth specs unchanged & green, (c) production smoke (login + device API call from a known-IP browser) still resolves the correct `req.ip`.

- [x] **REFACTOR-02**: Strict equality in `Owner.password_reset`. Replace `!=` at `lib/thinx/owner.js:476` with `!==`. Behavior for the legacy reset_key path stays identical for all currently-valid inputs. Validated by: (a) grep `lib/thinx/owner.js` shows zero `!=`/`==` non-strict comparisons in the touched function, (b) existing `ZZ-AppSessionUserSpec.js` reset_key flow green, (c) added unit covers reset_key string vs. number coercion (the exact case `!=` was masking).

- [x] **REFACTOR-03**: WebSocket socket-close cleanup. Add `socket.on('close')` handlers to the WS lifecycle in `thinx-core.js:445-487` so per-connection resources are released deterministically (not at next GC). Validated by: (a) the close handler is invoked for both client-initiated close and server shutdown paths, (b) a new spec asserts the cleanup runs (e.g., counter / map entry removed), (c) no regression in MQTT/WebSocket round-trip specs.

- [x] **REFACTOR-04**: `lib/thinx/owner.js` callback → async/await sweep. Convert the ~73 callback patterns identified in v1.0 codebase mapping to `async/await` without changing public method signatures or observable behavior. Public callers (router.user.js, router.profile.js, etc.) still receive identical resolved values / errors. Validated by: (a) zero behavioral changes — full Jasmine `ZZ-*` suite green, (b) `node --check` clean, (c) lint passes, (d) call-graph spot-check on top 5 highest-fanout methods (`create`, `delete`, `update`, `password_reset`, `password_set`).

- [x] **REFACTOR-05**: Reclassify `jshint` and `fs-finder` from `dependencies` to `devDependencies` in `package.json`. Confirm production Docker image still builds (`Dockerfile:86 npm install --omit=dev`) and starts; no runtime require of either module from app code. Validated by: (a) `grep -rE "require\\(['\"]jshint['\"]\\)|require\\(['\"]fs-finder['\"]\\)" lib/ thinx-core.js` returns zero hits, (b) production image builds locally and `docker run` reaches the `Server up at` log line, (c) build pipeline (CircleCI) green.
  - **Scope amendment (2026-06-02, Phase 5):** Closed for `jshint` (moved to `devDependencies`); `fs-finder` portion deferred — fork is internally owned (`github:suculent/Node-FsFinder#master`) and has 5 active runtime call sites in `lib/` (`builder.js`, `deployment.js`, `platform.js`, `repository.js`, `plugins/arduino/plugin.js`), so reclassification would break production. Full `fs-finder` removal (replace with `fs-extra` glob helpers or native `fs.promises.readdir` recursion) deferred to a proposed v1.10 phase. See `.planning/phases/05-backend-hygiene-cheap-sweeps/05-CONTEXT.md` (REFACTOR-05 decision block) and `.planning/STATE.md` (v1.10 backlog) for details.

### Security & Compliance

- [x] **SEC-COOKIE-01**: Re-evaluate `httpOnly: true` on the session cookie at `thinx-core.js:303`. Either re-enable `httpOnly: true` (preferred) with the WebSocket flow still working, OR document why it must stay `false` with a dated note + ticket. Validated by: (a) session cookie attribute confirmed via `curl -i` against a deployed image, (b) Vue console login + WebSocket subscribe round-trip works against rtm, (c) new regression spec covers cookie attribute presence.

- [x] **SEC-WS-01**: WebSocket handshake hardening on `rtm.thinx.cloud`. Either reproduce + fix the latent 404-on-handshake risk flagged in `AGENTS.md:96-97`, OR document the upstream-Traefik condition that triggers it with reproduction steps and a deferred-to-edge-redesign tag. Validated by: (a) `wscat` handshake from a fresh Vue session returns `101 Switching Protocols` against rtm, (b) a regression spec or runbook documents the failure mode if it can't be code-fixed here.

- [ ] **SEC-DEP-02**: services/console dependency triage **coordination** from this repo. Scope inside `thinx-device-api`: schedule the parallel SEC-DEP-02 phase in `services/console/.planning/ROADMAP.md` (cross-project coordination), capture the 2 high-severity console alerts' runtime-vs-build classification once the console-side triage runs, and merge any resulting submodule pointer bump cleanly into `thinx-staging`/`master`/`main`. Deep work lives in the console submodule's GSD project. Validated by: (a) console-side phase exists in `services/console/.planning/ROADMAP.md`, (b) submodule pointer is up to date on `thinx-staging` after console triage merges, (c) `.planning/dep-triage.md` annexed with cross-project verdict roll-up.

- [ ] **SEC-PII-02**: Historic CouchDB `managed_logs` redaction. Remediate pre-Phase-2 raw `reset_key` (and any other PII) in the `managed_logs` database (~658,808 docs as of 2026-05-26). Pick ONE of: (a) one-shot `_bulk_docs` redaction overlaying the leaky fields, (b) age-based bulk delete with a documented retention window, (c) introduce a forward-going TTL on audit entries. Validated by: (a) sampling N=1000 random recent + N=1000 random old docs shows zero raw 64-char hex reset_keys, (b) retention/TTL behavior (if chosen) covered by a runbook, (c) GDPR-posture note appended to `.planning/runbooks/` documenting the historic cleanup.

- [ ] **THINX-CERT-CHECK-01**: Startup ca.pem freshness probe. Add a code-side check at server start that compares the chain in `ca.pem` against the leaf cert's issuer and emits a clear startup WARN (and metric/log) when `ca.pem` is older than the leaf or doesn't contain a matching intermediate. The probe does NOT mutate certs — it only detects the gap (cert rotation itself is OPS / outside this repo). Validated by: (a) startup with a fresh leaf and an R10-era `ca.pem` (the actual 2026-06-02 condition) emits the WARN, (b) startup with leaf + matching intermediate emits no warning, (c) unit test covers the matcher logic against fixture PEM bundles.

### Auth & Account Lifecycle

- [x] **AUTH-REACTIVATE-01**: Self-serve or admin reactivation for soft-deleted users. Implement ONE of: (a) admin-only `POST /api/v2/admin/user/:id/reactivate` that clears `user.deleted = true`, (b) a self-serve email-link flow that lets a soft-deleted user request reactivation. Whichever path ships, the lockout at `lib/router.auth.js:189-191` must respect a re-activated account on the next login. Validated by: (a) curl/round-trip flow demonstrates a soft-deleted → reactivated user can log in again, (b) the route requires the appropriate auth gate (admin or signed reactivation token), (c) regression spec covers the reactivation path.

- [x] **AUTH-RESET-LINK-CONSOLE**: Password-reset email lands on the Vue console, not the legacy AngularJS console. Implement ONE of: (a) introduce `app_config.console_url` (separate from `api_url`) and use it for the reset-email template in `lib/thinx/owner.js:147`, (b) keep the link pointing at the API and have the API GET handler redirect to the Vue console after reset_key validation. Coordinated with the console submodule's password-set route. Validated by: (a) a generated reset email link resolves to the Vue console reset-password page, (b) the reset_key flow completes end-to-end through Vue, (c) regression spec covers the new link shape.

### Build & Release Hygiene

- [ ] **BASE-IMG-01**: `base/update.sh` hardening. The current script (commit `304b09d1` triggered today's manual `1.9.2866 → 1.9.3054` bump) is a fire-and-forget rebuild with no failure handling, no tag pinning beyond `alpine`, and no automatic patch-level version bump. Add: (a) `set -euo pipefail`, (b) optional `--tag <tag>` arg to pin a specific base image tag, (c) auto-bump of `package.json` `version` patch level (matching the current `1.9.X` rolling pattern) before `docker buildx build`, (d) clear log of pre/post image digest. Validated by: (a) running `base/update.sh` end-to-end on a clean clone produces an image and a single `chore: base version bump` commit (or surfaces a documented failure), (b) shellcheck clean, (c) the script no longer needs an out-of-band manual `git commit` step.

## Future Requirements

<!-- Tracked but explicitly deferred from v1.9. Promote in a future milestone. -->

- **OPS-02** — Stale swarm memberlist entry `b356ad8e1d60`. Pure OPS; carries swarm-fabric risk; deferred until a re-correlated outage or a cluster join elevates priority.
- **OPS-03** — 4 stack services with malformed `<image>@` autoredeploy specs. Pure OPS edit to `/mnt/gluster/deployment/swarm/*.yml`; not codebase. Re-evaluate before next CouchDB version bump.
- **TEST-CHAI-01** — chai-http v5 ESM migration. Locked per `AGENTS.md:82-92` until a Snyk/Dependabot CVE in `superagent` v3 forces the upgrade.
- **CONSOLE-LEGACY-JSON-PARSE** — `JSON.parse` bug in `services/console/src/login.js:173` + `password.js:87`. Lives in the sibling-project codebase; tracked in `services/console/.planning/` v1.x backlog.

## Out of Scope

Explicitly excluded from v1.9. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-tenant revamp / v2 API features | Future major milestone |
| Edge layer redesign (Traefik labels, nginx beyond Phase-3 needs) | OPS scope; only AUTH-RESET-LINK-CONSOLE may touch console-side routing |
| ACME / Let's Encrypt automation rewrite | Lives on the swarm host (`/etc/letsencrypt/`, cron + ACME client) — outside this codebase. THINX-CERT-CHECK-01 is the codebase angle (detect-only). |
| Dashboard data-exposure rework (AGENTS.md L98) | Privacy concern but no regression vs. legacy; v2 candidate |
| Deep `services/console` work (beyond SEC-DEP-02 coordination) | Sibling-project GSD scope |
| Swarm memberlist cleanup (OPS-02) | Pure OPS; deferred (see Future Requirements) |
| Swarm stack yml `<image>@` cleanup (OPS-03) | Pure OPS edit on swarm host; deferred (see Future Requirements) |
| `thinx_worker` silent-loop on `docker pull` (G10) | Worker repo — different codebase |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REFACTOR-01 | Phase 5 | Complete |
| REFACTOR-02 | Phase 5 | Complete |
| REFACTOR-05 | Phase 5 | Complete |
| REFACTOR-03 | Phase 6 | Complete |
| SEC-WS-01 | Phase 6 | Complete |
| SEC-COOKIE-01 | Phase 6 | Complete |
| REFACTOR-04 | Phase 7 | Complete |
| AUTH-REACTIVATE-01 | Phase 8 | Complete |
| AUTH-RESET-LINK-CONSOLE | Phase 8 | Complete |
| SEC-PII-02 | Phase 9 | Pending |
| SEC-DEP-02 | Phase 10 | Pending |
| BASE-IMG-01 | Phase 11 | Pending |
| THINX-CERT-CHECK-01 | Phase 11 | Pending |

**Coverage:**
- v1.9 requirements: 13 total
- Mapped to phases: 13 ✓
- Verified: 0
- Pending: 13
- Unmapped: 0

---
*Requirements defined: 2026-06-02 (milestone start)*
*Traceability filled: 2026-06-02 — v1.9 roadmap created with 7 phases (Phases 5–11, continuing from v1.0's Phase 4). 13/13 requirements mapped, no orphans, no duplicates.*
