---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: milestone_complete
stopped_at: Milestone complete (Phase 04 was final phase)
last_updated: 2026-05-26T23:33:25.307Z
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# STATE — THiNX Device API v1 GA Backend Closures

**Last updated:** 2026-05-27 (Phase 4 / SEC-DEP-01 Verified via Slice 4 merge-up to default branches; v1 GA backend closures complete 4/4)

## Project Reference

- **Project context:** `.planning/PROJECT.md`
- **Roadmap:** `.planning/ROADMAP.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Core value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.
- **Current focus:** Milestone complete
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. 10 phases shipped (v1.0 frontend), Phase 11 (v1 GA gap-closures) in flight in parallel. Backend v1 GA + frontend v1 GA land together as v1.0.

## Current Position

Phase: 04
Plan: Not started

- **Mode:** mvp
- **Active milestone:** v1.0 GA — backend Verified; awaiting v1.0 release tag coordination
- **Active phase:** (v1 GA backend closures complete)
- **Active plan:** (none — v1 GA shipped)
- **Plan status:** n/a
- **Phase status:** verified — Phase 4 / SEC-DEP-01 closed 2026-05-27 via Slice 4 merge-up (PR #539 master + PR #540 main merged 2026-05-26T23:09Z); 4/4 v1 requirements Verified
- **Progress:** 4/4 phases Verified
  ```
  [████████████████████] 100% (4/4 phases)
  ```

## Phase Progress

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | AUTH API — Password Reset | AUTH-API-01 | **Verified (2026-05-26)** |
| 2 | PII Logging Scrub | SEC-PII-01 | **Verified (2026-05-26)** |
| 3 | Swarm Auto-Pull | OPS-01 | **Verified (2026-05-26)** |
| 4 | Dependency Triage | SEC-DEP-01 | **Verified (2026-05-27)** |

**v1 requirement coverage:** 4 of 4 mapped ✓ | Verified: 4 (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01) | Pending: 0

## Performance Metrics

- Phases completed: 4 (Phase 1 — AUTH-API-01, Phase 2 — SEC-PII-01, Phase 3 — OPS-01, Phase 4 — SEC-DEP-01)
- Plans completed: 8 (01-01 Wave 1, 01-02 Wave 2, 02 single coarse plan, 03 single coarse plan via Rung 1, 04-01 baseline + triage, 04-02 blocker fixes, 04-03 post-fix baseline + close-out, 04-04 merge-up to default branches)
- Verification passes: 4 (Phase 1 live UAT + Phase 2 code+CI evidence + Phase 3 push-observe SLA test + Phase 4 default-branch merge confirmation via `gh pr view`)
- Node repairs used: 0
- Inline hotfixes: 1 (Issue E — `bcd6e83f` legacy console profile email flatten, outside any phase plan)
- Average plan cycle time: same-day for Phases 1–3 (Phase 1 ~09:30Z → ~12:00Z; Phase 2 ~15:00Z → ~17:30Z; Phase 3 ~18:00Z → ~18:31Z — fastest cycle, ~12 min execution due to Rung 1 PASS on first attempt); Phase 4 wall-clock ~25h (2026-05-26 ~21:46Z → 2026-05-27 close — most of that is autoredeploy + operator UI-merge wait windows; active work ~30 min across 4 slices)
- Source-code commits by phase: Phase 1 = 4, Phase 2 = 3, Phase 3 = 0 (operational fix), Phase 4 = 1 (commit `d8e3176c` — atomic package.json + package-lock.json override edits; zero src/ touches)
- Phase 4 Slice 4 merge-up: PR #539 (master) +24,814/−536 across 122 files, mergeCommit `465b73c2`; PR #540 (main) +21,683/−1,785 across 81 files, mergeCommit `c0530571`. Both green on CircleCI (test #13866 + build-api-cloud #13867 + build-vue-console #13868), Snyk ×2 PASS, GitGuardian PASS. Merged 2026-05-26T23:09Z by operator suculent.

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
- 2026-05-26 — Phase 4 SEC-DEP-01 Slice 2 shipped 4 override edits as commit `d8e3176c`: REMOVE follow-redirects pin (let axios@1.16.1 resolve naturally to 1.16.0), lodash 4.17.23 → 4.18.1, minimatch 5.1.0 → 5.1.9, +ws "$ws" self-reference (resolves to 8.21.0; deviation A from plan's bare "8.20.1" because ws is also a direct dep — npm EOVERRIDE). Closed 7 GHSAs (GHSA-r5fr-rjxr-66jc + GHSA-f23m-r3pf-42rh lodash; GHSA-7r86-cg39-jmmj + GHSA-23c5-xmqv-rm74 + GHSA-3ppc-4f35-3m26 minimatch; GHSA-r4q5-vmmm-2653 follow-redirects; GHSA-58qx-3vcg-4xpx ws). Runtime-tree npm audit high count: 9 → 0 (THE primary success metric). Full tree: 34 → 8 (1H + 7M residue is devDep-only, stripped by Dockerfile L86). CI green first try; Swarmpit autoredeploy delta=49s (beats Phase 3 baseline 63s); Phase 1 + 2 contracts preserved on new image `sha256:4d3fb789`. Slice 3 documented the post-fix baseline (this commit); Slice 4 opens the merge-up PRs to master + main on parent suculent/thinx-device-api so cloud scanners attached to default branches see the fix.
- 2026-05-26 — Phase 4 Slice 3 operator decision Option C (2026-05-27): proceed with documentation now; document rescan-pending residual (29 open Dependabot alerts; expected auto-resolution of the 7 blocker alerts within ~24h on GitHub Dependabot rescan; runtime-tree npm audit high=0 is the authoritative primary metric). Manual UI dismissal walk skipped — the 22 non-blocker alerts (19 deferred-stale + 3 deferred-dev-only) are left open by design to age out via natural Dependabot lifecycle.
- 2026-05-26 — Two new v1.x backlog items filed during Phase 4 triage: REFACTOR-05 (jshint + fs-finder misclassified as runtime deps; their nested deps carried 3 of 4 Phase 4 blocker fixes) and SEC-DEP-02 (services/console has 15 open Dependabot alerts of its own — 2 high + 13 medium; sibling project; coordinate via `services/console/.planning/ROADMAP.md`).
- 2026-05-27 — Phase 4 Slice 4 merge-up complete. PR #539 (https://github.com/suculent/thinx-device-api/pull/539 — thinx-staging→master) merged 2026-05-26T23:09:34Z by operator suculent; mergeCommit `465b73c2592467d0586682ceca70a5f7dedf4ddf`. PR #540 (https://github.com/suculent/thinx-device-api/pull/540 — thinx-staging→main) merged 2026-05-26T23:09:55Z by operator suculent; mergeCommit `c05305711af27205f71bf06164266d62b02ccc63`. Both PRs green on CircleCI (test #13866 + build-api-cloud #13867 + build-vue-console #13868), Snyk ×2 PASS, GitGuardian PASS. SEC-DEP-01 closed on default branches; cloud scanners (GitHub Security tab, Snyk Cloud, Dependabot) will reflect the fix on next default-branch rescan (allow up to 24h). 7 Bucket-A blocker-mapped alerts will auto-close on rescan.
- 2026-05-27 — **Operator decision Option B — skip the services/console PR.** Verbatim: *"services/console: merge-up deferred to a separate cross-project coordination effort. Phase 4 closes Verified on the parent-PR side. SEC-DEP-02 already tracks console scope."* services/console diff (`main..thinx-staging` = 194 commits — recent v1 GA gap-closure stack atop a deep history divergence) is sibling-project scope and will be handled in a dedicated cross-project sync, not within Phase 4 of this project.
- 2026-05-27 — **v1 GA backend closures complete: 4/4 v1 requirements Verified (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01).** Next milestone = v1.0 GA release tag (cross-project coordination via `.planning/PROJECT.md` and `services/console/.planning/`).

### Todos

- v1 GA backend closures complete (4/4 v1 requirements Verified). Next: v1.0 release tag coordination across parent + console.

### Blockers

- None

### Open Questions

- None

## Cross-Project Touchpoints

- **`services/console/.planning/ROADMAP.md`** — Phase 11 Wave 1 = G8 in the console roadmap; this project's Phase 1 closes that wave on the backend side.
- **`services/console/.planning/v1.x-backlog.md`** — OPS-swarmpull is tracked there for cross-project visibility; this project's Phase 3 owns the fix.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.

## Session Continuity

**Stopped at:** Phase 4 (SEC-DEP-01) **Verified 2026-05-27** via Slice 4 merge-up. PR #539 (https://github.com/suculent/thinx-device-api/pull/539 — thinx-staging→master, +24,814/−536 across 122 files) merged 2026-05-26T23:09:34Z by operator suculent; mergeCommit `465b73c2592467d0586682ceca70a5f7dedf4ddf`. PR #540 (https://github.com/suculent/thinx-device-api/pull/540 — thinx-staging→main, +21,683/−1,785 across 81 files) merged 2026-05-26T23:09:55Z by operator suculent; mergeCommit `c05305711af27205f71bf06164266d62b02ccc63`. Both PRs CI-green (CircleCI test #13866 + build-api-cloud #13867 + build-vue-console #13868; Snyk ×2 PASS; GitGuardian PASS) prior to merge. Operator decision Option B 2026-05-27: services/console merge-up deferred to separate cross-project coordination effort (sibling-project scope; SEC-DEP-02 v1.x backlog already tracks console-side dependency triage; the 194-commit services/console divergence is owned by the console GSD project). **v1 GA backend closures complete: 4/4 v1 requirements Verified (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01).** Cloud scanners (GitHub Security tab, Snyk Cloud, Dependabot) will reflect the fix on next default-branch rescan (allow up to 24h); the 7 Bucket-A blocker-mapped alerts will auto-close on rescan.

**Next action:** v1.0 GA release tag coordination (cross-project coordination via `.planning/PROJECT.md` + `services/console/.planning/`). Backend is ready; the console submodule's v1.0 frontend was already shipped (10 phases of services/console GSD complete per init context). Action: align on the release-tag SHA across parent + console and cut `v1.0.0` once both sides ack.

**Resume hint:** Phase 4 closed. The fix is live on master + main (parent suculent/thinx-device-api). The pending services/console pointer drift in `git status` (`M services/console`) is intentional per operator Option B — addressed separately, NOT in any Phase 4 commit. SEC-DEP-02 (v1.x backlog) is the canonical tracking marker for follow-up console-side dependency triage. No outstanding GSD work in this project; next gsd-level activity is the v1.0 release tag once cross-project sync lands.

---
*State initialized: 2026-05-26*
*Phase 1 verified: 2026-05-26*
*Phase 2 verified: 2026-05-26*
*Phase 3 verified: 2026-05-26*
*Phase 4 verified: 2026-05-27 (Slice 4 — parent PRs #539 + #540 merged to master + main; services/console deferred per Option B)*
*v1 GA backend closures complete: 2026-05-27 (4/4 v1 requirements Verified)*
