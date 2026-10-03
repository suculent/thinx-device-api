# CSP / CSRF Hardening Runbook (SEC-CSP-01, SEC-CSRF-01)

> `micro` and `core` are the SSH aliases in the operator's `~/.aliases`. Host, port, user and key
> live there, not in this public repository. Both nodes are swarm managers, so any `docker service …`
> command below works from either one. `docker exec` / `docker ps` are node-local.

This runbook covers the last step of Phase 21: flipping the anti-CSRF double-submit check on
`thinx_api` from fail-open to hard-reject, then confirming with a HawkScan rescan that both deferred
findings are closed. It also records how to roll back either half: the CSRF enforce flag, and the
console CSP that lives in the gluster-mounted nginx config.

**Status: executed 2026-09-25 09:02Z. Enforcement is ON** (Option A, `CSRF_ENFORCE=true` on
`thinx_api`, persisted in the swarm repo's `thinx.yml`, commit `bc6d04a`). A missing or mismatched
token now gets `403 csrf_token_invalid`; it is no longer only logged. The pre-flip gate was
**not fully satisfied**: the operator flipped early, and the 08:35:09Z `session/token` warning is
still unexplained (most likely cause: 21-REVIEW CR-01, concurrent cold primes in the Vue console).
See the Execution Annex for the record, and **Rollback** to turn enforcement off.

---

## Live state before the flip (verified read-only 2026-09-25 ~08:40Z)

> Pre-flip snapshot, kept for the record. Since 09:02Z `CSRF_ENFORCE=true` is set on `thinx_api`
> and in `thinx.yml` (`bc6d04a`), and the image is `api:swarm@sha256:3852e8d2…` (Execution Annex).
> Re-verify placement and image before acting on any row.

| Item | Live value |
|---|---|
| `app.thinx.cloud` | `thinx_api`, 1 replica, currently on node `micro`, image `registry.thinx.cloud:5000/thinx/api:swarm@sha256:4230d64f…` |
| `rtm.thinx.cloud` | `thinx_console` (`:swarm`), currently on `core`; proxies `/api/*`, `/login` and `/logout` to `api:7442` |
| `console.thinx.cloud` | `thinx_vue` (`:vue`), currently on `micro`; calls `https://app.thinx.cloud` cross-origin |
| `thinx_api` update policy | `Order: stop-first`, `Parallelism: 1`, `FailureAction: pause`, `Monitor: 5s`, and the same for rollback. **Any flip or rollback briefly takes the API down**, from when the old task stops until the new one is ready. |
| `thinx_api` config mount | `/mnt/gluster/thinx/conf` (host) → `/mnt/data/conf` (container). The app logs `Configuration loaded from: /mnt/data/conf/config.json`. Host and container md5 match. |
| `config.json` | `/mnt/gluster/thinx/conf/config.json`, 1253 bytes, mode 0666, mtime 2023-11-08, **not under git**. `debug` = `{"device": false, "deployment": true}`, with **no `csrf_enforce` key**. |
| `config.override.json` | absent. If it ever exists it **replaces** `config.json` entirely (`lib/thinx/globals.js` `load()`). |
| `CSRF_ENFORCE` env | **not set** on `thinx_api` (`docker service inspect`) and not in `thinx.yml`. *(Pre-flip. Now `true` in both since 2026-09-25 09:02Z.)* |
| Stack file | `/mnt/gluster/deployment/swarm/thinx.yml`, service `api`, `environment:` list. The swarm repo has **uncommitted** edits to `thinx.yml`, `console/default.conf`, `traefik.yml` and `swarmpit.yml`. |
| Console CSP source of truth | `/mnt/gluster/deployment/swarm/console/default.conf`, bind-mounted read-only into **both** `thinx_console` and `thinx_vue` (md5 `f4e9fde7…`, mtime 2026-09-24T15:07:50Z). It includes `https://cdn.rollbar.com` in `script-src` and `default-src`, and its backup is `default.conf.bak-20260924`. Repo copy: `swarm-configs/console-default.conf.prod`. Both hosts' live CSP header matches it byte for byte. See `console-csp-source-of-truth.md`. |
| nginx snapshots | `swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx` were refreshed 2026-09-25 from `nginx -T` in the live `thinx_vue` container. Their body equals the gluster file. |

## How enforcement works

`lib/middleware/csrf.js` `isEnforced()`:

```js
if (process.env.CSRF_ENFORCE === 'true') return true;
if (app_config.debug && app_config.debug.csrf_enforce === true) return true;
return false; // fail-open default
```

- Either switch turns enforcement **on**. Neither can turn it **off** while the other is `true`.
  Rolling back therefore means clearing *the switch you set*, and checking that the other one is not
  `true` too.
- `config.json` is `require()`d once at startup, so both switches need a task restart to take effect.
  Editing the file alone does nothing until `thinx_api` restarts.
- Fail-open logs `⚠️ [warning] CSRF token missing/mismatched reason=<code> xsrf_cookies=<n> for <METHOD> <route> (fail-open, not enforced)`.
  Enforced mode returns `403 {"success":false,"response":"csrf_token_invalid"}` and logs one line per
  rejection: `⚠️ [warning] CSRF token rejected reason=<code> xsrf_cookies=<n> for <METHOD> <route> (enforced, 403)`.
  `<code>` is `no_cookie`, `no_header`, `length_mismatch` or `value_mismatch`; `xsrf_cookies` counts
  the `XSRF-TOKEN` pairs in the raw `Cookie` header and adds `duplicate_cookie=true` when it is above 1
  (cookie-parser keeps the first). The route has its query string stripped; token values are never logged.
  Lines logged before 2026-09-25 (21-REVIEW WR-01) have no reason code.
- Protected routes (8): `POST /api/login`, `/api/v2/login`, `/api/v2/session/token`,
  `/api/v2/password/reset`, `/api/v2/password/set`, `/api/user/create`,
  `/api/user/password/set`, `/api/user/password/reset`. `POST /api/v2/user` (account create, v2) is
  **not** protected; see 21-REVIEW-FIX WR-04 for why.
- **`/api/v2/session/token` is the risky one.** The Vue console calls it on page reload to restore a
  session. If a browser's `XSRF-TOKEN` cookie and header disagree there, enforce mode costs that user
  a forced logout on reload. That is exactly the unexplained warning the pre-flip gate is about.

## Which switch to use

**Recommended: Option A, the `CSRF_ENFORCE=true` service env var.**

| | A: `CSRF_ENFORCE` env | B: `debug.csrf_enforce` in `config.json` |
|---|---|---|
| Visibility | `docker service inspect` shows it | Invisible outside the file; the file is not in git |
| Change mechanics | One `docker service update --env-add`, which restarts the task | Hand-edit JSON, then `--force` restart |
| Blast radius of a typo | Rejected by the CLI; the service keeps running | A JSON syntax error means `thinx_api` does not start, which takes down **all** of the API, not just login |
| Rollback | One `--env-rm` | Edit the file back, then `--force` restart |
| Survives `restart.sh` / `docker stack deploy` | **Only if** it is also added to `thinx.yml`. Otherwise a stack redeploy silently drops it and the service returns to fail-open. | Yes, because it lives outside the spec |
| Audit trail | The `thinx.yml` line in the swarm repo, plus the swarm spec history | None besides a `.bak` copy |

A's failure mode (a stack redeploy quietly dropping the flag) degrades to fail-open, which is a
security regression but not an outage. B's failure mode (bad JSON) is an outage. A also gives a
one-command rollback. B is still documented below because the plan allows either.

---

## Pre-flip gate — do not flip until all three are true

Carried over from 21-04-SUMMARY, "Open item carried into 21-05".

1. **Cold incognito login on both consoles, with network capture on from the first request.** Use a fresh
   incognito window, or clear all `.thinx.cloud` cookies, and log in through
   `https://rtm.thinx.cloud/` and `https://console.thinx.cloud/#/login`. In the capture, check:
   - the priming `GET /api/csrf-token` (classic, via rtm's `/api` proxy) or `GET /api/v2/csrf-token`
     (Vue, direct to `app.thinx.cloud`) returns `Set-Cookie: XSRF-TOKEN=…; Domain=.thinx.cloud`
     *before* the first POST;
   - every protected POST (`/login`, `/api/v2/login`, and `/api/v2/session/token` after a reload)
     carries a non-empty `X-XSRF-TOKEN` equal to the cookie value;
   - `thinx_api` logs **no** new warning for those requests (use the grep in step 2 with
     `--since` set to the test start).
2. **About one day of `thinx_api` logs with no new fail-open warnings on `POST /api/v2/session/token`**,
   and none on the other protected routes that you cannot attribute to your own header-less probes.
   Run from the workstation:

   ```bash
   MICRO_SSH="$(sed -nE 's/^alias micro="ssh (.*)"$/\1/p' ~/.aliases | sed "s|~|$HOME|")"
   SINCE=2026-09-25T08:36:00Z   # just after the last unexplained warning; move it forward after each fix
   timeout 90 ssh -o ConnectTimeout=15 -o ServerAliveInterval=10 $MICRO_SSH \
     "timeout 60 docker service logs thinx_api --timestamps --since $SINCE --no-trunc 2>/dev/null | grep 'CSRF token missing'"
   ```

   Per-route summary of the same window:

   ```bash
   timeout 90 ssh -o ConnectTimeout=15 -o ServerAliveInterval=10 $MICRO_SSH \
     "timeout 60 docker service logs thinx_api --timestamps --since $SINCE --no-trunc 2>/dev/null \
        | grep 'CSRF token missing' | awk '{print \$(NF-4), \$(NF-3)}' | sort | uniq -c"
   ```

   Never use `--follow`, which hangs the session. `docker service logs` only returns logs from
   tasks whose containers still exist, so a reschedule drops older lines. That is how the
   `pgh54h` task's 9 + 4 warnings were lost. Record counts as you go instead of relying on one later
   query.
3. **Flip only when 1 and 2 are clear, or once the cause of the remaining warnings is identified**
   and accepted. For example, if they are confirmed to be stale cookies from an older build, the
   accepted cost is a one-time forced logout on reload for affected users.

### Gate status

| Date (UTC) | Observation |
|---|---|
| 2026-09-24T16:00:22Z | 1× `POST /api/login` warning. This is probably the 21-04 step-4 header-less login probe; not confirmed. |
| 2026-09-25T08:35:09Z | 1× `POST /api/v2/session/token` warning on the user's reload and login. **Unexplained.** An identical reload at 08:37:36Z logged none. |
| 2026-09-25 ~08:41Z | Query of the current task's logs (task started ~17h earlier) shows only the two lines above. |

**Gate: not satisfied at flip time; flipped early by operator decision** (2026-09-25 09:02Z, after
about 25 minutes of clean logs instead of the planned day). The plan had called for about one day of
log watch with no new `session/token` warnings (earliest ~2026-09-26T08:36Z), plus the cold incognito
login test on both consoles. Since the flip, a mismatch is a 403, not a warning; enforce-mode
rejections are logged as `CSRF token rejected reason=…` once the 21-REVIEW WR-01 change is deployed.

---

## Pre-flip checklist (on the day)

Run from an interactive `micro` session. Every docker command is wrapped in `timeout`.

```bash
# 1. Topology still as expected (placement floats between micro and core; that is not drift)
for s in thinx_api thinx_console thinx_vue; do
  printf "%-14s " $s; timeout 20 docker service ps $s --filter desired-state=running --format '{{.Node}} {{.CurrentState}}' | head -1
done

# 2. Neither switch is already on, and there is no override file
timeout 20 docker service inspect thinx_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep CSRF || echo "no CSRF env"
jq '.debug.csrf_enforce' /mnt/gluster/thinx/conf/config.json      # expect: null (or false)
ls /mnt/gluster/thinx/conf/config.override.json 2>/dev/null || echo "no override"

# 3. Record the current image, so you can prove after the flip that only the flag changed
timeout 20 docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

From the workstation, record the fail-open baseline. It should return `invalid_credentials`:

```bash
curl -sS -m 20 -X POST https://app.thinx.cloud/api/login \
  -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'; echo
```

Read the Rollback section before continuing.

---

## Flip — Option A (recommended): `CSRF_ENFORCE=true` env

Run on `micro`, interactively:

```bash
# Flip. --no-resolve-image keeps the pinned image digest, so the only change is the env var.
# stop-first with 1 replica means a short API outage while the task restarts.
timeout 300 docker service update --env-add CSRF_ENFORCE=true --no-resolve-image thinx_api

# Converged? Expect a new task Running and the old one Shutdown
timeout 20 docker service ps thinx_api --format '{{.Name}}.{{.ID}} {{.Node}} {{.DesiredState}} {{.CurrentState}} {{.Error}}' | head -3
timeout 20 docker service inspect thinx_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep CSRF
timeout 20 docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'   # same as the pre-flip record
timeout 60 docker service logs thinx_api --since 3m --no-trunc 2>/dev/null | grep -iE "error|CRITICAL|Configuration loaded" | tail -20
```

Then **persist it**, or the next `restart.sh` / `docker stack deploy` will silently drop it. In
`/mnt/gluster/deployment/swarm/thinx.yml`, add `- "CSRF_ENFORCE=true"` to the `api` service's
`environment:` list. The swarm repo already has unrelated uncommitted edits to `thinx.yml`, so commit
only this hunk (`git add -p thinx.yml`), or record the change in the Execution Annex if you decide not
to commit.

## Flip — Option B: `debug.csrf_enforce` in `config.json`

Run on `micro`, interactively. The file is shared over gluster, so it is the same on both nodes.

```bash
cd /mnt/gluster/thinx/conf
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -p config.json config.json.bak-$TS                               # restore source for the rollback
jq '.debug.csrf_enforce = true' config.json > /tmp/config.json.new  # jq refuses to emit invalid JSON
jq -e '.debug.csrf_enforce == true and .redis != null' /tmp/config.json.new >/dev/null \
  && cat /tmp/config.json.new > config.json                         # in-place write keeps inode and 0666 mode
rm -f /tmp/config.json.new
jq -c '.debug' config.json                                          # expect {"device":false,"deployment":true,"csrf_enforce":true}

# The config is only read at startup, so force a restart without re-resolving the image
timeout 300 docker service update --force --no-resolve-image thinx_api
timeout 20 docker service ps thinx_api --format '{{.Name}}.{{.ID}} {{.Node}} {{.DesiredState}} {{.CurrentState}} {{.Error}}' | head -3
timeout 60 docker service logs thinx_api --since 3m --no-trunc 2>/dev/null | grep -iE "error|CRITICAL|Configuration loaded" | tail -20
```

If `CRITICAL CONFIGURATION ERROR` appears, or the task will not reach Running, restore
`config.json.bak-$TS` immediately (see Rollback B).

---

## Post-flip verification

From the workstation:

```bash
# 1. Header-less, cookie-less login is now rejected by the API (proxied through rtm), where it used to return invalid_credentials
curl -sS -m 20 -o - -w '\nHTTP %{http_code}\n' -X POST https://rtm.thinx.cloud/api/login \
  -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'
# expect: {"success":false,"response":"csrf_token_invalid"}  HTTP 403

# 2. A primed, well-formed request still reaches credential checking (double-submit works)
J=$(mktemp); curl -sS -m 20 -c $J https://app.thinx.cloud/api/v2/csrf-token >/dev/null
T=$(awk '$6=="XSRF-TOKEN"{print $7}' $J)
curl -sS -m 20 -b $J -X POST https://app.thinx.cloud/api/v2/login \
  -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $T" -d '{"username":"x","password":"y"}'; echo
# expect: invalid_credentials (NOT csrf_token_invalid)
rm -f $J
```

Then do the browser checks in 21-05-PLAN Task 2, steps 3b and 4. Every one uses a fresh incognito
window; a warm browser hides the lockout.

- cold login on rtm (classic) and console (Vue);
- Vue password reset from `https://console.thinx.cloud/#/password-reset`, which must not 403;
- Vue OAuth return (`/#/oauth-return`), where the awaited prime must come before `POST /api/v2/login`;
- classic OAuth return (`rtm.thinx.cloud/auth.html?…&g=true`), where `Set-Cookie: XSRF-TOKEN` must come
  before `/login` and `/login` must carry a non-empty `X-XSRF-TOKEN`;
- a reload of a logged-in Vue session must keep the session (`POST /api/v2/session/token` → 200).

Then watch for real users being rejected. Since `d2b6f512` (21-REVIEW WR-01), enforce mode logs one line per
rejection, with a reason code and the route but never token values:

```
⚠️ [warning] CSRF token rejected reason=<no_cookie|no_header|length_mismatch|value_mismatch> xsrf_cookies=<n> [duplicate_cookie=true] for <METHOD> <route> (enforced, 403)
```

Count rejections with `docker service logs thinx_api --since <ts> --no-trunc 2>/dev/null | grep -c 'CSRF token rejected'`.
Also watch user reports and Rollbar: the consoles send a Rollbar warning when a rejection survives the one retry.

**Any failure: roll back immediately. Do not leave production in a broken enforce state.**

---

## HawkScan rescan procedure

> **Retired 2026-09-25.** The StackHawk service is deprecated and `stackhawk.yml` was deleted from
> the repo, so the procedure below can no longer be run. The 21-05 rescan was skipped by operator
> decision, and SEC-CSP-01 / SEC-CSRF-01 closure rests on the post-flip checks above. The section is
> kept as a historical record only.

Run from the workstation, in the repo root. `stackhawk.yml` targets `host: https://rtm.thinx.cloud`,
app `729977da-df6c-4e46-bb7e-849f7b71ae8a`, env `Production`. Previous pair: scan `c5691244`,
rescan `1f3ec1e7` (2026-07-04). This scans production, so do it only after the flip has passed its
checks.

```bash
cd ~/Repositories/thinx-api/thinx-device-api
hawk version
hawk validate config stackhawk.yml            # catches config drift before spending a scan
hawk rescan stackhawk.yml                     # re-runs only the plugins that alerted last time
# If rescan is unavailable or refuses (no prior scan in this env): hawk scan stackhawk.yml
```

The CLI takes its API key from `~/.hawk/hawk.properties` (`hawk init`) or `--api-key`. Never paste
the key into this file.

Pass criteria (StackHawk platform → app → the new scan):

- plugin **10055-4** "CSP: Wildcard Directive": **0 NEW** paths (SEC-CSP-01);
- plugin **20012** "Anti-CSRF Tokens": **0 NEW** paths (SEC-CSRF-01).

Record the scan ID and both counts in the Execution Annex. Findings already triaged on the platform
(for example the Oracle SQLi / Shell Shock false positives) are not regressions.

Note: `stackhawk.yml`'s `usernamePassword` block (FORM POST to `/` with `session[username]`) is a
template leftover. It does not drive the real JSON login, so the scan runs unauthenticated whether
enforcement is on or off. Do not read an authentication failure in the scan log as a CSRF regression.

---

## Rollback

**When:** any post-flip check fails, real users report login failures or forced logouts, or 403
`csrf_token_invalid` shows up on normal browser traffic. No code revert is needed: the fail-open path
is always present, so clearing the switch restores 21-04 behaviour. **SLA: under 5 minutes.**

### Rollback A: env var set

```bash
# on micro
timeout 300 docker service update --env-rm CSRF_ENFORCE --no-resolve-image thinx_api
timeout 20 docker service ps thinx_api --format '{{.Name}}.{{.ID}} {{.Node}} {{.DesiredState}} {{.CurrentState}} {{.Error}}' | head -3
timeout 20 docker service inspect thinx_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep CSRF || echo "CSRF env cleared"
jq '.debug.csrf_enforce' /mnt/gluster/thinx/conf/config.json    # must NOT be true, or enforcement stays on
```

Then remove the `- "CSRF_ENFORCE=true"` line from `thinx.yml`, so the next stack deploy does not
bring it back.

### Rollback B: config.json set

```bash
# on micro
cd /mnt/gluster/thinx/conf
cat config.json.bak-<TS> > config.json          # the backup taken at flip time (pre-flip had no csrf_enforce key)
#   or, if the backup is missing:
#   jq '.debug.csrf_enforce = false' config.json > /tmp/c.json && jq -e . /tmp/c.json >/dev/null && cat /tmp/c.json > config.json
jq -c '.debug' config.json
timeout 300 docker service update --force --no-resolve-image thinx_api
timeout 20 docker service ps thinx_api --format '{{.Name}}.{{.ID}} {{.Node}} {{.DesiredState}} {{.CurrentState}} {{.Error}}' | head -3
timeout 20 docker service inspect thinx_api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep CSRF || echo "no CSRF env"
```

### Do not reach for `docker service rollback` blindly

`docker service rollback thinx_api` restores the service's **PreviousSpec**, whatever that is. On
2026-09-25 PreviousSpec pointed at an **older image** (`…api:swarm@sha256:4f69fcb4…`, not the running
`4230d64f…`), so running it before the flip would have downgraded the API. Straight after an Option A
flip, PreviousSpec is the pre-flip spec and rollback would be equivalent to `--env-rm`. It is useless
for Option B, because the flag lives in a file. Check before using it:

```bash
timeout 20 docker service inspect thinx_api --format 'prev={{.PreviousSpec.TaskTemplate.ContainerSpec.Image}} cur={{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

### Verify the rollback

```bash
curl -sS -m 20 -X POST https://app.thinx.cloud/api/login -H 'Content-Type: application/json' \
  -d '{"username":"x","password":"y"}'; echo       # expect invalid_credentials again
```

The same request should now log a `(fail-open, not enforced)` warning again, which confirms the
middleware is back in fail-open mode. Log in once through each console.

### CSP rollback (console side, only if a CSP change breaks a console)

The CSP is not changed by this plan. If a later CSP edit breaks a console, restore the gluster file
from a timestamped backup, not from `git checkout`. The swarm repo copy has uncommitted edits, and the
committed version predates the 2026-09-24 `cdn.rollbar.com` addition.

```bash
# on micro (gluster: the same file is used on both nodes)
cd /mnt/gluster/deployment/swarm/console
ls -la default.conf*          # default.conf.bak-20260924 = before cdn.rollbar.com (Rollbar will be CSP-blocked again)
                              # default.conf.csp-backup-20260919T201604Z = before SEC-CSP-01 pinning (re-opens the wildcard finding)
cp default.conf default.conf.pre-rollback-$(date -u +%Y%m%dT%H%M%SZ)
cat default.conf.bak-20260924 > default.conf     # in-place write keeps the inode; running containers pin the old inode on a single-file bind mount, so the restarts below are what apply it
timeout 300 docker service update --force --no-resolve-image thinx_console
timeout 300 docker service update --force --no-resolve-image thinx_vue
for h in rtm.thinx.cloud console.thinx.cloud; do curl -sS -m 20 -D - -o /dev/null https://$h/index.html | grep -i '^content-security-policy' | md5sum; done
```

Afterwards, update `swarm-configs/console-default.conf.prod` and the `rtm.thinx.cloud-server.*.nginx`
snapshots to match.

### Deep fallback: remove the middleware

Use this only if the middleware itself misbehaves in fail-open mode, for example if `ensureXsrfCookie`
breaks requests. Revert the 21-01 API commits `5a412795` and `593961c4` on `thinx-staging` and push.
CircleCI `api-registry` then builds `registry.thinx.cloud:5000/thinx/api:swarm` and the swarm picks it
up (`.planning/runbooks/swarm.md`). The console wiring (submodule `0f22e0e`, `cfdea8d`, `fdaf17c`,
`d6d4208`) can stay, but the priming GETs will then 404. Before deciding whether to revert those too,
check that a cold console login tolerates that 404 (Vue `OAuthReturn.vue` awaits the prime; classic
`auth.js` gates on `window.__csrfReady`).

---

## Phase 25: session-bound CSRF (CSRF_MODE)

Phase 25 binds the XSRF-TOKEN to the httpOnly `x-thx-core` session (HMAC over the session id), so a
cookie planted from a sibling `.thinx.cloud` host no longer passes. The wire contract is unchanged:
`XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header, `GET /api/csrf-token` and `/api/v2/csrf-token`, 403
`csrf_token_invalid`. A new env var `CSRF_MODE` on `thinx_api` selects the behaviour. `CSRF_ENFORCE`
stays `true` throughout and is **not** touched by this phase (D-17): the v1.13 double-submit protection
is never switched off.

### The three states

| `CSRF_MODE` | What is minted | What is checked | What is enforced (with `CSRF_ENFORCE=true`) |
|---|---|---|---|
| `legacy` (also unset, empty or unrecognised) | A random 48-hex `XSRF-TOKEN` on any browser request that has none (v1.13) | Double-submit: cookie equals header | Double-submit failures answer 403 |
| `observe` | Only the priming GET mints: a signed `{hmac}.{nonce}` token bound to a 15-minute pre-session; a login rotates it; a persisted session with a stale or foreign token is re-minted lazily. Anonymous requests get no cookie and no session (D-02) | Double-submit, then the session binding | Double-submit failures answer 403; binding failures are **only logged and counted** |
| `signed` | Same as observe | Same as observe | Double-submit **and** binding failures answer 403 |

Every mode keeps the login `regenerate()` (session-fixation fix) and the logout `XSRF-TOKEN` clear.
Verified Bearer and API-key requests are exempt in every mode (D-09: `req.thx_auth`, set in
`lib/router.js` only after the token or key verified). The rollout order is
`legacy` → `observe` (at least 24 h, zero unexplained reasons) → operator cold logins → `signed`.

`observe` and `signed` need a key. `thinx_api` resolves it once at boot from the `CSRF_SECRET` Docker
secret, else HKDF of the session secret. With neither, the task refuses to start
(`CRITICAL CSRF_MODE=… needs CSRF_SECRET or a session secret; refusing to start`). The boot line
`CSRF mode=<mode> key_source=<secret|hkdf|none> enforce=<bool>` confirms what is running.

### Flip (one service, never `restart.sh` / stack deploy)

Check placement first; `docker exec` is node-local and placement floats between `micro` and `core`.

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'docker service ps thinx_api --filter desired-state=running --format "{{.Node}} {{.CurrentState}}"'

# observe
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'timeout 300 docker service update --env-add CSRF_MODE=observe --no-resolve-image thinx_api'
# signed (only after the operator approved it at the 25-06 gate)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'timeout 300 docker service update --env-add CSRF_MODE=signed --no-resolve-image thinx_api'

# converged and running the expected mode
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'timeout 20 docker service inspect thinx_api --format "{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}" | grep CSRF; timeout 60 docker service logs thinx_api --since 3m 2>&1 | grep "CSRF mode=" | tail -1'
```

Then persist the line in `thinx.yml` (see *Persisting `CSRF_MODE` in thinx.yml* below), or the next
stack deploy silently drops it.

### Rollback (one command)

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'timeout 300 docker service update --env-add CSRF_MODE=legacy --no-resolve-image thinx_api'
```

`CSRF_MODE=legacy` restores the v1.13 double-submit behaviour and keeps `CSRF_ENFORCE` on (D-08). It
keeps the login `regenerate()` and the logout clear, so it does not re-open session fixation. Signed
tokens already in browsers keep working in legacy: the double-submit check only compares cookie and
header. Persist `CSRF_MODE=legacy` in `thinx.yml` with the same procedure. **SLA: under 5 minutes.**

**Second-level escape only:** `--env-rm CSRF_ENFORCE` (or `CSRF_ENFORCE=false`) turns every CSRF
failure into a log line (fail-open) and re-opens login CSRF. Use it only when `legacy` does not stop
the lockout, and only with the operator's explicit approval (Rollback A above).

### Reason codes and the explained / unexplained rule

| Code | Layer | Meaning |
|---|---|---|
| `no_cookie`, `no_header`, `length_mismatch`, `value_mismatch` | double-submit (all modes) | No `XSRF-TOKEN` cookie, no header, or cookie and header differ |
| `missing` | binding | No `x-thx-core` cookie on the request (never primed, or the jar dropped the session) |
| `session_mismatch` | binding | An `x-thx-core` cookie was sent but no persisted session loaded (expired or destroyed pre-session) |
| `stale` | binding | The token is not in the signed shape (a pre-deploy 48-hex cookie) |
| `binding_mismatch` | binding | Signed shape, persisted session, but the HMAC does not match this session id (a planted cookie, a token for another session, or a rotation the client did not pick up) |
| `no_key` | binding | No key; unreachable once the task has started |

Classification rule used at the 25-06 gate:

- **Explained:** `stale` (a pre-deploy 48-hex cookie migrating lazily); `session_mismatch` on the
  login, password, user-create and `session/token` routes (an expired pre-session that the console
  re-primes and retries).
- **Unexplained:** `binding_mismatch` and `missing` outside the executor's own probe timestamps, and
  **any** code on any other route. One unexplained reason blocks the `signed` flip.

### Reading the telemetry

Log lines (lost when a task is rescheduled, hence the counters):

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'timeout 120 docker service logs thinx_api --since 24h 2>&1 | grep -E "CSRF binding (observed|rejected)|CSRF token (rejected|missing)" | grep -oE "(binding observed|binding rejected|token rejected|token missing/mismatched) reason=[a-z_]+ .* for [A-Z]+ [^ ]+" | sed -E "s/ xsrf_cookies=[0-9]+( duplicate_cookie=true)?//; s/ mode=[a-z]+//" | sort | uniq -c'
```

Durable counters: Redis hash `csrf:obs:{YYYYMMDD UTC}`, field `{mode}:{reason}:{METHOD} {route pattern}`,
30-day expiry. Every double-submit and binding failure is counted in every mode (the field starts with
the mode). Read them with the read-only script, fed over stdin into the running `thinx_api` container
(use the node that `docker service ps` reported; for `core`, go through the `core` entry in
`~/.aliases`):

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'docker exec -i -e OBS_REDIS=/opt/thinx/thinx-device-api/node_modules/redis -e OBS_GLOBALS=/opt/thinx/thinx-device-api/lib/thinx/globals.js -e OBS_SINCE=20260929 $(docker ps -qf name=thinx_api | head -1) node -' < scripts/csrf-obs-counters.js
# prints "{key} {field} {count}" lines, then OBS-TOTAL {sum}; OBS-FAIL {code} exit 2; OBS-TIMEOUT exit 3
```

### Live probe

`scripts/csrf-live-probe.sh` (User-Agent `thinx-p25-probe`) sends read-only probe traffic: every body
is `{}` or names a non-existent owner, so handlers refuse before any write. It prints key=value lines
only, never a cookie or token value. Exit 2 means a transport failure.

```bash
scripts/csrf-live-probe.sh             # base probe
scripts/csrf-live-probe.sh --guards    # plus the route-guard probes (after the guards ship)
PROBE_API=https://rtm.thinx.cloud/api scripts/csrf-live-probe.sh   # through the console proxy
```

| Key | legacy | observe | signed |
|---|---|---|---|
| `anon_set_cookie` | `1` | `0` | `0` |
| `prime_token_shape` | `legacy` | `signed` | `signed` |
| `pre_session_ttl_s` | `0` | about `900` | about `900` |
| `valid` | `200:email_required` | `200:email_required` | `200:email_required` |
| `planted` | `200:email_required` | `200:email_required` (counted `binding_mismatch`) | `403:csrf_token_invalid` |
| `stale` | `200:email_required` | `200:email_required` (counted `stale`) | `403:csrf_token_invalid` |
| `header_less` | `403:csrf_token_invalid` | `403:csrf_token_invalid` | `403:csrf_token_invalid` |

With `--guards` after the route guards ship: `v2user_unprimed`, `cookie_only_delete_v2user`,
`cookie_only_user_delete`, `cookie_only_gdpr_revoke` and `cookie_only_profile` are
`403:csrf_token_invalid`; `v2user_primed` and `paired_profile` are the handler's own answer, never
`csrf_token_invalid`. The probe's own `planted` and `stale` requests are counted too, so record the
probe timestamps in the annex: counts inside those windows are explained.

### Persisting `CSRF_MODE` in thinx.yml (index-only commit)

The swarm repo's `thinx.yml` carries unrelated uncommitted edits, and interactive `git add -p` is not
available to the executor. Commit only the `CSRF_MODE` line by writing the blob straight into the
index, then make the same one-line change in the working tree. On `micro`:

```bash
cd /mnt/gluster/deployment/swarm
MODE=observe                                   # observe | signed | legacy
test "$(git show HEAD:thinx.yml | grep -c 'CSRF_ENFORCE=true')" = 1 || echo "STOP: expected one CSRF_ENFORCE line"
SETMODE='/^[[:space:]]*- "CSRF_MODE=/ { next }
{ print }
/^[[:space:]]*- "CSRF_ENFORCE=true"/ { match($0, /^[[:space:]]*/); printf "%s- \"CSRF_MODE=%s\"\n", substr($0, 1, RLENGTH), m }'
git show HEAD:thinx.yml | awk -v m="$MODE" "$SETMODE" > /tmp/thinx.yml.p25
git show HEAD:thinx.yml | diff - /tmp/thinx.yml.p25        # exactly one CSRF_MODE line added or changed
BLOB=$(git hash-object -w /tmp/thinx.yml.p25)
git update-index --cacheinfo 100644,"$BLOB",thinx.yml
git commit -m "thinx_api: CSRF_MODE=$MODE (Phase 25)"
awk -v m="$MODE" "$SETMODE" thinx.yml > /tmp/thinx.yml.wt && cat /tmp/thinx.yml.wt > thinx.yml
git diff HEAD -- thinx.yml | grep -c CSRF_MODE              # must print 0; the unrelated edits stay uncommitted
rm -f /tmp/thinx.yml.p25 /tmp/thinx.yml.wt
```

The line goes directly after `- "CSRF_ENFORCE=true"` in the `api` service's `environment:` list.

### Phase 25 guarded-route inventory

Source of truth: `spec/jasmine/CsrfRouteInventorySpec.js`. It reads the router sources as text (no
services) and fails when a guarded route loses `csrf.verifyCsrfToken`, when a recorded exclusion gains
it, when a registration line moves out of reach (renamed, split or duplicated), when a router with a
guarded row lacks the csrf factory, or when an admin mutation stops running the CSRF check before
`requireAdmin`. This section mirrors its tables as of plan 25-07; line numbers drift with edits, the
spec does not. Runtime behaviour (cookie-only 403, Bearer pass-through) is covered in CI by
`spec/jasmine/ZZ-CSRFRouteGuardSpec.js` under `CSRF_MODE=signed` + `CSRF_ENFORCE=true`.

**Guarded: 38 routes** (8 SEC-CSRF-01, 7 SEC-CSRF-04/05 Tier 1, 23 D-11). Every guard is live only once
the image carrying it is deployed (plan 25-08 for the 25-05 and 25-07 guards). Bearer (JWT) and API-key
calls are exempt through `req.thx_auth` (D-09). The GitHub token POST is one array registration serving
both paths. The admin mutations register `csrf.verifyCsrfToken, requireAdmin`, so a forged request is
refused before the admin profile lookup. `GET /api/user/rsakey/create` is a state-changing GET; the
classic dashboard sends `X-XSRF-TOKEN` on it through the D-18 `$.ajaxSetup` seam.

| # | Method | Path | File:line | Set |
|---|---|---|---|---|
| 1 | POST | `/api/login` | `lib/router.auth.js:364` | SEC-CSRF-01 (v1.13) |
| 2 | POST | `/api/v2/login` | `lib/router.auth.js:383` | SEC-CSRF-01 (v1.13) |
| 3 | POST | `/api/v2/session/token` | `lib/router.auth.js:394` | SEC-CSRF-01 (v1.13) |
| 4 | POST | `/api/v2/password/reset` | `lib/router.user.js:159` | SEC-CSRF-01 (v1.13) |
| 5 | POST | `/api/v2/password/set` | `lib/router.user.js:169` | SEC-CSRF-01 (v1.13) |
| 6 | POST | `/api/user/create` | `lib/router.user.js:198` | SEC-CSRF-01 (v1.13) |
| 7 | POST | `/api/user/password/set` | `lib/router.user.js:208` | SEC-CSRF-01 (v1.13) |
| 8 | POST | `/api/user/password/reset` | `lib/router.user.js:218` | SEC-CSRF-01 (v1.13) |
| 9 | POST | `/api/v2/user` | `lib/router.user.js:150` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 10 | DELETE | `/api/v2/user` | `lib/router.user.js:190` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 11 | POST | `/api/user/delete` | `lib/router.user.js:231` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 12 | POST | `/api/v2/profile` | `lib/router.profile.js:49` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 13 | POST | `/api/user/profile` | `lib/router.profile.js:63` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 14 | DELETE | `/api/v2/gdpr` | `lib/router.gdpr.js:146` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 15 | POST | `/api/gdpr/revoke` | `lib/router.gdpr.js:173` | SEC-CSRF-04/05 Tier 1 (25-05) |
| 16 | POST | `/api/user/apikey` | `lib/router.apikey.js:73` | D-11 (25-07) |
| 17 | POST | `/api/user/apikey/revoke` | `lib/router.apikey.js:78` | D-11 (25-07) |
| 18 | POST | `/api/v2/apikey` | `lib/router.apikey.js:92` | D-11 (25-07) |
| 19 | DELETE | `/api/v2/apikey` | `lib/router.apikey.js:97` | D-11 (25-07) |
| 20 | PUT | `/api/v2/rsakey` | `lib/router.rsakey.js:55` | D-11 (25-07) |
| 21 | DELETE | `/api/v2/rsakey` | `lib/router.rsakey.js:63` | D-11 (25-07) |
| 22 | GET | `/api/user/rsakey/create` | `lib/router.rsakey.js:73` | D-11 (25-07) |
| 23 | POST | `/api/user/rsakey/revoke` | `lib/router.rsakey.js:83` | D-11 (25-07) |
| 24 | PUT | `/api/v2/env` | `lib/router.env.js:73` | D-11 (25-07) |
| 25 | DELETE | `/api/v2/env` | `lib/router.env.js:77` | D-11 (25-07) |
| 26 | POST | `/api/user/env/add` | `lib/router.env.js:90` | D-11 (25-07) |
| 27 | POST | `/api/user/env/revoke` | `lib/router.env.js:94` | D-11 (25-07) |
| 28 | POST | `/api/github/token` | `lib/router.github.js:282` | D-11 (25-07) |
| 29 | POST | `/api/v2/github/token` | `lib/router.github.js:282` | D-11 (25-07) |
| 30 | DELETE | `/api/v2/admin/session/:owner` | `lib/router.admin.js:87` | D-11 (25-07) |
| 31 | POST | `/api/v2/admin/impersonate` | `lib/router.admin.js:88` | D-11 (25-07) |
| 32 | POST | `/api/v2/admin/user/:id/reactivate` | `lib/router.admin.js:89` | D-11 (25-07) |
| 33 | POST | `/api/v2/transfer/request` | `lib/router.transfer.js:98` | D-11 (25-07) |
| 34 | POST | `/api/v2/transfer/decline` | `lib/router.transfer.js:107` | D-11 (25-07) |
| 35 | POST | `/api/v2/transfer/accept` | `lib/router.transfer.js:116` | D-11 (25-07) |
| 36 | POST | `/api/transfer/request` | `lib/router.transfer.js:125` | D-11 (25-07) |
| 37 | POST | `/api/transfer/decline` | `lib/router.transfer.js:136` | D-11 (25-07) |
| 38 | POST | `/api/transfer/accept` | `lib/router.transfer.js:147` | D-11 (25-07) |

**Recorded exclusions: 29 rows**, each with its reason. The OAuth rows also cover their `/api/v2/...`
twins (same array registration). The transfer accept/decline GETs are e-mail capability links: the
`transfer_id` in the query is the authority, not the cookie, and the mail client sends no header.

| Method | Path | File:line | Reason |
|---|---|---|---|
| PUT | `/api/v2/gdpr` | `lib/router.gdpr.js:141` | one-shot body token, not cookie-authenticated |
| POST | `/api/gdpr` | `lib/router.gdpr.js:162` | one-shot body token, not cookie-authenticated |
| POST | `/api/v2/gdpr` | `lib/router.gdpr.js:151` | read carried as POST |
| POST | `/api/gdpr/transfer` | `lib/router.gdpr.js:168` | read carried as POST |
| GET | `/api/v2/activate` | `lib/router.user.js:154` | e-mail capability link |
| GET | `/api/user/activate` | `lib/router.user.js:203` | e-mail capability link |
| GET | `/api/v2/password/reset` | `lib/router.user.js:164` | e-mail capability link |
| GET | `/api/user/password/reset` | `lib/router.user.js:213` | e-mail capability link |
| POST | `/api/v2/chat` | `lib/router.user.js:185` | Tier 3, deferred by D-21 |
| POST | `/api/user/chat` | `lib/router.user.js:222` | Tier 3, deferred by D-21 |
| POST | `/device/firmware` | `lib/router.deviceapi.js:40` | firmware API (non-browser) |
| POST | `/device/register` | `lib/router.deviceapi.js:63` | firmware API (non-browser) |
| GET | `/api/v2/profile` | `lib/router.profile.js:54` | GET read, D-10 |
| GET | `/api/user/profile` | `lib/router.profile.js:68` | GET read, D-10 |
| GET | `/api/user/apikey/list` | `lib/router.apikey.js:83` | GET read |
| GET | `/api/v2/apikey` | `lib/router.apikey.js:102` | GET read |
| GET | `/api/v2/rsakey` | `lib/router.rsakey.js:59` | GET read |
| GET | `/api/user/rsakey/list` | `lib/router.rsakey.js:78` | GET read |
| GET | `/api/v2/env` | `lib/router.env.js:81` | GET read |
| GET | `/api/user/env/list` | `lib/router.env.js:98` | GET read |
| GET | `/api/v2/admin/users` | `lib/router.admin.js:86` | GET read |
| GET | `/api/v2/transfer/decline` | `lib/router.transfer.js:103` | e-mail capability link |
| GET | `/api/v2/transfer/accept` | `lib/router.transfer.js:112` | e-mail capability link |
| GET | `/api/transfer/decline` | `lib/router.transfer.js:131` | e-mail capability link |
| GET | `/api/transfer/accept` | `lib/router.transfer.js:142` | e-mail capability link |
| GET | `/api/oauth/github` | `lib/router.github.js:232` | OAuth redirect flow |
| GET | `/api/oauth/github/callback` | `lib/router.github.js:248` | OAuth redirect flow |
| GET | `/api/oauth/google` | `lib/router.google.js:186` | OAuth redirect flow |
| GET | `/api/oauth/google/callback` | `lib/router.google.js:241` | OAuth redirect flow |

#### Mesh routes (quick 261003-skk)

The mesh mutations in `lib/router.mesh.js` take the session-bound CSRF check, which lifts D-21 for
that file only. Bearer calls and cookieless calls with a router-verified API key stay exempt (D-09);
the classic console sends `X-XSRF-TOKEN` on its `/api/mesh/create` and `/api/mesh/delete` calls
through the D-18 `$.ajaxSetup` seam, and Vue calls `/api/v2/mesh` with Bearer. With these rows the
inventory totals become **42 guarded routes and 32 recorded exclusions**.

| Method | Path | File:line | Source |
|---|---|---|---|
| POST | `/api/mesh/create` | `lib/router.mesh.js:105` | quick 261003-skk (D-21 lifted for mesh) |
| POST | `/api/mesh/delete` | `lib/router.mesh.js:109` | quick 261003-skk (D-21 lifted for mesh) |
| PUT | `/api/v2/mesh` | `lib/router.mesh.js:83` | quick 261003-skk (D-21 lifted for mesh) |
| DELETE | `/api/v2/mesh` | `lib/router.mesh.js:87` | quick 261003-skk (D-21 lifted for mesh) |

| Method | Path | File:line | Reason |
|---|---|---|---|
| GET | `/api/mesh/list` | `lib/router.mesh.js:96` | GET read |
| POST | `/api/mesh/list` | `lib/router.mesh.js:101` | read carried as POST |
| GET | `/api/v2/mesh` | `lib/router.mesh.js:79` | GET read |

**Deferred by D-21 (Tier 3 resource mutations):** devices, sources, build and chat (mesh was lifted
by quick 261003-skk, above). The device mesh attach/detach routes in `lib/router.device.js` stay
deferred with the device routes. These cookie-authenticated resource edits are not guarded in Phase 25
and move to a follow-up requirement; the chat rows above are the ones the inventory records. The device-ownership transfer POSTs are not
Tier 3: they move devices between owner accounts, which is account state (D-11).

### Phase 25 Execution Annex

| Step | UTC | Evidence / value |
|---|---|---|
| D-05 external `POST /api/v2/user` callers: start of observe | 2026-09-29 ~15:44 (read-only, before any push) | Traefik access log window about 57 h (27/Sep 06:48:11 → 29/Sep 15:44:34 UTC, 315,305 lines). `POST /api/v2/user`: 0 hits. `POST /api/user/create` on router `thinx-api-https@docker`: 4 hits, all at 29/Sep 14:34:53–54Z, which is the 25-03 legacy probe (matched by timestamp). **External callers: 0.** Traefik logs no User-Agent (0 of 313,322 lines; bare `--accesslog`), so callers are told apart by timestamp against the probe runs. Repeat at the end of observe (25-06) and before the guards (25-08). |
| D-05 external callers: end of observe | 2026-09-30 ~17:10 (read-only) | Traefik access log up to 30/Sep 17:07:40Z, 568,897 lines (start of range not recorded). `POST /api/v2/user`: 0. `POST /api/user/create` on `thinx-api-https@docker`: 12 hits (9 × 200, 3 × 403), all at probe timestamps 29/Sep 14:34:53–54Z, 17:05:16–17Z and 17:06:59Z. Guarded account routes saw console traffic only (`GET /api/user/rsakey/create` × 3, `POST /api/user/profile` × 2, all 200 on `thinx-console-https`). **External callers: 0.** |
| D-05 external callers: before the route guards | 2026-10-01 ~10:34 (read-only; the guards had already shipped at 09:51Z in observe) | Traefik, all retained lines: every `POST /api/user/create` hit is a probe (29/Sep 14:34, 17:05, 17:06Z; 01/Oct 08:34Z); 0 `POST /api/v2/user`. **External callers: 0.** Active accounts (CouchDB `last_seen`): 658 users, 7 seen in 30 days, including the operator's three test accounts. |
| Legacy deploy (Phase 25 code, `CSRF_MODE` unset) | Push 16:47:42Z, re-push 16:53:22Z; `thinx_api` Running 16:58:27Z | Console `3c906ff` pushed to console thinx-staging (fast-forward), then parent `c48e354a` (gitlink bump). CircleCI `test` 15490 failed on `LoggingQualityAuditSpec` (`full_user_wrapper` in `lib/router.google.js`); node-repair fix `dcbbd416` re-pushed once. For `dcbbd416`: test 15492 (686 specs, 0 failures), api-registry 15493, console-classic-registry 15496, vue-console-registry 15494, all success. Swarmpit rolled `thinx_api` → `api:swarm@sha256:bfe2a2fc73e3…`, `thinx_console` → `console:swarm@sha256:972a3c3a9237…` (rolled twice, once per console publish), `thinx_vue` → `console:vue@sha256:61cdf6e39262…` (twice). Pre-deploy rollback digests: api `66b3aa781b56…`, console `5d501928ee06…`, vue `c2163d1dbc3b…`. `rtm.thinx.cloud/app/js/thinx-api.js` carries `X-XSRF-TOKEN` (2 hits). Probe 17:05:16Z: `anon_set_cookie=1 prime_token_shape=legacy pre_session_ttl_s=0 valid=200:email_required planted=200:email_required stale=200:email_required header_less=403:csrf_token_invalid`. Boot line `CSRF mode=legacy key_source=secret enforce=true` ×1, 0 CRITICAL, 0 failed tasks. Env: `CSRF_ENFORCE=true` only. |
| Observe flip (`CSRF_MODE=observe`, `thinx.yml` commit) | Update 17:06:15Z → converged 17:06:35Z; **observe_start_utc 2026-09-29T17:06:30Z** | `timeout 300 docker service update --env-add CSRF_MODE=observe --no-resolve-image thinx_api`, converged; 0 restarts after 5 min (checked 17:11:51Z). Env: `CSRF_ENFORCE=true`, `CSRF_MODE=observe`. Boot line `CSRF mode=observe key_source=secret enforce=true` ×1, 0 CRITICAL. Probe 17:06:58–59Z: `anon_set_cookie=0 prime_token_shape=signed pre_session_ttl_s=900 valid=200:email_required planted=200:email_required stale=200:email_required header_less=403:csrf_token_invalid`. Log: `binding observed reason=binding_mismatch mode=observe for POST /api/user/create` ×1, `reason=stale` ×1. Counters `csrf:obs:20260929`: `observe:binding_mismatch:POST /api/user/create 1`, `observe:stale:POST /api/user/create 1`, `observe:no_cookie:POST /api/user/create 1`, `legacy:no_cookie:POST /api/user/create 1` (all probe traffic, 17:05:16Z and 17:06:58Z). Swarm repo commit `a50dda1` (`thinx.yml` only, 1 line; the other uncommitted edits left in place). Before the Phase 25 image rolled, v1.13 logged 8 `no_cookie` rejections (16:52:38–56Z: 6 × `POST /api/v2/session/token`, 2 × `POST /api/v2/login`); none since. Classify them at 25-06. |
| Observe window evidence (counters, log counts, classification) | 2026-09-29T17:06:30Z → 2026-09-30T17:08Z (24.0 h) | Env `CSRF_ENFORCE=true`, `CSRF_MODE=observe`; one task the whole window (StartedAt 17:06:29.5Z, 0 restarts, never rescheduled). Counters `OBS_SINCE=20260929`: the 4 probe counters from the flip row only, `OBS-TOTAL 4`; no `csrf:obs:20260930` key. Log (585 lines): 3 CSRF lines, all the 17:06:59Z probe; boot line `mode=observe key_source=secret` × 1; 0 CRITICAL. **0 unexplained.** Real console traffic was light (1 classic and 1 Vue login, 2 × `session/token` 200, 8 primes). One `POST /api/login` 403 on `thinx-console-https` logged no CSRF line, so it is not a CSRF rejection. The 8 pre-flip v1.13 `no_cookie` lines (16:52Z) are outside the window; that task's logs are gone. |
| Forced `thinx_api` redeploy mid-session | Prime + baseline 2026-10-01T08:34:26Z; update 08:34:27Z → converged 08:34:50Z; replay 08:34:55Z | Operator logged in on both consoles first. `timeout 300 docker service update --force --no-resolve-image thinx_api`: `UpdateStatus` completed, new task Running. Digest `bfe2a2fc73e3…` and env (`CSRF_ENFORCE=true`, `CSRF_MODE=observe`) unchanged. Baseline and replay of the same pre-session both `200 email_required`. Since the redeploy: 0 `session_mismatch`/`binding_mismatch` lines for `POST /api/user/create`, boot line `mode=observe key_source=secret` × 1, 0 CRITICAL. 0 restarts at 08:54Z (StartedAt 08:34:43Z). |
| Operator cold logins (password, Google, GitHub; both consoles) | 08:36–08:42Z; answer `checks-passed` | Both pre-redeploy tabs stayed logged in; rtm profile save and API key create/revoke (08:37:20–50Z) and Vue profile save (08:38:42Z) returned 200. Six cold logins landed on the dashboard. Classic: every login (password, Google, GitHub) primed `GET /api/csrf-token` right before `POST /api/login`; 0 CSRF lines. Vue password login: 0 CSRF lines. **Vue Google and GitHub logins: 4 pairs of `binding observed reason=session_mismatch` for `POST /api/v2/session/token` + `POST /api/v2/login` (08:38:14, 08:41:39, 08:41:56, 08:42:02Z), each right after an OAuth return.** Cause: `GET /api/oauth/{google,github}` calls `req.session.destroy()` (router.google.js:190, router.github.js:235), but the browser keeps `XSRF-TOKEN` and `x-thx-core`; `OAuthReturn.vue` then calls `ensureCsrfToken()` without `force`, which sees the cookie and skips the prime. Under `signed` each Vue OAuth login would take a 403 `csrf_token_invalid`, then `fetchWithCsrf`'s forced re-prime and one retry. That retry path has not been exercised in production. Decide before the 25-08 flip. |
| Vue OAuth-return re-prime fix (25-06 finding) | Push 09:45Z; `thinx_console` 09:47:39Z, `thinx_api` and `thinx_vue` rolled by 09:51:15Z; operator logins 09:57–09:59Z | Console `5d3ab53` (`OAuthReturn.vue` and `App.vue` hydrate force the shared prime on `/oauth-return`; Cypress `oauth-return.spec.js`), parent `72725c66`; CircleCI test 15506, api-registry 15507, console-classic-registry 15503, vue-console-registry 15502, all success. This deploy also shipped the 25-05/25-07 guards, which only log while in observe mode. Digests: api `c4097af94dcc…`, vue `1076e8669e53…`, console `5c9246e0a5e8…`; env unchanged (`CSRF_ENFORCE=true`, `CSRF_MODE=observe`); boot line `mode=observe key_source=secret` × 1, 0 restarts, 0 CRITICAL. Operator Vue Google × 2 and GitHub × 2: each OAuth return made one `GET /api/v2/csrf-token` before `POST /api/v2/login` (200) and `/session/token`. **0 CSRF lines since 09:51Z.** Finding resolved. |
| Signed flip (`CSRF_MODE=signed`, `thinx.yml` commit) | Update 10:50:51Z → task Running; boot line 10:51:19Z; watch to 11:06Z | `timeout 300 docker service update --env-add CSRF_MODE=signed --no-resolve-image thinx_api`, completed. Env `CSRF_ENFORCE=true`, `CSRF_MODE=signed`; boot line `CSRF mode=signed key_source=secret enforce=true` × 1; 0 CRITICAL; 0 restarts after 15 min. Probe `--guards` 10:51:42–45Z: `anon_set_cookie=0 prime_token_shape=signed pre_session_ttl_s=900 valid=200:email_required planted=403 stale=403 header_less=403 v2user_unprimed=403 v2user_primed=200:email_required cookie_only_delete_v2user=403 cookie_only_user_delete=403 cookie_only_gdpr_revoke=403 cookie_only_profile=403 paired_profile=401` (403s are all `csrf_token_invalid`). Watch: 8 rejection lines, all from the probe; **0 real-user rejections.** Operator checks under signed: pre-flip Vue tab kept its session (10:52:15Z); classic GitHub, Google and password logins, profile save; Vue password, Google and GitHub logins (10:52:54, 10:54:53, 10:55:00Z), each primed once and logged in with 200 and no retry. Swarm commit `45a337d` (`thinx.yml` only, 1 line); `docker-swarm.yml` mirror `a1c76cd4`. No rollback trigger fired. |
| Guard deploy (route guards, `--guards` probe) | Push 2026-10-01T09:45Z; `thinx_api` `c4097af94dcc…` Running 09:50:54Z | Shipped with the 25-06 Vue fix (parent `72725c66`, CI test 15506 and api-registry 15507 success), in observe mode, before the flip. In observe: 0 CSRF lines from 09:51Z to the flip. Proven under signed by the `--guards` probe in the row above. |
| Gluster header edit (`console/default.conf`) | 2026-10-01 11:07:44Z (`thinx_console` forced), 11:07:55Z (`thinx_vue`) | Before-state: `LIVE-HEADERS FAIL 10` (`xpcdp=all`, no Referrer-Policy or Permissions-Policy, `csp=2` on proxied `/api/` on both hosts). Swarm rollback point `73d97be` (live md5 `f4e9fde7…`). `nginx -t` passed in a throwaway `thinx_vue` container. In-place write, same inode, md5 `cf25f548…`. After-state `LIVE-HEADERS OK`, 10/10 lines `csp=1 xpcdp=none referrer=1 permissions=1`. Harden commit `9b7b055`. CSP value unchanged. Mirrors: console `c58dd09`, parent `72efe5cd`, with the CI parity step and one exception (the Vue image omits `'unsafe-eval'` from `script-src`). CI 15508/15511/15512/15513 green, rollout by 11:19:18Z, and a signed pre-session primed before the push still answered `email_required`. |
| Final automated sweep (25-10) | 2026-10-01 11:19:54–11:21Z | `csrf-live-probe.sh --guards`: all signed and guard expectations met. `LIVE-HEADERS OK`. `HEADER-PARITY OK files=4`, and `files=5` with `--live` on a fresh copy of the gluster file. Env `CSRF_ENFORCE=true`, `CSRF_MODE=signed`; Running, 0 restarts; swarm `thinx.yml` HEAD has `CSRF_MODE=signed`; 0 CRITICAL since the flip. Rejections since the flip: the probes (10:51Z, 11:19Z) and 8 × `no_cookie` on `POST /api/v2/session/token` and `/api/v2/login` through the rtm router at 11:17:54–11:18:16Z. Those 8 came from the **console repo's CircleCI "Test Vue console" Cypress run** (build 849, 11:12–11:19Z), which calls the production API cross-site from the runner. The same job explains the 09:50Z `session/token` 502s (build 848) and the 29 Sep 16:52Z pre-flip `no_cookie` lines (build 847). **0 real-user rejections.** D-05: every `user/create` and `v2/user` hit is a probe; 0 external callers. CircleCI for `72efe5cd`: every job succeeded. |
| Review-fix deploy (25-REVIEW CR-01, CR-02, WR-01, WR-02) | Push 2026-10-01 ~11:52Z; `thinx_api` `c42333a3bb0a` Running 12:05:27Z | Parent `2a9569c1` (fixes `216ef1fc`, `222ce746`). CircleCI test 15516 (with `ZZ-CSRFEnforceSpec` and the new `ZZ-CSRFSpec` x2b/x2c), api-registry 15522 and all other jobs passed. Env `CSRF_ENFORCE=true`, `CSRF_MODE=signed`; 0 restarts; boot line `mode=signed key_source=secret` × 1; 0 CRITICAL. `csrf-live-probe.sh --guards` unchanged from the flip row. `LIVE-HEADERS OK`. Operator: cold logins on both consoles, Vue profile save and Vue reload passed. The API-key bypass itself was not replayed against production (it needs a real key); CI covers it. |
| Final combined two-console pass | 2026-10-01 ~11:25–11:38Z | Operator, under `CSRF_MODE=signed` with all guards and hardened headers: (1) six cold logins on rtm and console (password, Google, GitHub) passed; (2) classic register, activate, set password, forgot password, reset and log in passed; (3) classic dashboard profile save, API key, env var and deploy key create/revoke passed; (4) Vue reload, profile save and API key create/revoke passed; (5) shared cookie jar (rtm, then console, then rtm profile save) passed with no 403; (7) the expired pre-session check was skipped. (6) Headers were checked by the executor in chrome-devtools: the rtm and console documents each carry exactly one CSP, `XPCDP: none`, Referrer-Policy and Permissions-Policy, and proxied `/api/*` responses carry one CSP. Finding: on proxied API responses, helmet and nginx both set Referrer-Policy (`no-referrer, strict-origin-when-cross-origin`), XPCDP, X-Download-Options, X-Content-Type-Options, X-Frame-Options (`SAMEORIGIN, DENY`), X-XSS-Protection (`0, 1; mode=block`) and HSTS, so each arrives twice. These are JSON responses and the impact is low; recorded as a follow-up. |
| Rollbacks (when, why, command) | none in Phase 25 | 25-04, 25-06, 25-08 and 25-09: no rollback trigger fired. The CSRF rollback (`--env-add CSRF_MODE=legacy`) and the header rollback (`git show 73d97be:console/default.conf > console/default.conf`, then force both consoles) were never needed. |

---

## Execution Annex (fill in at flip time)

| Field | Value |
|---|---|
| Gate cleared (UTC) | **Not fully cleared.** The operator chose to flip early on 2026-09-25, with about 25 minutes of clean logs, not the planned day. The 08:35:09Z `session/token` warning is still unexplained. |
| Cold-login test (both consoles), evidence | Partial. A cold Vue load in an isolated browser context (08:49Z) fetched a token, then sent `POST /session/token` with a matching cookie and header, and logged no warning. The cold login submit and the rtm cold test did not run, because the chrome-devtools browser hung. |
| Log window checked (`--since` … → …) and warning count | `--since 2026-09-25T08:36:00` → 09:01Z: 0 warnings, including three real logins (08:54, 08:56, 08:58). |
| Switch used (A env / B config.json) | A (`CSRF_ENFORCE=true`) |
| Flip executed (UTC) / operator | 2026-09-25 09:02:03 → converged 09:02:24Z. Run by Claude on the operator's instruction. Same image, `api:swarm@sha256:3852e8d2…`. |
| `thinx.yml` persisted? (A only) | Yes. Swarm repo commit `bc6d04a`, one line only. The file had other uncommitted edits, which were left in place; the pre-edit copy is `/root/thinx.yml.bak-20260925`. |
| Post-flip curl: header-less → | `csrf_token_invalid`, HTTP 403 |
| Post-flip curl: primed → | `invalid_credentials`; primed `session/token` via the console proxy → `no_session`, HTTP 401 |
| Browser checks (cold login ×2, Vue reset, Vue OAuth, classic OAuth, Vue reload) | Vue reload of a warm session: `session/token` → 200, and the other 16 API calls returned no 403s. Operator on 2026-09-25: cold login on both consoles OK; Vue password reset OK; classic GitHub OAuth on rtm OK. The first attempt got 502/504 on static assets while a redeploy was restarting `thinx_console`; after a reload it landed on the dashboard. |
| HawkScan scan ID / 10055-4 NEW / 20012 NEW | Skipped. StackHawk is deprecated and its integration was removed on 2026-09-25. |
| Rolled back? (when, why) | No |

---

## Reference

- `.planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-05-PLAN.md`: this plan (Task 1 flip, Task 2 rescan and browser checks)
- `.planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-04-SUMMARY.md`: fail-open verification and the open item behind the pre-flip gate
- `.planning/runbooks/console-csp-source-of-truth.md`: why the gluster bind mount, not the image configs, is the production CSP
- `.planning/runbooks/swarm-configs/`: `console-default.conf.prod` and the `rtm.thinx.cloud-server.{pre,post}.nginx` snapshots
- `lib/middleware/csrf.js`: `isEnforced()`, `verifyCsrfToken()`; routes in `lib/router.auth.js` and `lib/router.user.js`
- `lib/thinx/globals.js` `load()`: config precedence (`config.override.json` beats `config.json`)
- `.planning/runbooks/websocket-handshake.md`: runbook convention followed here

---

*Runbook written: 2026-09-25 (Phase 21 / Plan 21-05 Task 1, pre-flip). Flip executed 2026-09-25
09:02Z (Option A, `thinx.yml` `bc6d04a`); enforcement ON. Status wording corrected per 21-REVIEW WR-09.*

_Phase 25 completed 2026-10-01: production in `CSRF_MODE=signed` with 38 guarded routes, console edge headers hardened and gated in CI._
