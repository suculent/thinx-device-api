---
phase: 39-internal-openbao-on-the-swarm
plan: 06
subsystem: infra
tags: [openbao, swarm, approle, tls, docker-secrets, docker-configs, trust-consumer, production]
status: complete

requires:
  - phase: 39-05
    provides: "production vault_openbao on seal-g2, unattached BAO_ROLE_ID/BAO_SECRET_ID secrets, disarmed API trust consumer, maintenance plane"
provides:
  - "thinx_api on the openbao-internal overlay with BAO_ROLE_ID/BAO_SECRET_ID at /run/secrets, the CA bundle at /run/openbao/ca.pem and BAO_ADDR/BAO_CACERT, from one targeted service update"
  - "Recurring API trust consumer armed and exercised once (expired-predecessor issuer renewal) against the actual API task"
  - "tests/openbao-api-wiring.test.sh (--source / --self-test / --live) and openbao-verify.sh --api-service"
  - "Phase 39 final gate matrix in .planning/runbooks/openbao.md"
affects: [40-transit-encrypted-deploy-keys, 41-key-migration]

tech-stack:
  added: []
  patterns:
    - "Versioned immutable Docker config openbao-ca-<sha256[0:20]> as the API trust anchor; the source YAML records the name the consumer reports"
    - "Spec-delta proof: normalized live spec (Env/Secrets/Configs/Networks sorted, ForceUpdate dropped) == 0600 pre-update backup + exactly the OpenBao additions"
    - "In-task probes over `docker exec -i <task> node -` with the script on stdin; output booleans/status codes only, then a secret-shape scan of the output"

key-files:
  created:
    - ../../thinx-swarm/tests/openbao-api-wiring.test.sh
  modified:
    - ../../thinx-swarm/thinx.yml
    - ../../thinx-swarm/scripts/openbao-verify.sh
    - docker-swarm.yml
    - .planning/runbooks/openbao.md

key-decisions:
  - "CA config mode left at the Docker default (0444) instead of `mode: 0444` in YAML: yq/YAML 1.2 reads 0444 as decimal 444"
  - "Source YAMLs pin the config the consumer deployed (openbao-ca-a2b56707515146d7a580); the live test fails SOURCE_CONFIG_DRIFT until the source follows a future swap"
  - "The authenticated owner-path WebSocket gate is an operator row: any x-thx-core value gets 101, so only a socket held open proves a session"
  - "Parent repo not pushed (orchestrator constraint); the API image is unchanged, so no CI build was needed before the live update"

requirements-completed: [VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08]

duration: 33min
completed: 2026-10-18

actuals:
  tokens: 15710
  tasks: 3
  commits: 3
plan_head_before: b6d5c0f101db4cf102f6699d94f444f42494ce9c
plan_head_after: 302a69da33af11cb9c20b9f9ee1929e3e4b2502c
swarm_commits: 2
swarm_head_before: 4793e2e3fed2838c6af42ea5844f4c26c652cf31
swarm_head_after: 5897b8b53502828a39182abb9861bc2d52cde54e
---

# Phase 39 Plan 06: API attachment to internal OpenBao and Phase 39 final gate Summary

**One targeted `docker service update` attached `thinx_api` to OpenBao (internal overlay, two AppRole swarm
secrets, a versioned CA config, `BAO_ADDR`/`BAO_CACERT`) from a 0600 node-local spec backup. Inside the actual API task,
`readSecret()` loads both AppRole values, TLS verifies only with the mounted CA, and a random Transit canary
round-trips. The trust consumer then ran a live issuer renewal with an expired predecessor. Traefik's router inventory
is byte-identical to the pre-phase baseline.**

`actuals.tokens` is chars/4 over this plan's diff (parent added lines + thinx-swarm changed lines). `commits` counts
parent commits measured from the ledger; the two thinx-swarm commits are listed separately.

## Tasks

| Task | Result | Commits |
|---|---|---|
| 1. API deployment contract | `--source` API-WIRING-OK (25 rows), `--self-test` 14/14 mutations refused; verify.sh fixture suites 2/5/14 pass | swarm `f179df3`; parent `6f94f286` |
| 2. Targeted thinx_api update + live proof + trust consumer | update 19:38:56Z -> 19:39:17Z; `--live` OK; armed; `--exercise-expired-predecessor` OK; `--verify-api-trust-consumer` OK | swarm `5897b8b`; parent `a6df0574` |
| 3. Final regression, scope and evidence gate | verifiers, edge gate, scope and gitleaks green; three operator rows open | parent `302a69da` |

## Live end state (2026-10-18 ~19:56Z)

- `thinx_api` 1/1 on micro, task `v91bcumsz5bx`, Version.Index 38382842. Spec = `thinx-api-pre-openbao-20261018T193726Z.json`
  (0600 root in `/var/lib/openbao-maintenance/rollback/api-service`, 0700 root, ext4) + exactly: `openbao-internal`,
  `BAO_ROLE_ID`, `BAO_SECRET_ID`, `openbao-ca-a2b56707515146d7a580` at `/run/openbao/ca.pem`,
  `BAO_ADDR=https://openbao.internal:8200`, `BAO_CACERT=/run/openbao/ca.pem`. `GIT_KEY_PASSPHRASE` is still mounted
  and set, and 7442 is still published.
- In the task: `readSecret()` file-first for both (not in env); verified TLS 200; no CA / same-subject foreign CA ->
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; bare IP -> `ERR_TLS_CERT_ALTNAME_INVALID`; a login against a foreign CA fails in the
  handshake; AppRole policies `["thinx-api"]`; encrypt/decrypt/rewrap/decrypt 200 and matched; 13/13 other operations
  403; unauthenticated encrypt 403.
- OpenBao: `vault_openbao` restarted at 19:48:29Z and auto-unsealed on seal-g2 without input. TLS `current ->
  r20261018T194151Z` under the renewed anchor (fp `DF76A2BC95EA8D89`, notAfter 2031-10-17); old anchor retired from API
  and server, kept as `ca.pem.retired-20261018T194154Z`. 12 identical snapshot pairs on micro/core (newest
  `openbao-20261018T194210Z-post-change`). Incidents all healthy.
- Edge: 29 http routers byte-identical to `preflight-pre/traefik-routers.txt` (`fa0afd608550e585`), 0 tcp, none for
  vault/openbao. `EDGE-EXPOSURE-OK`. traefik_traefik and socket-proxy UpdatedAt 06:47:26Z (untouched). rtm, CSRF token
  and app 200; 7442/1883/8883 open from the laptop; HTTP on :7442 200; WS diagnostic 0/4; WS 101 / 401; multitab 2/2;
  bare IP 301/200. 23 services.
- thinx-swarm `5897b8b` on laptop, origin and micro (micro's tracked tree clean).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `openbao-verify.sh` could not combine modes**
- **Found during:** Task 1
- **Issue:** the plan's gate `--full --maintenance --api-service thinx_api` was a usage error (single MODE;
  `--api-service` unimplemented, per the 39-02 handoff).
- **Fix:** `--maintenance` became a combinable modifier (standalone behaviour unchanged). `--api-service NAME` checks
  the API spec, the CA config content, the trust consumer and, for a local task, an in-task readSecret/AppRole/Transit
  probe. The bootstrap fixture suites that drive verify.sh still pass.
- **Files modified:** `../../thinx-swarm/scripts/openbao-verify.sh`
- **Commit:** swarm `f179df3`

**2. [Rule 1 - Bug] YAML octal mode ambiguity**
- **Found during:** Task 1
- **Issue:** `mode: 0444` parses as decimal 444 under YAML 1.2 (yq), and as octal under YAML 1.1.
- **Fix:** the explicit mode was dropped; the Docker default for configs is 0444. The live update passes `mode=0444`
  explicitly.
- **Commit:** swarm `f179df3`, parent `6f94f286`

**3. [Rule 3 - Blocking] Source config name after the exercise**
- **Found during:** Task 2
- **Issue:** the trust consumer swapped the live config to `openbao-ca-a2b56707515146d7a580`, so the source no longer
  named the live config.
- **Fix:** both YAMLs were re-pinned. The live test checks `SOURCE_CONFIG_MATCH`, and the runbook says to re-pin after
  every swap.
- **Commit:** swarm `5897b8b`, parent `a6df0574`

### Plan instructions not followed (orchestrator constraints)

- **Parent `thinx-staging` not pushed.** Task 2 said to push it and wait for CI. The orchestrator said not to push the
  parent repo. The API image did not change (spec-only update), so no CI build was needed before the live mutation.
  The parent commits stay local.
- **WS gate with real owner and session.** The plan's 401/101 gate needs the operator's owner id and a valid
  `x-thx-core` cookie. This executor has neither. It ran the established credential-free pair instead (cookie-less
  101, `foo=bar` 401 + `X-Forwarded-Proto`), plus the multitab check. Code reading shows that any `x-thx-core` value
  gets 101, so the plan's row only proves a session if the socket stays open. The operator script checks that.

### Incidents during execution (no change)

- Each thinx-swarm push to origin triggered the CI error/downtime rebuild: redeploys at 19:38:00/06Z and 19:47Z. Every
  edge gate ran after them.
- One gate run at about 19:50-19:51Z got empty answers on the last two WS rows only. There was no API restart and no
  Traefik 5xx in that window. The direct re-probe at 19:52:04Z and two full gate runs after it were green, so this is
  recorded as a transient.
- Run over ssh from the laptop, `openbao-cert-renew.sh` prints perl locale warnings because the laptop forwards
  `LANG=cs_CZ.UTF-8`. Cron has no such variable. Use `LC_ALL=C` by hand. Cosmetic only, no change made.

## Auth gates

None during execution. The operator rows below are planned human verification, not auth failures.

## Open items (operator)

Script: `/private/tmp/claude-502/-Users-sychram-Repositories-thinx-api-thinx-device-api/efb05f47-583d-4a57-ab53-901e306acc40/scratchpad/p06-operator-final-gates.sh`
(set -euo pipefail, `== N/3` steps, literal ssh, hidden prompts, temp files 0600 and removed on exit, re-runnable).

1. Privileged `verify --full ... --api-service thinx_api` with the operator password. It was last green at 18:41:17Z,
   before the g1 retirement. Expect `OPERATOR_TOKEN ok`, `KEY_FLAGS ok`, `POLICY_EXACT ok` x3,
   `APPROLE_THINX_API ok`, `RAFT_ONE_VOTER ok`, then `OPENBAO-VERIFY-OK mode=full+api`.
2. WebSocket on the real owner path. Expect `WS PLAN_GATE ok ...` (the plan's command verbatim) and
   `WS SESSION_HELD ok`.
3. Slack receipts of the three Plan 05 test incidents. Expect `SLACK RECEIPTS ok`.

Other follow-ups (not blocking):
- The archived `ca-cert` in the offline recovery image is stale after the issuer renewal. The CA key is unchanged, so
  refreshing it is optional (`openbao-bootstrap.sh emit ca-cert | ... add-artifact ca-cert`).
- The two retired Docker configs (`openbao-ca-46fa…`, `openbao-ca-a113…`) are kept on purpose for rollback.
- Each in-task probe leaves one AppRole token to expire (at most 20 min). The policy cannot revoke it.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, port or router. The new surfaces are the planned ones: the API is on the internal overlay,
and two secret files plus a public CA bundle are mounted in the API task.

## Self-Check: PASSED

- Files: `../../thinx-swarm/tests/openbao-api-wiring.test.sh`, `../../thinx-swarm/thinx.yml`,
  `../../thinx-swarm/scripts/openbao-verify.sh`, `docker-swarm.yml`, `.planning/runbooks/openbao.md` (contains
  "Phase 39 final gate") all present.
- Commits: parent `6f94f286`, `a6df0574`, `302a69da` and swarm `f179df3`, `5897b8b` are ancestors of their HEADs and
  GPG-signed (G). The swarm commits are on origin/master and micro.
- Plan verify commands: Task 1 `bash -n` + `--source` OK. Task 2 `--live` OK, and the micro 0700/0600 + one-task +
  `--verify-api-trust-consumer` OK. Task 3 `--full --maintenance --api-service` + `--live` OK. The scope, whitespace
  and gitleaks chain OK. The WS chain is run by the operator script (open item 2).
