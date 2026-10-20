# Milestones: vault-transit workstream

Workstream-scoped ledger. The project-wide ledger is `.planning/MILESTONES.md`.

## v1.17 Deploy-Key OpenBao Transit (Shipped: 2026-10-20)

**Delivered:** PwnDoc finding `6ac64bcfdd94eb38dba4c3a4` is fixed in production. Every owner's git deploy key on
GlusterFS is now OpenBao Transit ciphertext (`vault:v2:`) that only the `thinx-api` AppRole can decrypt, through an
internal-only OpenBao on the swarm. `GIT_KEY_PASSPHRASE` is gone from code, images, compose files and swarm secrets.
Builds still clone and run with the owner logged out.

**Phases completed:** 39–41 (3 phases, 19 plans, 44 tasks)

**Key accomplishments:**
- Internal-only OpenBao 2.7.1 on the swarm (Phase 39): node-local Raft, TLS from a private CA verified by the API,
  `seal "static"` auto-unseal, a node-local file audit device, a non-exportable `thinx-deploy-keys` Transit key and a
  `thinx-api` AppRole limited to encrypt/decrypt/rewrap. The root token is revoked after bootstrap. No Traefik route
  and no published port. Host jobs cover Raft snapshots on both nodes (90 days), CA/leaf renewal, audit rotation and
  restore rehearsal, with Slack alerts. Custody material stays in an operator-held encrypted archive.
- Dependency-free Transit/AppRole client in the API (Phase 40), with the `BAO_CACERT` pin, single-flight re-login,
  one bounded retry and one Slack alert per incident. CI and the laptop test it against a real OpenBao dev server.
- New deploy keys are written only as `vault:vN:` ciphertext. Keyed builds decrypt in memory into a per-attempt
  `ssh-agent`. When OpenBao is down or `THINX_DEPLOY_KEYGEN` is off, key generation answers
  `503 key_service_unavailable` and the Vue and Legacy consoles show one plain sentence.
- All 77 surviving production keys were migrated (76 converted, 0 quarantined, 0 failed) by
  `scripts/migrate-deploy-keys.js`. A migrated key cloned a real repository through the production fetch path.
- Passphrase retired (Phase 41): the legacy read path, `GIT_KEY_PASSPHRASE` and its askpass files are removed from
  code, Dockerfiles, compose files, `thinx.yml` and swarm secrets. Static and live gates assert the absence.
- Transit key rotated to v2, every ciphertext rewrapped, `min_decryption_version` = 2. OpenBao refuses the v1 canary
  as `retired_version`. The pre-migration tar, the v1 canary and four passphrase-bearing spec backups are shredded.
  Runbook sections 11–12 cover outage handling and repeatable rotation.

**Stats:**
- 3 phases, 19 plans, 44 tasks; 17/17 requirements complete
- 434 parent commits from `aa4372de` (2026-10-12) to `6915b6fa` (2026-10-20); 65 non-planning files changed,
  +12,826 / −916 lines
- 9 days from first phase commit to ship (roadmap created 2026-10-09)

**Git range:** parent `aa4372de` → `6915b6fa` (plus the close-out commits)

**Closeout:** `override_closeout`. Known verification overrides: 1 newly acknowledged (todo
`2026-10-19-vue-console-attach-repository-to-device.md`, console track), 16 carried forward from a prior close (see
STATE.md Deferred Items). Phases 39 and 40 have `status: passed` VERIFICATION reports but stale ledger digests,
because Phase 41 removed the dual-read path and passphrase handling they verified, as planned (D-04). No milestone
audit was run.

**Known gaps / future:**
- KEYMIG-04: retest the PwnDoc finding with evidence that Gluster/backup access alone cannot decrypt a key.
- Gluster backups and DO VM snapshots taken before the migration still hold passphrase-encrypted keys until they
  expire (accepted residual risk, operator 2026-10-09).
- Cloud-KMS auto-unseal and OpenBao HA (Raft multi-node) remain future options.
- Open review residuals WR-01, WR-04, WR-05, WR-06, IN-07, IN-09 (`41-REVIEW-DISPOSITION.md`). T-41-27 was accepted
  as time-bounded: two operator userpass tokens expire by TTL at 22:48Z on 2026-10-20.
- The live `thinx_api` spec carries `THINX_DEPLOY_KEYGEN=enabled`, but runbook §11 says it has none. Reconcile on the
  next stack deploy.

---
