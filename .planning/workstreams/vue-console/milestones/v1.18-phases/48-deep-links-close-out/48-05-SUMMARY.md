---
phase: 48-deep-links-close-out
plan: 05
subsystem: testing
tags: [cypress, junit, circleci, console-ci, same-origin, csrf, login-stub, secrets-hygiene, bootstrap-vue, aria-pressed]

requires:
  - phase: 48-01
    provides: cy.visitAppRoute as a plain hard load, deep-link.spec.js (11th spec file), the local Cypress 9.7.0 binary procedure
  - phase: 48-03
    provides: Devices.vue labelled view toggles, platform pills, checkbox-<udid> ids, focusable API-key markers; DeviceDetail.vue Build Firmware in-flight state and device-detail-content column
  - phase: 48-04
    provides: Legacy close-out fixes and src/test/legacy-close-out.cjs, now run by the console test_vue job
provides:
  - "vue/package.json: same-origin `test` and `test:ci` (VUE_APP_API_HOSTNAME= empty) and `cy:test:ci` writing cypress/results/junit-[hash].xml with Cypress's built-in junit reporter (D-01, D-04)"
  - "console .circleci/config.yml test_vue: export NODE_OPTIONS fixed, runs legacy-close-out.cjs and yarn test:ci, stores ./vue/cypress/results"
  - "cy.stubLogin({ success }) in api-stubs.js (POST /api/v2/login as @login); credentials.js with no fixture fallback, liveLoginEnabled() and LIVE_LOGIN_DISABLED (D-02)"
  - "fixtures/thinx.json without the leaked username and the password key"
  - "devices.spec.js for the Phase 44 UI, device-detail.spec.js Build Firmware double click and 1140px column checks, history.spec.js comments (D-06, D-14, D-17, D-18)"
  - "src/cypress/.env.test untracked and ignored, never read (D-05)"
  - "Devices.vue toggles and pills drive aria-pressed through the bootstrap-vue pressed prop (operator-authorized scope exception, option A)"
affects: [48-06]

actuals:
  tokens: 9818
  tasks: 3
  commits: 5
plan_head_before: bff9552c65e85548e1e6cc48b875d056455a8cf0
plan_head_after: 1d68915ecb495f5e3456a1e40147fd68ac195ea5

tech-stack:
  added: []
  patterns:
    - "Cypress specs run same-origin: the dev server gets an empty VUE_APP_API_HOSTNAME so the app calls localhost:3000/api/v2 and the stubs, XSRF cookie and page share one origin"
    - "A real-API Cypress case runs only behind CYPRESS_LIVE_LOGIN=1 plus explicit CYPRESS_THINX_TEST_* credentials; CI logs in through cy.stubLogin()"
    - "Template-level unit harnesses that render b-button as a plain element mirror BButton's own aria-pressed rule in attrsOf"
    - "bootstrap-vue toggle buttons take :pressed (boolean), never :aria-pressed, which BButton overwrites"

key-files:
  created: []
  modified:
    - services/console/vue/package.json
    - services/console/vue/.gitignore
    - services/console/.circleci/config.yml
    - services/console/.gitignore
    - services/console/vue/cypress/integration/oauth-return.spec.js
    - services/console/vue/cypress/integration/login.spec.js
    - services/console/vue/cypress/integration/devices.spec.js
    - services/console/vue/cypress/integration/device-detail.spec.js
    - services/console/vue/cypress/integration/history.spec.js
    - services/console/vue/cypress/support/credentials.js
    - services/console/vue/cypress/support/api-stubs.js
    - services/console/vue/cypress/fixtures/thinx.json
    - services/console/vue/src/pages/Devices/Devices.vue
    - services/console/vue/tests/unit/close-out-v118.cjs
    - services/console/vue/tests/unit/device-list-parity.cjs
    - services/console/src/cypress/.env.test (removed from the index only)

key-decisions:
  - "Operator option A: bind :pressed on the Devices.vue view toggles and platform pills instead of :aria-pressed, because bootstrap-vue 2.21.2 BButton renders aria-pressed only from a boolean pressed prop and overwrites a passed-through one; a scoped exception to the plan's no-app-source rule"
  - "The two unit harnesses mirror BButton in attrsOf (aria-pressed = String(pressed) for a boolean pressed, absent otherwise, passed-through value dropped) instead of registering a component stub, so the b-button tag checks and vnode walkers stay unchanged; no assertion was changed"
  - "admin.spec.js keeps its own admin-credential gate and is not tied to CYPRESS_LIVE_LOGIN (D-02 names login.spec.js only)"

patterns-established:
  - "Cypress JUnit results live in vue/cypress/results (git-ignored), one junit-<hash>.xml per spec file"

requirements-completed: [CI-07, POL-01, FIX-01]

coverage:
  - id: D1
    description: "Same-origin Cypress runs with one JUnit file per spec, stored by the console test_vue job (CI-07, D-01, D-04)"
    requirement: CI-07
    verification:
      - kind: e2e
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run test:ci (11 JUnit files, no <failure)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI login is stubbed; the real-API login is opt-in; the leaked fixture account is gone from the Vue Cypress support (CI-07, D-02)"
    requirement: CI-07
    verification:
      - kind: e2e
        ref: "cypress/integration/login.spec.js (2 passing, 6 pending by design)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Device specs match the Phase 44 and 48 UI, incl. aria-pressed on toggles and pills, Build Firmware double click and the 1140px column (D-06, D-14, D-17, D-18)"
    requirement: POL-01
    verification:
      - kind: e2e
        ref: "cypress/integration/devices.spec.js (12/12), device-detail.spec.js (11/11)"
        status: pass
      - kind: unit
        ref: "npm --prefix services/console/vue run test:unit (422 ok, 0 not ok, with and without LC_ALL=C)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pressed toggle and pill look: bootstrap-vue toggle mode adds .active (btn-light background f8f9fa -> dae0e5, inset shadow)"
    verification: []
    human_judgment: true
    rationale: "Visual side effect of the option A fix; contrast is computed (9.79:1) but the look on the dark theme needs an operator's eye"
  - id: D5
    description: "Legacy src/cypress/.env.test untracked and ignored; whether it held a live credential is unknown (D-05, FIX-01)"
    requirement: FIX-01
    verification:
      - kind: other
        ref: "git -C services/console ls-files -- src/cypress (no env.test); status --ignored lists it as !!"
        status: pass
    human_judgment: true
    rationale: "Only the operator may inspect the file (secret-file guard) and decide on rotation"

duration: 2h 0m
completed: 2026-10-15
status: complete
---

# Phase 48 Plan 05: Vue Cypress Suite Green and Gate-Ready Summary

**The Vue Cypress suite runs same-origin against stubs with a stubbed CI login and JUnit output: 11 spec files, 77 tests, 0 failing. The device specs check the Phase 44/48 UI. The leaked fixture account and the tracked Legacy env file are out of the suite and the index. Devices.vue now sets aria-pressed through bootstrap-vue's `pressed` prop.**

## Performance

- **Duration:** about 2h 0m wall clock, including the decision checkpoint and one 40-minute Cypress run on a heavily loaded laptop (load average 40-63)
- **Started:** 2026-10-15T15:41:09Z
- **Completed:** 2026-10-15T17:41:00Z
- **Tasks:** 3 (Task 3 resumed after the decision checkpoint)
- **Files modified:** 16 in services/console (incl. the env file removed from the index)

## Accomplishments

- `test` / `test:ci` start the dev server with an empty `VUE_APP_API_HOSTNAME`, so the app, the stubs and the XSRF cookie share `http://localhost:3000`. `oauth-return.spec.js` now asserts that the login went to `http://localhost:3000/api/v2/login`, and `ensureCsrfToken` is unchanged.
- `cy:test:ci` writes one `cypress/results/junit-<hash>.xml` per spec with Cypress 9.7.0's built-in junit reporter. No dependency was added. The console `test_vue` job runs `legacy-close-out.cjs` and `yarn test:ci`, stores `./vue/cypress/results`, and has its `export NODE_OPTIONS` typo fixed.
- CI now logs in through the form against `cy.stubLogin()`. The real-API case runs only with `CYPRESS_LIVE_LOGIN=1` and explicit credentials. `credentials.js` no longer imports the fixture, and `fixtures/thinx.json` lost `username` and `password`.
- `devices.spec.js` checks the platform pills, platform filtering, the label sort with unknown last, the labelled toggles with `aria-pressed`, `checkbox-<udid>` ids and the API-key marker tooltip on keyboard focus. `device-detail.spec.js` checks the Build Firmware double click (one request), the 1140px column and the Phase 47 `@getBuildDetail.all` assertions.
- The tracked `src/cypress/.env.test` is out of the index and ignored. It was never opened or printed.
- Option A fix: the three Devices.vue toggles and pills now render `aria-pressed` in the real DOM. Before, BButton dropped the value that was bound directly.

## Run Table (final full `test:ci`, 2026-10-15, after the option A fix)

```
       Spec                                              Tests  Passing  Failing  Pending  Skipped
  ✔  admin.spec.js                            352ms        4        -        -        4        -
  ✔  auth-extras.spec.js                      00:51        4        4        -        -        -
  ✔  dashboard.spec.js                        31:03        8        8        -        -        -
  ✔  deep-link.spec.js                        00:39        4        4        -        -        -
  ✔  device-detail.spec.js                    01:23       11       11        -        -        -
  ✔  devices.spec.js                          01:44       12       12        -        -        -
  ✔  history.spec.js                          01:59       15       15        -        -        -
  ✔  login.spec.js                            00:29        8        2        -        6        -
  ✔  oauth-return.spec.js                     00:13        1        1        -        -        -
  ✔  profile.spec.js                          00:55        7        7        -        -        -
  ✔  support-smoke.spec.js                    00:28        3        3        -        -        -
  ✔  All specs passed!                        39:49       77       67        -       10        -
```

- The `npm run test:ci` exit code was 0. There are 11 JUnit files and `grep -l '<failure'` matched none: `junit-0f02de87…`, `junit-13e94305…`, `junit-2c25c989…`, `junit-3a653798…`, `junit-66b0e398…`, `junit-6bcef279…`, `junit-870c6568…`, `junit-8cc5bf77…`, `junit-c18cbe74…`, `junit-d510679c…`, `junit-f3de0f15…`.
- Pending tests appear only where they are skipped by design: admin.spec.js (4, no admin credentials) and login.spec.js (6: the live case, the four register/reset/privacy/TOS tests and the existing `xit`).
- dashboard.spec.js took 31:03 here and 00:17 in the earlier run (t3.log). It passed 8/8 both times. The difference is laptop load (load average 40-63 during the run, with ffmpeg video compression competing), not a test change.
- Earlier runs: Task 2 `login.spec.js` + `oauth-return.spec.js` gave 9 tests, 3 passing, 6 pending, 0 failing. The first full Task 3 run before the fix gave 77 tests, 64 passing and 3 failing, all in devices.spec.js on `aria-pressed`. The diagnosis run with the swap applied gave devices.spec.js 12/12.
- Unit: `LC_ALL=C npm --prefix services/console/vue run test:unit` and the same command without `LC_ALL` both exit 0 with 422 `ok` and 0 `not ok`. The four checks that were red with the swap alone are green: L1 view toggles, platform pills, clicking the Arduino pill, and reload falls back to All.

## Task Commits

All are in the `services/console` submodule on `thinx-staging`, signed (`%G?` = G), and not pushed:

1. **Task 1 (tracer): same-origin Cypress + JUnit**: `a076889` (ci)
2. **Task 2: stubbed CI login, live login opt-in, no fixture fallback**: `16198ef` (test)
3. **Task 3a: device specs for the Phase 44/48 UI**: `4b867f6` (test)
4. **Task 3b: untrack the Legacy Cypress env file (D-05)**: `44a9db6` (chore)
5. **Task 3 fix (operator option A): aria-pressed through the bv pressed prop**: `1d68915` (fix)

**Plan metadata:** the parent repo docs commit for this SUMMARY and deferred-items.md (see the final commit).

## Files Created/Modified

- `vue/package.json`: `test`, `cy:test:ci`, `test:ci` per the interface contract
- `vue/.gitignore`: `cypress/results`
- `.circleci/config.yml`: test_vue runs `legacy-close-out.cjs` and `yarn test:ci` and stores `./vue/cypress/results`
- `vue/cypress/integration/oauth-return.spec.js`: same-origin login URL assertion
- `vue/cypress/support/credentials.js`: no fixture fallback, `liveLoginEnabled`, `LIVE_LOGIN_DISABLED`
- `vue/cypress/support/api-stubs.js`: `cy.stubLogin()` plus the device stubs the new specs need
- `vue/cypress/fixtures/thinx.json`: `username` and `password` keys deleted
- `vue/cypress/integration/login.spec.js`: CI (stubbed), live (opt-in), and skipped-by-design describes
- `vue/cypress/integration/devices.spec.js`: Phase 44 UI assertions
- `vue/cypress/integration/device-detail.spec.js`: Build Firmware double click, 1140px column, hard-load comments
- `vue/cypress/integration/history.spec.js`: comment-only changes. Four comments that described the dashboard hop now describe the plain hard load. No wait, count or assertion changed.
- `.gitignore` (console): `src/cypress/.env.test`
- `src/cypress/.env.test`: removed from the index (`git rm --cached`); the local file is untouched and was not read
- `vue/src/pages/Devices/Devices.vue`: three `:aria-pressed="String(x)"` bindings changed to `:pressed="x"`
- `vue/tests/unit/close-out-v118.cjs`, `vue/tests/unit/device-list-parity.cjs`: `attrsOf` mirrors BButton's aria-pressed rule for `b-button`

## Decisions Made

See `key-decisions` in the frontmatter. The harness change was made in `attrsOf` and not as a registered component stub. A registered stub would turn `b-button` into a component vnode, which breaks the existing `n.tag === 'b-button'` filters and the vnode walkers. Changing `attrsOf` keeps every existing assertion untouched.

## Deviations from Plan

### Operator-authorized scope exception

**1. [Rule 4 - checkpoint, operator option A] Devices.vue aria-pressed through bootstrap-vue `pressed`**
- **Found during:** Task 3 (full suite green gate)
- **Issue:** devices.spec.js DEVI-01 pills, DEVI-01 filter and DEVI-04 toggles failed with `expected <button.btn.btn-light.btn-sm> to have attribute 'aria-pressed'`. bootstrap-vue 2.21.2 `BButton` (`button.js` `computeAttrs`) sets `aria-pressed` only in toggle mode, from a boolean `pressed` prop, and otherwise writes `null` over a passed-through `aria-pressed`. The 48-03 bindings never reached the DOM. The unit harnesses render `b-button` as a plain element, so they saw the template attrs and could not catch it.
- **Fix:** the plan prohibits changing Vue app source. The operator chose option A and explicitly authorized an exception limited to: the three Devices.vue bindings changed to `:pressed="x"`; and `attrsOf` in close-out-v118.cjs and device-list-parity.cjs mapping `pressed` to `aria-pressed` the way BButton does (`String(pressed)` for a boolean, absent otherwise). No assertion was loosened. No other vue/src file was changed.
- **Side effect:** toggle mode adds `.active` to the pressed button. In the built CSS, the pressed `btn-light` background goes from `#f8f9fa` to `#dae0e5` (border `#d3d9df`, inset shadow). Text `#29323a` on it is 9.79:1 (was 12.36:1). The inactive `outline-light` buttons are unchanged. A visual check is queued for UAT below.
- **Files modified:** vue/src/pages/Devices/Devices.vue, vue/tests/unit/close-out-v118.cjs, vue/tests/unit/device-list-parity.cjs
- **Verification:** devices.spec.js 12/12 in the full run, unit 422 ok / 0 not ok in both locales
- **Committed in:** `1d68915`

**2. [Consequence of 1] Task 3 acceptance criterion `git diff --name-only HEAD~3 HEAD` no longer holds verbatim**
- That check assumed Task 3's commits were the last three. HEAD is now the authorized fix commit, which touches vue/src and vue/tests/unit. Checked instead:
  - `git diff --name-only 4b867f6~1 44a9db6` lists only Cypress files, the ignore file and the env file (T3-COMMITS-CYPRESS-ONLY).
  - `HEAD~1..HEAD` lists exactly the three authorized files.
  - `git status --porcelain -- vue src` is empty.

**3. [Rule 1 - Hygiene] Fix commit message amended once (unpushed)**
- The first message body contained `#dae0e5`. The plan forbids `#` in commit messages, and commitlint parsed it as an issue reference (footer-leading-blank warning). I amended the message before any push, signed. The code is unchanged.

---

**Total deviations:** 1 operator-authorized scope exception (with one acceptance-check consequence) and 1 message-only amend.
**Impact on plan:** The fix is a real accessibility bug fix: the pressed state was never exposed to assistive technology. It is contained to three bindings and two test harness helpers.

## Issues Encountered

- The full run took 39:49, mostly dashboard.spec.js (31:03) and ffmpeg video compression on a laptop with load average 40-63. All tests passed. CI timing is unaffected.
- The deferred item from 48-01 (stale dashboard-hop comments in history.spec.js and device-detail.spec.js) was resolved by `4b867f6` and is marked resolved in deferred-items.md.

## User Setup Required

None. No external service configuration is required.

## Operator UAT Items (for the 48-06 list)

1. **Legacy Cypress env file (D-05, FIX-01, T-48-18).** Inspect `services/console/src/cypress/.env.test` privately. Do not paste values into any session. This prints names and value lengths only: `awk -F= 'NF { v = substr($0, index($0, "=") + 1); print $1, length(v) }' services/console/src/cypress/.env.test`. If any value is a real credential (for example a live account password), rotate it. Record "no real credential" or "rotated <what>". A history rewrite stays out of scope (D-05). The file is now untracked and ignored, but earlier commits still contain it.
2. **Device list toggles and pills look (option A side effect).** On `#/app/devices`, hard-reload and check how the pressed List/Grid toggle and the active platform pill look. bootstrap-vue now adds `.active`, which gives a slightly darker `btn-light` (`#dae0e5`) with an inset shadow. Confirm it reads as "selected" on the dark theme and that the inactive outline buttons are unchanged. A screen reader or devtools should show `aria-pressed="true"` on the active button and `"false"` on the others.

## Next Phase Readiness

- 48-06 can bump the `services/console` gitlink to `1d68915` and push. The parent `test-vue-console` gate (48-02) runs exactly `yarn test:ci`, which is green locally.
- No blockers. The console commits are signed and unpushed. The parent gitlink is modified and intentionally left uncommitted for 48-06.

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Files: vue/package.json, cypress/support/api-stubs.js, cypress/support/credentials.js, .circleci/config.yml, this SUMMARY: all FOUND
- Console commits a076889, 16198ef, 4b867f6, 44a9db6, 1d68915: all ancestors of HEAD, all signed (G)
- Contract markers: test:ci, stubLogin, liveLoginEnabled, cypress/results present
