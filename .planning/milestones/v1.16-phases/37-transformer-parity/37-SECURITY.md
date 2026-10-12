---
phase: "37"
slug: "transformer-parity"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 37 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: `37-02-PLAN.md` `<threat_model>` (gap closure G-37-5). `37-01-PLAN.md` carries no
> threat model; its transformer-editor and profile-save defects were found by the phase 35 code review
> (35-REVIEW.md CR-01, WR-02, WR-04) and fixed in console 52bf1e5, c372197, e53f2e9 (35-REVIEW-FIX.md).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| profile.info.transformers → Device detail DOM | Transformer aliases (user-entered) render as checkbox labels | transformer alias text |
| Device detail → `PUT /api/v2/device` | The checked transformer utids are saved to the device | utid list (owner-scoped server-side) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-37-01 | Tampering | Checkbox labels from transformer aliases | low | mitigate | `transformerOptions` emits only `{ value, text }` (DeviceDetail.vue:252-254), rendered escaped; no `html` key, no `v-html`; unit test deep-equals the options | closed |
| T-37-02 | Tampering | Create & Assign writing unsaved checkbox state | medium | mitigate | createTransformer logic unchanged in 1f0626c (comments only); assignment built from `device.transformers` + new utid (35 WR-02); WR-02 unit checks retained | closed |
| T-37-03 | Tampering | Save Transformers payload | low | mitigate | Same `editForm.transformers` model as before; unit test drives the real `saveTransformers`, Cypress asserts the PUT body; server ownership checks unchanged | closed |
| T-37-04 | Spoofing | Manage Transformers navigation target | low | accept | See Accepted Risks Log | closed |
| T-37-05 | Repudiation | Unsigned or hook-bypassing commits | low | mitigate | Console 5f0d73a, 1f0626c, 4cbf1da and parent 04455f8c all signature status `G` | closed |
| T-37-SC | Tampering | npm/pip/cargo installs | low | accept | See Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-37-01 | T-37-04 | `to` stays the static internal route `/app/transformers`; only variant, class and data-cy changed | plan 37-02 threat model | 2026-10-12 |
| AR-37-02 | T-37-SC | No package installed; tests use existing `vue`, `vue-template-compiler`, `@vue/cli-service`; Cypress runs only in CI from the existing lockfile | plan 37-02 threat model | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 6 | 6 | 0 | gsd-secure-phase (L1 short-circuit, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
