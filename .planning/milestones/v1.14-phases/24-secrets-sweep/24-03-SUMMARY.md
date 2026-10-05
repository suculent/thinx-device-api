---
phase: 24-secrets-sweep
plan: 03
subsystem: security
tags: [security, secrets, readSecret, oauth, rollbar, worker-secret, jasmine]

requires:
  - phase: 24-secrets-sweep
    provides: "24-01 SecretsSweepSpec harness (withSecrets, freshRequire, captureLogs); 24-02 worker validateJob reading /run/secrets/WORKER_SECRET first"
provides:
  - "builder.runRemoteShell sends readSecret(\"WORKER_SECRET\") as job.secret and refuses with worker_secret_missing when none resolves"
  - "queue.js connect_error retries only with a resolved WORKER_SECRET"
  - "GitHub and Google OAuth clients built only from a resolved secret; routes answer 400 otherwise"
  - "globals.js: at most one Rollbar client per process from ROLLBAR_SERVER_TOKEN, then ROLLBAR_ACCESS_TOKEN"
  - "rsakey.js keyPassphrase() via readSecret, matching git.js (D-04)"
  - "No direct env read of any of the 9 credentials (or ROLLBAR_SERVER_TOKEN) left under lib/"
affects: [24-04, 24-05, 24-06, SEC-CFG-03]

plan_head_before: 0419f96038fae97f521f25a274bb96adf36f5fec
plan_head_after: 4029e1af8aba598cfdb45c19f9b1c9225ca677ea

actuals:
  tokens: 9671
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-use credential with refusal: const s = readSecret(NAME); if (!s) { one info line; refuse via the existing refusal path; return }"
    - "Lazy client factory gated on the secret: buildX() returns undefined when the secret is falsy; the setup call and every retry go through it"
    - "Spec cache hygiene: _resetCacheForTests() after every env change to a readSecret-backed name, and again on restore"

key-files:
  created: []
  modified:
    - lib/thinx/builder.js
    - lib/thinx/queue.js
    - lib/router.github.js
    - lib/router.google.js
    - lib/thinx/globals.js
    - lib/thinx/rsakey.js
    - spec/jasmine/SecretsSweepSpec.js
    - spec/jasmine/BuilderRemoteJobSpec.js
    - spec/jasmine/BuilderPathSpec.js
    - spec/jasmine/03-RsakeySpec.js

key-decisions:
  - "BuilderRemoteJobSpec sets WORKER_SECRET (with cache resets) in an outer beforeEach, because every describe that expects runRemoteShell to emit would otherwise hit the new refusal locally, not only the two describes the plan named"
  - "An empty-string GITHUB_CLIENT_SECRET or GOOGLE_OAUTH_SECRET now disables that provider (readSecret truthiness), where GitHub used to build a client with an empty secret"
  - "The GitHub secure-callback path keeps its existing [critical] retry line; when the retry still yields no client it answers 400 and attaches no emitter handlers"

patterns-established:
  - "D-02 info lines for this plan: [builder] WORKER_SECRET, [router.github] GITHUB_CLIENT_SECRET, [router.google] GOOGLE_OAUTH_SECRET, [globals] ROLLBAR_SERVER_TOKEN, [rsakey] GIT_KEY_PASSPHRASE, each '<NAME> not set — <integration> disabled', name only"

requirements-completed: [SEC-CFG-02]

coverage:
  - id: D1
    description: "runRemoteShell emits job.secret from /run/secrets/WORKER_SECRET over a different env value; with neither it emits nothing, releases the worker, notifies worker_secret_missing and logs one info line"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderRemoteJobSpec.js#runRemoteShell job shape (D-01, D-04)"
        status: pass
      - kind: other
        ref: "WORKER-SECRET-API-SWEPT grep gate (direct=0 missing_reason=1 queue_read=1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "queue.js connect_error does nothing without WORKER_SECRET and retries once with the file value when present"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: WORKER_SECRET in queue.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "GitHub and Google OAuth: no factory / AuthorizationCode without a secret, login and callback answer 400 (Google before any Redis work), one info line; file secret wins over env when present"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: OAuth client secrets"
        status: pass
      - kind: other
        ref: "OAUTH-SWEPT grep gate (direct_secret=0 client_id_env=2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "globals.js builds at most one Rollbar client from the server-token chain before the access-token chain, none with one info line when both are absent; rsakey keyPassphrase via readSecret with empty-as-absent and file-wins; generate() refusal logs one info line"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: Rollbar server token in globals.js"
        status: pass
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: GIT_KEY_PASSPHRASE in rsakey.js"
        status: pass
      - kind: unit
        ref: "spec/jasmine/03-RsakeySpec.js#(11) should refuse to generate a key when GIT_KEY_PASSPHRASE is unset"
        status: pass
    human_judgment: false
  - id: D5
    description: "Whole-lib sweep: no non-comment direct or whole-object env read of the 9 credentials or ROLLBAR_SERVER_TOKEN; toggles and client ids untouched; combined local set green"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "SWEEP-COMPLETE gate (direct_env_reads=0 whole_env_uses=0 swept_toggles=0 csrf_enforce_env=1)"
        status: pass
      - kind: unit
        ref: "combined local set of 9 spec files (268 specs, 0 failures; also with the sweep spec last and with CI-style env values set)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full CI suite (ZZ-RouterOAuthSpec with real OAuth secrets, XBuilderSpec, MessengerSpec, 02-OwnerSpec) and live behaviour after deploy"
    verification: []
    human_judgment: true
    rationale: "Those specs need Redis, CouchDB and /mnt/data and run only in CircleCI; nothing is pushed in this plan (24-04 pushes and deploys)"

duration: 9min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 03: WORKER_SECRET, OAuth, Rollbar and passphrase through readSecret Summary

**The API now sends the mounted `/run/secrets/WORKER_SECRET` in remote jobs and refuses to dispatch without one. GitHub and Google OAuth clients exist only when their secret resolves, Rollbar is built once from the server-token chain, and `rsakey.js` reads the deploy-key passphrase the same way `git.js` does. After this plan no credential under `lib/` is read straight from env.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-09-28T23:46:08Z
- **Completed:** 2026-09-28T23:55Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 10 (6 lib, 4 spec)

## Accomplishments

- `builder.runRemoteShell` reads `readSecret("WORKER_SECRET")` after the argv wire-contract check. When it is falsy it logs `ℹ️ [info] [builder] WORKER_SECRET not set — remote builds disabled`, releases the worker, notifies `worker_secret_missing` and returns false, the same way the three existing refusals work. Otherwise `job.secret` is the resolved value, so after the D-07 rotation the API sends the file value even while env still holds the old one.
- `queue.js` `connect_error` reads `readSecret("WORKER_SECRET")` once and uses it for both the guard and `socket.auth.token`.
- `router.github.js`: a local `buildGithubOAuth()` returns `undefined` without a secret and otherwise builds the same specs object as before. It is called at setup (one info line when absent) and on the secure-callback retry. When the retry still has no client, the callback answers 400 and attaches no emitter handlers. `/api/oauth/github` keeps its 400 branch.
- `router.google.js`: `google_oauth_secret` comes from readSecret at module load and feeds `oAuthConfig.client.secret`. Without it, one info line is logged at load, and both the initiator and the callback return 400 as their first statement, before any session, Redis or `AuthorizationCode` work.
- `globals.js`: the readSecret require is hoisted into the IIFE header (the duplicate inside `redis_options` is gone). `load()` builds Rollbar only while `_rollbar === null`, from `readSecret("ROLLBAR_SERVER_TOKEN") || readSecret("ROLLBAR_ACCESS_TOKEN")`, with the same options as before. When neither resolves it logs the info line at most once per process.
- `rsakey.js`: `keyPassphrase()` reads `readSecret("GIT_KEY_PASSPHRASE")` and keeps its string/length guard. `generate()` logs `[rsakey] GIT_KEY_PASSPHRASE not set — deploy-key generation disabled` before the unchanged refusal error.
- Specs: SecretsSweepSpec grows from 16 to 32 cases (queue x2, OAuth x6, Rollbar x4, passphrase x4). Every case asserts that no fake value appears in any captured console line. BuilderRemoteJobSpec gains the refusal and file-wins cases. BuilderRemoteJobSpec, BuilderPathSpec and RsakeySpec case 11 reset the readSecret cache around every WORKER_SECRET / GIT_KEY_PASSPHRASE change.

## Task Commits

1. **Task 1 (tracer): WORKER_SECRET into the emitted job, D-02 refusal, spec updates** - `2b3dabfd` (feat)
2. **Task 2: GitHub and Google OAuth clients only from a resolved secret** - `2cfe0a55` (feat)
3. **Task 3: Rollbar server-token chain in globals.js, rsakey passphrase via readSecret** - `4029e1af` (feat)

**Plan metadata:** see the `docs(24-03)` commit that adds this file.

## Files Created/Modified

- `lib/thinx/builder.js` - job.secret from readSecret; `worker_secret_missing` refusal
- `lib/thinx/queue.js` - connect_error retry gated on readSecret
- `lib/router.github.js` - `buildGithubOAuth()`; 400 from the callback when disabled
- `lib/router.google.js` - secret from readSecret at load; 400 from both handlers when disabled
- `lib/thinx/globals.js` - hoisted readSecret; single Rollbar init from the server/access chain
- `lib/thinx/rsakey.js` - keyPassphrase via readSecret; info line before the generate refusal
- `spec/jasmine/SecretsSweepSpec.js` - queue, OAuth, Rollbar and passphrase cases
- `spec/jasmine/BuilderRemoteJobSpec.js` - refusal and file-wins cases; outer and per-describe cache resets
- `spec/jasmine/BuilderPathSpec.js` - WORKER_SECRET setup with cache resets in the D-12 describe
- `spec/jasmine/03-RsakeySpec.js` - cache reset after the delete and after the restore in case 11

## Verification Results

- Task 1: `SPECS-GREEN` (127 specs, 0 failures) and `WORKER-SECRET-API-SWEPT` (direct=0 missing_reason=1 queue_read=1). Acceptance: `secret: worker_secret` = 1, `WORKER_SECRET not set` = 1, `_resetCacheForTests` = 10 in BuilderRemoteJobSpec and 3 in BuilderPathSpec. Tracer gate (interactive, end-of-phase, automated-only verify): the verify was re-run after the commit and passed before expansion.
- Task 2: `SWEEP-SPEC-GREEN` (24 specs, 0 failures) and `OAUTH-SWEPT` (direct_secret=0 client_id_env=2). `GITHUB_CLIENT_SECRET not set` = 1, `GOOGLE_OAUTH_SECRET not set` = 1, `buildGithubOAuth()` = 3.
- Task 3: `SPECS-GREEN` (268 specs, 0 failures), `RSAKEY-11-GREEN` (1 spec, 0 failures) and `SWEEP-COMPLETE` (direct_env_reads=0 whole_env_uses=0 swept_toggles=0 csrf_enforce_env=1). `readSecret("ROLLBAR_SERVER_TOKEN")` = 1, `ROLLBAR_SERVER_TOKEN not set` = 1, `readSecret("GIT_KEY_PASSPHRASE")` = 1 in rsakey.js, `require("./secrets.js")` = 1 in globals.js, and git.js:245 still reads the passphrase through readSecret. `git status --porcelain -- lib spec` is empty, and `git log --format=%s -3` shows the three 24-03 commits.
- Extra: the combined set is also green with SecretsSweepSpec run last, and with CI-style values in env for WORKER_SECRET, both OAuth secrets and client ids, ROLLBAR_ACCESS_TOKEN, GIT_KEY_PASSPHRASE, SLACK_WEBHOOK and MAILGUN_API_KEY (268 specs, 0 failures; RsakeySpec case 11 also passes). ESLint is clean on all 10 files.

## TDD Evidence

- **Task 1 (tracer), test first:** the three new cases failed on their assertions before the lib change: file wins (`'spec-env-worker-secret'` vs the file value), refusal (`true` vs `false`), queue retry (`0` vs `1`). The queue "absent" case already passed, because the old `typeof` guard also skipped the retry when env was unset.
- **Task 2 RED:** all six OAuth cases failed on planned-behaviour assertions. `gsd_run check tdd-red-evidence` on a TAP rendering of that run returned `RED_EVIDENCE_OK` (target "builds no client, answers 400 on login and callback when the secret is absent", 24 tests, 6 failing). GREEN: 24/24.
- **Task 3 RED:** five of the eight cases failed on assertions (Rollbar absent/server-file/chain-order, passphrase file-wins, generate info line). `RED_EVIDENCE_OK` (target "prefers the server token file over the access token", 32 tests, 5 failing). The absent and empty passphrase cases and the access-token fallback already held under the old code. GREEN: 32/32.
- REFACTOR: none needed.
- As in 24-01, the plan asks for one conventional commit per task, and acceptance checks `git log --format=%s -3` for the three task commits. RED was verified with the checker but not committed on its own.

## Decisions Made

- The BuilderRemoteJobSpec outer `beforeEach`/`afterEach` provides a WORKER_SECRET for every describe. The redaction, refusal, WR-03 delivery, busy-tracking, job-status and reservation describes all expect runRemoteShell to emit, and locally none of them set the env var.
- The refusal case checks the release through worker state (`running`/`dispatched` cleared) rather than by stubbing `releaseWorker`.
- Empty-string OAuth secrets now count as absent, following readSecret truthiness (D-02). With a non-empty secret, both routers behave as before.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WORKER_SECRET setup for all runRemoteShell describes in BuilderRemoteJobSpec**
- **Found during:** Task 1
- **Issue:** The plan adds WORKER_SECRET setup only to the job-shape and socket describes. At least six other describes in the same file call `runRemoteShell` and expect an emit. Locally WORKER_SECRET is unset, so each of them would get the new `worker_secret_missing` refusal.
- **Fix:** An outer-level `beforeEach`/`afterEach` in "Builder remote job protocol" sets `spec-worker-secret`, resets the readSecret cache, and restores the original value (and resets again) afterwards. The per-describe setup the plan asked for is also in place.
- **Files modified:** spec/jasmine/BuilderRemoteJobSpec.js
- **Verification:** 127/127 locally and with a CI-style WORKER_SECRET in env
- **Committed in:** 2b3dabfd

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Spec setup only. No change to lib behaviour or scope.

## Issues Encountered

- With GitHub OAuth disabled, every hit on the callback still logs the pre-existing `[critical] [githubOAuth] undefined on secure! attempting to fix...` line before answering 400. It was kept so behaviour with the secret present stays unchanged. It could be downgraded later if it turns out to be noise in production, where the secret is set.

## Known Stubs

None.

## User Setup Required

None. No secret is created in this plan. Plan 24-04 pushes and deploys the code before any `--secret-add` (D-05).

## Next Phase Readiness

- The API side of the D-07 WORKER_SECRET rotation is ready. It pairs with the worker change from 24-02, and both read `/run/secrets/WORKER_SECRET` first. Roll the two services together (D-12).
- The uncommitted `services/worker` and `services/transformer` gitlinks from 24-02 were not touched here; plan 24-04 commits them.
- CI coverage for ZZ-RouterOAuthSpec, XBuilderSpec, MessengerSpec and 02-OwnerSpec comes when 24-04 pushes. Nothing is pushed here.
- Rollout note: readSecret caches per name for the life of the process, so a newly mounted secret takes effect on task restart. `docker service update --secret-add` restarts the task.

## Self-Check: PASSED

- FOUND: lib/thinx/builder.js, lib/thinx/queue.js, lib/router.github.js, lib/router.google.js, lib/thinx/globals.js, lib/thinx/rsakey.js, spec/jasmine/SecretsSweepSpec.js, spec/jasmine/BuilderRemoteJobSpec.js, spec/jasmine/BuilderPathSpec.js, spec/jasmine/03-RsakeySpec.js
- FOUND commits: 2b3dabfd, 2cfe0a55, 4029e1af
- `git rev-list --count 0419f960..HEAD` = 3 before the metadata commit

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*
