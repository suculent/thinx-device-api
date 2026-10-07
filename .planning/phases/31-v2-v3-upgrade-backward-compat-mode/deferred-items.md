# Phase 31 — Deferred Items

## From plan 31-01 (2026-10-07)

- **`~/Repositories/thinx-swarm/thinx.yml` is stale relative to the live thinx stack.** It lacks the
  `thinx-api-ws` router, the `security-headers` refs on `thinx-api-https` / `thinx-console-https`, still
  declares `chronograf` (retired P27) and `couchdb:3`, and carries a dead `Upgrade=$http_upgrade` header
  label. The deploy copy that `restart.sh` actually uses (`micro:/mnt/gluster/deployment/swarm/thinx.yml`)
  equals this repo's `docker-swarm.yml` for every traefik label. 31-01 renamed only the provider
  suffix / network labels in the stale file (so a future sync cannot re-introduce `@docker`); a full
  thinx-stack reconciliation (committed thinx-swarm == gluster deploy copy == live) is an app-stack
  concern outside the P31 edge-static scope.
  status: open
  **Found during:** 31-01 Task 1 (authoritative-source resolution). Until reconciled, do not
  `docker stack deploy` the thinx stack from the thinx-swarm checkout (Pitfall 5).

- **`tls.toml` is mounted on the traefik service but never loaded.** The static command has no
  `--providers.file*` flag, so the `tls-config-1` docker config at `/traefik/tls.toml` (min TLS 1.2 /
  cipher list) is inert on v2.11 and would stay inert on v3. Pre-existing; belongs to the P33 TLS
  hardening (EDGE-TLS-*), not to the v3 hop.
  status: open
  **Found during:** 31-01 Task 3 (probe did not need the config mount to boot).

- **`thinx_mosquitto` `mosquitto-secure` TCP router is undiscoverable** (no `traefik.constraint-label`,
  no `rule`), under v2 and v3 alike — the "dead router" P30 D-03 annotated. Cleanup remains the
  annotate-only later item from 31-CONTEXT.
  status: open
  **Found during:** 31-01 Task 3 (probe TCP routers total 0).

- **Four external stacks + `registry_registry` carry `traefik.docker.network` with no source file in
  either repo** (`fotostim_landing-com/-cz`, `igraczech-com_web`, `syxra-cz_web`). Single-network, so
  the unread label is harmless under v3; Plan 03 Stage A/C may rename them live by `docker service
  update --label-*` only.
  status: open
  **Found during:** 31-01 Task 1.
