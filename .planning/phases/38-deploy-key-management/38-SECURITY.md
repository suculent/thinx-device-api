---
phase: "38"
slug: "deploy-key-management"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 38 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> `38-01-PLAN.md` has no `<threat_model>`, so this register was built retroactively (STRIDE) from the
> implementation by gsd-security-auditor: parent 58027c18, 666e5bf5; console 956a7a2, 295c83a (35 WR-05),
> c47cd21 (35 WR-06). Later hardening: parent f3845d58 (38-REVIEW WR-01/WR-02).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| console → `GET/PUT /api/v2/rsakey` (create), `POST/DELETE` (revoke) | Owner-scoped, CSRF-guarded routes | key name (user input), filenames to delete |
| API → `ssh_keys` directory | Key pairs stored as `<owner>-<timestamp>[.pub]` | private keys (encrypted at rest), public keys with name comment |
| API → consoles | Key list rendered in Vue and Legacy | names, public keys, dates, filenames |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|----------|-------------|------------------------|--------|
| T-38-01 | Tampering | Key name becoming a path | high | mitigate | Filenames only from sanitised owner + numeric timestamp (`newNameWithOwner`, `reserveIdentifier`); name only enters the OpenSSH comment | closed |
| T-38-02 | Tampering | Name validation (newline/control injection, type confusion) | medium | mitigate | Validated in router.rsakey.js and again in `create()`: non-string, blank, >120, `[\r\n\x00-\x1f\x7f]` → 400 `invalid_key_name`; tests cover `{}`, `[]`, control chars | closed |
| T-38-03 | Spoofing | Unicode format/separator characters in names (U+202E, U+2028, U+0085) | low | accept | See Accepted Risks Log | closed |
| T-38-04 | Tampering (stored XSS) | Key name in both consoles | medium | mitigate | Escaped interpolation only (Rsakeys.vue `{{ item.name }}`, BV modal title as textContent; legacy `{{deploykey.name}}`); no `v-html`/`ng-bind-html`; owner-only exposure | closed |
| T-38-05 | Information disclosure / EoP | Cross-owner list, delete, git use | high | mitigate | Owner from session only; `getKeyPathsForOwner` exact `KEY_FILENAME` owner match; git.js selects through it; owner-isolation test passes | closed |
| T-38-06 | Tampering | Deleting the wrong key after newest-first sort | medium | mitigate | `revokeUserKeys` deletes by exact submitted filename within the owner's keys; Vue confirms before delete (c47cd21) | closed |
| T-38-07 | Tampering | Path traversal in delete `filenames` | high | mitigate | Only exact `readdir` entries matching `^[0-9a-f]{64}-\d+$` for the owner; `../outside` returns `[]` (test) | closed |
| T-38-08 | Information disclosure | Private key exposure | critical | mitigate | Create response omits the private key; list reads `.pub` only; private file `wx` + 0600, aes-256-cbc under `GIT_KEY_PASSPHRASE`; generation refused without it | closed |
| T-38-09 | Information disclosure | Create response `filename` is the absolute server path | low | accept | See Accepted Risks Log | closed |
| T-38-10 | Spoofing (CSRF) | Mutating key routes | high | mitigate | `csrf.verifyCsrfToken` on all four mutating routes; prod `CSRF_ENFORCE=true`, `CSRF_MODE=signed`; both clients send X-XSRF-TOKEN | closed |
| T-38-11 | Tampering | Concurrent creates overwriting a handed-out key | medium | mitigate | Exclusive `wx` name claim before keygen, private `wx`, claim released on failure; tests pass. f3845d58: all post-keygen writes guarded, so a disk error fails the create instead of crashing the API | closed |
| T-38-12 | DoS / input validation | Non-array `filenames` on delete → 500 | low | accept | See Accepted Risks Log (tracked as 38-REVIEW WR-05) | closed |
| T-38-13 | DoS | Unbounded RSA-4096 generation | medium | accept | See Accepted Risks Log | closed |
| T-38-14 | Repudiation | No audit-log entry for key create/delete | low | accept | See Accepted Risks Log | closed |
| T-38-15 | Repudiation | Unsigned implementation commits 58027c18 (parent) and 956a7a2 (console) | low | accept | See Accepted Risks Log | closed |
| T-38-SC | Tampering | Dependency installs | low | mitigate | No dependency changed; only test-script entries in package.json | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-38-01 | T-38-03 | Names render escaped and only to their owner; OpenSSH splits on `\n` only, so no line injection. Tightening to reject `\p{Cc}\p{Cf}` is listed as 38-REVIEW IN-02 | orchestrator (auditor recommendation), below block threshold | 2026-10-12 |
| AR-38-02 | T-38-09 | Predates phase 38; no client reads the field; tracked as 38-REVIEW WR-06 | orchestrator (auditor recommendation), below block threshold | 2026-10-12 |
| AR-38-03 | T-38-12 | No crash or stack leak in production (`NODE_ENV=production`); one-line `Array.isArray` guard tracked as 38-REVIEW WR-05 | orchestrator, below block threshold | 2026-10-12 |
| AR-38-04 | T-38-13 | Predates phase 38; global rate limit applies; per-owner cap is a hardening backlog item | orchestrator, below block threshold | 2026-10-12 |
| AR-38-05 | T-38-14 | Predates phase 38; audit logging for key operations is a backlog item | orchestrator, below block threshold | 2026-10-12 |
| AR-38-06 | T-38-15 | Historical commits; all follow-up commits (666e5bf5, 295c83a, c47cd21, f3845d58) are signed | orchestrator, below block threshold | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 16 | 16 | 0 | gsd-security-auditor (retroactive STRIDE, ASVS L1); 6 low/medium items accepted below the high block threshold |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
