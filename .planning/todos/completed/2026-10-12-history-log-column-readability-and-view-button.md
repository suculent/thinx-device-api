---
created: 2026-10-12T12:30:00.000Z
title: "History builds Log column: unreadable white preview blocks; shorten button to eye-icon \"View\""
area: console
severity: low
files:
  - services/console/vue/src/pages/History/History.vue:115-131 (build-log-pre preview + build-open-log button)
  - services/console/vue/src/pages/Devices/DeviceDetail.vue (build-open-log button, same label)
  - services/console/vue/tests/unit/milestone-v116.cjs, vue/cypress/integration/*.spec.js (assert the "Open build log" text)
---

Operator note 2026-10-12 (during phase 36 UAT), with screenshot of the History page Log column in dark theme:

> build history page shows white blocks next to the "Open build log" button - make this readable.
> Also the "Open build log" should be just "View" to keep it short (with an eye icon).

Observed: each row's `<pre data-cy="build-log-pre">` preview (e.g. "started") renders as a near-white block
with near-white text — unreadable on the dark theme. Likely the Bootstrap/theme `pre` background with the
dark-theme text colour; `logStyle(item)` sets no background/colour. (36-UI-REVIEW.md also flags the
hard-coded hex colours in BuildLogDialog.vue:42.)

To do:
- Make the Log preview readable in the dark (and light) theme: theme-variable background and text colour,
  or a muted inline text preview instead of a white `pre` block.
- Relabel the per-row button to "View" with an eye icon (History and Device Build History). Keep the
  descriptive `aria-label="Open build log <build_id>"` for screen readers.
- Update the unit/Cypress assertions that match the visible "Open build log" text.
- Consider together with 36-UI-REVIEW.md top fixes (TIMEOUT badge colour, hide the button when build_id is empty).
