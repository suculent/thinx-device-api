---
phase: 26-vue-console-log-paging
plan: 03
subsystem: security
tags: [security, credentials, audit, cleanup, script, couchdb, jasmine]

requires:
  - phase: 26-vue-console-log-paging
    provides: "plan 26-01 Audit.stringFlags rule (non-empty strings <= 32 chars, fallback ['info']), duplicated by the script"
provides:
  - "scripts/clear-leaked-credentials.js: D-15 cleanup CLI. Dry run by default; --apply --targets reset-keys|audit-flags; aggregate-only output; no snapshot"
  - "Writer fixes: owner.js apply_update and sources.js updateUser log the flag \"info\"; set_password_reset logs a value-free line"
  - "AuditFlagWritersSpec: static guard over every alog.log call under lib/"
affects: [26-06 production dry run and gated apply, audit log, password reset]

actuals:
  tokens: 10400
  tasks: 2
  commits: 4
plan_head_before: 62287cc847db02fa5fa646ad472ecdfd1bbae0db
plan_head_after: 319cf21102e7b749e698d8a24b8c8cc7e7336149

tech-stack:
  added: []
  patterns:
    - "Operator CLI exports run(argv, deps) -> {code, lines}; deps.client is a couch-like object, so specs drive it against an in-memory fake"
    - "Errors reduced to error=<status>:<code> (errno token extracted from nano 11 socket messages); reason, message and URL never printed"
    - "Static source guard: balanced-paren scan that skips strings and comments and reports file:line only"

key-files:
  created:
    - scripts/clear-leaked-credentials.js
    - spec/jasmine/ClearLeakedCredentialsSpec.js
    - spec/jasmine/AuditFlagWritersSpec.js
    - .planning/phases/26-vue-console-log-paging/deferred-items.md
  modified:
    - lib/thinx/owner.js
    - lib/thinx/sources.js

key-decisions:
  - "--targets without --apply is a usage error (exit 2), like --apply without --targets, so an operator cannot believe a dry run applied anything"
  - "Apply mode prints the same scan aggregates as the dry run (the before-state) followed by the apply counters"
  - "Audit-flags apply writes per scanned page with the scanned _rev; a whole-batch bulk rejection is fatal (INCOMPLETE, exit 1) rather than retried"
  - "The static guard accepts a conditional between two string literals, because owner_purge.js passes ok ? \"info\" : \"error\""

patterns-established:
  - "D-15 one-way cleanup: no snapshot of removed credential material, aggregates recorded instead"

requirements-completed: [LOG-02]

coverage:
  - id: D1
    description: "Cleanup CLI dry run reads both DBs page by page and prints contract-ordered aggregates, CLEANUP-DRY-RUN OK, with no writes"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#dry run (default) reports aggregates in contract order and writes nothing"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#--dry-run pages with limit batch+1 and startkey, giving the same counts"
        status: pass
    human_judgment: false
  - id: D2
    description: "--apply changes only the named targets (reset_key via users/edit, flags via bulk), converges to zero, and reports conflicts/failures as INCOMPLETE exit 1"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#--apply --targets reset-keys clears reset_key through users/edit only"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#--apply --targets audit-flags rewrites only flags of the affected docs in one bulk write"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#--apply with both targets converges to zero, and a second apply is a no-op"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#a bulk conflict is reported as CLEANUP-APPLY INCOMPLETE with exit 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Usage gating (exit 2 before any CouchDB call) and output hygiene (no id, 64-hex, address, URL; no file writes) in every mode"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#refuses --apply without --targets, or with an unknown target, before any CouchDB call"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ClearLeakedCredentialsSpec.js#reduces a credentialed CouchDB error to status and error code only"
        status: pass
      - kind: other
        ref: "node scripts/clear-leaked-credentials.js --help (exit 0); --apply (exit 2) -> CLI-CONTRACT-OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "The two audit writers log \"info\", the reset debug dump is gone, and a static guard rejects any non-literal alog.log flag under lib/"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/AuditFlagWritersSpec.js#no alog.log call under lib/ passes a non-literal third argument"
        status: pass
      - kind: unit
        ref: "spec/jasmine/AuditFlagWritersSpec.js#set_password_reset does not serialise the user document or the changes into the API log"
        status: pass
    human_judgment: false
  - id: D5
    description: "Production dry run and gated apply against the real managed_users / managed_logs"
    requirement: LOG-02
    verification: []
    human_judgment: true
    rationale: "Out of scope for this plan by design; plan 26-06 Tasks 1-3 run it with operator approval"

duration: 7min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 03: D-15 Credential Cleanup CLI and Audit Writer Fixes Summary

**The D-15 cleanup CLI (`scripts/clear-leaked-credentials.js`) dry-runs by default, applies `reset-keys` (through the users/edit handler) and `audit-flags` (flags-only bulk rewrite) only when named, and prints aggregates only. The two writers that copied user documents into audit flags now log `"info"`, and a static guard covers every `alog.log` call under lib/.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-01T14:48:39Z
- **Completed:** 2026-10-01T14:55:15Z
- **Tasks:** 2 (each a RED test commit, then a GREEN commit)
- **Files modified:** 5 (3 created, 2 modified), plus deferred-items.md

## Accomplishments

- **Cleanup CLI.** `scripts/clear-leaked-credentials.js` follows the plan's `<interfaces>` contract exactly: flags, env, exit codes and the order of output keys. It builds its client from `lib/thinx/couch` and env vars only, never `globals.js`, so it runs through `docker exec` in the API container.
- **Proven end to end against a fake CouchDB:**
  - the dry run counts 2 reset keys and 2 object-flag docs (password 1, reset_key 1, email 1, repos 2) and skips design docs;
  - `reset-keys` makes exactly 2 `atomic("users","edit",id,{reset_key:null})` calls;
  - `audit-flags` sends one bulk write with flags `["info"]` and `["warning"]`, `_rev` and all other fields unchanged;
  - a following dry run reports 0, and a second apply changes nothing.
- **Hygiene asserted on every captured line:**
  - no 64-hex value, `@`, `http` or fixture id appears in any output line;
  - a credentialed 401 error object reduces to `error=401:unauthorized`, and a nano socket failure to `error=none:ECONNREFUSED`;
  - the `fs.writeFileSync`, `createWriteStream` and `appendFileSync` spies are never called;
  - `grep -cE "writeFile|createWriteStream"` on the script returns 0.
- **Writers fixed.** `owner.js` `apply_update` and `sources.js` `updateUser` now log `"info"`. The `set_password_reset` debug line that printed the user document and the new password hash is now `ℹ️ [info] [owner] applying password reset`.
- **Static guard.** `AuditFlagWritersSpec` scans every `alog.log(` call under lib/, including multi-line calls and `this.alog.log`. It skips strings and comments, rejects any third argument that is not a literal, and reports only file:line.

## Task Commits

1. **Task 1 (tracer): credential cleanup script**
   - RED `bc45e0a7`: test(26-03): add failing spec for the D-15 credential cleanup CLI
   - GREEN `9b3a35af`: feat(26-03): D-15 credential cleanup script (dry run by default, aggregates only)
   - Tracer gate: `<verify>` was re-run end to end after GREEN (CLEANUP-SCRIPT-GREEN, CLI-CONTRACT-OK). Expansion went ahead.
2. **Task 2: audit writers, debug line, static guard**
   - RED `8dc27ab7`: test(26-03): add failing static guard for audit flag writers
   - GREEN `319cf211`: fix(26-03): stop logging credential objects as audit flags and in the reset debug line

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.

## TDD Evidence

Each RED run went through a local TAP reporter (`/tmp/gsd-26-03/tap-run.js`, not committed) and was classified with `gsd-tools check tdd-red-evidence`. Both runs returned `RED_EVIDENCE_OK`.

- **Task 1 RED:** 13 specs, 13 failures, all on assertions. The committed skeleton exported `run`, `stringFlags` and `hasObjectFlag` but returned code 1, `[]` and `false`, so the spec loaded and every case failed for the planned reason (for example, `expected 1 to equal +0`, and `--apply: expected 1 to equal 2`). This avoids the load-crash INVALID_RED that a missing module would cause.
- **Task 2 RED:** 5 specs, 3 failures. The guard reported `lib/thinx/owner.js:417` and `lib/thinx/sources.js:361`, the "info" string checks failed, and the debug-dump check failed. The 2 cases that passed are the scanner's own non-vacuity cases. A first RED draft had a spec bug in multi-line detection (it measured trimmed argument text). It was fixed before the RED commit.
- **Gate commit types:** Task 2's GREEN commit is `fix(26-03)`, not `feat(26-03)`, because the plan names that commit type. A `test` commit comes before it.

## Files Created/Modified

- `scripts/clear-leaked-credentials.js`: the D-15 CLI (dry run, gated apply, aggregates, sanitised errors, no snapshot)
- `spec/jasmine/ClearLeakedCredentialsSpec.js`: fake-CouchDB proof of dry run, per-target apply, convergence, conflict and failure paths, usage gating and output hygiene (14 specs)
- `spec/jasmine/AuditFlagWritersSpec.js`: static `alog.log` flag guard plus checks on the writers and the reset debug line (5 specs)
- `lib/thinx/owner.js`: `apply_update` logs `"info"` and drops the now-unused response binding; `set_password_reset` logs a value-free line
- `lib/thinx/sources.js`: `updateUser` logs `"info"`
- `.planning/phases/26-vue-console-log-paging/deferred-items.md`: two pre-existing error-path log leaks in owner.js (see below)

## Decisions Made

- `--targets` without `--apply` is a usage error (exit 2), the mirror of `--apply` without `--targets`. An operator cannot mistake a dry run for an apply.
- Apply mode prints the scan aggregates (the state before the apply), then the apply counters, then `error=<status>:<code>` once for each distinct failure reason, then the final status line.
- Audit-flags writes happen one page at a time, carrying the scanned `_rev`. Per-doc `conflict` results count as `audit_conflicts`, and other per-doc errors as `audit_failed`. If the bulk call itself is rejected, the run stops (INCOMPLETE, exit 1) rather than retrying. A rerun converges.
- `errorTag()` pulls only the errno token (for example `ECONNREFUSED`) out of nano 11's socket error message. That message includes host:port, so the rest of it is never printed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The static guard accepts a conditional between two string literals**
- **Found during:** Task 2, when designing the guard
- **Issue:** The plan says every other `alog.log` call passes a string literal, an array of literals or nothing. `lib/thinx/owner_purge.js:158` passes `report.steps[name].ok ? "info" : "error"`. That is safe, but the strict rule would reject it, and owner_purge.js is outside this plan's files.
- **Fix:** The guard also accepts `<cond> ? "<lit>" : "<lit>"`. A non-vacuity case shows that `ok ? "info" : changes` is still a violation.
- **Files modified:** spec/jasmine/AuditFlagWritersSpec.js
- **Committed in:** 8dc27ab7

**2. [Rule 1 - Bug] Dropped the unused `abody` binding in `apply_update`**
- **Found during:** Task 2 GREEN
- **Issue:** Once `abody` was no longer logged, eslint failed with `'abody' is assigned a value but never used` (no-unused-vars). `npm run lint` runs `eslint ./`.
- **Fix:** `await this.userlib.atomic("users", "edit", owner, changes);` with no binding.
- **Impact on acceptance:** the owner.js/sources.js diff is **4 insertions and 4 deletions**, one line over the plan's "at most 3" ceiling. The extra line is the binding removal and changes no behaviour. eslint is clean on all five files.
- **Committed in:** 319cf211

**3. [Rule 2 - Missing critical] Socket errors reduced to an errno token**
- **Found during:** Task 1, during a local check against a closed localhost port (no database)
- **Issue:** nano 11 rejects socket failures with a plain Error whose message includes host:port and nothing else, so `errorTag` printed `error=none:unknown`. That hides the cause from the operator.
- **Fix:** Extract the `E[A-Z_]+` errno token from the message and drop everything else. Covered by the spec case "reduces a nano socket failure to its errno token".
- **Committed in:** 9b3a35af

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical)
**Impact on plan:** None changes the CLI contract or the scope of the writer fix. Deviation 2 goes one line over the plan's diff-size acceptance criterion, as noted above.

## Issues Encountered

- Two **pre-existing** credential leaks into the API log, both on error paths in `lib/thinx/owner.js` and both outside the lines this plan was allowed to touch. They are logged in `deferred-items.md`, not fixed:
  - `atomic()` logs `changes`, which holds the new password hash on the reset and activation paths, when users/edit fails;
  - `apply_update()` logs `JSON.stringify(changes)` on failure.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure (pre-existing, deferred) | lib/thinx/owner.js `atomic()` | On a failed users/edit call, the new password hash reaches the API log. Same class as T-26-13, on an error path outside this plan's scope. See deferred-items.md item 1. |

## User Setup Required

None. Plan 26-06 runs the production dry run and the gated apply:
- `node scripts/clear-leaked-credentials.js`
- `node scripts/clear-leaked-credentials.js --apply --targets reset-keys,audit-flags`

## Next Phase Readiness

- The CLI is ready for plan 26-06 Task 1 (production dry run through `docker exec` in `thinx_api`). It needs `COUCHDB_USER` and `COUCHDB_PASS` from the container env and reaches `couchdb:5984`.
- Nothing was run against a real database, and there was no ssh, push or docker command.

## Self-Check: PASSED

- FOUND: scripts/clear-leaked-credentials.js, spec/jasmine/ClearLeakedCredentialsSpec.js, spec/jasmine/AuditFlagWritersSpec.js, lib/thinx/owner.js, lib/thinx/sources.js
- FOUND commits: bc45e0a7, 9b3a35af, 8dc27ab7, 319cf211 (signed)
- Markers: CLEANUP-SCRIPT-GREEN, CLI-CONTRACT-OK, AUDIT-WRITERS-GREEN (19 specs, 0 failures), WRITERS-PARSE

---
*Phase: 26-vue-console-log-paging*
*Completed: 2026-10-01*
