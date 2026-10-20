---
phase: 39
fixed_at: 2026-10-18T00:00:00Z
review_path: .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-REVIEW.md
iteration: 1
findings_in_scope: 17
fixed: 17
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-10-18
**Source review:** .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 17 (CR-01, WR-01..WR-16; fix_scope critical_warning)
- Fixed: 17 (6 of them, WR-01, WR-03, WR-04, WR-05, WR-10 and WR-11, flagged "fixed: requires human verification": logic or state-machine changes)
- Skipped: 0

All commits are GPG-signed (`%G?` = G) and nothing was pushed. Except where noted, every commit is in
`/Users/sychram/Repositories/thinx-swarm` (branch `master`). One commit is in the parent repo
`thinx-device-api` (branch `thinx-staging`, WR-12). The `landing` submodule pointer and the exec-bit change on
`scripts/openbao-recovery-archive.sh` were never staged; the archive is still mode 100644 in the index.
Nothing was deployed and no host was contacted.

## Deploy to micro / core: what has to be re-run

The fixes take effect only after the fixed checkout is fast-forwarded on micro
(`/mnt/gluster/deployment/swarm`) and the installers are re-run from it:

1. **CR-01 (self-installing) + WR-01..06, WR-12, WR-16 maintenance side.** On micro, as root:
   `/mnt/gluster/deployment/swarm/scripts/openbao-maintenance-install.sh --full`
   This installs `/etc/tmpfiles.d/openbao-maintenance.conf` (0644) and immediately runs
   `systemd-tmpfiles --create` on it (`TMPFILES_APPLIED ok`), which creates `/run/openbao-maintenance` 0700 and
   `/run/lock/openbao` 0700. It also copies the updated `openbao-common.sh`, `openbao-cert-renew.sh`,
   `openbao-backup.sh` and `openbao-audit-reopen.sh` and re-proves the transfer. The Slack hook comes from the
   local `thinx_api` task's secret. If that task runs on core, pipe it in with `--slack-webhook-fd`.
   Even without this step the jobs recreate the work dir themselves (`obc_ensure_run_dir`). The tmpfiles entry
   only recreates it at boot.
2. **Core receiver.** `openbao-common.sh` is installed on core too, and the lock directory moved there as well.
   Re-run the receiver install on core with the same flags as the original run (`--role receiver`).
3. **openbao-install.sh side (WR-07..WR-11, WR-13, WR-14).** On micro:
   `/mnt/gluster/deployment/swarm/scripts/openbao-install.sh` re-installs `openbao-common.sh`,
   `openbao-bootstrap.sh`, `openbao-verify.sh`, `openbao-install.sh` and `/etc/openbao/policies/operator.hcl`.
4. **WR-14 live policy (operator decision).** Installing the file does not change the live policy. Until an
   operator session runs `bao policy write operator /etc/openbao/policies/operator.hcl`, the old (wider) policy
   stays in force and `openbao-verify.sh --full` reports POLICY_DRIFT. Doing this was not authorized here.
5. **Lock-path transition (WR-06).** Locks moved from `/run/lock/openbao-*.lock` to
   `/run/lock/openbao/openbao-*.lock`. Run steps 1-3 when no backup or cert-renew cron job is running, so that
   a job on the old path never overlaps one on the new path.
6. **WR-12 restart gate.** `restart.sh` now refuses a stack deploy while thinx_api's `/run/openbao/ca.pem`
   config differs from the `configs.openbao-ca.name` pin in `thinx.yml`. The pin today is
   `openbao-ca-a2b56707515146d7a580`, the value both stack files carry. Phase 39-06 had attached that config
   live, so restart.sh should pass. If it refuses, repin as REPIN_REQUIRED says.

## Verification

Where it ran: **detached git worktrees** of thinx-swarm in the session scratchpad (`.../scratchpad/rf/wt1`,
`.../scratchpad/rf/wt2`), not the main checkout. That kept the suites from racing the edits. The api-wiring
`--self-test` needs the parent checkout next to it, so it ran in the main thinx-swarm checkout. That checkout
equals HEAD apart from the two untouchable changes. The worktrees are removed after this report, so the numbers
can be reproduced from commit `471a95f` (thinx-swarm) and `64aa9731` (thinx-device-api).

| Suite | Commit | Result |
|---|---|---|
| `bash tests/openbao-bootstrap.test.sh all` | 471a95f (HEAD) | OPENBAO-BOOTSTRAP-TEST-OK checks=62 |
| `bash tests/openbao-maintenance.test.sh all` | 471a95f (HEAD) | OPENBAO-MAINTENANCE-TEST-OK checks=32 |
| `bash tests/openbao-maintenance.test.sh all` | 8710ff7 (through WR-07) | OPENBAO-MAINTENANCE-TEST-OK checks=32 |
| `bash tests/openbao-exact-image.test.sh` (local Docker, openbao/openbao:2.7.1) | 471a95f (HEAD) | OPENBAO-EXACT-IMAGE-OK mode=full checks=143 |
| `bash tests/openbao-api-wiring.test.sh --self-test` | HEAD | API-WIRING-OK, 14/14 mutations refused |
| `bash tests/openbao-api-wiring.test.sh --source thinx.yml <parent>/docker-swarm.yml` | HEAD | API-WIRING-OK mode=source |
| `bash -n` on every `scripts/*.sh`, `tests/*.sh`, `restart.sh` | HEAD | all pass except `scripts/set-admin.sh`, which already failed before this work and is not part of Phase 39 |

Regression checks added: the tmpfiles entry and work-dir recreation (CR-01); no leaked throwaway (WR-02); the
ambiguous-recovery → failure → new begin sequence (WR-05); an unsafe lock dir refused before any OpenBao call
(WR-06); the docker stub accepting only a stdin-body AppRole login (WR-07); REPIN_REQUIRED recorded and cleared
(WR-12); a modified preflight plus a planted fsmonitor hook (WR-13); five destructive operator calls denied
while read and update still work (WR-14); a truncated certificate refused, ENTRY_INVALID, and discard-invalid on
both a valid and an invalid entry (WR-15).

## Fixed Issues

### CR-01: `/run/openbao-maintenance` is never recreated after a reboot

**Files modified:** `openbao/tmpfiles.conf` (new), `scripts/openbao-common.sh`, `scripts/openbao-cert-renew.sh`, `scripts/openbao-bootstrap.sh`, `scripts/openbao-restore-rehearsal.sh`, `scripts/openbao-maintenance-install.sh`, `scripts/openbao-preflight.sh`, `tests/openbao-maintenance.test.sh`
**Commits:** f11c7dc, 02b3cb5 (follow-up: the source preflight allow-list accepts `openbao/tmpfiles.conf`)
**Applied fix:**
- New `obc_ensure_run_dir`. It recreates the work dir as 0700 root after a reboot. It refuses a symlink, refuses a /run that is not tmpfs, and refuses a wrong owner or mode (RUN_DIR_UNSAFE / RUN_NOT_TMPFS / RUN_DIR_CREATE_FAILED). cert-renew, bootstrap and restore-rehearsal call it before they use the dir.
- The sender install now ships `/etc/tmpfiles.d/openbao-maintenance.conf` and applies it with `systemd-tmpfiles --create`, which makes it self-installing.

### WR-01: Many cron failure paths exit before the incident/alert machinery runs

**Files modified:** `scripts/openbao-common.sh`, `scripts/openbao-cert-renew.sh`, `scripts/openbao-backup.sh`, `scripts/openbao-audit-reopen.sh`
**Commit:** f20d842
**Applied fix:**
- The EXIT trap is installed before the env, host and tool checks. Any non-zero exit of a mutating command that did not already report through `fail` opens the incident with `${OBC_LAST_CODE:-EXIT_rc}` (obc_die records its code).
- A held lock older than a threshold reports LOCK_STUCK and opens an incident. The lock file is opened for append, so its mtime is the time the lock was taken.
- Every docker call is bounded by `obc_timeout` (GNU `timeout --foreground`; required outside fixtures). The snapshot gets 900 s.
**Status:** fixed: requires human verification. This changes when alerts fire.

### WR-02: Exact-image throwaway containers leak on every failed rehearsal

**Files modified:** `scripts/openbao-cert-renew.sh`, `tests/openbao-maintenance.test.sh`
**Commit:** efd0206
**Applied fix:**
- `throwaway_reload` is a wrapper that always runs `docker rm -f` on its container. The throwaway also starts with `--rm`.
- The EXIT cleanup sweeps any container labelled `com.thinx.openbao.throwaway=cert-renew`.
- The test asserts that none is left after a failed rehearsal.

### WR-03: A failing issuer renewal blocks leaf renewal

**Files modified:** `scripts/openbao-cert-renew.sh`
**Commit:** 7ec47f5
**Applied fix:**
- `cmd_daily` runs the issuer renewal in a subshell. On failure (other than rc 4, ROLLBACK_BROKEN) it caps the leaf lifetime at the CA's remaining days minus 1, still renews a due leaf, and then fails ISSUER_RENEWAL_FAILED.
- A leaf that is due but could live 31 days or less fails loudly.
**Status:** fixed: requires human verification (logic).

### WR-04: Any successful sub-command closes the cert-renew incident

**Files modified:** `scripts/openbao-cert-renew.sh`
**Commit:** 9200b8d
**Applied fix:** Only `daily`, `renew-leaf`, `renew-issuer` and `exercise` record `ok` against the incident. Operator commands such as arm, deploy-api-trust and verify no longer send a false RECOVERED.
**Status:** fixed: requires human verification (state machine).

### WR-05: Silent new failure after an ambiguous recovery alert

**Files modified:** `scripts/openbao-common.sh`, `tests/openbao-maintenance.test.sh`
**Commit:** 1b4ba81
**Applied fix:**
- A failure in `recovery-pending` after an ambiguous alert starts a new incident and sends a new FAILING alert. If the begin alert was sent and nothing ambiguous happened, it is suppressed back to `failure-sent`. Otherwise it goes to `failure-pending`.
- The test covers the fail → ambiguous recovery → fail → healthy sequence.
**Status:** fixed: requires human verification (state machine).

### WR-06: Lock files in world-writable `/run/lock`, ownership never checked

**Files modified:** `scripts/openbao-common.sh`, `openbao/tmpfiles.conf`, `tests/openbao-maintenance.test.sh`, `tests/openbao-bootstrap.test.sh`
**Commits:** 95e979c, 2e40ef4 (follow-up: the macOS perl flock shim in the tests implements `-w`; in fixture mode a lock owned by the invoking user is accepted when the layout expects uid 0)
**Applied fix:**
- Locks live in `/run/lock/openbao`. It must be a 0700 directory owned by root; it is created on demand and also by tmpfiles at boot. The sticky `/run/lock` keeps anyone else from renaming it.
- Every opened lock file must be a regular file owned by root (LOCK_DIR_UNSAFE / LOCK_UNSAFE).
- The incident lock waits at most 120 s (`flock -w 120`, INCIDENT_LOCK_TIMEOUT) instead of blocking forever.

### WR-07: role_id, canary plaintext and ciphertext reach `bao`'s argv

**Files modified:** `scripts/openbao-common.sh`, `scripts/openbao-bootstrap.sh`, `scripts/openbao-verify.sh`, `scripts/openbao-restore-rehearsal.sh`, `tests/openbao-maintenance.test.sh`
**Commit:** 8710ff7
**Applied fix:**
- The AppRole login and all Transit canary calls (encrypt, decrypt, rewrap) now use `bao write PATH -`. The JSON body is built by jq from stdin (`obc_json_body`), so the values are in no argv of bao, sh or jq.
- The maintenance docker stub refuses a login passed any other way.
- Note: `tests/openbao-exact-image.test.sh` still has its own test-only login helper with env RID/SID. That is test code, not deployed.

### WR-08: A secret read from a terminal fd is echoed

**Files modified:** `scripts/openbao-common.sh`
**Commit:** 4251533
**Applied fix:** `obc_read_secret_fd` reads a TTY fd with `read -s` and prints a newline to stderr.

### WR-09: A failed SecretID issuance leaves an empty credential file

**Files modified:** `scripts/openbao-bootstrap.sh`
**Commit:** 49cf08f
**Applied fix:**
- The role id and secret id are captured and checked with `jq -er` first, and only complete values are written.
- CREDENTIALS_KEPT now needs non-empty files (`-s`), so an empty file is issued again.

### WR-10: `step_init` throws away the root token and recovery share

**Files modified:** `scripts/openbao-bootstrap.sh`
**Commit:** 347f98a
**Applied fix:**
- `init_started_at` is recorded before `operator init`. The root token and share are written to tmpfs before the shape check.
- A shape mismatch keeps the material, is recorded (`init_shape_mismatch`) and refuses.
- An initialized server with `init_started_at` but no `initialized_at` resumes from the tmpfs files (INIT_RESUMED) when both are present. Otherwise it refuses INIT_INTERRUPTED, never a blind re-init.
**Status:** fixed: requires human verification. This is a crash-window state machine; there is no fault-injection test for a kill between init and the ledger write.

### WR-11: Root revocation cannot be resumed after a crash

**Files modified:** `scripts/openbao-bootstrap.sh`
**Commit:** 3c73a32
**Applied fix:**
- `root_revoke_started_at` is recorded first.
- A failing `revoke -self` whose `lookup-self` already returns 403 counts as an earlier interrupted revocation.
- `root_revoked_at` and `root_rejection_proved_at` are written before the token file is removed.
- A token file that is gone after revocation started but was never recorded reports ROOT_TOKEN_LOST. The operator then has to revoke by accessor (runbook) before recording; the tool does not guess.
**Status:** fixed: requires human verification (crash-window state machine; there is no fault-injection test).

### WR-12: Stack files pin a config name the trust consumer changes imperatively

**Files modified (thinx-swarm):** `scripts/openbao-common.sh`, `scripts/openbao-cert-renew.sh`, `scripts/openbao-verify.sh`, `scripts/openbao-maintenance-install.sh`, `restart.sh`, `thinx.yml` (comment only), `tests/openbao-maintenance.test.sh`
**Files modified (thinx-device-api):** `docker-swarm.yml` (comment only)
**Commits:** 63c2240 (thinx-swarm), 64aa9731 (thinx-device-api, thinx-staging)
**Applied fix:**
- `obc_stack_ca_pin` reads the top-level `configs.openbao-ca.name` from a stack file (`OBC_STACK_FILE`, default `$OBC_SOURCE/thinx.yml`).
- `deploy_api_trust` prints `REPIN_REQUIRED` and records `repin_required=<name>` when the pin lags, and clears the record once the pin matches.
- `openbao-verify.sh --api-service` and `openbao-maintenance-install.sh --check` (armed consumer) fail with API_CA_PIN_DRIFT.
- `restart.sh` refuses to deploy when thinx_api's live CA config differs from the pin. A missing thinx_api service is treated as a first deploy and allowed.
**Operator workflow:** after an issuer renewal, set `name:` to the reported config in both stack files and commit both.

### WR-13: Installers run an unchecked `openbao-preflight.sh` as root

**Files modified:** `scripts/openbao-common.sh`, `scripts/openbao-install.sh`, `scripts/openbao-maintenance-install.sh`, `tests/openbao-bootstrap.test.sh`
**Commit:** 1d6f246
**Applied fix:**
- `scripts/openbao-preflight.sh` is in the clean-tree gate.
- Both installers call git through `obc_git` / `obc_git_clean`: `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `diff.external=`, `--no-ext-diff --no-textconv`.
**Not done, deliberately:** an empty `GIT_CONFIG_GLOBAL`. root's global `safe.directory` may be what lets git read the Gluster checkout, so clearing it could break the production install. The optional `--expect-rev` pin was not added either. Operator call.

### WR-14: Operator policy lets the auth mounts and AppRoles be deleted

**Files modified:** `openbao/policies/operator.hcl`, `tests/openbao-exact-image.test.sh`
**Commit:** c445821
**Applied fix:**
- Specific paths override the `*` grants: `sys/auth/approle` and `sys/auth/userpass` get read+sudo; `auth/approle/role/thinx-api`, `auth/approle/role/backup` and `auth/userpass/users/operator` get read+update.
- The exact-image matrix proves that `auth disable approle` and `auth disable userpass`, deleting either role and deleting the operator user are all denied with 403, while reading and updating the role still work.
**Operator flag:** the conservative (narrower) option was applied. It reaches the live server only through a deliberate `bao policy write operator`; see deploy step 4.

### WR-15: Recovery archive accepts a truncated artifact and cannot replace it

**Files modified:** `scripts/openbao-recovery-archive.sh` (content only, kept at mode 100644), `tests/openbao-bootstrap.test.sh`
**Commit:** 70a7a4c
**Applied fix:**
- Completeness is checked per kind: ca-key needs its END line and `openssl pkey -noout`; ca-cert needs its END line and `openssl x509 -noout`; the share must decode to 32 or 33 bytes.
- `verify` re-checks every entry (ENTRY_INVALID).
- The new `discard-invalid NAME` removes only an entry that fails that re-check. A complete artifact is refused with ENTRY_VALID.
- This differs from the review's `discard-unconfirmed` / `confirmed=no` suggestion: whether an entry may be removed is decided from its content, not from receipt state.

### WR-16: Unchecked mutations in `renew_issuer`

**Files modified:** `scripts/openbao-cert-renew.sh`
**Commit:** 471a95f
**Applied fix:**
- Both stage moves now run `rollback_issuer` and fail STAGE_FINALIZE.
- The retire copy fails CA_RETIRE_COPY_FAILED, because server and API are already on the renewed anchor at that point.

---

_Fixed: 2026-10-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
