---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 04
subsystem: deploy-keys
tags: [openbao, transit, deploy-keys, passphrase-retirement, askpass, ssh-agent, ci, jasmine, static-gate]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-01 migrate-deploy-keys.js (report/rewrap/canary/fetch-check); 41-02 D10_GATE pass (0 legacy keys); 41-03 nine Transit reason classes, IN-10 serviceDown, attempt_error token, rsakey.js without the passphrase reader"
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "Git#withAgent per-attempt ssh-agent, AGENT_SSH_COMMAND, keyformat.readKey, FakeTransit"
provides:
  - "lib/thinx/git.js: Transit-only keyed fetch; a legacy PEM file is skipped with legacy_format_unsupported (D-09)"
  - "baseEnv drops an inherited askpass helper and any variable named as a passphrase; agentEnv keeps its SSH_ASKPASS guards"
  - "scripts/migrate-deploy-keys.js without the legacy migration: --dry-run/--migrate exit 2 with 'legacy migration retired'"
  - "Dockerfile, Dockerfile.test, docker-compose.yml, docker-compose.test.yml without the passphrase variable"
  - "spec/jasmine/PassphraseRetiredSpec.js: static retirement gate in every CI jasmine run, mutation proven"
  - "runbook openbao.md section 11 after the removal (nine classes, D-09 skip line, D-07, KEYGEN drift fixed)"
affects: [41-05, 41-06, 41-07, openbao runbook, thinx-swarm wiring gate]

actuals:
  tokens: 33840
  tasks: 3
  commits: 6
plan_head_before: 1fa85d788e452bab3be9d000e1696db4fbdcab80
plan_head_after: cf707242534552be5924d5547fc0bda3d32d7e33

tech-stack:
  added: []
  patterns:
    - "A retired secret is kept out of child envs by a generic name filter (PASSPHRASE_NAME), so lib/ never names the retired variable and the static gate stays meaningful"
    - "Static gates walk the tree with fs from __dirname, not git grep, because the CI image has no .git and has Dockerfile.test moved over Dockerfile"
    - "Specs identify which throwaway key an agent attempt used by the fingerprint of the derived public key the attempt env names"

key-files:
  created:
    - spec/jasmine/PassphraseRetiredSpec.js
  modified:
    - lib/thinx/git.js
    - scripts/migrate-deploy-keys.js
    - Dockerfile
    - Dockerfile.test
    - docker-compose.yml
    - docker-compose.test.yml
    - .planning/runbooks/openbao.md
    - spec/jasmine/GitSpec.js
    - spec/jasmine/KeyFormatSpec.js
    - spec/jasmine/MigrateDeployKeysSpec.js
    - spec/jasmine/TransitIntegrationSpec.js
    - spec/node/DeployKeyNames.test.js

key-decisions:
  - "baseEnv deletes every inherited env name matching /PASSPHRASE/i plus SSH_ASKPASS/SSH_ASKPASS_REQUIRE: the swarm still sets the passphrase env until Plan 41-06, and no git/ssh child may inherit it, without lib/ naming the retired variable"
  - "PassphraseRetiredSpec requires Dockerfile and at least one root compose file; Dockerfile.test is scanned only when present, because CircleCI moves it over Dockerfile before the image build"
  - "The migration script keeps --dry-run/--migrate as recognised modes that exit 2 with a fixed stderr line, so an old runbook command fails loudly instead of as a usage error"
  - "A legacy skip makes no Transit call at all, which is what guarantees no Slack alert (D-09)"

patterns-established:
  - "D-09 skip: `[git] key <name> skipped: legacy_format_unsupported`, same branch as unknown/unreadable files"

requirements-completed: [KEYMIG-02]

coverage:
  - id: D1
    description: "Keyed builds read only Transit ciphertext through the per-attempt agent; sshEnv, the askpass helpers, the askpass SSH command and the readSecret import are gone from git.js"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#(g) (h) lock cases, last-good key; spec/jasmine/KeyFormatSpec.js#format invariant (Task 1 verify, 234 specs, 0 failures)"
        status: pass
      - kind: integration
        ref: "scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/TransitIntegrationSpec.js (10 specs, 0 failures; re-run after the commit)"
        status: pass
      - kind: other
        ref: "grep -cF on lib/thinx/git.js: 0 for each retired token, 2 for legacy_format_unsupported"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-09: a legacy PEM file is skipped with legacy_format_unsupported, gets no attempt, no keyUnavailable and no Transit call, and its bytes and mode are unchanged; a Transit key beside it still clones"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#(D9a) (D9b) (T4) (T8); spec/jasmine/KeyFormatSpec.js#legacy encrypted PKCS#8 / legacy unencrypted; spec/node/DeployKeyNames.test.js#KS5"
        status: pass
    human_judgment: false
  - id: D3
    description: "No inherited passphrase, SSH_ASKPASS or SSH_ASKPASS_REQUIRE reaches baseEnv, agentEnv or any keyed attempt env; an HTTP 401 remote gets no credential"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#inherited askpass and passphrase env (T-23-02, KEYMIG-02); (T6)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration script legacy modes retired: --dry-run/--migrate exit 2 with the fixed message, no migrate export, no conversion tokens; --report/--rewrap count legacy files without parsing them; rewrap/canary/fetch-check unchanged"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/MigrateDeployKeysSpec.js#(X1) (X1b) (X1c) (X2) (X3) (X4) (W4)-(W8) (17 specs, 0 failures)"
        status: pass
      - kind: integration
        ref: "scripts/openbao-dev.sh run -- npx jasmine TransitIntegrationSpec MigrateDeployKeysSpec TransitRotationSpec (29 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Passphrase variable gone from Dockerfile, Dockerfile.test, docker-compose.yml and docker-compose.test.yml; PassphraseRetiredSpec gates it in CI and fails on a probe file"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/PassphraseRetiredSpec.js (4 specs, 0 failures) and the Task 3 mutation check (probe fails, tree passes again, probe removed)"
        status: pass
      - kind: other
        ref: "Task 3 verify: grep counts 0, docker compose -f docker-compose.test.yml config --quiet, git grep exit 1"
        status: pass
    human_judgment: false
  - id: D6
    description: "Runbook section 11 describes the post-removal API (nine classes with first checks, rewrap op, D-09 skip line, RETIRED_VERSION text, D-07, live THINX_DEPLOY_KEYGEN=enabled)"
    requirement: KEYMIG-02
    verification:
      - kind: other
        ref: "Task 2 verify: sed section 11 contains retired_version, key_missing, legacy_format_unsupported"
        status: pass
    human_judgment: true
    rationale: "The runbook wording and accuracy for operators is a judgment call; a reviewer should read section 11 once before the 41-05 push."
  - id: D7
    description: "Prohibitions: the API never deletes, rewrites or alerts on a legacy file (D-09); nothing pushed (D-10)"
    requirement: KEYMIG-02
    verification:
      - kind: other
        ref: "GitSpec D9a/D9b bytes+mode unchanged and transit.calls all 0; git status: thinx-staging ahead of origin, origin/thinx-staging contains none of this plan's commits"
        status: pass
    human_judgment: true
    rationale: "Both prohibitions are flagged verification: judgment in the plan."

duration: 48min
completed: 2026-10-20
status: complete
---

# Phase 41 Plan 04: Legacy Read Path and Passphrase Removal Summary

**Keyed builds now read only Transit ciphertext through each attempt's own ssh-agent. A legacy PEM key that turns up in `ssh_keys` is logged as `legacy_format_unsupported` and left exactly as it is. The migration script keeps only its post-migration modes, the passphrase variable is gone from both Dockerfiles and both compose files, and a static jasmine gate (with a proven mutation) keeps all of it out of `lib/`, `scripts/` and the container configuration. Everything is committed locally and signed; nothing was pushed.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-10-20T14:21:25Z
- **Completed:** 2026-10-20T15:09:29Z
- **Tasks:** 3 (1 tracer, 1 TDD, 1 auto)
- **Files modified:** 13 (1 created, 12 modified)

## Accomplishments

- `git.js` changes:
  - `fetchHoldingLock` skips every non-Transit file. The cause is `legacy_format_unsupported` for `kind === "legacy"`, otherwise the keyformat cause. The legacy attempt block is deleted.
  - `sshEnv`, `create_askfile`, `delete_askfile`, `ASKPASS_PREFIX`, the askpass-era static SSH command and the `readSecret` import are deleted.
  - Comments now describe the Transit-only path.
  - `baseEnv` drops `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `SSH_AUTH_SOCK`, `SSH_AGENT_PID` and any env name matching `/PASSPHRASE/i`.
  - `agentEnv` keeps its own `SSH_ASKPASS*` deletes, and `GIT_ASKPASS=false` / `GIT_TERMINAL_PROMPT=0` stay.
- GitSpec runs on FakeTransit:
  - Two throwaway RSA 2048 keys, `k1` and `k2`, are stored as FakeTransit ciphertext. `keyLabel()` identifies an attempt's key by the fingerprint of the derived `.pub`.
  - The lock, ordering, last-good and T cases use these keys. The legacy-only cases became D-09 cases (D9a, D9b, T4, T8).
  - The known_hosts cases use `agentEnv` / `AGENT_SSH_COMMAND`, and `Git.SSH_COMMAND` is asserted `undefined`.
  - The passphrase cases became env-absence cases.
  - The HTTP 401 case asserts that every request had no Authorization header.
- KeyFormatSpec invariant: both legacy kinds reach no attempt, make no decrypt, log `legacy_format_unsupported` and keep their bytes. Transit reaches `AGENT_SSH_COMMAND` with a live `SSH_AUTH_SOCK`. An unknown file reaches nothing.
- `migrate-deploy-keys.js` changes:
  - Deleted: the candidates, the conversion code, the scratch tmpfs conversion, the quarantine and audit wiring, and the `migrate` export.
  - `--dry-run` and `--migrate` print `[migrate-deploy-keys] legacy migration retired (KEYMIG-02); use --report` on stderr and exit 2. They return before any lib module or globals load.
  - The header and usage text are rewritten.
  - `--report` still counts legacy files by their first line.
- Container configuration:
  - The `Dockerfile` comment list no longer names the variable.
  - The `docker-compose.yml` api env line is deleted.
  - The `Dockerfile.test` ARG/ENV pair is deleted.
  - The `docker-compose.test.yml` build arg is deleted.
- `PassphraseRetiredSpec`:
  - It walks `lib/` and `scripts/` `.js` files, `Dockerfile`, `Dockerfile.test` when present, and every root `docker-compose*.yml`.
  - It also checks the migration script for the conversion tokens and requires the D-09 skip in `git.js`.
  - A failure names `file:line token` only.
- Runbook section 11 changes:
  - Nine classes, with the planned first checks for `retired_version` and `key_missing`.
  - The `rewrap` op, the D-09 and `attempt_error` log lines, and the RETIRED_VERSION Slack text.
  - The D-09 bullet and the D-07 paragraph.
  - The live-spec `THINX_DEPLOY_KEYGEN=enabled` entry (fixes the 40-SECURITY residual 6 drift).
  - The "Not here" pointer to section 12.

## Task Commits

1. **Task 1 (tracer): Transit-only keyed fetch, D-09 skip:** `c5833f9c` (feat). Tracer gate: the run is interactive with `end-of-phase` and an automated-only verify, so the verify was re-run after the commit. Both parts passed (234 specs, 0 failures; dev server 10 specs, 0 failures), and the plan expanded.
2. **Task 2: migration script, runtime configuration, runbook:** `7878ae6f` (test, RED), `fc3897fc` (feat, GREEN), `5fab3907` (docs, runbook)
3. **Task 3: CI configuration and the static retirement gate:** `cad773e2` (feat)
4. **Deviation fix (Task 1 fallout):** `cf707242` (fix, DeployKeyNames KS5)

**Plan metadata:** the docs commit that follows this SUMMARY.

## TDD Evidence

- **Task 2 RED** (`7878ae6f`): 17 specs, 4 failures, 1 pending (the dev-server E2 outside the wrapper). Every failure is an `AssertionError` on planned behaviour:
  - X1 `--dry-run` and X1 `--migrate`: `expected +0 to equal 2`, because the old script ran the mode.
  - X1b: `expected [Function migrate] to equal undefined`.
  - X1c: the help text did not include `retired`.
  - X2, X3 and X4 already passed, because `--report` and `--rewrap` were unchanged code. They are regression guards for behaviour this plan keeps.
  - Semantic assessment: every target ran and failed on its own assertion, with no load, syntax or fixture fault. That is valid RED.
- `check tdd-red-evidence` has no jasmine adapter, so it was not run. `workflow.tdd_mode` is false for this workstream.
- **GREEN** (`fc3897fc`): 17 specs, 0 failures. No REFACTOR commit was needed.

## Verification

- Task 1 verify 1: KeyFormatSpec, GitSpec, BuilderRemoteJobSpec and BuilderApiKeySpec gave 234 specs, 0 failures. Every retired token count in `git.js` is 0, and `legacy_format_unsupported` appears 2 times.
- Task 1 verify 2 (dev server, TransitIntegrationSpec): 10 specs, 0 failures, nothing pending, no container left. Run before and after the commit.
- Task 2 verify: MigrateDeployKeysSpec 17/0 (1 dev-server pending).
  - No conversion token or passphrase variable is left in the script, and the retired message is present.
  - Dockerfile and compose counts are 0, and `docker-compose.yml` parses as YAML.
  - Section 11 contains all three strings.
  - On the dev server, TransitIntegrationSpec, MigrateDeployKeysSpec and TransitRotationSpec gave 29 specs, 0 failures.
- Task 3 verify:
  - PassphraseRetiredSpec gave 4/0, and the grep counts are 0.
  - `docker compose -f docker-compose.test.yml config --quiet` exited 0.
  - `git grep` exited 1 (no match).
  - The mutation check passed: the probe failed the gate with `lib/thinx/zz-retired-gate-probe.js:1 GIT_KEY_PASSPHRASE`, the tree passed again, the probe was removed, and no tracked file changed.
- Plan level:
  - The six plan specs plus TransitSpec and SecretsSweepSpec gave 336 specs, 0 failures (1 dev-server pending).
  - The full `test:node` set gave 119/119.
- Nothing was pushed. `thinx-staging` is ahead of `origin/thinx-staging`, and no remote branch contains `c5833f9c`.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] An inherited passphrase would have reached git and ssh children**
- **Found during:** Task 1
- **Issue:** The plan removes the explicit delete of the passphrase variable from `baseEnv`/`agentEnv`, and the static gate bans its name in `lib/`. The swarm still sets it as an env var (`docker-swarm.yml` line 359) until Plan 41-06, and `baseEnv` copies `process.env`. Without a replacement, every git/ssh child would inherit the value in the 41-05 to 41-06 window. That would contradict the plan's own requirement that no keyed attempt env carries the variable.
- **Fix:** `PASSPHRASE_NAME = /PASSPHRASE/i`. `baseEnv` deletes every matching name, and it now also deletes `SSH_ASKPASS` and `SSH_ASKPASS_REQUIRE`, which the plan's "neither baseEnv nor agentEnv" test requires.
- **Files modified:** lib/thinx/git.js
- **Verification:** the GitSpec "inherited askpass and passphrase env" cases set all three variables and assert that none of them, and no value containing the passphrase, reaches baseEnv, agentEnv or either keyed attempt env.
- **Committed in:** c5833f9c

**2. [Rule 3 - Blocking] TransitIntegrationSpec E2 expected a legacy key to build**
- **Found during:** Task 1 verify 2 (dev server)
- **Issue:** E2 asserted `{ok: true}` from the legacy key after an outage. That path is what this plan removes, so the end-to-end verify could not pass.
- **Fix:** E2 now expects `{ok: false, keyUnavailable: "unreachable"}`, no attempt, one decrypt, the skip lines for t2/t3 and the `legacy_format_unsupported` line. `envLabel` no longer recognises a legacy env.
- **Files modified:** spec/jasmine/TransitIntegrationSpec.js
- **Committed in:** c5833f9c

**3. [Rule 3 - Blocking] DeployKeyNames KS5 expected a legacy attempt**
- **Found during:** plan-level verification (`test:node`)
- **Issue:** KS5 asserted attempts `['agent', 'legacy']` with the kill switch off.
- **Fix:** It now asserts `['agent']`, one decrypt, and the D-09 skip line for the legacy file.
- **Files modified:** spec/node/DeployKeyNames.test.js
- **Committed in:** cf707242

**4. [Rule 1 - Bug] The gate as specified would fail every CI run**
- **Found during:** Task 3 (reading `.circleci/config.yml` line 793 onward)
- **Issue:** The plan says Dockerfile and Dockerfile.test "must exist". CircleCI runs `mv ./Dockerfile.test ./Dockerfile` before the build, so the CI image has no Dockerfile.test.
- **Fix:** Dockerfile is required, and Dockerfile.test is scanned only when present. In CI, its content is the Dockerfile that gets scanned. At least one root compose file is still required, as planned.
- **Files modified:** spec/jasmine/PassphraseRetiredSpec.js
- **Committed in:** cad773e2

### Clarifications (no behaviour beyond the plan)
- X1c, a help-text case, was added to the RED set. B12, the FakeTransit versions plus report-order case, was kept, and so was the leftover-temp cleanup case (as W4d, on `--rewrap`), because both test code that stays. B1-B11, M1-M4 and the dev-server E1 were deleted with the migration code they tested.
- Section 11 also had stale "legacy keys still build" text in the D-01 bullet, the latency paragraph and the rollback order. These now match the removal and D-07.
- The X3 "without opening" check spies on `crypto.createPrivateKey` (0 calls) and checks that bytes and mode are unchanged. `--report`/`--rewrap` still read a legacy file's first line through the bounded read, as the plan's "counts legacy files by first-line kind" requires.

---

**Total deviations:** 4 auto-fixed (1 missing-critical, 2 blocking, 1 bug). **Impact:** each fix was needed for the removal to be correct (no inherited passphrase in child envs) or for its own verification and CI to pass. No scope creep, no package added, no AppRole or production change.

## Issues Encountered

- A compound CLI smoke command (`env -i`, a temp HOME and `rm -rf`) was denied by the sandbox. The spawned-CLI spec cases X1 and X1c cover the same behaviour, and the export list was checked directly.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Plan 41-05 Task 1 can push this plan together with Plan 41-03 to `thinx-staging` after the D-10 gate record. It extends `PassphraseRetiredSpec`'s file set with `docker-swarm.yml`, which still has 4 occurrences (lines 33, 105, 330, 359).
- Between that deploy and Plan 41-06, the live env still carries the passphrase. The code reads none of it, and `baseEnv` keeps it out of every git/ssh child.
- Nothing was pushed, and production was not touched.

---
*Phase: 41-key-migration-passphrase-retirement-rotation*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: spec/jasmine/PassphraseRetiredSpec.js, lib/thinx/git.js, scripts/migrate-deploy-keys.js, .planning/runbooks/openbao.md
- FOUND (ancestors of HEAD): c5833f9c, 7878ae6f, fc3897fc, 5fab3907, cad773e2, cf707242; ledger count 6 from 1fa85d78
- Artifacts: git.js and runbook contain legacy_format_unsupported; the script contains "legacy migration retired"; PassphraseRetiredSpec contains historic_literal and readdirSync
