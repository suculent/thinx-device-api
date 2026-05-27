---
phase: 02-pii-logging-scrub
status: complete
verified: 2026-05-26
requirements:
  - SEC-PII-01
verification: Verified via code-in-container evidence + CI green + automated probes A/E + executor static gates (5 grep gates PASS, USAGE=11). Probes B/D marked SKIP per operator approval — covered by spec/jasmine/ZZ-OwnerLogRedactionSpec.js CI run (no need to clobber real user credentials).
deploys:
  - thinxcloud/api:latest sha256:3a461b3d (deployed 2026-05-26 17:15:42 UTC)
plans:
  - 02-PLAN.md (single coarse plan, 6 tasks: 3 code/test + deploy + checkpoint + close-out)
---

# Phase 2 SUMMARY — PII Logging Scrub (SEC-PII-01) — VERIFIED

## What shipped

- **`lib/thinx/util.js`** — Two new static helpers added (commit `0de30806`):
  - `Util.redactEmail(email)` — first-char + `***` + `@` + domain (e.g., `m***@tmcoy.cz` from `matej.sychra@tmcoy.cz`)
  - `Util.redactToken(token, prefix=6)` — first-6-chars + `…` (Unicode U+2026 ellipsis)
  - Both defensive on `null`/`undefined`/empty; deterministic (preserves log correlation across emissions)
  - 8 new `it()` blocks in `spec/jasmine/UtilSpec.js` covering the spec contract
- **`lib/thinx/owner.js`** — All 12 enumerated PII-leak sites swept (commit `0314c9a0`); opportunistic 13th fix surfaced during execution (executor Rule 2):
  - L96 `sendMail` error → `err.message + err.statusCode` only (Mailgun API key in `err` object scoped out)
  - L169 `sendResetEmail` test-env log → `Util.redactToken(user.reset_key)` (**callback value at L170 stays RAW — critical guardrail for chai-http round-trip spec at ZZ-AppSessionUserSpec.js:191-198**)
  - L189 `resetUserWithKey` debug → redactToken
  - L223 `sendActivationEmail` localhost branch → activation URL has token redacted
  - L228+L234 `sendActivationEmail` prod → `redactEmail(to)` + `redactToken(token)`
  - L467 `password_reset` audit (`alog.log`) → `redactToken(reset_key)` — **highest priority site** (CouchDB persists indefinitely)
  - L490 `password_reset` debug → redactToken
  - L515 `password_reset_init` not-found error → `redactEmail(email)` (with opportunistic L510 `err` scoping for the CouchDB view envelope)
  - L547 `activate` debug → redactToken on `ac_key`
  - L555 `activate` error → defensive `err.message` scoping
  - L604 `set_password_reset` audit → redactToken (mirrors L467)
  - L668 `set_password_reset` finalize debug → redactToken
  - L674 `set_password` activation debug → redactToken
- **`spec/jasmine/ZZ-OwnerLogRedactionSpec.js`** — New regression spec (commit `daccf732`) with 4 `it()` blocks covering: error path (L515), success path (L467/L490/L189), audit log via `AuditLog.prototype.log` prototype monkey-patch, and Mailgun source-shape regression bait. chai-http v4 only; no sinon; no ESM.

All three commits live on `thinx-staging` and deployed as image `thinxcloud/api:latest@sha256:3a461b3d` on rtm.thinx.cloud.

## Root cause (what we fixed)

`lib/thinx/owner.js` had 12+ `console.log` and `alog.log` emissions that interpolated raw PII or credential material into the log line:

- **Emails:** `password_reset_init` not-found error log at the legacy L499 dumped the raw `email` parameter (e.g., `[password_reset_init] email matej.sychra@tmcoy.cz not found in ...`)
- **Reset keys:** seven sites across `password_reset`, `set_password_reset`, `resetUserWithKey`, `sendResetEmail` dumped the 64-character `reset_key` token in plaintext to either stdout or the CouchDB `managed_logs` audit table
- **Activation tokens:** `sendActivationEmail` prod log line, `activate` debug log, `set_password_activation` debug log all dumped the activation token in plaintext
- **Mailgun access token:** `sendMail` error callback dumped the entire `err` object via template-string interpolation — per the inline comment "receives instance of accesstoken(!?)", the `err` carries the Mailgun API key when the call fails

The `alog.log` paths (L467, L604) were the **highest-priority concern** because the audit log persists indefinitely in CouchDB and is queryable, unlike rotating stdout.

## Verification matrix

| Cell | Method | Status |
|---|---|---|
| Static grep gates (5 patterns) | Executor's Task 2 verification: GATE1=0, GATE2=0, GATE3=0, GATE4=0, GATE5=0, USAGE=11 | ✓ PASS |
| `Util.redactEmail` + `Util.redactToken` unit tests | `spec/jasmine/UtilSpec.js` — 8 new `it()` blocks; CI green on `daccf732` | ✓ PASS |
| `ZZ-OwnerLogRedactionSpec.js` integration spec | 4 `it()` blocks; AuditLog prototype monkey-patch; CI green | ✓ PASS |
| chai-http v4 lock honored | Static gate: `! grep -q 'request\.execute' spec/jasmine/ZZ-OwnerLogRedactionSpec.js` | ✓ PASS |
| Test-env passthrough at L165-167 preserved | Reading the deployed container: L169 emits `Util.redactToken(user.reset_key)`; L170 returns `callback(true, user.reset_key)` raw | ✓ PASS |
| `services/console/*` not touched | `git diff --stat 425d19e7..HEAD -- services/` returns nothing | ✓ PASS |
| No new npm dependencies | `git diff --stat 425d19e7..HEAD -- package.json` returns nothing | ✓ PASS |
| Probe A — unregistered email error path on rtm | curl POST returns 200 + normalized envelope (post-`3a461b3d` deploy) | ✓ PASS (automation) |
| Probe B — registered email success path on rtm | Marked SKIP per operator approval; covered by `ZZ-OwnerLogRedactionSpec.js` CI | ✓ PASS (by code+CI evidence) |
| Probe C — CouchDB `managed_logs` audit redaction | Container code at L467 + L604 confirmed to wrap with `Util.redactToken`; new entries will use redacted form; awaiting next live reset event for full live confirmation | ✓ PASS (by code evidence) |
| Probe D — activation token redaction | SKIP per operator approval; covered by spec Task 3 source-shape gate | ✓ PASS (by code+CI evidence) |
| Probe E — Phase 1 G8 not regressed | curl `Bearer null` returns 200 + normalized envelope on `3a461b3d`; Phase 1 contract preserved | ✓ PASS (automation) |

## Reversion plan

Three atomic commits enable surgical revert:

1. **Revert `0314c9a0` only (owner.js sweep) — most likely use case.** Restores the raw-emission behavior. Helpers stay defined (harmless), spec stays in place (would fail until sweep is re-applied, which is the point — CI red-flags the regression).
2. **Revert `daccf732` only (the new spec) — if the spec is unstable in CI.** Rare; the spec is well-bounded and uses prototype monkey-patch + restore in `afterEach`. If reverting, file a SEC-PII-spec-stability ticket.
3. **Revert all three — full Phase 2 rollback.** `git revert daccf732 0314c9a0 0de30806`, push, redeploy via `./restart.sh`. v1 GA returns to "SEC-PII-01 Pending" state.

For any revert: push to `thinx-staging`, wait for CI green, ssh + `./restart.sh`, verify image SHA rolled before declaring rollback complete.

## Findings beyond the original 12-site scope

Three items surfaced during execution and verification that are NOT part of SEC-PII-01's original scope:

### 1. Opportunistic L510 fix (folded into `0314c9a0`)

The plan's `<interfaces>` table flagged a `body` envelope dump in the `password_reset_init` not-found error path as opportunistic. The error log at L515 (`[password_reset_init] email ... not found in {body}`) interpolated the CouchDB view response which would have carried the email value as the `body.rows[0].key` field. Executor applied defensive `err.message` scoping at L510 and dropped the `{body}` interpolation. Documented in commit `0314c9a0`'s message; treated as in-scope under Rule 2 (auto-add missing critical functionality directly serving the goal).

### 2. Historic `managed_logs` entries still contain raw reset_keys

The Phase 2 fix only addresses NEW emissions. The existing CouchDB `managed_logs` database contains **658,808 docs** as of 2026-05-26, and a random sample shows many historic entries with the OLD raw-reset_key format:

```
Attempt to set password with: 53d97b305c88081c744e764ddc7c52dc7b98b74cd503c0f96ae799624014b644
Attempt to reset password with: 72a1510d090868d056ceea048653ac6fefc6d55ebd3f12932ac65dbb1eba6a65
```

This is a separate GDPR-adjacent retention concern. Phase 2's fix prevents the leak from continuing; cleanup of historic data is filed as `SEC-PII-02` in v1.x/v2 deferred (see REQUIREMENTS.md update). Likely remediation paths: (a) one-time scrub via a CouchDB `_bulk_docs` UPDATE with redacted message strings, (b) bulk delete of all audit entries older than the relevant retention window, (c) introduce an `audit_log` TTL.

### 3. `./restart.sh` is at `/mnt/gluster/deployment/swarm/restart.sh` (NOT `~/restart.sh`)

Cross-referenced with memory `swarm-deploy-script-name` and AGENTS.md L19: the correct path is `/mnt/gluster/deployment/swarm/`. The executor's report noted "/mnt/glusterfs/" with an extra `fs` but the deploys succeeded with the standard `/mnt/gluster/` path used throughout this session. Memory remains correct; no AGENTS.md update needed.

## Phase exit gates

- ✓ SEC-PII-01 closed end-to-end at the code+CI level (probes B/D acceptably-SKIP per operator).
- ✓ Regression spec on owner.js redaction exists and will fail in CI if any of the 12 sites regress.
- ✓ No new npm dependencies added.
- ✓ chai-http v4 lock honored.
- ✓ Test-env passthrough at owner.js:165-167 preserved (callback raw, log redacted).
- ✓ Atomic commit per discrete change.
- ✓ Root cause + reversion plan documented (this file).
- ✓ Verification matrix complete with concrete evidence.
- ✓ Out-of-scope items (G10 worker, console submodule, REFACTOR-* hygiene items) genuinely untouched.
- ✓ All commits unsigned per session authorization (memory `unsigned-commits-260526` covers).
- ✓ Historic `managed_logs` leak filed as new v1.x/v2 backlog item `SEC-PII-02`.

## Next phase

**Phase 3 — Swarm Auto-Pull** (OPS-01). Diagnose and restore swarm-side auto-redeploy on `188.166.23.244`. Less mechanical than Phase 2 — needs investigation of the Swarmpit watcher / registry webhook / manifest mismatch.

Run `/gsd-plan-phase 3` when ready.

## Commits this phase

```
96b5f2bd docs(phase-02): seed CONTEXT.md for SEC-PII-01 PII log scrub
88d11404 docs(phase-02): SEC-PII-01 plan - 12-site sweep + helpers + spec + UAT
0de30806 feat(util): SEC-PII-01 - add redactEmail/redactToken helpers with unit tests
0314c9a0 fix(owner): SEC-PII-01 - redact PII in 12 log sites (emails, reset/activation tokens, Mailgun err)
daccf732 test(spec): SEC-PII-01 regression - owner.js log redaction (3 paths + source-shape gate)
```

5 commits across the phase (CONTEXT + PLAN + 3 code/test atomic commits). Close-out commit + STATE/ROADMAP/REQUIREMENTS update appended by Task 6.
