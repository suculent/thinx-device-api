---
status: partial
phase: 44-device-list-parity
source: [44-VERIFICATION.md, 44-03-SUMMARY.md]
started: 2026-10-13T12:05:16Z
updated: 2026-10-13T12:05:16Z
---

## Current Test

[awaiting operator]

## Context

Automated checks passed (see 44-VERIFICATION.md, 20/24, no gaps): `test:unit` exit 0 with 198 ok and 0 FAIL, the Vue
production build, `test:csp:dist`, `perf:spotter`, `CI-GATES COMPILE OK`, `CI-GATES PIPELINE OK 5662` (legacy-off).
https://console.thinx.cloud/js/app.js serves build `d630652` with every Phase 44 marker and none of the removed category
strings. The Legacy `main.js` and `LogviewController.js` on rtm are byte-identical to the pre-deploy baselines.

Items 1-9 are the operator checks from 44-03-SUMMARY "Human UAT". Item 10 is the prohibitions review. Items 2, 6 and 7
carry the UI-SPEC backstop truths, which presence checks cannot prove.

Log in at https://console.thinx.cloud and open Devices and Repositories from the sidebar. Reloading a deep link still
lands on the dashboard until Phase 48.

## Tests

### 1. U1 (DEV-01..05, E1 populated): device list at 1280x720
test: Open Devices in list view at 1280x720.
expected: Each row shows the checkbox, a 32px platform-coloured tile with the Legacy device symbol, the alias, the platform bullet (for example "Arduino" on teal with black text; an unknown platform reads "unknown"), cogs + firmware, heartbeat + status ("Registered" when there is none), Last Seen, and Build (hammer), View log (eye), Edit (pencil), Revoke (trash) with their text, all on one line. No colour name such as a category label appears anywhere.
result: [pending]

### 2. U2 (DEV-03, backstop E5 overflow): narrow viewports
test: In the DevTools device toolbar, resize to 1024, 768 and 375 px wide.
expected: The Actions cell stays on one line at every width. Below 992 px only icons show, and hovering an icon shows its text. The page itself never gets a horizontal scrollbar; at 1024 px any horizontal scroll is inside the table box.
result: [pending]

### 3. U3 (DEV-05): API-key warning
test: Find a device without an API key.
expected: An orange warning triangle sits right after the heartbeat. Its hover tip reads "No API key assigned. The device cannot check in until you assign one." Devices with a key show none. If no device lacks a key, record that.
result: [pending]

### 4. U4 (DEV-01, DEV-04): filter, sort and grid view
test: Use the platform pills, set sort to "Platform", then switch to grid view.
expected: Pills read "All" plus the platforms present (display names, unknown last). Clicking one filters the list. Sort "Platform" groups by platform, then alias. Grid cards show the 48px tile + alias header, the bullet line, firmware, status, last seen, and Build / View log / Edit in one row with Edit on the right.
result: [pending]

### 5. U5 (DEV-02): row actions
test: Press View log on a device with a build and on one without, press Edit, press Revoke and then Cancel. Build is optional because it starts a real build.
expected: View log opens the build log dialog. A device without a build shows a disabled eye whose tip reads "No build yet". Edit opens Device Detail. Revoke opens "Confirm Revoke" and Cancel leaves the device alone. If Build is pressed once, it shows a spinner with "Building…" until the request settles, then "Build triggered." or an error message.
result: [pending]

### 6. U6 (backstop E1 populated): fonts and images
test: Open DevTools Network with cache disabled and reload the Devices page.
expected: No font or image request fails. The hammer glyph renders as a hammer, not a box or blank. The tiles show a visible platform-coloured frame around the symbol.
result: [pending]

### 7. U7 (backstop E5 long-text): long status or firmware
test: Look for a device whose status is longer than 22 characters or whose firmware string is wider than its cell.
expected: The status shows 22 characters and "…" with the full text as tip. The firmware is cut with "…" and its full text is the tip. If there is no such device, record "no long data on production; covered by the 44-02 unit checks".
result: [pending]

### 8. U8 (REPO-01): Repositories bullet
test: Open Repositories.
expected: The platform column shows the same bullet as Devices. A repository whose platform is unknown reads "unknown", never "unknown_platform".
result: [pending]

### 9. U9: console-retest on Legacy
test: Run the console-retest project skill against https://rtm.thinx.cloud/ (Legacy).
expected: The Devices page still renders against the redeployed API, the websocket target is wss://rtm.thinx.cloud/…, and there is no sensitive console logging.
result: [pending]

### 10. U10: prohibitions review (14 judgment-tier items, all flagged)
test: Read the Prohibitions table in 44-VERIFICATION.md (44-01 x4, 44-02 x4, 44-03 x6).
expected: The operator accepts the verifier's non-authoritative verdicts: "not violated" where the code or git history shows it, and the SUMMARY attestation for the items that code cannot show (no ssh, no login, no `.env*` read, no env dump, no `npm run eslint/lint`).
result: [pending]

## Follow-ups (not UAT items)

From 44-UI-REVIEW.md (19/24), not blocking the phase goal:
- Bulk Revoke / Transfer / Push Config act on selected devices that the platform filter now hides. Prune `selectedUdids` to `filteredItems`, or name the hidden count in the confirmation.
- `loadData` has no rejection path, so a failed load leaves "Loading..." up. Add catch/finally.
- The grid "last seen" line (`text-muted small`) is below 4.5:1.
- The toolbar `gap-2` class does nothing on Bootstrap 4.6.

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none so far]
