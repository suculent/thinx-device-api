---
gsd_state_version: 1.0
milestone: v1.12
milestone_name: Inbox Drawdown (shipped)
status: planning
last_updated: "2026-06-28T22:58:49.552Z"
last_activity: 2026-06-28
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE — THiNX Device API

**Last updated:** 2026-06-28 (v1.12 roadmap created — 4/4 requirements mapped across Phases 18–20)

## Project Reference

See: `.planning/PROJECT.md`

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** v1.12 Inbox Drawdown — Phase 18 (Complete GDPR Purge) is the recommended first phase (highest value, `priority` label, highest risk — execute first to front-load review)
- **Latest production image:** `thinxcloud/api:latest sha256:4d3fb789` (v1.0 Phase 4 deploy 2026-05-26T22:35:54Z); influx fix `9b6d931c` live in prod (autoredeployed pipeline-5266); v1.11 Phases 15/16 CI-green on `thinx-unit` (pipeline 5271) but not yet pushed to `thinx-staging` / deployed
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace; GH-03 (Profile GitHub token UI) is explicitly deferred to the console submodule's own GSD project.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-28 — Milestone v1.12 started

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** (shipped 2026-05-27) — see `.planning/MILESTONES.md`
- ✅ **v1.9 — Backend Hygiene & Posture** (shipped 2026-06-04) — Phases 5–11; see `.planning/MILESTONES.md` + `.planning/milestones/v1.9-ROADMAP.md`
- ✅ **v1.10 — Operational Closures** (shipped + archived 2026-06-05) — Phases 12–14, 5/5 requirements Verified; see `.planning/MILESTONES.md` + `.planning/milestones/v1.10-ROADMAP.md`
- ✅ **v1.11 — Backlog Drawdown** (shipped 2026-06-06) — Phases 15–17, 4/4 requirements Verified; audit `tech_debt`; see `.planning/MILESTONES.md` + `.planning/milestones/v1.11-ROADMAP.md`
- 🔄 **v1.12 — Inbox Drawdown** (in progress 2026-06-28) — Phases 18–20, 4/4 requirements mapped; phase planning pending

## Deferred Items

Items acknowledged and deferred at v1.11 milestone close and carried into v1.12 scope-setting:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260531-n72-fix-the-latent-bugs-in-apikey-js-and-har | scanner false-positive (work shipped via `/gsd-quick`, commit `fae0efbd`; manifest format unreadable by scanner) |
| quick_task | 260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign | scanner false-positive (work shipped via `/gsd-quick`, commit `08e4dbd7`; manifest format unreadable by scanner) |
| quick_task | 260605-lix-fix-device-check-in-lastupdate-not-persi | scanner false-positive (work shipped via `/gsd-quick`, commit `6b4a077c`; manifest format unreadable by scanner) |
| verification_gap | Phase 15 (15-VERIFICATION.md status human_needed) | Accepted at v1.11 close. Full Jasmine suite is Docker-gated (`/mnt/data/conf/config.json` absent in dev); 5/5 code must-haves verified directly. Validates on CI push of `thinx-staging`. |
| follow_on | Land v1.11 fix on thinx-staging + deploy 15/16 | The view-warmup fix + all v1.11 commits are CI-green on `thinx-unit` (pipeline 5271). Pushing to `thinx-staging` triggers deploy pipeline. Deliberate operator step — not yet done. |
| future_req | TEST-CHAI-01 | Deferred 4th time (deliberate keep call). chai-http v5 ESM locked per AGENTS.md; trigger = superagent v3 CVE. Reassess at v1.13. |
| future_req | OPS-02 | Deferred 4th time (deliberate keep call). Stale swarm memberlist entry `b356ad8e1d60` — pure swarm-side OPS orthogonal to this codebase. |
| future_req | OPS-03 | Deferred 4th time (deliberate keep call). 4 stack services with malformed `<image>@` autoredeploy specs — pure swarm-side OPS. |
| future_req | uuid #194 | `deferred-dev-only` (transitive `uuid@8` in nyc/jest-junit; 8→11 bump risks dev toolchain). Revisit if tools bump their pin or alert escalates to runtime scope. |
| out_of_scope | CONSOLE-LEGACY-JSON-PARSE | Reclassified to `services/console` submodule scope at v1.11 start. Frontend double-parse at `src/login.js:173` + `password.js:87`; no parent-repo code angle. |
| deferred_v1.12 | GH-03 (console UI for GitHub token) | Vue Profile screen to enter/replace/clear GitHub token — owned by `services/console/.planning/`. Explicitly out of scope for Phase 19. |
| deferred_v1.12 | SEC-CFG-02 (full readSecret sweep) | ~20 remaining sensitive env vars beyond core Redis/CouchDB. Phase 20 proves the pattern with core creds first; full sweep deferred. |

## Accumulated Context

### Decisions

- 2026-06-28 — v1.12 ROADMAP shape: 3 phases (18–20), granularity coarse. Phase 18 = complete GDPR purge (SEC-PII-03, `priority`, HIGH risk — execute first). Phase 19 = per-user GitHub token backend (GH-01 + GH-02, tightly coupled: validate+store then auto-key, one phase). Phase 20 = Docker secrets helper (SEC-CFG-01, core creds only, proves pattern). All three phases are functionally independent; recommended order is 18 → 19 → 20 (risk-first).
- 2026-06-28 — Phase numbering: v1.12 continues from v1.11's last phase (Phase 17). Integer phases 18–20 = v1.12 work. No reset; linear monorepo history preserves cross-milestone traceability.
- 2026-06-28 — GH-01 and GH-02 combined into Phase 19 (one phase) because they are the two halves of the same user journey: validate+store (GH-01) then auto-key creation+push (GH-02). Separating them would leave GH-01 in a permanently incomplete state between phases.
- 2026-06-28 — Phase 19 scope boundary confirmed: backend only (`lib/router.github.js`, `lib/thinx/owner.js`, `lib/thinx/rsakey.js`). Console UI (GH-03) deferred to `services/console` submodule's GSD project per the standing scope boundary.
- 2026-06-28 — Phase 18 path-prefix safety is the primary risk control: every filesystem delete asserted to `data_root + .../<owner>` prefix; empty/`/` owner must be rejected; a negative spec case with a crafted owner_id is mandatory (not optional) as an acceptance criterion.
- 2026-06-28 — Phase 19 test isolation: new route specs must mock `lib/thinx/github.js` (no live GitHub API calls) to be immune to the known `GitHubSpec` flakiness that gates deploy.
- 2026-06-06 — Phase 16 Plan 01 — SEC-DEP-03 complete: 3 overrides added (@hapi/wreck ^18.1.1, tmp ^0.2.6, serialize-javascript ^7.0.5); runtime audit 1 moderate → 0; mocha smoke-check passed; uuid #194 deliberately deferred-dev-only.
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

- Run `/gsd:plan-phase 18` for Phase 18 (Complete GDPR Purge — SEC-PII-03). Recommended first: highest value, carries the `priority` label, and HIGH risk means it benefits most from early plan-check + review.
- After Phase 18 closes: run `/gsd:plan-phase 19` for Phase 19 (Per-user GitHub Token Backend — GH-01 + GH-02). Note: mock GitHub API in specs to avoid the known GitHubSpec flakiness.
- After Phase 19 closes (or in parallel operator window): run `/gsd:plan-phase 20` for Phase 20 (Docker Secrets Helper — SEC-CFG-01). Note: a bad secret read must fail loudly at boot (see thinx_api OOM memory) — add an explicit startup-failure test.
- Operator follow-on (independent): push v1.11 view-warmup fix to `thinx-staging` → CI green → optional prod deploy of Phases 15/16 (micro-pinned, co-located with mosquitto).

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
| 260605-inf | Influx stats fix (v1.10 OBS addition): dashboard check-in numbers read 0/stale + API log spammed `error parsing query: found BADSTRING`. Fixed `lib/thinx/influx.js` — tag mismatch (write `owner` vs read `owner_id`), malformed time predicates (stray `'`, Date/number → `'<ISO>'` / `now() - 7d`), `mean`→`count`, `${measurement}`→`${kpi}` loop index, removed malformed helper queries. Return shape preserved (statistics.js + Visits.vue compatible). CI green (pipeline 5266). Live in prod (autoredeployed). | 2026-06-05 | 9b6d931c | (loose commit — folded into v1.10, no quick-task dir) |
| 260619-lgl | OAuth login failed from the Vue console: Google/GitHub buttons hit `/api/v2/oauth/{google,github}` (Vue API base is `/api/v2`) but the backend only mounted `/api/oauth/*` → `404 Cannot GET`. Dual-mounted the OAuth initiator+callback routes under `/api` and `/api/v2` (parity with `/login`+`/logout`); `redirect_uri` unchanged. Issue #2 (`/static/gdpr.html` 404) is deploy-lag — API code already serves it (`thinx-core.js:433`), ships on deploy. Console pin left at `1191184b`. Deployed via `thinx-staging`. | 2026-06-19 | b92f7c76 | [260619-lgl-oauth-v2-routes-gdpr-static](./quick/260619-lgl-oauth-v2-routes-gdpr-static/) |

## Cross-Project Touchpoints

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project). GH-03 (Profile GitHub token UI) is deferred here — no coordination required for v1.12 Phase 19 (backend only).
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`. TEST-CHAI-01 stays deferred per the lock.
- **`.planning/runbooks/`** — Phase 18 may warrant a runbook annex for the GDPR purge orchestrator (audit trail pattern from v1.10 Phases 13/14).

## Session Continuity

**Stopped at:** v1.12 roadmap creation (2026-06-28)

**Next action:** Run `/gsd:plan-phase 18` for Phase 18 (Complete GDPR Purge — SEC-PII-03). This is the highest-value, highest-risk phase; front-load it for maximum review time.

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown shipped and archived: 2026-06-06 (4/4 v1.11 requirements Verified across 3 phases [15–17])*
*v1.12 Inbox Drawdown roadmap created: 2026-06-28 (4/4 v1.12 requirements mapped across 3 phases [18–20])*
