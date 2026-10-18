# Phase 42 — UI Review

**Audited:** 2026-10-12
**Baseline:** 42-UI-SPEC.md (approved)
**Screenshots:** partial. Live https://console.thinx.cloud/#/login captured with system headless Chrome (the npx playwright CLI failed: its browser build is not installed). Captures at 1280x720 and 460x800 are valid. The 375x667 capture is unreliable: headless Chrome clamped the layout width to about 460px and cropped it, so the stacked social row below 460px is checked in code only. The authenticated Layout footer and PasswordReset were not captured (no login, per instructions). Files are in `.planning/ui-reviews/42-20261012-193201/` (gitignored).
**Interaction captures:** off (workflow.ui_interaction_capture is false). Interaction findings below come from the code.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All contract strings exact; "Create an Account" still routes to `login` (a dead end, deferred by the spec but still visible to users) |
| 2. Visuals | 3/4 | Clear focal point (green Login, logo above); inputs barely separate from the 0.7 overlay panel |
| 3. Color | 3/4 | Accent used only on Login; `#888` subtitle depends on the overlay to pass AA; links stay `#2477FF` at the AA edge (4.60:1 worst case) |
| 4. Typography | 3/4 | Build hash renders visibly heavier than the footer text (the monospace stack has no 300 weight), against UI-D08 "same weight" |
| 5. Spacing | 4/4 | 24px logo gap, 16px social margin, 8px gap and paddings match the contract exactly |
| 6. Experience Design | 3/4 | Footer fallbacks are correct; Login has no pending/disabled state (accepted by D-18); footer link focus is a colour change only |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **"Create an Account" links to `login`** (WARNING, Login.vue `router-link to="login"`): a new user clicks it and lands on the same page. That is a broken affordance on the page's only sign-up path. Either hide the link and the "Sign up now!" line until signup routing exists, or point it at the real signup route. The spec defers this, but users still see it after this phase.
2. **The build hash looks bold in the footer** (WARNING, AppFooter.vue `.build-hash`): `$font-family-monospace` (SFMono/Menlo/Consolas) has no 300 weight, so the browser renders it at 400 next to 300 Open Sans. In the 1280x720 capture `2e018d7` is the heaviest text in the footer and pulls attention away from the links. Add `font-weight: $font-weight-base;` and accept the closest weight the font has, or set `opacity: .85` and `font-size: 12px` on `.build-hash` to bring it back in line with UI-D08.
3. **Footer link focus is colour-only** (WARNING, `_auth.scss` `.auth-footer a:focus` and `Layout.scss:42`): focus changes `#C1CCD3` to `#FFFFFF` on an already underlined link, a contrast step of about 1.5:1 between the two states. That fails WCAG 2.4.7/1.4.11 in practice for keyboard users. Add `outline: 2px solid $white; outline-offset: 2px;` on `:focus-visible`.

Further recommendations:
4. Input fields (`.input-transparent`) on the darker 0.7 panel read as near-invisible boxes (see the capture: only the prepend icon tile marks the field). Add a `1px solid rgba($white, .15)` border, or a slightly lighter `background: rgba($white, .04)`.
5. `.widget-auth-info { color: #888 }` passes AA (5.29:1) only because of the overlay. Swap it for a token (`$text-color`, about 6.6:1) so a later alpha change cannot regress it silently.
6. The PasswordReset buttons are still `variant="danger"` (red, which reads as destructive for a non-destructive action) while Login is now green. The spec leaves this out of scope, but the two auth pages now disagree. Queue it for the next phase.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- PASS: the title is exactly `Welcome to THiNX Management Console.` (Login.vue Widget `title`), and `THiNX Login` is absent. The subtitle, `Login`, `Login with Google/GitHub`, `Forgot password?`, `Don't have an account? Sign up now!` and the logo alt `THiNX` all match the contract.
- PASS: the live footer reads `© 2018 – 2026 THiNX Console by THiNX Cloud · 2e018d7`, with the en dash and middot as specified. The hash carries the sr-only prefix "Build " and a `title`.
- WARNING: `Create an Account` → `to="login"` (Login.vue, the router-link after the "Sign up now!" paragraph) is a self-link. The spec defers it, but it is still a dead CTA.
- Minor: "Use your username to sign in." conflicts with the two OAuth buttons a few lines below, which do not use a username.

### Pillar 2: Visuals (3/4)
- PASS: the logo is centred, 200x100, and sits above the panel. The green Login button is the single emphasised control. The social row sits directly under Login, and both labels fit on one line at 460px (capture w460.png) and 1280px.
- WARNING: the inputs have no visible boundary on the 0.7 black panel. In desktop.png the Username/Password fields are distinguishable only by the purple prepend tile and the placeholder text.
- Minor: the `bg-widget` block makes a visible tone band starting just under "Forgot password?". The band separates the link from its form group and splits the panel into two slabs.
- Not verified visually: the stacked social row below 460px (the 375px capture was clamped). The code is correct: `@media (max-width: 459.98px) { flex-direction: column }`.

### Pillar 3: Color (3/4)
- PASS: accent `success` (#2D8515) is used once, on the Login submit (`variant="success"`). Nothing else on the page is green.
- PASS: footer text is `$text-color` and links are `$gray-400` underlined, on both `.auth-footer` and `.contentFooter` (Layout.scss:30-45), per UI-D09.
- WARNING: in-panel links stay `#2477FF` at 4.60:1 worst case, which passes with no margin. The subtitle is a hard-coded `#888` (`_auth.scss` `.widget-auth-info`) rather than a token.
- Hard-coded colours remain in `_auth.scss` (social brand colours #000, #30363d, #161b22, #444c56, #dadce0, #f8f9fa, #c6cacd, #3c4043). The spec allows them as fixed brand colours.

### Pillar 4: Typography (3/4)
- PASS: no new sizes. The subtitle and auth footer are 13px, buttons `sm`, and the title h5 at weight 400.
- WARNING: `.build-hash` uses the monospace stack with an inherited weight of 300, which the system monospace faces do not provide, so it falls back to 400. In the capture the hash looks heavier than the rest of the footer, against UI-D08 ("differs only by the monospace family").

### Pillar 5: Spacing (4/4)
- `.auth-logo` has `margin: 0 auto 24px`. `.social-buttons` has `gap: 8px; margin: 16px 0 0`. `.social-button` has 8px horizontal padding and the icon an 8px margin-right. All match the spacing table.
- `.auth-page` has `min-height: 100vh`, and the fixed footer only applies at `min-height: 800px` (UI-D10). At 1280x720 the footer flows below the panel with no overlap on "Create an Account" (desktop.png). At 460x800 it is fixed at the bottom with clear space (w460.png).

### Pillar 6: Experience Design (3/4)
- PASS: the AppFooter guards are correct. The year must be 4 digits and greater than 2018, otherwise the footer shows `© 2018` alone. The hash must be 7 hex characters, otherwise both the span and the separator are hidden. No `dev` or `undefined` can render. The `variant` prop is validated.
- PASS: the logo has width and height attributes (no layout shift) and `max-width: 100%`.
- WARNING (code-derived): the footer links show focus by colour only (see Fix 3).
- Accepted by the contract (D-18), still a gap: the Login submit has no pending or disabled state, so a double click can send two login requests and nothing shows that a request is in flight.
- Not verified: the Layout footer on authenticated pages (no login was performed). The code wires `<AppFooter variant="layout" />` in Layout.vue:11.

Registry audit: skipped (no shadcn / `components.json`; Vue 2 project).

---

## Files Audited
- services/console/vue/src/pages/Login/Login.vue
- services/console/vue/src/components/AppFooter/AppFooter.vue
- services/console/vue/src/styles/_auth.scss
- services/console/vue/src/components/Layout/Layout.vue, Layout.scss
- services/console/vue/src/pages/PasswordReset/PasswordReset.vue (footer wiring)
- services/console/vue/public/assets/thinx/img/logo_white_200.png (present)
- Live captures: desktop 1280x720, 460x800 (valid); 375x667 (clamped, discarded)
