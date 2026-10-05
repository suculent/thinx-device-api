---
quick_id: 261004-0es
type: quick
status: complete
completed: 2026-10-04
repo: services/console (submodule, branch thinx-staging)
commits:
  - 592f251 test(console): failing check for escaped notification toasts
  - e43a94d fix(console): escape device-supplied notification fields in toasts
key-files:
  created:
    - services/console/src/test/toast-escape.cjs
  modified:
    - services/console/src/app/js/controllers/LogviewController.js
    - services/console/src/package.json
---

# Quick 261004-0es: escape device-supplied notification fields in classic console toasts

The classic console now escapes the device-supplied notification fields before they reach toastr. `msg.body`, `msg.title` and `JSON.stringify(msg.body)` are HTML-escaped. `msg.nid` is only used in ids and selectors when it matches `^[A-Za-z0-9_-]{1,128}$`, and toastr is only called through info/success/warning/error. The websocket frame is unchanged.

## What changed

- `src/app/js/controllers/LogviewController.js` has three new top-level helpers, declared with `var`/`function` so a lazy reload can redeclare them safely:
  - `thinxEscapeHtml(value)` escapes `& < > " ' \`` to entities. `null` and `undefined` become `""`.
  - `thinxSafeNid(nid)` accepts a string or number that matches the regex and returns `null` for anything else.
  - `thinxToastMethod(type)` checks the type against the allowlist and returns `null` for anything else.
- `parseNotification`:
  - **Actionable frames:** an invalid nid returns before any toast or jQuery selector. Body and title are escaped. The bool and string toasts call `toastr.info` and `toastr.warning` directly, and the Yes/No/Send wiring and `submitNotificationResponse` emits are the same as before.
  - **Status and plain frames:** an unknown `msg.type` returns without a toast. The JSON body is escaped, and the plain-notification title is escaped.
- `src/test/toast-escape.cjs` loads the real controller in a `vm` with fake angular, jQuery, toastr and WebSocket. The toastr fake is a Proxy, so a call to `constructor`, `clear` or any other key is recorded. Frames go in through `wss.onmessage` and the test checks 59 assertions, including that legitimate frames produce byte-identical actionable markup.
- `package.json` has a new `test:toast` script.

## Commands and results

| Command (from services/console/src) | Result |
|---|---|
| `npm run test:toast` before the fix | exit 1, 41 FAIL and 15 ok. The 15 that passed are the legitimate-frame and button-wiring assertions. The escape-helper sub-checks were skipped because the helper did not exist yet. |
| `npm run test:toast` after the fix | exit 0, 59 ok |
| `npm run test:csp` | passed |
| `test:digest`, `test:xsrf`, `test:env`, `test:ng-scope` | all exit 0 |
| `eslint` on LogviewController.js | clean, exit 0 |
| `npm run lint` (whole tree) | exit 1, but the failures are older and come only from DeviceController.js, assets/thinx/csp-rollbar.js and cypress/integration/login.spec.js. Neither file changed here is flagged. |
| `npm run build:test` | exit 0. The generated `html/app/js/controllers/LogviewController.js` contains the helpers and `<ENV::wssUrl>` is substituted. |
| `npm run test:csp:built` | passed |
| The toast check run against the generated file (temporary copy of the test) | 59 ok, 0 FAIL |

`src/html` is untracked in the console repo, so the build left nothing extra to commit.

## Deviations from Plan

1. **Actionable markup moved off `toastr[ "info" ]`.** The actionable toasts now call `toastr.info` / `toastr.warning` directly instead of indexing with a string literal. The behaviour is the same.
2. **Status refresh skipped for unknown types.** A status frame with an unknown `msg.type` now returns before the `deviceList`/`getBuildHistory` refresh. This matches the old behaviour, where `toastr[undefined-key]` threw before the refresh ran.
3. **Status branch null guard (Rule 1).** The status branch now checks that `msg.body` is not null or undefined before reading `.status`. Before, a frame without a body threw a TypeError. Now it shows a plain toast with an empty body.

## Open questions

- `$rootScope.meta.notifications.push(msg)` still stores the raw frame. Nothing in `app/` renders that array today; if a view ever binds it with `ng-bind-html`, it needs the same treatment.
- The Vue console was not touched, as planned. Whether it renders these frames safely was not checked in this task.

## Self-Check: PASSED

- FOUND: services/console/src/test/toast-escape.cjs
- FOUND: 592f251, e43a94d in the services/console log
