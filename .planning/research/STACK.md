# Stack Research

**Domain:** v1.14 Backlog & Hardening Sweep for an existing Node/Express CommonJS IoT API (THiNX Device API): CSRF hardening, secret loading, command/path sinks, CI, log paging, InfluxDB retention, Swarmpit trim
**Researched:** 2026-09-25
**Confidence:** HIGH for codebase facts (read directly from the repo, `node_modules`, and the live GitHub API). MEDIUM for external versions and Swarmpit behaviour (official release pages and changelogs, plus Swarmpit source at the `1.9` tag, fetched and cross-checked).

## Bottom Line

**v1.14 needs no new npm runtime dependencies.** Everything is covered by what is already installed: Node built-ins (`node:crypto`, `node:child_process`, `node:fs`, `node:path`), the existing `express-session` 1.19.0 / `nano` 11.0.7 / `influx` 5.11.0 clients, and `lib/thinx/secrets.js`. The version changes are all outside npm:

| Where | Change |
|---|---|
| `.github/workflows/codeql-analysis.yml` | `actions/checkout@v2` → `@v7`; `github/codeql-action/*@v1` → `@v4`; `javascript` → `javascript-typescript` with `build-mode: none`; branches `master` → `main` (+ `thinx-staging`, see below) |
| `docker-compose.yml` (CI/test) | `dhi.io/influxdb:2` → `influxdb:1.8`, so it matches production. InfluxDB 2's v1-compat API cannot run the retention-policy DDL this milestone changes |
| Swarmpit stack on `micro` (not in this repo) | Remove `SWARMPIT_INFLUXDB` from `swarmpit_app`, then remove the `swarmpit_influxdb` service. `swarmpit_agent` is optional (see below). Stay on `swarmpit/swarmpit:1.9` for this milestone |
| `package.json` | Possibly **remove** `shell-escape` after the git argv refactor, if `builder.js:353/944` stop needing it. Nothing is added |

Two of the 12 target features are **already mostly shipped**, and the roadmap should scope them down:
- **#8 Registry login retry:** the `registry-login` command (commit `be376db9`, `.circleci/config.yml:9-46`) already retries 5 times with a linear backoff and is used at lines 128/205/286/363/377/588. Only one bare login is left, in the test job at `.circleci/config.yml:767`: `docker login --username $DOCKER_LOGIN --password $DOCKER_PASSWORD https://registry.thinx.cloud:5000`. It is not retried, and it puts the password on argv. Replace it with `- registry-login` and the work is done.
- **#9 Vue hostname var:** commit `3f2f6da4` already feeds `VUE_APP_CONSOLE_HOSTNAME` from a separate `VUE_WEB_HOSTNAME` project var in the Vue job. What remains is cosmetic: (a) `docker-swarm.yml:343` sets `VUE_APP_CONSOLE_HOSTNAME` at runtime, which does nothing because Vue CLI 5 inlines `VUE_APP_*` at build time, so delete it; (b) optionally rename `VUE_WEB_HOSTNAME` → `VUE_APP_CONSOLE_HOSTNAME` in CircleCI so one name carries the meaning end to end.

## Recommended Stack

### Core Technologies (per feature, all existing)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:crypto` (`createHmac`, `randomBytes`, `timingSafeEqual`, `hkdfSync`) | Node 26 (image `dhi.io/node:26-alpine3.24-dev`); engines `>=19.x` | WR-06 session-bound CSRF token | Implements the OWASP "Signed Double-Submit Cookie" recipe exactly, with no dependency. `csrf.js` already uses `randomBytes` + `timingSafeEqual`, so the change is roughly 30 lines, not a library swap. `hkdfSync` (Node ≥15) derives a CSRF-only key from the existing session secret, so no new secret has to be provisioned |
| `express-session` `req.session.regenerate(cb)` / `req.sessionID` | 1.19.0 (installed, latest) | WR-06 "rotate on login" and the session binding | Already mounted. **No login route calls `regenerate()` today** (grep: only `destroy()` is used), so the session ID survives login, which is session fixation. Calling `regenerate()` on successful login and then minting a new token bound to the new `sessionID` is the rotation. `connect-redis` 9 deletes the old key |
| `node:child_process` `execFileSync` / `spawnSync` (`shell: false`) | Node 26 | #6 `git.js` argv refactor | argv-only exec is the standard fix for CodeQL `js/command-line-injection` and Aikido shell sinks. `builder.js:420/440` already uses `execFileSync("git", [...])`, so `git.js` follows a pattern the repo already has |
| OpenSSH client `SSH_ASKPASS_REQUIRE=force` + `GIT_SSH_COMMAND` | OpenSSH from Alpine 3.24 (≥ 8.4) | #6: removes `ssh-agent sh -c <script>` entirely | See "git.js argv pattern" below. Git runs `GIT_SSH_COMMAND` through a shell, but the string can be a **constant** that reads the key path from an env var (`ssh -i "$THINX_GIT_KEY" -o IdentitiesOnly=yes`). No dynamic shell string is left for a scanner to taint-track |
| `node:fs` `readdirSync(dir, { withFileTypes: true })`, `realpathSync`, `lstatSync` + `node:path` `resolve`/`relative` | Node 26 | #5 builder.js path-traversal sinks | `Dirent.isDirectory()` removes the `lstatSync(path.join(BUILD_PATH, file))` sinks at `builder.js:682/1215` outright. The remaining reads get a shared `resolveWithin(base, ...parts)` guard, the same `path.relative` containment check already used in `secrets.js:26-30` and `json2h.js:107`, plus `realpathSync` to catch **symlinks inside a cloned repo** (git preserves them, so `thinx.yml -> /run/secrets/COUCHDB_PASS` is a real vector) |
| `lib/thinx/secrets.js` `readSecret()` | in-repo (SEC-CFG-01) | #4 SEC-CFG-02 sweep | Already proven on Redis/CouchDB. Adoption only: the vars are `WORKER_SECRET`, `MAILGUN_API_KEY`, `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK`, `SLACK_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `GOOGLE_OAUTH_SECRET`, `ROLLBAR_ACCESS_TOKEN`, `GIT_KEY_PASSPHRASE` (+ `SLACK_CLIENT_ID`/`GITHUB_CLIENT_ID`/`GOOGLE_OAUTH_ID`, which are not secret but belong in the same place). No library needed |
| `nano` view query with `startkey`/`endkey`/`startkey_docid`/`limit` | 11.0.7 (installed, latest) | #10 audit and build log paging | CouchDB-documented keyset ("linked list") paging over the view B-tree. nano 11 JSON-encodes `startkey`/`endkey`/`key`/`keys` itself and passes `startkey_docid` raw (`node_modules/nano/lib/nano.js:341`). The `couch.js` callback shim wraps `view` unchanged |
| `influx` `alterRetentionPolicy()` | 5.11.0 installed (5.12.0 exists, **no bump needed**) | #11 finite retention on `stats` | Already used by `InfluxConnector.provisionDB()`. Emits `ALTER RETENTION POLICY … DURATION … REPLICATION … [DEFAULT]`. It has **no shard-duration option**, which is fine (see Version Compatibility) |
| `github/codeql-action` (`init`, `analyze`) | **v4** (4.38.2, 2026-09-24; runs on Node 24) | #7 CodeQL workflow | v4 is the current major. v3 still gets releases in lockstep but is **deprecated December 2026** (4.31.3 changelog), and v1/v2 are unsupported. The repo's current `@v1` does not run at all |
| `actions/checkout` | **v7** (7.0.1, July 2026) | #7 | Current major. v7.0.0 blocks fork-PR checkout under `pull_request_target`/`workflow_run`, which does not affect this workflow. The repo only allows **GitHub-owned actions** (`allowed_actions: selected`, `github_owned_allowed: true`, `verified_allowed: false`), so both of these are permitted and **no third-party action will run** |
| Swarmpit | stay on **1.9** (1.10 tagged 2026-03-04) | #12 trim | Trimming is config-only on 1.9 (see below). The 1.9→1.10 upgrade is Rung 4 in `.planning/runbooks/swarm.md` and should not be bundled with the trim |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cookie-parser` | 1.4.7 (installed) | Reads `XSRF-TOKEN` | Unchanged. The WR-06 check still reads the cookie/header pair; what changes is the token format and how it is verified |
| `shell-escape` | 0.2.0 (installed, unmaintained since 2022) | Currently quotes values into shell strings in `git.js`, `devices.js`, `sources.js`, `builder.js` | **Remove the uses** as part of #6: once git runs through argv there is nothing to escape. `builder.js:353` (log line only) and `builder.js:944` (remote builder command) may still use it, so check before dropping the dependency |
| `influx` raw `query()` via POST | 5.11.0 | Only if a non-default `SHARD DURATION` is wanted | Not recommended. Keep the default shard group (7d for an RP that was infinite). With 90d retention that means data is dropped at up to about 97 days, which is acceptable |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| CodeQL `javascript-typescript` + `build-mode: none` | SAST on push/PR | Drop the `npm install` step (JS extraction needs no build) and the obsolete `git checkout HEAD^2` step. Default setup is `not-configured` on the repo (checked via `gh api .../code-scanning/default-setup`), so an advanced workflow will upload without conflict. The last analysis on record is SonarCloud from 2022-04, so **CodeQL has effectively never run on `main`** |
| `.github/dependabot.yml` with `package-ecosystem: github-actions` | Keeps action majors current | Optional and small. There is no `dependabot.yml` today. Dependabot security-update runs are failing against the deleted `master` branch (all runs 2026-09-10 `failure`, `head_branch: master`), which is a sign the UI config still targets `master` |
| CircleCI `registry-login` command (in-repo) | Retried registry auth | Already exists. CircleCI has **no native step-level retry**, so the shell loop is the correct mechanism. Do **not** bump `circleci/docker@2.0.3` → 4.0.1 in the same change: the orb's `docker/check` and `docker/push` parameters moved across two majors |
| `influxdb:1.8` (Docker Hub) in `docker-compose.yml` | CI parity for #11 | DHI's `dhi/influxdb` catalog carries v3 (3.11.x) only, no 1.x. Production is Docker Hub `influxdb:1.8`, so use the same image in CI |

## Installation

```bash
# Nothing to install. No new runtime or dev dependencies for v1.14.

# Optional cleanup after the git.js/devices.js/sources.js argv refactor,
# only if `grep -rn shell-escape lib/` comes back empty:
npm uninstall shell-escape
```

## Feature-to-Stack Integration Notes

### WR-06: session-bound CSRF token (node:crypto + express-session)

- **Token:** OWASP signed double-submit format, `hmacHex + "." + randomHex`, where `hmac = HMAC-SHA256(key, sid.length + "!" + sid + "!" + rand.length + "!" + rand)`. Verification recomputes the HMAC from `req.sessionID` and the random part carried in the token, then compares with `crypto.timingSafeEqual` (lengths must match first; the `try/catch` already in `verifyCsrfToken` handles that).
- **Key:** `crypto.hkdfSync("sha256", session_config.secret, "thinx-csrf", "csrf-v1", 32)`, computed once in the factory. This gives domain separation from the cookie-signing secret and nothing extra to provision. If SEC-CFG-02 moves the session secret to a Docker secret, the CSRF key follows it. Accept `readSecret("CSRF_SECRET")` as an optional override for anyone who wants independent rotation.
- **Pre-login binding (the catch):** `sessionConfig.saveUninitialized: false`, so an anonymous visitor's `req.sessionID` is **regenerated on every request** and never persisted. A token bound to it would fail on the next request. The priming endpoint (`GET /api/csrf-token`, `/api/v2/csrf-token`) therefore has to **initialize a pre-session** (for example `req.session.csrf = true`), which sets `x-thx-core` and writes one Redis key with the existing 1h rolling TTL. That is the OWASP "pre-session" pattern. Cost: one short-lived Redis entry per anonymous console visit.
- **Rotation:** on successful login (`router.auth.js` around lines 72/83/161/322 and the OAuth routers `router.google.js:153` and `router.github.js`), call `req.session.regenerate()`, re-assign `owner`, mint a new token, and return it in the login response body so the console does not need an extra priming round-trip. This also closes the current session-fixation gap.
- **Why not a `__Host-` binding cookie instead:** `__Host-` requires `Secure` and forbids `Domain`. The test suite runs over plain HTTP through chai-http v4's superagent cookiejar, which will not send `Secure` cookies over HTTP, and local dev runs over `http://localhost` too. The session-ID binding avoids both problems and matches the wording of WR-06.

### WR-04: `POST /api/v2/user` (`router.user.js:147`)
Add `csrf.verifyCsrfToken` to the route. No stack change. Non-browser clients prime via `GET /api/v2/csrf-token` with a cookie jar.

### #6: git.js argv pattern (node:child_process)

```js
// Constant GIT_SSH_COMMAND: no interpolation; key path arrives via env.
const GIT_SSH = 'ssh -i "$THINX_GIT_KEY" -o IdentitiesOnly=yes -o BatchMode=no';
execFileSync("git", ["-c", "protocol.allow=never", "-c", "protocol.https.allow=always",
                     "-c", "protocol.ssh.allow=always",
                     "clone", "--branch", branch, "--", url, dest], {
  cwd, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, THINX_GIT_KEY: keypath, GIT_SSH_COMMAND: GIT_SSH,
         SSH_ASKPASS: askpath, SSH_ASKPASS_REQUIRE: "force", DISPLAY: ":",
         GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE"), GIT_TERMINAL_PROMPT: "0" }
});
```

- The `mkdir` / `rm -rf ./*` / `cd *` / `chmod -R` / `printf … > basename.json` steps in the three shell-script builders (`devices.js:46`, `sources.js:265`, `builder.js:465`) become Node `fs` calls. **The `git.fetch(owner, command, local_path)` signature must change** from a shell string to a list of git argv steps plus a `cwd`. The callers' static command-builder specs (`gitPrefetchCommand`, `prefetchCommand`, `gitCloneAndPullCommand` are "exported for testing") change with it.
- Use `--` before the URL and `--branch <b>` so a value that starts with `-` cannot turn into an option. Restrict transports with `protocol.allow=never` + explicit `https`/`ssh`, which blocks `ext::` and `file://`.
- `SSH_ASKPASS_REQUIRE=force` works for `ssh` itself, not only `ssh-add` (OpenSSH ≥ 8.4), so the per-invocation `ssh-agent` is no longer needed. Keep the existing askpass helper (`git.js:94`), which reads `$GIT_KEY_PASSPHRASE` from its env. Only its source changes, to `readSecret()`, which is where #4 and #6 meet.
- `prefetch(GIT_PREFETCH)` (`git.js:150`) also calls `execSync` with a string and must be converted in the same pass. `statistics.js:274/281` (`docker info -f $(hostname)`, `spawn(..., {shell:true})`) are constant strings with no user input and are out of scope, but they will show up in the same scanner reports.

### #10: log paging (nano views)

- **Add a new design doc; do not edit `_design/logs`.** A CouchDB view index is built per design doc, so adding a view to `_design/logs` invalidates the index for the legacy `logs_by_owner` too, and the next legacy console request blocks while the whole `managed_logs` index rebuilds. A separate `_design/paging` with `audit_by_owner_date` emitting `[doc.owner, doc.date]` → `{date, message, flags}` (small value, not the whole doc) leaves legacy untouched. Do the same for builds with `builds_by_owner_time` → `[doc.owner, doc.start_time]` instead of re-using `latest_builds`, which emits the **whole doc**.
- **Design docs are only injected when the DB is first created** (`database.js:88-91`, inside `db.create().then`). Production DBs will never receive a new view from editing `design/*.json`. An idempotent upsert is needed (get the existing `_design/paging`, compare `views`, `insert` with `_rev` if different) and it has to run at startup. Without it, paging returns 404 `missing_named_view` in production and works in CI, because CI databases are freshly created.
- **Query:** `{ startkey: [owner, {}], endkey: [owner], descending: true, limit: n + 1 }`, then for later pages `startkey: [owner, lastDate], startkey_docid: lastId`. Return an opaque `bookmark = base64url(JSON.stringify({k, id}))`. Validate it on the way in: it must decode to `k[0] === session owner`, otherwise a crafted bookmark becomes a BOLA. Keying by owner also fixes the current in-memory filter over **all tenants' 200 newest rows** in `audit.js:69-81`, which is why a quiet tenant sees fewer than 200 items. That fix is only for the paged path, because legacy behaviour must stay unchanged.
- **Not Mango `_find` + `bookmark`:** it works on CouchDB 3, but it needs a separate `createIndex` lifecycle, returns full docs unless `fields` is set, and `managed_logs` already has a design-doc provisioning path to extend. Views are cheaper and fit the existing code.

### #11: InfluxDB retention (influx client)

- Recommended: `alterRetentionPolicy("autogen", { database: "stats", duration: "90d", replication: 1, isDefault: true })` in `provisionDB()`. Every query in `influx.js:66/86/108/132` names `"stats"."autogen"` explicitly, so **changing the duration of `autogen`** keeps reads and writes where they are. Making `31d` the default instead would silently strand all existing data, because queries still read `autogen`.
- Scope the ALTER to `db === "stats"`. `provisionDB` is generic, and `thinx-core.js:166` is its only caller today.
- Shrinking the duration drops whole shard groups whose end time is older than the new duration at the next retention check (`[retention] check-interval`, default 30m). The first check after deploy deletes history older than 90d. That is intended, but say so in the phase plan.

### #12: Swarmpit trim (config, Swarmpit 1.9 source)

Verified against Swarmpit source at tag `1.9`:
- `config.clj`: env keys are `SWARMPIT_DOCKER_SOCK`, `SWARMPIT_DOCKER_API` (default **1.30**), `SWARMPIT_DOCKER_HTTP_TIMEOUT`, `SWARMPIT_DB`, `SWARMPIT_INFLUXDB` (default **nil**), `SWARMPIT_AGENT_URL`, `SWARMPIT_WORKDIR`. **There is no "disable stats" flag.** Unsetting `SWARMPIT_INFLUXDB` is the switch.
- `database.clj`: `db/init` waits for InfluxDB and creates its DB/RPs/CQs **only `(when (influx-configured?))`**, so with `SWARMPIT_INFLUXDB` unset, `swarmpit_app` boots without it and **`swarmpit_influxdb` can be removed**.
- `agent.clj`: autoredeploy is an in-app http-kit job every **60s** that compares registry digests for services labelled `swarmpit.service.deployment.autoredeploy=true`. It uses neither InfluxDB nor the `swarmpit_agent` service. It **does** need `swarmpit_db`, which stores the linked registry credentials for `registry.thinx.cloud:5000`, so the DB stays (couchdb 2.3.0, per the recorded decision).
- `stats.clj`: stats live in an in-memory cache fed by `swarmpit/agent`. Dropping `swarmpit_agent` blanks the dashboard stats and live event updates, which the user has said are expendable. **Recommend two steps:** drop `swarmpit_influxdb` first (proven by source), observe one autoredeploy, then drop `swarmpit_agent` and observe one more. Autoredeploy should not care, but the app's handling of a missing agent was not verified end to end.
- **Hidden coupling:** `thinx_influxdb` (production) bind-mounts `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf` (`docker-swarm.yml:460`). Removing the Swarmpit InfluxDB service **must not** remove that file.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-rolled HMAC in `csrf.js` (node:crypto) | `csrf-csrf` 4.0.3 (signed double-submit, ships CJS) | Only for a greenfield app. Here it would replace a tuned middleware (fail-open flag, reason codes, duplicate-cookie diagnostics, non-browser exemptions) that both consoles are wired to. The HMAC itself is about 15 lines |
| Session-ID binding with a pre-session on prime | `__Host-` httpOnly binding cookie | If all traffic, including tests and local dev, were HTTPS on a single host |
| HKDF from the session secret | New Docker secret `CSRF_SECRET` | If CSRF-key rotation must be independent of session-secret rotation. Supported as an optional override |
| View keyset paging (new `_design/paging`) | Mango `_find` + `bookmark` | If ad-hoc filters (flags, date ranges) are added later. Mango handles changing selectors more naturally |
| `GIT_SSH_COMMAND` (constant) + askpass | Keep `ssh-agent`, call `execFileSync("ssh-agent", ["sh", "-c", CONSTANT_SCRIPT, "sh", keypath, ...gitArgv])` with positional `"$@"` | If some keys prove to need agent forwarding to submodules over a second host. Still argv-safe, but more moving parts |
| Unset `SWARMPIT_INFLUXDB` on 1.9 | Replace Swarmpit with a registry-webhook → `docker service update` hook, or Shepherd | If `swarmpit_app` itself (JVM, ~1 GB limit) is the footprint problem. That is a larger change outside this milestone |
| Stay on Swarmpit 1.9 | Swarmpit 1.10 (2026-03-04; default docker-api 1.44) | **Required** if the swarm nodes move to Docker Engine 29.0–29.2, which reject API < 1.44 (29.3+ lowered the default floor to 1.40). 1.9 defaults to API 1.30. Check `docker version` on both nodes before assuming 1.9 stays viable |
| CodeQL advanced workflow | GitHub CodeQL "default setup" | If nobody wants to maintain the YAML. Default setup would scan only the default branch (`main`), not `thinx-staging` |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `csurf` | Archived and deprecated by the Express team (npm `deprecated` flag set) | Existing `lib/middleware/csrf.js` + node:crypto HMAC |
| `child_process.execSync(string)` / `spawn(cmd, {shell:true})` for anything touching repo URL, branch, or paths | It is the sink CodeQL and Aikido flag; `shell-escape` quoting already broke once (`git.js:118-127` comment) | `execFileSync`/`spawnSync` with an argv array, `shell: false` |
| `skip`-based paging on CouchDB views | Cost is linear in `skip` on the B-tree; CouchDB docs discourage it for paging | `startkey` + `startkey_docid` + `limit: n+1` |
| Editing `_design/logs` or `_design/builds` in place | Invalidates the legacy views' index, and a rebuild stalls the legacy console | New `_design/paging` doc plus an idempotent upsert at startup |
| Making `31d` the default RP on `stats` | Strands all existing `autogen` data; queries hardcode `"stats"."autogen"` | `ALTER RETENTION POLICY "autogen" ON "stats" DURATION 90d … DEFAULT` |
| `github/codeql-action@v3` | Deprecated December 2026, about 3 months out | `@v4` |
| Third-party GitHub Actions (setup-node, cache actions, etc.) | The repo policy allows GitHub-owned actions only, so they fail at queue time | Built-in steps; CodeQL JS needs no Node setup with `build-mode: none` |
| `dhi.io/influxdb:2` for tests | InfluxDB 2's v1-compat `/query` runs no DDL (`CREATE DATABASE`, `ALTER RETENTION POLICY`), and 1.x env vars (`INFLUXDB_DB`, `INFLUXDB_ADMIN_*`) are ignored, so CI never exercises the retention code | `influxdb:1.8`, matching production. Unit-test `provisionDB` with a stubbed client |
| `docker login --password …` on argv | Leaks into process listings, and CircleCI warns about it | `registry-login` command (`--password-stdin`, retried) |

## Stack Patterns by Variant

**If a CSRF-protected route can be called before login (login, register, reset):**
- Prime with `GET /api/v2/csrf-token`, which initializes the pre-session and returns `{csrf_token}`
- Because `saveUninitialized:false` otherwise gives every anonymous request a fresh `sessionID`

**If a CSRF-protected route is called after login:**
- Use the token returned in the login response (minted after `regenerate()`)
- Because the pre-session token is bound to a session ID that no longer exists

**If a build repo is public (no owner SSH keys):**
- Run `execFileSync("git", argv)` without `GIT_SSH_COMMAND`/askpass env, which is today's `tryShellOp` path without a shell

**If the swarm Docker Engine is ≥ 29.0 and < 29.3:**
- Set `SWARMPIT_DOCKER_API=1.44` on 1.9 (untested with the 1.9 client), or schedule the 1.10 upgrade
- Because the daemon rejects older API versions

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `github/codeql-action@v4` | `actions/checkout@v7`, GitHub-hosted `ubuntu-latest` | v4 runs on Node 24; hosted runners are fine. `languages: javascript-typescript` + `build-mode: none` |
| `nano@11.0.7` view `startkey` | CouchDB 3 (`dhi.io/couchdb:3`) | Pass `startkey`/`endkey` as arrays (nano JSON-encodes them) and `startkey_docid` as a plain string (not encoded) |
| `influx@5.11.0` `alterRetentionPolicy` | InfluxDB **1.8** only | Emits `ALTER … DURATION … REPLICATION … [DEFAULT]`, no `SHARD DURATION`. Shard duration of the existing `autogen` (7d when infinite) is unchanged and only affects new shard groups |
| `express-session@1.19.0` `regenerate` | `connect-redis@9` | Old session key destroyed in Redis; `rolling: true` + `resave: true` unchanged |
| OpenSSH `SSH_ASKPASS_REQUIRE` | OpenSSH ≥ 8.4 | Alpine 3.24's `openssh-client` qualifies. The worker/builder images are not affected, since git runs in the API container |
| Swarmpit 1.9 | Docker Engine < 29, or 29.3+ with a lowered floor | 1.9 defaults to API 1.30. Docker 29.0–29.2 floor is 1.44; 29.3 lowered the default floor to 1.40; `DOCKER_MIN_API_VERSION` overrides it on the daemon |
| chai-http 4 (locked) | New CSRF flow | Specs must use `chai.request.agent(app)` so the `x-thx-core` pre-session cookie persists between prime and POST. It does over HTTP, since `Secure` is negotiated from `req.secure` |

## Open Questions for Phase Research

- Docker Engine version on `micro` and `core` (`docker version --format '{{.Server.Version}}'`). The 2026-09-22 unattended-upgrade outage shows `docker-ce` does get upgraded underneath the swarm. If it is at 29.0–29.2, Swarmpit 1.9 is already at risk, and the trim phase should check that before touching anything.
- Whether Swarmpit 1.9 logs errors or degrades when no agent reports in (the source read covered stats/cache and autoredeploy, not the event-handler path).
- The exact deployment location of the Swarmpit stack file on `micro` (not in this repo). The trim phase needs it before editing.
- Whether `builder.js:944` (`shellEscape(["./builder", ...buildArgs])`, the remote build command) is in scope for #6, or only `git.js`. This decides whether `shell-escape` can be dropped.

## Sources

- Codebase, read directly (HIGH): `lib/middleware/csrf.js`, `lib/thinx/{git,builder,devices,sources,audit,buildlog,influx,secrets,database,couch}.js`, `thinx-core.js:320-353`, `lib/router.{auth,user}.js`, `design/design_{logs,builds}.json`, `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml`, `docker-swarm.yml`, `docker-compose.yml`, `base/Dockerfile`, `node_modules/{nano,influx}`; commits `be376db9`, `3f2f6da4`
- GitHub API, live (HIGH): code-scanning default-setup `not-configured`; last analyses SonarCloud 2022-04; Actions policy GitHub-owned only; repo public, default branch `main`
- https://github.com/github/codeql-action/blob/main/CHANGELOG.md: 4.38.2 (2026-09-24); v3 deprecation December 2026; v4 on Node 24 (MEDIUM)
- https://github.com/actions/checkout/releases and CHANGELOG: v7.0.1 current; v7.0.0 change (MEDIUM)
- https://raw.githubusercontent.com/swarmpit/swarmpit/1.9/src/clj/swarmpit/{config,database,stats,agent,server}.clj: env keys, influx conditional init, autoredeploy job (MEDIUM; source read through a summarizing fetch)
- https://github.com/swarmpit/swarmpit/tags: 1.10 tagged 2026-03-04 (MEDIUM)
- https://www.docker.com/blog/docker-engine-version-29/ and https://forums.docker.com/t/docker-29-increased-minimum-api-version-breaks-traefik-reverse-proxy/150384: Engine 29 API floor 1.44; 29.3 lowered to 1.40 (MEDIUM)
- https://docs.couchdb.org/en/stable/ddocs/views/pagination.html and https://docs.couchdb.org/en/stable/api/database/find.html: keyset paging, bookmark semantics (MEDIUM/HIGH: official docs)
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html: signed double-submit HMAC format, pre-session, `__Host-` (HIGH: authoritative)
- https://hub.docker.com/hardened-images/catalog/dhi/influxdb: DHI InfluxDB is v3 only (LOW, from search snippets)
- npm registry (`npm view`): csrf-csrf 4.0.3, csurf deprecated, influx 5.12.0, nano 11.0.7, express-session 1.19.0 (HIGH)
- CircleCI orb registry GraphQL: `circleci/docker` 4.0.1 (2026-07-01) vs pinned 2.0.3 (HIGH)

---
*Stack research for: THiNX Device API v1.14 Backlog & Hardening Sweep*
*Researched: 2026-09-25*
