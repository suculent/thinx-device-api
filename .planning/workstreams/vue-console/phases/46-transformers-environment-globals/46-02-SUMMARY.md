---
phase: 46-transformers-environment-globals
plan: 02
subsystem: ui
tags: [vue, console, transformers, icon-button, typed-confirm, bulk-delete, accessibility, scss]

requires:
  - phase: 44-device-list-parity
    provides: "IconButton component and the .icon-button / .actions-cell styles"
  - phase: 45-deploy-key-rename-row-actions
    provides: "confirm / pending / bulk-toolbar / load-failure patterns (Rsakeys.vue) and the deploy-key-actions.cjs harness"
provides:
  - "Transformers page: white-wrench Edit and trash Delete IconButtons, Select column, Selected transformers toolbar, one typed-confirm dialog for row and bulk delete with the device-usage warning, load states, Name naming"
  - "store transformers/deleteItems(utids): re-read, remove exactly the utids, one write, no write when none exists"
  - "store transformers/saveTransformers resolves refreshed: false when only the re-read fails (Phase 35 IN-02 fix, console commit ed429ec)"
  - "store devices/loadDevices(): GET /device that throws on failure (fetchItems unchanged)"
  - "src/utils/transformerUsage.js: countDevicesUsing(devices, utids) and usageSentence(count, many)"
  - "src/styles/_settings-pages.scss: shared Phase 46 rules (.bulk-toolbar, .button-text, .settings-add, .dialog-stack, .dialog-field, .dialog-label, .dialog-feedback, .dialog-help, .typed-confirm__*, .transformer-name), imported after deploy-keys"
  - "tests/unit/transformers-enviros.cjs in the test:unit chain (harness for 46-03 and 46-04)"
affects: [46-03-environment-globals, 46-04-device-detail-editor, 46-05-ship, 48-FIX-01-ledger]

actuals:
  tokens: 21800
  tasks: 3
  commits: 6
plan_head_before: 316c5f9cca5e3f11a219178fc78cd6a17542262b
plan_head_after: c31a9c56c299a4734d53885fef76de758921c3f1

tech-stack:
  added: []
  patterns:
    - "Typed-confirm b-modal: form-in-modal with #modal-footer submit bound by form=, confirmMatches computed (trimmed, case-sensitive), single-shot submit guard, @hide preventDefault while pending, deleting cleared before hide"
    - "Promise.allSettled page load: primary list failure shows one non-dismissible alert, secondary (devices) failure degrades the copy silently"
    - "Store write that reports refreshed: false when only the follow-up re-read fails; pages reload separately"

key-files:
  created:
    - services/console/vue/src/utils/transformerUsage.js
    - services/console/vue/src/styles/_settings-pages.scss
    - services/console/vue/tests/unit/transformers-enviros.cjs
  modified:
    - services/console/vue/src/pages/Transformers/Transformers.vue
    - services/console/vue/src/store/transformers.js
    - services/console/vue/src/store/devices.js
    - services/console/vue/src/styles/_platforms.scss
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/package.json

key-decisions:
  - "Phase 35 IN-02 is fixed in console commit ed429ec: saveTransformers returns the POST result plus refreshed: false when the re-read throws; Transformers.vue (delete and create) runs loadData() once in that case"
  - "devices/loadDevices treats a success answer whose response is not an array as a failure, so the usage line falls back to the generic sentence instead of claiming No device uses it"
  - "countDevicesUsing also de-duplicates by udid, so a device listed twice counts once"
  - "The bulk run is tracked with a deleteFromBulk flag set by openDelete(targets, true); bulkDeleting is true only for a run started from the bulk button"
  - "The create duplicate check compares the trimmed name with every trimmed listed alias"

patterns-established:
  - "transformers-enviros.cjs: liveHarness rebinds the page's own loadData with controllable fetchItems / loadDevices / getDevices"
  - "_settings-pages.scss is the one stylesheet for Phase 46 page rules; later plans append to it"

requirements-completed: [TRANS-03, TRANS-04, POL-03]

coverage:
  - id: D1
    description: "Row actions: white-wrench Edit (default) and trash Delete (danger) IconButtons in td.actions-cell; Edit opens TransformerEditor; the wrench glyph is forced white by .icon-button .icon-white"
    requirement: TRANS-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#A1, C4"
        status: pass
    human_judgment: false
  - id: D2
    description: "One typed-confirm dialog for row and bulk delete: field cleared on open, Delete enabled only for the trimmed word confirm, one write per submit, locked while pending, failure keeps the dialog and the word, success closes and drops the selection"
    requirement: TRANS-04
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#A2-A6, B4"
        status: pass
    human_judgment: false
  - id: D3
    description: "deleteItems re-reads and removes exactly the target utids in one POST /profile; no write when none exists; saveTransformers refreshed: false on a failed re-read (35 IN-02)"
    requirement: TRANS-04
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#S1, S2; tests/unit/milestone-v116.cjs"
        status: pass
    human_judgment: false
  - id: D4
    description: "Device-usage warning in the dialog (0 / 1 / N devices, generic sentence when the device list could not be loaded, no page error)"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#B5, B6, B7"
        status: pass
    human_judgment: false
  - id: D5
    description: "Selection column, Selected transformers toolbar, load states (first-load status, one load alert, in-place reload, pruning, empty row), names rendered as text"
    requirement: TRANS-04
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#B1-B3, B8, B9"
        status: pass
    human_judgment: false
  - id: D6
    description: "Add Transformer with a plus; create dialog says Name with its own feedback line and verb + noun buttons; no forbidden string on the page; shared Phase 46 stylesheet compiled into the theme"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#C1-C3, C5, C6"
        status: pass
      - kind: other
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build && test:csp:dist && perf:spotter"
        status: pass
    human_judgment: false
  - id: D7
    description: "E3 overflow and long-text backstops: 30 selected names scroll inside 160px with the field and Delete visible at a 768px-high viewport; a 200-character unbroken name and a right-to-left name wrap without horizontal overflow or reordering"
    requirement: TRANS-04
    verification: []
    human_judgment: true
    rationale: "Layout in a real browser (viewport height, wrapping, bidi rendering) is not observable in the plain-node vnode tests; the CSS rules are asserted (C5) but the visual result needs the live check after 46-05 ships"

duration: 14min
completed: 2026-10-13
status: complete
---

# Phase 46 Plan 02: Transformers Typed-Confirm Delete Summary

**Transformers page with white-wrench and trash IconButtons, a single typed-`confirm` dialog for row and bulk delete that warns how many devices stop applying them, one-write `deleteItems`, the Phase 35 IN-02 `refreshed: false` fix, and the shared Phase 46 stylesheet**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-13T20:36:38Z
- **Completed:** 2026-10-13T20:50:18Z
- **Tasks:** 3 (tracer + 2)
- **Files modified:** 10 (3 created, 7 modified) in `services/console`

## Accomplishments

- Each transformer row ends in `td.actions-cell` with IconButtons Edit (`fa fa-wrench icon-white`) and Delete (`fa fa-trash`, danger). The compiled theme forces the wrench glyph white. Add Transformer is green, with a `+` glyph and visible text.
- `b-modal#transformer-delete-modal` serves both the row trash and the bulk trash. It shows:
  - the question (with the names list when several are selected);
  - the warning glyph and the device-usage sentence;
  - the typed `confirm` field.

  Delete stays disabled until the trimmed, case-sensitive word matches, and Enter or a second submit while pending sends nothing. While deleting, the dialog cannot be closed and the target rows show `Deleting…`. A failure keeps the dialog open with the typed word.
- `transformers/deleteItems(utids)` reads the profile again, removes exactly those utids and makes one `POST /profile`. When none of them exists it writes nothing and answers success. `saveTransformers` returns `refreshed: false` instead of failing when only the re-read fails (Phase 35 IN-02). The fix is in console commit `ed429ec`, recorded here for the Phase 48 FIX-01 ledger.
- New UI pieces:
  - a Select checkbox column and a right-aligned `Selected transformers` toolbar (`Delete selected` / `Delete selected (N)` / `Deleting…`);
  - first-load `Loading…`, then in-place reloads;
  - one non-dismissible load alert;
  - the selection is pruned on every load;
  - the empty row `No transformers yet. Add one with Add Transformer.`
- The Transformers page and the store now say Name, not Alias. The data key stays `alias`. The create dialog has its own feedback line and the buttons `Create Transformer` / `Close without adding`.
- New `_settings-pages.scss` with the shared Phase 46 rules, imported after `deploy-keys`. 46-03 and 46-04 add to it.

## Task Commits

All in `services/console` on `thinx-staging`. Every commit is signed (`%G?` = `G`), and none is pushed (46-05 ships):

1. **Task 1 (tracer): row typed-confirm delete, one store write**: RED `29727e8` (test), GREEN `ed429ec` (feat; includes the 35 IN-02 fix)
2. **Task 2: bulk selection, usage warning, load states**: RED `64d69bd` (test), GREEN `94ba8ef` (feat)
3. **Task 3: plus, white wrench, Name copy, shared stylesheet**: RED `32533dc` (test), GREEN `c31a9c5` (feat)

**Plan metadata:** SUMMARY commit in the parent repo (see the final docs commit).

## TDD Evidence (RED → GREEN)

`workflow.tdd_mode` is off, so the machine RED classifier was not required. The harness prints `ok   name` / `FAIL name (reason)`, which is not TAP. The commits use the console commitlint scopes `test(vue)` / `feat(vue)` that the plan specifies, not `test(46-02)`.

- **RED 1 (`29727e8`)**: `node tests/unit/transformers-enviros.cjs` exited 1 with 8 FAILs. Examples: `A1 … (one transformer-row per transformer)`, `S1 … (the store has deleteItems)`, `S2 … (Could not load transformers.)`.
  - Semantic assessment: every target check ran. Each failed on its planned behaviour: the rows have no hooks or IconButtons, `deleteItems` is missing, and the throwing re-read propagates (the IN-02 bug itself). No load or syntax faults.
- **RED 2 (`64d69bd`)**: exited 1 with 9 FAILs (B1–B9). Examples: `B3 … (intro 3, toolbar -1, table -1)`, `B5 … (ENOENT … transformerUsage.js)`, `B7 … (the devices store has loadDevices)`.
  - Semantic assessment: the features are absent. B5's ENOENT is the missing helper module, which is the deliverable. The first draft of B6 failed on a harness bug (`loadData is not a function`). I fixed the harness before the RED commit, and B6 then failed on `one device load next to it`, the planned assertion.
- **RED 3 (`32533dc`)**: exited 1 with 6 FAILs (C1–C6). Examples: `C1 … (one div.settings-add at the top level)`, `C4 … (.icon-button .icon-white has a rule)`, `C6 … (forbidden strings in Transformers.vue)`. All failed on planned assertions.
- **GREEN**: after each feat commit, `LC_ALL=C npm --prefix services/console/vue run test:unit` exited 0 with 0 `FAIL ` lines. After Task 3 the full chain was also green without `LC_ALL=C`.

## Verification Results

- Task 1 verify 1 and 2: unit chain green. The single-item delete action is neither used nor defined, `refreshed: false` is present, the build passes, and the bundle has `transformer-delete-modal` and `Keep transformer`.
- Task 1 tracer gate: no auto mode, `end-of-phase`, automated-only verify. I re-ran the unit chain (green) before expanding.
- Task 2 verify: both helpers are exported, `loadDevices` exists, the page uses `Promise.allSettled`, and the bundle has `transformer-bulk-delete`, the generic usage sentence and the load copy.
- Task 3 verify:
  - the unit chain is green in both locales;
  - no forbidden string remains (and no `v-html`);
  - the store no longer has the old message;
  - the theme imports `settings-pages` exactly once;
  - `.icon-white` is in `_platforms.scss`;
  - the build passes and the CSS has `icon-white` and `settings-add`;
  - the JS has `Create Transformer` and the duplicate-name copy;
  - `test:csp:dist` passes;
  - `perf:spotter` reports "All performance budgets passed." (JS 7.07 MiB raw / 2.78 MiB gzip, CSS 619.06 KiB raw / 90.25 KiB gzip, 6 initial assets).
- Acceptance:
  - exactly the ten plan paths changed since `316c5f9`;
  - all 6 commits are signed `G`;
  - `git -C services/console status --porcelain -- vue src` is empty;
  - `origin/thinx-staging..HEAD` = 6 (nothing pushed);
  - `grep -c v-html` = 0, and `data-cy="transformer-delete-input"` appears once.
- The parent gitlink was not bumped. The parent shows `M services/console` unstaged, which is left for 46-05.

## Files Created/Modified

- `vue/src/pages/Transformers/Transformers.vue`: IconButton row actions, Select column, bulk toolbar, typed-confirm dialog, usage line, load states, Name create dialog.
- `vue/src/store/transformers.js`: `deleteItems(utids)` replaces `deleteItem`; `saveTransformers` gets the `refreshed: false` flag; the message is now `Transformer name is required.`
- `vue/src/store/devices.js`: `loadDevices()`, which throws on failure.
- `vue/src/utils/transformerUsage.js` (new): `countDevicesUsing` and `usageSentence`.
- `vue/src/styles/_settings-pages.scss` (new): the shared Phase 46 rules.
- `vue/src/styles/_platforms.scss`: `.icon-button .icon-white { color: #FFFFFF; }`
- `vue/src/styles/theme.scss`: `@import 'settings-pages';` after `deploy-keys`.
- `vue/tests/unit/transformers-enviros.cjs` (new): 23 checks (A1–A6, S1–S2, B1–B9, C1–C6).
- `vue/tests/unit/milestone-v116.cjs`: passes `{ IconButton: {} }` when loading Transformers.vue.
- `vue/package.json`: `test:unit` now ends with `node tests/unit/transformers-enviros.cjs`.

## Decisions Made

- `loadDevices` also rejects a success answer whose `response` is not an array. Without that, a malformed device list would produce `No device uses it.` instead of the generic sentence.
- `countDevicesUsing` de-duplicates by `udid`, so "distinct devices" holds even if the list repeats a device.
- `openDelete(targets, fromBulk)` records where the run came from, so `bulkDeleting` (the toolbar's `Deleting…`) is true only for a bulk-started delete.
- The create duplicate check compares trimmed names with trimmed aliases.
- The dismissible page action-error alert stays in the template, as the UI-SPEC page order requires, although no action on this page writes it any more: delete and create errors show inside their dialogs.

## Deviations from Plan

None that changed scope. One test-harness fix was made inside the RED step before its commit (B6's `liveHarness` now rebinds the page's own `loadData` instead of deleting the override). It is recorded under TDD Evidence.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 46-03 (Environment Globals) and 46-04 (Device Detail / editor) can extend `transformers-enviros.cjs` and append to `_settings-pages.scss`. `.bulk-toolbar`, `.button-text`, `.settings-add` and `.dialog-*` are ready.
- 46-05 ships: push `services/console` `thinx-staging` (6 commits ahead), bump the parent gitlink, and compare the served bundle with id `17d6331` (0 `transformer-delete-modal` there today).
- 46-04 should write the 35 IN-02 fix commit `ed429ec` into the Phase 48 FIX-01 ledger line.

## Self-Check: PASSED

- FOUND: services/console/vue/src/utils/transformerUsage.js, services/console/vue/src/styles/_settings-pages.scss, services/console/vue/tests/unit/transformers-enviros.cjs
- FOUND (ancestors of console HEAD): 29727e8, ed429ec, 64d69bd, 94ba8ef, 32533dc, c31a9c5

---
*Phase: 46-transformers-environment-globals*
*Completed: 2026-10-13*
