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
