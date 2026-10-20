---
phase: 39-internal-openbao-on-the-swarm
plan: 02
subsystem: infra
tags: [openbao, bootstrap, recovery-archive, hdiutil, keychain, approle, userpass, static-seal, root-revocation, traefik-edge]

requires:
  - phase: 39-01
    provides: "vault.yml/vault.conf layout, three policies, openssl.cnf profiles, emergency-unix.hcl, exact-image harness, source preflight"
provides:
  - "scripts/openbao-common.sh: shared strict-mode primitives and the single node-local layout table (sourced by every OpenBao host script, available to Plan 03)"
  - "scripts/openbao-install.sh: fail-closed node-local install, --check, exclusive --init-seal gN, first --init-tls"
  - "scripts/openbao-recovery-archive.sh: macOS encrypted-DMG custody (create/add-generation/add-artifact/verify/recover/destroy-mount)"
  - "scripts/openbao-bootstrap.sh: gated init -> custody -> configure -> operator -> proofs -> root revocation state machine"
  - "scripts/openbao-verify.sh: --health, --full, --edge-exposure gates"
  - "tests/openbao-bootstrap.test.sh: install, recovery-archive, protected-input-contract, edge-exposure-fail-closed, bootstrap-state-machine (59 checks)"
affects: [39-03, 39-04, 39-05, 39-06, phase-40]

actuals:
  tokens: 42260
  tasks: 3
  commits: 0
plan_head_before: 219618cbd559252244d790627cd2917fcbd39de8
plan_head_after: 219618cbd559252244d790627cd2917fcbd39de8
swarm_head_before: 4b95ee61ed2d297cd259fd1a853ac1011b70d5b7
swarm_head_after: c76e7c1b94b08176eac00bc67c58cd1523fb87f9
swarm_commits: 3

tech-stack:
  added: []
  patterns:
    - "Validate every path before the first write; a refusal mutates nothing except the job log and lock"
    - "Custody by receipt: micro emit | laptop archive add --receipt | micro confirm-custody (sha256 compared in memory, never printed or stored)"
    - "Ledger-gated irreversible step: root revocation needs 4 custody receipts and 5 proofs newer than init"
    - "Secrets only via pipe/socket/TTY fds or hidden prompts; argv/env/regular-file inputs are refusals"

key-files:
  created:
    - ../../thinx-swarm/scripts/openbao-common.sh
    - ../../thinx-swarm/scripts/openbao-install.sh
    - ../../thinx-swarm/scripts/openbao-recovery-archive.sh
    - ../../thinx-swarm/scripts/openbao-bootstrap.sh
    - ../../thinx-swarm/scripts/openbao-verify.sh
    - ../../thinx-swarm/tests/openbao-bootstrap.test.sh
  modified: []

key-decisions:
  - "Recovery share and bootstrap root live only in 0600 files on the /run tmpfs between bootstrap invocations; the share is deleted once its archive receipt matches, the root once revoked"
  - "Custody is proven by sha256 receipts piped back from the read-only-reopened archive; micro compares them in memory and records only 'confirmed'"
  - "Root revocation is gated on custody of the recovery share, every seal generation the config names, CA key and CA cert, plus fresh operator-login, API-canary, backup-snapshot, audit-canary and A1 emergency proofs"
  - "The installer copies vault.conf as the ONLY file in /etc/openbao/config (the server loads the whole directory); emergency-unix.hcl is staged at /etc/openbao/emergency-unix.hcl and a leftover zz-emergency-unix.hcl is a refusal"
  - "Unattended verify --full proves the API policy behaviourally (13 denials) and root revocation from the ledger plus absent token files; operator-authenticated checks need --operator-password-fd or a TTY"
  - "The archive is a fixed 64 MB AES-256 UDIF/APFS image; verify never consults the Keychain; destinations in git trees, iCloud/CloudStorage/Dropbox/Drive/OneDrive/Box, Desktop, Documents, /Volumes, /Users/Shared and temp dirs are refused"

patterns-established:
  - "openbao-common.sh is the shared library for all OpenBao host scripts (layout, flock, sanitized verdicts, docker-exec bao wrappers, curl -K Slack transport)"
  - "Fixture mode (OBC_FIXTURE=1 + OBC_ROOT) relocates the layout; refused on micro/core and with an empty or / root"

requirements-completed: [VAULT-01, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08]

coverage:
  - id: D1
    description: "Node-local installer: validation before mutation, 0700 root-only layout, reviewed copies only, exclusive 32-byte seal generation, first TLS issuance, Gluster/symlink/non-local/tmpfs/owner/stray-config refusals, zero legacy-tree mutation"
    requirement: VAULT-04
    verification:
      - kind: integration
        ref: "tests/openbao-bootstrap.test.sh install (24 checks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Encrypted recovery archive workflow: AES-256 image via -stdinpass, streamed artifacts with manifest checksums, read-only reopen, Keychain-free verify, receipts, destination and protected-input refusals, no plaintext staging; same flow against native hdiutil"
    requirement: VAULT-08
    verification:
      - kind: integration
        ref: "tests/openbao-bootstrap.test.sh recovery-archive (15 checks incl. real hdiutil leg)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bootstrap state machine against the exact image: 1/1 init, custody pipeline, configure, 4h operator, proofs, every prerequisite blocking revocation, lock exclusion, no re-init, failure cleanup, revocation + rejection, post-revocation snapshot, verify-only rerun"
    requirement: VAULT-06
    verification:
      - kind: integration
        ref: "tests/openbao-bootstrap.test.sh bootstrap-state-machine (13 checks, openbao/openbao:2.7.1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Verifier --full/--health and the fail-closed --edge-exposure gate"
    requirement: VAULT-01
    verification:
      - kind: integration
        ref: "tests/openbao-bootstrap.test.sh bootstrap-state-machine#verify --full"
        status: pass
      - kind: unit
        ref: "tests/openbao-bootstrap.test.sh edge-exposure-fail-closed (good fixture + 22 failure fixtures)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Protected input contract: credentials never via argv, environment, stdout fd or a regular file; artifacts never to a terminal"
    requirement: VAULT-08
    verification:
      - kind: unit
        ref: "tests/openbao-bootstrap.test.sh protected-input-contract (5 checks)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Sole-operator archive and no-valid-login recovery are usable in practice (FLAGGED ASSUMPTION, VAULT-08)"
    requirement: VAULT-08
    verification: []
    human_judgment: true
    rationale: "Only proven with throwaway passwords and fixtures; not usable until the Plan 04 local ceremony and the Plan 05 throwaway rehearsal both succeed"

duration: 43min
completed: 2026-10-18
status: complete
---

# Phase 39 Plan 02: Node-local install, custody archive and gated bootstrap Summary

**Five host scripts plus a 59-check fixture suite. They install OpenBao's node-local runtime, keep custody material in an AES-256 DMG on the operator's Mac, and bootstrap the server. The bootstrap revokes the root token only after 4 custody receipts and 5 fresh proofs. All of it was run against the exact `openbao/openbao:2.7.1` image and the native `hdiutil`, with throwaway credentials only.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-10-18T10:33:03Z
- **Completed:** 2026-10-18T11:16:20Z
- **Tasks:** 3
- **Files:** 6 created in thinx-swarm (2,884 lines), plus this summary

## Accomplishments

- **Installer (`openbao-install.sh`).**
  - Every source file and layout path is checked before the first write: clean checkout, source preflight, no symlink in any path component, not on GlusterFS, local filesystem (tmpfs for `/run`), root-owned directory.
  - It then creates the 0700 layout and copies the reviewed files with explicit modes. Runtime never binds the checkout.
  - `--init-seal gN` publishes exactly 32 random bytes with a hard link, so an existing generation can never be overwritten. `--init-tls` does the first CA and leaf issuance.
  - `--check` is the read-only version of the same gates. The legacy Vault trees are reported by type and mode only.
- **Recovery archive (`openbao-recovery-archive.sh`, macOS).**
  - One AES-256 UDIF/APFS image. Passwords go only through `-stdinpass`, from a hidden prompt or a pipe fd.
  - Artifacts stream straight into the mounted volume, with a versioned manifest of byte counts and sha256. After every add, the image is detached, reopened read-only and the checksum re-checked.
  - `verify` never uses the Keychain. `--metadata-only` needs no password, which is what Plan 04's automated check calls.
  - The Keychain copy is created with an interactive `-w` (never `-A`) and then proven to open the image.
  - The closing checklist separates the archive password from the operator login.
- **Bootstrap (`openbao-bootstrap.sh`).** A flock-serialized state machine:
  - verified-TLS preconditions, including proof that a client without the CA is rejected
  - 1/1 recovery init; the root token and the share exist only in 0600 tmpfs files
  - custody gate fed by `emit | archive add --receipt | confirm-custody`
  - Transit key with the locked flags; three policies, byte-for-byte; thinx-api and backup AppRoles, with credentials issued once
  - the 4h operator, password from a protected fd or a TTY
  - live proofs, then gated root revocation with a rejection proof and a post-revocation snapshot
  - a completed bootstrap that runs again only verifies.
- **Verifier (`openbao-verify.sh`).**
  - `--health` and `--full`: service spec, TLS negatives (missing CA, bare IP), layout through `install --check`, seal-generation expectations, behavioural API-policy proof (13 denials), backup role, audit redaction, root revocation, and operator-authenticated checks when a password fd or TTY is given.
  - `--edge-exposure` prints only `EDGE-EXPOSURE-OK`, and only after every assertion has passed.

## Task Commits

All in thinx-swarm `master`, GPG-signed, not pushed:

1. **Task 1: node-local installer and shared library:** `1a109c0` (feat)
2. **Task 2: encrypted recovery archive:** `6104df2` (feat)
3. **Task 3: bootstrap, verifier and edge gate:** `c76e7c1` (feat)

The parent repo has no code commits for this plan (`commits: 0` is measured against parent `219618cb`). This summary and the state updates are committed in the parent afterwards.

## Files Created

All in `../../thinx-swarm/`:

- `scripts/openbao-common.sh`: the shared primitives and layout table
- `scripts/openbao-install.sh`: install, `--check`, `--init-seal`, `--init-tls`
- `scripts/openbao-recovery-archive.sh`: the macOS custody workflow
- `scripts/openbao-bootstrap.sh`: the bootstrap state machine and the custody/proof subcommands
- `scripts/openbao-verify.sh`: the health, full and edge-exposure gates
- `tests/openbao-bootstrap.test.sh`: the five fixture modes plus `all`

## Verification

| Command (from the parent repo root) | Result |
|---|---|
| `bash -n` over all six files | ok |
| `bash ../../thinx-swarm/tests/openbao-bootstrap.test.sh install` | 24/24 |
| `... recovery-archive` | 15/15, including the native-hdiutil leg |
| `... bootstrap-state-machine` | 13/13 against `openbao/openbao:2.7.1` |
| `... edge-exposure-fail-closed` | good fixture plus 22 failure fixtures |
| `... protected-input-contract` | 5/5 |
| `... all` | `OPENBAO-BOOTSTRAP-TEST-OK mode=all checks=59` |
| `openbao-preflight.sh --source-only` / `--self-test` | OK / 38 cases |
| gitleaks over the six new files | no leaks |

**Mutation checks** (scratch copies):

| Mutation | Caught by |
|---|---|
| Symlink gate disabled | install #18 |
| Seal overwrite allowed | install #8 |
| Revocation gate disabled | bootstrap #4 |
| Edge marker printed early | edge #1 |

After the runs, no labelled Docker container, network or volume remains, and no image is attached.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The installer refuses stray files in `/etc/openbao/config` and stages the emergency listener outside it**
- **Found during:** Task 1
- **Issue:** `bao server -config=/openbao/config` loads every file in that directory. A leftover `zz-emergency-unix.hcl` or any other `.hcl` would silently become live config.
- **Fix:** `CONFIG_DIR_UNEXPECTED_FILE` and `EMERGENCY_LISTENER_INSTALLED` refusals. `emergency-unix.hcl` is copied to `/etc/openbao/emergency-unix.hcl`.
- **Commit:** `1a109c0`

**2. [Rule 2 - Missing critical] Added `--init-tls` for first TLS issuance**
- **Found during:** Task 1
- **Issue:** `vault.yml` needs `/etc/openbao/tls/current/{tls.crt,tls.key,ca.pem}` before deploy. No plan assigned the first issuance; Plan 03 owns renewal only.
- **Fix:** Exclusive first issuance from `openssl.cnf`. The CA key is root-only under `/etc/openbao/ca`. The leaf is in `tls/r<UTC>/` with a relative `current` symlink.
- **Commit:** `1a109c0`

**3. [Rule 1 - Bug] Environment-credential refusal was too broad**
- **Found during:** Task 2 (native-hdiutil probe)
- **Issue:** Any `*PASSWORD*` variable name was refused. An unrelated variable in the operator's own shell blocked the script. Only the name was seen; no value was read.
- **Fix:** Only OpenBao/THiNX-recovery credential names, plus an explicit refusal of an inherited `BAO_TOKEN`/`VAULT_TOKEN`.
- **Commit:** `6104df2`

**4. [Rule 3 - Blocking] The installer map grew over the tasks**
- **Issue:** Task 1 could not install scripts that did not exist yet.
- **Fix:** Task 3 added `openbao-bootstrap.sh` and `openbao-verify.sh` to the map, and the test expectation went from 8 to 10 copies.
- **Commit:** `c76e7c1`

**5. [Rule 1 - Bug] Several fixes found by the first test runs**
- In the archive script: canonical mountpoint (macOS reports `/private/var/...`) and image-path resolution in one place.
- In the installer: seal/TLS exclusivity is decided before the first write, and the install record is written only when something changed, so reruns are idempotent.
- In the shared library: atomic copies stage through `install -m`.
- **Commits:** `1a109c0`, `6104df2`, `c76e7c1`

### Design interpretations

**Custody confirmation hashes on micro.** The plan says the installer must never print or hash the seal key, and it doesn't. To prove the archive holds identical bytes, the bootstrap compares sha256 receipts in memory. The hash is never printed, logged or stored; only `confirmed` is recorded.

**The emergency proof is recorded, not run.** `record-emergency-proof` takes the full exact-image harness output on stdin from the laptop. It requires mode=full, at least 136 checks, the image line, the A1 line, the cleanup line, and no `not ok`. The proof must be newer than init and at most 7 days old.

**The post-revocation snapshot falls back to local.** The bootstrap calls Plan 03's `openbao-backup.sh --post-change` when it is installed. Otherwise it writes a local backup-AppRole snapshot to `/var/backups/openbao` and records it as not yet replicated.

**Test harness on macOS.** A perl `flock(2)` shim stands in for util-linux `flock`. The test runs exercise that shim; the production `flock` binary itself is not exercised. A native-hdiutil leg was added to the stubbed archive tests.

---

**Total deviations:** 5 auto-fixed (2 missing critical, 2 bug groups, 1 blocking), plus 4 documented interpretations.
**Impact on plan:** All were needed for correctness or for executing Plan 05. No production access, no package installs, no scope beyond the plan's own scripts.

## Issues Encountered

- A built-in safety check refused a test helper that ran `rm -f` on a variable glob. The edge fixtures were rewritten to use a fresh directory per case, so no removal is needed.
- `SubagentHandback` is the delivery channel for the final report.

## User Setup Required

None in this plan. The real archive ceremony and the operator password are Plan 04, done by the human operator.

## Next Phase Readiness (Plans 03–06)

**Plan 03**
- Source `openbao-common.sh` for `OBC_*` paths, `obc_lock`, `obc_state_*`, `obc_slack_send` (curl `-K` config at `/var/lib/openbao-maintenance/credentials/slack-webhook.curl`, 0600) and `obc_bao*`.
- Backup AppRole credentials are `/var/lib/openbao-maintenance/credentials/backup.{role-id,secret-id}`.
- Implement `openbao-backup.sh --post-change`; the bootstrap calls it when installed.
- The CA is `/etc/openbao/ca/ca.{key,pem}`.
- **Renewed TLS directories must be named `r<digits/T/Z>` next to the `current` symlink**, or `install --check` and `verify --full` fail. Append new scripts to `INSTALL_MAP` or install them with the Plan 03 installer.

**Plan 04**
- Run `scripts/openbao-recovery-archive.sh create`; its last step is the Keychain-free read-only verify. `verify --metadata-only` and `tests/openbao-bootstrap.test.sh protected-input-contract` exist.
- The script needs bash 4 or later; on this Mac, `/usr/bin/env bash` resolves to Homebrew bash 5.2.

**Plan 05: the bootstrap sequence**
1. `openbao-install.sh --init-seal g1 --init-tls`, then the stack deploy.
2. `ssh -t micro /usr/local/sbin/openbao-bootstrap.sh run` (operator password at the TTY). It stops with exit 3 at the custody gate and prints the 4 laptop pipelines.
3. Run the 4 pipelines, then `run` again.
4. `bash tests/openbao-exact-image.test.sh | ssh micro '/usr/local/sbin/openbao-bootstrap.sh record-emergency-proof'`, then `run` again. It revokes the root and completes.
5. Create the `BAO_ROLE_ID`/`BAO_SECRET_ID` secrets from `credentials/thinx-api.{role-id,secret-id}` via stdin.

**Plan 05: verification and rotation**
- `verify --full --expect-seal-generation g1 --expect-root-revoked` runs unattended. Operator-authenticated checks need `--operator-password-fd` or `ssh -t`.
- For rotation, `--init-seal g2` and `--expect-no-runtime-generation g1` exist. There is no `--retire-seal` helper; removing g1 is a manual runbook step.

**Not implemented here**
- `openbao-verify.sh --maintenance` (Plan 05 Task 3) and `--api-service` (Plan 06) are usage errors today. Plans 03 and 06 must add them.

**Still blocking**
- The flagged VAULT-08 assumption (D6): the sole-operator archive and no-valid-login recovery are not usable until Plan 04 and the Plan 05 rehearsal succeed.
- The live preflight from Plan 01 still has to run.

## Self-Check: PASSED

- All 6 created files exist in thinx-swarm.
- Commits `1a109c0`, `6104df2` and `c76e7c1` are ancestors of thinx-swarm HEAD and GPG-signed (`G`).
- The thinx-swarm tree is clean apart from the unrelated `landing` submodule pointer, which was not staged.

---
*Phase: 39-internal-openbao-on-the-swarm*
*Completed: 2026-10-18*
