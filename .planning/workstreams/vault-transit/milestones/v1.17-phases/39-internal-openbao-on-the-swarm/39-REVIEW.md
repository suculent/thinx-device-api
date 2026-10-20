---
phase: 39-internal-openbao-on-the-swarm
reviewed: 2026-10-18T20:16:49Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-common.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-preflight.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-install.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-recovery-archive.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-verify.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-backup.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-snapshot-receive.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-restore-rehearsal.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-audit-reopen.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-maintenance-install.sh
  - /Users/sychram/Repositories/thinx-swarm/openbao/policies/thinx-api.hcl
  - /Users/sychram/Repositories/thinx-swarm/openbao/policies/operator.hcl
  - /Users/sychram/Repositories/thinx-swarm/openbao/policies/backup.hcl
  - /Users/sychram/Repositories/thinx-swarm/openbao/emergency-unix.hcl
  - /Users/sychram/Repositories/thinx-swarm/openbao/openssl.cnf
  - /Users/sychram/Repositories/thinx-swarm/openbao/backup.cron
  - /Users/sychram/Repositories/thinx-swarm/openbao/cert-renew.cron
  - /Users/sychram/Repositories/thinx-swarm/openbao/logrotate.conf
  - /Users/sychram/Repositories/thinx-swarm/vault.yml
  - /Users/sychram/Repositories/thinx-swarm/vault.conf
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
  - /Users/sychram/Repositories/thinx-api/thinx-device-api/docker-swarm.yml
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-bootstrap.test.sh
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-exact-image.test.sh
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-maintenance.test.sh
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh
findings:
  critical: 1
  warning: 16
  info: 8
  total: 25
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-10-18T20:16:49Z
**Depth:** standard
**Files Reviewed:** 28 (thinx.yml and docker-swarm.yml: Phase 39 diff only; the four test files were skimmed only for harness bugs that would hide real failures)
**Status:** issues_found
**Scope:** thinx-swarm `2121066fedf4..5897b8b`, parent `9b91a81fe26c..1b9010b7`

## Summary

I reviewed the root-run OpenBao host tooling: the shared library, the installers, bootstrap, verifier, backup with its forced-command receiver, cert renewal with the API trust consumer, the restore rehearsal, the audit reopen and the Mac recovery archive. I also reviewed the three policies, the cron, logrotate and openssl profiles, the stack/config files and the Phase 39 API wiring. I ran `bash -n` on every script and all of them parse. shellcheck is not installed on this machine, so no shellcheck pass was done.

Overall the secret-handling discipline is strong. Secrets go in through env or stdin, `curl -K` keeps the webhook out of argv, xtrace is refused, the umask is 077, temp files are atomic and mode 0600, and the inputs to the forced receiver are tightly constrained. I found no way to escape the receiver: every verb is matched against an anchored regex over a `[a-z0-9 .TZ-]` charset, stems are fixed-format, nothing comes from the path or argv, and prune is age-gated and never empties a node. The thinx-api and backup policies are minimal.

Most defects are in operational robustness. The most serious:

- **Reboot breaks cert renewal.** After any reboot of micro, the daily renewal fails permanently, because nothing recreates the tmpfs work directory. The listener leaf then expires.
- **Failures that never alert.** Several failure paths exit before the incident/Slack machinery runs.
- **Leaked throwaway containers.** A failed exact-image rehearsal leaves a running container behind, holding copies of the live leaf key.
- **Secret-adjacent values in argv.** role_id, canary and ciphertext values appear in process argv.
- **Bootstrap/custody steps that can wedge.** Several steps are not idempotent or not crash-safe. Bootstrap is already complete, so these are latent today, but they matter for disaster recovery and any re-bootstrap.

## Critical Issues

### CR-01: `/run/openbao-maintenance` is never recreated after a reboot, so the daily cert renewal fails until someone re-runs an installer and the listener leaf eventually expires

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh:431-432` (also `openbao-common.sh:77,99`, `openbao-maintenance-install.sh:107`, `openbao-restore-rehearsal.sh:68,170`, `openbao-bootstrap.sh:71,148`)

**Issue:** `OBC_RUN_DIR=/run/openbao-maintenance` sits on the `/run` tmpfs. Only `openbao-install.sh` and `openbao-maintenance-install.sh` create it (`apply_layout` / `apply_dirs`); there is no `tmpfiles.d` entry, no boot hook, and no self-creation in the jobs. After the first reboot of micro:

- `preconditions` hits `[[ -d "$OBC_RUN_DIR" ]] || fail RUN_DIR_MISSING` on every `--daily` run. The incident alerts once and then suppresses.
- No leaf renewal ever happens again. The leaf is 90 days and renewal starts at 30 days left, so within about 60 days of an unattended reboot `thinx_api` (verified TLS to `openbao.internal`) loses OpenBao.
- `openbao-install.sh --check`, `openbao-maintenance-install.sh --check` and therefore `openbao-verify.sh --full/--maintenance` also go red with `PATH_MISSING`.
- `openbao-bootstrap.sh` dies under `set -e` at `mkdir -m 700 "$TR"` (no `-p`, no verdict). The rehearsal and the transfer re-proof fail at `mktemp -d "$OBC_RUN_DIR/..."`.

The runbook has no reboot step. A single Slack line and a manual re-install is the only safeguard against an eventual production TLS outage.

**Fix:** have the maintenance installer ship a tmpfiles.d entry, check it in `--check`, and let the jobs (re)create the directory safely themselves:

```bash
# openbao-maintenance-install.sh FILES_SENDER (source file openbao/tmpfiles.conf):
#   d /run/openbao-maintenance 0700 root root -
openbao/tmpfiles.conf|/etc/tmpfiles.d/openbao-maintenance.conf|644

# openbao-common.sh
obc_ensure_run_dir() {
  [[ "$(obc_fstype "$OBC_ROOT/run")" == tmpfs || "$OBC_FIXTURE" == 1 ]] || obc_die RUN_NOT_TMPFS
  [[ -d "$OBC_RUN_DIR" ]] || mkdir -m 700 "$OBC_RUN_DIR"
  [[ ! -L "$OBC_RUN_DIR" && "$(obc_stat "$OBC_RUN_DIR" | cut -d'|' -f1,2,4)" == "directory|$OBC_UID|700" ]] \
    || obc_die RUN_DIR_UNSAFE
}
# cert-renew preconditions / rehearsal / bootstrap: call obc_ensure_run_dir instead of failing or `mkdir` without -p
```

## Warnings

### WR-01: Many cron failure paths exit before the incident/alert machinery runs, so they fail silently (D-20/D-21)

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-backup.sh:55-58,193,210-211,283`; `openbao-cert-renew.sh:599-605`; `openbao-audit-reopen.sh:40-51`; `openbao/backup.cron:10`; `openbao/cert-renew.cron:10`

**Issue:** The cron lines discard all output (`>/dev/null 2>&1`, `MAILTO=""`), so the only failure signal is `obc_incident` inside each job's `fail()`. Several paths never reach it:

- **Setup failures.** These die through `obc_die` with no incident: `obc_refuse_secret_env`, `obc_assert_host` (for example `docker info` failing during a dockerd bounce, which is exactly the 2026-09-22 failure mode, gives `NOT_SWARM_MANAGER`) and `obc_require_tools`.
- **Lock held.** The lock-held path exits 75 without an incident. A previous run that is stuck holds the lock indefinitely, because `docker exec ... bao operator raft snapshot save`, `docker service ps` and `docker config inspect` have no timeout. Every later day then also exits 75 silently.
- **Bare `set -e` exits.** `mkdir -m 700 "$INCOMING"`, `STAGE=$(mktemp -d ...)`, `chmod`, `obc_state_set` and any other unchecked command abort through errexit with no verdict and no incident.

The only backstop is the manual `--expect-full` "backup within 26 h" check.

**Fix:** open the incident from an EXIT trap whenever a non-zero exit was not already recorded, and bound the docker calls:

```bash
FAILED_CODE=""
cleanup() {
  local rc=$?
  ...
  if [[ $rc -ne 0 && $rc -ne 2 && -z "$FAILED_CODE" && "$MODE" != verify ]]; then
    obc_incident "$INCIDENT_JOB" fail "EXIT_$rc" || true
  fi
  exit "$rc"
}
# lock held for longer than a day is itself an incident:
if ! obc_lock backup; then
  [[ -n "$(find "$OBC_LOCK_DIR/openbao-backup.lock" -mmin +1500 2>/dev/null)" ]] && obc_incident backup fail LOCK_STUCK || true
  exit 75
fi
# and: timeout 900 docker exec ... for the snapshot stream, timeout 60 for every other docker call
```

Move `obc_assert_host` / `obc_require_tools` after the trap is installed.

### WR-02: Exact-image throwaway containers leak on every failed rehearsal (the subshell owns `THROWAWAY`)

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh:225-253,439,489,101`

**Issue:** `throwaway_reload` is only ever called as `r=$(throwaway_reload ...) || fail ...`, so it runs in a command-substitution subshell. `THROWAWAY=...` is set in that subshell and the parent's `cleanup` sees `THROWAWAY=""`. Subshells also do not inherit the EXIT trap. On every failure path after `docker run -d` the container is never removed: `THROWAWAY_NOT_LISTENING`, `THROWAWAY_OLD_NOT_SERVED`, `THROWAWAY_RELOAD_NOT_SERVED`, or the `throwaway-reload` fault.

The container has no `--rm` and keeps running `bao server` with both the live leaf key and the staged key loaded. Because the incident suppresses repeats, a daily failure leaks one more container every day with no further alert. The runbook entry "no throwaway left" was only verified on the success path.

**Fix:** remove the container inside the function on every exit, and sweep stale ones by label in the parent:

```bash
throwaway_reload() {
  ...
  THROWAWAY="openbao-cert-throwaway-$$-$RANDOM"
  # shellcheck disable=SC2064
  trap "docker rm -f '$THROWAWAY' >/dev/null 2>&1" RETURN
  docker run -d --rm --name "$THROWAWAY" ...
}
# cleanup(): also
docker ps -aq --filter label=com.thinx.openbao.throwaway=cert-renew | xargs -r docker rm -f >/dev/null 2>&1 || true
```

### WR-03: An issuer renewal that keeps failing blocks leaf renewal, so the leaf expires

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh:520-528`

**Issue:** `cmd_daily` checks the issuer first, and `renew_issuer` reaches `fail` (and exits) on any problem: `API_TASK_NOT_FOUND` because the API is mid-restart or has two tasks, a remote probe-job failure on core, an unarmed state, and so on. The leaf check below it is then never reached. Once the CA is inside its 120-day window, each failing day consumes leaf lifetime. After 30 such days the leaf is past its renewal threshold and still never renewed, and the operator has had exactly one alert.

**Fix:** when the issuer transaction fails, still renew the leaf. Cap its `-days` so it never outlives the current CA certificate, then report the issuer failure:

```bash
if ! valid_for "$OBC_CA_DIR/ca.pem" $((ISSUER_RENEW_DAYS * 86400)); then
  if ( renew_issuer normal ); then return 0; fi
  ISSUER_FAILED=1   # fall through
fi
if ! r=$(validate_leaf ...); then renew_leaf; fi        # renew_leaf: LEAF_DAYS=min(90, ca_days_left-1)
[[ -z "${ISSUER_FAILED:-}" ]] || fail ISSUER_RENEWAL_FAILED "leaf handled; issuer still due"
```

### WR-04: Any successful sub-command closes the cert-renew incident and sends a false RECOVERED alert

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh:621`

**Issue:** `main` runs `obc_incident "$INCIDENT_JOB" ok` after every command, including `arm`, `deploy-api-trust` and `renew-leaf`. Suppose `--daily` is failing (for example `SERVED_LEAF_MISMATCH`) and the operator runs `--arm-api-trust` or `--deploy-api-trust`. That success posts "RECOVERED" to Slack and clears the incident while the daily failure is still unresolved. The next daily then opens a "new" incident. Both alerts are wrong under D-21.

**Fix:** record `ok` only for the commands that prove the daily invariant (`daily`, `renew-leaf`, `renew-issuer`, `exercise`). Better, record it only after a final `served_is`/`validate_leaf` of `current` passes:

```bash
case "$CMD" in daily|renew-leaf|renew-issuer|exercise) obc_incident "$INCIDENT_JOB" ok ;; esac
```

### WR-05: Incident state machine stays silent about a new failure after an ambiguous recovery alert

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-common.sh:494-495,518`

**Issue:** In `recovery-pending` with `bsent=yes`, a new failure sets `st=failure-sent` and `kind=""`, so no alert is sent. That is right when the recovery alert definitely failed. When it was `ambiguous` (timeout or dropped connection after sending, so possibly delivered), the operator may already have read "RECOVERED", and the new failure is then suppressed until it recovers again. That is a silent loss of exactly the kind the header says cannot happen.

**Fix:** treat an ambiguous pending recovery as delivered when a new failure arrives, and start a new incident:

```bash
recovery-pending)
  if [[ "$alert" == ambiguous ]]; then since=$now; st=failure-pending; bsent=no; alert=none; amb=0; kind=begin
  elif [[ "$bsent" == yes ]]; then st=failure-sent; kind=""; OBC_INCIDENT_EVENT=suppressed; alert=none; amb=0
  else st=failure-pending; kind=begin; alert=none; amb=0; fi ;;
```

### WR-06: Lock files live in world-writable `/run/lock` and their ownership is never checked

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-common.sh:78,136-142,475-478`

**Issue:** `OBC_LOCK_DIR=/run/lock` is `1777` on Ubuntu, and the code only checks `! -L` before `exec 9> "$f"`. Any local account, or any container that can write the host `/run/lock`, can pre-create `openbao-backup.lock`, `openbao-cert-renew.lock`, `openbao-receive.lock` or `openbao-incident-<job>.lock`:

- **With `fs.protected_regular=1`:** root's `O_CREAT|O_TRUNC` open is refused. `exec` with a failed redirection kills the non-interactive shell before any incident, so the job dies silently (see WR-01).
- **With `fs.protected_regular=0`:** the other user owns a lock that root opened, can hold the flock, and makes `obc_incident`'s blocking `flock 7` hang the job forever.

The check is also TOCTOU: a symlink can be swapped in after the `-L` test.

**Fix:** keep locks in a root-only directory and verify the opened file:

```bash
OBC_LOCK_DIR="$OBC_ROOT/run/openbao-maintenance/lock"     # 0700 root (see CR-01 for creation)
obc_lock() {
  local f="$OBC_LOCK_DIR/openbao-$1.lock"
  [[ -d "$OBC_LOCK_DIR" ]] || mkdir -m 700 "$OBC_LOCK_DIR"
  exec 9>> "$f"
  [[ "$(obc_stat "/dev/fd/9" 2>/dev/null || obc_stat "$f")" == "file|$OBC_UID|"* ]] || obc_die LOCK_UNSAFE
  flock -n 9
}
# obc_incident: flock -w 120 7 || obc_die INCIDENT_LOCK_TIMEOUT
```

### WR-07: role_id, canary plaintext and ciphertext reach `bao`'s argv, which any local user can read in the host process table

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-common.sh:348` (also `openbao-bootstrap.sh:290-298`, `openbao-verify.sh:201-205`, `openbao-restore-rehearsal.sh:107,225`)

**Issue:** `obc_bao_sh` promises that values never reach any argv, but the scripts it runs expand them into argv:

- `obc_approle_login` runs `bao write ... auth/approle/login role_id="$RID" secret_id=-`. This puts the backup or thinx-api role_id in the `bao` process argv, which is visible through `/proc/<pid>/cmdline` and `ps -ef` on micro to every user, and through `docker top`.
- The canary scripts pass `plaintext="$PT"` and `ciphertext="$C"`. The rehearsal canary is described as "kept only in a 0600 file on the /run tmpfs, never printed", yet it sits in argv during `prepare` and `run`.

role_id alone does not authenticate (`bind_secret_id=true`), but it is half of the credential the headers say is never exposed.

**Fix:** send the whole request body on stdin (`bao write PATH -` reads JSON from stdin):

```bash
obc_approle_login() {
  jq -cn --rawfile r <(printf '%s' "$1") --rawfile s <(printf '%s' "$2") '{role_id:$r, secret_id:$s}' \
    | obc_bao_sh "" 'bao write -format=json auth/approle/login -' 2>/dev/null | jq -er '.auth.client_token'
}
# canaries: jq -cn --arg p "$CAN" '{plaintext:$p}' | obc_bao_sh "$TOK" 'bao write -format=json "transit/encrypt/$K" -' K="$KEY"
```

(`--rawfile` with process substitution keeps the values out of jq's argv as well.)

### WR-08: A secret read from a terminal fd is echoed on screen

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-common.sh:265-279` (used by bootstrap `--operator-password-fd`, verify `--operator-password-fd`, archive `--password-fd`, maintenance-install `--slack-webhook-fd`)

**Issue:** `obc_fd_is_protected` accepts a TTY (`-t "$1"`), but `obc_read_secret_fd` reads with `read -r -u` and no `-s`. `--operator-password-fd 0` typed on a terminal (or `--password-fd 0` in the archive) therefore echoes the operator or archive password in clear, into terminal scrollback and any tmux or `script` log.

**Fix:**

```bash
if [[ -t "$1" ]]; then IFS= read -r -s -u "$1" __v || true; printf '\n' >&2
else IFS= read -r -u "$1" __v || [[ -n "$__v" ]] || obc_die SECRET_EMPTY "fd $1"; fi
```

### WR-09: A failed SecretID issuance leaves an empty credential file that later runs keep as already issued

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh:233-238`

**Issue:** `bao ... | jq -je '.data.secret_id' | obc_atomic_write "$want.secret-id" 600` runs `obc_atomic_write` even when `bao` or `jq` fails. Its `cat > tmp; mv` publishes an empty file and the pipeline then dies. On the next run `[[ -f role-id && -f secret-id ]]` is true, so the step prints `CREDENTIALS_KEPT` and never re-issues. Bootstrap then fails later at `API_LOGIN_FAILED`/`BACKUP_LOGIN_FAILED`, which points at the wrong cause. A SecretID that OpenBao did mint is orphaned and never expires (`secret_id_ttl=0`).

**Fix:** capture first, validate, then publish, and treat empty files as missing:

```bash
if [[ -s "$want.role-id" && -s "$want.secret-id" ]]; then obc_ok CREDENTIALS_KEPT ...; continue; fi
rid=$(obc_bao "$ROOT_TOK" read -format=json "auth/approle/role/$role/role-id" 2>/dev/null | jq -er '.data.role_id') || obc_die ROLE_ID_FAILED "$role"
sid=$(obc_bao "$ROOT_TOK" write -f -format=json "auth/approle/role/$role/secret-id" 2>/dev/null | jq -er '.data.secret_id') || obc_die SECRET_ID_FAILED "$role"
printf '%s' "$rid" | obc_atomic_write "$want.role-id" 600; printf '%s' "$sid" | obc_atomic_write "$want.secret-id" 600; rid=""; sid=""
```

### WR-10: `step_init` throws away the root token and recovery share of a server it has just initialized

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh:172-181`

**Issue:** If the shape check fails (`INIT_SHAPE`), the code clears the init JSON and dies, leaving a server that is now initialized with no root token and no recovery share anywhere. The same happens if the process is killed between `operator init` and the two atomic writes or `lset initialized_at`. The next run then refuses with `INITIALIZED_OUTSIDE_BOOTSTRAP`, and the only way forward is to wipe Raft by hand. The material should be persisted before anything can fail.

**Fix:** write both files first, record `init_started_at` before calling `operator init`, and on a shape mismatch keep the files and stop:

```bash
lset init_started_at "$(obc_now)"
init=$(obc_bao "" operator init ...) || obc_die INIT_FAILED
jq -j '.root_token' <<<"$init" | obc_atomic_write "$ROOT_FILE" 600
jq -j '.recovery_keys_b64[0] // empty' <<<"$init" | obc_atomic_write "$SHARE_FILE" 600
lset initialized_at "$(obc_now)"
[[ "$(jq -r '...shape...' <<<"$init")" == "1,1,0" ]] || { init=""; obc_die INIT_SHAPE "material kept on tmpfs; investigate"; }
```

`step_init` should also treat `init_started_at`-without-`initialized_at` plus present tmpfs files as resumable.

### WR-11: The root revocation step cannot be resumed if it crashes partway through

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh:375-383`

**Issue:** The order is `token revoke -self`, a 403 proof, `rm -f "$ROOT_FILE"`, then `lset root_revoked_at`. A crash after the revoke but before the `rm` leaves the next run doing `load_root`, then `token revoke -self` with a dead token, which gets a 403 and `ROOT_REVOKE_FAILED`. A crash between the `rm` and the `lset` gives `ROOT_TOKEN_UNAVAILABLE`. Either way bootstrap is wedged and needs a hand-edited ledger. The d95e1c7 resume fix only covers failures after `root_revoked_at` is written.

**Fix:** record intent first, and treat a 403 on the revoked token as success:

```bash
lset root_revoke_started_at "$(obc_now)"
if ! obc_bao "$ROOT_TOK" token revoke -self >/dev/null 2>&1; then
  obc_expect_code "$ROOT_TOK" 403 read auth/token/lookup-self || obc_die ROOT_REVOKE_FAILED
fi
...; lset root_revoked_at "$(obc_now)"; lset root_rejection_proved_at "$(obc_now)"; rm -f -- "$ROOT_FILE"
# and: if root_revoke_started_at is set and the root file is gone, prove 403 is impossible without the token -> accept and record
```

### WR-12: The stack files pin a config name that the trust consumer changes imperatively, so the next stack deploy rolls API trust back

**File:** `/Users/sychram/Repositories/thinx-swarm/thinx.yml:66-68,244`; `/Users/sychram/Repositories/thinx-api/thinx-device-api/docker-swarm.yml:125-127,312`; `openbao-cert-renew.sh:406-410`

**Issue:** `openbao-ca` is pinned to `name: openbao-ca-a2b56707515146d7a580`. `deploy_api_trust` creates `openbao-ca-<sha>` and swaps it in with `docker service update` on every issuer renewal or operator `--deploy-api-trust`, but nothing updates either stack file. The next `restart.sh` / `docker stack deploy` of the thinx stack (a documented path) re-attaches the retired anchor. The API keeps working only until that old CA certificate expires, and it may already be near expiry, since renewal starts 120 days before. `--verify-api-trust-consumer` only catches the drift if someone runs it. The "keep `name:` equal" comment is a manual step with no gate.

**Fix:** make the drift fail closed. Have `deploy_api_trust` print a `REPIN_REQUIRED` verdict and record `repin_required=<name>` in its state. Make `openbao-maintenance-install.sh --check` and `openbao-verify.sh --api-service` compare the live config name with the `name:` in `$SOURCE/thinx.yml`. Have `restart.sh` refuse to deploy when they differ.

### WR-13: The installers run an unchecked `openbao-preflight.sh` from the Gluster checkout as root

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-install.sh:134-151`; `openbao-maintenance-install.sh:171-176`

**Issue:** The clean-tree gate (`git diff --quiet HEAD -- "${files[@]}"`) covers only `INSTALL_MAP`. `bash "$SOURCE/scripts/openbao-preflight.sh"` is then executed as root, and it is not in that list, so a modified or untracked preflight runs as root on micro unchecked. That includes its `docker compose config` call, and its verdict gates the install.

Separately, running `git` as root inside a root-owned checkout on shared GlusterFS also executes any `core.fsmonitor`/`core.hooksPath` configured in that checkout's `.git/config`, because `safe.directory` does not protect root-owned repos.

**Fix:** add `scripts/openbao-preflight.sh` to the checked file list. Run git with `-c core.fsmonitor= -c core.hooksPath=/dev/null` and an empty `GIT_CONFIG_GLOBAL`. Better still, verify `HEAD` against an expected commit passed on the command line.

### WR-14: The operator policy has no guardrail against deleting the auth mounts or the API's AppRole

**File:** `/Users/sychram/Repositories/thinx-swarm/openbao/policies/operator.hcl:107-121`

**Issue:** The header says the denials guard against mistakes. A mistyped `bao auth disable approle` or `bao delete auth/approle/role/thinx-api` is allowed (`sys/auth/*` and `auth/approle/role/*` both carry `delete`). It irreversibly destroys the API's identity and every SecretID; only a snapshot restore recovers it, and a restore rewinds all auth state. `auth disable userpass` locks the operator out and forces the emergency A1 path. These are the same class of accident the Transit guardrails prevent. The policy-admin trust limitation is stated, but mistake-prevention guardrails are missing for exactly these paths.

**Fix:** deny the destructive forms explicitly; deliberate changes then go through a policy edit:

```hcl
path "sys/auth/approle"  { capabilities = ["read"] }
path "sys/auth/userpass" { capabilities = ["read"] }
path "auth/approle/role/thinx-api" { capabilities = ["read", "update"] }
path "auth/approle/role/backup"    { capabilities = ["read", "update"] }
path "auth/userpass/users/operator" { capabilities = ["read", "update"] }
```

(The more specific paths take precedence over the `*` grants. Extend `tests/openbao-exact-image.test.sh --policy-matrix` to cover them.)

### WR-15: The recovery archive accepts a truncated artifact and has no way to replace it

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-recovery-archive.sh:231-249,258-271`

**Issue:** `ssh micro 'emit X' | archive add-artifact X --receipt | ssh micro confirm-custody` archives whatever bytes arrive before EOF:

- A dropped ssh connection yields a truncated `ca/ca.key`, which still passes `artifact_ok` (it only greps for the `BEGIN ... PRIVATE KEY` line).
- A truncated recovery share is still valid base64.
- The left-hand ssh's exit status is never checked.

micro then refuses the receipt with `CUSTODY_MISMATCH`, but the bad artifact is now permanent: `ARTIFACT_EXISTS` blocks every retry, the tool has no replace or remove command, and `verify` reports it as a valid entry. For a seal generation a short read is rejected (exactly 32 bytes are required), but the CA key and the share have no completeness check.

**Fix:** validate completeness per kind before appending. For ca-key, require the `END` line and `openssl pkey -noout -in "$f"` to succeed. For the share, require the expected decoded length. Also add a `discard-unconfirmed NAME` command that removes an entry the server has not receipted, and record `confirmed=no` in the manifest until micro's confirm succeeds.

### WR-16: Unchecked mutations in `renew_issuer` abort through `set -e` with no rollback and no incident

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-cert-renew.sh:490,502,505`

**Issue:** `mv "$stage1" ...`, `mv "$stage2" ...` and `cp -p ca.pem ca.pem.retired-*` have no `||` handler. A failure here, after `deploy_api_trust(overlap)` or `(renewed-only)` has already changed `thinx_api`, exits through errexit without `rollback_issuer`, without `fail` (so no incident or alert) and without ROLLBACK verdicts. The cron run is silent and the API is left on an intermediate bundle.

**Fix:**

```bash
mv "$stage1" "$OBC_TLS_DIR/$n1" || { rollback_issuer "$cur" "$orig_cfg"; fail STAGE_FINALIZE "original restored"; }
mv "$stage2" "$OBC_TLS_DIR/$n2" || { rollback_issuer "$cur" "$orig_cfg"; fail STAGE_FINALIZE "original restored"; }
cp -p "$OBC_CA_DIR/ca.pem" "$OBC_CA_DIR/ca.pem.retired-$(...)" || fail CA_RETIRE_COPY_FAILED "server and API already on the renewed anchor"
```

## Info

### IN-01: `confirm-custody` lets a crafted receipt name escape the seal directory

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh:464`

**Issue:** `seal-g[1-9]*.key)` is a case glob, and `*` matches `/`. `RECEIPT seal-g1/../../../../etc/x.key <sha>` therefore resolves `f` outside `$OBC_SEAL_DIR` and compares its sha256, a hash-equality oracle, before `obc_state_set` dies on the key name. The caller is root-only, so impact is low.
**Fix:** `[[ "$name" =~ ^seal-g[1-9][0-9]*\.key$ ]] || obc_die RECEIPT_NAME`.

### IN-02: The fallback post-revocation snapshot says "replicate with openbao-backup.sh", but that script never picks it up

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-bootstrap.sh:398-404`

**Issue:** `bootstrap-post-revocation-<ts>.snap` is a loose file in `/var/backups/openbao`. `obc_list_pairs` only lists `openbao-<stem>/` pairs, so the file is never replicated or pruned. It also goes through the task's 16 MB `/tmp`.
**Fix:** require `openbao-backup.sh` (refuse the fallback), or write a proper `<stem>/` pair and fix the message.

### IN-03: `openbao-verify.sh --full` stops at the first API-denial mismatch, without the final verdict line

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-verify.sh:217`

**Issue:** The last statement of `check_api_role` is `[[ $denied -eq 13 ]] && obc_ok ...`. When it is false the function returns 1, errexit kills the script, and the backup, audit, root-revocation and privileged checks never run. The run still fails closed (rc 1), but the report is incomplete.
**Fix:** `if [[ $denied -eq 13 ]]; then obc_ok ...; fi`.

### IN-04: `openbao-common.sh` is installed by two installers from possibly different revisions

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-install.sh:119`; `openbao-maintenance-install.sh:123,136`

**Issue:** Whichever installer runs last overwrites the shared library used by every other installed script, and each installer records only its own `source_rev`. This allows silent version skew.
**Fix:** record and check one `common_rev`, or refuse when the installed common differs from the other installer's recorded revision.

### IN-05: The private CA has no name constraints

**File:** `/Users/sychram/Repositories/thinx-swarm/openbao/openssl.cnf:51-54`

**Issue:** The CA can sign any name. A leaked `ca.key` can therefore mint certificates for anything a client that trusts the bundle would accept.
**Fix:** add `nameConstraints = critical, permitted;DNS:openbao.internal, permitted;DNS:localhost, permitted;IP:127.0.0.1/255.255.255.255` to `v3_ca` (renewal keeps the key, so it rolls out at the next issuer renewal).

### IN-06: The rehearsal's `record` dies on an odd `--stem` and exits 1 instead of the documented 3

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-restore-rehearsal.sh:76-80,150`

**Issue:** `refuse STEM_INVALID` calls `record`, which builds a key from the raw `$STEM`. A stem containing `/` or a space hits `STATE_BAD_KEY` and exits 1, not 3.
**Fix:** use `rehearsal.invalid-stem.<gen>.<stamp>` when `obc_stem_ok` fails.

### IN-07: Verification probes leave tokens and temporary snapshots behind

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-verify.sh:330-341,224`; `openbao-bootstrap.sh:316`

**Issue:** The in-task `TASK_JS` login never revokes its thinx-api token (20 min TTL). The verify and bootstrap snapshot proofs write to the task's 16 MB `/tmp`, so they will start failing once the Raft snapshot grows past that size, while `openbao-backup.sh` deliberately streams instead.
**Fix:** call `auth/token/revoke-self` at the end of `TASK_JS`, and stream proof snapshots to `/dev/stdout | wc -c` instead of `/tmp`.

### IN-08: `--verify-both-nodes` takes no lock

**File:** `/Users/sychram/Repositories/thinx-swarm/scripts/openbao-backup.sh:280-281`

**Issue:** A verify that runs concurrently with a daily prune or backlog transfer can report spurious `VERIFY_BACKLOG` or `VERIFY_LOCAL_PAIR_CORRUPT` results.
**Fix:** take the `backup` lock in shared mode (`flock -s`) for verify, or retry once on mismatch.

---

_Reviewed: 2026-10-18T20:16:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
