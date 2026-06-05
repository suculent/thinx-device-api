# Requirements: THiNX Device API — v1.10 Operational Closures

**Defined:** 2026-06-04
**Core Value:** Ship the two deferred operator-runbook executions from v1.9 (SEC-WS-01 edge handshake fix on `rtm.thinx.cloud` + SEC-PII-02 `managed_logs` production sweep) in a single focused session, alongside small code-side helpers that make the executions safer and the closures observable. Every public route the Vue console relies on continues to work with no signature breaks.

## v1.10 Requirements

Requirements scoped to v1.10. Each maps to exactly one roadmap phase. OPS-EXEC-* opens a new namespace for runbook-execution closures (distinct from OPS-* which was used for swarm-fix work in v1.0). OBS-* opens a new observability namespace. TEST-WS-* opens a new namespace for WebSocket-handshake test infrastructure.

### Operational Closures (runbook executions)

- [x] **OPS-EXEC-01**: Execute SEC-WS-01 closure on the swarm host per `.planning/runbooks/websocket-handshake.md`. Apply the nginx `location ~ ^/[^/]+(/[0-9]+)?$` upgrade block to the rtm reverse-proxy config; verify `nginx -t` passes; reload nginx; persist the config change with a version-controlled trail (commit the swarm-host config snippet under `.planning/runbooks/` or wherever swarm configs live in this repo's ops trail). Validated by: (a) `wscat -c wss://rtm.thinx.cloud/<owner>/<timestamp>` from a fresh Vue session returns `101 Switching Protocols` (post-fix probe matches the runbook's 7-row reproduction table), (b) Vue console WebSocket subscribe + initial-state-fetch round-trip completes end-to-end against rtm, (c) `nginx -T | grep -A5 '^[[:space:]]*location ~ \^/'` on the swarm host shows the new block, (d) runbook updated with the execution-timestamp + post-fix probe output appended.

- [x] **OPS-EXEC-02**: Execute SEC-PII-02 closure against production CouchDB `managed_logs` per `.planning/runbooks/managed-logs-redaction.md`. Stage: snapshot to JSONL forensic dump → dry-run review → `--apply` with `--snapshot-to <path>` → `--sample 1000` verification → CouchDB compaction. The execution covers ~658k pre-Phase-2 docs. **Verified 2026-06-05 (discrepancy branch — see runbook Execution Annex):** the ~658k historic corpus was already deleted out-of-band (656,697 tombstones; 2,183 live docs remained); a redactor field-scoping bug (SEC-PII-02b — the all-fields walk false-matched the legitimate 64-hex `owner` hash) was fixed in-flight and 422 genuine `reset_key` leaks in the live `message` field were redacted (snapshot + apply + `--sample` exit 0); compaction completed. Validated by: (a) sampling N=1000 random recent + N=1000 random old `managed_logs` docs returns zero raw 64-char hex `reset_key` shapes and zero raw email shapes (the `--sample` subcommand exits 0), (b) the JSONL forensic dump exists at the documented `--snapshot-to` path and is referenced in the runbook execution annex, (c) CouchDB compaction completes and the database disk size drops by the expected delta, (d) runbook updated with the execution-timestamp + sample-result + delta figure appended.

### Observability & Test Helpers (opportunistic code adds)

- [x] **TEST-WS-01**: WebSocket handshake CI smoke probe. New Jasmine spec `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` (or equivalent) that exercises the rtm-style `/<owner>(/<timestamp>)?` URL path against an in-process WebSocket server. The spec asserts a `101 Switching Protocols` response on the upgrade so any future regression of the SEC-WS-01 fix surfaces at CI rather than at user-report. NOT a live-rtm probe — the production-side handshake is a swarm-host nginx concern and is covered by the runbook + OPS-EXEC-01's verification step. Validated by: (a) the new spec fails when the upgrade handler is removed (negative-case proof), (b) the spec passes in CI on `thinx-staging`, (c) the spec runs without touching any swarm-side resource (in-process only).

- [x] **OBS-01**: `managed_logs` cleanup Slack notification. Extend `scripts/redact-managed-logs.js` to POST a one-message completion summary to the existing Slack outage-notifier webhook on successful `--apply` runs (and an error summary on failure). The summary includes: docs scanned, docs redacted, sample-result verdict, runtime, environment (host + couchdb URL host-only — NO credentials, NO raw doc IDs). Webhook URL is read from the same env var the outage notifier uses (`SLACK_WEBHOOK` per current node-redis-incident wiring — env var name verified against lib/thinx/notifier.js:42). Failure to reach Slack must NOT block the script's normal exit. Validated by: (a) a `--dry-run` execution does NOT post (read-only mode stays read-only), (b) an `--apply` execution posts exactly one message on success and exactly one message on failure (covered by a unit-spec mocking the webhook), (c) missing-webhook-env exit path is graceful (script-level WARN, no crash, no Slack call attempted), (d) no PII or credentials appear in any captured message body in the unit spec.

- [x] **OBS-02**: Audit-log TTL eviction monitor. The v1.9 Phase 9 audit-log forward-TTL writes `expire_at` on every `audit.js` record (90-day default). v1.10 adds a startup-time DETECT-only check that asserts CouchDB is actually evicting `expire_at`-stamped docs at the boundary — surfaces a startup WARN if the oldest live `managed_logs` doc has `expire_at < Date.now() - GRACE_MS` (GRACE_MS default 7 days, to absorb compaction lag). NOT a fix — surfaces drift so the operator can investigate (analogous to THINX-CERT-CHECK-01's DETECT-only posture). Validated by: (a) fixture-based unit spec (`ZZ-AuditTTLEvictionSpec.js`) covers the matcher against synthetic doc sets (no live CouchDB), (b) startup with no expired live docs emits no warning, (c) startup with a stale-expired doc beyond GRACE_MS emits a single WARN naming the oldest `_id` (redacted form: doc-prefix-only) + the stale-by-days delta, (d) the probe runs once at startup and does not block boot (timeout-bounded; failure is non-fatal).

## Future Requirements

<!-- Tracked but explicitly deferred from v1.10. Promote in a future milestone. -->

- **fs-finder removal sweep** — still v1.x candidate; deferred from v1.9 Phase 5 REFACTOR-05 (5 active runtime call sites in `lib/`). Sequenced after v1.10 closes the ops loop.
- **Fresh Dependabot triage** — 5 new alerts (2H/3M) surfaced on default branch during the v1.9 push. Triage deferred to v1.11 or a quick-task incident response window.
- **TEST-CHAI-01** — chai-http v5 ESM migration. Still locked per AGENTS.md. Third milestone of deferral — v1.11 planning should make a deliberate keep/drop call.
- **OPS-02** — stale swarm memberlist entry `b356ad8e1d60`. Pure OPS; carries swarm-fabric risk; deferred. Third milestone of deferral.
- **OPS-03** — 4 stack services with malformed `<image>@` autoredeploy specs. Pure OPS edit; not codebase. Third milestone of deferral.
- **CONSOLE-LEGACY-JSON-PARSE** — sibling-project scope (`services/console/.planning/`); not a parent-repo requirement. Third milestone of deferral.

## Out of Scope

Explicitly excluded from v1.10. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New backend feature work | v1.10 is execution-and-closure focused, not feature-additive |
| Multi-tenant revamp / v2 API features | Future major milestone |
| Edge layer redesign (Traefik labels beyond OPS-EXEC-01's specific nginx `location` block) | OPS scope; only OPS-EXEC-01 touches edge config and only at the exact `location` block the runbook documents |
| ACME / Let's Encrypt automation rewrite | Lives on the swarm host (`/etc/letsencrypt/`, cron + ACME client) — outside this codebase. v1.9 Phase 11 THINX-CERT-CHECK-01 is the standing codebase angle (DETECT-only). |
| Deep `services/console` work | Sibling-project GSD scope |
| Swarm memberlist cleanup (OPS-02), stack yml `<image>@` cleanup (OPS-03) | Pure OPS; deferred (see Future Requirements) |
| `thinx_worker` silent-loop on `docker pull` (G10) | Worker repo — different codebase |
| New observability tooling beyond OBS-01/OBS-02 (Prometheus, structured logging migration, OpenTelemetry, etc.) | v1.10 is scoped to the two closure-helpers only; broader observability is a v2 candidate |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-WS-01 | Phase 12 | Complete |
| OBS-01 | Phase 12 | Complete |
| OBS-02 | Phase 12 | Complete |
| OPS-EXEC-01 | Phase 13 | Verified |
| OPS-EXEC-02 | Phase 14 | Verified |

**Coverage:**
- v1.10 requirements: 5 total
- Mapped to phases: 5/5 ✓
- Verified: 0
- Pending: 5
- Unmapped: 0

---
*Requirements defined: 2026-06-04 (milestone start). Roadmap mapped 2026-06-04 — 3 phases (12–14), 5/5 requirements covered. See `.planning/ROADMAP.md`.*
