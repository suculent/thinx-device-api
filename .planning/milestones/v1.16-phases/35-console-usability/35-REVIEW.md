---
phase: 35-console-usability
reviewed: 2026-10-12T10:42:06Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - services/console/src/app/js/controllers/DeploykeyController.js
  - services/console/src/app/js/thinx-api.js
  - services/console/src/app/views/deploykey.html
  - services/console/src/package.json
  - services/console/src/test/deploykey.cjs
  - services/console/vue/package.json
  - services/console/vue/src/Routes.js
  - services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
  - services/console/vue/src/components/Header/Header.vue
  - services/console/vue/src/components/Notifications/Notifications.vue
  - services/console/vue/src/components/Sidebar/Sidebar.vue
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/src/pages/History/History.vue
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - services/console/vue/src/pages/Transformers/TransformerEditor.vue
  - services/console/vue/src/pages/Transformers/Transformers.vue
  - services/console/vue/src/store/buildlog.js
  - services/console/vue/src/store/rsakeys.js
  - services/console/vue/src/store/transformers.js
  - services/console/vue/src/utils/buildLog.js
  - services/console/vue/tests/unit/milestone-v116.cjs
findings:
  critical: 1
  warning: 7
  info: 8
  total: 16
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-10-12T10:42:06Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Scope is the console submodule diff `d5c09e7..HEAD` (commits `956a7a2`, `b7b5b29`, `8815aa7`, `4552901`): named deploy keys in both consoles, the full build-log dialog, the transformer write-path move to `info.transformers`, the device-detail layout and linked-repository card, the notification exclusivity rule, and the header cleanup. Paths below are relative to `services/console/`.

I checked the backend contracts these changes depend on:
- `lib/router.rsakey.js` / `lib/thinx/rsakey.js`: the `name` param, and the create/list response shapes.
- `lib/router.logs.js` / `lib/thinx/buildlog.js`: the `GET /api/v2/logs/build/:bid` shape, which is `{success, log, contents}` or `{success, log}` or `{success}`.
- `design/design_users.json`: `users/edit` merges `info` key by key, so the `{info:{transformers}}` patch is correct.
- `lib/thinx/session_token.js`: the single-key envelope is unaffected by the `parseResult` change.

Both unit suites (`vue/tests/unit/milestone-v116.cjs`, `src/test/deploykey.cjs`) pass locally.

The linked-repository href guard is sound: http(s) only, parsed through `URL`, `rel="noopener noreferrer"`. Build-log text is rendered by interpolation, not as HTML.

The defects are in the new error and edit paths:
- **Transformer editor (CR-01):** after a failed load it stays editable and saveable, and one click on Save blanks a live transformer.
- **Device-detail actions:** "Create & Assign" also saves any unsaved transformer selection (WR-02), and the new top Environment button silently throws away an open draft (WR-03).
- **History rows:** the new clickable rows take over keyboard Enter from the buttons inside them (WR-01).
- **Transformer data loss:** moving transformers into `info` exposes them to the whole-`info` writes that Profile.vue and the legacy console already make (WR-04).
- **Tests:** a Cypress spec is broken by the "My Account" rename (WR-07).

## Critical Issues

### CR-01: The transformer editor stays saveable after a failed load, and Save blanks the transformer

**File:** `vue/src/pages/Transformers/TransformerEditor.vue:76`, `:92-108`, `:25`; `vue/src/store/transformers.js:54-61`
**Issue:** Phase 35 made `transformers/fetchItems` throw on a failed `GET /profile`. `loadTransformer` now catches that, sets `error = 'Could not load transformers.'` and returns. `form.alias` and `form.body` stay `''`, but the Save button is only disabled while `saving`.

If the user clicks Save, for example as a "retry", this happens:
1. `updateItem` re-fetches, which now succeeds because the failure was transient.
2. It replaces the matching `utid` with `{ alias: '', body: btoa('') }`.
3. It writes the full list back to `info.transformers`.

The transformer's alias and JavaScript body are permanently replaced with empty strings. Every device that has this transformer assigned then runs an empty body. No confirmation is shown, and `hasChanges` is false, so nothing warns the user.
**Fix:** Track whether the editor loaded, and refuse to save otherwise. Also reject an empty alias in the store.
```js
data() { return { form: { alias: '', body: '' }, loaded: false, /* ... */ }; },
async loadTransformer() {
  this.loaded = false;
  try { await this.fetchItems(); }
  catch (e) { this.error = 'Could not load transformers.'; return; }
  const transformer = this.getByUtid()(this.$route.params.utid);
  if (!transformer) { this.error = 'Transformer not found.'; return; }
  // ...populate form...
  this.loaded = true;
},
async save() {
  if (this.saving || !this.loaded || !this.form.alias.trim()) return;
  // ...
}
```
```html
<b-button variant="primary" @click="save" :disabled="saving || !loaded">
```
In `updateItem`, throw if no `t.utid === utid` exists after the re-fetch, so a save against a deleted transformer reports a failure instead of silently succeeding.

## Warnings

### WR-01: Clickable History rows take over Enter and Space from the buttons inside them

**File:** `vue/src/pages/History/History.vue:107`, `:120-128`
**Issue:** The build row is now `role="button" tabindex="0"`, with `@keydown.enter.prevent` and `@keydown.space.prevent`. It contains two real buttons: Expand/Collapse and "Open build log".

Keydown on an inner button bubbles up to the `<tr>`, and Vue's `.prevent` cancels the button's default activation. So a keyboard user who presses Enter or Space on Expand gets the log dialog, and the row never expands. (`@click.stop` only guards mouse clicks.)

Other effects:
- `role="button"` has presentational children, so screen readers lose the date, name and status cells and the nested buttons.
- The row's `role` replaces its table-row semantics.
- Drag-selecting text in the `<pre>` snippet ends in a `click` on the row, which opens the modal.

**Fix:** Do not make the row interactive. Keep the explicit "Open build log" button, which already exists, and drop `role`, `tabindex` and the key and click handlers from the `<tr>`. If row-click must stay, use a mouse-only `@click` that ignores events from interactive descendants and from text selections:
```js
onRowClick(item, e) {
  if (e.target.closest('button,a,input') || String(window.getSelection())) return;
  this.openBuildLog(item);
}
```
DeviceDetail's build-history rows (`DeviceDetail.vue:128`) have the same `role="button"`-on-`<tr>` semantics problem, though they have no nested controls.

### WR-02: "Create & Assign" also saves the user's unsaved transformer selection

**File:** `vue/src/pages/Devices/DeviceDetail.vue:390-391`
**Issue:** `selected = [...this.editForm.transformers, created.utid]`. Here `editForm.transformers` is the live `v-model` of the multi-select in the same card, not the device's stored assignment.

If the user changed the selection (for example deselected a transformer) without clicking "Save Transformers" and then used "Create & Assign", the unsaved change is written to the device too. The success message only says "Transformer created and assigned."
**Fix:** Build the assignment from the stored device state:
```js
const stored = Array.isArray(this.device.transformers) ? this.device.transformers : [];
const selected = [...new Set([...stored, created.utid])];
```
The alternative is to block "Create & Assign" while the select differs from `device.transformers`.

### WR-03: The new top "Environment" action silently discards an open environment draft

**File:** `vue/src/pages/Devices/DeviceDetail.vue:18`, `:317-344`
**Issue:** The new Actions-card button is disabled only while `envLoading`, so it can be clicked while `envEditing` is already true. `editEnvironment()` re-fetches the device and overwrites `envDraft` with the stored JSON (line 340), so the user's unsaved edits are lost without a prompt. The card's own Edit button cannot cause this, because it is hidden while editing.

The editor also opens in a card far below the button, with no scroll or focus move, so the click can look like it did nothing.
**Fix:** Disable the button while editing, or make it scroll and focus the open editor instead of reloading:
```html
<b-button ... :disabled="envLoading || envEditing" @click="editEnvironment">
```
After opening the editor, call `this.$nextTick(() => this.$el.querySelector('[data-cy=env-draft]').focus())`.

### WR-04: Whole-`info` profile writes can now overwrite the transformer list

**File:** `vue/src/store/transformers.js:37-42`; `vue/src/pages/Profile/Profile.vue:272`, `:306`; `src/app/js/thinx-api.js:1213-1238`
**Issue:** Transformers now live in `info.transformers`. The CouchDB `users/edit` handler merges `info` key by key, and two writers send every `info` key from a snapshot that may be stale:
- Vue `Profile.vue` `saveProfile` and `saveNotifications` copy the whole `this.profile.info` taken at page load, including `transformers`.
- The legacy `submitProfile` sends `transformers: profile.info.transformers` from `$rootScope`, which is loaded once per session. It also runs when the deploy-key info note is dismissed (`deploykey.html:15`).

Example: a user has the legacy console or the Profile page open in one tab and creates or edits a transformer in the Vue console in another. The next profile or notification save, or note dismissal, reverts `info.transformers` and deletes the new transformer. Before this phase the Vue writes went to a top-level key, so the two never collided.
**Fix:** The server merges `info` per key, so send only the keys that changed:
```js
// saveNotifications
await this.updateProfile({ notifications: { all, important, info } });
// saveProfile
await this.updateProfile({ first_name, last_name, mobile_phone, timezone_abbr });
```
To clear `info.timezone`, send `timezone: null` explicitly. In the legacy console, drop `transformers` from `submitProfile` and keep using `submitProfileChanges(["transformers"])` for transformer edits.

### WR-05: A failed deploy-key list request shows "No deploy keys yet." with no error

**File:** `vue/src/store/rsakeys.js:56-62`; `vue/src/pages/Rsakeys/Rsakeys.vue:77-81`
**Issue:** `rsakeys/fetchItems` resolves with the old `state.items` when `result.success` is false. `api.js` turns non-JSON, 5xx and 401 responses into `{success:false}` without throwing. So the new `try/catch` in `loadData` almost never runs: on a first visit the page shows an empty table saying "No deploy keys yet." and no error. A user may then create duplicate keys because they believe none exist.

The transformers store was changed in this phase to throw in the same situation, so the two stores now behave differently.
**Fix:**
```js
async fetchItems({ state, commit }) {
  const result = await this.$api.$get('/rsakey');
  if (!result || !result.success) throw new Error('Could not load deploy keys.');
  commit('saveItems', { items: result.response || [] });
  return state.items;
},
```

### WR-06: Deleting deploy keys has no confirmation

**File:** `vue/src/pages/Rsakeys/Rsakeys.vue:67-76`, `:9`
**Issue:** The page was rewritten in this phase, and "Delete (n)" still removes the selected private/public key pairs on disk with a single click (`DELETE /rsakey` → `revokeUserKeys`). This cannot be undone. Any repository that uses those keys stops building until a new key is generated and re-registered with the Git host. Transformer deletion and device revocation in this console both ask for confirmation first.
**Fix:**
```js
const ok = await this.$bvModal.msgBoxConfirm(
  `Delete ${filenames.length} deploy key(s)? Repositories using them will stop building.`,
  { title: 'Delete Deploy Keys', okVariant: 'danger', okTitle: 'Delete' });
if (!ok) return;
```

### WR-07: The header rename breaks a Cypress spec, and the new unit tests are not run in CI

**File:** `vue/src/components/Header/Header.vue:48`; `vue/cypress/integration/profile.spec.js:110-115`; `vue/package.json:17`; `src/package.json:28`
**Issue:**
- The PROF-06 spec still does `cy.get('[data-cy=settings-dropdown]').contains('.dropdown-item', 'My Account').click()`. The item is now labelled "My Profile", so the spec fails.
- `.circleci/config.yml` in the console repo runs only `npm run build`. Neither `test:unit` (which now includes `milestone-v116.cjs`) nor the new `test:deploykeys` runs on push. The regressions this phase claims to guard against can come back without any signal.

**Fix:**
- Update the spec to `'My Profile'`, or better, select by a `data-cy` attribute on the dropdown item.
- Add `cd vue && npm run test:unit` and `cd src && npm run test:deploykeys` steps to the CircleCI job before the build.

## Info

### IN-01: `parseResult` now returns `{}` instead of `undefined` for envelopes with no data key

**File:** `vue/src/core/api.js:75-77`
**Issue:** For `{success:true}` with no other keys, the new reduce branch returns `response: {}`, where it used to return `undefined`. Two backend paths produce this shape:
- `Util.responder(res, true, undefined)` (JSON.stringify drops the key).
- The build-log path with an empty log (`callback(false, {})` in `buildlog.js:323`).

Callers that test `result.response` for truthiness now see a truthy empty object.
**Fix:** `keys.length === 0 ? undefined : keys.length === 1 ? result[keys[0]] : <reduce>`.

### IN-02: A failed re-fetch after a successful transformer write is reported as a failed create

**File:** `vue/src/store/transformers.js:41`, `:51`; `vue/src/pages/Devices/DeviceDetail.vue:400-401`
**Issue:** `saveTransformers` re-fetches after a successful POST, and `fetchItems` now throws. If that GET fails, `createItem` rejects even though the transformer was stored. DeviceDetail then shows "Could not load transformers." and does not assign it. A retry is blocked with "already exists" once the list refreshes.
**Fix:** Catch the re-fetch inside `saveTransformers` and return the write result. Let callers refresh separately.

### IN-03: Legacy create handler: dead parse branch, and an exception in `.done` skips `.always`

**File:** `src/app/js/controllers/DeploykeyController.js:36`, `:43-46`; `src/app/js/thinx-api.js:1046-1053`
**Issue:**
- With `dataType: "json"`, jQuery hands `.done` an already-parsed object, so the `typeof response === "string"` branch is dead.
- If `key` were ever undefined (`response.response` and `response.status` both missing), `key.date` would throw. jQuery `.done` callbacks are not wrapped in try/catch, so the `.always` callback would never run and `creatingDeploykey` would stay `true`, leaving Create disabled until the modal is reset.

**Fix:** Guard `if (!key || !key.pubkey)` and report an error, or move the reset into a `finally`-style call at the end of both `.done` branches.

### IN-04: Server-side key-name rejections show a generic error

**File:** `vue/src/pages/Rsakeys/Rsakeys.vue:51-58`; `src/app/js/controllers/DeploykeyController.js:64-69`
**Issue:** The backend rejects names that contain control characters (tab, newline), or that are longer than 120 characters after trimming. It answers `400 invalid_key_name`. Both consoles show only "Failed to generate deploy key." or "Error.", and neither validates on the client. In the legacy console, `$(".msg-warning").text(error)` prints `[object Object]` because `error` is the jqXHR.
**Fix:** Apply the same `/[\x00-\x1f\x7f]/` check before sending, and map `invalid_key_name` to a readable message.

### IN-05: The legacy deploy-key goal check no longer matches its sibling handlers

**File:** `src/app/js/thinx-api.js:361`
**Issue:** `updateSources`, `updateRsakeys` and the other goal checks still require `goals.length > 0` before recording a goal. `updateDeploykeys` now records `"deploykey"`, and sends a profile POST, for users whose `goals` array is empty. If the empty array means "onboarding not started", this changes onboarding behaviour on a single page only.
**Fix:** Either restore `goals.length > 0` alongside the new null-safety checks, or apply the relaxed rule to all handlers on purpose.

### IN-06: Markup and status-styling issues in the new clickable lists

**File:** `vue/src/components/Notifications/Notifications.vue:11-29`; `vue/src/pages/Devices/DeviceDetail.vue:132`; `vue/src/pages/History/History.vue:111`
**Issue:**
- `<b-list-group-item button>` renders a `<button>` that contains `<h6>` and `<p>`. Those are not phrasing content, so the HTML is invalid inside a button.
- The build-status badge is `danger` for anything other than `OK`, so the new `RUNNING` status shows in red just like `FAILED` and `TIMEOUT`.

**Fix:** Use `<span>` elements with classes inside the button, and map `RUNNING` to `info` or `secondary`.

### IN-07: Minor `BuildLogDialog` issues

**File:** `vue/src/components/BuildLogDialog/BuildLogDialog.vue:2`, `:17`
**Issue:**
- When the modal is closed mid-request, `@hidden="requestId++"` leaves `loading` set to `true`. This is harmless, because `open()` reloads.
- `buildId` falls back to `build.id`. The normalizer sets that to `String(index)` when a build has no `_id` or `build_id`, so such a build requests `/logs/build/0` and shows a misleading error.

**Fix:** Reset `loading` in the `hidden` handler, and fall back only to `build.build_id`. Disable the row action when it is empty.

### IN-08: Test coverage gaps

**File:** `vue/tests/unit/milestone-v116.cjs:65-66`; `src/test/deploykey.cjs:9-10`
**Issue:**
- Header, Notifications, History, Transformers and TransformerEditor are only checked for "template compiles". Their behaviour is not exercised: WR-01 and CR-01 would pass.
- The legacy test's mock `.fail()` never runs its callback, so the transport-failure path (toast, `xhrFailed`, the `.always` reset) is untested.
- The `createTransformer` test does not cover the `updateDevice` failure path or the unsaved-selection case (WR-02).

**Fix:** Add behavioural cases for the editor's failed-load save, the inner-button keyboard activation, the deploy-key `.fail` path, and assignment from the stored selection.

---

_Reviewed: 2026-10-12T10:42:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
