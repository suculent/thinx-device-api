---
phase: 09-historic-pii-redaction-managed-logs
plan: 01
subsystem: security
tags: [security, pii, gdpr, couchdb, managed_logs, operator-tooling, redaction, sampling]

# Dependency graph
requires:
  - phase: 02-pii-redaction-sec-pii-01
    provides: Util.redactToken / Util.redactEmail helpers in lib/thinx/util.js (reused for safe progress-log previews; single-source-of-truth for the redaction regex family)
provides:
  - scripts/redact-managed-logs.js — operator CLI with --scan / --apply / --sample / --snapshot-to / --max-docs / --batch-size / --db-name flags
  - Exported pure helpers redactDoc / scanDoc / containsRawPII (reusable from future verification or migration code)
  - Idempotent literal markers [REDACTED-RESET_KEY] / [REDACTED-EMAIL] (cannot match either detection regex — guarantees no-op on second run)
  - spec/jasmine/ZZ-RedactionScriptSpec.js — fixture-based unit spec (NO live CouchDB) covering 6 logic truths + 1 CLI-gate spec
provides-exit-codes:
  - 0 OK
  - 64 USAGE
  - 65 LEAK_DETECTED (sample mode found raw PII)
  - 66 NO_CREDS
  - 67 BAD_SNAPSHOT_PATH (--apply without --snapshot-to)
  - 70 RUNTIME_ERROR
affects:
  - 09-02 (audit.js TTL change — independent, but must not regress this script's behavior on the persisted shape)
  - 09-03 (operator runbook — documents how to invoke this script against production CouchDB)

# Tech tracking
tech-stack:
  added: []  # zero new npm deps; uses existing `nano` plus stdlib `fs`/`path`
  patterns:
    - Operator CLI as a single-file Node.js script (no bundler, no external arg-parser)
    - Snapshot-required-before-destructive-write gate (refuse to run --apply without --snapshot-to)
    - Idempotency via deterministic literal markers (markers cannot match the detection regex)
    - Module exports for unit-testability (CLI runs only inside `if (require.main === module)`)
    - Env-only credential resolution (zero repo-hardcoded creds) — composes COUCHDB_URL with optional COUCHDB_USER/PASSWORD
    - Forensic provenance fields (redacted_by / redacted_at) on every overlay write
    - Fixture-based Jasmine spec with zero `_envi.json` / `app_config` dependency (test-env ACCEPT pattern)

key-files:
  created:
    - scripts/redact-managed-logs.js
    - spec/jasmine/ZZ-RedactionScriptSpec.js
  modified: []

key-decisions:
  - "Reuse Util.redactToken from lib/thinx/util.js for safe progress-log previews (require('../lib/thinx/util.js')) but keep the detection regex (RESET_KEY_REGEX / EMAIL_REGEX) as module-level constants in the script — needed because Util.redactToken/redactEmail are truncating string transformers, NOT pattern detectors. Single-source-truth is preserved at the LOGGING boundary; the detection regex is published as part of the script's export surface so future phases can import it."
  - "Snapshot-required gate fires BEFORE credential resolution. This deliberately allows the CLI-gate spec to run in CI without COUCHDB_* env vars — `node scripts/redact-managed-logs.js --apply` immediately exits 67 with a snapshot-mentioning error regardless of credential state. This was the project planner's requested gate ordering in Task 2 acceptance criteria."
  - "Literal overlay markers (`[REDACTED-RESET_KEY]`, `[REDACTED-EMAIL]`) deliberately contain `[`, `]`, and uppercase letters so they cannot match either /[0-9a-f]{64}/ or the email regex. Idempotency is therefore a property of the marker design, not a separate check — re-running --apply against an already-redacted DB produces zero _bulk_docs writes by construction."
  - "Conflict-tolerance: when CouchDB returns 409 on _bulk_docs (concurrent writer), the conflict is logged with the doc _id and the loop continues. On a later pass the redactor will re-fetch the now-current _rev and retry — by design, since the redaction is idempotent and a doc that was modified concurrently is just another doc to scan."
  - "Sample subcommand logs leak-bearing doc _id values only — NEVER the raw matched content. This preserves the SEC-PII-01 / Phase 2 logging-hygiene invariant: operator can re-fetch leaked docs by _id if forensic re-inspection is needed, but the CI/operator log stream never carries the raw PII."
  - "Page size hardcoded to 1000 (matches CONTEXT.md guidance), batch size defaults to 500 but is configurable via --batch-size. The 2:1 ratio (page:batch) ensures we drain into _bulk_docs faster than we pull, keeping the in-memory buffer bounded by `batch-size` rather than `page-size`."

patterns-established:
  - "Operator CLI gate pattern: refuse-on-missing-required-arg fires BEFORE any external resource resolution, so the refusal path is testable without the external resource."
  - "Redaction-script export pattern: pure helpers (redactDoc/scanDoc/containsRawPII) exported as module.exports for direct unit-test consumption; CLI driver guarded by `require.main === module` so `require()` is a side-effect-free import."
  - "Idempotent overlay pattern: the persisted marker string is in the language of the redaction regex's complement (cannot match by construction), making idempotency a property of the data, not a runtime check."

requirements-completed:
  - SEC-PII-02

# Metrics
duration: 22min
completed: 2026-06-03
---

# Phase 09 Plan 01: Redaction Script + Fixture-Based Unit Spec — Summary

**Operator CLI streams CouchDB managed_logs, overlays raw 64-char hex reset_keys + raw email patterns with literal [REDACTED-RESET_KEY] / [REDACTED-EMAIL] markers via batched _bulk_docs (snapshot-required), and ships a --sample N verification subcommand that exits 0 only when zero raw PII shapes remain — backed by a fixture-based Jasmine spec that runs with zero live-CouchDB dependency.**

## Performance

- **Duration:** ~22 minutes (planning context absorption + implementation + verification)
- **Started:** 2026-06-03T10:40Z (approx — first context read)
- **Completed:** 2026-06-03T11:02:31Z
- **Tasks:** 2 (both type=auto, both completed in a single atomic commit per plan instruction)
- **Files modified:** 2 (created)
- **Lines added:** 737

## Accomplishments

- Operator CLI with six modes/flags: `--scan` (default dry-run), `--apply` (destructive, snapshot-required), `--sample N` (verification primitive), plus `--max-docs N`, `--batch-size N`, `--db-name <name>`, `--snapshot-to <path>`, `--help`.
- Six pure-logic helpers exported for unit testability: `redactDoc`, `scanDoc`, `containsRawPII`, plus the regex constants `RESET_KEY_REGEX` / `EMAIL_REGEX` and the marker constants `RESET_KEY_MARKER` / `EMAIL_MARKER`.
- Snapshot-required gate enforced BEFORE any CouchDB or credential resolution (testable in CI with zero env-var setup).
- Fixture-based Jasmine spec with 7 `it(...)` blocks covering all 6 logic truths from the plan + the CLI-gate spec via `child_process.spawnSync`.
- Idempotency by construction: literal markers cannot match the detection regex, so a second `--apply` is a no-op.
- Forensic provenance: redacted docs carry `redacted_by: "SEC-PII-02"` + `redacted_at: <ISO>` (preserves audit chronology; zero deletes).
- Zero new npm deps (verified by `git diff --stat package.json` showing no changes).

## Task Commits

Atomic single-commit per plan instruction (both tasks bundled into one commit per the executor_context directive: "Single atomic commit: `feat(SEC-PII-02): managed_logs PII redaction script with sampling verification`"):

1. **Task 1 + Task 2: Redaction script + fixture-based spec** — `8d52fdf0` (`feat(SEC-PII-02)`, GPG-signed)

## Files Created/Modified

- `scripts/redact-managed-logs.js` (created, 589 lines) — Operator CLI: streams managed_logs, redacts PII via _bulk_docs overlay, supports --scan/--apply/--sample/--snapshot-to/--max-docs. Module exports `redactDoc`, `scanDoc`, `containsRawPII`, `RESET_KEY_REGEX`, `EMAIL_REGEX`, plus marker constants and exit codes.
- `spec/jasmine/ZZ-RedactionScriptSpec.js` (created, 148 lines) — Fixture-based unit spec; 7 `it(...)` blocks; uses `require('chai').expect`; CLI-gate spec uses `child_process.spawnSync`; zero `_envi.json` / `app_config` dependency.

## Verification Evidence

All plan-specified automated gates pass:

| Gate | Command | Result |
|---|---|---|
| Exports present | `node -e "const m = require('./scripts/redact-managed-logs.js'); ..."` | OK |
| `--help` lists `--apply` / `--snapshot-to` / `--sample` | three independent `grep -F` | OK |
| `RESET_KEY_REGEX = /[0-9a-f]{64}/g` constant present | `grep -E` | OK |
| `EMAIL_REGEX = ...` constant present | `grep -E` | OK |
| `require('../lib/thinx/util.js')` (Util import) | `grep -F` | OK |
| `--apply` without `--snapshot-to` exits non-zero | `exit=67` | OK |
| Refusal message mentions snapshot | `grep -iE "snapshot.*required\|snapshot-to\|refus"` | OK |
| Spec file exists with all required tokens | 10 grep gates | OK |
| Spec has ≥7 `it(...)` blocks | `grep -cE` returns 7 | OK |
| Spec uses `require('../../scripts/redact-managed-logs.js')` (single-quoted) | `grep -F` | OK |
| `package.json` unchanged (no new deps) | `git status` shows only the 2 declared files | OK |

Functional verification (smoke-test via node):

- `containsRawPII(docKeyOnly) === true` (raw 64-char hex)
- `containsRawPII(docEmailOnly) === true` (raw email)
- `containsRawPII(docClean) === false`
- `redactDoc(docLeakBoth)`: `changed=true`, `_id`/`_rev` preserved, message contains both markers, message no longer contains the raw key or raw email, `redacted_by="SEC-PII-02"`, `redacted_at` is parseable ISO.
- Idempotency: `redactDoc(redactedDoc).changed === false` AND `containsRawPII(redactedDoc) === false`.
- `scanDoc(docLeakBoth)`: `resetKeyHits >= 1` AND `emailHits >= 1`.
- `scanDoc(docClean)`: both `=== 0`.
- CLI-gate: `spawnSync('node', [scriptPath, '--apply'], {env: {PATH}})` → `status === 67`, stderr matches `/snapshot/i`.

Spec runs cleanly in isolation under jasmine (no helpers, no `_envi.json`, no bootstrap):

```
$ jasmine --config=<{spec_files: ["jasmine/ZZ-RedactionScriptSpec.js"], helpers: []}>
🚸 [chai] >>> running RedactionScript spec
.......🚸 [chai] <<< completed RedactionScript spec
7 specs, 0 failures
Finished in 0.053 seconds
```

GPG-sign verification:

```
$ git log -1 --format="%h %s%n%nGPG: %G?%nsigner: %GS"
8d52fdf0 feat(SEC-PII-02): managed_logs PII redaction script with sampling verification

GPG: G
signer: Matej Sychra <suculent@me.com>
```

## Decisions Made

(See `key-decisions` in frontmatter for the full list; highlights below.)

1. **Snapshot-gate fires before credentials.** Argument-parsing order: parse args → check `--apply + --snapshot-to` invariant → THEN check creds → THEN connect. This was an explicit Task 2 acceptance criterion ("if the script connects-first, fix the script in Task 1") and is what makes the CLI-gate spec runnable in CI with no `COUCHDB_*` env vars.

2. **Detection regex stays module-local, redactor helpers via require.** The plan suggested two approaches; I chose the hybrid: import `Util` from `lib/thinx/util.js` for safe log-line emission (`Util.redactToken` for progress previews) but keep the detection regex (`RESET_KEY_REGEX` / `EMAIL_REGEX`) as module-level constants. Rationale: `Util.redactToken` is a string transformer, not a pattern detector — they have different responsibilities. The single-source-truth invariant holds at the LOGGING boundary (any place that emits a matched substring goes through `Util.redactToken`), not at the detection boundary.

3. **Sample subcommand only logs `_id` values.** Per SEC-PII-01 logging hygiene: never log raw PII. The operator can re-fetch the doc by `_id` if forensic re-inspection is needed.

4. **Page=1000, batch=500.** The 2:1 ratio bounds in-memory buffer by `batch-size` rather than `page-size`, keeping the script's RSS predictable even on the 658k-doc production data lake.

## Deviations from Plan

None — plan executed exactly as written.

The plan instructed two tasks (script + spec) but a single atomic commit (per the executor_context directive). Both tasks were completed and committed in one GPG-signed commit (`8d52fdf0`) as instructed. No deviation rules (1/2/3/4) fired during execution.

## Issues Encountered

- Initial draft of the spec used double-quoted `require("../../scripts/...")` (matching the rest of the file's quote style). The plan's automated verify line specified single-quoted form. Switched to single quotes to match the literal verify pattern. No semantic impact.
- Bash shell exhibited intermittent silent early-exit on long `&&`-chained verification commands; worked around by running each verify gate individually via `grep -Fc`. All gates pass when run independently or in `{ ... } && { ... }` grouped form.

## User Setup Required

None — this plan ships repo-side artifacts only (one script + one spec). The script is operator-executed against production CouchDB during Phase 9's operator-side rollout (documented in the future runbook from Plan 09-03).

## Next Phase Readiness

- **Plan 09-02 (audit.js TTL change)** is unblocked. The redaction script is independent of the TTL change; both can land in any order. The script's `containsRawPII` helper is intentionally permissive (scans `message`, `flags[]`, and any other string field) so it will still detect leaks even after a future TTL-driven schema field (`expire_at`) is added — the new field is a Date, not a string, so the redactor never touches it.
- **Plan 09-03 (operator runbook + GDPR-posture note)** can now reference the concrete CLI surface, exit codes, and snapshot semantics shipped here. The runbook should:
  - Document `--snapshot-to` path convention (`/mnt/gluster/thinx/snapshots/managed_logs.$(date +%s).jsonl`, `chmod 600`)
  - Document staged-rollout via `--max-docs` (canary 10k → 100k → unbounded)
  - Document the `--sample 1000` post-remediation verification step (SEC-PII-02 ROADMAP success criterion #2)
  - Include the `_compact` follow-up (per `lib/thinx/database.js:117` reference) — runbook decides timing.

## Known Stubs

None. The script is fully functional; the spec exercises all exported helpers + the CLI gate.

## Threat Flags

No new security-relevant surface beyond what the plan's `<threat_model>` already covers:

- T-09-01 (Tampering, script) — mitigated by snapshot-required gate + idempotent markers. ✅
- T-09-02 (Information Disclosure, snapshot file) — accepted per plan; runbook (Plan 09-03) will document `chmod 600` requirement.
- T-09-03 (DoS, CouchDB) — mitigated by 1000-page reads, 500-batch writes, `--max-docs` cap.
- T-09-04 (Repudiation) — mitigated by `redacted_by` / `redacted_at` forensic provenance.
- T-09-05 (EoP, env creds) — accepted per plan; no escalation surface introduced.
- T-09-06 (Info disclosure on stdout) — mitigated; raw match content NEVER logged (sample mode logs only `_id`s).
- T-09-07 (Spoofing via wrong _rev) — mitigated; `_rev` preserved per doc, 409 conflicts logged + skipped.
- T-09-SC (Supply chain) — mitigated; zero new npm deps (verified by `git diff --stat package.json` showing no changes).

## Self-Check: PASSED

Verified post-write:

- `scripts/redact-managed-logs.js` exists at commit `8d52fdf0` (`git show 8d52fdf0 --stat` lists `create mode 100644 scripts/redact-managed-logs.js`).
- `spec/jasmine/ZZ-RedactionScriptSpec.js` exists at commit `8d52fdf0` (same).
- Commit `8d52fdf0` exists on `thinx-staging` and is GPG-signed (`G`, signer: Matej Sychra <suculent@me.com>).
- Jasmine runs the spec in isolation with `7 specs, 0 failures` (verified above).
- `git status` shows working tree clean after the commit.

---
*Phase: 09-historic-pii-redaction-managed-logs*
*Plan: 01*
*Completed: 2026-06-03*
