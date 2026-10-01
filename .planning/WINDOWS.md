---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 1
total_count: 3
last_updated: 2026-10-01T15:48:34.570Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 22 | unrun-verify | .planning/phases/22-ci-sast-baseline/22-02-PLAN.md |  | 22-02 Task 3 (D-13) gluster thinx.yml line + live thinx_console --env-rm not applied: auto-mode permission denial; operator commands in 22-02-SUMMARY Open Items | fixed |  | 2026-09-25T12:59:05.006Z | 2026-09-25T13:09:46.556Z |
| 2 | 26 | unrun-verify | spec/jasmine/ZZ-LogPagingCouchSpec.js |  | ZZ-LogPagingCouchSpec (real-CouchDB LOG-01..04 proof) not run: no local CouchDB, and CI split-tests deletes ZZ*.js on node 0 (parallelism 1), so it will not run on the 26-06 push either | open |  | 2026-10-01T15:48:34.227Z |  |
| 3 | 26 | deviation | lib/router.logs.js |  | Pre-existing: GET /api/v2/logs/build/:bid (fetchBuildLogID) has no owner check; out of scope for 26-02 | open |  | 2026-10-01T15:48:34.570Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "22",
    "file": ".planning/phases/22-ci-sast-baseline/22-02-PLAN.md",
    "line": null,
    "description": "22-02 Task 3 (D-13) gluster thinx.yml line + live thinx_console --env-rm not applied: auto-mode permission denial; operator commands in 22-02-SUMMARY Open Items",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-25T12:59:05.006Z",
    "resolved_at": "2026-09-25T13:09:46.556Z",
    "milestone": "v1.14"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "26",
    "file": "spec/jasmine/ZZ-LogPagingCouchSpec.js",
    "line": null,
    "description": "ZZ-LogPagingCouchSpec (real-CouchDB LOG-01..04 proof) not run: no local CouchDB, and CI split-tests deletes ZZ*.js on node 0 (parallelism 1), so it will not run on the 26-06 push either",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T15:48:34.227Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "26",
    "file": "lib/router.logs.js",
    "line": null,
    "description": "Pre-existing: GET /api/v2/logs/build/:bid (fetchBuildLogID) has no owner check; out of scope for 26-02",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T15:48:34.570Z",
    "resolved_at": null,
    "milestone": "v1.14"
  }
]
````
