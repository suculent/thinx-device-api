# Phase 48: Deep Links & Close-out - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The last phase of v1.18. It delivers:

- **NOTIF-04:** a Vue deep-link reload stays on its page.
- **POL-01:** Build Firmware in-flight state, an accessible account menu, and a width-constrained Device Detail.
- **FIX-01:** a disposition for every Phase 35 review item IN-01..IN-08.
- **CI-06:** the legacy console build re-enabled, with every pending Legacy change of v1.18 live on production.
- **CI-07:** the Vue Cypress suite green, with its JUnit results in CircleCI, gating the Vue image build.

It also clears the items the roadmap carried here from Phases 43 and 44. There is no parent API change. Legacy Cypress
stays off.

</domain>

<decisions>
## Implementation Decisions

### Cypress gate (CI-07)
- **D-01:** The parent `.circleci/config.yml` gets a new `test-vue-console` job. It runs the Vue unit tests and the
  Cypress suite against the checked-out `services/console` submodule. `vue-console-registry` and `vue-console-hub`
  `requires` it, so the gate sits in the same pipeline with no API token and no cross-repo status lookup. The console
  repo's own `test_vue` stays as early feedback, and both store JUnit results (`store_test_results` must point at the
  Cypress JUnit reporter output, not just `./vue/coverage`).
- **D-02:** `login.spec.js`: the CI case stubs `/api/login` through the existing `cypress/support/api-stubs.js`. The
  real-API case runs only when `CYPRESS_LIVE_LOGIN=1` and explicit credentials are set, and is skipped otherwise.
  There is never a fallback to the leaked `test` fixture username (`cypress/support/credentials.js`).
- **D-03:** Once NOTIF-04 is fixed, `cy.visitAppRoute` becomes a plain hard load of `/#<route>`, so every spec
  exercises the real cold-load path. The dashboard-then-hash workaround and its comment block in
  `cypress/support/session.js` go away. One dedicated spec asserts that a logged-in reload of `/#/app/history` stays
  on History and that a logged-out reload goes to `/login`.
- **D-04:** `oauth-return.spec.js` is fixed by running Cypress against a same-origin API in CI (proxied or stubbed
  through the dev server), so the XSRF cookie and the token line up as in production. `ensureCsrfToken` and the
  app's CSRF path are not changed.
- **D-05:** `services/console/src/cypress/.env.test` (tracked in git) is inspected without printing values, then
  untracked (`git rm --cached`) and added to `.gitignore`. If it holds a real credential, the operator is told so
  they can rotate it. A history rewrite is out of scope.
- **D-06:** `vue/cypress/integration/devices.spec.js` is rewritten for the Phase 44 UI: no `category-pill-*`, no
  `Detail` text. The Phase 47 D-17 assertions in `device-detail.spec.js` (`@getBuildDetail.all` length 0 then 1)
  must pass in the green run.

### Deep links (NOTIF-04)
- **D-07:** Root cause, already diagnosed: `App.vue` `created()` reads `$router.history.current.path` after
  `hydrateSession`, before the initial navigation has confirmed. It sees `/` and pushes `/app/dashboard`. The fix
  bases the default-route decision on the resolved initial route (for example by waiting for `router.onReady`), so
  `/` and `/app` still go to the dashboard, deep links stay, and logged-out non-public paths still go to `/login`.
  `PUBLIC_PATHS` stays in sync with `Routes.js`.

### Legacy release (CI-06)
- **D-08:** The CI-05 gate is re-enabled by **flipping `build_legacy_console` to `default: true`**, not by deleting
  it. The parameter stays as a kill switch. This deviates on purpose from the roadmap SC4 wording "the CI-05 block
  reverted" and the Phase 42 "one revert" note: the success condition is that a normal `thinx-staging` pipeline builds
  and publishes the Legacy image again. Update the CI-05 comment blocks in `.circleci/config.yml` and
  `spec/node/CiPipelineGates.test.js` (assert default `true`, and that the legacy jobs run on a default pipeline).
  Turn `.planning/runbooks/legacy-console-build-gate.md` into a kill-switch runbook. CI-04 (Snyk monitors on `main`
  only) stays as it is. — **Reversibility:** reversible — one default value.
- **D-09:** These Legacy fixes land before the Legacy image ships:
  - IN-03: `DeploykeyController.js` create handler. Guard `!key || !key.pubkey` and report an error, make sure
    `creatingDeploykey` resets even when `.done` throws, and drop the dead string-parse branch.
  - IN-04: the client-side `/[\x00-\x1f\x7f]/` and 120-character check before sending, and a readable message for
    `400 invalid_key_name` in both consoles. Fix the Legacy `[object Object]` that comes from passing the jqXHR.
  - IN-05: restore `goals.length > 0` in `updateDeploykeys` (`thinx-api.js:361`) to match its sibling handlers, and
    keep the null-safety checks.
  - Build toast `undefined`: `DevicesController.js:117` renders `response.status`, which the build reply does not
    carry. Render a real message.
  - `LogviewController.js:227`: initialise `deviceBuilds[udid]` before `.push`, so devices with no build history get
    their build toasts.
  - 43-REVIEW IN-04: a Legacy tab whose first socket opens from the log overlay must send `{init}`.
- **D-10:** Legacy verification is **unit only**. Locally that means `npm run build:test` and the Legacy unit tests
  (extend `src/test/deploykey.cjs`). After rollout, the standard `console-retest` skill on `rtm.thinx.cloud`. There
  is no extra human UAT for the Legacy fixes.

### FIX-01 ledger and carried items
- **D-11:** The ledger is the archived
  `.planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md`. Each IN row moves from `open` to
  `fixed` (with the console or parent commit and the phase) or `deferred` (with a reason). The Phase 48 summary or
  verification points to it. Entries already decided:
  - IN-02 fixed in 46-02 (`ed429ec`).
  - IN-06 fixed in Phase 47 (`38eb95b`, `f64a153`).
  - IN-07 fixed in 47-01 (`002e051`).
  - IN-03, IN-04 and IN-05 are fixed here (D-09).
  - IN-01 and IN-08 are fixed here (D-12, D-13).
- **D-12:** IN-01: `parseResult` in `vue/src/core/api.js` returns `undefined` again for zero data keys
  (`keys.length === 0 ? undefined : keys.length === 1 ? result[keys[0]] : <reduce>`). The planner audits the callers
  that may now rely on `{}`, especially the empty build-log path (`buildlog.js` `callback(false, {})`) and the
  `BuildLogDialog` "No log output" state, and adds a unit case for each envelope shape.
- **D-13:** IN-08 covers the cases the review names: the TransformerEditor failed-load save, inner-button keyboard
  activation, the Legacy deploy-key `.fail` path (toast, `xhrFailed`, the `.always` reset), and assignment from the
  stored selection. Behavioural cases are added for Header, Notifications and History wherever Phases 46 and 47 do not
  already cover them.
- **D-14:** Carried Phase 44 Vue items are **all fixed**:
  - `.alert-danger` text contrast to at least 4.5:1, in `_overrides.scss`.
  - `aria-label` on the list and grid view toggles.
  - The API-key and status warning markers become keyboard-focusable (`tabindex="0"` plus a focus trigger on the tip).
  - Platform sort orders by label, the same as the pills.
  - Table checkbox ids come from the udid instead of the row index.
- **D-15:** The View-log limits (newest 100 builds only, no refresh after Build, the spinner ending when
  `POST /build` returns) are **deferred** with a reason. They need a paging and live-refresh design and are not
  Phase 35 items.

### POL-01 look & feel
- **D-16:** Account menu (`components/Header/Header.vue:46`): replace the `flaticon-settings-10` cog with a user icon
  (for example `la la-user-circle`), add `aria-label="Account menu"` and an "Account" hover tip. The My Profile and
  Log Out items stay as they are (`data-cy="header-profile"` kept).
- **D-17:** Build Firmware (`pages/Devices/DeviceDetail.vue:15`, `buildDevice()` near line 366) gets a `buildPending`
  flag. The button is disabled with a small `b-spinner` in place of the icon from the click until `POST /build`
  settles (accepted or error), so a second click is ignored. The in-flight state does not track the build to
  completion.
- **D-18:** The Device Detail content column gets `max-width` of about 1140px (Bootstrap xl container) and is
  left-aligned under the page title. This is not a two-column redesign.

### Ship order
- **D-19:** Wave 1 is the Vue and Legacy source fixes, with the Cypress suite green locally. Wave 2 lands the parent
  CI changes together: the `test-vue-console` gate (D-01) and the `build_legacy_console` default flip (D-08). One
  `thinx-staging` pipeline then gates the Vue image on the suite and builds the Legacy image with all its fixes. The
  live verification comes last. Deploy path: console `thinx-staging`, then the submodule bump on parent
  `thinx-staging`, never `main`.

### Claude's Discretion
- The exact `App.vue` mechanism for waiting on the initial route (`router.onReady`, `router.isReady`-style promise,
  or resolving `location.hash`).
- The same-origin mechanism for Cypress in CI (dev-server proxy or full stubs), the JUnit reporter configuration, and
  the executor image for `test-vue-console` (reuse `thinxcloud/console-build-env:vue`).
- The exact user icon, the `.alert-danger` colour value, and the tooltip copy.
- Which unit test files the new cases go in (extend `tests/unit/milestone-v116.cjs` or add `.cjs` files that follow
  the existing harness).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/workstreams/vue-console/ROADMAP.md` § Phase 48 — success criteria and the carried items from
  Phases 43, 44, 45, 46 and 47.
- `.planning/workstreams/vue-console/ROADMAP.md` § Milestone Notes — the CI-05/CI-06 story and the deploy path.
- `.planning/workstreams/vue-console/REQUIREMENTS.md` — NOTIF-04, POL-01, FIX-01, CI-06, CI-07.
- `.planning/workstreams/vue-console/STATE.md` — the 2026-10-12 Cypress diagnosis note (4/10 specs red) and the
  `.env.test` note.

### Phase 35 review items (FIX-01)
- `.planning/milestones/v1.16-phases/35-console-usability/35-REVIEW.md` § Info — the IN-01..IN-08 text and proposed
  fixes.
- `.planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md` — the ledger to update (D-11).
- `.planning/milestones/v1.16-phases/35-console-usability/35-UI-REVIEW.md` — the POL-01 source (fixes 1 and 2).

### CI
- `.circleci/config.yml` (parent) — the `build_legacy_console` parameter, the `legacy-console` workflow,
  `build-vue-console` / `vue-console-registry`, and the CI pipeline gates step.
- `spec/node/CiPipelineGates.test.js` — the offline assertions for CI-04 and CI-05, to update for D-08 and D-01.
- `.planning/runbooks/legacy-console-build-gate.md` — the bypass runbook, which becomes the kill-switch runbook.
- `services/console/.circleci/config.yml` — the console repo's `test_vue` job.

### Prior phase decisions
- `.planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-CONTEXT.md` — D-13..D-17
  (BuildLogDialog, the IN-06/IN-07 fixes, the deferred Cypress assertions).
- `.planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-CONTEXT.md` — D-16 "No Legacy
  change", which is why IN-03/04/05 land here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vue/cypress/support/api-stubs.js`: the existing API stubs, for the login stub (D-02) and the same-origin CI run
  (D-04).
- `vue/cypress/support/session.js`: `visitApp` and `visitAppRoute`, which D-03 simplifies.
- `vue/cypress/support/credentials.js`: env-or-fixture credential lookup. Remove the `test` fixture fallback.
- The Phase 44 `IconButton` and tooltip pattern, for the account menu tip and the focusable warning markers.
- `thinxcloud/console-build-env:vue`: the executor image the console `test_vue` already uses.

### Established Patterns
- Vue unit tests are Node `.cjs` harnesses run with `LC_ALL=C yarn test:unit`. The Legacy test is
  `node ../src/test/deploykey.cjs`. Console `test:unit` is not run in parent CI today, which D-01 changes.
- The CI-05 gate is a workflow-level `when: << pipeline.parameters.build_legacy_console >>`. CircleCI 2.1 has no
  per-job `when`, and `requires` cannot cross workflows.

### Integration Points
- `vue/src/App.vue` `created()`, `vue/src/Routes.js` `beforeEach` and `PUBLIC_PATHS` (both copies).
- `vue/src/core/api.js` `parseResult` (IN-01).
- Legacy: `src/app/js/controllers/DeploykeyController.js`, `DevicesController.js:117`, `LogviewController.js:227`,
  `src/app/js/thinx-api.js:361` and around 1046.

</code_context>

<specifics>
## Specific Ideas

- The deep-link regression spec uses `/#/app/history` as its example, as in the roadmap SC1.
- The live login opt-in flag is named `CYPRESS_LIVE_LOGIN=1`.

</specifics>

<deferred>
## Deferred Ideas

- View-log limits (newest 100 builds, no refresh after Build, the spinner ending on `POST /build`): recorded in the
  ledger as deferred (D-15) and a candidate for a future paging and live-refresh phase.
- A git history rewrite for `.env.test`, if it turns out to hold a real secret: an operator decision outside this
  phase.

### Reviewed Todos (not folded)
- `2026-10-03-console-notification-delivery-gaps`: items 2–4 were done in Phase 43. Its Legacy leftovers are already
  the D-09 items.
- The other keyword matches (Rollbar tokens, API-key hashing, MQTT writes, transfer binding, multi-file OTA, builder
  polling, the 2026-10-15 edge/host hardening todos) are unrelated to the console close-out and stay pending.

</deferred>

---

*Phase: 48-Deep Links & Close-out*
*Context gathered: 2026-10-15*
