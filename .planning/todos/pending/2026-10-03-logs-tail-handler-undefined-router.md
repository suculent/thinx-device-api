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
