# Phase 26 — Deferred Items

Out-of-scope discoveries logged by executors. Not fixed in the plan that found them.

## From plan 26-03 (2026-10-01)

1. **`lib/thinx/owner.js` `atomic()` error path logs the changes object.**
   On a failed users/edit call it runs
   `console.log("Cannot edit user on password-set", { _in_err }, "changes", changes)`.
   On the password-reset and activation paths, `changes` holds the new password hash
   (`sha256(prefix + password)`), so a CouchDB failure writes that hash to the API log.
   Same class as T-26-13, but on an error path outside the three lines plan 26-03 was
   allowed to touch. Suggested fix: log `action_name` and `_in_err.statusCode` only.
2. **`lib/thinx/owner.js` `apply_update()` error path** logs
   `JSON.stringify(changes)` (`"☣️ [error] " + uerror + " in changes : …"`). `changes` is
   `{ [update_key]: update_value }` from a profile update, which can carry profile data
   (email inside `info`). Lower risk than item 1. Suggested fix: log `update_key` only.

Neither is reached by the `AuditFlagWritersSpec` guard, which covers `alog.log` flags
and the `set_password_reset` body only.
