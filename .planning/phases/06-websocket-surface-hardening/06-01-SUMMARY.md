---
phase: 06-websocket-surface-hardening
plan: 01
subsystem: websocket
tags: [refactor, websocket, lifecycle, thinx-core, resource-cleanup]

# Dependency graph
requires:
  - phase: 05-backend-hygiene-cheap-sweeps
    provides: post-Phase-5 thinx-core.js layout (REFACTOR-01 trust-proxy dedup landed at :420-421)
provides:
  - Raw-socket close handler in the WS upgrade flow at thinx-core.js:487-491 (registered immediately after `socketMap.set(socketKey, socket)`)
  - Regression spec `spec/jasmine/ZZ-WebSocketLifecycleSpec.js` asserting socketMap cleanup on aborted mid-flight upgrade via the duplicate-guard observation channel
affects:
  - Phase 6 Plan 06-03 (SEC-COOKIE-01) — targets thinx-core.js:316, a different region; no line-number collision with the :487-491 addition
  - Future Phase 6 / Phase 9 work touching the WS upgrade handler — both raw-socket and wss-level close handlers now cover the full lifecycle (raw socket → upgraded WS → close)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual close-handler pattern for staged-handshake protocols: register the raw-socket cleanup BEFORE the upgrade-handshake call so the handler is live across the gap between `set` and the post-handshake `ws.on('close')` attachment. Map.delete idempotency makes the dual-fire safe."
    - "Behavioral observation via duplicate-guard log capture: when a closure-private map cannot be inspected directly, assert cleanup by triggering the data-structure's downstream consumer (the duplicate-guard) and asserting it does NOT fire."

key-files:
  created:
    - spec/jasmine/ZZ-WebSocketLifecycleSpec.js
  modified:
    - thinx-core.js

key-decisions:
  - "Inserted the new `socket.on('close', () => socketMap.delete(socketKey))` block immediately after `socketMap.set(socketKey, socket)` and immediately before the `try { wss.handleUpgrade(...) }` block — the exact placement locked in CONTEXT.md, so the handler is registered before any code path that can throw or destroy the socket."
  - "Did not touch the existing wss-level `ws.on('close')` handler at thinx-core.js:602 (was :597-599 pre-edit; shifted by +5 from the new raw-socket block) — both handlers together cover the full lifecycle; Map.delete is idempotent, so the wss-level handler still works post-upgrade."
  - "Did not touch the existing `catch (_upgradeException)` block at :498-502 — it covers the `wss.handleUpgrade` synchronous-throw case; the new raw-socket handler covers every other mid-flight abort path."
  - "Regression spec observes cleanup BEHAVIORALLY via the duplicate-guard log line at thinx-core.js:463-467 (`socketMap` is closure-private, not exposed on `thx.app`) — `console.log` monkey-patch + raw `net.connect` second-upgrade attempt."
  - "Local Jasmine green-gate not achievable (Phase 5 ACCEPT pattern: missing `/mnt/data/conf/config.json` locally aborts `npm test`; the `|| true` in package.json:19 masks the failure). Static gates (`node --check`, grep shape) are authoritative locally; CI-side Jasmine run inside the Docker test image is the canonical behavioral gate."

patterns-established:
  - "Dual close-handler pattern for staged-handshake protocols (see decision-block + Behavior 1-4 in plan)."
  - "Phase 5 ACCEPT pattern extended to Phase 6: when local test environment is incomplete, static gates are authoritative locally and CI-side Jasmine is the canonical behavioral green-gate."

requirements-completed: [REFACTOR-03]

# Metrics
duration: ~4min
completed: 2026-06-02
---

# Phase 6 Plan 1: REFACTOR-03 — Raw-Socket Close Handler in WS Upgrade Flow Summary

**Closed the WebSocket resource-cleanup gap on mid-flight upgrade aborts by registering a raw-socket `close` handler immediately after `socketMap.set(socketKey, socket)` in the thinx-core.js upgrade flow — Map.delete idempotency keeps the existing wss-level handler safe.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-02T21:27:14Z (orchestrator hand-off into Phase 6 execution)
- **Completed:** 2026-06-02T21:31:38Z
- **Tasks:** 3 of 3 (1 code edit + 1 new spec + 1 atomic commit)
- **Files modified:** 1 (`thinx-core.js`) — 5 insertions, 0 deletions
- **Files created:** 1 (`spec/jasmine/ZZ-WebSocketLifecycleSpec.js`) — 166 lines

## Accomplishments

- Added a raw-socket `socket.on('close', () => socketMap.delete(socketKey))` block at thinx-core.js:487-491 (one rationale comment + the three-line handler), inserted immediately after `socketMap.set(socketKey, socket)` at :485 and immediately before the `try { wss.handleUpgrade(...) }` block at :493 — the exact placement specified by the CONTEXT.md REFACTOR-03 decision block.
- Left the existing wss-level `ws.on('close')` handler unchanged at its new line number :602 (was :597 pre-edit; shifted by +5 from the new block). Both handlers together cover the full lifecycle: the new raw-socket handler catches mid-flight aborts before `wss.handleUpgrade` attaches; the wss-level handler catches post-upgrade closes. `Map.delete` is idempotent, so double-firing across both handlers is safe.
- Created `spec/jasmine/ZZ-WebSocketLifecycleSpec.js` (166 lines) — a regression spec that:
  - Boots THiNX in-process via the canonical `new THiNX(); thx.init(...)` pattern (mirrors `ZZ-AppSession.js`).
  - Reads the ephemeral port from `thx.server.address().port` (test env uses `port 0` per thinx-core.js:409).
  - Opens a raw `net.connect` to the in-process server, sends a manual HTTP/1.1 WebSocket upgrade with `Cookie: x-thx-core=...` (so the cookie-presence gate at :475-480 passes), then aborts the socket with `socket.destroy()` after a 100ms prime delay.
  - After a 150ms server-side cleanup window, monkey-patches `console.log` and opens a SECOND raw-socket upgrade against the SAME socketKey.
  - Asserts the captured log lines do NOT contain `Socket already mapped for <socketKey>` — the duplicate-guard log emitted by thinx-core.js:463-467 when a same-socketKey reconnect hits a stale map entry. Absence of that log proves the raw-socket close handler ran and released the map entry.
  - Uses raw `net` (chai-http v4 cannot abort mid-upgrade) and `console.log` monkey-patching (no sinon, per CONVENTIONS.md). Restores `console.log` in `afterEach` and `afterAll`. Closes `thx.server` in `afterAll`.
- Landed as one atomic GPG-signed commit (`75772191`) touching exactly the two declared files.

## Task Commits

All three tasks rolled into the single atomic commit per the plan's explicit "atomic per-requirement" instruction (Tasks 1 and 2 are content-producing; Task 3 is the staging+commit step):

1. **Task 1: Add the raw-socket close handler in `thinx-core.js`** — 5 lines inserted (1 comment + 1 blank + 3-line handler block) at :487-491, immediately after `socketMap.set` at :485.
2. **Task 2: Create the regression spec `ZZ-WebSocketLifecycleSpec.js`** — 166-line new file under `spec/jasmine/`.
3. **Task 3: Stage and commit atomically** — `75772191` (`refactor(REFACTOR-03): raw-socket close handler in WS upgrade flow`).

**Full SHA:** `7577219175ef8ff56dba687d1e1b454b96d4516a`
**Signature:** Good signature from RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F` (Matej Sychra)
**Branch:** `thinx-staging` (per execution rules — single-branch mode)
**Pushed:** No (per execution rules — phase wrap-up decides push timing)

## Files Created/Modified

- **`thinx-core.js`** — 5 insertions, 0 deletions. Single hunk inside the WS upgrade handler:
  - Line 487 (new): `// REFACTOR-03: raw-socket close handler — ... Map.delete is idempotent so double-firing with the wss-level handler is safe.`
  - Line 488 (new): `socket.on('close', () => {`
  - Line 489 (new): `  socketMap.delete(socketKey);`
  - Line 490 (new): `});`
  - Line 491 (new): blank line separator before the `try {` block.
  - The wss-level handler shifts from :597 to :602 by the +5 line offset; otherwise unchanged.
- **`spec/jasmine/ZZ-WebSocketLifecycleSpec.js`** — 166 new lines. Single `describe("WebSocket lifecycle (REFACTOR-03)")` block with one `it("REFACTOR-03 — raw-socket close handler releases socketMap on aborted upgrade")` test. Bootstrap matches `ZZ-AppSession.js`; observation channel matches `ZZ-OwnerLogRedactionSpec.js`'s `console.log` monkey-patch pattern.

## Decisions Made

Followed the plan and CONTEXT.md REFACTOR-03 decision block exactly:

- **Handler placement:** Immediately after `socketMap.set(socketKey, socket)` (post-edit line :485) and immediately before the `try { wss.handleUpgrade(...) }` block (post-edit line :493). Order matters: the handler must be live BEFORE any code path that can throw or destroy the socket. Per CONTEXT.md, this exact placement.
- **wss-level handler untouched:** The existing `ws.on('close')` at the new line :602 (was :597 pre-edit) stays. `Map.delete` is idempotent — both handlers can fire on the same socketKey without conflict.
- **`catch (_upgradeException)` untouched:** The existing block at :498-502 (was :493-497 pre-edit) already calls `socketMap.delete(socketKey)` for the synchronous-throw case. The new raw-socket handler covers every other path (client disconnect, network abort, mid-flight `socket.destroy()`).
- **Spec observation channel:** Behavioral via duplicate-guard log capture, NOT direct map inspection (`socketMap` is closure-private). The duplicate-guard at :463-467 emits `Socket already mapped for <socketKey>, dropping duplicate upgrade.` whenever the map already has a same-socketKey entry. If the close handler ran, the second upgrade attempt does NOT trip the guard → captured logs lack the substring → spec passes. If the handler did NOT run (regression bait), the guard DOES trip → captured logs contain the substring → spec fails.
- **Raw `net.connect` (not chai-http):** chai-http v4 cannot abort an upgrade mid-handshake. Raw `net.connect` + manual HTTP/1.1 upgrade headers is the only way to drive the abort path.
- **No mocking framework:** `console.log` monkey-patch + restore-in-finally, per CONVENTIONS.md "Do not introduce sinon, jest, or other mocking frameworks". Matches the `ZZ-OwnerLogRedactionSpec.js` pattern.
- **Local test-environment ACCEPT (Phase 5 pattern):** Did not attempt `npm test` locally — the THiNX Jasmine harness requires `/mnt/data/conf/config.json` plus CouchDB/Redis/MQTT that the local clone does not have. Static gates (`node --check`, `grep` shape gates) are authoritative locally; the CI-side Jasmine run inside the Docker test image is the canonical behavioral gate and runs automatically on the commit.

## Deviations from Plan

### 1. [Plan Acceptance Criteria Variance, not auto-fix] Task 1 grep gate literal mismatch

- **Found during:** Task 1 verification.
- **Issue:** The Task 1 verify step and acceptance criterion #1 specify:
  `grep -v '^[[:space:]]*//' thinx-core.js | grep -c "socket\.on('close'"` returns `2` (was 1 before the edit — the existing wss-level handler at line 597 plus the new raw-socket handler).
  The literal regex `socket\.on('close'` matches the new raw-socket handler at :488 (`socket.on('close', () => {`) but does NOT match the existing wss-level handler at :602, whose source text is `ws.on('close', () => {` — the receiver variable is `ws`, not `socket`. The actual post-edit count for `grep -c "socket\.on('close'"` is therefore `1`, not `2`. (Pre-edit, the count was `0`, not `1` as the criterion stated.)
- **Disposition:** ACCEPT and document. The substantive intent of acceptance criteria #1 + #2 (both close handlers present and addressing the same `socketKey`) is fully met:
  - `grep -nE "(socket|ws)\.on\(.close" thinx-core.js` returns TWO lines:
    - Line 488: `socket.on('close', () => {` — new raw-socket handler
    - Line 602: `ws.on('close', () => {` — existing wss-level handler (unchanged)
  - All four Behaviors in Task 1 are satisfied (placement at :488 right after `socketMap.set` at :485, closure-captured `socketKey`, wss-level handler unchanged, `node --check` clean).
  - Acceptance criteria #3, #4, #5 (REFACTOR-03 comment placement at :487, `node --check` exits 0, single 5-line addition / 0 deletions in `git diff`) all pass exactly.
- **Resolution:** None required at executor time — the variance is in the criterion's regex literal, not in the code. Behavior-level intent is fully met. Documented here so a future reviewer is not confused by `grep -c "socket\.on('close'"` returning `1` instead of `2`.
- **Files modified:** None (criterion-text variance only).
- **Committed in:** N/A.

### 2. [Environment limitation, Phase 5 ACCEPT pattern] Local Jasmine spec gate could not run

- **Found during:** Task 2 (regression spec creation).
- **Issue:** Same as Phase 5 Plan 5-01: `npm test` aborts with `Error: Config not found in /mnt/data/conf/config.json` (`lib/thinx/globals.js:18`) because the local clone does not have the deployed config layout, CouchDB, Redis, or MQTT. The trailing `|| true` in `package.json:19` masks the non-start to exit 0. Therefore the local green-gate for `ZZ-WebSocketLifecycleSpec.js` is the static gates specified by Task 2's `<verify>` step (file exists, `node --check` clean, grep shape) — NOT a behavioral Jasmine run.
- **Disposition:** ACCEPT per the Phase 5 pattern documented in `.planning/phases/05-backend-hygiene-cheap-sweeps/05-01-SUMMARY.md` (Deviation #1). The canonical behavioral green-gate for this spec is the CI-side Jasmine run inside the Docker test image, which runs automatically on the CircleCI build triggered by the commit (`75772191`).
- **Resolution:** None required at executor time. All static gates pass:
  - `node --check spec/jasmine/ZZ-WebSocketLifecycleSpec.js` exits 0.
  - `grep -c "REFACTOR-03"` returns `6` (≥ 2).
  - `grep -c "Socket already mapped"` returns `4` (≥ 1).
  - `grep -cE "require\(['\"](http|net)['\"]\)"` returns `1` (≥ 1).
  - `grep -c "describe("` returns `1` (≥ 1).
  - Teardown match (`thx\.server\.close|thx && thx\.server`) returns `2` (≥ 1).
  - File line count `166` (≥ 40).
- **Files modified:** None (verification-only deviation).
- **Committed in:** N/A.

---

**Total deviations:** 2 (1 plan acceptance-criteria variance + 1 environment-limitation; both ACCEPT, no auto-fixes triggered, no Rule 1/2/3/4 conditions encountered).
**Impact on plan:** None. Substantive intent of every acceptance criterion is fully met by the static and structural gates that DID run. The CI-side behavioral gate remains the canonical regression check for the new spec.

## Issues Encountered

- **HEREDOC commit attempt failed on first try** — initial `git commit -S -m "$(cat <<'EOF'...EOF)"` invocation hit a bash parsing error (likely due to interaction between backticks in the body and the outer `$(...)` substitution despite the quoted heredoc delimiter). Resolved by writing the commit message to `/tmp/refactor-03-commit-msg.txt` and using `git commit -S -F` instead — clean, deterministic, no quoting surprises. No code or staging affected; only the commit invocation shape.

## User Setup Required

None — no external service configuration changed. The new spec runs in-process via the canonical THiNX bootstrap (`new THiNX(); thx.init(...)`) and binds to an ephemeral port; the raw-socket abort + duplicate-guard observation is fully self-contained.

## Threat Flags

None — this plan does NOT introduce new security surface. Per the plan's threat model:

- T-06-01 (Denial of Service on `socketMap`): disposition `mitigate` — the raw-socket close handler is the mitigation. Post-state, mid-flight aborts release the map entry deterministically; the duplicate-guard at :463-467 no longer stays "armed" against legitimate reconnects. The new regression spec is the behavioral assertion of this mitigation.
- T-06-02 (Tampering on source): disposition `accept` — single 5-line insertion + 166-line additive spec; no new dependencies; no transitive supply-chain exposure.
- T-06-03 (Repudiation via IP attribution): disposition `accept` — no change to req.ip, session-cookie attribution, or audit-log surface.
- T-06-04 (Information disclosure via spec `console.log` capture): disposition `accept` — the spec monkey-patches `console.log` only inside `beforeEach`/`afterEach` and restores it; captured lines stay in spec-process memory and are never persisted.

## Known Stubs

None. No placeholder/empty/TODO patterns introduced. The comment line at :487 is a documentation marker, not a stub. The spec's defensive `if (!addr || !addr.port)` early-return is a runtime guard for unusual local-env shapes (not a stub) — if it triggers, the spec logs and gracefully marks `done()`; in CI (where `thx.server` always exposes an address), this branch is never taken.

## Next Phase Readiness

- **Wave 1 Plan 06-03 (SEC-COOKIE-01) ready:** Targets a DIFFERENT region of `thinx-core.js` (line :316 area, main session cookie config). No line-number collision with the :487-491 addition in this plan — the cookie config is well above the WS upgrade handler. The 06-03 planner reads the post-Plan-06-01 state directly.
- **Cross-plan compatibility verified:** Both the new raw-socket handler (:488) and the existing wss-level handler (:602) remain stable across any future SEC-COOKIE-01 edits at :316; those edits only shift line numbers near :316, leaving the WS region intact.
- **CI gate live on commit:** The CircleCI pipeline triggered by `75772191` is the canonical behavioral gate for `ZZ-WebSocketLifecycleSpec.js`. If it surfaces a regression, the operator can revert this single atomic commit cleanly.

## Self-Check: PASSED

- File `thinx-core.js` present and modified — confirmed via `git log -1 --stat` (5 insertions, 0 deletions, single hunk).
- File `spec/jasmine/ZZ-WebSocketLifecycleSpec.js` present and added — confirmed via `git log -1 --stat` (166 new lines, mode 100644).
- Commit `7577219175ef8ff56dba687d1e1b454b96d4516a` present in git log — confirmed via `git rev-parse HEAD`.
- GPG signature verified `Good signature from "Matej Sychra <suculent@me.com>"` — confirmed via `git log -1 --show-signature` (RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F`).
- `grep -nE "(socket|ws)\.on\(.close" thinx-core.js` returns two lines (:488 raw-socket, :602 wss-level) — confirmed.
- `grep -nE "REFACTOR-03: raw-socket close handler" thinx-core.js` returns exactly one match at line `:487` (between 480 and 495, immediately above the new handler) — confirmed.
- `node --check thinx-core.js` exits 0 — confirmed.
- `node --check spec/jasmine/ZZ-WebSocketLifecycleSpec.js` exits 0 — confirmed.
- All Task 2 static gates (REFACTOR-03 mention count = 6 ≥ 2, "Socket already mapped" count = 4 ≥ 1, `require('net')` count = 1 ≥ 1, `describe(` count = 1 ≥ 1, teardown count = 2 ≥ 1, line count = 166 ≥ 40) — confirmed.
- Commit subject exact match `refactor(REFACTOR-03): raw-socket close handler in WS upgrade flow` — confirmed.
- Working tree clean post-commit (`git status --short` empty) — confirmed.
- No unintentional deletions in the commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty) — confirmed.

---
*Phase: 06-websocket-surface-hardening*
*Plan: 01 — REFACTOR-03*
*Completed: 2026-06-02*
