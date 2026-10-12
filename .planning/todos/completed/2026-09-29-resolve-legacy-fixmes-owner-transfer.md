---
created: 2026-09-29T12:30:00.000Z
title: Resolve legacy FIXMEs in owner.js and transfer.js
area: api
severity: minor
files:
  - lib/thinx/owner.js:266 (avatar_path ignores development-mode override)
  - lib/thinx/owner.js:901 (create logs the owner username hash)
  - lib/thinx/transfer.js:338 (request() evaluates result before exit_on_transfer callbacks return)

audit_acknowledged:
  milestone: v1.14
  at: 2026-10-05
---

## Problem

Three FIXME markers from 2023 had no tracking reference. The Phase 24 verifier flagged them under the
debt-marker gate because plan 24-01 modified both files (the Mailgun `readSecret` sweep). Phase 24
did not touch the code they describe.

1. **`owner.js` `avatar_path()`**: the path is built from `app_config.data_root` and is not overridden
   in development mode. It does not matter in test.
2. **`owner.js` `create()`**: `console.log("[DEBUG] [create] checking owner by username", username)`
   logs the username, which is the owner hash for OAuth-created accounts. It is identifying data in
   the logs, and should be removed or redacted like the `managed_logs` redaction work.
3. **`transfer.js` `request()`**: the `for … in body.udids` loop calls `exit_on_transfer()` with
   callbacks, but `result` is read before those callbacks run. So the "already being transferred"
   check never blocks a transfer. It needs a Promise/async rewrite. This is a correctness bug.

## Solution

- (2) is a small log-hygiene fix.
- (3) needs the async rewrite plus a spec that shows a device already in transfer is refused.
- (1) can be closed as won't-fix if development mode no longer uses a separate data root.

## Status (updated 2026-10-06)

- [x] **(3) transfer.js `request()`** — **RESOLVED.** Promisified the in-progress gate: it now
  iterates the real udids, awaits all `exit_on_transfer()` checks via `Promise.all`, and refuses
  with `transfer_already_in_progress` before any ownership/key lookup. Added a regression test
  (`TransferApiKeySpec.js`) that seeds `dtr:<udid>` and asserts the refusal (fails on pre-fix code).
  Commit `5fdb15e4`; shipped in release `v1.14.4031`.
- [x] **(2) owner.js `create()`** — **RESOLVED.** The `[DEBUG] [create] checking owner by username`
  log at `owner.js:909` no longer logs the value — the username is the OAuth owner hash (identifying
  data), so the breadcrumb is kept without it. Decision 2026-10-06.
- [x] **(1) owner.js `avatar_path()`** — **CLOSED (won't-fix).** `avatar_path` builds from
  `app_config.data_root` with no development-mode override; harmless outside production file-serving
  (dev/test use no separate data root). The `FIXME` marker at `owner.js:266` was replaced with a
  won't-fix `NOTE`. Decision 2026-10-06.

All three items closed → moved to `completed/` on 2026-10-06.
