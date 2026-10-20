---
phase: "40"
slug: "transit-encrypted-deploy-keys-in-the-api"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-19"
---

# Phase 40 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| API ↔ OpenBao (`openbao.internal:8200`) | AppRole login and Transit encrypt/decrypt over TLS pinned to `BAO_CACERT` | AppRole credentials, client token, deploy-key plaintext and `vault:vN:` ciphertext (critical) |
| API ↔ `ssh_keys` volume (GlusterFS) | Key files read and written by the API; the worker can also write there | Transit ciphertext, legacy passphrase-encrypted PEM, public keys |
| API ↔ per-attempt `ssh-agent` | Decrypted PEM piped to `ssh-add -` over stdin; socket in a 0700 mkdtemp dir | Plaintext private key (memory only) |
| API ↔ git remote (GitHub over ssh) | Keyed clone/pull using the agent or the legacy askpass | Repository contents; ssh authentication |
| Browser ↔ API (via Traefik) | Deploy-key create, list and refusal responses | Fixed error codes and console sentences only |
| CI ↔ dev OpenBao | Ephemeral dev server in `docker-compose.test.yml` and CircleCI | Labelled throwaway root token and test AppRole |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-40-01 | Information Disclosure | transit.js logs, TransitError, Slack text | high | mitigate | One fixed log format; `TransitError` message is `transit_<reason>`; Slack carries host/time/reason; SecretsSweepSpec `:874-1060` | closed |
| T-40-02 | Spoofing | API→OpenBao TLS | high | mitigate | https only, CA from `BAO_CACERT` only, `rejectUnauthorized: true`, servername (transit.js:130-171); TransitSpec N2/N3 | closed |
| T-40-03 | Denial of Service | OpenBao hang/outage | medium | mitigate | `AbortSignal.timeout`, ≤4 requests per key, unref'd boot probe; WR-02 (b4267e12) skips remaining Transit keys after an outage | closed |
| T-40-04 | Information Disclosure | CI throwaway values in docker-compose.test.yml | low | accept | See accepted risks AR-40-01 | closed |
| T-40-05 | Repudiation | alert loss or storm | medium | mitigate | One FAILING + one RECOVERED per incident, bad_ciphertext excluded (transit.js:315-329); TransitSpec A1/A2 | closed |
| T-40-06 | Information Disclosure | private key at rest and in transit to ssh | critical | mitigate | Only `vault:vN:` written `wx`/0600 (rsakey.js:615-657); PEM to `ssh-add -` stdin, buffer zeroed (git.js:234-261, 400-436); live: 1 vault line, 0 PEM | closed |
| T-40-07 | Information Disclosure | passphrase in a Transit attempt | high | mitigate | `agentEnv` deletes SSH_ASKPASS, SSH_ASKPASS_REQUIRE, GIT_KEY_PASSPHRASE (git.js:378-380); BatchMode, publickey only | closed |
| T-40-08 | Elevation of Privilege | inherited agent from container env | medium | mitigate | `baseEnv` deletes SSH_AUTH_SOCK/SSH_AGENT_PID (git.js:362-363); GitSpec T6 | closed |
| T-40-09 | Tampering | cross-owner ciphertext swap on the volume | medium | accept | See accepted risks AR-40-02 | closed |
| T-40-10 | Information Disclosure | agent socket reachable by local users | low | mitigate | mkdtemp 0700, `-t 1260`, removed in finally (git.js:406-455); E1, GitSpec T5; live 0 agent dirs | closed |
| T-40-11 | Denial of Service | malformed/huge/non-regular/symlinked key file | medium | mitigate | `readKey` 64 KiB cap, `O_RDONLY\|O_NONBLOCK` (CR-01 6b2081e6), fstat regular-file check, never throws (keyformat.js:19-85) | closed |
| T-40-12 | Information Disclosure | build log and API log text | medium | mitigate | Fixed `unavailableSentence` map (builder.js:1015-1019); name + reason class only; WR-01 `cause` is a fixed code, never stderr | closed |
| T-40-13 | Information Disclosure | rsakey/GitHub-link error responses, console text | medium | mitigate | 503 `{success,response}` only (router.rsakey.js:25-27, github_link.js:116-118); fixed console sentence; live UAT 5 | closed |
| T-40-14 | EoP / Tampering | kill switch or outage → weaker key | high | mitigate | Switch is first in `create()` (rsakey.js:676-679); no passphrase branch; KS3; SecretsSweepSpec:837; live UAT 5 | closed |
| T-40-15 | Denial of Service | claim files left on refusal | low | mitigate | Refusal before `reserveIdentifier`; Transit failure releases the claim (rsakey.js:676-710); KS2/KS3 | closed |
| T-40-16 | Tampering | wiring gate relaxed too far | high | mitigate | Only the two Phase 39 scope checks retired; 17/17 self-test mutations refused | closed |
| T-40-17 | Elevation of Privilege | kill-switch name colliding with the OpenBao env guard | medium | mitigate | `THINX_DEPLOY_KEYGEN` has no BAO_/VAULT_ prefix; `keygen-renamed-bao` mutation refused | closed |
| T-40-18 | Information Disclosure | runbook content | medium | mitigate | §11 holds names, paths, classes, recipes; grep: 0 ciphertext, token, CI-throwaway or PEM shapes | closed |
| T-40-19 | Elevation of Privilege | untested code reaching production | high | mitigate | thinx-unit first (#16121), cut-over SHA differs only in `.planning`, operator go; `api-registry` requires `test` | closed |
| T-40-20 | Denial of Service | cut-over breaking builds, :7442, MQTT, edge | high | mitigate | Pre/post gates recorded (runbook :921-963); legacy path byte-identical to b208f02f; UAT 3/4 builds | closed |
| T-40-21 | Repudiation | what was deployed when | low | mitigate | Evidence entries with SHAs, jobs, task ids, node, timestamps (runbook :871-977) | closed |
| T-40-22 | Information Disclosure | commands and evidence on production | high | mitigate | Counts/modes/verdicts only; wiring gate OUTPUT_CLEAN scan; evidence log clean | closed |
| T-40-23 | Tampering | stack deploy / restart.sh dropping live-only mounts | high | mitigate | No stack deploy or restart.sh; live spec still has 13 secrets and the CA mount after the UAT 5 env-add updates | closed |
| T-40-SC | Tampering | npm/pip/cargo installs (all five plans) | high | mitigate | package.json/lock unchanged b208f02f..HEAD; no Dockerfile change; ssh-agent from the existing base image | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-40-01 | T-40-04 | The dev OpenBao root token and test AppRole in `docker-compose.test.yml` / `scripts/openbao-dev.sh` are labelled CI throwaways for an ephemeral instance (same precedent as `thinx-ci-influx-token`); production credentials come only from swarm secrets. CI never prints the openbao log. Residual (review IN-07): during laptop runs `ports: - '8200'` publishes that dev server, with its known root token, on every host interface; it holds no production data. | Plan 40-01 threat model (40-01-PLAN.md:303, 40-01-SUMMARY.md:215); verified by gsd-security-auditor | 2026-10-19 |
| AR-40-02 | T-40-09 | Anyone able to write `ssh_keys` can copy owner A's ciphertext under owner B's name, since Transit is called without a per-owner context. Same exposure as the legacy single shared passphrase; writing the volume already needs worker or docker.sock-level access. | Plan 40-02 threat model (40-02-PLAN.md:339, 40-02-SUMMARY.md:51, 40-RESEARCH.md:466 Open Question 1) | 2026-10-19 |

*Accepted risks do not resurface in future audit runs.*

### Residuals tracked (non-blocking, from the audit)

1. T-40-12: `git.js:801` logs `e.message` for a non-coded error in `transitAttempt`. Unreachable today (`withAgent` throws only coded errors, `cloneHoldingLock` never rejects); harden to a fixed token.
2. T-40-11 (pre-existing, review IN-11): `.pub` reads/writes in `rsakey.js` (list, rename, generate) still use blocking `readFileSync`/`writeFileSync`; a FIFO `.pub` could freeze the API. Requires volume write access.
3. T-40-06 (review IN-02/IN-03): memory-only copies (response chunks, generateKeyPair string, stringified legacy file) are not wiped. Nothing reaches disk.
4. T-40-03/T-40-05 (review IN-10/IN-05): a login `server_error` is retried per key; a decrypt 400 is `bad_ciphertext` and never alerts. Revisit before the Phase 41 key rotation (ciphertext below `min_decryption_version`).
5. Review IN-13: over ssh, host-key and network failures are labelled `repo_not_found_or_no_access`. StrictHostKeyChecking still refuses the connection; only the label is wrong.
6. Doc drift: the live spec now carries `THINX_DEPLOY_KEYGEN=enabled` (left by the UAT 5 re-enable); runbook §11 (openbao.md:370) says the live spec has no entry. Not drift for the `--live` gate, which ignores the entry.
7. Out of register: a1f9176c removed the process-wide `umask(0o766)`, so the declared 0700/0600 modes (T-40-06, T-40-10) now apply as created.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-19 | 24 | 24 | 0 | gsd-security-auditor (ASVS L1, block_on high; parent c4fed672, thinx-swarm 8cfa7dd; 267 jasmine specs + 46 node tests green) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-19
