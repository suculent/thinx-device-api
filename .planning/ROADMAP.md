# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)
- ✅ **v1.13 — Web Hardening (Console/Edge)** — Phase 21 (shipped 2026-09-25)
- ✅ **v1.14 — Backlog & Hardening Sweep** — Phases 22–28 (shipped 2026-10-05)
- 🚧 **v1.15 — Traefik Hardening (Edge)** — Phases 29–34 (in progress)

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

### 🚧 v1.15 — Traefik Hardening (Edge) (Phases 29–34) — IN PROGRESS

Migration path and rationale: `.planning/research/TRAEFIK-MIGRATION.md`. Hard constraint across every phase: the plaintext device entrypoint `:7442` and plain MQTT keep working (legacy `__DISABLE_HTTPS__` devices), and each phase is independently rollback-able within the 5-minute deploy SLA.

### Phase 29: Edge Reconciliation & Source of Truth

**Requirements**: EDGE-RECON-01, EDGE-RECON-02
**Goal**: Establish exactly what Traefik config is deployed (gluster bind-mount suspected) and make the repo authoritative before any change.
**Success Criteria** (what must be TRUE):

1. The live swarm-host Traefik static flags, dynamic rules, and ACME storage are captured and committed as a dated snapshot.
2. A diff of live vs repo (`docker-compose.traefik.yml` + `services/traefik/*`) exists; every difference is reconciled into the repo or documented with rationale.
3. The actual deploy source of truth (repo file vs gluster path) is documented in the swarm runbook.
4. A rollback snapshot of the current working edge is saved before Phase 30.

**Plans:** 3/3 plans complete (planned 2026-10-06)
**Wave 1**
- [x] 29-01-PLAN.md — Tracer: anti-drift spine end-to-end on the `:7442` slice (generator → read-only mirror → staleness check → CI gate)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 29-02-PLAN.md — Full live edge capture, live↔repo diff, reconcile `thinx-swarm` (production wins, zero cleanup), ACME cert inventory

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 29-03-PLAN.md — Out-of-git rollback snapshot (600) on `micro`, source-of-truth runbook section, P30–P34 fix-forward list

### Phase 30: v1→v2 Syntax Migration (parity)

**Requirements**: EDGE-MIG-01, EDGE-MIG-04
**Goal**: Migrate static flags + Docker labels to v2 syntax on a current v2.x image with identical routing; plaintext device paths preserved.
**Success Criteria** (what must be TRUE):

1. Static config uses v2 entrypoints / `providers.docker` / `certificatesresolvers`; labels use `http.routers`/`http.services`.
2. Every existing route (app, landing, dev, console hostnames) serves identically; HTTP→HTTPS redirect intact; ACME issues/renews under the v2 resolver.
3. Plaintext `:7442` + plain MQTT verified: legacy check-in, OTT redeem, and firmware download all succeed.
4. Rollback to the Phase 29 snapshot is demonstrated.

**Plans:** 2/2 plans complete (planned 2026-10-07) — 2/2 complete
**Wave 1**
- [x] 30-01-PLAN.md — Tracer: pilot-token removal live cutover (thinx-swarm edit → mirror → check → deploy → verify) + v2-syntax parity confirmation (EDGE-MIG-01); `:7442`/plain-MQTT preserved (EDGE-MIG-04) — ✅ 2026-10-07, see `30-01-SUMMARY.md` (live on v2.11, operator-verified)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 30-02-PLAN.md — D-06 live rollback+restore cycle to the Phase-29 snapshot + runbook documentation; route parity (EDGE-MIG-01) and `:7442`/plain-MQTT (EDGE-MIG-04) re-verified — ✅ 2026-10-07, see `30-02-SUMMARY.md` (live cycle demonstrated, operator-verified, edge back at P30 end state)

### Phase 31: v2→v3 Upgrade (backward-compat mode)

**Requirements**: EDGE-MIG-02
**Goal**: Upgrade to current Traefik v3.x with `core.defaultRuleSyntax: v2`, via the official three-phase rollout, rollback-able.
**Success Criteria** (what must be TRUE):

1. Running current v3.x image with the BC switch; all routes serve identically.
2. The prepare→migrate-prod→(defer routing) rollout is followed; rollback to v2 is demonstrated or staged-ready.
3. ACME + TLS posture preserved under v3; plaintext `:7442` + MQTT re-verified.

### Phase 32: v3 Native Syntax & BC Removal

**Requirements**: EDGE-MIG-03
**Goal**: Convert routing rules to native v3 syntax and remove the BC switch (or document retention).
**Success Criteria** (what must be TRUE):

1. Routing rules are in native v3 syntax; `core.defaultRuleSyntax` removed or its retention documented.
2. Full route parity confirmed; plaintext `:7442` + MQTT re-verified.
3. Repo config matches the deployed v3 config.

### Phase 33: Dashboard Lockdown & TLS Hardening

**Requirements**: EDGE-API-01, EDGE-API-02, EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03
**Goal**: Close the dashboard/API surface and enforce modern TLS on the v3 edge.
**Success Criteria** (what must be TRUE):

1. Port 8080 is not externally reachable and `--api.insecure` is disabled; the dashboard is either off in prod or served via `api@internal` behind auth.
2. HTTPS enforces min TLS 1.2 (prefer 1.3) with a modern cipher set; HSTS is sent; plaintext `:7442` unaffected.
3. ACME uses the real operator email (not `admin@example.com`); `acme.json` is `600`; renewal verified.
4. An external scan confirms no open dashboard and the expected TLS posture.

### Phase 34: Ops Surface Reduction & SLA Close-out

**Requirements**: EDGE-OPS-01, EDGE-OPS-02, EDGE-OPS-03
**Goal**: Reduce the operational attack surface and confirm the deploy SLA end-to-end.
**Success Criteria** (what must be TRUE):

1. Log level is `INFO`/`WARN` in production (access logs, if kept, free of secrets).
2. Traefik reaches the Docker API via a read-only socket-proxy, not a raw `/var/run/docker.sock` mount.
3. push → CI → Swarmpit measured ≤5 minutes end-to-end on an edge change; swarm runbook updated.

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
| 29. Edge Reconciliation & Source of Truth | v1.15 | 3/3 | Complete    | 2026-10-06 |
| 30. v1→v2 Syntax Migration (parity) | v1.15 | 2/2 | Complete    | 2026-10-07 |
| 31. v2→v3 Upgrade (backward-compat mode) | v1.15 | 0/? | Pending | — |
| 32. v3 Native Syntax & BC Removal | v1.15 | 0/? | Pending | — |
| 33. Dashboard Lockdown & TLS Hardening | v1.15 | 0/? | Pending | — |
| 34. Ops Surface Reduction & SLA Close-out | v1.15 | 0/? | Pending | — |

---
*v1.15 Traefik Hardening (Edge) started 2026-10-06: 14 requirements across 6 phases (29–34). Next: `/gsd-discuss-phase 29`.*
