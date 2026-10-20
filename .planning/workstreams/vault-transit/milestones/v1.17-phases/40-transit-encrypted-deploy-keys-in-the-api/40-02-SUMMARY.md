---
phase: 40-transit-encrypted-deploy-keys-in-the-api
plan: 02
subsystem: api
tags: [openbao, transit, ssh-agent, ssh-add, deploy-keys, keyformat, git, builder, jasmine, node-test]

requires:
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "40-01 lib/thinx/transit.js (Transit.shared, encryptKey, decryptKey, TransitError.reason, unavailableSentence), scripts/openbao-dev.sh, the OpenBao dev server"
provides:
  - "lib/thinx/keyformat.js: detect(text) and readKey(filePath) -> {kind, text, cause}, MAX_KEY_FILE_BYTES 65536"
  - "rsakey generate(): Transit-only key storage (one vault:vN: line, wx 0600), err.code key_service_unavailable plus err.reason on refusal, transitClient() seam"
  - "git.js: AGENT_SSH_COMMAND, agentEnv, transitClient, withAgent, transitAttempt, fetchDetailed {ok, keyUnavailable}; fetch() still a boolean"
  - "builder.js: prefetchPrivate(br, BUILD_PATH, url, branch, outcome) and the D-04 build-log line"
  - "spec/fixtures/fake-transit.js shared fake Transit for every key spec"
  - "KeyFormatSpec with the format invariant"
affects: [40-03, 40-04, 40-05, 41]

actuals:
  tokens: 14161
  tasks: 3
  commits: 4
plan_head_before: 50633b29e14b6784a53c986cd3c9884946f21643
plan_head_after: fa311961a1a2b7b84ad8722e5e1f56f4f3a9008a

tech-stack:
  added: []
  patterns:
    - "Per-attempt ssh-agent: ssh-agent -D -a <mkdtemp 0700>/agent.sock -t 1260, ssh-add -q - with the PEM on stdin, env {PATH} / {PATH, SSH_AUTH_SOCK} only, derived public key for -i, finally: SIGTERM then SIGKILL, guarded rm, Buffer.fill(0)"
    - "Key files classified by content at attempt time (keyformat.readKey), never by name; odd files skipped with a fixed cause"
    - "Coded errors whose message equals the code on the Transit-key path, so no log line can carry more than the code"
    - "Detailed result beside a boolean wrapper (fetchDetailed / fetch) to keep existing callers unchanged"

key-files:
  created:
    - lib/thinx/keyformat.js
    - spec/fixtures/fake-transit.js
    - spec/jasmine/KeyFormatSpec.js
  modified:
    - lib/thinx/rsakey.js
    - lib/thinx/git.js
    - lib/thinx/builder.js
    - spec/jasmine/GitSpec.js
    - spec/jasmine/TransitIntegrationSpec.js
    - spec/jasmine/03-RsakeySpec.js
    - spec/node/DeployKeyNames.test.js
    - spec/jasmine/SecretsSweepSpec.js
    - spec/jasmine/BuilderRemoteJobSpec.js

key-decisions:
  - "The plaintext inside every new ciphertext is bare unencrypted PKCS#8 PEM with no owner header and no Transit AAD; the cross-owner swap stays an accepted residual (T-40-09)."
  - "keyUnavailable is the reason of the first Transit key that rejected decryption (any TransitError reason, bad_ciphertext included), and only when no attempt succeeded."
  - "withAgent maps every failure before the clone to two codes: mkdtemp, spawn, early exit or no socket within 2 s give agent_start_failed; ssh-add failure, its 10 s timeout or a public key that cannot be derived give agent_load_failed."
  - "agentEnv deletes SSH_ASKPASS, SSH_ASKPASS_REQUIRE and GIT_KEY_PASSPHRASE explicitly, so an inherited value can never reach a Transit attempt; baseEnv drops SSH_AUTH_SOCK and SSH_AGENT_PID for every path."
  - "The derived public key in the agent directory is written wx 0600 with the comment thinx-agent; the .pub on the shared volume is never used for -i."
  - "A refused generation logs one line: deploy-key generation refused: key service unavailable (<reason>)."

patterns-established:
  - "Log vocabulary: [git] key <name> skipped: deploy key unavailable: <reason>; [git] key <name> skipped: <cause>; [git] key <name> skipped: agent_start_failed | agent_load_failed"
  - "Build-log line: deploy key unavailable: <Transit.unavailableSentence(reason)>"
  - "Key specs inject spec/fixtures/fake-transit.js as rsakey.transit or git.transit"

requirements-completed: [KEYENC-01, KEYENC-02, KEYENC-03, KEYENC-06]

coverage:
  - id: D1
    description: "A new key is stored as exactly one vault:vN: line (wx, 0600), the .pub stays OpenSSH, no file contains PRIVATE KEY"
    requirement: KEYENC-01
    verification:
      - kind: integration
        ref: "bash scripts/openbao-dev.sh run -- npx jasmine --config=/dev/null --random=false spec/jasmine/TransitIntegrationSpec.js#(E1) (8 specs, 0 failures)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/03-RsakeySpec.js#(300); spec/node/DeployKeyNames.test.js#two creates in the same millisecond"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Transit key is decrypted in memory, loaded with ssh-add - into its own ssh-agent, used through AGENT_SSH_COMMAND, with no askpass or passphrase in the env, and cleaned up"
    requirement: KEYENC-02
    verification:
      - kind: integration
        ref: "spec/jasmine/TransitIntegrationSpec.js#(E1) (agent fingerprint equals the .pub fingerprint, socket dir 0700, holds agent.sock and key.pub only, removed afterwards)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#(T5) (T6) (T7); spec/jasmine/KeyFormatSpec.js#format invariant"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generation refuses with key_service_unavailable and the reason class when Transit fails, writes no private file and never reads GIT_KEY_PASSPHRASE, even when it is set"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/jasmine/03-RsakeySpec.js#(11); spec/jasmine/SecretsSweepSpec.js#generate() with the passphrase set and Transit unavailable; spec/node/DeployKeyNames.test.js#a create refused by Transit releases the claimed .pub"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dual read by file content: legacy (encrypted PKCS#8 and pre-2022 unencrypted) keeps the askpass path, Transit uses the agent path, unknown / directory / oversized / dangling entries are skipped with their cause"
    requirement: KEYENC-06
    verification:
      - kind: unit
        ref: "spec/jasmine/KeyFormatSpec.js (detect table, readKey causes, invariant); spec/jasmine/GitSpec.js#(T4) and the unchanged (g), (h), askpass and lock cases"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-01 skip and continue: an undecryptable Transit key is skipped and a working legacy key still builds; D-04 build-log line before the existing error state"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#(T1) (T2) (T3) (l); spec/jasmine/BuilderRemoteJobSpec.js#deploy key unavailable build-log line (Phase 40, D-04)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real private-repo clone over ssh with a Transit key, and the container PID 1 / orphaned-agent assumption"
    requirement: KEYENC-02
    verification: []
    human_judgment: true
    rationale: "No sshd exists in the local or CI test environment; the spy proves the agent from inside the attempt. The real clone and the PID 1 check are the operator UAT in Plan 40-05."

duration: 16min
completed: 2026-10-19
status: complete
---

# Phase 40 Plan 02: Transit Deploy-Key Storage and Agent Fetch Summary

**New deploy keys are written as one OpenBao Transit `vault:vN:` line at mode 0600. A keyed build reads each key file by content: a Transit key is decrypted in memory into its own throwaway `ssh-agent`, a legacy passphrase key keeps the askpass path, and anything else is skipped. An undecryptable Transit key falls through to the owner's other keys, and when nothing works the build log says `deploy key unavailable: <reason sentence>`.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-10-19T00:46:54Z
- **Completed:** 2026-10-19T01:03:12Z
- **Tasks:** 3
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments
- `lib/thinx/keyformat.js`: `detect()` follows the interface regexes. `readKey()` opens the file once with `openSync(path, "r")` (it follows symlinks, as `ssh -i` does), checks it is a regular file with `fstat`, reads at most 64 KiB + 1 bytes, zeroes its read buffer and closes the descriptor in `finally`. It never returns content other than the trimmed ciphertext.
- `rsakey.generate()` no longer reads the passphrase:
  - It makes an RSA-4096 key whose private half is unencrypted PKCS#8 PEM in memory only.
  - It awaits `transitClient().encryptKey(Buffer)` and zeroes the Buffer in `finally`.
  - It writes `ciphertext + "\n"` with `wx`/0600, then the `.pub` as before, keeping the 38 WR-02/WR-03 cleanup rule.
  - It calls back `(null, opensshKey)` with no private-key argument.
  - When Transit refuses, the Error has the code `key_service_unavailable` and the reason class, and nothing is written.
- `git.js`:
  - `AGENT_SSH_COMMAND` is a constant string: `IdentitiesOnly`, publickey only, `BatchMode=yes`, `IdentityAgent=$SSH_AUTH_SOCK` and `-i "$THINX_GIT_KEY_PUB"`.
  - `agentEnv()` carries no askpass variables and no passphrase.
  - `withAgent()` starts the agent with `-t 1260` in production (`2 * gitTimeoutMs / 1000 + 60`) and polls up to 2 s for the socket. `ssh-add` gets 10 s. The agent is stopped with SIGTERM, then SIGKILL after 2 s. The directory is removed under a guard: it must be a direct child of `os.tmpdir()` with the `thinx-agent-` prefix.
  - Each key is classified at attempt time.
  - `fetchDetailed()` resolves `{ok, keyUnavailable}`, and `fetch()` is `fetchDetailed(...).then(r => r.ok === true)`. `sources.js` and `devices.js` are unchanged.
- `builder.prefetchPrivate()` takes an optional `outcome` object, still resolves a boolean and still makes no CouchDB call. `run_build` writes `deploy key unavailable: <sentence>` before the existing `error` state and callback `git_fetch_failed`.
- Every key spec now runs on `spec/fixtures/fake-transit.js`, which uses the real `TransitError`. Before this plan, three of them silently lost their meaning without OpenBao: the WR-02 chmod EIO case, the WR-03 ENOSPC case and the release case passed only because the create failed earlier.

## Task Commits

1. **Task 1: tracer, Transit key end to end** - `9110e8c9` (feat)
2. **Task 2: regression net on a shared fake Transit** - `2f045b06` (test)
3. **Task 3: D-01 skip and continue, D-04 build-log line, edge files, format invariant (TDD)**
   - RED: `392213fb` (test)
   - GREEN: `fa311961` (feat)

No REFACTOR commit was needed.

## Tracer Feedback Gate (Task 1)

Interactive run, `human_verify_mode` end-of-phase, and the tracer `<verify>` is automated-only, so the verify was re-run and there was no checkpoint. Both commands passed: the integration spec gave `8 specs, 0 failures` with no pending spec and no `PRIVATE KEY` or `vault:vN:` in the output, and GitSpec gave `41 specs, 0 failures`. The plan then went on to expansion.

## TDD Gate Compliance

- **Task 2 (`tdd="true"`, test-only by design).** The plan forbids touching `lib/` in this task, and Task 1 already shipped the behaviour, so the new assertions were green on their first run. There is a `test(40-02)` commit and no `feat` commit, which is intended. The RED evidence is the state just before Task 2: the existing specs, run against Task 1 code without the fake, failed in the places the regression net replaces.
  - `03-RsakeySpec`: `17 specs, 11 failures`, every create-dependent case (300, 01, 02, 03, 04, 04b, 03b, 06, 07, 12, 14).
  - `DeployKeyNames`: 2 of 40 failed, IN-08 and G1.
  - `SecretsSweepSpec`: 1 of 44 failed, the old passphrase-absent generate case.
  - Semantic assessment: this is not a classic RED. It shows that the old specs depended on OpenBao or the passphrase, which is what Task 2 removes.
- **Task 3.** RED (`392213fb`): `npx jasmine ... KeyFormatSpec.js GitSpec.js BuilderRemoteJobSpec.js BuilderApiKeySpec.js` exited 3 with `209 specs, 7 failures`, and the 7 were exactly the planned targets:
  - T1 to T5: `git.fetchDetailed is not a function`;
  - (l): `expected true to equal false`, because prefetchPrivate did not read fetchDetailed;
  - the D-04 builder case: `expected [ 'undefined' ] to deeply equal [ 'object' ]`, because no outcome was passed.
  
  The other 202 passed, including KeyFormatSpec's table and the invariant, which hold on the Task 1 dispatch. Semantic assessment: valid RED. Every failure is the absence of a planned API or behaviour, and none is a fixture, load or syntax fault. `check tdd-red-evidence` was not run, because the jasmine console reporter is not a supported format and `workflow.tdd_mode` is off for this workstream (same as 40-01). GREEN (`fa311961`): `209 specs, 0 failures`.

## Verification Results

All runs had `GIT_KEY_PASSPHRASE` absent from the invoking environment (presence-checked with `${GIT_KEY_PASSPHRASE+x}`, value never printed).

| Command | Result |
|---|---|
| `bash scripts/openbao-dev.sh run -- npx jasmine --config=/dev/null --random=false spec/jasmine/TransitIntegrationSpec.js` (Task 1 verify, rerun as Task 3 verify 2 after fetchDetailed) | `8 specs, 0 failures`, no pending, no PEM header or ciphertext in output, no leftover container |
| `npx jasmine ... spec/jasmine/GitSpec.js` (Task 1) | `41 specs, 0 failures` |
| `node -e "...k.detect(...)..."` (Task 1 acceptance) | exit 0 |
| `grep -nE "cipher: *.aes-256-cbc" lib/thinx/rsakey.js` (non-comment) | no match |
| `npx jasmine ... --filter='^RSA Key \((?!13\))' spec/jasmine/03-RsakeySpec.js` | `17 specs, 0 failures` |
| `node --test spec/node/DeployKeyNames.test.js` | 41 tests, 41 pass |
| `npx jasmine ... SecretsSweepSpec.js GitSpec.js` (Task 2) | `85 specs, 0 failures` |
| `grep -c "fake-transit" spec/jasmine/03-RsakeySpec.js spec/node/DeployKeyNames.test.js` | 1 and 1 |
| `npx jasmine ... KeyFormatSpec.js GitSpec.js BuilderRemoteJobSpec.js BuilderApiKeySpec.js && git diff --quiet HEAD -- lib/thinx/sources.js lib/thinx/devices.js` (Task 3) | `209 specs, 0 failures`, exit 0 |
| `grep -n "fetchDetailed" lib/thinx/builder.js` | 2 lines |
| Plan-level: `npx jasmine ... GitSpec KeyFormatSpec SecretsSweepSpec BuilderRemoteJobSpec BuilderApiKeySpec TransitSpec` | `280 specs, 0 failures` |
| `node --test spec/node/*.test.js` | 130 tests, 130 pass |
| `npx eslint` on every changed file | exit 0 |
| `thinx-agent-*` entries in `os.tmpdir()` after all runs | 0 |

## Files Created/Modified
- `lib/thinx/keyformat.js`: the format detector and the bounded reader.
- `lib/thinx/rsakey.js`: requires `transit.js`; adds `transitClient()`; rewrites `generate()`. `keyPassphrase()`, `create()`, list, rename, revoke and the name rules are untouched.
- `lib/thinx/git.js`:
  - helpers `codedError`, `waitForExit`, `waitForSocket`, `loadIntoAgent`;
  - `AGENT_SSH_COMMAND`; `baseEnv()` now drops the inherited agent;
  - `agentEnv`, `transitClient`, `withAgent`, `stopAgent`, `removeAgentDir`, `transitAttempt`, `fetchDetailed`;
  - per-key dispatch in `fetchHoldingLock`.
  - The legacy path (askpass helper, `SSH_COMMAND`, `sshEnv`) is unchanged.
- `lib/thinx/builder.js`: requires `transit.js`; the `prefetchPrivate` outcome; the D-04 line in `run_build`.
- `spec/fixtures/fake-transit.js`: the fake (failing modes per operation, call counters, unknown ciphertext gives bad_ciphertext, no I/O).
- `spec/jasmine/KeyFormatSpec.js`: 31 cases. The invariant uses a 2048-bit throwaway key generated at run time in three encodings.
- `spec/jasmine/GitSpec.js`: the k1/k2 legacy placeholders, T1 to T7, and (l).
- `spec/jasmine/TransitIntegrationSpec.js`: the `deploy key end to end` describe (E1).
- `spec/jasmine/03-RsakeySpec.js`, `spec/node/DeployKeyNames.test.js`, `spec/jasmine/SecretsSweepSpec.js`, `spec/jasmine/BuilderRemoteJobSpec.js`: as described above.

## Decisions Made
See key-decisions in the frontmatter. Downstream plans most need these:
- `generate()` errors carry `code === "key_service_unavailable"` and `reason`. `create()` still answers `callback(false)` on any generate error and logs the Error object (message, code and reason only). Plan 40-03 maps it.
- `fetchDetailed` is the API for any future caller that needs the reason.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Inherited askpass variables explicitly removed from the agent env**
- **Found during:** Task 1
- **Issue:** `agentEnv` starts from `baseEnv()`, which copies `process.env`. A container env holding `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE` or `GIT_KEY_PASSPHRASE` would otherwise reach a Transit attempt, against KEYENC-02 and T-40-07.
- **Fix:** `agentEnv` deletes all three after the assign.
- **Files modified:** lib/thinx/git.js
- **Verification:** the E1 spy and the KeyFormatSpec invariant assert their absence.
- **Committed in:** 9110e8c9

**2. [Rule 2 - Missing critical] readKey zeroes its read buffer**
- **Found during:** Task 1
- **Issue:** a legacy pre-2022 file holds an unencrypted private key, and the detector reads it in full.
- **Fix:** the bounded read Buffer is `fill(0)`'d in `finally`. The decoded string cannot be wiped and is not returned.
- **Files modified:** lib/thinx/keyformat.js
- **Committed in:** 9110e8c9

### Clarifications (no behaviour beyond the plan)
- **DeployKeyNames IN-08 assertion.** It matched `BEGIN ENCRYPTED PRIVATE KEY` on the private file. Under Transit that same outcome is "the file is transit, has no PEM header and is 0600", so the assertion was updated. WR-02 now also asserts that Transit was called, which proves the chmod failure path is really reached.
- **withAgent failure codes** cover mkdtemp/spawn and public-key derivation too (see key-decisions). The plan names only the poll and ssh-add failures. This keeps the rule "raise only coded errors".
- **Extra cases T6 and T7.** T6 covers the inherited-agent env (T-40-08). T7 covers concurrent fetches into different checkouts getting different agents (the KEYENC-02 concurrency truth). Neither was in the behavior list.

**Total deviations:** 2 auto-fixed (both Rule 2). **Impact:** both narrow a leak path the threat model already names; no scope creep.

## Issues Encountered
- **commitlint.** Three of the four task commits have a header or a body line over commitlint's 100-character limit: Task 1 (102-character header), Task 2 (107-character header), and a body line in the Task 3 RED and GREEN commits. No hook and no CI job runs commitlint here; only the optional `lint:commit` script does. The commits were not rewritten, because that would need a forced move of `thinx-staging`. Future commit messages should stay under 100 characters.
- **Not run locally:** `GitHubSpec` (000) and `ZZ-RouterRSAKeySpec` call the real `rsakey.create()` and need the CI services. In CI the dev-server env (`BAO_*`) reaches the api container, so `Transit.shared()` works there. The first `thinx-unit` run in Plan 40-05 is the check.

## Threat Flags
None beyond the plan's threat model. The new surface is the `ssh-agent`/`ssh-add` children and the agent socket directory (T-40-06, T-40-10) and the key-file reader (T-40-11), all registered.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- Ready for 40-03: map `err.code === "key_service_unavailable"` in `create()`, the kill switch, the router 503 and the consoles.
- Open until 40-05:
  - the first CI run with the new specs, with `ssh-agent`/`ssh-add` in the API test image (`thinxcloud/base` has `openssh-client`);
  - a real private-repo clone with a Transit key;
  - the container PID 1 check for the orphaned-agent assumption.
- Nothing was pushed.

---
*Phase: 40-transit-encrypted-deploy-keys-in-the-api*
*Completed: 2026-10-19*

## Self-Check: PASSED
