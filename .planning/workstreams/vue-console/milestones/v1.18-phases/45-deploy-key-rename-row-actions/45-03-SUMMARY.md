---
phase: 45-deploy-key-rename-row-actions
plan: 03
subsystem: vue-console
status: complete
tags: [vue, console, ui, deploy-keys, icon-button, accessibility]
requires:
  - Phase 44 IconButton (src/components/IconButton/IconButton.vue) and .icon-button / .actions-cell styles
provides:
  - Deploy Keys page per-key tbody groups with Show / Copy / Delete IconButtons
  - Confirmed single-shot row and bulk delete (confirming flag + deletingIds guard)
  - src/styles/_deploy-keys.scss (.deploy-keys-table stripes, .key-name, .key-fingerprint, .key-text, .key-create-form, .key-toolbar)
  - tests/unit/deploy-key-actions.cjs in the test:unit chain
affects:
  - 45-04 (Rename IconButton and modal land on this layout; Generate feedback line and generate error copy)
  - 45-05 (ships the console commits; E1 / E6 backstops checked live)
tech-stack:
  added: []
  patterns:
    - "arrays used as sets (deletingIds, shownIds) because Vue 2 does not observe Set"
    - "one tbody per key so stripes are per group and a detail row never shifts them"
key-files:
  created:
    - services/console/vue/src/styles/_deploy-keys.scss
    - services/console/vue/tests/unit/deploy-key-actions.cjs
  modified:
    - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/package.json
decisions:
  - "Bulk delete skips keys whose own row delete is already in flight, so no key is ever sent twice"
  - "A load failure sets error to null so the non-dismissible load alert is the only message (UI-K12)"
metrics:
  duration: 10min
  completed: 2026-10-13
requirements: [KEY-05, KEY-06, POL-04]
actuals:
  tokens: 13300
  tasks: 3
  commits: 6
plan_head_before: 604258c2f8bed73a92c59fccabb372c95d494115
plan_head_after: 5b1eb955ad64aa0391ded263d8a978a8596dbb63
commit_repo: services/console (thinx-staging, not pushed)
---

# Phase 45 Plan 03: Deploy Keys row actions, bulk toolbar and load error Summary

The Vue Deploy Keys page now renders each key as its own striped `tbody.key-group`. Each row has Phase 44 IconButtons
for Show key / Hide key (inline `pre.key-text` detail row), Copy key and Delete. Row and bulk deletes ask for
confirmation by name, with `Keep key` / `Keep keys` focused, and each is single-shot. Names are ellipsised and
fingerprints shown in monospace. A failed load leaves exactly one non-dismissible alert.

`plan_head_before` / `plan_head_after` and `commits` are measured in the console submodule
(`git -C services/console rev-list --count 604258c..HEAD` = 6). The parent repo got no commit, and its gitlink is still
unbumped (`M services/console`), as the parallel-run instructions asked.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 (tracer) | Confirmed single-shot row delete (KEY-05, POL-04, D-11) | a90ca60 | 9cddd11 |
| 2 | Show / Copy icons, readable columns, fingerprint (KEY-05, KEY-06, D-09, D-12) | 36b0278 | cd349fe |
| 3 | Bulk toolbar, Generate form spacing, one load error (POL-04, D-11, D-12) | c77f997 | 5b1eb95 |

All six console commits are signed (`%G?` = `G`) and passed the console `commit-msg` hook. The console is 6 commits
ahead of `origin/thinx-staging` and has not been pushed.

## TDD evidence (RED runs)

- Task 1 RED (`node tests/unit/deploy-key-actions.cjs`, exit 1):
  `FAIL A1 … (one deploy-key-group per key)`, `FAIL A2/A3/A4 … (vm.deleteRow is not a function)`.
  A5: before the `{ IconButton: {} }` loader argument, `milestone-v116.cjs` threw once the page registered IconButton
  (seen during GREEN), and it passes after the fix.
- Task 2 RED (exit 1, 8 FAIL): `B1 (table classes: table table-striped)`, `B2 (Firmware Repository one key-name)`,
  `B3 (Generated is text-nowrap)`, `B4 (Expected values to be strictly deep-equal)`, `B5 (vm.toggleKey is not a
  function)`, `B6 (Show disabled for "")`, `B7 (copy error copy)`, `B8 (.key-name has a rule)`.
- Task 3 RED (exit 1, 7 FAIL): `C1 (intro 3, toolbar -1, table 4)`, `C2 (form class: mb-3)`, `C3 (one msgBoxConfirm
  while a confirmation is open)`, `C4`, `C5`, `C6`, `C7 (.key-create-form has a rule)`.

## Verification results

- `LC_ALL=C npm --prefix services/console/vue run test:unit`: exit 0, 232 `ok` lines (baseline 213 + 19 new checks),
  0 `FAIL`, and the v1.16 regression line printed. Without `LC_ALL=C`: exit 0, 232 `ok`.
- `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build`: passed after every GREEN. The
  bundle contains `key-delete`, `Keep key`, `SHA-256 fingerprint of the public key`, `Hide key`, `key-bulk-delete` and
  `Could not load deploy keys. Refresh to retry.`. `dist/css/app.*.css` contains `key-name`, `key-text` and
  `key-create-form`.
- `test:csp:dist`: PASS (no inline JavaScript in public/dist index.html, enforced script policy).
- `perf:spotter`: all budgets passed. Largest initial chunk `js/app-legacy` 755.58 KiB gzip, up from 753.57 KiB in
  Phase 44, against the 850000-byte budget. JS total 2.77 MiB gzip, CSS total 90.03 KiB gzip.
- Task 3 string gates: no `text-muted`, `<th>Select</th>`, old load/delete copy, `Delete (`, `cancelTitle: 'Cancel'`,
  `v-html` or `table-striped` in Rsakeys.vue. No margin utility inside the Generate `b-form`, which holds exactly
  one `<b-button`.
- Each of the `data-cy` hooks `key-delete`, `key-show`, `key-copy`, `key-name`, `key-fingerprint` and `key-text`
  appears exactly once in Rsakeys.vue.
- `git -C services/console diff --name-only 604258c HEAD` lists exactly the six plan paths, and
  `git -C services/console status --porcelain -- vue src` is empty.
- Tracer gate (Task 1, end-of-phase mode, automated-only verify): re-ran test:unit plus the build/bundle check and both
  passed, so execution moved on to Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Bulk delete never resends a key already being deleted from its row**
- **Found during:** Task 3
- **Issue:** A key can be selected and then deleted from its own row. Its checkbox is disabled, but it stays in
  `selectedIds`, so a bulk delete during that window would send its filename a second time (T-45-17).
- **Fix:** `deleteSelected` leaves out items already in `deletingIds`. After the confirmation it adds only the ids
  that are not pending to `deletingIds` and releases only those. `deleteSelected` also returns early while
  `bulkDeleting` is set.
- **Files modified:** services/console/vue/src/pages/Rsakeys/Rsakeys.vue
- **Commit:** 5b1eb95

**2. [Rule 3 - Blocking] milestone-v116 bulk-delete fixture needed `isDeleting`**
- **Found during:** Task 3
- **Issue:** The 35 WR-06 bulk-delete check calls `deleteSelected` on a plain object built from `keyPage.data()`, and
  the method now calls `this.isDeleting`, so it threw `TypeError: this.isDeleting is not a function`.
- **Fix:** Added `isDeleting: keyPage.methods.isDeleting` to that fixture. Its assertions are unchanged.
- **Files modified:** services/console/vue/tests/unit/milestone-v116.cjs
- **Commit:** 5b1eb95

No other deviations: no store, IconButton, `rsakey-result-modal` or Legacy (`services/console/src`) change, no
Cypress spec, no npm dependency and no install.

## Notes for 45-04

- `Failed to generate deploy key.` is still in `create()` (Rsakeys.vue:77, :82). It is on the UI-SPEC forbidden list
  but belongs to 45-04 (G2 and its string gate replace it with `Could not generate the deploy key. Try again.`).
- Rename should add its IconButton to `td.actions-cell` between `key-copy` and `key-delete`, with
  `:disabled="isDeleting(item)"` (UI-K05). B4 in `deploy-key-actions.cjs` asserts the three-button order
  `['key-show', 'key-copy', 'key-delete']`, so 45-04 has to update that check.
- The confirm guard (`confirming`) and `deletingIds` are shared by row and bulk delete. The load-failure state is
  `loadFailed` only, with `error` left null.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema change. Names, public keys and fingerprints are rendered only through text
interpolation and bound `title`/`id` attributes (T-45-16), and the confirm text is a plain string.

## Self-Check: PASSED

- FOUND: services/console/vue/src/styles/_deploy-keys.scss
- FOUND: services/console/vue/tests/unit/deploy-key-actions.cjs
- FOUND (ancestors of console HEAD): a90ca60, 9cddd11, 36b0278, cd349fe, c77f997, 5b1eb95
