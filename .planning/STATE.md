---
gsd_state_version: "1.0"
milestone: v1.14
milestone_name: Backlog & Hardening Sweep
current_phase: 28
current_phase_name: Swarmpit Upgrade & Trim
status: planning
stopped_at: Phase 26 complete, ready to plan Phase 28
last_updated: "2026-10-04T15:51:21.454Z"
last_activity: 2026-10-04
last_activity_desc: Phase 26 complete, transitioned to Phase 28
state_head: f9bd4d443f86fa73ed7ec452a01ac53f5a810f4f
progress:
  total_phases: 7
  completed_phases: 12
  total_plans: 43
  completed_plans: 43
  percent: 92
---

# STATE — THiNX Device API

**Last updated:** 2026-09-29 (Phase 23 complete; transitioned to Phase 24)

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-09-29 after Phase 24)

- **Core value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.
- **Current focus:** v1.14 Backlog & Hardening Sweep — Phase 25 Session-Bound CSRF + Console Edge Headers (ready to discuss; `CSRF_SECRET` is provisioned on `thinx_api`).
- **Production 2026-09-29 (swarm-observed):** `thinx_api` (`sha256:3beaf4f0…`, parent `fc070578`) and `thinx_worker` (1 replica, `sha256:3abe50a2…`, worker `d6ca153`) both run on **micro**. Placement floats, so always query it.
- **Production (CORRECTED 2026-09-21 by direct swarm inspection):** `thinx_api` runs on **core**, `thinx_console` on **micro**, `thinx_vue` on **core** — api and classic console are the reverse of what was recorded on 2026-09-19. Original (now stale) note follows: api + transformer run on `micro`, not `core`. Classic console image `registry.thinx.cloud:5000/thinx/console:swarm@sha256:27b1ca72` on node `core`, serving the CSP build with no inline scripts; rollback digest `sha256:1906bd5f`. `thinx-staging` publishes to the private registry, `main` to Docker Hub — one registry per branch since `3cfd0666`.
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace. In v1.14, Phase 22 (Vue hostname var), Phase 25 (image `default.conf` header mirror) and Phase 26 (Vue log paging UI) touch the console submodule; coordinate each pointer bump with the phase deploy.

## Current Position

Phase: 28 — Swarmpit Upgrade & Trim
Plan: Not started
Status: Ready to plan
Last activity: 2026-10-04 - Completed quick task 261004-om7: arduino installs every libs: entry (5d15914); nodemcu deploy requires tests (ca2ab2f) (not pushed)

Progress: [████████████████████] 15/15 plans ([█████████░] 92% of planned); 3/7 v1.14 phases complete (Phase 22 4/4, Phase 23 5/5, Phase 24 6/6 plans)

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

- 2026-09-29 — Phase 24 complete (SEC-CFG-02). The swarm secrets were added one service at a time with `docker service update --secret-add`. The env fallback is kept (removing it is SEC-CFG-03). `WORKER_SECRET` was rotated and proven by a real build, and `CSRF_SECRET` (64 hex) is mounted on `thinx_api`.
- 2026-09-29 — Review CR-01 (GitHub OAuth cross-user token delivery, pre-existing) was fixed in b09aea35 and deployed as thinx-staging 5e4ebe88. The operator confirmed GitHub and Google logins afterwards. WR-01 is deferred to SEC-CFG-03, and the operator removed WORKER_SECRET from the swarm `.env`.

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
- [Phase 22]: 22-04: Layout.vue got the per-component hostnames mixin (2 lines, template unchanged); a global Vue.mixin or populating the prototype was rejected
- [Phase 22]: 22-04: logged-in /app footer check approved 2026-09-25; CI-03 Complete; CI-01/CI-02 left for the phase re-verification
- [Phase 22]: 22-04: console submodule main (a0e86707) trails thinx-staging by a5b02467; syncing it is the user's call
- [Phase 23]: 23-01: GIT_SSH_COMMAND is one constant (accept-new, IdentitiesOnly, publickey-only, seeded file as GlobalKnownHostsFile, learned file as UserKnownHostsFile); per-attempt values reach it only via env
- [Phase 23]: 23-01: GIT_ASKPASS=false + GIT_TERMINAL_PROMPT=0 on every git run and PasswordAuthentication=no on ssh, so the forced askpass never answers a remote credential/password prompt
- [Phase 23]: 23-01: learned known_hosts at <data_root>/ssh_known_hosts used only if not symlink, not group/world-writable, owned by process uid; never repaired, falls back to seeded file
- [Phase 23]: 23-01: Redis gitkey:<owner> holds only the key filename (EX 30d) and is honoured only when === one of the owner's own key names
- [Phase 23]: 23-02: worker spawns argv jobs as spawn(BUILDER_PROGRAM, argv, {shell:false}); the job never names the program; any job carrying argv is validated as argv and refused with Invalid argv, never retried on the cmd shell path
- [Phase 23]: 23-02: worker logs redact the job secret and the --env JSON; production worker logs written before this change contain WORKER_SECRET, so rotate it after the new worker deploys
- [Phase 23]: 23-03: all builder repo-file reads/writes go through lib/thinx/safepath.js (realpath + path.relative + lstat no-symlink + O_NOFOLLOW); refusals use refuseBuild -> unsafe_repository_file
- [Phase 23]: 23-03: BUILD_PATH = buildPathFor(owner, udid, build_id) with Sanitka.strictOwner (exactly 64 [a-z0-9]) + Sanitka.udid, never stripped; invalid -> invalid_device before mkdirp and no remote job
- [Phase 23]: 23-04: remote jobs carry argv (arguments only) plus a legacy cmd byte-identical to shell-escape 0.2.0 via builder.legacyShellCommand; runRemoteShell refuses non --flag args with invalid_build_arguments after the invalid_device identity check
- [Phase 23]: 23-04: shell-escape removed (package.json + deletion-only lockfile); parent services/worker gitlink committed at 79611f6, unpushed - 23-05 must push worker main before the parent
- [Phase 24]: SecretsSweepSpec freshRequire evicts modules first loaded during a fresh require, so instances built under a swapped secret never reach later suites
- [Phase 24]: router.slack returns the profile-help redirect early when SLACK_CLIENT_SECRET is absent; SLACK_CLIENT_ID stays a plain env read
- [Phase 24]: 24-02: worker and transformer carry a local copy of lib/thinx/secrets.js (readSecret byte-identical) plus rollbarServerToken(); keep the copies in sync
- [Phase 24]: 24-02: the worker builds its only Rollbar client in worker.js; class.js and the transformer's trans.js no longer build one
- [Phase 24]: runRemoteShell refuses with worker_secret_missing (release, notify, one info line) when readSecret(WORKER_SECRET) is falsy, instead of emitting secret: null
- [Phase 24]: An empty-string GITHUB_CLIENT_SECRET or GOOGLE_OAUTH_SECRET disables that OAuth provider (readSecret truthiness); with a non-empty secret behaviour is unchanged
- [Phase 24]: globals.js builds Rollbar at most once per process from ROLLBAR_SERVER_TOKEN, then ROLLBAR_ACCESS_TOKEN (file before env in each chain)
- [Phase 24]: 24-04: thinx_api now mounts SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, ROLLBAR_SERVER_TOKEN (from ROLLBAR_ACCESS_TOKEN), GIT_KEY_PASSPHRASE and CSRF_SECRET via one --secret-add; fp12 unchanged, env kept as fallback
- [Phase 24]: 24-04: SLACK_CLIENT_SECRET left off (empty env); WORKER_SECRET stays env-only on thinx_api until the 24-05 rotation; ROLLBAR_SERVER_TOKEN secret already exists, 24-05 mounts it without re-creating
- [Phase 24]: 24-05: WORKER_SECRET rotated to a new random swarm secret mounted on thinx_api and thinx_worker together; the file wins over the old env value on both sides (env kept as D-12 fallback until SEC-CFG-03)
- [Phase 24]: 24-05: proof build dispatched by the operator via console Build (rotate-build-manual); console builds bypass the Redis queue, so the build_id is taken from the worker runArgv line
- [Phase 24]: 24-05: ROLLBAR_SERVER_TOKEN mounted on thinx_worker then thinx_transformer from the existing secret, no rotation
- [Phase 24]: 24-06: docker-swarm.yml mirrors the live phase-24 secrets (external: true, per-service lists) and the api image ${REGISTRY}/thinx/api:swarm; api keeps its unmounted COUCHDB/REDIS entries under a SEC-CFG-04 comment
- [Phase 24]: 24-06: a Swarmpit autoredeploy of thinx_api (push to thinx-staging) keeps every --secret-add mount; WORKER_SECRET fp12 still equals the worker's after the redeploy
- [Phase 25]: 25-01: establishSession queues the rotated XSRF-TOKEN before writing owner/markLogin, so a mint failure leaves no owned session
- [Phase 25]: 25-01: CSRF priming answers 503 service_unavailable without req.session and 503 csrf_key_unavailable without a key, before writing any pre-session
- [Phase 25]: 25-01: CSRF_MODE unset/empty is silent legacy; an unrecognised non-empty value warns once per process
- [Phase 25]: 25-02: classic dashboard XSRF seam only sends X-XSRF-TOKEN to urlBase or same-origin relative URLs (rejects // and /\ forms); committed in console 3c906ff, unpushed until 25-04
- [Phase 25]: 25-02: check-console-headers.js resolves proxy_hide_header with nginx inheritance; --canonical keeps the default snapshot as a compared file; extra fail-closed markers MALFORMED/DUPLICATE-HEADER/UNPARSEABLE
- [Phase 25]: 25-03: CSRF observe telemetry is a Redis hash csrf:obs:{UTC day}, field {mode}:{reason}:{METHOD} {route pattern}, 30-day expiry, counted in every mode; read with scripts/csrf-obs-counters.js
- [Phase 25]: 25-03: CSRF exemption keys only on request-local req.thx_auth (bearer|apikey) set in router.js after verified auth; header presence and validateSession never exempt (D-09)
- [Phase 25]: 25-03: Google new-user callback writes no session; login happens only via POST /login {token} (establishSession)
- [Phase 25]: 25-04: observe_start_utc 2026-09-29T17:06:30Z (thinx_api task Running); 25-06 may start at 2026-09-30T17:06:30Z
- [Phase 25]: 25-04: D-05 start-of-observe found 0 external POST /api/v2/user or /api/user/create callers (Traefik logs no User-Agent; probe traffic matched by timestamp)
- [Phase 25]: 25-04: node repair dcbbd416 logs the Google new-user owner via a local so LoggingQualityAuditSpec full_user_wrapper passes
- [Phase 25]: 25-05: Tier 1 OpenAPI operations carry the XsrfTokenHeader ref only (they also accept Bearer); login/password routes keep header+cookie refs
- [Phase 25]: 25-05: guarded-route set locked by static CsrfRouteInventorySpec (GUARDED + NOT_GUARDED with reasons); new guards add a row there
- [Phase 25]: 25-07: admin mutations run csrf.verifyCsrfToken before requireAdmin (inventory spec enforces the order); GET /api/user/rsakey/create guarded as a state-changing GET via the D-18 seam; transfer POSTs are D-11 account mutations, e-mail GETs stay open
- [Phase 26]: ensureDesignDoc reason tokens come only from statusCode, CouchDB error word, Node error code or timeout, validated; e.message never read (credentialed URL)
- [Phase 26]: loadPagingDesign accepts only _id _design/paging, so the boot upsert can never write _design/logs (D-13)
- [Phase 26]: One Audit.stringFlags filter serves read (toAuditItem, both fetch paths) and write (_buildRecord) for D-15
- [Phase 26]: Audit.fetch D-19 fallback uses first-answer-wins: a late owner-keyed view answer after VIEW_TIMEOUT_MS is dropped
- [Phase 26]: 26-03: --targets without --apply is a usage error (exit 2), mirroring --apply without --targets
- [Phase 26]: 26-03: cleanup CLI apply prints before-state aggregates then apply counters; bulk rejection is fatal (INCOMPLETE, exit 1), rerun converges
- [Phase 26]: 26-03: alog.log static guard accepts cond ? literal : literal (owner_purge.js); any other non-literal flag fails the spec
- [Phase 26]: 26-04: retention job fails closed - audit_by_date or either build view failing is LOG-RETENTION FAIL (audit_read_failed / record_read_failed) before any folder is inspected; zero build rows aborts the orphan sweep
- [Phase 26]: 26-04: --roots and --no-audit without --apply are usage errors (exit 2); the wrapper mounts a root read-write only when --apply --roots names it
- [Phase 26]: 26-04: retention schedule is /etc/cron.d/thinx-log-retention at 09:40 UTC; old job files retire to /usr/local/sbin/retired/couchdb-log-retention.{cron,sh}
- [Phase 26]: 26-05: History owns its paged rows and cursors (copies the store first page once, appends only its own pages), so Header/Notifications/DeviceDetail first-page refreshes cannot reset a paged table
- [Phase 26]: 26-05: Load more is a plain button.btn.btn-outline-secondary.btn-sm, because bootstrap-vue BButton overwrites a caller aria-disabled with null on real buttons
- [Phase 26]: 26-05: normalizeBuildItems falls back to item.udid/item.date for flat {date, udid} build items; DeviceDetail per-device history now derives from the owner's newest 100 builds (D-19), no per-device Load more
- [Phase 26]: 26-05: History initial load uses Promise.allSettled + finally so each table loads independently and Loading... always clears
- [Phase 26]: 26-02: log_paging.buildQuery merges extra first and then forces the owner bounds, direction and limit and drops skip/startkey_docid, so no option can widen the owner range
- [Phase 26]: 26-02: the paged audit/build branches are opt-in on hasOwnProperty(limit|cursor) and answer {success, response, paging} via Util.respond; the legacy no-param shape is unchanged; owner only from the session
- [Phase 26]: 26-02: Buildlog reads are side-effect free (prune removed); purgeOwner ranges over paging/builds_by_owner_time with include_docs and falls back to latest_builds {key: owner}
- [Phase 26]: 26-02: the log-paging probe FAILs when Audit.fetch used its legacy fallback; ZZ-LogPagingCouchSpec does not run in CI today (split-tests deletes ZZ*.js on node 0), see deferred-items 26-02 item 1
- [Phase 26]: 26-09: Cypress stubbed sessions stub POST /api/v2/session/token in visitApp (tokens are memory-only); cy.visitAppRoute enters via the dashboard to bypass the pre-existing App.vue deep-link redirect, which stays a recorded follow-up
- [Phase 26]: 26-09: Paged-intercept Load more requests are asserted from @alias.all filtered by cursor, not cy.wait, because the dashboard on the entry path already sent first-page requests
- [Phase 26]: 26-06: D-15 applied with reset-keys,audit-flags (operator apply-both); 44 reset keys cleared, 197 audit docs redacted, post-apply 0/0; one-way, no snapshot
- [Phase 26]: 26-06: _design/logs map sha12 is 41de3686cde2 (exact string); plan's 925f3cee0cc4 hashed a trailing newline
- [Phase 26]: Push 2 approved (D-14); Vue paging UI live via signed gitlink bump a1d65e0a; closeout commits ride the next parent push
- [Phase 26]: Earlier unsigned 26-06/26-07 docs commits pushed unchanged (hashes cited in SUMMARYs), not re-signed
- [Phase 26]: Retention apply approved as all (approved_roots=deploy,repos); daily /etc/cron.d slot 09:40 UTC, no COUCHDB_HOST override; old couchdb-log-retention job retired to /usr/local/sbin/retired/
- [Phase 26]: 26-10: dark-theme warning/danger History rows use $header-color text on a .2 cell tint (7.71-9.35:1); $text-color would be 4.44:1 and fail AA
- [Phase 27]: A6 settled on Linux: uid 65532 cannot read a root-0700 1.8 copy, so the cutover chown -R 65532:65532 is required
- [Phase 27]: Phase 27 backup p27_backup=influx-1.8-portable-20261002T1650Z (T 2026-10-02T16:50:14Z) held root-only on core and micro until 27-07 (D-02); restore and rehearsal counts equal (2379)
- [Phase 27]: The stats rename to 90d is left to the API boot ensure (adopt) in 27-06; rehearsal proved one PATCH keeps bucket id and DBRP mapping
- [Phase 27]: 27-02: InfluxDB client packages pinned exactly at 1.35.0 (T-27-SC)
- [Phase 27]: 27-02: CI test compose uses DHI influxdb:2.9.1 with tmpfs uid 65532 form; A5 fallback not needed locally (Compose v5.5.1)
- [Phase 27]: 27-02: host-side curl health waits against docker-published ports need --retry-all-errors (docker-proxy answers empty reply, exit 52)
- [Phase 27]: 27-08: the dhi.io login lives in CircleCI 'Starting Influx' (once per job, stdin), before the first DHI pull; 'Starting Support Services' no longer logs in
- [Phase 27]: 27-08: dev influxdb-setup one-shot treats 'has already been set up' as success because the dev data dir persists
- [Phase 27]: 27-08: setup one-shots create bucket stats without retention; ensureStatsBucket() at api boot alone sets 90 days
- [Phase 27]: 27-03 D-12: APIKEY_INVALID drops the rejected key (no hash: sha256(key) is THiNX's key id); LOGIN_INVALID limited to LOGIN_INVALID_REASONS or unlisted
- [Phase 27]: 27-03: scripts/influx-stats-probe.js is the read-only aggregate evidence tool for 27-05..27-07 (exit 0/1/2, INFLUX-STATS-PROBE OK|FAIL reason=<token>)
- [Phase 27]: 27-04: F-2 go-B — InfluxDB admin password random in an unmounted secret, UI via SSH tunnel, public route stays behind influx-auth
- [Phase 27]: 27-04: stats points written at ns precision with strictly increasing per-process timestamps (fix-connector after CI #15564; same-ms identical writes collapsed)
- [Phase 27]: 27-05: thinx_influxdb spec keeps dhi.io/influxdb:2.9.1 unpinned (swarm records no dhi.io digest); running task digest sha256:3d49ee8ee9a0 verified; pin by digest in 27-07 mirror
- [Phase 27]: 27-05: operator window override at ~22:41 UTC (no production traffic expected) replaced the 22:30 cut-off for this run only
- [Phase 27]: 27-06: operator answered enable-all; stats enabled on InfluxDB 2 at 2026-10-03T12:05:27Z, stats bucket 90 d with id kept, six empty upgrade buckets dropped, Chronograf retirement approved for 27-07
- [Phase 27]: 27-07: operator answered delete-all at the D-07 gate despite count_24h_DEVICE_CHECKIN=0 and an unconfirmed dashboard check; the 1.8 data, upgrade copy, Chronograf volume and /root/phase27 on both nodes are deleted, no rollback to 1.8; dashboard/check-in stays an end-of-phase UAT item
- [Phase 27]: 27-07: Chronograf retired (D-13); stack files mirror InfluxDB 2.9.1; the INFLUXDB_TOKEN mount lives only on the live thinx_api spec (gluster thinx.yml has no top-level secrets block), so a stack deploy would drop it

### Todos

- [2026-09-28] [worker] Fix worker builder service polling completion detection; remove legacy cmd shell path — [todo file](.planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md)
- [2026-09-28] [config] Split Rollbar server and client tokens — [todo file](.planning/todos/pending/2026-09-28-split-rollbar-server-and-client-tokens.md)

The v1.13-era notes below (2026-09-21) are kept for reference: each is either resolved or now a v1.14 requirement (Vue `connect-src` gap and stale runbook snapshots → SEC-CSP-04; `WEB_HOSTNAME` for `:vue` → CI-03; gluster bind-mount source of truth → SEC-CSP-03, retirement → SEC-CSP-05 future).

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

### Concerns carried from Phase 22

- ⚠️ [Phase 22] Console `test:unit` (footer hostnames guard) runs in no CI job or image build (review WR-03); its sweep/render also has blind spots (WR-04, WR-05).
- ⚠️ [Phase 22] Submodule `Test Vue console` CircleCI job has failed on every thinx-staging run since job 836 (2026-09-23) in `Install dependencies and build`; not the deploy path.
- ⚠️ [Phase 22] Review WR-01 (test job still receives the private-registry credential via context) and WR-02 (AGENTS.md publishes the ssh endpoint) remain open.

### Concerns carried from Phase 23

- ⚠️ [Phase 23] Worker lifecycle (worker todo Parts 1–3): the builder polling loop never detects completion; the worker never reconnects after a build, so with 1 replica each later build queues until the worker restarts; the reservation owner token; re-queue on `worker_busy`.
- ⚠️ [Phase 23] Legacy worker `cmd` shell path still deployed. No other deployments exist (user, 2026-09-28), so removal is unblocked (worker todo Part 2).
- ⚠️ [Phase 23] Rotate `WORKER_SECRET`: worker logs from before 23-02 contain it.
- ⚠️ [Phase 23] Build checkouts are world-writable (0o777/0o766) and have never been hardened; least-privilege follow-up. `thinx.yml` `eval` in the worker `builder` was transferred to the backlog (T-23-14).
- ⚠️ [Phase 23] Aikido IaC scan not run locally (Checkov binary missing). The platform auto-rescan is weekly and non-blocking.

### Concerns carried from Phase 24

- ⚠️ [Phase 24] **Stack deploy hazard (review WR-02):** `docker-swarm.yml` lists COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD as api secrets, which the live `thinx_api` does not mount. Because the secret file wins over env, the next `restart.sh`/`docker stack deploy` will switch the API to those values. Compare them with the current env values, or comment the three entries out, before any stack deploy.
- ⚠️ [Phase 24] WR-01 (old leaked WORKER_SECRET kept as env fallback) is deferred to SEC-CFG-03. The operator removed WORKER_SECRET from the swarm `.env` (2026-09-29). The live `thinx_api`/`thinx_worker` specs still carry it until the next stack deploy. The mounted secret file wins in the meantime.
- ⚠️ [Phase 24] Production build-queue cron loop does not dispatch (probably the `.legacy()` Redis client), and there are 3 stale `waiting` entries. See `24-secrets-sweep/deferred-items.md`. Console Build presses are unaffected.
- ⚠️ [Phase 24] Review WR-03 (worker socket has no worker auth), WR-04 (Slack bot-token precedence) and IN-01..04 are open. See `24-REVIEW-DISPOSITION.md`. CR-01 (GitHub OAuth cross-user token) was fixed and deployed in b09aea35.
- ⚠️ [Phase 24] `thinx_api` GIT_KEY_PASSPHRASE is only 5 characters long. It was not rotated in this phase.

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
| 6 | Vue console Dockerfile: run nginx as non-root (Aikido USER root finding) — console 7c6f90c | 2026-09-30 | 056d313d | — |
| 261003-s59 | CR-01 API-key auth bypass: exact constant-time key/hash match (Util.safeEqual), empty/non-string rejected, device paths fail closed (log_invalid_key), firmware ott guard, router body api_key normalized, login hash compare constant-time. Not pushed — device OTA with wrong/revoked keys stops working once deployed. | 2026-10-03 | 9d567610 | [261003-s59-fix-cr-01-api-key-substring-authenticati](./quick/261003-s59-fix-cr-01-api-key-substring-authenticati/) |
| 261003-skk | Mesh/validateSession auth bypass: validateSession trusts only router-verified Bearer/API-key identity or the session owner (no unverified owner_id+api_key body); router verifies the key against the body owner; mesh handlers and attachMesh act on the authenticated owner; CSRF on the four mesh write routes (D-21 lifted for mesh). Not pushed. PUT/DELETE /api/v2/mesh with an API key now 401 (use Bearer or v1 POST). | 2026-10-03 | 05ebbd85 | [261003-skk-fix-mesh-validatesession-auth-bypass](./quick/261003-skk-fix-mesh-validatesession-auth-bypass/) |
| 261003-t29 | Device udid ownership (IDOR): Device#fetchOwned/filterOwned/isOwnedBy and a withOwnedDevice gate on all 10 udid-keyed device routes (owner from authenticated identity only; foreign = unknown = 200 no_such_device); push filtered to owned udids; edit cannot write owner/previous_owner; transfer request requires sender ownership, accept moves only stored udids, migrate_device re-checks owner. Not pushed. | 2026-10-03 | 5ef392e6 | [261003-t29-fix-device-udid-ownership-check](./quick/261003-t29-fix-device-udid-ownership-check/) |
| 261003-tv5 | /device/register owner binding: Device#resolveRegistration — key owner's own udid checks in; unknown udid (404) kept; foreign/malformed udid gets a fresh uuid; MAC fallback filtered to the key owner's devices (Device.isOwnedBy), else new device for the key owner; MQTT credentials only for the resolved udid. Not pushed. | 2026-10-03 | c9305716 | [261003-tv5-fix-device-register-mac-fallback-owner-b](./quick/261003-tv5-fix-device-register-mac-fallback-owner-b/) |
| 261003-u86 | Transfer carries the device's API key: atomic Redis EVAL moves the key with the owner change; refuses shared/unidentifiable/Default-MQTT keys at request and accept (apikey_shared, apikey_not_identified, apikey_ambiguous, apikey_owner_mqtt_key, apikey_check_failed, apikey_move_failed, device_move_failed); seamless continuity — old owner id + moved key + own udid redirects to the new owner (never consumed); check-ins record lastkey. Not pushed. | 2026-10-03 | 16bde50a | [261003-u86-device-transfer-carries-its-api-key](./quick/261003-u86-device-transfer-carries-its-api-key/) |
| 261003-v05 | WebSocket log tail: non-JSON frame no longer crashes the API (live crash); sockets bound to the verified session owner (else close 1008); logtail only for the owner's own builds, no fs side effects on miss; dead HTTP /api/user/logs/tail and /api/v2/logs/tail removed. Not pushed. | 2026-10-03 | 51c5b100 | [261003-v05-fix-logs-tail-handler](./quick/261003-v05-fix-logs-tail-handler/) |
| 261003-v9x | OTT owner binding: closes live cross-owner firmware read (traversal udid in stored OTT); tokens 32 random bytes, SET EX 86400, TTL capped at 3600 s on first redemption, never extended; ott_request owner from body + exact verify + fetchOwned; redemption re-checks owner/udid; tokens no longer logged. JSON-vs-binary redemption left for operator. Not pushed. | 2026-10-03 | 6c0ae6b2 | [261003-v9x-fix-ott-request-owner](./quick/261003-v9x-fix-ott-request-owner/) |
| 261003-v9d | /device/addpush owner-bound push token | 2026-10-03 | 81cc0fb6 | [261003-v9d-fix-device-addpush-key-check](./quick/261003-v9d-fix-device-addpush-key-check/) |
| 261003-vbg | MQTT status owner check with transfer binding | 2026-10-03 | 84f23c20 | [261003-vbg-fix-mqtt-status-owner-check](./quick/261003-vbg-fix-mqtt-status-owner-check/) |
| 261003-x9z | Google OAuth state bound to the initiating browser; pentest XALG-1..4 triage | 2026-10-03 | 971284b8 | [261003-x9z-bind-google-oauth-state-to-the-initiatin](./quick/261003-x9z-bind-google-oauth-state-to-the-initiatin/) |
| 261003-vn3 | messenger per-owner websocket routing | 2026-10-03 | 63716bae | [261003-vn3-fix-messenger-process-wide-websocket](./quick/261003-vn3-fix-messenger-process-wide-websocket/) |
| 261003-w0c | MQTT handler never throws; device writes gated (THINX_MQTT_DEVICE_WRITES off) | 2026-10-03 | d46bb756 | [261003-w0c-fix-mqtt-forwardnonnotification-crash](./quick/261003-w0c-fix-mqtt-forwardnonnotification-crash/) |
| 261004-0es | classic console escapes device-supplied toast fields (console e43a94d) | 2026-10-03 | 7f6ac1cc | [261004-0es-escape-device-supplied-notification-fiel](./quick/261004-0es-escape-device-supplied-notification-fiel/) |
| 261003-vd4 | firmware loads only the verified owner's device; device-side todo closed | 2026-10-03 | 561bc65e | [261003-vd4-fix-firmware-owner-compare](./quick/261003-vd4-fix-firmware-owner-compare/) |
| 261003-vep | builder embeds the device's own API key; create() refuses duplicates | 2026-10-03 | 8ea88930 | [261003-vep-fix-builder-masked-api-key](./quick/261003-vep-fix-builder-masked-api-key/) |
| 261003-w13 | API key list without cleartext keys; Default MQTT key lookup arity fix | 2026-10-03 | 7e3c8645 | [261003-w13-fix-api-key-cleartext-exposure](./quick/261003-w13-fix-api-key-cleartext-exposure/) |
| 261004-22b | OTT redemption serves the firmware binary; specs stop printing key material | 2026-10-03 | 40a5bd60 | [261004-22b-ott-redemption-serves-the-firmware-binar](./quick/261004-22b-ott-redemption-serves-the-firmware-binar/) |
| 261004-22d | Vue one-time API key dialog reads api_key (console 7d8098e) | 2026-10-03 | 2836f579 | [261004-22d-vue-console-copy-key-dialog-reads-api-ke](./quick/261004-22d-vue-console-copy-key-dialog-reads-api-ke/) |
| 261004-25u | MQTT device writes safe to enable (string status, stale-LWT guard, no double registration) | 2026-10-03 | 71c45c57 | [261004-25u-mqtt-device-writes-safe-to-enable](./quick/261004-25u-mqtt-device-writes-safe-to-enable/) |
| 261004-l7q | transfer accept/decline bound to the recipient; revoke/partial/mig_sources fixes | 2026-10-04 | 656d3d3b | [261004-l7q-transfer-accept-and-decline-bound-to-the](./quick/261004-l7q-transfer-accept-and-decline-bound-to-the/) |
| 261004-liv | firmware lookup iterates extension values; version parsing fixed; fail-closed serving | 2026-10-04 | 64ee0d79 | [261004-liv-firmware-lookup-loops-iterate-values](./quick/261004-liv-firmware-lookup-loops-iterate-values/) |
| 261004-l8k | device document log leaks and deploy-path udid guard; no re-offer without env_hash | 2026-10-04 | 19c8371b | [261004-l8k-device-document-and-udid-hardening](./quick/261004-l8k-device-document-and-udid-hardening/) |
| 261004-lps | worker build completion detection and platformio env selection (worker cd2ce61) | 2026-10-04 | b04a5bdc | [261004-lps-worker-build-completion-and-platformio-e](./quick/261004-lps-worker-build-completion-and-platformio-e/) |
| 261004-m46 | worker never evals repository thinx.yml (T-23-14; worker 192521b) | 2026-10-04 | 08270caf | [261004-m46-worker-never-evals-repository-thinx-yml](./quick/261004-m46-worker-never-evals-repository-thinx-yml/) |
| 261004-l9f | failed Bearer verification answers 401 | 2026-10-04 | 85a25236 | [261004-l9f-failed-bearer-verification-answers-401](./quick/261004-l9f-failed-bearer-verification-answers-401/) |
| 261004-n5a | build containers never get docker.sock (worker 27fff67) | 2026-10-04 | 345b3bab | [261004-n5a-build-containers-never-get-docker-sock](./quick/261004-n5a-build-containers-never-get-docker-sock/) |
| 261004-n65 | builder images never eval thinx.yml (arduino 7841df0, platformio 5cdabaf, nodemcu 711aa42, micropython c2487e6) | 2026-10-04 | 37a60e85 | [261004-n65-builder-images-never-eval-thinx-yml](./quick/261004-n65-builder-images-never-eval-thinx-yml/) |
| 261004-om7 | arduino installs every libs: entry (5d15914); nodemcu deploy requires tests (ca2ab2f) | 2026-10-04 | f9bd4d44 | [261004-om7-arduino-installs-all-libs-and-nodemcu-de](./quick/261004-om7-arduino-installs-all-libs-and-nodemcu-de/) |

## Cross-Project Touchpoints

- **`services/console/.planning/`** — Vue console GSD workspace (sibling project). v1.14 touches the console submodule in Phase 22 (verify `VUE_WEB_HOSTNAME` in the live bundle), Phase 25 (classic + Vue image `default.conf` mirror the gluster headers) and Phase 26 (Vue audit/build paging UI + pointer bump). Coordinate with the console GSD project rather than treating it as fully external.
- **Gluster swarm repo** (`/mnt/glusterfs/deployment/swarm`, not in this repo) — canonical console `default.conf` (Phase 25), `thinx.yml` stack secrets (Phase 24), `thinx_influxdb` config mount (Phase 27), Swarmpit stack (Phase 28).
- **`AGENTS.md`** (parent root) — ssh details, deploy flow, dependency locks (chai-http v4 hold). Consult before any phase touches deploy config or `package.json`.
- **`.planning/runbooks/swarm-configs/`** — snapshot trail for edge/stack configs; Phase 25 refreshes the console header snapshots, Phase 28 adds Swarmpit stack snapshots before each trim step.

## Session Continuity

**Resume file:** None (quick-task queue complete)

**Last session:** 2026-10-04

**Stopped at:** Quick-task chain complete and pushed: v9d, vbg, x9z (pentest XALG-3/4 Google login CSRF), vn3, w0c, 0es (console toast escaping), vd4, vep, w13. CORS_ENFORCE=true live on thinx_api since 2026-10-03 ~21:56Z (pentest triage: .planning/quick/261003-x9z-*/PENTEST-TRIAGE.md).

**Next action:** verify CircleCI + rollout of thinx_api and classic console; operator post-deploy checks (classic console build log + actionable toast, Google login in Vue console, device check-ins). Open decisions: OTT redemption JSON-vs-binary todo; transfer redirect scope for OTT/addpush (vd4 SUMMARY); apikey hash-as-credential todo.

---
*v1.0 GA backend closures shipped and archived: 2026-05-27 (4/4 v1 requirements Verified)*
*v1.9 Backend Hygiene & Posture shipped and archived: 2026-06-04 (13/13 v1.9 requirements Verified across 7 phases)*
*v1.10 Operational Closures shipped and archived: 2026-06-05 (5/5 v1.10 requirements Verified across 3 phases [12–14])*
*v1.11 Backlog Drawdown shipped and archived: 2026-06-06 (4/4 v1.11 requirements Verified across 3 phases [15–17])*
*v1.12 Inbox Drawdown shipped 2026-06-29 (4/4 v1.12 requirements Verified across 3 phases [18–20])*
*v1.13 Web Hardening (Console/Edge) shipped and archived: 2026-09-25 (2/2 v1.13 requirements Verified in 1 phase [21]; 3 operator overrides)*
*v1.14 Backlog & Hardening Sweep roadmap created: 2026-09-25 (25 requirements across 7 phases [22–28])*

## Operator Next Steps

- Phase 25 (Session-Bound CSRF + Console Edge Headers) is next in the autonomous run
- Before any `restart.sh`/stack deploy, resolve review WR-02: the yml's COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD api mounts would take effect
- Run the worker todo (polling fix + legacy `cmd` removal + lifecycle) and the Rollbar token split as `/gsd-quick` tasks in one worker deploy window
- Push the pending `.planning` docs commits on `thinx-staging` when convenient (triggers CircleCI + PR CodeQL)
- Merge PR #569 when ready, then record the CodeQL main-push row (CI-01 follow-up)
- Decide whether to sync `thinx-cloud/console` `main` to its `thinx-staging` (trails by the 22-04 fix commit `a5b0246`)

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 22 P01 | 10 min | 3 tasks | 4 files |
| Phase 22 P02 | 13 min | 3 tasks | 1 files |
| Phase 22 P03 | 4min | 2 tasks | 1 files |
| Phase 22 P04 | 19min | 3 tasks | 6 files |
| Phase 23 P01 | 16 min | 3 tasks | 6 files |
| Phase 23 P02 | 7min | 2 tasks | 2 files |
| Phase 23 P03 | 10 min | 3 tasks | 8 files |
| Phase 23 P04 | 5min | 2 tasks | 7 files |
| Phase 24 P01 | 7 min | 2 tasks | 7 files |
| Phase 24 P02 | 7 min | 3 tasks | 10 files |
| Phase 24 P03 | 9 min | 3 tasks | 10 files |
| Phase 24 P04 | 51 min | 3 tasks | 2 files |
| Phase 24 P05 | 42 min | 3 tasks | 1 files |
| Phase 24 P06 | 9 min | 3 tasks | 1 files |
| Phase 25 P01 | 12 min | 2 tasks | 6 files |
| Phase 25 P02 | 7min | 2 tasks | 6 files |
| Phase 25 P03 | 12min | 3 tasks | 9 files |
| Phase 25 P04 | 27 min | 3 tasks | 3 files |
| Phase 25 P05 | 15 min | 2 tasks | 6 files |
| Phase 25 P07 | 6min | 3 tasks | 10 files |
| Phase 26 P01 | 8 min | 2 tasks | 8 files |
| Phase 26 P03 | 7min | 2 tasks | 5 files |
| Phase 26 P04 | 14 min | 3 tasks | 6 files |
| Phase 26 P05 | 10min | 3 tasks | 7 files |
| Phase 26 P02 | 17 min | 3 tasks | 10 files |
| Phase 26 P09 | 9min | 2 tasks | 7 files |
| Phase 26 P06 | 35min | 3 tasks | 1 files |
| Phase 26 P07 | 20 min | 3 tasks | 3 files |
| Phase 26 P08 | 21 min | 3 tasks | 1 files |
| Phase 26 P10 | 15min | 3 tasks | 4 files |
| Phase 27 P01 | 8 min | 2 tasks | 2 files |
| Phase 27 P02 | 15 min | 2 tasks | 8 files |
| Phase 27 P08 | 6min | 2 tasks | 3 files |
| Phase 27 P03 | 11 min | 3 tasks | 9 files |
| Phase 27 P04 | 1h 32m | 3 tasks | 3 files |
| Phase 27 P05 | 7 min | 2 tasks | 1 files |
| Phase 27 P06 | 5min | 3 tasks | 1 files |
| Phase 27 P07 | 74min | 3 tasks | 2 files |
