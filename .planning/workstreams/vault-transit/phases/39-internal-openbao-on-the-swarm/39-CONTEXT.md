# Phase 39: Internal OpenBao on the Swarm - Context

**Gathered:** 2026-10-12
**Workstream:** vault-transit
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the internal OpenBao service required by v1.17: verified TLS, node-local Raft and static-seal auto-unseal, audit logging, a non-exportable Transit key, the restricted `thinx-api` AppRole, and tested operator recovery procedures. Requirements VAULT-01 through VAULT-08 and the Phase 39 roadmap success criteria remain authoritative.

Phase 40 implements API encryption and dual-read behavior; Phase 41 migrates deploy keys, retires the passphrase, and rotates/rewraps ciphertext. Neither is implemented by this phase.
</domain>

<decisions>
## Implementation Decisions

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
</decisions>

<canonical_refs>
## Canonical References

Downstream agents must read these before planning or implementing. Paths are relative to `thinx-device-api` unless stated otherwise.

### Requirements and operational constraints
- `.planning/workstreams/vault-transit/ROADMAP.md` — Phase 39 scope, five success criteria, rollout rules and phase dependencies.
- `.planning/workstreams/vault-transit/REQUIREMENTS.md` — VAULT-01 through VAULT-08, milestone decisions and accepted residual risks.
- `.planning/workstreams/vault-transit/STATE.md` — workstream continuity and remaining concerns.
- `.planning/PROJECT.md` — current project and deployment context; historical summaries may lag live code.
- `AGENTS.md` — production constraints, SSH access, plaintext legacy protocols and edge update rules.
- `.planning/runbooks/swarm.md` — existing operational and verification procedures.
- `.planning/milestones/v1.15-ROADMAP.md` — Phase 34 D-20 explicitly dropped and moved to v1.17.
- `.planning/milestones/v1.15-phases/34-ops-surface-reduction-sla-close-out/34-CONTEXT.md` — earlier deployment and verification decisions; later runbook/AGENTS changes take precedence.

### Deployment and code integration
- `../../thinx-swarm/vault.yml` — dormant legacy stack to replace; currently references `vault:1.5.5`, public Traefik labels and Gluster paths.
- `../../thinx-swarm/vault.conf` — dormant listener/storage configuration to replace.
- `../../thinx-swarm/thinx.yml` — deployment source for API network, CA and AppRole integration.
- `docker-swarm.yml` — parent repository deployment mirror and existing secret mounts.
- `lib/thinx/secrets.js` — existing `readSecret()` helper, secret-first with environment fallback and caching; API client implementation belongs to Phase 40.

### Official documentation consulted during discussion
- https://openbao.org/docs/auth/userpass/ — operator username/password authentication and policy assignment.
- https://openbao.org/docs/auth/cert/ — certificate alternative considered and not selected.
- https://openbao.org/docs/concepts/tokens/ — token lifetimes and root-token distinction.
- https://openbao.org/docs/commands/operator/generate-root/ — emergency root generation; research must verify release-specific authentication requirements.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `readSecret()` in `lib/thinx/secrets.js` already supports Docker-mounted credentials; avoid introducing a competing secret-loading convention.
- `docker-swarm.yml` already declares external secrets and per-service mounts.
- Existing swarm runbooks provide repo-first deployment, root-only spec backup and targeted service-update patterns.

### Established Patterns
- `thinx-swarm` is the deployment source; micro receives repo updates by SSH push and fast-forward merge.
- Management services use the SSH/exec plane. A new public listener or Traefik dashboard route is not part of this phase.
- The codebase maps date from May 2026 and contain obsolete dependency/deployment details. Use current code, runbooks and live read-only reconnaissance during research.

### Integration Points
- Replace dormant Vault deployment/configuration in the sibling swarm repository.
- Attach the API to the dedicated overlay and supply CA/AppRole material without shipping Phase 40 encryption behavior early.
- Add node-local snapshot/transfer and certificate-maintenance jobs, using the existing operations notification destination.
</code_context>

<specifics>
## Specific Ideas

The user selected all four discussion areas and explicitly chose guided local recovery setup, sole-operator custody, full operator administration, 90-day retention and automatic maintenance. Keep the procedures usable by one operator without recurring manual backup or certificate-renewal work.
</specifics>

<deferred>
## Deferred Ideas

No new capabilities were added outside the phase. Existing deferrals remain: API encryption in Phase 40; legacy migration and Transit rotation/rewrap in Phase 41; cloud-KMS unseal, Raft HA and PwnDoc retest are future requirements. Generic todo keyword matches were unrelated to this deployment and were not folded into the scope.
</deferred>

---
*Phase: 39-internal-openbao-on-the-swarm*
*Context gathered: 2026-10-12*
