# Phase 39 API capability coverage

The installed API detector returned `detected: true` for the real Phase 39 roadmap scope plus plans. This matrix fixes the accepted boundary: Phase 39 deploys and proves internal OpenBao and gives the existing API only its TLS/AppRole/readSecret contract. Application encryption and migration remain Phases 40 and 41.

| Capability | Decision | Reason |
|---|---|---|
| `/sys/health`, `/sys/seal-status` and exact version identity | INTEGRATE | 39-01 exact-image tracer; 39-05/06 live health and version gates |
| `/sys/init` with one recovery share and static-seal auto-unseal | INTEGRATE | 39-02 serialized bootstrap; 39-05 restart and g1→g2 recovery matrix |
| ACL policy create/read for operator, API and backup identities | INTEGRATE | 39-01 exact policy matrix; 39-02 bootstrap |
| Userpass enable/login and four-hour operator hard maximum | INTEGRATE | 39-01/02 policy and token metadata gates; 39-04 local credential custody |
| AppRole enable/config/login for `thinx-api` and backup | INTEGRATE | 39-01 role tests; 39-02 bootstrap; 39-06 live API proof |
| Transit mount and `thinx-deploy-keys` key create/read/config | INTEGRATE | 39-01 key type/export/deletion/latest-version locks; 39-02 bootstrap |
| Transit encrypt, decrypt and rewrap through the API role | INTEGRATE | 39-01 positive and negative policy canaries; 39-06 `readSecret` runtime verification |
| Raft snapshot save, checksum/manifest and isolated restore | INTEGRATE | 39-03 backup/restore automation; 39-05 live two-node and restore matrix |
| Declarative file audit device and HMAC-redacted audit evidence | INTEGRATE | 39-01 config; 39-03 lifecycle; 39-05/06 live canaries |
| Token lookup/renew/revoke and bootstrap-root revocation | INTEGRATE | 39-01 hard-cap checks; 39-02 transaction; 39-05/06 root-rejection proof |
| Emergency root generation through the Unix-only listener | INTEGRATE | 39-01 isolated surface; 39-02 pre-revocation A1 proof |
| API container secret/config/network wiring and TLS/AppRole login | INTEGRATE | 39-06 source test plus one rollback-protected service update |
| Production deploy-key encryption client, write path and error semantics | OPT-OUT | Phase 40 owns the production client; Phase 39 proves only existing `readSecret` wiring |
| Existing-row backfill, Transit rotation and bulk rewrap | OPT-OUT | Phase 41 owns migration and rotation; exercising these here would change persisted production data |
| HA, Raft replication, performance/DR replication | OPT-OUT | Accepted Phase 39 topology is one micro task with core holding verified backup copies |
| Public listener, published port, public hostname, UI or Traefik router | OPT-OUT | D-03 requires private overlay-only access and equality of the public edge inventory |
| Cloud KMS or external auto-unseal | OPT-OUT | D-04 requires node-local static seal generation and a tested g1→g2 rotation |
| Alternative operator/service auth methods | OPT-OUT | D-10 through D-13 select userpass for the operator and AppRole for services |
| KV, PKI, database, SSH, TOTP and cloud secret engines | OPT-OUT | No VAULT-01..08 behavior consumes them; adding them expands authority and attack surface |
| Transit key export, backup, delete, trim, BYOK or API-role key administration | OPT-OUT | D-11 and D-12 restrict the API role to three data-plane paths and lock export/deletion |
| Audit-device mutation through the HTTP API | OPT-OUT | D-20 selects declarative file audit config and node-local lifecycle management |
| Issuer renewal and API trust-bundle deployment | INTEGRATE | 39-03 builds the recurring immutable-config consumer; 39-05 installs it; 39-06 proves a second live renewal with an expired predecessor and rollback |
| Raw-storage and routine recovery-mode administration | OPT-OUT | Not required for normal operation; the reviewed emergency-root path and restore rehearsal cover recovery |

Every accepted capability is reachable from a task and blocking verifier. Every opt-out is outside VAULT-01..08 or conflicts with a locked Phase 39 boundary.
