# STATE — THiNX Device API v1 GA Backend Closures

**Last updated:** 2026-05-26

## Project Reference

- **Project context:** `.planning/PROJECT.md`
- **Roadmap:** `.planning/ROADMAP.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Core value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.
- **Current focus:** Phase 4 — Dependency Triage (SEC-DEP-01). Phases 1-3 Verified 2026-05-26.
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. 10 phases shipped (v1.0 frontend), Phase 11 (v1 GA gap-closures) in flight in parallel. Backend v1 GA + frontend v1 GA land together as v1.0.

## Current Position

- **Mode:** mvp
- **Active milestone:** v1.0 GA (backend closures)
- **Active phase:** Phase 4 — Dependency Triage (next; Phase 3 verified 2026-05-26)
- **Active plan:** (none yet — Phase 4 not planned)
- **Plan status:** pending
- **Phase status:** not started
- **Progress:** Phase 3/4 complete · Plans 1/1 in Phase 3
  ```
  [███████████████░░░░░] 75% (3/4 phases)
  ```

## Phase Progress

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | AUTH API — Password Reset | AUTH-API-01 | **Verified (2026-05-26)** |
| 2 | PII Logging Scrub | SEC-PII-01 | **Verified (2026-05-26)** |
| 3 | Swarm Auto-Pull | OPS-01 | **Verified (2026-05-26)** |
| 4 | Dependency Triage | SEC-DEP-01 | pending (next) |

**v1 requirement coverage:** 4 of 4 mapped ✓ | Verified: 3 (AUTH-API-01, SEC-PII-01, OPS-01) | Pending: 1

## Performance Metrics

- Phases completed: 3 (Phase 1 — AUTH-API-01, Phase 2 — SEC-PII-01, Phase 3 — OPS-01)
- Plans completed: 4 (01-01 Wave 1, 01-02 Wave 2, 02 single coarse plan, 03 single coarse plan via Rung 1)
- Verification passes: 3 (Phase 1 live UAT + Phase 2 code+CI evidence + Phase 3 push-observe SLA test)
- Node repairs used: 0
- Inline hotfixes: 1 (Issue E — `bcd6e83f` legacy console profile email flatten, outside any phase plan)
- Average plan cycle time: same-day for all three phases (Phase 1 ~09:30Z → ~12:00Z; Phase 2 ~15:00Z → ~17:30Z; Phase 3 ~18:00Z → ~18:31Z — fastest cycle, ~12 min execution due to Rung 1 PASS on first attempt)
- Source-code commits by phase: Phase 1 = 4, Phase 2 = 3, Phase 3 = 0 (operational fix, zero code changes)

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
- 2026-05-26 — Phase 3 OPS-01 closed via Rung 1 (`docker service update --force swarmpit_app`) — smallest possible fix succeeded on first attempt. Root cause: Swarmpit 1.9 watcher entered silent-degraded state (container Running, app deadlocked, zero logs/HTTP for 30+ hours). Push-observe SLA test PASS with delta=63s (target ≤300s; 237s margin). Zero source-code commits — purely operational fix. Phase 3 verification surfaced two new v1.x deferred items: OPS-02 (stale swarm membership entry `b356ad8e1d60` / `10.133.0.4`) and OPS-03 (pre-existing malformed image-tag autoredeploy failures on `thinx_chronograf`/`thinx_couchdb`/`thinx_influxdb`/`thinx_worker`). AGENTS.md gained a new `## Swarm Auto-Pull Recovery` runbook section with the rung-1 recovery command for next recurrence.

### Todos
- None active for Phase 3 (Verified). Next: `/gsd-plan-phase 4` (SEC-DEP-01 — Dependency Triage; classify 11 high + 17 moderate Dependabot findings as v1-blocker or v1.x-deferred, ship blocker fixes).

### Blockers
- None

### Open Questions
- None

## Cross-Project Touchpoints

- **`services/console/.planning/ROADMAP.md`** — Phase 11 Wave 1 = G8 in the console roadmap; this project's Phase 1 closes that wave on the backend side.
- **`services/console/.planning/v1.x-backlog.md`** — OPS-swarmpull is tracked there for cross-project visibility; this project's Phase 3 owns the fix.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.

## Session Continuity

**Stopped at:** Phase 3 (OPS-01) **Verified** 2026-05-26 — Rung 1 PASSED on first attempt via `docker service update --force swarmpit_app` against the live swarm host `188.166.23.244`. Push-and-observe SLA test PASS: t0 (Hub digest change) 2026-05-26 16:28:36 UTC → t2 (new swarm task Running) 2026-05-26 16:29:39 UTC, **delta=63s** (target ≤300s; 237s under budget). Watcher logged the autoredeploy decision at 2026-05-26T16:29:36.086Z: `INFO: Service hxc4nt8sod41g5paz8iijp6pe ( thinx_api ) autoredeploy fired! DIGEST: [ 950043b4 ] -> [ 81b22f1f ]`. Zero source-code commits this phase. Two operational commits: `8a09d42f` (no-op SLA test marker) + close-out (this commit). Production unaffected throughout: rtm.thinx.cloud 200 before and after each rolling update; Phase 1 contract (`Bearer null` → 200) preserved on new image `81b22f1f`. AGENTS.md gained `## Swarm Auto-Pull Recovery` runbook line. Rungs 2/3/4 NOT exercised; remain locked behind checkpoint:human-verify gates for any future recurrence. Two new v1.x deferred items filed: OPS-02 (stale swarm membership entry b356ad8e1d60) + OPS-03 (pre-existing malformed image tags on thinx_chronograf/thinx_couchdb/thinx_influxdb/thinx_worker).

**Next action:** `/gsd-plan-phase 4` (Phase 4 — Dependency Triage / SEC-DEP-01).

**Resume hint:** Phase 4 classifies all 28 GitHub Dependabot findings (11 high + 17 moderate; the GitHub push warning at the end of every `git push` reminds us) against `suculent/thinx-device-api` as either v1-blocker (fixed before milestone close) or v1.x-deferred (with rationale + future trigger). Deliverable: `.planning/dep-triage.md` table. Phase 4 depends on Phase 2 (now Verified) because SEC-PII-01 touched Mailgun-adjacent code paths; that surface is now stable. First action for Phase 4: `gh api repos/suculent/thinx-device-api/dependabot/alerts` to enumerate. `package.json` `overrides` block (L97-136, 38 pins) is the expected fix vector for transitive CVEs. Respect AGENTS.md dependency locks (chai-http v4 hold, etc.). With OPS-01 closed, future Dependabot fix verifications will autoredeploy without manual `./restart.sh` invocation — the swarm pipeline is now end-to-end functional.

---
*State initialized: 2026-05-26*
*Phase 1 verified: 2026-05-26*
*Phase 2 verified: 2026-05-26*
*Phase 3 verified: 2026-05-26*
