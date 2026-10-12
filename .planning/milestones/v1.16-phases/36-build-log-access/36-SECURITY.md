---
phase: "36"
slug: "build-log-access"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 36 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: `36-02-PLAN.md` `<threat_model>` (gap closure G-36-3). `36-01-PLAN.md` carries no
> threat model.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Vue device detail page → `GET /api/v2/logs/build/:id` | The full build log is fetched from the owner-scoped API | build output (may contain project details) |
| owner-scoped build list → DOM | build_id and status are rendered in the Build History table | build metadata |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-36-01 | Denial of service | DeviceDetail.vue Build History rows (accidental full-log fetches) | medium | mitigate | Console 6bf96eb: the `<tr>` has no role, tabindex or listeners; the full log loads only from the per-row `data-cy="build-open-log"` button. Unit render test + mutation checks (milestone-v116.cjs), Cypress spec asserts a row click issues no log request | closed |
| T-36-02 | Information disclosure | Inline last-build log card | low | mitigate | `card-device-logs` and `deviceLogs` removed (6bf96eb); render test asserts no card, `pre` or log text | closed |
| T-36-03 | Denial of service | Backend full-log endpoint (sync read, Buffer-as-JSON, no compression) | medium | accept | See Accepted Risks Log | closed |
| T-36-04 | Tampering | `:aria-label` / text bindings of build_id and status | low | mitigate | Only auto-escaped Vue text/attribute bindings; no `v-html`, no href added (6bf96eb diff) | closed |
| T-36-05 | Repudiation | Unsigned or hook-bypassing commits | low | mitigate | Console e84ef46, 6bf96eb, 5e5783a and parent 92eca3b7 all signature status `G` | closed |
| T-36-SC | Tampering | npm/pip/cargo installs | low | accept | See Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-36-01 | T-36-03 | Backend payload size is out of scope for G-36-3 (deferred in 36-02-PLAN.md); after the fix the endpoint is reached only by an explicit button press per build, not by browsing the list | plan 36-02 threat model | 2026-10-12 |
| AR-36-02 | T-36-SC | No package installed; tests use existing `vue` / `vue-template-compiler`; Cypress runs only in CI from the existing lockfile | plan 36-02 threat model | 2026-10-12 |

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
