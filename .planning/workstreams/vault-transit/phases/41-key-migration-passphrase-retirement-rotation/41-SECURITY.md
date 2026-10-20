---
phase: "41"
slug: "key-migration-passphrase-retirement-rotation"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-20"
---

# Phase 41 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Migration tool ↔ `ssh_keys` volume | `scripts/migrate-deploy-keys.js` reads legacy PEM, writes Transit ciphertext by atomic replace | Plaintext private keys (memory, 0700 tmpfs scratch), `vault:vN:` ciphertext |
| API ↔ OpenBao Transit | AppRole encrypt/decrypt/rewrap only; rotate, trim, export denied | Deploy-key plaintext and ciphertext (critical) |
| Operator ↔ OpenBao | userpass login with 4 h tokens for rotate and `min_decryption_version` | Operator token, key config |
| Operator ↔ micro (ssh) | D-05 tar, secret/`.env` retirement, targeted `docker service update`, shreds | Legacy key backup, passphrase secret, canary ciphertext |
| CI ↔ dev OpenBao | `BAO_DEV_ADMIN_TOKEN` throwaway token in `docker-compose.test.yml` only | Test keys, dev admin token |

---

## Threat Register

Evidence for every row: auditor report 2026-10-20 (code at `cab394b6` = deployed `8bc53a75`; historic migration code at `f6c93032`; thinx-swarm `48581e9`; live steps from `.planning/runbooks/openbao.md` = RB).

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-41-01 | I | plaintext key during conversion | high | mitigate | 0700 mkdtemp + 0600 `wx` copy, `stdio:'ignore'`, buffers zeroed in finally (MDK@f6c9:326-388, :637-640; specs B2/B11) | closed |
| T-41-02 | T | partial/racing rewrite, resurrected revoked key | high | mitigate | `replaceFile` wx+fsync+re-check+rename+post-check (MDK:241-284), exact leftover sweep (:73, :286-298); B7/B8, W4b/W4d. Residual review WR-01 open | closed |
| T-41-03 | I | report and log output | high | mitigate | Owner/key/cause only (MDK:349, :513-527); class-filtered CANARY/FETCH_CHECK lines; canary file 600 (RB:1340) | closed |
| T-41-04 | D | unconvertible key silently destroyed | medium | mitigate | File-level quarantine only, abort classes leave files `not_attempted`; tar precedes migrate (RB:1164-1175); 0 quarantined | closed |
| T-41-05 | E | policy widening | medium | mitigate | `thinx-api.hcl:9-19` unchanged since Phase 39; latest version from encrypt prefix (MDK:319-329) | closed |
| T-41-06 | I | D-05 backup on micro | high | mitigate | 700/600 on local ext4, not in Gluster backup (RB:1164-1168); shredded (RB:1558-1562); DO-snapshot residual accepted | closed |
| T-41-07 | D | migration breaking keyed builds | high | mitigate | Dual-read kept until 41-05; atomic replace; idempotent re-run; D-10 keyed fetch; untar rollback (RB:1107-1195) | closed |
| T-41-08 | T | orphan purge on CouchDB hiccup | high | mitigate | `rsakey.js:348-352` refuses on failed/empty view; 378 owners matched scan (RB:1169-1171) | closed |
| T-41-09 | I | production commands and evidence | high | mitigate | Counts/modes/verdicts only; WG `OUTPUT_CLEAN`; runbook shape scan 0 | closed |
| T-41-10 | E | untested code reaching production | high | mitigate | thinx-unit #16153 first, pushed range = 41-01 files, fast-forward (RB:1107-1126) | closed |
| T-41-11 | D | silent fleet-wide decrypt failure after rotation | high | mitigate | `retired_version` / `key_missing` classes (`transit.js:245-371`, `git.js:33`); TransitSpec D13a-d, A5; TransitRotationSpec fails in CI | closed |
| T-41-12 | I | OpenBao text or ciphertext in logs/Slack | medium | mitigate | Strict `===` matching (`transit.js:103-106`), fixed log format; "too old" absence asserted | closed |
| T-41-13 | R | alert flapping | medium | mitigate | Separate `_retiredAlertedAt` latch; A5 proves later outage still alerts | closed |
| T-41-14 | E | dev admin token in production wiring | medium | mitigate | Token only in test compose, `openbao-dev.sh`, spec; WG API_ENV guard. Residual IN-09 (CI only) | closed |
| T-41-15 | I | passphrase lingering in code/images/compose | high | mitigate | No `GIT_KEY_PASSPHRASE` outside `.planning`/`spec`; PassphraseRetiredSpec in CI with proven mutation. Residual IN-07 | closed |
| T-41-16 | D | removal breaking keyed builds | high | mitigate | GitSpec on FakeTransit; all keys Transit at D-10; live fetch after removal (RB:1238-1239) | closed |
| T-41-17 | T | restored legacy file acted on | medium | mitigate | Skip-and-log only (`git.js:808-812`); GitSpec D9a/D9b. Residual WR-04 open | closed |
| T-41-18 | E | inherited askpass/agent | medium | mitigate | baseEnv/agentEnv deletions (`git.js:365-384`); GitSpec env-absence cases | closed |
| T-41-19 | D | removal deploy breaking keyed builds | high | mitigate | legacy_total 0 before push, thinx-unit #16160, FETCH_CHECK ok, revert path (RB:1205-1253) | closed |
| T-41-20 | T | wiring gate weakened by the flip | high | mitigate | PASSPHRASE_ABSENT in --source/--live/verifier; self-test 18/18; BASELINE_UNCHANGED. Residuals WR-05/WR-06 open | closed |
| T-41-21 | T | unrelated thinx-swarm changes | medium | mitigate | `48581e9` touches exactly three paths (RB:1270) | closed |
| T-41-22 | I | evidence and probe output | high | mitigate | REMOVAL_LIVE booleans/types; names, counts, SHAs only (RB:1200-1254) | closed |
| T-41-23 | I | passphrase in PreviousSpec, secret store, `.env*` | high | mitigate | secret rm, `.env` 1→0, `.env*` sweep, forced update clears PreviousSpec, spec backups shredded (RB:1282-1320, :1563-1567) | closed |
| T-41-24 | T | stack deploy dropping live-only mounts | high | mitigate | No stack deploy/restart.sh; 600 backup; targeted updates; SPEC_DELTA ok (RB:1264-1318) | closed |
| T-41-25 | D | retirement breaking API, 7442 or builds | high | mitigate | Code first; checks after each restart; rollback offered before secret rm (RB:1285-1322) | closed |
| T-41-26 | I | canary/ciphertext in terminal or logs | medium | mitigate | Container → 0600 host file via ssh pipe; shape/version only printed (RB:1332-1342) | closed |
| T-41-27 | E | rotation authority | medium | mitigate | AppRole rotate denied (FORBIDDEN_DENIED 13/13), no trim/flag change, rotating token revoked; up to two earlier 41-06 login tokens left to TTL — see AR-41-02 | closed (accepted residual) |
| T-41-28 | D | raised minimum strands a key | high | mitigate | D14_GATE before raise; `_retired` alert; rollback by lowering minimum, trim denied (RB:1401-1411, :518-522) | closed |
| T-41-29 | I | old ciphertext decryptable after AppRole compromise | high | mitigate | Rewrap 77→v2, min = latest = 2, canary refused `retired_version` (RB:1386-1431) | closed |
| T-41-30 | I | canary/ciphertext/OpenBao text in output | medium | mitigate | Verdict lines only; runbook ciphertext scan 0 | closed |
| T-41-31 | E | config authority misuse | medium | mitigate | One config write then `revoke -self`; `operator.hcl` denies exportable/plaintext backup/deletion/trim | closed |
| T-41-32 | I | D-05 tar and spec backups after phase | high | mitigate | Inventory, `shred -u`, sanitized baseline, absence on both nodes (RB:1519-1579) | closed |
| T-41-33 | I | copies outside the nodes (DO snapshots, Gluster backups) | medium | accept | See AR-41-01 | closed |
| T-41-34 | R | what was destroyed and when | low | mitigate | D-06 shred record (RB:1550-1594; 41-08-SUMMARY) | closed |
| T-41-35 | D | sanitizing gate baseline breaking --live | medium | mitigate | jq deletes passphrase entries only, mode kept; SPEC_DELTA ok right after (RB:1570-1582) | closed |
| T-41-SC | T | npm/pip/cargo installs | high | mitigate | No manifest change (`239e06da..HEAD`), `openbao/openbao:2.7.1` pinned, installer files `cmp`-equal to checkout | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-41-01 | T-41-33 | DO VM snapshots and Gluster backups may hold legacy key copies until they expire; Transit ciphertext in them is unusable after rotation + `min_decryption_version` = 2. REQUIREMENTS.md:60 (Out of Scope); KEYMIG-04 retest is future | operator | 2026-10-09 |
| AR-41-02 | T-41-27 | Up to two operator userpass tokens from the failed 41-06 login attempts were not revoked (RB:1359-1366). Time-bounded: they expire by their 4 h `explicit_max_ttl`, no later than 22:48Z 2026-10-20. Early close if wanted: `auth/token/accessors` + `auth/token/revoke-accessor` (granted by `operator.hcl:151-155`) | operator | 2026-10-20 |

*Accepted risks do not resurface in future audit runs.*

Open review findings sitting inside closed threats (tracked in 41-REVIEW-DISPOSITION.md, not new surface): WR-01 → T-41-02, WR-04 → T-41-17, WR-05/WR-06 → T-41-20, IN-07 → T-41-15, IN-09 → T-41-14.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-20 | 36 | 36 | 0 | gsd-security-auditor (35 closed, T-41-27 accepted time-bounded by operator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-20
