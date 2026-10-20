---
status: complete
phase: 42-ci-trim-login-page-build-footer
source: [42-VERIFICATION.md]
started: 2026-10-12T17:06:15Z
updated: 2026-10-12T17:29:18Z
---

## Current Test

[testing complete]

## Tests

### 1. H1: Open https://console.thinx.cloud/#/login at 1280x720
expected: THiNX logo (200x100) centred ~24px above a darkened panel titled 'Welcome to THiNX Management Console.' (no 'THiNX Login'); subtitle, Username, Password, Forgot password?, green Login, then Login with Google / Login with GitHub side by side directly under it, then 'Don't have an account? Sign up now!' and 'Create an Account'. Footer on one line: '© 2018 – 2026 THiNX Console by THiNX Cloud · 2e018d7', not overlapping 'Create an Account'.
result: pass (operator: "All good — continue", 2026-10-12)

### 2. H2 (also UI-SPEC backstop E4 overflow): resize to 460x800, then 375x667
expected: At 460x800 both social labels fit on one line side by side (scrollWidth <= clientWidth on both). At 375x667 the two social buttons stack full width.
result: pass (operator: "All good — continue", 2026-10-12)

### 3. H3: Log in on https://console.thinx.cloud with a real password account, log out, 'Login with Google', log out, 'Login with GitHub'
expected: Each completes and lands on the dashboard under CSRF enforcement (roadmap SC4 second sentence).
result: pass (operator: "All good — continue", 2026-10-12)

### 4. H4: Open https://console.thinx.cloud/#/password-reset, then any authenticated page
expected: Darkened panel and the same footer on password reset; the authenticated layout footer shows the same text (© 2018 – 2026 … · 2e018d7) with readable link colours and no overlap with page content on a ~390px phone (review IN-05).
result: pass (operator: "All good — continue", 2026-10-12)

### 5. H5: Run the console-retest skill against https://rtm.thinx.cloud/ (Legacy)
expected: Served bundle unchanged, websocket target wss://rtm.thinx.cloud/…, no sensitive console logging, Devices page renders against the redeployed API.
result: pass (operator: "All good — continue", 2026-10-12)

### 6. H6 (deferred to the next main merge): check the first main pipeline after this phase
expected: snyk-code-monitor, snyk-oss-monitor, snyk-monitor-api and snyk-monitor-console-vue all run and succeed; snyk-monitor-console-vue pulls thinxcloud/console:vue with the dockerhub context alone.
result: pass (operator: "All good — continue", 2026-10-12)

### 7. Prohibitions review (16 judgment-tier items, all flagged): confirm the non-authoritative verdicts below
expected: Operator accepts that no prohibition was violated (see Prohibitions table).
result: pass (operator: "All good — continue", 2026-10-12)

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
