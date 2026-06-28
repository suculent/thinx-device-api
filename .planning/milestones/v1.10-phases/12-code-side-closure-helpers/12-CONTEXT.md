# Phase 12: Code-side Closure Helpers - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Land 3 small, additive, code-side helpers in this repo BEFORE Phases 13–14 execute the operator runbooks. Each helper is bounded to a new file or a small extension; collectively they enable the OPS phases to lean on CI regression coverage (TEST-WS-01) and automatic Slack receipts (OBS-01), and they add DETECT-only observability for the v1.9 audit-log TTL guarantee (OBS-02).

**In scope:**
- TEST-WS-01: New Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` exercising the rtm-style `/<owner>` and `/<owner>/<timestamp>` upgrade paths via the `ws` client package against an in-process `bootstrap.thx` server.
- OBS-01: Extend `scripts/redact-managed-logs.js` with a Slack notification (via existing `slack-notify` + `SLACK_WEBHOOK` env var) on `--apply` success, `--apply` failure, and `--sample` discovery of raw PII (extra trigger added by user during discussion).
- OBS-02: New `lib/thinx/audit-ttl-probe.js` DETECT-only startup probe + 5-line additive call site in `thinx-core.js` near line 216 (right after the `cert-probe` call site landed in Phase 11) + fixture-based spec `spec/jasmine/ZZ-AuditTTLEvictionSpec.js`.

**Out of scope (deferred):**
- Executing the SEC-WS-01 swarm-host nginx fix (that is Phase 13 OPS-EXEC-01).
- Executing the SEC-PII-02 production sweep (that is Phase 14 OPS-EXEC-02).
- Live-rtm WebSocket probe (Phase 13 covers it).
- Auto-rotation, auto-fix, or any mutation by OBS-02 — DETECT-only per the v1.9 Phase 11 cert-probe precedent.
- Block Kit Slack payloads (OBS-01 stays plain-text `text:` + `slack-notify` `fields:` to match `lib/thinx/notifier.js` convention).
- Broader observability migration (Prometheus, OpenTelemetry, structured logging) — out of v1.10 scope per ROADMAP.md "Out of Scope" table.
- Touching public routes, session surface, owner.js, or any legacy-console-compatible code path.

</domain>

<decisions>
## Implementation Decisions

### OBS-02 — Audit-log TTL Eviction Monitor

- **D-01:** Mirror Phase 11 `cert-probe.js` pattern EXACTLY at the module level — module is PURE/READ-ONLY/NO-LOG/NEVER-throws. Caller in `thinx-core.js` emits the WARN. Source-of-truth Phase 11 D-02 pattern: `cert-probe.js` line 1-38 module-header doc.
- **D-02:** New file `lib/thinx/audit-ttl-probe.js` exporting `async function probeTtlEviction({ couchdbUri, dbName, graceMs, timeoutMs })` → `{ ok, oldestExpiredId, staleByDays, message }`. The result shape mirrors cert-probe's `{ ok, leafIssuer, caContains, message }` — same `ok` semantics: `true` = no warning, `false` = emit WARN, `null` = probe skipped (CouchDB unreachable, timeout, view-not-present).
- **D-03:** CouchDB client = NEW short-lived `nano(db_uri).use(prefix + "managed_logs")` instance inside the probe. Does NOT import `audit.js`'s `loglib` — keeps probe self-contained per cert-probe D-02 ("Allowlist duplication note" — module must have no dependency on bootstrap state).
- **D-04:** Query approach = fetch the oldest expired-but-still-present doc via `_all_docs?include_docs=true&limit=1` with an `endkey` constraint matching `expire_at < (Date.now() - GRACE_MS)`. Use a Mango query OR a filtered view, not a design-doc-dependent path (the SEC-PII-02 design doc `_design/cleanup` may not be installed yet on production CouchDB).
- **D-05:** `GRACE_MS` default = 7 days (per REQUIREMENTS.md OBS-02), overridable via `app_config.audit_ttl_grace_days`. Matches Phase 9 SEC-PII-02 audit-retention parameterization pattern.
- **D-06:** Timeout = 5s default, NOT configurable. Matches cert-probe's implied "trivially testable, no boot blocking" stance. On timeout the probe returns `{ ok: null, message: "probe skipped: CouchDB query timed out at 5000ms" }`.
- **D-07:** Caller wire-in at `thinx-core.js` near line 216 (right after the cert-probe call site at 212-216) — fire-and-forget Promise: `probeTtlEviction(...).then(r => { if (r.ok === false) console.log('⚠️ [warning] ' + r.message); }).catch(_ => {});`. Does NOT `await` — non-blocking. Failure (rejection) is non-fatal and emits NOTHING (so test/dev boots stay clean).
- **D-08:** WARN format: caller emits `console.log("⚠️ [warning] " + probeResult.message)` — verbatim mirror of cert-probe line 215. Message body includes the doc-prefix-redacted `_id` (first 8 chars + ellipsis) and the stale-by-days delta.
- **D-09:** NO Rollbar wiring. Matches Phase 11's resolved decision (cert-probe ships without Rollbar). Rollbar surfacing is a separate concern handled by surrounding plumbing, not this probe.
- **D-10:** Fixture-based spec `spec/jasmine/ZZ-AuditTTLEvictionSpec.js` covers: no-warn (no expired-live docs), single-warn (one stale-expired doc beyond GRACE_MS), timeout-bounded (mock nano returns never-resolving Promise → result `ok: null`), CouchDB-error (mock throws → result `ok: null`). NO live CouchDB. Synthetic doc sets only.
- **D-11:** Spec file naming follows `ZZ-` convention (integration spec touching the live audit DB infrastructure, even though mocked). Matches Phase 9 `ZZ-AuditTTLSpec.js` naming pattern.
- **D-12:** Compatibility constraint — the 5-line additive call site must NOT change any existing behavior in `thinx-core.js`. Cert-probe's additive pattern (lines 211-216) is the literal template.

### OBS-01 — `managed_logs` Cleanup Slack Notification

- **D-13:** Reuse `slack-notify` library (already imported by `lib/thinx/notifier.js:12`). Do NOT introduce a new Slack lib.
- **D-14:** Env var = `SLACK_WEBHOOK` (NOT `SLACK_WEBHOOK_URL` as REQUIREMENTS.md drafted). Correct existing name per `notifier.js:42`. REQUIREMENTS.md will be corrected during plan execution.
- **D-15:** Slack message shape = plain `text:` line + `slack-notify` `fields:` array for failure context — NOT Block Kit. Matches the existing notifier.js + build-notification convention. Block Kit would diverge from the codebase style.
- **D-16:** Channel = `#thinx`, username = `redact-managed-logs`, icon_emoji = `:broom:`. Matches `notifier.js` per-script convention (`notifier.js:49-54`: `text` + `username` + `icon_emoji` + `channel`).
- **D-17:** Triggers (3 total — user added the dry-run sample-discovery trigger during discussion):
  - `--apply` success → ✅ summary
  - `--apply` failure (script-level throw OR sample-verification exits non-zero) → ❌ summary
  - `--sample` (any invocation) detects raw PII shapes still in `managed_logs` → ⚠️ discovery-warning (pre-execution heads-up so the operator is told BEFORE deciding to `--apply`)
- **D-18:** Success text format: `✅ managed_logs redaction complete — {N} scanned / {M} redacted / sample {pass|fail} in {X}ms on {hostShort}`
- **D-19:** Failure text format: `❌ managed_logs redaction FAILED — {stage} on {hostShort}: {errorMessage.slice(0,200)}`
- **D-20:** Discovery text format: `⚠️ managed_logs sample discovered raw PII — {K} of {N} sampled docs contain raw {reset_key|email} on {hostShort} — operator review required (do NOT --apply blindly)`
- **D-21:** Failure `fields:` array: `{ docs_scanned, docs_redacted, stage_reached, snapshot_path (host-only), sample_ids (8-char-prefix only, ≤5 entries) }`. NO full doc IDs. NO credentials. NO email addresses. NO reset_key shapes. The 8-char prefix matches OBS-02 D-08's doc-ID redaction depth.
- **D-22:** `hostShort` = `os.hostname().split('.')[0]` (first-segment only). NOT FQDN. NOT CouchDB URL.
- **D-23:** Missing-webhook handling: `if (!process.env.SLACK_WEBHOOK) { console.log("ℹ️ [info] SLACK_WEBHOOK not set — skipping closure notification"); return; }` — verbatim mirror of `notifier.js:42-45`.
- **D-24:** Slack-POST failure handling: `try/catch` around `slack.send`; `console.log` a single WARN on failure; script-level exit code reflects the redaction outcome ONLY, never the Slack outcome. Matches notifier.js `notifyAppStart` outer `try/catch` pattern (`notifier.js:30-58`).
- **D-25:** New unit spec `spec/jasmine/RedactSlackSpec.js` (non-`ZZ-` prefix — pure unit spec, no router/bootstrap, no CouchDB). Mocks `slack-notify` via a fake substitute. Covers: dry-run posts nothing, apply-success posts once, apply-failure posts once with the failure fields, missing-env no-ops, webhook-500 doesn't crash the script.

### TEST-WS-01 — WebSocket Handshake CI Smoke Probe

- **D-26:** Spec file `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`. `ZZ-` prefix forces alphabetic-sort-last so it runs after unit specs (matches the 15 existing `ZZ-Router*Spec.js` integration specs per TESTING.md §"Test File Organization").
- **D-27:** Client = `ws` package's `new WebSocket(url)`. The package is already a runtime dep (used by `thinx-core.js:274` for the server-side WS handling). Do NOT use chai-http (v4 lacks WS upgrade support — see TESTING.md §"Anti-patterns to avoid").
- **D-28:** Bootstrap = reuse `bootstrap.thx` (matches `ZZ-WebSocketLifecycleSpec.js` Phase 6 + the 14 other `ZZ-*` specs per TESTING.md §"Bootstrap"). The bootstrap's global `afterAll` closes `thx.server`; this spec must NOT call `thx.server.close()` itself.
- **D-29:** URL coverage = 2 positive `it()` blocks:
  - `it("GET /<owner> (WebSocket upgrade)", ...)` against `ws://127.0.0.1:<port>/<envi.oid>`
  - `it("GET /<owner>/<timestamp> (rtm-style WebSocket upgrade)", ...)` against `ws://127.0.0.1:<port>/<envi.oid>/<Date.now()>`
- **D-30:** Port discovery = `bootstrap.thx.server.address().port` (matches `ZZ-WebSocketLifecycleSpec.js` pattern).
- **D-31:** Positive assertion = `ws.on('open', ...)` fires within 5s. The spec is then `expect(true).to.equal(true); done();`.
- **D-32:** Negative-case proof = IMPLICIT via timeout. If the `server.on('upgrade')` registration at `thinx-core.js:466` is removed or breaks, the `open` event never fires → spec times out at 30000ms → spec FAILS. This is documented in the spec header comment with the exact `thinx-core.js:466` line reference. The user explicitly accepted this implicit proof (no separate negative-case `it()` block needed) over the more rigorous explicit-negative-block alternative.
- **D-33:** Cleanup = `ws.close()` in `afterEach`. Do NOT close `thx.server` (bootstrap owns it).
- **D-34:** Timeout per `it()` = `}, 30000);` (matches the codebase convention — TESTING.md §"Patterns enforced": "Every async `it()` ends with `}, 30000);`"). Internal `open`-event timer = 5s (so a failed spec returns within 5s, not 30s).
- **D-35:** Console markers = `🚸 [chai] >>> running WebSocket Handshake (rtm) spec` / `🚸 [chai] <<< completed WebSocket Handshake (rtm) spec` in `beforeAll` / `afterAll`. Matches the 244-marker convention per TESTING.md §"Common Patterns: Console markers".
- **D-36:** Owner ID = `envi.oid` from `spec/_envi.json` (do NOT mutate; per TESTING.md anti-patterns).
- **D-37:** No live rtm probe in this spec. The production rtm-edge handshake is covered by Phase 13's OPS-EXEC-01 post-fix probe (operator-side `wscat` against `wss://rtm.thinx.cloud`). TEST-WS-01 strictly covers the in-process upgrade handler.

### Plan Boundaries + Parallelization

- **D-38 [informational]:** 3 plans, ONE per requirement (parallel-safe — zero file overlap among the 3 per the verified file-touch matrix). Enforced via plan frontmatter (one plan per `requirements_addressed`).
  - **12-01-PLAN.md** — TEST-WS-01 (new spec file only)
  - **12-02-PLAN.md** — OBS-01 (extend `scripts/redact-managed-logs.js` + new `RedactSlackSpec.js`)
  - **12-03-PLAN.md** — OBS-02 (new `lib/thinx/audit-ttl-probe.js` + 5-line additive in `thinx-core.js` near :216 + new `ZZ-AuditTTLEvictionSpec.js` + new `spec/fixtures/audit-ttl/`)
- **D-39 [informational]:** Execution = **Wave 1 parallel** (3 worktrees, 3 atomic GPG-signed commits land on `thinx-staging`). Matches Phase 5 / Phase 8 file-disjoint precedent. Conflict-free per the verified file-touch matrix. User explicitly chose Wave 1 parallel over single-branch sequential. Enforced via plan frontmatter (`wave: 1`, `depends_on: []`).
- **D-40:** No Wave 2 doc-update plan needed (REQUIREMENTS.md `SLACK_WEBHOOK_URL` drift fix is folded into Plan 12-02's commit scope — it ships alongside the OBS-01 implementation, not as a separate doc-update commit).
- **D-41 [informational]:** Test-env ACCEPT pattern carries forward from Phase 5+: local `npm test` aborts on missing `/mnt/data/conf/config.json`; canonical green-gate is CI-side Jasmine inside the Docker test image. Local gates per plan are static (file exists + `node --check` clean + `shellcheck` for any shell artifact). Operational pattern, not plan-cited.
- **D-42 [informational]:** All commits GPG-signed (matches the v1.9 default; current `commit.gpgsign=true` confirmed). Enforced via git config, not plan citation.
- **D-43 [informational]:** Compatibility constraint (carries forward): every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks. All 3 helpers are additive and do not touch any router or session surface. Enforced via verify-phase compatibility audit.

### Claude's Discretion

- **Internal probe-query batching for OBS-02:** whether to issue ONE CouchDB query or TWO (one for the count, one for the oldest doc). Plan picks the most efficient single-query shape that returns both pieces of information (likely `_all_docs?include_docs=true&limit=1` with `endkey` constraint and a `total_rows` field check). Defer to planner.
- **Slack `slack-notify` mock pattern for OBS-01 unit spec:** whether to use `require.cache` substitution OR an injection-point parameter on the redaction module's notification helper. Defer to planner; both work, prefer whichever is easier to assert on.
- **OBS-02 fixture corpus shape:** synthetic CouchDB doc objects (just JS objects with `_id`, `expire_at`, `mtime`, `owner` fields) in `spec/fixtures/audit-ttl/` as JSON or inline in the spec? Defer to planner; matches Phase 11 `spec/fixtures/cert-probe/` pattern if static files preferred.
- **TEST-WS-01 plan vs `ZZ-WebSocketLifecycleSpec.js` overlap:** whether to extract a shared WS-helper module (e.g., `spec/helpers/ws-handshake.js`) to dedupe between this spec and the Phase 6 spec. Defer to planner; recommendation: NO extraction this phase (premature; only 2 specs).
- **Plan 12-03 fixture-script convention:** whether to add a `generate.sh` helper for OBS-02 fixtures (Phase 11 added one for cert-probe fixtures). Defer to planner; fixtures here are pure JS objects, no openssl-style regeneration needed, probably no `generate.sh` required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 anchors
- `.planning/ROADMAP.md` — Phase 12 details (Code-side Closure Helpers)
- `.planning/REQUIREMENTS.md` — TEST-WS-01, OBS-01, OBS-02 acceptance criteria
- `.planning/PROJECT.md` — v1.10 milestone goal + Validated Requirements (v1.9 closures)
- `.planning/MILESTONES.md` — v1.9 accomplishments referenced by Phase 12 helpers

### Phase 11 cert-probe (OBS-02 template)
- `lib/thinx/cert-probe.js` — STRUCTURAL TEMPLATE for OBS-02 probe (PURE/READ-ONLY/NO-LOG/NEVER-throws). Module-header doc lines 1-38 are required reading.
- `thinx-core.js:211-216` — Cert-probe call site; OBS-02 wires in immediately after (same pattern, additive 5 lines).
- `spec/jasmine/ZZ-CertProbeSpec.js` — Spec template for OBS-02 (fixture-based, 4 it blocks). Same naming/structure pattern.
- `spec/fixtures/cert-probe/` — Fixture directory precedent (OBS-02 follows this if static fixtures preferred over inline).
- `.planning/milestones/v1.9-phases/11-build-cert-hygiene/11-CONTEXT.md` — Phase 11 decisions D-01 and D-02 (PURE module + duplication-note) — the rationale OBS-02 inherits.

### Phase 9 redact-managed-logs (OBS-01 target)
- `scripts/redact-managed-logs.js` — TARGET file (extend with Slack notification on 3 triggers).
- `lib/thinx/audit.js` — SEC-PII-02 audit-log TTL (`_buildRecord` + `_retentionDays`); OBS-02 verifies the `expire_at` field this code writes.
- `.planning/runbooks/managed-logs-redaction.md` — Operator runbook (referenced by OBS-01 Slack messages; Phase 14 executes against it).
- `.planning/milestones/v1.9-phases/09-historic-pii-redaction-managed-logs/09-CONTEXT.md` — Phase 9 decisions (script invariants, sampling pattern, GDPR posture).

### Existing Slack wiring (OBS-01 reuse)
- `lib/thinx/notifier.js:1-58` — `notifyAppStart` is the PATTERN MATCH: `slack-notify`, `SLACK_WEBHOOK` env var, `text` + `username` + `icon_emoji` + `channel: "#thinx"`, outer `try/catch`, silent no-op on missing webhook.
- `lib/thinx/notifier.js:66-95` — `notificationObject` shows the `fields:` array pattern for structured per-build context.
- `package.json` — `slack-notify` dep declaration.

### Phase 6 WS lifecycle spec (TEST-WS-01 precedent)
- `spec/jasmine/ZZ-WebSocketLifecycleSpec.js` — RAW-socket variant (tests aborted upgrades via `net.connect`). TEST-WS-01 uses a DIFFERENT client (the `ws` package) because it tests SUCCESSFUL handshakes, not aborts.
- `thinx-core.js:466-516` — WebSocket upgrade handler (the surface TEST-WS-01 exercises). Line 466 (`server.on('upgrade')`) is the regression-target; removing it makes TEST-WS-01 time out.
- `.planning/runbooks/websocket-handshake.md` — SEC-WS-01 operator runbook (Phase 13 executes against it; TEST-WS-01 ensures CI catches any future regression of the upgrade handler).
- `.planning/milestones/v1.9-phases/06-websocket-surface-hardening/06-CONTEXT.md` — Phase 6 REFACTOR-03 decisions (raw-socket close handler at thinx-core.js:494-498).

### Testing conventions (all 3 plans)
- `.planning/codebase/TESTING.md` — Jasmine 5.12 / chai 4.5 / chai-http v4 LOCKED / 30s `it()` timeouts / `🚸 [chai] >>>` markers / `bootstrap.thx` shared init / `spec/_envi.json` fixtures (`envi.oid`, `envi.dynamic`).
- `spec/helpers/bootstrap.js` — Shared THiNX init for all `ZZ-*` specs.
- `spec/_envi.json` — `oid`, `dynamic`, `dynamic2` test identities.
- `spec/support/jasmine.json` — Spec config (timeout 10000 default, `random: false`, `stopSpecOnExpectationFailure: false`).

### Codebase maps (general orientation)
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`

### Project locks / constraints
- `AGENTS.md:82-92` — chai-http v4 LOCK (do NOT upgrade to v5; TEST-WS-01 must use `ws` package, not chai-http).
- `AGENTS.md` (parent) — ssh details, deploy flow, dependency locks.
- `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/couchdb-access.md` — operator-side CouchDB access pattern (referenced by OBS-02 if planner needs to validate Mango query shape against production schema).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`lib/thinx/cert-probe.js` module shape** — Phase 11's PURE/READ-ONLY/NO-LOG/NEVER-throws pattern is the literal template for OBS-02. Result-object shape, module-header doc style, call-site pattern (caller emits WARN) all directly copyable.
- **`lib/thinx/notifier.js` Slack wiring** — `notifyAppStart` is the reference implementation for OBS-01: `slack-notify` import, `SLACK_WEBHOOK` env-var check, send pattern, outer try/catch. OBS-01 can be implemented as a near-clone with different `text` + `fields` content.
- **`spec/helpers/bootstrap.js`** — Reused by TEST-WS-01 (matches the 15 existing `ZZ-*` specs).
- **`spec/_envi.json:oid`** — Reused as the `<owner>` segment in TEST-WS-01's URL.
- **`scripts/redact-managed-logs.js`** — OBS-01 extension target. The script already has `--apply` / `--dry-run` / `--sample` mode handling per Phase 9 SEC-PII-02 invariants.
- **`lib/thinx/audit.js:_buildRecord`** — OBS-02 verifies the `expire_at` field this method writes (90-day default per `_retentionDays`).

### Established Patterns

- **DETECT-only OPS probes** — Phase 11 codified this. Probes surface drift; OPS executes the fix. OBS-02 inherits the stance.
- **Caller emits WARN; probe stays pure** — Phase 11 D-02. Keeps modules trivially testable, prevents log spam during unit specs.
- **Fixture-based specs for OPS-adjacent modules** — `cert-probe` + `audit-ttl-probe` both run as PURE unit modules with no live infrastructure dependency. Specs use synthetic doc / cert objects.
- **Same-Slack-channel multi-script notifications** — `#thinx` is the canonical channel; each script gets a distinct `username` per the build-notification convention (`notifier.js`, `redact-managed-logs` would join it).
- **Plain-text + `fields:` array for structured context** — `slack-notify` API. NOT Block Kit (the codebase doesn't use it).
- **Bootstrap-shared `bootstrap.thx` for `ZZ-*` specs** — Single THiNX server instance across the integration suite. Spec does NOT call `thx.server.close()` itself.
- **Console markers `🚸 [chai] >>>` and `🚸 [chai] <<<`** — 244 occurrences across the suite per TESTING.md; mandatory in new specs.
- **30-second `it()` timeouts** — Per TESTING.md; cold DB calls in CI sometimes exceed 10s.

### Integration Points

- **OBS-02 → `thinx-core.js` near :216** — 5 lines, additive, immediately after the cert-probe call site. Zero existing-behavior change.
- **OBS-01 → `scripts/redact-managed-logs.js`** — Extend in-place. New helper function `postSlackSummary(payload)` called at 3 trigger points; new top-level `process.env.SLACK_WEBHOOK` early-exit check at the trigger sites.
- **TEST-WS-01 → `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`** — NEW file. Reads `bootstrap.thx.server.address().port`. No code change to `thinx-core.js`.
- **OBS-02 ↔ OBS-01 doc-ID redaction depth** — Both use 8-char prefix + ellipsis. Same constant; potentially share a helper (planner's discretion).

</code_context>

<specifics>
## Specific Ideas

- **User added a 3rd Slack trigger for OBS-01 during discussion**: `--sample` invocation (any mode) that detects raw PII still in `managed_logs` posts a discovery-warning to Slack. Rationale: Slack gets a pre-execution heads-up before the operator decides to `--apply`, not just an after-the-fact closure receipt. Captured as D-17 / D-20.
- **User explicitly accepted the implicit negative-case proof for TEST-WS-01** (timeout-on-missing-handler) over the more rigorous explicit-negative-block alternative. Rationale: simpler spec, tighter scope; the timeout failure mode is sufficient to catch a removed `server.on('upgrade')` registration. Captured as D-32.
- **User chose Wave 1 parallel over single-branch sequential** for the 3 plans. Rationale: zero file overlap among plans makes parallel safe; matches Phase 5 / Phase 8 precedent for file-disjoint plans. Captured as D-39.
- **OBS-02 mirrors Phase 11 cert-probe EXACTLY** — user chose "Lock as proposed" with all 11 sub-decisions in the proposed table. No deviations. Captured as D-01 through D-12.

</specifics>

<deferred>
## Deferred Ideas

- **Probe metric/log to Prometheus or InfluxDB** (carry-over from Phase 11 deferred ideas, applies to OBS-02 as well): Surface the OBS-02 WARN signal to monitoring. Out of v1.10 scope. v2 candidate.
- **Auto-rotate `_design/cleanup` view on probe detection of missing view**: OBS-02 could auto-install the SEC-PII-02 design doc if it's not present. Out of scope — DETECT-only stance per Phase 11 pattern.
- **CouchDB cron infrastructure for auto-eviction**: Currently the SEC-PII-02 TTL relies on operator-side cron (per Phase 9 runbook). Migration to a CouchDB-native nightly auto-eviction is a v2+ candidate.
- **Block Kit Slack payloads project-wide**: Migrate `notifier.js` + `redact-managed-logs.js` + future scripts to Slack Block Kit. Out of scope — codebase convention is text + `fields:`. Migration would be a separate observability phase in v2.
- **Shared `spec/helpers/ws-handshake.js`**: Extract a reusable WS-client helper to dedupe between `ZZ-WebSocketHandshakeRtmSpec.js` (TEST-WS-01) and a future spec. Premature with only 2 WS specs.
- **`spec/fixtures/audit-ttl/generate.sh`**: Phase 11 added a regeneration helper for cert-probe fixtures (openssl-driven). OBS-02 fixtures are pure JS objects (synthetic CouchDB docs), so no regeneration script is needed. Captured here in case a future spec needs Mango-query fixture corpora derived from production schema.
- **Cross-script Slack channel routing**: Different scripts could route to different Slack channels (e.g., `#thinx-ops` vs `#thinx-incidents`). Out of scope — single `#thinx` channel matches the existing convention.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 12 scope (todo.match-phase returned 0 matches).

</deferred>

---

*Phase: 12-code-side-closure-helpers*
*Context gathered: 2026-06-04*
