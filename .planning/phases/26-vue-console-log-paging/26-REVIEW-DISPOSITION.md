---
phase: 26-vue-console-log-paging
review: 26-REVIEW.md
updated: 2026-10-02
---

# Phase 26 code review disposition

The operator chose WR-01, WR-02, WR-04 and IN-03 for fixing on 2026-10-02. Each fix commit is signed and has a sentinel or contract test that failed before the fix. The other findings stay open or deferred as shown.

| ID | Severity | Disposition | Note |
|----|----------|-------------|------|
| WR-01 | warning | fixed | `4e92cb1b`: owner-checked reads turn every CouchDB error into the error_missing_build body. Spec: BuildLogOwnerSpec (deleted doc, ECONNREFUSED). Not yet in production. |
| WR-02 | warning | fixed | `51cb477e`: the installer defaults to `--roots none`; folder deletion needs an explicit `--roots` after a dry run. Production keeps its `deploy,repos` schedule, because an existing file is never overwritten. |
| WR-03 | warning | deferred | Operator decision: this is the D-19 planned fallback, and no data crosses tenants. Remove it together with the legacy `_design/logs` views in a follow-up. |
| WR-04 | warning | fixed | `e417e92e`: the spec/node retention tests run as a Dockerfile.test RUN step, where a failure fails CI; `npm run test:node` added. `jasmine \|\| true` itself is unchanged (separate decision). |
| IN-01 | info | open | Cursor round-trip edge case. |
| IN-02 | info | open | `Audit._buildRecord` accepts an object message. |
| IN-03 | info | fixed | `24d5510d`: the owner.js update, password_reset_init and atomic-success lines log fixed tokens only. Spec: OwnerLogLeakSpec (three cases). |
| IN-04 | info | open | Retention protect set keyed by full path. |
| IN-05 | info | open | Wrapper log rotation and usage-error logging. |
| IN-06 | info | open | History first-page failure shown as loaded. |
| IN-07 | info | open | Paged path has no fallback during a boot reindex. |
| IN-08 | info | open | `clear-leaked-credentials.js` host/port validation. |
