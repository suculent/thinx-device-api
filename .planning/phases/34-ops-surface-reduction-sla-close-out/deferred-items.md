# Phase 34 — deferred items

## From 34-04 (credential rotation, 2026-10-09)

- **RESOLVED 2026-10-09 16:18Z (orchestrator, operator request):** label port 5985 -> 5984 — thinx-swarm `2a479a0`,
  thinx-device-api `2af2b3ed`, live label-only on `thinx_couchdb` (Version.Index 38380191, task unchanged); record
  `### P34 db.thinx.cloud port fix record` in the edge runbook. Original entry:
  **db.thinx.cloud returns 502 once basic-auth passes. This predates Phase 34.** The `thinx_couchdb` label
  `traefik.http.services.thinx-db.loadbalancer.server.port=5985` points Traefik at `http://10.0.1.6:5985`. Inside
  the Traefik task netns `:5985` is closed and `:5984` is open (CouchDB 3 / DHI listens on 5984 only). The same 5985
  value is in thinx-swarm `thinx.yml` :128, in this repo's `docker-swarm.yml` :180, and in the pre-Stage-D spec
  backup (15:42Z). The rotation changed only the basicauth label. To fix it, repo-first in both files (`5984`), then one
  `--label-add traefik.http.services.thinx-db.loadbalancer.server.port=5984` on `thinx_couchdb` (label-only), gated
  by the loopback `29/0` inventory and an authenticated request in the Traefik netns that returns non-502. Before
  fixing, confirm with the operator that db.thinx.cloud is meant to be reachable at all. Evidence:
  `.planning/runbooks/traefik-edge-hardening.md` `### P34 credential rotation record`.
