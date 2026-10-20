---
phase: 39-internal-openbao-on-the-swarm
plan: 01
subsystem: infra
tags: [openbao, vault, transit, approle, userpass, raft, static-seal, tls, docker-swarm, preflight]

requires: []
provides:
  - "thinx-swarm vault.yml: isolated single-replica OpenBao 2.7.1 stack (micro/manager, stop-first, openbao-internal only)"
  - "thinx-swarm vault.conf: Raft + verified TLS + file static seal + declarative file audit"
  - "openbao/openssl.cnf internal CA and leaf profiles; three policies (thinx-api, operator, backup)"
  - "openbao/emergency-unix.hcl: proven break-glass Unix listener for no-valid-login root generation"
  - "tests/openbao-exact-image.test.sh: blocking exact-image integration proof (136 checks full, 121 policy matrix)"
  - "scripts/openbao-preflight.sh: fail-closed source/live preflight with fixture self-test"
  - "39-EXECUTION-BASELINES.env: immutable PARENT_BASE/SWARM_BASE for Plan 06 diffs"
affects: [39-02, 39-03, 39-05, 39-06, phase-40]

actuals:
  tokens: 26440
  tasks: 3
  commits: 1
plan_head_before: 9b91a81fe26cd82517d3c7259da6469a377b65d7
plan_head_after: 826418344e3f54498dc672b79a979e43c3e4edf1
swarm_head_before: 2121066fedf4ff4245ca80d3d18c6c499c0e0195
swarm_head_after: 4b95ee61ed2d297cd259fd1a853ac1011b70d5b7
swarm_commits: 3

tech-stack:
  added: ["openbao/openbao:2.7.1 (exact tag, official image)"]
  patterns:
    - "Exact-image throwaway harness on a labelled Internal=true Docker network, torn down on every exit"
    - "Secrets cross into containers only via env/stdin, never host argv, never printed"
    - "Preflight = pure facts evaluator + read-only collectors + mutation self-test"

key-files:
  created:
    - ../../thinx-swarm/openbao/openssl.cnf
    - ../../thinx-swarm/openbao/emergency-unix.hcl
    - ../../thinx-swarm/openbao/policies/thinx-api.hcl
    - ../../thinx-swarm/openbao/policies/operator.hcl
    - ../../thinx-swarm/openbao/policies/backup.hcl
    - ../../thinx-swarm/tests/openbao-exact-image.test.sh
    - ../../thinx-swarm/scripts/openbao-preflight.sh
    - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-EXECUTION-BASELINES.env
  modified:
    - ../../thinx-swarm/vault.yml
    - ../../thinx-swarm/vault.conf

key-decisions:
  - "OpenBao runs as uid 0 with BAO_SKIP_DROP_ROOT=1 and SKIP_CHOWN=1, read-only rootfs, cap_drop ALL, so the seal key and state stay root-only 0600/0700 on micro"
  - "Server command is bao server -config=/openbao/config (a directory) so the emergency listener drops in as zz-emergency-unix.hcl"
  - "TLS lives under /openbao/tls/current/{tls.crt,tls.key,ca.pem}, current being a relative symlink to a versioned directory; leaf SANs openbao.internal, localhost, 127.0.0.1"
  - "No-valid-login recovery on 2.7.1: server-generated OTP via legacy sys/generate-root/attempt plus unauthenticated sys/decode-token over a 0600 Unix socket; the bao CLI OTP/decode helpers need an authenticated token"
  - "thinx-api AppRole: token_ttl 20m, max 1h, reusable SecretIDs, no default policy; backup AppRole 5m/15m"
  - "Operator policy deliberately excludes Transit encrypt/decrypt and blocks unsafe key flags via denied_parameters; it can still rewrite its own guardrails (documented trust limitation)"
  - "Healthcheck treats sealed (bao status exit 2) as healthy to avoid restart loops before init"

patterns-established:
  - "Exact-image proof first: every config/policy claim is tested against openbao/openbao:2.7.1 before production"
  - "Fail-closed gates: every preflight gate has a fixture that must fail with its reason code"

requirements-completed: [VAULT-01, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08]

coverage:
  - id: D1
    description: "Isolated OpenBao 2.7.1 stack source: exact tag, one stop-first replica pinned to micro/manager, only openbao-internal, no port/Traefik/Gluster/digest/autoredeploy"
    requirement: VAULT-01
    verification:
      - kind: automated_ui
        ref: "docker compose -f ../../thinx-swarm/vault.yml config gate (plan Task 1 verify 3)"
        status: pass
      - kind: other
        ref: "../../thinx-swarm/scripts/openbao-preflight.sh --source-only"
        status: pass
    human_judgment: false
  - id: D2
    description: "Verified TLS from the internal CA; missing/wrong CA, wrong hostname and bare IP rejected"
    requirement: VAULT-03
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#verified TLS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Static-seal auto-unseal after init and restart from a raw 32-byte node-local key"
    requirement: VAULT-04
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#static seal auto-unsealed"
        status: pass
    human_judgment: false
  - id: D4
    description: "thinx-deploy-keys aes256-gcm96 with exportable/allow_plaintext_backup/deletion_allowed false"
    requirement: VAULT-05
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#thinx-deploy-keys flags"
        status: pass
    human_judgment: false
  - id: D5
    description: "thinx-api AppRole limited to three update-only paths, no default policy, 32-path denial matrix"
    requirement: VAULT-06
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#api denial matrix"
        status: pass
    human_judgment: false
  - id: D6
    description: "Declarative 0600 file audit with HMAC-redacted values"
    requirement: VAULT-07
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#file audit"
        status: pass
    human_judgment: false
  - id: D7
    description: "Operator 4h hard cap, operator/backup authority matrices, no-valid-login emergency root over the Unix socket"
    requirement: VAULT-08
    verification:
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh --policy-matrix"
        status: pass
      - kind: integration
        ref: "../../thinx-swarm/tests/openbao-exact-image.test.sh#A1 emergency root"
        status: pass
    human_judgment: false
  - id: D8
    description: "Live micro/core/edge/legacy-port preflight against production"
    requirement: VAULT-01
    verification: []
    human_judgment: true
    rationale: "--live was written and self-tested but deliberately not run (no production access in this plan); Plan 05 must run it and it remains blocking"

duration: 55min
completed: 2026-10-18
status: complete
---

# Phase 39 Plan 01: Exact-image OpenBao architecture proof Summary

**OpenBao 2.7.1 stack, Raft/TLS/static-seal/audit HCL and three least-privilege policies, all proven against the exact image by a 136-check harness. The harness covers the no-valid-login Unix-socket recovery. A fail-closed source/live preflight comes with it.**

## Performance

- **Duration:** about 55 min, including roughly 20 min blocked on GPG signing
- **Started:** 2026-10-18T09:29:17Z
- **Completed:** 2026-10-18T10:25Z
- **Tasks:** 3
- **Files modified:** 11 (9 in thinx-swarm, 1 in the parent repo, plus this summary)

## Accomplishments

- **Dormant Vault replaced.** `vault:1.5.5` is gone, along with its public routers, Gluster paths, file backend and plaintext listener. In its place is an isolated `vault_openbao` service:
  - image `openbao/openbao:2.7.1` by tag
  - pinned to micro and manager, `stop-first`
  - only the external `openbao-internal` overlay, no published port, no Traefik label, no Docker socket
- **The exact-image harness proves the design end to end:**
  - verified TLS plus four negative cases (missing CA, wrong CA, wrong hostname, bare IP)
  - 1/1 recovery init and static-seal auto-unseal after init and after a restart
  - the locked Transit key flags
  - the AppRole round-trip, including concurrently, and a 32-path denial matrix
  - audit redaction
  - research assumption A1: no-valid-login root generation over a 0600 Unix socket, including the cleanup afterwards
- **Operator authority is separated from the API role.** The operator gets a hard 4h cap (`token_explicit_max_ttl`), proven by a shortened analogue with an uncapped control token. The operator policy has 22 tested guardrails. The backup role can only save a snapshot and revoke its own token. The API role is unchanged.
- **Fail-closed preflight.** The source gates, a read-only live collector for micro and core, and a 38-case fixture self-test in which every gate must fail with its own reason code.

## Task Commits

1. **Task 1: exact-image tracer, stack and config**
   - thinx-swarm `d89985a` (feat)
   - parent `82641834`: baseline file (chore)
2. **Task 2: operator and backup authority**
   - thinx-swarm `aa6108a` (feat)
3. **Task 3: fail-closed preflight**
   - thinx-swarm `4b95ee6` (feat)

All commits are GPG-signed. Neither repo was pushed.

## Files Created/Modified

All paths below are in thinx-swarm except the last one.

- `vault.yml`: the isolated single-replica stack
- `vault.conf`: Raft, TLS, static seal and file audit, in HCL
- `openbao/openssl.cnf`: the internal CA, leaf profile and SANs
- `openbao/emergency-unix.hcl`: a temporary break-glass Unix listener
- `openbao/policies/thinx-api.hcl`: three update-only Transit paths
- `openbao/policies/operator.hcl`: D-12 administration plus guardrails
- `openbao/policies/backup.hcl`: snapshot read and revoke-self
- `tests/openbao-exact-image.test.sh`: the exact-image integration proof
- `scripts/openbao-preflight.sh`: the source, live, evaluate and self-test preflight
- parent repo `39-EXECUTION-BASELINES.env`: `PARENT_BASE` and `SWARM_BASE`

## Verification

| Command | Result |
|---|---|
| `bash ../../thinx-swarm/tests/openbao-exact-image.test.sh` | exit 0, `checks=136` |
| `... --policy-matrix` | exit 0, `checks=121` |
| baseline-file verify (plan Task 1, verify 2) | pass |
| `docker compose ... config` gate (plan Task 1, verify 3) | pass; `docker stack config` also accepts the file |
| `bash -n` + `openbao-preflight.sh --source-only` | `OPENBAO-PREFLIGHT-OK` |
| `openbao-preflight.sh --self-test` | 38 cases ok |
| Mutation run (TCP generate-root re-enabled in a scratch copy) | failed at the intended check |
| gitleaks over the thinx-swarm tree | no leaks |

No throwaway containers, networks or volumes remain afterwards.

## Decisions Made

See `key-decisions` in the frontmatter. The most important: the container runs as uid 0, so all host state stays root-only. The config is a directory, so the emergency fragment can be dropped in. The TLS `current` symlink makes renewal switch certificate and key together.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Added `openbao/emergency-unix.hcl`**
- **Found during:** Task 1
- **Issue:** The A1 rehearsal needs a listener definition. If only the test carried an inline copy, the runbook could diverge from what was proven.
- **Fix:** A tracked fragment that the test installs and the runbook (Plans 02/05) installs too. Preflight checks that it is not part of the normal config.
- **Commit:** `d89985a`

**2. [Rule 1 - Bug] The 2.7.1 CLI generate-root helpers cannot work without a login**
- **Found during:** Task 1
- **Issue:** `bao operator generate-root -generate-otp` and `-decode` call the authenticated `sys/generate-root-token/attempt` and return 403 when no valid login exists.
- **Fix:** The server generates the OTP via `write -f sys/generate-root/attempt` on the Unix socket. The recovery share goes in on stdin, and decoding uses the unauthenticated `sys/decode-token`. Proven by the harness.
- **Commit:** `d89985a`

**3. [Rule 1] Removed `tls_disable_client_certs` and a `tls_disable` comment literal from `vault.conf`**
- **Issue:** VAULT-03 requires the config to have no `tls_disable`. The harmless client-cert flag would still trip any textual check.
- **Commit:** `d89985a`

**4. [Rule 1/2] Preflight evaluates comment-stripped copies and gained extra modes**
- **Issue:** Explanatory comments mentioning `/mnt/gluster` and autoredeploy made the source gates fail. A fail-closed claim without fixtures would also be unproven.
- **Fix:** The gates now read config, not prose. Added `--evaluate`, `--self-test` (38 mutation cases), `--print-collector` and `--expect-deployed`.
- **Commit:** `4b95ee6`

---

**Total deviations:** 4 auto-fixed (1 missing critical, 3 bug/correctness).
**Impact on plan:** all are needed for the plan's own acceptance criteria. No scope creep, and no production change.

## Issues Encountered

- **GPG signing blocked the first commit.** The passphrase wasn't cached, and loopback pinentry has no TTY. Work stopped at an auth gate until the user unlocked GPG. All commits are signed; signing was never bypassed.
- **`SubagentHandback` was unavailable** in this non-auto session, so the interim report went out as plain text.

## Deferred: live preflight

`scripts/openbao-preflight.sh --live` was written but **not run**, under this plan's no-production constraint. It collects read-only facts from micro and core over ssh and probes the public 7442/1883 ports. **Plan 05 must run it before deployment.** Until then, the micro placement, node-local paths, overlay state, Traefik baseline and core transfer prerequisites remain unverified, flagged and blocking.

## Next Phase Readiness

- Plan 02 (installer, recovery archive, bootstrap) can consume the policies, the config layout, the emergency fragment and the endpoint sequences proven in the harness.
- Plans 03, 05 and 06 depend on the TLS profile, the preflight and the baselines file. All three are in place.

## Self-Check: PASSED

- All 10 key files exist on disk.
- Commits `d89985a`, `aa6108a` and `4b95ee6` are in thinx-swarm HEAD; `82641834` is in parent HEAD.

---
*Phase: 39-internal-openbao-on-the-swarm*
*Completed: 2026-10-18*
