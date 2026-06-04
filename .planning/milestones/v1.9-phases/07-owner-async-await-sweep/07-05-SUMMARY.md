# Plan 07-05 Summary

**Date:** 2026-06-03
**Plan:** Convert Owner.password_reset to async/await + behavior-locking unit test
**Commit:** `439c395c` — `refactor(REFACTOR-04): convert Owner.password_reset to async/await internals`
**GPG-signed:** Good signature (Matej Sychra)

## What Shipped

- `lib/thinx/owner.js` — `Owner.password_reset(owner, reset_key, callback)` converted to `async`. Internal `this.userlib.view("users", "owners_by_resetkey", ..., callback)` converted to `await` with try/catch. Public signature preserved.
- `spec/jasmine/02-OwnerSpec.js` — appended `(16) REFACTOR-04 (07-5): Owner.password_reset callback contract preserved`. Phase 5 test `(12) REFACTOR-02` monkey-patch adapter updated to return `Promise.resolve(...)` (Rule 3 fix — pre-existing callback-style mock incompatible with new Promise-based internals).

## CRITICAL Phase 5 REFACTOR-02 Anti-Regression Gate

| Gate | Required | Actual | Status |
|------|----------|--------|--------|
| `grep -c "reset_key !== user_reset_key" lib/thinx/owner.js` | 1 | **1** | PASS — Phase 5 fix preserved at line 502 |
| `grep -c "reset_key != user_reset_key" lib/thinx/owner.js` | 0 | **0** | PASS — no regression |
| Phase 5 test (12) `REFACTOR-02` still in spec | present | **present** | PASS |

## Validation

- `node --check` clean on both files
- Public signature preserved
- `Util.redactToken(reset_key)` count: 2 (both SEC-PII-01 sites preserved — alog.log + console.log)
- SEC-PII-01 total redaction count: 28 (unchanged)
- Non-strict comparisons in owner.js: 0 (Phase 7 strict-eq sweep stays closed)

## Deviations

**[Rule 3 — Blocking infrastructure fix] Phase 5 test (12) monkey-patch adapted.** The Phase 5 spec patched `user.userlib.view` as a callback-style fake. After Phase 7's async conversion, `password_reset` calls `await this.userlib.view(...)` with no callback — the original patched function would throw `TypeError: cb is not a function`. Fix: patched function now returns `Promise.resolve({ rows: [{ doc: { reset_key: 123 } }] })`. Behavioral assertion (`"123"` vs `123` → `(false, "invalid_reset_key")`) verbatim preserved. Pre-existing test infrastructure adaptation, not behavioral drift.

## ACCEPT pattern

Local `npm test` aborts on missing `/mnt/data/conf/config.json`; CI canonical for ZZ-AppSessionUserSpec.js + ZZ-RouterPasswordResetSpec.js (full reset_key flow). Static gates authoritative locally.

## Pre-edit snapshot

`/tmp/phase7-05-owner-js.pre`
