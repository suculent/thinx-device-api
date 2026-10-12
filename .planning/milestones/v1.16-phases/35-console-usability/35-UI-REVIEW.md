# Phase 35 — UI Review

**Audited:** 2026-10-12
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured (no dev server on localhost:3000/5173/8080; production not targeted)
**Interaction captures:** off (workflow.ui_interaction_capture is false)

Scope: console commits 956a7a2 (35-01, UI-01..04) and b7b5b29..4552901 (35-02, G-35-4) in `services/console/vue/src`. All findings are code-derived.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Mostly specific labels; "Environment" button and "Important notifications only" are ambiguous |
| 2. Visuals | 2/4 | Account menu is an unlabeled settings cog; full-width single column stretches short tables/forms across desktop |
| 3. Color | 3/4 | Four different button variants in one action row; hardcoded hex in BuildLogDialog |
| 4. Typography | 3/4 | No new type scale introduced; repository alias has no visual hierarchy over URL |
| 5. Spacing | 3/4 | Bootstrap utilities used consistently; inline `width:140px` and stale left/right column comments |
| 6. Experience Design | 3/4 | Revoke confirmed, env loading guarded, partial-load error shown; Build Firmware has no pending/disabled state |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Build Firmware has no in-flight state** (WARNING) — `DeviceDetail.vue:15` / `buildDevice()` at :300 never sets a flag, so double-clicks queue duplicate builds and there is no feedback until the API returns. Add `buildPending`, bind `:disabled="buildPending"`, swap icon for `<b-spinner small>` while pending.
2. **Account menu is an icon-only settings cog** (WARNING) — `Header.vue:46` uses `flaticon-settings-10` with no `aria-label`/`title`, and after removing the standalone power button (UI-01) Logout and My Profile are only reachable through it. Screen readers announce nothing useful; sighted users look for "settings". Add `aria-label="Account menu"` + `v-b-tooltip title="Account"`, or switch to a user icon / avatar.
3. **Single-column layout uses full-width `cols="12"` everywhere** (WARNING) — `DeviceDetail.vue:23,47`. Device Info (two-column key/value table) and the Edit Device inputs stretch across a 1440px content area, producing long line lengths and very wide inputs; Build History is pushed far below the fold. Constrain the column (e.g. `b-col cols="12" xl="10"` or a `max-width: 960px` wrapper) and keep the stacked order.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- Good: "My Profile", "Build Firmware", "Revoke Device", "Transfer Device", "Repository unavailable", "Some device details could not be loaded. Refresh to retry." are specific.
- WARNING: `DeviceDetail.vue:18` button label "Environment" is a noun, not an action; use "Edit Environment" (the UAT expectation text itself says "editing the device environment").
- WARNING: `Profile.vue:42-44` — "Important notifications only" contradicts the now-exclusive model (the "only" made sense when checkboxes combined). Also, Important + Informational may both be selected, which is equivalent to "All" but stored differently. Consider "Important" / "Informational" / "All" radio options, or document the overlap.
- Minor: "Repository unavailable" (`DeviceDetail.vue:68`) gives no next step (e.g. "re-link in Repositories"). Alias line renders blank if a repository has no alias; fall back to URL or id.

### Pillar 2: Visuals (2/4)
- WARNING: `Header.vue:46` icon-only dropdown, no accessible name, wrong metaphor for an account menu (see Fix 2).
- WARNING: full-width stacking (Fix 3). Leftover comments `<!-- Left: metadata -->` / `<!-- Right: editable fields + actions -->` (`DeviceDetail.vue:22,46`) no longer describe the layout and the two `b-col cols="12"` wrappers in one `b-row` are redundant.
- WARNING: The external Git URL link (`DeviceDetail.vue:70`) opens a new tab with no visual cue (no `fa-external-link` icon or "opens in new tab" sr-only text).
- Positive: action buttons now carry `aria-hidden` icons with text labels; the page title gives a clear focal point.

### Pillar 3: Color (3/4)
- WARNING: Action row (`DeviceDetail.vue:15-18`) uses primary, danger, warning and secondary side by side — four accents competing at the top of the page. Destructive Revoke sits in second position next to the primary CTA. Recommend primary for Build, outline/secondary for Transfer and Environment, and move Revoke (danger) to the end or behind a separator.
- Minor: `BuildLogDialog.vue` scoped style hardcodes `#1e1e1e` / `#ddd` instead of theme variables.

### Pillar 4: Typography (3/4)
- No new sizes or weights introduced in the phase diff; uses existing `page-title`, `fw-semi-bold`, `text-monospace`, `small`.
- Minor: Linked Repository card shows alias and URL as two equal-weight `<p>`s; make the alias `font-weight-bold` so the name reads as the label.

### Pillar 5: Spacing (3/4)
- Consistent `mb-3` on cards and `mr-2 mb-2` on buttons; wrap behaviour of the action row on narrow screens is handled by `mb-2`.
- Minor: inline `style="width:140px"` (`DeviceDetail.vue:26`) and `style="max-width:400px"` (`Profile.vue:40`) bypass the utility scale.

### Pillar 6: Experience Design (3/4)
- Good: revoke uses `msgBoxConfirm` (:306); environment button disabled while loading (:18); `Promise.allSettled` surfaces partial-load failures; repository href only bound for http(s) via WHATWG parse with `rel="noopener noreferrer"` (35-02).
- WARNING: Build Firmware no pending state (Fix 1). Save Transformers likewise has no saving state.
- WARNING: Notification exclusivity is implemented on checkboxes (`Profile.vue:42-44`, `notificationChanged`) — the control type advertises multi-select while behaving as single-select, and deselecting everything is allowed (meaning undefined). A `b-form-radio-group` would make the rule visible and remove the custom handler.
- Minor: build-history rows are `role="button"` with keyboard handlers but no visible hover/focus styling was added in this phase.

Registry audit: skipped (no third-party registries declared; no UI-SPEC).

---

## Files Audited
- services/console/vue/src/components/Header/Header.vue
- services/console/vue/src/pages/Devices/DeviceDetail.vue
- services/console/vue/src/pages/Profile/Profile.vue
- services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
- services/console/vue/src/components/Notifications/Notifications.vue
