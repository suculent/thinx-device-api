---
phase: "28"
slug: "swarmpit-upgrade-trim"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-05"
---

# Phase 28 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Operator Mac → swarm manager (ssh) | Ops commands run over ssh against micro/core | Commands, aggregate outputs (counts, digests, timestamps) |
| Swarm → public git (thinx-staging) | Evidence, runbooks and snapshots committed and pushed | Redacted stack snapshots, Annex tokens; never credentials, dumps or host/key/port |
| swarmpit_db → /root/phase28 | D-07 dump of the database holding registry credentials | Registry credentials (high sensitivity), kept root-only and shredded at close |
| CircleCI → private registry → Swarmpit | Gate pushes build and redeploy thinx_api | Image digests |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-28-01 | Information disclosure | swarmpit_db dump (registry creds) | high | mitigate | umask 077, dir 700/file 600, never committed, shredded at close (Annex "step 0", "shred") | closed |
| T-28-02 | Information disclosure | Host, key, port in pushed docs | medium | mitigate | MICRO_SSH/CORE_SSH placeholders; RUNBOOK-OK / DIFF-HYGIENE-OK; only hit is accepted A-28-01-1 | closed |
| T-28-03 | Tampering | Unintended code deployed by gate pushes | medium | mitigate | `.planning/`-only diff over c5d5be46..HEAD; DIFF-HYGIENE-OK per gate | closed |
| T-28-04 | Denial of service | Baseline mistaken for healthy pipeline | low | mitigate | Gate 0 measured on 1.9 (`p28_gate0=PASS`, 32 s) | closed |
| T-28-05 | Tampering | awk edit cutting into db/agent block | high | mitigate | Pre-mv checks; 25 removed/0 added; db/agent block hashes identical across all snapshots | closed |
| T-28-06 | Denial of service | Autoredeploy broken by trim | high | mitigate | Gate A 31 s; § Rollback A; 05:45 UTC clock rule | closed |
| T-28-07 | Denial of service | Deleting influxdb.conf while mounted | medium | mitigate | Union mount scan (21 services, 0 refs) before exact-path delete | closed |
| T-28-08 | Information disclosure | Secrets in committed snapshots | medium | mitigate | 0 secret-pattern matches in swarm-configs/; couchdb-logging.ini never copied | closed |
| T-28-09 | Tampering | swarmpit_db rescheduled onto stale volume | high | mitigate | db block unchanged; `--resolve-image changed`; db task/digest/rows unchanged | closed |
| T-28-10 | Denial of service | 1.10 HEALTHCHECK restart loop | high | mitigate | Healthcheck override (start_period 300s) under compose 3.8; 10-min hold, 0 restarts | closed |
| T-28-11 | Tampering | swarmpit_db changed by 1.10 | high | mitigate | SWARMPIT-DB-UNTOUCHED: 7 docs hash-equal to dump, 0 migration lines | closed |
| T-28-12 | Denial of service | Autoredeploy broken on 1.10 | high | mitigate | Gate B 50 s; § Rollback B with hash-verified B.pre source | closed |
| T-28-13 | Information disclosure | 1.10 ERROR logs with headers/bodies | medium | mitigate | Counts-only output hygiene; no raw log lines in SUMMARYs/Annex | closed |
| T-28-14 | Tampering | Agent/couchdb drift during deploy | medium | mitigate | `--resolve-image changed` only; db/agent digests equal Step 0 | closed |
| T-28-15 | Elevation of privilege | New image with Docker socket access | low | accept | Socket mount stays `:ro`, tag pinned, digest recorded | closed |
| T-28-16 | Tampering | Removing the wrong volume | high | mitigate | Exact-name removal, no prune; db_vol=1 on both nodes afterwards | closed |
| T-28-17 | Information disclosure | Dump lingering on micro | medium | mitigate | `shred -u` on 4 files, `rmdir`; `/root/phase28` absent | closed |
| T-28-18 | Repudiation | One-way removal without record | low | mitigate | Name/node/CreatedAt/size recorded for micro and core; all commits signed | closed |
| T-28-19 | Information disclosure | Manager endpoint in updated runbooks | medium | mitigate | swarm.md uses `ssh micro` alias only; skill file untracked | closed |
| T-28-SC | Tampering | Package installs | low | accept | No manifests or lockfiles changed | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-28-01 | T-28-15 | Official swarmpit image keeps the read-only Docker socket mount; tag pinned and index digest recorded | plan 28-03 | 2026-10-05 |
| AR-28-02 | T-28-SC | Ops-only phase; no packages installed | plans 28-01..04 | 2026-10-05 |
| AR-28-03 | T-28-02 (A-28-01-1) | 28-CONTEXT.md D-15 quotes the manager ssh line already published in tracked AGENTS.md; not a new disclosure | operator | 2026-10-05 |

*Accepted risks do not resurface in future audit runs.*

### Informational notes (non-blocking)

- The hygiene scan will flag the 64-hex `covered_digest` in 28-VERIFICATION.md; it is a content hash, not a credential.
- `.claude/` is untracked but not gitignored; the local skill file contains the manager ssh line (also in AGENTS.md). Avoid `git add -A`.
- The DIFF-HYGIENE script derives only the manager host from AGENTS.md; the core IP was checked separately (0 hits).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-05 | 20 | 20 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-05
