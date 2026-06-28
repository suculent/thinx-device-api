---
phase: 05-backend-hygiene-cheap-sweeps
plan: 02
subsystem: backend
tags: [refactor, strict-equality, password-reset, owner-js, security]

# Dependency graph
requires:
  - phase: v1.0 GA (shipped 2026-05-27)
    provides: stable lib/thinx/owner.js password_reset flow (:459-500) and the ZZ-AppSessionUserSpec.js / ZZ-RouterPasswordResetSpec.js regression specs that lock the public reset_key contract
  - phase: 05-01 (Plan 1 of Wave 1, commit 6ab471d3)
    provides: independent — REFACTOR-01 touched thinx-core.js only; no overlap, but completes the wave context for the wave's atomicity contract
provides:
  - Strict-equality compare `reset_key !== user_reset_key` at lib/thinx/owner.js:492 (single-character hardening edit inside the password_reset method body)
  - New unit regression `(12) REFACTOR-02: password_reset rejects string reset_key when stored value is a number (strict equality)` in spec/jasmine/02-OwnerSpec.js — locks in `"123" !== 123` → (false, "invalid_reset_key")
affects:
  - Phase 7 (REFACTOR-04 — owner.js callback → async/await sweep) — when password_reset is rewritten to async/await, the strict compare MUST be preserved
  - Future phase (per CONTEXT.md "Deferred Ideas — owner.js full strict-equality sweep") — the remaining 7 non-strict comparisons in owner.js (`:277, :515, :572, :646, :790, :930, :1002`) are the cleanup target; this plan deliberately did NOT touch them

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-character-edit security hardening: when a `!=`/`==` lives on a security-sensitive boundary, replace with `!==`/`===` and add a unit covering the type-coercion case the loose form was masking — even when current callers all pass the expected type."
    - "Test-only monkey-patch for live-DB spec files: when a spec file lacks an existing mocking pattern, scope a local monkey-patch to a single it-block and restore the original in the callback. Avoids restructuring the spec file or introducing new test infrastructure."

key-files:
  created: []
  modified:
    - lib/thinx/owner.js
    - spec/jasmine/02-OwnerSpec.js

key-decisions:
  - "Replaced `reset_key != user_reset_key` with `reset_key !== user_reset_key` at lib/thinx/owner.js:492 — exact one-character edit per the Phase 5 REFACTOR-02 decision block in CONTEXT.md."
  - "Did NOT touch the other 7 non-strict comparisons in owner.js (:277, :515, :572, :646, :790, :930, :1002) — they are explicitly out of Phase 5 scope per CONTEXT.md REFACTOR-02 decision (scope strictly limited to the password_reset method body :459-500)."
  - "Wrote the regression test with a scoped monkey-patch on `user.userlib.view` (restored in the test's callback) because 02-OwnerSpec.js otherwise runs against a live CouchDB via _envi.json — the new test needs deterministic control of the stored doc shape (numeric reset_key) which would be impossible to seed reliably through the live fixtures."
  - "Left the pre-existing `.planning/STATE.md` working-tree change unstaged per <execution_rules> — the orchestrator owns that at phase wrap-up."

patterns-established:
  - "Strict-equality hardening edits ship with a regression test even when production callers don't currently exercise the masked case. Rationale: documenting intent at the spec layer prevents a future refactor (e.g., Phase 7's REFACTOR-04 async/await sweep) from regressing to the loose form by accident."

requirements-completed: [REFACTOR-02]

# Metrics
duration: ~10min
completed: 2026-06-02
---

# Phase 5 Plan 2: REFACTOR-02 — Strict Equality in Owner.password_reset Summary

**Replaced the single non-strict `!=` at `lib/thinx/owner.js:492` with `!==` inside the `password_reset` method body and added a regression test in `spec/jasmine/02-OwnerSpec.js` covering the string-vs-number coercion case the loose compare was silently accepting — zero observable behavior change for currently-valid inputs.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-02T19:11:00Z (orchestrator hand-off into Plan 05-02 execution)
- **Completed:** 2026-06-02T19:14:10Z (GPG-signed commit landed at `229543f3`)
- **Tasks:** 3 of 3 (1 source edit + 1 spec append + 1 verify-and-commit)
- **Files modified:** 2 (`lib/thinx/owner.js` + `spec/jasmine/02-OwnerSpec.js`)

## Accomplishments

- Changed `if (reset_key != user_reset_key) {` to `if (reset_key !== user_reset_key) {` at `lib/thinx/owner.js:492` — the single non-strict comparison inside the body of the `password_reset` method (the method that callers in `lib/router.auth.js` invoke for reset_key validation).
- Preserved every other character in `owner.js` — pre/post diff is exactly 1 insertion (+) and 1 deletion (−); the surrounding lines (`let user_reset_key = user.reset_key;` above and `console.log("☣️ [error] reset_key does not match");` below) are byte-identical to HEAD.
- Added a new Jasmine `it()` block to `spec/jasmine/02-OwnerSpec.js` named `(12) REFACTOR-02: password_reset rejects string reset_key when stored value is a number (strict equality)`. The test monkey-patches `user.userlib.view` to return a deterministic `{ rows: [{ doc: { reset_key: 123 } }] }`, invokes `user.password_reset(owner, "123", ...)`, restores `user.userlib.view` to the original inside the callback, and asserts both `success === false` and `message === "invalid_reset_key"`.
- Landed as one atomic GPG-signed commit (`229543f3`) touching exactly the two files declared in the plan's `files_modified`.

## Task Commits

Tasks 1 + 2 + 3 were intentionally collapsed into one atomic commit per the plan's Task 3 instruction: "Two files modified (`lib/thinx/owner.js` + `spec/jasmine/02-OwnerSpec.js`); both belong in the same commit because the test was written against the strict-equality behavior. Single atomic GPG-signed commit." This matches CONTEXT.md's "one atomic commit per REFACTOR-NN" recommendation.

1. **Task 1: Replace `!=` with `!==` at `lib/thinx/owner.js:492`** — code change staged
2. **Task 2: Add `(12) REFACTOR-02` regression test in `02-OwnerSpec.js`** — spec change staged
3. **Task 3: Run reset_key flow specs + commit REFACTOR-02 atomically** — `229543f3` (`refactor`)

**Full SHA:** `229543f3e7b66adbddd4855ea435e64c21015648`
**Signature:** Good signature from RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F` (Matej Sychra <suculent@me.com>)

## Files Created/Modified

- `lib/thinx/owner.js` — Single-character edit at line 492 inside the `password_reset` method body: `!=` → `!==`. Diff stat: 1 insertion (+), 1 deletion (−). No other line touched.
- `spec/jasmine/02-OwnerSpec.js` — Appended 23 lines: a rationale comment block plus the new `(12) REFACTOR-02:` `it()` block. Diff stat: 23 insertions (+), 0 deletions (−). No existing test modified.

## Decisions Made

Followed the plan and CONTEXT.md REFACTOR-02 decision block exactly:

- **Scope:** Strictly the `password_reset` method body (lines :459-500). The other 7 non-strict comparisons elsewhere in `owner.js` (`:277` in `mqtt_key`, `:515` in `password_reset_init`, `:572` in `atomic`, `:646` in `set_password_activation`, `:790` in `create_default_mqtt_apikey`, `:930` in `create`, `:1002` in `createMesh`) were left untouched — they are explicitly tracked in CONTEXT.md "Deferred Ideas — owner.js full strict-equality sweep" for a later phase (likely folded into Phase 7's REFACTOR-04 async/await sweep).
- **Test fixture pattern:** Used a scoped monkey-patch on `user.userlib.view` rather than introducing a new mock framework or restructuring the spec file. Rationale: `02-OwnerSpec.js` uses live CouchDB via `_envi.json` and a real Redis-backed `Owner` instance — the simplest deterministic way to test the string-vs-number coercion case is to control the doc shape the view returns. The patch is restored in the test's callback so subsequent specs are unaffected, and the test does NOT depend on any state in CouchDB.
- **Test name format:** `(12) REFACTOR-02: ...` — the leading `(12)` continues the file's numeric ordering (last existing test is `(11)`), and the `REFACTOR-02:` prefix makes the test greppable.
- **Surrounding code left untouched:** Did not reformat, did not collapse adjacent whitespace, did not modify any other line in `owner.js` or any other test in `02-OwnerSpec.js`.

## Deviations from Plan

### 1. [Environment limitation, not auto-fix] Task 3 Part A (`npm test` reset_key flow gate) could not run locally

- **Found during:** Task 3 Part A (run Jasmine on `02-OwnerSpec.js` + `ZZ-AppSessionUserSpec.js` + `ZZ-RouterPasswordResetSpec.js`).
- **Issue:** `npm test` aborts immediately with `Error: Config not found in /mnt/data/conf/config.json in environment undefined` at `lib/thinx/globals.js:18` — the THiNX Jasmine harness requires the deployed config layout at `/mnt/data/conf/config.json` plus the full backend stack (CouchDB, Redis, MQTT) that the swarm dev VM and CircleCI provide but this executor clone does not. The `package.json` test script's trailing `|| true` collapses the Jasmine non-start into a wrapper exit-0, so the literal `grep -E "REFACTOR-02.*pass|✓.*REFACTOR-02" /tmp/phase5-02-jasmine.log` gate from the plan's Task 3 acceptance criteria evaluates to zero matches even though no test actually failed — there were simply no spec lines emitted because Jasmine never reached the spec loader.
- **Disposition:** ACCEPT and document (matches how Plan 05-01 handled the identical constraint — see `05-01-SUMMARY.md` Deviation 1). The `<key_constraints>` block in the executor prompt explicitly pre-authorized this disposition. Per the plan's threat model and the CONTEXT.md REFACTOR-02 risk paragraph, the change is character-level strict-equality on a path that always sees strings in current callers (`req.body.reset_key` / `req.query.reset_key` at the router boundary, and CouchDB returns the stored value as a string). The static gates are authoritative:
  - `node --check lib/thinx/owner.js` → exit 0 ✓
  - `node --check spec/jasmine/02-OwnerSpec.js` → exit 0 ✓
  - `grep -n "reset_key !== user_reset_key" lib/thinx/owner.js` → exactly one match at `:492` ✓
  - `awk 'NR>=459 && NR<=500' lib/thinx/owner.js | grep -cE "[^=!<>]!=[^=]|[^=!<>]==[^=]"` → `0` ✓
  - File-wide non-strict count: `7` (was `8` pre-edit, exactly one less — the targeted line) ✓
  - Diff vs HEAD: exactly +1/-1 line in `owner.js` and +23/-0 lines in `02-OwnerSpec.js` ✓
  - Logical trace of new test against post-edit code: `password_reset` enters the `if`-branch under `"123" !== 123` (true), invokes `callback(false, "invalid_reset_key")`, test assertions pass ✓
- **Resolution:** None required at executor time. The canonical green-gate is CircleCI post-push on the merge to `thinx-staging` / `master`, plus the operator-side production smoke (real reset_key round-trip after Swarmpit autoredeploy). The two named integration specs (`ZZ-AppSessionUserSpec.js`, `ZZ-RouterPasswordResetSpec.js`) will run unmodified there.
- **Files modified:** None (verification-only step).
- **Committed in:** N/A.

---

**Total deviations:** 1 environment-limitation deviation (no auto-fixes triggered; no Rule 1/2/3/4 conditions encountered). The static + logical gates fully cover the behavioral claim; CircleCI is the runtime green-gate.

**Impact on plan:** None. The Jasmine local gate was supplementary regression coverage on top of the construct-level proof that the edit is byte-narrow and the new test is byte-correct.

## Issues Encountered

- **Bash multi-step compound truncation:** A single chained bash compound that ran all five Task 1 verification gates emitted only the first three lines of stdout before the tool harness captured an early non-zero exit from a `grep -c` returning 0. Resolved by running each gate as its own bash call (set +e was not enough — splitting calls is cleaner). No effect on the underlying change.
- **Working-tree noise from orchestrator hand-off:** `.planning/STATE.md` was already modified in the working tree at executor entry (orchestrator pre-execution status update from before this plan started). Left unstaged per the `<execution_rules>` "do NOT stage the unrelated `.planning/STATE.md` change in the working tree" directive. It will be picked up by `state.update-progress` / the orchestrator's phase wrap-up.

## User Setup Required

None — no external service configuration changed. The strict-equality compare is purely a code-level hardening; no migration, no DB shape change, no auth flow change. Existing reset_key emails generated by `sendResetEmail` (with the live `app_config.api_url + "/api/user/password/reset?owner=...&reset_key=..."` link) continue to work identically because the `reset_key` query-string param is always a string at the boundary.

## Threat Flags

None — this plan does NOT introduce new security surface. Per the plan's threat model:

- **T-05-04 (Spoofing on reset_key compare):** disposition `mitigate` — post-state is the strict form `!==`. Net effect: the change **closes** the type-coercion bypass class that the loose `!=` was permitting in principle (`"123" != 123` was `false`, meaning string and number were considered equal). No widening; only narrowing.
- **T-05-05 (Tampering on callback shape):** disposition `accept` — callback signature `(success, message_or_payload)` unchanged. All four failure messages (`missing_reset_key`, `user_not_found`, `invalid_reset_key`, raw err) and the success payload `{redirectURL}` unchanged. Public callers in `router.auth.js` unaffected.
- **T-05-06 (Information disclosure on audit-log path):** disposition `accept` — already-redacted via `Util.redactToken(reset_key)` at `:467` per SEC-PII-01 v1.0 Phase 2. This plan did NOT touch the redaction path.
- **T-05-07 (Repudiation on compare-failure branch):** disposition `accept` — audit log unchanged; strict-equality only changes which inputs reach the failure branch (and only for type-coerced inputs that should have failed all along).

## Known Stubs

None. The new test is fully functional — it asserts a concrete invariant under the post-edit semantics. The monkey-patch is a test-local fixture, not a stub or TODO. No placeholder text, no `coming soon`, no empty arrays/objects flowing to UI.

## Next Phase Readiness

- **Wave 1 Plan 05-03 (REFACTOR-05, jshint reclassification) ready:** Independent of this plan — touches `package.json` only.
- **Wave 2 (phase doc-update / state-update) ready:** Will roll up STATE.md / ROADMAP.md / REQUIREMENTS.md after the wave completes.
- **Phase 7 REFACTOR-04 (owner.js callback → async/await):** When that sweep rewrites `password_reset`, the strict-equality compare at the post-rewrite line MUST be preserved. The `(12) REFACTOR-02` regression spec is the locked-in guard.
- **Pre-existing unstaged change (`.planning/STATE.md`):** Orchestrator's pre-execution status update — left unstaged per the plan's explicit staging rule. Will be picked up by `state.update-progress` / SUMMARY-commit work after this plan's executor returns.

## Self-Check: PASSED

- File `lib/thinx/owner.js` present and modified — confirmed via `git log -1 --name-only` (lists `lib/thinx/owner.js`).
- File `spec/jasmine/02-OwnerSpec.js` present and modified — confirmed via `git log -1 --name-only` (lists `spec/jasmine/02-OwnerSpec.js`).
- Commit `229543f3e7b66adbddd4855ea435e64c21015648` present in git log — confirmed via `git rev-parse HEAD`.
- Short SHA `229543f3` returned by `git rev-parse --short HEAD` — confirmed.
- GPG signature verified `Good signature from "Matej Sychra <suculent@me.com>"` (RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F`) — confirmed via `git log -1 --show-signature`.
- Commit subject exactly `refactor(REFACTOR-02): strict equality in Owner.password_reset` — confirmed via `git log -1 --pretty=format:'%s'`.
- Commit touches exactly two files (`lib/thinx/owner.js` + `spec/jasmine/02-OwnerSpec.js`) — confirmed via `git log -1 --name-only`.
- `grep -n "reset_key !== user_reset_key" lib/thinx/owner.js` → single match at `:492` — confirmed.
- `awk 'NR>=459 && NR<=500' lib/thinx/owner.js | grep -cE "[^=!<>]!=[^=]|[^=!<>]==[^=]"` → `0` (zero non-strict comparisons inside the password_reset method body) — confirmed.
- `node --check lib/thinx/owner.js` exits `0` — confirmed.
- `node --check spec/jasmine/02-OwnerSpec.js` exits `0` — confirmed.
- `grep -c "REFACTOR-02" spec/jasmine/02-OwnerSpec.js` → `2` (≥1 required) — confirmed.
- `grep -n "invalid_reset_key" spec/jasmine/02-OwnerSpec.js` → at least one match in the new test body — confirmed.
- Working tree: only the unrelated `.planning/STATE.md` is left (per `<execution_rules>` directive) — confirmed via `git status --short`.

---
*Phase: 05-backend-hygiene-cheap-sweeps*
*Plan: 02 — REFACTOR-02*
*Completed: 2026-06-02*
