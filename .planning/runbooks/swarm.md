# Swarm Operations Runbook

Operator-facing recovery procedures for the THiNX production swarm host `micro`.

**SSH connection:** `ssh micro`

> `micro` and `core` are the SSH aliases in the operator's `~/.aliases`; host, port, user and
> key live there rather than in this public repository.
**Deploy script (manual escape hatch):** `/mnt/gluster/deployment/swarm/restart.sh`
**Stack file location:** `/mnt/gluster/deployment/swarm/` (`docker-swarm.yml`, `thinx.yml`, etc.)

---

## Swarm Auto-Pull Recovery (Phase 3 / OPS-01 — landed 2026-05-26)

**Symptom signature** (all of):
- `https://swarmpit.thinx.cloud` returns **Bad Gateway (502)** via Traefik.
- `docker service logs swarmpit_app --since 30m` is **empty** (zero application log lines from the watcher for an extended window).
- CircleCI (`api-registry` job on `thinx-staging`) builds and pushes `registry.thinx.cloud:5000/thinx/api:swarm` to the private registry successfully, BUT `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` continues to show the OLD digest — i.e., the swarm is not picking up the new image.
- The swarmpit_app container itself is **Running** (no exit, no restart loop) — only the application inside has gone silent. This distinguishes the silent-watcher pattern from a crash/restart loop.

### Rung 1 — Force-restart swarmpit_app (default first move)

```bash
ssh micro "docker service update --force swarmpit_app"
```

Wait about 3–4 minutes. Swarmpit 1.10 (JDK 17) needs about 2 minutes to listen at its 0.25 CPU
limit, its healthcheck has a 300 s start period, and the first autoredeploy poll runs 60 s after
boot. Since Phase 28 the stack has no InfluxDB.

**Verify recovery:**
```bash
ssh micro \
  "curl -s -o /dev/null -w '%{http_code}\n' https://swarmpit.thinx.cloud"
# expect: 200

ssh micro \
  "docker service logs swarmpit_app --since 2m --tail 50"
# expect: startup banner + "Swarmpit running on port 8080" + "Docker SOCK: /var/run/docker.sock"
```

**SLA verification — end to end (Phase 34 / EDGE-OPS-03, D-12).** The budget is **300 s from `git push` to the
first response served through Traefik by the new `thinx_api` task**. It replaces the older push_end → task Running
stop condition, which is kept below as one leg. Gate mechanics (readiness, diff hygiene, NO-MEASUREMENT rule) follow
§ Gate procedure in `.planning/runbooks/swarmpit-upgrade.md`.

**Phase 34 result: `sla_verdict: OPEN-GAP`** (2026-10-09). Run 1 was NO-MEASUREMENT: CircleCI `test` was red on
v1.16 `03-RsakeySpec`, so no `api-registry` ran, and CircleCI itself was degraded. No total and no leg was measured, so
EDGE-OPS-03 (ROADMAP Phase 34 criterion 3) is **open**. Re-measure on the next green edge-change deploy with the
recipe below and record it as `### P34 SLA run 2` in `.planning/runbooks/traefik-edge-hardening.md`.

**When to re-measure (preconditions, all read-only):**

```bash
# 1. thinx-staging tip is green: the last `test` job of the branch tip succeeded (not merely "fixed" locally).
curl -s 'https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/tree/thinx-staging?limit=30&shallow=true' \
  | jq -r '.[] | select(.workflows.job_name=="test" or .workflows.job_name=="api-registry") | "\(.workflows.job_name) \(.status) \(.vcs_revision[0:12])"' | head -4
# expect: the newest `test` (and `api-registry`) `success` on the current origin/thinx-staging SHA; 0 jobs running/queued
# 2. https://status.circleci.com shows no degradation for "Pipelines & Workflows" / "Docker jobs".
# 3. Swarmpit ready: >= 60 s since its last start, autoredeploy polling.
ssh micro "curl -s https://swarmpit.thinx.cloud/version; C=\$(docker ps -q -f label=com.docker.swarm.service.name=swarmpit_app | head -1); timeout 20 docker logs --since 30m \$C 2>&1 | grep -c autoredeploy"
# expect: the version JSON; a non-zero count
# 4. Pre-state: current thinx_api task, digest, and the traefik-public address the edge uses.
ssh micro "docker service ps thinx_api --no-trunc --filter desired-state=running --format '{{.ID}} {{.Image}}'; \
  C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); \
  docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/services/thinx-api@swarm | jq -c '[.loadBalancer.servers[].url]'"
```

**Which commit to push:** a signed, non-empty evidence commit on `thinx-staging` that contains no skip-ci marker and
carries the run's readiness block (the `### P34 SLA run 2` heading in the edge runbook is enough). If the fix that turns
`test` green is itself unpushed on `thinx-staging`, the push that carries it is the sample. Every commit in
`origin/thinx-staging..HEAD` gets the same diff-hygiene scan as any SLA push. Push `thinx-staging` only, never `main`.

```bash
T_PUSH=$(node -e 'console.log(new Date().toISOString())'); git push origin thinx-staging; SHA=$(git rev-parse HEAD)
# the clock starts at T_PUSH (immediately before the push) and is never moved

# L1 — CI: poll (<= 40 x 30 s) for the SHA's api-registry job, then read its "Push to private registry" step.
curl -s 'https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/tree/thinx-staging?limit=100&shallow=true' \
  | jq -r --arg s "$SHA" '.[] | select(.vcs_revision==$s and .workflows.job_name=="api-registry") | "\(.build_num) \(.status)"'
curl -s "https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/<build_num>" \
  | jq -r '.steps[].actions[] | select(.name|startswith("Push to private registry")) | "\(.end_time) \(.output_url)"'
# PUSH_END = end_time; DIGEST = `curl -s <output_url> | jq -r '.[].message' | grep -o 'digest: sha256:[0-9a-f]\{64\}' | tail -1` (keep 12 hex)
# a red test / api-registry = NO-MEASUREMENT (record it; one more evidence commit allowed)

# L2 — deploy: the new thinx_api task carrying DIGEST, its RFC3339 Running timestamp and its traefik-public address.
ssh micro "T=\$(docker service ps thinx_api --no-trunc --filter desired-state=running --format '{{.ID}} {{.Image}}' | grep <DIGEST12> | cut -d' ' -f1); \
  docker inspect \$T --format '{{json .Status.Timestamp}} {{.Status.State}}'; \
  docker inspect \$T | jq -r '.[0].NetworksAttachments[] | select(.Network.Spec.Name==\"traefik-public\") | .Addresses[0]'"
# expect: T_RUNNING (always {{json …}}, Docker's default date form gave Phase 27 a false delta); NEWIP/24

# L3 — edge: the first 2xx/3xx Traefik JSON access-log line served by the new task (the "served via the edge" marker).
# Read it with `docker logs` of the Traefik CONTAINER on micro — `docker service logs` hangs on micro; always bound it with timeout.
ssh micro "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); \
  timeout 30 docker logs --since <T_RUNNING minus 10 s> \$C 2>&1 | grep '^{' \
  | jq -r 'select((.RouterName // \"\")|startswith(\"thinx-api\")) | select(.ServiceAddr==\"<NEWIP>:7442\") | select(.DownstreamStatus>=200 and .DownstreamStatus<400) | .StartUTC' | sort | head -1"
# expect: T_SERVED. ServiceAddr, RouterName, DownstreamStatus and StartUTC are retained JSON fields (RequestPath/RequestLine are dropped).
# Keep traffic flowing during the run (a 2-s curl loop on https://app.thinx.cloud/ from the laptop) so the marker appears promptly.
# corroborate: thinx-api@swarm servers == ["http://<NEWIP>:7442"]; rtm / and /api/v2/csrf-token 200; WS 101 on rtm; loopback 29/0; 7442 OPEN
```

Compute in integer seconds: L1 = PUSH_END − T_PUSH, L2 = T_RUNNING − PUSH_END, L3 = T_SERVED − T_RUNNING,
total = T_SERVED − T_PUSH. **PASS iff total ≤ 300 s.** On a miss run once more (D-13), then record the verdict with the
slowest leg named. Record `sla_run_N: push=… push_end=… running=… served=… L1=…s L2=…s L3=…s total=…s verdict=… sha=… digest=…`,
`served_marker: router=… ServiceAddr=<NEWIP>:7442 status=… StartUTC=…`, and replace the OPEN-GAP lines
(`sla_verdict:`, `edge_ops_03_status:`) with the measured result. A FAIL stays an open gap unless the operator explicitly
accepts the measured total.

Expectation from the 2026-10-08 CircleCI history: git push → api-registry push_end alone was ~285–301 s in three samples
(test ~2m15–2m25, api-registry queue ~50 s, build ~60–70 s), so L1 alone is likely to use the whole budget.

History (push_end → task Running only, the L2 leg — not the end-to-end verdict): Phase 3 **63 s** (then against Docker
Hub); Phase 28 32 s on Swarmpit 1.9, 31 s after the stats stack was removed and 50 s on Swarmpit 1.10 (private
registry). Phase 34: not measured (OPEN-GAP above).

**Rollback** (if Rung 1 makes things worse):
```bash
ssh micro "docker service rollback swarmpit_app"
```

### Rungs 2-4 — Escalation ladder (operator-gated)

If Rung 1 doesn't restore autoredeploy, the next moves are documented in detail at
`.planning/phases/03-swarm-auto-pull/03-PLAN.md` (Tasks 4-6). Each requires operator approval at a `checkpoint:human-verify` gate because the blast radius escalates:

- **Rung 2 — Rebuild swarmpit_db (CouchDB 2.3.0):** Loses Swarmpit internal history (task event log, watcher state); Swarmpit re-derives operational state from Docker on first boot. Best-effort `_all_docs` backup before applying.
- **Rung 3 — Stale-node membership cleanup:** Removes the phantom peer `b356ad8e1d60` / `10.133.0.4` from the memberlist gossip layer. **Risk:** swarm-fabric perturbation; only attempt on a low-traffic window. See OPS-02 in `.planning/REQUIREMENTS.md`.
- **Rung 4 — Upgrade Swarmpit (done in Phase 28, 2026-10):** Swarmpit runs `swarmpit/swarmpit:1.10` by tag with a stack-file healthcheck override (300 s start period). swarmpit_db stayed `couchdb:2.3.0` with no migration, and the stats stack (`swarmpit_influxdb` and its volume) was removed. Procedure, evidence and rollback: `.planning/runbooks/swarmpit-upgrade.md`. A future upgrade follows the same runbook: pin a specific tag, back up `swarmpit.yml` first.

**Final fallback** (if Rungs 1-4 all fail): document `./restart.sh` as the canonical operator action and ship without autoredeploy. Path C in `phases/03-swarm-auto-pull/03-CONTEXT.md` `<domain>`.

### Phase 3 close-out reference

Root cause + reversion plan + full verification matrix:
- `.planning/phases/03-swarm-auto-pull/03-SUMMARY.md`

Evidence:
- `.planning/phases/03-swarm-auto-pull/03-BASELINE.txt` — pre-fix state + Rung 1 application timestamps
- `.planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt` — wall-clock SLA test evidence (delta=63s)

---

## Phase 17 / OPS-EXEC-03 — Influx fix production deploy (v1.11, 2026-06-06)

**Resolution: discrepancy branch — fix already live, no rollout applied.**

- **Operator:** MS (autonomous agent run, operator-authorized SSH). **UTC:** 2026-06-06.
- **Target:** roll influx stats fix `9b6d931c` (quick-task `260605-inf`) to prod.
- **Finding:** `thinx_api` had already autoredeployed `thinxcloud/api:latest` (pipeline 5266) ~17h prior. The deployed `lib/thinx/influx.js` already contained the full fix — `count("value")`, `WHERE "owner"=…`, `time > '<ISO>'`, `time > now() - 7d`. App version `1.9.3054`. No force-rollout was applied (re-rolling an identical healthy image is pure restart risk).
- **Co-location note (supersedes prior assumption):** `thinx_api` is pinned to **micro** via `[node.hostname==micro]`, and `thinx_mosquitto` runs on **micro** too — co-location holds on `micro`, not `core` as previously assumed. A force-update keeps `thinx_api` on micro (constraint-pinned), so MQTT co-location is safe. `thinx_influxdb` runs on **core** and is reached by `thinx_api` over the overlay (`http://thinx_influxdb:8086`).

**Verification matrix (evidence in `.planning/phases/17-influx-fix-production-deploy/deploy-{pre,post,probe}.txt`):**

| Check | Result |
|-------|--------|
| Deployed `influx.js` has the fix | ✅ owner-tag + count() + ISO/`now()-7d` predicates present |
| `found BADSTRING` in logs (15m / 24h) | ✅ 0 / 0 |
| influx/query-parse errors (1h) | ✅ 0 |
| `DEVICE_CHECKIN` count last 7d (dashboard check-in number) | ✅ 16 (non-zero) |
| `owner` tag exists on measurements | ✅ tag keys = [data, owner] |
| `thinx_api` co-located with `thinx_mosquitto` | ✅ both on micro (api pinned via constraint) |
| MQTT connack-timeout spam | ✅ none |

**If a future re-deploy IS needed** (e.g. after pushing Phases 15/16): `docker service update --force thinx_api` re-pulls `:latest`; the `[node.hostname==micro]` constraint keeps it co-located with mosquitto. Rollback: `docker service rollback thinx_api`.

---

## Traefik Edge Source of Truth (Phase 29 / EDGE-RECON-01 — 2026-10-06)

The Traefik edge config has **one documented, one-way source-of-truth chain**. Each node is
derived from the one above it; edits flow downward only.

1. **ULTIMATE source of truth — live on `micro`.** Entered via the `thx` alias into the swarm
   deploy folder `/mnt/gluster/deployment/swarm/`. The *authoritative* capture is the running
   task, not the on-disk file (D-08):

   ```bash
   ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'"
   # expect: the resolved static command incl. --entrypoints.thxp.address=:7442 (AGENTS.md keep-7442)
   ```

2. **COMMITTED source of truth — the private `thinx-swarm` repo** (`traefik.yml` +
   `traefik/tls.toml`). Reconciled to equal live in Phase 29 (D-01, production wins); warts
   preserved deliberately (see `traefik-edge-fixforward.md`). This is the repo you edit for a real
   edge change.

3. **Generated READ-ONLY mirror — `thinx-device-api/docker-compose.traefik.yml`.** Produced by
   `scripts/generate-traefik-mirror.js` from `thinx-swarm`, secrets redacted, banner-stamped
   `GENERATED — do not edit. source: thinx-swarm@<sha>`. **Never hand-edit it** — it exists for
   visibility in this repo, not for deploy.

**Anti-drift enforcement (D-03).** `scripts/check-traefik-mirror.js` verifies the mirror's banner
SHA + body hash, and (with `--swarm-repo`) that it matches the recorded `thinx-swarm` HEAD. The
CircleCI **"Traefik mirror staleness (EDGE-RECON-01)"** step runs it and **fails the build** if the
mirror drifts:

```bash
node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm
# expect: "MIRROR OK files=1" (exit 0); non-zero on MIRROR-EDITED / MIRROR-STALE / MISSING
```

**ACME storage (authoritative path).** The live certificate store is the named Docker volume
`/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json` on `micro` (confirmed
by `services/traefik/update.sh`). The dead app-repo path `/traefik/acme.json` is a historical drift
signal only (recorded in `swarm-configs/traefik-edge-diff.2026-10-06.md`).

**Pre-Phase-30 rollback baseline (out-of-git, D-11).** A faithful copy of the current working edge
is stored out-of-git on `micro`, mode 600 (dir 700, root-owned):

```bash
ssh micro "stat -c '%a %U' /mnt/data/edge-rollback/traefik-2026-10-06/acme.json"
# expect: 600 root
# dir also holds resolved-snapshot.yml (resolved command/labels/env/tls.toml). NEVER commit / scp into a repo.
```

Phase-30 rollback restores certs instantly from this `acme.json` without re-triggering ACME
challenges. Deferred warts (pilot token, exposedbydefault, --api, log level, docker.sock, ACME
email) are enumerated in `.planning/runbooks/traefik-edge-fixforward.md` — none were changed in
Phase 29 (D-06, zero cleanup).

---

## Traefik Pilot-token removal + rollback demo (Phase 30 / EDGE-MIG-01 — 2026-10-07)

Phase 30 confirmed v2-syntax parity and actioned the P30-tagged warts live on `traefik:v2.11`.

**Pilot-token removal (D-04).** The inert cleartext `--pilot.token` flag was stripped from the
committed `thinx-swarm` static command and deployed live to the running `traefik_traefik` task
(v2.11 tolerates its absence; Traefik v3 would reject the flag). It is referenced **by flag name
only** — the resolved UUID value was never written to any committed artifact and lives only in the
out-of-git 600 snapshot on `micro`. Exactly one flag removed; all six entrypoints (incl. `:7442`)
and every other wart preserved. Assert the running task carries no pilot flag and still exposes the
legacy plaintext entrypoint:

```bash
ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'" | grep -c 'pilot'
# expect: 0
ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'" | grep -c 'entrypoints.thxp.address=:7442'
# expect: 1 (AGENTS.md keep-7442)
```

**Live rollback + restore cycle (D-06).** Within the P30 maintenance window the full rollback was
demonstrated end-to-end on the real service and the edge was returned to the P30 end state. The
cycle is captured, redacted, in `.planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md`:

1. Restore the snapshot `acme.json` onto the authoritative named volume, then roll the service back
   to the Phase-29 resolved command (re-introducing `--pilot.token` temporarily):

   ```bash
   ssh micro "cp -a /mnt/data/edge-rollback/traefik-2026-10-06/acme.json \
     /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"
   # expect: 600 root; certs served from the restored store with NO ACME re-challenge
   ```

2. On the OLD config, all app/console/landing routes serve over `:443`, HTTP→HTTPS redirect holds
   (console/rtm/landing `301`; `app.thinx.cloud` answers HTTP `200` by design — API host, HSTS on),
   the served cert is valid, and `:7442`/`:1883`/`:8883` accept connections.
3. Re-apply the P30 (pilot-removed) config — rebuilt as the rollback Args **minus** the pilot line,
   nothing else — and re-verify the P30 end state (0 pilot, six entrypoints incl. `:7442`, exactly
   one running task, valid cert). A belt-and-suspenders full-spec backup was also kept on `micro`
   out-of-git (`/mnt/data/edge-rollback/traefik-p30-prerolldemo-<UTC>.json`, 600 root).

   ```bash
   ssh micro "docker service ps --filter desired-state=running traefik_traefik"
   # expect: exactly one Running task (single consistent edge state at each stage)
   ```

The whole cycle is a surgical single-flag delta on the running service's resolved Args
(`docker service update --args`), with the pinned image digest (`traefik:v2.11@sha256:d57faa4f…`),
published ports (`:80`/`:443`), `admin-auth` label and `tls.toml` config unchanged throughout.

**Device/MQTT model preserved (D-02).** `:7442` (thxp) stays published directly by `thinx_api`;
`:1883`/`:8883` (mqtt/mqtts) directly by `thinx_mosquitto`; Traefik keeps publishing only
`:80`/`:443`. The `:7442` plaintext port and plain (non-TLS) MQTT kept accepting connections at
every stage of the cycle (AGENTS.md keep-7442 hard constraint).

> **Verify-command caveat.** `docker service ls --filter name=mosquitto -q` returns empty — Docker's
> service-name filter is prefix-matched and the service is `thinx_mosquitto`. Use
> `--filter name=thinx_mosquitto` (or `docker service inspect thinx_mosquitto`).

**Still deferred** per `.planning/runbooks/traefik-edge-fixforward.md`: `exposedbydefault=true`
(P33), `--api` + port 8080 (P33), ACME email/renewal + TLS min/HSTS (P33), `--log.level=ERROR`
(P34), raw `docker.sock:ro` (P34). None were touched in P30.

**Secret hygiene.** The out-of-git rollback snapshot and the pre-roll-demo spec backup stay on
`micro` at mode 600 (dir 700, root) and are **never** committed or scp'd into a repo — they hold the
resolved pilot UUID, the `admin-auth` hash, the ACME email and raw `acme.json` key material.
Committed artifacts name them by path only and redact every secret to `<redacted>`/`${VAR}`.

---

## Traefik Docker API socket-proxy (Phase 34 / EDGE-OPS-02)

**What it is.** Traefik reads the Docker API **only** through `traefik_socket-proxy` (service alias `socket-proxy`,
image `wollomatic/socket-proxy:1.13.1` by tag), via `--providers.swarm.endpoint=tcp://socket-proxy:2375`. The proxy
mounts `/var/run/docker.sock` read-only, runs as `65534:998` with a read-only root filesystem and every capability
dropped, publishes no port, and answers only a GET allow-list: `_ping`, `version`, `services`, `networks`, `tasks`,
`nodes/<id>`, plus HEAD `_ping`. Everything else gets 403 (path) or 405 (method). It lives on the **internal** overlay
`traefik-socket` (`10.234.34.0/24`, not attachable). The only members are the proxy, Traefik and the network's LB
endpoint, and `-allowfrom=10.234.34.0/24` admits only that subnet. `traefik_traefik` has **no** Docker socket mount.

**Where it is defined.** thinx-swarm `traefik.yml` (the `socket-proxy` service and `traefik-socket: external: true`)
and `traefik.sh` (creates the `traefik-socket` network with `--internal --subnet=10.234.34.0/24`). Live, it was
created by `docker network create` / `docker service create` with flags equal to the YAML (34-01 Stage B1), never by
`docker stack deploy`. The stack-namespace labels let a future bootstrap deploy adopt it.

**Failure mode.** While Traefik runs, a proxy outage leaves Traefik on its **last configuration**: existing routers
keep serving, but new or changed services (a redeployed task's new address, a label change) are **not seen** until
the proxy returns, and the provider retries. A **Traefik restart while the proxy is down starts with no swarm routers**
(404 on every swarm-routed host). Always check the proxy before any Traefik restart (`--force`, `--args`,
`--config-*` updates); every Phase 34 restart command asserted `1/1` in the same remote command.

**Health check:**

```bash
ssh micro "docker service ps traefik_socket-proxy --filter desired-state=running --format '{{.ID}} {{.Node}} {{.CurrentState}}'"
# expect: one task on micro, Running
ssh micro "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); \
  docker exec \$C wget -qO- http://socket-proxy:2375/_ping; echo; \
  docker exec \$C wget -S -O /dev/null http://socket-proxy:2375/v1.56/secrets 2>&1 | grep -m1 'HTTP/'"
# expect: OK ; HTTP/1.1 403 Forbidden   (API version: `docker version --format '{{.Server.APIVersion}}'`, 1.56 today)
ssh micro "P=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_socket-proxy | head -1); timeout 20 docker logs --since 1h \$P 2>&1 | grep -c blocked"
# expect: 0 in normal operation (every blocked line names method, URL and client; Traefik's provider never triggers one)
```

**Restart** (Traefik keeps serving its last configuration meanwhile; the proxy is back within seconds):

```bash
ssh micro "docker service update --force traefik_socket-proxy"
# expect: rc 0; new task Running; then the health check above; Traefik needs no restart
```

The image declares no healthcheck. Liveness is `-watchdoginterval=30 -stoponwatchdog`: the proxy exits if the socket
disappears and swarm restarts it (`restart_condition: any`). **Repin trigger:** the first `1.x.y` release built with
go ≥ 1.26.9 (1.13.1 carries go1.26.6 stdlib CVEs, none reachable on this plain-HTTP internal path). Rescan with a
current DB, then `docker service update --image wollomatic/socket-proxy:<new> --no-resolve-image traefik_socket-proxy`.

**One-command rollback to the raw socket.** The Stage B2 staged rollback rebuilds the Args from the pre-B2 backup
(600 root on micro, values never typed), so it restores the 23 flags as they were **before Stage B2**:

```bash
ssh micro "B=/mnt/data/edge-rollback/traefik-p34-preB2-20261009T151619Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; \
  ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); \
  docker service update --detach --network-rm traefik-socket --mount-add type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly --args \"\$ARGS\" traefik_traefik"
# expect: 23 ; rc 0; ONE restart; Mounts = socket bind (ro) + certificates; networks = traefik-public only; 29/0
```

At the Phase 34 end state that backup is stale: its https default is `security-headers@swarm`, whose labels Stage D
removed, so every `:443` router would lose its middleware. Use this form instead. It keeps the current Args and only
drops the endpoint flag:

```bash
ssh micro "ARGS=\$(docker service inspect traefik_traefik | jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(select(. != \"--providers.swarm.endpoint=tcp://socket-proxy:2375\")) | map(@sh) | join(\" \")'); \
  docker service update --detach --network-rm traefik-socket --mount-add type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE restart; args=23; provider back on the default unix socket; 29/0. Then remove the proxy only if wanted:
#   docker service rm traefik_socket-proxy && docker network rm traefik-socket
```

Take a fresh `docker service inspect traefik_traefik` backup (`umask 077`, `/mnt/data/edge-rollback/`, 600 root) before
either command. Repo first: revert thinx-swarm `fcafee0` (origin + micro ff) and regenerate the mirror (`MIRROR OK`).

---

## Related v1.x backlog items

- **OPS-02** (REQUIREMENTS.md) — Stale swarm membership entry `b356ad8e1d60` / `10.133.0.4`. Defer; cleanup is the Rung 3 procedure.
- **OPS-03** (REQUIREMENTS.md) — Malformed image-tag specs on `thinx_chronograf` / `thinx_couchdb` / `thinx_influxdb` / `thinx_worker` cause autoredeploy HTTP 400 on those services. Pre-existing config issues unrelated to OPS-01.

---

*Runbook initialized: 2026-05-26 (Phase 3 close-out)*
*Maintained alongside `AGENTS.md` (local-only session notes; gitignored) — this file is the canonical, committed source for swarm operational procedures.*
