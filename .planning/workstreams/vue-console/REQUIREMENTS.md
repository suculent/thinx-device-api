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

- [ ] **UI-05**: The footer on every Vue console page shows the copyright year derived from the build date and the short commit id of the build (no hard-coded 2026).

### Login

- [ ] **LOGIN-01**: The login page shows `/assets/thinx/img/logo_white_200.png` above a darkened auth panel, and the panel reads "Welcome to THiNX Management Console." instead of "THiNX Login".
- [ ] **LOGIN-02**: The "Login with Google" and "Login with GitHub" buttons sit directly below the Login button, above "Don't have an account? Sign up now!".
- [ ] **LOGIN-03**: The Login button is green (success) instead of red.

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

- [ ] **NOTIF-01**: The actionable console toast HTML-escapes the device-supplied `notification.body`, so no markup injection is possible.
- [ ] **NOTIF-02**: A second Legacy console tab on the same `/<owner>` socket path is accepted and both tabs receive frames.
- [ ] **NOTIF-03**: Build status frames reach the owner's console sockets.
- [ ] **NOTIF-04**: Reloading a Vue deep link such as `/#/app/history` stays on that page instead of redirecting to the dashboard.

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

**Coverage:**
- v1.18 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29 ⚠️

---
*Requirements defined: 2026-10-12*
*Last updated: 2026-10-12 after initial definition*
