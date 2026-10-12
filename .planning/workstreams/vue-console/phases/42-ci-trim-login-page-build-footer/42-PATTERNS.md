# Phase 42: CI Trim, Login Page & Build Footer - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 11 (1 parent CI file, 9 in the `services/console` submodule, 1 binary asset)
**Analogs found:** 10 / 11 (the CI pipeline parameter has no in-file precedent)

`services/console` is a git submodule. All `vue/...` paths below were confirmed tracked with `git ls-files` run inside
`services/console/vue`. Paths are relative to `services/console/vue/` unless they start with `.circleci/` or `services/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.circleci/config.yml` (parent): `parameters:` + gated workflow (CI-05) | config | batch (CI) | job-level `parameters:` blocks in the same file, lines 18, 146, 249, 558 | partial (no top-level pipeline params yet) |
| `.circleci/config.yml`: snyk filters / moved console monitors (CI-04) | config | batch | `snyk-monitor-api` (lines 1008-1021) | exact |
| `src/components/AppFooter/AppFooter.vue` (new) | component | render-only (env -> view) | footer blocks in `Login.vue` 91-95, `Layout.vue` 11-13; component shell like `src/components/Layout/Layout.vue` 17-33 | role-match |
| `src/pages/Login/Login.vue` | component (page) | request-response (unchanged login) | itself | exact |
| `src/pages/PasswordReset/PasswordReset.vue` | component (page) | request-response | `Login.vue` footer | exact |
| `src/components/Layout/Layout.vue` | component (layout) | render | itself | exact |
| `src/components/Layout/Layout.scss` | style | n/a | `.contentFooter` lines 30-35 | exact |
| `src/styles/_auth.scss` | style | n/a | itself | exact |
| `vue.config.js` | config | build-time env injection | its own `VUE_APP_BUILD_HASH` / `VUE_APP_ENVIRONMENT` blocks | exact |
| `src/main.js` (read only; Rollbar `code_version` line 63) | config | n/a | n/a | no change expected |
| `tests/unit/footer-hostnames.cjs` (modify) + new `tests/unit/login-footer.cjs` (or similar) + `package.json` `test:unit` | test | transform | `tests/unit/footer-hostnames.cjs`, `tests/unit/milestone-v116.cjs` | exact |
| `public/assets/thinx/img/logo_white_200.png` (new, copy) | asset | file-I/O | `public/images/people/*.jpg`, `public/favicon.ico` (tracked public assets); source `services/console/src/assets/thinx/img/logo_white_200.png` (tracked in submodule) | exact |

## Pattern Assignments

### `.circleci/config.yml` — CI-04 (Snyk monitors on main)

**Analog:** `snyk-monitor-api`, lines 1008-1021. Copy this shape for `snyk-monitor-console-vue` (and console-classic):
```yaml
      - snyk-container-monitor:
          name: snyk-monitor-api
          image: thinxcloud/api
          tag: latest
          dockerfile: ./Dockerfile
          context:
            - dockerhub
          # Scans the Hub copy, which only main publishes now.
          requires:
            - api-hub
          filters:
            branches:
              only:
                - main
```
`snyk-container-monitor` job params (lines 557-574): `image`, `tag` (default `latest`), `registry` (default `docker.io`),
`dockerfile`, `submodules` (bool). So for the Hub pull simply drop the `registry:` line.

Current state to change:
- `snyk-code-monitor` (991-998) and `snyk-oss-monitor` (1000-1007): filters `thinx-staging` + `main` -> `main` only.
- `snyk-monitor-console-vue` (1064-1083): today `image: thinx/console`, `tag: vue`, `registry: registry.thinx.cloud:5000`,
  context `dockerhub, thinx-docker-repo, console`, requires `vue-console-registry`, branches `thinx-console, thinx-staging`.
  Target (D-06): `image: thinxcloud/console`, `tag: vue`, no `registry:`, keep `dockerfile: services/console/vue/Dockerfile`
  and `submodules: true`, context `dockerhub` (keep `console` only if the submodule checkout needs it), requires
  `vue-console-hub`, branches `main`.
- `snyk-monitor-console-classic` (1038-1062): target `image: thinxcloud/console`, `tag: latest`, no registry,
  requires `console-classic-hub`, branches `main`, moved into the gated workflow (D-07). Its long context comment
  (1046-1053) about name collision becomes obsolete when `thinx-docker-repo` is dropped; rewrite it.
- `snyk-monitor-base` (1023-1036): untouched.

### `.circleci/config.yml` — CI-05 (gate)

**Analog for parameter syntax:** job-level params, e.g. lines 557-574 (`type: boolean`, `default: false`). The file
has no top-level `parameters:` today (line 1 `version: 2.1`, then `orbs:` line 2, `commands:` line 7). Insert after `orbs:`:
```yaml
# v1.18 CI-05: legacy console image builds paused. Phase 48 (CI-06) flips the default to true.
parameters:
  build_legacy_console:
    type: boolean
    default: false
```
Workflow structure: `workflows:` at 853, single workflow `main:` at 859 with no `when:`. Move the two
`build-console-classic` entries (887-907, names `console-classic-registry` / `console-classic-hub`, contexts
`thinx-docker-repo, console`, filters `thinx-staging` / `main`) plus `snyk-monitor-console-classic` into a new sibling
workflow, e.g.:
```yaml
  # v1.18 CI-05
  legacy-console:
    when: << pipeline.parameters.build_legacy_console >>
    jobs:
      - build-console-classic: { name: console-classic-registry, ... unchanged filters ... }
      - build-console-classic: { name: console-classic-hub, ... }
      - snyk-container-monitor: { name: snyk-monitor-console-classic, requires: [console-classic-hub], filters main }
```
Cross-workflow `requires` is not allowed, so the classic monitor must live in the same gated workflow as
`console-classic-hub`. Keep the existing "One registry per branch" comment (880-885) with the remaining Vue jobs.

### `src/components/AppFooter/AppFooter.vue` (new; component, render)

**Template contract:** UI-SPEC UI-D08 block (copy verbatim). Existing markup being replaced, `Login.vue` lines 91-95:
```html
    <footer class="auth-footer">
      &copy; 2018 - 2026 <a :href="this.$hostnames.CONSOLE" target="_blank">THiNX Console</a> by
      <a :href="this.$hostnames.LANDING" target="_blank">THiNX Cloud</a>
      <span class="build-id" style="display:block;font-size:0.7rem;opacity:0.5;margin-top:4px">{{ buildHash }}</span>
    </footer>
```
**Script shell to copy** (`Layout.vue` lines 23, 30-32 — mixin import + declaration form the sweep regex requires):
```js
import hostnameMixin from '@/mixins/hostnames';
export default {
  name: 'Layout',
  mixins: [hostnameMixin],
```
The `footer-hostnames.cjs` sweep checks `/import\s+hostnameMixin\s+from\s+['"]@\/mixins\/hostnames['"]/` and
`/mixins:\s*\[[^\]]*\bhostnameMixin\b[^\]]*\]/` in every file that mentions `$hostnames` — AppFooter must match both.
Current per-page data pattern (`Login.vue` data()): `buildHash: process.env.VUE_APP_BUILD_HASH || ''` — move into
AppFooter as validated computed values (UI-D11 `/^\d{4}$/` and > 2018; UI-D12 `/^[0-9a-f]{7}$/i`). Use a `variant`
prop (`'auth'` -> `class="auth-footer"`, `'layout'` -> `class="contentFooter"`). Keep the root element a `<footer>`
so the test's `/<footer[\s\S]*?<\/footer>/` extraction keeps working on AppFooter itself.
Pages register it the same way Layout registers children: `import AppFooter from '@/components/AppFooter/AppFooter';`
+ `components: { ..., AppFooter }`. Pages that no longer read `$hostnames` in template may keep `hostnameMixin` (Login
and PasswordReset still use `$hostnames.API`).

### `src/pages/Login/Login.vue`

Lines to change:
- 4-7: `<Widget class="widget-auth mx-auto" title="THiNX Login">` -> title per D-15; insert `<img class="auth-logo" ...>` (UI-D01) before it inside `<b-container>` (line 3).
- 61-63: `<b-button type="submit" variant="danger" class="auth-btn" size="sm">` -> `variant="success"`.
- 64-85: current order is Login button, "Don't have an account?" p (64), Create an Account (65-67), `.social-buttons` (68-85). Move the whole `<div class="social-buttons">` block (68-85, hrefs `this.$hostnames.API + '/oauth/google' + oauthReturnQuery` untouched) to right after the Login button.
- 91-95: replace footer with `<AppFooter variant="auth" />`.
- Script: `components: { Widget }` -> add AppFooter; drop `buildHash` from `data()`. Do not touch `login()`, imports of `fetchWithCsrf` etc.

### `src/pages/PasswordReset/PasswordReset.vue`

Footer at lines 95-98 (same markup as Login minus build-id) -> `<AppFooter variant="auth" />`; `mixins: [hostnameMixin]` at 111 stays (line 202 uses `$hostnames.API`).

### `src/components/Layout/Layout.vue` + `Layout.scss`

Footer lines 11-13 -> `<AppFooter variant="layout" />`; add to `components: { Sidebar, Header, ImpersonationBanner }` (line 31). After that Layout no longer reads `$hostnames`; the mixin may stay or go (sweep only checks readers).
`Layout.scss` 30-35:
```scss
.contentFooter {
  position: absolute;
  bottom: 15px;
  color: $text-muted;   // -> $text-color (UI-D09), add a { color: $gray-400; underline; hover/focus $white }
  padding: 0 $content-padding;
}
```

### `src/styles/_auth.scss`

Existing hooks to edit: `.auth-page { padding-top: 10vh; height: 100vh; }` (-> `min-height`, UI-D10);
`.widget-auth { max-width: 385px; ... .widget-auth-info { color: #888 } }`; `.social-buttons { display: flex; flex-direction: column; gap: 10px; margin-top: $spacer; margin-bottom: $spacer; ... }` (-> row, gap 8px, 460px stack media query, UI-D06; brand `.social-button--github/--google` blocks unchanged);
`.auth-footer { margin-bottom: 25px; font-size: 13px; color: #636c72; text-align: center; @media (min-height: 600px) { position: fixed; ... } }` (-> `$text-color`, link colours, 800px threshold).
Add `.auth-logo` (UI-D02) and `.auth-page .widget-auth { background: rgba(0,0,0,0.7); }` (UI-D03). Update the
"shaped to match the red Login CTA" comment in `.social-buttons`.

### `vue.config.js`

Current hash block (lines 3-16):
```js
try {
  process.env.VUE_APP_BUILD_HASH = (
    process.env.VUE_APP_BUILD_HASH
    || process.env.CIRCLE_SHA1
    || execSync('git rev-parse --short HEAD').toString().trim()
  ).slice(0, 8);
} catch {
  if (!process.env.VUE_APP_BUILD_HASH) process.env.VUE_APP_BUILD_HASH = 'dev';
}
```
Change `.slice(0, 8)` -> `.slice(0, 7)`. Add the year with the same "respect env if set" idiom as `VUE_APP_ENVIRONMENT` (lines 24-26):
```js
if (!process.env.VUE_APP_ENVIRONMENT) {
  process.env.VUE_APP_ENVIRONMENT = ...;
}
```
-> `if (!process.env.VUE_APP_BUILD_YEAR) process.env.VUE_APP_BUILD_YEAR = String(new Date().getUTCFullYear());`
The `'dev'` fallback may stay for Rollbar (`src/main.js` line 63 `code_version: process.env.VUE_APP_BUILD_HASH`) because AppFooter's 7-hex regex hides it (D-11).

### Tests (`tests/unit/*.cjs`, `package.json`)

`test:unit` (package.json line 17) is a `&&` chain of plain `node tests/unit/X.cjs`; append any new file to it. Not run in CI — run locally.

**`footer-hostnames.cjs`** must be updated: its `FOOTERS` list (Layout, Login, PasswordReset) extracts the first
`<footer>` from each page template; after extraction those pages contain `<AppFooter/>` instead, so `renderFooter`
returns "no <footer> in template". Change it to render `src/components/AppFooter/AppFooter.vue` (it has a real
`<footer>` root; `vmOptions` must also pass `props`/`computed` and `propsData: { variant }`) and add a source check that
each of the three files contains `<AppFooter`. Reusable helpers in that file: `loadModule` (ESM-to-Function loader,
`resolveImport` with `@/mixins/hostnames` real and everything else stubbed), `collectAnchors`, `check(name, cond)` +
`process.exit(failures ? 1 : 0)`. Set env before render like it does:
```js
process.env.VUE_APP_CONSOLE_HOSTNAME = 'console.thinx.cloud';
```
-> for the hash cases set `process.env.VUE_APP_BUILD_HASH` to `'a1b2c3d'`, `''`, `'dev'`, delete it, and assert presence/absence of `build-hash` span and `·` (collect text nodes analogously to `collectAnchors`). Note `process.env` is read at render time in node (no vue-cli inlining), so computed properties must read `process.env.*` inside the getter, not at module top, for the per-case env to take effect.

**`milestone-v116.cjs`** style (node:assert/strict, `compiler.parseComponent` + `compiler.compile` error check,
`Vue.config.ignoredElements = [/^b-/]`) suits static Login.vue checks: no `THiNX Login`, `variant="success"` on submit,
index order `type="submit"` < `social-buttons` < `Don't have an account`, no `2026` in AppFooter / three page footers.

### `public/assets/thinx/img/logo_white_200.png`

Copy byte-for-byte from `services/console/src/assets/thinx/img/logo_white_200.png` (tracked in the console submodule).
Existing tracked public assets are referenced by absolute URL (`public/images/people/*.jpg`); vue-cli copies `public/` to `dist/` verbatim.

## Shared Patterns

### Hostnames mixin (all footer readers)
**Source:** `src/components/Layout/Layout.vue` 23, 32; enforced by `tests/unit/footer-hostnames.cjs` sweep. Apply to AppFooter.

### Build-time env injection
**Source:** `vue.config.js` 3-26. Only `VUE_APP_*` vars are inlined; set them on `process.env` before `module.exports`.

### Deploy order
Console submodule commit/push on `thinx-staging` first, then parent pointer bump + CI edit (CI-05 in its own commit, D-02), push parent `thinx-staging` only.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| top-level `parameters:` + `when:` workflow in `.circleci/config.yml` | config | batch | First pipeline parameter / conditional workflow in this config; use CircleCI 2.1 docs syntax shown above and validate with `circleci config validate` + MCP `validate_config` |
| CircleCI API bypass runbook snippet (D-04) | doc | request-response | No existing API-trigger snippet; `curl -X POST https://circleci.com/api/v2/project/gh/suculent/thinx-device-api/pipeline -H "Circle-Token: $CIRCLECI_TOKEN" -H 'Content-Type: application/json' -d '{"branch":"thinx-staging","parameters":{"build_legacy_console":true}}'` (verify slug) |

## Metadata

**Analog search scope:** `.circleci/config.yml`; `services/console/vue/{src,tests/unit,public,vue.config.js,package.json}`; `services/console/src/assets/thinx/img`
**Files scanned:** ~14
**Pattern extraction date:** 2026-10-12
