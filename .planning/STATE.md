---
gsd_state_version: "1.0"
milestone: v1.14
milestone_name: Backlog & Hardening Sweep
current_phase: 22
current_phase_name: ci-sast-baseline
status: executing
stopped_at: Completed 22-03-PLAN.md
last_updated: "2026-09-25T13:58:45.307Z"
last_activity: 2026-09-25
last_activity_desc: Phase 22 execution started
state_head: ce4d5c4dfdc4841307417543cd8017cca74c84e7
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# STATE — THiNX Device API

**Last updated:** 2026-09-25 (v1.14 roadmap created: Phases 22–28, 25/25 requirements mapped)

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-09-25 at v1.14 start)

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** v1.14 Backlog & Hardening Sweep — Phase 22 CI & SAST Baseline (ready to plan; verify-first).
- **Production today (CORRECTED 2026-09-21 by direct swarm inspection):** `thinx_api` runs on **core**, `thinx_console` on **micro**, `thinx_vue` on **core** — api and classic console are the reverse of what was recorded on 2026-09-19. Original (now stale) note follows: api + transformer run on `micro`, not `core`. Classic console image `registry.thinx.cloud:5000/thinx/console:swarm@sha256:27b1ca72` on node `core`, serving the CSP build with no inline scripts; rollback digest `sha256:1906bd5f`. `thinx-staging` publishes to the private registry, `main` to Docker Hub — one registry per branch since `3cfd0666`.
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. In v1.14, Phase 22 (Vue hostname var), Phase 25 (image `default.conf` header mirror) and Phase 26 (Vue log paging UI) touch the console submodule; coordinate each pointer bump with the phase deploy.

## Current Position

Phase: 22 (ci-sast-baseline) — READY TO EXECUTE
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-09-25 — Phase 22 execution started

Progress: [████████░░] 75% (0/7 phases)

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** (shipped 2026-05-27) — see `.planning/MILESTONES.md`
- ✅ **v1.9 — Backend Hygiene & Posture** (shipped 2026-06-04) — Phases 5–11; see `.planning/MILESTONES.md` + `.planning/milestones/v1.9-ROADMAP.md`
- ✅ **v1.10 — Operational Closures** (shipped + archived 2026-06-05) — Phases 12–14, 5/5 requirements Verified; see `.planning/MILESTONES.md` + `.planning/milestones/v1.10-ROADMAP.md`
- ✅ **v1.11 — Backlog Drawdown** (shipped 2026-06-06) — Phases 15–17, 4/4 requirements Verified; audit `tech_debt`; see `.planning/MILESTONES.md` + `.planning/milestones/v1.11-ROADMAP.md`
- ✅ **v1.12 — Inbox Drawdown** (shipped 2026-06-29) — Phases 18–20, 4/4 requirements Verified; see `.planning/MILESTONES.md`
- ✅ **v1.13 — Web Hardening (Console/Edge)** (shipped + archived 2026-09-25) — Phase 21, 2/2 requirements Verified (3 operator overrides); see `.planning/MILESTONES.md` + `.planning/milestones/v1.13-ROADMAP.md`
- 🚧 **v1.14 — Backlog & Hardening Sweep** (roadmap 2026-09-25) — Phases 22–28, 25 requirements; see `.planning/ROADMAP.md`

## v1.14 Phase Map

| Phase | Name | Requirements | Deploy surface | Research at planning |
|-------|------|--------------|----------------|----------------------|
| 22 | CI & SAST Baseline | CI-01..03 | CI only (+ live Vue bundle check) | no (verify-first) |
| 23 | Build-Pipeline Sink Hardening | SEC-EXEC-01/02, SEC-PATH-01/02 | backend image | no (spec-first) |
| 24 | Secrets Sweep | SEC-CFG-02 | backend image + swarm secrets | no |
| 25 | Session-Bound CSRF + Console Edge Headers | SEC-CSRF-02..06, SEC-CSP-03/04 | backend + both consoles + gluster | **yes** |
| 26 | Vue Console Log Paging | LOG-01..04 | backend + Vue submodule | **yes** |
| 27 | InfluxDB 2 Upgrade | OPS-INFLUX-01..03 | backend + InfluxDB storage (irreversible) | **yes** |
| 28 | Swarmpit Upgrade & Trim | OPS-SWARM-01..03 | swarm ops only, own window | **yes** |

## Since the last state update (2026-07-06 → 2026-09-19)

~123 commits landed on `thinx-staging`/`main` outside the GSD plan flow. Grouped by theme, with
entry-point commits — none of this is reflected in a phase SUMMARY, so this list is the record:

- **Observability and privacy tooling (Jul 6–15).** Logging quality audit, made call-span aware
  (`00291f10`, `2a32b4d0`); event taxonomy centralized as one source of truth (`06fbf580`); PII
  exposure scan report plus `.gitignore` hardening (`48643a53`); privacy-policy consistency checker
  with a CI spec (`c722c9a6`); bounded severity + secret redaction in the auth modules (`1c7b8616`);
  roadmap entropy detector (`6ef99e50`).
- **Dependency and injection sweep (Sep 14–16).** socket.io family to 4.8.3, `ws` pinned 8.21.3,
  axios 1.20.0, joi/moment bumps (`d9c62c11`, `4d68d9ff`, `33e8e463`); CouchDB callback semantics
  restored on nano 11 through the new `lib/thinx/couch.js` shim (`0788a7f1`, `77b0760c`); optional
  CORS enforcement with a warning-only rollout mode (`6ac1f0da`); NoSQL injection sanitizer
  (`c0980f90`); crypto-js replaced by `node:crypto` for transmit-key decryption (`dcd8234e`);
  committed Coveralls token removed and coverage collected as CI artifacts (`aefcf8bb`, `54db7afb`);
  jasmine pinned to 5.x so the order-dependent specs stop shuffling (`b57aa986`).
- **Image and platform hardening (Sep 17–18).** Docker Hardened Images for base, worker, couchdb and
  the platformio builder (`8b6683fb`, `09fac716`, `64d32de1`, `f910b8df`); device `timezone_utc`
  feature from design spec through registration, edit, read and a backfill migration (`6c9bef79`,
  `e843b871`, `fdaa4eb7`, `f61e3341`, `de1ca0f9`, `a2d6b874`); sslheaders attached to the https
  router with a corrected trust-proxy allowlist and negotiated cookie `Secure` flag (`3574b983`,
  `2a54b977`); `docker-swarm.yml` reconciled with the deployed stack (`3cfdc034`); Snyk code, OSS and
  container monitoring wired into CI including the vendored goauth module (`0935e747` … `e8c3f21f`);
  test gate repaired so the ZZ-* tier stops being skipped (`3f9f6df3`).
- **Secrets and pipeline hygiene (Sep 19).** Every secret ENV removed from the api image and
  publishes pinned to `main` (`7a4a6fcd`) — 13 from the api image including SLACK_WEBHOOK, plus
  ROLLBAR_ACCESS_TOKEN and REDIS_PASSWORD elsewhere; AQUA_SEC_TOKEN and SNYK_TOKEN had leaked in a
  published image and were rotated. redis and transformer publish `:latest` again rather than only a
  SHA tag (`f5af5aec`), which immediately surfaced a latent crash — both redis scripts carried a
  bash shebang on an Alpine image with no bash, fixed to POSIX `sh`. One registry per branch ends the
  tag race (`3cfd0666`); all six submodules publish `main` only; console images reach Docker Hub
  through a second credential pair (`41da13d7`). OAuth authorize host allowlisted with an exact match
  (`974d389e`). Transformer sandbox: device status moved from interpolated script source to isolate
  globals, 1000 ms timeout, context release (`7e407973`), and the `POST /do` handler that never bound
  `this` (`f806d382`). npm dropped from the production image, ~204 MB (`caef2027`). Bootstrap
  3.3.7 → 3.4.1 in the legacy console (`a40a6f1a`). `master` retired in favour of `main`
  (`a2337b3b`), PR #554 merged.
- **This session (Sep 19, late).** Classic-console inline scripts migrated to external assets and
  deployed; production `script-src` now has no `'unsafe-inline'` and gains `script-src-attr 'none'`
  (`529be527`, console `33d20bca`). Three unused dependencies dropped and the dead `overrides.ip`
  entry with them (`3bce59cf`). CodeQL workflow pinned to least privilege (`79736b49`). CODEOWNERS
  added (`071893e9`). AngularJS digest guard so handlers stop aborting mid-digest — the missing
  header avatar (`87be96d1`, console `b0d514d`). codebeat removed, the service is gone (`ad103672`).
  PR #555 (`thinx-staging` → `main`) is open and ready; merging is what publishes to Docker Hub.

## Open Operational Items

Carried from the 2026-09-19 sessions, none of them blocking. Rows now scheduled in v1.14 name their phase.

| Item | State |
|------|-------|
| PR #555 | ✅ MERGED 2026-09-19T21:34:24Z (`thinx-staging` -> `main`). Docker Hub publish triggered. |
| Aikido | Auth fixed by the operator, never exercised against a real scan. |
| Aikido branch-protection finding | Recommendation stands: accept-risk the *review* requirement (solo maintainer — GitHub forbids self-approval, so requiring approvals hard-blocks every merge) and enforce status checks, signed commits (already 100% `G`) and no force-push/deletion instead. Same reason CODEOWNERS must not be paired with "Require review from Code Owners" yet. |
| Private registry flakiness | `docker login registry.thinx.cloud:5000` timed out in two consecutive pipelines on 2026-09-19, both times while another job was pushing an image to it. Both passed on rerun. **→ v1.14 Phase 22 (CI-02).** Retry wrapper exists (`be376db9`); one raw login remains at `.circleci/config.yml:~767`. |
| CodeQL workflow staleness | Still triggers on the deleted `master` branch, so only the weekly schedule fires; `github/codeql-action/*@v1` was retired in Jan 2023 and `actions/checkout@v2` is two majors behind. **→ v1.14 Phase 22 (CI-01).** |
| `couchdb` / `console-build-env` images | Not refreshed — nothing has been pushed to them. |
| `Dockerfile.test` secrets as ENV | Deliberate. That image is never published. |
| Aikido triage | Not possible on this plan: Code Quality is not in the free tier, so the issue feed (`400 — only available for paying customers`), the dashboard list and `aikido_ignore_issue` are all unavailable — the ignore call accepts an id and changes nothing, verified by re-scanning. What does work is the autofix bot (it produced #556), the two commit checks, and the on-demand local scan via `aikido_scan_paths`, which is fresher than the platform's ~3-day sweep. Verified noise therefore lives in `scripts/aikido-known-false-positives.json` and is filtered by `scripts/aikido-filter.js`. |
| `lib/thinx/git.js:71` / `:153` | Deliberately NOT in the false-positive list. The `execSync(<string>)` sink is unchanged — the contract is a shell script string because of the `ssh-agent sh -c` wrapper — and the mitigation (`a1e7fbe3`) is at the callers, which now allowlist and `shell-escape` every value. **→ v1.14 Phase 23 (SEC-EXEC-01)** moves the sink to argv. |
| `lib/thinx/builder.js` path traversals | Aikido flags `readFileSync`/`lstatSync` on paths inside the build directory the builder created (lines ~428, 449, 682, 731, 1197). **→ v1.14 Phase 23 (SEC-PATH-01/02).** |
| Snyk `snyk-monitor-console-classic` | Green as of 2026-09-19 (the missing `dockerhub` context was the original cause; the later failure was the registry timeout above). |

## Deferred Items

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

## Accumulated Context

### Decisions

Full log in `PROJECT.md` Key Decisions. Recent decisions affecting current work:

- 2026-09-25 — v1.14 roadmap shape: 7 phases (22–28) under `granularity: coarse`. Boundaries follow deploy surfaces and risk windows (CI only / backend image / swarm secrets / backend + consoles + gluster / backend + Vue submodule / InfluxDB storage / Swarmpit). Phase 24 (single requirement) is kept separate as a production secret migration with its own verification; it is the fold candidate if fewer phases are wanted.
- 2026-09-25 — v1.14 ordering: CodeQL baseline (22) before sink fixes (23); sinks before the secrets sweep (24) so `/run/secrets` grows only after symlink containment; secrets before CSRF (25) so `CSRF_SECRET` exists and the HMAC key is never random; log paging (26) after CSRF so regressions stay distinguishable; InfluxDB 2 (27) after all other code deploys; Swarmpit (28) last in its own window.
- 2026-09-25 — InfluxDB scope changed after research: `thinx_influxdb` is upgraded 1.8 → InfluxDB 2 (irreversible; verified backup first), and 90-day retention becomes bucket retention. CI keeps `dhi.io/influxdb:2`; research's `influxdb:1.8` CI switch is dropped. Phase 27 re-homes or drops the `swarmpit/influxdb.conf` bind mount, which decouples it from the Swarmpit trim.
- 2026-09-25 — Swarmpit scope changed after research: upgrade to 1.10 first (OPS-SWARM-01), then drop stats/`swarmpit_influxdb` (02), then `swarmpit_agent` (03), each gated by a push-to-redeploy test. `swarmpit_db` stays couchdb 2.3.0.
- 2026-09-25 — SEC-CFG-02 keeps the env-var fallback (user decision); env removal is SEC-CFG-03.
- 2026-07-04 — Phase numbering continues across milestones (no `--reset-phase-numbers`); v1.14 starts at 22.
- [Phase 21]: issueCsrfToken never re-invokes ensureXsrfCookie/crypto.randomBytes -- it only reads the cookie the global middleware already set, so the priming GET never emits a second Set-Cookie
- [Phase 21]: verifyCsrfToken wired onto exactly the 7 reconciled protected routes (adds the Vue v2 password reset/set routes the original D-02 list omitted); X-Access-Token/JWT routes and /api/v2/user left untouched
- [Phase 21]: Console CSRF wiring uses two shared seams (classic $.ajaxSetup, Vue composeHeaders()) rather than per-call-site edits — Prevents future whack-a-mole regressions found across 4 plan-check passes
- [Phase 21]: SEC-CSP-01: pinned CSP host allowlist across console images + runbook snapshots, replacing the https:/wss: scheme wildcard — unsafe-inline/unsafe-eval left unchanged per source; SEC-CSP-02 deferred
- [Phase 22]: [Phase 22]: CI-02 took the delete path — D-01 pre-check found no private-registry pull on the CircleCI test path
- [Phase 22]: [Phase 22]: CodeQL security-extended does not flag git.js execSync or builder readFileSync/lstatSync sinks; Phase 23 sink before/after must come from Aikido (baseline 147 open alerts at 89c5cf93)
- [Phase 22]: 22-02: D-13 gluster+live removal of VUE_APP_CONSOLE_HOSTNAME approved (proceed); first attempt denied by the auto-mode permission classifier, applied on re-dispatch 2026-09-25 13:08Z (gluster line 290 removed with backup, one --env-rm on thinx_console, image unchanged)
- [Phase 22]: 22-03: Release PR #569 thinx-staging -> main opened after user 'open-pr' gate; left OPEN, CodeQL PR analysis 1839520597 green and non-required; main-push run pending user merge

### Todos

- None open for v1.14 yet. The v1.13-era notes below (2026-09-21) are kept for reference: each is either resolved or now a v1.14 requirement (Vue `connect-src` gap and stale runbook snapshots → SEC-CSP-04; `WEB_HOSTNAME` for `:vue` → CI-03; gluster bind-mount source of truth → SEC-CSP-03, retirement → SEC-CSP-05 future).

<details>
<summary>v1.13-era notes (2026-09-21), reference only</summary>

- ~~Reconcile Phase 21 with reality before closing it~~ **DONE 2026-09-21.** Findings recorded in a `## RECONCILIATION WITH DEPLOYED REALITY` block at the top of both `21-04-PLAN.md` and `21-05-PLAN.md`. Summary: 21-04 Task 1 already satisfied (csrf.js on `origin/thinx-staging` + `origin/main`, HEAD==origin 0/0, submodule `acb62d82` 0/0, PR #555 merged 2026-09-19T21:34:24Z, and `app.thinx.cloud` live-mints `XSRF-TOKEN; Domain=.thinx.cloud; Secure; SameSite=Lax`). Enforcement confirmed still fail-open (`POST /api/login` sans token -> `invalid_credentials`, not `csrf_token_invalid`). Both plans' dead `$HOME/.claude/get-shit-done/...` execution-context paths repointed to `~/.claude/gsd-core/...`.
- **Vue console CSP does not match its own image config (2026-09-21).** `console.thinx.cloud` serves a CSP byte-identical (modulo order) to the CLASSIC `services/console/src/default.conf`, not to `services/console/vue/default.conf`; both console hosts return one identical CSP header. Explained by the gluster bind mount below.
- **Latent cold-session lockout (2026-09-21).** `services/console/vue/default.conf` `connect-src` omits `https://app.thinx.cloud` and `wss://app.thinx.cloud`. If that file ever takes effect, the Vue console's cross-origin `GET /api/v2/csrf-token` prime is CSP-blocked. Masked today only because the live gluster CSP lists both hosts. **→ SEC-CSP-04.**
- **Topology drift (2026-09-21, swarm-verified).** Actual placement: `thinx_api` on **core**, `thinx_console` on **micro**, `thinx_vue` on **core**. `docker service ls` on the leader returns an *unstable subset* across consecutive polls — query services by name, not by listing.
- **RESOLVED (2026-09-21) — the console CSP override is a swarm BIND MOUNT, not a build bug.** Both `thinx_vue` and `thinx_console` mount the SAME host file over the image's config, read-only: `/mnt/gluster/deployment/swarm/console/default.conf` -> `/etc/nginx/conf.d/default.conf`. Proof: a throwaway container from the deployed `:vue` image has `default.conf` = 95 lines, `Permissions-Policy`=1, `Strict-Transport`=0, `cloudfront`=0 — an exact fingerprint match for HEAD's `services/console/vue/default.conf`. The RUNNING container has 103 lines, `Permissions-Policy`=0, `Strict-Transport`=1, `cloudfront`=1 — an exact match for the gluster file (4634 bytes, mtime **Sep 19 20:16**). The gluster file lives in its own git repo on the swarm (`/mnt/glusterfs/deployment/swarm`) — NOT in this repo and NOT in the console submodule. Because one file serves both consoles, the two console hosts necessarily return an identical CSP. **→ SEC-CSP-03.**
- **`WEB_HOSTNAME` is wrong for the `:vue` build (2026-09-21).** The deployed image carries `ARG WEB_HOSTNAME=rtm.thinx.cloud`. Both CI jobs pass `--build-arg VUE_APP_CONSOLE_HOSTNAME=${WEB_HOSTNAME}`, a single project-level var shared with the CLASSIC build. `VUE_APP_CONSOLE_HOSTNAME` is baked into the Vue bundle and read by `vue/src/mixins/hostnames.js:4`; impact is limited to the three "THiNX Console" links (`Layout.vue:12`, `Login.vue:91`, `PasswordReset.vue:96`) pointing at the classic console. Fix needs a SEPARATE var (`VUE_WEB_HOSTNAME`, wired in `3f2f6da4`). **→ CI-03 (verify).**
- **Runbook snapshots stale (2026-09-21).** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx:29` still record 21-03's CSP. **→ SEC-CSP-04.**
- Authenticated in-browser verification of the CSP build has never run against the deployed instance — the pre-deploy Playwright suites (`src/test/csp/browser.cjs`, `app-browser.cjs`) cover it with fixtures only.

</details>

### Blockers

- None.

### Open Questions

Decided at plan time, not blocking the roadmap:

- Phase 25: WR-06 pre-auth binding. Research recommends option (a): the priming GET creates a short-TTL Redis pre-session and the token binds to `sessionID`. The requirement text (SEC-CSRF-02) already assumes this.
- Phase 27: `influx.js` against InfluxDB 2 through the v1-compat API with a DBRP mapping, or through a v2 client. Also: does Swarmpit write to the `swarmpit` database inside `thinx_influxdb`?
- Phase 28: Docker Engine version on `micro`/`core` (Engine 29.0–29.2 rejects Swarmpit 1.9's API 1.30 default); where the Swarmpit stack file lives on `micro`.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260531-n72 | Fix latent bugs in apikey.js + harden node-redis client + Slack outage notifier (incident response to 2026-05-31 14:19 UTC thinx_api OOM) | 2026-05-31 | fae0efbd | [260531-n72-fix-the-latent-bugs-in-apikey-js-and-har](./archive/quick/260531-n72-fix-the-latent-bugs-in-apikey-js-and-har/) |
| 260531-pdi | Refresh LE intermediate allowlist (R10..R14) in thinx-core.js cert rotation-tolerance branch — silences startup SSL verification error caused by R13-issued leaf vs R10-pinned chain | 2026-05-31 | 08e4dbd7 | [260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign](./archive/quick/260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign/) |
| 260605-lix | Device check-in did not persist top-level lastupdate (console showed stale "last connected"): `update_device_and_respond` wrote a nested `doc.changes` blob via the flat-merge `devices/modify` handler; also `runDeviceTransformers` had no else branch for transformer-less devices. Fixed both + DeviceSpec (04b) regression. Root cause proven on prod doc 04ed1650. | 2026-06-05 | 6b4a077c | [260605-lix-fix-device-check-in-lastupdate-not-persi](./archive/quick/260605-lix-fix-device-check-in-lastupdate-not-persi/) |
| 260605-inf | Influx stats fix (v1.10 OBS addition): dashboard check-in numbers read 0/stale + API log spammed `error parsing query: found BADSTRING`. Fixed `lib/thinx/influx.js` — tag mismatch (write `owner` vs read `owner_id`), malformed time predicates (stray `'`, Date/number → `'<ISO>'` / `now() - 7d`), `mean`→`count`, `${measurement}`→`${kpi}` loop index, removed malformed helper queries. Return shape preserved (statistics.js + Visits.vue compatible). CI green (pipeline 5266). Live in prod (autoredeployed). | 2026-06-05 | 9b6d931c | (loose commit — folded into v1.10, no quick-task dir) |
| 260619-lgl | OAuth login failed from the Vue console: Google/GitHub buttons hit `/api/v2/oauth/{google,github}` (Vue API base is `/api/v2`) but the backend only mounted `/api/oauth/*` → `404 Cannot GET`. Dual-mounted the OAuth initiator+callback routes under `/api` and `/api/v2` (parity with `/login`+`/logout`); `redirect_uri` unchanged. Issue #2 (`/static/gdpr.html` 404) is deploy-lag — API code already serves it (`thinx-core.js:433`), ships on deploy. Console pin left at `1191184b`. Deployed via `thinx-staging`. | 2026-06-19 | b92f7c76 | [260619-lgl-oauth-v2-routes-gdpr-static](./archive/quick/260619-lgl-oauth-v2-routes-gdpr-static/) |

## Cross-Project Touchpoints

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project). v1.14 touches the console submodule in Phase 22 (verify `VUE_WEB_HOSTNAME` in the live bundle), Phase 25 (classic + Vue image `default.conf` mirror the gluster headers) and Phase 26 (Vue audit/build paging UI + pointer bump). Coordinate with the console GSD project rather than treating it as fully external.
- **Gluster swarm repo** (`/mnt/glusterfs/deployment/swarm`, not in this repo) — canonical console `default.conf` (Phase 25), `thinx.yml` stack secrets (Phase 24), `thinx_influxdb` config mount (Phase 27), Swarmpit stack (Phase 28).
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.
- **`.planning/runbooks/swarm-configs/`** — snapshot trail for edge/stack configs; Phase 25 refreshes the console header snapshots, Phase 28 adds Swarmpit stack snapshots before each trim step.

## Session Continuity

**Resume file:** None

**Last session:** 2026-09-25T13:19:12.516Z

**Stopped at:** Completed 22-03-PLAN.md

**Next action:** `/gsd:discuss-phase 22` (then `/gsd:plan-phase 22`)

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown shipped and archived: 2026-06-06 (4/4 v1.11 requirements Verified across 3 phases [15–17])*
*v1.12 Inbox Drawdown shipped 2026-06-29 (4/4 v1.12 requirements Verified across 3 phases [18–20])*
*v1.13 Web Hardening (Console/Edge) shipped and archived: 2026-09-25 (2/2 v1.13 requirements Verified in 1 phase [21]; 3 operator overrides)*
*v1.14 Backlog & Hardening Sweep roadmap created: 2026-09-25 (25 requirements across 7 phases [22–28])*

## Operator Next Steps

- Review `.planning/ROADMAP.md` (v1.14 section), then start Phase 22 with `/gsd:discuss-phase 22`

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 22 P01 | 10 min | 3 tasks | 4 files |
| Phase 22 P02 | 13 min | 3 tasks | 1 files |
| Phase 22 P03 | 4min | 2 tasks | 1 files |
