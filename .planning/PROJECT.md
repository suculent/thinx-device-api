# THiNX Device API

## What This Is

A long-lived Node/Express IoT device API monorepo (`thinx-device-api`) — bootstrap at `thinx-core.js`, 17 API v2 routers under `lib/router.*.js`, MQTT messaging + WebSocket runtime, Redis-backed session + build queue, CouchDB persistence, Docker-based firmware builder. Sibling to the `services/console` submodule (Vue console + legacy AngularJS console under deprecation). Deployed to a Docker swarm (nodes `micro` and `core`; service placement floats) via CircleCI image publish to the private registry + Swarmpit autoredeploy.

The v1.0 GA milestone (shipped 2026-05-27) closed the 4 v1 backend gaps the Vue console depends on. Going forward, the project scope is the broader backend lifecycle: hygiene refactors, v1.x backlog, the inevitable v2 multi-tenant revamp.

## Core Value

The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## Current State

**Shipped:** v1.13 Web Hardening (Console/Edge) (2026-09-25) — 2/2 requirements in Phase 21. The `https:`/`wss:` scheme wildcard is gone from every CSP source; the live policy pins 7 explicit hosts (plus `app.thinx.cloud`). Double-submit CSRF (`XSRF-TOKEN` cookie + `X-XSRF-TOKEN` header, `lib/middleware/csrf.js`) guards the 7 cookie-session login/account POSTs and has been **enforced in production since 2026-09-25 09:02Z**. Both consoles log in cleanly under enforcement. Verification `passed` with 3 operator overrides: HawkScan (the original acceptance scanner) was removed in `bb0ce4a7`, and the production console CSP turned out to come from a gluster bind mount (`/mnt/gluster/deployment/swarm/console/default.conf`) rather than the image configs.

Previously: v1.12 Inbox Drawdown (2026-06-29) — GDPR owner purge, per-user GitHub token backend, Docker Secrets `readSecret()` helper. v1.11 Backlog Drawdown (2026-06-06) — fs-finder excised, Dependabot triage, influx fix confirmed live. v1.10 Operational Closures (2026-06-05). v1.9 Backend Hygiene & Posture (2026-06-04). v1.0 GA Backend Closures (2026-05-27).

**Production topology (2026-09-21, swarm-verified; placement floats — always query it):** `thinx_api` on core, `thinx_console` on micro, `thinx_vue` on core. Both console services bind-mount the same gluster `default.conf`, so both hosts serve one identical CSP.

**Codebase posture (as of v1.13):**
- Web edge: pinned-host CSP (no scheme wildcards; `unsafe-eval` still present for AngularJS); double-submit CSRF enforced on cookie-session login/account POSTs; rollback via `CSRF_ENFORCE` flag per `.planning/runbooks/csp-csrf-hardening.md`.
- Core credentials (Redis, CouchDB) and, since v1.14 Phase 24, every integration credential in `lib/` (Slack, GitHub/Google OAuth, Mailgun, Rollbar, worker secret, deploy-key passphrase) load through `readSecret()` from Docker secrets, falling back to env; GDPR purge is a single orchestrator (`owner_purge.js`) reused by scheduled purges.
- `lib/thinx/owner.js` is fully async/await (~73 callback patterns swept; 5 behavior-locking specs added) with strict equality throughout and SEC-PII-01 + Phase 5 REFACTOR-02 invariants preserved.
- WebSocket lifecycle is deterministic (raw-socket `close` handler), session cookie is `httpOnly: true` with documented sub-5-min rollback, edge-handshake gap captured in an operator runbook.
- Account lifecycle: admin `POST /api/v2/admin/user/:id/reactivate` exists for soft-deleted users; password-reset emails land on the Vue console (`/password-reset?`).
- Operational guardrails: `base/update.sh` is shellcheck-clean with a single atomic commit per run; startup `ca.pem` freshness probe (DETECT-only, R10..R14) WARNs on issuer-mismatch before a 2026-05-31-style SSL incident reappears.
- Historic PII residue: `scripts/redact-managed-logs.js` + audit-log forward-TTL ship in code; production sweep against ~658k `managed_logs` docs is operator-run per runbook.

**Companion project:** `services/console` submodule shipped its SEC-DEP-02 phase under a new `v1.x Operational Hygiene` milestone; pointer landed in this repo via Phase 10 commit `28a4add4`.

## Current Milestone: v1.14 Backlog & Hardening Sweep

**Goal:** Close the v1.13 security follow-ups and the open ops/code findings, and ship three long-standing backlog features (log paging, InfluxDB retention, Swarmpit trim). Phases start at 22.

**Target features:**
- **WR-06** — session-bound CSRF token (HMAC(secret, random‖session_id)), rotated on login
- **WR-04** — `POST /api/v2/user` requires the CSRF token, no machine-client exemption (decision 2026-09-25: non-browser clients must prime the token)
- **Console CSP source of truth** — the gluster bind-mounted `default.conf` is canonical (decision 2026-09-25); image `default.conf` files and the runbook snapshots mirror it, including the Vue `connect-src` `app.thinx.cloud` fix; spot-check classic register / forgot / reset-confirm under enforcement
- ✓ **SEC-CFG-02**: the 9 credentials read in `lib/`, and the worker/transformer Rollbar and worker secrets, now come from swarm secrets. The env fallback is kept. `CSRF_SECRET` is provisioned for Phase 25 *(shipped Phase 24)*
- ✓ **builder.js path traversal** — repository-controlled reads and writes are contained by `safepath` *(shipped Phase 23, SEC-PATH-01/02)*
- ✓ **git.js argv** — git runs argv-only with no shell; remote jobs carry argv; `shell-escape` removed *(shipped Phase 23, SEC-EXEC-01/02)*
- ✓ **CodeQL workflow** — trigger on `main`, current action majors *(shipped Phase 22, CI-01)*
- ✓ **Registry login retry** — retry wrapper on the CI `docker login registry.thinx.cloud:5000` step *(shipped Phase 22, CI-02)*
- ✓ **Vue hostname var** — separate Vue console hostname build var so footer links point at itself *(shipped Phase 22, CI-03)*
- ✓ **Log paging** — opt-in owner-bound cursor paging (`limit`/`cursor`, `paging:{limit,has_more,next_cursor}`) for audit and build logs in the Vue Console; the Legacy console keeps its 200-item call (now owner-keyed, string flags); daily log-retention cron on micro *(shipped Phase 26, LOG-01..04)*
- ✓ **InfluxDB 2** — `thinx_influxdb` runs `dhi.io/influxdb:2.9.1` in production, upgraded in place from a verified backup; `influx.js` is on the v2 client (Flux); `stats` has 90-day bucket retention *(shipped Phase 27, OPS-INFLUX-01/02/03)*
- **Swarmpit 1.10 + trim** — upgrade Swarmpit to 1.10 (added 2026-09-25), then disable stats and drop `swarmpit_influxdb` and `swarmpit_agent`; registry-triggered autoredeploy must keep working; `swarmpit_db` stays couchdb 2.3.0

**Still deferred:** SEC-CSP-02 (`unsafe-eval`, blocked on AngularJS retirement); TEST-CHAI-01, OPS-02, OPS-03, `uuid #194`.

**Scope note:** log paging and the Vue hostname var touch `services/console` (Vue). As in v1.13, this milestone coordinates the console submodule pointer bump rather than treating that work as fully external.

## Validated Requirements (Historical)

<details open>
<summary>v1.14 Backlog & Hardening Sweep (in progress)</summary>

- ✓ **CI-01** — v1.14 (Phase 22) — CodeQL `javascript-typescript` (`codeql-action@v4`, `checkout@v7`, `build-mode: none`) runs on pushes to `thinx-staging`/`main` and PRs to `main`; non-required; default setup off. security-extended baseline recorded (147 alerts). Main-push row pending the merge of PR #569.
- ✓ **SEC-CFG-02** — v1.14 (Phase 24) — `SLACK_BOT_TOKEN`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK`, `GITHUB_CLIENT_SECRET`, `GOOGLE_OAUTH_SECRET`, `MAILGUN_API_KEY`, `ROLLBAR_SERVER_TOKEN` (falling back to `ROLLBAR_ACCESS_TOKEN`), `WORKER_SECRET` and `GIT_KEY_PASSPHRASE` all load through `readSecret()`, secret file first, then env. When both are absent the integration is switched off, and `SecretsSweepSpec` covers that.
  - Production: each service was switched with its own `docker service update --secret-add`. `thinx_api` mounts 9 secrets, including the new `CSRF_SECRET`. `thinx_worker` mounts `WORKER_SECRET` and `ROLLBAR_SERVER_TOKEN`; `thinx_transformer` mounts `ROLLBAR_SERVER_TOKEN`.
  - `WORKER_SECRET` was rotated, and a real build on the new value succeeded. `docker-swarm.yml` mirrors the live stack. There was no outage.
- ✓ **OPS-INFLUX-01/02/03** — v1.14 (Phase 27) — `thinx_influxdb` upgraded 1.8 → `dhi.io/influxdb:2.9.1` in place (2026-10-02 22:43–22:45 UTC, ~2 min down) after a verified, rehearsed backup; all 2402 points migrated, the 80-day window (501) proven equal after the trim. `lib/thinx/influx.js` uses `@influxdata/influxdb-client` 1.35.0 with Flux and strictly increasing ns timestamps; a boot ensure adopts `stats/autogen` as `stats` with 90-day retention. Stats re-enabled 2026-10-03 12:05 UTC; dashboard/Visits and a test-device check-in confirmed in UAT. CI runs the influx specs on InfluxDB 2.9.1 (1018 specs, 0 failures). Chronograf retired; 1.8 data and backups deleted.
  - `INFLUXDB_TOKEN` is mounted only on the live `thinx_api` spec (not in gluster `thinx.yml`) — `restart.sh`/stack deploy turns stats off until re-added.
- ✓ **CI-02** — v1.14 (Phase 22) — Every private-registry login in `.circleci/config.yml` goes through the retrying stdin `registry-login` command; the raw argv-password login in the test job is gone.
- ✓ **SEC-EXEC-01** — v1.14 (Phase 23) — `lib/thinx/git.js` runs git argv-only (`runGit` is a detached `spawn`, `shell:false`; `ls-files` uses `execFileSync`). No shell string, no `ssh-agent sh -c`. Constant `GIT_SSH_COMMAND` + askpass, passphrase in env, publickey-only ssh. Private builds proven in production (43c748d0, 17d30770).
- ✓ **SEC-EXEC-02** — v1.14 (Phase 23) — Remote jobs carry `argv` (arguments only), and the worker spawns its constant builder program with `shell:false`. `shell-escape` is gone from `package.json` and the lockfile. The legacy `cmd` shell path is retained for now (removal is a pending todo).
- ✓ **SEC-PATH-01** — v1.14 (Phase 23) — Every builder read/write of a repository-controlled file goes through `safepath` (realpath containment, O_NOFOLLOW, symlink refusal), including the `thinx.yml` write-back. `buildPathFor` refuses a malformed owner/udid (`invalid_device`, owner notified).
- ✓ **SEC-PATH-02** — v1.14 (Phase 23) — Clone and pull use `core.symlinks=false`, persisted in the checkout.
- ✓ **CI-03** — v1.14 (Phase 22) — Vue console "THiNX Console" links (layout, login, password reset) point at the Vue console host via `VUE_WEB_HOSTNAME` → `VUE_APP_CONSOLE_HOSTNAME` build arg; dead runtime env removed from `docker-swarm.yml`, gluster and the live service. The authenticated Layout footer needed a gap-closure fix (22-04: missing hostnames mixin), guarded by a plain-node footer test.

</details>

<details>
<summary>v1.13 Web Hardening (Console/Edge) (shipped 2026-09-25)</summary>

- ✓ **SEC-CSP-01** — v1.13 (Phase 21) — `https:`/`wss:` scheme wildcard removed from `default-src`/`connect-src` in favour of pinned hosts, across both console `default.conf` files, the edge runbook snapshots and the live gluster-mounted CSP. HawkScan rescan waived (scanner removed); verified by repo-wide CSP parse and live header.
- ✓ **SEC-CSRF-01** — v1.13 (Phase 21) — Double-submit CSRF token (adjusted from "synchronizer" at CONTEXT time) validated by one server-side middleware for both consoles; missing/forged token → 403 `csrf_token_invalid`; enforced in production since 2026-09-25 09:02Z; cold logins on both consoles verified by the operator.

</details>

<details>
<summary>v1.11 Backlog Drawdown (shipped 2026-06-06)</summary>

- ✓ **REFACTOR-06** — v1.11 (Phase 15) — All 9 `fs-finder` call sites across 5 `lib/` modules replaced with the synchronous, version-independent native helper `lib/thinx/finder.js` (`findFilesSync`/`findDirsSync`), behavior locked by `FinderSpec` (11 cases) + per-module specs. Pre-order DFS traversal matches fs-finder's `getPathsSync` ordering exactly (caught + fixed in code review).
- ✓ **REFACTOR-07** — v1.11 (Phase 15) — `fs-finder` (`github:suculent/Node-FsFinder#master`) removed from `package.json`; `npm ls fs-finder` empty (4 packages purged); 0 source references remain. Gated last behind a grep precondition for clean bisect.
- ✓ **SEC-DEP-03** — v1.11 (Phase 16) — 5 default-branch Dependabot alerts triaged via taxonomy; 3 surgical overrides (`@hapi/wreck ^18.1.1` runtime, `tmp ^0.2.6`, `serialize-javascript ^7.0.5`) → runtime tree `npm audit --omit=dev` 0 high/0 moderate; mocha smoke-checked intact; `uuid #194` deferred-dev-only.
- ✓ **OPS-EXEC-03** — v1.11 (Phase 17) — Influx stats fix (`9b6d931c`) verified live in production (discrepancy branch — already autoredeployed pipeline-5266 `:latest`). `DEVICE_CHECKIN` count=16, 0 `BADSTRING`/parse errors over 24h, `thinx_api` co-located with mosquitto on micro. Runbook annex in `swarm.md`.

</details>

<details>
<summary>v1.10 Operational Closures (shipped 2026-06-05)</summary>

- ✓ **TEST-WS-01** — v1.10 (Phase 12) — In-process Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exercises the rtm-style `/<owner>(/<timestamp>)?` upgrade and asserts `101 Switching Protocols`; future regression of the SEC-WS-01 edge fix now surfaces at CI.
- ✓ **OBS-01** — v1.10 (Phase 12) — `scripts/redact-managed-logs.js` posts a single Slack closure receipt (docs scanned/redacted, sample verdict, runtime, host-only env) to `SLACK_WEBHOOK` on `--apply`; Slack failure never blocks exit; `--dry-run` stays silent.
- ✓ **OBS-02** — v1.10 (Phase 12) — DETECT-only `lib/thinx/audit-ttl-probe.js` wired additively into `thinx-core.js` startup (cert-probe pattern); WARNs if CouchDB stops evicting `expire_at`-stamped `managed_logs` docs past a 7-day grace, guarding the v1.9 Phase 9 forward-TTL.
- ✓ **OPS-EXEC-01** — v1.10 (Phase 13) — SEC-WS-01 edge handshake closed; `scripts/probe-rtm-handshake.sh` reproduction probe + swarm-config snapshot trail under `.planning/runbooks/` + runbook execution annex. Discrepancy branch (fix already live out-of-band).
- ✓ **OPS-EXEC-02** — v1.10 (Phase 14) — SEC-PII-02 `managed_logs` sweep closed against production CouchDB: 422 genuine `reset_key` leaks redacted in the live `message` field (snapshot-gated `--apply` + `--sample` exit 0 + compaction); redactor field-scoping bug (SEC-PII-02b) fixed in-flight. Historic ~658k corpus already deleted out-of-band (656,697 tombstones).

</details>

<details>
<summary>v1.9 Backend Hygiene & Posture (shipped 2026-06-04)</summary>

- ✓ **REFACTOR-01** — v1.9 (Phase 5) — Duplicate `app.set('trust proxy', …)` call in `thinx-core.js` deleted, leaving a single canonical site. (The *value* kept at the time was later found wrong and was corrected by SEC-PROXY-01 on 2026-09-18; the trust-proxy allowlist now comes from `CookiePolicy.trustedProxy()`.)
- ✓ **REFACTOR-02** — v1.9 (Phase 5) — `!=` → `!==` in `Owner.password_reset` (line 492) + regression test for string-vs-number coercion case.
- ✓ **REFACTOR-05** — v1.9 (Phase 5) — `jshint` moved to `devDependencies`. (`fs-finder` scope-amended: deferred to v1.10 because of 5 active runtime call sites in `lib/`.)
- ✓ **REFACTOR-03** — v1.9 (Phase 6) — Raw-socket `close` handler in WS upgrade flow; per-connection map entries released deterministically on mid-flight aborts.
- ✓ **SEC-WS-01** — v1.9 (Phase 6) — Root cause reproduced as `rtm.thinx.cloud` edge-nginx routing gap; runbook authored in `.planning/runbooks/websocket-handshake.md` with the 7-row reproduction table + operator-side fix. NOT code-fixable from this repo.
- ✓ **SEC-COOKIE-01** — v1.9 (Phase 6) — Session cookie `x-thx-core` flipped to `httpOnly: true`; sub-5-min rollback path documented; regression spec covers attribute presence.
- ✓ **REFACTOR-04** — v1.9 (Phase 7) — ~73 callback patterns in `lib/thinx/owner.js` converted to async/await across 6 atomic commits (`1aa92fe5`→`f4345711`); 5 behavior-locking specs added; SEC-PII-01 + Phase 5 REFACTOR-02 invariants preserved.
- ✓ **AUTH-REACTIVATE-01** — v1.9 (Phase 8) — Admin endpoint `POST /api/v2/admin/user/:id/reactivate` behind `requireAdmin`; `ZZ-RouterAdminReactivateSpec.js` covers 401/403/200 paths + soft-delete gate intact.
- ✓ **AUTH-RESET-LINK-CONSOLE** — v1.9 (Phase 8) — Reset URL changed from legacy `/password.html?` to Vue console `/password-reset?` in `Owner.password_reset`; regression spec extension locks the redirect.
- ✓ **SEC-PII-02** — v1.9 (Phase 9) — `scripts/redact-managed-logs.js` (snapshot-gated `_bulk_docs` overlay + `--sample N` verification) + `lib/thinx/audit.js` 90-day `expire_at` forward TTL + operator runbook + GDPR-posture note. Production execution deferred to operator window.
- ✓ **SEC-DEP-02** — v1.9 (Phase 10) — 2 console alerts classified `deferred-vendored-asset` (vendored `jquery-validation-1.19.5`, never invoked); SEC-DEP-02 scheduled in `services/console` GSD project; submodule pointer landed in this repo. Cross-project coordination runbook authored.
- ✓ **BASE-IMG-01** — v1.9 (Phase 11) — `base/update.sh` rewritten (18 → 179 lines): `set -euo pipefail`, `--tag`/`--owner`/`--dry-run`/`--help`, auto `npm version patch`, pre/post digest logging, single atomic GPG-signed commit, shellcheck 0.11.0 clean.
- ✓ **THINX-CERT-CHECK-01** — v1.9 (Phase 11) — DETECT-only `lib/thinx/cert-probe.js` startup probe wired into `thinx-core.js:~211`; WARNs on R10..R14 issuer-mismatch between leaf and `ca.pem`; `ZZ-CertProbeSpec.js` (6 it blocks) + 4 fixture PEMs.

</details>

<details>
<summary>v1.0 GA Backend Closures (shipped 2026-05-27)</summary>

- ✓ **AUTH-API-01** — v1.0 (Phase 1) — Unauthenticated `POST /api/v2/password/reset` returns 200 with no-enumeration body; Vue console `Authorization: Bearer null` pattern handled. Class-fix in `lib/router.js` (Bearer-null guard) + body normalization in `lib/router.user.js`. Regression spec `ZZ-RouterPasswordResetSpec.js`.
- ✓ **SEC-PII-01** — v1.0 (Phase 2) — PII/credentials redacted at 12+1 sites in `lib/thinx/owner.js` via `Util.redactEmail` + `Util.redactToken`. Audit-log writes redacted before CouchDB persistence. Regression spec `ZZ-OwnerLogRedactionSpec.js`.
- ✓ **OPS-01** — v1.0 (Phase 3) — Swarm autoredeploy restored on `micro` via Rung 1 force-restart of `swarmpit_app`. Push-observe SLA 63s vs ≤300s target. Runbook at `.planning/runbooks/swarm.md`.
- ✓ **SEC-DEP-01** — v1.0 (Phase 4) — 29 Dependabot alerts classified; 4 `package.json` `overrides` edits shipped via `d8e3176c`; runtime-tree `npm audit --omit=dev` high 9→0; merged to master (#539) + main (#540).

</details>

<details>
<summary>Pre-v1 existing capabilities (locked)</summary>

- ✓ Express monolith with `thinx-core.js` bootstrap (HTTP + HTTPS, Let's Encrypt intermediate-rotation tolerance)
- ✓ Session middleware on Redis-backed store, cookie name `x-thx-core`
- ✓ 17 API v2 routers covering apikey/auth/build/device/deviceapi/env/oauth/gdpr/logs/mesh/profile/rsakey/source/transfer/user/admin
- ✓ MQTT messaging + WebSocket runtime (`lib/thinx/messenger.js`, `ws`)
- ✓ Build pipeline: Redis-backed queue → Docker-based firmware builder → CouchDB-stored logs streamed over WebSocket
- ✓ Admin API surface — `requireAdmin` gate on `/api/v2/admin/*`
- ✓ CORS origin reflection for credentialed requests (`lib/router.js:32-56`)
- ✓ Jasmine + nyc test suite under `spec/jasmine/ZZ-*` with chai-http v4

</details>

## Out of Scope

- **services/console** frontend work — owned by the console submodule's GSD project (`services/console/.planning/`)
- **G10** (`thinx_worker` silent-loop on `docker pull`) — lives in the worker repo, different codebase
- **chai-http v5 ESM migration** — dependency lock per `AGENTS.md:82-92`; trigger to reconsider is a Snyk/Dependabot CVE in superagent v3 (tracked as TEST-CHAI-01)
- **Multi-tenant revamp / v2 API features** — future major milestone, not v1.x
- **Edge layer redesign** (Traefik labels, nginx rewrites beyond G8 needs) — out of scope except for targeted header hardening (AUTH-API-01 in v1.0, CSP pinning in v1.13)
- **Dashboard data-exposure rework** (AGENTS.md L98) — privacy concern but not a regression vs. legacy; v1.x candidate at most
- **CONSOLE-LEGACY-JSON-PARSE** — legacy AngularJS console double-parse bug (`JSON.parse` on an already-parsed object at `services/console/src/login.js:173` + `password.js:87`); frontend fault in the sibling submodule, no parent-repo angle. Reclassified out of parent scope at v1.11 start; owned by the `services/console` GSD workspace

## Context

- **Tech stack:** Node/Express monolith, CommonJS (no ESM migration), chai-http v4 pinned per `AGENTS.md:82-92`
- **Production deploy:** parent `thinx-staging` push → CircleCI build → image publish → Swarmpit autoredeploy on `micro` (SLA ~50-65s observed in v1.0). Manual `./restart.sh` is the fallback (Phase 3 fix made it unnecessary).
- **Branch model (since 2026-09-19):** `master` is deleted and `main` is the default branch. `main` is protected — direct pushes are rejected (`GH006`), so changes reach it through a PR. `thinx-staging` accepts direct pushes. Since `3cfd0666` the two branches publish to different registries: `thinx-staging` → `registry.thinx.cloud:5000`, `main` → Docker Hub, which ended the race where both wrote the same tags. All six submodules publish from `main` only.
- **Signing:** GPG-sign commits is the project default; the 2026-05-26 single-session authorization for unsigned commits is recorded in memory `unsigned-commits-260526` and does not carry forward.
- **AGENTS.md** at parent root is the existing onboarding doc (Codex-runtime convention) — kept as the ops/deploy + dependency-lock rationale reference alongside `.planning/`.
- **Sibling project:** `services/console/.planning/` has 10 phases shipped (v1.0 frontend) + Phase 11 in flight. Parent v1.0 GA and console v1.0 GA land together; v1.x coordination is per-project but cross-references the shared backlog (SEC-DEP-02 etc.).
- **Production image at v1.0 milestone close:** `thinxcloud/api:latest sha256:4d3fb789` (Phase 4 deploy 2026-05-26T22:35:54Z). Current production state lives in `STATE.md`, which is where this line stops being maintained.

## Constraints

- **Compatibility:** every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks
- **Tech stack:** Node/Express monolith, CommonJS, chai-http v4 (locked per AGENTS.md)
- **Deployment:** parent `thinx-staging` push triggers the deploy pipeline; Phase 3's autoredeploy restoration removes the need for manual `./restart.sh` for normal pushes
- **Signing:** GPG-sign by default; per-session unsigned authorization must be re-granted explicitly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1.0 scope = 4 GA gap closures only (not "backend at large") | Mirrors console submodule's v1.0 milestone scope; narrowest viable project that closes v1 alongside the frontend | ✓ Good — shipped 4/4 in ~2 days |
| Refresh codebase map (CONCERNS) before drafting REQUIREMENTS | Caught 9 additional concerns (httpOnly: false, !=, PII in logs, duplicate trust proxy, missing socket close handlers) that weren't in the previous map | ✓ Good — SEC-PII-01 scope expanded from 6 → 12+1 sites because of it |
| Keep `AGENTS.md` (Codex-runtime convention) as ops/deploy reference alongside GSD | AGENTS.md is the existing onboarding doc; replacing it would lose ssh details and dependency-lock rationale | ✓ Good — runbook persisted to both `.planning/runbooks/swarm.md` (canonical) and AGENTS.md (local mirror) in Phase 3 |
| Treat `services/*` as external subservices; don't deep-scan console submodule | Console has its own GSD project; double-mapping would create inconsistency | ✓ Good |
| SEC-pii-logs included as v1 GA blocker (vs deferred) | Today's CONCERNS map surfaced 6 leak sites in owner.js (emails + reset_keys + Mailgun token + activation token); GDPR posture for v1 GA; fix is small | ✓ Good — Phase 2 surfaced 6 more sites and an opportunistic 13th during execution; audit-log path (CouchDB persistence) was the highest-priority site |
| Phase 1 fix in `lib/router.js` (class-fix) vs per-route guard | Class-fix closes the entire Bearer-null bug class on ANY route, not just `/password/reset`. Frontend half (Vue `Bearer null` header) stays; backend makes it harmless | ✓ Good — single-file revert path; Vue-side cleanup filed as v1.x candidate |
| Phase 3 Rung-by-rung ladder (Rung 1 autonomous, Rungs 2-4 checkpoint-gated) | Smallest-change preference; force-restart is reversible; deeper rungs (DB rebuild, stale-node cleanup, Swarmpit upgrade) carry swarm-fabric risk | ✓ Good — Rung 1 PASS on first try; Rungs 2-4 stay locked for any future recurrence |
| Phase 4 Slice 3 Option C: skip manual Dependabot UI walk for 22 non-blocker alerts | Operator decision 2026-05-27; runtime-tree primary metric already 9→0; non-blocker alerts expected to age out via natural Dependabot lifecycle | ✓ Good — post-merge rescan confirmed 29 → 3 (1H + 2M) on default branches |
| Phase 4 Slice 4 Option B: defer `services/console` merge-up to separate cross-project coordination | Operator decision 2026-05-27; 194-commit submodule diff (Vue v1.0 rewrite era) is sibling-project scope; SEC-DEP-02 v1.x backlog already tracks console-side dependency triage | — Pending — track via SEC-DEP-02 |
| Verification artifact accepted in SUMMARY.md `verification:` blocks for Phases 1-3 (not separate `*-VERIFICATION.md`) | Verifier agent was not retroactively run; functional verification IS present in SUMMARYs + supporting `.txt` files; process-debt, not functional-debt | ⚠️ Revisit — if any future audit requires structured `*-VERIFICATION.md` per phase for traceability tooling, re-run `gsd-verifier` against the 3 SUMMARYs (low cost; no re-verification needed) |
| v1.9 phase numbering continues from v1.0's Phase 4 (no `--reset-phase-numbers`) | Linear monorepo history preserves traceability across milestones; downstream tools that map requirement → phase don't need a milestone-disambiguation key | ✓ Good — Phases 5–11 mapped 1:1 to v1.9 with no ambiguity |
| Phase 7 (owner.js sweep) executed as 6 sequential atomic commits on a single branch (not parallel worktrees) | Every plan touched `lib/thinx/owner.js`; parallel execution would have produced merge conflicts on every plan; sequential single-branch execution gave bisect-friendly history | ✓ Good — landed `1aa92fe5`→`f4345711` with zero behavior regressions and each top-5 method individually revertable |
| SEC-WS-01 closed via operator runbook (not code change) | Root cause is rtm edge-nginx routing gap — outside this repo's control; capturing it as a runbook with a verbatim reproduction table is the highest-value action available from here | ✓ Good — operator-side fix recipe is documented and `deferred to edge-redesign` tag prevents accidental re-scoping |
| SEC-PII-02 ships code + leaves production execution to operator window | Redaction is destructive of audit-log content; a snapshot-gated `--apply` flow with a documented rollback path makes execution a scheduled-maintenance decision, not a CI side-effect | ✓ Good — script, audit TTL, runbook, and GDPR-posture note all shipped; execution outstanding (see v1.10 backlog) |
| THINX-CERT-CHECK-01 is DETECT-only (not auto-mutate) | Cert rotation lives on the swarm host (cron + ACME client) — the codebase angle is to surface drift, not to take over rotation | ✓ Good — startup WARN gives 5-min visibility on R10→R13 / R10→R14 drift before SSL incidents trigger |
| REFACTOR-05 scope-amended mid-phase to jshint-only (fs-finder deferred to v1.10) | 5 active runtime call sites discovered during execution made `fs-finder` reclassification a breaking change disguised as a "cheap sweep" | ✓ Good — single-flag amendment surfaced in ROADMAP.md, REQUIREMENTS.md, STATE.md, and a v1.10 backlog entry; literal text gap closed by `89669fc4` |
| v1.9 milestone closed without a separate milestone-level audit | Per-phase VERIFICATION.md ran for all 7 phases and covered 13/13 requirements; running another audit pass would mostly re-read those VERIFICATION reports | ⚠️ Revisit — if v1.10 audit tooling requires a v1.x-MILESTONE-AUDIT.md trail across all milestones, retrofit one against the 7 v1.9 VERIFICATION.md reports |
| v1.10 Phase 12 sequenced FIRST (code helpers before the two OPS executions) | OBS-01 had to be wired into `redact-managed-logs.js` before Phase 14's sweep invoked it (auto Slack receipt); TEST-WS-01 had to exist before Phase 13's edge fix so regression coverage was there from day one | ✓ Good — both OPS phases ran with their helper dependency already in place |
| v1.10 OPS-EXEC-01 + OPS-EXEC-02 closed as discrepancy branches | Both fixes/cleanups had already partially happened out-of-band (edge fix live; historic ~658k corpus already deleted). The phases pivoted from "apply" to "verify + persist the audit trail" rather than re-applying | ✓ Good — verification + runbook annex still produced; 5/5 Verified without redundant mutation |
| v1.10 redactor field-scoping bug (SEC-PII-02b) fixed in-flight rather than deferred | The all-fields walk false-matched the legitimate 64-hex `owner` hash; per the milestone's "opportunistic in-flight code adds" execution model, the fix landed inside Phase 14 rather than spawning a separate cycle | ✓ Good — 422 genuine `reset_key` leaks redacted; `PII_FIELDS` allowlist [message, flags] now the documented scope |
| v1.10 closed with influx fix (`9b6d931c`) tracked as quick-task `260605-inf` but deploy left to operator | Influx fix is a post-close addition, not one of the 5 v1.10 requirements; force-rollout is a production action on the operator's timeline. Recorded so the tracking survives the milestone boundary | ✓ Resolved — v1.11 OPS-EXEC-03 verified it autoredeployed and is live (discrepancy branch) |
| v1.11 fs-finder replaced with a hand-written native helper (`finder.js`), not `fs-extra` glob | `fs-extra` has no glob/recursive-find; native `fs` is the realistic tool. A manual synchronous stack/recursion walk is version-independent — avoids the Node-19 `{recursive:true}` gap that the `>=19.x` engines floor would expose | ✓ Good — plan-checker caught the Node-19 trap pre-execution; helper centralizes the contract in one spec |
| v1.11 fs-finder replacement uses pre-order DFS in readdir order (not BFS or LIFO) | Code review found the first cut (LIFO stack) reversed sibling order vs fs-finder's `getPathsSync` pre-order DFS — would have changed `platform.js` `ymls[0]` for repos with multiple equal-depth `thinx.yml`. Matching fs-finder's exact walk preserves behavior | ✓ Good — behavior-preservation proven via direct-node tests |
| v1.11 Dependabot triage scope = Moderate (3 overrides, defer uuid) | Runtime-tree High was already 0 (both Highs dev-only); only `@hapi/wreck` is runtime. `uuid 8→11` is a 3-major bump risking nyc/jest-junit. Remediate the safe/runtime set, defer the toolchain-risk one | ✓ Good — runtime tree 0/0; mocha intact; uuid documented deferred-dev-only |
| v1.11 OPS-EXEC-03 closed as discrepancy branch (no force-rollout) | Operator-authorized SSH probing found the influx fix already live (autoredeployed ~17h prior). Re-rolling an identical healthy image is pure restart risk; verify + annex instead | ✓ Good — DEVICE_CHECKIN=16, 0 BADSTRING; corrected stale co-location memory (micro, not core) |
| v1.11 closed at `tech_debt` with Phases 15/16 unpushed/undeployed | The 4 requirements (remove fs-finder, triage deps, confirm influx live) are met and code/audit-verified; pushing+deploying 15/16 is follow-on operator work outside the requirement set. Full CI suite validates on push | — Pending — operator push → CI green → optional prod deploy of 15/16 |

| v1.13 SEC-CSP-01 + SEC-CSRF-01 combined into one phase | Same three deploy surfaces and the same two-console consistency check; `granularity: coarse` | ✓ Good — one deploy pipeline, one verification pass |
| CSRF via double-submit cookie, not a server-side synchronizer token | Stateless; works identically for the classic and Vue consoles across `app.`/`console.`/`rtm.` subdomains; no session-store coupling | ⚠️ Revisit — review WR-06: the cookie is scoped to `.thinx.cloud`, so a sibling subdomain can plant it; a session-bound HMAC token is the stronger design |
| CSRF rolled out fail-open (21-04), enforcement flipped separately (21-05) | Lets both consoles be verified live before a bad token can lock anyone out; enforcement is a single env flag with a documented rollback | ✓ Good — two browser-found defects fixed before the flip; no lockout |
| Console CSRF wired through two shared seams, not per call site | Four plan-check passes kept finding missed call sites | ✓ Good — no call-site regressions after the flip |
| HawkScan acceptance criteria closed by operator override | StackHawk was removed (`bb0ce4a7`); substitute evidence = CSP parse, CSRF specs, live probes, operator cold-browser approval | — Pending — a substitute DAST run (e.g. Burp) would turn the override into evidence |
| Production CSP source of truth = gluster bind mount, documented rather than removed | Discovered mid-phase; removing the mount while the Vue image config lacks `app.thinx.cloud` would lock out cold Vue sessions | ⚠️ Revisit — finish the retirement path in `console-csp-source-of-truth.md` |
| Phase 22 re-opened CI-03 after verification instead of accepting the public-page evidence | 22-02 marked CI-03 complete without the logged-in Layout check; the verifier found the Layout footer links had no href (missing hostnames mixin, pre-existing) | ✓ Good — 22-04 fixed it with the per-component mixin pattern and marked CI-03 complete only after a logged-in approval |
| Layout gets the hostnames mixin per component, not a global `Vue.mixin` or a populated prototype | A global mixin would run the hostnames `data()`/`created()` on every component instance, library components included; four pages already use the per-component pattern | ✓ Good — 2-line fix, template byte-identical |
| Console `test:unit` stays a local pre-deploy guard for now | It runs in no CI job or image build (review WR-03); adding it to the Vue Dockerfile is the known fix | ⚠️ Revisit — wire `yarn test:unit` into the Vue image build |
| Phase 23 kept the legacy worker `cmd` shell path during the rollout (D-01/D-03) | Either-order API/worker deploys during the change window; production showed 0 legacy jobs afterwards | ⚠️ Revisit — the user confirmed no other deployments exist (2026-09-28); removal is in the worker todo |
| Phase 23 code review ran 5 fix passes (2 beyond the 3-iteration cap, user-approved) | Each pass surfaced the next edge of the build-queue/worker lifecycle (busy flag, reservation expiry, queue drops, reconnect) | ⚠️ Revisit — plan the queue/worker lifecycle as one change (worker todo Part 3) rather than patching it inside a sink-hardening phase |
| 35-minute prep reservation as a stopgap instead of per-reservation owner tokens | The 2-minute bound let a second request take the single worker from a build that was still cloning; raising the bound was one constant and safe for 1 replica | ⚠️ Revisit — owner token in the worker todo |
| Phase 24 kept the env fallback behind every `readSecret()` (D-06) | Code could deploy before any secret existed; each `--secret-add` was reversible with `--secret-rm` and no value was lost | ✓ Good — no outage across three services. ⚠️ Revisit — SEC-CFG-03 removes the fallbacks, WORKER_SECRET first (review WR-01; operator already dropped it from `.env`) |
| Secrets added one service at a time with `docker service update`, never `restart.sh`/stack deploy | A stack deploy would also re-read `.env` and re-apply the yml, e.g. mount the unmounted DB/Redis secrets (WR-02) | ✓ Good — every step had a checkpoint and a one-command rollback |
| WORKER_SECRET rotated as a paired api+worker update, proven by a manual console Build | The value in env had leaked into logs (Phase 23), and the production build-queue cron loop does not dispatch | ✓ Good — the Fridge build succeeded on the new value. The queue defect is deferred |
| Critical review finding CR-01 (GitHub OAuth cross-user token) fixed and deployed inside Phase 24 | Pre-existing but live; the operator asked for it ASAP | ✓ Good — per-request token handling, isolation spec, CI and live logins green |
| Phase 27 upgraded InfluxDB in place (`influxd upgrade` on a copy, one `docker service update`), not a side-by-side migration | Small data (~4 MB backup); keeps the bucket id and DBRP mapping; one-step `docker service rollback` until the D-07 deletion | ✓ Good — ~2 min write gap, history equal; rollback window closed by operator `delete-all` 2026-10-03 |
| Dormant connector shipped before the cutover (stats off without `INFLUXDB_TOKEN`) | Decouples the code deploy from the irreversible storage upgrade | ✓ Good — the first push caught a ms-timestamp collision bug in CI (#15564) before any data moved |
| InfluxDB UI credentials: go-B (random admin password as an unmounted secret, UI via SSH tunnel) | Keeps edge basic-auth and InfluxDB credentials independent; no password-sync duty | ✓ Good |
| 27 review CR-01 (API-key substring match, pre-existing) split out as quick task 261003-s59 | Outside the phase goal but a live auth bypass | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:plan-phase` close-out or equivalent):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated (collapse into `<details>` after milestone close)
3. New requirements emerged? → Add to v1.x backlog (REQUIREMENTS.md) or next-milestone candidates
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Validated requirements collapsed into a `<details>` block
4. Out of Scope reasoning audited
5. Context + Next Milestone Goals updated

---
*Last updated: 2026-10-03 after Phases 26 (Vue Console Log Paging) and 27 (InfluxDB 2 Upgrade)*
