---
created: 2026-10-03T21:10:00.000Z
title: Messenger sends every owner's notifications to the last socket that sent init
area: api
severity: medium
files:
  - thinx-core.js:155 (app.messenger is a process-wide Messenger singleton)
  - lib/thinx/messenger.js:901 (initWithOwner stores one this._socket = websocket)
  - lib/thinx/messenger.js:279 (Slack RTM message forwarded to this._socket)
  - lib/thinx/messenger.js:328 (device notification sent to this._socket)
  - lib/thinx/messenger.js:499 (actionable notification sent to this._socket)
  - lib/thinx/messenger.js:557 (unknown-device notification sent to this._socket)
  - lib/thinx/messenger.js:409-441 (sendWithValidSocket callers)
---

## Problem

`Messenger` is a process-wide singleton with one `_socket`. Every verified owner's WebSocket
`init` re-points it (`initWithOwner`, `messenger.js:901`). Device notifications, actionable
notifications and Slack RTM messages are then sent to whichever owner's socket initialized last,
not to the owner the notification belongs to.

Quick 261003-v05 bound `init` to the socket's verified session owner, which narrows who can
re-point the socket to authenticated owners, but it does not fix the fan-out (threat T-v05-07,
disposition transfer).

## Fix

Keep sockets per owner (the verified owner connections already sit in `app._ws[<owner>]`, keyed
by the verified session owner since quick 261003-v05) and send each notification only to the
socket of the notification's owner. Drop the single `_socket`.
