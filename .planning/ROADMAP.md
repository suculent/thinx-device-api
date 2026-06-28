# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)

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

**Follow-on:** Phases 15+16 are committed but unpushed/undeployed — push triggers full CI suite (validates 15/16); deploy is separate operator work. See MILESTONES.md.

</details>

### v1.12 — Inbox Drawdown (Phases 18–20)

- [ ] **Phase 18: Complete GDPR Purge** — SEC-PII-03; single orchestrator removes all owner-scoped data across CouchDB, filesystem, RSA keys, and Redis on demand
- [ ] **Phase 19: Per-user GitHub Token Backend** — GH-01 + GH-02; authenticated endpoint validates/stores token, auto-creates RSA key, pushes public key to GitHub
- [ ] **Phase 20: Docker Secrets Helper** — SEC-CFG-01; `readSecret()` helper + core Redis/CouchDB credential migration + docker-swarm.yml wiring

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
| 18. Complete GDPR Purge | v1.12 | 0/? | Not started | - |
| 19. Per-user GitHub Token Backend | v1.12 | 0/? | Not started | - |
| 20. Docker Secrets Helper | v1.12 | 0/? | Not started | - |

---
*v1.11 Backlog Drawdown shipped 2026-06-06 (4/4 requirements across Phases 15–17; audit tech_debt — Phases 15/16 await push/CI/deploy follow-on).*
*v1.12 Inbox Drawdown roadmap created 2026-06-28 (4/4 requirements across 3 phases [18–20]).*
