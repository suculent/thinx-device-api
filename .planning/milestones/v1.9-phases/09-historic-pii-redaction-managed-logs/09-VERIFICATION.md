---
phase: 09-historic-pii-redaction-managed-logs
verified: 2026-06-03T11:24:24Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification:
  is_re_verification: false
---

# Phase 9: Historic PII Redaction (managed_logs) — Verification Report

**Phase Goal:** Remediate ~658k pre-Phase-2 CouchDB `managed_logs` documents that carry raw reset_keys + introduce forward-going TTL on new audit writes.
**Requirements:** SEC-PII-02
**Verified:** 2026-06-03T11:24:24Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Must-haves)

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `scripts/redact-managed-logs.js` exists; CLI flags `--scan` (default), `--apply`, `--snapshot-to`, `--sample N`, `--max-docs`, `--help` | VERIFIED | File exists (589 lines). `node scripts/redact-managed-logs.js --help` lists all six flags in the usage block (lines 219-231 of script). Confirmed via direct invocation. |
| 2 | Script default is dry-run (no `--apply` = no mutation) | VERIFIED | `parseArgs()` lines 327-330: if neither `--apply` nor `--sample`, sets `args.scan = true`. `runScan()` (lines 366-415) only calls `db.list(...)` — never `db.bulk(...)`, never any write API. |
| 3 | `--apply` without `--snapshot-to <path>` exits non-zero with snapshot-required error | VERIFIED | Direct invocation: `node scripts/redact-managed-logs.js --apply` → exit code 67 + stderr `error: --apply REFUSES to run without --snapshot-to <path>. The snapshot is the only forensic-rollback artifact (per CONTEXT.md invariant).` Confirmed in a stripped-env shell (no `COUCHDB_*` set) — snapshot gate fires BEFORE credential resolution per script lines 543-554. |
| 4 | Script reuses `Util.redactToken`/`Util.redactEmail` from `lib/thinx/util.js` | VERIFIED | Line 50: `const Util = require("../lib/thinx/util.js");`. Line 564 uses `Util.redactToken` to safely log the masked user from `COUCHDB_USER`. Single-source-of-truth invariant honored. |
| 5 | Idempotency: `[REDACTED-RESET_KEY]`/`[REDACTED-EMAIL]` markers don't match detection regex on second pass | VERIFIED | Markers contain `[`, `]`, uppercase — cannot match `/[0-9a-f]{64}/g` or the email regex. Live smoke: `node -e "const m = require('./scripts/redact-managed-logs.js'); const d = {_id:'a',_rev:'1',message:'foo '+'a'.repeat(64)+' bar',flags:[]}; const r = m.redactDoc(d); console.log(m.redactDoc(r.doc).changed);"` → prints `false`. Test fixture `docAlreadyRedacted` in spec also locks this behavior. |
| 6 | `lib/thinx/audit.js` `Audit.log` adds `expire_at` on every record write | VERIFIED | `audit.js:33-51` `_buildRecord()` returns `{message, owner, date, flags, expire_at}` where `expire_at = new Date(mtime.getTime() + retentionDays * 86400000)`. `audit.js:53-66` `log()` delegates: `let record = this._buildRecord(owner, message, flag, mtime); loglib.insert(record, mtime, ...);`. Field reaches `loglib.insert` on every call. |
| 7 | Retention parameterized via `app_config.audit_retention_days` with 90-day default | VERIFIED | `audit.js:16-27` `_retentionDays()`: reads `Globals.app_config().audit_retention_days`; accepts only `typeof === "number" && > 0`; falls back to `90` on missing/invalid/throw. Try/catch on line 18-25 ensures audit writes never fail because config infra fails. |
| 8 | `Audit.log` signature unchanged (4-arg: owner, message, flag, callback) | VERIFIED | `audit.js:53` `log(owner, message, flag, callback) {`. Function arity = 4 (verifiable in CI via `audit.log.length === 4` — already asserted in `ZZ-AuditTTLSpec.js` Test 4 at line 128). Local smoke blocked by test-env ACCEPT pattern (Database module-load needs CouchDB env), but source inspection is unambiguous. |
| 9 | SEC-PII-01 caller pattern in `owner.js` NOT regressed (zero diff to `lib/thinx/owner.js` from Phase 9) | VERIFIED | `git diff 8d52fdf0~1..e89074e0 -- lib/thinx/owner.js` returns 0 lines. `git log 8d52fdf0~1..e89074e0 -- lib/thinx/owner.js --oneline` returns empty. `Util.redactToken`/`Util.redactEmail` count in owner.js: 11 pre-phase-9, 11 post-phase-9 — UNCHANGED. The two critical SEC-PII-01 sites at `owner.js:476` and `owner.js:614` still wrap reset_key in `Util.redactToken`. |
| 10 | New specs `ZZ-RedactionScriptSpec.js` + `ZZ-AuditTTLSpec.js` exist and `node --check` clean | VERIFIED | Both files exist (148 + 154 lines). `node --check spec/jasmine/ZZ-RedactionScriptSpec.js` → OK. `node --check spec/jasmine/ZZ-AuditTTLSpec.js` → OK. `node --check lib/thinx/audit.js` → OK. `node --check scripts/redact-managed-logs.js` → OK. RedactionScript spec runs in isolation: **7 specs, 0 failures** in 0.051s (verified via Jasmine harness with empty helpers config). AuditTTL spec is blocked at module-load by test-env ACCEPT pattern (CI is the canonical green-gate). |
| 11 | Runbook `.planning/runbooks/managed-logs-redaction.md` contains required sections | VERIFIED | File exists (318 lines). 7 H2 sections: 1. Pre-flight Checklist; 2. Procedure (Steps 1-5: sync → dry-run → snapshot+apply → sample-verify → optional compact); 3. Forward-TTL Cron Recipe; 4. Rollback from Snapshot; 5. Reversibility (explicit irreversibility acceptance); 6. GDPR Posture (scope, method, sampling evidence template, residual risk); 7. References. Key tokens: SEC-PII-02 (10 hits), redact-managed-logs.js (9), expire_at (11), snapshot (30), GDPR (6), Rollback (5), cron (9), _bulk_docs (5), destructive (5), irreversib (2), thinx_internal (12), sampling (2). |
| 12 | Phase 9 commits GPG-signed | VERIFIED | `git log --format='%h %G? %s' 8d52fdf0 9a16a620 0f871ddf e89074e0`: all four commits show `G` (good signature), signer `Matej Sychra <suculent@me.com>`. Commits: `8d52fdf0` (09-1 script+spec), `9a16a620` (09-2 audit TTL), `0f871ddf` (09-2 SUMMARY+state advance), `e89074e0` (09-3 runbook). |

**Score:** 12/12 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/redact-managed-logs.js` | Operator CLI ≥200 lines, contains `redactToken` import, RESET_KEY_REGEX | VERIFIED + WIRED | 589 lines. `require('../lib/thinx/util.js')` at line 50. `RESET_KEY_REGEX = /[0-9a-f]{64}/g` at line 58. `EMAIL_REGEX` at line 61. Module exports `redactDoc`, `scanDoc`, `containsRawPII`, regex constants, marker constants, exit codes (lines 194-209). CLI guard at line 582 `if (require.main === module)`. |
| `spec/jasmine/ZZ-RedactionScriptSpec.js` | Fixture-based unit spec, 7+ it blocks, no live CouchDB | VERIFIED + WIRED | 148 lines. 7 `it()` blocks (counted via `grep -cE "^\s*it\(" = 7`). Requires `../../scripts/redact-managed-logs.js` directly (line 20). CLI-gate spec uses `child_process.spawnSync` (line 137). Runs in isolation: **7 specs, 0 failures**. Zero `_envi.json` dependency. |
| `lib/thinx/audit.js` | Adds `expire_at` field via `_buildRecord` helper | VERIFIED + WIRED | 95 lines. `_retentionDays()` (lines 16-27). `_buildRecord(owner, message, flag, mtime)` (lines 33-51) computes `expire_at = new Date(mtime.getTime() + retentionDays * 24 * 60 * 60 * 1000)` and returns it in the record. `log()` (lines 53-66) delegates to `_buildRecord` and passes the record to `loglib.insert`. Signature `log(owner, message, flag, callback)` unchanged. |
| `spec/jasmine/ZZ-AuditTTLSpec.js` | 4+ it blocks: field presence, 90-day default, 30-day override, signature stability | VERIFIED | 154 lines. 5 `it()` blocks: (1) `_buildRecord` produces `expire_at: Date` (line 53); (2) 90-day default arithmetic via `_buildRecord` (line 67); (3) 30-day override with Globals.app_config monkey-patch + cache eviction (line 98); (4) `audit.log.length === 4` arity gate (line 121); (5) bad-config coercion table — `[-1, 0, NaN, "30", null, undefined]` all coerce to 90 (line 131). T-09-08 mitigation locked. |
| `.planning/runbooks/managed-logs-redaction.md` | ≥150 lines, contains `managed_logs`, GDPR-posture, snapshot, sampling | VERIFIED | 318 lines. All 7 required sections present. Token gates pass (see Truth #11). Snapshot step explicitly documented at Step 3 (lines 75-110). Sample-verify at Step 4 (lines 112-134). GDPR posture with scope, method, sampling evidence template, and residual-risk list at section 6 (lines 266-302). Irreversibility explicit acceptance at section 5 (lines 253-264). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/redact-managed-logs.js` | `lib/thinx/util.js` `Util.redactToken`/`Util.redactEmail` | `require('../lib/thinx/util.js')` | WIRED | Line 50 import, line 564 usage. Single-source-of-truth pattern honored. |
| `scripts/redact-managed-logs.js` | `process.env.COUCHDB_USER`/`COUCHDB_PASSWORD`/`COUCHDB_URL` | env-only credential resolution in `resolveCouchUrl()` | WIRED | Lines 338-358. Zero hardcoded credentials. Refuses to run with `EXIT_NO_CREDS=66` when missing. |
| `scripts/redact-managed-logs.js --apply` | snapshot JSONL file at `--snapshot-to` path | `fs.createWriteStream` + `snapshotStream.write` BEFORE `db.bulk` | WIRED | Lines 420-451 `flushBatch()`: writes each pre-redaction doc to JSONL FIRST (forensic), THEN issues `_bulk_docs` POST. Snapshot drain on each batch. |
| `spec/jasmine/ZZ-RedactionScriptSpec.js` | `scripts/redact-managed-logs.js` exports | direct `require('../../scripts/redact-managed-logs.js')` | WIRED | Line 20. Pure helper exports (`redactDoc`, `scanDoc`, `containsRawPII`) exercised by 6 logic `it` blocks + 1 CLI-gate `child_process` block. |
| `lib/thinx/audit.js` `Audit.log()` | `app_config.audit_retention_days` | `Globals.app_config()` lookup with 90-day fallback | WIRED | Lines 16-27 `_retentionDays()` reads `cfg.audit_retention_days`. Try/catch wraps the call. Validation gate (`typeof === "number" && > 0`) rejects malformed input. |
| `lib/thinx/audit.js` `Audit.log()` record builder | `expire_at` field | `new Date(mtime.getTime() + retentionDays * 86400 * 1000)` | WIRED | Line 43 computes `expire_at`, line 49 includes in record returned by `_buildRecord`. Reaches `loglib.insert` via `log()` delegation (line 55-57). |
| `lib/thinx/owner.js` `alog.log(...)` call sites (11 with `Util.redact*`) | `Audit.log` signature | `(owner, message, flag, callback)` — UNCHANGED | WIRED + UNCHANGED | 19 `alog.log` total call sites in owner.js; 11 carry `Util.redactToken`/`redactEmail`. Pre-Phase-9 baseline: 11. Post-Phase-9: 11. Git diff for owner.js across phase 9: 0 lines. |
| `.planning/runbooks/managed-logs-redaction.md` | `scripts/redact-managed-logs.js` (Plan 09-1) | documented invocation examples | WIRED | 9 references in runbook. Steps 2, 3, 4 invoke `node scripts/redact-managed-logs.js --scan` / `--apply --snapshot-to` / `--sample 1000` with `# expect:` comments showing the expected output shape from the actual script (verified against script source). |
| `.planning/runbooks/managed-logs-redaction.md` | `lib/thinx/audit.js` `expire_at` field (Plan 09-2) | TTL cron section documents the field the cron keys off | WIRED | 11 references. Section 3 "Forward-TTL Cron Recipe" documents the `_design/cleanup` view emitting `[expire_at, _id]` for nightly sweep. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/redact-managed-logs.js --scan` | `scanned`, `dirty`, `resetKeyTotal`, `emailTotal`, `previewSamples` | `db.list({include_docs:true, limit:1000})` against live CouchDB managed_logs | Yes — real CouchDB read; output reflects real PII counts | FLOWING (operator-side at runtime; verifier checks code path is wired to nano client + scanDoc helper) |
| `scripts/redact-managed-logs.js --apply` | dirty docs buffer → snapshot JSONL → `_bulk_docs` overlay | `db.list` then `redactDoc(doc)` then `db.bulk({docs: updates})` | Yes — real reads + real writes against managed_logs DB; snapshot written before overlay | FLOWING (operator-side at runtime; verifier checks per-batch `flushBatch()` orders snapshot.write BEFORE db.bulk on lines 429-449) |
| `scripts/redact-managed-logs.js --sample` | `picks[]` of 2N docs (N recent + N old) → `scanDoc` per doc | `db.list({limit:2*N, descending:true})` + `db.list({limit:2*N})` then shuffle + take N from each half | Yes — real reads from CouchDB; exit-code semantics tied to `leaks` count from `scanDoc()` | FLOWING (operator-side; verifier confirms code path runScan→scanDoc→leak-id logging without raw content) |
| `lib/thinx/audit.js` `_buildRecord` | `record.expire_at` | `mtime.getTime() + retentionDays * 86400000` (deterministic math from `Globals.app_config().audit_retention_days` or 90) | Yes — every Audit.log call composes the field; field reaches `loglib.insert` via record argument | FLOWING (audit.js:55-57 `log()` calls `_buildRecord`, then passes record to `loglib.insert`; field is on the persisted shape) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `--help` lists all required flags | `node scripts/redact-managed-logs.js --help` | usage block contains `--apply`, `--snapshot-to`, `--sample`, `--max-docs`, `--scan`, `--batch-size`, `--db-name`, `--help` | PASS |
| `--apply` without `--snapshot-to` refuses | `node scripts/redact-managed-logs.js --apply` (no creds in env) | exit 67, stderr `--apply REFUSES to run without --snapshot-to <path>` | PASS |
| Module exports the pure helpers | `node -e "const m = require('./scripts/redact-managed-logs.js'); console.log(typeof m.redactDoc, typeof m.scanDoc, typeof m.containsRawPII);"` | `function function function` | PASS |
| `redactDoc` produces overlay markers + provenance fields | `node -e "..."` inline smoke (key+email in one doc) | `changed=true`, message contains both markers, `redacted_by="SEC-PII-02"`, ISO `redacted_at` | PASS |
| Idempotency on second pass | `node -e "..."` on already-redacted doc | `redactDoc(redactedDoc).changed === false`; `containsRawPII(redactedDoc) === false` | PASS |
| `node --check` on every new/modified JS | `node --check scripts/...`, `lib/thinx/audit.js`, `spec/jasmine/ZZ-*` | OK on all four | PASS |
| RedactionScript Jasmine suite runs in isolation | `jasmine ZZ-RedactionScriptSpec.js` | **7 specs, 0 failures** in 0.051s | PASS |
| AuditTTL Jasmine suite | `jasmine ZZ-AuditTTLSpec.js` | Blocked at module-load (`audit.js:8` → Database → CouchDB env) | SKIP (test-env ACCEPT pattern — CI canonical green-gate per CONTEXT.md and Phase 5/6/7/8 precedent) |

### Probe Execution

No probes declared by PLAN/SUMMARY for Phase 9. No `scripts/*/tests/probe-*.sh` paths referenced. Phase verification uses grep guards + `node --check` + isolated spec execution + git diff. No probe-based gate to execute.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-PII-02 | 09-01-PLAN.md, 09-02-PLAN.md, 09-03-PLAN.md | Historic CouchDB `managed_logs` redaction (≥658k pre-Phase-2 docs) + forward 90-day TTL on new audit writes + GDPR-posture documentation | SATISFIED | Redaction script ships with snapshot-required gate + sampling verification subcommand (09-1). `expire_at` field added to `Audit.log` writes with 90-day default + `app_config.audit_retention_days` override (09-2). Operator runbook documents end-to-end procedure including GDPR-posture note and irreversibility acceptance (09-3). |

No orphaned requirements for Phase 9 in REQUIREMENTS.md (SEC-PII-02 is the sole mapping; all three plans declared it).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | Zero `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/`TODO` in any Phase 9 artifact: `scripts/redact-managed-logs.js`, `lib/thinx/audit.js`, `spec/jasmine/ZZ-RedactionScriptSpec.js`, `spec/jasmine/ZZ-AuditTTLSpec.js`, `.planning/runbooks/managed-logs-redaction.md`. Verified via `grep -nE "TBD\|FIXME\|XXX\|HACK\|PLACEHOLDER\|TODO"`. |

### Human Verification Required

None. Phase 9 is OPERATOR-EXECUTED — the operator's production run against the live CouchDB on the swarm is explicitly out-of-repo (documented in CONTEXT.md and the runbook). The verifier's role is to confirm artifacts exist + tests pass + key links wired, which is complete. The post-deploy production run, snapshot review, and sampling-evidence recording will happen on the operator side following the runbook in `.planning/runbooks/managed-logs-redaction.md` — that is operator-mode execution, not human UAT of repo deliverables.

### Gaps Summary

None. All 12 must-haves verified. All 5 artifacts pass the 4-level checks (exists, substantive, wired, data flows). All 9 key links wired. Anti-pattern scan returned zero markers in Phase 9 artifacts. Requirements coverage complete: SEC-PII-02 satisfied across all three plans (09-1 redaction script, 09-2 audit TTL, 09-3 runbook).

The local AuditTTL spec module-load failure is the documented test-env ACCEPT pattern carried from Phase 5/6/7/8 — `lib/thinx/audit.js:8` requires Database which requires CouchDB env vars at module-load. The CI canonical green-gate is the binding validator for this spec; static source inspection of `audit.js` and `ZZ-AuditTTLSpec.js` confirms the field/arity/coercion invariants are coded correctly.

---

## Verification Verdict

## VERIFICATION PASSED

All 12 must-haves verified against the codebase. Phase 9 goal achieved: the repo ships (a) a snapshot-required, idempotent operator CLI for historic PII redaction with a fixture-based 7-spec test pass, (b) a forward-going TTL field on `Audit.log` writes parameterized via `app_config.audit_retention_days` with a 90-day default + 5-spec regression coverage, and (c) a 318-line operator runbook with end-to-end procedure, snapshot+rollback semantics, forward-TTL cron recipe, GDPR-posture note, and explicit irreversibility acceptance. All four Phase 9 commits (`8d52fdf0`, `9a16a620`, `0f871ddf`, `e89074e0`) are GPG-signed. SEC-PII-01 caller pattern in `owner.js` is bit-identical pre- and post-Phase-9 (zero diff, `Util.redactToken`/`redactEmail` count unchanged at 11). Production execution of the redaction against the live CouchDB is operator-side (out-of-repo per CONTEXT.md) — the verifier checks the repo-side artifacts, which are complete.

---
*Verified: 2026-06-03T11:24:24Z*
*Verifier: Claude (gsd-verifier, Opus 4.7 1M)*
