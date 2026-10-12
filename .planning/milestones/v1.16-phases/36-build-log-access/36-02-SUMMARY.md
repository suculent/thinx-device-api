---
phase: 36-build-log-access
plan: 02
subsystem: ui
tags: [vue, console, ui, build-log, gap-closure, cypress]

requires:
  - phase: 36-build-log-access
    provides: "36-01 BuildLogDialog + buildlog/fetchBuildDetail full-log path (BUILD-01)"
provides:
  - "Summary-only device Build History (date / build id / status) with a per-row Open build log button"
  - "Inline 'Device Logs (last build)' card and its dead data property removed from DeviceDetail.vue"
  - "renderDeviceDetail whole-page render test in milestone-v116.cjs"
  - "Cypress device-detail spec asserting no inline logs and button-only full-log fetch"
affects: [36-build-log-access UAT test 3, console deploy, deferred backend full-log payload]

actuals:
  tokens: 3200
  tasks: 2
  commits: 1
  console_commits: 3
plan_head_before: ddabcd8235fc73a5f94aeecb785dacf9b27b1a75
plan_head_after: 92eca3b7880e442300ff929cd2c1efc2f789f86f

tech-stack:
  added: []
  patterns:
    - "Whole-page Vue render test: compileToFunctions over the full SFC template, real data/computed/methods with spy overrides, real async loadDevice(), then vm._render() with a warnHandler that fails on any Vue warning"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/cypress/integration/device-detail.spec.js
    - services/console (parent gitlink)

key-decisions:
  - "G-36-3: device Build History rows are inert summary rows; the full build log loads only from the per-row Open build log button (BuildLogDialog), with no mouse row-click shortcut (unlike History.vue), per operator direction 2026-10-12"
  - "G-36-3: added a 'Log' header column for the button cell, mirroring History.vue's Log column"

patterns-established:
  - "Explicit per-row 'Open build log' b-button (data-cy build-open-log, aria-label 'Open build log <id>') is the only full-log trigger in build lists"

requirements-completed: [BUILD-01]

coverage:
  - id: D1
    description: "Device page renders no inline last-build log card, no pre and no log text after loadDevice()"
    requirement: BUILD-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs#G-36-3 device page has no inline last-build log card / renders no pre block / shows no build log text"
        status: pass
      - kind: e2e
        ref: "services/console/vue/cypress/integration/device-detail.spec.js#Should list builds without inline build logs (G-36-3)"
        status: unknown
    human_judgment: false
  - id: D2
    description: "Build History rows carry no role, tabindex or click/keydown/keyup listener; page load opens nothing"
    requirement: BUILD-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs#Build History row has no role / tabindex / click listener"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-row Open build log button opens exactly its own build in BuildLogDialog (only full-log path)"
    requirement: BUILD-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs#second Open build log button opens its own row's build"
        status: pass
      - kind: e2e
        ref: "services/console/vue/cypress/integration/device-detail.spec.js#Should open the full build log only from the Open build log button (G-36-3)"
        status: unknown
    human_judgment: false
  - id: D4
    description: "Live device page on rtm.thinx.cloud loads its history quickly and opens the full log only on the button (UAT test 3 re-run)"
    requirement: BUILD-01
    verification: []
    human_judgment: true
    rationale: "Operator's perceived speed and UX on the live rollout cannot be checked locally; needs /gsd-verify-work 36 after push, CI and Swarmpit rollout"

duration: 5min
completed: 2026-10-12
status: complete
---

# Phase 36 Plan 02: Summary-only device Build History (G-36-3) Summary

**The device Build History now lists only date, build id and status, and each row has an "Open build log" button that opens BuildLogDialog. The inline "Device Logs (last build)" card and the row-as-button full-log trigger are gone. A whole-page render test and the Cypress spec cover this.**

## Performance

- **Duration:** about 5 min of execution
- **Started:** 2026-10-12T11:39:18Z
- **Completed:** 2026-10-12T11:42:26Z (code and commits), followed by the SUMMARY and state updates
- **Tasks:** 2/2
- **Files modified:** 3 console files and the parent gitlink

## Accomplishments

- **G-36-3 missing item 1.** `DeviceDetail.vue` no longer has the inline last-build log card. Its data property and the `loadDevice` assignment that filled it are removed too.
- **G-36-3 missing item 2.** The Build History `<tr>` keeps only `v-for` and `:key`. It has no role, tabindex, click or keydown handlers, so browsing or tabbing the history never starts a full-log download.
- **G-36-3 missing item 3.** Each row has a `b-button` (`data-cy="build-open-log"`, `aria-label="Open build log <build_id>"`, `@click="openBuildLog(build)"`) in a new Log column. `openBuildLog` → `BuildLogDialog.open` is still the only path to the full log, so BUILD-01 still holds.
- History.vue, BuildLogDialog.vue, `store/buildlog.js` and `utils/buildLog.js` are byte-identical to d4b1b41, and the 35 WR-01 History checks still pass.

## Task Commits

Console (`services/console`, branch `thinx-staging`, all signature status `G`, **not pushed**):

1. **Task 1 RED:** `e84ef46` test(vue): add failing device build history checks (G-36-3)
2. **Task 1 GREEN:** `6bf96eb` fix(vue): keep device build history summary-only (G-36-3)
3. **Task 2:** `5e5783a` test(vue): cover summary-only device build history in e2e (G-36-3)

Parent (`thinx-device-api`, branch `thinx-staging`, signature `G`, **not pushed**):

4. **Task 2 gitlink bump:** `92eca3b7` chore(36): bump console to the device build history fix (G-36-3). It stages only `services/console`.

**Local HEADs:** console `5e5783a5cd0ba2503a68064e3a8aa0f013661a44`, parent `92eca3b7880e442300ff929cd2c1efc2f789f86f` before the docs commit. Both origins are unmoved: `origin/thinx-staging` in the console and the parent's `origin/thinx-staging:services/console` are still `d4b1b411c94d50ab378609a7e3f9a4dfb8b9843f`.

## Files Created/Modified

- `services/console/vue/src/pages/Devices/DeviceDetail.vue`:
  - Build History is summary-only, with a Log header and a per-row Open build log button.
  - The inline log card, the `deviceLogs` data and its `loadDevice` assignment are removed.
- `services/console/vue/tests/unit/milestone-v116.cjs`:
  - New `renderDeviceDetail(builds, dev)` helper. It renders the whole real template after the real `loadDevice()`, and fails on any render error or Vue warning.
  - Plus the G-36-3 checks, and the coverage line now includes "device build history without inline logs".
- `services/console/vue/cypress/integration/device-detail.spec.js`: the old inline-logs test is replaced by two G-36-3 tests:
  - no inline logs and inert rows;
  - the full log loads only from the button, with exactly one `GET /api/v2/logs/build/build-1`.
- `services/console`: the parent gitlink moves from d4b1b41 to 5e5783a.

## TDD Evidence

**RED** (commit `e84ef46`, run against the d4b1b41 `DeviceDetail.vue`):

```
$ LC_ALL=C node services/console/vue/tests/unit/milestone-v116.cjs   # rc=1
AssertionError [ERR_ASSERTION]: device page has no inline last-build log card
    at .../services/console/vue/tests/unit/milestone-v116.cjs:318:10
```

- **Semantic assessment.** The whole-page render finished with no render error and no Vue warning; those asserts come first. The first G-36-3 check then failed because the `card-device-logs` card was present. That is the planned assertion, failing for the planned reason.
- **Classifier.** `gsd-tools check tdd-red-evidence` on a `node --test --test-reporter=tap` rerun returned `INVALID_RED / fixture_or_load_failure`, which is a format limitation:
  - this harness is a plain `node:assert` script with no `test()` blocks, so TAP reports a single file-level failure and no named subtest;
  - the plan requires the file's existing style and allows no new dependency;
  - `workflow.tdd_mode` is not enabled and the plan is `type: execute`, so the plan-level gate does not apply.

  The record is kept in the session scratchpad, not in the repo.

**GREEN** (commit `6bf96eb`): the file exits 0 and prints the extended coverage line. The verify printed `DEVICE-HISTORY-GREEN` and `CONSOLE-HISTORY-COMMITTED`.

**Mutation proof** (Task 2, nothing committed; the file was restored with `git -C services/console checkout --` after each mutation and `status --short` is empty):

- (a) With `@click="openBuildLog(build)"` put back on the tbody `<tr>`, the run exits 1: `AssertionError [ERR_ASSERTION]: Build History row has no click listener` (milestone-v116.cjs:330).
- (b) With `@click` removed from the Open build log button, the run exits 1: `AssertionError [ERR_ASSERTION]: Open build log button has a click handler`.

## Verification Gates

- Task 1: `DEVICE-HISTORY-GREEN`, `CONSOLE-HISTORY-COMMITTED`
- Task 2: `E2E-SPEC-UPDATED`, `UNIT-SUITE-GREEN` (`LC_ALL=C npm --prefix services/console/vue run test:unit` rc=0, all six chained files), `LINT-CLEAN` (ESLint on the three files, no `--fix`, plus `git diff --check` over d4b1b41..HEAD), `GITLINK-BUMPED-UNPUSHED`
- **Cypress:** no Cypress binary is cached on this laptop, so the spec was checked statically only (`node --check`, ESLint, greps). It runs in console CI (`yarn test`, Cypress 9) after the orchestrator pushes.

## Decisions Made

- **Log header column (discretion).** A fourth `<th>Log</th>` holds the button cell, mirroring History.vue's Log column.
- **No row-click shortcut (discretion, operator direction).** History.vue has a guarded mouse row-click; the device rows stay fully inert, so the button needs no `.stop`.
- **"Open build log -> View".** No "View" control exists anywhere in the Vue console. Per the plan, the per-row button opens BuildLogDialog, and that dialog is the view.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cypress `have.attr` chain would have asserted the wrong subject**
- **Found during:** Task 2 (Cypress spec)
- **Issue:** The planned `.should('have.attr', 'aria-label', …).and('contain', 'Open build log')` changes the subject to the attribute value. The `contain` check would then pass on the aria-label string and never test the button text.
- **Fix:** Each attribute assertion and the text assertion run in their own `cy.get` chain. The asserted facts are unchanged.
- **Files modified:** services/console/vue/cypress/integration/device-detail.spec.js
- **Committed in:** `5e5783a`

---

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** the e2e assertion is now correct; no scope change.

## Issues Encountered

- The RED evidence classifier cannot read this assert-script format (see TDD Evidence). The semantic RED assessment is recorded instead.

## Deferred

- **Backend full-log payload size.** `GET /api/v2/logs/build/:id` is heavy:
  - `lib/thinx/buildlog.js` `_fetch` reads the whole `build.log` with `fs.readFileSync` from GlusterFS (`/mnt/gluster/thinx/deploy`) on the API event loop;
  - `lib/thinx/util.js` `respond` JSON-serializes the Node Buffer as a `{type:'Buffer',data:[…]}` byte array, about 3.4x the log size (a 2 MB log becomes 6.8 MB of JSON);
  - neither Traefik nor Express compresses it.

  After this plan the request is made only on an explicit "Open build log", but the opened dialog stays as slow as the payload. Possible directions, not planned here: return the log as a string, add compression, cap the size or load the tail first. Source: `.planning/debug/device-build-history-full-logs.md` (missing item 3).

## User Setup Required

None.

## Next Phase Readiness

The orchestrator should:

1. push console `thinx-staging` (fast-forward d4b1b41 → 5e5783a);
2. then push the parent `thinx-staging` (gitlink 5e5783a);
3. let CI run the unit suites and Cypress `device-detail.spec.js`, and Swarmpit roll out the console;
4. re-run UAT test 3 with `/gsd-verify-work 36`.

---
*Phase: 36-build-log-access*
*Completed: 2026-10-12*

## Self-Check: PASSED

All three console files and this SUMMARY exist. Console commits e84ef46, 6bf96eb and 5e5783a and parent commit 92eca3b7 are ancestors of their HEADs.
