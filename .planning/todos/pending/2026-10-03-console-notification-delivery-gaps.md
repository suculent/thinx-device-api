---
created: 2026-10-03T22:30:00.000Z
title: "Console notifications: remaining delivery gaps after per-owner routing"
area: api
severity: medium
files:
  - lib/thinx/messenger.js forwardNonNotification
  - thinx-core.js upgrade handler duplicate-path guard (socketMap keyed by path)
  - lib/router.build.js existing_sockets
  - services/console/src/html/app/js/controllers/LogviewController.js:214-260 (actionable toast)
---

## Problem

Quick 261003-vn3 routes every messenger console frame to the sockets of its owner. These gaps
remain; none of them is a cross-owner leak.

1. **forwardNonNotification throws on every non-notification MQTT message in production.**
   `rtm` stays null because `DISABLE_SLACK` is hard-coded true, and `channel` is null. With
   `ENVIRONMENT !== "test"` the guard `typeof (this.rtm) !== "undefined"` passes for null, so
   `this.rtm.sendMessage(...)` throws `TypeError: Cannot read properties of null (reading
   'sendMessage')` (reproduced at function level). Production runs `ENVIRONMENT=production`, and
   mqtt.js 5.16 emits 'message' without a try/catch. Consequence: in production only messages
   carrying `notification` reach `processActionableMessages`. Whether the throw escapes to the
   process top level (and restarts the API) is not verified at runtime. Fixing it would also
   start delivering status/connection toasts and the "[DEBUG] Generic Message" toast for unknown
   messages: an operator decision.
2. **A second classic-console tab on the identical `/<owner>` path is refused at upgrade.**
   thinx-core's duplicate guard keys `socketMap` by path, so only distinct paths (for example a
   query string, which `SocketSession.verifiedOwner` drops) reach the messenger as separate
   sockets.
3. **Build status frames never reach a socket.** `app.existing_sockets` is never filled, so the
   builder's `notify`/`wsOK` websocket is always null, and queue builds pass `[]`. Option: route
   builder notifications through `app.messenger.sendToOwner(owner, …)`.
4. **The actionable toast renders the device-supplied body as HTML (reachable since vn3).**
   `LogviewController.js` builds the toastr message as `msg.body + "<br><br>" + ...` with no
   escaping. Before vn3 no actionable frame was ever delivered (the `OPEN` TypeError); now it
   is, to the device's owner. Any publisher the messenger accepts on `/<owner>/<udid>` controls
   `notification.body`: the owner's own devices and owner credential, and, through quick
   261003-vbg's transfer binding, the previous owner's credential for a transferred device
   (cross-owner HTML injection into the current owner's console). The console CSP
   (`script-src` without `'unsafe-inline'`, `script-src-attr 'none'`) blocks inline script, but
   markup injection (fake prompts, links, styled overlays) is possible. Options: escape `body`
   in the console toast (console submodule change), or HTML-escape `notification.body`
   server-side in `processActionableNotification` (changes the frame payload). Operator
   decision before or with the vn3 push.
