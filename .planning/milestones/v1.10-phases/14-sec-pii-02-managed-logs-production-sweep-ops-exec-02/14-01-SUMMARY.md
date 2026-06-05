---
phase: 14
plan: 14-01
status: complete
date: 2026-06-05
requirements: [OPS-EXEC-02]
---

# Plan 14-01 Summary — SEC-PII-02 managed_logs Production Sweep Closure (OPS-EXEC-02)

## What was built

1. **Redactor field-scoping fix** `scripts/redact-managed-logs.js` — introduced `PII_FIELDS = ["message","flags"]` allowlist; `containsRawPII` / `scanDoc` / `redactDoc` now scan/overlay ONLY those fields. Structural fields (`owner`, `date`, `expire_at`, `_id`, `_rev`) are copied verbatim. Fixes a false-positive where the all-fields walk matched the legitimate 64-char hex `owner` hash under `RESET_KEY_REGEX`. Exported `PII_FIELDS`.
2. **Regression specs** `spec/jasmine/ZZ-RedactionScriptSpec.js` — 4 new SEC-PII-02b specs: 64-hex owner with clean message → `containsRawPII` false; `redactDoc` leaves owner untouched; message leak still redacted while owner preserved; `scanDoc` ignores owner. 11 specs pass (config-free; CI green-gate canonical).
3. **Production sweep executed** against CouchDB `managed_logs` on `micro`: post-fix dry-run → snapshot + `--apply` (422 docs) → `--sample 1000` (exit 0) → compaction completed.
4. **Forensic snapshot** `/mnt/gluster/thinx/snapshots/managed_logs.pre-redaction-20260605T123511Z.jsonl` — 422 lines (== touched), `chmod 600`, SHA256 `23b76a648030d7d41426c806830c8c890700b2e9162a479b9688d931caef1d5b`. Retained 90 days per runbook § 6.
5. **Execution Annex** appended to `.planning/runbooks/managed-logs-redaction.md` (between § 5 and § 6) — pre-flight, both discrepancies, dry-run/apply/sample/compaction figures, snapshot path + SHA256, OBS-01 receipt note. Sampling-evidence row added to § 6 table.
6. **REQUIREMENTS.md** OPS-EXEC-02 flipped to **Verified** (checkbox + traceability table) with a discrepancy-branch annotation.
7. **Execution logs** captured to phase dir: `dry-run.log` (pre-fix), `scan-fixed.log` (post-fix), `apply.log`, `sample.log`.

## Key discoveries

- **Historic corpus already deleted out-of-band.** `doc_count=2,183`, `doc_del_count=656,697` (≈ the 658,808 baseline). The ~658k pre-Phase-2 docs were already deleted before this session (a compaction was already running on arrival). The "redact 658k docs" premise was moot; the real residue was 422 live leaks + compaction. Same out-of-band pattern as Phase 13.
- **Redactor over-matched the `owner` field.** First dry-run: `dirty=2,176`, all in `fields=[owner]` — the structural 64-hex owner hash, not PII. Applying unmodified would have corrupted audit attribution on ~2,176 docs. Fixed in-flight (SEC-PII-02b) before any apply.
- **422 genuine `message` leaks.** Field-scoped re-scan: `dirty=422`, all in `fields=[message]`, `emailHits=0`. These are the real SEC-PII-01-shape `reset_key` leaks; redacted with snapshot + apply (0 conflicts).
- **CouchDB is 3.5.1 on glusterfs.** Compaction of the 2-shard DB (~330k changes/shard incl. tombstones) is I/O-bound on the network FS (~30 min). Tombstones for 656,697 deleted docs persist (compaction ≠ `_purge`), so `disk_size ≈ data_size` and the post-compaction delta is small by design (−36,864 B).

## ROADMAP success criteria (7/7)

1. ✅ Pre-flight 7/7 (adapted) — placement, `.env`, empty prefix, ≥10 GB margin, window, image reachable, snapshot retention.
2. ✅ Dry-run `dirty` in expected range — 422 after the field-scoping fix (the pre-fix 2,176 was the owner false-positive, documented).
3. ✅ `--apply --snapshot-to … --batch-size 500` complete; snapshot exists `chmod 600`; line count (422) == `touched`; referenced by absolute path in annex.
4. ✅ `--sample 1000` exit 0 (checked=2000, leaks=0); sampling-evidence row added.
5. ✅ `_compact` completed; `disk_size` dropped (−36,864 B — small delta explained: bulk old-revs already reclaimed out-of-band; tombstones not purged by compaction). Pre/post captured in annex.
6. ⚠→✅ OBS-01 Slack receipt — `SLACK_WEBHOOK` present, `--apply` success invoked `postSlackSummary("success")`, no send error logged (success receipt reports `sample deferred` by design; sample PASS recorded separately).
7. ✅ Runbook Execution Annex committed on `thinx-staging`, GPG-signed.

## Self-Check: PASSED

OPS-EXEC-02 Verified (discrepancy branch). The SEC-PII-02 invariant holds: `--sample 1000` exits 0 — zero raw reset_keys / zero raw emails across managed_logs. Phase 14 closes; v1.10 milestone phases 12–14 complete.

## Follow-ups (informal)

- **SEC-PII-02b** owner field-scoping fix shipped here; the `PII_FIELDS` allowlist must be re-confirmed before any future redaction that targets additional fields.
- Host working dir `/mnt/gluster/thinx/redact-work` left in place (fixed script + minimal node_modules) for fast re-runs; snapshot under `/mnt/gluster/thinx/snapshots` (90-day window).
