---
phase: 40-transit-encrypted-deploy-keys-in-the-api
plan: 03
subsystem: api
tags: [openbao, transit, deploy-keys, kill-switch, http-503, vue, angularjs, node-test, jasmine]

requires:
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "40-02 generate() refusal: Error with code key_service_unavailable and reason; create() released the claim and answered callback(false); spec/fixtures/fake-transit.js"
provides:
  - "RSAKey.deployKeygenEnabled(): THINX_DEPLOY_KEYGEN read at call time (unset, empty or enabled generates; anything else refuses)"
  - "rsakey.create(): kill switch as the first statement; callback(false, \"key_service_unavailable\") for the switch and for a Transit refusal; logs only the error code"
  - "router.rsakey.js: 503 {success: false, response: \"key_service_unavailable\"} on PUT /api/v2/rsakey and GET /api/user/rsakey/create"
  - "github_link.js createAndPush: {status: 503, success: false, response: \"key_service_unavailable\"}, nothing pushed"
  - "The D-03 sentence on the Vue Deploy Keys page, the Vue Profile GitHub-link result and the legacy DeploykeyController (.done and .fail)"
affects: [40-04, 40-05, 41]

actuals:
  tokens: 6636
  tasks: 3
  commits: 5
plan_head_before: 6c4598360c2c84fa0d3de64cda417d28d0c6050b
plan_head_after: 517763168dfbc68b0eb7134bda8c5ce1687e6374

tech-stack:
  added: []
  patterns:
    - "Env kill switch read at call time, fail-closed on any value other than unset, empty or enabled"
    - "One fixed refusal code mapped to 503 by the router, one fixed console sentence per surface, never the code"

key-files:
  created: []
  modified:
    - lib/thinx/rsakey.js
    - lib/router.rsakey.js
    - lib/thinx/github_link.js
    - spec/node/DeployKeyNames.test.js
    - spec/jasmine/GitHubLinkSpec.js
    - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
    - services/console/vue/tests/unit/deploy-key-actions.cjs
    - services/console/vue/src/pages/Profile/Profile.vue
    - services/console/vue/tests/unit/github-token-scopes.cjs
    - services/console/src/app/js/controllers/DeploykeyController.js
    - services/console/src/test/deploykey.cjs

key-decisions:
  - "THINX_DEPLOY_KEYGEN is fail-closed: only unset, empty or exactly enabled generates, so Disabled, off or a typo refuses visibly."
  - "The kill switch precedes the name check, so a disabled create answers key_service_unavailable even for an invalid name, and makes no claim file and no Transit call."
  - "create() logs one line with only err.code (or generate_failed) for any generate error; the refusal reason class stays in the generate() log line from 40-02 and never reaches a client."
  - "A 503 reaching the consoles without the key_service_unavailable code keeps the generic create-failed sentence."

patterns-established:
  - "Refusal vocabulary: [rsakey] create failed: <code>; deploy-key generation refused: THINX_DEPLOY_KEYGEN is not enabled (switch named, value never logged)"
  - "D-03 sentence constant KEY_SERVICE_UNAVAILABLE in Rsakeys.vue and DeploykeyController.js; Profile.vue map key key_service_unavailable"

requirements-completed: [KEYENC-03]

coverage:
  - id: D1
    description: "API: key_service_unavailable answers 503 with exactly {success: false, response: key_service_unavailable} on PUT /api/v2/rsakey and GET /api/user/rsakey/create; a plain refusal stays 200"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/node/DeployKeyNames.test.js#KS1 router: key_service_unavailable answers 503 with exactly {success, response} on PUT v2 and GET v1 (D-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Transit refusal in create() calls back key_service_unavailable and releases the claimed .pub; other generate errors stay callback(false)"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/node/DeployKeyNames.test.js#KS2 a create refused by Transit calls back key_service_unavailable and releases the claim (D-03, KEYENC-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-07 kill switch: disabled, Disabled and off refuse before the name check, the claim and Transit (no files, zero encrypt calls); unset, empty and enabled generate"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/node/DeployKeyNames.test.js#KS3 and KS4"
        status: pass
    human_judgment: false
  - id: D4
    description: "Builds ignore the switch: with THINX_DEPLOY_KEYGEN=disabled a fetch still attempts the Transit key (agent) and the legacy key"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/node/DeployKeyNames.test.js#KS5 builds ignore the switch"
        status: pass
    human_judgment: false
  - id: D5
    description: "GitHub link flow answers 503 key_service_unavailable and pushes nothing; other create failures keep 500 rsa_key_creation_failed"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "spec/jasmine/GitHubLinkSpec.js (23 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D6
    description: "All three console surfaces show exactly the D-03 sentence for the code and never the code itself"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/deploy-key-actions.cjs#G2; services/console/vue/tests/unit/github-token-scopes.cjs; services/console/src/test/deploykey.cjs#D11 and D9"
        status: pass
    human_judgment: false
  - id: D7
    description: "The 503 JSON body reaches the browser unchanged through Traefik and the Vue/legacy XHR layers"
    requirement: KEYENC-03
    verification: []
    human_judgment: true
    rationale: "RESEARCH Pitfall 10 verified it by reading the code and the edge config; it is not re-verified live here. The 40-05 operator check covers the Vue path."

duration: 10min
completed: 2026-10-19
status: complete
---

# Phase 40 Plan 03: Key Service Refusal and Kill Switch Summary

**When OpenBao is unavailable, or when `THINX_DEPLOY_KEYGEN` is set to anything other than `enabled`, deploy-key generation now answers `503 {success: false, response: "key_service_unavailable"}`. That covers the rsakey routes and the GitHub link flow. The Vue Deploy Keys page, the Vue Profile GitHub-link result and the legacy console all show "Deploy keys can't be created right now, try again later." Builds keep reading both key kinds whatever the switch says.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-19T01:08:25Z
- **Completed:** 2026-10-19T01:18:48Z
- **Tasks:** 3
- **Files modified:** 11 (5 parent, 6 in the console submodule)

## Accomplishments
- `RSAKey.deployKeygenEnabled()` reads `THINX_DEPLOY_KEYGEN` at call time, in the same way as `Messenger.mqttDeviceWritesEnabled`. It is the first statement of `create()`. When the switch is off, create logs one line that names the switch but not its value, then refuses before the name check, `reserveIdentifier` and any Transit call. There is no passphrase branch anywhere on this path.
- `create()` maps `err.code === "key_service_unavailable"` from `generate()` to `callback(false, "key_service_unavailable")` after `releaseIdentifier`. The old `console.log(err)` is now one line that carries only the code.
- `router.rsakey.js` answers 503 through `Util.failureResponse` for that code. The `invalid_key_name` branch stays first, and any other refusal keeps the generic responder.
- `github_link.js createAndPush` returns `{status: 503, success: false, response: "key_service_unavailable"}`. `router.github.js` is unchanged: reading it confirmed that it passes `result.status` to `Util.failureResponse`.
- Consoles:
  - `Rsakeys.vue`: a `KEY_SERVICE_UNAVAILABLE` constant shown in the page alert. The typed name is kept.
  - `Profile.vue`: a `key_service_unavailable` entry in the GitHub-link messages map.
  - `DeploykeyController.js`: a constant used in the `.done` non-success branch and in `.fail` from `jqXHR.responseJSON`.

## Task Commits

Console submodule (`services/console`, branch thinx-staging, all GPG-signed, status `G`) and parent (`thinx-staging`):

1. **Task 1: refusal end to end, kill switch, 503, Deploy Keys sentence (tracer)**
   - console `da79c31` (feat)
   - parent `b356e6af` (feat, with gitlink)
2. **Task 2: GitHub link flow 503 and Profile sentence (TDD)**
   - RED: console `fe6a1c1` (test), parent `b292a7ed` (test, with gitlink)
   - GREEN: console `4724d20` (feat), parent `fddbe9c5` (feat, with gitlink)
3. **Task 3: legacy console sentence (TDD)**
   - RED: console `62414c3` (test), parent `8acfc41a` (test, gitlink)
   - GREEN: console `7e3d1fe` (feat), parent `51776316` (feat, gitlink)

No REFACTOR commit was needed. Nothing was pushed.

## Tracer Feedback Gate (Task 1)

This was an interactive run with `human_verify_mode` end-of-phase, and the tracer `<verify>` is automated-only, so the verify was re-run and no checkpoint was raised. Both parts passed:
- `node --test spec/node/DeployKeyNames.test.js`: 46 tests, 46 pass.
- `npm --prefix services/console/vue run test:unit`: exit 0.

## TDD Gate Compliance

- **Task 2.** The RED run of `npx jasmine --config=/dev/null spec/jasmine/GitHubLinkSpec.js` gave `23 specs, 2 failures`. The two failures were exactly the two new 503 cases, each `expected { status: 500, … } to deeply equal { status: 503, … }`. The new 500 case passed in RED because the behaviour already existed; it is a regression guard. `node services/console/vue/tests/unit/github-token-scopes.cjs` exited 1 with exactly `FAIL a 503 key_service_unavailable gets exactly the D-03 sentence (the messages map has key_service_unavailable)`.
  - Semantic assessment: valid RED. Every failure is an assertion on the planned behaviour, with no load, fixture or syntax fault.
  - GREEN: `23 specs, 0 failures`, 12/12 checks, and the Vue suite exits 0.
- **Task 3.** The RED run of `node services/console/src/test/deploykey.cjs` exited 1. Only D11 failed (`warning text`: the controller showed CREATE_FAILED), and D1 to D10 passed.
  - Semantic assessment: valid RED.
  - GREEN: `Legacy deploy-key create: all checks passed.`
- `check tdd-red-evidence` was not run. Neither the jasmine console reporter nor the plain `ok/FAIL` console checks are a supported report format, and `workflow.tdd_mode` is off for this workstream (the same as 40-01 and 40-02).

## Verification Results

All runs had `GIT_KEY_PASSPHRASE` and `THINX_DEPLOY_KEYGEN` absent from the invoking environment. Presence was checked with `${VAR+x}`, and no value was printed.

| Command | Result |
|---|---|
| `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node --test spec/node/DeployKeyNames.test.js` | 46 tests, 46 pass |
| `npm --prefix services/console/vue run test:unit` | exit 0 (all suites) |
| `grep -c "Deploy keys can't be created right now, try again later." services/console/vue/src/pages/Rsakeys/Rsakeys.vue` | 1 |
| `npx jasmine --config=/dev/null spec/jasmine/GitHubLinkSpec.js` | 23 specs, 0 failures |
| `node services/console/src/test/deploykey.cjs` | `Legacy deploy-key create: all checks passed.` |
| Task 3 verify (submodule clean and parent gitlink equal to submodule HEAD) | pass, gitlink `7e3d1fe3115899e9e028e412638d93c4c16022a7` |
| `node services/console/src/test/*.cjs` (all 7 legacy checks) | all exit 0 |
| `node --test spec/node/*.test.js` | 135 tests, 135 pass |
| `npx jasmine --config=/dev/null GitHubLinkSpec GitSpec KeyFormatSpec SecretsSweepSpec BuilderRemoteJobSpec TransitSpec` | 249 specs, 0 failures |
| `npx jasmine --config=/dev/null --random=false --filter='^RSA Key \((?!13\))' spec/jasmine/03-RsakeySpec.js` | 17 specs, 0 failures |
| `npx eslint lib/thinx/rsakey.js lib/router.rsakey.js lib/thinx/github_link.js spec/node/DeployKeyNames.test.js spec/jasmine/GitHubLinkSpec.js` | exit 0 |
| `thinx-agent-*` entries in `os.tmpdir()` after all runs | 0 |

## Files Created/Modified
- `lib/thinx/rsakey.js`: `deployKeygenEnabled()`, the switch check in `create()`, and the code mapping and code-only log in the generate callback.
- `lib/router.rsakey.js`: the 503 branch in `createRSAKey`.
- `lib/thinx/github_link.js`: the 503 branch in `createAndPush`.
- `spec/node/DeployKeyNames.test.js`: `withKeygen()` env helper; KS1 to KS5.
- `spec/jasmine/GitHubLinkSpec.js`: a `createUnavailable` override in `makeDeps`, a 503 case, a 500 case, and a 503 case after every existing key is in use elsewhere.
- `services/console/vue/src/pages/Rsakeys/Rsakeys.vue` and `tests/unit/deploy-key-actions.cjs` (G2).
- `services/console/vue/src/pages/Profile/Profile.vue` and `tests/unit/github-token-scopes.cjs`.
- `services/console/src/app/js/controllers/DeploykeyController.js` and `src/test/deploykey.cjs` (D11; the code in FORBIDDEN, the sentence in ALLOWED).

## Decisions Made
See key-decisions in the frontmatter. The one that matters most downstream: an operator must set exactly `enabled` (or leave the variable unset) to generate, and any other value refuses. The `thinx-swarm` mirror of the switch (D-07, defaulting to `enabled`) is not part of this plan and stays with the cut-over work.

## Deviations from Plan

### Clarifications (no behaviour beyond the plan)
- **Extra kill-switch value.** KS3 also refuses `off`, and it shows that the switch refusal comes before the name check: an empty name answers `key_service_unavailable`, not `invalid_key_name`. The plan lists only `disabled` and `Disabled`.
- **KS5 reads both key kinds.** The plan asks for a Transit key attempt with the switch disabled. The case also puts a legacy key after it and asserts that both attempts are made (`['agent', 'legacy']`) and that the key is decrypted once.
- **No pre-existing 500 case in GitHubLinkSpec.** The plan says "keep the 500 case", but none existed, so one was added. A third case also covers a refused create after every existing key is in use elsewhere.
- **Console lint.** `npx eslint` from `services/console/vue` picks up a flat config that rejects `--ext`, and the plan forbids `npm run eslint` there, so the console files were not linted. The parent files were linted (exit 0).

**Total deviations:** 0 auto-fixed. **Impact:** none. The extra cases only tighten the planned assertions.

## Issues Encountered
- `03-RsakeySpec` fails some specs under jasmine's random order (2 to 5 failures depending on the seed, in specs 01, 02, 04, 04b and 12). These specs depend on keys made by earlier specs. The project config `spec/support/jasmine.json` sets `random: false`, and in that order the spec gives 17 specs, 0 failures. This is pre-existing and was not changed.
- Not run locally: `GitHubSpec` (000) and `ZZ-RouterRSAKeySpec` need the CI services. The first `thinx-unit` run in Plan 40-05 is their check.

## Threat Flags
None beyond the plan's threat model. T-40-13: tests assert the 503 body is deep-equal to the two fields, the code is in the legacy FORBIDDEN set, and the consoles show only the fixed sentence. T-40-14 and T-40-15: KS3 shows zero encrypt calls, no claim attempt and an unchanged listing while disabled, and KS2 shows that the claim is released on a Transit refusal.

## User Setup Required
None. `THINX_DEPLOY_KEYGEN` is unset by default, which means enabled.

## Next Phase Readiness
- Ready for 40-04 and 40-05. The console submodule is clean on `thinx-staging` at `7e3d1fe`, and the parent gitlink records it.
- Plan 40-05 pushes, in this order: the console, then `thinx-unit`, then `thinx-staging` after the cut-over decision. That plan also covers the live check of the 503 body in the Vue console and mirroring `THINX_DEPLOY_KEYGEN` in `thinx-swarm` (D-07).
- KEYENC-03 is not marked complete yet. The shared-ID gate keeps it open until every sibling plan that declares it has a SUMMARY.

---
*Phase: 40-transit-encrypted-deploy-keys-in-the-api*
*Completed: 2026-10-19*

## Self-Check: PASSED
