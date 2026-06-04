---
phase: 05-backend-hygiene-cheap-sweeps
plan: 01
subsystem: infra
tags: [refactor, express, trust-proxy, thinx-core, swarm-topology, traefik, loopback]

# Dependency graph
requires:
  - phase: v1.0 GA (shipped 2026-05-27)
    provides: stable thinx-core.js boot path with Traefik-on-loopback swarm topology
provides:
  - Single canonical `app.set('trust proxy', ['loopback', '127.0.0.1'])` call site at thinx-core.js:421
  - Explanatory REFACTOR-01 comment at thinx-core.js:420 documenting intent + topology rationale
affects:
  - Phase 6 (REFACTOR-03 WebSocket lifecycle / SEC-COOKIE-01 session cookie) — both consume req.ip indirectly via the trust-proxy setting; the canonical site is now unambiguous for any future audit
  - Phase 8 (AUTH-* lifecycle) — login/reset flows that depend on correct req.ip attribution will read from a single, documented source

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "single-source-of-truth comment marker pattern: prefix the surviving call site with a `// REFACTOR-NN:` rationale comment whenever de-duplication preserves an existing-but-implicit value"

key-files:
  created: []
  modified:
    - thinx-core.js

key-decisions:
  - "Keep the allowlist form `['loopback', '127.0.0.1']` (preserves observed behavior — that call has been winning all along because it ran later) and delete the earlier number-of-proxies form `1` — per the CONTEXT.md REFACTOR-01 decision block."
  - "Add a one-line `//` rationale comment immediately above the surviving call to make the choice and the swarm topology (Traefik-on-loopback) explicit for future readers."
  - "Do not touch the unrelated `require('path');` no-op at the old :302 — that is flagged for the v1.10 hygiene backlog (package.json audit) and is OUT OF Phase 5 scope."

patterns-established:
  - "REFACTOR-NN marker comments: when a refactor preserves observed behavior by collapsing duplicates, the surviving site gets a `// REFACTOR-NN: …` comment naming the requirement and stating the rationale. Makes the git-archaeology trail explicit at the call site."

requirements-completed: [REFACTOR-01]

# Metrics
duration: ~5min
completed: 2026-06-02
---

# Phase 5 Plan 1: REFACTOR-01 — Single Trust-Proxy Source Summary

**Collapsed two competing `app.set('trust proxy', ...)` calls in thinx-core.js to one canonical allowlist-form site, with an explanatory comment naming the swarm topology rationale — zero observable behavior change.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-02T19:04:53Z (orchestrator hand-off into Phase 5 execution)
- **Completed:** 2026-06-02T19:09:08Z
- **Tasks:** 3 of 3 (1 edit + 1 verification + 1 commit)
- **Files modified:** 1 (`thinx-core.js`)

## Accomplishments

- Deleted the redundant `app.set("trust proxy", 1);` at the old `thinx-core.js:300` (number-of-proxies form, was being overwritten on every boot by the later call).
- Preserved `app.set('trust proxy', ['loopback', '127.0.0.1']);` at the surviving call site (now `thinx-core.js:421`) as the single canonical source — this is the value the system has been running with all along.
- Added a one-line REFACTOR-01 rationale comment at `thinx-core.js:420` explaining that this is the single source of truth and naming the Traefik-on-loopback swarm topology as the reason the allowlist form is correct.
- Landed as one atomic GPG-signed commit (`6ab471d3`) touching only `thinx-core.js`.

## Task Commits

Each task was committed atomically (per CONTEXT.md "one atomic commit per REFACTOR-NN" recommendation, Tasks 1 + 2 collapsed into a single commit because Task 2 is verification-only):

1. **Task 1: Delete duplicate trust-proxy call and add rationale comment** — code change staged
2. **Task 2: Run Jasmine session/auth/reset specs** — verification only (see Deviations below: environment limitation)
3. **Task 3: Stage and commit atomic REFACTOR-01 change** — `6ab471d3` (`refactor`)

**Full SHA:** `6ab471d3944f85397f4e6b3587e17e74a904b611`
**Signature:** Good signature from RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F` (Matej Sychra)

## Files Created/Modified

- `thinx-core.js` — Removed line `app.set("trust proxy", 1);` from the DI block (old `:300`); added REFACTOR-01 rationale comment at line 420 immediately above the surviving allowlist-form call at line 421. Diff stat: 1 insertion (+), 2 deletions (−).

## Decisions Made

Followed the plan and CONTEXT.md REFACTOR-01 decision block exactly:

- **Surviving form:** `['loopback', '127.0.0.1']` (allowlist), not `1` (number-of-proxies). Reason: the allowlist call ran later in `Application::main`, so it was the effective setting in production already — keeping it preserves observed behavior by definition.
- **Comment placement:** Single `//` line comment directly above the surviving call, exact text per plan Task 1: `// REFACTOR-01: single source of truth for trust-proxy; allowlist form chosen because Traefik fronts the app on loopback in the swarm topology.`
- **Surrounding code left untouched:** Did not remove the unrelated `require('path');` no-op (deferred per CONTEXT.md "Deferred Ideas — package.json audit"). Did not reformat any other lines. Did not collapse other adjacent whitespace beyond the single blank line that previously preceded the deleted call.

## Deviations from Plan

### 1. [Environment limitation, not auto-fix] Task 2 Jasmine spec gate could not run locally

- **Found during:** Task 2 (Run Jasmine session/auth/reset specs to confirm zero behavioral regression).
- **Issue:** `npm test` aborted immediately with `Error: Config not found in /mnt/data/conf/config.json in environment undefined` (`lib/thinx/globals.js:18`). The THiNX Jasmine harness requires the deployed config layout at `/mnt/data/conf/config.json` plus the full backend stack (CouchDB, Redis, MQTT) that the swarm dev VM and CircleCI provide but this executor clone does not. The test script's trailing `|| true` masks the underlying Jasmine non-start to a wrapper exit-0, so the literal `grep "fail" | wc -l == 0` gate in the plan trivially evaluates to 0 (no fail-lines because no spec lines at all).
- **Disposition:** ACCEPT and document. The change is a pure deletion of one Express `app.set()` line that — per the plan's threat model (T-05-02 disposition `accept`) and the CONTEXT.md decision rationale — was being overwritten by the surviving call on every startup. Pre-state and post-state behavior are identical by construction. The REQUIREMENTS.md validation criterion (c) for REFACTOR-01 ("production smoke: login + device API call from a known-IP browser still resolves the correct `req.ip`") is operator-side, post-merge, against the deployed swarm — that gate is the canonical regression check for this refactor and is unaffected by the local-environment Jasmine non-start.
- **Resolution:** None required at executor time. Re-asserted post-test that `grep -n "trust proxy" thinx-core.js` still returns exactly one match (the allowlist form) and `node --check thinx-core.js` still exits 0 — confirming the file state did not drift during the failed test attempt. The operator can re-run the named specs on the swarm dev VM (`npm run dev` with `.env` sourced) or rely on the post-deploy production smoke when this commit lands via the staging → master → autoredeploy pipeline.
- **Files modified:** None (verification-only task).
- **Committed in:** N/A.

---

**Total deviations:** 1 environment-limitation deviation (no auto-fixes triggered; no Rule 1/2/3/4 conditions encountered).
**Impact on plan:** None. The Jasmine gate was supplementary regression coverage on top of the construct-level proof that pre/post behavior is identical. The operator-side production smoke remains the canonical validation per REQUIREMENTS.md REFACTOR-01.(c).

## Issues Encountered

- **Bash tool output truncation during parallel verification:** The Read tool's view of `/tmp/phase5-01-verify.log` showed only the first two lines of a multi-command compound. Resolved by running each verification (`grep -n`, `node --check`, etc.) as its own bash call rather than one chained compound. Did not affect the code change; only mildly affected verification ergonomics.

## User Setup Required

None — no external service configuration changed. The single canonical trust-proxy setting matches the swarm-deployed reverse-proxy topology (Traefik on loopback) which is already in place.

## Threat Flags

None — this plan does NOT introduce new security surface. Per the plan's threat model:

- T-05-01 (Spoofing on trust-proxy boundary): disposition `mitigate` — the post-state IS the surviving allowlist form, which is narrower than the deleted number-of-proxies form. Net effect: the deletion REMOVES the more-permissive number-of-proxies call that was being overwritten anyway. No widening.
- T-05-02 (Repudiation via IP attribution drift): disposition `accept` — behavioral parity is preserved by construction.
- T-05-03 (Tampering on source): disposition `accept` — single-line deletion + single-line comment add; `node --check` clean.

## Known Stubs

None. No placeholder/empty/TODO patterns introduced. The comment line is a documentation marker, not a stub.

## Next Phase Readiness

- **Wave 1 Plan 05-02 (REFACTOR-02, owner.js:492 strict equality) ready:** No dependency on this plan's changes — `lib/thinx/owner.js` and `thinx-core.js` are independent.
- **Wave 1 Plan 05-03 (REFACTOR-05, jshint reclassification) ready:** Independent of this plan.
- **Wave 2 (phase doc-update) will roll up:** No additional thinx-core.js work needed in Phase 5 after this commit.
- **Pre-existing unstaged change (`.planning/STATE.md`):** Orchestrator's pre-execution status update from before this plan's execution started — left unstaged per the plan's explicit "stage ONLY thinx-core.js" rule. It will be picked up by the phase wrap-up state-update step (or by `state.update-progress` / SUMMARY-commit work after this plan's executor returns).

## Self-Check: PASSED

- File `thinx-core.js` present and modified — confirmed via `git log -1 --stat` (1 file changed).
- Commit `6ab471d3944f85397f4e6b3587e17e74a904b611` present in git log — confirmed via `git rev-parse HEAD`.
- GPG signature verified `Good signature from "Matej Sychra <suculent@me.com>"` — confirmed via `git log -1 --show-signature`.
- `grep -c "trust proxy" thinx-core.js` returns `1` — confirmed.
- The single match RHS is `['loopback', '127.0.0.1']` (allowlist form) at line 421 — confirmed.
- REFACTOR-01 rationale comment at line 420 (immediately above the surviving call, exact text per plan) — confirmed.
- `node --check thinx-core.js` exits 0 — confirmed twice (post-edit and post-test).

---
*Phase: 05-backend-hygiene-cheap-sweeps*
*Plan: 01 — REFACTOR-01*
*Completed: 2026-06-02*
