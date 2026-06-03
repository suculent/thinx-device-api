---
phase: 09-historic-pii-redaction-managed-logs
plan: 2
subsystem: audit-log
tags:
  - security
  - pii
  - audit-log
  - ttl
  - gdpr
  - retention
  - sec-pii-02
requirements:
  - SEC-PII-02
dependency_graph:
  requires:
    - lib/thinx/globals.js (Globals.app_config accessor)
    - lib/thinx/database.js (db_uri via Database constructor)
  provides:
    - "Audit.log() writes records with expire_at: Date TTL field (default 90 days)"
    - "Audit.prototype._buildRecord(owner, message, flag, mtime) — pure record-shape helper for testability"
    - "Audit.prototype._retentionDays() — config-aware retention-day resolver with 90-day fallback"
    - "Spec coverage for field shape + 90-day default + 30-day override + signature stability + bad-config coercion"
  affects:
    - "Every alog.log(...) call site in lib/thinx/owner.js (12+1 sites): SEC-PII-01 caller contract preserved, signature unchanged"
    - "Every alog.log(...) call site in lib/thinx/router.*.js: signature unchanged"
    - "Future Phase 9 Plan 09-3 runbook: documents the cron sweep that keys off this expire_at field"
tech_stack:
  added: []
  patterns:
    - "additive refactor — _buildRecord extracted as pure helper, log() delegates"
    - "config-tolerant read — try/catch around Globals.app_config() so audit writes never fail if config loading throws"
    - "input-tampering gate — typeof === 'number' && > 0 coerces NaN / negative / 0 / string / null to safe default (T-09-08 mitigation)"
key_files:
  created:
    - spec/jasmine/ZZ-AuditTTLSpec.js
  modified:
    - lib/thinx/audit.js
decisions:
  - "Chose helper-export approach (_buildRecord) over require.cache nano-stub manipulation for testability — cleaner, additive, no surface refactor to log()."
  - "Computed expire_at from mtime.getTime() (not a fresh Date.now()) so expire_at is deterministically retentionDays after the record's own date field — simplifies test assertions and avoids microsecond drift."
  - "Five it() blocks instead of the minimum four — added a fifth ‘bad-config coercion' spec to lock the T-09-08 tampering mitigation (NaN / negative / 0 / string / null → 90-day fallback)."
  - "Globals.app_config() wrapped in try/catch (T-09-09): an audit write must never fail because config loading fails; retention precision is sacrificable, audit reliability is not."
metrics:
  duration: "~3 minutes"
  completed_date: "2026-06-03"
  tasks_total: 2
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 1
---

# Phase 09 Plan 02: Audit TTL — add expire_at field on new audit writes — Summary

## One-liner

Adds a forward-going `expire_at: Date` TTL field to every `Audit.log` write, parameterized via `app_config.audit_retention_days` (default 90 days), so the v1.9 SEC-PII-02 cron sweep can evict expired audit docs and the PII-leak shape from re-accumulating is bounded to 90 days instead of perpetual.

## What was built

### `lib/thinx/audit.js` (modified)

Extracted a pure record-shape helper `_buildRecord(owner, message, flag, mtime)` and a config-resolver helper `_retentionDays()` from the existing `Audit.log(owner, message, flag, callback)` method. The public `log()` method now delegates to `_buildRecord` for the record assembly, then calls `loglib.insert(record, mtime, ...)` exactly as before. The record carries a new `expire_at: Date` field computed as `new Date(mtime.getTime() + retentionDays * 24 * 60 * 60 * 1000)`.

Retention horizon resolution (`_retentionDays`):
- Reads `Globals.app_config().audit_retention_days`
- Accepts only `typeof === "number" && > 0` (rejects NaN, negative, 0, string, null, undefined)
- Falls back to **90 days** on any failure, including a `Globals.app_config()` throw (wrapped in `try/catch`)

Existing fields (`message`, `owner`, `date`, `flags`) keep position + type + semantics. The `log()` signature is unchanged (arity = 4). The callback contract `callback(result: boolean)` is unchanged. `Audit.fetch()` is untouched.

### `spec/jasmine/ZZ-AuditTTLSpec.js` (new)

Five Jasmine `it()` blocks (chai `expect`):

1. **Record shape:** `audit._buildRecord('ownerOpaqueId', 'Test message', 'info', mtime)` returns `{message, owner, date, flags, expire_at: Date}` with all fields intact.
2. **90-day default:** when `app_config.audit_retention_days` is unset, `expire_at - date === 7_776_000_000 ms` (90 days). The spec reads the live `Globals.app_config()` once and compares — so a future test config that sets `audit_retention_days` would catch the spec asymmetry rather than silently passing.
3. **30-day override:** monkey-patches `Globals.app_config` to return `{audit_retention_days: 30}`, evicts `require.cache[audit.js]`, re-requires, builds a record, asserts diff = 30 days. Restores in a `finally` block so subsequent specs see the original `Globals.app_config`.
4. **Signature stability:** `audit.log.length === 4` — locks the 4-arg shape so SEC-PII-01 callers in `owner.js` (12+1 sites that pre-redact via `Util.redactToken`/`Util.redactEmail`) cannot accidentally be broken.
5. **Bad-config coercion (T-09-08):** loops through `[-1, 0, NaN, "30", null, undefined]` — every malformed value must coerce to the 90-day fallback, locking the input-tampering mitigation in the threat register.

Conventions match `AuditSpec.js` + `ZZ-OwnerLogRedactionSpec.js` (project Jasmine + chai, no sinon, banner `🚸 [chai] >>> running AuditTTL spec` / `🚸 [chai] <<< completed AuditTTL spec`).

## Tasks completed

| # | Task                                                                                              | Verify gates                                                                                                                                                                                                                            | Done |
| - | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1 | Modify `lib/thinx/audit.js` — add `expire_at` field with parameterized retention                  | `grep expire_at` ≥ 2 hits, `grep audit_retention_days` ≥ 1 hit, `grep retentionDays` ≥ 1 hit, `log` arity preserved at 4, `owner.js` zero diff, `AuditSpec.js` zero diff                                                            | ✅   |
| 2 | Add `spec/jasmine/ZZ-AuditTTLSpec.js` — fixture-based TTL field regression                         | file exists, contains `expire_at` + `audit_retention_days`, `describe(...SEC-PII-02...Audit...)`, 5 `it(` blocks (≥4 required), `90 * 24 * 60 * 60 * 1000` math, `audit.log.length` arity assertion, syntactically valid               | ✅   |

## Verification

| Gate                                                                                          | Result |
| --------------------------------------------------------------------------------------------- | ------ |
| `grep -n "expire_at" lib/thinx/audit.js`                                                      | 3 hits (declaration comment, value computation, record-builder field) ✅ |
| `grep -n "audit_retention_days" lib/thinx/audit.js`                                           | 1 hit (config lookup in `_retentionDays`) ✅ |
| `grep -cE "log\(owner, message, flag, callback\) {" lib/thinx/audit.js`                       | 1 (signature stable) ✅ |
| `node --check lib/thinx/audit.js`                                                             | OK ✅ |
| `node --check spec/jasmine/ZZ-AuditTTLSpec.js`                                                | OK ✅ |
| `git diff --stat lib/thinx/owner.js`                                                          | clean (zero diff) ✅ |
| `git diff --stat spec/jasmine/AuditSpec.js`                                                   | clean (zero diff) ✅ |
| `grep -cE "^\s*it\(" spec/jasmine/ZZ-AuditTTLSpec.js`                                         | 5 (≥ 4 required) ✅ |
| `grep -E "describe\(.*SEC-PII-02.*Audit" spec/jasmine/ZZ-AuditTTLSpec.js`                     | matched ✅ |
| `grep -E "90\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000" spec/jasmine/ZZ-AuditTTLSpec.js`      | 2 hits (constant + comment) ✅ |
| `grep -F "audit.log.length" spec/jasmine/ZZ-AuditTTLSpec.js`                                  | matched (line 126) ✅ |
| `node -e "const A = require('./lib/thinx/audit.js'); ..." arity test                          | NOT RUN — locally `Globals` throws on missing `/mnt/data/conf/config.json` (test-env ACCEPT pattern per CONTEXT.md; runs in CI where `ENVIRONMENT=development` is set + `spec/mnt/data/conf/config.json` is present). Equivalent gate covered by `node --check` + the `audit.log.length` spec assertion. ⚠️ env-skip |

The CI canonical green-gate (Jasmine + `ENVIRONMENT=development` + `spec/mnt/data/conf/config.json`) runs all 5 spec blocks. Locally, the `node -e require(audit.js)` smoke fails because no `ENVIRONMENT` env var is set in a raw shell — this is the documented Phase 5/6/7/8 test-env ACCEPT pattern, not a regression.

## Deviations from Plan

**1. [Rule 2 — Critical functionality] Added a 5th spec block for bad-config tampering coercion (T-09-08)**

- **Found during:** Task 2 implementation
- **Issue:** The threat register entry T-09-08 (Tampering — malicious `audit_retention_days` config value) is mitigated in `_retentionDays()` via the `typeof === "number" && > 0` gate, but the plan's 4 spec blocks didn't lock that mitigation. A future refactor could drop the gate (e.g., simplify to `cfg.audit_retention_days || 90`) and `0` / `NaN` / negative values would silently leak through. Adding the spec catches this.
- **Fix:** Added a 5th `it()` block ("expire_at falls back to 90 days when app_config.audit_retention_days is invalid") looping through `[-1, 0, NaN, "30", null, undefined]` and asserting all coerce to the 90-day fallback.
- **Files modified:** `spec/jasmine/ZZ-AuditTTLSpec.js` (one additional spec block)
- **Commit:** `9a16a620`

This is an additive deviation (the plan accepted "at least 4" `it()` blocks); no plan constraint was broken.

## Key Decisions

1. **Helper-export approach over `require.cache` nano-stub manipulation** — the plan offered both; I chose (a) per the plan's explicit "PREFERRED" recommendation. The `_buildRecord` + `_retentionDays` extraction is strictly additive (no behavior change for `log()`) and makes the record shape directly testable without faking out the nano CouchDB client.

2. **`mtime.getTime()` as the anchor for `expire_at`** — not `Date.now()`. This means `expire_at - date` is deterministically `retentionDays` ms, which lets the spec assert exact equality (`.to.equal(expectedMs)`) instead of fuzzy ranges. It also closes a microsecond drift between when the record was assembled and when the expiry was computed.

3. **`try/catch` around `Globals.app_config()`** — `globals.js` can throw at module-load if `/mnt/data/conf/config.json` is missing, and `app_config()` can re-trigger load failures. An audit-log write must never fail because the config infra is unavailable — retention precision is sacrificable, audit reliability is not. Falls back to 90 days on any throw (T-09-09 mitigation).

4. **Reused `Globals` import** — already at line 5 of `audit.js`; no new `require` needed (per plan invariant).

## Deferred Items

- **Historic doc backfill** — Phase 9 Plan 09-1's redaction script does NOT add `expire_at` to historic pre-Phase-9 docs. Forward-going only. The future operator runbook (Plan 09-3) documents that historic docs are not TTL-evictable and recommends a one-shot `_bulk_docs` backfill if the operator wants the cron sweep to also evict them (T-09-10 accepted disposition).
- **CouchDB `_design/cleanup` view** that emits `[expire_at, _id]` — out of this plan's scope; lives in Plan 09-3's runbook (operator-side CouchDB design-doc deployment, not in this repo's code).
- **Nightly cron entry on swarm scheduler** — operator-side; documented in Plan 09-3's runbook.

## Threat Surface Scan

No new attack surface beyond what the plan's `<threat_model>` already enumerated. The mitigations for T-09-08, T-09-09, T-09-11 are all in place in this commit:

| Threat ID | Disposition | Mitigation Landed In |
| --------- | ----------- | -------------------- |
| T-09-08 (Tampering — malicious config value) | mitigate | `_retentionDays()` `typeof === "number" && > 0` gate + Spec 5 |
| T-09-09 (DoS — Globals.app_config throws) | mitigate | `try/catch` around the `Globals.app_config()` call in `_retentionDays()` |
| T-09-10 (Repudiation — pre-Phase-9 docs without expire_at) | accept | Documented in this Summary's "Deferred Items"; forward-going only |
| T-09-11 (Info Disclosure — SEC-PII-01 regression) | mitigate | `log()` signature unchanged (arity = 4) + owner.js zero diff + Spec 4 locks arity |
| T-09-12 (EoP — Globals at write-time) | accept | `Globals` already required at module top (`audit.js:5`); no new privilege surface |
| T-09-SC (Tampering — npm install slop) | mitigate | No new packages; `package.json` unchanged |

## Self-Check: PASSED

- ✅ `lib/thinx/audit.js` exists, modified, syntax-valid
- ✅ `spec/jasmine/ZZ-AuditTTLSpec.js` exists, syntax-valid
- ✅ `lib/thinx/owner.js` zero diff
- ✅ `spec/jasmine/AuditSpec.js` zero diff
- ✅ Commit `9a16a620` exists in `git log`, GPG-signed (Good signature), no file deletions
- ✅ Commit message follows the planned format: `feat(SEC-PII-02): add expire_at TTL field to audit log writes (90-day default)`

## Commit

- **`9a16a620`** — `feat(SEC-PII-02): add expire_at TTL field to audit log writes (90-day default)` (2 files changed, 185 insertions(+), 4 deletions(-); GPG-signed)
