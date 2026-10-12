---
gsd_state_version: "1.0"
milestone: v1.16
milestone_name: Console Usability & Deploy Keys
status: Awaiting next milestone
stopped_at: Milestone v1.16 archived
last_updated: "2026-10-12T14:51:19.690Z"
last_activity: 2026-10-12
last_activity_desc: Milestone v1.16 completed and archived
state_head: b4916ab05eaab4f9392da254a8263acbc3dd0966
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 7
  completed_plans: 7
  percent: 100
current_phase: 38
current_phase_name: Deploy Key Management
---

# STATE — THiNX Device API

## Current Position

Phase: Milestone v1.16 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-10-12 — Milestone v1.16 completed and archived

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-12 after v1.16)

**Core value:** The IoT device API stays available and trustworthy across release cycles — no signature breaks on routes the consoles rely on; push → CI → Swarmpit autoredeploy within the 600 s SLA.
**Current focus:** Planning next milestone (`/gsd-new-milestone`). v1.17 Deploy-Key Vault Transit runs separately in the `vault-transit` workstream (Phase 39).

## Previous Milestone

v1.16 Console Usability & Deploy Keys shipped 2026-10-12 (Phases 35–38, 11/11 requirements, all accepted by live UAT; no milestone audit, `override_closeout`). Archives: `milestones/v1.16-ROADMAP.md`, `-REQUIREMENTS.md`, `-VERIFICATION.md`, `-STATE.md` (full v1.16 verification and decision log), `-phases/`.

v1.15 Traefik Hardening (Edge) shipped 2026-10-12 — see `milestones/v1.15-STATE.md`.

## Decisions

Full log in `.planning/PROJECT.md` Key Decisions.

## Open Carry-overs (from v1.16)

- AR-36-01: backend full-log payload (sync GlusterFS read, JSON Buffer byte array, no compression)
- Review items: 35-REVIEW-DISPOSITION, 36 WR-01, 37 IN-02/03, 38 IN-01..04/06/07; same-second deploy-key sort relies on API order; UI-review polish across 35–38

## Next Action

`/clear` then `/gsd-new-milestone`.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261012-fqh | Fix v1.15 edge documentation drift (fix-forward SLA/socket-proxy/P33 rows, swarm.md post-rollback note, review ledgers re-dispositioned) | 2026-10-12 | 88d18fd0 | [261012-fqh-fix-v1-15-edge-documentation-drift](./quick/261012-fqh-fix-v1-15-edge-documentation-drift/) |

## Deferred Items

### v1.16 close (2026-10-12)

No items newly acknowledged. Debug session `device-build-history-full-logs` resolved by 36-02 (moved to `debug/resolved/`). Verification overrides: no milestone audit; Phases 35/36 verification `stale` (superseded by live UAT). 32 prior acknowledgements carried forward.

### Acknowledged at v1.15 close (2026-10-12)

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | rsakey-spec-revoke-red (v1.16 `03-RsakeySpec`) | awaiting_human_verify | 2026-10-12 | v1.15 |
| deferred_items | 31/deferred-items.md: From plan 31-01 — stale thinx-swarm thinx.yml, tls.toml never loaded, mosquitto-secure router, external-stack docker.network labels (tls.toml since loaded in P33) | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 31/deferred-items.md: From plan 31-02 — rollback image identity is the running digest, not the committed tag | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 31/deferred-items.md: From phase close-out — gluster deploy files label-synced; secrets block (closed 89b0f24), SEC-CFG-04 + env follow-ups open | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 33/deferred-items.md: plan verify literals assume GNU/BSD grep / Go-template spacing | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 33/deferred-items.md: 33-02 verify literals that cannot pass on Traefik v3.7.14 / Docker 29 | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 34/deferred-items.md: From 34-04 — db.thinx.cloud port 5985→5984 (RESOLVED 2026-10-09) | acknowledged | 2026-10-12 | v1.15 |
| deferred_items | 34/deferred-items.md: From 34-05 — SLA open gap (since PASS 380 s), scan re-run (since clean), socket-proxy repin trigger | acknowledged | 2026-10-12 | v1.15 |

### Acknowledged at v1.14 close (2026-10-05)

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| quick_tasks | 261003-w13-fix-api-key-cleartext-exposure | unknown | 2026-10-05 | v1.14 |
| todos | 2026-09-28-fix-worker-builder-service-polling-completion-detection.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-09-28-split-rollbar-server-and-client-tokens.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-09-29-resolve-legacy-fixmes-owner-transfer.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-03-apikey-hash-credential-and-storage.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-03-console-notification-delivery-gaps.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-03-mqtt-device-writes-gated.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-03-transfer-accept-not-bound-to-recipient.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-03-transfer-continuity-leftovers.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-04-builder-cmd-sh-evals-repository-thinx-yml.md | (presence-only) | 2026-10-05 | v1.14 |
| todos | 2026-10-04-multi-file-ota-update-multiple-broken.md | (presence-only) | 2026-10-05 | v1.14 |
| deferred_items | 24/deferred-items.md: Worker README and Dockerfile comments name only ROLLBAR_ACCESS_TOKEN status: open **Found during:** … | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 24/deferred-items.md: Transformer trans.js still reads WORKER_SECRET from env status: open **Found during:** 24-02 Task 3 … | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 24/deferred-items.md: API build-queue cron loop does not dispatch waiting builds in production status: open **Found during… | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 24/deferred-items.md: Stale entries in the production build queue status: open **Found during:** 24-05 Task 1 (read-only q… | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 26/deferred-items.md: From plan 26-03 (2026-10-01) 1. ** lib/thinx/owner.js atomic() error path logs the changes object.**… | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 26/deferred-items.md: From plan 26-02 (2026-10-01) 1. **The ZZ spec tier does not run in CI, so ZZ-LogPagingCouchSpec.js w… | acknowledged | 2026-10-05 | v1.14 |
| deferred_items | 26/deferred-items.md: Resolved (orchestrator, 2026-10-01, after wave 2) - 26-03 items 1 and 2 ( owner.js atomic() and appl… | acknowledged | 2026-10-05 | v1.14 |

### Carried forward from earlier closes

Items acknowledged and deferred at prior milestone closes and carried forward. Rows now scheduled in v1.14 name their phase.

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
| scheduled_v1.14 | SEC-CFG-02 (full readSecret sweep) | **→ Phase 24.** Inventory is 9 credentials in `lib/` (not ~20) plus a new `CSRF_SECRET`; env fallback kept (user decision). Env removal is SEC-CFG-03 (future). |
| deferred_v1.13 | SEC-CSP-02 (`unsafe-eval` removal) | Blocked on AngularJS console retirement — `$parse` requires `unsafe-eval` unless CSP mode. Revisit once console fully migrated to Vue. |
| verification_gap (ack v1.13) | 15/15-VERIFICATION.md (archived v1.11) | human_needed — formally acknowledged via `audit-open acknowledge` at v1.13 close (2026-09-25); already accepted at v1.11 close |
| context_questions (ack v1.13) | 05, 06, 07, 08, 09, 10, 11 / *-CONTEXT.md (archived v1.9) | 2–3 planner questions each, all answered by the phase plans; acknowledged at v1.13 close (2026-09-25) |
| scheduled_v1.14 | WR-06 CSRF token not session-bound | **→ Phase 25 (SEC-CSRF-02/03).** Double-submit cookie on `.thinx.cloud` gives no same-site protection; session-mutation routes unguarded (→ SEC-CSRF-05). See `21-REVIEW-FIX.md`. |
| scheduled_v1.14 | WR-04 `POST /api/v2/user` without CSRF | **→ Phase 25 (SEC-CSRF-04).** Decided 2026-09-25: no machine-client exemption; registrants must prime the token. |
| scheduled_v1.14 | Console CSP source-of-truth | **→ Phase 25 (SEC-CSP-03/04).** Gluster file is canonical (decision 2026-09-25); images and runbook snapshots mirror it, incl. the Vue `connect-src` `app.thinx.cloud` fix. Retiring the bind mount stays future (SEC-CSP-05). |
| scheduled_v1.14 | Classic register / forgot / reset-confirm under enforcement | **→ Phase 25 (SEC-CSRF-06).** |

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 35 P02 | 4min | 2 tasks | 3 files |

## Session

**Last session:** 2026-10-12T11:43:25.750Z
**Stopped at:** Completed 36-02-PLAN.md
**Resume file:** None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
