---
phase: "43"
slug: "notification-delivery"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-13"
---

# Phase 43 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Traefik → API upgrade handler | untrusted WebSocket upgrades reach `SocketUpgrade.handle` (the only `upgrade` listener) | URL path, session cookie |
| Upgrade handler → SocketSession / Messenger | only sockets with a verified session owner are counted and later subscribed | verified owner id |
| Remote worker → builder | socket.io `job-status` and `log` events enter the builder | worker status strings, build log lines |
| Repository content → builder | `thinx.yml` values (MCU arch) reach refusal messages | repository-controlled text |
| Builder → Messenger → owner sockets → Legacy toast | Build Status frames leave the API for the owner's browser tabs | build status body, type, udid, build_id |
| Local checkout → shared `thinx-staging` | the push deploys API and Vue console to production | signed commits |
| Operator terminal → CircleCI API | one-off legacy bypass trigger (not used: operator chose `skip-bypass`) | personal CircleCI token |
| Executor / verifier / auditor → production, CircleCI, Codacy | unauthenticated reads and cookie-less WebSocket probes | public build metadata, status codes |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-43-01 | Denial of service | `SocketUpgrade` (path duplicate guard removed) | high | mitigate | `lib/thinx/socket_upgrade.js:17` `MAX_SOCKETS_PER_OWNER = 10`; `:69-74` count check and `_track` in the same synchronous callback, refusal `HTTP/1.1 429` via `socket.end` before `handleUpgrade`; `thinx-core.js:492-494` is the only `upgrade` listener (the HTTPS server at `:272` has none); SocketUpgradeSpec U4 (11th gets 429, B unaffected, slot reusable) and U6 pass (auditor re-run) | closed |
| T-43-02 | Information disclosure | owner frames with several tabs | high | mitigate | delivery stays `Messenger.sendToOwner` over the per-owner Set (`messenger.js:390`, `subscribeSocket` requires `websocket.owner === owner` `:357`); `messenger.js` and `socket_session.js` unchanged since `9dba1e76`; `wss.clients` iterated only for ping (`thinx-core.js:497-506`), `app._ws` written only by `SocketSession.accept`, no reader in `lib/`; U1 asserts owner B receives nothing | closed |
| T-43-03 | Denial of service | slot leak on aborted upgrades | medium | mitigate | `socket_upgrade.js:94` `socket.once("close")` per socket, `:98-103` `_release` deletes only that socket; `:60-63` destroyed/unwritable guard before tracking; `:81` release on `handleUpgrade` exception; `:36` no-op `error` listener so a reset during the session parse cannot crash the process; no timer cleanup; U3a, U3b pass. See Auditor Note N-1 | closed |
| T-43-04 | Information disclosure | refusal and error log lines | medium | mitigate | refusal line `socket_upgrade.js:70` names only the limit; 401 path `:51` keeps `Util.redactCookieHeader` (`util.js:196-217`, values become `<redacted>`); error lines `:40`, `:82` carry no request data; no log passes `request.headers` or `request.url`; U4 scans every captured line for `x-thx-core=` and the session id value (0 hits) | closed |
| T-43-05 | Denial of service | unauthenticated upgrade floods | low | accept | see Accepted Risks AR-43-01; premise verified in code: only `owner !== null` is tracked (`socket_upgrade.js:65-76`), `SocketSession.accept` closes the rest 1008 (`socket_session.js:42-47`), U5 | closed |
| T-43-06 | Spoofing | owner taken from the URL | high | mitigate | owner comes only from `SocketSession.verifiedOwner(request)` (`socket_upgrade.js:65`): session owner must be a non-empty string, survive `Sanitka.owner`, and equal the first path segment (`socket_session.js:22-36`); the URL is never the owner source; U5 proves a foreign path is uncounted and closed 1008 | closed |
| T-43-07 | Information disclosure | `Builder.notify` delivery | high | mitigate | `builder.js:142-153` `consoleNotifiers` returns a new `{ messenger, owner }` and ignores any caller owner; `:863` rebinds at the top of `run_build` from `br.owner`; every `notify` call site is downstream of `run_build` and nothing outside `builder.js` calls `notify`/`runShell`/`runRemoteShell`/`refuseBuild`/`processExitData`; `:201` sends only via `messenger.sendToOwner(notifiers.owner, …)`; `br.owner` is the sanitised session owner (`router.build.js:25`) or the queued action owner; T1, T3, T5, Q2 pass (auditor re-run) | closed |
| T-43-08 | Information disclosure | raw build log lines | high | mitigate | `processShellData` (`builder.js:544-568`) sends nothing per log line; its only `notify` is `Completed` on the `status: OK` line; remote `onLog` (`:391-393`) routes through the same function; `wsOK` / `sendNotificationIfSocketAlive` / `buildStatusNotification` / `notifiers.websocket` absent from code lines; F4 and S2 pass; logs stay on the per-socket logtail | closed |
| T-43-09 | Tampering | device or repository text in toast bodies (worker status, MCU arch) | medium | mitigate | Legacy `LogviewController.js` (console gitlink `cfff199`): `thinxEscapeHtml` `:11-18`; actionable body/title `:254-255`; non-actionable body `:325`, title `:362`; toastr method allow-list `:319-322`, nid pattern `:9`. Auditor re-fetched the served rtm file: byte-identical to the gitlink source (wss substituted), sha256 `e556c292…dec59d`, 5x `thinxEscapeHtml`; `test/toast-escape.cjs` 59 ok / 0 fail (auditor re-run). Frame shape unchanged (`buildNotification` `builder.js:127-135`); no server-side escaping by D-01 | closed |
| T-43-10 | Denial of service | terminal-frame memory | low | mitigate | `builder.js:51` `TERMINAL_FRAME_MEMORY = 1000`; `terminalFrameSent` `:159-168` evicts the oldest entry; M1 passes | closed |
| T-43-11 | Repudiation | misleading toasts (green on failure) | medium | mitigate | `processExitData` `builder.js:524-534`: `Completed` only for a status starting `OK`, otherwise an error frame with the status or `Failed`, null-safe; `notify` `:198-199` first terminal frame per build_id wins; remote guard `:297` passes `false`; refusal `:408`; F2a, F2a', F2b, F2c, F2d, P1 pass | closed |
| T-43-12 | Tampering | shared parent `thinx-staging` branch | high | mitigate | auditor re-check of `7cec687b..b1126b6c`: 21 commits, all `%G?` = `G`, 0 merges; non-`.planning` paths = the 10 phase files + `README.md`; `messenger.js`, `socket_session.js`, `services/console` unchanged; `origin/thinx-staging` = `b1126b6c`, `origin/main` = `14c08c1f` (unchanged) | closed |
| T-43-13 | Information disclosure | CircleCI personal token | high | mitigate | operator replied `skip-bypass` (43-03 Task 2), so no token was entered, handled or used by anyone; auditor listed thinx-staging pipelines through the public API (no token): the newest eight are all `webhook`, 5659 is the latest, no API-triggered pipeline exists; `check-ci-gates.js` reads no token (header `:50`; its `token` variables are page tokens); runbook §4 unchanged since Phase 42 (T-42-01 closed) | closed |
| T-43-14 | Denial of service | production API/Vue/Legacy rollouts | high | mitigate | preflight specs and toast test before push (43-03 SUMMARY); `CI-GATES PIPELINE OK 5659` (auditor re-read); `WS-MULTITAB OK 2/2 opened` against `wss://rtm.thinx.cloud` (auditor re-run, exit 0); Legacy image not rebuilt (skip-bypass) so its rollout risk did not arise; rollback = revert pushed to thinx-staging; no ssh or service edits | closed |
| T-43-15 | Elevation of privilege | CI-05 gate left open | medium | mitigate | `.circleci/config.yml:15-17` `build_legacy_console` boolean, `default: false`; `.circleci/` unchanged since `9dba1e76`; `CI-GATES COMPILE OK` recorded in 43-03 SUMMARY; no API-triggered (bypass) pipeline exists | closed |
| T-43-16 | Spoofing | bypass run on a different commit | medium | mitigate | surface never arose: no `build_legacy_console=true` pipeline was triggered (skip-bypass; auditor pipeline listing shows no API trigger), so there is no bypass revision to mismatch | closed |
| T-43-17 | Information disclosure | live probes and evidence | low | mitigate | `scripts/check-ws-multitab.js:77-78` refuses URLs with credentials, query or fragment; `:121` `new WebSocket(href, { handshakeTimeout })` sets no header or cookie; output prints no response headers; SUMMARY evidence holds job names, statuses, hashes and header dates only | closed |
| T-43-SC | Tampering | npm/pip/cargo installs (43-01, 43-02, 43-03) | low | mitigate | no `package.json`, `package-lock.json`, `services/console` or `.circleci` change since `9dba1e76`; `ws` is an existing dependency; 43-03 ran `npm run test:toast` only, no install | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-43-01 | T-43-05 | Unverified upgrades are not counted against any owner and are closed 1008 by `SocketSession.accept`, as before Phase 43. A per-IP limit is not possible while swarm ingress-mode publishing shows every client as `10.0.0.2` to Traefik and the API (operator memory, verified 2026-10-08). Revisit when host-mode publishing or PROXY protocol lands | operator (plan-time) | 2026-10-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Auditor Notes (informational, not in the register)

- **N-1 (low, pre-existing, related to T-43-01/T-43-03):** the 30 s heartbeat never marks a socket dead. `thinx-core.js:496-507` terminates a socket only if `ws.isAlive === false`, and nothing sets it to `false` before `ws.ping()` (same at `9dba1e76:thinx-core.js:540`). A half-open connection therefore keeps its per-owner slot until TCP gives up, which can take minutes. An owner with repeated unclean disconnects could briefly hit the 10-socket cap and see 429 on a new tab. The effect is limited to that owner. Before Phase 43, a dead socket blocked its whole path, so the phase still improves things. Candidate fix for a later phase: set `ws.isAlive = false` before `ws.ping()`.
- **N-2:** `skip-bypass` removed the attack surface of T-43-13 and T-43-16. The `thinx/console:swarm` image refresh moves to Phase 48 CI-06, and that phase's security audit should cover the token path when the legacy build runs again.
- **N-3:** the code-level mitigations for T-43-02 and T-43-07 are proven by local specs. Live cross-account isolation (H5) and two-tab build toasts (H2) are still pending in `43-HUMAN-UAT.md`. They confirm these mitigations live but do not gate this register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-13 | 18 | 18 | 0 | gsd-security-auditor (ASVS L1 grep-depth, block_on high, plan-time register from 43-01..03; re-ran SocketUpgradeSpec + BuilderStatusFramesSpec + MessengerOwnerSocketSpec 58/0, toast-escape 59/0, live multitab probe, pipeline 5659 read, served LogviewController cmp; no token, no ssh, no push) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-13
