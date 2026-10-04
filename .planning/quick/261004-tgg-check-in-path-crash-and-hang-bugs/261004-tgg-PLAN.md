---
quick_id: 261004-tgg
type: quick
autonomous: true
files_modified: [lib/thinx/device.js, lib/thinx/deployment.js, local spec]
must_haves:
  truths:
    - "markUserBuildGoal error path uses the device's owner (device.owner) for alog and always calls back exactly once with (res, false, 'update_failed') — no ReferenceError"
    - "New-device SigFox registration never calls a nulled callback: the devicelib.insert completion handles success and failure without TypeError, and the HTTP response is sent exactly once"
    - "Device#envs: no throw when error is null/undefined; the error-log condition is correct (logs only on a real error); callback exactly once with the existing success/failure shapes"
    - "Deployment#validateHasUpdateAvailable(undefined) returns false without throwing"
    - "register missing-MAC path calls back with the same (res, false, reason) arity as every other register failure, so the request is answered"
    - "Every other check-in/registration behaviour unchanged; 261004-sdv log forms kept"
---
# Quick 261004-tgg: check-in path crash and hang bugs
Source: 261004-sdv SUMMARY "Bugs found and not fixed" items 1–5 (read it for file:line). Pin each with a LOCAL spec case (stubbed devicelib/userlib/alog, HTTP res stub counting writes), failing first. Item 6 (sanitka.udid logs its raw input) and item 7 are out of scope — keep them listed as open in the SUMMARY.
