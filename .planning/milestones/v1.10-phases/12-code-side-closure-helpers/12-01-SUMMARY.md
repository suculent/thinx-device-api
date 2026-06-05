---
phase: 12-code-side-closure-helpers
plan: 1
subsystem: testing
tags: [jasmine, websocket, ws, chai, regression-spec, integration-test, ZZ-spec]

# Dependency graph
requires:
  - phase: 06-websocket-surface-hardening
    provides: ZZ-WebSocketLifecycleSpec.js precedent (Phase 6 REFACTOR-03 raw-socket close-handler spec, bootstrap.thx + ephemeral-port pattern)
  - phase: 05-backend-hygiene-cheap-sweeps
    provides: Test-env ACCEPT pattern (local `npm test` aborts on missing `/mnt/data/conf/config.json`; canonical green-gate is CircleCI Jasmine inside the Docker test image)
provides:
  - ZZ-WebSocketHandshakeRtmSpec.js — 2 positive it() blocks covering /<owner> and /<owner>/<timestamp> in-process WebSocket upgrade paths against bootstrap.thx.server
  - Implicit-negative-case regression coverage for thinx-core.js:466 server.on('upgrade') registration (timeout-on-missing-handler at 30000ms)
  - WARN-03 contract guard preventing future maintainers from moving the bootstrap require into a function body
affects: [13-ops-exec-01-swarm-host-nginx-fix, future-ws-surface-refactors]

# Tech tracking
tech-stack:
  added: []   # `ws` package was already a runtime dep (thinx-core.js:274); no new deps
  patterns:
    - "Use `ws` package's `new WebSocket(url)` for in-process WS-handshake specs (chai-http v4 LOCK precludes upgrade testing)"
    - "Reuse bootstrap.thx + bootstrap.thx.server.address().port for ephemeral-port discovery — bootstrap owns server lifecycle, spec never calls thx.server.close"
    - "Implicit negative-case proof via 30000ms timeout (vs separate explicit-negative it() block) — D-32 lock"
    - "Top-of-file WARN-03 doc comment guards bootstrap.thx require-time semantics"

key-files:
  created:
    - spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js
  modified: []

key-decisions:
  - "Implicit negative-case proof via 30000ms timeout (D-32) — accepted over separate explicit-negative-block; simpler spec, tighter scope"
  - "WARN-03 contract guard comment added top-of-file — forbids moving the bootstrap require into a function body (would unregister bootstrap's beforeAll)"
  - "Comment text rephrased mid-execution to avoid literal grep-gate triggers while preserving intent (wss URL, thx.server.close phrase, duplicate require-string)"

patterns-established:
  - "Pattern 1: In-process WebSocket-handshake regression specs use the `ws` client + bootstrap.thx + ephemeral-port discovery; afterEach closes only the per-it sockets, never the shared server"
  - "Pattern 2: WARN-03 require-time contract guard — top-of-file doc forbidding require-into-function-body for bootstrap-shared helpers"
  - "Pattern 3: Spec-header documents the line-numbered regression target (`thinx-core.js:466`) so a future maintainer reading a CI failure immediately sees what code surface broke"

requirements-completed:
  - TEST-WS-01

# Metrics
duration: ~4min
completed: 2026-06-04
---

# Phase 12 Plan 12-01: TEST-WS-01 WebSocket Handshake CI Smoke Probe Summary

**New Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` lands 2 positive `ws`-client handshake tests against bootstrap.thx's in-process server (rtm-style `/<owner>` + `/<owner>/<timestamp>` URLs); regression target `thinx-core.js:466` is implicitly proven via 30000ms timeout per D-32, with a WARN-03 contract-guard comment forbidding future bootstrap-require relocation.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-04T17:54:00Z (worktree spawn / context-read phase)
- **Completed:** 2026-06-04T17:58:24Z (SUMMARY commit)
- **Tasks:** 2 (spec authoring + atomic GPG-signed commit)
- **Files modified:** 1 created (the spec); 1 SUMMARY artifact

## Accomplishments

- `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` lands at 134 lines, syntactically clean (`node --check` exit 0), all 14 plan grep gates green.
- 2 positive `it()` blocks: `GET /<owner> (WebSocket upgrade)` against `ws://127.0.0.1:<port>/<envi.oid>` and `GET /<owner>/<timestamp> (rtm-style WebSocket upgrade)` against `ws://127.0.0.1:<port>/<envi.oid>/<Date.now()>`. Both assert `ws.on('open', ...)` fires within an internal 5000ms timer → `expect(true).to.equal(true); done();`. Each block ends with `}, 30000);` per TESTING.md convention.
- Implicit negative-case proof documented in the file header: if `server.on('upgrade')` at `thinx-core.js:466` is removed or breaks, the `open` event never fires and the spec times out at 30000ms → FAIL. Matches D-32 (user explicitly accepted timeout-on-missing-handler over a separate explicit-negative-block).
- Bootstrap usage matches the 15 existing `ZZ-*` specs: `require('../helpers/bootstrap')` at top-of-file, reads `bootstrap.thx` in `beforeAll`, never calls `thx.server.close()` (bootstrap's global `afterAll` owns the shared-server lifecycle per D-28 / D-33).
- WARN-03 contract guard: top-of-file doc comment explicitly forbids moving the bootstrap require into a function body (would unregister bootstrap's `beforeAll` for this spec → `thx` would stay null → spec would fail silently with the WRONG reason).
- Console markers `🚸 [chai] >>> running WebSocket Handshake (rtm) spec` and `🚸 [chai] <<< completed WebSocket Handshake (rtm) spec` emitted exactly once each per D-35.
- `envi.oid` consumed from `spec/_envi.json` in both `it()` blocks; the fixture is read-only (T-12-01-01 mitigation — `grep -c "envi.oid =" ...` returns 0).
- No live rtm-edge probe in this spec; the production WebSocket handshake against the rtm-edge host stays deferred to Phase 13 OPS-EXEC-01 operator runbook per D-37.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD-style spec authoring) + Task 2 (atomic GPG-signed commit)** — `3046dabd` (`test(TEST-WS-01): add ZZ-WebSocketHandshakeRtmSpec.js in-process upgrade smoke probe`)
   - GPG signature verified Good (RSA key DC5CDA18C1DE3F9B29068802002B305D80BF729F)
   - Single file: `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` (+134 lines)
   - Body documents: 2 positive `it()` blocks, implicit-negative-case proof via 30000ms timeout, regression target `thinx-core.js:466`, chai-http v4 LOCK rationale, WARN-03 contract guard, `envi.oid` fixture-read-only invariant, no live rtm-edge probe, CircleCI green-gate is canonical.

(SUMMARY commit lands as the final action of this worktree; orchestrator merges back to `thinx-staging`.)

_Note: Tasks 1+2 were combined into a single GPG-signed commit because the plan's `<must_complete>` specifies one atomic commit for the spec file; TDD's RED-then-GREEN sequence does not apply here since the spec is itself the test artifact (there is no separate implementation step — the implementation is the existing `thinx-core.js:466` handler, which already exists and which this spec characterizes)._

## Files Created/Modified

- `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` — NEW (134 lines). 2 positive `it()` blocks against `bootstrap.thx.server.address().port` using the `ws` package client. Implicit-negative-case proof via 30000ms timeout. WARN-03 contract-guard doc comment.
- `.planning/phases/12-code-side-closure-helpers/12-01-SUMMARY.md` — NEW (this file).

## Decisions Made

- **Combined Tasks 1+2 into a single GPG-signed commit** — Plan Task 2's `<action>` explicitly mandates "exactly one GPG-signed commit on `thinx-staging`" containing only `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`. Splitting Task 1 (write file) and Task 2 (commit) into separate commits would violate the plan's atomicity requirement. The spec is a regression characterization of existing behavior (`thinx-core.js:466` upgrade handler already exists), so the TDD RED-then-GREEN sequence has no separate implementation step to commit.
- **Comment rewording during gate-failure auto-fix** — Initial draft emitted comment text that tripped 3 literal grep gates: `wss://rtm.thinx.cloud` (≠ 0), `thx.server.close` (≠ 0), and a duplicated `require('../helpers/bootstrap')` substring (1 occurrence required, comment text repeated the literal twice making 3 total). Rephrased comments to "production wss rtm-edge host", "close thx.server here", and "require of the bootstrap helper" while preserving the documented intent. Spec shape unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree path drift on Write tool call**
- **Found during:** Task 1 (initial spec file Write)
- **Issue:** The Write tool wrote the spec file to `/Users/igraczech/Repositories/thinx-device-api/spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` (main repo path) rather than to the worktree path `/Users/igraczech/Repositories/thinx-device-api/.claude/worktrees/agent-a26706651a12450ce/spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`. This is the cwd-drift hazard documented in `worktree-path-safety.md` (#3099) — an absolute path constructed without re-resolving from `git rev-parse --show-toplevel` inside the worktree drifts to the parent repo.
- **Fix:** Moved the file from the main repo path to the worktree path with `mv`. Verified main repo status is clean after move (`git -C $MAIN status --short spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` returns empty) and worktree shows the file as untracked (`?? spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`).
- **Files modified:** spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js (relocated, not edited)
- **Verification:** `node --check` exit 0, all 14 plan grep gates pass, `git -C $MAIN status` clean for this path.
- **Committed in:** 3046dabd (Task 1+2 commit on the worktree branch)

**2. [Rule 1 — Comment-text grep-gate collisions]**
- **Found during:** Task 1 verification pass
- **Issue:** 3 literal grep gates from the plan's `<acceptance_criteria>` were tripping on doc-comment text rather than on code: (a) `wss://rtm.thinx.cloud` appeared in the header doc explaining what's NOT covered; (b) `thx.server.close` appeared in the `afterAll` comment "Do NOT call `thx.server.close()`"; (c) `require('../helpers/bootstrap')` appeared 2× in the WARN-03 contract-guard comment plus 1× in the code = 3 total vs 1 expected.
- **Fix:** Rephrased the 3 comments to preserve intent without containing the literal forbidden strings: "wss://rtm.thinx.cloud" → "production wss rtm-edge host"; "Do NOT call `thx.server.close()`" → "Do NOT close thx.server here"; "do not move the `require('../helpers/bootstrap')`" → "do not move the require of the bootstrap helper".
- **Files modified:** spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js (3 small comment edits via Edit tool)
- **Verification:** All 14 grep gates now pass; WARN-03 contract intent preserved (the comment still explicitly forbids moving the require into a function body and the case-insensitive "do not move the require" gate still returns ≥ 1).
- **Committed in:** 3046dabd (Task 1+2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule-3 worktree-path-drift, 1 Rule-1 comment-text grep collision)
**Impact on plan:** Both auto-fixes preserved the plan's spec shape exactly — only file location and comment text changed. All `must_haves.truths` from the plan frontmatter still hold; all `<acceptance_criteria>` grep gates pass.

## Issues Encountered

- **HEREDOC quoting hazard on `git commit -m`** — the first commit attempt used `git commit -m "$(cat <<EOF ... EOF)"` with body text containing an apostrophe in `bootstrap's`; bash treated the embedded single-quote as terminating the outer double-quoted command substitution, producing `syntax error: unexpected end of file`. Resolved by writing the message to a `mktemp` file and using `git commit -F "$MSGFILE"` instead. Commit landed cleanly on the second attempt with GPG signature verified Good.

## User Setup Required

None — no external service configuration required for this plan. The spec runs entirely against `bootstrap.thx` (in-process THiNX server). The CircleCI green-gate inside the Docker test image is the canonical execution venue per D-41 (Phase 5 Test-env ACCEPT pattern).

## Next Phase Readiness

- **Phase 13 OPS-EXEC-01 (swarm-host nginx fix for `rtm.thinx.cloud`)** can now lean on this spec as CI regression coverage. If a future refactor of `thinx-core.js`'s WebSocket-upgrade surface removes or breaks `server.on('upgrade')` at line 466, the spec will time out at 30000ms and CI will fail — the implicit-negative-case proof activates without needing operator-side detection.
- **Parallel-safety verified** — no file outside `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` is modified by this plan. Zero file overlap with plans 12-02 (OBS-01 in `scripts/redact-managed-logs.js` + new `RedactSlackSpec.js`) and 12-03 (OBS-02 in `lib/thinx/audit-ttl-probe.js` + `thinx-core.js:~216` + `ZZ-AuditTTLEvictionSpec.js`). Wave 1 parallel execution per D-39 is conflict-free for this plan.
- **No blockers, no open questions, no architectural concerns surfaced.**

## Self-Check: PASSED

- `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exists at the worktree path
- Commit `3046dabd` is present on `worktree-agent-a26706651a12450ce` (verified via `git log --oneline -1` and `git log -1 --show-signature` shows Good signature)
- 14/14 plan acceptance-criteria grep gates pass
- `node --check spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exits 0
- Main repo (`/Users/igraczech/Repositories/thinx-device-api`) is clean for `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` (file lives only in the worktree, ready for orchestrator merge)
- No modifications to STATE.md or ROADMAP.md (worktree-mode invariant honored)

---
*Phase: 12-code-side-closure-helpers*
*Completed: 2026-06-04*
