---
phase: 26-vue-console-log-paging
plan: 09
subsystem: testing
status: complete
tags: [vue, console, cypress, e2e, test-harness, paging]

requires:
  - phase: 26-vue-console-log-paging
    provides: "plan 26-05 History paging UI (data-cy hooks audit|build-paging, -load-more, -filter-hint, -load-more-error, -paging-status; plain <button> Load more) and plan 26-02 response shape {success, response, paging:{limit, has_more, next_cursor}}"
provides:
  - "cypress/support/session.js: visitApp stubs POST /api/v2/session/token (alias @sessionToken) before cy.visit; new cy.visitAppRoute(route, options) enters via the dashboard and navigates in-app by hash"
  - "Four synthetic two-page fixtures: audit-log-page1/2.json, build-log-page1/2.json (nested build shape)"
  - "history.spec.js 'paging (LOG-03/LOG-04)': 10 browser tests for UI-SPEC assertions 1-7 against cursor-branching stubs"
  - "dashboard.spec.js, device-detail.spec.js and history.spec.js green locally again (30/30)"
affects: [26-07 push 2 (re-runs these three specs before Push 2, ships the submodule commits), App.vue deep-link follow-up]

actuals:
  tokens: 6646
  tasks: 2
  commits: 2
commits_repo: "services/console (submodule, thinx-staging, unpushed); the parent repo has no code commits for this plan"
plan_head_before: 1cc68972abdd90470dbddb143a69f4b96c98205c
plan_head_after: 3e775252e61f486ab4cabd88cc33f50abb9a9ac0
parent_plan_head_before: f14af92a5038e79fc685fab1de1ff23f7c3aa8e1

tech-stack:
  added: []
  patterns:
    - "Stubbed session = stubbed token exchange: the console keeps tokens in memory only, so a Cypress session is an intercept on POST /api/v2/session/token registered before cy.visit, not a storage seed"
    - "In-app route entry: cy.visitAppRoute loads the dashboard, waits for its title, then sets location.hash, so specs reach deep routes despite the App.vue post-hydrate redirect"
    - "Paged-intercept request checks read `@alias.all` and filter on the cursor query parameter, because cy.wait('@alias') yields the oldest unwaited request and the dashboard has already sent first-page requests"

key-files:
  created:
    - services/console/vue/cypress/fixtures/api/audit-log-page1.json
    - services/console/vue/cypress/fixtures/api/audit-log-page2.json
    - services/console/vue/cypress/fixtures/api/build-log-page1.json
    - services/console/vue/cypress/fixtures/api/build-log-page2.json
  modified:
    - services/console/vue/cypress/support/session.js
    - services/console/vue/cypress/integration/device-detail.spec.js
    - services/console/vue/cypress/integration/history.spec.js

key-decisions:
  - "visitApp no longer writes the forged token to sessionStorage: the app scrubs those keys on hydrate and reads tokens from the session-token exchange only. Legacy keys are still cleared on every visit"
  - "The Load more request is asserted from `@getAuditLogPaged.all` filtered by cursor, not from cy.wait('@getAuditLogPaged'), which would yield the dashboard's first-page request"
  - "UI-SPEC assertion 7 also gets a paged-stub dashboard test in history.spec.js (cards show page 1 only, no load-more / filter-hint / paging-status hook, no cursor request), in addition to dashboard.spec.js staying green"
  - "App.vue / store/auth.js left untouched; the deep-link redirect is a recorded follow-up"

patterns-established:
  - "Enter any non-dashboard /app route in a stubbed spec with cy.visitAppRoute; assert on the target page's rendered rows, not on cy.wait aliases the dashboard may satisfy"

requirements-completed: [LOG-03, LOG-04]

coverage:
  - id: D1
    description: "Cypress harness repaired: a stubbed session survives auth/hydrateSession and reaches the app; visitAppRoute reaches /app/devices and /app/device/<udid>; dashboard and device-detail specs green"
    requirement: LOG-03
    verification:
      - kind: e2e
        ref: "start-server-and-test ... cypress run --spec dashboard.spec.js,device-detail.spec.js (8 + 7 passing, CYPRESS-DASH-DEVICE-GREEN)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Browser proof of History paging UI-SPEC assertions 1-6: legacy fixtures show no Load more; Load more sends limit=100 + page-1 cursor and appends; tables page independently; filter hint only with has_more and an active filter, no request on filter change; no-match keeps Load more; 500 keeps rows and button, retry appends"
    requirement: LOG-03
    verification:
      - kind: e2e
        ref: "cypress/integration/history.spec.js#paging (LOG-03/LOG-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "UI-SPEC assertion 7: dashboard cards stay on the first page with no paging controls, with both legacy and paged stubs"
    requirement: LOG-04
    verification:
      - kind: e2e
        ref: "cypress/integration/dashboard.spec.js (8 passing)"
        status: pass
      - kind: e2e
        ref: "cypress/integration/history.spec.js#Should keep the dashboard cards to the first page with no paging controls (UI-SPEC 7)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-01
---

# Phase 26 Plan 09: Cypress harness repair and History paging browser specs Summary

**The local Cypress harness works again: a stubbed `POST /api/v2/session/token` lets a forged session survive hydrate, and `cy.visitAppRoute` gets past the App.vue deep-link redirect. With that in place, ten new browser tests prove the History paging UI (UI-SPEC assertions 1–7) against cursor-branching two-page stubs. history, dashboard and device-detail specs run 30/30 green.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-01T15:52:11Z
- **Completed:** 2026-10-01T16:00:38Z
- **Tasks:** 2 (tracer + 1 expansion)
- **Files modified:** 7 (4 created, 3 modified), all in the `services/console` submodule

## Accomplishments

- `visitApp({session})` registers `POST /api/v2/session/token` → `{success:true, response:<forged token>}` (alias `@sessionToken`) before `cy.visit`. Since the console keeps tokens in memory only, this is the whole session; the old sessionStorage seed is gone and the header comment describes the memory-only flow.
- `cy.visitAppRoute(route, options)` loads `/#/app/dashboard`, waits for the "Dashboard" title, then sets `location.hash`. device-detail.spec.js and history.spec.js use it for every non-dashboard entry.
- dashboard.spec.js went from 0/8 to 8/8 and device-detail.spec.js from failing to 7/7, with no app code change.
- Four synthetic fixtures: audit page 1 (3 entries, 2026-09-20..22, info/warning/danger, `next_cursor: "audit-cursor-2"`), audit page 2 (2 entries in 2026-08, last page), build page 1 (2 nested builds, `next_cursor: "build-cursor-2"`), build page 2 (1 build, last page).
- history.spec.js keeps HIST-01..05 and adds `describe('paging (LOG-03/LOG-04)')` with 10 tests:
  1. Legacy fixtures: paging wrappers exist, no Load more on either table.
  2. Paged stubs on the dashboard: 3 audit / 2 build rows, no `*load-more`, `*filter-hint` or `*paging-status` hook, no cursor request (assertion 7).
  3. Audit Load more: first-page requests carry `limit=100` and no cursor. The click sends `limit=100&cursor=audit-cursor-2`, rows go 3 → 5, the button disappears, and the status reads "Loaded 2 more entries. All 5 entries loaded."
  4. Build Load more: same with `build-cursor-2`, 2 → 3 rows, "Loaded 1 more entry. All 3 entries loaded."
  5. Independence, builds first then audit: each table's rows, button, status and cursor requests stay unchanged while the other pages.
  6. Independence, audit only: the build button stays and no build cursor request goes out.
  7. Filter hint: a date filter and then a flag filter each show "Filtering 3 loaded entries; older entries exist.", and clearing hides it. The paged audit intercept's call count is the same before and after (D-05/D-06).
  8. With `has_more` false and a filter set: no hint.
  9. A no-match date filter shows "No loaded entries match these filters." and Load more stays visible, with the hint.
  10. Page 2 answers 500 once: the `role="alert"` error line appears, the 3 rows and the enabled button stay, and the status stays empty. The retry appends to 5 rows, clears the error and hides the button. Both cursor requests carry `audit-cursor-2`.

## Task Commits

Both commits are in the `services/console` submodule on `thinx-staging`, GPG-signed (`%G?` = `G`), and not pushed:

1. **Task 1 (tracer): Cypress harness repaired end to end**: `9b0cae8` test(vue): add Cypress session-token stub and in-app route entry (phase 26)
2. **Task 2: paged fixtures and History paging spec**: `3e77525` test(vue): add History paging Cypress coverage with two-page stubs (phase 26)

The parent repo has no code commits for this plan. Its `services/console` gitlink is not bumped or staged; plan 26-07 owns the bump and both pushes.

## Files Created/Modified

- `services/console/vue/cypress/support/session.js`: memory-only header comment, the session-token intercept in `visitApp`, the new `visitAppRoute` command.
- `services/console/vue/cypress/integration/device-detail.spec.js`: both entries go through `visitAppRoute`, keeping the `onBeforeLoad` console.error stub and every assertion.
- `services/console/vue/cypress/integration/history.spec.js`: HIST-01 and the `once loaded` beforeEach go through `visitAppRoute`, and the beforeEach now waits for History's own 4 rows. Plus the paging describe.
- `services/console/vue/cypress/fixtures/api/{audit,build}-log-page{1,2}.json` (new).

## Verification

- `PAGED-FIXTURES-OK` (plan's node check over the four fixtures).
- `CYPRESS-DASH-DEVICE-GREEN`: dashboard 8 passing, device-detail 7 passing. It was run before the Task 1 commit and again on the committed code as the tracer feedback gate (interactive run, `end-of-phase`, automated-only `<verify>`, so no checkpoint).
- `CYPRESS-HISTORY-PAGING-GREEN`: history 15 passing, dashboard 8, device-detail 7, "All specs passed!" 30/30, exit 0.
- `grep -c "paging (LOG-03/LOG-04)" history.spec.js` = 1.
- `git -C services/console diff origin/thinx-staging --stat -- vue/src/App.vue vue/src/store/auth.js` is empty: the app's auth bootstrap is untouched.
- `git -C services/console status --short` is empty, and both new commits show `G`.
- Only the three stubbed specs ran, each through `start-server-and-test` on the local dev server (:3000). login.spec.js and the full suite never ran. Port 3000 is free afterwards, so no dev server or Cypress process was left running.
- No proxy errors in the run logs. Every `/api/v2/` call is answered by `stubThinxApi()`'s catch-all, by a named stub, or by the paged/session intercepts.

## Follow-up: App.vue deep-link redirect after hydrate (pre-existing, not fixed here)

Evidence from planning time (2026-10-01), confirmed again by this plan's runs:

- **(a) Session-token exchange unstubbed.** Since the console commit "keep session tokens out of browser storage", `auth/hydrateSession` exchanges the session cookie through `POST /api/v2/session/token`. The stubs did not cover it (the catch-all answers 500), so `visitApp({session:true})` landed on /login. That caused 7 failing and 13 skipped tests across history/dashboard/device-detail. **Fixed in the harness** (Task 1). This was a test gap, not an app bug.
- **(b) The deep link is lost after hydrate.** In `src/App.vue#created`, `currentPath = this.$router.history.current.path` is read before the initial navigation has confirmed. It reads `/`, so after `hydrateSession` the app does `pushIfNeeded("/app/dashboard")`, and a hard load of `/#/app/history` (or `/#/app/device/<udid>`) lands on the dashboard. A planning-time probe that visited the dashboard and then set `window.location.hash = '#/app/history'` loaded History with every stub hit. That is the workaround in `visitAppRoute`. **This is a real user-facing bug**: a bookmarked or shared deep link opens the dashboard. It is outside phase 26 and is deliberately left unchanged (plan prohibition). A suggested fix for a later phase: wait for `this.$router.onReady` before reading the current route (or read `window.location.hash`), then add a direct-deep-link Cypress test and drop `visitAppRoute` from the specs.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned `cy.wait('@getAuditLogPaged')` would have asserted the wrong request**
- **Found during:** Task 2
- **Issue:** `cy.wait('@alias')` yields the oldest request not yet waited on. `visitAppRoute` passes through the dashboard, which (along with History's own first load) has already sent first-page requests to the same intercept. So `cy.wait('@getAuditLogPaged').its('request.url')` after the click would yield a first-page URL with no cursor.
- **Fix:** A `cursorCalls(alias)` helper reads `@alias.all` and keeps the requests that carry a `cursor`. Each Load more test asserts exactly the expected number of cursor requests, each with `limit=100` and the page-1 `next_cursor`. It runs after the appended rows render, so the request is already recorded. The first-page requests are checked separately: `limit=100`, no cursor.
- **Files modified:** history.spec.js
- **Commit:** 3e77525

**2. [Rule 2 - Correctness] The `once loaded` beforeEach waits for History's rows**
- **Found during:** Task 2
- **Issue:** Its `cy.wait(['@getAuditLog', '@getBuildLog'])` can be satisfied by the dashboard's requests, so a test could start before History had mounted.
- **Fix:** The beforeEach now also asserts the History title and the 4 audit rows. device-detail.spec.js gets a comment explaining the same thing; its assertions already retry on the detail page.
- **Commits:** 9b0cae8, 3e77525

**3. Extra coverage beyond the plan list**
- A paged-stub dashboard test for assertion 7 (the plan only relied on dashboard.spec.js staying green with legacy stubs).
- A separate build-table Load more test, and a two-direction independence test.

**4. Commit subjects**
- commitlint (`subject-case`) rejected a subject starting with "Cypress". Both subjects are prefixed with "add", as 26-05 did: `test(vue): add Cypress session-token stub …` and `test(vue): add History paging Cypress coverage …`.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 correctness) plus coverage and process notes. **Impact:** all test-only; no app code changed, no scope creep.

## Issues Encountered

- A read of the console's `.env` (to confirm the local API host) was blocked by the secret-read guard hook. It was not retried another way. Leak-freedom was instead shown from `vue.config.js`, whose only proxy target is `https://console.thinx.cloud` for unknown paths, from the `/api/v2/` catch-all, and from run logs with no proxy errors.
- The 10-row cap on the dashboard cards is not exercised: page-1 fixtures have 3 and 2 entries, and the legacy ones 4 and 3, so "at most 10" holds trivially. The cap itself was unchanged by 26-05.

## Known Stubs

None. The fixtures are test data by design and use only synthetic identifiers (`udid-k1`, `paged-build-1`, `audit-cursor-2`, …).

## Threat Flags

None. T-26-42 is mitigated: every run named exactly the three stubbed specs, the paged and session intercepts are registered after `stubThinxApi()`'s catch-all, and the fixtures hold no production ids, emails or tokens. T-26-26 is accepted: the session-token stub exists only in `cypress/support`.

## Next Phase Readiness

- Plan 26-07 can re-run `npx start-server-and-test 'npm run serve' http://127.0.0.1:3000/ 'npx cypress run --spec cypress/integration/history.spec.js,cypress/integration/dashboard.spec.js,cypress/integration/device-detail.spec.js'` from `services/console/vue` (about 1 minute) and show it at the Push 2 decision. It then bumps the parent gitlink to `3e77525` (or later) and pushes.
- Other stub-backed specs that hard-load a deep `/app/*` route (devices, profile, admin, auth-extras) were not run here. They probably need `visitAppRoute` for the same reason (b). That is outside this plan.

## Self-Check: PASSED

- FOUND: vue/cypress/support/session.js (contains `visitAppRoute`, `session/token`), vue/cypress/integration/history.spec.js (contains `paging (LOG-03/LOG-04)`), vue/cypress/integration/device-detail.spec.js, vue/cypress/fixtures/api/audit-log-page1.json (`audit-cursor-2`), audit-log-page2.json, build-log-page1.json (`build-cursor-2`), build-log-page2.json
- FOUND commits (submodule): 9b0cae8, 3e77525, both `G`; `git -C services/console status --short` empty.
