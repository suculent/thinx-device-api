# Milestones

## v1.11 — Backlog Drawdown (Shipped: 2026-06-06)

**Delivered:** Paid down the long-standing v1.x backend backlog — excised the `fs-finder` fork, triaged the outstanding Dependabot alerts, and confirmed the influx stats fix live in production — while making deliberate disposition calls on the items deferred three+ times. 4/4 v1.11 requirements satisfied across 3 phases; no signature break on any legacy-console-compatible route.

**Stats:**

- Phases: 3 (Phases 15–17) | Plans: 6 | Phase summaries: 6
- Timeline: 2026-06-05 (milestone start) → 2026-06-06 (close) (~1.5 days)
- Git range: `docs: start milestone v1.11` (`9c8e2292`) → milestone audit (`30ee8d17`), on `thinx-staging` (33 commits; code delta 14 files / +587 / −81)
- Audit status: `.planning/milestones/v1.11-MILESTONE-AUDIT.md` — ⚡ `tech_debt` (requirements 4/4, phases 3/3, integration clean; deferred items below)

**Key accomplishments:**

- **REFACTOR-06 + REFACTOR-07** (Phase 15) — Excised the internally-owned `fs-finder` fork: replaced all 9 `finder.*` call sites across 5 `lib/` modules with a new synchronous, version-independent native helper `lib/thinx/finder.js` (`findFilesSync`/`findDirsSync`), locked by `FinderSpec` (11 cases) + per-module specs; then dropped `fs-finder` from `package.json` (purged 4 packages). Plan-checker caught a Node-19 `{recursive:true}` incompatibility (engines floor `>=19.x`) before execution → manual stack-walk; code review caught an fs-finder **ordering** divergence (LIFO vs fs-finder's pre-order DFS) that would have changed `platform.js` `ymls[0]` behavior → fixed to match exactly. Behavior preservation proven via direct-node tests (recursion, dotfiles, absolute paths, glob masks).
- **SEC-DEP-03** (Phase 16) — Triaged the 5 live default-branch Dependabot alerts via the established taxonomy: 3 surgical `package.json` overrides (`@hapi/wreck ^18.1.1` — the only runtime alert; `tmp ^0.2.6`; `serialize-javascript ^7.0.5`, gated on a mocha smoke-check). Runtime tree (`npm audit --omit=dev`) went 1 moderate → **0 across all severities**. `uuid #194` (dev-only moderate, 3-major bump risk to nyc/jest-junit) deliberately deferred as `deferred-dev-only`.
- **OPS-EXEC-03** (Phase 17) — Resolved as a **discrepancy branch**: operator-authorized SSH verification found the influx stats fix (`9b6d931c`, quick-task `260605-inf`) already live in prod (autoredeployed pipeline-5266 `:latest` ~17h prior). Deployed `influx.js` carries the fix; `DEVICE_CHECKIN` count = 16 (dashboard numbers correct), 0 `BADSTRING`/parse errors over 24h, `thinx_api` co-located with `thinx_mosquitto` on micro. No force-rollout applied. Corrected the stale co-location operator memory (micro, not core; api now constraint-pinned).

**Known deferred items at close:** 4 (acknowledged — see STATE.md Deferred Items). 3 are v1.10-era quick-task scanner false-positives (`260531-n72`, `260531-pdi`, `260605-lix` — work in git history, scanner can't read their manifest format); 1 is Phase 15's `human_needed` verification (full Jasmine suite is Docker-gated in dev, validates on CI push — 5/5 code must-haves already verified).

**Post-close CI status (2026-06-06 → 07):** Phases 15+16 were pushed to `thinx-staging` (origin advanced to the v1.11 audit commit `30ee8d17`). CircleCI **pipelines 5269 and 5270 both failed identically** (a re-run reproduced it exactly — NOT flaky) on a single spec: `00-AppSpec POST /api/login (invalid)` returned **503 `service_unavailable`** instead of 403, with a 30s async timeout. **Root cause:** `Owner.validate()` returns `false` (CouchDB user-directory view error/hang) → the 503 branch at `lib/router.auth.js:287` (whose comment names "CouchDB unavailable during a deploy" as exactly this cause). **This is NOT a v1.11 regression:** v1.11's entire code footprint is the 6 fs-finder modules + `package.json` overrides + 6 specs — it touched **zero** auth/owner/CouchDB/session code, and all fs-finder specs passed. The red is a **CouchDB `owners_by_username` design-view index-build race on the fresh CI DB** — the first request raced the lazy index build, `Owner.validate()` got a transient view error → 503. **RESOLVED 2026-06-07:** `/gsd-debug` confirmed the root cause; fix in `spec/jasmine/00-AppSpec.js` warms the user views (with retry) after `thx.init()` so indexes build before the first spec queries them (test-harness only, no product change). Verified green on `thinx-unit` (pipeline 5271, test-only branch — no deploy). Diagnosis: `.planning/debug/resolved/ci-login-503-couchdb.md`. **Remaining deliberate step:** push the fix + v1.11 to `thinx-staging` (triggers CI → image → Swarmpit autoredeploy of 15/16+fix to prod; `[node.hostname==micro]` co-locates `thinx_api` with mosquitto). Not yet done — operator's call. Phases 15/16 deliberately not yet deployed (only OPS-EXEC-03's influx fix needed prod, and it was already live).

**Disposition decisions:** CONSOLE-LEGACY-JSON-PARSE reclassified to `services/console` sibling scope at milestone start (frontend double-parse, no parent angle). TEST-CHAI-01 / OPS-02 / OPS-03 kept deferred a 4th time as a deliberate keep call.

**Archives:**

- Roadmap: `.planning/milestones/v1.11-ROADMAP.md`
- Requirements: `.planning/milestones/v1.11-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.11-MILESTONE-AUDIT.md`

---

## v1.10 — Operational Closures (Shipped: 2026-06-05)

**Delivered:** Closed the two operator-runbook executions v1.9 deferred (SEC-WS-01 edge handshake + SEC-PII-02 `managed_logs` production sweep) and landed the three code-side helpers that made those closures safer and observable. Both OPS executions resolved as discrepancy branches (each fix/cleanup had already partially happened out-of-band); the redactor field-scoping bug surfaced and was fixed in-flight. 5/5 v1.10 requirements Verified; no signature break on any legacy-console-compatible route.

**Stats:**

- Phases: 3 (Phases 12–14) | Plans: 5 | Phase summaries: 5
- Timeline: 2026-06-04 (roadmap) → 2026-06-05 (close) (~2 days)
- Git range: `feat(12-03)` audit-ttl wiring (`51a50e49`) → `feat(14)` OPS-EXEC-02 close (`6db45592`), on `thinx-staging`
- Audit status: `.planning/milestones/v1.10-MILESTONE-AUDIT.md` — ✅ passed (requirements 5/5, phases 3/3, integration 2/2, flows 2/2)

**Key accomplishments:**

- **TEST-WS-01** (Phase 12) — New in-process Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exercises the rtm-style `/<owner>(/<timestamp>)?` upgrade and asserts `101 Switching Protocols`, so any future regression of the SEC-WS-01 edge fix surfaces at CI rather than user-report.
- **OBS-01** (Phase 12) — `scripts/redact-managed-logs.js` now posts a single Slack closure receipt (docs scanned/redacted, sample verdict, runtime, host-only env — no PII/creds) to the existing `SLACK_WEBHOOK` outage notifier on `--apply`; Slack failure never blocks script exit; `--dry-run` stays silent.
- **OBS-02** (Phase 12) — DETECT-only audit-TTL eviction probe (`lib/thinx/audit-ttl-probe.js`) wired additively into `thinx-core.js` startup (cert-probe pattern); WARNs if CouchDB stops evicting `expire_at`-stamped `managed_logs` docs past a 7-day grace, guarding the v1.9 Phase 9 forward-TTL guarantee.
- **OPS-EXEC-01** (Phase 13) — SEC-WS-01 edge handshake closed; `scripts/probe-rtm-handshake.sh` 7-row reproduction probe added; swarm-config snapshot trail established under `.planning/runbooks/`; runbook execution annex committed. Resolved as a discrepancy branch (fix already live out-of-band; probe 0/4 confirmed ready).
- **OPS-EXEC-02** (Phase 14) — SEC-PII-02 `managed_logs` sweep closed against production CouchDB: 422 genuine `reset_key` leaks in the live `message` field redacted (snapshot-gated `--apply` + `--sample` exit 0 + compaction). Fixed a redactor field-scoping bug in-flight (SEC-PII-02b: the all-fields walk false-matched the legitimate 64-hex `owner` hash). The historic ~658k corpus was already deleted out-of-band (656,697 tombstones; 2,183 live docs remained).

**Known deferred items at close:** 3 quick-task scanner false-positives (`260531-n72`, `260531-pdi`, `260605-lix` — all shipped via `/gsd-quick`; work in git history `fae0efbd`/`08e4dbd7`/`6b4a077c`; scanner cannot read their manifest format). See STATE.md.

**Post-close addition (pending deploy):** Influx stats fix (`9b6d931c`, quick-task `260605-inf`) — corrects Vue dashboard check-in numbers + silences InfluxDB `BADSTRING` log spam. CI green (pipeline 5266); operator force-rollout to prod pending.

---

## v1.9 — Backend Hygiene & Posture (Shipped: 2026-06-04)

**Delivered:** Paid down the v1.x backlog the v1.0 GA explicitly deferred — structural hygiene, security posture, auth/account lifecycle, and operational guardrails — without breaking any legacy-console-compatible route the Vue console inherited. 13/13 v1.9 requirements verified.

**Stats:**

- Phases: 7 (Phases 5–11) | Plans: 23 | Phase summaries: 23
- Timeline: 2026-06-02 → 2026-06-04 (~3 days)
- Git range: `eebdb47d` (milestone start) → `40c755e0` (worker submodule sync close-out) — 78 commits on `thinx-staging`
- Changes: 97 files modified, +17,658 / −529 LOC (code: 23 files / +2,632 / −468; planning + runbooks + submodules: 74 files / +15,026 / −61)
- Audit status: per-phase VERIFICATION.md present across all 7 phases (Phase 5–11); no separate milestone-level audit (deferred — per-phase verification covered 13/13 requirements)

**Key accomplishments:**

1. **Phase 5 — Backend hygiene cheap sweeps** (REFACTOR-01, REFACTOR-02, REFACTOR-05): collapsed duplicate `app.set('trust proxy', …)` calls in `thinx-core.js` to one canonical allowlist-form site with a `// REFACTOR-NN:` rationale comment; fixed the latent `!=`→`!==` in `Owner.password_reset` with a string-vs-number coercion regression test; moved `jshint` to `devDependencies` (REFACTOR-05 scope-amended: `fs-finder` deferred to v1.10 because of 5 active runtime call sites in `lib/`).
2. **Phase 6 — WebSocket surface hardening** (REFACTOR-03, SEC-WS-01, SEC-COOKIE-01): registered a raw-socket `close` handler in the WS upgrade flow so per-connection map entries are released deterministically on mid-flight aborts; flipped session cookie `x-thx-core` to `httpOnly: true` with a sub-5-min rollback path documented in `.planning/runbooks/websocket-handshake.md`; produced operator-side runbook for the rtm edge-nginx routing gap (SEC-WS-01 not code-fixable from this repo, tagged `deferred to edge-redesign`).
3. **Phase 7 — `owner.js` async/await sweep** (REFACTOR-04): converted ~73 callback patterns in `lib/thinx/owner.js` to async/await across 6 atomic commits (`1aa92fe5`→`f4345711`) — 18 non-top-5 methods in 07-1, then the top-5 (`create`, `delete`, `update`, `password_reset`, `set_password`) one per commit with one behavior-locking spec each in `spec/jasmine/02-OwnerSpec.js`; folded all 7 deferred strict-equality fixes; preserved Phase 5 REFACTOR-02 (`!==` at line 492) and SEC-PII-01 (`Util.redactToken`) invariants verbatim.
4. **Phase 8 — Auth & account lifecycle closures** (AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE): admin-only `POST /api/v2/admin/user/:id/reactivate` endpoint behind existing `requireAdmin` middleware (clears `user.deleted = true` via `userlib.atomic`) with `ZZ-RouterAdminReactivateSpec.js` covering the 401/403/200 paths + soft-delete gate intact; one-line redirect URL change in `Owner.password_reset` (`/password.html?` → `/password-reset?`) so reset emails land on the Vue console, locked with a regression spec extension.
5. **Phase 9 — Historic PII redaction (managed_logs)** (SEC-PII-02): `scripts/redact-managed-logs.js` operator CLI that streams `managed_logs` in pages of 1000 and overlays `[REDACTED-RESET_KEY]` / `[REDACTED-EMAIL]` via `_bulk_docs` (default dry-run; `--apply` gated behind mandatory `--snapshot-to` JSONL forensic dump; `--sample N` verification subcommand); forward-going TTL via `lib/thinx/audit.js` `expire_at` field (90-day default, parameterized via `app_config.audit_retention_days`); operator runbook + GDPR-posture note in `.planning/runbooks/managed-logs-redaction.md`. Production execution deferred to operator under the runbook.
6. **Phase 10 — Cross-project dependency coordination** (SEC-DEP-02): 2 high-severity `services/console` Dependabot alerts classified as `deferred-vendored-asset` (vendored `jquery-validation-1.19.5/package.json`, never invoked in build) — a new disposition class introduced by this phase; SEC-DEP-02 scheduled inside the `services/console` GSD project under a new `v1.x Operational Hygiene` milestone; submodule pointer bumped `27758ebda`→`240fe095` then again to capture the resolution; cross-project coordination runbook at `.planning/runbooks/cross-project-dependency-coordination.md`.
7. **Phase 11 — Build & cert hygiene** (BASE-IMG-01, THINX-CERT-CHECK-01): rewrote `base/update.sh` from 18 lines of fire-and-forget into a 179-line hardened build tool — `set -euo pipefail`, `--tag`/`--owner`/`--dry-run`/`--help` CLI, auto `npm version patch --no-git-tag-version`, pre/post docker image digest logging, single atomic GPG-signed `chore: base version bump` commit, shellcheck 0.11.0 clean; added DETECT-only `lib/thinx/cert-probe.js` startup probe wired into `thinx-core.js:~211` that WARNs when the leaf cert's issuer is not represented in `ca.pem` (R10..R14 chain check), backed by `ZZ-CertProbeSpec.js` (6 it blocks) and 4 fixture PEMs.

**Tech debt carried into v1.10 backlog:**

- **fs-finder removal sweep** (deferred from Phase 5 REFACTOR-05): ~10 call sites across 5 modules (`lib/thinx/builder.js`, `deployment.js`, `platform.js`, `repository.js`, `plugins/arduino/plugin.js`) need replacement with `fs-extra` glob helpers or native `fs.promises.readdir` recursion before `fs-finder` can leave `package.json`.
- **SEC-WS-01 edge fix** (runbook-only resolution): the actual swarm-host nginx `location` block edit for `rtm.thinx.cloud` lives outside this codebase; runbook is authored, operator-side execution outstanding.
- **SEC-PII-02 production execution** (runbook-only resolution): the redaction script + audit TTL ship in code; production sweep against ~658k `managed_logs` docs is operator-run and deferred to a scheduled maintenance window per the runbook.
- **Carry-over from v1.0:** TEST-CHAI-01 (chai-http v5 ESM migration still locked per AGENTS.md), OPS-02 / OPS-03 (pure swarm-side OPS, deferred), CONSOLE-LEGACY-JSON-PARSE (sibling-project scope).

**Companion project:** `services/console` submodule advanced through SEC-DEP-02 in the parallel GSD workspace; pointer landed in this repo via Phase 10 (commit `28a4add4`). v1.9 backend tag should coordinate with whatever the console submodule ships next.

**Archives:**

- Roadmap: `.planning/milestones/v1.9-ROADMAP.md`
- Requirements: `.planning/milestones/v1.9-REQUIREMENTS.md`
- Audit: (none — per-phase VERIFICATION.md was the gate; milestone-level audit deferred)

---

## v1.0 — v1 GA Backend Closures (Shipped: 2026-05-27)

**Delivered:** Every legacy-console capability the Vue console depends on (auth, profile, devices, transformers, builds) continues to work end-to-end through v1.0 GA — 4/4 v1 backend requirements verified.

**Stats:**

- Phases: 4 | Plans: 8
- Timeline: 2026-05-26 → 2026-05-27 (~2 days)
- Git range: `6d0af4dd` (roadmap creation) → `71fab68b` (milestone audit)
- Changes: 337 files modified, +67,439 / −11,229 LOC
- Audit status: `tech_debt` (no blockers; intentionally-deferred v1.x items + 1 documented artifact gap)

**Key accomplishments:**

1. **AUTH-API-01** (Phase 1) — Restored unauthenticated `POST /api/v2/password/reset` 200 response on rtm. Class-fix Bearer-null guard in `lib/router.js` + no-enumeration body normalization in `lib/router.user.js`. Vue console "Forgot password?" round-trip verified end-to-end against image `0a0e6b32`. New regression spec `ZZ-RouterPasswordResetSpec.js` covers the `Authorization: Bearer null` trigger.
2. **SEC-PII-01** (Phase 2) — Eliminated raw PII/credentials from `lib/thinx/owner.js` logs: 12 leak sites swept (+1 opportunistic 13th) via new `Util.redactEmail` / `Util.redactToken` helpers. Audit-log writes (`alog.log`) now redact reset_keys before CouchDB persistence. Deployed as image `3a461b3d`; `ZZ-OwnerLogRedactionSpec.js` regression coverage in CI.
3. **OPS-01** (Phase 3) — Restored swarm-side autoredeploy on `188.166.23.244` via Rung 1 force-restart of `swarmpit_app` (silent watcher degradation, Swarmpit 1.9). Push-observe SLA: 63s vs ≤300s target (237s under budget). Zero source-code commits. Canonical runbook persisted to `.planning/runbooks/swarm.md`.
4. **SEC-DEP-01** (Phase 4) — Classified 29 GitHub Dependabot alerts via closed-set taxonomy (7 blocker / 19 deferred-stale / 3 deferred-dev-only). 4 surgical `package.json` `overrides` edits shipped atomically (commit `d8e3176c`); runtime-tree `npm audit --omit=dev` high count 9 → 0 on rtm.thinx.cloud. Merged to default branches: PR #539 (master, `465b73c2`) + PR #540 (main, `c0530571`) at 2026-05-26T23:09Z. Swarmpit autoredeploy (Phase 3 confirmation): 49s — beat the Phase 3 baseline by 14s.

**Tech debt carried into v1.x backlog:**

- **Process debt:** Phases 1-3 carry verification evidence in their `SUMMARY.md` `verification:` blocks + supporting `.txt` artifacts but lack structured `*-VERIFICATION.md` artifacts. Functional verification PASS; artifact-location PASS via SUMMARYs.
- **v1.x backlog items filed:** `REFACTOR-05` (jshint/fs-finder runtime-deps misclassification), `SEC-DEP-02` (services/console 15-alert dependency triage), `OPS-02` (stale swarm memberlist `b356ad8e1d60`), `OPS-03` (4 stack services with malformed `<image>@` autoredeploy specs), `AUTH-REACTIVATE-01` (no user-facing soft-deleted account reactivation), `AUTH-RESET-LINK-CONSOLE` (reset email lands on legacy AngularJS console, not Vue), `CONSOLE-LEGACY-JSON-PARSE` (legacy AngularJS console JSON-parse bug), `SEC-PII-02` (historic CouchDB `managed_logs` carry pre-fix raw reset_keys), `TEST-CHAI-01` (chai-http v5 ESM migration locked per AGENTS.md), various `REFACTOR-01..04`.
- **Operator-deferred (paper trail):** Slice 2 (CircleCI as regression gate), Slice 3 (Option C: 22 non-blocker Dependabot alerts left to age out), Slice 4 (Option B: services/console merge-up deferred to sibling-project coordination).

**Companion project:** `services/console` submodule has its own GSD workspace (10 phases shipped + Phase 11 in flight). SEC-DEP-02 trigger + Slice 4 merge-up coordination owed are tracked in `services/console/.planning/v1.x-backlog.md`. Parent-project v1.0 GA tag should coordinate with the console's v1.0 tag.

**Archives:**

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

---
