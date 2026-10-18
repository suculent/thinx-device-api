---
phase: 44-device-list-parity
fixed_at: 2026-10-13T12:31:23Z
review_path: .planning/workstreams/vue-console/phases/44-device-list-parity/44-REVIEW.md
also_covers:
  - .planning/workstreams/vue-console/phases/44-device-list-parity/44-UI-REVIEW.md (warnings 1-4)
  - .planning/workstreams/vue-console/phases/44-device-list-parity/44-SECURITY.md (auditor note N-1)
iteration: 1
findings_in_scope: 14
fixed: 13
skipped: 1
status: partial
---

# Phase 44: Code Review Fix Report

**Fixed at:** 2026-10-13T12:31:23Z
**Source review:** 44-REVIEW.md (1 critical, 3 warning, 5 info), 44-UI-REVIEW.md (warnings 1-4), 44-SECURITY.md (N-1)
**Iteration:** 1
**Operator decisions:** 2026-10-13 batch (CR-01 text, UI warnings, N-1, WR-01/02/03, IN-01/03/04/05; IN-02 left as a
spec choice)

**Summary:**
- Findings in scope: 14 (9 code review, 4 UI review, 1 security note)
- Fixed: 13 (12 console commits; IN-04 and UI warning 1 share one commit)
- Skipped: 1 (IN-02, operator decision)
- `status: partial` only because IN-02 is intentionally left open

All console commits are on `services/console` `thinx-staging` after `6a34102`, signed (`%G?` = `G`), not pushed. The
parent gitlink is **not** bumped.

## Fixed Issues

### CR-01: The API-key warning claimed the device "cannot check in"

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** d9e3161
**Applied fix:** The warning still shows on a null, missing or empty `keyhash` (D-13, DEV-05, Legacy parity). The tip and
aria-label are now Legacy's "No API Key assigned" (`device.html`), with no claim about check-in. The tests expect the
new text and fail if Devices.vue says "check in" anywhere. The decision change is recorded in 44-CONTEXT.md (D-14
revision note) and 44-UI-SPEC.md (UI-D14 and the copy table).

### WR-01: MicroPython repositories and devices (`python`) rendered as `unknown`

**Files modified:** `vue/src/utils/platforms.js`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** fb39b45
**Applied fix:** `basePlatform` maps `python` onto `micropython` through an `ALIASES` table before the lookup, so the
Repositories bullet, the device tile, the pills, the filter and the sort all show Micropython. Checks: `python`,
`Python` and `python:esp32` map to micropython; a `python` and a `micropython` device share one pill and filter together.
`mongooseos` was not mapped: the operator decision named `python` only.

### WR-02: View log could never show a failed build, and "No build yet" could be false

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** 755086d
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Legacy used `$rootScope.meta.deviceBuilds[udid][0]`, the newest entry of the build list, failed builds
included (`DevicesController.js:149-153`, `thinx-api.js:709-741`). `loadData` now loads the build log list through the
existing `buildlog/fetchBuildLog` (GET /logs/build, first page, newest first), the same list History and DeviceDetail
use. `latestBuildId(device)` returns the first entry for the udid with a non-blank `build_id`, and falls back to
`last_build_id`. "No build yet" shows only when neither source has a build. A failed build-list request never fails
the device list. The D-07 change is recorded in 44-CONTEXT.md and 44-UI-SPEC.md.
**Limits:** only the first page (100 newest builds of the owner) is read; a device whose builds are all older falls
back to `last_build_id`. Legacy's list also covered only 30 days. The list is not refreshed after Build, so a new build
becomes reachable after the next page load.

### WR-03: The `git diff cfff199` unit check would fail on any later edit of `store/repositories.js`

**Files modified:** `vue/tests/unit/device-list-parity.cjs`
**Commit:** 6ba1757
**Applied fix:** The git assertion and the unused `child_process` import are removed. A behavioural check replaces
them: the store's headers still declare exactly one `platform` column with a non-null `pos`.

### IN-01: Build failures always showed "Build failed."

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** f565857
**Applied fix:** `buildFailure(result)` shows `message` or the API `response` when it is a non-blank string, as
interpolated text in the danger alert. Anything else (blank, number, `{toString:1}`) falls back to "Build failed.".

### IN-03: `max-width: 240px` on the firmware `<td>` had no effect

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/src/styles/_platforms.scss`,
`vue/tests/unit/device-list-parity.cjs`
**Commit:** 69eaeb7
**Applied fix:** The cogs and the text now sit in `span.firmware-cell` inside a plain `<td>`, with `display: block;
max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` and the full firmware as `title`.
In headless Chrome with a 1000px table, the block measured 240px and clipped, while the old `td` rule let the text run
across the ~700px cell. The cell itself still takes spare width; only the text is limited.

### IN-04 + UI review warning 1: hidden selections stayed in bulk actions, and a stale platform filter could re-engage

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** 4392a3e
**Status:** fixed: requires human verification (logic change)
**Applied fix:** There are three watchers. A `platformFilter` change, including a pill switch, clears the selection.
A `filteredItems` change drops every selected udid that the search, the filter or a reload hides. Clearing the search
does not bring those selections back. When `activePlatform` falls back to All, `platformFilter` is set to All, so the
filter stays All when such devices return. Checks: search pruning, pill reset, the bulk Revoke, Transfer and Push
Config payloads (visible devices only), and the sticky fallback. The test harness now installs the page's `watch`.

### IN-05: `npm run test:unit` failed under the Czech locale

**Files modified:** `vue/tests/unit/log-paging-store.cjs`
**Commit:** ab67550
**Applied fix:** Root cause: under cs_CZ, `(1200).toLocaleString()` is `1<NBSP>200`, and the test's `textOf` collapses
whitespace, so the rendered `1 200` never matched. The expectation is now collapsed the same way. The chain passes
without `LC_ALL` and still checks locale grouping. No `LC_ALL` was added to the script.

### UI review warning 2: a rejected load left "Loading..." up with no message

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** 077ec7d
**Status:** fixed: requires human verification (logic change)
**Applied fix:** `loadData` is `async` with `try` / `catch` / `finally`. A failure shows "Could not load devices.
Refresh to retry." in the existing danger alert, which is not `text-muted`. `finally` clears `loading`. A later
successful load clears that load error and leaves other errors alone. This resolves the "error | E1 | unresolved" row
of the UI-SPEC state table.

### UI review warning 3: the grid "last seen" line used `text-muted` (3.14:1)

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/tests/unit/device-list-parity.cjs`
**Commit:** 18e843f
**Applied fix:** The class is now `mb-2 small` (body colour). A check asserts that no card's last-seen line is
`text-muted`.

### UI review warning 4: dead Bootstrap 5 `gap-2`, and `mr-1` (3.5px) off the 4px grid

**Files modified:** `vue/src/pages/Devices/Devices.vue`, `vue/src/styles/_platforms.scss`,
`vue/tests/unit/device-list-parity.cjs`
**Commit:** e10f539
**Applied fix:** The toolbar is now `.device-toolbar` and the pill group `.platform-pills`. Both have `gap: 4px` in
`_platforms.scss`, and `mr-1` is gone from the view toggles and the pills. The sort select keeps its inherited `mr-2`.
A check rejects any `gap-N` utility in Devices.vue and confirms 4px in the compiled theme.

### Security N-1: device-supplied `{"toString":1}` could throw in the platform, status and icon helpers

**Files modified:** `vue/src/utils/platforms.js`, `vue/src/pages/Devices/Devices.vue`,
`vue/tests/unit/device-list-parity.cjs`
**Commit:** 50c7d2e
**Applied fix:** `basePlatform` reads strings only. This also covers the direct calls in `platformPills`,
`activePlatform`, `filteredItems` and the platform sort. `cleanStatus` reads strings only. `symbolSrc` reads numbers
and strings and falls back to symbol 01. Checks feed `{toString:1}`, numbers, booleans and arrays to the helpers, then
render, filter, sort and search a device whose platform, status and icon are `{toString:1}`, in both views, without an
error.
**Residual, outside the decided scope:** `alias`, `firmware` and `mac` are still rendered or searched through
`String()` and `.toLowerCase()`. A `{toString:1}` in those fields would still break that owner's page.
`lib/thinx/device.js` stores a device-sent `alias` and `firmware` as given. This is a candidate for a later phase
(a string-only text helper in the view, or string coercion in the API).

## Skipped Issues

### IN-02: The in-flight guard ends when `POST /build` returns, not when the build ends

**File:** `services/console/vue/src/pages/Devices/Devices.vue:403-426`
**Reason:** skipped by operator decision (2026-10-13): UI-D17 chose this behaviour on purpose.
**Original issue:** `/build` answers once the job is dispatched, so the hammer is enabled again within about a second.

## Not in this batch (UI review)

These items were not part of the operator's decisions and are left unchanged:
- #5: the glyph-only list/grid toggles have no `aria-label` (pre-existing).
- #6: the warning markers cannot take focus (accepted in the spec; revisit in Phase 48).
- #7: the platform sort uses keys, while the pills sort by label (matches UI-D20).
- #8: table checkbox ids use the row index.

## Verification

All gates ran in the **main checkout**, in the `services/console` submodule. No worktree was created: the caller asked
for commits through `git -C services/console`, and the submodule's `node_modules` lives there.

| Gate | Result |
|------|--------|
| `npm --prefix services/console/vue run test:unit` (default cs_CZ locale, no `LC_ALL`) | rc 0, 212 ok / 0 FAIL (device-list-parity 66 ok, was 52) |
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc 0, 212 ok / 0 FAIL |
| `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build` | rc 0, "Build complete" (Sass deprecation warnings only) |
| `npm --prefix services/console/vue run test:csp:dist` | rc 0, PASS (3/3) |
| `npm --prefix services/console/vue run perf:spotter` | rc 0, "All performance budgets passed" (JS 2.76 MiB gzip, CSS 89.76 KiB gzip) |
| dist markers | `cannot check in` 0, `Could not load devices` 1, `.device-toolbar` / `.platform-pills` / `gap:4px` / `.firmware-cell{display:block` present |

Each fix was written test-first: the new or changed check failed before the source change and passed after it.
There was no `npm install`, no lint/eslint run, no ssh, no pipeline and no push.

---

_Fixed: 2026-10-13T12:31:23Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Follow-up (orchestrator)

- N-1 residual fixed in console `604258c`: `alias`, `firmware` and `mac` render, search and sort through `asText`
  (strings, numbers, booleans; anything else empty). Unit check with `{toString:1}` in all three fields, both views.
- WR-01 extended: `mongooseos` (accepted by `lib/thinx/deployment.js` supportedPlatform) maps to `mongoose`.
- Both checks failed before the change and pass after; `test:unit` 213 ok / 0 FAIL, build, `test:csp:dist` and
  `perf:spotter` pass.
