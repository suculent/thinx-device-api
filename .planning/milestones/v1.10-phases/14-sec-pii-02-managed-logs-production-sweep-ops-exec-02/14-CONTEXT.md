# Phase 14: SEC-PII-02 managed_logs Production Sweep (OPS-EXEC-02) - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto-generated (mirrors Phase 13 OPS-execution pattern; canonical spec is `.planning/runbooks/managed-logs-redaction.md`)

<domain>
## Phase Boundary

Operator-executed production CouchDB sweep that redacts historic PII (raw 64-char hex `reset_key` + raw email patterns) from the ~658k pre-Phase-2 docs in `managed_logs`. The actual `--apply` + `_compact` happens off-repo against production CouchDB on the swarm. What lands in this codebase: prep artifacts (probe/dry-run logs), the JSONL forensic snapshot reference, sample-verify exit-0 evidence, and the runbook execution annex.

**In scope:**
- Single PLAN.md (`14-01-PLAN.md`) using the GSD CHECKPOINT mechanism (mirrors Phase 13 D-01).
- Pre-flight checklist run (runbook § 1) — operator confirms 7 pre-conditions.
- Dry-run scan (runbook § 2 Step 2) — `--scan` mode; capture stdout to phase dir.
- `--apply --snapshot-to <path> --batch-size 500` (runbook § 2 Step 3) — DESTRUCTIVE; snapshot is mandatory rollback artifact.
- `--sample 1000` zero-leak gate (runbook § 2 Step 4) — must exit 0.
- CouchDB `_compact` on `managed_logs` (runbook § 2 Step 5) — direct curl POST per D-equivalent of Phase 13.
- OBS-01 Slack receipt (from Phase 12) posts automatically on `--apply` success.
- Execution annex appended to `.planning/runbooks/managed-logs-redaction.md` (timestamp, operator initials, snapshot path + SHA256, sample exit code, pre/post `disk_size` delta, Slack receipt confirmation).
- Mark OPS-EXEC-02 as Verified in REQUIREMENTS.md.

**Out of scope:**
- Code changes to `scripts/redact-managed-logs.js` (covered by v1.9 Phase 9; only opportunistic in-flight fixes if production reveals an issue).
- Forward-TTL cron deployment (runbook § 3) — sweep is one-shot; cron is operator-side.
- Schema/policy changes (e.g., `audit_retention_days` tuning) — out of v1.10.

</domain>

<decisions>
## Implementation Decisions

### Plan Structure + Operator Coordination Model

- **D-01:** Single PLAN.md (`14-01-PLAN.md`) with GSD CHECKPOINT (mirrors Phase 13 D-01). Executor produces prep stubs, emits `## CHECKPOINT REACHED`, then resumes after operator returns sentinel inputs.
- **D-02:** Atomic at file level; multiple GPG-signed commits across the checkpoint boundary.
- **D-03:** Resume contract: executor MUST detect operator-provided sentinel inputs (dry-run log + apply summary + snapshot path + SHA256 + sample-verify exit + compaction `disk_size` delta + Slack receipt confirmation). If missing, re-emit CHECKPOINT.

### Sweep Mode (carries forward Phase 14 ROADMAP intent)

- **D-04:** Full single-pass sweep against all ~658k docs (no staged `--max-docs` confidence pass first). Faster, single snapshot, single annex row. Idempotent script + sample-verify gate cover the risk.

### Compaction Execution Path

- **D-05:** Direct curl `POST .../managed_logs/_compact` from swarm host per runbook § 5. Explicit, observable via `compact_running` polling. Canonical operator action (not in-process `compactDatabases()`).

### Sample-Verify Retry Policy

- **D-06:** On `--sample 1000` exit 65 (leak detected): up to 2 idempotent `--apply` retries (script idempotent — catches concurrent-write stragglers). After 2 failed sample passes → escalate to SEC-PII-02b for regex expansion. Pragmatic.

### Snapshot Forensic Integrity

- **D-07:** Annex captures absolute snapshot path + SHA256 fingerprint + capture timestamp (operator runs `sha256sum` on the swarm host post-apply). Forensic-rollback artifact is the JSONL file at `/mnt/gluster/thinx/snapshots/managed_logs.pre-redaction-<ts>.jsonl`.
- **D-08:** 90-day shred is operator-managed (calendar reminder), tracked as a v1.11 backlog item (per runbook § 6 GDPR posture recommendation).

### Cross-Cutting

- **D-09:** OBS-01 Slack receipt (shipped in Phase 12) posts automatically on `--apply` success. Operator confirms visibility in Slack channel and records confirmation in annex. Failure to post does NOT block phase close (per Phase 14 ROADMAP note: "convenience, not gating").
- **D-10:** All commits GPG-signed.
- **D-11:** Single wave (Wave 1), single plan; `wave: 1`, `depends_on: []`.
- **D-12:** Compatibility constraint: no Vue console route signatures affected (managed_logs is internal CouchDB; not routed). Forward-TTL `expire_at` writes (Phase 9) unaffected. Production image rollout NOT triggered by this phase.
- **D-13:** CHECKPOINT message must include: SSH command, source-env recipe, dry-run command, snapshot path template, `--apply` command, `--sample 1000` command, `_compact` curl, SHA256 capture command, and Slack-channel pointer for receipt confirmation.

### Phase 14 success criteria (from ROADMAP, all locked)

1. Pre-flight checklist fully checked (runbook § 1).
2. Dry-run dirty count in expected range (not ≈0, not >658k).
3. `--apply --snapshot-to <path> --batch-size 500` completes; snapshot exists with `chmod 600`; line count matches `touched`.
4. `--sample 1000` exits 0 (zero raw reset_keys, zero raw emails).
5. CouchDB `_compact` completes; `disk_size` drops by expected delta.
6. OBS-01 Slack receipt posted automatically and visible in channel.
7. Runbook execution annex committed on `thinx-staging` with GPG-signed commit.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/runbooks/managed-logs-redaction.md` — **PRIMARY OPERATIONAL DOC** (321 lines). Phase 14 appends execution annex.
- `.planning/ROADMAP.md` — Phase 14 details (7 success criteria).
- `.planning/REQUIREMENTS.md` — OPS-EXEC-02 (line 14).
- `scripts/redact-managed-logs.js` — Phase 9 / SEC-PII-02 script with Phase 12 OBS-01 Slack hook.
- `lib/thinx/audit.js` — Phase 9 forward-TTL `expire_at` writes (unaffected by this phase).
- `~/.claude/.../couchdb-access.md` — operator memory: overlay-network `thinx_internal` + creds in `/mnt/gluster/thinx/.env`.

### Phase 13 sibling
- `.planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/` — sibling OPS-execution phase; established v1.10 OPS-execution pattern (single plan + CHECKPOINT + annex + Rollback Procedure). Phase 14 mirrors the structure; canonical Rollback for SEC-PII-02 already lives at `managed-logs-redaction.md` § 4 (snapshot restore) so no new Rollback section needed.

</canonical_refs>

<code_context>
## Existing Code Insights

- `scripts/redact-managed-logs.js` ships in Phase 9 with `--scan` / `--apply` / `--sample` modes, mandatory `--snapshot-to` for apply, idempotent re-runs, `EXIT_LEAK_DETECTED=65` semantics.
- Phase 12 OBS-01 wired `SLACK_WEBHOOK` POST into `--apply` success + failure paths (independent of script exit code per OBS-01 design).
- Phase 12 OBS-02 audit-TTL probe runs on `thinx_api` boot — orthogonal to this sweep (forward-going; this sweep is historic backfill).

</code_context>

<specifics>
## Specific Ideas

- User selected the full-sweep + direct-curl-compact + 2-retry policy + snapshot-SHA256-with-shred-backlog combination during the Phase 14 grey-area resolution (informally; the inline question was interrupted by the Phase 13 nginx discovery, but the recommendations match Phase 13's all-Option-A pattern and were captured in this CONTEXT.md as D-04..D-08).

</specifics>

<deferred>
## Deferred Ideas

- Forward-TTL cron deployment to swarm scheduler (runbook § 3) — defer to v1.11 OPS sweep.
- In-process `compactDatabases()` lifecycle tweak — defer; not needed when direct curl works.
- 90-day snapshot shred automation — v1.11 backlog (operator calendar for now).
- SEC-PII-02b regex expansion — defer until/unless a sample run reveals an uncaught leak shape.

</deferred>

---

*Phase: 14-sec-pii-02-managed-logs-production-sweep-ops-exec-02*
*Context gathered: 2026-06-05 (auto-generated from canonical runbook + Phase 13 pattern)*
