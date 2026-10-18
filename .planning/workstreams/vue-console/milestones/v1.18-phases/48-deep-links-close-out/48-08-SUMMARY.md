---
phase: 48-deep-links-close-out
plan: 08
subsystem: testing
tags: [cypress, flaky-test, root-cause, test-isolation, deep-link, ci, circleci, api-client, gap-closure]
status: complete

requires:
  - phase: 48-deep-links-close-out
    provides: "48-07 crash-proof JUnit reporter and hermetic CI runs (console 0692f0f), the test-vue-console gate (48-02)"
provides:
  - "Root cause of the logged-out deep-link flake with trace evidence (VERDICT A+B)"
  - "Api.request() resolves a failed fetch to { success: false, status: 0, response: null } (unit I9)"
  - "deep-link.spec.js test 3 settles its eight dashboard reads before it ends"
  - "First green test-vue-console gate on thinx-staging (pipeline 5677) and the vue-console-registry build"
affects: [48-06, CI-07, NOTIF-04, test-vue-console, vue-console-registry]

actuals:
  tokens: 2100     # chars/4 over the realized console diff (6093 chars) plus the STATE.md bullets
  tasks: 3
  commits: 1       # MEASURED in the parent: git rev-list --count a672a287..HEAD (the gitlink commit); plus 3 console commits
plan_head_before: a672a28721419b13538659a5ebca3f561f38526a
plan_head_after: 24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed

tech-stack:
  added: []
  patterns:
    - "Diagnostic Cypress arm specs outside the repo with a window-identity trace (win stamps, fetch wrapper, request logs, fail probe)"
    - "A deterministic RED for a race: hold the suspect requests in flight with an intercept delay in a diagnostic copy only"

key-files:
  created: []
  modified:
    - services/console/vue/src/core/api.js
    - services/console/vue/tests/unit/close-out-v118.cjs
    - services/console/vue/cypress/integration/deep-link.spec.js
    - services/console (gitlink 0692f0f -> 512ddb5)
    - .planning/workstreams/vue-console/STATE.md

key-decisions:
  - "VERDICT A+B: the failure needs both the in-flight test 3 reads (isolation) and Api.request() letting the rejection escape (app); both are fixed"
  - "App fix in Api.request() only: fetch/fetchWithCsrf calls, the CSRF prime and retry and parseResult unchanged (D-04, 35 IN-01)"
  - "Spec fix additions-only: test 3 waits by alias for its eight reads; no assertion, title, hook or visit line changed"

requirements-completed: []   # CI-07 and NOTIF-04 are shared with 48-06 (no SUMMARY yet): requirements.ready-ids returned 0/2

coverage:
  - id: D1
    description: "Root cause of the logged-out deep-link failure recorded with trace evidence"
    requirement: CI-07
    verification:
      - kind: other
        ref: "48-08 Task 1 verify 1 and verify 2 (${TMPDIR}/p48-08/verdict.txt, pre-arms traces)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Api.request() never rejects on a failed fetch; a response and the csrf_token_invalid retry are unchanged"
    requirement: NOTIF-04
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/close-out-v118.cjs#I9"
        status: pass
    human_judgment: false
  - id: D3
    description: "The logged-out hard load of /#/app/history ends on #/login reliably: RED arm W 20/20 before, 0/20 after; 55/55 consecutive spec runs; full suite 11/11"
    requirement: NOTIF-04
    verification:
      - kind: e2e
        ref: "48-08 Task 2 verify 4 (PROOF OK arms 3x40 green, deep-link 55/55, full suite 11/11)"
        status: pass
    human_judgment: false
  - id: D4
    description: "test-vue-console green on thinx-staging and vue-console-registry built (CI-07 gate)"
    requirement: CI-07
    verification:
      - kind: other
        ref: "node scripts/check-ci-gates.js pipeline --revision 24d2b7cd --expect legacy-on --wait (CI-GATES PIPELINE OK 5677); CILOG job 16075"
        status: pass
    human_judgment: false

duration: 2h 4m
completed: 2026-10-16
---

# Phase 48 Plan 08: Logged-out Deep-link Redirect Flake Summary

**The logged-out deep-link flake had two causes, and both are fixed. Test 3's dashboard reads were still in flight when Cypress reset the intercepts for test 4. Cypress failed those reads, and `Api.request()` let the `Failed to fetch` escape as an unhandled rejection, which stopped test 4's `beforeEach` and gave up its `#/login` assertion. `Api.request()` now resolves network failures, and test 3 waits for its reads. Pipeline 5677 ran `test-vue-console` green (77 results, 0 failures) and built `vue-console-registry`.**

## Performance

- **Duration:** 2h 4m (10:38:41Z to 12:42:38Z, including a session rate-limit pause after the proof runs)
- **Started:** 2026-10-16T10:38:41Z
- **Completed:** 2026-10-16T12:42:38Z
- **Tasks:** 3 of 3
- **Files modified:** 3 console files, the parent gitlink and STATE.md

## Accomplishments

- Reproduced the CI failure on demand in the CI image under CI limits (arm W, 20 of 20) and explained it with a window-identity trace.
- Fixed both contributors: `core/api.js` (app) and `deep-link.spec.js` test 3 (isolation, additions only).
- Proved it locally on the committed HEAD: arms 3x40 green, 55 consecutive deep-link runs green, full CI-mirror suite green.
- Shipped console `0692f0f..512ddb5` and parent `e13933a3..24d2b7cd` on thinx-staging. Pipeline 5677 is the first with a green `test-vue-console` gate and a `vue-console-registry` build.

## Task Commits

Console (`thinx-cloud/console`, thinx-staging, `%h %G? %s`):
1. **Task 2 RED:** `9a0e1cd G test(vue): reproduce the api client rejecting on a failed fetch (CI-07, NOTIF-04)`
2. **Task 2 GREEN (app):** `09fbde1 G fix(vue): resolve a failed fetch in the api client instead of rejecting (CI-07, NOTIF-04)`
3. **Task 2 (isolation):** `512ddb5 G test(vue): settle the dashboard reads before the logged-out deep-link test (CI-07, NOTIF-04)`

Parent (`suculent/thinx-device-api`, thinx-staging):
4. **Task 3 gitlink:** `24d2b7cd G chore(48): bump console to the logged-out deep-link redirect fix (CI-07, NOTIF-04)`

Task 1 is diagnosis only and has no commit, as planned.

**Plan metadata:** the docs commit (this SUMMARY and STATE.md) stays local and rides 48-06's next thinx-staging push.

## Root cause

### Logged-out boot sequence (vue/src at 0692f0f, confirmed against the code)

1. `main.js:96-101` mounts App with the router. The initial navigation to `/app/history` runs the `Routes.js:149` `beforeEach` guard.
2. `Routes.js:152-155`: there is no token in the store, so it awaits `auth/hydrateSession` (`store/auth.js:73`), which shares one in-flight `hydratePromise` (`auth.js:76-92`).
3. `auth.js:81` calls `ensureCsrfToken` (`utils/cookies.js:39`). There is no XSRF cookie, so it sends `GET /api/v2/csrf-token` (`cookies.js:45`). Then `auth.js:82` calls `$post('/session/token')`. The catch-all answers 500, so `hydrateSession` resolves false and the guard calls `next('/login')` (`Routes.js:155`).
4. `App.vue:49-60`: `created()` awaits `waitForInitialRoute()` (`router.onReady(done, done)`, `App.vue:37-42`), hydrates again, and returns because `/login` is public.
5. The only `window.location` writers are `core/api.js:32` and `store/auth.js:133` (both only for an expired in-memory token). G6 matches the code.
6. G7 matches the code: `Api.request()` (`core/api.js:97-131` at 0692f0f) awaited `fetch` / `fetchWithCsrf` outside any try/catch, so a network failure rejected with `TypeError: Failed to fetch`.
7. New: `Header.vue:123` (`this.fetchProfile().then(…)`, no catch) and `Header.vue:127` (`dispatch("buildlog/fetchBuildLog")`, no catch) are the callers that leave such a rejection unhandled. `Visits.vue` uses `Promise.allSettled`, so its reads are handled.

### Counts (verdict.txt, matching the JUnit files)

```
VERDICT A+B
ARM s 0/40
ARM f 0/40
ARM w 20/40
LOOP 0/20
RED pre-arms:arm-w 20/20 expected undefined to equal '#/login' (all 20 logged-out tests of arm W, 0 of 20 in arms S and F)
```
The 20 W failures all carry the baseline signature, `AssertionError: expected undefined to equal '#/login'`.

### Failing transition (arm W iteration 7, trace excerpt; request-log and intercept lines omitted; window 13 = test 3, window 14 = test 4)

```
PREV   46213 w=13 cmd location                                   (test 3's last assertion)
PREV   46773 w=13 url http://localhost:3000/#/app/dashboard
PREV   46804..46928 w=13 fetch:start logs/build, stats, logs/audit, logs/build, stats/today, device, profile, logs/build
PREV   47070 w=13 test:end test 3 passed 2727 ms
THIS   47076 w=13 test:start test 4
THIS   47180 w=13 fetch:reject /api/v2/device "Failed to fetch"     (issuer 13: test 3's window)
THIS   47181 w=13 fetch:reject /api/v2/profile "Failed to fetch"
THIS   47184 w=13 uncaught "…originated from your application code… caused by an unhandled promise rejection. > Failed to fetch"
                  runnableType hook, currentWin 13
THIS   47188 w=13 fail:earlier (same uncaught error; probe href #/app/dashboard, winId 13)
THIS   47190 w=13 unhandled "Failed to fetch" at Api.eval (webpack-internal:///./src/core/api.js:177:22)
THIS   47213 w=13 cmd visitApp / visit                           (no viewport, no stubThinxApi cmd before it)
THIS   47249 w=13 win:before-unload, 47274 win:unload            (Cypress's visit tears test 3's window down)
THIS   47280 w=13 fetch:reject stats, logs/audit, stats/today, logs/build x3
THIS   47472 w=14 win:before-load http://localhost:3000/#/app/history
THIS   48174 w=14 fetch:start /api/v2/csrf-token                 (no alias: no stubs registered, goes to origin)
THIS   48214 w=14 win:load
THIS   48217 w=14 cmd location, 48317 cmd should
THIS   48326 w=14 fail "expected undefined to equal '#/login'"
                  probe {href http://localhost:3000/#/app/history, sameWindow true, iframeSrc …/#/app/history,
                         winId 14, readyState complete, iframeWinId 14}
THIS   49763 w=14 test:end failed 2624 ms
```

### Passing transition (arm S iteration 7)

```
PREV   38066..38178 w=13 fetch:start the same eight dashboard reads
PREV   38218..38309 w=13 fetch:settle seven of them, 200
PREV   38344 w=13 test:end test 3 passed
THIS   38355 w=13 test:start test 4
THIS   38469 w=13 fetch:settle /api/v2/logs/build 200             (earlier window, after test 4 started, settled not failed)
THIS   38657 cmd viewport, 38670 cmd stubThinxApi + 16 x as        (beforeEach runs in full)
THIS   38836 cmd visit, 38840/38852 w=13 before-unload/unload
THIS   38927 w=14 win:before-load …/#/app/history
THIS   39598..39713 w=14 csrf-token 200, csrf-token 200, session/token 500
THIS   39757 w=14 url http://localhost:3000/#/login
THIS   39829 w=14 test:end passed 1471 ms
```

### What the traces establish

- **Earlier-window activity:** in all 20 arm S iterations test 3's window still settles requests after test 4 started (103 settles, all 200). The overlap exists every time, but it is harmless while the requests settle. In arm W every one of the 20 logged-out tests has test 3's requests rejected with `Failed to fetch` 90 to 564 ms after `test:start` (159 rejects). The first ones land before that window unloads, so Cypress fails requests still pending when it resets the intercepts for the next test. Arm F (a settled logged-out page first) has 0 rejects and 0 uncaught events.
- **Uncaught/unhandled origin:** each failure has exactly one unhandled rejection, on test 3's window, with stack top `src/core/api.js:177` (`Api.request`'s fetch), reported by Cypress as an uncaught exception in the hook phase.
- **Why the test ends early and why `undefined`:** Cypress's `onUncaughtException` calls `fail()`, which stops the command queue and stores the error. Test 4's `beforeEach` therefore never runs `viewport` or `cy.stubThinxApi()` (0 of 20 failing tests have those commands; all 40 passing S/F logged-out tests do), and the stored error makes `cy.location`'s retry bail, so the assertion sees an `undefined` subject at once. The test duration is 1.8 to 4.9 s, well under the 10 s command timeout (matches G5). The probe reads the location fine at failure time (`#/app/history`, same window, `complete`). So G3c's reading ("undefined = unreadable location") does not apply here. The CI baseline screenshot agrees: it shows the default 1000x660 viewport, not 1536x754, so its `beforeEach` was cut short the same way.
- **Test 4's own window** never unloads or gets replaced after its visit (0 events), and there is no app-initiated navigation.
- **G8 (unmatched requests):** in the 20 failing tests, with `stubThinxApi` skipped, test 4's own `csrf-token` (46) and `session/token` (19) request logs end with no alias and `wentToOrigin: true`. They went to the dev-server proxy, whose target is `https://console.thinx.cloud` (T-48-35). The arm S "unmatched" logs of test 3 reads all settled 200 with fixture data; they are logs Cypress created after the test boundary, not proxy hits.

### Verdict against the hypotheses

- **H-B (test isolation): contributes.** Arm F is clean while W fails 20/20. Every failing trace shows test 3's window issuing and rejecting requests after test 4 started.
- **H-A1 (escaped rejection): contributes.** Every failing iteration has exactly one unhandled rejection, whose stack runs through `core/api.js` (`Api.request`), and that rejection is what makes Cypress end test 4's hook phase.
- **H-A2 (document navigation): rejected.** Test 4's window never unloads after its visit, there is no new window without a Cypress navigation, and arm F has 0 failures.
- **H-C: rejected.** Both contributors sit in `vue/src` and in the spec.

The local mirror under-reproduces the natural race (loop 0/20, arm S 0/20), so arm W carries the causal proof and the 55-run series serves as a regression guard (see Proof).

## Proof

### Commits and RED/GREEN

RED (`LC_ALL=C npm --prefix services/console/vue run test:unit`, rc 1, only the new check fails):
```
FAIL I9 a rejected fetch resolves { success: false, status: 0, response: null } for $get and $post; a response and the csrf_token_invalid retry are unchanged ($get rejects with Failed to fetch instead of resolving { success: false })
```
Semantic assessment: the target check ran and failed on its planned assertion (the `$get` rejection), with no load, syntax or fixture fault. The 422 checks before it passed. The harness prints `ok`/`FAIL` lines, not TAP or JUnit, so `check tdd-red-evidence` cannot classify it. The RED rests on this inspection, per the plan's own RED procedure.

GREEN (rc 0, 431 ok lines, no FAIL; `ok   A7` and `ok   I1` present):
```
ok   I9 a rejected fetch resolves { success: false, status: 0, response: null } for $get and $post; a response and the csrf_token_invalid retry are unchanged
```
The production build passed (`NODE_OPTIONS=--openssl-legacy-provider npm run build`, rc 0, "Build complete").

### Pre-fix vs post-fix (CI image, `--cpus=2 --memory=4g --memory-swap=4g`)

| Source | Console | Before (0692f0f) | After (512ddb5) |
|--------|---------|------------------|-----------------|
| arm S (40 tests) | | 0/40 failed | 0/40 failed |
| arm F (40 tests) | | 0/40 failed | 0/40 failed |
| **arm W (RED)** | | **20/40 failed (20/20 logged-out)** | **0/40 failed** |
| deep-link.spec.js loop | | 0/20 runs failed | 0/55 consecutive runs failed (4 passing each) |
| full CI mirror | | (48-07 baseline: 1 of 7 full runs had this failure locally) | rc 0, 11 files, 11 writes, All specs passed! |

After the fix, test 4 in arms S and W shows 0 earlier-window fetch events after `test:start` (before: 103 settles in S, 159 rejects in W), 0 uncaught, 0 unhandled, and `stubThinxApi` ran in 20/20. Arm F's 28 earlier-window events are its own control page's trailing hydrate requests, which settle (the fix does not touch that page).

Arm spec regeneration (step 3): test 3's body changed, so `specs` was moved to `specs-pre` and S and W were regenerated from the committed file. The diff adds the same five lines to test 3 in both. Arm W keeps `delayDashboardReads()` before the visit, and arm F is unchanged:
```
>       // The dashboard's eight reads (logs/build three times: Visits, Header and
>       // Notifications) settle inside this test. A read still in flight when the next
>       // test resets the intercepts is failed by Cypress, and that failure used to end
>       // the logged-out test below (48-08).
>       cy.wait(['@getStats', '@getStatsToday', '@getAuditLog', '@getDevices', '@getProfile', '@getBuildLog', '@getBuildLog', '@getBuildLog']);
```

### Full-suite mirror run (post-full, console 512ddb5)

```
  ✔  admin.spec.js                            104ms        4        -        -        4        -
  ✔  auth-extras.spec.js                      00:12        4        4        -        -        -
  ✔  dashboard.spec.js                        00:12        8        8        -        -        -
  ✔  deep-link.spec.js                        00:07        4        4        -        -        -
  ✔  device-detail.spec.js                    00:16       11       11        -        -        -
  ✔  devices.spec.js                          00:19       12       12        -        -        -
  ✔  history.spec.js                          00:23       15       15        -        -        -
  ✔  login.spec.js                            00:06        8        2        -        6        -
  ✔  oauth-return.spec.js                     00:03        1        1        -        -        -
  ✔  profile.spec.js                          00:12        7        7        -        -        -
  ✔  support-smoke.spec.js                    00:05        3        3        -        -        -
  ✔  All specs passed!                        02:00       77       67        -       10        -
```
rc 0, 11 JUnit files, 11 `[junit-reporter] wrote` lines, no browser-connect retry, no `toFixed`. memory.peak 3726032896 B, oom 0, oom_kill 0. Host load 4.52 before and 5.28 after (the operator's other containers were running).

Verify 4: `PROOF OK arms 3x40 green, deep-link 55/55, full suite 11/11`.

### N = 55 justification, with the measured local rate

CI showed 2 failures in 7 full runs (about 0.29 per run, one-sided 95% lower bound about 0.053). An unchanged rate would give 55 consecutive green runs with probability 0.71^55 (below 1e-8) at the point estimate, and 0.947^55 (about 0.05) at the lower bound. The measured local pre-fix rate was 0/20 in the loop and 0/20 in arm S (95% upper bound about 0.14), so the mirror under-reproduces the natural race. This is the case the plan foresaw: the deterministic arm W carries the causal proof (20/20 before, 0/20 after), and the 55-run series is the regression guard.

## Ship and pipeline

Preflight: `test:unit` rc 0 with `LC_ALL=C` and with the default locale (431 ok, 0 FAIL), build rc 0, `node --test spec/node/CiPipelineGates.test.js` 27/27, `check-ci-gates.js compile` → `CI-GATES COMPILE OK`. `git ls-remote origin refs/heads/main` was `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` before and after the push.

Console push: Task 3 verify 1 OK, `0692f0f..512ddb5 thinx-staging -> thinx-staging`.

Parent range before the push (no rebase needed, origin/thinx-staging was still e13933a3; verify 2 rc 0):
```
24d2b7cd G chore(48): bump console to the logged-out deep-link redirect fix (CI-07, NOTIF-04)
a672a287 G docs(48-08): drop the depends_on edge to halted 48-07 so the gap plan is dispatchable (CI-07)
d1cab2d7 G docs(48-08): plan the root-cause fix for the logged-out deep-link redirect flake (CI-07, NOTIF-04)
2e029924 G docs(48-07): record the halted ci hardening plan (CI-07)
```
Pushed `e13933a3..24d2b7cd` at 2026-10-16T12:29:38Z. Pushed SHA `24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed` (`24d2b7cd`).

Verify 3 (`check-ci-gates.js pipeline --revision 24d2b7cd… --expect legacy-on --wait --timeout-min 60`):
```
pipeline 5677 da6cd4e3-01b2-46cf-b110-7f69ddb14a3d branch=thinx-staging revision=24d2b7c
legacy-console: console-classic-registry (success)
main: test-vue-console (success)
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5677
```
Verify 4:
```
CILOG job 16075 status success retry false crash false wrote 11 allPassed true junit 77 failures 0
```
Verify 5 rc 0. The STATE.md diff check finds two bullets removed and two added, uncommitted at that point.

Production effect: the push rebuilt and rolled out the API (expect the usual short 502 window), the Legacy console (same content) and, for the first time in Phase 48, the Vue console image. The live rollout checks belong to 48-06 Task 2.

## 48-06 resume

As recorded in STATE.md: **48-06 resumes at Task 1 step 8** with `H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed`. Run its verify 4 and 5 with that `H` instead of `git rev-parse HEAD` (the local docs commits above that SHA touch only `.planning/` and ride the next push), run verify 6 against the same SHA, then Task 2. 48-06's pre-push baselines stay in `${TMPDIR}/p48-*` (untouched by this plan).

## Files Created/Modified

- `services/console/vue/src/core/api.js`: `Api.request()` wraps only the `fetch` / `fetchWithCsrf` await. A rejection returns `{ success: false, status: 0, response: null }`, the same shape as the empty-body branch.
- `services/console/vue/tests/unit/close-out-v118.cjs`: `apiWithCookies()` (api.js with the real cookies.js inlined), `fakeResponse()`, and I9 (GET and POST failure envelope, an unchanged success envelope, one csrf re-prime and retry).
- `services/console/vue/cypress/integration/deep-link.spec.js`: test 3 gets one comment and one `cy.wait([...8 aliases])`. Additions only, still 4 tests, and the `#/login` assertion is there exactly once.
- `services/console` gitlink → `512ddb5`.
- `.planning/workstreams/vue-console/STATE.md`: the `[Resolved by 48-08]` bullet replaces the 48-06 and 48-07 blocker bullets, and one `[Phase 48]: 48-08:` decision was added.

## Decisions Made

- I fixed both contributors the verdict names. Either one alone would remove this failure: without the escape there is no unhandled rejection, and without in-flight reads there is no rejection. The app fix also closes the stated `api.js` contract (`store/rsakeys.js:57`) for every caller. The spec fix keeps test 4 from depending on test 3's timing at all.
- `response.text()` stays outside the new guard. The evidence shows rejections at `fetch` only, and the plan asks for the narrowest change. A body-read abort is a residual of the same class, noted below.
- The 48-08 Decisions bullet was written by the plan's scoped edit, not `state.add-decision`, so exactly one `- [Phase 48]: 48-08:` bullet exists (verify 5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] One Cypress `fail` per failing test in the trace**
- **Found during:** Task 1 (harness smoke before the evidence runs)
- **Issue:** A failing test emits two Cypress `fail` events: the hook-phase uncaught exception, then the assertion. Trace verify 2 requires exactly one `fail` record with a probe per failed test.
- **Fix:** Both events are recorded with their probes. In the `after` hook, the one that became the test's reported error stays `fail`, and any other in the same test is relabelled `fail:earlier` (data unchanged). `test:end` also records the error's first line. A fallback adds the last test's `test:end` from mocha, because `test:after:run` for the last test fires after the `after` hook.
- **Files:** `${TMPDIR}/p48-08/specs*/` only (never committed).

**2. [Plan rule] Harness smoke runs outside the evidence labels**
- `smoke` and `smoke2` (2 iterations per arm) validated the trace before `pre-arms`, and `smoke3` (2 deep-link runs) validated the triple alias wait before its commit. They are not part of the proof.
- **smoke3 attempt 1 (security):** I first built that tar from the working tree. It swept in the untracked, git-ignored Legacy `src/cypress/.env.test` (D-05: never read) and `src/node_modules`. Yarn then failed (rc 91) before any test ran. I listed the tar's file names only, never the contents, and then deleted the tarball. The container ran with `--rm`. The redo used `git archive HEAD` plus the one edited spec file. The env file went no further than `${TMPDIR}` and a throwaway container.

**3. [Plan rule] post-arms repeated once after a registry error**
- The first `post-arms` died in `yarn` with "Received malformed response from registry for @typescript-eslint/scope-manager" (rc 91, before Cypress). Its directory was moved to `${TMPDIR}/p48-08/post-arms-attempt1`, and the run was repeated once on the same HEAD: rc 0, arms.rc 0, 120/120.
- The session rate-limit pause came after `post-loop` and `post-full` had finished in one uninterrupted job (11:31Z to 11:54Z). The 55-run series is complete and was not restarted.

**4. [Rule 1 - Bug in planner facts] Eight dashboard reads, not seven**
- G4 counted seven reads with `logs/build` twice. The traces show `logs/build` three times (Visits, Header, Notifications), with the same shape in all 40 S/W iterations, so the wait covers eight aliases.

**5. [Plan context correction] G3c's reading of `undefined`**
- G3c reads `undefined` as an unreadable AUT location. The fail probe shows the location was readable. The `undefined` comes from Cypress's retry bailing on the error stored by the hook-phase uncaught exception.

**6. Commit ledger file**
- The `gsd-plan-head-before` ledger file was not written before the first commit. `plan_head_before` is the parent HEAD at dispatch (`a672a287`, the orchestrator's last commit), and `commits: 1` is measured from it.

---

**Total deviations:** 6 (1 blocking harness fix, 2 plan-rule repeats or smokes, 3 corrections or records). **Impact:** no change to the plan's checks, fix loci or protected lines. The `.env.test` exposure is contained to a deleted local tar.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure (T-48-35, confirmed) | vue/cypress (all specs) | When a `beforeEach` is cut short, unstubbed requests go through the dev-server proxy to `https://console.thinx.cloud`. Seen for csrf-token and session/token in the 20 pre-fix W failures. After the fix the deep-link arms show none. The general hazard (any Cypress hook queue stopped by an uncaught error) remains for other specs: follow-up candidate, not fixed here. |

## Issues Encountered

- Residual, not fixed: `Api.request()` still awaits `response.text()` unguarded, so an abort during a body read could still reject. No trace showed it.
- Residual, not fixed: `Header.vue:123` and `:127` still have no catch. With `Api.request()` no longer rejecting on network failure, they cannot leave this rejection unhandled. Header.vue is outside this plan's paths.
- `requirements.ready-ids` returned 0/2: CI-07 and NOTIF-04 are also declared by 48-06, which has no SUMMARY yet, so neither is marked complete here.

## User Setup Required

None.

## Next Phase Readiness

- 48-06 can resume at Task 1 step 8 against pipeline 5677 / `H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed` (see "48-06 resume").
- The Vue console image was built by `vue-console-registry` in pipeline 5677. Its live rollout check is part of 48-06 Task 2 (skill `swarm-autopull-recovery` if Swarmpit does not pick it up).

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-16*

## Self-Check: PASSED
