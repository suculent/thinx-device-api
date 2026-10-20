---
phase: 44-device-list-parity
plan: 01
subsystem: vue-console
status: complete
tags: [vue, console, ui, devices, repositories, shared-components]
requires: []
provides:
  - "src/utils/platforms.js: PLATFORMS, basePlatform(raw), platformInfo(raw)"
  - "src/components/PlatformBullet/PlatformBullet.vue (prop platform), reused by Phases 45-47"
  - "src/styles/_platforms.scss: $platform-colors, .platform-<key>, .platform-bullet, .device-icon, .device-icon--sm, .device-icon-symbol"
  - "List.vue scoped slot cell(<prop>) with the raw value as default content"
  - "tests/unit/device-list-parity.cjs in the test:unit chain (extended by 44-02)"
affects: [44-02, 44-03, 45, 46, 47]
tech-stack:
  added: []
  patterns:
    - "One platform module (keys + labels) plus one SCSS keyed list (colours), same keys"
    - "Dynamic named scoped slot in List.vue for per-column cell overrides"
    - "require.context limited to b_medium_NN.png for bundled device symbols"
key-files:
  created:
    - services/console/vue/src/utils/platforms.js
    - services/console/vue/src/components/PlatformBullet/PlatformBullet.vue
    - services/console/vue/src/styles/_platforms.scss
    - services/console/vue/tests/unit/device-list-parity.cjs
  modified:
    - services/console/vue/src/pages/Devices/Devices.vue
    - services/console/vue/src/components/List/List.vue
    - services/console/vue/src/pages/Repositories/Repositories.vue
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/package.json
decisions:
  - "Devices filter data field is platformFilter, not filterPlatform: the plan's name contains the forbidden string 'Platform:' (filterPlatform: 'All') that the plan's own verify grep rejects"
  - "Grid card 8px tile gap is a rule on the tile (.device-card-heading > .device-icon { margin-right: 8px }), since Bootstrap mr-2 is 7px at the 14px root"
  - "Test colour parser accepts hsla(): Dart Sass compressed output writes rgba(255,255,255,.24) as hsla(0,0%,100%,.24)"
metrics:
  duration: "10m 27s"
  started: 2026-10-13T11:25:18Z
  completed: 2026-10-13T11:35:45Z
  tasks: 3
  files: 9
actuals:
  tokens: 13904
  tasks: 3
  commits: 6
commits: 6
commits_repo: services/console
plan_head_before: cfff199c57dade67e6701baacc998927b030a52c
plan_head_after: 96957a61059bb1875191118715f85b72a7eee668
requirements: [DEV-01, DEV-04, REPO-01]
---

# Phase 44 Plan 01: Platform module, PlatformBullet, device icon tiles and platform filter Summary

One platform module (`PLATFORMS`, `basePlatform`, `platformInfo`) feeds a shared `PlatformBullet` in the Legacy palette.
The bullet now renders in the Devices table and grid and in Repositories rows, where `unknown_platform` reads
`unknown`. Every device shows its Legacy `b_medium_NN` symbol on a platform-coloured tile. The category pills are
gone; a base-platform filter and sort replace them.

All commits are in the console submodule (`services/console`, branch `thinx-staging`). `commits`, `plan_head_before` and
`plan_head_after` above are measured there (cfff199..96957a6). Nothing is pushed, and the parent gitlink is unchanged
(44-03 bumps it).

## Tasks

| Task | Name | RED commit | GREEN commit | Files |
|------|------|------------|--------------|-------|
| 1 (tracer) | Platform bullet end to end in the device table (DEV-04) | 89c8068 | b74d361 | utils/platforms.js, PlatformBullet.vue, Devices.vue, device-list-parity.cjs, package.json |
| 2 | Platform palette in the theme and the repository bullet (DEV-04, REPO-01) | cde2738 | e67d54f | _platforms.scss, theme.scss, List.vue, Repositories.vue, device-list-parity.cjs |
| 3 | Device icon tiles, platform filter and sort, category UI removed (DEV-01, DEV-04) | b5967db | 96957a6 | Devices.vue, _platforms.scss, device-list-parity.cjs |

All six commits are GPG-signed (`%G?` = `G`).

## TDD Gate Compliance

Each pair is RED (`test(vue): …`), then GREEN (`feat(vue): …`).

- **Task 1 RED (89c8068):** `node tests/unit/device-list-parity.cjs` exit 1; all 7 checks FAIL with
  `ENOENT … src/utils/platforms.js` (module and component did not exist).
- **Task 2 RED (cde2738):** exit 1; 5 FAIL: `no .platform-arduino rule`, `.platform-bullet has the UI-D04 shape
  (display)`, `.platform-bullet box-shadow undefined`, and the two Repositories checks with
  `platform cell holds one PlatformBullet`. The no-slot List check and the store-unchanged check already passed, as
  intended: they guard against regressions.
- **Task 3 RED (b5967db):** exit 1; 12 FAIL, including `still present: grey-mint`, `8 columns`, `Hotel 8 cells`,
  `one "Filter by platform" group`, `colspan 8`, `.device-icon display`. The one-device check already passed
  (existing behaviour).
- **GREEN:** after each GREEN commit, `LC_ALL=C npm --prefix services/console/vue run test:unit` exits 0 with 0 `FAIL `
  lines. device-list-parity.cjs ends with 29 `ok` lines.

## Verification

- `LC_ALL=C npm --prefix services/console/vue run test:unit`: exit 0, 0 FAIL lines (whole chain, final tree).
- `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build`: exit 0 after Task 1 and after
  Task 3. The bundle contains `platform-bullet`, `Platform.io`, `Filter by platform`, `device-icon-symbol`, the 73
  `./b_medium_NN.png` context keys (no `b_large`), and no `category-pill-`. `dist/css/app.*.css` has `.platform-bullet`,
  `.device-icon`, `.platform-arduino{background-color:#00979d;color:#000}` and the `--sm` tile rules.
- Forbidden-string grep over Devices.vue: grey-mint, yellow-crusta, red-intense, purple-studio, green-dark,
  CATEGORY_COLORS, categoryColor, category-pill, `Platform:`, device.category all at 0. There is no `zoom` in
  `_platforms.scss`.
- Exactly nine paths changed since cfff199 (the plan's list); `store/repositories.js`, Enviros, Channels, Apikeys and
  Legacy `services/console/src` are untouched; `status --porcelain -- vue` is empty; HEAD is 6 commits ahead of
  `origin/thinx-staging` (not pushed).
- `v-html`: 0 in PlatformBullet.vue, List.vue and Repositories.vue.
- Tracer gate (Task 1): interactive mode, end-of-phase human verify, automated-only verify, so the verify was re-run
  instead of a checkpoint. It passed, and the plan continued.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Data field `platformFilter` instead of `filterPlatform`**
- **Found during:** Task 3 GREEN
- **Issue:** the plan says to rename the filter field to `filterPlatform`, but `filterPlatform: 'All'` contains
  `Platform:`. That string is forbidden in Devices.vue by the plan's own Task 3 verify grep, by UI-SPEC UI-D18, and by
  the 44-02 verify.
- **Fix:** the field is `platformFilter`, and the unit test uses that name. Behaviour is unchanged: pill click sets it,
  and `activePlatform` falls back to All.
- **Files modified:** Devices.vue, device-list-parity.cjs
- **Commit:** 96957a6

**2. [Rule 1 - Bug] Test colour parser did not read Dart Sass `hsla()` output**
- **Found during:** Task 2 GREEN
- **Issue:** compressed Dart Sass writes `rgba(255, 255, 255, .24)` as `hsla(0,0%,100%,.24)`. The copied
  login-page.cjs parser only knows hex/rgb(a), so the inset-outline check failed against correct CSS.
- **Fix:** `parseColour` also converts `hsl()`/`hsla()`.
- **Files modified:** device-list-parity.cjs
- **Commit:** e67d54f

**3. [Rule 1 - Bug] Alias-sort expectation depended on the host locale**
- **Found during:** Task 3 GREEN
- **Issue:** the page sorts with `localeCompare`. Under this machine's Czech ICU collation, "Ch" sorts after "H", so
  `Charlie` came after `Hotel`, while the test expected plain `Array.sort()` order.
- **Fix:** the test builds its expected alias order with the same `localeCompare`. The page is unchanged: its
  comparator predates this phase.
- **Files modified:** device-list-parity.cjs
- **Commit:** 96957a6

**Discretion (not a deviation):** the grid header wrapper carries `device-card-heading`, and the 8px gap is
`.device-card-heading > .device-icon { margin-right: 8px }`. The plan allowed "a margin utility or rule on the tile".
Bootstrap `mr-2` is 7px at the 14px root, so a rule was needed to get exactly 8px.

## Known Stubs

None.

## Deferred / Known Follow-ups

- `cypress/integration/devices.spec.js` still asserts the old `category-pill-*` hooks and is stale from Task 3 on.
  This is planned: Phase 48 CI-07 rewrites it to `platform-pill-*`, and this plan changes no Cypress files (D-16).
- UI-SPEC E1 error (a failed GET /device shows no message) is pre-existing and was left alone, as the plan's flagged
  assumption says.

## Threat Model Coverage

- T-44-01: the bullet and tile render only fixed labels and `platform-<key>` classes from the nine keys, with text
  interpolation only (no `v-html`). Unit checks feed `esp-idf:foo`, `unknown_platform`, `null`, `42`, `{}` and `[]`.
- T-44-02: `symbolSrc` builds the context key only from an integer in 1..73 (else 01), and the context regex admits
  only `b_medium_\d\d.png`. Checks cover 7, '12', 73, 0, 74, 'x', null and a missing icon.
- T-44-03: `platformInfo` never throws, and every page render check asserts no Vue warnings and no render errors.
- T-44-04: List.vue's default slot content is the previous cell expression, and the no-slot check confirms the raw
  values still render.
- T-44-SC: no installs and no lock-file changes.

No new security surface beyond the plan's threat model.

## Self-Check: PASSED

- FOUND: services/console/vue/src/utils/platforms.js
- FOUND: services/console/vue/src/components/PlatformBullet/PlatformBullet.vue
- FOUND: services/console/vue/src/styles/_platforms.scss
- FOUND: services/console/vue/tests/unit/device-list-parity.cjs
- FOUND (ancestors of console HEAD): 89c8068, b74d361, cde2738, e67d54f, b5967db, 96957a6
