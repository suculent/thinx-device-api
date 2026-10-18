---
created: 2026-10-15T11:57:29.703Z
title: Fix broken docker service restart line in clean_docker cron
area: infra
severity: minor
files:
  - micro:/etc/cron.d/clean_docker
  - .planning/runbooks/traefik-edge-hardening.md:2352
  - .planning/runbooks/log-paging-retention.md:348
audit_acknowledged:
  milestone: v1.18
  at: 2026-10-18
---

## Problem

`/etc/cron.d/clean_docker` (root; runs 17:09 daily and 01:01 on the 1st) has line 2 starting with
`docker service restart`, which is not a docker command, so that job fails before it reaches `update_all.sh`. Cert
export still happens through the root crontab `renew_registry_cert.sh` (03:00 on the 1st), so nothing is broken
today, but the cron entry is dead and misleading.

## Solution

Read the whole file first. Either delete the broken line (and the then-redundant `update_all.sh` chain, since
renew_registry_cert.sh already does it) or replace it with the intended `docker service update --force <svc>`.
Never restart edge services from cron (AGENTS.md: edge changes are manual `docker service update` only). Keep the
cleanup part working; verify with `run-parts --test`-style dry run / manual execution and check syslog after the
next 17:09 run.
