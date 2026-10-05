# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- ✅ **v1.10 — Operational Closures** — Phases 12–14 (shipped 2026-06-05)
- ✅ **v1.11 — Backlog Drawdown** — Phases 15–17 (shipped 2026-06-06)
- ✅ **v1.12 — Inbox Drawdown** — Phases 18–20 (shipped 2026-06-29)
- ✅ **v1.13 — Web Hardening (Console/Edge)** — Phase 21 (shipped 2026-09-25)
- 🚧 **v1.14 — Backlog & Hardening Sweep** — Phases 22–28 (in progress)

## Phases

<details>
<summary>✅ v1.0 — v1 GA Backend Closures (Phases 1–4) — SHIPPED 2026-05-27</summary>

See `.planning/MILESTONES.md`. 4/4 v1 requirements (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01).

</details>

<details>
<summary>✅ v1.9 — Backend Hygiene & Posture (Phases 5–11) — SHIPPED 2026-06-04</summary>

See `.planning/milestones/v1.9-ROADMAP.md`. 13/13 v1.9 requirements across 7 phases.

</details>

<details>
<summary>✅ v1.10 — Operational Closures (Phases 12–14) — SHIPPED 2026-06-05</summary>

See `.planning/milestones/v1.10-ROADMAP.md`. 5/5 v1.10 requirements.

- [x] Phase 12: Code-side Closure Helpers (3/3 plans) — TEST-WS-01 + OBS-01 + OBS-02
- [x] Phase 13: SEC-WS-01 Edge Handshake Closure / OPS-EXEC-01 (1/1 plan)
- [x] Phase 14: SEC-PII-02 managed_logs Production Sweep Closure / OPS-EXEC-02 (1/1 plan)

</details>

<details>
<summary>✅ v1.11 — Backlog Drawdown (Phases 15–17) — SHIPPED 2026-06-06</summary>

See `.planning/milestones/v1.11-ROADMAP.md`. 4/4 v1.11 requirements (REFACTOR-06, REFACTOR-07, SEC-DEP-03, OPS-EXEC-03). Audit: `tech_debt` (deferred items in `.planning/MILESTONES.md` + STATE.md).

- [x] Phase 15: fs-finder Removal (4/4 plans) — REFACTOR-06 + REFACTOR-07; native `lib/thinx/finder.js` helper, `fs-finder` dropped from deps
- [x] Phase 16: Dependabot Triage (1/1 plan) — SEC-DEP-03; 3 overrides, runtime tree 0 high/0 moderate, uuid #194 deferred
- [x] Phase 17: Influx Fix Production Deploy (1/1 plan) — OPS-EXEC-03; discrepancy branch (fix already live, verified)

</details>

<details>
<summary>✅ v1.12 — Inbox Drawdown (Phases 18–20) — SHIPPED 2026-06-29</summary>

See `.planning/MILESTONES.md` and `.planning/milestones/v1.12-REQUIREMENTS.md` (no separate roadmap archive was written for v1.12). 4/4 v1.12 requirements (SEC-PII-03, GH-01, GH-02, SEC-CFG-01).

- [x] Phase 18: Complete GDPR Purge (4/4 plans) — SEC-PII-03
- [x] Phase 19: Per-user GitHub Token Backend — GH-01 + GH-02
- [x] Phase 20: Docker Secrets Helper — SEC-CFG-01

</details>

<details>
<summary>✅ v1.13 — Web Hardening (Console/Edge) (Phase 21) — SHIPPED 2026-09-25</summary>

See `.planning/milestones/v1.13-ROADMAP.md`. 2/2 v1.13 requirements (SEC-CSP-01, SEC-CSRF-01); verification `passed` with 3 operator-accepted overrides (HawkScan removed; gluster-mounted CSP is the production source of truth).

- [x] Phase 21: CSP Wildcard Removal + Anti-CSRF Token (5/5 plans) — completed 2026-09-25

</details>

### 🚧 v1.14 — Backlog & Hardening Sweep

**Milestone Goal:** Close the v1.13 security follow-ups and the open ops/code findings, and ship three long-standing backlog items: Vue Console log paging, InfluxDB 2 with finite retention, and a Swarmpit upgrade and trim. Throughout, no legacy-console route breaks and push → CI → autoredeploy stays under 5 minutes.

- [x] **Phase 22: CI & SAST Baseline** - CodeQL on the branches production code arrives on, retrying registry logins, Vue console hostname verified in the live bundle (verify-first) (completed 2026-09-25)
- [x] **Phase 23: Build-Pipeline Sink Hardening** - git and remote-builder commands run via argv; repo-controlled file access is contained and refuses symlinks (completed 2026-09-29)
- [x] **Phase 24: Secrets Sweep** - the 9 `lib/` credentials plus a new `CSRF_SECRET` load from swarm secrets, provisioned one service at a time (completed 2026-09-29)
- [x] **Phase 25: Session-Bound CSRF + Console Edge Headers** - HMAC session-bound CSRF token with login rotation, WR-04 and mutation routes covered, hardened console headers mirrored into the images (completed 2026-10-01)
- [x] **Phase 26: Vue Console Log Paging** - opt-in cursor paging for audit and build logs in the Vue Console; legacy 200-item path kept (completed 2026-10-03)
- [x] **Phase 27: InfluxDB 2 Upgrade** - `thinx_influxdb` 1.8 → 2 from a verified backup, `influx.js` on v2, 90-day bucket retention on `stats` (completed 2026-10-03)
- [ ] **Phase 28: Swarmpit Upgrade & Trim** - stats/`swarmpit_influxdb` removed, then Swarmpit 1.10 (`swarmpit_agent` kept), each step gated by a push-to-redeploy test

**Ordering (hard edges):** 22 → 23 (CodeQL before/after evidence for the sink fixes) → 24 (symlink containment closes before `/run/secrets` grows; git.js already passes `GIT_KEY_PASSPHRASE` explicitly) → 25 (`CSRF_SECRET` exists, so the HMAC key is never random). 26 follows 25 for sequencing only. 27 reuses the Phase 24 secret pattern and runs after the other code deploys because its storage upgrade is irreversible. 28 goes last, in its own maintenance window: every earlier phase deploys through Swarmpit autoredeploy, and 27 has already moved `thinx_influxdb` off the `swarmpit/influxdb.conf` bind mount.

**Granularity note (coarse):** Seven phases for 25 requirements is more than coarse usually produces. The boundaries follow deploy surfaces and risk windows that should not share a deploy: CI only (22), backend image (23), swarm secrets (24), backend plus both consoles plus the gluster edge (25), backend plus Vue submodule (26), InfluxDB storage (27) and the deploy orchestrator itself (28). Phase 24 has one requirement but is a production secret migration with its own verification pass. If fewer phases are wanted, it is the one to fold into 23.

## Phase Details

### Phase 22: CI & SAST Baseline

**Goal**: CI gives trustworthy signals before any code changes land. CodeQL scans the branches production code arrives on, private-registry logins stop flaking, and the Vue console's "THiNX Console" links point at the Vue console itself.
**Depends on**: Nothing (first v1.14 phase; follows Phase 21)
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):

  1. A push to `thinx-staging` or `main` and a PR to `main` each produce a CodeQL `javascript-typescript` analysis (`github/codeql-action@v4`, `actions/checkout@v7`, `build-mode: none`) visible in the repo's code-scanning results. The check is not required for merge, and GitHub default setup stays off.
  2. `.circleci/config.yml` has no direct `docker login registry.thinx.cloud:5000`. Every login, including the test job at `~767`, goes through the retrying `registry-login` command, and none passes the password as a command-line argument.
  3. In the live Vue bundle, the "THiNX Console" links (layout, login, password reset) point at the Vue console host. `VUE_WEB_HOSTNAME` is traced from the CircleCI project variable through the build arg into the served bundle.
  4. `docker-swarm.yml` no longer sets the dead runtime `VUE_APP_CONSOLE_HOSTNAME` environment variable.

**Plans**: 4/4 plans executed

Plans:
**Wave 1**

- [x] 22-01-PLAN.md — CodeQL workflow rewrite proven on a thinx-staging push (tracer), raw test-job registry login removed (CI-02), CodeQL security-extended baseline recorded (D-07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-02-PLAN.md — Vue console link host traced from the CircleCI var to the rendered href; dead `VUE_APP_CONSOLE_HOSTNAME` removed from repo, gluster and the live `thinx_console` service (gated)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 22-03-PLAN.md — PR thinx-staging → main opened (gated), PR CodeQL run and non-required status proven, evidence recorded (no merge)

**Wave 4** *(gap closure, blocked on Wave 3 completion)*

- [x] 22-04-PLAN.md — Layout footer gets the hostnames mixin (the one broken CI-03 link) with a plain-node footer test, shipped submodule → parent pointer → thinx-staging, proven in the served bundle and a logged-in check; CI-03 marked complete only after approval

**Notes**: Verify-first. CI-02 (`be376db9`) and CI-03 (`3f2f6da4`) are probably discrepancy branches, so the phase opens by checking current state before writing code. The research-era option to switch CI compose to `influxdb:1.8` is dropped: CI stays on `dhi.io/influxdb:2`, which matches the Phase 27 target.

### Phase 23: Build-Pipeline Sink Hardening

**Goal**: A hostile or careless firmware repository can no longer inject shell commands or read or write files outside its build directory, and private-repository builds keep working.
**Depends on**: Phase 22 (the CodeQL baseline gives before/after evidence for the sink fixes)
**Requirements**: SEC-EXEC-01, SEC-EXEC-02, SEC-PATH-01, SEC-PATH-02
**Success Criteria** (what must be TRUE):

  1. A private-repository firmware build succeeds in production after deploy. `lib/thinx/git.js` runs `execFileSync("git", argv)` with no shell string and no `ssh-agent sh -c` wrapper (constant `GIT_SSH_COMMAND` + askpass, `GIT_KEY_PASSPHRASE` passed explicitly). A failing fetch still reports `git_fetch_failed` and a successful one does not.
  2. The remote-builder command (`builder.js:~944`) runs via argv, and `shell-escape` is gone from `package.json` and the lockfile.
  3. A repository whose `thinx.yml`, or any other file the builder reads, is a symlink pointing outside the build directory is refused on read and on the `thinx.yml` write-back. Specs cover both the symlink case and a prefix-sibling path (`…/abc` vs `…/abc-evil`).
  4. A `device.owner` or `device.udid` containing `../` or other path characters cannot move `BUILD_PATH` outside the owner's build root.
  5. Firmware repositories are cloned with `core.symlinks=false`. A rescan (CodeQL from Phase 22 plus the local Aikido scan) no longer flags the `git.js` `execSync` sink or the builder `readFileSync`/`lstatSync` sinks; any remaining hit is recorded as an app-owned false positive with a reason.

**Plans**: 5/5 plans complete

Plans:
**Wave 1**
- [x] 23-01-PLAN.md — git.js private-fetch contract: one argv clone/pull routine for every caller, constant GIT_SSH_COMMAND + per-attempt askpass, core.symlinks=false, persistent learned known_hosts, Redis last-good key (wave 1)
- [x] 23-02-PLAN.md — worker (submodule): argv jobs spawned without a shell from a constant program, legacy cmd kept with a warning (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 23-03-PLAN.md — safepath containment for every repo-controlled read/write (thinx.yml, credential write-back), strict owner/udid and contained BUILD_PATH (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 23-04-PLAN.md — API job carries argv plus byte-identical legacy cmd, shell-escape removed, worker pointer bump (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 23-05-PLAN.md — ordered push and rollout, SAST delta doc, D-14 private-repo production proof (wave 4, checkpoint)

**Notes**: git.js goes first on the same branch because it redefines the `prefetchPrivate` contract that builder.js calls; builder.js follows (the Phase 7 single-branch lesson). Lock current behaviour with specs (a `file://` bare repo, injection strings, a missing git binary) before refactoring. `GIT_KEY_PASSPHRASE` comes from `readSecret()`, which works on the env fallback before Phase 24 provisions the secret.

### Phase 24: Secrets Sweep

**Goal**: Every credential the API reads in `lib/` can come from a Docker swarm secret in production, the migration causes no outage, and `CSRF_SECRET` is in place for Phase 25.
**Depends on**: Phase 23 (symlink containment closes before `/run/secrets` holds more; git.js already passes `GIT_KEY_PASSPHRASE` explicitly)
**Requirements**: SEC-CFG-02
**Success Criteria** (what must be TRUE):

  1. All 9 credentials read in `lib/` (`SLACK_BOT_TOKEN`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK`, `GITHUB_CLIENT_SECRET`, `GOOGLE_OAUTH_SECRET`, `MAILGUN_API_KEY`, `ROLLBAR_ACCESS_TOKEN`, `WORKER_SECRET`, `GIT_KEY_PASSPHRASE`) load through `readSecret()` with the env fallback kept. When both the secret file and the env var are absent, the integration stays off instead of initialising with `null`, and specs cover that case.
  2. In production each credential is mounted as a swarm secret, added one service at a time with `docker service update --secret-add` (never `restart.sh` or `stack deploy`). After each step, Slack notifications, GitHub and Google OAuth login, Mailgun mail, Rollbar reporting and worker authentication still work.
  3. A `CSRF_SECRET` swarm secret exists and `thinx_api` can read it at `/run/secrets/CSRF_SECRET`.
  4. `docker-swarm.yml` mirrors the live stack's secrets and service references, and its stale api image reference is corrected.

**Plans**: 6/6 plans complete

Plans:
**Wave 1**
- [x] 24-01-PLAN.md — lib sweep A: Mailgun (tracer, owner/transfer) and the Slack bot token, OAuth client secret and webhook through readSecret, with the SecretsSweepSpec harness (wave 1)
- [x] 24-02-PLAN.md — worker and transformer (submodules): local readSecret + rollbarServerToken(), WORKER_SECRET file-wins in validateJob, one Rollbar init, dead inits removed (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 24-03-PLAN.md — lib sweep B: WORKER_SECRET into the job with a worker_secret_missing refusal (tracer), GitHub/Google OAuth, Rollbar server-token chain, rsakey passphrase (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 24-04-PLAN.md — approval first, then pointer bump and ordered push, code live on env fallback, then the thinx_api secrets (7 carried over + CSRF_SECRET) with D-11 checks (wave 3, checkpoint)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 24-05-PLAN.md — gated WORKER_SECRET rotation on thinx_api + thinx_worker with a real-build proof, then ROLLBAR_SERVER_TOKEN on thinx_transformer (wave 4, checkpoint)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 24-06-PLAN.md — docker-swarm.yml mirrors the live secrets and api image, mounts proven across an approved routine redeploy, final D-11 sweep and the human OAuth login check (wave 5, checkpoint)

**Notes**: The env fallback stays (user decision); removing env values is SEC-CFG-03. Never sweep non-secret toggles such as `CSRF_ENFORCE`. `readSecret()` returns `null`, not `undefined`, so `typeof` guards must become truthiness guards.

### Phase 25: Session-Bound CSRF + Console Edge Headers

**Goal**: Both consoles use a CSRF token bound to the session, so a sibling subdomain can no longer plant one. Cookie-authenticated account mutations are covered too, and both console hosts serve one hardened header set that the image configs mirror. Nobody gets locked out along the way.
**Depends on**: Phase 24 (`CSRF_SECRET` is provisioned, so the HMAC key is never random)
**Requirements**: SEC-CSRF-02, SEC-CSRF-03, SEC-CSRF-04, SEC-CSRF-05, SEC-CSRF-06, SEC-CSP-03, SEC-CSP-04
**Success Criteria** (what must be TRUE):

  1. With `CSRF_MODE=signed` and enforcement on, a cold login works on both consoles by password, Google and GitHub. The priming GET creates a short-lived pre-session and re-mints a stale token instead of echoing it. A token minted for another session, or planted as a cookie from a sibling `.thinx.cloud` subdomain, gets 403 `csrf_token_invalid`.
  2. Every interactive login (password, token login, Google, GitHub) changes the session id and sets a fresh `XSRF-TOKEN` in the login response. The per-request Bearer bridge does not regenerate the session, and logout clears the token. A forced `thinx_api` redeploy mid-session causes no 403s and no logouts. Switching to `CSRF_MODE=legacy` restores v1.13 behaviour without touching `CSRF_ENFORCE`.
  3. `POST /api/v2/user` without a primed token returns 403 `csrf_token_invalid`, and OpenAPI documents the priming contract. Cookie-authenticated `DELETE /api/v2/user`, `POST /api/user/delete`, `/api/gdpr/revoke` and `/api/v2/profile` also need the token; the same calls made with Bearer or API-key auth still succeed without one.
  4. Under enforcement, the classic console's register, forgot-password and reset-confirm flows complete end to end.
  5. Each console host returns exactly one CSP header, plus `Referrer-Policy`, `Permissions-Policy` and `X-Permitted-Cross-Domain-Policies: none`, all from the gluster `default.conf`. A normalising parity script confirms that both image `default.conf` files and the `.planning/runbooks/swarm-configs/` snapshots match it.

**Plans**: 10/10 plans complete

Plans:
**Wave 1**
- [x] 25-01-PLAN.md — session-bound token core: CSRF_MODE legacy/observe/signed, module-scope key (CSRF_SECRET → HKDF → fail closed), 15-min pre-session priming, login regenerate + rotation via establishSession, logout clear (tracer: local prime → login → rotated token flow)
- [x] 25-02-PLAN.md — console prep: classic dashboard `$.ajaxSetup` XSRF seam (console submodule, D-18) and the normalising header parity script with node:test (not yet in CI)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 25-03-PLAN.md — observe telemetry (reason codes + Redis `csrf:obs` counters), lazy re-mint, verified-auth `req.thx_auth` exemption, Google callback session write removed, CI enforce spec, runbook CSRF_MODE section, live probe and counter scripts

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 25-04-PLAN.md — production: D-05 log check → seam + code shipped in legacy mode → `CSRF_MODE=observe` (starts the ≥24 h window) (checkpoint)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 25-05-PLAN.md — WR-04 and SEC-CSRF-05 account-route guards, OpenAPI priming contract, route inventory and CI guard specs (code only, written during observe)
- [x] 25-06-PLAN.md — production: ≥24 h observe review, forced `thinx_api` redeploy mid-session, operator cold logins on both consoles (checkpoint)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 25-07-PLAN.md — D-11 account routes (API keys, deploy keys, env, GitHub token, admin, transfer), OpenAPI refs, runbook route inventory (code only)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 25-08-PLAN.md — production: flip to `CSRF_MODE=signed`, D-05 re-check, push and prove the account-route guards (checkpoint)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 25-09-PLAN.md — production: gluster header hardening with one CSP on proxied `/api/*`, both consoles forced, image mirrors + snapshots + parity step in CI (checkpoint)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 25-10-PLAN.md — combined two-console verification pass under enforcement and requirement closeout (checkpoint)

**Notes**: Highest-risk phase. Plan order: check production logs for external `POST /api/v2/user` callers → deploy WR-06 fail-open with reason-coded telemetry → observe → verify cold logins on both consoles and both OAuth paths → enforce → WR-04 and the mutation routes. For headers, harden the gluster file first, then mirror it into the images; after any gluster edit, `service update --force` both console services (a single-file bind mount pins the inode). The wire contract (`XSRF-TOKEN` / `X-XSRF-TOKEN` / `…/csrf-token` / `csrf_token_invalid`) stays frozen, so consoles need no CSRF code change. Finish with one combined two-console verification pass.
**Research**: Needed at planning: the pre-auth binding and pre-session TTL, rotation seams across the login sites, and classic console behaviour after rotation (the classic console has no retry).

### Phase 26: Vue Console Log Paging

**Goal**: A Vue Console user can page through their whole audit log and build history, while the Legacy console keeps its 200-item behaviour.
**Depends on**: Phase 25 (sequencing only, no shared files; it keeps a paging regression from being mistaken for a CSRF lockout)
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04
**Success Criteria** (what must be TRUE):

  1. When the API boots against a database that already holds an older design-doc revision, the new paging design doc is created or updated (rev-aware). Its views answer in production without `missing_named_view`, and `_design/logs` is unchanged.
  2. The Legacy console's no-parameter audit-log call keeps its response shape and returns at most 200 items. Those items are now the caller's own newest entries with their real `flags`, and none belong to another tenant.
  3. In the Vue Console, a user with more than 200 audit entries can load entries past the 200th. The response keeps `response` as an array and adds `paging: {limit, has_more, next_cursor}`. The cursor carries no owner id, and replaying it as another owner never returns the first owner's entries.
  4. In the Vue Console, a user can page through the build list, and paging never prunes build records.
  5. The console submodule pointer that carries the Vue paging UI is bumped in this repo and deployed to the Vue console host.

**Plans**: 10/10 plans complete

Plans:
**Wave 1**

- [x] 26-01-PLAN.md — `_design/paging` docs upserted rev-aware at boot; legacy audit call owner-keyed with string-only flags and a bounded fallback (LOG-01, LOG-02)
- [x] 26-03-PLAN.md — D-15 code: audit writers stop logging credential objects; aggregate-only cleanup script (dry run by default)
- [x] 26-04-PLAN.md — Retention job for audit and builds on two roots (containment gates, dry run, folder-before-record), host wrapper, runbook
- [x] 26-05-PLAN.md — Vue History Load more per table, first-page stores, parseResult keeps paging (plain-node unit proof)

**Wave 2** *(blocked on 26-01 and 26-05)*

- [x] 26-02-PLAN.md — Opt-in cursor paging for audit and builds, side-effect-free build list, GDPR purge over both shapes, production probe, CI CouchDB spec (LOG-03, LOG-04)
- [x] 26-09-PLAN.md — Cypress harness repaired (session-token stub, in-app route entry); paged fixtures and History browser specs for UI-SPEC assertions 1–7

**Wave 3** *(blocked on Waves 1–2)*

- [x] 26-06-PLAN.md — Push 1 (backend), index warm-up timed, production probe, D-15 dry run → operator decision → one-way cleanup

**Wave 4** *(blocked on 26-05, 26-06, 26-09)*

- [x] 26-07-PLAN.md — Push 2 rehearsal → operator approval → Vue UI and console pointer deployed; LOG-01..04 marked complete

**Wave 5** *(blocked on 26-07)*

- [x] 26-08-PLAN.md — Retention dry run per root → operator decision → real run, daily /etc/cron.d schedule (09:40 UTC), broken audit job retired

**Gap closure** *(UAT G-26-1)*

- [x] 26-10-PLAN.md — Readable dark-theme warning/danger History rows: contrast check over the compiled theme (≥ 4.5:1) → `_overrides.scss` row override → operator push/hold → console + gitlink deploy, served `app.js` check, UAT test 1 re-run

**Notes**: Order is backend, then Vue, then the pointer bump. Warm the new view index outside the 01:00–05:00 UTC compaction window.
**Research**: Needed at planning: the `date` format across old `managed_logs` docs (collation), index build time on the production corpus, and the Vue store contract shared with `store/stats.js`.
**UI hint**: yes

### Phase 27: InfluxDB 2 Upgrade

**Goal**: THiNX statistics run on InfluxDB 2 with a finite 90-day retention, with no existing `stats` history lost and no blanked dashboard.
**Depends on**: Phase 24 (the new InfluxDB 2 credential uses the same `readSecret()` + swarm-secret pattern). Runs after Phase 26 so the irreversible storage upgrade gets its own deploy.
**Requirements**: OPS-INFLUX-01, OPS-INFLUX-02, OPS-INFLUX-03
**Success Criteria** (what must be TRUE):

  1. Before the upgrade, a backup of the InfluxDB 1.8 data is taken and verified restorable. After it, `thinx_influxdb` runs InfluxDB 2 in production and the pre-upgrade `stats` history can still be queried.
  2. After the upgrade, the dashboard and Visits statistics show non-zero figures and new device check-ins keep appearing, so `lib/thinx/influx.js` both writes to and reads from InfluxDB 2.
  3. The influx specs run in CI against InfluxDB 2 and pass.
  4. The bucket that holds `stats` data has a 90-day retention.
  5. `thinx_influxdb` no longer mounts anything from `/mnt/gluster/deployment/swarm/swarmpit/`; its config is re-homed to a thinx-owned path or dropped. A test push still autoredeploys within 5 minutes after the upgrade.

**Plans**: 8/8 plans complete

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Verified 1.8 portable backup on two nodes, restore with equal counts, upgrade rehearsed on production hardware from the restored copy, full cutover runbook (OPS-INFLUX-01)
- [x] 27-02-PLAN.md — v2 connector (`@influxdata/influxdb-client` + Flux), never-throwing boot ensure of `stats` at 90 d with the `stats/autogen` adopt path, CI compose pair on dhi.io/influxdb:2.9.1 + setup one-shot (OPS-INFLUX-02/03)

**Wave 2** *(blocked on 27-02)*

- [x] 27-03-PLAN.md — Dashboard/Visits KPIs fixed (`week_V2`/`today_V2` forward the body), D-12 APIKEY_INVALID/LOGIN_INVALID hardening, read-only aggregate probe `scripts/influx-stats-probe.js` (OPS-INFLUX-02)
- [x] 27-08-PLAN.md — CircleCI "Starting Influx" logs in to dhi.io and onboards the CI InfluxDB 2 pair (step text run end to end locally), dev compose on v2 without Chronograf, integrations map updated (OPS-INFLUX-02; split from 27-02 for context budget)

**Wave 3** *(blocked on Waves 1–2)*

- [x] 27-04-PLAN.md — Release gate → GO decision (window + F-2 credential option) → dormant push, CI runs the influx specs on InfluxDB 2 (checkpoint)

**Wave 4** *(blocked on 27-04)*

- [x] 27-05-PLAN.md — Cutover: 1.8 stopped and copied, `influxd upgrade` on the copy, one service update to dhi.io/influxdb:2.9.1 (env-only, no swarmpit mount, HTTPS-only route), history proven equal, API token minted into an unmounted secret

**Wave 5** *(blocked on 27-05)*

- [x] 27-06-PLAN.md — Read-only API-image rehearsal → decision → `INFLUXDB_TOKEN` mounted, boot adopts `stats` at 90 d, history and a live write proven, empty buckets dropped (checkpoint, one-way)

**Wave 6** *(blocked on 27-06)*

- [x] 27-07-PLAN.md — Stack files mirrored, Chronograf retired, test push autoredeploys ≤ 5 min → D-07 evidence → decision → backup and 1.8 data deleted (checkpoint, one-way)

**Notes**: Decide at plan time whether `influx.js` uses the v1-compat API with a DBRP mapping or a v2 client. Before upgrading, inventory everything that talks to `thinx_influxdb`: Chronograf, the Traefik `INFLUX_HOSTNAME` route, and the `swarmpit` database inside it (confirm whether Swarmpit writes there). `docker exec` is node-local and `name=influxdb` matches both InfluxDBs, so query placement first and target `thinx_influxdb` by name. Keep this upgrade out of the Swarmpit window.
**Research**: Needed at planning: the 1.8 → 2 upgrade path and data migration, v1-compat auth/DBRP versus a v2 client, and the dependents of `thinx_influxdb`.

### Phase 28: Swarmpit Upgrade & Trim

**Goal**: Swarmpit is reduced to the part that matters, registry-triggered autoredeploy on 1.10. Its stats stack is gone, its agent stays for the tasks UI, and every deploy still lands within the 5-minute SLA.
**Depends on**: Phase 27 (`thinx_influxdb` no longer depends on the Swarmpit directory) and all earlier v1.14 phases, since they deploy through Swarmpit autoredeploy
**Requirements**: OPS-SWARM-01, OPS-SWARM-02 (OPS-SWARM-03 descoped to Future Requirements, D-12)
**Success Criteria** (what must be TRUE):

  1. Swarmpit runs 1.10 in production, and a test push to `thinx-staging` produces a new `thinx_api` task within 5 minutes.
  2. With Swarmpit stats disabled and `swarmpit_influxdb` removed, a second test push still redeploys within 5 minutes, and `thinx_influxdb` keeps running unaffected.
  3. `swarmpit_db` is untouched: still couchdb 2.3.0, with the same volume and linked registry credentials. Each step can be rolled back from a stack snapshot taken before it.

**Plans**: 2/4 plans executed

Plans:
**Wave 1**

- [x] 28-01-PLAN.md — Engine gate, runbook, OPS-SWARM-03 descope (D-12), pre-window push measured as gate 0 on unchanged 1.9; Step 0 drift check, baselines, swarmpit_db dump, rung 1 staged

**Wave 2** *(blocked on 28-01)*

- [x] 28-02-PLAN.md — Step A on 1.9: stats/`swarmpit_influxdb` removed via stack file + stack deploy, Gate A push ≤ 5 min; `swarmpit/influxdb.conf` deleted after mount scan (D-13)

**Wave 3** *(blocked on 28-02)*

- [ ] 28-03-PLAN.md — Step B: `swarmpit/swarmpit:1.10` by tag with healthcheck override, swarmpit_db/agent untouched, Gate B push ≤ 5 min, 10-min stability hold

**Wave 4** *(blocked on 28-03)*

- [ ] 28-04-PLAN.md — `swarmpit_influx-data` removed after the last gate (D-14, one-way), end state verified, recovery docs updated, dump shredded

**Notes**: Runs last, in its own maintenance window, never combined with a code deploy, and away from the ~06:45 UTC unattended-upgrade window. Check the Docker Engine version on `micro` and `core` first. Change one component per step, each gated by a push-to-redeploy test. Stage rung-1 recovery (`docker service update --force swarmpit_app`, per the `swarm-autopull-recovery` skill) before starting. Order per D-01: the trim (criterion 2) is gated first, then the 1.10 upgrade (criterion 1).
**Research**: Needed at planning: what changes from 1.9 to 1.10 (especially stats configuration), where the stack file lives on `micro`, and how the app behaves without the agent.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–4. v1 GA Backend Closures | v1.0 | — | Complete | 2026-05-27 |
| 5–11. Backend Hygiene & Posture | v1.9 | 23/23 | Complete | 2026-06-04 |
| 12–14. Operational Closures | v1.10 | 5/5 | Complete | 2026-06-05 |
| 15–17. Backlog Drawdown | v1.11 | 6/6 | Complete | 2026-06-06 |
| 18–20. Inbox Drawdown | v1.12 | — | Complete | 2026-06-29 |
| 21. CSP Wildcard Removal + Anti-CSRF Token | v1.13 | 5/5 | Complete | 2026-09-25 |
| 22. CI & SAST Baseline | v1.14 | 4/4 | Complete    | 2026-09-25 |
| 23. Build-Pipeline Sink Hardening | v1.14 | 5/5 | Complete    | 2026-09-29 |
| 24. Secrets Sweep | v1.14 | 6/6 | Complete    | 2026-09-29 |
| 25. Session-Bound CSRF + Console Edge Headers | v1.14 | 10/10 | Complete    | 2026-10-01 |
| 26. Vue Console Log Paging | v1.14 | 10/10 | Complete    | 2026-10-03 |
| 27. InfluxDB 2 Upgrade | v1.14 | 8/8 | Complete    | 2026-10-03 |
| 28. Swarmpit Upgrade & Trim | v1.14 | 2/4 | In Progress|  |

---
*v1.14 Backlog & Hardening Sweep roadmap created 2026-09-25: 25 requirements across 7 phases (22–28). Next: `/gsd:discuss-phase 22`.*
