# Phase 13: SEC-WS-01 Edge Handshake Closure (OPS-EXEC-01) - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator-executed SSH session that adds an nginx `location` block to the `rtm.thinx.cloud` server config on the swarm host (`188.166.23.244`), closing the SEC-WS-01 edge-routing gap that has caused all WebSocket upgrade requests to return 404 instead of 101. The actual `nginx -t` + `systemctl reload nginx` happens off-repo; what lands in this codebase is the prep artifacts, the captured pre-fix probe baseline, the persisted before+after nginx server-block snapshots, the runbook execution annex, a reusable probe script for future regressions, and an explicit rollback section in the runbook.

**In scope:**
- Single plan (13-01-PLAN.md) with the GSD CHECKPOINT mechanism — executor produces all prep artifacts then returns `## CHECKPOINT REACHED` requesting the operator run the SSH session, then resumes to write the post-fix annex.
- New `scripts/probe-rtm-handshake.sh` — reusable shell script that programmatically captures the 7-row reproduction table from `.planning/runbooks/websocket-handshake.md`, outputs plain text that pastes verbatim into the annex.
- Pre-fix probe baseline capture at `.planning/phases/13-*/probe-pre-fix.txt` (output of `scripts/probe-rtm-handshake.sh` against the still-broken rtm).
- Post-fix probe capture at `.planning/phases/13-*/probe-post-fix.txt` (same script, against the fixed rtm).
- New directory `.planning/runbooks/swarm-configs/` containing `rtm.thinx.cloud-server.pre.nginx` (full pre-fix server-block snapshot) and `rtm.thinx.cloud-server.post.nginx` (full post-fix server-block snapshot). Establishes a swarm-configs convention for v1.11+ OPS phases.
- Execution annex appended to `.planning/runbooks/websocket-handshake.md` — captures execution timestamp (UTC), operator initials, pre-fix probe output reference, post-fix probe output reference, the actual nginx `location` block applied (verbatim, even if it differs from the illustrative regex in the runbook), and any operator-side notes.
- New "SEC-WS-01 Rollback Procedure" section appended to `.planning/runbooks/websocket-handshake.md`, mirroring the existing SEC-COOKIE-01 rollback section's format. References the persisted `rtm.thinx.cloud-server.pre.nginx` snapshot as the restore source. < 5min SLA.
- Mark OPS-EXEC-01 as Verified in REQUIREMENTS.md traceability after the annex commit lands.

**Out of scope (deferred):**
- Any code changes to `thinx-device-api` itself — Phase 13 is operator-execution + documentation only. The Express upgrade handler at `thinx-core.js:466` is not touched (Phase 6 REFACTOR-03 already hardened it; Phase 12 TEST-WS-01 added CI regression coverage).
- Live in-process probe wrapper combining the 7-row table with the Phase 12 ZZ-spec — the in-process spec already runs in CI; the live-rtm probe is sufficient on its own for this phase. Wrapper deferred to a future phase if operator workflow benefits.
- Edge-layer redesign (Traefik labels, broader nginx restructuring) — out of v1.10 scope per ROADMAP.md "Out of Scope" table.
- OPS-EXEC-02 (Phase 14) — SEC-PII-02 production sweep. Functionally independent per v1.10 phase ordering; either Phase 13 or Phase 14 may run first.
- Auto-applied nginx config provisioning (Ansible, Terraform, etc.) — pure OPS scope; not v1.10.
- Migrating other operator runbooks to the swarm-configs/ convention retroactively — Phase 13 establishes the pattern; backfill is a v1.11+ candidate.

</domain>

<decisions>
## Implementation Decisions

### Plan Structure + Operator Coordination Model

- **D-01:** Single PLAN.md (`13-01-PLAN.md`) using the GSD CHECKPOINT mechanism. Executor produces all in-repo prep artifacts (probe script, pre-fix probe baseline, annex template, rollback section draft), returns `## CHECKPOINT REACHED` asking the operator to run the SSH session per the runbook procedure, then resumes (in a subsequent executor invocation) to capture the post-fix probe output and write the annex. Matches v1.9 Phase 3 OPS-01 rung-by-rung pattern (Rung 1 + checkpoint-gated Rungs 2-4) — same project that landed cleanly.
- **D-02:** Plan is atomic at the file level — one PLAN.md, one logical workflow, multiple commits across the checkpoint boundary. Executor's prep commits land BEFORE the checkpoint pause; operator's SSH session happens off-repo (no in-repo activity during the pause); post-checkpoint commits append the annex + post-fix probe capture + persist the post-fix snapshot.
- **D-03:** Resume contract: when the operator returns and re-runs the executor, the executor MUST detect (a) the `## CHECKPOINT REACHED` marker in the plan history (or the absence of `## PHASE COMPLETE`), (b) the presence of the operator-provided sentinel inputs (post-fix probe output, post-fix server-block snapshot — see D-09/D-10 for the exact files), and (c) the operator's annex-input fields (timestamp, initials, notes). If sentinel inputs are missing, executor MUST re-emit the CHECKPOINT with a clear missing-input message rather than fabricating.

### Config Snippet Persistence Form

- **D-04:** Establish a new directory `.planning/runbooks/swarm-configs/` for version-controlled swarm-host config trails. v1.11+ OPS phases (OPS-02 swarm memberlist, OPS-03 yml fixes) inherit this convention.
- **D-05:** Persist BOTH pre-fix and post-fix snapshots of the full `rtm.thinx.cloud` nginx server block (NOT just the new `location` block):
  - `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx` — captured BEFORE the operator's edit; provides the rollback source per D-13
  - `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx` — captured AFTER the operator's edit; provides the audit-trail target
- **D-06:** Snapshot extraction recipe: `nginx -T 2>&1 | awk '/server_name rtm.thinx.cloud/,/^}/' > <path>.nginx` on the swarm host. Operator runs this twice (pre + post) and uploads via the SSH session.
- **D-07:** Snapshots MUST be checked in as-is (no reformatting, no comment stripping). Future operators can `diff` them programmatically to see exactly what changed.
- **D-08:** README for the new directory at `.planning/runbooks/swarm-configs/README.md` documenting: the swarm-configs convention, snapshot capture recipe, naming pattern (`<hostname>-server.{pre,post}.nginx`), and pointer back to the parent runbook.

### Pre-fix Probe Scripted vs Manual

- **D-09:** New script `scripts/probe-rtm-handshake.sh` (or `.bash`) — reusable shell that captures the runbook's 7-row reproduction table programmatically:
  - Header banner (timestamp UTC, target host `rtm.thinx.cloud`, script version)
  - 7 `curl -sI` probes matching the runbook table verbatim (rows 1-7)
  - For each probe: print row label, the curl command, then the captured output (status line + selected headers: `Server:`, `Content-Security-Policy:`, `Access-Control-Allow-Origin:`, `HTTP/x.y`)
  - Footer summary: count of bare-nginx-404 rows (rows 4-7 pre-fix; expected to drop to 0 post-fix)
  - Plain-text output (no JSON unless trivially needed); designed for verbatim paste into the runbook annex
  - `set -euo pipefail` per Phase 11 BASE-IMG-01 hardening pattern; shellcheck-clean
- **D-10:** Operator runs the script twice and the outputs land in the phase dir:
  - Pre-fix: `./scripts/probe-rtm-handshake.sh > .planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-pre-fix.txt` (run before the SSH session as part of executor's prep)
  - Post-fix: `./scripts/probe-rtm-handshake.sh > .planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-post-fix.txt` (run after the SSH session as part of executor's resume)
- **D-11:** Script-vs-spec scoping: the Phase 12 in-process spec (`spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`) is the CI-time regression gate; this new live-rtm script is the OPS-time evidence gate. They cover different layers (in-process upgrade handler vs edge nginx routing). Do NOT couple them into a single wrapper for Phase 13. A combined wrapper is a deferred v1.11 candidate.
- **D-12:** Script requirements: no new npm/system deps beyond `curl` and core POSIX shell. Works from any internet-connected workstation (including the operator's laptop or a CI runner). Documented in a header comment.

### SEC-WS-01 Rollback Procedure

- **D-13:** Append a new "SEC-WS-01 Rollback Procedure" section to `.planning/runbooks/websocket-handshake.md`, mirroring the format of the existing SEC-COOKIE-01 rollback section (sections: When to roll back, Diagnosis check, Rollback recipe, Post-rollback verification, SLA). Place AFTER the SEC-COOKIE-01 section.
- **D-14:** Rollback uses the persisted `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx` snapshot as the restore source (this is why D-05 persists the pre-fix snapshot, not just the post-fix).
- **D-15:** SLA: < 5 minutes end-to-end (SSH → `cp pre.nginx /etc/nginx/...` → `nginx -t` → `systemctl reload nginx` → probe verification). Matches the SEC-COOKIE-01 < 5min SLA already in the runbook.
- **D-16:** Diagnosis check before rolling back: re-run `scripts/probe-rtm-handshake.sh` and confirm the failure mode matches the pre-fix 7-row table (bare nginx 404 on rows 4-7) — distinguishes "SEC-WS-01 caused this" from an unrelated regression.
- **D-17:** Rollback section explicitly documents the FAILURE MODES the rollback addresses:
  - `nginx -t` failed after edit (config already rejected, no reload happened) — restore is safety-cleanup, not recovery
  - Reload succeeded but new `location` block intercepts an unintended route (e.g., a future `/health` endpoint that shouldn't be proxied)
  - Vue console regresses on a flow that worked pre-fix (unlikely given additive change, but documented for completeness)
- **D-18:** Post-rollback verification: re-run `scripts/probe-rtm-handshake.sh` post-rollback, confirm the output matches the pre-fix 7-row table (we're explicitly RESTORING the broken state — that's the safety floor). Document the trade-off: WebSocket subscribe will be broken again, BUT the swarm host is in a known-good state.

### Cross-Cutting Decisions

- **D-19:** Annex format in `.planning/runbooks/websocket-handshake.md` (operator-fillable section between the existing "## Operator Action" and "## SEC-COOKIE-01 Rollback Procedure" sections):
  ```
  ## Execution Annex — SEC-WS-01 (OPS-EXEC-01)
  
  **Executed:** YYYY-MM-DDTHH:MM:SSZ
  **Operator:** [initials]
  **Pre-fix probe:** `.planning/phases/13-*/probe-pre-fix.txt`
  **Post-fix probe:** `.planning/phases/13-*/probe-post-fix.txt`
  **Pre-fix server block:** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx`
  **Post-fix server block:** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx`
  
  ### nginx location block actually applied
  
  ```nginx
  [the exact nginx block the operator added, even if it differs from the runbook's illustrative regex]
  ```
  
  ### Notes
  
  [operator-side observations — any quirks, neighbor-block interactions, deviations from the runbook's illustrative block]
  ```
- **D-20:** All commits GPG-signed (project default `commit.gpgsign=true` per Phase 12 verification).
- **D-21:** Single plan (D-01) means single wave (Wave 1) with single plan; `wave: 1`, `depends_on: []`. No parallelization concerns.
- **D-22:** Compatibility constraint (carries forward from Phase 12 D-43): no signature break on any public route the Vue console relied on. Phase 13's nginx edit ADDS a route (WebSocket upgrade path) that was previously 404'd — this is restoring functionality, not changing any existing route. The Vue console pre-fix state already treats the WS subscribe as broken; post-fix it works. Zero regression risk on other Vue console flows.
- **D-23:** Phase 13 success criteria (5, from ROADMAP.md, all locked):
  1. `wscat` from fresh Vue session returns `101 Switching Protocols`
  2. Vue console WebSocket subscribe + initial-state-fetch round-trip completes E2E
  3. `nginx -T | grep -A5 '^[[:space:]]*location ~ \^/'` on swarm host shows new block ordered correctly
  4. Runbook updated with execution annex (timestamp + initials + pre/post probe output + applied nginx block + operator notes)
  5. Swarm-host nginx config snippet (the FULL server block) persisted under `.planning/runbooks/swarm-configs/` — NOT just an annex note (D-05/D-07 makes this concrete)
- **D-24:** Test-env ACCEPT pattern (carries forward from Phase 12 D-41): CI canonical green-gate is Jasmine in the Docker test image. Phase 13 adds NO new specs (the spec layer is Phase 12 TEST-WS-01's job). Local gates per plan are static (`shellcheck scripts/probe-rtm-handshake.sh` exit 0; runbook + snapshot file existence checks).
- **D-25:** Plan checkpoint message MUST give the operator a complete actionable instruction set: (a) SSH command from AGENTS.md:18 (`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`), (b) pre-fix snapshot extraction command, (c) edit instructions referencing the runbook procedure, (d) post-fix snapshot extraction command, (e) post-fix probe instruction. No ambiguity; no required interpretation; reproducible by any operator with SSH access.

### Claude's Discretion

- **`scripts/probe-rtm-handshake.sh` exact output format** — text-only vs lightly structured (header/rows/footer) — planner decides during plan-phase. Recommendation: lightly structured, human-readable, no JSON.
- **Annex section vs separate annex file** — D-19 specifies append to the existing runbook; if planner prefers a separate file (e.g., `.planning/runbooks/sec-ws-01-execution-annex-2026-06-XX.md`), defer to planner. Recommendation: append to runbook for co-location.
- **CHECKPOINT prompt verbiage** — planner crafts the exact `## CHECKPOINT REACHED` message body during plan-phase; D-25 documents the required content. Recommendation: include a checklist the operator can tick through inline in their SSH session.
- **Probe script invocation interface** — bare `./scripts/probe-rtm-handshake.sh` vs `--baseline` / `--verify` flags — planner decides. Recommendation: keep simple (no flags); output is identical pre vs post, the difference is the captured state.
- **Plan task count** — 4-6 tasks expected (script, pre-fix probe capture, runbook prep, CHECKPOINT, post-fix capture + annex + persist + REQUIREMENTS update, SUMMARY). Planner partitions during plan-phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13 anchors
- `.planning/ROADMAP.md` — Phase 13 details (lines ~28 + Phase Details section; 5 success criteria)
- `.planning/REQUIREMENTS.md` — OPS-EXEC-01 (line 12); SEC-WS-01 (line 27 — the v1.9 source decision option (b) defer-to-edge)
- `.planning/PROJECT.md` — v1.10 milestone goal + Validated Requirements (v1.9 closures including SEC-WS-01 runbook authorship)
- `.planning/MILESTONES.md` — v1.9 accomplishments referenced by Phase 13 (Phase 6 SEC-WS-01 runbook authorship)

### Source-of-truth runbook (the operational procedure)
- `.planning/runbooks/websocket-handshake.md` — **PRIMARY OPERATIONAL DOC** (211 lines). Phase 13's annex appends to this file; rollback section appends to this file. Required reading for the executor.

### Phase 6 source decisions
- `.planning/milestones/v1.9-phases/06-websocket-surface-hardening/06-CONTEXT.md` — SEC-WS-01 decision block; 7-row reproduction table source
- `.planning/milestones/v1.9-phases/06-websocket-surface-hardening/06-03-PLAN.md` — the plan that produced the websocket-handshake runbook (precedent for runbook-only requirement closure)

### Phase 12 CI smoke probe (regression coverage Phase 13 leans on)
- `spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js` — in-process WS upgrade spec; provides CI-time regression coverage if the upgrade handler at `thinx-core.js:466` ever regresses. Phase 13 does NOT touch this file.
- `.planning/phases/12-code-side-closure-helpers/12-CONTEXT.md` — Phase 12 D-26..D-37 (TEST-WS-01 implementation decisions); D-41/D-43 cross-cutting carries
- `thinx-core.js:466` — WebSocket upgrade handler (regression target; the FRONT side of the SEC-WS-01 fix lives here, the BACK side is the swarm-host nginx edit Phase 13 performs)

### OPS-script precedents
- `base/update.sh` (Phase 11 BASE-IMG-01) — `set -euo pipefail` + shellcheck-clean hardening pattern; precedent for OPS shell scripts
- `scripts/redact-managed-logs.js` (Phase 9 SEC-PII-02) — precedent for OPS scripts in `scripts/`
- `.planning/runbooks/swarm.md` (Phase 3 OPS-01) — canonical swarm-host runbook format; Phase 13 follows similar structure
- `.planning/runbooks/managed-logs-redaction.md` (Phase 9) — sibling OPS runbook that Phase 14 will execute against

### Operator credentials + access
- `AGENTS.md:18` — SSH command verbatim (`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`)
- `AGENTS.md` § "Websocket Findings" (lines 44-55) — original SEC-WS-01 surfacing; console-side fix landed but server-side gap remained
- `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/thinx-ssl-cert-renewal-gap.md` — adjacent operator-memory pattern (other OPS gaps where operator action lives off-repo)

### v1.10 Phase 14 sibling
- `.planning/runbooks/managed-logs-redaction.md` — Phase 14's source runbook; Phase 14 follows the same OPS-execution + annex + rollback pattern Phase 13 establishes
- Phase 13 and Phase 14 are functionally independent — either may execute first

### Project locks / constraints
- `AGENTS.md` (parent) — ssh details, deploy flow, dependency locks
- Phase 12 D-43 — compatibility constraint carries forward (no signature break on legacy-console routes)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`base/update.sh` shell-script hardening pattern** (Phase 11): `set -euo pipefail`, full CLI, single-purpose, shellcheck-clean. Direct template for `scripts/probe-rtm-handshake.sh`.
- **Existing runbook structure in `.planning/runbooks/websocket-handshake.md`**: Symptom → Root Cause → Reproduction → Operator Action → Verification → Reference → SEC-COOKIE-01 Rollback (existing template Phase 13 mirrors for the new SEC-WS-01 rollback section).
- **AGENTS.md:18 SSH command**: copy-paste-ready credential string; reuse verbatim in the CHECKPOINT message.
- **GSD CHECKPOINT mechanism** (per gsd-executor agent contract): planner emits `## CHECKPOINT REACHED` with a human-readable instruction set; executor pauses; next executor invocation reads the saved state and resumes. v1.9 Phase 3 OPS-01 Rung 1 + checkpoint-gated Rungs 2-4 is the precedent (landed cleanly, zero deviations).

### Established Patterns

- **OPS-execution + runbook annex** (codified by v1.9 Phase 6 / 9): when the fix lives off-repo (swarm host or production DB), the codebase ships the runbook + the annex + any reusable tooling. Phase 13 inherits and extends with the swarm-configs/ convention (new).
- **DETECT-only OPS probes** (v1.9 Phase 11 cert-probe, Phase 12 OBS-02 audit-ttl-probe): operator-side probes that capture state without mutating. Phase 13's `scripts/probe-rtm-handshake.sh` follows the same posture (read-only `curl -sI`; no system mutation; safe to run repeatedly).
- **Atomic GPG-signed commits per plan task**: Phase 12 / Phase 11 / Phase 7 precedent. Phase 13 inherits.
- **CHECKPOINT-gated execution for OPS work** (v1.9 Phase 3 OPS-01 Rung 1 + checkpoints for Rungs 2-4): Phase 13 follows the same gate model with the SSH session as the checkpoint trigger.
- **Reuse existing runbook documents over fragmenting** — Phase 6 / Phase 9 / Phase 11 all kept their runbooks in `.planning/runbooks/<name>.md`. Phase 13 appends to the existing `websocket-handshake.md` rather than creating a new file.
- **Persisted operator artifacts under `.planning/runbooks/`** — established by Phase 9 GDPR posture note; Phase 13 extends with the swarm-configs/ subdirectory pattern.

### Integration Points

- **Phase 13 ↔ `.planning/runbooks/websocket-handshake.md`** — Phase 13 APPENDS two sections (execution annex + SEC-WS-01 rollback). Does NOT modify the existing Symptom / Root Cause / Reproduction / Operator Action / Verification / Reference / SEC-COOKIE-01 Rollback sections (preserve verbatim).
- **Phase 13 ↔ `.planning/runbooks/swarm-configs/` (new)** — NEW DIRECTORY. Phase 13 creates it + populates with `rtm.thinx.cloud-server.{pre,post}.nginx` + a README.
- **Phase 13 ↔ `scripts/probe-rtm-handshake.sh` (new)** — NEW FILE. No coupling to existing scripts.
- **Phase 13 ↔ `.planning/REQUIREMENTS.md`** — Phase 13 marks OPS-EXEC-01 as Verified in the traceability table at plan close.
- **Phase 13 ↔ swarm host (`188.166.23.244`)** — operator-executed SSH session; off-repo. Phase 13 does NOT automate this; the CHECKPOINT mechanism bridges the gap.

</code_context>

<specifics>
## Specific Ideas

- **User explicitly chose Option A (single plan with CHECKPOINT) for the coordination model** — matches the v1.9 Phase 3 OPS-01 pattern they've used successfully. Captured as D-01.
- **User explicitly chose Option A (full server-block snapshots before+after) for config persistence** — establishes the swarm-configs/ directory convention for v1.11+ OPS phases. Captured as D-04/D-05.
- **User explicitly chose Option A (`scripts/probe-rtm-handshake.sh`) over inline curl or in-process wrapper** — reusable for future SEC-WS regressions, captures the 7-row table programmatically, no test-image coupling. Captured as D-09/D-11.
- **User explicitly chose Option A (explicit SEC-WS-01 rollback section in the runbook)** — mirrors the existing SEC-COOKIE-01 rollback section format, uses the pre-fix snapshot as restore source. Captured as D-13/D-14/D-15.

</specifics>

<deferred>
## Deferred Ideas

- **Combined live-rtm + in-process spec wrapper** (deferred from Area 3 Option C): A script that runs both `scripts/probe-rtm-handshake.sh` AND the Phase 12 `ZZ-WebSocketHandshakeRtmSpec.js` in one command. Useful for combined evidence in future incident response. Couples to test-image setup — deferred to v1.11 (or skipped entirely if both layers are independently sufficient).
- **Auto-applied nginx config provisioning** (Ansible, Terraform, etc.): Move the swarm-host nginx config to a version-controlled provisioning tool that runs the edits automatically. Pure OPS scope, out of v1.10. v2+ candidate.
- **Migrate existing OPS runbooks to swarm-configs/ convention retroactively**: Phase 13 establishes the swarm-configs/ pattern. Phase 11 BASE-IMG-01 + Phase 9 SEC-PII-02 + Phase 3 OPS-01 runbooks COULD be backfilled with their swarm-host config snapshots if available. Sequenced after v1.10 closes.
- **CHECKPOINT prompt automation** (e.g., a Slack-bot integration that posts the checklist + pings the operator): noise vs. signal. Deferred. v2+ candidate.
- **Annex format as structured frontmatter (YAML)** rather than markdown sections: would enable programmatic post-mortem analysis. Deferred — the current markdown annex format is human-readable and matches the runbook's existing voice.
- **Multi-host swarm-configs/ for the broader edge layer** (Traefik, other nginx hosts, mosquitto): out of v1.10 scope. v1.11+ candidate when OPS-02 / OPS-03 surface adjacent edge concerns.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 13 scope (no `.planning/todos/` directory exists in this project).

</deferred>

---

*Phase: 13-sec-ws-01-edge-handshake-closure-ops-exec-01*
*Context gathered: 2026-06-04*
