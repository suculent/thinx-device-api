# STATE — THiNX Device API v1 GA Backend Closures

**Last updated:** 2026-05-26

## Project Reference

- **Project context:** `.planning/PROJECT.md`
- **Roadmap:** `.planning/ROADMAP.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Core value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.
- **Current focus:** Phase 1 — AUTH API Password Reset (G8). Pre-investigation seed already filed at `.planning/G8-INVESTIGATION.md`.
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. 10 phases shipped (v1.0 frontend), Phase 11 (v1 GA gap-closures) in flight in parallel. Backend v1 GA + frontend v1 GA land together as v1.0.

## Current Position

- **Mode:** mvp
- **Active milestone:** v1.0 GA (backend closures)
- **Active phase:** Phase 1 — AUTH API — Password Reset
- **Active plan:** (none yet — Phase 1 not planned)
- **Plan status:** pending
- **Phase status:** not started
- **Progress:** Phase 0/4 complete · Plans 0/0
  ```
  [░░░░░░░░░░░░░░░░░░░░] 0% (0/4 phases)
  ```

## Phase Progress

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | AUTH API — Password Reset | AUTH-API-01 | pending (active) |
| 2 | PII Logging Scrub | SEC-PII-01 | pending |
| 3 | Swarm Auto-Pull | OPS-01 | pending |
| 4 | Dependency Triage | SEC-DEP-01 | pending |

**v1 requirement coverage:** 4 of 4 mapped ✓

## Performance Metrics

- Phases completed: 0
- Plans completed: 0
- Verification passes: 0
- Node repairs used: 0
- Average plan cycle time: — (no plans completed)

## Accumulated Context

### Decisions
- 2026-05-26 — Scope = v1 GA gap closures + ops (not "backend at large"). Mirrors the console submodule's v1.0 milestone framing. (`PROJECT.md` Key Decisions row 1)
- 2026-05-26 — Refresh codebase map before drafting REQUIREMENTS — surfaced PII-in-logs sites and duplicate `trust proxy` that weren't in the May-19 map. (`PROJECT.md` Key Decisions row 2)
- 2026-05-26 — Treat `services/*` as external subservices; do not deep-scan the console submodule from here. The console has its own GSD project. (`PROJECT.md` Key Decisions row 4)
- 2026-05-26 — SEC-pii-logs included as v1 GA blocker (vs. v1.x deferred) — GDPR posture + fix is small. (`PROJECT.md` Key Decisions row 5)
- 2026-05-26 — 4-phase roadmap, one phase per requirement. Coarse granularity allowed collapsing SEC-PII + SEC-DEP into one "Security" phase, but the two have very different work styles (targeted log scrub vs. dependency triage table) — keeping them separate makes plan-phase cleaner.
- 2026-05-26 — Phase ordering by criticality + likely-effort: G8 first (live user-facing bug, pre-investigated), PII scrub second (fast targeted win), OPS-swarmpull third, DEP triage last (may overlap with PII fix candidates).

### Todos
- None yet (roadmap just created)

### Blockers
- None

### Open Questions
- None

## Cross-Project Touchpoints

- **`services/console/.planning/ROADMAP.md`** — Phase 11 Wave 1 = G8 in the console roadmap; this project's Phase 1 closes that wave on the backend side.
- **`services/console/.planning/v1.x-backlog.md`** — OPS-swarmpull is tracked there for cross-project visibility; this project's Phase 3 owns the fix.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.

## Session Continuity

**Stopped at:** Project initialized 2026-05-26 — v1 GA backend closures scope. 4 v1 requirements mapped to 4 phases. Phase 1 (AUTH-API-01 / G8) pending; pre-investigation already in `.planning/G8-INVESTIGATION.md`. Cross-ref: console submodule's GSD project at `services/console/.planning/` is wrapping up v1.0 frontend in parallel.

**Next action:** `/gsd:plan-phase 1`

**Resume hint:** Phase 1 is the most time-sensitive (live bug on rtm blocking password reset for all users). Start by reproducing with `curl` against rtm and staging per the `.planning/G8-INVESTIGATION.md` recon plan. Suspected culprits ranked in `.planning/codebase/CONCERNS.md` — top three are CORS allowlist on rtm, the JWT-verify 403 short-circuit at `lib/router.js:132`, or Traefik/nginx edge config.

---
*State initialized: 2026-05-26*
