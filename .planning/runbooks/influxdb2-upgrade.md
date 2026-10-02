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

## Annex

All rows are aggregates. Times are UTC.

| Row | UTC | Evidence |
|---|---|---|
| pre-flight | 2026-10-02 16:49–16:50 | `thinx_influxdb` runs `influxdb:1.8`, 1 replica, Running 34 h, on node **core** (N). `swarmpit_resolves=swarmpit_influxdb`. Cron mentions of influx: core 0, micro 0 (research A3 settled). Free space: core `/root` 17.6 GB, micro `/root` 18.5 GB, `/mnt/gluster` 17.2 GB, micro `/dev/shm` 1.0 GB. All above the 1 GB stop line. |
| backup | 2026-10-02 16:50 | `p27_backup=influx-1.8-portable-20261002T1650Z`, `p27_backup_T=2026-10-02T16:50:14Z`. `influxd backup -portable` (all databases) took 15 s. 86 files, 4,228 KB (shard files: `_internal` 8, `stats` 76; `db0` and `swarmpit` are meta-only). Copies under `/root/phase27` (dir mode 700, root-only) on **core** and **micro**; micro's copy streamed through an ssh pipe (no direct node-to-node ssh). The sha256 manifest (86 lines) checks OK on both nodes. Retained until plan 27-07 (D-02). |
| restore | 2026-10-02 16:51 | Fresh `influxdb:1.8` (digest `sha256:299ebda2c7e3`) container `p27-restore` on micro, `--network none`, 512 MB / 0.5 CPU; `influxd restore -portable` exit 0. Counts bounded by T, production vs restore: total 2379 = 2379; `v1_T_APIKEY_INVALID=4`, `v1_T_LOGIN_INVALID=1785`, `v1_T_DEVICE_NEW=8`, `v1_T_DEVICE_CHECKIN=539`, `v1_T_DEVICE_REVOCATION=3`, `v1_T_BUILD_STARTED=21`, `v1_T_BUILD_SUCCESS=9`, `v1_T_BUILD_FAILED=0`, other measurements 10 with 10 points; every `restore_T_*` equal. `restore_equal=1`. Container stopped and kept for the rehearsal. |
