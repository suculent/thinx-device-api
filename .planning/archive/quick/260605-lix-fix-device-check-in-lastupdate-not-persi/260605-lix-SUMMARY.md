---
quick_id: 260605-lix
date: 2026-06-05
status: complete
files_modified:
  - lib/thinx/device.js
  - spec/jasmine/DeviceSpec.js
---

# Quick 260605-lix Summary — Device check-in `lastupdate` persistence fix

## What was done

- **lib/thinx/device.js `update_device_and_respond`**: changed the atomic write
  from `{ changes: device }` to flat `device`, and added `delete device.changes`
  to drop the legacy nested cruft. The `devices/modify` handler flat-merges
  top-level fields, so passing flat now correctly refreshes top-level
  `lastupdate`/`status`/`version`.
- **lib/thinx/device.js `runDeviceTransformers`**: added the missing `else`
  branch so a device with no `transformers` field still calls
  `update_device_and_respond` (persists + responds) instead of returning silently.
- **spec/jasmine/DeviceSpec.js**: added regression `(04b)` — a check-in must
  refresh top-level `lastupdate` and leave no nested `changes` field.

## Root cause (confirmed)

The `devices/modify` update handler merges only top-level request fields. The
2022 `{ changes: device }` wrapper therefore wrote a nested `doc.changes` object
and never updated the top-level `lastupdate` the console reads. Proven on
production doc `04ed1650…`: top-level `lastupdate=2024-06-28`,
`changes.lastupdate=2026-06-05`.

## Verification

- `node --check` + ESLint clean on both files.
- Empirical production proof of root cause.
- CI green-gate (CircleCI) runs the device specs incl. the new regression.
- Post-deploy live check planned via the thinx-device MCP.

## Follow-ups

- One-off cleanup of already-corrupted `managed_devices` docs (flatten
  `changes.*` → top-level, drop `changes`) so consoles show correct last-seen
  immediately rather than after each device's next check-in.
- Deploy via push to `thinx-staging` → CircleCI → Swarmpit autoredeploy.

## Self-Check: PASSED
