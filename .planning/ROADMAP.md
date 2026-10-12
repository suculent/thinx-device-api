# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)
- ✅ **v1.13 — Web Hardening (Console/Edge)** — Phase 21 (shipped 2026-09-25)
- ✅ **v1.14 — Backlog & Hardening Sweep** — Phases 22–28 (shipped 2026-10-05)
- ✅ **v1.15 — Traefik Hardening (Edge)** — Phases 29–34 (shipped 2026-10-12)
- 🚧 **v1.16 — Console Usability & Deploy Keys** — Phases 35–38 (in progress)

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

<details>
<summary>✅ v1.14 — Backlog & Hardening Sweep (Phases 22–28) — SHIPPED 2026-10-05</summary>

See `.planning/milestones/v1.14-ROADMAP.md`. 24/24 v1.14 requirements (OPS-SWARM-03 descoped to Future Requirements); milestone audit `tech_debt`, closed as `override_closeout` (see `.planning/MILESTONES.md`).

- [x] Phase 22: CI & SAST Baseline (4/4 plans) — completed 2026-09-25
- [x] Phase 23: Build-Pipeline Sink Hardening (5/5 plans) — completed 2026-09-29
- [x] Phase 24: Secrets Sweep (6/6 plans) — completed 2026-09-29
- [x] Phase 25: Session-Bound CSRF + Console Edge Headers (10/10 plans) — completed 2026-10-01
- [x] Phase 26: Vue Console Log Paging (10/10 plans) — completed 2026-10-03
- [x] Phase 27: InfluxDB 2 Upgrade (8/8 plans) — completed 2026-10-03
- [x] Phase 28: Swarmpit Upgrade & Trim (4/4 plans) — completed 2026-10-05

</details>

<details>
<summary>✅ v1.15 — Traefik Hardening (Edge) (Phases 29–34) — SHIPPED 2026-10-12</summary>

See `.planning/milestones/v1.15-ROADMAP.md`. 14/14 v1.15 requirements; milestone audit `tech_debt`, closed as `override_closeout` (see `.planning/MILESTONES.md`).

- [x] Phase 29: Edge Reconciliation & Source of Truth (3/3 plans) — completed 2026-10-06
- [x] Phase 30: v1→v2 Syntax Migration (parity) (2/2 plans) — completed 2026-10-07
- [x] Phase 31: v2→v3 Upgrade (backward-compat mode) (3/3 plans) — completed 2026-10-08
- [x] Phase 32: v3 Native Syntax & BC Removal (3/3 plans) — completed 2026-10-08
- [x] Phase 33: Dashboard Lockdown & TLS Hardening (3/3 plans) — completed 2026-10-09
- [x] Phase 34: Ops Surface Reduction & SLA Close-out (5/5 plans) — completed 2026-10-11

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
| 22. CI & SAST Baseline | v1.14 | 4/4 | Complete | 2026-09-25 |
| 23. Build-Pipeline Sink Hardening | v1.14 | 5/5 | Complete | 2026-09-29 |
| 24. Secrets Sweep | v1.14 | 6/6 | Complete | 2026-09-29 |
| 25. Session-Bound CSRF + Console Edge Headers | v1.14 | 10/10 | Complete | 2026-10-01 |
| 26. Vue Console Log Paging | v1.14 | 10/10 | Complete | 2026-10-03 |
| 27. InfluxDB 2 Upgrade | v1.14 | 8/8 | Complete | 2026-10-03 |
| 28. Swarmpit Upgrade & Trim | v1.14 | 4/4 | Complete | 2026-10-05 |
| 29. Edge Reconciliation & Source of Truth | v1.15 | 3/3 | Complete | 2026-10-06 |
| 30. v1→v2 Syntax Migration (parity) | v1.15 | 2/2 | Complete | 2026-10-07 |
| 31. v2→v3 Upgrade (backward-compat mode) | v1.15 | 3/3 | Complete | 2026-10-08 |
| 32. v3 Native Syntax & BC Removal | v1.15 | 3/3 | Complete | 2026-10-08 |
| 33. Dashboard Lockdown & TLS Hardening | v1.15 | 3/3 | Complete | 2026-10-09 |
| 34. Ops Surface Reduction & SLA Close-out | v1.15 | 5/5 | Complete | 2026-10-11 |
| 35–38. Console Usability & Deploy Keys | v1.16 | 4/4 | Implemented; acceptance pending | — |

---
*v1.15 Traefik Hardening (Edge) shipped 2026-10-12. Active: v1.16 Console Usability & Deploy Keys (Phases 35–38).*

## v1.16 — Console Usability & Deploy Keys

Active milestone (v1.15 shipped 2026-10-12).

### Phase 35: Console Usability

Requirements: UI-01, UI-02, UI-03, UI-04

Status: complete 2026-10-12. Live UAT 5/5 passed, including gap G-35-4 (re-tested after the 35-02 deploy). Verification passed; threats_open 0.

- [x] 35-01-PLAN.md — implement and verify all mapped requirements.
- [x] 35-02-PLAN.md — gap closure G-35-4: repository Git URL as safe new-tab link (http(s) only).

### Phase 36: Build Log Access & Timeout Status

Requirements: BUILD-01, BUILD-02

Status: complete 2026-10-12. Live UAT 5/5 passed, including gap G-36-3 (device Build History summary-only, re-tested live). Operator signed off console 38eb95b (View button, TIMEOUT colour, readable log column) and accepted the navbar Recent Builds dropdown as the BUILD-01 entry point. Verification passed; threats_open 0.

**Plans:** 2/2 plans executed

- [x] 36-01-PLAN.md — implement and verify all mapped requirements.
- [x] 36-02-PLAN.md — gap closure G-36-3: device Build History summary-only (inline log card removed, per-row "Open build log" button opens the full log).

### Phase 37: Transformer Parity

Requirements: TRANS-01, TRANS-02

Status: complete 2026-10-12. Live UAT 6/6 passed, including gap G-37-5 (checkbox assignment, orange Manage Transformers, re-tested live). Review WR-01 (orphaned assignments) fixed in console ff6e809. Verification passed; threats_open 0.

**Plans:** 2/2 plans executed

- [x] 37-01-PLAN.md — implement and verify all mapped requirements.
- [x] 37-02-PLAN.md — gap closure G-37-5: device transformer assignment as one checkbox per transformer (empty-state line), Manage Transformers as a filled orange button.

### Phase 38: Deploy Key Management

Requirements: KEY-01, KEY-02, KEY-03

Status: complete 2026-10-12. Live UAT 6/6 passed (test 6 by operator decision, legacy console deprecating). Backend review WR-01..06 + IN-05 fixed (f3845d58, 7c8fe41a). Verification passed; threats_open 0.

- [x] 38-01-PLAN.md — implement and verify all mapped requirements.

All v1.16 plans implemented and locally verified. Console PR #32 merged; API PR #572 approved for staging. Release CI and browser/live acceptance pending.
