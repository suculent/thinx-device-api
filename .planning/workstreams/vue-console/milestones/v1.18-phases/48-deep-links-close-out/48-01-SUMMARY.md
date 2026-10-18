---
phase: 48-deep-links-close-out
plan: 01
subsystem: ui
tags: [vue, vue-router, deep-link, parse-result, cypress, unit-tests, review-ledger]

requires:
  - phase: 47-build-log-search-status-colours
    provides: BuildLogDialog empty state (UI-B09), hasBuildLog predicate, build-log-search.cjs N checks
  - phase: 46
    provides: transformers-enviros.cjs harness (copied), K6 stored-selection check
provides:
  - "App.vue waitForInitialRoute(): default-route decision on the confirmed initial route (NOTIF-04)"
  - "cy.visitAppRoute as a plain hard load; cypress/integration/deep-link.spec.js (4 tests)"
  - "parseResult returns an undefined response for an envelope with no data key (35 IN-01)"
  - "vue/tests/unit/close-out-v118.cjs (A, I, H, N, R, T, E checks), chained in test:unit, for 48-03 to extend"
affects: [48-03, 48-05, 48-06]

actuals:
  tokens: 11621
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Root-component route decisions wait for router.onReady(ok, err) and read router.currentRoute"
    - "Citation checks: a unit check that asserts another test file still holds a named assertion"

key-files:
  created:
    - services/console/vue/tests/unit/close-out-v118.cjs
    - services/console/vue/cypress/integration/deep-link.spec.js
  modified:
    - services/console/vue/src/App.vue
    - services/console/vue/cypress/support/session.js
    - services/console/vue/package.json
    - services/console/vue/src/core/api.js
    - services/console/vue/src/store/profile.js
    - services/console/vue/src/store/devices.js
    - services/console/vue/src/store/enviros.js
    - services/console/vue/src/store/apikeys.js
    - services/console/vue/src/store/channels.js
    - services/console/vue/src/store/repositories.js

key-decisions:
  - "NOTIF-04 mechanism: App.vue waits for router.onReady with the same callback for success and error, then reads router.currentRoute.path; vue-router 3.6.5 keeps a redirected initial navigation unready until the redirect confirms (prev === START), verified in node_modules"
  - "IN-01 caller guards: store/profile.js keeps its initial {} profile (Header reads profile.first_name); the list stores devices, enviros, apikeys, channels and repositories commit result.response || [] so an empty envelope keeps an empty list"
  - "N1 is a citation of build-log-search.cjs N1 rather than a new case; T1 added for the Create & Assign updateDevice failure path, the one IN-08 Vue gap with no existing check"

patterns-established:
  - "close-out-v118.cjs check prefixes: A, I, H, N, R, T, E (48-01); F, W, M, C, L reserved for 48-03"

requirements-completed: [NOTIF-04, FIX-01, CI-07]

coverage:
  - id: D1
    description: "A logged-in hard load or reload of /#/app/history stays on History (/#/app/history/audit) with no dashboard render; other /app routes stay; / goes to the dashboard; logged out goes to /login"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#A1..A8"
        status: pass
      - kind: e2e
        ref: "services/console/vue/cypress/integration/deep-link.spec.js (Cypress 9.7.0 local run, 4 passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cypress harness enters routes with a plain hard load (cy.visitAppRoute === cy.visitApp('/#' + route))"
    requirement: CI-07
    verification:
      - kind: other
        ref: "plan Task 1 verify 2 (awk/grep over cypress/support/session.js)"
        status: pass
    human_judgment: false
  - id: D3
    description: "parseResult gives an undefined response for an envelope with no data key; build log dialog shows its empty state; audited callers keep their empty states"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#I1..I8"
        status: pass
    human_judgment: false
  - id: D4
    description: "35 IN-08 Vue gaps have named behavioural checks (Header, auth logout, History rows, Create & Assign failure) or citations"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#H1,H2,N1,R1,R2,T1,E1..E3"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-10-15
status: complete
commits: 6
plan_head_before: 54734af
plan_head_after: 794f357
---

# Phase 48 Plan 01: Deep-link reload, empty envelopes and IN-08 cases Summary

**App.vue now waits for vue-router's onReady and decides the default route on the confirmed initial route, so a reloaded `/#/app/history` stays on History. `parseResult` returns `undefined` again for an empty envelope, with guards in six stores. The new `close-out-v118.cjs` adds 25 checks for NOTIF-04, 35 IN-01 and the Vue half of 35 IN-08.**

All commits are in the `services/console` submodule on `thinx-staging`. They are signed (`%G?` = `G`) and not pushed. `commits`, `plan_head_before` and `plan_head_after` count the console repo (`git -C services/console rev-list --count 54734af..794f357` = 6). The parent gitlink bump is left for 48-06.

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-15T14:54:44Z
- **Completed:** 2026-10-15T15:11:01Z
- **Tasks:** 3 (plus one extra test commit, see Deviations)
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- NOTIF-04 fixed. A logged-in hard load or reload of `/#/app/history` ends on `/#/app/history/audit` with title `History`. No `GET /api/v2/stats` or `/stats/today` request is made. Device deep links stay where they are, `/#/` still goes to the dashboard, and a logged-out deep link ends on `/#/login`.
- `/oauth-return` now really force-primes the CSRF token on a cold load. Before the fix, `currentPath` read the start route `/`, so `forcePrime` was always false there.
- D-03: `cy.visitAppRoute` is a plain hard load, and the dashboard-hop workaround and its comment block are gone. The new spec `deep-link.spec.js` proves the cold-load path in a browser.
- 35 IN-01: `parseResult({ success: true })` gives `response: undefined` again. The caller audit found that the post-35 `{}` made AdminUsers crash (`{}.slice`); the new I8 check reproduced this on the old tree. Six stores now guard an undefined response.
- Vue half of 35 IN-08: every bullet now has a named check (see the coverage map below).

## Task Commits

All commits are in `services/console`:

1. **Task 1 (tracer): reload `/#/app/history` while logged in and stay on History**
   - RED `bc9f2a6` `test(vue): add failing deep-link reload checks (NOTIF-04, D-07)`
   - GREEN `d80d148` `fix(vue): keep a reloaded deep link on its page (NOTIF-04, D-07)`: **the NOTIF-04 fix commit for the FIX-01 ledger**
2. **Task 2: an empty API envelope yields an undefined response again**
   - RED `af06362` `test(vue): expect undefined for an empty api envelope (35 IN-01, D-12)`
   - GREEN `056ef3c` `fix(vue): return undefined for an empty api envelope (35 IN-01, D-12)`: **the 35 IN-01 fix commit**
3. **Task 3: behavioural cases for Header, Notifications and History**
   - `824687f` `test(vue): behavioural cases for header, notifications and history (35 IN-08, D-13)`: **the 35 IN-08 commit**
   - `794f357` `test(vue): cover the create and assign failure path (35 IN-08)` (deviation 2)

## TDD evidence

**Task 1 RED (`bc9f2a6`).** The test ran against the unchanged App.vue and exited 1:
```
FAIL A1 ... (App.vue never reads the router internal history object)
ok   A7 PUBLIC_PATHS in App.vue and Routes.js are the same list
FAIL A2 ... (/app/history/audit: hydrateSession is not called before the initial route confirms)
FAIL A3 ... (/: no hydrate before onReady)
FAIL A4 ... (/app/devices: no hydrate before onReady)
FAIL A5 ... (no hydrate before onReady)
FAIL A6 ... (no hydrate before either onReady callback)
ok   A8 pushIfNeeded swallows NavigationDuplicated and rethrows any other error
```
Assessment: each FAIL is the assertion the plan targets. The old `created()` reads `history.current` and hydrates before the stub router's onReady fires. There were no load, syntax or fixture errors. A7 and A8 are guard checks of behaviour that already holds, so they pass. The `gsd tdd-red-evidence` classifier was not run: this harness prints its own `ok`/`FAIL` lines, which is none of the formats it accepts (TAP, JUnit, swift-testing, unittest). The assessment above was done by hand.

**Task 1 GREEN (`d80d148`).** A1..A8 all pass. The full `test:unit` passed with 383 `ok` lines.

**Task 1 browser check.** The locked Cypress 9.7.0 binary was installed with `cypress install`; `package.json` and the lockfile did not change. Then `start-server-and-test serve … cypress run --spec cypress/integration/deep-link.spec.js` reported `✔ deep-link.spec.js 4 4 - - -`. I also ran the same spec once against the pre-fix `App.vue`, as a temporary local swap that was then restored with `git checkout -- vue/src/App.vue`. It failed 2/4: the History reload and the device deep link, with `expected '<h1.page-title>' to contain 'zephyr-01'`. So the spec does catch the bug.

**Task 2 RED (`af06362`).** The test exited 1:
```
FAIL I1 an envelope with no data key gives an undefined response (response is undefined, never {})
FAIL I2 paging alone is not data: response undefined, paging kept (response is undefined)
ok   I3..I7
FAIL I8 audited callers take an empty envelope without throwing and keep their empty state (AdminUsers renders without error)
```
Assessment: I1 and I2 fail on the `{}` branch, as intended. I8 fails because AdminUsers crashes on `{}`, which is the real IN-01 regression. I3..I6 cover existing branches and I7 (dialog empty state) already holds with `{}`: `buildLogText({})` returns `''`.

**Task 2 GREEN (`056ef3c`).** I1..I8 pass and `test:unit` passed with 391 `ok` lines. Taking out the `store/profile.js` guard alone turns I8 red again ("Header renders without error"), so that guard is needed.

**Task 3.** H1, H2, R1 and R2 are characterizations, and all passed on the first run. No component defect was found, so there is no `fix(vue)` commit.

## IN-01 caller audit

Command: `grep -rn '\.response\b' services/console/vue/src --include=*.js --include=*.vue` (43 lines). Paths below are relative to `vue/src/`.

| file:line | Reads | Verdict | Fix |
|---|---|---|---|
| core/api.js:76 | own `response` key in parseResult | the function itself | zero-key branch (D-12) |
| utils/cookies.js:78 | error payload `=== "csrf_token_invalid"` | non-success path only; equality | none |
| components/BuildLogDialog/BuildLogDialog.vue:132 | `buildLogText(result.response)` | handles undefined (`''` gives the empty state, I7) | none |
| pages/Visits/Visits.vue:284 | download failure envelope `envelope && envelope.response` | handles undefined | none |
| pages/Apikeys/Apikeys.vue:76 | `result.response && result.response.api_key` | handles undefined | none |
| pages/AdminUsers/AdminUsers.vue:107, :120 | error text `result.response && ….toString()` | handles undefined | none |
| pages/AdminUsers/AdminUsers.vue:123 | `result.response && result.response.access_token` | handles undefined | none |
| pages/Profile/Profile.vue:373 | comment | n/a | none |
| pages/Profile/Profile.vue:376 | `result.response \|\| {}` | handles undefined | none |
| pages/Profile/Profile.vue:394, :397 | failure code lookup | non-success path; an undefined code falls to the generic message | none |
| pages/PasswordReset/PasswordReset.vue:144, :185 | `(result && result.response) \|\| "…"` | handles undefined | none |
| pages/Rsakeys/Rsakeys.vue:137 | `key = result.response; if (key && key.pubkey)` | handles undefined | none |
| pages/Rsakeys/Rsakeys.vue:143, :285, :292, :297 | `=== 'invalid_key_name' / 'key_not_found' / 'rename_failed'` | equality only | none |
| pages/Rsakeys/Rsakeys.vue:307 | `Array.isArray(result.response)` | type-checks | none |
| pages/Devices/Devices.vue:468 | `text(result.response)` (string check) | type-checks | none |
| store/profile.js:88 | `saveProfile(result.response)`; Header.vue:26 renders `profile.first_name` | **needs a fix**: undefined crashes the Header render (with `{}` it rendered an empty name) | `result.response \|\| {}` (the store's initial profile) |
| store/admin.js:10 | `setUsers(result.response)`; AdminUsers `getUsers() \|\| []` | handles undefined. `{}` crashed it (`{}.slice`), so IN-01 fixes it | none |
| store/apikeys.js:41 | `Object.keys(data.items)` | **needs a fix**: `Object.keys(undefined)` throws | `result.response \|\| []` |
| store/rsakeys.js:62 | `result.response \|\| []` | handles undefined | none |
| store/channels.js:37 | `Object.keys(data.items)` | **needs a fix**: throws | `result.response \|\| []` |
| store/stats.js:20, :27 | `saveStats` / `saveToday`; Visits `statsData \|\| {}`, `extractMetric(!data)` gives 0, `getTimeline` checks for a falsy value | handles undefined (I8: all metric cards 0) | none |
| store/transformers.js:31, :34 | `!result.response \|\| !result.response.info` | type-checks | none |
| store/auth.js:83 | `isJwtValid(result.response)` | handles undefined (false) | none |
| store/devices.js:42 | `for (item of data.items)` | **needs a fix**: undefined (and the old `{}`) is not iterable | `result.response \|\| []` |
| store/devices.js:51, :54 | `Array.isArray(result.response)` | type-checks | none |
| store/repositories.js:58 | `Object.keys(data.items)` | **needs a fix**: throws | `result.response \|\| []` |
| store/auditlog.js:59 | `saveAuditItems(result.response)`; History.vue:389 and Visits.vue:249 apply `\|\| []` | handles undefined. `{}` would have crashed History's `.slice()` | none |
| store/auditlog.js:72 | `Array.isArray(result.response)` | type-checks | none |
| store/buildlog.js:54, :71 | `normalizeBuildItems(result.response)` (non-array gives `[]`) | type-checks | none |
| store/enviros.js:84 | `data.items.map` | **needs a fix**: throws | `result.response \|\| []` |
| store/enviros.js:93, :96 | `Array.isArray(result.response)` | type-checks | none |

None of the guards changes any copy. Each store keeps its initial or empty value, so every page shows its existing empty-state line. Commit `056ef3c` touches only `core/api.js` and the six stores marked **needs a fix**.

## IN-08 coverage map (35-REVIEW.md, Vue side)

| IN-08 bullet | Check names covering it |
|---|---|
| Header only template-compiled | `close-out-v118.cjs` **H1** (logout waits for `auth/logout`, then pushes `/login` once), **H2** (`auth/logout` with a rejecting `fetch` resolves and clears the session once), **I8** (Header renders with an empty profile) |
| Notifications only template-compiled | `build-log-search.cjs` **N1** `navbar rows: buttons with a click listener only with a build id; a row without one is static and inert`, plus N2 and N3, cited by `close-out-v118.cjs` **N1** |
| History only template-compiled; WR-01 would pass | `close-out-v118.cjs` **R1** (listener keys exactly `click`; none for `''`, `42`, `{}`; also covers 47-REVIEW IN-10), **R2** (an inner-button target, as in keyboard activation of Expand or View, never opens through the row); `milestone-v116.cjs` 35 WR-01 block, cited by **E3** |
| Transformers / TransformerEditor only template-compiled; CR-01 would pass | `milestone-v116.cjs` `35 CR-01: the editor refuses to save after a failed load` and `transformers-enviros.cjs` (Phase 46), cited by **E1** |
| Fix item: inner-button keyboard activation | **R2**; `milestone-v116.cjs` `click on an inner button does not open the dialog` (**E3**) |
| `createTransformer` does not cover the unsaved selection (WR-02) | `transformers-enviros.cjs` **K6** `stored plus new, never the unsaved tick`; `milestone-v116.cjs` 35 WR-02 `unsaved selection is not written`, cited by **E2** |
| `createTransformer` does not cover the `updateDevice` failure path | `close-out-v118.cjs` **T1** (new) |
| Legacy deploy-key `.fail` path (toast, `xhrFailed`, `.always` reset) | Legacy side, plan **48-04** (`src/test/deploykey.cjs`) |

## Files Created/Modified

Paths are in `services/console/vue/`.

- `src/App.vue`: new `waitForInitialRoute()`; `created()` now awaits it before `hydrateSession`, and the comment above it explains why.
- `cypress/support/session.js`: `visitAppRoute` is `return cy.visitApp('/#' + route, options);` and the workaround comment block is gone.
- `cypress/integration/deep-link.spec.js` (new): `Deep link reload (NOTIF-04)`, 4 tests.
- `tests/unit/close-out-v118.cjs` (new): copied harness (including the Sass helpers for 48-03) plus A1..A8, I1..I8, H1, H2, N1, R1, R2, T1, E1..E3, 25 checks in all.
- `package.json`: `&& node tests/unit/close-out-v118.cjs` appended to `test:unit` (exactly once).
- `src/core/api.js`: `parseResult` zero-key branch, with a 35 IN-01 comment.
- `src/store/profile.js`, `devices.js`, `enviros.js`, `apikeys.js`, `channels.js`, `repositories.js`: empty-envelope guards (audit table).

## Decisions Made

- **App.vue mechanism.** `router.onReady(done, done)`, then `router.currentRoute.path`. vue-router 3.6.5 `transitionTo` fires the ready error callbacks for a redirect only when `prev !== START`, so a guard redirect of the initial navigation (logged out `/app/*` to `/login`) still waits for the redirect to confirm. I checked this in `node_modules/vue-router/dist/vue-router.common.js`.
- **Store guards.** The audit fixes go in the stores, not the pages. Each store then holds exactly its initial or empty value: `{}` for the profile, `[]` for the lists. No copy changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test harness gap in I8 before the RED commit**
- **Found during:** Task 2 RED
- **Issue:** The first I8 draft built Visits' `metricCards` without `deviceCount`, so it failed for the wrong reason (`Active Devices today is 0`).
- **Fix:** Added `deviceCount: 0` to the call context before committing RED. The committed RED fails on the real `{}` crash in AdminUsers.
- **Files modified:** `vue/tests/unit/close-out-v118.cjs`
- **Committed in:** `af06362`

**2. [Rule 2 - Missing coverage] Added T1 for the Create & Assign `updateDevice` failure path**
- **Found during:** Task 3 (building the IN-08 coverage map)
- **Issue:** 35-REVIEW IN-08 bullet 3 names the `updateDevice` failure path of `createTransformer`, and no existing check covers it. The Task 3 done criterion asks for a named check for every Vue-side IN-08 gap.
- **Fix:** Added a characterization check: one assignment write of stored plus new, the "assignment failed" message, the modal kept open, no reload, `transformerSaving` reset and the stored list unchanged. It passes on the shipped code, so no component change was needed.
- **Files modified:** `vue/tests/unit/close-out-v118.cjs`
- **Committed in:** `794f357` (a separate `test(vue)` commit after `824687f`)

**3. [Process] The RED commit was amended once to add the session attribution trailer**
- The first RED commit, `016370e`, lacked the `Claude-Session:` trailer. I amended it locally to `bc9f2a6` before any other commit. Nothing was pushed, and the content is the same.

---

**Total deviations:** 2 auto-fixed (1 blocking test-harness fix, 1 missing-coverage check) plus 1 process note.
**Impact on plan:** No scope creep beyond IN-08. Only Vue test code and the planned source files changed.

## Issues Encountered

- The Cypress 9.7.0 binary was not installed. `cypress install` fetched the locked version with no `package.json` or lockfile change, `cypress verify` passed, and the spec ran locally. The CI-image fallback was not needed.
- The two pre-existing specs that use `visitAppRoute` (`history.spec.js`, `device-detail.spec.js`) still have comments that describe the old dashboard hop. This plan may not edit them, so they are logged in `deferred-items.md` for 48-05.
- A logged-out deep-link reload now hydrates twice: once in the guard, and once in App.vue after the redirect to `/login`. The second call is one extra `POST /session/token` that gets a 401. The plan accepted this, and `hydrateSession` is unchanged (D-04).

## Verification (plan-level)

- `LC_ALL=C npm --prefix services/console/vue run test:unit` exit 0 (400 `ok`, 0 `FAIL`); the same without `LC_ALL=C` exit 0 (400 `ok`, 0 `FAIL`); `close-out-v118.cjs` is chained once.
- `NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build` passed. The bundle contains `onReady`/`waitForInitialRoute`. `test:csp:dist` PASS. `perf:spotter` "All performance budgets passed."
- `deep-link.spec.js`: 4 passing (local Cypress 9.7.0).
- `git -C services/console log --format=%G? 54734af..HEAD` is `G` six times. `status --porcelain -- vue src` is empty. `rev-list --count origin/thinx-staging..HEAD` is 6, so nothing was pushed. No path under the Legacy `src/` changed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 48-03 can extend `close-out-v118.cjs`. The Sass helpers (`compiledCss`, `cssRules`, `decls`, `value`, `expectDecls`) and the `header`, `deviceDetailPage` and `visits` loaders are already in place. Prefixes F, W, M, C and L are free.
- 48-05 runs the full Cypress suite on the plain hard-load harness (and can remove the stale comments in `deferred-items.md`).
- 48-06 records `d80d148` (NOTIF-04), `056ef3c` (35 IN-01) and `824687f` with `794f357` (35 IN-08, Vue) in the FIX-01 ledger, and bumps the parent gitlink.

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-15*

## Self-Check: PASSED

All 4 key files exist; all 6 console commits (bc9f2a6, d80d148, af06362, 056ef3c, 824687f, 794f357) are ancestors of services/console HEAD.
