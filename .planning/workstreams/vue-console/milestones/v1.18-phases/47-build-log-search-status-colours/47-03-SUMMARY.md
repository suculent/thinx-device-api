---
phase: 47-build-log-search-status-colours
plan: 03
subsystem: infra
tags: [deploy, console, vue, verification, uat, circleci, swarmpit]

requires:
  - phase: 47-01
    provides: "Build log search (BuildLogDialog, buildLogSearch, _build-log.scss) on console 002e051"
  - phase: 47-02
    provides: "Build lists, status mapping, Phase 36 review fixes on console 591033e"
provides:
  - "Console origin/thinx-staging 31bce2b -> 591033e (12 signed Phase 47 commits)"
  - "Signed parent gitlink bump ab378790 pushed to thinx-staging (6d47a5fb..ab378790)"
  - "Pipeline 5673 legacy-off proof: test, api-registry, vue-console-registry success, no snyk-* or console-classic-* job"
  - "console.thinx.cloud serves bundle id ab37879 with every Phase 47 marker and none of the replaced strings"
  - "Legacy console byte-identical before and after (7 files, shasum -c OK)"
affects: [47-verification, 47-uat, 48]

actuals:
  tokens: 65
  tasks: 2
  commits: 1
plan_head_before: f195fa11073c1bdb559869032546e4aeb0f00dbe
plan_head_after: ab3787907d1bcfe524f5a9fb80201d5839928297

tech-stack:
  added: []
  patterns:
    - "Read-only rollout poller started at push time so the API restart window (502) is observed rather than missed"

key-files:
  created: []
  modified:
    - services/console

key-decisions:
  - "Shipped without a rebase: origin/thinx-staging was still 6d47a5fb at the push (no other workstream had pushed)"
  - "The rollout poller started during the pipeline wait (plan: poll every 15 s from the push); the live checks ran only after the bundle id appeared and the profile route answered 401 twice"
  - "SUMMARY and close-out docs commits stay local; they ride the next thinx-staging push (a docs-only push would start another API and Vue rollout)"

patterns-established: []

requirements-completed: [BUILD-03, POL-02, FIX-02]

coverage:
  - id: D1
    description: "Console and parent thinx-staging pushed in deploy order with signed, in-scope ranges and refs in agreement"
    requirement: BUILD-03
    verification:
      - kind: other
        ref: "47-03 Task 1 verify 1 (console range), verify 2 (parent range), verify 4 (refs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CircleCI pipeline 5673 for ab378790 ran test, api-registry, vue-console-registry to success with no Snyk or legacy console job"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "node scripts/check-ci-gates.js pipeline --revision ab378790 --expect legacy-off --wait -> CI-GATES PIPELINE OK 5673"
        status: pass
    human_judgment: false
  - id: D3
    description: "console.thinx.cloud serves the Phase 47 bundle (id ab37879, all 12 markers, 0 replaced strings); API unauthenticated surface unchanged; port 7442 200; WS-MULTITAB 2/2"
    requirement: POL-02
    verification:
      - kind: other
        ref: "47-03 Task 2 verify 1, verify 2, verify 4"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy console on rtm.thinx.cloud byte-identical before and after the deploy (CI-05 still in effect)"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "shasum -a 256 -c p47-legacy-baseline.sha256 (7 OK)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Interactive production behaviour: search with wrap and scroll, inert HTML, status colours on four lists, dashboard View, Device Build History, layout backstops, records, Legacy retest"
    requirement: BUILD-03
    verification: []
    human_judgment: true
    rationale: "Needs a logged-in operator in a browser (visual layout, scrolling, colours, real build logs); the executor must not log in to production"

duration: 13min
completed: 2026-10-15
status: complete
---

# Phase 47 Plan 03: Ship and Live-Verify Build Log Search & Status Colours Summary

**Console 591033e and parent gitlink ab378790 are live on thinx-staging. Pipeline 5673 ran legacy-off (test, api-registry and vue-console-registry, with no Snyk job). console.thinx.cloud serves bundle ab37879 with the build-log search and the new build lists. The API went through a 34 s restart and came back answering 401, and the Legacy console is byte-identical.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-15T09:24:22Z
- **Completed:** 2026-10-15T09:36:31Z
- **Tasks:** 2
- **Files modified:** 1 (`services/console` gitlink)

## Accomplishments

- Local preflight green before any push: compile gate, console `test:unit` in both locales, the Vue production build, `test:csp:dist` and `perf:spotter`.
- Console `thinx-staging` fast-forwarded `31bce2b..591033e` (12 signed commits, only the fourteen Phase 47 Vue paths changed, no Legacy `src/` change).
- Signed gitlink bump `ab378790` pushed to parent `thinx-staging` (`6d47a5fb..ab378790`, 19 commits, all `G`, no merges, outside `.planning/` only `services/console`). origin `main` is still `14c08c1f`.
- Pipeline 5673 proof `CI-GATES PIPELINE OK 5673`.
- Production now serves the Phase 47 Vue bundle. The unauthenticated API surface, port 7442 and the WebSocket probe behave as before the deploy, and the seven Legacy files are unchanged.

## Task 1: Ship and pipeline proof

### Preflight (before any push)

| Check | Result |
|---|---|
| `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK` (false/thinx-staging: test, vue-console-registry, api-registry) |
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc 0, 0 failing checks (the only `FAIL` substring is N4's "…FAILED are … danger" test name, which passes) |
| `npm --prefix services/console/vue run test:unit` | rc 0, 0 failing checks (same note) |
| `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build` | `Build complete.` (Hash 1042a874ff90ad2e) |
| `npm --prefix services/console/vue run test:csp:dist` | rc 0: no inline JavaScript in public/ and dist/index.html, enforced script policy |
| `npm --prefix services/console/vue run perf:spotter` | `All performance budgets passed.` (js/app 1.31 MiB raw / 756.93 KiB gzip) |

### Baselines (2026-10-15T09:26Z, unauthenticated, read-only)

Legacy baseline (`${TMPDIR}/p47-legacy-baseline.sha256`, absolute names; sizes match the planner's record):

```
819c133e9111a55fa7037df16b3f502c93f1816ce8064b756db3a9a8e31c7c16  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-main.js
e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-LogviewController.js
03f82de38e2db3fdfc5d1fd392b26f2b2c4ffa5881c729eec91b64dce2039f70  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-HistoryController.js
1d5239823feb22068f93a3700a5d6f6d5d013cef432f8890ac175fda4b190865  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-DashboardController.js
c0a65c6e3ef8db4ab87ac18c0b03844f80c14d4c12e72f5ecfb7cf17465fa5fd  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-history.html
46ccab5a7f6bdbb2a4b3a42dd737e4986238f0de76832ea2c5ac6aabc6f67f7c  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-dashboard.html
a1dc81747c119dd8e8b07b1b95a6f92a35cc46d3f3e249d1d719acfbd8871b69  /var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-thinx-api.js
```

Sizes: main.js 28878, LogviewController.js 12538, HistoryController.js 1075, DashboardController.js 9497, history.html 7309, dashboard.html 32729, thinx-api.js 38894 bytes.

Pre-deploy Vue bundle (`p47-app-before.js`): `/js/app.js`, 3234786 bytes, id `6d47a5f` (2 occurrences). Every Phase 47 marker was absent (0 each: build-log-search-bar, build-log-match--current, Search log (3+ characters), Search this build log, Previous match, Next match, build-log-retry, build-log-empty, build-no-log, build-actions, listGroupItem--static, notification-title). The three replaced strings were each present once (`build.build_id || build.id`, `isSuccess`, `m-0 mb-1 text-ellipsis`).

Pre-deploy API and edge: GET `/api/v2/logs/build/x` 401 on rtm.thinx.cloud and console.thinx.cloud. GET `/api/v2/logs/build` 401, GET `/api/user/profile` 401, `http://rtm.thinx.cloud:7442/` 200 (saved as `p47-port7442-baseline`). Remote refs: main `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf`, parent thinx-staging `6d47a5fb`, console thinx-staging `31bce2b`.

### Pushes

- Console verify 1: rc 0. 12 commits, all `G`; the changed paths are exactly the fourteen Phase 47 Vue paths, and `src/` has no diff.
- Console push 2026-10-15T09:26:47Z: `31bce2b..591033e  thinx-staging -> thinx-staging`.
- Gitlink bump `ab378790 G chore(47): bump console to build log search and status colours (BUILD-03, POL-02, FIX-02)`. Its only staged path was `services/console` (`31bce2b1 -> 591033e4`).
- Sync: origin/thinx-staging was still `6d47a5fb`, an ancestor of HEAD, so no rebase was needed.
- Parent verify 2: rc 0. Outgoing range (`git log origin/thinx-staging..HEAD --format='%h %G? %s'`):

```
ab378790 G chore(47): bump console to build log search and status colours (BUILD-03, POL-02, FIX-02)
f195fa11 G docs(47-02): record plan 02 progress in state and roadmap
60f2b6bd G docs(47-02): complete build lists and phase 36 review close-out plan
d87ea327 G docs(47-02): record 36 review fixes and 35 IN-06, IN-07 for the FIX-01 ledger
0407d4df G docs(47-01): record plan 01 progress in state and roadmap
e0a9529b G docs(47-01): complete build log search plan
cafbdd2d G docs(47): create phase plan
188bbd6f G docs(state): record phase 47 UI-SPEC session
228d0053 G docs(47): UI design contract
e911acdc G docs(state): record phase 47 context session
c73ea3ef G docs(47): capture phase context
6e3aca89 G docs(46): mark phase complete, transition to Phase 47
c3774589 G docs(phase-46): add security threat verification
bb524d19 G test(46): withdraw test 1 issue after hard-reload retest - 7 passed
5aa20e49 G test(46): complete UAT - 6 passed, 1 issues
5ad69921 G docs(46): add 46-06 gap-fix code review
b4d41919 G test(46): persist human verification items as UAT
57f3a435 G docs(46-06): complete device detail draft fix plan
9c46f887 G docs(46-06): add plan summary for the device detail draft fix
```

  No merges. Outside `.planning/` the only changed path is `services/console`.
- Parent push **2026-10-15T09:27:30Z**: `6d47a5fb..ab378790  thinx-staging -> thinx-staging`. origin main is still `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf`.

### Pipeline proof (verify 3)

```
pipeline 5673 cdfff785-9013-4a8d-9e83-b8b9880f10c9 branch=thinx-staging revision=ab37879
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5673
```

Finished 2026-10-15T09:34:03Z.

### Verify 4 and acceptance

- Verify 4: rc 0. Parent origin/thinx-staging equals HEAD `ab378790`. Console origin/thinx-staging, console HEAD and the parent gitlink are all `591033e`.
- `git log -1 --format='%G? %s' -- services/console` prints `G chore(47): bump console to build log search and status colours (BUILD-03, POL-02, FIX-02)`, and `git show --name-only` on that commit prints exactly `services/console`.
- `git ls-remote origin refs/heads/main` still prints `14c08c1f…`, the SHA recorded in step 2.
- Tracer gate (interactive, end-of-phase, automated-only verify): verify 3 and verify 4 were re-run after the pipeline finished and both passed again. Verify 1 and verify 2 are pre-push checks by design; they passed at their stated moments.

## Task 2: Live production proof

### Rollout timeline (poll every 15 s from the push, unauthenticated)

| UTC | Event |
|---|---|
| 09:27:30 | Parent push |
| 09:28:00 to 09:33:41 | profile 401 on every poll; the bundle still carried the old id |
| 09:33:57 | Bundle id `ab37879` appeared in `/js/app.js` (3234229 bytes) |
| 09:34:31, 09:34:47, 09:35:04 | profile **502** (API task restart observed) |
| 09:35:21, 09:35:38 | profile 401, 401 (two consecutive) |
| 09:35:38 | Ready, restart observed |

### Verify 1: API surface (09:36:00Z), rc 0

```
GET https://rtm.thinx.cloud/api/v2/logs/build/x -> 401
GET https://console.thinx.cloud/api/v2/logs/build/x -> 401
GET rtm logs/build -> 401
GET rtm user/profile -> 401
```

### Verify 2: bundle markers, rc 0

Served `/js/app.js`: 3234229 bytes. It contains the matched id `ab37879` twice. That is 557 bytes smaller than the pre-deploy 3234786, even with the new features; the markers below confirm it is the new build.

| Marker | Before | After |
|---|---|---|
| build-log-search-bar | 0 | 1 |
| build-log-match--current | 0 | 3 |
| Search log (3+ characters) | 0 | 1 |
| Search this build log | 0 | 2 |
| Previous match | 0 | 1 |
| Next match | 0 | 1 |
| build-log-retry | 0 | 1 |
| build-log-empty | 0 | 1 |
| build-no-log | 0 | 2 |
| build-actions | 0 | 2 |
| listGroupItem--static | 0 | 3 |
| notification-title | 0 | 2 |
| `build.build_id \|\| build.id` (replaced) | 1 | 0 |
| `isSuccess` (replaced) | 1 | 0 |
| `m-0 mb-1 text-ellipsis` (replaced) | 1 | 0 |

### Verify 3: Legacy byte identity, rc 0

```
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-main.js: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-LogviewController.js: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-HistoryController.js: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-DashboardController.js: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-history.html: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-dashboard.html: OK
/var/folders/z4/xdx0_q792h50_8tv3c4qxjv40000gp/T/p47-legacy-thinx-api.js: OK
```

### Verify 4: port 7442 and WebSocket (09:36:16Z), rc 0 on the first attempt

```
port7442 now=200 baseline=200
socket 1: opened, close 1008
socket 2: opened, close 1008
WS-MULTITAB OK 2/2 opened
```

## Pending end-of-phase UAT (human checks, unchanged from the plan)

Operator, logged in to https://console.thinx.cloud after a hard reload (bypass the cache; Phase 46 UAT first failed on a stale bundle). Open every page from the sidebar; reloading a deep link still lands on the dashboard until Phase 48.

1. Rollout: Swarmpit (https://swarmpit.thinx.cloud/#/tasks) shows the Vue console task (and the API task) started after the push time in the SUMMARY.
2. Dashboard Recent Builds (criterion 3, POL-02, D-13): the columns read Time, Device, Status, Actions; each row with a build shows View (eye) before Download, 8px apart, on one line; View opens the full build log; Download still downloads the artifact.
3. Search (criterion 1, BUILD-03, D-01..D-12): open a long build log. Two characters highlight nothing; three or more highlight every match in amber and the count reads 1 / N. Next match, Previous match, Enter and Shift+Enter step through the matches; past the last one it wraps to the first and back; the current match is bright amber and sits in the middle of the log box, while the dialog and the page do not scroll. A term with no hit reads No matches and both buttons are disabled. Esc closes the dialog; reopening any log shows an empty search field.
4. Inert HTML (criterion 1, D-05): in a log that contains HTML-looking text (an `#include <...>` line or compiler output with angle brackets), search for `<`: the characters are highlighted and shown as text, and nothing renders as markup.
5. Error state: block `*api/v2/logs/build*` in DevTools Network and open a log: "Could not load this build log." with a Try again button (refresh glyph) and no search bar. Unblock and press Try again: the log appears with the search bar.
6. Status colours (criterion 2, POL-02): on the navbar Recent Builds, the dashboard card, History (Build Log tab) and a device's Build History, a TIMEOUT build is amber, a FAILED build red, an OK build green and a running build blue, wherever such builds exist.
7. Device Build History (criterion 4): clicking the date, Build ID and Status cells opens nothing; View opens the log once.
8. Navbar Recent Builds: rows open their build log; a row without a build id (rare) reads as plain text and is not clickable.
9. Layout (UI-SPEC backstops): with a log of several MB, search a common word with more than 1000 hits: the count reads 1 / 1000+ and Next match on 1000 wraps to 1. A very long unbroken line wraps inside the log box without a horizontal scrollbar. At 375 px wide the search bar wraps to two rows and stays at the top while the log scrolls; at 1280 px it is one row.
10. Records (criterion 4, FIX-02): `.planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md` shows WR-01, IN-01, IN-02 and IN-03 fixed with console commits; the ROADMAP Phase 48 section lists Phase 35 IN-06 and IN-07 under Closed in Phase 47. The Cypress spec change runs with Phase 48 CI-07.
11. Legacy console on https://rtm.thinx.cloud/: the Dashboard and History pages load and the build log overlay opens. Run the console-retest project skill against https://rtm.thinx.cloud/.

For item 1: the API restart showed as 502 from 09:34:31Z to 09:35:04Z, and the bundle id appeared at 09:33:57Z. Both are after the 09:27:30Z push.

## Task Commits

1. **Task 1 (tracer): Ship console and parent to thinx-staging and prove the pipeline's job list**: `ab378790` (chore). Console range `31bce2b..591033e` pushed.
2. **Task 2: Live production proof**: no commit (read-only checks, no repository change).

## Files Created/Modified

- `services/console`: gitlink `31bce2b -> 591033e` (Phase 47 build log search, build lists, review fixes).

## Decisions Made

- No rebase was needed: origin/thinx-staging was unchanged (`6d47a5fb`) at the push.
- The rollout poller started at push time, during the pipeline wait, so the API restart window was captured (502 for about 34 s). The live checks ran only after the readiness rule held.
- The SUMMARY and close-out docs commits stay local and ride the next thinx-staging push.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered

- The served bundle is 557 bytes smaller than the pre-deploy one even though it adds features. Every marker check passed, so it is the new build; this note only records the size.
- GitHub's push banner reports 16 Dependabot alerts on thinx-cloud/console's default branch (2 high). This was already known and is out of scope for this plan.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Phase 47 is deployed. The end-of-phase UAT (11 items above) is pending operator verification.
- The local SUMMARY and docs commits are unpushed by design (next thinx-staging push).

## Self-Check: PASSED

- FOUND: commit `ab378790` (ancestor of HEAD); console commit `591033e` (ancestor of console HEAD)
- FOUND: `services/console` gitlink = `591033e483511949d14c3a37f48f301321d2a1de`
- Measured commits: `git rev-list --count f195fa11..HEAD` = 1

---
*Phase: 47-build-log-search-status-colours*
*Completed: 2026-10-15*
