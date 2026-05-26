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
- **Active phase:** Phase 3 — Swarm Auto-Pull (next; Phase 2 verified 2026-05-26)
- **Active plan:** (none yet — Phase 3 not planned)
- **Plan status:** pending
- **Phase status:** not started
- **Progress:** Phase 2/4 complete · Plans 1/1 in Phase 2
  ```
  [██████████░░░░░░░░░░] 50% (2/4 phases)
  ```

## Phase Progress

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | AUTH API — Password Reset | AUTH-API-01 | **Verified (2026-05-26)** |
| 2 | PII Logging Scrub | SEC-PII-01 | **Verified (2026-05-26)** |
| 3 | Swarm Auto-Pull | OPS-01 | pending (next) |
| 4 | Dependency Triage | SEC-DEP-01 | pending |

**v1 requirement coverage:** 4 of 4 mapped ✓ | Verified: 2 (AUTH-API-01, SEC-PII-01) | Pending: 2

## Performance Metrics

- Phases completed: 2 (Phase 1 — AUTH-API-01, Phase 2 — SEC-PII-01)
- Plans completed: 3 (01-01 Wave 1, 01-02 Wave 2, 02 single coarse plan)
- Verification passes: 2 (Phase 1 live UAT + Phase 2 code+CI evidence)
- Node repairs used: 0
- Inline hotfixes: 1 (Issue E — `bcd6e83f` legacy console profile email flatten, outside any phase plan)
- Average plan cycle time: same-day for both phases (Phase 1 planning ~09:30Z → verification ~12:00Z; Phase 2 planning ~15:00Z → verification ~17:30Z)

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
- 2026-05-26 — Issue E (legacy AngularJS console profile shows `john@doe.com` placeholder) was inline-hotfixed at parent commit `bcd6e83f`. Backend `Owner.profile()` now flattens `email` to the top level of the /api/v2/profile response. User policy correction: legacy console must stay working until Vue is GA'd as THiNX v2.0.x (memory `legacy-console-supported-until-v2`); legacy bugs are real bugs, not deprecation-deferrable.
- 2026-05-26 — Phase 2 SEC-PII-01 scope expanded during execution from 6 to 12+ sites — planner's grep surfaced 5 additional sites; executor's Rule-2 sweep added an opportunistic 13th (`{body}` envelope dump at L510 that could leak email via CouchDB view key). All 13 swept in a single atomic commit. Critical guardrail: L165-167 test-env passthrough log redacted while callback value stays raw (chai-http round-trip spec at ZZ-AppSessionUserSpec.js:191-198 chain intact).
- 2026-05-26 — Phase 2 verification finding: historic CouchDB `managed_logs` entries (~658k docs) still contain raw 64-char reset_keys from before today's deploy. Phase 2's fix is for NEW emissions only; historic data cleanup is a separate GDPR-adjacent concern filed as `SEC-PII-02` v1.x/v2 deferred. Operator accepted code+CI evidence for Phase 2 close-out (Probes B/D SKIP-acceptable).

### Todos
- None active for Phase 2 (Verified). Next: `/gsd-plan-phase 3` (OPS-01 — diagnose + restore swarm auto-pull on 188.166.23.244).

### Blockers
- None

### Open Questions
- None

## Cross-Project Touchpoints

- **`services/console/.planning/ROADMAP.md`** — Phase 11 Wave 1 = G8 in the console roadmap; this project's Phase 1 closes that wave on the backend side.
- **`services/console/.planning/v1.x-backlog.md`** — OPS-swarmpull is tracked there for cross-project visibility; this project's Phase 3 owns the fix.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.

## Session Continuity

**Stopped at:** Phase 2 (SEC-PII-01) **Verified** 2026-05-26 — code+CI evidence + automated probes A/E PASS + live container code verification against image `thinxcloud/api:latest sha256:3a461b3d`. Three atomic code commits: helpers `0de30806` + 12-site sweep `0314c9a0` + regression spec `daccf732`. Operator accepted Probes B/D as SKIP per ZZ-OwnerLogRedactionSpec.js CI coverage. Verification surfaced one new v1.x/v2 backlog item: SEC-PII-02 — historic managed_logs entries (~658k docs) still contain raw reset_keys from before today's deploy; cleanup is a separate concern from the new-emission fix. Phase 2 was also notably influenced by the Issue E hotfix (`bcd6e83f`) which added 9 lines to owner.js — the planner's line-number references shifted +9 for sites after profile(); content-pattern grep was used throughout.

**Next action:** `/gsd-plan-phase 3` (Phase 3 — Swarm Auto-Pull / OPS-01).

**Resume hint:** Phase 3 is an OPERATIONAL investigation, not a code fix in this monorepo. Diagnose why the swarm-side auto-pull on `188.166.23.244` stopped working after 14:44 CET 2026-05-25. Suspects: Swarmpit watcher process, registry webhook config, expired/rotated registry credentials, Docker manifest schema mismatch. Recon steps in `.planning/codebase/CONCERNS.md` ("Operations Concerns"). The diagnostic playbook should start with `ssh -p 2020 -i ~/.ssh/DOKey2 root@188.166.23.244` and `docker logs <swarmpit-agent>`. Do NOT break the manual `./restart.sh` workaround (Phase 1/2 deploy verification relied on it). Phase ordering note: Phases 3 and 4 are functionally independent of each other; Phase 3 lands before Phase 4 mostly for v1 GA-cleanliness reasons (a working auto-pull lets Phase 4's dependabot fix verifications complete without manual ops intervention).

---
*State initialized: 2026-05-26*
*Phase 1 verified: 2026-05-26*
*Phase 2 verified: 2026-05-26*
