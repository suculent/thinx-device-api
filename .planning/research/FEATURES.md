# Feature Research

**Domain:** Security hardening, backlog closure and ops hygiene for a brownfield Node/Express IoT device API (THiNX), milestone v1.14 "Backlog & Hardening Sweep"
**Researched:** 2026-09-25
**Confidence:** HIGH for codebase dependencies (read directly from source). MEDIUM for external behaviour: OWASP and Swarmpit source were fetched from the primary source, but the `classify-confidence` seam rates websearch/webfetch as LOW, so those claims are marked as needing checks at plan time.

> **Terminology.** In this milestone the "users" are the two consoles (Vue and legacy AngularJS), non-browser API clients, the operator, and CI. A "table stake" is the behaviour needed to call an item *done correctly*. A "differentiator" is worth doing if it's cheap. An "anti-feature" is scope creep, or a way of doing the item that looks right but breaks something.

---

## Headline findings (read before scoping phases)

1. **WR-06: "bind to the session id" does not work for the routes CSRF protects today.** `saveUninitialized: false` (`thinx-core.js:~337`) means an anonymous visitor has no stable `req.sessionID`. Every route currently behind `verifyCsrfToken` runs *before* authentication, except `/api/v2/session/token`: `/api/login`, `/api/v2/login`, `/api/v2/password/{reset,set}`, `/api/user/create`, `/api/user/password/{reset,set}`. OWASP's answer is a **pre-session**: create a session when the token is primed, then **regenerate** it on login. Nothing calls `req.session.regenerate` today. Login assigns `req.session.owner` directly at 5 sites (`router.auth.js:72,83,161,322`, `router.google.js:153`), so session fixation is also open.
2. **`issueCsrfToken` echoes whatever cookie is present.** Under a bound scheme the consoles' "retry once after `csrf_token_invalid`" re-prime would be handed back the same stale token and loop into a second 403. The priming endpoint has to **validate and re-mint**.
3. **Log paging needs a new CouchDB view, and design docs never update in production.** `Database.injectDesign()` runs only when the DB is first created. The `existing_dbs.includes("logs")` check never matches the `<prefix>managed_logs` names, the create call fails with `file_exists`, and injection is skipped. The insert also carries no `_rev`, and conflicts are logged silently. Editing `design/design_logs.json` therefore does **nothing** in production. Paging needs a rev-aware design-doc upsert or a new design doc plus an explicit install step.
4. **The "legacy 200-item behaviour" is not what it sounds like.**
   - **Audit:** `logs_by_owner` emits the key `[date, owner]`, so `fetch()` reads the newest 200 audit rows **across all tenants** and then filters by owner in JS. An owner sees at most 200 entries, often far fewer. The view value also omits `flags`, so every entry comes back as `["info"]`.
   - **Builds:** `list()` has **no** 200 cap. It scans the whole `latest_builds` view (full documents for every tenant) with no `key`, filters in memory, and **prunes documents older than 30 days as a side effect of reading**.

   "Unchanged when params are absent" has to be defined against these real behaviours.
5. **Three targets are already partly done.**
   - **Registry login retry:** the `registry-login` command exists (`be376db9`). The remaining gap is the unretried `docker login --password $DOCKER_PASSWORD https://registry.thinx.cloud:5000` at `.circleci/config.yml:767`, which also puts the password on argv.
   - **Vue hostname var:** `VUE_WEB_HOSTNAME` is already wired and preflighted (`3f2f6da4`).
   - **Vue `connect-src app.thinx.cloud`:** already restored in console `60e1ef0`.

   Scope these items as *finish and verify*, not *build*.
6. **Swarmpit autoredeploy does not depend on the agent container or InfluxDB.** It is a 1-minute `chime` job inside the **app** (`src/clj/swarmpit/agent.clj`; the name refers to a Clojure scheduling construct, not the `swarmpit/agent` service). It compares registry digests and calls `api/redeploy-service`. Unsetting `SWARMPIT_INFLUXDB` disables stats. `swarmpit_db` (CouchDB) is still required.

---

## Feature Landscape

### Table Stakes (must be true for each item to count as done)

| # | Feature | Why Expected | Complexity | Notes / dependency on existing code |
|---|---------|--------------|------------|-------------------------------------|
| 1a | **Signed token format** `hex(HMAC-SHA256(k, len(sid)+"!"+sid+"!"+len(r)+"!"+r)) + "." + hex(r)` | The OWASP-recommended "Signed Double-Submit Cookie". Stops a sibling `*.thinx.cloud` host from planting a usable value, because a planted token fails the HMAC check for the victim's session. | MEDIUM | Replaces `crypto.randomBytes(24).toString('hex')` in `csrf.js:ensureXsrfCookie`. `verifyCsrfToken` keeps the header==cookie `timingSafeEqual` check and adds format regex + HMAC recompute against `req.sessionID`. The `failureReason` codes gain `bad_format` and `session_mismatch`. |
| 1b | **Pre-session for unauthenticated routes** | Every protected route except `/session/token` is pre-auth, and without a session there is nothing to bind to. OWASP: "mitigate login CSRF by creating pre-sessions". | MEDIUM | The GET `/api/csrf-token` and `/api/v2/csrf-token` handlers write a marker (e.g. `req.session.csrf_seed = r`). That makes express-session persist the session and set `x-thx-core`, even with `saveUninitialized:false`. Anonymous Redis sessions then come only from priming calls (1h `maxAge`), not from every request. |
| 1c | **Rotate on login (session regenerate)** | OWASP: "a new session should generate a new token", and "the session must be destroyed and regenerated upon authentication". This also closes session fixation. | MEDIUM-HIGH | Add one helper (e.g. `establishLogin(req, owner, cb)`) that runs `req.session.regenerate()`, copies what must survive, calls `SessionToken.markLogin`, and mints the new token. Wire it into all 5 login sites: password, token/OAuth-token (`router.auth.js:72,83`), GitHub/Google OAuth. `regenerate` is async, so each site changes control flow. **Do not** hook it into the per-request Bearer path at `router.js:94`. The login response must carry the new `Set-Cookie: XSRF-TOKEN` (and ideally `csrf_token` in the body). |
| 1d | **Priming endpoint re-mints invalid/stale tokens** | Both consoles recover from `csrf_token_invalid` by force re-priming once (`vue/src/utils/cookies.js:ensureCsrfToken({force})`, legacy `csrf.js` retry). If the endpoint echoes the stale cookie, the retry fails as well. | LOW | `issueCsrfToken` must check the existing cookie against the current session and mint a new one when it is invalid. |
| 1e | **Logout clears the token** | Rotation on the session boundary works in both directions. | LOW | `logoutAction` clears `XSRF-TOKEN` on the same `domain`/`path` it was set with. A mismatched domain leaves a duplicate cookie; the existing `xsrf_cookies=N` diagnostic already detects that case. |
| 1f | **A dedicated HMAC key via `readSecret('CSRF_SECRET')`** | Keeps the CSRF key separate from the session secret, so each can be rotated on its own. | LOW | Depends on the SEC-CFG-02 pattern (`lib/thinx/secrets.js`). If the key is unset, fail closed at boot when enforcing. Or derive it from the session secret with HKDF and document that. |
| 1g | **Rollback flag kept** (`CSRF_ENFORCE`) and effective mode logged at boot | The runbook rollback path `csp-csrf-hardening.md` must keep working. Review item IN-02 asks for the effective-mode log. | LOW | Normalise the value with `/^(1\|true\|yes)$/i` and log `CSRF enforcement: ON (env)` once. |
| 2a | **`POST /api/v2/user` wrapped in `csrf.verifyCsrfToken`** | Decision 2026-09-25: no machine-client exemption. Today v2 bypasses the protection that v1 `/api/user/create` has. | LOW | One-line route change in `router.user.js:147`. |
| 2b | **Non-browser priming contract documented** | Machine clients now need `GET /api/v2/csrf-token`, a cookie jar that keeps **both** `x-thx-core` (pre-session, per 1b) and `XSRF-TOKEN`, then `X-XSRF-TOKEN` on the POST. | LOW | Update `thinx-api-openapi.yaml` (served at `/api/v2/spec`) and reuse the WR-07 components. Fix `ZZ-AppSessionUserV2DeleteSpec.js:46-48`, which posts with no token and passes today only because CI runs fail-open. Add a shared chai-http v4 agent-priming spec helper (`chai.request.agent`; chai-http stays at v4 per AGENTS.md). |
| 3a | **Image `default.conf` files mirror the gluster file** (`/mnt/gluster/deployment/swarm/console/default.conf`) | Decision 2026-09-25: gluster is canonical. Today the image configs lack `cdn.rollbar.com`, CloudFront, cdnjs, `*.gravatar.com` and `avatars.githubusercontent.com`, and several non-CSP headers diverge. | LOW-MEDIUM | Touches `services/console/src/default.conf` and `services/console/vue/default.conf` (submodule pointer bump) and `.planning/runbooks/swarm-configs/console-default.conf.prod`. **Mirror means copying production, including production's weaker `X-Permitted-Cross-Domain-Policies: all`.** Any hardening is a separate, deliberate edit made on gluster first. |
| 3b | **Spot-check classic register / forgot / reset-confirm under enforcement** | These three classic flows were never walked in a cold browser under enforcement (v1.13 verified logins only). | LOW (manual) | Must run **after** WR-06 deploys, because WR-06 changes the priming flow these pages use. |
| 4a | **Every sensitive credential read goes through `readSecret(name)` with env fallback** | Finishes SEC-CFG-01. Docker secrets take priority over env, and existing `.env` deployments keep working. | LOW-MEDIUM | Credential env vars found in `lib/` + `thinx-core.js`: `SLACK_BOT_TOKEN`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK`, `GITHUB_CLIENT_SECRET`, `GOOGLE_OAUTH_SECRET`, `MAILGUN_API_KEY`, `ROLLBAR_ACCESS_TOKEN`, `WORKER_SECRET`, `GIT_KEY_PASSPHRASE` (9). The "~20" figure must be reconciled with an inventory that also covers secrets loaded from `config.json` (session secret, JWT signing material, etc.) and scripts. |
| 4b | **`GIT_KEY_PASSPHRASE` passed explicitly to the child env** | The askpass helper reads `$GIT_KEY_PASSPHRASE` from the **inherited** process env (`git.js:create_askfile`). If it is only moved to a secret file, the child never sees it. | LOW | Couples to item 6: pass `env: {..., GIT_KEY_PASSPHRASE: readSecret(...)}` to `execFileSync`. |
| 5a | **One containment helper for builder FS sinks** (`path.resolve` + `path.relative` does not start with `..`, the same shape as `secrets.js`) | Aikido flags `readFileSync`/`lstatSync` at `builder.js` ~428, 449, 682, 731 and 1197/1213-1229. Scanners recognise the resolve+relative guard. | MEDIUM | `BUILD_PATH` (`builder.js:633`) concatenates raw DB values `device.owner`/`device.udid`. Run them through `sanitka.owner`/`sanitka.udid`, as `cleanupDeviceRepositories` already does. |
| 5b | **No symlink following for files the build reads from or writes into the cloned repo** | The real exploit here is a **symlink**, not `..`. A repo whose `thinx.yml` is a symlink is read (`:731`) and then **written back** (`fs.writeFileSync(yml_path, ...)`, with decrypted Wi-Fi creds). `environment.json` and `header_file` are also written through repo-controlled paths. | MEDIUM | Check with `lstatSync().isSymbolicLink()` before read/write, or `realpathSync` containment. The platform descriptor is already allowlisted (`JSON2H.validatedPlatformDirectory`). |
| 6a | **`git.js` fetch runs git through `execFileSync("git", argv, {cwd, env})`, with no shell string** | Closes the `execSync(<string>)` sink (`git.js:71`, `:153`) that STATE.md deliberately left visible in scans. | MEDIUM | The pattern already exists in `builder.js`: `runGitCommand`, `prefetchPublic`, `writeBasenameMetadata` and `fs.emptyDirSync`. Replace the three shell-script builders: `builder.gitCloneAndPullCommand`, `sources.prefetchCommand` and `devices.gitPrefetchCommand` (their pure-function specs change too). |
| 6b | **SSH key auth without `ssh-agent sh -c`** | argv form cannot wrap a shell. | MEDIUM | Use `GIT_SSH_COMMAND` / `-c core.sshCommand="ssh -i <key> -o IdentitiesOnly=yes"` with `SSH_ASKPASS=<helper>`, `SSH_ASKPASS_REQUIRE=force` and `DISPLAY=:`. `ssh` itself consults askpass for an encrypted key; `ssh-add` is not needed. Keep trying keys one at a time. |
| 6c | **Keep the success semantics** | `checkResponse()`/`responseWhiteBlacklist()` plus the `basename.json` fallback decide success today, and callers depend on them. | LOW-MEDIUM | Prefer the exit code plus a `basename.json` check. Lock the behaviour with specs before switching. `git.prefetch()` has **no callers**, so delete it. |
| 7a | **CodeQL triggers on `main` (push + PR) plus a schedule; current action majors** | The workflow still targets the deleted `master`, so only the weekly cron fires. `codeql-action@v1` was retired in Jan 2023 and `checkout@v2` is several majors behind. | LOW | `github/codeql-action/{init,analyze}@v4` (v4 released 2025-10-07 on Node 24; v3 deprecated Dec 2026) and the current `actions/checkout` major (v5+; confirm the latest at plan time). Drop the `git checkout HEAD^2` step and `fetch-depth: 2`. Keep the least-privilege `permissions` block. Use language `javascript-typescript` with `build-mode: none`. |
| 8a | **Every `docker login` to `registry.thinx.cloud:5000` goes through `registry-login`** | Most sites already do (`be376db9`). The test job at `config.yml:767` does not, and it passes the password on argv. | LOW | Replace line 767 with `- registry-login: {registry: registry.thinx.cloud:5000}` or an equivalent `--password-stdin` retry loop. |
| 9a | **The Vue bundle's footer "THiNX Console" links point at the Vue host** | STATE 2026-09-21 finding: `VUE_APP_CONSOLE_HOSTNAME` was fed from the shared `WEB_HOSTNAME`. | LOW | CI wiring is already landed (`VUE_WEB_HOSTNAME`, in `required_vars`). What remains: confirm the CircleCI **project variable** exists (the preflight **fails every build** if it is missing), confirm the same wiring in `services/console/.circleci/config.yml`, and grep the deployed bundle for the footer host. |
| 10a | **Optional cursor paging on `GET /api/v2/logs/audit` and `GET /api/v2/logs/build`** | Vue should be able to browse beyond the first page. The legacy console must not notice. | MEDIUM-HIGH | See "Log paging — expected API shape" below. |
| 10b | **No-param response is byte-compatible with today's shape** | Constraint: legacy routes keep working with no signature breaks. | LOW | `{success:true, response:[...]}` via `Util.responder`, same item shapes (`{date,message,flags}` for audit; the build item shape consumed by `normalizeBuildItems`). v1 routes (`/api/user/logs/*`) never page. |
| 10c | **Owner-scoped views, installed reliably** | Paging a view keyed `[date, owner]` by owner is impossible. The design-doc install bug (headline 3) blocks any view change. | MEDIUM | New views keyed `[owner, date]` (audit) and `[owner, start_time]` (builds). Emit **small values**, not `doc`. Put them in a **new design doc** (e.g. `_design/logs_v2`, `_design/builds_v2`): changing an existing ddoc invalidates and rebuilds every view in it, and legacy queries would block during the rebuild. Add a rev-aware "ensure design doc" routine at boot. |
| 11a | **Finite retention on the data `stats` actually holds** | `stats.autogen` is infinite, and every write/query in `influx.js` names `"stats"."autogen"` explicitly, so the declared `31d` RP holds nothing. | LOW | `ALTER RETENTION POLICY "autogen" ON "stats" DURATION <N>d` (InfluxDB 1.8). The longest in-code query is `week()` (7d), so 31d-90d is safe. Make it **code-owned in `provisionDB()`**, which already does ALTER-if-exists, so it survives volume recreation. Take an `influxd backup` first; retention enforcement (every 30 min) deletes whole shard groups older than the duration, irreversibly. |
| 12a | **Swarmpit stats off; `swarmpit_influxdb` removed; registry → autoredeploy still inside the 5-min SLA** | The user's framing: autoredeploy is the only part that matters. | LOW-MEDIUM | Unset `SWARMPIT_INFLUXDB` on `swarmpit_app` and remove the service. **First check which InfluxDB the variable points at.** A `swarmpit` database also exists *inside* `thinx_influxdb` (RP `an_hour`); do not confuse the two. `swarmpit_db` stays on couchdb:2.3.0 (decision). Verify with a real push → redeploy, per the `.planning/runbooks/swarm.md` OPS-01 method (63s baseline). |

### Differentiators (worth doing if cheap)

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| 1h | Extend `verifyCsrfToken` to cookie-session **mutation** routes (`DELETE /api/v2/user`, `POST /api/user/delete`, `POST /api/gdpr/revoke`, `POST /api/v2/profile`) | WR-06's second half. SameSite=Lax does not stop a same-site (sibling subdomain) attacker. | MEDIUM | Enforce **only when the request authenticated by cookie**. Skip when a valid Bearer token was used (Vue uses Bearer via `session_token.js`; Bearer requests are not CSRF-able). Needs a request flag set in `router.js` when Bearer auth succeeds. Either flag it for REQUIREMENTS as in-scope or record it as accepted risk in the runbook. |
| 1i | `CSRF_MODE=legacy\|signed` switch | Gives a sub-5-min rollback to the v1.13 scheme without a redeploy, separate from `CSRF_ENFORCE`. | LOW | Lets you deploy signed tokens fail-open first, as 21-04 → 21-05 did. |
| 1j | Rename cookie `XSRF-TOKEN` → `thx-xsrf` | Avoids collisions with Laravel, Spring and AngularJS cookies of the same name on `.thinx.cloud`. | MEDIUM | Needs coordinated console changes (both consoles read the name). The HMAC check already rejects foreign values, but a foreign cookie with a longer `Path` can still shadow ours. Defer unless it's cheap. |
| 3c | CI drift check: diff the gluster snapshot against both image `default.conf` CSP lines | Stops the three-way divergence from coming back. | LOW | Parse `add_header Content-Security-Policy`; compare directive sets. |
| 4c | Boot log of the secret *source* per name (`file`/`env`/`default`), never the value | Makes operators confident the sweep took effect. | LOW | Extend `secrets.js`. |
| 5c | Clone with `git -c core.symlinks=false` | Removes the symlink class at the source: symlinks arrive as plain files. | LOW | Some firmware repos might rely on symlinks, so check the platform samples. Pairs with 6a (argv makes adding `-c` trivial). |
| 5d | Fix adjacent `header_file = XBUILD_PATH / HEADER_FILE_NAME` (`builder.js:~885`) | Division yields `NaN`, so the fallback header path is always wrong. | LOW | Found while reading, one-line fix. Probably dead because the condition `(a != x) \|\| (a != y)` is always true. Note it and don't expand scope. |
| 7b | Add `actions` to the CodeQL languages (workflow scanning) | Catches injection in `.github/workflows`. | LOW | Small cost. |
| 8b | Retry the `docker.io` (`:235`, `:309`) and `dhi.io` (`:771`) logins too, and fail fast on `unauthorized` | A credential error fails in seconds instead of burning 5 attempts (≈100s). | LOW | Match `unauthorized\|incorrect username` in the output → exit 1 immediately. Retry only timeouts and 5xx. |
| 10d | Paged build-list read with **no prune side-effect** | Reads should not mutate. The prune-on-read in `list()` runs on every console visit. | LOW (paged path only) | Keep prune in the legacy path to preserve behaviour. The retention job (memory: `couchdb-log-retention-job`) is the proper place for it. |
| 10e | Include `flags` in the new audit view value | Today every audit entry comes back as `["info"]` because the view drops `flags`. | LOW | Free with the new view. |
| 11b | Downsampling continuous query (e.g. 1h counts kept longer) | Keeps long-term trend data if it is ever needed. | MEDIUM | Nothing reads beyond 7d today, so defer. |
| 12b | Remove the `swarmpit_agent` global service | Frees memory/CPU on the 2-vCPU `micro`. | LOW to do, MEDIUM risk | Autoredeploy does not need it (verified in source). Losses: live event push to the UI, container stats, and agent-based logs (these fall back to the service-logs API). Do it as a **separate step after 12a**, each with its own push → redeploy verification. |

### Anti-Features (don't build these, or don't do the item this way)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Binding the CSRF token to `req.sessionID` **without** a pre-session | "HMAC(secret, random‖session_id)" reads literally | With `saveUninitialized:false`, the anonymous `sessionID` changes on every request. Every login/reset POST would fail, or you'd end up binding to a constant and gain nothing. | Pre-session created by the priming GET (1b), regenerated on login (1c). |
| `saveUninitialized: true` to get a stable anonymous sid | The quickest way to a stable id | A Redis session for every anonymous hit: device-API traffic, crawlers, health checks. | Create the session only in the priming endpoint. |
| Timestamp/expiry inside the CSRF token | "Tokens should expire" | OWASP: a CSRF token is not an access token, so tie its lifetime to the session. Expiry adds spurious 403s on long-open consoles. | Rotate on login and logout only. |
| A machine-client exemption for `POST /api/v2/user` (e.g. no Origin header ⇒ skip) | Keeps existing integrations working | Explicitly rejected by the 2026-09-25 decision. Absent-Origin heuristics are also bypassable. | Document the priming contract (2b). |
| Adopting the `csrf-csrf` npm library | It implements signed double-submit | Swaps a working middleware (fail-open flag, reason codes, duplicate-cookie diagnostics, console retry contract) for a new API surface in a CommonJS monolith, for about 40 lines of saved code. | Extend `lib/middleware/csrf.js` in place, using `csrf-csrf` only as a reference. |
| Removing the gluster bind mount this milestone | "Single source of truth should be the image" | Decision 2026-09-25 made gluster canonical. Removing the mount before the image configs match locks out cold sessions or breaks Rollbar. | Mirror gluster → images (3a), and leave retirement to a later milestone. |
| Per-console CSP split | The consoles have different needs | One mounted file serves both, so a split multiplies the drift surface. | Keep one shared policy. |
| `skip`/`offset` paging or page numbers | Familiar UI ("page 3 of 12") | CouchDB `skip` walks the B-tree, so cost grows with the offset and pages shift when new logs arrive. An owner-scoped total count needs a reduce view or a full scan. | Opaque forward cursor (`startkey`+`startkey_docid`, `limit+1`). Show "Load more" / "Older", not page numbers. |
| Returning `total_rows` as "total" | Easy to add | In CouchDB it is the size of the **whole view** (all tenants), which leaks global volume and is wrong for the owner. | Return `has_more` only. |
| Mango `_find` + `bookmark` for paging | "Bookmark" appears in the backlog note | Needs a JSON index and changes the query engine for a view-based module. The existing code is all views. | View + `startkey` cursor. Name the parameter `cursor` so the mechanism can change later. |
| Silently "fixing" the legacy audit no-param path to owner-scoped newest-200 | It's clearly a bug | The constraint says legacy stays unchanged, and a quiet semantic change breaks the "no signature breaks" audit trail. | Make it an explicit decision in REQUIREMENTS. Recommended: *do* switch the no-param path to the new owner view (same shape, strictly more correct), recorded as a deliberate compatible fix. Leave it only if the operator objects. |
| Making `31d` the DEFAULT retention policy on `stats` | It exists and has the right duration | All queries hardcode `"stats"."autogen"`. Flipping the default strands existing data and sends new writes where the queries don't look, so stats go empty. | Shorten `autogen` itself (11a). Delete or neutralise `31d` later. |
| Replacing Swarmpit with shepherd or a registry-webhook updater this milestone | Lighter footprint | The pipeline SLA depends on it, and it's a new moving part. The target is a trim. | Trim only (12a/12b). Record a replacement as a v1.x candidate. |
| Suppression comments (`// lgtm`, Aikido ignore) instead of fixes | Quiet scanner output | STATE.md: Aikido ignores don't work on this plan anyway, and the sinks are real (the symlink write-back). | Fix with containment + symlink refusal, then add true false positives to `scripts/aikido-known-false-positives.json`. |
| More shell-escaping in `git.js` instead of argv | Smaller diff | Keeps the sink the scanners flag and the quoting bug class `git.js:92-104` already documents. | argv (6a/6b). |
| Switching to `isomorphic-git`/`nodegit` | "No shell at all" | Big dependency, weaker SSH/submodule support, and it changes build behaviour. | `execFileSync("git", ...)`. |

---

## Expected behaviour details

### WR-06: session-bound CSRF, target flow

```
GET  /api/v2/csrf-token          (anonymous)
  -> req.session.csrf_seed = r         // creates the pre-session; express-session sets x-thx-core
  -> token = hex(HMAC(k, sidLen!sid!rLen!r)) + "." + hex(r)
  -> Set-Cookie: XSRF-TOKEN=<token>; Domain=.thinx.cloud; Path=/; Secure; SameSite=Lax   (not httpOnly)
  -> 200 {success:true, csrf_token:<token>}
     (if an existing XSRF-TOKEN cookie still validates for this sid, echo it; otherwise re-mint)

POST /api/v2/login  X-XSRF-TOKEN: <token>
  -> verify: header==cookie (timingSafeEqual) AND format /^[0-9a-f]{64}\.[0-9a-f]{48}$/ AND HMAC(k, sid, r) matches
  -> credentials OK -> req.session.regenerate() -> owner set -> markLogin -> new token minted for new sid
  -> Set-Cookie: x-thx-core=<new sid>, XSRF-TOKEN=<new token>

GET  /api/v2/logout -> session.destroy -> clear XSRF-TOKEN (same Domain/Path)
```

- **Console impact (services/console):** probably none. Both consoles read `XSRF-TOKEN` from `document.cookie` on each call and already retry once after `csrf_token_invalid` by forcing a re-prime. Tokens in every open browser become invalid at deploy, and each user gets one transparent retry. This needs a cold-browser check on both consoles (the same UAT as v1.13 21-05).
- **Residual risk to record in the runbook:** `x-thx-core` is itself `.thinx.cloud`-scoped. A sibling subdomain could plant an attacker's *own* pre-session plus a matching token, which is login CSRF into the attacker's account. Regenerating on login keeps this from becoming fixation. Fully closing it needs `__Host-` cookies on the API host, which is out of scope because the consoles on other hosts must read the token.

### Log paging: expected API shape

| Aspect | Recommendation |
|--------|----------------|
| Opt-in | Paged mode only when `limit` or `cursor` is present on the **v2** routes. v1 routes and param-less v2 behave as today (see anti-feature on the audit fix decision). |
| Request | `GET /api/v2/logs/audit?limit=50&cursor=<opaque>` / `GET /api/v2/logs/build?limit=25&cursor=<opaque>` |
| `limit` | Integer, default 50, clamped to 1..200. Non-numeric → 400 `invalid_limit`. |
| `cursor` | Opaque base64url of `{k:<last key date/start_time>, id:<last docid>}`. The server rebuilds `startkey=[owner,k]`, `startkey_docid=id`, `skip=1`. Undecodable → 400 `invalid_cursor`. The cursor **never** carries the owner: the owner always comes from the session, so a cursor can't be used for BOLA. |
| Query | `descending=true`, `startkey=[owner,{}]` (first page) / `[owner,k]`, `endkey=[owner]`, `limit=limit+1`. The extra row sets `has_more`. |
| Response | `{success:true, response:[...items same shape as legacy...], paging:{limit, has_more, next_cursor}}`, where `next_cursor` is `null` on the last page. Sent via `Util.respond` (`Util.responder` only emits `{success,response}`). The legacy shape is kept exactly, so an old client that ignores `paging` still works. |
| Ordering | Newest first. Stable under concurrent inserts, because new entries land before the cursor. |
| Not provided | Total count, page numbers, backwards cursor. "Load older" is enough for audit/build history. |
| Vue side | The `store/auditlog.js` and `store/buildlog.js` actions become `fetchPage({cursor})` and append. Tables show "Load more". This is console submodule work, so coordinate the pointer bump. |

### InfluxDB retention: expected behaviour

- `SHOW RETENTION POLICIES ON stats` → `autogen` has a finite duration (recommended 90d, matching `db0`; shard duration left as is or set to 1d) and remains `default=true`.
- Idempotent on every API boot through `provisionDB()`, which already ALTERs when the RP exists.
- After the first enforcement cycle (≤30 min), the oldest shard groups are gone, while `/api/v2/stats/week` and `/today` return the same counts as before.

### Swarmpit trim: expected behaviour

- `docker service ls` → `swarmpit_app`, `swarmpit_db` (and, until 12b, `swarmpit_agent`); no `swarmpit_influxdb`.
- A push to `thinx-staging` → CircleCI → registry → `thinx_api` task replaced within 5 min. This is the only acceptance test that matters.
- The Swarmpit UI may show "statistics disabled", which is acceptable per the user.

---

## Feature Dependencies

```
SEC-CFG-02 readSecret sweep (4)
    └──provides CSRF_SECRET pattern──> WR-06 signed token (1f)
    └──provides GIT_KEY_PASSPHRASE via readSecret──> git.js argv (4b ↔ 6)

WR-06 session-bound CSRF (1a-1g)
    └──required before──> WR-04 v2/user CSRF (2) [so machine-client priming is documented once, against the final scheme]
    └──required before──> Console CSP spot-check of classic register/forgot/reset (3b)
    └──enhanced by──> mutation-route CSRF (1h, differentiator)

Design-doc upsert fix (10c)
    └──required before──> Log paging API (10a) ──required before──> Vue paging UI (console submodule)

git.js argv (6) ──touches same fetch path as──> builder.js path traversal (5)
    [sequence them in one phase or back-to-back; core.symlinks=false (5c) is trivial once argv lands]

CodeQL modernization (7) ──enables──> scan evidence for 5 and 6 on main PRs

Swarmpit trim (12) ──conflicts with running at the same time as──> any deploy-dependent phase
    [autoredeploy is the deploy path; trim in a quiet window, not mid-phase for other items]

InfluxDB retention (11)   : independent
Registry login retry (8)  : independent (ci-only)
Vue hostname var (9)      : independent; verify CircleCI project var exists or every build fails preflight
```

### Dependency Notes

- **WR-04 comes after WR-06:** WR-04 forces non-browser clients to prime. If WR-04 ships on the v1.13 scheme and WR-06 then adds a pre-session cookie, the OpenAPI contract and the spec helper change twice.
- **3b comes after WR-06:** the spot-check exists to confirm that the classic flows prime and recover under enforcement. Running it before WR-06 validates a flow that is about to change.
- **Paging depends on design-doc installation:** without a reliable install path, the new views never exist in production and every paged call fails with `not_found`. Test this against a CouchDB where the design doc already exists, not a fresh one.
- **5 and 6 conflict if run in parallel:** both edit `builder.js` around `prefetchPublic`/`gitCloneAndPullCommand`/`prefetchPrivate`. Same lesson as Phase 7: sequential commits on one branch.
- **12 must not overlap other deploys:** if Swarmpit is trimmed and autoredeploy breaks, the fallback is manual `restart.sh`/`service update`. Don't combine that with a CSRF deploy that also needs a quick rollback.

---

## MVP Definition

### Launch With (v1.14 must-haves)

- [ ] WR-06 1a-1g: signed token, pre-session, regenerate on all 5 login paths, re-minting priming endpoint, logout clear, `CSRF_SECRET`, mode log. This closes the one open architectural security finding from v1.13.
- [ ] WR-04 2a-2b: small change, but it closes a documented bypass.
- [ ] builder.js 5a-5b and git.js 6a-6c: real sinks (symlink write-back; shell string).
- [ ] SEC-CFG-02 4a-4b: finishes a started pattern.
- [ ] Console CSP 3a-3b: removes a documented latent lockout risk.
- [ ] CodeQL 7a, registry login 8a, Vue hostname 9a: each is a small finish-and-verify.
- [ ] Log paging 10a-10c (API side plus Vue store/UI): long-standing user request.
- [ ] InfluxDB 11a and Swarmpit 12a: ops backlog; both low risk once the gotchas are handled.

### Add After Validation (inside v1.14 if time allows)

- [ ] 1h mutation-route CSRF, if REQUIREMENTS doesn't pull it in explicitly
- [ ] 1i `CSRF_MODE` switch
- [ ] 5c `core.symlinks=false`, 10d/10e paging extras, 8b fail-fast login, 3c CSP drift check
- [ ] 12b drop `swarmpit_agent`, after 12a has proven autoredeploy is unaffected

### Future Consideration (v1.x+)

- [ ] 1j cookie rename and `__Host-` session cookies: needs a console architecture change
- [ ] Swarmpit replacement (shepherd/webhook) and retiring the gluster bind mount
- [ ] 11b InfluxDB downsampling

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| WR-06 session-bound CSRF + rotate on login | HIGH | MEDIUM-HIGH | P1 |
| WR-04 v2/user CSRF | MEDIUM | LOW | P1 |
| builder.js path traversal / symlink | HIGH | MEDIUM | P1 |
| git.js argv | MEDIUM | MEDIUM | P1 |
| SEC-CFG-02 readSecret sweep | MEDIUM | LOW-MEDIUM | P1 |
| Console CSP mirror + spot-check | MEDIUM | LOW | P1 |
| Log paging (API + Vue) | HIGH (user-requested) | MEDIUM-HIGH | P1 |
| CodeQL modernization | MEDIUM | LOW | P2 |
| Registry login retry (remaining site) | LOW-MEDIUM | LOW | P2 |
| Vue hostname var (verify) | LOW | LOW | P2 |
| InfluxDB `stats` retention | LOW-MEDIUM | LOW | P2 |
| Swarmpit trim (influx) | LOW-MEDIUM | LOW-MEDIUM | P2 |
| Mutation-route CSRF (1h) | MEDIUM | MEDIUM | P2 (decide in REQUIREMENTS) |
| Swarmpit agent removal (12b) | LOW | LOW (risk MEDIUM) | P3 |

**Priority key:** P1 must ship in v1.14 · P2 should ship · P3 optional

---

## Reference Implementation Analysis

| Feature | Reference A | Reference B | Our Approach |
|---------|-------------|-------------|--------------|
| Signed double-submit | OWASP cheat sheet: `hmac.random` token, session-bound, pre-session for login, regenerate on auth | `csrf-csrf` (npm): HMAC over a `getSessionIdentifier(req)` callback | Extend `lib/middleware/csrf.js` in place, using OWASP's message format and the existing fail-open/enforce flag |
| View paging | CouchDB pagination recipe: `limit+1`, next `startkey` + `startkey_docid`, never deep `skip` | Cloudant/Mango `bookmark` (opaque string) | View-based `startkey` behind an opaque `cursor`, so the API looks like bookmark paging and the mechanism stays swappable |
| Swarm auto-redeploy | Swarmpit app 1-minute digest poll (in-app, no agent or InfluxDB) | shepherd / registry-webhook updaters | Keep Swarmpit, drop stats (and optionally the agent) |
| InfluxDB 1.x retention | `ALTER RETENTION POLICY ... DURATION` on the default RP | New default RP + CQ downsampling | Shorten `autogen`, owned by the `provisionDB()` code |

## Sources

**Codebase (primary, HIGH):**
- `lib/middleware/csrf.js`, `lib/router.auth.js` (login sites, priming routes), `lib/router.user.js:147` (WR-04), `lib/router.js:94` (Bearer), `lib/thinx/session_token.js`, `thinx-core.js:~320-353` (session config `saveUninitialized:false`)
- `lib/thinx/audit.js`, `lib/thinx/buildlog.js`, `lib/router.logs.js`, `design/design_logs.json`, `design/design_builds.json`, `lib/thinx/database.js:70-185` (design-doc install path)
- `lib/thinx/influx.js`, `lib/thinx/statistics.js`
- `lib/thinx/git.js`, `lib/thinx/builder.js` (~405-500, 625-900), `lib/thinx/sources.js:259-320`, `lib/thinx/devices.js:42-100`
- `lib/thinx/secrets.js`, env-var inventory via `grep process.env` over `lib/` + `thinx-core.js`
- `.github/workflows/codeql-analysis.yml`, `.circleci/config.yml` (lines 9-46, 167-196, 235, 309, 767-771)
- `services/console/vue/src/{utils/cookies.js,core/api.js,store/auditlog.js,store/buildlog.js}`, `services/console/src/assets/thinx/csrf.js`
- `.planning/milestones/v1.13-phases/21-*/21-REVIEW.md` + `21-REVIEW-FIX.md` (WR-04, WR-06, IN-02), `.planning/STATE.md`, `.planning/runbooks/console-csp-source-of-truth.md`
- Memory notes: `backlog-log-paging`, `backlog-influxdb-retention`, `backlog-swarmpit-minimize`

**External (seam tier LOW for websearch/webfetch; the first two were fetched from primary sources and cross-checked against the code above):**
- [OWASP CSRF Prevention Cheat Sheet: Signed Double-Submit Cookie](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Swarmpit `src/clj/swarmpit/agent.clj` (autoredeploy job)](https://raw.githubusercontent.com/swarmpit/swarmpit/master/src/clj/swarmpit/agent.clj) · [Swarmpit configuration.md](https://github.com/swarmpit/swarmpit/blob/master/doc/configuration.md) · [Swarmpit issue #392: disable influx](https://github.com/swarmpit/swarmpit/issues/392)
- [CouchDB Pagination Recipe (3.x docs)](https://docs.couchdb.org/en/stable/ddocs/views/pagination.html)
- [GitHub Changelog: upcoming deprecation of CodeQL Action v3](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/) · [codeql-action issue #3271](https://github.com/github/codeql-action/issues/3271) · [actions/checkout releases](https://github.com/actions/checkout/releases)
- InfluxDB 1.8 retention-policy semantics (ALTER RP, shard-group deletion, 30-min check interval): from training knowledge plus the existing `backlog-influxdb-retention` memory note. MEDIUM; confirm against the 1.8 docs at plan time.

---
*Feature research for: THiNX Device API v1.14 Backlog & Hardening Sweep*
*Researched: 2026-09-25*
