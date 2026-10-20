---
phase: quick-261012-r9z
plan: 01
quick_id: 261012-r9z
subsystem: api-validation, ci-gates
tags: [codacy, eslint, no-control-regex, detect-unsafe-regex, deploy-keys, ci]
status: complete
requires: []
provides:
  - "Util.hasControlChars(text): charCode scan for C0 control chars and DEL"
  - "isPlainDecimal(text) in scripts/check-ci-gates.js (module-local)"
affects:
  - lib/thinx/rsakey.js create()
  - lib/router.rsakey.js createRSAKey
  - scripts/check-ci-gates.js parsePipelineArgs
tech-stack:
  added: []
  patterns: ["regex-free control-char scan via charCodeAt", "dot-split + single-quantifier digit test"]
key-files:
  created: []
  modified:
    - lib/thinx/util.js
    - lib/thinx/rsakey.js
    - lib/router.rsakey.js
    - spec/node/DeployKeyNames.test.js
    - scripts/check-ci-gates.js
    - spec/node/CiPipelineGates.test.js
decisions:
  - "Shared Util.hasControlChars helper replaces the control-char regex at both deploy-key name sites; rsakey.js and router.rsakey.js change by exactly one line each (Phase 40 merge surface)"
  - "--timeout-min is validated by splitting on '.' and testing each part with an anchored \\d+; Number(), the > 0 check and the UsageError text are unchanged"
metrics:
  duration: "~6 min"
  completed: 2026-10-12
actuals:
  tokens: 2041
  tasks: 2
  commits: 2
plan_head_before: 7a91905f8a7bbcf184849e75d07a449fb7f7462f
plan_head_after: 174cf071cf56017178c12d3c6fc434177f5a6886
---

# Quick 261012-r9z: Fix Codacy findings on PR #573 Summary

The deploy-key name check now uses a shared `Util.hasControlChars` charCode scan instead of a control-character regex, and `--timeout-min` is validated by a dot-split, single-quantifier digit test. Tests prove both accept and reject exactly the same inputs as before.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer, tdd) | Shared Util.hasControlChars at both key-name sites | 5836eed0 | lib/thinx/util.js, lib/thinx/rsakey.js, lib/router.rsakey.js, spec/node/DeployKeyNames.test.js |
| 2 (tdd) | --timeout-min without a nested-quantifier regex | 174cf071 | scripts/check-ci-gates.js, spec/node/CiPipelineGates.test.js |

## What changed

- `lib/thinx/util.js`: new `static hasControlChars(text)`, placed after `safeEqual`. It returns false for non-strings. For strings it does an indexed `charCodeAt` loop and returns true on the first code unit that is `< 0x20` or `=== 0x7f`. It contains no regex.
- `lib/thinx/rsakey.js` `create()` and `lib/router.rsakey.js` `createRSAKey`: only the trailing regex operand changed, now `Util.hasControlChars(name)`. numstat against 7a91905f is 1/1 for each file. The router's 400 `invalid_key_name` still runs before `rsakey.create`, and the session, owner and CSRF code is untouched.
- `scripts/check-ci-gates.js`: new module-local `isPlainDecimal(text)` (not exported). It takes `text.split(".")`, requires at most 2 parts, and tests each one with `/^\d+$/`. The `--timeout-min` line calls it in place of the old nested optional-fraction regex. No other regex in the file was touched.

## Verification (all run, all green)

- RED first: before the helper existed, `node --test spec/node/DeployKeyNames.test.js` failed only the new equivalence test (14 pass / 1 fail). GREEN after: 15/15.
- The equivalence test checks every UTF-16 code unit from 0x0000 to 0xFFFF: the helper agrees with the old character class (used as an oracle in the spec only). It also covers the multi-char and non-string cases.
- `create()` reject list gained 'a\tb', 'a\rb', 'a\u001fb' and 'a\u007fb', and `generated === 1` still holds. A new test shows that `'x'.repeat(120)` and `'Klíč ✓ 🔑'` are accepted and that `response.name` comes back unchanged.
- The `--timeout-min` table passed against the OLD code before the script changed (23/23), so it pins the existing semantics. It passed again after the change. Accepted: 1, 2.5, 0.5, 007->7, 30, the default 30 and the separate-argument `5`. Rejected: '', 0, 0.0, 00, -1, +1, 1e3, 0x10, '1.', '.5', ' 5', '5 ', 1.2.3, Infinity, NaN, '1,5' and U+0661.
- `npm run test:node`: 66/66 pass (65 baseline plus 1 new).
- `npx eslint --no-config-lookup --rule '{"no-control-regex":"error"}'` on util.js, rsakey.js and router.rsakey.js exits 0 (the local stand-in for Codacy findings 1-2).
- The repo ESLint config is clean on all six touched files.
- `grep -nF '(\.\d+)?' scripts/check-ci-gates.js` returns nothing (Codacy finding 3).
- No package.json / package-lock.json change, no installs, nothing pushed. The submodule guard ran before each commit: no staged path was inside a submodule.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None. (The `// TODO: Requires unit-testing` at lib/thinx/util.js:114 was already there and is outside this change.)

## Notes

- The tracer feedback gate on Task 1 was satisfied by re-running the automated-only `<verify>` end-to-end before Task 2 (end-of-phase human-verify mode).
- The second Codacy finding class (security/detect-unsafe-regex) cannot be reproduced locally because eslint-plugin-security is not installed and must not be. It is gated by grep plus the behavior table, as planned. Codacy will show the final result on the next PR #573 push.

## Self-Check: PASSED

- FOUND: lib/thinx/util.js (contains `static hasControlChars(`)
- FOUND: `Util.hasControlChars(name)` in lib/thinx/rsakey.js and lib/router.rsakey.js
- FOUND: commit 5836eed0 (ancestor of HEAD)
- FOUND: commit 174cf071 (ancestor of HEAD)
