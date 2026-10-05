# Phase 27: InfluxDB 2 Upgrade - Research

**Researched:** 2026-10-02
**Domain:** InfluxDB 1.8 → 2.9 storage migration on Docker Swarm (GlusterFS), Node.js v2 client + Flux, CI on InfluxDB 2
**Confidence:** HIGH. The upgrade, backup/restore, client, Flux, bucket API and edge-auth behaviour were all rehearsed end to end on local Docker with the exact images. Production facts come from read-only inspection on 2026-10-02.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Retention vs. history
- **D-01:** **Trim to 90 days.** All `stats` data is migrated, and the 90-day bucket then expires older points. "No history lost" in success criterion 1 means *nothing within the last 90 days is lost*. Older history survives only in the 1.8 backup (D-02). — **Reversibility:** one-way — once the retention runs and the backup is deleted, history older than 90 days is gone for good.
- **D-02:** The verified 1.8 backup is kept **only until Phase 27 verification passes**. It is then deleted at an operator checkpoint, together with the 1.8 data directory (D-07). — **Reversibility:** one-way — deleting the backup removes the last copy of pre-90-day history and the restore path.
- **D-03:** The 90-day retention is defined **in code and repaired at API boot**. `InfluxConnector.provisionDB()`'s 1.x CREATE/ALTER RETENTION POLICY logic is replaced by an idempotent "ensure bucket `stats` exists with 90d retention, repair if it drifted" step at boot, in the spirit of Phase 26's rev-aware design-doc upsert. The step never crashes boot and logs one clear line per action.
- **D-04:** For that boot repair, the API holds an **org all-access token**, which can create and update buckets (see D-10). The operator accepted the wider blast radius in exchange for real self-healing and a zero-step fresh install.

#### Migration & downtime
- **D-05:** Migration uses the **official in-place upgrade**. 1.8 is stopped, the v2 image's `influxd upgrade` runs against a **copy** of the 1.8 data into a new v2 data directory, and that creates buckets plus DBRP mappings. The original 1.8 directory stays untouched as the instant rollback. — **Reversibility:** costly — rollback means repointing the service at the old image and the untouched 1.8 directory; stats written to v2 after cutover are lost in a rollback.
- **D-06:** **A short stats write gap is acceptable.** Writes are fire-and-forget (`writePoint` logs and swallows errors), so only stats points are lost while InfluxDB is down. Cut over in a quiet hour, outside 01:00–05:00 UTC (CouchDB compaction) and 09:25–10:15 UTC (the 09:40 retention job). There is no write buffer and no dual-write.
- **D-07:** The 1.8 data directory and the backup are removed **together, after Phase 27 verification passes**, at an operator checkpoint (D-02). That needs a dashboard showing non-zero figures, check-ins flowing, CI green and the 90-day bucket confirmed.
- **D-08:** The production image is **`dhi.io/influxdb:2`**, the hardened image that `docker-compose.yml` already names and that matches the CouchDB DHI move. Research must confirm the `influx` CLI and `influxd upgrade` exist in it; Phase 26 found DHI CouchDB had no curl. If they are missing, run the upgrade, backup and token steps from a one-shot official `influxdb:2` container while production runs DHI.

#### Client & auth
- **D-09:** `influx.js` moves to the **v2 client** (`@influxdata/influxdb-client`, plus `@influxdata/influxdb-client-apis` for bucket admin) with **Flux** queries. The v1-only `influx` npm package (unmaintained) is removed. The four count queries (`query`, `queryOwner`, `today`, `week`) are rewritten in Flux with the same results. The InfluxQL injection surface (`owner_id` and measurement interpolated into query strings) goes away; Flux parameters or validated values are used instead.
- **D-10:** The API authenticates with a **dedicated THiNX-org all-access token** stored as swarm secret **`INFLUXDB_TOKEN`** and read via `readSecret()`, following the Phase 24 pattern (24-CONTEXT D-01/D-02/D-10). With no token, stats are disabled gracefully, as Phase 24 D-02 requires: no crash, a log line, the dashboard shows zero. — **Reversibility:** reversible.
- **D-11:** The **operator token and initial admin password** that the upgrade produces are stored as **swarm secrets that no service mounts** (for example `INFLUXDB_OPERATOR_TOKEN` and `INFLUXDB_ADMIN_PASSWORD`). They are never put in env, the repo, planning docs, logs or the transcript, and are used only by an operator for admin and rotation.
- **D-12:** The **measurement and tag schema stays identical**, so migrated history and new points line up, with one exception: `APIKEY_INVALID` (`lib/thinx/apikey.js:210`) and `LOGIN_INVALID` (`lib/router.auth.js:44`) **stop storing the raw rejected key or login data** in the `data` tag. They store a short non-reversible hash or nothing (planner's choice). Points already migrated keep their old tags and age out within 90 days (D-01). Nothing is scrubbed.

#### Dependents & exposure
- **D-13:** **Chronograf 1.9 is retired.** The service is removed from `docker-swarm.yml` and from the production gluster `thinx.yml`. Its gluster volume `/mnt/gluster/thinx/chronograf` is kept until verification and then removed with D-07. InfluxDB 2's built-in UI replaces it. A side effect is that `restart.sh` no longer resets a Chronograf password.
- **D-14:** The **public `INFLUX_HOSTNAME` route stays**. It is protected by the **existing `influx-auth` Traefik basic-auth middleware, plus InfluxDB 2's own login, over HTTPS only**. The HTTP router is fixed so it only redirects to HTTPS. Today a later `middlewares=influx-auth,error-pages-middleware` label overrides `https-redirect` in the repo file, so plain HTTP is served.
- **D-15:** The **`db0` and `swarmpit` databases** that the upgrade turns into buckets are **dropped after research confirms nothing writes to them**. Swarmpit's own stats use the separate `swarmpit_influxdb` service. After that only `stats` remains. 1.x `_internal` monitoring has no v2 equivalent and is not carried over. If research finds a live writer, stop and ask; do not drop.
- **D-16:** InfluxDB 2 is configured **via `INFLUXD_*` environment variables only**, with no config file. Only the data directory is mounted. The `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf` mount is removed (success criterion 5). Research checks what that 1.8 conf overrides and carries any still-relevant setting over as an env var.

#### Prior decisions that still apply
- **First step: a separate verified backup of `/mnt/gluster/thinx/influx`.** The DigitalOcean VM snapshots of both nodes, taken 2026-10-02, do not cover GlusterFS. Take the backup with `influxd backup -portable` from the running 1.8 container. Test-restore it into a throwaway 1.8 container and compare `stats` counts with production (counts only). Store it outside the data path. (Folded todo, below.)
- **Production change discipline (Phases 25/26):**
  - The executor runs read-only and timed steps itself and **stops at a `checkpoint:decision` before every one-way step** (cutover, bucket drops, backup and 1.8 deletion).
  - One service at a time with `docker service update`, never `restart.sh` or a stack deploy.
  - Push `thinx-staging` only.
  - Query placement first. `docker exec` is node-local and `name=influxdb` matches both InfluxDBs, so target `thinx_influxdb` by name.
  - Production output is aggregates only.

### Claude's Discretion
- Whether the `APIKEY_INVALID`/`LOGIN_INVALID` tag holds a short hash or is dropped (D-12).
- The org and bucket naming inside InfluxDB 2, as long as the API's bucket is `stats`.
- The CI setup for InfluxDB 2: the test compose uses `influxdb:2` setup-mode env with a throwaway test token. CI must run the influx specs against v2 (success criterion 3).
- Making the InfluxDB URL configurable (it is hard-coded `influxdb:8086` today) while keeping `influxdb:8086` the default.

### Folded Todos
- **"Back up the GlusterFS InfluxDB data before the Phase 27 upgrade"** (`.planning/todos/pending/2026-10-02-backup-gluster-influx-data-before-phase-27.md`). The operator's DigitalOcean snapshots don't cover gluster. This becomes the phase's first task and satisfies the backup half of success criterion 1. Retention of that backup follows D-02.

### Deferred Ideas (OUT OF SCOPE)
- Downsampling or rollups for long-term trends. The operator chose a plain 90-day trim (D-01).
- Scrubbing the rejected-key tag from already-migrated `APIKEY_INVALID` points. Not needed, because they age out within 90 days (D-12).

Reviewed todos (not folded), unrelated to InfluxDB: "Split Rollbar server and client tokens", "Resolve legacy FIXMEs in owner.js and transfer.js", "Answer a failed Bearer verification with 401, not 403", "Fix worker builder service polling completion detection".
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-INFLUX-01 | `thinx_influxdb` runs InfluxDB 2 in production, upgraded from a verified backup, with existing `stats` data migrated | §Upgrade path (rehearsed: bucket naming, DBRP, env-only secrets), §Backup & verified restore, §Cutover runbook, §Rollback |
| OPS-INFLUX-02 | `lib/thinx/influx.js` reads and writes against InfluxDB 2, the dashboard / Visits statistics still render, and CI runs the influx specs against InfluxDB 2 | §Client (singleton WriteApi, Flux parameters, identical counts), **Finding F-1: the V2 stats routes return `no_results` today**, §CI on InfluxDB 2 |
| OPS-INFLUX-03 | `stats` data has a finite 90-day retention (bucket retention) | §Boot ensure-bucket (rehearsed create / repair / unchanged / 404 / 422), rename `stats/autogen` → `stats` |
</phase_requirements>

## Summary

The upgrade path works with the production image. `dhi.io/influxdb:2` resolves to **InfluxDB v2.9.1** (DHI label `2.9.1-debian13`, same digest as `dhi.io/influxdb:2.9.1`). It contains `influxd upgrade` but **no `influx` CLI, no shell and no curl**, and it runs as **uid 65532**. The upgrade itself can run from the DHI image. Every admin step afterwards (onboarding in CI, bucket rename/delete, token creation, checks) needs a one-shot **official `influxdb:2.9.1`** container (CLI 2.8.0) on the attachable `thinx_internal` overlay. The rehearsal on a production-shaped 1.8 instance gave equal per-measurement counts before and after. It also showed that the upgrade passes secrets through `INFLUXD_*` env vars with no argv. **It names the migrated bucket `stats/autogen` (retention infinite), not `stats`**, so a rename plus a retention change is required. A PATCH keeps the bucket ID, so the DBRP mapping survives.

Production is small and quiet: `stats` holds 2,361 points across its 7 real measurements, plus 10 junk single-point measurements from 2023-11. In the last 7 days only 19 points were written, all to `stats`. `db0` and `swarmpit` have **0 series and 0 writes**. There is no live writer, so D-15 can proceed. There is one latent writer: `swarmpit_app` uses `SWARMPIT_INFLUXDB=http://influxdb:8086` and is attached to `traefik-public`, where the alias `influxdb` is `thinx_influxdb`. Today it resolves to `swarmpit_influxdb`. The `swarmpit` database inside `thinx_influxdb`, created 2026-03-08 with Swarmpit's four CQs, shows that the lookup has flipped before.

Two code findings change the plan's scope:

- **F-1:** the Vue dashboard's InfluxDB-backed figures show 0 today, whatever is stored. `Statistics.today_V2`/`week_V2` pass only the first callback argument (`true`) to the router, so `/api/v2/stats` and `/api/v2/stats/today` always answer `{"success":false,"response":"no_results"}`, and a ZZ spec pins that response. Success criterion 2 (non-zero dashboard) therefore needs that wrapper fixed and the response reshaped to `{KPI:[count]}`, the shape the Vue `extractMetric` and the Cypress fixtures already expect.
- **F-2:** the D-14 "basic-auth edge plus InfluxDB login" can only work if the edge credentials *equal* the InfluxDB user's credentials. The UI's `POST /api/v2/signin` carries its own `Authorization: Basic` header, and Traefik validates that header too. This was rehearsed.

**Primary recommendation:** Ship the v2 connector dormant first (no `INFLUXDB_TOKEN` means stats are disabled). Then cut over in one window: verified portable backup, scale 1.8 to 0, copy, `influxd upgrade` (DHI, uid 65532, env-file secrets), one combined `docker service update` to `dhi.io/influxdb:2.9.1`, rename `stats/autogen` to `stats`, then a **checkpoint** before `--secret-add INFLUXDB_TOKEN thinx_api`. That rollout is the step that applies the 90-day trim at boot, and it is one-way.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stats event write (`statsLog`) | API / Backend (`lib/thinx/influx.js`) | Database (InfluxDB 2 `stats` bucket) | Fire-and-forget from request handlers; must never affect devices/builds/logins |
| Daily/weekly KPI counts | API / Backend (`influx.js` Flux, `statistics.js`, `router.user.js`) | Database | Owner comes from the session; the Flux parameter carries it |
| 90-day retention + drift repair | API / Backend (boot ensure step) | Database (bucket `retentionRules`) | D-03: retention is defined in code and repaired at boot |
| Dashboard rendering | Browser (Vue `Visits.vue`) | — | Already consumes `{KPI:[n]}`; no Vue change needed |
| Upgrade / backup / token minting | Ops (one-shot containers on swarm nodes) | — | DHI has no CLI or shell; operator-only secrets (D-11) |
| Edge exposure of the InfluxDB UI | Edge (Traefik `thinx-influx-*` routers) | Database (InfluxDB login) | D-14; see F-2 |
| CI InfluxDB | CI (docker compose test stack) | — | Success criterion 3 |

## Standard Stack

### Core
| Library / Image | Version | Purpose | Why Standard |
|---|---|---|---|
| `@influxdata/influxdb-client` | **1.35.0** (published 2024-08-15, current stable; only nightlies since) | WriteApi, QueryApi, `flux` template, `Point` | Official InfluxData JS client; CommonJS `require` export (`"require": "./dist/index.js"`); verified working on `node:26-alpine` [VERIFIED: npm registry + local run] |
| `@influxdata/influxdb-client-apis` | **1.35.0** | `BucketsAPI`, `OrgsAPI` | Official generated management APIs; peerDependency `@influxdata/influxdb-client: '*'` [VERIFIED: npm registry] |
| `dhi.io/influxdb` | **`2.9.1`** (digest `sha256:3d49ee8e…c0bb`, same as `:2` on 2026-10-02) | Production server + `influxd upgrade` | D-08; Debian 13, CIS, uid 65532 [VERIFIED: docker image inspect] |
| `influxdb` (official) | **`2.9.1`** (`INFLUX_CLI_VERSION=2.8.0`, Debian 12) | One-shot CLI: setup, bucket/auth admin, v1 checks | DHI ships no `influx` binary [VERIFIED: docker run] |
| `influxdb` (official) | `1.8` (production runs v1.8.10) | Throwaway restore-test container | Already present on `core` (the running image) |

### Removed
| Library | Why |
|---|---|
| `influx` ^5.11.0 (node-influx, 1.x only) | D-09. Also remove its 4 entries in `scripts/aikido-known-false-positives.json` (lines 20–27); they reference the deleted InfluxQL strings |

**Installation:**
```bash
npm uninstall influx
npm install --save @influxdata/influxdb-client@1.35.0 @influxdata/influxdb-client-apis@1.35.0
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @influxdata/influxdb-client | npm | 1.35.0 since 2024-08; package since 2020 | 188,546/wk | github.com/influxdata/influxdb-client-js | OK | Approved |
| @influxdata/influxdb-client-apis | npm | 1.35.0 since 2024-08 | 64,937/wk | github.com/influxdata/influxdb-client-js | OK | Approved |

`postinstall`: null for both [VERIFIED: gsd-tools package-legitimacy check + npm view].
**Packages removed due to [SLOP] verdict:** none. **Packages flagged [SUS]:** none.

## Production Facts (read-only inspection, 2026-10-02 ~13:30 UTC)

| Fact | Value | Source |
|---|---|---|
| `thinx_influxdb` placement | **core** (`influxdb:1.8`, running 31 h) | `docker service ps` from micro [VERIFIED] |
| Server version | `InfluxDB v1.8.10` | `docker exec … influxd version` on core [VERIFIED] |
| Databases | `db0`, `_internal`, `stats`, `swarmpit` | `SHOW DATABASES` [VERIFIED] |
| `stats` RPs | `autogen,0s,168h0m0s,1,true` and `31d,744h0m0s,24h0m0s,1,false` | `SHOW RETENTION POLICIES ON "stats"` [VERIFIED] |
| `db0` RPs | `autogen,2160h0m0s,168h0m0s,1,true` (no data dir on disk) | [VERIFIED] |
| `swarmpit` RPs | `autogen 0s` (not default), `an_hour 1h` (default), `a_day 24h`; 4 CQs (`cq_tasks_1m`, `cq_hosts_1m`, `cq_services_1m`, `cq_max_usage_services_30m`) | `SHOW CONTINUOUS QUERIES` [VERIFIED] |
| Series cardinality | `stats: 301`, `db0: 0`, `swarmpit: 0` | `SHOW SERIES CARDINALITY` [VERIFIED] |
| Writes in last 7 days, per db | `_internal`: 3,698,585 points; **`stats`: 19 points / 19 requests**; `db0`, `swarmpit`: none | `_internal.monitor.shard` spread of `writePointsOk` grouped by `database` [VERIFIED] |
| `stats` all-time counts | APIKEY_INVALID 4, BUILD_STARTED 21, BUILD_SUCCESS 9, DEVICE_CHECKIN 539, DEVICE_NEW 8, DEVICE_REVOCATION 3, LOGIN_INVALID 1777, plus 10 junk measurements (`aui: n`, `cle: p`, …) of 1 point each from 2023-11 | [VERIFIED] |
| `stats` last 90 d | BUILD_STARTED 12, BUILD_SUCCESS 9, DEVICE_CHECKIN 45, LOGIN_INVALID 438 | [VERIFIED] |
| `stats` last 7 d | BUILD_STARTED 5, BUILD_SUCCESS 7, LOGIN_INVALID 14 (**no DEVICE_CHECKIN since 2026-07-25T11:54Z**) | [VERIFIED] |
| Field type | `value` is **float** in every measurement | `SHOW FIELD KEYS` [VERIFIED] |
| Tag keys | `data`, `owner` on all 7 real measurements | `SHOW TAG KEYS` [VERIFIED] |
| `data` tag shapes | APIKEY_INVALID: 2 distinct **64-hex values** (raw API keys); LOGIN_INVALID: 5 distinct short labels (12–17 chars, `[a-z_0-9]`); DEVICE_CHECKIN: 36-char udids | aggregate classification only, no values printed [VERIFIED] |
| 1.x users | none (`SHOW USERS` returned only a header); auth is off | [VERIFIED] |
| On-disk size | 118 MB total: `data/_internal` 89 MB, `data/stats` 595 KB, `data/swarmpit` 136 KB, `wal` 29 MB, `meta` 12 KB; all owned by `root:root`, data subdirs mode `0700` | `du`, `ls -la`, `stat` [VERIFIED] |
| Gluster free space | `/mnt/gluster` 49 G, 17 G free; micro `/` 18 G free; `/dev/shm` 984 M on micro | `df -h` [VERIFIED] |
| Live mounts | bind `/mnt/gluster/thinx/influx → /var/lib/influxdb`; bind `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf → /etc/influxdb/influxdb.conf` | `docker service inspect` [VERIFIED] |
| Live resources | limits 0.2 CPU / 1 GiB; reservations 0.1 CPU / 512 MiB; **no placement constraint** | [VERIFIED] |
| Networks | `thinx_influxdb` on `thinx_internal` (VIP 10.0.2.18) and `traefik-public` (VIP 10.0.1.57), alias `influxdb` on both; `thinx_internal` is `attachable=true`, `traefik-public` is not | `docker network inspect` [VERIFIED] |
| Swarmpit | `swarmpit_app` env `SWARMPIT_INFLUXDB=http://influxdb:8086`, networks `swarmpit_net` + `traefik-public`; `swarmpit_influxdb` (influxdb:1.7) only on `swarmpit_net` (VIP 10.0.5.5); `getent hosts influxdb` inside `swarmpit_app` → **10.0.5.5 today** | [VERIFIED] |
| Other dependents | Only `thinx_chronograf` (env `INFLUXDB_URL=http://influxdb:8086`, user `thinxflux`) references influx among the 26 services | env-name scan of all services [VERIFIED] |
| Registry auth on micro | logged in to `dhi.io`, Docker Hub, `registry.thinx.cloud:5000`; `openssl`, `shred`, `jq`, `python3` present | [VERIFIED] |

### D-16: what `swarmpit/influxdb.conf` overrides (non-comment lines, verbatim)
```
[meta]
  dir = "/var/lib/influxdb/meta"
[data]
  dir = "/var/lib/influxdb/data"
  engine = "tsm1"
  wal-dir = "/var/lib/influxdb/wal"
  cache-max-memory-size = "256m"
  cache-snapshot-memory-size = "25m"
  max-concurrent-compactions = 1
[logging]
  level = "error"
  suppress-logo = true
```
[VERIFIED: read on micro]. The file was last changed 2026-05-21 (`thinx.yml.bak.20260521200918.influx-oom-fix`). **`swarmpit_influxdb` mounts the same file** (`swarmpit.yml:72`), so it stays where it is and only `thinx_influxdb` drops the mount.

| 1.8 setting | InfluxDB 2 env | Keep? |
|---|---|---|
| meta/data/wal dirs | `INFLUXD_BOLT_PATH=/var/lib/influxdb2/influxd.bolt`, `INFLUXD_ENGINE_PATH=/var/lib/influxdb2/engine` | **Yes.** The DHI defaults are `/home/nonroot/.influxdbv2/…`, which is not persistent [VERIFIED: `influxd --help`] |
| `cache-max-memory-size = "256m"` | `INFLUXD_STORAGE_CACHE_MAX_MEMORY_SIZE=256m` | **Yes.** The v2 default is 1.0 GiB, equal to the 1 GiB service limit, and this was the OOM fix. `256m` was accepted on start [VERIFIED] |
| `cache-snapshot-memory-size = "25m"` | (default 25 MiB) | Omit; same as default [VERIFIED: `--help`] |
| `max-concurrent-compactions = 1` | `INFLUXD_STORAGE_MAX_CONCURRENT_COMPACTIONS=1` | **Yes.** 0.2 CPU limit [VERIFIED accepted] |
| `level = "error"` | `INFLUXD_LOG_LEVEL=error` | Yes. v2 supports debug/info/error [VERIFIED: `--help`] |
| `suppress-logo` | — | No v2 equivalent |
| — | `INFLUXD_REPORTING_DISABLED=true` | Recommended; v2 sends telemetry to telemetry.influxdata.com every 8 h by default [VERIFIED: `--help`] |

The DHI image sets `INFLUXD_CONFIG_PATH=/etc/influxdb/` [VERIFIED: image env]. Nothing is mounted there, so influxd reads no config file and env alone configures it.

## Architecture Patterns

### System Architecture Diagram (target state)

```
 device check-in / build / login / API-key check
        │  (request handlers: device.js, builder.js, notifier.js, devices.js, apikey.js, router.auth.js)
        ▼
 InfluxConnector.statsLog(owner, EVENT, data)
        │  console line "[OID:owner] [EVENT] <data>" (still feeds legacy file ETL in statistics.js)
        │  if no INFLUXDB_TOKEN ──► return (stats disabled, logged once)
        ▼
 shared WriteApi (org thinx, bucket "stats", precision ms, floatField value=1)
        │  writePoint + flush().catch(log)  ── outage: bounded retries, never throws
        ▼
 thinx_influxdb  (dhi.io/influxdb:2.9.1, uid 65532, /mnt/gluster/thinx/influxdb2, env-only config)
        ▲                                   ▲                              ▲
        │ Flux (QueryApi, flux`` params)    │ BucketsAPI/OrgsAPI at boot   │ Traefik thinx-influx-https
        │                                   │ ensure "stats" = 90d         │ (influx-auth + v2 login, HTTPS only;
 GET /api/v2/stats{,/week,/today}           │ (create / adopt / repair /   │  http router = https-redirect only)
   → Statistics.week_V2/today_V2            │  unchanged; never throws)    │
   → {success:true, response:{KPI:[n]}}     │                              operator browser
        ▼                                   │
 Vue Visits.vue extractMetric(data,key) → data[key][0]
```

### Recommended file layout
```
lib/thinx/influx.js          # rewritten connector: config, disabled mode, WriteApi singleton, Flux counts, ensureStatsBucket
lib/thinx/statistics.js      # fix today_V2/week_V2 to forward (success, body)
thinx-core.js                # boot: InfluxConnector.ensureStatsBucket() replaces createDB('stats') (~L166)
spec/jasmine/InfluxSpec.js            # rewritten: real assertions against v2 (write→flush→count)
spec/jasmine/InfluxRetentionSpec.js   # rewritten: bucket ensure created/updated/unchanged/adopted, no unhandled rejection
spec/jasmine/StatisticsV2Spec.js      # new non-ZZ: week_V2/today_V2 deliver {KPI:[n]} (CI runs only non-ZZ)
docker-compose.test.yml      # influxdb → dhi.io/influxdb:2.9.1 + influxdb-setup one-shot; api env INFLUXDB_TOKEN
docker-compose.yml           # dev: same env-only shape
docker-swarm.yml             # influxdb: image/mount/env/labels; chronograf removed
.circleci/config.yml         # dhi.io login before "Starting Influx"; run influxdb-setup
```

### Pattern 1: Upgrade invocation (rehearsed, secrets never on argv)
```bash
# Source: local rehearsal 2026-10-02 against dhi.io/influxdb:2.9.1; flags from `influxd upgrade --help`
# Paths are the proposed production ones. ENV FILE holds INFLUXD_USERNAME/PASSWORD/TOKEN/ORG/BUCKET/RETENTION.
docker run --rm --network none \
  --env-file /dev/shm/p27/upgrade.env \
  -v /mnt/gluster/thinx/influx-v1-upgrade-src:/v1:ro \
  -v /mnt/gluster/thinx/influxdb2:/var/lib/influxdb2 \
  dhi.io/influxdb:2.9.1 upgrade --force \
    --v1-dir /v1 \
    --engine-path /var/lib/influxdb2/engine \
    --bolt-path /var/lib/influxdb2/influxd.bolt \
    --continuous-query-export-path /var/lib/influxdb2/v1-continuous-queries.txt \
    --log-path /var/lib/influxdb2/upgrade.log
```
The rehearsal verified the following:
- `INFLUXD_USERNAME`, `INFLUXD_PASSWORD`, `INFLUXD_TOKEN`, `INFLUXD_ORG`, `INFLUXD_BUCKET` and `INFLUXD_RETENTION` are honoured with `--force`, with no prompt and nothing on argv [VERIFIED].
- `:ro` on the v1 source works, and `--network none` works.
- `--influx-configs-path` should be left at its default. The CLI config holding the **operator token in plaintext** then goes to `/home/nonroot/.influxdbv2/configs` *inside the container* and vanishes with `--rm`. Pointing it into the data dir leaves the token on gluster [VERIFIED: the file contained the token].
- `upgrade.log` and the CQ export contain no token [VERIFIED: grep count 0].
- `--retention`/`--bucket` only create the extra **primary bucket**. Migrated buckets keep their RP durations [VERIFIED].
- The upgrade aborts if the target already has files, unless `--overwrite-existing-v2` is given. A retry needs an emptied target dir [CITED: `--help` text].

Output of the rehearsal on production-shaped meta [VERIFIED]:

| Bucket created | Retention | DBRP mapping |
|---|---|---|
| `stats/autogen` | **infinite** | `stats` / `autogen` / default=true |
| `stats/31d` | 744h (empty, "no shards found") | `stats` / `31d` |
| `db0/autogen` | 2160h (empty) | `db0` / `autogen` / default |
| `swarmpit/an_hour`, `swarmpit/a_day`, `swarmpit/autogen` | 1h / 24h / infinite (empty) | 3 mappings |
| `<primary>` (from `INFLUXD_BUCKET`) | from `INFLUXD_RETENTION` | virtual |
| `_monitoring` (168h), `_tasks` (72h) | system | virtual |

`_internal` is **not** migrated [CITED: docs.influxdata.com/influxdb/v2/install/upgrade/v1-to-v2/automatic-upgrade/]. With no 1.x users, the log says "There are no users in 1.x, nothing to upgrade" [VERIFIED]. CQs are exported to a text file, not migrated [VERIFIED].

### Pattern 2: Rename the migrated bucket and set 90 d in one PATCH (keeps DBRP)
```bash
# Source: local rehearsal; official CLI against the v2 server on an attachable network
influx bucket update --id <stats/autogen bucket id> --name stats --retention 90d
# → "stats  2160h0m0s  168h0m0s"; `influx v1 dbrp list` still maps stats/autogen → same bucket ID
influx bucket delete --name stats/31d     # deleting a bucket also removes its DBRP mapping [VERIFIED]
```

### Pattern 3: v2 connector (CommonJS skeleton for `lib/thinx/influx.js`)
```js
// Source: rehearsed probe (/tmp/influx27/js/probe.js) against v2.9.1; typings of @influxdata/influxdb-client 1.35.0
const { InfluxDB, Point, flux, fluxDuration, setLogger } = require('@influxdata/influxdb-client');
const { BucketsAPI, OrgsAPI } = require('@influxdata/influxdb-client-apis');
const { readSecret } = require('./secrets.js');
const EventTaxonomy = require('./event_taxonomy.js');
const Util = require('./util');

const BUCKET = 'stats';
const LEGACY_BUCKET = 'stats/autogen';          // name influxd upgrade gives the migrated data
const RETENTION_SECONDS = 90 * 24 * 3600;       // 7776000 — what `influx bucket list` shows as 2160h0m0s
const url = () => process.env.INFLUXDB_URL || 'http://influxdb:8086';   // [ASSUMED] env name, discretion item
const org = () => process.env.INFLUXDB_ORG || 'thinx';                  // [ASSUMED] org name, discretion item

// Terse logger: the default client logger dumps whole HttpError objects (headers, body).
setLogger({
  error: (msg, err) => console.log(`[influx] ${msg} ${reasonOf(err)}`),
  warn:  (msg, err) => console.log(`[influx] ${msg} ${reasonOf(err)}`),
});

let state; // undefined = not initialised, null = disabled, object = live
function live() {
  if (state !== undefined) return state;
  const token = readSecret('INFLUXDB_TOKEN');
  if (!token) { console.log('ℹ️ [info] [influx] INFLUXDB_TOKEN not set, statistics disabled'); state = null; return null; }
  const client = new InfluxDB({ url: url(), token, timeout: 5000 });
  const writeApi = client.getWriteApi(org(), BUCKET, 'ms', {
    batchSize: 100, flushInterval: 1000,          // tiny volume; writePoint also flushes immediately
    maxRetries: 2, maxRetryTime: 10000, maxBufferLines: 1000,   // bounded memory during an outage
  });
  state = { client, writeApi, queryApi: client.getQueryApi(org()) };
  return state;
}

// counts per KPI for one owner since `start`; always resolves {KPI:[n]} (zeros when disabled/failed)
async function countsByKpi(owner, start) {
  const kpis = EventTaxonomy.names();
  const out = {}; kpis.forEach((k) => { out[k] = [0]; });
  const s = live(); if (!s) return out;
  const q = flux`from(bucket: ${BUCKET})
  |> range(start: ${start})
  |> filter(fn: (r) => r._field == "value" and r.owner == ${owner} and contains(value: r._measurement, set: ${kpis}))
  |> group(columns: ["_measurement"])
  |> count()`;
  try { (await s.queryApi.collectRows(q)).forEach((r) => { out[r._measurement] = [r._value]; }); }
  catch (e) { console.log('[influx] query failed', reasonOf(e)); }
  return out;
}
// today: start = local midnight Date (same as today's code); week: start = fluxDuration('-7d')
```
Write path: build `new Point(measurement).tag('data', …).tag('owner', …).floatField('value', 1).timestamp(new Date())`. Then call `writeApi.writePoint(p)` and `writeApi.flush().then(ok).catch(logAndOk)`. Keep `writePoint(point, callback)` accepting the old `{measurement, tags, fields}` object, because the specs and `statsLog` use that shape.

### Pattern 4: Boot ensure step (never throws, one log line)
Model it on `design_upsert.ensureDesignDoc`: resolve `{ok, action, reason}` and never reject. Use `withTimeout` from `design_upsert.js`, which is exported. `reasonOf` is **not** exported there [VERIFIED: design_upsert.js:144 `module.exports = { canonical, sameDesign, withTimeout, loadPagingDesign, ensureDesignDoc };`], so export it or re-implement it (statusCode / code only).

| Situation | Call | action |
|---|---|---|
| no token | — | `skipped` / `no_token` |
| `getOrgs({org})` fails/empty | — | `skipped` / reason |
| `getBuckets({orgID, name:'stats'})` → **HTTP 404** when absent [VERIFIED] | then `getBuckets({orgID, name:'stats/autogen'})` | — |
| `stats` absent, `stats/autogen` present | `patchBucketsID({bucketID, body:{name:'stats', retentionRules:[{type:'expire', everySeconds:7776000}]}})` | `adopted` |
| both absent | `postBuckets({body:{orgID, name:'stats', retentionRules:[…7776000]}})` | `created` |
| `stats` with `everySeconds !== 7776000` | `patchBucketsID({bucketID, body:{retentionRules:[…7776000]}})` | `updated` |
| `stats` at 7776000 | — | `unchanged` |
| PATCH → **422** "shard-group duration must also be updated to be smaller than new retention duration" | — | `failed` / `422` (log, continue boot) |

The rehearsal checked that `created`, `updated` (from 86400 s) and `unchanged` all behave idempotently [VERIFIED]. The adopt branch removes an ordering hazard. Without it, an API booting against v2 before the operator renames the bucket would create an empty `stats` and split the history from new data. A 422 only arises when the new retention is shorter than the shard-group duration; 90 d is longer than the migrated 7 d SGD [VERIFIED].

### Anti-Patterns to Avoid
- **A new `InfluxDB`/`WriteApi` per `statsLog` call.** Each instance owns a buffer, a flush timer and retry timers. Use one module-level instance.
- **`intField('value', 1)`.** The migrated field is float, and v2 rejects the write: `422 … field type conflict: input field "value" on measurement "DEVICE_CHECKIN" is type integer, already exists as type float dropped=1` [VERIFIED].
- **Throwing on invalid `owner_id` inside `async today/week`.** Today that becomes an unhandled rejection, because `router.user.js` does not await. With Flux parameters the regex is no longer an injection guard. Return zeros instead.
- **Pointing `--influx-configs-path` into the gluster data dir.** It writes the operator token in plaintext there.
- **Reading a token back with `influx auth list`.** v2.9 stores hashed tokens by default (`--use-hashed-tokens … (enabled by default …)`), and `auth list` shows an empty token field [VERIFIED]. Capture a token at creation (`--json | jq -j .token | docker secret create NAME -`) or never.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| 1.x → 2 data conversion | line-protocol export/import scripts | `influxd upgrade` | Copies TSM + WAL, creates buckets + DBRP; rehearsed equal counts |
| Flux string escaping | template literals / regex guards | `flux` tagged template (`fluxString`, `fluxDuration`, Date → time literal, arrays → lists) | Injection probe `x") \|> yield(name: "pwn` became an inert string literal [VERIFIED] |
| Bucket CRUD | raw `fetch` to `/api/v2/buckets` | `BucketsAPI`/`OrgsAPI` | Typed requests; `HttpError.statusCode` for 404/422 handling |
| Write batching/retry | own queue | `WriteApi` options (`maxRetries`, `maxRetryTime`, `maxBufferLines`) | Rehearsed outage: retries bounded, `flush()` rejection catchable, **0 unhandled rejections** [VERIFIED] |
| CI onboarding | custom HTTP calls to `/api/v2/setup` | `influx setup --force` (official CLI one-shot) | Verified against DHI 2.9.1 |

## Runtime State Inventory

This phase is a storage migration, so the state each runtime system holds is listed below.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `/mnt/gluster/thinx/influx` (1.8 TSM/WAL/meta, 118 MB); `stats` (2,361 points), empty `db0`/`swarmpit`, `_internal` (not migrated) | Data migration via `influxd upgrade` into a **new** dir `/mnt/gluster/thinx/influxdb2`; original kept until D-07 |
| Live service config | `thinx_influxdb` spec (image, 2 binds, 3 v1 env vars incl. `INFLUXDB_ADMIN_PASSWORD`, Traefik labels with the http-router override); `thinx_chronograf` (service + `/mnt/gluster/thinx/chronograf`, 76 KB); Swarmpit `SWARMPIT_INFLUXDB=http://influxdb:8086` (DNS-ambiguous) | One combined `docker service update` for influxdb; `docker service rm thinx_chronograf`; Swarmpit untouched (Phase 28), re-check resolution |
| OS-registered state | None. No cron or systemd unit references influx (the retention cron is CouchDB-only, per MEMORY) | None (verified by service/env scan; cron not re-listed: [ASSUMED] none) |
| Secrets/env vars | Live env `INFLUXDB_ADMIN_USER=thinxflux`/`INFLUXDB_ADMIN_PASSWORD` on influxdb and chronograf (v1, unused by v2); gluster `.env` `INFLUXDB_USERNAME/PASSWORD`; new secrets `INFLUXDB_TOKEN` (mounted on `thinx_api` only), `INFLUXDB_OPERATOR_TOKEN` and `INFLUXDB_ADMIN_PASSWORD` (unmounted) | `--env-rm` the v1 vars; create 3 secrets; `docker-swarm.yml` top-level `secrets:` gets `INFLUXDB_TOKEN: external: true` |
| Build artifacts | `node_modules/influx` in images; `scripts/aikido-known-false-positives.json` 4 influx.js entries | Rebuilt by CI image build; delete the 4 FP entries |

**Gluster stack file drift (do not trip on it):** production `thinx.yml` has **no top-level `secrets:` block**. The Phase 24 secrets exist only on the live `thinx_api` service spec, and `restart.sh` would drop them. The gluster swarm repo also has **uncommitted modifications** in `swarmpit.yml`, `swarmpit/influxdb.conf`, `thinx.yml` and `traefik.yml` [VERIFIED: `git status --short`]. Commit only the Phase 27 hunks, the way Phase 25 did (`thinx_api: … (Phase 25)` commit style).

## Backup & Verified Restore (folded todo; rehearsed)

1. On `core` (query placement first), `CID=$(docker ps -q --filter label=com.docker.swarm.service.name=thinx_influxdb)` targets the right container. Never use `name=influxdb`.
2. Record a reference timestamp `T` (UTC), then take the backup: `docker exec $CID influxd backup -portable /tmp/p27-bk`. No `-db` means all databases. The default backup bind `127.0.0.1:8088` is used inside the container, and the conf does not override it [VERIFIED: conf].
3. Copy it out to node-local disk, outside gluster and outside the data path: `docker cp $CID:/tmp/p27-bk /root/phase27/influx-1.8-portable-<ts>`. Then `docker exec $CID rm -rf /tmp/p27-bk`. Make a second copy on micro (`scp`/rsync node to node) and record the size. Estimated size is at most ~120 MB and dominated by `_internal` [ASSUMED: compression ratio unknown].
4. Test restore into a throwaway 1.8 container on the same node: `docker run -d --name p27-restore --network none -v /root/phase27/influx-1.8-portable-<ts>:/backup:ro influxdb:1.8`, then `docker exec p27-restore influxd restore -portable /backup`. A full restore into a **fresh** instance works [VERIFIED]. A second `-db stats` restore onto an instance that already has `stats` fails with `DB metadata not changed. database may already exist` [VERIFIED], so always restore into a fresh container.
5. Compare counts only, bounded by `T` so writes after the backup don't skew them: `SELECT count("value") FROM "stats"."autogen"./.*/ WHERE time <= '<T>'` on production and on the restore. Then `docker rm -f p27-restore`.
6. InfluxQL gotcha: `stats` is a keyword. `CREATE DATABASE stats` and `SHOW RETENTION POLICIES ON stats` fail with `found STATS, expected identifier`, so always quote it as `"stats"` [VERIFIED].

## Cutover Runbook (recommended order; checkpoints marked ⛔)

Pre-reqs: the connector code is already live and dormant, because `thinx_api` has no `INFLUXDB_TOKEN`. CI is green. The backup is verified. The window is outside 01:00–05:00 and 09:25–10:15 UTC. Phase 26 UAT test 3 runs after 2026-10-03 09:40 UTC, so do not overlap it.

0. ⛔ **checkpoint:decision: cutover go.** Rollback is costly from here (D-05).
1. Save the pre-change spec for rollback, with no secret output: `docker service inspect thinx_influxdb > /root/phase27/thinx_influxdb.pre.json; chmod 600 …`. The file contains the v1 admin password env, so never cat it.
2. `docker service scale thinx_influxdb=0` and wait until there are no running tasks.
3. `cp -a /mnt/gluster/thinx/influx /mnt/gluster/thinx/influx-v1-upgrade-src && chown -R 65532:65532 /mnt/gluster/thinx/influx-v1-upgrade-src`. Then `mkdir /mnt/gluster/thinx/influxdb2 && chown 65532:65532 /mnt/gluster/thinx/influxdb2`. The copy must be readable by uid 65532: the original data subdirs are `root 0700` [VERIFIED], and DHI runs as 65532 [VERIFIED]. This is standard Unix permission behaviour; macOS Docker Desktop could not reproduce the failure.
4. Prepare secrets in `/dev/shm/p27` with `umask 077`, and never echo them:
   - `openssl rand -hex 32 > op_token`
   - `openssl rand -hex 24 > admin_pw`. **If F-2 option A is chosen, this file instead holds the existing edge password**, entered by the operator.
   - Write `upgrade.env` with `printf 'INFLUXD_USERNAME=admin\nINFLUXD_PASSWORD=%s\nINFLUXD_TOKEN=%s\nINFLUXD_ORG=thinx\nINFLUXD_BUCKET=upgrade-primary\nINFLUXD_RETENTION=1h\n' "$(cat admin_pw)" "$(cat op_token)" > upgrade.env`.
   - Run `docker secret create INFLUXDB_OPERATOR_TOKEN op_token` and `docker secret create INFLUXDB_ADMIN_PASSWORD admin_pw` (D-11).
5. Run the upgrade (Pattern 1) on **micro**, which is logged in to dhi.io and has gluster mounted. Check `upgrade.log` for `Upgrade successfully completed`.
6. Run one combined `docker service update --with-registry-auth` on `thinx_influxdb`, so that `docker service rollback` has a single step to undo:
   - `--image dhi.io/influxdb:2.9.1`
   - `--mount-rm /var/lib/influxdb --mount-rm /etc/influxdb/influxdb.conf --mount-add type=bind,source=/mnt/gluster/thinx/influxdb2,target=/var/lib/influxdb2`
   - `--env-rm INFLUXDB_DB --env-rm INFLUXDB_ADMIN_USER --env-rm INFLUXDB_ADMIN_PASSWORD`
   - `--env-add` each of `INFLUXD_BOLT_PATH=/var/lib/influxdb2/influxd.bolt`, `INFLUXD_ENGINE_PATH=/var/lib/influxdb2/engine`, `INFLUXD_STORAGE_CACHE_MAX_MEMORY_SIZE=256m`, `INFLUXD_STORAGE_MAX_CONCURRENT_COMPACTIONS=1`, `INFLUXD_LOG_LEVEL=error`, `INFLUXD_REPORTING_DISABLED=true`
   - `--label-add traefik.http.routers.thinx-influx-http.middlewares=https-redirect` (D-14)
   - `--replicas 1`
7. Verify with a one-shot official CLI container on `thinx_internal`, passing `--env-file` with `INFLUX_TOKEN` from `op_token` and `INFLUX_HOST=http://thinx_influxdb:8086`:
   - `influx ping`
   - `influx bucket list`
   - all-time Flux counts on `stats/autogen` equal the pre-cutover 1.8 counts (bounded by the stop time)
   - `influx v1 dbrp list` shows `stats/autogen` as the default.
8. Rename: `influx bucket update --id <id> --name stats --retention 90d`. ⚠ This **starts the one-way trim within ≤30 min** (`storage-retention-check-interval` default 30m [VERIFIED: `--help`]). So put ⛔ **checkpoint:decision: apply 90 d** before it, or fold this into the next checkpoint and let the API boot do the patch (adopt path).
9. Mint the API token: `influx auth create --all-access --org thinx --description "thinx-api INFLUXDB_TOKEN" --json | jq -j .token | docker secret create INFLUXDB_TOKEN -`. Never print it.
10. ⛔ **checkpoint:decision: enable stats on thinx_api** (one-way via the 90 d ensure). Then run `docker service update --secret-add INFLUXDB_TOKEN thinx_api`. The boot log shows one ensure line, and the bucket reads `2160h0m0s`.
11. Verify success criteria 1, 2 and 4 (Validation Architecture). `shred -u /dev/shm/p27/*`.
12. Mirror into gluster `thinx.yml` and repo `docker-swarm.yml`: the influxdb block, the removal of the http-override label line, and `INFLUXDB_TOKEN` on api plus the `secrets:` entry.
13. ⛔ **checkpoint:decision: drop buckets.** `influx bucket delete` for `stats/31d`, `db0/autogen`, `swarmpit/an_hour`, `swarmpit/a_day`, `swarmpit/autogen` and `upgrade-primary`. Re-check zero writes first (see Pitfall 5).
14. ⛔ **checkpoint:decision: retire Chronograf.** `docker service rm thinx_chronograf`, and remove it from `thinx.yml`/`docker-swarm.yml`. Keep its volume.
15. Success criterion 5: test push to `thinx-staging`. A new `thinx_api` task appears within 5 min of the CircleCI image push.
16. After Phase 27 verification passes: ⛔ **checkpoint:decision: delete backup + 1.8 data.** Remove `/root/phase27/*` on both nodes, `/mnt/gluster/thinx/influx`, `/mnt/gluster/thinx/influx-v1-upgrade-src` and `/mnt/gluster/thinx/chronograf` (D-02/D-07/D-13).

### Rollback (D-05), valid until step 16
- **Influx only:** run `docker service rollback thinx_influxdb`. It returns to the previous spec, which is **1.8 with replicas 0**, because step 2's scale was itself a spec update. Follow with `docker service scale thinx_influxdb=1`. If more than one update ran after the scale, use an explicit `docker service update --image influxdb:1.8 --mount-rm /var/lib/influxdb2 --mount-add …influx:/var/lib/influxdb --mount-add …swarmpit/influxdb.conf:/etc/influxdb/influxdb.conf --env-rm INFLUXD_* --env-add INFLUXDB_DB=db0 …` built from `thinx_influxdb.pre.json`.
- **API:** `docker service update --secret-rm INFLUXDB_TOKEN thinx_api`. Stats go dormant, and nothing else is affected. Reverting the code needs a thinx-staging revert push; the v2 connector against 1.8 only logs failed writes.
- Stats written to v2 after cutover are lost on rollback (accepted, D-05).

## Common Pitfalls

### Pitfall 1: migrated bucket is `stats/autogen`, not `stats`
**What goes wrong:** the API writes and queries `stats` and creates an empty bucket, while the history sits in `stats/autogen`.
**How to avoid:** rename at cutover (Pattern 2), and add the adopt branch to the boot ensure.
**Warning signs:** `influx bucket list` shows both `stats` and `stats/autogen`.

### Pitfall 2: dashboard is already blank (F-1)
**What goes wrong:** success criterion 2 fails even after a perfect migration.
**Why:** `statistics.js` forwards only the first argument:
```js
// lib/thinx/statistics.js:79-83 [VERIFIED: Read]
	async today_V2(owner, callback) {
		await this.influx.today(owner, (result) => {
            callback(result);
        });
	}
```
`influx.today` calls `callback(true, results)`. The router then sees `body === undefined` and answers `no_results` (`lib/router.user.js:117-128` [VERIFIED]). The non-CI ZZ spec pins it: `expect(res.text).to.equal('{"success":false,"response":"no_results"}');` (`spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:188-196` [VERIFIED]).
**How to avoid:** forward `(success, body)` and return `{KPI:[count]}`. That is the shape `Visits.vue` reads (`if (data[key] && Array.isArray(data[key])) return data[key][0] || 0;`) and the shape the Cypress fixtures use (`"DEVICE_CHECKIN": [42]`) [VERIFIED: Read]. Update the ZZ pin. Add a **non-ZZ** spec, since CI deletes all ZZ specs except `ZZ-LogPagingCouchSpec.js` (`docker-entrypoint.sh:88-109` [VERIFIED]).

### Pitfall 3: float vs integer `value`
Use `floatField`. An int write is rejected with 422 (see the anti-pattern above).

### Pitfall 4: D-14 edge basic-auth collides with the v2 UI login (F-2)
**Rehearsed with Traefik v2.11 + basicAuth in front of v2.9.1:**
- Edge creds ≠ InfluxDB creds: `POST /api/v2/signin` through the edge → **401**, because Traefik rejects the UI's own Basic header.
- Edge creds == InfluxDB user creds: signin → **204**, then `/api/v2/me` with Basic + session cookie → **200**.
- Token-header clients (`Authorization: Token …`) can never pass the edge → **401**.
- InfluxDB accepts a stray Basic header when a valid session cookie is present (200).

[VERIFIED: local rehearsal] In production the edge user is `admin`, and its password comes from `restart.sh` (`export USERNAME="admin"`, `HASHED_PASSWORD` via `openssl passwd -apr1`). `couch-auth`, `influx-auth` and `chrono-auth` share it [VERIFIED].
**Options (operator decision):**
- (A) Recommended: make the InfluxDB UI user `admin` with the **same password as the edge**. Store that password as `INFLUXDB_ADMIN_PASSWORD`. Any `restart.sh` password change then needs a matching `influx user password` update.
- (B) Keep the edge and use the UI only through an SSH tunnel.
- (C) Drop `influx-auth` and rely on InfluxDB login over HTTPS. This deviates from D-14.

### Pitfall 5: Swarmpit DNS ambiguity on `influxdb`
`swarmpit_app` resolves `influxdb` by network. Today it gets `swarmpit_influxdb` (10.0.5.5). The `swarmpit` database inside `thinx_influxdb` (data dir created 2026-03-08, with Swarmpit's CQs) shows it once got `thinx_influxdb` (10.0.1.57, on traefik-public). After the upgrade, a flip would mean Swarmpit writes are rejected by v2 auth (401). Swarmpit stats would break, but THiNX data would not be polluted. Swarmpit's behaviour on that error is not known [ASSUMED]. **Mitigation in Phase 27:** re-run `getent hosts influxdb` inside `swarmpit_app` (micro) before and after cutover, and keep the success criterion 5 push test. Leave the permanent fix (`SWARMPIT_INFLUXDB=http://swarmpit_influxdb:8086`) to Phase 28, which owns `swarmpit_app`.

### Pitfall 6: DHI image has no CLI, shell or curl, and ignores `DOCKER_INFLUXDB_INIT_*`
`docker run --entrypoint influx|sh|curl|wget dhi.io/influxdb:2` → `executable file not found` [VERIFIED]. With `DOCKER_INFLUXDB_INIT_MODE=setup`, DHI still reports `/api/v2/setup` `{"allowed": true}`, so it was not onboarded. The official image onboards and reports `false` [VERIFIED]. All admin work therefore uses `influxdb:2.9.1` one-shots.

### Pitfall 7: tokens are unrecoverable after creation
Hashed tokens are the default in 2.9, and `auth list` shows an empty token [VERIFIED]. Pipe `--json | jq -j .token` straight into `docker secret create`.

### Pitfall 8: `docker service rollback` goes to the scaled-to-0 spec
See Rollback above. Do the cutover changes in **one** `service update`.

### Pitfall 9: CI logs in to dhi.io too late
`.circleci/config.yml` runs "Starting Influx" (`docker compose up -d influxdb`, ~L757) **before** the `docker login … dhi.io` in "Starting Support Services" (~L774) [VERIFIED: Read]. Move the login earlier if CI uses the DHI image.

### Pitfall 10: raw API keys in logs and tags
`statsLog` prints `console.log(\`[OID:${owner}] [${error}] ${data}\`)` (`influx.js:28` [VERIFIED]). `apikey.js:210` passes the raw `apikey` as `data`, so a full rejected key lands in **container logs** as well as the `data` tag. Two such 64-hex values sit in production `stats` today; both are from 2026-03-09 or earlier and are deleted by the 90 d trim.

### Pitfall 11: retention granularity
v2 deletes whole shard groups. The migrated bucket keeps its 7 d SGD, so points 90–97 days old can linger until their group ends. The check runs every 30 min. Verify the *setting* (2160h), not exact cut-off counts.

## Code Examples

### Current InfluxQL (verbatim) → Flux equivalents
| Method | Current (`lib/thinx/influx.js`) [VERIFIED: Read] | Flux (all via `flux` template) |
|---|---|---|
| `query` L66 | `` SELECT count("value") AS "count_value" FROM "stats"."autogen"."${measurement}" `` | `from(bucket:"stats") \|> range(start: 0) \|> filter(fn:(r)=> r._measurement == ${m} and r._field == "value") \|> group() \|> count()` |
| `queryOwner` L86 | `… FROM "stats"."autogen"."${measurement}" WHERE "owner"='${owner_id}'` | same + `and r.owner == ${owner}` |
| `today` L108 | `… WHERE "owner"='${owner_id}' AND time > '${midnight.toISOString()}'` (per KPI, sequential) | Pattern 3 `countsByKpi(owner, midnight)`: one query for all KPIs |
| `week` L132 | `… WHERE "owner"='${owner_id}' AND time > now() - 7d` | `countsByKpi(owner, fluxDuration('-7d'))` |

**Equivalence rehearsed on identical data** (owner `07cef971…`, local midnight = UTC):

| KPI | InfluxQL today / week (1.8) | Flux today / week (v2) |
|---|---|---|
| LOGIN_INVALID | 1 / 2 | 1 / 2 |
| DEVICE_CHECKIN | 1 / 3 | 1 / 3 |
| BUILD_STARTED | no rows / 1 | 0 / 1 |
| BUILD_SUCCESS | no rows / 1 | 0 / 1 |
| DEVICE_NEW | no rows / no rows | 0 / 0 |

Differences that don't change the numbers:
- Flux `range` start is inclusive (`>=`), while InfluxQL used `>`.
- Flux `range` stops at `now()`, while InfluxQL had no upper bound.
- InfluxQL "no rows" becomes `[0]`.

The other owner's point was correctly excluded [VERIFIED].

### Measurement list (single source, unchanged)
`lib/thinx/event_taxonomy.js:22-29` [VERIFIED: Read] names: `"APIKEY_INVALID"`, `"LOGIN_INVALID"`, `"DEVICE_NEW"`, `"DEVICE_CHECKIN"`, `"DEVICE_REVOCATION"`, `"BUILD_STARTED"`, `"BUILD_SUCCESS"`, `"BUILD_FAILED"`.

### Secret read (Phase 24 helper, unchanged)
`lib/thinx/secrets.js`: `function readSecret(name, defaultValue)` resolves `/run/secrets/<name>` first, then `process.env[name]`, with a per-name cache and a test seam `_resetCacheForTests` [VERIFIED: Read]. CI can therefore pass `INFLUXDB_TOKEN` as plain env.

### CI compose (recommended shape, rehearsed commands)
```yaml
  influxdb:
    image: dhi.io/influxdb:2.9.1
    environment:
      - INFLUXD_BOLT_PATH=/var/lib/influxdb2/influxd.bolt
      - INFLUXD_ENGINE_PATH=/var/lib/influxdb2/engine
      - INFLUXD_REPORTING_DISABLED=true
    tmpfs:
      - /var/lib/influxdb2:uid=65532,gid=65532     # no host bind; drop the /mnt/gluster/thinx/influx bind in test compose
    networks: [internal]
  influxdb-setup:
    image: influxdb:2.9.1
    depends_on: [influxdb]
    entrypoint: ["sh", "-c", "i=0; until influx ping --host http://influxdb:8086 >/dev/null 2>&1; do i=$$((i+1)); [ $$i -gt 60 ] && exit 1; sleep 1; done; influx setup --host http://influxdb:8086 --force --username thinx-ci --password thinx-ci-password --org thinx --bucket stats --token thinx-ci-influx-token"]
    networks: [internal]
  # api: environment += 'INFLUXDB_TOKEN=thinx-ci-influx-token'
```
The `influx setup` against DHI succeeded and created `stats` with **infinite** retention [VERIFIED]. The spec's ensure call then exercises the real **repair** path from infinite to 7776000. In CircleCI, run `docker compose run --rm influxdb-setup` after `up -d influxdb`. The `tmpfs` `uid=` option and the `$$` escaping under compose v2.4.1 were not rehearsed [ASSUMED]; if tmpfs is a problem, a named volume works too. **Fallback:** official `influxdb:2.9.1` with `DOCKER_INFLUXDB_INIT_MODE=setup` plus `_USERNAME/_PASSWORD/_ORG=thinx/_BUCKET=stats/_ADMIN_TOKEN` env, which onboards by itself [VERIFIED]. Use it only if the dhi.io login cannot move earlier. The literal `thinx-ci-influx-token` is a throwaway and must never be reused in production.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| node-influx (`influx` npm) + InfluxQL | `@influxdata/influxdb-client` + Flux | InfluxDB 2.0 (2020) | D-09 |
| Database + retention policy | Bucket with `retentionRules` (`everySeconds`) | 2.0 | D-03 ensure step |
| Plaintext tokens in bolt | Hashed tokens by default | 2.8 | Capture at creation |
| `DOCKER_INFLUXDB_INIT_MODE=upgrade` (official entrypoint) | n/a in DHI (no entrypoint script) | — | Use explicit `influxd upgrade` |

**Deprecated/outdated:** the `INFLUXDB_DB`, `INFLUXDB_ADMIN_USER` and `INFLUXDB_ADMIN_PASSWORD` env vars are 1.x-image only, and v2 ignores them. Chronograf 1.9 is retired by D-13.

## D-12 Recommendation: drop the raw rejected key

- **APIKEY_INVALID:** write the point **without a `data` tag value**, keeping `owner`. In the console line, replace the raw key with `Util.redactToken(apikey)` (first 6 chars + `…`, `lib/thinx/util.js:148-155` [VERIFIED]); `log_invalid_key` already uses that form. Why drop rather than hash:
  1. Each distinct attacker-supplied key creates a new series, so dropping removes a cardinality DoS vector.
  2. A full `sha256(key)` equals THiNX's own key identifier (`"hash": sha256(new_api_key)`, `apikey.js:94` [VERIFIED]), so storing it is not an anonymisation.
  3. Nothing reads the tag: the dashboard filters by owner only.
- **LOGIN_INVALID:** no change needed. Production holds only 5 short reason labels [VERIFIED], and every `auditLogError` call site passes a literal (`wrapper_error_1`, `wrapper_error`, `no_userdata`, `user_deleted`, `not_activated`, `password_mismatch`, `unknown_username`; `router.auth.js` L54–321 [VERIFIED: grep]). Add a spec asserting that `statsLog` for LOGIN_INVALID only ever receives an allow-listed label.
- Keep the console line shape `[OID:<owner>] [<EVENT>] <data>`. The legacy file ETL in `statistics.js` (`parse_oid`/`parse_line`) counts lines containing `[OID:` and the event name.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Env names `INFLUXDB_URL` / `INFLUXDB_ORG` and org name `thinx` | Pattern 3 | Low; discretion naming only |
| A2 | Portable backup is ≤ ~120 MB | Backup | Low; disk has 17–18 G free |
| A3 | No cron or systemd job touches influx | Runtime inventory | Low; re-check `ls /etc/cron.d` on both nodes during pre-flight |
| A4 | Swarmpit tolerates a 401 from InfluxDB if its DNS flips | Pitfall 5 | Medium; success criterion 5 push test detects it |
| A5 | Compose v2.4.1 accepts the tmpfs `uid=` option and `$$` escaping | CI compose | Low; named-volume fallback |
| A6 | uid 65532 cannot read the root-0700 copy without chown (not reproducible on macOS) | Cutover step 3 | Low; the chown is harmless either way |

## Open Questions

1. **F-2 edge vs UI credentials.** D-14 as written cannot have two independent credentials. Recommendation: option A, decided at the cutover checkpoint.
2. **Code push timing.** Pushing the dormant connector disables stats writes until the token lands. That is D-06's accepted gap, but recommend pushing in the same session, right before cutover.
3. **Device check-ins in success criterion 2.** There has been no DEVICE_CHECKIN since 2026-07-25 [VERIFIED]. Proving "check-ins keep appearing" needs a deliberate check-in from a test device or API key, and is likely a `checkpoint:human-verify`.
4. **CheckinsTimeline** reads `stats.timeline.CHECKINS`, which the V2 route never returns. The chart stays empty; that is a new feature and out of scope. Note it in verification so it isn't mistaken for a regression.
5. **Junk measurements** (`aui: n`, …, from 2023-11) migrate and then age out with the 90 d trim. No action.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Docker (local) | rehearsal, spec dev | ✓ | 29.8.0 | — |
| `dhi.io/influxdb:2.9.1` | prod, CI | ✓ (pull needs dhi.io login; micro and CI have it) | 2.9.1 | official `influxdb:2.9.1` |
| `influxdb:2.9.1` (official) | CLI one-shots | ✓ Docker Hub | 2.9.1 / CLI 2.8.0 | — |
| `influxdb:1.8` | restore test | ✓ on core (running image) | 1.8.10 | — |
| openssl, shred, jq, python3 on micro | secrets handling | ✓ | python 3.12.3 | — |
| `/dev/shm` on micro | secret staging | ✓ | 984 M tmpfs | — |
| `thinx_internal` attachable | one-shot CLI | ✓ `attachable=true` | — | run CLI with `--network container:` on the task's node |
| Node in API image | client | ✓ Node 26 (base `dhi.io/node:26`) | — | — |

Nothing is missing that would block execution.

## Validation Architecture

(`workflow.nyquist_validation` is `false` in config, but the orchestrator asked for this section explicitly.)

### Test Framework
| Property | Value |
|---|---|
| Framework | Jasmine ^5.12.0 (`spec/support/jasmine.json`, `spec_files: jasmine/*[sS]pec.js`, not random) |
| CI runner | `docker compose up --build api` with `ENVIRONMENT=test`; entrypoint runs `npm run split-tests` (non-ZZ only, plus `ZZ-LogPagingCouchSpec.js`) then `npm run test`; gate is `grep -q "specs, 0 failures" ./test.log` |
| Quick run (local, v2 up) | `INFLUXDB_URL=http://localhost:8086 INFLUXDB_TOKEN=<local> npx jasmine spec/jasmine/InfluxSpec.js spec/jasmine/InfluxRetentionSpec.js spec/jasmine/StatisticsV2Spec.js spec/jasmine/EventTaxonomySpec.js spec/jasmine/MetricsCoverageSpec.js` |
| Full suite | CircleCI `test` job on push to `thinx-staging` |

### Success criteria → verification
| SC / Req | Behaviour | How verified | Command (aggregates only) |
|---|---|---|---|
| SC1 / OPS-INFLUX-01 (backup) | backup restorable, counts equal | restore into throwaway 1.8, count ≤ T | `docker exec p27-restore influx -database stats -execute 'SELECT count("value") FROM "stats"."autogen"./.*/ WHERE time <= '"'"'<T>'"'"'' -format csv` vs the same on `$CID` |
| SC1 (history queryable on v2) | pre-upgrade history present | Flux all-time counts on `stats/autogen` == 1.8 counts at stop time; after rename, 90 d window counts == pre-cutover 90 d counts | one-shot `influx query 'from(bucket:"stats") \|> range(start: -90d) \|> filter(fn:(r)=>r._field=="value") \|> group(columns:["_measurement"]) \|> count()'` |
| SC1 (running v2) | image + version | service inspect | `docker service inspect thinx_influxdb --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` → `dhi.io/influxdb:2.9.1@…`; `influx ping` |
| SC2 / OPS-INFLUX-02 (write) | statsLog lands in v2 | spec: write → flush → count +1; prod: count before/after a deliberate test event | `InfluxSpec` (CI); prod: Flux `range(start:-10m)` count for the event |
| SC2 (read / dashboard) | `/api/v2/stats` returns `{success:true, response:{KPI:[n]}}` with non-zero week figures | non-ZZ `StatisticsV2Spec` (seed points, assert shape + numbers); prod: operator opens Vue dashboard (human-verify) | `npx jasmine spec/jasmine/StatisticsV2Spec.js` |
| SC2 (outage safety) | no unhandled rejection, no throw when InfluxDB is down or the token is missing | spec with an unreachable URL + `process.on('unhandledRejection')` collector (same as the current RetentionSpec) | `InfluxSpec` "outage" + "no token" cases |
| SC3 | influx specs pass on InfluxDB 2 in CI | CircleCI test log | `grep -E "InfluxDB\|specs, 0 failures" test.log` in the job |
| SC4 / OPS-INFLUX-03 | bucket `stats` retention 90 d, self-healing | spec: ensure created / adopted / updated / unchanged; prod: bucket list + boot log line | `influx bucket list --name stats --hide-headers` → `2160h0m0s`; `docker service logs thinx_api --since 10m \| grep '\[influx\] ensure'` |
| SC5 | no swarmpit mount; autoredeploy ≤ 5 min | service inspect mounts; push timing | `docker service inspect thinx_influxdb --format '{{range .Spec.TaskTemplate.ContainerSpec.Mounts}}{{.Source}} {{end}}'` must not contain `/swarm/swarmpit/`; then `docker service ps thinx_api` new task within 5 min of the CircleCI push |
| D-14 | HTTP only redirects | curl | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://influx.thinx.cloud/ping` → `3xx https://…` (today: `401`, empty location [VERIFIED]) |
| D-15 | only `stats` (+ system) buckets remain | bucket list | `influx bucket list --hide-headers \| awk '{print $2}'` |
| Pitfall 5 | Swarmpit still resolves its own InfluxDB | getent | `docker exec $(docker ps -q --filter label=com.docker.swarm.service.name=swarmpit_app) getent hosts influxdb` → `10.0.5.5` |

### Wave 0 gaps
- [ ] `spec/jasmine/InfluxSpec.js`: rewrite. Today's `expect(result.length > 0)` has no matcher and asserts nothing, and it writes non-taxonomy measurements with tag `owner_id`.
- [ ] `spec/jasmine/InfluxRetentionSpec.js`: rewrite for buckets. It imports `influx` directly today.
- [ ] `spec/jasmine/StatisticsV2Spec.js`: new, non-ZZ, so CI runs it.
- [ ] `ZZ-AppSessionUserV2DeleteSpec.js:188-196`: update the `no_results` pin. It doesn't run in CI, but keeps local runs honest.
- [ ] `MetricsCoverageSpec` keeps passing as long as the connector stays in a file named `influx.js` (`EXCLUDED_FILES` is basename-based, `scripts/metrics-coverage.js:17-18,75` [VERIFIED]). Put any new helper module inside `influx.js` or add it to `EXCLUDED_FILES`.

## Recommended Plan / Wave Breakdown

| Wave | Plan | Content | Checkpoints |
|---|---|---|---|
| 1 | 27-01 Backup | Pre-flight (placement, counts snapshot, `getent` check, cron check); portable backup; second copy; throwaway restore + count compare; runbook annex (no secrets) | none (no one-way step) |
| 1 | 27-02 Connector (TDD) | `influx.js` v2 rewrite (Pattern 3/4), package swap, boot call in `thinx-core.js`, aikido FP cleanup, rewritten specs, CI compose + CircleCI (dhi.io login earlier, `influxdb-setup`), dev `docker-compose.yml` | none |
| 2 | 27-03 Dashboard + D-12 | `statistics.js` wrapper fix, `{KPI:[n]}` shape, StatisticsV2Spec, ZZ pin update, APIKEY_INVALID data drop + console redaction, LOGIN_INVALID allow-list spec | none |
| 3 | 27-04 Ship dormant | ⛔ decision (push disables stats writes until cutover), then push `thinx-staging`, CI green (SC3), verify the live image has the v2 connector and logs "statistics disabled" | 1 |
| 4 | 27-05 Cutover | Runbook steps 0–12, with ⛔ before step 1 (cutover), before the 90 d rename/trim, and before `--secret-add INFLUXDB_TOKEN`; F-2 option chosen at the first checkpoint; verify SC1/2/4, D-14 | 3 |
| 5 | 27-06 Cleanup | ⛔ bucket drops (D-15), ⛔ Chronograf retirement (D-13), mirror `thinx.yml`/`docker-swarm.yml`, SC5 push test | 2 |
| 6 | 27-07 Final deletion | After verification passes: ⛔ delete backup + 1.8 dir + upgrade-src copy + chronograf volume (D-02/D-07) | 1 |

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | v2 token auth (all-access org token, D-04); InfluxDB UI login; Traefik basic auth (F-2) |
| V3 Session Management | yes (UI) | InfluxDB session cookie, HTTPS only (D-14 redirect fix) |
| V4 Access Control | yes | `INFLUXDB_TOKEN` mounted on `thinx_api` only; operator token/admin pw unmounted (D-11) |
| V5 Input Validation | yes | `flux` tagged-template parameters (injection probe inert [VERIFIED]) |
| V6 Cryptography | no new crypto | tokens generated by `openssl rand`; no hand-rolled hashing (D-12 drop) |
| V7 Error Handling & Logging | yes | terse `setLogger`; never log tokens or error bodies; redact the rejected API key in console |
| V8 Data Protection | yes | stop persisting raw API keys (D-12); 90 d retention; backup on root-only node disk, deleted at D-07 |
| V14 Configuration | yes | env-only config (D-16), HTTP→HTTPS redirect, telemetry off |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---|---|---|
| Flux/InfluxQL injection via owner | Tampering | Flux parameters; no string concatenation |
| Credential exposure in argv/logs/transcript | Information disclosure | `--env-file` on `/dev/shm`, secrets via stdin to `docker secret create`, `shred -u`, CLI configs left inside the `--rm` container |
| Cleartext basic-auth over HTTP | Information disclosure | http router → `https-redirect` only (today serves a 401 challenge over HTTP [VERIFIED]) |
| Series-cardinality DoS via attacker-chosen tag values | DoS | drop `data` for APIKEY_INVALID |
| Stats outage cascading into device/login paths | DoS | fire-and-forget writes, bounded retry buffer, never throw |

## Sources

### Primary (HIGH confidence, tool-verified this session)
- Local rehearsal on 2026-10-02 (`/tmp/influx27`): influxdb:1.8 seeded to production shape → `influxd backup -portable` / restore → `dhi.io/influxdb:2.9.1 upgrade` → v2 server → official 2.9.1 CLI (bucket/DBRP/auth) → `@influxdata/influxdb-client` 1.35.0 probe (WriteApi, Flux, BucketsAPI, outage, injection, field-type conflict) → Traefik v2.11 basicAuth interplay
- `docker image inspect` / `influxd --help` / `influxd upgrade --help` on `dhi.io/influxdb:2.9.1` and `influxdb:2.9.1`
- Production read-only inspection (micro + core) via literal ssh; aggregates only
- Repo files read: `lib/thinx/influx.js`, `statistics.js`, `event_taxonomy.js`, `design_upsert.js`, `secrets.js`, `router.user.js`, `router.auth.js`, `apikey.js`, `util.js`, `thinx-core.js`, `docker-swarm.yml`, `docker-compose*.yml`, `.circleci/config.yml`, `docker-entrypoint.sh`, specs, Vue `Visits.vue`, `store/stats.js`, Cypress fixtures
- npm registry (`npm view`), gsd-tools package-legitimacy check

### Secondary (MEDIUM)
- docs.influxdata.com/influxdb/v2/install/upgrade/v1-to-v2/automatic-upgrade/ (`_internal` not migrated; stop 1.x first; CQs exported)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions and registry legitimacy were checked, and the client was executed on Node 26.
- Upgrade/migration: HIGH. Rehearsed end to end on production-shaped meta. Production-specific permissions are reasoned from observed modes (A6).
- Architecture/client: HIGH. Every query and ensure branch was executed.
- Pitfalls: HIGH for F-1, F-2 and the bucket naming (all reproduced); MEDIUM for Swarmpit DNS flip behaviour (A4).

**Research date:** 2026-10-02
**Valid until:** 2026-11-01. Re-check the `dhi.io/influxdb:2` digest and client release before executing if later.
