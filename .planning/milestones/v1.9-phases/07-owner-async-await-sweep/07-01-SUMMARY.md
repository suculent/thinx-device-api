---
phase: 07-owner-async-await-sweep
plan: 01
subsystem: owner
tags:
  - refactor
  - async-await
  - owner
  - strict-equality
  - couchdb
  - nano
requirements:
  - REFACTOR-04
requires:
  - lib/thinx/owner.js (pre-Phase-7 callback-style state)
  - nano 10.1.4 native promise API
provides:
  - lib/thinx/owner.js with 18 non-top-5 methods using async/await internals
  - 6 of 7 strict-equality fixes folded (only deferred line inside Owner.create remains)
affects:
  - lib/router.auth.js (unchanged — caller-side callback contract preserved)
  - lib/router.user.js (unchanged)
  - lib/router.profile.js (unchanged)
  - lib/router.admin.js (unchanged)
  - lib/router.google.js (unchanged)
  - lib/router.github.js (unchanged)
  - lib/router.mesh.js (unchanged)
  - lib/router.gdpr.js (unchanged)
  - lib/thinx/device.js (unchanged)
  - lib/thinx/messenger.js (unchanged)
  - lib/middleware/requireAdmin.js (unchanged)
tech_stack:
  added: []
  patterns:
    - "async methodName(args, callback) { try { ... callback(true, x); } catch (err) { callback(false, err); } }"
    - "nano 10 native promise API via `await this.userlib.<verb>(...)` with no callback arg"
key_files:
  created: []
  modified:
    - lib/thinx/owner.js
decisions:
  - "Outer public signatures stay as `methodName(args, callback)` — only `async` is prefixed; callers are unchanged."
  - "Out-of-scope helpers (`this.apikey.*`, `this.auth.*`, `this.acl.*`, `this.deploy.*`, `mg.messages.create`, `new ACL(...).load/.commit/.addTopic/.prune`) stay callback-style at their call sites; they're owned by other modules."
  - "`process_update` kept non-async — pure data shaper with no userlib calls."
  - "`create_default_acl` and `create_mqtt_access` gain `async` prefix even though no `await` is used inside (both only delegate to out-of-scope callback-style helpers). The `async` prefix unifies the public API style for the rest of the class and is cost-free."
  - "`updateLastSeen` retry-on-conflict logic preserved bit-for-bit (recursive call with repeated=true after deleting _rev)."
  - "`create_mqtt_access` 2026-05-31 OOM-incident compensation guard (settled flag + 5s setTimeout + revoke-on-throw) preserved exactly."
  - "Phase 5 REFACTOR-02 anti-regression: `reset_key !== user_reset_key` inside `password_reset` at line 492 remains strict (password_reset is top-5, not touched here)."
metrics:
  duration_minutes: ~12
  tasks_completed: 4
  files_modified: 1
  lines_inserted: 298
  lines_deleted: 297
  net_line_delta: +1
  callback_count_before: 74
  callback_count_after: 76
  sec_pii_01_call_count_before: 28
  sec_pii_01_call_count_after: 28
  non_strict_comparisons_before: 7
  non_strict_comparisons_after: 1
completed_date: 2026-06-03
---

# Phase 7 Plan 01: owner.js Non-top-5 Async/Await + Strict-Equality Sweep — Summary

## One-Liner

Converted 18 non-top-5 methods in `lib/thinx/owner.js` from callback-style to async/await using nano 10's native promise API, folded in 6 of 7 deferred strict-equality fixes, all public signatures preserved.

## Methods Converted (18)

| Method | Line (post) | Conversion Pattern |
|--------|-------------|-------------------|
| `mqtt_key` | 272 | `async` prefix; outer apikey.list stays callback-style (out-of-scope helper); fold `=== 0` at line 277 |
| `profile` | 302 | Full `await this.userlib.get(...)` in try/catch |
| `apply_update` | 390 | Two sequential awaits (`get` then `atomic`) split into two try/catch blocks, each preserving its dedicated `alog.log` call |
| `validate` | 440 | Single `await this.userlib.view(...)` in try/catch; semantics preserved (no rows / too many rows / undefined body → callback(false)) |
| `password_reset_init` | 502 | `await this.userlib.view(...)` in try/catch; fold `!== 1` at line 515; `Util.redactEmail(email)` preserved |
| `activate` | 541 | `.then/.catch` → `await ... try/catch`; `Util.redactToken(ac_key)` preserved |
| `atomic` | 565 | `await this.userlib.atomic(...)` in try/catch; fold both `===` at line 572 (test-env hook preserved) |
| `set_password_reset` | 581 | `await this.userlib.view(...)` in try/catch; `Util.redactToken(rbody.reset_key)` preserved; delegates to `this.atomic(...)` callback-style |
| `set_password_activation` | 619 | `await this.userlib.view(...)` in try/catch; fold `===` at line 646; delegates to `this.atomic(...)` callback-style |
| `create_default_acl` | 703 | `async` prefix only — body uses ACL helpers (out-of-scope, stays callback-style) |
| `create_mqtt_access` | 724 | `async` prefix only — body uses apikey/auth/acl helpers and the 2026-05-31 OOM compensation guard, both stay verbatim |
| `create_default_mqtt_apikey` | 776 | `async` prefix; apikey.list stays callback-style; fold `=== 0` at line 790 |
| `createMesh` | 973 | Two sequential awaits (`get` then `atomic`) in two try/catch blocks; fold `===` at line 1002; both `alog.log` calls preserved |
| `deleteMeshes` | 1023 | Outer `get` → await in try/catch; acl.load callback becomes `async`; inner `atomic` → await in try/catch; all 3 `alog.log` calls preserved |
| `listMeshes` | 1086 | `await this.userlib.get(...)` in try/catch |
| `trackUserLogin` | 1111 | `async` (no callback param); `await this.userlib.atomic(...)` in try/catch; `alog.log` preserved |
| `updateLastSeen` | 1123 | `async` (no callback param); error captured via try/catch with explicit `let error = null` for retry semantics; retry-on-conflict path preserved exactly |
| `addGitHubAccessToken` | 1151 | `await this.userlib.atomic(...)` in try/catch; both `alog.log` calls preserved |

Note: `process_update` (line 340) was kept non-async per the plan — it's a pure data shaper with no `this.userlib.*` calls.

## Top-5 Methods NOT Touched (deferred to Plans 07-2..07-6)

Confirmed by `git diff` — zero changes to signatures or bodies:

| Method | Line | Plan |
|--------|------|------|
| `delete` | 681 | 07-3 |
| `password_reset` | 459 | 07-5 |
| `update` | 410 | 07-4 |
| `set_password` | 654 | 07-6 |
| `create` | 803 | 07-2 |

The `password_reset` body still contains the Phase 5 REFACTOR-02 strict comparison `reset_key !== user_reset_key` at line 492 — verified untouched.

## Strict-Equality Fold (6 of 7)

Pre-conversion grep returned 7 lines (277, 515, 572, 646, 790, 930, 1002). Post-conversion grep returns exactly 1 line — the deferred `err_u.statusCode == 409` inside `Owner.create` at the new line 928 — which is locked for Plan 07-2.

| Line (pre) | Method | Pre | Post |
|-----------|--------|-----|------|
| 277 | mqtt_key | `api_keys.length == 0` | `=== 0` |
| 515 | password_reset_init | `body.rows.length != 1` | `!== 1` |
| 572 | atomic | `action_name == "password_reset"` | `===` |
| 572 | atomic | `process.env.ENVIRONMENT == "test"` | `===` |
| 646 | set_password_activation | `process.env.ENVIRONMENT == "test"` | `===` |
| 790 | create_default_mqtt_apikey | `keyObj.alias.indexOf(...) == 0` | `=== 0` |
| 1002 | createMesh | `mesh.mesh_id == newMesh.mesh_id` | `===` |
| 930 → 928 | create (deferred) | `err_u.statusCode == 409` | unchanged (Plan 07-2) |

## SEC-PII-01 Redaction Calls (28 sites, preserved verbatim)

`grep -c "alog.log\|Util.redactToken\|Util.redactEmail" lib/thinx/owner.js` returns 28 before and 28 after. All redaction calls remain at their original positions inside the converted method bodies, per the v1.0 Phase 2 contract.

## Validation Gates

| Gate | Result |
|------|--------|
| 1. `node --check lib/thinx/owner.js` | PASS (exits 0) |
| 2. Strict-equality grep returns exactly 1 line (the deferred Owner.create line) | PASS — only `err_u.statusCode == 409` at line 928 remains |
| 3. Public-signature preservation — every non-top-5 async method ends with `, callback)` (or `()` for `trackUserLogin` / `updateLastSeen` which take no callback by design) | PASS (18 matches verified) |
| 4. Top-5 untouched in `git diff` | PASS (zero matches for `^[-+]\s*(async\s+)?(create|delete|update|password_reset|set_password)\s*\(`) |
| 5. SEC-PII-01 call count `>= 28` baseline | PASS (= 28) |
| 6. `npm run lint` clean on `lib/thinx/owner.js` | PASS (3 pre-existing errors in `statistics.js` and `ZZ-WebSocketLifecycleSpec.js` — unrelated) |
| 7. Callback-residue check — no `this.userlib.X(args, =>` in converted methods | PASS (zero matches; remaining callback-style `this.userlib.*` calls are all inside top-5 methods at lines 469, 683, 686, 825, 850, 926) |
| 8. Phase 5 REFACTOR-02 anti-regression: `reset_key !== user_reset_key` still strict at line 492 | PASS |
| 9. Commit GPG-signed (`git log --pretty=%G?` returns `G`) | PASS |
| 10. Diff scope: `git diff --stat` shows only `lib/thinx/owner.js` (1 file, 298 insertions, 297 deletions) | PASS |

## Deviations from Plan

### Auto-fixed / micro-deviations

**1. [Rule 1 — semantics preservation] `validate` callback inversion**

- **Found during:** Task 2, method 4 (`validate`).
- **Issue:** The pre-conversion code had an awkward `xerr !== null` check after assigning `xerr = new Error("Too many users found.")` when `db_body` had too many rows. In the async/await form, this dual-purpose `xerr` variable becomes confusing — the new `try { ... } catch (_xerr) { callback(false); }` structure cannot naturally model "set xerr after the call succeeded" without re-throwing.
- **Fix:** Inlined the two-branch logic — inside the try block, after the successful `await`, explicit `return callback(false)` on either `undefined db_body` or `db_body.rows.count > 1`. The catch handles real errors. Semantics are identical to the pre-conversion code: any of (error / undefined body / too many rows) calls `callback(false)`; success calls `callback(db_body)`.
- **Tracked as:** Rule 1 — bug-shape cleanup (technically a clarity-preserving refactor that locks the existing semantics).
- **Files modified:** `lib/thinx/owner.js` (the `validate` method).
- **Commit:** `1aa92fe5`.

**2. [Rule 1 — error preservation] `apply_update` split into two try/catch blocks**

- **Found during:** Task 2, method 3 (`apply_update`).
- **Issue:** The original code had nested `userlib.get` → `userlib.atomic`, where each had its own `alog.log` call with a different error message. A naive single try/catch around both awaits would conflate the two error paths and call the wrong `alog.log` line for one of them.
- **Fix:** Split into two sequential try/catch blocks — the first wraps `await this.userlib.get(owner)` and on error calls `alog.log(owner, "Profile update error " + error, "error")` + `callback(false, error)`; the second wraps `await this.userlib.atomic(...)` and on error calls `alog.log(owner, "Profile update failed.", "error")` + `callback(false, "profile_update_failed")`. The success branch (`alog.log("Profile updated successfully.")` + `callback(true, update_value)`) stays at the end of the second try.
- **Tracked as:** Rule 1 — preserves the distinct error-reporting semantics of the original callback nesting.
- **Files modified:** `lib/thinx/owner.js` (the `apply_update` method).
- **Commit:** `1aa92fe5`.

**3. [Rule 1 — error preservation] `updateLastSeen` explicit `error = null` for retry semantics**

- **Found during:** Task 2, method 17 (`updateLastSeen`).
- **Issue:** The pre-conversion code used `error !== null` checks in three branches AND a retry path that depended on `error.toString().indexOf("conflict")`. A try/catch alone would lose the `error === null` baseline that the retry-decision branches depend on.
- **Fix:** Used `let error = null;` declared before the try block; the catch sets `error = e;`. The downstream `if (error !== null)` branches now read identically to the pre-conversion code, including the retry-on-conflict path (`this.updateLastSeen(doc, true)` if not yet `repeated`).
- **Tracked as:** Rule 1 — preserves the retry-on-conflict primitive that production depends on (CouchDB `_rev` conflict handling).
- **Files modified:** `lib/thinx/owner.js` (the `updateLastSeen` method).
- **Commit:** `1aa92fe5`.

**4. [Rule 2 — defensive `try/catch` scope tightening] `password_reset_init` log message stripped of `body` reference inside catch**

- **Found during:** Task 2, method 5 (`password_reset_init`).
- **Issue:** The pre-conversion code's error log line read `"Found " + (body && body.rows ? body.rows.length : 0) + " users matching this e-mail."` — but in the await form, when the await throws, `body` is `undefined` (never assigned). The defensive `body && body.rows ? ... : 0` guard collapses to `0`, so the post-conversion log line correctly reads `"Found 0 users matching this e-mail."` — semantically equivalent for the error path and avoids a TDZ trap.
- **Fix:** Replaced the dynamic substitution with the hard-coded `"Found 0 users matching this e-mail."` (which is what the guard would have evaluated to anyway in the error path).
- **Tracked as:** Rule 2 — defensive correctness (avoids ReferenceError potential if the lint were to forbid `var` hoisting).
- **Files modified:** `lib/thinx/owner.js` (the `password_reset_init` catch block).
- **Commit:** `1aa92fe5`.

No other deviations. Plan executed as written.

### Test-env ACCEPT (carries forward from Phase 5/6)

Local `npm test` aborts on missing `/mnt/data/conf/config.json` — the canonical Jasmine behavioral green-gate runs CI-side inside the Docker test image. Static gates (`node --check`, grep, lint) are authoritative locally and all 10 listed above pass. Per `07-CONTEXT.md` and the Phase 5/6 patterns, document as ACCEPT — CI is the canonical green-gate for this commit.

## Files Modified

- `lib/thinx/owner.js` — 298 insertions, 297 deletions, net +1 line (1161 → 1162 total).

## Commit

- `1aa92fe5` — `refactor(REFACTOR-04): convert owner.js non-top-5 methods to async/await + strict-equality sweep`
  - GPG-signed (verified `G` via `git log --pretty=%G?`).
  - On branch `thinx-staging`. NOT pushed (per `<execution_rules>`).

## Next Steps (Plans 07-2 through 07-6)

Each upcoming plan converts one top-5 method to async/await internals, preserves its public callback signature, and folds in any strict-equality fix inside its body (only `Owner.create` has one left — line 928). Order: 07-2 `create`, 07-3 `delete`, 07-4 `update`, 07-5 `password_reset`, 07-6 `set_password`. After 07-2 lands, `grep -nE '[^=!<>]!=[^=]|[^=!<>]==[^=]' lib/thinx/owner.js` should return zero lines, closing the deferred Phase 5 REFACTOR-02 sweep entirely.

## Self-Check: PASSED

- File `lib/thinx/owner.js` exists with expected modifications: FOUND
- Commit `1aa92fe5` exists in `git log`: FOUND
- SUMMARY.md at `.planning/phases/07-owner-async-await-sweep/07-01-SUMMARY.md`: FOUND (this file)
- Top-5 signatures preserved (zero matches in diff): FOUND (gate 4)
- SEC-PII-01 redaction count preserved (28 == 28): FOUND
- Phase 5 anti-regression `reset_key !== user_reset_key` line 492: FOUND
