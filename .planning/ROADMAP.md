# Roadmap: THiNX Device API — v1.9 Backend Hygiene & Posture

**Created:** 2026-06-02
**Milestone:** v1.9 — Backend Hygiene & Posture
**Mode:** continuation (v1.0 ended at Phase 4; v1.9 begins at Phase 5)
**Granularity:** coarse
**Phases:** 7 (Phases 5–11)
**Requirement Coverage:** 13/13 ✓

## Project Reference

- **Core Value:** Pay down the v1.x backlog the v1.0 GA explicitly deferred — clean up structural hygiene, lift the security posture, and close auth/account lifecycle gaps — without breaking any legacy-console-compatible route the Vue console inherited.
- **Project context:** `.planning/PROJECT.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Milestones index:** `.planning/MILESTONES.md`
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace
- **Previous milestone:** `.planning/milestones/v1.0-ROADMAP.md` (last phase = Phase 4)

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- 🚧 **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (in planning)

## Phases

- [x] **Phase 5: Backend Hygiene — Cheap Sweeps** ✅ — Low-risk, isolated cleanups across `thinx-core.js`, `owner.js`, and `package.json` (trust-proxy dedup, strict equality, devDep reclassification). Verified 2026-06-02 (REFACTOR-05 scope-amended: jshint moved to devDeps; fs-finder deferred to v1.10).
- [x] **Phase 6: WebSocket Surface Hardening** ✅ — Tighten the WS lifecycle and handshake surface (close handlers, handshake reproducibility, session-cookie httpOnly re-evaluation). Verified 2026-06-02 (SEC-WS-01 root cause REPRODUCED as edge-nginx routing gap → operator-side runbook; SEC-COOKIE-01 httpOnly:true with <5min rollback path).
- [ ] **Phase 7: owner.js Async/Await Sweep** — Convert ~73 callback patterns in `lib/thinx/owner.js` to async/await with zero observable behavior change.
- [ ] **Phase 8: Auth & Account Lifecycle Closures** — Soft-deleted reactivation flow + reset-email lands on the Vue console (not legacy AngularJS).
- [ ] **Phase 9: Historic PII Redaction (managed_logs)** — Remediate pre-v1.0 raw reset_keys in CouchDB `managed_logs` (~658k docs, GDPR-adjacent).
- [ ] **Phase 10: Cross-Project Dependency Coordination (services/console)** — Schedule + roll up the parallel SEC-DEP-02 phase in the console submodule; land a clean submodule pointer bump.
- [ ] **Phase 11: Build & Cert Hygiene** — `base/update.sh` hardening + startup `ca.pem` freshness probe.

## Phase Details

### Phase 5: Backend Hygiene — Cheap Sweeps
**Goal:** Land low-blast-radius hygiene fixes that clean up structural debt without touching observable behavior on any public route.
**Depends on:** Nothing (parallel-safe with all other v1.9 phases)
**Requirements:** REFACTOR-01, REFACTOR-02, REFACTOR-05
**Success Criteria** (what must be TRUE):
  1. `grep -n "trust proxy" thinx-core.js` returns exactly one canonical call, and existing Jasmine session/auth specs remain green.
  2. `grep -nE '!=|==' lib/thinx/owner.js` shows zero non-strict comparisons inside `password_reset` (and the reset_key flow stays identical for all currently-valid inputs).
  3. `jshint` is declared in `devDependencies` (scope-amended 2026-06-02: `fs-finder` stays in `dependencies` because of 5 active runtime call sites in `lib/`; full removal deferred to v1.10 — see REQUIREMENTS.md REFACTOR-05 annotation and STATE.md decisions). The production Docker image still builds + reaches the `Server up at` log line, and no `require('jshint')` remains in `lib/` or `thinx-core.js`.
  4. CircleCI green on the merge to `thinx-staging`; Swarmpit autoredeploy completes within the 5-minute SLA.
**Plans:** 4 plans (3 Wave 1 parallel + 1 Wave 2 doc-update)
  - [ ] 05-01-PLAN.md — REFACTOR-01: trust-proxy dedup in `thinx-core.js` (delete `:300`, keep `:422` allowlist form)
  - [ ] 05-02-PLAN.md — REFACTOR-02: strict equality in `Owner.password_reset` (`!=` → `!==` at `lib/thinx/owner.js:492`) + new unit covering string/number coercion case
  - [ ] 05-03-PLAN.md — REFACTOR-05 (scope-amended): move `jshint` to `devDependencies` (fs-finder stays — deferred to v1.10); includes blocking-human Docker smoke checkpoint
  - [ ] 05-04-PLAN.md — Wave 2 doc-update: record REFACTOR-05 scope amendment in ROADMAP.md, REQUIREMENTS.md, STATE.md (so phase-closeout verifier doesn't reject criterion 3 on literal-text grounds)

### Phase 6: WebSocket Surface Hardening
**Goal:** Make the WebSocket lifecycle deterministic and the handshake surface defensible — close the resource-cleanup gap, document or fix the rtm handshake risk, and resolve the `httpOnly: false` session-cookie debt left over from a stale debugging note.
**Depends on:** Phase 5 (sequenced after — REFACTOR-01's trust-proxy work is adjacent to the same `thinx-core.js` block; Phase 5 landed at commit `b0aef15b`)
**Requirements:** REFACTOR-03, SEC-WS-01, SEC-COOKIE-01
**Success Criteria** (what must be TRUE):
  1. A `socket.on('close')` handler runs for both client-initiated close and server-shutdown paths in the WS lifecycle at `thinx-core.js:459-501` (post-Phase-5 line numbers), asserted by a new spec that counts/verifies per-connection cleanup.
  2. `wscat` handshake from a fresh Vue session against `rtm.thinx.cloud` returns `101 Switching Protocols`; if not code-fixable from this repo, a runbook documents the upstream-Traefik condition with reproduction steps. **(CONTEXT.md confirms NOT code-fixable from this repo — Plan 06-03 produces the runbook with the 7-row reproduction evidence and the operator-side nginx fix.)**
  3. Session cookie `x-thx-core` either ships with `httpOnly: true` (preferred) and the Vue console login + WebSocket subscribe still round-trip cleanly, OR a dated note + ticket explains why it must stay `false`. **(CONTEXT.md decision: flip to `httpOnly: true` with a < 5min documented rollback path in the runbook.)**
  4. A regression spec covers the chosen cookie-attribute decision (presence/absence of `httpOnly` flag on the Set-Cookie header).
  5. No regression in existing MQTT/WebSocket round-trip specs (CI-side Jasmine is the canonical green-gate; local `npm test` ACCEPT pattern per Phase 5).
**Plans:** 3 plans (Wave 1: 06-01 + 06-03 parallel-safe; Wave 2: 06-02 depends on both)
  - [ ] 06-01-PLAN.md — REFACTOR-03: raw-socket close handler in WS upgrade flow at `thinx-core.js:~486` + new spec `ZZ-WebSocketLifecycleSpec.js` asserting cleanup on aborted mid-flight upgrade
  - [ ] 06-02-PLAN.md — SEC-COOKIE-01: flip `thinx-core.js:316` to `httpOnly: true` + remove stale debug comment + new spec `ZZ-CookieAttributeSpec.js` + APPEND rollback procedure to the runbook
  - [ ] 06-03-PLAN.md — SEC-WS-01: CREATE `.planning/runbooks/websocket-handshake.md` with the 7-row reproduction table from CONTEXT.md, operator-side `nginx -T` + `location` block action, `deferred to edge-redesign` tag, and post-fix verification recipe (NO code change for this requirement)

### Phase 7: owner.js Async/Await Sweep
**Goal:** Convert the ~73 callback patterns in `lib/thinx/owner.js` to async/await, preserving every public method signature and observable behavior the legacy-console-compatible routes depend on.
**Depends on:** Phase 5 (REFACTOR-02 lands the strict-equality fix on the same module first, so this sweep operates on already-cleaned code)
**Requirements:** REFACTOR-04
**Success Criteria** (what must be TRUE):
  1. Full Jasmine `ZZ-*` suite green; zero behavioral changes detectable from any caller in `router.user.js`, `router.profile.js`, or other public routers.
  2. `node --check lib/thinx/owner.js` clean; lint passes; no callback-style chain remains in the touched code paths.
  3. Top-5 highest-fanout methods (`create`, `delete`, `update`, `password_reset`, `password_set`) pass a call-graph spot-check — they still resolve identical values / surface identical errors to their callers.
  4. Production Docker image builds, deploys, and serves a Vue-console login round-trip on rtm with no signature break.
**Plans:** TBD

### Phase 8: Auth & Account Lifecycle Closures
**Goal:** Close the two account-lifecycle gaps the v1.0 UAT surfaced — give soft-deleted users a recovery path and land password-reset emails on the Vue console instead of the deprecated AngularJS one.
**Depends on:** Phase 7 (lands on top of the async/await-cleaned `owner.js`)
**Requirements:** AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE
**Success Criteria** (what must be TRUE):
  1. A soft-deleted user (`user.deleted = true`) can be reactivated via the chosen path (admin endpoint OR self-serve token), and the next login succeeds without direct CouchDB mutation.
  2. The reactivation route enforces the correct auth gate (admin role OR signed reactivation token), covered by a regression spec.
  3. A freshly generated password-reset email links to the Vue console reset-password page (not legacy `/static/`), and the reset_key → set-password round-trip completes end-to-end through Vue.
  4. The lockout at `lib/router.auth.js:189-191` still blocks genuinely-deleted accounts (reactivation does not weaken the soft-delete gate).
  5. No signature break on any other public route the legacy AngularJS console relied on.
**Plans:** TBD

### Phase 9: Historic PII Redaction (managed_logs)
**Goal:** Remediate the ~658k pre-Phase-2 CouchDB `managed_logs` documents that still carry raw reset_keys (and other PII), closing the GDPR-adjacent residue SEC-PII-01 prevented from continuing but did not retroactively clean.
**Depends on:** Nothing functionally (parallel-safe with Phases 5–8 and 10–11)
**Requirements:** SEC-PII-02
**Success Criteria** (what must be TRUE):
  1. A documented remediation strategy (one-shot `_bulk_docs` overlay, age-based delete, or forward-going TTL) is chosen with a written rationale.
  2. Sampling N=1000 random recent + N=1000 random old `managed_logs` docs returns zero raw 64-char hex reset_keys post-remediation.
  3. If a retention/TTL behavior is introduced, it is captured in a runbook under `.planning/runbooks/`.
  4. A GDPR-posture note documenting the historic cleanup (scope, method, sampling evidence, residual risk) is appended to the runbooks set.
  5. The remediation operation is reversible OR the irreversibility is explicitly accepted in the runbook (since redaction is destructive of audit-log content).
**Plans:** TBD

### Phase 10: Cross-Project Dependency Coordination (services/console)
**Goal:** Coordinate the parallel `SEC-DEP-02` phase in the `services/console` GSD project, classify the 2 high-severity console alerts by runtime-vs-build exposure, and land any resulting submodule pointer bump cleanly in `thinx-device-api`.
**Depends on:** Nothing (cross-project coordination work; can run anytime)
**Requirements:** SEC-DEP-02
**Success Criteria** (what must be TRUE):
  1. A parallel `SEC-DEP-02` phase exists in `services/console/.planning/ROADMAP.md` with its own success criteria and verification gates.
  2. The 2 high-severity console Dependabot alerts are classified (runtime vs. build) with the verdict recorded in `.planning/dep-triage.md` (annexed roll-up section).
  3. After the console-side triage merges, the `services/console` submodule pointer in `thinx-device-api` is updated cleanly on `thinx-staging` (and rolled to `master` + `main` via PR if the console triage produces a pointer bump).
  4. CircleCI remains green across the submodule bump; the production image still serves the Vue console without regression.
**Plans:** TBD

### Phase 11: Build & Cert Hygiene
**Goal:** Harden the base-image rebuild script so it stops needing out-of-band manual `git commit` steps, and add a startup probe that flags ca.pem freshness drift before it turns into a 2026-05-31-style SSL incident.
**Depends on:** Nothing (parallel-safe)
**Requirements:** BASE-IMG-01, THINX-CERT-CHECK-01
**Success Criteria** (what must be TRUE):
  1. Running `base/update.sh` end-to-end on a clean clone produces an image plus a single `chore: base version bump` commit (or surfaces a documented failure with `set -euo pipefail` semantics) — no manual `git commit` step required.
  2. `base/update.sh` accepts an optional `--tag <tag>` argument that pins a specific base image tag (beyond the default `alpine`), and the pre/post image digest is logged clearly.
  3. `shellcheck base/update.sh` is clean.
  4. Server startup with a fresh Let's Encrypt leaf and a stale (R10-era) `ca.pem` emits a clear startup WARN naming the issuer mismatch; startup with a matching intermediate emits no warning.
  5. A unit test covers the matcher logic against fixture PEM bundles (R10 leaf vs. R13 ca, R13 leaf vs. R13 ca, R13 leaf vs. R10 ca).
**Plans:** TBD

## Phase Summary

| Phase | Name | Goal | Requirements | Criteria |
|-------|------|------|--------------|----------|
| 5 | Backend Hygiene — Cheap Sweeps | Low-risk structural cleanups | REFACTOR-01, REFACTOR-02, REFACTOR-05 | 4 |
| 6 | WebSocket Surface Hardening | Deterministic WS lifecycle + handshake + cookie debt | REFACTOR-03, SEC-WS-01, SEC-COOKIE-01 | 5 |
| 7 | owner.js Async/Await Sweep | Callback → async/await with zero behavior change | REFACTOR-04 | 4 |
| 8 | Auth & Account Lifecycle Closures | Reactivation + reset-email → Vue console | AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE | 5 |
| 9 | Historic PII Redaction (managed_logs) | Clean ~658k pre-fix audit-log docs | SEC-PII-02 | 5 |
| 10 | Cross-Project Dependency Coordination | Console-side SEC-DEP-02 schedule + roll-up | SEC-DEP-02 | 4 |
| 11 | Build & Cert Hygiene | `base/update.sh` hardening + ca.pem startup probe | BASE-IMG-01, THINX-CERT-CHECK-01 | 5 |

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| REFACTOR-01 | Phase 5 | Pending |
| REFACTOR-02 | Phase 5 | Pending |
| REFACTOR-05 | Phase 5 | Pending |
| REFACTOR-03 | Phase 6 | Pending |
| SEC-WS-01 | Phase 6 | Pending |
| SEC-COOKIE-01 | Phase 6 | Pending |
| REFACTOR-04 | Phase 7 | Pending |
| AUTH-REACTIVATE-01 | Phase 8 | Pending |
| AUTH-RESET-LINK-CONSOLE | Phase 8 | Pending |
| SEC-PII-02 | Phase 9 | Pending |
| SEC-DEP-02 | Phase 10 | Pending |
| BASE-IMG-01 | Phase 11 | Pending |
| THINX-CERT-CHECK-01 | Phase 11 | Pending |

**Coverage:** 13/13 v1.9 requirements mapped ✓
**Orphans:** none
**Duplicates:** none

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 5. Backend Hygiene — Cheap Sweeps | v1.9 | 0/4 | Planned | — |
| 6. WebSocket Surface Hardening | v1.9 | 0/3 | Planned | — |
| 7. owner.js Async/Await Sweep | v1.9 | 0/? | Not started | — |
| 8. Auth & Account Lifecycle Closures | v1.9 | 0/? | Not started | — |
| 9. Historic PII Redaction (managed_logs) | v1.9 | 0/? | Not started | — |
| 10. Cross-Project Dependency Coordination | v1.9 | 0/? | Not started | — |
| 11. Build & Cert Hygiene | v1.9 | 0/? | Not started | — |

## Dependencies (visual)

```
Phase 5 (cheap sweeps) ──► Phase 6 (WS surface)
        │
        └──► Phase 7 (owner.js async/await) ──► Phase 8 (auth lifecycle)

Phase 9  (managed_logs PII)            ─── parallel-safe with 5/6/7/8/10/11
Phase 10 (services/console SEC-DEP-02) ─── parallel-safe with 5/6/7/8/9/11
Phase 11 (base/update.sh + cert probe) ─── parallel-safe with 5/6/7/8/9/10
```

Phase 5 sequences before 6 (REFACTOR-01 trust-proxy is adjacent to the WS block in `thinx-core.js`) and before 7 (REFACTOR-02 strict-equality lands the small `owner.js` cleanup before the large sweep). Phase 8 sequences after 7 (lands on the async/await-cleaned `owner.js`). Phases 9, 10, 11 are functionally independent and execute in any order.

## Cross-Project References

- **Console submodule (sibling GSD project):** `services/console/.planning/`
  - SEC-DEP-02 console-side phase to be scheduled in Phase 10 of this milestone
  - `AUTH-RESET-LINK-CONSOLE` requires coordination with the console's password-set route
- **AGENTS.md** (parent root) — ops/deploy reference + dependency lock rationale
  - `chai-http v4` lock: TEST-CHAI-01 deferred from v1.9 per AGENTS.md:82-92
- **`.planning/runbooks/`** — canonical operational runbooks; Phase 9 will extend with GDPR-posture note; Phase 6 extends with `websocket-handshake.md` (Plan 06-03 creates it; Plan 06-02 appends a SEC-COOKIE-01 rollback section)

## Notes

- **Compatibility constraint:** Every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks. Every phase's verification must include this guardrail.
- **GPG-sign default:** All v1.9 commits are GPG-signed unless an explicit per-session unsigned authorization is granted.
- **Phase numbering:** v1.9 continues from v1.0's last phase (Phase 4). Integer phases 5–11 represent v1.9 work; any urgent insertions during execution use decimal phases (e.g., 5.1, 7.2).
- **Deferred from v1.9 scope:** OPS-02, OPS-03 (pure swarm-side OPS), TEST-CHAI-01 (chai-http v5 lock), CONSOLE-LEGACY-JSON-PARSE (sibling-project scope). See `.planning/REQUIREMENTS.md` § "Future Requirements".
- **Phase 5 scope amendment (2026-06-02):** REFACTOR-05 reduced to `jshint`-only reclassification; `fs-finder` removal sweep deferred to a proposed v1.10 phase (see STATE.md decisions + REQUIREMENTS.md REFACTOR-05 annotation). Plan 05-04 (Wave 2) records the amendment across ROADMAP.md, REQUIREMENTS.md, and STATE.md so the phase-closeout verifier sees a consistent story.
- **Phase 6 plan-set (2026-06-02):** 3 atomic plans, one per requirement. Plan 06-01 (REFACTOR-03) and Plan 06-03 (SEC-WS-01) are Wave 1 parallel-safe (no file overlap — 06-01 touches `thinx-core.js` + a new spec, 06-03 touches only `.planning/runbooks/websocket-handshake.md`). Plan 06-02 (SEC-COOKIE-01) is Wave 2 — depends on both 06-01 (also touches `thinx-core.js`, at a different line) and 06-03 (also touches the runbook, appending vs creating). Each plan lands one atomic GPG-signed commit. The SEC-WS-01 fix lives on the swarm host (operator-side nginx config) and is OUT OF this repo — Plan 06-03 produces only the runbook.

---
*Roadmap created: 2026-06-02 — v1.9 Backend Hygiene & Posture milestone planning. 7 phases (5–11) covering 13 requirements. Granularity: coarse (let natural delivery boundaries stand; risk-clustered work surfaced 7 phases rather than artificially compressing to 5).*
*Phase 5 planned: 2026-06-02 — 4 plans (3 Wave 1 parallel + 1 Wave 2 doc-update); REFACTOR-05 scope reduced to jshint-only per CONTEXT.md.*
*Phase 6 planned: 2026-06-02 — 3 atomic plans (2 Wave 1 parallel + 1 Wave 2); SEC-WS-01 is runbook-only per CONTEXT.md (root cause: rtm edge-nginx routing gap, deferred to edge-redesign).*
