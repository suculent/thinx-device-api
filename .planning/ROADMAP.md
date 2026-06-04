# Roadmap: THiNX Device API — v1.10 Operational Closures

**Created:** 2026-06-04
**Milestone:** v1.10 — Operational Closures
**Mode:** continuation (v1.9 ended at Phase 11; v1.10 begins at Phase 12)
**Granularity:** coarse
**Phases:** 3 (Phases 12–14)
**Requirement Coverage:** 5/5 ✓

## Project Reference

- **Core Value:** Ship the two deferred operator-runbook executions from v1.9 (SEC-WS-01 edge handshake fix on `rtm.thinx.cloud` + SEC-PII-02 `managed_logs` production sweep) in a single focused session, alongside small code-side helpers that make the executions safer and the closures observable. Every public route the Vue console relies on continues to work with no signature breaks.
- **Project context:** `.planning/PROJECT.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Milestones index:** `.planning/MILESTONES.md`
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace
- **Previous milestone:** `.planning/milestones/v1.9-ROADMAP.md` (last phase = Phase 11)

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1–4 (shipped 2026-05-27)
- ✅ **v1.9 — Backend Hygiene & Posture** — Phases 5–11 (shipped 2026-06-04)
- 🚧 **v1.10 — Operational Closures** — Phases 12–14 (in planning)

## Phases

- [x] **Phase 12: Code-side Closure Helpers** ✅ — Shipped the 3 in-codebase helpers (TEST-WS-01 spec, OBS-01 Slack notification + SLACK_WEBHOOK drift fix, OBS-02 audit-TTL eviction probe). Verified 2026-06-04 (3/3 reqs verified via goal-backward checks; 3 plans Wave 1 parallel; 7 atomic GPG-signed commits + 3 merge commits on `thinx-staging`).
- [ ] **Phase 13: SEC-WS-01 Edge Handshake Closure (OPS-EXEC-01)** — Single-session swarm-host execution of the `.planning/runbooks/websocket-handshake.md` operator action: pre-fix probe → nginx `location` block edit → `nginx -t` + reload → post-fix probe → runbook execution annex. Persist the config-change trail in version control under `.planning/runbooks/`.
- [ ] **Phase 14: SEC-PII-02 Production managed_logs Sweep Closure (OPS-EXEC-02)** — Single-session production sweep per `.planning/runbooks/managed-logs-redaction.md`: pre-flight checklist → dry-run scan → snapshot + `--apply` → `--sample 1000` zero-leak gate → CouchDB compaction → runbook execution annex. Leans on the OBS-01 Slack notification shipped in Phase 12 to deliver the closure receipt.

## Phase Details

### Phase 12: Code-side Closure Helpers
**Goal:** Land the three small code-side helpers (in-process WS CI smoke spec, `managed_logs` Slack notification, audit-TTL eviction monitor) BEFORE the operator-runbook executions in Phases 13–14, so the OPS phases can rely on (a) CI regression coverage for SEC-WS-01, and (b) an automatic Slack closure receipt for SEC-PII-02.
**Depends on:** Nothing (parallel-safe with all other v1.10 phases; sequenced FIRST so OBS-01 is available before Phase 14 runs)
**Requirements:** TEST-WS-01, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. A new Jasmine spec (`spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`) exercises the rtm-style `/<owner>(/<timestamp>)?` upgrade against an in-process WebSocket server; it FAILS when the upgrade handler is removed (negative-case proof) and PASSES under the canonical CI green-gate on `thinx-staging`. No swarm-side resource is touched.
  2. `scripts/redact-managed-logs.js` posts exactly one Slack summary to `SLACK_WEBHOOK` on `--apply` success and exactly one error summary on `--apply` failure (covered by a unit spec mocking the webhook); `--dry-run` posts nothing; missing-webhook-env exits gracefully (script-level WARN, no crash); no PII, no credentials, no raw doc IDs appear in any captured message body in the unit spec.
  3. A new DETECT-only module (`lib/thinx/audit-ttl-probe.js` or equivalent) is wired additively into `thinx-core.js` (5-ish-line call site, analogous to Phase 11 `cert-probe.js`); startup with no expired-live docs emits no warning; startup with a stale-expired doc beyond `GRACE_MS` (default 7 days) emits a single WARN naming the oldest `_id` (doc-prefix-only redacted form) plus the stale-by-days delta. Probe is timeout-bounded, non-fatal, and does NOT block boot.
  4. A fixture-based unit spec (`spec/jasmine/ZZ-AuditTTLEvictionSpec.js`) covers the matcher against synthetic doc sets (no live CouchDB) — exercising the no-warn, single-warn, and timeout-bounded branches.
  5. CircleCI green on the merge to `thinx-staging`; no signature break on any legacy-console-compatible route the Vue console inherited.
**Plans:** TBD
**Phase notes:**
  - **Sequencing intent:** Phase 12 lands BEFORE Phases 13–14 specifically so OBS-01 (Slack receipt) is wired into `redact-managed-logs.js` before the Phase 14 production sweep invokes the script — the operator wants the closure receipt to land in Slack automatically, not as an after-the-fact paste-in.
  - **TEST-WS-01 is in-process only:** the spec exercises the rtm-style URL shape against an in-process WS server (the existing `ZZ-WebSocketLifecycleSpec.js` pattern from Phase 6 is the precedent). The actual rtm-edge handshake is covered by OPS-EXEC-01's post-fix probe step in Phase 13.
  - **OBS-02 follows the v1.9 Phase 11 THINX-CERT-CHECK-01 pattern:** new module, 5-ish-line additive call site in `thinx-core.js`, DETECT-only (no auto-fix), fixture-based spec, non-fatal on boot. Reuse the same posture and test scaffolding.
  - **OBS-01 Slack failure must NOT block script exit:** the script's normal exit code must reflect the redaction outcome, not the Slack POST outcome. Cover this with a unit-spec branch (mocked webhook returns 500 → script exits 0 on otherwise-successful `--apply`).
  - **Compatibility constraint:** every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks. The 3 helpers are all additive and do not touch any router or session surface.

### Phase 13: SEC-WS-01 Edge Handshake Closure (OPS-EXEC-01)
**Goal:** Execute the swarm-host nginx `location` block fix per `.planning/runbooks/websocket-handshake.md` in a single focused session; verify the post-fix probe returns 101 from a fresh Vue session against `rtm.thinx.cloud`; persist the config-change trail in version control so the swarm-host edit has a documented audit history.
**Depends on:** Phase 12 (TEST-WS-01 in-process spec exists so any future regression of the fix surfaces at CI, not user-report)
**Requirements:** OPS-EXEC-01
**Success Criteria** (what must be TRUE):
  1. `wscat -c wss://rtm.thinx.cloud/<owner>/<timestamp>` from a fresh Vue session returns `101 Switching Protocols` (post-fix probe matches the runbook's 7-row reproduction table — row 7 transitions from `404 Server: nginx` to `101 Switching Protocols` or `401 Unauthorized` with helmet CSP+CORS headers).
  2. Vue console WebSocket subscribe + initial-state-fetch round-trip completes end-to-end against rtm (DevTools Network tab, filter on WS, status `101 Switching Protocols`; no console-side error in the bundle).
  3. `nginx -T | grep -A5 '^[[:space:]]*location ~ \^/'` on the swarm host shows the new `location ~ ^/[^/]+(/[0-9]+)?$` block ordered AFTER the more-specific `/api/` and `/static/` blocks but BEFORE the catch-all `location /` block; `nginx -t` returned `test is successful` before reload.
  4. `.planning/runbooks/websocket-handshake.md` is updated with an execution annex: execution-timestamp (UTC), the captured pre-fix probe output (bare `Server: nginx` 404), the captured post-fix probe output (101 / 401 with helmet headers), and the operator initials. Annex is committed on `thinx-staging` with a GPG-signed commit.
  5. The swarm-host nginx config snippet is persisted under `.planning/runbooks/` (or wherever swarm configs live in this repo's ops trail) so the change has a version-controlled trail — not just a runbook prose annex.
**Plans:** 1 plan
  - [ ] 13-01-PLAN.md — Author probe script, establish swarm-configs/ convention, append rollback procedure, CHECKPOINT for operator SSH session, on resume append Execution Annex + flip OPS-EXEC-01 to Verified  *(In Progress 2026-06-04: Tasks 1-3 committed bfb5f375 / 38ad28b9 / 080480d1; CHECKPOINT REACHED at Task 4. DISCREPANCY: probe-pre-fix.txt = 0/4 — fix already shipped out-of-band; checkpoint pivots to snapshot-capture-only operator session.)*
**Phase notes:**
  - **Single-session execution preferred** (per requirements scoping): pre-fix probe → nginx edit → `nginx -t` → `systemctl reload nginx` → post-fix probe → runbook annex → commit. All in one focused operator window.
  - **Adjacent to `deferred-to-edge-redesign` tag:** the runbook still carries the `deferred to edge-redesign` tag on the SEC-WS-01 origin; Phase 13's execution annex DOES NOT remove that tag — it CLOSES the OPS-EXEC-01 execution-debt while leaving the broader edge-redesign open (Traefik labels, nginx rewrites beyond G8 needs are out-of-scope per REQUIREMENTS.md "Out of Scope").
  - **Pre-fix probe is mandatory:** capture the bare `Server: nginx` 404 BEFORE applying the change. The pre/post pair is the runbook annex's evidence — without it, the annex is uncorroborated. Recipe in the runbook's "Verification" section + the operator's `curl -sI` probe template.
  - **`nginx -t` MUST pass before `systemctl reload nginx`:** any typo in the `location` block fails the syntax test. If `nginx -t` returns non-zero, ABORT — do NOT reload; revert the edit and re-attempt.
  - **No code change in this repo for the fix itself:** the source-code angle is covered by Phase 12's TEST-WS-01 in-process spec; Phase 13 is OPS execution + documentation persistence.
  - **Compatibility constraint:** the nginx `location` regex must be ordered AFTER `/api/` and `/static/` so the more-specific routes continue winning. No existing public route the Vue console inherited should regress; verify with a quick post-reload smoke against `/api/v2/users` (should still return Express's 404 with helmet CORS).

### Phase 14: SEC-PII-02 Production managed_logs Sweep Closure (OPS-EXEC-02)
**Goal:** Execute the staged `managed_logs` redaction sweep against production CouchDB per `.planning/runbooks/managed-logs-redaction.md` in a single focused session; cover the ~658k pre-Phase-2 docs; gate `--apply` behind the mandatory `--snapshot-to` JSONL forensic dump; verify zero raw reset_keys + zero raw emails with `--sample 1000`; complete CouchDB compaction; persist the execution annex.
**Depends on:** Phase 12 (OBS-01 Slack notification is wired into `scripts/redact-managed-logs.js` so the production `--apply` posts the closure receipt automatically)
**Requirements:** OPS-EXEC-02
**Success Criteria** (what must be TRUE):
  1. Pre-flight checklist (runbook § 1) is fully checked off: CouchDB service placement confirmed, `/mnt/gluster/thinx/.env` readable, `THINX_PREFIX` confirmed empty (DB is bare `managed_logs`), snapshot target path has ≥10 GB free margin, maintenance-window confirmed, `thinx_api` is on a v1.9+ image so forward-TTL `expire_at` writes are in effect.
  2. Dry-run scan (runbook § 2 Step 2) returns a `dirty` count in the expected range (not implausibly small ≈ 0, not implausibly large > 658k). The operator's stdout report is captured for the execution annex.
  3. `--apply --snapshot-to ${SNAPSHOT_PATH} --batch-size 500` completes; the JSONL forensic dump exists at the documented path with `chmod 600` permissions; the line count of the snapshot matches the script's reported `touched` count; the snapshot is referenced by absolute path in the runbook execution annex.
  4. `--sample 1000` zero-leak verification exits 0 on N=1000 random recent + N=1000 random old `managed_logs` docs (the script's `EXIT_LEAK_DETECTED=65` is NOT raised). The sampling-evidence table in the runbook (§ 6) gets a new row with the execution date, sample N, exit code, operator initials.
  5. CouchDB `_compact` on `managed_logs` completes; `disk_size` drops by the expected delta vs. pre-compaction; the runbook execution annex captures the pre/post `disk_size` figures.
  6. OBS-01 Slack closure receipt is posted automatically by the script on `--apply` success (delivered via the existing `SLACK_WEBHOOK` outage-notifier webhook); the message body contains docs scanned, docs redacted, sample-result verdict, runtime, environment host (host-only, no creds) — confirmed visible in the Slack channel.
  7. `.planning/runbooks/managed-logs-redaction.md` is updated with an execution annex: execution-timestamp, snapshot-path, sample-result, pre/post `disk_size` delta, Slack-receipt confirmation, operator initials. Annex is committed on `thinx-staging` with a GPG-signed commit.
**Plans:** TBD
**Phase notes:**
  - **Single-session execution preferred** (per requirements scoping): pre-flight checklist → dry-run → snapshot + apply → sample-verify → compaction → runbook annex → commit. All in one focused operator window.
  - **Snapshot is the ONLY forensic-rollback artifact** (per runbook § 5 reversibility acceptance): the script REFUSES to run `--apply` without `--snapshot-to`. The Phase 14 success criteria explicitly require the snapshot is created BEFORE `--apply` mutates anything.
  - **Idempotent retry path:** if `--sample 1000` exits 65 (leak detected), the runbook directs the operator to re-run `--apply` (script is idempotent; re-runs produce zero edits on already-redacted docs). Phase 14 success is gated on the SAMPLE exit 0, not on the first apply run.
  - **Compaction is I/O-heavy:** CouchDB `_compact` on 658k docs contends with the live audit-write path. Schedule during a low-traffic window per the runbook's "maintenance window" pre-flight check.
  - **OBS-01 dependency is "convenience, not gating":** if Phase 12 OBS-01 has not shipped at the time Phase 14 executes (operator advances OPS-EXEC-02 before Phase 12 closes), the manual Slack-paste workflow per the runbook stays valid. The success criteria above name "Slack closure receipt" via OBS-01 as the preferred path, but a manual Slack notification by the operator in the same channel meets criterion 6 if OBS-01 is not yet wired.
  - **Compatibility constraint:** the redaction touches `managed_logs` exclusively. No router signatures change; no public route the Vue console relies on is affected. The forward-TTL `expire_at` writes (Phase 9) are unaffected. Production image rollout is NOT triggered by this phase — Phase 14 is a CouchDB-only operation.

## Phase Summary

| Phase | Name | Goal | Requirements | Criteria |
|-------|------|------|--------------|----------|
| 12 | Code-side Closure Helpers | In-process WS CI spec + Slack receipt + audit-TTL DETECT probe | TEST-WS-01, OBS-01, OBS-02 | 5 |
| 13 | SEC-WS-01 Edge Handshake Closure (OPS-EXEC-01) | Swarm-host nginx fix + post-fix probe + runbook annex | OPS-EXEC-01 | 5 |
| 14 | SEC-PII-02 managed_logs Production Sweep Closure (OPS-EXEC-02) | Staged sweep (snapshot → apply → sample → compact) + runbook annex | OPS-EXEC-02 | 7 |

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-WS-01 | Phase 12 | Pending |
| OBS-01 | Phase 12 | Pending |
| OBS-02 | Phase 12 | Pending |
| OPS-EXEC-01 | Phase 13 | Pending |
| OPS-EXEC-02 | Phase 14 | Pending |

**Coverage:** 5/5 v1.10 requirements mapped ✓
**Orphans:** none
**Duplicates:** none

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. Code-side Closure Helpers | v1.10 | 0/? | Planned | — |
| 13. SEC-WS-01 Edge Handshake Closure | v1.10 | 0/1 (in progress — Tasks 1-3 committed; CHECKPOINT at Task 4) | In Progress | — |
| 14. SEC-PII-02 managed_logs Sweep Closure | v1.10 | 0/? | Planned | — |

## Dependencies (visual)

```
Phase 12 (code-side helpers: TEST-WS-01 + OBS-01 + OBS-02)
        │
        ├──► Phase 13 (OPS-EXEC-01 swarm-host nginx fix)
        │    └─ leans on TEST-WS-01 CI spec for regression coverage
        │
        └──► Phase 14 (OPS-EXEC-02 managed_logs production sweep)
             └─ leans on OBS-01 Slack receipt for automated closure notification

Phase 13 and Phase 14 are functionally independent of each other (different swarm-host
surfaces: nginx config vs. CouchDB DB). They can execute in either order, or in
parallel operator windows, after Phase 12 lands.
```

Phase 12 sequences BEFORE 13 and 14 so the CI smoke spec (TEST-WS-01) and the Slack receipt wiring (OBS-01) are available when the OPS executions run. Phases 13 and 14 are independent of each other and may execute in either order — they touch disjoint swarm-host surfaces (nginx vs. CouchDB).

## Cross-Project References

- **Console submodule (sibling GSD project):** `services/console/.planning/`
  - No coordination required for v1.10 — none of the 5 requirements cross the parent/submodule boundary. SEC-DEP-02 in the submodule continues to advance under its own GSD workspace.
- **AGENTS.md** (parent root) — ops/deploy reference + dependency lock rationale
  - `chai-http v4` lock: TEST-CHAI-01 stays deferred from v1.10 per AGENTS.md:82-92.
  - SSH details for swarm host (`root@188.166.23.244` micro, `root@188.166.203.163` core) used by Phases 13 + 14.
- **`.planning/runbooks/`** — canonical operational runbooks; v1.10 phases 13 + 14 APPEND execution annexes to existing runbooks (not new files):
  - `.planning/runbooks/websocket-handshake.md` — source-of-truth for OPS-EXEC-01 (Phase 13)
  - `.planning/runbooks/managed-logs-redaction.md` — source-of-truth for OPS-EXEC-02 (Phase 14)
  - `.planning/runbooks/swarm.md` — adjacent context (autoredeploy SLA + ssh recipe)

## Notes

- **Compatibility constraint:** Every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks. Every phase's verification must include this guardrail. Phase 12 helpers are additive (new spec + new module + script extension); Phase 13 is a swarm-host edit that MUST NOT regress `/api/*` routing; Phase 14 touches `managed_logs` exclusively (no router surface).
- **GPG-sign default:** All v1.10 commits are GPG-signed unless an explicit per-session unsigned authorization is granted. The 2026-05-26 single-session authorization did not carry forward.
- **Phase numbering:** v1.10 continues from v1.9's last phase (Phase 11). Integer phases 12–14 represent v1.10 work; any urgent insertions during execution use decimal phases (e.g., 12.1, 13.2).
- **Phase commits land on `thinx-staging`:** CircleCI Jasmine ZZ-* inside the Docker test image is the canonical green-gate (per v1.9 Test-env ACCEPT pattern). Local `npm test` MAY be skipped if CI is green-gate; runbook-execution phases (13 + 14) produce execution-annex documents as their verification artifacts in lieu of code-side specs.
- **Single-branch (no worktrees) for Phase 12** if multiple plans share a file. The 3 helpers touch disjoint files (`spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`, `scripts/redact-managed-logs.js` + new unit spec, `lib/thinx/audit-ttl-probe.js` + `thinx-core.js` 5-line call site + new unit spec) so parallel execution is safe; sequential single-branch is acceptable if the operator prefers a clean bisect history.
- **Deferred from v1.10 scope:** fs-finder removal sweep (v1.9 Phase 5 REFACTOR-05 carry-over; still v1.x candidate, sequenced after v1.10 closes the ops loop); fresh Dependabot triage (5 alerts surfaced during v1.9 push; deferred to v1.11 or quick-task incident response window); TEST-CHAI-01 / OPS-02 / OPS-03 / CONSOLE-LEGACY-JSON-PARSE (third milestone of deferral — v1.11 planning should make a deliberate keep/drop call).
- **Phase 12 sequencing rationale:** OBS-01 must ship BEFORE Phase 14 runs so the production sweep's Slack receipt lands automatically. TEST-WS-01 must ship BEFORE Phase 13 runs so the swarm-host fix has CI regression coverage from day one (rather than waiting for a future regression to be the trigger that surfaces the missing test). OBS-02 has no execution-phase dependency but ships in Phase 12 alongside the other two helpers because it is the same "small additive code helper" category — bundling them keeps the phase coherent.
- **Phase 13 single-session preference (per requirements scoping):** the operator explicitly chose "single-session execution" for OPS-EXEC-01. The pre-fix probe + nginx edit + post-fix probe + runbook annex are bundled into one operator window to keep the evidence trail tight; splitting across sessions would risk losing the "fresh Vue session" handshake context between captures.
- **Phase 14 single-session preference (per requirements scoping):** the operator explicitly chose "single-session execution" for OPS-EXEC-02. The pre-flight + dry-run + apply + sample + compaction are all run in one operator window for the same evidence-tightness reason. The runbook's "Staged rollout option" (`--max-docs 10000` then a follow-up unbounded run) remains available as a sub-step within the session if the operator wants a confidence pass before the full 658k sweep.
- **Phase 14 destructive nature:** OPS-EXEC-02 mutates ~658k CouchDB documents in production. The `--snapshot-to` mandatory gate is the ONLY forensic-rollback path. Phase success criteria explicitly require the snapshot lands BEFORE `--apply` runs and that the snapshot's permissions are `0600`.
- **Execution model:** OPS + opportunistic in-flight code adds — if production reveals an in-script issue (e.g., a CouchDB conflict retry pattern in `scripts/redact-managed-logs.js`), the fix lands inside this milestone rather than spawning a separate cycle.

---
*Roadmap created: 2026-06-04 — v1.10 Operational Closures milestone planning. 3 phases (12–14) covering 5 requirements. Granularity: coarse (let natural delivery boundaries stand; 3 phases cleanly separate code-side helpers from the two OPS executions without artificial compression or padding).*
*Phase 12 sequenced FIRST so OBS-01 (Slack receipt) is wired into `redact-managed-logs.js` before Phase 14's production sweep invokes it, and so TEST-WS-01 CI coverage exists before Phase 13's swarm-host edit lands. Phases 13 + 14 are independent of each other and may run in either order after Phase 12 closes.*
