---
phase: "29"
slug: "edge-reconciliation-source-of-truth"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-06"
---

# Phase 29 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all three PLAN.md carry a `<threat_model>`); ASVS L1, block_on=high.
> No auditor subagent was spawned — short-circuit rule (threats_open:0 + authored-at-plan-time + L1):
> L1 grep-depth verification is sufficient and was performed inline during execution.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| live `micro` → developer workstation / git | Resolved secrets (pilot token, basic-auth hash, ACME email, cert keys) exist live; capture must not carry them into git. | redacted config text, cert metadata |
| developer workstation → git (thinx-device-api) | The committed mirror + snapshots must be templated/redacted — this repo is less private than thinx-swarm (D-12). | generated mirror, snapshots, inventory, docs |
| live running task → on-disk thinx-swarm file | Disagreements are DRIFT to flag (D-08), not values to silently overwrite into git. | config flags, labels, ports |
| generated mirror → downstream phases (P30–P34) | A hand-edited "read-only" mirror would silently re-introduce drift — the exact failure this phase prevents. | banner-stamped mirror |
| resolved rollback snapshot → git | The resolved snapshot (real secrets, raw acme.json keys) must stay out-of-git on `micro` at 600, never committed (D-11). | acme.json, resolved edge |
| reconciliation edit → Phase-30 rollback baseline | Any opportunistic "fix" makes the baseline ≠ production and weakens the rollback guarantee (D-05/D-06). | thinx-swarm config |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-29-01 | Information Disclosure | `scripts/generate-traefik-mirror.js` mirror output | high | mitigate | Generator masks inline secrets to `<redacted>`, keeps `${USERNAME}/${HASHED_PASSWORD}/${EMAIL}/${DOMAIN}/${CONFIG}` templated. Verified: `grep -c 095c70c4` = 0 in the committed mirror (D-10/D-12). | closed |
| T-29-02 | Tampering | `docker-compose.traefik.yml` (read-only mirror) | medium | mitigate | GENERATED banner + `mirror-sha256` body hash; `check-traefik-mirror.js` returns `MIRROR-EDITED` on hand-edit; CI staleness step enforces. Verified: tamper test → `MIRROR-EDITED` exit 1, restore → exit 0 (D-02/D-03). | closed |
| T-29-03 | Information Disclosure | `traefik-edge.A.pre/.post.yml` + ACME inventory | high | mitigate | README redaction rule (secrets → `<redacted>`); inventory carries domain/resolver/issuer/expiry only. Verified: `grep -Ec '095c70c4\|$apr1$\|$2[aby]$'` = 0 in snapshots; `grep -c BEGIN` = 0 in inventory (D-10). | closed |
| T-29-04 | Tampering | thinx-swarm reconciliation (integrity of committed SoT) | medium | mitigate | Reconciliation only equalizes committed→live; running-vs-file drift flagged as `# DRIFT:`/`documented`, never silently written; regenerate + staleness check proves the mirror matches the new SHA. Verified: `check-traefik-mirror.js --swarm-repo` exit 0 at `eb94be5b`; warts-preserved grep passes (D-08). | closed |
| T-29-05 | Repudiation / Information Disclosure | read-only capture over SSH to `micro` | low | accept | Read-only `docker inspect` / `docker config inspect` / `jq`; no production state change; operator-owned host + key. Below block_on (high); accepted. | closed |
| T-29-06 | Information Disclosure | out-of-git rollback snapshot + raw acme.json on `micro` | high | mitigate | Stored only out-of-git at mode 600 (dir 700, root-owned) on `micro`; never scp'd into any repo; committed `.post.yml` redacted. Verified: `stat` → `700 root` dir, `600 root` acme.json + resolved-snapshot.yml; neither repo tracks `edge-rollback` (D-11/D-10). | closed |
| T-29-07 | Information Disclosure | committed docs (swarm.md, fix-forward, diff, .post) | medium | mitigate | Docs name the pilot token as a deferred item only, never the resolved value; no resolved `${...}` env values in committed docs. Verified: `grep -c 095c70c4` = 0 across swarm.md, traefik-edge-fixforward.md, diff report (D-12/D-06). | closed |
| T-29-SC | Tampering | npm/pip/cargo installs (supply chain) | high | accept | No package-manager installs in this phase; both new scripts use only Node stdlib (`fs`, `path`, `crypto`, `child_process` for `git`). No new dependency to vet. Accepted. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-29-01 | T-29-05 | Read-only `docker inspect` / `jq` over SSH makes no production state change; `micro` host and key are operator-owned. Severity low, below the high block threshold. | matej | 2026-10-06 |
| AR-29-02 | T-29-SC | Phase introduces no package-manager installs; the two new scripts are Node-stdlib-only, so there is no new dependency to vet. | matej | 2026-10-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-06 | 8 | 8 | 0 | /gsd-secure-phase (L1, inline grep-depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-06
