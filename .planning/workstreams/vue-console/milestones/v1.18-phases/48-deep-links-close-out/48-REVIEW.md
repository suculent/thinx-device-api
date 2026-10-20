---
phase: 48-deep-links-close-out
reviewed: 2026-10-16T15:10:02Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - .circleci/config.yml
  - scripts/check-ci-gates.js
  - spec/node/CiPipelineGates.test.js
  - services/console/.circleci/config.yml
  - services/console/.gitignore
  - services/console/src/app/js/controllers/DeploykeyController.js
  - services/console/src/app/js/controllers/DevicesController.js
  - services/console/src/app/js/controllers/LogviewController.js
  - services/console/src/app/js/thinx-api.js
  - services/console/src/test/deploykey.cjs
  - services/console/src/test/legacy-close-out.cjs
  - services/console/vue/.gitignore
  - services/console/vue/cypress.json
  - services/console/vue/cypress/fixtures/thinx.json
  - services/console/vue/cypress/integration/deep-link.spec.js
  - services/console/vue/cypress/integration/device-detail.spec.js
  - services/console/vue/cypress/integration/devices.spec.js
  - services/console/vue/cypress/integration/history.spec.js
  - services/console/vue/cypress/integration/login.spec.js
  - services/console/vue/cypress/integration/oauth-return.spec.js
  - services/console/vue/cypress/reporters/junit.js
  - services/console/vue/cypress/support/api-stubs.js
  - services/console/vue/cypress/support/credentials.js
  - services/console/vue/cypress/support/index.ts
  - services/console/vue/cypress/support/session.js
  - services/console/vue/package.json
  - services/console/vue/src/App.vue
  - services/console/vue/src/components/Header/Header.scss
  - services/console/vue/src/components/Header/Header.vue
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/src/pages/Devices/Devices.vue
  - services/console/vue/src/Routes.js
  - services/console/vue/src/store/auth.js
  - services/console/vue/src/styles/_device-detail.scss
  - services/console/vue/src/styles/_overrides.scss
  - services/console/vue/src/styles/_platforms.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/src/utils/platforms.js
  - services/console/vue/tests/unit/close-out-v118.cjs
  - services/console/vue/tests/unit/cypress-junit-reporter.cjs
  - services/console/vue/tests/unit/device-list-parity.cjs
findings:
  critical: 1
  warning: 4
  info: 7
  total: 12
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-10-16T15:10:02Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Scope: the phase 48 diffs, which are `git -C services/console diff 54734af..512ddb5` plus the parent commits
8e3d636b and 4ba6c5e9 (`.circleci/config.yml`, `scripts/check-ci-gates.js`,
`spec/node/CiPipelineGates.test.js`). The six `vue/src/store/*.js` `|| []` one-liners were checked as part of
the api.js change. `src/cypress/.env.test` and every other `.env*` file were not opened, as instructed.

What holds up:
- The NOTIF-04 fix (`App.vue` waits for `router.onReady`) is correct for vue-router 3.5. An initial redirect from
  START does not fire the error callback, and the redirect target fires `onReady`. The `/oauth-return` force-prime
  still shares the single in-flight prime with `OAuthReturn.vue`.
- The CI gate wiring (test-vue-console filters as the union of the dependants' filters, plus the
  `--expect legacy-on` default) is consistent and covered offline.
- The Legacy deploy-key, Logview socket-ordering and goal changes behave as described.
- The JUnit reporter cannot throw into Cypress.

Key concerns:
- The 48-08 "resolve a failed fetch" change in `core/api.js` removes the only signal that callers used to tell a
  network outage apart from "no data". The Devices page now shows an empty fleet during an outage instead of its
  load-error alert (CR-01).
- The same change is incomplete: a body-read abort still rejects (WR-01).
- The restored Legacy image is published without the Legacy unit tests gating it (WR-02).
- The console repo's `test_vue` job still carries the `sonarcloud` credential context while running unpinned
  lifecycle scripts (WR-03).
- The Legacy failed-build toast still reads the non-existent `status` field (WR-04).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A network failure now resolves as an empty success-less reply, so outages render as empty data with no error

**File:** `services/console/vue/src/core/api.js:102-115` (affects `services/console/vue/src/pages/Devices/Devices.vue:563-578`, `services/console/vue/src/pages/PasswordReset/PasswordReset.vue:146-148,187-189`, `services/console/vue/src/pages/AdminUsers/AdminUsers.vue:75-79`)

**Issue:** Before 09fbde1, a `fetch` rejection (offline, DNS failure, connection refused, CORS failure) propagated
out of `Api.request()`. The page-level `catch` blocks were the only places that turned it into a user-visible error.
`request()` now returns `{ success: false, status: 0, response: null }` instead, and the store actions swallow a
non-success reply. For example, `devices/fetchItems` only commits on `result.success` and returns the old
`state.items`. The results:

- `Devices.vue loadData()`: the code says "A failed load shows a message in the danger alert". Now
  `Promise.all([fetchItems(), fetchEnviros(), builds])` resolves, `this.items = this.getItems()` is `[]` on a cold
  load, and `LOAD_ERROR` is never set. An outage looks exactly like an account with no devices.
- `AdminUsers.vue created()`: the 'Failed to load users.' catch can no longer fire for a network failure, so the page
  shows an empty user list.
- `PasswordReset.vue submitInitiate()/submitConfirm()`: the "Network error. Please try again." branch is dead. A
  network failure now shows "Could not initiate reset." or "Could not set password.", which tells the user that
  the server refused.

The change was made to stop unhandled rejections at a Cypress test boundary (48-08). That is a test-harness
symptom, but the fix changes the production error contract for every caller.

**Fix:** Keep the non-rejecting shape, but mark it so callers can still tell a network failure from an empty reply,
and surface it where a load error is expected:
```js
} catch (_networkError) {
  return { success: false, status: 0, response: null, networkError: true };
}
```
```js
// store/devices.js (and enviros, admin, ...)
async fetchItems({ state, commit }) {
  const result = await this.$api.$get('/device');
  if (result.success) commit('saveDevices', { items: result.response || [] });
  else if (result.networkError) throw new Error('network');   // Devices.loadData's catch shows LOAD_ERROR
  return state.items;
},
```
In PasswordReset, check `result && result.networkError` before the generic branch. Alternatively, keep rejecting in
`request()` and fix the one fire-and-forget caller that produced the unhandled rejection in the deep-link spec.

## Warnings

### WR-01: `response.text()` is still outside the new try, so the "never rejects" guarantee is partial

**File:** `services/console/vue/src/core/api.js:116`

**Issue:** The new `try` covers only the `fetch`/`fetchWithCsrf` call. `await response.text()` on line 116 rejects
with `TypeError`/`AbortError` when the body stream fails after the headers arrived. That happens on a connection
reset mid-body, on a page unload or test-boundary abort while the body is streaming, or when Cypress tears down an
intercept between tests. That was the 48-08 scenario. The comment at lines 107-109 promises that "a caller without a
catch never leaves an unhandled rejection", and that is not true for this path. The deep-link spec avoids it only
because it now waits for every dashboard read (see IN-01).

**Fix:** Read the body inside the same guard, so both halves of the exchange fail the same way:
```js
let response, text;
try {
  response = (method === 'GET') ? await fetch(...) : await fetchWithCsrf(...);
  text = await response.text();
} catch (_networkError) {
  return { success: false, status: response ? response.status : 0, response: null, networkError: true };
}
```

### WR-02: The restored Legacy image is built and published without the Legacy unit tests gating it

**File:** `.circleci/config.yml:1123-1146` (with `.circleci/config.yml:268-295`)

**Issue:** Phase 48 makes `build_legacy_console` default to `true` (CI-06). A normal `thinx-staging` push therefore
publishes `thinx/console:swarm` to the private registry, and Swarmpit auto-redeploys it. The Legacy unit suites
(`src/test/deploykey.cjs`, `src/test/legacy-close-out.cjs`) only run in `test-vue-console`, which is in the `main`
workflow. `console-classic-registry`/`console-classic-hub` live in the `legacy-console` workflow and cannot `require`
across workflows, as the config comment itself notes. The result is backwards: a red Legacy test blocks the Vue
image and lets the Legacy image ship.

**Fix:** Add a Legacy test job inside the `legacy-console` workflow, and have both classic builds require it:
```yaml
  legacy-console:
    when: << pipeline.parameters.build_legacy_console >>
    jobs:
      - test-console-classic:          # checkout + submodule, then
          filters: { branches: { only: [thinx-staging, main] } }   # LC_ALL=C node services/console/src/test/*.cjs
      - build-console-classic:
          name: console-classic-registry
          requires: [test-console-classic]
          ...
      - build-console-classic:
          name: console-classic-hub
          requires: [test-console-classic]
          ...
```
Assert the new `requires` in `CiPipelineGates.test.js`, as you already do for the Vue jobs.

### WR-03: The console repo's `test_vue` job still runs unpinned lifecycle scripts with the `sonarcloud` credential context

**File:** `services/console/.circleci/config.yml:183-185` (job at `:86-124`)

**Issue:** Phase 48 rewrote this job: it now runs `yarn` with no lockfile (`yarn.lock` is gitignored), the Legacy
tests and `yarn test:ci`. It still attaches `context: sonarcloud`, but none of its steps use Sonar any more. The
parent's new `test-vue-console` job documents the rule this breaks (D-01): "yarn installs unpinned dependencies with
lifecycle scripts here, so no registry, Hub, Snyk or Slack credential may be in its environment." In the console
repo, any compromised transitive package's `postinstall` can read the Sonar token from the environment.

**Fix:** Drop the context from the `test_vue` workflow entry, since no step needs it:
```yaml
      - test_vue:
          name: Test Vue console
```

### WR-04: The Legacy failed-build toast still reads `response.status`, a field the build reply does not have

**File:** `services/console/src/app/js/controllers/DevicesController.js:137`

**Issue:** Phase 48 fixed the success toast because "the build reply carries no status field". The server sends
`Util.responder(res, success, response)`, which is `{ success, response }`. The failure branch six lines below
still calls `toastr.error( response.status, ... )`. For every refused build (`{ success: false, response: "<reason>" }`),
the toast body is `undefined`, so the user sees a titled toast with no reason. The phase's own invariant (no reply
field reaches toastr, which renders HTML) also argues against passing a reply value through here verbatim.

**Fix:**
```js
} else {
  toastr.error( "Build failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
}
```
If you want the reason shown, map known reason codes to fixed sentences, as `keyNameSentence` does for deploy keys.
Add a G-case in `src/test/legacy-close-out.cjs` for `{ success: false }`.

## Info

### IN-01: The deep-link spec is coupled to the exact count of dashboard reads

**File:** `services/console/vue/cypress/integration/deep-link.spec.js:40`

**Issue:** `cy.wait([... '@getBuildLog', '@getBuildLog', '@getBuildLog'])` hard-codes that Visits, Header and
Notifications each issue exactly one `GET /logs/build`. If one more read is added, a request is left in flight
again and the 48-08 failure returns. If one is removed, the wait times out.

**Fix:** After WR-01 is fixed, drop the count-specific wait. Alternatively, wait on a rendered dashboard element and
let the non-rejecting client absorb in-flight aborts.

### IN-02: The dev-server proxy sends anything not stubbed to production

**File:** `services/console/vue/package.json:19,21` (with `vue/vue.config.js:42-44`, `cypress/support/api-stubs.js:58`)

**Issue:** `test`/`test:ci` force `VUE_APP_API_HOSTNAME=`, so the app calls the dev server origin. The dev server's
`proxy: 'https://console.thinx.cloud'` resolves to the production edge (188.166.23.244). The catch-all intercept only
matches `/\/api\/v2\//`. Any other non-asset request in a spec reaches production. The opt-in live login
(`CYPRESS_LIVE_LOGIN=1`) under `yarn test` now always goes through this proxy to production, and ignores a
developer's `VUE_APP_API_HOSTNAME`.

**Fix:** Point `devServer.proxy` at an env-selected target (or none) for test runs, or widen the catch-all to
`/\/api\//`.

### IN-03: The gated suite and the shipped image resolve dependencies independently

**File:** `.circleci/config.yml:277-283` (with `services/console/vue/Dockerfile:74-77`)

**Issue:** `test-vue-console` runs `yarn` with no lockfile. The image build later runs `npm install` plus `yarn` on
its own. CI-07 ("no Vue image is built in a pipeline whose suite is red") therefore tests a dependency tree that can
differ from the one shipped.

**Fix:** Commit a lockfile and use `yarn --frozen-lockfile` in both places.

### IN-04: Video artifacts are stored although `cy:test:ci` disables video

**File:** `.circleci/config.yml:292-294`, `services/console/.circleci/config.yml:120-123`

**Issue:** `--config video=false` means `cypress/videos` never exists, so these `store_artifacts` steps do nothing.

**Fix:** Remove the two video `store_artifacts` steps.

### IN-05: Logged-out deep-link cold load issues two token exchanges

**File:** `services/console/vue/src/App.vue:44-53`

**Issue:** The comment says the App-level hydrate "returns from the in-memory token without a request". That is true
only after a successful guard hydrate. On a logged-out `/app/*` load, the guard's `hydrateSession` fails and
redirects to `/login`, then `App.created` runs a second `POST /session/token` (the single-flight promise has already
cleared).

**Fix:** Skip the App hydrate when the confirmed route is public and the guard already ran, or cache a recent failed
result. At minimum, correct the comment.

### IN-06: `outline: none` on `:focus` removes the ring where `:focus-visible` is unsupported

**File:** `services/console/vue/src/styles/_platforms.scss:146-158`

**Issue:** Browsers without `:focus-visible` (Safari before 15.4) get no keyboard focus indicator on the newly
focusable markers.

**Fix:** Use `:focus:not(:focus-visible) { outline: none; }` instead of a bare `:focus` rule.

### IN-07: Leftovers from the untracked env file and JUnit file-name collisions

**File:** `services/console/.gitignore:11`, `services/console/vue/cypress/reporters/junit.js:182-186`

**Issue:**
- `src/cypress/.env.test` is untracked, but it is still in the history of the public `thinx-cloud/console` repo. The
  operator check from D-05 (48-06-SUMMARY item 10) is the open action. The file's content was not inspected here.
- The reporter names output files by spec basename only, so two specs with the same basename in different folders
  would overwrite each other's XML.

**Fix:** Record the D-05 operator result. Include the spec's relative directory in `[spec]` if nested spec folders
are ever added.

---

_Reviewed: 2026-10-16T15:10:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
