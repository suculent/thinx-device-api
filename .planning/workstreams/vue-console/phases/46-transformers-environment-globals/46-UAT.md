---
status: complete
phase: 46-transformers-environment-globals
source: [46-VERIFICATION.md]
started: 2026-10-13T22:46:51Z
updated: 2026-10-13T23:07:28Z
---

## Current Test

[testing complete]

## Tests

### 1. CR-01 on production Device Detail (46-06 UAT items 13-14)
expected: After each alias/description/environment save the message shows, the tick and the 'Unsaved changes' note stay, Save Transformers stays enabled and Manage Transformers opens the 'Unsaved Changes' dialog; after Save Transformers, 'Transformers saved.' shows and the typed Alias is still in the field, unsaved
result: pass
note: "Retested 2026-10-14 after a hard reload: the edited Alias stays changed after Save Transformers. The first report (alias reverted) came from a stale cached bundle, not from the deployed code. Operator: 'probably my mistake when UAT testing (not hard-reloaded) previously'."

### 2. 46-05 UAT items 1-12 (46-05-SUMMARY.md § Pending end-of-phase UAT)
expected: Every item behaves as described in 46-05-SUMMARY.md (rollout, Transformers icons and Name copy, typed-confirm bulk and row delete, Device Detail dirty note / leave guard / Saving state / failure, P46_WIFI vs P46_WIFI_SSID exact-key edit, edit failure with blocked /api/v2/env, Add duplicate refusal and bulk delete, Phase 37 records, Legacy environment page)
result: pass

### 3. E1/E6 overflow at 375/768/1024/1280 px on Transformers and Environment Globals
expected: Rows one line high, Actions one IconButton row, bulk toolbar one row, no page-level horizontal scrollbar
result: pass

### 4. E3 overflow: 30 transformers selected, typed-confirm dialog at a 768 px-high viewport
expected: Names list scrolls inside a 160 px box; confirm field and Delete button stay visible; no horizontal scrollbar
result: pass

### 5. E3 long-text: 200-character no-space transformer name and a right-to-left name in the delete dialog
expected: Name wraps in question and list with no horizontal overflow; the RTL name does not reorder the sentence
result: pass

### 6. E7 long-text: 120-character variable key and a 2000-character value in the Edit value dialog
expected: Full key wraps in the title and the Key line; the long value saves with one PUT
result: pass

### 7. 46-06 process prohibitions (no ssh to production, no docker service commands, no pipeline re-trigger, no production login/credentials, no .env reads, no env dumps, no npm install/lint)
expected: Operator confirms the executor session respected them (verifier found no evidence of violation)
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — the test 1 report (G-46-1) was withdrawn after a hard-reload retest]
