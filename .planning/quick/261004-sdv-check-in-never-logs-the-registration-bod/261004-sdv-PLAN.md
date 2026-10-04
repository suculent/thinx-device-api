---
quick_id: 261004-sdv
type: quick
autonomous: true
files_modified: [lib/thinx/device.js, local spec]
must_haves:
  truths:
    - "The check-in/registration path never logs the registration body or device documents: remove/replace `console.log(JSON.stringify(reg))` (lib/thinx/device.js ~564 and ~1185 per 261004-rdf SUMMARY; re-grep) with a line carrying at most udid + a reason/state code"
    - "Sweep the whole check-in path (Device#register and helpers: checkinExistingDevice, updateDeviceDataWithRegistration, update_device_and_respond, markUserBuildGoal, SigFox branch `JSON.stringify(reg)` x2, validateHasUpdateAvailable `{ device }`, revoke err/doc, getEnvs/detail raw errors — see 261004-l8k SUMMARY open question 3) for lines that print owner ids, MACs, keys/hashes, env values, statuses or whole objects; fix them the same way"
    - "Audit/alog entries and the existing `[OID:…] [DEVICE_CHECKIN]` structured audit line are out of scope (they are the audit trail) — leave them; list them in the SUMMARY"
    - "Behaviour unchanged (only log lines)"
---
# Quick 261004-sdv: check-in never logs the registration body
Pin with a LOCAL spec (console.log spy, stubbed devicelib) over the check-in path: no owner id, mac, key, hash, status value or JSON object appears in logs. TDD. Explicit paths only; no submodules.
