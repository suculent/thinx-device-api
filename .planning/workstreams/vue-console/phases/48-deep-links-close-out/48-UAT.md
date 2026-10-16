---
status: testing
phase: 48-deep-links-close-out
source: [48-VERIFICATION.md]
started: 2026-10-16T15:19:46Z
updated: 2026-10-16T15:19:46Z
---

## Current Test

number: 1
name: Deep links on production (NOTIF-04): logged in on https://console.thinx.cloud, open /#/app/history and reload; reload /#/app/devices and a device page; log out and load /#/app/history
expected: |
  History stays (URL /#/app/history/audit) with no dashboard flash; devices and device page stay; logged out lands on /#/login
awaiting: user response

## Tests

### 1. Deep links on production (NOTIF-04): logged in on https://console.thinx.cloud, open /#/app/history and reload; reload /#/app/devices and a device page; log out and load /#/app/history
expected: History stays (URL /#/app/history/audit) with no dashboard flash; devices and device page stay; logged out lands on /#/login
result: [pending]

### 2. Build Firmware (POL-01): click Build Firmware on a device page, double-click quickly, and repeat with keyboard (Tab, Enter)
expected: Spinner and disabled button until the reply, then 'Build triggered.'; DevTools Network shows one POST /api/v2/build per click burst; keyboard focus returns to the button
result: [pending]

### 3. Account menu (POL-01): inspect the header toggle
expected: User-circle icon with hover tip 'Account'; DevTools Accessibility names the toggle 'Account menu'; My Profile and Log Out work
result: [pending]

### 4. Device Detail content column on a wide window
expected: Column stops at about 1140px, left-aligned under the full-width title
result: [pending]

### 5. Device list (D-14): view toggles, keyboard focus on warning markers, Platform sort, row selection across re-sort
expected: 'List view'/'Grid view' tips; Tab reaches markers and tips show on focus with a visible ring; Platform order matches pills with unknown last; selection stays on the same devices
result: [pending]

### 6. Danger alert (48-03 backstop truth): trigger a failed action on Device Detail, ideally with a long API reason
expected: White text on #C93C3C (computed rgb(255, 255, 255)); the long reason wraps inside the 1140px column; the white close button is visible and clickable
result: [pending]

### 7. Legacy deploy keys (48-04 backstop truth) on https://rtm.thinx.cloud: create a key whose name contains a pasted tab, then one with a 121-character name pasted past maxlength, then a normal name
expected: Tab: 'The name contains a control character, such as a tab or a line break.'; 121 chars: 'The name is longer than 120 characters.'; no request sent for either, never [object Object]; Create works again; the normal name creates the key
result: [pending]

### 8. Legacy build toast and first socket (48-04 backstop truth): build a device on rtm.thinx.cloud; use a device with no build history; in a fresh tab open a build log overlay first, then trigger a build elsewhere
expected: THiNX Builder toast reads 'Build started.' or 'Build queued.' then 'Click to show build log...', never 'undefined'; the no-history device shows its build toasts; the overlay-first tab receives notifications without a reload
result: [pending]

### 9. Run the console-retest project skill against https://rtm.thinx.cloud/ and confirm Swarmpit shows Vue, Legacy and API tasks started after 2026-10-16T12:29:38Z
expected: Skill passes; tasks are the pipeline 5677 rollouts
result: [pending]

### 10. Legacy Cypress env file (48-05, D-05; review IN-07): the operator inspects the formerly tracked services/console/src/cypress env file that is still in the public console repo history
expected: A recorded result: 'no real credential' or 'rotated ...'
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps
