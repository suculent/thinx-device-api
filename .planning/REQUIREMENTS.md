# Requirements — v1.16 Console Usability & Deploy Keys

Source: MILESTONE-CONTEXT.md. Checkboxes track implementation. Browser/live acceptance and release CI are still pending; see v1.16-VERIFICATION.md.

- [x] **UI-01**: Remove template alert, duplicate logout, and Inbox; rename My Account to My Profile.
- [x] **UI-02**: Show device action buttons with icons at the top, including environment editing, and stack sections in a single column.
- [x] **UI-03**: Resolve linked repository to its name and Git URL.
- [x] **UI-04**: Make All notifications exclusive of Important and Informational, including hydration and save.
- [x] **BUILD-01**: Open the full build log from Recent Builds, History, and Device Build History with loading, empty, and error states.
- [x] **BUILD-02**: Display explicit and expired running builds as TIMEOUT while preserving completed results.
- [x] **TRANS-01**: Create and edit transformers in Vue and persist them in profile.info.transformers without losing other profile fields.
- [x] **TRANS-02**: Select existing transformers and create-and-assign a transformer from Device detail.
- [x] **KEY-01**: Name deploy keys before generation in Vue and Legacy; preserve names across reload.
- [x] **KEY-02**: Label Vue keys Deploy Keys, sort by generation time, and show/copy each public key.
- [x] **KEY-03**: Fix Legacy key-generation response handling, list refresh, and error notification behavior.

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| UI-01 | 35 | Implemented; locally verified |
| UI-02 | 35 | Implemented; locally verified |
| UI-03 | 35 | Implemented; locally verified |
| UI-04 | 35 | Implemented; locally verified |
| BUILD-01 | 36 | Implemented; locally verified |
| BUILD-02 | 36 | Implemented; locally verified |
| TRANS-01 | 37 | Implemented; locally verified |
| TRANS-02 | 37 | Implemented; locally verified |
| KEY-01 | 38 | Implemented; locally verified |
| KEY-02 | 38 | Implemented; locally verified |
| KEY-03 | 38 | Implemented; locally verified |

Out of scope: deployment/infrastructure changes, paused v1.15 edge work, credentials from the source document.
