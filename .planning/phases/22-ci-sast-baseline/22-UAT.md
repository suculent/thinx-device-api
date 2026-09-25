---
status: testing
phase: 22-ci-sast-baseline
source: [22-VERIFICATION.md]
started: 2026-09-25T14:48:39Z
updated: 2026-09-25T14:48:39Z
---

## Current Test

number: 1
name: Logged-in retest of the classic console at https://rtm.thinx.cloud (console-retest skill)
expected: |
  Dashboard loads, websocket connects to wss://rtm.thinx.cloud/..., Devices page renders with no Angular parse error, and the browser console shows no cookie/owner/profile debug logging
awaiting: user response

## Tests

### 1. Logged-in retest of the classic console at https://rtm.thinx.cloud (console-retest skill)
expected: Dashboard loads, websocket connects to wss://rtm.thinx.cloud/..., Devices page renders with no Angular parse error, and the browser console shows no cookie/owner/profile debug logging
result: [pending]

### 2. Confirm the non-authoritative LLM-judge verdicts on the 11 judgment-tier prohibitions (22-01 x3, 22-02 x2, 22-03 x2, 22-04 x4); see the Prohibitions table in 22-VERIFICATION.md
expected: Each prohibition held
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
