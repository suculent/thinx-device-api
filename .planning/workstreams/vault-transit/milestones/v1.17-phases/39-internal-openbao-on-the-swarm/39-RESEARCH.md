# Phase 39: Internal OpenBao on the Swarm - Research

**Researched:** 2026-10-12
**Domain:** OpenBao 2.7.1, Docker Swarm, recovery custody and unattended operations
**Confidence:** MEDIUM — official documentation checked; production deployment and behavioral rehearsals remain execution work.

<user_constraints>
## User Constraints (from CONTEXT.md)

The following decision and discretion text is copied verbatim from the phase context. [VERIFIED: .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-CONTEXT.md:16-59]

<!-- DATA_8a4e19c7_START -->
### Carried-forward requirements
- **D-01:** Use OpenBao, not HashiCorp Vault, with an exact image tag. Research must verify the selected release and static-seal support; the historical version mentioned in the roadmap is not a fresh verification.
- **D-02:** One replica on a specifically pinned manager node, dedicated internal overlay shared with `thinx_api`, no published ports or public Traefik route. Storage, configuration, audit data and the runtime seal key remain outside GlusterFS. Confirm live node roles before choosing the hostname.
- **D-03:** Keep automatic unseal through the node-local static seal key, TLS verified by the API, and the non-exportable `thinx-deploy-keys` Transit key. The application AppRole remains limited to encrypt/decrypt/rewrap; operator privileges below do not expand application privileges.
- **D-04:** Operator access remains SSH plus `docker exec`. Revoke the bootstrap root token; do not retain a root token as a routine credential. Exercise seal-key rotation and snapshot restore as required by the roadmap.
- **D-05:** Phase 34 D-20 was dropped and moved to v1.17, as recorded in the archived v1.15 roadmap. Replace the dormant `vault.yml` configuration as part of this phase; there is no outstanding requirement to preserve its Vault pin or public routers.

### Key custody and recovery
- **D-06:** Keep the offline seal-key backup and recovery keys in an encrypted archive on the operator's laptop, outside synced folders and repositories.
- **D-07:** Store the archive password in the operator's password manager as the primary copy, and also in macOS Keychain for convenience. This decision concerns the archive password, not plaintext copies of its contents.
- **D-08:** The user is the sole recovery operator. Do not introduce another custodian or require multiple people to cooperate.
- **D-09:** Provide guided local setup that automates archive packaging and verification. The user enters the archive password locally, outside chat. The runbook must describe recovery from this archive without exposing secret values in documentation, logs or command history.

### Operator access
- **D-10:** Configure a dedicated operator login; reserve recovery keys for emergencies.
- **D-11:** Operator sessions last four hours before a fresh login is required. Research must translate this into an effective maximum token lifetime, not merely an initial TTL that renews indefinitely.
- **D-12:** Give the operator full operational administration, including snapshots, health checks, Transit key rotation/rewrap, restores, policy changes and authentication management. Implement this with an operator policy; the bootstrap root token is still revoked. Do not weaken the non-exportable Transit-key requirements.
- **D-13:** Use username/password authentication. Keep a dedicated operator password in the password manager; do not reuse the recovery-archive password by implication. Login remains on the SSH/exec management path.

### Backup routine
- **D-14:** Take Raft snapshots daily, and before and after key/configuration changes.
- **D-15:** Automatically copy snapshots to a dedicated, root-only directory on the other swarm node's local disk, separate from GlusterFS and Gluster backups. Retain a local copy on the OpenBao node as well. Snapshot replication does not imply replicating the runtime seal key to the second node.
- **D-16:** Retain snapshots for 90 days on both nodes.
- **D-17:** Perform the required initial restore rehearsal into a throwaway OpenBao instance, then repeat before upgrades. No monthly or quarterly rehearsal schedule was selected.

### Rollout and maintenance
- **D-18:** Deploy during normal operation, allowing a brief API restart when attaching OpenBao's network, CA and credentials. Verify immediately and roll back on regression; no scheduled maintenance window is required by this discussion.
- **D-19:** Automate internal TLS certificate renewal and deployment, verify the replacement certificate, and report failures.
- **D-20:** Report backup and certificate-maintenance failures to the existing THiNX operations Slack channel. Reuse the established notification destination; do not invent a new channel or put webhook credentials in planning artifacts.
- **D-21:** Send one alert when a failure begins and one when it recovers. Suppress duplicate alerts while the same failure persists. A repeated failed run is not a new incident by itself.
- **D-22:** Preserve production rules: repo-first changes in `thinx-swarm`; deploy OpenBao as its own stack; change `thinx_api` through `docker service update` with a root-only spec backup. Do not redeploy the thinx or Traefik stacks. Preserve plaintext device port 7442 and plain MQTT.

### Research and planning choices still open
These are implementation details, not additional user decisions or permission to change the scope:
- Confirm the live manager set and pick the pinned hostname and node-local paths. Resolve seal-key injection while preserving the node-local custody requirement; do not silently spread the seal key into both managers' secret stores.
- Choose archive format, encryption tooling, local password-entry mechanics, verification and Keychain integration compatible with the selected custody arrangement.
- Determine recovery-share count/threshold for a sole operator, operator policy endpoints, four-hour session enforcement and emergency access on the selected OpenBao release.
- Design separate automation credentials for snapshots/renewal; unattended jobs must not depend on the operator's interactive four-hour session or a persistent root token.
- Choose snapshot scheduler, cross-node transfer, retention and integrity checks. Research consistency between Raft snapshots, seal-key generations and ciphertext after rotation/rewrap; document the restore limitations.
- Choose CA custody and renewal mechanism without a circular dependency that prevents renewing or recovering OpenBao's own listener. Determine safe reload/restart behavior and rollback checks.
- Locate the existing operations Slack integration and implement durable failure/recovery deduplication. Verify alert behavior during execution, with no secrets printed.
- Preserve the established automated deployment evidence and final human verification pattern; keep actual secret-custody steps explicit in the execution plan.
<!-- DATA_8a4e19c7_END -->

### Deferred Ideas (OUT OF SCOPE)

<!-- DATA_901cd23e_START -->
No new capabilities were added outside the phase. Existing deferrals remain: API encryption in Phase 40; legacy migration and Transit rotation/rewrap in Phase 41; cloud-KMS unseal, Raft HA and PwnDoc retest are future requirements. Generic todo keyword matches were unrelated to this deployment and were not folded into the scope.
<!-- DATA_901cd23e_END -->
</user_constraints>

<phase_requirements>
## Phase Requirements

Descriptions below are verbatim requirements. [VERIFIED: .planning/workstreams/vault-transit/REQUIREMENTS.md:21-28]

<!-- DATA_b3f50a17_START -->
| ID | Description | Research Support |
|----|-------------|------------------|
| VAULT-01 | OpenBao runs on the swarm as `openbao/openbao:<x.y.z>` pinned by exact tag, never a digest (2.7.1 at planning time; ≥ 2.4.0 required for the static seal), one replica constrained to a manager node, attached only to a dedicated internal overlay shared with `thinx_api`; no Traefik routers and no published ports. | Tag/placement/network isolation and rollout gates |
| VAULT-02 | OpenBao storage (integrated Raft) lives on a node-local volume, not GlusterFS; Raft snapshots are written to a location separate from `ssh_keys` and from Gluster backups. | Local Raft and snapshot automation |
| VAULT-03 | The OpenBao listener serves TLS from an internal CA and the API verifies it (`BAO_CACERT`); the dormant `vault.conf` (`tls_disable`) is replaced by an OpenBao HCL config without `tls_disable`. | Independent CA, verified client and renewal transaction |
| VAULT-04 | OpenBao unseals automatically after a restart or reschedule through `seal "static"` reading a root-only 32-byte key file on the manager node's local disk (not GlusterFS); recovery keys and an offline, off-swarm copy of the seal key are documented, as is seal-key rotation via `previous_key`/`previous_key_id`. | Static key, image UID, archive and generation restore matrix |
| VAULT-05 | Transit key `thinx-deploy-keys` exists as aes256-gcm96, `exportable=false`, `allow_plaintext_backup=false`, `deletion_allowed=false`. | Transit settings and operator guardrails |
| VAULT-06 | AppRole `thinx-api` holds a policy limited to `encrypt`, `decrypt` and `rewrap` on `thinx-deploy-keys`; its role_id/secret_id reach the API as swarm secrets read through `readSecret`; no root token persists after bootstrap. | Three-path AppRole, secret mounts and root revocation |
| VAULT-07 | A file audit device is enabled, writing to node-local storage. | Declarative audit and log lifecycle |
| VAULT-08 | Operators reach OpenBao only via ssh + `docker exec`; a runbook covers bootstrap, static-seal key handling and rotation, recovery keys, Raft snapshot and restore. | Operator sessions, emergency root procedure and rehearsals |
<!-- DATA_b3f50a17_END -->
</phase_requirements>

## Summary

Use **openbao/openbao:2.7.1**, released 2026-10-01. The official release and successful public Docker manifest lookup confirm the version and Linux amd64 image. Static seal remains built in. Pin the single service to **micro**; copy snapshots to **core** using host jobs. Research made no production changes and did not pull or run the image. [CITED: https://github.com/openbao/openbao/releases/tag/v2.7.1] [CITED: https://openbao.org/docs/configuration/seal/static/] [VERIFIED: session docker manifest inspect openbao/openbao:2.7.1]

Host jobs should call OpenBao through docker exec, using the host network for SSH transfers and Slack. This avoids adding external connectivity to OpenBao's dedicated internal overlay. Runtime config, seal, Raft, audit and automation state belong on local filesystems outside Gluster. An internal overlay still permits privileged host/manager access: the requirement cannot provide isolation against manager root. [CITED: https://docs.docker.com/reference/cli/docker/network/create/]

**Primary recommendation:** implement and rehearse the exact image/config first, complete local human custody setup, bootstrap and revoke root, prove maintenance/recovery, then attach API network/CA/credentials through one targeted update. Phase 40 application behavior and Phase 41 migration remain excluded.

## Architectural Responsibility Map

Recommended division implementing D-01–22:

| Capability | Primary tier | Secondary tier | Responsibility |
|---|---|---|---|
| Transit, auth and authorization | OpenBao | API client | Three permitted application operations |
| Verified TLS | API client | OpenBao listener | Explicit private CA and hostname validation |
| Raft and static seal | micro local storage | OpenBao | Single pinned stateful service |
| Operator access | SSH / docker exec | userpass | Four-hour sessions; no routine root |
| Snapshot, transfer, retention, alerts | Host scheduler | core local storage / Slack | Independent credentials and host egress |
| TLS issuer and renewal | Host OpenSSL jobs | OpenBao listener / API trust config | Avoid self-hosted issuer dependency |
| Recovery custody | Operator laptop | Password manager / local Keychain | Encrypted archive, sole operator |

## Project Constraints (from AGENTS.md)

Actionable phase constraints: preserve plaintext “7442” and plain MQTT; no thinx/Traefik stack redeploy or restart.sh; edge unchanged; operator management is SSH/exec only. Keep service-spec backups root-only, outside Git; never print credentials, environment dumps or secret-bearing labels. Use bounded container logs. Push authorized source changes requiring CI. Retain the existing socket-proxy, security-header and secret-free logging rules. [VERIFIED: AGENTS.md:3-29,31-89]

Other repository directives remain binding if touched: “npm run build:test” for console verification; “chai-http” stays “^4.3.0”; no esp-open-sdk image beyond Ubuntu 22.04; preserve mos fork/SHA and compatible build toolchain, local SDK mode and no Docker socket; retain Arduino rebuild pins, nodemcu newlib preseeding and HTTPS builder CI checkout. These components are outside this phase. [VERIFIED: AGENTS.md:91-285]

The historical Phase 34 pin is superseded: archived roadmap says “D-20 vault.yml re-pin dropped, moved to v1.17”. [VERIFIED: .planning/milestones/v1.15-ROADMAP.md:135-139]

Nyquist is explicitly “"nyquist_validation": false”; omit its optional architecture section, but retain deployment verification. Agent skills mapping is “"agent_skills": {}”; graphify returned disabled; no project skill directories or sibling AGENTS.md were found in the checked locations. [VERIFIED: .planning/config.json:15-31,39-45] [VERIFIED: session filesystem and graphify probes]

## Standard Stack

| Component | Selection | Provenance |
|---|---|---|
| OpenBao server/CLI | 2.7.1, release 2026-10-01 | Official release plus public manifest; no runtime test yet |
| Docker Swarm | Existing micro Engine 29.8.1 | Read-only version probe |
| OpenSSL | Existing micro 3.0.13; laptop 3.6.3 | Version probes; dedicated private CA |
| Host scheduler/tools | cron, flock, SSH, rsync, curl, jq | Present on micro by command -v |
| Laptop encrypted archive | Native hdiutil AES-256 disk image | Native help and Apple documentation |
| Password-only convenience copy | Native security / local Keychain | Help confirms interactive password prompt |

[VERIFIED: session tool/version probes] [CITED: https://support.apple.com/guide/disk-utility/create-a-disk-image-dskutl11888/mac] [CITED: https://docs.openssl.org/3.0/man1/openssl-ca/]

No npm/PyPI/crates installation is proposed; package legitimacy registry gates are not applicable. The container publisher is tied to official OpenBao packaging documentation and exact release/registry evidence. Use tag-only stack deployment with **--resolve-image never**; ordinary Docker stack deployment resolves tags to digests. Do not enable automatic redeploy for the stateful service. [CITED: https://openbao.org/community/contributing/packaging/] [CITED: https://docs.docker.com/reference/cli/docker/stack/deploy/]

## Runtime State Inventory

Read-only SSH succeeded after sandbox escalation. No environment, secret contents or service-label values were read. [VERIFIED: 2026-10-12 SSH inventory]

<!-- DATA_d92e83a1_START -->
| Category | Evidence | Action |
|---|---|---|
| Stored data | Legacy /mnt/glusterfs/vault/data and /mnt/gluster/vault/data contain sys, logical and core directories | Leave untouched; fresh local Raft, no silent migration/deletion |
| Live config | core Ready Active Leader; micro Ready Active Reachable; both managers/x86_64; no Vault/OpenBao service | Pin micro; other-node backup on core |
| Networks/API | thinx_api 1/1, no placement constraints; thinx_internal and traefik-public both Internal=false | New dedicated internal overlay; account for API moving nodes |
| OS registrations | cron and systemd 255 present; complete cron inventory not inspected | Check intended job names before installation |
| Secrets/env | SLACK_WEBHOOK and SLACK_BOT_TOKEN secret names mounted on API; no values inspected | Reuse destination securely; independent host credential |
| Build artifacts | Public 2.7.1 manifest includes amd64; installed image not audited | Pull/test exact image during execution |
<!-- DATA_d92e83a1_END -->

Additional live metadata: core manager address 10.133.0.4:2377; micro 10.133.0.2:2377; core resolves from micro. Proposed /etc/openbao, /var/lib/openbao and /var/backups/openbao were absent. micro /mnt/data reported mode 666 root: avoid it for new custody state. Default /root/.ssh/id_ed25519 was absent; dedicated transfer access remains a preflight. [VERIFIED: session SSH projected node inspect, getent, stat and test probes]

## Architecture Patterns

### Proposed artifacts and local layout

All names in this subsection are **proposed implementation artifacts**, not claims that files already exist.

| Artifact | Responsibility |
|---|---|
| sibling thinx-swarm/vault.yml | Replace dormant stack; stack vault, service openbao, one replica pinned micro/manager; stop-first; no ports/router |
| sibling thinx-swarm/vault.conf | Replace with HCL: Raft, TLS, static seal and declarative file audit |
| sibling openbao/policies/{operator,thinx-api,backup}.hcl | Separate policies |
| sibling openbao/openssl.cnf | Fixed CA/leaf profiles |
| sibling scripts/openbao-{preflight,bootstrap,verify,backup,cert-renew,restore-rehearsal}.sh | Bounded operational scripts |
| sibling scripts/openbao-recovery-archive.sh | Guided macOS local custody |
| sibling openbao/*.cron and logrotate.conf | Schedules and audit lifecycle |
| sibling thinx.yml and parent docker-swarm.yml | External overlay, public CA config, AppRole secrets |
| parent .planning/runbooks/openbao.md | Full operator recovery/deployment procedures |

Use local root-owned /etc/openbao for rendered config/issuer credentials; /var/lib/openbao/{raft,seal}; /var/log/openbao; /var/backups/openbao on both nodes; /var/lib/openbao-maintenance for durable job state; /run/openbao-maintenance for ephemeral tokens. Installer must create restrictive parents and verify realpath/findmnt ownership/type. Copy runtime config and reviewed jobs from the fast-forwarded checkout to local disk; do not bind them from the Gluster checkout.

Existing dormant source contains “image: vault:1.5.5”, public routers, “tls_disable”: 1 and a file backend. Replace rather than incrementally reuse it. [VERIFIED: sibling thinx-swarm/vault.yml:18-51; sibling thinx-swarm/vault.conf:1-8]

### Static seal, permissions and archive

Use raw 32-byte generation-named files, current_key_id/current_key, with previous_key_id/previous_key during rotation. Keep historical generations offline for retained snapshots. Swarm secrets replicate across managers and therefore violate runtime seal-key custody. [CITED: https://openbao.org/docs/configuration/seal/static/] [CITED: https://docs.docker.com/engine/swarm/secrets/]

Image defaults to user openbao; entrypoint drops root unless BAO_SKIP_DROP_ROOT is set. To preserve the locked root-only key, recommend explicit user 0:0, BAO_SKIP_DROP_ROOT=1 and SKIP_CHOWN=1; read-only seal/config mounts; no Docker socket, privileged mode or broad host binds; read-only rootfs plus required tmpfs. Test exact restrictions before deployment. This deliberate root-container tradeoff does not protect against manager compromise. Explicitly override default dev-mode CMD. [CITED: https://raw.githubusercontent.com/openbao/openbao/v2.7.1/Dockerfile] [CITED: https://raw.githubusercontent.com/openbao/openbao/v2.7.1/.release/docker/docker-entrypoint.sh]

Recommend one recovery share/threshold one for the sole operator. Create an AES-256 encrypted DMG locally first, stream seal generations/recovery share/CA recovery material directly into the mounted encrypted volume, detach, reopen read-only and compare manifest checksums/byte counts. No plaintext staging directory or whole init JSON archive. Human enters passwords locally, confirms password-manager storage and verifies recovery without Keychain. Store archive password only in local Keychain; security help supports prompting with -w as the final option and warns against argv passwords. Never use -A. [CITED: https://openbao.org/docs/commands/operator/init/] [VERIFIED: native hdiutil/security help]

### Bootstrap, application and operator credentials

Bootstrap transiently: initialize, configure Transit/auth, provision operator and automation, verify archive, login independently, revoke bootstrap root, prove its rejection, and take a post-revocation snapshot. Keep init JSON/token only in protected memory/tmpfs; no token helper, shell tracing, logs, service environment, history or root token in recovery archive. Actual userpass/AppRole logins create independent tokens; child tokens minted from bootstrap can be revoked with their parent. [CITED: https://openbao.org/docs/concepts/tokens/]

Userpass must set token_ttl=4h, token_max_ttl=4h, token_explicit_max_ttl=4h and token_period=0. The explicit maximum is a hard renewal cap; test a shortened equivalent plus production metadata. [CITED: https://openbao.org/docs/api/auth/userpass/]

Operator policy grants operational snapshots/restores, Transit rotation/rewrap and policy/auth management. Add explicit guards against raw storage, key export/backup/BYOK export, deletion/soft-delete/trim and dangerous key config flags. **Trust limitation:** a policy/auth administrator can rewrite those guards or issue alternate credentials. Preserve D-12 but do not promise immutable four-hour or non-exportability enforcement against that administrator. Exportable/plaintext-backup can be enabled irreversibly; soft-delete is independent of deletion_allowed. [CITED: https://openbao.org/docs/concepts/policies/] [CITED: https://openbao.org/docs/api/secret/transit/]

API policy gets only update on encrypt/decrypt/rewrap for thinx-deploy-keys, with token_no_default_policy=true. No token self-renew/lookup: Phase 40 can re-login using lease duration from login. Recommend short service tokens and reusable SecretIDs, with documented controlled rotation; do not impose expiring automation credentials without a working refresh path. [CITED: https://openbao.org/docs/api/auth/approle/]

Separate backup AppRole: read sys/storage/raft/snapshot only, short per-job token; optional revoke-self cleanup. No decrypt/restore/admin privilege. Host-only role credentials; renewal needs no OpenBao credential because issuance is external. Proposed API secrets BAO_ROLE_ID/BAO_SECRET_ID use existing readSecret; proposed BAO_CACERT is a public Docker config path. Existing helper defines “const SECRETS_DIR = "/run/secrets/";” and caches file-first reads. [VERIFIED: lib/thinx/secrets.js:17-43]

### Emergency access on 2.7

CLI generate-root now calls authenticated sys/generate-root-token. Recovery shares alone do not bypass auth. Lost operator login needs a distinct rehearsed break-glass path: over SSH add temporary container-local Unix listener, mode 0600, with disable_unauthed_generate_root_endpoints=false; call legacy sys/generate-root API through that socket; repair login; revoke emergency root; remove listener/restart. Keep TCP legacy endpoints disabled. Do not substitute recovery mode: it exposes raw storage repair, not ordinary administration. [CITED: https://openbao.org/docs/commands/operator/generate-root/] [CITED: https://openbao.org/docs/api/system/generate-root/] [CITED: https://openbao.org/docs/configuration/listener/unix/] [CITED: https://openbao.org/docs/concepts/recovery-mode/]

[ASSUMED A1] Available exact-image tooling supports the chosen Unix-socket HTTP transport. Mandatory throwaway preflight must prove no-valid-login recovery before revoking production bootstrap root. If helper tooling is absent, provision a vetted helper for this local path; never publish a recovery port.

### TLS renewal

Use dedicated host-local private CA, signing key outside OpenBao/Raft/container, root-only, with encrypted offline recovery copy. Fixed leaf SANs cover chosen full service DNS and exec loopback. Recommended leaf validity 90 days, daily renewal check at 30 remaining. Stage and validate chain/SAN/key match/dates, atomically switch a containing directory, SIGHUP, verify served fingerprint and API trust; restore previous pair on failure. Individual bind-mounted file inodes complicate atomic replacements: mount parent directory. TLS SIGHUP and 2.7 file polling are documented; prefer explicit paired transaction. [CITED: https://openbao.org/docs/configuration/listener/tcp/]

Include **issuer certificate renewal**, not just leaf renewal, in D-19 automation: stage renewed CA certificate with same signing key/identity, validate in rehearsal, deploy old+renewed trust bundle through versioned API config with root-only spec backup, verify both chains, then switch server chain. Separate CA key replacement is a documented rollover operation. Issuer/leaf signing must work while Bao is sealed or leaf expired; never host Bao's own issuer exclusively inside Bao. Before/after snapshots still apply; use a restricted local Unix management path for expired-listener recovery rather than disabling TLS verification. [CITED: https://docs.openssl.org/3.0/man1/openssl-ca/]

[ASSUMED A2] The complete overlapping-CA bundle transition behaves correctly with the deployed API Node/OpenSSL trust implementations. Prove near-expiry/expired-old-CA cases in throwaway execution; fail closed and retain old state if verification fails. Do not silently downgrade D-19 to manual renewal.

### Snapshot fidelity and routine

Host cron, flock and independent AppRole: save temporary snapshot through exec, inspect/hash, atomically finalize local file, transfer via dedicated restricted SSH key to core temporary file, verify remote hash then finalize. Pin host key; restrict receiver to fixed root-only destination, no forwarding/arbitrary shell; never copy laptop SSH private key. Keep daily and pre/post-change snapshots for 90 days on both local disks, with bounded retries, backlog detection and explicit retention tests. Core receives no runtime seal key, recovery archive or CA private key.

Use Raft snapshot APIs, not live database-file copies. Force restore bypasses seal-consistency checking, not encryption. Manifest records image, Raft index, seal generation and config revision; config/certs/audit files remain separate restore inputs. [CITED: https://openbao.org/docs/api/system/storage/raft/]

Rotation: pre-snapshot, generate new key, update/verify offline archive with both generations, set new current plus previous, restart/unseal proof, post-snapshot, restore both generation cases, prove new-only restart before retiring previous runtime file. Keep old generations offline until dependent retained snapshots expire. Rehearse initially and before upgrades, not on an invented recurring schedule. [CITED: https://openbao.org/docs/configuration/seal/static/]

Restore into isolated throwaway with fresh Raft, same release and matching seal; authenticate using restored-state credentials after restore. Verify key flags, policies, audit and pre-snapshot canary decrypt. **Restore rewinds auth revocations and Transit versions**: pre-revocation backups can resurrect root; an older snapshot cannot decrypt ciphertext using a later key version. Phase 41 must take durable post-rotation backups before newer ciphertext replaces old files. This is a deduction from restore/version semantics, not a tested production outcome. [CITED: https://openbao.org/docs/api/system/storage/raft/] [CITED: https://openbao.org/docs/secrets/transit/]

### Audit and alerts

Use declarative file audit, node-local, mode 0600, log_raw=false. API device creation defaults disabled; do not enable unsafe API audit creation merely to follow an old recipe. Use logrotate and SIGHUP; test HMAC redaction and disk-failure behavior, since unavailable audit can block requests. [CITED: https://openbao.org/docs/configuration/audit/] [CITED: https://openbao.org/docs/audit/] [CITED: https://openbao.org/docs/audit/file/]

Existing source uses “readSecret("SLACK_WEBHOOK")” and “channel: "#thinx"”; Redis notifier has per-process timed debounce, insufficient for D-21. Reuse destination only. Host persistent per-job state under flock: healthy → failure-pending/sent → recovery-pending → healthy; repeated failures do not start another incident. Atomic state updates; sanitized reason codes; webhook never in argv/logs. [VERIFIED: lib/thinx/notifier.js:44-59; lib/thinx/redis-health.js:67-113]

Modern webhook destination is app-configured and cannot be overridden by channel field. Verify actual channel at execution; no Slack messages were sent during research. Network acknowledgment loss prevents a guarantee of mathematically exactly-once delivery; document ambiguous retry behavior while proving normal persistent-failure deduplication. [CITED: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/]

## Don't Hand-Roll

| Problem | Use |
|---|---|
| Encryption/versioning | Built-in Transit |
| Consistent backup | Raft snapshot API |
| Recovery archive cryptography | Native encrypted DMG |
| X.509 signing/parsing | OpenSSL |
| Audit rotation | logrotate + SIGHUP |
| API credential resolution | Existing readSecret |

These recommendations follow the official sources and repository helper cited above; no application crypto/client implementation belongs in Phase 39.

## Code Examples

Proposed HCL fragments; paths/IDs are new design values, not existing repo state. Complete config must be validated with the exact image.

~~~hcl
storage "raft" {
  path = "/openbao/data"
  node_id = "micro"
}
seal "static" {
  current_key_id = "seal-g1"
  current_key = "file:///openbao/seal/seal-g1.key"
}
audit "file" "local" {
  options {
    file_path = "/openbao/audit/audit.json"
    mode = "0600"
    log_raw = "false"
  }
}
~~~

[CITED: https://openbao.org/docs/configuration/storage/raft/] [CITED: https://openbao.org/docs/configuration/seal/static/] [CITED: https://openbao.org/docs/configuration/audit/]

~~~hcl
path "transit/encrypt/thinx-deploy-keys" { capabilities = ["update"] }
path "transit/decrypt/thinx-deploy-keys" { capabilities = ["update"] }
path "transit/rewrap/thinx-deploy-keys" { capabilities = ["update"] }
~~~

[CITED: https://openbao.org/docs/concepts/policies/] [CITED: https://openbao.org/docs/api/secret/transit/]
Locked literal names are “thinx-deploy-keys” and “thinx-api”. [VERIFIED: .planning/workstreams/vault-transit/REQUIREMENTS.md:25-26]

## Common Pitfalls and Verification Gates

| Requirement | Required evidence |
|---|---|
| VAULT-01 | One task; exact tag; micro manager pin; one dedicated Internal=true overlay; no ports/routes; pre/post Traefik inventory unchanged |
| VAULT-02 | realpath/findmnt/stat on mounts; snapshot inspect; both-node hashes; retention using dummy aged files |
| VAULT-03 | API-task request succeeds with CA, fails without CA/wrong hostname; automated leaf and issuer renewal/rollback |
| VAULT-04 | Forced restart auto-unseals; root-only 32 bytes; g1/g2 rotation and both snapshot restore cases; verified local archive |
| VAULT-05 | Operator reads aes256-gcm96 and all three false protection flags; API denied export/backup/delete/soft-delete/rotate/config/other-key paths |
| VAULT-06 | Mounted AppRole login and three-operation canary; no default policy; root rejected; automation survives root revocation |
| VAULT-07 | Request/response audit canary, sensitive values HMACed, rotation/reopen and failure recovery |
| VAULT-08 | Fresh userpass login, hard-cap proof, no-valid-login emergency rehearsal, snapshot restore and complete runbook |
| D-14–21 | Daily and change snapshots; remote failure/retry; 90-day cleanup; repeated maintenance failures produce one alert and one recovery including process restart |

Do destructive negative tests on throwaway keys/instances: broken ACLs must not delete production keys. Verify healthchecks tolerate initial uninitialized state and do not cause a restart loop. Stop-first updates prevent concurrent access to one Raft directory. Snapshot presence alone is not restore proof. Never infer no historical state from no running service.

**Rollout:** capture routes/API/check-in/MQTT baseline and root-only API spec backup; ff-merge reviewed sibling source; install local state; deploy vault only; complete custody/bootstrap/recovery/maintenance; one targeted API update adds overlay/CA/AppRole. Immediately verify console/CSRF/WebSocket, plaintext 7442 and MQTT plus TLS. Roll back targeted API change on regression; preserve Bao data. Final human verification covers custody and Slack destination. [VERIFIED: AGENTS.md:19-29,39-48; .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-CONTEXT.md:44-49]

Runnable read-only gate examples on micro after implementation, using proposed service/network names:

~~~bash
docker node ls --format '{{.Hostname}} {{.Status}} {{.Availability}} {{.ManagerStatus}}'
docker service inspect vault_openbao --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
docker service inspect vault_openbao --format '{{json .Spec.EndpointSpec.Ports}}'
docker service inspect vault_openbao --format '{{json .Spec.TaskTemplate.Networks}}'
docker network inspect openbao-internal --format '{{.Internal}} {{.Attachable}}'
~~~

Inside the task with verified TLS environment: bao version; bao status -format=json; bao operator raft list-peers -format=json; bao read -format=json transit/keys/thinx-deploy-keys; bao operator raft snapshot inspect /protected/path/backup.snap. Privileged reads need transient operator auth and filtered output; never print complete token responses.

## Environment Availability

Verified: micro SSH, both managers, exact registry manifest, host tools listed above, native laptop archive tools. Unverified: core transfer SSH/auth/port/host key and disk capacity, logrotate installation, swap policy, complete image restrictions, no-login recovery, cert rollover, actual Slack destination. Laptop Docker daemon probe was sandbox-denied; no incompatibility was inferred. [VERIFIED: session probes]

Fail closed before production if any required recovery, remote copy, TLS validation or custody gate fails. No existing secret contents were accessed.

## Security Domain

Use ASVS **5.0** names, not legacy template numbering: V6 Authentication, V7 Session Management, V8 Authorization, V11 Cryptography, V12 Secure Communication, V13 Configuration, V14 Data Protection and V16 Logging apply; V2 Validation/V4 API apply to operational wrappers. This is a scoped mapping, not certification. [CITED: https://cornucopia.owasp.org/taxonomy/asvs-5.0]

Threat controls: separate seal from Gluster/snapshots; root-only custody; three-path AppRole; independent backup role; verified TLS; fixed SAN/path inputs; secret-safe logs; audit availability; restricted transfer receiver; checked restore generations. Full node compromise remains accepted residual risk: “Accepted residual risk: full compromise of that node.” [VERIFIED: .planning/workstreams/vault-transit/REQUIREMENTS.md:11]

## State of the Art

2.7 removed the file storage backend; use Raft. Current audit uses declarative configuration; current generate-root needs authenticated access. TLS supports SIGHUP and optional automatic reload. These release-specific differences invalidate many older Vault examples. [CITED: https://openbao.org/community/release-notes/2-7-0/] [CITED: https://openbao.org/docs/commands/operator/generate-root/] [CITED: https://openbao.org/docs/configuration/audit/]

## Assumptions Log and Open Questions

| ID | Unverified claim | Required disposition |
|---|---|---|
| A1 | Exact-image tools support selected Unix-socket emergency transport | Prove no-valid-login recovery in throwaway before root revocation |
| A2 | Overlapping renewed-CA bundle works across deployed trust implementations | Test expiry cases and rollback before enabling renewal |

Remaining operational preflights: core transfer plane; exact local mounts/permissions/capacity; actual Slack destination. Legacy Vault data is deliberately not inspected/migrated. Full admin can change its own guardrails; do not silently weaken D-12 or claim unbypassable restrictions. Proposed paths, policy names and non-locked TTLs are implementation recommendations within context discretion.

## Sources and Metadata

Research-plan seam selected Context7; no callable MCP or ctx7 CLI was available, so official web documentation was used. classify-confidence --provider websearch --verified returned **MEDIUM**. Registry and read-only SSH observations are direct session evidence; behavioral validation is still required. Cache persistence was not completed because research ownership was restricted to this artifact.

Sources are linked inline: official OpenBao release/docs/version-pinned image source, Docker docs, Apple/native help, OpenSSL docs, Slack docs and OWASP. Repo values cite numbered source reads. Findings were challenged against current release behavior, revealing root-generation authentication, unsafe audit opt-in, default UID/dev CMD, irreversible flags, soft deletion and existing legacy data.

**Confidence:** stack MEDIUM (official release + manifest); architecture MEDIUM (locked context + live inventory); pitfalls MEDIUM (official sources, rehearsals outstanding).  
**Research date:** 2026-10-12. Recheck release/security notes and live inventory before execution; validity estimate seven days.  
**Research scope:** documentation artifact only; no deployment, source/config changes, secret creation or commits.

