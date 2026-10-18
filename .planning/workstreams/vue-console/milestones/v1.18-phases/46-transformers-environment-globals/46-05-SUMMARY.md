---
phase: 46-transformers-environment-globals
plan: 05
subsystem: deploy
status: complete
tags: [deploy, api, console, vue, verification, uat]

requires:
  - phase: 46-transformers-environment-globals
    provides: "46-01 exact-key env overwrite (lib/thinx/apienv.js + ApienvExactKeySpec); 46-02..46-04 console commits 29727e8..a16307a (transformers typed-confirm delete, environment edit value, Device Detail unsaved ticks)"
provides:
  - "Production API (thinx_api from pipeline 5671) carries the D-02 exact-key environment overwrite; unauthenticated env surface unchanged (PUT 403, GET 401, list 401, add 403)"
  - "console.thinx.cloud serves bundle 656bb9e with every Phase 46 marker and none of the five replaced strings"
  - "Legacy console on rtm.thinx.cloud byte-identical before and after (7 files, shasum -c OK)"
affects: [46-UAT, Phase 48 FIX-01 ledger, Phase 48 CI-06]

actuals:
  tokens: 65
  tasks: 2
  commits: 1
plan_head_before: 9a775bb4ae46988732f9e36f7e5911b28387a7bf
plan_head_after: 656bb9ebf8c5b2dcb5bb90ed6108730b2b18878f

tech-stack:
  added: []
  patterns:
    - "Rollout watcher waits for the bundle id AND two consecutive 401s on /api/user/profile after an observed non-401 (502 for ~45 s this time)"

key-files:
  created: []
  modified:
    - services/console

key-decisions:
  - "No rebase needed: origin/thinx-staging was still 17d63319 at push time, so the outgoing range is exactly the 19 Phase 46 commits"
  - "SUMMARY and close-out docs stay local; they ride the next thinx-staging push (a docs-only push would start another API and Vue rollout)"

patterns-established: []

requirements-completed: [TRANS-03, TRANS-04, ENV-01, POL-03, FIX-03]

coverage:
  - id: D1
    description: "Console and parent thinx-staging pushed in deploy order with signed, in-scope ranges; gitlink equals the pushed console commit; origin main unchanged"
    requirement: TRANS-04
    verification:
      - kind: other
        ref: "46-05-PLAN Task 1 verify 1, verify 2, verify 4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Push pipeline 5671 ran test (incl. ApienvExactKeySpec), api-registry and vue-console-registry to success with no snyk-* or console-classic-* job"
    requirement: ENV-01
    verification:
      - kind: integration
        ref: "node scripts/check-ci-gates.js pipeline --revision 656bb9eb --expect legacy-off --wait"
        status: pass
    human_judgment: false
  - id: D3
    description: "console.thinx.cloud serves bundle 656bb9e with every Phase 46 marker and none of the replaced strings; unauthenticated env routes unchanged; Legacy byte-identical; port 7442 unchanged; WS-MULTITAB 2/2"
    requirement: TRANS-03
    verification:
      - kind: other
        ref: "46-05-PLAN Task 2 verify 1-4"
        status: pass
    human_judgment: false
  - id: D4
    description: "Interactive Phase 46 criteria 1-5 (typed-confirm delete, Device Detail leave guard and Saving state, P46_WIFI / P46_WIFI_SSID exact-key edit, failed edit, layout backstops E1/E3/E6/E7, Legacy environment page)"
    requirement: POL-03
    verification: []
    human_judgment: true
    rationale: "Needs a logged-in operator in production; the plan forbids logging in or writing transformers or variables from the executor, and the D-02 API fix has no unauthenticated signal"

duration: 12min
completed: 2026-10-13
---

# Phase 46 Plan 05: Ship Transformers & Environment Globals Summary

**Phase 46 is live. Console `thinx-staging` went out as `316c5f9..a16307a` (20 signed commits) and parent `thinx-staging` as `17d63319..656bb9eb` (19 signed commits ending in the gitlink bump). Push pipeline 5671 ran test (with ApienvExactKeySpec), api-registry and vue-console-registry, and no Snyk or console-classic job. console.thinx.cloud serves bundle `656bb9e` with every Phase 46 marker. The API restarted (502 for about 45 s) and answers its unauthenticated env routes as before. The Legacy console is byte-identical.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-13T21:25:45Z
- **Completed:** 2026-10-13T21:37:50Z
- **Tasks:** 2
- **Files modified:** 1 (`services/console` gitlink)

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Ship console and parent to thinx-staging, prove the pipeline job list | `656bb9eb` (gitlink bump, signed `G`) | services/console |
| 2 | Prove deployed Vue pages, API surface and untouched Legacy; queue the operator UAT | none (read-only) | none |

## Task 1: Preflight (all before any push)

| Check | Result |
| ----- | ------ |
| `npx jasmine` ApienvExactKeySpec + CsrfRouteInventorySpec | 89 specs, 0 failures |
| `npx eslint lib/thinx/apienv.js spec/jasmine/ApienvExactKeySpec.js` | clean (rc 0) |
| `node scripts/check-ci-gates.js compile` | CI-GATES COMPILE OK |
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc 0, 318 `ok`, 0 FAIL |
| `npm --prefix services/console/vue run test:unit` | rc 0, 318 `ok`, 0 FAIL |
| Vue production build (`--openssl-legacy-provider`) | Build complete |
| `test:csp:dist` | PASS (3 lines) |
| `perf:spotter` | All performance budgets passed (app 755.53 KiB gzip, app-legacy 762.56 KiB gzip, CSS 90.37 KiB gzip, 6 initial assets) |

## Task 1: Pre-deploy baselines (unauthenticated)

Legacy (`p46-legacy-baseline.sha256`; sizes match the planner's record: main.js 28878, LogviewController.js 12538,
EnviroController.js 4391, TransformerController.js 4727, enviro.html 7650, transformer.html 10169, thinx-api.js 38894):

```
819c133e9111a55fa7037df16b3f502c93f1816ce8064b756db3a9a8e31c7c16  p46-legacy-main.js
e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d  p46-legacy-LogviewController.js
766b6d158a1de956406195d163abbc7b48cf0c74a622e528c5f7c0427f310446  p46-legacy-EnviroController.js
e55ff51efe41982c136fc375f7431f548ea35dd3eae338ce02740df92d7bdc26  p46-legacy-TransformerController.js
1db9c98ec235a6afa0a014fb48f2bba10cddd2234ff2be3c4aa7a476d2b035d4  p46-legacy-enviro.html
a1775a5b6611ce2ee273a594b6d143ad197e5d5530c942a82f9c4e27125c917c  p46-legacy-transformer.html
a1dc81747c119dd8e8b07b1b95a6f92a35cc46d3f3e249d1d719acfbd8871b69  p46-legacy-thinx-api.js
```

- Vue `/js/app.js` before: 3187514 bytes, build id `17d6331` (2 occurrences). Phase 46 markers all 0
  (`transformer-delete-modal`, `enviro-edit-modal`, `Leave without saving` and the other eleven). Replaced strings by
  `grep -o`: `Delete this transformer?` 1, `Failed to add environment variable.` 1, `Failed to save transformers.` 1,
  `A transformer with this alias already exists.` 1, `Transformer alias is required.` 2.
- API (no credentials): PUT /api/v2/env rtm 403, console 403; GET /api/v2/env rtm 401, console 401;
  GET /api/user/env/list 401; POST /api/user/env/add (`{}`) 403; GET /api/user/profile 401.
- `http://rtm.thinx.cloud:7442/`: 200 (stored in `p46-port7442-baseline`).
- `git ls-remote origin refs/heads/main`: `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf`.

## Task 1: Range checks and pushes

**Verify 1 (console, before the push): rc=0.** 20 commits, all `G`. The changed paths are exactly the sixteen Phase 46
Vue paths, with no `src/` (Legacy) change.

```
a16307a G test(vue): name the theme source and assert transformers saved in cypress (37 IN-03)
8c354de G feat(vue): transformer editor says name, keeps the shared leave guard (D-14)
75624ce G test(vue): expect the transformer editor name copy (D-14)
d526ff7 G feat(vue): saving and unsaved states on the transformer card (POL-03, D-09, D-11)
1a604bf G test(vue): expect the transformer card dirty, saving and result states (POL-03, D-11)
dac2c5e G feat(vue): warn before leaving unsaved transformer ticks (37 IN-02, D-09, D-10)
25c20d4 G test(vue): add failing unsaved transformer leave checks (37 IN-02, D-10)
f2d26f8 G feat(vue): add variable without silent overwrite, environment styles (ENV-01, UI-T24)
cbe7076 G test(vue): expect environment add copy, duplicate refusal and styles (UI-T24)
11b8552 G feat(vue): guarded environment bulk delete and one load error (D-16)
3e8ab8d G test(vue): expect the guarded environment bulk delete and load states (D-16)
aef5a22 G fix(vue): keep a stored environment write a success when the list refresh fails
8b26ad6 G feat(vue): edit an environment variable value in place (ENV-01, D-01, D-03, D-04)
8e898de G test(vue): add failing environment edit checks (ENV-01, D-03)
c31a9c5 G feat(vue): plus and white wrench on transformers, name copy, shared styles (TRANS-03, D-14)
32533dc G test(vue): expect transformer add and create copy and the phase 46 styles (TRANS-03, D-14)
94ba8ef G feat(vue): bulk transformer delete with the device usage warning (TRANS-04, D-06, D-08)
64d69bd G test(vue): expect transformer bulk delete, usage warning and load states (TRANS-04, POL-03)
ed429ec G feat(vue): transformer row icons and typed-confirm delete (TRANS-04, D-05, D-07)
29727e8 G test(vue): add failing transformer typed-confirm delete checks (TRANS-04)
```

Console push: `316c5f9..a16307a  thinx-staging -> thinx-staging` (fast-forward, 21:28:19Z).

Gitlink bump: `git add services/console` only, `git diff --cached --name-only` = `services/console`;
`656bb9eb G chore(46): bump console to transformers and env globals (TRANS-03/04, ENV-01, POL-03, FIX-03)`.

Sync: after `git fetch origin thinx-staging main`, origin/thinx-staging was still `17d63319` and an ancestor of HEAD.
No rebase was needed, so the compile and spec preflight did not have to be rerun.

**Verify 2 (parent, before the push): rc=0.** 19 outgoing commits, all `G`, 0 merges. Outside `.planning/` the push
changes only `lib/thinx/apienv.js`, `services/console` and `spec/jasmine/ApienvExactKeySpec.js`. The gitlink equals
console origin/thinx-staging (`a16307ab`).

```
656bb9eb G chore(46): bump console to transformers and env globals (TRANS-03/04, ENV-01, POL-03, FIX-03)
9a775bb4 G docs(46-04): complete device detail unsaved transformer ticks plan
172efe75 G docs(46-04): record 37 IN-02 and IN-03 fixed and 35 IN-02 for the FIX-01 ledger
53308933 G docs(46-03): complete environment edit value plan
74506798 G docs(46-03): add plan summary for the environment edit value
584b25eb G docs(46-02): complete transformers typed-confirm delete plan
44a2a796 G docs(46-02): add plan summary for the transformers typed-confirm delete
9c8644f8 G docs(46-01): complete exact-key env overwrite plan
e8dfffb9 G docs(46-01): add plan summary for the exact-key env overwrite
ab25315e G docs(46-01): record the ENV-01 atomic overwrite and the D-02 API change
352a8965 G fix(46-01): replace only the exact environment key on overwrite (D-02, ENV-01)
cc4b5659 G test(46-01): add failing exact-key env overwrite checks (D-02)
fc34df9b G docs(46): planning complete, plan check passed
ae3f8989 G docs(46): create phase plan
30035992 G docs(46): UI-SPEC approved (5 PASS, 2 FLAG)
d24e7de5 G docs(46): UI design contract
75b9265d G docs(46): state after discussion
a3dfdd74 G docs(46): capture phase context
1d8a2d6c G docs(45): complete phase 45, transition to phase 46
```

Parent push: `17d63319..656bb9eb  thinx-staging -> thinx-staging` (fast-forward, **2026-10-13T21:29:03Z**). It did not
touch main and did not force.

**Verify 3 (pipeline): rc=0.**

```
pipeline 5671 3b904fa5-04fd-4059-bff8-b91b9264b526 branch=thinx-staging revision=656bb9e
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5671
```

**Verify 4 (after the push): rc=0.** Parent origin/thinx-staging = HEAD = `656bb9eb`. Console origin/thinx-staging =
console HEAD = parent gitlink = `a16307ab`. `git log -1 --format='%G? %s' -- services/console` prints
`G chore(46): bump console to transformers and env globals (TRANS-03/04, ENV-01, POL-03, FIX-03)`.
`git show --name-only` of that commit prints only `services/console`. Origin main is still `14c08c1f`, also after
Task 2.

**Tracer feedback gate:** interactive mode, `human_verify_mode` end-of-phase (default), automated-only verify. Verifies
3 and 4 were re-run after the push and passed. Verify 1 is a pre-push check by design: its `test -n` fails once the
range is empty. Task 2 proceeded.

## Task 2: Live proofs

Rollout timeline (unauthenticated polls every ~15 s from the push):

| UTC | Event |
| --- | ----- |
| 21:29:03 | parent push |
| 21:29:24 .. 21:35:06 | bundle still `17d6331` (3187514 bytes); profile 401 throughout |
| 21:35:22 | bundle fetch failed (one poll, console task switching) |
| 21:35:37 | `/js/app.js` carries `656bb9e` (3233326 bytes), ~6.6 min after the push |
| 21:36:10, 21:36:25, 21:36:40 | `/api/user/profile` **502** (API task restarting; restart observed) |
| 21:36:55, 21:37:10 | profile 401, 401 -> ready |

**Verify 1 (API surface), 21:37:22Z: rc=0.**
- PUT /api/v2/env (`{}`, no credentials): rtm.thinx.cloud **403**, console.thinx.cloud **403**
- GET /api/v2/env: rtm **401**, console **401**
- GET /api/user/env/list: **401**; POST /api/user/env/add (`{}`): **403**; GET /api/user/profile: **401**

These are the same answers as before the deploy.

**Verify 2 (bundle): rc=0.** `/js/app.js`, 3233326 bytes, id `656bb9e` found (2 occurrences).
Present (count by `grep -o`; before -> after):

| Marker | Before | After |
| ------ | ------ | ----- |
| `transformer-delete-modal` | 0 | 4 |
| `transformer-bulk-delete` | 0 | 1 |
| `Devices using these transformers will stop applying them.` | 0 | 1 |
| `Create Transformer` | 0 | 1 |
| `enviro-edit-modal` | 0 | 4 |
| `enviro-bulk-delete` | 0 | 1 |
| `Keep current value` | 0 | 1 |
| `Value saved` | 0 | 1 |
| `Could not load environment variables. Refresh to retry.` | 0 | 1 |
| `A variable with this key already exists. Use Edit value to change it.` | 0 | 1 |
| `Leave without saving` | 0 | 1 |
| `transformers-dirty` | 0 | 1 |
| `Could not save the transformers. Try again.` | 0 | 1 |
| `Back to Transformers` | 0 | 1 |

Replaced strings, now absent: `Delete this transformer?` (1 -> 0), `Failed to add environment variable.` (1 -> 0),
`Failed to save transformers.` (1 -> 0), `A transformer with this alias already exists.` (1 -> 0),
`Transformer alias is required.` (2 -> 0).

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

**Verify 4 (port 7442 and WebSocket), 21:37:42Z: rc=0.** `http://rtm.thinx.cloud:7442/` 200 (baseline 200).
`WS-MULTITAB OK 2/2 opened` on the first try (both sockets opened, closed 1008 for lack of credentials as designed).

## Pending end-of-phase UAT (operator, human checks 1-12, unchanged from the plan)

Operator, logged in to https://console.thinx.cloud (open every page from the sidebar; reloading a deep link still lands on the dashboard until Phase 48). Use throwaway transformers named "P46 …" and variables named `P46_…`, never your real WIFI variables, and remove them at the end:

1. Rollout: Swarmpit (https://swarmpit.thinx.cloud/#/tasks) shows a `thinx_api` task started after the push time in the SUMMARY, so the exact-key fix is live before items 7-9.
2. Transformers page (criterion 1, TRANS-03, D-13, D-14): Add Transformer shows a `+`; each row shows Edit with a white wrench and Delete with a trash, with text from 992 px wide and icons only below, and hovering an icon shows its text; the column header and the Add dialog field read "Name"; the transformer editor's field reads "Name" and its buttons "Save Transformer" and "Back to Transformers".
3. Typed confirm, several (criterion 2, TRANS-04, D-05..D-08): create "P46 A", "P46 B" and "P46 C". Tick A and C and press "Delete selected (2)": the dialog lists both names and a usage sentence; "Delete transformers" stays disabled with the field empty, with `Confirm` and with `confirm.`, and pressing Enter with `Confirm` does nothing; "Keep transformers" closes it and nothing is deleted; reopening shows an empty field. Type `confirm`, press Delete transformers: "Deleting…", then both rows go. Leave the page and reopen it from the sidebar: only "P46 B" remains of the three.
4. Typed confirm, one row: the trash on "P46 B" opens the same dialog naming it; it also needs `confirm`. Optional usage count (D-06): first tick "P46 B" on one device's Transformer Assignment card and save; the row delete then says "1 device will stop applying it."; after deleting, that device's card lists "(missing) <utid>", which you untick and save.
5. Device Detail (criterion 3, POL-03, D-09..D-11, 37 IN-02): tick a transformer: "Unsaved changes" appears next to the card title and Save Transformers becomes enabled. Click Manage Transformers: the "Unsaved Changes" dialog opens with "Keep editing" focused; press Enter and you stay. Click Manage Transformers again and choose "Leave without saving": the Transformers page opens. The sidebar and the breadcrumb ask the same way. Back on the device, tick and press Save Transformers: a spinner with "Saving…", then "Transformers saved." inside the card, the note disappears and Save is disabled again. In the editor, change the name and press Back to Transformers: the same dialog asks.
6. Device Detail failure: block `*api/v2/device*` in DevTools Network, tick a box and Save Transformers: "Could not save the transformers. Try again." inside the card, the tick and the note stay. Unblock and untick to restore.
7. Exact-key edit (criterion 4, ENV-01, D-01..D-04): Add Variable `P46_WIFI` = `one` and `P46_WIFI_SSID` = `two`. Press Edit value on `P46_WIFI`: the dialog is titled "Change value of P46_WIFI", the field is empty with the line "The current value is never shown. The new value replaces it when you save.", and Save value is disabled while empty. Type `three` and Save value: toast "Value saved", and both `P46_WIFI` and `P46_WIFI_SSID` are still listed (before this phase the edit deleted `P46_WIFI_SSID`). The Legacy console's Environment page on https://rtm.thinx.cloud/ lists both as well.
8. Edit failure (criterion 4): open Edit value on `P46_WIFI`, block `*api/v2/env*` in DevTools Network, type a value and Save value: the dialog stays open with "Could not save the new value. P46_WIFI keeps its current value. Try again." (the list behind it shows the load error while blocked). Unblock, press Keep current value, leave and reopen the page: `P46_WIFI` is still listed.
9. Add and delete variables (UI-T24, D-16): Add Variable with key `P46_WIFI` again is refused with "A variable with this key already exists. Use Edit value to change it." and nothing is sent. Select both P46 variables, "Delete selected (2)": the confirmation names both with "Keep variables" focused; confirm: both go.
10. Layout (UI-SPEC backstops E1/E6 overflow, E3, E7): at 375, 768, 1024 and 1280 px wide, Transformers and Environment Globals rows stay one line, Actions stay one row, the page never scrolls sideways (any scroll is inside the table box). A transformer named with 200 characters and no spaces wraps inside its delete dialog; a variable key of 120 characters wraps in the edit dialog title and Key line, and a 2000-character value saves with one request. Optional: with 30 throwaway transformers selected, the names list scrolls inside its box and the field and Delete button stay visible at 768 px height.
11. Phase 37 records (criterion 5, FIX-03): `.planning/milestones/v1.16-phases/37-transformer-parity/37-REVIEW-DISPOSITION.md` shows IN-02 and IN-03 fixed with console commits; the Cypress spec change runs with Phase 48 CI-07.
12. Legacy console on https://rtm.thinx.cloud/: the Environment page lists, adds and revokes a throwaway variable, and the Transformers page loads. Run the console-retest project skill against https://rtm.thinx.cloud/.

UAT item 1 hint: the API restart was observed from outside (502 at 21:36:10–21:36:40Z, after the 21:29:03Z push), so
the `thinx_api` task in Swarmpit should have started at about 21:36Z.

## Decisions Made

- No rebase: origin/thinx-staging had not moved (`17d63319`), so the outgoing set is exactly the 19 Phase 46 commits.
- The SUMMARY and close-out docs commits stay local and ride the next thinx-staging push. A docs-only push would start
  another API and Vue rollout.

## Deviations from Plan

None. The plan ran as written. One cosmetic note: the rollout watcher script (scratchpad, not in the repo) printed a
harmless `head: illegal line count -- 0` line on each "bundle not yet" poll from an unused id probe. It had no effect
on the readiness logic.

## Issues Encountered

None. The bundle fetch failed once at 21:35:22Z while the console task switched over. The next poll succeeded.

## Follow-up candidates

- **T-46-06** (pre-existing, outside D-02): an environment write whose Redis `set` fails is still answered as success.
  Candidate for a later API fix.

## Threat surface

No new surface. The probes were unauthenticated GETs, one credential-free PUT and POST per the plan, and the
credential-free WebSocket probe. Only status codes were recorded. The plan did not ssh, run docker commands, log in or
change any production data.

## Next Phase Readiness

- Phase 46 is deployed. The operator UAT (items 1-12 above) is the remaining gate, through `/gsd-verify-work 46`.
- The Phase 48 FIX-01 ledger can cite console `ed429ec` (35 IN-02), `dac2c5e` / `d526ff7` (37 IN-02) and `a16307a`
  (37 IN-03).

---
*Phase: 46-transformers-environment-globals*
*Completed: 2026-10-13*

## Self-Check: PASSED

- FOUND (parent ancestor of HEAD, on origin/thinx-staging): 656bb9eb
- FOUND (console ancestors of HEAD, on origin/thinx-staging): 29727e8 .. a16307a
- Plan-level verification: preflight green, both range checks passed before their pushes, CI-GATES PIPELINE OK 5671, live checks rc 0, origin thinx-staging equals local HEADs, origin main unchanged
