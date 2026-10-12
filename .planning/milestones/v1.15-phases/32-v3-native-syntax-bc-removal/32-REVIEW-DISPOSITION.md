---
phase: 32
review: 32-REVIEW.md
updated: 2026-10-12T09:37:08Z
findings:
  - id: IN-01
    severity: info
    title: "tls.toml is mounted but has never been loaded (no --providers.file)"
    disposition: fixed
  - id: IN-02
    severity: info
    title: "vault.yml still carries the v2 traefik.docker.network label"
    disposition: fixed
  - id: IN-03
    severity: info
    title: "Dead Traefik v1 traefik.frontend.headers.* labels on console and vue"
    disposition: fixed
  - id: IN-04
    severity: info
    title: "thinx-vue-console-https, thinx-db-https, thinx-influx-https have no security-headers@swarm"
    disposition: fixed
  - id: IN-05
    severity: info
    title: "thinx-api-ws hardcodes rtm.thinx.cloud while sibling routers use ${THINX_HOSTNAME}"
    disposition: fixed
  - id: IN-06
    severity: info
    title: "mosquitto-secure TCP router has no rule"
    disposition: fixed
  - id: IN-07
    severity: info
    title: "Duplicated comment and trailing whitespace in downtime.yml"
    disposition: deferred
  - id: IN-08
    severity: info
    title: "Unused net overlay network declared in the Traefik stack"
    disposition: deferred
  - id: IN-09
    severity: info
    title: "error-pages-middleware is defined twice with identical bodies"
    disposition: deferred
---

# Phase 32 Code Review Disposition

One row per finding in `32-REVIEW.md`. Default `open`; set `fixed` / `skipped` / `deferred` by hand with the reason in the Source column. Rebuilt by `/gsd-code-review 32 --fix` or the next execute-phase code-review gate.

| ID | Severity | Disposition | Source |
|---|---|---|---|
| IN-01 | info | fixed | pre-existing, outside the Phase 32 diff: tls.toml is mounted but has never been loaded (no --providers.file); fixed 2026-10-12: P33 Stage C added `--providers.file.filename=/traefik/tls.toml` (tls-config-2, now tls-config-3; 33-VERIFICATION truth 14) |
| IN-02 | info | fixed | pre-existing, outside the Phase 32 diff: vault.yml still carries the v2 traefik.docker.network label; fixed 2026-10-12: `6dc974b` (P33 D-08): vault.yml uses `traefik.swarm.network`, 0 active `traefik.docker.` labels in thinx-swarm (one commented-out line in `downtime/docker-compose.yml`); `b04f066` also made vault.yml deploy-safe |
| IN-03 | info | fixed | pre-existing, outside the Phase 32 diff: Dead Traefik v1 traefik.frontend.headers.* labels on console and vue; fixed 2026-10-12: `6dc974b` / `a68a02ff` (P33 D-08) removed the v1 frontend labels |
| IN-04 | info | fixed | pre-existing, outside the Phase 32 diff: thinx-vue-console-https, thinx-db-https, thinx-influx-https have no security-headers@swarm; fixed 2026-10-12: P33 Stage D made security-headers the `https` entrypoint default (`1578d2f`, per-router refs dropped in `c03c529`), so vue, db and influx are covered; `security-headers@file` since P34 (`8a7a693`, `3d3a31b`); P34 end state: exactly 1 HSTS header on each of 16 hosts |
| IN-05 | info | fixed | pre-existing, outside the Phase 32 diff: thinx-api-ws hardcodes rtm.thinx.cloud while sibling routers use ${THINX_HOSTNAME}; fixed 2026-10-12: `6dc974b` / `a68a02ff`: the WS rule uses the WEB_HOSTNAME variable (P33 D-08 chose WEB_HOSTNAME over the reviewer's THINX_HOSTNAME); the literal is gone |
| IN-06 | info | fixed | pre-existing, outside the Phase 32 diff: mosquitto-secure TCP router has no rule; fixed 2026-10-12: `6dc974b` / `a68a02ff` removed the mosquitto TCP-router labels; mosquitto keeps its published ports (33-VERIFICATION truth 10) |
| IN-07 | info | deferred | pre-existing, outside the Phase 32 diff: Duplicated comment and trailing whitespace in downtime.yml; deferred 2026-10-12: downtime.yml duplicate comment and trailing spaces remain; YAML trims them, so no live effect → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-08 | info | deferred | pre-existing, outside the Phase 32 diff: Unused net overlay network declared in the Traefik stack; deferred 2026-10-12: the `net` overlay is still declared and unused (= 30 IN-04 = 33 IN-05) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-09 | info | deferred | pre-existing, outside the Phase 32 diff: error-pages-middleware is defined twice with identical bodies; deferred 2026-10-12: identical definitions in traefik.yml and errorpage.yml remain; removing one is a live label change on a running service (repo-first, coordinated label removal) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
