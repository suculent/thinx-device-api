# Phase 9 Discussion Log

**Date:** 2026-06-03
**Mode:** auto
**Phase:** 9 — Historic PII Redaction (managed_logs)

## Areas Discussed

### Area 1: SEC-PII-02 strategy (4 options)

User selected: **(c) Hybrid — overlay-redact AND forward-going TTL**.

Translates to FOUR phase deliverables: redaction script (default dry-run, snapshot-then-apply), sampling verification (N=1000 random recent + N=1000 random old), audit.js TTL modification (expire_at field, 90-day default), operator runbook with GDPR-posture note.

## Operator-Side Nature

Phase 9 is OPERATOR-EXECUTED. The repo ships the script + runbook + audit.js change. The operator runs the redaction against production CouchDB on the swarm (per `couchdb-access` memory: overlay network curl with credentials in `/mnt/gluster/thinx/.env`).

## Deferred Ideas Captured

- Retroactive cleanup of other CouchDB DBs (managed_users, managed_devices, etc.)
- CouchDB cron infrastructure (lives on swarm host — runbook recipe only)
- TTL-driven log compaction (separate `_compact` operation)
- Cryptographic audit-log chain (v2+ candidate)

## Constraints Captured

- Redaction script DEFAULTS to dry-run; requires `--apply` + `--snapshot-to <path>` for destructive mode
- Idempotent: re-runs produce zero edits
- Snapshot file is the only rollback path; CouchDB has no native time-travel
- Operator confirmation flag required (`--i-understand-this-is-destructive` or interactive)
