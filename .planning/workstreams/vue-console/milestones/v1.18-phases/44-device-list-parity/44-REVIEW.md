---
phase: 44-device-list-parity
reviewed: 2026-10-13T12:09:29Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - services/console/vue/src/pages/Devices/Devices.vue
  - services/console/vue/src/components/PlatformBullet/PlatformBullet.vue
  - services/console/vue/src/components/IconButton/IconButton.vue
  - services/console/vue/src/components/List/List.vue
  - services/console/vue/src/pages/Repositories/Repositories.vue
  - services/console/vue/src/utils/platforms.js
  - services/console/vue/src/styles/_platforms.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/src/fonts/icomoon/_icomoon.scss
  - services/console/vue/src/fonts/icomoon/icomoon.woff
  - services/console/vue/src/fonts/icomoon/icomoon.ttf
  - services/console/vue/tests/unit/device-list-parity.cjs
  - services/console/vue/package.json
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 44: Code Review Report

**Reviewed:** 2026-10-13T12:09:29Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: `git -C services/console diff cfff199..6a34102`, the 13 files listed above. The fonts are binary and were checked
only as byte copies: their sha1 matches `services/console/src/assets/thinx/fonts/icomoon.{woff,ttf}`. I read these for
context but did not review them: the device list producer `lib/thinx/devices.js:276-333`, device registration and
check-in (`lib/thinx/device.js`), the device edit route (`lib/router.device.js`), `/build` (`lib/router.build.js`),
`Util.responder`, the build notifier (`lib/thinx/notifier.js`), the platform plugins (`lib/thinx/plugins/*`), the worker
`builder` script, the Vue API client (`vue/src/core/api.js`), the `devices` / `buildlog` stores, `BuildLogDialog.vue`, and
the Legacy `devices.html`, `device.html` and `DevicesController.js`.

Checks that pass:
- Rendering is safe. There is no `v-html`. Status, firmware and the platform label reach the DOM only through
  interpolation or bound `title` / `aria-label`.
- All 73 `b_medium_NN.png` files exist, so `require.context` cannot throw for any value `symbolSrc` produces.
- Webpack may inline the small font and the PNGs as `data:` URLs. The CSP in `vue/default.conf` allows that through
  `default-src … data:`.
- `List.vue` without a slot renders as before.
- `tests/unit/device-list-parity.cjs` passes, with 0 FAIL lines.

The Critical finding concerns the API-key warning. Its trigger field, `keyhash`, only records a key chosen in the Legacy
console. Check-in does not use it, and nothing in Vue can set it. So the warning says something false, and on Vue it
cannot be cleared (CR-01). The warnings are:
- MicroPython repositories render as `unknown` (WR-01).
- View log can never show a failed build (WR-02).
- A unit check fails as soon as any later phase edits `store/repositories.js` (WR-03).

Not in scope, but relevant to D-16: under the default (Czech) locale on this machine, `npm run test:unit` stops at
`log-paging-store.cjs` ("History filter hint singular and plural", `(1200).toLocaleString()`). The `&&` chain then never
reaches `device-list-parity.cjs` (IN-05). The SUMMARYs ran it with `LC_ALL=C`.

## Critical Issues

### CR-01: The API-key warning reads a console-only assignment field and tells the owner that working devices "cannot check in"

**File:** `services/console/vue/src/pages/Devices/Devices.vue:266, 95-102, 169-176, 388-390`
**Issue:** `missingApiKey(device)` is true whenever `device.keyhash` is null, undefined or `''`. The tip says *"No API
key assigned. The device cannot check in until you assign one."* Neither half of that holds in this backend:

- Check-in does not use `keyhash`. Registration and check-in verify whatever key the device sends against the owner
  (`lib/thinx/device.js:1043`) and store its hash as **`lastkey`** (`device.js:1113`, `:528`). No code in `lib/` reads
  `keyhash`. The only reference is the copy into the list descriptor (`lib/thinx/devices.js:308`). Since 2022-03
  (`bd480458`) nothing in the API writes it either.
- `keyhash` is set only when an owner picks a key in the **Legacy** device page's "API Key" selector
  (`services/console/src/app/views/device.html:173`, sent by `thinx-api.js:800` through the field-copying `modify`
  handler). The Legacy text for the unset state is "No API Key assigned … We recommend to create one API Key per
  device … Key is required for build" (`device.html:191-197`). It says nothing about check-in.
- The Vue console cannot set it: there is no `keyhash` or API-key selector in `DeviceDetail.vue` or anywhere else in
  `vue/src`.

Failure scenario: a device flashed with a baked-in key registers and checks in every few minutes. Its "Last Seen" reads
"2 minutes ago". The row still shows the orange triangle "The device cannot check in until you assign one", because no
one ever used the Legacy selector. That covers every device registered by firmware and never edited in Legacy. On Vue
the warning is permanent: the owner can follow its advice and create a new API key, and the device still shows it.
The UI is wrong about device connectivity, the single most important fact on this page.

**Fix:** Match the tip to what the field means, and give Vue users a way to clear it, or drop the check-in claim:
```js
// Legacy meaning: no key chosen for this device in the console (used by builds), not a check-in precondition.
const API_KEY_TIP = 'No API key assigned to this device in the console. Builds need one.';
```
Then either add the key selector to `DeviceDetail.vue` (PUT `/device` with `changes.keyhash`; the route already
accepts it), or show the indicator only on devices with no check-in at all (`!device.lastupdate`), if "cannot check in"
is the message the operator wants. D-13/D-14 have to be revised either way. As locked, the spec cannot be met correctly.

## Warnings

### WR-01: MicroPython repositories (and devices) built from `python` render as `unknown` and are filed under the unknown pill

**File:** `services/console/vue/src/utils/platforms.js:11-28`
**Issue:** `PLATFORMS` only knows `micropython`. The backend's MicroPython detector is the `python` plugin
(`lib/thinx/plugins/plugins.json:3`, `lib/thinx/plugins/python/plugin.js:7` returns `"python"` for any repository with
`boot.py` or `main.py`). `devices.js:updatePlatform` writes that value to the source. The worker has a separate
`services/worker/platforms/python` descriptor, and `deployment.js:197-199` also accepts `python` and `mongooseos`.
`basePlatform('python')` returns `'unknown'`.

Failure scenario: an owner adds a MicroPython repository. Before this phase Repositories showed `python`. Now it shows
the grey `unknown` bullet, which reads as "detection failed" although the repository is supported and buildable. In
Devices, a device reporting `python` lands under the `unknown` pill together with genuinely unrecognised devices.
D-10's rule ("never show the raw string") turns a known platform into a false "unknown".
**Fix:** Map backend aliases onto their display key before the lookup, in the one module:
```js
const ALIASES = { python: 'micropython', mongooseos: 'mongoose' };
export function basePlatform(raw) {
  let key = String(raw == null ? '' : raw).split(':')[0].trim().toLowerCase();
  key = ALIASES[key] || key;
  return Object.prototype.hasOwnProperty.call(PLATFORMS, key) ? key : 'unknown';
}
```
Add `python` to the `basePlatform` unit cases.

### WR-02: View log uses `last_build_id`, which only moves on builds that produced an artifact, so a failed build's log is never reachable and "No build yet" can be false

**File:** `services/console/vue/src/pages/Devices/Devices.vue:427-433` (buttons `:129-135`, `:212-218`)
**Issue:** `hasBuild` / `openLastBuild` read `device.last_build_id`. The API writes that field only in
`Notifier.process`, after two early returns: no `outfile` (`lib/thinx/notifier.js:125-126`) and `outfile` containing
`<none>` (`:132-133`). The worker reports `OUTFILE="<none>"` for every build that ends without a binary
(`services/worker/builder:377`, `:1237`), and the exit-failure payload carries no `outfile` at all (Phase 43 WR-04).
So `last_build_id` only advances on successful builds. Legacy's eye opened `$rootScope.meta.deviceBuilds[udid][0]`,
the newest entry of the build log list (`DevicesController.js:149-153`), failures included.

Failure scenarios:
1. A device's last build succeeded on Monday. Tuesday's build fails. The user presses View log to see why, and gets
   Monday's successful log, with nothing to say it is the wrong build.
2. A new device whose first builds all fail shows the disabled eye "No build yet", although several builds exist.

Also, the list is not reloaded after Build, so even a successful new build is not reachable until a page reload.
**Fix:** Resolve the newest build for the udid from the build log store (the same `/logs/build` list History uses),
not from `last_build_id`. Or open the newest of `buildlog` items filtered by `udid` and fall back to `last_build_id`.
Rename the disabled label to what the code actually knows ("No successful build") if `last_build_id` stays.

### WR-03: A unit check fails permanently as soon as any later phase edits `store/repositories.js`

**File:** `services/console/vue/tests/unit/device-list-parity.cjs:662-671`
**Issue:** `store/repositories.js is unchanged since the phase start (cfff199)` runs `git diff cfff199 -- store/repositories.js`
against the **working tree** and asserts the output is empty. It is a one-time scope assertion for this phase, stored in
the permanent `test:unit` chain.

Failure scenario: Phase 45–47 reuse `PlatformBullet` / `IconButton` in repositories work, and the store itself names
the next change (`REPO-05: … Backend change required before this column can be added`, `store/repositories.js:15`).
The first commit that touches the store makes `test:unit` exit 1 with a message about phase 44, not about the change.
A dirty working tree does the same before anything is committed.
**Fix:** Delete the check. The rendering checks (`Repositories renders the unknown bullet …`) already cover REPO-01. If
a guard is wanted, assert the observable contract instead: `headers` still contains a `platform` prop.

## Info

### IN-01: Build failures always show "Build failed."; the API reason is never displayed (pre-existing, contradicts the UI-SPEC error copy)

**File:** `services/console/vue/src/pages/Devices/Devices.vue:425`
**Issue:** `this.error = (result && result.message) || 'Build failed.'`. The API replies `{ success, response }`
(`lib/thinx/util.js:38-41, 52-55`), and `core/api.js:parseResult` passes a failure through unchanged, so
`result.message` is always undefined. UI-SPEC "Error state" promises "the API `message` or `Build failed.`". The same
pattern was there before this phase.
**Fix:** `this.error = (result && (result.message || (typeof result.response === 'string' && result.response))) || 'Build failed.';`

### IN-02: The in-flight guard ends when `POST /build` returns, not when the build ends

**File:** `services/console/vue/src/pages/Devices/Devices.vue:403-426`
**Issue:** `/build` answers as soon as the job is dispatched or queued (`lib/router.build.js:53, 68-71`). The hammer is
enabled again within about a second, and a second click starts a second build of the same device while the first is
still running. Legacy kept the spinner until the build finished. UI-D17 chose this behaviour, so this is a note, not a
defect against the spec.
**Fix:** Keep the udid in `buildingUdids` until a Phase 43 Build Status terminal frame for that `udid` arrives (with a
timeout fallback).

### IN-03: `max-width: 240px` on the firmware `<td>` has no effect

**File:** `services/console/vue/src/styles/_platforms.scss:131-136`, `Devices.vue:91`
**Issue:** CSS 2.1 leaves `max-width` on table cells undefined. Measured in headless Chromium 147 with the same rules
inside a 100%-wide table, a long firmware cell was 659px wide in a 1000px container and 294px wide in a 900px one. The
cell takes spare width instead of stopping at 240px. The ellipsis still works because of `overflow: hidden`, but the
240px contract (UI-D15, backstop E5 long-text) is not what renders.
**Fix:** Wrap the text in a block that carries the limit:
`<td><span class="firmware-cell"><i class="fa fa-cogs" aria-hidden="true"></i>{{ … }}</span></td>`, with
`.firmware-cell { display: inline-block; max-width: 240px; vertical-align: middle; … }`.

### IN-04: A stale platform filter can re-engage on its own, and selections hidden by the filter stay in bulk actions

**File:** `services/console/vue/src/pages/Devices/Devices.vue:315-319, 396-398`
**Issue:** `activePlatform` falls back to `All` without resetting `platformFilter`. A user picks "Sigfox", revokes the
only Sigfox device (the list shows All), and later a reload brings a Sigfox device back. The list then narrows to Sigfox
again without a click. Separately, devices selected under one pill stay selected after switching pills, so "Revoke (3)"
can include rows the user cannot see. The selection part was already true with the category pills.
**Fix:** Add a watcher that sets `platformFilter = 'All'` when `activePlatform` falls back, and prune `selectedUdids` to
`filteredItems` when the filter changes, or show the hidden-selected count.

### IN-05: Under a non-C locale the `test:unit` chain never reaches `device-list-parity.cjs`

**File:** `services/console/vue/package.json:17`
**Issue:** `log-paging-store.cjs` fails under the Czech locale on this machine (`(1200).toLocaleString()`). That check
is outside this phase, but because the chain uses `&&`, the phase 44 checks D-16 relies on are skipped silently. The
SUMMARYs pass only because they set `LC_ALL=C`.
**Fix:** Pin the locale in the script (`"test:unit": "LC_ALL=C node … && …"`), or make the History hint check
locale-independent.

---

_Reviewed: 2026-10-13T12:09:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
