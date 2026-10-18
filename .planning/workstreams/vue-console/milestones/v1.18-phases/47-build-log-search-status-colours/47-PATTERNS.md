# Phase 47: Build Log Search & Status Colours - Pattern Map

**Mapped:** 2026-10-14
**Files analyzed:** 13 (new/modified)
**Analogs found:** 13 / 13 (one partial: no debounce exists in `src/`)

All paths below are relative to `services/console/vue/` (git submodule `services/console`). Every analog path was checked with `git ls-files` from inside the submodule: all tracked.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/BuildLogDialog/BuildLogDialog.vue` | component (modal) | request-response + transform | itself (extend in place) + `src/components/IconButton/IconButton.vue` | exact |
| `src/utils/buildLog.js` (add `buildLogSearch`, `escapeRegExp`) | utility | transform (pure) | `buildLogText()` / `buildStatusVariant()` in same file | exact |
| `src/pages/Visits/Visits.vue` | page | request-response | `src/pages/Devices/DeviceDetail.vue` lines 158-161, 180, 201, 210, 311 | exact |
| `src/components/Notifications/Notifications.vue` | component | request-response | itself, lines 11-29, 101-113 | exact |
| `src/components/Notifications/Notifications.scss` | style | n/a | itself (`.header`, `.footer` blocks) | exact |
| `src/pages/History/History.vue` | page | n/a (consistency) | `DeviceDetail.vue:159` (View with `p-0`) | exact |
| `src/pages/Devices/DeviceDetail.vue` | page | n/a (placeholder only) | itself line 160 | exact |
| `src/styles/_variables.scss` | config (tokens) | n/a | itself (`$modal-content-bg` line 255, `!default` style) | exact |
| `src/styles/_build-log.scss` (new) | style partial | n/a | `src/styles/_settings-pages.scss` / `_platforms.scss` (`.icon-button`, `.actions-cell` lines 89-121) | role-match |
| `src/styles/theme.scss` | config | n/a | itself line 27 (`@import 'settings-pages';`) | exact |
| `tests/unit/build-log-search.cjs` (new) | test | n/a | `tests/unit/milestone-v116.cjs` (load/render harness) + `tests/unit/table-row-contrast.cjs` (sass compile, `check`/`finish`) | exact |
| `tests/unit/milestone-v116.cjs` (WR-01, IN-01) | test | n/a | itself lines 122-150; `tests/unit/deploy-key-actions.cjs:108-119` (`withWarnings`) | exact |
| `cypress/integration/device-detail.spec.js` (WR-01 e2e, IN-03) | test (e2e) | n/a | itself lines 100-112 | exact |
| `package.json` (`test:unit` chain, line 17) | config | n/a | itself | exact |

## Pattern Assignments

### `src/components/BuildLogDialog/BuildLogDialog.vue` (component, request-response)

**Analog:** current file (all 43 lines). Keep the `requestId` stale guard; change `open()`, `@hidden`, states, add search.

Current template (lines 1-8) — to be replaced per UI-B01/B04/B09:
```vue
<b-modal ref="modal" :title="'Build Log — ' + buildId" size="xl" ok-only ok-title="Close" @hidden="requestId++">
  <div v-if="loading" role="status"><b-spinner small /> Loading build log…</div>
  <b-alert v-else-if="error" variant="danger" show>{{ error }} <b-button size="sm" @click="load">Retry</b-button></b-alert>
  <pre v-else-if="text" class="build-log-text" data-cy="full-build-log">{{ text }}</pre>
  <p v-else class="text-muted">No log output is available for this build yet.</p>
</b-modal>
```
Changes: `@hidden="onHidden"`; `Retry` -> `variant="default"` + `fa fa-refresh` + `<span class="button-text">Try again</span>` + `data-cy="build-log-retry"`; empty `<p class="mb-0" data-cy="build-log-empty">` (drop `text-muted`); search bar `v-if="text && !loading && !error"` placed before the state chain; `<pre ref="log">` with `v-for` segments written on ONE line (whitespace in `<pre>` is preserved).

Current `open()` / `load()` (lines 16-37) — the stale-guard shape to keep:
```js
open(build) {
  this.buildId = build.build_id || build.id || '';   // D-15: drop `|| build.id`, return Promise.resolve() when id empty, before modal.show()
  this.text = '';
  this.error = null;
  this.$refs.modal.show();
  return this.load();
},
async load() {
  const request = ++this.requestId;
  this.loading = true;
  this.error = null;
  try {
    const result = await this.$store.dispatch('buildlog/fetchBuildDetail', this.buildId);
    if (request !== this.requestId) return;
    if (!result || !result.success) throw new Error('unavailable');
    this.text = buildLogText(result.response);
  } catch (e) {
    if (request === this.requestId) this.error = 'Could not load this build log.';
  } finally {
    if (request === this.requestId) this.loading = false;
  }
},
```
New `onHidden()`: `this.requestId++; this.loading = false; clearTimeout(this.debounceTimer);` (also in `beforeDestroy`). Search state: `searchInput`, `term`, `current`, `debounceTimer` in `data()`; `result` computed = `buildLogSearch(this.text, this.term)`; `countText`/`countSpeech` computed; `watch` on `term`/`text` -> `current = 0` + `$nextTick(scrollToCurrent)`.

Delete the scoped `<style>` (lines 41-43, hard-coded `#1e1e1e`/`#ddd`); rule moves to `_build-log.scss`.

**IconButton usage** (`src/components/IconButton/IconButton.vue` lines 1-8, 17-31): props `icon`, `label`, `variant='default'`, `disabled`; `inheritAttrs: false` so `data-cy` lands on the inner `b-button`; emits `click` only when not disabled.
```vue
<span class="icon-button" :title="label">
  <b-button size="sm" :variant="variant" :aria-label="label" :disabled="disabled" v-bind="$attrs" @click="onClick">
    <i :class="icon" aria-hidden="true"></i>
    <span class="icon-button__text d-none d-lg-inline">{{ label }}</span>
  </b-button>
</span>
```
Import as `import IconButton from '@/components/IconButton/IconButton';` and register in `components`. Styles in `src/styles/_platforms.scss:89-121` (`.icon-button:not(:last-child)` has the 4px margin that UI-B01 resets inside `.build-log-search`).

**Debounce:** no existing `setTimeout`/`debounce` in any `src/**/*.vue` (grep empty). Use a plain `clearTimeout`/`setTimeout(…, 200)` stored on `this.debounceTimer`; no lodash import.

---

### `src/utils/buildLog.js` (utility, pure transform)

**Analog:** same file. Conventions: named `export function`, short leading comment explaining the why, no imports, no classes.
```js
// One colour per normalized build status, shared by every build list (TIMEOUT is not a failure colour).
export function buildStatusVariant(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'OK') return 'success';
  ...
  return 'danger';
}
```
Add `export function buildLogSearch(text, term, limit = 1000)` returning `{ segments, count, capped }` per UI-B03 (RegExp `'gi'` over escaped term, stop at `limit + 1`, guard zero-length). Keep it `export function name(` form: the unit-test loader rewrites exactly that pattern (`milestone-v116.cjs:42`: `.replace(/export function (\w+)/g,'module.exports.$1 = function $1')`). A non-exported helper `function escapeRegExp` is fine (it stays in scope). Forbidden: `toLowerCase().indexOf`.

---

### `src/pages/Visits/Visits.vue` (page, request-response)

**Analog:** `src/pages/Devices/DeviceDetail.vue`.

View button (DeviceDetail.vue:159) — copy verbatim, rename `build` -> `item`:
```vue
<b-button v-if="build.build_id" size="sm" variant="link" class="p-0" data-cy="build-open-log" :aria-label="'Open build log ' + build.build_id" @click="openBuildLog(build)"><i class="la la-eye" aria-hidden="true"></i> View</b-button>
```
Dialog wiring (DeviceDetail.vue:180, 201, 210, 311):
```vue
<BuildLogDialog ref="buildLogDialog" />
```
```js
import BuildLogDialog from '@/components/BuildLogDialog/BuildLogDialog';
components: { BuildLogDialog },   // Visits today: components: { CheckinsTimeline } (line 116) -> add
openBuildLog(build) { this.$refs.buildLogDialog.open(build); },
```
Current card to change (Visits.vue ~75-100): header `<th>Download</th>` -> `<th>Actions</th>`; time `<td class="text-muted" style="white-space:nowrap">` -> `<td class="text-nowrap">`; actions `<td class="actions-cell">` with `<span class="build-actions">` [View, existing Download] when `item.build_id`, else UI-B15 placeholder; `No builds yet.` loses `text-muted`. Existing Download button (keep unchanged):
```vue
<b-button v-if="item.build_id" size="sm" variant="primary" data-cy="build-download" @click="downloadArtifact(item)">Download</b-button>
```
Status badge already uses `badgeVariant(status) { return buildStatusVariant(status); }` (line 226-227) — keep.

---

### `src/components/Notifications/Notifications.vue` (component)

**Analog:** itself, lines 11-29 (row) and 101-113 (status helpers).
```vue
<b-list-group-item v-for="build in recentBuilds" :key="..." class="listGroupItem" button @click="openBuildLog(build)">
  ...
  <h6 class="m-0 mb-1 text-ellipsis">{{ build.name || shortUdid(build.udid) }}</h6>
  <p class="deemphasize text-ellipsis m-0">
    <span :class="statusTextClass(build)">{{ build.status || 'UNKNOWN' }}</span>
```
Change: `:button="!!build.build_id"`, listener only when id present (e.g. `v-on="build.build_id ? { click: () => openBuildLog(build) } : {}"` — any form that leaves `data.on` empty for no-id rows, which the unit test asserts), `:class="['listGroupItem', { 'listGroupItem--static': !build.build_id }]"`, `data-cy="recent-build"`; `h6`/`p` -> `<span class="notification-title text-ellipsis">` / `<span class="notification-meta deemphasize text-ellipsis">`; `'UNKNOWN'` -> `'—'`. Remove `isSuccess` (lines 101-103). Keep `statusGlyph`/`statusIconClass`/`statusTextClass` (lines 104-113), all via `buildStatusVariant`.

### `src/components/Notifications/Notifications.scss`
Analog: same file; it starts with `@import '../../styles/app';` and uses flat class blocks (`.header`, `.footer` lines 13-32). Append `.notification-title`, `.notification-meta`, `.listGroupItem--static` (+ `:hover`) per UI-B12.

---

### `src/pages/History/History.vue` / `src/pages/Devices/DeviceDetail.vue` (consistency)

- History.vue:130 View button: add `class="p-0"` (keep `@click.stop`, the row-click exists there).
- History.vue:39 and :110 `<td style="white-space:nowrap">` -> `<td class="text-nowrap">` (UI-B14 names the date cell of the builds table; line 110 is that one — check which table line 39 belongs to before touching it).
- DeviceDetail.vue:160 `<span v-else class="text-muted">—</span>` -> UI-B15 placeholder `<span data-cy="build-no-log"><span aria-hidden="true">—</span><span class="sr-only">No build log</span></span>`. Same placeholder in Visits.

---

### `src/styles/_variables.scss`, `src/styles/_build-log.scss` (new), `src/styles/theme.scss`

- Tokens follow `$modal-content-bg: darken($default, 20%) !default;` (line 255): `$build-log-bg: #1E1E1E !default;` etc. (six tokens, UI-SPEC Design System table).
- New partial analog: `_platforms.scss` 89-121 (plain global classes, theme variables, no scoping). `.build-log-search` uses `$modal-content-bg` for the sticky background.
- `theme.scss`: add `@import 'build-log';` after line 27 `@import 'settings-pages';`.

---

### `tests/unit/build-log-search.cjs` (new test)

**Analog A — module/SFC loading** (`milestone-v116.cjs` lines 1-27, 41-42):
```js
const fs = require('fs'); const path = require('path');
const assert = require('node:assert/strict');
const compiler = require('vue-template-compiler');
const Vue = require('vue/dist/vue.runtime.common.js');
Vue.config.productionTip = false; Vue.config.devtools = false; Vue.config.ignoredElements = [/^b-/];
let renderError = null;
Vue.config.errorHandler = err => { renderError = err; };
const root = path.resolve(__dirname, '../../src');
function load(file, extra = {}) { /* parseComponent, compile, strip imports, export default -> module.exports.default, new Function(deps) */ }
const logModule = {exports:{}};
new Function('module', fs.readFileSync(path.join(root,'utils/buildLog.js'),'utf8').replace(/export function (\w+)/g,'module.exports.$1 = function $1'))(logModule);
```
`load()` passes imported names as `deps` (e.g. `BuildLogDialog: {}`, `buildStatusVariant: ...`); the new test must add `buildLogSearch`, `IconButton: {}` to the deps for the dialog/Visits.

**Analog B — render + vnode walk** (`milestone-v116.cjs` lines 122-150, `renderDeviceDetail`): `compiler.compileToFunctions(sfc.template.content)`, `new Vue({ render, staticRenderFns, data, computed, methods: Object.assign({}, def.methods, overrides), components: { BuildLogDialog: { render: h => h('div') } } })`, `vm._render()`, recursive `walk` collecting nodes, `cy = node => node.data.attrs['data-cy']`, `under(top, keep)`, `textOf`. For the dialog stub `$refs.modal = { show(){} }` and `$store = { dispatch }` on the vm.

**Analog C — SCSS compile + reporting** (`table-row-contrast.cjs` lines 21-37): `require('sass')`, `STYLES = path.join(VUE_ROOT,'src','styles')`, `check(name, cond, detail)` printing `ok   `/`FAIL `, `finish()` -> `process.exit(failures ? 1 : 0)`.

Append `&& node tests/unit/build-log-search.cjs` to `package.json:17` `test:unit`.

---

### `tests/unit/milestone-v116.cjs` (WR-01, IN-01)

IN-01 target (lines 134-138), current:
```js
const warnings = [], prevWarn = Vue.config.warnHandler;
Vue.config.warnHandler = msg => warnings.push(msg);
const vnode = vm._render();
Vue.config.warnHandler = prevWarn;
```
Move install above `new Vue(...)` (line 128) and restore in `finally`, the shape of `deploy-key-actions.cjs:108-119`:
```js
function withWarnings(fn) {
  const warnings = [];
  const prev = Vue.config.warnHandler;
  Vue.config.warnHandler = (msg) => warnings.push(msg);
  renderError = null;
  let out;
  try { out = fn(); } finally { Vue.config.warnHandler = prev; }
  ...
}
```
WR-01: reuse `card`, `rows`, `buttons`, `under` returned by `renderDeviceDetail`; assert every node under `card` with `data.on || data.nativeOn` is in `buttons`, and no non-button node has `attrs.tabindex` / `attrs.role`. Mutation evidence: re-render with a patched template string (handler on `<td>`, on `<code>`, `@click.native` on `b-badge`) and assert the check fails.

---

### `cypress/integration/device-detail.spec.js` (e2e)

Analog: itself lines 100-112. Replace line 106 (first-cell click) with
`cy.get('[data-cy=card-build-history] tbody tr').first().find('td').not(':last').each($td => cy.wrap($td).click());`
then `cy.get('@getBuildDetail.all').should('have.length', 0);` before the button click; keep `cy.wait('@getBuildDetail')` and `.should('have.length', 1)`; fix the comment on old line 111 ("A request from the row click above would make this 2").

## Shared Patterns

### Status mapping
**Source:** `src/utils/buildLog.js:27-33` `buildStatusVariant`. **Apply to:** Visits (`badgeVariant`), Notifications (3 helpers), History, DeviceDetail. No template names a status variant literally; no `=== 'OK'`.

### Open build log
**Source:** `DeviceDetail.vue:159,180,311`. One `<BuildLogDialog ref="buildLogDialog" />` per page, `openBuildLog(build) { this.$refs.buildLogDialog.open(build); }`, View only `v-if="x.build_id"`. Dialog `open()` is the second guard (refuses empty `build_id`).

### Inert log text
**Source:** `buildLog.js:1-3` comment. Only `{{ }}` interpolation; no `v-html`/`innerHTML`/`domProps`.

### Unit-test harness
Plain node `.cjs`, `node:assert/strict`, `vue-template-compiler` + `vue.runtime.common`, `ignoredElements: [/^b-/]`, explicitly chained in `package.json:17` (not run in CI; run locally).

## No Analog Found

| File / concern | Role | Reason |
|---|---|---|
| Debounce in `BuildLogDialog.vue` | component logic | No debounce anywhere in `src/`; use plain `setTimeout`/`clearTimeout` (UI-B02) |
| Scroll-into-view of current `<mark>` | component logic | No existing scroll helper; set `pre.scrollTop` per UI-B06 formula |

## Metadata

**Analog search scope:** `src/components`, `src/pages`, `src/utils`, `src/styles`, `tests/unit`, `cypress/integration` (all under `services/console/vue`)
**Files scanned:** ~15
**Pattern extraction date:** 2026-10-14
