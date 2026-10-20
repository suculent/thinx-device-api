---
phase: 46-transformers-environment-globals
reviewed: 2026-10-13T21:43:52Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - lib/thinx/apienv.js
  - spec/jasmine/ApienvExactKeySpec.js
  - services/console/vue/cypress/integration/device-detail.spec.js
  - services/console/vue/package.json
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/src/pages/Enviros/Enviros.vue
  - services/console/vue/src/pages/Transformers/TransformerEditor.vue
  - services/console/vue/src/pages/Transformers/Transformers.vue
  - services/console/vue/src/store/devices.js
  - services/console/vue/src/store/enviros.js
  - services/console/vue/src/store/transformers.js
  - services/console/vue/src/styles/_platforms.scss
  - services/console/vue/src/styles/_settings-pages.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/src/utils/confirmLeave.js
  - services/console/vue/src/utils/transformerUsage.js
  - services/console/vue/tests/unit/milestone-v116.cjs
  - services/console/vue/tests/unit/transformers-enviros.cjs
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-10-13T21:43:52Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Scope: parent `fc34df9b..HEAD` (`lib/thinx/apienv.js`, the new jasmine spec) and console submodule
`316c5f9..a16307a` (Transformers, Environment Globals, Device Detail transformer card, stores, utils, styles, tests).

The D-02 parent fix is correct as far as it goes: `create` now drops only the entry whose name is exactly
`String(key)`, and `ApienvExactKeySpec.js` passes locally (11 specs, 0 failures). Both new console unit suites
(`transformers-enviros.cjs`, `milestone-v116.cjs`) pass. The typed-confirm delete, its single-shot guards, text-only
rendering of names and the shared `confirmLeave` helper look sound.

The main defect is in Device Detail. The phase goal says "no user change is silently lost", but the new dirty
tracking stops working whenever another card saves. `loadDevice()` resets every `editForm` field, so saving the alias,
the description or the environment throws away unticked or ticked transformer changes. The dirty note then
disappears and the leave guard stops firing. Saving transformers also throws away unsaved alias and description text.

There are also secondary gaps. The env store's "write succeeded, refresh failed" path misses API-level failures.
`apienv.create` still reports success before its Redis write is acknowledged, which weakens the D-01/D-04 claim that a
failed edit always shows an error. Edit (like Add) trims secret values without telling the user.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Saving any other Device Detail field silently discards unsaved transformer ticks (and vice versa)

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:325-339` (reset at `:334`), callers `:340-350` (`saveField`), `:420-443` (`saveEnvironment`), `:487-513` (`saveTransformers`)
**Issue:** `loadDevice()` always rewrites `editForm.alias`, `editForm.description` and
`editForm.transformers = [...(this.device.transformers || [])]`. `saveField('alias'|'description')` and
`saveEnvironment()` both `await this.loadDevice()` after success. Steps to reproduce: untick a transformer
("Unsaved changes" shows), then edit the alias and click its Save. The ticks revert to the stored list,
`transformersDirty` becomes false, the note disappears and `beforeRouteLeave` no longer prompts. The user's
assignment change is gone and nothing told them. That is the exact failure POL-03 / 37 IN-02 and the phase goal
("no user change is silently lost") were meant to close.
`createTransformer` (`:471-475`) already works around this by restoring `pending`, but the other two save paths don't.
The reverse also happens: `saveTransformers` → `loadDevice()` overwrites a typed but unsaved alias or description.
**Fix:** make the reload preserve drafts that the save did not touch, e.g.:
```js
async loadDevice({ keep = [] } = {}) {
  const draft = { alias: this.editForm.alias, description: this.editForm.description,
                  transformers: [...(this.editForm.transformers || [])] };
  const dirty = { transformers: this.transformersDirty /* plus alias/description dirty if tracked */ };
  // ... existing fetch ...
  if (this.device) {
    this.editForm.alias = keep.includes('alias') ? draft.alias : this.device.alias;
    this.editForm.description = keep.includes('description') ? draft.description : (this.device.description || '');
    this.editForm.transformers = keep.includes('transformers') && dirty.transformers
      ? draft.transformers : [...(this.device.transformers || [])];
  }
}
// saveField(field): await this.loadDevice({ keep: ['transformers', field === 'alias' ? 'description' : 'alias'] });
// saveEnvironment:  await this.loadDevice({ keep: ['transformers', 'alias', 'description'] });
// saveTransformers: await this.loadDevice({ keep: ['alias', 'description'] });
```
Add a unit check: tick, then `saveField('alias')`, then assert the ticks and `transformersDirty` survive.

## Warnings

### WR-01: `apienv.create` ignores Redis errors and reports success before the write is acknowledged, so the D-01/D-04 safety claim does not hold

**File:** `lib/thinx/apienv.js:26-47`
**Issue:** The Vue Edit dialog (D-01) relies on `create` being a safe overwrite: if the write fails, the old value
stays and the user sees an error (D-04). But:
- `error` from `redis.get` is never checked (`:26`). If the reply is `undefined`, `JSON.parse(existing)` (`:28`) throws
  inside the Redis callback, no response is sent, and the request hangs or becomes an unhandled rejection. If the reply
  is `null`, `env_vars` becomes `[]` and the `set` at `:45` replaces the owner's whole variable list with just the
  edited key, losing every other variable.
- `redis.set` (`:45`) has no callback, and `callback(true, key)` (`:47`) runs right away. A failed write still returns
  `{success:true}`, so the console shows "Value saved" while the old value remains.
The read-modify-write is also unguarded, so two concurrent PUTs (an Edit and an Add from two tabs) can lose one of them.
This code was there before the phase, but this phase made `create` the only edit path and documented it as safe.
**Fix:**
```js
this.redis.get("env:" + owner, (error, existing) => {
  if (error) return callback(false, "env_read_failed");
  let env_vars;
  try { env_vars = existing ? JSON.parse(existing) : []; } catch (e) { return callback(false, "env_corrupt"); }
  if (!Array.isArray(env_vars)) env_vars = [];
  // ... filter as now ...
  this.redis.set("env:" + owner, JSON.stringify(new_vars), (setErr) => {
    if (setErr) return callback(false, "env_write_failed");
    callback(true, key);
  });
});
```
Extend `ApienvExactKeySpec.js` with a store whose `get`/`set` call back with an error.

### WR-02: Env store `refreshAfter` misses API-level refresh failures, so the page shows a stale list as if it were current

**File:** `services/console/vue/src/store/enviros.js:5-13` (uses `fetchItems` at `:81-87`)
**Issue:** `refreshAfter` only sets `refreshed: false` when `dispatch('fetchItems')` throws. `fetchItems` does not
throw on `{success:false}` (it just skips the commit), so an API-level GET failure after a successful PUT or DELETE
looks like a successful refresh. `Enviros.vue` then calls `showItems(this.getItems())` (`:153`, `:190`, `:243`) with
the old list. After a delete, the deleted variables stay listed and the selection is cleared. After an Add, the new
variable is missing. No error is shown either way. A user who retries the delete gets `nothing_to_revoke` and the
message "Could not delete the variables". The transformers store doesn't have this gap because its `fetchItems` throws.
**Fix:** refresh through the throwing loader:
```js
try { await dispatch('loadItems'); } catch (e) { return Object.assign({}, result, { refreshed: false }); }
```

### WR-03: Edit value (and Add) silently trims secret values

**File:** `services/console/vue/src/pages/Enviros/Enviros.vue:229` (Edit), `:134` (Add)
**Issue:** `const value = this.editValue.trim()` changes what gets stored. A Wi-Fi passphrase, API token or other value
with significant leading or trailing whitespace is saved in a different form than the user typed. Since values are
never shown back, the user cannot notice. The dialog copy says "The new value replaces it", which is not exactly what
happens. UI-T22 specifies this trim, but it conflicts with the phase goal of never silently changing user input.
**Fix:** trim only for the emptiness check and send the raw value:
```js
if (!key || !this.editValue.trim()) return;
const value = this.editValue;
```
If the trim is kept deliberately, say so in the help line ("Leading and trailing spaces are removed.").

### WR-04: `apienv.revoke` iterates a string `names` character by character (D-02 "any sibling" not fully covered)

**File:** `lib/thinx/apienv.js:101` (fed by `lib/router.env.js:60`)
**Issue:** `for (var nindex in changes)` assumes an array. `req.body.names` is not validated. Sending
`DELETE /api/v2/env {names: "WIFI"}` iterates the characters `"W","I","F","I"` and deletes any variables named `W`,
`I` or `F`, which is the same kind of unintended deletion D-02 set out to remove. The Vue console always sends an
array, but Legacy and API clients may not. This code was there before the phase. The loose `==` comparisons at
`:66` and `:103` are a related weak point.
**Fix:** normalize in the router:
```js
if (typeof req.body.names !== "undefined") {
  if (!Array.isArray(req.body.names)) return Util.responder(res, false, "names_not_array");
  env_var_names = req.body.names.map(String);
}
```
and iterate with `for (const name of changes)` and `===` in `revoke`.

### WR-05: After a successful transformer save, a failed device re-read reverts the ticks while "Transformers saved." is shown

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:507-509` with `src/store/devices.js:37-43`
**Issue:** `saveTransformers` sets `transformersMessage = 'Transformers saved.'` and then calls `loadDevice()`.
`devices/fetchItems` does not throw on `{success:false}`, so `loadDevice` neither rejects nor sets `this.error`. It
reads the stale store, whose `device.transformers` is still the list from before the save, and resets
`editForm.transformers` to it. The card then shows the old assignment as saved, with no dirty note and Save disabled,
while the server holds the new one. That contradicts D-11.
**Fix:** after a successful write, apply the saved list locally before or instead of relying on the reload, e.g.
`this.device = { ...this.device, transformers: [...sent] }` before `loadDevice()`. Or use the throwing
`devices/loadDevices` inside `loadDevice` and show the refresh failure.

## Info

### IN-01: Leave guard prompts "unsaved changes" after a successful revoke or transfer

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:364`, `:525` (guard at `:301-308`)
**Issue:** When ticks are dirty, `revokeDevice`/`transferDevice` call `$router.push('/app/devices')` after the device
is already gone, and the user is asked whether to leave unsaved changes. "Keep editing" leaves them on a revoked or
transferred device whose Save would fail.
**Fix:** reset `editForm.transformers` to the stored list (or set a `leaving` bypass flag) before those pushes.

### IN-02: Inconsistent transformer-name duplicate and trim handling across pages

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:450`, `src/pages/Transformers/TransformerEditor.vue:111`, `src/pages/Transformers/Transformers.vue:165`
**Issue:** Transformers.vue compares against `t.alias.trim()`. DeviceDetail's Create & Assign compares against the
untrimmed `t.alias`. TransformerEditor allows renaming to an existing name and stores `form.alias` untrimmed (with
leading or trailing spaces), which later bypasses the untrimmed check on Device Detail.
**Fix:** use one helper (e.g. in `transformerUsage.js` or a `transformerNames.js`) for "name taken" and trim the name on save in the editor.

### IN-03: Delete dialog usage count can be stale

**File:** `services/console/vue/src/pages/Transformers/Transformers.vue:120-123`, `:229-230`
**Issue:** `devices` is loaded only by `loadData()`, which runs on page load and only after a delete whose refresh
failed. A tab left open while devices are reassigned elsewhere shows an outdated "N devices will stop applying"
count in the destructive confirm.
**Fix:** refresh `loadDevices` when the dialog opens (keeping the current sentence until it resolves), or note that the count is as of page load.

### IN-04: Editing a variable deleted in another session silently re-creates it

**File:** `services/console/vue/src/pages/Enviros/Enviros.vue:226-248`
**Issue:** `PUT /api/v2/env` is an upsert. If the key was removed elsewhere after the list loaded, "Save value"
creates it again and reports success.
**Fix:** acceptable as is. Optionally re-check the key with `loadItems()` before the PUT and show "This variable no longer exists." if it is gone.

---

_Reviewed: 2026-10-13T21:43:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
