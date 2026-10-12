---
phase: "31"
slug: "v2-v3-upgrade-backward-compat-mode"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-08"
---

# Phase 31 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (31-01/31-02/31-03 `<threat_model>` blocks); mitigations verified against the executed artifacts (SUMMARYs, runbook §Live cutover record, 31-VERIFICATION.md) and the read-only live inspection recorded there. ASVS L1 grep-depth; auditor spawn short-circuited per workflow rule (threats_open 0, register authored at plan time, L1).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Internet -> Traefik edge (:80/:443) | Untrusted HTTP(S); routing + middleware applied under the v3 swarm provider | Public web traffic, TLS termination, Let's Encrypt cert store |
| Traefik -> Docker swarm API (docker.sock:ro) | Traefik reads swarm-service deploy labels for discovery | Service labels / router config (read-only socket) |
| Legacy device -> direct :7442 / plain MQTT (:1883/:8883) | Bypasses Traefik entirely (thinx_api / thinx_mosquitto publish directly) | Device check-in, OTT, firmware, MQTT status (plaintext by operator decision 2026-10-04) |
| Throwaway v3 probe <-> shared acme.json volume | Dual-ACME hazard boundary (D-01a) | ACME account + 24 certificates |
| Out-of-git snapshot on micro <-> git | Real resolved secrets stay 600-root on micro, never committed/scp'd | acme.json, resolved static config, full service spec |
| Committed repo artifacts -> operators | Secret hygiene (P29 D-12); runbook + C.pre/C.post captures carry no key material | Redacted config captures |
| v3 cutover vs live edge | One-way-door mutation; recoverable only via the staged D-02 rollback | Production edge availability |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-31-01 | Tampering/Spoofing | thinx_api/console/vue routers (middleware refs) | high | mitigate | All 3 `@docker` refs renamed to `@swarm` in `docker-swarm.yml` (31-01 `1fe2b791`); boot-and-discover probe showed exactly those 3 routers disabled pre-hop (designed detection); post-B2 live filter printed nothing at 2026-10-07T22:07:57Z | closed |
| T-31-02 | Tampering/DoS | throwaway v3 probe vs shared acme.json | high | mitigate | Probe ran with no host ports, ACME storage at a /tmp throwaway path, LE staging CA; production acme.json `301146 1791377596 600 root` unchanged before/after; probe torn down (runbook §Boot-and-discover) | closed |
| T-31-05 | Tampering | traefik.docker.network labels on multi-network services | medium | mitigate | Renamed to `traefik.swarm.network` in committed source; live: all 16 services `docker.network=0 swarm.network=1`; backends on traefik-public 10.0.1.0/24 (31-VERIFICATION) | closed |
| T-31-07 | Tampering | stale thinx-swarm/thinx.yml missing live routers/refs | high | mitigate | Authoritative source resolved to `docker-swarm.yml` (0 traefik-label diff vs gluster deploy copy, 31-01 Task 1); complete rename set applied there; full router set asserted enabled live post-B2 (30 routers / 0 errors) | closed |
| T-31-03 | Denial of Service | acme.json on rollback | high | mitigate | Out-of-git 600-root snapshot `/mnt/data/edge-rollback/traefik-2026-10-07/acme.json` (cmp-identical, 24 certs) + full-spec backup; rollback Step 1 restores it BEFORE the retag; dry-verified 31-02 | closed |
| T-31-06 | Information disclosure | committed .C.pre.yml + runbook | medium | mitigate | Redaction done on micro before output read; 0 `$apr1$`/bcrypt/PEM markers in C.pre, C.post, runbook, both compose files; only e-mail literal is `rollback-dryrun@example.invalid`; snapshot referenced by path only (code review + verifier re-checked) | closed |
| T-31-08 | Tampering/Spoofing | live thinx_api/console/vue routers (@swarm refs) | high | mitigate | B2 label updates landed 10 s after B1; `thinx-api-https`/`-ws`/`thinx-console-https` enabled with `@swarm` chains; HSTS/nosniff/frame-deny visible on rtm + console; WS probe 200 (31-03 SUMMARY, 31-VERIFICATION) | closed |
| T-31-09 | Denial of Service | acme.json / :443 cert continuity through the cutover | high | mitigate | acme.json carried on the named volume; cert serial `051152D5…` unchanged post-hop, `checkend 0` valid; v3 single start-up rewrite kept 24/24 cert + key blobs identical to snapshot; no re-challenge | closed |
| T-31-04 | Denial of Service (legacy devices) | :7442 + plain MQTT | high | mitigate | Direct-publish model untouched (thinx_api 7442, mosquitto 1883/1884/8883); traefik publishes :80/:443 only; device-flow harness PASS over :7442+:1883 post-cutover; operator approved Task 3 gate 2026-10-08 | closed |
| T-31-10 | Tampering | backend network selection under swarm provider | medium | mitigate | `traefik.swarm.network=traefik-public` on all 16 services; every probed host 200 post-cutover; the dual-label skip (both families) was the real failure mode, fixed by Stage C within 2 min and recorded with CORRECTION markers | closed |
| T-31-SC | Tampering (supply chain) | traefik:v3.7.14 image pull / v2.11 rollback image | high | mitigate | Official `traefik:v3.7.14` exact tag pre-pulled (digest `sha256:e849695b…`); rollback target named by the running DIGEST `d57faa4f…` present locally (no registry pull in the recovery path) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks. (Related operational notes, not threats of this phase: `:7442`/plain MQTT stay plaintext by standing operator decision 2026-10-04; gluster `thinx.yml` lacks the committed `secrets:` block — tracked in deferred-items.)

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 11 | 11 | 0 | gsd-secure-phase (orchestrator, ASVS L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08
