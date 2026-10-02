---
created: 2026-10-02T13:15:00.000Z
title: Back up the GlusterFS InfluxDB data before the Phase 27 upgrade
area: ops
severity: blocker-for-phase-27
files:
  - /mnt/gluster/thinx/influx (thinx_influxdb data, bind-mounted at /var/lib/influxdb)
---

## Context

On 2026-10-02 the operator took DigitalOcean snapshots of both swarm VM nodes. Those snapshots do
**not** cover the GlusterFS InfluxDB data, so `/mnt/gluster/thinx/influx` needs its own backup before
the irreversible InfluxDB 1.8 → 2 storage upgrade (Phase 27 success criterion 1: "a backup of the
InfluxDB 1.8 data is taken and verified restorable").

## Do

As the first step of Phase 27, before anything touches `thinx_influxdb`:

- Take a backup of the 1.8 data. Prefer `influxd backup -portable` from the running 1.8 container,
  targeted by service name `thinx_influxdb` on its current node (placement floats; query it first).
  Optionally also take a file-level copy of `/mnt/gluster/thinx/influx` while the service is stopped.
- Store it off the gluster volume, or at least outside the data path.
- Verify the backup restores into a throwaway 1.8 container: the `stats` measurement counts match the
  live ones (counts only).
- Record the location, size and verification in the Phase 27 runbook annex. Record no credentials.

## Resolution

Done 2026-10-02 in plan 27-01: portable backup of every 1.8 database on both nodes, sha256 manifest OK on both, restore into a throwaway 1.8 container gave equal `stats` counts at the backup reference time (`restore_equal=1`). See the "backup" and "restore" rows of the Annex in `.planning/runbooks/influxdb2-upgrade.md`. The backup is retained per D-02 until plan 27-07.
