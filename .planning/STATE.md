---
gsd_state_version: 1.0
milestone: v1.11
milestone_name: Backlog Drawdown
status: Awaiting next milestone
stopped_at: Phase 16 Plan 01 complete (2026-06-06)
last_updated: "2026-06-06T16:39:27.739Z"
last_activity: 2026-06-06 — Milestone v1.11 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# STATE — THiNX Device API

**Last updated:** 2026-06-06 (Phase 16 Plan 01 complete — SEC-DEP-03 done; 3 overrides added, runtime audit 0 moderate/high/critical; uuid #194 deferred-dev-only)

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-05 after v1.11 milestone start)

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** Phase 17 — influx-fix-production-deploy
- **Latest production image:** `thinxcloud/api:latest sha256:4d3fb789` (v1.0 Phase 4 deploy 2026-05-26T22:35:54Z); v1.9 base bumped to `1.9.3054` 2026-06-02; influx fix `9b6d931c` is CI-green (pipeline 5266) but **pending force-rollout to prod** (OPS-EXEC-03 / Phase 17)
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace; no coordination required for v1.11 (none of the 4 v1.11 requirements cross the parent/submodule boundary).

## Current Position

Phase: Milestone v1.11 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-06 — Milestone v1.11 completed and archived

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** (shipped 2026-05-27) — see `.planning/MILESTONES.md`
- ✅ **v1.9 — Backend Hygiene & Posture** (shipped 2026-06-04) — Phases 5–11; see `.planning/MILESTONES.md` + `.planning/milestones/v1.9-ROADMAP.md`
- ✅ **v1.10 — Operational Closures** (shipped + archived 2026-06-05) — Phases 12–14, 5/5 requirements Verified; see `.planning/MILESTONES.md` + `.planning/milestones/v1.10-ROADMAP.md`
- 🔄 **v1.11 — Backlog Drawdown** (in progress 2026-06-05) — Phases 15–17, 4/4 requirements mapped; phase planning pending

## Deferred Items

Items acknowledged and deferred at v1.10 milestone close, v1.11 scope-setting (2026-06-05), and v1.11 milestone close (2026-06-06):

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260531-n72-fix-the-latent-bugs-in-apikey-js-and-har | scanner false-positive (work shipped via `/gsd-quick`, commit `fae0efbd`; manifest format unreadable by scanner) |
| quick_task | 260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign | scanner false-positive (work shipped via `/gsd-quick`, commit `08e4dbd7`; manifest format unreadable by scanner) |
| quick_task | 260605-lix-fix-device-check-in-lastupdate-not-persi | scanner false-positive (work shipped via `/gsd-quick`, commit `6b4a077c`; manifest format unreadable by scanner) |
| verification_gap | Phase 15 (15-VERIFICATION.md status human_needed) | Accepted at v1.11 close. Full Jasmine suite is Docker-gated (`/mnt/data/conf/config.json` absent in dev); 5/5 code must-haves verified directly. Validates on CI push of `thinx-staging`. |
| ci_red | CircleCI pipelines 5269 + 5270 (thinx-staging, incl. Phases 15/16) | FAILED **identically twice** (not flaky) on 1 spec: `00-AppSpec POST /api/login (invalid)` → 503 `service_unavailable` instead of 403, + 30s timeout. Root cause: `Owner.validate()` returns `false` (CouchDB user-directory view error/hang) → `router.auth.js:287`. **v1.11 touched NO auth/owner/CouchDB/session code** (only the 6 fs-finder modules + package.json + specs), so this is NOT a v1.11 regression — it's a CouchDB user-view readiness/availability issue in CI (the code comment names "CouchDB unavailable during a deploy" as this 503's cause). Needs infra/CouchDB-startup investigation (or `/gsd-debug` on the auth-path 503); unblock before deploying. Do NOT re-run (deterministic). |
| follow_on | Deploy Phases 15/16 to prod | Pushed already (origin at `30ee8d17`). After CI green: optional prod deploy `docker service update --force thinx_api` (micro-pinned, co-located w/ mosquitto). Not a milestone requirement; operator follow-on. |
| future_req | TEST-CHAI-01 | Deferred 4th time (deliberate keep call). chai-http v5 ESM locked per AGENTS.md; trigger = superagent v3 CVE. Reassess at v1.12. |
| future_req | OPS-02 | Deferred 4th time (deliberate keep call). Stale swarm memberlist entry `b356ad8e1d60` — pure swarm-side OPS orthogonal to this codebase. |
| future_req | OPS-03 | Deferred 4th time (deliberate keep call). 4 stack services with malformed `<image>@` autoredeploy specs — pure swarm-side OPS. |
| out_of_scope | CONSOLE-LEGACY-JSON-PARSE | Reclassified to `services/console` submodule scope at v1.11 start. Frontend double-parse at `src/login.js:173` + `password.js:87`; no parent-repo code angle. |

## Accumulated Context

### Decisions

- 2026-06-06 — Phase 16 Plan 01 — SEC-DEP-03 complete: 3 overrides added (@hapi/wreck ^18.1.1, tmp ^0.2.6, serialize-javascript ^7.0.5); runtime audit 1 moderate → 0; mocha smoke-check passed (serialize-javascript 6→7 did not break runner); uuid #194 deliberately deferred-dev-only (3-major jump to uuid@11 risks nyc/jest-junit regression).
- 2026-06-06 — Phase 15 Plan 04 — fs-finder removed from package.json; npm install removed 4 packages (fs-finder + 3 transitives); chai-http 4.4.0 lock preserved; precondition grep gate confirmed 0 call sites before removal.
- 2026-06-06 — Phase 15 Plan 03 — builder.js:837 recursive=true for HEADER_FILE_NAME; builder.js:943/949/955 non-recursive for cleanupSecrets; platform.js:47 recursive=true for thinx.yml; arduino plugin.js:15 recursive=true for *.ino glob; require path in plugin.js is ../../finder (two levels up).
- 2026-06-06 — Phase 15 Plan 02 — deployment.js imports only findFilesSync (minimal import surface); repository.js imports only findDirsSync; includeDotfiles=true is mandatory 4th arg for the .git search (replicates showSystemFiles); Case C2 stubs app_config singleton via Globals reference to prove dotfile flag survives into Repository.findAllRepositories().
- 2026-06-06 — Phase 15 Plan 01 — Manual synchronous stack-walk (no fs.readdirSync recursive:true) chosen for Node 19.x floor compatibility; only core fs/path deps; symlinks not followed per T-15-02; includeDotfiles skips entire hidden subtrees when false.
- 2026-06-05 — v1.11 ROADMAP shape: 3 phases (15–17), granularity coarse. Phase 15 = fs-finder removal (REFACTOR-06 + REFACTOR-07 tightly coupled: sweep must precede drop). Phase 16 = Dependabot triage (SEC-DEP-03, disjoint files, parallel-safe). Phase 17 = influx prod deploy (OPS-EXEC-03, purely operational, fix already committed + CI-green). All three phases are functionally independent of each other; execution order is flexible.
- 2026-06-05 — Phase numbering: v1.11 continues from v1.10's last phase (Phase 14). Integer phases 15–17 = v1.11 work. No `--reset-phase-numbers`; linear monorepo history preserves cross-milestone traceability.
- 2026-06-05 — CONSOLE-LEGACY-JSON-PARSE reclassified out of parent scope (frontend double-parse in sibling submodule; documented at v1.11 start in REQUIREMENTS.md Out of Scope table + PROJECT.md).
- 2026-06-05 — TEST-CHAI-01 / OPS-02 / OPS-03 kept deferred a 4th time as a deliberate keep call (not auto-carry); rationale recorded in REQUIREMENTS.md Future Requirements section.
- 2026-06-04 — v1.10 ROADMAP shape: 3 phases (12–14). Phase 12 shipped code helpers first (TEST-WS-01 + OBS-01 + OBS-02) so OPS-execution phases could lean on them. Phases 13 + 14 were functionally independent (disjoint swarm-host surfaces: nginx vs. CouchDB).
- 2026-06-02 — v1.9 started with 13 requirements across 7 phases (Phases 5–11). Phase numbering continued from v1.0's last phase (Phase 4).

### Todos

- Run `/gsd:plan-phase 15` for Phase 15 (fs-finder Removal — REFACTOR-06 + REFACTOR-07). Recommended first: the code sweep unblocks the dependency drop.
- After Phase 15 closes (or in parallel operator window): run `/gsd:plan-phase 16` for Phase 16 (Dependabot Triage — SEC-DEP-03).
- Phase 17 (Influx Fix Production Deploy — OPS-EXEC-03) can run at any time — operator force-rollout of `9b6d931c`. No code dependency on Phases 15 or 16.

### Blockers

- None.

### Open Questions

- None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260531-n72 | Fix latent bugs in apikey.js + harden node-redis client + Slack outage notifier (incident response to 2026-05-31 14:19 UTC thinx_api OOM) | 2026-05-31 | fae0efbd | [260531-n72-fix-the-latent-bugs-in-apikey-js-and-har](./quick/260531-n72-fix-the-latent-bugs-in-apikey-js-and-har/) |
| 260531-pdi | Refresh LE intermediate allowlist (R10..R14) in thinx-core.js cert rotation-tolerance branch — silences startup SSL verification error caused by R13-issued leaf vs R10-pinned chain | 2026-05-31 | 08e4dbd7 | [260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign](./quick/260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign/) |
| 260605-lix | Device check-in did not persist top-level lastupdate (console showed stale "last connected"): `update_device_and_respond` wrote a nested `doc.changes` blob via the flat-merge `devices/modify` handler; also `runDeviceTransformers` had no else branch for transformer-less devices. Fixed both + DeviceSpec (04b) regression. Root cause proven on prod doc 04ed1650. | 2026-06-05 | 6b4a077c | [260605-lix-fix-device-check-in-lastupdate-not-persi](./quick/260605-lix-fix-device-check-in-lastupdate-not-persi/) |
| 260605-inf | Influx stats fix (v1.10 OBS addition): dashboard check-in numbers read 0/stale + API log spammed `error parsing query: found BADSTRING`. Fixed `lib/thinx/influx.js` — tag mismatch (write `owner` vs read `owner_id`), malformed time predicates (stray `'`, Date/number → `'<ISO>'` / `now() - 7d`), `mean`→`count`, `${measurement}`→`${kpi}` loop index, removed malformed helper queries. Return shape preserved (statistics.js + Visits.vue compatible). CI green (pipeline 5266). **Pending prod deploy (OPS-EXEC-03 / Phase 17).** | 2026-06-05 | 9b6d931c | (loose commit — folded into v1.10, no quick-task dir) |

## Cross-Project Touchpoints

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project); no coordination required for v1.11.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`. TEST-CHAI-01 stays deferred per the lock.
- **`.planning/runbooks/`** — Phase 17 may append a post-deploy verification annex (pattern: OPS-EXEC-01/02 in v1.10).

## Session Continuity

**Stopped at:** Phase 16 Plan 01 complete (2026-06-06)

**Next action:** Phase 16 complete. Run verifier for Phase 16 to confirm SEC-DEP-03 (runtime audit clean, overrides in lock, mocha OK). Then proceed to Phase 17 (Influx Fix Production Deploy — OPS-EXEC-03). Phase 17 has no code dependency and can run at any time.

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown ROADMAP created: 2026-06-05 (4/4 v1.11 requirements mapped across 3 phases [15–17])*

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
