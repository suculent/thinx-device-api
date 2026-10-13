# Roadmap: THiNX Device API

## Milestones

- 🚧 **v1.18 Console Improvements** — Phases 42–48 (in progress, workstream `vue-console`)

This workstream roadmap covers v1.18 only. Shipped milestones v1.0–v1.16 live in `.planning/MILESTONES.md` and
`.planning/milestones/`. v1.17 (Phases 39–41) runs in parallel as the `vault-transit` workstream. Phase numbers
continue the global sequence, so v1.18 starts at Phase 42.

## Overview

v1.18 brings the Vue console to Legacy-console parity on the pages operators use every day and closes the console
leftovers of v1.16. Phase 42 first trims CI for the milestone: Snyk monitors move to `main` only, and the legacy
console image build is switched off for the duration, so every later `thinx-staging` push is faster. The same phase
ships the login page and the build footer. Phase 43 then fixes console notification delivery: the escaped toast goes
live straight away through a one-off legacy console build, and the API accepts several Legacy tabs per owner and
delivers build status frames. The device list follows and introduces the two shared building blocks the later phases
reuse: the platform bullet and the icon button that keeps its text as aria-label and hover tip. Deploy keys,
transformers with environment globals, and build logs then each get their parity items together with the v1.16
review and UI-review items for the same surface, while those files are open. The last phase makes Vue deep links
survive a reload, closes the Phase 35 UI-review and review ledger, and re-enables the legacy console build so the
remaining Legacy changes of the milestone ship.

Every phase changes the `services/console` submodule (Vue, sometimes Legacy): coordinated console commits on
`thinx-staging`, then a parent submodule-pointer bump pushed to `thinx-staging`. Phases 42 and 48 change the parent
`.circleci/config.yml`; Phases 43 and 45 also change the parent API. Legacy routes and API envelopes stay compatible;
no dependency or infrastructure upgrades.

## Phases

**Phase Numbering:**
- Integer phases (42–48): Planned milestone work
- Decimal phases (42.1, 43.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 42: CI Trim, Login Page & Build Footer** - Snyk monitors on `main` only, legacy console build paused for the milestone; THiNX-branded welcome login with social logins under a green Login button; every footer shows the build year and short commit id (completed 2026-10-12)
- [x] **Phase 43: Notification Delivery** - escaped actionable toast live via a one-off legacy console build; several Legacy tabs per owner; build status frames reach the owner's consoles (API + console) (completed 2026-10-13)
- [ ] **Phase 44: Device List Parity** - Legacy device icons and action icons, non-wrapping icon-only actions, platform bullets (shared with Repositories), missing-API-key warning
- [ ] **Phase 45: Deploy Key Rename & Row Actions** - rename without touching key material, icon row actions with confirmed single-shot delete, non-wrapping table, Phase 38 review items (API + console)
- [ ] **Phase 46: Transformers & Environment Globals** - transformer icon actions, bulk delete behind a typed `confirm`, save/dirty states, editable environment globals with restore on failure
- [ ] **Phase 47: Build Log Search & Status Colours** - search with highlight, count and stepping inside the full build log; one status colour mapping; dashboard log access; Phase 36 review items
- [ ] **Phase 48: Deep Links & Close-out** - deep-link reload, Phase 35 UI-review items and review ledger, legacy console build re-enabled and the remaining Legacy changes deployed, Vue Cypress suite green and gating (console + CI)

## Phase Details

### Phase 42: CI Trim, Login Page & Build Footer

**Goal**: `thinx-staging` pipelines run only what the milestone needs, and a user opening the Vue console sees a THiNX-branded welcome login with the social logins right under a green Login button, with every page footer telling them which build they are running.
**Depends on**: Nothing (first v1.18 phase). Runs first because CI-04/CI-05 shorten every later phase's push-to-deploy cycle.
**Requirements**: CI-04, CI-05, UI-05, LOGIN-01, LOGIN-02, LOGIN-03
**Repos**: Parent `.circleci/config.yml` (CI-04, CI-05) and `services/console` (Vue).
- CI-04: `snyk-code-monitor` and `snyk-oss-monitor` currently run on `thinx-staging` and `main`. `snyk-monitor-console-classic` and `snyk-monitor-console-vue` scan the private-registry images and require `console-classic-registry` / `vue-console-registry`, which only `thinx-staging` (and `thinx-console`) build. Moving them to `main` means pointing them at the Docker Hub images and the `*-hub` jobs, the way `snyk-monitor-api` requires `api-hub`.
- CI-05: one clearly marked block disables `console-classic-registry`, `console-classic-hub` and every job that requires them (today `snyk-monitor-console-classic`), so that Phase 48 can restore it with one revert. Production keeps serving the existing `thinx/console:swarm` Legacy image. Phase 43 needs one legacy build while CI-05 is in effect, so the block should allow a one-pipeline bypass (see Milestone Notes).
- UI-05: the three footers live in `Layout.vue`, `Login.vue` and `PasswordReset.vue`. `VUE_APP_BUILD_HASH` (first 7 characters of `CIRCLE_SHA1`) is already passed to the Vue image by the parent CI; a further CI change is needed only if the build date cannot be derived inside the Vue build.

**Success Criteria** (what must be TRUE):
  1. A `thinx-staging` pipeline runs no Snyk monitor job (code, OSS, or any container monitor including console-classic and console-vue), and a `main` pipeline still runs the Snyk monitors. The edited config passes CircleCI config validation.
  2. A normal pipeline builds no legacy console image while v1.18 is open: `console-classic-registry`, `console-classic-hub` and the jobs that require them do not run, and production still serves the existing `thinx/console:swarm` Legacy console. The disable is one marked block that a single revert restores.
  3. The login page shows `/assets/thinx/img/logo_white_200.png` above a darkened auth panel headed "Welcome to THiNX Management Console."; the text "THiNX Login" no longer appears.
  4. The Login button is green (success variant), and "Login with Google" and "Login with GitHub" sit directly below it and above "Don't have an account? Sign up now!". Password, Google and GitHub logins still complete against production under CSRF enforcement.
  5. The footer of every Vue console page (login, password reset and the authenticated layout) shows the copyright year of the build date and the short commit id of the deployed build. No hard-coded `2026` remains in the Vue footers, and a local build without a commit id shows no empty or `undefined` placeholder.

**Plans**: 3/3 plans complete
Plans:
**Wave 1**
- [x] 42-01-PLAN.md — CI trim: Snyk monitors on `main` only (Hub console images), legacy console build behind `build_legacy_console`, live job checker and the D-04 bypass runbook (wave 1)
- [x] 42-02-PLAN.md — Vue: shared AppFooter with build year and 7-char commit id, branded welcome login with green Login and social logins under it (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 42-03-PLAN.md — Ship to `thinx-staging` and verify live: pipeline job list, console.thinx.cloud bundle and logo, Legacy console unchanged (wave 2)

**UI hint**: yes

### Phase 43: Notification Delivery

**Goal**: Device notifications reach every open console of their owner, build status included, and a device can no longer inject markup into the owner's console toast. The escaped toast is live in production now, not at milestone close.
**Depends on**: Phase 42 (CI-05 is in effect, so NOTIF-01 ships through a one-off legacy console build). No dependency on Phases 44–47.
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03
**Repos**: Parent API, `services/console` (Legacy) and one parent CI pipeline.
- Parent API: the `thinx-core.js` WebSocket upgrade duplicate-path guard (`socketMap` keyed by path) for NOTIF-02, and builder status notifications routed through the messenger's per-owner delivery (`lib/thinx/messenger.js`, `lib/router.build.js` `existing_sockets`) for NOTIF-03, with specs.
- Console: the Legacy `LogviewController.js` actionable toast (NOTIF-01). Check whether Vue renders `notification.body` anywhere and escape it there too.
- CI: one legacy console pipeline with CI-05 bypassed, after which CI-05 is back in effect. At this point the console `thinx-staging` branch carries no other unreleased Legacy change, so the one-off build ships NOTIF-01 only.
- Device port `:7442` and plain MQTT are not touched. Todo `2026-10-03-console-notification-delivery-gaps` items 2–4.

**Success Criteria** (what must be TRUE):
  1. A device-supplied `notification.body` that contains HTML shows as literal text in the actionable console toast; no markup renders.
  2. The escaped toast is live on `rtm.thinx.cloud` through a one-off legacy console build: CI-05 is bypassed for that one pipeline only, and the next `thinx-staging` pipeline again builds no legacy console image.
  3. Two Legacy console tabs on the same `/<owner>` socket path both connect without an upgrade refusal and both receive the owner's frames. Closing one tab leaves the other receiving.
  4. A running build's status frames reach the owner's open console sockets and no other owner's sockets.

**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 43-01-PLAN.md — NOTIF-02: per-connection WebSocket tracking in `lib/thinx/socket_upgrade.js` (path guard removed, cap 10 sockets per owner, 429 refusal), local SocketUpgradeSpec, `scripts/check-ws-multitab.js` live probe, ZZ specs re-expressed (wave 1)
- [x] 43-02-PLAN.md — NOTIF-03: builder status frames through `messenger.sendToOwner` with the owner bound in run_build, router and queue pass the messenger, frame rules F-1..F-5, local BuilderStatusFramesSpec (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 43-03-PLAN.md — Ship: thinx-staging push with range and scope checks, pipeline and live NOTIF-02 probe, operator-run one-off legacy bypass (NOTIF-01), Legacy rollout and closed-gate proof, D-16 human checks (wave 2)

**UI hint**: yes

### Phase 44: Device List Parity

**Goal**: The Vue device list reads like the Legacy one: platform-named device icons, the Legacy action icons on a single line, platform bullets, and a visible warning on devices without an API key. Repositories show the same platform bullet.
**Depends on**: Nothing hard (follows Phase 43). Introduces the shared building blocks reused by Phases 45–47: the platform bullet (DEV-04, REPO-01) and the icon button with aria-label and hover tip (DEV-03).
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, REPO-01
**Repos**: `services/console` (Vue; reuses the Legacy `device-icon` / `device-icon-symbol` assets). No parent API change expected.
**Success Criteria** (what must be TRUE):
  1. Each device row shows the Legacy `device-icon` / `device-icon-symbol` on a category background whose class and label are the platform name. No colour-description class such as `grey-mint` remains in the device list.
  2. Device rows use the Legacy status, firmware, build, view-log and edit icons, and edit opens Device Detail. At any viewport width the Actions cell stays on one line; when space runs out it shows icons only, and every icon keeps its text as aria-label and hover tip.
  3. The platform shows as a Legacy-style bullet with no "Platform:" label. Device rows and repository rows render the identical bullet for the same platform, and a repository with no known platform shows `unknown`, never `unknown_platform`.
  4. A device with no API key assigned shows an `fa-warning` icon whose hover tip explains that the device has no API key.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**
- [x] 44-01-PLAN.md — Shared `platforms.js` and `PlatformBullet` with the Legacy palette, bullet in the device table and grid and on repository rows (List.vue `cell(<prop>)` slot), Legacy device symbols on platform tiles, platform filter and sort replacing the category UI (DEV-01, DEV-04, REPO-01) (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 44-02-PLAN.md — Shared `IconButton` (text as aria-label and tip), one-line `actions-cell`, Legacy hammer (icomoon port) with in-flight guard, view-log, edit and revoke icons, heartbeat status, firmware cogs and the missing-API-key warning (DEV-02, DEV-03, DEV-05) (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 44-03-PLAN.md — Ship: console then parent `thinx-staging` push with range checks, `check-ci-gates.js pipeline --expect legacy-off`, live console.thinx.cloud bundle and unchanged Legacy proof, operator UAT of the device list (all six requirements) (wave 3)

**UI hint**: yes

### Phase 45: Deploy Key Rename & Row Actions

**Goal**: A user can rename a deploy key without changing the key itself, and manages each key from compact icon actions with a confirmed, single-shot delete on a table that stays readable on small screens. The Phase 38 review items are closed.
**Depends on**: Phase 44 (shared icon-button pattern)
**Requirements**: KEY-04, KEY-05, KEY-06, POL-04, FIX-04
**Repos**: Parent API and `services/console`.
- Parent: a rename operation in `lib/router.rsakey.js` and `lib/thinx/rsakey.js` that rewrites only the `.pub` comment, addresses the key by exact filename, is owner-bound and CSRF-guarded, and leaves the list/create/revoke envelopes unchanged. FIX-04 also lands here: one shared name validator (IN-01, IN-02), safe display names (IN-03), revoke de-duplication (IN-04), tests (IN-06), and the GitHub-link key choice in `lib/thinx/github_link.js` (IN-07).
- Console: the Vue Deploy Keys page. Any Legacy source change made here is verified locally (`npm run build:test`, `test:deploykeys`) and ships when Phase 48 re-enables the legacy build (CI-06).
- Coordination: v1.17 Phase 40 (`vault-transit`) rewrites private-key storage in the same `lib/thinx/rsakey.js`. Rename must never read or rewrite private-key files.

**Success Criteria** (what must be TRUE):
  1. A user renames an existing deploy key in Vue. After a reload the key shows the new name, and its public key text and fingerprint are unchanged. A name with control characters, Unicode bidi overrides or line/paragraph separators is refused on create and on rename with a message that names the problem.
  2. Each key row has eye (Show), copy (Copy) and trash (Delete) icon buttons whose text stays as aria-label and hover tip. Delete is outside the generate form, asks for confirmation, shows a pending state and cannot be double-submitted.
  3. On a small screen the Name column is truncated with the full name as hover tip, and the Generated and Public Key columns do not wrap. A failed list reload clears the stale rows and shows a single error message.
  4. GitHub linking pushes a deterministically chosen key that does not depend on the newest-first list order, and a revoke request with duplicate filenames reports each key once. Every Phase 38 item in FIX-04 (IN-01..IN-04, IN-06, IN-07) is fixed or deferred with a recorded reason.
  5. The Legacy console that production serves still lists, creates and revokes deploy keys against the deployed API with unchanged endpoints and envelopes.

**Plans**: TBD
**UI hint**: yes

### Phase 46: Transformers & Environment Globals

**Goal**: Transformers and environment globals are managed with clear icon actions, a safe bulk delete and in-place editing, and no user change is silently lost.
**Depends on**: Phase 44 (shared icon-button pattern)
**Requirements**: TRANS-03, TRANS-04, ENV-01, POL-03, FIX-03
**Repos**: `services/console` (Vue) only. Transformers keep persisting as the v1.16 `profile.info.transformers` patch. The environment edit uses the existing env add and revoke endpoints (delete + recreate). No parent API change expected.
**Success Criteria** (what must be TRUE):
  1. On the Transformers page, Edit shows a white wrench icon, Delete a trash icon and "Add Transformer" a `+` sign. The field is called "Name" on every transformer surface.
  2. A user ticks several transformers and deletes them with one trash button, but only after typing `confirm` into the dialog's text field. The dialog warns that devices using them will stop applying them, and after a reload exactly the ticked transformers are gone.
  3. On Device Detail, Save Transformers shows a pending state while saving and marks unsaved checkbox changes as dirty. Clicking Manage Transformers with unsaved changes warns before the changes are discarded.
  4. Each Environment Globals row has an Edit button that changes the value. If the recreate fails, the original variable is back in the list with its old value and the user sees an error.
  5. Phase 37 review items IN-02 and IN-03 are fixed or deferred with a recorded reason.

**Plans**: TBD
**UI hint**: yes

### Phase 47: Build Log Search & Status Colours

**Goal**: A user can find text inside a full build log, sees the same status colours on every build list, and can open the log from every build list, including the dashboard.
**Depends on**: Nothing hard (reuses the v1.16 BuildLogDialog; uses Phase 44's icon-button pattern where it fits)
**Requirements**: BUILD-03, POL-02, FIX-02
**Repos**: `services/console` (Vue) only. The full-log payload stays as it is (AR-36-01 is out of scope).
**Success Criteria** (what must be TRUE):
  1. In the full build log, typing a search term highlights every match and shows the match count. The `<` and `>` buttons step to the previous and next match and scroll it into view. Log text that contains HTML stays inert text while highlighted.
  2. TIMEOUT shows as warning and FAILED as danger on every build list (navbar Recent Builds, dashboard Recent Builds card, History, device Build History), all from one shared status-to-variant mapping.
  3. The dashboard Recent Builds card opens the full build log. A row without a build id shows no "Open build log" button and never requests `/logs/build/<index>`.
  4. Phase 36 WR-01 and IN-01..IN-03 are fixed or deferred with a recorded reason. In particular, the inert-row test fails if a click or keydown handler is added to any Build History cell.

**Plans**: TBD
**UI hint**: yes

### Phase 48: Deep Links & Close-out

**Goal**: Vue deep links survive a reload, the remaining Phase 35 UI-review and review items are closed, and the legacy console build is back on so every Legacy change of the milestone is live before it closes.
**Depends on**: Phases 43–47 (the FIX-01 ledger records Phase 35 items closed there, and CI-06 ships their remaining Legacy changes; see Milestone Notes). Runs last.
**Requirements**: NOTIF-04, POL-01, FIX-01, CI-06, CI-07
**Repos**: `services/console` (Vue `App.vue` deep links for NOTIF-04; Build Firmware, account menu and Device Detail for POL-01; Phase 35 items for FIX-01) and parent `.circleci/config.yml` (revert of the CI-05 block for CI-06; CI-04 stays). CI-07: Vue Cypress specs and support (`vue/cypress/`), possibly `vue/src/utils/cookies.js`, the console repo's `.circleci/config.yml` (`test_vue`: same-origin API for the Cypress step, JUnit output) and a parent `vue-console-registry` dependency on the green suite. No parent API change expected.
**Success Criteria** (what must be TRUE):
  1. Reloading a Vue deep link such as `/#/app/history` while logged in stays on that page instead of redirecting to the dashboard. A logged-out reload still goes to the login page.
  2. Build Firmware shows an in-flight state and ignores a second click until the request settles, the account menu has an accessible name, and the Device Detail content column is width-constrained.
  3. Every Phase 35 review item IN-01..IN-08 is fixed or deferred with a recorded reason, including those closed in Phases 45–47.
  4. The legacy console build is re-enabled (the CI-05 block reverted), a normal `thinx-staging` pipeline builds and publishes the Legacy image again, and every Legacy console change of v1.18 not shipped by the Phase 43 one-off build (for example the Phase 45 deploy-key items) is live on production before the milestone closes.
  5. The Vue console Cypress job is green on `thinx-staging` (all 10 specs pass or skip by design; root causes from the 2026-10-12 diagnosis: deep-link reload for devices/profile, cross-origin CSRF for oauth-return/login), CircleCI shows its JUnit results, and the parent `vue-console-registry` job only runs after the suite passes.

**Carried from Phase 43** (Legacy, ship with CI-06; Phase 43 skipped the one-off legacy build, so `thinx/console:swarm` is still the 2026-10-12 image):
- The "THiNX Builder / Click to show build log..." toast shows `undefined` (`DevicesController.js:117` renders `response.status`, which the build route reply does not carry; pre-existing since 2022, operator UAT 2026-10-13).
- `LogviewController.js:227` `deviceBuilds[udid].push` throws for a device with no build history, so its build toasts are lost (43-UI-REVIEW fix 3).
- A Legacy tab whose first socket opens from the log overlay never sends `{init}` and gets no frames until reload (43-REVIEW IN-04).

**Plans**: TBD
**UI hint**: yes

## Milestone Notes

**Legacy console build paused (CI-05), one exception (NOTIF-01), restored at close (CI-06).** From Phase 42 until
Phase 48, normal pipelines build no legacy console image and production keeps serving the existing
`thinx/console:swarm` image. The one exception is Phase 43 (operator decision 2026-10-12): NOTIF-01 closes a markup
injection into the owner's console, so it ships through a one-off legacy build with CI-05 bypassed for that pipeline
only. Planning picks the mechanism; a CircleCI pipeline parameter that gates the CI-05 block (default off, set for one
API-triggered pipeline) does this without a config edit and revert. Other Legacy source changes (Phase 45 deploy-key
items, Phase 35 IN-03/IN-05) are verified locally with `npm run build:test` and the Legacy unit tests and go live with
CI-06 in Phase 48. The Legacy console runs against each newly deployed API throughout, so API compatibility is checked
live in every phase. v1.18 does not close with the CI-05 block still in place.

**Snyk monitors on `main` only (CI-04).** The console container monitors currently scan private-registry images that
only `thinx-staging` publishes. Planning has to choose the `main`-side image (Docker Hub, built by `vue-console-hub`
and `console-classic-hub`) so the monitors still have something to scan. `snyk-monitor-console-classic` stays off
with its build until CI-06.

**Shared building blocks (Phase 44).** The platform bullet and the icon button (icon, text kept as aria-label and hover
tip) are built once in Phase 44. Phases 45 (KEY-05), 46 (TRANS-03) and 47 (search step buttons) reuse them instead of
adding their own.

**Phase 35 review items closed outside Phase 48.** FIX-01 maps to Phase 48, whose disposition ledger is the
deliverable. Some Phase 35 items sit in files that earlier phases already have open, so fix them there and record
them in the Phase 48 ledger:
- IN-03, IN-04, IN-05 (Legacy deploy-key create handler, readable key-name errors, Legacy goal check) → Phase 45
- IN-02 (transformer re-fetch reported as a failed create) → Phase 46
- IN-06 (status badge colours incl. `RUNNING`), IN-07 (`BuildLogDialog` loading reset and `build.id` fallback) → Phase 47, alongside POL-02 and Phase 36 IN-02
- IN-01 (`parseResult` empty envelope) and IN-08 (test gaps) → Phase 48

**Parent API phases.** Phases 43 and 45 change parent code under `lib/` (and `thinx-core.js` in 43) and need specs.
Phase 43's WebSocket change must keep `ZZ-WebSocketHandshakeRtmSpec` green and must not weaken the per-owner routing
of quick 261003-vn3: frames go only to the owner's sockets. Item 1 of todo
`2026-10-03-console-notification-delivery-gaps` was resolved by quick 261003-w0c; Phase 43 covers items 2–4.

**Coordination with v1.17 (`vault-transit`).** v1.17 Phase 40 rewrites deploy-key storage in `lib/thinx/rsakey.js`.
The Phase 45 rename touches only the `.pub` comment. Whichever lands second rebases on the other, and the rename must
keep working with Transit-encrypted private keys. Both workstreams push to parent `thinx-staging`; any v1.17 edit to
`.circleci/config.yml` must rebase on the CI-04/CI-05 changes and not undo them.

**Deploy path (AGENTS.md).** Console commits go to `services/console` `thinx-staging`, then the parent submodule
pointer bump goes to parent `thinx-staging` (never `main`). CircleCI builds the images and Swarmpit rolls them out.
Verify each deploy on `https://rtm.thinx.cloud/` (skill `console-retest`). Console `test:unit` is not run in CI, so
run it locally before each push.

## Progress

**Execution Order:**
Phases execute in numeric order: 42 → 43 → 44 → 45 → 46 → 47 → 48. Phase 42 goes first for the CI trim, and Phase 43
right after it so the escaped toast reaches production early. Phase 47 has no hard dependency and may run earlier.
Phase 48 runs last, because its FIX-01 ledger closes over Phases 45–47 and CI-06 ships the remaining Legacy changes.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 42. CI Trim, Login Page & Build Footer | v1.18 | 3/3 | Complete    | 2026-10-12 |
| 43. Notification Delivery | v1.18 | 3/3 | Complete    | 2026-10-13 |
| 44. Device List Parity | v1.18 | 3/3 | In Progress | - |
| 45. Deploy Key Rename & Row Actions | v1.18 | 0/? | Not started | - |
| 46. Transformers & Environment Globals | v1.18 | 0/? | Not started | - |
| 47. Build Log Search & Status Colours | v1.18 | 0/? | Not started | - |
| 48. Deep Links & Close-out | v1.18 | 0/? | Not started | - |

---
*v1.18 Console Improvements roadmap created 2026-10-12: 32 requirements across 7 phases (42–48). Next: `/gsd-discuss-phase 42`.*
