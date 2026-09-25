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
