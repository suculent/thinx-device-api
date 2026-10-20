# Phase 44: Device List Parity - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), all 4 areas accepted by the operator

<domain>
## Phase Boundary

The Vue device list (`vue/src/pages/Devices/Devices.vue`) reads like the Legacy one: platform-named device icons, the
Legacy action icons on a single line, a Legacy-style platform bullet, and a visible warning on devices without an API
key. Repository rows (`vue/src/pages/Repositories/Repositories.vue` via `vue/src/components/List/List.vue`) show the same
platform bullet. Introduces two shared building blocks reused by Phases 45–47: `PlatformBullet` (DEV-04, REPO-01) and
`IconButton` (icon + aria-label + hover tip, DEV-03).

In scope: DEV-01..DEV-05, REPO-01. Vue console only (`services/console/vue`). No parent API change, no Legacy
(`services/console/src`) change.

Out of scope: Legacy console changes (Phase 48 batch), the Device Detail page beyond being the edit target, deploy keys
(Phase 45), Cypress suite repair (Phase 48 CI-07).

</domain>

<decisions>
## Implementation Decisions

### Device icon and category (DEV-01)
- **D-01:** The device icon is `device-icon platform-<base>` with `device-icon-symbol` inside. Background colour, class and
  label come from the base platform (`platform.split(":")[0]`), using the Legacy platform palette shared with the
  bullet. `device.category` is no longer rendered as a colour or label; no `grey-mint`-style class or text remains in
  the device list.
- **D-02:** Icon image is the Legacy `b_medium_NN.png` from `vue/src/assets/thinx/ioticons`, `NN` = `device.icon`
  zero-padded to two digits; missing/invalid icon falls back to `01`.
- **D-03:** The category filter pills are replaced by a platform filter (All + the base platforms present in the loaded
  device list), using the same display names as the bullet. `CATEGORY_COLORS` / `categoryColor()` go away.
- **D-04:** The icon shows in both views: grid cards and the first column of the table.

### Action icons and one-line Actions cell (DEV-02, DEV-03)
- **D-05:** Legacy icons: status `fa-heartbeat` (plus Legacy `fa-warning` alert/warning variants for `#e` / `#w`
  statuses), firmware/source `fa-cogs`, view log `fa-eye`, edit `fa-pencil` (opens Device Detail). Build uses the Legacy
  icomoon hammer glyph (`\e900`): port the icomoon font files from `services/console/src/assets/thinx/fonts/icomoon.*`
  into the Vue fonts and define only `.icomoon-hammer_icon`. Building state shows `fa-spin fa-circle-o-notch`; no source /
  unsupported shows `fa-ban`.
- **D-06:** Revoke (Vue-only action) stays as a `fa-trash` icon button, last in the row, keeping its existing
  confirmation and `data-cy="row-revoke"`.
- **D-07:** View log opens the existing `vue/src/components/BuildLogDialog` for `last_build_id`; disabled with the tip
  "No build yet" when the device has no build.
  *Revised 2026-10-13 (operator, 44-REVIEW WR-02):* `last_build_id` only moves on builds that produced an artifact.
  View log opens the newest build of the device from the build log list (`buildlog` store, GET /logs/build, newest
  first, as Legacy `deviceBuilds[udid][0]`), failed builds included, with `last_build_id` as the fallback; "No build
  yet" only when neither has a build.
- **D-08:** Shared `IconButton` component: icon, `aria-label` and native `title` tip from the same text. The Actions cell
  uses `white-space: nowrap`; at `lg` and wider buttons show icon + text, below `lg` icons only (text kept as
  aria-label + title). Existing `data-cy` hooks (`row-detail`, `row-build`, `row-revoke`, `device-row`, `device-card`)
  are preserved.

### Platform bullet (DEV-04, REPO-01)
- **D-09:** Shared `PlatformBullet.vue` takes the raw `platform` string, derives the base platform, renders the Legacy
  display name (arduino=Arduino, platformio=Platform.io, nodemcu=NodeMCU, pine64=Pine64, micropython=Micropython,
  mongoose=MongooseOS, nodejs=NodeJS, sigfox=Sigfox) with the Legacy colours from `custom.css:612-634` (arduino #00979d,
  platformio #ff9125, nodemcu #005780, micropython #3c393a, mongoose #0e7cad, nodejs #8ec64b, unknown #333333, sigfox
  #6d04d6; pine64 has no Legacy colour → neutral/unknown colour). No "Platform:" label.
- **D-10:** Unknown (`unknown_platform`, `unknown`, empty, null, unrecognised) renders the literal text `unknown` in the
  unknown colour; never `unknown_platform`.
- **D-11:** Repositories get the bullet through a per-column slot in the generic `List.vue` (default cell rendering
  unchanged for other `List.vue` users); Repositories passes `PlatformBullet` for the `platform` column.
- **D-12:** Platform sort and filter use the base platform.

### API-key warning and testing (DEV-05)
- **D-13:** Warning shows when `keyhash` is null, missing or an empty string.
- **D-14:** Icon `fa-warning` in orange (port Legacy `.api-key-indicator`), tip and aria-label: "No API key assigned. The
  device cannot check in until you assign one."
  *Revised 2026-10-13 (operator, 44-REVIEW CR-01):* tip and aria-label are Legacy's "No API Key assigned". `keyhash` is
  the key chosen for the device in the console (builds use it); check-in uses the key the device sends, so the old text
  was false. D-13 (warning on an empty `keyhash`) is unchanged.
- **D-15:** Placed next to the status icon in both grid and table views.
- **D-16:** Tests: new plain-node unit tests in `vue/tests/unit/*.cjs`, appended to the explicit `npm run test:unit`
  chain, covering `PlatformBullet`, `IconButton`, Devices (no `grey-mint`, icons, warning, one-line actions class) and
  the Repositories bullet. Cypress `data-cy` hooks kept; no new Cypress spec (suite repaired in Phase 48). `test:unit`
  is not run in CI, so it must be run locally before shipping. Ship via a normal `thinx-staging` push (console submodule
  first, then the parent gitlink), which deploys the Vue console; no Legacy build needed. Check that pipeline with
  `check-ci-gates.js pipeline --revision … --expect legacy-off` (Phase 43 follow-up).

### Claude's Discretion
- File locations for the new shared components (e.g. `vue/src/components/PlatformBullet/`, `IconButton/`) and the SCSS
  partial for the ported Legacy styles.
- How the platform display-name/colour map is shared between `PlatformBullet`, the device icon and the filter (one
  module).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Legacy reference markup: `services/console/src/app/views/devices.html` (icon 139-140, status 146-150, firmware
  158-161, build 166-175, log 180/258, edit 190-191/232, platform badge 184, API-key indicator 186-187/223-224).
- Legacy platform names `src/app/js/main.js:168-178`; base platform derivation `src/app/js/thinx-api.js:300,406`.
- Legacy CSS `src/assets/thinx/css/custom.css`: platform colours 612-634, `.platform-badge` 882, `.device-icon` 895,
  `.api-key-indicator` 993, `.device-icon-symbol` 1151, `.icomoon-hammer_icon` 28 (font at `/assets/thinx/fonts/icomoon.*`).
- Vue assets: `vue/src/assets/thinx/ioticons/b_medium_NN.png`, `vue/src/assets/thinx/external/*_logo_64_black.png`.
- Font Awesome 4.7.0 already imported (`vue/src/styles/theme.scss:12`); fa-heartbeat/cogs/eye/pencil/warning/trash/ban
  available. bootstrap-vue present.
- `vue/src/components/BuildLogDialog`; store action `buildFirmware({udid, source_id})`.

### Established Patterns
- `Devices.vue`: table rows 66-88 (raw `device.platform`, text buttons Detail/Build/Revoke), grid cards 101-122
  (category badge, `Platform:` label), `CATEGORY_COLORS` 161-169, `categoryColor()` 323, category pills 35-38, platform
  sort 213. No `<style>` block; styles live in `vue/src/styles/*.scss`.
- `List.vue:35-37` renders cells as `{{ item[header.prop] }}`; Repositories headers in `vue/src/store/repositories.js`.
- Unit tests compile SFC templates with vue-template-compiler and render with vue.runtime.common, `ignoredElements`
  `/^b-/` (pattern: `vue/tests/unit/milestone-v116.cjs`); SCSS tests compile `theme.scss` with sass
  (`table-row-contrast.cjs`).

### Integration Points
- Device fields from GET /device (`store/devices.js fetchItems`, backend `lib/thinx/devices.js:287-330`): `keyhash`,
  `platform`, `category`, `icon`, `status`, `firmware`, `source`, `auto_update`, `last_build_id`, `last_build_date`.
- Router: Device Detail route used by the existing `viewDevice(udid)`.

</code_context>

<specifics>
## Specific Ideas

- Match Legacy visuals (icon tile 48x48 with rgba(0,0,0,.3) and 8px radius; symbol 24px, zoom 2, #f9f9f9, 4px radius;
  badge margin-left 10px; API-key indicator margin-left 6px, orange).
- `IconButton` and `PlatformBullet` are designed for reuse by Phases 45–47 (deploy keys, repositories, history).

</specifics>

<deferred>
## Deferred Ideas

- Legacy console bugs carried from Phase 43 (THiNX Builder `undefined` toast, `deviceBuilds[udid].push`, overlay-first
  socket without `{init}`) stay in Phase 48.
- A Cypress spec for the device list waits for the Phase 48 CI-07 suite repair.

</deferred>
