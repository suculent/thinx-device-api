---
phase: 42-ci-trim-login-page-build-footer
plan: 02
subsystem: ui
tags: [vue, console, ui, login, footer, scss, a11y]

requires: []
provides:
  - "AppFooter component (src/components/AppFooter/AppFooter.vue, prop variant auth|layout, computed buildYear/buildHash, classes build-hash and footer-sep) on Login, PasswordReset and the authenticated Layout"
  - "VUE_APP_BUILD_YEAR set in vue.config.js from the UTC build year unless preset; VUE_APP_BUILD_HASH cut to 7 characters"
  - "Branded welcome login: THiNX logo (vue/public/assets/thinx/img/logo_white_200.png), 0.7 dark panel overlay, title 'Welcome to THiNX Management Console.', green Login, Google/GitHub row directly under it"
  - "Unit tests: tests/unit/login-page.cjs (new, in test:unit) and an extended tests/unit/footer-hostnames.cjs"
affects: [42-03, 43, 44, 48]

actuals:
  tokens: 11932
  tasks: 3
  commits: 6
plan_head_before: ff6e8090a002b1cda6a353706a20e3ab469f2b96
plan_head_after: cfff199c57dade67e6701baacc998927b030a52c

tech-stack:
  added: []
  patterns:
    - "Build metadata reaches templates only through validated computed getters that read process.env inside the getter (vue-cli inlines it at build time, the unit test varies it per render)"
    - "Unit renders compile templates with whitespace: 'condense', the option @vue/cli-service 5 uses, so template spacing bugs fail the test"
    - "Compiled-SCSS checks: compile theme.scss with the project's sass, parse rules with their @media context, assert values and cascade order, compute WCAG contrast on the lightest gradient stop"

key-files:
  created:
    - services/console/vue/src/components/AppFooter/AppFooter.vue
    - services/console/vue/public/assets/thinx/img/logo_white_200.png
    - services/console/vue/tests/unit/login-page.cjs
  modified:
    - services/console/vue/vue.config.js
    - services/console/vue/src/pages/Login/Login.vue
    - services/console/vue/src/pages/PasswordReset/PasswordReset.vue
    - services/console/vue/src/components/Layout/Layout.vue
    - services/console/vue/src/components/Layout/Layout.scss
    - services/console/vue/src/styles/_auth.scss
    - services/console/vue/tests/unit/footer-hostnames.cjs
    - services/console/vue/package.json

key-decisions:
  - "One shared AppFooter (variant auth|layout) replaces the three hand-copied footers; the year and the commit id are shown only when valid (4-digit year after 2018, 7 hex characters), so 'dev', '' and 'undefined' never render"
  - "The stacked social-row @media block sits last in .social-buttons: it has the same specificity as the row rules, so an earlier position would lose the cascade; login-page.cjs asserts that order"
  - "Layout.vue drops hostnameMixin because it no longer reads $hostnames; Login and PasswordReset keep it for $hostnames.API"

patterns-established:
  - "Footer markup lives only in AppFooter.vue; pages use <AppFooter variant=\"auth\" /> or <AppFooter variant=\"layout\" />, and footer-hostnames.cjs fails if a page grows its own <footer> or &copy;"

requirements-completed: [UI-05, LOGIN-01, LOGIN-02, LOGIN-03]

coverage:
  - id: D1
    description: "Build env: VUE_APP_BUILD_HASH cut to 7 characters, VUE_APP_BUILD_YEAR from the UTC build year unless preset, 'dev' outside git; the production bundle carries both"
    requirement: UI-05
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/footer-hostnames.cjs#vue.config.js cuts VUE_APP_BUILD_HASH to 7 characters / sets an unset VUE_APP_BUILD_YEAR / keeps a preset / falls back to dev"
        status: pass
      - kind: integration
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build && grep VUE_APP_BUILD_HASH:\"[0-9a-f]{7}\" / VUE_APP_BUILD_YEAR:\"[0-9]{4}\" / build-hash in dist/js/app.*.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "AppFooter: one-line ordered footer, hash and separator hidden without a valid 7-hex id, no year range without a valid year after 2018, root class per variant, unchanged link hrefs"
    requirement: UI-05
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/footer-hostnames.cjs#AppFooter variant auth|layout (ordered text, hide hash cases, no-range cases, root class, hrefs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Login, PasswordReset and Layout render AppFooter and hold no footer markup; footer text and links pass AA on #333867; .auth-page min-height; auth footer fixed only from 800px viewport height"
    requirement: UI-05
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/footer-hostnames.cjs#page wiring, footer colours, contrast, min-height, 800px threshold"
        status: pass
    human_judgment: false
  - id: D4
    description: "Welcome login markup: logo above the panel, new title, no old title, green submit, social row directly under Login, OAuth/CSRF/login() unchanged"
    requirement: LOGIN-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/login-page.cjs#Login.vue checks"
        status: pass
      - kind: integration
        ref: "npm --prefix services/console/vue run test:csp:dist (after the production build)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Logo asset byte-identical to the Legacy file, copied into dist by the production build"
    requirement: LOGIN-01
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/login-page.cjs#public logo is byte-identical / PNG header says 200 by 100"
        status: pass
      - kind: integration
        ref: "cmp services/console/src/assets/thinx/img/logo_white_200.png services/console/vue/dist/assets/thinx/img/logo_white_200.png"
        status: pass
    human_judgment: false
  - id: D6
    description: "Compiled theme: 0.7 panel overlay, .auth-logo block, social row with 460px stacking in the right cascade order, AA contrast for subtitle, links, body text and the white Login label"
    requirement: LOGIN-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/login-page.cjs#compiled theme and contrast checks"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual result and the two backstops: logo served 200 image/png on the deployed console, social labels unclipped at 460px and stacked below, no footer overlap at 1280x720 / 460x800 / 375x667; production password, Google and GitHub logins complete"
    requirement: LOGIN-02
    verification: []
    human_judgment: true
    rationale: "Needs a deployed console and a browser (layout measurements, real OAuth providers); 42-03 ships and runs these checks"

duration: 8min
completed: 2026-10-12
status: complete
---

# Phase 42 Plan 02: Login Page and Build Footer Summary

**The Vue console now has one shared `AppFooter` that shows `© 2018 – {UTC build year} … · {7-char commit id}`, with invalid values hidden instead of shown as `dev`. The login page gets the THiNX logo above a 0.7 dark panel titled "Welcome to THiNX Management Console.", a green Login button, and the Google and GitHub buttons directly under it. login(), the CSRF calls and the OAuth hrefs are unchanged.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-12T16:31:50Z
- **Completed:** 2026-10-12T16:39:50Z
- **Tasks:** 3 (one tracer, two auto; all TDD RED/GREEN)
- **Files modified:** 11 (in the `services/console` submodule)

## Accomplishments

- `vue.config.js` cuts the commit id to 7 characters, the same as CI's `cut -c -7`. It sets `VUE_APP_BUILD_YEAR` from `getUTCFullYear()` unless the env already has it. A local production build inlines `VUE_APP_BUILD_HASH:"cf65b79"` and `VUE_APP_BUILD_YEAR:"2026"`.
- New `AppFooter.vue` (`variant` `auth` → `footer.auth-footer`, `layout` → `footer.contentFooter`) renders `© 2018 – 2030 THiNX Console by THiNX Cloud · Build a1b2c3d` (the "Build " prefix is screen-reader only). It hides both the hash and the `·` for `''`, `dev`, `undefined`, 8-character and non-hex values. For a year of 2018, an earlier year, an empty value or an invalid one it shows `© 2018` with no range. Its only year literal is 2018, and it has no `v-html`.
- Login, PasswordReset and Layout use `<AppFooter …/>`, so no page template has its own `<footer>` or `&copy;` any more. Footer text is `$text-color` and the links are `$gray-400`, underlined, white on hover and focus. Measured on #333867: text 4.75:1, links 6.75:1.
- `.auth-page` uses `min-height: 100vh`, and the auth footer is fixed only from 800px viewport height, so on shorter viewports it no longer covers "Create an Account".
- Login: the logo `img.auth-logo` comes first in `b-container`, the title is "Welcome to THiNX Management Console.", Login is `variant="success"`, and the `.social-buttons` block was moved unchanged to directly under Login. The row sits side by side with an 8px gap and stacks below 460px. Panel contrast over the 0.7 overlay on #333867: subtitle 5.29, links 4.61, body text 6.62, white on green 4.69.
- The logo was copied byte for byte (sha256 `e361d678…996c`). The production build puts it in `dist/assets/thinx/img/`, and `test:csp:dist` passes.

## Task Commits

All commits are in the `services/console` submodule on branch `thinx-staging`. All are signed (`%G?` = G) and none are pushed (6 ahead of `origin/thinx-staging`).

1. **Task 1 (tracer): Build footer end to end on the login page (UI-05)**
   - RED `b85993b` test(vue): add failing build footer checks (UI-05)
   - GREEN `ee79ca6` feat(vue): shared build footer with build year and commit id on login (UI-05)
2. **Task 2: AppFooter on password reset and the app layout, AA footer colours (UI-05)**
   - RED `ec1ff5b` test(vue): expect the build footer on every page with AA colours (UI-05)
   - GREEN `f71219f` feat(vue): build footer on password reset and the app layout, readable footer colours (UI-05)
3. **Task 3: Branded welcome login (LOGIN-01..03)**
   - RED `cf65b79` test(vue): add failing welcome login checks (LOGIN-01..03)
   - GREEN `cfff199` feat(vue): branded welcome login with social logins under a green Login (LOGIN-01..03)

**Plan metadata:** the parent-repo docs commit for this SUMMARY, STATE.md and ROADMAP.md. The parent `services/console` gitlink is NOT bumped; that is 42-03's job.

`actuals.commits` (6) was measured as `git -C services/console rev-list --count ff6e809..HEAD`. `plan_head_before` and `plan_head_after` are commits in the submodule, because every source commit of this plan lives there.

### TDD Gate Compliance (RED evidence)

- Task 1 RED (`b85993b`): `node tests/unit/footer-hostnames.cjs` exited 1 with 34 `FAIL` lines. AppFooter.vue did not exist, vue.config.js produced `"01234567"` / `"fedcba98"` with no year, and Login.vue had no `<AppFooter variant="auth" />`.
- Task 2 RED (`ec1ff5b`): exit 1, 15 `FAIL`. PasswordReset and Layout had no AppFooter and still had their own `<footer>`, `.auth-footer` text measured 2.06:1, the links had no rule, `.auth-page` used `height`, and the threshold was 600px.
- Task 3 RED (`cf65b79`): `node tests/unit/login-page.cjs` exited 1 with 14 `FAIL`. The title, logo, `variant="success"`, the order, the public logo, the overlay, the logo and social rules, and the panel contrast all failed. The OAuth, CSRF and `buildHash`-removal checks already passed, which is correct for an unchanged flow.
- Each GREEN: `LC_ALL=C npm --prefix services/console/vue run test:unit` exited 0 with 0 `FAIL` lines.

## Files Created/Modified

Paths relative to `services/console/vue/`:
- `src/components/AppFooter/AppFooter.vue`: shared footer, validated year and id, `.build-hash` in monospace with `nowrap`
- `vue.config.js`: 7-character hash and `VUE_APP_BUILD_YEAR`
- `src/pages/Login/Login.vue`: logo, title, green submit, social row moved, AppFooter, `buildHash` removed
- `src/pages/PasswordReset/PasswordReset.vue`: AppFooter
- `src/components/Layout/Layout.vue`: AppFooter, unused `hostnameMixin` removed
- `src/components/Layout/Layout.scss`: `.contentFooter` text and link colours
- `src/styles/_auth.scss`: `.auth-page` min-height, `.auth-logo`, the `.auth-page .widget-auth` overlay, the social row and its 460px stacking, `.auth-footer` colours and the 800px threshold
- `public/assets/thinx/img/logo_white_200.png`: byte-identical copy of the Legacy logo
- `tests/unit/footer-hostnames.cjs`: AppFooter render cases (condense whitespace), vue.config.js child-process cases, page wiring, compiled footer CSS and contrast
- `tests/unit/login-page.cjs`: static Login.vue checks, logo identity and IHDR size, compiled theme rules, cascade order and contrast
- `package.json`: `&& node tests/unit/login-page.cjs` appended to `test:unit` (the only change)

## Decisions Made

- The year check uses a named constant `FIRST_YEAR = 2018`, so 2018 is the only year literal in the component.
- vue.config.js has one extra child-process case: `CIRCLE_SHA1` is also cut to 7 characters. The CI path sets `VUE_APP_BUILD_HASH` directly, but the fallback is covered too.
- `.contentFooter` contrast moved from 5.84:1 (`$text-muted` compiles to `rgba(244,244,245,.7)`) to 4.75:1 (`$text-color`, alpha .6). Both pass AA. I followed the plan (UI-D09: one footer text colour on both footers), although the UI-SPEC's "before 3.14:1" figure does not match the compiled CSS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The stacked social row would have lost the cascade**
- **Found during:** Task 3 GREEN
- **Issue:** I first nested the `@media (max-width: 459.98px)` block at the top of `.social-buttons`, as the plan's list order suggests. It compiles to a rule with the same specificity as the base `.social-button { flex: 1 1 0 }` but emitted earlier, so below 460px the stacked buttons would keep `flex: 1 1 0` (zero basis in a column) instead of `0 0 auto`. The first version of the test checked values only, so it passed anyway.
- **Fix:** I moved the media block to the end of `.social-buttons` and added a cascade-order assertion to `login-page.cjs`: the stacked `.social-button` rule must follow the row rule.
- **Files modified:** `src/styles/_auth.scss`, `tests/unit/login-page.cjs`
- **Verification:** login-page.cjs is green, and the production build and `test:csp:dist` pass.
- **Committed in:** `cfff199` (Task 3 GREEN)

**2. [Verification method] The OAuth-binding grep in the Task 3 acceptance criterion cannot match here**
- **Found during:** Task 3 acceptance
- **Issue:** The local `grep` is ugrep 7.8.4. It reads the unescaped mid-pattern `$` in `this.\$hostnames.API …` as an anchor, so the literal criterion prints 0 even at the baseline `ff6e809`.
- **Fix:** No code change. `grep -cF` (fixed string) prints 1 for `/oauth/google` and 1 for `/oauth/github`, and login-page.cjs asserts the same bindings byte for byte.
- **Committed in:** n/a

---

**Total deviations:** 1 auto-fixed (Rule 1), 1 verification-method note. **Impact on plan:** The fix makes the stacking work as UI-D06 requires. No scope change.

## Issues Encountered

- The commit-msg hook (commitlint) rejected one message the first time: a body line over 100 characters, after `#c1ccd3` was parsed as a footer reference. I re-committed with shorter lines and no `#`. Both commits are signed and nothing was bypassed.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 42-03 can bump the parent `services/console` gitlink to `cfff199` and push `services/console` and the parent `thinx-staging`.
- Still open, for 42-03 after deploy: the logo returns 200 image/png on the deployed console; social labels are not clipped at 460px and stack below it; the footer does not overlap at 1280×720, 460×800 and 375×667; production password, Google and GitHub logins complete; the footer shows the deployed 7-character id.
- `vue/dist` is left built locally (gitignored).

## Self-Check: PASSED

- FOUND: services/console/vue/src/components/AppFooter/AppFooter.vue, services/console/vue/public/assets/thinx/img/logo_white_200.png, services/console/vue/tests/unit/login-page.cjs
- FOUND (ancestors of services/console HEAD): b85993b, ee79ca6, ec1ff5b, f71219f, cf65b79, cfff199
- Exactly 11 paths changed since ff6e809, all commits signed G, `git status --porcelain -- vue` empty, 6 commits ahead of origin/thinx-staging

---
*Phase: 42-ci-trim-login-page-build-footer*
*Completed: 2026-10-12*
