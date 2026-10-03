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

## Resolution

Done 2026-10-04 in quick 261003-vn3: `313d3335` (failing spec), `54c04622` (messenger
routing), `63716bae` (registry cleanup). The todo move and this Resolution go in the
orchestrator's docs commit.

- **Finding:** the old writers compared `this._socket.readyState === this.socket.OPEN`, and
  `this.socket` was always null. Once any socket had sent init, every check-in/out,
  connected/disconnected, actionable and unknown-message frame threw
  `TypeError: Cannot read properties of null (reading 'OPEN')`. No notification frame was
  ever delivered, so the cross-owner delivery was latent. The Slack RTM forwarder had no
  such check and would have sent to the last-init socket (dormant: `DISABLE_SLACK = true`).
- **Design:**
  - Subscriptions live in the Messenger: `_ownerSockets`, a Map from owner to a Set of sockets.
    A socket joins only through `initWithOwner`, keyed by its verified owner (`ws.owner`, set by
    `SocketSession.accept`). Only sockets that sent init are subscribed; the classic console's
    log connection (`/<owner>/<ts>`) never sends init and gets no notification frames.
  - `initWithOwner` refuses a socket whose `owner` is not the owner being initialized:
    `(false, "socket_owner_mismatch")`, no MQTT work. The null-socket test branch is unchanged.
  - Cleanup: one close listener per subscribed socket, non-OPEN sockets pruned at send time, a
    socket whose `send` throws is dropped, an owner entry is deleted when its Set is empty.
  - `sendToOwner(owner, notif)` is the only socket send in messenger.js. A missing, non-string
    or empty owner is dropped with `[messenger] console message dropped: no owner` (no payload);
    an owner without subscribers is skipped silently.
  - `SocketSession.accept` deletes its `app._ws` entry on close unless a newer connection
    replaced it.
  - Composition with quick 261003-vbg: check-in/out and actionable frames are sent to the owner
    `withAcceptedDevice` accepted the message as (`doc.owner`). For a transfer-bound device on
    its previous owner's topic that is the current owner, never the topic owner.
- **Writer audit:**

  | Writer | Owner | Action |
  |---|---|---|
  | messenger: Slack RTM 'message' | none | dropped with a log line; user/text no longer logged |
  | messenger: check-in/out (processStatus) | accepted owner (vbg) | `sendToOwner(owner)` |
  | messenger: connected/disconnected (processConnectionChange) | topic owner | `sendToOwner(oid)` |
  | messenger: actionable (processActionableNotification) | accepted owner (vbg) | `sendToOwner(owner)`, before topic/done are attached |
  | messenger: unknown debug notice (processUnknownNotification) | topic owner | `sendToOwner(oid)` |
  | builder `notify`/`wsOK` → `notifiers.websocket` | session owner | unchanged; `app.existing_sockets` is never filled |
  | device.js transformer "checkin" frame | none | unchanged; references an undeclared `websocket` |
  | buildlog `wsSend`/`setupTail` | arriving connection (v05) | unchanged |
  | notifier.js / redis-health.js `.send(` | n/a | Slack webhooks, not sockets |
  | thinx-core.js | n/a | writes no frames |

- **Who is affected:**
  - (a) Classic console users with the dashboard open (owner connection, init sent).
    Before: no notification frame was ever delivered (the `OPEN` TypeError). After: they
    receive their own owners' frames only. In production only `notification` messages get past
    the forwardNonNotification throw, so the visible change is "Device Interaction"
    (actionable) toasts starting to appear for the owner's own devices.
  - (b) Other owners' consoles never receive another owner's frames.
  - (c) Several sockets of one owner that sent init each receive every frame once. A second tab
    on the identical `/<owner>` path is still refused at upgrade (pre-existing).
  - (d) Log connections (`/<owner>/<ts>`): unchanged, no notification frames.
  - (e) Slack RTM (disabled): messages are no longer forwarded to any console.
  - (f) Build status: unchanged; it never reached a socket.
  - (g) Per-owner MQTT clients, Redis actionable storage and device status edits: unchanged.
- **Follow-ups:** `.planning/todos/pending/2026-10-03-console-notification-delivery-gaps.md`
  (forwardNonNotification throw, duplicate-path upgrade guard, build status frames, and the
  actionable-toast HTML sink that this fix makes reachable).
