# Architecture
*Generated: 2026-05-18 | Focus: arch | Scope: services/console (Vue SPA frontend)*
> Note: This document covers the `services/console/` Vue 2 SPA. The main backend API architecture (Express/Node.js) is not yet mapped.

<!-- refreshed: 2026-05-18 -->

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                              │
│                                                                    │
│  ┌──────────┐  ┌──────────────────────────────────────────────┐   │
│  │  Login   │  │  Layout Shell (vue/src/components/Layout/)   │   │
│  │  /login  │  │  ┌──────────┐ ┌─────────┐ ┌──────────────┐  │   │
│  └──────────┘  │  │ Sidebar  │ │ Header  │ │  <router-    │  │   │
│                │  │          │ │         │ │   view />    │  │   │
│                │  └──────────┘ └─────────┘ └──────────────┘  │   │
│                │                               Page Components │   │
│                └──────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Vuex Store (namespaced modules)           │  │
│  │  auth | layout | devices | profile | repositories | apikeys │  │
│  │  rsakeys | enviros | channels | transformers | buildlog     │  │
│  │  auditlog | stats                                           │  │
│  └────────────────────────────────┬─────────────────────────────┘  │
│                                   │                                │
│  ┌────────────────────────────────▼─────────────────────────────┐  │
│  │           ThinxApi class (vue/src/core/api.js)               │  │
│  │           fetch() over /api/v2, Bearer auth via              │  │
│  │           refreshToken in Authorization header               │  │
│  └────────────────────────────────┬─────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│              THiNX Backend API  (api/v2/*)                        │
│  /login  /profile  /device  /source  /logs/*  /stats  /build     │
│  /oauth/github  /oauth/google  /transfer/request  /user          │
└───────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App.vue | Root shell; auth guard on create, redirects to /login or /app/dashboard | `vue/src/App.vue` |
| Routes.js | Vue Router config; hash mode, nested `/app/*` under Layout | `vue/src/Routes.js` |
| Store index | Assembles all namespaced Vuex modules, attaches `$api` | `vue/src/store/index.js` |
| ThinxApi | Single HTTP client class; `$get/$post/$put/$delete` wrappers | `vue/src/core/api.js` |
| Layout | Authenticated shell: renders Sidebar + Header + `<router-view>` | `vue/src/components/Layout/Layout.vue` |
| Sidebar | Navigation links; reads active state from `layout` Vuex module | `vue/src/components/Sidebar/Sidebar.vue` |
| Header | Top bar; logout action, profile avatar, sidebar toggle | `vue/src/components/Header/Header.vue` |
| Login page | Credential form + OAuth (GitHub/Google) buttons; writes tokens to localStorage | `vue/src/pages/Login/Login.vue` |
| auth store | Holds accessToken/refreshToken state; JWT decode validation | `vue/src/store/auth.js` |
| layout store | Sidebar open/close and active nav element state | `vue/src/store/layout.js` |
| devices store | Device list CRUD, build trigger, transfer, push config | `vue/src/store/devices.js` |
| profile store | Fetch/update user profile, delete account | `vue/src/store/profile.js` |
| repositories store | Source repository list CRUD | `vue/src/store/repositories.js` |
| apikeys store | API key management | `vue/src/store/apikeys.js` |
| rsakeys store | RSA deploy key management | `vue/src/store/rsakeys.js` |
| enviros store | Environment global variables | `vue/src/store/enviros.js` |
| channels store | Mesh channel management | `vue/src/store/channels.js` |
| transformers store | Status transformer management (base64-encoded JS bodies) | `vue/src/store/transformers.js` |
| buildlog store | Build log fetch + normalization from InfluxDB format | `vue/src/store/buildlog.js` |
| auditlog store | Audit event log fetch | `vue/src/store/auditlog.js` |
| stats store | Dashboard stats (weekly/today) from InfluxDB series format | `vue/src/store/stats.js` |

## Pattern Overview

**Overall:** Single-Page Application (SPA) with Vue 2 + Vuex + Vue Router

**Key Characteristics:**
- Hash-mode routing (`#/login`, `#/app/dashboard`)
- All authenticated routes nested under a single Layout shell component
- Vuex modules are namespaced (`auth/isAuthenticated`, `devices/fetchItems`)
- The API client (`ThinxApi`) is attached directly to the Vuex store instance as `store.$api`, making it available inside all store actions via `this.$api`
- Auth state stored in both Vuex and `localStorage` (tokens + `authenticated` flag); Vuex is the source of truth at runtime
- Dual codebase: a legacy AngularJS app at `src/` and the current Vue 2 app at `vue/`

## Layers

**Routing Layer:**
- Purpose: Maps URL paths to page-level components
- Location: `vue/src/Routes.js`
- Contains: Route definitions, lazy-loaded components
- Depends on: Vue Router, page components
- Used by: `vue/src/main.js`

**Page Components (Views):**
- Purpose: Full-page features, one per route
- Location: `vue/src/pages/`
- Contains: Template + local data + wired Vuex getters/actions
- Depends on: Vuex store modules, shared components
- Used by: Router

**Shared Components:**
- Purpose: Reusable UI building blocks
- Location: `vue/src/components/`
- Contains: Layout, Sidebar, Header, Widget, List, Form, Loader, Notifications, Sparklines
- Depends on: BootstrapVue, Vuex (for layout state)
- Used by: Page components and Layout shell

**Vuex Store (State/Logic Layer):**
- Purpose: Centralized async actions and reactive state
- Location: `vue/src/store/`
- Contains: Namespaced modules, each with `state`, `mutations`, `actions`, `getters`
- Depends on: `ThinxApi` via `this.$api`
- Used by: All page and shell components

**API Client:**
- Purpose: Thin HTTP abstraction over `fetch()`
- Location: `vue/src/core/api.js`
- Contains: `ThinxApi` class; `request()`, `$get()`, `$post()`, `$put()`, `$delete()`
- Depends on: `window.fetch`, `process.env.VUE_APP_API_HOSTNAME`
- Used by: All Vuex store actions

**Mixins:**
- Purpose: Cross-cutting behavior injected into components
- Location: `vue/src/mixins/`
- Contains: `layout.js` (color config, `decodeHtml`), `hostnames.js` (hostname resolution from env vars)
- Used by: `main.js` (layout mixin applied globally), Login page and Footer (hostnames mixin)

## Data Flow

### Primary Request Path (authenticated page)

1. User navigates to `#/app/devices` — Vue Router renders `Devices.vue` inside Layout
2. `Devices.vue` `created()` calls `this.fetchItems()` (mapped from `devices/fetchItems`)
3. Vuex action calls `this.$api.$get('/device')`
4. `ThinxApi.request()` calls `fetch(baseApiUrl + '/api/v2/device', { headers: { Authorization: 'Bearer ' + refreshToken } })`
5. Response JSON parsed; `commit('saveDevices', ...)` updates `state.items`
6. Component `data.items = this.getItems()` after Promise resolves; template re-renders

### Login Flow

1. User submits form on `/login`
2. `Login.vue` calls `fetch(API + '/login', { body: { username, password } })` directly (not via ThinxApi)
3. On success: `setAccessToken` / `setRefreshToken` mutations called → tokens written to localStorage + `ThinxApi` instance updated
4. `fetchProfile()` action called; `setUser(profile)` called
5. Router pushed to `/app/dashboard`
6. On app reload: `App.vue` `created()` reads localStorage tokens, validates JWT expiry, restores Vuex state

### OAuth Login

1. User clicks GitHub/Google button
2. Browser navigates to `API + '/oauth/github'` or `/oauth/google` (full page redirect, not SPA navigation)
3. Backend handles OAuth callback and redirects back; frontend must re-initialize auth from redirect URL or cookie

**State Management:**
- Vuex holds all server-fetched data
- Auth tokens live in both Vuex (`auth` module) and `localStorage` (persistence across reloads)
- UI state (sidebar open/close, active nav item) lives exclusively in the `layout` Vuex module
- No reactive prop drilling; components use `mapGetters`/`mapActions` everywhere

## Key Abstractions

**ThinxApi (`store.$api`):**
- Purpose: Single fetch wrapper with auth headers and `/api/v2` base path
- Example: `vue/src/core/api.js`
- Pattern: Class instantiated in `main.js`, attached to store as `store.$api`; used by all Vuex actions as `this.$api`

**Vuex Module Pattern:**
- Every domain entity has its own namespaced module file
- Pattern: `state` holds `items: []` and `headers: []`; `mutations` normalize API response into flat arrays; `actions` call `this.$api` and commit results
- Example: `vue/src/store/devices.js`, `vue/src/store/repositories.js`

**Layout Shell:**
- Purpose: Authenticated wrapper that provides Sidebar + Header chrome for all `/app/*` routes
- Example: `vue/src/components/Layout/Layout.vue`
- Pattern: Single parent route `/app` renders Layout; all child routes render inside `<router-view />`

## Entry Points

**Vue SPA Bootstrap:**
- Location: `vue/src/main.js`
- Triggers: Webpack bundle load; `new Vue({ el: '#app', store, router, render })`
- Responsibilities: Registers Vue plugins (BootstrapVue, GoogleMaps, Toasted, VCalendar, ApexCharts, Rollbar, CrispChat, Moment), creates `ThinxApi` instance, attaches to store, mounts app

**Development Server:**
- Location: `vue/vue.config.js`
- Triggers: `vue-cli-service serve`
- Responsibilities: Proxies all requests to `https://console.thinx.cloud` in dev mode

**Legacy AngularJS Bootstrap:**
- Location: `src/app/js/main.js`
- Triggers: `ng-app="RTM"` directive in HTML
- Status: Legacy/deprecated alongside the new Vue app

## Architectural Constraints

- **Router mode:** Hash mode only (`#/app/...`). No server-side route handling needed but deep-link URLs expose the hash.
- **Global state:** `ThinxApi` instance attached as `store.$api` — this is module-level shared mutable state. Token mutations directly call `this.$api.setAccessToken()` / `this.$api.setRefreshToken()` as a side effect.
- **Auth header quirk:** `composeHeaders()` in `ThinxApi` sends the `refreshToken` in the `Authorization: Bearer` header, not the `accessToken`. The naming in `setAccessToken`/`setRefreshToken` methods is inverted relative to conventional usage.
- **No route guards:** Vue Router has no `beforeEach` navigation guards. Auth redirect logic lives entirely in `App.vue` `created()` and `Login.vue` `created()`. Routes under `/app` are not protected at the router level.
- **No TypeScript:** All Vue 2 source files are plain JavaScript. TypeScript config (`tsconfig.json`) exists in the `vue/` directory but appears used only for Cypress support files.
- **Dual codebase:** `src/` contains a legacy AngularJS 1.x app (module `RTM`, controllers, HTML templates). `vue/` contains the replacement Vue 2 app. Both exist in the same repository.

## Anti-Patterns

### Auth tokens fetched directly in Login.vue instead of via ThinxApi

**What happens:** `Login.vue` makes a raw `fetch()` call to `/login` rather than using `ThinxApi`.
**Why it's wrong:** Bypasses the centralized API client, duplicates header construction logic, and couples the login page to the raw API shape.
**Do this instead:** Add a `login(username, password)` method to `ThinxApi` and call it from an `auth/login` Vuex action, following the same pattern used by all other store modules.

### mapGetters called in methods (not computed)

**What happens:** Several pages call `...mapGetters(...)` inside the `methods` block (e.g., `Devices.vue` line 137, `Header.vue` line 121). This returns bound getter functions that must be invoked as `this.getItems()`.
**Why it's wrong:** `mapGetters` is designed for the `computed` block. In `methods`, the returned functions are not reactive and the pattern is non-standard, making the code harder to follow.
**Do this instead:** Move `mapGetters` spreads to the `computed` block so values are automatically reactive: `computed: { ...mapGetters({ items: 'devices/getItems' }) }`.

### localStorage `authenticated` flag alongside Vuex auth state

**What happens:** Login writes `localStorage.setItem("authenticated", true)` as a plain string. `App.vue` reads `window.localStorage.getItem("authenticated") === 'true'` but the comment immediately after reads `this.isAuthenticated` from Vuex instead.
**Why it's wrong:** Two sources of truth for authentication status. The localStorage flag can become stale (tokens expired but flag still `"true"`), and the commented-out code suggests ongoing confusion.
**Do this instead:** Rely solely on JWT expiry via `auth/isTokenValid` to determine auth state; remove the `authenticated` flag.

## Error Handling

**Strategy:** Ad-hoc per page component

**Patterns:**
- Each page has local `error` and `message` data properties shown via `<b-alert>`
- Store actions return `{ success, response }` objects; pages check `result.success` and set local error message
- No global error boundary or centralized error handler
- Rollbar integration in `main.js` captures uncaught exceptions when `VUE_APP_ROLLBAR_ACCESS_TOKEN` is set

## Cross-Cutting Concerns

**Logging:** Rollbar error tracking via `vue-rollbar`, enabled conditionally on `VUE_APP_ROLLBAR_ACCESS_TOKEN` env var. No structured application logging otherwise.
**Validation:** No shared validation library. Forms use HTML5 `required` attributes and inline JS checks in submit handlers.
**Authentication:** JWT tokens stored in localStorage; restored and validated on page load in `App.vue`. No automatic token refresh mechanism implemented.
**Hostnames:** Resolved from env vars (`VUE_APP_API_HOSTNAME`, `VUE_APP_CONSOLE_HOSTNAME`, `VUE_APP_LANDING_HOSTNAME`) via `hostnames.js` mixin; protocol normalization applied.
**Responsive layout:** `vue/src/core/screenHelper.js` provides `isScreen(size)` utility using Bootstrap-compatible breakpoints.

---

*Architecture analysis: 2026-05-18*
