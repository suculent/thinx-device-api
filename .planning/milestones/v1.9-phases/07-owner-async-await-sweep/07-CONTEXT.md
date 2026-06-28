# Phase 7 Context: owner.js Async/Await Sweep

**Created:** 2026-06-02
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** REFACTOR-04 (+ folded-in continuation of REFACTOR-02 scope)

## Domain

Convert the ~74 callback patterns in `lib/thinx/owner.js` to async/await with zero observable behavior change. Preserve every public method signature — callers in `lib/router.*.js`, `lib/thinx/device.js`, `lib/thinx/messenger.js`, and `lib/middleware/requireAdmin.js` keep their callback-style invocations unchanged. The conversion is INTERNAL to owner.js.

Additionally: fold in the deferred strict-equality cleanup at lines `:277` (mqtt_key), `:515` (password_reset_init), `:572` (atomic) — these were carved out of Phase 5's REFACTOR-02 (scoped strictly to `password_reset` per the original requirement) and are now within scope as part of the owner.js sweep.

Out of scope: changing public method signatures (e.g., to native async functions); refactoring the routers; touching code outside `lib/thinx/owner.js`.

## Canonical Refs

Downstream agents (researcher, planner, executor) MUST consult these:

- `.planning/ROADMAP.md` — Phase 7 entry at lines 66–75 (success criteria 1–4)
- `.planning/REQUIREMENTS.md` — REFACTOR-04 at line 18 (validation: `node --check` clean, lint passes, no callback-style chain in touched paths, call-graph spot-check on top-5)
- `.planning/PROJECT.md` — compatibility guardrail (no signature breaks on legacy-console-compatible routes)
- `.planning/STATE.md` — current state (Phase 5 + 6 just landed; both verified)
- `.planning/phases/05-backend-hygiene-cheap-sweeps/05-CONTEXT.md` — REFACTOR-02 decision block and "Deferred Ideas — owner.js full strict-equality sweep" entry that this phase now closes
- `.planning/phases/06-websocket-surface-hardening/06-CONTEXT.md` — test-env ACCEPT pattern (carries forward unchanged)
- `lib/thinx/owner.js` — the target file (1161 lines, 74 callback occurrences)
- `lib/router.auth.js`, `lib/router.user.js`, `lib/router.profile.js`, `lib/router.admin.js`, `lib/router.google.js`, `lib/router.github.js`, `lib/router.mesh.js`, `lib/router.gdpr.js` — public callers (read for the call-graph spot-check)
- `lib/thinx/device.js`, `lib/thinx/messenger.js`, `lib/middleware/requireAdmin.js` — internal callers
- `package.json` — `"nano": "^10.1.4"` — nano 10.x has native promise API; can be used directly (no `util.promisify` needed)
- `spec/jasmine/ZZ-*` files — existing Owner-touching specs (`ZZ-AppSessionUserSpec.js`, `ZZ-RouterPasswordResetSpec.js`, `02-OwnerSpec.js` after Phase 5's edit, etc.) — these are the existing behavioral gates

## Code Context

### File shape
- `lib/thinx/owner.js`: 1161 lines, single `Owner` class export.
- 74 occurrences of `callback(...)` invocations.
- ZERO existing `async` / `await` — file is uniformly callback-style.

### Public methods + line ranges (verified via grep on post-Phase-5/6 state)

| Method | Line | Used by | Fanout (callers) |
|--------|------|---------|------------------|
| `mqtt_key` | 272 | router.auth.js:219 | 1 |
| `profile` | 302 | router.admin.js:52, router.profile.js:15, device.js:400, requireAdmin.js:9 | 4 |
| `process_update` | 340 | internal | — |
| `apply_update` | 390 | internal | — |
| `update` | 410 | router.profile.js:33, router.gdpr.js:135 | 2 |
| `validate` | 440 | internal | — |
| `password_reset` | 459 | router.user.js:27 | 1 |
| `password_reset_init` | 502 | router.user.js:46 | 1 |
| `activate` | 541 | internal | — |
| `atomic` | 564 | internal (used heavily) | — |
| `set_password_reset` | 581 | internal | — |
| `set_password_activation` | 620 | internal | — |
| `set_password` | 656 | (top-5) | TBD by researcher |
| `delete` | 681 | router.user.js:126 | 1 |
| `create_default_acl` | 705 | router.auth.js:229 | 1 |
| `create_mqtt_access` | 726 | internal | — |
| `create_default_mqtt_apikey` | 778 | router.auth.js:223 | 1 |
| `create` | 805 | router.auth.js:70, router.google.js:59, router.github.js:90, router.user.js:133 | 4 |
| `createMesh` | 975 | router.mesh.js:85 | 1 |
| `deleteMeshes` | 1026 | router.mesh.js:32 | 1 |
| `updateLastSeen` | 1127 | router.auth.js:99, router.google.js:224 | 2 |

**Top-5 highest-fanout (per ROADMAP.md success criterion 3):** `create`, `delete`, `update`, `password_reset`, `password_set` (named `set_password` in code — likely the same; researcher must confirm).

### nano promise API (already available)
`package.json` pins `"nano": "^10.1.4"`. Nano 10.x supports native promises — all `this.userlib.<method>(...)` calls work without a callback and return a Promise. No `util.promisify` needed.

Example mechanical transform (the canonical pattern):

**Before:**
```js
this.userlib.view("users", "owners_by_resetkey", { key: reset_key, include_docs: true }, (err, body) => {
  if (err) { return callback(false, err); }
  if (body.rows.length === 0) { return callback(false, "user_not_found"); }
  // ...
});
```

**After:**
```js
try {
  const body = await this.userlib.view("users", "owners_by_resetkey", { key: reset_key, include_docs: true });
  if (body.rows.length === 0) { return callback(false, "user_not_found"); }
  // ...
} catch (err) {
  return callback(false, err);
}
```

Notes:
- The outer method's signature stays `methodName(args, callback)` (NOT `async methodName(args)`) — public callers don't change. The method becomes `async methodName(args, callback) { try { await ... callback(true, x); } catch (err) { callback(false, err); } }`.
- Nested callbacks inside the same method become sequential `await` calls, often eliminating Christmas-tree indentation.
- Existing redaction/audit-log calls (`alog.log(...)`, `Util.redactToken(...)`, `Util.redactEmail(...)` — landed in Phase 1 SEC-PII-01) MUST stay intact in their original positions in the converted code.

### Strict-equality cleanup targets (folded in from Phase 5 deferred)

Three remaining non-strict comparisons in owner.js after Phase 5's REFACTOR-02:
- Line `:277` — inside `mqtt_key`: `if (api_keys.length == 0)` → `=== 0`
- Line `:515` — inside `password_reset_init`: `if (body.rows.length != 1)` → `!== 1`
- Line `:572` — inside `atomic`: `if ((action_name == "password_reset") && (process.env.ENVIRONMENT == "test"))` → `===` on both

All three are inside non-top-5 methods that Plan 07-1 will already be touching for the async/await conversion. Fix in the same commit as that method's async/await conversion.

(Additional non-strict comparisons may exist at lines 646, 790, 930, 1002 per Phase 5's grep output — researcher / planner should sweep them all in.)

## Decisions

### Granularity: Two-phase approach (internals first, then top-5 methods individually)

**Plan 07-1 — Internals conversion (one atomic commit):**
- Convert all NON-TOP-5 methods in `lib/thinx/owner.js` from callback-style internals to async/await using nano 10's native promise API.
- Methods touched: `mqtt_key`, `profile`, `process_update`, `apply_update`, `validate`, `password_reset_init`, `activate`, `atomic`, `set_password_reset`, `set_password_activation`, `create_default_acl`, `create_mqtt_access`, `create_default_mqtt_apikey`, `createMesh`, `deleteMeshes`, `updateLastSeen` (plus any others discovered by researcher).
- Public signatures preserved (each method remains `methodName(args, callback)`; only internals become `async`).
- Strict-equality fold: fix `:277`, `:515`, `:572` (and any other `!=`/`==` discovered) in this commit.
- Commit: `refactor(REFACTOR-04): convert owner.js non-top-5 methods to async/await + strict-equality sweep`

**Plans 07-2 through 07-6 — Top-5 methods individually (5 atomic commits):**
- One commit per top-5 method: `create`, `delete`, `update`, `password_reset`, `set_password`.
- Each commit converts that method's internals to async/await + adds a call-graph spot-check comment in the method body documenting which routers/internals call it (per ROADMAP.md success criterion 3).
- If the method had a stale `!=`/`==` that falls in its body, fold the strict-equality fix into the same commit.
- Public signature preserved for each.
- Commits (in order):
  - 07-2: `refactor(REFACTOR-04): convert Owner.create to async/await internals`
  - 07-3: `refactor(REFACTOR-04): convert Owner.delete to async/await internals`
  - 07-4: `refactor(REFACTOR-04): convert Owner.update to async/await internals`
  - 07-5: `refactor(REFACTOR-04): convert Owner.password_reset to async/await internals`
  - 07-6: `refactor(REFACTOR-04): convert Owner.set_password to async/await internals`

**Why this granularity:**
- Top-5 methods carry the highest behavioral risk (4+ callers each for `profile` / `create`; reset/auth-critical flows for `password_reset` / `set_password`; account lifecycle for `delete` / `update`). Isolating them per-commit gives CI a bisect-friendly history if anything regresses.
- Plan 07-1 bundles ~15 lower-fanout methods in one commit because the conversion is uniform and mechanical; lower bisect granularity is acceptable for these methods.
- Plan 07-1 is ALSO where the strict-equality fold lands (lines 277, 515, 572) because all three are in non-top-5 methods.
- Estimated final commit count: 6 atomic refactor commits + 1 SUMMARY commit per plan if using the Phase 5 pattern. Could be 1 final summary commit + 1 final ROADMAP/STATE/REQUIREMENTS verify commit per the Phase 5/6 close-out pattern.

### Strict-equality fold

- **Decision:** Fold the deferred strict-equality sweep (lines 277, 515, 572 — and any others discovered) into Phase 7. Net: zero `!=`/`==` non-strict comparisons remain in `owner.js` after Phase 7.
- **Implementation:** Each strict-equality fix lands in the SAME commit as the async/await conversion of its containing method (all three are in non-top-5 methods, so all three land in Plan 07-1).
- **Validation:** `grep -nE "[^=!<>]!=[^=]|[^=!<>]==[^=]" lib/thinx/owner.js` returns exactly 0 lines after Phase 7 (was 7 after Phase 5).
- **No separate plan for this** — it's a passive bonus inside the Plan 07-1 commit. The commit subject explicitly mentions "+ strict-equality sweep" so audit traceability is preserved.

### Test-environment ACCEPT pattern carries forward

Same constraint as Phase 5 + 6: `npm test` aborts on missing `/mnt/data/conf/config.json` locally. Static gates authoritative locally (`node --check`, `grep`); CI-side Jasmine inside the Docker test image is the canonical behavioral green-gate for the ZZ-* suite. The call-graph spot-check (success criterion 3) is verifier-side, performed by reading the post-conversion code + comparing callsite expectations.

Document as ACCEPT deviation in each SUMMARY.md following the Phase 5/6 pattern.

## Coordination

- Phase 7 sequences AFTER Phase 5 (and effectively after Phase 6 since they both just landed on `thinx-staging`). Phase 5's REFACTOR-02 already fixed line 492 (`reset_key !== user_reset_key`); Phase 7 must NOT regress that fix during the async/await conversion of `password_reset` (Plan 07-5).
- Phase 7 is NOT a Phase 8 prerequisite per ROADMAP.md (Phase 8 depends on Phase 7 — owner.js cleanup before auth/lifecycle work), so Phase 8 will land on top of Phase 7's clean owner.js.
- Phase 7 work touches only `lib/thinx/owner.js`. No cross-file edits except potentially adding a regression spec.

## Deferred Ideas (captured, NOT in scope)

- **Convert owner.js public signatures to native async (no callback parameter)** — the REQUIREMENT explicitly locks signatures to callback-style. A future phase could migrate callers + signatures together. v2 candidate.
- **Promisify Util / sanitka / appkey** — other helpers used by owner.js have similar callback shapes. Could be a follow-up "internal promise sweep" for the rest of `lib/thinx/`. v1.10 candidate.
- **Owner unit-test expansion** — `02-OwnerSpec.js` is light. Adding unit tests for each method's callback contract (success path + each error path) would lock the post-conversion behavior. Quick-task-sized; could land alongside or after Phase 7.

## Open Questions for Researcher / Planner

- The exact set of methods to bundle in Plan 07-1 vs. the top-5 carve-outs needs a final researcher pass. The `device.js:45 / messenger.js:58 / requireAdmin.js:9` callers also use `profile` (top-5 candidate by fanout). Researcher should confirm: is `set_password` in the top-5, or should it be `password_reset_init` instead (which has different test coverage)? Default per the ROADMAP success criterion is `set_password`.
- Should the planner include a defensive grep gate in each commit's verify ("no remaining callback-style `this.userlib.*(..., (err, ...)) => ...` in the touched method body")?
- Should a new `02-OwnerSpec.js` describe block be added that asserts each top-5 method's callback contract (success path + each failure callback message) BEFORE conversion (as a behavior-locking test, per the Phase 5 pattern with the REFACTOR-02 unit)? Recommendation: YES for top-5 methods — adds 5 small `it()` blocks; gives CI a clean before/after green-gate.

## Constraints

- No public method signature change in `lib/thinx/owner.js` — callers in `router.*.js` / `device.js` / `messenger.js` / `requireAdmin.js` stay callback-style and unmodified.
- All commits GPG-signed unless an explicit per-session unsigned authorization is granted.
- `node --check lib/thinx/owner.js` MUST exit 0 after every commit.
- ESLint MUST pass on the modified file after every commit (existing project lint config — verify with `npm run lint` if available; `package.json:22` defines `lint`).
- Test-env constraint: local `npm test` aborts on missing config; CI is canonical Jasmine gate. Document ACCEPT per Phase 5/6.
- Existing SEC-PII-01 redaction calls (`Util.redactToken`, `Util.redactEmail`, `alog.log(...)` audit calls) MUST stay intact in their original positions during the conversion.
