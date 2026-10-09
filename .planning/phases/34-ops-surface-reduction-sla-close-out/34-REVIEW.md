---
phase: 34-ops-surface-reduction-sla-close-out
reviewed: 2026-10-09T17:26:49Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - AGENTS.md
  - docker-swarm.yml
  - docker-compose.traefik.yml
  - scripts/traefik-edge-scan.sh
  - spec/jasmine/03-RsakeySpec.js
  - ~/Repositories/thinx-swarm/traefik.yml
  - ~/Repositories/thinx-swarm/traefik/tls.toml
  - ~/Repositories/thinx-swarm/thinx.yml
  - ~/Repositories/thinx-swarm/registry.yml
  - ~/Repositories/thinx-swarm/restart.sh
  - ~/Repositories/thinx-swarm/thinx.sh
  - ~/Repositories/thinx-swarm/traefik.sh
  - ~/Repositories/thinx-swarm/README.md
findings:
  critical: 0
  warning: 6
  info: 8
  total: 14
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-10-09T17:26:49Z
**Depth:** standard
**Files Reviewed:** 13 (diff ranges: thinx-device-api `aad7e7c1..HEAD`, thinx-swarm `b04f066..HEAD`)
**Status:** issues_found

## Summary

I reviewed the Phase 34 edge changes: log level and JSON access log, the socket-proxy plus the `traefik-socket`
overlay, tls-config-3 (file-provider `security-headers`, Go-default curves), the redirect-only `:80` routers for db and
registry, the D-18 credential flow in `restart.sh`/`thinx.sh`, the CouchDB port and `removeheader` fixes, the
edge-scan host list, and the rewritten `03-RsakeySpec`.

Checks that passed:
- **No secret literals.** `git log -p` over both diff ranges, and `git grep` at both HEADs, contain no apr1, bcrypt or
  `{SHA}` hash, no `basicauth.users=` literal, and no password. Only the removed `$(openssl passwd -apr1)` prompt lines
  match.
- **Device ports stay plaintext.** `:7442`, `:1883` and `:8883` are still direct-published in `thinx.yml`.
  `thinx-api-http` still has no middleware, and no entrypoint-level redirect was added. Every other `:80` router in
  thinx-swarm is now `https-redirect`.
- **Socket-proxy allow-list.** wollomatic anchors every `-allow*` regex with `^…$` (upstream README), so the GET
  pattern cannot match `/secrets`, `/configs`, `/containers/…`, `/services/<id>/logs` or `/nodes/<id>/../…`. Only
  GET and HEAD are configured, so every write method is refused.
- **Guard ordering in `thinx.sh`.** The `HASHED_PASSWORD` guard runs before `docker stack rm`. A non-interactive
  `${VAR:?}` failure exits the script.
- **`$` in apr1 hashes.** `export $(cat file)` does not apply parameter expansion to the substituted text, so a bare
  `$apr1$salt$hash` line survives intact. I verified this with a synthetic value. The `docker stack deploy`
  interpolation does not re-scan inserted values either.
- **Repo parity.** `docker-swarm.yml` and `thinx.yml` carry the same Traefik label set. `check-traefik-mirror.js`
  prints `MIRROR OK`, and the static command has 24 flags, matching the docs.

Remaining concerns:
- **Credential loader.** The guard does not catch a stale value inherited from the calling shell, or a quoted or
  `$$`-escaped hash. An unreadable `.env` makes the scripts print the whole exported environment.
- **Socket-proxy endpoint name.** The bare DNS name `socket-proxy` is not unique across Traefik's two networks.
- **`influx-auth`.** It did not get the `removeheader` fix that `couch-auth` got.
- **Edge scan.** The scan no longer probes the historic dashboard hostname.
- **RSA spec.** It writes and keeps real key material, in `~/.ssh` when `ENVIRONMENT=development`.

## Warnings

### WR-01: The `.env` loader can deploy a stale or malformed credential, and prints the whole environment when the file is unreadable

**File:** `~/Repositories/thinx-swarm/restart.sh:3-7`, `~/Repositories/thinx-swarm/thinx.sh:3-7` (then `thinx.sh:11` `docker stack rm`)

**Issue:** The new guard `: "${HASHED_PASSWORD:?…}"` only proves that *some* non-empty value is in the environment. I
reproduced three failure paths in a scratch shell using synthetic values:
1. **Inherited stale value.** If the operator's shell still exports `HASHED_PASSWORD` (the pre-Phase-34 flow told
   operators to `export HASHED_PASSWORD=$(openssl passwd -apr1)`) and the `.env` line is missing or unreadable, the
   guard passes with the stale value. The script then redeploys the old, possibly historic, credential onto
   `couch-auth` and `influx-auth`. In `thinx.sh` this happens after `docker stack rm`.
2. **Unreadable or empty `.env` runs a bare `export`.** The file is `600 root` since this phase, so a non-root run,
   a missing gluster mount, or an empty file makes `$(cat …)` expand to nothing. A bare `export` prints every
   exported variable of the invoking shell to stdout, before the guard fires. Any secrets in the operator's
   environment end up in the terminal or in a captured log.
3. **Malformed hash passes the guard.** A quoted value (`HASHED_PASSWORD='$apr1$…'`, a common `.env` style) keeps its
   quotes, because quote removal does not apply to command-substitution output. A compose-style `$$apr1$$…` line keeps
   both dollars. Both pass the guard, `thinx.sh` removes the stack, and the redeploy installs an unparseable basicauth
   user. db and influx then reject every login. The comment's claim "a missing hash cannot leave the stack down" holds
   only for the empty case.

The naive fix (`set -a; . .env`) is wrong. Sourcing would expand `$apr1`, `$salt` and the rest, and corrupt the hash.

**Fix:**
```bash
ENV_FILE=/mnt/gluster/thinx/.env
[ -r "$ENV_FILE" ] || { echo "cannot read $ENV_FILE (run as root)" >&2; exit 1; }
unset HASHED_PASSWORD                                  # never inherit from the caller
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|\#*) continue ;; esac
  k=${line%%=*}; v=${line#*=}
  [[ $k =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$k=$v"   # literal, no expansion
done < "$ENV_FILE"
export USERNAME="admin"
[[ ${HASHED_PASSWORD-} =~ ^\$apr1\$[./0-9A-Za-z]{1,8}\$[./0-9A-Za-z]{22}$ ]] \
  || { echo "HASHED_PASSWORD missing or not a bare apr1 hash in $ENV_FILE" >&2; exit 1; }
```
Put this before `docker stack rm` in `thinx.sh`, and use the same block in `restart.sh`.

### WR-02: The Traefik provider endpoint `tcp://socket-proxy:2375` is not unique, because Traefik also sits on the shared `traefik-public` network

**File:** `~/Repositories/thinx-swarm/traefik.yml:81` (plus the mirror `docker-compose.traefik.yml`); the live service uses the `alias socket-proxy` described in `README.md:79-80`

**Issue:** `traefik_traefik` is attached to both `traefik-public` and `traefik-socket`. Docker's embedded DNS resolves a
bare name on every network the container is attached to and returns the first match. Any service named or aliased
`socket-proxy` on `traefik-public` therefore competes with the real proxy. `socket-proxy` is the canonical name in the
wollomatic and Tecnativa examples, and the operator does not state who owns some of the external stacks on that
network (igraczech, syxra). Such a service could be a dozzle/Traefik helper from another stack, or a malicious
deployment. Traefik would then take its whole routing table from that endpoint:
- An accidental collision makes the provider fail, and the next Traefik restart comes up with no swarm routers.
- A hostile endpoint can return fabricated services and labels. That can re-route `rtm.thinx.cloud` or strip
  `couch-auth` from the db router.

`-allowfrom` on the real proxy does not help, because the rogue endpoint is a different process.

**Fix:** Point the provider at a name that is unique across the cluster and cannot appear on `traefik-public`. Use
the full service name, `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375`, or a deliberately unusual alias
used only on `traefik-socket`, such as `thinx-edge-docker-api`. Update the README/AGENTS health commands to match, and
add a runbook check that `getent hosts <name>` inside the Traefik task returns only a `10.234.34.x` address.

### WR-03: `influx-auth` still forwards the edge Basic credential to InfluxDB; the `removeheader` fix was applied only to `couch-auth`

**File:** `~/Repositories/thinx-swarm/thinx.yml:494-496`, `docker-swarm.yml:566-567`

**Issue:** D-18 rotated a single credential that both middlewares share, and this phase added
`basicauth.removeheader=true` to `couch-auth`. The comment explains that otherwise the backend reads the edge header
as its own login. `influx-auth` has the same shape but no `removeheader`. Every authenticated request to
`influx.thinx.cloud` therefore hands InfluxDB the base64-encoded plaintext of the freshly rotated edge password.
InfluxDB 2 treats `Authorization: Basic` as a v1-compat or sign-in credential: it may log failed attempts or accept
the edge pair as a database login if the names collide. Clients also cannot send their own `Authorization: Token …`
through the edge.

**Fix:** Add the same label in both files, repo-first, then apply it with one live `--label-add` on
`thinx_influxdb`:
```yaml
        - "traefik.http.middlewares.influx-auth.basicauth.removeheader=true"
```

### WR-04: The edge scan dropped `micro.thinx.cloud`, which is exactly the host where the public dashboard used to live

**File:** `scripts/traefik-edge-scan.sh:49-50`

**Issue:** `micro.thinx.cloud` was removed from `HOSTS`. The reason given is that its ACME entry was pruned and it now
"serves the default certificate", which means DNS still points it at the edge. Phase 33 removed the public dashboard
routers on that hostname, and the `api-exposed`, `dashboard-open` and `dashboard-401` probes were the regression gate
for them. Traefik router matching does not depend on having a valid certificate. If someone re-adds a
`Host(micro.thinx.cloud)` dashboard router (for example by restoring old labels), it serves over the default
certificate, an attacker only needs `curl -k`, and the scan no longer looks there. The host was dropped only because
the strict-TLS curl would fail (`rc=60`), not because the exposure check stopped mattering.

**Fix:** Keep the retired host in a separate list that only gets the exposure probes, run with `-k`. Fail if it
answers `.http` JSON or the `APIUrl` dashboard signature:
```bash
RETIRED_HOSTS="micro.thinx.cloud"
for H in $RETIRED_HOSTS; do
  body=$(curl -sk -m 15 "https://$H/api/overview"); rc=$?
  [ $rc = 0 ] || { echo "FAIL api-exposed $H unchecked: curl rc=$rc"; fail=$((fail+1)); continue; }
  printf '%s' "$body" | jq -R -s -e '(try fromjson catch null)|if type=="object" then .http!=null else false end' >/dev/null 2>&1 \
    && { echo "FAIL api-exposed $H"; fail=$((fail+1)); }
  curl -sk -m 15 "https://$H/dashboard/" | grep -q APIUrl && { echo "FAIL dashboard-open $H"; fail=$((fail+1)); }
done
```

### WR-05: `03-RsakeySpec` writes real encrypted deploy keys and never removes them; in development the target is the user's real `~/.ssh`

**File:** `spec/jasmine/03-RsakeySpec.js:32,38-46,119-136` (target directory from `lib/thinx/globals.js:295-297`)

**Issue:** `RSAKey` writes to `Globals.app_config().ssh_keys`, which `globals.js` sets to `process.env.HOME + "/.ssh"`
whenever `ENVIRONMENT=development`. The rewritten spec deliberately keeps `first_key` ("must survive every revocation
below"). Tests (06) and (07) create two more 4096-bit key pairs, and there is no `afterAll` cleanup. Each local run
leaves three private keys plus `.pub` files in the developer's real `~/.ssh`, encrypted with `GIT_KEY_PASSPHRASE`, and
they accumulate across runs. Before the fix, the positional-revocation bug happened to delete one of these keys;
correcting the revocation made the leak strictly larger. On CI the directory is the ephemeral `/mnt/data/ssh_keys`,
so only local runs are affected. Test (13), `purgeOrphanedKeys`, also reads whatever has accumulated there.

**Fix:** Point `rsakey.ssh_keys` at a per-run temp directory, as `spec/node/DeployKeyNames.test.js:13` already does.
Alternatively, record every filename the spec creates and revoke them in `afterAll`:
```js
const os = require("os");
beforeAll(() => { rsakey.ssh_keys = fs.mkdtempSync(path.join(os.tmpdir(), "rsakey-spec-")); });
afterAll(() => fs.rmSync(rsakey.ssh_keys, { recursive: true, force: true }));
```
Test (12), "should discover key owners from the key directory", keeps working because (300) writes into the same
temp directory.

### WR-06: The stored apr1 hash lives in a file that is bind-mounted into the root-running `thinx_worker`, so "no non-root reader exists" overstates the protection

**File:** `AGENTS.md:62-65`, `~/Repositories/thinx-swarm/README.md:136-139` (claim); `~/Repositories/thinx-swarm/thinx.yml:442` (`/mnt/gluster/thinx:/mnt/data/thinx` on the worker)

**Issue:** Phase 34 changed the hash from "typed at deploy time, never stored" to "persisted in
`/mnt/gluster/thinx/.env`". That file sits inside the directory that `thinx_worker` mounts wholesale. The worker
image (`services/worker/Dockerfile`, `dhi.io/node:26-alpine3.24-dev`, no `USER`) runs as root and processes build
jobs, so the `600 root:root` mode gives no protection against that container. The hash is apr1 (MD5-based, 1000
rounds). Once read, it can be brute-forced offline cheaply, and the password guards both `db.thinx.cloud` (CouchDB,
Fauxton) and `influx.thinx.cloud`. The docs tell operators the file has no other reader, which steers future reviews
away from this exposure.

**Fix:** Move the deploy-time secret out of the mounted tree, for example `/root/thinx-deploy.env` (600 root) read by
`restart.sh`/`thinx.sh`. Alternatively, narrow the worker mount to the subdirectories it needs (`deploy`, `repos`, and
whatever else it actually uses) instead of all of `/mnt/gluster/thinx`. Correct the AGENTS/README sentence to match.
Separately from D-18's apr1 choice: Traefik `basicauth` accepts bcrypt (`htpasswd -nbB`), which would make an offline
attack on a leaked hash impractical.

## Info

### IN-01: `-allowhealthcheck` is inert, so `1/1` is liveness only

**File:** `~/Repositories/thinx-swarm/traefik.yml:174`; `README.md:90`; `AGENTS.md:53`

**Issue:** The flag only starts the `127.0.0.1:55555/health` listener for the bundled `./healthcheck` binary. The
service has no `healthcheck:` block, and the upstream image (`FROM scratch`) has no `HEALTHCHECK`, so Swarm never runs
it. The documented pre-restart gate, "proxy is `1/1`", therefore only proves that the process is running.
`-stoponwatchdog` partly covers loss of the socket.

**Fix:** Add `healthcheck: { test: ["CMD", "/healthcheck"], interval: 30s, timeout: 5s, retries: 2 }`, or drop the
flag.

### IN-02: The docker group ID `998` is hard-coded in `user: "65534:998"`

**File:** `~/Repositories/thinx-swarm/traefik.yml:179-180`

**Issue:** If the socket's group ever differs (a package reinstall, a rebuilt node, or the `Traefik` label moving), the
proxy cannot open the socket and the watchdog crash-loops it. Combined with the "restart while proxy down = no routers"
failure mode, that turns a routine Traefik restart into an outage.

**Fix:** Have `traefik.sh` (and the runbook's `service create`) derive the group with
`stat -c %g /var/run/docker.sock` and assert that it matches before the cutover, or interpolate
`user: "65534:${DOCKER_GID:?}"`.

### IN-03: The `:ro` socket bind is described as part of the protection

**File:** `~/Repositories/thinx-swarm/README.md:81`, `traefik.yml:163-166`

**Issue:** A read-only bind mount of a Unix socket does not restrict the Docker API. `connect()` and write methods
still work, and the proxy's group membership gives it full engine access. The anchored GET/HEAD regex is the only
control. The wording invites someone to "simplify" the allow-list on the assumption that `:ro` backs it up.

**Fix:** State explicitly that `:ro` is cosmetic and that the allow-list is the security boundary.

### IN-04: The allow-list still returns full service and task specs, including interpolated env secrets and the basicauth hash labels

**File:** `~/Repositories/thinx-swarm/traefik.yml:172`

**Issue:** `GET /services` and `/tasks` are the swarm provider's minimum, and their responses include
`ContainerSpec.Env`, for example the worker's `WORKER_SECRET=${WORKER_SECRET}` (`thinx.yml:434`), and the
`basicauth.users` labels. This is not a regression, because Traefik previously had the raw socket. It is the residual
exposure if Traefik is compromised, and it is worth a line in the socket-proxy ops section so nobody adds a second
consumer of the proxy.

**Fix:** Document only.

### IN-05: Stale comments in `traefik.yml` contradict the new state

**File:** `~/Repositories/thinx-swarm/traefik.yml:49-52`, `128-129` (mirrored in `docker-compose.traefik.yml`)

**Issue:**
- Lines 49-52 still list `security-headers` among the shared swarm middlewares that the port-only service keeps
  alive, but it is now `@file`.
- Lines 128-129 still say the TLS default is "X25519/P-256", but `curvePreferences` was removed.

**Fix:** Update both comments.

### IN-06: AGENTS.md opens the edge section with "no basic-auth credential anywhere"

**File:** `AGENTS.md:27`

**Issue:** The same section later documents the rotated `couch-auth`/`influx-auth` basic-auth credential (lines
61-65), so the opening sentence contradicts it.

**Fix:** Scope the opening sentence to the dashboard/API: "no basic-auth credential on any dashboard/API route".

### IN-07: `tls.toml` now carries both TLS options and the entrypoint-default middleware

**File:** `~/Repositories/thinx-swarm/traefik/tls.toml:26-35`; `README.md` § TLS options, step 2

**Issue:** Before this phase, a malformed `tls.toml` only fell back to Go's TLS defaults. Now a parse error also removes
`security-headers@file`, which every `:443` router references through the entrypoint default, so every HTTPS router
errors. The rotation procedure's step 2 only verifies byte equality, not that the file parses.

**Fix:** Add a parse check before the `--config-add`, for example the boot-and-discover throwaway probe from
`traefik-v3-cutover.md`, or a TOML lint of the file.

### IN-08: The spec documents, but does not track, a filename collision in `RSAKey.create`

**File:** `spec/jasmine/03-RsakeySpec.js:75-76` (library: `lib/thinx/rsakey.js:233-241,286-288`)

**Issue:** Keys are named `<owner>-<Date.now()>`. Two concurrent `create()` calls for one owner in the same
millisecond, for example a double-clicked console button, would make the second `writeFileSync` silently replace a
key the first caller already returned. The spec works around this by running sequentially, but no todo records it.

**Fix:** Open a todo to make the identifier collision-proof (timestamp plus random suffix, or `wx` open flags with
retry).

---

_Reviewed: 2026-10-09T17:26:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
