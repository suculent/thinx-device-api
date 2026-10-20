---
phase: 39-internal-openbao-on-the-swarm
plan: 05
subsystem: infra
tags: [openbao, swarm, static-seal, rotation, raft-snapshot, backup, tls, audit, slack, production]
status: complete

requires:
  - phase: 39-02
    provides: "install/bootstrap/verify tooling, recovery-archive tool, exact-image harness"
  - phase: 39-03
    provides: "backup, snapshot receiver, restore rehearsal, cert-renew, audit-reopen, maintenance installer"
  - phase: 39-04
    provides: "encrypted offline recovery archive and the separate operator password"
provides:
  - "Production OpenBao 2.7.1 (`vault` stack, `vault_openbao`, 1 task pinned to micro, internal overlay only, no port or router), initialized, bootstrap root revoked"
  - "Static seal rotated g1 -> g2; runtime and source on seal-g2 alone; g1 only in the offline archive"
  - "Recorded restore matrix: g1 and g2 full rehearsals result=ok, 3 mismatch refusals/failures, g2-only partial rehearsal S3"
  - "Unattended maintenance on micro: daily backup (micro + core, 90 d), daily cert renewal, audit logrotate + reopen, Slack begin/recovery incidents"
  - "Unattached swarm secrets BAO_ROLE_ID / BAO_SECRET_ID for Plan 06"
affects: [39-06]

tech-stack:
  added: ["openbao/openbao:2.7.1 (production)"]
  patterns:
    - "Seal rotation in two restarts: overlap config (current g2 + previous g1), then g2 alone with the old key file still on disk (cheap rollback), then shred and a second restart"
    - "Push thinx-swarm to origin, wait for the CI errorpage/downtime autoredeploy, then run the edge gate"
    - "Live incident tests by renaming one root-only input inside its 0700 dir under a restore trap"

key-files:
  created:
    - .planning/runbooks/openbao.md
  modified:
    - ../../thinx-swarm/vault.conf
    - ../../thinx-swarm/scripts/openbao-common.sh
    - ../../thinx-swarm/scripts/openbao-bootstrap.sh
    - ../../thinx-swarm/tests/openbao-bootstrap.test.sh
    - ../../thinx-swarm/tests/openbao-maintenance.test.sh
    - ../../thinx-swarm/tests/openbao-exact-image.test.sh

key-decisions:
  - "Rotation retires g1 in two restarts: g2-only config with seal-g1.key still present, then shred and restart again"
  - "S2 rehearsal takes seal-g2 from the offline archive and seal-g1 from micro's runtime file (a previous seal needs its own fd)"
  - "Fixture suites install a first-deploy (g1-only) form of vault.conf; the exact-image suite stages every generation the committed config names"
  - "g1 stays in the offline archive until every snapshot naming it ages out (not before 2027-01-16)"
  - "Live retention test with two marked dummy pairs either side of the 90-day cutoff, removed afterwards"

requirements-completed: [VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08]

duration: 5h03m
completed: 2026-10-18

actuals:
  tokens: 11536
  tasks: 3
  commits: 8
plan_head_before: 0e63babe659ff56f211d06f263f65574bc40cb80
plan_head_after: e6c05c98fb01b223200368c187b6c5552f1f6eeb
swarm_commits: 5
swarm_head_before: 0edd156617441c53ea02347335b2956f4451b254
swarm_head_after: 4793e2e3fed2838c6af42ea5844f4c26c652cf31
---

# Phase 39 Plan 05: Production OpenBao deploy, seal rotation and maintenance Summary

**OpenBao 2.7.1 runs in production on micro as its own `vault` stack. The bootstrap root is revoked, the static seal is
rotated g1 -> g2 with both generations restore-rehearsed, and the daily two-node backup, TLS renewal, audit rotation
and deduplicated Slack incidents run unattended. Traefik, the thinx stacks, thinx_api and the legacy ports are
unchanged.**

`actuals.tokens` is chars/4 over the realized diff (parent added lines plus thinx-swarm changed lines), measured
before this SUMMARY. Most of the plan's cost was live operation and verification, not diff, so it sits far below the
76k estimate.

## Tasks

| Task | Type | Result | Commits |
|---|---|---|---|
| 1. Own-stack deploy and bootstrap to revoked root | tracer | Done; tracer gate re-ran `verify --full` + edge gate, passed | swarm `ea70ce8`, `d95e1c7`; parent `87671ded`, `bc1de47d`, `21031c0b` |
| 2. g1 -> g2 seal rotation and both-generation restores | auto (+ 2 operator checkpoints) | Done; runtime on seal-g2 alone | swarm `46d15ca`, `5d4f532`, `4793e2e`; parent `cd3fb8c6`, `966702de`, `3f1f7d92` |
| 3. Maintenance: backup, TLS, audit, incidents | auto | Done | parent `9432d809`, `e6c05c98` |

The parent repo commits are runbook evidence only. The source changes are in thinx-swarm, on origin `master` and on
micro's checkout at `4793e2e` (laptop = origin = micro).

## What is live (2026-10-18 ~19:16Z)

- `vault_openbao` healthy, unsealed, active node; `Auto Seal: static (current_key_id seal-g2)`; Raft on micro only.
  The micro seal dir holds only `seal-g2.key`; core has no seal material.
- Bootstrap: init 15:48:52Z, configured 17:39:12Z, operator (userpass, 4 h hard cap) 17:39:17Z, root revoked
  17:39:26Z (403 on reuse), complete 17:39:36Z. Custody of seal-g1, seal-g2, recovery share, CA key and CA cert is
  confirmed in the ledger.
- Snapshots: 10 identical pairs on micro and core (newest `openbao-20261018T191442Z-pre-change`). The final g2-only
  post-change snapshot is `openbao-20261018T191008Z-post-change`.
- TLS: `current -> r20261018T191355Z` (renewed live in Task 3, fp f412526a359b03a6, notAfter 2027-01-16); issuer
  automation is fail-closed until Plan 06 arms the API trust consumer.
- Cron: `openbao-backup.sh --daily` at 03:17 UTC and `openbao-cert-renew.sh --daily` at 04:47 UTC (node-local
  copies); `/etc/logrotate.d/openbao`; no restore schedule. Incidents backup, cert-renew and audit are all healthy.
- `BAO_ROLE_ID` / `BAO_SECRET_ID` swarm secrets exist, attached to nothing (Plan 06).
- Edge: `EDGE-EXPOSURE-OK`, Traefik inventory `fa0afd608550e585` (29 routers, 0 errors); thinx_api spec
  `e3d388a3c43f0342` and traefik_traefik `efeabd4953d5ca2c` unchanged from the pre-state; 23 services (22 + vault);
  7442/1883/8883 open from the laptop; rtm.thinx.cloud 200.

## Seal rotation and restore evidence (Task 2)

1. S1 `openbao-20261018T174406Z-pre-change` (g1) prepared with a canary. `seal-g2.key` created exclusively on micro.
   Mismatches: S1 offered as g2 -> `GENERATION_MISMATCH` refused (no key byte read); S1 with g2 bytes under the g1
   name -> `SEAL_MISMATCH` (stays sealed).
2. Operator checkpoint 1 (re-checked by the agent on micro): seal-g2 custody confirmed (18:07:37Z); archive
   verifies with g1 and g2; privileged `verify --full` on g1; S1 rehearsal with seal-g1 recovered from the archive
   -> `result=ok` (18:09:31Z).
3. Overlap config `5d4f532` installed. The 18:34:55Z restart auto-unsealed on g2 with g1 previous, and
   `core.autoseal` rewrapped the recovery key and stored keys under g2. S2 `openbao-20261018T183718Z-pre-change`
   (g2, previous g1) prepared; S2 offered without the previous generation -> `PREVIOUS_GENERATION_MISMATCH` refused.
4. Operator checkpoint 2 (re-checked): privileged `verify --full` on g2 (18:41:17Z); S2 rehearsal with seal-g2 from
   the archive and seal-g1 from micro -> `result=ok` (18:42:26Z); matrix g1,g2 OK with 3 mismatch records.
5. Retirement `4793e2e`: the 19:03:59Z restart on g2 alone, with seal-g1.key still on disk, unsealed. The key was then
   `shred -u` on micro (custody in the archive, never on core), and a second restart at 19:09:03Z also unsealed.
   `verify --full --expect-seal-generation g2 --expect-no-runtime-generation g1` OK (`RETIRED_GENERATION_ABSENT
   ok`); `--verify-recorded-matrix` OK.
6. Every manifest and rehearsal record carries both restore limitations: auth-state rewind, and later Transit
   versions not decryptable. The Transit key rotation and deploy-key rewrap were not done; they are Phase 41.

## Maintenance evidence (Task 3)

- `openbao-maintenance-install.sh --full --send-test-alert` at 19:11:08Z. The webhook was copied on micro from the
  local thinx_api task's secret file and never shown. **Slack receipt (operator-observed, 2026-10-18; test sent
  19:11:08Z):** "THiNX OpenBao: maintenance alerts configured on micro (test message; one alert per incident from now
  on)."
- Retention and backlog, live, with two marked dummy pairs:
  - `--verify-both-nodes` flagged `VERIFY_BACKLOG` (2).
  - A real `--daily` replicated the backlog first and pruned the 90 d + 7 h dummy on both nodes, keeping the
    89 d + 19 h one.
  - The kept dummy was then removed from both nodes by hand.
- Audit:
  - A forced logrotate produced a new 0600 file; the postrotate reopen was proven by a canary (HMAC-redacted).
  - With the audit path made unwritable, OpenBao refused requests (`AUDIT_REQUEST_BLOCKED`) for about 7 s while
    staying unsealed. After the repair, the reopen recovered.
  - One begin and one recovery incident alert were sent.
- Backup incident (backup role-id renamed): two failed `--daily` runs in separate processes gave `begin` then
  `suppressed`. After restoring the file, a successful run gave one `recovery`.
- Certificate incident (CA key renamed): two failed `--daily` runs gave `begin` then `suppressed`. After restoring
  the key (mode, owner and size unchanged), `NOTHING_DUE` gave one `recovery`.
- Live leaf renewal: the exact-image throwaway reload rehearsal passed, then the live switch + SIGHUP; the served
  leaf is pinned and trusted, a wrong name is refused, and the previous leaf directory is kept.
- A2 issuer: the overlap bundle, both-side rollback, expired-predecessor clients and the other-node probe pass in
  `tests/openbao-maintenance.test.sh all` (32), tests 19–23. Live issuer automation stays disarmed until Plan 06.
- Initial rehearsal of the g2-only state: S3 `openbao-20261018T191442Z-pre-change` restored on seal-g2 alone with the
  canary proven, `result=partial` (no operator password needed). The next rehearsal is due before the next OpenBao
  upgrade (`prepare --pre-upgrade`, with the operator password).
- Gate: `--verify-both-nodes && --verify-current && openbao-verify.sh --maintenance` OK; `nc` 7442/1883/8883 open.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `findmnt -T` on not-yet-created paths**
- **Found during:** Task 1 (first live install)
- **Issue:** `obc_fstype` returned `unknown` for paths that do not exist yet. The installer then refused every new
  directory (PATH_NOT_LOCAL / PATH_NOT_TMPFS); nothing was changed.
- **Fix:** resolve the nearest existing ancestor before `findmnt`; fixture suites still pass.
- **Files modified:** `../../thinx-swarm/scripts/openbao-common.sh`
- **Commit:** swarm `ea70ce8`

**2. [Rule 1 - Bug] Bootstrap not resumable after the irreversible root revocation**
- **Found during:** Task 1 (review before the operator run)
- **Issue:** a failure after `ROOT_REVOKED` (for example the post-revocation backup) left the bootstrap wedged with
  ROOT_TOKEN_UNAVAILABLE.
- **Fix:** `step_revoke` and `cmd_run` resume after `root_revoked_at`. New test case 10 (stubbed backup failure,
  then a password-less rerun completes); the suite runs 60/60, and the old code fails case 10.
- **Files modified:** `../../thinx-swarm/scripts/openbao-bootstrap.sh`, `../../thinx-swarm/tests/openbao-bootstrap.test.sh`
- **Commit:** swarm `d95e1c7`

**3. [Rule 3 - Blocking] Fixture suites coupled to the live seal generation**
- **Found during:** Task 2 (before committing the overlap config)
- **Issue:** the bootstrap and maintenance suites stage only seal-g1 but copied the committed vault.conf, so the g2
  config failed `SEAL_GENERATION_MISSING seal-g2.key`.
- **Fix:** those suites install a first-deploy (g1-only) form of vault.conf, byte-identical to the former g1 config.
  The exact-image suite keeps the committed file and stages a key for every generation it names. All three pass
  (60/32/136) on both the overlap and the g2-only config.
- **Files modified:** `../../thinx-swarm/tests/openbao-{bootstrap,maintenance,exact-image}.test.sh`
- **Commit:** swarm `46d15ca`

### Incidents during execution (no plan change)

- **fail2ban ban of micro on core (Task 1).** At 14:17:33Z core's `sshd` jail banned 10.133.0.2 after pre-auth
  keyscans from the preflight/installer, giving `TRANSFER_UNREACHABLE`. No fail2ban change was made by this executor;
  the rollout waited out the 1 h ban. **Follow-up (operator decision, made by the orchestrator, not by this
  executor):** at 2026-10-18T17:41:20Z `10.133.0.2` was added to the `[DEFAULT] ignoreip` line of core's
  `/etc/fail2ban/jail.local`. `[sshd]` has no `ignoreip` of its own and inherits `[DEFAULT]`, so the entry also
  covers `recidive`. Backup `/etc/fail2ban/jail.local.bak-20261018T174120Z` (0600); `fail2ban-client -t` passed;
  reload, not restart.
- **Edge blip from the thinx-swarm CI (Task 2).** The `git push origin master` at about 18:34Z triggered thinx-swarm's
  CircleCI error/downtime-page build. Swarmpit autoredeployed `errorpage_errorpage` / `downtime_downtime` around
  18:35:55Z, and `thinx-db-https` / `thinx-influx-https` were disabled (`errorpage@swarm does not exist`) for under a
  minute. This is the transient documented in AGENTS.md; it recovered without action. The next push waited for the
  redeploy before the edge gate.

## Auth gates

None. The human steps were planned operator checkpoints: Task 1 custody and the bootstrap password; Task 2
checkpoints 1 and 2 (archive recover + operator password). Each was run by the operator as a scratchpad script and
re-checked by the agent on micro. No secret reached the agent, chat, argv, a log or a repository.

## Verification gaps / human judgment

- The privileged part of `verify --full` (needs the operator password) last ran at 18:41:17Z on g2 with g1 previous,
  not after the g1 retirement. The unprivileged `--full` passed after retirement. The next privileged run is part of
  Plan 06 or the pre-upgrade rehearsal.
- The Slack begin/recovery messages for the three test incidents (audit 19:13:08Z / 19:13:13Z, backup 19:13:22Z /
  19:13:29Z, cert-renew 19:13:40Z / 19:13:43Z) were delivered per the incident state. The operator confirms receipt at
  the end of the phase. The configuration test message is already confirmed.
- The legacy Vault tree metadata digest was not re-measured after Task 1. No Task 2/3 step touches those trees, and
  every install run reported `LEGACY_PRESERVED` (not read, not migrated, not deleted).

## Known Stubs

None. The disarmed API trust consumer is intentional: Plan 06 attaches the first CA config and runs `--arm-api-trust`.

## Threat Flags

None beyond the plan's threat model. No new network endpoint, port or router exists. The new maintenance credential
(`slack-webhook.curl`, 0600 root) is the planned one.

## Self-Check: PASSED

- Files: runbook and this SUMMARY present.
- Commits: 8 parent (0e63babe..e6c05c98) and 5 thinx-swarm (0edd156..4793e2e) all reachable, all signed (G); swarm commits on origin/master and on micro.
- vault.conf at 4793e2e names seal-g2 as the only key id.
