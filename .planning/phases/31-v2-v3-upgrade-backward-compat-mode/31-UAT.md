---
status: testing
phase: 31-v2-v3-upgrade-backward-compat-mode
source: [31-VERIFICATION.md]
started: 2026-10-07T22:38:27Z
updated: 2026-10-07T22:38:27Z
---

## Current Test

number: 1
name: Resolve the 12 judgment-tier prohibitions (P1–P12 in 31-VERIFICATION.md)
expected: |
  Operator confirms each LLM-judge "not violated" verdict, or names the one that is wrong.
  (ADR-550 D4: judgment-tier prohibitions are never silently green.)
awaiting: user response

## Tests

### 1. Resolve the 12 judgment-tier prohibitions (P1–P12 in 31-VERIFICATION.md)
expected: Operator confirms each "not violated" verdict in the Prohibitions table of 31-VERIFICATION.md, or names the one that is wrong. Flag: unverified-prohibition — human review recommended.
result: [pending]

### 2. Post-B2 "every router enabled" gate through the admin-auth dashboard (read-only)
expected: |
  curl -u <operator-creds> https://micro.thinx.cloud/api/http/routers | jq -r '.[] | select(.status!="enabled") | .name + "  " + .status'
  prints nothing; /api/overview shows http routers 30 / errors 0, services 18 / 0, middlewares 7 / 0, providers ["Swarm"] (the 2026-10-07T22:07:57Z record).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
