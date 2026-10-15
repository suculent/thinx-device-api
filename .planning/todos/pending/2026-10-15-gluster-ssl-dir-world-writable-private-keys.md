---
created: 2026-10-15T11:57:29.703Z
title: Lock down /mnt/gluster/thinx/ssl dir and private keys
area: infra
severity: major
files:
  - micro:/mnt/gluster/thinx/ssl
  - thinx-swarm/renew_registry_cert.sh
  - .planning/runbooks/traefik-edge-hardening.md:2246
  - .planning/runbooks/traefik-edge-hardening.md:2351
---

## Problem

`/mnt/gluster/thinx/ssl/` is mode `0666` (world-writable) and the private key files in it — one per exported
domain — are `0644` (world-readable). Anyone on the nodes can read every TLS key or plant files there. Recorded as
"Seen, not fixed" in the edge-hardening runbook (line 2351); the directory used to be bind-mounted rw into
thinx_mosquitto (line 2246).

## Solution

TBD — first map every reader/writer of the dir: `update_all.sh` / `renew_registry_cert.sh` (root crontab, 1st of
month), the mosquitto cert sync cron (`/etc/cron.d/mosquitto-cert-renew`, `scripts/mosquitto-cert-renew.sh` in
thinx-swarm), registry.yml / thinx.yml bind mounts. Then dir `0750` (or `0700` root), keys `0600` (or `0640`
with the consuming uid's group), certs `0644`. Make the export script set the modes itself (umask) so renewals don't
regress it. Back up before changing; verify mosquitto, registry and any other consumer after.
