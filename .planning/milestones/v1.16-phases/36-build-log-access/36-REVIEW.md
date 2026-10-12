---
phase: 36-build-log-access
reviewed: 2026-10-12T11:55:11Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/tests/unit/milestone-v116.cjs
  - services/console/vue/cypress/integration/device-detail.spec.js
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-10-12T11:55:11Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Scope: the G-36-3 gap-closure diff in the console submodule, `d4b1b41..5e5783a` (commits e84ef46, 6bf96eb, 5e5783a). The device Build History is now summary-only, the inline "Device Logs (last build)" card and its `deviceLogs` state are gone, and each row has an "Open build log" `b-button`. Findings already covered in 35-REVIEW.md / 35-REVIEW-FIX.md are not repeated here.

Verified:
- `LC_ALL=C node tests/unit/milestone-v116.cjs` exits 0.
- ESLint (no `--fix`) on the three files exits 0.
- No leftover reference to `deviceLogs`, `card-device-logs` or "Device Logs" remains in `vue/src`.
- `BuildLogDialog` is rendered under the same `v-if="device"` as the buttons, so `$refs.buildLogDialog` exists whenever a button can be clicked.
- `b-button` renders a native `type="button"`, so Enter and Space still work through the button itself.
- The aria-label "Open build log <id>" starts with the visible text, so it meets WCAG 2.5.3 (label in name).

The production change is small and correct. The problems are in the regression guards. The unit test's "inert row" check only inspects the `<tr>` vnode. A click or key handler moved onto a cell, which is the natural way to put the old behaviour back, would pass both the unit test and most of the e2e test. Three minor items are listed as Info.

## Warnings

### WR-01: The "inert row" guard checks only the `<tr>`. A cell-level click/keydown handler would pass both tests.

**File:** `services/console/vue/tests/unit/milestone-v116.cjs:326-331`, `services/console/vue/cypress/integration/device-detail.spec.js:83`
**Issue:** The plan's truth is that "clicking, tabbing or pressing Enter/Space on a row never fetches a full log". The unit test checks this only on `row.data.on` and the `<tr>`'s attrs:

```js
for (const row of devPage.rows) {
  assert.ok(!('role' in attrsOf(row)), ...);
  assert.ok(!('tabindex' in attrsOf(row)), ...);
  const on = (row.data && row.data.on) || {};
  for (const ev of ['click', 'keydown', 'keyup']) assert.ok(!(ev in on), ...);
}
```

None of these regressions would be caught:
- `<td tabindex="0" @click="openBuildLog(build)" @keydown.enter="openBuildLog(build)">` on the Build ID or Status cell;
- a handler on the `<code>` or `b-badge`;
- `@click.native` on the badge.

The unit test passes in all three cases. The e2e spec clicks only the first `<td>` (the date cell), so a handler on the Build ID or Status cell also passes e2e. The mutation evidence in the SUMMARY covers only "listener back on the `<tr>`", which is the one shape the test does catch.

**Fix:** Assert that inside the Build History card, the only vnodes with any listener are the `build-open-log` buttons, and that only those buttons are focusable:

```js
const withListeners = [];
(function walk(n) { if (!n) return;
  if (n.data && ((n.data.on && Object.keys(n.data.on).length) || (n.data.nativeOn && Object.keys(n.data.nativeOn).length))) withListeners.push(n);
  (n.children || []).forEach(walk); })(devPage.card);
assert.deepEqual(withListeners, devPage.buttons, 'only the Open build log buttons carry listeners in Build History');
for (const row of devPage.rows) for (const n of devPage.under ? devPage.under(row, () => true) : [])
  if (!devPage.buttons.includes(n)) assert.ok(!('tabindex' in attrsOf(n)) && !('role' in attrsOf(n)), 'no focusable/role cell in a Build History row');
```

(Expose `under` from `renderDeviceDetail` for the second loop.) In the e2e spec, click every non-button cell rather than only the first:

```js
cy.get('[data-cy=card-build-history] tbody tr').first().find('td').not(':last').each($td => cy.wrap($td).click());
```

## Info

### IN-01: The Vue-warning assertion only covers `_render()`, not instance construction or `loadDevice()`

**File:** `services/console/vue/tests/unit/milestone-v116.cjs:120-131`
**Issue:** `Vue.config.warnHandler` is installed after `new Vue({...})` and after `await vm.loadDevice()`. Construction-time warnings go to `console.error` and do not fail the test. Examples are a method that collides with a data or computed key (likely as the `overrides` map grows), an invalid `data` return, or an unknown option. The assertion message "DeviceDetail page renders without Vue warnings" therefore claims more than it checks. Nothing warns today: the run prints only the success line.
**Fix:** Install the collecting `warnHandler` before `new Vue(...)` and restore it in a `finally` after `_render()`.

### IN-02: A row with an empty `build_id` gets a button labelled "Open build log " that fetches `/logs/build/<list index>`

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:137` (call chain into `components/BuildLogDialog/BuildLogDialog.vue:17` and `store/buildlog.js` `normalizeBuildItems`)
**Issue:** 36-02-PLAN.md says "a button on a row with no build id issues no request". That is false. `normalizeBuildItems` sets `id` to `String(index)` exactly when `build_id` comes out as `''`. `BuildLogDialog.open` then uses `build.build_id || build.id`, so it requests `GET /logs/build/0` (or another index) and titles the modal "Build Log — 0". In practice this cannot happen with real data, because the backend inserts build documents with `_id = build_id` (`lib/thinx/buildlog.js:176`). It is a wrong invariant in the docs, though, and the new per-row control is built on it. The row-click handler had the same behaviour before this change.
**Fix:** Do not render or enable the control without an id, for example `<b-button v-if="build.build_id" ...>` with a `—` placeholder otherwise. Or make `BuildLogDialog.open` use only `build.build_id`. The second option touches a file this plan was not allowed to change, so do it in a follow-up.

### IN-03: `@getBuildDetail.all` length assertion passes on its first retry

**File:** `services/console/vue/cypress/integration/device-detail.spec.js:85-88`
**Issue:** `cy.wait('@getBuildDetail')` resolves on the first matching request. `.should('have.length', 1)` then passes as soon as one call has been recorded. If the request from a regressed row click were matched first and the button's request arrived a moment later, the check could still pass. Today a regressed row click would open the modal, and its backdrop would make the following button `.click()` fail. That failure, and not this assertion, is what actually catches the regression, so the comment on line 87 overstates what the assertion does.
**Fix:** Before clicking the button, assert that no request was made: `cy.get('@getBuildDetail.all').should('have.length', 0)` straight after the cell click(s). Keep the `length 1` check after the button click.

---

_Reviewed: 2026-10-12T11:55:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
