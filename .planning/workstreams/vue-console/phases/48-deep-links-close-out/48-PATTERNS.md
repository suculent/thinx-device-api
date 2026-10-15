# Phase 48: Deep Links & Close-out - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 27
**Analogs found:** 26 / 27

Paths under `vue/` and `src/` are inside the `services/console` submodule (all checked tracked via
`git -C services/console ls-files`). Parent paths are repo-root relative.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `vue/src/App.vue` | component (root shell) | request-response (hydrate + route) | `vue/src/Routes.js` `beforeEach` (L147-150) | role-match |
| `vue/src/Routes.js` (PUBLIC_PATHS comment only) | route | request-response | itself | exact |
| `vue/src/core/api.js` `parseResult` (IN-01) | utility | transform | itself L70-85 | exact |
| `vue/src/pages/Devices/DeviceDetail.vue` | component | request-response | `vue/src/pages/Devices/Devices.vue` build handler (L450-470) | exact |
| `vue/src/styles/_device-detail.scss` (new) | config/style | - | `vue/src/styles/_build-log.scss` / `_settings-pages.scss` | role-match |
| `vue/src/styles/theme.scss` (import) | config | - | itself L24-28 | exact |
| `vue/src/components/Header/Header.vue` + `Header.scss` | component | - | itself L39-53 | exact |
| `vue/src/pages/Devices/Devices.vue` (toggles, markers, sort, ids) | component | transform | itself (`platformPills` L319-328) | exact |
| `vue/src/styles/_platforms.scss` (focus ring) | style | - | itself | exact |
| `vue/src/styles/_overrides.scss` (`.alert-danger`) | style | - | itself L309-360 | exact |
| `vue/tests/unit/close-out-v118.cjs` (new) | test | - | `vue/tests/unit/transformers-enviros.cjs` + `table-row-contrast.cjs` | exact |
| `vue/package.json` `test:unit` chain | config | - | itself L17 | exact |
| `vue/cypress/support/session.js` | test support | - | itself (`visitApp`) | exact |
| `vue/cypress/support/credentials.js` | test support | - | itself | exact |
| `vue/cypress/support/api-stubs.js` (login stub, same-origin) | test support | request-response | itself L40-65 | exact |
| `vue/cypress/integration/deep-link.spec.js` (new) | test (e2e) | - | `vue/cypress/integration/history.spec.js` / `auth-extras.spec.js` | role-match |
| `vue/cypress/integration/login.spec.js`, `oauth-return.spec.js`, `devices.spec.js`, `device-detail.spec.js` | test (e2e) | - | `device-detail.spec.js` (Phase 47 `@getBuildDetail.all`) | exact |
| `vue/cypress.json` / reporter config (JUnit) | config | - | none in repo | no analog |
| `src/cypress/.env.test` (untrack) + `.gitignore` | config | - | - | n/a (git op) |
| `src/app/js/controllers/DeploykeyController.js` | controller (Legacy) | request-response | itself L29-75 + `vue/src/utils/keyNames.js` | exact |
| `src/app/js/controllers/DevicesController.js` L117 | controller (Legacy) | request-response | itself L105-130 | exact |
| `src/app/js/controllers/LogviewController.js` L227 (+ `{init}`) | controller (Legacy) | event-driven (socket) | itself L215-235 | exact |
| `src/app/js/thinx-api.js` L361 | service (Legacy) | event-driven | sibling handlers above L340-345 (`rsakey` goal) | exact |
| `src/test/deploykey.cjs` | test | - | itself | exact |
| `.circleci/config.yml` (parent): `test-vue-console` job, `requires`, default flip | config (CI) | batch | parent `build-vue-console` job L156-200 + console `test_vue` (console `.circleci/config.yml` L86-127) | role-match |
| `spec/node/CiPipelineGates.test.js` | test | - | itself L54-68 | exact |
| `.planning/runbooks/legacy-console-build-gate.md`, `35-REVIEW-DISPOSITION.md` L87-94 | docs | - | itself (WR rows L80-86 format) | exact |

## Pattern Assignments

### `vue/src/App.vue` (NOTIF-04, D-07, UI-C01/C02)

Current (L35-53) - the bug: `currentPath` is read before the initial navigation confirms.
```js
async created() {
  const currentPath = this.$router.history.current.path;
  const authenticated = await this.hydrateSession({ forcePrime: currentPath === "/oauth-return" });
  if (!authenticated) {
    if (!PUBLIC_PATHS.includes(currentPath)) { await this.pushIfNeeded("/login"); }
    return;
  }
  if (currentPath === "/" || currentPath === "/app") { await this.pushIfNeeded("/app/dashboard"); }
}
```
Keep `pushIfNeeded` (L21-33, swallows `NavigationDuplicated`) and `PUBLIC_PATHS` (L13). Fix: resolve the
target path first (e.g. `await new Promise(r => this.$router.onReady(r))` then `this.$route.path`, or resolve
`location.hash`) and use that same path for `forcePrime` and both branches. Forbidden afterwards:
`$router.history.current.path` before confirm. Note `Routes.js` `beforeEach` (L149-150) also awaits hydrate for
`/app/*` without token — onReady will wait for that guard; avoid a double hydrate deadlock (guard's hydrate runs
during initial navigation; `created()` hydrate after onReady is a second call — check `auth/hydrateSession` is
idempotent or skip when a token is already in the store).

### `vue/src/core/api.js` `parseResult` (IN-01, D-12)
Current L71-78:
```js
let keys = Object.keys(result).filter( key => key !== 'success' && key !== 'paging' );
const out = { 'success': result.success,
  'response': Object.prototype.hasOwnProperty.call(result, 'response')
    ? result.response
    : (keys.length === 1 ? result[keys[0]] : keys.reduce((doc, key) => { doc[key] = result[key]; return doc; }, {})) };
```
Change the fallback to `keys.length === 0 ? undefined : keys.length === 1 ? ... : reduce`. Audit `store/buildlog.js`
`callback(false, {})` and `BuildLogDialog` empty state (`data-cy="build-log-empty"`).

### `vue/src/pages/Devices/DeviceDetail.vue` (D-17, D-18, UI-C04..C06)
Current L15 button and L366-370 handler:
```js
async buildDevice() {
  const result = await this.buildFirmware({ udid: this.device.udid, source_id: this.device.source });
  if (result.success) this.message = 'Build triggered.';
  else this.error = result.message || 'Build failed.';
},
```
Copy the in-flight + failure pattern from `Devices.vue` L455-470:
```js
} catch (e) {
  result = { success: false };
} finally {
  const i = this.buildingUdids.indexOf(device.udid);
  if (i > -1) this.buildingUdids.splice(i, 1);
}
if (result && result.success) this.message = 'Build triggered.';
else this.error = this.buildFailure(result);
...
buildFailure(result) {
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return (result && (text(result.message) || text(result.response))) || 'Build failed.';
},
```
Use a single `buildPending` boolean in `data()` instead of the udid list; early-return guard; clear the other
alert; refocus `this.$refs.buildButton.$el` on `$nextTick` if it had focus; `sr-only role="status"` span.
Wrap alerts + Actions card + `b-row` (after `<h1 class="page-title">` L7) in `<div class="device-detail-content" data-cy="device-detail-content">`.

### `vue/src/styles/_device-detail.scss` (new) + `theme.scss`
Add `@import 'device-detail';` after L28 `@import 'build-log';` in `theme.scss`. Content: `.device-detail-content { max-width: 1140px; }` (no auto margin).

### `vue/src/components/Header/Header.vue` (D-16, UI-C07..C09)
Current L45-47:
```html
<template slot="button-content">
  <i class="fi flaticon-settings-10 px-2" />
</template>
```
Replace with `<i class="la la-user-circle account-menu-icon" title="Account" aria-hidden="true"></i><span class="sr-only">Account menu</span>`.
Keep L48-52 items and `data-cy="settings-dropdown"`. Add `.account-menu-icon { padding: 0 8px; }` to `Header.scss`.

### `vue/src/pages/Devices/Devices.vue` (D-14, UI-C10..C14)
- Toggles L26/L29: `:variant="viewMode === 'list' ? 'primary' : 'outline-secondary'"` -> `'light' : 'outline-light'`, add `aria-label`, `title`, `:aria-pressed`.
- Checkbox ids L74/L78: `'checkbox-' + index` -> `'checkbox-' + device.udid` (grid already uses `grid-checkbox-<udid>`).
- Markers L94-117 and L168-190 (`api-key-indicator`, `status-alert`, `status-warning`): keep `role="img"`, `aria-label`, `title`; add `tabindex="0"` and `v-b-tooltip.hover.focus`.
- Sort L352: replace `basePlatform(a.platform).localeCompare(basePlatform(b.platform))` with the pill comparator from `platformPills` L322-326:
```js
if (a.key === 'unknown') return 1;
if (b.key === 'unknown') return -1;
return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
```
(applied to `platformInfo(basePlatform(p)).label`, tie-break `asText(a.alias).localeCompare(asText(b.alias))`).

### `vue/src/styles/_overrides.scss` (UI-C15)
Alert block L309-360: generic `.alert button.close { ... color: $text-color; }` then `@mixin alert($color)` and
`.alert-success { @include alert('success'); }`. Add after `.alert-danger { @include alert('danger'); }`:
`color: $white;` and `.alert-danger .close, .alert-danger button.close { color: $white; opacity: 1; }`.

### `vue/tests/unit/close-out-v118.cjs` (new)
SFC harness from `transformers-enviros.cjs` L18-50:
```js
const compiler = require('vue-template-compiler');
const Vue = require('vue/dist/vue.runtime.common.js');
Vue.config.ignoredElements = [/^b-/];
Vue.config.errorHandler = (err) => { renderError = err; };
const SRC = path.join(__dirname, '..', '..', 'src');
function check(name, fn) { try { ...console.log('ok   ' + name) } catch (err) { failures++; console.log('FAIL ' + name ...) } }
const asyncChecks = []; function checkAsync(name, fn) { asyncChecks.push([name, fn]); }
```
SCSS check from `table-row-contrast.cjs` L19-38 (`require('sass')`, compile `src/styles/theme.scss`, `process.exit(failures ? 1 : 0)`).
Copy (do not require) the harness, per the existing convention. Append `&& node tests/unit/close-out-v118.cjs` to `vue/package.json` L17 `test:unit`.

### `vue/cypress/support/session.js` (D-03, UI-C03)
Delete the `visitAppRoute` comment block and body (dashboard hop + `win.location.hash`). New body:
`return cy.visitApp('/#' + route, options);`. `visitApp` (intercepts `POST /api/v2/session/token` as `@sessionToken`) is unchanged.

### `vue/cypress/support/credentials.js` (D-02)
`loginCredentials()` passes `fixtures.username` / `fixtures.password` as fallback — drop the fixture fallback
(`resolveCredential(user, USER_ENV_NAMES, '')`) and the `fixtures` import. Add a `liveLoginEnabled()` gate on
`Cypress.env('LIVE_LOGIN') === 1/'1'` plus `hasLoginCredentials()`; keep the `function()`-hook `this.skip()` pattern and `MISSING_LOGIN_CREDENTIALS` message style.

### `vue/cypress/support/api-stubs.js` (D-02, D-04)
Pattern (L53-65):
```js
cy.intercept(/\/api\/v2\//, { ...500 catch-all });   // registered first
cy.intercept({ method: 'GET', pathname: `${API}/csrf-token` }, ok('test-csrf')).as('csrfToken');
cy.intercept({ method: 'GET', pathname: `${API}/profile` }, { fixture: fixtures.profile }).as('getProfile');
```
Add `POST /api/login` stub the same way. Same-origin for oauth-return: stub through the dev server origin (discretion).

### `vue/cypress/integration/deep-link.spec.js` (new)
Use `cy.stubThinxApi()` in `beforeEach`, then `cy.visitApp('/#/app/history', { session: true })` ->
`cy.location('hash').should('eq', '#/app/history/audit')`, `.page-title` contains `History`; logged out -> `#/login`.
Follow `history.spec.js` structure. Double-click Build test in `device-detail.spec.js`: delayed `@buildFirmware` intercept, `cy.get('@buildFirmware.all').should('have.length', 1)` (same style as Phase 47 `@getBuildDetail.all`).

### `src/app/js/controllers/DeploykeyController.js` (IN-03/IN-04, UI-C18)
Current L31-73:
```js
if ($scope.creatingDeploykey || !$scope.deploykeyName || !$scope.deploykeyName.trim()) return;
$scope.creatingDeploykey = true;
Thinx.createDeploykey($scope.deploykeyName.trim())
.done( function( response ) {
  if (typeof response === "string") response = JSON.parse(response);   // dead branch to drop
  ...
  var key = response.response || response.status;                     // guard !key || !key.pubkey
  ...
  } else { toastr.error( "Error.", ... ) }                             // replace with UI-C18 sentence
} ) ... .always(function() { $scope.creatingDeploykey = false; $scope.$applyAsync(); });
```
Client check: copy the code-unit loop from `vue/src/utils/keyNames.js` (`unitProblem`, `KEY_NAME_MAX = 120`;
comment "Code units are compared as numbers on purpose ... Codacy no-control-regex"). Reason sentences: reuse
`keyNameMessage(reason)` wording from the same file. Wrap the `.done` body in try/finally so the reset survives a throw.
Messages go via `.text(sentence)`, never the jqXHR.

### `src/test/deploykey.cjs`
Extend `scenario(response)` (vm sandbox with stubbed `Thinx.createDeploykey` returning `{done, fail, always}`).
Add a `.fail` variant whose `fail(fn)` calls `fn({responseJSON:{success:false,response:'invalid_key_name',reason:'too_long'}})`,
and capture `.msg-warning` text through a stubbed `$`/`angular.element`. Keep `assert.equal(r.scope.creatingDeploykey,false)` on every scenario.

### `src/app/js/controllers/DevicesController.js` L117 (UI-C19)
```js
toastr.info( response.status + "<br><br>Click to show build log...", "THiNX Builder", { timeOut: 3000, ... } );
```
-> `(response.response === "queued" ? "Build queued." : "Build started.") + "<br><br>Click to show build log..."`; options unchanged.
Sibling null-safe goal check right above (L110-115) is the reference for `goals.length > 0`.

### `src/app/js/controllers/LogviewController.js` L227
`$rootScope.meta.deviceBuilds[ msg.udid ].push( buildRecord );` -> initialise
`if (!Array.isArray($rootScope.meta.deviceBuilds[msg.udid])) $rootScope.meta.deviceBuilds[msg.udid] = [];` first.
`{init}` frame: grep the socket-open path in the same file and send the same init frame the main log view sends.

### `src/app/js/thinx-api.js` L353-361 `updateDeploykeys` (IN-05)
Current guard: `Array.isArray($rootScope.profile.info.goals)` then `!includes("deploykey") && $rootScope.deploykeys.length > 0`.
Sibling (`rsakey`, L340-342) and `DevicesController.js` L110 use `goals.length > 0` — restore it while keeping the null checks.

### `.circleci/config.yml` (parent) (D-01, D-08)
- L15-17: `build_legacy_console: type: boolean, default: false` -> `default: true`; rewrite comment block L7-13 and L1060-1065 as kill-switch text.
- New job `test-vue-console`: executor `docker: - image: thinxcloud/console-build-env:vue`; steps modelled on console `test_vue` (console `.circleci/config.yml` L86-127):
```yaml
- run: |
    export NODE_OPTIONS=--openssl-legacy-provider
    cd vue && yarn
    LC_ALL=C yarn test:unit
    LC_ALL=C node ../src/test/deploykey.cjs
    yarn build:perf
    yarn test
- store_test_results: { path: <cypress junit dir> }
- store_artifacts: { path: ./vue/cypress/screenshots, destination: cypress-screenshots }
```
  plus the submodule fetch step from `build-vue-console` (`git submodule foreach --recursive 'git submodule sync' && git submodule update --init --recursive`). Note the console job's `working_directory: /root/project/src` vs parent layout `services/console`.
- Add `requires: [test-vue-console]` to `vue-console-registry` (L914) and `vue-console-hub` (L927); add the job itself in the same workflow with matching branch filters.
- Also fix console repo `store_test_results` (L110-112) to point at the JUnit output.

### `spec/node/CiPipelineGates.test.js`
L54-60 currently asserts only `typeof param.default === "boolean"` with comment "Phase 48 flips it ... must not need a test edit". Change to `assert.equal(param.default, true)`; add a test that compiling with the default value (the local compile helper L40-52 that keeps `when`-gated workflows only when `value === true`) includes `legacy-console`; add a test that `vue-console-registry`/`-hub` require `test-vue-console`. Follow the `test(...)`, `workflowEntries()`, `jobsOf()` helpers.

### `35-REVIEW-DISPOSITION.md` L87-94
Rows `| IN-0n | info | open | - |` -> `| IN-0n | info | fixed | <commit> (Phase NN) |` or `deferred | <reason>`, same 4-column format as the WR rows L80-86.

## Shared Patterns

### Build failure text (44 IN-01)
**Source:** `vue/src/pages/Devices/Devices.vue` L466-469 (`buildFailure`). **Apply to:** DeviceDetail build; consider moving to `vue/src/utils/`.

### Plain-node unit harness
**Source:** `vue/tests/unit/transformers-enviros.cjs` L18-50, `table-row-contrast.cjs` L19-38. Copy, don't require; run with `LC_ALL=C yarn test:unit`.

### Control-character check without regex
**Source:** `vue/src/utils/keyNames.js` L7-24. **Apply to:** Legacy DeploykeyController client check.

### Toasts are fixed strings
`toastr` renders HTML; never interpolate reply fields (see `src/test/toast-escape.cjs` for the existing guard).

### Cypress stubs
**Source:** `api-stubs.js` catch-all-first ordering (L40-53) and `session.js` `visitApp` intercept-before-visit.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Cypress JUnit reporter config (`vue/cypress.json` reporter / `mocha-junit-reporter`) | config | - | No JUnit reporter configured anywhere; `store_test_results` today points at `./vue/coverage`. Check whether the reporter is already in `node_modules` before adding a dependency |

## Metadata

**Analog search scope:** `services/console/vue/src`, `vue/tests/unit`, `vue/cypress`, `services/console/src/app/js`, `services/console/src/test`, parent `.circleci/config.yml`, `spec/node`
**Files scanned:** ~25
**Pattern extraction date:** 2026-10-15
