# Phase 9 Context: Historic PII Redaction (managed_logs)

**Created:** 2026-06-03
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** SEC-PII-02

## Domain

Remediate the ~658k pre-v1.0 CouchDB `managed_logs` documents that still carry raw `reset_keys` (and any other PII), AND introduce a forward-going TTL on new audit entries.

The phase delivers FOUR artifacts:
1. A reversible-with-snapshot redaction script (`scripts/redact-managed-logs.js`) that streams `_all_docs?include_docs=true` in batches, detects raw 64-char hex `reset_key` substrings + raw email patterns, overlays `[REDACTED]` via `_bulk_docs`.
2. A sampling verification subcommand (N=1000 random recent + N=1000 random old) returning zero raw reset_keys post-remediation.
3. A forward-going TTL modification to `lib/thinx/audit.js` that adds an `expire_at` field (e.g., now + 90 days) to every new log write, plus a CouchDB `_design/cleanup` view that surfaces expired docs for a nightly cron.
4. An operator-side runbook documenting the entire remediation procedure (`.planning/runbooks/managed-logs-redaction.md`) + GDPR-posture note.

**This phase is OPERATOR-EXECUTED.** The script runs against production CouchDB on the swarm; this repo delivers the script + runbook only. Phase 9's verifier checks the artifacts exist + the unit tests pass; it does NOT exercise the production CouchDB (that's operator-side).

In scope: redaction script, sampling script, audit.js TTL change + spec, runbook, GDPR-posture note.

Out of scope (deferred): the operator's actual production run (which lives in the runbook); CouchDB cron infrastructure (depends on swarm-side scheduler + lives in `/mnt/gluster/deployment/swarm/` outside this repo); deep retroactive cleanup of other DBs beyond `managed_logs`.

## Canonical Refs

- `.planning/ROADMAP.md` — Phase 9 (lines 90–98)
- `.planning/REQUIREMENTS.md` — SEC-PII-02 (line 28)
- `.planning/PROJECT.md` — SEC-PII-01 reference (Phase 2 v1.0 redaction landed at 12+1 sites in `owner.js`)
- `.planning/runbooks/` — existing runbook set; Phase 9 adds `managed-logs-redaction.md`
- `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/couchdb-access.md` — operator-side CouchDB access pattern (overlay network curl + credentials in `/mnt/gluster/thinx/.env`)
- `lib/thinx/audit.js` — TARGET file for the TTL change (currently uses `nano(db_uri).use(prefix + "managed_logs")`); the `log()` method writes records with `{message, owner, date, flags}`
- `lib/thinx/owner.js` — SEC-PII-01 reference sites (Phase 2 redaction patterns: `Util.redactToken`, `Util.redactEmail`) — the redaction script reuses these patterns
- `lib/thinx/util.js` — `Util.redactToken` and `Util.redactEmail` implementations (the redaction script must use the same regex patterns for consistency)
- `lib/thinx/database.js:117` — existing `nano.db.compact("managed_logs")` reference (compaction hint for the runbook)

## Code Context

### Audit log write path
`lib/thinx/audit.js` `Audit.log(owner, message, flag, callback)`:
```js
let record = {
  "message": message,
  "owner": owner,
  "date": mtime,
  "flags": Array.isArray(flag) ? flag : [flag]
};
loglib.insert(record, mtime, (err) => { ... });
```
Records keyed by `mtime` (Date object stringified). No expiry field today.

### PII leak shape (per SEC-PII-01 Phase 2)
- Raw 64-char hex `reset_key` substrings (`/[0-9a-f]{64}/`) — primarily inside `message` field of old audit entries (pre-Phase-2 owner.js wrote raw keys to alog.log)
- Raw email addresses in `message` and possibly elsewhere
- Mailgun tokens (sometimes)
- Activation tokens

### CouchDB managed_logs access (per `couchdb-access` memory)
- Overlay network reachable via `docker run --rm --network thinx_internal curlimages/curl:latest` from either swarm node
- Credentials in `/mnt/gluster/thinx/.env` as `COUCHDB_USER` / `COUCHDB_PASSWORD`
- Service placement drifts; `docker service ps thinx_couchdb` to find which node hosts it

## Decisions

### SEC-PII-02 Strategy: Hybrid — overlay-redact + forward TTL

**Per-doc redaction (historic):**
- Script streams `managed_logs/_all_docs?include_docs=true&limit=1000&startkey=...` in pages of 1000.
- For each doc, scan `message` field (and any other string fields) for raw 64-char hex reset_key + email substrings.
- If found, overlay redacted version: `message` becomes the string with PII replaced by `[REDACTED-RESET_KEY]` / `[REDACTED-EMAIL]` (mirroring `Util.redactToken` / `Util.redactEmail` output format).
- Batched via `_bulk_docs` POST (configurable batch size; default 500 docs/batch to stay under CouchDB request size limits).
- Original `_rev` preserved per doc (CouchDB requires `_rev` in `_bulk_docs` for updates).
- **Reversibility:** the script's first action is to dump a `managed_logs.pre-redaction.json` snapshot for forensic rollback. The redaction itself is destructive of audit-log content (the original PII text is overwritten in CouchDB; only the snapshot retains it).

**Forward-going TTL (audit.js change):**
- Modify `Audit.log` to add `expire_at: new Date(Date.now() + 90 * 24 * 3600 * 1000)` to every record (90-day retention).
- Add a CouchDB `_design/cleanup` view emitting `[expire_at, _id]` for expired docs.
- A nightly cron (lives on the swarm host; runbook documents the cron entry) hits `_all_docs?endkey=<expired_threshold>` and DELETEs.
- The 90-day retention window is GDPR-friendly (purpose-limitation + storage-limitation) but preserves enough for security-incident forensics.

**Why this combination:**
- Overlay-redact closes the historic data lake (`658k existing docs`).
- TTL prevents the leak shape from re-accumulating even if a future regression bypasses SEC-PII-01.
- Audit chronology preserved (overlay doesn't delete docs; metadata + redacted message stay queryable).

### Script invariants (must hold)
- **Dry-run mode is the DEFAULT** — script REQUIRES explicit `--apply` flag to actually mutate CouchDB. Without `--apply`, prints would-be edits + counts to stdout.
- **Snapshot first** — script refuses to apply unless `--snapshot-to <path>` has been written and the path is non-empty. Snapshot is a JSONL stream of all original docs.
- **Sampling verification** — `--sample N` subcommand picks N random old + N random recent docs after redaction and asserts zero raw-key/email patterns in `message`. Exits non-zero if any leak.
- **Idempotent** — re-running the script after a successful pass produces zero edits (the patterns no longer match).
- **Bounded** — script accepts `--max-docs N` for staged rollouts; default unbounded.

### Validation criteria (per ROADMAP success criterion)
1. **Sampling N=1000 random recent + N=1000 random old `managed_logs` docs returns zero raw 64-char hex reset_keys post-remediation.** Script's `--sample` subcommand checks this; exit 0 = pass.
2. **TTL/retention behavior captured in a runbook** under `.planning/runbooks/managed-logs-redaction.md`.
3. **GDPR-posture note** appended to the runbook documenting scope, method, sampling evidence, residual risk.
4. **Reversibility:** explicitly accepted — the redaction is destructive of audit-log content (the original PII text is overwritten; only the snapshot file at the time of redaction retains it). The runbook documents this irreversibility tradeoff.

## Coordination

- Phase 9 is INDEPENDENT — parallel-safe with Phases 5/6/7/8/10/11. No dependency.
- Phase 9 is OPERATOR-EXECUTED: this repo ships the script + runbook + audit.js change. The operator runs the redaction against production CouchDB on the swarm.
- Phase 9 audit.js change must NOT regress the SEC-PII-01 redaction calls (audit.js currently doesn't redact at write-time — owner.js callers redact BEFORE calling alog.log per Phase 2 pattern; that pattern stays).

## Deferred Ideas (captured, NOT in scope)

- **Retroactive cleanup of other CouchDB DBs** (`managed_users`, `managed_devices`, `managed_builds`, etc.) — Phase 9 scope is strictly `managed_logs`. If other DBs have PII shapes, they get their own future phase.
- **CouchDB cron infrastructure** — the nightly cron runs on the swarm host scheduler; managing that is OPS-scope, out of this repo. Phase 9 ships the cron-entry RECIPE in the runbook (e.g., `0 3 * * * docker run ... script.js --cleanup`).
- **TTL-driven log compaction** — CouchDB `_compact` is a separate operation. Runbook references `database.js:117` compaction call; Phase 9 doesn't auto-compact (operator decides timing).
- **Audit-log immutability / cryptographic chaining** — true append-only audit log with hash chain. Big v2+ candidate; out of v1.9 scope.

## Open Questions for Researcher / Planner

- Should the redaction script use `Util.redactToken` / `Util.redactEmail` directly (via `require('../lib/thinx/util.js')`) or duplicate the regex inline? Recommendation: import via require for single-source truth. Planner confirms.
- The TTL 90-day window — is 90 days the right value or should it be parameterized via `app_config.audit_retention_days`? Recommendation: parameterize with a 90-day default. Planner decides.
- Should the redaction script handle the `flags` field too (some old docs may carry PII inside `flags` accidentally)? Recommendation: scan but log if found (low-likelihood but not zero). Planner decides.

## Constraints

- The redaction script's `--apply` mode is destructive — runbook MUST require operator confirmation (e.g., a dated `--i-understand-this-is-destructive` flag or interactive prompt).
- All commits GPG-signed.
- Test-env ACCEPT pattern (Phase 5/6/7/8): local `npm test` aborts on missing config; CI canonical Jasmine green-gate for the audit.js TTL spec + redaction-script unit tests.
- The audit.js TTL change MUST NOT break the existing SEC-PII-01 redaction pattern (callers in owner.js redact BEFORE calling alog.log; that stays).
- Production CouchDB credentials live in `/mnt/gluster/thinx/.env` — script reads from env vars (`COUCHDB_USER`, `COUCHDB_PASSWORD`, `COUCHDB_URL`); no credentials in repo.
