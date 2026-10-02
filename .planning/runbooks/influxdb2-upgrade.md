# InfluxDB 2 upgrade (Phase 27)

This runbook covers the production side of Phase 27: the verified InfluxDB 1.8 backup, the upgrade
rehearsal, the cutover of `thinx_influxdb` to `dhi.io/influxdb:2.9.1`, rollback, and the clean-up
steps that follow. The record of what was actually run lives in the **Annex** at the end. Everything
recorded there is aggregates only: counts, sizes, dates, short digests and bucket names.

---

## Conventions

**Access.** Host names, addresses, keys and ports are not in this public repository. See `AGENTS.md`
and the operator's `~/.aliases`. In this runbook, **"on the manager"** means either swarm manager
(`docker service …` works from both). **"On node N"** means the node that currently runs the task in
question, because `docker exec` and `docker ps` are node-local. Call the manager ssh command in its
literal form so the pre-approved allow rules match. Never put it in a variable, a wrapper or a
committed file.

**Placement floats.** No placement constraint pins `thinx_influxdb`. Before any `docker exec`, look it up:

```bash
# on the manager
docker service ps thinx_influxdb --filter desired-state=running --format '{{.Node}} {{.CurrentState}}'
```

Select the container by its swarm service label, never by `name=influxdb`, which also matches
`swarmpit_influxdb`:

```bash
# on node N
CID=$(docker ps -q --filter label=com.docker.swarm.service.name=thinx_influxdb)
```

Query services by name. `docker service ls` returns an unstable subset under load.

**Output hygiene.** Keep only aggregates: counts, sizes, durations, dates, short digests and bucket
names. Never keep owner ids, `data` tag values, measurement names other than the eight EventTaxonomy
names (`lib/thinx/event_taxonomy.js`), tokens, passwords, cookies or IP addresses. For a DNS check,
print which service an address belongs to, not the address.

**Credentials.** InfluxDB credentials live only in files under `/dev/shm` created with `umask 077`.
They reach a container only through `--env-file`, a file argument, or a name-only `-e NAME`, and a
swarm secret is created from stdin. Never echo them, never pass them on argv, never `cat` a file that
holds them, and never enable shell tracing around them. InfluxDB 2.9 stores tokens hashed, so a token
must be captured at creation or it is gone.

**Windows.** Run nothing here between 01:00 and 05:00 UTC (CouchDB compaction), between 06:25 and
07:10 UTC (unattended upgrades can bounce dockerd), between 09:25 and 10:15 UTC (the 09:40 log
retention job), or after 22:30 UTC.

**Waiting.** Poll with a bounded until-loop on the remote side (for example at most 60 one-second
tries), never with an open-ended sleep.

**InfluxQL gotcha.** `stats` is a keyword. Always write `"stats"` in InfluxQL.

**Change discipline.** One service at a time with `docker service update`. Never `restart.sh` and
never `docker stack deploy` (the production stack file has no top-level `secrets:` block, so a stack
deploy drops every swarm secret mount). Every one-way step below is preceded by an operator decision
checkpoint (⛔).

**Untouchable.** `swarmpit_influxdb`, `swarmpit_app` and the shared `swarmpit/influxdb.conf` file are
Phase 28 territory. Read them, never change them.

---

## Backup and verified restore

The backup is a portable `influxd backup` of every 1.8 database, taken from the running container,
held root-only on node-local disk on **both** nodes, outside gluster and outside the data path. It is
kept until the D-07 checkpoint (plan 27-07). Placeholders: `{N}` is the node running
`thinx_influxdb`, `{O}` is the other node, `{ts}` is the UTC stamp `YYYYMMDDTHHMMZ`, `{T}` is the
reference time.

### 1. Pre-flight (read-only)

```bash
# on the manager: node, image and state of the 1.8 task
docker service ps thinx_influxdb --filter desired-state=running --format '{{.Node}} {{.CurrentState}}'
docker service inspect thinx_influxdb --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | cut -d@ -f1

# on the node running swarmpit_app: which InfluxDB does Swarmpit resolve "influxdb" to? (Pitfall 5)
SP=$(docker ps -q --filter label=com.docker.swarm.service.name=swarmpit_app | head -1)
A=$(docker exec "$SP" getent hosts influxdb | awk '{print $1}' | head -1)
SV=$(docker service inspect swarmpit_influxdb --format '{{json .Endpoint.VirtualIPs}}' | jq -r '.[].Addr|split("/")[0]')
TV=$(docker service inspect thinx_influxdb   --format '{{json .Endpoint.VirtualIPs}}' | jq -r '.[].Addr|split("/")[0]')
r=other; printf '%s\n' $SV | grep -qxF "$A" && r=swarmpit_influxdb; printf '%s\n' $TV | grep -qxF "$A" && r=thinx_influxdb
echo "swarmpit_resolves=$r"

# on both nodes: cron mentions of influx (expect 0) and free space (STOP below 1 GB)
{ cat /etc/cron.d/* /etc/crontab 2>/dev/null; crontab -l 2>/dev/null; } | grep -ci influx
df -Pk /root /mnt/gluster | awk 'NR>1{print $6, $4}'
```

### 2. Backup on node N

```bash
# on node N
CID=$(docker ps -q --filter label=com.docker.swarm.service.name=thinx_influxdb)
T=$(date -u +%Y-%m-%dT%H:%M:%SZ); ts=$(date -u +%Y%m%dT%H%MZ)
docker exec "$CID" influxd backup -portable /tmp/p27-bk >/dev/null 2>&1 && echo backup_ok   # no -db: every database
install -d -m 700 /root/phase27
docker cp "$CID":/tmp/p27-bk /root/phase27/influx-1.8-portable-$ts
docker exec "$CID" rm -rf /tmp/p27-bk
chmod -R go-rwx /root/phase27/influx-1.8-portable-$ts
cd /root/phase27/influx-1.8-portable-$ts && sha256sum * > ../influx-1.8-portable-$ts.sha256
echo "files=$(ls | wc -l) size_kb=$(du -sk . | cut -f1)"
```

### 3. Production counts at T on node N

Counts are bounded by `T`, so writes that land after the backup do not skew the comparison. The
reduction runs on the node and prints only the eight taxonomy counts plus totals.

```bash
# on node N
docker exec "$CID" influx -database stats -format csv \
  -execute "SELECT count(\"value\") FROM \"stats\".\"autogen\"./.*/ WHERE time <= '$T'" \
| awk -F, -v P=v1_T_ 'BEGIN{n=split("APIKEY_INVALID LOGIN_INVALID DEVICE_NEW DEVICE_CHECKIN DEVICE_REVOCATION BUILD_STARTED BUILD_SUCCESS BUILD_FAILED",K," ");for(i=1;i<=n;i++)c[K[i]]=0}
  $1=="name"{next}
  NF>=3{tot+=$3; if($1 in c)c[$1]+=$3; else {om++; op+=$3}}
  END{print P "total=" tot; for(i=1;i<=n;i++)print P K[i] "=" c[K[i]]; print P "other_measurements=" om+0; print P "other_points=" op+0}'
```

### 4. Second copy on the other node

The nodes cannot ssh to each other, so the copy streams through two ssh sessions from the operator's
machine. It stays in the pipe and is never written to the operator's disk.

```bash
# from the operator machine; <ssh N> and <ssh O> are the literal ssh commands from ~/.aliases
<ssh N> 'tar -C /root/phase27 -cf - influx-1.8-portable-{ts} influx-1.8-portable-{ts}.sha256' \
  | <ssh O> 'install -d -m 700 /root/phase27 && tar -C /root/phase27 -xf - \
      && chmod -R go-rwx /root/phase27/influx-1.8-portable-{ts}* \
      && cd /root/phase27/influx-1.8-portable-{ts} && sha256sum -c --quiet ../influx-1.8-portable-{ts}.sha256 && echo manifest_ok'
```

### 5. Restore test (throwaway 1.8 container)

Always restore into a **fresh** instance. A second restore onto an instance that already has `stats`
fails with `DB metadata not changed. database may already exist`; for a retry, remove the container
and the `restore-v1` directory first.

```bash
# on the node holding the copy used for the test
docker run -d --name p27-restore --network none --memory 512m --cpus 0.5 \
  -v /root/phase27/influx-1.8-portable-{ts}:/backup:ro \
  -v /root/phase27/restore-v1:/var/lib/influxdb influxdb:1.8
i=0; until docker exec p27-restore influx -execute 'SHOW DATABASES' >/dev/null 2>&1; do
  i=$((i+1)); [ $i -gt 60 ] && { echo not_ready; break; }; sleep 1; done
docker exec p27-restore influxd restore -portable /backup >/dev/null 2>&1 && echo restore_ok
# then run the step 3 query against p27-restore with P=restore_T_ and compare every value
docker stop p27-restore
```

Every `restore_T_*` value must equal its `v1_T_*` counterpart; record `restore_equal=1`, or stop and
report the differing keys. The stopped container and `restore-v1` feed the upgrade rehearsal and are
removed at its end.

---

## Upgrade rehearsal

The rehearsal runs the exact cutover data path on the manager's hardware, from a copy of the
restored 1.8 data, with throwaway credentials and `--network none`. Nothing in it touches the live
service, the gluster data or any swarm secret. Results are in the Annex row "rehearsal".

```bash
# on the node holding restore-v1 (the stopped p27-restore container's data)
# 1. throwaway credentials, rehearsal only, never echoed
umask 077; install -d -m 700 /dev/shm/p27r
openssl rand -hex 32 > /dev/shm/p27r/tok; openssl rand -hex 24 > /dev/shm/p27r/pw
printf 'INFLUXD_USERNAME=admin\nINFLUXD_PASSWORD=%s\nINFLUXD_TOKEN=%s\nINFLUXD_ORG=thinx\nINFLUXD_BUCKET=upgrade-primary\nINFLUXD_RETENTION=1h\n' \
  "$(cat /dev/shm/p27r/pw)" "$(cat /dev/shm/p27r/tok)" > /dev/shm/p27r/upgrade.env
printf 'INFLUX_HOST=http://localhost:8086\nINFLUX_ORG=thinx\nINFLUX_TOKEN=%s\n' "$(cat /dev/shm/p27r/tok)" > /dev/shm/p27r/cli.env

# 2. source copy, owned by the DHI user
cp -a /root/phase27/restore-v1 /root/phase27/rehearsal-v1src
chown -R 65532:65532 /root/phase27/rehearsal-v1src
install -d -o 65532 -g 65532 /root/phase27/rehearsal-v2

# 3. upgrade (research Pattern 1); --influx-configs-path stays at its default inside the --rm container
docker run --rm --network none --env-file /dev/shm/p27r/upgrade.env \
  -v /root/phase27/rehearsal-v1src:/v1:ro -v /root/phase27/rehearsal-v2:/var/lib/influxdb2 \
  dhi.io/influxdb:2.9.1 upgrade --force --v1-dir /v1 \
  --engine-path /var/lib/influxdb2/engine --bolt-path /var/lib/influxdb2/influxd.bolt \
  --continuous-query-export-path /var/lib/influxdb2/v1-continuous-queries.txt \
  --log-path /var/lib/influxdb2/upgrade.log
grep -cF -f /dev/shm/p27r/tok /root/phase27/rehearsal-v2/upgrade.log                  # expect 0
grep -cF -f /dev/shm/p27r/tok /root/phase27/rehearsal-v2/v1-continuous-queries.txt    # expect 0
find /root/phase27/rehearsal-v2 -name configs | wc -l                                 # expect 0

# 4. scratch v2 server with the D-16 settings the cutover uses
docker run -d --name p27-rehearsal-v2 --network none --memory 512m --cpus 0.5 \
  -e INFLUXD_BOLT_PATH=/var/lib/influxdb2/influxd.bolt -e INFLUXD_ENGINE_PATH=/var/lib/influxdb2/engine \
  -e INFLUXD_STORAGE_CACHE_MAX_MEMORY_SIZE=256m -e INFLUXD_STORAGE_MAX_CONCURRENT_COMPACTIONS=1 \
  -e INFLUXD_LOG_LEVEL=error -e INFLUXD_REPORTING_DISABLED=true \
  -v /root/phase27/rehearsal-v2:/var/lib/influxdb2 dhi.io/influxdb:2.9.1

# 5. checks via official CLI one-shots (the DHI image has no CLI and no shell)
CLI="docker run --rm --network container:p27-rehearsal-v2 --env-file /dev/shm/p27r/cli.env --entrypoint influx influxdb:2.9.1"
$CLI ping
$CLI bucket list --json | jq -r 'sort_by(.name)|.[]|"\(.name)=\(.retentionRules[0].everySeconds // 0)"'
$CLI v1 dbrp list --json      # reduce to database/rp -> bucket name, default flag
$CLI query --raw 'from(bucket: "stats/autogen") |> range(start: 0, stop: {T+1s})
  |> filter(fn: (r) => r._field == "value") |> group(columns: ["_measurement"]) |> count()
  |> keep(columns: ["_measurement", "_value"])'   # reduce like backup step 3, P=v2_T_

# 6. rename rehearsal (research Pattern 2): one PATCH keeps the bucket id, so the DBRP mapping survives
$CLI bucket update --id {stats/autogen id} --name stats --retention 90d

# 7. teardown: only the backup dir and its manifest stay
docker rm -f p27-rehearsal-v2 p27-restore
rm -rf /root/phase27/restore-v1 /root/phase27/rehearsal-v1src /root/phase27/rehearsal-v2
shred -u /dev/shm/p27r/*; rmdir /dev/shm/p27r
```

What the rehearsal settled:

- `dhi.io/influxdb:2.9.1` is the same digest as `dhi.io/influxdb:2` and runs as uid 65532.
- `influxd upgrade` from the DHI image takes every credential from the env file, with nothing on
  argv, and logs `Upgrade successfully completed`. The token appears in neither `upgrade.log` nor
  the CQ export, and no `configs` file lands in the data directory.
- The migrated bucket is `stats/autogen` with infinite retention and the default DBRP mapping. The
  all-time counts equal the restored 1.8 counts.
- Renaming it to `stats` with `--retention 90d` keeps the bucket id, so `stats`/`autogen` still maps
  to it as the default. The 7-day shard-group duration is unchanged.
- **A6:** uid 65532 cannot read the root-0700 data subdirectories of a 1.8 copy (`denied`) until the
  copy is chowned to 65532 (`readable`). The cutover chown is required, not just harmless.
- A portable restore does not carry continuous queries, so the rehearsal's CQ export had no
  Swarmpit CQs. The cutover upgrades the real data directory and will export the four Swarmpit CQs
  to `v1-continuous-queries.txt`. They are not migrated, which is fine: Swarmpit writes to its own
  InfluxDB.

---

## Cutover runbook

The cutover spans four plans. Each one-way step has a ⛔ operator decision checkpoint in front of it.
Credentials follow the Conventions: `/dev/shm/p27` with `umask 077`, `--env-file`, secrets created
from stdin, never echoed. The live staging directory is `/dev/shm/p27`; the rehearsal's
`/dev/shm/p27r` no longer exists.

**Pre-requisites.**
- The verified backup exists on both nodes (Annex rows "backup" and "restore").
- CI is green on the v2 connector commit.
- No `INFLUXDB_TOKEN`, `INFLUXDB_OPERATOR_TOKEN` or `INFLUXDB_ADMIN_PASSWORD` swarm secret exists yet.
- The window is valid (Conventions). Phase 26 UAT test 3 runs after 2026-10-03 09:40 UTC; do not overlap it.

### 27-04: ship the connector dormant

1. Read-only release gate and production pre-flight: the backup manifest still checks on both nodes,
   no stale InfluxDB secrets, the window is valid.
2. ⛔ **Decision: cutover GO**, and the F-2 option (see "F-2 edge and UI credentials"). Pushing
   starts the stats write gap (D-06), because the new connector has no token yet.
3. Push `thinx-staging`. CI runs the influx specs on InfluxDB 2 (success criterion 3). `thinx_api`
   rolls with stats disabled; its log shows `INFLUXDB_TOKEN not set, statistics disabled`.

### 27-05: upgrade storage (runs straight after 27-04)

4. Save the pre-change spec for rollback. It holds the v1 admin password env, so never `cat` it:
   ```bash
   # on the manager
   umask 077; docker service inspect thinx_influxdb > /root/phase27/thinx_influxdb.pre.json
   ```
5. Record the 1.8 reference counts at the stop time `S` (backup step 3 with `S` instead of `T`),
   then stop 1.8:
   ```bash
   docker service scale thinx_influxdb=0
   # poll until no task is running (bounded loop)
   ```
6. Copy the data and prepare the target, both owned by the DHI user (A6: the chown is required):
   ```bash
   # on a node with gluster mounted
   cp -a /mnt/gluster/thinx/influx /mnt/gluster/thinx/influx-v1-upgrade-src
   chown -R 65532:65532 /mnt/gluster/thinx/influx-v1-upgrade-src
   install -d -o 65532 -g 65532 /mnt/gluster/thinx/influxdb2
   ```
7. Stage the credentials in `/dev/shm/p27` (`umask 077`): `op_token` from `openssl rand -hex 32`;
   `admin_pw` from `openssl rand -hex 24`, or under F-2 option A the existing edge password, which
   the operator types into the file. Build `upgrade.env` with printf exactly as in the rehearsal (org
   `thinx`, primary bucket `upgrade-primary`, retention `1h`). Create the two operator secrets
   (D-11), which no service mounts:
   ```bash
   docker secret create INFLUXDB_OPERATOR_TOKEN /dev/shm/p27/op_token
   docker secret create INFLUXDB_ADMIN_PASSWORD /dev/shm/p27/admin_pw
   ```
8. Run the upgrade on the manager (logged in to dhi.io), exactly as rehearsal step 3, with
   `/mnt/gluster/thinx/influx-v1-upgrade-src:/v1:ro` and `/mnt/gluster/thinx/influxdb2:/var/lib/influxdb2`.
   Check `upgrade.log` for `Upgrade successfully completed`, the token greps at 0 and no `configs` file.
9. One combined service update, so that `docker service rollback` has a single step to undo:
   ```bash
   # on the manager
   docker service update --with-registry-auth \
     --image dhi.io/influxdb:2.9.1 \
     --mount-rm /var/lib/influxdb --mount-rm /etc/influxdb/influxdb.conf \
     --mount-add type=bind,source=/mnt/gluster/thinx/influxdb2,target=/var/lib/influxdb2 \
     --env-rm INFLUXDB_DB --env-rm INFLUXDB_ADMIN_USER --env-rm INFLUXDB_ADMIN_PASSWORD \
     --env-add INFLUXD_BOLT_PATH=/var/lib/influxdb2/influxd.bolt \
     --env-add INFLUXD_ENGINE_PATH=/var/lib/influxdb2/engine \
     --env-add INFLUXD_STORAGE_CACHE_MAX_MEMORY_SIZE=256m \
     --env-add INFLUXD_STORAGE_MAX_CONCURRENT_COMPACTIONS=1 \
     --env-add INFLUXD_LOG_LEVEL=error --env-add INFLUXD_REPORTING_DISABLED=true \
     --label-add traefik.http.routers.thinx-influx-http.middlewares=https-redirect \
     --replicas 1 \
     thinx_influxdb
   ```
   The label fixes D-14: the HTTP router only redirects to HTTPS.
10. Verify with official CLI one-shots on the attachable `thinx_internal` overlay. `cli.env` holds
    `INFLUX_HOST=http://thinx_influxdb:8086`, `INFLUX_ORG=thinx` and `INFLUX_TOKEN` from `op_token`:
    ```bash
    CLI="docker run --rm --network thinx_internal --env-file /dev/shm/p27/cli.env --entrypoint influx influxdb:2.9.1"
    $CLI ping; $CLI bucket list --json | jq -r '.[]|"\(.name)=\(.retentionRules[0].everySeconds // 0)"'
    $CLI v1 dbrp list --json    # stats/autogen -> stats/autogen, default=true
    # Flux counts on stats/autogen bounded by S + 1s must equal the 1.8 counts at S
    ```
11. Mint the API token straight into the swarm secret. It is never printed and never stored anywhere else:
    ```bash
    $CLI auth create --all-access --org thinx --description "thinx-api INFLUXDB_TOKEN" --json \
      | jq -j .token | docker secret create INFLUXDB_TOKEN -
    ```
    The secret is **not mounted yet**. Check that `INFLUXDB_OPERATOR_TOKEN` and
    `INFLUXDB_ADMIN_PASSWORD` are mounted on no service, that the HTTP route redirects to HTTPS
    (D-14), and that `swarmpit_resolves` is still `swarmpit_influxdb` (Pitfall 5).

### 27-06: enable stats, arm the trim, drop the empty buckets

12. Read-only: the production API image reads the migrated history through the v2 client with equal
    counts, and the drop candidates have had no writes since the cutover.
13. ⛔ **Decision (blocking-human): enable stats and the 90-day trim; drop the empty buckets; approve
    the Chronograf retirement.** See "Enable and 90-day trim" and "Bucket drops (D-15)".

### 27-07: close

14. Mirror the live state into `docker-swarm.yml` and the gluster `thinx.yml` (influxdb block, removed
    http-override label line, `INFLUXDB_TOKEN` on api plus a top-level `secrets:` entry). Commit only
    the Phase 27 hunks in the gluster swarm repo; it carries unrelated uncommitted changes.
15. Retire Chronograf if approved (see "Chronograf retirement (D-13)").
16. Success criterion 5: a test push to `thinx-staging` must produce a new `thinx_api` task within
    5 minutes of the CircleCI image push.
17. ⛔ **Decision (blocking-human): delete the 1.8 safety net.** See "Deletion after verification (D-02, D-07)".

---

## Rollback

Valid until the deletion step. Stats written to v2 after the cutover are lost in a rollback (D-05,
accepted).

- **InfluxDB only.** `docker service rollback thinx_influxdb` returns to the previous spec. Because
  the stop in step 5 was itself a spec update, that is **1.8 with replicas 0**. Follow it with
  `docker service scale thinx_influxdb=1`. The untouched `/mnt/gluster/thinx/influx` is the data.
- **Explicit-spec fallback.** If more than one update ran after the stop, rebuild the 1.8 spec from
  `/root/phase27/thinx_influxdb.pre.json` (read with `jq` on the fields you need, never `cat`):
  `docker service update --image influxdb:1.8 --mount-rm /var/lib/influxdb2`, plus `--mount-add` for
  `/mnt/gluster/thinx/influx` → `/var/lib/influxdb` and for the `swarmpit/influxdb.conf` file →
  `/etc/influxdb/influxdb.conf`, `--env-rm` each `INFLUXD_*` variable, `--env-add INFLUXDB_DB=db0`
  and the v1 admin variables. Pass the v1 admin password by name, read from the saved spec into an
  exported variable, never on argv.
- **API.** `docker service update --secret-rm INFLUXDB_TOKEN thinx_api` makes stats dormant again.
  Nothing else is affected. The v2 connector against 1.8 would only log failed writes; reverting
  the code needs a revert push to `thinx-staging`.
- **Worst case.** If both the 1.8 directory and the upgrade copy are unusable, restore the portable
  backup into a fresh 1.8 data directory with `influxd restore -portable`, as in backup step 5.

---

## Tokens and secrets

| Secret | Holds | Mounted on | Created |
|---|---|---|---|
| `INFLUXDB_TOKEN` | org all-access token for the API (D-04, D-10) | `thinx_api` only, from 27-06 | 27-05, piped from `influx auth create … --json \| jq -j .token` |
| `INFLUXDB_OPERATOR_TOKEN` | the upgrade's operator token | nothing (D-11) | 27-05, from `/dev/shm/p27/op_token` |
| `INFLUXDB_ADMIN_PASSWORD` | the InfluxDB UI user's password | nothing (D-11) | 27-05, from `/dev/shm/p27/admin_pw` |

- InfluxDB 2.9 stores tokens **hashed** by default. `influx auth list` shows an empty token field, so
  a token is captured at creation or never. To use the operator token later, read the secret through
  a one-shot service or recreate it by rotation; never print it.
- `thinx_api` reads `INFLUXDB_TOKEN` through `readSecret()` (`/run/secrets/INFLUXDB_TOKEN` first, then
  env). Without it, stats are disabled with one log line and the dashboard shows zero (D-10).
- The production gluster `thinx.yml` carries **no top-level `secrets:` block**. Like the Phase 24
  secrets, `INFLUXDB_TOKEN` lives only on the live `thinx_api` spec, so a `restart.sh` run or a stack
  deploy drops the mount. Re-add it with `docker service update --secret-add INFLUXDB_TOKEN thinx_api`.
- The old v1 env (`INFLUXDB_ADMIN_USER`, `INFLUXDB_ADMIN_PASSWORD`) is removed from `thinx_influxdb` at
  the cutover. `thinx_chronograf` still carries it until it is retired.
- Shred `/dev/shm/p27/*` once the secrets exist and the checks are done.

---

## F-2 edge and UI credentials

The public InfluxDB route keeps the `influx-auth` Traefik basic-auth middleware, over HTTPS only
(D-14). The InfluxDB 2 UI signs in with `POST /api/v2/signin`, which carries its own
`Authorization: Basic` header, and Traefik validates that same header. The UI login therefore only
works when the edge credentials **equal** the InfluxDB user's credentials (rehearsed in research:
different credentials give 401, equal ones give 204 and then 200 on `/api/v2/me`). Token-header
clients can never pass the edge, so all automation uses the internal network.

The edge user is `admin`. Its password comes from `restart.sh` and is shared by `couch-auth`,
`influx-auth` and `chrono-auth`.

- **Option A (recommended).** The InfluxDB UI user is `admin` with the **same password as the edge**.
  At step 7 the operator types the edge password into `/dev/shm/p27/admin_pw`, which becomes
  `INFLUXD_PASSWORD` for the upgrade and the `INFLUXDB_ADMIN_PASSWORD` secret. Any later `restart.sh`
  password change needs a matching `influx user password` update.
- **Option B.** Keep the edge as is and use the InfluxDB UI only through an SSH tunnel to the
  internal port. The InfluxDB user gets a random password.

Dropping `influx-auth` is not offered, because it contradicts D-14.

---

## Enable and 90-day trim

This is the one-way step (D-01): within about 30 minutes of the 90-day retention taking effect,
InfluxDB starts deleting whole shard groups older than 90 days. The only remaining copy of older
history is the 1.8 backup, until the deletion step.

1. ⛔ Decision (27-06), then:
   ```bash
   # on the manager
   docker service update --secret-add INFLUXDB_TOKEN thinx_api
   ```
2. At boot the API's ensure step adopts `stats/autogen` as `stats` with 90 days in one PATCH, which
   keeps the bucket id and the DBRP mapping (the rehearsal proved this). The log shows one
   `[influx] ensure` line with `action=adopted`. If the operator already renamed the bucket with the
   CLI (`influx bucket update --id {id} --name stats --retention 90d`), the line says `unchanged`.
3. Verify: the bucket list shows `stats` at 7776000 seconds (2160h); the Flux counts over the last
   90 days equal the pre-cutover 90-day counts; a deliberate test event raises the matching count in
   `range(start: -10m)`.
4. Retention deletes whole shard groups (7 days each), so points 90–97 days old can linger until
   their group ends. Verify the setting, not exact cut-off counts.

---

## Bucket drops (D-15)

The upgrade turns every 1.8 database and retention policy into a bucket. Only `stats` is used.

1. Re-check that the candidates had no writes since the cutover (Flux `count()` over
   `range(start: {cutover})` per bucket must be empty), and that `swarmpit_resolves` is still
   `swarmpit_influxdb`.
2. ⛔ Decision (27-06), then delete by name, one at a time. Deleting a bucket also deletes its DBRP mapping:
   ```bash
   for b in stats/31d db0/autogen swarmpit/an_hour swarmpit/a_day swarmpit/autogen upgrade-primary; do
     $CLI bucket delete --name "$b"
   done
   ```
3. Afterwards the bucket list shows only `stats`, `_monitoring` and `_tasks`.

1.x `_internal` monitoring is not migrated and has no v2 equivalent.

---

## Chronograf retirement (D-13)

InfluxDB 2's built-in UI replaces Chronograf 1.9.

1. ⛔ Approved at the 27-06 decision; executed in 27-07.
2. `docker service rm thinx_chronograf` on the manager. Remove the `chronograf` service from
   `docker-swarm.yml` and from the gluster `thinx.yml`, together with its Traefik routers and
   the `chrono-auth` middleware if nothing else uses it.
3. Keep its volume `/mnt/gluster/thinx/chronograf` until the deletion step.
4. Side effect: `restart.sh` no longer needs to reset a Chronograf password.

---

## Deletion after verification (D-02, D-07)

Only after Phase 27 verification passes: the dashboard shows non-zero figures, check-ins flow, CI is
green and the `stats` bucket is confirmed at 90 days.

1. ⛔ Decision (blocking-human, 27-07). This removes the last copy of history older than 90 days.
2. Delete by exact path, never by glob on a shared root:
   ```bash
   # on both nodes
   rm -rf /root/phase27/influx-1.8-portable-{ts} /root/phase27/influx-1.8-portable-{ts}.sha256 \
          /root/phase27/thinx_influxdb.pre.json
   # once, on a node with gluster mounted
   rm -rf /mnt/gluster/thinx/influx /mnt/gluster/thinx/influx-v1-upgrade-src /mnt/gluster/thinx/chronograf
   ```
   `thinx_influxdb.pre.json` exists only on the manager where step 4 ran.
3. Prove InfluxDB 2 is unaffected: `influx ping`, bucket list, and the 90-day counts unchanged.
4. After this point there is no rollback to 1.8.

---

## Annex

All rows are aggregates. Times are UTC.

| Row | UTC | Evidence |
|---|---|---|
| pre-flight | 2026-10-02 16:49–16:50 | `thinx_influxdb` runs `influxdb:1.8`, 1 replica, Running 34 h, on node **core** (N). `swarmpit_resolves=swarmpit_influxdb`. Cron mentions of influx: core 0, micro 0 (research A3 settled). Free space: core `/root` 17.6 GB, micro `/root` 18.5 GB, `/mnt/gluster` 17.2 GB, micro `/dev/shm` 1.0 GB. All above the 1 GB stop line. |
| backup | 2026-10-02 16:50 | `p27_backup=influx-1.8-portable-20261002T1650Z`, `p27_backup_T=2026-10-02T16:50:14Z`. `influxd backup -portable` (all databases) took 15 s. 86 files, 4,228 KB (shard files: `_internal` 8, `stats` 76; `db0` and `swarmpit` are meta-only). Copies under `/root/phase27` (dir mode 700, root-only) on **core** and **micro**; micro's copy streamed through an ssh pipe (no direct node-to-node ssh). The sha256 manifest (86 lines) checks OK on both nodes. Retained until plan 27-07 (D-02). |
| restore | 2026-10-02 16:51 | Fresh `influxdb:1.8` (digest `sha256:299ebda2c7e3`) container `p27-restore` on micro, `--network none`, 512 MB / 0.5 CPU; `influxd restore -portable` exit 0. Counts bounded by T, production vs restore: total 2379 = 2379; `v1_T_APIKEY_INVALID=4`, `v1_T_LOGIN_INVALID=1785`, `v1_T_DEVICE_NEW=8`, `v1_T_DEVICE_CHECKIN=539`, `v1_T_DEVICE_REVOCATION=3`, `v1_T_BUILD_STARTED=21`, `v1_T_BUILD_SUCCESS=9`, `v1_T_BUILD_FAILED=0`, other measurements 10 with 10 points; every `restore_T_*` equal. `restore_equal=1`. Container stopped and kept for the rehearsal. |
| rehearsal | 2026-10-02 16:54–16:56 | On micro, from a copy of the restored data. Images: `dhi.io/influxdb:2.9.1` digest `sha256:3d49ee8ee9a0` (same digest as `dhi.io/influxdb:2`, user 65532); `influxdb:2.9.1` (CLI) digest `sha256:db0bdab1e5ad`. Source modes before the copy: `meta` and `data` root 755, `wal`, `data/_internal` and `data/stats` root 700. **A6:** uid 65532 got `denied` on the un-chowned copy and `readable` after `chown -R 65532:65532`, so the cutover chown is required. `influxd upgrade --force` (env-file credentials, `--network none`) exit 0 in 3 s; `upgrade.log` says `Upgrade successfully completed. Start the influxd service now, then log in` and "no users in 1.x". Token and password greps: stdout 0, `upgrade.log` 0, CQ export 0; `configs` files in the data dir: 0. CQ export has 9 non-blank lines and no Swarmpit CQs (a portable restore carries none). Buckets: `_monitoring=604800`, `_tasks=259200`, `db0/autogen=7776000`, `stats/31d=2678400`, `stats/autogen=0` (infinite), `swarmpit/a_day=86400`, `swarmpit/an_hour=3600`, `swarmpit/autogen=0`, `upgrade-primary=3600`. DBRP before: `stats/autogen` → bucket `stats/autogen`, default=true. Flux counts on `stats/autogen` with stop T+1s (and T+1ns): total 2379; `v2_T_APIKEY_INVALID=4`, `v2_T_LOGIN_INVALID=1785`, `v2_T_DEVICE_NEW=8`, `v2_T_DEVICE_CHECKIN=539`, `v2_T_DEVICE_REVOCATION=3`, `v2_T_BUILD_STARTED=21`, `v2_T_BUILD_SUCCESS=9`, `v2_T_BUILD_FAILED=0`, other measurements 10 with 10 points; all equal to `restore_T_*`. `rehearsal_equal=1`. Rename `bucket update --name stats --retention 90d`: `stats=7776000`, shard-group duration 604800 unchanged, same bucket id; DBRP after: `stats/autogen` → bucket `stats`, default=true, same bucket id. `rehearsal_dbrp_kept=1`. Teardown: scratch containers 0, scratch dirs 0, `/dev/shm/p27r` shredded and removed; `/root/phase27` on both nodes holds only the backup dir and its manifest. Live `thinx_influxdb` still `influxdb:1.8` on core; no gluster path created. |
| release gate | 2026-10-02 17:37–17:38 | Commit under test `85ce4f4e` (31 ahead / 0 behind `origin/thinx-staging` `a0a1e097`; all 31 commits signed). **Local gate:** CI compose pair (`dhi.io/influxdb:2.9.1` plus `influxdb-setup`) onboarded; the 9-spec Phase 27 set ran **97 specs, 0 failures**, `server_version=v2.9.1`; `npm run test:node` exit 0; `node --check` OK on 12 changed JS files; compose project torn down. `PHASE27-LOCAL-GREEN`. **Diff hygiene:** raw counts `secret_hits=1 endpoint_hits=1 port_hits=1 ci_token_outside=0`, so `DIFF-HYGIENE-OK` was **not** printed. Waived by the operator (Decision A, `waive-reviewed`): "reviewed: hit 1 is a pattern name in prose, hit 2 is an endpoint already published on origin". Hit 1 is a Phase 26 SUMMARY naming the Slack-webhook scan pattern as text, not a secret. Hit 2 (endpoint and port) is the manager ssh line in a Phase 26 `.continue-here.md`; the same line is already on `origin/thinx-staging` in 18 files and in `AGENTS.md` on `origin/main`. No history change, no scrubbing. Phase 26 commits in range are `.planning`-only; the `services/console` gitlink is unchanged. **Production pre-flight:** no thinx-staging CircleCI job queued or running (latest: `api-registry` success at `a0a1e097`). `influx_image=influxdb:1.8 influx_running=1 influx_secrets=0 backup_ok=1` (micro copy); core copy `sha256 -c` OK. `thinx_influxdb` Running 35 h on core. `thinx_api` Running on micro since 13:21, image `thinx/api:swarm` digest `sha256:a39b646bbb0e` (rollback reference), RestartCount 0, update state completed. `swarmpit_app` and `swarmpit_influxdb` on micro; `swarmpit_resolves=swarmpit_influxdb`. **Fresh 1.8 aggregates** (all-time / last 90 d): total 2391 / 524; `APIKEY_INVALID` 4 / 0; `LOGIN_INVALID` 1797 / 458; `DEVICE_NEW` 8 / 0; `DEVICE_CHECKIN` 539 / 45; `DEVICE_REVOCATION` 3 / 0; `BUILD_STARTED` 21 / 12; `BUILD_SUCCESS` 9 / 9; `BUILD_FAILED` 0 / 0; other measurements 10 / 0. Measured gap rate about 41 points a week (planning context assumed about 19). |
| GO decision | 2026-10-02 17:41 | `p27_go=go-B`. Operator GO for the cutover window, F-2 option B: the InfluxDB admin user gets a random password held only as an unmounted swarm secret, and the InfluxDB UI is used through an SSH tunnel; the public route stays behind `influx-auth` (D-14). Nothing staged in `/dev/shm/p27` for this decision. The push that follows starts the accepted stats write gap (D-06); 27-05 upgrades storage straight after. Window check at the answer: 17:41 UTC, outside the blocked windows and more than 2 h before 22:30. |
| node repair | 2026-10-02 17:42–18:55 | First push `a0a1e097..60cd56da` at 17:42:11. CircleCI `test` #15564 **failed**: 1016 specs, 1 failure, 1 pending, `Statistics V2 (InfluxDB 2) another owner's points are never counted` (DEVICE_CHECKIN 2, expected 3). `Starting Influx` passed with the `influx setup` table and `v2.9.1`; `api-registry` did not run (gated on `test`), so production was unchanged: `thinx_api` stayed on the rollback digest `sha256:a39b646bbb0e`, `thinx_influxdb` on `influxdb:1.8`, stats gap not started. **Root cause** (connector, not CI): the WriteApi wrote `ms` precision with `timestamp(new Date())`. Identical writes (same measurement, owner, data) inside one millisecond are one series point, so InfluxDB kept the last and undercounted. Also the cause of the intermittent 27-03 run. **Repair** (operator choice `fix-connector`, the one node repair the plan allows): `test(27-04)` adds a frozen-clock burst spec and a clock-steps-back spec to StatisticsV2Spec, RED against the old connector (1 vs 4, 2 vs 4; `RED_EVIDENCE_OK`); `fix(27-04)` writes `ns` precision with a strictly increasing per-process timestamp (ms × 1e6, +1 ns when the clock repeats or steps back). Other connector contracts unchanged. **Re-gate:** CI compose pair, 9-spec Phase 27 set **99 specs, 0 failures**, `server_version=v2.9.1`; `npm run test:node` exit 0; `node --check` OK on 2 changed JS files; compose project torn down. `PHASE27-LOCAL-GREEN`. **Verify fix:** CircleCI masks secret values that equal common words (`influx` prints as `******`), so the SC3 grep accepts the masked tag `\[[*a-z]+-spec\] server_version=v2\.`. |
| push dormant | 2026-10-02 18:56–19:03 | Pushed `60cd56da..69677540` to `thinx-staging` at 18:56:02 (second and last push of this plan; main untouched). Pre-push: `DIFF-HYGIENE-OK` on the new range (`secret_hits=0 endpoint_hits=0 port_hits=0 ci_token_outside=0`), all 3 new commits signed, no thinx-staging job queued or running, 18:56 UTC inside the window. **CI for `69677540`:** `test=success` #15574, `api-registry=success` #15577 (finished 19:00:35), `console-classic-registry=success` #15578, `vue-console-registry=success` #15575. **SC3 evidence** (#15574): "Starting Influx" prints the `influx setup` table (`User Organization Bucket` header); "Running Unit and Integration Tests" prints `[******-spec] server_version=v2.9.1` (CircleCI masks the word `influx`) and `1018 specs, 0 failures, 1 pending spec`. `SC3-CI-ON-INFLUX2`. **Rollout:** `thinx_api` digest `sha256:a39b646bbb0e` → `sha256:7b2f5e43d343` on micro, new task Running from `T_dormant=2026-10-02T19:02:21Z` (under 2 min after the api image publish, no recovery step), RestartCount 0; the running container carries the ns-timestamp connector. **Dormant proof:** `ensure_skipped=1` (`[influx] ensure bucket=stats action=skipped reason=no_token`), `ensure_failed=0`, `api_state=Running`, `GET /api/v2/csrf-token` 200. `thinx_influxdb` untouched: `influx_image=influxdb:1.8`, 1 task Running on core, `influx_secrets=0`. The accepted stats write gap (D-06) runs from `T_dormant` until 27-06 enables stats; measured rate about 41 points a week. |
| cutover reference | 2026-10-02 22:42–22:43 | **Window override:** at about 22:41 UTC the operator said "Continue right now. There is no traffic expected on production." This overrides the Conventions' "nothing after 22:30 UTC" for this 27-05 run only; the 01:00–05:00 compaction block still applied (the switch started at 22:44). **First attempt** (19:07–19:10): reference taken, scaled to 0 at 19:08:48, then the manifest command was denied by the permission classifier; 1.8 restored to 1 replica at 19:09:43 (total 2402), nothing committed. **This run:** pre-change spec re-saved on micro to `/root/phase27/thinx_influxdb.pre.json` (mode 600, never printed). `p27_ref_T=2026-10-02T22:42:48Z`, `p27_window=2026-07-14T22:42:48Z/2026-10-02T22:42:48Z` (W80 = [T_ref − 80 d, T_ref)). Counted on core with 1.8 still running and the API dormant: `p27_v1_counts=total:2402,APIKEY_INVALID:4,LOGIN_INVALID:1808,DEVICE_NEW:8,DEVICE_CHECKIN:539,DEVICE_REVOCATION:3,BUILD_STARTED:21,BUILD_SUCCESS:9,BUILD_FAILED:0` and `p27_v1_window=total:501,APIKEY_INVALID:0,LOGIN_INVALID:458,DEVICE_NEW:0,DEVICE_CHECKIN:22,DEVICE_REVOCATION:0,BUILD_STARTED:12,BUILD_SUCCESS:9,BUILD_FAILED:0`. Other measurements: 10 with 10 points all-time, 0 in W80. Points since `T_dormant`: 0. |
| cutover | 2026-10-02 22:43–22:46 | **Stop:** `docker service scale thinx_influxdb=0` 22:43:10, converged 22:43:15, running 0. **Frozen manifest** 22:43:33 at `/root/phase27/influx-v1.frozen.sha256` (mode 600, 205 lines, relative paths and hashes). **Copy:** `cp -a` to `influx-v1-upgrade-src`, `chown -R 65532:65532`; manifest re-taken after the copy and `cmp`-identical, `frozen_stable=1`; the copy itself also matches the manifest (205 files). `influxdb2` created 65532:65532. Sizes: original 101,088 KB, copy 101,060 KB, `influxdb2` 876 KB after the upgrade and 4,239 KB after the first v2 start. **Secrets:** `INFLUXDB_OPERATOR_TOKEN` and `INFLUXDB_ADMIN_PASSWORD` created from `/dev/shm/p27` (mode 700; go-B: random admin password), mounted on nothing. **Upgrade** 22:44:18–22:44:28, exit 0, `--network none`, env-file credentials, default configs path: `upgrade.log` has `Upgrade successfully completed` (1); token and password greps on `upgrade.log`, the CQ export and stdout all 0; `configs` files 0; CQ export 13 non-blank lines (rehearsal 9: the live meta carries CQs a portable restore drops). **Switch:** one `docker service update --with-registry-auth` 22:44:40, converged 22:44:55, task on **core**. Image `dhi.io/influxdb:2.9.1`; the running task's digest is `sha256:3d49ee8ee9a0` (the rehearsed one), user 65532, RestartCount 0, 0 error lines. The spec carries no `@sha256:` pin: swarm records no digest for dhi.io images (`thinx_couchdb` on `dhi.io/couchdb:3` is unpinned the same way). Mounts: `/mnt/gluster/thinx/influxdb2:/var/lib/influxdb2` only; swarmpit mounts 0; `INFLUXD_*` env 6; v1 `INFLUXDB_*` env 0; http router middleware `https-redirect` (was `influx-auth,error-pages-middleware`). **CLI** (`influxdb:2.9.1`, digest `sha256:db0bdab1e5ad`): ping OK. Buckets: `_monitoring=604800`, `_tasks=259200`, `db0/autogen=7776000`, `stats/31d=2678400`, `stats/autogen=0`, `swarmpit/a_day=86400`, `swarmpit/an_hour=3600`, `swarmpit/autogen=0`, `upgrade-primary=3600` (same set as the rehearsal). DBRP: `stats/autogen` → bucket `stats/autogen`, default=true; the remaining rows are the per-bucket mappings (`stats/31d` default=false). **Probe** (API image `sha256:7b2f5e43d343`, `--bucket stats/autogen`, W80 bounds): `INFLUX-STATS-PROBE OK`, `bucket_retention_s=0`; every `count_all_*` and `count_window_*` equals the reference, `counts_equal=1 window_equal=1`. **Untouched original:** `orig_changed=0` (manifest diff after the switch); owner still 0:0. `HISTORY-EQUAL-ON-V2`. The swarmpit autoredeploy label on `thinx_influxdb` is still `true` and was left unchanged (follow-up for 27-07 / Phase 28). |
