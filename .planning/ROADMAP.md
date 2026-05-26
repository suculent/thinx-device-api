# Roadmap: THiNX Device API — v1 GA Backend Closures

**Created:** 2026-05-26
**Mode:** mvp
**Granularity:** coarse
**Phases:** 4
**Requirement Coverage:** 4/4 ✓

## Project Reference

- **Core Value:** The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability the Vue console depends on must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.
- **Project context:** `.planning/PROJECT.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Pre-investigation (G8/Phase 1):** `.planning/G8-INVESTIGATION.md`
- **Codebase concerns (PII/Phase 2 source list):** `.planning/codebase/CONCERNS.md`
- **Sibling project:** `services/console/.planning/` — v1.0 frontend half (10 phases shipped, Phase 11 v1 GA gap-closures in flight). This roadmap is the backend complement; both land together as v1.0 GA.

## Phases

- [x] **Phase 1: AUTH API — Password Reset** — ✓ **Verified 2026-05-26** (live rtm UAT against image `0a0e6b32`; AUTH-API-01 closed end-to-end)
- [x] **Phase 2: PII Logging Scrub** — ✓ **Verified 2026-05-26** (deployed-container + CI evidence against image `3a461b3d`; SEC-PII-01 closed; 12 sites swept)
- [x] **Phase 3: Swarm Auto-Pull** — ✓ **Verified 2026-05-26** (push-observe SLA test PASS via Rung 1 — `docker service update --force swarmpit_app`; delta=63s; OPS-01 closed; zero source-code commits)
- [ ] **Phase 4: Dependency Triage** — Classify all 29 Dependabot findings (11 high / 17 moderate / 1 low) as v1-blocker or v1.x-deferred, fix the blockers, and merge-up to default branches

## Phase Details

### Phase 1: AUTH API — Password Reset
**Goal:** Restore unauthenticated `POST /api/v2/password/reset` 200 response on rtm so the Vue console "Forgot password?" flow completes end-to-end.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** AUTH-API-01
**Success Criteria** (what must be TRUE):
  1. `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset -H 'Content-Type: application/json' -d '{"email":"x@y"}'` returns HTTP 200 with the standard success body.
  2. The Vue console "Forgot password?" flow on rtm completes the full email → reset_key → set-password round-trip; the new password logs in.
  3. Response is identical (status + body shape) for both a registered email and an unregistered one (no enumeration leak).
  4. A regression spec under `spec/jasmine/ZZ-*` asserts the unauthenticated 2xx path against `POST /api/v2/password/reset` for a non-existent email.
  5. Root cause is documented (Express middleware vs. Traefik label vs. nginx) in the phase close-out, with a reversion plan if the fix touches edge config.
**Plans:** 2 plans (W1: backend fixes, W2: regression spec + deploy + UAT) — ✓ both complete
  - [x] 01-01-PLAN.md — Bearer-null guard in lib/router.js + no-enumeration normalization in lib/router.user.js (+ assertion update in ZZ-AppSessionUserSpec.js) ✓ shipped `622aa01` + `db46790`
  - [x] 01-02-PLAN.md — New regression spec ZZ-RouterPasswordResetSpec.js + push/CI/stack-deploy + rtm curl + Vue UAT + close-out SUMMARY ✓ shipped `3413166` + tightening `c67d9af`; UAT walked 2026-05-26
**Notes:** Root cause was a two-fault interaction: Vue API client sends `Authorization: Bearer null` when logged out (frontend half, unchanged) + backend `lib/router.js:103` matched header presence not validity, JWT-verified the literal `"null"`, stamped 403 at L132 (this phase's class-fix). Tightening required during Wave 2 because the original no-enum fix normalized status but not body — `c67d9af` makes the response body identical for registered vs. unregistered (production path; test env preserves passthrough for the spec round-trip). UAT walk surfaced 5 issues OUT-OF-SCOPE for this phase (preexisting, not regressions); triaged into REQUIREMENTS.md v2/deferred section: AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE, CONSOLE-LEGACY-JSON-PARSE. See `phases/01-auth-api-password-reset/01-SUMMARY.md` for full root cause + reversion plan + matrix.

### Phase 2: PII Logging Scrub
**Goal:** Eliminate raw PII and credential material from `lib/thinx/owner.js` error logs, so production log aggregation no longer indexes user emails, reset keys, Mailgun tokens, or activation tokens.
**Mode:** mvp
**Depends on:** Phase 1 (sequenced after — Phase 1's regression spec touches the same module's reset path; landing PII scrub afterward avoids merge churn)
**Requirements:** SEC-PII-01
**Success Criteria** (what must be TRUE):
  1. `grep -nE '(email|reset_key|mailgun_token|activation_token)' lib/thinx/owner.js | grep console.log` shows zero remaining raw-value emissions across the 6 known sites (L499, L451, L474, L583, L647, L95, L228).
  2. The replacement pattern is consistent: emails hashed or last-4-chars + length, reset/activation keys as first-4-chars + ellipsis, Mailgun errors as `err.message` + `err.statusCode` only (never the full error object).
  3. At least one Jasmine spec exercises an error path (e.g., reset attempt for unknown email) and asserts the redacted log format — no raw email or token appears in the log line.
  4. Audit-log entries written via `alog.log` (L451, L583) are likewise redacted — the CouchDB audit doc no longer stores plaintext reset keys.
**Plans:** 1 plan (single coarse plan covering helpers + sweep + spec + deploy + close-out) — ✓ complete
  - [x] 02-PLAN.md — Util.redactEmail/redactToken helpers + sweep of all 12 leak sites in lib/thinx/owner.js + new ZZ-OwnerLogRedactionSpec.js + push/CI/restart.sh deploy + rtm log-tail UAT (Probes A–E) + close-out SUMMARY ✓ shipped `0de30806` + `0314c9a0` + `daccf732`; deployed to image `3a461b3d`; Probes A/E PASS by automation, B/D SKIP-acceptable per operator, C PASS by container-code evidence
**Notes:** 12 sites swept (7 from CONCERNS + 5 surfaced during planning + opportunistic 13th `body` envelope fix at L510 surfaced during execution). Critical guardrail preserved: L165-167 test-env passthrough log redacted while callback value stays raw (chai-http round-trip spec at ZZ-AppSessionUserSpec.js:191-198 chain intact). Verification finding: historic CouchDB `managed_logs` entries (~658k docs) still contain raw reset_keys from before today's deploy — separate concern filed as `SEC-PII-02` v1.x/v2 deferred. Deploy path: `./restart.sh` on swarm host per memory `swarm-deploy-script-name`.

### Phase 3: Swarm Auto-Pull
**Goal:** Restore swarm-side auto-redeploy on `188.166.23.244` so that a parent-monorepo push triggering a registry image build results in a rolling task update without operator intervention.
**Mode:** mvp
**Depends on:** Nothing functionally (parallel-safe with Phase 1/2/4), but sequenced third because (a) it gates the cleanliness of declaring v1 "shipped", (b) Phases 1/2 produce code that will exercise the deploy pipeline as a side-effect.
**Requirements:** OPS-01
**Success Criteria** (what must be TRUE):
  1. Root cause is documented (Swarmpit watcher, registry webhook, expired registry credentials, manifest mismatch, etc.) in `.planning/phase-3/` with the diagnostic trace that pinned it.
  2. A controlled push-and-observe verification on rtm: pushing an updated image tag results in the swarm task transitioning to the new image within 5 minutes, without invoking `./scripts/stack-deploy`.
  3. A reversion plan is documented in the phase close-out: if the fix introduces regression, what to revert (config file, env var, label change, Swarmpit version) and how.
  4. The manual `./scripts/stack-deploy` workaround remains functional as a fallback (do not break the escape hatch).
**Plans:** 1 plan (single coarse rung-by-rung plan; Rung 1 autonomous, Rungs 2-4 checkpoint-gated) — ✓ complete via Rung 1
  - [x] 03-PLAN.md — SSH-driven Rung 1 (force-restart swarmpit_app) PASSED on first attempt; push-and-observe SLA test PASS (delta=63s, 237s under target); 03-SUMMARY.md filed with root cause + reversion plan + AGENTS.md runbook line ✓ Verified 2026-05-26. Rungs 2-4 NOT exercised; remain locked behind checkpoint:human-verify gates for any future recurrence.
**Notes:** Incident date 2026-05-25 14:44 CET. `docker-swarm.yml` already carries `swarmpit.service.deployment.autoredeploy=true` labels — the failure is downstream of config. Pre-investigation (2026-05-26 ~17:00 UTC) identified `swarmpit_app` as DEGRADED (Bad Gateway via Traefik + zero application logs for 2+ hours + zero autoredeploy log lines for 30 hours), narrowing the diagnostic ladder from "5+ suspects" to a concrete 4-rung escalation. Live findings + locked rung order documented in `phases/03-swarm-auto-pull/03-CONTEXT.md`. Recon steps in `.planning/codebase/CONCERNS.md` ("Operations Concerns") are now superseded by the CONTEXT live findings. Cross-ref: console `v1.x-backlog.md` OPS-swarmpull entry. Phase shape note: this is an OPERATIONAL phase — primary deliverable is a documented root cause + reversion plan + runbook line, NOT a source-code diff in this monorepo (Rung 1 outcome expected to produce zero code commits).

### Phase 4: Dependency Triage
**Goal:** Classify all 28 GitHub Dependabot findings against `suculent/thinx-device-api` (11 high + 17 moderate) as either v1-blocker (fixed before v1 GA) or v1.x-deferred (with documented rationale and a future trigger condition), and ship the blocker fixes.
**Mode:** mvp
**Depends on:** Phase 2 (sequenced after — SEC-PII-01 work touches `lib/thinx/owner.js` which may overlap with Mailgun/email-related transitive deps; landing PII scrub first removes a moving target for the audit pass).
**Requirements:** SEC-DEP-01
**Success Criteria** (what must be TRUE):
  1. `.planning/dep-triage.md` exists as a table of all 28 findings with columns: package, severity, direct/transitive, verdict (blocker / deferred), rationale, future trigger (for deferred items).
  2. Every "blocker" verdict in the table has a corresponding fix landed (`package.json` direct bump, `overrides` block pin, or code-level mitigation) — and the resulting GitHub Security tab high-severity count drops to the documented "deferred-with-rationale" baseline (zero unaddressed high-severity advisories).
  3. The `chai-http` v4 lock and any other AGENTS.md-documented dependency locks are respected — no upgrade attempted in this phase for items in the lock list, and any locked item that appears in the Dependabot list is explicitly tagged "v1.x-deferred — locked per AGENTS.md".
  4. The `npm audit` post-fix output is captured in `.planning/dep-triage.md` as the new baseline; future Dependabot alerts have a documented starting point to diff against.
**Plans:** 1/4 plans executed

  Plans:
  - [x] 04-01-baseline-and-triage-table-PLAN.md — pre-fix audit baselines (full tree + runtime tree + Dependabot snapshot) + populated triage table at .planning/dep-triage.md (29 alerts classified per research preclassification)
  - [ ] 04-02-blocker-fixes-PLAN.md — 4 surgical override edits in package.json (-follow-redirects, lodash 4.17.23->4.18.1, minimatch 5.1.0->5.1.9, +ws 8.20.1); single npm install regenerates lockfile; npm test green; push to thinx-staging; CI green; Swarmpit autoredeploy; Phase 1 contract preserved
  - [ ] 04-03-post-fix-baseline-and-closeout-PLAN.md — post-fix audit baselines + dep-triage Section 3 populated + REFACTOR-05 + SEC-DEP-02 filed as v1.x backlog + STATE/ROADMAP/REQUIREMENTS updates + 04-SUMMARY.md close-out
  - [ ] 04-04-merge-up-to-default-branches-PLAN.md — open PRs thinx-staging->master + thinx-staging->main on parent suculent/thinx-device-api (so cloud scanners see the fix on default branches); gated services/console PR if non-empty diff; operator approves + merges via GitHub UI; flip SEC-DEP-01 + Phase 4 to Verified
**Notes:** Surfaced 2026-05-26 via GitHub Security tab. The `package.json` `overrides` block (L97-136 — 38 pins) is the expected fix vector for transitive CVEs. First action: `gh api repos/suculent/thinx-device-api/dependabot/alerts` to enumerate. Cross-ref: `.planning/codebase/CONCERNS.md` "Security Considerations".

## Phase Summary

| Phase | Name | Goal | Requirements | Criteria |
|-------|------|------|--------------|----------|
| 1 | AUTH API — Password Reset | Restore unauth `POST /api/v2/password/reset` 200 on rtm | AUTH-API-01 | 5 |
| 2 | PII Logging Scrub | Redact PII/secrets in `lib/thinx/owner.js` logs | SEC-PII-01 | 4 |
| 3 | Swarm Auto-Pull | Restore swarm-side auto-redeploy | OPS-01 | 4 |
| 4 | Dependency Triage | 1/4 | In Progress|  |

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-API-01 | Phase 1 | Verified |
| SEC-PII-01 | Phase 2 | Verified |
| OPS-01 | Phase 3 | Verified |
| SEC-DEP-01 | Phase 4 | Pending |

**Coverage:** 4/4 v1 requirements mapped ✓
**Orphans:** none
**Duplicates:** none

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. AUTH API — Password Reset | 2/2 | Verified | 2026-05-26 |
| 2. PII Logging Scrub | 1/1 | Verified | 2026-05-26 |
| 3. Swarm Auto-Pull | 1/1 | Verified | 2026-05-26 |
| 4. Dependency Triage | 0/0 | Not started | - |

## Dependencies (visual)

```
Phase 1 (AUTH-API-01) ──► Phase 2 (SEC-PII-01) ──► Phase 4 (SEC-DEP-01)
                                                       ▲
Phase 3 (OPS-01) ──────────────────────────────────────┘ (parallel-safe; sequenced for tidiness)
```

Phase 3 is functionally independent of 1, 2, 4 and could execute in parallel with any of them under `parallelization=true`. Sequenced third in this roadmap for human-readability and to keep "shipping" verification (which Phase 3 enables) close to the end.

## Cross-Project References

- **Console submodule (sibling GSD project):** `services/console/.planning/`
  - 10 phases shipped (v1.0 frontend)
  - Phase 11 in flight: Wave 1 = G8 (this project's Phase 1), Wave 2 = G9 (console-side, shipped 2026-05-26)
  - `services/console/.planning/v1.x-backlog.md` tracks the OPS-swarmpull (this project's Phase 3) cross-ref
- **AGENTS.md** (parent root) — ops/deploy reference + dependency lock rationale; kept as the live ops doc alongside this GSD project

---
*Roadmap created: 2026-05-26*
*Last updated: 2026-05-26 — Phase 3 (Swarm Auto-Pull) ✓ Verified via Rung 1 (force-restart swarmpit_app); push-observe SLA test PASS (delta=63s); OPS-01 closed; OPS-02 (stale node) + OPS-03 (malformed image tags) filed as v1.x deferred*
