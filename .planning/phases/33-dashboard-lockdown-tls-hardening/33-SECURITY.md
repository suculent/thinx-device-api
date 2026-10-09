---
phase: "33"
slug: "dashboard-lockdown-tls-hardening"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-09"
---

# Phase 33 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (33-01/33-02/33-03 `<threat_model>` blocks, T-33-01..T-33-16 + T-33-SC). Mitigations verified at ASVS L1 grep depth against the committed artefacts (thinx-swarm `b04f066`, thinx-device-api `thinx-staging`), the runbook `.planning/runbooks/traefik-edge-hardening.md`, the redacted captures and the live read-only evidence in `33-VERIFICATION.md` (re-verified 2026-10-09 after the code-review fixes, 23/23). Auditor spawn short-circuited per workflow rule (threats_open 0, register authored at plan time, L1). No SUMMARY carried `## Threat Flags`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Internet -> Traefik :80/:443 | Untrusted HTTP(S); no router answers for the dashboard/API on any hostname after Stage A2; new default TLS option on :443 | Public web traffic, TLS termination |
| traefik-public overlay (16 services incl. 3 external stacks) -> Traefik task | Must not reach the mgmt listener; loopback bind is the control | None permitted to the API |
| Operator laptop -> ssh micro -> docker exec -> Traefik task loopback | The only path to the API/dashboard (D-02/D-03), via the `socat` bridge bound to 127.0.0.1 on the laptop | Unauthenticated API/dashboard (operator only) |
| Let's Encrypt -> Traefik :443 (acme-tls/1) | TLS-ALPN challenge rides the same entrypoint | ACME challenge |
| Stage E edit -> acme.json on the named volume | Private keys for 23 hosts; read once by Traefik, rewritten whole on save | Private keys (never leave micro) |
| Committed thinx-swarm / docker-swarm.yml / captures / runbook / AGENTS.md -> readers | Secret hygiene (P29 D-12) | Redacted config only; D-04 result as two words |
| https entrypoint default middleware -> every router incl. external stacks and the WS upgrade | Headers injected into third-party responses; 101 must pass untouched | Response headers |
| Legacy device -> direct :7442 / plain MQTT :1883 | Outside Traefik; must stay untouched (AGENTS.md) | Device check-in, OTT, firmware, MQTT (plaintext by operator decision) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-33-01 | Information Disclosure / Elevation of Privilege | Traefik API/dashboard reachable from overlay, host or internet | high | mitigate | `--entrypoints.mgmt.address=127.0.0.1:8080` in thinx-swarm `traefik.yml` (2 hits incl. comment); `api.insecure` appears only in a "Never --api.insecure" comment (traefik.yml:150, mirror:152). VERIFICATION SC1: in-task bind 127.0.0.1 only, overlay probe CLOSED (:80 control OPEN), host/laptop curl rc=7, nmap 8080/8443 closed, `/api/overview` never JSON on 17 hosts | closed |
| T-33-02 | Denial of Service | Shared middlewares dropped if the traefik-public port label is removed | high | mitigate | `traefik.http.services.traefik-public.loadbalancer.server.port=8080` kept (traefik.yml:64, LOAD-BEARING comment); live overview 29 routers / 0 errors / 6 middlewares; HTTPS matrix 17/17 == baseline | closed |
| T-33-03 | Tampering (routing) | Phantom `Host(traefik-traefik)` router on every entrypoint | medium | mitigate | 3 `traefik.http.routers.traefik-mgmt` labels in traefik.yml; no `traefik-traefik@swarm` router in the verified inventory (29 names == `routers_post_A2:`) | closed |
| T-33-04 | Information Disclosure | Password / apr1 hash exposed during the D-04 comparison or in docs | high | mitigate | Runbook records only `HASH-LITERAL=NO-MATCH` / `PASSWORD=NO-MATCH` (lines 190-191); 0 hash/key markers in the runbook and traefik.sh; traefik.sh exports scrubbed (only a comment names the removed variables) | closed |
| T-33-05 | Denial of Service | downtime/errorpage catch-alls vanish if both network-label families coexist | medium | mitigate | One `--label-rm` + `--label-add` update per service (Stage D-08 record); committed downtime.yml/errorpage.yml carry only `traefik.swarm.network`; bare-IP 301/200 verified; operator attested in UAT test 1 (2026-10-09) | closed |
| T-33-06 | Denial of Service | transformer/worker restart from `--container-label-rm` | low | accept | Accepted: not edge services, one Running task each verified after; see Accepted Risks AR-33-01 | closed |
| T-33-07 | Denial of Service | Cipher/curve misconfiguration breaking device or browser handshakes | high | mitigate | tls.toml `minVersion = "VersionTLS12"`, six ECDHE AEAD suites, `curvePreferences = ["X25519","CurveP256"]`; VERIFICATION SC2: TLS 1.2+1.3 handshakes OK on rtm/app/console, device-flow harness PASS over HTTPS and :7442 | closed |
| T-33-08 | Denial of Service (future) | TLS-ALPN renewals silently broken by an `alpnProtocols` edit | high | mitigate | No `alpnProtocols` key in tls.toml (grep 0); Stage E forced reissue of `influx.thinx.cloud` via TLS-ALPN succeeded after Stage C (new LE serial, notAfter 2027-01-07) | closed |
| T-33-09 | Tampering | acme.json edit lost or corrupted under the running Traefik | high | mitigate | jq to temp + `jq -e` count + `chmod 600` + atomic `mv` + `--force` in one remote command (runbook line 93, Stage E record); store verified 23 entries, 600 root, 0 ACME failure lines on the new task | closed |
| T-33-10 | Information Disclosure | Private keys / e-mail leaving micro via snapshot, backups or runbook | high | mitigate | Snapshot `/mnt/data/edge-rollback/traefik-p33-acme-20261009T085846Z/` (700/600 root, umask 077, path-only reference); `--args` backups written with umask 077 + chmod 600 (runbook lines 200, 357, 436); 0 e-mail and 0 key markers in every committed doc | closed |
| T-33-11 | Denial of Service / Tampering | HSTS injection breaking WS upgrade or external stack responses | medium | mitigate | VERIFICATION truth 18: WS upgrade 101 with 0 STS lines; HSTS exactly 1 on 17/17 hosts; HTTPS matrix codes unchanged incl. external stacks; D-31 console live update confirmed by operator | closed |
| T-33-12 | Information Disclosure | X25519MLKEM768 PQ hybrid dropped by explicit curvePreferences | low | accept | Accepted: explicit, scannable curve policy (D-14); recorded for Phase 34; see AR-33-02 | closed |
| T-33-13 | Information Disclosure | Secrets in E.post.yml, scan capture, runbook, AGENTS.md or README | high | mitigate | Secret-marker and e-mail greps = 0 on E.pre.yml, E.post.yml, traefik-edge-scan.2026-10-08.md, traefik-edge-hardening.md and thinx-swarm README (2026-10-09); four tracked `traefik.yml.bak.*` with the dead pilot token removed (review WR-01, thinx-swarm `d156e79`) | closed |
| T-33-14 | Denial of Service (console) | Console live updates broken despite a green automated bundle | medium | mitigate | Blocking-human D-31 gate passed (runbook line 852, operator approval 2026-10-09 ≈10:05 UTC); ordered revert set documented in the hand-off section | closed |
| T-33-15 | Elevation of Privilege | Laptop socat bridge bound beyond 127.0.0.1 or left listening | low | mitigate | Documented recipe binds `bind=127.0.0.1` (AGENTS.md, thinx-swarm README); the operator `traefik` shell function also binds 127.0.0.1 and runs the bridge in the background with a `traefik-stop` companion and a pidfile (deviation from "foreground-only", same loopback control); task-side listener is loopback-only regardless | closed |
| T-33-16 | Information Disclosure | External scan sending results to a third party | low | mitigate | `scripts/traefik-edge-scan.sh` uses local nmap/sslscan/curl/openssl only; no third-party URL in the script (grep); prints header names, port states and fixed values | closed |
| T-33-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package manifest changed in the phase range (`b1351512..HEAD`); only already-present images used (`traefik:v3.7.14`, `alpine:3.20`); `tls-config-2` created from the git-tracked file and hash-compared (in-task sha == committed `bb0cba95…`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-33-01 | T-33-06 | transformer/worker are build-pipeline services, not edge services; one restart each when the dead v1 `noexpose` container labels were removed; builds re-queue; no SLA item in this phase | plan-time disposition (33-01), executed and verified | 2026-10-09 |
| AR-33-02 | T-33-12 | Explicit `curvePreferences = ["X25519","CurveP256"]` chosen for a scannable policy; drops the X25519MLKEM768 hybrid Go would otherwise offer. Phase 34 may omit the key to restore it | plan-time disposition (33-02, D-14 discretion), recorded in the Stage C record and scan capture | 2026-10-09 |

*Accepted risks do not resurface in future audit runs.*

**Recorded out-of-scope security follow-ups (Phase 34, runbook `## Recorded for Phase 34`):** rotate the couch-auth / influx-auth credential pair (review WR-02); define `security-headers` in the file provider (WR-03); stop `couch-auth` challenging on plaintext :80 for `thinx-db-http` (WR-04); `vault:1.5.5` pin / delete `vault.yml` (WR-05 leftovers); remove the untracked `traefik.yml.bak.20261007120354.pre-p30-pilot` on micro (dead pilot token); public-IP port probes and the pre-existing external `:8883` MQTTS refusal (UAT test 2); `ipAllowList` with the operator-supplied IPs once real client IPs are restored. These are not Phase 33 threats and do not count toward `threats_open`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 17 | 17 | 0 | /gsd-secure-phase 33 (orchestrator, L1 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
