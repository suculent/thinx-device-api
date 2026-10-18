---
phase: 44-device-list-parity
verified: 2026-10-13T12:57:11Z
status: passed
score: 24/24 must-haves verified (3 backstop truths and the production check by operator UAT 10/10 on live d4a32c9, 0 failed)
covered_files:
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/44-device-list-parity/44-03-SUMMARY.md"
  - "services/console/vue/package.json"
  - "services/console/vue/src/components/IconButton/IconButton.vue"
  - "services/console/vue/src/components/List/List.vue"
  - "services/console/vue/src/components/PlatformBullet/PlatformBullet.vue"
  - "services/console/vue/src/fonts/icomoon/_icomoon.scss"
  - "services/console/vue/src/fonts/icomoon/icomoon.ttf"
  - "services/console/vue/src/fonts/icomoon/icomoon.woff"
  - "services/console/vue/src/pages/Devices/Devices.vue"
  - "services/console/vue/src/pages/Repositories/Repositories.vue"
  - "services/console/vue/src/styles/_platforms.scss"
  - "services/console/vue/src/styles/theme.scss"
  - "services/console/vue/src/utils/platforms.js"
  - "services/console/vue/tests/unit/device-list-parity.cjs"
  - "services/console/vue/tests/unit/log-paging-store.cjs"
covered_digest: "v3:sha256:8e3f166e638eeb0b343670854d217f173bd727f3bf38bd84527f6b8219a16771"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 20/24
  reason: "Review fixes (console 6a34102..604258c, 13 signed commits) changed covered files; previous report went stale"
  gaps_closed: []
  human_items_resolved:
    - "U1-U10 passed by the operator on live build d4a32c9 (44-HUMAN-UAT.md, status complete, 10/10)"
  gaps_remaining: []
  regressions: []
---

# Phase 44: Device List Parity Verification Report

**Phase Goal:** The Vue device list reads like the Legacy one: platform-named device icons, the Legacy action icons on a single line, platform bullets, and a visible warning on devices without an API key. Repositories show the same platform bullet.
**Verified:** 2026-10-13T12:57:11Z
**Status:** passed
**Re-verification:** Yes. The first report (2026-10-13T12:05:16Z, human_needed, 20/24) went stale when the review fixes
changed covered files. This run re-reads the code at the review-fix head and folds in the completed operator UAT.

Code verified at console `604258c` (= console `origin/thinx-staging` = parent gitlink at `HEAD`). Parent
`origin/thinx-staging` = `d4a32c98` (signed, `G`; touches only `services/console` and `44-REVIEW-FIX.md`). Local parent
`HEAD` `ca77fb80` is two docs-only commits ahead (`6478dfc4` UAT record, `ca77fb80` Phase 48 carry-over in the
workstream ROADMAP). `origin/main` = `14c08c1f`, unchanged.

Review-fix range `6a34102..604258c`: 13 commits, all `%G?` = `G`; 5 files, all under `vue/` (`Devices.vue`,
`_platforms.scss`, `platforms.js`, `device-list-parity.cjs`, `log-paging-store.cjs`); `git diff -- src` (Legacy) empty.

## Goal Achievement

### Observable Truths

Roadmap success criteria (T1-T4) are the contract; T5-T24 merge the 44-01/02/03 plan truths. Changes from the first
report are marked "(re-checked)".

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | SC1: each device row shows the Legacy `device-icon` / `device-icon-symbol` on a background whose class and label are the platform name; no colour-description class such as `grey-mint` in the device list | ✓ VERIFIED | `Devices.vue` table cell 2 and grid header: `span.device-icon .platform-<key>`, `title` = label, `img.device-icon-symbol` via `require.context(ioticons, b_medium_\d\d.png)`. (re-checked) `symbolSrc` now reads only numbers/strings, else 01. `grep category\|grey-mint` in Devices.vue: 0. Live `app.js`: `grey-mint`, `category-pill-`, `CATEGORY_COLORS`, `categoryColor` all 0 |
| T2 | SC2: Legacy status, firmware, build, view-log and edit icons; edit opens Device Detail; Actions cell on one line, icons only when space runs out, text kept as aria-label and hover tip | ✓ VERIFIED | `fa-heartbeat`, `fa-cogs`, `icomoon-hammer_icon`, `fa-eye`, `fa-pencil` in both views; `viewDevice` → `DeviceDetail` (test asserts push). `IconButton` text `d-none d-lg-inline`, `aria-label` = label, `title` on wrapper. Rendering at 375/768/1024/1280 confirmed by operator (T21) |
| T3 | SC3: Legacy-style bullet, no "Platform:" label; identical bullet in device and repository rows; unknown platform shows `unknown`, never `unknown_platform` | ✓ VERIFIED | `PlatformBullet.vue` used by Devices (table, grid) and `Repositories.vue` (`#cell(platform)`). Tests "Repositories bullet markup equals the Devices bullet", "Repositories renders the unknown bullet and never unknown_platform", (re-checked) "PlatformBullet renders the Micropython bullet for the backend value python" (WR-01), `mongooseos` → mongoose (test table line 231) |
| T4 | SC4: device with no API key shows `fa-warning` whose tip explains it has no API key | ✓ VERIFIED (re-checked) | `missingApiKey()` true for null/undefined/''. `span.api-key-indicator[role=img][data-cy=api-key-warning]` with `fa fa-warning`, `aria-label` and `title` = `API_KEY_TIP` = "No API Key assigned" (Legacy `device.html` text; D-14/UI-D14 revised 2026-10-13 for CR-01). Test asserts the text and that Devices.vue contains no "check in" claim. Live bundle: "No API Key assigned" 1, "cannot check in" 0 |
| T5 | `utils/platforms.js` is the only platform module (9 keys/labels, sigfox build:false), `basePlatform`/`platformInfo` never throw, unknown fallback | ✓ VERIFIED (re-checked) | `basePlatform` reads strings only, `ALIASES = { python: 'micropython', mongooseos: 'mongoose' }` applied before the lookup. Tests "basePlatform maps known values…", "basePlatform and platformInfo treat non-strings, including {toString:1}, as unknown" |
| T6 | `List.vue` without a slot renders raw values as before; `store/repositories.js` unchanged | ✓ VERIFIED (re-checked) | Slot fallback unchanged. WR-03 replaced the `git diff cfff199` check with a behavioural one: "store/repositories.js still declares a visible platform column" passes |
| T7 | Compiled theme: one `.platform-<key>` rule per key with the palette, 4.5:1 text, inset outline on bullet and tile | ✓ VERIFIED | Test reports all 9 contrasts ≥ 4.66 |
| T8 | Platform pills (All + present platforms by label, unknown last, `platform-pill-<key>`, "Filter by platform"), filter by base platform, fallback to All, sort by base platform then alias, empty and loading states | ✓ VERIFIED (re-checked) | New watchers: `platformFilter` clears the selection, `filteredItems` prunes hidden selections, `activePlatform` → All makes the filter sticky All (IN-04). Tests "python and micropython devices share one Micropython pill…", "selection: bulk Revoke, Transfer and Push Config send only visible devices", "empty states … never text-muted" |
| T9 | `IconButton` contract (props, `inheritAttrs:false`, data-cy on button, emits click only when enabled) | ✓ VERIFIED | Unchanged since first report; test passes |
| T10 | Build states and in-flight guard: one click sends one `buildFirmware({udid, source_id})`, released on success, failure and throw | ✓ VERIFIED (behavioral) | Test "buildDevice sends one request while in flight and releases it on success, failure and rejection" passes this run. (re-checked) `buildFailure()` shows a non-blank string `message`/`response`, else "Build failed." (IN-01). IN-02 (guard ends at POST return) left by operator decision, UI-D17 |
| T11 | Hammer is the Legacy icomoon `\e900` glyph; woff/ttf byte copies; only `.icomoon-hammer_icon` | ✓ VERIFIED | Font files unchanged in the fix range; live `app.js` `icon-button__text` 2, hammer rule present |
| T12 | View log opens BuildLogDialog for the newest build of the device, failed ones included; disabled with "No build yet" without any build (D-07 revised 2026-10-13, WR-02) | ✓ VERIFIED (re-checked) | `loadData` loads `buildlog/fetchBuildLog` (GET /logs/build first page; API `listPage` is newest first by `start_time`, `lib/thinx/buildlog.js:409`), its failure never fails the device list. `latestBuildId()` takes the first entry for the udid with a non-blank `build_id`, else `last_build_id`; `hasBuild`/`openLastBuild` use it. Tests "View log opens the newest build of the device, failed ones included, else last_build_id", "loadData stores the build list; a failed build list still loads the devices" |
| T13 | Status (heartbeat, cleaned text, Registered, 22 + '…', `#e`/`#w`) and firmware (cogs, '—', 240px ellipsis) cells; no raw-HTML binding | ✓ VERIFIED (re-checked) | `cleanStatus` reads strings only. Firmware now `td > span.firmware-cell` with `display:block; max-width:240px` (IN-03). Alias, firmware, mac go through `asText` in render, search and sort (N-1 residual, 604258c). Tests "table: firmware block with cogs inside the cell…", "compiled CSS: … firmware ellipsis at 240px", "Devices renders, searches and sorts a device whose alias, firmware and mac are {toString:1}". No `v-html` in any phase source |
| T14 | Cypress hooks `device-row`, `device-card`, `row-detail`, `row-build`, `row-revoke` kept; Revoke keeps "Confirm Revoke" | ✓ VERIFIED | Hooks present; test "Revoke keeps its confirmation" passes |
| T15 | Local gates pass | ✓ VERIFIED (re-checked) | This run: `npm --prefix services/console/vue run test:unit` (default locale, no `LC_ALL`) exit 0, 213 ok, 0 FAIL. Build, `test:csp:dist`, `perf:spotter` recorded green at 604258c in 44-REVIEW-FIX follow-up; CI pipeline 5663 (vue-console-registry builds the bundle) green |
| T16 | Console ranges carry only Phase 44: signed commits, phase paths only, no Legacy `src/` change | ✓ VERIFIED (re-checked) | `cfff199..6a34102` as before (12 × G); `6a34102..604258c` 13 × G, 5 files under `vue/`, `diff -- src` empty, no lock file |
| T17 | Signed gitlink bump changes only `services/console`; gitlink = console origin/thinx-staging; origin/main unchanged | ✓ VERIFIED (re-checked) | `d4a32c98` = G, stat: `services/console` + `44-REVIEW-FIX.md`; `ls-tree HEAD services/console` = 604258c = console `origin/thinx-staging`; `origin/main` 14c08c1f |
| T18 | Push pipeline ran test, api-registry, vue-console-registry, no snyk-*/console-classic-* | ✓ VERIFIED (re-checked) | Read this run: `check-ci-gates.js pipeline --revision d4a32c98… --expect legacy-off` → `CI-GATES PIPELINE OK 5663` (3 jobs, success) |
| T19 | console.thinx.cloud `/js/app.js` carries the build id and Phase 44 markers, none of the removed strings | ✓ VERIFIED (re-checked) | Unauthenticated GET 200, 3158288 B: `d4a32c9` 2, "No API Key assigned" 1, "Could not load devices" 1, `mongooseos` 2, `platform-bullet` 4, `icon-button__text` 2, `api-key-indicator` 3, `firmware-cell` 3; "cannot check in", `grey-mint`, `category-pill-`, `CATEGORY_COLORS`, `categoryColor` 0 |
| T20 | Legacy rtm `app/js/main.js` and `LogviewController.js` byte-identical to the pre-deploy baseline | ✓ VERIFIED (re-checked) | Re-hashed this run: `819c133e9111…`, `e556c292b478…`, equal to the 44-03 baselines |
| T21 | Backstop E5 overflow: Actions cell one line at 375/768/1024/1280px, no page horizontal scrollbar | ✓ VERIFIED (observed) | Directly observed by the operator on live d4a32c9: 44-HUMAN-UAT U2 pass. Live build = verified code (T17, T19) |
| T22 | Backstop E5 long-text: long status → 22 + '…' with tip; long firmware ellipsised in 240px | ✓ VERIFIED (observed) | UAT U7 pass on live d4a32c9; helper logic and compiled CSS unit-tested (T13) |
| T23 | Backstop E1 populated: tiles show symbols in a visible frame, hammer renders, no failed font/image request | ✓ VERIFIED (observed) | UAT U6 pass on live d4a32c9 |
| T24 | Operator end-of-phase check of list, grid, filter, actions, warning and Repositories bullet on production | ✓ VERIFIED (observed) | UAT U1, U3, U4, U5, U8, U9 pass on live d4a32c9 (status complete, 10/10, 0 issues) |

**Score:** 24/24 truths verified (0 present-but-behavior-unverified, 0 failed). T21-T23 are non-inferable backstop
truths; they count as verified only because the operator observed them on the deployed build of exactly this code.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/utils/platforms.js` | PLATFORMS, basePlatform (string-only, aliases), platformInfo | ✓ VERIFIED | Imported by Devices.vue and PlatformBullet.vue |
| `vue/src/components/PlatformBullet/PlatformBullet.vue` | Shared bullet | ✓ VERIFIED | Devices (2×), Repositories |
| `vue/src/components/IconButton/IconButton.vue` | Shared icon button | ✓ VERIFIED | Unchanged in fix range; used throughout Devices.vue |
| `vue/src/components/List/List.vue` | `cell(<prop>)` scoped slot with raw fallback | ✓ VERIFIED | Unchanged in fix range |
| `vue/src/styles/_platforms.scss` | Palette, bullet, tile, icon button, actions cell, status, firmware, toolbar gap | ✓ VERIFIED | Adds `.device-toolbar, .platform-pills { gap: 4px }` and block `.firmware-cell` |
| `vue/src/fonts/icomoon/*` | Font face + hammer rule; byte copies | ✓ VERIFIED | Unchanged in fix range |
| `vue/src/pages/Devices/Devices.vue` | Tiles, bullet, pills, icon actions, guard, log dialog, status, warning, load error | ✓ VERIFIED | Substantive; fix range +91/-27 lines |
| `vue/src/pages/Repositories/Repositories.vue` | Bullet via slot | ✓ VERIFIED | `#cell(platform)` |
| `vue/tests/unit/device-list-parity.cjs` | Plain-node checks in `test:unit` | ✓ VERIFIED | All checks ok this run |
| `vue/tests/unit/log-paging-store.cjs` | Locale-independent History hint check (IN-05) | ✓ VERIFIED | Chain passes without `LC_ALL` |
| `services/console` gitlink | Bumped to 604258c | ✓ VERIFIED | d4a32c98 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Devices.vue | utils/platforms.js | `import { basePlatform, platformInfo }` | ✓ WIRED |
| Devices.vue, Repositories.vue | PlatformBullet.vue | import + `<PlatformBullet :platform=…>` | ✓ WIRED |
| Repositories.vue | List.vue | `<template #cell(platform)>` ↔ named slot | ✓ WIRED |
| theme.scss | _platforms.scss, icomoon partial | `@import` | ✓ WIRED |
| Devices.vue `symbolSrc()` | `assets/thinx/ioticons/b_medium_NN.png` | `require.context` | ✓ WIRED |
| Devices.vue `loadData` | store `buildlog/fetchBuildLog` → GET /logs/build | `mapActions` + `buildlog/getItems` → `this.builds` | ✓ WIRED (new) |
| Devices.vue View log | BuildLogDialog `open()` | `this.$refs.buildLogDialog.open({ build_id: latestBuildId(device) })` | ✓ WIRED |
| Devices.vue Build | store `devices/buildFirmware` → POST /build | `buildDevice` guarded by `buildingUdids` | ✓ WIRED |
| parent HEAD → pipeline → console.thinx.cloud | vue-console-registry rollout | pipeline 5663, live id `d4a32c9` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Devices.vue rows/cards | `items` | `devices/fetchItems` → GET /device → deviceDescriptor → `saveDevices` | Yes | ✓ FLOWING |
| Devices.vue View log | `builds` | `buildlog/fetchBuildLog` → GET /logs/build (`listPage`, newest first) → `normalizeBuildItems` (`udid`, `build_id`) | Yes | ✓ FLOWING |
| Repositories.vue bullet | `item.platform` | `repositories/fetchItems` → GET /source | Yes | ✓ FLOWING |
| Platform pills | `platformPills` | derived from loaded `items` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit chain incl. device-list-parity | `npm --prefix services/console/vue run test:unit` (default locale) | exit 0, 213 ok, 0 FAIL | ✓ PASS |
| Pipeline legacy-off | `node scripts/check-ci-gates.js pipeline --revision d4a32c98… --expect legacy-off` | CI-GATES PIPELINE OK 5663 | ✓ PASS |
| Live bundle markers | unauthenticated GET console.thinx.cloud/js/app.js + grep | all markers present, removed strings 0 | ✓ PASS |
| Legacy unchanged | GET rtm main.js, LogviewController.js + sha256 | equal to 44-03 baselines | ✓ PASS |

Build, `test:csp:dist` and `perf:spotter` were not re-run here; they are recorded green at 604258c in the
44-REVIEW-FIX follow-up, and pipeline 5663 built and shipped the same bundle.

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`; its runnable checks are the spot-checks above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DEV-01 | 44-01, 44-03 | Legacy device-icon assets on platform-named background, no `grey-mint` | ✓ SATISFIED | T1, T19, T23 |
| DEV-02 | 44-02, 44-03 | Legacy status, firmware, build, view-log, edit icons | ✓ SATISFIED | T2, T10-T14, T24 |
| DEV-03 | 44-02, 44-03 | Actions cell never wraps; icons only when tight, text as aria-label and tip | ✓ SATISFIED | T2, T9, T21 |
| DEV-04 | 44-01, 44-03 | Legacy-style bullet without "Platform:" | ✓ SATISFIED | T3, T7 |
| DEV-05 | 44-02, 44-03 | `fa-warning` with explanatory tip on devices without an API key | ✓ SATISFIED | T4, T24 |
| REPO-01 | 44-01, 44-03 | Repository rows use the same bullet; fallback `unknown` | ✓ SATISFIED | T3, T6, T24 |

No orphaned requirements: REQUIREMENTS.md maps exactly DEV-01..05 and REPO-01 to Phase 44, all claimed by plans.

### Prohibitions (judgment tier)

The 14 judgment-tier prohibitions from 44-01/02/03 (table in the first report) were accepted by the operator as UAT U10
(pass). Re-checked for the fix range: no Legacy `src/` change, no lock file, no `v-html`, Revoke confirmation and bulk
payload shape unchanged (bulk now sends only visible devices, a tightening), all 13 console commits and `d4a32c98`
signed, `origin/main` unchanged, pipeline 5663 legacy-off. Nothing in the fix range violates them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vue/src/components/List/List.vue` | 95 | `// TODO for count of selected` | ℹ️ Info | Pre-existing (blame 3f8bb3f8), not touched by Phase 44 |
| `44-HUMAN-UAT.md` | U3 expected | Still quotes the pre-CR-01 tip sentence | ℹ️ Info | Operator ran U3 on live d4a32c9, which serves "No API Key assigned"; doc wording only |
| `44-HUMAN-UAT.md` | Follow-ups | Lists the four UI-review warnings as open | ℹ️ Info | All four fixed in 077ec7d, 4392a3e, 18e843f, e10f539 and unit-tested |

The four UI-review warnings from the first report (bulk selection across a filter, load error path, grid last-seen
contrast, dead `gap-2`) are fixed and covered by passing checks. No TBD/FIXME/XXX debt markers in any phase file.

Accepted open items, not gaps: IN-02 (build guard ends at POST return; UI-D17 spec choice, operator decision) and
UI review #5-#8 plus the WR-02 limits (first 100 builds, no refresh after Build) and the stale
`vue/cypress/integration/devices.spec.js` category assertions, carried to the Phase 48 ledger in the workstream
ROADMAP (`ca77fb80`).

### Human Verification Required

None outstanding. 44-HUMAN-UAT.md is complete: 10/10 passed by the operator on live build d4a32c9, which is the
code verified here.

### Gaps Summary

No gaps. Every roadmap success criterion and plan truth is backed by code read at console 604258c, the 213-check unit
chain (including the build guard, View log, load-error and selection state transitions), pipeline 5663, the live
bundle markers and Legacy hashes, and, for the backstop truths, the operator's observation of the same build in
production.

---

_Verified: 2026-10-13T12:57:11Z_
_Verifier: Claude (gsd-verifier)_
