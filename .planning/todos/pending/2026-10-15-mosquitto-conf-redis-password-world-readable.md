---
created: 2026-10-15T11:57:29.703Z
title: Restrict mosquitto.conf that carries the Redis password
area: infra
severity: major
files:
  - micro:/mnt/gluster/thinx/mosquitto/config/mosquitto.conf
  - .planning/runbooks/traefik-edge-hardening.md:2350
---

## Problem

`/mnt/gluster/thinx/mosquitto/config/mosquitto.conf` (gluster deploy state, not in git) is mode `0644` and contains
the Redis password (go-auth backend). Anything on either node that can read gluster can read it. Recorded during
Phase 34 MQTTS work as "Seen, not fixed (out of scope)" in the edge-hardening runbook (line 2350).

## Solution

`chown root:1883` + `chmod 0640`. Do NOT use `0600`: mosquitto re-reads the file on SIGHUP as uid 1883 and a
root-only file breaks reload. Back up first (dir 700 / file 600, like
`/mnt/data/edge-rollback/p34-mqtts-*`). Verify: `docker kill -s HUP` the mosquitto task and confirm no error, then
probe 1883 and 8883 from the public IP 188.166.23.244 (never loopback — see mosquitto MQTTS memory). Consider whether
the Redis password should be rotated since it has been world-readable. Keep plain MQTT 1883 working (legacy devices).
