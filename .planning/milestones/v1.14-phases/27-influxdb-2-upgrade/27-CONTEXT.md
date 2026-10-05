# Phase 27: InfluxDB 2 Upgrade - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

THiNX statistics move from InfluxDB 1.8 to InfluxDB 2:

- the `stats` data is migrated into a 90-day bucket;
- the API (`lib/thinx/influx.js` and its callers) writes and reads through the v2 client;
- CI runs the influx specs against InfluxDB 2;
- `thinx_influxdb` no longer depends on anything under Swarmpit's directory.

Devices, builds and logins must keep working throughout. Only stats points written during a short cutover window may be lost.

Out of scope:
- the separate `swarmpit_influxdb` service, which is Phase 28 and is left untouched by decision;
- any new statistics features.

</domain>

<decisions>
## Implementation Decisions

### Retention vs. history
- **D-01:** **Trim to 90 days.** All `stats` data is migrated, and the 90-day bucket then expires older points. "No history lost" in success criterion 1 means *nothing within the last 90 days is lost*. Older history survives only in the 1.8 backup (D-02). — **Reversibility:** one-way — once the retention runs and the backup is deleted, history older than 90 days is gone for good.
- **D-02:** The verified 1.8 backup is kept **only until Phase 27 verification passes**. It is then deleted at an operator checkpoint, together with the 1.8 data directory (D-07). — **Reversibility:** one-way — deleting the backup removes the last copy of pre-90-day history and the restore path.
- **D-03:** The 90-day retention is defined **in code and repaired at API boot**. `InfluxConnector.provisionDB()`'s 1.x CREATE/ALTER RETENTION POLICY logic is replaced by an idempotent "ensure bucket `stats` exists with 90d retention, repair if it drifted" step at boot, in the spirit of Phase 26's rev-aware design-doc upsert. The step never crashes boot and logs one clear line per action.
- **D-04:** For that boot repair, the API holds an **org all-access token**, which can create and update buckets (see D-10). The operator accepted the wider blast radius in exchange for real self-healing and a zero-step fresh install.

### Migration & downtime
- **D-05:** Migration uses the **official in-place upgrade**. 1.8 is stopped, the v2 image's `influxd upgrade` runs against a **copy** of the 1.8 data into a new v2 data directory, and that creates buckets plus DBRP mappings. The original 1.8 directory stays untouched as the instant rollback. — **Reversibility:** costly — rollback means repointing the service at the old image and the untouched 1.8 directory; stats written to v2 after cutover are lost in a rollback.
- **D-06:** **A short stats write gap is acceptable.** Writes are fire-and-forget (`writePoint` logs and swallows errors), so only stats points are lost while InfluxDB is down. Cut over in a quiet hour, outside 01:00–05:00 UTC (CouchDB compaction) and 09:25–10:15 UTC (the 09:40 retention job). There is no write buffer and no dual-write.
- **D-07:** The 1.8 data directory and the backup are removed **together, after Phase 27 verification passes**, at an operator checkpoint (D-02). That needs a dashboard showing non-zero figures, check-ins flowing, CI green and the 90-day bucket confirmed.
- **D-08:** The production image is **`dhi.io/influxdb:2`**, the hardened image that `docker-compose.yml` already names and that matches the CouchDB DHI move. Research must confirm the `influx` CLI and `influxd upgrade` exist in it; Phase 26 found DHI CouchDB had no curl. If they are missing, run the upgrade, backup and token steps from a one-shot official `influxdb:2` container while production runs DHI.

### Client & auth
- **D-09:** `influx.js` moves to the **v2 client** (`@influxdata/influxdb-client`, plus `@influxdata/influxdb-client-apis` for bucket admin) with **Flux** queries. The v1-only `influx` npm package (unmaintained) is removed. The four count queries (`query`, `queryOwner`, `today`, `week`) are rewritten in Flux with the same results. The InfluxQL injection surface (`owner_id` and measurement interpolated into query strings) goes away; Flux parameters or validated values are used instead.
- **D-10:** The API authenticates with a **dedicated THiNX-org all-access token** stored as swarm secret **`INFLUXDB_TOKEN`** and read via `readSecret()`, following the Phase 24 pattern (24-CONTEXT D-01/D-02/D-10). With no token, stats are disabled gracefully, as Phase 24 D-02 requires: no crash, a log line, the dashboard shows zero. — **Reversibility:** reversible.
- **D-11:** The **operator token and initial admin password** that the upgrade produces are stored as **swarm secrets that no service mounts** (for example `INFLUXDB_OPERATOR_TOKEN` and `INFLUXDB_ADMIN_PASSWORD`). They are never put in env, the repo, planning docs, logs or the transcript, and are used only by an operator for admin and rotation.
- **D-12:** The **measurement and tag schema stays identical**, so migrated history and new points line up, with one exception: `APIKEY_INVALID` (`lib/thinx/apikey.js:210`) and `LOGIN_INVALID` (`lib/router.auth.js:44`) **stop storing the raw rejected key or login data** in the `data` tag. They store a short non-reversible hash or nothing (planner's choice). Points already migrated keep their old tags and age out within 90 days (D-01). Nothing is scrubbed.

### Dependents & exposure
- **D-13:** **Chronograf 1.9 is retired.** The service is removed from `docker-swarm.yml` and from the production gluster `thinx.yml`. Its gluster volume `/mnt/gluster/thinx/chronograf` is kept until verification and then removed with D-07. InfluxDB 2's built-in UI replaces it. A side effect is that `restart.sh` no longer resets a Chronograf password.
- **D-14:** The **public `INFLUX_HOSTNAME` route stays**. It is protected by the **existing `influx-auth` Traefik basic-auth middleware, plus InfluxDB 2's own login, over HTTPS only**. The HTTP router is fixed so it only redirects to HTTPS. Today a later `middlewares=influx-auth,error-pages-middleware` label overrides `https-redirect` in the repo file, so plain HTTP is served.
- **D-15:** The **`db0` and `swarmpit` databases** that the upgrade turns into buckets are **dropped after research confirms nothing writes to them**. Swarmpit's own stats use the separate `swarmpit_influxdb` service. After that only `stats` remains. 1.x `_internal` monitoring has no v2 equivalent and is not carried over. If research finds a live writer, stop and ask; do not drop.
- **D-16:** InfluxDB 2 is configured **via `INFLUXD_*` environment variables only**, with no config file. Only the data directory is mounted. The `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf` mount is removed (success criterion 5). Research checks what that 1.8 conf overrides and carries any still-relevant setting over as an env var.

### Prior decisions that still apply
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` (Phase 27): goal, the 5 success criteria and notes (dependents inventory, the Swarmpit window, `docker exec` locality)
- `.planning/REQUIREMENTS.md`: OPS-INFLUX-01, OPS-INFLUX-02, OPS-INFLUX-03
- `.planning/todos/pending/2026-10-02-backup-gluster-influx-data-before-phase-27.md`: the backup step

### Prior decisions to follow
- `.planning/phases/24-secrets-sweep/24-CONTEXT.md`: the `readSecret()` and swarm-secret pattern, behaviour with no secret, one-service-at-a-time rollout (D-01/D-02/D-05/D-10/D-12)
- `.planning/phases/26-vue-console-log-paging/26-CONTEXT.md`: D-14 (checkpoints before one-way production steps) and the rev-aware boot upsert pattern (D-13, `lib/thinx/design_upsert.js`)
- `AGENTS.md`: the deployment flow, server access and the DHI base-image notes

### Code
- `lib/thinx/influx.js`: the connector to rewrite (client, `provisionDB`, the 4 queries, `statsLog`)
- `lib/thinx/statistics.js`: the reader (`today`/`week` KPIs for the dashboard and Visits)
- `lib/thinx/event_taxonomy.js`: the measurement names (single source of truth)
- `lib/thinx/apikey.js:210`, `lib/router.auth.js:44`: writers that store rejected key or login data (D-12)
- `lib/thinx/device.js`, `devices.js`, `builder.js`, `notifier.js`: other `statsLog` writers
- `thinx-core.js`: boot-time `InfluxConnector.createDB('stats')` (around line 156)
- `spec/jasmine/InfluxSpec.js`, `InfluxRetentionSpec.js`, `EventTaxonomySpec.js`, `MetricsCoverageSpec.js`: the specs that must run against v2
- `docker-swarm.yml`: the `influxdb` service (1.8, gluster data and Swarmpit conf mounts, Traefik labels around lines 505–546) and `chronograf` (around 547–590)
- `docker-compose.yml` (`dhi.io/influxdb:2`, but with v1 env vars) and `docker-compose.test.yml` (`influxdb:1.8`): both need updating for v2
- `.planning/codebase/INTEGRATIONS.md` §"Time-series — InfluxDB 1.8"

### Production config
- The gluster swarm repo `/mnt/gluster/deployment/swarm` (`thinx.yml`) is the production stack file and may differ from the repo `docker-swarm.yml`. Compare them before editing.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `readSecret()`, the Phase 24 helper: use it for `INFLUXDB_TOKEN`.
- `lib/thinx/design_upsert.js`, the Phase 26 idempotent boot reconcile: the model for "ensure the `stats` bucket has 90d retention" (never throws, logs one line).
- `EventTaxonomy.names()`: the measurement list, which stays unchanged.

### Established Patterns
- Stats writes are fire-and-forget: `writePoint` logs errors and calls back with `[]`. Keep that, so an outage never affects devices, builds or logins.
- `createDB` already swallows and logs provisioning errors (Rollbar #1794 history). Keep the "never an unhandled rejection at boot" property.
- Queries currently interpolate `owner_id` and the measurement into InfluxQL strings; the Flux rewrite removes that surface (D-09).

### Integration Points
- The connection is hard-coded `host: 'influxdb', port: 8086`, with no auth today; 1.8 runs with auth off.
- Callers construct the connector directly: `new InfluxConnector('stats')` and `InfluxConnector.statsLog(...)`.
- Production: `thinx_influxdb` (placement floats; query it), the Traefik `thinx-influx-*` routers with `influx-auth`, and `thinx_chronograf`.

</code_context>

<specifics>
## Specific Ideas

- Cutover order, at a quiet hour:
  1. Verified backup.
  2. Stop 1.8.
  3. `influxd upgrade` on a copy.
  4. Start v2 (DHI).
  5. Create the org all-access token and store it as a secret.
  6. Roll `thinx_api` with the v2 client.
  7. Verify the dashboard shows non-zero figures, check-ins appear and the bucket has 90d.
  8. Drop `db0`/`swarmpit` (checkpoint).
  9. Retire Chronograf.
  10. After verification, delete the backup, the 1.8 data and the Chronograf volume (checkpoint).
- The token and admin password must never appear in output. Pass them by name, as the retention wrapper does with credentials.

</specifics>

<deferred>
## Deferred Ideas

- Downsampling or rollups for long-term trends. The operator chose a plain 90-day trim (D-01).
- Scrubbing the rejected-key tag from already-migrated `APIKEY_INVALID` points. Not needed, because they age out within 90 days (D-12).

### Reviewed Todos (not folded)
These todos matched only on keywords and are unrelated to InfluxDB:
- "Split Rollbar server and client tokens" (`2026-09-28-split-rollbar-server-and-client-tokens.md`): belongs in its own secrets or observability change.
- "Resolve legacy FIXMEs in owner.js and transfer.js" (`2026-09-29-resolve-legacy-fixmes-owner-transfer.md`).
- "Answer a failed Bearer verification with 401, not 403" (`2026-10-01-bearer-verify-failure-status-401.md`).
- "Fix worker builder service polling completion detection" (`2026-09-28-fix-worker-builder-service-polling-completion-detection.md`).

</deferred>

---

*Phase: 27-influxdb-2-upgrade*
