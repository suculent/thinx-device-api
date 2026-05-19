# Technical Concerns
*Generated: 2026-05-18 | Focus: concerns | Scope: services/console (Vue SPA frontend)*
> Note: This document covers concerns for `services/console/`. Concerns for the main backend API are not yet mapped here.

---

## 1. Architecture Debt — Dual Codebase

**Severity: HIGH**

The repository contains two separate, partially overlapping frontend implementations:

- **Legacy AngularJS app** (`src/`) — built with Gulp 3, jQuery, AngularJS 1.x, served as static files via `http-server`
- **Modern Vue 2 app** (`vue/`) — built with `@vue/cli-service`, Vuex, Vue Router, served via Express + Nginx

Both target the same backend API. There is no clear deprecation plan, no shared component library, and no shared test suite between them. The legacy app is in active maintenance (recent commits). The Vue app lacks feature parity (no profile/history pages implemented yet, no RSA key detail, no device enrollment flows).

**Files:** `src/` (entire directory), `vue/` (entire directory)

**Impact:** Every feature change must be applied twice. Bugs fixed in one codebase silently remain in the other. Onboarding cost is doubled.

**Fix approach:** Establish Vue as the canonical target. Complete parity audit, migrate remaining pages, then retire `src/`.

---

## 2. Security — JWT Tokens Stored in `localStorage`

**Severity: HIGH**

Access and refresh tokens are persisted directly in `window.localStorage`:

```js
// vue/src/pages/Login/Login.vue:179-181
window.localStorage.setItem("accessToken", access_token);
window.localStorage.setItem("refreshToken", refresh_token);
window.localStorage.setItem("authenticated", true);
```

`localStorage` is accessible by any JavaScript on the page, making tokens vulnerable to XSS exfiltration. The `authenticated` flag is a plain string `"true"` that could be spoofed.

**Files:** `vue/src/pages/Login/Login.vue`, `vue/src/App.vue`, `vue/src/store/auth.js`

**Impact:** Successful XSS attack yields persistent session hijack. No token rotation on compromise.

**Fix approach:** Store tokens in `HttpOnly` cookies set by the server, or use in-memory storage (Vuex only, no persistence). Remove the `authenticated` localStorage flag.

---

## 3. Security — `Access-Control-Allow-Origin` Sent as Request Header

**Severity: HIGH**

`Access-Control-Allow-Origin` is a **response** header set by servers. Setting it as a **request** header has no security effect and reveals internal hostnames:

```js
// vue/src/core/api.js:31
'Access-Control-Allow-Origin': 'http://localhost:3080 ' + this.baseApiUrl,

// vue/src/pages/Login/Login.vue:152
"Access-Control-Allow-Origin": "http://localhost:3080 " + this.$hostnames.API,
```

The hardcoded `localhost:3080` appears in every outgoing API request, including production.

**Files:** `vue/src/core/api.js`, `vue/src/pages/Login/Login.vue`

**Fix approach:** Remove `Access-Control-Allow-Origin` from all `fetch`/`XMLHttpRequest` request headers. CORS is controlled by the server.

---

## 4. Security — Token Assignment Logic is Swapped

**Severity: HIGH**

In `vue/src/core/api.js`, `setAccessToken` assigns to `this.refreshToken` and vice versa:

```js
// vue/src/core/api.js:50-55
setAccessToken(token) {
  this.refreshToken = token;   // BUG: should be this.accessToken
}
setRefreshToken(token) {
  this.accessToken = token;    // BUG: should be this.refreshToken
}
```

The `Authorization` header then sends `this.refreshToken` as the bearer credential, meaning the access token is actually used as the refresh token and sent in auth headers. This is functionally broken for any backend that distinguishes the two tokens.

**Files:** `vue/src/core/api.js`, `vue/src/store/auth.js`

**Fix approach:** Swap the assignments in both setters. Audit backend to confirm which token it expects in `Authorization: Bearer`.

---

## 5. Security — `v-html` with Uncontrolled Input

**Severity: MED**

Two components render raw HTML via `v-html`:

```html
<!-- vue/src/components/Widget/Widget.vue:10 -->
<header v-if="title && customHeader" class="title" v-html="title"></header>

<!-- vue/src/components/Widget/Widget.vue:78 -->
<div v-if="customControls" v-html="customControls" ...></div>
```

`Widget` is used by `Login.vue` with `title="<h3 class='mt-0'>THiNX Login</h3>"` — currently a static string. If `title` or `customControls` props ever flow from API data or user input, XSS becomes trivial.

**Files:** `vue/src/components/Widget/Widget.vue`

**Fix approach:** Replace `v-html` title with a slot. Validate/sanitize `customControls` with DOMPurify if dynamic content is needed.

---

## 6. Security — No Route-Level Auth Guards

**Severity: MED**

Vue Router has no `beforeEach` navigation guards. Auth checks are scattered across individual component `created()` hooks. The `/app/*` subtree has no global route guard enforcing authentication:

```js
// vue/src/Routes.js — no beforeEach, no meta.requiresAuth anywhere
export default new Router({
  mode: 'hash',
  routes: [ ... ]   // all /app/* routes unguarded
});
```

Auth redirect logic exists in `App.vue` `created()` but runs only once on initial load, not on subsequent navigation.

**Files:** `vue/src/Routes.js`, `vue/src/App.vue`

**Fix approach:** Add a global `router.beforeEach` guard that checks `store.getters['auth/isAuthenticated']` for all `/app` routes and redirects to `/login` if unauthenticated.

---

## 7. Security — GDPR: Crisp Chat Loaded Unconditionally

**Severity: MED**

The code contains a TODO acknowledging this problem but it remains unresolved:

```js
// vue/src/main.js:27
disabled: true, // TODO in production should be disabled to comply with GDPR
```

`@dansmaculotte/vue-crisp-chat` is installed and `Vue.use`d on every page load. Even with `disabled: true`, the package is initialized. Crisp Chat loads third-party scripts from `crisp.chat` which may set tracking cookies without user consent.

**Files:** `vue/src/main.js`

**Fix approach:** Gate `Vue.use(CrispChat, ...)` behind explicit user consent or remove the integration until a proper cookie consent flow is in place.

---

## 8. Dependency Risk — Gulp 3 (EOL)

**Severity: HIGH**

The legacy app build system uses Gulp 3.9.1, which reached end-of-life and has known unpatched vulnerabilities. Gulp 4 introduced breaking API changes, so upgrading requires rewriting `src/gulpfile.js`.

```json
// src/package.json:49
"gulp": "^3.9.1"
```

**Files:** `src/package.json`, `src/gulpfile.js`

**Fix approach:** Migrate to Gulp 4 or replace the build pipeline with Vite/esbuild as part of the Vue migration.

---

## 9. Dependency Risk — Vue 2 End of Life

**Severity: HIGH**

Vue 2 reached end of life on December 31, 2023. The project depends on Vue 2.6.14 and the entire ecosystem pinned to Vue 2 (BootstrapVue 2.21.2, vue-router 3.x, vuex 3.x, vue-chartjs 3.x, vue-echarts 4.x, vue-codemirror 4).

```json
// vue/package.json:38
"vue": "^2.6.14"
```

No security patches are issued for Vue 2. Ecosystem packages are progressively dropping Vue 2 support.

**Files:** `vue/package.json`

**Fix approach:** Plan migration to Vue 3. Evaluate Quasar or Nuxt as migration paths. BootstrapVue has a Vue 3 community fork (`bootstrap-vue-next`).

---

## 10. Dependency Risk — Excessive Charting Libraries

**Severity: MED**

Five separate charting libraries are installed as production dependencies:

- `@amcharts/amcharts4` + `@amcharts/amcharts4-geodata` (heavy, commercial)
- `apexcharts` + `vue-apexcharts`
- `chart.js` + `vue-chartjs`
- `echarts` + `vue-echarts`
- `highcharts` + `highcharts-vue`

Only `@amcharts/amcharts4` is actively used (in `vue/src/pages/Visits/components/Map/Map.vue`). The others appear to be carried from the template but unused in production pages.

**Files:** `vue/package.json`

**Impact:** Significantly bloated production bundle. Highcharts has a commercial license requirement for production use.

**Fix approach:** Audit actual usage with tree-shaking analysis (`vue-cli-service build --report`). Remove unused charting packages. Verify Highcharts license compliance.

---

## 11. Dependency Risk — `gulp-util` Deprecated

**Severity: MED**

`gulp-util` was officially deprecated in 2017. It contains known vulnerabilities in its sub-dependencies and its author explicitly recommends removing it.

```json
// src/package.json:64
"gulp-util": "^3.0.8"
```

**Files:** `src/package.json`, `src/gulpfile.js`

**Fix approach:** Replace `gulp-util` with individual packages (`fancy-log`, `plugin-error`, etc.) or migrate off Gulp entirely.

---

## 12. Dependency Risk — `npm audit` Disabled at Install

**Severity: MED**

The `preinstall` script skips the security audit entirely:

```json
// src/package.json:7
"preinstall": "npm install --ignore-scripts --no-audit"
```

This means vulnerability notifications are never surfaced during CI or developer setup for the legacy app.

**Files:** `src/package.json`

**Fix approach:** Remove `--no-audit`. Use `npm audit --audit-level=high` in CI and fail the build on high-severity findings.

---

## 13. Dependency Risk — Outdated `cypress` Version

**Severity: LOW**

Both packages pin to Cypress 9.x (released 2022):

```json
// src/package.json
"cypress": "^9.4.1"

// vue/package.json
"cypress": "^9.5.4"
```

Cypress 9 is multiple major versions behind current and may have unfixed browser compatibility issues with modern Chrome/Firefox versions used in CI.

**Files:** `src/package.json`, `vue/package.json`

---

## 14. Maintainability — `thinx-api.js` God Object (1220 lines)

**Severity: MED**

The entire legacy backend communication layer is a single flat file with global function declarations and a thin wrapper object:

```
src/app/js/thinx-api.js  — 1220 lines
src/app/js/main.js        — 923 lines
```

`thinx-api.js` mixes: global variable declarations, jQuery AJAX calls, `$rootScope` event listener registration, and UI state mutation — all in one file. It uses `// eslint-disable-next-line no-redeclare` to suppress errors from its own global redeclarations.

**Files:** `src/app/js/thinx-api.js`

**Fix approach:** This file belongs to the legacy app slated for retirement. Avoid further investment; implement missing functionality in the Vue Vuex store instead.

---

## 15. Maintainability — Commented-Out Code Blocks

**Severity: LOW**

Multiple components contain large commented-out sections and dead UI elements:

- `vue/src/pages/Login/Login.vue` lines 15-27: entire email field commented out (switched to username, but old field remains in markup)
- `vue/src/store/profile.js` lines 6-77: full example API response embedded as a comment
- `vue/src/App.vue` line 37: inline comment explaining removed `localStorage` check that is still used elsewhere

**Files:** `vue/src/pages/Login/Login.vue`, `vue/src/store/profile.js`, `vue/src/App.vue`

**Fix approach:** Remove commented code. Use git history for reference.

---

## 16. Maintainability — Unimplemented TODOs in Auth Flow

**Severity: MED**

Critical auth validation is explicitly deferred with TODO comments:

```js
// vue/src/store/auth.js:15
// TODO use validation
state.accessToken = token;

// vue/src/store/auth.js:20
// TODO use validation
state.refreshToken = token;

// vue/src/App.vue:62-65
/*
  TODO unwrap and check validity of this JWT token
  retrieve accessToken from localstorage, if present
*/
```

Token mutation handlers store tokens without any validation. JWT signature verification is not performed client-side.

**Files:** `vue/src/store/auth.js`, `vue/src/App.vue`

---

## 17. Maintainability — `fromNow` Filter Duplicated

**Severity: LOW**

A custom `fromNow` date filter is defined independently in two separate Vue components:

```js
// vue/src/pages/Devices/Devices.vue:105-114
filters: { fromNow(val) { ... } }

// vue/src/pages/Devices/DeviceDetail.vue:84
filters: { fromNow(val) { ... } }
```

The `vue-moment` package is installed globally but not actually used for this filter.

**Files:** `vue/src/pages/Devices/Devices.vue`, `vue/src/pages/Devices/DeviceDetail.vue`

**Fix approach:** Register `fromNow` as a global Vue filter in `main.js`. Remove the `vue-moment` package if it's not used elsewhere.

---

## 18. Maintainability — Typo in Public API Parameter

**Severity: LOW**

A parameter name typo exists in the public `Thinx` API wrapper object:

```js
// src/app/js/thinx-api.js:100
pushConfig: function (configForm, deiceUdids) {   // "deice" not "device"
    return pushConfig(configForm, deiceUdids);
```

This propagates to all callers of `Thinx.pushConfig()`.

**Files:** `src/app/js/thinx-api.js`

---

## 19. Performance — `NODE_ENV=development` Baked into Production Docker Image

**Severity: HIGH**

The production Dockerfile hard-codes `NODE_ENV=development`:

```dockerfile
# vue/Dockerfile:49
ENV NODE_ENV=development
```

This disables Vue production mode optimizations, enables development warnings in the browser, causes larger bundle sizes, and tells downstream tooling (Rollbar, etc.) that the environment is development even when deployed to production.

**Files:** `vue/Dockerfile`

**Fix approach:** Set `ENV NODE_ENV=production` in the Dockerfile, or pass it as a build ARG that defaults to `production`.

---

## 20. Performance — No Code Splitting or Lazy Routes

**Severity: MED**

All page components are statically imported in `Routes.js`. Every route imports its component at bundle parse time:

```js
// vue/src/Routes.js:1-22
import Dashboard from '@/pages/Visits/Visits';
import RepoManager from '@/pages/Repositories/Repositories';
// ... 10+ more static imports
```

With 5 charting libraries and multiple large dependencies, the initial bundle is large and the entire app must parse before first paint.

**Files:** `vue/src/Routes.js`

**Fix approach:** Replace static imports with dynamic `() => import(...)` for all routes except Login. Vue CLI/webpack will split each route into its own chunk.

---

## 21. Testing — No Unit Tests in Either App

**Severity: HIGH**

Neither the AngularJS app nor the Vue app has unit tests. The only automated tests are Cypress E2E integration tests, which:

- Target only the login flow (`vue/cypress/integration/login.spec.js`)
- Have the primary test marked `it.only` with a TODO: "This is failing! Fix me!"
- Have four secondary tests in the `todo/` folder that are stubs (no assertions)

```js
// vue/cypress/integration/login.spec.js:9
it.only('Should log in with static test account', function() {
  // TODO This is failing! Fix me!
```

**Files:** `vue/cypress/integration/login.spec.js`, `src/cypress/integration/todo/`

**Impact:** Zero test coverage on: Vuex store actions, API client, auth flow, device operations, all CRUD flows.

**Fix approach:** Add Vitest for unit testing the Vue store modules and `vue/src/core/api.js`. Fix the failing Cypress login test as the first unblocking step.

---

## 22. Testing — Cypress `.env.test` Present in Repo

**Severity: MED**

A `.env.test` file exists at `src/cypress/.env.test`. Cypress environment files may contain test account credentials or API endpoints that should not be committed.

**File:** `src/cypress/.env.test`

**Fix approach:** Verify the file contains no real credentials. If it does, rotate any exposed credentials and add `*.env.test` to `.gitignore`. Use Cypress environment variables via `cypress.env.json` excluded from git instead.

---

## 23. Browser Compatibility — Hash Router Mode

**Severity: LOW**

Vue Router uses `mode: 'hash'`, meaning all routes use `/#/` URL fragments:

```js
// vue/src/Routes.js:27
mode: 'hash',
```

Hash routing works without server configuration but produces `/#/login`, `/#/app/dashboard` URLs which:
- Cannot be directly shared as clean links
- Are not indexable by search engines
- Prevent server-side route handling (e.g., returning 404 for unknown routes at the server level)

**Files:** `vue/src/Routes.js`, `vue/default.conf`

**Fix approach:** Switch to `mode: 'history'` and configure Nginx to serve `index.html` for all non-asset routes. The Nginx config (`vue/default.conf`) would need a `try_files` directive.

---

## 24. Observability — Console Logging (239 instances) with No Log Level

**Severity: LOW**

The legacy AngularJS app (`src/app/js/`) contains 239 `console.log`/`console.error`/`console.warn` calls with no log level abstraction. These will appear in production browser consoles and may leak internal state, API responses, or error details to users.

**Files:** `src/app/js/` (entire directory)

**Impact:** Internal data visible to any user who opens DevTools in production.

**Fix approach:** This is part of the legacy app — lower priority given planned retirement. For the Vue app, use Rollbar (already integrated) for error capture rather than console output.

---

## Summary Table

| # | Concern | Severity | Area |
|---|---------|----------|------|
| 1 | Dual codebase (AngularJS + Vue) | HIGH | Architecture |
| 2 | JWT tokens in localStorage | HIGH | Security |
| 3 | CORS header sent as request header | HIGH | Security |
| 4 | Access/refresh token assignment swapped | HIGH | Security (Bug) |
| 19 | `NODE_ENV=development` in production Docker | HIGH | Performance |
| 21 | No unit tests, failing E2E | HIGH | Testing |
| 8 | Gulp 3 EOL | HIGH | Dependencies |
| 9 | Vue 2 EOL | HIGH | Dependencies |
| 5 | `v-html` XSS risk | MED | Security |
| 6 | No route-level auth guards | MED | Security |
| 7 | GDPR: Crisp Chat unconsented | MED | Security/Legal |
| 10 | 5 charting libraries bundled | MED | Performance |
| 11 | `gulp-util` deprecated | MED | Dependencies |
| 12 | `npm audit` disabled at install | MED | Dependencies |
| 16 | Auth validation TODOs | MED | Maintainability |
| 20 | No code splitting / lazy routes | MED | Performance |
| 22 | Cypress `.env.test` in repo | MED | Security |
| 14 | 1220-line god file `thinx-api.js` | MED | Maintainability |
| 13 | Cypress 9.x outdated | LOW | Dependencies |
| 15 | Commented-out code blocks | LOW | Maintainability |
| 17 | `fromNow` filter duplicated | LOW | Maintainability |
| 18 | Typo `deiceUdids` in public API | LOW | Maintainability |
| 23 | Hash router mode | LOW | Compatibility |
| 24 | 239 console.log calls (legacy) | LOW | Observability |
