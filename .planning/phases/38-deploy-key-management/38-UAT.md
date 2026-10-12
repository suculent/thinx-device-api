---
status: complete
phase: 38-deploy-key-management
source: [38-01-SUMMARY.md]
started: 2026-10-12T12:55:00Z
updated: 2026-10-12T14:28:31.815Z
---

## Current Test

[testing complete]

## Tests

### 1. Name a deploy key before generating it (Vue)
expected: On the Vue "Deploy Keys" page on rtm.thinx.cloud, you can enter a name before generating a key. The new key appears in the list under that name, and the name is still there after a page reload.
result: pass

### 2. Deploy Keys list: label, order, show and copy
expected: The page and menu say "Deploy Keys". Keys are listed newest first by generation time. Each key can show its public key and copy it to the clipboard; the copied text is the full public key.
result: pass

### 3. Deleting deploy keys
expected: Selecting one or more keys and pressing Delete asks for confirmation first (Cancel is the default). Confirming deletes exactly the selected keys, also after the list was re-sorted; other keys stay.
result: pass

### 4. Failed deploy-key load shows an error
expected: If the deploy-key list cannot be loaded, the page shows an error message rather than "No deploy keys yet." (If you can't provoke a failure, answer "skip".)
result: skipped
reason: "Operator answered skip: a load failure could not be provoked live. Behaviour is covered by the unit suite (35 WR-05, console 295c83a)."

### 5. Legacy console: named key generation
expected: In the legacy console's deploy-key page, you can enter a name and generate a key. The key appears in the list right away (no manual refresh) under that name, and the same key and name show in the Vue Deploy Keys page.
result: pass

### 6. Legacy console: generation errors
expected: If key generation fails in the legacy console (for example an invalid name), you get a clear error notification and the Generate button becomes usable again instead of staying stuck.
result: pass
note: "Operator decision: pass (legacy console is being deprecated). The form blocks invalid names (tab sanitized, maxlength 120, Create disabled while blank). With maxlength and disabled removed in DevTools, clicking Create logged --creating deploy key-- with no visible notification; not pursued."

## Summary

total: 6
passed: 5
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
