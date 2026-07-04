---
gsd_state_version: 1.0
milestone: v1.13
milestone_name: Web Hardening (Console/Edge)
status: planning
last_updated: "2026-07-04T15:10:00.000Z"
last_activity: 2026-07-04
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE — THiNX Device API

**Last updated:** 2026-07-04 (v1.13 roadmap created — 2/2 requirements combined into Phase 21)

## Project Reference

See: `.planning/PROJECT.md`

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** v1.13 Web Hardening (Console/Edge) — Phase 21 (CSP Wildcard Removal + Anti-CSRF Token) is the only phase; it must touch the swarm nginx edge and both console images (legacy AngularJS `services/console/src/default.conf` + Vue `services/console/vue/default.conf`) consistently, plus add server-side CSRF validation to the API's login route.
- **Latest production image:** `thinxcloud/api:latest sha256:4d3fb789` (v1.0 Phase 4 deploy 2026-05-26T22:35:54Z); influx fix `9b6d931c` live in prod (autoredeployed pipeline-5266); v1.12 Phases 18–20 shipped 2026-06-29 (console submodule bumped for GitHub-token UI + nightshift branches).
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. Phase 21 touches BOTH console images (legacy + Vue) directly since the CSP and CSRF findings are console-frontend concerns, not backend-only; coordinate submodule pointer bump as part of Phase 21 deploy.

## Current Position

Phase: 21 (CSP Wildcard Removal + Anti-CSRF Token) — not started
Plan: —
Status: Roadmap created, planning pending
Last activity: 2026-07-04 — v1.13 ROADMAP.md + STATE.md written; 2/2 requirements mapped to Phase 21

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** (shipped 2026-05-27) — see `.planning/MILESTONES.md`
- ✅ **v1.9 — Backend Hygiene & Posture** (shipped 2026-06-04) — Phases 5–11; see `.planning/MILESTONES.md` + `.planning/milestones/v1.9-ROADMAP.md`
- ✅ **v1.10 — Operational Closures** (shipped + archived 2026-06-05) — Phases 12–14, 5/5 requirements Verified; see `.planning/MILESTONES.md` + `.planning/milestones/v1.10-ROADMAP.md`
- ✅ **v1.11 — Backlog Drawdown** (shipped 2026-06-06) — Phases 15–17, 4/4 requirements Verified; audit `tech_debt`; see `.planning/MILESTONES.md` + `.planning/milestones/v1.11-ROADMAP.md`
- ✅ **v1.12 — Inbox Drawdown** (shipped 2026-06-29) — Phases 18–20, 4/4 requirements Verified; see `.planning/MILESTONES.md`
- 🔄 **v1.13 — Web Hardening (Console/Edge)** (roadmap created 2026-07-04) — Phase 21, 2/2 requirements mapped; phase planning pending

## Deferred Items

Items acknowledged and deferred at prior milestone closes and carried forward:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260531-n72-fix-the-latent-bugs-in-apikey-js-and-har | scanner false-positive (work shipped via `/gsd-quick`, commit `fae0efbd`; manifest format unreadable by scanner) |
| quick_task | 260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign | scanner false-positive (work shipped via `/gsd-quick`, commit `08e4dbd7`; manifest format unreadable by scanner) |
| quick_task | 260605-lix-fix-device-check-in-lastupdate-not-persi | scanner false-positive (work shipped via `/gsd-quick`, commit `6b4a077c`; manifest format unreadable by scanner) |
| verification_gap | Phase 15 (15-VERIFICATION.md status human_needed) | Accepted at v1.11 close. Full Jasmine suite is Docker-gated (`/mnt/data/conf/config.json` absent in dev); 5/5 code must-haves verified directly. Validates on CI push of `thinx-staging`. |
| follow_on | Land v1.11 fix on thinx-staging + deploy 15/16 | The view-warmup fix + all v1.11 commits are CI-green on `thinx-unit` (pipeline 5271). Pushing to `thinx-staging` triggers deploy pipeline. Deliberate operator step. |
| future_req | TEST-CHAI-01 | Deferred 4th+ time (deliberate keep call). chai-http v5 ESM locked per AGENTS.md; trigger = superagent v3 CVE. |
| future_req | OPS-02 | Deferred 4th+ time (deliberate keep call). Stale swarm memberlist entry `b356ad8e1d60` — pure swarm-side OPS orthogonal to this codebase. |
| future_req | OPS-03 | Deferred 4th+ time (deliberate keep call). 4 stack services with malformed `<image>@` autoredeploy specs — pure swarm-side OPS. |
| future_req | uuid #194 | `deferred-dev-only` (transitive `uuid@8` in nyc/jest-junit; 8→11 bump risks dev toolchain). Revisit if tools bump their pin or alert escalates to runtime scope. |
| out_of_scope | CONSOLE-LEGACY-JSON-PARSE | Reclassified to `services/console` submodule scope at v1.11 start. Frontend double-parse at `src/login.js:173` + `password.js:87`; no parent-repo code angle. |
| out_of_scope (v1.12) | GH-03 (console UI for GitHub token) | Vue Profile screen to enter/replace/clear GitHub token — owned by `services/console/.planning/`. Out of scope for Phase 19. |
| out_of_scope (v1.12) | SEC-CFG-02 (full readSecret sweep) | ~20 remaining sensitive env vars beyond core Redis/CouchDB. Phase 20 proved the pattern with core creds first; full sweep deferred. |
| deferred_v1.13 | SEC-CSP-02 (`unsafe-eval` removal) | Blocked on AngularJS console retirement — `$parse` requires `unsafe-eval` unless CSP mode. Revisit once console fully migrated to Vue. |

## Accumulated Context

### Decisions

- 2026-07-04 — v1.13 ROADMAP shape: 1 phase (21), granularity coarse. SEC-CSP-01 (CSP scheme-wildcard removal) and SEC-CSRF-01 (login-form anti-CSRF token) combined into a single Phase 21 rather than split, because both changes touch the identical three deploy surfaces (nginx edge, legacy console image, Vue console image), share the same "keep both consoles + edge mutually consistent" verification concern, and ship through the same console-submodule deploy pipeline. Splitting would duplicate the two-console-consistency check and the HawkScan-rescan verification for no delivery-boundary benefit.
- 2026-07-04 — Phase numbering: v1.13 continues from v1.12's last phase (Phase 20). Phase 21 = v1.13 work. No `--reset-phase-numbers`; linear monorepo history preserves cross-milestone traceability.
- 2026-07-04 — `unsafe-eval` removal explicitly deferred as SEC-CSP-02 (not folded into Phase 21) — AngularJS's `$parse` requires `unsafe-eval` unless run in CSP-safe mode; removing it now would break the legacy console outright. Tracked as a future requirement, blocked on the console leaving AngularJS.
- 2026-07-04 — API-side CSRF for token-authenticated routes explicitly out of scope — those routes use `X-Access-Token`/JWT (not ambient cookies) and aren't CSRF-prone; only the cookie-session login forms need the synchronizer token.
- 2026-06-29 — v1.12 shipped 4/4 requirements across Phases 18–20 (SEC-PII-03, GH-01, GH-02, SEC-CFG-01); console submodule bumped for GitHub-token UI + 11 nightshift/chore branches.

### Todos

- Run `/gsd:plan-phase 21` for Phase 21 (CSP Wildcard Removal + Anti-CSRF Token — SEC-CSP-01 + SEC-CSRF-01). This is the only v1.13 phase; plan should decompose into: (a) nginx-edge CSP config change (runbook snapshot), (b) legacy console `default.conf` CSP change, (c) Vue console `default.conf` CSP change, (d) server-side CSRF token generation + validation middleware on the login route, (e) legacy console login-form token wiring, (f) Vue console login-form token wiring, (g) HawkScan rescan verification for both plugins (10055-4, 20012).
- Before closing Phase 21: confirm the Crisp widget (`wss://client.relay.crisp.chat`) and any other explicit-host dependents are enumerated and pinned in the new CSP — a missed host will silently break a console feature post-deploy.
- Coordinate `services/console` submodule pointer bump as part of Phase 21's deploy (both console images change).

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

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project). Phase 21 directly touches this submodule's Vue console image (`services/console/vue/default.conf` CSP + login-form CSRF token wiring) — coordinate with the console GSD project rather than treating it as fully external for this phase.
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.
- **`.planning/runbooks/swarm-configs/`** — Phase 21 edits `rtm.thinx.cloud-server.pre.nginx` and `.post.nginx` (line 28 CSP header); the runbook snapshot trail pattern from v1.9/v1.10 applies here too.

## Session Continuity

**Stopped at:** v1.13 roadmap creation (2026-07-04)

**Next action:** Run `/gsd:plan-phase 21` for Phase 21 (CSP Wildcard Removal + Anti-CSRF Token — SEC-CSP-01 + SEC-CSRF-01). This is the only v1.13 phase.

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown shipped and archived: 2026-06-06 (4/4 v1.11 requirements Verified across 3 phases [15–17])*
*v1.12 Inbox Drawdown shipped 2026-06-29 (4/4 v1.12 requirements Verified across 3 phases [18–20])*
*v1.13 Web Hardening (Console/Edge) roadmap created: 2026-07-04 (2/2 v1.13 requirements mapped into 1 phase [21], granularity coarse)*
</content>
