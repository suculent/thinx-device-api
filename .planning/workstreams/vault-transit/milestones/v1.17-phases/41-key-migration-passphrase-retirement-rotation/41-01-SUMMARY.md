---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 01
subsystem: deploy-keys
tags: [openbao, transit, rewrap, deploy-keys, migration, ssh-keygen, pkcs8, jasmine]

requires:
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: lib/thinx/transit.js AppRole client, lib/thinx/keyformat.js classifier, Git#withAgent / fetchDetailed, FakeTransit and mock-openbao fixtures, scripts/openbao-dev.sh
provides:
  - scripts/migrate-deploy-keys.js (--report, --dry-run, --migrate, --rewrap, --canary-capture, --canary-check, --fetch-check, --json)
  - Transit#rewrapKey (transit/rewrap/thinx-deploy-keys, D-02 retry)
  - versioned FakeTransit (version, rotate(), rewrapKey, calls.rewrap)
  - mock-openbao rewrap route with configurable key_version
  - spec/jasmine/MigrateDeployKeysSpec.js (unit + dev-server end to end)
affects: [41-02, 41-03, 41-04, 41-06, 41-07, openbao runbook]

actuals:
  tokens: 20400
  tasks: 3
  commits: 5
plan_head_before: 239e06da97389030345ed3f9abbbe87f81593ee0
plan_head_after: f6c9303235f86f29d77ead564d8292929ae96fe9

tech-stack:
  added: []
  patterns:
    - "Verified atomic replace: wx temp `.<name>.<12 hex>.keymig.tmp` + fsync, listing/.pub/hash re-check before rename, post-rename .pub check"
    - "Normalise every legacy key to unencrypted PKCS#8 PEM before Transit (the plaintext generate() sends)"
    - "Report modes print one compact JSON line as the last stdout line (tail -1 | jq)"

key-files:
  created:
    - scripts/migrate-deploy-keys.js
    - spec/jasmine/MigrateDeployKeysSpec.js
  modified:
    - lib/thinx/transit.js
    - spec/fixtures/fake-transit.js
    - spec/fixtures/mock-openbao.js
    - spec/jasmine/TransitSpec.js

key-decisions:
  - "Every passphrase candidate is tried on any createPrivateKey error; wrong_passphrase if any try reported ERR_OSSL_BAD_DECRYPT, else unparseable (a wrong passphrase gives ERR_OSSL_UNSUPPORTED about 1 time in 300)"
  - "An OpenSSH key's type is read from the public half of the openssh-key-v1 blob before conversion; non-ssh-rsa is unsupported_type (ssh-keygen -m PKCS8 refuses ed25519)"
  - "A quarantine re-checks the file's sha256 before RSAKey#revokeUserKeys; a changed file counts changed_during_run"
  - "--canary-capture / --canary-check load only transit.js (no globals), use a webhook-null client and log Transit failures to stderr, so stdout is exactly one line"
  - "canaryCheck and fetchCheck resolve {line, code}; --rewrap with no Transit file makes no Transit request (latest null)"

patterns-established:
  - "Script env injection: {sshKeysDir, transit, rsakey, audit, candidates, scratchDir, git, auditTimeoutMs}; the CLI builds it, specs inject fakes"

requirements-completed: [KEYMIG-01, KEYMIG-03]

coverage:
  - id: D1
    description: "Passphrase PKCS#8 key migrates to one 0600 vault:vN: line that decrypts to unencrypted PKCS#8 and loads into ssh-agent with the .pub fingerprint"
    requirement: KEYMIG-01
    verification:
      - kind: unit
        ref: "spec/jasmine/MigrateDeployKeysSpec.js#(M1)-(M4)"
        status: pass
      - kind: integration
        ref: "scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/MigrateDeployKeysSpec.js#(E1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every legacy kind (PKCS#1 plain and Proc-Type, OpenSSH via scratch tmpfs) migrates; unconvertible keys are quarantined with one audit notice; dry-run, idempotency, abort, race, leftover-temp, empty-input, determinism and output-sweep rules"
    requirement: KEYMIG-01
    verification:
      - kind: unit
        ref: "spec/jasmine/MigrateDeployKeysSpec.js#(B1)-(B12)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/GitSpec.js, spec/jasmine/KeyFormatSpec.js, spec/node/DeployKeyNames.test.js (FakeTransit regression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Transit#rewrapKey and --rewrap bring every Transit file to the latest version idempotently; canary capture/check and fetch-check lines"
    requirement: KEYMIG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#(W1)-(W3)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/MigrateDeployKeysSpec.js#(W4)-(W8)"
        status: pass
      - kind: integration
        ref: "scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/TransitIntegrationSpec.js spec/jasmine/MigrateDeployKeysSpec.js#(E2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No plaintext key outside memory and the per-conversion 0700 scratch dir; no PEM, passphrase, ciphertext or path in any output (flagged prohibitions)"
    requirement: KEYMIG-01
    verification:
      - kind: unit
        ref: "spec/jasmine/MigrateDeployKeysSpec.js#(B2) (B11) (W8)"
        status: pass
    human_judgment: true
    rationale: "The prohibitions are marked verification: judgment; a reviewer should read convertOpenSSH/removeScratch and every output path once before the script runs on production in 41-02."

duration: 16min
completed: 2026-10-20
status: complete
---

# Phase 41 Plan 01: Migration and Rewrap Tool Summary

**scripts/migrate-deploy-keys.js turns every legacy deploy key (passphrase PKCS#8, PKCS#1, OpenSSH) into a verified 0600 `vault:vN:` file, quarantines unconvertible ones with an owner audit notice, and adds the rewrap, canary and fetch-check modes on top of a new Transit#rewrapKey. Proven on FakeTransit and against the OpenBao 2.7.1 dev server.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-20T10:44:17Z
- **Completed:** 2026-10-20T11:00:31Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `--migrate` normalises every legacy key to unencrypted PKCS#8, encrypts it, decrypts the result and requires equal bytes and an equal SPKI, then replaces the file atomically. A second run reports migrated 0, failed 0, legacy_total 0.
- The OpenSSH key is converted with `ssh-keygen -q -p -m PKCS8 -N "" -P ""` on a 0600 copy in a 0700 `mkdtemp` directory under `scratchDir` (`/dev/shm` in the CLI). The copy is overwritten and the directory removed in `finally`.
- Quarantine (D-02/D-03): `revokeUserKeys` after a byte re-check, then one `Audit#log(owner, sentence, "warning")` naming only the creation date. The wait is bounded at 10 s, and `notified` is counted only on `true`.
- `--dry-run` sends zero Transit requests, leaves names, contents and modes identical, and predicts the migrate and quarantine counts that a following `--migrate` reproduces.
- Service-level Transit classes abort the run with exit 1. Untried files count `not_attempted` failures, and none is quarantined.
- `Transit#rewrapKey` reuses the decrypt shape. A rewrap 400 is `bad_ciphertext`, a 403 is retried once after a fresh login, and a malformed 200 is `server_error`. `--rewrap` learns the latest version from one encrypt of random bytes, rewraps only the files below it, compares the old and new plaintext, and a second run reports rewrapped 0 with every file at_latest.
- `--canary-capture` prints exactly one ciphertext line. `--canary-check` prints `CANARY result=<ok|class> version=v<N>|none` with exit 0 or 3. `--fetch-check` runs `Git#fetchDetailed` into a removed `p41-fetch-` temp dir and prints the `FETCH_CHECK` line. An owner that is not 64 hex exits 2.

## Task Commits

1. **Task 1: tracer, passphrase PKCS#8 end to end**: `1a22d03b` (feat). Tracer gate: verify re-run after commit, rc 0. Tracer verified end to end, then expanded.
2. **Task 2: every legacy kind, quarantine, dry-run, abort, races**: `3b37879a` (test, RED), `d31d6a92` (feat, GREEN)
3. **Task 3: rewrap, canary, fetch-check**: `97f817f1` (test, RED), `f6c93032` (feat, GREEN)

**Plan metadata:** in the docs commit that follows this SUMMARY.

## TDD Evidence

- **Task 2 RED** (`3b37879a`): 23 specs, 11 failures, all `AssertionError`s on the planned behaviour: B1, B1c, B2, B2b, B3, B3b, B4, B5, B7b, B10, B12. B12 failed on `expected undefined to equal 1`, i.e. no `version` yet. B1b, B6, B6b, B7, B8, B9 and B11 already passed, because the tracer core provides them (candidates, abort, rename race, leftover cleanup, empty input, sweep). Semantic assessment: the target tests ran and failed on their own assertions, with no load, syntax or fixture fault. That is valid RED.
- **Task 3 RED** (`97f817f1`): 64 specs, 13 failures, all `TypeError: … is not a function` at the call to the API that did not exist yet (`rewrapKey`, `mig.rewrap`, `canaryCapture`, `fetchCheck`). Semantic assessment: every target spec was discovered and executed, and the 51 other specs in the same files passed. Each failure is the missing planned API inside the target test, not a collection, import or fixture fault. It is not an assertion failure, and is recorded as such.
- The RED evidence classifier (`check tdd-red-evidence`) has no jasmine adapter, so it was not run. `workflow.tdd_mode` is false for this workstream.
- **GREEN:** `d31d6a92`, then `f6c93032`. No REFACTOR commit was needed.

## Files Created/Modified

- `scripts/migrate-deploy-keys.js`: the migration, rewrap, report, canary and fetch-check tool. Exports `report, migrate, rewrap, canaryCapture, canaryCheck, canaryTransit, fetchCheck, formatText, exitCode`.
- `spec/jasmine/MigrateDeployKeysSpec.js`: M1-M4, B1-B12, W4-W8 on FakeTransit and synthetic keys, plus the dev-server E1 (ssh-agent fingerprint) and E2 (rewrapKey, --rewrap, canary).
- `lib/thinx/transit.js`: `rewrapKey`, `_rewrapOnce`, and the rewrap 400 mapped to `bad_ciphertext`. The header lists the rewrap call.
- `spec/fixtures/fake-transit.js`: `version`, `rotate()`, `rewrapKey`, `calls.rewrap`, and `rewrap` in the default `failOps`. Existing options and defaults are unchanged.
- `spec/fixtures/mock-openbao.js`: the `/v1/transit/rewrap/thinx-deploy-keys` route, the `rewrap` counter and token check, and `opts.keyVersion`.
- `spec/jasmine/TransitSpec.js`: W1, W1b, W2, W2b, W2c, W3.

## Verification

- Task 1 verify (dev server, `MigrateDeployKeysSpec`): `31 specs, 0 failures`, nothing pending, no PEM or ciphertext shape in the log, no dev-server container left. Re-run after the last commit, rc 0.
- Task 2 verify: `MigrateDeployKeysSpec + KeyFormatSpec + GitSpec` 119 specs, 0 failures (dev-server cases pending outside the wrapper). `DeployKeyNames` 46/46.
- Task 3 verify: `TransitSpec + MigrateDeployKeysSpec + SecretsSweepSpec + RedisHealthSpec` 112 specs, 0 failures. Dev-server `TransitIntegrationSpec + MigrateDeployKeysSpec` 41 specs, 0 failures. `grep -c 'transit/rewrap/' lib/thinx/transit.js` = 2. After the final change, `KeyFormatSpec + GitSpec` 96/0 and `DeployKeyNames` 46/46.
- CLI smoke on a throwaway HOME: `--report`/`--dry-run` exit 0, and `--migrate` without BAO exits 1 with `aborted: not_configured` and the file unchanged. Usage errors exit 2. Against the dev server, the canary capture writes 1 line and the check prints `CANARY result=ok version=v1`.
- `require('./scripts/migrate-deploy-keys.js')` prints nothing and runs no mode. `package.json` and `package-lock.json` are unchanged.

## Decisions Made

See `key-decisions` in the frontmatter. In brief:
- the candidate loop is robust against the CBC padding fluke;
- the OpenSSH type is checked before conversion;
- quarantine re-checks the file bytes first;
- the canary modes print exactly one stdout line;
- `{line, code}` is the return shape of `canaryCheck` and `fetchCheck`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A wrong passphrase can look like an unparseable key**
- **Found during:** Task 1 (probe before writing the conversion)
- **Issue:** The plan said "any other error [than ERR_OSSL_BAD_DECRYPT] is cause unparseable". A probe of 300 wrong passphrases on one PKCS#8 key gave 299 `ERR_OSSL_BAD_DECRYPT` and 1 `ERR_OSSL_UNSUPPORTED` (valid CBC padding by chance). With about 67 production keys tried under the secret first, a key could then be quarantined as unparseable before the historic literal was ever tried.
- **Fix:** Every candidate is tried on any error. The result is `wrong_passphrase` if any try reported BAD_DECRYPT, otherwise `unparseable`.
- **Files modified:** scripts/migrate-deploy-keys.js
- **Commit:** 1a22d03b, d31d6a92

**2. [Rule 1 - Bug] ed25519 OpenSSH keys would be conversion_failed, not unsupported_type**
- **Found during:** Task 2 (probe)
- **Issue:** `ssh-keygen -p -m PKCS8` exits 1 on an ed25519 key, so B3's `unsupported_type` was unreachable through the plan's flow.
- **Fix:** `opensshKeyType()` reads the key type string from the public half of the openssh-key-v1 blob. It reads length-prefixed fields only, never the private section, and zeroes the buffer. A type other than `ssh-rsa` is `unsupported_type` before any scratch write.
- **Files modified:** scripts/migrate-deploy-keys.js
- **Commit:** d31d6a92

**3. [Rule 2 - Missing critical] Quarantine could delete a file rewritten since it was read**
- **Found during:** Task 2
- **Issue:** `revokeUserKeys` removes by name. A concurrent rewrite between the read and the revoke would destroy a now-valid key.
- **Fix:** The sha256 is re-checked right before `revokeUserKeys`. A changed file counts `changed_during_run`, as does a revoke that removed nothing.
- **Commit:** d31d6a92

**4. [Rule 1 - Bug] The canary modes would not print exactly one line**
- **Found during:** Task 3 (CLI smoke)
- **Issue:** Building the CLI env requires rsakey.js, which loads globals.js, and that prints "Configuration loaded from …" on load. Transit's failure line also went to stdout. The capture file would then hold several lines, and `--canary-check` would read them as `bad_ciphertext`.
- **Fix:** The canary modes build no RSAKey and load only transit.js. They use a webhook-null client whose log goes to stderr. A capture failure exits 1 with a class-only stderr line.
- **Commit:** f6c93032

**5. [Rule 2 - Correctness] Pre-rename check order**
- **Found during:** Task 2 (B7b)
- **Issue:** The content hash was checked before `keyStillListed`, leaving a window between the hash check and the rename.
- **Fix:** The listing is checked first, then the `.pub` state, and the content hash last, closest to `renameSync`.
- **Commit:** d31d6a92

### Interface clarifications (no behaviour beyond the plan)
- `canaryCheck` and `fetchCheck` resolve `{line, code}`, because the interface named no return shape and the CLI needs the exit code. `exitCode(report)` and `canaryTransit()` are exported for the specs. `env.auditTimeoutMs` is injectable (default 10 s).
- With no Transit file, `--rewrap` skips the version-learning encrypt, so it makes zero Transit requests and `latest` stays `null`. This is stricter than W5 asks.
- "Add versions to --report": the report's `transit` field already is the per-version count map (vN to count, ascending N), so no second field was added.
- `rewrapKey` requires `key_version` to be a JSON integer, not a numeric string. The dev server returns a number (E2 passes).

---

**Total deviations:** 5 auto-fixed (3 bugs, 2 missing-critical/correctness). **Impact:** each fix prevents a wrong quarantine, a destroyed key or an unusable canary file in the 41-02/41-07 production runs. There is no scope creep, no new dependency and no AppRole change.

## Issues Encountered

None beyond the deviations above.

## Threat Model Coverage

- T-41-01: plaintext stays in Buffers zeroed in `finally`. The OpenSSH copy lives under 0700 `mkdtemp` and is overwritten and removed. ssh-keygen output is ignored (`stdio: "ignore"`). Covered by B2 (scratch empty) and B11.
- T-41-02: wx temp plus fsync, listing/.pub/hash re-check, post-rename `.pub` check, and exact-pattern leftover cleanup. Covered by B7, B7b, B8 and W4b.
- T-41-03: reports carry owner, key timestamp, class and counts only. Covered by B11 and W8. `--canary-capture` is the single ciphertext line.
- T-41-04: only file-level causes quarantine. Service classes abort without touching files (B6, W4c).
- T-41-05: the latest version comes from an encrypt prefix. No key read and no policy change.
- T-41-SC: no package was added. package.json and package-lock.json are unchanged.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Plan 41-02 can run `node scripts/migrate-deploy-keys.js --dry-run --json` / `--migrate --json` in the `thinx_api` task unchanged, and parse the report with `tail -1 | jq`. Plan 41-07 uses `--rewrap`, `--canary-capture`/`--canary-check` and `--fetch-check`.
- Nothing was pushed, and production was not touched.
- For Plan 41-04: the script's candidate list and `GIT_KEY_PASSPHRASE` read (`cliEnv`, `HISTORIC_LITERAL`, the header lines) must be deleted in the removal commit, while `--rewrap`, `--report` and the canary/fetch-check modes stay.

---
*Phase: 41-key-migration-passphrase-retirement-rotation*
*Completed: 2026-10-20*

## Self-Check: PASSED

- Files exist: scripts/migrate-deploy-keys.js, spec/jasmine/MigrateDeployKeysSpec.js, 41-01-SUMMARY.md
- Commits on HEAD: 1a22d03b, 3b37879a, d31d6a92, 97f817f1, f6c93032
