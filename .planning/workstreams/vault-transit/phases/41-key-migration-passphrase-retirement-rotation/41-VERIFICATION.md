---
phase: 41-key-migration-passphrase-retirement-rotation
verified: 2026-10-20T20:25:00Z
status: human_needed
score: 13/13 must-haves verified
covered_files:
  - ".planning/runbooks/openbao.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-01-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-01-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-02-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-02-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-03-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-03-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-04-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-04-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-05-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-05-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-06-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-06-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-07-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-07-SUMMARY.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-08-PLAN.md"
  - ".planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-08-SUMMARY.md"
  - "Dockerfile"
  - "Dockerfile.test"
  - "docker-compose.test.yml"
  - "docker-compose.yml"
  - "docker-swarm.yml"
  - "lib/thinx/git.js"
  - "lib/thinx/rsakey.js"
  - "lib/thinx/transit.js"
  - "scripts/migrate-deploy-keys.js"
  - "scripts/openbao-dev.sh"
  - "scripts/purge-orphaned-rsa-keys.js"
  - "spec/fixtures/fake-transit.js"
  - "spec/fixtures/mock-openbao.js"
  - "spec/jasmine/03-RsakeySpec.js"
  - "spec/jasmine/GitSpec.js"
  - "spec/jasmine/KeyFormatSpec.js"
  - "spec/jasmine/MigrateDeployKeysSpec.js"
  - "spec/jasmine/PassphraseRetiredSpec.js"
  - "spec/jasmine/SecretsSweepSpec.js"
  - "spec/jasmine/TransitIntegrationSpec.js"
  - "spec/jasmine/TransitRotationSpec.js"
  - "spec/jasmine/TransitSpec.js"
  - "spec/node/DeployKeyNames.test.js"
covered_digest: "v3:sha256:c22cbc0aaa4f78cf0d9213741fb6f4ee3d4624d2da064b62a44dce444147554c"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Resolve the 26 judgment-tier prohibitions of plans 41-01..41-08 (all `verification: judgment`, `flagged: true`). The verifier's non-authoritative verdicts and notes are in the report section 'Prohibitions'. None was found violated; three carry notes (41-02 stray report file, 41-06 operator-token handling, 41-08 operator rm -rf instead of shred)."
    expected: "The operator accepts each verdict, or names the prohibition they consider violated."
    why_human: "Judgment-tier prohibitions have no wired test-tier enforcement. They need explicit human resolution and are never passed silently."
---

# Phase 41: Key Migration, Passphrase Retirement & Rotation: Verification Report

**Phase Goal:** Every stored deploy key is Transit ciphertext at the latest key version, and the static passphrase no longer exists anywhere. The key files alone decrypt nothing.
**Verified:** 2026-10-20T20:25:00Z
**Status:** human_needed (all 13 truths verified; only the judgment-tier prohibition review remains)
**Re-verification:** No, this is the initial verification.

## Method

This verification does not take the SUMMARY claims as evidence. Each truth was checked against at least one of these:
1. The code at HEAD `5fdd3d40`. `git diff 8bc53a75..HEAD -- ':!.planning'` is empty, so the code is what CircleCI test #16170 ran.
2. thinx-swarm `48581e9`.
3. Specs run locally:
   - PassphraseRetiredSpec: 4/0.
   - TransitSpec: 39/0, and 12/0 with the D13/W/IN10 filter.
   - DeployKeyNames under `node --test`.
   - Wiring gate `--source`: API-WIRING-OK, with PASSPHRASE_ABSENT ok for both files.
   - Wiring gate `--self-test`: 18/18 mutations refused.
4. Read-only ssh checks on micro, run during this verification (20:20Z). They printed names, counts, modes and verdict lines only.
5. The sanitized runbook evidence in `.planning/runbooks/openbao.md` (Plan 41-02..41-08 entries). It holds 0 ciphertext shapes and 0 PEM headers.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: `--dry-run` reports counts and writes nothing; the real run reports migrated / already-transit / failed; a second run reports 0 migrated / 0 failed (zero legacy keys); pre-migration copies sit root-only, off GlusterFS | ✓ VERIFIED | Runbook 41-02 Task 1: dry-run reported writes 0, transit_requests 0, aborted null. Task 3: migrated 76, already_transit 1, quarantined 0, failed 0. Re-run: migrated 0, failed 0, legacy_total 0. D-05 tar: `/root/thinx-backups` 700, tar and sha256 600, ext4 `/dev/vda1`, not in the cron backup. Dry-run/migrate code existed at `f6c93032` (ancestor of the deployed `5d972067`). Live today: in-task `--report` gives legacy_total 0, unknown 0, unreadable 0. Note: the "copies sit" wording is now superseded by the locked D-06 shred (see truth 11). |
| 2 | ROADMAP SC2 (repo): `GIT_KEY_PASSPHRASE` and the legacy read path are gone from code, Dockerfiles, compose files, `thinx.yml` and `docker-swarm.yml` | ✓ VERIFIED | `git grep -l GIT_KEY_PASSPHRASE -- ':!.planning' ':!spec'` matches nothing. Every hit under `spec/` is a negative assertion (GitSpec env scrub, SecretsSweepSpec "has no passphrase reader", PassphraseRetiredSpec token list). `git.js` has none of sshEnv, create_askfile, delete_askfile, the askpass SSH command or the readSecret import. `rsakey.js` has no keyPassphrase. thinx-swarm `thinx.yml` count is 0, and only the gate scripts name the variable. PassphraseRetiredSpec ran 4/0 locally, and CI runs it every time. |
| 3 | ROADMAP SC2 (live): not in the `thinx_api` spec (secret or env), not in `.PreviousSpec`, not in `docker secret ls`; no `*.sh` askpass file in `ssh_keys` | ✓ VERIFIED | Live, 20:20Z: `docker secret ls` 0. Spec and PreviousSpec secret names are 12 each, without it, and the env-key count is 0 in both. Across all 23 services, none has it as a secret or env key. `ssh_keys` holds 0 `*.sh` files. The orchestrator confirmed the `.env*` sweep: 0 lines. |
| 4 | ROADMAP SC2: CI is green, and keyed builds for migrated owners still succeed | ✓ VERIFIED | CI: thinx-unit test #16167, then thinx-staging test #16170 and api-registry #16171 on `8bc53a75` (orchestrator-confirmed). Nothing outside `.planning` changed since. Keyed fetch: `FETCH_CHECK ok=true ... transit=5 legacy=0` for owner `test`, recorded in 41-02, 41-05, 41-06, 41-07 (twice) and 41-08. Console build `f9a73980` (operator, verbatim): "git fetched correctly". The make-target failure after it is outside KEYMIG. |
| 5 | ROADMAP SC3: every key file carries the latest `vault:vN:` prefix | ✓ VERIFIED | Live, 20:20Z: 77 private files, 77 starting with exactly `vault:v2:`, 0 not mode 600, 77 `.pub`, 154 entries, 0 tmp. In-task `--report` gives `{"v2":77}`. Latest = 2: the 41-07 rewrap learned `latest v2` from an AppRole encrypt, and the operator read back `latest_version=2`. |
| 6 | ROADMAP SC3: `min_decryption_version` equals N | ✓ VERIFIED | Operator read-back, verbatim: `raised min_decryption_version=2 latest_version=2`. The live behaviour bounds it on both sides. The v1 canary is refused (min ≥ 2, 41-07 Task 3 and the 41-08 final gate), and the v2 keys decrypt (FETCH_CHECK ok after the raise, so min ≤ 2). |
| 7 | ROADMAP SC3: OpenBao refuses an older-version ciphertext, and a keyed build still succeeds | ✓ VERIFIED | `CANARY result=retired_version version=v1` came through the production client at 19:11:21Z and again in the 41-08 final gate. FETCH_CHECK ok came after the raise. Behaviour test: TransitRotationSpec (R1) runs rotate, rewrap, raise and refuse against OpenBao 2.7.1, and under `CIRCLECI=true` it fails rather than pending when unwired. `docker-compose.test.yml` wires `BAO_ADDR`, `BAO_DEV_ADMIN_TOKEN` and `CIRCLECI`, so green CI #16170 means it passed. |
| 8 | Goal: the key files alone decrypt nothing | ✓ VERIFIED | Live: 0 files in `ssh_keys` carry a `BEGIN … PRIVATE KEY` header, and 77/77 are Transit ciphertext. The passphrase is gone from every live surface (truth 3). `thinx-deploy-keys` stays `exportable=false` and `allow_plaintext_backup=false` (unchanged per the 41-06 operator read-back). |
| 9 | Goal: the static passphrase no longer exists anywhere (in phase scope) | ✓ VERIFIED | Repo (truth 2) and live swarm (truth 3). Micro: `/root/thinx-backups` absent, `/root/thinx-swarm-backup-untracked` absent, and the `/var/lib/openbao-maintenance` rollback dir holds only the sanitized `thinx-api-pre-openbao-*.json` (600 root). The only remaining files there that *name* the variable are below; none holds an assignment. Accepted residuals (REQUIREMENTS Out of Scope, 2026-10-09): DO snapshots, pre-migration Gluster backups, best-effort shred on journaled ext4, and the operator's `rm -rf` of the `.env.bak*` copies (no overwrite). |
| 10 | D-09 / KEYMIG-02: a legacy PEM file found after removal is skipped with `legacy_format_unsupported`. It gets no attempt and no alert, and is never deleted. | ✓ VERIFIED | `git.js:811`: `cause = (key.kind === "legacy") ? "legacy_format_unsupported" : key.cause`. It is logged only, with no Transit call and no fs write. Behaviour: GitSpec D9a/D9b/T4/T8 and DeployKeyNames KS5, in CI #16170. The live task's `--dry-run` exits 2 (the legacy migration is retired). |
| 11 | D-05/D-06: the pre-migration tar was kept off Gluster until Phase 41 was verified live, then shredded, with the shred recorded | ✓ VERIFIED | Runbook 41-02 Task 3 records the custody, and 41-08 Task 3 records `D-06 option: shred-all`. That shred covered `shred -u` of the tar, its sha256 and the canary (20:06:13Z), four spec backups, and the baseline sanitized in place. Live: `/root/thinx-backups` absent. |
| 12 | D-13 / IN-05, IN-10, T-40-12: `retired_version` and `key_missing` are their own classes, matched by exact equality and never logged as text. A login `server_error` counts as service-down, and non-coded errors log `attempt_error`. Live before the rotation. | ✓ VERIFIED | `transit.js:245-246` (`errorsInclude`, strict equality), the `_retired()` one-shot latch, and `git.js` `SERVICE_DOWN_REASONS` with `serviceDownFor`. The `attempt_error` line is at `git.js:767`. TransitSpec D13a-d, A5, C1 and IN10a pass locally. Live in-task, 20:20Z: `REASONS 9 true true keyPassphrase undefined sshEnv undefined`. REMOVAL_LIVE was recorded in 41-05 (15:3xZ), before the 18:4xZ rotation. |
| 13 | D-11/D-12: the rewrap ran through the AppRole (policy not widened); the operator did rotate and raise; runbook section 12 holds the repeatable recipe | ✓ VERIFIED | `rewrapKey` sends `transit/rewrap/` through the same AppRole. No policy or HCL line changed in the phase diff, and package.json/lock are unchanged. Runbook section 12 has preconditions, canary, snapshots, operator rotate, rewrap twice, D14 gate, raise, refusal proof, rollback and alerts. Rotation is operator-only, verbatim: `rotated latest_version=2 min_decryption_version=1`. |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/migrate-deploy-keys.js` | report, rewrap, canary and fetch-check modes; legacy modes retired | ✓ VERIFIED | 673 lines; contains `keymig.tmp` and `legacy migration retired`; exports rewrap, canaryCheck, fetchCheck. Run live in the task (`--report`; `--dry-run` exit 2). |
| `lib/thinx/transit.js` | `rewrapKey`, `retired_version`, `key_missing`, op-tagged errors | ✓ VERIFIED | `transit/rewrap/` at lines 8 and 401; nine REASONS; the latch. Used by the script and git.js. |
| `lib/thinx/git.js` | Transit-only fetch, D-09 skip, IN-10, `attempt_error` | ✓ VERIFIED | `legacy_format_unsupported` and `attempt_error` present; `PASSPHRASE_NAME` env scrub in `baseEnv`. |
| `lib/thinx/rsakey.js` | no `keyPassphrase`, no `readSecret` | ✓ VERIFIED | Absent in source and in the live image (`typeof` undefined). |
| `spec/jasmine/PassphraseRetiredSpec.js` | static gate in every CI jasmine run, covering docker-swarm.yml | ✓ VERIFIED | Contains `historic_literal` and `readdirSync`; `docker-swarm.yml` in the set; 4/0 locally. |
| `spec/jasmine/TransitRotationSpec.js` | rotate, rewrap, raise and refuse on the dev server | ✓ VERIFIED | Contains `min_decryption_version`; R1/R2; fails (not pending) under CI. |
| `spec/jasmine/MigrateDeployKeysSpec.js`, `spec/fixtures/fake-transit.js`, `spec/fixtures/mock-openbao.js` | spec plus versioned fake and rewrap route | ✓ VERIFIED | `fetchCheck`, `rewrapKey` and `/v1/transit/rewrap/thinx-deploy-keys` present. |
| `docker-compose.test.yml` | `BAO_DEV_ADMIN_TOKEN` on the test api only | ✓ VERIFIED | Count 1. Absent from docker-swarm.yml and thinx.yml. Not named BAO_TOKEN (the pre-existing `BAO_TOKEN` at line 334 is the Phase 40 `openbao-setup` service). |
| `docker-swarm.yml` (parent mirror) | no passphrase, BAO_SECRET_ID present | ✓ VERIFIED | Count 0. |
| thinx-swarm `thinx.yml`, `tests/openbao-api-wiring.test.sh`, `scripts/openbao-verify.sh` (`48581e9`) | absence asserted at source and live | ✓ VERIFIED | `48581e9` is on origin/master and is the micro checkout HEAD (0 dirty lines). The installed `/usr/local/sbin/openbao-verify.sh` is byte-identical. `--source` and `--self-test` pass. |
| `.planning/runbooks/openbao.md` | Plan 41-02..41-08 evidence, section 11 after the removal, section 12 recipe | ✓ VERIFIED | All 11 dated entries present: D10_GATE, D14_GATE, `CANARY result=retired_version`, `D-06 option: shred-all`. 0 ciphertext shapes, 0 PEM. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `migrate-deploy-keys.js rewrap()` | `transit.js rewrapKey()` | `Transit.shared()` in the CLI | ✓ WIRED | Exercised live: 77 rewrapped, then 0. |
| `migrate-deploy-keys.js fetchCheck()` | `git.js fetchDetailed()` | `new Git(null)` | ✓ WIRED | Live FETCH_CHECK lines in 6 entries. |
| `git.js fetchHoldingLock()` | `keyformat.readKey()` → D-09 skip | `kind === "legacy"` | ✓ WIRED | `git.js:801-812`. |
| `transit.js _classify()` | OpenBao 400 `errors` array | `errorsInclude` with ERR_TOO_OLD / ERR_KEY_NOT_FOUND | ✓ WIRED | Live refusal surfaced as `retired_version`, not `bad_ciphertext`. |
| `git.js transitAttempt()` | `TransitError.op` | `serviceDownFor` (`op === "login"`) | ✓ WIRED | `git.js:36-39, 747`. |
| PassphraseRetiredSpec | lib/, scripts/, Dockerfiles, compose, docker-swarm.yml | fs walk | ✓ WIRED | Runs under `spec/support/jasmine.json` (`jasmine/*[sS]pec.js`). |
| thinx-swarm origin/master | micro `/mnt/gluster/deployment/swarm` | push + ff-merge | ✓ WIRED | HEAD `48581e9`, clean. |
| `docker service update --secret-rm/--env-rm` | `thinx_api` `.Spec` / `.PreviousSpec` | one targeted update plus one `--force` | ✓ WIRED | Live: neither holds the secret or env key. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
|----------|------|--------|--------------------|--------|
| `ssh_keys` key files | private-key blob | OpenBao Transit `encrypt` / `rewrap` (AppRole) | Yes: 77/77 `vault:v2:` on the live volume | ✓ FLOWING |
| keyed fetch | decrypted PEM | `transit.decryptKey`, then the per-attempt `ssh-agent` | Yes: live FETCH_CHECK ok and the console build fetched | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Static retirement gate | `npx jasmine --config=/dev/null spec/jasmine/PassphraseRetiredSpec.js` | 4 specs, 0 failures | ✓ PASS |
| D-13 classes, rewrap client | `npx jasmine --config=/dev/null spec/jasmine/TransitSpec.js` (and filter D13/W/IN10) | 39/0, 12/0 | ✓ PASS |
| Swarm source gate | `bash tests/openbao-api-wiring.test.sh --source thinx.yml <parent>/docker-swarm.yml` | PASSPHRASE_ABSENT ok x2, API-WIRING-OK | ✓ PASS |
| Gate mutation self-test | `bash tests/openbao-api-wiring.test.sh --self-test` | 18/18 refused | ✓ PASS (see WR-06: weak for the passphrase cases) |
| Live key-file state | ssh: head -c 9, stat, grep PEM on `ssh_keys` | 77/77 `vault:v2:`, 0 not 600, 0 PEM, 0 `*.sh` | ✓ PASS |
| Live in-task report | `docker exec … migrate-deploy-keys.js --report --json` | `{"v2":77}`, legacy 0, unknown 0, unreadable 0 | ✓ PASS |
| D-13 live in image | `docker exec … node -e` (REASONS, typeof) | `REASONS 9 true true keyPassphrase undefined sshEnv undefined` | ✓ PASS |
| Legacy modes retired live | `docker exec … --dry-run` | exit 2 | ✓ PASS |
| Live absence (secret/spec/services) | ssh: `docker secret ls`, Go-template name checks | 0 everywhere, 23 services scanned | ✓ PASS |
| GitSpec D9 cases | jasmine (needs CI config) | not runnable locally; covered by CI #16170 | ? SKIP (CI evidence) |
| TransitRotationSpec R1 | needs the OpenBao dev server | covered by CI #16170 (fails rather than pending in CI) | ? SKIP (CI evidence) |

Not re-run by design: `--fetch-check`, `--rewrap` and `--canary-*` (each makes Transit requests or temp writes), and anything that needs the operator token. The orchestrator ran the full `node --test` set: 119/119.

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exist, and no PLAN declares one.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| KEYMIG-01 | 41-01, 41-02, 41-08 | Idempotent migration with `--dry-run`, counts, pre-migration copies off GlusterFS | ✓ SATISFIED | Truths 1, 8, 11 |
| KEYMIG-02 | 41-03, 41-04, 41-05, 41-06, 41-08 | Legacy path and `GIT_KEY_PASSPHRASE` removed from code, swarm secrets, `thinx.yml`, `docker-swarm.yml`, compose files, Dockerfile; askpass files purged | ✓ SATISFIED | Truths 2, 3, 9, 10 |
| KEYMIG-03 | 41-01, 41-03, 41-06, 41-07, 41-08 | Rotate, rewrap to the latest version, raise `min_decryption_version` | ✓ SATISFIED | Truths 5, 6, 7, 12, 13 |

REQUIREMENTS.md maps exactly KEYMIG-01..03 to Phase 41, and every one is claimed by a plan, so no requirement is orphaned. KEYMIG-04 (PwnDoc retest) is a Future Requirement, not mapped to this phase.

### Prohibitions (judgment-tier; non-authoritative verifier verdicts, human resolution required)

| Plan | Prohibition (short) | Verifier verdict | Notes |
|------|---------------------|------------------|-------|
| 41-01 | No plaintext key outside memory and the per-run 0700 tmpfs scratch | not violated | At `f6c93032` the conversion copy went to a `/dev/shm` mkdtemp, was overwritten and was `rmSync`'d in finally; buffers `fill(0)`. The code is gone since 41-04. |
| 41-01 | No PEM, passphrase, ciphertext, error text, token or path in output | not violated | 41-REVIEW confirms reports carry ids, timestamps, classes and counts only. |
| 41-01 | No AppRole widening, package, admin endpoint or push | not violated | package.json/lock diff empty; no policy lines changed. |
| 41-02 | No purge/migrate before tar plus decision; the tar never left micro | not violated | Tar 12:33:59Z, then purge, then `--migrate` 12:46:33Z; operator "go" first. |
| 41-02 | No env dump, key, token or ciphertext printed | not violated (note) | The `--migrate` report went to a stray host file `/dev/null.tmp` (644, counts only, no owner id) and was removed. No secret content. |
| 41-02 | No stack deploy / service update; 7442 and plain MQTT untouched | not violated | The runbook records none; ports re-checked. |
| 41-02 | No main, tag or v1.18 release | not violated | `origin/main` contains no phase commit; no tag contains one. |
| 41-03 | No OpenBao error text or ciphertext in logs or Slack | not violated | `_logFailure` logs op, reason and status only; the Slack text is a fixed sentence. |
| 41-03 | No AppRole widening; dev admin token not named BAO_TOKEN, not in swarm files | not violated | `BAO_DEV_ADMIN_TOKEN` only in the test compose, `openbao-dev.sh` and the spec. |
| 41-03 | No push | not violated | Shipped in the 41-05 removal push. |
| 41-04 | API never deletes, rewrites or alerts on a legacy file | not violated | The D-09 branch only logs. |
| 41-04 | No push | not violated | Shipped in 41-05. |
| 41-05 | No thinx-swarm push or live change in 41-05 | not violated | `48581e9` was pushed at 18:18Z in 41-06. |
| 41-05 | Unrelated thinx-swarm changes not committed | not violated | `48581e9` touches exactly 3 files; `landing`, `scripts/openbao-recovery-archive.sh` and `docs/` are still uncommitted locally. |
| 41-05 | Privacy; 7442; no main/tag | not violated | |
| 41-06 | No stack deploy, restart.sh or in-place checkout edit | not violated | Push + ff-merge; micro checkout clean at `48581e9`. |
| 41-06 | No passphrase, env value, canary or ciphertext printed | not violated (note) | The `.env` sweep found two `.env.bak*` copies. They were *moved* to `/root` (41-08 corrected the "deleted" record), then removed by the operator in 41-08. No value was printed. |
| 41-06 | No AppRole widening, no inherited BAO_TOKEN, no trim or key-flag change | not violated (note) | `bao login` printed an operator token to the operator's own terminal (read-only container FS). One attempt used `export BAO_TOKEN=$(bao login …)`, which is set explicitly, not inherited. Up to two operator tokens may stay valid until at most 22:48Z today (4 h TTL). The operator knows. |
| 41-06 | 7442 and plain MQTT kept | not violated | Ports re-checked after both restarts. |
| 41-07 | No raise before D14_GATE; never above latest | not violated | D14_GATE 18:53Z, raise 18:53-19:11Z, min = latest = 2. |
| 41-07 | Refusal proven only with the junk canary; nothing printed | not violated | The v1 canary was 32 random bytes; only verdict lines were printed. |
| 41-07 | No AppRole widening or trim; exactly one config write | not violated | Operator statement; rollback still possible (no trim). |
| 41-08 | No shred before the Task 2 decision; nothing outside the inventory | not violated (note) | Decision 20:01-20:05Z, shred 20:06Z. The executor touched only inventoried files. The operator removed `/root/thinx-swarm-backup-untracked/` with `rm -rf` (raised at the checkpoint, not shredded). |
| 41-08 | No Gluster backup or DO snapshot destroyed | not violated | None recorded. |
| 41-08 | No content of a backup, spec backup or canary printed | not violated | Inventory by basename, mode and count. |
| 41-08 | No main, tag or v1.18 release | not violated | Verified (see 41-02 row). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff, both repos) | – | TBD / FIXME / XXX / TODO / HACK added | none found | Debt-marker gate clean |
| `scripts/migrate-deploy-keys.js` | 253-265 | WR-01: the temp write is not checked for a short write and not read back before the rename; no directory fsync | ⚠️ Warning | Affects future rotations (runbook section 12); this rotation's result is verified on disk (77/77 `vault:v2:`, decrypt and fetch ok) |
| `scripts/migrate-deploy-keys.js` | 166-168, 501-504 | WR-02: `--rewrap` exits 0 while unreadable or changed-mid-run files stay below latest | ⚠️ Warning | Section 12 gates the raise on exit 0 plus the version map; this run had unreadable 0 and changed_during_run 0 |
| `scripts/migrate-deploy-keys.js` | 77-78 | WR-03: `ABORT_CLASSES` lacks `key_missing` and login `server_error` | ⚠️ Warning | Future rotations only |
| `lib/thinx/git.js` | 786-815 | WR-04: an owner whose keys are all skipped gets no keyless attempt and `keyUnavailable: null` | ⚠️ Warning | No live owner affected today: 0 legacy, 0 unknown, 0 unreadable, all v2. It bites on a restored legacy file or a missed rewrap. |
| thinx-swarm `tests/openbao-api-wiring.test.sh` | 100-106, 176-186 | WR-05/WR-06: the source PASSPHRASE_ABSENT check misses aliased secrets, `env_file` and other services, and the self-test cases do not isolate it | ⚠️ Warning | BASELINE_UNCHANGED covers it today. The live gates (`--live` flags 6/8, `API_PASSPHRASE_ABSENT`) are not affected. I checked all 23 live services: 0 hits. |
| micro `/var/lib/openbao-maintenance/log/openbao-verify.log` | – | names `GIT_KEY_PASSPHRASE` 10 times | ℹ️ Info | Historic `API_SECRET_MOUNTED ok GIT_KEY_PASSPHRASE at …` and `API_PASSPHRASE_ABSENT` verdict lines; 0 `GIT_KEY_PASSPHRASE=` assignments, so no value |
| micro `/root/thinx.yml.bak-20260925`, `/root/.local/share/nano/search_history` | – | name the variable | ℹ️ Info | The .bak file holds a `${…}` reference only (41-08 rescan). The nano history has 1 line with the name; the verifier did not open it. |

All 6 review warnings are `open` in 41-REVIEW-DISPOSITION.md. None stops the phase goal on today's state. All of them affect the next rotation or later regressions. They are candidates for a follow-up quick task before runbook section 12 is used again.

### Human Verification Required

#### 1. Judgment-tier prohibitions (26 across plans 41-01..41-08)

**Test:** Review the "Prohibitions" table above.
**Expected:** Accept each non-authoritative verdict, or name the prohibition you consider violated. Three rows carry notes worth a look:
- 41-02: the stray report file.
- 41-06: the operator-token handling. Up to two tokens may still be valid until at most 22:48Z today.
- 41-08: `rm -rf` instead of `shred`.

**Why human:** Judgment-tier prohibitions have no wired test enforcement. They need explicit resolution and are never passed silently.

The live operator actions are already recorded with verbatim replies and treated as completed human verification:
- the 41-02 "go";
- the 41-05 "go";
- the 41-06 rotation (`rotated latest_version=2 min_decryption_version=1`);
- the 41-07 raise (`raised min_decryption_version=2 latest_version=2`);
- the 41-07 console build (`… but git fetched correctly`);
- the 41-08 `shread-all`.

The 41-02 D5 human-check (console build of device Flood) is superseded by the 41-07 console build, which fetched the private repository with a v2 key.

### Gaps Summary

None. All three ROADMAP success criteria and the goal hold on the live state as checked today:
- 77/77 deploy keys are `vault:v2:` ciphertext, with no PEM on disk.
- `min_decryption_version` = latest = 2. The behaviour bounds it on both sides: the v1 canary is refused, and the v2 keys decrypt.
- The passphrase is absent from the repo, the sibling repo, the live service specs (Spec and PreviousSpec, all 23 services), the swarm secret store, the Gluster `.env*` files, `ssh_keys` and the maintenance/backup directories on micro.

The residual copies of the passphrase are those accepted on 2026-10-09: DO snapshots, pre-migration Gluster backups, and the limits of shred on journaled ext4. The KEYMIG-04 retest is a future requirement. Status is `human_needed` only because the 26 judgment-tier prohibitions need explicit human resolution.

---

_Verified: 2026-10-20T20:25:00Z_
_Verifier: Claude (gsd-verifier)_
