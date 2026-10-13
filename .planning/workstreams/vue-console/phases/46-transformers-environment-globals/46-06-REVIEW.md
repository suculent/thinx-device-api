---
phase: 46-transformers-environment-globals
plan: 06
reviewed: 2026-10-13T22:46:00Z
depth: standard
scope: "services/console a16307a..31bce2b"
files_reviewed: 3
files_reviewed_list:
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/tests/unit/transformers-enviros.cjs
  - services/console/vue/tests/unit/milestone-v116.cjs
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 46 (plan 46-06 gap closure): Code Review Report

**Reviewed:** 2026-10-13T22:46:00Z
**Depth:** standard (with call-chain reads of `store/devices.js`, `core/api.js`, `lib/thinx/devices.js` `list`, `lib/thinx/device.js` `edit`/`listValues`)
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the console diff `a16307a..31bce2b`: the `loadDevice()` draft-keeping logic, the local device copies in
`saveField`, `saveTransformers` and `createTransformer`, the `devices/loadDevices` switch, the K1..K6 checks and the
`milestone-v116.cjs` stub.

For sequential flows the fix does what CR-01 and WR-05 asked:
- Each save applies what it wrote to a shallow copy of `this.device` before the re-read. Only drafts the triggering save
  did not write then differ from the on-screen device, so only those are kept.
- A rejected `loadDevices` keeps the on-screen copy, so the stale store item is not shown.
- `saveEnvironment` never copies the parsed (unmasked) environment into `this.device`. On both the success path and the
  failed re-read the card shows only the list's masked copy.
- `this.device` is never mutated in place. A scratch probe held a reference to the store item across a save with a
  failed re-read and found it unchanged.

The unit suite passes (`npm run test:unit`, exit 0, K1..K6 `ok`). The K checks do run the real `loadDevice`:
`draftHarness` never assigns it, and `calls.list` counts the reads.

The fix only holds while one save and its re-read run at a time. Nothing serialises them. The Alias and Description
Save buttons are never disabled, and Save Transformers is disabled only during its own write. A scratch probe drove the
real page methods through two overlapping saves whose re-reads came back out of order. The card then showed the old
transformer list as saved, with no dirty note and no error, and a later Create & Assign wrote that old list back to
the server (WR-01). The same race existed before 46-06, so this is not a regression. It does mean the plan's claim "a
later save cannot write the old list back" does not hold under concurrency.

The other findings are minor: an error-handling gap in a function this diff touched, test coverage, and stale
comments and stubs.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Overlapping saves let a stale re-read overwrite a newer one; the old transformer list shows as saved and a later Create & Assign writes it back

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:330-349` (re-read), `:350-364` (`saveField`), `:473-476` (`createTransformer` builds `stored` from `this.device`), `:501-530` (`saveTransformers`); template `:53`, `:61` (Save buttons never disabled)

**Issue:** `loadDevice()` applies whatever result arrives, whenever it arrives. Nothing checks whether a newer reload
has already started. Steps:
1. The user types an alias, ticks a transformer, clicks the Alias Save and then Save Transformers within one round trip.
2. The alias PUT returns first, and its re-read R1 reads the server before the transformer PUT commits, so R1 has the
   old list.
3. The transformer PUT returns. `this.device` becomes a copy with `transformers: sent`, `Transformers saved.` is set,
   and re-read R2 starts.
4. R2 resolves first and is correct. R1 resolves last. In R1, `before.transformers` is `sent` and the ticks equal
   `sent`, so `keepTransformers` is false. `this.device` is set to the stale store item and the ticks are reset to the
   old list. The store also ends on R1's commit.

Scratch probe output (real page methods, `draftHarness` with a deferred `loadDevices` that snapshots the server at
call time):

```
server: ["utid-battery","utid-temp"]   device/ticks: ["utid-battery"]   dirty: false
transformersMessage: "Transformers saved."   error: null
after Create & Assign -> server: ["utid-battery","utid-new"]   (utid-temp silently removed)
```

The card shows the old list under `Transformers saved.` with no dirty note, no page error and Save disabled. Because
`createTransformer` builds `stored` from `this.device.transformers`, the next Create & Assign deletes the saved
assignment on the server. That is the WR-05 outcome the plan says cannot happen ("a later save cannot write the old
list back").

The pre-46-06 code had the same race, so this is not a regression. It is classified WARNING rather than BLOCKER only
because it needs two saves inside one round trip plus out-of-order responses. K1..K6 are all sequential and cannot
catch it.

**Fix:** make only the newest reload apply. The plan rules out a new `data` field, but a non-reactive instance counter
is enough:

```js
async loadDevice() {
  const seq = (this._loadSeq = (this._loadSeq || 0) + 1);
  this.loading = true;
  const udid = this.$route.params.udid;
  const results = await Promise.allSettled([this.loadDevices(), /* ... */]);
  if (seq !== this._loadSeq) return;       // a newer reload started: its result wins
  // ... existing keep/apply logic, loading = false ...
}
```

As defence in depth, disable the Alias and Description Save buttons and Create & Assign while any device write is in
flight. Add a K check with two overlapping saves whose re-reads resolve out of order.

### WR-02: `saveField` (and `saveEnvironment`) still have no rejection handling; a network failure gives no feedback and leaves an unhandled rejection

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:350-364` (`saveField`, changed by this diff), `:442-455` (`saveEnvironment`)

**Issue:** `this.$api.$put` → `request()` (`vue/src/core/api.js:96-101`) awaits `fetch`, which rejects on a network
error, DNS failure or abort. `saveField` awaits `updateDevice` with no `try`, so the rejection escapes the click
handler. No `error` is set, no `Saved.` appears, and nothing tells the user the alias or description was not saved.

46-06 rewrote this function and wrapped the same call in `saveTransformers` in a `try` (`:509-516`), so the two save
paths on one page behave differently. K5 only covers the `{ success: false }` refusal, not a rejection. The draft
itself survives (the field still holds the text), but the failure is silent, which works against the phase goal.

**Fix:**
```js
async saveField(field) {
  const value = this.editForm[field];
  let result = null;
  try {
    result = await this.updateDevice({ udid: this.device.udid, changes: { [field]: value } });
  } catch (e) {
    result = null;
  }
  if (result && result.success) {
    this.device = Object.assign({}, this.device, { [field]: value });
    this.message = 'Saved.';
    await this.loadDevice();
  } else {
    this.error = (result && result.message) || 'Failed to save.';
  }
}
```
Do the same in `saveEnvironment`, and add a K5 case where `updateDevice` rejects.

## Info

### IN-01: The alias keep check is not normalised like the description check, so an empty alias draft can stick and hide the stored alias

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:336-337`

**Issue:** `keepDescription` compares `(editForm.description || '')` with `(before.description || '')`, but `keepAlias`
compares raw values: `this.editForm.alias !== before.alias`. Take a device whose list entry has no alias (`undefined`
or `null`, so `editForm.alias` starts as that value). If the user focuses the field, types and erases, `editForm.alias`
becomes `''`. From then on `'' !== undefined`, so every later reload keeps `''` as a "draft". If the alias is later
set elsewhere, the field stays blank and an Alias Save would write `''` over it.

**Fix:** `const keepAlias = !!before && (this.editForm.alias || '') !== (before.alias || '');`

### IN-02: Stale comment in the devices store, and dead `fetchItems` stubs in the tests

**File:** `services/console/vue/src/store/devices.js:46-48`; `services/console/vue/tests/unit/milestone-v116.cjs:127`; `services/console/vue/tests/unit/transformers-enviros.cjs:2186-2190`

**Issue:** The store comment still says `fetchItems keeps its non-throwing behaviour for Devices.vue, DeviceDetail.vue
and Visits.vue`, but DeviceDetail now maps `devices/loadDevices` only. `renderDeviceDetail` keeps a `fetchItems: noop`
override, and `draftHarness` defines a `fetchItems` that also counts into `calls.list`, although the page no longer
calls it. Because both loaders count into `calls.list`, a regression that re-mapped DeviceDetail to `fetchItems` would
still pass K1, K2, K3, K5 and K6. Only K4 and the plan's grep would catch it.

**Fix:** drop `DeviceDetail.vue` from the store comment when the store is next touched (46-06 forbids store edits).
Remove the `fetchItems` stubs, or have the harness's `fetchItems` throw `unexpected fetchItems`, so every K check
fails on a regression.

### IN-03: K checks do not cover the store-mutation mitigation (T-46-32), concurrency, or "follows the re-read" on the other save paths

**File:** `services/console/vue/tests/unit/transformers-enviros.cjs:2165-2347`

**Issue:**
- `reread()` replaces `store.items` with a new array on every read, so an in-place `this.device.alias = value` would be
  overwritten before any assertion and never detected. T-46-32 is therefore not proven by K1..K6. The scratch probe
  shows the current code is fine, but nothing guards against a regression.
- Every K check is sequential, so WR-01 is uncovered.
- K5's "an untouched field follows the re-read" is only exercised through `saveField('alias')`, not through
  `saveTransformers` or `saveEnvironment`.

**Fix:** add one check that keeps a reference to `store.items[0]`, runs a save with `listFails`, and deep-compares the
reference to its snapshot. Add the overlapping-save check from WR-01. Add one K5 case for `saveTransformers` with a
description changed elsewhere.

### IN-04: The page error is sticky, and it is invisible when the first load fails

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:334`; template `:1-11`, `:194-197`

**Issue:**
- `loadDevice` sets `this.error` on any rejected loader but never clears it, and no save clears it before starting.
  After a WR-05 failed re-read, `Some device details could not be loaded. Refresh to retry.` stays on screen through
  every later successful save, next to `Saved.`. 46-06 makes this more reachable, because `success: false` on the list
  now rejects where `fetchItems` swallowed it.
- On the first load (`before` is null) with an empty store, `device` is null. The error alert sits inside
  `v-if="device"`, so the user only sees `Device not found.` for what was a transient load failure.

**Fix:** clear `this.error` at the start of `loadDevice()` (or when the device-list entry is fulfilled). In the
`v-else` branch, show the load-failure copy instead of "Device not found." when `error` is set. The template change is
outside 46-06's byte-identical rule, so it needs a follow-up plan.

### IN-05 (pre-existing, in the modified method): `loadDevice` throws for an object-shaped `transformers` field

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:344`; server `lib/thinx/device.js:683-687`, `lib/thinx/devices.js:331`

**Issue:** The server treats `device.transformers` as an array or a legacy object map (`Device.listValues`), and the
device list passes it through raw. `transformersDirty` and `createTransformer` guard with `Array.isArray`, but
`[...(this.device.transformers || [])]` throws `TypeError: ... is not iterable` on a plain object. `loadDevice` then
rejects without setting `buildHistory` or clearing `loading`, and the rejection is unhandled from `created()` and from
every save path.

**Fix:** use the same guard as the computed:
`this.editForm.transformers = Array.isArray(this.device.transformers) ? [...this.device.transformers] : Object.values(this.device.transformers || {});`
or normalise `transformers` to an array in the store's `saveDevices` mutation.

---

_Reviewed: 2026-10-13T22:46:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
