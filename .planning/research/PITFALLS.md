# Pitfalls Research

**Domain:** Hardening and backlog work on a live Node/Express IoT API running on a two-node Docker swarm (THiNX v1.14)
**Researched:** 2026-09-25
**Confidence:** HIGH for codebase-derived pitfalls (each one cites file:line read on 2026-09-25). MEDIUM for Swarmpit internals and InfluxDB shard timing (external docs plus community reports). LOW where marked.

> **Read this first: three of the twelve items are already partly done.** This repo has a history of
> "discrepancy branches", where the work had already happened out-of-band (v1.10 OPS-EXEC-01/02, v1.11 OPS-EXEC-03).
> Evidence of the same pattern in v1.14 scope, from the working tree:
> - **Registry login retry.** The `registry-login` command already exists (`.circleci/config.yml:9-46`, commit `be376db9`, 2026-09-20). One raw, un-retried login is left in the test job (`config.yml:767`).
> - **Vue hostname var.** `VUE_WEB_HOSTNAME` is already wired into the Vue build (`config.yml:174,196`, commit `3f2f6da4`, 2026-09-21).
> - **Vue `connect-src` `app.thinx.cloud`.** Already fixed in console `60e1ef0` (`console-csp-source-of-truth.md`, "Latent risk" update of 2026-09-25).
>
> Each phase that touches these items should start by checking the current state. Do not open with an implementation task.

---

## Critical Pitfalls

### Pitfall 1: A session-bound CSRF token with no session to bind to (WR-06)

**What goes wrong:**
WR-06 specifies `HMAC(secret, random‖session_id)`. The main session middleware runs with `saveUninitialized: false` (`thinx-core.js:340`), so an anonymous visitor on the login, register or forgot-password page has **no persisted session id**. This creates two problems:
- A token minted pre-login is bound to an id that never gets stored. The first protected POST (`/api/login`, `/api/v2/login`, `/api/user/create`, `/api/v2/password/reset`) then fails the HMAC check.
- The session id is regenerated on login, so the token is invalid again right after login.

Under `CSRF_ENFORCE=true` the result is a cold-login lockout on both consoles. That is the exact failure the v1.13 rollout was sequenced to avoid.

**Why it happens:**
The OWASP "signed double-submit" pattern assumes a session exists. Login CSRF is the case where one does not.

**How to avoid:**
- Decide explicitly how pre-auth tokens work. There are two options:
  - (a) Priming (`GET /api/v2/csrf-token`) creates a minimal pre-auth session (`req.session.csrf_seed = …`). This costs one Redis key per anonymous visitor, so give pre-auth sessions a short TTL.
  - (b) Keep plain double-submit for the pre-auth routes and require the HMAC-bound token only on authenticated session-mutation routes.
- Put the design in writing in the phase CONTEXT before code is written.
- Put the new mode behind its **own** flag (e.g. `CSRF_MODE=double-submit|session-hmac`). Keep `CSRF_ENFORCE` meaning "403 or warn". Rolling back the binding must not require turning enforcement off.
- Ship fail-open first and read the `reason=` log lines (`csrf.js:88-93`). Flip the mode only after both consoles log in cold, which is the same two-step used in 21-04/21-05.

**Warning signs:**
- A burst of `reason=value_mismatch` right after login in the API log.
- Rollbar `CSRF rejection after retry` from the Vue console (`vue/src/utils/cookies.js:84`).
- Classic-console login that succeeds on the second click only.

**Phase to address:** CSRF hardening phase (WR-06). Its CONTEXT has to settle the pre-auth design before planning starts.

---

### Pitfall 2: The rotate-on-login rule misses some login paths, or gets applied on every request

**What goes wrong:**
`req.session.owner` is assigned in at least eight places:
- `router.auth.js:72, 83, 161, 322`
- `router.google.js:153`
- the GitHub OAuth callback
- `session_token.js:68`
- **`router.js:94`**, the per-request JWT-to-session bridge

There is no `req.session.regenerate` anywhere today (session fixation is currently open). Two opposite mistakes are likely:
- Rotating only in `loginAction`. OAuth logins then keep the pre-login session id and token.
- Putting `regenerate()` inside a shared "set owner" helper that `router.js:94` also calls. Every Bearer-authenticated request then gets a new session id. Sessions churn, and any in-flight token is invalidated on every call.

**Why it happens:**
The session is established in many ad-hoc places rather than in one seam.

**How to avoid:**
- Add one helper, `establishSession(req, owner, cb)`, that does `regenerate`, then sets `owner`, then mints a new CSRF seed. Call it from the interactive login sites only: password login, Google, GitHub, and `session/token` if the exchange counts as a login.
- **Do not** call it from `router.js:94`.
- `regenerate()` discards session data, so copy any fields that must survive (e.g. `impersonator_owner`).
- Add a spec that logs in through each path and asserts that the `x-thx-core` cookie value changed and that the old token is rejected.

**Warning signs:**
- The Redis session key count grows much faster than the number of logins.
- Vue OAuth login (`OAuthReturn.vue`) 403s on its first POST while password login works.

**Phase to address:** CSRF hardening phase (WR-06).

---

### Pitfall 3: Both consoles cache the token in a cookie and will send a stale one after rotation

**What goes wrong:**
- The Vue client's `ensureCsrfToken` **skips the network when the `XSRF-TOKEN` cookie already exists** (`vue/src/utils/cookies.js:40-43`). `getCsrfToken()` reads the cookie synchronously.
- The classic console reads the same cookie through `$.ajaxSetup`.
- If the server rotates the bound token on login but the old cookie is still in the jar, both consoles send the stale value. The Vue client recovers through its single forced re-prime and retry. The classic console has no retry and simply fails.
- If the implementation stops using a JS-readable `XSRF-TOKEN` cookie (for example by returning the token only in the JSON body), both seams break at once.

**Why it happens:**
Server-side changes to the CSRF design look self-contained, but the client contract (cookie name, header name, when to prime) is spread across two front ends in a submodule.

**How to avoid:**
- Keep the wire contract unchanged: `XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header, `GET …/csrf-token` echo.
- On login, send a **new** `Set-Cookie: XSRF-TOKEN=<bound token>` in the login response itself, so the jar is correct before the console's next request.
- The server must verify the **header** value's HMAC against `req.sessionID`. A plain `cookie === header` check with the HMAC applied only to the cookie gains nothing against WR-06's threat, which is a sibling subdomain planting a cookie on `.thinx.cloud`.
- Watch for duplicate cookies. `cookie-parser` keeps the first one. The existing `xsrf_cookies=N` log field (`csrf.js:98-103`) is the detector.

**Warning signs:**
- `duplicate_cookie=true` in the API log.
- Vue works but classic intermittently 403s after login, or the reverse.

**Phase to address:** CSRF hardening phase. The console submodule pointer bump belongs in the same phase.

---

### Pitfall 4: A per-boot random HMAC secret turns every autoredeploy into a CSRF 403 wave

**What goes wrong:**
If the HMAC key comes from `crypto.randomBytes()` at startup, or from an env var that is missing and silently defaulted, every `thinx-staging` push:
1. autoredeploys `thinx_api`,
2. invalidates every open console's token,
3. and produces a wave of 403s.

Rescheduling also moves the API between nodes without warning (unattended-upgrade outage, 2026-09-22), and every such move has the same effect.

**Why it happens:**
The stateless double-submit design needed no server secret. The HMAC design does.

**How to avoid:**
- Provision the key as an external swarm secret and read it through `readSecret()`.
- **Fail closed at boot** when the key is missing in production, with a loud startup error, rather than generating one at random.
- This makes the secrets sweep (SEC-CFG-02) a prerequisite. Order the sweep before WR-06, or ship the new secret together with it.

**Warning signs:** A csrf_token_invalid spike that lines up with `docker service ps thinx_api` task start times.

**Phase to address:** Secrets sweep phase (provision the key) → CSRF hardening phase (consume it).

---

### Pitfall 5: The `readSecret()` sweep changes `undefined` to `null` and breaks every `typeof … !== "undefined"` guard

**What goes wrong:**
`readSecret(name)` returns `null` when neither the secret file nor the env var exists (`lib/thinx/secrets.js:21`). Call sites currently guard with `typeof process.env.X !== "undefined"`, for example:
- `lib/thinx/queue.js:352`, `WORKER_SECRET`
- `lib/thinx/messenger.js:128,147`, `SLACK_BOT_TOKEN`

A mechanical replacement gives `typeof null === "object"`, so the guard passes. Code that used to skip an integration now initialises it with `null`: Slack with a null token, Socket.IO worker auth with a `null` token, Rollbar with no key. Depending on the library, that either crashes at boot or fails quietly.

**Why it happens:**
The find-and-replace looks equivalent, but the "absent" sentinel changes from `undefined` to `null`.

**How to avoid:**
- For each of the ~20 names, rewrite the guard as `const v = readSecret("X"); if (v) …`.
- Add a spec per call site covering the "neither file nor env" case. Use `_resetCacheForTests()`, because the cache is per-name and per-process, which makes specs order-dependent otherwise.
- **Do not** sweep non-secret config: `ENVIRONMENT` (44 uses), `LOG_LEVEL`, `TRUSTED_PROXY`, `CORS_*`, and **`CSRF_ENFORCE`**. `CSRF_ENFORCE` is the documented sub-5-minute rollback lever and has to stay a plain env toggle.

**Warning signs:**
- A spec passes locally but the container logs `Invalid token` / `not_authed` from Slack at boot.
- The worker logs `connect_error attempt to resolve using WORKER_SECRET` with a null token.

**Phase to address:** Secrets sweep phase (SEC-CFG-02).

---

### Pitfall 6: Secret provisioning blocks the entire stack deploy, or lands in the wrong stack file

**What goes wrong:**
- **An unprovisioned `external: true` secret fails the whole deploy.** If `docker stack deploy` references a secret that has not been created, the entire stack deploy fails, not just the one service.
- **The standard redeploy resets a login.** It is `restart.sh`, which prompts for and **resets the chronograf password** on every run.
- **The repo stack file is not the deployed one.** `docker-swarm.yml` in this repo is not the file production runs. The deployed stack is `/mnt/gluster/deployment/swarm/thinx.yml`. Editing only the repo copy changes nothing. Editing only the swarm copy lets the repo drift, as `registry.yml` did (memory: registry-storage-and-limits).
- **Swarm secrets are immutable.** Rotating one means creating a new name, which changes the `/run/secrets/<name>` path that `readSecret(name)` reads.
- **Some secrets are shared with another service.** `WORKER_SECRET` is shared with `thinx_worker`, which lives in a different repo. Moving the API side to a file-based secret while the worker still reads env is safe only if both hold the same value. Rotating one side breaks build dispatch.

**Why it happens:**
The v1.12 pattern (SEC-CFG-01) covered only three secrets that never rotate. The remaining ~20 include shared and rotatable credentials.

**How to avoid:**
1. Create each secret first (`docker secret create`).
2. Attach it per service with `docker service update --secret-add source=X_v1,target=X thinx_api`. The `target=` keeps the in-container filename stable across rotations.
3. Mirror the change into both the swarm `thinx.yml` and the repo `docker-swarm.yml`.
4. Verify inside the running container with `test -s /run/secrets/X`. `docker exec` is node-local, so query placement first.
5. Only then remove the env var.

Keep the env fallback during the transition and remove it in a later step. The Docker default mode `0444` root-owned is fine for the current root-running API. Recheck it if the image moves to a non-root DHI base.

**Warning signs:**
- `docker stack deploy` prints `secret not found`.
- The API boots but `docker service inspect thinx_api` still shows the value in `Env`, which means the sweep achieved nothing.

**Phase to address:** Secrets sweep phase. Its runbook is part of the deliverable.

---

### Pitfall 7: The builder path-traversal fix uses string-prefix checks and misses symlinks in the cloned repo

**What goes wrong:**
The paths Aikido flags are inside a **user-controlled git clone**:
- `thinx.yml` at `builder.js:725-731`
- the platform descriptor at `:811-825`
- `header_file` at `:893`
- the directory listing at `:682`

A fix built on `path.resolve()` plus `startsWith(BUILD_PATH)` passes code review and Aikido but misses the real attack. A repo can commit `thinx.yml` as a **symlink** to `/mnt/data/conf/config.json`, or to `/run/secrets/COUCHDB_PASS`. The secrets sweep adds more targets to that directory. `readFileSync` follows symlinks. The clone and the reads run **inside `thinx_api`** (`git.js` executes there), so the whole API filesystem is in scope.

A plain `startsWith` also accepts `/builds/abc-evil` as being inside `/builds/abc`.

**Why it happens:**
Scanners model "tainted string reaches fs sink". They do not model "the file itself is attacker-owned".

**How to avoid:**
- Resolve with `fs.realpathSync()`, then check containment with `path.relative(realBase, real)`: reject if it starts with `..` or is absolute. Alternatively, `lstatSync` and reject `isSymbolicLink()` for any repo-controlled file.
- `lib/thinx/secrets.js:25-30` already uses the right containment idiom. Reuse it.
- `languages_path` at `builder.js:1215-1229` is **app-owned**. Record it in `scripts/aikido-known-false-positives.json` instead of adding checks that do nothing.
- Keep existing behaviour, including the odd `directories[1] // 1 is always git` rule (`:692`). Pin it with a spec before touching it. A previous "harmless" builder fix (`prefetchPrivate` returning `undefined`) silently stopped all builds.

**Warning signs:**
- A spec with a symlinked `thinx.yml` fixture reads outside the tmpdir.
- After the fix, builds fail with `unknown platform` on real repos, meaning the check is too strict.

**Phase to address:** Code-sink hardening phase (builder + git). Schedule it **before or with** the secrets sweep, because the sweep makes `/run/secrets` a more valuable target.

---

### Pitfall 8: Moving `git.js` to argv loses `2>&1` and inverts fetch success detection

**What goes wrong:**
Fetch success is decided by searching the combined output for `"Cloning into"`, `"up-to-date"`, `"fatal"` and similar markers (`git.js:12-18, 21-47`). git writes these to **stderr**, and they reach `stdout` only because of the `2>&1` in the shell string (`git.js:137`). Once the call moves to `execFileSync(…)` without a shell:
- stderr is no longer captured, the markers vanish, and every fetch falls through to the `basename.json` fallback;
- that file was written by `printf … > ../basename.json`, which is also shell syntax;
- so every private build reports `git_fetch_failed`.

The catch branch does `e.stdout.toString()` (`git.js:73`). An `ENOENT` spawn error has no `stdout`, so that line throws and takes down the builder callback chain.

**Why it happens:**
The callers (`sources.js:259-312`, `devices.js:42-95`, `builder.js:~460-475`) do not pass commands. They pass **multi-statement shell scripts** that depend on `cd`, `&&`, globbing (`rm -rf ./*`, `cd *`), `$(…)` and redirection. The `ssh-agent sh -c` wrapper is a shell by design.

**How to avoid:**
Pick one design and write it down:
- **(A) Keep one constant script, pass values as positional parameters.** For example, `execFileSync("ssh-agent", ["sh", "-c", CONST_SCRIPT, "sh", keypath, askpath, url, branch, dir])` where the script uses only `"$1"…"$5"`. Values then never pass through the shell parser, which is a real argv boundary and keeps ssh-agent.
- **(B) Drop ssh-agent.** Use `GIT_SSH_COMMAND="ssh -i <key> -o IdentitiesOnly=yes"` with `SSH_ASKPASS_REQUIRE=force`, and call `execFileSync("git", [...], {cwd, env})` directly. `rm`, `cd *` and `basename.json` are then done in JS.

Either way:
- Capture stderr with `stdio: ["ignore", "pipe", "pipe"]` and join it into the string that `checkResponse` sees.
- Guard `e.stdout`/`e.stderr` for `undefined`.
- For any JS `rm -rf` replacement, assert the `cwd` is under the builds root. An unset `cwd` defaults to the app root.
- Remove the dead `// lgtm` comment (`git.js:71`). LGTM is retired and CodeQL ignores it.
- Add specs:
  - clone from a local bare repo over `file://` → success;
  - branch name `main;touch /tmp/pwned` → no file created;
  - a missing git binary → `false`, not a throw.

**Warning signs:**
- The build log shows `[TODO TEST] Git response result false` on repos that clone fine by hand.
- The build state stays at `created` with no log lines.

**Phase to address:** Code-sink hardening phase. Run it with the builder fix, since both share the `sources`/`devices`/`builder` call graph.

---

### Pitfall 9: Paging on the existing audit view is paging over *all* owners

**What goes wrong:**
- **The legacy "200 items" is 200 global rows, not the owner's 200.** `AuditLog.fetch()` queries `logs/logs_by_owner` with `descending: true, limit: 200`. That view emits `[doc.date, doc.owner]` (`design/design_logs.json`), so the key is **date first**. The owner is filtered in JS afterwards with `indexOf(owner)` (`audit.js:68-80`). What legacy users see is "my rows among the newest 200 rows of all tenants", which is often far fewer than 200.
- **Bookmark paging on that view returns mostly empty pages.** Pages come out empty or short for most owners. A user-supplied `startkey` becomes a cursor into other tenants' key range: the in-memory filter hides their rows, but the query still scans them. That is a BOLA-shaped bug and a performance problem at once.

**Why it happens:**
The view's name suggests it is keyed by owner. It is keyed by date.

**How to avoid:**
- Add a **new** view keyed `[owner, date]`. Page with:
  - `startkey=[owner, cursorDate]`, `endkey=[owner, {}]` (or `[owner]` when descending);
  - `startkey_docid` to break ties between equal dates, since log entries share timestamps;
  - `limit = pageSize + 1` to detect whether a next page exists.
- Always bound both keys to the **session owner** on the server. Never take owner from the cursor.
- Encode the cursor as opaque base64 JSON, validate it through the existing NoSQL sanitizer, and cap `pageSize` (≤200).
- Leave `logs_by_owner` and the no-params code path **byte-for-byte unchanged**, so the legacy console keeps its current, quirky 200-row semantics.

**Warning signs:**
- The Vue console shows a "next page" link on an empty page.
- A second owner's messages appear when a cursor is hand-edited.
- CouchDB CPU spikes on paging calls.

**Phase to address:** Log paging phase (API side). The Vue side follows in the console submodule.

---

### Pitfall 10: New CouchDB views never reach production, or they stall it

**What goes wrong:**
`Database.injectDesign()` runs **only when the database is first created** (`database.js:80-91`: an existing DB returns early). A view added to `design/design_logs.json` therefore ships in the image and never lands in the production `managed_logs` design doc. The paging code then gets `404 missing_named_view`.

The opposite mistake is **changing the map of an existing view**. That invalidates the whole index, and the first query blocks while CouchDB rebuilds it over the full `managed_logs` corpus. The audit-log page and `audit-ttl-probe` then time out.

**Why it happens:**
Design docs look like code but deploy like data.

**How to avoid:**
- Add the view under a **new name**, or better a **new design doc** (e.g. `_design/logs_paging`), so existing indexes are untouched.
- Ship an idempotent upsert: GET `_rev`, then PUT. It can run at boot or as an operator script, but it must not rely on DB creation.
- Warm the index (`?limit=0`) before the code path that uses it goes live. Avoid the 01:00–05:00 UTC compaction window and the daily retention delete job (memory: couchdb-log-retention-job).
- Use `stale=update_after` / `update=lazy` on the paging query so users never trigger a blocking build.
- The builds side needs the same treatment. `latest_builds` emits the **full doc** (including the `log` array) keyed by owner, and `BuildLog.list()` **prunes docs older than 30 days as a side effect of listing** (`buildlog.js:328-360`). A paged caller would run that prune on every page. Add a projection view that emits only the summary fields, and keep the prune out of the paging path.

**Warning signs:**
- `missing_named_view` in the API log after deploy.
- `_active_tasks` shows an `indexer` on `managed_logs` running for minutes.
- The audit-log page hangs.

**Phase to address:** Log paging phase.

---

### Pitfall 11: Changing the default retention policy on `stats` hides existing data and blanks the dashboard

**What goes wrong:**
Every read in `lib/thinx/influx.js` names `"stats"."autogen"` explicitly (`:66, :86, :108, :132`). Writes (`writePoint`, `:37`) name no RP, so they go to **whichever RP is DEFAULT**.

Running `ALTER RETENTION POLICY "31d" ON "stats" DEFAULT` therefore sends new writes to `31d` while the dashboard keeps reading `autogen`. Daily and weekly counts freeze and then fall to 0. The history in `autogen` stays infinite. There is no error anywhere.

**Why it happens:**
The fix everyone reaches for is "make the correctly sized RP the default". The backlog note flags this trap, and the code comment at `influx.js:5-7` does too.

**How to avoid:**
- Keep `autogen` as the default and **shorten it**: `ALTER RETENTION POLICY "autogen" ON "stats" DURATION 90d`. No code change is needed. Check that no read spans longer than the new duration: the reads are today, 7 days, and all-time `count`. The all-time totals will shrink, which is intended but should be noted in the phase SUMMARY.
- Take a backup first (`influxd backup -portable -db stats`). Data under a shortened RP is gone once the retention check runs.
- To make the setting survive a rebuilt influx volume, add the `autogen` ALTER to `provisionDB()`, which already runs on every boot and reconciles RPs (`:145-176`).
- **Never** add `isDefault: true` to `RETENTION_POLICY`. Every API boot would flip the default again.

**Warning signs:**
- `SELECT count(*) FROM "stats"."31d".<m>` grows while the `autogen` counts stop moving.
- The Vue Visits widget shows 0 the day after the change.

**Phase to address:** InfluxDB retention phase (ops plus a small code change).

---

### Pitfall 12: Trimming Swarmpit breaks registry → autoredeploy, the core 5-minute deploy SLA

**What goes wrong:**
Swarmpit's only job that matters here is autoredeploy, which requires `swarmpit_app` to be healthy. The trim can break it in several ways:
- **The app hangs at startup.** Removing `swarmpit_influxdb` while `swarmpit_app` still has `SWARMPIT_INFLUXDB` set can leave the app stuck connecting. The known failure is already in the recovery skill: the task is Running, the logs are empty, and swarmpit.thinx.cloud returns 502.
- **A stale stack file.** Redeploying the Swarmpit stack from a stale `swarmpit.yml` loses labels, networks and limits. `registry.yml` had drifted the same way (memory: registry-storage-and-limits).
- **Losing `swarmpit_db`.** Resetting it (couchdb 2.3.0, kept by decision) wipes the stored **registry credentials** and service settings that autoredeploy depends on.

A broken autoredeploy then stalls **every other v1.14 phase's deploy** without any error.

**Why it happens:**
The UI half and the deploy half live in one app. Nothing in Swarmpit's docs says which components autoredeploy depends on. The docs say only that leaving `SWARMPIT_INFLUXDB` unset disables statistics (MEDIUM confidence).

**How to avoid:**
- Change **one component at a time**. After each change, gate on a no-op push to `thinx-staging` and confirm `docker service ps thinx_api` shows a new task within 5 minutes.
- Order:
  1. unset `SWARMPIT_INFLUXDB` on `swarmpit_app` and verify autoredeploy;
  2. `docker service rm swarmpit_influxdb` and verify;
  3. only then try removing `swarmpit_agent` and verify. Its role in autoredeploy is **unverified (LOW)**.
- Before any `docker stack deploy`, diff the gluster stack file against `docker service inspect`. Prefer `docker service update` / `docker service rm`.
- Never touch `swarmpit_db` data.
- Run the trim **after** the code phases have deployed, or in a window with no pending pushes. Avoid the ~06:45 UTC unattended-upgrades window, which bounced dockerd on 2026-09-22.

**Warning signs:**
- `docker service logs swarmpit_app --since 5m` is empty.
- A green CircleCI run with no new `thinx_api` task.
- swarmpit.thinx.cloud returns 502.

**Phase to address:** Swarmpit trim phase. It should be the **last** phase, with rung-1 recovery (`docker service update --force swarmpit_app`) staged in the plan.

---

## Moderate Pitfalls

### Pitfall 13: Editing the gluster CSP file in place does not reach the running containers

**What goes wrong:**
`default.conf` is a **single-file** bind mount into both `thinx_console` and `thinx_vue`. A single-file bind mount is pinned to the file's inode when the container starts. `vim`, `sed -i` and `git checkout` all write a new file and rename it over the old one, which creates a new inode. The container keeps serving the old policy even after `nginx -s reload`, while `cat` on the host shows the new content. GlusterFS FUSE adds its own caching on top.

**How to avoid:**
- Change the file, then restart both consumers with `docker service update --force thinx_console` / `thinx_vue`. Alternatively write in place (`cat new > default.conf`).
- Verify with `curl -sI` against **both** hostnames.
- In the long run, mount the directory, not the file.

**Phase to address:** Console CSP source-of-truth phase.

### Pitfall 14: Two layers emit CSP, and the browser enforces the intersection

**What goes wrong:**
There are two CSP layers: the edge `rtm.thinx.cloud` nginx (runbook snapshots `rtm.thinx.cloud-server.{pre,post}.nginx:29` carry a CSP) and the console `default.conf`. If both emit a `Content-Security-Policy` header, browsers enforce **both**. A host added in one layer (e.g. `cdn.rollbar.com`) is still blocked by the other.

Separately, nginx `add_header` in a `location` block **drops every server-level `add_header`**. When the image configs are reconciled with production, a location that sets `Cache-Control` silently loses CSP and HSTS on that path.

**How to avoid:**
- Count the headers: `curl -sI https://rtm.thinx.cloud/ | grep -ci content-security-policy` must print `1`, and the same on `console.` and `app.`.
- Parse the effective policy per path (`/`, `/app/`, a static asset).
- Make the image configs a byte-mirror of the gluster file and add a CI diff against `swarm-configs/console-default.conf.prod`. Refresh that snapshot from the **live** file, not from memory.

**Phase to address:** Console CSP source-of-truth phase.

### Pitfall 15: The classic register / forgot / reset-confirm check gets masked by the legacy JSON double-parse bug

**What goes wrong:**
- The classic reset-confirm page is reached cold, from an email link with no cookie jar, so it must prime before its POST.
- `password.js:87` and `login.js:173` contain the out-of-scope `JSON.parse` double-parse bug (CONSOLE-LEGACY-JSON-PARSE). A `403 csrf_token_invalid` can surface as a JS `SyntaxError`, and the spot-check ends up recording the wrong failure.
- Reset links now point at the Vue console (`/password-reset?`), so the classic page is reachable only through old emails. Testers may skip it.

**How to avoid:**
- Check all three flows in a fresh browser profile with DevTools open.
- Record the **network** status and body for `/api/user/create`, `/api/user/password/reset` and `/api/user/password/set`, not just what the UI shows.
- Test with the API log tailed for `reason=`.

**Phase to address:** CSRF / CSP phase (verification task).

### Pitfall 16: WR-04 enforcement on `POST /api/v2/user` is never exercised in CI

**What goes wrong:**
`spec/mnt/data/conf/config.json:48` has `csrf_enforce: false`. `ZZ-AppSessionUserV2DeleteSpec.js:48` posts `/api/v2/user` without a token and passes. Adding `csrf.verifyCsrfToken` to the route (`router.user.js:147`) stays green in CI, and in production it starts 403-ing every external registrant that has not been changed to prime: scripts, Postman collections, API docs examples.

With WR-06, a non-browser client also needs a **cookie jar** to hold the session the token is bound to.

**How to avoid:**
- Add an enforced-mode spec (`process.env.CSRF_ENFORCE = 'true'`, as in `ZZ-CSRFSpec.js:111`) that covers three cases: no token → 403; primed via `GET /api/v2/csrf-token` with a cookie jar → 200; and the same under the WR-06 mode.
- Update the existing registration spec to prime.
- Publish the two-step flow (GET token with a cookie jar, then POST with the header) in the API docs **before** the deploy.
- Do not add an `Origin: device` exemption. The decision of 2026-09-25 rules it out, and `isNonBrowserRequest` gates only minting anyway.

**Phase to address:** CSRF hardening phase.

### Pitfall 17: The CodeQL upgrade floods alerts, conflicts with default setup, or blocks PRs

**What goes wrong:**
The current workflow (`.github/workflows/codeql-analysis.yml`) triggers on the deleted `master` branch and uses `checkout@v2`, `codeql-action/*@v1` and the obsolete `git checkout HEAD^2` PR step. The upgrade can fail in several ways:
- **Default-vs-advanced conflict.** If CodeQL **default setup** is also enabled in repo settings, the advanced workflow's SARIF upload is rejected.
- **Wrong major.** Jumping to v3 is wasted work: v3 is deprecated in December 2026 and v4 (Node 24) is current (GitHub changelog, 2025-10-28).
- **Alert flood.** The first run on `main` raises every historical alert, because `// lgtm` suppressions are no longer honoured. That includes `git.js:71`.
- **Blocked merges.** If the check becomes *required* on `main`, a slow or failing run blocks the solo maintainer's PR merges.
- **Pushes not scanned.** Production code arrives through `thinx-staging` pushes. A `main`-only trigger scans only at PR time.

**How to avoid:**
- Use `github/codeql-action/{init,analyze}@v4` and the current `actions/checkout` major.
- Delete the `HEAD^2` step.
- Set `languages: javascript-typescript` and trigger on push to `main` and `thinx-staging` plus `pull_request` to `main`.
- Add `paths-ignore` for vendored and minified assets.
- Check Settings → Code security that default setup is **off**.
- Keep the job **non-required** until the baseline has been triaged.
- Land it **after** the `git.js`/builder fixes so the baseline is smaller.

**Phase to address:** CI hygiene phase, after code-sink hardening.

### Pitfall 18: The registry "retry" is already there, and retrying login hides the real contention

**What goes wrong:**
- **The retry already exists.** `registry-login` (5 attempts, 10-40 s backoff) has been in place since `be376db9`. Re-implementing it duplicates code.
- **One login still has no retry.** The one not covered is the raw `docker login --username $DOCKER_LOGIN --password $DOCKER_PASSWORD https://registry.thinx.cloud:5000` in the test job (`config.yml:767`). It also passes the password on argv.
- **The root cause is push contention, not login.** The registry stalls while it absorbs a concurrent push; the 0.05-CPU cap outage of 2026-09-21 is the extreme case. Pushes and pulls can time out as well, and the retries can add up to 100 s against the 5-minute deploy SLA.

**How to avoid:**
- Route `config.yml:767` through `registry-login` with `--password-stdin`.
- Add a bounded retry around `docker push` too.
- Consider a CircleCI `serial-group` so the publish jobs push to `registry.thinx.cloud:5000` one at a time.
- Do not raise the retry count past 5.

**Phase to address:** CI hygiene phase. Expect a discrepancy branch: verify first.

### Pitfall 19: The Vue hostname var is already wired, but may be unset, missing a scheme, or ignored by the Dockerfile

**What goes wrong:**
- **An unset variable fails the job.** `VUE_WEB_HOSTNAME` is on the `required_vars` list (`config.yml:174`). If the CircleCI project or context never received the value, every Vue build fails in "Check Required Environment Variables" and the console stops deploying.
- **A missing scheme gives relative links.** The shared `WEB_HOSTNAME` is written without a scheme in the image (`rtm.thinx.cloud`) and with one in the local test env (`https://rtm.thinx.cloud`). A scheme-less value in `VUE_APP_CONSOLE_HOSTNAME` produces a *relative* footer link (`console.thinx.cloud/...` resolved against the current origin).
- **The variable may never reach the bundle.** The build arg must be declared `ARG` and exported `ENV` **before** `npm run build` in `services/console/vue/Dockerfile`, or it is not baked in.
- `hostnames.js:4` already falls back to `window.location.origin` when the var is empty. That fallback may be the simplest correct behaviour.

**How to avoid:**
- Check the CircleCI var exists before any change.
- `grep` the built bundle for the hostname.
- Click the three footer links (`Layout.vue:12`, `Login.vue:91`, `PasswordReset.vue:96`) on the deployed `console.thinx.cloud`.
- Never change the shared `WEB_HOSTNAME`, because the classic build needs `rtm`.

**Phase to address:** CI hygiene / console phase. Expect a discrepancy branch.

---

## Minor Pitfalls

### Pitfall 20: `docker exec` into the wrong InfluxDB
`docker ps -qf name=influxdb` matches **both** `swarmpit_influxdb` (1.7, must stay untouched) and `thinx_influxdb` (1.8), and `docker exec` is node-local. Use `name=thinx_influxdb` and confirm `influx -version` reports 1.8 before running any `ALTER`. Also note that `thinx_influxdb` contains its own `swarmpit` **database**. Find out whether Swarmpit writes there (through a shared `influxdb` DNS alias) before assuming that removing `swarmpit_influxdb` removes Swarmpit's stats load. LOW confidence: needs a live check.

### Pitfall 21: Treating `docker service ls` output as truth during ops phases
Under load it returns an unstable subset. Query each service by name (`docker service ps <name>`). Watch for the stale overlay FDB entry after any dockerd bounce; the fix is `docker service update --force thinx_thinx-redis`, not moving services around.

### Pitfall 22: `readSecret` cache leaks between specs
The module-level cache (`secrets.js:18`) holds the first value per name for the life of the process. Jasmine runs specs in a fixed order (pinned 5.x), so a spec that sets `process.env.X` after another spec has already read `X` will see the stale value. Call `_resetCacheForTests()` in `beforeEach` of every new spec.

### Pitfall 23: Paging cursor on the CouchDB `date` field with mixed formats
If older `managed_logs` docs store `date` in a different format (ISO string vs epoch), CouchDB collation orders numbers before strings. Paging then jumps across the format boundary. Sample the oldest and newest docs before choosing a cursor key.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep env fallback in `readSecret()` after provisioning secrets | Zero-risk rollout | Secrets still visible in `docker service inspect`; the sweep achieves nothing | Only during the transition; remove within the same milestone |
| Suppress `git.js`/builder findings in the Aikido FP list | Quiet scan output | Hides a real sink (STATE.md says to leave `git.js` visible) | Never for `git.js`; acceptable for app-owned `languages_path` |
| Page audit logs with `skip` | Trivial to implement | O(n) scans on a large `managed_logs`; slows as history grows | Never; use a key cursor |
| Modify `logs_by_owner` in place to add owner-first keys | One view instead of two | Full index rebuild on prod; changes legacy semantics | Never; add a new view or design doc |
| Flip the `stats` default RP to `31d` | "Uses the RP that already exists" | Blank dashboard; stranded `autogen` data | Never without also changing every read to the new RP |
| Hand-edit the gluster `default.conf` without mirroring into the repo | Fast CSP fix | Fourth divergence; next mount removal locks users out | Emergency only, with the mirror commit the same day |
| `docker stack deploy` for a one-service change | One command | Resets the chronograf password; stale-file drift can take services offline | Never for single-service changes; use `docker service update` |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis session store + CSRF HMAC | Bind to `req.sessionID` while `saveUninitialized:false` | Create a pre-auth session on priming, or keep double-submit pre-auth; decide in CONTEXT |
| Classic AngularJS console | Assume the `$.ajaxSetup` seam covers every mutating call | AngularJS `$http` sends `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie natively **only for same-origin URLs**; audit any newly guarded route's call path (MEDIUM) |
| Vue console `fetchWithCsrf` | Expect retry-once to rescue a rotated token for every call | Only calls routed through `fetchWithCsrf` / `request()` retry; set the new cookie in the login response |
| Docker swarm secrets | `external: true` in the stack file before `docker secret create` | Create → `--secret-add` per service → verify → remove env |
| `thinx_worker` (other repo) | Rotate `WORKER_SECRET` on the API only | Rotate both sides together or build dispatch breaks |
| CouchDB design docs | Edit `design/*.json` and expect a deploy to apply it | Explicit `_rev`-aware upsert, then warm the index |
| InfluxDB 1.8 | Expect `ALTER … DURATION` to delete old data at once | Enforcement runs on the retention check interval (default 30 min) at shard-group granularity (7 d for infinite RPs); old points linger up to one shard-group length |
| Swarmpit 1.9 | Remove influx/agent services first, config second | Unset `SWARMPIT_INFLUXDB` first, verify autoredeploy, then remove services one by one |
| GitHub code scanning | Advanced workflow with default setup still enabled | Disable default setup before merging the advanced workflow |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| First query on a new or changed CouchDB view | Audit page hangs; `indexer` in `_active_tasks` | Warm before release; `update=lazy` on user queries | Any `managed_logs` size above a few 10k docs |
| `latest_builds` emits full docs with the `log` array | Slow build list; large responses | Projection view emitting summary fields only | Owners with hundreds of builds |
| `BuildLog.list()` prunes as a side effect | Paging triggers repeated destroys | Keep the prune out of the paged path | Every paged call |
| Pre-auth sessions for every prime | Redis key growth from bots and scanners | Short TTL on pre-auth sessions; rate-limit the prime | Crawler traffic on the console hosts |
| Retry-heavy CI publish | Deploy exceeds the 5-min SLA | `serial-group` for registry pushes; cap retries | Several publish jobs in one pipeline |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| HMAC applied to the cookie, equality check on the header | Planted `.thinx.cloud` cookie still passes; WR-06 not fixed | Verify the **header** token's HMAC against `req.sessionID` |
| Per-boot random HMAC key | 403 wave on every deploy; operators turn enforcement off | Swarm secret via `readSecret`, fail closed if missing |
| Owner taken from the paging cursor | Cross-tenant log read (BOLA) | Owner always from the session; cursor holds date/docid only |
| `startsWith` path containment | Prefix-sibling escape; symlink escape to `/run/secrets` | `realpath` + `path.relative` containment, reject symlinks |
| Leaving `// lgtm` as the "suppression" | False sense of triage | Real triage in CodeQL, or an Aikido FP entry with justification |
| Regenerating the session in the JWT bridge | Session churn, token invalidation, audit noise | Rotate only at interactive login sites |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Vue paging shows empty pages (global-view paging) | "No more logs" while history exists | Owner-first view; `limit+1` has-more detection |
| Legacy console count changes after the paging deploy | Legacy users see a different audit list | No-params path byte-identical to today |
| Post-login first action 403s, then works | Looks flaky; users retry or give up | New `XSRF-TOKEN` in the login response |
| Dashboard counts collapse after retention | "All my devices stopped checking in" | Shorten `autogen`, don't flip the default; note the all-time total change in release notes |

## "Looks Done But Isn't" Checklist

- [ ] **WR-06:** Cold login on **both** consoles, and on Google and GitHub OAuth, under `CSRF_ENFORCE=true` with the new mode. Verify the session cookie value changed across login.
- [ ] **WR-06:** Forced `thinx_api` redeploy mid-session → the next console POST still succeeds, so the key is stable.
- [ ] **WR-04:** Enforced-mode spec for `POST /api/v2/user` exists and fails without a token. API docs show the prime step.
- [ ] **Secrets sweep:** `docker service inspect thinx_api --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}'` no longer lists the swept names. `/run/secrets/<name>` is non-empty in the running container.
- [ ] **Secrets sweep:** repo `docker-swarm.yml` and gluster `thinx.yml` agree.
- [ ] **CSP:** exactly one CSP header on `rtm.`, `console.` and `app.`. Live header matches the repo mirror and snapshot. Both console services were restarted after the edit.
- [ ] **Builder:** spec with a symlinked `thinx.yml` → rejected. A real public repo still builds.
- [ ] **git.js:** a real private-repo fetch succeeds end to end on production (build log shows lines, not a `created` stall).
- [ ] **CodeQL:** a run appears on a `main` push **and** a `thinx-staging` push. Default setup is off. The check is not required.
- [ ] **Registry:** no raw `docker login` left in `.circleci/config.yml` outside `registry-login` and the Docker Hub `--password-stdin` pairs.
- [ ] **Vue hostname:** deployed bundle contains the Vue host. All three footer links open `console.thinx.cloud`.
- [ ] **Log paging:** new view exists in the **production** design doc (GET `_design/…`). Legacy response unchanged (diff before/after for one owner).
- [ ] **Influx:** `SHOW RETENTION POLICIES ON stats` → `autogen` finite and still DEFAULT. Dashboard non-zero 24 h later.
- [ ] **Swarmpit:** a no-op `thinx-staging` push after the **final** trim step produces a new `thinx_api` task in under 5 min.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CSRF lockout after the WR-06 flip | LOW | Set `CSRF_MODE=double-submit` (or `CSRF_ENFORCE=false`) via `docker service update --env-add`, under 5 min per `csp-csrf-hardening.md` |
| Boot crash from the secrets sweep | LOW | Re-add the env var with `--env-add`; the `readSecret` env fallback takes over |
| Stack deploy blocked by a missing secret | LOW | `docker secret create`, then redeploy; if urgent, revert the stack file from the gluster git repo |
| git fetch success inverted | MEDIUM | Revert the `git.js` commit (single-file revert); builds resume on the next autoredeploy |
| Stranded `autogen` data after a default flip | MEDIUM | `ALTER RETENTION POLICY "autogen" ON "stats" DEFAULT` restores reads; points written to `31d` in the meantime must be copied back with `SELECT * INTO "stats"."autogen".:MEASUREMENT FROM "stats"."31d"./.*/ GROUP BY *` |
| Retention deleted too much | HIGH | Restore from the pre-change `influxd backup -portable`; no backup = data gone |
| CouchDB view rebuild stalls prod | MEDIUM | Delete the new design doc (existing views untouched if it was separate); re-add off-hours and warm it |
| Autoredeploy dead after Swarmpit trim | MEDIUM | Rung 1 `docker service update --force swarmpit_app`; re-add `SWARMPIT_INFLUXDB` / recreate the service from the diffed stack file; `./restart.sh` as last-resort manual deploy |
| CSP edit not served | LOW | `docker service update --force thinx_console thinx_vue` |

## Pitfall-to-Phase Mapping

Phase names are suggestions. Numbering starts at 22 per PROJECT.md.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 5, 6, 22 readSecret semantics, provisioning, cache | Secrets sweep (SEC-CFG-02), **first** | Per-site null-case specs; inspect shows no swept env; `/run/secrets` populated |
| 7 builder symlink traversal | Code-sink hardening (with or before the sweep) | Symlink fixture spec; real repo builds |
| 8 git.js argv / stderr | Code-sink hardening | `file://` bare-repo spec, injection spec, prod private fetch |
| 1, 2, 3, 4, 16 WR-06 / WR-04 | CSRF hardening (after secrets) | Enforced specs per login path; cold logins on both consoles; redeploy-survival check |
| 13, 14, 15 CSP source of truth + classic spot-check | CSRF/CSP phase (same deploy surfaces) | One CSP header per host; mirror diff in CI; network-level spot-check |
| 17 CodeQL | CI hygiene (after code-sink hardening) | Runs on both branches; not required; default setup off |
| 18, 19 registry retry, Vue hostname | CI hygiene (verify-first, likely discrepancy) | No raw login left; bundle grep; footer links |
| 9, 10, 23 log paging | Log paging (API + console submodule) | Prod design doc has the view; legacy diff identical; cross-owner cursor test |
| 11, 20 Influx retention | Ops phase: InfluxDB | Backup taken; `autogen` finite + DEFAULT; dashboard non-zero next day |
| 12, 21 Swarmpit trim | Ops phase: Swarmpit, **last** | No-op push → new task under 5 min after each step |

**Ordering rationale from the pitfalls:**
- Secrets come before CSRF (the HMAC key) and before or with the builder fix (it enlarges the symlink blast radius).
- Code-sink fixes come before CodeQL (smaller alert baseline).
- Swarmpit comes last, because it can take down the deploy path every other phase relies on.
- InfluxDB and Swarmpit ops should not share one maintenance window with a code deploy.

## Sources

- **Codebase, read 2026-09-25 (HIGH):**
  - `lib/middleware/csrf.js`
  - `thinx-core.js:338-343`
  - `lib/router.auth.js`, `lib/router.user.js:147-214`, `lib/router.js:80-100`
  - `lib/thinx/secrets.js`, `queue.js:352`, `messenger.js:128-148`
  - `lib/thinx/git.js`, `builder.js:470-740`
  - `lib/thinx/audit.js:68-92`, `buildlog.js:320-360`, `database.js:80-91,175-192`
  - `design/design_logs.json`, `design/design_builds.json`
  - `lib/thinx/influx.js`
  - `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml`
  - `services/console/vue/src/utils/cookies.js`, `core/api.js`, `mixins/hostnames.js`
  - `spec/mnt/data/conf/config.json`
- **Project records (HIGH):**
  - `.planning/PROJECT.md`, `.planning/STATE.md`, `AGENTS.md`
  - `.planning/runbooks/console-csp-source-of-truth.md`
  - auto-memory notes: swarm-node-topology, swarm-unattended-upgrade-outage, registry-storage-and-limits, swarm-stack-deploy-and-couchdb-dhi, backlog-influxdb-retention, backlog-swarmpit-minimize, backlog-log-paging, api-image-deploy-path
  - `.claude/skills/swarm-autopull-recovery/SKILL.md`
- **External (MEDIUM unless noted):**
  - [GitHub Changelog: Upcoming deprecation of CodeQL Action v3](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/) and [codeql-action issue #3271](https://github.com/github/codeql-action/issues/3271): v4 current, v3 deprecated Dec 2026
  - [Swarmpit configuration docs](https://github.com/swarmpit/swarmpit/blob/master/doc/configuration.md): `SWARMPIT_INFLUXDB` nil disables statistics; agent/autoredeploy coupling **not documented** (LOW for agent removal safety)
  - [InfluxDB v1 database management (InfluxQL)](https://docs.influxdata.com/influxdb/v1/query_language/manage-database/) and [InfluxData community: altering autogen retention](https://community.influxdata.com/t/alter-autogen-retention-policy-and-drop-data-older-than-1-year-on-an-existing-database/9154): DEFAULT semantics, lagged deletion
  - [moby/moby #6011](https://github.com/moby/moby/issues/6011) and [bind-mount inode trap](https://dev.to/anand_rathnas_d5b608cc3de/your-sed-i-edit-isnt-reaching-the-container-the-bind-mount-inode-trap-4ip6): single-file bind mounts pin the inode

---
*Pitfalls research for: THiNX Device API v1.14 Backlog & Hardening Sweep*
*Researched: 2026-09-25*
