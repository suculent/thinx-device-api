# OpenBao Operations Runbook (Phase 39, v1.17)

Internal OpenBao for the THiNX API: verified TLS, node-local Raft, static-seal auto-unseal, file audit, the
non-exportable `thinx-deploy-keys` Transit key and the restricted `thinx-api` AppRole.

**SSH:** `ssh micro`, `ssh core` (aliases in the operator's `~/.aliases`; host, port, user and key stay out of this
repository, as in `swarm.md`). Every command below runs as root on the node named. Commands that need the operator
password, the recovery-archive password or archive contents are run by the operator in their own terminal; their
output never contains a secret value.

**Never:** print, paste, log or commit a token, password, recovery share, seal key, CA key, SecretID, canary or
ciphertext; publish a port or Traefik route for OpenBao; bind GlusterFS into it; `docker stack deploy` /
`restart.sh` the `thinx` or `traefik` stacks for OpenBao work; run `bao` with an inherited `BAO_TOKEN`/`VAULT_TOKEN`.

---

## 1. What runs where

| Item | Location | Notes |
|---|---|---|
| Service | stack `vault`, service `vault_openbao`, image `openbao/openbao:2.7.1` (tag, never a digest) | 1 replica, pinned to `micro` (manager), `stop-first` |
| Network | `openbao-internal` overlay, `Internal=true`, not attachable | alias `openbao.internal`; no published port, no Traefik label |
| Config | `micro:/etc/openbao/config/openbao.hcl` (installed copy of `thinx-swarm/vault.conf`) | the directory may hold only this file |
| TLS | `micro:/etc/openbao/tls/current -> r<UTC>/{tls.crt,tls.key,ca.pem}` | leaf EC P-256 90 d, SANs `openbao.internal`, `localhost`, `127.0.0.1` |
| CA | `micro:/etc/openbao/ca/{ca.key,ca.pem}` (0600 root) | EC P-384, 1825 d; key also in the offline archive |
| Seal | `micro:/var/lib/openbao/seal/seal-gN.key` (32 raw bytes, 0600) | current generation only; retired ones live only in the archive |
| Raft | `micro:/var/lib/openbao/raft` | node-local, never Gluster |
| Audit | `micro:/var/log/openbao/audit.log` (0600, HMAC-redacted) | rotated by logrotate (Task 3) |
| Snapshots | `micro:/var/backups/openbao/<stem>/` and `core:/var/backups/openbao/<stem>/` | 90-day retention on both |
| Maintenance state | `micro:/var/lib/openbao-maintenance/{credentials,state,log}` (0700) | backup + thinx-api AppRole credentials, transfer key/pin |
| Host scripts | `/usr/local/sbin/openbao-*.sh` on micro (and the receiver on core) | node-local copies; cron never runs the Gluster checkout |
| Offline custody | encrypted AES-256 image on the operator's Mac (`scripts/openbao-recovery-archive.sh`) | seal generations, recovery share, CA key + cert |

Legacy `/mnt/glusterfs/vault` and `/mnt/gluster/vault` (dormant Vault 1.5.5 data) are preserved untouched: never
read, migrated or deleted in Phase 39.

## 2. Changing source (repo-first)

```bash
# laptop, thinx-swarm: commit (signed), then
git push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/<key> -p<port>" git push ssh://root@micro/mnt/gluster/deployment/swarm \
  master:refs/heads/<tmp> master:refs/remotes/origin/master
ssh micro 'cd /mnt/gluster/deployment/swarm && git merge --ff-only <tmp> && git branch -d <tmp> && git rev-parse HEAD'
# laptop HEAD, origin/master and micro HEAD must be the same SHA before any install.
```

Never edit files in the micro checkout in place. Installers refuse a dirty checkout (`SOURCE_DIRTY`).

## 3. Snapshot transfer plane (micro -> core)

- micro holds a dedicated ed25519 key (`credentials/snapshot-transfer.ed25519`, comment
  `openbao-snapshot-transfer@micro`) and pins core's ed25519 host key (`credentials/snapshot-transfer.known_hosts`,
  alias `openbao-snapshot-peer`). A changed pin is refused, never overwritten.
- core accepts that key only as `restrict,from="<micro private IP>",command="/usr/local/sbin/openbao-snapshot-receive.sh"`
  in `/root/.ssh/authorized_keys`. The receiver accepts fixed verbs and stems only; core never receives a seal key,
  recovery share, CA key, credential or token.

Install / re-prove (the host-key fingerprint comes out of band, e.g. from the laptop's own pinned entry:
`ssh-keygen -F '[<core public IP>]:<port>' | ssh-keygen -lf -`):

```bash
ssh micro 'bash /mnt/gluster/deployment/swarm/scripts/openbao-maintenance-install.sh --backup-prereqs-only \
  --role sender --peer-host <core private IP> --peer-port <core sshd port> --peer-host-key SHA256:<fingerprint>'
# exit 3 (WAITING) until core's receiver exists; then:
ssh micro 'cat /var/lib/openbao-maintenance/credentials/snapshot-transfer.ed25519.pub' \
  | ssh core 'bash /mnt/gluster/deployment/swarm/scripts/openbao-maintenance-install.sh --backup-prereqs-only \
      --role receiver --sender-from <micro private IP> --sender-key-fd 0'
ssh micro '<same sender command>'      # must end TRANSFER_VERIFIED + OPENBAO-MAINTENANCE-INSTALL-OK
```

**fail2ban on core.** core's `sshd` jail bans after 5 pre-auth failures in 10 min (1 h), and its `recidive` jail
bans for a week after 5 bans in a day. Every `ssh-keyscan` (installer prereqs mode, `openbao-preflight.sh --live`)
and every connection with an unauthorized key counts as a failure. On 2026-10-18 the first install's keyscans plus one
probe before the receiver existed banned micro's private address for an hour (see the evidence log). Since
2026-10-18T17:41:20Z micro's private address `10.133.0.2` is in core's `[DEFAULT] ignoreip`
(`/etc/fail2ban/jail.local`), which both the `sshd` and `recidive` jails inherit, so OpenBao transfers can no
longer ban it. If that entry is ever removed, the old behaviour returns: check `ssh core 'fail2ban-client status
sshd'` before re-running prereqs mode or the live preflight more than twice in ten minutes. A ban on micro's private
address blocks replication (backups then fail and alert) until it expires.

## 4. Install, deploy and roll back the service

```bash
ssh micro 'bash /mnt/gluster/deployment/swarm/scripts/openbao-install.sh --init-seal g1 --init-tls'   # first time only
ssh micro 'bash /mnt/gluster/deployment/swarm/scripts/openbao-install.sh'                            # later source updates
ssh micro 'docker network create --driver overlay --internal openbao-internal'                       # once
ssh micro 'cd /mnt/gluster/deployment/swarm && docker stack deploy --resolve-image never -c vault.yml vault'
ssh micro '/usr/local/sbin/openbao-verify.sh --health'
ssh micro '/usr/local/sbin/openbao-verify.sh --edge-exposure'      # prints exactly EDGE-EXPOSURE-OK
```

Config-only changes after deployment: install, then `docker service update --force vault_openbao` (stop-first; a
single replica on one Raft directory). Never `docker stack deploy` without `--resolve-image never` (it rewrites the
tag to a digest).

**Rollback.** Removing the service is easy and loses nothing: `docker stack rm vault` keeps every node-local path
(Raft, seal, TLS, audit, snapshots). Re-deploy with the command above and the same files to get the same identity
back. Never delete `/var/lib/openbao/raft` or a seal key to "start over": replacing the initialized Raft/static-seal
identity needs a restore (section 9) or a new bootstrap plus new API credentials (Phase 40 coordination).

## 5. Bootstrap (done once; record in the evidence log)

`/usr/local/sbin/openbao-bootstrap.sh run` is a flock-serialized state machine:
preconditions -> 1/1 recovery init (root token and share only on the `/run` tmpfs) -> custody gate -> configure
(Transit key, approle, userpass, three policies, `thinx-api` and `backup` AppRoles) -> `operator` user (4h hard cap)
-> proofs (operator login, API canary, backup snapshot, audit canary, recorded A1 emergency proof) -> root revocation
with a rejection proof -> post-revocation snapshot via `openbao-backup.sh --post-change`. A completed bootstrap re-run
only verifies (`BOOTSTRAP-COMPLETE`). Exit 3 means "waiting at a gate"; the next action is printed.

Custody pipelines (operator's Mac, from the thinx-swarm checkout; the archive password is asked locally):

```bash
ssh micro '/usr/local/sbin/openbao-bootstrap.sh emit recovery-share' | scripts/openbao-recovery-archive.sh add-artifact recovery-share --receipt | ssh micro '/usr/local/sbin/openbao-bootstrap.sh confirm-custody'
ssh micro '/usr/local/sbin/openbao-bootstrap.sh emit seal-gN'       | scripts/openbao-recovery-archive.sh add-generation gN --receipt         | ssh micro '/usr/local/sbin/openbao-bootstrap.sh confirm-custody'
ssh micro '/usr/local/sbin/openbao-bootstrap.sh emit ca-key'         | scripts/openbao-recovery-archive.sh add-artifact ca-key --receipt         | ssh micro '/usr/local/sbin/openbao-bootstrap.sh confirm-custody'
ssh micro '/usr/local/sbin/openbao-bootstrap.sh emit ca-cert'        | scripts/openbao-recovery-archive.sh add-artifact ca-cert --receipt        | ssh micro '/usr/local/sbin/openbao-bootstrap.sh confirm-custody'
scripts/openbao-recovery-archive.sh verify          # read-only reopen; Keychain never consulted
```

micro compares the archive's sha256 receipts in memory and records only `confirmed`; the share is deleted from tmpfs
once its receipt matches.

## 6. Operator login (routine administration)

```bash
ssh -t micro
C=$(docker ps -q -f label=com.docker.swarm.service.name=vault_openbao -f status=running)
docker exec -it "$C" sh          # BAO_ADDR/BAO_CACERT are preset: verified TLS over loopback
[ -z "${BAO_TOKEN+x}${VAULT_TOKEN+x}" ] && echo no-token-env   # must print no-token-env; never print the values
stty -echo; IFS= read -r P; stty echo                          # type the operator password (not echoed)
export BAO_TOKEN=$(printf '%s' "$P" | bao write -field=token auth/userpass/login/operator password=-); P=
# ... work ...
bao token revoke -self; unset BAO_TOKEN; exit
```

**Do not use `bao login` inside the container** (found 2026-10-20, Plan 41-06 Task 3). The container filesystem is
read-only, so `bao login -method=userpass username=operator` cannot write `~/.vault-token` and prints the token to
the terminal instead. `export BAO_TOKEN=$(bao login -no-store ... -field=token)` also fails: the token is captured
together with the TTY's carriage return and/or the password prompt, and every request is then refused with 403. The
recipe above reads the password silently, sends it on stdin to the userpass login path and keeps only the token, in
a shell variable that dies with the `exec` session. Revoke it before you exit; a token that was printed or lost lives
until its 4 h `explicit_max_ttl` runs out.

The operator token has `explicit_max_ttl` 14400 s and cannot be renewed past it. The operator policy cannot
encrypt/decrypt with Transit and is blocked from raw storage, key export/backup and deletion flags. Trust limitation:
a policy/auth administrator can rewrite those guards; they are guardrails, not a boundary against the operator.

## 7. Emergency: no valid admin login (A1, break-glass)

Use only when the operator password is lost and no other admin token exists. Needs the recovery share from the
offline archive. Proven on the exact image by `tests/openbao-exact-image.test.sh` (section 15) and rehearsed before
the bootstrap root was revoked (evidence log).

1. `ssh micro`; `install -m 0644 /etc/openbao/emergency-unix.hcl /etc/openbao/config/zz-emergency-unix.hcl`;
   `docker service update --force vault_openbao`; wait until `openbao-verify.sh --health` passes. The socket
   `/run/openbao/emergency.sock` is container-local, 0600 root; TCP keeps the legacy endpoints disabled.
2. From the Mac, stream the share into the task's RAM-only `/run/openbao` tmpfs (never micro's disk or a terminal):

   ```bash
   scripts/openbao-recovery-archive.sh recover recovery-share | ssh micro \
     'C=$(docker ps -q -f label=com.docker.swarm.service.name=vault_openbao -f status=running); docker exec -i "$C" sh -c "umask 077; cat > /run/openbao/rk"'
   ```

3. `ssh -t micro`, then `docker exec -it -e BAO_ADDR=unix:///run/openbao/emergency.sock <task> sh` and, inside it
   (same sequence as the harness; the token lands only in a shell variable):

   ```sh
   j() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" | head -1; }
   bao delete sys/generate-root/attempt >/dev/null 2>&1 || true
   att=$(bao write -format=json -f sys/generate-root/attempt); otp=$(printf %s "$att" | j otp); nonce=$(printf %s "$att" | j nonce)
   enc=$(bao write -format=json sys/generate-root/update key=- nonce="$nonce" < /run/openbao/rk | j encoded_token)
   rm -f /run/openbao/rk
   export BAO_TOKEN=$(bao write -format=json sys/decode-token encoded_token="$enc" otp="$otp" | j token); att=; otp=; enc=
   export BAO_ADDR=https://127.0.0.1:8200            # back to verified TLS for the repair
   stty -echo; IFS= read -r P; stty echo             # type the NEW operator password (not echoed)
   printf %s "$P" | bao write auth/userpass/users/operator/password password=-; P=
   bao token revoke -self; bao token lookup >/dev/null 2>&1 && echo STILL-VALID || echo revoked-ok
   unset BAO_TOKEN; exit
   ```

   Store the new operator password in the password manager, then prove a fresh operator login with the
   section 6 recipe (not `bao login`, which prints the token on the read-only container filesystem).
4. `rm /etc/openbao/config/zz-emergency-unix.hcl`; `docker service update --force vault_openbao`; prove the socket
   is gone (`docker exec <task> test ! -e /run/openbao/emergency.sock`) and `openbao-install.sh --check` is clean
   (it refuses a leftover fragment: `CONFIG_DIR_UNEXPECTED_FILE`).
5. Take a post-change snapshot (`openbao-backup.sh --post-change`) and record the event (timestamps only).

## 8. Backups

`/usr/local/sbin/openbao-backup.sh [--daily|--pre-change|--post-change]` takes a Raft snapshot with the backup
AppRole, inspects it on the host, writes `manifest.json` (image, version, Raft index/term, seal generation ids,
config hash, source revision, sha256, both restore limitations), finalizes it atomically on micro, replicates it to
core (backlog first) and prunes pairs older than 90 days on both nodes only after this run's pair is verified on
core. `--verify-both-nodes` is read-only. Take `--pre-change` before and `--post-change` after every key or
configuration change.

## 9. Restore (and its two limitations)

Every restore and rehearsal states both limitations, and an older snapshot must never be presented as current:

1. **Credential-revocation rewind.** A snapshot taken before a revocation brings the revoked token/credential back.
   A snapshot from before the bootstrap-root revocation would resurrect that root token. Restore only snapshots
   taken after `root_revoked_at`, and after any later revocation you rely on.
2. **Later Transit versions.** A snapshot cannot decrypt ciphertext produced by Transit key versions created after
   it. After every Transit rotation (Phase 41), take a fresh snapshot before newer ciphertext replaces old.

A snapshot also needs the seal generation(s) its manifest names: restoring a g1 snapshot needs g1 from the archive
even after the live service moved to g2. The rehearsal refuses a generation, previous-generation, image or pair
mismatch before reading any key byte.

Rehearsal (isolated throwaway on an `--internal` network; production untouched):

```bash
ssh micro '/usr/local/sbin/openbao-restore-rehearsal.sh prepare'            # canary + replicated pre-change snapshot
scripts/openbao-recovery-archive.sh recover seal-gN.key \
  | ssh micro '/usr/local/sbin/openbao-restore-rehearsal.sh run --stem <stem> --seal-generation gN --seal-fd 0'
ssh micro '/usr/local/sbin/openbao-restore-rehearsal.sh --verify-recorded-matrix'
```

A production restore uses the same snapshot/generation pairing: stop-first `vault_openbao`, restore with the operator
(`bao operator raft snapshot restore -force`) and re-verify with `openbao-verify.sh --full`. Rehearse first; repeat a
rehearsal before every OpenBao upgrade (D-17). No restore is ever scheduled.

## 10. The API side: attachment, trust consumer and rollback (Plan 06)

What `thinx_api` carries (source: `thinx-swarm/thinx.yml`, mirrored in the parent `docker-swarm.yml`; both checked by
`tests/openbao-api-wiring.test.sh --source thinx.yml <parent>/docker-swarm.yml`):

| Addition | Value | Read by |
|---|---|---|
| network | `openbao-internal` (Internal=true, not attachable) | resolves `openbao.internal` |
| secret | `BAO_ROLE_ID` -> `/run/secrets/BAO_ROLE_ID` | `lib/thinx/secrets.js` `readSecret()` (file first) |
| secret | `BAO_SECRET_ID` -> `/run/secrets/BAO_SECRET_ID` | same |
| config | `openbao-ca-<sha256(bundle)[0:20]>` -> `/run/openbao/ca.pem` (0444, public certificates only) | `BAO_CACERT` |
| env | `BAO_ADDR=https://openbao.internal:8200`, `BAO_CACERT=/run/openbao/ca.pem` | the Phase 40 client |

Nothing else of the API changed in Phase 39: no client module, no `rsakey.js`/`git.js` change. `GIT_KEY_PASSPHRASE`
stayed mounted and set until Phase 41: its secret mount and env entry were removed from the live `thinx_api` spec on
2026-10-20 (Plan 41-06, one `docker service update --secret-rm --env-rm`), and the swarm secret and the
`/mnt/gluster/thinx/.env` line were deleted the same day (evidence log). `readSecret()` caches per process, so a new
secret value reaches the API only through a deliberate task restart.

**Attach (done once, 2026-10-18; evidence log below).** Repo first, then on micro: a root-only node-local rollback
directory `/var/lib/openbao-maintenance/rollback/api-service` (0700) with a 0600 `docker service inspect thinx_api`
backup `thinx-api-pre-openbao-<UTC>.json`; the CA config created from `/etc/openbao/ca/ca.pem` (equal to the server's
`current/ca.pem`); then exactly one update, never a stack deploy:

```bash
docker service update --detach=false --no-resolve-image --network-add openbao-internal \
  --secret-add source=BAO_ROLE_ID,target=BAO_ROLE_ID --secret-add source=BAO_SECRET_ID,target=BAO_SECRET_ID \
  --config-add source=openbao-ca-<sha20>,target=/run/openbao/ca.pem,mode=0444 \
  --env-add BAO_ADDR=https://openbao.internal:8200 --env-add BAO_CACERT=/run/openbao/ca.pem thinx_api
```

Then (laptop) `tests/openbao-api-wiring.test.sh --live` and the edge gate; on micro
`openbao-cert-renew.sh --arm-api-trust --api-service thinx_api`. Every check prints booleans, names and status codes
only.

**Recurring trust consumer.** From the arm onwards an issuer renewal (`--daily` when the CA certificate has under 120
days left, or `--renew-issuer-now`) changes API trust itself: overlap bundle (old + renewed anchor) as a new immutable
config, one targeted `docker service update` of `thinx_api` (`--config-rm` old, `--config-add` new), Node probe inside
the new task, server leaf re-issued under the renewed anchor, the old anchor retired from the API and then the server.
Any failure restores the previous config and server directory and proves both (exit 4 if it cannot). Each swap
restarts the API task once. After a swap update `name:` of `configs.openbao-ca` in both deployment files to the
config `--verify-api-trust-consumer` reports (`OPENBAO-CERT-API-TRUST-OK ... config=<name>`); the live wiring test
fails with `SOURCE_CONFIG_DRIFT` until then. The CA key never changes in an issuer renewal; the archived `ca-cert` is
stale afterwards, which is harmless (the archived key re-creates any CA certificate).

**Checks.**

```bash
ssh micro '/usr/local/sbin/openbao-verify.sh --full --maintenance --api-service thinx_api'
ssh micro '/usr/local/sbin/openbao-cert-renew.sh --verify-api-trust-consumer --api-service thinx_api'
tests/openbao-api-wiring.test.sh --live      # laptop; probes inside the task on whichever node it runs
```

**Rollback (removes exactly the five additions; one update).**

```bash
ssh micro 'CFG=$(docker service inspect thinx_api | jq -r '"'"'[.[0].Spec.TaskTemplate.ContainerSpec.Configs[]? | select(.File.Name == "/run/openbao/ca.pem") | .ConfigName] | join(" ")'"'"');
  docker service update --detach=false --no-resolve-image --network-rm openbao-internal --secret-rm BAO_ROLE_ID \
    --secret-rm BAO_SECRET_ID --env-rm BAO_ADDR --env-rm BAO_CACERT --config-rm "$CFG" thinx_api'
```

Prove it by comparing the normalized spec (Env/Secrets/Configs/Networks sorted, ForceUpdate dropped) with the newest
backup in `rollback/api-service` on micro, then run the edge gate. Right after the first update `docker service
update --rollback thinx_api` is equivalent (PreviousSpec = the backup); after a trust-consumer swap it is not. Disarm
the consumer with it (`obc_state_set` key `armed` in `state/api-trust`) only if the API is detached for good: an
armed consumer with no CA config refuses issuer renewals (`API_TRUST_NOT_ATTACHED`, nothing changed) and alerts.

## 11. The API Transit client (Phase 40, legacy path removed in Phase 41)

Phase 40 makes `thinx_api` the client of the section 10 wiring. Phase 41 migrated every legacy key to Transit and
then removed the legacy read path and the passphrase (KEYMIG-02): since that deploy a keyed build reads only Transit
ciphertext. Code: `lib/thinx/transit.js` (client),
`lib/thinx/rsakey.js` (generation and the kill switch), `lib/thinx/git.js` (keyed fetch), `lib/thinx/keyformat.js`
(file format), `lib/thinx/builder.js` (build-log line). The SSH form below is the literal one from `AGENTS.md`;
`ssh micro` / `ssh core` from the operator's aliases are equivalent.

**What the API does.**

- **New key.** The private half is made in memory, sent to `transit/encrypt/thinx-deploy-keys`, and only the
  ciphertext is stored: one `vault:vN:` line, mode 0600, in `ssh_keys/<owner>/`. The `.pub` stays OpenSSH. There
  is no passphrase fallback: when Transit refuses, nothing is written and the request is refused (`key_service_unavailable`, below).
- **Keyed build.** Each key file is classified by content when it is tried, never by name. A Transit key is
  decrypted in memory and loaded with `ssh-add -` into its own per-attempt `ssh-agent` (socket in a 0700 temp
  directory, removed afterwards); git then uses the agent, with no askpass and no passphrase in its environment.
  An askpass helper or a passphrase variable inherited from the container env is dropped before git runs.
- **Legacy keys (D-09).** A PEM key (encrypted PKCS#8 or an older unencrypted key) found in `ssh_keys`, for example
  one restored from an old backup, is skipped and logged as `legacy_format_unsupported`, on the same path as the other
  skip causes (`unknown_key_format`, `not_regular`, `too_large`, `read_error`). It gets no attempt, sets no
  `deploy key unavailable` line, raises no Slack alert, and the API never deletes or rewrites it; the owner's other
  keys are still tried. The operator decides what happens to the file.
- **D-07.** After the removal deploy, a legacy file restored from an old backup cannot be read by anything: there is
  no passphrase path left. Its owner regenerates the deploy key and adds the new public key to the repository.
  (Rolling back by untarring legacy files only worked while the dual-read code was deployed.)
- **D-01.** A Transit key that cannot be decrypted is skipped, and the owner's next key is tried. During an OpenBao
  outage keyed builds fail (WR-02 below); public builds, 7442 and MQTT do not need OpenBao.
- **AppRole.** Login is through `BAO_ROLE_ID` / `BAO_SECRET_ID` (`readSecret()`, file first). Tokens are never
  renewed: the client logs in again before the 1 h cap. TLS trusts only `BAO_CACERT`, and every request has a 3 s
  timeout.
- **D-02 retry.** `unreachable`, `sealed`, `denied` and `server_error` get one retry after a fresh login. A login
  refused as `denied` is not retried, because the same credentials would be refused again.

**Reason classes.** Every failure is reported as one of nine classes; no address, body or token is logged.
`retired_version` and `key_missing` (Phase 41, D-13) are told apart from `bad_ciphertext` by exact equality with
OpenBao's error string on a decrypt or rewrap 400; the string itself is never logged.

| Class | Meaning | First check |
|---|---|---|
| `not_configured` | `BAO_ADDR` missing or not https, `BAO_CACERT` unreadable or empty, or an AppRole value empty; no request was made | `docker service inspect thinx_api`: env `BAO_ADDR`/`BAO_CACERT`, secrets `BAO_ROLE_ID`/`BAO_SECRET_ID`, config at `/run/openbao/ca.pem` (section 10); `openbao-verify.sh --full --maintenance --api-service thinx_api` |
| `unreachable` | refused, DNS, reset or the 3 s timeout: no HTTP answer | `openbao-verify.sh --health`; `docker service ps vault_openbao`; the `openbao-internal` attachment (section 10); service restarts follow section 4 (stop-first, never delete Raft or a seal key) |
| `tls` | the server certificate does not verify against `BAO_CACERT` | the trust consumer: `openbao-cert-renew.sh --verify-api-trust-consumer --api-service thinx_api` and the CA config swap rules (section 10) |
| `sealed` | HTTP 503 from OpenBao | `openbao-verify.sh --health`; the static seal file of the current generation (section 1); restart rules in section 4 |
| `denied` | HTTP 403, or 400 on the AppRole login | the AppRole secrets `BAO_ROLE_ID`/`BAO_SECRET_ID` and the `thinx-api` policy (`openbao-verify.sh --full --maintenance --api-service thinx_api`); `readSecret()` caches per process, so a new secret value needs a task restart |
| `bad_ciphertext` | HTTP 400 on decrypt: one stored key file is damaged or not ours | that key only; other keys and other owners are unaffected, no incident is opened and no Slack text is posted. The owner creates a new deploy key |
| `retired_version` | HTTP 400 on decrypt or rewrap: the stored ciphertext is below the key's `min_decryption_version`. Per key, never retried | is a key file below `min_decryption_version`? Run `migrate-deploy-keys.js --report` and `--rewrap`; section 12 |
| `key_missing` | HTTP 400 on decrypt or rewrap: the `thinx-deploy-keys` Transit key does not exist. Service level: it opens an incident and skips the owner's other Transit keys | the transit mount and key exist; `openbao-verify.sh --full` |
| `server_error` | any other status, or a body over 64 KiB. A `server_error` raised by the AppRole login is service level (IN-10) | `openbao-verify.sh --full`; the OpenBao audit log on micro (HMAC-redacted) |

**Log lines.** Placement floats: find the node first, then read the task's logs with `docker logs` (never
`docker service logs`, which hangs on micro).

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service ps thinx_api --filter desired-state=running --format '{{.Node}}'"
# on that node (micro as above; core is root@188.166.203.163 with the same key and port):
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=thinx_api | head -1); timeout 30 docker logs --since 30m \$C 2>&1 | grep -E '\[transit\]|\[git\] key|\[rsakey\]|deploy-key generation refused'"
```

| Line | Written when |
|---|---|
| `[transit] <op> failed: <reason> status=<n>` | an OpenBao request failed; `<op>` is `login`, `encrypt`, `decrypt`, `rewrap` or `probe`, and `status=0` means no HTTP answer |
| `[transit] probe ok` | the boot probe logged in |
| `[git] key <name> skipped: deploy key unavailable: <reason>` | a Transit key could not be decrypted during a fetch (D-01) |
| `[git] key <name> skipped: legacy_format_unsupported` | a legacy PEM key file was found and skipped (D-09); nothing else happens to it |
| `[git] key <name> skipped: <cause>` | a key file was skipped for its format or the agent failed (`agent_start_failed`, `agent_load_failed`) |
| `[git] fetch attempt with key <name> failed: attempt_error` | a keyed attempt threw an error with no code of its own (T-40-12); the message is never logged |
| `[rsakey] create failed: <code>` | a create was refused (`key_service_unavailable`) or failed |
| `deploy-key generation refused: key service unavailable (<reason>)` | Transit refused a new key |
| `deploy-key generation refused: THINX_DEPLOY_KEYGEN is not enabled` | the kill switch refused a new key (the value is never logged) |

**Slack (D-05).** One text when the first failure opens an incident, one when the next success closes it, to the
API's `SLACK_WEBHOOK` (nothing is posted without one):

- `THiNX OpenBao: API Transit FAILING on <host> since <ts>: <REASON>. One alert per incident; recovery will be announced.`
- `THiNX OpenBao: API Transit RECOVERED on <host>; failing since <ts> (<REASON>).`

The incident is held per process: a task restart during an outage alerts once more. `bad_ciphertext` never opens an
incident. No repeats are posted in between.

`retired_version` posts its own text, once per process, through a separate latch that never opens or closes the
incident (so no RECOVERED follows it, and a real outage still alerts):

- `THiNX OpenBao: API Transit RETIRED_VERSION on <host> at <ts>: a stored deploy key is below min_decryption_version and cannot be decrypted; rewrap it. One alert per process.`

**Boot probe.** About 5 s after the task starts the API makes one AppRole login and logs `[transit] probe ok`. A
failure logs `[transit] probe failed: <reason> status=<n>` and opens an incident; it never stops the API (7442, MQTT
and public builds do not need OpenBao). After any `thinx_api` update, check for the probe line first.

**Build latency during an OpenBao outage.** One Transit key costs at most four OpenBao requests of 3 s, so 12 s,
before D-01 skips it. A keyed fetch spends at most 12 s per Transit key of the owner on OpenBao, under that build
directory's checkout lock, before it reaches the next key. After the first service-level class (WR-02) the remaining
Transit keys of that fetch are skipped without a request, so an outage costs one key's 12 s per fetch. Refused connections, 503 and 403 answer at once; only a
hung or black-holed OpenBao approaches the bound. An owner with several Transit keys waits that long for each of them.
The kill switch does not shorten this: it stops new keys only, and builds keep trying every key.

**What users see.**

- A keyed build where no key worked fails with the existing failure status. When the reason was a Transit key, the
  build log carries one line `deploy key unavailable: <sentence>` (D-04), the sentence being one of:
  `key service unreachable`, `key service sealed`, `key service refused the request`,
  `key service certificate not trusted`, `key service not configured`, `stored key could not be decrypted`,
  `key service error`, `stored key uses a retired key version`, `key service has no deploy-key key`.
  A skipped legacy file adds no line: if it was the owner's only key, the build fails with the existing status.
- A refused create (Transit down or the kill switch) answers HTTP 503
  `{success: false, response: "key_service_unavailable"}` on `PUT /api/v2/rsakey`, `GET /api/user/rsakey/create`
  and the GitHub-link flow (D-03). Both consoles show: Deploy keys can't be created right now, try again later.

**Kill switch (D-07).** `THINX_DEPLOY_KEYGEN`: unset, empty or exactly `enabled` generates; any other value
(`disabled`) refuses every new deploy key with `key_service_unavailable`, before any name check or Transit call.
Builds, existing keys, listing and revoking are unaffected. `thinx.yml` and `docker-swarm.yml` carry
`THINX_DEPLOY_KEYGEN=enabled`. The live spec carries `THINX_DEPLOY_KEYGEN=enabled` too, since the 2026-10-19 UAT 5
re-enable (step 4 with `--env-add`); this corrects the 40-SECURITY doc drift (residual 6). Unset still means enabled. The
name has no `BAO_`/`VAULT_` prefix on purpose: the env guards allow only `BAO_ADDR` and `BAO_CACERT`.

1. Back up the live spec on micro. The backup holds the live env values, so it is 0600 root, in the existing 0700
   directory, and is never copied off micro or printed. Its prefix stays distinct from `thinx-api-pre-openbao-*`,
   which the wiring gate reads as its baseline.

   ```bash
   ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'set -eu; D=/var/lib/openbao-maintenance/rollback/api-service
     [ "$(stat -c "%a %U" "$D")" = "700 root" ]; umask 077
     B="$D/thinx-api-pre-keygen-$(date -u +%Y%m%dT%H%M%SZ).json"; docker service inspect thinx_api > "$B"
     chmod 0600 "$B"; stat -c "%a %U %n" "$B"'
   ```

2. One update, which restarts the API task (a brief API and 7442 interruption, and a new boot probe):

   ```bash
   ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'docker service update --detach=false --no-resolve-image --env-add THINX_DEPLOY_KEYGEN=disabled thinx_api'
   ```

3. Check: `docker service inspect thinx_api | jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Env[] |
   select(startswith("THINX_DEPLOY_KEYGEN="))'` prints `THINX_DEPLOY_KEYGEN=disabled`; a create in the Vue console
   shows the sentence above; the log has `deploy-key generation refused: THINX_DEPLOY_KEYGEN is not enabled`.
4. Re-enable with one update: `--env-add THINX_DEPLOY_KEYGEN=enabled` or `--env-rm THINX_DEPLOY_KEYGEN`, in the
   same command form.

Never `docker stack deploy` or `restart.sh` for this. Do not commit `disabled` into the deployment files:
`tests/openbao-api-wiring.test.sh --source` requires `enabled` in both (`KEYGEN_SWITCH`). `--live` ignores the
`THINX_DEPLOY_KEYGEN` entry and the image (which CI rolls), so a flipped switch is not drift.

**Rollback order.**

1. The kill switch first. It stops new Transit keys at once, and existing Transit keys keep building.
2. A full revert: `git revert` the Phase 40 commits on `thinx-staging` (with their console gitlink commits) and
   push. After Phase 41 this no longer brings legacy keys back: every key is Transit ciphertext and the passphrase
   is gone (D-07), so a revert only matters for a defect in the Phase 40 code itself. CircleCI builds the image and Swarmpit rolls it out; nothing is changed by hand on the swarm.
   - The `docker-swarm.yml` switch line can stay: the old code ignores the variable, and keeping it keeps
     `--source` green.
   - The cost: keys minted after the cut-over are `vault:vN:` files, which the old code cannot use. Leave them in
     place, because they work again after the roll-forward. Their owners build with their legacy keys meanwhile, or
     fail until then. Legacy keys are unaffected (D-06).

**Not here.** Transit key rotation, rewrap and raising `min_decryption_version` are in section 12 (the recipe added by
Plan 41-07). The migration, removal and rotation evidence of Phase 41 is in the evidence log below and the Phase 41
plan summaries.

## 12. Transit key rotation (Phase 41, D-11)

The repeatable recipe for rotating `thinx-deploy-keys`, bringing every stored deploy key to the new version and
retiring the old one. First run: 2026-10-20 (Plans 41-06 and 41-07, v1 -> v2; evidence log below).

**Trigger.** A one-off decision or a suspected leak (of the AppRole credentials, a snapshot or a Gluster backup that
holds old ciphertext). There is no scheduled rotation and no cron (deferred; `auto_rotate_period` stays 0).

**Who does what.** The executor (laptop, ssh) runs everything through the thinx-api AppRole inside the running
`thinx_api` task: report, canary, rewrap, fetch-check. The AppRole may rewrap but is denied the key config and rotate
endpoints by design (D-12). The operator does the two key writes (rotate, raise the minimum) in their own section 6
session. Never with `bao login`.

**Task-exec form.** Query the task and its node every time (placement floats), then exec on that node:

```bash
T=$(ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service ps thinx_api --no-trunc --filter desired-state=running --format '{{.ID}} {{.Node}}'")
# exactly one line; ID=${T%% *} N=${T#* }; on the node N (micro 188.166.23.244, core 188.166.203.163):
C=$(docker ps -q --filter label=com.docker.swarm.task.id=$ID | head -1)
docker exec "$C" node scripts/migrate-deploy-keys.js <mode> [--json] | tail -1
```

**Preconditions.**

- D-13 is live: the `REMOVAL_LIVE` probe (Plan 41-05 node one-liner in the task) prints
  `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined`.
- `--report --json` shows legacy_total 0, unknown 0, unreadable 0 and a single version `vL0` in the version map. If
  more than one version is present, finish the previous rotation's rewrap first.
- `openbao-verify.sh --full ...` and the `--live` wiring gate pass; `vault_openbao` is healthy.

**Steps.**

1. **Canary.** On micro, with `umask 077`, write one junk ciphertext through the AppRole into a 0600 root file:
   `docker exec "$C" node scripts/migrate-deploy-keys.js --canary-capture | tail -1 > /root/thinx-backups/transit-canary-<UTC>.ct`
   (task on core: pipe it over ssh into the micro file). Never display it; check only mode, line count and version.
   `--canary-check` with the file on stdin (`docker exec -i`) must print `CANARY result=ok version=vL0`.
2. **Snapshot before.** `/usr/local/sbin/openbao-backup.sh --pre-change` on micro: `OPENBAO-BACKUP-OK mode=pre-change`.
3. **Operator rotates** (section 6 session): read `latest_version` (must be L0), `bao write -f
   transit/keys/thinx-deploy-keys/rotate`, read `latest_version` again (L1 = L0 + 1) and `min_decryption_version`
   (unchanged), then `bao token revoke -self`. Nothing else changes. A fresh `--canary-capture | cut -d: -f2` (only the
   version leaves the host) confirms the AppRole encrypts at vL1.
4. **Rewrap twice.** `--rewrap --json`: latest `vL1`, failed 0, aborted null, legacy_total 0, versions_after
   `{"vL1": <all>}`. Run it again: rewrapped 0, at_latest = all. On an abort with a service class, check
   `openbao-verify.sh --health` and re-run once if healthy; a second abort or any per-file failure (retired_version,
   bad_ciphertext, server_error, verify_mismatch) stops the rotation before step 6. Host check on micro: every private
   file in `ssh_keys` starts with exactly `vault:vL1:` (`head -c` of the prefix length) and the counts match.
5. **Keyed fetch.** `--fetch-check <owner> <git url> <branch>` for a known owner and private repository (D-10: owner
   `test` `cedc16bb…`, `git@github.com:suculent/thinx-autoflood.git`, `main`) prints `FETCH_CHECK ok=true ... legacy=0`.
   Record **D14_GATE pass**. Do not raise the minimum without it.
6. **Operator raises the minimum** (section 6 session, a prefix check on the token): read `latest_version` (must still
   be L1), `bao write transit/keys/thinx-deploy-keys/config min_decryption_version=L1` (the number, never above
   latest_version: OpenBao refuses that), read `min_decryption_version` and `latest_version` back (both L1),
   `bao token revoke -self; unset BAO_TOKEN; exit`. This is the only config write.
7. **Refusal proof.** `--canary-check` of the stored canary prints `CANARY result=retired_version version=vL0`.
   `result=ok` means the raise did not take effect; `bad_ciphertext` means D-13 is not working. Only the junk canary is
   used for this, never a real key's old ciphertext.
8. **Keyed fetch again.** As in step 5, plus `--report --json` showing only `vL1`. Count (count only) `retired_version`
   lines in `timeout 30 docker logs --since <raise ts> <container>`: expect 0.
9. **Snapshot after.** `openbao-backup.sh --post-change` (do it right after the raise: until then no snapshot can
   decrypt vL1 ciphertext, section 9 limitation 2).
10. **Gates.** `tests/openbao-api-wiring.test.sh --live` (API-WIRING-OK; `TRANSIT_CANARY` uses a fresh vL1
    ciphertext), `openbao-verify.sh --full --expect-seal-generation <gN> --expect-no-runtime-generation <gN-1>` and
    `--api-service thinx_api`, `openbao-restore-rehearsal.sh --verify-recorded-matrix`, ports 7442, 1883 and 8883 open
    from the laptop, and one keyed build of a private-repo device from the Vue console.

Keep the canary file until the next phase's cleanup (it is junk, but it is ciphertext: 0600 root, never in git or a
ticket).

**Rollback.** If a build breaks after step 6: the operator, in a section 6 session, writes
`min_decryption_version=L0` (any value from the oldest kept version up to latest_version is accepted) and reads it
back. This works because the key is never trimmed: `min_available_version` stays at its default and the operator policy denies
`transit/keys/+/trim`, so the old versions still exist. Rewrapped files keep working at any minimum up to latest, so
the rollback never needs a reverse rewrap. Once the cause is fixed, repeat steps 4-8. Before step 6 there is nothing to
roll back: vL0 and vL1 are both decryptable.

**Alerts.** A key file below the minimum fails per key with `retired_version`: the fetch skips that key and tries the
owner's next one; if none works, the build log shows `deploy key unavailable: ...`. The process posts once (never
repeated, no RECOVERED): `THiNX OpenBao: API Transit RETIRED_VERSION on <host> at <ts>: ... rewrap it. One alert per
process.` (section 11). It means a file was missed by the rewrap or restored from an old backup. OpenBao refuses to
rewrap ciphertext below the minimum, so the fix is: lower the minimum (rollback above), run `--rewrap --json` until it
reports rewrapped 0, then raise it again (steps 6-8).

**Never.** Trim the key, set `exportable`, `allow_plaintext_backup` or `deletion_allowed`, widen the thinx-api
AppRole, or print a ciphertext, canary, token or key. No `docker stack deploy`, `restart.sh` or `service update` is
part of a rotation.

---

## Evidence log (sanitized: timestamps, SHAs, counts, verdicts; never values)

### 2026-10-18 Plan 39-05 Task 1: deploy and bootstrap

Pre-state (14:11-14:14Z):

- `scripts/openbao-preflight.sh --live` (source `0edd156`): `OPENBAO-PREFLIGHT-OK mode=live`. micro Reachable
  manager, core Leader, 2 nodes; `openbao-internal` absent; no vault/openbao service; all node-local parents ext4,
  15.8 GB free on micro and 17.7 GB on core; Traefik 29 http routers, 0 tcp, all enabled, none for vault/openbao
  (inventory sha256 `fa0afd608550…`); 7442/1883 open, 8883 open.
- 22 services (inventory sha256/16 `8f056c1d2da203d8`), networks `6598cbade39d156e`; `thinx_api` and
  `traefik_traefik` both on micro; `thinx_api` spec sha256/16 `e3d388a3c43f0342` (UpdatedAt 09:32:24Z);
  `traefik_traefik` `efeabd4953d5ca2c` (06:47:26Z). rtm.thinx.cloud 200.
- Legacy Vault trees: `/mnt/glusterfs/vault` and `/mnt/gluster/vault` 47 entries each, metadata digest (names,
  types, sizes, modes, mtimes; no content) `cbdb06347adf3996` for both.
- `thinx_api` spec backup for Plan 06: `micro:/var/lib/openbao-maintenance/rollback/` (0700), taken by Plan 06
  immediately before its `docker service update`.
- Image: `openbao/openbao:2.7.1` pulled on micro (amd64); manifest-list digest `sha256:6d2b9385…` equals the one the
  laptop harness tested. The service spec still uses the tag.

Source: thinx-swarm `0edd156` pushed to origin and fast-forwarded on micro (laptop = origin = micro), then two fixes
found live, each pushed and fast-forwarded the same way: `ea70ce8` (`findmnt -T` fails on not-yet-created paths, so
the first real install refused every new directory; nothing had been changed) and `d95e1c7` (the bootstrap is
resumable after the irreversible root revocation).

Transfer plane (14:15-15:47Z):

- core host key fingerprint taken from the laptop's long-standing pinned entry for core and matched against
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` over the laptop's own core session:
  `SHA256:/Ni+YsGTFLC81eLa1ZNGU+JKPicnitNy9Ui70vCPLAE` (ed25519), sshd port as in `~/.aliases`.
- micro sender: 7 dirs 0700, 4 scripts 0700, dedicated key created, host key pinned; exit 3 WAITING as designed.
- core: `/root/.ssh/authorized_keys` backed up 0600 root (`/root/authorized_keys.bak-p39-05-20261018T141720Z`,
  identical), receiver installed, one forced-command line added, the 3 existing lines kept.
- **fail2ban incident.** The next sender run reported `TRANSFER_UNREACHABLE`: core's fail2ban `sshd` jail had banned
  micro's private address at 14:17:33Z after 5 pre-auth failures in 6 min (live-preflight keyscan 14:11, installer
  keyscans 14:15/14:17, one capacity probe before the receiver existed). Ban 1 h, port 2020 only; `recidive` counted
  it once (5 bans/day -> 7-day ban). No fail2ban change was made (an unban was not authorized from this session); the
  rollout waited for the ban to expire (15:17:33Z).
  **Follow-up (operator decision, done by the orchestrator, not by this executor):** at 2026-10-18T17:41:20Z
  `10.133.0.2` was appended to the `[DEFAULT] ignoreip` line (line 6) of core's `/etc/fail2ban/jail.local`. The
  `[sshd]` jail has no `ignoreip` of its own and inherits `[DEFAULT]`, so this covers `sshd` and `recidive`; both live
  jails now list `10.133.0.2`. Backup `/etc/fail2ban/jail.local.bak-20261018T174120Z` (0600); `fail2ban-client -t`
  passed; fail2ban reloaded (not restarted). Revert: restore that backup, `fail2ban-client -t`, `fail2ban-client reload`.
- 15:46:09Z: `TRANSFER_PROBE ok` (synthetic pair checksum-verified, atomically finalized on core),
  `TRANSFER_RESTRICTED ok` (arbitrary command and a path refused), `TRANSFER_VERIFIED ok` (>= 1 GiB free on both),
  `OPENBAO-MAINTENANCE-INSTALL-OK mode=prereqs role=sender`. core `--check --role receiver` OK. No cron, logrotate,
  certificate job or Slack config installed.

Install and deploy (15:47-15:48Z):

- `openbao-install.sh --init-seal g1 --init-tls`: 9 dirs 0700, 6 config/policy files 0600, 4 scripts 0700,
  `seal-g1.key` 32 bytes 0600, CA EC P-384 1825 d, leaf `r20261018T154740Z` 90 d; legacy trees reported only.
- `openbao-internal`: `internal=true attachable=false driver=overlay scope=swarm`.
- `docker stack deploy --resolve-image never -c vault.yml vault`: `vault_openbao.1` Running on micro, image
  `openbao/openbao:2.7.1` (no digest), 0 published ports, one network. `bao status`: uninitialized, static, raft,
  2.7.1.
- `openbao-verify.sh --edge-exposure` -> `EDGE-EXPOSURE-OK`; Traefik http router list byte-identical to the
  pre-state (29, all enabled); 7442/1883/8883 open from the laptop; rtm 200.

Bootstrap, unattended part (15:48-15:50Z):

- `openbao-bootstrap.sh run` -> `PRECONDITIONS ok` (verified TLS, missing CA rejected), `INITIALIZED ok` (1 share,
  threshold 1; root and share only on tmpfs) at 15:48:52Z, `AUTO_UNSEALED ok`, then `BOOTSTRAP-WAITING gates=4`
  (custody of seal-g1, recovery-share, ca-key, ca-cert).
- A1 rehearsal: fresh `tests/openbao-exact-image.test.sh` on the exact image (laptop throwaway, no production access)
  piped into `record-emergency-proof` -> `PROOF_EMERGENCY_RECORDED ok ... 136 checks` at 15:50:19Z (newer than init).

Bootstrap, operator part (operator's own terminal, ~17:3xZ; outputs reported without values):

- Custody: `seal-g1.key` (32 B), `recovery-share-1.b64` (44 B; `SHARE_REMOVED_FROM_TMPFS ok`), `ca/ca.key` (306 B),
  `ca/ca.pem` (774 B), each `ARCHIVE_ARTIFACT_ARCHIVED ok` then `BOOTSTRAP CUSTODY_CONFIRMED ok`.
  `verify --require-complete --expect-generations g1` -> `VERIFIED ok` read-only, Keychain not used, entries=4
  (1 seal generation, 1 recovery share, 1 CA key, 1 CA cert).
- `ssh -t micro '/usr/local/sbin/openbao-bootstrap.sh run'` (operator password at the hidden prompt):
  `INIT_ALREADY ok`, `CREDENTIALS_ISSUED ok` thinx-api + backup (0600), `CONFIGURED ok` 17:39:12Z,
  `OPERATOR_CREATED ok` 17:39:17Z (4h hard cap), the four live proofs ok, `ROOT_REVOKED ok` 17:39:26Z (403 on reuse,
  removed from tmpfs), `POST_REVOCATION_SNAPSHOT ok`, `BOOTSTRAP-COMPLETE` 17:39:36Z.

Post-bootstrap gates (17:40-17:41Z, unattended):

- `openbao-verify.sh --full --expect-seal-generation g1 --expect-root-revoked` -> `OPENBAO-VERIFY-OK mode=full`
  (spec/tag/pin/no port/no Gluster/no label, TLS negatives, layout, seal g1, API round-trip + 13/13 denials, backup
  snapshot/restore-denied/decrypt-denied/revoke-self, audit 0600 HMAC-redacted, root revoked and rejected, no root
  token / share / token helper). Privileged operator checks not run unattended (need the operator password).
- `--edge-exposure` -> exactly one `EDGE-EXPOSURE-OK`; Traefik router inventory hash unchanged
  (`fa0afd608550…`); 7442/1883/8883 open; rtm 200.
- `openbao-backup.sh --verify-both-nodes` -> `openbao-20261018T173932Z-post-change` identical on micro and core.
- Swarm secrets `BAO_ROLE_ID` and `BAO_SECRET_ID` created from the root-only thinx-api credential files via stdin
  (`docker secret create … -`), label `com.thinx.openbao=phase39`, attached to no service (Plan 06 attaches them).
- `thinx_api` spec hash `e3d388a3c43f0342` and `traefik_traefik` `efeabd4953d5ca2c` unchanged (UpdatedAt as in the
  pre-state); legacy Vault tree metadata digests unchanged (`cbdb06347adf3996`).

Rollback for Task 1 (not needed): `docker stack rm vault` keeps every node-local path; redeploying restores the same
identity. The secrets can be removed with `docker secret rm BAO_ROLE_ID BAO_SECRET_ID` while unattached.

### 2026-10-18 Plan 39-05 Task 2: static-seal rotation g1 -> g2 (complete)

Rotation hold: no recurring OpenBao job exists yet (cron/logrotate come in Task 3), so nothing can interleave; every
step below is run by hand, one at a time.

- Exact-image probe first (laptop throwaway, internal network, throwaway keys): g1 -> g2 current + g1 previous restart
  auto-unseals ("Auto Seal: static … current_key_id seal-g2, previous_key_id seal-g1"); a later restart with g2 alone
  auto-unseals; pre-rotation ciphertext still decrypts; a g1 snapshot restores only with g1; the overlap snapshot and a
  g2-only snapshot restore with g2; every mismatched case stays sealed.
- 17:44:06Z `openbao-restore-rehearsal.sh prepare`: canary encrypted, then pre-change snapshot
  `openbao-20261018T174406Z-pre-change` (seal g1, Raft index 111), identical on micro and core (2 pairs each).
- `openbao-install.sh --init-seal g2` (source `d95e1c7`): `seal-g2.key` 32 bytes 0600, created exclusively on micro;
  not named by the live config yet; never copied to core.
- Mismatch matrix (no operator material needed): the g1 snapshot offered as g2 -> `GENERATION_MISMATCH REFUSED` (no key
  byte read, exit 3); the g1 snapshot with g2's bytes under the g1 name -> `SEAL_MISMATCH FAIL` (the restored state did
  not unseal), exit 1. No rehearsal container or network left behind.
- Operator checkpoint 1 (script run by the operator in their own terminal; the agent re-checked micro afterwards):
  18:07:37Z `custody.seal-g2` recorded in the bootstrap ledger (emit | archive add-generation g2 --receipt |
  confirm-custody); archive read-only verify complete with g1 and g2; 18:08:07Z privileged `verify --full` on g1 with
  `--expect-root-revoked` (operator token explicit_max_ttl 14400 s, not periodic, default+operator); 18:09:31Z g1
  rehearsal of `openbao-20261018T174406Z-pre-change` with seal-g1 recovered from the offline archive -> `result=ok`
  (both limitations in the record); `--verify-recorded-matrix --expect-generations g1` -> OK with 2 mismatch records.
  No rehearsal container left.
- Source: thinx-swarm `46d15ca` (fixture suites decoupled from the live generation: bootstrap/maintenance install the
  first-deploy g1 form, exact-image stages every generation the committed config names; 60/32/136 pass against the
  overlap config) and `5d4f532` (vault.conf: `seal-g2` current, `seal-g1` previous). Laptop, origin and micro all at
  `5d4f532` before the install.
- 18:34:22Z `openbao-backup.sh --pre-change` -> `openbao-20261018T183422Z-pre-change` (g1) on both nodes; live config
  backed up to `/root/openbao.hcl.bak-20261018T1835Z-seal-g1` (0600); `openbao-install.sh` -> `OPENBAO-INSTALL-OK`
  (both seal files 32 bytes 0600; config dir holds only openbao.hcl).
- 18:34:55Z `docker service update --force vault_openbao` (the only service touched): 18:35:02Z "Auto Seal: static
  (current_key_id seal-g2, previous_key_id seal-g1)", unsealed with the stored key, `core.autoseal: upgrading recovery
  key` / `upgrading stored keys` (rewrapped under g2), one extra teardown/setup cycle, active node at Raft index 186.
  `--health` OK, container healthy; `--full --expect-seal-generation g2` (unprivileged part) OK; `--edge-exposure` ->
  `EDGE-EXPOSURE-OK`; thinx_api and traefik_traefik specs unchanged (e3d388a3c43f0342 / efeabd4953d5ca2c); 23
  services; ports 7442/1883/8883/443 open from the laptop; rtm 200.
- **Edge blip, not caused by OpenBao:** the first router check after the restart showed `thinx-db-https` and
  `thinx-influx-https` disabled (`the service "errorpage@swarm" does not exist`). The `git push origin master` of
  thinx-swarm minutes earlier had triggered its CircleCI error/downtime-page build, and Swarmpit autoredeployed
  `errorpage_errorpage` and `downtime_downtime` (task restart ~18:35:55Z). This is the documented transient. Within a
  minute: 29 routers, 0 errors, 0 warnings, inventory hash back to `fa0afd608550e585`. Lesson for the remaining pushes:
  push thinx-swarm to origin, wait for the errorpage task to restart, then run the edge gate.
- 18:37:09Z `--post-change` -> `openbao-20261018T183709Z-post-change`; 18:37:18Z `prepare` -> overlap snapshot S2
  `openbao-20261018T183718Z-pre-change` (manifest seal_generation g2, seal_previous_generation g1, Raft index 211);
  `--verify-both-nodes` -> 5 identical pairs on micro and core.
- Mismatch for S2 (no key byte read): offered as g2 with no previous generation -> `PREVIOUS_GENERATION_MISMATCH`
  refused, exit 3, recorded. The S2 rehearsal with the operator password is operator checkpoint 2.
- Operator checkpoint 2 (re-checked on micro): 18:41:17Z privileged `verify --full --expect-seal-generation g2
  --expect-root-revoked` OK; 18:42:26Z S2 rehearsal with seal-g2 recovered from the offline archive plus seal-g1
  (previous) from micro's runtime file -> `result=ok` (both limitations in the record);
  `--verify-recorded-matrix --expect-generations g1,g2` -> OK, 3 mismatch records.
- Retirement source: thinx-swarm `4793e2e` (vault.conf `seal-g2` current only; suites 60/32/136 pass). Pushed to
  origin first; waited for the CI errorpage/downtime redeploy (19:02:51Z / 19:02:57Z) and a clean router overview
  (29, 0 errors) before any OpenBao step; micro ff to `4793e2e`.
- 19:03:47Z `--pre-change` -> `openbao-20261018T190347Z-pre-change` (g2, previous g1); overlap config backed up to
  `/root/openbao.hcl.bak-20261018T1905Z-seal-g2-g1` (0600); `openbao-install.sh` OK.
- 19:03:59Z `docker service update --force vault_openbao` with seal-g1.key still on disk but unreferenced (cheap
  rollback): "Auto Seal: static (current_key_id seal-g2)" with no previous, unsealed with the stored key, healthy.
- Retirement of g1 from runtime: custody.seal-g1 in the ledger (17:38:47Z) and recovered from the archive in checkpoint
  1; core has no seal directory and no `seal-g*.key` anywhere on its root filesystem; on micro the only g1 bytes were
  `/var/lib/openbao/seal/seal-g1.key` (the two /root config backups hold `file://` references only; nothing on
  tmpfs) -> `shred -u -n 1 -z`. Seal dir now holds only `seal-g2.key`. **g1 stays in the encrypted offline archive
  until every snapshot that names it (seal_generation or seal_previous_generation g1, newest
  `openbao-20261018T190347Z-pre-change`) has aged out of the 90-day retention, i.e. not before 2027-01-16.**
- 19:09:03Z second forced update with g1 absent from the mount: unsealed with the stored key on seal-g2 alone,
  healthy; container sees only `seal-g2.key`.
- Task 2 gate: `verify --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> OK
  (`SEAL_GENERATION ok current g2`, `RETIRED_GENERATION_ABSENT ok`); privileged part last run in checkpoint 2.
  `--verify-recorded-matrix` (default generations g1,g2) -> OK.
- 19:10:08Z final snapshot `openbao-20261018T191008Z-post-change` (g2, no previous, Raft index 303, both restore
  limitations in the manifest); `--verify-both-nodes` -> 7 identical pairs on micro and core.
- Edge after the retirement: `EDGE-EXPOSURE-OK`; router inventory `fa0afd608550e585`, 29 routers, 0 errors; thinx_api
  and traefik_traefik specs unchanged; 23 services; 7442/1883/8883/443 open; rtm 200.
- Restore limitations, which apply to every snapshot above: (1) restoring rewinds authentication state, so
  credentials, tokens and roots revoked after the snapshot become valid again: restore production only from a
  snapshot taken after the last revocation; (2) ciphertext from Transit key versions created after the snapshot cannot
  be decrypted from it. Transit key rotation and deploy-key rewrap are Phase 41, not done here.

### 2026-10-18 Plan 39-05 Task 3: maintenance plane (backup, TLS, audit, incidents)

Source on micro: thinx-swarm `4793e2e` (clean checkout). Every step by hand, one at a time; nothing touched
traefik, the thinx stacks or thinx_api (thinx_api's SLACK_WEBHOOK secret file was only read, on micro, by the installer).

- Transfer plane re-checked read-only: `openbao-maintenance-install.sh --check` OK on micro (sender) and core
  (receiver).
- 19:11:08Z `openbao-maintenance-install.sh --full --send-test-alert`: transfer plane re-proven (probe pair
  finalized on core, arbitrary command and path refused, >= 1 GiB free on both), `openbao-cert-renew.sh` and
  `openbao-audit-reopen.sh` installed 0700, `/etc/cron.d/openbao-backup` (03:17 UTC `--daily`) and
  `/etc/cron.d/openbao-cert-renew` (04:47 UTC `--daily`) 0644 with node-local paths only, `/etc/logrotate.d/openbao`
  0644, rollback dirs 0700, `credentials/slack-webhook.curl` 0600 copied on micro from the local thinx_api task's
  SLACK_WEBHOOK secret (existing THiNX destination; value never shown), `SLACK_TEST_SENT ok`; API trust consumer
  installed and disarmed until Plan 06. No restore-rehearsal schedule exists.
- **Slack receipt, operator-observed (2026-10-18; test sent 19:11:08Z, receipt confirmed by the operator via the coordinator):** "THiNX OpenBao: maintenance
  alerts configured on micro (test message; one alert per incident from now on)." This is the receipt of the
  alert-configuration test; the incident begin/recovery messages below are for the operator to confirm at end of phase.
- Retention boundary and backlog, live: two marked dummy pairs (`THINX-OPENBAO-RETENTION-DUMMY`, manifest
  `dummy: retention-boundary-test`) made on micro only: `openbao-20260720T120000Z-daily` (90 d + ~7 h) and
  `openbao-20260721T000000Z-daily` (89 d + ~19 h). `--verify-both-nodes` -> `VERIFY_BACKLOG FAIL
  missing_or_different_on_core=2` (exit 1; verify mode opens no incident). 19:12:06Z real `--daily` -> pair
  `openbao-20261018T191207Z-daily` (Raft index 311), both dummies replicated first (`BACKLOG_CLEARED 2`), then
  `PRUNED_LOCAL pruned=1` / `PRUNED_CORE pruned=1`: the older dummy gone on both nodes, the 89-day one kept on both.
  The kept dummy was then removed by hand on both nodes (marker checked first); `--verify-both-nodes` -> 8
  identical pairs.
- Audit rotation: `logrotate -f /etc/logrotate.d/openbao` -> new empty-then-canary `audit.log` 0600, rotated
  `audit.log-20261018-1792350772` kept; postrotate SIGHUP + canary: `AUDIT_CANARY ok` (approle login entries,
  HMAC-redacted, no raw role/secret id). Unwritable sink: 19:13:05Z audit.log replaced by a directory ->
  `--postrotate` -> `AUDIT_REQUEST_BLOCKED` (OpenBao fails closed; server stayed unsealed and healthy); repaired
  (directory removed, file moved back) -> `--postrotate` OK at 19:13:12Z. Requests were refused for ~7 s; nothing
  consumes OpenBao yet. Incident: one begin (19:13:08Z), one recovery (19:13:13Z).
- Backup incident: backup.role-id renamed inside its 0700 dir -> two `--daily` runs in separate processes ->
  `BACKUP_CREDENTIALS_UNSAFE` both times: event `begin` (19:13:22Z), then `suppressed` (failed_runs=2); file
  renamed back -> `--daily` OK (`openbao-20261018T191324Z-daily`) with one `recovery` (19:13:29Z).
- Certificate incident: ca.key renamed inside its 0700 dir -> two `--daily` runs -> `CA_MATERIAL_MISSING`: `begin`
  (19:13:40Z), then `suppressed`; key renamed back (mode/owner/size unchanged) -> `--daily` `NOTHING_DUE` with one
  `recovery` (19:13:43Z).
- TLS leaf renewal, live: 19:13:55Z `--renew-leaf-now`: leaf issued from the host-local CA, validated, exact-image
  throwaway served the old leaf then the staged one after switch + SIGHUP, live `current` -> `r20261018T191355Z`
  (fp f412526a359b03a6, notAfter 2027-01-16 19:13:55Z), served leaf pinned and trusted as openbao.internal, wrong
  name refused; previous `r20261018T154740Z` kept; no throwaway left. `--verify-current` OK.
- Issuer (A2): live issuer automation stays fail-closed until Plan 06 attaches the first CA config and runs
  `--arm-api-trust` (`--verify-api-trust-consumer` -> `API_TRUST_NOT_ARMED`). The overlap bundle, both-side rollback
  on every issuer failure, expired-predecessor clients (Node probe rejects the expired anchor alone, trusts the
  overlap) and the other-node probe job pass in `tests/openbao-maintenance.test.sh all` (32 checks) against this
  source, tests 19–23.
- Initial rehearsal of the final g2-only state: `prepare` -> S3 `openbao-20261018T191442Z-pre-change` (g2, no
  previous, Raft index 357); `run --seal-generation g2` from micro's runtime key, no password -> restored on an
  internal network, unsealed with seal-g2 alone, throwaway root refused (restored state in force), restored
  thinx-api AppRole decrypts the canary and is denied key reads, audit HMAC-redacted -> `result=partial`
  (privileged checks need the operator password; the `result=ok` records for g1 and g2 are the checkpoint 1/2
  rehearsals). **Next rehearsal: before the next OpenBao upgrade (`prepare --pre-upgrade`, a snapshot from the last
  24 h), with the operator password.**
- Task 3 gate: `--verify-both-nodes` (10 identical pairs) && `--verify-current` (`r20261018T191355Z`) &&
  `openbao-verify.sh --maintenance` -> OK; `--check --expect-full` OK; incidents backup/cert-renew/audit all
  healthy. Edge: `EDGE-EXPOSURE-OK`, router inventory `fa0afd608550e585` (29, 0 errors), thinx_api/traefik specs
  unchanged, 23 services; 7442/1883/8883 open; rtm 200.

### 2026-10-18 Plan 39-06 Task 1: API deployment contract

- thinx-swarm `f179df3`: `thinx.yml` declares the external `openbao-internal` network, `BAO_ROLE_ID` / `BAO_SECRET_ID`
  secrets and the versioned external config `openbao-ca` (`name: openbao-ca-<sha20>`); only `api` uses them (overlay,
  two secret mounts, `/run/openbao/ca.pem`, `BAO_ADDR` / `BAO_CACERT`). Parent mirror `docker-swarm.yml` `6f94f286`.
  `tests/openbao-api-wiring.test.sh --source` -> `API-WIRING-OK` (both files equal their Phase 39 baselines once the
  five additions are removed; OpenBao subsets identical; `GIT_KEY_PASSPHRASE` kept; rsakey.js / git.js / package*.json
  unchanged since `PARENT_BASE`, no client module); `--self-test` -> 14/14 mutations refused.
- `openbao-verify.sh` gained `--api-service NAME`; `--full --maintenance --api-service` now combine. The bootstrap
  fixture suites that drive verify (`edge-exposure-fail-closed` 2, `protected-input-contract` 5,
  `bootstrap-state-machine` 14 against the exact image) pass. Installed on micro by `openbao-install.sh`
  (`OPENBAO-INSTALL-OK`, config byte-identical, verify.sh 0700 root).

### 2026-10-18 Plan 39-06 Task 2: thinx_api attached, trust consumer armed and exercised

Source: thinx-swarm `f179df3` on laptop, origin and micro (micro's checkout has only six untracked 2026-10-07
`*.bak.*-pre-v3-labels` files, no tracked change). The push to origin triggered the CI error/downtime rebuild; Swarmpit
redeployed `errorpage_errorpage` / `downtime_downtime` at 19:38:00Z / 19:38:06Z, and every gate below ran after it.

- Precondition (19:37Z): `openbao-verify.sh --full --maintenance --expect-seal-generation g2
  --expect-no-runtime-generation g1 --expect-root-revoked` -> `OPENBAO-VERIFY-OK mode=full+maintenance` (privileged
  part not run: needs the operator password); `openbao-internal` Internal=true; both secrets present and unattached.
- Rollback state (19:37:26Z): `/var/lib/openbao-maintenance/rollback/api-service` created 0700 root on micro's ext4
  (parent `rollback/` was already 0700; nothing broadened, nothing under `/mnt/data`);
  `thinx-api-pre-openbao-20261018T193726Z.json` 0600 root: one service, 2 networks, 11 secrets incl.
  `GIT_KEY_PASSPHRASE`, 27 env entries, 0 configs, no `BAO_*`; Version.Index 38382563; spec sha256/16 `d4fe340a8f8c4b02`.
- CA config `openbao-ca-46fa30be48446ff5a980` created from `/etc/openbao/ca/ca.pem` (equal to the server's
  `current/ca.pem`, one CA:TRUE certificate of the CA key, trusts the served leaf, no private key); content hash
  verified after creation.
- Pre-update edge gate (19:38Z, after the CI redeploy): `EDGE-GATE-OK` (table in Task 3).
- **The one targeted update** 19:38:56Z -> 19:39:17Z (`--network-add openbao-internal`, `--secret-add` x2,
  `--config-add .../run/openbao/ca.pem,mode=0444`, `--env-add` x2, `--no-resolve-image`; no other service, no stack):
  UpdateStatus `completed`, new task `bzatptgx3r05` on micro Running. Startup log: the same 5 New Relic vendor /
  DEP0169 lines as the previous task, nothing new.
- `tests/openbao-api-wiring.test.sh --live` -> `API-WIRING-OK` (22 rows): spec = backup + exactly the five additions;
  inside the task `readSecret()` (the image's own `lib/thinx/secrets.js`) returns both values from `/run/secrets`, not
  from env; `BAO_ADDR`/`BAO_CACERT` exact; bundle 1 certificate, no key; verified TLS to `openbao.internal` 200; no
  CA -> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, same-subject foreign CA -> same, bare task IP -> `ERR_TLS_CERT_ALTNAME_INVALID`;
  a login against a foreign CA fails in the handshake (no HTTP exchange); AppRole login 200, policies `["thinx-api"]`,
  TTL <= 20 min; random 32-byte canary encrypt / decrypt / rewrap / decrypt-rewrapped all 200 and matched; 13/13
  non-granted operations 403; unauthenticated encrypt 403; no token/ciphertext/UUID shape in the output. The transient
  token is left to expire (the policy cannot look up, renew or revoke it).
- Post-update edge gate 19:39:31Z: `EDGE-GATE-OK`.
- 19:40Z `openbao-cert-renew.sh --arm-api-trust --api-service thinx_api` -> `API_TRUST_ARMED` (mounted ok,
  no-CA and foreign CA refused inside the task).
- 19:40:42Z `openbao-backup.sh --pre-change` -> `openbao-20261018T194042Z-pre-change`.
- **Second issuer renewal after rollout** 19:40:54Z -> 19:41:54Z `--exercise-expired-predecessor --api-service
  thinx_api` -> `OPENBAO-CERT-OK mode=exercise`:
  1. spec saved 0600 (`rollback/api-trust/thinx_api-20261018T194057Z-*.json`); overlap config
     `openbao-ca-a113267bb8b8671b8d44` (expired predecessor + renewed anchor) deployed by one targeted update; in the
     new task: the bundle trusted, predecessor alone `CERT_HAS_EXPIRED`, renewed alone 200, no-CA and foreign refused.
  2. server `current -> r20261018T194119Z` (leaf under the renewed anchor, chain = overlap), served and trusted; the
     API task trusts it through the renewed anchor alone.
  3. spec saved again (`...194128Z...`); `openbao-ca-a2b56707515146d7a580` (renewed anchor only) deployed; server
     `current -> r20261018T194151Z` (same leaf, ca.pem = renewed only).
  4. `/etc/openbao/ca/ca.pem` replaced by the renewed certificate (same key and subject; fp `DF76A2BC95EA8D89`,
     notAfter 2031-10-17 19:40:54Z); the previous one kept as `ca.pem.retired-20261018T194154Z`.
- `--verify-api-trust-consumer --api-service thinx_api` (with the plan's 0700/0600 and one-task assertions) ->
  `OPENBAO-CERT-API-TRUST-OK service=thinx_api config=openbao-ca-a2b56707515146d7a580`; `--verify-current` ->
  `r20261018T194151Z`; 19:42:10Z `--post-change` -> `openbao-20261018T194210Z-post-change`.
- Source re-pinned to `openbao-ca-a2b56707515146d7a580` in both deployment files; `--source` and `--live` (now
  `SOURCE_CONFIG_MATCH`, spec delta still exactly the five additions) -> OK. Edge gate after the exercise: `EDGE-GATE-OK`.
- API restarts in this task: three (the attach and the two trust swaps), each stop-first on micro; final task
  `v91bcumsz5bx`, Version.Index 38382842 (UpdatedAt 19:41:49Z). Docker configs kept for rollback:
  `openbao-ca-46fa30be48446ff5a980` (original anchor), `openbao-ca-a113267bb8b8671b8d44` (overlap); the consumer never
  removes a previous config.
- The archived `ca-cert` in the offline recovery image is now stale (the archived CA key is unchanged and re-creates
  any CA certificate); refreshing it is optional (39-03 note).
- Cosmetic: run over ssh from the laptop, `perl` (the atomic symlink rename) prints locale warnings for the forwarded
  `LANG=cs_CZ.UTF-8`; cron has no such variable. Prefix `LC_ALL=C` when running the script by hand.
- Rollback (not needed): section 10.

### 2026-10-18 Plan 39-06 Task 3: Phase 39 final gate

All rows below were run after the last thinx-swarm push (`5897b8b`; CI error/downtime redeploy at 19:47Z) unless a
row names an earlier record. "Operator" rows needed the operator's password, session or eyes; the operator ran the
scratchpad script `p06-operator-final-gates.sh` at about 20:00-20:03Z and reported no FAIL line (below).

**Verifiers**

- 19:48Z `openbao-verify.sh --full --maintenance --api-service thinx_api` -> `OPENBAO-VERIFY-OK
  mode=full+maintenance+api` (55 ok rows; privileged part not run).
- 19:48:29Z -> 19:48:45Z `docker service update --force vault_openbao` (the only service touched): "Auto Seal: static
  (current_key_id seal-g2)", "unsealed with stored key", `--health` OK with no operator input. Then
  `--full --expect-seal-generation g2 --expect-no-runtime-generation g1 --expect-root-revoked` -> OK (TLS no-CA and
  bare-IP rejected, seal g2, g1 absent, backup AppRole snapshot / restore denied / decrypt denied / revoke-self,
  audit 0600 HMAC with the request logged and this run's values absent, root revoked 17:39:26Z with rejection proof).
- `tests/openbao-api-wiring.test.sh --live` after that restart -> `API-WIRING-OK` (18 ok rows, same matrix as Task 2).
- `openbao-cert-renew.sh --verify-current` -> `r20261018T194151Z`; `--verify-api-trust-consumer` -> OK
  (`openbao-ca-a2b56707515146d7a580`).
- `openbao-backup.sh --verify-both-nodes` -> 12 identical pairs on micro and core (newest
  `openbao-20261018T194210Z-post-change`); `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> g1,g2 OK, 3
  mismatch records; cron `openbao-backup.sh --daily` 03:17 and `openbao-cert-renew.sh --daily` 04:47 (node-local
  paths), no restore schedule; incidents backup / cert-renew / audit `healthy`.
- Legacy `/mnt/glusterfs/vault` and `/mnt/gluster/vault`: 47 entries each, metadata digest `cbdb06347adf3996` on both
  (unchanged since the Plan 05 pre-state; never read, migrated or deleted).

**Edge (laptop + micro loopback; scratchpad `p06-edge-gate.sh`)**

| Row | Baseline | Final |
|---|---|---|
| Traefik http routers, sorted `name status`, byte-for-byte | 29, sha256/16 `fa0afd608550e585` | identical (cmp) |
| tcp routers / disabled / naming vault or openbao | 0 / 0 / 0 | 0 / 0 / 0 (`vault.thinx.cloud` unrouted) |
| `openbao-verify.sh --edge-exposure` | `EDGE-EXPOSURE-OK` | `EDGE-EXPOSURE-OK` |
| traefik_traefik / traefik_socket-proxy UpdatedAt | 06:47:26Z | 06:47:26Z (untouched) |
| thinx_api | 1/1 on micro | 1/1 on micro (task `v91bcumsz5bx`) |
| rtm `/`, rtm `/api/v2/csrf-token`, app `/` | 200 / 200 / 200 | 200 / 200 / 200 |
| 7442, 1883, 8883 from the laptop to the public IP; HTTP on :7442 | open; 200 | open; 200 |
| `scripts/probe-rtm-handshake.sh` summary (exit is always 0) | `0/4` | `Bare-nginx-404 rows (4-7) detected: 0/4` |
| WS cookie-less upgrade `/` | 101 | 101 |
| WS `Cookie: foo=bar` `/p33probe` | 401 + `X-Forwarded-Proto: https` | same |
| `scripts/check-ws-multitab.js wss://rtm.thinx.cloud` | 2/2 opened | 2/2 opened |
| bare IP http / https | 301 / 200 | 301 / 200 |

One gate run at about 19:50-19:51Z had empty answers on the last two WS rows only (no API restart, no Traefik 5xx in
that window); the direct re-probe at 19:52:04Z and two full gate runs after it were all green. Recorded as a transient.

**Operator rows (passed, operator-confirmed 2026-10-18; script `p06-operator-final-gates.sh`, no FAIL line)**

The verdicts are the operator's report, relayed by the coordinator. Rows 1 and 2 were cross-checked afterwards on micro
without secret material (timestamps and booleans only).

1. **Privileged `verify --full --expect-seal-generation g2 --expect-no-runtime-generation g1 --expect-root-revoked
   --api-service thinx_api`** -> `OPENBAO-VERIFY-OK mode=full+api`, on seal-g2 alone after the g1 retirement. Covers
   operator token explicit_max_ttl 14400 s, not periodic; userpass metadata 4h/4h/4h/0; key flags aes256-gcm96 /
   false / false / false; three policies byte-identical; thinx-api role; one Raft voter. Audit-log cross-check:
   - `auth/userpass/login/operator` request 20:00:19.99Z, response 20:00:20.16Z (no error, policies include `operator`);
   - operator `transit/keys/thinx-deploy-keys` read 20:00:21.76Z and `sys/storage/raft/configuration` 20:00:23.89Z,
     both without error;
   - `auth/token/revoke-self` 20:00:24.28Z without error;
   - the in-task probe's key read at 20:00:28.93Z was refused (the API token's expected 403).
2. **WebSocket on the operator's real owner path** -> `WS PLAN_GATE ok` (the plan's Task 3 command verbatim: CSRF
   200, 7442/1883/8883 open, diagnostic 0/4, both curl configs 0600, `Cookie: foo=bar` -> 401, valid `x-thx-core`
   session -> 101) and `WS SESSION_HELD ok` (the authenticated socket stayed open for 15 s, not closed 1008). Code
   reading (`lib/thinx/socket_upgrade.js`): a cookie-less upgrade on an owner path gets 101 and is then closed 1008,
   and any `x-thx-core` value gets 101, so only "held open" proves a session. API-log cross-check (event types only):
   - 20:02:00Z a non-session-cookie 401 and an owner socket admitted;
   - 20:02:15Z an owner socket admitted;
   - no "no verified session owner" (1008) rejection since 19:55Z.
3. **Slack receipts** -> `SLACK RECEIPTS ok`. All six Plan 05 test-incident messages arrived once each: audit
   19:13:08Z begin / 19:13:13Z recovery, backup 19:13:22Z / 19:13:29Z, cert-renew 19:13:40Z / 19:13:43Z. The operator
   also shared a Slack screenshot showing all six with the coordinator.

**Phase 39 matrix**

| Item | Evidence | State |
|---|---|---|
| D-01 OpenBao, exact tag | `openbao/openbao:2.7.1` in the spec, no digest (`IMAGE_EXACT_TAG`); research + exact-image suite | green |
| D-02 one replica, micro pin, internal overlay, no port/route, node-local data | `ONE_TASK_ON_MICRO`, `PINNED_MICRO_MANAGER`, `NO_PUBLISHED_PORT`, `NO_GLUSTER_MOUNT`, `EDGE-EXPOSURE-OK`, router inventory = baseline | green |
| D-03 auto-unseal, API-verified TLS, non-exportable key, AppRole e/d/r only | 19:48:45Z unseal; live TLS positive + 3 negatives in the task; 13/13 + unauthenticated 403; key flags re-read by the operator 20:00Z | green (key flags re-read 20:00Z, operator row 1) |
| D-04 ssh + exec only, root revoked, rotation and restore exercised | root revoked 17:39:26Z, rejection proof; g1 -> g2 rotation; g1/g2 rehearsals `result=ok`, S3 `partial` | green |
| D-05 dormant vault.yml replaced | thinx-swarm `vault.yml` / `vault.conf` (Plan 01), no Vault pin, no public router | green |
| D-06..D-09 encrypted sole-operator custody, guided setup | Plans 04/05: archive verify with g1, g2, share, CA key/cert; ledger custody records | green (archived ca-cert stale after the issuer renewal; optional refresh) |
| D-10..D-13 operator userpass, 4 h hard cap, full admin, own password | Plan 05 checkpoints (explicit_max_ttl 14400 s, not periodic) | green (re-run 20:00:20Z, operator row 1) |
| D-14 daily + pre/post-change snapshots | cron 03:17; `194042Z-pre-change`, `194210Z-post-change` around the issuer renewal | green |
| D-15 copy to core, root-only, not Gluster | 12 identical pairs micro/core; forced-command receiver | green |
| D-16 90 days on both | Plan 05 live boundary test (90 d + 7 h pruned on both, 89 d + 19 h kept) | green |
| D-17 initial rehearsal, then before upgrades | g1/g2 `ok`, S3 `partial`; no restore cron | green |
| D-18 normal operation, brief API restart, verify, roll back | one attach update + two consumer swaps, live test + edge gate after each, rollback recipe section 10 | green |
| D-19 TLS renewal automated and verified | leaf renewed live (Plan 05); issuer renewed through the armed consumer with an expired predecessor (this plan) | green |
| D-20 existing ops Slack channel | test message receipt confirmed (Plan 05) | green (incident receipts confirmed, operator row 3) |
| D-21 one begin, one recovery | Plan 05 begin -> suppressed -> recovery for backup, cert-renew, audit | green (state machine + six receipts, operator row 3) |
| D-22 repo-first, own stack, targeted API update with root-only backup, no thinx/traefik redeploy, 7442 + plain MQTT | thinx-swarm commits on micro by ff-merge; `vault` stack; 0600 backup in a 0700 node-local dir; traefik UpdatedAt unchanged; ports open | green |
| VAULT-01 | D-01/D-02 rows | green |
| VAULT-02 | node-local Raft, snapshots outside ssh_keys and Gluster backups, both nodes | green |
| VAULT-03 | internal CA, `vault.conf` without `tls_disable`, API verifies `BAO_CACERT` in the task | green |
| VAULT-04 | static seal file 32 B 0600 on micro, offline copy, rotation via previous key exercised | green |
| VAULT-05 | aes256-gcm96, exportable / plaintext backup / deletion false | green (re-read 20:00Z, operator row 1) |
| VAULT-06 | thinx-api policy 3 paths update-only; BAO_ROLE_ID/BAO_SECRET_ID swarm secrets read by `readSecret()` in the task; no root token | green |
| VAULT-07 | file audit 0600 node-local, HMAC, API request logged | green |
| VAULT-08 | sections 4-10 of this runbook, ssh + exec only | green |
| SC1 one tagged task on the Raft manager, overlay only, no port/router, no Gluster | D-02 row | green |
| SC2 TLS from inside thinx_api verifies with `BAO_CACERT`, fails without | `TLS_VERIFIED` / `TLS_NO_CA_REFUSED` (+ foreign CA, bare IP) | green |
| SC3 auto-unseal after `--force`, static seal file, recovery keys, rotation once | 19:48:45Z; g1 -> g2 | green |
| SC4 AppRole round-trip, every other path denied, key flags, no root token | live canary + 13/13 + unauthenticated 403; flags re-read 20:00Z (operator); root revoked | green |
| SC5 audit, snapshot outside ssh_keys/Gluster, throwaway restore, runbook | rows D-14..D-17, VAULT-07/08 | green |
| Deferred stays absent | no change to `lib/thinx/rsakey.js`, `lib/thinx/git.js`, `package*.json` since `PARENT_BASE`; no OpenBao client under `lib/`; `GIT_KEY_PASSPHRASE` still mounted and set; no deploy key encrypted or migrated; Transit key never rotated; no HA, public route, cloud KMS or PwnDoc retest | green |

**Rollback set (none used):** section 10 for the API; `docker stack rm vault` keeps every node-local path (section 4);
older Docker configs `openbao-ca-46fa30be48446ff5a980` and `openbao-ca-a113267bb8b8671b8d44` are kept for the trust
consumer's rollback.

### 2026-10-18 Review-fix redeploy (39-REVIEW-FIX, thinx-swarm `471a95f`)

Run 21:57-22:10Z by hand, one step at a time, outside the 03:17 / 04:47 UTC cron windows. No service was restarted or
updated by this redeploy; the only service changes were the CI error/downtime-page redeploy after the push.

- Pre-check 21:57Z: Traefik 29 http routers, none disabled; rtm 200; 7442/1883/8883 open from the laptop;
  `openbao-verify.sh --health` -> `OPENBAO-VERIFY-OK mode=health`; no `openbao-(backup|cert-renew)` process on micro
  or core. Spec sha256/16: thinx_api `005ba713d94e3540` (UpdatedAt 19:41:49Z), traefik_traefik `efeabd4953d5ca2c`,
  vault_openbao `b536ee24baa1d152`.
- `git push origin master` (5897b8b..471a95f); CI redeployed `errorpage_errorpage` 21:59:59Z and `downtime_downtime`
  22:00:05Z; routers back to 29 enabled at 22:00:15Z before any further step. micro ff to `471a95f` through
  `p39-fix-incoming` (deleted); laptop = origin = micro, no tracked change.
- `openbao-install.sh` -> `OPENBAO-INSTALL-OK mode=install` (`PREFLIGHT_SOURCE ok 45 checks`; updated operator.hcl,
  openbao-common/install/bootstrap/verify.sh; openbao.hcl unchanged, so no `vault_openbao` restart).
- `openbao-maintenance-install.sh --full` (no test alert) -> `OPENBAO-MAINTENANCE-INSTALL-OK mode=full role=sender`:
  `/etc/tmpfiles.d/openbao-maintenance.conf` 0644 installed, `TMPFILES_APPLIED ok`; `/run/openbao-maintenance` and
  `/run/lock/openbao` 0700 root; `systemd-tmpfiles --cat-config` lists both `d` entries (this systemd has no
  `--dry-run`); cron/logrotate/Slack config unchanged; API trust consumer armed.
- core: `--backup-prereqs-only --role receiver --sender-from 10.133.0.2 --sender-key-fd 0` (micro's .pub piped) ->
  `OPENBAO-MAINTENANCE-INSTALL-OK mode=prereqs role=receiver` (openbao-common.sh updated, receiver and
  authorized_keys line unchanged); `--check --role receiver` OK. Transfer re-proven against the updated receiver by a
  second sender `--full`: `TRANSFER_PROBE` / `TRANSFER_RESTRICTED` / `TRANSFER_VERIFIED ok`.
- Post-checks: `openbao-verify.sh --full --maintenance --api-service thinx_api` -> `OPENBAO-VERIFY-OK
  mode=full+maintenance+api` (58 ok rows; privileged part not run, so the expected WR-14 operator POLICY_DRIFT is not
  visible unattended: the policy comparison is privileged); `--check --expect-full` OK; `openbao-cert-renew.sh
  --verify-current` -> `r20261018T194151Z`; `openbao-backup.sh --incident-status` backup healthy, and `--check`
  (inside verify --maintenance) requires all incidents healthy; `--verify-both-nodes` -> 12 identical pairs.
- Edge after: 29 routers none disabled; `EDGE-EXPOSURE-OK`; rtm 200; 7442/1883/8883 open; thinx_api 1/1 with spec
  `005ba713d94e3540`, traefik `efeabd4953d5ca2c`, vault_openbao `b536ee24baa1d152` (all unchanged).
- Leftover: ten pre-WR-06 lock files `/run/lock/openbao-*.lock` remain (all unheld); nothing uses them now, and they
  disappear at the next reboot (/run is tmpfs).
- **Open (operator):** WR-14's narrower `operator.hcl` is installed on micro but not live. Operator session on micro:

  ```bash
  ssh -t micro
  C=$(docker ps -q -f label=com.docker.swarm.service.name=vault_openbao -f status=running)
  docker exec -it "$C" bao login -method=userpass username=operator          # hidden prompt
  docker exec -i "$C" bao policy write operator - < /etc/openbao/policies/operator.hcl
  docker exec "$C" sh -c 'bao token revoke -self; rm -f ~/.vault-token'
  /usr/local/sbin/openbao-verify.sh --full --api-service thinx_api          # terminal: privileged part, expect POLICY_EXACT operator
  ```

### 2026-10-19 Plan 40-05 Task 1: pre-cut-over gate

Run about 08:50-09:05Z from the laptop. Nothing on micro, core or any live service was touched. The only pushes were the
console submodule and the non-deploying `thinx-unit` branch. Parent `thinx-staging` was not pushed.

- SHAs: parent release candidate `2b1eecdb` (`2b1eecdbaedf38c251ea25bdaa912c9b07a0157a`); console `7e3d1fe`
  (gitlink = submodule HEAD, clean tree); thinx-swarm laptop HEAD `8cfa7dd` (40-04, one commit ahead of
  origin/master `471a95f`, not pushed in this task).
- Precondition: `gh auth status` ok; 40-01..40-04 SUMMARYs present; origin `thinx-staging` has no
  `lib/thinx/transit.js`.
- Local regression (all exit 0):
  - Vue `test:unit`: no `not ok` line. Legacy `deploykey.cjs`: "all checks passed", including D11.
  - Jasmine: TransitSpec 27/0, KeyFormatSpec 29/0, GitSpec 49/0, SecretsSweepSpec 44/0, GitHubLinkSpec 23/0,
    BuilderRemoteJobSpec 77/0, BuilderApiKeySpec 54/0, RedisHealthSpec 4/0. None pending.
  - 03-RsakeySpec with the prior-phase filter `^RSA Key \((?!13\))`: 17 of 18 specs ran, 0 failures. (13) needs
    CouchDB.
  - `node --test`: DeployKeyNames 46/46, CiPipelineGates 30/30.
  - TransitIntegrationSpec through `scripts/openbao-dev.sh run`: 8 specs, 0 failures. No pending spec, no
    key/ciphertext/secret shape in the output, no `thinx-openbao-dev` container left.
  - thinx-swarm wiring gate: `--source thinx.yml docker-swarm.yml` -> `API-WIRING-OK mode=source` with
    `KEYGEN_SWITCH ok` x2; `--self-test` -> `SELF_TEST ok 17/17 mutations refused`, `API-WIRING-OK mode=self-test`.
  - Section 11 strings present under `lib/`: `API Transit FAILING` and `[transit] probe ok` (transit.js);
    `deploy key unavailable: ` (git.js, builder.js); `key_service_unavailable` (router.rsakey.js,
    github_link.js, rsakey.js).
- Console: `git -C services/console push origin thinx-staging` fast-forwarded `ec63c74..7e3d1fe` (the five 40-03
  commits).
- `git push origin HEAD:refs/heads/thinx-unit` created the branch (none existed before) at `2b1eecdb`. No force.
- CircleCI: pipeline 5686, workflow `main` `dc7bdd9a-bb15-4d80-850d-f2b5cdcd3bd4`, job `test` #16121
  (`8cc1c863-a5cf-4b6d-a541-073c74833ff0`). It ran 08:54:55-08:57:45Z and passed on the first run, with no fix
  rounds. `ci/circleci: test` = success for `2b1eecdb`; the workflow ran only that job.
  - Every step was green, including "Starting OpenBao" (`OPENBAO-SETUP-OK`), so the RESEARCH A2 compose concern
    did not materialize.
  - The suite reported 1958 specs, 0 failures, 1 pending, which is the long-standing `AppSpec /api/logout` xit.
    TransitIntegrationSpec ran against the compose dev server: its denied, unreachable, not_configured and
    bad_ciphertext log lines appear in the job output. No key, ciphertext or secret shape appears in the output.
- Plan verify blocks: console (Vue + legacy + console HEAD on origin thinx-staging) exit 0; CI (thinx-unit SHA
  green, no transit.js on origin thinx-staging) exit 0.

### 2026-10-19 Plan 40-05: Phase 40 cut-over

Operator go (Task 2) was given before Task 1 ran, on condition that Task 1 was fully green; it was. Run 09:09-09:33Z.
Live mutations: the thinx-swarm push to origin and to the micro checkout (ff-merge), and the parent
`thinx-staging` push. CI and Swarmpit did the rest. No `docker stack deploy`, no `restart.sh`, and no `docker service update` by hand.
swarm-autopull-recovery was not needed.

- SHAs:
  - parent `8b6879e0` pushed to `thinx-staging` (`ab3ae8ba..8b6879e0`). It differs from the thinx-unit-green
    `2b1eecdb` only under `.planning/` (the Task 1 evidence) and descends from it.
  - console `7e3d1fe` (gitlink = origin `thinx-staging` of the console).
  - thinx-swarm `8cfa7dd`, on the laptop, origin `master` and the micro checkout alike.
- Pre-state 09:09-09:10Z:
  - thinx_api task `wir7204blx1ikd9mr99ok1e7m` on micro, image digest `fb2fc070d6835236`, spec UpdatedAt
    2026-10-18 22:27:17Z.
  - Traefik http routers: 29, sorted `name status` sha256/16 `fa0afd608550e585` (= the Phase 39 baseline), none
    disabled.
  - 7442, 1883 and 8883 were open from the laptop to the public IP, HTTP on :7442 answered 200, and rtm `/` and
    `/api/v2/csrf-token` answered 200 / 200.
- thinx-swarm:
  - `git push origin master` `471a95f..8cfa7dd` at 09:10:49Z. CircleCI `docker-build-error-page` #167 and
    `docker-build-downtime-page` #168 succeeded at 09:12:34Z.
  - `errorpage_errorpage` redeployed 09:12:58Z and `downtime_downtime` 09:13:02Z. The router hash was unchanged at
    09:13:04Z.
  - The micro checkout had no tracked change; six untracked `*.yml.bak.20261007222957.pre-v3-labels` files are
    pre-existing and were left alone. Pushed as `p40-ff` plus `refs/remotes/origin/master`, then
    `git merge --ff-only p40-ff` and `git branch -d p40-ff`. micro HEAD is `8cfa7dd`.
- Parent CI for `8b6879e0` (all success):
  - `test-console-classic` #16126 09:13:51Z, `console-classic-registry` #16127 09:16:02Z;
  - `test` #16124 09:16:57Z, `api-registry` #16125 09:18:56Z;
  - `test-vue-console` #16122 09:19:59Z, `vue-console-registry` #16123 09:25:15Z.
- Rollout:
  - The new thinx_api task `tk89thgjiptv1d1z4e9l1kepw` runs on micro. The container started 09:20:22Z with 0
    restarts. The image digest is `e9e99385d27056e2`, and the spec UpdatedAt is 09:20:28Z, about 90 s after
    api-registry.
  - `thinx_console` rolled 09:16:55Z and `thinx_vue` 09:26:03Z, both on core.
- Live checks (09:25-09:32Z):
  1. Transit log since 09:19Z: one `[transit] probe ok`, zero `probe failed`.
     - PID 1 is `docker-entrypoi` (`/docker-entrypoint.sh`, `/bin/sh`), not node. Node (`node-MainThread`, PID 26)
       is its direct child and the script's last foreground command, so a node exit still ends the container.
     - The 40-02 crash-case assumption therefore holds in effect, though not literally.
     - `thinx-agent-*` directories in the task tmpdir: 0.
  2. `tests/openbao-api-wiring.test.sh --live` -> `API-WIRING-OK mode=live`, every row ok. `SPEC_DELTA ok`: the live
     spec equals the Phase 39 baseline plus the five OpenBao additions, with only the image ignored, so Swarmpit
     changed nothing else (RESEARCH A1 held). `TRANSIT_CANARY ok`, `FORBIDDEN_DENIED` 13/13, `OUTPUT_CLEAN ok`.
  3. `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` ->
     `OPENBAO-VERIFY-OK mode=full` (`SEAL_GENERATION ok current g2`, `RETIRED_GENERATION_ABSENT ok`).
     `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> `OPENBAO-REHEARSAL-MATRIX-OK generations=g1,g2`, with
     3 mismatch records.
  4. Ports 7442, 1883 and 8883 open; HTTP on :7442 answers 200.
  5. rtm `/` and `/api/v2/csrf-token` answer 200 / 200. The routers are byte-identical to the pre-state (29,
     `fa0afd608550e585`, none disabled). traefik_traefik and traefik_socket-proxy UpdatedAt are still
     2026-10-18 06:47:26Z.
  6. Public HTTPS in the new task: `PUBLIC_HTTPS_FETCH clone=ok keyless=ok`. Both `p40-pub-` directories are
     removed (0 left).
  7. `THINX_DEPLOY_KEYGEN` was not exercised live; the live spec has no entry (unset = enabled).
- Served consoles: the D-03 sentence is present in the legacy `DeploykeyController.js` on rtm and in the Vue bundle
  on console.thinx.cloud. That proves only the new images; the 503 path itself was not triggered live.
- Not pushed: `main` (still `14c08c1f`) and no tag. This entry is a local docs commit, which the next deliberate
  `thinx-staging` push carries.
- **Pending (operator, end-of-phase UAT):**
  - a public HTTPS repo build;
  - a new deploy key that is one `vault:vN:` line at mode 600 with no PEM;
  - a private-repo build with that key, and 0 `thinx-agent-*` directories afterwards;
  - a legacy-key private build;
  - the console-retest checklist;
  - the 503 `key_service_unavailable` sentence seen in the Vue console (needs the kill switch or an OpenBao outage,
    so it is UAT-only).

### 2026-10-20 Plan 41-02 Task 1: migration tool deployed, dry-run

Run 12:00-12:30Z from the laptop. Live mutations: the `thinx-unit` push and the parent `thinx-staging` push. CI and
Swarmpit did the rest. No `docker stack deploy`, no `restart.sh`, no `docker service update` by hand, and
swarm-autopull-recovery was not needed. No key file was written: the only in-task runs were `--report`, `--dry-run` and
the purge scan.

- SHAs: parent `5d972067` (`5d972067ad88c7b955da87475bfaee3d234453d3`, the 41-01 docs head). origin `thinx-staging` was `a1f9176c`, an ancestor;
  the pushed range differs from it only in the six 41-01 files (`lib/thinx/transit.js`, `scripts/migrate-deploy-keys.js`,
  `spec/fixtures/fake-transit.js`, `spec/fixtures/mock-openbao.js`, `spec/jasmine/MigrateDeployKeysSpec.js`,
  `spec/jasmine/TransitSpec.js`) plus `.planning/`. thinx-swarm unchanged at `8cfa7dd`.
- Pre-state 12:01Z: thinx_api task `jei4hunf12ra5xn8t8rib4ck8` on micro, image digest `47dd29169d32a21f`, spec UpdatedAt
  2026-10-19 15:19:12Z. Traefik http routers: 29, sorted `name status` sha256/16 `fa0afd608550e585` (the Phase 39
  baseline), none disabled. 7442, 1883 and 8883 open from the laptop.
- Local regression (all exit 0; `--config=/dev/null --random=false`, `ENVIRONMENT=development` with placeholder CouchDB
  names):
  - Jasmine: MigrateDeployKeysSpec 31/0 (2 pending = the dev-server E1/E2, run below), TransitSpec 33/0, KeyFormatSpec
    30/0, GitSpec 66/0, SecretsSweepSpec 44/0, BuilderRemoteJobSpec 77/0, BuilderApiKeySpec 54/0, RedisHealthSpec 4/0.
  - 03-RsakeySpec with `^RSA Key \((?!13\))`: 17/0.
  - `node --test` DeployKeyNames + CiPipelineGates: 76/76.
  - `scripts/openbao-dev.sh run` TransitIntegrationSpec + MigrateDeployKeysSpec: 41 specs, 0 failures, none pending, no
    key/ciphertext/token shape in the log, no `thinx-openbao-dev` container left.
  - thinx-swarm wiring gate: `--source thinx.yml <parent>/docker-swarm.yml` -> `API-WIRING-OK mode=source`
    (`KEYGEN_SWITCH ok` x2); `--self-test` -> `SELF_TEST ok 17/17`, `API-WIRING-OK mode=self-test`.
- CircleCI:
  - `thinx-unit` `71a7bbf1..5d972067` (fast-forward): `test` #16153, success 12:19:26Z, first run, no fix rounds.
  - `thinx-staging` `a1f9176c..5d972067` at 12:19:59Z: `test` #16154 12:23:37Z, `api-registry` #16155 12:25:41Z,
    `test-console-classic` #16158, `console-classic-registry` #16159, `test-vue-console` #16156 all success;
    `vue-console-registry` #16157 was still running at 12:30Z (no console source changed in this range).
- Rollout: new thinx_api task `j9n880hztl5pg4fnptefq6eh7` on micro, container started 12:26:29Z with 0 restarts, image
  digest `d021ae3ce2b55920`, spec UpdatedAt 12:26:35Z (about 55 s after api-registry). `scripts/migrate-deploy-keys.js`
  present in the task.
- Live checks (12:27-12:29Z), all pass:
  1. Transit log since 12:25Z: one `[transit] probe ok`, zero `probe failed`.
  2. `tests/openbao-api-wiring.test.sh --live` -> `API-WIRING-OK mode=live`: `SPEC_DELTA ok` (image and
     `THINX_DEPLOY_KEYGEN` ignored), `TRANSIT_CANARY ok` (encrypt, decrypt, rewrap, decrypt-rewrapped 200),
     `FORBIDDEN_DENIED` 13/13, `OUTPUT_CLEAN ok`.
  3. `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> `OPENBAO-VERIFY-OK
     mode=full`; `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> `OPENBAO-REHEARSAL-MATRIX-OK
     generations=g1,g2` (3 mismatch records).
  4. Ports 7442, 1883 and 8883 open.
  5. Routers byte-identical to the pre-state (29, `fa0afd608550e585`, none disabled); traefik_traefik and
     traefik_socket-proxy UpdatedAt still 2026-10-18 06:47:26Z.
- Read-only data in the task (container path `/mnt/data/ssh_keys` = host `/mnt/gluster/thinx/ssh_keys`):
  - `--report`: private_files 78, transit_total 1 (`v1` 1), legacy_total 77 (encrypted_pkcs8 72, pkcs1 4, openssh 1,
    other 0), unknown 0, unreadable 0, stray_askfiles 0, leftover_tmp 0.
  - `--dry-run`: the same counts; decrypted_with secret 72, historic_literal 0, unencrypted 5; predicted migrate 77,
    quarantine 0; quarantine list empty; pub_mismatch 0; writes 0, transit_requests 0, aborted null, failed 0.
  - `purge-orphaned-rsa-keys.js --json` (scan): owners_in_db 378, owners_on_disk 29, owners_retained 28,
    orphaned_owners 1, keys_affected 1 (one private file plus its `.pub`), stray_askfiles 0.
  - The OpenSSH-format key is **not** an orphan's: its owner is the D-10 owner `test` (`cedc16bb…`, key
    1649693687313). That owner has 5 keys, all legacy (pkcs1 2, openssh 1, encrypted_pkcs8 2, among them
    1789766455048) and no Transit key, each mode 600 with a `.pub`. Host first-line kinds agree with `--report`
    (72/4/1/1). Only first lines were read, and only the kind word was printed.
- Not pushed: `main` and no tag. This entry is a local docs commit.

### 2026-10-20 Plan 41-02 Task 3: production migration

Run 12:33-12:53Z from the laptop, after the operator's Task 2 answer "go", which also accepted the persistent
console audit-log warning entry as the D-03 quarantine-notification channel. Live mutations: the D-05 tar on micro,
the orphan purge and `--migrate`, all in task `j9n880hztl5pg4fnptefq6eh7` on micro (unchanged since Task 1).
No `docker stack deploy`, no `restart.sh`, no `docker service update`. Every read printed counts, modes, first bytes
(`head -c 9`) and verdicts only.

- D-05 backup, 12:33:59Z, root on micro, `set -eu; umask 077`:
  - `/root/thinx-backups` `700 root`; `deploy-keys-premig-20261020T123359Z.tar` `600 root`, 440320 bytes; its `.sha256`
    `600 root`, sha256 first 12 hex `14b0c741a762`, `sha256sum -c` ok.
  - Tar entries 157 = 156 `ssh_keys` entries + the directory. `findmnt -T` ext4 (micro's `/dev/vda1`, 16G free), not
    GlusterFS. `grep -c /root /etc/cron.daily/backup` = 0. The tar was not copied off micro or into the container.
- D-01 orphan purge, `purge-orphaned-rsa-keys.js --apply --askfiles --json`, exit 0: owners_in_db 378, owners_on_disk 29,
  owners_retained 28, orphaned_owners 1, keys_affected 1, stray_askfiles 0, removed_askfiles 0. Same owner and count as
  the Task 1 scan. The orphan's key was a pkcs1 key.
- Dry-run re-run: private_files 77, transit 1 (`v1`), legacy 76 (encrypted_pkcs8 72, pkcs1 3, openssh 1), unknown 0,
  unreadable 0; decrypted_with secret 72, historic_literal 0, unencrypted 4; predicted migrate 76, quarantine 0; the
  quarantine list was empty, so no quarantine the operator had not seen. writes 0, transit_requests 0, aborted null.
- `--migrate --json`, 12:46:33Z: migrated 76, already_transit 1, quarantined 0, notified 0, failed 0,
  changed_during_run 0, pub_mismatch 0, decrypted_with secret 72 / historic_literal 0 / unencrypted 4, writes 76,
  transit_requests 152, aborted null. Quarantine entries: none, so no D-03 audit-log warning was written.
  - Executor error, no data effect: the executor's shell command for this run redirected the report on micro to a stray host file
    (`/dev/null.tmp`, 536 bytes, 644) instead of returning it. The executor read its last line (the JSON above, counts only, no owner
    id because the quarantine list is empty) and then removed it. `/dev/null` was not affected.
- Idempotent re-run, `--migrate --json` (the plan's verify command): migrated 0, failed 0, legacy_total 0, already_transit
  77, transit `v1` 77, changed_during_run 0, writes 0, transit_requests 0, aborted null.
- Host checks (`ssh_keys` on micro, the plan's verify command, all pass): 77 private files, 77 starting with `vault:v`,
  0 not mode 600, 0 files with a `PRIVATE KEY` line, 77 `.pub`, 154 entries (156 minus the orphan pair), 0 tmp leftovers.
  The backup custody checks above re-ran in the same command.
- D-10 keyed fetch: owner `test` (`cedc16bb…`, unique in `ssh_keys`; all 5 keys were legacy before this run), repository
  `git@github.com:suculent/thinx-autoflood.git`, default branch `main`:
  `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`.
- **D10_GATE pass**: the re-run has 0 legacy and 0 failed, and a migrated key cloned the private repository through the
  production fetch path. Plan 41-05 may push the legacy-path removal on this record.
- After the run: the task has 0 restarts. Its logs since 12:33Z have zero `probe failed` and zero
  `deploy key unavailable` lines. 7442, 1883 and 8883 are open from the laptop.
- Rollback while dual-read is deployed (D-07): untar the D-05 copy over `/mnt/gluster/thinx/ssh_keys` on micro. The tar
  stays until Plan 41-08 shreds it (D-06). It can be decrypted with the old passphrase, and DO snapshots of micro may
  capture it (accepted residual, 2026-10-09).
- Not pushed: `main` and no tag. This entry is a local docs commit.

### 2026-10-20 Plan 41-05 Task 1: removal deploy (D-08 step 1)

Run 15:18-15:37Z from the laptop. Live mutations: the `thinx-unit` push and the parent `thinx-staging` push. CI and
Swarmpit did the rest. No `docker stack deploy`, no `restart.sh`, no `docker service update` by hand, and
swarm-autopull-recovery was not needed. No key file was written. The passphrase secret and env are still on the
service; the deployed code no longer reads them (D-08: code first).

- D-10 record: `D10_GATE pass` (Plan 41-02 Task 3). Fresh re-check right before the push, 15:19Z, `--report --json` in
  the old task `j9n880hztl5pg4fnptefq6eh7`: private_files 77, transit_total 77 (`v1` 77), legacy_total 0, unknown 0,
  unreadable 0, stray_askfiles 0, leftover_tmp 0. No operator go was taken for this push (D-10).
- SHAs: parent `8fd573aa` (`8fd573aa395f8cb62ff0cd92fe9e7d577c7b97f9`, the 41-04 docs head). origin `thinx-staging` and
  `thinx-unit` were both `5d972067`, an ancestor; the pushed range (19 commits) differs from it only in the 41-03 and
  41-04 files plus `.planning/`. thinx-swarm unchanged at `8cfa7dd`.
- Pre-state 15:19Z: thinx_api task `j9n880hztl5pg4fnptefq6eh7` on micro, image digest `d021ae3ce2b55920`, spec UpdatedAt
  12:26:35Z, 0 restarts. Traefik http routers: 29, sorted `name status` sha256/16 `fa0afd608550e585`, none disabled.
  7442, 1883 and 8883 open from the laptop.
- Local regression (all exit 0; `--config=/dev/null --random=false`, `ENVIRONMENT=development` with placeholder CouchDB
  names):
  - Jasmine: PassphraseRetiredSpec 4/0, MigrateDeployKeysSpec 17/0 (1 pending = the dev-server case, run below),
    TransitSpec 39/0, KeyFormatSpec 30/0, GitSpec 73/0, SecretsSweepSpec 42/0, BuilderRemoteJobSpec 77/0,
    BuilderApiKeySpec 54/0, RedisHealthSpec 4/0.
  - 03-RsakeySpec with `^RSA Key \((?!13\))`: 17/0.
  - `node --test` DeployKeyNames + CiPipelineGates: 76/76.
  - `scripts/openbao-dev.sh run` TransitIntegrationSpec + MigrateDeployKeysSpec + TransitRotationSpec: 29 specs,
    0 failures, none pending, no key/ciphertext/token shape in the log, no `thinx-openbao-dev` container left.
  - thinx-swarm wiring gate (pre-retirement version): `--source thinx.yml <parent>/docker-swarm.yml` ->
    `API-WIRING-OK mode=source`; `--self-test` -> `SELF_TEST ok 17/17`, `API-WIRING-OK mode=self-test`.
- CircleCI:
  - `thinx-unit` `5d972067..8fd573aa` (fast-forward): `test` #16160, success 15:25:48Z, first run, no fix rounds.
  - `thinx-staging` `5d972067..8fd573aa` at 15:26:13Z: `test` #16163 15:29:44Z, `api-registry` #16164 15:32:05Z,
    `test-console-classic` #16165 and `console-classic-registry` #16166 success; `test-vue-console` #16161 still
    running at 15:33Z (no console source changed in this range).
- Rollout: new thinx_api task `b0el7hlnn988mpg3y3njk1qrh` on micro, container started 15:33:16Z with 0 restarts, image
  digest `f4492b4fb94134e5`, spec UpdatedAt 15:33:22Z, UpdateStatus completed (about 70 s after api-registry).
- Live checks (15:34-15:36Z), all pass:
  1. Transit log since 15:32Z: one `[transit] probe ok`, zero `probe failed`, zero `deploy key unavailable`, zero
     `[git] key ... skipped` lines.
  2. `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined` (D-13 is live,
     the legacy helpers are gone from the running image; RESEARCH Pitfall 10).
  3. `--report --json` in the new task: the same counts as the pre-push re-check (77/77 `v1`, legacy_total 0).
  4. D-10 keyed fetch through the Transit-only code, owner `test` (`cedc16bb…`), `git@github.com:suculent/thinx-autoflood.git`
     `main`: `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`.
  5. `tests/openbao-api-wiring.test.sh --live` (pre-retirement version) -> `API-WIRING-OK mode=live`: `SPEC_ATTACHMENTS ok`
     (the passphrase secret still attached, as expected before Plan 41-06), `SPEC_DELTA ok`, `TRANSIT_CANARY ok`,
     `FORBIDDEN_DENIED` 13/13, `OUTPUT_CLEAN ok`.
  6. `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> `OPENBAO-VERIFY-OK
     mode=full`; `openbao-verify.sh --api-service thinx_api` (installed pre-retirement version) -> `OPENBAO-VERIFY-OK
     mode=api` (`API_SECRET_MOUNTED ok` for BAO_ROLE_ID, BAO_SECRET_ID and the passphrase secret, `API_TASK_PROBE ok`,
     `API_PORT_7442 ok`); `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> `OPENBAO-REHEARSAL-MATRIX-OK
     generations=g1,g2`.
  7. Ports 7442, 1883 and 8883 open.
  8. Routers identical to the pre-state (29, `fa0afd608550e585`, none disabled); traefik_traefik and
     traefik_socket-proxy UpdatedAt still 2026-10-18 06:47:26Z.
- Rollback (not needed): `git revert` of the 41-03 and 41-04 commits on `thinx-staging`, pushed through `thinx-unit`,
  restores the dual-read code. Safe while the passphrase secret is still mounted, because every key is Transit
  ciphertext. From this deploy on, a legacy file restored from a backup is a logged skip (D-07, D-09).
- Not pushed: `main` and no tag. This entry is a local docs commit.
- Paused 15:37Z on the operator's instruction, after Task 1 and before Task 2 (no thinx-swarm or docker-swarm.yml
  change made). State at the pause: task `b0el7hlnn988mpg3y3njk1qrh` Running on micro, 0 restarts, zero
  `probe failed` / `deploy key unavailable` lines since 15:32Z; for `8fd573aa` every CircleCI context is success except
  `vue-console-registry`, which was still pending (no console source in this range).

### 2026-10-20 Plan 41-06 Task 1: passphrase retired from the live swarm

Run 18:17-18:24Z and 18:38-18:40Z from the laptop, under the operator's 41-05 Task 3 answer "go". Live mutations: thinx-swarm push to
origin and into micro (ff-merge), `openbao-install.sh`, the spec backup, one `docker service update` of `thinx_api`,
`docker secret rm`, and the `.env` line. No `docker stack deploy`, no `restart.sh`, no edge change. Every read printed
names, counts, modes, SHAs and verdicts only.

- Precondition: the first attempt (earlier on 2026-10-20) stopped before any action because micro's checkout had 6 untracked
  `*.yml.bak.20261007222957.pre-v3-labels` files (`git status --porcelain | wc -l` = 6, tracked changes 0). Operator
  answer: "operator moved them". Re-run 18:17:58Z: count 0, `Decision 41-05 Task 3: go` present once,
  `origin/master..HEAD` = exactly thinx.yml, tests/openbao-api-wiring.test.sh, scripts/openbao-verify.sh.
- Pre-state 18:18Z: task `b0el7hlnn988mpg3y3njk1qrh` on micro, image digest `f4492b4fb94134e5`, 13 secrets including the
  passphrase, 1 passphrase env key, PreviousSpec present; swarm secret listed. Routers 29, `fa0afd608550e585`, none
  disabled. 7442, 1883 and 8883 open.
- Repo-first: thinx-swarm `8cfa7dd..48581e9` pushed to origin 18:18:27Z; CircleCI `docker-build-error-page` and
  `docker-build-downtime-page` success 18:20:20Z; Swarmpit redeployed `downtime_downtime` 18:20:52Z and
  `errorpage_errorpage` 18:20:58Z. Pushed into micro as `p41-ff` (+ `refs/remotes/origin/master`), `merge --ff-only`,
  branch deleted, checkout clean. Laptop = origin = micro = `48581e99fda875dcf46ddddfd655701a9faf6475`.
- `openbao-install.sh`: `OPENBAO-INSTALL-OK mode=install`; only `/usr/local/sbin/openbao-verify.sh` COPY_UPDATED, every
  other file unchanged; `cmp` with the checkout copy equal.
- Spec backup `thinx-api-pre-passphrase-rm-20261020T182137Z.json`, 600 root, in the 700 root `rollback/api-service`
  (alongside one `pre-openbao` and one `pre-keygen` backup).
- Update 18:21:41-18:22:02Z (`--secret-rm GIT_KEY_PASSPHRASE --env-rm GIT_KEY_PASSPHRASE`, converged): new task
  `tkl1vzagwlv0j3dkumkn66eld` on micro, started 18:21:56Z, 0 restarts, same image `f4492b4fb94134e5`; `.Spec` 12 secrets,
  0 passphrase secret, 0 passphrase env key.
- Checks 18:22-18:23Z, all pass:
  1. One `[transit] probe ok`, zero `probe failed`, zero `deploy key unavailable` since 18:21:40Z.
  2. `--live` -> `API-WIRING-OK mode=live`: `SPEC_ATTACHMENTS ok` (no passphrase secret or env key), `PREVIOUS_SPEC info`
     (expected before the forced update), `SPEC_DELTA ok`, `TRANSIT_CANARY ok`, `FORBIDDEN_DENIED` 13/13, `OUTPUT_CLEAN ok`.
  3. `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> `OPENBAO-VERIFY-OK
     mode=full`; `--api-service thinx_api` -> `OPENBAO-VERIFY-OK mode=api` with `API_PASSPHRASE_ABSENT ok`,
     `API_SECRET_MOUNTED ok` for BAO_ROLE_ID and BAO_SECRET_ID, `API_PORT_7442 ok`.
  4. `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0` (owner `test`, thinx-autoflood `main`).
  5. 7442, 1883, 8883 open; routers 29, `fa0afd608550e585`, none disabled; traefik_traefik and traefik_socket-proxy
     UpdatedAt still 2026-10-18 06:47:26Z.
- `docker secret rm GIT_KEY_PASSPHRASE` 18:23:29Z, exit 0; `docker secret ls` count 0.
- `/mnt/gluster/thinx/.env` 18:23:39Z: `grep -c` 1 -> 0, `600 root:root` before and after.
- **Stopped at the sweep (plan: any non-zero count stops for the operator).** `find /mnt/gluster/thinx
  /mnt/gluster/deployment -maxdepth 2 -type f -name '.env*'` counts of lines starting with the variable name:
  `thinx/.env.bak.20260619154540.cors` **1**, `thinx/.env.bak.20260929142800` **1** (both 600 root:root);
  `thinx/.env`, `thinx/conf/.env`, `deployment/replica/.env`, `deployment/middleware/.env.local`,
  `deployment/ovpn-unused/.env` 0.
- State at the stop (18:24Z): `.Spec` clean, `.PreviousSpec` still carries the secret and the env entry (2 matches),
  ssh_keys `*.sh` 0 (read-only count; step 9 not run), step 10 (forced update) not run. No rollback: every check before
  the `secret rm` passed, and `--rollback` is no longer usable now that the secret is gone.
- Operator answer to the stop: "you deleted the .env.bak files, GIT_KEY_PASSPHRASE not present". The operator removed
  both `/mnt/gluster/thinx/.env.bak*` files themselves. Plan human-check (laptop `.env` and the CircleCI project env
  var of suculent/thinx-device-api): **not present (operator)** for both.
- Resumed 18:38:22Z. Sweep re-run: 5 `.env*` files remain (`thinx/.env`, `thinx/conf/.env`, `deployment/replica/.env`,
  `deployment/middleware/.env.local`, `deployment/ovpn-unused/.env`), every count 0; `thinx/.env` 0, `600 root:root`.
- Step 9 (D-08 step 3): ssh_keys `*.sh` count 0, nothing deleted.
- Step 10, forced update 18:38:27-18:38:47Z (converged): task `74bunku80wzuf5q63cfxuderj` on micro, started 18:38:41Z,
  0 restarts, image `f4492b4fb94134e5`; PreviousSpec present and clean.
- Checks 18:38-18:40Z, all pass:
  1. One `[transit] probe ok`, zero `probe failed` since 18:38:25Z.
  2. `--live` -> `API-WIRING-OK mode=live` with `WIRING PREVIOUS_SPEC ok` (no secret or env key in `.PreviousSpec`),
     `SPEC_ATTACHMENTS ok`, `SPEC_DELTA ok`, `TRANSIT_CANARY ok`, `FORBIDDEN_DENIED` 13/13, `OUTPUT_CLEAN ok`.
  3. Plan verify block on micro: `API_PASSPHRASE_ABSENT ok`, no swarm secret, `.env` count 0 at `600 root:root`,
     ssh_keys `*.sh` 0, `.Spec` + `.PreviousSpec` passphrase matches 0. `openbao-verify.sh --full` -> `OPENBAO-VERIFY-OK
     mode=full`.
  4. 7442, 1883, 8883 open; routers 29, `fa0afd608550e585`, none disabled.
  5. thinx-swarm laptop = origin = micro = `48581e9`, installed verifier equal to the checkout copy.
- Result (KEYMIG-02 live, ROADMAP criterion 2): no passphrase in the live Spec, PreviousSpec, the swarm secret store,
  the Gluster `.env*` files or ssh_keys. Its value survives only in the root-only 0600 spec backups in
  `rollback/api-service` on micro (`thinx-api-pre-openbao-*`, `thinx-api-pre-keygen-*`,
  `thinx-api-pre-passphrase-rm-20261020T182137Z.json`) until Plan 41-08. Task ids: before `b0el7hlnn988mpg3y3njk1qrh`,
  after the update `tkl1vzagwlv0j3dkumkn66eld`, after the forced update `74bunku80wzuf5q63cfxuderj`.

### 2026-10-20 Plan 41-06 Task 2: rotation preconditions

Run 18:40-18:41Z from the laptop, in task `74bunku80wzuf5q63cfxuderj` on micro (unchanged since Task 1). Live mutations: the
canary file and the pre-change snapshot. The canary was never displayed: it went from the container straight into the
host file, and checks printed its mode, line count, shape and version only.

- D-13 live, 18:40:13Z: `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined`.
- `--report --json`, 18:40:19Z: private_files 77, transit_total 77, version map `{"v1":77}`, legacy_total 0 (all four
  kinds 0), unknown 0, unreadable 0, stray_askfiles 0, leftover_tmp 0. **L0 = 1** (one version, so no older rotation
  exists for Plan 41-07 to cover).
- Canary, 18:40:27Z: `/root/thinx-backups/transit-canary-20261020T184027Z.ct` on micro, `600 root` in the `700 root`
  directory, 1 line, `vault:v` shape, version `v1`. Kept until Plan 41-08.
- Canary check, 18:40:37Z: `CANARY result=ok version=v1`.
- `openbao-backup.sh --pre-change`, 18:40:42-18:40:47Z: `OPENBAO-BACKUP-OK mode=pre-change
  stem=openbao-20261020T184042Z-pre-change` (raft_index 1038, 0600 local, replicated and re-hashed on core; 15 pairs
  kept on each node).
- Next: the operator's single rotate (Task 3, section 6 login). Expected afterwards: latest_version 2,
  min_decryption_version unchanged.

### 2026-10-20 Plan 41-06 Task 3: operator rotation of `thinx-deploy-keys` (D-11, D-12)

The operator rotated the key in their own terminal (section 6 login, `docker exec` into `vault_openbao` on micro). The
executor did not take part and saw no token or password.

- Operator resume signal, verbatim: `rotated latest_version=2 min_decryption_version=1`
- Before: latest_version 1 (= L0), min_decryption_version 1. One `bao write -f transit/keys/thinx-deploy-keys/rotate`.
  After: key versions 1 and 2, latest_version 2, min_decryption_version 1, min_encryption_version 0. Unchanged:
  exportable false, allow_plaintext_backup false, deletion_allowed false, auto_rotate_period 0s. No trim, no config
  write, AppRole policy not widened.
- Token: the token that did the rotate was revoked with `bao token revoke -self` ("Success!").
- **Login deviation.** The container filesystem is read-only, so `bao login` could not store `~/.vault-token` and
  printed the first operator token to the operator's own terminal. A second attempt, `export BAO_TOKEN=$(bao login
  -no-store ... -field=token)`, captured a corrupted value (TTY carriage return and/or prompt) and got 403. The
  working method was the silent `stty -echo` read plus `bao write -field=token auth/userpass/login/operator
  password=-`, now the section 6 recipe. Only the final token is confirmed revoked. Up to two earlier operator tokens
  may stay valid until their 4 h `explicit_max_ttl` expires (issued after 18:40:47Z and before 18:48Z, so gone by 22:48Z at the latest); the operator knows. No token value was
  recorded anywhere.
- AppRole confirmation, 18:48:33Z, task `74bunku80wzuf5q63cfxuderj` on micro (version and class lines only):
  - a fresh `--canary-capture` encrypts at `v2` (only `cut -d: -f2` of the output left micro);
  - the stored canary `transit-canary-20261020T184027Z.ct` (600 root): `CANARY result=ok version=v1`
    (min_decryption_version unchanged);
  - `--report`: private_files 77, transit `{"v1":77}`, legacy_total 0, unknown 0, unreadable 0. Every stored key is
    still at v1, below latest; the rewrap to v2 is Plan 41-07.
- Restore limitation 2 (section 9) now applies: `openbao-20261020T184042Z-pre-change` cannot decrypt v2 ciphertext.
  Plan 41-07 takes a fresh snapshot after the rewrap.

### 2026-10-20 Plan 41-07 Task 1: rewrap (D-12, D-14)

Run 18:51-18:53Z from the laptop, in task `74bunku80wzuf5q63cfxuderj` on micro (unchanged since 41-06 Task 1, 0
restarts, started 18:38:41Z). Live mutation: the rewrap of the 77 key files, through the thinx-api AppRole
(`transit/rewrap`, granted since Phase 39). Every output was counts, versions and verdict lines only; no ciphertext,
canary or key content left micro.

- L0 = 1, L1 = 2 (operator resume signal in 41-06: `rotated latest_version=2 min_decryption_version=1`).
- Pre-state `--report --json`, 18:51:48Z: private_files 77, transit_total 77, `{"v1":77}`, legacy_total 0, unknown 0,
  unreadable 0, leftover_tmp 0.
- `--rewrap --json`, 18:51:55-18:52:08Z, exit 0: latest `v2`, versions_before `{"v1":77}`, versions_after
  `{"v2":77}`, rewrapped 77, at_latest 0, failed 0, failures [], changed_during_run 0, writes 77, transit_requests 232
  (1 key read + 77 x rewrap, decrypt-old, decrypt-new), aborted null, legacy_total 0. No abort, so no
  `openbao-verify.sh --health` re-run was needed.
- Re-run `--rewrap --json`, 18:52:14-18:52:17Z, exit 0: latest `v2`, versions_before = versions_after `{"v2":77}`,
  rewrapped 0, at_latest 77, failed 0, changed_during_run 0, writes 0, transit_requests 1, aborted null. The plan's
  verify command ran it a third time (18:52:2xZ) with the same result (jq gate exit 0).
- Host check on micro, `ssh_keys`, 18:52:31Z: 77 private files, 77 whose first 9 bytes are exactly `vault:v2:`, 0 not
  mode 600, 77 `.pub`, 154 entries, 0 tmp leftovers.
- D-10/D-14 keyed fetch, owner `test` (`cedc16bb…`), `git@github.com:suculent/thinx-autoflood.git` branch `main`,
  18:52:48Z: `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0` (all five of that owner's
  keys are now v2 ciphertext).
- Canary, 18:52:55Z: `transit-canary-20261020T184027Z.ct` -> `CANARY result=ok version=v1` (min_decryption_version
  still 1).
- API task log since 18:51Z: 0 lines matching `probe failed`, `deploy key unavailable` or `retired_version`.
- **D14_GATE pass**: the re-run shows every file at v2 with 0 rewrapped and 0 failed, and a rewrapped key cloned a
  private repository through the production fetch path. The operator may raise min_decryption_version to 2 (Task 2).
- Restore window: until Task 3's `--post-change` snapshot, the newest snapshot that can decrypt the v2 files does not
  exist (`openbao-20261020T184042Z-pre-change` predates the rotation; section 9 limitation 2).
- Not pushed: `main` and no tag. This entry is a local docs commit.

### 2026-10-20 Plan 41-07 Task 2: operator raised min_decryption_version (D-14)

The operator raised the minimum in their own terminal (section 6 stdin-userpass login in `vault_openbao` on micro,
token prefix check, one config write, `bao token revoke -self`). The executor did not take part and saw no token or
password. The raise happened between 18:53Z (D14_GATE record) and 19:11Z.

- Operator resume signal, verbatim: `raised min_decryption_version=2 latest_version=2`
- Read back by the operator: min_decryption_version 2, latest_version 2. No trim, no other key setting changed, AppRole
  policy not widened.
- Minor deviation: the executor's suggested `bao read -field=display_name auth/token/lookup-self` check was dropped
  from the relayed steps, because lookup-self returned 403 for the operator token in 41-06. The token prefix check and
  the latest_version / min_decryption_version reads served as the token validation.

### 2026-10-20 Plan 41-07 Task 3: minimum raised, refusal proven (D-11, D-14)

Run 19:11-19:12Z from the laptop, in task `74bunku80wzuf5q63cfxuderj` on micro (0 restarts). Live mutation: the
post-change snapshot only. Output: verdict lines, versions and counts.

- L0 = 1, L1 = 2; operator read-back min_decryption_version 2 = latest_version 2.
- `openbao-backup.sh --post-change`, 19:11:07-19:11:13Z: `OPENBAO-BACKUP-OK mode=post-change
  stem=openbao-20261020T191108Z-post-change` (pruned 0, 16 pairs kept on each node). This is the first snapshot that
  can decrypt the v2 key files; the restore window noted in Task 1 is closed.
- Refusal proof, 19:11:21Z: the stored v1 canary `transit-canary-20261020T184027Z.ct` (junk, never a real key) ->
  `CANARY result=retired_version version=v1` (the D-13 class; stderr showed `[transit] decrypt failed:
  retired_version status=400`). ROADMAP criterion 3: OpenBao refuses the older version.
- Keyed fetch after the raise, owner `test` (`cedc16bb…`), `git@github.com:suculent/thinx-autoflood.git` `main`,
  19:11:3xZ: `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`.
- `--report --json`, 19:11:37Z: private_files 77, transit_total 77, `{"v2":77}`, legacy_total 0, unknown 0,
  unreadable 0, leftover_tmp 0.
- API task log since 18:53Z: 0 lines containing `retired_version` (no stored key of the API was refused), 0 `probe
  failed` / `deploy key unavailable`.
- Gates, 19:11:50-19:12:18Z, all exit 0:
  - `tests/openbao-api-wiring.test.sh --live` -> `API-WIRING-OK mode=live`: `TRANSIT_CANARY ok` (fresh v2 encrypt,
    decrypt, rewrap, decrypt-rewrapped 200), `FORBIDDEN_DENIED ok 13/13`, `SPEC_ATTACHMENTS ok`, `PREVIOUS_SPEC ok`,
    `SPEC_DELTA ok`, `OUTPUT_CLEAN ok`.
  - `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> `OPENBAO-VERIFY-OK
    mode=full` (`PRIVILEGED_CHECKS info`: not run without the operator password, as before).
  - `openbao-verify.sh --api-service thinx_api` -> `OPENBAO-VERIFY-OK mode=api`, `API_PASSPHRASE_ABSENT ok`.
  - `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> `OPENBAO-REHEARSAL-MATRIX-OK generations=g1,g2`.
  - Ports 7442, 1883 and 8883 open from the laptop.
- Section 12 (the repeatable rotation recipe, rollback, alerts) written from this run.
- Not pushed: `main` and no tag. This entry is a local docs commit.
- Human check (keyed build from the Vue console after the raise), operator reply verbatim: `build failed
  f9a73980-ccbc-11f1-8c6d-297b9876e71d `*** Do not know how to make File target `d1_mini' (/opt/workspace/d1_mini).
  Stop.` but git fetched correctly. 20/10/2026, 21:32:27 UTC+2` (= 19:32:27Z). Verdict: **passed** for the keyed
  fetch: the private repository was fetched with a v2 key. The make failure is after checkout and unrelated to the
  deploy key (a builder/platform target issue for that build, follow-up candidate, not KEYMIG).
- Logs since 19:30Z (counts only): thinx_api `deploy key unavailable` 0, `retired_version` 0, `[git] key ... skipped`
  0 (102 lines carry the build id); thinx_worker (task `4ss4vlnluqw67255gxbac09w9`, micro) `deploy key unavailable`
  0, `retired_version` 0.

### 2026-10-20 Plan 41-08 Task 1: Phase 41 final live gate

Run 19:45-20:01Z from the laptop. Live mutations: the `thinx-unit` push and the parent `thinx-staging` push. CI and
Swarmpit did the rest. No `docker stack deploy`, no `restart.sh`, no `docker service update` by hand, no edge change,
and swarm-autopull-recovery was not needed. Nothing was shredded, deleted or sanitized (Task 2 decides the scope).
Every read printed names, modes, sizes, counts, versions and verdicts only.

- Preconditions: 41-07-SUMMARY.md records `D14_GATE pass` and `CANARY result=retired_version`; origin `thinx-staging`
  and `thinx-unit` both `8fd573aa`, an ancestor of HEAD; the pushed range (12 commits) differs from it outside
  `.planning/` only in `docker-swarm.yml` and `spec/jasmine/PassphraseRetiredSpec.js`; `gh auth status` ok.
- SHAs: parent `8bc53a75` (`8bc53a751d0028971ae8cbde31a07fc5fc245bc3`, the 41-07 docs head). thinx-swarm laptop =
  origin = `48581e9` (micro unchanged since 41-06).
- Pre-state 19:47Z: thinx_api task `74bunku80wzuf5q63cfxuderj` on micro, image digest `f4492b4fb94134e5`, spec UpdatedAt
  18:38:47Z, UpdateStatus completed. Traefik http routers 29, sorted `name status` sha256/16 `fa0afd608550e585`, none
  disabled. 7442, 1883 and 8883 open from the laptop.
- Local regression (all exit 0; `--config=/dev/null --random=false`, `ENVIRONMENT=development` with placeholder CouchDB
  names):
  - Jasmine: PassphraseRetiredSpec 4/0 (now covering docker-swarm.yml), MigrateDeployKeysSpec 17/0 (1 pending = the
    dev-server case, run below), TransitSpec 39/0, KeyFormatSpec 30/0, GitSpec 73/0, SecretsSweepSpec 42/0,
    BuilderRemoteJobSpec 77/0, BuilderApiKeySpec 54/0, RedisHealthSpec 4/0.
  - 03-RsakeySpec with `^RSA Key \((?!13\))`: 17/0.
  - `node --test` DeployKeyNames + CiPipelineGates: 76/76.
  - `scripts/openbao-dev.sh run` TransitIntegrationSpec + MigrateDeployKeysSpec + TransitRotationSpec: 29 specs,
    0 failures, none pending, no key/ciphertext/token shape in the log, no `thinx-openbao-dev` container left.
  - thinx-swarm wiring gate (retired form): `--source thinx.yml <parent>/docker-swarm.yml` -> `PASSPHRASE_ABSENT ok`
    for both files, `BASELINE_UNCHANGED ok`, `FILES_MATCH ok`, `API-WIRING-OK mode=source`; `--self-test` ->
    `SELF_TEST ok 18/18 mutations refused`, `API-WIRING-OK mode=self-test`.
- CircleCI:
  - `thinx-unit` `8fd573aa..8bc53a75` (fast-forward, never forced) at 19:47:54Z: `test` #16167 success by 19:51:22Z,
    first run, no fix rounds.
  - `thinx-staging` `8fd573aa..8bc53a75` at 19:51:28Z: `test` #16170 success 19:54:56Z (the jasmine glob
    `jasmine/*[sS]pec.js` includes PassphraseRetiredSpec, which requires docker-swarm.yml to exist in the CI image
    and to carry no passphrase), `api-registry` #16171 success 19:57:14Z, `test-console-classic` #16172,
    `console-classic-registry` #16173, `test-vue-console` #16168 success; `vue-console-registry` #16169 still pending
    at 20:00Z (no console source in this range). The deployed SHA equals the thinx-unit-green SHA; its
    `docker-swarm.yml` names BAO_SECRET_ID and has 0 passphrase lines (plan verify 1 passes).
- Rollout: new thinx_api task `tj430niq4fnlvnchu3ljga2ml` on micro, container started 19:58:14Z, 0 restarts, image
  digest `64ff48ed8543b1a7`, spec UpdatedAt 19:58:20Z, UpdateStatus completed (about 60 s after api-registry). The roll
  replaced `.PreviousSpec` with the 41-06 spec (clean).
- Final live gate (19:58-20:01Z), all pass:
  1. API task log since 19:57Z: one `[transit] probe ok`, 0 `probe failed`, 0 `deploy key unavailable`, 0
     `retired_version`, 0 `[git] key ... skipped`.
  2. `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined` (19:58:44Z).
  3. `--report --json` (19:58:53Z): private_files 77, transit_total 77, `{"v2":77}` (every file at vL1 = 2),
     legacy_total 0 (all four kinds 0), unknown 0, unreadable 0, stray_askfiles 0, leftover_tmp 0. Plan verify 3 passes.
  4. `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0` (owner `test`, `cedc16bb…`,
     `git@github.com:suculent/thinx-autoflood.git` `main`, 19:59:09Z).
  5. Stored v1 canary `transit-canary-20261020T184027Z.ct` -> `CANARY result=retired_version version=v1` (19:59:16Z).
  6. `tests/openbao-api-wiring.test.sh --live` -> `API-WIRING-OK mode=live` (19:59:23Z): `SPEC_ATTACHMENTS ok` (no
     passphrase secret or env key), `WIRING PREVIOUS_SPEC ok`, `SPEC_DELTA ok` against
     `thinx-api-pre-openbao-20261018T193726Z.json`, `TRANSIT_CANARY ok`, `FORBIDDEN_DENIED ok 13/13`,
     `UNAUTHENTICATED_DENIED ok`, `OUTPUT_CLEAN ok`; 0 key/ciphertext/token shapes in the log.
  7. `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1` -> `OPENBAO-VERIFY-OK
     mode=full`; `--api-service thinx_api` -> `OPENBAO-VERIFY-OK mode=api` with `API_PASSPHRASE_ABSENT ok`,
     `API_SECRET_MOUNTED ok` for BAO_ROLE_ID and BAO_SECRET_ID only, `API_PORT_7442 ok`, `API_TASK_PROBE ok`;
     `openbao-restore-rehearsal.sh --verify-recorded-matrix` -> `OPENBAO-REHEARSAL-MATRIX-OK generations=g1,g2`.
  8. Absence (the 41-06 check): `docker secret ls` passphrase 0; `/mnt/gluster/thinx/.env` passphrase lines 0, `600
     root:root`; ssh_keys `*.sh` 0; `.Spec` + `.PreviousSpec` passphrase matches 0 (PreviousSpec present); 12 api
     secrets.
  9. Ports 7442, 1883 and 8883 open; routers 29, `fa0afd608550e585`, none disabled, list byte-identical to the
     pre-state; traefik_traefik and traefik_socket-proxy UpdatedAt still 2026-10-18 06:47:26Z.
- Inventory for the Task 2 decision (names, modes, sizes, mtimes, counts; no content read out):
  - `shred` present on both nodes (`/usr/bin/shred`).
  - micro `/root/thinx-backups` (`700 root:root`), 3 files, all `600 root:root`:
    - `deploy-keys-premig-20261020T123359Z.tar` 440320 B, 12:33:59Z (D-05, legacy key material);
    - `deploy-keys-premig-20261020T123359Z.tar.sha256` 126 B, 12:33:59Z;
    - `transit-canary-20261020T184027Z.ct` 90 B, 18:40:27Z (junk v1 ciphertext, now refused).
  - micro `grep -rlI 'GIT_KEY_PASSPHRASE='` under `/var/lib/openbao-maintenance` (`700 root:root`), 5 files, all
    `600 root:root` in `700 root:root` directories, each with 2 `NAME=<literal>` occurrences (Spec and PreviousSpec
    env), none a variable reference:
    - `rollback/api-service/thinx-api-pre-openbao-20261018T193726Z.json` 29058 B, 2026-10-18 19:37:26Z, **the --live
      gate baseline** (the only, so newest, `pre-openbao` backup; SPEC_DELTA reads it);
    - `rollback/api-service/thinx-api-pre-keygen-20261019T133316Z.json` 32440 B, 2026-10-19 13:33:16Z (Phase 40 UAT 5);
    - `rollback/api-service/thinx-api-pre-passphrase-rm-20261020T182137Z.json` 32549 B, 2026-10-20 18:21:37Z (41-06);
    - `rollback/api-trust/thinx_api-20261018T194057Z-1765792.json` 30819 B, 2026-10-18 19:40:57Z (trust consumer,
      openbao-cert-renew.sh);
    - `rollback/api-trust/thinx_api-20261018T194128Z-1765792.json` 32439 B, 2026-10-18 19:41:28Z (trust consumer).
    `log/openbao-verify.log` names the variable (verdict lines) with 0 `NAME=` lines: not a copy.
  - core: `/var/lib/openbao-maintenance` (`700 root:root`) has 0 files with the name; no rollback directory.
  - **Outside the plan's inventory scope (informational, read-only `grep -lI` over `/root` depth <= 4, files < 5 MB,
    excluding `/root/thinx-backups`)** on micro:
    - `/root/thinx-swarm-backup-untracked/.env.bak.20260619154540.cors` 1868 B `600 root:root`, 1 literal value line;
    - `/root/thinx-swarm-backup-untracked/.env.bak.20260929142800` 1759 B `600 root:root`, 1 literal value line;
    - `/root/thinx-swarm-backup-untracked/thinx.yml.bak.20261007222957.pre-v3-labels` and
      `/root/thinx.yml.bak-20260925`: 1 line each, a `${...}` variable reference, no value.
    The two `.env.bak*` files carry the same basenames as the two Gluster `.env.bak*` files that 41-06 recorded as
    deleted by the operator; the directory (`755 root:root`, 8 entries) also holds the six moved `pre-v3-labels`
    files. Neither Task 2 option covers them; their handling needs the operator's explicit direction.
- Not pushed: `main` and no tag. This entry is a local docs commit.
