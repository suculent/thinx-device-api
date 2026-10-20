---
phase: 44-device-list-parity
plan: 02
subsystem: vue-console
status: complete
tags: [vue, console, ui, devices, icons, accessibility, shared-components]
requires:
  - "44-01: src/utils/platforms.js (platformInfo build flag), _platforms.scss, device-list-parity.cjs harness"
provides:
  - "src/components/IconButton/IconButton.vue (props icon, label, variant, disabled; emits click only while enabled; inheritAttrs false), reused by Phases 45-47"
  - "src/fonts/icomoon/ (woff, ttf byte copies + _icomoon.scss): icomoon font face and .icomoon-hammer_icon only"
  - "_platforms.scss: .icon-button, .actions-cell, .device-status, .api-key-indicator, .status-alert, .status-warning, .firmware-cell, .device-firmware"
  - "Devices.vue: buildAction/buildDevice with buildingUdids guard, hasBuild/openLastBuild via BuildLogDialog, cleanStatus/statusText/statusTitle/statusHasError/statusHasWarning/missingApiKey"
affects: [44-03, 45, 46, 47, 48]
tech-stack:
  added: []
  patterns:
    - "Shared IconButton: one label is visible text (lg+), aria-label and wrapper tip; data-cy lands on the button"
    - "Per-device in-flight guard: reactive udid list released in finally"
    - "Control characters stripped with a charCodeAt scan, never a regex"
key-files:
  created:
    - services/console/vue/src/components/IconButton/IconButton.vue
    - services/console/vue/src/fonts/icomoon/_icomoon.scss
    - services/console/vue/src/fonts/icomoon/icomoon.woff
    - services/console/vue/src/fonts/icomoon/icomoon.ttf
  modified:
    - services/console/vue/src/pages/Devices/Devices.vue
    - services/console/vue/src/styles/_platforms.scss
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/tests/unit/device-list-parity.cjs
decisions:
  - "No space between the cogs glyph and the firmware text; the 8px gap is a margin-right rule on .fa-cogs, so the gap is exactly 8px"
  - "openLastBuild and buildDevice both guard their own disabled state, in addition to IconButton not emitting while disabled"
  - "Test colour parser accepts the orange keyword: compressed Dart Sass writes #FFA500 as orange"
metrics:
  duration: "10m 27s"
  started: 2026-10-13T11:38:17Z
  completed: 2026-10-13T11:48:44Z
  tasks: 3
  files: 8
actuals:
  tokens: 13026
  tasks: 3
  commits: 6
commits: 6
commits_repo: services/console
plan_head_before: 96957a61059bb1875191118715f85b72a7eee668
plan_head_after: 6a34102c123e11c7e3b780cd9d69c2befc673938
requirements: [DEV-02, DEV-03, DEV-05]
---

# Phase 44 Plan 02: Icon actions, Legacy status/firmware and the API-key warning Summary

Device rows and cards now use a shared `IconButton` for their actions. The table shows Build (Legacy icomoon hammer),
View log, Edit and Revoke on one line that never wraps, and the grid shows Build, View log and Edit. Build has an
in-flight guard that allows one request per device. View log opens the existing `BuildLogDialog` for `last_build_id`.
The Status column has the Legacy heartbeat, the `#e`/`#w` markers and an orange `fa-warning` for devices without an
API key. Firmware gets the cogs glyph.

All commits are in the console submodule (`services/console`, branch `thinx-staging`). `commits`, `plan_head_before`
and `plan_head_after` above are measured there (96957a6..6a34102). Nothing is pushed (console is 12 commits ahead of
`origin/thinx-staging`), and the parent gitlink is unchanged (44-03 bumps it).

## Tasks

| Task | Name | RED commit | GREEN commit | Files |
|------|------|------------|--------------|-------|
| 1 (tracer) | Edit opens Device Detail through the shared IconButton on a one-line actions cell (DEV-02, DEV-03) | fff5f31 | 8d993f4 | IconButton.vue, _platforms.scss, Devices.vue, device-list-parity.cjs |
| 2 | Build with the Legacy hammer and an in-flight guard, View log, Revoke icon, grid action row (DEV-02, DEV-03) | f108f1c | ad0fab6 | fonts/icomoon/{icomoon.woff, icomoon.ttf, _icomoon.scss}, theme.scss, Devices.vue, device-list-parity.cjs |
| 3 | Heartbeat status, firmware cogs and the missing-API-key warning in both views (DEV-02, DEV-05) | 03e307b | 6a34102 | Devices.vue, _platforms.scss, device-list-parity.cjs |

All six commits are GPG-signed (`%G?` = `G`).

## TDD Gate Compliance

Each pair is RED (`test(vue): …`), then GREEN (`feat(vue): …`).

- **Task 1 RED (fff5f31):** `node tests/unit/device-list-parity.cjs` exit 1, 6 FAIL. The three IconButton checks fail
  with `ENOENT … src/components/IconButton/IconButton.vue`. The other three are `one .table-responsive`,
  `Hotel last cell is .actions-cell` and the `.actions-cell` CSS check.
- **Task 2 RED (f108f1c):** exit 1, 10 FAIL: `Anvil one row-build`, `Anvil one card-build`,
  `vm.buildAction is not a function`, `Anvil order`, `Anvil one action row`, the BuildLogDialog ref check (`list`),
  `ENOENT … fonts/icomoon/icomoon.woff`, `one icomoon @font-face`, `{"success":true} one request` (the old
  `buildDevice` sent two) and the disabled-state no-request check.
- **Task 3 RED (03e307b):** exit 1, 7 FAIL: `Kilo one .device-status` (table and grid), `Kilo firmware-cell`,
  `Kilo one firmware line`, `vm.statusText is not a function`, `API-key tip defined once` and
  `.api-key-indicator colour undefined`.
- **GREEN:** after each GREEN commit, `LC_ALL=C npm --prefix services/console/vue run test:unit` exits 0 with 0
  `FAIL ` lines. device-list-parity.cjs ends with 52 `ok` lines (29 from 44-01 + 23 new, two of them async).

## Verification

- `LC_ALL=C npm --prefix services/console/vue run test:unit`: exit 0, 0 FAIL lines (whole chain, final tree).
- Production build (`NODE_OPTIONS=--openssl-legacy-provider … run build`): exit 0 after each task.
  - Task 1: the bundle has `icon-button__text` and `table-responsive`, and the CSS has `actions-cell`.
  - Task 2: the CSS has `icomoon-hammer_icon` and the icomoon font inlined as `data:font/woff` / `data:font/ttf`.
    The bundle has `No build yet`.
  - Task 3: the bundle has the D-14 sentence and `Device reported an error`, and the CSS has `api-key-indicator`.
- `test:csp:dist`: PASS (no inline JavaScript in public/dist index.html, enforced script policy).
- `perf:spotter`: all budgets passed. JS total 7.02 MiB raw / 2.76 MiB gzip, CSS total 616.63 KiB raw / 89.75 KiB
  gzip, 6 initial assets. The largest initial chunk is `js/app-legacy.*.js` at 753.57 KiB gzip, under the
  850000-byte budget; the cfff199 baseline was 751.82 KiB.
- `cmp` of both icomoon files against `services/console/src/assets/thinx/fonts/`: identical. theme.scss imports the
  partial exactly once.
- Forbidden-string grep over Devices.vue (`\x0`, `\x1`, `\u000`, `\u001`, `v-html`, the five category names,
  CATEGORY_COLORS, categoryColor, category-pill, `Platform:`): all 0. IconButton.vue has `inheritAttrs: false` once and
  no `v-html`.
- Hook counts in Devices.vue: each of `row-build`, `row-log`, `row-detail`, `row-revoke`, `card-build`, `card-log`,
  `card-detail`, `device-row`, `device-card` is 1. `Revoke this device? This cannot be undone.` is 1, and
  `<BuildLogDialog ref="buildLogDialog" />` is 1. `api-key-warning` is 2 and `fa fa-heartbeat` is 2 (table and grid).
- `git diff --name-only cfff199 HEAD`: exactly the 13 phase paths. `status --porcelain -- vue src` is empty, Legacy
  `src/` is untouched, and every commit cfff199..HEAD is `G`.
- Tracer gate (Task 1): interactive mode, `human_verify_mode` unset (end-of-phase default), and the verify is
  automated only. I re-ran the verify instead of stopping at a checkpoint; it passed and the plan continued.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test colour parser did not read the `orange` keyword**
- **Found during:** Task 3 GREEN
- **Issue:** compressed Dart Sass writes `color: #FFA500` as `color:orange`. The parser only knew `white`/`black`, hex,
  rgb(a) and hsl(a), so the API-key colour check failed against correct CSS.
- **Fix:** `parseColour` maps `orange` to 255,165,0.
- **Files modified:** device-list-parity.cjs
- **Commit:** 6a34102

**2. [Rule 3 - Blocking] Test harness needed listeners and async checks**
- **Found during:** Task 1 RED and Task 2 RED
- **Issue:** the 44-01 `expand()` did not pass the parent listeners, so an IconButton's `$emit('click')` could not reach
  the parent. The in-flight guard also needs awaited promises, and `check()` is synchronous.
- **Fix:** `expand()` passes `_parentListeners: opts.listeners`. A `checkAsync()` queue runs after the synchronous
  checks, and `process.exit` moved to its end.
- **Files modified:** device-list-parity.cjs
- **Commits:** fff5f31, f108f1c

**Discretion (not deviations):**
- The firmware markup has no space between `</i>` and the text. The plan's sample had one, but the 8px gap comes from
  `.firmware-cell > .fa-cogs, .device-firmware > .fa-cogs { margin-right: 8px }`, so the gap is exactly 8px (UI-D15).
- `openLastBuild` and `buildDevice` return early for their disabled states, on top of IconButton not emitting while
  disabled.
- The glyph size rule is `.icon-button .btn > i { font-size: 1rem }`. It beats Font Awesome's `.fa { font-size: inherit }`
  on specificity.

## Known Stubs

None.

## Deferred / Known Follow-ups

- `cypress/integration/devices.spec.js`:
  - DEVI-09 works only for fixture devices that have a source and a buildable platform. Without one, Build is now
    disabled with `No source` / `Not supported`.
  - The old text labels (`Detail`) are gone. Edit keeps the `row-detail` hook.
  - Phase 48 CI-07 repairs the suite; this plan changes no Cypress files.
- The two E5 backstops (one-line actions cell at 375/768/1024/1280px, and long status/firmware rendering live) are
  confirmed in 44-03.

## Threat Model Coverage

- **T-44-05:** status and firmware render through text interpolation and bound `title` only. There is no `v-html` in
  Devices.vue or IconButton.vue (grep-gated and unit-checked).
  - Control characters (code < 32 or 127) are dropped by a `charCodeAt` scan, and status is truncated to 22 characters.
  - The unit checks feed tab, BEL, DEL, US and NUL characters, a 200-character status and a 120-character firmware.
- **T-44-06:** `buildingUdids` disables Build while a request is in flight, and `buildDevice` returns early when the
  action is disabled. The udid is released in `finally` on success, failure and a rejected promise (unit-checked: one
  request for two clicks).
- **T-44-07:** `revokeRow` is unchanged. The unit check asserts the `Confirm Revoke` dialog text and options. Revoke is
  table-only and `danger`, and the bulk actions are untouched.
- **T-44-08:** View log opens only for a non-empty string `last_build_id`, via BuildLogDialog's existing store action.
- **T-44-09:** the font copies are byte-identical (cmp + `Buffer.equals`) and inlined as `data:` URIs under the
  unchanged CSP. `test:csp:dist` passes.
- **T-44-SC:** no installs, and no package.json or lock-file change in this plan.

No new security surface beyond the plan's threat model.

## Self-Check: PASSED

- FOUND: services/console/vue/src/components/IconButton/IconButton.vue
- FOUND: services/console/vue/src/fonts/icomoon/_icomoon.scss, icomoon.woff, icomoon.ttf
- FOUND: services/console/vue/src/styles/_platforms.scss, services/console/vue/tests/unit/device-list-parity.cjs
- FOUND (ancestors of console HEAD): fff5f31, 8d993f4, f108f1c, ad0fab6, 03e307b, 6a34102
