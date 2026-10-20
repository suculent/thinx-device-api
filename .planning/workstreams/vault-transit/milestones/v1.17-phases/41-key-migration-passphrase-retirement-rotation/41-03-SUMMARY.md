---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 03
subsystem: deploy-keys
tags: [openbao, transit, rotation, min_decryption_version, rewrap, slack, deploy-keys, jasmine]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-01 scripts/migrate-deploy-keys.js rewrap()/canaryCheck(), Transit#rewrapKey, versioned FakeTransit; 41-02 D10_GATE pass"
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "transit.js client and D-05 incident tracker, git.js try-each-key loop with SERVICE_DOWN_REASONS, OpenBao dev server in docker-compose.test.yml"
provides:
  - "Transit reason classes retired_version (ErrTooOld, per key, one alert per process via its own latch) and key_missing (service level, D-05 incident); REASONS has nine classes"
  - "TransitError.op on every failure (login, probe, encrypt, decrypt, rewrap)"
  - "git.js: key_missing and a login server_error skip the owner's remaining Transit keys (IN-10); non-coded attempt errors log attempt_error (T-40-12)"
  - "spec/jasmine/TransitRotationSpec.js: rotate, rewrap, raise min_decryption_version, old canary refused, against OpenBao 2.7.1"
  - "BAO_DEV_ADMIN_TOKEN (CI throwaway) for the test api service and scripts/openbao-dev.sh run"
  - "rsakey.js without RSAKey.keyPassphrase() and the readSecret import"
affects: [41-04, 41-05, 41-07, openbao runbook]

actuals:
  tokens: 14350
  tasks: 3
  commits: 5
plan_head_before: e133fa453cd5e4c676ab6cd90e90c6481ab4172c
plan_head_after: 78a1717be90533bcd84cde579ffbef119fa7c5dd

tech-stack:
  added: []
  patterns:
    - "OpenBao 400 error strings are matched by strict equality over the errors array (errorsInclude), never by substring, and never logged"
    - "A per-key alert class gets its own one-shot latch (_retiredAlertedAt) instead of the outage incident, so it cannot flap FAILING/RECOVERED"
    - "Dev-server specs that change shared key state restore it in afterAll and assert versions against what the server reports"

key-files:
  created:
    - spec/jasmine/TransitRotationSpec.js
  modified:
    - lib/thinx/transit.js
    - lib/thinx/git.js
    - lib/thinx/rsakey.js
    - scripts/purge-orphaned-rsa-keys.js
    - scripts/openbao-dev.sh
    - docker-compose.test.yml
    - spec/fixtures/fake-transit.js
    - spec/jasmine/TransitSpec.js
    - spec/jasmine/GitSpec.js
    - spec/jasmine/03-RsakeySpec.js
    - spec/jasmine/SecretsSweepSpec.js
    - spec/node/DeployKeyNames.test.js

key-decisions:
  - "D-13 names settled (A4): retired_version ('stored key uses a retired key version') and key_missing ('key service has no deploy-key key')"
  - "retired_version alerts through a separate one-per-process latch with no recovery post; key_missing stays on the D-05 incident path and is in SERVICE_DOWN_REASONS"
  - "key_missing is not retried (not in RETRYABLE): the key does not reappear on a second ask"
  - "TransitError.op is stamped where the failure is first seen (_login label, else _op, _rejectInput), so a login failure inside a decrypt stays op login"
  - "TransitRotationSpec also proves the adjacency edge: min_decryption_version = latest + 1 is refused with 400 before latest is accepted"

patterns-established:
  - "FakeTransit minDecryption/failOpLabel for per-key retired and login-vs-decrypt failures in git.js specs"

requirements-completed: [KEYMIG-02, KEYMIG-03]

coverage:
  - id: D1
    description: "retired_version: an exact ErrTooOld decrypt/rewrap 400 is its own class, never retried, logged by class only, one RETIRED_VERSION Slack text per process, no RECOVERED, outages still alert"
    requirement: KEYMIG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#(D13a) (D13b) (D13c) (A5) (C1)"
        status: pass
      - kind: integration
        ref: "scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/TransitRotationSpec.js#(R1) (R2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "KEYMIG-03 sequence on OpenBao 2.7.1: rotate, rewrap via migrate-deploy-keys (2 rewrapped, then 0 / at_latest 2), raise the minimum to the new latest, old canary refused as retired_version by decrypt, rewrap and canaryCheck; minimum restored"
    requirement: KEYMIG-03
    verification:
      - kind: integration
        ref: "Task 1 automated verify (TransitIntegrationSpec + MigrateDeployKeysSpec + TransitRotationSpec, 43 specs, 0 failures, no pending, no ciphertext/token/error text, no container left)"
        status: pass
    human_judgment: false
  - id: D3
    description: "key_missing is service level (incident, skips later keys); TransitError.op; a login server_error marks service-down while a decrypt server_error stays per key; attempt_error token"
    requirement: KEYMIG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#(D13d) (IN10a); spec/jasmine/GitSpec.js#(G-IN10) (G-KM) (G-T12) (F)"
        status: pass
    human_judgment: false
  - id: D4
    description: "RSAKey.keyPassphrase() and the readSecret import gone from rsakey.js; purge header no longer names the variable; specs neither call nor spy on the reader; generate() refusal unchanged"
    requirement: KEYMIG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/03-RsakeySpec.js#(11); spec/jasmine/SecretsSweepSpec.js; node --test spec/node/DeployKeyNames.test.js (46/46)"
        status: pass
      - kind: other
        ref: "grep -c keyPassphrase|GIT_KEY_PASSPHRASE|readSecret lib/thinx/rsakey.js = 0/0/0; grep -c GIT_KEY_PASSPHRASE scripts/purge-orphaned-rsa-keys.js = 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prohibitions: no OpenBao error text or ciphertext in logs/Slack, the dev admin token only in the test compose and the laptop wrapper, nothing pushed"
    requirement: KEYMIG-03
    verification:
      - kind: other
        ref: "Task 1 verify 1 (BAO_DEV_ADMIN_TOKEN count 1 in docker-compose.test.yml, absent from docker-swarm.yml); git status: ahead of origin, no push"
        status: pass
    human_judgment: true
    rationale: "The three flagged prohibitions are verification: judgment; a reviewer should read _classify/_retired and the compose/wrapper diff once before the 41-05 removal push."

duration: 75min
completed: 2026-10-20
status: complete
---

# Phase 41 Plan 03: D-13 Reason Classes, IN-10/T-40-12 and Passphrase Reader Removal Summary

**A ciphertext below `min_decryption_version` is now `retired_version`: it is matched exactly against OpenBao's ErrTooOld string, never retried, and alerted once per process without ever touching the outage incident. `encryption key not found` is `key_missing`, a service-level class. The whole rotate, rewrap, raise and refuse sequence is proven against the OpenBao 2.7.1 dev server, and `rsakey.js` can no longer read the passphrase. Everything is committed locally and nothing is pushed.**

## Performance

- **Duration:** 75 min, including a pause after a transient API network error mid Task 2
- **Started:** 2026-10-20T12:58:22Z
- **Completed:** 2026-10-20T14:13:36Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 13 (1 created, 12 modified)

## Accomplishments

- `transit.js` changes:
  - `ERR_TOO_OLD` and `ERR_KEY_NOT_FOUND` are compared by strict equality over the `errors` array, only for decrypt and rewrap 400s. Any other 400 stays `bad_ciphertext`, including ErrTooOld with extra text or a non-array `errors`.
  - `REASONS` has nine classes. `unavailableSentence` covers both new ones.
  - On the first `retired_version`, the `_retired()` latch posts the RETIRED_VERSION text. It is never cleared and never opens or closes the D-05 incident.
- `TransitError.op` is set for every failure. A login failure inside a decrypt keeps `op: "login"`.
- `git.js` changes:
  - `key_missing` is in `SERVICE_DOWN_REASONS`.
  - `serviceDownFor()` also treats a `server_error` with `op === "login"` as service-down (IN-10).
  - `transitAttempt` returns `serviceDown`, and `fetchHoldingLock` uses it.
  - The non-coded catch logs `failed: attempt_error` (T-40-12).
  - The legacy branch is untouched; Plan 41-04 removes it.
- `TransitRotationSpec` runs on the dev server:
  - It encrypts the canary and two key files at L0, rotates to L1 = L0+1, then rewraps (2 rewrapped, then 0 rewrapped with at_latest 2). Each file decrypts to its original bytes.
  - It confirms that L1+1 is refused with 400, then raises the minimum to L1.
  - The canary is then refused as `retired_version`/400 by decrypt, rewrap and `canaryCheck` (`CANARY result=retired_version version=vL0`). That raises exactly one alert, and a later success adds no RECOVERED.
  - `afterAll` restores the minimum to M0 and reads it back.
- `BAO_DEV_ADMIN_TOKEN` is set only on the test `api` service and in `openbao-dev.sh run`. The openbao-setup policy lines are unchanged.
- `rsakey.js` no longer has `keyPassphrase()` or the `readSecret` import. The purge-script header no longer names the variable, and `--askfiles` is unchanged.

## Task Commits

1. **Task 1 (tracer): rotate, rewrap, raise, refuse on the dev server:** `75bba892` (feat). Tracer gate: the verify was re-run after the commit and passed (43 specs, 0 failures), so the plan expanded.
2. **Task 2: classification table, key_missing, alert latch, IN-10, T-40-12:** `fd08b9c1` (test, RED), `20f94c2d` (feat, GREEN)
3. **Task 3: the passphrase reader leaves rsakey.js:** `e23e46a6` (test, RED), `78a1717b` (feat, GREEN)

**Plan metadata:** the docs commit that follows this SUMMARY.

## TDD Evidence

- **Task 2 RED** (`fd08b9c1`): 109 specs, 7 failures. Every failure is an `AssertionError` on planned behaviour:
  - C1: 8 classes instead of 9.
  - D13d: `bad_ciphertext` where `key_missing` was expected.
  - IN10a: `op` undefined.
  - G-IN10: 2 decrypts instead of 1.
  - G-KM: 2 decrypts instead of 1.
  - G-T12: no `attempt_error` line.
  - F: `minDecryption` undefined.
  - D13a-c and A5 already passed, because Task 1 shipped `retired_version` as the tracer.
  - Semantic assessment: every target ran and failed on its own assertion, with no load, syntax or fixture fault. That is valid RED.
- **Task 3 RED** (`e23e46a6`): 03-RsakeySpec (11) and SecretsSweepSpec "has no passphrase reader" failed with `expected [Function keyPassphrase] to equal undefined`. DeployKeyNames already stayed at 46/46 without the passphrase env, as R3 requires.
  - Semantic assessment: the failures are on the planned assertion. That is valid RED.
- `check tdd-red-evidence` has no jasmine adapter, so it was not run. `workflow.tdd_mode` is false for this workstream.
- **GREEN:** `20f94c2d`, then `78a1717b`. No REFACTOR commit was needed.

## Verification

- Task 1 verify 1: `bash -n`, `docker compose config --quiet`, BAO_DEV_ADMIN_TOKEN count 1, and absence from docker-swarm.yml all passed.
- Task 1 verify 2, run three times, the last after the final commit: 43 specs, 0 failures, with no `pending`, ciphertext shape, root token or OpenBao error text in the log, and no dev-server container left.
- Task 2 verify: TransitSpec, GitSpec, KeyFormatSpec, MigrateDeployKeysSpec and BuilderRemoteJobSpec gave 247 specs, 0 failures. The 2 pending are the dev-server E1/E2 cases outside the wrapper. `attempt_error` count is at least 1, and `failed: ${e && e.message}` count is 0.
- Task 3 verify:
  - 03-RsakeySpec (filter): 17/0.
  - DeployKeyNames: 46/46.
  - SecretsSweepSpec + GitSpec: 112/0.
  - All four grep counts are 0.
  - `purge-orphaned-rsa-keys.js --help` exits 0.
- Final combined unit run (the six unit specs above): 289 specs, 0 failures (2 dev-server pending).

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

None. The plan was executed as written. These clarifications add no behaviour beyond the plan:
- The ErrTooOld and key-not-found checks share one helper, `errorsInclude(r, text)`, which uses `errors.some(e => e === text)` (strict equality).
- The `TransitError` constructor takes an optional third argument `op`. FakeTransit also stamps `op` on its non-injected rejections (bad_ciphertext, retired_version, input), the same way the real client does.
- In FakeTransit, the `minDecryption` check runs before the store lookup, as OpenBao checks the version first.
- TransitRotationSpec does not redirect `HOME` (MigrateDeployKeysSpec already does at load) and never constructs an `RSAKey`. It uses `Object.create(RSAKey.prototype)` bound to its temp directory, so no real key directory can be touched.
- The 03-RsakeySpec (11) refusal-line check captures `console.log` directly.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered

- A transient API network error (ENOTFOUND) stopped the run during Task 2 GREEN. On resume, the uncommitted diffs in transit.js, git.js and fake-transit.js turned out to be the complete GREEN edits. The Task 2 verify, the dev-server suite and DeployKeyNames were re-run before the GREEN commit.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Plan 41-04 can remove the legacy branch of `fetchHoldingLock` (still logging `${e.message}`), `sshEnv`, `create_askfile`/`delete_askfile`, the migration script's passphrase candidates and the Dockerfile/compose `GIT_KEY_PASSPHRASE` entries. `rsakey.js` no longer needs any of them.
- D-13 ordering: this plan's commits ship together with 41-04 in the 41-05 removal push, before any rotation. Before Plan 41-07 step 2, confirm in-task that `Transit.REASONS` includes `retired_version` (Pitfall 10).
- Nothing was pushed (branch thinx-staging is ahead of origin), and production was not touched.

---
*Phase: 41-key-migration-passphrase-retirement-rotation*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: spec/jasmine/TransitRotationSpec.js, 41-03-SUMMARY.md
- FOUND (ancestors of HEAD): 75bba892, fd08b9c1, 20f94c2d, e23e46a6, 78a1717b; ledger count 5 from e133fa45
