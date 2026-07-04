# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)
- 🔄 **v1.13 — Web Hardening (Console/Edge)** — Phase 21 (in progress)

## Phases

<details>
<summary>✅ v1.0 — v1 GA Backend Closures (Phases 1–4) — SHIPPED 2026-05-27</summary>

See `.planning/MILESTONES.md`. 4/4 v1 requirements (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01).

</details>

<details>
<summary>✅ v1.9 — Backend Hygiene & Posture (Phases 5–11) — SHIPPED 2026-06-04</summary>

See `.planning/milestones/v1.9-ROADMAP.md`. 13/13 v1.9 requirements across 7 phases.

</details>

<details>
<summary>✅ v1.10 — Operational Closures (Phases 12–14) — SHIPPED 2026-06-05</summary>

See `.planning/milestones/v1.10-ROADMAP.md`. 5/5 v1.10 requirements.

- [x] Phase 12: Code-side Closure Helpers (3/3 plans) — TEST-WS-01 + OBS-01 + OBS-02
- [x] Phase 13: SEC-WS-01 Edge Handshake Closure / OPS-EXEC-01 (1/1 plan)
- [x] Phase 14: SEC-PII-02 managed_logs Production Sweep Closure / OPS-EXEC-02 (1/1 plan)

</details>

<details>
<summary>✅ v1.11 — Backlog Drawdown (Phases 15–17) — SHIPPED 2026-06-06</summary>

See `.planning/milestones/v1.11-ROADMAP.md`. 4/4 v1.11 requirements (REFACTOR-06, REFACTOR-07, SEC-DEP-03, OPS-EXEC-03). Audit: `tech_debt` (deferred items in `.planning/MILESTONES.md` + STATE.md).

- [x] Phase 15: fs-finder Removal (4/4 plans) — REFACTOR-06 + REFACTOR-07; native `lib/thinx/finder.js` helper, `fs-finder` dropped from deps
- [x] Phase 16: Dependabot Triage (1/1 plan) — SEC-DEP-03; 3 overrides, runtime tree 0 high/0 moderate, uuid #194 deferred
- [x] Phase 17: Influx Fix Production Deploy (1/1 plan) — OPS-EXEC-03; discrepancy branch (fix already live, verified)

</details>

<details>
<summary>✅ v1.12 — Inbox Drawdown (Phases 18–20) — SHIPPED 2026-06-29</summary>

See `.planning/milestones/v1.12-ROADMAP.md`. 4/4 v1.12 requirements (SEC-PII-03, GH-01, GH-02, SEC-CFG-01).

- [x] Phase 18: Complete GDPR Purge — SEC-PII-03
- [x] Phase 19: Per-user GitHub Token Backend — GH-01 + GH-02
- [x] Phase 20: Docker Secrets Helper — SEC-CFG-01

</details>

### v1.13 — Web Hardening (Console/Edge) (Phase 21)

- [ ] **Phase 21: CSP Wildcard Removal + Anti-CSRF Token** — SEC-CSP-01 + SEC-CSRF-01; drop the `https:` scheme-wildcard from CSP `default-src`/`connect-src` across all three CSP sources (nginx edge, legacy console, Vue console), and add a synchronizer anti-CSRF token to both console login forms validated server-side by the API

## Phase Details

### Phase 18: Complete GDPR Purge
**Goal**: Every owner-scoped artifact is fully and immediately removed on GDPR deletion across all stores — no PII or credentials recoverable after `DELETE /api/v2/gdpr`
**Depends on**: Nothing (independent)
**Requirements**: SEC-PII-03
**Success Criteria** (what must be TRUE):
  1. `DELETE /api/v2/gdpr` removes in one call: the user document, all device documents, all build documents, all RSA key files, the deploy_path tree, the repo_path tree, and all Redis keys (`ak:<owner>` + `/<owner>/*`) — immediately via `del()`, not via 1s expire
  2. After purge, `KEYS /<owner>/*` and `ak:<owner>` return empty immediately (not after a 1s TTL race)
  3. A crafted owner_id cannot cause filesystem deletion outside the owner subtree — the path-prefix assertion (`data_root/.../<owner>`) is enforced and tested with a negative test
  4. The purge orchestrator is reused by the scheduled `purgeOldUsers()` path, not duplicated
  5. A spec seeding a full owner (devices, builds, RSA key files, Redis keys, fs dirs) runs to completion with every store verified empty; the previously-skipped `xit` delete test is un-skipped
**Plans**: TBD

### Phase 19: Per-user GitHub Token Backend
**Goal**: A logged-in user can link a GitHub access token to their account; the API auto-creates and pushes their RSA public key to GitHub on first link — backend only, no console UI
**Depends on**: Nothing (independent; console UI is GH-03, deferred to services/console submodule)
**Requirements**: GH-01, GH-02
**Success Criteria** (what must be TRUE):
  1. A valid token submitted to the authenticated `POST /api/github/token` endpoint is validated against GitHub, stored on the calling user's doc via `owner.addGitHubAccessToken()`, and never echoed back in any API response or profile payload
  2. An invalid token returns 401 and stores nothing — the user doc is unchanged
  3. A user with no RSA key ends up with one created automatically (`rsakey.create`) and pushed to their GitHub account before the endpoint returns success
  4. A user with an existing RSA key has it pushed to GitHub without duplication error (HTTP 422 from GitHub is treated as success, not an error)
  5. All route tests mock the GitHub API (no live calls) so they are immune to the known `GitHubSpec` flakiness that gates deploy
**Plans**: TBD

### Phase 20: Docker Secrets Helper
**Goal**: Core credentials (Redis, CouchDB) load from Docker secret files in swarm, falling back to `.env` for local dev, with no plaintext secrets in `docker service inspect` environment
**Depends on**: Nothing (independent)
**Requirements**: SEC-CFG-01
**Success Criteria** (what must be TRUE):
  1. `readSecret(name, default)` returns the trimmed contents of `/run/secrets/<name>` when the file exists, falls back to `process.env[name]` when the file is absent, and falls back to the default when both are absent — results are cached
  2. Redis password (`globals.js`) and CouchDB user/pass/secret/cookie (`database.js`) load via `readSecret()` in the production code path
  3. `docker-swarm.yml` declares a top-level `secrets:` block and references those secrets on the relevant services; the migrated vars are removed from the `environment:` section
  4. Existing `.env`-based local and dev boots work without modification (backward compat preserved)
  5. A unit spec for `lib/thinx/secrets.js` covers all three code paths (file present, file absent with env var set, both absent) using a mocked fs — no filesystem writes in tests
**Plans**: TBD

### Phase 21: CSP Wildcard Removal + Anti-CSRF Token
**Goal**: Close the two deferred HawkScan Medium findings that live in the console/edge layer — CSP scheme-wildcards and the login-form anti-CSRF token — across both the legacy AngularJS console and the Vue console plus the swarm nginx edge, kept mutually consistent
**Depends on**: Nothing (independent security hardening; touches nginx edge config + both console images, not backend API routes except the new CSRF-validation middleware)
**Requirements**: SEC-CSP-01, SEC-CSRF-01
**Success Criteria** (what must be TRUE):
  1. HawkScan rescan of `rtm.thinx.cloud` reports **0 NEW** "CSP: Wildcard Directive" (plugin 10055-4) paths — the `https:` scheme-wildcard is gone from `default-src`/`connect-src` in favor of explicit pinned hosts
  2. HawkScan rescan reports **0 NEW** "Anti-CSRF Tokens" (plugin 20012) paths — a login POST with no/forged token is rejected (4xx) on both console login flows, while a normal login through each console still succeeds
  3. Both the legacy AngularJS console and the Vue console load and function fully after the change — no CSP-blocked scripts/styles/websockets in the browser console, including the Crisp `wss://client.relay.crisp.chat` connection
  4. The anti-CSRF token mechanism is identical across both consoles — one server-side validation scheme, no per-frontend fork of the check
  5. The three CSP definitions (nginx-edge `pre`/`post` runbook snapshot, legacy console `services/console/src/default.conf`, Vue console `services/console/vue/default.conf`) are byte-for-byte equivalent modulo the host-token placeholder
**Plans**: 5 plans (3 waves)
- [ ] 21-01-PLAN.md — API CSRF double-submit middleware (fail-open/enforce flag) + route wiring
- [ ] 21-02-PLAN.md — Console CSRF wiring (classic hidden _csrf fields + login.js header; Vue Login.vue header)
- [ ] 21-03-PLAN.md — CSP host pinning across nginx edge runbook + both console default.conf
- [ ] 21-04-PLAN.md — Deploy both repos fail-open + functional/CSP verify
- [ ] 21-05-PLAN.md — Flip CSRF enforcement + HawkScan rescan + rollback runbook

**Granularity note (coarse):** SEC-CSP-01 and SEC-CSRF-01 are combined into a single Phase 21 rather than split across two phases. Both are console/edge-layer changes that (a) touch the exact same three deploy surfaces — nginx edge config, legacy console image, Vue console image — (b) share the identical "keep both consoles + edge mutually consistent" verification concern, and (c) ship through the same console-submodule deploy pipeline. Splitting them would duplicate the two-console-consistency check and the HawkScan-rescan verification step across two phases for no delivery-boundary benefit; `granularity: coarse` favors this single combined phase.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–4. v1 GA Backend Closures | v1.0 | — | Complete | 2026-05-27 |
| 5–11. Backend Hygiene & Posture | v1.9 | 23/23 | Complete | 2026-06-04 |
| 12. Code-side Closure Helpers | v1.10 | 3/3 | Complete | 2026-06-04 |
| 13. SEC-WS-01 Edge Handshake Closure | v1.10 | 1/1 | Complete | 2026-06-05 |
| 14. SEC-PII-02 managed_logs Sweep Closure | v1.10 | 1/1 | Complete | 2026-06-05 |
| 15. fs-finder Removal | v1.11 | 4/4 | Complete | 2026-06-05 |
| 16. Dependabot Triage | v1.11 | 1/1 | Complete | 2026-06-06 |
| 17. Influx Fix Production Deploy | v1.11 | 1/1 | Complete | 2026-06-06 |
| 18. Complete GDPR Purge | v1.12 | 4/4 | Complete | 2026-06-29 |
| 19. Per-user GitHub Token Backend | v1.12 | — | Complete | 2026-06-29 |
| 20. Docker Secrets Helper | v1.12 | — | Complete | 2026-06-29 |
| 21. CSP Wildcard Removal + Anti-CSRF Token | v1.13 | 0/? | Not started | - |

---
*v1.11 Backlog Drawdown shipped 2026-06-06 (4/4 requirements across Phases 15–17; audit tech_debt — Phases 15/16 await push/CI/deploy follow-on).*
*v1.12 Inbox Drawdown shipped 2026-06-29 (4/4 requirements across 3 phases [18–20]).*
*v1.13 Web Hardening (Console/Edge) roadmap created 2026-07-04 (2/2 requirements combined into 1 phase [21], granularity coarse).*
</content>
