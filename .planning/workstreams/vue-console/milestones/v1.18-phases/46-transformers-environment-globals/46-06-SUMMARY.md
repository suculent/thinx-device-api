---
phase: 46-transformers-environment-globals
plan: 06
subsystem: ui
status: complete
tags: [vue, console, device-detail, transformers, unsaved-changes, gap-closure, deploy]

requires:
  - phase: 46-transformers-environment-globals
    provides: "46-04 Device Detail dirty ticks, card save states and leave guard (console dac2c5e, d526ff7); 46-05 ship pattern, Legacy baseline hashes and pre-push probes"
provides:
  - "Device Detail saves keep the drafts they did not write: alias, description and environment saves keep unsaved ticks (note, enabled Save, leave guard); a transformer save keeps unsaved alias and description text (CR-01)"
  - "A failed device re-read after a stored write keeps the written values on screen and shows the page error; the list is read through the throwing devices/loadDevices (WR-05)"
  - "Unit harness draftHarness and checks K1..K6 that run the page's real loadDevice against a fake server and device store"
  - "Live on console.thinx.cloud as bundle 6d47a5f (pipeline 5672); API surface, Legacy console and port 7442 unchanged"
affects: [46-VERIFICATION re-run, 46-UAT, Phase 48 FIX-01 ledger]

actuals:
  tokens: 3759
  tasks: 3
  commits: 2
plan_head_before: d3b16349e93de6b33943fe09ba7a60223ec38198
plan_head_after: 6d47a5fb539df319b824ae7c9f258da7630179e1

tech-stack:
  added: []
  patterns:
    - "A save applies what it wrote to a shallow copy of this.device (Object.assign({}, this.device, ...)) before the re-read; the re-read keeps every editForm field that differs from the device on screen"
    - "Page reloads read the device list through the throwing devices/loadDevices; a rejected list read keeps the device on screen"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/transformers-enviros.cjs
    - services/console/vue/tests/unit/milestone-v116.cjs
    - .planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-REVIEW-DISPOSITION.md
    - services/console

key-decisions:
  - "Kept drafts are decided against the device still on screen (the copy carrying what the save wrote), not with a keep-list argument: loadDevice keeps its signature and no new method is added, so milestone-v116.cjs plain-context calls keep working"
  - "The environment save does not copy the sent environment into this.device: the list copy masks ssid and pass, so the card shows only that copy, also when the re-read fails"
  - "No rebase: origin/thinx-staging was still 656bb9eb at push time; the outgoing parent range is the seven 46 docs commits plus this plan's two"
  - "SUMMARY and close-out docs commits stay local and ride the next thinx-staging push (a docs-only push would start another API and Vue rollout)"

patterns-established:
  - "draftHarness: render the real page, assign fake store loaders that count reads, never replace the page's own reload; count list reads to prove the real reload ran"

requirements-completed: [POL-03]

coverage:
  - id: D1
    description: "Device Detail saves (alias, description, environment, transformers, Create & Assign) keep every unsaved draft they did not write; untouched fields follow the re-read; refused saves keep every draft and read nothing"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#K1 K2 K3 K5 K6 (LC_ALL=C and default locale)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A failed device re-read after a stored transformer or alias write shows the written values with the page error and no dirty note; the environment card keeps the masked list copy (WR-05)"
    requirement: POL-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/transformers-enviros.cjs#K4"
        status: pass
    human_judgment: false
  - id: D3
    description: "Console and parent pushed to thinx-staging in deploy order with signed in-scope ranges; pipeline 5672 ran test, api-registry and vue-console-registry with no snyk-* or console-classic-* job; origin main unchanged"
    requirement: POL-03
    verification:
      - kind: integration
        ref: "node scripts/check-ci-gates.js pipeline --revision 6d47a5fb --expect legacy-off --wait"
        status: pass
      - kind: other
        ref: "46-06-PLAN Task 2 verify 1, 2, 4"
        status: pass
    human_judgment: false
  - id: D4
    description: "console.thinx.cloud serves bundle 6d47a5f with the Phase 46 markers; unauthenticated env and profile routes unchanged; Legacy byte-identical to the 46-05 hashes; port 7442 200; WS-MULTITAB OK 2/2"
    requirement: POL-03
    verification:
      - kind: other
        ref: "46-06-PLAN Task 3 verify 1-4"
        status: pass
    human_judgment: false
  - id: D5
    description: "Operator CR-01 checks 13-14 on production Device Detail (tick, save alias / description / environment, tick and note survive; typed alias survives Save Transformers)"
    requirement: POL-03
    verification: []
    human_judgment: true
    rationale: "Needs a logged-in operator in production; the plan forbids logging in or editing devices from the executor"

duration: 25min
completed: 2026-10-13
---

# Phase 46 Plan 06: Device Detail Draft Fix (CR-01, WR-05) Summary

**On Device Detail, saving one card no longer wipes unsaved changes on the other cards. `loadDevice()` now keeps the alias, description and ticks that the triggering save did not write, and each save first applies what it wrote to a copy of the device. The device list is read through the throwing `devices/loadDevices`, so a failed re-read keeps the saved values on screen and shows the page error. Unit checks K1..K6 cover this and run the page's real `loadDevice`. The fix is live as bundle `6d47a5f` (pipeline 5672). The API surface, the Legacy console and port 7442 are unchanged.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-13T22:12:19Z
- **Completed:** 2026-10-13T22:37:00Z
- **Tasks:** 3
- **Files modified:** 4 plus the `services/console` gitlink

## Accomplishments

- CR-01 fixed. Saving the alias, the description or the environment keeps unsaved transformer ticks. The `Unsaved changes` note, the enabled Save Transformers button and the leave guard stay with them. Saving transformers keeps typed alias and description text.
- WR-05 fixed. When the re-read fails after a stored write, the screen still shows the written list and alias, with `Some device details could not be loaded. Refresh to retry.`. There is no dirty note and Save stays disabled, so the old list cannot be written back. The environment card shows only the masked list copy.
- The fix shipped through thinx-staging in deploy order (console, then the parent gitlink). The live proofs passed. The review disposition records CR-01 and WR-05 as fixed, with `open: 8`.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer, TDD RED) | expect device detail saves to keep unsaved drafts | console `f418ce5` (`test(vue)`, `G`) | vue/tests/unit/transformers-enviros.cjs, vue/tests/unit/milestone-v116.cjs |
| 1 (tracer, TDD GREEN) | keep unsaved device detail drafts across saves and a failed re-read | console `31bce2b` (`fix(vue)`, `G`) | vue/src/pages/Devices/DeviceDetail.vue |
| 2 | record CR-01 and WR-05 fixed in the review disposition | parent `59ef5271` (`docs(46-06)`, `G`) | 46-REVIEW-DISPOSITION.md |
| 2 | bump console to the device detail draft fix | parent `6d47a5fb` (`chore(46)`, `G`) | services/console |
| 3 | live proofs and UAT queue | none (read-only) | none |

## Task 1: RED evidence (before the fix, `f418ce5`)

`LC_ALL=C node tests/unit/transformers-enviros.cjs` exited 1. The only FAIL lines are these five K checks. K5 and
every other check passed, and milestone-v116.cjs passed:

```
FAIL K1 saving the alias or the description keeps unsaved ticks, the note, the leave guard and the other draft (the unsaved ticks are kept)
FAIL K2 saving transformers keeps the unsaved alias and description; the ticks become the stored list (the unsaved alias is kept)
FAIL K3 saving the environment keeps the unsaved ticks, the note and the alias and description drafts (the unsaved ticks are kept)
FAIL K4 a failed re-read after a stored write shows what was written, never the stale list or the sent environment (the device shows the saved list, not the stale one)
ok   K5 untouched fields follow the re-read; a refused save reads nothing and keeps every draft
FAIL K6 Create & Assign writes stored plus new, keeps the unsaved alias and restores the pending ticks plus the new one (the unsaved alias is kept)
```

Semantic assessment: each FAIL is a draft or display assertion of the planned behaviour. None comes from a missing
function or a load error. The harness gives the pre-fix page the non-throwing `fetchItems` with the store's behaviour,
so the old `loadDevice` ran to the end and reset the drafts. In K1 and K4, `calls.list` was 1, which proves the real
reload ran. The `tdd-red-evidence` classifier was not used: this suite prints its own `ok` / `FAIL` lines, not TAP or
JUnit, and the plan's own RED gate is the FAIL-line record above.

## Task 1: GREEN (`31bce2b`)

- `mapActions`: `loadDevices: 'devices/loadDevices'` replaces the devices-store `fetchItems` mapping. The store did not
  change.
- `loadDevice()`: a CR-01/WR-05 comment and the same four-way `Promise.allSettled` with `this.loadDevices()` first.
  After the await, it compares each field against `before` (the device on screen) to decide which drafts to keep:
  the alias if it differs, the description if it differs (`|| ''`), and the transformers if `transformersDirty`. If
  the list read was rejected and `before` exists, it keeps `before`. Otherwise it uses `getByUdid()(udid) || null`.
  It then writes only the fields it does not keep.
- `saveField`: sends a local `value`. On success it sets `this.device = Object.assign({}, this.device, { [field]: value })`
  before `Saved.` and the reload.
- `saveTransformers`: sends a local `sent` copy. On success it applies `transformers: [...sent]` to a device copy
  before `Transformers saved.` and the reload. The guard, the failure copy and `finally` did not change.
- `createTransformer`: applies `transformers: selected` to a device copy before the reload. The pending-tick restore
  is kept.
- `saveEnvironment`: unchanged. It does not copy the sent environment into the device.
- The template is byte-identical to `a16307a`. No new method, data field or computed property was added, and no store,
  Legacy or package change was made.

Verify 1: `LC_ALL=C` and the default locale both exit 0 with 0 FAIL lines (324 `ok` each across the suite), and K1..K6
are all `ok`. Verify 2 passed: the mapping is right, the template equals `a16307a`, the harness does not replace
`loadDevice`, all six K checks exist, milestone-v116.cjs has the `loadDevices` stub and there is no `src/` change.
Verify 3 passed: build complete, the reload error copy is in `dist/js/app.*.js`, `test:csp:dist` printed 3 PASS lines,
and `All performance budgets passed.`

Acceptance: `git -C services/console log -2 --format=%G?` shows `G G`. The GREEN subject is above the RED subject. The
console diff from `a16307a` is exactly `vue/src/pages/Devices/DeviceDetail.vue vue/tests/unit/milestone-v116.cjs
vue/tests/unit/transformers-enviros.cjs`.

**Tracer feedback gate:** auto mode off and `human_verify_mode` end-of-phase (default), with an automated-only verify.
All three verify commands were re-run after GREEN and passed, so the plan went on to Task 2.

## Task 2: Preflight (all before any push)

| Check | Result |
| ----- | ------ |
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc 0, 324 `ok`, 0 FAIL |
| `npm --prefix services/console/vue run test:unit` | rc 0, 324 `ok`, 0 FAIL |
| Vue production build (`--openssl-legacy-provider`) | Build complete |
| `test:csp:dist` | PASS (3 lines) |
| `perf:spotter` | All performance budgets passed (app 756.69 KiB gzip, app-legacy 762.89 KiB gzip, CSS 90.37 KiB gzip) |

## Task 2: Pre-push baselines (unauthenticated)

The Legacy baseline (`p46-legacy-baseline.sha256`, 7 lines from 46-05-SUMMARY.md) matched before the push, so
`shasum -a 256 -c` printed OK for all seven:

```
p46-legacy-main.js: OK
p46-legacy-LogviewController.js: OK
p46-legacy-EnviroController.js: OK
p46-legacy-TransformerController.js: OK
p46-legacy-enviro.html: OK
p46-legacy-transformer.html: OK
p46-legacy-thinx-api.js: OK
```

- Vue `/js/app.js` before: 3233326 bytes, build id `656bb9e` (2 occurrences).
- API (no credentials): PUT /api/v2/env rtm 403, console 403; GET /api/v2/env rtm 401, console 401;
  GET /api/user/env/list 401; POST /api/user/env/add (`{}`) 403; GET /api/user/profile 401.
- `http://rtm.thinx.cloud:7442/`: 200 (stored in `port7442-baseline`).
- `git ls-remote origin refs/heads/main`: `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` (unchanged after the push).

## Task 2: Range checks and pushes

**Verify 1 (console, before the push): rc=0.** There are 2 commits, both `G`. The changed paths are exactly
DeviceDetail.vue, milestone-v116.cjs and transformers-enviros.cjs, with no `src/` (Legacy) change.

```
31bce2b G fix(vue): keep unsaved device detail drafts across saves and a failed re-read (CR-01, WR-05)
f418ce5 G test(vue): expect device detail saves to keep unsaved drafts (CR-01, WR-05)
```

Console push: `a16307a..31bce2b  thinx-staging -> thinx-staging` (fast-forward, 22:19:27Z).

Gitlink bump: `git add services/console` only, `git diff --cached --name-only` = `services/console`;
`6d47a5fb G chore(46): bump console to the device detail draft fix (POL-03, CR-01, WR-05)`.

Sync: after `git fetch origin thinx-staging main`, origin/thinx-staging was still `656bb9eb` and an ancestor of HEAD.
No rebase was needed.

**Verify 2 (parent, before the push): rc=0.** All outgoing commits are `G` and there are 0 merges. Outside `.planning/`,
only the `services/console` gitlink changes, and it equals console origin/thinx-staging (`31bce2b`).

```
6d47a5fb G chore(46): bump console to the device detail draft fix (POL-03, CR-01, WR-05)
59ef5271 G docs(46-06): record CR-01 and WR-05 fixed in the review disposition
d3b16349 G docs(46): record gap-closure plan 46-06 in state
7064f23c G docs(46): create gap closure plan 46-06 (CR-01, WR-05)
b1facb8d G docs(phase-46): add verification report (gaps_found) and revert premature Complete requirements
b0d35629 G docs(46): record code review disposition
1885d882 G docs(46): add code review report
a6a71a8d G docs(46-05): complete ship transformers and env globals plan
70058cb0 G docs(46-05): add plan summary for the phase 46 ship
```

Parent push: `656bb9eb..6d47a5fb  thinx-staging -> thinx-staging` (fast-forward, **2026-10-13T22:20:00Z**). The push
did not touch main and did not use force.

**Verify 3 (pipeline): rc=0.**

```
pipeline 5672 8ed81429-6219-442c-a404-dfffd8599443 branch=thinx-staging revision=6d47a5f
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5672
```

**Verify 4 (after the push): rc=0.** Parent origin/thinx-staging = HEAD = `6d47a5fb`. Console origin/thinx-staging =
console HEAD = parent gitlink = `31bce2b`. `git log -1 --format='%G? %s' -- services/console` prints
`G chore(46): bump console to the device detail draft fix (POL-03, CR-01, WR-05)`. Its `git show --name-only` prints
only `services/console`.

Disposition acceptance: `open: 8`. CR-01 and WR-05 read `fixed (console 31bce2b)`. The WR-01..WR-04 and IN-01..IN-04
rows are unchanged (`open`). `git show --name-only 59ef5271` lists only 46-REVIEW-DISPOSITION.md.

## Task 3: Live proofs

Rollout timeline (unauthenticated polls about every 16 s from the push):

| UTC | Event |
| --- | ----- |
| 22:20:00 | parent push |
| 22:20:17 .. 22:25:51 | bundle still `656bb9e` (3233326 bytes); profile 401 throughout |
| 22:26:08 | profile **502** (API task restarting; restart observed), bundle still old |
| 22:26:25 | `/js/app.js` carries `6d47a5f` (3234786 bytes), about 6.4 min after the push; profile 502 |
| 22:26:42, 22:26:59 | profile 401, 401 -> ready |

**Verify 1 (API surface), 22:36:43Z: rc=0.** PUT /api/v2/env (`{}`, no credentials) returned **403** on rtm and
**403** on console. GET /api/v2/env returned **401** on rtm and **401** on console. GET /api/user/env/list returned
**401**, POST /api/user/env/add (`{}`) **403** and GET /api/user/profile **401**. These match the pre-push answers.

**Verify 2 (bundle): rc=0.** `/js/app.js` is 3234786 bytes, and id `6d47a5f` appears twice. All eight Phase 46 markers
are present (counts before -> after: `transformers-dirty` 1 -> 1,
`Could not save the transformers. Try again.` 1 -> 1, `Transformers saved.` 2 -> 2,
`Some device details could not be loaded. Refresh to retry.` 1 -> 1, `Leave without saving` 1 -> 1,
`transformer-delete-modal` 4 -> 4, `enviro-edit-modal` 4 -> 4, `Back to Transformers` 1 -> 1). The two replaced strings
are absent (`Failed to save transformers.` 0, `Transformer alias is required.` 0). An extra check shows the fix in
the served code: `devices/loadDevices` went 1 -> 2 and `devices/fetchItems` 3 -> 2 (one mapping moved).

**Verify 3 (Legacy byte identity): rc=0.**

```
p46-legacy-main.js: OK
p46-legacy-LogviewController.js: OK
p46-legacy-EnviroController.js: OK
p46-legacy-TransformerController.js: OK
p46-legacy-enviro.html: OK
p46-legacy-transformer.html: OK
p46-legacy-thinx-api.js: OK
```

**Verify 4 (port 7442 and WebSocket), 22:36:49Z: rc=0.** `http://rtm.thinx.cloud:7442/` returned 200 (baseline 200).
`WS-MULTITAB OK 2/2 opened` on the first try. Both sockets opened and closed with 1008 because there were no
credentials, which is expected.

## Pending end-of-phase UAT (operator)

46-05's items 1-12 (46-05-SUMMARY.md, "Pending end-of-phase UAT") are still pending. This plan adds:

Operator, logged in to https://console.thinx.cloud. Open pages from the sidebar: reloading a deep link still lands on
the dashboard until Phase 48. Use a test device whose alias and description you can change, and restore them and the
ticks at the end:

13. CR-01, alias and description: on Device Detail, tick a transformer. "Unsaved changes" appears next to the card
    title. Change the Alias and press its Save. "Saved." shows, the tick and the "Unsaved changes" note are still there
    and Save Transformers is still enabled. Click Manage Transformers: the "Unsaved Changes" dialog asks. Repeat with
    the Description and its Save.
14. CR-01, environment and the reverse direction: with a ticked transformer unsaved, open Environment, Edit, Save.
    "Environment saved." shows, and the tick and the note are still there. Then type a new Alias without saving it,
    tick a transformer and press Save Transformers. "Transformers saved." shows in the card, and the typed Alias is
    still in the field, unsaved.
15. WR-05 cannot be reproduced by the operator. The device list read and the device write share `/api/v2/device`, so
    DevTools cannot block one without the other. Unit check K4 covers it.

UAT item 1 hint for this deploy: the API restart was seen from outside (502 at 22:26:08-22:26:25Z, after the
22:20:00Z push), so the `thinx_api` task in Swarmpit should have started at about 22:26Z.

## Files Created/Modified

- `services/console/vue/src/pages/Devices/DeviceDetail.vue`: `loadDevice` keeps drafts. Saves apply what they wrote to
  a device copy. The device list is read through `devices/loadDevices`.
- `services/console/vue/tests/unit/transformers-enviros.cjs`: `draftHarness` and checks K1..K6.
- `services/console/vue/tests/unit/milestone-v116.cjs`: `renderDeviceDetail` stubs `loadDevices`.
- `.planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-REVIEW-DISPOSITION.md`: CR-01 and
  WR-05 fixed, `open: 8`.
- `services/console`: the gitlink moves to `31bce2b`.

## Decisions Made

- Drafts are kept by comparing each field with the device on screen, which by then carries what the save wrote.
  The other option was a `keep` list argument to `loadDevice` (the review's sketch). The comparison keeps
  `loadDevice()` without arguments, adds no method and covers Create & Assign without special cases.
- The environment save stays as it was. Copying the sent environment would show the real `ssid` / `pass` in the
  card, which shows only the masked list copy.
- There was no rebase (origin/thinx-staging had not moved). The SUMMARY and the close-out docs commits stay local and
  ride the next thinx-staging push.

## Deviations from Plan

None. The plan ran as written. Small notes:
- The harness also returns the `confirm` recorder (`{ vm, calls, control, server, store, confirm }`), which K1 uses
  for the leave-guard assertion. The plan's list did not name it.
- K4's environment case writes `{}` (the page stub's `parseEnvironmentJSON` always returns `{}`), and the check asserts
  that the masked `{ ssid: '*****' }` stays. That case also passes before the fix, because the pre-fix fallback is a
  stale copy that holds the same masked value. K4's RED failure comes from its transformer case.

## Issues Encountered

None. A background `tail -f` wait on the watcher log outlived the watcher. It is harmless and ends at its 20-minute
`timeout`.

## Threat surface

No new surface. The changes are in one page script and the unit tests. The threat register's mitigations are in place:
T-46-29 (K1, K2, K3, K6), T-46-30 (K4 and the throwing loader), T-46-31 (no environment copy, K4 env case), T-46-32
(`Object.assign({}, this.device, …)` copies) and T-46-33/34/35 (signed in-scope ranges, preflight, pipeline proof,
probes with no credentials).
The probes were unauthenticated GETs, one PUT and one POST per the plan with no credentials, and the WebSocket probe
with no credentials. Only status codes were recorded. Nothing used ssh or docker, nothing logged in, and no production
data was written.

## User Setup Required

None. There is no external service configuration.

## Next Phase Readiness

- The fix is deployed. Next, the operator re-runs the Phase 46 verification (`/gsd-verify-work 46 --ws vue-console`) so
  TRANS-03, TRANS-04, ENV-01 and FIX-03 leave `Gaps Found`, then does the end-of-phase UAT (items 1-15).
- These findings are still open and outside this plan: WR-01 and WR-03 (operator decisions requested in
  46-VERIFICATION.md), WR-02, WR-04 and IN-01..IN-04.
- The Phase 48 FIX-01 ledger can cite console `31bce2b` for 46 CR-01 and WR-05.

---
*Phase: 46-transformers-environment-globals*
*Completed: 2026-10-13*

## Self-Check: PASSED

- FOUND (console, ancestors of HEAD and on origin/thinx-staging): f418ce5, 31bce2b
- FOUND (parent, ancestors of HEAD and on origin/thinx-staging): 59ef5271, 6d47a5fb
- FOUND: services/console/vue/src/pages/Devices/DeviceDetail.vue, services/console/vue/tests/unit/transformers-enviros.cjs, services/console/vue/tests/unit/milestone-v116.cjs, 46-REVIEW-DISPOSITION.md
- Plan-level verification: unit green in both locales including K1..K6; template equal to a16307a; build, csp and perf passed; disposition `open: 8`; CI-GATES PIPELINE OK 5672; live checks rc 0; origin main unchanged
