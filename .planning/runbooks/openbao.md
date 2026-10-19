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

Nothing else of the API changes in Phase 39: no client module, no `rsakey.js`/`git.js` change, `GIT_KEY_PASSPHRASE`
stays mounted and set (its removal is Phase 41). `readSecret()` caches per process, so a new secret value reaches the
API only through a deliberate task restart.

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

## 11. The API Transit client (Phase 40)

Phase 40 makes `thinx_api` the client of the section 10 wiring. Code: `lib/thinx/transit.js` (client),
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
- **Legacy keys** (PEM, encrypted PKCS#8 or older unencrypted keys) keep the askpass path with `GIT_KEY_PASSPHRASE`
  until Phase 41 migrates them. Files that are neither are skipped with a cause (`unknown_key_format`,
  `not_regular`, `too_large`, `read_error`).
- **D-01.** A Transit key that cannot be decrypted is skipped, and the owner's next key is tried, legacy keys
  included. An owner with a working legacy key still builds during an OpenBao outage.
- **AppRole.** Login is through `BAO_ROLE_ID` / `BAO_SECRET_ID` (`readSecret()`, file first). Tokens are never
  renewed: the client logs in again before the 1 h cap. TLS trusts only `BAO_CACERT`, and every request has a 3 s
  timeout.
- **D-02 retry.** `unreachable`, `sealed`, `denied` and `server_error` get one retry after a fresh login. A login
  refused as `denied` is not retried, because the same credentials would be refused again.

**Reason classes.** Every failure is reported as one of seven classes; no address, body or token is logged.

| Class | Meaning | First check |
|---|---|---|
| `not_configured` | `BAO_ADDR` missing or not https, `BAO_CACERT` unreadable or empty, or an AppRole value empty; no request was made | `docker service inspect thinx_api`: env `BAO_ADDR`/`BAO_CACERT`, secrets `BAO_ROLE_ID`/`BAO_SECRET_ID`, config at `/run/openbao/ca.pem` (section 10); `openbao-verify.sh --full --maintenance --api-service thinx_api` |
| `unreachable` | refused, DNS, reset or the 3 s timeout: no HTTP answer | `openbao-verify.sh --health`; `docker service ps vault_openbao`; the `openbao-internal` attachment (section 10); service restarts follow section 4 (stop-first, never delete Raft or a seal key) |
| `tls` | the server certificate does not verify against `BAO_CACERT` | the trust consumer: `openbao-cert-renew.sh --verify-api-trust-consumer --api-service thinx_api` and the CA config swap rules (section 10) |
| `sealed` | HTTP 503 from OpenBao | `openbao-verify.sh --health`; the static seal file of the current generation (section 1); restart rules in section 4 |
| `denied` | HTTP 403, or 400 on the AppRole login | the AppRole secrets `BAO_ROLE_ID`/`BAO_SECRET_ID` and the `thinx-api` policy (`openbao-verify.sh --full --maintenance --api-service thinx_api`); `readSecret()` caches per process, so a new secret value needs a task restart |
| `bad_ciphertext` | HTTP 400 on decrypt: one stored key file is damaged or not ours | that key only; other keys and other owners are unaffected, no incident is opened and no Slack text is posted. The owner creates a new deploy key |
| `server_error` | any other status, or a body over 64 KiB | `openbao-verify.sh --full`; the OpenBao audit log on micro (HMAC-redacted) |

**Log lines.** Placement floats: find the node first, then read the task's logs with `docker logs` (never
`docker service logs`, which hangs on micro).

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service ps thinx_api --filter desired-state=running --format '{{.Node}}'"
# on that node (micro as above; core is root@188.166.203.163 with the same key and port):
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=thinx_api | head -1); timeout 30 docker logs --since 30m \$C 2>&1 | grep -E '\[transit\]|\[git\] key|\[rsakey\]|deploy-key generation refused'"
```

| Line | Written when |
|---|---|
| `[transit] <op> failed: <reason> status=<n>` | an OpenBao request failed; `<op>` is `login`, `encrypt`, `decrypt` or `probe`, and `status=0` means no HTTP answer |
| `[transit] probe ok` | the boot probe logged in |
| `[git] key <name> skipped: deploy key unavailable: <reason>` | a Transit key could not be decrypted during a fetch (D-01) |
| `[git] key <name> skipped: <cause>` | a key file was skipped for its format or the agent failed (`agent_start_failed`, `agent_load_failed`) |
| `[rsakey] create failed: <code>` | a create was refused (`key_service_unavailable`) or failed |
| `deploy-key generation refused: key service unavailable (<reason>)` | Transit refused a new key |
| `deploy-key generation refused: THINX_DEPLOY_KEYGEN is not enabled` | the kill switch refused a new key (the value is never logged) |

**Slack (D-05).** One text when the first failure opens an incident, one when the next success closes it, to the
API's `SLACK_WEBHOOK` (nothing is posted without one):

- `THiNX OpenBao: API Transit FAILING on <host> since <ts>: <REASON>. One alert per incident; recovery will be announced.`
- `THiNX OpenBao: API Transit RECOVERED on <host>; failing since <ts> (<REASON>).`

The incident is held per process: a task restart during an outage alerts once more. `bad_ciphertext` never opens an
incident. No repeats are posted in between.

**Boot probe.** About 5 s after the task starts the API makes one AppRole login and logs `[transit] probe ok`. A
failure logs `[transit] probe failed: <reason> status=<n>` and opens an incident; it never stops the API (7442, MQTT
and public builds do not need OpenBao). After any `thinx_api` update, check for the probe line first.

**Build latency during an OpenBao outage.** One Transit key costs at most four OpenBao requests of 3 s, so 12 s,
before D-01 skips it. A keyed fetch spends at most 12 s per Transit key of the owner on OpenBao, under that build
directory's checkout lock, before it reaches the legacy keys. Refused connections, 503 and 403 answer at once; only a
hung or black-holed OpenBao approaches the bound. An owner with several Transit keys waits that long for each of them.
The kill switch does not shorten this: it stops new keys only, and builds keep trying every key.

**What users see.**

- A keyed build where no key worked fails with the existing failure status. When the reason was a Transit key, the
  build log carries one line `deploy key unavailable: <sentence>` (D-04), the sentence being one of:
  `key service unreachable`, `key service sealed`, `key service refused the request`,
  `key service certificate not trusted`, `key service not configured`, `stored key could not be decrypted`,
  `key service error`.
- A refused create (Transit down or the kill switch) answers HTTP 503
  `{success: false, response: "key_service_unavailable"}` on `PUT /api/v2/rsakey`, `GET /api/user/rsakey/create`
  and the GitHub-link flow (D-03). Both consoles show: Deploy keys can't be created right now, try again later.

**Kill switch (D-07).** `THINX_DEPLOY_KEYGEN`: unset, empty or exactly `enabled` generates; any other value
(`disabled`) refuses every new deploy key with `key_service_unavailable`, before any name check or Transit call.
Builds, existing keys, listing and revoking are unaffected. `thinx.yml` and `docker-swarm.yml` carry
`THINX_DEPLOY_KEYGEN=enabled`; the live spec has no entry until a later stack deploy, and unset means enabled. The
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

1. The kill switch first. It stops new Transit keys at once, and existing keys of both kinds keep building.
2. A full revert: `git revert` the Phase 40 commits on `thinx-staging` (with their console gitlink commits) and
   push. CircleCI builds the image and Swarmpit rolls it out; nothing is changed by hand on the swarm.
   - The `docker-swarm.yml` switch line can stay: the old code ignores the variable, and keeping it keeps
     `--source` green.
   - The cost: keys minted after the cut-over are `vault:vN:` files, which the old code cannot use. Leave them in
     place, because they work again after the roll-forward. Their owners build with their legacy keys meanwhile, or
     fail until then. Legacy keys are unaffected (D-06).

**Not here.** Migrating legacy keys to Transit, removing `GIT_KEY_PASSPHRASE`, and Transit key rotation or rewrap
are Phase 41.

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
