# Architecture Research: v1.14 Backlog & Hardening Sweep

**Domain:** Integrating 12 hardening and backlog items into an existing Node/Express IoT API monorepo (THiNX Device API), with a console submodule, a Docker swarm, and CircleCI/GitHub Actions
**Researched:** 2026-09-25
**Confidence:** HIGH for integration points (read directly from source at `thinx-staging` HEAD `ad206a0b`). MEDIUM for the Swarmpit internals (read from upstream source, not yet tested on our swarm). LOW for anything that depends on production state I could not inspect (live CircleCI project vars, the live `thinx.yml`, the Swarmpit stack file).

## Standard Architecture

### System Overview (v1.14 touch points marked `*`)

```
┌──────────────────────────── CI / supply chain ─────────────────────────────┐
│ GitHub Actions: codeql-analysis.yml *(7)       CircleCI: .circleci/config.yml│
│   (triggers on deleted `master`, action v1)      registry-login cmd (exists) │
│                                                  test job raw docker login *(8)│
└───────────────┬───────────────────────────────────────────┬────────────────┘
                │ thinx-staging push                          │ console repo main push
                ▼                                             ▼
┌─────────────── Backend image (thinx/api:swarm) ─────────────┐  ┌──── Console submodule images ────┐
│ thinx-core.js                                                │  │ classic  src/  (console:swarm)    │
│  ├ session(x-thx-core, RedisStore)  *(1) regenerate/binding  │  │   src/default.conf *(3)           │
│  ├ cookieParser → csrf.ensureXsrfCookie  *(1)                │  │   assets/thinx/csrf.js (no change)│
│  ├ lib/router.js (Bearer→req.session.owner)                  │  │ Vue  vue/  (console:vue)          │
│  ├ router.auth.js  login / session/token / csrf-token *(1)   │  │   vue/default.conf *(3)           │
│  ├ router.user.js  POST /api/v2/user  *(2)                   │  │   utils/cookies.js (no change)    │
│  ├ router.logs.js  audit + build list  *(10)                 │  │   store/auditlog.js, buildlog.js, │
│  └ InfluxConnector.createDB('stats') *(11)                   │  │   pages/History *(10)             │
│ lib/middleware/csrf.js  *(1)(2)                              │  │   mixins/hostnames.js *(9)        │
│ lib/thinx/secrets.js readSecret  ← sweep callers *(4)        │  └──────────────┬───────────────────┘
│ lib/thinx/builder.js  *(5)  → git.js *(6) ← devices.js,      │                 │
│                                    sources.js *(6)           │                 │
│ lib/thinx/audit.js, buildlog.js, database.js *(10)           │                 │
│ lib/thinx/influx.js provisionDB *(11)                        │                 │
└───────────────┬──────────────────────────────────────────────┘                 │
                ▼ private registry → Swarmpit 1-min digest poll → service update ▼
┌──────────────────────────── Swarm (micro + core, placement floats) ──────────────────────────┐
│ thinx stack (thinx.yml on gluster, mirrored by docker-swarm.yml)  secrets: *(4) new externals  │
│ gluster git repo /mnt/gluster/deployment/swarm/console/default.conf  *(3) CANONICAL CSP       │
│ thinx_influxdb (1.8)  "stats"."autogen" infinite  *(11)                                        │
│   mounts /mnt/gluster/deployment/swarm/swarmpit/influxdb.conf   ← careful with *(12)           │
│ swarmpit stack: app / agent (global) / db couchdb 2.3.0 / influxdb 1.7   *(12)                 │
│ CouchDB managed_logs (daily 365d retention cron on micro), managed_builds                      │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (new vs modified)

| # | Item | Component | New / Modified | Deploy surface |
|---|------|-----------|----------------|----------------|
| 1 | WR-06 | `lib/middleware/csrf.js` (token mint + verify), `lib/router.auth.js` `loginAction` / `performTokenLogin` (session regenerate + re-mint), `thinx-core.js` (key resolution) | Modified | Backend image |
| 2 | WR-04 | `lib/router.user.js:147` `app.post("/api/v2/user", …)` gains `csrf.verifyCsrfToken` | Modified (one line plus spec) | Backend image |
| 3 | CSP source of truth | gluster `console/default.conf` (canonical, separate git repo on the swarm), `services/console/src/default.conf`, `services/console/vue/default.conf`, `.planning/runbooks/swarm-configs/console-default.conf.prod` (+ the `rtm…*.nginx` snapshots that embed the CSP) | Modified. New: a CSP/header parity check script | Console submodule + swarm ops + parent repo docs |
| 4 | SEC-CFG-02 | callers of `process.env.<SECRET>` switch to `readSecret()` (`secrets.js` itself unchanged); `docker-swarm.yml` `secrets:` block; swarm `docker secret create` + `service update --secret-add` | Modified callers; new external swarm secrets | Backend image, then swarm ops |
| 5 | builder.js traversal | `lib/thinx/builder.js` BUILD_PATH/XBUILD_PATH derivation (lines ~633, 682, 690-700, 724-731, 797-800, 1215-1229). New: a shared path-containment helper | Modified + new helper | Backend image |
| 6 | git.js argv | `lib/thinx/git.js` `fetch`/`tryShellOp`/`prefetch`. Callers `builder.js` `gitCloneAndPullCommand` + `prefetchPrivate`, `devices.js` `gitPrefetchCommand`, `sources.js` `prefetchCommand` | Modified (contract change across 3 callers + 3 specs) | Backend image |
| 7 | CodeQL | `.github/workflows/codeql-analysis.yml` | Modified (effectively rewritten) | GitHub Actions only |
| 8 | Registry login retry | `.circleci/config.yml` `test` job "Starting Support Services" step (line ~767); the `registry-login` command already exists | Modified | CI only |
| 9 | Vue hostname var | `vue/src/mixins/hostnames.js`; CI build args already switched to `VUE_WEB_HOSTNAME` (`3f2f6da4` parent, `1dd874a` console) | Mostly verification; optional mixin fallback change | Console submodule |
| 10 | Log paging | New CouchDB view (new design doc), new design-doc upsert in `lib/thinx/database.js`, new paged fetch methods in `audit.js` / `buildlog.js`, `router.logs.js` query-param branch, Vue `store/auditlog.js` + `store/buildlog.js` + History page | New + Modified | Backend image, then console submodule |
| 11 | Influx retention | `lib/thinx/influx.js` `RETENTION_POLICY` → a declared policy list including `autogen`; `provisionDB` loop | Modified | Backend image (self-applies on boot), then swarm verification |
| 12 | Swarmpit trim | Swarmpit stack file on the swarm (not in this repo); `.planning/runbooks/swarm.md` | Ops only | Swarm ops |

## Integration Details Per Item

### 1. WR-06: session-bound CSRF token (HIGH)

**Current state (read from source):**
- `csrf.js` is a factory that gets instantiated **three times**: `thinx-core.js:352`, `router.auth.js:23`, `router.user.js:13`. It holds no state today, which is why that is harmless.
- `ensureXsrfCookie` is mounted globally **after** `sessionParser` (`thinx-core.js:345→353`), so `req.session` and `req.sessionID` are available to it. The ordering is already right.
- The token is `randomBytes(24).hex`. It is minted only when absent and never rotated. Verification is a plain `timingSafeEqual(cookie, header)`.
- Login (`router.auth.js` `loginAction`, around line 322) sets `req.session.owner`, calls `SessionToken.markLogin`, and sets `cookie.maxAge`. **It never calls `req.session.regenerate()`**, so the pre-login session id survives login (session fixation). `performTokenLogin` (lines 72/83) has the same problem.
- `saveUninitialized: false`: a visitor without a cookie gets a new, unsaved `req.sessionID` **on every request** until something writes to the session.
- Both consoles already read the token from the `XSRF-TOKEN` cookie and send `X-XSRF-TOKEN`. On `403 csrf_token_invalid` they already force a re-prime via `GET /csrf-token` and retry once, trusting the token the server echoes back (`vue/src/utils/cookies.js` `ensureCsrfToken({force})`, classic `assets/thinx/csrf.js` `ajax`).

**Integration design (recommended):**
- Keep the cookie name, the header name, the `/api/csrf-token` + `/api/v2/csrf-token` endpoints and the `csrf_token_invalid` response. If those stay fixed, **neither console needs a code change**, and the existing retry-once-with-reprime logic absorbs rotation.
- Token format: `<nonce>.<hmac>` where `hmac = HMAC-SHA256(key, binding ‖ "." ‖ nonce)`. This is the OWASP signed double-submit pattern. Verification = cookie equals header (kept) **and** the HMAC recomputes for the *current* binding.
- **Binding:** use `req.sessionID` once the session is persisted, meaning `req.session.login_owner` is set (see `session_token.js` `markLogin`). Before login, use a fixed anonymous binding. Pre-login binding to `req.sessionID` cannot work because that id changes on every request under `saveUninitialized:false`. The alternative is to force-persist an anonymous session on `/csrf-token`, which creates a Redis key for every cold visitor or bot. **Decide this in discuss-phase.** The hybrid (anon pre-login, bound post-login) is the smallest change and covers the WR-06 attack (a planted cookie cannot be valid for the victim's authenticated session).
- **Rotate on login:** in `loginAction` and `performTokenLogin`, call `req.session.regenerate()` **before** setting `owner` / `login_owner` / `maxAge`, then mint a new token bound to the new id and `res.cookie()` it in the login response. The Vue `/session/token` re-mint after reload then carries a token that matches the regenerated session.
- `ensureXsrfCookie` changes from "mint only when absent" to "mint when absent **or** when the existing token does not verify for the current binding". Without this, an expired or regenerated session leaves a permanently stale cookie. `issueCsrfToken` must echo the freshly minted value (`res.locals.xsrfToken` first, not the stale `req.cookies` value). The current order `req.cookies[...] || res.locals.xsrfToken` has to flip.
- **Key resolution:** resolve the key once at module scope, not per factory call, because there are 3 instances: `readSecret("CSRF_SECRET")`, falling back to a derivation from `session_config.secret` (`conf/node-session.json`). **Never** fall back to a random key per boot or per instance, because a restart would invalidate every token. This ties WR-06 to item 4, but only softly (it works before the secret exists).
- Keep the `CSRF_ENFORCE` / `debug.csrf_enforce` switch and the reason-coded logging. Add a reason code `binding_mismatch` so a rollout shows stale-binding rejections separately from missing headers.

**Data flow change:**
```
cold GET /api/v2/csrf-token → ensureXsrfCookie mints anon-bound token → Set-Cookie XSRF-TOKEN
POST /api/v2/login (anon token verifies) → session.regenerate() → owner/login_owner set
     → mint session-bound token → Set-Cookie XSRF-TOKEN (rotated) + JSON {access_token,…}
POST /api/v2/session/token (after reload) → cookie x-thx-core → token verifies against sessionID
session expiry / logout → next request: token fails binding → ensureXsrfCookie re-mints → console retry-once succeeds
```

**Specs:** `ZZ-CSRFSpec.js` cases 1, 4, 5 and 6 assert the old semantics ("does not overwrite an existing valid one", "echoes without minting") and have to be rewritten. The integration specs run fail-open (`spec/mnt/data/conf/config.json` `csrf_enforce: false`), so ZZ-* agent flows keep passing even without tokens. Add at least one enforce-mode agent flow covering prime → login → session/token, otherwise rotation is untested.

### 2. WR-04: CSRF on `POST /api/v2/user` (HIGH)

- Integration point: `lib/router.user.js:147`. Add `csrf.verifyCsrfToken` as route middleware, as `/api/user/create` at line 194 already has.
- **Consumers:** no Vue or classic-console call site posts to `/api/v2/user` (classic registers via `/api/user/create`; Vue only calls `DELETE /user`). The only in-repo caller is `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:46-48`, which runs fail-open. Unknown external callers (landing page, scripts, mobile) would start getting 403s the moment production enforcement is on, because `CSRF_ENFORCE` is global, not per-route.
- **Recommendation:** before shipping, grep the production API logs for `POST /api/v2/user` (per the 2026-09-25 decision, non-browser clients must prime). If traffic exists, add a per-route opt-out of enforcement for one observation window (for example `verifyCsrfToken` built via a `{ enforceEnv: "CSRF_ENFORCE_USER_CREATE" }` option). That lets the reason-coded warning log show who calls the route before the global flag takes effect for it.
- Ship WR-04 in the same phase as WR-06. They share the middleware, the specs and the live console verification.

### 3. Console CSP source of truth (HIGH on structure, MEDIUM on scope)

- **Canonical:** `/mnt/gluster/deployment/swarm/console/default.conf`, in its own git repo on the swarm, bind-mounted read-only over `/etc/nginx/conf.d/default.conf` in **both** `thinx_console` and `thinx_vue`. One file means one CSP for both hosts.
- **Mirrors:** `services/console/src/default.conf` (uses the `__WEB_HOSTNAME__` placeholder), `services/console/vue/default.conf` (uses `__NGINX_HOST__`), `.planning/runbooks/swarm-configs/console-default.conf.prod` (verbatim snapshot), and the `rtm.thinx.cloud-server.{pre,post}.nginx` snapshots, which embed the same CSP line.
- Because the image configs are templated, the mirror cannot be byte-identical. **New component:** a parity check (e.g. `scripts/check-console-headers.sh` or a small jasmine spec) that extracts the `add_header` directives from each file, normalises the placeholders, and diffs them against the `.prod` snapshot. Without it, drift comes back within one milestone, which is what happened between 2026-06-16 and 2026-09-21.
- Resolve the known divergences in the runbook in one direction: production is canonical, so the image configs gain `Strict-Transport-Security`, `cdn.rollbar.com`, CloudFront/cdnjs/gravatar/GitHub-avatars. Whether production gains `Referrer-Policy` / `Permissions-Policy` / `X-Permitted-Cross-Domain-Policies: none` is an operator decision recorded in the gluster repo. It is a live header change, so it needs a rollback via `git checkout` in the gluster repo.
- Image edits change nothing in production while the mount exists. The runtime effect only comes from the gluster edit (`nginx -s reload` inside both console tasks, or a `service update --force`).
- Spot-check (classic register / forgot / reset-confirm under enforcement) runs **after** WR-06 is deployed, so one verification pass covers both.

### 4. SEC-CFG-02: readSecret() sweep (HIGH)

- `lib/thinx/secrets.js` `readSecret(name, default)` stays as it is: file first, then env, cached, synchronous, no Globals dependency, so it is safe at module load.
- Call sites still reading `process.env` directly: `router.slack.js:29` (SLACK_CLIENT_SECRET), `router.google.js:28-29` (GOOGLE_OAUTH_ID/SECRET, **at module load**), `router.github.js:40-44,171-172` (GITHUB_CLIENT_SECRET), `notifier.js:43,240` + `redis-health.js:44` (SLACK_WEBHOOK), `globals.js:153-155` (ROLLBAR_ACCESS_TOKEN), `owner.js:13` + `transfer.js:12` (MAILGUN_API_KEY, **module-level config objects**), `queue.js:352` + `builder.js:221` (WORKER_SECRET), `messenger.js:128-148` (SLACK_BOT_TOKEN), `rsakey.js:28` (GIT_KEY_PASSPHRASE), `database.js:40` (a leftover COUCHDB_PASS read next to the readSecret one). Scripts: `scripts/redact-managed-logs.js:232,434`, `scripts/backfill-device-timezone.js:200` (these run on the host, so the sweep is optional there). The api service spec in `docker-swarm.yml` also still carries `SQREEN_TOKEN`. "~20" in the requirement probably counts env vars across the stack, not just this repo.
- **Coupling with git.js (item 6):** the askpass helper written by `git.js create_askfile` reads `$GIT_KEY_PASSPHRASE` from the **inherited process environment**. If the sweep moves the passphrase to `/run/secrets` and the env var is removed from the service spec, private-repo builds silently fail to load keys. The argv refactor must pass the value explicitly: `env: { ...process.env, GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE") }`. **Do item 6 before removing any env var in item 4.**
- **Cross-service coupling:** `WORKER_SECRET` is shared with `thinx_worker` (a separate repo) and `ROLLBAR_ACCESS_TOKEN` is used by other services. Mounting a swarm secret on the api service only is fine while the env fallback remains. Removing the env var from `thinx.yml` has to wait until every consumer reads the file.
- **Rollout order:** (a) code switch with env fallback, which is a zero-behaviour-change deploy; (b) on a manager, `docker secret create <NAME>` for each value from `/mnt/gluster/thinx/.env`; (c) `docker service update --secret-add <NAME> thinx_api` one at a time. Do **not** use `restart.sh` / `stack deploy`, because that resets the chronograf password (memory `swarm-stack-deploy-and-couchdb-dhi`). (d) Mirror into `docker-swarm.yml` `secrets:`. (e) Remove env values in a later, separate step.
- **Repo drift to fix alongside:** `docker-swarm.yml` api `image:` still reads `thinxcloud/api:latest`, but production was corrected to `registry.thinx.cloud:5000/thinx/api:swarm` on 2026-09-21. Reconcile it when touching the `secrets:` block, or the next stack deploy silently reverts the deploy path.

### 5. builder.js path traversal (HIGH on location, MEDIUM on the exact Aikido sink list)

- `BUILD_PATH = data_root + build_root + "/" + device.owner + "/" + device.udid + "/" + sanitka.udid(build_id)` (line ~633). `device.owner` and `device.udid` come from CouchDB and are not re-sanitised here. `sanitka.udid(build_id)` can return `null`, which yields a `…/null` path.
- `XBUILD_PATH = BUILD_PATH + "/" + directories[0|1]`. The directory names come from the **cloned repository** (attacker-controlled). Downstream sinks: `readFileSync(XBUILD_PATH + "/thinx.yml")` (~731), `writeFileSync(XBUILD_PATH + "/environment.json")` (~800), header-file checks (~893), and `lstatSync(path.join(BUILD_PATH, file))` (~682), where a symlink in the clone can point outside.
- Line ~1215-1229 walks the `languages_path` descriptors with the same `lstat` + `readFileSync` pattern.
- **Pattern already in the codebase:** `secrets.js` uses `path.resolve` + `path.relative` + `startsWith("..")`. `JSON2H.validatedPlatformDirectory` does exact-match directory validation, and `owner_purge.js` also uses containment. **New component:** extract one `Paths.within(root, ...segments)` helper (e.g. `lib/thinx/paths.js`, or add to `finder.js`) that resolves, rejects escapes, rejects symlinks via `lstat` where required, and returns `null` on violation. Use it at every sink. Follow the Phase 15 finder.js precedent: one helper, one spec, then the call sites.
- CodeQL (`js/path-injection`) and Aikido both re-flag these sinks. Landing item 7 first gives an objective closure signal.

### 6. git.js execSync → argv (HIGH)

- Today: `git.fetch(owner, command, local_path)` takes a **shell script string**, and `tryShellOp` runs `execSync(cmd)`. With keys, the script is wrapped as `ssh-agent sh -c '<DISPLAY=: SSH_ASKPASS=… ssh-add key; command>'`. The three command builders produce multi-step shell scripts (`cd`, `rm -rf ./*`, `git clone`, `cd *`, `git pull`, `chmod -R`, `printf … "$(basename "$(pwd)")" > ../basename.json`).
- Swapping `execSync` for `execFileSync` alone is **not possible**: the scripts depend on shell globbing, `cd *`, command substitution and redirection.
- **Target shape:** git.js exposes a structured operation, not a command, e.g. `git.cloneAndPull({ owner, dir, url, branch, pull: "rebase"|"ff-only", chmod, writeBasename })`. Internally it runs an argv sequence of `execFileSync("git", [...], { cwd, env })`, `fs.emptyDirSync`, `readdirSync` instead of `cd *`, and `fs.writeFileSync` for `basename.json`. `builder.js prefetchPublic` + `runGitCommand` + `writeBasenameMetadata` **already implement exactly this sequence for the keyless path** and are the template.
- **Key handling without a shell:** replace `ssh-agent sh -c … ssh-add` with per-invocation `env: { GIT_SSH_COMMAND: "ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new", SSH_ASKPASS: <askpath>, SSH_ASKPASS_REQUIRE: "force", DISPLAY: ":", GIT_KEY_PASSPHRASE: readSecret(...) }`. OpenSSH asks for the key passphrase through SSH_ASKPASS the same way ssh-add did. Check the OpenSSH version in the api image (DHI base) supports `SSH_ASKPASS_REQUIRE` (>= 8.4), which the current code already assumes.
- **Callers change together:** `builder.js` (`gitCloneAndPullCommand` → `prefetchPrivate`), `devices.js` `gitPrefetchCommand` → `prefetch_repository`, `sources.js` `prefetchCommand` → `add`. Their behaviours differ slightly (rebase vs ff-only, chmod 666 vs 776, basename.json written or not) and must be carried over as options, not normalised. `GitSpec.js`, `SourcesSpec.js` and `XBuilderSpec.js` lock the old static builders and have to be rewritten against the new contract. Keep `checkResponse`'s basename.json fallback semantics.
- `prefetch(GIT_PREFETCH)` (a second execSync) goes the same way. Grep for any remaining caller before deleting it.

### 7. CodeQL workflow (HIGH)

- The current file triggers on `branches: [master]`. `master` was deleted on 2026-09-19 and `main` is the default branch, so the workflow **never runs** except on the weekly cron (which runs on the default branch). It uses `actions/checkout@v2`, `github/codeql-action/*@v1` (long retired), `language: javascript` and an `npm install` step.
- Rewrite: `on: push/pull_request: [main]` + keep the schedule; `github/codeql-action/{init,analyze}@v4` (current major; v3 is deprecated in December 2026); `languages: javascript-typescript`, `build-mode: none`; drop `npm install` and the `git checkout HEAD^2` hack; keep the least-privilege `permissions`. Pin the current `actions/checkout` major at plan time.
- **Check at plan time:** if the repo has CodeQL *default setup* enabled in GitHub settings, an advanced workflow conflicts with it (SARIF upload rejected). Disable one of the two.
- Consider excluding `services/**`, vendored `static/`, and `node_modules`-like trees via `paths-ignore` in a `codeql-config.yml`. Otherwise vendored AngularJS/jQuery in the console submodule floods results. Submodules are not checked out by default, so this may be moot; verify.
- `// lgtm [...]` comments throughout the code are dead LGTM.com suppressions. CodeQL does not honour them, so expect those findings to reappear. Triage them; do not bulk-suppress.

### 8. Registry login retry (HIGH)

- The retrying `registry-login` command **already exists** (`.circleci/config.yml:9-46`, commit `be376db9`) and is used by base, vue, classic, api and snyk jobs.
- Remaining single-shot logins: `test` job line ~767 `docker login --username $DOCKER_LOGIN --password $DOCKER_PASSWORD https://registry.thinx.cloud:5000`. The password is also on argv there (visible in `ps` and a CLI warning), so switching to `- registry-login: { registry: registry.thinx.cloud:5000 }` fixes both. Also single-shot: `docker.io` logins at lines ~235 and ~309 (DOCKERHUB pair, different env names) and the `dhi.io` login at ~771. Generalise the command with `username_env`/`password_env` parameters so all four sites share one retry loop.
- Out of this repo but same class: `services/console/.circleci/config.yml` uses the orb's `docker/check` (single shot) for `registry.thinx.cloud:5000`. Submodules broker/couchdb/worker log in to `dhi.io` once. List them as follow-ups in their own repos, or port the command there in the same console pointer bump.

### 9. Vue hostname build var (HIGH; likely a discrepancy branch)

- Already landed: parent CI `build-vue-console` passes `VUE_APP_CONSOLE_HOSTNAME=${VUE_WEB_HOSTNAME}` and `WEB_HOSTNAME=${VUE_WEB_HOSTNAME}` (`3f2f6da4`, 2026-09-21), and the console repo's own CI does the same (`1dd874a`). Both preflight `VUE_WEB_HOSTNAME` in `required_vars`, so a green build means the project var exists.
- Remaining: verify the live `:vue` bundle footer (`Layout.vue:12`, `Login.vue:91`, `PasswordReset.vue:96` → `$hostnames.CONSOLE`) resolves to `console.thinx.cloud`. Optional hardening: have `hostnames.js` default `CONSOLE` to `window.location.origin` and ignore the build var. The console is always "itself", so that removes a build-time dependency entirely. Local `npm run build:test` (AGENTS.md) still sets `WEB_HOSTNAME=https://rtm.thinx.cloud`, so local builds show the classic console unless that is changed too.

### 10. Audit/build log paging (HIGH on backend, MEDIUM on the Vue scope)

**Current state (important):**
- `audit.js fetch(owner)` queries `logs/logs_by_owner` **without a key** (`descending: true, limit: 200`) and filters by owner **after** the limit. The 200 newest rows across **all tenants** are fetched and the caller's rows are kept, so a user usually sees far fewer than 200 entries. `logs_by_owner` emits `[date, owner]`, which cannot be used for owner-scoped range queries.
- `buildlog.js list(owner)` queries `builds/latest_builds` with **no key** (a full scan of every tenant's builds), filters by owner in memory, and prunes anything older than 30 days as a side effect. The view emits `doc.owner`, so `{key: owner}` would already scope it (`purgeOwner` does exactly that). The code comment claiming otherwise is stale.
- `database.js init()` injects `design/design_*.json` **only when it creates a database** (`nano.db.create(...).then(injectDesign)`). Existing production databases **never receive design-doc changes.** Adding a view to `design/design_logs.json` alone will not reach production.

**Integration design:**
- **New view in a new design doc** (e.g. `_design/paging` in `managed_logs`: `logs_by_owner_date` emits `[doc.owner, doc.date]`; optionally in `managed_builds`: `builds_by_owner_time` emits `[doc.owner, doc.timestamp]`). Do not edit `_design/logs`: changing any view in a design doc rebuilds **all** its views. That includes `logs_by_date`, which the daily retention cron on micro depends on, and a rebuild blocks queries while it runs.
- **New component:** `Database.ensureDesign(db, name, file)`, an idempotent upsert that compares content (ignoring `_rev`), inserts or updates with the current `_rev`, and is called on boot for the paging design docs. Alternatively a one-shot `scripts/` migration. An on-boot upsert keeps test and fresh installs consistent.
- Paged query: `startkey: [owner, {}]`, `endkey: [owner]`, `descending: true`, `limit: n+1`. The bookmark is the last row's `key` + `id` (use `startkey` + `startkey_docid`, never `skip`). Encode it as an opaque base64url string.
- **API contract:** paging is opt-in via query params on the existing routes (`GET /api/v2/logs/audit?limit=50&bookmark=…`, same for `GET /api/v2/logs/build`). With **no** params, run the **unchanged legacy code path** (same view, same 200 cap, same array shape), so both the classic console (`/api/user/logs/*`) and current Vue builds are unaffected. With params, respond `{ success: true, response: { items: [...], next: "<bookmark>|null" } }`. The Vue `Api.parseResult` takes the first non-`success` key, so the store receives the `{items,next}` object.
- Whether the legacy no-param path should also switch to the owner-keyed view (same shape and cap, correct contents) is a scope decision. It is arguably a bug fix, but the requirement says "unchanged". Record the decision explicitly.
- **Vue consumer:** `store/auditlog.js:47` and `store/buildlog.js:41` add paged actions. `pages/History/History.vue` adds "load more". `store/stats.js:34` also dispatches `auditlog/fetchAuditlog` for the dashboard, so keep that action's contract, or give the dashboard its own non-paged call.
- Order: backend deploy (API accepts the params) → console change → parent pointer bump. A Vue build that ships first against an old API gets the legacy array back and must tolerate it (treat an array response as "no more pages").

### 11. InfluxDB `stats` retention (HIGH)

- `thinx-core.js:166` calls `InfluxConnector.createDB('stats')` → `provisionDB` on every boot. It currently reconciles only the `31d` policy (create-or-alter), which holds no data because all writes and queries target `"stats"."autogen"` explicitly (`influx.js:66,86,108,132`).
- **Recommended integration:** turn `RETENTION_POLICY` into a declared list and add `{ name: "autogen", duration: "<N>d", replication: 1 }`. `provisionDB` already alters when the name exists, so the boot path converges production with no ops step and no query changes. Do **not** make `31d` the default: that strands existing `autogen` data, and every query names `autogen`. Optionally drop the unused `31d` policy (or leave it; it is empty).
- ALTER without `SHARD DURATION` resets the shard-group duration to the default for the new retention (1d for durations of 2d to 6 months). Existing 7-day shard groups are dropped whole once they are entirely past retention, so the first cleanup lags by up to 7 days. That is expected; do not treat it as a failure.
- **Semantic change to flag:** `query()` / `queryOwner()` run **unbounded** `count("value")`, i.e. all-time counters. After retention they become "last N days" counters. `today`/`week` are unaffected as long as N ≥ 7. Pick N with the product owner (90d matches `db0`).
- Verification is ops: `SHOW RETENTION POLICIES ON stats` inside `thinx_influxdb`. Query placement first (it floats), because `docker exec` is node-local. Keep `swarmpit_influxdb` and the `swarmpit` DB inside thinx_influxdb untouched.
- `InfluxRetentionSpec.js` already exercises `createDB` against a test DB. Extend it to assert `autogen` duration.

### 12. Swarmpit trim (MEDIUM)

- Swarmpit's **autoredeploy is a 1-minute polling job inside `swarmpit_app`** (upstream `src/clj/swarmpit/agent.clj` `autoredeploy-job`: compare the repository digest with the latest, then `redeploy-service`). It does not use the `swarmpit/agent` container, which only ships Docker events and node stats to `app:8080/events`, and it does not use InfluxDB. Removing `SWARMPIT_INFLUXDB` from the app env disables stats.
- So the target stack is `swarmpit_app` + `swarmpit_db` (couchdb 2.3.0, kept by decision). `swarmpit_influxdb` is removed (unset `SWARMPIT_INFLUXDB`), and `swarmpit_agent` can probably go too. Without the agent the UI loses live event updates and node stats, and the app may log event-endpoint health noise; confirm on the swarm with a timed trial (scale the agent to 0 → push a trivial image → observe redeploy within the ~50-65s SLA).
- **Trap:** `thinx_influxdb` (the THiNX stats DB, not Swarmpit's) bind-mounts `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf`. Deleting the swarmpit directory or its influx config while trimming breaks `thinx_influxdb` on its next restart. Move that file to a thinx-owned path first (and update `thinx.yml` + `docker-swarm.yml` line ~460), or leave it in place deliberately.
- The Swarmpit stack file is not in this repo. Capture a snapshot under `.planning/runbooks/swarm-configs/` before and after (same convention as the Phase 13 nginx snapshots) so the rollback is a `docker stack deploy` of the pre-snapshot.
- Remember the registry's CPU limit history (memory `registry-storage-and-limits`: a 0.05-CPU cap caused the 2026-09-21 deploy outage). Swarmpit's per-minute digest polling hits that registry. Trimming does not change the polling load, but do not "tune" registry limits in the same change.

## Recommended Project Structure (additions only)

```
lib/
├── middleware/csrf.js          # MOD: HMAC token, binding, stale-token re-mint, module-scope key
├── thinx/paths.js              # NEW: within(root, ...segs) containment + symlink guard (item 5)
├── thinx/git.js                # MOD: structured cloneAndPull op, execFileSync argv, explicit env (item 6)
├── thinx/database.js           # MOD: ensureDesign() idempotent upsert (item 10)
├── thinx/audit.js              # MOD: fetchPage(owner, {limit, bookmark}) (legacy fetch untouched)
├── thinx/buildlog.js           # MOD: listPage(owner, {limit, bookmark})
└── thinx/influx.js             # MOD: declared RP list incl. autogen (item 11)
design/
└── design_paging_logs.json     # NEW: _design/paging for managed_logs (+ builds variant if needed)
scripts/
└── check-console-headers.sh    # NEW: CSP/header parity vs swarm-configs/console-default.conf.prod
.github/workflows/codeql-analysis.yml   # REWRITE
.circleci/config.yml                    # MOD: parametrised registry-login, test-job login
.planning/runbooks/swarm-configs/
├── console-default.conf.prod           # REFRESH from gluster after any canonical edit
└── swarmpit-stack.{pre,post}.yml       # NEW snapshots (item 12)
spec/jasmine/
├── ZZ-CSRFSpec.js              # REWRITE cases 1/4/5/6 + new binding/rotation cases
├── PathsSpec.js                # NEW
├── GitSpec.js, SourcesSpec.js, XBuilderSpec.js   # MOD for new git contract
└── (new) ZZ-LogPagingSpec.js   # legacy-shape lock + paged-shape cases
```

### Structure Rationale

- **One helper per bug class** (paths.js, git.js structured op) follows the v1.11 `finder.js` precedent: the contract lives in one spec, and call sites become mechanical.
- **Paging lives in a new design doc** so the existing `_design/logs` (used by the host retention cron) is never re-indexed.

## Architectural Patterns

### Pattern 1: Opt-in API extension with a frozen legacy path
**What:** New behaviour activates only when new query params are present. The no-param branch is the pre-existing code, byte-for-byte.
**When to use:** Log paging (item 10), and any route both consoles share.
**Trade-offs:** Two code paths to maintain; in exchange, classic-console compatibility is provable with a single "legacy shape" spec.

```javascript
// router.logs.js
function getAuditLog(req, res) {
  if (!Util.validateSession(req)) return res.status(401).end();
  const owner = sanitka.owner(req.session.owner);
  if (req.query.limit === undefined && req.query.bookmark === undefined) {
    return legacyAuditLog(owner, res);            // unchanged: array, 200 cap
  }
  alog.fetchPage(owner, parsePaging(req.query), (err, page) =>
    Util.responder(res, !err, err ? "log_fetch_failed" : page)); // {items, next}
}
```

### Pattern 2: Code-first, fallback-preserving secret migration
**What:** Switch reads to `readSecret()` (file first, env fallback) and deploy; only then create swarm secrets and `--secret-add`; only after every consumer is migrated remove the env values.
**When to use:** SEC-CFG-02, and the CSRF key.
**Trade-offs:** Three steps instead of one. Each step is independently reversible and none needs `stack deploy`.

### Pattern 3: Reconcile-on-boot for datastore schema
**What:** Declare the desired state in code (Influx RPs, CouchDB design docs) and converge idempotently at startup (`provisionDB` already does this for Influx).
**When to use:** Influx retention (item 11), paging design doc (item 10).
**Trade-offs:** Every boot does a few metadata reads. Changes ship through the normal autoredeploy, without an ops ticket. The downside is that a bad declaration also self-applies, so specs must assert the declared values.

### Pattern 4: Structured operation instead of command string
**What:** Callers describe *what* (clone this URL at this branch into this dir); the module owns *how* (argv sequence, env, cwd).
**When to use:** git.js (item 6).
**Trade-offs:** Loses the flexibility of arbitrary shell. That flexibility is exactly the injection surface being removed.

## Data Flow Changes

1. **Login:** gains `session.regenerate()` and a rotated `Set-Cookie: XSRF-TOKEN` in the login response. The session id changes at login, which it does not do today.
2. **CSRF verify:** gains an HMAC recomputation against the current binding. A stale token triggers a re-mint on the next request, not a permanent lockout.
3. **Audit/build log reads (paged only):** owner-keyed range query → `{items, next}`. The legacy path is unchanged.
4. **CouchDB boot:** gains a design-doc upsert for `_design/paging`, which triggers a one-time index build on first query. `managed_logs` is kept to 365 days by the cron, so the index is bounded.
5. **Influx boot:** `ALTER RETENTION POLICY "autogen" ON "stats" DURATION <N>d` on every start (idempotent).
6. **Private git fetch:** `ssh-agent sh -c` becomes `execFileSync("git", argv, {env: GIT_SSH_COMMAND + askpass})`. The passphrase flows explicitly from `readSecret`, not from the inherited env.
7. **Secrets:** credential values move from service env to `/run/secrets/<NAME>`, and the code path is the same either way.
8. **Autoredeploy:** unchanged in mechanism. Swarmpit loses its stats/agent side-cars only.

## Suggested Build Order / Phase Grouping (phases start at 22)

Deploy surfaces: **(B)** backend image via `thinx-staging` → private registry → autoredeploy; **(C)** console submodule (console repo `main` push + parent pointer bump + parent CI console jobs); **(S)** swarm-side ops (ssh `micro`, gluster git repo, `docker service update`); **(CI)** CI config only.

| Phase | Name | Items | Surfaces | Why here |
|-------|------|-------|----------|----------|
| **22** | CI & SAST baseline | 7 CodeQL, 8 registry login retry, 9 Vue hostname (verify; optional mixin fallback) | CI (+ C only if the mixin changes) | No runtime risk. CodeQL on `main` gives the objective before/after signal for items 5 and 6 (`js/path-injection`, `js/command-line-injection`). Retry reduces the CI flakes every later phase depends on. Item 9 is likely already done, so it is cheap to close here. |
| **23** | CSRF v2 + console edge parity | 2 WR-04, 1 WR-06, 3 CSP source of truth + spot-check | B, C, S | WR-04 and WR-06 share `csrf.js`, the specs and the live two-console verification. The CSP spot-check (register / forgot / reset-confirm *under enforcement*) is only meaningful once WR-06 is live, so one verification pass covers all three (the v1.13 combined-phase precedent was rated "Good"). Plan order: WR-04 first (tiny; gated on the production caller check) → WR-06 fail-open deploy with `binding_mismatch` telemetry → observe → enforce → CSP mirror + parity script → gluster edit if decided → combined spot-check. |
| **24** | Build-pipeline sink hardening | 6 git.js argv, 5 builder.js traversal | B | Both edit `builder.js` (git call site and path sinks), so run them sequentially on one branch (Phase 7 lesson: same-file plans in parallel produce conflicts). git.js first, because it redefines the `prefetchPrivate` contract and introduces explicit env passing, which item 4 needs. Verify with a real public and private build through the worker, not only specs. |
| **25** | Secrets sweep | 4 SEC-CFG-02 (+ `docker-swarm.yml` image/secrets reconciliation) | B then S | After 24, so `GIT_KEY_PASSPHRASE` is already passed explicitly. After 23, so `CSRF_SECRET` can join the same `docker secret create` batch. Code deploy is zero-behaviour-change; ops steps follow one service update at a time. |
| **26** | Log paging | 10 (backend → Vue → pointer bump) | B then C | Largest feature; needs the design-doc upsert infrastructure. Backend must deploy before the console. Isolated from security work, so a paging regression cannot be confused with a CSRF lockout. |
| **27** | Data retention & swarm footprint | 11 Influx retention, 12 Swarmpit trim | B (tiny) then S | Retention self-applies on boot, then gets verified on the swarm. Swarmpit trim is **last on purpose**: every earlier phase deploys through Swarmpit autoredeploy, so touching the deploy orchestrator only after all code has shipped means a trim failure blocks nothing but itself (`restart.sh` / `service update` remain as fallback). |

**Dependency edges (hard):**
- 6 → 4 (env-removal step): askpass needs an explicit passphrase before the env var can disappear.
- 1 → 3 spot-check: enforcement-mode register/forgot/reset verification needs the final token scheme live.
- 10 backend → 10 Vue: the API must accept the params before the console sends them (the Vue side must also tolerate the legacy array).
- 10 needs `Database.ensureDesign` (new) before any paged query.
- All B/C phases → 12: do not touch the deploy orchestrator while phases still need it.

**Soft edges:** 7 → 5/6 (a scanner signal for closure); 1 ↔ 4 (`CSRF_SECRET` may start as a derivation of the session secret and move to a swarm secret in 25).

**Parallelisable:** 22 can run alongside 23's planning. 26 backend work touches no file that 23-25 touch (router.logs, audit, buildlog, database), so it could interleave if needed. 27's Influx code change is independent of everything.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Today (single api replica, 2 nodes) | All designs work with one api instance. The CSRF key must be deterministic (secret/derivation) so restarts do not invalidate tokens. |
| Multiple api replicas | Same requirement: the key comes from a swarm secret, never per-process random. Sessions are already in Redis. |
| Audit log growth | Owner-keyed view + bookmark paging is O(page) regardless of corpus size. The 365-day cron bounds the index. |

### Scaling Priorities
1. **First bottleneck:** the unkeyed full-scan `latest_builds` query in `buildlog.list`, which runs for every build-list view across all tenants. Keying by owner (item 10) fixes it for free.
2. **Second:** anonymous Redis sessions, if WR-06 chooses the "persist a session on prime" binding. That is why the hybrid binding is recommended.

## Anti-Patterns

### Anti-Pattern 1: Editing `design/design_logs.json` and expecting production to change
**What people do:** Add a view to the existing design JSON.
**Why it's wrong:** `database.js` injects design docs only at DB creation, so production never sees the change. If it were upserted, every view in `_design/logs` would reindex, including the one the retention cron uses.
**Do this instead:** Put the view in a new design doc with an explicit idempotent upsert.

### Anti-Pattern 2: `execSync` → `execFileSync("sh", ["-c", script])`
**What people do:** Satisfy the scanner by moving the shell string into argv of `sh -c`.
**Why it's wrong:** The injection surface is unchanged; only the sink name moves.
**Do this instead:** Model the operation as an argv sequence (`prefetchPublic` is the in-repo template).

### Anti-Pattern 3: Random per-boot or per-factory HMAC key
**What people do:** `const key = crypto.randomBytes(32)` inside the `csrf.js` factory.
**Why it's wrong:** Three factory instances would disagree with each other, and every restart invalidates every token (with enforcement on, every open console fails its next POST).
**Do this instead:** Resolve the key once at module scope from `readSecret` or a derivation from the session secret.

### Anti-Pattern 4: Mirroring CSP by copying the gluster file into the images verbatim
**What people do:** `cp` the production conf over `src/default.conf` and `vue/default.conf`.
**Why it's wrong:** The image configs are templates (`__WEB_HOSTNAME__`, `__NGINX_HOST__`) with per-image `location`/`root` blocks. A verbatim copy breaks the image build or routing.
**Do this instead:** Mirror the header directives only and enforce that with a normalising parity check.

### Anti-Pattern 5: `restart.sh` / `docker stack deploy` to add a secret
**What people do:** Edit `thinx.yml` and redeploy the whole stack.
**Why it's wrong:** It resets the chronograf password and redeploys every service (memory `swarm-stack-deploy-and-couchdb-dhi`).
**Do this instead:** `docker service update --secret-add NAME thinx_api`, then mirror into `thinx.yml` / `docker-swarm.yml`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| CouchDB 3 (dhi.io, uid 65532) | nano 11 via `lib/thinx/couch.js` shim | New design doc indexes on first query; the host cron uses `_design/logs/logs_by_date`, so leave it alone |
| Redis (sessions) | connect-redis 9 + express-session 1.19 | `regenerate()` destroys the old session key and creates a new one; `saveUninitialized:false` means pre-login ids are ephemeral |
| InfluxDB 1.8 `thinx_influxdb` | node-influx 5.11 `alterRetentionPolicy` | Config file lives under the swarmpit directory on gluster |
| Swarmpit 1.9 | label `swarmpit.service.deployment.autoredeploy=true`, 1-min digest poll from app | Agent and influx not needed for redeploy (MEDIUM, verify by trial) |
| GitHub code scanning | codeql-action v4 | Check that default setup is not also enabled |
| CircleCI | `registry-login` command | Generalise the env-var names so docker.io/dhi.io can use it |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `csrf.js` ↔ `router.auth.js` login | direct call: new `csrf.rotate(req, res)` after `regenerate` | The only place the token rotates |
| `csrf.js` ↔ consoles | cookie `XSRF-TOKEN` + header `X-XSRF-TOKEN` + `GET …/csrf-token` | **Freeze these names**; consoles need no change |
| `git.js` ↔ builder/devices/sources | structured op object (was: shell string) | Contract change; 3 callers + 3 specs move together |
| `router.logs.js` ↔ Vue stores | query params → `{items,next}` | Legacy array shape preserved without params |
| API service ↔ worker | `WORKER_SECRET` shared | Don't drop the env var until the worker reads the secret |
| parent repo ↔ gluster swarm repo | manual snapshot to `.planning/runbooks/swarm-configs/` | The gluster repo is canonical for console CSP |

## Sources

- Source read at `thinx-staging` `ad206a0b`: `thinx-core.js`, `lib/middleware/csrf.js`, `lib/router.{auth,user,logs,js}.js`, `lib/thinx/{audit,buildlog,database,builder,git,devices,sources,secrets,influx,session_token}.js`, `design/design_{logs,builds}.json`, `docker-swarm.yml`, `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml`, `services/console/vue/src/{core/api.js,utils/cookies.js,mixins/hostnames.js}`, `services/console/src/html/assets/thinx/csrf.js`, `.planning/runbooks/console-csp-source-of-truth.md`. HIGH.
- Project memory: backlog-log-paging, backlog-influxdb-retention, backlog-swarmpit-minimize, swarm-stack-deploy-and-couchdb-dhi, api-image-deploy-path, swarm-node-topology, couchdb-log-retention-job. HIGH for recorded decisions, point-in-time for production state.
- Swarmpit autoredeploy implementation: https://raw.githubusercontent.com/swarmpit/swarmpit/master/src/clj/swarmpit/agent.clj ; agent role: https://github.com/swarmpit/agent ; config: https://github.com/swarmpit/swarmpit/blob/master/doc/configuration.md. MEDIUM (read from source, not yet trialled on our swarm).
- OWASP CSRF Prevention Cheat Sheet (signed double-submit, session binding): https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html. MEDIUM.
- codeql-action v4 current / v3 deprecation: https://github.com/github/codeql-action/releases. LOW-MEDIUM (web search; confirm the major at plan time).
- InfluxDB ALTER RP resets shard duration: https://github.com/influxdata/influxdb/issues/7150 ; shard-group deletion semantics: https://www.influxdata.com/blog/influxdb-shards-retention-policies/. MEDIUM.

---
*Architecture research for: v1.14 Backlog & Hardening Sweep (THiNX Device API)*
*Researched: 2026-09-25*
