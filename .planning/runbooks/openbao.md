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
probe before the receiver existed banned micro's private address for an hour (see the evidence log). Routine
backups authenticate successfully and do not count. Before re-running prereqs mode or the live preflight more than
twice in ten minutes, check `ssh core 'fail2ban-client status sshd'`. A ban on micro's private address blocks
replication (backups then fail and alert) until it expires.

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
bao login -method=userpass username=operator     # password prompt is hidden; token lives 4 h at most
# ... work ...
bao token revoke -self; rm -f ~/.vault-token; exit
```

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

   Store the new operator password in the password manager, then prove a fresh `bao login -method=userpass
   username=operator` (section 6).
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
  rollout waited for the ban to expire (15:17:33Z). Recommendation for the operator: decide whether to add micro's
  private address to core's fail2ban `ignoreip`. The `[DEFAULT]` list already trusts both nodes' public addresses,
  but the `sshd` jail overrides it.
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
