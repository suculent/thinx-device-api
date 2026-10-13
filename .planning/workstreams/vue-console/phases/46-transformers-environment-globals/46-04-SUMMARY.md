---
phase: 46-transformers-environment-globals
plan: 04
subsystem: ui
status: complete
tags: [vue, console, ui, device-detail, transformers, unsaved-changes, router-guard, cypress, review-ledger]

requires:
  - phase: 46-transformers-environment-globals
    provides: "46-02 _settings-pages.scss and the transformers-enviros.cjs harness, 35 IN-02 fix ed429ec; 46-03 environment states (build on its unpushed console commits)"
provides:
  - "src/utils/confirmLeave.js confirmLeave(vm) -> Promise<boolean>: the one unsaved-changes confirm (Keep editing focused, true only for OK)"
  - "Device Detail transformersDirty (set comparison), beforeRouteLeave with one dialog per leave attempt (leavePrompting)"
  - "Transformer Assignment card: h4 head with a role=status Unsaved changes note, action row, single-shot Save with Saving state, in-card result alerts"
  - "TransformerEditor says Name, Save Transformer (success) / Back to Transformers (default), shared leave guard"
  - "Cypress device-detail.spec.js names the colour source and asserts Transformers saved. (37 IN-03)"
  - "37-REVIEW-DISPOSITION open: 0; ROADMAP Phase 48 Closed in Phase 46 ledger line for 35 IN-02"
affects: [46-05-ship, 48-FIX-01-ledger, 48-CI-07]

actuals:
  tokens: 10400
  tasks: 3
  commits: 8
plan_head_before: f2d26f893f13a9a04d524e4ff0f60beb2789d9b1
plan_head_after: a16307ab02d1d35cea2e6bd042756772df4b59fd
parent_plan_head_before: 533089339d63e3df222597e4db877c16711e8dc5
parent_plan_head_after: 172efe7500d0aea59aa0cbbdb0464b63e989161d

tech-stack:
  added: []
  patterns:
    - "Route-leave guard: clean -> next(); leavePrompting -> next(false) at once; else await confirmLeave(this) and next() / next(false)"
    - "Card result messages cleared by the checkbox group's user change event, never by a watcher, so the post-save reload cannot wipe them"
    - "Save writes the success message before the reload, outside the request try/catch, so a reload problem is never reported as a failed save"

key-files:
  created:
    - services/console/vue/src/utils/confirmLeave.js
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/src/pages/Transformers/TransformerEditor.vue
    - services/console/vue/src/styles/_settings-pages.scss
    - services/console/vue/tests/unit/transformers-enviros.cjs
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/cypress/integration/device-detail.spec.js
    - .planning/milestones/v1.16-phases/37-transformer-parity/37-REVIEW-DISPOSITION.md
    - .planning/workstreams/vue-console/ROADMAP.md

key-decisions:
  - "confirmLeave is a plain export function returning a promise chain (the plan's grep needs 'export function confirmLeave'); a synchronous throw from msgBoxConfirm also resolves false"
  - "TransformerEditor got the same leavePrompting flag as Device Detail (UI-T17 one dialog per leave attempt), not only the shared confirm"
  - "saveTransformers only treats the updateDevice call as the save outcome; once it succeeds, Transformers saved. is set before loadDevice(), so a reload problem cannot turn a stored write into a reported failure (T-46-20)"
  - "37 IN-02 is recorded as fixed by console dac2c5e (leave guard) and d526ff7 (dirty and saving states); IN-03 by a16307a (Cypress)"

patterns-established:
  - "transformers-enviros.cjs: deviceHarness / saveHarness for DeviceDetail.vue, confirmRecorder for $bvModal.msgBoxConfirm, leave() for beforeRouteLeave"

requirements-completed: [POL-03, FIX-03]

coverage:
  - id: D1
    description: "confirmLeave(vm): one msgBoxConfirm with the Unsaved Changes options; true only for OK; false for false/null/undefined/reject/throw"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#H1"
        status: pass
    human_judgment: false
  - id: D2
    description: "transformersDirty as sets; Device Detail and TransformerEditor beforeRouteLeave ask only when dirty, one dialog per attempt, no beforeunload"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#H2, H3, H4"
        status: pass
    human_judgment: false
  - id: D3
    description: "Transformer Assignment card head, note, action row, single-shot Saving state, in-card success/error alerts, tick clears them, create dialog close title, styles"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#I1-I8; milestone-v116.cjs"
        status: pass
    human_judgment: false
  - id: D4
    description: "TransformerEditor Name copy, Save Transformer / Back to Transformers, blank-name copy, forbidden strings absent"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#J1"
        status: pass
    human_judgment: false
  - id: D5
    description: "Cypress device-detail.spec.js colour source comment and Transformers saved. assertion (not run until Phase 48 CI-07)"
    requirement: FIX-03
    verification:
      - kind: static
        ref: "node --check services/console/vue/cypress/integration/device-detail.spec.js"
        status: pass
    human_judgment: false
  - id: D6
    description: "37-REVIEW-DISPOSITION IN-02/IN-03 fixed, open: 0; ROADMAP Phase 48 Closed in Phase 46 line for 35 IN-02 (ed429ec)"
    requirement: FIX-03
    verification:
      - kind: static
        ref: "plan Task 3 verify command 2"
        status: pass
    human_judgment: false

duration: ~17min
completed: 2026-10-13
---

# Phase 46 Plan 04: Device Detail Unsaved Transformer Ticks and Editor Naming Summary

**Device Detail no longer drops ticked transformers silently: a shared `confirmLeave` dialog (Keep editing focused) guards every route leave while the ticks differ from the stored set, and the Transformer Assignment card shows an `Unsaved changes` note, a single-shot `Saving…` state and its own save result. The editor now says Name and uses the same leave dialog. 37 IN-02/IN-03 are recorded as fixed, and 35 IN-02 has its entry in the Phase 48 ledger.**

## Performance

- **Duration:** ~17 min
- **Completed:** 2026-10-13T21:23Z
- **Tasks:** 3
- **Files modified:** 9 (1 created)

## Accomplishments

- `src/utils/confirmLeave.js`: `confirmLeave(vm)` opens `You have unsaved changes. Leave anyway?` with title `Unsaved Changes`, OK `Leave without saving` (warning) and `Keep editing` focused. It resolves true only for an explicit OK.
- Device Detail: `transformersDirty` compares the ticks with `device.transformers` as sets. `beforeRouteLeave` leaves at once when clean and asks when dirty. A second attempt while the dialog is open gets `next(false)` straight away. There is no `beforeunload`.
- Transformer Assignment card (UI-T15/UI-T16):
  - The card now opens with `h4.card-title` and a `span.unsaved-note[role=status]`.
  - The three buttons sit in `.transformer-card-actions`: Save (success, disabled when clean or saving), Create & Assign (default) and Manage Transformers (warning, unchanged).
  - Saving shows a spinner with `Saving…` and locks the checkboxes, Save and Create & Assign.
  - `Transformers saved.` and `Could not save the transformers. Try again.` appear inside the card. A failed save keeps the ticks, and a user tick clears both messages.
  - The create dialog says `Close without creating`, and the empty line is body text.
- TransformerEditor:
  - The field label is `Name`.
  - Save reads `Save Transformer` (success) or `Saving…` with U+2026. The second button reads `Back to Transformers` (default).
  - A blank name gives `Enter a transformer name.`
  - Leaving uses the shared confirm.
- Cypress: the colour comment names `$orange: #E49400 (src/styles/_variables.scss:47) → .btn-warning`. The save test checks the dirty note, the enabled Save, the request body and then `Transformers saved.` inside the card.
- Records: `37-REVIEW-DISPOSITION.md` now has IN-02 `fixed (console dac2c5e, d526ff7)`, IN-03 `fixed (console a16307a)` and `open: 0`. ROADMAP Phase 48 has a **Closed in Phase 46** block naming Phase 35 IN-02 and console `ed429ec`.

## Task Commits

Console submodule (`services/console`, branch thinx-staging, all signed `G`, not pushed):

1. **Task 1 (tracer): shared leave confirm**: RED `25c20d4` (test), GREEN `dac2c5e` (feat)
2. **Task 2: card dirty, saving and result states**: RED `1a604bf` (test), GREEN `d526ff7` (feat)
3. **Task 3: editor Name copy and Cypress IN-03**: RED `75624ce` (test), GREEN `8c354de` (feat), Cypress `a16307a` (test)

Parent (`thinx-device-api`, branch thinx-staging, signed `G`, not pushed):

- `172efe75` docs(46-04): record 37 IN-02 and IN-03 fixed and 35 IN-02 for the FIX-01 ledger. The commit holds exactly the two planning files.

## TDD Gate Compliance

- **Task 1 RED (`25c20d4`)**: the RED run had 4 FAIL lines:
  - `FAIL H1 … (ENOENT: … src/utils/confirmLeave.js)`
  - `FAIL H2 … (order is ignored)`: `transformersDirty` was undefined.
  - `FAIL H3 … (DeviceDetail has a beforeRouteLeave guard)`
  - `FAIL H4 … (changes: the shared confirm)`: the old inline `okTitle: 'Leave'` options.

  Every failure comes from missing behaviour, with no load or syntax fault. GREEN `dac2c5e` passes them.
- **Task 2 RED (`1a604bf`)**: 8 FAIL lines (I1..I8), each failing on the planned behaviour:
  - I1: the card still had a title prop.
  - I2: there was no action row.
  - I3: two calls sent two requests.
  - I4/I5: the old page-level messages.
  - I6: no change handler.
  - I7: no `cancel-title`.
  - I8: no `.transformer-card-head` rule.

  `milestone-v116.cjs` failed `the card has one .transformer-card-actions row`. GREEN `d526ff7` passes all of them.
- **Task 3 RED (`75624ce`)**: `FAIL J1 … (field label)`. GREEN `8c354de` passes it.
- **Tracer feedback gate (Task 1)**: interactive mode, `human_verify_mode: end-of-phase`, automated-only verify. Both verify commands were re-run after the GREEN commit and passed, so the plan continued to Task 2.

## Verification

- `LC_ALL=C npm --prefix services/console/vue run test:unit` and the same command without `LC_ALL=C`: both exit 0 with 0 `FAIL ` lines.
- Task 2 region gate (card and create dialog have no `text-muted` and no `ml-2`, the dialog has its `cancel-title`, the old failure copy is gone, the action row exists) and the bundle greps (`transformers-dirty`, the save error copy, `unsaved-note` in the CSS): exit 0.
- Editor forbidden strings: none found. `node --check` on the Cypress spec passes. The disposition and ROADMAP greps pass.
- Production build passes, and the bundle contains `Leave without saving`, `Keep editing`, `Back to Transformers` and `Save Transformer`.
- `test:csp:dist`: PASS on all three checks.
- `perf:spotter` passes all budgets: JS 7.09 MiB raw / 2.78 MiB gzip, CSS 620.01 KiB raw / 90.37 KiB gzip, 6 initial assets.
- `git -C services/console diff --name-only 316c5f9 HEAD` lists exactly the sixteen Phase 46 paths. `git diff --quiet 316c5f9 HEAD -- src` exits 0, so Legacy is unchanged. Every console commit since 316c5f9 is signed `G`.
- Nothing pushed: the console is 20 commits ahead of origin/thinx-staging, and the parent has its local commits only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] A reload failure is never reported as a failed save**
- **Found during:** Task 2
- **Issue:** if `saveTransformers` wraps `updateDevice` and `loadDevice()` in one try/catch, a throw from the reload would set `Could not save the transformers.` after the write had been stored (T-46-20).
- **Fix:** the request has its own inner try/catch. Only its answer decides success or failure. `Transformers saved.` is set before the reload, and `transformersSaving` is cleared in `finally`.
- **Files modified:** services/console/vue/src/pages/Devices/DeviceDetail.vue
- **Commit:** d526ff7

**2. [Rule 2 - Consistency] The editor also refuses a second leave while its dialog is open**
- **Found during:** Task 1
- **Issue:** the plan asked for "the same shape keyed on `hasChanges`". UI-T17 requires one dialog per leave attempt.
- **Fix:** TransformerEditor data gains `leavePrompting`, and its guard has the same shape as Device Detail's.
- **Files modified:** services/console/vue/src/pages/Transformers/TransformerEditor.vue
- **Commit:** dac2c5e

Otherwise the plan ran as written.

## Issues Encountered

None.

## Observations (not changed)

- Device Detail's `revokeDevice` and `transferDevice` call `$router.push('/app/devices')` after success. While ticks are unsaved, the leave confirm appears then too. This matches "every route leave" (UI-T16) and is left as is. The Transfer modal is out of scope.
- `$router.push` from a guarded page rejects its promise when the guard answers `next(false)` (vue-router 3). This behaviour predates the plan (the editor's `cancel()` already did this) and has no visible effect.

## Next Phase Readiness

- 46-05 ships: push the console submodule (`25c20d4..a16307a` on top of the 46-02 and 46-03 commits), then bump the parent gitlink and push the parent to `thinx-staging`.
- Live check after deploy (UI-SPEC): tick a box on Device Detail, click Manage Transformers and confirm the `Unsaved Changes` prompt appears.
- The Phase 48 FIX-01 ledger can cite console `ed429ec` (35 IN-02), `dac2c5e` / `d526ff7` (37 IN-02) and `a16307a` (37 IN-03). The Cypress spec runs once CI-07 makes the suite green.

## Self-Check: PASSED

- FOUND: services/console/vue/src/utils/confirmLeave.js
- FOUND (console ancestors of HEAD): 25c20d4, dac2c5e, 1a604bf, d526ff7, 75624ce, 8c354de, a16307a
- FOUND (parent ancestor of HEAD): 172efe75
