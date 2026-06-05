# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- 🔄 **v1.11 — Backlog Drawdown** — Phases 15–17 (in progress)

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

### v1.11 — Backlog Drawdown

- [ ] **Phase 15: fs-finder Removal** - Replace all `fs-finder` call sites with `fs-extra`/native equivalents and drop the dependency from `package.json`
- [ ] **Phase 16: Dependabot Triage** - Classify the 5 outstanding default-branch alerts and ship surgical `overrides` to eliminate runtime-tree highs
- [ ] **Phase 17: Influx Fix Production Deploy** - Force-roll the committed influx stats fix to production and verify dashboard numbers + log spam silenced

## Phase Details

### Phase 15: fs-finder Removal
**Goal**: The `fs-finder` fork is fully excised — every call site replaced with `fs-extra`/native equivalents, behavior locked by specs, and the package gone from the dependency tree
**Depends on**: Nothing (independent of Phases 16 and 17)
**Requirements**: REFACTOR-06, REFACTOR-07
**Success Criteria** (what must be TRUE):
  1. `grep -r "fs-finder\|FsFinder\|finder\.from\|finder\.in\|finder\.findFiles" lib/` returns no matches
  2. `npm ls fs-finder` resolves to nothing (package not in the resolved dependency tree)
  3. `package.json` `dependencies` no longer contains an `fs-finder` entry
  4. Each of the 5 touched modules (`builder.js`, `deployment.js`, `platform.js`, `repository.js`, `plugins/arduino/plugin.js`) has a behavior-locking spec that passes in CI
  5. The full Jasmine suite (`npm test`) is green with no regressions introduced by the replacements
**Plans**: TBD

### Phase 16: Dependabot Triage
**Goal**: All 5 outstanding default-branch Dependabot alerts are classified and any runtime-tree blockers are remediated, reducing the `npm audit --omit=dev` high count
**Depends on**: Nothing (disjoint files from Phase 15; can run in parallel or either order)
**Requirements**: SEC-DEP-03
**Success Criteria** (what must be TRUE):
  1. Every alert carries a taxonomy disposition: `blocker`, `deferred-stale`, `deferred-dev-only`, or `deferred-vendored-asset`
  2. All alerts classified as `blocker` have a corresponding `package.json` `overrides` entry and a rationale comment
  3. `npm audit --omit=dev` high count is equal to or lower than the pre-phase count (any remaining highs are classified `deferred-*` with documented rationale)
  4. A post-change rescan result is recorded (alert count before → after)
**Plans**: TBD

### Phase 17: Influx Fix Production Deploy
**Goal**: The committed influx stats fix (`9b6d931c`, quick-task `260605-inf`) is live on production and the operator has verified the dashboard and logs are clean
**Depends on**: Nothing (purely operational — fix is already committed and CI-green on pipeline 5266; no code dependency on Phases 15 or 16)
**Requirements**: OPS-EXEC-03
**Success Criteria** (what must be TRUE):
  1. The production swarm service is running the image that includes commit `9b6d931c` (confirmed via `docker service inspect` or Swarmpit UI)
  2. The Vue dashboard shows correct (non-zero, non-stale) check-in numbers for at least one device that checked in post-deploy
  3. `docker service logs thinx_api` no longer emits `error parsing query: found BADSTRING` lines after the force-rollout
  4. A post-deploy verification note is appended to the quick-task trail or phase annex (timestamp, operator initials, verdict)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–4. v1 GA Backend Closures | v1.0 | — | Complete | 2026-05-27 |
| 5–11. Backend Hygiene & Posture | v1.9 | 23/23 | Complete | 2026-06-04 |
| 12. Code-side Closure Helpers | v1.10 | 3/3 | Complete | 2026-06-04 |
| 13. SEC-WS-01 Edge Handshake Closure | v1.10 | 1/1 | Complete | 2026-06-05 |
| 14. SEC-PII-02 managed_logs Sweep Closure | v1.10 | 1/1 | Complete | 2026-06-05 |
| 15. fs-finder Removal | v1.11 | 0/? | Not started | - |
| 16. Dependabot Triage | v1.11 | 0/? | Not started | - |
| 17. Influx Fix Production Deploy | v1.11 | 0/? | Not started | - |

---
*v1.11 Backlog Drawdown ROADMAP created 2026-06-05 (4 requirements across 3 phases [15–17]; phase planning pending).*
