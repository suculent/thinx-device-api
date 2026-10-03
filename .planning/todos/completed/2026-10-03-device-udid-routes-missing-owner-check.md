---
created: 2026-10-03T21:00:00.000Z
title: Udid-keyed device routes never check that the caller owns the device
area: api
severity: high
files:
  - lib/router.device.js editDevice, getDeviceDetail, setDeviceEnvs, detachSource (no owner passed)
  - lib/thinx/device.js:1450 (edit looks the device up by udid only)
  - lib/thinx/device.js:1525 (detail looks the device up by udid only)
  - lib/thinx/device.js:1514 (envs looks the device up by udid only)
  - lib/thinx/devices.js:403 (detach looks the device up by udid only)
---

## Problem

`lib/router.device.js` `editDevice`, `getDeviceDetail`, `setDeviceEnvs` and `detachSource` gate on
`Util.validateSession` and then pass no owner at all. `device.edit` (`lib/thinx/device.js:1450`),
`device.detail` (`:1525`), `device.envs` (`:1514`) and `devices.detach` (`lib/thinx/devices.js:403`)
look the device up by udid only. Any authenticated caller who knows a udid can edit another owner's
device, read its detail or its environment variables, or detach its source. This is a missing
object-level ownership check (cross-owner IDOR), not body trust.

Until quick 261003-skk these routes were reachable unauthenticated as well, because
`Util.validateSession` accepted an unverified `{owner_id, api_key}` body. That part is closed; the
cross-owner part for authenticated callers remains (threat T-skk-09, disposition: transfer).

## Fix

Pass `Util.ownerFromRequest(req)` from each handler and compare it with the device document's owner
before acting; answer 403 (or the existing not-found shape) on a mismatch. Add specs: owner B's
session editing, reading, reading envs of, or detaching the source of owner A's device is refused.

## Resolution

Done 2026-10-03 in quick 261003-t29: `199ec9f2` (failing spec), `f833d4ab` (router gate),
`5c62bac6` (transfer), and the Task 3 commit "test(quick-261003-t29): CI cross-owner
regressions; todos for device-side and transfer follow-ups".

- **Answer:** another owner's udid now gets HTTP 200 `{"success":false,"response":"no_such_device"}`.
  A missing udid, an invalid udid (after the presence checks) and a CouchDB error get the same
  answer. Reasons: `device.run_transformers` already answers `no_such_device` for missing and
  foreign devices, and `ZZ-RouterTransformerSpec` pins that text. The legacy API reports
  not-found as 200 with `success:false`, and both consoles branch on `success`. A CI case
  (`ZZ-RouterBuilderSpec`) also expects 200 for a udid that has no device. Both refusals do one
  `devicelib.get`, so the work done does not reveal whether the device exists.
- **Shared check** in `lib/thinx/device.js`:
  - `Device.isOwnedBy(doc, owner)` compares owners with strict `===`.
  - `Device#fetchOwned(udid, owner, cb)` fails closed on invalid input, foreign owners and
    database errors.
  - `Device#filterOwned(owner, udids, cb)` makes one `devices_by_owner` view query per call.
- **Gated routes** (`lib/router.device.js` `withOwnedDevice`). The owner always comes from
  `Util.ownerFromRequest(req)`, never from the request body.
  - detail (v1 and v2) and envs
  - edit (POST and PUT v2)
  - source attach and detach (v1 and v2)
  - mesh attach and detach (v1 and v2)
  - notification (v1 and v2)
  - data (POST, and `GET /api/device/data/:udid`, whose udid is now sanitized)
- **Other route changes:** push and configuration publish only to the caller's own udids, and
  answer `no_such_device` when the caller owns none of them. Edit drops `owner` and
  `previous_owner`. Revoke was already owner-scoped; the spec now pins it.
- **Transfer** (`lib/thinx/transfer.js`):
  - A request that names any udid the sender does not own is refused before anything is
    stored or mailed.
  - Accept only moves udids that belong to the stored transfer.
  - `migrate_device` checks again that the sender still owns the device before changing its
    owner.
- **Residual risk:** this fix does not undo cross-owner writes made before it. Run a read-only
  audit of `managed_devices` for:
  - `mesh_ids` entries, and `/<owner>/<mesh>` ACL topics in the broker ACL, whose owner is not
    the device's `owner`
  - `source` values that are not in the device owner's `sources` map

  Check deploy paths created under a victim owner for a foreign repository too.
