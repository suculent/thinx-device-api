---
created: 2026-10-03T22:00:00.000Z
title: Transfer accept/decline are not bound to the recipient
area: api
severity: medium
files:
  - lib/router.transfer.js:51-91 (POST decline/accept need only some session + transfer_id)
  - lib/thinx/transfer.js:413 (request returns the transfer_id to the sender)
  - lib/thinx/devices.js:156-157 (revoke_devices assigns instead of appending)
  - lib/thinx/transfer.js:133 (migrate_device reads an undefined `device`)
  - lib/thinx/transfer.js:108,669 (partial accept/decline delete array entries by udid key)
  - lib/thinx/transfer.js:250-261,354 (exit_on_transfer inversion)

audit_acknowledged:
  milestone: v1.14
  at: 2026-10-05
---

## Problem

`POST /api/transfer/accept` and `/decline` (and their v2 routes) need only a session plus the
`transfer_id` (`lib/router.transfer.js:51-91`). They do not check that the caller is the
transfer's recipient. `request()` returns that `transfer_id` to the sender
(`lib/thinx/transfer.js:413`), so the sender can complete their own transfer and place
devices in the recipient's account without consent.

After quick 261003-t29, an accept can move only devices that belong to the stored transfer and
that the sender still owns. So this is a consent problem, not a device-takeover problem
(threat T-t29-08, disposition: transfer).

## Fix

- Bind POST accept/decline to the recipient. The session owner must equal
  `sha256(prefix + record.to)`. Otherwise answer exactly like an unknown transfer.
- Stop returning the capability id to the sender. Answer with an opaque success, and let only
  the e-mail links carry the id.

## Related functional bugs found in the same audit

- `devices.revoke_devices` assigns the candidate list instead of appending
  (`lib/thinx/devices.js:157`, `devices_for_revocation = [a_device]`). A multi-device revoke
  therefore deletes only the last match, and the multi-device branch can never run. Matching
  is also a substring search over `udids.toString()` (`:156`).
- `migrate_device` (now `migrate_owned_device`) reads an undefined `device` variable when
  `mig_sources` is true (`lib/thinx/transfer.js:133`, `const usid = device.source`). That throws
  a ReferenceError. The document is now available from `Device#fetchOwned`, so the fix is to
  pass it through.
- Partial accept and decline delete array entries by udid key (`delete json_keys.udids[udid]`,
  `lib/thinx/transfer.js:108`, `:669`). That is a no-op on an array, so the stored list never
  shrinks and a partial transfer can never complete.
- The `exit_on_transfer` check is inverted (`lib/thinx/transfer.js:250-261`): a missing
  `dtr:<index>` key counts as "in progress". It is also racy (`:354`, evaluated before the
  callbacks run) and keyed by array index rather than udid. See item 3 of
  `.planning/todos/pending/2026-09-29-resolve-legacy-fixmes-owner-transfer.md`.

## Status after 261003-u86

- No item above is fixed. Line numbers in `lib/thinx/transfer.js` have moved: the
  migration is now `migrate_owned_device` plus `finish_migration`.
- The legacy opt-in key migration (`migrate_api_keys`, behind `body.api_keys`) was removed.
  It is replaced by the always-on move: the device's API key entry moves to the recipient
  with a transfer binding, and `mig_apikeys` is ignored.
- The `mig_sources` block (with its undefined `device` read) is unchanged, and now runs only
  after both the key and the owner have moved.
- Because accept is still not bound to the recipient, a sender who accepts their own transfer
  now also pushes the device's API key into the recipient's account.

## Resolution (261004-l7q)

Commits: `d4c70ce7` (RED spec), `2d78df6d` (binding), `656d3d3b` (functional bugs). Local pin:
`spec/jasmine/TransferRecipientSpec.js` (27 specs).

- **Recipient binding: resolved** (`2d78df6d`). POST accept/decline (v1 and v2) pass
  `Util.ownerFromRequest(req)` (never `body.owner`) to the library; `Transfer.boundToCaller`
  requires it to equal `sha256(prefix + record.to)`. Any other caller gets exactly the
  unknown-transfer answer (accept: 200 `transfer_id_not_found`; decline: 200 `success:true`
  `decline_complete_no_such_dtid`) before anything changes. The GET e-mail links stay
  capability-only (no session needed).
- **Capability id no longer returned to the sender: resolved** (`2d78df6d`). Neither console
  reads the request answer (classic `DevicesController` and Vue `Devices.vue`/`DeviceDetail.vue`
  branch on `success` only), so `request()` now answers `"transfer_requested"`. The id goes only
  into the recipient's e-mail (and a third callback argument for in-process callers; no router
  forwards it). Console and audit lines no longer carry the id either (the sender's audit log
  used to show it on accept/decline, which would have let the sender use the GET link).
- **`revoke_devices`: resolved** (`656d3d3b`): appends every match, exact udid comparison. Note:
  `owner_purge` revokes with a `udids` list, so a purge now removes every device, not just one.
- **`mig_sources` ReferenceError: resolved** (`656d3d3b`): `finish_migration` takes the fetched
  document. `move_source` also wrote the recipient's whole `sources` map into the *sender's*
  document; it now writes only the recipient's (copy semantics, as `request()`'s comment says)
  and refuses without writing when the source is not in the sender's map. Open question: user
  documents keep sources under `repos`, not the legacy `sources` field, so `mig_sources` is
  effectively a no-op for current accounts; it is also read from the *accept* body, which the
  GET link never sets.
- **Partial accept/decline: resolved** (`656d3d3b`): handled udids are filtered out of the stored
  array; partial/complete threshold is now "anything left" (it was `> 1`); a refused accept keeps
  already-moved devices off the list. Decline answers exactly once.
- **`exit_on_transfer`: NOT fixed (out of scope).** Still inverted, racy (read before the
  callbacks run) and keyed by array index (`dtr:0`, `dtr:1`, also in `store_pending_transfer`).
  Tracked as item 3 of `2026-09-29-resolve-legacy-fixmes-owner-transfer.md`. This todo stays in
  pending for that item only.
- Unchanged by design: POST decline uses `body.udid` (one device) and declines everything when it
  is absent, even if `body.udids` lists devices (the route requires `udids` but ignores it).
