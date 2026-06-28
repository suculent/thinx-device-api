---
quick_id: 260605-lix
date: 2026-06-05
type: incident-fix
files_modified:
  - lib/thinx/device.js
  - spec/jasmine/DeviceSpec.js
---

# Quick 260605-lix — Device check-in does not persist top-level `lastupdate`

## Problem

Device check-ins return `Registered`, but the web consoles show a stale "last
connected" (e.g. a device that checks in today still shows ~a year ago).

## Root cause (proven against production)

`update_device_and_respond` (lib/thinx/device.js) called the `devices/modify`
CouchDB update handler with `{ changes: device }`. That handler flat-merges the
request body's **top-level** fields onto the doc
(`for (i in fields) doc[i] = fields[i]`), so it wrote a nested `doc.changes`
blob and **never updated the real top-level `lastupdate`/`status`/`version`** the
console reads. Every other `atomic("devices","modify",…)` caller passes flat
fields — this was the lone wrapped caller (introduced 2022, `f77e19ab`).

Confirmed on production doc `04ed1650-35a4-11ef-8ce1-25b4e9f8ae00`:
`top-level lastupdate = 2024-06-28`, nested `changes.lastupdate = 2026-06-05`.

Second, related defect: `runDeviceTransformers` had no `else`, so a device with
no `transformers` field returned without ever calling
`update_device_and_respond` — never persisting the check-in at all.

## Fix (already implemented)

1. `update_device_and_respond` passes `device` flat (not `{ changes: device }`)
   and deletes the legacy `device.changes` cruft before the atomic write.
2. `runDeviceTransformers` gained the missing `else` branch that persists +
   responds for transformer-less devices.
3. Regression spec `DeviceSpec (04b)`: after a check-in, top-level `lastupdate`
   must be recent and no nested `changes` field may exist.

## Verification

- `node --check` + ESLint clean on both files.
- Root cause empirically proven against the live production doc.
- Device specs run in the CircleCI green-gate (config/CouchDB required; not
  runnable locally) — the regression test enforces the fix there.
- Live verification (post-deploy) via the thinx-device MCP simulator.

## Deploy

Commit GPG-signed on `thinx-staging`; push → CircleCI green-gate →
Swarmpit autoredeploy (~5-min SLA).
