---
schema_version: 1
open_count: 16
waived_count: 0
fixed_count: 2
total_count: 18
last_updated: 2026-10-09T15:27:12.115Z
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
| 13 | quick-261004-l9f | unrun-verify | spec/jasmine/ZZ-CSRFEnforceSpec.js | 207 | 261004-l9f ZZ edit (case 5 also asserts a non-empty body, because a failed Bearer now answers an empty 401 that not.equal(403) no longer catches) not run locally: needs real Redis/CouchDB; ZZ specs are deleted before CI; 401 pinned locally by BearerVerifyStatusSpec | open |  | 2026-10-04T14:12:59.534Z |  |
| 14 | 31 | deviation | .planning/runbooks/traefik-v3-cutover.md |  | 31-01 Task 3 'every router enabled' gate deferred to Plan 03 post-B2 (operator decision A); live /api/http/routers status filter must print nothing after B2 | open |  | 2026-10-07T20:31:35.630Z |  |
| 15 | 33 | deviation | .planning/runbooks/traefik-edge-hardening.md |  | 33-01: overlay negative probe runs via --network container:<traefik-public peer> because traefik-public is not attachable (plan recipe refused) | open |  | 2026-10-08T23:17:41.841Z |  |
| 16 | 33 | deviation | .planning/runbooks/traefik-edge-hardening.md |  | 33-02 Task 1: Version.Index precondition drift (38379808 vs post-Stage-B 38379801) caused by a swarm leader election re-saving all services; content unchanged, treated as met in substance | open |  | 2026-10-09T09:12:46.010Z |  |
| 17 | 33 | unrun-verify | .planning/phases/33-dashboard-lockdown-tls-hardening/33-02-PLAN.md |  | 33-02 Task 1: rawdata TLS-options jq literal cannot pass on Traefik v3.7.14 (API does not expose TLS options); proven on the wire + in-task config sha instead (deferred-items.md) | open |  | 2026-10-09T09:12:46.280Z |  |
| 18 | 34 | unrun-verify | .planning/runbooks/traefik-edge-hardening.md |  | 34-02 Task 2 harness_b2 is PARITY, not PASS: step 4 OTT redeem answers OTT_UPDATE_NOT_AVAILABLE before and after the B2 cutover, because the thinx-mcp-device config was switched to a new owner at 09:41Z (new UDID, no deployed build); operator: attach a build to the new device or restore the committed config, then rerun both harness paths | fixed |  | 2026-10-09T15:23:34.207Z | 2026-10-09T15:27:12.115Z |

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
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "quick-261004-l9f",
    "file": "spec/jasmine/ZZ-CSRFEnforceSpec.js",
    "line": 207,
    "description": "261004-l9f ZZ edit (case 5 also asserts a non-empty body, because a failed Bearer now answers an empty 401 that not.equal(403) no longer catches) not run locally: needs real Redis/CouchDB; ZZ specs are deleted before CI; 401 pinned locally by BearerVerifyStatusSpec",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-04T14:12:59.534Z",
    "resolved_at": null,
    "milestone": "v1.14"
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "31",
    "file": ".planning/runbooks/traefik-v3-cutover.md",
    "line": null,
    "description": "31-01 Task 3 'every router enabled' gate deferred to Plan 03 post-B2 (operator decision A); live /api/http/routers status filter must print nothing after B2",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-07T20:31:35.630Z",
    "resolved_at": null,
    "milestone": "v1.15"
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "33",
    "file": ".planning/runbooks/traefik-edge-hardening.md",
    "line": null,
    "description": "33-01: overlay negative probe runs via --network container:<traefik-public peer> because traefik-public is not attachable (plan recipe refused)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T23:17:41.841Z",
    "resolved_at": null,
    "milestone": "v1.15"
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "33",
    "file": ".planning/runbooks/traefik-edge-hardening.md",
    "line": null,
    "description": "33-02 Task 1: Version.Index precondition drift (38379808 vs post-Stage-B 38379801) caused by a swarm leader election re-saving all services; content unchanged, treated as met in substance",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-09T09:12:46.010Z",
    "resolved_at": null,
    "milestone": "v1.15"
  },
  {
    "id": 17,
    "kind": "unrun-verify",
    "phase": "33",
    "file": ".planning/phases/33-dashboard-lockdown-tls-hardening/33-02-PLAN.md",
    "line": null,
    "description": "33-02 Task 1: rawdata TLS-options jq literal cannot pass on Traefik v3.7.14 (API does not expose TLS options); proven on the wire + in-task config sha instead (deferred-items.md)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-09T09:12:46.280Z",
    "resolved_at": null,
    "milestone": "v1.15"
  },
  {
    "id": 18,
    "kind": "unrun-verify",
    "phase": "34",
    "file": ".planning/runbooks/traefik-edge-hardening.md",
    "line": null,
    "description": "34-02 Task 2 harness_b2 is PARITY, not PASS: step 4 OTT redeem answers OTT_UPDATE_NOT_AVAILABLE before and after the B2 cutover, because the thinx-mcp-device config was switched to a new owner at 09:41Z (new UDID, no deployed build); operator: attach a build to the new device or restore the committed config, then rerun both harness paths",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-09T15:23:34.207Z",
    "resolved_at": "2026-10-09T15:27:12.115Z",
    "milestone": "v1.15"
  }
]
````
