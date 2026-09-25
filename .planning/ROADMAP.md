# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)
- ✅ **v1.13 — Web Hardening (Console/Edge)** — Phase 21 (shipped 2026-09-25)

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

See `.planning/MILESTONES.md` and `.planning/milestones/v1.12-REQUIREMENTS.md` (no separate roadmap archive was written for v1.12). 4/4 v1.12 requirements (SEC-PII-03, GH-01, GH-02, SEC-CFG-01).

- [x] Phase 18: Complete GDPR Purge (4/4 plans) — SEC-PII-03
- [x] Phase 19: Per-user GitHub Token Backend — GH-01 + GH-02
- [x] Phase 20: Docker Secrets Helper — SEC-CFG-01

</details>

<details>
<summary>✅ v1.13 — Web Hardening (Console/Edge) (Phase 21) — SHIPPED 2026-09-25</summary>

See `.planning/milestones/v1.13-ROADMAP.md`. 2/2 v1.13 requirements (SEC-CSP-01, SEC-CSRF-01); verification `passed` with 3 operator-accepted overrides (HawkScan removed; gluster-mounted CSP is the production source of truth).

- [x] Phase 21: CSP Wildcard Removal + Anti-CSRF Token (5/5 plans) — completed 2026-09-25

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–4. v1 GA Backend Closures | v1.0 | — | Complete | 2026-05-27 |
| 5–11. Backend Hygiene & Posture | v1.9 | 23/23 | Complete | 2026-06-04 |
| 12–14. Operational Closures | v1.10 | 5/5 | Complete | 2026-06-05 |
| 15–17. Backlog Drawdown | v1.11 | 6/6 | Complete | 2026-06-06 |
| 18–20. Inbox Drawdown | v1.12 | — | Complete | 2026-06-29 |
| 21. CSP Wildcard Removal + Anti-CSRF Token | v1.13 | 5/5 | Complete | 2026-09-25 |

---
*v1.13 Web Hardening (Console/Edge) shipped 2026-09-25 (2/2 requirements, 1 phase [21]). Next phase number: 22. Start the next milestone with `/gsd-new-milestone`.*
