# Phase 43: Notification Delivery - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), all 4 areas accepted by the operator

<domain>
## Phase Boundary

Device notifications reach every open console of their owner, build status included, and a device can no longer
inject markup into the owner's console toast. The escaped toast goes live in production now (through a one-off
legacy console build with CI-05 bypassed for that one pipeline), not at milestone close.

In scope: NOTIF-01 (escaped actionable toast, live on rtm.thinx.cloud), NOTIF-02 (two Legacy tabs on the same
`/<owner>` socket path), NOTIF-03 (build status frames reach the owner's sockets). Todo
`2026-10-03-console-notification-delivery-gaps` items 2–4.

Out of scope: device port `:7442` and plain MQTT (untouched), `forwardNonNotification` status/connection and generic
toasts (todo item 1, resolved separately, stay off), NOTIF-04 (Phase 48), CI-06 re-enable (Phase 48), any Vue change.

</domain>

<decisions>
## Implementation Decisions

### NOTIF-01: escaped toast and the one-off legacy build
- **D-01:** Escape console-side only, as already committed in the console submodule: `thinxEscapeHtml` in
  `services/console/src/app/js/controllers/LogviewController.js` (commit `e43a94d`, ancestor of the pinned `cfff199`).
  The frame payload stays unchanged; no server-side escaping in `processActionableNotification`.
- **D-02:** No Vue change. The Vue console renders no device notification text (no WebSocket, no `v-html`,
  vue-toasted never fed device text). The plan records this as a verified non-issue.
- **D-03:** The operator triggers the one-off legacy pipeline with the runbook bypass snippet
  (`.planning/runbooks/legacy-console-build-gate.md` §4) using their own CircleCI token, as a `checkpoint:human-action`.
  The token never enters Claude's session. Claude verifies with
  `node scripts/check-ci-gates.js pipeline --pipeline-id <id> --expect legacy-on --wait`.
- **D-04:** Proof it is live: rtm.thinx.cloud's served LogviewController contains `thinxEscapeHtml` and the escaped
  actionable toast code; the next normal thinx-staging pipeline is `legacy-off`
  (`check-ci-gates.js pipeline --revision … --expect legacy-off`); `services/console/src` `test:toast`
  (`node test/toast-escape.cjs`) passes.

### NOTIF-02: two Legacy tabs on the same socket path
- **D-05:** Remove the path-keyed duplicate-upgrade guard in `thinx-core.js` (`socketMap` keyed by `request.url`
  path, ~:486-496) and track live sockets per connection instead of per path. Each socket's close releases only
  itself, so the REFACTOR-03 release guarantee (`ZZ-WebSocketLifecycleSpec`) still holds.
- **D-06:** Delivery authority is the messenger's per-owner `Set` (`subscribeSocket` / `sendToOwner` in
  `lib/thinx/messenger.js`), which already supports many sockets per owner. `SocketSession` `registry[key]`
  (`lib/thinx/socket_session.js`) stays a latest-socket pointer; logtail keeps working per socket.
- **D-07:** Cap live sockets per owner at a small number (about 10). Further upgrades are refused with a log line, so
  resource use stays bounded now that the duplicate guard is gone. Exact value and refusal mechanism are the planner's call.
- **D-08:** Proof by spec: extend `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` / `ZZ-WebSocketLifecycleSpec.js`:
  two tabs on the same `/<owner>` path both connect and both receive the owner's frame; after one closes the other
  still receives; another owner's socket receives nothing. `ZZ-WebSocketHandshakeRtmSpec` must stay green and
  per-owner routing (quick 261003-vn3) must hold: no cross-owner delivery.

### NOTIF-03: build status frames
- **D-09:** Builder `notify` / `wsOK` / status notifications in `lib/thinx/builder.js` send through
  `app.messenger.sendToOwner(owner, frame)`. Remove the never-filled `app.existing_sockets` (`lib/router.build.js:9`,
  :36-51) and the `notifiers.websocket` path.
- **D-10:** Only status notifications are sent (Pulling repository / Building... / Completed / failures, `type`
  success/error/info). Raw build log lines stay on the per-socket logtail and are not broadcast to every owner socket.
- **D-11:** Frame format unchanged: `{"notification":{"title":"Build Status","body":…,"type":…,"udid":…,"build_id":…}}`.
  The Legacy console detects frames by the `{"notification":` prefix and refreshes builds on those bodies
  (LogviewController.js ~:209-240).
- **D-12:** Queued builds (`lib/thinx/queue.js` ~:279, currently passes `[]`) notify the same way. Proof: a spec where
  a build for owner A reaches A's sockets and owner B's socket gets nothing (extend `MessengerOwnerSocketSpec` /
  `XBuilderSpec` or similar).

### Shipping order and scope
- **D-13:** Normal `thinx-staging` push first, carrying the API changes for NOTIF-02/03 plus the commits held since
  Phase 42 (close-out docs, WR-01 `4e16212c`, quick 261012-r9z `5836eed0`/`174cf071`). Then the operator triggers the
  bypass pipeline on that same commit to build the legacy console. That pipeline also reruns the API and Vue deploys
  (42-REVIEW IN-01); this is accepted. Pushes go to `thinx-staging` only, never `main`, never force.
- **D-14:** The one-off legacy build carries only what is in the console submodule now. Before triggering, confirm the
  console `thinx-staging` has no Legacy (`services/console/src`) change besides NOTIF-01 (`e43a94d`) since the last
  live Legacy build. If it has others, stop and ask the operator.
- **D-15:** `:7442`, plain MQTT and `forwardNonNotification` toasts stay untouched; status/connection and generic toasts
  stay off.
- **D-16:** Production checks: automated (pipeline gates, served Legacy file, specs) plus human UAT on rtm.thinx.cloud:
  two tabs on the same owner both connect and receive; a real build's status toast appears in both tabs; an HTML
  notification body renders as literal text.

### Claude's Discretion
- The per-owner socket cap value and how a refused upgrade is answered (D-07).
- How sockets are tracked per connection in `thinx-core.js` (a `Set`, a per-socket id, or a counter per owner) as long
  as D-05 and D-08 hold.
- Whether the builder receives the messenger through `notifiers` or reads `app.messenger` directly (D-09, D-12).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/thinx/messenger.js`: `_subscriptions()` :348, `subscribeSocket(owner, ws)` :353 (requires `ws.owner === owner`,
  Set per owner, unsubscribes on close), `unsubscribeSocket` :375, `subscriberCount` :383, `sendToOwner(owner, notif)`
  :390 (JSON.stringify, skips and drops sockets that are not OPEN, returns the count sent). Sockets subscribe only via
  `initWithOwner(owner, websocket, cb)` :1176 (the console's `{init: owner}` frame).
- `lib/thinx/socket_session.js`: `verifiedOwner(request)`, `accept()` sets `ws.owner`, `registry[key] = ws`, close
  deletes only if `registry[key] === ws`; `onMessage` handles `logtail` and `init` frames.
- Legacy console tests: `services/console/src/test/toast-escape.cjs` (`npm run test:toast` in `services/console/src`).
- Runbook: `.planning/runbooks/legacy-console-build-gate.md` §4 (bypass trigger), `.planning/runbooks/websocket-handshake.md`.
- `scripts/check-ci-gates.js` (`pipeline --pipeline-id … --expect legacy-on|legacy-off --wait`).

### Established Patterns
- WebSocket upgrade path in `thinx-core.js`: `socketMap` :486, key from `request.url` :490, duplicate guard :492-496,
  sessionParser + `x-thx-core` 401 :498-510, `socketMap.set` + raw `socket.on('close')` delete (REFACTOR-03) :512-531,
  `wss.on('connection')` → `SocketSession.accept(ws, req, {registry: app._ws, blog, messenger, callback})` :591-624,
  `initSocket` heartbeat :575-589, 30 s ping interval :537-548.
- Builder frames (`lib/thinx/builder.js`): `wsOK` :92, `sendNotificationIfSocketAlive` :131 (returns on null, needs
  `isAlive`), `buildStatusNotification`/`buildNotification`, `notify(udid, build_id, notifiers, message, success_status)`
  :177; callers :306/316/327/364/408/526/555/838/910/921; `processExitData` :520 → `wsOK` :530; `processShellData`
  ~:555-567 sends raw loglines to `notifiers.websocket`.
- Per-owner routing invariant from quick 261003-vn3: every messenger console frame goes only to its owner's sockets.

### Integration Points
- `lib/router.build.js` build route (:36-51) builds `notifiers`; `lib/thinx/queue.js` ~:279 passes `[]`.
- Specs: `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`, `ZZ-WebSocketLifecycleSpec.js`, `ZZ-LogTailWebSocketSpec.js`,
  `LogTailOwnerSpec.js`, `MessengerOwnerSocketSpec.js`, `MessengerSpec.js`, `XBuilderSpec.js`, `ZZ-RouterBuilderSpec.js`.
- Legacy console sockets: `new WebSocket(wssUrl + "/" + owner)` and `owner + "/" + Date.now()` (log socket);
  `wssinit` sends `{init: owner}` (LogviewController.js :54-148).

</code_context>

<specifics>
## Specific Ideas

- The bypass trigger is the runbook §4 snippet verbatim: hidden-prompt token, `--header @-` on stdin, `unset` after,
  body `{"branch":"thinx-staging","parameters":{"build_legacy_console":true}}` against
  `gh/suculent/thinx-device-api`.
- After the bypass pipeline, the next normal push must again compile and run `legacy-off`; `build_legacy_console`
  stays `default: false` (CI-06 flips it in Phase 48).

</specifics>

<deferred>
## Deferred Ideas

- Status/connection and generic "[DEBUG] Generic Message" toasts from `forwardNonNotification` (todo item 1): stay off.
- Server-side escaping of `notification.body`: not done (console-side escape is the chosen fix).
- PasswordReset red buttons, "Create an Account" routing, footer focus/hash weight (Phase 42 UI review): not this phase.

</deferred>
