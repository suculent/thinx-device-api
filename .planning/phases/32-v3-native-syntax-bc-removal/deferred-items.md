# Phase 32 — Deferred Items

## Deferred Items

- ACME renewal failure for the external fotostim stack certificate `checkout.qooldata.com` (SANs `checkout.fotostim.com`, `checkout.fotostim.cz`): the new `traefik_traefik` task logged `ERR Error renewing ACME certificate … invalid authorization … 400` at its 2026-10-08 14:48:34Z start (the v3 start-time renewal pass). Unrelated to Phase 32 (rule syntax / BC switch); the served `app.thinx.cloud` / `rtm.thinx.cloud` serials are unchanged. Out of scope for this repo — the external stack has no committed stack file here. Found during 32-02 Task 2 (live log scan). Owner: the fotostim stack operator (DNS / TLS-challenge reachability for `checkout.qooldata.com`).
  status: open
