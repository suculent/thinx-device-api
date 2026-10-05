---
phase: 24-secrets-sweep
plan: 01
subsystem: security
tags: [security, secrets, readSecret, mailgun, slack, docker-secrets, jasmine]

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "lib/thinx/secrets.js readSecret() with _resetCacheForTests, already used by globals/database/git"
provides:
  - "MAILGUN_API_KEY resolved via readSecret in owner.js and transfer.js; no Mailgun client and fail-fast sendMail when absent"
  - "SLACK_BOT_TOKEN (messenger), SLACK_CLIENT_SECRET (router.slack), SLACK_WEBHOOK (notifier, redis-health) resolved via readSecret with D-02 off-switches"
  - "spec/jasmine/SecretsSweepSpec.js harness: withSecrets, freshRequire, captureLogs (reused by 24-03)"
affects: [24-02, 24-03, 24-04, 24-05, SEC-CFG-03]

plan_head_before: f25662b3da36ace23b66aef169f790fb51627600
plan_head_after: 485826d462a7a74e682c7d5845e98c2e3137bab0

actuals:
  tokens: 6941
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Module-load credential: const key = readSecret(NAME); client = key ? build(key) : null; one info line when null; every call site guards null"
    - "Spec isolation: fs wrappers answer only /run/secrets/<owned names> and delegate everything else; freshRequire evicts modules first loaded during the swap"

key-files:
  created:
    - spec/jasmine/SecretsSweepSpec.js
  modified:
    - lib/thinx/owner.js
    - lib/thinx/transfer.js
    - lib/thinx/messenger.js
    - lib/router.slack.js
    - lib/thinx/notifier.js
    - lib/thinx/redis-health.js

key-decisions:
  - "freshRequire evicts every module first loaded during a fresh require, so an instance built under a swapped secret (e.g. owner.js pulled in by transfer.js) is never served to later suites"
  - "SecretsSweepSpec preloads its target modules in beforeAll under the real env (as CI bootstrap does), so freshRequire re-evaluates only the target, not its dependency tree"
  - "router.slack /api/slack/redirect returns the profile-help redirect early when SLACK_CLIENT_SECRET is absent; SLACK_CLIENT_ID stays a plain env read"

patterns-established:
  - "D-02 info line: ℹ️ [info] [<module>] <NAME> not set — <integration> disabled (name only, never the value)"
  - "Harness: withSecrets({NAME: {file}|{env}|{file,env}|'absent'}, fn) + freshRequire(relPath, {moduleId: fakeExports}) + captureLogs(fn)"

requirements-completed: [SEC-CFG-02]

coverage:
  - id: D1
    description: "MAILGUN_API_KEY flows /run/secrets file -> readSecret -> Mailgun client -> sendMail in owner.js and transfer.js; absent or empty key builds no client and fails sendMail fast with one info line per module"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: MAILGUN_API_KEY"
        status: pass
      - kind: other
        ref: "MAILGUN-SWEPT grep gate (no direct env read of MAILGUN_API_KEY in owner.js/transfer.js)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SLACK_BOT_TOKEN, SLACK_CLIENT_SECRET and SLACK_WEBHOOK resolve through readSecret; absent cases create no RTMClient, send no slack.com token exchange (redirect kept), and build no slack-notify client"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: Slack credentials"
        status: pass
      - kind: other
        ref: "SLACK-SWEPT grep gate (no direct env read of the four names in the six lib files; SLACK_CLIENT_ID still env)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SecretsSweepSpec restores env, readSecret cache, fs functions and require.cache so later suites are unaffected"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "combined local set SecretsSweepSpec+SecretsSpec+NotifierSpec+RedisHealthSpec+RedactSlackSpec (44 specs, 0 failures)"
        status: pass
      - kind: unit
        ref: "wider local set incl. GitSpec, SanitkaSpec, BuilderRemoteJobSpec, BuilderPathSpec with the sweep spec first and last (251 specs, 0 failures each)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full CI suite (MessengerSpec, 02-OwnerSpec, ZZ-RouterOAuthSpec with real CI env values) stays green"
    verification: []
    human_judgment: true
    rationale: "Those specs need Redis and /mnt/data and only run in CircleCI; nothing is pushed in this plan (24-04 pushes)"

duration: 7min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 01: Mailgun and Slack credentials through readSecret Summary

**MAILGUN_API_KEY, SLACK_BOT_TOKEN, SLACK_CLIENT_SECRET and SLACK_WEBHOOK now resolve file -> env -> off through readSecret(). An absent credential builds no client and logs one info line naming it. A new SecretsSweepSpec harness (withSecrets, freshRequire, captureLogs) proves every case with fake values that never reach a log.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-09-28T23:27:31Z
- **Completed:** 2026-09-28T23:35Z
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- `owner.js` and `transfer.js` read `readSecret("MAILGUN_API_KEY")` once at module load. `mg` is `null` when the key is absent or empty, `sendMail` returns `callback(false, type + "_failed")` before any network call, and each module logs `ℹ️ [info] [owner|transfer] MAILGUN_API_KEY not set — Mailgun e-mail disabled` once.
- `messenger.js` reads `readSecret("SLACK_BOT_TOKEN")` in `getBotToken` and `initSlack`, keeping the order where the configured token overrides the Redis-saved one. The old `☣️ [error]` skip line is now the D-02 info line. `this.DISABLE_SLACK = true` is untouched.
- `router.slack.js` `/api/slack/redirect`: when `readSecret("SLACK_CLIENT_SECRET")` is falsy it logs the info line and issues the same profile-help redirect without building slack.com options or calling `https.get`. `SLACK_CLIENT_ID` is still a plain env read.
- `notifier.js` (app-start and build-status paths) and `redis-health.js` (when `opts.webhook` is not given) read `readSecret("SLACK_WEBHOOK")`. Their existing info lines are unchanged.
- `spec/jasmine/SecretsSweepSpec.js`: 16 specs covering absent, empty-env, env-only and file-wins (adjacency) for Mailgun, and absent/file/file-wins for the three Slack credentials. Every case asserts that no fake value appears in captured console output.

## Task Commits

1. **Task 1 (tracer): MAILGUN_API_KEY through owner.js/transfer.js plus SecretsSweepSpec harness** - `f51f9741` (feat)
2. **Task 2: Slack bot token, OAuth client secret and webhook through readSecret** - `485826d4` (feat)

**Plan metadata:** see the `docs(24-01)` commit that adds this file.

## Files Created/Modified

- `spec/jasmine/SecretsSweepSpec.js` - Phase 24 harness and the Mailgun/Slack cases
- `lib/thinx/owner.js` - Mailgun client from readSecret, null-guarded sendMail
- `lib/thinx/transfer.js` - Mailgun client from readSecret, null-guarded sendMail
- `lib/thinx/messenger.js` - Slack bot token from readSecret, D-02 info line
- `lib/router.slack.js` - Slack OAuth client secret from readSecret, no token exchange when absent
- `lib/thinx/notifier.js` - Slack webhook from readSecret on both notification paths
- `lib/thinx/redis-health.js` - Slack webhook from readSecret when `opts.webhook` is not given; header comment updated

## Verification Results

- Task 1 verify: `SWEEP-SPEC-GREEN` (7 specs, 0 failures) and `MAILGUN-SWEPT` (owner=1 transfer=1 direct=0). The tracer gate (interactive, end-of-phase, automated-only verify) was re-run after the commit and passed before expansion.
- Task 2 verify: `SWEEP-SPEC-GREEN` (16 specs, 0 failures), `SPECS-GREEN` (44 specs, 0 failures), `SLACK-SWEPT` (direct=0, client_id_env=2).
- Acceptance greps: `readSecret("SLACK_BOT_TOKEN")` x2 in messenger, `readSecret("SLACK_WEBHOOK")` x2 in notifier, `readSecret('SLACK_WEBHOOK')` x1 in redis-health, `readSecret("SLACK_CLIENT_SECRET")` x1 in router.slack. Each "not set" line is present, `this.DISABLE_SLACK = true` is still there, `mg === null` is in both Mailgun modules, all three helpers are defined, and there are no COUCHDB_*/REDIS_PASSWORD assignments in the spec.
- Extra: a wider local set (plus GitSpec, SanitkaSpec, BuilderRemoteJobSpec, BuilderPathSpec) gives 251 specs, 0 failures, with the sweep spec run first and run last. The developer shell's real MAILGUN_API_KEY (and any Slack values set) does not appear in any run's output. This was checked by substring match without printing the value.
- ESLint on all seven files: clean.

## TDD Evidence (Task 2, tdd="true")

- RED: the 9 Slack cases were written first. 7 failed on planned-behavior assertions, and the notifier/redis-health absent cases already passed because those info lines existed. `gsd_run check tdd-red-evidence` on a TAP rendering of that run returned `RED_EVIDENCE_OK` (target "exchanges the code with the client secret from the secret file", exit 3).
- GREEN: after the four lib changes, 16/16 passed.
- REFACTOR: none needed.
- The plan asks for exactly one conventional commit per task (acceptance: `git log --format=%s -2` shows the two task commits), so RED was verified but not committed on its own. Task 1 (tracer) followed the same test-first order: 6 of 7 cases failed RED before the Mailgun change.

## Decisions Made

- `freshRequire.restore()` evicts every module that was first loaded during the fresh require. Without that, a dependency loaded under a swapped secret stays cached (with `mg = null`, for example) and is served to later suites.
- The spec preloads its target modules in `beforeAll` under the real environment, the same way `spec/helpers/bootstrap.js` does in CI, so a fresh require re-evaluates only the target.
- `sendMail` is exercised as `Klass.prototype.sendMail.call({}, …)`, because it only touches the module-level client and `app_config`, and constructing `Owner`/`Transfer` would need Redis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] freshRequire leaked dependency instances built under a swapped secret**
- **Found during:** Task 1
- **Issue:** Loading `transfer.js` fresh also loaded `owner.js` for the first time (through `devices.js`) while the key was absent. That produced a second "not set" line, and an `owner.js` instance with `mg = null` stayed in `require.cache` for later suites.
- **Fix:** `restore()` now deletes every cache entry that did not exist before the fresh require. The spec preloads the targets in `beforeAll`, and the "not set" counts are scoped by module tag (`[owner]`, `[transfer]`).
- **Files modified:** spec/jasmine/SecretsSweepSpec.js
- **Verification:** 7/7, then 16/16, then 251/251 in both orders
- **Committed in:** f51f9741

**2. [Rule 2 - Missing critical] captureLogs also captures console.info/warn/error**
- **Found during:** Task 1
- **Issue:** The plan swaps only `console.log`. A credential leaked through `console.error` would go unnoticed.
- **Fix:** captureLogs swaps log, info, warn and error and restores all four in `finally`. Lines are built with `util.format`, so logged objects are checked too.
- **Files modified:** spec/jasmine/SecretsSweepSpec.js
- **Committed in:** f51f9741

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical). Both were in test isolation or the leak check. No production scope change.
**Impact on plan:** None on lib behaviour. The harness is stricter than specified, which plan 24-03 inherits.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None. No secret is created in this plan. Plan 24-04 pushes and deploys the code before any `--secret-add` (D-05).

## Next Phase Readiness

- The harness is ready for plan 24-03 (GitHub, Google, Rollbar, WORKER_SECRET, GIT_KEY_PASSPHRASE). `withSecrets`, `freshRequire` and `captureLogs` are top-level in `SecretsSweepSpec.js`.
- Behaviour note for rollout: `readSecret` caches per name for the life of the process, so the per-request reads (router.slack, notifier, messenger) pick up a newly added secret file only after the service task restarts. `docker service update --secret-add` restarts the task, so this matches the D-05 flow.
- CI coverage for MessengerSpec, 02-OwnerSpec and ZZ-RouterOAuthSpec comes when 24-04 pushes. Nothing is pushed here.

## Self-Check: PASSED

- FOUND: spec/jasmine/SecretsSweepSpec.js, lib/thinx/owner.js, lib/thinx/transfer.js, lib/thinx/messenger.js, lib/router.slack.js, lib/thinx/notifier.js, lib/thinx/redis-health.js
- FOUND commits: f51f9741, 485826d4
- `git rev-list --count f25662b3..HEAD` = 2 before the metadata commit

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*
