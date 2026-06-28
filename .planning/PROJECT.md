# THiNX Device API

## What This Is

A long-lived Node/Express IoT device API monorepo (`thinx-device-api`) — bootstrap at `thinx-core.js`, 17 API v2 routers under `lib/router.*.js`, MQTT messaging + WebSocket runtime, Redis-backed session + build queue, CouchDB persistence, Docker-based firmware builder. Sibling to the `services/console` submodule (Vue console + legacy AngularJS console under deprecation). Deployed to swarm on `188.166.23.244` via CircleCI image publish + Swarmpit autoredeploy.

The v1.0 GA milestone (shipped 2026-05-27) closed the 4 v1 backend gaps the Vue console depends on. Going forward, the project scope is the broader backend lifecycle: hygiene refactors, v1.x backlog, the inevitable v2 multi-tenant revamp.

## Core Value

The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## Current Milestone: v1.12 Inbox Drawdown — ✅ SHIPPED 2026-06-29

Released as tag `v1.12` (GitHub release) and merged to `master` + `main`. 4/4 requirements across Phases 18–20; issues #541/#353/#392/#418 closed. Archived: `.planning/milestones/v1.12-*`.

**Goal (delivered):** Drain the open GitHub issue inbox by closing three long-standing backend gaps surfaced by `/gsd-inbox` triage — complete GDPR purge, per-user GitHub tokens, and Docker secrets — each landed with tests and verified in CI.

**Target features:**
- **Complete GDPR purge (#353, `priority`):** `DELETE /api/v2/gdpr` removes ALL owner-scoped data across every store (user doc, devices, builds, RSA key files, deploy_path + repo_path trees, Redis keys), via one path-guarded, idempotent orchestrator reused by the scheduled purge path — not just the user document.
- **Per-user GITHUB_ACCESS_TOKEN backend (#392):** authenticated endpoint validates a user's GitHub token against GitHub, stores it on their user doc (never echoed back), auto-creates an RSA key if absent, and pushes the public key to GitHub. (Vue Profile UI deferred to the `services/console` submodule project.)
- **Docker Secrets in Swarm (#418):** shared `readSecret()` helper prefers `/run/secrets/<name>` over `process.env`, adopted for core Redis/CouchDB credentials, with `docker-swarm.yml` declaring + referencing those secrets; `.env` dev boot stays working.

**Already shipped this cycle:** #541 device-transfer email HTML fix (commit `6c04a601`, CI green, issue closed).

## Current State

**Shipped:** v1.11 Backlog Drawdown (2026-06-06) — 4/4 v1.11 requirements satisfied across 3 phases (Phases 15–17). Excised the `fs-finder` fork (9 call sites → native `lib/thinx/finder.js`; dependency dropped), triaged the 5 default-branch Dependabot alerts (3 surgical overrides; runtime tree 0 high/0 moderate; `uuid #194` deferred-dev-only), and confirmed the influx stats fix live in production (OPS-EXEC-03 resolved as a discrepancy branch — already autoredeployed). Audit `tech_debt`. **Follow-on / known issue:** Phases 15/16 are pushed (origin at `30ee8d17`); CircleCI pipelines 5269+5270 fail **deterministically** (not flaky) on `00-AppSpec /api/login (invalid)` → 503 (CouchDB user-view `Owner.validate()` error at `router.auth.js:287`). **Not a v1.11 regression** — v1.11 touched no auth/owner/CouchDB code; it's a CI CouchDB-readiness/infra issue to investigate before deploying 15/16. See `.planning/MILESTONES.md` and `.planning/milestones/v1.11-ROADMAP.md`.

Previously: v1.10 Operational Closures (2026-06-05) — 5/5 requirements across Phases 12–14 (SEC-WS-01 + SEC-PII-02 runbook executions + 3 code helpers). v1.9 Backend Hygiene & Posture (2026-06-04) — 13/13 across Phases 5–11. v1.0 GA Backend Closures (2026-05-27) — 4/4; production image `sha256:4d3fb789`.

**Next milestone:** not yet started. Run `/gsd-new-milestone` to define v1.12 (fresh REQUIREMENTS.md). Standing candidates: push/CI/deploy of v1.11 Phases 15/16 (operator follow-on), the third-deferral keep/drop call on TEST-CHAI-01 / OPS-02 / OPS-03 (now 4× deferred), and `uuid #194` (deferred-dev-only — revisit if nyc/jest-junit bump their uuid pin).

**Codebase posture after v1.9:**
- `lib/thinx/owner.js` is fully async/await (~73 callback patterns swept; 5 behavior-locking specs added) with strict equality throughout and SEC-PII-01 + Phase 5 REFACTOR-02 invariants preserved.
- WebSocket lifecycle is deterministic (raw-socket `close` handler), session cookie is `httpOnly: true` with documented sub-5-min rollback, edge-handshake gap captured in an operator runbook.
- Account lifecycle: admin `POST /api/v2/admin/user/:id/reactivate` exists for soft-deleted users; password-reset emails land on the Vue console (`/password-reset?`).
- Operational guardrails: `base/update.sh` is shellcheck-clean with a single atomic commit per run; startup `ca.pem` freshness probe (DETECT-only, R10..R14) WARNs on issuer-mismatch before a 2026-05-31-style SSL incident reappears.
- Historic PII residue: `scripts/redact-managed-logs.js` + audit-log forward-TTL ship in code; production sweep against ~658k `managed_logs` docs is operator-run per runbook.

**Companion project:** `services/console` submodule shipped its SEC-DEP-02 phase under a new `v1.x Operational Hygiene` milestone; pointer landed in this repo via Phase 10 commit `28a4add4`.

## Next Milestone

**Not yet started.** Run `/gsd-new-milestone` to define v1.12 (questioning → research → requirements → roadmap; fresh REQUIREMENTS.md).

**Standing candidates:**
- **CI red on `thinx-staging` — CouchDB user-view 503 (BLOCKS deploy of 15/16)** — pipelines 5269+5270 fail deterministically on `00-AppSpec /api/login (invalid)` → `Owner.validate()` returns false (CouchDB user-directory error/hang) → 503 at `router.auth.js:287`. Not v1.11 code (it touched no auth/owner/couch path). Investigate CouchDB startup/readiness in CI (or `/gsd-debug` the auth 503). Once green, optional prod deploy of 15/16 (`docker service update --force thinx_api`; micro-pinned). This is the top follow-on.
- **Third-deferral keep/drop call** — TEST-CHAI-01 (chai-http v5 ESM, locked per AGENTS.md), OPS-02 / OPS-03 (pure swarm-side OPS). Now deferred 4×; a future milestone should make a deliberate keep/drop call.
- **uuid #194** — `deferred-dev-only` (transitive `uuid@8` in nyc/jest-junit; 8→11 bump risks the dev toolchain). Revisit if those tools bump their pin or the alert escalates to runtime scope.

## Validated Requirements (Historical)

<details>
<summary>v1.11 Backlog Drawdown (shipped 2026-06-06)</summary>

- ✓ **REFACTOR-06** — v1.11 (Phase 15) — All 9 `fs-finder` call sites across 5 `lib/` modules replaced with the synchronous, version-independent native helper `lib/thinx/finder.js` (`findFilesSync`/`findDirsSync`), behavior locked by `FinderSpec` (11 cases) + per-module specs. Pre-order DFS traversal matches fs-finder's `getPathsSync` ordering exactly (caught + fixed in code review).
- ✓ **REFACTOR-07** — v1.11 (Phase 15) — `fs-finder` (`github:suculent/Node-FsFinder#master`) removed from `package.json`; `npm ls fs-finder` empty (4 packages purged); 0 source references remain. Gated last behind a grep precondition for clean bisect.
- ✓ **SEC-DEP-03** — v1.11 (Phase 16) — 5 default-branch Dependabot alerts triaged via taxonomy; 3 surgical overrides (`@hapi/wreck ^18.1.1` runtime, `tmp ^0.2.6`, `serialize-javascript ^7.0.5`) → runtime tree `npm audit --omit=dev` 0 high/0 moderate; mocha smoke-checked intact; `uuid #194` deferred-dev-only.
- ✓ **OPS-EXEC-03** — v1.11 (Phase 17) — Influx stats fix (`9b6d931c`) verified live in production (discrepancy branch — already autoredeployed pipeline-5266 `:latest`). `DEVICE_CHECKIN` count=16, 0 `BADSTRING`/parse errors over 24h, `thinx_api` co-located with mosquitto on micro. Runbook annex in `swarm.md`.

</details>

<details>
<summary>v1.10 Operational Closures (shipped 2026-06-05)</summary>

- ✓ **TEST-WS-01** — v1.10 (Phase 12) — In-process Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exercises the rtm-style `/<owner>(/<timestamp>)?` upgrade and asserts `101 Switching Protocols`; future regression of the SEC-WS-01 edge fix now surfaces at CI.
- ✓ **OBS-01** — v1.10 (Phase 12) — `scripts/redact-managed-logs.js` posts a single Slack closure receipt (docs scanned/redacted, sample verdict, runtime, host-only env) to `SLACK_WEBHOOK` on `--apply`; Slack failure never blocks exit; `--dry-run` stays silent.
- ✓ **OBS-02** — v1.10 (Phase 12) — DETECT-only `lib/thinx/audit-ttl-probe.js` wired additively into `thinx-core.js` startup (cert-probe pattern); WARNs if CouchDB stops evicting `expire_at`-stamped `managed_logs` docs past a 7-day grace, guarding the v1.9 Phase 9 forward-TTL.
- ✓ **OPS-EXEC-01** — v1.10 (Phase 13) — SEC-WS-01 edge handshake closed; `scripts/probe-rtm-handshake.sh` reproduction probe + swarm-config snapshot trail under `.planning/runbooks/` + runbook execution annex. Discrepancy branch (fix already live out-of-band).
- ✓ **OPS-EXEC-02** — v1.10 (Phase 14) — SEC-PII-02 `managed_logs` sweep closed against production CouchDB: 422 genuine `reset_key` leaks redacted in the live `message` field (snapshot-gated `--apply` + `--sample` exit 0 + compaction); redactor field-scoping bug (SEC-PII-02b) fixed in-flight. Historic ~658k corpus already deleted out-of-band (656,697 tombstones).

</details>

<details>
<summary>v1.9 Backend Hygiene & Posture (shipped 2026-06-04)</summary>

- ✓ **REFACTOR-01** — v1.9 (Phase 5) — Single canonical `app.set('trust proxy', ['loopback', '127.0.0.1'])` site in `thinx-core.js` with rationale comment; duplicate call deleted.
- ✓ **REFACTOR-02** — v1.9 (Phase 5) — `!=` → `!==` in `Owner.password_reset` (line 492) + regression test for string-vs-number coercion case.
- ✓ **REFACTOR-05** — v1.9 (Phase 5) — `jshint` moved to `devDependencies`. (`fs-finder` scope-amended: deferred to v1.10 because of 5 active runtime call sites in `lib/`.)
- ✓ **REFACTOR-03** — v1.9 (Phase 6) — Raw-socket `close` handler in WS upgrade flow; per-connection map entries released deterministically on mid-flight aborts.
- ✓ **SEC-WS-01** — v1.9 (Phase 6) — Root cause reproduced as `rtm.thinx.cloud` edge-nginx routing gap; runbook authored in `.planning/runbooks/websocket-handshake.md` with the 7-row reproduction table + operator-side fix. NOT code-fixable from this repo.
- ✓ **SEC-COOKIE-01** — v1.9 (Phase 6) — Session cookie `x-thx-core` flipped to `httpOnly: true`; sub-5-min rollback path documented; regression spec covers attribute presence.
- ✓ **REFACTOR-04** — v1.9 (Phase 7) — ~73 callback patterns in `lib/thinx/owner.js` converted to async/await across 6 atomic commits (`1aa92fe5`→`f4345711`); 5 behavior-locking specs added; SEC-PII-01 + Phase 5 REFACTOR-02 invariants preserved.
- ✓ **AUTH-REACTIVATE-01** — v1.9 (Phase 8) — Admin endpoint `POST /api/v2/admin/user/:id/reactivate` behind `requireAdmin`; `ZZ-RouterAdminReactivateSpec.js` covers 401/403/200 paths + soft-delete gate intact.
- ✓ **AUTH-RESET-LINK-CONSOLE** — v1.9 (Phase 8) — Reset URL changed from legacy `/password.html?` to Vue console `/password-reset?` in `Owner.password_reset`; regression spec extension locks the redirect.
- ✓ **SEC-PII-02** — v1.9 (Phase 9) — `scripts/redact-managed-logs.js` (snapshot-gated `_bulk_docs` overlay + `--sample N` verification) + `lib/thinx/audit.js` 90-day `expire_at` forward TTL + operator runbook + GDPR-posture note. Production execution deferred to operator window.
- ✓ **SEC-DEP-02** — v1.9 (Phase 10) — 2 console alerts classified `deferred-vendored-asset` (vendored `jquery-validation-1.19.5`, never invoked); SEC-DEP-02 scheduled in `services/console` GSD project; submodule pointer landed in this repo. Cross-project coordination runbook authored.
- ✓ **BASE-IMG-01** — v1.9 (Phase 11) — `base/update.sh` rewritten (18 → 179 lines): `set -euo pipefail`, `--tag`/`--owner`/`--dry-run`/`--help`, auto `npm version patch`, pre/post digest logging, single atomic GPG-signed commit, shellcheck 0.11.0 clean.
- ✓ **THINX-CERT-CHECK-01** — v1.9 (Phase 11) — DETECT-only `lib/thinx/cert-probe.js` startup probe wired into `thinx-core.js:~211`; WARNs on R10..R14 issuer-mismatch between leaf and `ca.pem`; `ZZ-CertProbeSpec.js` (6 it blocks) + 4 fixture PEMs.

</details>

<details>
<summary>v1.0 GA Backend Closures (shipped 2026-05-27)</summary>

- ✓ **AUTH-API-01** — v1.0 (Phase 1) — Unauthenticated `POST /api/v2/password/reset` returns 200 with no-enumeration body; Vue console `Authorization: Bearer null` pattern handled. Class-fix in `lib/router.js` (Bearer-null guard) + body normalization in `lib/router.user.js`. Regression spec `ZZ-RouterPasswordResetSpec.js`.
- ✓ **SEC-PII-01** — v1.0 (Phase 2) — PII/credentials redacted at 12+1 sites in `lib/thinx/owner.js` via `Util.redactEmail` + `Util.redactToken`. Audit-log writes redacted before CouchDB persistence. Regression spec `ZZ-OwnerLogRedactionSpec.js`.
- ✓ **OPS-01** — v1.0 (Phase 3) — Swarm autoredeploy restored on `188.166.23.244` via Rung 1 force-restart of `swarmpit_app`. Push-observe SLA 63s vs ≤300s target. Runbook at `.planning/runbooks/swarm.md`.
- ✓ **SEC-DEP-01** — v1.0 (Phase 4) — 29 Dependabot alerts classified; 4 `package.json` `overrides` edits shipped via `d8e3176c`; runtime-tree `npm audit --omit=dev` high 9→0; merged to master (#539) + main (#540).

</details>

<details>
<summary>Pre-v1 existing capabilities (locked)</summary>

- ✓ Express monolith with `thinx-core.js` bootstrap (HTTP + HTTPS, Let's Encrypt intermediate-rotation tolerance)
- ✓ Session middleware on Redis-backed store, cookie name `x-thx-core`
- ✓ 17 API v2 routers covering apikey/auth/build/device/deviceapi/env/oauth/gdpr/logs/mesh/profile/rsakey/source/transfer/user/admin
- ✓ MQTT messaging + WebSocket runtime (`lib/thinx/messenger.js`, `ws`)
- ✓ Build pipeline: Redis-backed queue → Docker-based firmware builder → CouchDB-stored logs streamed over WebSocket
- ✓ Admin API surface — `requireAdmin` gate on `/api/v2/admin/*`
- ✓ CORS origin reflection for credentialed requests (`lib/router.js:32-56`)
- ✓ Jasmine + nyc test suite under `spec/jasmine/ZZ-*` with chai-http v4

</details>

## Out of Scope

- **services/console** frontend work — owned by the console submodule's GSD project (`services/console/.planning/`)
- **G10** (`thinx_worker` silent-loop on `docker pull`) — lives in the worker repo, different codebase
- **chai-http v5 ESM migration** — dependency lock per `AGENTS.md:82-92`; trigger to reconsider is a Snyk/Dependabot CVE in superagent v3 (tracked as TEST-CHAI-01)
- **Multi-tenant revamp / v2 API features** — future major milestone, not v1.x
- **Edge layer redesign** (Traefik labels, nginx rewrites beyond G8 needs) — only AUTH-API-01 may touch edge config; otherwise out
- **Dashboard data-exposure rework** (AGENTS.md L98) — privacy concern but not a regression vs. legacy; v1.x candidate at most
- **CONSOLE-LEGACY-JSON-PARSE** — legacy AngularJS console double-parse bug (`JSON.parse` on an already-parsed object at `services/console/src/login.js:173` + `password.js:87`); frontend fault in the sibling submodule, no parent-repo angle. Reclassified out of parent scope at v1.11 start; owned by the `services/console` GSD workspace

## Context

- **Tech stack:** Node/Express monolith, CommonJS (no ESM migration), chai-http v4 pinned per `AGENTS.md:82-92`
- **Production deploy:** parent `thinx-staging` push → CircleCI build → image publish → Swarmpit autoredeploy on `188.166.23.244` (SLA ~50-65s observed in v1.0). Manual `./restart.sh` is the fallback (Phase 3 fix made it unnecessary).
- **Signing:** GPG-sign commits is the project default; the 2026-05-26 single-session authorization for unsigned commits is recorded in memory `unsigned-commits-260526` and does not carry forward.
- **AGENTS.md** at parent root is the existing onboarding doc (Codex-runtime convention) — kept as the ops/deploy + dependency-lock rationale reference alongside `.planning/`.
- **Sibling project:** `services/console/.planning/` has 10 phases shipped (v1.0 frontend) + Phase 11 in flight. Parent v1.0 GA and console v1.0 GA land together; v1.x coordination is per-project but cross-references the shared backlog (SEC-DEP-02 etc.).
- **Production image at milestone close:** `thinxcloud/api:latest sha256:4d3fb789` (Phase 4 deploy 2026-05-26T22:35:54Z).

## Constraints

- **Compatibility:** every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks
- **Tech stack:** Node/Express monolith, CommonJS, chai-http v4 (locked per AGENTS.md)
- **Deployment:** parent `thinx-staging` push triggers the deploy pipeline; Phase 3's autoredeploy restoration removes the need for manual `./restart.sh` for normal pushes
- **Signing:** GPG-sign by default; per-session unsigned authorization must be re-granted explicitly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1.0 scope = 4 GA gap closures only (not "backend at large") | Mirrors console submodule's v1.0 milestone scope; narrowest viable project that closes v1 alongside the frontend | ✓ Good — shipped 4/4 in ~2 days |
| Refresh codebase map (CONCERNS) before drafting REQUIREMENTS | Caught 9 additional concerns (httpOnly: false, !=, PII in logs, duplicate trust proxy, missing socket close handlers) that weren't in the previous map | ✓ Good — SEC-PII-01 scope expanded from 6 → 12+1 sites because of it |
| Keep `AGENTS.md` (Codex-runtime convention) as ops/deploy reference alongside GSD | AGENTS.md is the existing onboarding doc; replacing it would lose ssh details and dependency-lock rationale | ✓ Good — runbook persisted to both `.planning/runbooks/swarm.md` (canonical) and AGENTS.md (local mirror) in Phase 3 |
| Treat `services/*` as external subservices; don't deep-scan console submodule | Console has its own GSD project; double-mapping would create inconsistency | ✓ Good |
| SEC-pii-logs included as v1 GA blocker (vs deferred) | Today's CONCERNS map surfaced 6 leak sites in owner.js (emails + reset_keys + Mailgun token + activation token); GDPR posture for v1 GA; fix is small | ✓ Good — Phase 2 surfaced 6 more sites and an opportunistic 13th during execution; audit-log path (CouchDB persistence) was the highest-priority site |
| Phase 1 fix in `lib/router.js` (class-fix) vs per-route guard | Class-fix closes the entire Bearer-null bug class on ANY route, not just `/password/reset`. Frontend half (Vue `Bearer null` header) stays; backend makes it harmless | ✓ Good — single-file revert path; Vue-side cleanup filed as v1.x candidate |
| Phase 3 Rung-by-rung ladder (Rung 1 autonomous, Rungs 2-4 checkpoint-gated) | Smallest-change preference; force-restart is reversible; deeper rungs (DB rebuild, stale-node cleanup, Swarmpit upgrade) carry swarm-fabric risk | ✓ Good — Rung 1 PASS on first try; Rungs 2-4 stay locked for any future recurrence |
| Phase 4 Slice 3 Option C: skip manual Dependabot UI walk for 22 non-blocker alerts | Operator decision 2026-05-27; runtime-tree primary metric already 9→0; non-blocker alerts expected to age out via natural Dependabot lifecycle | ✓ Good — post-merge rescan confirmed 29 → 3 (1H + 2M) on default branches |
| Phase 4 Slice 4 Option B: defer `services/console` merge-up to separate cross-project coordination | Operator decision 2026-05-27; 194-commit submodule diff (Vue v1.0 rewrite era) is sibling-project scope; SEC-DEP-02 v1.x backlog already tracks console-side dependency triage | — Pending — track via SEC-DEP-02 |
| Verification artifact accepted in SUMMARY.md `verification:` blocks for Phases 1-3 (not separate `*-VERIFICATION.md`) | Verifier agent was not retroactively run; functional verification IS present in SUMMARYs + supporting `.txt` files; process-debt, not functional-debt | ⚠️ Revisit — if any future audit requires structured `*-VERIFICATION.md` per phase for traceability tooling, re-run `gsd-verifier` against the 3 SUMMARYs (low cost; no re-verification needed) |
| v1.9 phase numbering continues from v1.0's Phase 4 (no `--reset-phase-numbers`) | Linear monorepo history preserves traceability across milestones; downstream tools that map requirement → phase don't need a milestone-disambiguation key | ✓ Good — Phases 5–11 mapped 1:1 to v1.9 with no ambiguity |
| Phase 7 (owner.js sweep) executed as 6 sequential atomic commits on a single branch (not parallel worktrees) | Every plan touched `lib/thinx/owner.js`; parallel execution would have produced merge conflicts on every plan; sequential single-branch execution gave bisect-friendly history | ✓ Good — landed `1aa92fe5`→`f4345711` with zero behavior regressions and each top-5 method individually revertable |
| SEC-WS-01 closed via operator runbook (not code change) | Root cause is rtm edge-nginx routing gap — outside this repo's control; capturing it as a runbook with a verbatim reproduction table is the highest-value action available from here | ✓ Good — operator-side fix recipe is documented and `deferred to edge-redesign` tag prevents accidental re-scoping |
| SEC-PII-02 ships code + leaves production execution to operator window | Redaction is destructive of audit-log content; a snapshot-gated `--apply` flow with a documented rollback path makes execution a scheduled-maintenance decision, not a CI side-effect | ✓ Good — script, audit TTL, runbook, and GDPR-posture note all shipped; execution outstanding (see v1.10 backlog) |
| THINX-CERT-CHECK-01 is DETECT-only (not auto-mutate) | Cert rotation lives on the swarm host (cron + ACME client) — the codebase angle is to surface drift, not to take over rotation | ✓ Good — startup WARN gives 5-min visibility on R10→R13 / R10→R14 drift before SSL incidents trigger |
| REFACTOR-05 scope-amended mid-phase to jshint-only (fs-finder deferred to v1.10) | 5 active runtime call sites discovered during execution made `fs-finder` reclassification a breaking change disguised as a "cheap sweep" | ✓ Good — single-flag amendment surfaced in ROADMAP.md, REQUIREMENTS.md, STATE.md, and a v1.10 backlog entry; literal text gap closed by `89669fc4` |
| v1.9 milestone closed without a separate milestone-level audit | Per-phase VERIFICATION.md ran for all 7 phases and covered 13/13 requirements; running another audit pass would mostly re-read those VERIFICATION reports | ⚠️ Revisit — if v1.10 audit tooling requires a v1.x-MILESTONE-AUDIT.md trail across all milestones, retrofit one against the 7 v1.9 VERIFICATION.md reports |
| v1.10 Phase 12 sequenced FIRST (code helpers before the two OPS executions) | OBS-01 had to be wired into `redact-managed-logs.js` before Phase 14's sweep invoked it (auto Slack receipt); TEST-WS-01 had to exist before Phase 13's edge fix so regression coverage was there from day one | ✓ Good — both OPS phases ran with their helper dependency already in place |
| v1.10 OPS-EXEC-01 + OPS-EXEC-02 closed as discrepancy branches | Both fixes/cleanups had already partially happened out-of-band (edge fix live; historic ~658k corpus already deleted). The phases pivoted from "apply" to "verify + persist the audit trail" rather than re-applying | ✓ Good — verification + runbook annex still produced; 5/5 Verified without redundant mutation |
| v1.10 redactor field-scoping bug (SEC-PII-02b) fixed in-flight rather than deferred | The all-fields walk false-matched the legitimate 64-hex `owner` hash; per the milestone's "opportunistic in-flight code adds" execution model, the fix landed inside Phase 14 rather than spawning a separate cycle | ✓ Good — 422 genuine `reset_key` leaks redacted; `PII_FIELDS` allowlist [message, flags] now the documented scope |
| v1.10 closed with influx fix (`9b6d931c`) tracked as quick-task `260605-inf` but deploy left to operator | Influx fix is a post-close addition, not one of the 5 v1.10 requirements; force-rollout is a production action on the operator's timeline. Recorded so the tracking survives the milestone boundary | ✓ Resolved — v1.11 OPS-EXEC-03 verified it autoredeployed and is live (discrepancy branch) |
| v1.11 fs-finder replaced with a hand-written native helper (`finder.js`), not `fs-extra` glob | `fs-extra` has no glob/recursive-find; native `fs` is the realistic tool. A manual synchronous stack/recursion walk is version-independent — avoids the Node-19 `{recursive:true}` gap that the `>=19.x` engines floor would expose | ✓ Good — plan-checker caught the Node-19 trap pre-execution; helper centralizes the contract in one spec |
| v1.11 fs-finder replacement uses pre-order DFS in readdir order (not BFS or LIFO) | Code review found the first cut (LIFO stack) reversed sibling order vs fs-finder's `getPathsSync` pre-order DFS — would have changed `platform.js` `ymls[0]` for repos with multiple equal-depth `thinx.yml`. Matching fs-finder's exact walk preserves behavior | ✓ Good — behavior-preservation proven via direct-node tests |
| v1.11 Dependabot triage scope = Moderate (3 overrides, defer uuid) | Runtime-tree High was already 0 (both Highs dev-only); only `@hapi/wreck` is runtime. `uuid 8→11` is a 3-major bump risking nyc/jest-junit. Remediate the safe/runtime set, defer the toolchain-risk one | ✓ Good — runtime tree 0/0; mocha intact; uuid documented deferred-dev-only |
| v1.11 OPS-EXEC-03 closed as discrepancy branch (no force-rollout) | Operator-authorized SSH probing found the influx fix already live (autoredeployed ~17h prior). Re-rolling an identical healthy image is pure restart risk; verify + annex instead | ✓ Good — DEVICE_CHECKIN=16, 0 BADSTRING; corrected stale co-location memory (micro, not core) |
| v1.11 closed at `tech_debt` with Phases 15/16 unpushed/undeployed | The 4 requirements (remove fs-finder, triage deps, confirm influx live) are met and code/audit-verified; pushing+deploying 15/16 is follow-on operator work outside the requirement set. Full CI suite validates on push | — Pending — operator push → CI green → optional prod deploy of 15/16 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:plan-phase` close-out or equivalent):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated (collapse into `<details>` after milestone close)
3. New requirements emerged? → Add to v1.x backlog (REQUIREMENTS.md) or next-milestone candidates
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Validated requirements collapsed into a `<details>` block
4. Out of Scope reasoning audited
5. Context + Next Milestone Goals updated

---
*Last updated: 2026-06-06 — after v1.11 Backlog Drawdown milestone (4/4 requirements satisfied across Phases 15–17: fs-finder excised, Dependabot triaged, influx fix verified live). Audit tech_debt; Phases 15/16 await operator push/CI/deploy follow-on. Next milestone (v1.12) not yet started; would continue phase numbering from v1.11 (next phase = 18).*
