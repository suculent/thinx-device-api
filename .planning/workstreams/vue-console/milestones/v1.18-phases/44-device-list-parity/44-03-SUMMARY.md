---
phase: 44-device-list-parity
plan: 03
subsystem: vue-console
status: complete
tags: [deploy, console, vue, verification, uat]
requires:
  - "44-01: platforms.js, PlatformBullet, device icon tiles, platform filter (console 89c8068..96957a6)"
  - "44-02: IconButton, one-line actions cell, hammer build guard, status, firmware, API-key warning (console fff5f31..6a34102)"
provides:
  - "Console thinx-staging at 6a34102 on origin; parent gitlink bump d630652e on origin thinx-staging"
  - "Pipeline 5662 (legacy-off, no Snyk): test, api-registry, vue-console-registry all success"
  - "console.thinx.cloud serves the Phase 44 device list bundle (id d630652)"
affects: [45, 46, 47, 48]
tech-stack:
  added: []
  patterns:
    - "Deploy order: console fast-forward push, signed gitlink bump, parent fast-forward push, check-ci-gates pipeline --wait, live bundle id poll"
key-files:
  created:
    - .planning/workstreams/vue-console/phases/44-device-list-parity/44-03-SUMMARY.md
  modified:
    - services/console (gitlink cfff199 -> 6a34102)
decisions:
  - "No CircleCI rerun was needed or attempted; the operator's directive for this session forbids reruns, so the plan's rerun-once step was not available as a fallback"
metrics:
  duration: "8m 35s"
  started: 2026-10-13T11:51:06Z
  completed: 2026-10-13T11:59:41Z
  tasks: 2
  files: 1
actuals:
  tokens: 6000
  tasks: 2
  commits: 1
commits: 1
plan_head_before: f530156f90a222a725b9937c1d667b925f8c3a98
plan_head_after: d630652e04f28ac275b0d7aab2f0cec638dabede
requirements: [DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, REPO-01]
---

# Phase 44 Plan 03: Ship the device list to production Summary

The device list work is live. Console `thinx-staging` went from cfff199 to 6a34102 and the parent from 4fcacece to
d630652e, both as fast-forward pushes. Pipeline 5662 ran only test, api-registry and vue-console-registry, all
successful, with no Snyk or legacy console job. console.thinx.cloud picked up the new bundle with id `d630652` about
6 minutes after the push. It carries every Phase 44 marker and none of the removed category strings. The Legacy
console on rtm.thinx.cloud serves byte-identical `main.js` and `LogviewController.js`. The nine visual and interaction
checks are queued for the operator's end-of-phase UAT.

`commits: 1` is the parent gitlink bump (measured `f530156f..d630652e`). The console commits were made and counted in
44-01 and 44-02; this plan only pushed them.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (tracer) | Ship console and parent to thinx-staging, prove the pipeline job list | d630652e | services/console |
| 2 | Prove the deployed bundle and the untouched Legacy console, queue UAT | none (read-only) | none |

## Task 1: preflight, range checks, pushes, pipeline

### Preflight (all before any push)

| Check | Result |
|-------|--------|
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | exit 0, 0 FAIL lines, 198 `ok` lines |
| `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build` | exit 0, "Build complete" |
| `npm --prefix services/console/vue run test:csp:dist` | exit 0: PASS no inline JS (public, dist), PASS enforced script policy |
| `npm --prefix services/console/vue run perf:spotter` | exit 0, all budgets passed. JS 7.02 MiB raw / 2.76 MiB gzip, CSS 616.63 KiB / 89.75 KiB gzip, 6 initial assets, largest `app-legacy` 753.57 KiB gzip |
| `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK`; false/thinx-staging = test, vue-console-registry, api-registry; true/thinx-staging adds console-classic-registry; main sets unchanged |

### Baselines (unauthenticated GETs, before the push)

- Legacy `https://rtm.thinx.cloud/app/js/main.js`: 28878 bytes, sha256 `819c133e9111a55fa7037df16b3f502c93f1816ce8064b756db3a9a8e31c7c16`
- Legacy `https://rtm.thinx.cloud/app/js/controllers/LogviewController.js`: 12538 bytes, sha256
  `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d`
- Vue `https://console.thinx.cloud/js/app.js` before: 3099431 bytes, build id `4fcacec` (2 hits). Counts:
  `platform-bullet` 0, old pill hook `category-pill-` 1, `grey-mint` 2, `CATEGORY_COLORS` 2, `categoryColor` 4.
- Parent `origin/main`: `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` (unchanged after the push). Console `origin/main`:
  `a0e86707` (not touched).

### Console range, verify 1 (before the console push): exit 0

- `origin/thinx-staging` cfff199 is an ancestor of HEAD 6a34102. All 12 commits are `G`, and they change exactly the
  13 phase paths. `src/` (Legacy) has no diff.

```
6a34102 G feat(vue): heartbeat status, firmware cogs and missing API-key warning (DEV-02, DEV-05)
03e307b G test(vue): expect Legacy status, firmware and the API-key warning (DEV-02, DEV-05)
ad0fab6 G feat(vue): hammer build action with in-flight guard, view-log and revoke icons (DEV-02, DEV-03)
f108f1c G test(vue): expect the hammer build action and the view-log action (DEV-02)
8d993f4 G feat(vue): shared IconButton and a one-line actions cell with the Edit icon (DEV-02, DEV-03)
fff5f31 G test(vue): add failing icon button and actions cell checks (DEV-03)
96957a6 G feat(vue): device icons on platform tiles, platform filter and sort (DEV-01, DEV-04)
b5967db G test(vue): expect device icon tiles and the platform filter (DEV-01)
e67d54f G feat(vue): platform palette and repository platform bullet (DEV-04, REPO-01)
cde2738 G test(vue): expect platform colours and the repository bullet (DEV-04, REPO-01)
b74d361 G feat(vue): shared platform module and bullet in the device table (DEV-04)
89c8068 G test(vue): add failing platform bullet checks (DEV-04)
```

Pushed: `thinx-cloud/console` `cfff199..6a34102 thinx-staging -> thinx-staging` (fast-forward).

### Gitlink bump

`d630652e G chore(44): bump console to device list parity (DEV-01..05, REPO-01)`. Staged with `git add services/console`
only; `git diff --cached --name-only` and `git show --name-only` both print exactly `services/console`.

### Parent range, verify 2 (before the parent push): exit 0

After `git fetch origin thinx-staging main`, origin/thinx-staging (4fcacece) was still an ancestor of HEAD, so no
rebase was needed. Every outgoing commit is `G`, the range has no merges, and the only change outside `.planning/` is
`services/console`. The gitlink equals console `origin/thinx-staging` (6a34102).

```
d630652e G chore(44): bump console to device list parity (DEV-01..05, REPO-01)
f530156f G docs(44-02): complete icon actions, status and API-key warning plan
6cd25c7b G docs(44-01): complete platform bullet, device icon tiles and platform filter plan
8bd1e74b G docs(44): create phase plan
594cc74c G docs(44): UI-SPEC approved by checker (6 PASS, 1 FLAG)
e1903ff8 G docs(44): UI design contract
a3cf5630 G docs(44): smart discuss context
971e2d15 G docs(43): complete phase 43, carry three Legacy items to Phase 48
363dc0eb G docs(43): re-verify phase 43 after review fixes and 409 retry (passed, 61/61)
6579deb1 G docs(43): human UAT passed, verification passed, record the 409 follow-up
8bdf69b0 G docs(39): research and verify OpenBao phase plans
```

`8bdf69b0` is vault-transit planning documentation, under `.planning/` only, so the plan's path rule allows it.

Pushed: `suculent/thinx-device-api` `4fcacece..d630652e thinx-staging -> thinx-staging` (fast-forward, 11:53:08Z).

### Pipeline proof, verify 3: exit 0

```
pipeline 5662 51b456f2-196f-4da3-96ea-c2209f60722d branch=thinx-staging revision=d630652
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5662
```

No snyk-* and no console-classic-* job ran. This also closes the Phase 43 backstop "the next normal thinx-staging push
runs legacy-off".

### Post-push refs, verify 4: exit 0

Parent origin/thinx-staging = HEAD = d630652e. Console origin/thinx-staging = console HEAD = parent gitlink = 6a34102.
`git log -1 --format='%G? %s' -- services/console` prints `G chore(44): bump console to device list parity
(DEV-01..05, REPO-01)`. `git ls-remote origin refs/heads/main` still prints `14c08c1f…`.

## Task 2: live proofs

### Rollout

Polled every 30 s from 11:53:42Z. `4fcacec` was served through attempt 11 (11:58:48Z), and `d630652` appeared at
attempt 12 (11:59:18Z), about 6 minutes after the push.

### Bundle markers, verify 1: exit 0

`https://console.thinx.cloud/js/app.js`: 3153568 bytes (was 3099431), id `d630652` (2 hits).

| Marker | Hits |
|--------|------|
| platform-bullet | 4 (was 0) |
| icon-button__text | 2 |
| actions-cell | 2 |
| api-key-indicator | 3 |
| icomoon-hammer_icon | 3 |
| Filter by platform | 1 |
| No build yet | 2 |
| Device reported an error | 4 |
| No API key assigned. The device cannot check in until you assign one. | 1 |
| grey-mint | absent (was 2) |
| category-pill- | absent (was 1) |
| CATEGORY_COLORS | absent (was 2) |
| categoryColor | absent (was 4) |

### Legacy byte identity, verify 2: exit 0

```
…/p44-legacy-main.js: OK
…/p44-legacy-logview.js: OK
```

No legacy console image was built or rolled out. CI-05 is still in effect.

## Human UAT (pending, end of phase; listed unchanged from the plan)

Operator, logged in to https://console.thinx.cloud (open Devices and Repositories from the sidebar; reloading a deep
link still lands on the dashboard until Phase 48):

1. Devices, list view at 1280x720: each row shows the checkbox, a 32px platform-coloured tile with the Legacy device symbol, the alias, the platform bullet (for example "Arduino" on teal with black text; an unknown platform reads "unknown"), cogs + firmware, heartbeat + status ("Registered" when there is none), Last Seen, and Build (hammer), View log (eye), Edit (pencil), Revoke (trash) with their text, all on one line. No colour name such as a category label appears anywhere.
2. Resize to 1024, 768 and 375 px wide (DevTools device toolbar): the Actions cell stays on one line at every width; below 992 px only icons show and hovering an icon shows its text; the page itself never gets a horizontal scrollbar, and at 1024 px any horizontal scroll is inside the table box (UI-SPEC backstop E5 overflow).
3. A device without an API key shows an orange warning triangle right after the heartbeat; its hover tip reads "No API key assigned. The device cannot check in until you assign one." Devices with a key show none. If no device lacks a key, record that.
4. Filter pills read "All" plus the platforms present (display names, unknown last); clicking one filters the list; sort "Platform" groups by platform, then alias. Grid view: 48px tile + alias header, bullet line, firmware, status, last seen, and Build / View log / Edit in one row with Edit on the right.
5. View log on a device with a build opens the build log dialog; a device without a build shows a disabled eye whose tip reads "No build yet". Edit opens Device Detail. Revoke opens "Confirm Revoke"; press Cancel. Build is optional (it starts a real build): if pressed once, it shows a spinner with "Building…" until the request settles, then "Build triggered." or an error message.
6. DevTools Network with cache disabled: no failed font or image request on the Devices page; the hammer glyph renders as a hammer, not a box or blank; the tiles show a visible platform-coloured frame around the symbol (UI-SPEC backstop E1 populated).
7. If a device has a status longer than 22 characters or a firmware string wider than its cell: the status shows 22 characters and "…" with the full text as tip, the firmware is cut with "…" and its full text is the tip (UI-SPEC backstop E5 long-text). Otherwise record "no long data on production; covered by the 44-02 unit checks".
8. Repositories: the platform column shows the same bullet as Devices; a repository whose platform is unknown reads "unknown", never "unknown_platform".
9. Run the console-retest project skill against https://rtm.thinx.cloud/ (Legacy): the Devices page still renders against the redeployed API, websocket target wss://rtm.thinx.cloud/…, no sensitive console logging.

## Deviations from Plan

### Not executed

**1. Step 8 evidence (console repo `test_vue` run) not collected**
- The plan asks for this through the CircleCI MCP "if readable", as evidence only and not a gate. The CircleCI MCP tools
  were not available to this executor, so nothing was recorded. The known state is unchanged: Cypress has been red
  since 2026-10-01 (CI-07, Phase 48), and 44-01/44-02 already list the stale `devices.spec.js` assertions.

### Constraint applied

**2. The rerun-once fallback was not available**
- Step 7 allows one `rerun_workflow` for a transient failure. The operator's directive for this session forbids
  rerunning or re-triggering pipelines. Pipeline 5662 passed on its first run, so the fallback was never needed.

Otherwise the plan ran as written. No rebase was needed and nothing was force-pushed. Main, PRs and
build_legacy_console were not touched. There was no ssh or docker command, no login, cookie or token, no `.env*`
read and no env-dumping command.

## Known Stubs

None.

## Threat Model Coverage

- T-44-10: verify 2 passed before the parent push (signed, no merges, only `services/console` outside `.planning/`,
  gitlink = pushed console commit). No rebase was needed, and the compile gate was green before the push.
- T-44-11: verify 1 passed before the console push (signed, 13 paths, no `src/` diff); fast-forward push.
- T-44-12: the full preflight was green, `--wait` reported all three required jobs successful, and the live bundle check
  passed. Rollback is a revert of d630652e pushed to thinx-staging.
- T-44-13: every pushed commit and the bump are `G`.
- T-44-14: all production and CircleCI reads were unauthenticated GETs. The evidence is job names, statuses, hashes,
  sizes and marker counts only.
- T-44-SC: no installs.

## Self-Check: PASSED

- FOUND: d630652e (HEAD, on origin/thinx-staging)
- FOUND: console 6a34102 = origin/thinx-staging = parent gitlink
- FOUND: pipeline 5662 `CI-GATES PIPELINE OK`
- FOUND: Legacy `shasum -c` OK x2; bundle id d630652 with all markers
