---
phase: 48-deep-links-close-out
plan: 04
subsystem: ui
tags: [legacy, console, angularjs, deploy-keys, toastr, websocket, unit-tests]

requires:
  - phase: 48-03
    provides: console thinx-staging head 852fef5 (the base of this plan's four commits)
  - phase: 45
    provides: vue/src/utils/keyNames.js sentence table and the code-unit check (console 31ed738, 3d7eb9b)
  - phase: 43
    provides: Build Status frames to console sockets, {init} subscription per owner (Messenger#subscribeSocket)
provides:
  - "DeploykeyController.js: client name check by code unit, keyNames.js sentences for invalid_key_name from .done and .fail, generic sentence otherwise, reset in finally and .always (35 IN-03, IN-04)"
  - "DevicesController.js: THiNX Builder toast reads Build queued. / Build started. (UI-C19)"
  - "LogviewController.js: {init} always on open, wsstailLog sends only on an open socket, deviceBuilds[udid] initialised before push (43-REVIEW IN-04, 43-UI-REVIEW fix 3)"
  - "thinx-api.js updateDeploykeys: goals.length > 0 like the sibling handlers (35 IN-05)"
  - "src/test/deploykey.cjs D1..D10 (the Legacy part of 35 IN-08) and the new src/test/legacy-close-out.cjs G1..G8"
affects: [48-05, 48-06]

actuals:
  tokens: 9054
  tasks: 2
  commits: 4
plan_head_before: 852fef566b77eb5fcc5af48aa2109570c6797a13
plan_head_after: bff9552c65e85548e1e6cc48b875d056455a8cf0

tech-stack:
  added: []
  patterns:
    - "Legacy error copy: one fixed sentence per path, written with .text() into .msg-warning and passed to toastr.error; never a reply field"
    - "jQuery .done handlers that can throw keep their state reset in try/finally, because .done callbacks are not wrapped and a throw skips .always"
    - "Legacy vm harnesses compare values created inside the vm realm by JSON, not with strict deep-equal (different Array prototype)"

key-files:
  created:
    - services/console/src/test/legacy-close-out.cjs
  modified:
    - services/console/src/app/js/controllers/DeploykeyController.js
    - services/console/src/test/deploykey.cjs
    - services/console/src/app/js/controllers/DevicesController.js
    - services/console/src/app/js/controllers/LogviewController.js
    - services/console/src/app/js/thinx-api.js

key-decisions:
  - "The Legacy client check refuses only C0 controls, DEL and more than 120 units (UI-C18); the other keyNames.js reasons (line_separator, bidi, invisible, empty, reserved) stay server-side and come back as invalid_key_name sentences"
  - "parseNotification also initialises $rootScope.meta.deviceBuilds itself when it is missing, before the per-udid array"
  - "wsslog.onopen is unchanged: it still calls wsstailLog, which now no-ops on a connecting wss instead of throwing; the {init}-then-tail order comes from wss.onopen"
  - "DevicesController.js:135 (the build refusal toast still reads response.status) is left unchanged, as the plan flagged; listed as a follow-up"

patterns-established:
  - "legacy-close-out.cjs prefix G; deploykey.cjs prefix D; both print ok/FAIL lines and set a non-zero exit code"

requirements-completed: [FIX-01, CI-06]

coverage:
  - id: D1
    description: "Legacy deploy-key create refuses a name with a control character or more than 120 units before sending, shows the keyNames.js sentence for a server invalid_key_name from .done or .fail, the generic sentence for a reply without a pubkey or any other failure, never [object Object], and always re-enables Create"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/src/test/deploykey.cjs#D1..D10"
        status: pass
      - kind: other
        ref: "Task 1 verify 2 (grep gates, npm run test:csp, npm run build:test, built DeploykeyController carries the sentence)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The THiNX Builder toast after a Legacy build reads Build queued. or Build started. followed by the log link, with unchanged options and click-to-open-log"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/src/test/legacy-close-out.cjs#G1,G2,G8"
        status: pass
    human_judgment: false
  - id: D3
    description: "A Build Status frame for a device with no build history no longer throws and still produces its toast"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/src/test/legacy-close-out.cjs#G3"
        status: pass
    human_judgment: false
  - id: D4
    description: "A Legacy tab whose first socket opens from the log overlay sends {init} and then the logtail; wsstailLog does not throw on a connecting socket"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/src/test/legacy-close-out.cjs#G4,G5,G6"
        status: pass
    human_judgment: false
  - id: D5
    description: "updateDeploykeys records the deploykey goal only for a non-empty goals array and stays null-safe (35 IN-05)"
    requirement: FIX-01
    verification:
      - kind: unit
        ref: "services/console/src/test/legacy-close-out.cjs#G7,G8"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every pending Legacy change of v1.18 is committed, signed and passes test:csp, build:test and test:csp:built, with the new strings in the built copies (CI-06 prerequisite)"
    requirement: CI-06
    verification:
      - kind: other
        ref: "Task 2 verify 2 (npm run test:csp && npm run build:test && npm run test:csp:built, built-copy greps)"
        status: pass
    human_judgment: false
  - id: D7
    description: "UI E9/E10 backstops: in a browser, a 121-character pasted name and a name with a tab are refused with their sentences, and the build toast reads Build started./Build queued. with the log link"
    requirement: FIX-01
    verification: []
    human_judgment: true
    rationale: "Legacy verification is unit only (D-10); the UI-SPEC routes these two statements to the backstop (console-retest after 48-06 ships the Legacy image)"

duration: 6min
completed: 2026-10-15
status: complete
---

# Phase 48 Plan 04: Legacy console close-out fixes Summary

**Legacy deploy-key create now checks the name before sending and shows a readable sentence for every failure, copied word for word from the Vue `keyNames.js` table. `[object Object]` and the bare `Error.` toast are gone, and Create comes back on every path, including a throw. The build toast reads `Build queued.` or `Build started.` in place of `undefined`. Build Status frames for devices with no history no longer throw. A tab whose first socket opens from the log overlay subscribes with `{init}`. The deploy-key goal follows `goals.length > 0`.**

All four commits are in the `services/console` submodule on `thinx-staging`, signed (`%G?` = `G`) and not pushed. `origin/thinx-staging` is still `54734af`, and the branch is 17 commits ahead (48-01, 48-03 and 48-04). `commits`, `plan_head_before` and `plan_head_after` count the console repo. The parent gitlink `services/console` is still modified and unstaged; 48-06 bumps it.

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-15T15:41:09Z
- **Completed:** 2026-10-15T15:47:01Z
- **Tasks:** 2 (RED + GREEN each)
- **Files modified:** 6 (1 created, 5 modified), all under `services/console/src/`

## Accomplishments

- **35 IN-03 / IN-04, UI-C18 (DeploykeyController).** New helpers inside the controller:
  - `keyNameProblem(name)` compares UTF-16 code units as numbers: below `0x20` or `0x7F` gives `control_chars`, more than `KEY_NAME_MAX = 120` gives `too_long`. It carries the Codacy no-control-regex comment.
  - `keyNameSentence(reason)` does an own-property lookup in `KEY_NAME_MESSAGES` and falls back to `KEY_NAME_FALLBACK`.
  - `showCreateError(sentence)` writes `.msg-warning` with `.text()`, shows it, and calls `toastr.error(sentence, …)`.

  `createDeploykey()` refuses a bad trimmed name before `creatingDeploykey` is set. `.done` runs in `try`/`catch`/`finally`. A success with no object key or no `pubkey` is treated as a failure. `invalid_key_name` gets its reason sentence, and anything else gets `Could not generate the deploy key. Try again.`. `.fail` reads `jqXHR.responseJSON` and still emits `xhrFailed`. The string-parse branch and the reply `console.log` are gone.
- **UI-C19 (DevicesController).** The toast body is `( response.response === "queued" ? "Build queued." : "Build started." ) + "<br><br>Click to show build log..."`. The title and all options are unchanged.
- **43-UI-REVIEW fix 3 (LogviewController).** `parseNotification` initialises `meta.deviceBuilds` when it is missing and `deviceBuilds[udid]` when it is not an array, then pushes.
- **43-REVIEW IN-04 (LogviewController).** `wss.onopen` always calls `wssinit()`, then `wsstailLog(modalBuildId)` if a build is selected. `wsstailLog` keeps the logdata reset and `modalBuildId` but sends only when `wss.readyState === 1`.
- **35 IN-05 (thinx-api.js).** The `updateDeploykeys` goal check is `profile && profile.info && Array.isArray( goals ) && goals.length > 0`.

## Task Commits

All in `services/console`:

1. **Task 1 (tracer): readable deploy-key errors, reset on every path (35 IN-03, IN-04)**
   - RED `efc66f6` `test(console): expect readable legacy deploy-key errors and a reset on every path (35 IN-03)`. **This is the Legacy part of 35 IN-08:** it adds the `.fail` path and client-check tests.
   - GREEN `2105310` `fix(console): readable legacy deploy-key errors and a reset on every path (35 IN-03, IN-04)`. **This is the 35 IN-03 / IN-04 (Legacy half) commit.**
2. **Task 2: build toast, frame history, `{init}` on first open, goal check (D-09, 35 IN-05)**
   - RED `72caa31` `test(console): expect legacy build toasts, frame history and init on first open (D-09)`
   - GREEN `bff9552` `fix(console): build toast copy, frame history, init on first open, goal check (D-09, 35 IN-05)`. **This is the 35 IN-05 commit and the Phase 43 carries** (toast copy, 43-UI-REVIEW fix 3, 43-REVIEW IN-04).

For 48-06's FIX-01 ledger, use IN-03/IN-04 = `2105310`, IN-05 = `bff9552`, and IN-08 (Legacy) = `efc66f6`. The served-file markers are `Could not generate the deploy key. Try again.`, `Build queued.`, `Array.isArray( $rootScope.meta.deviceBuilds[ msg.udid ] )`, and `goals.length > 0` in `updateDeploykeys`. All four are present in the `build:test` output under `src/html/app/js`.

## TDD evidence

The harnesses print their own `ok`/`FAIL` lines, so each RED was assessed by hand, the same way as 48-01 and 48-03.

**Task 1 RED (`efc66f6`) on the 48-03 tree, exit 1:**
```
ok   D1 success: trimmed name, pubkey, date, one toast, one refresh, reset
FAIL D2 ... (no throw)                    <- key.date on a missing key threw out of .done
FAIL D3 ... (warning text)                <- refusal wrote no warning, toast was "Error."
FAIL D4 ... (warning text)
FAIL D5 ... (warning text)                <- .text(jqXHR)
FAIL D6 ... (warning text)
FAIL D7 ... (no request for "Fire\tware") <- no client check
FAIL D8 ... (no throw escapes)            <- a throw in .done skipped .always
FAIL D9 ... (not a fixed sentence: Error.)
FAIL D10 ... (KEY_NAME_MESSAGES in the controller)
```
Every failure is the planned gap. D1 is a guard: success already worked, and it passes on both trees. There were no load or fixture errors.

**Task 1 GREEN (`2105310`).** D1..D10 pass (10 `ok`, 0 `FAIL`). Verify 2 passed: the grep gates, `test:csp`, `build:test`, and the built copy carries the sentence. Tracer gate: the verify is automated-only and the mode is end-of-phase, so it was re-run on the committed tree and passed before Task 2 started.

**Task 2 RED (`72caa31`) on the Task 1 tree, exit 1:**
```
FAIL G1 ... actual: "undefined<br><br>Click to show build log..."
FAIL G2 ... actual: "undefined<br><br>Click to show build log..."
FAIL G3 ... (Cannot read properties of undefined (reading 'push'))
FAIL G4 ... actual: ["{\"logtail\":{\"owner_id\":\"owner-1\",\"build_id\":\"b1\"}}"]   <- no {init}
ok   G5 socket opened by the view with no build selected sends only {init}
FAIL G6 ... (InvalidStateError: still in CONNECTING state)
FAIL G7 ... (empty goals untouched)       <- goal recorded with goals []
FAIL G8 ... (DevicesController builds the toast from response.status)
```
G5 is a guard (the normal open already sent only `{init}`). The other failures are the planned gaps.

**Task 2 GREEN (`bff9552`).** G1..G8 pass (8 `ok`, 0 `FAIL`). Both verify commands passed: all Legacy tests, the grep gates, `test:csp`, `build:test`, `test:csp:built`, and the built-copy greps.

## Files Created/Modified

Paths are in `services/console/src/`.

- `app/js/controllers/DeploykeyController.js`: constants, `keyNameProblem`, `keyNameSentence`, `showCreateError`, and the rewritten `createDeploykey` handlers.
- `test/deploykey.cjs`: rewritten as D1..D10. It has a `check()` wrapper, a `$` stub that records `.text()`/`.show()`, a recording toastr (which can throw on success), a `.fail` path, and a source comparison with `vue/src/utils/keyNames.js`.
- `app/js/controllers/DevicesController.js`: the fixed toast copy and its comment.
- `app/js/controllers/LogviewController.js`: `{init}` first in `wss.onopen`, the guarded `wsstailLog` send, and the `deviceBuilds` initialisation.
- `app/js/thinx-api.js`: `goals.length > 0` in `updateDeploykeys`.
- `test/legacy-close-out.cjs` (new): G1..G8, with three vm loaders (DevicesController, LogviewController with a FakeWebSocket that throws on send while connecting, and thinx-api.js through `Thinx.init`).

## Decisions Made

- The client check stays as narrow as UI-C18: C0, DEL and length only. The server stays the authority for the other reasons, and its `invalid_key_name` reply now reads as the same sentence.
- `parseNotification` also creates the `deviceBuilds` map when it is missing, not only the per-udid array (the plan said to initialise the map when missing).
- `wsslog.onopen` is unchanged. Its `wsstailLog` call now no-ops while `wss` is connecting instead of throwing.
- The `DevicesController.js:135` build refusal toast (`toastr.error( response.status, … )`) is unchanged, as the plan flagged. **Follow-up candidate:** it can still show an empty toast, because the build reply has no status field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test harness] G7 loader lacked `$scope.$on`**
- **Found during:** Task 2 RED
- **Issue:** `Thinx.init` registers some listeners through `$scope.$on`. Without that stub, G7 failed with `$scope.$on is not a function` and not on the planned assertion.
- **Fix:** Added a no-op `$on` to the API loader's `$scope` before the RED commit. G7 then failed on `empty goals untouched`, the planned gap.
- **Committed in:** `72caa31`

**2. [Rule 1 - Bug, test harness] G7 cross-realm deep-equal**
- **Found during:** Task 2 GREEN
- **Issue:** The emitted `['goals']` array comes from the vm realm, so `assert.deepStrictEqual` rejected it on prototype even though the values matched.
- **Fix:** Compare by `JSON.stringify`, with a comment. The assertion still checks exactly one `saveProfileChanges` with `['goals']`.
- **Committed in:** `bff9552` (named in its message)

**3. [Test output] FAIL lines show the actual value**
- **Found during:** Task 2 RED
- **Issue:** The first line of a generated assertion message (`Expected values to be strictly equal:`) did not say what differed.
- **Fix:** `legacy-close-out.cjs` appends `actual: <json>` (capped at 120 chars) to generated assertion messages.
- **Committed in:** `72caa31`

---

**Total deviations:** 2 auto-fixed harness bugs and 1 output improvement, all in the new test file.
**Impact on plan:** None on scope. Only the six planned files changed.

## Issues Encountered

- ESLint (`npm run lint` config): `DeploykeyController.js` went from 14 errors to 5, and the new code has none. All 5 remaining errors are on unchanged lines: the guard line and `.always(function() {…})`. In `thinx-api.js`, the 16 remaining errors (lines 55-56, 355-357, 1047) are on unchanged lines. The edited goal-check line is clean. Legacy lint is not part of the build or CI gate, so these are out of scope.
- `LogviewController.js` still has its pre-existing `// TODO: process specific build notifications` comment (line 190). This plan did not add it, and it is not a stub.

## Verification (plan-level)

- `deploykey.cjs`: 10 `ok`, 0 `FAIL`. `legacy-close-out.cjs`: 8 `ok`, 0 `FAIL`. Both also pass from `vue/` as `LC_ALL=C node ../src/test/<file>.cjs` (the 48-02 CI form). `toast-escape`, `digest-guard`, `ng-scope`, `xsrf-seam` and `env-json` pass.
- `test:csp`, `build:test` and `test:csp:built` pass. The built copies under `src/html/app/js` carry all four markers.
- `git -C services/console diff --name-only HEAD~4 HEAD` lists only `src/` paths. `log --format=%G? HEAD~4..HEAD` prints `G` four times. `status --porcelain -- src vue` is empty. `origin/thinx-staging` = `54734af`, so nothing was pushed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 48-05 can run `legacy-close-out.cjs` and `deploykey.cjs` in the console job. They use node built-ins only and need no build.
- 48-06 ships the Legacy image through the re-enabled build. It greps the served files for the four markers, records `2105310`, `bff9552` and `efc66f6` in the FIX-01 ledger, bumps the parent gitlink, and should list `DevicesController.js:135` as a follow-up candidate. The E9/E10 backstop statements go to `console-retest` after that deploy.

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-15*

## Self-Check: PASSED

All 6 listed key files exist under services/console/src; all 4 console commits (efc66f6, 2105310, 72caa31, bff9552) are ancestors of services/console HEAD and signed (G).
