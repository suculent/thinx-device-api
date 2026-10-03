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
