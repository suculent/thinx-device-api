---
phase: 32
review: 32-REVIEW.md
updated: 2026-10-08T15:42:25Z
findings:
  - id: IN-01
    severity: info
    title: "tls.toml is mounted but has never been loaded (no --providers.file)"
    disposition: open
  - id: IN-02
    severity: info
    title: "vault.yml still carries the v2 traefik.docker.network label"
    disposition: open
  - id: IN-03
    severity: info
    title: "Dead Traefik v1 traefik.frontend.headers.* labels on console and vue"
    disposition: open
  - id: IN-04
    severity: info
    title: "thinx-vue-console-https, thinx-db-https, thinx-influx-https have no security-headers@swarm"
    disposition: open
  - id: IN-05
    severity: info
    title: "thinx-api-ws hardcodes rtm.thinx.cloud while sibling routers use ${THINX_HOSTNAME}"
    disposition: open
  - id: IN-06
    severity: info
    title: "mosquitto-secure TCP router has no rule"
    disposition: open
  - id: IN-07
    severity: info
    title: "Duplicated comment and trailing whitespace in downtime.yml"
    disposition: open
  - id: IN-08
    severity: info
    title: "Unused net overlay network declared in the Traefik stack"
    disposition: open
  - id: IN-09
    severity: info
    title: "error-pages-middleware is defined twice with identical bodies"
    disposition: open
---

# Phase 32 Code Review Disposition

One row per finding in `32-REVIEW.md`. Default `open`; set `fixed` / `skipped` / `deferred` by hand with the reason in the Source column. Rebuilt by `/gsd-code-review 32 --fix` or the next execute-phase code-review gate.

| ID | Severity | Disposition | Source |
|---|---|---|---|
| IN-01 | info | open | pre-existing, outside the Phase 32 diff: tls.toml is mounted but has never been loaded (no --providers.file) |
| IN-02 | info | open | pre-existing, outside the Phase 32 diff: vault.yml still carries the v2 traefik.docker.network label |
| IN-03 | info | open | pre-existing, outside the Phase 32 diff: Dead Traefik v1 traefik.frontend.headers.* labels on console and vue |
| IN-04 | info | open | pre-existing, outside the Phase 32 diff: thinx-vue-console-https, thinx-db-https, thinx-influx-https have no security-headers@swarm |
| IN-05 | info | open | pre-existing, outside the Phase 32 diff: thinx-api-ws hardcodes rtm.thinx.cloud while sibling routers use ${THINX_HOSTNAME} |
| IN-06 | info | open | pre-existing, outside the Phase 32 diff: mosquitto-secure TCP router has no rule |
| IN-07 | info | open | pre-existing, outside the Phase 32 diff: Duplicated comment and trailing whitespace in downtime.yml |
| IN-08 | info | open | pre-existing, outside the Phase 32 diff: Unused net overlay network declared in the Traefik stack |
| IN-09 | info | open | pre-existing, outside the Phase 32 diff: error-pages-middleware is defined twice with identical bodies |
