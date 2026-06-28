# Swarm Host Config Snapshots

## Purpose

Version-controlled snapshots of swarm-host edge-layer config files (currently nginx server blocks on rtm.thinx.cloud). Pre-fix and post-fix pairs let future operators `diff` exactly what an OPS-execution phase changed and provide the restore source for documented rollback procedures.

These snapshots are an audit-trail copy of off-repo state. The swarm-host's live nginx config is the source of truth at runtime; this directory is the source of truth for "what we last shipped" and "what to restore to" during a rollback.

## Naming convention

Snapshots follow the pattern `<hostname>-server.{pre,post}.nginx` literally. Examples for Phase 13 (literal filenames in `rtm.thinx.cloud-server.{pre,post}.nginx` form):

- `rtm.thinx.cloud-server.pre.nginx` — pre-fix full server-block snapshot
- `rtm.thinx.cloud-server.post.nginx` — post-fix full server-block snapshot

Future OPS phases targeting additional hosts (e.g., `swarmpit.thinx.cloud`, mosquitto edge) extend the same pattern.

## Snapshot capture recipe

Run on the swarm host as root (after `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`), once before the edit and once after:

```bash
nginx -T 2>&1 | awk '/server_name rtm.thinx.cloud/,/^}/' > rtm.thinx.cloud-server.pre.nginx
```

(After the edit + `nginx -t` + `systemctl reload nginx`, repeat with the `.post.nginx` filename.)

Operator transfers both files back to a developer workstation via `scp` (or `cat` + clipboard) and commits them into this directory unchanged.

## Persistence rules

Snapshots are checked in as-is — no reformatting, no comment stripping, no secret redaction beyond what nginx itself emits in `nginx -T`. The point of the snapshot is to be a bit-exact restore source for the documented rollback procedure; reformatting defeats that purpose and breaks `diff` parity against the live config.

The snapshots are NOT executable. They are configuration text, not scripts.

## Established by

Phase 13 (OPS-EXEC-01) — see `.planning/runbooks/websocket-handshake.md` for the SEC-WS-01 Execution Annex + Rollback Procedure that consume these snapshots. The Annex links each annex entry to the matching `pre.nginx` / `post.nginx` pair; the Rollback Procedure uses `rtm.thinx.cloud-server.pre.nginx` as the restore source for a < 5-minute SLA rollback.

## v1.11+ adoption

The swarm-configs convention is available for future OPS phases. OPS-02 (swarm memberlist hygiene) and OPS-03 (autoredeploy spec fixes) are candidates that would inherit this pattern — each future OPS-execution would land its own pre/post snapshot pair here. Backfilling earlier OPS runbooks (Phase 3 OPS-01, Phase 9 SEC-PII-02, Phase 11 BASE-IMG-01) is a deferred v1.11+ candidate; not required for the convention to be operational.
