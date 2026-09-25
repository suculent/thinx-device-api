# Project Research Summary

**Project:** THiNX Device API, milestone v1.14 Backlog & Hardening Sweep
**Domain:** Security hardening, backlog closure and ops hygiene for a live brownfield Node/Express (CommonJS) IoT API on a two-node Docker swarm, with a console submodule
**Researched:** 2026-09-25
**Confidence:** HIGH for codebase facts (every researcher read source at `thinx-staging` `ad206a0b`); MEDIUM for Swarmpit internals, InfluxDB shard timing and action versions; LOW for live production state that nobody could inspect (Docker Engine version, Swarmpit stack file, CircleCI project vars)

## Executive Summary

v1.14 does not build a product. It finishes twelve pieces of hardening and backlog work on a system that has to stay up the whole time (5-minute push-to-deploy SLA, legacy console routes frozen). All four researchers agree on one point: **no new npm dependencies are needed.** Node built-ins (`crypto`, `child_process`, `fs`, `path`) plus the installed `express-session`, `nano`, `influx` and the in-repo `readSecret()` cover everything. The version changes are all outside npm: CodeQL `@v4` with `checkout@v7`, `influxdb:1.8` in CI compose to match production, and a config-only Swarmpit trim on 1.9.

Several items are smaller than their names suggest, and a few are much larger. **Three are already mostly done**, the same "discrepancy branch" pattern v1.10 and v1.11 hit. Registry login retry exists (`be376db9`) and one raw login remains at `.circleci/config.yml:767`. The Vue hostname var is wired (`3f2f6da4`). The Vue `connect-src app.thinx.cloud` fix shipped in console `60e1ef0`. These phases must open by verifying current state, not by writing code. **WR-06 is the hardest item.** Because of `saveUninitialized:false`, anonymous visitors have no stable `sessionID`, and nearly every CSRF-protected route runs before login, so a literal "HMAC over session id" design locks everyone out at cold login. It needs a pre-session (or an anonymous binding), `session.regenerate()` at every interactive login site (none exist today, so session fixation is also open), a priming endpoint that re-mints stale tokens, and a deterministic key. **Log paging** is blocked by a real bug: design docs are injected only at DB creation, so no view change has ever reached production. The existing `logs_by_owner` view is also keyed `[date, owner]`, which means the legacy "200 items" are 200 rows across *all tenants*, filtered in JS.

The main risks are self-inflicted outages on the deploy path: a CSRF lockout after the enforcement flip, a per-boot random HMAC key that turns every autoredeploy into a wave of 403s, `readSecret()` returning `null` where guards expected `undefined`, git fetch success detection inverting when `2>&1` disappears, a blanked stats dashboard from flipping the Influx default RP, and a Swarmpit trim that silently kills autoredeploy for every later phase. The mitigations the researchers converge on: ship fail-open with reason-coded telemetry and then enforce; resolve keys from secrets or a derivation, never at random; lock behaviour with specs before refactoring; shorten `autogen` rather than moving the default; and trim Swarmpit last, one component at a time, gating each step on a real push-to-redeploy.

## Key Findings

### Recommended Stack

Nothing to install. The work consists of wiring existing primitives correctly (details: STACK.md).

**Core technologies:**
- `node:crypto` (`createHmac`, `timingSafeEqual`, `hkdfSync`): WR-06 OWASP signed double-submit token, about 30 lines in `lib/middleware/csrf.js`. Do not adopt `csrf-csrf`; `csurf` is deprecated.
- `express-session` 1.19 `req.session.regenerate()`: rotation on login, which also closes session fixation. connect-redis 9 deletes the old key.
- `node:child_process` `execFileSync("git", argv)` with a constant `GIT_SSH_COMMAND` and `SSH_ASKPASS_REQUIRE=force` (OpenSSH ≥ 8.4, present in Alpine 3.24): removes `ssh-agent sh -c` entirely. `builder.js` `prefetchPublic`/`runGitCommand` is already the in-repo template.
- `fs.realpathSync` + `path.relative` containment (the idiom in `secrets.js:25-30`): builder path and symlink sinks.
- `lib/thinx/secrets.js` `readSecret()`: SEC-CFG-02, adoption only.
- `nano` 11 view keyset paging (`startkey` + `startkey_docid` + `limit n+1`): log paging. Not Mango, not `skip`.
- `influx` 5.11 `alterRetentionPolicy("autogen", …)` inside `provisionDB()`: retention reconciled on boot.
- `github/codeql-action@v4` + `actions/checkout@v7`, `javascript-typescript`, `build-mode: none`. Only GitHub-owned actions are allowed by repo policy. v3 is deprecated in Dec 2026.
- Swarmpit stays on 1.9. Unsetting `SWARMPIT_INFLUXDB` is the only stats switch, and autoredeploy is an in-app 60s job that needs `swarmpit_db` but neither InfluxDB nor the agent.

**Version notes:** switch CI `docker-compose.yml` from `dhi.io/influxdb:2` to `influxdb:1.8`, because the v2 compat API cannot run RP DDL and CI would never exercise the retention code. Do not bump the `circleci/docker` orb in the same change. `shell-escape` can be dropped only if `builder.js:944` stops using it.

### Expected Features

**Must have (table stakes, each item counts as done only when this holds):**
- WR-06: signed token `hmac.random`; pre-session created by the priming GET; `regenerate()` on all interactive login paths (password, token login, Google, GitHub; **not** the per-request Bearer bridge at `router.js:94`); priming re-mints invalid tokens instead of echoing them; logout clears the token; the wire contract is frozen (`XSRF-TOKEN` / `X-XSRF-TOKEN` / `GET …/csrf-token` / `csrf_token_invalid`), so consoles need no change; a new `Set-Cookie: XSRF-TOKEN` goes out in the login response.
- WR-04: `csrf.verifyCsrfToken` on `POST /api/v2/user`; priming contract documented in OpenAPI; enforced-mode spec (CI currently runs fail-open).
- CSP source of truth: image `default.conf` header directives mirror the gluster file (templated, so not a byte copy); normalising parity check; classic register/forgot/reset-confirm spot-check **after** WR-06 is live.
- SEC-CFG-02: every credential read goes through `readSecret()` with env fallback. The found inventory is 9 secrets plus 3 non-secret IDs, not "~20". `GIT_KEY_PASSPHRASE` is passed explicitly to the git child env.
- builder.js: one containment helper, symlink refusal on repo-controlled reads and writes (`thinx.yml` is read and **written back** with decrypted Wi-Fi credentials), `sanitka` on `device.owner`/`udid` in `BUILD_PATH`.
- git.js: argv-only, stderr captured, success semantics kept, dead `prefetch()` removed.
- CodeQL on `main` (+ `thinx-staging`), current majors; registry-login everywhere; Vue footer verified against the live bundle.
- Log paging: opt-in on the v2 routes only, owner-keyed views in a **new** design doc, rev-aware upsert at boot, opaque cursor that never carries the owner, `has_more` instead of a total.
- Influx: `autogen` on `stats` finite (90d recommended) and still DEFAULT. Swarmpit: stats off, `swarmpit_influxdb` gone, autoredeploy within SLA.

**Should have (cheap differentiators):**
- `CSRF_MODE` switch separate from `CSRF_ENFORCE` (fast rollback of the binding without dropping enforcement)
- CSRF on cookie-authenticated mutation routes (`DELETE /api/v2/user`, `/api/gdpr/revoke`, …), skipped for Bearer
- `git -c core.symlinks=false`, `protocol.allow=never` + https/ssh only, `--` before URL
- Paged build list with no prune side effect; `flags` included in the audit view value
- Parametrised `registry-login` also covering the docker.io/dhi.io logins, fail-fast on `unauthorized`
- Boot log of secret *source* per name; CI CSP drift check
- Drop `swarmpit_agent` as a separate, verified step

**Defer (v1.x+):** cookie rename / `__Host-` cookies, Swarmpit replacement (shepherd/webhook), retiring the gluster bind mount, Influx downsampling CQs, Swarmpit 1.10 upgrade (unless Docker Engine forces it).

**Anti-features:** `saveUninitialized:true`; token expiry; machine-client CSRF exemption; editing `_design/logs` in place; `skip` paging or `total_rows`; making `31d` the default RP; `execFileSync("sh", ["-c", script])` as a "fix"; suppression comments instead of fixes; `isomorphic-git`.

### Architecture Approach

Four patterns carry the whole milestone. (1) **Opt-in extension with a frozen legacy path:** paging activates only when query params are present, and the no-param branch is today's code. (2) **Code-first, fallback-preserving secret migration:** switch reads, deploy, `docker secret create`, `service update --secret-add` one at a time, mirror into both stack files, and only then remove env. Never use `restart.sh`/`stack deploy`, which resets the chronograf password. (3) **Reconcile-on-boot for datastore schema:** Influx RPs and CouchDB design docs are declared in code and converged idempotently. (4) **Structured operation instead of a command string:** `git.cloneAndPull({...})` owns argv/env/cwd. Every change lands on one of four deploy surfaces, and phases should be grouped by them: backend image (B), console submodule (C), swarm ops (S), CI only.

**Major components (new or modified):**
1. `lib/middleware/csrf.js` + `router.auth.js`/OAuth routers: HMAC mint and verify, module-scope key (3 factory instances exist), `establishSession()` helper with `regenerate`
2. `lib/thinx/git.js` (structured op) + new `lib/thinx/paths.js` (`within(root, …)` + symlink guard); callers `builder.js`, `devices.js`, `sources.js` and their 3 specs change together
3. `lib/thinx/database.js` `ensureDesign()` + new `_design/paging` docs + `audit.fetchPage` / `buildlog.listPage` + `router.logs.js` branch; Vue stores and History page follow
4. `lib/thinx/influx.js` declared RP list including `autogen`
5. Ops artifacts: gluster `console/default.conf`, `docker secret`s, Swarmpit stack snapshots under `.planning/runbooks/swarm-configs/`

### Critical Pitfalls

1. **CSRF token with no session to bind to (WR-06):** a cold-login lockout under enforcement. Settle the pre-auth design in CONTEXT, ship fail-open with `binding_mismatch`/`session_mismatch` reason codes, and verify cold login on both consoles plus both OAuth paths before enforcing.
2. **Per-boot random HMAC key:** every autoredeploy or reschedule invalidates all tokens. Resolve once at module scope from `readSecret("CSRF_SECRET")` with an HKDF fallback from the session secret, and fail closed if neither exists. Verify with a forced `thinx_api` redeploy mid-session.
3. **`readSecret()` returns `null`, not `undefined`:** `typeof` guards pass and integrations initialise with null (Slack, worker auth, Rollbar). Rewrite guards as `if (v)`, add null-case specs, and reset the cache in `beforeEach`. Never sweep `CSRF_ENFORCE` or other non-secret toggles.
4. **git.js argv loses `2>&1` and the shell-built `basename.json`:** every private build reports `git_fetch_failed`, and the catch path throws on `ENOENT`. Pipe stderr, guard `e.stdout`, lock behaviour with `file://` bare-repo, injection and missing-binary specs, and verify with a real private build in production.
5. **Design docs never reach production / an in-place edit stalls it:** `404 missing_named_view` in prod while CI is green. Use a new design doc, a rev-aware upsert, warm the index outside 01:00-05:00 UTC, and test against a DB where the doc already exists.
6. **Swarmpit trim kills autoredeploy:** it stalls every later deploy without an error. One component per step, a no-op push after each, never touch `swarmpit_db`, keep the `swarmpit/influxdb.conf` file that `thinx_influxdb` bind-mounts, avoid the ~06:45 UTC unattended-upgrade window, and do it last.

Also: flipping the Influx default RP silently blanks the dashboard; `startsWith` containment misses symlinks and prefix siblings; single-file gluster bind mounts pin the inode (use `service update --force` after editing); `docker exec` is node-local and `name=influxdb` matches both InfluxDBs.

## Implications for Roadmap

### Reconciling the researchers' orderings

The four researchers disagreed on three points:

| Conflict | ARCHITECTURE | PITFALLS | Resolution |
|---|---|---|---|
| CodeQL first or after the sink fixes? | First (before/after signal for 5/6) | After (smaller alert baseline) | **First, as a non-required check.** The closure signal for the sink fixes is worth more than a quiet baseline. The alert flood is triage, not a blocker, as long as the check is not required and default setup is off. |
| Secrets before CSRF? | CSRF (23) before secrets (25); key derived from session secret, moved to a swarm secret later | Secrets first, because the HMAC key must be a real secret | **Secrets before CSRF.** The deterministic-key requirement is the biggest lockout risk. Provisioning `CSRF_SECRET` in the sweep lets WR-06 ship against a real secret (the HKDF fallback stays as a safety net). The cost is only a later start for WR-06. |
| git.js vs secrets sweep (`GIT_KEY_PASSPHRASE`) | git.js before the sweep | Sinks before or with the sweep | **Agreed: sinks before secrets.** git.js passes `GIT_KEY_PASSPHRASE: readSecret(...)` explicitly (it works with the env fallback before any secret exists). The sweep then enlarges `/run/secrets` only after the symlink hole is closed. |
| Swarmpit | Last | Last | **Last**, in its own window, not combined with any code deploy. |

### Phase 22: CI & SAST Baseline (verify-first)
**Rationale:** No runtime risk. It removes CI flakes every later phase depends on and gives CodeQL before/after evidence for Phase 23. Two of its three items are likely discrepancy branches.
**Delivers:** CodeQL workflow rewrite (`@v4`, `checkout@v7`, `javascript-typescript`, `build-mode: none`, triggers on `main` + `thinx-staging` + PRs to `main`, `paths-ignore` for vendored assets, non-required, default setup confirmed off); `config.yml:767` routed through `registry-login` (optionally parametrised for docker.io/dhi.io); Vue hostname verified in the live bundle and footer links; optionally `influxdb:1.8` in CI compose.
**Addresses:** items 7, 8, 9. **Avoids:** Pitfalls 17, 18, 19.

### Phase 23: Build-Pipeline Sink Hardening
**Rationale:** git.js and builder.js share `builder.js` and the fetch call graph, so they run sequentially on one branch (Phase 7 lesson). git.js goes first because it redefines the `prefetchPrivate` contract and introduces the explicit env passing the sweep needs. It comes before secrets because the sweep turns `/run/secrets` into a more valuable symlink target.
**Delivers:** `git.js` structured op on argv (constant `GIT_SSH_COMMAND` + askpass, no ssh-agent), stderr captured, transports restricted, dead `prefetch` removed, 3 callers + 3 specs migrated; `lib/thinx/paths.js` containment + symlink refusal at every repo-controlled sink; `sanitka` on `BUILD_PATH`; `languages_path` recorded as an app-owned false positive.
**Addresses:** items 5, 6 (+ 4b coupling). **Avoids:** Pitfalls 7, 8.

### Phase 24: Secrets Sweep (SEC-CFG-02)
**Rationale:** After 23 (explicit passphrase already flows). Before 25 so `CSRF_SECRET` joins the same `docker secret create` batch.
**Delivers:** code switch with env fallback (a zero-behaviour-change deploy) and null-safe guards; `docker secret create` + `service update --secret-add … target=NAME` one service at a time; mirrored into gluster `thinx.yml` **and** repo `docker-swarm.yml` (also fix its stale `image: thinxcloud/api:latest` drift); `CSRF_SECRET` provisioned; env removal as a final, separate step (shared `WORKER_SECRET` waits for the worker repo).
**Addresses:** item 4. **Avoids:** Pitfalls 4, 5, 6, 22.

### Phase 25: CSRF v2 + Console Edge Parity
**Rationale:** WR-04 and WR-06 share middleware, specs and live two-console verification. The CSP spot-check is meaningful only once WR-06 is live, so one verification pass covers all three (the v1.13 combined-phase precedent was rated "Good").
**Delivers (plan order):** production-log check for external `POST /api/v2/user` callers → WR-06 fail-open deploy with new reason codes (+ `CSRF_MODE` switch) → observe → cold logins on both consoles plus OAuth → enforce → WR-04 + OpenAPI priming docs + enforced-mode specs → CSP header mirror + parity script → gluster edit if decided (then `service update --force` both consoles) → combined classic register/forgot/reset spot-check at network level.
**Addresses:** items 1, 2, 3. **Avoids:** Pitfalls 1, 2, 3, 13, 14, 15, 16.

### Phase 26: Log Paging (backend → Vue → pointer bump)
**Rationale:** Largest feature and isolated from the security work, so a paging regression cannot be confused with a CSRF lockout. Its backend files do not overlap 23-25, so it can interleave if the schedule needs it.
**Delivers:** `Database.ensureDesign()` rev-aware upsert; `_design/paging` with `[owner, date]` audit and `[owner, start_time]` build projection views (small values, no prune); opt-in `limit`/`cursor` on v2 audit/build routes; legacy no-param path locked by a shape spec; cross-owner cursor test; index warmed; Vue store `fetchPage` + "Load more" that tolerates the legacy array; submodule pointer bump.
**Addresses:** item 10. **Avoids:** Pitfalls 9, 10, 23.

### Phase 27: Data Retention & Swarm Footprint
**Rationale:** Retention is a tiny self-applying code change. The Swarmpit trim touches the deploy orchestrator every earlier phase relied on, so it goes last, in a separate window from any code deploy.
**Delivers:** `influxd backup` then `autogen` on `stats` shortened in `provisionDB()` (scoped to `stats`, never `isDefault` flips), `InfluxRetentionSpec` extended, verified in `thinx_influxdb` (1.8, correct node). Then Swarmpit: snapshot the stack, check Docker Engine version, unset `SWARMPIT_INFLUXDB` → push test → remove `swarmpit_influxdb` → push test → (optional) remove `swarmpit_agent` → push test; keep `swarmpit/influxdb.conf`; rung-1 recovery staged.
**Addresses:** items 11, 12. **Avoids:** Pitfalls 11, 12, 20, 21.

### Phase Ordering Rationale

- Hard edges: 23 (git.js explicit env) → 24 env removal; 24 (`CSRF_SECRET`) → 25; WR-06 live → CSP spot-check; `ensureDesign` → paging queries; paging backend → Vue; all B/C phases → Swarmpit trim.
- Grouping follows deploy surfaces and shared files: 23 is all backend `builder.js` graph; 25 is backend + console + gluster verified together; 27 is mostly swarm ops.
- Security risk goes down steadily: the scanner signal arrives first, the real sinks close before secrets become file-backed, and the enforcement flip happens against a stable, provisioned key.

### Research Flags

Need `/gsd:plan-phase --research-phase` or a thorough discuss-phase:
- **Phase 25 (CSRF v2):** the pre-auth binding decision, rotation seams across 5+ login sites, and classic console behaviour after rotation (classic has no retry). This is the highest-risk phase.
- **Phase 26 (Log paging):** `date` field format across old `managed_logs` docs (collation), index build time on the production corpus, the Vue store contract shared with the dashboard (`store/stats.js`).
- **Phase 27 (Swarmpit part):** live-state unknowns (Engine version, stack file location, whether Swarmpit writes to the `swarmpit` DB inside `thinx_influxdb`, agent-absence behaviour).

Standard patterns (skip research):
- **Phase 22:** a mechanical CI change; verify-first.
- **Phase 23:** in-repo templates exist (`prefetchPublic`, `secrets.js` containment, finder.js precedent). The spec-first discipline matters more than research.
- **Phase 24:** the pattern is proven by SEC-CFG-01; the runbook is the deliverable.

## Open Questions for the User (deduplicated)

1. **WR-06 pre-login binding.** (a) The priming GET creates a short-TTL Redis pre-session and the token binds to `sessionID` (OWASP; recommended by STACK/FEATURES), (b) a fixed anonymous binding pre-login and session-bound after login (ARCHITECTURE; no Redis keys for bots), or (c) plain double-submit pre-auth with HMAC binding only on authenticated routes (PITFALLS option). *Recommendation: (a), with a short pre-session TTL.*
2. **CSRF key source.** A dedicated `CSRF_SECRET` swarm secret with an HKDF-from-session-secret fallback (recommended), or HKDF only? Either way, fail closed and never generate a random key.
3. **Add a `CSRF_MODE` switch** (legacy|signed) separate from `CSRF_ENFORCE` for rollback? *Recommended: yes.*
4. **Extend CSRF to cookie-authenticated mutation routes** (`DELETE /api/v2/user`, `POST /api/user/delete`, `/api/gdpr/revoke`, `/api/v2/profile`) in v1.14, or record them as accepted risk?
5. **WR-04 rollout.** If production logs show external `POST /api/v2/user` callers, allow a one-window per-route fail-open observation period, or enforce immediately?
6. **Legacy audit no-param path.** Keep it byte-identical, including the cross-tenant 200-row quirk and `flags` always `["info"]`, or switch it to the owner-keyed view (same shape, more correct) as a recorded compatible fix?
7. **Paging API shape.** `{response:[…], paging:{limit,has_more,next_cursor}}` (legacy clients unaffected) vs `{response:{items,next}}` (fits Vue `parseResult`), and param name `cursor` vs `bookmark`. *Recommendation: keep `response` an array and add `paging`; name it `cursor`.*
8. **InfluxDB retention length.** 90d (matches `db0`) or 31d? Accept that the all-time `count` totals become "last N days"? Confirm a backup before the change.
9. **CSP mirror direction.** Pure mirror of production, including its weaker `X-Permitted-Cross-Domain-Policies: all`, or also harden production (Referrer-Policy / Permissions-Policy / `none`) via a gluster edit in this milestone?
10. **SEC-CFG-02 scope.** The inventory found 9 secrets + 3 IDs in `lib/`, not ~20. Include `config.json`-held secrets (session secret, JWT material) and host scripts? Remove env values within v1.14 or leave that to a follow-up (`WORKER_SECRET` depends on the worker repo)?
11. **git.js design.** Drop `ssh-agent` in favour of `GIT_SSH_COMMAND` + askpass (recommended), or keep ssh-agent with a constant script and positional args? Also: is `builder.js:944` (remote builder `shellEscape`) in scope, which decides whether `shell-escape` can be removed? Add `core.symlinks=false` on clone (check whether firmware repos rely on symlinks)?
12. **Swarmpit depth.** Also remove `swarmpit_agent` (loses live UI events and node stats), or stop after `swarmpit_influxdb`? Where does the Swarmpit stack file live on `micro`?
13. **CodeQL triggers.** Scan `thinx-staging` pushes too (recommended, since production code arrives there) and keep the check non-required until the baseline is triaged?

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Codebase, `node_modules` and the live GitHub API read directly; external versions (codeql-action v4, checkout v7) MEDIUM, confirm majors at plan time |
| Features | HIGH | Scope derived from source with file:line evidence; OWASP pattern from the primary source |
| Architecture | HIGH | Integration points read at HEAD; Swarmpit internals MEDIUM (source read, not trialled) |
| Pitfalls | HIGH / MEDIUM | Code pitfalls cite exact lines; Influx shard timing and agent-removal safety MEDIUM/LOW |

**Overall confidence:** HIGH for what to build and in what order; MEDIUM for the ops phase outcomes until live checks are done.

### Gaps to Address

- **Docker Engine version on `micro`/`core`:** Engine 29.0-29.2 rejects Swarmpit 1.9's API 1.30 default. Check before Phase 27 (and ideally now, since unattended upgrades touch `docker-ce`).
- **Swarmpit stack file location and agent-absence behaviour:** snapshot and trial in Phase 27.
- **Whether Swarmpit writes to the `swarmpit` DB inside `thinx_influxdb`:** a live check before assuming the trim removes that load.
- **CircleCI `VUE_WEB_HOSTNAME` project var and console repo CI wiring:** verify in Phase 22.
- **`managed_logs` `date` format consistency:** sample the oldest and newest docs before choosing the cursor key.
- **External callers of `POST /api/v2/user`:** grep production logs before WR-04 enforcement.
- **CodeQL default setup state:** reported `not-configured`; recheck before merging the workflow.
- **OpenSSH `SSH_ASKPASS_REQUIRE` in the api image:** assumed ≥ 8.4 on Alpine 3.24; confirm in the built image.
- **InfluxDB 1.8 ALTER semantics (shard duration reset, first-deletion lag):** confirm against the 1.8 docs at plan time.

## Sources

### Primary (HIGH confidence)
- Codebase at `thinx-staging` `ad206a0b`: `lib/middleware/csrf.js`, `thinx-core.js`, `lib/router.{auth,user,logs,google,github,js}.js`, `lib/thinx/{git,builder,devices,sources,secrets,audit,buildlog,database,influx,queue,messenger,session_token}.js`, `design/*.json`, `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml`, `docker-swarm.yml`, `docker-compose.yml`, console `vue/src/{utils/cookies.js,core/api.js,mixins/hostnames.js,store/*}`
- Live GitHub API: default setup not configured, Actions policy GitHub-owned only, last analysis SonarCloud 2022-04
- Project records: PROJECT.md, STATE.md, AGENTS.md, runbooks (`console-csp-source-of-truth.md`, `csp-csrf-hardening.md`, `swarm.md`), memory notes (swarm topology, stack deploy, registry limits, unattended-upgrade outage, backlog notes)
- OWASP CSRF Prevention Cheat Sheet (signed double-submit, pre-session, regenerate on auth)
- npm registry: csrf-csrf 4.0.3, csurf deprecated, nano 11.0.7, express-session 1.19.0, influx 5.12.0

### Secondary (MEDIUM confidence)
- codeql-action CHANGELOG / GitHub changelog: v4 current, v3 deprecated Dec 2026; actions/checkout v7 releases
- Swarmpit source at tag 1.9 (`config.clj`, `database.clj`, `agent.clj`, `stats.clj`) and configuration docs
- CouchDB pagination recipe and `_find` docs
- Docker Engine 29 API floor change (blog + forum)
- InfluxDB 1.x retention/shard docs and issue #7150; bind-mount inode behaviour (moby #6011)

### Tertiary (LOW confidence)
- DHI InfluxDB catalog being v3-only (search snippets)
- Safety of removing `swarmpit_agent` (undocumented; source inference only)

---
*Research completed: 2026-09-25*
*Ready for roadmap: yes*
