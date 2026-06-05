# Phase 12: Code-side Closure Helpers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 12-code-side-closure-helpers
**Areas discussed:** OBS-02 fidelity to Phase 11 cert-probe pattern, OBS-01 Slack payload shape, TEST-WS-01 scope + regression-proof, Plan boundaries + parallelization

---

## OBS-02 fidelity to Phase 11 cert-probe pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Lock as proposed | Mirror Phase 11 cert-probe pattern + the 11 sub-decisions in the table (PURE module, fire-and-forget async caller, new short-lived nano client, 7d GRACE_MS, 5s timeout, NO Rollbar, fixture-based spec). | ✓ |
| Lock with GRACE_MS = 14 days instead of 7 | Bump GRACE_MS default to 14d to absorb longer compaction windows / unhealthy-cluster lag. App-config override stays. | |
| Reuse audit.js loglib instead of new client | `require('./audit.js').loglib` inside the probe instead of a fresh `nano(...).use(...)`. Tighter coupling; no new connection pool; weaker self-containment. | |
| Adjust further | Different signature, query shape, timeout, Rollbar opt-in, doc-ID redaction depth, or other adjustment. | |

**User's choice:** Lock as proposed
**Notes:** No deviation from the proposed table. All 11 sub-decisions inherit: PURE/READ-ONLY/NO-LOG/NEVER-throws module per Phase 11 cert-probe D-02; async signature with `{ couchdbUri, dbName, graceMs, timeoutMs }` parameter; new short-lived `nano(db_uri).use(prefix + "managed_logs")` instance for self-containment; `endkey` query approach independent of `_design/cleanup` view installation state; fire-and-forget Promise call site in `thinx-core.js` near line 216; verbatim `⚠️ [warning]` WARN format mirroring cert-probe line 215; no Rollbar wiring; fixture-based spec covering no-warn / single-warn / timeout-bounded / CouchDB-error branches; doc-prefix-only ID redaction (8-char + ellipsis).

---

## OBS-01 Slack payload shape

| Option | Description | Selected |
|--------|-------------|----------|
| Lock as proposed | Plain-text + `fields:` for failure context; reuse `SLACK_WEBHOOK` env var; reuse `slack-notify` lib; 8-char doc-ID prefix redaction; `#thinx` / `:broom:` / `redact-managed-logs`. | |
| Lock but ALSO post on dry-run --sample failures | Same as proposed plus a 3rd trigger: dry-run `--sample` that uncovers raw PII via sample-check posts a discovery warning to Slack (pre-execution heads-up). | ✓ |
| Use Block Kit (richer structured layout) | Switch to Slack Block Kit (header / divider / fields blocks). Diverges from this codebase's text-first convention in notifier.js. | |
| Adjust further | Different channel, emoji, failure-detail depth, additional triggers. | |

**User's choice:** Lock but ALSO post on dry-run --sample failures
**Notes:** User explicitly added a 3rd Slack trigger beyond the original `--apply` success / `--apply` failure pair. Rationale: the operator wants a pre-execution heads-up via Slack if a future `--sample` invocation discovers raw PII still in `managed_logs` — that way the discovery is surfaced BEFORE the operator decides to `--apply`. Captured as D-17 / D-20 in CONTEXT.md (discovery text format: `⚠️ managed_logs sample discovered raw PII — {K} of {N} sampled docs contain raw {reset_key|email} on {hostShort} — operator review required (do NOT --apply blindly)`). Also confirmed during this discussion that the actual env var is `SLACK_WEBHOOK` (not `SLACK_WEBHOOK_URL` as REQUIREMENTS.md drafted). The drift fix is folded into Plan 12-02's commit scope, not a separate doc-update commit.

---

## TEST-WS-01 scope + regression-proof

| Option | Description | Selected |
|--------|-------------|----------|
| Lock as proposed (timeout = negative proof) | 2 positive `it()` blocks covering `/<owner>` and `/<owner>/<timestamp>`. The timeout-on-removed-handler is the implicit negative-case proof, documented in the spec header. | ✓ |
| Lock + add explicit negative-case it() block | Same 2 positive blocks + a 3rd `it()` that opens against a path the server doesn't handle and asserts `error` fires. More explicit regression proof; slightly more coupled to upgrade-handler error semantics. | |
| Skip /<owner>/<timestamp>; just cover /<owner> | Tighter scope. The rtm-style path is exercised by Phase 13's live probe anyway; the in-process spec covers the simpler upgrade-handler invocation. | |
| Adjust further | Different bootstrap approach, URL set, raw net.connect for parity with Phase 6, etc. | |

**User's choice:** Lock as proposed (timeout = negative proof)
**Notes:** Simplest, tightest spec. The timeout failure mode is sufficient to catch a removed `server.on('upgrade')` registration at `thinx-core.js:466`. Documented in the spec header with the exact line reference. No 3rd negative-case `it()` block needed. Both URL shapes (`/<owner>` and `/<owner>/<timestamp>`) covered to ensure the rtm-style segment matching is exercised by CI (not just the basic single-segment path).

---

## Plan boundaries + parallelization

| Option | Description | Selected |
|--------|-------------|----------|
| 3 plans, Wave 1 parallel (Recommended) | Matches Phase 5 / Phase 8 file-disjoint precedent. 3 worktrees execute simultaneously; 3 atomic GPG-signed commits land on thinx-staging. Fastest wall-clock; conflict-free per the file-touch matrix. | ✓ |
| 3 plans, single-branch sequential | Matches Phase 7 precedent (same-file sweeps). One worktree; risk-ascending order TEST-WS-01 → OBS-01 → OBS-02. Slower but cleanest linear history. | |
| 2 plans: TEST-WS-01 alone + (OBS-01 + OBS-02) together | Group the two observability helpers into one plan, leave TEST-WS-01 separate. Trades atomic-revertability for fewer commits. | |
| Adjust further | Different boundary or sequencing. | |

**User's choice:** 3 plans, Wave 1 parallel (Recommended)
**Notes:** File-touch matrix verified during discussion: TEST-WS-01 touches only `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`; OBS-01 touches `scripts/redact-managed-logs.js` + `spec/jasmine/RedactSlackSpec.js`; OBS-02 touches `lib/thinx/audit-ttl-probe.js` (new) + `thinx-core.js` (5-line additive at ~216) + `spec/jasmine/ZZ-AuditTTLEvictionSpec.js` (new) + `spec/fixtures/audit-ttl/` (new). Zero overlap among the 3 plans, so parallel worktrees are conflict-free. Matches the precedent set by Phase 5 (3 Wave 1 parallel + 1 Wave 2 doc-update) and Phase 8 (2 Wave 1 parallel, zero file overlap).

---

## Claude's Discretion

The following areas were deferred to the planner during write_context, not the user:

- Internal probe-query batching for OBS-02 (1 vs 2 CouchDB queries) — planner picks the single-query shape that returns both pieces of information.
- `slack-notify` mock pattern for OBS-01 unit spec (require.cache substitution vs injection-point parameter) — planner picks whichever is easier to assert on.
- OBS-02 fixture corpus shape (static JSON files vs inline synthetic objects in the spec) — planner picks; static-file precedent at `spec/fixtures/cert-probe/` from Phase 11.
- TEST-WS-01 ↔ `ZZ-WebSocketLifecycleSpec.js` helper extraction — planner picks; recommendation is NO extraction this phase (premature with only 2 WS specs).
- Fixture-script convention (`generate.sh`) for OBS-02 — planner picks; likely not needed since fixtures are pure JS objects.

## Deferred Ideas

Captured in CONTEXT.md under `<deferred>` block. Summary:

- Probe metric/log to Prometheus or InfluxDB (carries from Phase 11; applies to OBS-02 too) — v2 candidate.
- Auto-rotate `_design/cleanup` view on probe detection — out of scope, DETECT-only.
- CouchDB cron infrastructure for auto-eviction — v2+ candidate.
- Block Kit Slack payloads project-wide — out of scope, codebase convention is text + fields.
- Shared `spec/helpers/ws-handshake.js` extraction — premature with only 2 WS specs.
- `spec/fixtures/audit-ttl/generate.sh` regeneration helper — not needed for pure JS fixtures.
- Cross-script Slack channel routing — out of scope, single `#thinx` channel by convention.
