---
created: 2026-10-03T21:00:00.000Z
title: logs/tail handler calls validateSession on an undefined router
area: api
severity: low
files:
  - thinx-core.js:382 (const router = require('./lib/router.js')(app); lib/router.js returns undefined)
  - thinx-core.js:576 (logTailImpl calls router.validateSession)
  - thinx-core.js:581-587 (POST /api/user/logs/tail and /api/v2/logs/tail)
---

## Problem

`thinx-core.js:576` `logTailImpl` calls `router.validateSession(req2, res)`, where `router` is the
return value of `require('./lib/router.js')(app)` (`thinx-core.js:382`). `lib/router.js` returns
nothing, so `router` is undefined and the call throws `TypeError`. `POST /api/user/logs/tail` and
`POST /api/v2/logs/tail` therefore fail with 500. That fails closed, so it is not an auth bypass.
On the success path the handler would never respond anyway: it only logs and returns. It also calls
`router.respond`, which does not exist either.

Found during the quick 261003-skk `validateSession` caller audit (threat T-skk-10, disposition:
accept).

## Fix

Call `Util.validateSession(req2)` (answering 401 on false) and send a response, or remove the two
dead routes if the websocket log tail replaced them.

## Resolution

Done 2026-10-03 in quick 261003-v05: `22a67fc1` (failing spec), `fb70a4ea` (spec assertion
correction), `5c42ec60` (WebSocket owner binding), `857fbda0` (route removal), and the Task 3
commit "test(quick-261003-v05): CI websocket owner-binding regressions; resolve logs-tail todo;
messenger socket todo".

**Decision B: the two HTTP tail routes are removed.** Evidence:
- No client calls them. The classic console defines an uncalled wrapper `tailBuildLog`
  (`services/console/src/app/js/thinx-api.js:157-158` export, `:1315-1325` body). The Vue console
  has no reference to the route, the logtail message or WebSocket. Firmware, `docs/APIs.md`,
  builders and the worker have none. Repo-wide the only references were `thinx-core.js` and two specs.
- The console tails over the WebSocket: `LogviewController.js:98-108` sends
  `{logtail: {owner_id, build_id}}` over the owner connection.
- The routes never worked and they leaked. `router` was bound to the undefined return value of
  `lib/router.js`, so the handler threw a TypeError (500) and never responded even on success.
  They were registered inside the per-connection function `initLogTail`, called on every
  WebSocket connection: 404 before the first connection after boot, 500 after it, and two more
  express router layers per connection for the life of the process.
- No spec depended on them working: `ZZ-AppSession.js` (expected 200) does not match the CI glob;
  `00-AppSpec` expected 404, which removal keeps. `CsrfRouteInventorySpec` and the runbook have
  no rows for them.
- Option A (keep and fix) would have added an authenticated endpoint duplicating the WebSocket
  message with no caller.

**WebSocket path (same defect class, fixed here):**
1. Socket owner was the first URL path segment behind cookie-substring checks. Now
   `SocketSession.verifiedOwner` requires `request.session.owner` (parsed at upgrade) to pass
   `Sanitka.owner` and equal the first path segment; otherwise `SocketSession.accept` closes with
   1008, attaches no listener and registers nothing.
2. The logtail owner came from the message. Now `owner_id` is ignored; the dispatcher passes
   `ws.owner`, and the output is the connection the frame arrived on.
3. `Buildlog#logtail` read unowned and built the tail path from the message owner, creating
   directories and a world-writable `build.log` under any owner id. Now it reads through
   `fetchOwned`; another owner's build, a missing build and a CouchDB failure all get one
   `Buildlog.LOGTAIL_NOT_FOUND` frame ("Sorry, no log records fetched.") before any mkdirp, write,
   chmod or tail. The path uses the verified owner and the record's sanitized udid.
4. The log-socket registry was keyed by the client-chosen second path segment. Keys are now
   `<owner>/<id>` (no cross-owner overwrite, no `app._ws["__proto__"]`).
5. `init` initialized the messenger for the owner named in the message. Now it uses the
   verified owner and the arriving socket (the init value must be a string and is otherwise ignored).
6. One non-JSON (or `null`, or `{"logtail":null}`) frame threw out of the `ws` 'message'
   listener and crashed the API process (no `uncaughtException` handler). `SocketSession.onMessage`
   never throws and never logs the frame.

**Who is affected:**
- (a) Classic console users viewing their own build logs: unchanged. The console sends logtail on
  its owner connection with its own owner.
- (b) WebSocket clients without a live session (expired or garbage cookie, no cookie) or on
  another owner's path: closed with 1008 right after the handshake. Before: a socket was kept
  open, and with any Cookie containing `x-thx-core` it could tail any build and crash the process.
- (c) A logtail for a build the socket's owner does not own, or for a missing build: one frame
  "Sorry, no log records fetched.". Before: the stream of that build, plus directory/file creation.
- (d) Callers of POST /api/user/logs/tail or /api/v2/logs/tail: 404 always. Before: 404 until the
  first WebSocket connection after boot, 500 afterwards. No known client.
- (e) The Vue console: no WebSocket use, so unaffected.
- (f) Messenger notification fan-out: unchanged, see
  `.planning/todos/pending/2026-10-03-messenger-websocket-is-process-wide.md`.

**Console-repo cleanup (not done here, `services/console` is a read-only submodule):** delete
the uncalled `tailBuildLog` wrapper (`services/console/src/app/js/thinx-api.js:157,1315`).
