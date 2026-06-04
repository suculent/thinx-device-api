---
phase: 07-owner-async-await-sweep
plan: 02
subsystem: owner
tags:
  - refactor
  - async-await
  - owner
  - create
  - top-5
  - account-creation
  - strict-equality
requirements:
  - REFACTOR-04
requires:
  - lib/thinx/owner.js (post-Plan-07-1 state at 1aa92fe5)
  - nano 10.1.4 native promise API
provides:
  - lib/thinx/owner.js with Owner.create using async/await internals (public callback signature preserved)
  - 7-of-7 strict-equality sweep CLOSED — zero non-strict comparisons remain in owner.js
  - spec/jasmine/02-OwnerSpec.js with behavior-locking unit test for the synchronous email_required callback contract
affects:
  - lib/router.auth.js (unchanged — caller-side callback contract preserved at line 70)
  - lib/router.user.js (unchanged — caller-side callback contract preserved at line 133)
  - lib/router.google.js (unchanged — caller-side callback contract preserved at line 59)
  - lib/router.github.js (unchanged — caller-side callback contract preserved at line 90)
tech_stack:
  added: []
  patterns:
    - "async create(body, send_activation, res, callback) { try { ...sequential awaits... } catch (err) { callback(res, false, 'owner_error'); } }"
    - "Promise wrapper around still-callback-style helpers (create_default_mqtt_apikey, sendActivationEmail) to keep linear control flow"
    - "Local try/catch per nano-userlib await — captures expected error case into a local variable so downstream branches read identically to the pre-conversion code"
key_files:
  created: []
  modified:
    - lib/thinx/owner.js
    - spec/jasmine/02-OwnerSpec.js
decisions:
  - "Outer public signature stays `create(body, send_activation, res, callback)` — only `async` prefix added; 4 callers in router.auth/user/google/github remain unchanged."
  - "`create_default_mqtt_apikey` (callback-style at its public signature per Plan 07-1) is awaited via a Promise wrapper at the call site — keeps the Plan 07-1 contract intact while giving Plan 07-2's create a linear flow."
  - "`sendActivationEmail` is NOT converted by Phase 7 and stays callback-style at its definition; the call site uses a Promise wrapper to stay linear."
  - "Step B (userlib.view) catch block synthesizes an empty rows result so the downstream row-count check uniformly handles both happy-path and not-found cases. Semantics match the pre-conversion `if (err !== null) { ...log... } else { ...row check... }` exactly."
  - "Outer try/catch wraps the entire post-guard body; the catch funnels any unexpected throw to `callback(res, false, 'owner_error')` as defense-in-depth (per-step try/catches already handle expected error cases)."
  - "Final strict-equality fix: `err_u.statusCode == 409` → `err_u.statusCode === 409`. Pre-Plan-7 there were 7 non-strict comparisons in owner.js; Plan 07-1 closed 6 and Plan 07-2 closes the 7th. ZERO remain."
metrics:
  duration_minutes: ~8
  tasks_completed: 5
  files_modified: 2
  lines_inserted: 151
  lines_deleted: 113
  net_line_delta: +38
  non_strict_comparisons_before: 1
  non_strict_comparisons_after: 0
  sec_pii_01_call_count_before: 28
  sec_pii_01_call_count_after: 28
  test_mode_hook_count: 6  # ENVIRONMENT === "test" occurrences in owner.js (preserves all 3 in Owner.create + 3 in other methods touched by Plan 07-1)
  callers_unchanged: 4
completed_date: 2026-06-03
---

# Phase 7 Plan 02: Owner.create Async/Await Conversion — Summary

## One-Liner

Converted `Owner.create` (the 4-caller top-5 method) from callback-style internals to async/await using nano 10's native promise API, folded the final 7th strict-equality fix (`statusCode == 409` → `===`) closing the strict-equality sweep, and added a behavior-locking unit test asserting the synchronous `email_required` callback contract.

## What Changed

### `lib/thinx/owner.js` — `Owner.create` (line 803, body ~803-995)

| Conversion step | Original line(s) | New form |
|-----------------|------------------|----------|
| Outer signature | `create(body, send_activation, res, callback) {` | `async create(body, send_activation, res, callback) {` |
| Outer wrap | n/a | `try { ... } catch (err) { console.log("☣️ [error] owner_error", err); return callback(res, false, "owner_error"); }` |
| **Step A** — `userlib.get(new_owner_hash, (user_get_error) => ...)` at line 825 | nested callback | `let user_get_error = null; try { await this.userlib.get(new_owner_hash); } catch (e) { user_get_error = e; }` — preserves the test-env duplicate-user semantic (success → enters dup-check; failure → skips it). |
| **Step B** — `userlib.view("users", "owners_by_username", ...)` at line 850 | nested callback with `if (err !== null) { log } else { row-check }` | `let user_view_body; try { user_view_body = await this.userlib.view(...); } catch (err) { if (err && err.toString().indexOf("Error: missing") === -1) { console.log(...); } user_view_body = { rows: [] }; }` followed by the unified row-count check. |
| **Step C** — `create_default_mqtt_apikey(new_owner_hash, (success) => ...)` at line 893 | nested callback | `const mqtt_success = await new Promise(resolve => this.create_default_mqtt_apikey(new_owner_hash, (success) => resolve(success)));` — Promise wrapper preserves the Plan 07-1 callback-style public signature of the helper. |
| **Step D** — `userlib.insert(new_user, new_owner_hash, (err_u) => ...)` at line 926 | nested callback with `if (err_u.statusCode == 409) {...}` | `let insert_err = null; try { await this.userlib.insert(new_user, new_owner_hash); } catch (e) { insert_err = e; } if (insert_err) { if (insert_err.statusCode === 409) {...} else {...} }` — **the 7th and final strict-equality fix lands here.** |
| **Step E** — `sendActivationEmail(...)` at line 945 | nested callback | Promise wrapper: `const { send_success, result } = await new Promise(resolve => this.sendActivationEmail(activation_email_descriptor, (s, r) => resolve({ send_success: s, result: r })));` — `sendActivationEmail` itself is NOT converted by Phase 7 (out-of-scope helper). |

### `spec/jasmine/02-OwnerSpec.js` — new `it("(13) REFACTOR-04 (07-2): Owner.create callback contract preserved for missing-email error path", ...)`

Inserted before the closing `});` of the `describe("Owner", ...)` block. Asserts:

- `user.create({ /* no email */ }, true, res_mock, (cb_res, cb_success, cb_reason) => { ... })`
- `cb_success === false`
- `cb_reason === "email_required"`

The `email_required` short-circuit fires BEFORE any DB / Redis / Couch dependency, so this test runs without the broader test-env config (specifically: it survives the local "`/mnt/data/conf/config.json` missing" ACCEPT scenario noted in Phase 5/6/07-1).

## Strict-Equality Sweep — CLOSED

Goal-backward truth #2 of Phase 7 is now fully met:

```
$ grep -nE "[^=!<>]!=[^=]|[^=!<>]==[^=]" lib/thinx/owner.js
(no matches — exit 1)

$ grep -cE "[^=!<>]!=[^=]|[^=!<>]==[^=]" lib/thinx/owner.js
0
```

| Phase | Non-strict comparisons in owner.js |
|-------|------------------------------------|
| Pre-Phase-5 baseline | 8 |
| Post-Phase-5 (REFACTOR-02 scope) | 7 |
| Post-Plan-07-1 (6-of-7 sweep) | 1 (the deferred `statusCode == 409` inside Owner.create) |
| **Post-Plan-07-2** | **0** |

## Callers — Unchanged (Verified)

All four `Owner.create` callers were inspected pre-commit. None modified by Plan 07-2:

| File | Line | Call shape |
|------|------|------------|
| `lib/router.auth.js` | 70 | `user.create(body, true, res, (...) => ...)` |
| `lib/router.user.js` | 133 | `user.create(body, true, res, Util.responder)` |
| `lib/router.google.js` | 59 | `user.create(body, false, res, (...) => ...)` |
| `lib/router.github.js` | 90 | `user.create(body, false, res, (...) => ...)` |

Because the outer signature stays callback-style, even the `Util.responder` callback-passed-by-reference pattern in `router.user.js:133` remains valid — the async wrapper resolves and calls `callback(res, success, reason)` exactly as the pre-conversion code did.

## Validation Gates — ALL PASS

| Gate | Result |
|------|--------|
| 1. `node --check lib/thinx/owner.js` | PASS (exits 0) |
| 2. `node --check spec/jasmine/02-OwnerSpec.js` | PASS (exits 0) |
| 3. Strict-equality grep returns ZERO lines | PASS — 0 non-strict comparisons remain in owner.js |
| 4. `async create(body, send_activation, res, callback) {` regex returns exactly 1 line | PASS — line 803 |
| 5. Other top-5 methods untouched in diff (`delete`, `update`, `password_reset`, `set_password`) | PASS — 0 matches in `git diff -U0` |
| 6. SEC-PII-01 redaction count `>= 28` baseline | PASS — `grep -c "alog.log\|Util.redactToken\|Util.redactEmail"` returns 28 |
| 7. Test-mode hook preservation — `ENVIRONMENT === "test"` count `>= 3` | PASS — 6 sites (3 inside Owner.create at lines preserved verbatim; 3 in other methods from Plan 07-1) |
| 8. New behavior-locking spec marker present exactly once | PASS — `grep -c "REFACTOR-04 (07-2)" spec/jasmine/02-OwnerSpec.js` returns 1 |
| 9. ESLint clean on touched files | PASS — `npx eslint lib/thinx/owner.js spec/jasmine/02-OwnerSpec.js` no output / no errors |
| 10. Diff scope: only the two task files | PASS — 2 files, 151 insertions, 113 deletions |
| 11. No accidental deletions in commit | PASS — `git diff --diff-filter=D HEAD~1 HEAD` empty |
| 12. GPG-signed commit | PASS — `git log -1 --pretty=%G?` returns `G` |
| 13. Commit subject exact match | PASS — `refactor(REFACTOR-04): convert Owner.create to async/await internals` |
| 14. Plan 07-1 anti-regression: `reset_key !== user_reset_key` (line 492) still strict | PASS — Owner.password_reset body untouched by this plan |

## Deviations from Plan

None. Plan executed exactly as written.

### Notes (not deviations)

- **Commitlint footer-leading-blank warning** (warning, not error): the trailer line `Refs: REFACTOR-04 (Phase 7); 7-of-7 strict-equality sweep closed.` was attached without a leading blank line, so commitlint emitted a single warning. The commit landed without error; this matches the pattern from Plan 07-1's commit which also got the same warning (per the project's commitlint config, footer-blank is a warning, not a block).
- **Test-env ACCEPT carries forward** (per CONTEXT.md): local `npm test` aborts on missing `/mnt/data/conf/config.json`. Static gates (`node --check`, grep, lint) are authoritative locally; CI (CircleCI Jasmine inside the Docker test image) is the canonical behavioral green-gate. The new `(13)` spec was designed specifically to run WITHOUT this broader config (the `email_required` path is synchronous and pre-dependency).

## SEC-PII-01 Redaction Calls — Preserved

`Owner.create` itself does not directly invoke `Util.redactToken` / `Util.redactEmail` / `alog.log` per the Phase 1 audit and verified again here. The 28 redaction sites elsewhere in `owner.js` (preserved verbatim by Plan 07-1) remain at count 28 post-Plan 07-2 — confirming this commit did not accidentally touch a neighboring method's redaction calls. Note: `sendActivationEmail` (called from within Owner.create's success path) is itself unchanged and its downstream redaction behavior is unaffected.

## Test-Mode Hooks — All Preserved Verbatim

| Hook | Pre-conversion line | Post-conversion location | Status |
|------|---------------------|--------------------------|--------|
| `if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development"))` | line 828 | inside post-Step-A block, preserved | PASS |
| `if (process.env.ENVIRONMENT === "test") { return callback(res, true, new_activation_token); }` | line 937 | post-Step-D success branch, preserved | PASS |
| `if (process.env.ENVIRONMENT !== "test")` | line 949 | post-Step-E result branch, preserved | PASS |

Specifically, the line-937-equivalent hook is what the existing `02-OwnerSpec.js (01)` test depends on — it delivers the activation token synchronously enough for the spec's `expect(response).to.be.a('string')` assertion. That hook is unchanged.

## Files Modified

- `lib/thinx/owner.js` — 248 line replacements (+151 / −113), net +38 lines, inside `Owner.create` only (lines 803-995 post-conversion). File grew from 1162 lines (post-07-1) to ~1200 lines.
- `spec/jasmine/02-OwnerSpec.js` — 16 lines added (one new `it` block + leading 5-line comment), zero lines deleted.

## Commit

- **`1bd37d8c`** — `refactor(REFACTOR-04): convert Owner.create to async/await internals`
  - GPG-signed (verified `G` via `git log -1 --pretty=%G?`).
  - On branch `thinx-staging`. **NOT pushed** (per `<execution_rules>` of Plan 07-2).
  - Diff: 2 files, 151 insertions, 113 deletions.

## Phase 7 Progress

| Plan | Method | Commit | Status |
|------|--------|--------|--------|
| 07-1 | 18 non-top-5 methods + 6-of-7 strict-equality | `1aa92fe5` | DONE |
| **07-2** | **`Owner.create`** + **7-of-7 strict-equality** + behavior-lock test | **`1bd37d8c`** | **DONE** |
| 07-3 | `Owner.delete` | — | PENDING |
| 07-4 | `Owner.update` | — | PENDING |
| 07-5 | `Owner.password_reset` | — | PENDING |
| 07-6 | `Owner.set_password` | — | PENDING |

After Plan 07-2, the cumulative Phase 7 goal-backward truths now stand at:
- **Truth #1 (async/await coverage):** 19 of 23 methods converted (18 from Plan 07-1 + `create` from Plan 07-2). 4 top-5 methods remain (`delete`, `update`, `password_reset`, `set_password`).
- **Truth #2 (strict-equality sweep):** CLOSED. `grep` returns zero non-strict comparisons in owner.js.
- **Truth #3 (signature preservation):** All public signatures intact across both plans. Zero caller-side changes in any router or internal module.
- **Truth #4 (SEC-PII-01 preservation):** 28/28 redaction sites preserved.

## Self-Check: PASSED

- File `lib/thinx/owner.js` exists and contains `async create(body, send_activation, res, callback) {` at line 803: FOUND
- File `spec/jasmine/02-OwnerSpec.js` exists and contains `REFACTOR-04 (07-2)` marker: FOUND
- Commit `1bd37d8c` exists in `git log` with subject `refactor(REFACTOR-04): convert Owner.create to async/await internals`: FOUND
- Commit `1bd37d8c` GPG-signature status `G`: FOUND
- Strict-equality grep returns 0 lines: FOUND (gate 3)
- Top-5 untouched (delete/update/password_reset/set_password): FOUND (gate 5)
- SEC-PII-01 count 28 == 28: FOUND (gate 6)
- 4 callers in router.auth/user/google/github unmodified: FOUND (`git diff HEAD~1 HEAD --name-only` returns only the two task files)
