# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27) — see `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04) — see `.planning/milestones/v1.9-ROADMAP.md`
- 📋 **v1.10 — TBD** — to be planned via `/gsd:new-milestone`

## Phases

<details>
<summary>✅ v1.0 — v1 GA Backend Closures (Phases 1–4) — SHIPPED 2026-05-27</summary>

- [x] Phase 1: AUTH-API-01 password-reset endpoint restoration (3/3 plans)
- [x] Phase 2: SEC-PII-01 owner.js log redaction sweep (2/2 plans)
- [x] Phase 3: OPS-01 swarm autoredeploy restoration (2/2 plans)
- [x] Phase 4: SEC-DEP-01 Dependabot blocker triage (1/1 plans, 4 slices)

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.9 — Backend Hygiene & Posture (Phases 5–11) — SHIPPED 2026-06-04</summary>

- [x] Phase 5: Backend Hygiene — Cheap Sweeps (4/4 plans) — REFACTOR-01, REFACTOR-02, REFACTOR-05
- [x] Phase 6: WebSocket Surface Hardening (3/3 plans) — REFACTOR-03, SEC-WS-01, SEC-COOKIE-01
- [x] Phase 7: owner.js Async/Await Sweep (6/6 plans) — REFACTOR-04
- [x] Phase 8: Auth & Account Lifecycle Closures (2/2 plans) — AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE
- [x] Phase 9: Historic PII Redaction (managed_logs) (3/3 plans) — SEC-PII-02
- [x] Phase 10: Cross-Project Dependency Coordination (services/console) (3/3 plans) — SEC-DEP-02
- [x] Phase 11: Build & Cert Hygiene (2/2 plans) — BASE-IMG-01, THINX-CERT-CHECK-01

Full details: `.planning/milestones/v1.9-ROADMAP.md`

</details>

### 📋 v1.10 (To Be Planned)

Carried v1.10 candidates (see closed-milestone tech-debt notes in `.planning/MILESTONES.md`):

- [ ] **fs-finder removal sweep** — replace `fs-finder` runtime call sites in 5 modules with `fs-extra` glob helpers or native `fs.promises.readdir` recursion, then drop the dep (deferred from v1.9 Phase 5 REFACTOR-05)
- [ ] **SEC-WS-01 operator-side edge fix** — swarm-host nginx `location` block edit for `rtm.thinx.cloud` (runbook authored in v1.9 Phase 6; execution outstanding)
- [ ] **SEC-PII-02 production execution** — operator sweep against ~658k `managed_logs` docs (script + audit TTL shipped in v1.9 Phase 9; runbook authored; execution outstanding)
- [ ] **Carry-over from v1.0** — TEST-CHAI-01 (still locked per AGENTS.md), OPS-02 / OPS-03 (swarm-side OPS), CONSOLE-LEGACY-JSON-PARSE (sibling-project)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. AUTH-API-01 password-reset | v1.0 | 3/3 | Complete | 2026-05-26 |
| 2. SEC-PII-01 log redaction | v1.0 | 2/2 | Complete | 2026-05-26 |
| 3. OPS-01 swarm autoredeploy | v1.0 | 2/2 | Complete | 2026-05-26 |
| 4. SEC-DEP-01 Dependabot triage | v1.0 | 1/1 | Complete | 2026-05-27 |
| 5. Backend Hygiene — Cheap Sweeps | v1.9 | 4/4 | Complete | 2026-06-02 |
| 6. WebSocket Surface Hardening | v1.9 | 3/3 | Complete | 2026-06-02 |
| 7. owner.js Async/Await Sweep | v1.9 | 6/6 | Complete | 2026-06-03 |
| 8. Auth & Account Lifecycle Closures | v1.9 | 2/2 | Complete | 2026-06-03 |
| 9. Historic PII Redaction (managed_logs) | v1.9 | 3/3 | Complete | 2026-06-03 |
| 10. Cross-Project Dependency Coordination | v1.9 | 3/3 | Complete | 2026-06-03 |
| 11. Build & Cert Hygiene | v1.9 | 2/2 | Complete | 2026-06-03 |

---

*Roadmap reorganized: 2026-06-04 — v1.9 milestone closed. Next milestone (v1.10) to be planned via `/gsd:new-milestone`.*
