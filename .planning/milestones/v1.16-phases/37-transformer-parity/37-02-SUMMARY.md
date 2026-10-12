---
phase: 37-transformer-parity
plan: 02
subsystem: ui
tags: [vue, console, bootstrap-vue, transformers, gap-closure, G-37-5]
status: complete
gap_closure: true
gap_ids: [G-37-5]

requires:
  - phase: 37-transformer-parity
    provides: "37-01 transformer selector and create-and-assign on device detail (35 WR-02 assignment semantics)"
provides:
  - "Device detail Transformer Assignment card: one stacked checkbox per transformer on editForm.transformers"
  - "Empty-state line when the profile has no transformers"
  - "Manage Transformers as a filled orange (warning) button"
  - "Whole-page render checks (unit) and Cypress e2e for the checkbox card and button colour"
affects: [37-transformer-parity UAT test 5, console CI Cypress device-detail spec]

actuals:
  tokens: 3400
  tasks: 2
  commits: 1
  console_commits: 3
plan_head_before: 46e4a91c304d429af5c6b11dde0da65051041ac7
plan_head_after: 04455f8c348ceda73ec0c2d1d452398687ce5bb0
console_head_before: 38eb95b3e932072df29e4b112ecaa4ab031fe287
console_head_after: 4cbf1dad8c6f5854cda749b9bbf76a2e52f0b9c5

tech-stack:
  added: []
  patterns:
    - "b-form-checkbox-group stacked + v-if/v-else empty-state line on the same v-model the old control used"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/cypress/integration/device-detail.spec.js
    - services/console (parent gitlink)

key-decisions:
  - "G-37-5: device transformer assignment is one stacked b-form-checkbox-group on editForm.transformers/transformerOptions (no multi-select); Manage Transformers is variant=warning ($orange #E49400) per operator 2026-10-12"
  - "Empty-state wording 'No transformers yet. Use Create & Assign to add one.' is an executor/planner discretion choice (orchestrator brief), not operator text"

patterns-established:
  - "renderDeviceDetail(builds, dev, transformerItems) third argument feeds getTransformers for whole-page card checks"

requirements-completed: [TRANS-02]

coverage:
  - id: D1
    description: "Transformer Assignment card shows one stacked checkbox per transformer, checked for the assigned ones, bound to editForm.transformers"
    requirement: TRANS-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs (G-37-5 block)"
        status: pass
      - kind: e2e
        ref: "services/console/vue/cypress/integration/device-detail.spec.js#Should display transformer assignment section (DEVI-11)"
        status: unknown
  - id: D2
    description: "Save Transformers sends the checkbox state as changes.transformers"
    requirement: TRANS-02
    verification:
      - kind: unit
        ref: "milestone-v116.cjs: model callback + real saveTransformers payload"
        status: pass
      - kind: e2e
        ref: "device-detail.spec.js#Should save the transformer assignment from the checkboxes (G-37-5)"
        status: unknown
  - id: D3
    description: "Manage Transformers is a filled orange button routing to /app/transformers"
    requirement: TRANS-02
    verification:
      - kind: unit
        ref: "milestone-v116.cjs: variant warning, to, data-cy, ml-2"
        status: pass
      - kind: e2e
        ref: "device-detail.spec.js: btn-warning, not btn-link, background-color rgb(228, 148, 0)"
        status: unknown
      - kind: manual_procedural
        ref: "UAT test 5 re-run via /gsd-verify-work 37 after push and rollout"
        status: unknown
  - id: D4
    description: "Empty profile shows the empty-state line and keeps all three buttons"
    requirement: TRANS-02
    verification:
      - kind: unit
        ref: "milestone-v116.cjs: ePage empty-state checks"
        status: pass

duration: 3min
completed: 2026-10-12
---

# Phase 37 Plan 02: Transformer checkboxes and orange Manage Transformers Summary

**The device detail Transformer Assignment card now shows one stacked BootstrapVue checkbox per transformer, bound to the same `editForm.transformers` as before, with an empty-state line. Manage Transformers is now a filled orange `variant="warning"` button instead of a transparent link. A whole-page render test and a Cypress spec cover both changes.**

## Operator feedback closed (G-37-5)

- UAT test 5, 2026-10-12: "pass, but the list of transformers should have checkboxes rather than selecting lines to see which of those are enabled for the device"
- Additional requirement, 2026-10-12: "The "Manage transformers" button should be at least with orange background (not clear/transparent)."

## Performance

- **Duration:** about 3 min of execution (12:25:02Z to 12:28:04Z, plus the SUMMARY)
- **Tasks:** 2/2
- **Files modified:** 3 console files plus the parent gitlink

## Accomplishments

- `b-form-select multiple` is replaced by `b-form-checkbox-group` (`v-if="transformerOptions.length"`, `v-model="editForm.transformers"`, `:options="transformerOptions"`, `stacked`, `data-cy="transformer-checkboxes"`).
- When the profile has no transformers, a `v-else` line `data-cy="transformers-empty"` reads "No transformers yet. Use Create & Assign to add one."
- Manage Transformers: `variant="warning" size="sm" class="ml-2" to="/app/transformers" data-cy="manage-transformers"`.
- The two comments in `createTransformer` that named the old control now refer to the checkboxes. No logic changed in createTransformer, saveTransformers, loadDevice or transformerOptions.
- `renderDeviceDetail` takes an optional third argument, `transformerItems`. The new G-37-5 block checks:
  - the group count, and that there is no select and no `multiple` attribute;
  - `stacked` and data-cy;
  - the options (value/text only, equal to `transformerOptions`);
  - the model expression, value identity and callback;
  - the real `saveTransformers` payload;
  - the three buttons and Manage Transformers' variant, route, data-cy and class;
  - the empty state.
- The Cypress DEVI-11 transformer test now asserts the checkbox, not a select. It also checks the `btn-warning` class, the href and the computed `rgb(228, 148, 0)` background. A new G-37-5 test unticks passthrough and checks the exact PUT body `{ changes: { udid: 'udid-z', transformers: [] } }`.

## Task Commits

Console (`services/console`, branch `thinx-staging`, all signature status G, **not pushed**):

1. **Task 1 RED:** `5f0d73a` test(vue): add failing transformer checkbox checks (G-37-5)
2. **Task 1 GREEN:** `1f0626c` fix(vue): show device transformers as checkboxes (G-37-5)
3. **Task 2:** `4cbf1da` test(vue): cover transformer checkboxes in e2e (G-37-5)

Parent (`thinx-staging`, signature G, **not pushed**):

4. **Task 2 gitlink bump:** `04455f8c` chore(37): bump console to the transformer checkbox fix (G-37-5). Only `services/console` is staged.

Local HEADs: console `4cbf1dad8c6f5854cda749b9bbf76a2e52f0b9c5`, parent `04455f8c348ceda73ec0c2d1d452398687ce5bb0`. Both `origin/thinx-staging` refs are still at `38eb95b` (console and the origin gitlink).

## TDD Gate Compliance

- **RED** (`5f0d73a`, against console 38eb95b): `LC_ALL=C node services/console/vue/tests/unit/milestone-v116.cjs` exited 1 on
  `AssertionError [ERR_ASSERTION]: Transformer Assignment card renders exactly one checkbox group` / `0 !== 1` (line 372). This is the first G-37-5 check, so the failure comes from the missing feature, not from the harness.
- **GREEN** (`1f0626c`): the same file exits 0, and its coverage line now includes "transformer assignment checkboxes". TRANSFORMER-CHECKBOXES-GREEN and CONSOLE-CHECKBOXES-COMMITTED were printed.
- **REFACTOR:** none needed.
- **Tracer gate:** interactive mode, `end-of-phase`, and the verify step is automated-only. The re-run passed, so Task 2 went ahead without a checkpoint.

## Mutation evidence

Both mutations were applied to the committed DeviceDetail.vue, run once each, and reverted with `git -C services/console checkout -- vue/src/pages/Devices/DeviceDetail.vue`. `git -C services/console status --short` was empty afterwards.

- (a) Deleted `v-model="editForm.transformers"` from the checkbox group. The run exited 1 with `AssertionError [ERR_ASSERTION]: checkbox group is bound with v-model` (line 381).
- (b) Set Manage Transformers back to `variant="link"`. The run exited 1 with `AssertionError [ERR_ASSERTION]: Manage Transformers is a filled orange (warning) button, not a link` / `'link' !== 'warning'`.

## Verification

- E2E-SPEC-UPDATED: `node --check` and the static greps pass, and ESLint is clean on the spec.
- UNIT-SUITE-GREEN: `LC_ALL=C npm --prefix services/console/vue run test:unit` exits 0. The 35 WR-02 create-and-assign checks and the G-36-3 checks still pass.
- LINT-CLEAN: ESLint (`ESLINT_USE_FLAT_CONFIG=false`, no `--fix`) passes on the three files, and `git diff --check 38eb95b..HEAD` is clean.
- BUILD-GREEN: `vue-cli-service build --dest <mktemp -d>` reports "Build complete" and leaves the console worktree clean.
- GITLINK-BUMPED-UNPUSHED: the gitlink equals console HEAD and the bump commit touches only `services/console` with signature G. Only the three listed console files changed, with 3 commits, all G. The stores, Transformers pages, styles, Cypress support and fixtures, and package.json are untouched. No remote ref moved.
- **Cypress was checked statically only.** No Cypress binary is cached on this laptop. The spec runs in console CI (`yarn test`, Cypress 9) after the orchestrator pushes.

## Decisions Made

- The empty-state wording "No transformers yet. Use Create & Assign to add one." is a discretion choice made per the orchestrator brief. The UAT gap said "empty state unchanged", and before this change there was no empty state at all.
- Both pieces of operator feedback concern the same card, so both are tracked under G-37-5.

## Deviations from Plan

None. The plan was executed as written.

## Not in scope (recorded, not implemented)

- **Assigned utids that no longer exist.** If a transformer utid is assigned to the device but is missing from the profile list, it gets no checkbox. The old multi-select had no option for it either. Save Transformers keeps such a utid because the bound array still holds it. Showing orphaned assignments would be a separate follow-up; G-37-5 asks only for checkboxes in place of the highlighted-line list.

## Next Steps (orchestrator)

1. Push console `thinx-staging` (a fast-forward from 38eb95b to 4cbf1da), then push the parent `thinx-staging` (04455f8c).
2. Console CI runs the unit suites and Cypress, including the new device-detail checks. CircleCI builds the images and Swarmpit rolls them out.
3. Re-run UAT test 5 with `/gsd-verify-work 37` once the rollout is live.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: services/console/vue/src/pages/Devices/DeviceDetail.vue (contains `data-cy="transformer-checkboxes"`)
- FOUND: services/console/vue/tests/unit/milestone-v116.cjs (contains "transformer assignment checkboxes")
- FOUND: services/console/vue/cypress/integration/device-detail.spec.js (contains `transformer-checkboxes`)
- FOUND commits: console 5f0d73a, 1f0626c, 4cbf1da (ancestors of console HEAD); parent 04455f8c (HEAD)
