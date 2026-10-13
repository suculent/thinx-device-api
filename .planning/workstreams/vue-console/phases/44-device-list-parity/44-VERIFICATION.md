---
phase: 44-device-list-parity
verified: 2026-10-13T12:05:16Z
status: human_needed
score: 20/24 must-haves verified (4 backstop truths routed to operator UAT, 0 failed)
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
covered_digest: "v3:sha256:b02c9410b06a056034bd7dea0b961981b7127a99d1576b7436a69055bc30f7fd"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "U1 (DEV-01..05, E1 populated): Devices list view at 1280x720, logged in at https://console.thinx.cloud"
    expected: "Each row: checkbox, 32px platform-coloured tile with the Legacy symbol, alias, platform bullet (unknown platform reads 'unknown'), cogs + firmware, heartbeat + status ('Registered' when none), Last Seen, Build (hammer) / View log (eye) / Edit (pencil) / Revoke (trash) with text on one line; no category colour name anywhere"
    why_human: "Visual appearance on production with real devices; needs an authenticated session the verifier must not create"
  - test: "U2 (DEV-03, backstop E5 overflow): resize to 1024, 768 and 375 px"
    expected: "Actions cell stays one line at every width; below 992px icons only with the text as hover tip; no page-level horizontal scrollbar; at 1024px any scroll is inside the table box"
    why_human: "Real-browser layout at several widths; the plan marks this truth verification: backstop (presence of nowrap CSS is not accepted as evidence)"
  - test: "U3 (DEV-05): device without an API key"
    expected: "Orange warning triangle right after the heartbeat, tip 'No API key assigned. The device cannot check in until you assign one.'; devices with a key show none (record if no device lacks a key)"
    why_human: "Depends on live device data and hover rendering"
  - test: "U4 (DEV-01, DEV-04): filter pills, sort and grid view"
    expected: "Pills 'All' plus present platforms by display name, unknown last; a pill filters; sort Platform groups by platform then alias; grid card shows 48px tile + alias header, bullet, firmware, status, last seen, and Build / View log / Edit in one row with Edit on the right"
    why_human: "Interactive behaviour on production data"
  - test: "U5 (DEV-02): View log, Edit, Revoke (cancel), optional Build"
    expected: "View log opens the build log dialog; no-build device shows a disabled eye with tip 'No build yet'; Edit opens Device Detail; Revoke opens 'Confirm Revoke' (press Cancel); Build, if pressed once, shows the spinner with 'Building…' until settled, then 'Build triggered.' or an error"
    why_human: "Live dialogs and a real build request"
  - test: "U6 (backstop E1 populated): DevTools Network, cache disabled, on Devices"
    expected: "No failed font or image request; the hammer renders as a hammer (not a box or blank); tiles show a visible platform-coloured frame around the symbol"
    why_human: "Glyph and image rendering in a browser; backstop truth"
  - test: "U7 (backstop E5 long-text): long status or firmware on production"
    expected: "Status shows 22 characters + '…' with full text as tip; firmware cut with '…' with full text as tip; otherwise record 'no long data on production; covered by the 44-02 unit checks'"
    why_human: "Rendering of real data; backstop truth"
  - test: "U8 (REPO-01): Repositories page"
    expected: "Platform column shows the same bullet as Devices; an unknown platform reads 'unknown', never 'unknown_platform'"
    why_human: "Needs an authenticated session and real repository data"
  - test: "U9: console-retest project skill against https://rtm.thinx.cloud/ (Legacy)"
    expected: "Devices page renders against the redeployed API, websocket target wss://rtm.thinx.cloud/…, no sensitive console logging"
    why_human: "Legacy Devices page render needs an authenticated session"
  - test: "U10: prohibitions review (14 judgment-tier items, all flagged)"
    expected: "Operator accepts the verifier's non-authoritative 'not violated' verdicts in the Prohibitions table"
    why_human: "Judgment-tier prohibitions need explicit human resolution (ADR-550 D4)"
---

# Phase 44: Device List Parity Verification Report

**Phase Goal:** The Vue device list reads like the Legacy one: platform-named device icons, the Legacy action icons on a single line, platform bullets, and a visible warning on devices without an API key. Repositories show the same platform bullet.
**Verified:** 2026-10-13T12:05:16Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Code verified at console `6a34102` (= console `origin/thinx-staging` = parent gitlink), parent `origin/thinx-staging`
`d630652e`; local parent HEAD `c9a79639` is two docs-only commits ahead (44-03 summary, UI review).

## Goal Achievement

### Observable Truths

Roadmap success criteria (T1-T4) are the contract; T5-T24 merge the 44-01/02/03 plan truths (grouped where they restate each other).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | SC1: each device row shows the Legacy `device-icon` / `device-icon-symbol` on a background whose class and label are the platform name; no colour-description class such as `grey-mint` in the device list | ✓ VERIFIED | `Devices.vue` table cell 2 and grid header: `span.device-icon[.device-icon--sm] .platform-<key>` with `title` = label and `img.device-icon-symbol` from `require.context('@/assets/thinx/ioticons', …b_medium_\d\d.png)`, 01 fallback. No `category` read, no colour names (grep clean). Tests: "rendered Devices (both views) shows no category in any class, attribute or text", "table rows: second cell is the 32px platform tile". Live `app.js`: `grey-mint`/`CATEGORY_COLORS`/`categoryColor`/`category-pill-` all 0 hits |
| T2 | SC2: Legacy status, firmware, build, view-log and edit icons; edit opens Device Detail; Actions cell on one line, icons only when space runs out, text kept as aria-label and hover tip | ✓ VERIFIED (code) | `fa-heartbeat`, `fa-cogs`, `icomoon-hammer_icon`, `fa-eye`, `fa-pencil` in both views. `viewDevice` pushes `{name:'DeviceDetail'}` (route exists, `Routes.js:71`); test asserts the push. `td.actions-cell` = `white-space:nowrap;width:1%` (dist CSS), table in `.table-responsive`; `IconButton` text span `d-none d-lg-inline`, `aria-label`=label, `title` on wrapper span (test "IconButton renders the UI-D07 markup…"). Real-browser width behaviour is the separate backstop T21 |
| T3 | SC3: Legacy-style bullet, no "Platform:" label; identical bullet in device and repository rows; repo with no known platform shows `unknown`, never `unknown_platform` | ✓ VERIFIED | `PlatformBullet.vue` renders `span.platform-bullet.platform-<key>{label}` only. Devices table/grid and `Repositories.vue` (`<template #cell(platform)>` into `List.vue` scoped slot) use it. Tests: "Repositories bullet markup equals the Devices bullet for arduino:esp8266", "Repositories renders the unknown bullet and never unknown_platform", "PlatformBullet has no 'Platform:' text" |
| T4 | SC4: device with no API key shows `fa-warning` whose tip explains it has no API key | ✓ VERIFIED | `missingApiKey()` true for null/undefined/''; `span.api-key-indicator[role=img][data-cy=api-key-warning]` with `fa fa-warning`, aria-label and title = D-14 sentence, both views. Test fixtures cover null, '' and missing keyhash vs 'abc'. Data flow: `keyhash` in GET /device descriptor (`lib/thinx/devices.js`), passed through `saveDevices` spread. D-14 sentence in live bundle (1 hit) |
| T5 | `utils/platforms.js` is the only platform module (9 keys/labels, sigfox build:false), `basePlatform`/`platformInfo` never throw, unknown fallback | ✓ VERIFIED | File read; tests "PLATFORMS holds exactly the nine…", "basePlatform maps…", "platformInfo … never throws" |
| T6 | `List.vue` without a slot renders raw values as before; `store/repositories.js` unchanged | ✓ VERIFIED | Slot fallback `{{ item[header.prop] }}`; tests "List.vue without a slot…", "store/repositories.js is unchanged since cfff199"; `git diff cfff199 6a34102` lists no store file |
| T7 | Compiled theme: one `.platform-<key>` rule per key with the palette, 4.5:1 text, inset outline on bullet and tile | ✓ VERIFIED | `_platforms.scss` `$platform-colors`; dist CSS `.platform-arduino{background-color:#00979d;color:#000}`; test reports all 9 contrasts ≥ 4.66 |
| T8 | Platform pills (All + present platforms by label, unknown last, `platform-pill-<key>`, group "Filter by platform"), filter by base platform, fallback to All, sort by base platform then alias, E1/E2 empty and loading states | ✓ VERIFIED | `platformPills`/`activePlatform`/`filteredItems`; 7 passing tests incl. "a reload without the selected platform falls back to All", "empty states…never text-muted" |
| T9 | `IconButton` contract (props, `inheritAttrs:false`, data-cy lands on button, emits click only when enabled) | ✓ VERIFIED | File read; tests "IconButton passes variant and disabled through and emits click only while enabled" |
| T10 | Build states (in-flight spinner, Sigfox 'Not supported', 'No source', hammer) and in-flight guard: one click sends one `buildFirmware({udid, source_id})`, released on success, failure and throw | ✓ VERIFIED (behavioral) | `buildAction`/`buildDevice` with `try/finally` splice. State-transition truth exercised by passing test "buildDevice sends one request while in flight and releases it on success, failure and rejection" (this run) |
| T11 | Hammer is the Legacy icomoon `\e900` glyph; woff/ttf byte copies; only `.icomoon-hammer_icon` defined | ✓ VERIFIED | `cmp` against `services/console/src/assets/thinx/fonts/icomoon.{woff,ttf}`: identical. Dist CSS: woff inlined as data URI, `content:""` (bytes `ee a4 80`). `theme.scss:15` imports the partial |
| T12 | View log opens BuildLogDialog for `last_build_id`; disabled with 'No build yet' without a build | ✓ VERIFIED | `openLastBuild` → `$refs.buildLogDialog.open({build_id})`; `BuildLogDialog.open(build)` reads `build.build_id`. Test stubs the ref and asserts the opened payload |
| T13 | Status (heartbeat, cleaned text, Registered, 22 + '…', `#e`/`#w` markers) and firmware (cogs, '—', 240px ellipsis) cells in both views; no raw-HTML binding | ✓ VERIFIED | `cleanStatus`/`statusText`/`statusTitle`; tests "status helpers…", "table: firmware cell…", compiled CSS check; no `v-html` in any phase source file |
| T14 | Cypress hooks `device-row`, `device-card`, `row-detail`, `row-build`, `row-revoke` kept; Revoke keeps 'Confirm Revoke' | ✓ VERIFIED | Hooks present in `Devices.vue`; diff shows no change to `msgBoxConfirm`/'Confirm Revoke'/bulk buttons; test "Revoke keeps its confirmation" |
| T15 | Local gates pass: `test:unit`, production build, `test:csp:dist`, `perf:spotter`, `check-ci-gates.js compile` | ✓ VERIFIED | Re-run by verifier: unit exit 0, 198 ok, 0 FAIL; build exit 0 "Build complete"; csp:dist 3 PASS exit 0; perf:spotter "All performance budgets passed"; `CI-GATES COMPILE OK` |
| T16 | Console range carries only Phase 44: 12 signed commits, exactly the 13 phase paths, no Legacy `src/` change | ✓ VERIFIED | `git log %G?` cfff199..6a34102: 12 × G; `diff --stat`: 13 files under `vue/`; `diff -- src`: empty; no lock file; `package.json` only gains the test chain entry (89c8068) |
| T17 | Signed gitlink bump changes only `services/console`; gitlink = console origin/thinx-staging = 6a34102; parent origin/thinx-staging = d630652e; origin/main unchanged | ✓ VERIFIED | `git log -1 %G?` d630652e = G; `ls-tree HEAD services/console` = 6a34102; `origin/main` = 14c08c1f (matches pre-push baseline); outgoing parent range touches only `services/console` outside `.planning/`; no `.circleci` change |
| T18 | Push pipeline for d630652e ran test, api-registry, vue-console-registry, no snyk-*/console-classic-* | ✓ VERIFIED | Re-run: `CI-GATES PIPELINE OK 5662` (3 jobs, success) |
| T19 | console.thinx.cloud `/js/app.js` carries the build id and all Phase 44 markers, none of the removed category strings | ✓ VERIFIED | Unauthenticated GET 200, 3153568 B: `d630652` 2, platform-bullet 4, icon-button__text 2, actions-cell 2, api-key-indicator 3, icomoon-hammer_icon 3, 'Filter by platform' 1, 'No build yet' 2, 'Device reported an error' 4, D-14 sentence 1; grey-mint / category-pill- / CATEGORY_COLORS / categoryColor 0. Palette CSS is in app.js (style-loader) |
| T20 | Legacy rtm `app/js/main.js` and `LogviewController.js` byte-identical to the pre-deploy baseline | ✓ VERIFIED | Re-hashed now: 28878 B `819c133e…7c16`, 12538 B `e556c292…c59d`, equal to the 44-03 baselines |
| T21 | Backstop E5 overflow: Actions cell one line at 375/768/1024/1280px, no page horizontal scrollbar | ? HUMAN (backstop, insufficient_spec) | Non-inferable truth; CSS presence does not qualify. Operator UAT U2 |
| T22 | Backstop E5 long-text: 200-char status → 22 + '…' with tip; 120-char firmware ellipsised in 240px | ? HUMAN (backstop, insufficient_spec) | Helper logic and CSS unit-tested (T13), rendered result needs a browser. UAT U7 |
| T23 | Backstop E1 populated: deployed tiles show symbols in a visible frame, hammer renders, no failed font/image request | ? HUMAN (backstop, insufficient_spec) | UAT U6 |
| T24 | Operator end-of-phase check of list, grid, filter, actions, warning and Repositories bullet on production | ? HUMAN | UAT U1, U3, U4, U5, U8, U9 |

**Score:** 20/24 truths verified (0 present-but-behavior-unverified, 4 routed to operator UAT, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/utils/platforms.js` | PLATFORMS, basePlatform, platformInfo | ✓ VERIFIED | Imported by Devices.vue and PlatformBullet.vue |
| `vue/src/components/PlatformBullet/PlatformBullet.vue` | Shared bullet | ✓ VERIFIED | Used in Devices (2×) and Repositories |
| `vue/src/components/IconButton/IconButton.vue` | Shared icon button | ✓ VERIFIED | 7 uses in Devices.vue |
| `vue/src/components/List/List.vue` | `cell(<prop>)` scoped slot with raw fallback | ✓ VERIFIED | One-line change; slot consumed by Repositories |
| `vue/src/styles/_platforms.scss` | Palette, bullet, tile, icon button, actions cell, status, firmware | ✓ VERIFIED | Imported at `theme.scss:25`; rules present in dist CSS |
| `vue/src/fonts/icomoon/_icomoon.scss`, `icomoon.woff`, `icomoon.ttf` | Font face + hammer rule; byte copies | ✓ VERIFIED | `theme.scss:15`; cmp identical |
| `vue/src/pages/Devices/Devices.vue` | Tiles, bullet, pills, icon actions, guard, log dialog, status, warning | ✓ VERIFIED | 363-line diff, substantive |
| `vue/src/pages/Repositories/Repositories.vue` | Bullet via slot | ✓ VERIFIED | `#cell(platform)` |
| `vue/tests/unit/device-list-parity.cjs` | Plain-node checks in the `test:unit` chain | ✓ VERIFIED | Last entry of `test:unit`; ~57 checks, all ok |
| `services/console` gitlink | Bumped to 6a34102 | ✓ VERIFIED | d630652e |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Devices.vue | utils/platforms.js | `import { basePlatform, platformInfo } from '@/utils/platforms'` | ✓ WIRED |
| Devices.vue, Repositories.vue | PlatformBullet.vue | import + `<PlatformBullet :platform=…>` | ✓ WIRED |
| Repositories.vue | List.vue | `<template #cell(platform)="{ value }">` ↔ `<slot :name="'cell(' + header.prop + ')'" …>` | ✓ WIRED |
| theme.scss | _platforms.scss, icomoon partial | `@import 'platforms'`, `@import '../fonts/icomoon/icomoon'` | ✓ WIRED |
| Devices.vue `symbolSrc()` | `assets/thinx/ioticons/b_medium_NN.png` | `require.context` | ✓ WIRED |
| Devices.vue | IconButton.vue | `<IconButton …>` | ✓ WIRED |
| Devices.vue View log | BuildLogDialog `open()` | `this.$refs.buildLogDialog.open({ build_id })` | ✓ WIRED |
| Devices.vue Build | store `devices/buildFirmware` → POST /build | `buildDevice` guarded by `buildingUdids` | ✓ WIRED |
| parent HEAD → pipeline → console.thinx.cloud | vue-console-registry rollout | pipeline 5662, live id `d630652` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Devices.vue rows/cards | `items` (`platform`, `icon`, `keyhash`, `status`, `firmware`, `source`, `last_build_id`) | `devices/fetchItems` → GET /device → `lib/thinx/devices.js` deviceDescriptor (all fields present) → `saveDevices` spread | Yes | ✓ FLOWING |
| Repositories.vue bullet | `item.platform` | `repositories/fetchItems` → GET /source → `saveItems` spread | Yes | ✓ FLOWING |
| Platform pills | `platformPills` | derived from loaded `items` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit chain incl. device-list-parity | `LC_ALL=C npm --prefix services/console/vue run test:unit` | exit 0, 198 ok, 0 FAIL | ✓ PASS |
| Production build | `NODE_OPTIONS=--openssl-legacy-provider npm run build` | exit 0, Build complete | ✓ PASS |
| CSP on dist | `npm run test:csp:dist` | 3 PASS, exit 0 | ✓ PASS |
| Perf budgets | `npm run perf:spotter` | All performance budgets passed | ✓ PASS |
| CI gate compile | `node scripts/check-ci-gates.js compile` | CI-GATES COMPILE OK | ✓ PASS |
| Pipeline legacy-off | `node scripts/check-ci-gates.js pipeline --revision d630652e… --expect legacy-off` | CI-GATES PIPELINE OK 5662 | ✓ PASS |
| Live bundle markers | unauthenticated GET console.thinx.cloud/js/app.js + grep | all markers present, removed strings 0 | ✓ PASS |
| Legacy unchanged | GET rtm main.js, LogviewController.js + sha256 | equal to 44-03 baselines | ✓ PASS |

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`; its runnable checks are the spot-checks above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DEV-01 | 44-01, 44-03 | Legacy device-icon assets on platform-named background, no `grey-mint` | ✓ SATISFIED | T1, T19 |
| DEV-02 | 44-02, 44-03 | Legacy status, firmware, build, view-log, edit icons | ✓ SATISFIED | T2, T10-T14 |
| DEV-03 | 44-02, 44-03 | Actions cell never wraps; icons only when tight, text as aria-label and tip | ✓ SATISFIED (code); rendering at widths in UAT U2 | T2, T9, T21 |
| DEV-04 | 44-01, 44-03 | Legacy-style bullet without "Platform:" | ✓ SATISFIED | T3, T7 |
| DEV-05 | 44-02, 44-03 | `fa-warning` with explanatory tip on devices without an API key | ✓ SATISFIED | T4 |
| REPO-01 | 44-01, 44-03 | Repository rows use the same bullet; fallback `unknown` | ✓ SATISFIED | T3, T6 |

No orphaned requirements: REQUIREMENTS.md maps exactly DEV-01..05 and REPO-01 to Phase 44, all claimed by plans.

### Prohibitions (judgment tier, all flagged; non-authoritative verifier verdicts)

| Plan | Prohibition (short) | Verdict | Evidence |
|------|---------------------|---------|----------|
| 44-01 | No Legacy/parent/store/List-default change | not violated | `diff -- src` empty; store unchanged; List fallback test |
| 44-01 | No category render, no raw platform string | not violated | render tests both views |
| 44-01 | No push/gitlink in 44-01, no package installs/lock changes, no `npm run eslint/lint` | not violated (lint usage unverifiable) | no lock file in range; package.json only test chain |
| 44-01 | No `.env*`, no env dumps, signed commits only | signatures verified; rest unverifiable from code | 12 × G |
| 44-02 | Revoke confirmation, bulk actions, view toggles, buildFirmware payload unchanged | not violated | diff: payload line identical, no confirm/bulk change |
| 44-02 | No raw-HTML binding for status/firmware | not violated | no `v-html` in phase sources |
| 44-02 | No Legacy/parent/package/lock change in 44-02, no push | not violated | package.json touched only by 89c8068 (44-01) |
| 44-02 | No `.env*`, env dumps, unsigned commits | signatures verified; rest unverifiable | — |
| 44-03 | No push to main, no force-push, no PR | not violated | origin/main 14c08c1f unchanged; fast-forward ranges |
| 44-03 | No other workstream's source commits | not violated | outside `.planning/` only `services/console`; 8bdf69b0 is `.planning/` docs |
| 44-03 | No `build_legacy_console=true`, no `.circleci/config.yml` edit | not violated | pipeline 5662 legacy-off; no `.circleci` diff |
| 44-03 | No ssh/docker/swarm edits | unverifiable from code (SUMMARY attests none) | — |
| 44-03 | No login/cookies/`.env*`/env dumps | unverifiable from code (SUMMARY attests none) | — |
| 44-03 | No unsigned commit or hook bypass | not violated | d630652e = G |

Flagged for operator review as UAT U10.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vue/src/components/List/List.vue` | 95 | `// TODO for count of selected` | ℹ️ Info | Pre-existing (blame 3f8bb3f8), not touched by Phase 44 |
| `vue/src/pages/Devices/Devices.vue` | `toggleDevice`/`checkAll` | Selection not pruned when the platform filter hides devices; bulk Revoke can act on hidden devices (44-UI-REVIEW fix 1) | ⚠️ Warning | Same behaviour as the removed category filter; not a success-criterion failure. Candidate follow-up |
| `vue/src/pages/Devices/Devices.vue` | `loadData` | `Promise.all(...).then` without catch/finally: a rejected load leaves "Loading..." (UI-REVIEW fix 2) | ⚠️ Warning | Pre-existing pattern; list-load errors out of UI-SPEC scope |
| `vue/src/pages/Devices/Devices.vue` | grid card | `text-muted small` last-seen line below 4.5:1 (UI-REVIEW fix 3) | ⚠️ Warning | Pre-existing line, not a Phase 44 criterion |

No TBD/FIXME/XXX debt markers in any phase file. No `v-html`. No stub returns feeding rendered output.

### Human Verification Required

Ten items, recorded in `44-HUMAN-UAT.md` (U1-U9 from 44-03-SUMMARY "Human UAT", U10 prohibitions review). U2, U6 and
U7 carry the three backstop truths T21-T23; U1, U3-U5, U8, U9 carry T24.

### Gaps Summary

No gaps. Every roadmap success criterion and every non-backstop plan truth is backed by code read in this run, a passing
unit test (including the in-flight build guard state transition), a fresh build, CSP and perf run, the re-run pipeline
gate and the live bundle and Legacy hashes. What remains is the operator's look at production: visual rendering at
several widths, glyph and image loading, live data cases, and sign-off on the flagged judgment-tier prohibitions.
Four UI-review warnings (bulk selection across a filter, load error path, grid last-seen contrast, dead `gap-2`) are
worth a follow-up but do not block the phase goal.

---

_Verified: 2026-10-13T12:05:16Z_
_Verifier: Claude (gsd-verifier)_
