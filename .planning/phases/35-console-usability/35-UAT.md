---
status: diagnosed
phase: 35-console-usability
source: [35-01-SUMMARY.md]
started: 2026-10-12T10:03:40Z
updated: 2026-10-12T10:08:42.571Z
---

## Current Test

[testing complete]

## Tests

### 1. Header cleanup and My Profile rename
expected: In the Vue console on rtm.thinx.cloud, the header has no template alert banner, no Inbox entry, and only one Logout action. The account menu entry reads "My Profile" (not "My Account") and still opens the profile page.
result: pass

### 2. Device action buttons at the top
expected: Opening a device detail shows the action buttons with icons in a row at the top of the page, including one for editing the device environment. Each button performs its action, and the environment button opens the environment editor.
result: pass

### 3. Single-column device detail
expected: The device detail sections are stacked in a single column (no side-by-side cards) on a desktop-width window, and nothing overlaps or is cut off.
result: pass

### 4. Linked repository shows name and Git URL
expected: For a device linked to a source repository, the device detail shows the repository's name and its Git URL, not a raw source ID or hash.
result: issue
reported: "pass but the URL should be clickable and open in a detached tab/window (target blank, noopener, noreferer set correctly to prevent XSS)."
severity: minor

### 5. Exclusive notification selection
expected: In the notification settings, selecting "All" clears "Important" and "Informational", and selecting either of those clears "All". After you save and reload the page, the same selection is shown.
result: pass

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-35-4
  truth: "Linked repository Git URL is shown as a clickable link that opens in a new tab with target=\"_blank\" and rel=\"noopener noreferrer\", and only http(s) URLs are rendered as links"
  status: failed
  reason: "User reported: pass but the URL should be clickable and open in a detached tab/window (target blank, noopener, noreferer set correctly to prevent XSS)."
  severity: minor
  test: 4
  root_cause: "DeviceDetail.vue renders linkedRepository.url as plain text in a <p> (line 69); no anchor, no scheme check. Repository URLs are user-entered (Repositories.vue form.url) and may be https://, git@host:path (SSH) or arbitrary text, so a naive :href binding would allow javascript: URLs."
  artifacts:
    - path: "services/console/vue/src/pages/Devices/DeviceDetail.vue"
      issue: "Linked Repository card shows URL as text only (line 69)"
  missing:
    - "Computed/helper that returns the URL only when new URL(url).protocol is http: or https:, else null"
    - "Render <a :href target=_blank rel=noopener noreferrer> when safe; keep plain text for SSH/other URLs"
    - "Unit test in tests/unit/milestone-v116.cjs covering https link, javascript: rejected, git@ shown as text"
  debug_session: ""
