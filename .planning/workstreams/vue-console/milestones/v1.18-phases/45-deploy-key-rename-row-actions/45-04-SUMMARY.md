---
phase: 45-deploy-key-rename-row-actions
plan: 04
subsystem: vue-console
status: complete
tags: [vue, console, ui, deploy-keys, rename, validation, csrf]
requires:
  - 45-01 API contract (PATCH /api/v2/rsakey {filename, name}; 400 invalid_key_name with reason)
  - 45-03 key groups, IconButton row actions, deletingIds / isDeleting, loadData, _deploy-keys.scss
provides:
  - src/utils/keyNames.js validateKeyName / keyNameMessage / KEY_NAME_MAX (client mirror of RSAKey.validateKeyName)
  - api.$patch (through fetchWithCsrf) and rsakeys/renameItem
  - Rename IconButton and the rsakey-rename-modal dialog on the Deploy Keys page
  - Name feedback line under the Generate form and in the rename dialog (.key-name-feedback, .key-name-help)
affects:
  - 45-05 (ships the console commits; live rename + reload check and the E3 long-text backstop)
tech-stack:
  added: []
  patterns:
    - "client name check compares UTF-16 code units numerically, no control-character regex (Codacy)"
    - "server reason shown until the name changes (watcher clears it); request errors are not aria-invalid"
key-files:
  created:
    - services/console/vue/src/utils/keyNames.js
  modified:
    - services/console/vue/src/core/api.js
    - services/console/vue/src/store/rsakeys.js
    - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
    - services/console/vue/src/styles/_deploy-keys.scss
    - services/console/vue/tests/unit/deploy-key-actions.cjs
    - services/console/vue/tests/unit/milestone-v116.cjs
decisions:
  - "An invalid_key_name answer with a missing or empty reason is stored as 'unknown', which maps to the generic sentence"
  - "The deploy-key-actions async runner treats a check that never settles as FAIL (exit 1)"
metrics:
  duration: 10min
  completed: 2026-10-13
requirements: [KEY-04]
actuals:
  tokens: 13600
  tasks: 2
  commits: 4
plan_head_before: 5b1eb955ad64aa0391ded263d8a978a8596dbb63
plan_head_after: 31ed7383d110fb4bb8fee97175e028dd9330b235
commit_repo: services/console (thinx-staging, not pushed)
---

# Phase 45 Plan 04: Deploy key rename and readable name errors Summary

Each deploy key row in the Vue console now has a Rename icon (`fa fa-pencil`) between Copy key and Delete. It opens a
small dialog prefilled with the current name. The dialog checks the name on the client with the same rule as the server,
sends one CSRF-guarded `PATCH /api/v2/rsakey {filename, name}`, and shows the server's reason sentence when the API
refuses the name. The Generate form now names the refused character too, before and after the request.

`plan_head_before` / `plan_head_after` and `commits` are measured in the console submodule
(`git -C services/console rev-list --count 5b1eb95..HEAD` = 4). The parent repository got no commit and its gitlink is
still unbumped (`M services/console`), as the parallel-run instructions asked. `actuals.tokens` is chars/4 over the
54,363-byte console diff `5b1eb95..31ed738`.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 (tracer) | Rename from the row: icon, dialog, client check, renameItem, $patch via the CSRF client (KEY-04, D-07, D-09, D-10) | 686a113 | 3d7eb9b |
| 2 | Readable name errors on the Generate form, feedback styles, phase-wide checks (KEY-04, D-07, UI-K09) | 34ed39d | 31ed738 |

All four console commits are signed (`%G?` = `G`), passed the console `commit-msg` hook, and are on `thinx-staging`,
which is 10 commits ahead of `origin/thinx-staging` and was not pushed.

## TDD evidence (RED runs)

- Task 1 RED (`node tests/unit/deploy-key-actions.cjs`, exit 1, 13 FAIL): `K1 (ENOENT … utils/keyNames.js)`,
  `K2 (Api has $patch)`, `K3 (the store has renameItem)`, `K4 (Expected values to be strictly deep-equal)`,
  `K5/K6/K7 (vm.openRename is not a function)`, `K8 (vm.onRenameHide is not a function)`, `K9 (one rename modal)`, plus
  the updated `B4`, `B6`, `C3` (four row actions expected).
- Task 2 RED (exit 1, 3 FAIL): `G1 (Expected values to be strictly equal)`, `G2 (an invalid name sends nothing)`,
  `G3 (.key-name-feedback has a rule)`.

## Verification results

- `LC_ALL=C npm --prefix services/console/vue run test:unit`: exit 0, 244 `ok` lines (232 after 45-03 + 12 new
  checks), 0 `FAIL`, v1.16 regression line printed. Without `LC_ALL=C`: exit 0, 244 `ok`.
- `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build`: passed after both GREEN commits.
  `dist/js/app.*.js` contains `rsakey-rename-modal`, `Deploy key renamed`, `Keep current name`,
  `The name contains a hidden direction-override character.`, `create-key-feedback` and
  `Could not generate the deploy key. Try again.`; `dist/css/app.*.css` contains `ff8a8a`.
- `test:csp:dist`: PASS (no inline JavaScript in public/dist index.html, enforced script policy).
- `perf:spotter`: all budgets passed. JS total 7.05 MiB raw / 2.77 MiB gzip, CSS total 617.78 KiB raw / 90.07 KiB gzip,
  6 initial assets. Largest initial chunks: `chunk-vendors-legacy` 686.63 KiB gzip, `app-legacy` 756.15 KiB gzip (was
  755.58 KiB after 45-03), `app` 750.81 KiB gzip.
- String gates: none of `>Cancel<`, `>Save<`, `cancelTitle: 'Cancel'`, `Failed to generate deploy key`,
  `Failed to delete deploy keys`, `Deploy keys could not be loaded`, `text-muted`, `Delete (`, `v-html`,
  `table-striped`, `<th>Select</th>` in Rsakeys.vue; no control-character escape (`\x0`…`\u20`) in keyNames.js.
  `grep -cF 'data-cy="key-rename"'` = 1, `grep -c v-html` = 0.
- `git -C services/console diff --name-only 604258c HEAD` is exactly the nine Phase 45 Vue paths; every commit since
  604258c is signed; `git -C services/console status --porcelain -- vue src` is empty; nothing pushed.
- Tracer gate (Task 1, end-of-phase mode, automated-only verify): test:unit and the build/bundle check passed on the
  committed tree, so Task 2 went ahead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test loader did not handle `export async function`**
- **Found during:** Task 1 GREEN
- **Issue:** K2 loads `utils/cookies.js` through `loadModule`, whose export regex (copied from device-list-parity.cjs)
  covers `const|let|function`; `fetchWithCsrf` is `export async function`, so the module failed to parse
  (`Unexpected token 'export'`).
- **Fix:** the regex also accepts `async function`. No assertion changed.
- **Files modified:** services/console/vue/tests/unit/deploy-key-actions.cjs
- **Commit:** 3d7eb9b

**2. [Rule 1 - Bug] A never-settling async check exited 0**
- **Found during:** Task 2 RED
- **Issue:** On the Task 1 tree `create()` sent the tab-containing name to a deferred that the test never settles, so
  node drained its event loop and exited 0 without reporting G2 or the checks after it. A hung check could have hidden
  a failure in CI.
- **Fix:** G2 asserts "sends nothing" before awaiting, and the runner registers a `beforeExit` handler that prints
  `FAIL <check> (never settled)` and exits 1 while an async check is still running.
- **Files modified:** services/console/vue/tests/unit/deploy-key-actions.cjs
- **Commit:** 34ed39d

**3. [Rule 3 - Blocking] Existing checks assumed three row buttons and one form**
- **Found during:** Task 1 RED
- **Issue:** B4 (as 45-03 noted), B6 and C3 listed exactly Show/Copy/Delete, and C2/C4 counted every `b-form` on the
  page, which the rename dialog's form would break.
- **Fix:** B4/B6/C3 use the four-action list `ROW_ACTIONS`; C2/C4 select the Generate form by `key-create-form`. Their
  intent is unchanged.
- **Files modified:** services/console/vue/tests/unit/deploy-key-actions.cjs
- **Commit:** 686a113

**4. [Rule 2 - Correctness] milestone-v116 also checks that a refused name is not sent**
- **Found during:** Task 2 GREEN
- **Issue:** G4 only needed the real `validateKeyName` / `keyNameMessage` loaded. One assertion now shows they are
  real, not stubs.
- **Fix:** one extra assertion after the existing create checks: a tab-containing name calls nothing and sets no error.
- **Files modified:** services/console/vue/tests/unit/milestone-v116.cjs
- **Commit:** 31ed738

The Task 2 RED commit was amended once (message only, before anything else happened) because `#FF8A8A` in the body
made commitlint warn `footer-leading-blank`. The plan forbids `#` in messages. The hash changed from 33d82a7 to 34ed39d;
the tree is the same.

No other deviations: no change to IconButton.vue, the `rsakey-result-modal`, cookies.js, Legacy (`services/console/src`),
Cypress or npm dependencies, no install, no lint run.

## Known Stubs

None.

## Threat Flags

None. The only new request is the planned `PATCH /rsakey` through `request()`'s non-GET branch, so `fetchWithCsrf`
attaches `X-XSRF-TOKEN` (K2 checks the header with the real cookies.js) (T-45-20). Names and reason sentences render
only through text interpolation. Error copy is fixed text and never echoes server messages, paths or filenames (T-45-24).

## Notes for 45-05

- Push the four console commits with the 45-02/45-03 work and bump the parent gitlink there.
- Live checks: rename a key, reload, and compare the fingerprint before and after (KEY-04 SC 1). The E3 long-text
  backstop: save a 120-character name with no spaces through the dialog; the Name cell ellipsises it with the full title;
  its per-row delete confirmation wraps the name inside the dialog with no horizontal overflow.
- `maxlength="120"` counts untrimmed UTF-16 units, so `too_long` is hard to reach from either field in a browser. The
  server still checks it.

## Self-Check: PASSED

- FOUND: services/console/vue/src/utils/keyNames.js
- FOUND (ancestors of console HEAD): 686a113, 3d7eb9b, 34ed39d, 31ed738
