---
schema_version: 1
open_count: 11
waived_count: 0
fixed_count: 1
total_count: 12
last_updated: 2026-10-04T13:36:30.251Z
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
| 4 | quick-261003-u86 | unrun-verify | spec/jasmine/ZZ-RouterTransferSpec.js |  | 261003-u86 CI cases (shared/revoked refusals, re-key remedy, continuity after accept III) and TransferSpec (00) not run locally: they need real Redis/CouchDB and run only in CI after the operator's push | open |  | 2026-10-03T20:58:20.142Z |  |
| 5 | quick-261003-u86 | deviation | lib/thinx/transfer.js |  | Pre-existing: Transfer#decline answers its callback twice for a live transfer (GET/POST decline -> headers already sent, unhandled rejection); the u86 re-key CI case leaves its transfer pending instead of declining it | open |  | 2026-10-03T20:58:20.367Z |  |
| 6 | quick-261003-v05 | unrun-verify | spec/jasmine/ZZ-LogTailWebSocketSpec.js |  | ZZ-LogTailWebSocketSpec (C1-C6, real session cookie) cannot run locally and is deleted by docker-entrypoint.sh before the CI run; runs only when the ZZ tier is re-enabled | open |  | 2026-10-03T21:10:46.596Z |  |
| 7 | quick-261003-v9x | unrun-verify | spec/jasmine/ZZ-RouterDeviceAPISpec.js |  | Five 261003-v9x OTT ZZ cases (real CouchDB/Redis) are deleted by docker-entrypoint split-tests before CI and cannot run locally; protection is pinned by DeviceOttSpec | open |  | 2026-10-03T21:23:40.618Z |  |
| 8 | quick-261003-v9d | unrun-verify | spec/jasmine/ZZ-RouterDeviceAPISpec.js |  | Six 261003-v9d addpush ZZ cases (real CouchDB/Redis) are deleted by docker-entrypoint split-tests before CI and cannot run locally; protection is pinned by DevicePushOwnerSpec | open |  | 2026-10-03T21:46:12.516Z |  |
| 9 | quick-261003-vn3 | unrun-verify | spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js |  | 261003-vn3: ZZ-WebSocketHandshakeRtmSpec, ZZ-WebSocketLifecycleSpec and ZZ-LogTailWebSocketSpec (real server, real session) not run: no local Redis/CouchDB and docker-entrypoint.sh deletes ZZ specs before CI; per-owner routing and registry cleanup are pinned by MessengerOwnerSocketSpec | open |  | 2026-10-03T22:15:16.000Z |  |
| 10 | quick-261003-vn3 | deviation | services/console/src/html/app/js/controllers/LogviewController.js | 219 | 261003-vn3 made actionable frames deliverable: the classic console renders the device-supplied notification.body as HTML in toastr (no escaping); any accepted publisher on /<owner>/<udid> (incl. a vbg transfer-bound previous owner) can inject HTML into the device owner's console; CSP blocks inline script; operator decision needed | open |  | 2026-10-03T22:15:16.260Z |  |
| 11 | quick-261003-vd4 | unrun-verify | spec/jasmine/ZZ-RouterDeviceAPISpec.js | 324 | 261003-vd4 CI cases (own udid reaches the envelope path; another owner's udid and an unknown udid answer no_such_device) not run: ZZ specs need real Redis/CouchDB and docker-entrypoint deletes them before CI; protection pinned locally by DeviceFirmwareOwnerSpec | open |  | 2026-10-03T22:35:35.762Z |  |
| 12 | quick-261004-l7q | unrun-verify | spec/jasmine/ZZ-RouterTransferSpec.js |  | 261004-l7q ZZ edits (opaque request answer + id read from Redis, sender's POST accept/decline answer like an unknown transfer, accept III through the recipient's GET e-mail link) and the TransferSpec (00) third-argument id not run locally: they need real Redis/CouchDB; ZZ specs are deleted before CI; binding pinned locally by TransferRecipientSpec | open |  | 2026-10-04T13:36:30.251Z |  |

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
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "quick-261003-u86",
    "file": "spec/jasmine/ZZ-RouterTransferSpec.js",
    "line": null,
    "description": "261003-u86 CI cases (shared/revoked refusals, re-key remedy, continuity after accept III) and TransferSpec (00) not run locally: they need real Redis/CouchDB and run only in CI after the operator's push",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T20:58:20.142Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "quick-261003-u86",
    "file": "lib/thinx/transfer.js",
    "line": null,
    "description": "Pre-existing: Transfer#decline answers its callback twice for a live transfer (GET/POST decline -> headers already sent, unhandled rejection); the u86 re-key CI case leaves its transfer pending instead of declining it",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T20:58:20.367Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "quick-261003-v05",
    "file": "spec/jasmine/ZZ-LogTailWebSocketSpec.js",
    "line": null,
    "description": "ZZ-LogTailWebSocketSpec (C1-C6, real session cookie) cannot run locally and is deleted by docker-entrypoint.sh before the CI run; runs only when the ZZ tier is re-enabled",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T21:10:46.596Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "quick-261003-v9x",
    "file": "spec/jasmine/ZZ-RouterDeviceAPISpec.js",
    "line": null,
    "description": "Five 261003-v9x OTT ZZ cases (real CouchDB/Redis) are deleted by docker-entrypoint split-tests before CI and cannot run locally; protection is pinned by DeviceOttSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T21:23:40.618Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "quick-261003-v9d",
    "file": "spec/jasmine/ZZ-RouterDeviceAPISpec.js",
    "line": null,
    "description": "Six 261003-v9d addpush ZZ cases (real CouchDB/Redis) are deleted by docker-entrypoint split-tests before CI and cannot run locally; protection is pinned by DevicePushOwnerSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T21:46:12.516Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "quick-261003-vn3",
    "file": "spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js",
    "line": null,
    "description": "261003-vn3: ZZ-WebSocketHandshakeRtmSpec, ZZ-WebSocketLifecycleSpec and ZZ-LogTailWebSocketSpec (real server, real session) not run: no local Redis/CouchDB and docker-entrypoint.sh deletes ZZ specs before CI; per-owner routing and registry cleanup are pinned by MessengerOwnerSocketSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T22:15:16.000Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "quick-261003-vn3",
    "file": "services/console/src/html/app/js/controllers/LogviewController.js",
    "line": 219,
    "description": "261003-vn3 made actionable frames deliverable: the classic console renders the device-supplied notification.body as HTML in toastr (no escaping); any accepted publisher on /<owner>/<udid> (incl. a vbg transfer-bound previous owner) can inject HTML into the device owner's console; CSP blocks inline script; operator decision needed",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T22:15:16.260Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "quick-261003-vd4",
    "file": "spec/jasmine/ZZ-RouterDeviceAPISpec.js",
    "line": 324,
    "description": "261003-vd4 CI cases (own udid reaches the envelope path; another owner's udid and an unknown udid answer no_such_device) not run: ZZ specs need real Redis/CouchDB and docker-entrypoint deletes them before CI; protection pinned locally by DeviceFirmwareOwnerSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T22:35:35.762Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "quick-261004-l7q",
    "file": "spec/jasmine/ZZ-RouterTransferSpec.js",
    "line": null,
    "description": "261004-l7q ZZ edits (opaque request answer + id read from Redis, sender's POST accept/decline answer like an unknown transfer, accept III through the recipient's GET e-mail link) and the TransferSpec (00) third-argument id not run locally: they need real Redis/CouchDB; ZZ specs are deleted before CI; binding pinned locally by TransferRecipientSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-04T13:36:30.251Z",
    "resolved_at": null,
    "milestone": "v1.14"
  }
]
````
