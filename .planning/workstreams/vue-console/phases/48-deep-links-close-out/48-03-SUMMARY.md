---
phase: 48-deep-links-close-out
plan: 03
subsystem: ui
tags: [vue, console, ui, accessibility, device-detail, header, device-list, contrast, bootstrap-vue]

requires:
  - phase: 48-01
    provides: close-out-v118.cjs harness (loadSfc, renderPage, Sass helpers, deviceDetailPage and header loaders)
  - phase: 44
    provides: Devices.vue buildDevice / buildFailure pattern (44 IN-01), platform pills, utils/platforms.js
provides:
  - "DeviceDetail.vue: buildPending in-flight state, buildFailure, focus restore, sr-only status, device-detail-content column (POL-01, D-17, D-18)"
  - "src/styles/_device-detail.scss: .device-detail-content { max-width: 1140px } imported after build-log"
  - "Header.vue: account menu toggle la-user-circle with title Account and sr-only name Account menu (D-16); Header.scss .account-menu-icon"
  - "_overrides.scss: .alert-danger white text and close button (5.01:1) (D-14)"
  - "utils/platforms.js: exported comparePlatformKeys(a, b), shared by the platform pills and the Platform sort (D-14)"
  - "Devices.vue: labelled light/outline-light view toggles with aria-pressed, focusable markers with v-b-tooltip.hover.focus, checkbox-<udid> ids (D-14); _platforms.scss marker focus ring"
  - "close-out-v118.cjs checks F1..F8, W1..W2, M1..M2, C1..C2, L1..L8"
affects: [48-05, 48-06]

actuals:
  tokens: 16978
  tasks: 3
  commits: 7
plan_head_before: 794f3576ee2bed377473f7e7df778098dd723b99
plan_head_after: 852fef566b77eb5fcc5af48aa2109570c6797a13

tech-stack:
  added: []
  patterns:
    - "One component flag guards a request button: early return, reset in finally, focus restored on $nextTick only if the button had focus"
    - "A shared comparator in the platform module keeps two orderings (pills, table sort) identical"
    - "Harnesses that render templates with v-b-tooltip register a no-op Vue.directive('b-tooltip', {})"

key-files:
  created:
    - services/console/vue/src/styles/_device-detail.scss
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/src/components/Header/Header.vue
    - services/console/vue/src/components/Header/Header.scss
    - services/console/vue/src/styles/_overrides.scss
    - services/console/vue/src/pages/Devices/Devices.vue
    - services/console/vue/src/utils/platforms.js
    - services/console/vue/src/styles/_platforms.scss
    - services/console/vue/tests/unit/close-out-v118.cjs
    - services/console/vue/tests/unit/device-list-parity.cjs

key-decisions:
  - "buildFailure is copied into DeviceDetail.vue (same rule and comment as Devices.vue) rather than moved to a util: two call sites, and the plan names the copy"
  - "comparePlatformKeys runs every argument through basePlatform, so it takes keys or raw platform strings; equal base keys compare 0, unknown sorts last, else lower-cased label localeCompare"
  - "M2 compiles Header.scss itself (the component stylesheet), because Header.scss is not part of theme.scss; the bundle check confirms .account-menu-icon reaches dist/css"
  - "The content inside device-detail-content is re-indented two spaces; git diff -w shows only the wrapper and button lines changed"

patterns-established:
  - "close-out-v118.cjs prefixes: A, I, H, N, R, T, E (48-01); F, W, M, C, L (48-03)"

requirements-completed: [POL-01, FIX-01]

coverage:
  - id: D1
    description: "Build Firmware on Device Detail is disabled with a small spinner from the click until POST /build settles, keeps its label, announces Requesting build…, sends one request per click, shows the API reason or Build failed., and restores focus only when it had focus"
    requirement: POL-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#F1..F8"
        status: pass
      - kind: other
        ref: "plan Task 1 verify 2 (grep gates + production build + bundle grep for action-build-spinner and Requesting build)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Device Detail alerts, Actions card and card row sit in device-detail-content capped at 1140px, left-aligned; breadcrumb, title, modals and loading / not-found states outside"
    requirement: POL-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#W1,W2"
        status: pass
      - kind: other
        ref: "grep 'device-detail-content{max-width:1140px}' dist/css/app.*.css"
        status: pass
    human_judgment: false
  - id: D3
    description: "Header account menu toggle is a la-user-circle glyph with an Account tip and the accessible name Account menu; My Profile and Log Out unchanged"
    requirement: POL-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#M1,M2"
        status: pass
    human_judgment: false
  - id: D4
    description: "Danger alerts have white text and a white close button (5.01:1 on #C93C3C); other alert variants unchanged"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#C1,C2"
        status: pass
    human_judgment: false
  - id: D5
    description: "Device list: labelled view toggles with aria-pressed, keyboard-focusable markers with hover/focus tips and a focus-visible ring, Platform sort by label like the pills, checkbox-<udid> ids"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#L1..L8"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/device-list-parity.cjs (67 ok, both locales)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A Device Detail danger alert with a 300-character API reason wraps inside the 1140px column with computed white text and a visible, clickable close button (UI E7 backstop)"
    requirement: POL-01
    verification: []
    human_judgment: true
    rationale: "Computed colour and wrapping need a real browser; the UI-SPEC routes this to the backstop (console-retest / 48-05 Cypress), unit checks prove only the compiled rule"

duration: 17min
completed: 2026-10-15
status: complete
---

# Phase 48 Plan 03: POL-01 polish and the carried Phase 44 Vue items Summary

**Build Firmware on Device Detail now ignores repeat clicks while `POST /build` is in flight: the button is disabled, shows a spinner and has a screen-reader status. The detail content column stops at 1140px. The header account menu is a user icon named "Account menu". Danger alerts use white text (5.01:1). On the device list, the view toggles have names and pressed state, the warning markers take keyboard focus and show their tips, the Platform sort uses the same comparator as the pills, and checkbox ids come from the udid.**

All commits are in the `services/console` submodule on `thinx-staging`. They are signed (`%G?` = `G`) and not pushed: `origin/thinx-staging` is still `54734af`, and the branch is 13 commits ahead (6 from 48-01, 7 from 48-03). `commits`, `plan_head_before` and `plan_head_after` count the console repo. The parent gitlink is still modified and unstaged; 48-06 bumps it.

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-15T15:20:29Z
- **Completed:** 2026-10-15T15:37:52Z
- **Tasks:** 3 (plus one extra test commit for L7, see Deviations)
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- **POL-01, D-17.** `buildDevice()` starts with `if (this.buildPending) return;`. It clears both alerts, sets `buildPending`, awaits `buildFirmware({ udid, source_id })`, maps a throw to `{ success: false }` and resets the flag in `finally`. Then it shows `Build triggered.` or `buildFailure(result)`. While pending, the button (`data-cy="action-build"`, `ref="buildButton"`) is disabled and shows `b-spinner small` (`action-build-spinner`) in place of the cog, and the label stays `Build Firmware`. The `sr-only` `role="status"` span (`action-build-status`) reads `Requesting build…`. Focus returns to the button on `$nextTick` only if it had focus at click time.
- **POL-01, D-18.** The two alerts, the Actions card and the card row sit in `div.device-detail-content` (`data-cy="device-detail-content"`). The new `_device-detail.scss` sets `max-width: 1140px` with no margin, and `theme.scss` imports it right after `build-log`.
- **POL-01, D-16.** The `settings-dropdown` toggle holds `<i class="la la-user-circle account-menu-icon" title="Account" aria-hidden="true">` plus `<span class="sr-only">Account menu</span>`. `.account-menu-icon { padding: 0 8px; }` is in `Header.scss`. Both menu items and every hook are unchanged.
- **D-14, danger contrast.** `.alert-danger` gets `color: $white`, and `.alert-danger .close, .alert-danger button.close` get `color: $white; opacity: 1`, placed after the generic close rule. The compiled theme gives white on `#c93c3c` = **5.01:1** (C1 output). The success, info, warning and transparent-danger alerts and the inner `.btn` rule are unchanged (C2).
- **D-14, device list.** The view toggles use `light` / `outline-light`, `aria-pressed`, `aria-label`/`title` `List view` / `Grid view`, and aria-hidden glyphs. All six markers get `tabindex="0"` and `v-b-tooltip.hover.focus`, plus a `:focus-visible` 2px white ring (`:focus` alone draws none). `comparePlatformKeys` in `utils/platforms.js` sorts both the pills and the Platform sort. Row checkboxes are `checkbox-<udid>`, and the unused `index` is gone from the row `v-for`.

## Task Commits

All commits are in `services/console`:

1. **Task 1 (tracer): Build Firmware in flight, capped column (POL-01, D-17, D-18)**
   - RED `c84c5d5` `test(vue): expect an in-flight build firmware button and a capped column (POL-01)`
   - GREEN `8a7d0ab` `feat(vue): build firmware in-flight state and a capped detail column (POL-01, D-17, D-18)`: **the POL-01 Build Firmware and content column commit**
2. **Task 2: account menu name, readable danger alerts (POL-01, D-16, D-14)**
   - RED `cc2c1cf` `test(vue): expect an accessible account menu and readable danger alerts (D-16, D-14)`
   - GREEN `2c75b9e` `feat(vue): account menu icon and name, readable danger alerts (POL-01, D-16, D-14)`: **the POL-01 account menu commit and the carried 44 `.alert-danger` contrast commit**
3. **Task 3: device list toggles, markers, label sort, udid ids (D-14)**
   - RED `dcde0ae` `test(vue): expect accessible toggles, focusable markers and a label sort (D-14)`
   - GREEN `e1197b3` `feat(vue): accessible device list toggles, markers, label sort and udid ids (D-14)`: **the carried Phase 44 toggle-name, focusable-marker, label-sort and udid-id commit**
   - `852fef5` `test(vue): cite the device list parity harness as L7 (D-14)` (deviation 2)

For 48-06's FIX-01 ledger: POL-01 = `8a7d0ab` + `2c75b9e`. The carried Phase 44 Vue items (D-14) are danger contrast `2c75b9e`, and toggle names, focusable markers, label sort and udid ids `e1197b3`.

## TDD evidence

The `gsd tdd-red-evidence` classifier was not run. The harness prints its own `ok`/`FAIL` lines, which none of the classifier's formats accept (same as 48-01). Each RED was assessed by hand.

**Task 1 RED (`c84c5d5`), run on the 48-01 tree, exit 1:**
```
FAIL F1 ... (exactly one action-build button)
FAIL F2 ... (exactly one action-build button)
FAIL F8 ... (no fa fa-cogs mr-1)
FAIL W1 ... (exactly one device-detail-content)
FAIL W2 ... (.device-detail-content has a rule)
FAIL F3 ... (pending after the click)
FAIL F4 ... ({"success":true}: buildPending false)
FAIL F5 ... (Cannot read properties of undefined (reading 'success'))
FAIL F6 ... (Expected values to be strictly equal:)   <- the success did not clear the error
FAIL F7 ... (component: focused once after the request settled)
```
Assessment: every failure is the planned behaviour gap. The hook, the pending flag, the column and the rule were missing. The old handler crashed on an `undefined` result (F5) and did not clear the other alert (F6). There were no load, syntax or fixture errors, and every 48-01 check still passed.

**Task 1 GREEN (`8a7d0ab`).** F1..F8 and W1..W2 pass (10). `test:unit` gave 410 `ok` and 0 `FAIL`. The production build passed, and the bundle carries `action-build-spinner`, `Requesting build` and `device-detail-content{max-width:1140px}`. Tracer gate: the verify is automated-only and the mode is end-of-phase, so both verify commands were re-run on the committed tree. They passed, so expansion went ahead.

**Task 2 RED (`cc2c1cf`), exit 1:**
```
FAIL M1 ... (no settings cog in Header.vue)
FAIL M2 ... (.account-menu-icon has a rule)
FAIL C1 ... (.alert-danger color #fff)
ok   C2 ... (guard: the other variants are unchanged)
```
Assessment: M1, M2 and C1 fail on the planned assertions. C2 is a guard of behaviour that must not change, so it passes on both trees, like A7/A8 in 48-01.

**Task 2 GREEN (`2c75b9e`).** M1, M2, C1 and C2 pass. C1 reports `white on #c93c3c 5.01:1`. `test:unit` gave 414 `ok`. The build passed, and the bundle carries `la-user-circle`, `Account menu` and `.account-menu-icon`.

**Task 3 RED (`dcde0ae`), exit 1:**
```
FAIL L1 ... (list: active toggle is light)
FAIL L2 ... (api-key-indicator tabindex 0)
FAIL L3 ... (.api-key-indicator:focus has a rule)
FAIL L4 ... (comparePlatformKeys is exported)
FAIL L5 ... (rows by label)          <- the key sort put nodejs before nodemcu while the pills put Zeta after Sigfox
FAIL L6 ... (l11: checkbox-<udid>)
FAIL L8 ... (c is not a function)    <- the partial-data row order already held; the comparator check failed
```
`device-list-parity.cjs` stayed green on the RED tree (67 `ok`, harness-only changes).

**Task 3 GREEN (`e1197b3`).** L1..L6 and L8 pass. `test:unit` gave 421 `ok` and 0 `FAIL` both with and without `LC_ALL=C`. The build passed and the bundle carries `List view` / `Grid view`. `test:csp:dist` passed. perf:spotter totals: **JS 7.10 MiB raw / 2.78 MiB gzip, CSS 621.56 KiB raw / 90.67 KiB gzip, 6 initial assets, "All performance budgets passed."**

## Files Created/Modified

Paths are in `services/console/vue/`.

- `src/pages/Devices/DeviceDetail.vue`: `buildPending` data, the guarded `buildDevice()`, `buildFailure()`, the Build Firmware markup (idle and pending), the status span and the `device-detail-content` wrapper. The wrapped block is re-indented.
- `src/styles/_device-detail.scss` (new): `.device-detail-content { max-width: 1140px; }`.
- `src/styles/theme.scss`: `@import 'device-detail';` after `build-log`.
- `src/components/Header/Header.vue`: the account menu toggle content and a D-16 template comment.
- `src/components/Header/Header.scss`: `.account-menu-icon`.
- `src/styles/_overrides.scss`: the `.alert-danger` colour and the danger close-button rule.
- `src/utils/platforms.js`: `comparePlatformKeys`.
- `src/pages/Devices/Devices.vue`: the toggles, the six markers, the comparator in `platformPills` and in the Platform sort, and the udid checkbox ids.
- `src/styles/_platforms.scss`: the marker `:focus` and `:focus-visible` rules.
- `tests/unit/close-out-v118.cjs`: F, W, M, C and L checks (22 new), a Devices.vue loader with injectable platforms, and a no-op `b-tooltip` directive.
- `tests/unit/device-list-parity.cjs`: a no-op `b-tooltip` directive, the comparator dependency and the retitled sort check.

## Decisions Made

- `buildFailure` is copied, not moved to a util. There are two call sites, and the plan asks for the copy.
- `comparePlatformKeys` normalises both arguments with `basePlatform`, so raw values (`null`, `''`, `esp-idf:foo`, `42`) count as `unknown` and sort last (L8).
- M2 compiles `Header.scss` directly, because the component stylesheet is not part of `theme.scss`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test] F5 picked the wrong danger alert**
- **Found during:** Task 1 GREEN
- **Issue:** F5 looked for exactly one `b-alert variant="danger"`. The Transformer Assignment card's danger alert always renders (`:show` binding), so the check found two.
- **Fix:** F5 now selects the page alert, the danger alert without a `data-cy`. The behaviour it asserts is unchanged.
- **Files modified:** `vue/tests/unit/close-out-v118.cjs`
- **Committed in:** `8a7d0ab` (with the GREEN change, named in its message)

**2. [Rule 2 - Missing coverage] L7 added as a citation check**
- **Found during:** Task 3 acceptance
- **Issue:** The criterion expects 8 `ok L[1-8]` lines, with L7 "recorded as the device-list-parity.cjs pass". The planned checks gave 7.
- **Fix:** L7 now cites `device-list-parity.cjs`: the no-op directive, the comparator dependency, the label-titled sort check and its expected order. This is the same citation pattern as 48-01's N1/E1..E3. The parity file itself runs in the same `test:unit` chain.
- **Files modified:** `vue/tests/unit/close-out-v118.cjs`
- **Committed in:** `852fef5`

**3. [Plan criterion defect] The "no Legacy or Cypress path" range includes 48-01's planned Cypress work**
- **Found during:** Task 3 acceptance
- **Issue:** `git diff --name-only 54734af HEAD` lists `vue/cypress/integration/deep-link.spec.js` and `vue/cypress/support/session.js`. 48-01 changed both on purpose (D-03, UI-C03), so the check fails as written.
- **Resolution:** Over 48-03's own range, `git diff --name-only 794f357 HEAD`, there is no `src/` (Legacy) path and no `vue/cypress/` path. No file was changed to satisfy the criterion.

---

**Total deviations:** 2 auto-fixed (1 test selector bug, 1 missing citation check) plus 1 criterion defect.
**Impact on plan:** None on scope. Only the planned files changed.

## Issues Encountered

- `vue/cypress/integration/devices.spec.js` still selects `#checkbox-0` / `#checkbox-1` (lines 87, 88, 97, 113). After `e1197b3` the ids are `checkbox-<udid>`, so that spec breaks until 48-05 rewrites it to select inside `[data-cy=device-row]`. 48-05 already owns this: its plan names the rewrite. 48-03 may not touch Cypress files.
- The Sass build prints the same deprecation warnings before and after (counts identical, including `mixed-decls`).

## Verification (plan-level)

- `test:unit`: exit 0 with `LC_ALL=C` (422 `ok`, 0 `FAIL`) and without it (422 `ok`, 0 `FAIL`), `device-list-parity.cjs` included.
- Production build: passed. `test:csp:dist`: PASS. `perf:spotter`: "All performance budgets passed."
- The bundle carries `action-build-spinner`, `Requesting build`, `Account menu`, `la-user-circle`, `List view` and `Grid view` (JS), plus `device-detail-content{max-width:1140px}`, `account-menu-icon` and `status-warning:focus-visible` (CSS).
- `git -C services/console log --format=%G? 794f357..HEAD`: `G` seven times. `status --porcelain -- vue src`: empty. `rev-list --count origin/thinx-staging..HEAD` = 13 > 0, and `ls-remote` still shows `54734af`, so nothing was pushed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 48-05 rewrites `devices.spec.js` for the `checkbox-<udid>` ids, the labelled toggles and the keyboard-focused marker tip. It also adds the Device Detail double-click spec (`@buildFirmware.all` length 1) and can check the E7 backstop: a 300-character danger reason in a browser.
- 48-06 records `8a7d0ab`, `2c75b9e` and `e1197b3` in the FIX-01 ledger and bumps the parent gitlink.

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-15*

## Self-Check: PASSED

All 6 listed key files exist under services/console; all 7 console commits (c84c5d5, 8a7d0ab, cc2c1cf, 2c75b9e, dcde0ae, e1197b3, 852fef5) are ancestors of services/console HEAD and signed (G).
