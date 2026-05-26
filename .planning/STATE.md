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
- **Active phase:** Phase 2 — PII Logging Scrub (next; Phase 1 verified 2026-05-26)
- **Active plan:** (none yet — Phase 2 not planned)
- **Plan status:** pending
- **Phase status:** not started
- **Progress:** Phase 1/4 complete · Plans 2/2 in Phase 1
  ```
  [█████░░░░░░░░░░░░░░░] 25% (1/4 phases)
  ```

## Phase Progress

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | AUTH API — Password Reset | AUTH-API-01 | **Verified (2026-05-26)** |
| 2 | PII Logging Scrub | SEC-PII-01 | pending (next) |
| 3 | Swarm Auto-Pull | OPS-01 | pending |
| 4 | Dependency Triage | SEC-DEP-01 | pending |

**v1 requirement coverage:** 4 of 4 mapped ✓ | Verified: 1 (AUTH-API-01) | Pending: 3

## Performance Metrics

- Phases completed: 1 (Phase 1 — AUTH-API-01)
- Plans completed: 2 (01-01 Wave 1 backend fixes, 01-02 Wave 2 spec + deploy + UAT)
- Verification passes: 1 (Phase 1 verified via live rtm UAT 2026-05-26)
- Node repairs used: 0
- Average plan cycle time: same-day for Phase 1 (planning at ~09:30Z, verification at ~12:00Z)

## Accumulated Context

### Decisions
- 2026-05-26 — Scope = v1 GA gap closures + ops (not "backend at large"). Mirrors the console submodule's v1.0 milestone framing. (`PROJECT.md` Key Decisions row 1)
- 2026-05-26 — Refresh codebase map before drafting REQUIREMENTS — surfaced PII-in-logs sites and duplicate `trust proxy` that weren't in the May-19 map. (`PROJECT.md` Key Decisions row 2)
- 2026-05-26 — Treat `services/*` as external subservices; do not deep-scan the console submodule from here. The console has its own GSD project. (`PROJECT.md` Key Decisions row 4)
- 2026-05-26 — SEC-pii-logs included as v1 GA blocker (vs. v1.x deferred) — GDPR posture + fix is small. (`PROJECT.md` Key Decisions row 5)
- 2026-05-26 — 4-phase roadmap, one phase per requirement. Coarse granularity allowed collapsing SEC-PII + SEC-DEP into one "Security" phase, but the two have very different work styles (targeted log scrub vs. dependency triage table) — keeping them separate makes plan-phase cleaner.
- 2026-05-26 — Phase ordering by criticality + likely-effort: G8 first (live user-facing bug, pre-investigated), PII scrub second (fast targeted win), OPS-swarmpull third, DEP triage last (may overlap with PII fix candidates).
- 2026-05-26 — Phase 1 G8 root cause: Vue API client unconditionally sets `Authorization: Bearer null` when logged out; backend `lib/router.js:103` matched header presence not validity, JWT-verify failed on literal `"null"`, stamped 403. Fixed via 2-line Bearer-null guard in router.js (class-fix for all routes). Tightening for AUTH-API-01 (b) added during Wave 2 once curl confirmed body still leaked enumeration even with normalized status. See `phases/01-auth-api-password-reset/01-SUMMARY.md` for the full root cause + reversion plan.
- 2026-05-26 — Phase 1 UAT surfaced one operational artifact requiring manual remediation: test user account had `deleted:true` (from a prior Phase 9 G7 profile-delete UAT 2026-05-24); login was gated by `lib/router.auth.js:189-191`. Restored via direct CouchDB PUT (`_rev` 14 → 15). Filed `AUTH-REACTIVATE-01` as v2/deferred — no self-serve flow exists to recover a soft-deleted account, manual DB mutation is currently the only path.

### Todos
- None active for Phase 1 (Verified). Next: `/gsd:plan-phase 2`.

### Blockers
- None

### Open Questions
- None

## Cross-Project Touchpoints

- **`services/console/.planning/ROADMAP.md`** — Phase 11 Wave 1 = G8 in the console roadmap; this project's Phase 1 closes that wave on the backend side.
- **`services/console/.planning/v1.x-backlog.md`** — OPS-swarmpull is tracked there for cross-project visibility; this project's Phase 3 owns the fix.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.

## Session Continuity

**Stopped at:** Phase 1 (AUTH-API-01 / G8) **Verified** 2026-05-26 — live rtm UAT accepted against image `thinxcloud/api:latest sha256:0a0e6b32` (built from `c67d9af`). Class-fix for the Bearer-null JWT-403 bug shipped at `622aa01`; no-enum status normalization at `db46790`; tightening body normalization at `c67d9af`; regression spec at `3413166`. Login round-trip verified after a manual CouchDB account restoration (test user had `deleted:true` from a prior Phase 9 G7 UAT — not a Phase 1 regression; filed as v2/deferred AUTH-REACTIVATE-01). 3 new v2/deferred items captured from the UAT walk; 10 commits across the phase. Cross-ref: console submodule Phase 11 Wave 1 is closed by this phase.

**Next action:** `/gsd:plan-phase 2` (Phase 2 — PII Logging Scrub / SEC-PII-01).

**Resume hint:** Phase 2 is a small, targeted single-file refactor on `lib/thinx/owner.js`. Site list and replacement-pattern guidance are pre-staged in `.planning/codebase/CONCERNS.md` ("Privacy / Logging Exposure"). Should be the fastest phase to close — no edge config, no submodule interaction, single file diff. Lessons from Phase 1 to bring into Phase 2 planning: (a) probe BOTH success and failure paths after deploy, not just the happy path (Phase 1's tightening commit was needed because the initial fix only normalized status, not body — same trap applies to logging redaction); (b) avoid silent "document for human" fallbacks in the plan — if ssh/deploy/spec gate fails, ESCALATE not chain; (c) the actual swarm deploy script is `./restart.sh` not `./scripts/stack-deploy` as AGENTS.md says (see memory `swarm-deploy-script-name`).

---
*State initialized: 2026-05-26*
*Phase 1 verified: 2026-05-26*
