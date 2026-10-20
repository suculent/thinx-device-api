---
status: investigating
trigger: "UAT G-46-1: after changing alias, and ticking transformer and saving transformer the alias gets reverted to its previously saved state"
created: 2026-10-14T00:00:00Z
updated: 2026-10-14T00:00:00Z
goal: find_root_cause_only
symptoms_prefilled: true
---

## Current Focus

bug_class: Bohrbug (deterministic UI state bug, assumed until a repro says otherwise)
hypothesis: H2/H3 -- a real-runtime-only path (real BootstrapVue b-form-input / checkbox group, real Vuex store, mounted DOM) re-seeds or re-displays the stored alias after Save Transformers; the unit harness never mounts the page and renders b-* as inert vnodes, so K2 cannot see it
test: mount the REAL DeviceDetail.vue template+script with REAL bootstrap-vue 2.21.2, Vue 2.7.16, Vuex and the REAL store/devices.js module (fake $api server) in headless chromium; type alias, tick, click Save Transformers; read input.value and vm.editForm.alias
expecting: if input/editForm show the stored alias -> real-runtime cause, localize it; if the typed alias survives -> the 31bce2b code is correct for the literal sequence and the cause is the operator's sequence/state (stale tab, different step order, leave-guard gap)
next_action: build scratchpad/browser-repro/index.html from node_modules UMD builds and run chromium --headless --dump-dom

## Symptoms

expected: On Vue Console Device Detail, after typing an Alias WITHOUT saving, ticking a transformer and pressing Save Transformers, 'Transformers saved.' shows in the card and the typed Alias is still in the field, unsaved (dirty).
actual: "after changing alias, and ticking transformer and saving transformer the alias gets reverted to its previously saved state" (production rtm.thinx.cloud / console.thinx.cloud)
errors: None reported
reproduction: 46-UAT.md Test 1 (46-06 UAT items 13-14, CR-01): type new Alias (no save), tick a transformer, press Save Transformers
started: discovered 2026-10-14 during UAT after 46-06 (console 31bce2b, parent 6d47a5fb, bundle 6d47a5f) was deployed. The other half of CR-01 (alias/description/env save keeps the tick) was not reported failing.

## Eliminated

## Evidence

## Resolution

root_cause:
fix:
verification:
files_changed: []

## Outcome

Closed 2026-10-14 without a root cause: the operator retested after a hard reload and the Alias stayed changed. The first report came from a stale cached bundle. Investigation stopped while comparing the local dist with the served bundle (local dist already had the keepAlias logic).
