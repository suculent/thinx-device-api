---
created: 2026-10-19T13:35:00.000Z
title: "Vue console: no way to attach a repository (source) to a device"
area: console
severity: high
priority: soon
files:
  - services/console/vue/src (no caller of /api/device/attach or /api/device/detach)
  - lib/router.device.js /api/device/attach, /api/device/detach (API side exists)
  - lib/thinx/devices.js attach(owner, body, callback, res) (sets device.source)
  - services/console/src/app/js (legacy console: the only UI that can attach today)
---

## Problem

Found by the operator during Phase 40 UAT test 4 (2026-10-19): the Vue console has no control to
attach a source repository to a device. `grep -rn "device/attach\|attachSource\|detach"` over
`services/console/vue/src` finds nothing, so this is a missing feature, not a broken one. The API
supports it (`POST /api/device/attach` with `{udid, source_id}` → `devices.attach()` sets
`device.source`), and the legacy console uses it. The operator had to attach the example battery
repo to "Flower Kit (Burned)" outside the Vue console to run the public HTTPS build.

## Expected

On the Vue device detail (or device list) page, an owner can pick one of their sources and attach
it to the device, and detach it again. The current source is shown. Errors from the API
(`missing_source_id`, `udid_not_found`, `attach_failed`) are shown as readable messages.

## Notes

- Without it, a Vue-only user cannot build a device that has no source yet.
- Mirror the legacy console's attach/detach behaviour; add a unit test under
  `services/console/vue/tests/unit/` like the deploy-key action tests.
