---
phase: 46-transformers-environment-globals
plan: 03
subsystem: ui
tags: [vue, console, environment, icon-button, dialog, bulk-delete, accessibility, scss]

requires:
  - phase: 46-transformers-environment-globals
    provides: "46-01 exact-key PUT /api/v2/env overwrite (D-02); 46-02 _settings-pages.scss shared rules, transformers-enviros.cjs harness, IconButton row pattern"
  - phase: 45-deploy-key-rename-row-actions
    provides: "confirming / bulkDeleting guard pattern, rename-dialog shape and load-failure alert (Rsakeys.vue)"
provides:
  - "Environment Globals page: page-local table keyed by name, monospace keys, Edit value IconButton per row, edit dialog that never shows the current value"
  - "Edit value: one trimmed PUT /api/v2/env, locked while saving, constant Value saved toast, failure keeps the dialog and the typed value and reloads"
  - "Selected environment variables toolbar and one plain confirmation naming every selected variable (D-16), guarded by confirming / bulkDeleting / deletingKeys"
  - "Add Variable with a plus that refuses a listed key (and refuses while the list is unknown), with its own feedback line"
  - "store enviros/loadItems(): GET /env that throws on failure; createItem / deleteItems resolve refreshed: false when only the follow-up read fails"
  - ".enviro-key and .enviro-edit-key rules in _settings-pages.scss"
affects: [46-04-device-detail-editor, 46-05-ship, 48-FIX-01-ledger]

actuals:
  tokens: 14355
  tasks: 3
  commits: 7
plan_head_before: c31a9c56c299a4734d53885fef76de758921c3f1
plan_head_after: f2d26f893f13a9a04d524e4ff0f60beb2789d9b1

tech-stack:
  added: []
  patterns:
    - "Secret edit dialog: value field emptied on open and on @hidden, never interpolated outside its input, constant toast, error copy names the key only"
    - "Client duplicate refusal that first loads the list when it is unknown (loading or loadFailed), so Add cannot overwrite blind"
    - "Store write helper refreshAfter(dispatch, result): a stored write stays a success with refreshed: false when only the re-read fails"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Enviros/Enviros.vue
    - services/console/vue/src/store/enviros.js
    - services/console/vue/src/styles/_settings-pages.scss
    - services/console/vue/tests/unit/transformers-enviros.cjs

key-decisions:
  - "enviros createItem / deleteItems now resolve refreshed: false when the PUT/DELETE succeeded but the follow-up GET /env rejected (console aef5a22); otherwise the edit dialog said <key> keeps its current value after the server had replaced it"
  - "Add Variable reads the list first when it is still loading or failed, and refuses with the add failure copy while it cannot be read; a blind PUT would silently overwrite an existing key (T-46-13)"
  - "loadItems also rejects a success answer whose response is not an array, like 46-02's loadDevices"
  - "The bulk confirmation lists names in table order, not selection order; every success path (edit, add, delete) prunes the selection to listed names through showItems()"

patterns-established:
  - "transformers-enviros.cjs: enviroHarness / enviroLiveHarness mirror the 46-02 harness for Enviros.vue (recorders for createItem, deleteItems, msgBoxConfirm, $toasted)"

requirements-completed: [ENV-01]

coverage:
  - id: D1
    description: "Page-local Environment Globals table keyed by name: sr-only caption and Select header, monospace span.enviro-key with the full key as title, one Edit value IconButton (fa fa-pencil, default) in td.actions-cell; no value rendered"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#E1, F1, G4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edit value dialog: Change value of <key>, read-only key text, empty New value field, help line; Save value disabled for blank input; one trimmed PUT; locked while saving; Value saved toast; failure keeps the dialog and value, names the key and reloads; refreshed:false closes and reloads"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#E2-E7, E10"
        status: pass
    human_judgment: false
  - id: D3
    description: "enviros/loadItems throws on failure, fetchItems unchanged, createItem is one PUT /env; first-load Loading, one non-dismissible load alert, in-place reloads, pruning, empty row"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#E8, E9, F4"
        status: pass
    human_judgment: false
  - id: D4
    description: "Guarded bulk delete: Selected environment variables toolbar, one plain confirmation naming every variable with cancel focused, one DELETE per confirmation, selected rows locked, success clears, failure keeps the selection and reloads; names rendered as text"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#F1-F3, F5"
        status: pass
    human_judgment: false
  - id: D5
    description: "Add Variable with a plus in div.settings-add; Add variable / Close without adding; listed key refused with nothing sent (also when the list had to be loaded first); one request per click; failure stays in the dialog; no forbidden string"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#G1-G3, G5, G6"
        status: pass
      - kind: other
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build && test:csp:dist && perf:spotter"
        status: pass
    human_judgment: false
  - id: D6
    description: "E7 long-text and E1/E6 overflow backstops: a 120-character unbroken key wraps in the dialog title and key text, a 2000-character value saves with one PUT, and at 375/768/1024/1280px every row is one line with no page-level horizontal scroll"
    requirement: ENV-01
    verification: []
    human_judgment: true
    rationale: "Wrapping, row height and scrollbars need a real browser; the CSS rules are asserted (G4) but the rendered layout is a live check after 46-05 ships"

duration: 13min
completed: 2026-10-13
status: complete
---

# Phase 46 Plan 03: Environment Globals Edit Value Summary

**Environment Globals gets a per-row Edit value dialog. It replaces a variable with one atomic `PUT /api/v2/env` and never shows the current or typed value outside its own field. The page also gets a guarded bulk delete with one plain confirmation that names every variable, an Add Variable that refuses to overwrite a listed key, and the Phase 45 load states.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-13T20:54:03Z
- **Completed:** 2026-10-13T21:07:04Z
- **Tasks:** 3 (tracer + 2)
- **Files modified:** 4 in `services/console`

## Accomplishments

- The generic `List` component is gone from the page. A page-local `table.enviros-table` takes its place, with rows keyed by the variable name. Each row has a checkbox, the key in monospace (ellipsised, full key as `title`) and one neutral `Edit value` pencil IconButton. No value is ever rendered.
- `b-modal#enviro-edit-modal`, titled `Change value of <key>`:
  - it shows the key as read-only text that wraps anywhere, an empty `New value` field and the help line;
  - `Save value` stays disabled while the trimmed value is empty;
  - one submit sends one `enviros/createItem({ key, value })`;
  - while the request runs, the field and both buttons are disabled and the dialog cannot be closed.

  On success the dialog closes and toasts the constant `Value saved`. On failure the dialog stays open with the typed value and `Could not save the new value. <key> keeps its current value. Try again.`, and the list reloads. The value is emptied on every open and once the dialog has closed.
- A `Selected environment variables` toolbar (`Delete selected` / `Delete selected (N)` / `Deleting…`) replaces the old `Delete (N)` button next to Add. It asks one plain-string confirmation that names every selected variable, with the cancel button focused. The `confirming`, `bulkDeleting` and `deletingKeys` guards make one confirmation send exactly one `DELETE`, and they lock the selected rows while it runs.
- A failed list load used to leave `Loading...` on screen forever. Now it shows one non-dismissible `Could not load environment variables. Refresh to retry.` alert, with no table and no toolbar. Only the first load shows `Loading…`, and every load prunes the selection.
- `Add Variable` is green with a `+`. Its dialog says `Add variable` / `Close without adding` and keeps its errors on its own feedback line. A listed key gets `A variable with this key already exists. Use Edit value to change it.` and nothing is sent.

## Task Commits

All in `services/console` on `thinx-staging`. Every commit is signed (`%G?` = `G`), and none is pushed (46-05 ships):

1. **Task 1 (tracer): edit a value in place**: RED `8e898de` (test), GREEN `8b26ad6` (feat)
   - **Deviation fix:** `aef5a22` (fix): `refreshed: false` for a stored write whose re-read fails
2. **Task 2: guarded bulk delete and load states**: RED `3e8ab8d` (test), GREEN `11b8552` (feat)
3. **Task 3: Add Variable without silent overwrite, environment styles**: RED `cbe7076` (test), GREEN `f2d26f8` (feat; includes G6)

**Plan metadata:** SUMMARY commit in the parent repo (see the final docs commit).

## TDD Evidence (RED → GREEN)

`workflow.tdd_mode` is off, so the machine RED classifier was not required. The harness prints `ok   name` / `FAIL name (reason)`, which is not TAP. The commits use the console commitlint scopes `test(vue)` / `feat(vue)` / `fix(vue)` that the plan specifies.

- **RED 1 (`8e898de`)**: `node tests/unit/transformers-enviros.cjs` exited 1 with 9 FAILs (E1–E9). Examples: `E1 … (no generic List component in the template)`, `E2 … (h.vm.openEdit is not a function)`, `E8 … (the enviros store has loadItems)`, `E9 … (one role=status)`.
  - Semantic assessment: every target check ran. Each failed because the planned feature is missing (`List` still in use, no edit methods, no `loadItems`, `Loading` tied to the List prop). The page was loaded with `List: {}`, so these are not load faults.
- **Deviation test (`aef5a22`)**: before the store change, E10 failed with `(offline)`, which is the rejected refresh propagating out of `createItem` (the bug itself).
- **RED 2 (`3e8ab8d`)**: exited 1 with 5 FAILs (F1–F5). Examples: `F1 … (one checkbox per row)`, `F2 … (a second click while the confirmation is open does nothing)`, `F4 … (selection emptied)`.
  - Semantic assessment: F3 and F5 stop at `control.confirm` / `calls.confirm[0]` being empty. That is because today's `deleteSelected` deletes without opening any confirmation, which is the D-16 gap under test.
- **RED 3 (`cbe7076`)**: exited 1 with 5 FAILs (G1–G5). Examples: `G1 … (one div.settings-add at the top level)`, `G3 … (a listed key sends nothing)`, `G4 … (.enviro-key has a rule)`, `G5 … (forbidden strings in Enviros.vue)`.
  - Semantic assessment: G3's first draft hung (`never settled`) because the old page sent the duplicate and awaited it. I fixed it before the commit to assert before awaiting, so G3 now fails on the silent overwrite itself.
- **G6** (added with the Task 3 GREEN, see Deviations): with the guard lines removed, G6 fails (the PUT is sent and never settles); with the guard, it passes.
- **GREEN**: after each feat/fix commit, `LC_ALL=C npm --prefix services/console/vue run test:unit` exited 0 with 0 `FAIL ` lines. After Task 3 the full chain was also green without `LC_ALL=C`.

## Verification Results

- Task 1 verify:
  - the unit chain is green;
  - `loadItems` is in the store;
  - `data-cy="enviro-edit"` appears exactly once;
  - there is no `console.*` call in the page;
  - the build passes, and the bundle has `enviro-edit-modal`, `Keep current value` and `Value saved`;
  - `grep -c v-html` = 0.
- Tracer gate: no auto mode, `end-of-phase`, automated-only verify. I re-ran the unit chain (green) before expanding.
- Task 2 verify: `deletingKeys` and `confirming` are present. The build passes, and the bundle has `enviro-bulk-delete`, the load copy and `Firmware builds will no longer receive`.
- Task 3 verify:
  - the unit chain is green in both locales;
  - no forbidden string or `v-html` remains in `Enviros.vue`;
  - `.enviro-key` is in `_settings-pages.scss`;
  - the build passes, the CSS has `enviro-key` and the JS has the duplicate copy;
  - `test:csp:dist` passes;
  - `perf:spotter` reports "All performance budgets passed." (JS 7.08 MiB raw / 2.78 MiB gzip, CSS 619.49 KiB raw / 90.29 KiB gzip, 6 initial assets).
- Acceptance:
  - only 46-02 and 46-03 paths changed since `316c5f9`;
  - every commit since `316c5f9` is signed `G`;
  - `git -C services/console status --porcelain -- vue src` is empty;
  - `origin/thinx-staging..HEAD` = 13 (6 from 46-02 + 7 from this plan; nothing pushed).
- The parent gitlink was not bumped. The parent shows `M services/console` unstaged, which is left for 46-05.

## Files Created/Modified

- `vue/src/pages/Enviros/Enviros.vue`: page-local table, Edit value dialog, bulk toolbar and confirmation, load states, Add Variable row and dialog.
- `vue/src/store/enviros.js`: `loadItems()` (throws on failure) and the `refreshAfter` helper behind `createItem` / `deleteItems`. `fetchItems`, `headers` and the mutations are unchanged.
- `vue/src/styles/_settings-pages.scss`: `.enviro-key` (160px, 240px from md) and `.enviro-edit-key`.
- `vue/tests/unit/transformers-enviros.cjs`: 21 new checks (E1–E10, F1–F5, G1–G6).

## Decisions Made

- `loadItems` also rejects a success answer whose `response` is not an array. Before, `saveSimpleArray` would crash on it or list garbage.
- The bulk confirmation and the `DELETE` body list the names in table order, not in click order.
- A `showItems(items)` helper sets the rows and prunes the selection on every successful refresh (edit, add, delete and load).
- The add dialog's `aria-describedby` points both inputs at the one feedback line, because its messages are about the key (duplicate) or the request (failure).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A stored environment write was reported as failed when only the list refresh failed**
- **Found during:** Task 1
- **Issue:** `createItem` / `deleteItems` awaited `dispatch('fetchItems')` after a successful write. If that `GET /env` rejected, the action rejected. The edit dialog then said `<key> keeps its current value` although the PUT had already replaced it (D-04 copy turned false).
- **Fix:** a `refreshAfter` helper returns the write result plus `refreshed: false` in that case (the 46-02 / Phase 35 IN-02 pattern). The page closes, toasts and reloads once instead. The plan said `createItem` and `deleteItems` "stay as they are"; their request shape is unchanged and only the failed-refresh path differs. `fetchItems` is untouched, so Devices.vue is unaffected.
- **Files modified:** `vue/src/store/enviros.js`, `vue/src/pages/Enviros/Enviros.vue`, `vue/tests/unit/transformers-enviros.cjs` (E10, F3 last block)
- **Commit:** `aef5a22`

**2. [Rule 2 - Missing critical] Add could still overwrite a key when the list was not loaded**
- **Found during:** Task 3
- **Issue:** the duplicate check compares against `items`. That list is empty while the first load runs and after a failed load, which is exactly when UI-T25 keeps Add Variable usable. In that state a listed key would be sent and silently overwritten (T-46-13).
- **Fix:** `create` loads the list first when `loading || loadFailed`. While it still cannot be read, it refuses with `Could not add the variable. Try again.` and sends nothing; once loaded, the duplicate check applies. The check is covered by G6, which is in the Task 3 GREEN commit.
- **Files modified:** `vue/src/pages/Enviros/Enviros.vue`, `vue/tests/unit/transformers-enviros.cjs`
- **Commit:** `f2d26f8`

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical). **Impact:** both close a gap the plan's own threats name (T-46-16, T-46-13). There is no scope or API change, and the plan has seven console commits instead of six.

## Issues Encountered

None.

## Known Stubs

None. The two `placeholder="e.g. …"` attributes in the add dialog are input hints.

## User Setup Required

None.

## Next Phase Readiness

- 46-04 (Device Detail / editor) can keep extending `transformers-enviros.cjs` and `_settings-pages.scss`.
- 46-05 ships:
  - push `services/console` `thinx-staging` (13 commits ahead);
  - bump the parent gitlink;
  - run the UI-SPEC live check: edit `WIFI` on an account that also has `WIFI_SSID`, and confirm that both are still listed.

  The D6 backstops (long key wrapping, viewport overflow) are browser checks for that live pass.
- The 46-04 ledger line for Phase 48 FIX-01 can also cite `aef5a22` (the same IN-02 class of fix, for the enviros store).

## Self-Check: PASSED

- FOUND: services/console/vue/src/pages/Enviros/Enviros.vue, services/console/vue/src/store/enviros.js, services/console/vue/src/styles/_settings-pages.scss, services/console/vue/tests/unit/transformers-enviros.cjs
- FOUND (ancestors of console HEAD): 8e898de, 8b26ad6, aef5a22, 3e8ab8d, 11b8552, cbe7076, f2d26f8

---
*Phase: 46-transformers-environment-globals*
*Completed: 2026-10-13*
