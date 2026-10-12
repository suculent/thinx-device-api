---
phase: "35"
slug: "console-usability"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 35 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: `35-02-PLAN.md` `<threat_model>` (gap closure G-35-4). `35-01-PLAN.md` carries no
> threat model; its summary records no threat flags.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| repository owner input → stored source URL → Vue device detail DOM | The Git URL is free text from the Repositories form, rendered into an href in the console origin, which holds the session | user-entered URL (untrusted) |
| console tab → external repository host | The new tab opens a third-party origin (GitHub or any http(s) host) | navigation, opener handle, Referer |
| local commits → later deploy | Unpushed commits reach production only through the operator's later thinx-staging push | source changes |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-35-01 | Elevation of privilege | DeviceDetail.vue Linked Repository href (stored `javascript:` / `data:` XSS) | high | mitigate | `linkedRepositoryHref` computed (`vue/src/pages/Devices/DeviceDetail.vue`, console 8815aa7) parses with WHATWG `URL` and returns `parsed.href` only for `http:`/`https:`; otherwise `<span>` text. Tests: `milestone-v116.cjs` javascript: render (no href) + scheme matrix (` javascript:`, `data:`, `ssh:`, `file:`, case variants) | closed |
| T-35-02 | Tampering | `target="_blank"` link (reverse tabnabbing) | medium | mitigate | `rel="noopener noreferrer"` on the anchor; test asserts exact `target` and `rel` | closed |
| T-35-03 | Information disclosure | Referer to repository host | low | mitigate | `noreferrer` in `rel` (same anchor) | closed |
| T-35-04 | Information disclosure | Credentials embedded in a stored https URL | low | accept | See Accepted Risks Log | closed |
| T-35-05 | Spoofing | Link text vs target | low | accept | See Accepted Risks Log | closed |
| T-35-06 | Repudiation | Unsigned or hook-bypassing commits | low | mitigate | Console b7b5b29, 8815aa7, 4552901 and parent fadfab0e all show signature status `G`; commitlint rejection was fixed by rewrapping, no `--no-verify` | closed |
| T-35-SC | Tampering | npm/pip/cargo installs | low | accept | See Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-35-01 | T-35-04 | The URL text was already shown as plain text before this change; the link adds no new disclosure (noreferrer, same text). Masking stored credentials is outside G-35-4 | plan 35-02 threat model | 2026-10-12 |
| AR-35-02 | T-35-05 | Text and href come from the same stored string; the WHATWG parser only normalises case and surrounding whitespace, and a non-http(s) value never becomes a link | plan 35-02 threat model | 2026-10-12 |
| AR-35-03 | T-35-SC | No package installed; the test uses the existing `vue` and `vue-template-compiler` in `services/console/vue/node_modules` | plan 35-02 threat model | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 7 | 7 | 0 | gsd-secure-phase (L1 short-circuit, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
