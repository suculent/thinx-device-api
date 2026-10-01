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

## From plan 26-02 (2026-10-01)

1. **The ZZ spec tier does not run in CI, so `ZZ-LogPagingCouchSpec.js` will not run on the 26-06 push.**
   `npm run split-tests` deletes `./spec/jasmine/ZZ*.js` when `CIRCLE_NODE_INDEX` is 0, and
   `.circleci/config.yml` runs `parallelism: 1`, so index 1 never runs (see the warning in
   `docker-entrypoint.sh`). The 26-06 truth "`test` ran ZZ-LogPagingCouchSpec against real CouchDB"
   cannot hold as things stand. Smallest fix: keep this one spec on node 0, e.g. `split-tests` →
   `for f in ./spec/jasmine/ZZ*.js; do [ "$f" = ./spec/jasmine/ZZ-LogPagingCouchSpec.js ] || rm -f "$f"; done`.
   The spec only needs CouchDB, uses scratch DBs and random owners, and does not depend on the
   bootstrap app. The executor's attempt to make this `package.json` change was denied by the
   permission classifier, so it needs an operator decision. Also note that `npm run test` is
   `jasmine || true`, so a failing spec does not fail the CircleCI `test` job; read the log.
2. **`GET /api/v2/logs/build/:bid` (`fetchBuildLogID`, `lib/router.logs.js`) has no owner check.**
   Pre-existing, out of scope for 26-02 (LOG-04 covers the list routes only). It also logs the
   whole build log and the owner on two lines.
