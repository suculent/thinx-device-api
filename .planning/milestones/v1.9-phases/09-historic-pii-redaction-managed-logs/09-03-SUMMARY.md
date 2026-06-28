---
phase: 09-historic-pii-redaction-managed-logs
plan: 3
subsystem: docs/runbook + security/gdpr
tags:
  - documentation
  - runbook
  - security
  - gdpr
  - operator-procedure
  - sec-pii-02
requirements:
  - SEC-PII-02
dependency-graph:
  requires:
    - "Plan 09-1 (scripts/redact-managed-logs.js shipped; commit 8d52fdf0)"
    - "Plan 09-2 (lib/thinx/audit.js expire_at field; commits 9a16a620 + 0f871ddf)"
  provides:
    - "Operator-side end-to-end procedure for executing SEC-PII-02 against production CouchDB"
    - "Forward-TTL cron recipe (drop-in template for swarm-host scheduler)"
    - "GDPR-posture documentation block (scope/method/sampling-evidence template/residual-risk)"
    - "Snapshot-based rollback procedure (single-doc + bulk _bulk_docs)"
    - "Explicit acceptance of redaction irreversibility (ROADMAP Phase 9 success criterion #5)"
  affects:
    - ".planning/runbooks/ canonical operator-runbook set (third entry alongside swarm.md and websocket-handshake.md)"
tech-stack:
  added: []
  patterns:
    - "Operator-runbook format precedent from .planning/runbooks/swarm.md (H1 title + SSH access blurb + horizontal-rule section dividers + step-numbered procedure + inline bash blocks with `# expect:` verification comments)"
    - "CouchDB overlay-network access pattern (thinx_internal, attachable, creds from /mnt/gluster/thinx/.env)"
    - "CouchDB _bulk_docs with new_edits=false for rollback (honors snapshot's original _rev)"
key-files:
  created:
    - ".planning/runbooks/managed-logs-redaction.md (318 lines)"
  modified: []
decisions:
  - "Snapshot retention recommended at 90 days, mirroring the forward-TTL window — then shred -u"
  - "_design/cleanup view design doc is OUT OF SCOPE for Phase 9 (lives on swarm-host side per 09-CONTEXT.md); runbook ships the cron recipe as a starting template the operator adapts to the view shape they deploy"
  - "In-process TTL-sweep alternative (extending database.js:compactDatabases()) deferred to v1.10 candidate"
  - "Runbook follows swarm.md format precedent verbatim (operator-facing tone, # expect: comments, horizontal-rule dividers)"
metrics:
  duration: "~10 minutes (context-loading + write + verify + commit)"
  tasks-completed: 1
  files-created: 1
  files-modified: 0
  lines-added: 318
  commits: 1
  completed-date: 2026-06-03
---

# Phase 9 Plan 3: Runbook + GDPR-Posture Note Summary

**One-liner:** Operator-facing SEC-PII-02 runbook documenting the end-to-end production CouchDB PII-redaction procedure (snapshot → dry-run → apply → sample-verify → optional compact), the forward-TTL cron recipe, the GDPR-posture note, rollback-from-snapshot procedure, and explicit acceptance of irreversibility.

## Objective Recap

Phase 9 is OPERATOR-EXECUTED. Plan 09-1 shipped the redaction script; Plan 09-2 added the forward-TTL `expire_at` field to `lib/thinx/audit.js`. This plan (09-3, the FINAL plan of Phase 9) closes the loop by producing the canonical operator runbook at `.planning/runbooks/managed-logs-redaction.md` — the bridge between the tools this repo ships and the operator who runs them against production.

The runbook closes ROADMAP Phase 9 success criteria:
- **#3** (TTL/retention behavior captured in a runbook) — § 3 Forward-TTL Cron Recipe.
- **#4** (GDPR-posture note appended to runbooks set) — § 6 GDPR Posture.
- **#5** (reversibility OR irreversibility explicitly accepted in the runbook) — § 4 Rollback + § 5 Reversibility (the snapshot is the only rollback artifact; the redaction is destructive of audit-log content after `_compact`).

## What Was Built

**1. `.planning/runbooks/managed-logs-redaction.md` (318 lines)** — single new file, no code changes. Seven required sections in order:

1. **Header blurb** — H1 title, swarm SSH (both nodes), CouchDB credentials path, overlay-network reachability, tools shipped by the repo (script + audit TTL field + compaction call site).
2. **Pre-flight Checklist** — 8 confirmation bullets the operator runs before invoking the script (service placement, env-file readability, env sourcing, `THINX_PREFIX` confirmation, free-space estimate, maintenance window, v1.9+ image deploy gate, forensic-rollback retention contact).
3. **Procedure (Steps 1-5)** — sync repo to swarm; dry-run scan; snapshot + apply; sample-verify; optional compact. Every bash block includes `# expect:` verification commentary mirroring the `swarm.md` precedent.
4. **Forward-TTL Cron Recipe** — design-doc shape for `_design/cleanup` view + drop-in cron entry for `/etc/cron.d/thinx-managed-logs-cleanup`. Includes the in-process alternative (deferred to v1.10).
5. **Rollback from Snapshot** — single-doc PUT recipe + bulk `_bulk_docs` with `split -l 500` chunking + `new_edits=false` rationale + post-compaction caveat.
6. **Reversibility (explicit acceptance)** — restates the irreversibility tradeoff: post-`_compact`, the JSONL snapshot is the ONLY rollback artifact.
7. **GDPR Posture** — scope (~658k pre-Phase-2 docs, leak shapes), method (overlay-redact + forward TTL + per-record provenance via `redacted_by` / `redacted_at`), sampling evidence table template, residual-risk list (destructive content, snapshot retention policy, unmatched leak shapes, forward-write race during apply).
8. **References** — links to script, audit.js, database.js:117, couchdb-access memory, ROADMAP, REQUIREMENTS, CONTEXT, and the sibling runbooks (swarm.md, websocket-handshake.md).

**2. Atomic GPG-signed commit** — `e89074e0` `docs(SEC-PII-02): managed_logs redaction runbook + GDPR-posture note`. Sole file: `.planning/runbooks/managed-logs-redaction.md` (318 insertions, 0 deletions, 0 other files touched).

## Verification

All plan verification gates passed:

| Gate | Result |
|------|--------|
| `test -f .planning/runbooks/managed-logs-redaction.md` | PASS (318 lines created) |
| `wc -l` >= 150 | PASS (318 ≥ 150) |
| `grep -F "SEC-PII-02"` | PASS (10 hits) |
| `grep -F "redact-managed-logs.js"` | PASS (9 hits) |
| `grep -F "expire_at"` | PASS (11 hits) |
| `grep -F "snapshot"` | PASS (19 hits) |
| `grep -F "GDPR"` | PASS (6 hits) |
| `grep -F "Rollback"` | PASS (1 hit, the section header) |
| `grep -iE "cron|nightly|0 3"` | PASS (11 hits) |
| `grep -F "_bulk_docs"` | PASS (5 hits) |
| `grep -F "thinx_internal"` | PASS (12 hits) |
| `grep -F "1000 + 1000"` | PASS (2 hits — procedure + GDPR table) |
| `git diff --name-only` shows only one new runbook file | PASS |
| Commit is GPG-signed | PASS (`%G?` = `G`, signed by Matej Sychra) |

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gates

None — pure documentation task, no external service interactions.

## Known Stubs

None — runbook is a self-contained operator artifact. The one "stub-like" pattern is the placeholder operator name in the GDPR-posture sampling-evidence table (`<name>`), which is by design (the operator fills it in after each redaction run; that is the runbook's contract).

## Threat Flags

None — no new security-relevant surface introduced. The runbook is documentation; all referenced surface (CouchDB overlay, audit.js TTL field, redaction script) was already in the plan's `<threat_model>` and was implemented by Plans 09-1 and 09-2 with their own threat coverage.

## Coordination Notes

- **Phase 9 complete after this commit.** All three plans done: 09-1 (`8d52fdf0`, script), 09-2 (`9a16a620` + `0f871ddf`, audit TTL), 09-3 (`e89074e0`, runbook).
- **Phase 9 is OPERATOR-EXECUTED.** This repo shipped the tools + runbook; the actual production redaction run against the live CouchDB on `thinx_couchdb` is operator-side and lives outside the repo. The verifier checks artifacts exist + tests pass; it does NOT exercise production.
- **Out-of-scope items captured during execution** (documented in the runbook itself, flagged as v1.10 / future-phase candidates):
  - The `_design/cleanup` view design doc — operator authors separately following the standard CouchDB view pattern; runbook ships the cron recipe as a starting template.
  - In-process TTL-sweep alternative (extending `database.js:compactDatabases()` to also delete `expire_at < now` docs) — deferred to v1.10.
  - Audit-log immutability / cryptographic chaining — out of v1.9 scope per `09-CONTEXT.md`.

## Decisions Made

1. **Snapshot retention policy** — recommended 90 days mirroring the forward-TTL window, then `shred -u`. Operator decision; runbook documents the recommendation but does not enforce it programmatically.
2. **Cron design-doc shape OUT OF SCOPE** — per `09-CONTEXT.md`, the design doc lives on the swarm-host side; the runbook ships the cron recipe as a starting template the operator adapts. This keeps Phase 9 closed without requiring the design doc to be merged in this repo.
3. **Runbook format follows `swarm.md` verbatim** — operator-facing tone, SSH access blurb, `# expect:` verification comments, horizontal-rule section dividers. The `websocket-handshake.md` precedent informed the more discursive prose sections (Pre-flight, GDPR Posture).
4. **No credentials, no real PII, no real doc IDs** — all examples use `${COUCHDB_USER}` / `${COUCHDB_PASSWORD}` env-var refs and `<doc _id>` placeholders. The IP `188.166.23.244` is already published in `AGENTS.md` and `swarm.md` (repo-public-OK posture) — no new sensitive data introduced.

## References

- Plan: `.planning/phases/09-historic-pii-redaction-managed-logs/09-03-PLAN.md`
- Phase context: `.planning/phases/09-historic-pii-redaction-managed-logs/09-CONTEXT.md`
- Sibling plans: 09-1 SUMMARY (`09-01-SUMMARY.md`), 09-2 SUMMARY (`09-02-SUMMARY.md`)
- Roadmap: `.planning/ROADMAP.md` Phase 9 (lines 90-98)
- Requirement: `.planning/REQUIREMENTS.md` SEC-PII-02 (line 28)
- Format precedent: `.planning/runbooks/swarm.md`
- Tone precedent: `.planning/runbooks/websocket-handshake.md`
- Commit: `e89074e066561aaee101040ac24e4de1c02e2f77` (GPG-signed)

## Self-Check: PASSED

- File `.planning/runbooks/managed-logs-redaction.md` exists (318 lines, verified via `wc -l`).
- Commit `e89074e0` exists in git log (verified via `git log --oneline -5`).
- Commit is GPG-signed (verified via `git log -1 --format='%G?'` = `G`).
- All 12 verification grep gates pass (counted explicitly above).
- No code files modified (verified via `git diff --diff-filter=D --name-only HEAD~1 HEAD` empty + `git show --stat HEAD` shows only the runbook).
- No accidental deletions (verified — `git diff --diff-filter=D` empty).
