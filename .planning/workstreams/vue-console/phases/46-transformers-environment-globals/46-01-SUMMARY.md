---
phase: 46-transformers-environment-globals
plan: 01
subsystem: api
tags: [api, apienv, environment, redis, exact-key, jasmine, deviation-record]

requires:
  - phase: 46-CONTEXT
    provides: "D-01 (atomic overwrite) and D-02 (exact-key parent API fix), operator 2026-10-13"
provides:
  - "apienv.create replaces only the entry whose name is exactly String(key); editing WIFI keeps WIFI_SSID, MY_WIFI and wifi"
  - "spec/jasmine/ApienvExactKeySpec.js: 11 Redis-free checks (library L1-L6, router R1-R4) that run locally and in the CI test job"
  - "ENV-01 and ROADMAP Phase 46 record the D-01 atomic-overwrite and D-02 parent-API deviations"
affects: [46-03-environment-globals-edit, 46-05-ship, ENV-01]

actuals:
  tokens: 4100
  tasks: 2
  commits: 3
plan_head_before: fc34df9b675ca3ce3c42cb8102b5bd2a5b49a521
plan_head_after: ab25315ec2d7a6f6244073ef4db333981676a85a

tech-stack:
  added: []
  patterns:
    - "Jasmine fake-app router harness (loadRouter / fakeRes / callRoute) with an in-memory legacy-callback Redis stand-in; envelopes compared as raw text"

key-files:
  created:
    - spec/jasmine/ApienvExactKeySpec.js
  modified:
    - lib/thinx/apienv.js
    - .planning/workstreams/vue-console/REQUIREMENTS.md
    - .planning/workstreams/vue-console/ROADMAP.md

key-decisions:
  - "apienv.create compares the stored property name with String(key) by strict equality (the name env_var_object[key] is stored under), so numeric keys still match their stored name"
  - "The single redis.set of the whole array and the (true, key) callback are unchanged, so D-01's atomic overwrite holds and every v2 and Legacy envelope is byte-identical"
  - "fetch, revoke and list already compared whole names with ==; left unchanged and guarded by L6"

patterns-established:
  - "Exact-name matching for env variables: never substring/indexOf on stored names"

requirements-completed: [ENV-01]

coverage:
  - id: D1
    description: "PUT /api/v2/env and POST /api/user/env/add overwrite exactly one variable; siblings whose names contain the key keep their values; one Redis write per create; other owners untouched"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "spec/jasmine/ApienvExactKeySpec.js#L1-L5 and R1, R2 (Legacy add)"
        status: pass
      - kind: other
        ref: "ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/ApienvExactKeySpec.js spec/jasmine/CsrfRouteInventorySpec.js (89 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Env route contract unchanged: CSRF first on the four mutating routes, raw v2 and Legacy envelopes byte-identical, list routes names-only, 401 and no write without a session"
    requirement: ENV-01
    verification:
      - kind: unit
        ref: "spec/jasmine/ApienvExactKeySpec.js#R1-R4 and L6"
        status: pass
      - kind: other
        ref: "git diff --quiet origin/thinx-staging HEAD -- lib/router.env.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "ENV-01 and ROADMAP Phase 46 record the D-01 atomic overwrite and the D-02 parent API change"
    requirement: ENV-01
    verification:
      - kind: other
        ref: "Task 2 verify: grep D-01 REQUIREMENTS.md; awk Phase 46 section | grep 'Recorded deviations' and 'ApienvExactKeySpec'; signed HEAD"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live exact-key edit on production (P46_WIFI / P46_WIFI_SSID) after 46-05 ships"
    requirement: ENV-01
    verification: []
    human_judgment: true
    rationale: "No unauthenticated way to observe the fix live; the operator UAT in 46-05 is the live proof"

duration: 3min
completed: 2026-10-13
status: complete
---

# Phase 46 Plan 01: Exact-Key Environment Overwrite Summary

**`apienv.create` now replaces only the variable named exactly `String(key)`, so an edit of WIFI through `PUT /api/v2/env` or the Legacy add route no longer deletes WIFI_SSID, MY_WIFI or any other name containing the key. The change ships with an 11-case Redis-free jasmine spec, and the D-01/D-02 deviations are recorded in ENV-01 and in the Phase 46 roadmap entry.**

## Performance

- **Duration:** about 3 min
- **Started:** 2026-10-13T20:31:45Z
- **Completed:** 2026-10-13T20:34:29Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Fixed the substring match in `lib/thinx/apienv.js` `create`. It used `Object.keys(obj)[0].indexOf(key) !== -1`, so an edit of WIFI dropped WIFI_SSID and MY_WIFI, and creating `I` dropped all three. It now uses strict equality with `String(key)`. The single `redis.set` of the whole array and the `(true, key)` callback are unchanged.
- Added `spec/jasmine/ApienvExactKeySpec.js`. It runs library cases L1-L6 and router cases R1-R4 through a fake-app harness against an in-memory stand-in for the legacy callback Redis client, with no Redis and no CouchDB. It is a non-ZZ `*Spec.js` file, so the CI `test` job picks it up through `spec/support/jasmine.json`. It sets no env vars and touches no globals.
- Recorded the deviations. ENV-01 now says the edit is one atomic overwrite and that D-01 supersedes the delete + recreate wording. ROADMAP Phase 46 gains a `**Recorded deviations (46-CONTEXT)**` line covering D-01 and D-02.

## Task Commits

1. **Task 1 (tracer, TDD): PUT /api/v2/env overwrites exactly one variable**
   - RED: `cc4b5659` test(46-01): add failing exact-key env overwrite checks (D-02)
   - GREEN: `352a8965` fix(46-01): replace only the exact environment key on overwrite (D-02, ENV-01)
   - REFACTOR: none needed
2. **Task 2: Record the ENV-01 atomic-overwrite and parent-API deviations**: `ab25315e` docs(46-01)

All three commits are GPG-signed (`%G?` = G), commit hooks ran, and nothing was pushed (46-05 ships).

## TDD Evidence

**RED** (old `indexOf` matching, `ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/ApienvExactKeySpec.js`, exit 3):
`11 specs, 4 failures`
- L1 "overwriting WIFI replaces only WIFI …": `expected 2 to equal 4`. The store held only `WIFI` and `wifi`.
- L3 "creating a one-letter key I removes nothing": `expected 2 to equal 5`
- R1 "… PUT /api/v2/env replaces only WIFI": `expected 2 to equal 4`. The CSRF-first and handler-count assertions before it passed.
- R2 "Legacy add answers the same envelope and keeps the siblings": `expected [ 'WIFI', 'wifi' ] to deeply equal [ 'MY_WIFI', 'WIFI', 'WIFI_SSID', 'wifi' ]`

Semantic assessment: each failing case ran and failed on its planned stored-entry assertion. The cause is the substring skip, and the envelope assertions that run before the failing line passed. No load, syntax or fixture fault occurred. The plan predicted L1, L3 and R1. The fourth failure is the Legacy add half of R2, which I extended to also check the stored names (see Deviations); it goes through the same `create`. L2, L4, L5, L6, the R2 delete/revoke case, R3 and R4 already passed. They guard the siblings, the other-owner record and the envelopes. The GSD `check tdd-red-evidence` classifier accepts TAP, JUnit XML, swift-testing and unittest output only, not jasmine's console reporter. The project has no TAP/JUnit jasmine reporter and the plan forbids `npm install`, so the RED record is this console output plus the semantic assessment above. `workflow.tdd_mode` is false for this workstream, so the plan-level gate is advisory.

**GREEN** (same command plus `spec/jasmine/CsrfRouteInventorySpec.js`, exit 0): `89 specs, 0 failures`. The new spec alone gave `11 specs, 0 failures` under three random seeds (05996, 31725, 16762).

## Verification

- Verify 1, jasmine ApienvExactKeySpec + CsrfRouteInventorySpec: PASS (89 specs, 0 failures). Re-run after the GREEN commit for the tracer gate, PASS.
- Verify 2, `node --check`, no `indexOf`, `String(key)` present, `redis.set("env:"` present, CI-glob file name, `npx eslint` on the two files: PASS
- Task 1 AC: the lib/spec diff against the merge-base lists exactly `lib/thinx/apienv.js` and `spec/jasmine/ApienvExactKeySpec.js`, all lib/spec commits are signed (G), and `lib/router.env.js` is unchanged: PASS
- Task 2 verify and AC: the ENV-01 note and Phase 46 deviation line are present, HEAD is signed, the docs commit lists exactly the two planning files, and nothing is pushed: PASS

## Files Created/Modified
- `lib/thinx/apienv.js`: `create` skips only the stored entry whose name is exactly `String(key)`. The comment names D-02.
- `spec/jasmine/ApienvExactKeySpec.js`: exact-key overwrite, sibling, other-owner, CSRF-first, raw-envelope and no-session checks.
- `.planning/workstreams/vue-console/REQUIREMENTS.md`: one sentence on the ENV-01 bullet about the D-01 atomic overwrite. The checkbox and traceability table are unchanged.
- `.planning/workstreams/vue-console/ROADMAP.md`: a `**Recorded deviations (46-CONTEXT)**` line after the Phase 46 `**Repos**` line.

## Decisions Made
- `String(key)` is computed once outside the Redis callback and compared with `===`. This name is what `env_var_object[key]` is stored under, so a numeric key 5 matches the stored "5" (L5). A second write of the same key never leaves two entries.
- `fetch`, `revoke` and `list` were left alone because they already compare whole names (`==`). L6 guards them.

## Deviations from Plan

**1. [Rule 2 - Test strength] R2's Legacy add case also asserts the stored names**
- **Found during:** Task 1 RED
- **Issue:** The plan's R2 checked only the raw envelope of `POST /api/user/env/add`. That route calls the same `create`, so an envelope-only check could not catch the bug on the Legacy path.
- **Fix:** R2 now also asserts that WIFI_SSID, MY_WIFI and wifi survive the add, and that the other owner's record is unchanged. The RED run showed four failures (L1, L3, R1, R2-add) instead of the three the plan predicted.
- **Files modified:** spec/jasmine/ApienvExactKeySpec.js
- **Commit:** cc4b5659

**Total deviations:** 1 (a stricter test, no scope change). **Impact:** stronger Legacy-path guard. No change to production code beyond the plan.

## Accepted Risk / Follow-up Candidate

- **T-46-06 (accepted):** `apienv.create` and `revoke` still call `redis.set` without a callback and answer `success: true` whatever the write result. A failed Redis write is therefore reported as success. This predates the plan and is outside D-02's scope, which the operator limited to exact matching. The write is still one `set` of the whole array, so a failure never leaves a partial array. Follow-up candidate: check the `set` result and answer `env_write_failed`.

## Threat Surface

No new endpoint, auth path or log line was added. T-46-01 through T-46-05 are mitigated as planned, each by its named spec case (L1-L5, R3, R1, L4/R4, R1-R3). No threat flags.

## Known Stubs

None.

## Issues Encountered

None. Locally `--config=/dev/null` runs jasmine in random order. The spec is order-independent because each case reseeds the stand-in.

## User Setup Required

None.

## Next Phase Readiness

- 46-03 (Vue Environment Globals Edit) can rely on one `PUT /api/v2/env {key, value}` replacing exactly one variable.
- 46-05 ships these three parent commits on `thinx-staging`. The operator's P46_WIFI / P46_WIFI_SSID UAT is the live proof.

---
*Phase: 46-transformers-environment-globals*
*Completed: 2026-10-13*

## Self-Check: PASSED
