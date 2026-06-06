# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)

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

---
*v1.11 Backlog Drawdown shipped 2026-06-06 (4/4 requirements across Phases 15–17; audit tech_debt — Phases 15/16 await push/CI/deploy follow-on).*
