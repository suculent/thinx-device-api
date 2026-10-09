# Swarm Host Config Snapshots

## Purpose

Version-controlled snapshots of swarm-host edge-layer config files (currently nginx server blocks on rtm.thinx.cloud). Pre-fix and post-fix pairs let future operators `diff` exactly what an OPS-execution phase changed and provide the restore source for documented rollback procedures.

These snapshots are an audit-trail copy of off-repo state. The swarm-host's live nginx config is the source of truth at runtime; this directory is the source of truth for "what we last shipped" and "what to restore to" during a rollback.

## Naming convention

Snapshots follow the pattern `<hostname>-server.{pre,post}.nginx` literally. Examples for Phase 13 (literal filenames in `rtm.thinx.cloud-server.{pre,post}.nginx` form):

- `rtm.thinx.cloud-server.pre.nginx` — pre-fix full server-block snapshot
- `rtm.thinx.cloud-server.post.nginx` — post-fix full server-block snapshot

Swarm stack files and the config files they bind-mount use a per-step pattern:

- `swarmpit-stack.<step>.{pre,post}.yml` — the Swarmpit stack file (`/mnt/gluster/deployment/swarm/swarmpit.yml`) captured before and after each Phase 28 step. Steps: `0` (only if the D-17 drift check found drift and the file was reconciled), `A` (stats trim), `B` (1.10 upgrade).
- `swarmpit-influxdb*.A.pre.conf` — copies of `swarmpit/influxdb.conf` (and its `.bak.*` sibling) taken before Step A deletes them; the restore source for the Step A rollback.
- `traefik-edge.<step>.{pre,post}.yml` — the Traefik edge service (`traefik_traefik`: resolved static command, mounts, configs, labels, plus the app-stack router labels the step touches, ACME continuity and the discovered router state) captured before/after each edge step, redacted on micro before being read off the host. Steps: `A`/`B` (Phase 30, provider/label reconciliation), `C` (Phase 31 v2.11 -> v3.7.14 hop, BC mode: 17-flag command with the v2 rule-syntax switch), `D` (Phase 32 native-v3 rules + BC-switch removal: 16-flag command, four routers on `HeaderRegexp` / ``PathPrefix(`/`)``, zero `ruleSyntax` labels), `E` (Phase 33 dashboard lockdown + TLS hardening: 19-flag command — loopback `mgmt` entrypoint at 127.0.0.1:8080 with the `traefik-mgmt` router to api@internal, public dashboard routers + basic-auth gone, `exposedbydefault=false`, file provider loading `tls-config-2` (AEAD-only TLS 1.2+), entrypoint-default `security-headers@swarm` HSTS on every HTTPS host, ACME store 23 entries after the influx reissue). Each `.post.yml` is an immutable phase record; the next phase opens a new step pair instead of editing it.
- `traefik-edge-scan.<YYYY-MM-DD>.md` — laptop external scan (nmap `ssl-enum-ciphers` + port sweep, sslscan, curl -I) before/after matrix for Phase 33 (D-26..D-29); header names, port states, serials and fixed values only; rerun with `scripts/traefik-edge-scan.sh`.

Future OPS phases targeting additional hosts (e.g., mosquitto edge) extend the same pattern.

## Snapshot capture recipe

Run on the swarm host as root (after `ssh micro before the edit and once after:

```bash
nginx -T 2>&1 | awk '/server_name rtm.thinx.cloud/,/^}/' > rtm.thinx.cloud-server.pre.nginx
```

(After the edit + `nginx -t` + `systemctl reload nginx`, repeat with the `.post.nginx` filename.)

Operator transfers both files back to a developer workstation via `scp` (or `cat` + clipboard) and commits them into this directory unchanged.

## Persistence rules

Snapshots are checked in as-is — no reformatting, no comment stripping, no secret redaction beyond what nginx itself emits in `nginx -T`. The point of the snapshot is to be a bit-exact restore source for the documented rollback procedure; reformatting defeats that purpose and breaks `diff` parity against the live config.

**Exception for YAML stack snapshots and copied config files (Phase 28, D-17).** Stack snapshots (`*-stack.<step>.{pre,post}.yml`) and copied config files have every secret value replaced by the literal `<redacted>` and are otherwise bit-exact, so `diff` against the live file and the rollback restore still work (restore the redacted values from the live backup on the manager, never from git). `swarmpit/couchdb-logging.ini` carries the CouchDB admin hash and is never copied, snapshotted or committed, in any form.

**`${VAR}` interpolation stays templated (Phase 31, Traefik edge captures `traefik-edge.<step>.{pre,post}.yml`).** Every `${DOMAIN}` / `${EMAIL}` / `${USERNAME}` / `${HASHED_PASSWORD}` reference is kept templated and its resolved value is not written into an adjacent comment either — `${DOMAIN}` is a public DNS name, not a D-12 secret class, but the captures stay consistent so a `diff` across the pair and against future captures carries no resolved values.

The snapshots are NOT executable. They are configuration text, not scripts.

## Established by

Phase 13 (OPS-EXEC-01) — see `.planning/runbooks/websocket-handshake.md` for the SEC-WS-01 Execution Annex + Rollback Procedure that consume these snapshots. The Annex links each annex entry to the matching `pre.nginx` / `post.nginx` pair; the Rollback Procedure uses `rtm.thinx.cloud-server.pre.nginx` as the restore source for a < 5-minute SLA rollback.

Established by Phase 28 (Swarmpit upgrade and trim) for the YAML stack snapshots: see `.planning/runbooks/swarmpit-upgrade.md` (§ Conventions, § Rollback and the Annex rows that name each `swarmpit-stack.<step>.{pre,post}.yml` pair).

## v1.11+ adoption

The swarm-configs convention is available for future OPS phases. OPS-02 (swarm memberlist hygiene) and OPS-03 (autoredeploy spec fixes) are candidates that would inherit this pattern — each future OPS-execution would land its own pre/post snapshot pair here. Backfilling earlier OPS runbooks (Phase 3 OPS-01, Phase 9 SEC-PII-02, Phase 11 BASE-IMG-01) is a deferred v1.11+ candidate; not required for the convention to be operational.
