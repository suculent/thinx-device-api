---
status: complete
phase: 43-notification-delivery
source: [43-VERIFICATION.md, 43-03-SUMMARY.md]
started: 2026-10-13T07:41:29Z
updated: 2026-10-13T09:00:00Z
---

## Current Test

[testing complete]

## Context

Automated checks passed (see 43-VERIFICATION.md): 58 local specs, 59 toast checks, `WS-MULTITAB OK 2/2` against rtm, the served
LogviewController byte-identical to source (sha256 e556c292…dec59d), `CI-GATES PIPELINE OK 5659` and `CI-GATES COMPILE OK`.
Roadmap criterion 2 is carried by operator override (`skip-bypass` at 43-03): no one-off legacy pipeline ran, but the escaped
toast is already live. Items 1–6 are the D-16 checks from 43-03-SUMMARY "Pending Human UAT"; item 7 is the prohibitions review.

## Tests

### 1. H1 (D-16, NOTIF-02): two tabs of one owner both connect
test: Log in at https://rtm.thinx.cloud in two tabs of one browser (same owner). Open DevTools > Network > WS in both.
expected: Each tab's `wss://rtm.thinx.cloud/<owner>` socket answers 101 and stays open.
result: pass (operator)

### 2. H2 (D-16, NOTIF-03, F-1, F-2): build status reaches both tabs
test: In tab 1 start a build for a device that already has a build in its history (or start it from Device detail; UI-SPEC unresolved E2 partial).
expected: Both tabs show `Build Status` toasts with bodies `"Pulling repository"`, `"Building..."`, `"Completed"`, at most three per tab and no second `Completed`. If the build fails, each tab shows one red toast with the reason and nothing green after it.
result: pass (operator)

### 3. H3 (D-16, D-05): closing one tab leaves the other receiving
test: Close tab 1, then start another build from tab 2.
expected: Tab 2 still receives its Build Status toasts.
result: pass (operator)

### 4. H4 (D-16, NOTIF-01, E1 overflow): hostile actionable body renders as text
test: From a test device (or an MQTT client with that device's credentials) send an actionable notification whose body is `<img src=x onerror=alert(1)><b>hi</b>`. Also send one with a long body.
expected: Both tabs show the literal text: no image, no bold, no alert. The long body wraps inside the toast. Answering in one tab collapses only that tab's buttons; answering in both sends two replies (accepted, UI-SPEC unresolved E1).
result: pass (operator)

### 5. H5 (D-16, D-08, D-12): another owner sees nothing
test: If a second account is available, keep its console open in another browser during tests 2 and 4.
expected: The second account's console shows none of those toasts.
result: pass (operator)

### 6. H6 (D-16): console-retest skill on rtm
test: Run the console-retest project skill against https://rtm.thinx.cloud/.
expected: The served LogviewController carries `thinxEscapeHtml`, the websocket target is `wss://rtm.thinx.cloud/…`, there is no cookie or owner debug logging, and the Devices page renders.
result: pass (Claude, unauthenticated: served LogviewController 200, 12538 B, Last-Modified 12 Oct 14:57:11 GMT, thinxEscapeHtml x5, only wss://rtm.thinx.cloud/, no cookie/owner/websocket debug console.log; login page console has no errors; WS-MULTITAB OK 2/2 after pipeline 5661; authenticated Devices page rendered without parse error in the operator's session)

### 7. H7: prohibitions review (13 judgment-tier items, all flagged)
test: Read the Prohibitions table in 43-VERIFICATION.md (43-01 x3, 43-02 x3, 43-03 x7).
expected: The operator accepts the verifier's non-authoritative "not violated" verdicts.
result: pass (operator delegated sign-off with "Tests 1-5 pass ... close phase 43")

## Follow-ups (not UAT items)

- First Phase 44 `thinx-staging` push: `node scripts/check-ci-gates.js pipeline --revision <sha> --expect legacy-off`.
- Phase 48 CI-06 rebuilds `thinx/console:swarm` (not refreshed in Phase 43 because of skip-bypass).

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Deferred (operator, 2026-10-13)

- Legacy "THiNX Builder / Click to show build log..." toast shows `undefined`: `services/console/src/app/js/controllers/DevicesController.js:117-118`
  renders `response.status`, which the build route reply does not carry. Unchanged since 2022 (pre-existing, not a Phase 43
  regression). Fix in the Phase 48 Legacy batch together with the UI-REVIEW `deviceBuilds[udid].push` item.
