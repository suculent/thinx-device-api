---
status: complete
phase: 47-build-log-search-status-colours
source: [47-VERIFICATION.md]
started: 2026-10-15T11:25:09Z
updated: 2026-10-15T12:10:43.934Z
---

## Current Test

[testing complete]

## Tests

### 1. Backstop (insufficient_spec, 47-01/47-03): open a build log of about 5 MB and type a term with more than 1000 hits
expected: At most 1000 mark elements; the count reads 1 / 1000+; Next match on 1000 wraps to 1; each step scrolls only the log box, so the current match is visible and neither the modal nor the page scrolls
result: pass

### 2. Backstop (insufficient_spec): a 20,000-character log line with no spaces, with a match in the middle, and a line holding <img src=x onerror=alert(1)>
expected: The long line wraps inside the log box with no horizontal scrollbar. The match is highlighted with no column shift. The <img> line shows as visible text, and the DOM has no image element
result: pass

### 3. Backstop (insufficient_spec): the search bar at 375px and at 1280px viewport width
expected: At 375px the bar wraps to two rows 8px apart, the field is full width, the count and both chevrons stay on one row, and the bar stays at the top while the log box scrolls. At 1280px all four blocks sit on one row
result: pass

### 4. 47-05 gap UAT: log in to https://console.thinx.cloud after a hard reload. On the dashboard Recent Builds card, History (Build Log tab) and a device's Build History, inspect each View button in Chrome DevTools > Elements > Accessibility; in History, hover and click a row with a build id and (if listed) a row without one
expected: Each View button shows the word View with the eye glyph, and its computed accessible name is `View build log <build id>` (optional: macOS Voice Control 'Click View' activates it). A History row with a build id has the pointer cursor and a click on a plain cell opens its log (not a click on Expand or a text selection). A row without one shows `—` in the Log column, the default cursor, and a click does nothing. Dashboard View + Download, navbar rows and Device Build History behave as before
result: pass

### 5. End-of-phase operator UAT (47-03 <human-check>, 11 items, carried in 47-05-SUMMARY 'Carried from 47-03-SUMMARY'): run items 1-11 in the same session
expected: Rollout times after the push (11:00:18Z; bundle fc0fa01 live 11:06:51Z); dashboard View before Download opens the log; search, wrap, centred scroll, Esc and reset on reopen; inert HTML when searching for `<`; error state with Try again; TIMEOUT amber / FAILED red / OK green / RUNNING blue on all four lists; Device Build History cells inert; navbar static rows; layout backstops; Phase 36/35 records; Legacy console-retest on https://rtm.thinx.cloud/
result: pass

### 6. Flagged judgment-tier prohibitions (20 in total: 11 from 47-01..47-03, 3 from 47-04, 6 from 47-05; all `verification: judgment`, `flagged: true`): review the non-authoritative LLM-judge verdicts in the Prohibitions table
expected: Operator confirms or rejects each verdict. Process prohibitions (no ssh/docker/swarm edits, no production login or credentials, no lint/npm install, no env reads or env dumps) can only be confirmed from the executor's session, not the repository
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
