---
phase: 39-internal-openbao-on-the-swarm
plan: 04
subsystem: infra
tags: [openbao, custody, recovery-archive, operator-credential, human-action]

requires:
  - phase: 39-02
    provides: "scripts/openbao-recovery-archive.sh (create / verify / verify --metadata-only) and the bootstrap protected-input contract"
provides:
  - "Verified AES-256 encrypted recovery archive on the operator's Mac (empty versioned manifest; Plan 05 streams the artifacts in)"
  - "Archive password held in the password manager (primary) and the login Keychain (convenience)"
  - "Distinct `OpenBao production operator` password-manager record, reserved for Plan 05's hidden/FD bootstrap prompt"
affects: [39-05]

actuals:
  tasks: 2
  commits: 0
swarm_commits: 0

requirements: [VAULT-04, VAULT-08]
---

# Plan 39-04 Summary — local custody ceremony

**The operator created and independently verified the encrypted recovery archive and a separate operator-login password; neither value reached the agent, chat, argv, logs or a repository.**

## Tasks

| Task | Type | Result |
|---|---|---|
| 1. Recovery-archive password and archive | checkpoint:human-action (blocking-human) | Done by the operator in their own terminal (`openbao-recovery-archive.sh create`); resume signal `recovery archive ready` received 2026-10-18 |
| 2. Dedicated operator password | checkpoint:human-action (blocking-human) | Distinct password-manager record created; resume signal `operator credential ready` received 2026-10-18 |

## Verification (run by the orchestrator after the resume signals)

- `../../thinx-swarm/scripts/openbao-recovery-archive.sh verify --metadata-only` → exit 0:
  `ARCHIVE METADATA ok encrypted image at allowed location, detached; last verify 2026-10-18T13:41:36Z keychain=disabled read-only; entries=0 seal-generations=0 recovery-shares=0 ca-keys=0 ca-certs=0`
- `bash ../../thinx-swarm/tests/openbao-bootstrap.test.sh protected-input-contract` → exit 0, `OPENBAO-BOOTSTRAP-TEST-OK mode=protected-input-contract checks=5`
- `hdiutil info` shows no attached OpenBao image.
- Human checks (operator-confirmed, values not disclosed): archive password stored in the password manager and Keychain; operator password stored as a separate record that differs from the archive password.

## Deviations

None. No code or source changed; this plan has no commits beyond this SUMMARY and tracking.

## Notes for Plan 05

- The archive is empty by design (`entries=0`). Plan 05 streams `seal-g1.key`, the recovery share and the CA key/cert in with `add-generation` / `add-artifact --receipt` and feeds the receipts to `openbao-bootstrap.sh confirm-custody` on micro.
- The operator password is supplied only at the bootstrap's hidden/FD prompt (`ssh -t` or `--operator-password-fd`).
- VAULT-04 / VAULT-08 stay open: they are also declared by Plans 05–06, and the no-login recovery path is unproven until the Plan 05 rehearsal.

## Self-Check: PASSED
