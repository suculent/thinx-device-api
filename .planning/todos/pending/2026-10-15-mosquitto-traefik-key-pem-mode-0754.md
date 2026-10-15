---
created: 2026-10-15T11:57:29.703Z
title: Fix traefik_key.pem mode 0754 in mosquitto/ssl
area: infra
severity: minor
files:
  - micro:/mnt/gluster/thinx/mosquitto/ssl/traefik_key.pem
  - .planning/runbooks/traefik-edge-hardening.md:2352
---

## Problem

`mosquitto/ssl/traefik_key.pem` is mode `0754`: group-readable, world-readable and executable on a private key.
Recorded as "Seen, not fixed" (runbook line 2352). Since Phase 34 mosquitto's `keyfile /mqtt/ssl/traefik_key.pem` line
is commented out (MQTTS uses the thinx.cloud cert synced from acme.json), so this may be a stale leftover.

## Solution

Check whether anything still references it (`grep -r traefik_key` in mosquitto.conf, thinx-swarm, cron scripts). If
unused, move it into a 700 backup dir and delete; otherwise `chmod 0640 root:1883`. Do together with the
mosquitto.conf and ssl-dir permission todos.
