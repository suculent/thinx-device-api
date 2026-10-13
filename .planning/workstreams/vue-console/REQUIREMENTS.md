# Requirements: THiNX Device API — v1.18 Console Improvements

**Defined:** 2026-10-12
**Workstream:** vue-console
**Core Value:** Bring the Vue console to Legacy-console parity and polish (login, devices, deploy keys, transformers, environment globals, repositories, build-log search) and close the console leftovers of v1.16.

Scope source: operator backlog "Vue Console Improvements Backlog" (2026-10-12) plus selected v1.16 leftovers
(open review items, UI-review top fixes 35–38, todo `2026-10-03-console-notification-delivery-gaps`, Phase 26
App.vue deep-link follow-up). Vue and Legacy live in the `services/console` submodule: coordinated submodule
commits + parent pointer bump. Keep Legacy routes and API envelopes compatible; no dependency or infrastructure
upgrades.

## v1.18 Requirements

### Global

- [x] **UI-05**: The footer on every Vue console page shows the copyright year derived from the build date and the short commit id of the build (no hard-coded 2026).

### Login

- [x] **LOGIN-01**: The login page shows `/assets/thinx/img/logo_white_200.png` above a darkened auth panel, and the panel reads "Welcome to THiNX Management Console." instead of "THiNX Login".
- [x] **LOGIN-02**: The "Login with Google" and "Login with GitHub" buttons sit directly below the Login button, above "Don't have an account? Sign up now!".
- [x] **LOGIN-03**: The Login button is green (success) instead of red.

### Deploy Keys

- [ ] **KEY-04**: A user can rename an existing deploy key; the key material is unchanged and the new name persists across reload.
- [ ] **KEY-05**: Each key row has icon buttons for Show (eye), Copy (copy) and Delete (trash), with the text kept as aria-label and hover tip; per-row Delete asks for confirmation.
- [ ] **KEY-06**: The Name column is truncated with the full name as a hover tip, so the Generated and Public Key columns do not wrap on small screens.

### Devices

- [ ] **DEV-01**: The device list shows the Legacy `device-icon` / `device-icon-symbol` assets on a category background whose class/label is named after the platform, not a colour description such as `grey-mint`.
- [ ] **DEV-02**: Device rows use the Legacy status, firmware, build, view-log and edit (= Detail) icons.
- [ ] **DEV-03**: The Actions cell never wraps; when space runs out it shows icons only, with the text kept as aria-label and hover tip.
- [ ] **DEV-04**: The platform is shown as a Legacy-style bullet without the "Platform:" label.
- [ ] **DEV-05**: Devices with no API key assigned show `fa-warning` with an explanatory hover tip.

### Build Log

- [ ] **BUILD-03**: A user can search the displayed full build log: matches are highlighted and counted, and `<` / `>` buttons step between matches with auto-scroll.

### Transformers

- [ ] **TRANS-03**: The Edit button has a white wrench icon, Delete a trash icon, and "Add Transformer" a `+` sign.
- [ ] **TRANS-04**: A user can tick several transformers and delete them with one Delete (trash) button, after typing `confirm` into the confirmation dialog's text field.

### Environment Globals

- [ ] **ENV-01**: Each Environment Globals row has an Edit button to change the value (delete + recreate); if the recreate fails, the original variable is restored and the user sees an error.

### Repositories

- [ ] **REPO-01**: Repository rows show the platform with the same bullet design as Devices, and the user-facing fallback is `unknown` instead of `unknown_platform`.

### Review Leftovers (v1.16)

- [ ] **FIX-01**: Every open Phase 35 review item (IN-01..IN-08) is fixed or explicitly deferred with a recorded reason.
- [ ] **FIX-02**: Phase 36 WR-01 and IN-01..IN-03 are fixed or explicitly deferred with a recorded reason.
- [ ] **FIX-03**: Phase 37 IN-02 and IN-03 are fixed or explicitly deferred with a recorded reason.
- [ ] **FIX-04**: Phase 38 IN-01..IN-04, IN-06 and IN-07 (newest-first sort changes which key GitHub linking pushes) are fixed or explicitly deferred with a recorded reason.

### UI-Review Polish (v1.16)

- [ ] **POL-01**: (35-UI-REVIEW) Build Firmware shows an in-flight state and cannot be double-submitted; the account menu has an accessible name; the Device Detail content column is width-constrained.
- [ ] **POL-02**: (36-UI-REVIEW) One shared status→variant mapping distinguishes TIMEOUT (warning) from FAILED (danger); the dashboard Recent Builds card can open the build log; rows without a build id show no "Open build log" button.
- [ ] **POL-03**: (37-UI-REVIEW) Save Transformers has pending and dirty states; the field is called "Name" on every surface; deleting a transformer warns that devices using it will stop applying it.
- [ ] **POL-04**: (38-UI-REVIEW) Deploy-key Delete is out of the generate form, has a pending state and cannot be double-submitted; a failed reload clears stale rows and shows a single error message.

### Notifications

- [x] **NOTIF-01**: The actionable console toast HTML-escapes the device-supplied `notification.body`, so no markup injection is possible; the fix is deployed to production via a one-off legacy console build while CI-05 is in effect, not deferred to CI-06.
- [x] **NOTIF-02**: A second Legacy console tab on the same `/<owner>` socket path is accepted and both tabs receive frames.
- [x] **NOTIF-03**: Build status frames reach the owner's console sockets.
- [ ] **NOTIF-04**: Reloading a Vue deep link such as `/#/app/history` stays on that page instead of redirecting to the dashboard.

### CI / Delivery

- [x] **CI-04**: Snyk monitor jobs (snyk-code-monitor, snyk-oss-monitor, snyk-container-monitor incl. snyk-monitor-console-classic / snyk-monitor-console-vue in the parent .circleci/config.yml `main` workflow) run only on branch `main`, never on `thinx-staging`.
- [x] **CI-05**: For the duration of v1.18 the legacy console image build (build-console-classic: console-classic-registry / console-classic-hub, plus jobs that require it) is temporarily disabled in CI, so thinx-staging pipelines skip it; production keeps serving the existing thinx/console:swarm image. The change is a single, clearly marked, revertible edit.
- [ ] **CI-06**: Before the milestone closes, the legacy console build is re-enabled, and the Legacy console changes made during v1.18 that are not yet live (e.g. FIX-04 / Phase 35 legacy deploy-key items; NOTIF-01 already ships earlier through its one-off build) are built and deployed.
- [ ] **CI-07**: The Vue console Cypress suite runs green in CI and gates the Vue console deploy: `devices.spec.js` and `profile.spec.js` reach their pages via `cy.visitAppRoute` (or pass natively once NOTIF-04 fixes deep links), `oauth-return.spec.js` runs with a same-origin API (or `ensureCsrfToken` prefers a forced prime over a stale cookie), the live `login.spec.js` test is stubbed or explicit opt-in and no longer falls back to the leaked `test` fixture username, CircleCI stores JUnit results, and the parent `vue-console-registry` job requires the green suite. Legacy console Cypress stays off (deprecating; its specs need a real API and send real e-mail).

## Future Requirements

- **AR-36-01**: Full-log payload size (async GlusterFS read, compact/compressed payload instead of JSON Buffer byte array).

## Out of Scope

| Feature | Reason |
|---------|--------|
| AR-36-01 full-log payload size | Backend performance work; deferred by operator 2026-10-12 |
| Dependency / infrastructure upgrades | Milestone is console UX; keep the baseline stable |
| Legacy API envelope changes | Legacy console must keep working against the same API |
| Same-second deploy-key sort tiebreak beyond FIX-04 | Only addressed as far as IN-07 requires |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-04 | Phase 42 | Complete |
| CI-05 | Phase 42 | Complete |
| UI-05 | Phase 42 | Complete |
| LOGIN-01 | Phase 42 | Complete |
| LOGIN-02 | Phase 42 | Complete |
| LOGIN-03 | Phase 42 | Complete |
| NOTIF-01 | Phase 43 | Complete |
| NOTIF-02 | Phase 43 | Complete |
| NOTIF-03 | Phase 43 | Complete |
| DEV-01 | Phase 44 | Pending |
| DEV-02 | Phase 44 | Pending |
| DEV-03 | Phase 44 | Pending |
| DEV-04 | Phase 44 | Pending |
| DEV-05 | Phase 44 | Pending |
| REPO-01 | Phase 44 | Pending |
| KEY-04 | Phase 45 | Pending |
| KEY-05 | Phase 45 | Pending |
| KEY-06 | Phase 45 | Pending |
| POL-04 | Phase 45 | Pending |
| FIX-04 | Phase 45 | Pending |
| TRANS-03 | Phase 46 | Pending |
| TRANS-04 | Phase 46 | Pending |
| ENV-01 | Phase 46 | Pending |
| POL-03 | Phase 46 | Pending |
| FIX-03 | Phase 46 | Pending |
| BUILD-03 | Phase 47 | Pending |
| POL-02 | Phase 47 | Pending |
| FIX-02 | Phase 47 | Pending |
| NOTIF-04 | Phase 48 | Pending |
| POL-01 | Phase 48 | Pending |
| FIX-01 | Phase 48 | Pending |
| CI-06 | Phase 48 | Pending |
| CI-07 | Phase 48 | Pending |

**Coverage:**
- v1.18 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-10-12*
*Last updated: 2026-10-12 after adding CI-07 (Vue Cypress suite green and gating, Phase 48)*
