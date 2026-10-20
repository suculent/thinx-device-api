---
phase: 39-internal-openbao-on-the-swarm
verified: 2026-10-18T22:17:32Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-01-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-01-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-02-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-02-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-03-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-03-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-04-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-04-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-05-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-05-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-06-PLAN.md
  - .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-06-SUMMARY.md
  - docker-swarm.yml
  - lib/thinx/secrets.js
covered_digest: "v3:sha256:bd5d50673323a1e7d5307b108f9cf55ef6b4ab63e166f8ac456c659d64d2e9f1"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "After the in-flight redeploy of the review fixes (thinx-swarm f11c7dc..471a95f) to micro and core, run on micro: `openbao-install.sh --check`, `openbao-maintenance-install.sh --check --expect-full`, `openbao-verify.sh --full --maintenance --api-service thinx_api`, `openbao-cert-renew.sh --verify-current`, `openbao-backup.sh --verify-both-nodes`; on core `openbao-maintenance-install.sh --check --role receiver`. Confirm `/etc/tmpfiles.d/openbao-maintenance.conf` exists and `/run/lock/openbao` is 0700 root."
    expected: "Every check prints its OK verdict; installed scripts report source_rev 471a95f; TMPFILES_APPLIED ok was printed by the install; no PATH_MISSING / LOCK_DIR_UNSAFE / API_CA_PIN_DRIFT."
    why_human: "The live evidence in the runbook was taken at thinx-swarm 5897b8b. The fixes (CR-01 reboot survival, WR-01..16) reach production only through the redeploy another agent is running now; this verification was not allowed to touch production."
  - test: "WR-14: in an operator session on micro, `bao policy write operator /etc/openbao/policies/operator.hcl`, then re-run the privileged `openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1 --expect-root-revoked --api-service thinx_api`."
    expected: "No POLICY_DRIFT; `bao auth disable approle` / deleting the thinx-api or backup AppRole or the operator user returns 403 (as the exact-image matrix proves), while reading/updating them still works."
    why_human: "Installing the file does not change the live policy; only an operator-authenticated policy write does, and the fixer was not authorized to do it. The application boundary (thinx-api policy) does not depend on this."
  - test: "Confirm that only vault_openbao and thinx_api are attached to the openbao-internal overlay (e.g. `openbao-preflight.sh --live` NET_MEMBERS row, or `docker service ls -q | xargs docker service inspect --format '{{.Spec.Name}} {{range .Spec.TaskTemplate.Networks}}{{.Target}} {{end}}'` filtered for the overlay id)."
    expected: "Exactly two members: vault_openbao and thinx_api. Network Internal=true, Attachable=false."
    why_human: "The goal says 'nothing else can reach' OpenBao. Source shows only `api` declares the overlay, and the post-deploy evidence records OpenBao on one network and the API spec delta as exactly five additions, but no post-deploy record lists all overlay members (the only NET_MEMBERS check ran before the network existed). openbao-verify.sh does not assert membership."
  - test: "Review the six review fixes marked 'fixed: requires human verification' (WR-01 EXIT-trap incidents and docker timeouts, WR-03 leaf renewal while the issuer renewal fails, WR-04 incident close only from daily/renew/exercise, WR-05 new incident after an ambiguous recovery, WR-10 init-material persistence/resume, WR-11 resumable root revocation)."
    expected: "Logic matches the review's intent; WR-01/03/04 behaviour is observed on the next real cron failure or a deliberate fault (as in the Plan 05 incident drills). WR-10/WR-11 only matter for a re-bootstrap; no fault-injection test exists for the crash windows."
    why_human: "State-machine and crash-window changes; the fixture suites pass (bootstrap 62, maintenance 32) but do not cover the WR-10/WR-11 crash windows, and the alert behaviour changes need the live Slack channel."
  - test: "Judgment-tier prohibitions (3), non-authoritative verifier verdict recorded below: (P1, 39-01) no public OpenBao route and no change to plaintext 7442 / plain MQTT; (P2, 39-03) maintenance logs, Slack alerts, snapshots, manifests and runbooks contain no seal/recovery keys, credentials, tokens, plaintext deploy keys, ciphertext or webhook values; (P3, 39-05) restore never presents an older snapshot as current, discloses the credential-revocation rewind and rejects seal-generation mismatch."
    expected: "Operator accepts each as held. Verifier judgment: P1 held (final edge gate: router inventory byte-identical, 0 vault/openbao routers, 7442/1883/8883 open, HTTP on 7442 200); P2 held (fixture checks 62/32 assert no secret in any output/argv/log/state; runbook evidence log is values-free by inspection); P3 held (rehearsal refuses GENERATION_MISMATCH / PREVIOUS_GENERATION_MISMATCH before reading key bytes, SEAL_MISMATCH fails; every manifest carries both restore limitations; runbook section 9)."
    why_human: "Judgment-tier prohibitions have no wired test-tier enforcement; they need explicit human resolution, never a silent pass."
---

# Phase 39: Internal OpenBao on the Swarm Verification Report

**Phase Goal:** The API has an OpenBao that it can reach over a verified-TLS internal overlay and that nothing else can reach. OpenBao unseals itself after a restart and gives the `thinx-api` AppRole encrypt/decrypt/rewrap on a non-exportable Transit key, and no other permission.
**Verified:** 2026-10-18T22:17:32Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Method: source read directly in `/Users/sychram/Repositories/thinx-swarm` (HEAD `471a95f`, signed, on `origin/master`) and the
parent repo; local suites run in a detached worktree of `471a95f`; production state taken from the sanitized runbook
evidence log (`.planning/runbooks/openbao.md`) and the operator-confirmed final gates of 2026-10-18. No production access
was made.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Exactly one `openbao/openbao:<x.y.z>` task, tag-pinned, on the Raft manager, only on the internal overlay shared with `thinx_api`, no port, no Traefik router (inventory unchanged, `vault.thinx.cloud` unserved), no OpenBao data/config under `/mnt/gluster` | ✓ VERIFIED | `vault.yml`: `image: openbao/openbao:2.7.1`, `replicas: 1`, `node.hostname == micro` + `node.role == manager`, `stop-first`, single network `openbao-internal` (external), no `ports`, no labels, all bind sources `/etc/openbao`, `/var/lib/openbao`, `/var/log/openbao`. `openbao-verify.sh check_service_spec` asserts IMAGE_EXACT_TAG, ONE_REPLICA, PINNED_MICRO_MANAGER, NO_PUBLISHED_PORT, NO_GLUSTER_MOUNT, NO_TRAEFIK_LABEL, ONE_TASK_ON_MICRO. Live: deploy "0 published ports, one network"; final gate router inventory byte-identical (29, `fa0afd608550e585`), 0 vault/openbao routers, `EDGE-EXPOSURE-OK`. Overlay membership: see human item 3. |
| 2 | From inside `thinx_api`, TLS verifies against mounted `BAO_CACERT` and fails without it; `vault.conf` is OpenBao HCL without `tls_disable` | ✓ VERIFIED | `vault.conf`: `listener "tcp"` with `tls_cert_file`/`tls_key_file`, `tls_min_version = "tls12"`; `grep -c tls_disable` = 0. `thinx.yml` and `docker-swarm.yml` `api`: config `openbao-ca` -> `/run/openbao/ca.pem`, `BAO_CACERT=/run/openbao/ca.pem`, `BAO_ADDR=https://openbao.internal:8200`. Live `api-wiring --live` (twice, last after the 19:48 OpenBao restart): verified TLS 200; no CA -> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; foreign same-subject CA refused; bare IP -> `ERR_TLS_CERT_ALTNAME_INVALID`. |
| 3 | After `docker service update --force`, `sealed=false` with no operator input via `seal "static"` / `file://` 32-byte root-only key on manager-local disk; recovery keys exist; rotation via `previous_key*` exercised once | ✓ VERIFIED | `vault.conf` `seal "static"` `current_key = "file:///openbao/seal/seal-g2.key"`; bind `/var/lib/openbao/seal` read-only. Bootstrap `operator init -recovery-shares=1 -recovery-threshold=1`. Live: forced update 19:48:29-45Z "Auto Seal: static (current_key_id seal-g2)", "unsealed with stored key", `--health` OK with no input; g1 -> g2 overlap (`previous_key_id seal-g1`) restart 18:34:55Z, then g2-only restart 19:03:59Z / 19:09:03Z; seal key 32 B 0600; recovery share in the offline archive. Behaviour-dependent truth proven by the live restart, not by presence. |
| 4 | `thinx-api` AppRole (secrets mounted on `thinx_api`) round-trips encrypt/decrypt on `thinx-deploy-keys`; export, backup, delete, rotate and every other path denied; key reads back aes256-gcm96 / exportable=false / allow_plaintext_backup=false / deletion_allowed=false; bootstrap root gone | ✓ VERIFIED | `openbao/policies/thinx-api.hcl`: exactly three paths `transit/{encrypt,decrypt,rewrap}/thinx-deploy-keys`, `update` only. Bootstrap: role `token_no_default_policy=true`, key `type=aes256-gcm96 exportable=false allow_plaintext_backup=false`, config `deletion_allowed=false`, readback must equal `aes256-gcm96,false,false,false` (KEY_FLAGS). Live in the API task: login policies `["thinx-api"]`, TTL <= 20 min, random canary encrypt/decrypt/rewrap/decrypt-rewrapped all 200 and matched; 13/13 denials (key read, rotate, export, backup, config exportable=true, DELETE key, other key, lookup-self, renew-self, sys/mounts, policy list, secret-id mint, raft snapshot) -> 403; unauthenticated encrypt 403. Operator re-read key flags 20:00Z. Root revoked 17:39:26Z with 403 rejection proof. |
| 5 | Requests appear in the node-local file audit log; Raft snapshot outside `ssh_keys` and Gluster backups restores into a throwaway; runbook (ssh + docker exec only) covers bootstrap, seal custody/rotation, recovery keys, snapshot, restore, short-lived privileged token | ✓ VERIFIED | `vault.conf` declarative `audit "file"` -> `/openbao/audit/audit.log` (bind `/var/log/openbao`), mode 0600, `log_raw=false`. Live: audit cross-check of the operator login/key read/revoke-self and the API token's 403 at 20:00Z; logrotate + canary + fail-closed drill. Snapshots in `/var/backups/openbao/<stem>/` on micro and core (12 identical pairs); restore rehearsals g1 and g2 `result=ok` on an isolated throwaway. Runbook sections 4-10 cover install/rollback, bootstrap, custody pipelines, operator userpass login (4 h hard cap), A1 break-glass via recovery share, backups, restore with both limitations, API attach/rollback. |

**Score:** 5/5 truths verified (0 present, behaviour-unverified)

Plan-level truths (39-01..06 frontmatter) were checked against the same evidence; none contradicts the roadmap criteria.
The four "FLAGGED ASSUMPTION" truths in Plans 01-03 were resolved by execution: exact-image suite (143 checks at
`471a95f` per the fix report, 136 at earlier commits) proves the 2.7.1 key-flag readback; the live preflight confirmed
micro placement; the Plan 04 ceremony and Plan 05 rehearsals proved the sole-operator custody; micro -> core transfer,
capacity and the 90-day boundary were exercised live.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `thinx-swarm/vault.yml` | tag-only isolated single-node stack | ✓ VERIFIED | see truth 1 |
| `thinx-swarm/vault.conf` | Raft, verified TLS, static seal, file audit; seal-g2 current | ✓ VERIFIED | `seal-g2` only, no `previous_*`, no `tls_disable` |
| `thinx-swarm/openbao/policies/{thinx-api,backup,operator}.hcl` | minimal app/backup policies; guarded operator policy | ✓ VERIFIED | WR-14 guardrails in source; live write pending (human item 2) |
| `thinx-swarm/scripts/openbao-{preflight,install,bootstrap,verify,backup,snapshot-receive,cert-renew,restore-rehearsal,audit-reopen,maintenance-install,recovery-archive,common}.sh` | host tooling | ✓ VERIFIED | substantive (8852 insertions since `SWARM_BASE`), exercised live and by fixture suites |
| `thinx-swarm/tests/openbao-{exact-image,bootstrap,maintenance,api-wiring}.test.sh` | blocking tests | ✓ VERIFIED | bootstrap 62/62, maintenance 32/32, api-wiring `--source` OK (run here) |
| `thinx-swarm/thinx.yml` + parent `docker-swarm.yml` | API overlay, CA config, BAO_ROLE_ID/BAO_SECRET_ID, BAO env | ✓ VERIFIED | only `api` declares them; both pinned to `openbao-ca-a2b56707515146d7a580` |
| `.planning/runbooks/openbao.md` | ops runbook + sanitized evidence, "Phase 39 final gate" | ✓ VERIFIED | 693 lines, sections 1-10 + evidence log |
| `39-EXECUTION-BASELINES.env` | PARENT_BASE / SWARM_BASE | ✓ VERIFIED | `9b91a81f…`, `2121066f…` |
| Operator-local encrypted archive + password records (39-04) | custody | ✓ VERIFIED (operator-attested) | `verify --require-complete` entries=4 at bootstrap, g1+g2 later; values never seen by agents |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `vault.yml` | `vault.conf` | node-local `/etc/openbao/config` RO bind, `bao server -config=/openbao/config` | ✓ WIRED | installer copies the checkout file to `openbao.hcl` |
| `vault.conf` | `/var/lib/openbao/seal/seal-g2.key` | `file:///openbao/seal/...` | ✓ WIRED | 39-01 key link named g1; current source correctly names g2 after the planned rotation |
| `thinx-api.hcl` | `transit/(encrypt\|decrypt\|rewrap)/thinx-deploy-keys` | three update-only paths | ✓ WIRED | |
| `openbao-bootstrap.sh` | policies | `policy write` of the three reviewed files byte-for-byte | ✓ WIRED | verify re-checks byte identity (operator row 1) |
| `openbao-backup.sh` | `openbao-snapshot-receive.sh` on core | forced-command SSH, sha256, atomic finalize | ✓ WIRED | 12 identical pairs |
| `openbao-cert-renew.sh` | `thinx_api` CA config | `deploy_api_trust` | ✓ WIRED | armed; exercised with expired predecessor; WR-12 adds pin-drift gate |
| `thinx_api /run/secrets/BAO_*` | `lib/thinx/secrets.js readSecret()` | file-first loader | ✓ WIRED | `readSecret` exported at `lib/thinx/secrets.js:20,51`; live test reads both from `/run/secrets`, not env |
| `thinx.yml` | `docker-swarm.yml` | structural `openbao-internal` stanza match | ✓ WIRED | `api-wiring --source` -> `API-WIRING-OK` (run here) |

### Data-Flow Trace (Level 4)

Not applicable: infrastructure phase with no rendered dynamic data. The runtime data path (AppRole secret file ->
`readSecret()` -> login -> Transit round-trip) is proven end to end by the live canary.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Bootstrap/verify/custody state machine (fixtures) | `bash tests/openbao-bootstrap.test.sh all` @471a95f | `OPENBAO-BOOTSTRAP-TEST-OK mode=all checks=62` | ✓ PASS |
| Backup/TLS/audit/incident maintenance (fixtures) | `bash tests/openbao-maintenance.test.sh all` @471a95f | `OPENBAO-MAINTENANCE-TEST-OK mode=all checks=32` | ✓ PASS |
| Stack-file API wiring and Phase 40 scope absence | `bash tests/openbao-api-wiring.test.sh --source thinx.yml <parent>/docker-swarm.yml` | `API-WIRING-OK mode=source`; rsakey.js/git.js/package*.json unchanged since `9b91a81f`; no OpenBao module under `lib/` | ✓ PASS |
| Exact-image matrix | `tests/openbao-exact-image.test.sh` | not re-run here (local Docker, long); fix report: 143 checks OK @471a95f | ? SKIP (reported) |
| Live gates | `openbao-verify.sh --full ...`, `api-wiring --live` | not run (read-only verification); runbook evidence + operator confirmation | ? SKIP (evidenced) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared by the phase. `scripts/probe-rtm-handshake.sh` is cited in the edge gate as a
diagnostic (exit always 0, `0/4`); it targets production and was not run here.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VAULT-01 | 39-01, 39-05 | `openbao/openbao` tag-pinned, 1 replica on manager, only internal overlay, no routers/ports | ✓ SATISFIED | truth 1 |
| VAULT-02 | 39-01, 39-03, 39-05 | node-local Raft; snapshots apart from `ssh_keys` and Gluster backups | ✓ SATISFIED | `/var/lib/openbao/raft`; `/var/backups/openbao` on micro + core, ext4 |
| VAULT-03 | 39-01, 39-03, 39-06 | TLS from internal CA, API verifies `BAO_CACERT`; HCL config without `tls_disable` | ✓ SATISFIED | truth 2 |
| VAULT-04 | 39-01, 39-02, 39-04, 39-05 | static seal auto-unseal; recovery keys, offline seal copy, rotation documented | ✓ SATISFIED | truth 3; runbook sections 1, 5, 7, 9; archive holds g1, g2, share, CA |
| VAULT-05 | 39-01, 39-02, 39-05 | key aes256-gcm96, exportable/plaintext-backup/deletion false | ✓ SATISFIED | truth 4 |
| VAULT-06 | 39-01, 39-02, 39-05, 39-06 | AppRole policy encrypt/decrypt/rewrap only; role/secret id as swarm secrets via `readSecret`; no root token | ✓ SATISFIED | truth 4; live readSecret proof |
| VAULT-07 | 39-01, 39-03, 39-05 | file audit device on node-local storage | ✓ SATISFIED | truth 5 |
| VAULT-08 | 39-02, 39-04, 39-05, 39-06 | ssh + docker exec only; runbook for bootstrap, seal handling/rotation, recovery keys, snapshot/restore | ✓ SATISFIED | runbook sections 4-10 |

All eight phase IDs appear in plan frontmatter and in REQUIREMENTS.md (traceability: Phase 39). No orphaned
requirement: REQUIREMENTS.md maps nothing else to Phase 39. KEYENC-* / KEYMIG-* are Phase 40/41 and are confirmed absent
(scope rows of `api-wiring --source`).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| all Phase 39 scripts, configs, policies, tests | - | `TBD`/`FIXME`/`XXX` | none found | - |
| `thinx-swarm/scripts/openbao-recovery-archive.sh` | - | working-tree mode 100755, index 100644 (uncommitted, deliberately left by the fixer) | ℹ️ Info | runbook calls `scripts/openbao-recovery-archive.sh ...` directly; a fresh checkout needs `bash scripts/...` or a committed exec bit |
| `thinx-swarm/scripts/openbao-*.sh` | - | review Info items IN-01..IN-08 not in the fix scope (e.g. IN-05 no CA name constraints, IN-07 verify snapshots via 16 MB task `/tmp`, IN-02 loose fallback snapshot) | ℹ️ Info | none blocks the goal; IN-07 will start failing proof snapshots once Raft exceeds 16 MB |
| CR-01 (reboot loses `/run/openbao-maintenance`) | - | fixed in source `f11c7dc`, not yet live | ⚠️ Warning until redeploy | without the redeploy a micro reboot stops leaf renewal; leaf `r20261018T194151Z` is good to ~2027-01 so no near-term outage; human item 1 |

### Human Verification Required

1. **Review-fix redeploy landed.** Run the `--check` / `--full --maintenance --api-service thinx_api` / `--verify-current`
   / `--verify-both-nodes` set on micro and the receiver check on core after the in-flight redeploy. Expected all OK at
   source `471a95f`, tmpfiles entry present, `/run/lock/openbao` 0700 root. Why human: production was off-limits here
   and the live evidence predates the fixes.
2. **WR-14 live operator policy.** `bao policy write operator /etc/openbao/policies/operator.hcl` in an operator session,
   then the privileged verify. Expected no POLICY_DRIFT and 403 on the destructive auth operations. Why human: needs the
   operator password and an explicit decision.
3. **Overlay membership.** Confirm only `vault_openbao` and `thinx_api` are on `openbao-internal`. Why human: no
   post-deploy record lists the members and `openbao-verify.sh` does not assert it.
4. **Logic fixes WR-01/03/04/05/10/11.** Review; observe WR-01/03/04 on the next real failure or a deliberate drill.
   Why human: state-machine / crash-window changes without fault-injection coverage.
5. **Judgment-tier prohibitions P1-P3.** Verifier judgment: all three held (evidence in frontmatter). Why human:
   judgment-tier prohibitions need explicit resolution.

### Gaps Summary

No gaps. Every roadmap success criterion is backed by source that implements it and by live evidence of the behaviour
(including the behaviour-dependent ones: auto-unseal after a forced restart, TLS refusal without the CA, policy
denials from inside the API task, snapshot restore into a throwaway). The goal "nothing else can reach" holds by
construction (Internal=true, non-attachable overlay; no published port; no router; only `api` declares the overlay)
but the actual overlay member list has no post-deploy record, so it is a human check rather than a verified claim. The
remaining items are about the review fixes now being deployed, not about the phase goal itself.

---

_Verified: 2026-10-18T22:17:32Z_
_Verifier: Claude (gsd-verifier)_

## Human Verification Resolution (2026-10-18/19, operator)

1. Review-fix redeploy: done 21:57–22:10Z at thinx-swarm 471a95f. Every check passed on micro and core (tmpfiles entry installed, /run/openbao-maintenance and /run/lock/openbao 0700, transfer re-proven, 12 identical snapshot pairs, EDGE-EXPOSURE-OK, 29 routers). Evidence: runbook "Review-fix redeploy" (42940603).
2. WR-14 operator policy: written by the operator at 22:13:42Z. The privileged verify printed `OPENBAO-VERIFY-OK mode=full+api`, with no POLICY_DRIFT. A token printed to the operator's own terminal by a failed first attempt (read-only container FS) was revoked at 22:13:35Z (audit log).
3. Overlay membership: `openbao-internal` internal=true attachable=false; members are `thinx_api` and `vault_openbao` only (checked live).
4. Logic fixes WR-01/03/04/05/10/11: signed off by the operator. Known gap: there is no fault-injection test for the WR-10/WR-11 crash windows.
5. Three prohibitions (no public route, 7442/plain MQTT unchanged; no secret values persisted; restore never passes off a stale snapshot or accepts a mismatched seal): signed off by the operator.
