---
gsd_state_version: "1.0"
milestone: v1.16
milestone_name: Console Usability & Deploy Keys
status: awaiting_ci_and_acceptance
stopped_at: Completed 35-02-PLAN.md
last_updated: "2026-10-12T11:05:00Z"
state_head: fadfab0e56c9744a135cee03fa55a7f3c286107f
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 5
  completed_plans: 5
  percent: 100
current_phase: 38
current_phase_name: Deploy Key Management
---

# STATE — THiNX Device API

## Current Position

v1.16 phases 35–38 implemented and locally verified from Google Drive THiNX/TODOs.md.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-12 after v1.15). Requirements: `.planning/REQUIREMENTS.md` (v1.16). Roadmap: `.planning/ROADMAP.md` (v1.16 section, Phases 35–38).

## Previous Milestone

v1.15 Traefik Hardening (Edge) shipped 2026-10-12 (Phases 29–34, 14/14 requirements, audit `tech_debt`, `override_closeout`). Archives: `milestones/v1.15-ROADMAP.md`, `-REQUIREMENTS.md`, `-MILESTONE-AUDIT.md`, `-STATE.md` (full v1.15 operational state and accumulated context), `-phases/`.

## Decisions

Use thinx-staging baseline, paired console branch and parent submodule pointer. Preserve API signatures, legacy plaintext transport, existing dependency locks. No source credentials in git.
- [Phase 35]: G-35-4: linkedRepositoryHref binds only http:/https: (WHATWG URL parse) and returns the parsed href; other schemes and parse failures stay plain text

## Verification

Phase 35 accepted 2026-10-12: live UAT 5/5 passed (G-35-4 fix pushed to console and parent thinx-staging, re-tested live), 35-VERIFICATION.md status passed, 35-SECURITY.md threats_open 0. Code review 35-REVIEW.md: 16 findings open in 35-REVIEW-DISPOSITION.md, including CR-01 (TransformerEditor blanks a transformer on Save after a failed load; Phase 37 scope).

Local unit/regression checks, builds, source security checks, and lint pass. GitHub connector write access restored; console PR #32 is merged and API PR #572 is approved for thinx-staging. CLI credentials remain unavailable. Browser validation could not run because Chromium downloads were invalid. CI and production acceptance pending. See v1.16-VERIFICATION.md.

## Next Action

API PR #572 is merged into thinx-staging (concurrent v1.15 Phase 34 context preserved). Monitor staging test and registry image jobs, then verify live rollout before closing v1.16.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261012-fqh | Fix v1.15 edge documentation drift (fix-forward SLA/socket-proxy/P33 rows, swarm.md post-rollback note, review ledgers re-dispositioned) | 2026-10-12 | 88d18fd0 | [261012-fqh-fix-v1-15-edge-documentation-drift](./quick/261012-fqh-fix-v1-15-edge-documentation-drift/) |

## Deferred Items

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

**Last session:** 2026-10-12T10:30:23.481Z
**Stopped at:** Completed 35-02-PLAN.md
**Resume file:** None
