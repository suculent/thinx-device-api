# Phase 28: Swarmpit Upgrade & Trim - Research

**Researched:** 2026-10-04 (live swarm read 21:43–21:50 UTC, read-only)
**Domain:** Docker Swarm operations: Swarmpit 1.9 → 1.10, removal of the stats stack, registry-triggered autoredeploy SLA
**Confidence:** HIGH for the source and live-state findings. MEDIUM for the 1.10 runtime behaviour on this swarm, which has not been trialled.

## Summary

Neither STOP condition fires. Both nodes run **Docker Engine 29.8.1** (API 1.56, minimum API 1.40), so the D-02 29.0–29.2 branch does not apply and the D-01 order holds: trim on 1.9 first, then upgrade. D-02 rested on one wrong premise, though. 1.9's built-in default API of 1.30 is **already below this engine's floor of 1.40**. Production runs 1.9 only because the live stack already sets `SWARMPIT_DOCKER_API=1.44` (and `DOCKER_API_VERSION=1.44`). The pin is existing state, not a new workaround, and it must **stay** through both steps. Removing it would break 1.9. On 1.10 it keeps the client API constant across the upgrade; without it, 1.10 would renegotiate to the engine's 1.56.

D-06 passes cleanly, with more margin than the decision assumed. Swarmpit 1.10's CouchDB migration set is **byte-identical to 1.9's** (`src/clj/swarmpit/couchdb/migration.clj` is unchanged between the tags). All three migrations (`single-node-setup`, `initial`, `change-reg-types`) are already recorded in production `swarmpit_db`, so 1.10 writes **no** schema change. The upstream 1.10 compose file still pins `couchdb:2.3.0`. That makes the D-06 "one-way" note moot in practice: rolling back to 1.9 does not need the dump restored. Take the D-07 dump anyway. There is **no swarmpit/agent release matching 1.10**: the last versioned tag is `2.2` (2020), the 1.10 compose references `swarmpit/agent:latest`, and production already runs `latest` at the current Hub digest. Per D-04 the agent is left unchanged and the reason recorded.

D-11a is answered **yes**. `.circleci/config.yml` has no path filter, and the image changes on every commit (`COPY . .` with no `.planning` exclusion, plus `ENV COMMIT_SHA`). It has already happened once: the `.planning`-only range `05f9d260..39db09f1` ran `api-registry` #15597 to success on 2026-10-03. The SLA clock can be read precisely, without credentials, from CircleCI's public v1.1 API: the `Push to private registry (thinx/api:swarm)` step `end_time` gives the start, and the step log carries the pushed digest. The new task's `.Status.Timestamp` gives the end. The last production deploy measured **~31 s** from push to Running.

**Primary recommendation:** run Step 0 (read-only gate, dump, rung-1 staged), then Step A (drop `SWARMPIT_INFLUXDB`, `docker service rm swarmpit_influxdb`), then Step B (`swarmpit/swarmpit:1.10` with a **healthcheck override**). Deploy every step with `docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit` from the gluster swarm directory. Prove "untouched" by unchanged task IDs on `swarmpit_db` and `swarmpit_agent`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Upgrade order & target
- **D-01:** Order (Claude's discretion, see below): **trim first on the known 1.9, then upgrade.** Step A removes `swarmpit_influxdb` (unset `SWARMPIT_INFLUXDB` on `swarmpit_app`, remove the service). Step B upgrades app and agent to 1.10.
- **D-02:** **Engine gate.** The first step reads `docker version --format '{{.Server.Version}}'` on `micro` and `core`. If either is Docker Engine **29.0–29.2**, which rejects 1.9's default API 1.30, the 1.10 upgrade runs **first** and the trim after it. Do not pin `SWARMPIT_DOCKER_API` on 1.9 as a workaround.
- **D-03:** Image reference is the **version tag `swarmpit/swarmpit:1.10`**, not an `@sha256` digest. This matches the tag-not-digest policy set for InfluxDB on 2026-10-04.
- **D-04:** **App and agent upgrade together.** In the same step and behind the same gate, `swarmpit_agent` moves to the agent release matching 1.10, if research finds one. If none exists, the agent image stays as is and the reason is recorded.
- **D-05:** If 1.10 fails its gate after the D-09 recovery, **roll back to 1.9** from the pre-step snapshot and record OPS-SWARM-01 as blocked. Replacing Swarmpit (registry webhook → `docker service update`, Shepherd) is out of scope.
- **D-06:** `swarmpit_db` compatibility: an **additive, forward-only schema migration inside couchdb 2.3.0 is allowed**, after a backup (D-07). The CouchDB image/version, the volume and the linked registry credentials must not change. Success criterion 4's "untouched" means exactly that. If 1.10 needs a newer CouchDB or a destructive migration, skip the upgrade, keep 1.9 and record OPS-SWARM-01 as blocked. — **Reversibility:** one-way — a schema migration written by 1.10 into swarmpit_db may not be readable by 1.9, so rolling back to 1.9 after the upgrade means restoring the D-07 dump.
- **D-07:** Before step 1, **dump `swarmpit_db`** (CouchDB replication or `_all_docs?include_docs=true` export of every database, or a volume copy with the service scaled down). It holds the registry credentials autoredeploy depends on. Keep the dump on the swarm, outside the gluster tree Swarmpit uses, and do not commit it, since it contains credentials. Record only its path, size and doc counts.

#### Redeploy gates & SLA
- **D-08:** Each gate is a **real `thinx-staging` push**. CircleCI builds and pushes `registry.thinx.cloud:5000/thinx/api`, and the gate watches for a new `thinx_api` task. Do not use a canary service.
- **D-09:** **SLA clock: registry push → new task Running.** It starts when CircleCI's image push completes (new digest in the registry) and stops when the new `thinx_api` task is Running. Limit: 5 minutes. CI build time is excluded.
- **D-10:** **Gate evidence:** `docker service ps thinx_api` shows a new Running task with the new image digest, the API answers on `https://rtm.thinx.cloud`, and the measured delta is recorded in the step SUMMARY.
- **D-11:** **Gate failure:** one rung-1 recovery (`docker service update --force swarmpit_app`, per `.claude/skills/swarm-autopull-recovery/SKILL.md`) and a re-measure. If it is still late or missing, roll the step back from its snapshot and **stop the window**.
- **D-11a:** **Gate commits are phase evidence commits** (that step's snapshot and evidence under `.planning/`), signed and pushed to `thinx-staging`, not empty commits. Research must confirm that a `.planning`-only commit makes CircleCI build and push the api image. If a path filter skips it, the plan needs a different trigger that still goes through the real CI → registry path.

#### Agent & leftovers
- **D-12:** **`swarmpit_agent` is kept.** The operator still uses the Swarmpit tasks/stats UI (`AGENTS.md` monitoring via `swarmpit.thinx.cloud/#/tasks`). **OPS-SWARM-03 is descoped** to future requirements: update REQUIREMENTS.md (move it out of v1.14 with that reason) and ROADMAP.md (drop success criterion 3, and adjust the goal and requirements line), so v1.14 closes at 24/24.
- **D-13:** After verifying that **no service mounts it** (`docker service inspect` across all services), **delete `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf`** together with `swarmpit_influxdb`, keeping a copy in that step's snapshot. Phase 27 D-16 already removed its mount from `thinx_influxdb`.
- **D-14:** Keep the **`swarmpit_influxdb` data volume** until the last gate of the phase (the 1.10 gate) passes, so step A can still be rolled back. Then remove it to reclaim disk, and record the volume name, node and size first.

#### Window & execution
- **D-15:** **Claude runs the production steps over ssh without per-step approval gates.** It stops only on a failed gate (D-11), on the engine/compat stop conditions (D-02, D-06) or on an unexpected state. Use the literal ssh form `ssh root@<micro-host> -i <key> -p<port> …` (memory `micro-ssh-direct-form`). *(Host, key and port are redacted in this copy under the RESEARCH hygiene rule. The unredacted line is in 28-CONTEXT.md and AGENTS.md.)* Query service placement first, since it floats and `docker exec` is node-local. — **Reversibility:** costly — steps run back to back, so a bad step is only caught at its gate; every step must have its snapshot taken before it changes anything.
- **D-16:** **No fixed window.** It runs whenever execute-phase runs, but never within 06:00–10:00 UTC (the ~06:45 unattended-upgrade window and the 09:40 log-retention cron). Same-day as other rollouts is fine. The only commits pushed during the window are the gate commits.
- **D-17:** **Mechanism: edit the Swarmpit stack file, then `docker stack deploy`.** The stack file stays the source of truth. Before the first change, research/the first task must **diff the stack file against the live specs** (`docker service inspect`), since `registry.yml` drifted badly on 2026-09-21. Reconcile any drift into the file first, without behaviour change, and snapshot it. Snapshot the file before and after each step under `.planning/runbooks/swarm-configs/` (`swarmpit-stack.<step>.{pre,post}.yml`), with secrets redacted. Do **not** use `restart.sh` or the thinx stack.

### Claude's Discretion
- Step order on a healthy engine (D-01 chose trim first: the influx removal is proven by Swarmpit 1.9 source, so the upgrade then runs on the smallest stack).
- Exact form of the `swarmpit_db` dump (D-07) and of the redaction in snapshots.
- How to detect the registry-push timestamp for the SLA clock (CircleCI step end time vs registry manifest/log time).

### Deferred Ideas (OUT OF SCOPE)
- **OPS-SWARM-03, removing `swarmpit_agent`:** descoped to future requirements (D-12). Revisit if monitoring moves off the Swarmpit UI, e.g. to `docker service ps` over ssh plus external alerting.
- **Replacing Swarmpit** with a registry webhook or Shepherd: its own phase, if `swarmpit_app` itself becomes the footprint problem (memory `backlog-swarmpit-minimize`).
- Reviewed Todos (not folded): keyword-matched pending todos (Rollbar token split, legacy owner/transfer FIXMEs, API key residual exposure, console notification gaps, MQTT device writes, multi-file OTA) are unrelated to Swarmpit and stay in `.planning/todos/pending/`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-SWARM-01 | Swarmpit runs 1.10 in production and registry-triggered autoredeploy still completes within the 5-minute SLA | §Step B, Pitfall 1 (healthcheck), Pitfall 2 (API pin), §SLA clock, §D-06 finding (no migration), §Rollback B |
| OPS-SWARM-02 | Swarmpit stats are disabled and `swarmpit_influxdb` is removed (the `swarmpit/influxdb.conf` file `thinx_influxdb` mounts is preserved or re-homed); autoredeploy verified by a test push | §Step A, §Influx-off source proof, D-13 mount scan, D-14 volume facts. The parenthetical is stale: no service mounts the file any more (verified live), so D-13 deletes it. Planner should reword the requirement text when editing REQUIREMENTS.md for D-12 |
| OPS-SWARM-03 | `swarmpit_agent` is removed; autoredeploy verified by a test push; `swarmpit_db` untouched | **Descoped per D-12.** The plan task edits REQUIREMENTS.md (move to future, reason: "Swarmpit tasks/stats UI is still used for monitoring; the agent stays.") and ROADMAP.md (drop SC3, adjust goal and requirements line). Its "`swarmpit_db` untouched" clause lives on as SC4, verified by §Untouched proof |
</phase_requirements>

## Project Constraints (from AGENTS.md, memory and prior-phase hygiene)

No `CLAUDE.md` exists in the repo. The directives below come from `AGENTS.md`, the auto-memory and the Phase 27 runbook conventions.

- **ssh form:** call micro **literally** as `ssh root@<micro-host> -i <key> -p<port> -o BatchMode=yes -o ConnectTimeout=10 '<cmd>'`. Plans must show the literal command so the pre-approved allow rules match. No `set -- $(sed …)` wrapper. **Committed files (RESEARCH, runbooks, SUMMARYs) must not contain the host IP, key name or port.** Write `micro` / `<ssh micro>` there.
- **Pushes go to `thinx-staging` only**, never `main` (memory `push-staging-not-main`).
- **Never `restart.sh`, never a thinx-stack `docker stack deploy`.** Either one drops the live-only secret mounts (`INFLUXDB_TOKEN`, the Phase 24 secrets) and resets the edge passwords. The *swarmpit* stack deploy is a separate stack and is safe (§Stack deploy semantics).
- **Placement floats.** Query `docker service ps <svc>` before any `docker exec`, which is node-local. `docker service ls` returns unstable subsets under load: it returned **22** services today, while Phase 27 counted 25–26.
- **Do not tune `registry_registry` CPU/memory limits** (memory `registry-storage-and-limits`).
- **Images pinned by tag, not digest** (2026-10-04). `swarmpit/swarmpit:1.10` per D-03.
- **Output hygiene:** evidence keeps aggregates only: counts, sizes, short digests, times. Never registry credentials, user hashes, the CouchDB admin hash, IPs or tokens.
- **Plaintext port 7442 / plain MQTT stay.** Not touched by this phase.
- **Commits are signed** (`commit.gpgsign=true` locally). Phase 27 needed an operator "push unsigned" exception when GPG was locked. Plan for that checkpoint.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Image build + push of `thinx/api:swarm` | CI (CircleCI `api-registry`, thinx-staging only) | Private registry `registry_registry` (core) | The gate trigger. Unchanged by this phase |
| Digest polling + `redeploy-service` | `swarmpit_app` (in-app 60 s job) | Docker Engine API on micro (via `/var/run/docker.sock`) | `agent.clj` autoredeploy-job; uses neither InfluxDB nor `swarmpit_agent` |
| Registry credentials for the poll | `swarmpit_db` (couchdb 2.3.0, core) | — | `v2` doc for `registry.thinx.cloud` in DB `swarmpit` |
| Live task/node stats in the UI | `swarmpit_agent` (global) → app in-memory cache | — | Kept (D-12). Survives the trim |
| Historical stats (timeseries graphs) | `swarmpit_influxdb` (micro) | — | Removed in Step A. UI then answers `400 Statistics disabled` for the timeseries endpoints |
| Stack definition | `/mnt/gluster/deployment/swarm/swarmpit.yml` (gluster) | Snapshots under `.planning/runbooks/swarm-configs/` | D-17 source of truth |
| SLA evidence | Operator Mac (CircleCI public API + ssh) | — | No credentials needed for the CircleCI side |

## Live State (read-only, 2026-10-04 21:43–21:50 UTC)

### Engine gate (D-02): PASS, no stop

```
micro: server=29.8.1 api=1.56 minapi=1.40
docker node inspect: core engine=29.8.1, micro engine=29.8.1
core = Leader, micro = Reachable
```
[VERIFIED: `docker version` on micro; `docker node inspect <n> --format '{{.Description.Engine.EngineVersion}}'` from micro for both nodes]

- Neither node is on 29.0–29.2, so D-01 stands: Step A (trim) first, then Step B (upgrade).
- **Read core's engine without ssh to core:** `docker node inspect core --format '{{.Description.Engine.EngineVersion}}'` on micro. That is the D-02 command for core.
- `docker-ce` candidate 29.8.2 is pending on micro, but unattended-upgrades only allows the Ubuntu origins (`o=Ubuntu,a=noble`, `-security`, ESM), so Docker is not auto-upgraded. Re-read the engine at window start anyway. [VERIFIED: `/var/log/unattended-upgrades/unattended-upgrades.log` "Allowed origins are: …"]
- **dockerd on micro was bounced at 06:47:02–06:47:34 UTC today** ("Leaving cluster with 1 managers left out of 2. Raft quorum will be lost."). Every service's `UpdatedAt` is 06:47:33. That confirms the D-16 06:00–10:00 exclusion is real. [VERIFIED: `journalctl -u docker`, `systemctl show docker -p ActiveEnterTimestamp`]

### Stack file location and drift (D-17): no drift

- **Stack file:** `/mnt/gluster/deployment/swarm/swarmpit.yml` (2,875 bytes, mtime 2026-06-11). Deploy helper: `swarmpit.sh` (adds node labels, then `docker stack deploy -c ./swarmpit.yml swarmpit`). Do **not** run `swarmpit.sh`. It re-adds node labels; deploy directly instead. Existing backups follow the convention `swarmpit.yml.bak.<YYYYmmddHHMMSS>.<reason>`. [VERIFIED: `ls -la` of the swarm dir]
- The gluster directory is a git repo whose **HEAD is stale**: `swarmpit.yml` and `swarmpit/influxdb.conf` carry uncommitted edits (the `1.44` API pins, the db memory cut, the influx tuning, `node.hostname == micro`). **The working file is the truth, not git HEAD.** [VERIFIED: `git status --short`, `git diff -- swarmpit.yml`]
- **Field-by-field diff of the working file against `docker service inspect`:** image, env, mounts, networks (with aliases), mode, resources (768 MiB = 805306368, 384 MiB = 402653184, 256/128 MiB), placement constraints, the 11 Traefik labels and the absence of healthchecks all match for `app`, `db`, `influxdb` and `agent`. The `swarmpit_net` overlay is `attachable=true`, as declared. **Drift = 0. There is nothing to reconcile.** The Step A `pre` snapshot doubles as the D-17 baseline. [VERIFIED: live inspect vs file, read this session]
- `docker stack config -c swarmpit.yml` parses OK on micro's CLI 29.8.1. The file contains no `${…}` interpolation and **no secrets** (env holds only URLs and API versions).

Current file (verbatim, no redaction needed):

```yaml
version: '3.3'

services:
  app:
    image: swarmpit/swarmpit:1.9
    environment:
      - SWARMPIT_DOCKER_API=1.44
      - DOCKER_API_VERSION=1.44
      - SWARMPIT_DB=http://db:5984
      - SWARMPIT_INFLUXDB=http://influxdb:8086
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - net
      - traefik-public
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 768M
        reservations:
          cpus: '0.15'
          memory: 384M
      placement:
        constraints:
          - node.hostname == micro
          - node.role == manager
      labels:
        - traefik.enable=true
        - traefik.docker.network=traefik-public
        - traefik.constraint-label=traefik-public
        - traefik.http.routers.swarmpit-http.rule=Host(`swarmpit.thinx.cloud`)
        - traefik.http.routers.swarmpit-http.entrypoints=http
        
        - traefik.http.routers.swarmpit-http.middlewares=https-redirect
        
        - traefik.http.routers.swarmpit-https.rule=Host(`swarmpit.thinx.cloud`)
        - traefik.http.routers.swarmpit-https.entrypoints=https
        - traefik.http.routers.swarmpit-https.tls=true
        - traefik.http.routers.swarmpit-https.tls.certresolver=le
        - traefik.http.services.swarmpit.loadbalancer.server.port=8080

  db:
    image: couchdb:2.3.0
    volumes:
      - db-data:/opt/couchdb/data
      - /mnt/gluster/deployment/swarm/swarmpit/couchdb-logging.ini:/opt/couchdb/etc/local.d/logging.ini
    networks:
      - traefik-public
      - net
#    ports:
#      - 5984
    deploy:
      resources:
        limits:
          cpus: '0.2'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M
      placement:
        constraints:
          - node.labels.swarmpit.db-data == true

  influxdb:
    image: influxdb:1.7
    environment:
#      - INFLUXDB_MONITOR_STORE_ENABLED=false
      - INFLUXDB_DATA_CACHE_MAX_MEMORY_SIZE=64m
    volumes:
      - influx-data:/var/lib/influxdb
      - '/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf:/etc/influxdb/influxdb.conf'

    networks:
      - net
    deploy:
      resources:
        reservations:
          memory: 128M
        limits:
          cpus: '0.2'
          memory: 512M
      placement:
        constraints:
          - node.hostname == micro

  agent:
    image: swarmpit/agent:latest
    environment:
      - DOCKER_API_VERSION=1.43
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - net
    deploy:
      mode: global
      resources:
        limits:
          cpus: '0.10'
          memory: 64M
        reservations:
          cpus: '0.05'
          memory: 32M

networks:
  net:
    driver: overlay
    attachable: true
  traefik-public:
    external: true

volumes:
  db-data:
    driver: local
  influx-data:
    driver: local
```
[VERIFIED: `sed` of `/mnt/gluster/deployment/swarm/swarmpit.yml` on micro, with a redaction filter that matched nothing]

**Secret-bearing neighbour:** `swarmpit/couchdb-logging.ini` (bind-mounted into `swarmpit_db`) contains an `[admins]` pbkdf2 hash and the CouchDB uuid. **Never copy it into a snapshot or commit.** It is not changed by this phase.

### Live services

| Service | Spec image (short) | Node | Notes |
|---|---|---|---|
| `swarmpit_app` | `swarmpit/swarmpit:1.9@sha256:8e0f8b86f281` | micro (constraint) | env `DOCKER_API_VERSION=1.44`, `SWARMPIT_DB=http://db:5984`, `SWARMPIT_DOCKER_API=1.44`, `SWARMPIT_INFLUXDB=http://influxdb:8086`; no healthcheck; 0.25 CPU / 768M |
| `swarmpit_agent` | `swarmpit/agent:latest@sha256:1306e2a2f538` | global 2/2 | env `DOCKER_API_VERSION=1.43` |
| `swarmpit_db` | `couchdb:2.3.0@sha256:ee75c9a737e7` | **core** | volume `swarmpit_db-data`; constraint `node.labels.swarmpit.db-data == true` |
| `swarmpit_influxdb` | `influxdb:1.7@sha256:a25a134e8748` | micro (constraint) | volume `swarmpit_influx-data`, bind `swarmpit/influxdb.conf` |

[VERIFIED: `docker service inspect` on micro]

`GET https://swarmpit.thinx.cloud/version` (unauthenticated) returns `{"name":"swarmpit","version":"1.9",…,"initialized":true,"statistics":true,"docker":{"api":1.44,"engine":"29.8.1"}}`. **This is the cheapest per-step assertion.** `statistics` flips to `false` after Step A, and `version` becomes `1.10…` after Step B. [VERIFIED: curl from operator Mac; `version.clj` `:statistics (some? (cfg/config :influxdb-url))` identical at 1.9 and 1.10]

### swarmpit_db (D-06/D-07 inputs)

- CouchDB `{"couchdb":"Welcome","version":"2.3.0",…}`. DBs: `["_global_changes","_replicator","_users","swarmpit"]`.
- DB `swarmpit`: **7 docs, 0 deleted**. By type: `dockerhub=1, migration=3, secret=1, user=1, v2=1`. Migration names: `["single-node-setup","initial","change-reg-types"]`. The `v2` doc's host is `registry.thinx.cloud` (with `username`/`password`/`withAuth` keys: **credentials**).
- `swarmpit` `_security` is empty (0 admins, 0 members), so **anonymous read works** from any container on `swarmpit_net`. `_global_changes` and `_replicator/_all_docs` answer `401` (admin only; they hold only CouchDB system docs).
- The `swarmpit_app` 1.9 image (Debian 9, OpenJDK 8u242) has `curl`. `jq` is on micro's host.

[VERIFIED: curl from inside the `swarmpit_app` container to `http://db:5984`, counts only]

**Latent risk: two `swarmpit_db-data` volumes.** **Both** nodes carry the label `swarmpit.db-data=true` (core: `{"swarmpit.db-data":"true",…}`; micro: `{"Traefik":"true","swarmpit.db-data":"true","swarmpit.influx-data":"true",…}`). `swarmpit_db` task history shows it on micro 3 weeks, 2 weeks and 7 days ago and on core now. Micro holds its own node-local `swarmpit_db-data` (756 KB, created 2022-02-07, swarmpit shard files last written 2022-09-22, and its own `registry.thinx.cloud` record). The volume SC4 means is therefore **"the `swarmpit_db-data` on the node running `swarmpit_db` at Step 0" (core today)**. Any reschedule of `swarmpit_db`, for example a dockerd bounce on core, silently swaps Swarmpit to the other node's copy. This phase must not trigger one, so the db spec must stay unchanged. Fixing the label is **out of scope** (it would change db placement, which D-06 forbids). Record it as a follow-up. [VERIFIED: `docker node inspect`, `docker service ps swarmpit_db`, `docker volume inspect` + `find`/`grep -c` on micro]

### swarmpit_influxdb and D-13/D-14 facts

- Volume `swarmpit_influx-data` on **micro**: `/var/lib/docker/volumes/swarmpit_influx-data/_data`, **121M**. `docker volume ls` on core was not read: it needs the core alias, which the micro allow rules do not cover. Check it in Step C.
- Mount scan across the services listed by name: only `swarmpit_db` (`couchdb-logging.ini`) and `swarmpit_influxdb` (`influxdb.conf`) mount anything under `swarmpit/`. **`thinx_influxdb` does not** (consistent with Phase 27's `influx_swarmpit_mounts=0`). The listing returned 22 services, which is unreliable, so the D-13 scan must use the union method in §Code Examples.
- `swarmpit/` also holds `influxdb.conf.bak.20260521200918` (untracked). D-13 names only `influxdb.conf`. See Open Question 3.
- `influxdb.conf` content has no secrets (it holds paths, cache tuning and logging) and may be copied into the Step A snapshot verbatim.

### Autoredeploy baseline (16 h of logs)

- 31 `autoredeploy fired` (thinx_api, thinx_console, thinx_vue, thinx_transformer). Last thinx_api fire: `2026-10-04T20:11:18.895Z`, digest `→ sha256:bb91df25ff57`.
- **1,474 `autoredeploy failed`**: exactly 737 each for `thinx_couchdb` and `thinx_influxdb`, `{:status 401 … No matching registry ( dhi.io ) linked with Swarmpit}`. **This is pre-existing noise and not a gate signal.** Gate checks must filter on `thinx_api`.
- Boot log of the current 1.9 task: container started `06:47:42Z`, `Swarmpit is starting...` at `06:49:45Z`, `Swarmpit running on port 8080` at `06:49:48Z`. That is **~126 s to listen** at 0.25 CPU right after a daemon bounce. Then `Docker API: 1.44`, `Docker ENGINE: 29.8.1`.
- Resource use now: app 154 MiB / 768, influxdb 172 MiB / 512, agent 9 MiB / 64. Step A frees ~170 MiB on micro.

[VERIFIED: `docker service logs swarmpit_app --since 16h`, `docker stats --no-stream`]

## Swarmpit 1.9 → 1.10: what changes (source-verified)

Release `1.10`: tag commit `0efebf4` ("pinning debian release", 2026-03-04), GitHub release published 2026-04-16. Docker Hub `swarmpit/swarmpit:1.10` index `sha256:15c044a82fed`, amd64 `sha256:dee7de2ebb9b`, resolvable from micro (`docker manifest inspect`). [VERIFIED: `gh api repos/swarmpit/swarmpit/releases`, Hub tags API, manifest inspect on micro]

| Area | 1.9 | 1.10 | Impact here |
|---|---|---|---|
| Default `:docker-api` | `"1.30"` | `"1.44"` | None while `SWARMPIT_DOCKER_API=1.44` stays set. Env wins over defaults: `(apply merge [@default environment @dynamic])`. Live log `Docker API: 1.44` on a 1.56 engine proves it |
| `setup/docker` | sets default `:docker-api` to engine `ApiVersion` | same | Without the env pin, 1.10 would switch to **1.56** after boot. Keep the pin |
| `SWARMPIT_INFLUXDB` | nil = stats off | same | Every InfluxDB use is gated by `influx-configured?` (`database.clj` init, `stats.clj store-to-db`, four `handler.clj` timeseries endpoints → `400 "Statistics disabled"`, `subscription*.clj`) |
| CouchDB init | `create-database` (412 swallowed) | `HEAD /swarmpit` first, create only if missing | Read-only on an existing DB. Logs `Swarmpit DB already exist` |
| CouchDB migrations | `single-node-setup`, `initial`, `change-reg-types` | **identical file** | All 3 already recorded, so **no write**. D-06 passes |
| Recommended CouchDB | `couchdb:2.3.0` | `couchdb:2.3.0` (upstream compose at tag 1.10) | No CouchDB change needed |
| Autoredeploy job | http-kit `schedule-task 60000`, recursive | `chime` periodic, first run **now+60 s**, then every 1 min | Same cadence. First poll ≈ boot + 60 s |
| `redeploy-service` image | `repo:tag@digest` | `repo:tag@digest` (`api.clj:975`) | Unchanged. The `outbound.clj` `repo@digest` change affects UI edits only |
| New env | — | `SWARMPIT_LOG_LEVEL` (default `info`) | Optional. Leave unset |
| New on boot | — | `users/init!` reads `/run/configs/users.yaml` only if present | No-op here |
| HTTP error logging | — | `log-error` prints method, URL, request headers and body (masks `:password`, `:secret`, `:Authorization`) at ERROR | Do not paste raw 1.10 error logs into evidence |
| Image | Debian 9, OpenJDK 8 | Debian bookworm, **OpenJDK 17**, **`HEALTHCHECK CMD curl --fail -s http://localhost:8080`** | See Pitfall 1 |
| Upstream agent in compose | `swarmpit/agent:2.2`, `DOCKER_API_VERSION=1.35` | `swarmpit/agent:latest`, `DOCKER_API_VERSION=1.44` | Production already runs `latest` (1.43). Agent unchanged (D-04) |

[VERIFIED: `git diff 1.9 1.10` in a clone of github.com/swarmpit/swarmpit (`config.clj`, `database.clj`, `couchdb/client.clj`, `couchdb/migration.clj` unchanged, `agent.clj`, `setup.clj`, `server.clj`, `api.clj`, `http.clj`, `log.clj`, `config/users.clj`, `Dockerfile`, `docker-compose.yml`)]

**D-04 agent answer:** swarmpit/agent tags are `1.0`, `2.0`, `2.1` and `2.2` (2020-04-28). `latest` was rebuilt 2026-08-21 from agent master (FD/memory leak fix, nil-stats fixes, disk-path reporting) and has index digest `sha256:1306e2a2f538`, **the digest production already runs**. No versioned agent release matches 1.10, and the 1.10 compose itself uses `swarmpit/agent:latest`. **Leave the agent untouched in Step B.** Reason to record: "no swarmpit/agent release after 2.2; upstream 1.10 compose uses agent:latest, which production already runs at the current Hub digest 1306e2a2f538". [VERIFIED: Docker Hub tags API, `gh api repos/swarmpit/agent/tags|commits`, live spec]

**Autoredeploy does not depend on `swarmpit_agent` or InfluxDB.** `autoredeploy-job` calls `api/services`, which reads the Docker API over the socket, and `api/repository-digest`, which reads the registry using the `swarmpit_db` credentials. [VERIFIED: `agent.clj` at 1.10]

## D-11a answer: a `.planning`-only push does build and push the API image

1. **No path filter exists.** The `main` workflow has only `branches.only` filters. `api-registry` = `build-api-cloud` with `publish: registry`, `requires: [test]`, `filters: branches: only: [thinx-staging]` [VERIFIED: `.circleci/config.yml:938-951`, read this session]. There is no `setup:` workflow and no path-filtering orb.
2. **The image changes on every commit.** `Dockerfile:79-80` `ARG COMMIT_SHA` / `ENV COMMIT_SHA=${COMMIT_SHA}` (CI passes `--build-arg COMMIT_SHA=$CIRCLE_SHA1`), and `Dockerfile:130` `COPY . .`. `.dockerignore` excludes only `.git`, `**/node_modules/`, `package-lock.json`, `tools/`, `conf/`, `clair*` and `**/*.so`, so `.planning/` is in the build context. [VERIFIED: Dockerfile and .dockerignore read this session]
3. **Empirical proof:** the range `05f9d260..39db09f1` (9 files, all under `.planning/`) ran `api-registry` #15597 **success** at `39db09f1` (stop 2026-10-03T21:43:48Z). [VERIFIED: CircleCI public API v1.1 + `git diff --name-only`]
4. Push step: `docker tag thinxcloud/api:latest registry.thinx.cloud:5000/thinx/api:swarm` then `docker push registry.thinx.cloud:5000/thinx/api:swarm` [VERIFIED: `.circleci/config.yml:376-383`].

**Caveats for the gate commit:**
- `api-registry` waits on `test` (~3 min). A red `test` means no image: **"no measurement", not a failed gate.** Rerun or fix CI without counting it against D-11 (Phase 27's 27-04 hit exactly this).
- CircleCI skips pipelines whose head commit message contains `[ci skip]` or `[skip ci]` [ASSUMED]. Keep those strings out of gate commit messages.
- The same push also builds `console-classic-registry` and `vue-console-registry` (`thinx_console` and `thinx_vue` autoredeploy too). Today's push had all of them land cleanly alongside the api.
- **Push the planning commits (PLANs, CONTEXT, RESEARCH) before the window opens** and wait for CI to go idle. The local branch is already 2 commits ahead of `origin/thinx-staging`, and D-16 allows only gate commits inside the window.

## SLA clock (D-09): how to measure

**Start = `end_time` of the `Push to private registry (thinx/api:swarm)` step** in the `api-registry` job for the gate SHA. Public, unauthenticated:

```bash
# 1. find the api-registry build for the gate SHA
curl -s "https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/tree/thinx-staging?limit=30&shallow=true" \
 | jq -r --arg sha "$SHA" '.[] | select(.vcs_revision==$sha and .workflows.job_name=="api-registry") | "\(.build_num) \(.status) \(.stop_time)"'
# 2. step-level end time + pushed digest
B=<build_num>
curl -s "https://circleci.com/api/v1.1/project/github/suculent/thinx-device-api/$B" \
 | jq -r '.steps[].actions[] | select(.name|startswith("Push to private registry")) | "\(.end_time) \(.output_url)"'
curl -s "<output_url>" | jq -r '.[].message' | grep -o 'digest: sha256:[0-9a-f]\{64\}' | tail -1
```

Read for today's push (#15683, `c5d5be46`): push step `end_time 2026-10-04T20:10:57.914Z → 20:11:17.968Z`. The log line was `*****: digest: sha256:bb91df25ff57… size: 4074`; CircleCI masks the tag `swarm` as `*****`. [VERIFIED: CircleCI v1.1 API this session]

**Stop = the new `thinx_api` task's `.Status.Timestamp` with `.Status.State == running`**, read on the manager:

```bash
T=$(docker service ps thinx_api -q --filter desired-state=running | head -1)
docker inspect "$T" --format '{{json .CreatedAt}} {{.Status.State}} {{json .Status.Timestamp}} {{.Spec.ContainerSpec.Image}}'
```

Today: autoredeploy fired `20:11:18.896Z`, task created `20:11:18.903Z`, Running `20:11:48.907Z`, update completed `20:11:53.969Z`. **Delta ≈ 31 s.** The fire landed 1 s after the push by luck; the worst case is ≈ 60 s poll + ~30 s start. [VERIFIED: swarmpit_app logs, `docker inspect <task>`, `docker service inspect thinx_api .UpdateStatus`]

- Use `{{json …}}` to get RFC3339. Phase 27 got a false −48910 s from Docker's `2026-10-03 13:35:22 +0000 UTC` form. Compute deltas with `date -u -d` on micro, or with python on the Mac.
- **Digest match:** the spec digest of the Running task must equal the CircleCI push digest. Cross-check with the swarmpit `autoredeploy fired` line (`grep thinx_api`).
- The registry log is **not** a usable clock: `registry_registry` emits no manifest access lines (5 lines in the 40 s push window, none of them manifests). [VERIFIED: `docker service logs registry_registry`]
- **Timeout rule:** give up at push_end + 300 s. If no Running task with the new digest exists by then, the gate has failed and D-11 applies.

## Stack deploy semantics (rollback mechanics, question 8)

From `docker/cli` `cli/command/stack/deploy_composefile.go` (`deployServices`, tag v29.0.0; micro runs CLI 29.8.1):

- Every service in the file gets a `ServiceUpdate` ("Updating service …" is printed for all of them). `ForceUpdate` is **preserved** ("Preserve existing ForceUpdate value so that tasks are not re-deployed if not updated"), so a service whose spec is unchanged gets no new tasks.
- `--resolve-image changed`: if the tag equals the `com.docker.stack.image` label, the CLI reuses the **existing resolved image (with digest)**, so nothing is re-queried and nothing moves. With the default `always`, the daemon re-resolves every tag. **`swarmpit/agent:latest` would then silently move** if Hub `latest` changes between steps.
- `--prune` is the only way the deploy removes a service. Without it, a service deleted from the file **keeps running**. Use an explicit `docker service rm swarmpit_influxdb`, not `--prune`.
- `--detach` defaults to `true` on this CLI, so convergence must be polled.
- Volumes are never removed by `stack deploy`. Removing the `influx-data:` declaration from the file leaves the volume in place (D-14).

[VERIFIED: docker/cli source at v29.0.0 via `gh api`; `docker stack deploy --help` on micro (CLI 29.8.1)]

**Rollback per step:** restore the step's `pre` file to `/mnt/gluster/deployment/swarm/swarmpit.yml`, then run `docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit`.
- **A rollback:** first restore `swarmpit/influxdb.conf` from the snapshot copy. A missing bind source fails the task with `invalid mount config … bind source path does not exist` [ASSUMED]. The deploy then re-creates `swarmpit_influxdb` (pinned to micro, so it reattaches the retained `swarmpit_influx-data`) and re-adds `SWARMPIT_INFLUXDB`.
- **B rollback:** the image goes back to `swarmpit/swarmpit:1.9`. It is pulled from Docker Hub again: swarm-pulled images are untagged here (`<none>`) and the daily `docker system prune --force` at 17:09 UTC removes dangling ones. No DB restore is needed (§D-06). Emergency alternative: `docker service rollback swarmpit_app` (PreviousSpec). Afterwards the file must be restored to match.

## Standard Stack

| Component | Version / tag | Purpose | Why |
|---|---|---|---|
| `swarmpit/swarmpit` | `1.10` (index `sha256:15c044a82fed`) | App + autoredeploy | D-03. Only release after 1.9 [VERIFIED: Hub, GitHub releases] |
| `swarmpit/agent` | `latest` (unchanged, `sha256:1306e2a2f538`) | Live stats/events | D-04/D-12, no newer versioned release [VERIFIED] |
| `couchdb` | `2.3.0` (unchanged) | `swarmpit_db` | D-06. 1.10 upstream compose uses 2.3.0 [VERIFIED] |
| Docker Engine / CLI | 29.8.1 both nodes | Swarm | Above the 1.40 floor with the 1.44 pin [VERIFIED] |
| CircleCI API v1.1 (public) | — | SLA start + digest | No token needed [VERIFIED] |

**No packages are installed** (no npm/pip/cargo). The Package Legitimacy Gate does not apply. Image provenance: official `swarmpit/*` Docker Hub repos, matching the GitHub org `swarmpit`.

## Architecture Patterns

### Gate flow

```
 operator Mac                          CircleCI                       registry (core)          micro (manager)
 ───────────                          ────────                       ───────────────          ───────────────
 gate commit (.planning evidence) ──► test (~3 min) ──► api-registry ──► PUT thinx/api:swarm
   signed, push thinx-staging          │ red? → "no measurement",     │ (push step end_time
                                       │ rerun; not a gate failure    │  = SLA START)
                                                                       ▼
                                                swarmpit_app 60 s poll ─► digest differs? ─► redeploy-service
                                                (creds from swarmpit_db)                       │
                                                                                               ▼
                                                                         new thinx_api task Running (= SLA STOP)
 poll CircleCI API + ssh micro ◄────────────────────────────────────────── docker inspect <task>
   delta ≤ 300 s AND digest match AND GET rtm/api/v2/csrf-token 200  → PASS
   else → rung 1 (service update --force swarmpit_app) → readiness → new gate push → re-measure
        → still failing → rollback step from pre-snapshot → STOP window
```

### Step sequence (recommended)

| Step | Changes | Gate | Rollback source |
|---|---|---|---|
| **0 Pre-flight** (no prod change) | Engine read on both nodes (D-02); CI idle; clock outside 06:00–10:00 UTC; D-07 dump; record db/agent task IDs + digests; confirm `/version`; write the rung-1 command into the plan (staged, not run) | none (optional baseline measurement on the last pre-window planning push) | — |
| **A Trim** | delete the `SWARMPIT_INFLUXDB` line, the `influxdb:` service block and the `influx-data:` volume declaration → `stack deploy --resolve-image changed` → `docker service rm swarmpit_influxdb` → D-13 mount scan → delete `swarmpit/influxdb.conf` (copy kept in the snapshot + `/root/phase28/`) | Gate A push | `swarmpit-stack.A.pre.yml` + saved `influxdb.conf` |
| **B Upgrade** | `image: swarmpit/swarmpit:1.10`; `version: '3.8'`; app `healthcheck` override; keep both `1.44` pins; agent and db untouched → `stack deploy --resolve-image changed` | Gate B push | `swarmpit-stack.B.pre.yml` (= A.post) |
| **C Close** (after Gate B passes) | D-14: record and `docker volume rm swarmpit_influx-data` on micro (check core too); REQUIREMENTS/ROADMAP D-12 edits; update `swarm.md` rungs + skill text (no InfluxDB warm-up, 1.10 boot, rung 4 done) | none | volume removal is one-way (allowed after the last gate) |

### Step B stack-file delta (prescriptive)

```yaml
version: '3.8'          # was '3.3'; required for start_period. Verified: normalized config differs only in this line

services:
  app:
    image: swarmpit/swarmpit:1.10
    environment:
      - SWARMPIT_DOCKER_API=1.44     # KEEP (Pitfall 2)
      - DOCKER_API_VERSION=1.44      # KEEP
      - SWARMPIT_DB=http://db:5984
    healthcheck:                      # NEW: overrides the 1.10 image HEALTHCHECK (Pitfall 1)
      test: ["CMD", "curl", "-fs", "http://localhost:8080"]
      interval: 60s
      timeout: 10s
      retries: 5
      start_period: 300s
    # volumes / networks / deploy unchanged
```
[VERIFIED: `docker stack config -c -` on micro accepts this under 3.8 and rejects `start_period` under 3.3 ("additional property 'start_period' is not allowed"); the 3.3→3.8 change alone yields an identical normalized config apart from the version line]

### Anti-Patterns to Avoid
- **Removing `SWARMPIT_DOCKER_API=1.44` as "cleanup":** 1.9 falls back to API 1.30 (< floor 1.40), and 1.10 renegotiates to 1.56.
- **`docker stack deploy` with the default `--resolve-image always`:** this can move `swarmpit/agent:latest` mid-phase.
- **`--prune` to drop influxdb:** use an explicit `docker service rm`.
- **Running `swarmpit.sh`:** it re-applies node labels (`swarmpit.db-data`, `swarmpit.influx-data`) on whatever node it runs on.
- **Grepping all of `autoredeploy failed` as a health signal:** the dhi.io 401s fire every minute already.
- **Pushing the gate commit while `swarmpit_app` is still booting:** the SLA clock would include JVM start (~2 min) plus the first-poll delay (60 s).
- **Pasting `docker service logs swarmpit_app` raw into evidence on 1.10:** `log-error` dumps request headers and bodies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Registry push timestamp | registry log scraping, polling `/v2/…/manifests` with creds | CircleCI v1.1 step `end_time` + step output digest | Public, exact, already proven |
| "Running" time | parsing `docker service ps` human text | `docker inspect <task> {{json .Status.Timestamp}}` | RFC3339, machine-safe |
| Service removal | `--prune` | `docker service rm swarmpit_influxdb` | Explicit, single target |
| Keeping unchanged services untouched | manual per-service `service update` | `stack deploy --resolve-image changed` (CLI preserves image + ForceUpdate) | D-17 mechanism, verified semantics |
| swarmpit_db backup | volume tar on core (needs core ssh + scaling db to 0) | HTTP `_all_docs?include_docs=true` via the app container | Anonymous read works; no db downtime; micro-only |

## Common Pitfalls

### Pitfall 1: The 1.10 image HEALTHCHECK can restart-loop the app at 0.25 CPU
**What goes wrong:** the 1.10 Dockerfile adds `HEALTHCHECK CMD curl --fail -s http://localhost:8080` with Docker defaults: interval 30s, timeout 30s, start-period 0s, retries 3 [VERIFIED: 1.10 Dockerfile; moby/buildkit Dockerfile reference]. With no start period, failures count from the first probe, so the task turns unhealthy about 90–120 s after start. Swarm replaces unhealthy tasks [ASSUMED]. The 1.9 task needed **~126 s** to open port 8080 at this CPU limit today.
**How to avoid:** the stack-file `healthcheck` override in Step B (`start_period: 300s`, `interval: 60s`, `retries: 5`, file `version: '3.8'`).
**Warning signs:** `docker service ps swarmpit_app` shows repeated short-lived tasks; `docker inspect` health `unhealthy`.

### Pitfall 2: The API pin is load-bearing (D-02 premise correction)
**What goes wrong:** D-02 assumed 1.9's default API 1.30 works outside 29.0–29.2. On 29.8.1 the floor is **1.40** (`minapi=1.40`), so 1.30 is rejected here too. Production works only because of `SWARMPIT_DOCKER_API=1.44`.
**How to avoid:** keep the pin through Steps A and B. It is existing live state, so keeping it does not violate D-02's "don't add a pin" instruction. Record this in the Step 0 evidence.

### Pitfall 3: Gate timing confounded by app boot
**What goes wrong:** after any `swarmpit_app` restart (Steps A and B, and rung 1) the first poll comes ≈ boot (~1.5–2 min) + 60 s.
**How to avoid:** before pushing a gate commit, require `/version` 200 with the expected `version`/`statistics`, the log line `Swarmpit running on port 8080` from the **new** task, and 60 s elapsed. CI needs ~5 min before the push step anyway, so pushing right after readiness costs nothing.

### Pitfall 4: swarmpit_db floats between two divergent volumes
**What goes wrong:** both nodes are labelled `swarmpit.db-data=true`, so a reschedule swaps in the other node's copy (micro's dates from 2022).
**How to avoid:** never change the `db:` block; deploy with `--resolve-image changed`; assert after every deploy that the `swarmpit_db` task ID, node (core) and spec digest equal Step 0's. Record the label issue as a follow-up, not a fix.

### Pitfall 5: `docker service ls` under-reports, so the D-13 mount scan misses services
**How to avoid:** take the union of `docker service ls -q` (run 3×) and `docker stack services <stack> -q` for every stack, then inspect each by ID. Also check containers on micro with `docker ps -q | xargs docker inspect … .Mounts`. Report the count scanned (Phase 27 saw 25–26 services).

### Pitfall 6: Rollback A needs the deleted config file
**How to avoid:** save `swarmpit/influxdb.conf` to `/root/phase28/influxdb.conf.A.pre` and into the A.pre snapshot set **before** deleting it. The rollback recipe restores it first.

### Pitfall 7: CI red or GPG locked is not a gate failure
**How to avoid:** classify outcomes as PASS / FAIL (late or missing task after a green push) / NO-MEASUREMENT (CI red, push not done, signing blocked). Only FAIL triggers D-11. For GPG, use Phase 27's precedent: an operator checkpoint to unlock, or an explicit "push unsigned" exception.

### Pitfall 8: 1.10 version string
`project.clj` at tag 1.10 is `"1.10-SNAPSHOT"`, and `/version` reads it from pom.properties, so the reported string may be `1.10-SNAPSHOT` [ASSUMED]. Assert with the regex `^1\.10`, not equality.

## Code Examples

All `<ssh micro>` below are the literal ssh command from AGENTS.md / memory `micro-ssh-direct-form`, typed out in full in the plan.

### Step 0: engine gate and baselines (read-only)
```bash
<ssh micro> 'docker version --format "micro={{.Server.Version}} minapi={{.Server.MinAPIVersion}}";
  docker node inspect core --format "core={{.Description.Engine.EngineVersion}}";
  for s in swarmpit_db swarmpit_agent swarmpit_app; do
    docker service ps $s -q --filter desired-state=running | sort | tr "\n" " "; echo " <- $s tasks";
    docker service inspect $s --format "{{.Spec.TaskTemplate.ContainerSpec.Image}}" | sed -E "s/(sha256:.{12}).*/\1/"; done'
curl -s https://swarmpit.thinx.cloud/version | jq -c '{version,statistics,docker}'
# STOP if either engine matches ^29\.[0-2]\.
```

### D-07 dump (micro, counts only, never print content)
```bash
<ssh micro> 'set -euo pipefail; umask 077; install -d -m 700 /root/phase28; ts=$(date -u +%Y%m%dT%H%MZ)
  C=$(docker ps -q --filter label=com.docker.swarm.service.name=swarmpit_app | head -1)
  F=/root/phase28/swarmpit_db.swarmpit.$ts.json
  docker exec "$C" curl -sf -m 30 "http://db:5984/swarmpit/_all_docs?include_docs=true" > "$F"
  sha256sum "$F" > "$F.sha256"
  echo "path=$F size=$(stat -c %s "$F") rows=$(jq ".rows|length" "$F")"
  jq -r "[.rows[].doc.type]|group_by(.)|map(\"\(.[0])=\(length)\")|join(\" \")" "$F"'
# expect rows=7 and: dockerhub=1 migration=3 secret=1 user=1 v2=1
```
If a restore is ever needed: `jq '{new_edits:false,docs:[.rows[].doc]}' "$F" | docker exec -i "$C" curl -sf -X POST -H 'Content-Type: application/json' --data-binary @- http://db:5984/swarmpit/_bulk_docs` [ASSUMED: anonymous `_bulk_docs` write is permitted while `_security` is empty in CouchDB 2.3.0; not tested].

### Snapshot (each step, pre and post)
```bash
<ssh micro> 'cat /mnt/gluster/deployment/swarm/swarmpit.yml' > .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml
grep -Eic 'pass|secret|token|pbkdf2|admins' .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml   # expect 0
<ssh micro> 'cd /mnt/gluster/deployment/swarm && cp -p swarmpit.yml swarmpit.yml.bak.$(date -u +%Y%m%d%H%M%S).p28-A-pre'
```

### Step A apply
```bash
<ssh micro> 'cd /mnt/gluster/deployment/swarm && cp -p swarmpit/influxdb.conf /root/phase28/influxdb.conf.A.pre
  # edit: drop SWARMPIT_INFLUXDB line, the influxdb: service block, the influx-data: volume decl (deterministic awk/sed or python)
  docker stack config -c swarmpit.yml >/dev/null && echo parse_ok
  docker stack deploy --resolve-image changed -c swarmpit.yml swarmpit
  docker service rm swarmpit_influxdb'
# readiness: /version statistics=false; new app task logs "Swarmpit running on port 8080" and NO "Waiting for InfluxDB"; +60 s
```

### D-13 mount scan (union of listings)
```bash
<ssh micro> 'ids=$( { for i in 1 2 3; do docker service ls -q; done; for st in $(docker stack ls --format "{{.Name}}"); do docker stack services "$st" -q; done; } | sort -u )
  echo "services_scanned=$(echo "$ids" | wc -l)"
  for id in $ids; do docker service inspect "$id" --format "{{.Spec.Name}} {{range .Spec.TaskTemplate.ContainerSpec.Mounts}}{{.Source}} {{end}}"; done | grep -c "swarmpit/influxdb.conf"'
# expect 0 after swarmpit_influxdb is removed; then rm the file (D-13)
```

### Gate measurement (Mac)
```bash
SHA=$(git rev-parse HEAD); git push origin thinx-staging   # gate commit, signed
# poll CircleCI (bounded, e.g. 40 × 15 s) for api-registry success on $SHA, then read push end_time + digest (see §SLA clock)
<ssh micro> 'T=$(docker service ps thinx_api -q --filter desired-state=running | head -1);
  docker inspect "$T" --format "{{json .Status.Timestamp}} {{.Status.State}} {{.Spec.ContainerSpec.Image}}" | sed -E "s/(sha256:.{12}).*/\1/"'
curl -s -o /dev/null -w '%{http_code}\n' https://rtm.thinx.cloud/api/v2/csrf-token   # expect 200
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Swarmpit 1.9 (Debian 9, JDK 8, no HEALTHCHECK) | 1.10 (bookworm, JDK 17, image HEALTHCHECK, timbre logging) | tag 2026-03-04, released 2026-04-16 | Pitfall 1, log hygiene |
| `swarmpit/agent:2.2` | `swarmpit/agent:latest` (no new version tags) | rebuilt 2026-08-21 | Production already on it |
| Default Docker client API 1.30 | 1.44 | 1.10 | Irrelevant while the env pin stays |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Swarm replaces a task whose container turns `unhealthy` | Pitfall 1 | If wrong, the override is merely harmless |
| A2 | `/version` on the 1.10 image reports `1.10-SNAPSHOT` (or `1.10`) | Pitfall 8 | The regex `^1\.10` covers both |
| A3 | Anonymous `_bulk_docs` restore works on CouchDB 2.3.0 with empty `_security` | D-07 restore | Restore would need the CouchDB admin credentials (hash only on disk) or a volume restore. The dump itself is unaffected |
| A4 | A missing bind source fails the task at deploy (rollback A ordering) | Rollback | Low. The recipe restores the file first regardless |
| A5 | CircleCI honours `[ci skip]`/`[skip ci]` in the head commit message | D-11a caveats | Low. Simply avoid the strings |
| A6 | Core has no `swarmpit_influx-data` volume (placement was micro-only since 2026-06-11, and `swarmpit.influx-data` is labelled only on micro) | D-14 | A leftover volume on core stays. Check it in Step C via the core alias |
| A7 | docker/cli `deployServices` semantics at v29.0.0 are unchanged in 29.8.1 | Stack deploy semantics | Low. Post-deploy task-ID assertions catch any deviation |

## Open Questions

1. **Re-measure after rung 1 (D-11).** The SLA clock starts at a registry push, so a meaningful re-measure needs a **new gate push** after rung-1 readiness. Recommendation: rung 1 → readiness → a second evidence commit (recording the failure and rung 1) → measure. Note that if the first push's digest is still pending, rung 1 alone makes autoredeploy fire on its first poll; record that as well.
2. **Baseline gate on 1.9 before Step A?** Not required by D-08. Recommendation: measure the last pre-window planning push passively and record it in Step 0 evidence. It is free and proves the measurement pipeline.
3. **`swarmpit/influxdb.conf.bak.20260521200918`.** D-13 names only `influxdb.conf`. Recommendation: delete it too, with a copy in `/root/phase28/`, since nothing references it. Otherwise record it as kept.
4. **Gluster git repo commit.** Phase 27 made an index-only commit there (author `micro`, unsigned). It is not required by D-17. Recommendation: skip it, because the working tree carries unrelated uncommitted edits. The `.planning` snapshots are the audit trail.
5. **Lifetime of `/root/phase28` (dump + saved conf)** after the phase. Recommendation: shred at phase close (after Gate B and Step C), as Phase 27 did with its backups. Record the deletion.
6. **Out-of-scope follow-ups to record (no action):** the double `swarmpit.db-data` label; autoredeploy labels on `thinx_couchdb`/`thinx_influxdb` (dhi.io 401 every minute; thinx stack, so D-17 excludes it); the stale `swarmpit.influx-data` label on micro.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| ssh to micro (manager) | all steps | ✓ | — | — |
| ssh to core | D-14 core volume check only | not exercised (not covered by micro allow rules) | — | `docker node inspect core` covers the engine gate. Skip or ask for the core check |
| Docker CLI on micro | stack deploy/config | ✓ | 29.8.1 | — |
| `jq` on micro / Mac | dump counts, CI parsing | ✓ / ✓ | — / 1.7.1 | python3 |
| `curl` in the `swarmpit_app` 1.9 image | D-07 dump | ✓ | — | `docker run --rm --network swarmpit_net curlimages/curl` (attachable overlay) |
| Docker Hub reachability from micro | 1.10 pull, 1.9 re-pull on rollback | ✓ (`manifest inspect` OK) | — | — |
| CircleCI public API | SLA start + digest | ✓ unauthenticated | v1.1 | CircleCI UI step times |
| gpg signing on Mac | gate commits | ✓ gpg 2.5.18, `commit.gpgsign=true` | — | operator "push unsigned" exception (Phase 27 precedent) |
| Free space | dump (~70 KB) | micro `/` 17G free; gluster 7.1G free (86%) | — | — |

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`. The orchestrator asked for this section anyway, so it lists ops assertions instead of a test framework. There are no code changes and no unit tests.

| Req | Assertion | Command (from repo root, Mac) | When |
|---|---|---|---|
| D-02 | no engine ^29.[0-2]. | Step 0 snippet | Step 0 |
| D-06/SC4 | db task ID, node and digest equal Step 0; `rows=7`, `migration=3` | Step 0 snippet + dump count re-run (to stdout counts only, not to file) | after A, after B |
| OPS-SWARM-02 | `/version` `statistics:false`; `swarmpit_influxdb` absent (`docker service inspect swarmpit_influxdb` errors); mount scan 0; `thinx_influxdb` Running, same task ID | §Code Examples | after A |
| OPS-SWARM-01 | `/version` `version` ~ `^1\.10`, `docker.api` 1.44; app task healthy; log `Swarmpit DB already exist`, **no** `Change reg types finished`/`Single node setup finished`/`Default token secret created` | `<ssh micro> 'docker service logs swarmpit_app --since 10m 2>&1 \| grep -cE "Single node setup finished\|Change reg types finished\|Default token secret created"'` → 0 | after B |
| Gate A/B (D-09/D-10) | delta ≤ 300 s, digest match, csrf-token 200 | §Gate measurement | each gate |
| D-04 | agent task IDs and digest `1306e2a2f538` unchanged | Step 0 snippet | after B |
| D-14 | volume name/node/size recorded, then gone | `<ssh micro> 'docker volume ls -q \| grep -c "^swarmpit_influx-data$"'` → 0 | Step C |
| D-12 | REQUIREMENTS has OPS-SWARM-03 under future with the reason; ROADMAP SC3 dropped | `grep -n "OPS-SWARM-03" .planning/REQUIREMENTS.md .planning/ROADMAP.md` | Step C |
| Hygiene | no IP/key/port/credential in committed evidence | the Phase 27 diff-hygiene scan (`DIFF-HYGIENE-OK`, patterns built at runtime from `~/.aliases`, never written into a committed file) plus `grep -c pbkdf2` → 0 over `git diff origin/thinx-staging..HEAD`. Note: 28-CONTEXT.md D-15 already carries the ssh line on the branch (as do 18+ earlier files); the operator waived that same hit in Phase 27 | before every push |

## Security Domain

`security_enforcement` is absent from the config (treated as enabled).

| ASVS Category | Applies | Control |
|---|---|---|
| V2 Authentication | yes (Swarmpit UI login unchanged; 1.10 adds min length on admin creation only) | no change |
| V4 Access Control | yes | Swarmpit stays behind the Traefik `https-redirect` + TLS routers. Labels unchanged |
| V6 Cryptography / secrets | yes | Registry creds stay in `swarmpit_db`. The dump is root-only `0600` under `/root/phase28`, never printed or committed. `couchdb-logging.ini` (admin hash) is never snapshotted |
| V7 Logging | yes | 1.10 ERROR logs include request headers and bodies (partially masked), so evidence carries counts and short digests only |
| V14 Config | yes | Image by tag (D-03); `--resolve-image changed` prevents an unreviewed agent `latest` drift |

| Threat | STRIDE | Mitigation |
|---|---|---|
| Credential leak via dump/snapshot/logs | Information disclosure | umask 077 dump, grep gate on snapshots, the hygiene grep before push |
| Deploy path outage (autoredeploy dead) | Denial of service | per-step gate, rung 1, snapshot rollback, `docker service update` on thinx_api remains a manual fallback (never restart.sh) |
| Silent spec drift / unintended agent upgrade | Tampering | drift diff = 0 recorded; `--resolve-image changed`; post-deploy task-ID/digest assertions |

## Sources

### Primary (HIGH confidence)
- Swarmpit source, `git diff 1.9 1.10` (github.com/swarmpit/swarmpit): config, database, couchdb client and migration, agent, setup, server, api, http, log, users, Dockerfile, docker-compose.yml
- GitHub API: swarmpit releases (1.10 notes), swarmpit/agent tags and commits; Docker Hub tags API for swarmpit/swarmpit and swarmpit/agent
- docker/cli `cli/command/stack/deploy_composefile.go` @ v29.0.0; `docker stack deploy --help` on micro (CLI 29.8.1)
- moby/buildkit Dockerfile reference (HEALTHCHECK defaults)
- Live swarm (read-only): engine and node inspect, service inspect, logs, volumes, swarmpit_db counts, stack file, gluster git status, unattended-upgrades log, journal
- Repo: `.circleci/config.yml:938-951, 376-383`, `Dockerfile:79-80, 130`, `.dockerignore`; CircleCI public API v1.1 builds #15597, #15683

### Secondary (MEDIUM)
- `.planning/research/STACK.md` §#12, `ARCHITECTURE.md` §12, `PITFALLS.md` Pitfall 12, `runbooks/swarm.md`, `runbooks/influxdb2-upgrade.md` (Annex + Phase 28 follow-ups), memory notes

## Metadata

**Confidence breakdown:**
- Engine, stack file, drift, db contents, D-11a, SLA method: HIGH (live and source reads this session)
- 1.9→1.10 compatibility (no migration, CouchDB 2.3.0, influx-off): HIGH from source; runtime on this swarm not trialled (MEDIUM)
- Healthcheck restart-loop risk: MEDIUM (defaults verified, boot time measured once under contention)

**Research date:** 2026-10-04
**Valid until:** live-state facts until the next swarm change or dockerd bounce (re-read in Step 0); upstream facts for 30 days
