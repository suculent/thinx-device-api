---
phase: 39-internal-openbao-on-the-swarm
plan: 03
subsystem: infra
tags: [openbao, raft-snapshot, forced-command-ssh, retention, tls-renewal, private-ca, api-trust, docker-config, logrotate, audit, restore-rehearsal, slack-incidents]

requires:
  - phase: 39-01
    provides: "vault.conf/vault.yml, three policies (backup.hcl = snapshot read + revoke-self), openssl.cnf CA/leaf profiles, exact-image harness, source preflight"
  - phase: 39-02
    provides: "openbao-common.sh layout/locking/sanitized output/curl -K Slack transport, backup AppRole credentials, CA at /etc/openbao/ca, r<UTC> TLS dirs + current symlink, bootstrap calling openbao-backup.sh --post-change"
provides:
  - "scripts/openbao-backup.sh: daily/--pre-change/--post-change Raft snapshot -> host inspection -> manifest -> atomic local + core finalization -> 90-day retention; --verify-both-nodes"
  - "scripts/openbao-snapshot-receive.sh: core forced-command receiver (put/commit/has/list/prune/capacity/drop-probe), fixed stem syntax, size+sha256 before an atomic directory rename"
  - "scripts/openbao-cert-renew.sh: leaf + same-key issuer renewal, deploy_api_trust consumer (--deploy-api-trust), --arm-api-trust, --exercise-expired-predecessor, --verify-current, --verify-api-trust-consumer"
  - "scripts/openbao-restore-rehearsal.sh: prepare / run / --verify-recorded-matrix (generation-aware, isolated exact-image throwaway)"
  - "scripts/openbao-audit-reopen.sh + openbao/logrotate.conf: rotation with a reopen canary; fail-closed sink detection and recovery"
  - "scripts/openbao-maintenance-install.sh: --backup-prereqs-only (sender/receiver), --full, --check"
  - "openbao-common.sh: durable flock'd incident state (one begin, one recovery alert), 90-day pair retention, shared restricted transport"
  - "openbao-verify.sh --maintenance"
  - "tests/openbao-maintenance.test.sh: backup, certificate-api-trust-and-alerts, audit-restore-install, all (32 checks)"
affects: [39-05, 39-06, phase-40, phase-41]

actuals:
  tokens: 56116
  tasks: 3
  commits: 0
plan_head_before: 45378fe9a13daa39c928d396a7039de3bac9de50
plan_head_after: 45378fe9a13daa39c928d396a7039de3bac9de50
swarm_head_before: c76e7c1b94b08176eac00bc67c58cd1523fb87f9
swarm_head_after: 0edd156617441c53ea02347335b2956f4451b254
swarm_commits: 4

tech-stack:
  added: []
  patterns:
    - "A snapshot pair is a directory <stem>/{snapshot.snap,manifest.json}, finalized by one atomic directory rename on each node; stems are the only names either node accepts"
    - "Local-only success is failure: the incident opens and the pair is replicated (backlog first) on the next run; retention runs only after this run's pair is verified on both nodes, and never empties a node"
    - "Served-leaf proof without openssl in the image: the task's own bao, trusting ONLY the expected leaf, must accept the listener"
    - "Every refusal is decided in a read-only validation phase before the first write (installer pins, sender key, Slack source, restore schedule; rehearsal image/generation)"
    - "Durable incident state per job: healthy -> failure-pending -> failure-sent -> recovery-pending -> healthy, rewritten whole under flock"

key-files:
  created:
    - ../../thinx-swarm/scripts/openbao-backup.sh
    - ../../thinx-swarm/scripts/openbao-snapshot-receive.sh
    - ../../thinx-swarm/scripts/openbao-cert-renew.sh
    - ../../thinx-swarm/scripts/openbao-restore-rehearsal.sh
    - ../../thinx-swarm/scripts/openbao-audit-reopen.sh
    - ../../thinx-swarm/scripts/openbao-maintenance-install.sh
    - ../../thinx-swarm/openbao/backup.cron
    - ../../thinx-swarm/openbao/cert-renew.cron
    - ../../thinx-swarm/openbao/logrotate.conf
    - ../../thinx-swarm/tests/openbao-maintenance.test.sh
  modified:
    - ../../thinx-swarm/scripts/openbao-common.sh
    - ../../thinx-swarm/scripts/openbao-preflight.sh
    - ../../thinx-swarm/scripts/openbao-verify.sh

key-decisions:
  - "Snapshots stream through `bao operator raft snapshot save /dev/stdout` (no 16 MB task /tmp limit) and are inspected on the host (gzip/tar, exactly 4 members, SHA256SUMS, bolt meta.json of node micro): OpenBao 2.7.1 has no `snapshot inspect`"
  - "core's receiver is a forced command behind `restrict,from=micro,command=`: fixed verbs and stems, exact byte count + sha256 before rename, no overwrite of a finalized pair, prune never empties the node; core never receives a seal key, recovery share, CA key, credential or token"
  - "Issuer renewal triggers at 120 days remaining (30 days + the 90-day leaf lifetime) so no leaf is ever issued past its issuer; the leaf keeps the 30-day threshold"
  - "Issuer renewal order: API trusts old+renewed -> server re-issued leaf (chains to the renewed anchor alone) -> API probe of the renewed server -> API retires the old anchor -> server ca.pem follows -> only then /etc/openbao/ca/ca.pem is replaced; any failure restores the original server dir AND API config and proves both (exit 4 if a rollback cannot be proven)"
  - "deploy_api_trust: immutable Docker config openbao-ca-<sha256[0:20]>, 0600 spec backup in a 0700 node-local dir, one targeted `docker service update --config-rm/--config-add` at /run/openbao/ca.pem; the trust probe is a Node script run inside the actual task, or (when thinx_api runs on core) a one-shot replicated job pinned to that node on the same image, overlay and config"
  - "Issuer renewal fails closed (nothing changed) until Plan 06 runs --arm-api-trust; leaf renewal works unarmed"
  - "Ambiguous webhook acknowledgement is retried once and then assumed delivered: at most one duplicate per transition, never a silent loss; definite send failures are retried every run"
  - "Restore rehearsal refuses image, generation, previous-generation, path and staleness mismatches before reading any key byte; the throwaway's own fresh root must be rejected after restore (proof the restored state is in force)"
  - "--verify-recorded-matrix defaults to every generation the config names PLUS every generation a retained snapshot manifest needs (so Plan 05's end state, config g2-only with retained g1 snapshots, still requires the g1 rehearsal)"
  - "The maintenance installer installs itself node-local on both nodes so --check / verify --maintenance run from local copies"

patterns-established:
  - "Fixture fault injection (OBC_FAULT) and a pinned fixture clock (OBC_NOW_EPOCH) exist only in fixture mode, which openbao-common.sh refuses on micro and core"
  - "Docker shims emulate only the Swarm API service / API task; every other docker call goes to the real daemon running the exact image"

requirements-completed: [VAULT-02, VAULT-03, VAULT-04, VAULT-07, VAULT-08]

coverage:
  - id: D1
    description: "Two-node Raft snapshot transaction: inspection failures, interrupted/truncated/corrupted transfer, lost commit answer, retry convergence with backlog, exact 90-day boundary on both nodes, mutation-free lock contention, receiver refusals (21 command/path/option variants), custody scan, --verify-both-nodes"
    requirement: VAULT-02
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh backup (12 checks; 5 mutations caught)"
        status: pass
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh audit-restore-install#exact image: a real Raft snapshot ... lands identical on micro and core"
        status: pass
    human_judgment: false
  - id: D2
    description: "Leaf and same-key issuer renewal with exact-image reload rehearsal, pinned served-leaf proof, API trust overlap/retire through the recurring consumer, both-side rollback for 6 failure points, expired-predecessor runtime case, remote-node probe job"
    requirement: VAULT-03
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh certificate-api-trust-and-alerts (12 checks on openbao/openbao:2.7.1 with the real Node probe; 5 mutations caught)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Durable incident alerts: one begin alert, none for repeated failures across separate processes, one recovery; ambiguous/failed delivery retry states; webhook never in argv/output"
    requirement: VAULT-08
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh certificate-api-trust-and-alerts#three failed runs ... ambiguous begin acknowledgement"
        status: pass
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh backup#prune refuses to empty a node ... one begin alert ... one recovery alert"
        status: pass
    human_judgment: false
  - id: D4
    description: "Audit rotation with a reopen canary (HMAC-redacted, no raw credential), unwritable sink fails closed (requests refused) and recovers after repair"
    requirement: VAULT-07
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh audit-restore-install#audit"
        status: pass
    human_judgment: false
  - id: D5
    description: "Generation-aware restore rehearsal on an isolated fresh-Raft exact-image throwaway: mismatch refusals, SEAL_MISMATCH, restored-state auth/canary/key flags/policies/audit, both limitations, matrix verification"
    requirement: VAULT-04
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh audit-restore-install#restore"
        status: pass
    human_judgment: false
  - id: D6
    description: "Maintenance installer: prereqs-only ordering and isolation (nothing recurring), pinned host key, forced-command authorized_keys line, transfer proof; full install idempotence, no restore schedule, Slack config copied on micro; verify --maintenance"
    requirement: VAULT-08
    verification:
      - kind: integration
        ref: "tests/openbao-maintenance.test.sh audit-restore-install#prereqs / full install (4 mutations caught)"
        status: pass
    human_judgment: false
  - id: D7
    description: "FLAGGED ASSUMPTION (VAULT-02): micro -> core restricted transfer, core sshd root key auth, disk capacity, logrotate presence and 90-day retention on the real nodes"
    requirement: VAULT-02
    verification: []
    human_judgment: true
    rationale: "Only proven against fixture roots and an sshd-emulating stub; the live gates run in Plan 05 Task 1 (--backup-prereqs-only must reach TRANSFER_VERIFIED before bootstrap)"
  - id: D8
    description: "A2 on the real API runtime: the deployed thinx_api Node/OpenSSL picks the valid anchor from an expired+renewed bundle, and the in-task probe runs in that image"
    requirement: VAULT-03
    verification: []
    human_judgment: true
    rationale: "Proven with the laptop's Node v25.1.0 against the exact OpenBao image; Plan 06 runs --exercise-expired-predecessor against the actual task"
  - id: D9
    description: "Existing THiNX Slack destination actually receives the begin/recovery alerts"
    verification: []
    human_judgment: true
    rationale: "No Slack message was sent (curl is a recording stub); Plan 05 Task 3 verifies the live destination"

duration: 130min
completed: 2026-10-18
status: complete
---

# Phase 39 Plan 03: OpenBao backup, TLS renewal, audit and restore maintenance Summary

**Five host jobs plus their installer, all fixture-tested. One OpenBao Raft snapshot is inspected, finalized atomically on micro and on core through a forced-command receiver, and kept 90 days. The listener leaf and its private issuer renew from the host-local CA key, and every issuer change reaches `thinx_api` through a rollback-protected Docker-config transaction. Audit rotation is proven by a canary. Restore rehearsal is generation-aware. Failures alert Slack once when they begin and once when they recover. Everything was exercised against `openbao/openbao:2.7.1`, with no production access.**

## Performance

- **Duration:** 130 min (2h 10m)
- **Started:** 2026-10-18T11:20:51Z
- **Completed:** 2026-10-18T13:31:18Z
- **Tasks:** 3
- **Files:** 10 created and 3 modified in thinx-swarm (3,195 lines), plus this summary

## Accomplishments

- **Backup (`openbao-backup.sh`).**
  - The snapshot is taken with the backup AppRole and streamed through `docker exec`. The host inspects it, since 2.7.1 has no `inspect`.
  - The manifest records the image, version, Raft index and term, the seal generation ids (never key bytes), a config hash, the source revision, the sha256 and both restore limitations.
  - The pair is finalized locally with one atomic directory rename.
  - Replication runs backlog first, through a dedicated key and a pinned host key.
  - Retention prunes on both nodes, and only after this run's pair is verified on core.
  - A transfer that fails after the local finalize is a failed run.
- **Receiver (`openbao-snapshot-receive.sh`).**
  - Accepts seven fixed verbs and the stem syntax only.
  - Size and sha256 are checked before the rename.
  - It never overwrites a pair and never prunes a node empty.
- **Certificates (`openbao-cert-renew.sh`).**
  - The staged leaf or issuer is validated (SAN, key match, chain, EKU, CA flag, validity, modes).
  - An exact-image throwaway is shown to serve the old leaf, then the new one after the same switch + SIGHUP.
  - The live switch is atomic. The served leaf is proven by pinning, and hostname trust plus a wrong-name negative are checked.
  - **`deploy_api_trust`** (`--deploy-api-trust`): immutable config, 0600 spec backup, one targeted update, a Node probe inside the task (mounted CA trusted; no CA and a same-name foreign CA refused), then rollback and proof on any failure.
  - `--exercise-expired-predecessor`, `--arm-api-trust`, `--verify-current` and `--verify-api-trust-consumer` are ready for Plans 05 and 06.
- **Incidents (`openbao-common.sh`).** Durable per-job state under flock gives one begin alert and one recovery alert, across process restarts, with explicit ambiguous and failed retry states.
- **Audit.** `logrotate.conf` uses `create 0600`, keeps 30 rotations and never copytruncates. `openbao-audit-reopen.sh` sends SIGHUP and runs a canary. On the exact image, an unwritable sink makes OpenBao refuse requests, and the next reopen after repair recovers it.
- **Restore (`openbao-restore-rehearsal.sh`).**
  - `prepare` writes a pre-snapshot canary, then takes and replicates a snapshot.
  - `run` refuses mismatches before reading any key byte. It restores into a fresh-Raft throwaway on an `--internal` network and proves the restored state.
  - Both restore limitations are always printed.
  - `--verify-recorded-matrix` is ready for Plan 05.
- **Installer (`openbao-maintenance-install.sh`).**
  - `--backup-prereqs-only` installs the sender (micro) and receiver (core) roles and proves the transfer plane. It installs nothing recurring.
  - `--full` adds cron (backup and certificate jobs only), logrotate, the disarmed trust consumer and the Slack curl config, which is copied on micro.
  - `--check` backs `openbao-verify.sh --maintenance`.

## Task Commits

All in thinx-swarm `master`, GPG-signed (`G`), not pushed:

1. **Task 1, tracer: two-node snapshot + receiver + backup.cron:** `7bd86bd` (feat)
2. **Refactor, shared transport in openbao-common.sh:** `f6de29d` (refactor)
3. **Task 2: transactional leaf+issuer renewal + API trust consumer + cert-renew.cron:** `ba30f39` (feat)
4. **Task 3: audit rotation, maintenance installer, restore rehearsal, verify --maintenance:** `0edd156` (feat)

The parent repo has no code commits for this plan (`commits: 0`, measured against `45378fe9`). This summary and the state updates are committed in the parent afterwards.

## Files Created/Modified

All in `../../thinx-swarm/`:

- `scripts/openbao-backup.sh`: the snapshot transaction, `--verify-both-nodes`, `--incident-status`
- `scripts/openbao-snapshot-receive.sh`: core's forced receiver
- `scripts/openbao-cert-renew.sh`: renewal, the trust consumer and the Plan 05/06 verbs
- `scripts/openbao-restore-rehearsal.sh`: `prepare`, `run`, `--verify-recorded-matrix`, `status`
- `scripts/openbao-audit-reopen.sh`: postrotate reopen canary
- `scripts/openbao-maintenance-install.sh`: prereqs, full, check
- `openbao/backup.cron`, `openbao/cert-renew.cron`, `openbao/logrotate.conf`
- `tests/openbao-maintenance.test.sh`: the three modes plus `all`
- Modified:
  - `scripts/openbao-common.sh`: hashing, stamps, pair retention, transport, incidents
  - `scripts/openbao-preflight.sh`: `*.cron` and `logrotate.conf` allowed in `openbao/`
  - `scripts/openbao-verify.sh`: `--maintenance`

## Verification

| Command (from the parent repo root) | Result |
|---|---|
| `bash -n` over every `../../thinx-swarm/scripts/openbao-*.sh` and the test | ok |
| `bash ../../thinx-swarm/tests/openbao-maintenance.test.sh backup` | 12/12 |
| `... certificate-api-trust-and-alerts` | 12/12 against `openbao/openbao:2.7.1`, real Node probe |
| `... audit-restore-install` | 8/8 against `openbao/openbao:2.7.1` |
| `... all` (run twice) | `OPENBAO-MAINTENANCE-TEST-OK mode=all checks=32`, both runs |
| `bash ../../thinx-swarm/tests/openbao-bootstrap.test.sh all` (Plan 02 regression) | 59/59 |
| `openbao-preflight.sh --source-only` / `--self-test` | OK / 38 cases |
| gitleaks over all new and changed files | no leaks |

**Mutation checks** (scratch copies), 14 of 14 caught after one test was added:

| Area | Mutations |
|---|---|
| Receiver / backup | hash check removed, boundary `<` → `<=`, lock removed, local-only success, inspection removed |
| Certificates | SAN check removed, dedupe removed, served check removed, in-consumer restore removed (initially missed, caught after adding the `--deploy-api-trust` recovery test) |
| Restore / audit / installer | generation check removed, cron installed by prereqs, canary removed, host-key pin check removed |

**Docker:** no container, network or volume labelled `com.thinx.test=openbao-maintenance`, `com.thinx.openbao.throwaway`, `com.thinx.openbao.rehearsal`, `com.thinx.openbao.probe` or `com.thinx.test=openbao-maint-exp` remains. The `openbao/openbao:2.7.1` image was already present and is kept.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The source preflight allow-list was widened for the plan's own files**
- **Found during:** Task 2, at the first fixture OpenBao install.
- **Issue:** `SRC_NO_KEY_MATERIAL` allowed only `.hcl`/`.cnf` files in `openbao/`. The plan puts `backup.cron`, `cert-renew.cron` and `logrotate.conf` there, so every real `openbao-install.sh` run would have failed.
- **Fix:** It now also allows `*.cron` and exactly `openbao/logrotate.conf`. The private-key scan is unchanged. Self-test still has 38 cases.
- **Commit:** `ba30f39`

**2. [Rule 2 - Missing critical] Added `scripts/openbao-audit-reopen.sh`**
- **Found during:** Task 3.
- **Issue:** The plan requires a post-reopen canary and incident alerts for audit, but no file for them was listed.
- **Fix:** A small postrotate script (SIGHUP, canary, incident job `audit`), installed by `--full` and called by logrotate.
- **Commit:** `0edd156`

**3. [Rule 3 - Blocking] Added `openbao-verify.sh --maintenance`**
- **Found during:** Task 3.
- **Issue:** Plan 05's verify command calls it. Plan 02 left it as a usage error, and no later plan lists `openbao-verify.sh`.
- **Fix:** It delegates to the installed `openbao-maintenance-install.sh --check --expect-full`.
- **Commit:** `0edd156`

**4. [Rule 2 - Missing critical] Remote-node API probe**
- **Found during:** Task 2.
- **Issue:** `thinx_api` placement floats and `docker exec` is node-local, so "inside the task" fails whenever the task runs on core.
- **Fix:** On that node only, a one-shot `replicated-job` on the same image, overlay and config, pinned to the task's node, then removed.
- **Commit:** `ba30f39`

**5. [Rule 1 - Bug] Defects found by the test runs**
- Backup: the sealed-sums emptiness check was NUL/newline-sensitive.
- Installer:
  - the comment filter missed filename-prefixed grep output;
  - receiver refusals exit 2, and the transfer proof read that as failure;
  - a comment mentioning copytruncate tripped the logrotate check;
  - host-key, sender-key and Slack-source checks ran after writes (now in the read-only validation phase).
- Certificates: SIGHUP is re-sent every 3 s while polling, because a single signal can race the directory switch under Docker Desktop file sharing.
- **Commits:** `7bd86bd`, `ba30f39`, `0edd156`

**6. [Rule 3 - Blocking] The transport moved into `openbao-common.sh`**
- **Issue:** The installer's transfer proof must use byte-identical ssh options to the backup.
- **Fix:** The transport functions moved into the shared library (also modified for the incident engine and retention). Separate refactor commit.
- **Commit:** `f6de29d`

### Design interpretations

- **Issuer threshold of 120 days.** See key-decisions. A literal 30 days would let a leaf issued in the issuer's last 90 days outlive it.
- **No `snapshot inspect` in 2.7.1.** The research assumed one. Inspection is done on the host instead, and is stricter.
- **Served-fingerprint proof.** The image has no openssl, so the proof uses Go's "a pool member is its own chain" rule with the task's own `bao`.
- **The canary lives on tmpfs.** It is in a 0600 `/run` file between `prepare` and `run`, never in a manifest or log. This lets Plan 05 rehearse a g1 snapshot after rotating to g2.

---

**Total deviations:** 6 auto-fixed (1 bug group, 2 missing critical, 3 blocking), plus 4 documented interpretations.
**Impact on plan:** All were needed for correctness or for Plans 05 and 06 to execute. No production access, no package install, no Slack message.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-swarm-service | scripts/openbao-cert-renew.sh | When `thinx_api` runs on core, the trust probe creates a short-lived `openbao-trust-probe-*` replicated-job on `openbao-internal`. It uses the API image with only the public CA config and public PEMs in its environment, is pinned to that node, and is removed afterwards. |
| threat_flag: authorized-key | scripts/openbao-maintenance-install.sh | It adds one line to core's `/root/.ssh/authorized_keys`, restricted to `restrict,from=<micro>,command=<receiver>`. Plan 05 must confirm that core's sshd honours root key auth with these options. |

## Issues Encountered

- `tree_digest` failed on a tree with no files (`grep` exit 1 under `pipefail`). The test helper was fixed.
- macOS bsdtar pads its gzip output. The fixture now uses `tar | gzip -c`, as Go's writer does. Real snapshots pass `gzip -t`.

## User Setup Required

None in this plan. Live installation, the core host-key fingerprint and the Slack destination check are Plan 05 work.

## Next Phase Readiness (Plans 04–06)

**Plan 04:** nothing from this plan is needed.

**Plan 05 Task 1: before bootstrap**
1. Get core's ed25519 host-key fingerprint and its sshd port out of band (for example `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` over your own core session).
2. On micro: `--backup-prereqs-only --role sender --peer-host 10.133.0.4 --peer-port P --peer-host-key SHA256:...`. It exits 3 and prints the public line.
3. On core: `... --role receiver --sender-from 10.133.0.2 --sender-key-fd 0` with the line on stdin.
4. On micro: run the sender command again. It must report `TRANSFER_VERIFIED`.

Unverified live:
- core root key auth;
- `findmnt`/`flock` on core;
- `ssh-keyscan` on micro;
- ≥ 1 GiB free on both nodes.

**Plan 05 Task 2: seal rotation and restore**
- Run `openbao-restore-rehearsal.sh prepare` before each snapshot you will rehearse; the canary is on tmpfs, so do it again after a reboot.
- Run the rehearsal: `scripts/openbao-recovery-archive.sh recover seal-g1.key | ssh micro '... run --stem S --seal-generation g1 --seal-fd 0'`. The operator password may follow the 32 seal bytes on the same fd (`--operator-password-fd 0`).
- The default `--verify-recorded-matrix` already requires g1 while retained snapshots need it.

**Plan 05 Task 3: full install and maintenance**
- `--full` needs a single local `thinx_api` task for the Slack source; otherwise use `--slack-webhook-fd`. It fails closed without `logrotate`.
- `--send-test-alert` sends one real message.
- `openbao-verify.sh --maintenance` needs a backup in the last 26 hours and healthy `backup`/`cert-renew`/`audit` incidents.

**Plan 06**
1. Attach the first CA config (naming suggestion: `openbao-ca-<sha256[0:20]>`).
2. `openbao-cert-renew.sh --arm-api-trust --api-service thinx_api`.
3. `--exercise-expired-predecessor --api-service thinx_api`.
4. `--verify-api-trust-consumer --api-service thinx_api`.

The probe needs `node` on the API image's PATH and `BAO_ADDR` in the service env (Plan 06 adds it). After any issuer renewal, the archived ca-cert is stale. The CA key is unchanged, so this is optional to refresh.

**Still flagged:** D7 (live transfer, capacity and retention), D8 (A2 on the real API runtime) and D9 (Slack destination).

## Self-Check: PASSED

- All 10 created files and the 3 modified files exist in thinx-swarm.
- `7bd86bd`, `f6de29d`, `ba30f39` and `0edd156` are ancestors of thinx-swarm HEAD, GPG-signed (`G`).
- The thinx-swarm tree is clean apart from the unrelated `landing` submodule pointer (not staged).
- Plan verification passed from the parent root: all three automated `<verify>` commands, and `all` 32/32 twice.

---
*Phase: 39-internal-openbao-on-the-swarm*
*Completed: 2026-10-18*
